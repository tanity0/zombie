// UNIQUE_WEAPONS.md §16-2(バッチC-1「氷槍ライフル」rifle-t2-icelance)。弾の射線に短時間の床(線)を
// 残す(幅28px・1.2秒・200msごとに直撃の20%)。床そのものは src/utils/persistentBeam.ts の
// PersistentBeam(§19-1の共通土台)をそのまま使う——追尾しない固定線分なので新しい構造は要らない。
// ここに置くのは「床の寸法」定数と「直撃ダメージ→床の1パルスダメージ」の変換だけ(純関数)。
//
// ★武器自体に凍傷は持たせない(社長指定)。既存の炎床(molotov.ts)は流用しない
// (ダメージを与えず延焼を付けるだけ・判定は円・敵→プレイヤー向きで形が違う・落としやすい点)。
// ★床の長さは「弾の射線」=その弾の実際の飛翔距離(speed×duration/1000)を上限に、壁で短縮する
// (呼び出し側=useGameLoop.tsがshortenSegmentAtWalls+共通beamWallsで行う)。

export const ICE_LANCE_FLOOR_HALFWIDTH = 14; // 幅28px÷2
export const ICE_LANCE_FLOOR_DURATION_MS = 1200;
export const ICE_LANCE_FLOOR_PULSE_MS = 200;
export const ICE_LANCE_FLOOR_DAMAGE_FRAC = 0.20;

/** 直撃ダメージ(発射時に確定したproj.damage)から床の1パルスダメージを導出する。最低1。 */
export const iceLanceFloorPulseDamage = (hitDamage: number): number =>
  Math.max(1, Math.round(hitDamage * ICE_LANCE_FLOOR_DAMAGE_FRAC));
