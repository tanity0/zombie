// ボス交戦判定の不変条件(社長裁定v0.25.2412)。ここが崩れると「ボス戦なのに雑魚が湧く」
// または「ボスが居ないのに常時リラックス=ペーシング設計が丸ごと死ぬ」のどちらかになる。
import { describe, it, expect } from 'vitest';
import {
  bossEngagedNow, isEngageableBoss, BOSS_ENGAGE_EXIT_PX,
  advanceBossDisengageGrace, bossEngagementDistancePx, bossLeashDistancePx,
  isLeashableBoss, BOSS_DISENGAGE_GRACE_MS, BOSS_LEASH_PX, BOSS_LEASH_REGEN_PER_SEC,
} from './bossEngagement';

// 近く(プレイヤーは原点)に居るボスとして呼ぶ短縮形。距離のテストは最後の describe で別に行う。
const engaged = (es: Parameters<typeof bossEngagedNow>[0], prev = false) => bossEngagedNow(es, 0, 0, prev);
import type { Enemy, EnemyType } from '../types/game';

const foe = (type: EnemyType, over: Partial<Enemy> = {}): Enemy => ({
  id: `e-${type}-${over.id ?? ''}`, type, x: 0, y: 0, width: 32, height: 32,
  health: 100, maxHealth: 100, speed: 50, damage: 10, lastShot: 0, lastHit: 0,
  ...over,
} as Enemy);

describe('bossEngagement', () => {
  it('待機中(dormant)の城ボスは交戦中ではない', () => {
    // 城ボスは出現直後は城で待機する。近づく前から湧きを落としたら、到達前の道中が丸ごと緩くなる。
    expect(engaged([foe('giantbat', { dormant: true })])).toBe(false);
  });

  it('起きた城ボスは交戦中(=これが「交戦をはじめた」の信号)', () => {
    expect(engaged([foe('giantbat', { dormant: false })])).toBe(true);
    expect(engaged([foe('giantbat')])).toBe(true); // dormant 未設定=起きている
  });

  it('裏ボス・ゲート2ボス・idol も交戦中として扱う(社長裁定③「全ボスで」)', () => {
    for (const t of ['mimir', 'jormungand', 'skadi', 'thor',
      'miguel', 'jibril', 'rafi', 'uri', 'suriel', 'acrasiel', 'idol'] as EnemyType[]) {
      expect(engaged([foe(t)])).toBe(true);
    }
  });

  // ★ここが一番大事。死神は「ボス戦」ではなく深層の追跡ギミックで、居る時間が長い。
  // 対象に入れると深層の湧きが常時リラックスへ落ちてペーシング設計(§6.27)が壊れる。
  it('死神とハンターは対象外(isBossType を流用してはいけない)', () => {
    expect(isEngageableBoss('reaper')).toBe(false);
    expect(isEngageableBoss('hunter')).toBe(false);
    expect(engaged([foe('reaper'), foe('hunter')])).toBe(false);
  });

  // ★社長指摘v0.25.2416: 距離を見ないと「起きたボスが遠くに取り残されて湧きが永久にリラックス」になる。
  it('遠くへ取り残されたボスは交戦中ではない(=雑魚の湧きが通常へ戻る)', () => {
    const far = foe('giantbat', { x: bossEngagementDistancePx('giantbat', false) + 200, y: 0 });
    expect(bossEngagedNow([far], 0, 0, false)).toBe(false);
  });

  it('ヒステリシスがある(境界で毎フレーム反転しない)', () => {
    const mid = foe('giantbat', {
      x: (bossEngagementDistancePx('giantbat', false) + bossEngagementDistancePx('giantbat', true)) / 2,
      y: 0,
    });
    expect(bossEngagedNow([mid], 0, 0, false)).toBe(false); // 交戦していない状態からは入らない
    expect(bossEngagedNow([mid], 0, 0, true)).toBe(true);   // 交戦中なら少し離れても続く
    const veryFar = foe('giantbat', { x: bossEngagementDistancePx('giantbat', true) + 100, y: 0 });
    expect(bossEngagedNow([veryFar], 0, 0, true)).toBe(false); // 離れ切れば解除
  });

  it('雑魚だけの盤面は交戦中ではない', () => {
    expect(engaged([foe('zombie'), foe('bat'), foe('skeleton'), foe('plant')])).toBe(false);
    expect(engaged([])).toBe(false);
  });

  it('雑魚に混ざっていてもボスが1体起きていれば交戦中', () => {
    expect(engaged([foe('zombie'), foe('thor'), foe('bat')])).toBe(true);
  });
});

