/**
 * 実機で「増え続けていないか」を見るためだけの小さな窓口(v0.25.4347)。
 *
 * 社長報告「**めっちゃゲーム中に落ちる**」。落ちる原因として一番ありがちなのは
 * **描画オブジェクトが解放されずに増え続ける**ことだが、スマホでは開発者ツールが無く、
 * 増えているのかどうかすら確認できない。だから**画面に出す**。
 * 書き込みは数値の代入1つ=毎フレーム呼んでも実質ゼロコスト(React も起こさない)。
 */
let effectSprites = 0;
let effectItems = 0;

export const setRenderStats = (sprites: number, items: number): void => {
  effectSprites = sprites;
  effectItems = items;
};

/**
 * ★居座りの犯人を名指しする補足(社長報告2026-09-25「なんかエフェクト残っちゃうバグがまだある」)。
 * ボスメーカー(敵はボス1体だけ)で `fx 154/154` が出ていた=**何かが溜まっている**のに、
 * 数字だけでは**何が**溜まっているか分からず、ヘッドレスでも再現できなかった。
 * ⇒ 溜まった時だけ「多い種類の上位」と「長く出続けている技の絵(latch)」を同じ行に足す。
 * 平時は空文字=表示は従来どおり。
 */
let fxDiag = '';
export const setFxDiag = (s: string): void => { fxDiag = s; };

/** 表示側(Game.tsx の ErrBeacon が1秒ごとに読む)。 */
export const renderStatsText = (): string => `fx ${effectItems}/${effectSprites}${fxDiag ? ` ${fxDiag}` : ''}`;

/**
 * ★焼いたテクスチャ(RenderTexture)の実測(v0.25.4375)。
 *
 * `textureMemoryMB()` は **読み込んだ素材(`textures` マップ)しか数えていない**。
 * 縁ライティング・投影影・白シルエットが**実行中に焼く** RenderTexture は、
 * 元素材と同じ寸法で GPU に載るのに、あの数字には1バイトも映らない。
 * ⇒ 焼いた分だけを別に数えて、落ちる直前の行へ出す。
 *
 * 数えるのは **実ピクセル(`pixelWidth`)**。`resolution` が1でない焼きがあると
 * 論理寸法では実量とズレるため(読み込み素材は resolution=1 なので `textureMemoryMB` 側と矛盾しない)。
 */
export type BakeKind = 'rim' | 'shadow' | 'silhouette' | 'other';
const BAKE_KINDS: BakeKind[] = ['rim', 'shadow', 'silhouette', 'other'];
const bakeMb: Record<BakeKind, number> = { rim: 0, shadow: 0, silhouette: 0, other: 0 };
const bakeN: Record<BakeKind, number> = { rim: 0, shadow: 0, silhouette: 0, other: 0 };

/** 焼いた時に足す / 捨てた時に `sign=-1` で引く。呼び手は pixiScene の `bakeRenderTexture` 1点。 */
export const addBakedTexture = (kind: BakeKind, pixels: number, sign: 1 | -1 = 1): void => {
  bakeMb[kind] += (sign * pixels * 4) / (1024 * 1024);
  bakeN[kind] += sign;
};

/** 表示側。合計MBと内訳(縁/影/白/他)と枚数。 */
export const bakedTextureText = (): string => {
  const mb = (k: BakeKind) => Math.round(bakeMb[k]);
  const total = Math.round(BAKE_KINDS.reduce((a, k) => a + bakeMb[k], 0));
  const n = BAKE_KINDS.reduce((a, k) => a + bakeN[k], 0);
  return `bake${total}MB(縁${mb('rim')}/影${mb('shadow')}/白${mb('silhouette')}/他${mb('other')})${n}枚`;
};

