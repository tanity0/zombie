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
