// 進軍NPC(軍人)の見た目の曲線(research/ESCORT_TARGETED.md §6・§7)。
// 純関数だけ(PixiJS/store を import しない)。時計は store の gameTime(ms)=EscortSoldier の
// downedAt/riseAt/lastHitAt/healedAt と同じ時計。描画(pixiScene.drawEscorts)は結果を読んで置くだけ。
//
// 使う手は「位置・影・透明度」だけ=歪み(伸縮・回転の代用モーション)は使わない(社長指示2026-09-22)。
// 全ての動きに加減速を入れる(慣性MUST)。数値は叩き台(実機で絞る)。
import type { EscortSoldier } from '../types/game';
import { ESCORT_DOWN_SLIDE_MS, ESCORT_FALL_IMPACT_FRAC, escortReviveProgress } from '../utils/escortHealth';

/** 倒れた姿で足元を沈める量の基準(曲線の単位・px)。実際に沈む量は下の ESCORT_SINK_FRAC で体の高さに比例させる。 */
export const ESCORT_SINK_PX = 7;
/**
 * 倒れた姿の沈み=表示中の体の高さに対する割合(社長裁定2026-10-07「腰まで沈めて座り込んだように」・設計書§13c-1)。
 * 着地の食い込み(×ESCORT_FALL_THUD_K)でも下端の切り取りの上限(コマ高の40%)を超えないよう 0.3。
 * pixiScene は sinkPx / ESCORT_SINK_PX × ESCORT_SINK_FRAC × 表示高 を沈みの量にする。倒れ絵が届いたら差し替える代用。
 */
export const ESCORT_SINK_FRAC = 0.3;
/** 起き上がりで行き過ぎる量(px・沈み量の約45%=体が少し浮いてから落ち着く。「小さくて見えない」は存在しないのと同じ=DC-1 #2)。 */
export const ESCORT_OVERSHOOT_PX = 3;
/** 倒れる動きの尺(store の倒れる滑り ESCORT_DOWN_SLIDE_MS と同じ。着地の砂埃・音もこの瞬間に出す)。 */
export const ESCORT_FALL_MS = ESCORT_DOWN_SLIDE_MS;
/** 倒れ込みの形: 前半は重力で加速して落ち(ease-in)、地面に着いた瞬間に沈み量の1.28倍まで食い込み(ドサッ)、ゆっくり落ち着く。 */
export const ESCORT_FALL_IMPACT_AT = ESCORT_FALL_IMPACT_FRAC;
export const ESCORT_FALL_THUD_K = 1.28;
/** 起き上がりの尺。起こされた=通常 / 自力=2倍でゆっくり(設計書§7)。 */
export const ESCORT_RISE_MS = 700;
export const ESCORT_RISE_SELF_MS = ESCORT_RISE_MS * 2;
/**
 * 倒れている間の「脈」の周期(ms)。頭上の点・画面端の印・体の呼吸(上下)が**同じ位相・同じ周期**で動く(一人の生き物の鼓動は一つ=DC-1 #14)。
 * 透明度では呼吸させない(この作品の透明=裏回りの透け/地平線フェード/霊体。半透明に明滅すると「消えかけ」に読める=DC-1 #4)。
 */
export const ESCORT_DOWN_PULSE_MS = 3600; // 社長裁定2026-10-07「点滅をゆっくり」(旧2400)=救助NPCの「助けて」より落ち着いた印
/** 呼吸の体の上下(px)。倒れた体が息で少しだけ浮いて戻る(位置だけ=歪みではない)。 */
export const ESCORT_BREATH_BOB_PX = 0.6; // 沈みを体の高さ比にした(§13c-1)ので基準単位で小さく=実寸で約2px
/** 倒れた姿の影: 地面に倒れた人の影は**広く・平たく・少し濃く**なる(縮むのは物理の逆=DC-1 #3)。 */
export const ESCORT_DOWN_SHADOW_WIDEN = 0.32;
export const ESCORT_DOWN_SHADOW_FLATTEN = 0.28;
export const ESCORT_DOWN_SHADOW_DARKEN = 0.25;
/** 被弾の白フラッシュ(従)。敵の被弾フラッシュと同じ強さ(弱いと色が倍になるだけで白くならない=DC-1 #5)。尺は短く絞る。 */
export const ESCORT_FLASH_MS = 120;
export const ESCORT_FLASH_ALPHA = 1;
/** 起き上がり後の無敵の間の点滅(store の ESCORT_REVIVE_INVULN_MS=2000ms と同じ長さ・周期は短く)。 */
export const ESCORT_BLINK_MS = 2000;
export const ESCORT_BLINK_PERIOD_MS = 200;
export const ESCORT_BLINK_MIN = 0.45;
/** 体力の線: 最後の被弾からこの間は出ていて、その後フェードして消える(半分以下は常設)。 */
export const ESCORT_BAR_SHOW_MS = 2600;
export const ESCORT_BAR_FADE_MS = 900;
/** 担当拠点の確保で全快した時は、線が満ちるのを見せてから消す。 */
export const ESCORT_BAR_HEAL_SHOW_MS = 1400;
/** 体力の線の常設ライン(最大体力に対する割合・以下は消えない)。 */
export const ESCORT_BAR_ALWAYS_RATIO = 0.5;

