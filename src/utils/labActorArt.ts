// ★ステージ2(研究所)にしか出ない絵の一覧と、研究所ゾンビの立ち絵の寸法(コード監査2026-10-23 M-5・社長承認
// 「ステージ2専用の素材を他のステージで読み込まない」)。
//
// 研究所ゾンビ・研究所の障害物は、以前は起動時に全ステージで常駐していた(計約11MB)。いまは `pixiTextures` の
// 遅延組 `labActors` に入れ、**ステージ2の出撃時だけ**読む(ローディング画面が明ける前に読み終える)。
//
// ★寸法をここに書く理由: 敵の当たり判定の帯(`renderSpec.enemyHitStrip`)と頭の位置(`enemyHeadY`)は
// **立ち絵の縦横比**を使う。起動時に読んでいた頃はテクスチャから測っていたが、遅延にすると
// 「読み終わる前は縦横比が無い=判定の形が変わる」が起きうる。判定は描画の都合で1pxも変えないので、
// 縦横比は**素材の寸法の表から**入れる(表と実物の食い違いは `labActorArt.test.ts` が原盤台帳と突き合わせて止める)。
// ここは pixi を import しない(テストから読むため)。

/** 研究所ゾンビの立ち絵の寸法(px)。`public/sprites/<name>.png` の実寸。 */
export const LAB_ZOMBIE_IDLE_SIZE: Readonly<Record<string, { w: number; h: number }>> = {
  'lab-zombie/lab-zombie-lv1-male': { w: 122, h: 128 },
  'lab-zombie/lab-zombie-lv1-female': { w: 110, h: 128 },
  'lab-zombie/lab-zombie-lv2': { w: 104, h: 131 },
  'lab-zombie/lab-zombie-lv3': { w: 176, h: 200 },
};

/** 縦横比の登録(キー → 立ち絵)。旧 `pixiTextures` の regAspect 3行と同じ対応。 */
export const LAB_ZOMBIE_ASPECT_KEYS: readonly (readonly [string, string])[] = [
  ['default:lab-zombie-1', 'lab-zombie/lab-zombie-lv1-male'],
  ['default:lab-zombie-2', 'lab-zombie/lab-zombie-lv2'],
  ['default:lab-zombie-3', 'lab-zombie/lab-zombie-lv3'],
];

/** 研究所の障害物(木の代わり)。`world/labMap.ts` の LAB_PROP_TEXTURES と同じ12枚。 */
export const LAB_PROP_SPRITES: readonly string[] = [1, 2, 3].flatMap(r => [1, 2, 3, 4].map(c => `lab-props/lab-prop2-r${r}-c${c}`));

/** 研究所ゾンビの立ち絵(シートは `enemySheets` の SHEET_RESIDENCY='lab' が別に足す)。 */
export const LAB_ZOMBIE_IDLE_SPRITES: readonly string[] = Object.keys(LAB_ZOMBIE_IDLE_SIZE);
