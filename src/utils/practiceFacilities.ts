// 変異体対策室(練習ラン)の開幕の設備: 大型武器庫(金箱)と、その下の武器商人。
// 社長指示2026-11-20「変異体対策室にはすべて、ステージ７みたいに特大武器庫を設置して、さらに下に武器商人設置して」。
//
// ★「ステージ7の武器庫」の実体: ステージ7の出撃(と、ステージ7へ出撃する練習)だけ、resetGame が開幕で
//   **金箱(pickup type 'bounty-chest'・開けると帯に「大型武器庫!!」)**を1個、プレイヤーの真下・画面の下端の少し外
//   (`spawnTL.y + 画面の高さ/2 + BOSS_START_CHEST_BELOW_MARGIN_PX`)に置いている(v0.25.3298/3644)。
//   練習ランでは、その同じ置き方を全ての枠へ広げ、さらにその下に武器商人を立てる。
//
// この層は純関数だけ(store が呼ぶ・PixiJS非依存)。位置は必ず「行ける帯」(clampRectToPlayableArea)の内側。
// 木・残骸などの障害物に重なる時は、呼び手が渡す `blocked` で近くの空いた所へずらす。
import { clampRectToPlayableArea, type PlayableAreaCtx } from '../world/playableArea';

/** 金箱(拾い物)の足元の箱の大きさ(拾い物の左上座標の規約・ステージ7の置き方と同じ16px)。 */
export const PRACTICE_CHEST_SIZE = 16;
/** 武器商人を金箱の何px下に立てるか。商人のサークル(半径58)が金箱に掛からず、金箱から一歩で届く間合い。 */
export const PRACTICE_MERCHANT_BELOW_CHEST_PX = 190;
/** 商人の足元の判定に使う箱(置き場所の確認だけに使う大きさ)。 */
export const PRACTICE_MERCHANT_FOOT_W = 40;
export const PRACTICE_MERCHANT_FOOT_H = 30;
/** 金箱と商人がこれより近いと、サークルと拾い物が重なって読めない。行ける帯が狭いステージ(研究所)で縦に並ばない時は横へずらす。 */
export const PRACTICE_FACILITY_MIN_GAP_PX = 150;

/** 洋館の通路だけ: 着いた所の左右へ分ける距離(通路の幅 ±170 の内側)と、商人の足元の y。 */
export const PRACTICE_CORRIDOR_SIDE_PX = 120;
export const PRACTICE_CORRIDOR_MERCHANT_Y = 40;

export interface PracticeFacilityPlan {
  /** 金箱の左上(addPickup の x,y にそのまま入れる)。 */
  chest: { x: number; y: number };
  /** 武器商人の立ち位置(weaponMerchant の x,y)。 */
  merchant: { x: number; y: number };
}

/** 障害物に重なる時に試す、ずらし先(近い順・左右を先に=縦の並びをなるべく保つ)。 */
const NUDGES: readonly [number, number][] = [
  [0, 0], [60, 0], [-60, 0], [120, 0], [-120, 0], [0, 60], [60, 60], [-60, 60], [180, 0], [-180, 0], [0, -60], [120, 60], [-120, 60],
];

const placeRect = (
  x: number, y: number, w: number, h: number, ctx: PlayableAreaCtx,
  blocked: (x: number, y: number, w: number, h: number) => boolean,
): { x: number; y: number } => {
  let first: { x: number; y: number } | null = null;
  for (const [dx, dy] of NUDGES) {
    const p = clampRectToPlayableArea(x + dx, y + dy, w, h, ctx);
    if (first === null) first = p;
    if (!blocked(p.x, p.y, w, h)) return p;
  }
  return first!; // どこも塞がっている(現実には起きない)=元の場所(行ける帯の内側)
};

/**
 * 置き場所を決める。
 * @param spawnTL プレイヤーの出撃位置(resetGame の spawnTL=プレイヤーの左上)
 * @param viewH 画面の高さ(gameBounds.height)。金箱はステージ7と同じく「画面の下端の少し外」
 * @param belowMarginPx ステージ7と同じ余白(BOSS_START_CHEST_BELOW_MARGIN_PX)
 * @param ctx 行ける帯の文脈(プレイヤーと同じ)
 * @param blocked 木・残骸などに重なるか(呼び手が世界の当たり判定で答える)
 */
export const planPracticeFacilities = (
  spawnTL: { x: number; y: number },
  viewH: number,
  belowMarginPx: number,
  ctx: PlayableAreaCtx,
  blocked: (x: number, y: number, w: number, h: number) => boolean = () => false,
): PracticeFacilityPlan => {
  const S = PRACTICE_CHEST_SIZE;
  const MW = PRACTICE_MERCHANT_FOOT_W, MH = PRACTICE_MERCHANT_FOOT_H;
  // ★洋館の通路(ステージ6・EX): 下(南)は行ける帯の外(CORRIDOR_BOTTOM_LIMIT)で、しかも開幕は南から走り込んで来る=
  // 真下に置くと走り込みの道の上に乗って勝手に拾ってしまう。⇒ 着いた所(y≈0)の左右へ分ける(金箱=左・商人=右)。
  if (ctx.corridorMode) {
    const cBox = placeRect(-PRACTICE_CORRIDOR_SIDE_PX - S / 2, -S / 2, S, S, ctx, blocked);
    const mBox = placeRect(PRACTICE_CORRIDOR_SIDE_PX - MW / 2, PRACTICE_CORRIDOR_MERCHANT_Y - MH, MW, MH, ctx, blocked);
    return { chest: cBox, merchant: { x: mBox.x + MW / 2, y: mBox.y + MH } };
  }
  const chest = placeRect(spawnTL.x, spawnTL.y + viewH / 2 + belowMarginPx, S, S, ctx, blocked);
  const cx = chest.x + S / 2, cy = chest.y + S / 2;
  // 商人の箱は足元基準(下端=商人の y)。まず金箱の真下。
  let m = placeRect(cx - MW / 2, cy + PRACTICE_MERCHANT_BELOW_CHEST_PX - MH, MW, MH, ctx, blocked);
  let mx = m.x + MW / 2, my = m.y + MH;
  // 帯が狭くて真下に届かない(研究所の横長廊下など)=金箱の横へ(下へ寄せられるだけ寄せる)。
  if (Math.hypot(mx - cx, my - cy) < PRACTICE_FACILITY_MIN_GAP_PX) {
    m = placeRect(cx + PRACTICE_MERCHANT_BELOW_CHEST_PX - MW / 2, cy + PRACTICE_MERCHANT_BELOW_CHEST_PX - MH, MW, MH, ctx, blocked);
    mx = m.x + MW / 2; my = m.y + MH;
  }
  return { chest, merchant: { x: mx, y: my } };
};
