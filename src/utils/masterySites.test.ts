// 熟練度の「掛ける所・貯める所」の台帳テスト(research/MASTERY.md v2 §4-3・v2.1 A-9/A-10)。
//
// 規則:
//  - `damageEnemy(` の呼び出しは1件残らず「`withMastery(` の括弧の中」にあるか、
//    同じ行か直前の行に `// mastery: <key>(理由)` の印がある。印だけで済ませてよいのは、
//    その呼び口を呼ぶ側がもうそのキーで包んでいる共通の口の中だけ(v2.1 A-10)。
//  - `damageEnemy` を通らず体力を直接減らす5関数は、名前で台帳に載せ、本体で貯める口を呼ぶ。
//  - 呼び口が増えたら件数で落ちる(新しい呼び口=キーを決めて包んでから件数を更新する)。
//
// 数える範囲: hooks/useGameLoop.ts・store/gameStore.ts・utils/*.ts(テストを除く)。
// コメントの中の `damageEnemy(` は数えない。印はコメントを消す前に拾う。
import { describe, it, expect } from 'vitest';
import { GROWING_MASTERY_KEYS } from '../data/mastery';

// ソースは vite の ?raw で読む(このリポジトリは @types/node を入れていない=meleeSwingCommit.test.ts と同じ作法)。
const SOURCES = import.meta.glob<string>(
  ['../hooks/useGameLoop.ts', '../store/gameStore.ts', './*.ts', '!./*.test.ts'],
  { query: '?raw', import: 'default', eager: true },
);

/** `damageEnemy(` の呼び出しの総数(包んだ数+印で済ませた数)。呼び口を足したら、包んでからこの数を直す。 */
const EXPECTED_CALLS = 62;

const VALID_KEYS = new Set<string>([...GROWING_MASTERY_KEYS, 'loadout', 'none', 'max']);

/**
 * コメントと文字列の中身を空白に置き換える(位置と改行は保つ)。
 * 正規表現リテラルは、直前の意味のある文字が演算子・区切りの時だけ読み飛ばす(簡易)。
 */
const blankCommentsAndStrings = (src: string): string => {
  const out = src.split('');
  const n = src.length;
  let i = 0;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  let lastSig = '';
  const tplStack: number[] = []; // テンプレートの ${ の入れ子の深さ
  let braceDepth = 0;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      const e = src.indexOf('\n', i);
      const end = e < 0 ? n : e;
      blank(i, end);
      i = end;
      continue;
    }
    if (c === '/' && d === '*') {
      const e = src.indexOf('*/', i + 2);
      const end = e < 0 ? n : e + 2;
      blank(i, end);
      i = end;
      continue;
    }
    if (c === '\'' || c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
      blank(i + 1, j);
      i = j + 1;
      lastSig = c;
      continue;
    }
    if (c === '`' || (c === '}' && tplStack.length > 0 && tplStack[tplStack.length - 1] === braceDepth)) {
      if (c === '}') tplStack.pop();
      let j = i + 1;
      while (j < n && src[j] !== '`') {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '$' && src[j + 1] === '{') { tplStack.push(braceDepth); j += 2; break; }
        j++;
      }
      const closed = src[j] === '`';
      blank(i + 1, closed ? j : j - 2);
      i = closed ? j + 1 : j;
      lastSig = '`';
      continue;
    }
    if (c === '/' && (lastSig === '' || '(,=:[!&|?{};+-*%<>~^'.includes(lastSig))) {
      // 正規表現リテラル
      let j = i + 1;
      let inClass = false;
      while (j < n && src[j] !== '\n') {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        else if (src[j] === '/' && !inClass) break;
        j++;
      }
      blank(i + 1, j);
      i = j + 1;
      lastSig = '/';
      continue;
    }
    if (c === '{') braceDepth++;
    else if (c === '}') braceDepth--;
    if (!/\s/.test(c)) lastSig = c;
    i++;
  }
  return out.join('');
};

/** `open` の位置の `(` に対応する `)` の位置(コメント・文字列は空白にした後の文字列で数える)。 */
const matchParen = (s: string, open: number): number => {
  let depth = 0;
  for (let k = open; k < s.length; k++) {
    if (s[k] === '(') depth++;
    else if (s[k] === ')') { depth--; if (depth === 0) return k; }
  }
  return -1;
};

const lineOf = (s: string, idx: number): number => {
  let l = 0;
  for (let k = 0; k < idx; k++) if (s[k] === '\n') l++;
  return l;
};

interface CallSite { file: string; line: number; wrapped: boolean; marker: string | null }

