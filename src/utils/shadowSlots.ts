// 影 v12(research/LIGHT_REWORK.md §3-9-C)の判定を、PixiJS非依存の純関数として1箇所に集める。
// CLAUDE.md 実装精度の規律4「配線ロジックは純関数に切り出してテスト」。
//
// ★v12 の考え方: **光1つ = シルエット1枚**。
// 旧実装(v9)は「支配光」を1つ選び、**1本の影を向きAから向きBへ動かして**いた。
// 1本の影を動かす限り**先端の角度が必ず掃く=回る**——社長の実機報告
// 「`?glowfade=0` だと確かに回らないけど即座に戻ってコレジャナイ」が、それを証明している
// (移動時間をゼロにしたから回転が消えていただけ)。
// ⇒ v12 は**切り替えをやめ、光ごとに別のシルエットを出す**。爆発の影は
// **伸びたまま α だけ薄くなって消える**ので、「戻る」動作そのものが存在しない。
//
// ★もう1つの根本原因: 旧実装は光の**明るさ(life)が影の長さ**まで動かしていた
// (`strength = falloff × life` を長さに使っていた)。⇒ 光が暗くなると影が縮む。
// v12 では **長さ・向きは光の"位置"だけ / 明るさは"濃さ"だけ**に効く。

/** 光がこの距離より近いと影の向きが暴れるので抑制する(レベルアップの足元glow対策)。 */
export const SHADOW_GLOW_MIN_DIST_PX = 24;
/** これより濃く見えている影は、新しい爆発が来ても追い出さない(=見えている影は1フレームで消えない)。 */
export const SHADOW_EVICT_ALPHA_MAX = 0.08;
/** 爆発の影が出ている時に環境光の影を洗い流す強さ。Σ=0.5 で環境光が消える。 */
export const SHADOW_AMB_WASH = 2.0;
/** 伸びの上限。旧 `SHADOW_GLOW_SUM_CAP` と同値=最大 1+0.9×2.0=2.8倍 で v9 と一致する(名前だけ変えた)。 */
export const SHADOW_GLOW_LEN_CAP = 2.0;
/** 参照していた光が候補一覧から消えた時(effects の400件上限で splice)の α フェード。幾何は凍結したまま。 */
export const SHADOW_EXPL_FADE_MS = 120;
/** 影メッシュの総数上限(実測値そのもの)。環境光ぶんを先に確保し、残り枠を爆発へ配る。 */
export const SHADOW_TOTAL_MESH_MAX = 90;
/** 枠の下位この割合はランクフェードする(切り落とすと明滅するため)。 */
export const SHADOW_RANK_FADE_FRAC = 0.2;
/** 1キャスターが持つ爆発シルエットのスロット数(#x0 / #x1)。 */
export const SHADOW_EXPL_SLOTS = 2;

