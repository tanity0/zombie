// PACING_PUZZLE.md §6.38 B2b: distToSegment(点-線分距離)をlevelUpGate.tsから抽出した純関数レイヤ。
// 抽出理由(社長指摘2026-08-14「写し定数はGIANT_STOMP_RADIUS_MIRRORが反面教師。実定数をexportして
// 同一ソースをimportすること」): levelUpGate.tsが賞金首(bounty-balance/bounty-maiko)の技を拾うには
// bountyTick.tsの実定数(半径/半太さ)をimportする必要があるが、bountyTick.tsは(薙ぎ払いの帯判定に)
// distToSegmentをlevelUpGate.tsからimportしており、そのままでは循環importになる。
// distToSegmentをこの依存ゼロのモジュールへ切り出すことで、bountyTick.tsはここから直接importし
// (levelUpGate.ts経由をやめる)、levelUpGate.tsはbountyTick.tsを安全にimportできるようになる
// (=写し定数を作らずに済む。levelUpGate.tsは後方互換のためdistToSegmentを再exportする)。
// 挙動は無改変(式そのものの移動のみ)。
interface Point { x: number; y: number }

// combatTick.ts(M51: 薙ぎ払いのカプセル判定)ほか複数ファイルから使うため export。
export const distToSegment = (p: Point, a: Point, b: Point): number => {
  const abx = b.x - a.x, aby = b.y - a.y;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq < 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / abLenSq));
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
};

/**
 * ★帯(バンド)予告の**描いてある四角**への点距離(社長指示v0.25.3496
 * 「sweep は四角の帯に当たりも戻して」「他にもこの事例が無いかを全技洗って、合ったら同じく修正」)。
 *
 * 帯の予告は**全経路が共通の1本**(`pixiScene.drawTelegraphBand` / `drawGiantCapsuleZone` の poly)で
 * 描かれており、その形は「始点/終点を halfWidth ぶん軸方向へ伸ばした長方形」=**角ばった四角**。
 * ところが判定側は一貫して `distToSegment <= halfWidth`(=カプセル/両端が丸い)だったため、
 * **四隅だけ「赤いのに当たらない」**が全ての帯技で発生していた(1技の不具合ではなく、共通部品の
 * 形の食い違い。CLAUDE.md「攻撃ヴィジュアルの2分類」①=赤い予告は判定と厳密一致、に反する)。
 *
 * この関数は**描いてある四角そのもの**への距離を返す(四角の内側なら0)。呼び出し側は
 * `distToBandRect(...) <= playerRadius` と書けば「自機の円が四角に触れたか」の厳密判定になる
 * (四角と円のミンコフスキー和=角の丸い四角、が正しい形。角を square のまま太らせない)。
 *
 * 幾何: 帯のローカル座標(u=進行方向 / n=法線)で、
 *   四角 = |u - 中心| <= len/2 + halfWidth  かつ  |n| <= halfWidth
 * なので、各軸のはみ出し量を取って合成するだけ(分岐なし・sqrt 1回)。
 */
export const distToBandRect = (
  p: Point, a: Point, b: Point, halfWidth: number,
): number => {
  const abx = b.x - a.x, aby = b.y - a.y;
  const len = Math.hypot(abx, aby);
  // 長さ0の帯は「一辺 2*halfWidth の正方形」(描画側も同じ形になる)。
  const ux = len < 1e-6 ? 1 : abx / len;
  const uy = len < 1e-6 ? 0 : aby / len;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const rx = p.x - mx, ry = p.y - my;
  const along = Math.abs(rx * ux + ry * uy);
  const perp = Math.abs(-rx * uy + ry * ux);
  const halfLen = len / 2 + halfWidth;
  const ou = Math.max(0, along - halfLen);
  const on = Math.max(0, perp - halfWidth);
  return Math.hypot(ou, on);
};

