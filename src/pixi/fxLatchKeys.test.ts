// ★ラッチ(pixiScene.latchFx)の鍵の見張り(2026-11-28・社長実機 v0.25.5909 stage-4 t649s の「前回最後」で `maps … fxLatches252`)。
// fxLatches は「その鍵でもう一度呼ばれ、時間が尽きた時」にしか消えない。敵ごとの鍵は、敵の絵を片付ける所で
// `clearFxLatches(`${id}:`)` がまとめて消す=**鍵が敵の id で始まっていないと、敵が死んだ後も出撃の終わりまで残る**。
// 実例: 格闘の締めで吹き飛んだ敵の砂埃 `brawler:blow:${e.id}:${k}`(窓520ms < 尺560ms なので必ず t<1 で呼ばれなくなり、吹き飛ばすたびに積もった)。
// ⇒ 鍵に敵の id(`${e.id}` / `${id}`)を埋め込むなら、先頭に置くこと。
import { describe, it, expect } from 'vitest';
// ソースは vite の ?raw で読む(@types/node を入れていないので node:fs は使わない。clockLedger.test.ts と同じ流儀)。
import SCENE from './pixiScene.ts?raw';

/** latchFx の最初の引数がテンプレート文字列のものを全部拾う(改行を挟む呼び方も含む)。 */
const latchTemplateKeys = (src: string): string[] => {
  const out: string[] = [];
  const re = /latchFx\(\s*`([^`]*)`/g;
  for (let m = re.exec(src); m; m = re.exec(src)) out.push(m[1]);
  return out;
};

describe('fxLatches の鍵: 敵の id を埋め込むなら先頭に置く(敵の片付けで消えるように)', () => {
  it('pixiScene の latchFx の鍵を拾えている(走査が空回りしていない)', () => {
    expect(latchTemplateKeys(SCENE).length).toBeGreaterThan(20);
  });
  it('`${e.id}` / `${id}` を含む鍵は、それで始まる', () => {
    const bad = latchTemplateKeys(SCENE).filter(k => /\$\{(e\.id|id)\}/.test(k) && !/^\$\{(e\.id|id)\}:/.test(k));
    expect(bad).toEqual([]);
  });
  it('敵の片付けで clearFxLatches(`${id}:`) を呼んでいる', () => {
    expect(SCENE).toContain('this.clearFxLatches(`${id}:`)');
  });
});
