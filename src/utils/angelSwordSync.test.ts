import { describe, it, expect } from 'vitest';
// ソースを**テキストとして**読む(Viteの ?raw)。pixiScene.ts 側の定数は export されていないので
// import では取れない。node:fs は tsconfig.app に node 型が無く typecheck が通らないためこちらを使う。
import angelBossTickSrc from './angelBossTick.ts?raw';
import pixiSceneSrc from '../pixi/pixiScene.ts?raw';

// 天使ボス(ミゲル/ウリ)の剣は、**判定側と描画側で同名の定数が手写しで二重管理**されている。
//   ゲームロジック: src/utils/angelBossTick.ts (module-private const)
//   描画:           src/pixi/pixiScene.ts     (同名のローカルconst)
// 描画側は `activeProg = 1 - 残り時間 / ACTIVE_MS` で振りの進行度を出しているだけなので、
// 2つがズレると次のどちらかが必ず起きる:
//   ・描画 > 判定 … 振り始めの姿勢で固まってから、最後に一気に振り抜ける
//   ・描画 < 判定 … 先に振り終わって、判定が生きている間ずっと振り抜き姿勢で止まる
// どちらも CLAUDE.md「危険を伝える絵=判定に揃える/赤いのに当たらないは厳禁」に抵触する。
//
// v0.25.2885 で振り速度2倍(=ACTIVE_MSを半分)にした時、**両方を直す必要がある**ことが分かったので、
// 一致をテストで機械化する(実装精度の規律6「教訓は即機械化」)。
// pixiScene.ts 側は export されていないため、ソースを読んでリテラルを突き合わせる。

/** `const NAME = 123;` の 123 を取り出す。見つからなければ null(=定数が消えた/改名された)。 */
const constValue = (src: string, name: string): number | null => {
  const m = src.match(new RegExp(`\\bconst\\s+${name}\\s*=\\s*(\\d+)\\s*;`));
  return m ? Number(m[1]) : null;
};

describe('天使ボスの剣: 判定側と描画側の振り時間が一致していること', () => {
  const logic = angelBossTickSrc;
  const view = pixiSceneSrc;

  // [判定側の定数名, 描画側の定数名]。描画側だけ `_VIS` が付く物もあるので対で持つ。
  const PAIRS: [string, string][] = [
    ['MIGUEL_HARAI_ACTIVE_MS', 'MIGUEL_HARAI_ACTIVE_MS'],
    ['URI_SWEEP_ACTIVE_MS', 'URI_SWEEP_ACTIVE_MS'],
    ['URI_DOWNSLASH_ACTIVE_MS', 'URI_DOWNSLASH_ACTIVE_MS'],
    ['MIGUEL_HARAI_WINDUP_MS', 'MIGUEL_HARAI_WINDUP_MS'],
    ['URI_SWEEP_WINDUP_MS', 'URI_SWEEP_WINDUP_MS_VIS'],
    ['URI_DOWNSLASH_WINDUP_MS', 'URI_DOWNSLASH_WINDUP_MS_VIS'],
  ];

  it.each(PAIRS)('%s(判定) と %s(描画) が同値', (logicName, viewName) => {
    const a = constValue(logic, logicName);
    const b = constValue(view, viewName);
    // null は「定数が消えた/式に変わった」= 二重管理の前提が崩れたので気づけるように落とす。
    expect(a, `angelBossTick.ts の ${logicName} が見つからない`).not.toBeNull();
    expect(b, `pixiScene.ts の ${viewName} が見つからない`).not.toBeNull();
    expect(b, `${logicName}=${a} と ${viewName}=${b} がズレている`).toBe(a);
  });

  it('★振り(ACTIVE)は予告(WINDUP)より必ず短い=溜めてから振る形が崩れていない', () => {
    for (const [act, wind] of [
      ['MIGUEL_HARAI_ACTIVE_MS', 'MIGUEL_HARAI_WINDUP_MS'],
      ['URI_SWEEP_ACTIVE_MS', 'URI_SWEEP_WINDUP_MS'],
      ['URI_DOWNSLASH_ACTIVE_MS', 'URI_DOWNSLASH_WINDUP_MS'],
    ]) {
      expect(constValue(logic, act)!, act).toBeLessThan(constValue(logic, wind)!);
    }
  });
});
