// ★プレイヤーが空中の敵を殴る時、プレイヤーの絵も宙へ浮かせて敵の高さを追う(描画だけ・判定・移動・当たりの位置は1pxも変えない)。
// 社長指示2026-11-10「飛び蹴りとか、近接時、空中の敵攻撃する時追尾するプレイヤーも空中に浮かせたい」・research/BRAWLER.md §18。
// ここは高さの曲線(純関数)と「最後に空中の敵へ近接を当てた記録」だけ。store には書かない(記録はこのモジュールの1つの変数・当たりの瞬間にしか書かない)。
import { brawlerAirborne, brawlerJuggleHeightRel } from './brawlerCombo';

/** 浮く高さ = 当てた時点での敵の絵の浮いた高さ × この倍率(上限はプレイヤーの体の高さ)。 */
export const PLAYER_AIR_FOLLOW_K = 0.8;
/** 上がりの時定数(ms)。ease-out で 95% に届くのが約 3τ=135ms(指示の120〜160ms)。 */
export const PLAYER_AIR_RISE_TAU_MS = 45;
/** 最後の空中の当たりから、頂点付近で漂う時間(ms)。この間は敵の高さへ上へだけ追従し、下へは追わない。 */
export const PLAYER_AIR_HOVER_MS = 250;
/** 漂っている間のゆっくりした沈み(px/ms)。 */
export const PLAYER_AIR_HOVER_SINK = 0.012;
/** 落下の重力(px/ms²)。約40px の高さから約250msで着地する値。 */
export const PLAYER_AIR_GRAVITY = 0.0013;
/** 着地で沈む長さ(ms)と沈みの深さ(縦の縮み)。 */
export const PLAYER_AIR_LAND_MS = 170;
export const PLAYER_AIR_LAND_SQUASH = 0.14;
/** 1フレームの進めの上限(ms)。止まった後の復帰で飛ばないように。 */
export const PLAYER_AIR_MAX_DT_MS = 50;

export interface PlayerAirState { h: number; vy: number }

/** 目標の高さ(px)。enemyScalePx=その敵の浮く絵の高さの基準(1倍=何px)・rel=敵の高さの倍率・bodyH=プレイヤーの体の高さ(上限)。 */
export const playerAirTargetPx = (rel: number, enemyScalePx: number, bodyH: number): number =>
  Math.max(0, Math.min(Math.max(0, bodyH), PLAYER_AIR_FOLLOW_K * Math.max(0, rel) * Math.max(0, enemyScalePx)));

/**
 * 1フレーム進める。targetPx=敵の高さへの目標(null=最近の空中の当たりが無い)・sinceHitMs=最後の空中の当たりからの時間。
 *  追従(sinceHit ≤ HOVER): 目標が今より高ければ指数で寄る(ease-out・速度は滑らかに0へ)。低ければ追わず、ゆっくり沈みながら漂う。
 *  落下(HOVER を過ぎた): 重力で加速しながら落ちる。落下中に再び当たったら(sinceHit が小さくなる)、その高さから上がり直す(途切れない)。
 */
export const stepPlayerAir = (
  s: PlayerAirState, targetPx: number | null, sinceHitMs: number, dtMs: number,
): { state: PlayerAirState; landed: boolean } => {
  const dt = Math.max(0, Math.min(PLAYER_AIR_MAX_DT_MS, dtMs));
  let { h, vy } = s;
  const prevH = h;
  if (sinceHitMs <= PLAYER_AIR_HOVER_MS) {
    vy = 0;
    if (targetPx !== null && targetPx > h) h += (targetPx - h) * (1 - Math.exp(-dt / PLAYER_AIR_RISE_TAU_MS));
    else h = Math.max(0, h - PLAYER_AIR_HOVER_SINK * dt);
  } else {
    vy += PLAYER_AIR_GRAVITY * dt;
    h -= vy * dt;
  }
  if (h <= 0) { h = 0; vy = 0; }
  return { state: { h, vy }, landed: prevH > 0.5 && h <= 0 && sinceHitMs > PLAYER_AIR_HOVER_MS };
};

/** 着地の沈み(縦の倍率・1=変化なし)。着地の瞬間から速く沈み(ease-out)、ゆっくり戻る。sinceLandMs<0 や過ぎた後は 1。 */
export const playerAirLandSquashY = (sinceLandMs: number): number => {
  if (!(sinceLandMs >= 0) || sinceLandMs >= PLAYER_AIR_LAND_MS) return 1;
  const u = sinceLandMs / PLAYER_AIR_LAND_MS;
  return 1 - PLAYER_AIR_LAND_SQUASH * Math.sin(Math.PI * Math.pow(u, 0.6));
};

// ---- 最後に空中の敵へ近接を当てた記録 ----
export interface AirMeleeHit { at: number; enemyId: string; rel: number }
let lastAirMeleeHit: AirMeleeHit | null = null;
/** 近接(格闘の段・技・ナイフ・刀・鞭・気功の爆発)が敵に当たる瞬間に呼ぶ。浮いていなければ何もしない(銃は呼ばない)。 */
export const noteAirMeleeHit = (e: Parameters<typeof brawlerJuggleHeightRel>[0] & { id: string }, now: number): void => {
  if (!brawlerAirborne(e, now)) return;
  lastAirMeleeHit = { at: now, enemyId: e.id, rel: brawlerJuggleHeightRel(e, now) };
};
export const getLastAirMeleeHit = (): AirMeleeHit | null => lastAirMeleeHit;
export const resetAirMeleeHit = (): void => { lastAirMeleeHit = null; };
