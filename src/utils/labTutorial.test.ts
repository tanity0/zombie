// M2チュートリアル(社長指示v0.25.2251)の発火条件。
// 肝は「索敵は**見つかる前**に出す」= 休眠中の敵にしか反応しない + 距離が視界(200)より外であること。
import { describe, it, expect } from 'vitest';
import {
  shouldShowPhillTutorial, shouldShowScoutTutorial, LAB_TUTORIAL_APPROACH_PX, LAB_TUTORIAL_TEXT,
} from './labTutorial';
import { LAB_VISION_RANGE } from './labStealth';

const OPEN = { seen: false, popupOpen: false, menuOpen: false };

describe('shouldShowPhillTutorial', () => {
  it('PHILL銃を持っていて、メニューもポップアップも閉じていれば出す', () => {
    expect(shouldShowPhillTutorial({ ...OPEN, hasPhillGun: true })).toBe(true);
  });

  it('PHILL銃を持っていなければ出さない', () => {
    expect(shouldShowPhillTutorial({ ...OPEN, hasPhillGun: false })).toBe(false);
  });

  it('商人/強化メニューを開いている間は出さない(UIを重ねない)', () => {
    expect(shouldShowPhillTutorial({ ...OPEN, menuOpen: true, hasPhillGun: true })).toBe(false);
  });

  it('別のポップアップが出ている間は出さない', () => {
    expect(shouldShowPhillTutorial({ ...OPEN, popupOpen: true, hasPhillGun: true })).toBe(false);
  });

  it('表示済み(端末記憶)なら出さない', () => {
    expect(shouldShowPhillTutorial({ ...OPEN, seen: true, hasPhillGun: true })).toBe(false);
  });
});

describe('shouldShowScoutTutorial', () => {
  it('休眠中の敵が接近距離まで近づいたら出す', () => {
    expect(shouldShowScoutTutorial({ ...OPEN, nearestDormantDist: LAB_TUTORIAL_APPROACH_PX - 1 })).toBe(true);
  });

  it('まだ遠ければ出さない', () => {
    expect(shouldShowScoutTutorial({ ...OPEN, nearestDormantDist: LAB_TUTORIAL_APPROACH_PX + 1 })).toBe(false);
  });

  it('休眠中の敵が1体も居なければ(=全員起床済み/敵が居ない)出さない', () => {
    expect(shouldShowScoutTutorial({ ...OPEN, nearestDormantDist: null })).toBe(false);
  });

  it('表示済み/メニュー中/ポップアップ中は出さない', () => {
    const d = { nearestDormantDist: 10 };
    expect(shouldShowScoutTutorial({ ...OPEN, ...d, seen: true })).toBe(false);
    expect(shouldShowScoutTutorial({ ...OPEN, ...d, menuOpen: true })).toBe(false);
    expect(shouldShowScoutTutorial({ ...OPEN, ...d, popupOpen: true })).toBe(false);
  });

  // 社長決定の核心: 「見つかる前」に出すこと。発火距離が敵の視界より内側だと、
  // 説明が出る前に見つかってしまう可能性がある(=決定違反)。
  it('発火距離は敵の視界(LAB_VISION_RANGE)より必ず外側', () => {
    expect(LAB_TUTORIAL_APPROACH_PX).toBeGreaterThan(LAB_VISION_RANGE);
  });
});

describe('LAB_TUTORIAL_TEXT', () => {
  it('2件とも本文がある', () => {
    for (const id of ['phill', 'scout'] as const) {
      expect(LAB_TUTORIAL_TEXT[id].title.length).toBeGreaterThan(0);
      expect(LAB_TUTORIAL_TEXT[id].lines.length).toBeGreaterThan(0);
    }
  });

  it('PHILLの説明は「通常」と「吸い付き」の2種類に触れている(社長指示の要件)', () => {
    const body = LAB_TUTORIAL_TEXT.phill.lines.join('');
    expect(body).toContain('通常');
    expect(body).toContain('吸い付き');
  });

  it('索敵の説明は「見つかると」と「遮蔽物」に触れている(社長指示の要件)', () => {
    const body = LAB_TUTORIAL_TEXT.scout.lines.join('');
    expect(body).toContain('視界');
    expect(body).toMatch(/壁|遮蔽物/);
  });
});
