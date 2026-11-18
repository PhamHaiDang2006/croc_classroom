import { describe, expect, it } from 'vitest';
import { CODE_PHRASE_PATTERN, CodePhraseInputSchema, isCodePhraseFormat, normalizeCodePhrase } from '@croc-classroom/shared';
import { CODE_PHRASE_WORDS, codePhraseEntropyBits, generateCodePhrase } from '@croc-classroom/shared/node';

describe('danh sách từ', () => {
  it('có 128 từ, không trùng, chỉ a–z, dài 2–6', () => {
    expect(CODE_PHRASE_WORDS).toHaveLength(128);
    expect(new Set(CODE_PHRASE_WORDS).size).toBe(CODE_PHRASE_WORDS.length);
    for (const word of CODE_PHRASE_WORDS) expect(word).toMatch(/^[a-z]{2,6}$/);
  });

  it('đủ ít nhất 30 bit ngẫu nhiên (system-design mục 8)', () => {
    expect(codePhraseEntropyBits()).toBeGreaterThanOrEqual(30);
  });
});

describe('generateCodePhrase', () => {
  it('sinh đúng định dạng tu-tu-tu-NNN', () => {
    for (let i = 0; i < 200; i++) {
      const phrase = generateCodePhrase();
      expect(phrase).toMatch(CODE_PHRASE_PATTERN);
      const words = phrase.split('-').slice(0, 3);
      for (const word of words) expect(CODE_PHRASE_WORDS).toContain(word);
    }
  });

  it('không lặp lại trong một loạt ngắn', () => {
    const phrases = new Set(Array.from({ length: 500 }, () => generateCodePhrase()));
    expect(phrases.size).toBeGreaterThan(495);
  });
});

describe('chuẩn hoá code người dùng gõ', () => {
  it.each([
    ['sao-mai-xanh-042', 'sao-mai-xanh-042'],
    ['  SAO-Mai-xanh-042 ', 'sao-mai-xanh-042'],
    ['sao mai xanh 042', 'sao-mai-xanh-042'],
    ['sao_mai__xanh-042', 'sao-mai-xanh-042'],
    ['sao--mai-xanh-042', 'sao-mai-xanh-042'],
  ])('%j → %j', (input, expected) => {
    expect(normalizeCodePhrase(input)).toBe(expected);
    expect(isCodePhraseFormat(input)).toBe(true);
    expect(CodePhraseInputSchema.parse(input)).toBe(expected);
  });

  it.each(['', 'sao-mai-042', 'sao-mai-xanh-42', 'sáo-mai-xanh-042', 'sao-mai-xanh-0421'])('từ chối %j', (input) => {
    expect(CodePhraseInputSchema.safeParse(input).success).toBe(false);
  });
});
