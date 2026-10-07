// 進軍NPC(護衛軍人)の画面外での自動進行(社長指示2026-10-07「NPCは自動で少しずつ進むシステムに変更したい」)。
// 画面の外には敵が居ない(湧きはプレイヤーの周り)ので、索敵も射撃もせず、担当拠点へまっすぐ遅く進む。
// 拠点の円に居る間は画面内と同じく10秒の滞在で解放する。描画は読むだけ=判定はここ(renderer非依存)。

/** 画面外の進行速度=画面内の前進速度に掛ける倍率(社長「通常の5分の1くらい」)。 */
export const ESCORT_OFFSCREEN_SPEED_MULT = 0.2;
/** 苦戦の通信(後退/放置のセリフ)が実際に流れた時、その軍人の画面外の進行を止める時間(社長「20秒間進行が止まる」)。 */
export const ESCORT_STRUGGLE_STALL_MS = 20000;
/** 拠点の中心にこの距離まで寄ったら止まる(行き過ぎて往復しない)。 */
const ARRIVE_EPS_PX = 6;

export interface EscortOffscreenInput {
  x: number; y: number;
  baseX: number; baseY: number;
  baseOpen: boolean;        // 担当拠点がまだ未解放
  holdForWelcome: boolean;  // ウェルカムの輪が出ている間は出撃地点で待つ(画面内と同じ)
  stalled: boolean;         // 苦戦の通信から20秒以内
  speedPxPerSec: number;    // 画面内の前進速度(この関数で 1/5 にする)
  dtSec: number;
  dwellMs: number;
  captureRadius: number;
  captureHoldMs: number;
  captureFrozen: boolean;   // ボス戦中(+復帰猶予)は解放を凍結(画面内と同じ)
  /** 倒れている(research/ESCORT_TARGETED.md §6): 進まない・滞在も進まず(進んだぶんは保つ)・解放も成立しない。 */
  downed?: boolean;
}

export interface EscortOffscreenResult {
  x: number; y: number;
  dwellMs: number;
  capture: boolean; // このフレームで解放が成立した
}

export const escortOffscreenStep = (i: EscortOffscreenInput): EscortOffscreenResult => {
  if (i.downed) return { x: i.x, y: i.y, dwellMs: i.dwellMs, capture: false };
  let { x, y } = i;
  if (i.baseOpen && !i.holdForWelcome && !i.stalled) {
    const dx = i.baseX - x, dy = i.baseY - y;
    const d = Math.hypot(dx, dy);
    if (d > ARRIVE_EPS_PX) {
      const step = Math.min(d - ARRIVE_EPS_PX, i.speedPxPerSec * ESCORT_OFFSCREEN_SPEED_MULT * i.dtSec);
      x += (dx / d) * step;
      y += (dy / d) * step;
    }
  }
  const inCircle = Math.hypot(x - i.baseX, y - i.baseY) <= i.captureRadius;
  let dwellMs = i.dwellMs;
  if (!inCircle) dwellMs = 0;
  else if (!i.captureFrozen && !i.stalled && i.baseOpen) dwellMs += i.dtSec * 1000;
  const capture = i.baseOpen && inCircle && !i.captureFrozen && dwellMs >= i.captureHoldMs;
  return { x, y, dwellMs, capture };
};

/**
 * 画面外の歩みの個人差(0.85〜1.15倍・個体IDで決まる)。4人は出撃地点から等距離の拠点へ向かうので、
 * 同じ速さだと4拠点がほぼ同時に解放されて知らせが束で来る(検収監査 B-1)。「5分の1くらい」の幅の中でずらす。
 */
export const escortOffscreenPace = (id: string): number => {
  let h = 2166136261;
  for (let k = 0; k < id.length; k++) { h ^= id.charCodeAt(k); h = Math.imul(h, 16777619); }
  return 0.85 + ((h >>> 0) % 1000) / 1000 * 0.3;
};

/** 拠点の方角の呼び名(原点=スタート地点から見て。画面は下ほど y が大きい=南)。 */
export const baseDirectionLabel = (x: number, y: number): string => {
  if (Math.abs(x) >= Math.abs(y)) return x >= 0 ? '東部' : '西部';
  return y >= 0 ? '南部' : '北部';
};
