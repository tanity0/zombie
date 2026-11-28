// research/BRAWLER_PHANTOM.md §16-10: 拳鬼(格闘の幻影)の「後ろへ下がる歩き」。判断だけの純関数(store・描画を読まない)。
//
// 社長の言葉: 「格闘 は、攻撃の方向と逆にレバー入れてる状態で攻撃を食らうと、ガードになる。(ダメージ半減、浮かない、少しノックバック)」
//             「幻影たちにも入れたいので拳鬼にも入れる。弾もガード可能」
// 拳鬼の「レバー」= その tick に頭脳が決めた歩く向き。攻撃してきた相手から離れる向きへ歩こうとしている時に食らうとガードになる
// (成立の判定はプレイヤーと同じ brawlerLeverGuard の純関数)。ここは「いつ下がるか・どれだけ下がるか・どっちへ下がるか」だけ。
//  使いどころ(人間味・常には使わない):
//   ①プレイヤーの近接の当たりを予測した時、構えを出さなかった/出せない(ポイント不足・クールダウン)なら、人格の確率で下がってガード。
//   ②弾が来る時の3つ目の手(構えで返す・ステップで避ける・下がってガード)。
//  どちらも人の反応の下限(HUMAN_REACTION_MS)を通す。下がっている間は攻めない。亀にしない=1回の下がりは短く・間隔を空ける。
import { HUMAN_REACTION_MS } from './bossSkeleton';

/** 1回の下がりの長さ(ms・gameTime)。この幅の中で毎回引く(叩き台)。 */
export const KENKI_RETREAT_MIN_MS = 300;
export const KENKI_RETREAT_MAX_MS = 500;
/** 下がりが終わってから、次に下がってよいまでの間隔(ms・gameTime・叩き台)。亀にしない。 */
export const KENKI_RETREAT_GAP_MS = 1500;
/** 近接の読みで下がる確率(人格の「受けに回る癖」counterChance 0..1 で MIN..MAX・叩き台)。 */
export const KENKI_RETREAT_MELEE_P_MIN = 0.25;
export const KENKI_RETREAT_MELEE_P_MAX = 0.6;
/** 弾: 対処を決める時に「下がってガード」を選ぶ確率(構えで返す・ステップで避ける・食らう、の割合の外側で先に引く・叩き台)。 */
export const KENKI_RETREAT_BULLET_P = 0.25;
/** 弾: 着弾までこの時間以内になったら下がり始める(ms・叩き台=1回の下がりの短い方より少し長い)。 */
export const KENKI_RETREAT_BULLET_LEAD_MS = 350;
/** 予測した当たりの後も、これだけ余分に下がり続ける(ms・読みの誤差の分)。 */
export const KENKI_RETREAT_COVER_MS = 100;
/**
 * 下がっている最中に別の弾が来た時、下がりを延ばして受けてよい上限(下がり始めからの長さ・ms・叩き台)。
 * これを超える弾は下がりでは受けない(構えで返す・ステップで避ける へ回す)=撃たれ続けても下がり続けない(亀にしない)。
 */
export const KENKI_RETREAT_HOLD_MAX_MS = 800;

/** 頭脳の持ち越し(PhantomBrawlerMind の一部)。 */
export interface KenkiRetreatMind {
  /** 下がっている締め切り(gameTime)。この時刻まで下がる向きへ歩き、攻めない。 */
  retreatUntil: number;
  /** 次に下がってよい時刻(gameTime)。 */
  retreatReadyAt: number;
  /** 下がる向き(長さ1)。null=プレイヤーから離れる向き(毎 tick 取り直す)。弾の時は弾の飛んできた向き(固定)。 */
  retreatDir: { x: number; y: number } | null;
  /** 下がるかを振った、予測の当たりの時刻(同じ予測で2回振らない)。 */
  retreatRolledFor: number;
  /** いまの下がりを始めた時刻(gameTime)。延ばせる上限(KENKI_RETREAT_HOLD_MAX_MS)の起点。 */
  retreatFrom: number;
}
export const createKenkiRetreatMind = (): KenkiRetreatMind => ({ retreatUntil: 0, retreatReadyAt: 0, retreatDir: null, retreatRolledFor: -1, retreatFrom: 0 });

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * clamp01(k);