/**
 * ★矩形(AABB)が直線移動した時に**実際に通過する領域**(= 2つの矩形の凸包)の頂点列を返す
 * (research/THOR_ISSEN_REWORK.md §9-6「突進の走行中の体当たり」の社長裁定(B)・v0.25.3818)。
 *
 * なぜ帯(`distToBandRect` の長方形)ではなくこれか: 突進の**走行中の接触ダメージ**は、帯ではなく
 * **ボスの AABB とプレイヤーの AABB の重なり**(`applyContactDamage`)で入る。よって
 * 「体幅ぶんの赤い帯」を帯プリミティブで描くと、
 *  ・斜め移動では**法線方向の半幅**が矩形の実効半幅と一致しない
 *  ・両端に `halfWidth` のキャップが付く(帯の判定にはあるが、AABB の掃過にはない)
 * の2つで**絵と判定がズレる**。AABB が平行移動した掃過領域は**始点矩形と終点矩形の凸包**
 * そのものなので(数学的に厳密)、それを描けば「赤くないのに当たる/赤いのに当たらない」が
 * どちらも出ない。軸平行移動なら長方形、斜めなら六角形になる。
 *
 * 引数は**左上座標**(`Enemy.x/y` と同じ流儀)。戻り値は `[x0,y0,x1,y1,…]` の平坦配列
 * (PixiJS の `Graphics.poly` にそのまま渡せる形)。頂点は反時計回り/時計回りのどちらかで
 * 一周する(凸包なので自己交差しない)。
 *
 * ※プレイヤー自身の大きさは**足さない**(帯予告が halfWidth だけを描き、自機半径は判定側で
 *   足しているのと同じ流儀=「描くのは攻撃側の当たり判定そのもの」)。
 */
export const sweptRectHull = (
  x0: number, y0: number, w: number, h: number, x1: number, y1: number,
): number[] => {
  const pts: [number, number][] = [
    [x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h],
    [x1, y1], [x1 + w, y1], [x1 + w, y1 + h], [x1, y1 + h],
  ];
  // 単調連鎖法(monotone chain)。8点しかないので素直に回す。
  pts.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const build = (src: [number, number][]): [number, number][] => {
    const out: [number, number][] = [];
    for (const p of src) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop(); // 終端は反対側の連鎖が持つ
    return out;
  };
  const hull = [...build(pts), ...build([...pts].reverse())];
  const flat: number[] = [];
  for (const p of hull) { flat.push(p[0], p[1]); }
  return flat;
};

/**
 * ★突進系の**赤い流星ラインの終点**を、斬り抜け(到達後のカプセル)の終端まで伸ばして返す
 * (research/THOR_ISSEN_REWORK.md §9-5「突進の赤い線と斬り抜けのズレ」の社長裁定(a)・v0.25.3818)。
 *
 * 事実: トール/ミゲル/ウリの「踏み込み系」は、到達点(`aiTargetX/Y`)で止まらず
 * **到達点 + 進行方向 × range**(トール=`HB_TH.harai.range` / ミゲル=`MG_T.harai.range` /
 * ウリ=`UR_T.thrust.range`)までカプセルの判定を持つ。ところが予告の赤い線は到達点で終わっていた
 * =**「赤くない所に判定がある」**(CLAUDE.md「攻撃ヴィジュアルの2分類」の唯一妥協しない禁則)。
 *
 * この関数は**描画側だけ**が使う(判定側の式は1文字も変えない)。方向は突進の起点→到達点。
 * 起点と到達点が同じ(方向が作れない)場合は到達点をそのまま返す=線が伸びない。
 */
export const dashLineStrikeEnd = (
  fromX: number, fromY: number, toX: number, toY: number, strikeRange: number,
): Point => {
  const dx = toX - fromX, dy = toY - fromY;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: toX, y: toY };
  return { x: toX + (dx / len) * strikeRange, y: toY + (dy / len) * strikeRange };
};

/**
 * ★上で線を伸ばした時に、「走者が始点側から線を食う」消し進行(`erase`)を**同じ世界座標**へ
 * 保つための係数(v0.25.3818)。
 *
 * `erase` は線の長さに対する割合なので、線を `strikeRange` ぶん長くすると、同じ割合が
 * **より先の点**を指してしまう(=走っているボスより先まで線が消える)。始点・到達点・伸ばした
 * 終点は同一直線上に並ぶので、`erase × d / (d + strikeRange)`(d = 始点→到達点の距離)へ
 * 縮めれば、消しの先端は伸ばす前と**1pxも変わらない**。
 */
export const dashLineEraseRescale = (
  erase: number, distToTarget: number, strikeRange: number,
): number => {
  const total = distToTarget + strikeRange;
  return total < 1e-6 ? erase : erase * (distToTarget / total);
};
