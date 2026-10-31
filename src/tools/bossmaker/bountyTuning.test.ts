// ボスメーカー: 賞金首4種の**スキーマ**の不変条件(bossTuning.test.ts「レジストリ + idolのスキーマ」の
// 流儀をそのまま4体へ広げたもの)。UIはスキーマを読むだけなので、ここが通っていれば画面は生える。
import { describe, it, expect, beforeEach } from 'vitest';
import { getBossTuning, getAtPath, resetTuning, setAtPath, changedPaths, formatTuningText, parseTuningText } from './bossTuning';
import {
  registerBountyTuning,
  BOUNTY_RANGED_FIELDS, BOUNTY_MELEE_FIELDS, BOUNTY_BALANCE_FIELDS, BOUNTY_MAIKO_FIELDS,
  BOUNTY_PLAYABLES_BY_TYPE, BOUNTY_MOVES_BY_TYPE,
} from './bountyTuning';
import {
  BOUNTY_RANGED_TUNING, BOUNTY_RANGED_TUNING_DEFAULTS,
  BOUNTY_MELEE_TUNING, BOUNTY_MELEE_TUNING_DEFAULTS,
  BOUNTY_BALANCE_TUNING, BOUNTY_BALANCE_TUNING_DEFAULTS,
  BOUNTY_MAIKO_TUNING, BOUNTY_MAIKO_TUNING_DEFAULTS,
} from '../../utils/bountyScript';
import type { TuningField } from './bossTuning';

type Rec = Record<string, unknown>;
const CASES: readonly { boss: string; label: string; fields: readonly TuningField[]; table: Rec; defaults: Rec }[] = [
  { boss: 'bounty-ranged', label: 'バス停(変異)', fields: BOUNTY_RANGED_FIELDS, table: BOUNTY_RANGED_TUNING as unknown as Rec, defaults: BOUNTY_RANGED_TUNING_DEFAULTS as unknown as Rec },
  { boss: 'bounty-melee', label: '馬乗り(変異)', fields: BOUNTY_MELEE_FIELDS, table: BOUNTY_MELEE_TUNING as unknown as Rec, defaults: BOUNTY_MELEE_TUNING_DEFAULTS as unknown as Rec },
  { boss: 'bounty-balance', label: '鋏(変異)', fields: BOUNTY_BALANCE_FIELDS, table: BOUNTY_BALANCE_TUNING as unknown as Rec, defaults: BOUNTY_BALANCE_TUNING_DEFAULTS as unknown as Rec },
  { boss: 'bounty-maiko', label: '舞妓(変異)', fields: BOUNTY_MAIKO_FIELDS, table: BOUNTY_MAIKO_TUNING as unknown as Rec, defaults: BOUNTY_MAIKO_TUNING_DEFAULTS as unknown as Rec },
];

describe('賞金首4種がボスメーカーに登録されている', () => {
  beforeEach(() => { registerBountyTuning(); });

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
});

describe('スキーマの打ち間違い検知(4種まとめて)', () => {
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
      registerBountyTuning();
      const help = getBossTuning(c.boss)?.sectionHelp ?? {};
      const secs = [...new Set(c.fields.map(f => f.section))];
      expect(secs.filter(s => !(s in help))).toEqual([]);
    });
  }
});

describe('技ごとの秒数(予告/硬直)が漏れていない', () => {
  it('判定を持つ技には必ず「予告」と「硬直」がある', () => {
    // ★ここに並ぶのは「溜めてから当てる技」だけ。中立射撃(通常弾)とレーザーは別枠
    //   (レーザーの予告は本家=ミーミル側が持つので、このスキーマには無い)。
    const want: readonly [readonly TuningField[], string, string][] = [
      [BOUNTY_RANGED_FIELDS, 'push.windup', 'push.recover'],
      [BOUNTY_MELEE_FIELDS, 'charge.windup', 'charge.recover'],
      [BOUNTY_MELEE_FIELDS, 'whip360.windup', 'combo.finishRecover'],
      [BOUNTY_MELEE_FIELDS, 'snipe.windup', 'snipe.recover'],
      [BOUNTY_BALANCE_FIELDS, 'sweep.windup', 'sweep.recover'],
      [BOUNTY_BALANCE_FIELDS, 'leap.windup', 'leap.recover'],
      [BOUNTY_MAIKO_FIELDS, 'naginata.windup.0', 'naginata.recover'],
      [BOUNTY_MAIKO_FIELDS, 'spin.windup.0', 'spin.recover'],
      [BOUNTY_MAIKO_FIELDS, 'suiu.hopInterval.0', 'suiu.recover'],
      [BOUNTY_MAIKO_FIELDS, 'boom.windup', 'boom.recover'],
    ];
    for (const [fields, w, r] of want) {
      expect(fields.some(f => f.path === w), w).toBe(true);
      expect(fields.some(f => f.path === r), r).toBe(true);
    }
  });
});

