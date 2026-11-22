// ★鞭の追加攻撃(research/WHIP_FOLLOWUP.md §7・社長 2026-11-23「反対フリックの技やめる。一度目の通常当てで、当たった敵はその場で浮く。
//   その浮いてる間に2発目当てると、自動で叩きつけ。…スラッシャーのスキル持ってる時は、0.5秒間隔で追加分、浮かせ続ける。最後は必ず叩きつけ。
//   鞭の浮きは高めにしないとかも。1秒掛けて頂点に浮く感じ。」)。§6 の叩きつけの爆発はそのまま。
// 判定だけを置く純関数(store にも描画にも依存しない)。数値は叩き台(実機で詰める)。
//  - 鞭の振りが当たった地上の敵(ボス級を除く)=その場で浮く(鞭専用の高く・ゆっくりの浮き)。
//  - 浮いている敵に鞭の振りが当たった=入力なしで叩きつけ(本体は鞭の1撃目の2倍の打撃+周りへの爆発)。
//  - スラッシャー持ち=当たった後 0.5秒ごとに段数ぶんの追加の振り。追加の振りは浮かせ続け、最後の1発は必ず叩きつけ。
import { brawlerJuggleHeightRel, brawlerAirborne, BRAWLER_JUGGLE_WEIGHT, BRAWLER_JUGGLE_BUDGET, type BrawlerJuggleFields } from './brawlerCombo';
import { WHIP_LIFT_HEIGHT_MULT, type LiftArcShape } from './brawler';

export { WHIP_LIFT_HEIGHT_MULT };
/** 叩きつけのダメージの倍率(鞭の1撃目に対して)。 */
export const WHIP_SLAM_DAMAGE_MULT = 2;
/** 叩きつけのヒットストップ(ms)。 */
export const WHIP_SLAM_HITSTOP_MS = 120;

// ---- 鞭の浮き(格闘の浮きの式 utils/brawler の brawlerLiftArcRel に、鞭専用の形と尺を渡す) ----
/** 地上から頂点まで(ms)=1秒かけて頂点へ(加速→減速)。 */
export const WHIP_LIFT_RISE_MS = 1000;
/** 頂点で漂う長さ(ms)。 */
export const WHIP_LIFT_HOVER_MS = 300;
/** 漂いの終わりから地面まで(ms・漂いの沈みの速さを引き継いで加速して落ちる)。 */
export const WHIP_LIFT_FALL_MS = 600;
/** 頂点を過ぎてから(漂い・落ち)の当たりで浮かせ直す時の、跳ね上がりの長さ(ms・打たれた瞬間が一番速い ease-out)。 */
export const WHIP_RELIFT_RISE_MS = 260;
/** 継ぎ足しの漂いは、次の追加の振りの時刻よりこれだけ長く残す(ms・次の振りが漂いの中で当たる)。 */
export const WHIP_KEEP_MARGIN_MS = 150;
/** 継ぎ足しで浮かせ直した時、今の高さより必ず上がる量(頂点の高さに対する割合)。 */
export const WHIP_RELIFT_MIN_RISE = 0.08;

/** 上り・漂い・落ちの長さ(ms)から弧の配分を作る。 */
export const whipLiftArcShape = (riseMs: number, hoverMs: number, fallMs: number, riseEase: 'out' | 'inOut'): LiftArcShape => {
  const tot = Math.max(1, riseMs + hoverMs + fallMs);
  return { rise: riseMs / tot, hover: hoverMs / tot, riseEase };
};
/** 地上から浮かせた1回目の弧の配分(1秒で頂点・加速→減速)。 */
export const WHIP_LIFT_SHAPE: LiftArcShape = whipLiftArcShape(WHIP_LIFT_RISE_MS, WHIP_LIFT_HOVER_MS, WHIP_LIFT_FALL_MS, 'inOut');
/** 地上から浮かせた1回目の弧の長さ(ms)。 */
export const WHIP_LIFT_MS = WHIP_LIFT_RISE_MS + WHIP_LIFT_HOVER_MS + WHIP_LIFT_FALL_MS;

/** 鞭の浮きの頂点の高さ(格闘の4段目の打ち上げ=1 に対する倍率)。区分の重さは格闘と同じ(強個体は低め)。 */
export const whipLiftTop = (cls: 'mob' | 'strong'): number => WHIP_LIFT_HEIGHT_MULT * BRAWLER_JUGGLE_WEIGHT[cls];

