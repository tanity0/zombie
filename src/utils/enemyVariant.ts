// 敵の「見た目だけ違う個体差」を、敵IDから決まる固定の枝分かれで選ぶ純関数。
// PixiJS非依存=ヘッドレスでテストできる(CLAUDE.md 実装精度の規律4「配線ロジックは純関数に切り出す」)。
//
// ★なぜIDのハッシュか: `Math.random()` で毎フレーム引くと、同じ個体の絵がちらつく。
// IDは生成時に固定なので、**同じ敵は生涯ずっと同じ絵**になる(研究所ゾンビの男女振り分けと同じ作法)。
// 見た目だけの分岐なので、当たり判定・速度・HP・報酬は一切変えない。

/** 敵IDから 0..count-1 の固定インデックスを返す。IDが空でも 0 を返して落ちない。 */
export const spriteVariantIndex = (id: string, count: number): number => {
  if (!Number.isFinite(count) || count <= 1) return 0;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h % count) + count) % count;
};

/** bat の見た目2種(男女)。**全ステージ共通**——ステージ別の差し替えより優先される。 */
export const BAT_VARIANTS = ['bat-a', 'bat-b'] as const;

/** この敵IDの bat が使うテクスチャ名。中身(性能)は同じで、絵だけが2種に分かれる。 */
export const batTextureName = (id: string): string =>
  BAT_VARIANTS[spriteVariantIndex(id, BAT_VARIANTS.length)];
