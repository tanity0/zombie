// 強演出のスロー(KILL/カウンター等)の時間経過→速度倍率カーブ。
// holdMs=0(既定・従来の全呼び出し元)の時は旧来どおり開始直後から1.0へ滑らかにランプする。
// holdMs>0を渡した呼び出し元(triggerFinishImpact/triggerHitImpact)だけ、最も遅い倍率を
// holdMsぶん保持してから残り時間で1.0へランプする(社長指示: 一番遅い時間を長く・戻りは速く)。
// レンダラ/Reactに依存しない純関数=ヘッドレスでユニットテスト可能。
export const computeTimeSlowScale = (
  nowMs: number,
  timeSlowStart: number,
  timeSlowUntil: number,
  timeSlowScale: number,
  holdMs: number = 0,
): number => {
  if (nowMs >= timeSlowUntil) return 1;
  const span = Math.max(1, timeSlowUntil - timeSlowStart);
  const elapsed = nowMs - timeSlowStart;
  const clampedHold = Math.max(0, Math.min(span - 1, holdMs));
  if (elapsed < clampedHold) return timeSlowScale;
  const returnSpan = Math.max(1, span - clampedHold);
  const k = Math.max(0, Math.min(1, (elapsed - clampedHold) / returnSpan));
  const ease = k * k * (3 - 2 * k); // smoothstep
  return timeSlowScale + (1 - timeSlowScale) * ease;
};
