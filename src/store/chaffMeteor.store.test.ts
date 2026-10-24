// ★社長指示2026-10-23「ゾンビとスケルトンの技、流星予告入れたい」の配線テスト(実装精度の規律4)。
// 純関数(biteTelegraph.test.ts)は「時刻の式」を固定する。ここは状態機械(updateEnemies)と判定の解決
// (applyContactDamage)を本物の順(setGameTime → updateEnemies → applyContactDamage)で回し、
// ★赤い予告の掟②「出る=溜めの頭」/③「消え切る=当たる」が**実際の状態の流れ**で成り立つことを確かめる。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { applyContactDamage, NOOP_COMBAT_EFFECTS } from '../utils/combatTick';
import { biteTelegraphLine, preBiteTelegraphLine, type BiteTelegraphLine } from '../utils/biteTelegraph';
import { ZOMBIE_STEP_REACH_PX } from '../utils/chaffMoves';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import type { Enemy, EnemyType } from '../types/game';

const ORIGIN = 50_000;
const START_GT = 10_000_000;
const FRAME = 16;

const place = (type: EnemyType, dist: number, over: Partial<Enemy> = {}): void => {
  const e = { ...spawnEnemyAt(type, 0, 0, START_GT), ...over };
  e.x = ORIGIN + dist - e.width / 2;
  e.y = ORIGIN - e.height / 2;
  useGameStore.setState(s => ({
    enemies: [e],
    gameTime: START_GT,
    player: {
      ...s.player,
      x: ORIGIN - s.player.width / 2, y: ORIGIN - s.player.height / 2,
      health: 99999, maxHealth: 99999, invulnerable: false, invulnerableTime: 0, grabbedUntil: undefined,
    },
  }));
};

const frame = (gt: number) => {
  useGameStore.getState().setGameTime(gt);
  useGameStore.getState().updateEnemies(FRAME / 1000);
  applyContactDamage(gt, false, 0, NOOP_COMBAT_EFFECTS);
};

const first = (): Enemy => useGameStore.getState().enemies[0];
const aim = { x: ORIGIN, y: ORIGIN };
/** 描画が引くのと同じ順(噛みの線 → 溜めの線)。 */
const meteorOf = (e: Enemy, gt: number): BiteTelegraphLine | null => biteTelegraphLine(e, gt) ?? preBiteTelegraphLine(e, gt, aim);

beforeEach(() => {
  setTreesDisabled(true); setTorchesDisabled(true);
  useGameStore.getState().resetGame('assault');
});

/**
 * 溜めの頭から命中まで毎フレーム回し、①溜めに入ったフレームで線が出て startAt=そのフレーム
 * ②命中(判定の解決)まで1フレームも欠けない ③解決したフレームで消えている ④解決の時刻=線の hitAt
 * (フレームの刻みぶん以内)を確かめる。
 */
const runUntilResolve = (isStart: (e: Enemy) => boolean, limitMs: number) => {
  let startGt = -1;
  let lastLine: BiteTelegraphLine | null = null;
  let gaps = 0;
  let fired = false;
  for (let gt = START_GT; gt <= START_GT + limitMs; gt += FRAME) {
    frame(gt);
    const e = first();
    if (startGt < 0) {
      if (!isStart(e)) continue;
      startGt = gt;
    }
    // 解決=噛みが立った後に biteAt が0へ戻ったフレーム(combatTick の isBiteResolveDue=判定の瞬間)。
    const biting = e.biteAt !== undefined && e.biteAt > 0;
    if (biting) fired = true;
    if (fired && !biting) return { startGt, resolveGt: gt, lastLine, lineAtResolve: meteorOf(e, gt), gaps };
    const l = meteorOf(e, gt);
    if (!l) gaps++;
    else {
      if (lastLine === null) expect(l.startAt).toBe(startGt);   // 出る=溜めの頭(1フレーム目から)
      lastLine = l;
    }
  }
  throw new Error('命中まで届かなかった');
};