/** 今の鞭の浮きの上りの終わり(=頂点に着く時刻・Date.now)。鞭の浮きでなければ null。 */
export const whipLiftApexAt = (e: BrawlerJuggleFields): number | null => {
  if (e.brLiftShape !== 'whip' || e.brawlerLiftAt === undefined || !e.brLiftArc) return null;
  return e.brawlerLiftAt + Math.round((e.brLiftMs ?? 0) * e.brLiftArc.rise);
};
/** 今の鞭の浮きの落ち始める時刻(漂いの終わり・Date.now)。鞭の浮きでなければ null。 */
export const whipLiftFallAt = (e: BrawlerJuggleFields): number | null => {
  if (e.brLiftShape !== 'whip' || e.brawlerLiftAt === undefined || !e.brLiftArc) return null;
  return e.brawlerLiftAt + Math.round((e.brLiftMs ?? 0) * (e.brLiftArc.rise + e.brLiftArc.hover));
};

export type WhipLiftPatch = Partial<BrawlerJuggleFields> & { liftUntil: number };

/**
 * 鞭の当たり1回ぶんの浮き。cls=区分(ボス級は浮かないので呼び手が外す)。
 *  - 地上の敵: その場で浮かせる(1秒で頂点へ加速→減速・頂点で漂う・落ちる)。高さ=whipLiftTop。
 *  - 浮いている敵(追加の振り=浮かせ続ける):
 *     ・鞭の浮きの上りの途中なら、弧はそのまま(高さが跳ばない)で漂いだけ継ぎ足す(次の追加の振りが漂いの中で当たる長さまで)。
 *     ・頂点を過ぎた(漂い・落ち)/鞭以外の浮きなら、今の高さから打ち上げ直す(打たれた瞬間が一番速い・頂点は鞭の頂点か今より少し上)。
 *  拾える回数の予算(格闘と共有)は使わない(鞭の連続は段数が決まっていて、必ず最後に叩きつける=永久には浮かない)。
 */
export const whipLiftPatch = (
  e: BrawlerJuggleFields, cls: 'mob' | 'strong', now: number, nextHitInMs = 0,
): WhipLiftPatch => {
  const top = whipLiftTop(cls);
  const keepHover = Math.max(WHIP_LIFT_HOVER_MS, nextHitInMs + WHIP_KEEP_MARGIN_MS);
  if (!brawlerAirborne(e, now)) {
    const ms = WHIP_LIFT_MS;
    return {
      brawlerLiftAt: now, brLiftMs: ms, brLiftPeak: top, brLiftFrom: 0, brLiftN: 0, brLiftUntil: now + ms, liftUntil: now + ms, brLiftLand: true,
      brLiftShape: 'whip', brLiftArc: WHIP_LIFT_SHAPE, brLiftFallK: 1, brLiftDown: false, brLiftDropMs: 0, brBlastAirSince: now,
      brLiftBudget: BRAWLER_JUGGLE_BUDGET[cls],
    };
  }
  const apexAt = whipLiftApexAt(e);
  if (apexAt !== null && now < apexAt && e.brawlerLiftAt !== undefined && (e.brLiftDropMs ?? 0) <= 0 && (e.brLiftPeak ?? 0) > 0) {
    // 上りの途中: 上りの時刻・高さはそのまま。漂いの終わり(落ち始め)だけを後ろへ(早くはしない)。
    const riseMs = apexAt - e.brawlerLiftAt;
    const fallAt = whipLiftFallAt(e) ?? apexAt;
    const hoverMs = Math.max(fallAt, now + keepHover) - apexAt;
    const ms = riseMs + hoverMs + WHIP_LIFT_FALL_MS;
    return {
      brLiftMs: ms, brLiftUntil: e.brawlerLiftAt + ms, liftUntil: e.brawlerLiftAt + ms,
      brLiftArc: whipLiftArcShape(riseMs, hoverMs, WHIP_LIFT_FALL_MS, e.brLiftArc?.riseEase ?? 'inOut'),
    };
  }
  // 頂点の後(または鞭以外の浮き・叩き落としの最中): 今の高さから打ち上げ直す。
  const h = brawlerJuggleHeightRel(e, now);
  const want = Math.max(top, h + WHIP_RELIFT_MIN_RISE * top);
  const peak = whipReliftPeak(h, want);
  const hoverMs = Math.max(WHIP_LIFT_HOVER_MS, nextHitInMs + WHIP_KEEP_MARGIN_MS - WHIP_RELIFT_RISE_MS);
  const ms = WHIP_RELIFT_RISE_MS + hoverMs + WHIP_LIFT_FALL_MS;
  return {
    brawlerLiftAt: now, brLiftMs: ms, brLiftPeak: peak, brLiftFrom: h, brLiftN: (e.brLiftN ?? 0) + 1, brLiftUntil: now + ms, liftUntil: now + ms, brLiftLand: true,
    brLiftShape: 'whip', brLiftArc: whipLiftArcShape(WHIP_RELIFT_RISE_MS, hoverMs, WHIP_LIFT_FALL_MS, 'out'), brLiftFallK: 1, brLiftDown: false, brLiftDropMs: 0,
  };
};
/** 今の高さ h から頂点 want へ上がり直す押し上げ量(格闘の浮き直しの頂点の式 brawlerJuggleTop の逆)。 */
export const whipReliftPeak = (h: number, want: number): number => {
  // brawlerJuggleTop(h, p) = max(0.8h + p, h + 0.3p) は p について増える=want に届く最小の p。
  // 2本の増える直線の大きい方が want に届く所=それぞれが届く p の小さい方。
  return Math.max(0, Math.min(want - 0.8 * h, (want - h) / 0.3));
};

