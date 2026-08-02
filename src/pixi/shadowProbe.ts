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
 * `stretch` は「爆発で影が伸びる」の再現(社長指摘 v0.25.2740「これ影伸びてないけど」):
 *   0 = 伸びない(平常時の段)
 *   1 = 支配光の Σw_g が 0〜GLOW_SUM_CAP(2.0) を脈打つ
 *       ⇒ 長さ ×(1 + 0.9×Σ) = **最大2.8倍**、向きも大きく振れる
 * これを入れないと **①塗る面積が2.8倍 ②4隅の振れ幅** を取りこぼす。
 */
export const setShadowProbe = (count: number, mode: ShadowProbeMode, stretch = 0) => {
  probeCount = Math.max(0, count | 0);
  probeMode = mode;
  probeStretch = Math.max(0, stretch);
};

export const shadowProbeCount = (): number => probeCount;
export const shadowProbeMode = (): ShadowProbeMode => probeMode;
export const shadowProbeStretch = (): number => probeStretch;