/** 0..1 の smoothstep。a>=b なら x>=b で1、それ以外0(ゼロ幅でも NaN を出さない)。 */
export const smoothstep01 = (a: number, b: number, x: number): number => {
  if (!(b > a)) return x >= b ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * 光源からの距離 → 影の幾何に使う減衰(0..1)。**明るさ(life)は掛けない**。
 * 近すぎる光は `SHADOW_GLOW_MIN_DIST_PX` からその2倍までの smoothstep で立ち上げる。
 * ★二値判定にすると `dist=23→25` の1フレームで**逆向きの2.8倍の影に丸ごと入れ替わる**ので、必ずランプにする。
 */
export const glowFalloff = (dist: number, reach: number, minDistPx: number = SHADOW_GLOW_MIN_DIST_PX): number => {
  if (!(reach > 0)) return 0;
  const raw = 1 - dist / reach;
  if (!(raw > 0)) return 0;
  return raw * smoothstep01(minDistPx, minDistPx * 2, dist);
};

/**
 * 影の伸び倍率。**位置(falloff)だけで決まる**=光が暗くなっても影は縮まない。
 * @param weight  `SHADOW_GLOW_WEIGHT`(2.2)
 * @param stretch `SHADOW_GLOW_STRETCH`(0.9)
 */
export const glowLenMult = (
  falloff: number, weight: number, stretch: number, cap: number = SHADOW_GLOW_LEN_CAP,
): number => 1 + stretch * Math.min(Math.max(0, falloff) * weight, cap);

/** 濃さ・スロット争いに使う点数。**こちらには明るさ(life)が入る**(長さには入らない)。 */
export const glowScore = (falloff: number, life: number): number =>
  Math.max(0, falloff) * Math.max(0, Math.min(1, life));

/**
 * 爆発シルエットのα。
 *
 * ★v0.25.2800(社長「爆発でも伸びてないよ / 画面が暗くなるだけ」): 素の `base × falloff × life` は
 * **環境光を洗う量と釣り合わない**。実測(手榴弾相当の光・距離152px)で
 * `score=0.313` ⇒ 環境光 0.173 / 爆発 **0.144**(v9 は勝者1枚で **0.46**)=**約1/3の濃さ**になり、
 * **伸びた影が見えない**(社長には「伸びていない」ように見える)。
 * ⇒ **環境光から受け取った濃さをそのまま引き継ぐ**ように `wash` を掛けて 1 でクランプする。
 * これで `Σ=0.5`(=環境光が消えきる点=v9の勝者交代点)で **爆発シルエットが `base` に達し、v9の絵と一致する**。
 * 設計書 §3-9-C の「中距離でも実質1枚になり v9 の絵に寄る」という狙いは、この形で初めて成立する。
 */
export const explosionSilAlpha = (
  baseAlpha: number, falloff: number, life: number, wash: number = SHADOW_AMB_WASH,
): number => baseAlpha * Math.min(1, glowScore(falloff, life) * wash);

/**
 * 環境光シルエットのα。★Σ は**実際に描いている爆発シルエットのぶんだけ**を渡すこと。
 * 「圏内の全光」で数えると、混戦(強glow6個)で Σ=1.8 → 環境光0・各爆発影も薄く=**影がほぼ消える**。
 * 枠から溢れて描かれなかった光を数えると、**環境光だけ洗われて爆発影も出ない=影ゼロ**になる。
 * 描画とΣを一致させれば、この穴は構造的に閉じる。
 */
export const ambientSilAlpha = (baseAlpha: number, sigma: number, wash: number = SHADOW_AMB_WASH): number =>
  baseAlpha * Math.max(0, 1 - Math.min(1, Math.max(0, sigma)) * wash);

/** 1キャスターぶんの爆発スロットの現在値(判定に必要なものだけ)。 */
export interface ExplSlotView {
  /** 参照している光のID。null=空きスロット。 */
  lightId: string | null;
  /** その光の現在の `glowScore`(空きスロットは 0 を渡す)。 */
  score: number;
  /** **今フレーム画面に出ているα**。これが `SHADOW_EVICT_ALPHA_MAX` を超えていたら追い出さない。 */
  alpha: number;
}

export type SlotDecision =
  | { kind: 'keep'; slot: number }      // 既にそのスロットに居る(更新するだけ)
  | { kind: 'take'; slot: number }      // 空きスロットへ入る
  | { kind: 'evict'; slot: number }     // 見えていない弱い影を押し出して入る
  | { kind: 'reject' };                 // 入らない(この爆発の影は出ない=ポップは起きない)

/**
 * 爆発シルエットのスロット決め。★**追い出しは即時。ただし追い出してよいのは"見えていないもの"だけ**。
 *
 * - 既に同じ光がスロットに居るなら `keep`(向き・長さを毎フレーム更新する)。
 * - 空きがあれば `take`。
 * - 埋まっている時は**新参を含めて** score を比較し、
 *   ① **新参が最小なら `reject`**(遠方の弱い爆発が足元の濃い影を叩き出せないようにする)
 *   ② 追い出す相手の**現在αが `SHADOW_EVICT_ALPHA_MAX` を超えていたら `reject`**
 *      (見えている影は決して1フレームで消えない)
 *
 * ★`fading` 状態は作らない。v11案は「追い出したら fading」かつ「fading は再利用しない」で自己矛盾しており、
 * **両スロットが埋まった所へ強い爆発が来ると空きがどこにも無く、一番近い閃光でそのキャラの影が消える**
 * という、回転より目立つ事故になっていた。
 */
export const pickExplSlot = (
  slots: readonly ExplSlotView[],
  candidateId: string,
  candidateScore: number,
  evictAlphaMax: number = SHADOW_EVICT_ALPHA_MAX,
): SlotDecision => {
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].lightId === candidateId) return { kind: 'keep', slot: i };
  }
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].lightId === null) return { kind: 'take', slot: i };
  }
  if (slots.length === 0) return { kind: 'reject' };
  // 最弱スロットを探す(同点なら先頭側=若いスロットを選ぶ。決定的にするため)
  let weakest = 0;
  for (let i = 1; i < slots.length; i++) if (slots[i].score < slots[weakest].score) weakest = i;
  if (candidateScore <= slots[weakest].score) return { kind: 'reject' }; // ①新参が最小
  if (slots[weakest].alpha > evictAlphaMax) return { kind: 'reject' };   // ②まだ見えている
  return { kind: 'evict', slot: weakest };
};

/**
 * 総メッシュ数の枠に対するランクフェード係数(0..1)。
 * **切り落とすと明滅する**ので、枠の下位 `SHADOW_RANK_FADE_FRAC` は線形に 0 へ落とす。
 * @param rank   0始まりの順位(score の降順)
 * @param budget その種別に配れる枠の数
 */
export const rankFade = (rank: number, budget: number, fadeFrac: number = SHADOW_RANK_FADE_FRAC): number => {
  if (budget <= 0) return 0;
  if (rank < 0) return 1;
  if (rank >= budget) return 0;
  const solid = budget * (1 - Math.min(1, Math.max(0, fadeFrac)));
  if (rank < solid) return 1;
  const span = budget - solid;
  if (!(span > 0)) return 0;
  return Math.max(0, 1 - (rank - solid) / span);
};

/** 圏外へ出た光の幾何(凍結して以後これを使う)。★圏内へ戻っても解除しない=幾何が飛ばない。 */
export interface FrozenGeom {
  dirX: number; dirY: number; lenMult: number; falloff: number;
}

/**
 * 幾何を更新するか、凍結済みのものをそのまま使うかを決める。
 * - まだ凍結していなくて `dist <= reach` なら**毎フレーム再計算**
 *   (社長裁定「光源から見て物体が動いたなら動かす。自然の法則に従う」= **物体が動けば影は回る。これは仕様**)。
 * - `dist > reach` になった瞬間に凍結する。**以後その光が死ぬまで凍結のまま。**
 */
export const shouldFreezeGeom = (dist: number, reach: number, alreadyFrozen: boolean): boolean =>
  alreadyFrozen || !(dist <= reach);