// ---- 当たりの分類(浮かせる/叩きつけ/普通の打撃) ----
/** 振りの種類。'swing'=普通の振り(1発目・スラッシャーなしの振り) / 'keep'=スラッシャーの追加の振り(最後以外) / 'final'=スラッシャーの最後の追加の振り。 */
export type WhipStrikeMode = 'swing' | 'keep' | 'final';
/** 当たった敵1体の扱い。'lift'=浮かせる(浮いていれば浮かせ続ける) / 'slam'=叩きつけ / 'plain'=普通の打撃(浮かない)。 */
export type WhipHitKind = 'lift' | 'slam' | 'plain';
/**
 * 鞭の振りが当たった敵1体をどう扱うか。
 *  - ボス級=浮かない(だから叩きつけにもならない)=普通の打撃。
 *  - 浮いている敵: 'swing'・'final'=叩きつけ / 'keep'=浮かせ続ける(浮かせられない状況なら普通の打撃)。
 *  - 地上の敵: 浮かせられる(liftable=技の最中でない・専用の動かし手の型でない等)なら浮かせる / そうでなければ普通の打撃。
 *  強個体は雑魚と同じ(区分の重さで高さだけ変わる)。
 */
export const classifyWhipHit = (
  e: { boss: boolean; airborne: boolean; liftable: boolean }, mode: WhipStrikeMode,
): WhipHitKind => {
  if (e.boss) return 'plain';
  if (e.airborne) return mode === 'keep' ? (e.liftable ? 'lift' : 'plain') : 'slam';
  return e.liftable ? 'lift' : 'plain';
};

// ---- スラッシャーの追加の振り(0.5秒ごと・段数ぶん・最後は必ず叩きつけ) ----
/** 追加の振りの間隔(ms・Date.now=浮きの時計と同じ)。 */
export const WHIP_CHAIN_INTERVAL_MS = 500;
/** スラッシャーの Lv から追加の振りの数(Lv1=最大2連→追加1 / Lv2=追加2 / Lv3=追加3・持っていなければ0)。 */
export const whipChainExtras = (slasherLv: number): number => Math.max(0, Math.min(3, Math.floor(slasherLv)));
/** k 番目(1始まり)の追加の振りの種類(最後=必ず叩きつけの 'final')。 */
export const whipChainModeAt = (k: number, extras: number): WhipStrikeMode => (k >= extras ? 'final' : 'keep');
/** 追加の振りの時刻と種類の並び(1発目が当たった時刻 hitAt から)。 */
export const planWhipChain = (hitAt: number, extras: number): { at: number; mode: WhipStrikeMode }[] =>
  Array.from({ length: whipChainExtras(extras) }, (_, i) => ({ at: hitAt + (i + 1) * WHIP_CHAIN_INTERVAL_MS, mode: whipChainModeAt(i + 1, extras) }));

/**
 * 追加の振りの状態(主語ごとに1つ・store が持つ)。dirX/dirY=1発目の振りの向き(追加の振りの向きの既定)。
 * nextAt=次の追加の振りの時刻・done=出した数・extras=全部の数。priorityIds=1発目で浮いた敵(追加の振りはこの敵を狙う)。
 */
export interface WhipChainState {
  dirX: number; dirY: number;
  nextAt: number;
  done: number;
  extras: number;
  priorityIds: string[];
}
/** 1発目が当たった時の追加の振りの状態(追加が無ければ null)。 */
export const startWhipChain = (hitAt: number, extras: number, dirX: number, dirY: number, priorityIds: readonly string[]): WhipChainState | null => {
  const n = whipChainExtras(extras);
  return n > 0 ? { dirX, dirY, nextAt: hitAt + WHIP_CHAIN_INTERVAL_MS, done: 0, extras: n, priorityIds: [...priorityIds] } : null;
};
/** 追加の振りがまだ残っているか(ハンティングの一連の動きもこの間)。 */
export const whipChainActive = (c: WhipChainState | null | undefined): boolean => !!c && c.done < c.extras;
/**
 * 時計が止まっていた後(レベルアップ画面・チュートリアル・アプリが裏に回った間も壁時計は進む)の置き直し。
 * 次の追加の振りの時刻から1間隔より遅れていたら、取りこぼした段は出さずに nextAt = now + 間隔 へ後ろへずらす(明けた直後に残りの段を一斉に出さない)。
 * 遅れていなければ同じ状態をそのまま返す(呼び手は「変わったか」で書き込みを決められる)。
 */
