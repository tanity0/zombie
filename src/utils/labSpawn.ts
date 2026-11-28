// ステージ2(研究所)の敵の湧き位置。
// 社長指示v0.25.2242「m2の敵は自由移動範囲内でのみスポーン」:
//   プレイヤーは廊下帯(±LAB_CORRIDOR_Y_LIMIT_PX)にクランプされているので、その外に湧いた敵は
//   「行けない場所に居る敵」になる(減光された帯の外に立っている・近づけない)。よってYは必ず帯の中へ。
// Xは画面外の左右のみ(上下から湧かせない=社長指示v0.25.2182)。
//
// **新規湧きとリサイクル(画面外へ出た個体の再配置)の両方がここを通す**。以前は新規湧き側だけが
// 左右+帯の処理を持っており、リサイクル側は素の generateEnemy のまま=上下からも帯の外にも湧いていた。
// 同じ規則を2箇所に書かないための共有純関数(renderer非依存・テスト可能)。
//
// v0.25.2244「一度通った道にスポーンしない」: プレイヤーが到達済みのX範囲(visited)を受け取り、
// **その外側(=まだ行っていない側)からのみ**湧かせる。引き返している間は両側とも到達済みになるため
// 湧きは止まる(掃除した区間は静かなまま=ステルスで前進する設計に合わせる)。

export interface LabSpawnPlacement { x: number; y: number }

// 社長指示v0.25.2248「m2のゴールと反対方向に行くと、2/3にする前(3/3)の量の敵配置」。
// ゴール(書類)は原点から見て左右どちらかにあるので、**原点を挟んでゴールと逆側**に居る間を
// 「反対方向に行った」とみなす。この間だけ湧きの間引き(間隔×2.4=2/3)を外して元の間隔に戻す。
// 原点上(playerX===0)は逆側ではない=間引いたまま(出撃直後にいきなり増えない)。
export const isAwayFromLabGoal = (playerX: number, goalSide: number): boolean =>
  goalSide !== 0 && Math.sign(playerX) === -Math.sign(goalSide);
// ★アイドル側には雑魚を置かない・湧かせない(社長指示2026-10-19「この変更(這う塊)によって、アイドル側には雑魚を配置しない」)。
// 廊下は原点(スタート)を挟んで左右に伸びる1本道で、アイドルはゴール資料の点対称=原点の反対側。
// `idolSide` = アイドルが居る側の符号(+1/-1)。0 = アイドルを置かない出撃(1対1など)=制限なし(従来どおり)。
// 原点ちょうど(x=0)はどちらの側でもない。
export const isLabIdolSide = (x: number, idolSide: number): boolean =>
  idolSide !== 0 && x !== 0 && Math.sign(x) === Math.sign(idolSide);
// これまでにプレイヤーが到達したXの範囲(=通った道)。この外側=まだ行っていない側にだけ湧かせる。
export interface LabVisitedRange { minX: number; maxX: number }
// 既に居る敵の視界(中心+半径)。この円の中には新しい敵を湧かせない(社長指示v0.25.2245)。
// 狙い: 視界が重なった敵が並ぶと「片方から隠れるともう片方に見つかる」=忍び込む道が消えるため。
export interface LabVisionCircle { x: number; y: number; r: number }

const insideAnyVision = (cx: number, cy: number, circles: readonly LabVisionCircle[]): boolean => {
  for (const c of circles) {
    const dx = cx - c.x, dy = cy - c.y;
    if (dx * dx + dy * dy < c.r * c.r) return true;
  }
  return false;
};

// 1つの辺(左右)につきこの回数までYを引き直して、視界の外に収まる場所を探す。
const VISION_AVOID_TRIES = 8;
// 壁・プロップを避けて y をずらす刻み(px)。
const CLEAR_Y_STEP = 6;