/** 下がっている最中か。 */
export const kenkiRetreating = (m: Pick<KenkiRetreatMind, 'retreatUntil'>, t: number): boolean => t < m.retreatUntil;
/** いま下がり始めてよいか(下がっていない・間隔が明けた)。 */
export const kenkiRetreatReady = (m: Pick<KenkiRetreatMind, 'retreatUntil' | 'retreatReadyAt'>, t: number): boolean =>
  !kenkiRetreating(m, t) && t >= m.retreatReadyAt;

/** 1回の下がりの長さ(r=0..1 の乱数)。 */
export const kenkiRetreatMs = (r: number): number => Math.round(lerp(KENKI_RETREAT_MIN_MS, KENKI_RETREAT_MAX_MS, r));
/**
 * 近接の読みで下がる長さ。引いた長さが予測の当たり(dt ms 後)に届かなければ、当たりの少し後まで延ばす(上限は MAX)
 * =下がったのに当たる前に止まって食らう、を作らない。
 */
export const kenkiRetreatMsFor = (dtToStrike: number, r: number): number =>
  Math.min(KENKI_RETREAT_MAX_MS, Math.max(kenkiRetreatMs(r), Math.round(dtToStrike + KENKI_RETREAT_COVER_MS)));

/** 近接の読みで下がる確率(人格)。 */
export const kenkiRetreatMeleeChance = (counterChance: number): number =>
  lerp(KENKI_RETREAT_MELEE_P_MIN, KENKI_RETREAT_MELEE_P_MAX, counterChance);

/**
 * 予測した当たり(dt ms 後)は、下がってガードで受けられる所か。
 * 人の反応の下限より後・1回の下がりの長い方より前(=下がっている間に当たりが来る)。
 */
export const kenkiRetreatMeleeWindow = (dtToStrike: number): boolean =>
  dtToStrike >= HUMAN_REACTION_MS && dtToStrike <= KENKI_RETREAT_MAX_MS;

/**
 * 近接の読みで下がるか(1回の判断)。下がるなら長さ(ms)、下がらないなら null。
 *  - 間合いの内・待機・下がってよい(間隔が明けた)・予測の当たりが受けられる所・同じ予測でまだ振っていない、の時だけ乱数を引く。
 *  - rolledFor を書く(同じ予測で2回振らない)のは呼び手ではなくここ=判断と記録を1か所に。
 */
export const kenkiRetreatMeleeDecision = (
  m: KenkiRetreatMind,
  i: { t: number; idle: boolean; inRange: boolean; predictedAt: number | null; counterChance: number; rand: () => number },
): number | null => {
  if (!i.idle || !i.inRange || i.predictedAt === null || !kenkiRetreatReady(m, i.t)) return null;
  const dt = i.predictedAt - i.t;
  if (!kenkiRetreatMeleeWindow(dt) || m.retreatRolledFor === i.predictedAt) return null;
  m.retreatRolledFor = i.predictedAt;
  if (!(i.rand() < kenkiRetreatMeleeChance(i.counterChance))) return null;
  return kenkiRetreatMsFor(dt, i.rand());
};

/** 弾への対処を「下がってガード」にするか(弾ごとに1回・r=0..1 の乱数)。 */
export const kenkiBulletRetreatRoll = (r: number): boolean => r < KENKI_RETREAT_BULLET_P;
/** 弾: いま下がり始める時か(着弾まで eta ms)。 */
export const kenkiBulletRetreatDue = (etaMs: number | null): boolean => etaMs !== null && etaMs <= KENKI_RETREAT_BULLET_LEAD_MS;

