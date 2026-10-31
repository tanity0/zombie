// 寄りズームの調停(視覚専用・純関数)。v0.25.2608・社長指示:
//
// > 守護霊とプレイヤーでズームを奪い合わないように、**早い者勝ちで演出中はその他塞いで**ほしい。
// > (たまに重なると引っ張り合ってるっぽい)
// > ただし、**アテンションの重要な告知系はキャンセルではなく遅延**させて表示。
//
// 旧実装(gameStore.triggerZoom)は重なりを「強い方/長い方を採用」して**混ぜて**いた。寄り先だけは
// 先勝ちで維持するが、倍率と長さは後から来た方に引き伸ばされるので、プレイヤーと守護霊が同時に
// 何かをすると**カーブが継ぎ足されて伸び縮みする**=社長の言う「引っ張り合ってる」絵になっていた。
//
// ここでは混ぜるのをやめ、**1本の演出が終わるまで次を始めない**。負けた側の扱いだけを2種類に分ける:
//  - `'fx'`(見せ場の寄り: カウンター/キルの衝撃) … **捨てる**。出そびれても情報は失われない。
//  - `'notice'`(告知: 死亡・スキル発動・入手) … **待たせる**。順番が来たら必ず出す。
//
// ゲーム判定(カメラ座標・当たり判定・射程)には一切影響しない=描画のみ(CLAUDE.md「Visual vs hitbox」)。

/** 寄りズームの種別。`notice` は「出さないと情報が消える」もの=遅延して必ず出す。 */
export type ZoomKind = 'fx' | 'notice';

/** 1件の寄りズーム要求(gameStore.triggerZoom の引数そのもの + 種別)。 */
export interface ZoomRequest {
  mag: number;
  durationMs: number;
  holdMs: number;
  /** 寄り先(世界座標)。未指定は画面中央のまま。 */
  targetX?: number;
  targetY?: number;
  kind: ZoomKind;
}

/** 調停の結果。呼び出し側(store)はこれに従うだけ。 */
export type ZoomDecision =
  /** 今すぐ開始する。 */
  | { action: 'start' }
  /** 早い者勝ちで負けた=捨てる(`fx` のみ)。 */
  | { action: 'drop' }
  /** 演出中なので待たせる(`notice` のみ)。順番が来たら開始する。 */
  | { action: 'queue' };

/**
 * 待たせておける告知の上限。実際に重なりうるのは「プレイヤーの死 + 守護霊の死 + 発動告知」程度なので
 * 3で足りる。溢れた分は捨てる(無限に積むと、とっくに文脈を失った寄りが延々と再生されるため)。
 * ※溢れは異常事態なので、起きたら設計を見直す合図。
 */
export const ZOOM_QUEUE_MAX = 3;

/**
 * 純関数: この要求を今どう扱うか。
 * @param kind      要求の種別
 * @param activeUntil 現在の寄りが終わる時刻(ms・過去なら演出中ではない)
 * @param now       現在時刻(ms)
 * @param queuedCount 既に待たせてある告知の数
 */
export const decideZoom = (
  kind: ZoomKind,
  activeUntil: number,
  now: number,
  queuedCount: number,
): ZoomDecision => {
  if (now >= activeUntil) return { action: 'start' }; // 誰も演出していない=先勝ちで開始
  if (kind === 'fx') return { action: 'drop' };       // 見せ場の寄りは譲る(捨てる)
  if (queuedCount >= ZOOM_QUEUE_MAX) return { action: 'drop' }; // 積み過ぎ(異常時の安全弁)
  return { action: 'queue' };                          // 告知は待たせて必ず出す
};

/**
 * 純関数: 待ち行列から「今始めてよい1件」を取り出す。演出中なら何も取り出さない(nullを返す)。
 * 戻り値の `rest` をそのまま次の待ち行列にする(元配列は変更しない)。
 */
export const dequeueZoom = (
  queue: readonly ZoomRequest[],
  activeUntil: number,
  now: number,
): { next: ZoomRequest | null; rest: readonly ZoomRequest[] } => {
  if (queue.length === 0 || now < activeUntil) return { next: null, rest: queue };
  return { next: queue[0], rest: queue.slice(1) };
};
