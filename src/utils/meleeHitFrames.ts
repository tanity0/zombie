// 近接ヒットの炸裂(社長支給の実写VFX・2026-09-16「VFXの試し1つ。近接当てた時用」)。
//
// 素材: ActionVFX "Spell Hit 3"(ProRes 2048×1080 / 24fps / 2.33秒)。
// **使えるのは最初の15コマだけ**——実測で、明るさは3コマ目に頂点(平均9.4/255)を打ち、
// 20コマ目には最大値が150、39コマ目以降は**全画素ゼロ**(=何も映っていない尺が1.5秒ある)。
// そこで 2〜16コマ目を切り出し、効果の外接矩形(元寸 793px角)で正方形に切って 176px へ縮めた。
// 元は黒背景・アルファ無しなので、**明るさからアルファを作って**ある(加算で出すので黒は元々効かない)。
export const MELEE_HIT_FRAMES = 15;
/** 近接は手数が多いので**短く**。元の24fpsではなく約45fpsで送る(15コマ ÷ 0.34秒)。 */
export const MELEE_HIT_MS = 340;

/** 進行度 t(0..1)→ コマ番号。端は丸める。 */
export const meleeHitFrame = (t: number): number =>
  Math.min(MELEE_HIT_FRAMES - 1, Math.max(0, Math.floor(t * MELEE_HIT_FRAMES)));

/** コマ番号 → テクスチャ名。 */
export const meleeHitTexture = (frame: number): string =>
  `fx/melee-hit-${String(Math.min(MELEE_HIT_FRAMES - 1, Math.max(0, frame))).padStart(2, '0')}`;
