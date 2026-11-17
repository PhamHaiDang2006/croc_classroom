/** Nguồn thời gian, tách ra để test được hạn nộp, hạn vé, hạn mã kích hoạt. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Thời điểm hiện tại dạng ISO UTC — định dạng lưu CSDL và trả về API. */
export function nowIso(clock: Clock): string {
  return clock.now().toISOString();
}
