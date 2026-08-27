// ボスメーカー: 裏ボス4体の**スキーマ**と**テーブル化(値が1つも変わっていないこと)**の不変条件。
// angelTuning.test.ts「天使6体」の流儀をそのまま4体へ広げたもの。UIはスキーマを読むだけなので、
// ここが通っていれば画面は生える。
import { describe, it, expect, beforeEach } from 'vitest';
import { getBossTuning, getAtPath, resetTuning, setAtPath, changedPaths, formatTuningText, parseTuningText } from './bossTuning';
import {
  registerHiddenBossTuning,
  HIDDEN_MIMIR_FIELDS, HIDDEN_JORMUNGAND_FIELDS, HIDDEN_SKADI_FIELDS, HIDDEN_THOR_FIELDS,
  HIDDEN_PLAYABLES_BY_TYPE, HIDDEN_MOVES_BY_TYPE,
} from './hiddenBossTuning';
import {
  HIDDEN_COMMON_TUNING, HIDDEN_COMMON_TUNING_DEFAULTS,
  HIDDEN_MIMIR_TUNING, HIDDEN_MIMIR_TUNING_DEFAULTS,
  HIDDEN_JORMUNGAND_TUNING, HIDDEN_JORMUNGAND_TUNING_DEFAULTS,
  HIDDEN_SKADI_TUNING, HIDDEN_SKADI_TUNING_DEFAULTS,
  HIDDEN_THOR_TUNING, HIDDEN_THOR_TUNING_DEFAULTS,
} from '../../utils/hiddenBossScript';
import { isHiddenControllerBoss } from '../../utils/hiddenBossPlayback';
import { BOSS_MAKER_BOSSES, parseBossMakerBoss } from '../../utils/bossTest';
import { RANGE_BY_CATEGORY } from '../../utils/weaponUtils';
import { BOSS_RECOVER_FLOOR_MS } from '../../utils/bossTelegraph';
import { ANGEL_MIGUEL_TUNING } from '../../utils/angelScript'; // §4: トールの突進はミゲルの踏み込みと同値(流用の記録)
import type { TuningField } from './bossTuning';

type Rec = Record<string, unknown>;
const CASES: readonly { boss: string; label: string; fields: readonly TuningField[]; table: Rec; defaults: Rec }[] = [
  { boss: 'mimir', label: 'ミーミル', fields: HIDDEN_MIMIR_FIELDS, table: HIDDEN_MIMIR_TUNING as unknown as Rec, defaults: HIDDEN_MIMIR_TUNING_DEFAULTS as unknown as Rec },
  { boss: 'jormungand', label: 'ヨルムンガルド', fields: HIDDEN_JORMUNGAND_FIELDS, table: HIDDEN_JORMUNGAND_TUNING as unknown as Rec, defaults: HIDDEN_JORMUNGAND_TUNING_DEFAULTS as unknown as Rec },
  { boss: 'skadi', label: 'スカジ', fields: HIDDEN_SKADI_FIELDS, table: HIDDEN_SKADI_TUNING as unknown as Rec, defaults: HIDDEN_SKADI_TUNING_DEFAULTS as unknown as Rec },
  { boss: 'thor', label: 'トール', fields: HIDDEN_THOR_FIELDS, table: HIDDEN_THOR_TUNING as unknown as Rec, defaults: HIDDEN_THOR_TUNING_DEFAULTS as unknown as Rec },
];

describe('裏ボス4体がボスメーカーに登録されている', () => {
  beforeEach(() => { registerHiddenBossTuning(); });

  for (const c of CASES) {
    it(`${c.boss} が登録され、テーブルは実体と同じ参照(画面の変更がゲームへ直に効く)`, () => {
      const e = getBossTuning(c.boss);
      expect(e).toBeDefined();
      expect(e?.label).toBe(c.label);
      expect(e?.table).toBe(c.table);
      expect(e?.defaults).toBe(c.defaults);
      expect(e?.fields).toBe(c.fields);
    });
  }

  it('部屋の相手一覧(セレクト欄)に4体が入っている', () => {
    for (const c of CASES) {
      expect(BOSS_MAKER_BOSSES, c.boss).toContain(c.boss);
      expect(parseBossMakerBoss(`?makerboss=${c.boss}`)).toBe(c.boss);
      // 部屋の出現ブロックが「専用コントローラが掴む型」を見分ける判定(手掛かりの置き忘れ防止)。
      expect(isHiddenControllerBoss(c.boss), c.boss).toBe(true);
    }
    expect(isHiddenControllerBoss('idol')).toBe(false);
    expect(isHiddenControllerBoss('miguel')).toBe(false);
  });
});