const scan = (): CallSite[] => {
  const sites: CallSite[] = [];
  for (const [path, raw] of Object.entries(SOURCES)) {
    const file = path.replace(/^\.\.\//, '').replace(/^\.\//, 'utils/');
    const code = blankCommentsAndStrings(raw);
    const rawLines = raw.split('\n');
    // withMastery( の括弧の範囲
    const ranges: [number, number][] = [];
    const wm = /\bwithMastery\(/g;
    let m: RegExpExecArray | null;
    while ((m = wm.exec(code))) {
      const open = m.index + m[0].length - 1;
      ranges.push([open, matchParen(code, open)]);
    }
    const de = /\bdamageEnemy\(/g;
    while ((m = de.exec(code))) {
      const idx = m.index;
      const line = lineOf(code, idx);
      const wrapped = ranges.some(([a, b]) => idx > a && b > idx);
      const markRe = /\/\/\s*mastery:\s*([a-z-]+)/;
      const mk = rawLines[line]?.match(markRe) ?? rawLines[line - 1]?.match(markRe) ?? null;
      sites.push({ file, line: line + 1, wrapped, marker: mk ? mk[1] : null });
    }
  }
  return sites;
};

/** `open` の位置の `{` に対応する `}` の位置。 */
const matchBrace = (s: string, open: number): number => {
  let depth = 0;
  for (let k = open; k < s.length; k++) {
    if (s[k] === '{') depth++;
    else if (s[k] === '}') { depth--; if (depth === 0) return k; }
  }
  return -1;
};

/** `idx` を囲む一番内側の `{` の位置(無ければ -1)。 */
const enclosingBrace = (s: string, idx: number): number => {
  let depth = 0;
  for (let k = idx - 1; k >= 0; k--) {
    if (s[k] === '}') depth++;
    else if (s[k] === '{') { if (depth === 0) return k; depth--; }
  }
  return -1;
};

interface ProjectileBuild { file: string; line: number; hasMasteryKey: boolean; marker: boolean }

/**
 * 弾(Projectile)の組み立て=`weaponKey:` を持つオブジェクトのうち、弾の形の欄(`weaponType:`・`hitEnemies:`・`direction:` のどれか)も持つ物。
 * 型の宣言・関数の引数・弾でない記録(解放の記録など)は、この欄が無いので数えない。
 */
const scanProjectileBuilds = (): ProjectileBuild[] => {
  const out: ProjectileBuild[] = [];
  for (const [path, raw] of Object.entries(SOURCES)) {
    const file = path.replace(/^\.\.\//, '').replace(/^\.\//, 'utils/');
    const code = blankCommentsAndStrings(raw);
    const rawLines = raw.split('\n');
    const seen = new Set<number>();
    const wk = /\bweaponKey\??:/g;
    let m: RegExpExecArray | null;
    while ((m = wk.exec(code))) {
      const open = enclosingBrace(code, m.index);
      if (open < 0 || seen.has(open)) continue;
      const close = matchBrace(code, open);
      if (close < 0) continue;
      const body = code.slice(open, close + 1);
      if (!/\bweaponType\??:|\bhitEnemies\??:|\bdirection\??:/.test(body)) continue;
      // 型の宣言(interface/type)は除く: `{` の直前が `interface X` / `type X =` / `:` の型注釈
      const before = code.slice(Math.max(0, open - 200), open);
      if (/\binterface\s+\w+(\s+extends\s+[\w<>, ]+)?\s*$|\btype\s+\w+\s*=\s*$/.test(before)) continue;
      seen.add(open);
      const line = lineOf(code, open);
      const markRe = /\/\/\s*mastery:/;
      const marker = markRe.test(rawLines[line] ?? '') || markRe.test(rawLines[line - 1] ?? '');
      out.push({ file, line: line + 1, hasMasteryKey: /\bmasteryKey\??:/.test(body), marker });
    }
  }
  return out;
};

/** damageEnemy を通らず体力を直接減らす5関数(v2 §4-1)。本体で貯める口を呼ぶこと。 */
const DIRECT_FUNCTIONS = ['triggerCounter', 'performKatanaStrike', 'performWhipStrike', 'shadowCloneStrike', 'skaterBoardHit'] as const;

describe('熟練度の台帳(masterySites)', () => {
  const sites = scan();

  it('damageEnemy( の呼び出しは全部 withMastery の中か、印がある', () => {
    const bad = sites.filter(s => !s.wrapped && s.marker === null).map(s => `${s.file}:${s.line}`);
    expect(bad).toEqual([]);
  });

  it('印のキーは実在のキー', () => {
    const bad = sites.filter(s => s.marker !== null && !VALID_KEYS.has(s.marker)).map(s => `${s.file}:${s.line} ${s.marker}`);
    expect(bad).toEqual([]);
  });

  it(`呼び出しの総数は ${EXPECTED_CALLS}(増えたら、キーを決めて包んでから数を直す)`, () => {
    expect(sites.length).toBe(EXPECTED_CALLS);
  });

  it('弾の組み立て(weaponKey: を持つ物)は masteryKey を入れるか、直前の行に // mastery: <理由> の印がある', () => {
    const builds = scanProjectileBuilds();
    expect(builds.length).toBeGreaterThan(0);
    const bad = builds.filter(b => !b.hasMasteryKey && !b.marker).map(b => `${b.file}:${b.line}`);
    expect(bad).toEqual([]);
  });

  it('直接減らす5関数は本体で貯める口を呼ぶ', () => {
    const raw = SOURCES['../store/gameStore.ts'];
    const code = blankCommentsAndStrings(raw);
    for (const name of DIRECT_FUNCTIONS) {
      const start = code.indexOf(`  ${name}: (`, code.indexOf('create<GameState>'));
      expect(start, name).toBeGreaterThan(0);
      const rest = code.slice(start + 1);
      const next = rest.search(/\n {2}[A-Za-z_$][\w$]*: \(/);
      const body = next < 0 ? rest : rest.slice(0, next);
      expect(/\bnoteMasteryDirectHits\(|\bnoteMasteryDamage\(/.test(body), name).toBe(true);
    }
  });
});
