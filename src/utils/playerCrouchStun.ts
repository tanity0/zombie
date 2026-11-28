// ★対人の体勢が崩れて動けない間、プレイヤーをしゃがませる(社長指示2026-11-12「孫悟空と戦ってて、
// たまに意味わからず立ち尽くすことがあるけど、硬直して動けないならプレイヤーをしゃがませて」)。
//
// 動けない窓そのもの(紫3秒・致命の後の2秒)は pvpPosture.ts の isPvpIncapacitated が正。ここはその窓の
// 「どの絵を出すか」と「体を上へ持ち上げる量(px)」を返すだけの純関数。描画(pixiScene.drawPlayer)は読むだけで、
// 判定・時間・入力の無視は一切変えない。
//
// しゃがみの絵(-ready)は足元=下端で焼いてあるので、体を下へは沈めない(足が地面に埋まる)。動きは全部「上へ」:
//   入り  : しゃがみの絵へ替わった瞬間、絵の高さの1割ほど上から始めて重力で落ちる(ease-in)→ 着地で小さく1px跳ねる
//   窓の間: 肩で息をする上下(最大1px・ゆっくり・不揃いの2周期)
//   予備  : 明けの約0.5秒前に小さく1回ぐっと持ち上がる
//   明け  : 立ち絵に替えてから、小さく持ち上げて下ろす(伸び上がり)。窓が明ける時刻にちょうど0
// 致命の後の2秒(posture>0 の窓)は紫の続き(致命は紫の最中にしか入らない)なので、入りの落下は無く息から始める。
// しゃがみの絵が無い装い(武将フル装備)は何もしない(絵も位置も替えない)。
import type { PvpPostureState } from '../types/game';
import { PVP_BREAK_MS, isPvpIncapacitated } from './pvpPosture';

/** 入りの落下の時間(ms)。重力=ease-in。 */
export const CROUCH_STUN_DROP_MS = 150;
/** 落ちる量=表示中の体の高さ(遠近込み)に対する割合。 */
export const CROUCH_STUN_DROP_FRAC = 0.1;
/** 着地の跳ね(ms・px)。 */
export const CROUCH_STUN_BOUNCE_MS = 110;
export const CROUCH_STUN_BOUNCE_PX = 1;
/** 肩で息をする上下(px・2周期ms)。 */
export const CROUCH_STUN_BREATH_PX = 1;
export const CROUCH_STUN_BREATH_A_MS = 1300;
export const CROUCH_STUN_BREATH_B_MS = 820;
/** 息の出入りのなじみ(ms)。 */
export const CROUCH_STUN_BREATH_FADE_MS = 200;
/** 予備動作: 明けの何ms前から何msかけて持ち上がるか・量(px)。 */
export const CROUCH_STUN_WINDUP_AT_MS = 520;
export const CROUCH_STUN_WINDUP_MS = 240;
export const CROUCH_STUN_WINDUP_PX = 3;
/** 明けの伸び上がり: 立ち絵に替わってからの時間(ms)と持ち上がる量(px)。 */
export const CROUCH_STUN_STANDUP_MS = 220;
export const CROUCH_STUN_STANDUP_PX = 3;

export interface CrouchStunPose {
  /** しゃがみの絵(-ready)を出すか。 */
  crouchTex: boolean;
  /** 体を上へ持ち上げる量(px・0以上=足が下端より下へ行くことは無い)。描画側は y から引く。 */
  liftPx: number;
}

const NONE: CrouchStunPose = { crouchTex: false, liftPx: 0 };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };

/**
 * 動けない間の絵と持ち上げ量。動ける時・しゃがみの絵が無い装いは {false, 0}。
 * @param bodyPx 表示中の体の高さ(px・遠近込み)。入りの落差に使う。
 * @param hasCrouchArt しゃがみの絵がある装いか(武将フル装備は false)。
 */
export const playerCrouchStunPose = (
  s: PvpPostureState | undefined, gameTime: number, bodyPx: number, hasCrouchArt: boolean,
): CrouchStunPose => {
  if (!hasCrouchArt || !s || s.breakUntil === undefined || !isPvpIncapacitated(s, gameTime)) return NONE;
  const left = s.breakUntil - gameTime; // 明けまでの残り(>0)
  // 明け: 立ち絵に替えて、持ち上げて下ろす(減速して頂点→加速して下りる)。
  if (left <= CROUCH_STUN_STANDUP_MS) {
    const u = 1 - left / CROUCH_STUN_STANDUP_MS;
    return { crouchTex: false, liftPx: CROUCH_STUN_STANDUP_PX * Math.sin(Math.PI * u) };
  }
  const fatalDaze = s.posture > 0;
  // 紫に入ってからの経過。窓が通常(3秒)より長く書かれている時(確認用に止めた等)は入り切った扱い。
  const since = fatalDaze || left > PVP_BREAK_MS ? Infinity : gameTime - (s.breakUntil - PVP_BREAK_MS);
  // 入り: 上から重力で落ちる(ease-in)。
  if (since < CROUCH_STUN_DROP_MS) {
    const u = clamp01(since / CROUCH_STUN_DROP_MS);
    return { crouchTex: true, liftPx: Math.max(0, bodyPx * CROUCH_STUN_DROP_FRAC) * (1 - u * u) };
  }
  let lift = 0;
  const sinceLand = since - CROUCH_STUN_DROP_MS;
  if (sinceLand < CROUCH_STUN_BOUNCE_MS) lift += CROUCH_STUN_BOUNCE_PX * Math.sin(Math.PI * (sinceLand / CROUCH_STUN_BOUNCE_MS));
  // 息: 跳ねの後から始め、予備動作の手前で消える。致命の後の窓は窓の頭(致命の時刻=lastChipAt)から。
  // 入り切った扱い(since=∞)で始まりが分からない時は gameTime を息の位相に使う。
  const tb = fatalDaze ? gameTime - (s.lastChipAt ?? gameTime)
    : Number.isFinite(sinceLand) ? sinceLand - CROUCH_STUN_BOUNCE_MS : gameTime;
  if (tb > 0) {
    const a = 0.5 - 0.5 * Math.cos((2 * Math.PI * tb) / CROUCH_STUN_BREATH_A_MS);
    const b = 0.5 - 0.5 * Math.cos((2 * Math.PI * tb) / CROUCH_STUN_BREATH_B_MS);
    const env = smooth(tb / CROUCH_STUN_BREATH_FADE_MS)
      * smooth((left - CROUCH_STUN_WINDUP_AT_MS) / CROUCH_STUN_BREATH_FADE_MS + 1);
    lift += CROUCH_STUN_BREATH_PX * (0.6 * a + 0.4 * b) * env;
  }
  // 予備動作: 明けの約0.5秒前に1回ぐっと持ち上がって戻る。
  const w = (CROUCH_STUN_WINDUP_AT_MS - left) / CROUCH_STUN_WINDUP_MS;
  if (w > 0 && w < 1) lift += CROUCH_STUN_WINDUP_PX * Math.sin(Math.PI * w) ** 2;
  return { crouchTex: true, liftPx: Math.max(0, lift) };
};
