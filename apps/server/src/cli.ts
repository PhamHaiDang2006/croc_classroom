import { stdin, stdout } from 'node:process';
import { pathToFileURL } from 'node:url';
import { createAccounts } from './accounts/index.js';
import { loadDbPath } from './config.js';
import { migrate, openDatabase, type Db } from './db/index.js';
import { systemClock } from './ports/clock.js';

/**
 * Lệnh quản trị chạy trong container (system-design mục 7.1):
 *
 *   node dist/cli.js create-lecturer --username <tên đăng nhập> --full-name "<Họ tên>"
 *   node dist/cli.js reset-lecturer-password
 *
 * Mật khẩu KHÔNG truyền qua tham số (lộ trong lịch sử shell và danh sách tiến trình):
 * có bàn phím thì nhập ẩn hai lần; không có thì đọc dòng đầu của stdin.
 */

export const USAGE = `Cách dùng:
  create-lecturer --username <tên đăng nhập> --full-name "<Họ tên>"
      Tạo tài khoản giảng viên (hệ thống chỉ có một).
  reset-lecturer-password
      Đặt lại mật khẩu giảng viên và đăng xuất mọi phiên của giảng viên.

Mật khẩu nhập từ bàn phím (ẩn), hoặc dòng đầu của stdin khi chạy không có bàn phím.
CSDL: biến DB_PATH, hoặc <DATA_DIR>/db/croc-classroom.sqlite (mặc định ./data).`;

export interface CliIo {
  readPassword(prompt: string): Promise<string>;
  out(line: string): void;
  err(line: string): void;
}

export function parseArgs(argv: readonly string[]): { command: string | undefined; options: Record<string, string> } {
  const [command, ...rest] = argv;
  const options: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (!arg.startsWith('--')) throw new Error(`Tham số không hiểu: ${arg}`);
    const eq = arg.indexOf('=');
    if (eq > 0) {
      options[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      const value = rest[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`Thiếu giá trị cho ${arg}`);
      options[arg.slice(2)] = value;
      i++;
    }
  }
  return { command, options };
}

async function askNewPassword(io: CliIo): Promise<string> {
  const first = await io.readPassword('Mật khẩu mới (tối thiểu 8 ký tự): ');
  const second = await io.readPassword('Nhập lại mật khẩu: ');
  if (first !== second) throw new Error('Hai lần nhập mật khẩu không khớp');
  return first;
}

/** Chạy một lệnh; trả về mã thoát. `db` truyền vào khi test. */
export async function runCli(argv: readonly string[], io: CliIo, db: Db): Promise<number> {
  try {
    const { command, options } = parseArgs(argv);
    const accounts = createAccounts({ db, clock: systemClock });
    switch (command) {
      case 'create-lecturer': {
        const username = options['username'];
        const fullName = options['full-name'];
        if (!username || !fullName) throw new Error('Cần --username và --full-name');
        // Kiểm tra trước khi hỏi mật khẩu để không bắt nhập vô ích.
        if (accounts.service.hasLecturer()) throw new Error('Đã có tài khoản giảng viên (hệ thống chỉ có một)');
        const user = await accounts.service.createLecturer({ username, fullName, password: await askNewPassword(io) });
        io.out(`Đã tạo tài khoản giảng viên "${user.role === 'lecturer' ? user.username : ''}".`);
        return 0;
      }
      case 'reset-lecturer-password': {
        if (!accounts.service.hasLecturer()) throw new Error('Chưa có tài khoản giảng viên; dùng lệnh create-lecturer');
        await accounts.service.resetLecturerPassword(await askNewPassword(io));
        io.out('Đã đặt lại mật khẩu giảng viên; mọi phiên cũ đã bị đăng xuất.');
        return 0;
      }
      case undefined:
      case 'help':
      case '--help':
        io.out(USAGE);
        return command === undefined ? 1 : 0;
      default:
        io.err(`Lệnh không tồn tại: ${command}\n\n${USAGE}`);
        return 1;
    }
  } catch (error) {
    const message =
      error instanceof Error && 'issues' in error
        ? (error as { issues: { message: string }[] }).issues.map((i) => i.message).join('; ')
        : error instanceof Error
          ? error.message
          : String(error);
    io.err(`Lỗi: ${message}`);
    return 1;
  }
}

// ------------------------------------------------------------ nhập mật khẩu từ terminal

let pipedLines: Promise<string[]> | undefined;

function readPipedLines(): Promise<string[]> {
  pipedLines ??= new Promise((resolve, reject) => {
    let data = '';
    stdin.setEncoding('utf8');
    stdin.on('data', (chunk: string) => (data += chunk));
    stdin.on('end', () => resolve(data.split(/\r?\n/)));
    stdin.on('error', reject);
  });
  return pipedLines;
}

/** Đọc mật khẩu: bàn phím → nhập ẩn; stdin là pipe → dòng đầu (dùng cho cả hai lần hỏi). */
function readPasswordFromTerminal(prompt: string): Promise<string> {
  if (!stdin.isTTY) {
    return readPipedLines().then((lines) => lines[0] ?? '');
  }
  return new Promise((resolve, reject) => {
    stdout.write(prompt);
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          cleanup();
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          cleanup();
          stdout.write('\n');
          reject(new Error('Đã huỷ'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  const db = openDatabase(loadDbPath());
  migrate(db);
  const code = await runCli(process.argv.slice(2), {
    readPassword: readPasswordFromTerminal,
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  }, db);
  db.close();
  process.exit(code);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  void main();
}
