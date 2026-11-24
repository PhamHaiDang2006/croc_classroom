# Contract Requests: Person B → Person A

**Status:** Initial
**Date:** 2024

Issues found in contracts.md that need Person A's input or confirmation.

---

## ✅ Confirmed Contracts

- [x] IPC interface shape
- [x] REST endpoint paths
- [x] WebSocket message types
- [x] Error codes
- [x] Manifest format

---

## ⚠️ Items Needing Clarification

### 1. Relay Address in Responses

**Problem:** Seeder needs relay details in `serve.request` message

**Current:** TODO placeholder in `seeder.ts`

**Needed:** Server should send in `serve.request` message:
```typescript
type ServeRequestMessage = {
  type: 'serve.request'
  ticketId: string
  assignmentId: string
  receiver: string
  crocCode: string
  timeoutMs: number
  relayAddress: string  // ← NEED THIS
  relayPassword: string // ← NEED THIS
}
```

**Question:** Should seeder use same relay as main process, or different one?

---

### 2. Ticket Expiration

**Problem:** Calculate timeout from ticket

**Current:** Code assumes `ticket.expiresAt` is ISO8601 string

**Question:** Is ticket.expiresAt in every response? Or should we calculate from `timeoutMs`?

**Needed in Response:**
```typescript
type Ticket = {
  id: string
  crocCode: string
  expiresAt: string // ISO8601 - used to calculate timeout
  // ... other fields
}
```

---

### 3. Submission Format

**Problem:** How to identify and move submitted files?

**Current:** Code doesn't handle submission collection properly

**Needed:** Clarify submission format:
- Single file? Directory? Zip?
- How to organize in `lecturerCollectDir`?
- Current code assumes: `<dir>/<assignmentTitle>/<MSSV_HoTen>/`
- Should we rename files or keep original names?

---

### 4. Receipt Format

**Problem:** What's in a receipt?

**Current:** Code returns empty `{}`

**Needed:**
```typescript
type Receipt = {
  id: string
  code: string // Unique receipt ID for user
  timestamp: string // ISO8601
  manifestHash: string // For verification
  isLate?: boolean
}
```

**Questions:**
- Is receipt returned immediately after upload? Or after verification?
- Should we display receipt code to user?
- Should we save receipt to file?

---

### 5. User Role in Tickets

**Problem:** Seeder doesn't know who requested

**Current:** `serve.request` only has `receiverId`, not full user info

**Question:** Is that intentional? Do we need student name/MSSV in `serve.request`?

---

### 6. Config Endpoint Response

**Problem:** What does `/config` return?

**Current:** Code assumes it returns relay details

**Needed:**
```typescript
GET /config
Response: {
  relayAddress: string
  relayPassword: string
  limits: {
    maxUploadSize: number
    maxSubmissionSize: number
    maxAssignmentSize: number
    timeoutLAN: number
    timeoutVPS: number
  }
}
```

---

### 7. Server URL Configuration

**Problem:** Where does app get server URL?

**Current:** Default from settings, hardcoded fallback

**Question:** Should this be:
- Configurable by user in settings UI?
- Set at build time?
- Retrieved from... where?

---

### 8. Auth Token Format

**Problem:** How to store token securely?

**Current:** Code stores in settings.json (NOT SECURE)

**Needed:** Person B should use Electron's `safeStorage`

**Question:** Should app persist token and auto-login?

---

### 9. Code Phrase Validation

**Problem:** When joining, should we validate code format?

**Current:** Server validates, but client accepts any string

**Question:** Should client validate format? Example code format:
- "sao-mai-xanh-42"
- 4 words separated by hyphens?
- Case-insensitive?

---

### 10. Transfer Timeout Calculation

**Problem:** How to choose timeout for different scenarios?

**Current:** Use `expiresAt` or fall back to defaults

**Question:** Better approach:
- Use timeout from server response?
- Calculate based on file size?
- Always use defaults?

**Current defaults:**
- LAN: 60 seconds
- VPS: 5 minutes
- Large (>100MB): 15 minutes

---

## 🔧 Needed from Person A

### High Priority
- [ ] Confirm relay address in `serve.request` message
- [ ] Confirm receipt format
- [ ] Clarify submission collection format
- [ ] Confirm ticket `expiresAt` field always present

### Medium Priority
- [ ] Confirm `/config` endpoint response format
- [ ] Clarify code phrase format validation
- [ ] Decide on token persistence strategy
- [ ] Decide on server URL configuration

### Low Priority
- [ ] Consider progress indication for manifest calculation
- [ ] Consider bandwidth limiting
- [ ] Consider automatic retry on network failure

---

## 📝 Once Confirmed

Once Person A confirms above, Person B will:

1. Update IPC handlers to match
2. Update manifest calculation if needed
3. Update submission collection logic
4. Add proper error handling
5. Test all flows with real server

---

**Next:** Await confirmation from Person A on above items.
