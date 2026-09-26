/**
 * ★**ステージ1セットのドット絵で上書きする名前**(社長指示・`public/sprites/atlas-px2/<名前>.png`)。
 *
 * ★**なぜ葉に置くか**(v0.25.4572): この上書きは「**素材は `atlas-px2/` に在るのに、
 * テクスチャのキーは `<名前>` だけ**」という別名を作る。ローダ(`pixiTextures`)だけがこの表を
 * 持っていたため、**シートの表に書いた立ち絵名が実在するか**を見る検査
 * (`enemySheetFiles.test.ts`)が `public/sprites/giantbat.png` を探して落ちた
 * ——実体は `public/sprites/atlas-px2/giantbat.png` で、名前は正しかった。
 * ⇒ **別名の台帳は1つ**。ローダと検査が同じ表を読む。
 *
 * ※`atlas-px2/` の PNG は、アトラスから切り出した同名テクスチャを**後から差し替える**。
 *   だから `getTexture('giantbat')` はこの絵を返す(`pixiScene.enemyTexKey` の解決先)。
 */
export const ATLAS_PX2_OVERRIDES: readonly string[] = [
  'giantbat', 'tree',
  'pickup-xp-blue', 'pickup-xp-green', 'pickup-xp-red',
  'pickup-health', 'pickup-magnet', 'pickup-bomb', 'pickup-chest',
];

/** その名前が `atlas-px2/` から上書きされているか(=`public/sprites/<名前>.png` は無くてよい)。 */
export const isAtlasPxOverride = (name: string): boolean => ATLAS_PX2_OVERRIDES.includes(name);
