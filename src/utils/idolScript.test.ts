import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  idolMoveEligible, idolPhaseForHealth, idolFanCount, idolZone, idolOrbCount, idolWaveActive,
  IDOL_ALL_MOVES, IDOL_STRINGS, IDOL_STRING_LEN, IDOL_REST, IDOL_TIMING, IDOL_NEUTRAL_BAND,
  IDOL_ZONE_EDGES, idolFairnessP1, idolFairnessP2, IDOL_WAVE_MOVES, IDOL_PUNISH,
  IDOL_TUNING, IDOL_TUNING_DEFAULTS, IDOL_MOVES_ALL, IDOL_SHOT_SLOTS,
  idolEnabledShots, idolStrings, idolMoveTiming, idolShotFireMs, idolShotName, idolFistReach,
  type IdolMove,
} from './idolScript';
import { deepCloneTuning } from './bossTuning';
import { fairnessViolations, classMix, pickStringScript, stringMaxLen, type BossZone } from './bossSkeleton';
import { PLAYER_ATTACK_CYCLE_MS } from './bossTelegraph';
import { ENEMY_STATS } from './enemyUtils';

const ZONES: BossZone[] = ['melee', 'near', 'mid', 'far'];
const allReady = (): Record<IdolMove, boolean> =>
  Object.fromEntries(IDOL_MOVES_ALL.map(m => [m, true])) as Record<IdolMove, boolean>;

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

// ==== 射撃部品(v0.25.2638・社長要望「通常弾/連射の弾幕/ジャブを入れたい」) ====
//
// ★この節が守る一番大事な不変条件: **既定では8枠すべて無効=本編のアイドルは1ミリも変わらない。**
// メーカーは本編と同じテーブルの実体を書き換える道具なので、ここが崩れると
// 「調整したつもりの値が本編のボスに乗る」という最悪の事故になる。
describe('射撃部品(shots)', () => {
  const resetShots = (): void => {
    for (const m of IDOL_SHOT_SLOTS) {
      IDOL_TUNING.shots[m] = deepCloneTuning(IDOL_TUNING_DEFAULTS.shots[m]);
      IDOL_TUNING.shotLabels[m] = IDOL_TUNING_DEFAULTS.shotLabels[m];
    }
  };
  beforeEach(resetShots);
  afterEach(resetShots);

  it('既定は8枠すべて無効(本編の挙動は変わらない)', () => {
    expect(IDOL_SHOT_SLOTS).toHaveLength(8);
    for (const m of IDOL_SHOT_SLOTS) expect(IDOL_TUNING_DEFAULTS.shots[m].enabled).toBe(0);
    expect(idolEnabledShots()).toEqual([]);
    // 台本も公平性の台帳も、足していない限り**同じ配列の同じ参照**が返る。
    expect(idolStrings()).toBe(IDOL_TUNING.strings);
    expect(idolFairnessP1().map(f => f.key)).toEqual(['aim', 'fan', 'snipe', 'punch', 'orb']);
  });

  it('中核6技と射撃枠を1つの関数で引ける(timing に居ない技を直接引かない)', () => {
    expect(idolMoveTiming('aim')).toEqual(IDOL_TUNING.timing.aim);
    IDOL_TUNING.shots.s1.windup = 320;
    IDOL_TUNING.shots.s1.recover = 640;
    IDOL_TUNING.shots.s1.waves = 4;
    IDOL_TUNING.shots.s1.intervalMs = 150;
    // 判定(active)= 撃ち切るのに要る時間 = (斉射数-1)×間隔。単発なら0=撃った瞬間に硬直へ。
    expect(idolMoveTiming('s1')).toEqual({ windup: 320, active: 450, recover: 640 });
    IDOL_TUNING.shots.s1.waves = 1;
    expect(idolShotFireMs(IDOL_TUNING.shots.s1)).toBe(0);
  });

  it('有効かつ重み>0の枠だけが台本へ1段の演目として混ざる', () => {
    IDOL_TUNING.shots.s2.enabled = 1;
    IDOL_TUNING.shots.s2.zoneIdx = 2;   // 遠
    IDOL_TUNING.shots.s2.weight = 40;
    IDOL_TUNING.shots.s3.enabled = 1;
    IDOL_TUNING.shots.s3.weight = 0;    // 重み0=台本には出ない(▶の単独再生では出せる)
    const ss = idolStrings();
    expect(ss).toHaveLength(IDOL_TUNING.strings.length + 1);
    expect(ss[ss.length - 1]).toEqual({ zone: 'mid', weight: 40, moves: ['s2'] });
    expect(idolMoveEligible('s2', 500)).toBe(true);   // 遠(340〜700)
    expect(idolMoveEligible('s2', 250)).toBe(false);  // 主戦帯には出ない
    expect(idolMoveEligible('s3', 250)).toBe(false);  // 重み0
  });

  it('抽選に載る(足した技が実際にボスの手として出る)', () => {
    IDOL_TUNING.shots.s1.enabled = 1;
    IDOL_TUNING.shots.s1.zoneIdx = 0;   // 密着
    IDOL_TUNING.shots.s1.weight = 1000; // 既存の55/45に対して圧倒的
    const seq = pickStringScript(idolStrings(), 'melee', 1, IDOL_STRING_LEN, allReady(), () => 0.99);
    expect(seq).toEqual(['s1']);
  });

  it('名前は空なら既定名(枠を足しただけで名無しにならない)', () => {
    expect(idolShotName('s1')).toBe('射撃1');
    IDOL_TUNING.shotLabels.s1 = ' ジャブ ';
    expect(idolShotName('s1')).toBe('ジャブ');
  });

  it('足した技も公平性の検算に載る(メーカー製だけ網の外、を作らない)', () => {
    IDOL_TUNING.shots.s1.enabled = 1;
    IDOL_TUNING.shots.s1.homingDeg = 0;
    IDOL_TUNING.shots.s1.windup = 700;
    IDOL_TUNING.shotLabels.s1 = '通常弾';
    const f = idolFairnessP1().find(x => x.key === '通常弾');
    expect(f).toBeDefined();
    expect(f?.cls).toBe('B');                 // 直進弾=弾の太さぶん横へ歩けば出られる
    expect(fairnessViolations(idolFairnessP1())).toEqual([]);

    // 予告を人の反応より短くしたら**必ず検算に引っかかる**(ここが鳴らないと歯止めが無い)。
    IDOL_TUNING.shots.s1.windup = 60;
    expect(fairnessViolations(idolFairnessP1()).join()).toContain('通常弾');
  });

  it('誘導があってプレイヤーより速い弾は C(走っても振り切れない=詰めるのが答え)', () => {
    IDOL_TUNING.shots.s1.enabled = 1;
    IDOL_TUNING.shots.s1.homingDeg = 90;
    IDOL_TUNING.shots.s1.speed = 300;    // プレイヤー104.4px/sより速い
    expect(idolFairnessP1().find(x => x.key === '射撃1')?.cls).toBe('C');
    // 誘導があっても遅ければ歩いて逃げられる=B。
    IDOL_TUNING.shots.s1.speed = 60;
    expect(idolFairnessP1().find(x => x.key === '射撃1')?.cls).toBe('B');
  });
});

