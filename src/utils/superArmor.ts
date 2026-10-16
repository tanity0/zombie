// B12 スーパーアーマー(research/THEONE_ROUND2.md §4)。**判定は純関数1本**(store/combatTick/pixi が読む)。
//
// 「スーパーアーマー中の被弾は、ダメージは受けるが**ノックバック・しゃがみ(被弾硬直)・移動/銃のロック**を受けない」。
// 被弾無敵(敵ごと1秒)・ヒットストップ・被弾反撃の窓・画面シェイク・既存の被弾演出は従来どおり(=ここは「吹き飛びと硬直」だけを消す)。
//
// 入口は3つ(どれか1つでも立てばアーマー):
//  1. 血の覚醒中(B10・スキルが無くても)
//  2. スキル `super-armor`(Lv1 は 1発 8 以下 / Lv2 は 16 以下 / Lv3 は 24 以下)。実ダメージ=`skilled`
//     (ナイト/バーサーカー/ランナー覚醒/覚醒の被ダメ×2 を掛けた後・M0 の noDeath 切り詰めの**前**)
//  3. Lv3 かつ近接を振っている間(量を問わず)
// 蝙蝠の掴み(grabbedUntil)・対人体勢(pvpPosture)はアーマーで防がない(別の状態。呼び手がここを通さない)。
import { isBloodAwakening, type BloodFields } from './bloodAwaken';

/** Lv1〜3 の「これ以下なら吹き飛ばない」1発の実ダメージ(≤)。 */
export const SUPER_ARMOR_LIMIT_BY_LEVEL: readonly number[] = [0, 8, 16, 24];

/** 判定に読む Player の欄(テストでは必要な欄だけ渡せる)。 */
export interface SuperArmorPlayer extends BloodFields {
  skills?: readonly string[];
  skillLevels?: Partial<Record<string, number>>;
  /** 近接の前隙(Date.now)。0=無し。 */
  pendingSwingAt?: number;
  /** 近接スイングの起点(Date.now)。振り全体は swingMs。 */
  meleeSwingAt?: number;
  /** 刀の一閃(ダッシュ)の終わり(Date.now)。 */
  katanaDashUntil?: number;
  /** 縮地のワープ斬撃の最中。 */
  shukuchiStriking?: boolean;
  /** 縮地のワープ斬撃を解決する時刻(Date.now・0/未設定=待ちなし)。 */
  shukuchiStrikeAt?: number;
  /** 被弾反撃の着地(=命中)を解決する時刻(Date.now・0/未設定=待ちなし)。 */
  retaliateStrikeAt?: number;
}

/** スキル `super-armor` のレベル(未所持=0)。 */
export const superArmorSkillLevel = (p: SuperArmorPlayer): number =>
  p.skills?.includes('super-armor') ? (p.skillLevels?.['super-armor'] ?? 1) : 0;

/**
 * 近接を振っている最中か。前隙(pendingSwingAt)・振り全体(meleeSwingAt から swingMs)・刀の一閃(ダッシュ中)・
 * 縮地のワープ斬撃(待ち〜最中)・被弾反撃の飛び込み(着地待ち)を「振り」に含める。
 * meleeSwingAt はカウンター成立の演出(markMeleeSwingFx)でも打たれる——設計書の定義どおり「meleeSwingAt から swingMs」で見る。
 */
export const isPlayerMeleeSwinging = (p: SuperArmorPlayer, nowMs: number, swingMs: number): boolean => {
  if ((p.pendingSwingAt ?? 0) > 0) return true;
  const at = p.meleeSwingAt ?? 0;
  if (at > 0 && nowMs >= at && nowMs - at < swingMs) return true;
  if (nowMs < (p.katanaDashUntil ?? 0)) return true;
  if (p.shukuchiStriking === true || (p.shukuchiStrikeAt ?? 0) > 0) return true;
  if ((p.retaliateStrikeAt ?? 0) > 0) return true;
  return false;
};

/**
 * この被弾でスーパーアーマーが働くか。
 * @param skilledDmg  スキル倍率を掛けた後の実ダメージ(damagePlayer の `skilled`)
 * @param nowMs       Date.now 系(meleeSwingAt 等の時計)
 * @param gameTime    gameTime 系(覚醒の時計)
 * @param swingMs     近接の振り全体の長さ(store の PLAYER_MELEE_SWING_MS)
 */
export const playerSuperArmorActive = (
  p: SuperArmorPlayer, skilledDmg: number, nowMs: number, gameTime: number, swingMs: number,
): boolean => {
  if (isBloodAwakening(p, gameTime)) return true;
  const lv = superArmorSkillLevel(p);
  if (lv <= 0) return false;
  const limit = SUPER_ARMOR_LIMIT_BY_LEVEL[Math.min(3, lv)] ?? 0;
  if (skilledDmg <= limit) return true;
  return lv >= 3 && isPlayerMeleeSwinging(p, nowMs, swingMs);
};

// ---- 見せ方(描画専用・判定には使わない) ----
/** アーマーで吹き飛びを打ち消した後、被弾フラッシュが引くのを待ってから体が沈む(ms)。 */
export const SUPER_ARMOR_POSE_DELAY_MS = 200;
/** 沈み込みに入る時間(慣性・パッと潰れない)。 */
export const SUPER_ARMOR_SINK_MS = 50;
/** 踏ん張りから戻る時間(ease-out)。 */
export const SUPER_ARMOR_RECOVER_MS = 180;
/** 沈み込みの縦倍率の底。 */
export const SUPER_ARMOR_SQUASH_Y = 0.94;

/**
 * 踏ん張りの縦倍率(1=変化なし・底 0.94)。hurtArmoredAt から +200ms で沈み始め(50msで底へ ease-out)、
 * 180ms かけて ease-out で 1.0 へ戻る。範囲外は 1。
 */
export const superArmorSquashY = (sinceArmoredMs: number): number => {
  const t = sinceArmoredMs - SUPER_ARMOR_POSE_DELAY_MS;
  if (!(t >= 0)) return 1;
  const total = SUPER_ARMOR_SINK_MS + SUPER_ARMOR_RECOVER_MS;
  if (t >= total) return 1;
  const depth = 1 - SUPER_ARMOR_SQUASH_Y;
  if (t < SUPER_ARMOR_SINK_MS) {
    const k = t / SUPER_ARMOR_SINK_MS;
    return 1 - depth * (1 - (1 - k) * (1 - k));
  }
  const k = (t - SUPER_ARMOR_SINK_MS) / SUPER_ARMOR_RECOVER_MS;
  return SUPER_ARMOR_SQUASH_Y + depth * (1 - (1 - k) * (1 - k) * (1 - k));
};
