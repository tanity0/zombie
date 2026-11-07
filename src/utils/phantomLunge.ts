// research/LUNGE_DODGE.md §4(段L3・案2): 幻影の踏み込み回避の純関数。store も PixiJS も読まない葉モジュール。
//  (a) 弾: 歩きでは外れ切れない弾を、線から外れる向きへの踏み込みで抜ける。
//  (b) 詰め: プレイヤーが走って詰めてきたら、届く直前に抜けの踏み込みを出す(人格の記録で抜け方を写す)。
// 踏み込みは近接の振りそのもの(振る向きはプレイヤーの方・滑る向きだけ抜ける向き)=配線は phantomTick。
import type { HabitEpisode } from './habitEpisode';

/** 記録から抜け方を写すのに要る、踏み込みの向き(lg)付きで押したコマの数。 */
export const PHANTOM_ESCAPE_MIN_EPISODES = 3;
/** 記録を持たない人格の(b)の抜ける割合(叩き台)。 */
export const PHANTOM_ESCAPE_DEFAULT_CHANCE = 0.5;
/** 記録を持たない人格の(b)の構えの先読み(ms・叩き台=人の反応時間)。 */
export const PHANTOM_ESCAPE_DEFAULT_LEAD_MS = 250;
/** 記録から取った先読みを収める幅(ms)。 */
export const PHANTOM_ESCAPE_LEAD_MIN_MS = 120;
export const PHANTOM_ESCAPE_LEAD_MAX_MS = 400;
/** 「詰めてくる」= 幻影へ向かう速さがプレイヤーの基礎の速さのこの割合以上。 */
export const PHANTOM_CLOSE_IN_SPEED_FRAC = 0.6;

export interface PhantomEscapeStyle {
  /** (b)で抜ける割合(0..1)。 */
  chance: number;
  /** 抜ける時に「横」を選ぶ割合(0..1)。残りは「外」。 */
  sideFrac: number;
  /** 構えの先読み(ms)。プレイヤーが届く何ms前に抜けるか。 */
  leadMs: number;
  /** 記録から写したか(false=既定)。 */
  fromRecords: boolean;
  /** 元になったコマの数(記録から写した時)。 */
  n?: number;
}

export const DEFAULT_PHANTOM_ESCAPE_STYLE: PhantomEscapeStyle = {
  chance: PHANTOM_ESCAPE_DEFAULT_CHANCE, sideFrac: 0, leadMs: PHANTOM_ESCAPE_DEFAULT_LEAD_MS, fromRecords: false,
};

/**
 * 人格の記録(`moveHabits`)から抜け方を写す。押していて `lg` の付いたコマだけを見る(州は問わない)。
 * 足りなければ既定。
 */
export const phantomEscapeStyle = (moveHabits: Readonly<Record<string, readonly HabitEpisode[]>> | undefined): PhantomEscapeStyle => {
  if (!moveHabits) return DEFAULT_PHANTOM_ESCAPE_STYLE;
  let n = 0, out = 0, side = 0;
  const leads: number[] = [];
  for (const eps of Object.values(moveHabits)) {
    if (!Array.isArray(eps)) continue;
    for (const ep of eps) {
      if (!ep || ep.pressOfs === null || ep.pressOfs === undefined || ep.lg === undefined) continue;
      n++;
      if (ep.lg === 1) out++;
      else if (ep.lg === 2) side++;
      else continue;
      leads.push(-ep.pressOfs);
    }
  }
  if (n < PHANTOM_ESCAPE_MIN_EPISODES) return DEFAULT_PHANTOM_ESCAPE_STYLE;
  const esc = out + side;
  let leadMs = PHANTOM_ESCAPE_DEFAULT_LEAD_MS;
  if (leads.length > 0) {
    const sorted = [...leads].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    const median = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    leadMs = Math.max(PHANTOM_ESCAPE_LEAD_MIN_MS, Math.min(PHANTOM_ESCAPE_LEAD_MAX_MS, median));
  }
  return { chance: esc / n, sideFrac: esc > 0 ? side / esc : 0, leadMs, fromRecords: true, n };
};

