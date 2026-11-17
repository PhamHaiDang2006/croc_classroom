import { MssvSchema, normalizeMssv } from '@croc-classroom/shared';

/**
 * Đọc CSV danh sách SV `mssv,ho_ten[,lop]` (system-design mục 7.2).
 * - UTF-8, bỏ BOM; dòng kết thúc `\n` hoặc `\r\n`; ô có thể đặt trong ngoặc kép (RFC 4180,
 *   `""` là một dấu ngoặc kép), cho phép dấu phẩy và xuống dòng trong ô.
 * - Dòng tiêu đề tuỳ chọn: bỏ qua nếu ô đầu là `mssv` (không phân biệt hoa thường).
 * - Dòng trống bị bỏ qua. Số dòng báo lỗi là số dòng vật lý (bắt đầu từ 1) nơi bản ghi bắt đầu.
 */

export interface CsvStudentRow {
  line: number;
  mssv: string;
  fullName: string;
  classLabel: string | null;
}

export interface CsvParseResult {
  rows: CsvStudentRow[];
  errors: { line: number; message: string }[];
}

export const MAX_IMPORT_ROWS = 2000;
const MAX_NAME = 200;
const MAX_CLASS = 100;

interface RawRecord {
  line: number;
  cells: string[];
}

function parseRecords(text: string): { records: RawRecord[]; error?: { line: number; message: string } } {
  const records: RawRecord[] = [];
  let cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  let quoteOpenedAt = 0;

  const endCell = () => {
    cells.push(cell);
    cell = '';
  };
  const endRecord = () => {
    endCell();
    records.push({ line: recordLine, cells });
    cells = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell.trim() === '') {
      cell = '';
      inQuotes = true;
      quoteOpenedAt = line;
    } else if (ch === ',') {
      endCell();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRecord();
      line++;
      recordLine = line;
    } else {
      cell += ch;
    }
  }
  if (inQuotes) return { records, error: { line: quoteOpenedAt, message: 'Thiếu dấu ngoặc kép đóng' } };
  if (cell !== '' || cells.length > 0) endRecord();
  return { records };
}

export function parseStudentCsv(input: string): CsvParseResult {
  const text = input.startsWith('﻿') ? input.slice(1) : input;
  const { records, error } = parseRecords(text);
  const errors: CsvParseResult['errors'] = error ? [error] : [];
  const rows: CsvStudentRow[] = [];

  const nonEmpty = records.filter((r) => r.cells.some((c) => c.trim() !== ''));
  const first = nonEmpty[0];
  const body = first && first.cells[0]?.trim().toLowerCase() === 'mssv' ? nonEmpty.slice(1) : nonEmpty;

  if (body.length === 0 && errors.length === 0) {
    errors.push({ line: 1, message: 'File không có sinh viên nào' });
  }
  if (body.length > MAX_IMPORT_ROWS) {
    errors.push({ line: body[MAX_IMPORT_ROWS]!.line, message: `Quá ${MAX_IMPORT_ROWS} sinh viên trong một lần nhập` });
    return { rows: [], errors };
  }

  for (const record of body) {
    const [rawMssv = '', rawName = '', rawClass = '', ...extra] = record.cells.map((c) => c.trim());
    const problems: string[] = [];
    if (extra.some((c) => c !== '')) problems.push('thừa cột (chỉ có mssv, ho_ten, lop)');
    if (!MssvSchema.safeParse(rawMssv).success) {
      problems.push(rawMssv === '' ? 'thiếu MSSV' : `MSSV "${rawMssv}" không hợp lệ`);
    }
    if (rawName === '') problems.push('thiếu họ tên');
    if (rawName.length > MAX_NAME) problems.push(`họ tên dài quá ${MAX_NAME} ký tự`);
    if (rawClass.length > MAX_CLASS) problems.push(`lớp dài quá ${MAX_CLASS} ký tự`);
    if (problems.length > 0) {
      errors.push({ line: record.line, message: problems.join('; ') });
      continue;
    }
    rows.push({
      line: record.line,
      mssv: normalizeMssv(rawMssv),
      fullName: rawName.normalize('NFC'),
      classLabel: rawClass === '' ? null : rawClass.normalize('NFC'),
    });
  }
  return { rows, errors };
}
