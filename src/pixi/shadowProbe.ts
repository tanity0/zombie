// 影のベンチ用プローブ(計測専用・ゲームの見え方には一切関与しない)。
//
// なぜ要るか(v0.25.2737・社長指示「まずはベンチマークをつくってテスト」):
// 影の作り替え(LIGHT_REWORK.md §3-9-B v7)は **1体1枚の `PerspectiveMesh`** を前提にしている。
// ところが **このプロジェクトはメッシュを1枚も描いたことがない**ので、
// 「メッシュ1枚がいくらか」が**まったくの未知数**のまま設計が乗っている。
// ここが高いと設計ごと作り直し(=台形をやめてスプライトの回転で近似する等)になるため、
// **実装する前にこの1点だけを測る**。
//
// ★測る場面は「強glowゼロの平常時」(v0.25.2737・監査指摘で計画を訂正):
// 旧投影影のコストは**爆発が生きている間だけ**の一過性だが、新方式のシルエットは
// **強glowが1個も無い通常プレイの全フレーム**で描かれる。つまり
// **ピークが下がっても、プレイ時間の大半を占める平常時に、これまで無かった常時コストが載る。**
// ⇒ ベンチの段は **glow=0** にして、**平常時の増分**を測るのが本命。
//
// 測るもの(3モードで分解する):
//   - `sprite`  : N枚を**プール済みスプライト**・**共有テクスチャ1枚**で描く
//                 (= 今の影の描き方。新計測の「プール済みスプライトは事実上ただ」の再現=対照群)
//   - `mesh`    : N枚を `PerspectiveMesh`・**共有テクスチャ1枚**で描く
//                 (対 sprite の差 = **メッシュにした事の代金**)
//   - `meshtex` : N枚を `PerspectiveMesh`・**1枚ずつ別テクスチャ**で描く
//                 (対 mesh の差 = **テクスチャバインドの代金**。本番はキャラごとに別テクスチャなので、
//                  「全部同じ焼きテクスチャ=1バッチ」で取った旧実測はそのまま持ち込めない=監査指摘)
//
// いずれも**毎フレーム4隅を書き換える**(本番も歩行コマ/skew/depthScale/支配光の振れで毎フレーム動く。
// 静止させて測ると頂点更新のコストを取りこぼす)。
//
// ★このモジュールはベンチが有効な時だけ動く。既定は count=0 = 何も描かない。
export type ShadowProbeMode = 'mesh' | 'sprite' | 'meshtex';

let probeCount = 0;
let probeMode: ShadowProbeMode = 'mesh';
let probeStretch = 0;

/**
 * ベンチ側から毎tick呼ぶ。count=0 で完全に停止(プールも破棄される)。
 * `stretch` は「爆発で影が伸びる」の再現:
 *   0 = 伸びない(平常時の段)
 *   1 = **決め打ちの脈動**(sin)。Σが 0〜GLOW_SUM_CAP(2.0) を往復 ⇒ 長さ最大2.8倍・向きも振れる。
 *       ★測れるのは **①塗る面積が2.8倍 ②4隅の振れ幅** まで(社長指摘 v0.25.2740)。
 *   2 = ★**本物の連動**(社長指摘 v0.25.2741「光と連動して伸び縮みしてないけど」)。
 *       **生きている強glowを毎フレーム集め、キャスター1体ごとに全部との距離・減衰・
 *       ベクトル合成を回して** 向きと Σ を出す(= 本番 `Ldom` と同じ計算)。
 *       90体×12個なら **1080回/フレーム**。**1 との差がこの連動計算の代金**。
 */
export const setShadowProbe = (count: number, mode: ShadowProbeMode, stretch = 0) => {
  probeCount = Math.max(0, count | 0);
  probeMode = mode;
  probeStretch = Math.max(0, stretch);
};

export const shadowProbeCount = (): number => probeCount;
export const shadowProbeMode = (): ShadowProbeMode => probeMode;
export const shadowProbeStretch = (): number => probeStretch;

