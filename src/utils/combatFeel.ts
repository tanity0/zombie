// 戦闘の手触り(社長指示2026-09-13「戦闘の快感をもっと強くしたい」→「では入れてみて」)。
// 3本の純関数テーブル: ①当たった敵だけ数フレーム止まる(ヒットストップの局所版)+重い敵ほど飛ばない
// ②連続撃破の段(3/5/10) ③銃の反動(カメラキック+薬莢)。
// 実装精度の規律4: 配線(damageEnemy/updateEnemies/knockbackEnemy/発射地点/pixiScene)から数値と判定を
// ここへ切り出してユニットテストする。描画・SE・カメラは読むだけ=判定/ダメージ/移動距離には触れない
// (①の「止まる」だけが移動に触れる=それが仕様)。
import type { EnemyType, WeaponCategory } from '../types/game';
import { isBossType, isPumpkinTier } from './enemyUtils';

// ---- ① 当たった敵の局所ストップ(区分テンプレ: 雑魚/強個体/ボス級) ----
// 雑魚=60ms(約4フレーム)・強個体(パンプキン/削岩型/伐採人)=40ms・ボス級/終端=0(=止めない。
// ボスは体勢値・KB耐性(evaluateBossStopDr)が既にあり、殴るたびに止まると技の予告が崩れる)。
export const HIT_STUN_MS_MOB = 60;
export const HIT_STUN_MS_STRONG = 40;
export const hitStunMsFor = (type: EnemyType): number => {
  if (isPumpkinTier(type)) return HIT_STUN_MS_STRONG;
  if (isBossType(type)) return 0;
  return HIT_STUN_MS_MOB;
};

// 重さ: ノックバック速度の倍率。雑魚=1(不変)・強個体=0.5(「重い敵ほど飛ばない」)・
// その他のボス級=1(DR側が既に耐性を持つ=ここでは触らない)。
export const KNOCKBACK_WEIGHT_STRONG = 0.5;
export const knockbackWeightFor = (type: EnemyType): number => (isPumpkinTier(type) ? KNOCKBACK_WEIGHT_STRONG : 1);

// ---- ② 連続撃破の段 ----
// 前のキルから KILL_CHAIN_WINDOW_MS 以内なら連鎖が続く。段は 3/5/10 体(数字は画面に出さない=
// 音の高さと画面端の赤みで伝える。10体でごく短いスロー)。
export const KILL_CHAIN_WINDOW_MS = 2500;
export const KILL_CHAIN_TIER_COUNTS = [3, 5, 10] as const;
export interface KillChainState { count: number; lastAt: number }
export const stepKillChain = (s: KillChainState, nowMs: number): KillChainState =>
  (nowMs - s.lastAt <= KILL_CHAIN_WINDOW_MS ? { count: s.count + 1, lastAt: nowMs } : { count: 1, lastAt: nowMs });
export const killChainTier = (count: number): 0 | 1 | 2 | 3 => {
  if (count >= KILL_CHAIN_TIER_COUNTS[2]) return 3;
  if (count >= KILL_CHAIN_TIER_COUNTS[1]) return 2;
  if (count >= KILL_CHAIN_TIER_COUNTS[0]) return 1;
  return 0;
};
// 撃破SE(zombie-1〜4)のピッチ倍率。段が上がるほど半音〜全音ずつ上がる(1.0/1.06/1.12/1.19≒+1/+2/+3半音)。
export const KILL_CHAIN_SFX_RATE = [1, 1.06, 1.12, 1.19] as const;
export const killChainSfxRate = (tier: number): number => KILL_CHAIN_SFX_RATE[Math.max(0, Math.min(3, tier))];
// 段が上がった瞬間の画面端の赤み(pixiScene がビネットの tint に乗せる)。段ごとに長さと濃さを変える。
export const KILL_CHAIN_EDGE_PULSE_MS = [0, 260, 340, 520] as const;
export const killChainEdgePulseMs = (tier: number): number => KILL_CHAIN_EDGE_PULSE_MS[Math.max(0, Math.min(3, tier))];
// 10体到達のスロー(短く・浅く。KILL演出のフル版=0.2×1秒級とは別物の「息を呑む一瞬」)。
export const KILL_CHAIN_SLOW_SCALE = 0.55;
export const KILL_CHAIN_SLOW_MS = 240;
export const KILL_CHAIN_SLOW_HOLD_MS = 60;

