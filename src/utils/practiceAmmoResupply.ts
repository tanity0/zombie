// 変異体対策室(ボスの練習ラン)の弾の補給(社長指示2026-11-14「変異体対策室では、弾切れになると
// 画面のランダム位置に弾が落ちる様に」)。
//
// ★このモジュールは判定だけ(レンダラ非依存・乱数は引数で注入)。呼ぶのは gameStore の
//   practiceAmmoResupplyTick だけで、練習ラン(isPracticeRun)以外では呼ばれない=本編は1bitも変わらない。
//
// - 弾切れ = その銃が「弾倉0 かつ その弾の種類の予備弾0」。弾の種類は weaponAmmoTypeFor(デザートテックの
//   切り替え込み)、無限弾(infiniteAmmo)・弾倉の無い銃(noAmmo)・近接は弾切れにならない。
// - 種類ごとに1つ。同じ種類の弾が場にある間は落とさない(拾って撃ち切ったら、また落ちる)。
import type { AmmoType, Player } from '../types/game';
import { ammoPoolFor, weaponAmmoTypeFor } from './weaponUtils';

/** 拾い物の当たり判定の一辺(gameStore の PICKUP_HIT_SIZE と同じ値)。 */
export const PRACTICE_AMMO_PICKUP_SIZE = 16;
/** プレイヤーの中心から最低これだけ離す(ワールドpx)。拾うと同時、にならない距離。 */
export const PRACTICE_AMMO_MIN_PLAYER_DIST = 140;
/** 可視域の左右の縁から内側へ空ける割合(右の武器欄などHUDの下に潜らないように)。 */
export const PRACTICE_AMMO_EDGE_INSET_X_FRAC = 0.1;
/** 地平線(拾い物が透けて見えなくなる線)からこれだけ下から置く(ワールドpx)。CLAUDE.md「Y方向」の表の1行目。 */
export const PRACTICE_AMMO_HORIZON_PAD_PX = 70;
/** 画面の下端からこれだけ上まで(ワールドpx)。下端の霧・暗がり・HUDに潜らない(縦持ち430×932の撮影で110では霧に半分沈んだ)。 */
export const PRACTICE_AMMO_BOTTOM_PAD_PX = 180;
/** 置き場所を探す回数。見つからなければその回は落とさない(次のフレームでまた探す)。 */
export const PRACTICE_AMMO_TRIES = 24;

/** いま弾切れになっている弾の種類(重複なし・所持順)。 */
export const practiceDryAmmoTypes = (player: Player): AmmoType[] => {
  const out: AmmoType[] = [];
  for (const w of player.weapons) {
    if (w.isMelee || w.noAmmo || w.infiniteAmmo || !w.ammoType) continue;
    if ((w.magazine ?? 0) > 0) continue;
    const t = weaponAmmoTypeFor(w, player);
    if (!t || ammoPoolFor(player, t) > 0) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
};

/** 拾い物の型 → 弾の種類(弾の拾い物でなければ undefined)。 */
export const ammoTypeOfPickup = (type: string): AmmoType | undefined => {
  switch (type) {
    case 'ammo-handgun': return 'handgun';
    case 'ammo-shotgun': return 'shotgun';
    case 'ammo-rifle': return 'rifle';
    case 'ammo-phill': return 'phill';
    case 'ammo-glauncher': return 'glauncher';
    default: return undefined;
  }
};

/** 弾切れの種類のうち、場に同じ種類の弾が無いもの(=今落とすもの)。 */
export const practiceAmmoTypesToDrop = (
  dry: readonly AmmoType[], pickups: readonly { type: string }[],
): AmmoType[] => {
  if (dry.length === 0) return [];
  const onField = new Set<AmmoType>();
  for (const p of pickups) {
    const t = ammoTypeOfPickup(p.type);
    if (t) onField.add(t);
  }
  return dry.filter(t => !onField.has(t));
};

export interface PracticeAmmoView { left: number; top: number; right: number; bottom: number; horizonY: number }

/**
 * 落としてよい範囲(拾い物の左上が入る矩形)。`view` は実際に映るワールド矩形=spawnRefill の renderedViewRect の値
 * (ズーム引き込み・地平線 horizonY 込み)。地平線より上は拾い物が透けて消えるので、地平線の少し下からにする。
 */
export const practiceAmmoDropArea = (view: PracticeAmmoView): { x0: number; x1: number; y0: number; y1: number } => {
  const s = PRACTICE_AMMO_PICKUP_SIZE;
  const insetX = (view.right - view.left) * PRACTICE_AMMO_EDGE_INSET_X_FRAC;
  return {
    x0: view.left + insetX,
    x1: view.right - insetX - s,
    y0: Math.max(view.top, view.horizonY) + PRACTICE_AMMO_HORIZON_PAD_PX,
    y1: view.bottom - PRACTICE_AMMO_BOTTOM_PAD_PX - s,
  };
};

export interface PracticeAmmoSpotInput {
  /** 実際に映るワールド矩形(spawnRefill の renderedViewRect の値)。 */
  view: PracticeAmmoView;
  playerCx: number;
  playerCy: number;
  rng: () => number;
  /**
   * その左上(x,y)に拾い物(PRACTICE_AMMO_PICKUP_SIZE 四方)を置けるか=移動可能帯の内で、壁・木・建物の中ではない。
   * 置ける時は置く左上を返す(帯へ寄せた結果を返してよい)、置けない時は null。
   */
  standable: (x: number, y: number) => { x: number; y: number } | null;
  minPlayerDist?: number;
  tries?: number;
}

/** 画面に見えている範囲のランダムな位置(拾い物の左上)。置ける所が見つからなければ null。 */
export const pickPracticeAmmoSpot = (input: PracticeAmmoSpotInput): { x: number; y: number } | null => {
  const { view, playerCx, playerCy, rng, standable } = input;
  const minD = input.minPlayerDist ?? PRACTICE_AMMO_MIN_PLAYER_DIST;
  const tries = input.tries ?? PRACTICE_AMMO_TRIES;
  const s = PRACTICE_AMMO_PICKUP_SIZE;
  const { x0, x1, y0, y1 } = practiceAmmoDropArea(view);
  if (!(x1 > x0) || !(y1 > y0)) return null;
  const inside = (x: number, y: number): boolean => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const farEnough = (x: number, y: number): boolean =>
    Math.hypot(x + s / 2 - playerCx, y + s / 2 - playerCy) >= minD;
  for (let i = 0; i < tries; i++) {
    const x = x0 + rng() * (x1 - x0);
    const y = y0 + rng() * (y1 - y0);
    if (!farEnough(x, y)) continue;
    const r = standable(x, y);
    // 帯へ寄せた結果が可視域の外・プレイヤーの近くへずれたら採らない。
    if (!r || !inside(r.x, r.y) || !farEnough(r.x, r.y)) continue;
    return r;
  }
  return null;
};
