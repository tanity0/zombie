// 敵の「見た目だけ違う個体差」を、敵IDから決まる固定の枝分かれで選ぶ純関数。
// PixiJS非依存=ヘッドレスでテストできる(CLAUDE.md 実装精度の規律4「配線ロジックは純関数に切り出す」)。
//
// ★なぜIDのハッシュか: `Math.random()` で毎フレーム引くと、同じ個体の絵がちらつく。
// IDは生成時に固定なので、**同じ敵は生涯ずっと同じ絵**になる(研究所ゾンビの男女振り分けと同じ作法)。
// 見た目だけの分岐なので、当たり判定・速度・HP・報酬は一切変えない。
//
// ★ここに登録した type は**全ステージ共通**になる(`pixiScene.enemyTexKey` がステージ別差し替えより
// 先にこの表を引く)。素材を足す時は下の表へ1行足し、`pixiTextures` のロードとアスペクト登録も揃える。

/** 敵IDから 0..count-1 の固定インデックスを返す。IDが空でも 0 を返して落ちない。 */
export const spriteVariantIndex = (id: string, count: number): number => {
  if (!Number.isFinite(count) || count <= 1) return 0;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h % count) + count) % count;
};

/**
 * 見た目2種以上を持つ敵の表(EnemyType → テクスチャ名)。**全ステージ共通**。
 * 社長支給の新アート。中身(性能)は同じで絵だけが分かれる。
 */
export const ENEMY_VARIANT_SETS: Readonly<Record<string, readonly string[]>> = {
  bat: ['bat-a', 'bat-b'],             // 男女2種(v0.25.2872)
  skeleton: ['skeleton-a', 'skeleton-b'], // 男女2種(v0.25.2873)
};

/** 表に載っている type ならテクスチャ名を、載っていなければ null(=従来のステージ別解決へ落ちる)。 */
export const variantTextureName = (type: string, id: string): string | null => {
  const set = ENEMY_VARIANT_SETS[type];
  if (!set || set.length === 0) return null;
  return set[spriteVariantIndex(id, set.length)];
};

/** 全バリアントのテクスチャ名(ロード登録・アスペクト登録の取りこぼし防止に使う)。 */
export const ALL_VARIANT_TEXTURES: readonly string[] =
  Object.values(ENEMY_VARIANT_SETS).flatMap((v) => [...v]);
