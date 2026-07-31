import { describe, it, expect } from 'vitest';
import {
  idolMoveEligible, idolPhaseForHealth, idolFanCount, idolZone, idolOrbCount, idolWaveActive,
  IDOL_ALL_MOVES, IDOL_STRINGS, IDOL_STRING_LEN, IDOL_REST, IDOL_TIMING, IDOL_NEUTRAL_BAND,
  IDOL_ZONE_EDGES, IDOL_FAIRNESS_P1, IDOL_FAIRNESS_P2, IDOL_WAVE_MOVES, IDOL_WAVE_DELAY_MS,
  IDOL_ROLL_DIST, IDOL_PUNISH, type IdolMove,
} from './idolScript';
import { fairnessViolations, classMix, pickStringScript, stringMaxLen, type BossZone } from './bossSkeleton';
import { PLAYER_ATTACK_CYCLE_MS } from './bossTelegraph';

const ZONES: BossZone[] = ['melee', 'near', 'mid', 'far'];
const allReady = (): Record<IdolMove, boolean> =>
  ({ aim: true, fan: true, roll: true, punch: true, snipe: true, orb: true });

describe('idolPhaseForHealth / idolFanCount(§6.28-20の確定値・不変)', () => {
  it('HP50%でPhase2', () => {
    expect(idolPhaseForHealth(1)).toBe(1);
    expect(idolPhaseForHealth(0.51)).toBe(1);
    expect(idolPhaseForHealth(0.5)).toBe(2);
  });
  it('扇は3→5本', () => {
    expect(idolFanCount(1)).toBe(3);
    expect(idolFanCount(2)).toBe(5);
  });
});

// ==== 社長要件: 技は最低5パターン(§2-6は6本を下限) ====
describe('技の本数と帯', () => {
  it('技は6本ある(社長要件の最低5を満たす)', () => {
    expect(IDOL_ALL_MOVES).toHaveLength(6);
    expect([...IDOL_ALL_MOVES].sort()).toEqual(['aim', 'fan', 'orb', 'punch', 'roll', 'snipe']);
  });
  it('帯は§6.28-20の確定値(140/340)を維持している', () => {
    expect(IDOL_ZONE_EDGES.meleeMax).toBe(140);
    expect(IDOL_ZONE_EDGES.nearMax).toBe(340);
    expect(idolZone(140)).toBe('melee');
    expect(idolZone(141)).toBe('near');
    expect(idolZone(340)).toBe('near');
    expect(idolZone(341)).toBe('mid');
  });
  it('主戦帯は中帯の内側(下限=離脱ローリング1回で戻れる距離)', () => {
    expect(IDOL_NEUTRAL_BAND.max).toBe(IDOL_ZONE_EDGES.nearMax);
    expect(IDOL_NEUTRAL_BAND.min).toBeGreaterThan(IDOL_ZONE_EDGES.meleeMax);
    expect(IDOL_NEUTRAL_BAND.min).toBeGreaterThanOrEqual(IDOL_ROLL_DIST);
  });
  it('どのゾーンにも台本がある(死に帯を作らない)', () => {
    for (const z of ZONES) {
      expect(IDOL_STRINGS.some(s => s.zone === z && s.weight > 0), `zone=${z}`).toBe(true);
    }
  });
  it('全6技が、どこかのゾーンの台本に登場する(実装したのに一度も出ない技を作らない)', () => {
    for (const m of IDOL_ALL_MOVES) {
      const used = IDOL_STRINGS.some(s => s.weight > 0 && s.moves.includes(m));
      expect(used, `${m} がどの台本にも登場しない`).toBe(true);
    }
  });
  it('idolMoveEligible: 密着では近距離技が、遠では遠距離技が出る(主題の維持)', () => {
    expect(idolMoveEligible('punch', 60)).toBe(true);
    expect(idolMoveEligible('roll', 60)).toBe(true);
    expect(idolMoveEligible('snipe', 900)).toBe(true);
    expect(idolMoveEligible('orb', 900)).toBe(true);
    // 至近の殴りは超遠の台本には出ない(遠くから殴られない)。
    expect(idolMoveEligible('punch', 900)).toBe(false);
  });
});

