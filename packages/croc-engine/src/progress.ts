import type { TransferProgress } from './types.js';

const factors: Record<string, number> = {
  B: 1,
  KB: 1000,
  MB: 1e6,
  GB: 1e9,
  TB: 1e12,
  KIB: 1024,
  MIB: 1024 ** 2,
  GIB: 1024 ** 3,
  TIB: 1024 ** 4,
};

/** croc refreshes a progress bar with CR and can split the line across pipe chunks. */
export function progressReader(total: number | null, emit: (progress: TransferProgress) => void) {
  let partial = '';
  const completed = new Map<string, number>();
  let done = 0;
  return (chunk: string) => {
    const lines = (partial + chunk).split(/[\r\n]/);
    partial = (lines.pop() ?? '').slice(-2048);
    for (const line of lines) {
      const match = /^(.+?)\s+\d+%.*?\(([\d.]+)\s*([KMGT]?i?B)?\s*\/\s*[\d.]+\s*([KMGT]?i?B)\b/i.exec(
        line.trim(),
      );
      if (!match) continue;
      const name = match[1]!,
        bytes = Math.round(Number(match[2]) * factors[(match[3] ?? match[4]!).toUpperCase()]!);
      const before = completed.get(name) ?? 0;
      if (bytes <= before) continue;
      completed.set(name, bytes);
      done += bytes - before;
      emit({ bytesDone: total === null ? done : Math.min(total, done), bytesTotal: total });
    }
  };
}
