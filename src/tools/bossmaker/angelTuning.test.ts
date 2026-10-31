// ボスメーカー: 天使6体の**スキーマ**の不変条件(bountyTuning.test.ts「賞金首4種」の流儀をそのまま
// 6体へ広げたもの)。UIはスキーマを読むだけなので、ここが通っていれば画面は生える。
import { describe, it, expect, beforeEach } from 'vitest';
import { getBossTuning, getAtPath, resetTuning, setAtPath, changedPaths, formatTuningText, parseTuningText } from './bossTuning';
import {
  registerAngelTuning,
  ANGEL_MIGUEL_FIELDS, ANGEL_JIBRIL_FIELDS, ANGEL_RAFI_FIELDS,
  ANGEL_URI_FIELDS, ANGEL_SURIEL_FIELDS, ANGEL_ACRASIEL_FIELDS,
  ANGEL_PLAYABLES_BY_TYPE, ANGEL_MOVES_BY_TYPE,
} from './angelTuning';
import {
  ANGEL_COMMON_TUNING,
  ANGEL_MIGUEL_TUNING, ANGEL_MIGUEL_TUNING_DEFAULTS,
  ANGEL_JIBRIL_TUNING, ANGEL_JIBRIL_TUNING_DEFAULTS,
  ANGEL_RAFI_TUNING, ANGEL_RAFI_TUNING_DEFAULTS,
  ANGEL_URI_TUNING, ANGEL_URI_TUNING_DEFAULTS,
  ANGEL_SURIEL_TUNING, ANGEL_SURIEL_TUNING_DEFAULTS,
  ANGEL_ACRASIEL_TUNING, ANGEL_ACRASIEL_TUNING_DEFAULTS,
} from '../../utils/angelScript';
import { BOSS_MAKER_BOSSES, parseBossMakerBoss } from '../../utils/bossTest';
import type { TuningField } from './bossTuning';

type Rec = Record<string, unknown>;
const CASES: readonly { boss: string; label: string; fields: readonly TuningField[]; table: Rec; defaults: Rec }[] = [
  { boss: 'miguel', label: 'ミゲル', fields: ANGEL_MIGUEL_FIELDS, table: ANGEL_MIGUEL_TUNING as unknown as Rec, defaults: ANGEL_MIGUEL_TUNING_DEFAULTS as unknown as Rec },
  { boss: 'jibril', label: 'ジブリル', fields: ANGEL_JIBRIL_FIELDS, table: ANGEL_JIBRIL_TUNING as unknown as Rec, defaults: ANGEL_JIBRIL_TUNING_DEFAULTS as unknown as Rec },
  { boss: 'rafi', label: 'ラフィ', fields: ANGEL_RAFI_FIELDS, table: ANGEL_RAFI_TUNING as unknown as Rec, defaults: ANGEL_RAFI_TUNING_DEFAULTS as unknown as Rec },
  { boss: 'uri', label: 'ウリ', fields: ANGEL_URI_FIELDS, table: ANGEL_URI_TUNING as unknown as Rec, defaults: ANGEL_URI_TUNING_DEFAULTS as unknown as Rec },
  { boss: 'suriel', label: 'スリィエル', fields: ANGEL_SURIEL_FIELDS, table: ANGEL_SURIEL_TUNING as unknown as Rec, defaults: ANGEL_SURIEL_TUNING_DEFAULTS as unknown as Rec },
  { boss: 'acrasiel', label: 'アクラシエル', fields: ANGEL_ACRASIEL_FIELDS, table: ANGEL_ACRASIEL_TUNING as unknown as Rec, defaults: ANGEL_ACRASIEL_TUNING_DEFAULTS as unknown as Rec },
];

describe('天使6体がボスメーカーに登録されている', () => {
  beforeEach(() => { registerAngelTuning(); });

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

  it('部屋の相手一覧(セレクト欄)に6体が入っている', () => {
    for (const c of CASES) {
      expect(BOSS_MAKER_BOSSES, c.boss).toContain(c.boss);
      expect(parseBossMakerBoss(`?makerboss=${c.boss}`)).toBe(c.boss);
    }
  });
});

