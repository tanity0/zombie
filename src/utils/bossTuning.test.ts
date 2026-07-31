import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerBossTuning, getBossTuning, getAtPath, setAtPath, clampField, changedPaths,
  resetTuning, formatTuningText, parseTuningText, deepCloneTuning,
  type BossTuningEntry, type TuningField,
} from './bossTuning';
import { registerIdolTuning, IDOL_TUNING_FIELDS } from './idolTuning';
import { IDOL_TUNING, IDOL_TUNING_DEFAULTS } from './idolScript';

const FIELDS: TuningField[] = [
  { path: 'a.b', label: 'AB', group: 'behavior', section: 'S', kind: 'ms', min: 0, max: 1000, step: 50 },
  { path: 'c', label: 'C', group: 'move', section: 'T', kind: 'px', min: 0, max: 100, step: 10 },
];
const makeEntry = (): BossTuningEntry => {
  const table = { a: { b: 100 }, c: 20 };
  return { bossType: 'test', label: 'テスト', table, defaults: deepCloneTuning(table), fields: FIELDS };
};

describe('パス読み書き', () => {
  it('入れ子の数値を読める / 数値でない場所は undefined', () => {
    const e = makeEntry();
    expect(getAtPath(e.table, 'a.b')).toBe(100);
    expect(getAtPath(e.table, 'c')).toBe(20);
    expect(getAtPath(e.table, 'a')).toBeUndefined();
    expect(getAtPath(e.table, 'nope.x')).toBeUndefined();
  });
  it('既存のキーにしか書かない(打ち間違いで新しいキーを生やさない)', () => {
    const e = makeEntry();
    expect(setAtPath(e.table, 'a.b', 7)).toBe(true);
    expect(getAtPath(e.table, 'a.b')).toBe(7);
    expect(setAtPath(e.table, 'a.zzz', 7)).toBe(false);
    expect(setAtPath(e.table, 'nope.x', 7)).toBe(false);
    expect((e.table as { a: Record<string, unknown> }).a.zzz).toBeUndefined();
  });
  it('NaN/Infinity は書かない', () => {
    const e = makeEntry();
    expect(setAtPath(e.table, 'c', Number.NaN)).toBe(false);
    expect(setAtPath(e.table, 'c', Number.POSITIVE_INFINITY)).toBe(false);
    expect(getAtPath(e.table, 'c')).toBe(20);
  });
  it('書き換えは同じ参照の入れ子オブジェクトへ反映される(再exportが効く仕掛けの根拠)', () => {
    const e = makeEntry();
    const nested = (e.table as { a: { b: number } }).a;
    setAtPath(e.table, 'a.b', 55);
    expect(nested.b).toBe(55);
  });
});

describe('clampField / changedPaths / resetTuning', () => {
  it('範囲へ丸める', () => {
    expect(clampField(FIELDS[0], -5)).toBe(0);
    expect(clampField(FIELDS[0], 5000)).toBe(1000);
    expect(clampField(FIELDS[0], 250)).toBe(250);
  });
  it('既定から変わった欄だけ拾う', () => {
    const e = makeEntry();
    expect(changedPaths(e)).toEqual([]);
    setAtPath(e.table, 'c', 30);
    expect(changedPaths(e)).toEqual(['c']);
  });
  it('リセットで既定へ戻る(テーブルの参照は保つ)', () => {
    const e = makeEntry();
    const nested = (e.table as { a: { b: number } }).a;
    setAtPath(e.table, 'a.b', 999);
    setAtPath(e.table, 'c', 99);
    resetTuning(e);
    expect(changedPaths(e)).toEqual([]);
    expect(nested.b).toBe(100); // 同じオブジェクトのまま戻っている
  });
});

describe('コピー → 貼り戻し(受け入れ条件4: 往復できる)', () => {
  it('変更なしのテキストはその旨を含む', () => {
    const e = makeEntry();
    expect(formatTuningText(e, 'v0')).toContain('既定値から変更なし');
  });
  it('変更した欄に * と既定値が付く', () => {
    const e = makeEntry();
    setAtPath(e.table, 'c', 50);
    const txt = formatTuningText(e, 'v0');
    expect(txt).toContain('* C = 50px');
    expect(txt).toContain('既定 20px');
    expect(txt).toContain('  AB = 100ms'); // 変えていない欄は * が付かない
  });
  it('貼り戻すと同じ状態に戻る(往復)', () => {
    const e = makeEntry();
    setAtPath(e.table, 'a.b', 350);
    setAtPath(e.table, 'c', 40);
    const txt = formatTuningText(e, 'v0');
    resetTuning(e);
    expect(changedPaths(e)).toEqual([]);
    const r = parseTuningText(e, txt);
    expect(r.errors).toEqual([]);
    expect(r.applied).toBe(2);
    expect(getAtPath(e.table, 'a.b')).toBe(350);
    expect(getAtPath(e.table, 'c')).toBe(40);
  });
  it('貼り戻しは「既定へ戻してから差分を当てる」=貼る前の余計な変更が残らない', () => {
    const e = makeEntry();
    const txt = formatTuningText(e, 'v0'); // 変更なしの状態をコピー
    setAtPath(e.table, 'c', 90);
    parseTuningText(e, txt);
    expect(changedPaths(e)).toEqual([]);
  });
  it('別のボスのテキストは拒否する', () => {
    const e = makeEntry();
    const other = { ...makeEntry(), bossType: 'other' };
    const r = parseTuningText(e, formatTuningText(other, 'v0'));
    expect(r.applied).toBe(0);
    expect(r.errors[0]).toContain('別のボス');
  });
  it('壊れたテキストは弾く', () => {
    const e = makeEntry();
    expect(parseTuningText(e, 'ただの文章').errors).toHaveLength(1);
  });
  it('貼り戻しでも範囲へ丸める(壊れた数字で壊れない)', () => {
    const e = makeEntry();
    const r = parseTuningText(e, `--- machine (paste-back) ---\n{"boss":"test","changed":{"c":99999}}`);
    expect(r.applied).toBe(1);
    expect(getAtPath(e.table, 'c')).toBe(100);
  });
});

