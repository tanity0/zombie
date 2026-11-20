import { describe, it, expect, beforeEach } from 'vitest';
import {
  summonAttackRel, summonAttackPose, summonLungeT,
  SUMMON_ATTACK_LEAD_MS, SUMMON_ATTACK_FOLLOW_MS,
} from './summonAttackMotion';
import { attackSheetFrames, attackImpactFrame } from './enemySheets';
import { ALCHEMY_ATTACK_INTERVAL_MS, ALCHEMY_ATTACK_RANGE, buildSummon } from './summonUtils';
import { useGameStore } from '../store/gameStore';
import { spawnEnemyAt } from './enemyUtils';
import { setTreesDisabled } from '../world/trees';

const I = ALCHEMY_ATTACK_INTERVAL_MS;
const zombie = { frames: attackSheetFrames('zombie-common'), impact: attackImpactFrame('zombie-common') };

describe('召喚の攻撃モーションの時計', () => {
  it('溜め+振り抜きが攻撃間隔に収まる(合間が負にならない)', () => {
    expect(SUMMON_ATTACK_LEAD_MS + SUMMON_ATTACK_FOLLOW_MS).toBeLessThanOrEqual(I);
  });
  it('命中の直後は振り抜き・次の命中の手前は溜め・その間は構え', () => {
    expect(summonAttackRel(10, I).rel).toBe(10);
    expect(summonAttackRel(I - 50, I).rel).toBe(-50);
    const gap = summonAttackRel(SUMMON_ATTACK_FOLLOW_MS + 1, I);
    if (SUMMON_ATTACK_FOLLOW_MS + 1 < I - SUMMON_ATTACK_LEAD_MS) expect(gap).toEqual({ rel: null, engaged: true });
    expect(summonAttackRel(I + SUMMON_ATTACK_FOLLOW_MS + 1, I)).toEqual({ rel: null, engaged: false });
    expect(summonAttackRel(-1, I).engaged).toBe(false);
  });
  it('ゾンビの噛みつきシート: 当たるコマは命中の直前に出て、命中の後は戻りのコマ', () => {
    expect(zombie.frames).toBeGreaterThan(1);
    // 命中の少し手前=当たるコマ(噛みつき)
    expect(summonAttackPose(I - 5, I, zombie)!.frame).toBe(zombie.impact);
    // 命中の直後=戻りのコマ(当たるコマより後)
    expect(summonAttackPose(5, I, zombie)!.frame).toBeGreaterThan(zombie.impact);
    // 溜めの始まり=構え(0コマ目)
    expect(summonAttackPose(I - SUMMON_ATTACK_LEAD_MS + 1, I, zombie)!.frame).toBe(0);
    // 溜めの途中は当たるコマより前
    const mid = summonAttackPose(I - SUMMON_ATTACK_LEAD_MS / 2, I, zombie)!.frame;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(zombie.impact);
    // 攻撃が途切れたら null(歩き/立ち絵へ)
    expect(summonAttackPose(I + SUMMON_ATTACK_FOLLOW_MS + 10, I, zombie)).toBeNull();
  });
  it('コマは単調に進む(溜め→噛み)', () => {
    let prev = -1;
    for (let t = I - SUMMON_ATTACK_LEAD_MS; t < I; t += 5) {
      const f = summonAttackPose(t, I, zombie)!.frame;
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });
  it('跳ぶ型(蜘蛛)は滞空のコマの間だけ浮き、命中の瞬間は接地している', () => {
    const spider = { frames: 15, impact: 10, airFrom: 4, airTo: 10 };
    let maxLift = 0;
    for (let t = I - SUMMON_ATTACK_LEAD_MS; t < I; t += 2) {
      const p = summonAttackPose(t, I, spider)!;
      if (p.lift01 > 0) { expect(p.frame).toBeGreaterThanOrEqual(4); expect(p.frame).toBeLessThan(10); }
      maxLift = Math.max(maxLift, p.lift01);
    }
    expect(maxLift).toBeGreaterThan(0.9);
    expect(summonAttackPose(1, I, spider)!.lift01).toBe(0);
  });
  it('踏み込み(自転車)は山が命中の瞬間に来る', () => {
    const lungeMs = 360, peak = 0.63;
    expect(summonLungeT(I, I, lungeMs, peak)).toBeCloseTo(peak, 5);
    expect(summonLungeT(0, I, lungeMs, peak)).toBeCloseTo(peak, 5);
    expect(summonLungeT(I - lungeMs * peak - 1, I, lungeMs, peak)).toBeNull();
  });
});

describe('召喚が間合いの敵を攻撃したら打刻する(store)', () => {
  beforeEach(() => { setTreesDisabled(true); useGameStore.getState().resetGame('warrior'); });
  for (const lvl of [1, 2, 3]) {
    it(`Lv${lvl}: 間合いの敵へ当てると lastContactAt と向きを残す / 間合いの外なら残さない`, () => {
      const p = useGameStore.getState().player;
      const summon = buildSummon(lvl, 'normal', p.x + 60, p.y);
      const scx = summon.x + summon.width / 2, scy = summon.y + summon.height / 2;
      const e = spawnEnemyAt('zombie', 0, 0, 0);
      e.x = scx + ALCHEMY_ATTACK_RANGE * 0.5 - e.width / 2; e.y = scy - e.height / 2;
      useGameStore.setState({ summons: [summon], enemies: [e] });
      useGameStore.getState().updateSummons(0.016);
      const s = useGameStore.getState().summons.find(q => q.id === summon.id)!;
      expect(s.lastContactAt).toBeDefined();
      expect(s.biteTargetX!).toBeGreaterThan(s.x + s.width / 2);

      const far = buildSummon(lvl, 'normal', p.x + 60, p.y);
      const e2 = spawnEnemyAt('zombie', 0, 0, 0);
      e2.x = far.x + far.width / 2 + ALCHEMY_ATTACK_RANGE * 4; e2.y = far.y;
      useGameStore.setState({ summons: [far], enemies: [e2] });
      useGameStore.getState().updateSummons(0.016);
      expect(useGameStore.getState().summons.find(q => q.id === far.id)!.lastContactAt).toBeUndefined();
    });
  }
});

describe('レア召喚(ハンター)の構えの進み', () => {
  it('出た瞬間は0・担ぎ上げ後は1で保つ・寿命の終わりへ向けて0へ下ろす', async () => {
    const { rareSummonRaise01 } = await import('./summonAttackMotion');
    expect(rareSummonRaise01(0, 10000, 500)).toBe(0);
    expect(rareSummonRaise01(250, 10000, 500)).toBeCloseTo(0.5);
    expect(rareSummonRaise01(3000, 7000, 500)).toBe(1);
    expect(rareSummonRaise01(9750, 250, 500)).toBeCloseTo(0.5);
    expect(rareSummonRaise01(10000, 0, 500)).toBe(0);
  });
  it('ハンターは跳びのシート(溜め区間)を持つ=攻撃の絵を引ける', async () => {
    const { jumpSheetSplit } = await import('./enemySheets');
    expect(jumpSheetSplit('hunter')?.crouch ?? 0).toBeGreaterThan(1);
  });
});