describe('スキーマの打ち間違い検知(6体まとめて)', () => {
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
      registerAngelTuning();
      const help = getBossTuning(c.boss)?.sectionHelp ?? {};
      const secs = [...new Set(c.fields.map(f => f.section))];
      expect(secs.filter(s => !(s in help))).toEqual([]);
    });
  }
});

describe('技ごとの秒数(予告/硬直)が漏れていない', () => {
  it('判定を持つ技には必ず「予告」と「硬直」がある', () => {
    const want: readonly [readonly TuningField[], string, string][] = [
      [ANGEL_MIGUEL_FIELDS, 'harai.windup', 'harai.tateRecover'],
      [ANGEL_MIGUEL_FIELDS, 'volley.windup', 'volley.recover'],
      [ANGEL_MIGUEL_FIELDS, 'dash.windup', 'dash.recover'],
      [ANGEL_JIBRIL_FIELDS, 'volley.windup', 'volley.recover'],
      [ANGEL_JIBRIL_FIELDS, 'lantern.windup', 'lantern.recover'],
      [ANGEL_JIBRIL_FIELDS, 'consecrate.windup', 'consecrate.recover'],
      [ANGEL_JIBRIL_FIELDS, 'lance.minWindup', 'lance.recover'],
      [ANGEL_JIBRIL_FIELDS, 'warp.windup', 'warp.recover'],
      [ANGEL_RAFI_FIELDS, 'bone.windup', 'bone.recover'],
      [ANGEL_RAFI_FIELDS, 'jump.windup', 'jump.recover'],
      [ANGEL_RAFI_FIELDS, 'sweep.windup', 'sweep.recover'],
      [ANGEL_URI_FIELDS, 'sweep.windup', 'sweep.recover'],
      [ANGEL_URI_FIELDS, 'downslash.windup', 'downslash.recover'],
      [ANGEL_URI_FIELDS, 'thrust.windup', 'thrust.recover'],
      [ANGEL_URI_FIELDS, 'bolt.windup', 'bolt.recover'],
      [ANGEL_SURIEL_FIELDS, 'ringshot.beamWindup', 'ringshot.recover'],
      [ANGEL_SURIEL_FIELDS, 'ringspin.windup', 'ringspin.recover'],
      [ANGEL_SURIEL_FIELDS, 'sweep.windup', 'sweep.recover'],
      [ANGEL_SURIEL_FIELDS, 'gaze.windup', 'gaze.recover'],
      [ANGEL_ACRASIEL_FIELDS, 'spike.windup', 'spike.recover'],
      [ANGEL_ACRASIEL_FIELDS, 'spear.windup', 'spear.recover'],
      [ANGEL_ACRASIEL_FIELDS, 'warp.windup', 'warp.recover'],
      [ANGEL_ACRASIEL_FIELDS, 'burst.windup', 'burst.recover'],
      [ANGEL_ACRASIEL_FIELDS, 'gaze.windup', 'gaze.recover'],
    ];
    for (const [fields, w, r] of want) {
      expect(fields.some(f => f.path === w), w).toBe(true);
      expect(fields.some(f => f.path === r), r).toBe(true);
    }
  });
});

// ================================================================================================
// 6体共通の値(★複製して分岐を作らない=共有のまま1箇所)
// ================================================================================================
describe('共通の値は6体で同じ実体を指している', () => {
  it('どのボスのテーブルからも同じ common オブジェクトが見える', () => {
    for (const c of CASES) {
      expect((c.table as { common: unknown }).common, c.boss).toBe(ANGEL_COMMON_TUNING);
    }
  });

  it('片方の画面で動かすと6体全員に効く(=複製されていない)', () => {
    const before = ANGEL_COMMON_TUNING.burst.shots;
    setAtPath(ANGEL_MIGUEL_TUNING as unknown as Rec, 'common.burst.shots', before + 1);
    expect(getAtPath(ANGEL_URI_TUNING as unknown as Rec, 'common.burst.shots')).toBe(before + 1);
    setAtPath(ANGEL_MIGUEL_TUNING as unknown as Rec, 'common.burst.shots', before); // 後片付け
    expect(ANGEL_COMMON_TUNING.burst.shots).toBe(before);
  });

  it('共通の欄には「6体で共通」とヘルプに書いてある(1つ動かすと全員に効くため)', () => {
    for (const c of CASES) {
      for (const f of c.fields.filter(x => x.path.startsWith('common.'))) {
        expect(f.hint ?? '', `${c.boss} ${f.path}`).toContain('共通');
      }
    }
  });
});

