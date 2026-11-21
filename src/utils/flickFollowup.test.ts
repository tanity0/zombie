// 「当てた直後のフリック」の共通部品(鞭の追加攻撃・刀の燕返し)の純関数。
import { describe, it, expect } from 'vitest';
import { flickBand, isFlickFollowupOpen, FLICK_FOLLOWUP_WINDOW_MS } from './flickFollowup';

const deg = (d: number) => ({ x: Math.cos((d * Math.PI) / 180), y: Math.sin((d * Math.PI) / 180) });

describe('角度の帯', () => {
  it('60°以内=進行方向・120°以上=反対・その間と長さ0=null(境目を含む)', () => {
    expect(flickBand(deg(0), deg(60))).toBe('forward');
    expect(flickBand(deg(0), deg(61))).toBeNull();
    expect(flickBand(deg(0), deg(119))).toBeNull();
    expect(flickBand(deg(0), deg(120))).toBe('back');
    expect(flickBand(deg(90), deg(-90))).toBe('back');
    expect(flickBand({ x: 0, y: 0 }, deg(0))).toBeNull();
  });
});

describe('受付の窓', () => {
  const w = { hitAt: 500, dirX: 1, dirY: 0, hitIds: ['a'], used: false };
  it('当たった瞬間から300msの間・未使用・当たりが1体以上の時だけ開く', () => {
    expect(isFlickFollowupOpen(w, 499)).toBe(false);
    expect(isFlickFollowupOpen(w, 500)).toBe(true);
    expect(isFlickFollowupOpen(w, 500 + FLICK_FOLLOWUP_WINDOW_MS)).toBe(true);
    expect(isFlickFollowupOpen(w, 501 + FLICK_FOLLOWUP_WINDOW_MS)).toBe(false);
    expect(isFlickFollowupOpen({ ...w, used: true }, 600)).toBe(false);
    expect(isFlickFollowupOpen({ ...w, hitIds: [] }, 600)).toBe(false);
  });
});
