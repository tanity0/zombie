// research/MUTANT_HERO.md §4-2: 第三者(守護霊・英雄)へ当てる形。**依存ゼロの葉モジュール**。
// gameStore(巨大ハブ)がこの型を使うので、gameStore を読む heroBlast に置くと循環importになる(CI の循環チェックが止める)。
import { distToBandRect } from './geometry';
import { circleHitsFan } from './heroScript';

export type ThirdPartyShape =
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'capsule'; fx: number; fy: number; tx: number; ty: number; hw: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'fan'; cx: number; cy: number; angle: number; halfArc: number; radius: number }
  /** 既存の当たり判定の関数をそのまま使いたい時(多角形など)。hits(相手の中心x, y, 当たり半径)。fx/fy=被弾の向きの源。 */
  | { kind: 'test'; hits: (cx: number, cy: number, r: number) => boolean; fx: number; fy: number };

/** 円(中心・半径)の相手に形が触れるか。プレイヤー・守護霊・英雄・進軍NPC・敵で同じ式(heroBlast.shapeHitsCircle はこれの再輸出)。 */
export const shapeHitsCircle = (s: ThirdPartyShape, cx: number, cy: number, r: number): boolean => {
  if (s.kind === 'circle') return Math.hypot(cx - s.cx, cy - s.cy) <= s.r + r;
  if (s.kind === 'capsule') return distToBandRect({ x: cx, y: cy }, { x: s.fx, y: s.fy }, { x: s.tx, y: s.ty }, s.hw) <= r;
  if (s.kind === 'fan') return circleHitsFan(cx, cy, r, s.cx, s.cy, s.angle, s.halfArc, s.radius);
  if (s.kind === 'test') return s.hits(cx, cy, r);
  const nx = Math.max(s.x, Math.min(cx, s.x + s.w)), ny = Math.max(s.y, Math.min(cy, s.y + s.h));
  return Math.hypot(cx - nx, cy - ny) <= r;
};

/** 形の「発生源」の座標(被弾した相手が離れる向きの基準)。 */
export const shapeSource = (s: ThirdPartyShape): { x: number; y: number } =>
  s.kind === 'circle' ? { x: s.cx, y: s.cy }
  : s.kind === 'capsule' || s.kind === 'test' ? { x: s.fx, y: s.fy }
  : s.kind === 'fan' ? { x: s.cx, y: s.cy }
  : { x: s.x + s.w / 2, y: s.y + s.h / 2 };