describe('スキーマの打ち間違い検知(4体まとめて)', () => {
  for (const c of CASES) {
    it(`${c.boss}: 全ての欄がテーブルの実在する数値を指している`, () => {
      const bad = c.fields.filter(f => getAtPath(c.table, f.path) === undefined);
      expect(bad.map(f => f.path)).toEqual([]);
    });

    it(`${c.boss}: 全ての欄が既定値側にも実在する(差分表示が壊れない)`, () => {
      const bad = c.fields.filter(f => getAtPath(c.defaults, f.path) === undefined);
      expect(bad.map(f => f.path)).toEqual([]);
    });

    it(`${c.boss}: 欄のパスが重複していない`, () => {
      const paths = c.fields.map(f => f.path);
      expect(new Set(paths).size).toBe(paths.length);
    });

    it(`${c.boss}: 全ての欄に刻み幅(step)がある(摘まんで動かす前提)`, () => {
      const noStep = c.fields.filter(f => f.step === undefined || f.step <= 0);
      expect(noStep.map(f => f.path)).toEqual([]);
    });

    it(`${c.boss}: 刻み幅が範囲に対して細かすぎない(端から端まで200手以内)`, () => {
      const tooFine = c.fields.filter(f => {
        if (f.min === undefined || f.max === undefined || !f.step) return false;
        return (f.max - f.min) / f.step > 200;
      });
      expect(tooFine.map(f => `${f.path}(${f.min}〜${f.max} 刻み${f.step})`)).toEqual([]);
    });

    it(`${c.boss}: 既定値が全ての欄の範囲(min/max)の中にある`, () => {
      const out = c.fields.filter(f => {
        const v = getAtPath(c.defaults, f.path);
        if (v === undefined) return true;
        return (f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max);
      });
      expect(out.map(f => f.path)).toEqual([]);
    });

    it(`${c.boss}: 節の説明(ヘルプ)が全ての見出しに付いている`, () => {
      registerHiddenBossTuning();
      const help = getBossTuning(c.boss)?.sectionHelp ?? {};
      const secs = [...new Set(c.fields.map(f => f.section))];
      expect(secs.filter(s => !(s in help))).toEqual([]);
    });
  }
});

describe('技ごとの秒数(予告/硬直)が漏れていない', () => {
  it('判定を持つ技には必ず「予告」と「硬直」がある', () => {
    const want: readonly [readonly TuningField[], string, string][] = [
      [HIDDEN_MIMIR_FIELDS, 'common.aimBurstMs', 'burstRecover'],
      [HIDDEN_MIMIR_FIELDS, 'common.aimRadialMs', 'radialRecover'],
      [HIDDEN_MIMIR_FIELDS, 'common.dash.windup', 'common.dash.recover'],
      [HIDDEN_MIMIR_FIELDS, 'bite.windup', 'bite.recover'],
      [HIDDEN_JORMUNGAND_FIELDS, 'common.aimBurstMs', 'burst.recover'],
      [HIDDEN_JORMUNGAND_FIELDS, 'common.aimRadialMs', 'radial.recover'],
      [HIDDEN_JORMUNGAND_FIELDS, 'coil.windup', 'coil.recover'],
      [HIDDEN_SKADI_FIELDS, 'preWindup', 'ice.recover'],
      [HIDDEN_SKADI_FIELDS, 'preWindup', 'blade.recover'],
      [HIDDEN_SKADI_FIELDS, 'cage.windup', 'cage.recover'],
      [HIDDEN_THOR_FIELDS, 'issen.windup', 'issen.recover'],
      [HIDDEN_THOR_FIELDS, 'tsuki.windup', 'tsuki.recover'],
      [HIDDEN_THOR_FIELDS, 'harai.windup', 'harai.recover'],
      [HIDDEN_THOR_FIELDS, 'jump.windup', 'jump.recover'],
    ];
    for (const [fields, w, r] of want) {
      expect(fields.some(f => f.path === w), w).toBe(true);
      expect(fields.some(f => f.path === r), r).toBe(true);
    }
  });
});