// ★プローブの自己申告(社長指摘 v0.25.2744「これ伸び縮みしてる? 常に光ってるからそう見えるだけで
// 計れてるの?」)。**推測で「測れています」と言わない**ため、プローブ自身に実績を吐かせる。
// このプロジェクトの教訓「計測器を疑う」の適用。
export interface ShadowProbeTelemetry {
  frames: number;      // プローブが動いたフレーム数
  lights: number;      // 直近フレームで拾えた強glowの数(0なら連動を1回も計算していない)
  checks: number;      // 直近フレームの距離判定の回数(= 枚数 × 光源数)
  sigmaMin: number;    // Σw_g の最小 / 最大 / 平均。**min==max なら伸び縮みしていない**
  sigmaMax: number;
  sigmaSum: number;
  capped: number;      // Σが上限に張り付いた回数(全体に対する割合で読む)
  samples: number;     // sigma を数えた回数
  // ★1枚(index 0)だけを時間で追う。全体の min/max は**場所による差**も混ざるので、
  // 「時間で伸び縮みしているか」はこれを見ないと分からない(社長指摘 v0.25.2744 の核心)。
  oneMin: number;
  oneMax: number;
}
const telemetry: ShadowProbeTelemetry = {
  frames: 0, lights: 0, checks: 0,
  sigmaMin: Number.POSITIVE_INFINITY, sigmaMax: 0, sigmaSum: 0, capped: 0, samples: 0,
  oneMin: Number.POSITIVE_INFINITY, oneMax: 0,
};

export const resetShadowProbeTelemetry = () => {
  telemetry.frames = 0; telemetry.lights = 0; telemetry.checks = 0;
  telemetry.sigmaMin = Number.POSITIVE_INFINITY; telemetry.sigmaMax = 0;
  telemetry.sigmaSum = 0; telemetry.capped = 0; telemetry.samples = 0;
  telemetry.oneMin = Number.POSITIVE_INFINITY; telemetry.oneMax = 0;
};
export const noteShadowProbeFrame = (lights: number, checks: number) => {
  telemetry.frames++; telemetry.lights = lights; telemetry.checks = checks;
};
export const noteShadowProbeSigma = (sigma: number, atCap: boolean, isFirst = false) => {
  if (isFirst) {
    if (sigma < telemetry.oneMin) telemetry.oneMin = sigma;
    if (sigma > telemetry.oneMax) telemetry.oneMax = sigma;
  }
  if (sigma < telemetry.sigmaMin) telemetry.sigmaMin = sigma;
  if (sigma > telemetry.sigmaMax) telemetry.sigmaMax = sigma;
  telemetry.sigmaSum += sigma;
  if (atCap) telemetry.capped++;
  telemetry.samples++;
};
/** 段の結果に1行で焼き込む用。**条件が書かれていない計測結果は資料にならない**(CLAUDE.md)。 */
export const shadowProbeReport = (): string => {
  if (telemetry.frames === 0) return 'probe off';
  if (telemetry.samples === 0) return `probe f${telemetry.frames} lights${telemetry.lights} nolink`;
  const avg = telemetry.sigmaSum / telemetry.samples;
  const capPct = Math.round((telemetry.capped / telemetry.samples) * 100);
  const mul = (v: number) => (1 + 0.9 * v).toFixed(2);
  return `probe f${telemetry.frames} lights${telemetry.lights} chk${telemetry.checks}`
    + ` sig${telemetry.sigmaMin.toFixed(2)}-${telemetry.sigmaMax.toFixed(2)}(av${avg.toFixed(2)})`
    + ` len×${mul(telemetry.sigmaMin)}-${mul(telemetry.sigmaMax)} cap${capPct}%`
    // ★one = 1枚を時間で追った幅。**ここが動いていなければ「伸び縮みしていない」**。
    + ` one${(telemetry.oneMin === Number.POSITIVE_INFINITY ? 0 : telemetry.oneMin).toFixed(2)}-${telemetry.oneMax.toFixed(2)}`;
};
