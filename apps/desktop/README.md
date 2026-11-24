# apps/desktop — Electron App (Person B)

Electron app for teachers and students. Same app, different UI based on role.

**Status:** ✅ **Phase 2 & 3 COMPLETE** | 🧪 **Phase 1 (Renderer) TODO by Person A**

## Phases

| Phase | Component | Status | Person |
|-------|-----------|--------|--------|
| 1 | Framework + Window + Build | 🚧 TODO | A |
| 2 | Preload Bridge (IPC) | ✅ DONE | B |
| 3 | Main Process (Logic) | ✅ DONE | B |

## Components

| Directory | Purpose | Status |
|-----------|---------|--------|
| [`src/preload`](src/preload/README.md) | Secure IPC bridge (window.croc) | ✅ Complete |
| [`src/main`](src/main/README.md) | Electron main: API, WebSocket, transfers, cache, seeding | ✅ Complete |
| [`src/renderer`](src/renderer/README.md) | React UI (login, assignments, transfers) | 🚧 TODO |

## What's Done (Phase 2 & 3)

✅ **Phase 2: Preload Bridge**
- contextBridge exposing `window.croc`
- 20+ safe, typed IPC methods
- Zero Node API exposure
- Security tests

✅ **Phase 3: Main Process**
- REST API client (25+ endpoints)
- WebSocket client (auto-reconnect)
- File transfer coordination (croc-engine)
- Local assignment caching
- Relay sharing (seeder)
- Settings management
- 20+ IPC handlers
- Proper error handling

## What's TODO (Phase 1)

🚧 **Framework & UI**
- [ ] electron-vite setup
- [ ] React + TypeScript
- [ ] Single instance lock
- [ ] Tray icon support
- [ ] Window management
- [ ] electron-builder (NSIS, dmg, AppImage)
- [ ] Code signing
- [ ] Auto-updates
- [ ] Vietnamese UI

## Architecture

```
┌─────────────────────────┐
│  Renderer (React)       │ [Person A - Phase 1]
│  ├── Login screen       │
│  ├── Teacher UI         │
│  └── Student UI         │
└─────────┬───────────────┘
          │ (window.croc)
┌─────────▼───────────────┐
│  Preload Bridge         │ [Person B - Phase 2]
│  contextBridge          │ ✅ Done
└─────────┬───────────────┘
          │ (IPC channels)
┌─────────▼───────────────────────┐
│  Main Process                   │ [Person B - Phase 3]
│  ├── API Client → REST          │ ✅ Done
│  ├── WebSocket Client           │ ✅ Done
│  ├── Transfer Manager → croc    │ ✅ Done
│  ├── Cache Manager              │ ✅ Done
│  ├── Seeder (relay sharing)     │ ✅ Done
│  └── Settings                   │ ✅ Done
└─────────┬───────────────────────┘
          │
┌─────────┴─────────────────┐
│  External Systems         │
├──────────────────────────┤
│  Server (REST + WS)      │ [Person A - later]
│  croc relay              │ [Infrastructure]
│  Local filesystem        │ [OS]
└──────────────────────────┘
```

## Build

```bash
# Install all dependencies
npm install

# Build all three components
npm run build        # In each directory

# Development (watch mode)
npm run dev          # In each directory

# Testing
npm test            # In each directory
```

## Testing Strategy

### Unit Tests
- Preload: Security tests (run now)
- Main: TODO (ready to implement)
- Renderer: TODO (ready to implement)

### Integration Tests
Requires: croc binary + relay server

```bash
# 1. Download croc
cd packages/croc-engine
npm run download-croc

# 2. Start relay
croc --pass testpass relay --ports 9009-9013

# 3. Run integration tests
cd apps/desktop/src/main
npm test -- --env=integration
```

### Real Testing
With renderer UI + server APIs

## Project Structure

```
src/
├── preload/          [✅ Person B Phase 2]
│   ├── src/
│   │   ├── index.ts         ← contextBridge registration
│   │   ├── types.ts         ← CrocIPC interface
│   │   └── __tests__/       ← Security tests
│   ├── package.json
│   └── README.md
│
├── main/             [✅ Person B Phase 3]
│   ├── src/
│   │   ├── index.ts              ← Electron main entry
│   │   ├── config.ts             ← Settings & constants
│   │   ├── api-client.ts         ← REST wrapper
│   │   ├── websocket-client.ts   ← WebSocket wrapper
│   │   ├── settings.ts           ← Settings manager
│   │   ├── transfer-manager.ts   ← File transfer coordination
│   │   ├── cache.ts              ← Assignment caching
│   │   ├── seeder.ts             ← Relay sharing
│   │   ├── ipc-handlers.ts       ← All IPC implementations
│   │   └── __tests__/            ← Unit tests (TODO)
│   ├── package.json
│   └── README.md
│
└── renderer/         [🚧 Person A Phase 1]
    ├── src/
    │   ├── App.tsx
    │   ├── pages/
    │   │   ├── Login.tsx
    │   │   ├── Teacher.tsx
    │   │   └── Student.tsx
    │   └── components/
    ├── package.json
    └── README.md
```

## Dependencies

- `electron` - Electron framework
- `react` - UI framework
- `typescript` - Type safety
- `@croc-classroom/croc-engine` - File transfer
- `node-fetch` - HTTP client
- `ws` - WebSocket client

## For Renderer Developers (Person A)

**What you have:**
- Safe IPC interface: `window.croc`
- 20+ ready-to-use methods
- Full type definitions
- Transfer progress events

**All you need to do:**
- Create React components
- Call `window.croc.auth.login()`
- Call `window.croc.student.fetchAssignment()`
- Listen to `window.croc.transfers.on('progress', ...)`
- Display UI based on data

See [docs/contracts.md](../../docs/contracts.md) for all available methods.

## Contracts

All contracts defined in [docs/contracts.md](../../docs/contracts.md):
- IPC interface (window.croc)
- REST API endpoints
- WebSocket messages
- Error codes
- Data formats

## Handoff Notes

See:
- [docs/handoffs/B.md](../../docs/handoffs/B.md) - Implementation details
- [docs/handoffs/B-contract-requests.md](../../docs/handoffs/B-contract-requests.md) - Open questions for Person A
