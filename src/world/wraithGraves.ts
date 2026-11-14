// research/WRAITH_MUTANT.md §9: 亡霊の近くに生えた墓石の壁(足元の四角)。
// 生えた物の台帳は store(`wraithGrowths`)。伸び切った墓石の四角だけを、制御(utils/wraithGrowthTick)が毎フレームここへ写す。
// 当たりの連鎖(store の resolveOutOfSolids と敵の resolveMove)がここを読む=描画とは関係しない(PixiJS を import しない)。
import { resolveAabb, type Rect } from './obstacles';

let graveRects: Rect[] = [];

export const setWraithGraveRects = (rects: Rect[]): void => { graveRects = rects; };
export const wraithGraveRects = (): readonly Rect[] => graveRects;
export const clearWraithGraves = (): void => { graveRects = []; };

/** 墓石から押し出す(墓石が無ければそのまま=負荷ゼロ)。 */
export const resolveWraithGraveCollision = (rect: Rect): { x: number; y: number } =>
  graveRects.length === 0 ? { x: rect.x, y: rect.y } : resolveAabb(rect, graveRects);
