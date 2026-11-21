// research/BRAWLER_PHANTOM.md §16-5・§16-7: 拳鬼の技の予備動作(拳鬼だけ・プレイヤーの格闘は変えない)。判定だけの純関数。
//
// 社長「このキャラだけ、気功打つ時は一瞬腕上げの絵で溜める/飛び蹴りの初段時は一瞬しゃがみの絵/大叩き潰しは一瞬腕上げの絵で溜める」
// →「さっきのタメはまじで一瞬にしてね」(長さは3つとも80ms)。
// 予備動作の間は動かず・技は出ていない(当たりも無い)。終わった瞬間に技が出る(値段もその時に払う)。
// 置き場は拳鬼の制御の状態(PhantomBrawlerRuntime.prep)。描画が読むのは Enemy.gpBrawlerPrep(どのコマ・向き)だけ。
import type { BrawlerTechKind, KenkiPrepTex } from './brawlerTypes';

/** 気功・大叩き潰しの腕上げ(`kenki-melee-swing`)の長さ(gameTime ms)。 */
export const KENKI_PREP_RAISE_MS = 80;
/** 初段の飛び蹴りのしゃがみ(`kenki-melee-ready`)の長さ(gameTime ms)。 */
export const KENKI_PREP_CROUCH_MS = 80;

/** 予備動作(制御の状態)。時刻は gameTime。 */
export interface KenkiPrep {
  kind: BrawlerTechKind;
  /** 飛び蹴りの何発目か(予備動作が付くのは1発目だけ)。 */
  kickN: number;
  tex: KenkiPrepTex;
  /** 始めた時刻と、技が出る時刻(固まり・凍結の間はこの時刻を後ろへずらす=時計が止まる)。 */
  at: number;
  until: number;
  /** 技を決めた時点で「取り消し」として出していたか(受付が予備動作の間に切れても、決めた時点の扱いで出す)。 */
  cancel: boolean;
  /** 向き(描画のミラー)。 */
  dirX: number;
}

/**
 * この技に予備動作が付くか。気功・大叩き潰し=腕上げ / 飛び蹴りの1発目(待機から・通常の段から取り消して出す最初の蹴り)=しゃがみ。
 * 蹴りから蹴りへつなぐ2発目以降と、構えには付かない。秘奥義の9連撃(起動後の自動の連撃)はこの関数を通らない。
 */
export const kenkiPrepFor = (kind: BrawlerTechKind, kickN: number): { tex: KenkiPrepTex; ms: number } | null => {
  if (kind === 'kiko' || kind === 'stomp') return { tex: 'swing', ms: KENKI_PREP_RAISE_MS };
  if (kind === 'kick' && kickN === 1) return { tex: 'ready', ms: KENKI_PREP_CROUCH_MS };
  return null;
};

/** 予備動作を始める。 */
export const kenkiPrepStart = (kind: BrawlerTechKind, kickN: number, t: number, cancel: boolean, dirX: number): KenkiPrep | null => {
  const f = kenkiPrepFor(kind, kickN);
  return f ? { kind, kickN, tex: f.tex, at: t, until: t + f.ms, cancel, dirX } : null;
};

/** 技が出る時刻か。 */
export const kenkiPrepDue = (p: KenkiPrep, t: number): boolean => t >= p.until;