// リーシュ(社長裁定v0.25.2418)。ここが崩れると「ワープが戻る」か「離れて一方的に削れる」。
describe('リーシュ', () => {
  it('待機へ戻すのはフィールドの城ボスだけ(裏ボス/ゲート2は専用コントローラ or 囲い戦なので対象外)', () => {
    expect(isLeashableBoss('giantbat')).toBe(true);
    for (const t of ['mimir', 'thor', 'miguel', 'uri', 'idol', 'reaper', 'zombie'] as EnemyType[]) {
      expect(isLeashableBoss(t)).toBe(false);
    }
  });

  // ★順序が逆だと「待機に戻ったのに交戦中のまま=湧きがリラックスのまま」が一瞬起きる。
  it('リーシュ距離は交戦解除距離より外(解除→待機、の順になる)', () => {
    expect(BOSS_LEASH_PX).toBeGreaterThan(BOSS_ENGAGE_EXIT_PX);
    expect(bossLeashDistancePx('giantbat')).toBeGreaterThan(bossEngagementDistancePx('giantbat', true));
  });

  it('回復は裏ボスと同値(新しい数字を発明しない)', () => {
    expect(BOSS_LEASH_REGEN_PER_SEC).toBe(10); // useGameLoop の BOSS_REGEN_PER_SEC と同値
  });
});

describe('ズーム連動と離脱予兆', () => {
  it('引きが深い巨大ボスほど交戦・離脱のワールド範囲が広い', () => {
    // v0.25.2947: 遠距離ズームの深化(giant 0.58→0.40 / standard 0.62→0.44)に画面px基準で追随する。
    expect(bossEngagementDistancePx('jormungand', true)).toBeCloseTo(BOSS_ENGAGE_EXIT_PX / 0.40, 6);
    expect(bossEngagementDistancePx('jormungand', true)).toBeGreaterThan(bossEngagementDistancePx('miguel', true));
    expect(bossLeashDistancePx('giantbat')).toBeCloseTo(BOSS_LEASH_PX / 0.44, 6);
  });

  it('範囲外が猶予(BOSS_DISENGAGE_GRACE_MS)続いた時だけ離脱し、戻れば即キャンセルする', () => {
    const start = advanceBossDisengageGrace(true, undefined, 1000);
    expect(start).toEqual({ since: 1000, ready: false, started: true });
    expect(advanceBossDisengageGrace(true, start.since, 1000 + BOSS_DISENGAGE_GRACE_MS - 1).ready).toBe(false);
    expect(advanceBossDisengageGrace(true, start.since, 1000 + BOSS_DISENGAGE_GRACE_MS).ready).toBe(true);
    expect(advanceBossDisengageGrace(false, start.since, 2000)).toEqual({ since: undefined, ready: false, started: false });
  });
});

// v0.25.3018(社長裁定・案A): 帰巣の圏内判定=プレイヤー中心の一律距離。
import { bossRetreatKeepRadiusPx, BOSS_RETREAT_KEEP_MARGIN_PX } from './bossEngagement';
import { ZOOM_MIN_ABS } from './cameraZoom';

describe('bossRetreatKeepRadiusPx — プレイヤー中心の一律撤退距離(案A)', () => {
  const vp = { width: 430, height: 930 };
  it('等倍: 画面長辺の半分+余白', () => {
    expect(bossRetreatKeepRadiusPx(vp, 1)).toBeCloseTo(930 / 2 + BOSS_RETREAT_KEEP_MARGIN_PX, 6);
  });
  it('引きズームで1/z拡大・最深(ZOOM_MIN_ABS)で頭打ち', () => {
    const base = 930 / 2 + BOSS_RETREAT_KEEP_MARGIN_PX;
    expect(bossRetreatKeepRadiusPx(vp, 0.5)).toBeCloseTo(base / 0.5, 6);
    expect(bossRetreatKeepRadiusPx(vp, 0.1)).toBeCloseTo(base / ZOOM_MIN_ABS, 6);
    expect(bossRetreatKeepRadiusPx(vp, 1.4)).toBeCloseTo(base, 6); // 寄りでは縮めない
  });
  it('横長画面でも長辺基準(縦横で距離感が変わらない)', () => {
    expect(bossRetreatKeepRadiusPx({ width: 930, height: 430 }, 1))
      .toBeCloseTo(bossRetreatKeepRadiusPx(vp, 1), 6);
  });
});
