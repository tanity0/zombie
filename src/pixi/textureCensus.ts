/**
 * ★Texture オブジェクト(絵の切り出し)の生存数と、描画器が管理しているテクスチャの数(2026-11-28)。
 *
 * Chrome の計測で、出撃のたびに **Texture オブジェクトだけ** が約 +230 ずつ増えていた(元画像=TextureSource と GPU は一定)。
 * これが iPhone の Safari でも積み上がっているかを、落ちる直前の行(crashWatch の「前回最後」)で読むための計器。
 *
 * 数え方: Pixi 8 には Texture の生成を数える仕組みが無い(uid の採番表は外へ出ていない)。そこで
 * **生成の1点(コンストラクタが必ず1回通る `source` の初回代入)に数取りを1つ差し込み**、
 * 生成時に FinalizationRegistry へ載せて **GC で回収された時に引く**。
 * ⇒ `txo` = 生成 − 回収 =「JS のヒープ上でまだ生きている Texture」(ヒープスナップショットで数える物と同じ意味)。
 * 破棄(destroy)済みでも誰かが掴んでいれば生きている側に数える=掴み手の居る漏れがそのまま右肩上がりで出る。
 * 回収は GC が回った時にしか届かないので、数字は GC の間合いで多少揺れる(増え続けるかどうかを見る)。
 *
 * 負荷: 生成1回につき整数の加算1つと registry への登録1つ。読み出しは整数の引き算だけ。毎フレームの走査は無い。
 */
import { Texture, TexturePool, type Renderer } from 'pixi.js';

let installed = false;
let created = 0;
let collected = 0;
const registry: FinalizationRegistry<0> | null =
  typeof FinalizationRegistry !== 'undefined' ? new FinalizationRegistry<0>(() => { collected++; }) : null;

/** 起動時に1回(main.tsx)。以後に作られる Texture(RenderTexture 含む)を数える。 */
export const installTextureCensus = (): void => {
  if (installed) return;
  installed = true;
  try {
    const desc = Object.getOwnPropertyDescriptor(Texture.prototype, 'source');
    if (!desc || !desc.set || !desc.get) return;
    const origSet = desc.set;
    Object.defineProperty(Texture.prototype, 'source', {
      ...desc,
      set(this: { _source?: unknown }, value: unknown) {
        // コンストラクタの中の1回目だけ(_source がまだ無い)=生成1回につき1回。差し替えは数えない。
        if (this._source === undefined) {
          created++;
          registry?.register(this as object, 0);
        }
        origSet.call(this, value);
      },
    });
  } catch { /* 数えられないだけ(描画には触らない) */ }
};

/** JS 上で生きている Texture オブジェクトの数(数取りが入っていなければ -1)。 */
export const liveTextureObjects = (): number => (installed && registry ? created - collected : -1);

/**
 * 描画器が GPU 側で管理しているテクスチャ(TextureSource)の数。`renderer.texture.managedTextures`(Pixi 8・GL/WebGPU 共通)。
 * 描画器は出撃ごとに作り直すので、PixiStage が init 後に登録し、畳む時に外す。
 */
let renderer: Renderer | null = null;
export const setCensusRenderer = (r: Renderer): void => { renderer = r; };
/** 畳む描画器が今の登録先の時だけ外す(作り直しの順が前後しても新しい方を消さない)。 */
export const clearCensusRenderer = (r: Renderer | undefined): void => { if (renderer === r) renderer = null; };
/**
 * ★空き枠を数えない(2026-11-28)。Pixi 8.19 の管理表(GCManagedHash)は、テクスチャを捨てても枠を消さずに null を残し、
 * null が1万個たまるまで詰め直さない。`managedTextures`(=Object.values)はその null まで返すので、旧計器の mt は
 * **作って捨てた回数の累計**が混ざっていた(社長実機 v0.25.5917 の `mt6608` はほぼこの空き枠。ヘッドレスで並べると
 * 表の長さ 397 に対して生きているのは 268)。生きている物(null でない枠)だけを数える。
 */
export const countLiveSlots = (items: Readonly<Record<string, unknown>> | readonly unknown[]): number => {
  let n = 0;
  for (const v of Object.values(items)) if (v) n++;
  return n;
};
export const managedTextureCount = (): number => {
  // Canvas 描画器(?renderer=canvas の Pixi 版)には無い=-1。
  try {
    const ts = renderer?.texture as { _managedTextures?: { items?: Record<string, unknown> }; managedTextures?: readonly unknown[] } | undefined;
    if (!ts) return -1;
    if (ts._managedTextures?.items) return countLiveSlots(ts._managedTextures.items);
    return ts.managedTextures ? countLiveSlots(ts.managedTextures) : -1;
  } catch { return -1; }
};

/**
 * ★Pixi の作業用テクスチャ置き場(TexturePool)に溜まっている量(MB・2026-11-28)。フィルタ・マスクの作業用で、
 * 返されたテクスチャは二度と捨てられない=出撃中に寸法の種類が増えるほど積み上がる。tex / bake の数字には載らない。
 * 置き場は全描画器で共有の1つ。
 */
export const texturePoolMB = (): number => {
  try {
    const pool = (TexturePool as unknown as { _texturePool?: Record<string, readonly Texture[]> })._texturePool;
    if (!pool) return -1;
    let bytes = 0;
    for (const k in pool) for (const t of pool[k] ?? []) bytes += t.source.pixelWidth * t.source.pixelHeight * 4;
    return Math.round(bytes / 1048576);
  } catch { return -1; }
};

/** 「前回最後」/デバッグ行に足す短い項目。例: `txo1803 mt259 pool6`。 */
export const textureCensusText = (): string => `txo${liveTextureObjects()} mt${managedTextureCount()} pool${texturePoolMB()}`;
