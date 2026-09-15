// スキル取得の炸裂(社長支給の実写VFX・2026-09-16「スキル取得時のエフェクト用VFX素材これで」)。
//
// 素材: ActionVFX "Spell Hit Side 4"(ProRes 2048×1080 / 24fps / 1.5秒)。
// **使えるのは 2〜19コマ目の18コマ**——実測で最大輝度は 3コマ目に頂点、19コマ目で 81/255 まで落ち、
// 以降は**全画素ゼロ**(何も映っていない尺が0.7秒ある)。
//
// ★焼き方(近接ヒットVFX v0.25.4340 と同じ思想):
//   ①**RGBは白**にする=色はゲーム側の tint(レア度: 白/青/金)が決める。
//   ②**αは明るさの0.45乗 ×1.9**(中間調を太らせ、芯を飽和させる)。③縮小はプリマルチプライしてから。
//   ④**外接矩形ではなく明るさの重心**(1133,556)を中心に 1000px角で切る。これは "Side"(横殴り)の
//     素材で絵が片側に寄っており、矩形の中心で切るとプレイヤーの裏に敷いた時に**脇へずれて見える**ため。
// ★実測で「派手側へ倒した」経緯: 0.65乗のままだと夜の地面では煙のようにしか見えなかった
//   (実画面で確認)。0.45乗×1.9 で芯の約10パーセントが飽和し、取った瞬間として読めるようになった。
// 白で焼いてあるので、**加算が効かない経路に落ちても白い閃光として読める**(黒い影にならない)。
export const SKILL_BURST_FRAMES = 18;
/** 尺。18コマ=24fpsで750msの素材を、少しだけ詰めて出す。 */
export const SKILL_BURST_MS = 700;

/** 進行度 t(0..1)→ コマ番号。端は丸める。 */
export const skillBurstFrame = (t: number): number =>
  Math.min(SKILL_BURST_FRAMES - 1, Math.max(0, Math.floor(t * SKILL_BURST_FRAMES)));

/** コマ番号 → テクスチャ名。 */
export const skillBurstTexture = (frame: number): string =>
  `fx/skill-burst-${String(Math.min(SKILL_BURST_FRAMES - 1, Math.max(0, frame))).padStart(2, '0')}`;

/**
 * レベル → 表示高さ(world px)。**社長指示「大きさがレベル」「一番小さくてもプレイヤーより大きく」**。
 * プレイヤーの描画は約64×52pxなので、最小の 150 でも縦で約3倍ある。
 */
export const skillBurstSize = (lv: number): number =>
  lv >= 3 ? 260 : lv === 2 ? 200 : 150;

/**
 * レア度 → 色(tint)。**社長指示「色がレア度 白、青、金」**。
 * ★赤と紫は使わない(CLAUDE.md の色の文法: 赤=カウンター対象 / 紫=カウンター不可)。
 */
export const skillBurstTint = (rarity: 'normal' | 'rare' | 'super'): number =>
  rarity === 'super' ? 0xffd27a : rarity === 'rare' ? 0x7fb8ff : 0xffffff;