const easeOutSine = (t: number): number => Math.sin((Math.PI / 2) * t);
/** easeOutBack 系: 少し行き過ぎて落ち着く。c=4.5 で行き過ぎ量は約45%(沈み7pxの−3px=体が浮いてから落ち着く)。 */
const BACK_C = 4.5;
const easeOutBack = (t: number): number => {
  const u = t - 1;
  return 1 + (BACK_C + 1) * u * u * u + BACK_C * u * u;
};
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

type PoseFields = Pick<EscortSoldier, 'maxHealth' | 'downedAt' | 'riseAt' | 'riseKind'>;

/** 体力を持つ軍人か(M0の随行は持たない=見た目も従来どおり)。 */
const hasVitals = (e: Pick<EscortSoldier, 'maxHealth'>): boolean => (e.maxHealth ?? 0) > 0;

/**
 * 「倒れている度合い」。0=立っている / 1=倒れきった。倒れる着地の瞬間は1を超え(THUD)、起き上がりの行き過ぎは負の値(−0.45前後)になる。
 * 倒れる: ease-in(重力)→着地で食い込み→ease-out / 起き上がる: easeOutBack(戻って浮いてから落ち着く)。
 */
export const escortDownK = (e: PoseFields, now: number): number => {
  if (!hasVitals(e)) return 0;
  if (e.downedAt !== undefined) {
    // 倒れ込み: 重力で加速して落ち(ease-in)→着地で食い込み(THUD)→ease-out で落ち着く。0→THUD→1(最後は1で止まる)。
    const t = clamp01((now - e.downedAt) / ESCORT_FALL_MS);
    if (t < ESCORT_FALL_IMPACT_AT) { const u = t / ESCORT_FALL_IMPACT_AT; return ESCORT_FALL_THUD_K * u * u; }
    const u = (t - ESCORT_FALL_IMPACT_AT) / (1 - ESCORT_FALL_IMPACT_AT);
    return ESCORT_FALL_THUD_K + (1 - ESCORT_FALL_THUD_K) * easeOutSine(u);
  }
  if (e.riseAt !== undefined) {
    const dur = e.riseKind === 'self' ? ESCORT_RISE_SELF_MS : ESCORT_RISE_MS;
    const t = (now - e.riseAt) / dur;
    if (t >= 1 || t < 0) return 0;
    return 1 - easeOutBack(t);
  }
  return 0;
};

export interface EscortPose {
  /** 倒れている度合い(上記)。 */
  downK: number;
  /** 足元を沈める量(px・下向き正)。行き過ぎ中は負=少し浮く。 */
  sinkPx: number;
  /** 沈みの本体(0..1)。描画はこれだけを体の高さ比(ESCORT_SINK_FRAC)で掛ける(R2 A-3)。 */
  sinkBodyK: number;
  /** 沈みの上乗せ(基準px): 着地の食い込みの超過・起き上がりの行き過ぎ(負)・呼吸。描画は遠近だけ掛ける(体高比に乗せると跳ねが大きすぎる)。 */
  sinkExtraPx: number;
  /** 立ち絵の透明度に掛ける倍率(起き上がり後の無敵の点滅だけ。倒れている間は 1=透明度の呼吸はしない)。 */
  alphaMul: number;
  /** 影の幅に掛ける倍率(1=立っている時・倒れるほど広がる)。 */
  shadowW: number;
  /** 影の縦(長さ)に掛ける倍率(1=立っている時・倒れるほど平たくなる)。 */
  shadowLen: number;
  /** 影の濃さに掛ける倍率(1=立っている時・倒れるほど少し濃くなる)。 */
  shadowAlpha: number;
  /** 被弾の白フラッシュの強さ(0..ESCORT_FLASH_ALPHA)。 */
  flash: number;
}