/** 下がり始める(締め切り・次に下がってよい時刻・向きを書く)。dir=null はプレイヤーから離れる向き。 */
export const kenkiRetreatStart = (m: KenkiRetreatMind, t: number, ms: number, dir: { x: number; y: number } | null): void => {
  const dur = Math.max(0, ms);
  m.retreatFrom = t;
  m.retreatUntil = t + dur;
  m.retreatReadyAt = t + dur + KENKI_RETREAT_GAP_MS;
  const l = dir ? Math.hypot(dir.x, dir.y) : 0;
  m.retreatDir = dir && l > 1e-6 ? { x: dir.x / l, y: dir.y / l } : null;
};
/** 下がりを打ち切る(殴られて押された・固まった など)。次に下がってよい時刻は残す=打ち切った直後にまた下がらない。 */
export const kenkiRetreatStop = (m: KenkiRetreatMind): void => { m.retreatUntil = 0; m.retreatDir = null; };

/**
 * 下がっている最中に来た弾(着弾まで eta ms)を、下がりを続けて受けられるか。
 * いまの下がりの間に着く、または上限(下がり始めから KENKI_RETREAT_HOLD_MAX_MS)の内まで延ばせば着く。向きが合うかは呼び手が見る。
 */
export const kenkiRetreatCanCover = (m: Pick<KenkiRetreatMind, 'retreatUntil' | 'retreatFrom'>, t: number, etaMs: number | null): boolean =>
  etaMs !== null && kenkiRetreating(m, t)
  && (t + etaMs < m.retreatUntil || t + etaMs + KENKI_RETREAT_COVER_MS <= m.retreatFrom + KENKI_RETREAT_HOLD_MAX_MS);
/** 下がりを、その弾の着弾の少し後まで延ばす(上限の内だけ)。次に下がってよい時刻も後ろへずらす。下がっていなければ何もしない。 */
export const kenkiRetreatExtend = (m: KenkiRetreatMind, t: number, etaMs: number): void => {
  if (!kenkiRetreating(m, t)) return;
  const want = Math.min(t + Math.max(0, etaMs) + KENKI_RETREAT_COVER_MS, m.retreatFrom + KENKI_RETREAT_HOLD_MAX_MS);
  if (want > m.retreatUntil) { m.retreatUntil = want; m.retreatReadyAt = want + KENKI_RETREAT_GAP_MS; }
};
/**
 * 「下がってガード」を選んだ弾で下がれない時(攻撃中・間隔の中・向きが合わない)に、他の手を引き直す(構えで返す/ステップで避ける)。
 * 割合は人格の「返す:避ける」の比。食らう(take)には引き直さない=何もせず食らう経路を作らない。
 */
export const kenkiBulletRepick = (rates: { counter: number; dodge: number }, r: number): 'counter' | 'dodge' => {
  const sum = Math.max(0, rates.counter) + Math.max(0, rates.dodge);
  return sum > 0 && r < Math.max(0, rates.counter) / sum ? 'counter' : 'dodge';
};

/** いまの下がる向き(長さ1)。向きが決まっていなければプレイヤーから離れる向き・重なっていれば右。 */
export const kenkiRetreatDirNow = (m: Pick<KenkiRetreatMind, 'retreatDir'>, cx: number, cy: number, pcx: number, pcy: number): { x: number; y: number } => {
  if (m.retreatDir) return m.retreatDir;
  const dx = cx - pcx, dy = cy - pcy, l = Math.hypot(dx, dy);
  return l > 1e-6 ? { x: dx / l, y: dy / l } : { x: 1, y: 0 };
};

/**
 * 拳鬼の「レバー」(=この tick に歩こうとしている向き・長さ1)。動作の最中(段・技・予備動作・ステップ・跳びかかり・秘奥義・
 * 押されている最中・様子見で止まっている)と、歩いていない時は null=レバーガードは張れない。
 */
export const kenkiLeverOf = (moveX: number, moveY: number, busy: boolean, minLen = 0.2): { x: number; y: number } | null => {
  if (busy) return null;
  const l = Math.hypot(moveX, moveY);
  return l >= minLen && Number.isFinite(l) ? { x: moveX / l, y: moveY / l } : null;
};
