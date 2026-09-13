// 金環(gold-ring)サブウェポン(スリィエル報酬・UNIQUE_WEAPONS.md §19)。
// 「敵の周囲へ2基を展開し、そこから固定方向の3秒レーザーを撃つ一時砲台型」。
// 金環自体は接触ダメージを持たない(§19-2)——ダメージ源は展開後に発射する持続線分
// (src/utils/persistentBeam.ts=§19-1の共通土台)だけ。
//
// 状態機械: 'deploying'(300ms・慣性つきで展開位置へ移動)→ 'firing'(3000ms・射線固定でパルス)
// → 'fading'(統一型フェード・PACING_PUZZLE §7-15)→ 消滅。展開→停止→照射→消滅の一方通行
// (社長裁定2026-09-06「a」=戻らない・§19-7で確定済み)。
//
// 発射・パルス適用・敵の除外・キル処理は useGameLoop/gameStore(店・store側の主語解決が要るため)。
// ここは店・PixiJS 非依存の純幾何/純状態だけを持つ(ヘッドレスでテスト可能)。
import type { PersistentBeam } from './persistentBeam';

// --- 数値(UNIQUE_WEAPONS.md §19-2・確定値) ---
export const GOLD_RING_COOLDOWN_MS = 9000;      // 全Lv共通
export const GOLD_RING_DEPLOY_MS = 300;         // 展開時間(加速→減速の慣性つき)
export const GOLD_RING_OFFSET_PX = 70;          // ターゲット中心からの直交オフセット(2本で挟む)
export const GOLD_RING_LASER_LEN = 420;         // レーザー長=対象取得の最大距離と同値(§19-2b)
export const GOLD_RING_LASER_HALFWIDTH = 7;     // レーザー半幅
export const GOLD_RING_LASER_MS = 3000;         // 照射時間(射線固定)
export const GOLD_RING_PULSE_MS = 200;          // パルス間隔(3秒で15パルス/本)
export const GOLD_RING_DAMAGE_BY_LEVEL: readonly number[] = [0, 6, 8, 10]; // index=level(1..3)。Lvで伸びるのはこれだけ(§19-2)
export const GOLD_RING_MAX_AIM_DIST = GOLD_RING_LASER_LEN; // 対象取得の最大距離=420px(§19-2b)
// 統一型フェード(PACING_PUZZLE §7-15)の尺。pixiScene.weaponSpawnEase と同じレンジ(180〜260msの
// 中央値220ms)を流用し、二重の定数を作らない(呼び出し側=pixiSceneがその定数を直接使う)。
export const GOLD_RING_FADE_MS = 220;
// レーザー方向の0ベクトル対策(§19-2b「対象までの距離が閾値未満なら展開方向をレーザー方向に使う」)。
// 「ほぼ同位置」を検出できれば十分な小さい値(実プレイでは敵の当たり判定サイズよりずっと小さい)。
export const GOLD_RING_ZERO_VEC_EPS = 1;

export interface GoldRingPoint { x: number; y: number }

/**
 * 2本の展開先(ターゲット中心から、射出方向に対して直交へ ±70px)を返す。
 * 「対象を挟む形」なので順序に意味はない(呼び出し側が2本とも生成する)。
 * 壁補正(resolveAabb)はしない=呼び出し側の責務(§19-2b「壁の中なら押し戻す」)。
 */
export const computeGoldRingDeployPoints = (
  targetX: number, targetY: number, dirX: number, dirY: number, offset = GOLD_RING_OFFSET_PX,
): [GoldRingPoint, GoldRingPoint] => {
  const mag = Math.max(0.001, Math.hypot(dirX, dirY));
  const ux = dirX / mag, uy = dirY / mag;
  const nx = -uy, ny = ux; // 直交(法線)ベクトル
  return [
    { x: targetX + nx * offset, y: targetY + ny * offset },
    { x: targetX - nx * offset, y: targetY - ny * offset },
  ];
};

/** 展開の慣性(加速→減速=ease-in-out cubic)。t は 0..1 にクランプする。CLAUDE.md「動きの絶対ルール」準拠。 */
export const goldRingDeployEase = (t: number): number => {
  const c = Math.max(0, Math.min(1, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
};

/** 展開中(phase='deploying')の現在位置。描画・判定のどちらからも呼べる純関数(タイムスタンプ駆動)。 */
export const goldRingCurrentPos = (
  startX: number, startY: number, targetX: number, targetY: number,
  deployStartAt: number, deployEndAt: number, gameTime: number,
): GoldRingPoint => {
  const dur = Math.max(1, deployEndAt - deployStartAt);
  const t = goldRingDeployEase((gameTime - deployStartAt) / dur);
  return { x: startX + (targetX - startX) * t, y: startY + (targetY - startY) * t };
};

/**
 * レーザー方向を決める(§19-2b「0ベクトル」対策込み)。
 * - `targetPoint` があり、金環からの距離が `GOLD_RING_ZERO_VEC_EPS` 以上なら、その方向(単位ベクトル)。
 * - それ以外(対象なし、または金環とほぼ同位置)は `deployDir`(展開方向=射出時の向き)を使う。
 * 常に有効な単位ベクトルを返す(NaNにならない)。
 */
export const resolveGoldRingLaserDir = (
  ringX: number, ringY: number,
  targetPoint: GoldRingPoint | null,
  deployDirX: number, deployDirY: number,
): GoldRingPoint => {
  if (targetPoint) {
    const dx = targetPoint.x - ringX, dy = targetPoint.y - ringY;
    const dist = Math.hypot(dx, dy);
    if (dist >= GOLD_RING_ZERO_VEC_EPS) return { x: dx / dist, y: dy / dist };
  }
  const mag = Math.max(0.001, Math.hypot(deployDirX, deployDirY));
  return { x: deployDirX / mag, y: deployDirY / mag };
};

export type GoldRingPhase = 'deploying' | 'firing' | 'fading';

/** 金環1基の状態。書き手は useGameLoop のみ(CLAUDE.md「PixiJSは描くだけ」)。 */
export interface GoldRing {
  id: string;
  /** CD帳簿/倍率評価の宛先(setActorSubWeaponCooldown・combatActorPlayerと同じ意味)。undefined=プレイヤー。 */
  ownerGhostId?: string;
  /** 描画専用の青白tintマーカー(ドローンブーメラン等の既存サブと同じ作法)。 */
  ownerGhost?: boolean;
  phase: GoldRingPhase;
  startX: number; startY: number;   // 展開の始点(射出時のオーナー中心)
  targetX: number; targetY: number; // 展開完了位置(壁補正済み・以後固定)
  deployStartAt: number;            // gameTime
  deployEndAt: number;              // gameTime = deployStartAt + GOLD_RING_DEPLOY_MS
  deployDirX: number; deployDirY: number; // 展開方向の単位ベクトル(0ベクトルのフォールバック用)
  /** 'firing' 中のみ非null。射線固定=生成後、ax/ay/bx/by は変わらない(§19-2b「追尾しない」)。 */
  beam: PersistentBeam | null;
  firingEndAt: number; // gameTime。= beam.createdAt + beam.durationMs と同値(フェード開始の基準)
  fadeEndAt: number;   // gameTime。= firingEndAt + GOLD_RING_FADE_MS
  damagePerPulse: number; // 生成時に確定(Lv別)
}
