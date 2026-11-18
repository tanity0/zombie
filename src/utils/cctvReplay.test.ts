import { describe, expect, it } from 'vitest';
import { cctvCameraLabel, cctvEndingMs, formatCctvClock, CCTV_POWER_OFF_MS } from './cctvReplay';

describe('cctvReplay', () => {
  it('時刻は秒単位で進み、桁をそろえる', () => {
    expect(formatCctvClock(21 * 3600 + 14 * 60 + 37, 0, '2025-07-19')).toBe('2025-07-19 21:14:37');
    expect(formatCctvClock(21 * 3600 + 14 * 60 + 37, 999, '2025-07-19')).toBe('2025-07-19 21:14:37');
    expect(formatCctvClock(21 * 3600 + 14 * 60 + 37, 23_500, '2025-07-19')).toBe('2025-07-19 21:15:00');
    expect(formatCctvClock(86399, 1000, 'd')).toBe('d 00:00:00');
  });
  it('カメラ名は場面ごとに違い、範囲外は端に寄せる', () => {
    const labels = [0, 1, 2, 3].map(cctvCameraLabel);
    expect(new Set(labels).size).toBe(4);
    expect(cctvCameraLabel(-1)).toBe(labels[0]);
    expect(cctvCameraLabel(9)).toBe(labels[3]);
  });
  it('プツンは急(250ms以内)で、飛ばした時の方が早く終わる', () => {
    expect(CCTV_POWER_OFF_MS).toBeLessThanOrEqual(250);
    expect(cctvEndingMs(true)).toBeLessThan(cctvEndingMs(false));
  });
});
