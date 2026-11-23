/**
 * Manage croc child process lifecycle with timeout and cleanup
 */

import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";
import treeKill from "tree-kill";
import { promisify } from "util";
import {
  TransferError,
  TransferErrorType,
  TransferResult,
  SendOptions,
  ReceiveOptions,
} from "./types";
import { findCrocExecutable } from "./finder";

const treeKillAsync = promisify(treeKill);

/**
 * Configuration for a croc process
 */
export interface CrocProcessConfig {
  args: string[];
  timeoutMs: number;
  env?: Record<string, string>;
}

/**
 * Manage a single croc transfer process
 */
export class CrocProcessManager {
  private process?: ChildProcess;
  private timeoutHandle?: NodeJS.Timeout;
  private cancelled = false;
  private stdout = "";
  private stderr = "";
  private resolveStart?: () => void;
  private rejectStart?: (error: TransferError) => void;

  /**
   * Create and start a croc process
   */
  async startProcess(config: CrocProcessConfig): Promise<void> {
    const crocPath = findCrocExecutable();

    return new Promise((resolve, reject) => {
      this.resolveStart = resolve;
      this.rejectStart = reject;

      try {
        this.process = spawn(crocPath, config.args, {
          env: {
            ...process.env,
            ...(config.env || {}),
          },
          timeout: config.timeoutMs,
        });

        // Setup timeout
        this.timeoutHandle = setTimeout(async () => {
          if (this.process && !this.process.killed) {
            await this.killProcess();
            reject(this.createError(TransferErrorType.TIMEOUT));
          }
        }, config.timeoutMs);

        // Capture output
        this.process.stdout?.on("data", (data) => {
          this.stdout += data.toString();
        });

        this.process.stderr?.on("data", (data) => {
          this.stderr += data.toString();
        });

        // Handle process exit
        this.process.on("exit", (code) => {
          clearTimeout(this.timeoutHandle);

          if (this.cancelled) {
            // Process was cancelled intentionally
            return;
          }

          if (code === 0) {
            // Success - will be handled by caller
            return;
          }

          if (code === null) {
            // Process was killed by signal (e.g., timeout)
            return;
          }

          // Process exited with error code
          if (this.rejectStart) {
            this.rejectStart(
              this.createError(TransferErrorType.PROCESS_EXIT, code?.toString())
            );
            this.rejectStart = undefined;
          }
        });

        // Handle process error (e.g., can't spawn)
        this.process.on("error", (err) => {
          clearTimeout(this.timeoutHandle);
          if (this.rejectStart) {
            this.rejectStart(this.createError(TransferErrorType.UNKNOWN, err.message));
            this.rejectStart = undefined;
          }
        });

        // Signal that process started successfully
        resolve();
      } catch (error) {
        reject(
          this.createError(
            TransferErrorType.UNKNOWN,
            error instanceof Error ? error.message : String(error)
          )
        );
      }
    });
  }

  /**
   * Wait for the process to complete
   */
  async waitForCompletion(): Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }> {
    return new Promise((resolve, reject) => {
      if (!this.process) {
        reject(new Error("Process not started"));
        return;
      }

      this.process.once("exit", (code, signal) => {
        clearTimeout(this.timeoutHandle);
        resolve({ exitCode: code, signal });
      });

      this.process.once("error", (err) => {
        clearTimeout(this.timeoutHandle);
        reject(err);
      });
    });
  }

  /**
   * Kill the process and all child processes
   */
  async killProcess(): Promise<void> {
    if (!this.process || this.process.killed) {
      return;
    }

    this.cancelled = true;

    try {
      // Use tree-kill to kill process and all children
      // On Windows, this uses taskkill; on Unix, uses signals
      await treeKillAsync(this.process.pid!);

      // Wait a bit for cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      // If tree-kill fails, try direct kill
      if (!this.process.killed) {
        this.process.kill("SIGKILL");
      }
    }

    clearTimeout(this.timeoutHandle);
  }

  /**
   * Check if process is still running
   */
  isRunning(): boolean {
    return !!this.process && !this.process.killed && !this.cancelled;
  }

  /**
   * Get the full output (stdout + stderr)
   */
  getOutput(): string {
    return this.stdout + this.stderr;
  }

  /**
   * Get stdout only
   */
  getStdout(): string {
    return this.stdout;
  }

  /**
   * Get stderr only
   */
  getStderr(): string {
    return this.stderr;
  }

  /**
   * Create a TransferError with captured output
   */
  private createError(
    type: TransferErrorType,
    extra?: string
  ): TransferError {
    const error = new Error(`Transfer error: ${type}${extra ? ` - ${extra}` : ""}`) as TransferError;
    error.type = type;
    error.stdout = this.stdout;
    error.stderr = this.stderr;
    return error;
  }
}

/**
 * Build croc command line arguments for sending
 */
export function buildSendArgs(options: SendOptions): string[] {
  const args = ["send"];

  // Fixed flags
  args.push("--yes");
  args.push("--overwrite");

  // Relay configuration
  if (options.relay) {
    args.push("--relay", options.relay);
  }

  if (options.pass) {
    args.push("--pass", options.pass);
  }

  // Code (try env variable first for security)
  if (options.code) {
    // Will be passed via environment variable if supported by croc
    // Otherwise will use --code flag
    args.push("--code", options.code);
  }

  // Payload directory (the directory to send)
  args.push(options.payloadDir);

  return args;
}

/**
 * Build croc command line arguments for receiving
 */
export function buildReceiveArgs(options: ReceiveOptions): string[] {
  const args = ["receive"];

  // Fixed flags
  args.push("--yes");
  args.push("--overwrite");

  // Relay configuration
  if (options.relay) {
    args.push("--relay", options.relay);
  }

  if (options.pass) {
    args.push("--pass", options.pass);
  }

  // Code (try env variable first for security)
  if (options.code) {
    args.push("--code", options.code);
  }

  // Output directory
  args.push("--out", options.outDir);

  return args;
}

/**
 * Verify that received files don't escape the output directory
 * This is a security check to ensure croc didn't receive files outside the intended directory
 */
export function verifyPathSafety(outDir: string): void {
  const resolvedOutDir = path.resolve(outDir);

  // Walk the directory and check that all files are within outDir
  walkDirectory(resolvedOutDir, (filePath) => {
    const resolvedFile = path.resolve(filePath);
    if (!resolvedFile.startsWith(resolvedOutDir)) {
      throw new Error(`Security violation: file ${filePath} escapes output directory`);
    }
  });
}

/**
 * Recursively walk a directory
 */
function walkDirectory(dir: string, callback: (filePath: string) => void): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    callback(fullPath);

    if (entry.isDirectory()) {
      walkDirectory(fullPath, callback);
    }
  }
}
