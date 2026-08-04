export interface GhostMotionPoint {
  x: number;
  y: number;
  done: boolean;
  crouching: boolean;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

// 守護霊の登場。救難信号の飛来時間を呼び出し側から受け取り、背後から素早く滑り込む。
export const ghostArrivalPoint = (
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  elapsedMs: number,
  durationMs: number,
): GhostMotionPoint => {
  const t = clamp01(elapsedMs / Math.max(1, durationMs));
  const easeOut = 1 - (1 - t) * (1 - t);
  return {
    x: fromX + (toX - fromX) * easeOut,
    y: fromY + (toY - fromY) * easeOut,
    done: t >= 1,
    crouching: false,
  };
};

// 救難信号と同じ「しゃがみ→バックジャンプ」の時間と曲線を、守護霊の通常帰還にも使う。
export const ghostDeparturePoint = (
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  elapsedMs: number,
  crouchMs: number,
  flyoutMs: number,
  hopPx: number,
): GhostMotionPoint => {
  if (elapsedMs < crouchMs) {
    return { x: fromX, y: fromY, done: false, crouching: true };
  }
  const t = clamp01((elapsedMs - crouchMs) / Math.max(1, flyoutMs));
  const easeIn = t * t;
  return {
    x: fromX + (toX - fromX) * easeIn,
    y: fromY + (toY - fromY) * easeIn - Math.sin(Math.PI * t) * hopPx,
    done: t >= 1,
    crouching: false,
  };
};
