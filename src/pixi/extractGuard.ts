/**
 * ★共有テクスチャの GPU 読み戻しが、古い描画器をつなぎ留めないようにする(2026-11-15・社長実機
 * 「幻影と5-6戦したら落ちた」=前回最後 `描画器7代目(ロスト0)`)。
 *
 * Pixi 8.19 の `renderer.extract.pixels(texture)` は内部で `RenderTargetSystem._initRenderTarget` を通り、
 * テクスチャに `once('destroy', () => { …this… })` の聞き手を付ける。**描画器を壊してもこの聞き手は外れない**
 * (`RenderTargetSystem.destroy` が off しない)。読み込み済みの共有テクスチャ(起動時の常駐表)は二度と
 * 壊れないので、聞き手 → RenderTargetSystem → 描画器全体(コンテキスト・場面)が出撃のたびに1世代ずつ残っていた
 * (ヘッドレス実測: 8回の出撃で WebGLRenderer 1→8)。
 *
 * ⇒ 読み戻しの前後で `destroy` の聞き手を比べ、増えた分を**1度呼んでから外す**。呼ぶと Pixi 自身の後始末
 * (読み戻し用の描き先と framebuffer を捨てる)がその場で走る。テクスチャそのものは壊さない
 * (色の描き先を外から渡しているので RenderTarget.destroy は色のテクスチャに触らない)。
 */
type Listener = (...args: unknown[]) => void;
export interface DestroyEmitter {
  listeners: (event: 'destroy') => Listener[];
  off: (event: 'destroy', fn: Listener) => unknown;
}

/** `run()` の間に `source` へ増えた `destroy` の聞き手を、1度呼んでから外す。`run()` の戻り値をそのまま返す。 */
export const withoutLeakedDestroyListeners = <T>(source: DestroyEmitter, run: () => T): T => {
  const before = new Set(source.listeners('destroy'));
  try {
    return run();
  } finally {
    for (const fn of source.listeners('destroy')) {
      if (before.has(fn)) continue;
      try { fn(); } catch { /* 後始末の失敗で読み戻しの結果を捨てない */ }
      source.off('destroy', fn);
    }
  }
};
