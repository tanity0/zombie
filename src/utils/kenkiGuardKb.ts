// research/BRAWLER_PHANTOM.md §16-9・BRAWLER.md §12-3d: 拳鬼が構えでプレイヤーの近接を受けたら、拳鬼が大きく下がる。判定だけの純関数。
//
// 社長の言葉: 「あと格闘はカウンター取ったら自分がノックバックする様にして。…雑魚以上の攻撃をカウンターした場合は通常のカウンター効果と、
// 同時に自分が大きくノックバック。…現状だとボスをカウンターハメできちゃう。」
// 拳鬼が受ける相手はプレイヤー(雑魚ではない)=いつもノックバック。弾の打ち返しでは下がらない(§16-9・実装で決めた所)。

/** 下がる距離(px・叩き台=格闘の「大」の押しと同じくらい)。 */
export const KENKI_GUARD_KB_PX = 150;
/** 下がる長さ(gameTime ms・叩き台)。加速→減速。 */
export const KENKI_GUARD_KB_MS = 280;

/** 新しく近接を構えで受けたか(1回の受けで1回まで)。 */
export const kenkiNewGuardReceive = (meleeCounterAt: number | undefined, lastSeen: number): boolean =>
  meleeCounterAt !== undefined && Number.isFinite(meleeCounterAt) && meleeCounterAt > lastSeen;

/** 下がる向きと量(プレイヤーから離れる向き・長さ KENKI_GUARD_KB_PX)。重なっている時は右へ。 */
export const kenkiGuardKbVector = (cx: number, cy: number, pcx: number, pcy: number): { dx: number; dy: number } => {
  const vx = cx - pcx, vy = cy - pcy;
  const l = Math.hypot(vx, vy);
  const ux = l > 1e-6 ? vx / l : 1, uy = l > 1e-6 ? vy / l : 0;
  return { dx: ux * KENKI_GUARD_KB_PX, dy: uy * KENKI_GUARD_KB_PX };
};

/**
 * 加速→減速の進み(p=0..1 → 0..1)。速さ ∝ 1−cos(2πp)=出だしと終わりが0(慣性MUST)。
 */
export const kenkiAccDecAlong = (p: number): number => {
  const q = Math.max(0, Math.min(1, p));
  return q - Math.sin(2 * Math.PI * q) / (2 * Math.PI);
};
