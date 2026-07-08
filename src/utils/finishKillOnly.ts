// PACING_PUZZLE.md §5.21-追補4(社長決定v0.25.1553): ゲート1台本＋ゲート2ボスは「近接フィニッシュ
// でしか死なない」。通常ダメージ(銃/接触/爆発/非フィニッシュの近接チップ)はHPを削れるが、
// トドメは刺せない=HP1で踏みとどまる。近接フィニッシュ経路(スタン即時処刑/ボス5×スタン打撃)
// だけがHPを0にできる。damageEnemy の nonLethalBoss(爆発=ボス非致死)と同型のガードを、
// finishKillOnly個体全般に対して掛けるための純関数(実装精度の規律4: 配線ロジックは純関数へ切り出す)。
export const clampFinishKillOnlyHealth = (
  finishKillOnly: boolean | undefined,
  newHealth: number,
  viaMeleeFinish: boolean,
): number => (finishKillOnly && !viaMeleeFinish && newHealth <= 0 ? 1 : newHealth);
