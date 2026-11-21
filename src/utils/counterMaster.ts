// CD_REWORK.md 確定2(社長裁定v0.25.2445「そうしよ」): counter-master v2。
// 旧効果(カウンター窓延長 Lv1+120/Lv2+180/Lv3+250ms)は廃止=窓は全員 COUNTER_WINDOW(400ms)固定。
// 新効果: **カウンター成立時のみ**、近接/カウンター共用CD(player.counterCooldownEnd)の残りを
// リファンドする(Lv1 40% / Lv2 70% / Lv3 100%=叩き台・ここに1箇所定数化)。
// 成立ゲートが本質: 不成立の近接スイング(素振り)には一切影響しない=雑魚への素振りDPSも
// 紫気絶(5クリ)の回転も1も上がらない(一律CD短縮にしない理由=CD_REWORK.md 社長指摘)。
// この関数は「カウンター成立」の瞬間(lastCounterSuccessTimeを打刻する7箇所: combatTickの弾反射/
// ジャンプパリィ/突進パリィ、thor/裏ボス/idol/天使のカウンター成立)からだけ呼ぶこと。

export const COUNTER_MASTER_REFUND_FRAC_BY_LEVEL: readonly number[] = [0, 0.4, 0.7, 1.0]; // index=Lv(0=未所持)

/**
 * カウンター成立時の counterCooldownEnd リファンド(純関数)。
 * 残りCD(counterCooldownEnd - nowMs)を Lv別割合ぶん前倒しする。Lv3(100%)=即座に次の構え可。
 * 未所持(Lv0)/残りCD無しの時は入力をそのまま返す=挙動不変。
 */
export const refundCounterCooldown = (
  counterCooldownEnd: number,
  nowMs: number,
  counterMasterLv: number,
): number => {
  const lv = Math.max(0, Math.min(3, Math.floor(counterMasterLv)));
  const frac = COUNTER_MASTER_REFUND_FRAC_BY_LEVEL[lv] ?? 0;
  if (frac <= 0) return counterCooldownEnd;
  const remaining = counterCooldownEnd - nowMs;
  if (remaining <= 0) return counterCooldownEnd;
  return counterCooldownEnd - remaining * frac;
};
