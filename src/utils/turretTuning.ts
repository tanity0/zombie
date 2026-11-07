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
 * ★設置してから**次に設置できるようになる**までの時間(ms)。
 *
 * 社長報告 v0.25.3552「自動タレットさ、CDがズルしてるわ。設置からのCDになってる」の修正。
 *
 * **何が起きていたか**: CD(10秒)を**設置の瞬間から**数えていたため、CDが**タレットの寿命と並走**していた。
 * 設置コードは「同時設置は1個」なので、CDが明けた瞬間に**まだ生きているタレットを消して置き直す**。
 * 結果:
 *   - Lv1(寿命10秒): CD明けと寿命がちょうど一致 = **切れ目なく常設**。
 *   - Lv2(寿命13秒): 10秒で置き直されるので**残り3秒が毎回捨てられる**。
 *   - Lv3(寿命15秒): 同様に**5秒が毎回捨てられる**。
 *   ⇒ **どのLvでも実効は「10秒周期で常設」**。v0.25.3482で入れた**持続時間の階段が1秒も効いていなかった**
 *     (Lvを上げるほど捨てる時間が増えるだけ)。これが「ズル」の中身。
 *
 * **直し方**: CDは**タレットが消えてから**数える。`次に設置できる時刻 = 設置時刻 + 寿命 + CD`。
 * これで持続時間の階段がそのまま**稼働率の階段**になる:
 *   Lv1 = 10秒稼働 + 10秒待ち(20秒周期・稼働率50%)
 *   Lv2 = 13秒稼働 + 10秒待ち(23秒周期・稼働率57%)
 *   Lv3 = 15秒稼働 + 10秒待ち(25秒周期・稼働率60%)
 */
export const TURRET_COOLDOWN_MS = 10000;

/** 設置した瞬間に確定する「次に設置できる時刻」。**寿命が明けてからCDが始まる**。 */
export const turretNextReadyAt = (placedAt: number, level: number): number =>
  placedAt + (TURRET_DURATION_BY_LEVEL[Math.max(1, Math.min(3, level))] ?? TURRET_DURATION_BY_LEVEL[1])
    + TURRET_COOLDOWN_MS;

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
