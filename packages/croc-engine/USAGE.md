# croc-engine Usage Guide

## Installation

First, download croc binaries:

```bash
npm run download-croc
```

This will download croc 10.7.0 for all supported platforms:
- Windows x64
- macOS x64
- macOS arm64
- Linux x64

## Basic API

### Sending files

```typescript
import { send } from "@croc-classroom/croc-engine";

const transfer = send({
  payloadDir: "/path/to/files",
  code: "my-code-phrase",
  relay: "relay.example.com:9009",
  pass: "relay-password",
  timeoutMs: 60000,
});

transfer.on("progress", (progress) => {
  console.log(`${progress.percentage}% done - ${progress.bytesPerSecond} B/s`);
});

transfer.on("done", (result) => {
  console.log(`Successfully sent ${result.filesTransferred} files`);
});

transfer.on("error", (error) => {
  console.error(`Error (${error.type}): ${error.message}`);
  console.error("stdout:", error.stdout);
  console.error("stderr:", error.stderr);
});

// Can cancel at any time
setTimeout(() => transfer.cancel(), 30000);
```

### Receiving files

```typescript
import { receive } from "@croc-classroom/croc-engine";

const transfer = receive({
  code: "my-code-phrase",
  outDir: "/path/to/output",
  relay: "relay.example.com:9009",
  pass: "relay-password",
  timeoutMs: 120000,
});

transfer.on("progress", (progress) => {
  if (progress.percentage) {
    console.log(`${progress.percentage}% complete`);
  }
});

transfer.on("done", (result) => {
  console.log(`Files received in ${result.elapsedMs}ms`);
});

transfer.on("error", (error) => {
  console.error(`Transfer failed: ${error.type}`);
});
```

## Error Handling

The engine provides detailed error types:

```typescript
import { TransferErrorType } from "@croc-classroom/croc-engine";

transfer.on("error", (error) => {
  switch (error.type) {
    case TransferErrorType.TIMEOUT:
      console.error("Transfer timed out");
      break;
    case TransferErrorType.RELAY_AUTH_FAILED:
      console.error("Wrong relay password");
      break;
    case TransferErrorType.RELAY_CONNECT_FAILED:
      console.error("Cannot connect to relay");
      break;
    case TransferErrorType.CANCELLED:
      console.error("Transfer was cancelled");
      break;
    case TransferErrorType.PATH_ESCAPE:
      console.error("Security violation: file escaped output directory");
      break;
    default:
      console.error(`Unknown error: ${error.message}`);
  }
});
```

## Timeout Behavior

Timeouts are enforced for safety:

- **Sending**: Timeout occurs if the receiver doesn't connect or complete within the specified time
- **Receiving**: Timeout occurs if the sender doesn't complete within the specified time
- **Second receiver on same code**: Will always timeout (croc limitation) - use the error type to identify this

Recommended timeout values:
- Quick local transfer (LAN): 60 seconds
- VPS transfer: 120-300 seconds (depending on file size)
- Slow network: Calculate as `max(120, fileSize / slowestSpeed)`

## Environment Variables

The engine automatically sets `CROC_SECRET` when providing a code, to avoid exposing the code in the process list.

If you need to set additional environment variables, they should be passed in the future (not currently exposed in the API).

## Security

1. **Path safety**: After receive, files are verified to ensure none escaped the output directory
2. **Process cleanup**: All child processes are properly cleaned up on timeout/cancel/completion
3. **Code privacy**: Code phrase is passed via environment variable when possible (for croc >= 10.7.0)

## Windows-specific Notes

- Croc executable must be named `croc.exe`
- Process tree killing uses `taskkill` internally (via tree-kill package)
- UNC paths are supported

## macOS Notes

- Both x64 and arm64 architectures are supported
- Code signing of the croc binary is not performed by this package

## Linux Notes

- x64 (amd64) architecture is supported
- Ensure the binary has execute permissions (automatically set by download script)

## Testing with Local Relay

To test locally, you can run croc relay:

```bash
croc --pass testpass relay --ports 9009,9010,9011,9012,9013
```

Then use it in your tests:

```typescript
const transfer = receive({
  code: "test-code",
  outDir: "./test-output",
  relay: "localhost:9009",
  pass: "testpass",
  timeoutMs: 10000,
});
```

## Development

Run tests:
```bash
npm test
```

Build:
```bash
npm run build
```

Watch mode:
```bash
npm run dev
```
