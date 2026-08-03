// BOSS_MAKER.md §18「「行動」を主要な数字だけにする(選ぶ + 裏マスター)」の受け入れ条件を機械化する。
//
// ★このファイルが守る一番大事なこと: **既定の挙動が1つも変わらないこと**。
// 「まん中」= アイドルの現行値そのもの、という組み方が崩れた瞬間に、社長が何も押していないのに
// ボスの挙動が変わる(CLAUDE.md「仕様変更のルール(最重要/MUST)」に抵触する)。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  BEHAVIOR_CHOICES, HIDDEN_SOLO_PATHS, hiddenPaths, stringLenWarnings,
} from './bossPresets';
import {
  getAtPath, setAtPath, resetTuning, changedPaths, formatTuningText, getBossTuning,
  choicePaths, choiceApplicable, matchedOption, matchedOptionLabel, choiceValues,
  type TuningChoiceField,
} from './bossTuning';
import { registerIdolTuning, IDOL_TUNING_FIELDS } from './idolTuning';
import { IDOL_TUNING, IDOL_TUNING_DEFAULTS } from './idolScript';

/** 「まん中」= 既定であるべき選択(§18-5)。 */
const MIDDLE: Record<string, string> = {
  range: 'mid', tempo: 'normal', hands: 'normal', rest: 'normal', punish: 'normal',
};

const byKey = (key: string): TuningChoiceField => {
  const f = BEHAVIOR_CHOICES.find(c => c.key === key);
  if (!f) throw new Error(`束が無い: ${key}`);
  return f;
};
/** ある選択が書き込む値を読む小道具(表の検算用)。 */
const val = (key: string, opt: string, path: string): number => {
  const v = choiceValues(byKey(key), opt)[path];
  if (v === undefined) throw new Error(`${key}/${opt} に ${path} が無い`);
  return v;
};

beforeEach(() => {
  registerIdolTuning();
  resetTuning(getBossTuning('idol')!);
});

// ================================================================================================
describe('★最重要: 既定の挙動が1つも変わらない', () => {
  it('既定値はすべて「まん中」の束と一致する(= 現行の実装値そのもの)', () => {
    for (const c of BEHAVIOR_CHOICES) {
      expect(matchedOption(IDOL_TUNING_DEFAULTS, c), `${c.label} の既定`).toBe(MIDDLE[c.key]);
    }
  });

  it('「まん中」を押しても既定から1つも変わらない(= 押しても無害)', () => {
    const entry = getBossTuning('idol')!;
    for (const c of BEHAVIOR_CHOICES) {
      for (const [path, v] of Object.entries(choiceValues(c, MIDDLE[c.key]))) setAtPath(entry.table, path, v);
    }
    expect(changedPaths(entry)).toEqual([]);
  });

  it('★束は stats.* を1つも持たない(生きている個体へのHP等の反映が要らないことの根拠)', () => {
    for (const c of BEHAVIOR_CHOICES) {
      expect(choicePaths(c).filter(p => p.startsWith('stats.')), `${c.label}`).toEqual([]);
    }
  });
});

// ================================================================================================
describe('マスターの健全性(typoの無言故障を潰す)', () => {
  // ★`setAtPath` は存在しないパスへ**黙って false** を返す。マスターに打ち間違いがあると
  // 「押しても何も起きない/常にカスタム」という、画面からは追えない故障になる。
  it('全パスがスキーマ(IDOL_TUNING_FIELDS)に実在する', () => {
    const known = new Set(IDOL_TUNING_FIELDS.map(f => f.path));
    for (const c of BEHAVIOR_CHOICES) {
      for (const p of choicePaths(c)) expect(known.has(p), `${c.label}: ${p}`).toBe(true);
    }
  });

  it('全パスがテーブルの実在する数値を指している', () => {
    for (const c of BEHAVIOR_CHOICES) {
      for (const p of choicePaths(c)) expect(getAtPath(IDOL_TUNING, p), `${c.label}: ${p}`).toBeTypeOf('number');
    }
  });

  it('どの束も選択肢を3つ持ち、キーが重複しない', () => {
    for (const c of BEHAVIOR_CHOICES) {
      expect(c.options.length, c.label).toBe(3);
      expect(new Set(c.options.map(o => o.key)).size, c.label).toBe(3);
    }
    expect(new Set(BEHAVIOR_CHOICES.map(c => c.key)).size).toBe(BEHAVIOR_CHOICES.length);
  });

  it('全ての選択肢が、その束の全パスを漏れなく持つ(片方だけ変わる事故を防ぐ)', () => {
    for (const c of BEHAVIOR_CHOICES) {
      const all = choicePaths(c);
      for (const o of c.options) {
        expect(Object.keys(o.values).sort(), `${c.label}/${o.label}`).toEqual([...all].sort());
      }
    }
  });

  it('そのボスに存在しないパスを含む束は出さない(choiceApplicable)', () => {
    for (const c of BEHAVIOR_CHOICES) expect(choiceApplicable(IDOL_TUNING, c), c.label).toBe(true);
    expect(choiceApplicable({ zoneEdges: {} }, byKey('range'))).toBe(false);
  });
});

