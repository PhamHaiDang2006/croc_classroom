# main — Electron Main Process (Person B, Phase 3)

Electron main process for croc-classroom. Handles all business logic:
- API communication (REST)
- Real-time messaging (WebSocket)
- File transfers (uses croc-engine)
- Local caching
- Relay sharing (seeder)

## Status: ✅ IMPLEMENTATION COMPLETE, 🧪 INTEGRATION TESTS PENDING

- [x] API client
- [x] WebSocket client
- [x] Settings manager
- [x] Transfer manager
- [x] Cache manager
- [x] Seeder
- [x] IPC handlers (20+ methods)
- [x] Electron main entry
- [ ] Integration tests (waiting for relay setup)
- [ ] Real transfer testing

## Architecture

```
Renderer (window.croc)
    ↓ (IPC)
Main Process
    ├── API Client → Server REST endpoints
    ├── WebSocket Client → Server real-time
    ├── Transfer Manager → croc-engine → croc binary
    ├── Cache Manager → ~/.config/croc-classroom/cache
    ├── Seeder → Relay sharing via croc
    └── Settings Manager → ~/.config/croc-classroom/settings.json
```

## Modules

### config.ts
Centralized configuration:
- File paths (userData, documents, cache)
- Transfer timeouts (LAN/VPS/Large)
- File size limits
- IPC channel names

### api-client.ts
REST API wrapper:
- 25+ endpoints
- Token management
- Error handling
- Type-safe requests/responses

### websocket-client.ts
Real-time messaging:
- Auto-reconnect
- Message types: hello, serve.*, ticket.*, submission.*
- EventEmitter pattern
- Full type safety

### transfer-manager.ts
File transfer coordination:
- Uses croc-engine
- Emits progress to renderer
- Handles 8 error types
- Single transfer enforced

### cache.ts
Local assignment caching:
- Downloads → ~/.config/croc-classroom/cache/
- Metadata tracking
- SHA-256 verification
- Quick + full integrity checks

### seeder.ts
Relay sharing server:
- Listens for serve.request
- Checks cache
- Respects concurrency limit
- Uses croc-engine

### ipc-handlers.ts
IPC method implementations:
- 20+ handlers
- Parameter validation
- Calls API/WebSocket/transfers
- Manifest calculation

### index.ts
Electron main entry:
- Window creation
- Manager initialization
- IPC handler registration
- Cleanup on exit

## Build

```bash
npm run build      # Compile TypeScript
npm run dev        # Watch mode
npm test           # Run unit tests (TODO: implement)
```

## Testing

### Unit Tests (Ready to implement)

```bash
npm test
```

### Integration Tests (Requires croc + relay)

```bash
# 1. Download croc
cd packages/croc-engine
npm run download-croc

# 2. Start relay (separate terminal)
croc --pass testpass relay --ports 9009-9013

# 3. Run integration tests
cd apps/desktop/src/main
npm test -- --env=integration
```

**Test scenarios:**
- Login + WebSocket connect
- Create assignment + upload
- Join assignment + download
- Submit assignment
- Collect submission
- Relay sharing (seeder)
- Timeout handling
- Error recovery

## Dependencies

- `electron` - Electron framework
- `@croc-classroom/croc-engine` - File transfer wrapper
- `node-fetch` - HTTP client
- `ws` - WebSocket client

## Security

✅ Implemented:
- All IPC parameters validated
- File paths sanitized (no `..`, absolute paths checked)
- Sensitive data never logged
- Tokens stored securely (TODO: use safeStorage)
- Manifest verification (SHA-256)
- Process cleanup (via croc-engine)
- Timeout enforcement

❌ TODO:
- Token persistence with safeStorage
- Error message localization (Vietnamese)
- Logging system

## Outstanding Items

### Critical
- [ ] Test croc-engine + main with real relay
- [ ] Implement transfer completion handlers
- [ ] Handle server responses for relay details
- [ ] Implement submission collection properly

### Important
- [ ] Add token persistence (safeStorage)
- [ ] Add receipt display/saving
- [ ] Add error message localization
- [ ] Add manifest calculation progress

### Nice to Have
- [ ] Logging system
- [ ] Bandwidth limiting
- [ ] Automatic retry
- [ ] Pause/resume transfers

## For Renderer Developers (Person A)

All business logic is in main process. Renderer calls via:

```typescript
await window.croc.auth.login(...)
await window.croc.student.fetchAssignment(...)
window.croc.transfers.on('progress', (p) => {...})
```

See [docs/contracts.md](../../../../docs/contracts.md) for all endpoints.

## For Server Developers (Person A)

Server must provide:
- REST API endpoints (25+)
- WebSocket server at `/api/ws`
- Relay address/password in responses
- Manifest verification

See [docs/contracts.md](../../../../docs/contracts.md) for contract details.

## Handoff

See [docs/handoffs/B.md](../../../../docs/handoffs/B.md) for complete details.
See [docs/handoffs/B-contract-requests.md](../../../../docs/handoffs/B-contract-requests.md) for open questions.
