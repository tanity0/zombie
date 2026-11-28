// ★「当てた直後のフリック」の追加攻撃の共通部品(刀の燕返し=research/KATANA_TSUBAME.md。鞭の引き寄せ/叩きつけのフリックは廃止=research/WHIP_FOLLOWUP.md §7)。
// 受付の窓(当たった瞬間から実時間300ms・1回だけ)と、元の技の向きとフリックの向きの角度の帯の判定だけを置く純関数。
// store にも描画にも依存しない。数値は叩き台(実機で詰める)。

/** 受付の長さ(ms・実時間=Date.now)。叩き台。 */
export const FLICK_FOLLOWUP_WINDOW_MS = 300;
/** 進行方向とみなす最大の角度(度)。 */
export const FLICK_FOLLOWUP_FORWARD_DEG = 60;
/** 反対とみなす最小の角度(度)。 */
export const FLICK_FOLLOWUP_BACK_DEG = 120;

/** 受付の窓(store が持つ)。dirX/dirY=元の技の向き(単位)。hitIds=その技で当たった敵。 */
export interface FlickFollowupWindow {
  hitAt: number;
  dirX: number;
  dirY: number;
  hitIds: string[];
  used: boolean;
}

/** 向きの帯。forward=なす角60°以内 / back=120°以上 / null=その間(横)か長さ0。 */
export type FlickBand = 'forward' | 'back';

/** 受付が開いているか(当たった瞬間〜+300ms・未使用・当たりが1体以上)。 */
export const isFlickFollowupOpen = (w: FlickFollowupWindow | null | undefined, now: number): boolean =>
  !!w && !w.used && w.hitIds.length > 0 && now >= w.hitAt && now - w.hitAt <= FLICK_FOLLOWUP_WINDOW_MS;

/** 元の技の向きとフリックの向きのなす角で帯を決める(境目は「以内/以上」を含む)。 */
export const flickBand = (base: { x: number; y: number }, flick: { x: number; y: number }): FlickBand | null => {
  const bl = Math.hypot(base.x, base.y), fl = Math.hypot(flick.x, flick.y);
  if (bl < 1e-6 || fl < 1e-6) return null;
  const cos = (base.x * flick.x + base.y * flick.y) / (bl * fl);
  const eps = 1e-9; // 浮動小数の誤差ぶんだけ甘く取る
  if (cos >= Math.cos((FLICK_FOLLOWUP_FORWARD_DEG * Math.PI) / 180) - eps) return 'forward';
  if (cos <= Math.cos((FLICK_FOLLOWUP_BACK_DEG * Math.PI) / 180) + eps) return 'back';
  return null;
};
