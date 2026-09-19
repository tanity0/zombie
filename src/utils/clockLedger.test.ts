// ★時計の台帳(社長の問い2026-09-19「さっきのskeletonバグが他の敵にも無いか?」への機械化)。
//
// このゲームには**2つの時計**がある。型はどちらも `number` なので、**取り違えても型検査は素通りする。**
//   - `gameTime` 系: 出撃からの経過ms(ポーズで止まる)。35秒なら約 35,000。
//   - `Date.now()` 系: 実時間。約 1,770,000,000,000。
// 桁が10億倍違うので、取り違えると**比較が常に真か常に偽**になり、**症状は「永久に止まる」か
// 「一度も出ない」**という極端な形で出る。実際に踏んだもの:
//   - `liftUntil`(Date.now系)を gameTime と比べていた → **一度浮かせた敵は二度と攻撃しない**(v0.25.4516)
//   - `bossPhaseFlashUntil`(gameTime系)を Date.now と比べていた → **相が上がった白フラッシュが一度も出ない**
//
// ⇒ **台帳を持ち、ソースを走査して「反対の時計と比べていないか」を機械で見る。**
import { describe, it, expect } from 'vitest';
// ソースは vite の ?raw で読む(このリポジトリは @types/node を入れていないので node:fs は使わない。
// `bossFullStunCoverage.test.ts` / `ghostTelegraph.test.ts` と同じ流儀)。
const SOURCES = import.meta.glob<string>(
  ['../store/*.ts', '../hooks/*.ts', '../pixi/*.ts', '../utils/*.ts', '../components/*.tsx', '../world/*.ts'],
  { query: '?raw', import: 'default', eager: true },
);
const FILES: Array<[string, string]> = Object.entries(SOURCES)
  .filter(([p]) => !p.includes('.test.'))
  .map(([p, src]) => [p.replace(/^\.\.\//, 'src/'), src]);

/** ★`Date.now()` で書かれるフィールド(実時間)。比較も実時間側でやること。 */
const REAL_CLOCK_FIELDS = [
  'liftUntil', 'knockbackUntil', 'knockbackImmuneUntil', 'knockbackShoveUntil', 'hitStunUntil',
] as const;
/** ★`gameTime` で書かれるフィールド(ポーズで止まる)。比較も gameTime 側でやること。 */
const GAME_CLOCK_FIELDS = [
  'stunUntil', 'rootUntil', 'bossFullStunUntil', 'aiPhaseUntil', 'aiReadyAt', 'biteReadyAt',
  'biteRecoverUntil', 'chaffMoveCdUntil', 'bossStateUntil', 'bossNextActionAt', 'bossPhaseFlashUntil',
] as const;

// ★素の `now` も数える。**ここを外していたせいで最初の網は素通りした**(自分で戻して確かめた)。
// ただし `now` は名前だけでは決まらない——`gameStore.ts` には `const now = state.gameTime`(=gameTime系)
// と `const now = Date.now()` の両方がある。⇒ **比較行より上にある直近の `const now = …` で判定**し、
// 決められない行は「不明」として落とさない(嘘の合格も、嘘の不合格も作らない)。
const REAL_TOKENS = ['Date.now()', 'nowMs', 'pnow', 'realNow'];
const GAME_TOKENS = ['gameTime', 'newGameTime', 'gameTimeNow'];



/** `<lhs> < x.<field>` と `x.<field> > <rhs>` の**比較の相手側**だけを拾う(代入は対象外)。 */
const comparisonsAgainst = (field: string): Array<{ file: string; line: number; text: string; bareNow?: boolean }> => {
  const out: Array<{ file: string; line: number; text: string; bareNow?: boolean }> = [];
  const a = new RegExp(`([A-Za-z0-9_.()\\[\\] ]{1,40})\\s*[<>]=?\\s*\\(?\\s*[A-Za-z_][A-Za-z0-9_.]*\\.${field}\\b`);
  const b = new RegExp(`[A-Za-z_][A-Za-z0-9_.]*\\.${field}\\s*[<>]=?\\s*([A-Za-z0-9_.()\\[\\] ]{1,40})`);
  for (const [f, src] of FILES) {
    src.split('\n').forEach((raw, i) => {
      const code = raw.split('//')[0];
      if (!code.includes(field)) return;
      for (const re of [a, b]) {
        const m = re.exec(code);
        if (m) out.push({ file: f, line: i + 1, text: m[1].trim(), bareNow: /(^|[^A-Za-z0-9_.])now\s*$/.test(m[1]) });
      }
    });
  }
  return out;
};

/**
 * 素の `now` がどちらの時計かを、**その行より上にある直近の `const now = …`** で決める。
 * 見つからない(引数で受けている等)場合は `null`=判定しない。
 */
const resolveBareNow = (file: string, line: number): 'REAL' | 'GAME' | null => {
  const src = FILES.find(([f]) => f === file)?.[1];
  if (src === undefined) return null;
  const lines = src.split('\n');
  for (let i = Math.min(line - 1, lines.length - 1); i >= 0; i--) {
    const m = /const\s+now\s*=\s*(.+)$/.exec(lines[i].split('//')[0]);
    if (!m) continue;
    const expr = m[1];
    if (GAME_TOKENS.some(t => expr.includes(t))) return 'GAME';
    if (REAL_TOKENS.some(t => expr.includes(t)) || /Date\.now/.test(expr)) return 'REAL';
    return null;
  }
  return null;
};

const clockOf = (c: { file: string; line: number; text: string; bareNow?: boolean }): 'REAL' | 'GAME' | null => {
  if (GAME_TOKENS.some(t => c.text.includes(t))) return 'GAME';
  if (REAL_TOKENS.some(t => c.text.includes(t))) return 'REAL';
  if (c.bareNow) return resolveBareNow(c.file, c.line);
  return null;
};

describe('★2つの時計を取り違えていない(型検査が素通りする事故の機械化)', () => {
  for (const field of REAL_CLOCK_FIELDS) {
    it(`${field} は実時間(Date.now)系。gameTime と比べていない`, () => {
      const bad = comparisonsAgainst(field).filter(c => clockOf(c) === 'GAME');
      expect(bad.map(c => `${c.file}:${c.line} (${c.text})`)).toEqual([]);
    });
  }
  for (const field of GAME_CLOCK_FIELDS) {
    it(`${field} は gameTime 系。Date.now と比べていない`, () => {
      const bad = comparisonsAgainst(field).filter(c => clockOf(c) === 'REAL');
      expect(bad.map(c => `${c.file}:${c.line} (${c.text})`)).toEqual([]);
    });
  }

  it('★台帳そのものが空でない(将来うっかり空にして素通りさせない)', () => {
    expect(REAL_CLOCK_FIELDS.length).toBeGreaterThanOrEqual(5);
    expect(GAME_CLOCK_FIELDS.length).toBeGreaterThanOrEqual(10);
  });
});
