/**
 * Migration SQLite, áp dụng theo thứ tự `id` và ghi vào `PRAGMA user_version`.
 * Không sửa migration đã merge; thay đổi schema thì thêm migration mới (C quản lý, D đề xuất qua C).
 *
 * Quy ước: ID là UUID dạng TEXT; thời gian là TEXT ISO 8601 UTC (`...Z`); boolean là INTEGER 0/1.
 */
export interface Migration {
  id: number;
  name: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    id: 1,
    name: 'init',
    sql: `
CREATE TABLE users (
  id                     TEXT PRIMARY KEY,
  role                   TEXT NOT NULL CHECK (role IN ('lecturer', 'student')),
  username               TEXT UNIQUE,
  mssv                   TEXT UNIQUE,
  full_name              TEXT NOT NULL,
  class_label            TEXT,
  password_hash          TEXT,
  activation_code_hash   TEXT,
  activation_expires_at  TEXT,
  disabled               INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
  created_at             TEXT NOT NULL,
  CHECK (
    (role = 'lecturer' AND username IS NOT NULL AND mssv IS NULL) OR
    (role = 'student'  AND mssv IS NOT NULL AND username IS NULL)
  )
);
-- Đúng một giảng viên (system-design mục 8).
CREATE UNIQUE INDEX users_single_lecturer ON users (role) WHERE role = 'lecturer';

CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  device_name   TEXT,
  created_at    TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL,
  expires_at    TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE assignments (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  code_phrase    TEXT NOT NULL UNIQUE,
  deadline_at    TEXT,
  status         TEXT NOT NULL CHECK (status IN ('dang_tai_len', 'da_phat_hanh')),
  manifest_json  TEXT NOT NULL,
  total_size     INTEGER NOT NULL CHECK (total_size >= 0),
  file_count     INTEGER NOT NULL CHECK (file_count >= 1),
  created_at     TEXT NOT NULL,
  published_at   TEXT
);

CREATE TABLE participants (
  assignment_id  TEXT NOT NULL REFERENCES assignments (id) ON DELETE CASCADE,
  student_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  joined_at      TEXT NOT NULL,
  received_at    TEXT,
  received_from  TEXT CHECK (received_from IN ('vps', 'peer', 'lecturer')),
  PRIMARY KEY (assignment_id, student_id)
);

-- Ai đang giữ bản đề đã xác minh (thống kê, chọn nguồn). banned: chính sách cấm còn chờ chốt.
CREATE TABLE holdings (
  assignment_id  TEXT NOT NULL REFERENCES assignments (id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  verified_at    TEXT NOT NULL,
  banned         INTEGER NOT NULL DEFAULT 0 CHECK (banned IN (0, 1)),
  PRIMARY KEY (assignment_id, user_id)
);

-- Mỗi dòng là một phiên bản đã xác minh. Chỉ phiên bản mới nhất còn file (storage_ref khác NULL).
CREATE TABLE submissions (
  id             TEXT PRIMARY KEY,
  assignment_id  TEXT NOT NULL REFERENCES assignments (id) ON DELETE CASCADE,
  student_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  version        INTEGER NOT NULL CHECK (version >= 1),
  received_at    TEXT NOT NULL,
  is_late        INTEGER NOT NULL CHECK (is_late IN (0, 1)),
  total_size     INTEGER NOT NULL CHECK (total_size >= 0),
  file_count     INTEGER NOT NULL CHECK (file_count >= 1),
  manifest_json  TEXT NOT NULL,
  manifest_hash  TEXT NOT NULL,
  storage_ref    TEXT,
  collected_at   TEXT,
  UNIQUE (assignment_id, student_id, version)
);

-- Không lưu code croc (system-design mục 9).
CREATE TABLE tickets (
  id                 TEXT PRIMARY KEY,
  kind               TEXT NOT NULL CHECK (kind IN ('gv_tai_len', 'phat_de', 'nop_bai', 'gv_thu_bai')),
  assignment_id      TEXT NOT NULL REFERENCES assignments (id) ON DELETE CASCADE,
  sender_kind        TEXT NOT NULL CHECK (sender_kind IN ('vps', 'user')),
  sender_user_id     TEXT REFERENCES users (id) ON DELETE CASCADE,
  receiver_kind      TEXT NOT NULL CHECK (receiver_kind IN ('vps', 'user')),
  receiver_user_id   TEXT REFERENCES users (id) ON DELETE CASCADE,
  submission_id      TEXT REFERENCES submissions (id) ON DELETE CASCADE,
  status             TEXT NOT NULL CHECK (status IN ('cho', 'dang_chay', 'xong', 'loi', 'het_han', 'huy')),
  failure_reason     TEXT,
  bytes              INTEGER NOT NULL CHECK (bytes >= 0),
  created_at         TEXT NOT NULL,
  expires_at         TEXT NOT NULL,
  finished_at        TEXT,
  CHECK ((sender_kind = 'user') = (sender_user_id IS NOT NULL)),
  CHECK ((receiver_kind = 'user') = (receiver_user_id IS NOT NULL))
);
CREATE INDEX tickets_open ON tickets (status, expires_at) WHERE status IN ('cho', 'dang_chay');
CREATE INDEX tickets_assignment ON tickets (assignment_id);
`,
  },
  {
    id: 2,
    name: 'assignments-storage-ref',
    sql: `
-- Tham chiếu mờ tới bản đề đã xác minh trong kho VPS, do worker (D) cấp qua onUploadStored.
ALTER TABLE assignments ADD COLUMN storage_ref TEXT;
-- GET /my/assignments tra theo SV.
CREATE INDEX participants_student ON participants (student_id);
`,
  },
];