export const whipChainAfterStall = (c: WhipChainState, now: number): WhipChainState =>
  now - c.nextAt > WHIP_CHAIN_INTERVAL_MS ? { ...c, nextAt: now + WHIP_CHAIN_INTERVAL_MS } : c;
/** 今出す追加の振り(時刻が来ていない・止まっていた後で置き直しが要る=null)。出したら nextWhipChain で進める。 */
export const dueWhipChainStep = (c: WhipChainState | null | undefined, now: number): { k: number; mode: WhipStrikeMode } | null => {
  if (!c || c.done >= c.extras || now < c.nextAt) return null;
  if (whipChainAfterStall(c, now) !== c) return null; // 遅れすぎ=まず置き直す(この時刻には出さない)
  const k = c.done + 1;
  return { k, mode: whipChainModeAt(k, c.extras) };
};
/** 追加の振りを1つ出した後の状態(最後を出したら null)。次は「実際に出した時刻 now」から1間隔後(遅れて出ても次が詰まって続けて出ない)。 */
export const nextWhipChain = (c: WhipChainState, now: number): WhipChainState | null => {
  const done = c.done + 1;
  return done >= c.extras ? null : { ...c, done, nextAt: Math.max(c.nextAt, now) + WHIP_CHAIN_INTERVAL_MS };
};
/**
 * 追加の振りの向き。1発目で浮いた敵(生きている)のうち一番近い敵へ向ける。居なければ1発目の振りの向き。
 * cx,cy=振る本人の体の中心。targets=1発目で浮いた敵の今の中心。
 */
export const whipChainAimDir = (
  c: Pick<WhipChainState, 'dirX' | 'dirY'>, cx: number, cy: number, targets: readonly { x: number; y: number }[],
): { x: number; y: number } => {
  let best: { x: number; y: number } | null = null, bd = Infinity;
  for (const t of targets) {
    const d = Math.hypot(t.x - cx, t.y - cy);
    if (d > 1e-6 && d < bd) { bd = d; best = { x: (t.x - cx) / d, y: (t.y - cy) / d }; }
  }
  if (best) return best;
  const l = Math.hypot(c.dirX, c.dirY) || 1;
  return { x: c.dirX / l, y: c.dirY / l };
};

// ---- ★叩きつけの爆発(§6・社長 2026-11-22「鞭の叩きつけは爆発ダメージにして」「爆発は叩きつけられた敵を中心にです」) ----
/**
 * 叩きつけた敵1体ごとに、その体の中心(地面に着いた点)を爆心にした爆発を1発ずつ起こす。
 * 爆発どうしの重なりは、手榴弾が同時に複数爆発した時と同じ=それぞれが独立に当たる(1体に2発の爆発が届けば2回当たる)。
 * 爆発は周りの敵にだけ当たる。爆心の敵本体は鞭の打撃(叩きつけ)で当てているので、自分の爆発は受けない(二重にしない)。
 * 叩きつけた別の敵の爆発の中に入っていれば、その爆発は受ける。
 * 距離による減りは手榴弾と同じ(爆心で1・縁で0.55)。
 */
export const whipSlamBlastFalloff = (dist: number, radius: number): number =>
  0.55 + (1 - Math.min(1, Math.max(0, dist) / Math.max(1, radius))) * 0.45;

export interface WhipSlamBlastHit { centerId: string; targetId: string; dist: number; scale: number }

/**
 * 爆発ごとの当たりの並び。centers=叩きつけた敵(爆心=体の中心)。targets=当たりうる敵(anchor=爆心から見た当たりの点・blocked=壁越し)。
 * 爆心の敵本体は自分の爆発には入らない。ほかの敵は爆心から anchor までが半径以内で、壁越しでなければ当たる(scale=距離の減り)。
 */
export const whipSlamBlastPlan = (
  centers: readonly { id: string; x: number; y: number }[],
  targets: readonly { id: string; anchor: (cx: number, cy: number) => { x: number; y: number }; blocked?: (cx: number, cy: number, x: number, y: number) => boolean }[],
  radius: number,
): WhipSlamBlastHit[] => {
  const out: WhipSlamBlastHit[] = [];
  for (const c of centers) {
    for (const t of targets) {
      if (t.id === c.id) continue;
      const a = t.anchor(c.x, c.y);
      const d = Math.hypot(a.x - c.x, a.y - c.y);
      if (d > radius) continue;
      if (t.blocked?.(c.x, c.y, a.x, a.y)) continue;
      out.push({ centerId: c.id, targetId: t.id, dist: d, scale: whipSlamBlastFalloff(d, radius) });
    }
  }
  return out;
};
