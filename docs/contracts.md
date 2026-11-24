# IPC & API Contracts (Person B - Người B)

**Status:** v1.0 (Person B defines, Person A reviews)
**Owner:** Person B
**Last Updated:** 2024

---

## 1. IPC Contract (Electron: Renderer ↔ Main)

### Exposed Interface: `window.croc`

**NO raw Node APIs exposed. Only safe, typed methods.**

```typescript
interface CrocIPC {
  // Auth
  auth: {
    login(username: string, password: string): Promise<{ token: string; user: User }>
    logout(): Promise<void>
    activate(mssv: string, activationCode: string, password: string): Promise<User>
    getMe(): Promise<User>
  }

  // Assignments (Giảng viên)
  lecturer: {
    createAssignment(title: string, payloadDir: string): Promise<{ assignment: Assignment; codePhrase: string }>
    getAssignments(): Promise<Assignment[]>
    getSubmissions(assignmentId: string): Promise<Submission[]>
    collectSubmission(submissionId: string): Promise<Receipt>
  }

  // Assignments (Sinh viên)
  student: {
    getAssignments(): Promise<Assignment[]>
    joinAssignment(codePhrase: string): Promise<Assignment>
    fetchAssignment(assignmentId: string): Promise<void> // Triggers progress
    submitAssignment(assignmentId: string, filePath: string): Promise<Receipt>
  }

  // Transfer Progress
  transfers: {
    on(event: 'progress' | 'done' | 'error', callback: (data: TransferEvent) => void): void
    cancel(): Promise<void>
  }

  // Settings
  settings: {
    get(): Promise<Settings>
    update(partial: Partial<Settings>): Promise<Settings>
    openFolder(path: string): Promise<void>
  }

  // Window Control
  window: {
    minimize(): void
    maximize(): void
    close(): void
  }
}
```

### Type Definitions (for IPC only)

```typescript
// User
type User = {
  id: string
  mssv?: string
  username?: string
  fullName: string
  role: 'lecturer' | 'student'
  activatedAt?: string // ISO8601
}

// Assignment
type Assignment = {
  id: string
  title: string
  description?: string
  codePhrase: string // \"sao-mai-xanh-42\"
  manifest: Manifest
  dueAt?: string // ISO8601
  status: 'dang_tai_len' | 'da_phat_hanh' | 'archived'
  createdBy: string
  createdAt: string // ISO8601
  stats?: {
    participantCount: number
    receivedCount: number
    submittedCount: number
    lateCount: number
  }
}

// Manifest
type Manifest = {
  files: Array<{
    path: string // relative, using /, NFC
    size: number
    sha256: string
  }>
  totalSize: number
  hash: string // SHA256 of entire manifest
}

// Submission
type Submission = {
  id: string
  assignmentId: string
  studentId: string
  studentName: string
  studentMSSV: string
  manifest: Manifest
  status: 'pending' | 'submitted' | 'late'
  submittedAt?: string // ISO8601
  collectedAt?: string // ISO8601
  version: number
}

// Receipt
type Receipt = {
  id: string
  code: string // Unique receipt code
  timestamp: string // ISO8601
  manifestHash: string
  isLate?: boolean
}

// TransferEvent
type TransferEvent = 
  | { type: 'progress'; percentage?: number; bytesPerSecond: number }
  | { type: 'done'; result: { filesTransferred: number; elapsedMs: number } }
  | { type: 'error'; error: { type: TransferErrorType; message: string } }

// Settings
type Settings = {
  workDir: string // \"<Tài liệu>/croc-classroom\"
  lecturerCollectDir: string // \"<workDir>/collected\"
  enableSeeding: boolean // Default: true
  maxConcurrentSeeds: number // Default: 1
  cacheDir: string // \"<userData>/cache\"
}

// Error Types (from croc-engine)
enum TransferErrorType {
  TIMEOUT = 'TIMEOUT',
  RELAY_AUTH_FAILED = 'RELAY_AUTH_FAILED',
  RELAY_CONNECT_FAILED = 'RELAY_CONNECT_FAILED',
  CANCELLED = 'CANCELLED',
  PROCESS_EXIT = 'PROCESS_EXIT',
  PATH_ESCAPE = 'PATH_ESCAPE',
  SECURITY_VIOLATION = 'SECURITY_VIOLATION',
  UNKNOWN = 'UNKNOWN',
}
```

### Security Rules

