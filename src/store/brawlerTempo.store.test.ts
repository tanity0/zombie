// ★格闘のテンポ係数(research/BRAWLER.md §9-68・社長承認2026-11-08「KOFみたいなプレイフィールが欲しいんだけど、少し全体的に早い?」)。
// 係数1.0で今までの値と一致・係数1.3で各時間が1.3倍・当てた瞬間の止めの表・飛び蹴り3発目の溜め・係数1.3でも秘奥義が成立・
// 反撃の予告と当たりの時刻の一致を、純関数と実際のストアで固める。
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { useGameStore } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import {
  BRAWLER_STAGES_BASE, BRAWLER_TECHS_BASE, BRAWLER_HITSTOP, BRAWLER_TEMPO_DEFAULT, brawlerTimesAt, brawlerTempoMs,
  BRAWLER_STAGES, BRAWLER_TECHS, BRAWLER_KICK_HITSTOP_MS, BRAWLER_STOMP_HITSTOP_MS, BRAWLER_SECRET_LAND_HITSTOP_MS,
  BRAWLER_KICK_MAX, brawlerPoseAt, brawlerKickChargeGlow, brawlerStartTech, initialBrawlerState, brawlerKickFlightMs,
} from '../utils/brawler';
import * as BRW from '../utils/brawler';
import {
  brawlerComboTimesAt, BRAWLER_HOLD_BASE_MS_BASE, setBrawlerTempoAll, brawlerRevengeStartPatch, brawlerRevengeTelegraph, brawlerRevengeDue,
} from '../utils/brawlerCombo';
import * as BRC from '../utils/brawlerCombo';

const NO_INPUT = { up: false, down: false, left: false, right: false } as never;
let now = 5_000_000;
const advance = (ms: number) => {
  const end = now + ms;
  while (now < end) {
    now += 10;
    useGameStore.setState(st => ({ gameTime: st.gameTime + 10 }));
    useGameStore.getState().movePlayer(NO_INPUT, 0.01);
    useGameStore.getState().tickBrawler();
  }
};
const br = () => useGameStore.getState().player.brawler!;
const setup = () => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
    player: { ...st.player, health: 9999, maxHealth: 9999, invulnerable: false, subWeapons: ['brawler'], subWeaponLevels: { brawler: 3 }, lastDirection: { x: 1, y: 0 } },
  }));
};
const zombieAt = (dx: number, dy: number, id: string) => {
  const p = useGameStore.getState().player;
  const e = spawnEnemyAt('zombie', 0, 0, useGameStore.getState().gameTime);
  e.x = p.x + p.width / 2 + dx - e.width / 2; e.y = p.y + p.height / 2 + dy - e.height / 2; e.health = 99999; e.maxHealth = 99999; e.id = id;
  return e;
};

beforeEach(() => {
  now = 5_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});
afterEach(() => { vi.restoreAllMocks(); });
afterAll(() => { setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT); });

