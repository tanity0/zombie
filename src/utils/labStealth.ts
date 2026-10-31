// ステージ2(研究所)の索敵解除。
// 旧: プレイヤーが解除距離(450px)より遠い状態が3秒続いたら諦める(tickLabDeaggro・時刻テーブル必要)。
// 旧2(v0.25.1757→v0.25.2064): 起床中の敵が【画面(カメラ=プレイヤー中心の可視域)+マージン】の外へ
// 出た瞬間に即見失って再休眠(isLabOffscreenLost)。
// 新(社長承認 M2_LAB_CORRIDOR_SPEC.md v0.25.2175・横長廊下+視線切りステルス改造):
// 起床中のlab-zombieが「壁/什器で視線が遮られた(segmentBlocked)」または
// 「プレイヤーとの距離 > LAB_LOSE_SIGHT_RANGE」の状態が LAB_LOSE_SIGHT_MS 継続したら dormant=true に戻る。
// ヒステリシス: 覚醒=300px+LOS(gameStore.ts の dormant ブロック・不変) / 見失い=450px+LOS切れ1秒継続。
// 継続時間の計測は敵ごとのフィールド(enemy.losLostSince=見えなくなり始めた gameTime)で行う。
// 純関数=このファイルは入力(LOS遮断有無・距離・見失い開始時刻・now)→出力(再休眠すべきか・更新後の
// losLostSince)のみを計算する。時刻テーブルは持たない。呼び出し側(gameStore.updateEnemies)が
// segmentBlocked/距離を計算し、結果の losLostSince を敵に書き戻す。ラボの lab-zombie 限定=他ステージ・
// 他の敵は不変。

// ステージ2の敵の**視界(覚醒)距離**。湧き敵・固定ガードの両方がここから引く=「全員」に効く単一の出どころ。
// 300 → **200**(=2/3・社長指示v0.25.2237「m2の敵の視界を全員2/3の距離にして」)。
// 200 → **180**(=0.9・社長指示2026-08-25「ステージ2の全敵の索敵範囲、少しだけ小さくして」)。
// 視界表示(薄い赤)は各敵の aggroRange をそのまま描くので、この値を変えれば表示も自動で一致する。
export const LAB_VISION_RANGE = 180;

// プレイヤーとの距離がこれを超えたら「見えていない」扱い(覚醒200pxとの間にヒステリシスの隙間がある)。
export const LAB_LOSE_SIGHT_RANGE = 450;
// 「見えていない」(LOS遮断 or 距離超過)状態がこの時間(ms)続いたら再休眠する。
export const LAB_LOSE_SIGHT_MS = 1000;

// ★攻撃を受けたら気付く(社長指示2026-10-24「ステージ2の敵や、索敵系の敵は全て攻撃喰らっても気付く様にして」)。
// 視界で見つける型(休眠中で aggroRange>0)は、被弾した瞬間に起きる。起きている間も、被弾からこの時間は見失わない
// (壁の向こうや遠くから撃たれても、撃たれている間に再休眠しない)。
export const HIT_NOTICE_MS = 4000;
/**
 * 被弾した敵へ足す「気付き」(純関数)。視界で見つける型でなければ null。
 * - 休眠中なら起こす(dormant=false)。
 * - 起きていても「気付いている」時間を延ばし、見失いのタイマーを消す。
 * - 賞金首は除外(「被弾では交戦に戻らない」の既存の仕様)。aggroRange=0(台本で起こす静止個体)も除外。
 * - 呼び手が除外するもの: アイドル(被弾で起きる専用の起床=idolTick が chase と次の手番を打つ)・ハンターの索敵(専用の「発見」の流れ)。
 */
export const noticeOnHitPatch = (
  e: { dormant?: boolean; aggroRange?: number },
  excluded: boolean,
  now: number,
): { dormant?: false; losLostSince: undefined; noticedUntil: number } | null => {
  if (excluded || !((e.aggroRange ?? 0) > 0)) return null;
  return { ...(e.dormant ? { dormant: false as const } : {}), losLostSince: undefined, noticedUntil: now + HIT_NOTICE_MS };
};

export interface LabLoseSightInput {
  /** 被弾で気付いている間(gameTime がこれ未満)は、見えていなくても見失わない。 */
  noticedUntil?: number;
  losBlocked: boolean;               // 壁/什器で視線が遮られているか(segmentBlocked)
  distance: number;                  // プレイヤー中心↔敵中心の距離(px)
  losLostSince: number | undefined;  // 直近で「見えていない」状態になり始めた gameTime(ms)。見えている間は undefined。
  now: number;                       // 現在の gameTime(ms)
}

export interface LabLoseSightResult {
  shouldDormant: boolean;            // true なら dormant=true に戻す
  losLostSince: number | undefined;  // enemy へ書き戻す次の losLostSince
}

// 入力=LOS遮断有無・距離・見失い開始時刻・now → 出力=再休眠すべきか(+更新後の losLostSince)。
export const evaluateLabLoseSight = (input: LabLoseSightInput): LabLoseSightResult => {
  const { losBlocked, distance, losLostSince, now } = input;
  const noticed = input.noticedUntil !== undefined && now < input.noticedUntil;
  const unseen = !noticed && (losBlocked || distance > LAB_LOSE_SIGHT_RANGE);
  if (!unseen) {
    return { shouldDormant: false, losLostSince: undefined }; // 見えている = タイマーリセット
  }
  const since = losLostSince ?? now; // 今回から見えなくなった = タイマー開始
  const shouldDormant = (now - since) >= LAB_LOSE_SIGHT_MS;
  return { shouldDormant, losLostSince: since };
};

/**
 * 「見つかった」音を鳴らすか(純関数・社長支給2026-10-24「索敵系の敵に見つかった時の音」)。
 * ステージ2(研究所)の休眠敵が**視界で**プレイヤーを見つけて起きた瞬間だけ。撃たれて起きた時は鳴らさない(見つかったのではない)。
 * 台本で起こす静止個体(aggroRange=0)・呼び手が除外するもの(アイドル=専用の発見の流れ・賞金首)も鳴らさない。
 * ハンターの「発見」は別の経路(useGameLoop のハンター索敵)で同じ音を鳴らす。
 */
export const spottedSfxOnWake = (
  e: { aggroRange?: number },
  ctx: { labTheme: boolean; seen: boolean; excluded: boolean },
): boolean => ctx.labTheme && ctx.seen && !ctx.excluded && (e.aggroRange ?? 0) > 0;
