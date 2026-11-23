/**
 * Type definitions for croc-engine
 */

/**
 * Result of a file transfer operation (send or receive)
 */
export interface TransferResult {
  success: boolean;
  code: string;
  bytesTransferred: number;
  filesTransferred: number;
  elapsedMs: number;
}

/**
 * Error types that can occur during transfer
 */
export enum TransferErrorType {
  /** Timeout occurred (receiver didn't complete in time, or second receiver used same code) */
  TIMEOUT = "TIMEOUT",
  /** Wrong relay password or cannot authenticate */
  RELAY_AUTH_FAILED = "RELAY_AUTH_FAILED",
  /** Cannot connect to relay */
  RELAY_CONNECT_FAILED = "RELAY_CONNECT_FAILED",
  /** Transfer was cancelled by caller */
  CANCELLED = "CANCELLED",
  /** croc process exited with non-zero code */
  PROCESS_EXIT = "PROCESS_EXIT",
  /** File path security violation (e.g., escaping output directory) */
  SECURITY_VIOLATION = "SECURITY_VIOLATION",
  /** Received files are outside intended output directory */
  PATH_ESCAPE = "PATH_ESCAPE",
  /** Unknown error */
  UNKNOWN = "UNKNOWN",
}

/**
 * Transfer error with detailed information
 */
export interface TransferError extends Error {
  type: TransferErrorType;
  code?: string;
  stdout?: string;
  stderr?: string;
}

/**
 * Progress information from an ongoing transfer
 */
export interface TransferProgress {
  /** Bytes transferred so far */
  bytes: number;
  /** Total bytes to transfer (may be unknown until transfer starts) */
  totalBytes?: number;
  /** Number of files transferred so far */
  files: number;
  /** Total files to transfer (may be unknown) */
  totalFiles?: number;
  /** Transfer speed in bytes per second */
  bytesPerSecond: number;
  /** Percentage complete (0-100), if totalBytes is known */
  percentage?: number;
  /** Raw progress string from croc */
  raw: string;
}

/**
 * EventEmitter-like object returned by send/receive operations
 */
export interface TransferOperationBase {
  /**
   * Register a callback for progress updates
   */
  on(event: "progress", listener: (progress: TransferProgress) => void): this;

  /**
   * Register a callback for successful completion
   */
  on(event: "done", listener: (result: TransferResult) => void): this;

  /**
   * Register a callback for errors
   */
  on(event: "error", listener: (error: TransferError) => void): this;

  /**
   * Register a callback for any event
   */
  on(event: string, listener: (...args: unknown[]) => void): this;

  /**
   * Register a one-time listener
   */
  once(event: string, listener: (...args: unknown[]) => void): this;

  /**
   * Remove a listener
   */
  off(event: string, listener: (...args: unknown[]) => void): this;

  /**
   * Remove all listeners
   */
  removeAllListeners(event?: string): this;

  /**
   * Cancel the ongoing transfer immediately
   * Will terminate the croc process and any child processes
   */
  cancel(): Promise<void>;

  /**
   * Check if the transfer is still running
   */
  isActive(): boolean;
}

/**
 * Options for sending files
 */
export interface SendOptions {
  /** Directory containing files to send */
  payloadDir: string;
  /** croc code phrase to use (or will use code from code parameter if provided) */
  code: string;
  /** Relay server address (host:port) */
  relay: string;
  /** Relay password */
  pass: string;
  /** Timeout in milliseconds */
  timeoutMs: number;
}

/**
 * Options for receiving files
 */
export interface ReceiveOptions {
  /** croc code to use */
  code: string;
  /** Output directory where files will be received */
  outDir: string;
  /** Relay server address (host:port) */
  relay: string;
  /** Relay password */
  pass: string;
  /** Timeout in milliseconds */
  timeoutMs: number;
}

/**
 * Result of send operation
 */
export interface SendOperation extends TransferOperationBase {
  kind: "send";
}

/**
 * Result of receive operation
 */
export interface ReceiveOperation extends TransferOperationBase {
  kind: "receive";
}

/**
 * Information about where to find the croc executable
 */
export interface CrocExecutableInfo {
  /** Absolute path to croc executable */
  path: string;
  /** Environment where it was found (dev, packaged, container) */
  environment: "dev" | "packaged" | "container";
}

/**
 * Platform type
 */
export type Platform = "win32" | "darwin" | "linux";

/**
 * Architecture type
 */
export type Architecture = "x64" | "arm64" | "ia32";