describe('テンポ係数の表(純関数)', () => {
  it('既定は1.3(?brtempo= の無いテスト環境=既定)', () => {
    expect(BRAWLER_TEMPO_DEFAULT).toBe(1.3);
    expect(BRW.BRAWLER_TEMPO).toBe(1.3);
  });
  it('係数1.0 = 今までの値(段・技・つながり・先行入力・5段目・蹴り・秘奥義・ステップ・固まり・反撃)', () => {
    const v = brawlerTimesAt(1.0);
    expect(v.stages.map(s => [s.windupMs, s.recoveryMs])).toEqual([[60, 140], [60, 140], [120, 230], [250, 200], [230, 270]]);
    expect(Object.values(v.techs).map(t => [t.windupMs, t.recoveryMs])).toEqual([[0, 1000], [200, 400], [120, 330], [120, 150]]);
    expect([v.BRAWLER_CHAIN_RESET_MS, v.BRAWLER_WHIFF_BUFFER_MS, v.BRAWLER_PALM_DASH_MS, v.BRAWLER_PALM_SETTLE_MS, v.BRAWLER_LIFT_MS,
      v.BRAWLER_KICK_FLIGHT_MAX_MS, v.BRAWLER_KICK_CHAIN_MS, v.BRAWLER_GUARD_MS, v.BRAWLER_GUARD_QUICK_MS, v.BRAWLER_SUPER_FLASH_MS,
      v.BRAWLER_SECRET_GAP_MS, v.BRAWLER_SECRET_IGNITE_MS, v.BRAWLER_SECRET_STRIKE_MS, v.BRAWLER_SECRET_FALL_MS, v.BRAWLER_SECRET_LAND_MS, v.BRAWLER_STEP_MS])
      .toEqual([400, 150, 130, 120, 585, 150, 500, 1000, 500, 100, 400, 600, 170, 420, 520, 180]);
    const c = brawlerComboTimesAt(1.0);
    expect(c.holdBase).toEqual(BRAWLER_HOLD_BASE_MS_BASE);
    expect([c.BRAWLER_COMBO_GAP_MS, c.BRAWLER_COMBO_DECAY_MS, c.BRAWLER_SAME_MOVE_PENALTY_MS, c.BRAWLER_REVENGE_WINDUP_MS, c.BRAWLER_REVENGE_NO_HOLD_MS, c.BRAWLER_JUGGLE_MIN_MS, c.BRAWLER_JUGGLE_DROP_MS])
      .toEqual([700, 3000, 400, 350, 1200, 140, 200]); // 流れの切れは社長承認2026-11-09 で 600→700
  });
  it('係数1.3 = 各時間の1.3倍(四捨五入)。距離・倍率・ポイントは変えない', () => {
    const v = brawlerTimesAt(1.3);
    v.stages.forEach((s, i) => {
      expect(s.windupMs).toBe(Math.round(BRAWLER_STAGES_BASE[i].windupMs * 1.3));
      expect(s.recoveryMs).toBe(Math.round(BRAWLER_STAGES_BASE[i].recoveryMs * 1.3));
      expect([s.mult, s.dashPx, s.kb, s.shape, s.hitstopMs]).toEqual([BRAWLER_STAGES_BASE[i].mult, BRAWLER_STAGES_BASE[i].dashPx, BRAWLER_STAGES_BASE[i].kb, BRAWLER_STAGES_BASE[i].shape, BRAWLER_STAGES_BASE[i].hitstopMs]);
    });
    for (const k of ['guard', 'stomp', 'kiko', 'kick'] as const) {
      expect(v.techs[k].windupMs).toBe(Math.round(BRAWLER_TECHS_BASE[k].windupMs * 1.3));
      expect(v.techs[k].recoveryMs).toBe(Math.round(BRAWLER_TECHS_BASE[k].recoveryMs * 1.3));
      expect(v.techs[k].cost).toBe(BRAWLER_TECHS_BASE[k].cost);
    }
    expect(v.BRAWLER_CHAIN_RESET_MS).toBe(520);
    expect(v.BRAWLER_SECRET_GAP_MS).toBe(520);
    expect(v.BRAWLER_STEP_MS).toBe(234);
    expect(v.BRAWLER_KICK3_CHARGE_MS).toBe(150); // 実時間で約150ms
    const c = brawlerComboTimesAt(1.3);
    expect(c.BRAWLER_REVENGE_WINDUP_MS).toBe(455);
    expect(c.holdBase.s1).toBe(390);
    expect(brawlerTempoMs(585, 1.3)).toBe(761);
  });
  it('当てた瞬間の止めは係数を掛けない別の表: 弱90 / 強・技150 / 締め220', () => {
    expect(BRAWLER_HITSTOP).toEqual({ weak: 90, strong: 150, closer: 220 });
    expect(BRAWLER_STAGES.map(s => s.hitstopMs)).toEqual([90, 90, 150, 150, 220]);
    expect([...BRAWLER_KICK_HITSTOP_MS]).toEqual([0, 150, 150, 220]);
    expect([BRAWLER_STOMP_HITSTOP_MS, BRAWLER_SECRET_LAND_HITSTOP_MS]).toEqual([220, 220]);
    expect(brawlerTimesAt(1.0).stages.map(s => s.hitstopMs)).toEqual(brawlerTimesAt(1.3).stages.map(s => s.hitstopMs));
  });
  it('setBrawlerTempoAll で全部の欄が書き直る(live binding)', () => {
    setBrawlerTempoAll(1.0);
    expect(BRW.BRAWLER_STAGES[0].windupMs).toBe(60);
    expect(BRC.BRAWLER_REVENGE_WINDUP_MS).toBe(350);
    setBrawlerTempoAll(1.3);
    expect(BRW.BRAWLER_STAGES[0].windupMs).toBe(78);
    expect(BRC.BRAWLER_REVENGE_WINDUP_MS).toBe(455);
    expect(BRC.BRAWLER_HOLD_BASE_MS.s3).toBe(585);
    expect(BRW.BRAWLER_FLOW_GRACE_MS).toBe(BRW.BRAWLER_CHAIN_RESET_MS);
  });
});