/**
 * 人格のプロファイルから抜け方を決める。オンラインの人は共有の要約(`lungeStyle`)、
 * 手元のプロファイルはコマ(`moveHabits`)、どちらも無ければ既定。
 */
export const phantomEscapeStyleOf = (profile: {
  lungeStyle?: { chance: number; sideFrac: number; leadMs: number; n: number };
  moveHabits?: Readonly<Record<string, readonly HabitEpisode[]>>;
} | undefined): PhantomEscapeStyle => {
  const ls = profile?.lungeStyle;
  if (ls && Number.isFinite(ls.chance) && Number.isFinite(ls.sideFrac) && Number.isFinite(ls.leadMs)
    && (ls.n ?? 0) >= PHANTOM_ESCAPE_MIN_EPISODES) {
    return {
      chance: Math.max(0, Math.min(1, ls.chance)), sideFrac: Math.max(0, Math.min(1, ls.sideFrac)),
      leadMs: Math.max(PHANTOM_ESCAPE_LEAD_MIN_MS, Math.min(PHANTOM_ESCAPE_LEAD_MAX_MS, ls.leadMs)),
      fromRecords: true, n: ls.n,
    };
  }
  return phantomEscapeStyle(profile?.moveHabits);
};

/** 共有プロファイルへ載せる要約。記録が足りなければ載せない(undefined)。 */
export const lungeStyleForShare = (
  moveHabits: Readonly<Record<string, readonly HabitEpisode[]>> | undefined,
): { chance: number; sideFrac: number; leadMs: number; n: number } | undefined => {
  const st = phantomEscapeStyle(moveHabits);
  if (!st.fromRecords) return undefined;
  return { chance: st.chance, sideFrac: st.sideFrac, leadMs: st.leadMs, n: st.n ?? 0 };
};

const unit = (x: number, y: number): { x: number; y: number } | null => {
  const l = Math.hypot(x, y);
  return l > 1e-6 ? { x: x / l, y: y / l } : null;
};

/**
 * (b)の抜ける向き。外=プレイヤーから離れる向き / 横=その垂直(回る側=orbitSign)。
 * 重なっていて向きが決まらない時は null。
 */
export const phantomEscapeDir = (
  style: PhantomEscapeStyle, roll: number, fx: number, fy: number, px: number, py: number, orbitSign: 1 | -1,
): { x: number; y: number } | null => {
  const o = unit(fx - px, fy - py);
  if (!o) return null;
  if (roll < style.sideFrac) return { x: -o.y * orbitSign, y: o.x * orbitSign };
  return o;
};

/** (b)プレイヤーが「届く距離」へ入るまでの予測時間(ms)。向かってこないなら Infinity。 */
export const closeInEtaMs = (edgeDist: number, closingSpeed: number, reachPx: number): number => {
  if (!(closingSpeed > 0)) return Infinity;
  return (Math.max(0, edgeDist - reachPx) / closingSpeed) * 1000;
};

export interface BulletLike {
  x: number; y: number; width: number; height: number; speed: number; direction: { x: number; y: number };
}

/**
 * (a)弾の踏み込み。この弾が今の位置のままだと当たり、歩きでは外れ切れず、踏み込み(+残りの歩き)なら
 * 外れ切れる時だけ、弾の線から外れる向き(単位ベクトル)を返す。それ以外は null。
 * `radius`=自分の半径 / `walkSpeed`=今の歩きの速さ(px/s) / 踏み込み=`lungePx` を `lungeMs` で。
 */
