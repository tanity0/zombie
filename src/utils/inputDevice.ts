// 入力機器の判定(research/PC_SUPPORT.md)。ゲーム中の操作層(仮想スティック/マウス)と縦持ちガードはここを読む。
// ※ベンチの重い段の除外(BenchmarkOverlay)・音の初回ミュート(audioManager)・描画の解像度上限(PixiStage)は
//   それぞれ別の意図の判定を持っている(ここを読まない=別物)。
import { useSyncExternalStore } from 'react';

const hasTouchScreen = (): boolean =>
  typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
const hasFinePointer = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(any-pointer: fine)').matches;

/**
 * タッチが主の端末か(=横持ちは「縦にしてください」で止める)。
 * タッチ画面があっても、マウス/トラックパッド(細かく指せるポインタ)があれば PC として扱う
 * (タッチ対応ノートPCが横長ウィンドウで全面ブロックされ、マウス操作も使えなかった=PC版対応の調査で判明)。
 */
export const isTouchPrimary = (): boolean => hasTouchScreen() && !hasFinePointer();

// ---- いま使っている操作の種類(タッチ/マウス) ----
// タッチとマウスの両方がある端末(Surface・タブレット+マウス等)は、**最後に触れた入力**で操作層を切り替える
// (設計監査 A-1: 片方に決め打つと、キーボードの無い構成で移動手段がゼロになる)。片方しか無い端末は固定。
export type PointerKind = 'touch' | 'mouse';
let kind: PointerKind = isTouchPrimary() ? 'touch' : 'mouse'; // 両方ある端末はマウスから始め、指で触れたら指へ
const subs = new Set<() => void>();
const setKind = (k: PointerKind) => { if (k !== kind) { kind = k; subs.forEach(f => f()); } };
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', (e: PointerEvent) => {
    if (!hasTouchScreen()) return; // タッチ画面の無いPCは常にマウス
    setKind(e.pointerType === 'mouse' ? 'mouse' : 'touch'); // touch / pen は指と同じ扱い
  }, { capture: true, passive: true });
  if (typeof window.matchMedia === 'function') {
    // マウスの抜き差し: マウスが無くなったら指へ戻す(有る時は次に触れた入力で決まる)。
    window.matchMedia('(any-pointer: fine)').addEventListener?.('change', () => { if (isTouchPrimary()) setKind('touch'); });
  }
}
export const currentPointerKind = (): PointerKind => kind;
/** React から読む(切り替わった時だけ再描画)。 */
export const usePointerKind = (): PointerKind =>
  useSyncExternalStore(cb => { subs.add(cb); return () => { subs.delete(cb); }; }, () => kind, () => 'mouse');

// ---- 画面の言葉に使う「いま手にある物」(タッチ/マウス・キー/パッド)(research/PC_SUPPORT.md §11-6)----
// 操作層の切り替え(上の PointerKind)とは別。パッドで遊んでいる間だけ 'pad'(utils/gamepad が立てる)、マウス/キーに触れたら戻る。
export type PlayDevice = 'touch' | 'mouse' | 'pad';
let padActive = false;
const devSubs = new Set<() => void>();
const notifyDev = () => devSubs.forEach(f => f());
export const setPadActive = (on: boolean): void => { if (on !== padActive) { padActive = on; notifyDev(); } };
subs.add(notifyDev); // タッチ⇔マウスが切り替わった時も言葉を描き直す
if (typeof window !== 'undefined') {
  const off = () => setPadActive(false);
  window.addEventListener('mousemove', off, { passive: true });
  window.addEventListener('pointerdown', off, { capture: true, passive: true });
  window.addEventListener('keydown', (e: KeyboardEvent) => { if (e.isTrusted) off(); }, { capture: true });
}
export const currentPlayDevice = (): PlayDevice => (padActive ? 'pad' : kind);
export const usePlayDevice = (): PlayDevice =>
  useSyncExternalStore(cb => { devSubs.add(cb); return () => { devSubs.delete(cb); }; }, currentPlayDevice, () => 'mouse');