// ================================================================================================
// 4体共通の値(★複製して分岐を作らない=共有のまま1箇所)
// ================================================================================================
describe('共通の値は4体で同じ実体を指している', () => {
  it('どのボスのテーブルからも同じ common オブジェクトが見える', () => {
    for (const c of CASES) {
      expect((c.table as { common: unknown }).common, c.boss).toBe(HIDDEN_COMMON_TUNING);
    }
  });

  it('片方の画面で動かすと4体全員に効く(=複製されていない)', () => {
    const before = HIDDEN_COMMON_TUNING.burstShots;
    setAtPath(HIDDEN_MIMIR_TUNING as unknown as Rec, 'common.burstShots', before + 1);
    expect(getAtPath(HIDDEN_SKADI_TUNING as unknown as Rec, 'common.burstShots')).toBe(before + 1);
    setAtPath(HIDDEN_MIMIR_TUNING as unknown as Rec, 'common.burstShots', before); // 後片付け
    expect(HIDDEN_COMMON_TUNING.burstShots).toBe(before);
  });

  it('共通の欄には「4体で共通」とヘルプに書いてある(1つ動かすと全員に効くため)', () => {
    for (const c of CASES) {
      for (const f of c.fields.filter(x => x.path.startsWith('common.'))) {
        expect(f.hint ?? '', `${c.boss} ${f.path}`).toContain('共通');
      }
    }
  });
});

