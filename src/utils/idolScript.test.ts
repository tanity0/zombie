import { describe, it, expect } from 'vitest';
import {
  idolMoveEligible, idolPhaseForHealth, idolFanCount, idolZone, idolOrbCount, idolWaveActive,
  IDOL_ALL_MOVES, IDOL_STRINGS, IDOL_STRING_LEN, IDOL_REST, IDOL_TIMING, IDOL_NEUTRAL_BAND,
  IDOL_ZONE_EDGES, idolFairnessP1, idolFairnessP2, IDOL_WAVE_MOVES, IDOL_PUNISH,
  IDOL_TUNING, IDOL_TUNING_DEFAULTS, type IdolMove,
} from './idolScript';
import { fairnessViolations, classMix, pickStringScript, stringMaxLen, type BossZone } from './bossSkeleton';
import { PLAYER_ATTACK_CYCLE_MS } from './bossTelegraph';
import { ENEMY_STATS } from './enemyUtils';

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
    expect(IDOL_NEUTRAL_BAND.min).toBeGreaterThanOrEqual(IDOL_TUNING.shape.rollDist);
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
    expect(fairnessViolations(idolFairnessP1())).toEqual([]);
  });
  it('Phase2(第二波つき)の全技が公平性の検算を通る', () => {
    expect(fairnessViolations(idolFairnessP2())).toEqual([]);
  });
  it('第二波の遅れは公平性の下限を満たす(650ms=押してよい幅400ms)', () => {
    expect(fairnessViolations([{ key: 'wave', cls: 'C', telegraphMs: IDOL_TUNING.waveDelayMs }])).toEqual([]);
  });
  it('MAX枠なのでC寄り: Phase1でCが過半、Phase2は全部C', () => {
    const p1 = classMix(idolFairnessP1());
    expect(p1.C).toBeGreaterThanOrEqual(p1.A + p1.B - 1); // A1/B2/C2 = 拮抗以上
    const p2 = classMix(idolFairnessP2());
    expect(p2.A).toBe(0);
    expect(p2.B).toBe(0);
    expect(p2.C).toBe(idolFairnessP2().length);
  });
  it('公平性台帳が実際の秒数と同じ値を見ている(台帳だけ直して実装が置き去りになる事故の防止)', () => {
    const byKey = Object.fromEntries(idolFairnessP1().map((m: { key: string; telegraphMs: number }) => [m.key, m.telegraphMs]));
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

// ==== ★ボスメーカー(BOSS_MAKER.md §2-4): テーブル化は純粋なリファクタであること ====
// 「**既定値が現行の実装値と1つも変わらないこと**」が絶対条件。ここに**テーブル化する前の実装値を
// 直接ベタ書き**して突き合わせる(テーブル自身から取ると何も検証できないので、必ず literal を書く)。
describe('IDOL_TUNING の既定値 = テーブル化前の実装値(挙動不変の担保)', () => {
  it('帯・主戦帯・移動倍率・フェーズ', () => {
    expect(IDOL_TUNING_DEFAULTS.zoneEdges).toEqual({ meleeMax: 140, nearMax: 340, midMax: 700 });
    expect(IDOL_TUNING_DEFAULTS.neutralBand).toEqual({ min: 200, max: 340 });
    expect(IDOL_TUNING_DEFAULTS.verbSpeedMult).toEqual({ close: 1, retreat: 0.45, strafe: 0.45, hold: 0 });
    expect(IDOL_TUNING_DEFAULTS.phaseHpThreshold).toBe(0.5);
    expect(IDOL_TUNING_DEFAULTS.fanCount).toEqual({ p1: 3, p2: 5 });
    expect(IDOL_TUNING_DEFAULTS.orbCount).toEqual({ p1: 2, p2: 3 });
  });
  it('技の秒数(硬直は6技すべて900=withRecoverFloorの床が既定値になっている)', () => {
    expect(IDOL_TUNING_DEFAULTS.timing).toEqual({
      aim:   { windup: 700,  active: 0,   recover: 900 },
      fan:   { windup: 900,  active: 0,   recover: 900 },
      roll:  { windup: 400,  active: 300, recover: 900 },
      punch: { windup: 600,  active: 0,   recover: 900 },
      snipe: { windup: 1100, active: 200, recover: 900 },
      orb:   { windup: 800,  active: 0,   recover: 900 },
    });
  });
  it('図形(判定と厳密一致させる値)', () => {
    expect(IDOL_TUNING_DEFAULTS.shape).toEqual({
      rollDist: 140, punchRange: 90, punchHalfWidth: 30,
      snipeRange: 900, snipeHalfWidth: 40, fanSpreadStep: 0.14,
      orbSpeed: 155, orbTurnRate: 1.5,
    });
  });
  it('第二波・ストリング・休符・中立・懲罰', () => {
    expect(IDOL_TUNING_DEFAULTS.waveDelayMs).toBe(650);
    expect(IDOL_TUNING_DEFAULTS.stringLen).toEqual({ p1: 3, p2: 4 });
    expect(IDOL_TUNING_DEFAULTS.rest).toEqual({ p1: 900, p2: 900 });
    expect(IDOL_TUNING_DEFAULTS.neutral).toEqual({ minMs: 700, maxMs: 1300 });
    expect(IDOL_TUNING_DEFAULTS.punish).toEqual({
      farMs: 2000, farMove: 'snipe', meleeMs: 3000, meleeMove: 'roll', sameAngleMs: 4000,
    });
    expect(IDOL_TUNING_DEFAULTS.sameAngleDeg).toBe(30);
  });
  it('台本(ゾーン・重み・並び)', () => {
    expect(IDOL_TUNING_DEFAULTS.strings).toEqual([
      { zone: 'melee', weight: 55, moves: ['punch', 'roll', 'fan', 'orb'] },
      { zone: 'melee', weight: 45, moves: ['roll', 'fan', 'punch', 'orb'] },
      { zone: 'near', weight: 40, moves: ['fan', 'fan', 'orb', 'snipe'] },
      { zone: 'near', weight: 35, moves: ['fan', 'snipe', 'orb', 'fan'] },
      { zone: 'near', weight: 25, moves: ['orb', 'fan', 'punch', 'snipe'] },
      { zone: 'mid', weight: 50, moves: ['aim', 'aim', 'snipe', 'orb'] },
      { zone: 'mid', weight: 50, moves: ['snipe', 'orb', 'aim', 'snipe'] },
      { zone: 'far', weight: 45, moves: ['aim', 'snipe', 'orb', 'snipe'] },
      { zone: 'far', weight: 55, moves: ['orb', 'orb', 'snipe', 'aim'] },
    ]);
  });
  it('基礎値は ENEMY_STATS.idol と同値(2箇所に違う数字を持たない)', () => {
    expect(IDOL_TUNING_DEFAULTS.stats).toEqual({
      health: ENEMY_STATS.idol.health, damage: ENEMY_STATS.idol.damage, speed: ENEMY_STATS.idol.speed,
    });
  });
  it('既定値はテーブルとは別オブジェクト(テーブルを書き換えても既定が動かない)', () => {
    const before = IDOL_TUNING_DEFAULTS.timing.aim.windup;
    IDOL_TUNING.timing.aim.windup = 12345;
    expect(IDOL_TUNING_DEFAULTS.timing.aim.windup).toBe(before);
    IDOL_TUNING.timing.aim.windup = before; // 後片付け(他のテストへ漏らさない)
  });
  it('従来名の再exportはテーブルと同じ参照(書き換えが使用箇所へ自動で届く)', () => {
    expect(IDOL_TIMING).toBe(IDOL_TUNING.timing);
    expect(IDOL_NEUTRAL_BAND).toBe(IDOL_TUNING.neutralBand);
    expect(IDOL_REST).toBe(IDOL_TUNING.rest);
    expect(IDOL_PUNISH).toBe(IDOL_TUNING.punish);
    expect(IDOL_STRINGS).toBe(IDOL_TUNING.strings);
    expect(IDOL_STRING_LEN).toBe(IDOL_TUNING.stringLen);
    expect(IDOL_ZONE_EDGES).toBe(IDOL_TUNING.zoneEdges);
  });
});