// ==== 社長裁定「MAXモリモリ」: 段数・休符・第二波 ====
describe('MAX枠の水準', () => {
  it('ストリングは P1=3段 / P2=4段(ERミドラの最大3段を超える枠)', () => {
    expect(stringMaxLen(1, IDOL_STRING_LEN)).toBe(3);
    expect(stringMaxLen(2, IDOL_STRING_LEN)).toBe(4);
  });
  it('全ての台本が4段ぶん書かれている(P2で必ず1段伸びる)', () => {
    for (const s of IDOL_STRINGS) expect(s.moves.length, `${s.zone}/${s.moves.join(',')}`).toBe(4);
  });
  it('実際に P1=3段 / P2=4段 が出る', () => {
    for (const z of ZONES) {
      expect(pickStringScript(IDOL_STRINGS, z, 1, IDOL_STRING_LEN, allReady())).toHaveLength(3);
      expect(pickStringScript(IDOL_STRINGS, z, 2, IDOL_STRING_LEN, allReady())).toHaveLength(4);
    }
  });
  it('休符は 0.9秒 で、プレイヤーの1攻撃サイクル(820ms)を必ず上回る=最低1発は入る', () => {
    expect(IDOL_REST.p1).toBe(900);
    expect(IDOL_REST.p2).toBe(900);
    expect(IDOL_REST.p1).toBeGreaterThan(PLAYER_ATTACK_CYCLE_MS);
    expect(IDOL_REST.p2).toBeGreaterThan(PLAYER_ATTACK_CYCLE_MS);
  });
  it('第二波は遠距離3技だけに付く(近距離技には付けない=「近づくほど安全」の強化)', () => {
    expect([...IDOL_WAVE_MOVES].sort()).toEqual(['aim', 'fan', 'snipe']);
    for (const m of ['aim', 'fan', 'snipe'] as IdolMove[]) {
      expect(idolWaveActive(m, 1)).toBe(false); // P1では付かない
      expect(idolWaveActive(m, 2)).toBe(true);
    }
    for (const m of ['roll', 'punch', 'orb'] as IdolMove[]) {
      expect(idolWaveActive(m, 2), `${m} に第二波が付いている`).toBe(false);
    }
  });
  it('追尾弾はPhase2で2→3発', () => {
    expect(idolOrbCount(1)).toBe(2);
    expect(idolOrbCount(2)).toBe(3);
  });
});

// ==== ★公平性の歯止め(社長指示「どう考えても無理だろ、にしない」) ====
describe('公平性: C分類は100%、決断の時刻より前にヒントが出ている', () => {
  it('Phase1の全技が公平性の検算を通る', () => {
    expect(fairnessViolations(IDOL_FAIRNESS_P1)).toEqual([]);
  });
  it('Phase2(第二波つき)の全技が公平性の検算を通る', () => {
    expect(fairnessViolations(IDOL_FAIRNESS_P2)).toEqual([]);
  });
  it('第二波の遅れは公平性の下限を満たす(650ms=押してよい幅400ms)', () => {
    expect(fairnessViolations([{ key: 'wave', cls: 'C', telegraphMs: IDOL_WAVE_DELAY_MS }])).toEqual([]);
  });
  it('MAX枠なのでC寄り: Phase1でCが過半、Phase2は全部C', () => {
    const p1 = classMix(IDOL_FAIRNESS_P1);
    expect(p1.C).toBeGreaterThanOrEqual(p1.A + p1.B - 1); // A1/B2/C2 = 拮抗以上
    const p2 = classMix(IDOL_FAIRNESS_P2);
    expect(p2.A).toBe(0);
    expect(p2.B).toBe(0);
    expect(p2.C).toBe(IDOL_FAIRNESS_P2.length);
  });
  it('公平性台帳が実際の秒数と同じ値を見ている(台帳だけ直して実装が置き去りになる事故の防止)', () => {
    const byKey = Object.fromEntries(IDOL_FAIRNESS_P1.map(m => [m.key, m.telegraphMs]));
    expect(byKey.aim).toBe(IDOL_TIMING.aim.windup);
    expect(byKey.fan).toBe(IDOL_TIMING.fan.windup);
    expect(byKey.snipe).toBe(IDOL_TIMING.snipe.windup);
    expect(byKey.punch).toBe(IDOL_TIMING.punch.windup);
    expect(byKey.orb).toBe(IDOL_TIMING.orb.windup);
  });
});

describe('硬直はすべて床(900ms)以上=どの技の後にも1発は入る', () => {
  it('全6技', () => {
    for (const m of IDOL_ALL_MOVES) {
      expect(IDOL_TIMING[m].recover, `${m}`).toBeGreaterThanOrEqual(900);
    }
  });
});

describe('懲罰(ER原則⑤)', () => {
  it('密着の懲罰は「離脱」であってAoEではない(近づくほど安全を壊さない)', () => {
    expect(IDOL_PUNISH.meleeMove).toBe('roll');
  });
  it('遠距離の懲罰は狙撃線(逃げ撃ちを消す担い手)', () => {
    expect(IDOL_PUNISH.farMove).toBe('snipe');
  });
});