// ---- ③ 銃の反動 ----
// カメラキック: 撃った瞬間に射線の逆へ画面がわずかに蹴られ、ease-outで戻る(pixiScene・描画のみ)。
// 大きさは銃種で差をつける(均質にしない): ハンドガン小・ライフル中・ショットガン大。
// key の上書きは重い単発銃(レールガン/スナイパー系)用。
export interface RecoilSpec { kickPx: number; kickMs: number }
const RECOIL_BY_CATEGORY: Record<WeaponCategory, RecoilSpec> = {
  handgun: { kickPx: 2.5, kickMs: 100 },
  rifle: { kickPx: 3.2, kickMs: 110 },
  shotgun: { kickPx: 7, kickMs: 150 },
  glauncher: { kickPx: 5, kickMs: 140 },
  phill: { kickPx: 4, kickMs: 130 },
};
const RECOIL_BY_KEY: Record<string, RecoilSpec> = {
  railgun: { kickPx: 8, kickMs: 170 },
};
export const recoilSpecFor = (category: WeaponCategory, key?: string): RecoilSpec =>
  (key && RECOIL_BY_KEY[key]) ? RECOIL_BY_KEY[key] : RECOIL_BY_CATEGORY[category];
// キックのオフセット(px・射線の逆向きに掛ける大きさ)。t=残り/長さ(1→0)。
// 撃った瞬間が最大で、二次のease-out(最初速く戻り、終わりでゆっくり止まる)=慣性MUST。
export const recoilKickOffset = (kickPx: number, remainingMs: number, kickMs: number): number => {
  if (remainingMs <= 0 || kickMs <= 0) return 0;
  const t = Math.min(1, remainingMs / kickMs);
  return kickPx * t * t;
};

// 薬莢: 射線に対して右手側(top-downでは射線を時計回りに90°回した向き)へ、上向きの初速をつけて
// 放り出し、重力で落ちる(particle の gravity)。レールガン/PHILL/ランチャーは薬莢を出さない
// (実弾ではない/砲身式)。ショットガンは赤い散弾殻、他は真鍮色。
export interface CasingSpec { color: string; size: number; count: number }
export const casingSpecFor = (category: WeaponCategory, key?: string): CasingSpec | null => {
  if (key === 'railgun') return null;
  if (category === 'phill' || category === 'glauncher') return null;
  if (category === 'shotgun') return { color: '#b91c1c', size: 3, count: 1 };
  return { color: '#d4a03a', size: 2.2, count: 1 };
};
export const CASING_SIDE_SPEED = 70;   // 右手側へ(px/s)
export const CASING_UP_SPEED = 90;     // 画面上へ(px/s)=弧を描いて落ちる
export const CASING_BACK_SPEED = 25;   // 射線の逆へ少し
export const CASING_GRAVITY = 460;     // px/s²
export const CASING_DURATION_MS = 480;
// 射線(dx,dy: 単位ベクトル)から薬莢の初速を出す。rand は 0..1(散らし)。
export const casingVelocity = (dx: number, dy: number, rand: number): { vx: number; vy: number } => {
  const px = -dy, py = dx; // 右手側
  const side = CASING_SIDE_SPEED * (0.7 + rand * 0.6);
  return {
    vx: px * side - dx * CASING_BACK_SPEED,
    vy: py * side - dy * CASING_BACK_SPEED - CASING_UP_SPEED * (0.8 + rand * 0.4),
  };
};