// ================================================================================================
// テーブル化が「リファクタとして無変更」であること(BOSS_MAKER.md §4-2)
// ================================================================================================
describe('既定値が移設前の実装値と完全一致(値を1つも変えていない)', () => {
  it('4体共通', () => {
    expect(HIDDEN_COMMON_TUNING_DEFAULTS).toEqual({
      actionMinMs: 2600, actionMaxMs: 4600,
      aimBurstMs: 1000, burstShots: 3, burstGapMs: 500,
      aimRadialMs: 2000, radialCount: 16,
      dash: { windup: 1000, ms: 700, speedMult: 4.4, homing: 0.05, backstepMult: 0.4, recover: Math.max(BOSS_RECOVER_FLOOR_MS, 800) },
      turnResponse: 3.2,
    });
  });

  it('ミーミル/ヨルムンガルド/スカジ(技ごとの値)', () => {
    expect(HIDDEN_MIMIR_TUNING_DEFAULTS.laser).toEqual({ damage: 42, shakeMag: 5, recover: Math.max(BOSS_RECOVER_FLOOR_MS, 900) });
    expect(HIDDEN_MIMIR_TUNING_DEFAULTS.bite).toEqual({ windup: 700, recover: Math.max(BOSS_RECOVER_FLOOR_MS, 800), cdMs: 6000 });
    expect(HIDDEN_JORMUNGAND_TUNING_DEFAULTS.burst).toEqual({ volleys: 5, fanSpread: 0.18, gapMs: 500, recover: Math.max(BOSS_RECOVER_FLOOR_MS, 500) });
    expect(HIDDEN_JORMUNGAND_TUNING_DEFAULTS.radial).toEqual({ volleys: 8, gapMs: 300, spin: Math.PI / 16, recover: Math.max(BOSS_RECOVER_FLOOR_MS, 900) });
    expect(HIDDEN_SKADI_TUNING_DEFAULTS.preWindup).toBe(450);
    expect(HIDDEN_SKADI_TUNING_DEFAULTS.ice).toEqual({ count: 5, gapMs: 1000, telegraphMs: 2000, recover: Math.max(BOSS_RECOVER_FLOOR_MS, 600) });
    expect(HIDDEN_SKADI_TUNING_DEFAULTS.blade).toEqual({ count: 7, gapMs: 400, delayMs: 1000, ringMin: 100, ringMax: 180, recover: Math.max(BOSS_RECOVER_FLOOR_MS, 600) });
    expect(HIDDEN_SKADI_TUNING_DEFAULTS.cage).toEqual({ windup: 1000, recover: Math.max(BOSS_RECOVER_FLOOR_MS, 900), cdMs: 12000, ringRadius: 180, count: 8 });
  });

  // ★v0.25.3780(research/THOR_ISSEN_REWORK.md §1〜§4・社長指示2026-08-20/21): 一閃の2段化(紫300+赤500)・
  // 突きの予告1100/帯300・払いの予告600・新技「突進」。**社長が指定した値だけ**が動いている:
  //  一閃 windup 2400→500(+ nihilMs/nihilRadius 新設)/ 突き windup 1000→1100・range 240→300 /
  //  払い windup 1000→600。**dashMs/range/halfWidth/recover・突きのms/trackFrac/recover・
  //  払いのactive/range/halfWidth/recover は1つも動かしていない**(不変の宣言をここで機械検査する)。
  it('トール(社長が実機で決めた値は1つも動かない)', () => {
    // nihilMs 300→2000(社長指示2026-08-27「構えを2秒に変更で」)。
    expect(HIDDEN_THOR_TUNING_DEFAULTS.issen).toEqual({ nihilMs: 2000, nihilRadius: 200, windup: 500, dashMs: 280, range: 310, halfWidth: 80, recover: Math.max(BOSS_RECOVER_FLOOR_MS, 900) });
    expect(HIDDEN_THOR_TUNING_DEFAULTS.tsuki).toEqual({ windup: 1100, ms: 180, range: 300, halfWidth: 15, trackFrac: 0.5, recover: Math.max(BOSS_RECOVER_FLOOR_MS, 600) });
    expect(HIDDEN_THOR_TUNING_DEFAULTS.harai).toEqual({ windup: 600, active: 220, range: 310, halfWidth: 40, recover: Math.max(BOSS_RECOVER_FLOOR_MS, 700) });
    // 新技「突進」(§4)。既定は**ミゲルの踏み込みと同値**=新しい数字を発明していないことの記録。
    expect(HIDDEN_THOR_TUNING_DEFAULTS.dash).toEqual({ windup: 700, moveMs: 230, strikeMs: 110, recover: Math.max(BOSS_RECOVER_FLOOR_MS, 800), cdMs: 6000 });
    expect(HIDDEN_THOR_TUNING_DEFAULTS.dash).toEqual(ANGEL_MIGUEL_TUNING.dash);
    expect(HIDDEN_THOR_TUNING_DEFAULTS.jump).toEqual({ triggerHits: 3, triggerWindowMs: 6000, windup: 700, ms: 360, radius: 70, recover: Math.max(BOSS_RECOVER_FLOOR_MS, 900) });
    expect(HIDDEN_THOR_TUNING_DEFAULTS.counterLeapMs).toBe(260);
    expect(HIDDEN_THOR_TUNING_DEFAULTS.backstep).toEqual({ minIntervalMs: 3000, maxIntervalMs: 6000, distPx: 90, ms: 180 });
    expect(HIDDEN_THOR_TUNING_DEFAULTS.orbitStep).toEqual({ minIntervalMs: 2500, maxIntervalMs: 5000, distPx: 70, ms: 160 });
    expect(HIDDEN_THOR_TUNING_DEFAULTS.slowWalk).toEqual({ ms: 2000, mult: 0.5, minIntervalMs: 5000, maxIntervalMs: 9000 });
  });

  // ★テーブルは「storeをimportしない葉」なので、他モジュール由来の値は**数値を複製**してある。
  //   写した先がズレたらここで落ちる(bossTelegraph.ts / bountyDims.ts と同じ作法)。
  it('トールの旋回距離/接近速度は、複製元(武器射程・プレイヤー基準速度)と一致している', () => {
    expect(HIDDEN_THOR_TUNING_DEFAULTS.orbit.distPx).toBe(RANGE_BY_CATEGORY.handgun + 40);
    expect(HIDDEN_THOR_TUNING_DEFAULTS.approachSpeed).toBe(87 * 0.5); // = PLAYER_BASE_SPEED × 0.5
    expect(HIDDEN_THOR_TUNING_DEFAULTS.retreatSpeed).toBe(87 * 0.5);
  });

  // §6.28-7で「トールの払いと同値」と明記された流用。**別の欄として持ち**、既定の一致だけを見張る
  // (どちらかを画面で動かしても、もう片方は動かない=技ごとに性格を作り分けられる)。
  it('ヨルムンガルドのうねりの既定は、トールの払いと同値(流用の記録)', () => {
    expect(HIDDEN_JORMUNGAND_TUNING_DEFAULTS.coil.range).toBe(HIDDEN_THOR_TUNING_DEFAULTS.harai.range);
    expect(HIDDEN_JORMUNGAND_TUNING_DEFAULTS.coil.halfWidth).toBe(HIDDEN_THOR_TUNING_DEFAULTS.harai.halfWidth);
    expect(HIDDEN_JORMUNGAND_TUNING_DEFAULTS.coil.active).toBe(HIDDEN_THOR_TUNING_DEFAULTS.harai.active);
  });
});

