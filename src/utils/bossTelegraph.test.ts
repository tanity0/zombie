import { describe, it, expect } from 'vitest';
import {
  PLAYER_WALK_PX_PER_SEC, PLAYER_ATTACK_CYCLE_MS, BOSS_RECOVER_FLOOR_MS, BOSS_STRING_REST_MS,
  minWindupMs, withRecoverFloor, telegraphProgress01, AOE_TELEGRAPH_AUDIT,
  MELEE_REACH_PX, meleeStandDistPx,
} from './bossTelegraph';
import { PLAYER_BASE_SPEED, COUNTER_WINDOW, COUNTER_COOLDOWN, MELEE_RADIUS } from '../store/gameStore';
import { GAME_SPEED } from '../config/gameSpeed';

describe('bossTelegraph: 基準系の複製がズレていないこと', () => {
  // このレイヤはstore非依存を保つため値を複製している。ここが唯一の同期装置。
  it('PLAYER_WALK_PX_PER_SEC = PLAYER_BASE_SPEED × GAME_SPEED', () => {
    expect(PLAYER_WALK_PX_PER_SEC).toBeCloseTo(PLAYER_BASE_SPEED * GAME_SPEED, 5);
  });
  it('PLAYER_ATTACK_CYCLE_MS = COUNTER_WINDOW + COUNTER_COOLDOWN', () => {
    expect(PLAYER_ATTACK_CYCLE_MS).toBe(COUNTER_WINDOW + COUNTER_COOLDOWN);
  });
  it('硬直の床はプレイヤーの1攻撃サイクルより長い(=1発は必ず入る)', () => {
    expect(BOSS_RECOVER_FLOOR_MS).toBeGreaterThan(PLAYER_ATTACK_CYCLE_MS);
  });
  it('休符(2発)は1発ぶんの床の2倍近い', () => {
    expect(BOSS_STRING_REST_MS).toBeGreaterThanOrEqual(PLAYER_ATTACK_CYCLE_MS * 2);
  });
});

describe('minWindupMs(換算式②)', () => {
  it('半径0なら0ms', () => expect(minWindupMs(0)).toBe(0));
  it('半径92px(GRENADE_BLAST_RADIUS流用の定番)は約881ms', () => {
    expect(minWindupMs(92)).toBeGreaterThan(880);
    expect(minWindupMs(92)).toBeLessThan(882);
  });
  it('半径140pxは約1341ms', () => {
    expect(Math.round(minWindupMs(140))).toBe(1341);
  });
  it('単調増加(半径が広いほど長い予告が要る)', () => {
    expect(minWindupMs(50)).toBeLessThan(minWindupMs(51));
  });
  it('予告時間ぶん歩けば必ず半径ぶん進める(定義の逆算)', () => {
    for (const r of [10, 70, 92, 140, 300]) {
      expect((minWindupMs(r) / 1000) * PLAYER_WALK_PX_PER_SEC).toBeCloseTo(r, 6);
    }
  });

  // ★起点(社長指示v0.25.3465「プレイヤーの近距離攻撃が、敵の当たり判定の端っこに届く距離の
  //   ギリギリを起点に考えて」)。足元系AoEは、その立ち位置から外へ出る距離だけで測る。
  describe('起点=近接がギリギリ届く立ち位置', () => {
    it('MELEE_REACH_PX は gameStore の MELEE_RADIUS と同値(複製のズレ検知)', () => {
      expect(MELEE_REACH_PX).toBe(MELEE_RADIUS);
    });
    it('起点 = 敵の当たり判定の半分 + 近接リーチ', () => {
      expect(meleeStandDistPx(22)).toBe(22 + MELEE_REACH_PX);
    });
    it('起点を渡すと、その分だけ必要msが短くなる', () => {
      const stand = meleeStandDistPx(12);       // 例: 賞金首の帯の半分(小さい方の軸)
      expect(minWindupMs(194, stand)).toBeCloseTo(((194 - stand) / PLAYER_WALK_PX_PER_SEC) * 1000, 6);
      expect(minWindupMs(194, stand)).toBeLessThan(minWindupMs(194));
    });
    it('起点より内側に収まる円は「歩かなくても外に居る」=0ms', () => {
      expect(minWindupMs(50, meleeStandDistPx(22))).toBe(0);
    });
    it('起点を渡さなければ従来どおり(プレイヤーが中心に居る技=着地円など)', () => {
      expect(minWindupMs(114)).toBeCloseTo((114 / PLAYER_WALK_PX_PER_SEC) * 1000, 6);
    });
  });
});

describe('withRecoverFloor(換算式③)', () => {
  it('床未満は床へ持ち上げる', () => {
    expect(withRecoverFloor(300)).toBe(BOSS_RECOVER_FLOOR_MS);
    expect(withRecoverFloor(500)).toBe(BOSS_RECOVER_FLOOR_MS);
    expect(withRecoverFloor(899)).toBe(BOSS_RECOVER_FLOOR_MS);
  });
  it('床以上はそのまま(長い硬直を勝手に縮めない)', () => {
    expect(withRecoverFloor(900)).toBe(900);
    expect(withRecoverFloor(1700)).toBe(1700);
  });
});

describe('AOE_TELEGRAPH_AUDIT: 自己中心AoEの予告が換算式②を満たすこと', () => {
  it('免除指定の無い技はすべて「見てから歩いて避けられる」', () => {
    const violations = AOE_TELEGRAPH_AUDIT
      .filter(e => e.intentionallyUnavoidable === undefined)
      .filter(e => e.escapeMs < minWindupMs(e.radiusPx, e.standDistPx ?? 0))
      .map(e => `${e.name}: escape=${e.escapeMs}ms < 必要${Math.ceil(minWindupMs(e.radiusPx, e.standDistPx ?? 0))}ms`);
    expect(violations).toEqual([]);
  });
  it('免除指定がある技には必ず理由が書いてある(空文字で黙らせない)', () => {
    for (const e of AOE_TELEGRAPH_AUDIT) {
      if (e.intentionallyUnavoidable !== undefined) {
        expect(e.intentionallyUnavoidable.length).toBeGreaterThan(20);
      }
    }
  });
  it('免除指定は「本当に下限未満」の技にだけ付ける(合格した技に免除を残さない)', () => {
    for (const e of AOE_TELEGRAPH_AUDIT) {
      if (e.intentionallyUnavoidable !== undefined) {
        expect(e.escapeMs, e.name).toBeLessThan(minWindupMs(e.radiusPx, e.standDistPx ?? 0));
      }
    }
  });
});

describe('telegraphProgress01(★未決の予告メーター演出の土台)', () => {
  it('開始で0・終了で1・中間で線形', () => {
    expect(telegraphProgress01(1000, 1000, 2000)).toBe(0);
    expect(telegraphProgress01(1500, 1000, 2000)).toBeCloseTo(0.5, 6);
    expect(telegraphProgress01(2000, 1000, 2000)).toBe(1);
  });
  it('範囲外はクランプ(描画が壊れない)', () => {
    expect(telegraphProgress01(500, 1000, 2000)).toBe(0);
    expect(telegraphProgress01(9999, 1000, 2000)).toBe(1);
  });
  it('未設定・逆順は0(安全側)', () => {
    expect(telegraphProgress01(1500, undefined, 2000)).toBe(0);
    expect(telegraphProgress01(1500, 1000, undefined)).toBe(0);
    expect(telegraphProgress01(1500, 2000, 1000)).toBe(0);
  });
});