describe('レジストリ + idolのスキーマ', () => {
  beforeEach(() => { registerIdolTuning(); });

  it('idolが登録され、テーブルは実体と同じ参照(画面の変更がゲームへ直に効く)', () => {
    const e = getBossTuning('idol');
    expect(e).toBeDefined();
    expect(e?.table).toBe(IDOL_TUNING as unknown as Record<string, unknown>);
    expect(e?.defaults).toBe(IDOL_TUNING_DEFAULTS as unknown as Record<string, unknown>);
  });

  it('全ての欄がテーブルの実在する数値を指している(スキーマの打ち間違い検知)', () => {
    const bad = IDOL_TUNING_FIELDS.filter(f => getAtPath(IDOL_TUNING, f.path) === undefined);
    expect(bad.map(f => f.path)).toEqual([]);
  });

  it('全ての欄が既定値側にも実在する(差分表示が壊れない)', () => {
    const bad = IDOL_TUNING_FIELDS.filter(f => getAtPath(IDOL_TUNING_DEFAULTS, f.path) === undefined);
    expect(bad.map(f => f.path)).toEqual([]);
  });

  it('欄のパスが重複していない', () => {
    const paths = IDOL_TUNING_FIELDS.map(f => f.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('★スクラブ操作の前提: 全ての欄に刻み幅(step)がある', () => {
    // 社長補足「その場で動かしながら調整」=主操作はドラッグと+−。stepが無い欄は摘まめない。
    const noStep = IDOL_TUNING_FIELDS.filter(f => f.step === undefined || f.step <= 0);
    expect(noStep.map(f => f.path)).toEqual([]);
  });

  it('★刻み幅が範囲に対して細かすぎない(端から端まで200手以内で回せる)', () => {
    const tooFine = IDOL_TUNING_FIELDS.filter(f => {
      if (f.min === undefined || f.max === undefined || !f.step) return false;
      return (f.max - f.min) / f.step > 200;
    });
    expect(tooFine.map(f => `${f.path}(${f.min}〜${f.max} 刻み${f.step})`)).toEqual([]);
  });

  it('既定値が全ての欄の範囲(min/max)の中にある', () => {
    const out = IDOL_TUNING_FIELDS.filter(f => {
      const v = getAtPath(IDOL_TUNING_DEFAULTS, f.path);
      if (v === undefined) return true;
      return (f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max);
    });
    expect(out.map(f => f.path)).toEqual([]);
  });

  it('技6本ぶんの秒数3種(予告/判定/硬直)が漏れなくある', () => {
    for (const m of ['aim', 'fan', 'roll', 'punch', 'snipe', 'orb']) {
      for (const k of ['windup', 'active', 'recover']) {
        expect(IDOL_TUNING_FIELDS.some(f => f.path === `timing.${m}.${k}`), `timing.${m}.${k}`).toBe(true);
      }
    }
  });

  it('idolのコピー→貼り戻しが往復する(実データで)', () => {
    const e = getBossTuning('idol')!;
    setAtPath(e.table, 'timing.snipe.windup', 1500);
    setAtPath(e.table, 'neutralBand.max', 400);
    const txt = formatTuningText(e, 'v0');
    resetTuning(e);
    const r = parseTuningText(e, txt);
    expect(r.errors).toEqual([]);
    expect(getAtPath(e.table, 'timing.snipe.windup')).toBe(1500);
    expect(getAtPath(e.table, 'neutralBand.max')).toBe(400);
    resetTuning(e); // 後片付け
    expect(changedPaths(e)).toEqual([]);
  });
});

describe('registerBossTuning', () => {
  it('登録して引ける / 未登録は undefined', () => {
    registerBossTuning(makeEntry());
    expect(getBossTuning('test')?.label).toBe('テスト');
    expect(getBossTuning('nobody')).toBeUndefined();
  });
});