// ================================================================================================
describe('★束の不変条件(3段すべてで成立する・§18-9-7)', () => {
  const OPTS = ['near', 'mid', 'far'] as const;

  it('間合い: 主戦帯の上限 = 中帯の上限', () => {
    for (const o of OPTS) {
      expect(val('range', o, 'neutralBand.max'), o).toBe(val('range', o, 'zoneEdges.nearMax'));
    }
  });

  it('間合い: 帯の境目が単調(密着 < 中 < 遠)', () => {
    for (const o of OPTS) {
      const [me, ne, mi] = ['zoneEdges.meleeMax', 'zoneEdges.nearMax', 'zoneEdges.midMax'].map(p => val('range', o, p));
      expect(me, o).toBeLessThan(ne);
      expect(ne, o).toBeLessThan(mi);
    }
  });

  it('間合い: 主戦帯の下限が密着帯の上限より外', () => {
    for (const o of OPTS) {
      expect(val('range', o, 'neutralBand.min'), o).toBeGreaterThan(val('range', o, 'zoneEdges.meleeMax'));
    }
  });

  // ★離脱ローリング(shape.rollDist=140・**技タブの値**)と `下限 = rollDist + 余白` で結ばれている。
  // 下限だけ動かすと「密着から離脱1回でちょうど主戦帯の下端へ戻る」が壊れるので、3段とも動かさない。
  it('★間合い: 主戦帯の下限は離脱ローリングの距離+40以上(技タブの値と噛み合っている)', () => {
    for (const o of OPTS) {
      expect(val('range', o, 'neutralBand.min'), o).toBeGreaterThanOrEqual(IDOL_TUNING_DEFAULTS.shape.rollDist + 40);
    }
  });

  // ★超えると「超遠帯の始まりより狙撃線が短い」=「遠距離に居させない」という本ボスの主題が壊れる。
  it('★間合い: 遠帯の上限が狙撃線の射程より内側', () => {
    for (const o of OPTS) {
      expect(val('range', o, 'zoneEdges.midMax'), o).toBeLessThan(IDOL_TUNING_DEFAULTS.shape.snipeRange);
    }
  });

  it('動きの速さ: 中立の最短 < 最長(乱数の幅が負にならない)', () => {
    for (const o of ['slow', 'normal', 'fast']) {
      expect(val('tempo', o, 'neutral.minMs'), o).toBeLessThan(val('tempo', o, 'neutral.maxMs'));
    }
  });

  it('手数: 必ず P2 = P1 + 1(フェーズ2で1段伸びる)', () => {
    for (const o of ['few', 'normal', 'many']) {
      expect(val('hands', o, 'stringLen.p2'), o).toBe(val('hands', o, 'stringLen.p1') + 1);
    }
  });

  it('★休符は0にしない(プレイヤーの攻撃チャンスが消える)', () => {
    for (const o of ['short', 'normal', 'long']) {
      expect(val('rest', o, 'rest.p1'), o).toBeGreaterThan(0);
      expect(val('rest', o, 'rest.p2'), o).toBeGreaterThan(0);
    }
  });

  it('懲罰: 遠距離の長居 < 密着の居座り < 同角度の長居', () => {
    for (const o of ['soft', 'normal', 'hard']) {
      expect(val('punish', o, 'punish.farMs'), o).toBeLessThan(val('punish', o, 'punish.meleeMs'));
      expect(val('punish', o, 'punish.meleeMs'), o).toBeLessThan(val('punish', o, 'punish.sameAngleMs'));
    }
  });
});

// ================================================================================================
describe('逆引き(選択の状態を二重に持たない・§18-6)', () => {
  const apply = (key: string, opt: string): void => {
    for (const [p, v] of Object.entries(choiceValues(byKey(key), opt))) setAtPath(IDOL_TUNING, p, v);
  };

  it('束を当てると、その束が点灯する', () => {
    apply('range', 'near');
    expect(matchedOption(IDOL_TUNING, byKey('range'))).toBe('near');
    apply('range', 'far');
    expect(matchedOption(IDOL_TUNING, byKey('range'))).toBe('far');
  });

  it('中の1つを直接変えると「カスタム」になり、戻すとまた点灯する(受け入れ条件5)', () => {
    apply('range', 'near');
    const before = getAtPath(IDOL_TUNING, 'zoneEdges.midMax')!;
    setAtPath(IDOL_TUNING, 'zoneEdges.midMax', before + 10);
    expect(matchedOption(IDOL_TUNING, byKey('range'))).toBeNull();
    expect(matchedOptionLabel(IDOL_TUNING, byKey('range'))).toBe('カスタム');
    setAtPath(IDOL_TUNING, 'zoneEdges.midMax', before);
    expect(matchedOption(IDOL_TUNING, byKey('range'))).toBe('near');
  });

  it('★浮動小数の表記差で消灯しない(0.05刻みが 0.35000000000000003 を作る)', () => {
    // 束そのものには小数が入らないが、逆引きの比較は必ず許容付きであること(将来 frac の束を足した時の保険)。
    const frac: TuningChoiceField = {
      key: 't', label: 'T', group: 'behavior', section: 'S',
      options: [{ key: 'a', label: 'A', values: { phaseHpThreshold: 0.35 } }],
    };
    setAtPath(IDOL_TUNING, 'phaseHpThreshold', Math.round(0.35 / 0.05) * 0.05);
    expect(matchedOption(IDOL_TUNING, frac)).toBe('a');
  });

  it('束を当てても、束の外の値(HP等)には触れない', () => {
    const hp = getAtPath(IDOL_TUNING, 'stats.health');
    apply('punish', 'hard');
    expect(getAtPath(IDOL_TUNING, 'stats.health')).toBe(hp);
  });
});

