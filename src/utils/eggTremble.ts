// ★産卵の震え(社長指示2026-09-22「**この人は攻撃が無いので、卵を産むときに震える感じにします**」)。
// 抱卵型(ghost・卵体)は攻撃を持たない代わりに、**卵を産む瞬間だけ体が痙攣する**。
// PixiJS非依存の純関数=ヘッドレスでテストできる(CLAUDE.md 実装精度の規律4)。
//
// ★**震えは「位置の揺れ」であって絵の歪みではない**(社長指示「絵が入った敵のパターンには
// 歪み入れないで」の対象外。跳ぶ高さ・上下の揺れと同じ扱い)。伸び縮みも回転もさせない。
// ★**卵そのものの出方・数・間隔・当たり判定は1ミリも変えない。** 見え方だけを足す。
//
// ★★形の決め方(クリエイティブ監査2026-09-22の指摘を反映):
//  ①**縦が主・横が従**。収縮は横へ振れない。内へ下へ縮む。
//  ②**連続した揺れではなく、独立した痙攣**。産卵へ近づくほど**間隔が詰まる**
//    (等間隔の連続波は「機械のバイブレーション」で、陣痛ではない)。
//  ③**放出の一発**。卵が出る瞬間に、沈んで**行き過ぎつきで跳ね戻る**ジャークを重ねる。
//  ④**3個の連射に起伏を付ける**。1個目は軽く、3個目が最も重い。連射の間は緊張を残し、
//    **3個目の後だけ長くゆっくり**鎮まる(続く3秒の静止が「回復」として読める)。

/** 卵が出る前、いきみ(痙攣)が走る長さ(ms)。 */
export const EGG_TREMBLE_LEAD_MS = 320;
/** 卵が出た後の余韻(ms)。連射の途中はこの長さ。 */
export const EGG_TREMBLE_TAIL_MS = 220;
/** ★バーストの最後の1個だけ、長くゆっくり鎮まる(ms)。 */
export const EGG_TREMBLE_LAST_TAIL_MS = 780;
/** 沈みの最大(px)。描画枠48px級に対して**はっきり見える**大きさ(監査#2: 2.6pxは端末で沈む)。 */
export const EGG_TREMBLE_PX = 7;
/** 横は縦の従属成分。収縮は横へ振れないので小さく。 */
export const EGG_TREMBLE_SIDE_FRAC = 0.32;
/** 連射の重さ。1個目は軽く、3個目が最も重い。 */
export const EGG_BURST_WEIGHT = [0.72, 0.86, 1] as const;
/** 連射の間に残す緊張(0で毎回ゼロに戻る=同じ形の3コピーになる)。 */
export const EGG_TREMBLE_FLOOR = 0.26;
/** 湧きの登場演出が終わるまでは震えない(監査#9: 現れきる前の痙攣を作らない)。 */
export const EGG_TREMBLE_SPAWN_GUARD_MS = 900;

/** いきみの痙攣が走る時刻(卵が出る何ms前か)。**間隔が 125 → 80 → 60 と詰まっていく。** */
const SPASM_BEFORE_MS = [300, 175, 95, 35] as const;
/** 痙攣1発の減衰(ms)。 */
const SPASM_DECAY_MS = 95;
/** 1発の痙攣: 立ち上がりは瞬間、その後は指数で抜ける(現実の筋の痙攣の形)。 */
const spasm = (sinceMs: number): number => {
  if (sinceMs < 0) return 0;
  const rise = Math.min(1, sinceMs / 14);          // 14msで立ち上がる=ほぼ瞬間
  return rise * Math.exp(-sinceMs / SPASM_DECAY_MS);
};

/**
 * 放出の一発。**沈む → 行き過ぎて跳ね上がる → 座る**。戻り値は「沈み」の向き(+が下)。
 * 卵が出た瞬間が最も深く、そこから跳ね返る=止まり方に慣性がある。
 */
const release = (sinceMs: number, durMs: number): number => {
  if (sinceMs < 0 || sinceMs >= durMs) return 0;
  const t = sinceMs / durMs;
  // 減衰する余弦。t=0 で +1(最も沈む)、途中で負(行き過ぎ=浮く)へ回り、鎮まる。
  return Math.cos(t * Math.PI * 1.6) * Math.exp(-t * 3.1);
};

export interface EggTremble {
  /** 横のずれ(px)。従属成分。 */
  x: number;
  /** ★**沈み**(px・+が下)。主成分。描画側は「下へ」の向きで足すこと。 */
  y: number;
}

export const EGG_TREMBLE_NONE: EggTremble = { x: 0, y: 0 };

/**
 * 産卵の震え。
 *
 * @param msUntilLay 次に卵が出るまでの残り(ms)。分からなければ `null`
 * @param msSinceLay 直前に卵が出てからの経過(ms)。まだ産んでいなければ `null`
 * @param burstIndex これから出る卵が連射の何個目か(0..2)
 * @param lastOfBurst 直前に出た卵が**連射の最後**だったか(余韻を長くする)
 * @param phaseSeed 個体ごとの位相(群れが同時に震えない)
 * @param px 沈みの最大(px)
 */
export const eggTrembleAt = (
  msUntilLay: number | null, msSinceLay: number | null,
  burstIndex: number, lastOfBurst: boolean, phaseSeed: number,
  px: number = EGG_TREMBLE_PX, leadMs: number = EGG_TREMBLE_LEAD_MS,
): EggTremble => {
  const w = EGG_BURST_WEIGHT[Math.max(0, Math.min(EGG_BURST_WEIGHT.length - 1, burstIndex))];
  const tailMs = lastOfBurst ? EGG_TREMBLE_LAST_TAIL_MS : EGG_TREMBLE_TAIL_MS;

  // ①いきみ: 産卵へ向けて間隔が詰まる痙攣。lead の外では走らない。
  let strain = 0;
  if (msUntilLay !== null && msUntilLay >= 0 && msUntilLay <= leadMs) {
    for (const b of SPASM_BEFORE_MS) {
      if (b <= leadMs) strain += spasm(b - msUntilLay) * (0.55 + 0.45 * (1 - b / leadMs));
    }
    // 連射の途中は緊張を持ち越す(監査#5: 毎回ゼロから立ち上がると同じ形の3コピーになる)。
    if (burstIndex > 0) strain = Math.max(strain, EGG_TREMBLE_FLOOR);
  }

  // ②放出の一発 + 余韻。
  let rel = 0;
  if (msSinceLay !== null && msSinceLay >= 0) {
    rel = release(msSinceLay, tailMs);
    if (msSinceLay < tailMs && !lastOfBurst) {
      // 連射の途中は、余韻が消え切る前に次のいきみへ繋がるよう床を残す。
      strain = Math.max(strain, EGG_TREMBLE_FLOOR * (1 - msSinceLay / tailMs));
    }
  }

  // ★いきみと放出は重なる。**足したまま**だと産卵の瞬間が px の1.5倍まで落ちるので、
  // 深さだけ天井で止める(形は保ったまま「これ以上は沈まない」)。浮き側は沈みの半分まで。
  const sink = Math.max(-0.45, Math.min(1, (strain * 0.62 + rel) * w));
  if (sink === 0) return EGG_TREMBLE_NONE;
  // ③横は従属。痙攣と同じ包絡を、**ゆっくりした**左右の振れに乗せる(高周波のブレを作らない)。
  const side = Math.sin(phaseSeed * 3.1 + (msSinceLay ?? -(msUntilLay ?? 0)) / 46);
  return { x: sink * px * EGG_TREMBLE_SIDE_FRAC * side, y: sink * px };
};