describe('飛び蹴りの3発目の溜め(社長承認2026-11-08「飛び蹴りの3発目も少し溜めてから蹴る」)', () => {
  it('3発目だけ前隙の頭に溜め(係数1.3で150ms)。溜めの間は空中で沈みながら光り、明けたら飛ぶ', () => {
    setBrawlerTempoAll(1.3);
    const s1 = brawlerStartTech(initialBrawlerState(), 'kick', 0, 1);
    expect(s1.kickChargeMs).toBe(0);
    const s3 = brawlerStartTech(initialBrawlerState(), 'kick', 0, BRAWLER_KICK_MAX);
    expect(s3.kickChargeMs).toBe(150);
    expect(s3.windupMs).toBe(150 + BRAWLER_TECHS.kick.windupMs);
    // 溜めの間: 空中(跳び上がって沈む)・光が強まる
    const hMid = brawlerPoseAt(s3, 60)!.jump, hEnd = brawlerPoseAt(s3, 149)!.jump;
    expect(brawlerPoseAt(s3, 0)!.jump).toBe(0);
    expect(hMid).toBeGreaterThan(15);
    expect(hEnd).toBeLessThan(hMid); // 沈む
    expect(brawlerKickChargeGlow(s3, 140)).toBeGreaterThan(brawlerKickChargeGlow(s3, 20));
    // つなぎ目で高さが跳ばない
    expect(Math.abs(brawlerPoseAt(s3, 151)!.jump - brawlerPoseAt(s3, 149)!.jump)).toBeLessThan(2);
    expect(brawlerKickChargeGlow(s1, 50)).toBe(0);
  });
  it('ストア: 3発目は溜めの間その場に留まり、明けてから飛ぶ(判定は溜め+飛ぶ時間の後)', () => {
    setBrawlerTempoAll(1.3);
    setup();
    useGameStore.setState(st => ({ enemies: [zombieAt(200, 0, 'z')], player: { ...st.player, brawler: { ...br(), points: 20 } } }));
    for (let n = 1; n <= 2; n++) {
      expect(useGameStore.getState().brawlerTech(1, 0)).toBe(true);
      for (let k = 0; k < 200 && br().phase !== 'idle'; k++) advance(10);
      useGameStore.setState(st => ({ enemies: [zombieAt(200, 0, 'z')], player: { ...st.player } }));
    }
    const x0 = useGameStore.getState().player.x;
    expect(useGameStore.getState().brawlerTech(1, 0)).toBe(true);
    expect(br().kickN).toBe(3);
    expect(br().kickChargeMs).toBe(150);
    advance(140);
    expect(Math.abs(useGameStore.getState().player.x - x0)).toBeLessThan(1); // 溜めの間は飛ばない
    expect(br().resolved).toBe(false);
    for (let k = 0; k < 60 && !br().resolved; k++) advance(10);
    expect(useGameStore.getState().player.x - x0).toBeGreaterThan(60); // 明けてから飛んだ
    expect(br().windupMs).toBeGreaterThanOrEqual(150 + brawlerKickFlightMs(0)); // 前隙=溜め+飛ぶ時間(飛ぶ時間は距離で 156〜195)
  });
});

describe('係数1.3でも秘奥義が成立する(→↓←↑ の先行入力・0.26秒程度の間隔)', () => {
  const prep = () => {
    setup();
    useGameStore.getState().brawlerPress(); advance(600);
    useGameStore.setState(st => {
      const p = st.player;
      return {
        enemies: [zombieAt(120, 0, 'a'), zombieAt(-90, 30, 'b')], viewZoom: 1,
        camera: { x: p.x + p.width / 2 - st.gameBounds.width / 2, y: p.y + p.height / 2 - st.gameBounds.height / 2 },
        player: { ...p, brawler: { ...p.brawler!, points: 20, nextStage: 1, chainUntil: 0, secretProgress: 0, secretLastEndAt: 0 } },
      };
    });
  };
  const flickAll = (gap: number) => {
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) { useGameStore.getState().brawlerTech(dx, dy); advance(gap); }
    let secret = !!br().secret;
    for (let i = 0; i < 200 && !secret; i++) { advance(10); secret = !!br().secret; }
    return secret;
  };
  // 実測の境目: 260ms では成立せず 270ms から成立(締めの止め 220ms が大踏み潰しの取り消しを遅らせる分・係数1.0の旧値 200ms の1.3倍=260 より 10ms 長い)。
  it('間 260ms では成立しない(境目の記録)', () => {
    setBrawlerTempoAll(1.3);
    prep();
    expect(flickAll(260)).toBe(false);
  });
  it.each([270, 300, 400, 600])('間 %ims で成立', (gap) => {
    setBrawlerTempoAll(1.3);
    prep();
    expect(flickAll(gap)).toBe(true);
  });
});

describe('反撃の予告と当たり(★★赤い予告の4つの掟)は係数1.3でも一致する', () => {
  it('出る=溜めの開始 / 消え切る=当たる(455ms)', () => {
    setBrawlerTempoAll(1.3);
    const start = 10_000;
    const st = brawlerRevengeStartPatch(start);
    expect(st.aiPhaseUntil).toBe(start + 455);
    expect(brawlerRevengeTelegraph(start, st.aiPhaseUntil, start).visible).toBe(true);
    expect(brawlerRevengeTelegraph(start, st.aiPhaseUntil, st.aiPhaseUntil - 1).visible).toBe(true);
    expect(brawlerRevengeTelegraph(start, st.aiPhaseUntil, st.aiPhaseUntil).er).toBe(1);
    expect(brawlerRevengeDue(st, st.aiPhaseUntil)).toBe(true);
    expect(brawlerRevengeDue(st, st.aiPhaseUntil - 1)).toBe(false);
  });
});