describe('コピー→貼り戻しが往復する(実データで)', () => {
  beforeEach(() => { registerAngelTuning(); });

  it('ミゲル: 帯の寸法と踏み込みも含めて元の状態へ戻る', () => {
    const e = getBossTuning('miguel')!;
    setAtPath(e.table, 'harai.range', 260);
    setAtPath(e.table, 'lunge.maxPx', 200);
    const txt = formatTuningText(e, 'v0');
    resetTuning(e);
    const r = parseTuningText(e, txt);
    expect(r.errors).toEqual([]);
    expect(getAtPath(e.table, 'harai.range')).toBe(260);
    expect(getAtPath(e.table, 'lunge.maxPx')).toBe(200);
    resetTuning(e); // 後片付け(部屋を出る時と同じ=本編へ調整値を持ち出さない)
    expect(changedPaths(e)).toEqual([]);
  });

  it('6体とも「リセット=既定へ戻る」が効く(本編へ調整値が残らない)', () => {
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
// スキーマ側、実際に始められる技(ANGEL_MOVES_BY_TYPE)はボス側にあるので、**別々に育つと必ずズレる**。
describe('▸個別再生の配線(6体まとめて)', () => {
  beforeEach(() => { registerAngelTuning(); });

  for (const c of CASES) {
    it(`${c.boss}: playables/onPlay/playState が登録されている(=画面に▸が生える)`, () => {
      const e = getBossTuning(c.boss)!;
      expect(e.playables?.length ?? 0).toBeGreaterThan(0);
      expect(typeof e.onPlay).toBe('function');
      expect(typeof e.playState).toBe('function');
    });

    it(`${c.boss}: 全ての▸がボス側の実在する技を指している(押して何も起きないボタンが無い)`, () => {
      const e = getBossTuning(c.boss)!;
      const known = ANGEL_MOVES_BY_TYPE[c.boss] ?? [];
      const bad = (e.playables ?? []).filter(p => !known.includes(p.key as never));
      expect(bad.map(p => p.key)).toEqual([]);
    });

    it(`${c.boss}: ボス側の技は全て▸から出せる(繰り越し無し=社長指示「技再生ボタンは必須」)`, () => {
      const keys = new Set((ANGEL_PLAYABLES_BY_TYPE[c.boss] ?? []).map(p => p.key));
      const missing = (ANGEL_MOVES_BY_TYPE[c.boss] ?? []).filter(m => !keys.has(m));
      expect(missing).toEqual([]);
    });

    it(`${c.boss}: ▸の見出し(section)が数値欄の見出しと一致する(節が2つに割れない)`, () => {
      const secs = new Set(c.fields.map(f => f.section));
      const bad = (ANGEL_PLAYABLES_BY_TYPE[c.boss] ?? []).filter(p => !secs.has(p.section));
      expect(bad.map(p => p.section)).toEqual([]);
    });

    // P2(bossPhase を書くだけのボタン)は天使では**押しても何も起きない**——各tickが毎フレーム
    // HPからフェーズを計算して bossPhase を上書きするため。後半の型は HP40%/瀕死 で到達する
    // (舞妓と同じ扱い・v0.25.3563の裁定)。フェーズをbossPhaseで持つ設計に変えたらここも変える。
    it(`${c.boss}: hasPhase2 を宣言しない(効かないP2ボタンを出さない)`, () => {
      expect(getBossTuning(c.boss)!.hasPhase2).toBeFalsy();
    });
  }

  it('技キーは6体で重複していない(取り違えが起きない)', () => {
    const all = Object.values(ANGEL_MOVES_BY_TYPE).flat();
    expect(new Set(all).size).toBe(all.length);
  });
});
