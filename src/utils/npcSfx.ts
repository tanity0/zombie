// v0.25.2480: 護衛NPC/ゴースト系SEの距離減衰ゲイン(useGameLoop.tsのローカル関数を移設・式は無変更)。
// 純関数(store/React/PixiJS/audio非依存)。移設理由: 守護霊カウンターのSE減衰を angelBossTick.ts /
// combatTick.ts 側でも同じ式で計算するため(二重実装しない)。
//
// 仕様(v0.25.2155〜の護衛NPC前例): 発砲音=NPC位置 / その弾の被弾音=着弾位置 で共通。画面外=0(無音)。
// 近=1.0 / 画面中ほど≈0.27 / 端≈0.08(遠いほど強く減衰)。プレイヤー自身の攻撃音には使わない。
export const npcSfxDistGain = (
  hx: number, hy: number, ppx: number, ppy: number,
  cam: { x: number; y: number }, gb: { width: number; height: number },
): number => {
  if (hx < cam.x || hx > cam.x + gb.width || hy < cam.y || hy > cam.y + gb.height) return 0;
  const maxDist = 0.5 * Math.hypot(gb.width, gb.height);
  const tt = Math.min(1, Math.hypot(hx - ppx, hy - ppy) / maxDist);
  return Math.max(0.08, Math.pow(1 - tt, 1.9));
};