- ❌ **Never expose:** `ipcRenderer`, `fs`, `child_process`, `path`, Node APIs
- ❌ **Never return:** passwords, tokens, relay passwords, croc codes
- ❌ **Never log:** tokens, codes, passwords
- ✅ **Always validate:** all parameters from renderer in main process
- ✅ **Always sanitize:** file paths (no `../`, absolute paths, symlinks)
- ✅ **Always timeout:** all transfers (default 60s for LAN, 300s for VPS)
- ✅ **Always cleanup:** child processes even on error

---

## 2. REST API Contract (Main ↔ Server)

**Base URL:** `https://{server}/{api}/v1`
**Auth:** Bearer token in `Authorization` header

### Authentication

```
POST /auth/login
Request: { username: string; password: string }
Response: { token: string; user: User }
Error: 401 (invalid), 429 (rate limited)

POST /auth/logout
Request: {}
Response: { success: true }

POST /auth/activate
Request: { mssv: string; activationCode: string; password: string }
Response: { user: User }
Error: 400 (invalid code), 409 (already activated)

GET /auth/me
Response: { user: User }
Error: 401 (not authenticated)
```

### Assignments (Lecturer)

```
POST /assignments
Request: { title: string; description?: string; dueAt?: ISO8601; manifest: Manifest }
Response: { assignment: Assignment; ticket: Ticket }
Error: 400 (invalid manifest), 413 (too large >1GB)

GET /assignments
Response: { assignments: Assignment[] }

GET /assignments/:id
Response: { assignment: Assignment }
Error: 404 (not found)

PATCH /assignments/:id
Request: { title?: string; description?: string; dueAt?: ISO8601 }
Response: { assignment: Assignment }
Error: 404 (not found), 409 (already published)

DELETE /assignments/:id
Request: {}
Response: { success: true }
Error: 404 (not found)

GET /assignments/:id/submissions
Response: { submissions: Submission[] }

POST /submissions/:id/collect
Request: {}
Response: { ticket: Ticket }
Error: 404 (not found)
```

### Assignments (Student)

```
POST /join
Request: { codePhrase: string }
Response: { assignment: Assignment; manifest: Manifest }
Error: 404 (code not found), 409 (already joined), 429 (too many wrong tries)

GET /my/assignments
Response: { assignments: Assignment[] }

POST /assignments/:id/fetch
Request: {}
Response: { ticket: Ticket }
Error: 404 (not found), 403 (not joined)

POST /assignments/:id/submit
Request: { manifest: Manifest }
Response: { ticket: Ticket }
Error: 400 (invalid manifest), 413 (too large >200MB), 404 (not found)

GET /submissions/:id/receipt
Response: { receipt: Receipt }
Error: 404 (not found)
```

### Tickets (for croc transfers)

```
POST /tickets/:id/result
Request: { success: boolean; error?: string; bytesTransferred?: number }
Response: { success: true }
Error: 404 (ticket not found), 410 (expired)
```

### Config

```
GET /config
Response: {
  relayAddress: string
  relayPassword: string
  limits: {
    maxUploadSize: number
    maxSubmissionSize: number
    timeoutLAN: number
    timeoutVPS: number
  }
}
```

---

## 3. WebSocket Contract (Main ↔ Server)

**URL:** `wss://{server}/{api}/ws`
**Auth:** Token in URL or header

### Client → Server Messages

```typescript
// Announce connectivity
type HelloMessage = {
  type: 'hello'
  userId: string
  localSubnets: string[] // [\"192.168.1.0/24\"]
}

// Announce availability to serve
type SeedAnnounceMessage = {
  type: 'seed.announce'
  assignmentId: string
  hasFiles: true
}

// Withdraw availability
type SeedWithdrawMessage = {
  type: 'seed.withdraw'
  assignmentId: string
}

// Accept serve request
type ServeAcceptMessage = {
  type: 'serve.accept'
  ticketId: string
}

// Reject serve request
type ServeRejectMessage = {
  type: 'serve.reject'
  ticketId: string
  reason?: string
}

// Report serve result
type ServeResultMessage = {
  type: 'serve.result'
  ticketId: string
  success: boolean
  error?: string
  bytesTransferred?: number
}
```

### Server → Client Messages

```typescript
// Request to serve files
type ServeRequestMessage = {
  type: 'serve.request'
  ticketId: string
  assignmentId: string
  receiver: string // Student ID
  crocCode: string
  timeoutMs: number
}

// Ticket is ready for transfer
type TicketReadyMessage = {
  type: 'ticket.ready'
  ticketId: string
  crocCode: string
  relayAddress: string
  relayPassword: string
  timeoutMs: number
}

// Cancel ticket (timeout or server shutdown)
type TicketCancelMessage = {
  type: 'ticket.cancel'
  ticketId: string
  reason: string
}

// New submission available
type SubmissionNewMessage = {
  type: 'submission.new'
  submissionId: string
  assignmentId: string
  studentName: string
  studentMSSV: string
}
```

