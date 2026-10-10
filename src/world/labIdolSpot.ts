// idol(stage-2隠しボス)の配置(屋外ラボスキン版・社長指示で確定 v0.25.2382)。
//
// ステージ2の実体は gameStore.ts の `labDoc`(屋外ラボ廊下=横長スクロール。theme:'lab' かつ
// indoorMode:false)。ゴール資料(クリアアイテム)はプレイヤーのスタート地点(原点)から左右
// どちらかへランダムな距離(6000〜7800px)に置かれる。`labMap.ts` の屋内グリッド(indoorMode専用)
// は現行キャンペーンのどのステージからも到達しないコードパスなので使わない(v0.25.2381の実装ミス・
// PACING_PUZZLE.md ★未決事項7-1参照)。
//
// 社長指示「ゴール資料の真逆位置」= 原点(プレイヤーのスタート地点)を挟んだ反対の端。廊下は原点を
// 中心に左右へ伸びる1本道なので、資料の座標を原点に対して点対称にした位置がそのまま「反対方面の
// 最奥」になる(§6.28-0★の原文どおり)。向きはプレイヤー側(社長指示)=原点の方を向く。
//
// labDoc自体は乱数(side)を含むため、ここでは「資料の座標を受けて idol の座標/向きを返す」形の
// 純関数にしてテストする(乱数はここでは引かない=呼び出し側と2箇所で結果がズレない。
// world/hospital.ts の hospitalPos 等と同じ流儀)。renderer-agnostic(PixiJS非依存)。
import { nudgeToClearLabSpot } from './labWalls';

export interface LabDocLike { x: number; y: number }
export interface LabIdolSpot { x: number; y: number; facingLeft: boolean }

export const labIdolSpotForDoc = (doc: LabDocLike): LabIdolSpot => {
  const x = -doc.x;
  const y = -doc.y;
  // 原点(プレイヤーのスタート=idol が向くべき方向)は idol から見て -x 方向。
  // idol が原点より右(x>0)なら左向き、左(x<0)なら右向き。
  return { x, y, facingLeft: x > 0 };
};

// ★アイドルと遭遇する手前に金箱(社長指示2026-10-10「アイドルと遭遇する手前に…金箱にする」)。
// 原点(スタート)側へ LAB_IDOL_CHEST_GAP_PX 戻った所=アイドルが起きる距離(視界 180)より十分手前で拾ってから会える。
// 縦は帯の中、壁・プロップに重なれば隙間へ寄せる(ゴールと同じ nudgeToClearLabSpot)。
export const LAB_IDOL_CHEST_GAP_PX = 600;
export const labIdolChestSpot = (idol: LabIdolSpot): { x: number; y: number } => {
  const toward = idol.x > 0 ? -1 : 1; // 原点の向き
  return nudgeToClearLabSpot(idol.x + toward * LAB_IDOL_CHEST_GAP_PX, idol.y, 40, 40);
};