// ================================================================================================
describe('隠す欄の集合(§18-7-5: マスターから派生させる=二重管理しない)', () => {
  it('隠すのは「全束のパスの和集合 ∪ 単独の隠し値」', () => {
    const h = hiddenPaths(BEHAVIOR_CHOICES);
    for (const c of BEHAVIOR_CHOICES) for (const p of choicePaths(c)) expect(h.has(p), p).toBe(true);
    for (const p of HIDDEN_SOLO_PATHS) expect(h.has(p), p).toBe(true);
    expect(h.size).toBe(new Set([...BEHAVIOR_CHOICES.flatMap(choicePaths), ...HIDDEN_SOLO_PATHS]).size);
  });

  it('隠すのは20欄で、行動タブに残る数値欄は3つ(HP/接触ダメージ/移動速度)', () => {
    const h = hiddenPaths(BEHAVIOR_CHOICES);
    const behavior = IDOL_TUNING_FIELDS.filter(f => f.group === 'behavior');
    expect(behavior.length).toBe(23);
    expect(behavior.filter(f => h.has(f.path)).length).toBe(20);
    expect(behavior.filter(f => !h.has(f.path)).map(f => f.path))
      .toEqual(['stats.health', 'stats.damage', 'stats.speed']);
  });

  it('★隠した後も節は5つとも残る(チップの置き場が消えない=§18-4)', () => {
    const h = hiddenPaths(BEHAVIOR_CHOICES);
    const secs = new Set(IDOL_TUNING_FIELDS.filter(f => f.group === 'behavior' && !h.has(f.path)).map(f => f.section));
    for (const c of BEHAVIOR_CHOICES) secs.add(c.section);
    expect([...secs].sort()).toEqual(['ストリングと休符', '中立の移動', '基礎値', '懲罰', '間合い'].sort());
  });

  it('束を宣言していなければ何も隠れない(束を持たないボスは従来どおり)', () => {
    expect(hiddenPaths([]).size).toBe(HIDDEN_SOLO_PATHS.length);
  });
});

// ================================================================================================
describe('段数の警告(§18-5:「多」を選んでも台本が短いと効かない)', () => {
  it('段数の上限が台本の最長段数を超えていたら警告を出す', () => {
    // 既定の台本は9本とも4段。手数「多」= P1 4 / P2 5 は、P2 が 4 に切り詰められて並と同じになる。
    const w = stringLenWarnings({ p1: 4, p2: 5 }, IDOL_TUNING_DEFAULTS.strings.map(s => s.moves.length));
    expect(w.length).toBe(1);
    expect(w[0]).toContain('P2=5');
    expect(w[0]).toContain('4段');
  });

  it('収まっていれば何も言わない(既定=並では静か)', () => {
    expect(stringLenWarnings({ p1: 3, p2: 4 }, IDOL_TUNING_DEFAULTS.strings.map(s => s.moves.length))).toEqual([]);
  });

  it('台本が無い時に落ちない', () => {
    expect(stringLenWarnings({ p1: 3, p2: 4 }, [])).toEqual([]);
  });
});

// ================================================================================================
describe('コピーの平文に選択名が出る(§18-7-2:「貼るだけで伝わる」)', () => {
  it('既定では「間合い = 中」等が出る', () => {
    const txt = formatTuningText(getBossTuning('idol')!, 'test');
    expect(txt).toContain('【間合い】= 中');
    expect(txt).toContain('【手数】= 並');
    expect(txt).toContain('【懲罰】= 並');
  });

  it('束を変えると平文の選択名も変わる', () => {
    for (const [p, v] of Object.entries(choiceValues(byKey('range'), 'far'))) setAtPath(IDOL_TUNING, p, v);
    expect(formatTuningText(getBossTuning('idol')!, 'test')).toContain('【間合い】= 遠');
  });

  it('中間値なら「カスタム」と出る(何が起きているか貼る相手に伝わる)', () => {
    setAtPath(IDOL_TUNING, 'zoneEdges.midMax', 777);
    expect(formatTuningText(getBossTuning('idol')!, 'test')).toContain('【間合い】= カスタム');
  });
});
