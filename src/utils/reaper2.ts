// PACING_PUZZLE.md §14-4(新たな死神v1)。本体の直進+旋回移動・技「使者」の囲み配置/population
// 管理・ノックバック特例を純関数として切り出す(CLAUDE.md 実装精度の規律4「配線ロジックは純関数に
// 切り出してテスト」)。useGameLoop/gameStore はこれらを呼ぶだけ(座標の実書き込みは呼び出し側)。

export interface Point { x: number; y: number; }
export interface ChaseOrbitResult extends Point { orbiting: boolean; }

/**
 * 死神本体の1フレーム移動(§14-4-2「直進+70px旋回」)。
 * プレイヤー中心(px,py)へ向けて直進し、縁距離(orbitDistPx)を切ったら旋回へ切り替える
 * (時計回り固定・叩き台)。旋回はプレイヤーからの相対ベクトルを弧長/半径ぶん回転させるので、
 * 距離(=旋回半径)を保ったまま円を描く。
 *
 * `straightStepPx`/`orbitStepPx` は呼び出し側が `speed × deltaTime × MOVE_SPEED_MULT` まで
 * 計算済みの「このフレームで進む距離」を渡すこと(このモジュールはdeltaTime/速度を持たない)。
 *
 * `edgeOffsetPx`(補修バッチ・C-1): §14-4-2は「縁距離70px(縁基準)」だが、旧実装は中心間距離
 * (bx,by)〜(px,py)をそのまま比較していた=`?rp2dist=`が縁基準の意味になっていなかった記述違反。
 * 呼び出し側が「本体幅/2+プレイヤー幅/2」を渡すと、判定だけが中心距離からその分を差し引いた
 * 縁距離になる(旋回の半径=中心距離はそのまま保つので軌道は連続)。既定0=旧来どおり中心基準。
 */
export const stepReaperBody = (
  bx: number, by: number, px: number, py: number,
  straightStepPx: number, orbitStepPx: number, orbitDistPx: number, edgeOffsetPx = 0,
): ChaseOrbitResult => {
  const dx = px - bx, dy = py - by;
  const dist = Math.hypot(dx, dy);
  const edgeDist = dist - edgeOffsetPx;
  if (edgeDist > orbitDistPx) {
    if (dist < 0.001) return { x: bx, y: by, orbiting: false };
    const nx = dx / dist, ny = dy / dist;
    return { x: bx + nx * straightStepPx, y: by + ny * straightStepPx, orbiting: false };
  }
  // 旋回: プレイヤー中心の相対ベクトル(rx,ry)を弧長/半径ぶんの角度だけ回転する(半径を保存)。
  const radius = Math.max(1, dist);
  const rx = bx - px, ry = by - py;
  const ang = orbitStepPx / radius;
  const cos = Math.cos(ang), sin = Math.sin(ang);
  return { x: px + (rx * cos - ry * sin), y: py + (rx * sin + ry * cos), orbiting: true };
};

/**
 * PACING_PUZZLE.md §14-4-3(中8/中9): 使者の囲み配置の半径。
 * 半径 ≧ hypot(画面w/2,h/2) ÷ spawnZoomTarget + margin(**ズームで割る**=通常湧きの
 * spawnBounds拡張の作法。現行死神の湧き式はズームを見ておらず、最大引き0.40では画面内に
 * ポップする既存の穴だった=ここで是正)。
 */
export const encircleRadiusPx = (
  screenW: number, screenH: number, spawnZoomTarget: number, marginPx: number,
): number => Math.hypot(screenW / 2, screenH / 2) / Math.max(0.0001, spawnZoomTarget) + marginPx;

/** count体をプレイヤー中心(cx,cy)の円周上へ均等配置(角度は起点角から均等割り・§14-4-3叩き台)。 */
export const encirclePoints = (
  count: number, cx: number, cy: number, radius: number, startAngleRad = 0,
): Point[] => {
  const n = Math.max(0, Math.round(count));
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = startAngleRad + (i / Math.max(1, n)) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius });
  }
  return pts;
};

