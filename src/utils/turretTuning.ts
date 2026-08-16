// 自動タレット(サブウェポン)のレベル差の**唯一の出どころ**(依存ゼロの葉)。
//
// 社長裁定の履歴:
//  - v0.25.3482「秒数を変えようかな。15秒+たまに爆発が3 / 13秒が2 / 10秒が1」= 持続時間の階段。
//  - v0.25.3512「自動タレットの発射間隔もレベルで下げたい。**いまの間隔をMAXとして、階段にしておいて**」
//    = 現行の発射間隔(前方130ms / 全方位420ms)を **Lv3(MAX)** とし、Lv1/Lv2 はそのぶん遅くする。
//
// ★なぜ useGameLoop から切り出したか: タレットのLv差の規則が「持続時間の表」「爆発弾のLv3ゲート」
// 「発射間隔の階段」の3箇所に散ると、片方だけ直した時に静かにズレる(このプロジェクトで何度も
// 起きている型の事故)。**Lvの判定式を1本にして**、3つとも同じ判定を見るようにする。

/** 設置時の持続時間(ms)。index=Lv(1..3)。0番はダミー。 */
export const TURRET_DURATION_BY_LEVEL: readonly number[] = [0, 10000, 13000, 15000];

/**
 * 発射間隔に掛ける倍率。index=Lv(1..3)。**Lv3=1.0=現行値(MAX)**で、下のLvほど大きい(=遅い)。
 * モードごとに別々の実数を置かず**倍率の表1つ**にしてある:
 * 前方集中(130ms)と全方位(420ms)の関係(約3.2倍)がLvによって崩れないため、かつ
 * 調整がこの1行で済むため。
 */
export const TURRET_FIRE_INTERVAL_MULT_BY_LEVEL: readonly number[] = [0, 1.5, 1.2, 1.0];

/**
 * 設置済みタレットのLv(1..3)。**設置時に焼いた持続時間から逆算する**。
 *
 * ★この作法の理由(v0.25.3482のコメントを継承): プレイヤーが後からLvを上げても、
 * **置いた時のタレットは置いた時の性能のまま**でいてほしい(途中で強くなると不自然)。
 * 持続時間は設置時に `projectile.duration` へ焼き込まれるので、これがそのままLvの記録になる。
 */
export const turretLevelFromDuration = (durationMs: number | undefined): number => {
  const d = durationMs ?? 0;
  if (d >= TURRET_DURATION_BY_LEVEL[3]) return 3;
  if (d >= TURRET_DURATION_BY_LEVEL[2]) return 2;
  return 1;
};

/**
 * 発射間隔(ms)。`baseMs` はモードごとの現行値(=Lv3の値)。
 *
 * ★範囲外のLvは**等倍(=現行値)**へ落とす。`?? 1` ではなく `> 0` で見ているのは、
 * 表の0番がダミーの `0` だから——`?? 1` だと `level=0` で **間隔0ms=無限連射**になる
 * (テストで実際に踏んだ)。`turretLevelFromDuration` は必ず1以上を返すので現状は到達しないが、
 * 呼び出し口が増えた時に静かに壊れる形は残さない。
 */
export const turretFireIntervalMs = (baseMs: number, level: number): number => {
  const mult = TURRET_FIRE_INTERVAL_MULT_BY_LEVEL[level];
  return Math.round(baseMs * (typeof mult === 'number' && mult > 0 ? mult : 1));
};
