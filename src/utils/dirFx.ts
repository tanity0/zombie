// PACING_PUZZLE.md §5.23 バッチM22 Group C(社長決定v0.25.1550): C1(方向性シェイク&スプレー)/
// C3(なぎ倒し「N HITS」)/ C4(スピードライン) の純粋な計算部分。レンダラ非依存=ヘッドレスで
// ユニットテスト可能(src/utils)。副作用(Math.random/Date.now/store書き込み/Pixi描画)は
// 呼び出し側(gameStore.ts / useGameLoop.ts / pixiScene.ts)に残す。

import type { VisualEffect } from '../types/game';

// ---- C1: 方向性シェイク&スプレー -------------------------------------------

// dx,dyを単位ベクトルへ正規化。長さがほぼ0(発生源=対象と同座標など)なら {0,0} を返す
// (呼び出し側で「方向なし=従来の等方演出にフォールバック」と判定させるための番兵値)。
export const normalizeDir = (dx: number, dy: number): { x: number; y: number } => {
  const len = Math.hypot(dx, dy);
  if (len < 0.0001) return { x: 0, y: 0 };
  return { x: dx / len, y: dy / len };
};

// 方向シェイクの直交成分(横ブレ)は、沿う方向の成分より弱める(完全に一直線だと不自然なので少し残す)。
export const SHAKE_DIR_PERP_SCALE = 0.35;

// 等方(従来)の画面シェイクは sx=(rand*2-1)*mag / sy=(rand*2-1)*mag という独立乱数だった。
// 方向性シェイクは同じ振幅予算(mag)を「方向成分(along)」+「直交成分(perp・弱め)」に配分し直すだけで、
// 新しい描画方式は増やさない。alongRand/perpRandは呼び出し側が渡す [-1,1] の乱数サンプル
// (このモジュールはpureなのでMath.randomを持たない=ユニットテスト可能)。dirX/dirYは正規化済み前提。
export const biasedShakeOffset = (
  mag: number, dirX: number, dirY: number, alongRand: number, perpRand: number,
): { x: number; y: number } => {
  const px = -dirY, py = dirX; // 90°回転=dirに直交する単位ベクトル
  const along = alongRand * mag;
  const perp = perpRand * mag * SHAKE_DIR_PERP_SCALE;
  return { x: dirX * along + px * perp, y: dirY * along + py * perp };
};

// spawnSprayと同じ円錐角(±約30°)。spawnBurstを方向つきで呼ぶ時、この幅の扇形に絞る。
export const BURST_DIR_SPREAD = 1.05;

// 方向ありバースト1粒子分の射出角。rand01は呼び出し側が渡す [0,1) の乱数サンプル。
export const biasedBurstAngle = (dirX: number, dirY: number, rand01: number): number => {
  const base = Math.atan2(dirY, dirX);
  return base + (rand01 - 0.5) * BURST_DIR_SPREAD;
};

// ---- C3: なぎ倒し「N HITS」--------------------------------------------------

// 「複数」の閾値。既存 registerMultiHit のヘビーガンナーバフ条件(count<2で不発=2体以上を「複数」
// とする既存の社長合意済み基準)をそのまま流用し、新しいバランス値を作らない。
export const MULTI_HIT_FX_MIN_COUNT = 2;

export const shouldShowMultiHitFx = (count: number): boolean => count >= MULTI_HIT_FX_MIN_COUNT;

// 同時キャップ=1(常に最新のみ)。「N HITS」はプレイヤー頭上の同じ位置に出るため、複数同時に
// 出しても重なって読めないだけ=キャップは「最新が常に勝つ」1本が実質的に正しい値。
export const dedupeMultiHitEffects = (effects: VisualEffect[]): VisualEffect[] =>
  effects.filter(e => e.kind !== 'multiHit');

// ---- C4: スピードライン -----------------------------------------------------

// ダッシュ(刀の一閃ダッシュ/ワイヤーアンカーの高速移動)またはカウンター成立直後の「残りms」。
// 3つとも独立イベントで、複数重なることは稀だが起きても max で1本のタイムラインに収める
// (シェイクのtriggerShake同様「重なったら長い方」の考え方)。0以下=非アクティブ。
export const speedLineRemainingMs = (
  now: number,
  katanaDashUntil: number,
  wireDashUntil: number,
  lastCounterSuccessTime: number,
  counterWindowMs: number,
): number => Math.max(
  katanaDashUntil - now,
  wireDashUntil - now,
  counterWindowMs - (now - lastCounterSuccessTime),
);

// 残り時間→アルファ。fadeMs以内に線形フェードアウト、それ以前は maxAlpha 一定
// (ダッシュ/カウンターとも寿命が150〜280msと短く、フェードインは省略=ポップインで十分)。
export const speedLineAlpha = (remainMs: number, fadeMs: number, maxAlpha: number): number => {
  if (remainMs <= 0) return 0;
  return Math.min(1, remainMs / Math.max(1, fadeMs)) * maxAlpha;
};
