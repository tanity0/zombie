// 入力機器の判定(research/PC_SUPPORT.md)。PC版とスマホ版を同じ中身で動かすための唯一の出どころ。

/**
 * タッチが主の端末か(=仮想スティックで遊ぶ・横持ちは「縦にしてください」で止める)。
 * タッチ画面があっても、マウス/トラックパッド(細かく指せるポインタ)があれば PC として扱う
 * (タッチ対応ノートPCが横長ウィンドウで全面ブロックされ、マウス操作も使えなかった=PC版対応の調査で判明)。
 */
export const isTouchPrimary = (): boolean => {
  if (typeof window === 'undefined') return false;
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (!hasTouch) return false;
  const fine = typeof window.matchMedia === 'function' && window.matchMedia('(any-pointer: fine)').matches;
  return !fine;
};
