// 素材テクスチャの「絵の足元(下端)」を、行ごとの不透明画素数から決める純関数。
// 影の足元合わせ(pixiScene.textureContentBottomFrac)から切り出したもの。
// PixiJS非依存=ヘッドレスでテストできる(CLAUDE.md 実装精度の規律4「配線ロジックは純関数に切り出す」)。
//
// ★なぜ切り出したか: 「花が浮く」は**3回再発している**(v0.25.2762 素材の余白 / 薄いゴースト画素 /
// v0.25.2776 取り残された不透明な断片)。判定をここに1本化し、**不変条件をテストで固定する**。

/** 上に空白が何行あれば「本体から離れている」とみなすか(絵の高さに対する割合と最低px)。 */
export const FOOT_DETACH_GAP_FRAC = 0.05;
export const FOOT_DETACH_GAP_MIN = 8;
/** 塊の画素数がこれ以下なら「小さな断片」とみなす(全不透明画素に対する割合と最低px)。 */
export const FOOT_FRAGMENT_FRAC = 0.01;
export const FOOT_FRAGMENT_MIN = 64;
/**
 * ★上に「その塊の何倍の本体」があれば断片とみなすか。**絶対値だけでは足りない**——
 * 絵全体が小さい素材では `FOOT_FRAGMENT_MIN`(64px) が全体を上回ってしまい、
 * **本体まで断片扱いして足元が絵の上の方へ飛ぶ**(ユニットテストが捕まえた穴)。
 * 「上に十分大きい本体がある」という**相対条件**を必ず併せて見る。
 */
export const FOOT_BODY_RATIO = 8;

/**
 * 行ごとの不透明画素数から「絵の足元の行」を返す。中身が無ければ -1。
 *
 * ★**本体から大きく離れた"小さな"塊は足元に数えない。**
 * 実測(`public/sprites` 614枚の全走査): `flower-5.png` は本体が y284 で終わったあと
 * **y286〜335 が完全な空白(50行)**で、その下の y336〜342 に**α=255 の紫の塊(46画素)**が
 * 取り残されていた(`flower-6.png` も同型: 51行の空白の下に7画素)。書き出し時の断片とみられる。
 * 不透明しきい値(α≥128・v0.25.2762)は**薄いゴースト画素**には効いたが、
 * **この断片は完全な不透明**なので素通りし、影が **57px / 55px 下**へ置かれて花が浮いて見えていた。
 *
 * ★**条件を3つとも満たした時だけ捨てる**:
 *   ① 上に `高さ×5%`(最低8px)以上の空白がある = **本体から離れている**
 *   ② その塊の画素数が `全不透明画素×1%`(最低64px)以下 = **小さい**
 *   ③ ★**その上に、塊の8倍以上の画素がある** = **本体がある**
 * ★**①だけでは駄目**——絵として正当な縦の空きを持つ素材(`prop2-r3-c4` 等)の足元を
 * **200px も上へ飛ばして壊す**ことを実測で確認した。②が「断片」と「絵の一部」を分ける。
 * ★**この3条件で動く素材は 614枚中2枚だけ**(残り612枚は1pxも動かない)ことを実測で確認済み
 *   (3条件版で再走査した結果。条件を足したら実測をやり直す)。
 *
 * @param rowCount 各行の「不透明とみなした画素数」(長さ=絵の高さ)
 */
export const spriteFootRow = (rowCount: readonly number[]): number => {
  const height = rowCount.length;
  if (height === 0) return -1;
  let totalOpaque = 0;
  for (let y = 0; y < height; y++) totalOpaque += rowCount[y];
  const gapNeed = Math.max(FOOT_DETACH_GAP_MIN, Math.round(height * FOOT_DETACH_GAP_FRAC));
  const fragMax = Math.max(FOOT_FRAGMENT_MIN, Math.round(totalOpaque * FOOT_FRAGMENT_FRAC));
  // prefix[y] = 0..y-1 行の不透明画素の合計(「その上にどれだけ本体があるか」を O(1) で見るため)
  const prefix = new Array<number>(height + 1).fill(0);
  for (let y = 0; y < height; y++) prefix[y + 1] = prefix[y] + rowCount[y];

  let y = height - 1;
  while (y >= 0) {
    while (y >= 0 && rowCount[y] === 0) y--; // 末尾の空白を飛ばす
    if (y < 0) return -1;
    const blockBottom = y;
    let blockPx = 0;
    while (y >= 0 && rowCount[y] > 0) { blockPx += rowCount[y]; y--; } // 塊の上端まで登りつつ数える
    let gap = 0, above = y;
    while (above >= 0 && rowCount[above] === 0) { gap++; above--; }
    // ★3条件を全部満たした時だけ「取り残された断片」とみなして捨て、その上を見に行く。
    const pixelsAbove = above >= 0 ? prefix[above + 1] : 0;
    if (gap >= gapNeed && blockPx <= fragMax && pixelsAbove >= blockPx * FOOT_BODY_RATIO) continue;
    return blockBottom; // 本体に繋がっている=これが足元
  }
  return -1;
};

/** 絵の上端の行(不透明画素が最初に現れる行)。中身が無ければ -1。断片は飛ばさない(上端は足元合わせに使わない)。 */
export const spriteTopRow = (rowCount: readonly number[]): number => {
  for (let y = 0; y < rowCount.length; y++) if (rowCount[y] > 0) return y;
  return -1;
};

// ---- ★D-2b: 横方向(左右)の実体列 ----------------------------------------------------------
// 縦(spriteFootRow)は「取り残された断片(書き出しノイズ)」を飛ばす3条件フィルタを持つが、
// 横はそのような再発報告が無い(花の"浮き"は常に下端=書き出し時の下方向トリミング由来)ため、
// spriteTopRow と同じ**単純な最初/最後の非空列**で十分(社長裁定が要る複雑さを増やさない)。
// 影の起点(footX)を「絵の実体の中心」へ寄せるのに使う(§D-2b「やること1」)。

/** 絵の左端の列(不透明画素が最初に現れる列)。中身が無ければ -1。 */
export const spriteLeftCol = (colCount: readonly number[]): number => {
  for (let x = 0; x < colCount.length; x++) if (colCount[x] > 0) return x;
  return -1;
};

/** 絵の右端の列(不透明画素が最後に現れる列)。中身が無ければ -1。 */
export const spriteRightCol = (colCount: readonly number[]): number => {
  for (let x = colCount.length - 1; x >= 0; x--) if (colCount[x] > 0) return x;
  return -1;
};
