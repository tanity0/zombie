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
  // ★並び順は「どの敵IDがどちらの絵になるか」を決めている(spriteVariantIndex が添字を返す)。
  // 名前を変えても**順序は動かさない**こと——入れ替えると、いま出ている個体の男女が丸ごと入れ替わる。
  // なので skeleton は女が先。見た目の揃いより、既に見えている絵を変えない方を取る。
  bat: ['bat-male', 'bat-female'],         // 男女2種(v0.25.2872 / 女の絵は v0.25.2875 で差し替え)
  skeleton: ['skeleton-female', 'skeleton-male'], // 男女2種(v0.25.2873)
  zombie: ['zombie-common'],               // 1種のみ(v0.25.2877)。後で2種にするならここへ足す
  plant: ['plant-common'],                 // 1種のみ(v0.25.2880)
  ghost: ['ghost-common'],                 // 1種のみ(v0.25.2881)。内部名 ghost = 変異体(抱卵型)
  lich: ['lich-common'],                   // 1種のみ(v0.25.2897)。旧stage4/5別絵は廃止・削除済み
  // ★screamer(変異体・叫喚型)は旧素材 `screamer.png` が**紫背景の色キー抜き**(`loadKeyed`)だった。
  // 新素材は最初から透過済みなので、色キーを通さない普通のロード経路に載せ替える意味も兼ねて表に入れる。
  screamer: ['screamer-common'],           // 1種のみ(v0.25.2882)
  werewolf: ['werewolf-common'],           // 1種のみ(v0.25.2901)。見た目=自転車に跨がる死体
  reaper: ['reaper-common'],               // 1種のみ(v0.25.2901)。見た目=チェーンソーを掲げた襤褸外套
  pumpkin: ['pumpkin-common'],             // 1種のみ(v0.25.2905)。見た目=蜘蛛の機械足の襤褸
  driller: ['driller-common'],             // 1種のみ(PACING_PUZZLE.md §9-2)。見た目=ドリル腕の作業員ゾンビ
  // PACING_PUZZLE.md §14-2①(伐採人・logger): 本体=現行の死神の立ち絵をそのまま流用(reaperと同じ絵)。
  // 武器(チェーンソー=reaper-chainsaw)は本体と別スプライトでpixiScene側が構え〜薙ぎで重ねて描く。
  logger: ['reaper-common'],
};

/**
 * 表に載っている type ならテクスチャ名を、載っていなければ null(=従来のステージ別解決へ落ちる)。
 * ★**1要素でも成立する**(`spriteVariantIndex` は count<=1 で 0 を返す)。
 * 「絵は1枚だけど全ステージ共通にしたい」敵も、同じ表で扱える。
 */
export const variantTextureName = (type: string, id: string): string | null => {
  const set = ENEMY_VARIANT_SETS[type];
  if (!set || set.length === 0) return null;
  return set[spriteVariantIndex(id, set.length)];
};

/** 全バリアントのテクスチャ名(ロード登録・アスペクト登録の取りこぼし防止に使う)。 */
export const ALL_VARIANT_TEXTURES: readonly string[] =
  Object.values(ENEMY_VARIANT_SETS).flatMap((v) => [...v]);