// 戻り値 null = 「湧かせる場所が無い」。理由は2つ:
//  (a) 両側とも通った道(社長指示v0.25.2244「一度通った道にスポーンしない」)
//  (b) 既に居る敵の視界の中しか空いていない(社長指示v0.25.2245「敵の視界の中に別の敵を沸かせない」)
// 呼び出し側はこの場合スキップする(既に居る敵はそのまま=静かなままになる)。
export const placeLabSpawn = (
  playerX: number,
  halfViewW: number,     // 可視域の半幅(spawnBounds.width / 2)
  margin: number,        // 画面外マージン(OFFSCREEN_SPAWN_MARGIN)
  enemyW: number,
  enemyH: number,
  bandLimit: number,     // 廊下帯の半幅(LAB_CORRIDOR_Y_LIMIT_PX)
  visited: LabVisitedRange | null = null, // null=制限なし(従来どおり左右ランダム)
  others: readonly LabVisionCircle[] = [], // 既に居る敵の視界。この中は避ける
  rand: () => number = Math.random,
  idolSide = 0, // アイドルが居る側の符号(0=制限なし)。その側(敵の体の中心のx)には湧かせない
  // ★壁・プロップに重なるか(左上x,y・w×h)。null=見ない(従来どおり)。重なる y は避ける
  //   (社長報告2026-11-19「オブジェに食い込んで沸いてる敵がいる(倒せない 動かない)」。world/labWalls.overlapsLabObstacle を渡す)。
  blocked: ((x: number, y: number, w: number, h: number) => boolean) | null = null,
  // ★?proj=1(研究所のゲームの画面): 行ごとの「画面の外へ出切る」左上 x(side=+1 右・−1 左・y=左上 y)。null=その行は投影の物差しが要らない。
  //   投影では北の行ほど横に広く見えるので、今の x(主人公 ± 半画面 ± 余白)のままだと北寄りの湧きが画面の端に描かれる。
  //   x は「今の x」と「投影の画面の外+余白」の遠い方(=今より近くには湧かない・南の行は今のまま)。省略(?proj=0)=今の式そのもの。
  outsideX: ((side: 1 | -1, y: number) => number | null) | null = null,
): LabSpawnPlacement | null => {
  const rightX = playerX + halfViewW + margin;
  const leftX = playerX - halfViewW - margin - enemyW;
  // 「通った道」の外側かどうか。右は右端より外、左は左端より外(敵の幅ぶんも含めて完全に外)。
  // ★「通った道」=**画面に見えていた範囲**(歩いた範囲 ± 半画面)(社長「はい」2026-10-11。旧: 立ち位置だけ=
  //   最前線から少し引き返すと、前に映っていて片付けたかもしれない半画面先の帯に湧いていた)。
  //   前進中(最前線に立っている)は rightX=立ち位置+半画面+余白 なので、従来どおり画面外のすぐ先に湧く。
  const rightOk = (!visited || rightX > visited.maxX + halfViewW) && !isLabIdolSide(rightX + enemyW / 2, idolSide);
  const leftOk = (!visited || leftX + enemyW < visited.minX - halfViewW) && !isLabIdolSide(leftX + enemyW / 2, idolSide);
  if (!rightOk && !leftOk) return null;
  // 体(高さ)がまるごと帯に収まるYの範囲。帯より背が高い敵は帯の中央に置く(はみ出しを上下均等に)。
  const yMin = -bandLimit;
  const yMax = bandLimit - enemyH;
  const pickY = (): number => (yMax <= yMin ? -enemyH / 2 : yMin + rand() * (yMax - yMin));
  // 引いた y が壁・プロップに重なっていたら、帯の中で重ならない一番近い y へ寄せる(引く回数=湧く確率は変えない)。
  // その x の縦一列がどこも塞がっていれば null(=その試行は外れ)。
  const clearY = (x: number, y0: number): number | null => {
    if (!blocked || !blocked(x, y0, enemyW, enemyH)) return y0;
    if (yMax <= yMin) return null;
    for (let d = CLEAR_Y_STEP; d <= yMax - yMin; d += CLEAR_Y_STEP) {
      for (const y of [y0 - d, y0 + d]) {
        if (y < yMin || y > yMax) continue;
        if (!blocked(x, y, enemyW, enemyH)) return y;
      }
    }
    return null;
  };
  // 試す辺の順番(両方使えるならランダムに先攻を決める)。
  const preferRight = rightOk && leftOk ? rand() < 0.5 : rightOk;
  const xs: number[] = [];
  if (preferRight) { if (rightOk) xs.push(rightX); if (leftOk) xs.push(leftX); }
  else { if (leftOk) xs.push(leftX); if (rightOk) xs.push(rightX); }
  // 投影の行ごとの外の x(今の x より遠い時だけ使う)。
  const farX = (x0: number, y: number): number => {
    if (!outsideX) return x0;
    const side: 1 | -1 = x0 === rightX ? 1 : -1;
    const ox = outsideX(side, y);
    if (ox === null || !Number.isFinite(ox)) return x0;
    return side > 0 ? Math.max(x0, ox + margin) : Math.min(x0, ox - margin);
  };
  for (const x0 of xs) {
    for (let i = 0; i < VISION_AVOID_TRIES; i++) {
      const y0 = pickY();
      let x = farX(x0, y0);
      const y = clearY(x, y0);
      if (y === null) continue;
      if (y !== y0 && outsideX) {
        // 壁・プロップを避けて行が変わったら、その行で測り直す(x が変わった時は、その列も塞がっていないか確かめる)。
        const x2 = farX(x0, y);
        if (x2 !== x) { x = x2; if (blocked && blocked(x, y, enemyW, enemyH)) continue; }
      }
      if (x !== x0 && isLabIdolSide(x + enemyW / 2, idolSide)) continue; // 遠くへずらしてアイドル側へ入ったら外れ
      if (!insideAnyVision(x + enemyW / 2, y + enemyH / 2, others)) return { x, y };
    }
  }
  return null; // どこも他の敵の視界の中=今回は湧かせない
};