---

## 4. Manifest Contract

**Used for:** Verifying file integrity

```typescript
type Manifest = {
  // Array of files
  files: Array<{
    // Relative path, using / separator, NFC normalized
    path: string // \"src/main.ts\", \"docs/README.md\"
    // File size in bytes
    size: number
    // SHA-256 hash (lowercase hex)
    sha256: string
  }>
  // Sum of all file sizes
  totalSize: number
  // SHA-256 of JSON stringified manifest (for receipts)
  hash: string
}
```

**Rules:**
- Paths must be relative (no leading `/`)
- Use `/` separator (not `\\`)
- Path normalization: NFD → NFC (macOS issue)
- No `..` or absolute paths allowed
- All hashes lowercase hex
- Hash is deterministic (for receipts)

---

## 5. Ticket Contract

**Used for:** File transfer coordination

```typescript
type Ticket = {
  id: string // UUID
  type: 'gv_tai_len' | 'phat_de' | 'nop_bai' | 'gv_thu_bai'
  status: 'pending' | 'active' | 'done' | 'cancelled'
  crocCode: string // ≥128 bit random, ≠ codePhrase
  relayAddress: string // \"relay.example.com:9009\"
  relayPassword: string // Secret, never log
  sender: string // User ID or \"vps\"
  receiver: string // User ID
  manifestHash: string // Expected SHA-256 of manifest
  expiresAt: string // ISO8601
  createdAt: string // ISO8601
}
```

---

## 6. Error Codes

### HTTP Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad request (invalid input)
- `401` - Unauthorized (not authenticated)
- `403` - Forbidden (not authorized)
- `404` - Not found
- `409` - Conflict (already exists, state conflict)
- `410` - Gone (ticket expired)
- `413` - Payload too large
- `429` - Too many requests (rate limited)
- `500` - Server error

### Transfer Error Types (from croc-engine)
- `TIMEOUT` - Transfer exceeded timeout
- `RELAY_AUTH_FAILED` - Wrong relay password
- `RELAY_CONNECT_FAILED` - Cannot reach relay
- `CANCELLED` - User cancelled
- `PROCESS_EXIT` - Croc exited with error
- `PATH_ESCAPE` - File tried to escape output directory
- `SECURITY_VIOLATION` - Input validation failed
- `UNKNOWN` - Other error

---

## 7. Data Flow Contracts

### Upload Assignment (Lecturer)
1. `IPC.lecturer.createAssignment(title, payloadDir)`
2. Main calculates manifest from payloadDir
3. Main `POST /assignments` (gets assignment + ticket)
4. Main uses `croc-engine.send()` to send to VPS
5. Main `POST /tickets/:id/result` with success/failure
6. Renderer displays codePhrase

### Download Assignment (Student)
1. `IPC.student.joinAssignment(codePhrase)`
2. Main `POST /join` (gets assignment + manifest)
3. Main `POST /assignments/:id/fetch` (gets ticket from server or queue)
4. Main receives `ticket.ready` on WebSocket
5. Main uses `croc-engine.receive()` to download
6. Main verifies manifest (SHA-256)
7. Main `POST /tickets/:id/result` with success/failure
8. Main copies to cache + workDir

### Submit Assignment (Student)
1. `IPC.student.submitAssignment(assignmentId, filePath)`
2. Main calculates manifest from filePath
3. Main `POST /assignments/:id/submit` (gets ticket)
4. Main uses `croc-engine.send()` to send to VPS
5. Main `POST /tickets/:id/result` with success/failure
6. Main displays receipt

### Collect Submission (Lecturer)
1. `IPC.lecturer.getSubmissions(assignmentId)` → show list
2. `IPC.lecturer.collectSubmission(submissionId)`
3. Main `POST /submissions/:id/collect` (gets ticket)
4. Main uses `croc-engine.receive()` to download
5. Main verifies manifest (SHA-256)
6. Main `POST /tickets/:id/result` with success/failure
7. Main moves to `collectedDir/<assignmentTitle>/<MSSV_HoTen>/`

---

## 8. Notes for Person A

**Review these contracts and confirm:**
- ✅ IPC types match your renderer expectations
- ✅ REST endpoints match your server implementation
- ✅ WebSocket messages match your server
- ✅ Error codes are compatible
- ❌ If mismatch found: update this file, DON'T modify Person B's implementation
- ⚠️ If you need IPC changes: add to docs/handoffs/A-ipc-requests.md
