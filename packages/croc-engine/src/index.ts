/**
 * Public API for croc-engine
 * A wrapper around the croc CLI for secure file transfer
 */

export { SendTransfer, ReceiveTransfer } from "./transfer";
export { findCrocExecutable, verifyCrocVersion } from "./finder";
export type {
  TransferResult,
  TransferError,
  TransferProgress,
  TransferOperationBase,
  SendOperation,
  ReceiveOperation,
  SendOptions,
  ReceiveOptions,
} from "./types";
export { TransferErrorType } from "./types";

/**
 * Send files using croc
 *
 * @param options Send options (payloadDir, code, relay, pass, timeoutMs)
 * @returns SendOperation with event emitter interface
 *
 * @example
 * ```typescript
 * import { send } from "@croc-classroom/croc-engine";
 *
 * const transfer = send({
 *   payloadDir: "/path/to/files",
 *   code: "my-code-phrase",
 *   relay: "relay.example.com:9009",
 *   pass: "relay-password",
 *   timeoutMs: 60000,
 * });
 *
 * transfer.on("progress", (progress) => {
 *   console.log(`${progress.percentage}% - ${progress.bytesPerSecond} B/s`);
 * });
 *
 * transfer.on("done", (result) => {
 *   console.log(`Sent ${result.filesTransferred} files`);
 * });
 *
 * transfer.on("error", (error) => {
 *   console.error(`Error: ${error.type}`);
 * });
 *
 * // Can cancel anytime
 * await transfer.cancel();
 * ```
 */
export function send(options: import("./types").SendOptions) {
  const transfer = new SendTransfer();
  transfer.execute(options).catch(() => {
    // Error is emitted via the 'error' event
  });
  return transfer;
}

/**
 * Receive files using croc
 *
 * @param options Receive options (code, outDir, relay, pass, timeoutMs)
 * @returns ReceiveOperation with event emitter interface
 *
 * @example
 * ```typescript
 * import { receive } from "@croc-classroom/croc-engine";
 *
 * const transfer = receive({
 *   code: "my-code-phrase",
 *   outDir: "/path/to/output",
 *   relay: "relay.example.com:9009",
 *   pass: "relay-password",
 *   timeoutMs: 120000,
 * });
 *
 * transfer.on("progress", (progress) => {
 *   console.log(`${progress.percentage}% done`);
 * });
 *
 * transfer.on("done", (result) => {
 *   console.log(`Received ${result.filesTransferred} files`);
 * });
 *
 * transfer.on("error", (error) => {
 *   console.error(`Error: ${error.type} - ${error.message}`);
 * });
 * ```
 */
export function receive(options: import("./types").ReceiveOptions) {
  const transfer = new ReceiveTransfer();
  transfer.execute(options).catch(() => {
    // Error is emitted via the 'error' event
  });
  return transfer;
}
