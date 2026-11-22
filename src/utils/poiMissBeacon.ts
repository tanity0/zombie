// 診断用(社長実機・ステージ1「廃病院へカメラが寄ったのに地面しか映らない」1回きりの報告)。
//
// アテンションが寄り切って止まっている間(hold)に、注目点の近くにある POI(廃病院・二人組・武器庫・
// 警察署・祠・隠しPOI)が描かれていなければ、描かなかった理由を左下のビーコン(Game.tsx の ErrBeacon)へ1行出す。
// ★計測器であって挙動ではない: 判定・描画には一切触らない。描画側(pixiScene)が読んだ値を渡すだけ。
// ★store へは書かない(このモジュールの変数に置くだけ=errorBeacon と同じ作法)。

/** 注目点から足元までの距離がこれ以内の POI を対象にする(px・world)。 */
export const POI_MISS_NEAR_PX = 200;
/** 描いていても、最終の透明度がこれ未満なら「描かれていない」とみなす。 */
export const POI_MISS_ALPHA_EPS = 0.05;

/** 描画側が1つの POI について読んだ事実(sync* の条件と同じ順に並べる)。 */
export interface PoiDrawFacts {
  hasPos: boolean;
  indoor: boolean;
  /** 入手後の退場フェード(1=全力・0以下=消えた)。 */
  fade: number;
  hasTex: boolean;
  /** 地平線フェード(0以下=透明)。 */
  horizonAlpha: number;
  /** 画面(カリング余白込み)の外までの距離。0以下=画面内。null=この POI は画面判定をしない。 */
  distOutside: number | null;
  /** その POI の絵が今フレーム visible か。 */
  visible: boolean;
  /** visible の時の最終の透明度。 */
  alpha: number;
  /** 表示物が描画ツリーに繋がっているか。 */
  attached: boolean;
  /** 状態で描かない(例: 二人組が hidden)時の短い名。 */
  statusHidden?: string | null;
}

/** 描かれていない理由の短い文字列。描かれていれば null。条件の順は syncHospital と同じ。 */
export const poiMissReason = (f: PoiDrawFacts): string | null => {
  if (!f.hasPos) return 'noPos';
  if (f.indoor) return 'indoor';
  if (f.statusHidden) return `status=${f.statusHidden}`;
  if (f.fade <= 0) return 'fade';
  if (!f.hasTex) return 'noTex';
  if (f.horizonAlpha <= 0) return `horizon a=${f.horizonAlpha.toFixed(2)}`;
  if (f.distOutside !== null && f.distOutside > 0) return `offscreen d=${Math.round(f.distOutside)}`;
  if (!f.visible) return 'hidden?'; // 上の4条件はどれも当たらないのに見えていない(想定外)
  if (!f.attached) return 'detached';
  if (f.alpha < POI_MISS_ALPHA_EPS) return `alpha=${f.alpha.toFixed(2)}`;
  return null;
};

/** アテンションが寄り切って止まっている間(in の後〜out の前)か。 */
export const attentionInHold = (elapsedMs: number, inMs: number, holdMs: number, cutinMs = 0): boolean =>
  elapsedMs >= inMs && elapsedMs < inMs + holdMs + cutinMs;

export const isNearFocus = (px: number, py: number, fx: number, fy: number, r = POI_MISS_NEAR_PX): boolean =>
  Math.hypot(px - fx, py - fy) <= r;

const r0 = (v: number) => Math.round(v);

/** ビーコンの1行。 */
export const formatPoiMissLine = (
  name: string, reason: string,
  cam: { x: number; y: number }, view: { x: number; y: number } | null,
  focus: { x: number; y: number }, poi: { x: number; y: number },
): string =>
  `poi-miss ${name}: ${reason} cam(${r0(cam.x)},${r0(cam.y)})`
  + (view ? ` view(${r0(view.x)},${r0(view.y)})` : '')
  + ` focus(${r0(focus.x)},${r0(focus.y)}) poi(${r0(poi.x)},${r0(poi.y)})`;

/**
 * 1回のアテンションにつき、同じ POI の同じ理由は1回だけ通す門。
 * アテンションの識別(開始時刻など)が変わったら覚えた分を捨てる。
 */
export class PoiMissGate {
  private key: number | null = null;
  private seen = new Set<string>();
  shouldReport(attentionKey: number, name: string, reason: string): boolean {
    if (this.key !== attentionKey) { this.key = attentionKey; this.seen.clear(); }
    const k = `${name}|${reason}`;
    if (this.seen.has(k)) return false;
    this.seen.add(k);
    return true;
  }
}

// ---- 写す相手(敵)が映っていない時(社長実機・ステージ1の2周目「賞金首のアテンションが賞金首の映っていない所へ寄った」)。----
// アテンションに写す相手(attention.target)が付いている時、hold の間にその相手が画面に映っていなければ理由を1行出す。
// POI と同じく計測器であって挙動ではない(描画側が読んだ値を渡すだけ)。

/** 描画側が写す相手について読んだ事実。 */
export interface TargetDrawFacts {
  /** 盤上にいる(生きている)か。 */
  exists: boolean;
  /** 地平線フェード(0以下=透明)。 */
  horizonAlpha: number;
  /** 画面の外までの距離。0以下=画面内。 */
  distOutside: number;
  /** その敵の絵(体のスプライトと入れ物)が今フレーム visible で描画ツリーに繋がっているか。null=描画物が見つからない。 */
  visible: boolean | null;
  /** 最終の透明度。 */
  alpha: number;
}

/** 写す相手が画面に映っていない理由。映っていれば null。 */
export const targetMissReason = (f: TargetDrawFacts, alphaEps = POI_MISS_ALPHA_EPS): string | null => {
  if (!f.exists) return 'gone';
  if (f.distOutside > 0) return `offscreen d=${Math.round(f.distOutside)}`;
  if (f.horizonAlpha <= 0) return `horizon a=${f.horizonAlpha.toFixed(2)}`;
  if (f.visible === null) return 'noSprite';
  if (!f.visible) return 'hidden';
  if (f.alpha < alphaEps) return `alpha=${f.alpha.toFixed(2)}`;
  return null;
};

/** ビーコンの1行(写す相手)。 */
export const formatTargetMissLine = (
  name: string, reason: string,
  cam: { x: number; y: number }, view: { x: number; y: number } | null,
  focus: { x: number; y: number }, target: { x: number; y: number } | null,
): string =>
  `target-miss ${name}: ${reason} cam(${r0(cam.x)},${r0(cam.y)})`
  + (view ? ` view(${r0(view.x)},${r0(view.y)})` : '')
  + ` focus(${r0(focus.x)},${r0(focus.y)})`
  + (target ? ` enemy(${r0(target.x)},${r0(target.y)})` : '');

let lastLine: string | null = null;
/** 出した行を残す(最新の1行。ビーコンが1秒ごとに読む)。 */
export const reportPoiMiss = (line: string): void => { lastLine = line.slice(0, 200); };
/** ビーコン(Game.tsx の ErrBeacon)が読む。無ければ null。 */
export const lastPoiMissLine = (): string | null => lastLine;
/** テスト用。 */
export const resetPoiMiss = (): void => { lastLine = null; };