describe('ゾンビ2連(赤): 構えの頭で出て、1発目の命中で消え切る / 2発目はよろけ(=2発目の溜め)の頭から', () => {
  it('1発目', () => {
    place('zombie', ZOMBIE_STEP_REACH_PX - 3, { aiPhase: 'z-wait', aiPhaseUntil: START_GT + 5000 });
    const r = runUntilResolve(e => e.aiPhase === 'z-red-pause', 3000);
    expect(r.gaps).toBe(0);
    expect(r.lastLine).not.toBeNull();
    expect(r.lastLine!.counterable).toBe(true);
    expect(r.lastLine!.startAt).toBe(r.startGt);
    expect(r.lineAtResolve).toBeNull();
    // 解決は hitAt(=焼かれた biteAt + 溜め + 噛み)以後の最初のフレーム(刻み16ms)。
    expect(r.resolveGt).toBeGreaterThanOrEqual(r.lastLine!.hitAt);
    expect(r.resolveGt - r.lastLine!.hitAt).toBeLessThan(FRAME);
    // 最後に描いたフレームの流れはまだ消え切っていない(=消え切る前に当たらない)。
    expect(r.lastLine!.prog).toBeLessThan(1);
  });

  it('2発目', () => {
    place('zombie', ZOMBIE_STEP_REACH_PX - 3, { aiPhase: 'z-wait', aiPhaseUntil: START_GT + 5000 });
    const r = runUntilResolve(e => e.aiPhase === 'z-stagger', 5000);
    expect(r.gaps).toBe(0);
    expect(r.lastLine!.emphasis).toBeGreaterThan(1);           // 2発目は強調(まだ終わっていない)
    // 2発目はよろけの頭から(1発目の窓と混ぜない)。噛み2では「発火−よろけの尺」から引き直すので、
    // よろけ明けが1フレーム遅れたぶん(≦16ms)だけ後ろへずれる。
    expect(r.lastLine!.startAt - r.startGt).toBeGreaterThanOrEqual(0);
    expect(r.lastLine!.startAt - r.startGt).toBeLessThan(FRAME);
    expect(r.lineAtResolve).toBeNull();
    expect(r.resolveGt).toBeGreaterThanOrEqual(r.lastLine!.hitAt);
    expect(r.resolveGt - r.lastLine!.hitAt).toBeLessThan(FRAME);
  });
});

describe('スケルトンの噛み(赤): しゃがみは線なし・回り込みの頭で出て、噛みの命中で消え切る', () => {
  it('s-crouch(線なし)→ s-arc → s-bite', () => {
    place('skeleton', 80);
    // しゃがみの間は1フレームも線が出ない(色なし=形で読む)。
    for (let gt = START_GT; gt <= START_GT + 2000; gt += FRAME) {
      frame(gt);
      const e = first();
      if (e.aiPhase === 's-arc') break;
      expect(meteorOf(e, gt), `t=${gt - START_GT}`).toBeNull();
    }
    place('skeleton', 80);
    const r = runUntilResolve(e => e.aiPhase === 's-arc', 4000);
    expect(r.gaps).toBe(0);
    expect(r.lastLine!.counterable).toBe(true);
    expect(r.lastLine!.startAt).toBe(r.startGt);                // 出る=回り込みの頭(chaffMoveAt)
    expect(r.lineAtResolve).toBeNull();
    // 消え切る=当たる: 噛みの線の hitAt は焼かれた biteAt から=解決は hitAt 以後の最初のフレーム。
    expect(r.resolveGt).toBeGreaterThanOrEqual(r.lastLine!.hitAt);
    expect(r.resolveGt - r.lastLine!.hitAt).toBeLessThan(FRAME);
  });
});

describe('★ゾンビ1発目は構えの頭の向きで噛む(社長「推薦で」2026-10-23)・裏/横へ回れば当たらない', () => {
  /**
   * 構えに入った瞬間(向き=左=プレイヤーの方)の敵の中心を基準に、プレイヤーを (rx, ry) へ置き直して
   * 1発目が解決するまで回す。返り値=1発目で受けたダメージ。
   */
  const firstBiteDamageAt = (rx: number, ry: number): number => {
    place('zombie', ZOMBIE_STEP_REACH_PX - 3, { aiPhase: 'z-wait', aiPhaseUntil: START_GT + 5000 });
    frame(START_GT);
    const e0 = first();
    expect(e0.aiPhase).toBe('z-red-pause');
    expect(e0.stanceDirX).toBeCloseTo(-1, 5);
    const ecx = e0.x + e0.width / 2, ecy = e0.y + e0.height / 2;
    useGameStore.setState(s => ({
      player: { ...s.player, x: ecx + rx - s.player.width / 2, y: ecy + ry - s.player.height / 2 },
    }));
    const hp0 = useGameStore.getState().player.health;
    let fired = false;
    for (let gt = START_GT + FRAME; gt <= START_GT + 3000; gt += FRAME) {
      frame(gt);
      const e = first();
      const biting = e.biteAt !== undefined && e.biteAt > 0;
      if (biting) fired = true;
      if (fired && !biting) return hp0 - useGameStore.getState().player.health;
    }
    throw new Error('1発目が解決しなかった');
  };
  it('線の先(前方)に居れば当たる', () => {
    expect(firstBiteDamageAt(-60, 0)).toBeGreaterThan(0);
    expect(firstBiteDamageAt(-40, 0)).toBeGreaterThan(0);
    expect(firstBiteDamageAt(-90, 0)).toBeGreaterThan(0);
  });
  it('真裏(36px以内を含む)に回れば当たらない', () => {
    for (const rx of [20, 36, 60]) expect(firstBiteDamageAt(rx, 0), `rx=${rx}`).toBe(0);
  });
  it('斜め後ろに回れば当たらない', () => {
    for (const [rx, ry] of [[30, 30], [30, -30], [45, 45], [45, -45]]) expect(firstBiteDamageAt(rx, ry), `(${rx},${ry})`).toBe(0);
  });
  it('真横(75〜95px)に回れば当たらない', () => {
    for (const ry of [75, 85, 95, -75, -85, -95]) expect(firstBiteDamageAt(0, ry), `ry=${ry}`).toBe(0);
  });
});
