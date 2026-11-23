/**
 * Core transfer implementation with event emitter
 */

import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import {
  TransferError,
  TransferErrorType,
  TransferProgress,
  TransferResult,
  SendOptions,
  ReceiveOptions,
  SendOperation,
  ReceiveOperation,
} from "./types";
import { CrocProcessManager, buildSendArgs, buildReceiveArgs, verifyPathSafety } from "./process-manager";
import { parseProgress, extractErrorMessage } from "./progress-parser";

/**
 * Base class for transfer operations
 */
abstract class BaseTransferOperation extends EventEmitter implements SendOperation | ReceiveOperation {
  abstract readonly kind: "send" | "receive";
  protected processManager: CrocProcessManager;
  protected isActive = true;
  private lastProgress: TransferProgress | null = null;

  constructor() {
    super();
    this.processManager = new CrocProcessManager();
  }

  /**
   * Check if transfer is still active
   */
  isActive(): boolean {
    return this.isActive && this.processManager.isRunning();
  }

  /**
   * Cancel the transfer
   */
  async cancel(): Promise<void> {
    this.isActive = false;
    await this.processManager.killProcess();
    this.emit("error", this.createError(TransferErrorType.CANCELLED));
  }

  /**
   * Create a transfer error
   */
  protected createError(type: TransferErrorType, extra?: string): TransferError {
    const error = new Error(
      `Transfer error: ${type}${extra ? ` - ${extra}` : ""}`
    ) as TransferError;
    error.type = type;
    error.stdout = this.processManager.getStdout();
    error.stderr = this.processManager.getStderr();
    return error;
  }

  /**
   * Emit progress
   */
  protected emitProgress(progress: TransferProgress): void {
    this.lastProgress = progress;
    this.emit("progress", progress);
  }

  /**
   * Emit done
   */
  protected emitDone(result: TransferResult): void {
    this.isActive = false;
    this.emit("done", result);
  }

  /**
   * Emit error
   */
  protected emitError(error: TransferError): void {
    this.isActive = false;
    this.emit("error", error);
  }
}

/**
 * Send operation
 */
export class SendTransfer extends BaseTransferOperation implements SendOperation {
  readonly kind = "send";

  /**
   * Start a send operation
   */
  async execute(options: SendOptions): Promise<void> {
    // Validate payload directory exists
    if (!fs.existsSync(options.payloadDir)) {
      throw this.createError(
        TransferErrorType.UNKNOWN,
        `Payload directory not found: ${options.payloadDir}`
      );
    }

    const args = buildSendArgs(options);

    // Start the process
    try {
      await this.processManager.startProcess({
        args,
        timeoutMs: options.timeoutMs,
        env: options.code ? { CROC_SECRET: options.code } : undefined,
      });
    } catch (error) {
      this.emitError(error as TransferError);
      return;
    }

    // Monitor the process
    this.monitorProcess(options.code);
  }

  /**
   * Monitor the process and emit progress/completion events
   */
  private async monitorProcess(code: string): Promise<void> {
    try {
      const { exitCode } = await this.processManager.waitForCompletion();

      if (!this.isActive) {
        return; // Was cancelled
      }

      if (exitCode === 0) {
        // Success
        const result: TransferResult = {
          success: true,
          code,
          bytesTransferred: 0,
          filesTransferred: 1,
          elapsedMs: 0,
        };
        this.emitDone(result);
      } else {
        // Failure
        const errorMsg = extractErrorMessage(this.processManager.getOutput());
        this.emitError(this.createError(TransferErrorType.PROCESS_EXIT, errorMsg || undefined));
      }
    } catch (error) {
      if (this.isActive) {
        this.emitError(error as TransferError);
      }
    }
  }
}

/**
 * Receive operation
 */
export class ReceiveTransfer extends BaseTransferOperation implements ReceiveOperation {
  readonly kind = "receive";

  /**
   * Start a receive operation
   */
  async execute(options: ReceiveOptions): Promise<void> {
    // Create output directory if needed
    try {
      fs.mkdirSync(options.outDir, { recursive: true });
    } catch (error) {
      this.emitError(
        this.createError(
          TransferErrorType.UNKNOWN,
          `Cannot create output directory: ${options.outDir}`
        )
      );
      return;
    }

    const args = buildReceiveArgs(options);

    // Start the process
    try {
      await this.processManager.startProcess({
        args,
        timeoutMs: options.timeoutMs,
        env: options.code ? { CROC_SECRET: options.code } : undefined,
      });
    } catch (error) {
      this.emitError(error as TransferError);
      return;
    }

    // Monitor the process
    this.monitorProcess(options.code, options.outDir);
  }

  /**
   * Monitor the process and emit progress/completion events
   */
  private async monitorProcess(code: string, outDir: string): Promise<void> {
    try {
      const { exitCode } = await this.processManager.waitForCompletion();

      if (!this.isActive) {
        return; // Was cancelled
      }

      if (exitCode === 0) {
        // Verify path safety before declaring success
        try {
          verifyPathSafety(outDir);
        } catch (error) {
          this.emitError(
            this.createError(
              TransferErrorType.PATH_ESCAPE,
              error instanceof Error ? error.message : undefined
            )
          );
          return;
        }

        // Success
        const result: TransferResult = {
          success: true,
          code,
          bytesTransferred: 0,
          filesTransferred: 1,
          elapsedMs: 0,
        };
        this.emitDone(result);
      } else {
        // Failure
        const errorMsg = extractErrorMessage(this.processManager.getOutput());
        this.emitError(this.createError(TransferErrorType.PROCESS_EXIT, errorMsg || undefined));
      }
    } catch (error) {
      if (this.isActive) {
        this.emitError(error as TransferError);
      }
    }
  }
}
