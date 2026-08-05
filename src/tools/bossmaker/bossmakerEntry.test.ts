// 道具ページ(`bossmaker.html`)の起動クエリが、ゲーム側の `bossMakerQuery()` とズレていないか見張る。
// BOSS_MAKER.md §19-5-a。
//
// なぜテストが要るか: 注入は**インライン classic script**でやらなければならず(モジュールスコープ定数
// `const BOSS_MAKER = evParam('bossmaker')==='1'` に間に合わせるため)、classic script からは
// `bossMakerQuery` を import できない。よって**同じ組が2箇所に書かれる**。片方だけ直された時に
// 静かに壊れる(症状: 木は消えるのに雑魚が湧き続け、相手のボスが1体も出ない)ので機械で見張る。
import { describe, it, expect } from 'vitest';
// `?raw` で中身を文字列として取る(node:fs は tsconfig.app.json の型に無い=ブラウザ側の型定義のため)。
import html from '../../../bossmaker.html?raw';
import toolMain from './main.tsx?raw';
import { bossMakerQuery } from '../../utils/bossTest';

/** `bossmaker.html` のインライン script が持つ `need = {...}` を読み出す。 */
const needFromHtml = (): Record<string, string> => {
  const m = html.match(/var need = \{([\s\S]*?)\};/);
  if (!m) throw new Error('bossmaker.html: インライン script の `var need = {...}` が見つからない');
  const out: Record<string, string> = {};
  for (const line of m[1].split(',')) {
    const kv = line.match(/([A-Za-z]+)\s*:\s*'([^']*)'/);
    if (kv) out[kv[1]] = kv[2];
  }
  return out;
};

describe('bossmaker.html の起動クエリ', () => {
  it('bossMakerQuery() と同じキー・同じ値を注入する', () => {
    const expected = Object.fromEntries(
      new URLSearchParams(bossMakerQuery({ characterClass: 'warrior', ghostMode: null, ghostlog: false }))
    );
    expect(needFromHtml()).toEqual(expected);
  });

  it('注入はインライン classic script でやる(type="module" にしない)', () => {
    // `type="module"` は defer 相当なので、モジュール評価より後になり**間に合わない**。
    const idx = html.indexOf('var need = {');
    expect(idx).toBeGreaterThan(0);
    const openTag = html.lastIndexOf('<script', idx);
    expect(html.slice(openTag, idx)).not.toContain('type="module"');
  });

  it('既に付いているクエリを消さない(?class=… で開けること)', () => {
    expect(html).toContain('if (!p.has(k))');
  });

  it('道具側の main.tsx では replaceState しない(§19-5-a・ESMの評価順で手遅れになる)', () => {
    expect(toolMain).not.toContain('replaceState');
  });
});
