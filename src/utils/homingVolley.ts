// ホーミング弾(homing)の「一斉発射の並べ方」と「当たった敵を浮かせるか」の判定(純関数・store/PixiJS 非依存)。
//
// 社長指示(2026-11-22)「ホーミング、赤サークルで発射したらタンタン、と2発ちゃんと発射して。
// また、ホーミング弾は敵を浮かせるようにして。」
//  - 赤サークル = 同じ敵に2つ目のロックが付いた印(1ロック=白 / 2ロック=赤・pixiScene.syncLockIndicators)。
//    旧: 2ロックの敵へは同じ位置・同じ向き・同じ時刻に2発を重ねて出していた=絵も音も1発に見えた。
//    新: 1発目は今どおり指を離した瞬間(1ロック目と同じ一斉発射)、2発目は HOMING_SECOND_SHOT_DELAY_MS 後に
//        もう1度「タン」と撃つ(発射音と銃口の光も2発目に出す)。威力・追尾は1発目と同じ。
//  - 浮かせ = 当たった敵を、一閃と同じ打ち上げ(格闘の4段目・区分の重さ)で浮かせる。ボス級は浮かせない(鞭と同じ)。

/** 2発目(赤サークルの2つ目のロック)を撃つまでの間(ms・gameTime)。「タン、タン」の間。 */
export const HOMING_SECOND_SHOT_DELAY_MS = 120;

export interface HomingVolleyShot {
  /** 狙う敵。 */
  enemyId: string;
  /** ロック配列の中での位置(弾の id の添字に使う)。 */
  index: number;
  /** 指を離してから撃つまでの時間(ms)。0=その場で撃つ。 */
  delayMs: number;
}

/**
 * ロックの並びから、撃つ弾の並びを作る。同じ敵の2つ目のロック(赤サークル)は HOMING_SECOND_SHOT_DELAY_MS 遅らせる。
 * 1つ目のロックは全部その場(一斉発射のまま)。弾の数=ロックの数(1つも減らさない・増やさない)。
 */
export const planHomingVolley = (locks: readonly string[]): HomingVolleyShot[] => {
  const seen = new Map<string, number>();
  return locks.map((enemyId, index) => {
    const n = (seen.get(enemyId) ?? 0) + 1;
    seen.set(enemyId, n);
    return { enemyId, index, delayMs: (n - 1) * HOMING_SECOND_SHOT_DELAY_MS };
  });
};

/** 遅らせた弾の待ち行列の1件(store が持つ)。at=撃つ gameTime。 */
export interface HomingPendingShot {
  enemyId: string;
  index: number;
  at: number;
  /** 守護霊が撃った弾なら、その守護霊の id(未指定=プレイヤー)。 */
  ghostId?: string;
  /** 撃つ時に狙う敵が消えていたら、この向きへ真っすぐ撃つ(指を離した時の向き)。 */
  dirX: number;
  dirY: number;
  /** 弾の id の種(指を離した時の Date.now)。 */
  seed: number;
}

/** 待ち行列のうち、撃つ時刻になった弾と、まだの弾に分ける(順序は保つ)。 */
export const splitDueHomingShots = (
  queue: readonly HomingPendingShot[], gameTime: number,
): { due: HomingPendingShot[]; rest: HomingPendingShot[] } => {
  const due: HomingPendingShot[] = [];
  const rest: HomingPendingShot[] = [];
  for (const s of queue) (gameTime >= s.at ? due : rest).push(s);
  return { due, rest };
};

/**
 * ホーミング弾が当たった敵を浮かせてよいか。区分は格闘の区分(brawlerEnemyClass)。
 * ボス級は浮かせない・終端(区分なし=null)も浮かせない。鞭で動かさない型(専用の動かし手を持つ型・跳び/突進の最中)も浮かせない
 * (=鞭で浮く敵と同じ対象)。倒した一撃は浮かせない。
 */
export const homingLiftAllowed = (
  cls: 'mob' | 'strong' | 'boss' | null, whipMovable: boolean, alive: boolean,
): boolean => alive && cls !== null && cls !== 'boss' && whipMovable;
