// B10 血の覚醒: 入った瞬間の「赤いオーラが弾ける」押し返し(社長指示2026-11-13「覚醒した時、プレイヤーから赤いオーラがパーン!と爆発する演出入れたい。軽い範囲で」
// +「押し返すだけ」)。**誰をどちらへ押すか**だけを決める純関数(store が書き・pixi は読むだけ)。
// ダメージ・気絶・浮きは無し。ボス級と終端(深奥チェイサーの死神)は押さない(区分=brawlerLiftClass。徘徊の死神は区分上は強個体=押す)。死体・何も当たらない個体は外す。
// 技の最中の敵も押す(社長裁定2026-11-13=攻撃中スーパーアーマーの例外。押し道具の knockbackEnemy とは違う)。
// 味方(守護霊・犬・軍人)は enemies に居ない=呼び手が渡さない。

import type { Enemy } from '../types/game';
import { brawlerLiftClass } from './brawlerCombo';
import { isCorpse, isUntouchable } from './enemyUtils';

/** 押し返しの半径(プレイヤー中心と敵中心・px)。叩き台(軽い範囲)。演出の輪はこれより大きくてよい(派手さの絵)。 */
export const BLOOD_AWAKEN_BURST_RADIUS = 140;

/** 押しの速さの倍率(=押す距離の倍率)。社長 2026-11-13「覚醒の吹き飛ばし、もっと浅くていい」。 */
export const BLOOD_AWAKEN_BURST_PUSH_MULT = 0.5;

export type BloodBurstTarget = Pick<Enemy,
  'id' | 'type' | 'reaperChaser' | 'x' | 'y' | 'width' | 'height' | 'colorTier' | 'corpseUntil' | 'bossState' | 'labBait' | 'wraithPhased'
  | 'aiPhase' | 'chaffMove' | 'biteAt' | 'stunUntil' | 'bossFullStunUntil'>;
// (aiPhase 等は今は読まない=技の最中も押す。呼び手の型の互換のため残す)

/**
 * 押す相手と速度。baseSpeed=近接の通常のノックバックの速さ(store の KNOCKBACK_SPEED)。
 * 強さは近接の通常のノックバックと同じ形=近いほど強い(baseSpeed × (0.5 + 0.5 × 近さ) × BLOOD_AWAKEN_BURST_PUSH_MULT)。
 * 中心が重なっている時は右へ押す(向きが決まらないため)。gameTime は今は使わない(技の最中も押す=社長裁定2026-11-13)。
 */
export const bloodBurstShoves = (
  enemies: readonly BloodBurstTarget[], pcx: number, pcy: number, _gameTime: number, baseSpeed: number,
): Map<string, { vx: number; vy: number }> => {
  const out = new Map<string, { vx: number; vy: number }>();
  for (const e of enemies) {
    if (isCorpse(e) || isUntouchable(e)) continue;
    const cls = brawlerLiftClass(e); // 区分の1本(格闘・爆発の浮きと同じ)。null=終端の死神(深奥チェイサー)
    if (cls === null || cls === 'boss') continue;
    const dx = e.x + e.width / 2 - pcx, dy = e.y + e.height / 2 - pcy;
    const d = Math.hypot(dx, dy);
    if (d > BLOOD_AWAKEN_BURST_RADIUS) continue;
    const ux = d > 0.001 ? dx / d : 1, uy = d > 0.001 ? dy / d : 0;
    const sp = baseSpeed * (0.5 + 0.5 * (1 - d / BLOOD_AWAKEN_BURST_RADIUS)) * BLOOD_AWAKEN_BURST_PUSH_MULT;
    out.set(e.id, { vx: ux * sp, vy: uy * sp });
  }
  return out;
};