export const phantomBulletLungeDir = (
  cx: number, cy: number, radius: number, walkSpeed: number, lungePx: number, lungeMs: number, p: BulletLike,
): { x: number; y: number } | null => {
  const d = unit(p.direction.x, p.direction.y);
  if (!d || !(p.speed > 0)) return null;
  const bx = p.x + p.width / 2, by = p.y + p.height / 2;
  const rx = cx - bx, ry = cy - by;
  const along = rx * d.x + ry * d.y;
  if (along <= 0) return null;                      // もう通り過ぎた
  const cross = -d.y * rx + d.x * ry;               // 左法線方向の横ずれ
  const hitR = radius + Math.max(p.width, p.height) / 2;
  if (Math.abs(cross) >= hitR) return null;         // このままでも当たらない
  const need = hitR - Math.abs(cross);
  const t = along / p.speed;                        // 着弾までの秒
  if (walkSpeed * t >= need) return null;           // 歩きで外れ切れる
  const lt = lungeMs / 1000;
  const reach = t >= lt ? lungePx + walkSpeed * (t - lt) : lungePx * (t / lt);
  if (reach < need) return null;                    // 踏み込んでも間に合わない
  const s = cross >= 0 ? 1 : -1;                    // 今ずれている側へ(線ぴったりなら左)
  return { x: -d.y * s, y: d.x * s };
};

// =================================================================================================
// research/GHOST_BOSS.md v10(社長2026-10-10「幻影がフェアじゃない」→「はい」): 弾ごとに1回、
// 「振って返す(counter)/避ける(dodge)/食らう(take)」を人格の記録どおりの割合で決める。
// =================================================================================================

/** このままだと当たる弾の、着弾までの時間(ms)。当たらない/通り過ぎた/速さ0なら null。 */
export const bulletEtaMs = (cx: number, cy: number, radius: number, p: BulletLike): number | null => {
  const d = unit(p.direction.x, p.direction.y);
  if (!d || !(p.speed > 0)) return null;
  const bx = p.x + p.width / 2, by = p.y + p.height / 2;
  const rx = cx - bx, ry = cy - by;
  const along = rx * d.x + ry * d.y;
  if (along <= 0) return null;
  const cross = -d.y * rx + d.x * ry;
  if (Math.abs(cross) >= radius + Math.max(p.width, p.height) / 2) return null;
  return (along / p.speed) * 1000;
};

export type BulletPlan = 'counter' | 'dodge' | 'take';
export interface BulletPlanRates { counter: number; dodge: number; take: number }
/** 記録が何も無い人格の割合(叩き台)。 */
export const DEFAULT_BULLET_PLAN_RATES: BulletPlanRates = { counter: 0.2, dodge: 0.5, take: 0.3 };

interface ReactionStatLike { n: number; counterRate: number; hitRate: number }
const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/**
 * 人格の「技への反応表」から割合を出す。`keys`(弾の技)の n 重み付き平均 → n 合計0なら表の全部 → それも0なら叩き台。
 * counter=打ち返し率 / take=食らった率 / dodge=残り(0〜1。counter+take>1 なら dodge=0)。
 */
export const bulletPlanRates = (
  table: Readonly<Record<string, ReactionStatLike | undefined>> | undefined, keys: readonly string[],
): BulletPlanRates => {
  const avg = (ks: readonly string[]): BulletPlanRates | null => {
    let n = 0, c = 0, h = 0;
    for (const k of ks) {
      const st = table?.[k];
      if (!st || !(st.n > 0)) continue;
      n += st.n; c += clamp01(st.counterRate) * st.n; h += clamp01(st.hitRate) * st.n;
    }
    if (n <= 0) return null;
    const counter = c / n, take = h / n;
    return { counter, take, dodge: Math.max(0, 1 - counter - take) };
  };
  return avg(keys) ?? avg(Object.keys(table ?? {})) ?? DEFAULT_BULLET_PLAN_RATES;
};

/** 引き順: r < counter → counter / r < counter+take → take / それ以外 → dodge(合計>1でも順で決まる)。 */
export const pickBulletPlan = (rates: BulletPlanRates, r: number): BulletPlan =>
  (r < rates.counter ? 'counter' : r < rates.counter + rates.take ? 'take' : 'dodge');
