// オプション「撮影モード」(テスト開発用・既定=OFF)。チュートリアルの手本などを撮る時に、
// 遊びに関係ない開発用の表示(版数・診断の行・撃破数/FPS・BENCH の札・前回最後の記録など)を隠す。
// ゲームの HUD(体力・弾・スキル・地図・会話・チュートリアル)は隠さない。
// 作法は npcChatter.ts と同じ(端末に残す・購読で即時反映)。
import { useSyncExternalStore } from 'react';

export const CAPTURE_MODE_KEY = 'zombie:dev:captureMode';

/** 保存値の読み取り(純関数)。'1' の時だけ ON。 */
export const parseCaptureMode = (raw: string | null): boolean => raw === '1';

const readEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  try { return parseCaptureMode(window.localStorage.getItem(CAPTURE_MODE_KEY)); } catch { return false; }
};
let enabled = readEnabled();
const subs = new Set<() => void>();
export const getCaptureMode = (): boolean => enabled;
export const setCaptureMode = (on: boolean): void => {
  if (on === enabled) return;
  enabled = on;
  try { window.localStorage.setItem(CAPTURE_MODE_KEY, on ? '1' : '0'); } catch { /* ignore */ }
  subs.forEach(f => f());
};
const subscribe = (cb: () => void): (() => void) => { subs.add(cb); return () => { subs.delete(cb); }; };
export const useCaptureMode = (): boolean => useSyncExternalStore(subscribe, getCaptureMode, () => false);