describe('コピー→貼り戻しが往復する(実データで)', () => {
  beforeEach(() => { registerBountyTuning(); });

  it('舞妓: 2択の予告(配列)も含めて元の状態へ戻る', () => {
    const e = getBossTuning('bounty-maiko')!;
    setAtPath(e.table, 'spin.radius', 260);
    setAtPath(e.table, 'naginata.windup.1', 1500);
    const txt = formatTuningText(e, 'v0');
    resetTuning(e);
    const r = parseTuningText(e, txt);
    expect(r.errors).toEqual([]);
    expect(getAtPath(e.table, 'spin.radius')).toBe(260);
    expect(getAtPath(e.table, 'naginata.windup.1')).toBe(1500);
    resetTuning(e); // 後片付け(部屋を出る時と同じ=本編へ調整値を持ち出さない)
    expect(changedPaths(e)).toEqual([]);
  });

  it('4種とも「リセット=既定へ戻る」が効く(本編へ調整値が残らない)', () => {
    for (const c of CASES) {
      const e = getBossTuning(c.boss)!;
      const first = e.fields[0];
      setAtPath(e.table, first.path, (getAtPath(e.table, first.path) ?? 0) + (first.step ?? 1));
      expect(changedPaths(e).length).toBeGreaterThan(0);
      resetTuning(e);
      expect(changedPaths(e)).toEqual([]);
    }
  });
});

// ================================================================================================
// ▶個別再生(v0.25.3563・社長指示「技再生ボタンは必須」)
// ================================================================================================
// ★ここで機械化しているのは「押しても何も起きないボタンを作らない」こと。ボタン(playables)は
// スキーマ側、実際に始められる技(BOUNTY_MOVES_BY_TYPE)はボス側にあるので、**別々に育つと必ずズレる**。
describe('▶個別再生の配線(4種まとめて)', () => {
  beforeEach(() => { registerBountyTuning(); });

  for (const c of CASES) {
    it(`${c.boss}: playables/onPlay/playState が登録されている(=画面に▶が生える)`, () => {
      const e = getBossTuning(c.boss)!;
      expect(e.playables?.length ?? 0).toBeGreaterThan(0);
      expect(typeof e.onPlay).toBe('function');
      expect(typeof e.playState).toBe('function');
    });

    it(`${c.boss}: 全ての▶がボス側の実在する技を指している(押して何も起きないボタンが無い)`, () => {
      const e = getBossTuning(c.boss)!;
      const known = BOUNTY_MOVES_BY_TYPE[c.boss] ?? [];
      const bad = (e.playables ?? []).filter(p => !known.includes(p.key as never));
      expect(bad.map(p => p.key)).toEqual([]);
    });

    it(`${c.boss}: ボス側の技は全て▶から出せる(繰り越し無し=社長指示「技再生ボタンは必須」)`, () => {
      const keys = new Set((BOUNTY_PLAYABLES_BY_TYPE[c.boss] ?? []).map(p => p.key));
      const missing = (BOUNTY_MOVES_BY_TYPE[c.boss] ?? []).filter(m => !keys.has(m));
      expect(missing).toEqual([]);
    });

    it(`${c.boss}: ▶の見出し(section)が数値欄の見出しと一致する(節が2つに割れない)`, () => {
      const secs = new Set(c.fields.map(f => f.section));
      const bad = (BOUNTY_PLAYABLES_BY_TYPE[c.boss] ?? []).filter(p => !secs.has(p.section));
      expect(bad.map(p => p.section)).toEqual([]);
    });

    // ③(v0.25.3563): P2は bossPhase を持つボスにしか意味が無い。賞金首4種は宣言しない
    // =パネルはボタンごと出さない(舞妓の型BはHP閾値方式なので HP40% ボタンで到達する)。
    it(`${c.boss}: hasPhase2 を宣言しない(P2ボタンを出さない)`, () => {
      expect(getBossTuning(c.boss)!.hasPhase2).toBeFalsy();
    });
  }
});
