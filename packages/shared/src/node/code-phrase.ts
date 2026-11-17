import { randomInt } from 'node:crypto';

/**
 * 128 từ tiếng Việt không dấu, 2–6 chữ cái, dễ đọc to, tránh từ có nghĩa xấu khi bỏ dấu.
 * Đổi danh sách là đổi định dạng code phrase: cập nhật test entropy và báo cả nhóm.
 */
export const CODE_PHRASE_WORDS: readonly string[] = [
  // thiên nhiên
  'sao', 'trang', 'may', 'mua', 'gio', 'nang', 'song', 'suoi', 'bien', 'nui', 'doi', 'rung',
  'hoa', 'la', 'cay', 'co', 'cat', 'soi', 'da', 'dat', 'lua', 'nuoc', 'suong', 'mai',
  // màu sắc
  'xanh', 'hong', 'vang', 'tim', 'nau', 'bac', 'ngoc', 'ngan', 'cam', 'tia',
  // cây trái
  'tre', 'truc', 'tung', 'bach', 'sen', 'lan', 'cuc', 'dao', 'mo', 'le', 'man', 'nho',
  'dua', 'xoai', 'chuoi', 'mit',
  // món ăn
  'gao', 'com', 'banh', 'keo', 'tra', 'sua', 'muoi', 'tieu', 'gung', 'que', 'rau', 'bap',
  // con vật
  'cong', 'hac', 'ca', 'cua', 'tom', 'oc', 'ech', 'nai', 'tho', 'meo', 'ngua', 'trau',
  'voi', 'ho', 'gau', 'soc', 'ong', 'buom', 'cuu', 'vit', 'yen', 'rong', 'rua', 'sau',
  // đồ vật
  'but', 'sach', 'vo', 'thuoc', 'ban', 'ghe', 'den', 'quat', 'ao', 'mu', 'giay', 'tui',
  'hop', 'chuong', 'trong', 'dan', 'thuyen', 'xe', 'tau', 'cau',
  // nơi chốn
  'nha', 'san', 'vuon', 'ruong', 'lang', 'pho', 'chua', 'thap',
  // tính từ
  'vui', 'tuoi', 'sang', 'em', 'hien', 'xinh', 'dep', 'tot', 'manh', 'nhanh', 'cao', 'moi',
  'am', 'thom',
];

/** Sinh code phrase `tu-tu-tu-NNN` bằng bộ sinh số ngẫu nhiên an toàn mật mã. Server tự kiểm tra trùng. */
export function generateCodePhrase(words: readonly string[] = CODE_PHRASE_WORDS): string {
  const pick = () => words[randomInt(words.length)]!;
  const number = String(randomInt(1000)).padStart(3, '0');
  return `${pick()}-${pick()}-${pick()}-${number}`;
}

/** Số bit ngẫu nhiên của một code phrase sinh từ danh sách từ đã cho. */
export function codePhraseEntropyBits(wordCount: number = CODE_PHRASE_WORDS.length): number {
  return 3 * Math.log2(wordCount) + Math.log2(1000);
}
