// ステージ2(研究所)の非常灯の並び(research/LAB_DARKNESS.md)。灯りは world の x = 間隔の整数倍・y = 0 に等間隔で立つ。
// 描くのは pixi/pixiScene(updateLabDarkLights)。ここは「灯りがどこにあるか」だけ=塊の置き場所を灯りの真下へ寄せる時に world 側が読む
// (社長指示2026-11-11「塊の登場シーンは、スポットライトが当たってる位置に配置することで見えるようにしよう」)。
// 描画の世界を import しない(判定の層)。

/** 非常灯の間隔(world px)。 */
export const LAB_LAMP_SPACING_PX = 440;
/** いちばん近い非常灯の x。 */
export const labLampNearestX = (x: number): number => Math.round(x / LAB_LAMP_SPACING_PX) * LAB_LAMP_SPACING_PX;