// ==== エフェクトの速さ(v0.25.2651・社長「拳とかダメージ判定早いのにエフェクト遅い」) ====
describe('拳の伸び(idolFistReach)', () => {
  it('★判定の瞬間(u=1)に必ず伸び切る — 速さを変えても着弾の瞬間は動かない', () => {
    // ここが崩れると「絵はまだ届いていないのにダメージが入る」「絵が当たったのにダメージが無い」に
    // なる=CLAUDE.md の禁止事項。**どのパラメータでも**成り立つことを機械で確認する。
    for (const lead of [0.05, 0.2, 0.35, 0.7, 1]) {
      for (const ease of [0.3, 1, 1.8, 3]) {
        expect(idolFistReach(1, lead, ease), `lead=${lead} ease=${ease}`).toBeCloseTo(1, 10);
      }
    }
  });
  it('溜めの開始では伸びていない / 単調に伸びる(戻らない)', () => {
    expect(idolFistReach(0, 0.35, 1)).toBe(0);
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const v = idolFistReach(i / 100, 0.35, 1.4);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it('lead が小さいほど「遅くまで動かない」= 速く見える', () => {
    const u = 0.8;
    expect(idolFistReach(u, 1.0, 1)).toBeGreaterThan(idolFistReach(u, 0.35, 1));
    expect(idolFistReach(u, 0.35, 1)).toBeGreaterThan(idolFistReach(u, 0.1, 1));
  });
  it('壊れた値でも 0..1 に収まる(0除算・負・巨大)', () => {
    for (const [lead, ease] of [[0, 1], [-1, 1], [0.35, 0], [0.35, -5], [99, 99]] as const) {
      for (const u of [-1, 0, 0.5, 1, 2]) {
        const v = idolFistReach(u, lead, ease);
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
  it('既定は「溜めの最後の35%で等速に突き出す」(旧実装=1.0の等速は遅く見えた)', () => {
    expect(IDOL_TUNING_DEFAULTS.fx).toEqual({ punchFistLead: 0.35, punchFistEase: 1, punchFistHoldMs: 280 });
  });
});
