// research/MUTANT_HERO.md §4-2: 第三者(守護霊・英雄)へ当てる形。**依存ゼロの葉モジュール**。
// gameStore(巨大ハブ)がこの型を使うので、gameStore を読む heroBlast に置くと循環importになる(CI の循環チェックが止める)。
export type ThirdPartyShape =
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'capsule'; fx: number; fy: number; tx: number; ty: number; hw: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'fan'; cx: number; cy: number; angle: number; halfArc: number; radius: number }
  /** 既存の当たり判定の関数をそのまま使いたい時(多角形など)。hits(相手の中心x, y, 当たり半径)。fx/fy=被弾の向きの源。 */
  | { kind: 'test'; hits: (cx: number, cy: number, r: number) => boolean; fx: number; fy: number };
