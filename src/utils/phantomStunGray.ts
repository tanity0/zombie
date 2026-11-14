// ★孫悟空(格闘の幻影・拳鬼)が倒れて動けない間は白黒で描く(社長指示2026-11-12「孫悟空は白黒にしよう。倒れてる時は。
// プレイヤーはしゃがみで」)。動けない窓(紫3秒・致命の後の2秒)は pvpPosture.ts の isPvpIncapacitated が正。
// ここは「白黒の度合い」0(元の色)..1(彩度0)を返すだけの純関数。描画(pixiScene)は読むだけで、判定・時間は変えない。
// 入り=約200msかけて色が抜ける/明け=約300ms前から色が戻る(どちらも加速→減速)。窓が明ける時刻にちょうど0。
// 致命の後の窓(posture>0)は紫の続き(致命は紫の最中にしか入らない)なので、白黒のまま始まる。
import type { PvpPostureState } from '../types/game';
import { PVP_BREAK_MS, isPvpIncapacitated } from './pvpPosture';

export const PHANTOM_STUN_GRAY_IN_MS = 200;
export const PHANTOM_STUN_GRAY_OUT_MS = 300;

const easeInOut = (t: number): number => {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
};

/** 動けない間の白黒の度合い 0..1。動ける時は 0。 */
export const phantomStunGrayK = (s: PvpPostureState | undefined, gameTime: number): number => {
  if (!s || s.breakUntil === undefined || !isPvpIncapacitated(s, gameTime)) return 0;
  const out = easeInOut((s.breakUntil - gameTime) / PHANTOM_STUN_GRAY_OUT_MS);
  if (s.posture > 0) return out;
  // 窓が通常(3秒)より長く書かれている時(確認用に止めた等)は入り切った扱い。
  const left = s.breakUntil - gameTime;
  if (left > PVP_BREAK_MS) return out;
  const since = gameTime - (s.breakUntil - PVP_BREAK_MS);
  return Math.min(easeInOut(since / PHANTOM_STUN_GRAY_IN_MS), out);
};