describe('コピー→貼り戻しが往復する(実データで)', () => {
  beforeEach(() => { registerHiddenBossTuning(); });

  it('トール: 一閃の寸法も含めて元の状態へ戻る', () => {
    const e = getBossTuning('thor')!;
    setAtPath(e.table, 'issen.range', 260);
    setAtPath(e.table, 'issen.halfWidth', 60);
    const txt = formatTuningText(e, 'v0');
    resetTuning(e);
    const r = parseTuningText(e, txt);
    expect(r.errors).toEqual([]);
    expect(getAtPath(e.table, 'issen.range')).toBe(260);
    expect(getAtPath(e.table, 'issen.halfWidth')).toBe(60);
    resetTuning(e); // 後片付け(部屋を出る時と同じ=本編へ調整値を持ち出さない)
    expect(changedPaths(e)).toEqual([]);
  });

  it('4体とも「リセット=既定へ戻る」が効く(本編へ調整値が残らない)', () => {
    for (const c of CASES) {
      const e = getBossTuning(c.boss)!;
      const first = e.fields[0];
      setAtPath(e.table, first.path, (getAtPath(e.table, first.path) ?? 0) + (first.step ?? 1));
      expect(changedPaths(e).length, c.boss).toBeGreaterThan(0);
      resetTuning(e);
      expect(changedPaths(e), c.boss).toEqual([]);
    }
  });
});

// ================================================================================================
// ▸個別再生(社長指示「技再生ボタンは必須」)
// ================================================================================================
// ★ここで機械化しているのは「押しても何も起きないボタンを作らない」こと。ボタン(playables)は
// スキーマ側、実際に始められる技(HIDDEN_MOVES_BY_TYPE)はボス側にあるので、**別々に育つと必ずズレる**。
describe('▸個別再生の配線(4体まとめて)', () => {
  beforeEach(() => { registerHiddenBossTuning(); });

  for (const c of CASES) {
    it(`${c.boss}: playables/onPlay/playState が登録されている(=画面に▸が生える)`, () => {
      const e = getBossTuning(c.boss)!;
      expect(e.playables?.length ?? 0).toBeGreaterThan(0);
      expect(typeof e.onPlay).toBe('function');
      expect(typeof e.playState).toBe('function');
    });

    it(`${c.boss}: 全ての▸がボス側の実在する技を指している(押して何も起きないボタンが無い)`, () => {
      const e = getBossTuning(c.boss)!;
      const known = HIDDEN_MOVES_BY_TYPE[c.boss] ?? [];
      const bad = (e.playables ?? []).filter(p => !known.includes(p.key as never));
      expect(bad.map(p => p.key)).toEqual([]);
    });

    it(`${c.boss}: ボス側の技は全て▸から出せる(繰り越し無し=社長指示「技再生ボタンは必須」)`, () => {
      const keys = new Set((HIDDEN_PLAYABLES_BY_TYPE[c.boss] ?? []).map(p => p.key));
      const missing = (HIDDEN_MOVES_BY_TYPE[c.boss] ?? []).filter(m => !keys.has(m));
      expect(missing).toEqual([]);
    });

    it(`${c.boss}: ▸の見出し(section)が数値欄の見出しと一致する(節が2つに割れない)`, () => {
      const secs = new Set(c.fields.map(f => f.section));
      const bad = (HIDDEN_PLAYABLES_BY_TYPE[c.boss] ?? []).filter(p => !secs.has(p.section));
      expect(bad.map(p => p.section)).toEqual([]);
    });

    // P2(bossPhase を書くだけのボタン)は裏ボスでは**押しても何も起きない**——コントローラが毎フレーム
    // HPからフェーズを計算して bossPhase を上書きするため。後半の型は HP40%(ミーミル/ヨルム=60%、
    // スカジ=70%/35%、トール=60%/40%)で到達する(舞妓・天使と同じ扱い)。
    it(`${c.boss}: hasPhase2 を宣言しない(効かないP2ボタンを出さない)`, () => {
      expect(getBossTuning(c.boss)!.hasPhase2).toBeFalsy();
    });
  }

  it('技キーは4体で重複していない(取り違えが起きない)', () => {
    const all = Object.values(HIDDEN_MOVES_BY_TYPE).flat();
    expect(new Set(all).size).toBe(all.length);
  });
});
