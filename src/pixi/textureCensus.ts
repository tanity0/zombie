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
import { Texture, type Renderer } from 'pixi.js';

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
export const managedTextureCount = (): number => {
  // Canvas 描画器(?renderer=canvas の Pixi 版)には無い=-1。
  try {
    const ts = renderer?.texture as { managedTextures?: readonly unknown[] } | undefined;
    return ts?.managedTextures ? ts.managedTextures.length : -1;
  } catch { return -1; }
};

/** 「前回最後」/デバッグ行に足す短い項目。例: `txo1803 mt259`。 */
export const textureCensusText = (): string => `txo${liveTextureObjects()} mt${managedTextureCount()}`;