export const escortPose = (e: Pick<EscortSoldier, 'maxHealth' | 'downedAt' | 'riseAt' | 'riseKind' | 'lastHitAt'>, now: number): EscortPose => {
  if (!hasVitals(e)) return { downK: 0, sinkPx: 0, sinkBodyK: 0, sinkExtraPx: 0, alphaMul: 1, shadowW: 1, shadowLen: 1, shadowAlpha: 1, flash: 0 };
  const downK = escortDownK(e, now);
  // 呼吸: 透明度ではなく体の上下(位置だけ)。倒れた瞬間は0から始まり、息で少し浮いて戻る(頭上の点・画面端の印と同じ周期と位相)。
  let breathPx = 0;
  let alphaMul = 1;
  if (e.downedAt !== undefined) {
    const breath = 0.5 - 0.5 * Math.cos(((now - e.downedAt) / ESCORT_DOWN_PULSE_MS) * Math.PI * 2); // 0→1→0(最初は0)
    breathPx = ESCORT_BREATH_BOB_PX * breath * clamp01(downK);
  } else if (e.riseAt !== undefined && now - e.riseAt >= 0 && now - e.riseAt < ESCORT_BLINK_MS) {
    // 起き上がり直後の無敵: 短い点滅。振れ幅は尺の終わりへ向けて小さくなる(パッと止めない)。
    const t = (now - e.riseAt) / ESCORT_BLINK_MS;
    const amp = (1 - ESCORT_BLINK_MIN) * (1 - t) * (1 - t);
    const ph = ((now - e.riseAt) / ESCORT_BLINK_PERIOD_MS) * Math.PI * 2;
    alphaMul = 1 - amp * (0.5 - 0.5 * Math.cos(ph));
  }
  const age = e.lastHitAt === undefined ? Infinity : now - e.lastHitAt;
  const flash = age >= 0 && age < ESCORT_FLASH_MS ? ESCORT_FLASH_ALPHA * (1 - age / ESCORT_FLASH_MS) * (1 - age / ESCORT_FLASH_MS) : 0;
  const dk = clamp01(downK);
  return {
    downK,
    sinkPx: ESCORT_SINK_PX * downK - breathPx,
    sinkBodyK: dk,
    sinkExtraPx: ESCORT_SINK_PX * (downK - dk) - breathPx,
    alphaMul,
    shadowW: 1 + ESCORT_DOWN_SHADOW_WIDEN * dk,
    shadowLen: 1 - ESCORT_DOWN_SHADOW_FLATTEN * dk,
    shadowAlpha: 1 + ESCORT_DOWN_SHADOW_DARKEN * dk,
    flash,
  };
};

/**
 * 体力の線の「出ていたい度合い」0..1(描画側はこれへなめらかに追従して実際の透明度にする)。
 * 倒れている間と、半分以下は常設。それ以外は被弾/全快/起き上がりの直後だけ出て、数秒でフェードして消える。
 */
export const escortBarWant = (
  e: Pick<EscortSoldier, 'maxHealth' | 'health' | 'downedAt' | 'lastHitAt' | 'healedAt' | 'healingAt' | 'riseAt'>, now: number,
): number => {
  if (!hasVitals(e)) return 0;
  if (e.downedAt !== undefined) return 1;
  const max = e.maxHealth ?? 0;
  // 「半分を切ったら」常設=ちょうど50%(起き上がりの体力)は常設に入れない(起きた全員が拠点を取るまで線を背負い続けない=DC-1 #7)。
  if ((e.health ?? max) < max * ESCORT_BAR_ALWAYS_RATIO) return 1;
  const fade = (ts: number | undefined, showMs: number): number => {
    if (ts === undefined) return 0;
    const age = now - ts;
    if (age < 0) return 0;
    if (age < showMs) return 1;
    return clamp01(1 - (age - showMs) / ESCORT_BAR_FADE_MS);
  };
  // healingAt=ついてくる間の回復で体力が増えている間は毎フレーム更新される=回復中は線が出たまま(満タンで healedAt に引き継ぐ)。
  return Math.max(fade(e.lastHitAt, ESCORT_BAR_SHOW_MS), fade(e.healedAt, ESCORT_BAR_HEAL_SHOW_MS), fade(e.healingAt, ESCORT_BAR_HEAL_SHOW_MS), fade(e.riseAt, ESCORT_BAR_SHOW_MS));
};

/**
 * 倒れている間の「脈」(薄紅・ゆっくり明滅 0.5↔1.0)。頭上の点と画面端の印の両方がこれ1本を読む(同じ位相・同じ周期=DC-1 #14)。
 * 時計は gameTime(ポーズ中は止まる)。ハンターの印(約1.4秒周期)よりゆっくり。
 */
export const escortDownDotAlpha = (downedAt: number, now: number): number => {
  const ph = ((now - downedAt) / ESCORT_DOWN_PULSE_MS) * Math.PI * 2;
  return 0.5 + 0.5 * (0.5 - 0.5 * Math.cos(ph));
};

/**
 * 起こす縁取りの灯りの目標(0..1)。半径に入っている=1(触れた瞬間に灯る)。離れている時は、進みが残っている間だけ残量ぶん薄く、
 * 進みが無ければ0(倒れた全員に常時白い縁が付かない=DC-1 #11)。描画は目標へなめらかに追従する。
 */
export const escortReviveLitTarget = (e: Pick<EscortSoldier, 'reviveNear' | 'reviveMs'>): number => {
  if (e.reviveNear) return 1;
  const p = escortReviveProgress(e);
  return p > 0.02 ? 0.12 + 0.3 * p : 0;
};