/**
 * 廊下系ステージ(研究所±200px帯・洋館corridorMode)の囲み配置の縮退(§14-4-3叩き台):
 * 円周が成立しないため左右2点+可視域外へ縮退する。
 *
 * 補修バッチ3次(A-新3): 呼び出し側(useGameLoop.ts)は`ringPts[slot % ringPts.length]`でスロット
 * (0..servantMax-1)を引く。旧実装は常に2点しか返さなかったため、slot 0/2/4が同じ点(index0)・
 * slot 1/3が同じ点(index1)に落ちて完全同座標・同方向=永久に重なっていた(補修バッチ2次の固定角化
 * [A-3]で決定論化した退行=毎回ランダムだった旧々実装では気づかなかった)。
 * `maxSlots`個の点を返すことで、呼び出し側の`slot % ringPts.length`がslotそのものと一致する
 * (=1スロット1点)。同じ側(左/右)に落ちるペアは、進行軸(y=洋館の奥行き)方向へペアごとに
 * ±slotSpacingPx ずつ互い違いにずらす(0=基準点のまま/以降 +1・-1・+2・-2…単位)。
 * x(左右)ではなくy(奥行き)でずらすのは、corridorMode は横方向(x)を`CORRIDOR_LATERAL_CLAMP`で
 * 狭く縛る一方、奥行き(y)には十分な余白があるため(`clampRectToPlayableArea`参照)。
 * `slotSpacingPx`の既定132=使者の高さ92(`ENEMY_STATS.hangedman.height`)+マージン40(叩き台)。
 * `maxSlots`既定2・`slotSpacingPx`既定132は後方互換(引数省略時は旧来の2点のみ・既存呼び出し不変)。
 */
export const corridorEncirclePoints = (
  cx: number, cy: number, radius: number, maxSlots = 2, slotSpacingPx = 132,
): Point[] => {
  const n = Math.max(1, Math.round(maxSlots));
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const tier = Math.floor(i / 2); // 0,0,1,1,2,2,... = 同じ側に落ちるペアの段
    const tierMag = Math.ceil(tier / 2);
    const tierSign = tier % 2 === 1 ? 1 : -1;
    const yOffset = tier === 0 ? 0 : tierSign * tierMag * slotSpacingPx;
    pts.push({ x: cx + side * radius, y: cy + yOffset });
  }
  return pts;
};

/**
 * PACING_PUZZLE.md §14-4-3(社長のゴール「使者は10秒に1体増える(最大5)。1体消えたら即補充される」・
 * 補修バッチA-2): 「枠(target)」と「現在数」を分離する。枠は波の開始(waveStartAt)から
 * `intervalMs`ごとに+1(`max`で頭打ち)。呼び出し側は毎フレーム`target - 現在の使者数`を計算し、
 * 不足分があれば**そのフレームで即座に**召喚する(intervalを待たない=1体消えたら即補充)。
 *
 * ★旧実装(stepServantPopulation)は「count」と「lastAddAt」を1本の状態に束ねていたため、
 * 死亡で count が減っても次の +1 判定は lastAddAt 基準の interval を待たされていた(最大10秒の
 * 空白=検収監査で確定した重大バグ)。target を「waveStartAt からの経過時間」だけで決める式に
 * 分離すれば、死亡検知は呼び出し側の「現在数」を数え直すだけで済み、intervalの歩進と無関係に
 * 即補充が成立する。
 */
export const servantTargetCount = (
  waveStartAt: number, now: number, intervalMs: number, max: number,
): number => {
  const elapsed = Math.max(0, now - waveStartAt);
  return Math.min(max, 1 + Math.floor(elapsed / Math.max(1, intervalMs)));
};

/**
 * PACING_PUZZLE.md §14-4-3(裁定済み#6/#8): 使者は「どのような攻撃でもノックバック(CD無し)」
 * =全ヒットが積む(多段あり=束ねない・社長裁定2026-08-28)。他タイプは従来どおり
 * `knockbackImmuneUntil` の免疫CDを見る。damageEnemyの合流点(=この1関数)でhangedmanだけ
 * CDをスキップする特例、として全melee系KB適用サイトがここを通る。
 */
export const knockbackCdReady = (
  e: { type: string; knockbackImmuneUntil?: number }, now: number,
): boolean => e.type === 'hangedman' || now >= (e.knockbackImmuneUntil ?? 0);

/**
 * 補修バッチ3次(A-新1): 使者のKB中は専用ムーバ(useGameLoop.ts)の前進を止める判定(純関数)。
 *
 * §14-4-3「どのような攻撃でもノックバックする(CD無し)」=使者の唯一の防御手段。だが専用ムーバは
 * `knockbackUntil`を見ず毎フレーム前進を書いており、KBスライド(gameStore.ts updateEnemies内の
 * ノックバック適用ブロック=専用ムーバより後段で実行される・唯一の適用点)と綱引きになっていた
 * (検収実測: 弾KB[初速86]では1フレームも後退せず、KB窓280msの正味で20.2px**近づいた**。
 * 通常近接でも11.8px近づく)。
 *
 * 呼び出し側は`true`の間、x/yのパッチを書かない(=前進を出さない)。KBスライドだけが座標を動かす
 * ことで、他の全敵の「KB中はチェイスしない」文法に揃う。
 */
export const hangedmanKnockbackActive = (
  e: { knockbackUntil?: number }, nowMs: number,
): boolean => nowMs < (e.knockbackUntil ?? 0);
