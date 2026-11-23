# croc-engine Architecture

## Overview

croc-engine is a TypeScript wrapper around the croc CLI that:
1. Manages the croc process lifecycle
2. Handles timeouts and cleanup robustly
3. Parses progress information
4. Provides a type-safe, event-driven API

## Modules

### `finder.ts`
Locates the croc executable in development, packaged app, or container environments.

**Key functions:**
- `findCrocExecutable()` - Searches standard locations
- `getPlatform()` / `getArch()` - Platform detection
- `verifyCrocVersion()` - Verify croc is available

**Search order:**
1. `node_modules/.bin/croc`
2. `packages/croc-engine/bin/croc` (after download)
3. Electron resources path (if running in app)
4. System PATH
5. `/usr/local/bin/croc`

### `types.ts`
Type definitions for the public API.

**Key types:**
- `SendOperation` / `ReceiveOperation` - EventEmitter-based transfer objects
- `TransferProgress` - Progress information
- `TransferError` / `TransferErrorType` - Error types
- `SendOptions` / `ReceiveOptions` - Configuration

### `process-manager.ts`
Manages the croc child process lifecycle.

**Key functions:**
- `startProcess()` - Spawn croc with timeout
- `waitForCompletion()` - Wait for process to finish
- `killProcess()` - Terminate with proper cleanup
- `buildSendArgs()` / `buildReceiveArgs()` - Build CLI arguments

**Features:**
- Timeout enforcement with automatic cleanup
- Safe process tree killing (Windows and Unix)
- Output capture (stdout/stderr)
- Environment variable support (for code privacy)

### `progress-parser.ts`
Parse croc's text output to extract progress information.

**Key functions:**
- `parseProgressLine()` - Parse a single progress line
- `parseProgress()` - Find latest progress in output
- `detectSuccess()` - Detect successful completion
- `extractErrorMessage()` - Extract error from output
- `parseDataSize()` - Convert "1.5 MB" → bytes

### `transfer.ts`
Core transfer implementation using EventEmitter pattern.

**Classes:**
- `BaseTransferOperation` - Abstract base with common logic
- `SendTransfer` - Send implementation
- `ReceiveTransfer` - Receive implementation

**Flow:**
1. User calls `send()` or `receive()` → creates Transfer object
2. Transfer spawns croc process via ProcessManager
3. ProcessManager enforces timeout and captures output
4. Transfer monitors process completion and emits events
5. On receive, path safety is verified
6. User can cancel at any time

### `index.ts`
Public API exports and convenience functions.

**Exports:**
- `send()` - Send files
- `receive()` - Receive files
- Error types and type definitions

## Error Handling Strategy

| Error Type | Cause | Recovery |
|---|---|---|
| TIMEOUT | Croc didn't complete in time | User should retry with longer timeout |
| RELAY_AUTH_FAILED | Wrong password or relay issue | Check relay config |
| RELAY_CONNECT_FAILED | Cannot connect to relay | Check network, relay address |
| CANCELLED | User called `.cancel()` | User action, no recovery needed |
| PROCESS_EXIT | Croc exited with error code | Check output, may be code conflict |
| PATH_ESCAPE | Received file outside outDir | Security issue, don't proceed |
| UNKNOWN | Unexpected error | Check stderr, debug |

## Timeout Behavior

Timeouts are critical because croc has a known limitation:
- If two receivers use the same code, the second one **hangs indefinitely** without error
- Our timeout ensures we always return control to the caller

**Implementation:**
```typescript
const timeoutHandle = setTimeout(() => {
  killProcess(); // Kills croc and all children
  emit("error", { type: TIMEOUT });
}, options.timeoutMs);

process.on("exit", () => clearTimeout(timeoutHandle));
```

## Process Cleanup

Proper cleanup is essential, especially on Windows where abandoned processes can lock files.

**Strategy:**
1. Use `tree-kill` package to kill process tree
2. On Windows: Uses `taskkill /pid` internally
3. On Unix: Uses signals and process group killing
4. Fallback to `SIGKILL` if signals don't work
5. Wait 100ms for OS to clean up

```typescript
await treeKillAsync(pid);
setTimeout(resolve, 100);
```

## Path Safety

After receiving files, we verify they're within the output directory:

```typescript
verifyPathSafety(outDir); // Throws if any file escaped
```

This prevents:
- `../../../` path traversal
- Absolute paths
- Symlinks to outside directories

## Code Privacy

The code phrase is sensitive and shouldn't appear in process listings.

**Implementation:**
1. Try to pass code via `CROC_SECRET` environment variable
2. If croc doesn't support it, use `--code` flag
3. All logs are sanitized (never log code or passwords)

## Testing Strategy

### Unit Tests
- Progress parsing
- Platform detection
- Data size conversion

### Integration Tests (manual)
- With local croc relay
- Send and receive operations
- Timeout behavior
- Process cleanup verification
- Path safety checks

### E2E Tests
- Multi-machine relay scenarios (in `tests/e2e/`)

## Future Improvements

1. **Stream API**: Instead of capturing all output, stream to allow realtime monitoring
2. **Sidecar process**: Use Go sidecar with croc library instead of CLI
3. **Custom protocol**: Implement croc protocol directly in Node.js
4. **Progress file**: Write progress to a file for external monitoring
5. **Resource limits**: Enforce disk space and memory limits

## Dependencies

- `tree-kill` - Cross-platform process tree termination
- Node.js built-ins: `child_process`, `fs`, `path`, `events`

That's it! Minimal dependencies for maximum reliability.
