/**
 * ★止めの間の押しの出だし(社長承認2026-11-14「敵の浮く動作がまだ少しぎごちない」の直し①)。
 *
 * 旧: 止め(hitStunUntil)の間は押しが0で、止めが明けた1フレームで横の速さが 0 → 満額×((止め+280)/280)² へ段差で跳んでいた
 *     (格闘4段目の打ち上げでは上りが全部真上になり、明けで横へ折れる L 字の軌道に見えた)。
 * 新: 止めの間もゆっくり押し始め(速さ 0 から2乗で立ち上がる)、止めの明けからさらに加速して(ease-out)、そのあと今と同じ直線で減衰する。
 *     ★押しの合計の距離は今と同じ(社長「移動距離は変えないで」)。判定・押しの期限は変えない(速さの出方だけ)。
 *       旧の距離は「止めの明けの後の最初のフレームから、右端の値で直線減衰を足した和」=フレームの位相で±数%ぶれる。
 *       その和(同じ刻みが続くとした時の値)をそのフレームの刻みと位相から求め、新しい形の合計がそれに一致するよう係数を掛ける
 *       (=同じ刻み・同じ位相なら旧と同じ距離。刻みが揃っていれば位相に依らず旧と一致する)。
 *
 * 純関数(描画・store に依存しない)。使うのは store の updateEnemies の押しの所だけ。
 */
export const KB_CREEP_BASE_MS = 280; // = gameStore の KNOCKBACK_DURATION(循環 import を避けて同じ値を持つ。テストで一致を固定)
/** 止めの明けの速さ(明けの後の山に対する割合)。止めの間はここまで 0 から2乗で上がる。 */
export const KB_CREEP_STOP_END_FRAC = 0.2;
/** 止めの明けから山まで加速する長さ(ms・ease-out)。 */
export const KB_CREEP_RAMP_MS = 70;

/** 形(係数を掛ける前)の速さ。elapsed=押しの頭からの ms・S=止め。止めの間 c·(t/S)²・明けの後 (1−x/280)·ramp(x)。 */
export const kbCreepShape = (elapsed: number, stopMs: number): number => {
  const c = KB_CREEP_STOP_END_FRAC, R = KB_CREEP_RAMP_MS, B = KB_CREEP_BASE_MS;
  const S = Math.max(0, stopMs);
  if (elapsed <= 0 || elapsed >= S + B) return 0;
  if (elapsed < S) { const t = elapsed / S; return c * t * t; }
  const x = elapsed - S;
  const ramp = x >= R ? 1 : (() => { const u = 1 - x / R; return c + (1 - c) * (1 - u * u); })();
  return Math.max(0, 1 - x / B) * ramp;
};

/** 形の積分(0 → elapsed・ms 単位)。kbCreepShape の閉じた式。 */
export const kbCreepShapeCum = (elapsed: number, stopMs: number): number => {
  const c = KB_CREEP_STOP_END_FRAC, R = KB_CREEP_RAMP_MS, B = KB_CREEP_BASE_MS;
  const S = Math.max(0, stopMs);
  const E = Math.max(0, Math.min(S + B, elapsed));
  if (E <= S) return S > 0 ? c * E * E * E / (3 * S * S) : 0;
  const x = E - S;
  let post: number;
  if (x >= R) {
    post = x - (x * x) / (2 * B) - (1 - c) * R * (1 / 3 - R / (12 * B));
  } else {
    const w1 = 1 - x / R, a3 = 1 - w1 * w1 * w1, a4 = 1 - w1 * w1 * w1 * w1;
    post = x - (x * x) / (2 * B) - (1 - c) * R * (a3 / 3 - (R / B) * (a3 / 3 - a4 / 4));
  }
  return c * S / 3 + post;
};

/** 旧の止めの後の補正 ((S+280)/280)²(= gameStore の kbStopBoost と同じ式)。 */
const legacyBoost = (stopMs: number): number => ((Math.max(0, stopMs) + KB_CREEP_BASE_MS) / KB_CREEP_BASE_MS) ** 2;

/**
 * 旧の押し(止めの間は 0・明けの後は補正×min(1, 残り/280) を右端の値で足す)の合計(ms 単位=距離÷速さ×1000)。
 * remaining=今の残り・frameMs=刻み(同じ刻みが続くとして、明けの後の最初のフレームの残り r0 を今の位相から求める)。
 */
export const kbStopLegacyFrameSum = (remaining: number, stopMs: number, frameMs: number): number => {
  const B = KB_CREEP_BASE_MS, dt = frameMs;
  const r0 = remaining + Math.floor((B - remaining) / dt + 1e-9) * dt; // 残り ≤ 280 になる最初の刻み
  if (!(r0 > 0)) return 0;
  const n = Math.ceil(r0 / dt - 1e-9); // 残り > 0 の刻みの数
  return legacyBoost(stopMs) / B * dt * (n * r0 - dt * n * (n - 1) / 2);
};

/**
 * 1フレームぶんの速さの掛け(store が knockbackV × これ × dt で動かす)。remaining=押しの期限までの残り(ms)・stopMs=押しの頭の止め・
 * frameMs=このフレームの長さ(dt×1000)。フレームの区間の形の積分の差 × 係数 ÷ frameMs。
 * 係数=旧の合計(kbStopLegacyFrameSum)÷ 新しい形を同じ刻みで足し切った量=同じ刻み・位相なら合計の距離は旧と同じ。
 * 止めの無い押し(stopMs<=0)は旧の直線減衰 min(1, 残り/280) そのまま。
 */
export const kbStopCreepFrameFactor = (remaining: number, stopMs: number, frameMs: number): number => {
  const B = KB_CREEP_BASE_MS;
  if (!(stopMs > 0) || !(frameMs > 0)) return Math.min(1, Math.max(0, remaining / B));
  if (remaining <= 1e-6) return 0; // 期限ちょうど(浮動小数の端数)は0=最後の刻みの数え方を旧と揃える
  const T = stopMs + B, dt = frameMs;
  const rLast = remaining - Math.ceil(remaining / dt - 1e-9) * dt + dt; // 残り > 0 の最後の刻み
  const reach = kbCreepShapeCum(T - rLast, stopMs);
  if (!(reach > 0)) return 0;
  const k = kbStopLegacyFrameSum(remaining, stopMs, dt) / reach;
  const eNow = T - remaining;
  return k * (kbCreepShapeCum(eNow, stopMs) - kbCreepShapeCum(eNow - dt, stopMs)) / dt;
};
