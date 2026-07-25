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
// これまでにプレイヤーが到達したXの範囲(=通った道)。この外側=まだ行っていない側にだけ湧かせる。
export interface LabVisitedRange { minX: number; maxX: number }

// 戻り値 null = 「両側とも通った道なので湧かせない」(社長指示v0.25.2244「一度通った道にスポーンしない」)。
// 呼び出し側はこの場合スキップする(既に居る敵はそのまま=掃除した区間は静かなままになる)。
export const placeLabSpawn = (
  playerX: number,
  halfViewW: number,     // 可視域の半幅(spawnBounds.width / 2)
  margin: number,        // 画面外マージン(OFFSCREEN_SPAWN_MARGIN)
  enemyW: number,
  enemyH: number,
  bandLimit: number,     // 廊下帯の半幅(LAB_CORRIDOR_Y_LIMIT_PX)
  visited: LabVisitedRange | null = null, // null=制限なし(従来どおり左右ランダム)
  rand: () => number = Math.random,
): LabSpawnPlacement | null => {
  const rightX = playerX + halfViewW + margin;
  const leftX = playerX - halfViewW - margin - enemyW;
  // 「通った道」の外側かどうか。右は右端より外、左は左端より外(敵の幅ぶんも含めて完全に外)。
  const rightOk = !visited || rightX > visited.maxX;
  const leftOk = !visited || leftX + enemyW < visited.minX;
  if (!rightOk && !leftOk) return null;
  const fromRight = rightOk && leftOk ? rand() < 0.5 : rightOk;
  const x = fromRight ? rightX : leftX;
  // 体(高さ)がまるごと帯に収まるYを選ぶ。帯より背が高い敵は帯の中央に置く(はみ出しを上下均等に)。
  const yMin = -bandLimit;
  const yMax = bandLimit - enemyH;
  const y = yMax <= yMin ? -enemyH / 2 : yMin + rand() * (yMax - yMin);
  return { x, y };
};
