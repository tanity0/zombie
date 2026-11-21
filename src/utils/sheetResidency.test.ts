// ★★シートの常駐の決定表(`SHEET_RESIDENCY`)の穴を塞ぐ検査(社長指示2026-09-24「乗せて」)。
//
// ★なぜ機械で見るか: 起動マニフェストはシート表のキーを**自動で全部展開する**ので、
// **表に1行足しただけで起動時常駐が増える**——しかも**誰も気づかない**(画面は何も変わらない)。
// 「気づく」を人間の注意力に任せない。
//
// ★寸法は `scripts/asset-masters.json`(原盤台帳)から引く。この台帳は `npm run assets:check` が
// **CIで毎push検査している**ので、素材と食い違ったままにはならない。
import { describe, it, expect } from 'vitest';
import { SHEET_RESIDENCY, allEnemySheets, sheetDeferred } from './enemySheets';
import ledger from '../../scripts/asset-masters.json';

const FILES = (ledger as { files: Record<string, { w: number; h: number }> }).files;
/** テクスチャの常駐MB。**縦×横×4バイト**(PNGの圧縮率は1バイトも効かない)。 */
const residentMB = (sheet: string): number => {
  const f = FILES[`sprites/${sheet}.png`];
  return f ? (f.w * f.h * 4) / 1048576 : 0;
};
/** これを超えるシートは「起動時に読むか」を**決めて書く**こと。 */
const DECIDE_ABOVE_MB = 1.0;

describe('★シートの常駐の決定表', () => {
  it('検査対象が空ではない(表が読めていないと、この検査は何も言っていない)', () => {
    expect(allEnemySheets().length).toBeGreaterThan(10);
    expect(Object.keys(FILES).length).toBeGreaterThan(100);
  });

  it('★★常駐1.0MBを超えるシートは、決定表に載っていること(黙って起動時常駐を増やさない)', () => {
    const missing = allEnemySheets()
      .filter(s => residentMB(s.sheet) > DECIDE_ABOVE_MB && SHEET_RESIDENCY[s.idle] === undefined)
      .map(s => `${s.idle}（${s.sheet} = ${residentMB(s.sheet).toFixed(2)}MB）`);
    expect(
      missing,
      `SHEET_RESIDENCY へ 'deferred'（カットイン等の猶予がある個体）か 'eager'（前触れなく出る個体）を書く: ${missing.join(' / ')}`,
    ).toEqual([]);
  });

  it('★決定表のキーは実在するシートを持つこと(打ち間違えると黙って起動時常駐へ戻る)', () => {
    const withSheets = new Set(allEnemySheets().map(s => s.idle));
    for (const idle of Object.keys(SHEET_RESIDENCY)) {
      expect(withSheets.has(idle), `SHEET_RESIDENCY の '${idle}' はシートを1枚も持っていない`).toBe(true);
    }
  });

  // ★★品質監査2026-09-24 の指摘: これが無いと、上の1.0MBの門が**いちばん起きる事故で開く**。
  //   `residentMB` は台帳に無いシートを 0MB と数え、`npm run assets:check` は**新顔を注意として
  //   出すだけで落とさない**。⇒「3MBのシートを足して `assets:ledger` を忘れる」が CI 緑で素通りし、
  //   **この検査が塞ぎたい事故そのもの**(黙って起動時常駐が増える)が起きる。
  it('★★全シートが原盤台帳に載っていること(台帳の更新漏れを、ここで落とす)', () => {
    const missing = allEnemySheets()
      .filter(s => FILES[`sprites/${s.sheet}.png`] === undefined)
      .map(s => s.sheet);
    expect(missing, `\`npm run assets:ledger\` で台帳を更新する: ${missing.join(' / ')}`).toEqual([]);
  });

  it('遅延にした2体（死神・城ボス）が実際に遅延側へ割れている', () => {
    for (const idle of ['reaper2-common', 'giantbat']) expect(sheetDeferred(idle)).toBe(true);
    // 起動時のまま。雑魚・強個体は前触れなく出る／ハンターは全ステージで出るので遅延にしても減らない。
    for (const idle of ['hunter', 'pumpkin-common', 'driller-common', 'reaper-common']) {
      expect(sheetDeferred(idle)).toBe(false);
    }
    expect(sheetDeferred('bat-female')).toBe(false); // 表に無い立ち絵の既定＝起動時
  });

  it('★遅延にしたぶんの常駐が実際に外れている(数えてから書く)', () => {
    const off = allEnemySheets()
      .filter(s => sheetDeferred(s.idle))
      .reduce((n, s) => n + residentMB(s.sheet), 0);
    // ★**正確な合計では固定しない**——ボスのシートが1枚増えるたびにこのテストが落ちるだけで、
    //   守りたいのは「遅延が実際に効いているか」。下限で押さえ、内訳はコメントに残す。
    //   2026-09-24時点: 死神3.34 + 城ボス1(歩き0.68+跳び0.95) + 城ボス3(歩き1.65) = 6.62MB。
    expect(off).toBeGreaterThan(4);
  });
});
