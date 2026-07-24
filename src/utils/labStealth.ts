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

// プレイヤーとの距離がこれを超えたら「見えていない」扱い(覚醒300pxとの間にヒステリシスの隙間がある)。
export const LAB_LOSE_SIGHT_RANGE = 450;
// 「見えていない」(LOS遮断 or 距離超過)状態がこの時間(ms)続いたら再休眠する。
export const LAB_LOSE_SIGHT_MS = 1000;

export interface LabLoseSightInput {
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
  const unseen = losBlocked || distance > LAB_LOSE_SIGHT_RANGE;
  if (!unseen) {
    return { shouldDormant: false, losLostSince: undefined }; // 見えている = タイマーリセット
  }
  const since = losLostSince ?? now; // 今回から見えなくなった = タイマー開始
  const shouldDormant = (now - since) >= LAB_LOSE_SIGHT_MS;
  return { shouldDormant, losLostSince: since };
};
