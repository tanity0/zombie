// 作戦室の地図に出すボスの顔=絵(bossIconName の1枚)から頭だけを丸く切り抜くための表
// (research/SORTIE_MAP_BOSS_ICONS.md §5・社長裁定「年表くらい小さい絵から頭だけ丸いマスクで」)。
//
// キー=sprites/ 以下の絵の名前(拡張子なし)。w,h=絵の寸法(px・実ファイルから取った値。絵の寸法を変えたらここも直す)。
// u,v=頭の中心(絵の幅・高さに対する割合)、r=丸の半径(絵の高さに対する割合)。
// 値は実寸(直径16px)と拡大を並べた確認画を見て詰めた(2026-11-13・クリエイティブ監査「半径を小さくして頭を大きく・
// その個体と分かる所を丸の中心に」)。ずれていたらここの数字を直すだけでよい。
// ミーミルは頭ではなく本体の目玉、ヨルムンガンドは竜の頭。
export interface BossHeadCrop { w: number; h: number; u: number; v: number; r: number }

export const BOSS_HEAD_CROPS: Readonly<Record<string, BossHeadCrop>> = {
  'bounty-ranged': { w: 148, h: 200, u: 0.68, v: 0.21, r: 0.065 },
  'bounty-melee': { w: 130, h: 128, u: 0.58, v: 0.14, r: 0.09 },
  'bounty-balance': { w: 103, h: 128, u: 0.3, v: 0.13, r: 0.09 },
  'bounty-maiko': { w: 165, h: 200, u: 0.455, v: 0.1, r: 0.065 },
  'atlas-px2/giantbat': { w: 335, h: 356, u: 0.37, v: 0.11, r: 0.065 },
  'stage3-enemies/giantbat': { w: 164, h: 150, u: 0.38, v: 0.45, r: 0.1 },
  'stage4-enemies/giantbat': { w: 197, h: 200, u: 0.41, v: 0.18, r: 0.08 },
  'stage5-enemies/giantbat': { w: 200, h: 200, u: 0.35, v: 0.34, r: 0.075 },
  'glen-boss': { w: 256, h: 194, u: 0.66, v: 0.22, r: 0.085 },
  phill: { w: 192, h: 256, u: 0.6, v: 0.135, r: 0.06 },
  miguel: { w: 134, h: 200, u: 0.43, v: 0.155, r: 0.055 },
  jibril: { w: 109, h: 186, u: 0.37, v: 0.26, r: 0.07 },
  rafi: { w: 166, h: 200, u: 0.3, v: 0.41, r: 0.09 },
  uri: { w: 125, h: 201, u: 0.58, v: 0.19, r: 0.065 },
  suriel: { w: 100, h: 209, u: 0.33, v: 0.21, r: 0.065 },
  mimir: { w: 201, h: 256, u: 0.45, v: 0.58, r: 0.14 },
  jormungand: { w: 256, h: 127, u: 0.17, v: 0.4, r: 0.2 },
  skadi: { w: 206, h: 222, u: 0.46, v: 0.31, r: 0.08 },
  thor: { w: 256, h: 240, u: 0.33, v: 0.27, r: 0.075 },
  idol: { w: 190, h: 256, u: 0.38, v: 0.13, r: 0.065 },
  'mutant-astro': { w: 156, h: 182, u: 0.45, v: 0.19, r: 0.09 },
  'mutant-wraith': { w: 96, h: 152, u: 0.47, v: 0.12, r: 0.08 },
  'kenki-idle': { w: 65, h: 80, u: 0.62, v: 0.17, r: 0.1 },
};