// ---- 資料を拾った後の逃走経路(社長指示2026-10-20「逃走経路は、レベル1だけを、できれば通路を塞がない配置で、
// 等間隔に一画面1体くらい で配置して」) ----------------------------------------------------------------------
// 帰り道は「一度通った道には湧かせない」(v0.25.2244)と画面外の置き直しで空になっているので、拾った瞬間に置き直す。
// 足止め役(塊は雑魚を食べる間だけ止まる)として、プレイヤーの前方=原点の方へ1画面ごとに1体。
export interface LabEscapeSlot { cx: number; cy: number }
/**
 * 逃走経路の雑魚の中心位置。fromX=拾った時のプレイヤーの中心x。原点へ向かって spacing ごとに置き、最初の1体は1画面先。
 * y は帯の上の縁と下の縁に交互(真ん中を空ける=通路を塞がない)。原点から stopPx より近い所・原点の向こうには置かない。
 */
export const labEscapeRouteSlots = (
  fromX: number, spacing: number, bandLimit: number, enemyH: number, stopPx: number,
): LabEscapeSlot[] => {
  if (!(spacing > 0) || fromX === 0) return [];
  const dir = fromX > 0 ? -1 : 1; // 原点の方
  const edge = Math.max(0, bandLimit - enemyH / 2 - 12); // 体が帯に収まる上下の縁
  const out: LabEscapeSlot[] = [];
  for (let k = 1; k < 200; k++) {
    const cx = fromX + dir * spacing * k;
    if (Math.sign(cx) !== Math.sign(fromX) || Math.abs(cx) < stopPx) break;
    out.push({ cx, cy: (k % 2 === 1 ? -1 : 1) * edge });
  }
  return out;
};

/**
 * ★?proj=1(研究所のゲームの画面): 逃走経路の雑魚(labEscapeRouteSlots)の中心 x を、その行で絵が画面の外へ出切る所まで押し出す
 * (主人公から見て置いた側=今より遠くへだけ・品質監査 D2)。outsideX は placeLabSpawn と同じ「左上 x」の関数(null=今のまま)。
 * 押し出しは置いた側の外向き=原点(帰り道)の向きなので、1画面1体の並びの順は崩れない(次の枠は1画面さらに先)。
 */
export const labEscapePushOut = (
  cx: number, cy: number, w: number, h: number, playerCx: number,
  outsideX: ((side: 1 | -1, y: number) => number | null) | null,
): number => {
  if (!outsideX) return cx;
  const side: 1 | -1 = cx >= playerCx ? 1 : -1;
  const ox = outsideX(side, cy - h / 2);
  if (ox === null || !Number.isFinite(ox)) return cx;
  const need = ox + w / 2; // 左上 x → 中心 x
  return side > 0 ? Math.max(cx, need) : Math.min(cx, need);
};
