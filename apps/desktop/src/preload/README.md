# preload — IPC Bridge (Person B, Phase 2)

Secure Electron IPC bridge between renderer (React) and main process.

## Status: ✅ COMPLETE

- [x] contextBridge implementation
- [x] Type-safe IPC interface
- [x] Security tests
- [x] Zero Node API exposure

## What This Does

Exposes `window.croc` to the renderer with these modules:

```typescript
window.croc.auth.login(username, password)
window.croc.student.joinAssignment(codePhrase)
window.croc.transfers.on('progress', callback)
window.croc.settings.get()
// ... 20+ safe IPC methods
```

## Files

- **src/index.ts** - Main entry: contextBridge registration
- **src/types.ts** - Type definitions (CrocIPC interface, all types)
- **src/__tests__/safety.test.ts** - Security verification

## Security

✅ **What's exposed:**
- Safe, typed IPC methods only
- No raw `ipcRenderer`
- No Node.js modules

❌ **What's NOT exposed:**
- `ipcRenderer` - undefined
- `fs` - undefined
- `child_process` - undefined
- `path` - undefined
- Any Node APIs

## Build

```bash
npm run build      # Compile TypeScript
npm run dev        # Watch mode
npm test           # Run security tests
```

## Testing

```bash
npm test
# Should pass: no Node APIs exposed
```

## Integration

Used by: `apps/desktop/src/main/index.ts` (Electron main)

Loaded via:
```javascript
window.webPreferences.preload = path.join(__dirname, '../../preload/dist/index.js')
```

## IPC Channels

See [docs/contracts.md](../../../../docs/contracts.md) for complete list.

## For Renderer Developers (Person A)

All IPC calls return Promises:

```typescript
// Login
const { token, user } = await window.croc.auth.login('user', 'pass')

// File transfer progress
window.croc.transfers.on('progress', (p) => {
  console.log(p.percentage + '%')
})

// Settings
const settings = await window.croc.settings.get()
await window.croc.settings.update({ enableSeeding: true })
```

All parameters are validated in main process — you don't need to validate.

## Handoff

See [docs/handoffs/B.md](../../../../docs/handoffs/B.md) for complete implementation details.
