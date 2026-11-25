// ステージ7 グレンの変身の場面の空き地を作る(どの木・松明を消すかを選ぶ・world/glenClearing.ts の状態へ入れる)。
// 木・松明の生成(trees.ts / torches.ts)を読む側。glenClearing.ts は生成から読まれる側なので、選ぶ処理はこちらに分ける(循環を作らない)。
// RENDERER-AGNOSTIC: PixiJS を import しない。
import { treesInRegionRaw, treeArtRect, TREE_CELL, type TreeInstance } from './trees';
import { torchesInRegion, torchArtRect, TORCH_CELL, type TorchInstance } from './torches';
import { isObstacleDestroyed } from './destructibles';
import { TREE_ART_MAX, TORCH_ART_MAX } from './artRects';
import {
  glenClearHides, glenClearProtectRect, setGlenClearing, clearGlenClearing, GLEN_CLEAR_NEAR_K, GLEN_CLEAR_BACK,
} from './glenClearing';

/** グレンの足元の手前に掛かる木・松明を選ぶ(純関数・状態は変えない)。 */
export const pickGlenClearing = (footX: number, footY: number): { trees: TreeInstance[]; torches: TorchInstance[] } => {
  const p = glenClearProtectRect(footX, footY);
  // 手前の物の大きめにした絵が守る矩形に届き得る範囲(左右=絵の半幅、手前=絵の高さ)。木は区画の原点で引くので1区画ぶん広げる。
  const tw = TREE_ART_MAX.w * 1.25 * GLEN_CLEAR_NEAR_K, th = TREE_ART_MAX.h * 1.25 * GLEN_CLEAR_NEAR_K; // 1.25=木の個体の大きさの上限
  const trees = treesInRegionRaw(p.x - tw - TREE_CELL, footY - GLEN_CLEAR_BACK - TREE_CELL, p.x + p.width + tw, footY + th + TREE_CELL)
    .filter(t => !isObstacleDestroyed(t.key) && glenClearHides(treeArtRect(t), t.footX, t.footY, footX, footY));
  const mw = TORCH_ART_MAX.w * GLEN_CLEAR_NEAR_K, mh = TORCH_ART_MAX.h * GLEN_CLEAR_NEAR_K;
  // 松明は RELAX の追加確率込みで在り得る物まで選ぶ(後から増えて手前に出ない)。
  const torches = torchesInRegion(p.x - mw - TORCH_CELL, footY - GLEN_CLEAR_BACK - TORCH_CELL, p.x + p.width + mw, footY + mh + TORCH_CELL, 1)
    .filter(t => glenClearHides(torchArtRect(t), t.footX, t.footY, footX, footY));
  return { trees, torches };
};

/** 空き地を作る(咆哮の瞬間に useGameLoop が呼ぶ)。startedAtReal=場面の開始の実時間(消える物のフェードの起点)。 */
export const applyGlenClearing = (footX: number, footY: number, startedAtReal: number): { trees: number; torches: number } => {
  clearGlenClearing(); // 選ぶ時は前の空き地を見ない(松明の生成が空き地の欠番を引くため)
  const { trees, torches } = pickGlenClearing(footX, footY);
  setGlenClearing(trees, torches, startedAtReal);
  return { trees: trees.length, torches: torches.length };
};
