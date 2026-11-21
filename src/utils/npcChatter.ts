// オプション「仲間の雑談」(ON=既定/OFF)。進軍NPC(護衛の軍人)の一言のうち、
// ストーリーにも判断にも関わらない「雑談」だけを止める。情報(囲まれた・援護要請・ボスの予告が自分に・
// 拠点の制圧/陥落・同行の返事・移動の到着)と、ジュン/チュートリアル/物語の会話は OFF でも必ず出す。
// 判定はこの純関数1本(store の tryNpcLine・出撃時の一言・起こしてもらった時の一言が同じものを引く)。
import { useSyncExternalStore } from 'react';

/** 雑談=OFFで止める場面(npcLines.ts のカテゴリ名+起こしてもらった時の 'revived')。ここに無い場面は常に出す。 */
export const NPC_CHATTER_CATEGORIES: ReadonlySet<string> = new Set([
  'sortie',         // 出撃時
  'companion',      // 並走
  'baseNear',       // 拠点が見えた
  'npcKill',        // NPCが倒した
  'praise',         // プレイヤー無双
  'kickAssist',     // 蹴りの連携
  'rescued',        // 助けてもらった
  'rescueReturned', // 救助者を保護
  'revived',        // 起こしてもらった
]);

/** その一言を出してよいか。enabled=オプション「仲間の雑談」。ジュンの台詞は物語の一部なので常に出す。 */
export const npcChatterAllowed = (category: string, enabled: boolean, isJun = false): boolean =>
  enabled || isJun || !NPC_CHATTER_CATEGORIES.has(category);

// ---- 端末に残す設定(既定=ON) ----
const KEY = 'zombie:ui:npcChatter';
const readEnabled = (): boolean => {
  if (typeof window === 'undefined') return true;
  try { return window.localStorage.getItem(KEY) !== '0'; } catch { return true; }
};
let enabled = readEnabled();
const subs = new Set<() => void>();
export const getNpcChatterEnabled = (): boolean => enabled;
export const setNpcChatterEnabled = (on: boolean): void => {
  if (on === enabled) return;
  enabled = on;
  try { window.localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ }
  subs.forEach(f => f());
};
const subscribe = (cb: () => void): (() => void) => { subs.add(cb); return () => { subs.delete(cb); }; };
export const useNpcChatterEnabled = (): boolean => useSyncExternalStore(subscribe, getNpcChatterEnabled, () => true);
