// 寄り道POI(PACING_PUZZLE.md §6.24)の共通枠組み。
//
// 仕様(§6.24 で全項目確定):
// - 4方角=4枠(POI_SECTORS)。裏ボス方面(9000・ステージ固定・動かさない)以外の3セクターへ、
//   廃病院(6250)/武器庫(4000)/警察署(3500・v0.25.3172でデンジャー帯へ)を**毎ランランダムに1つずつ**割り当てる。
// - 3種とも毎ラン必ず出る(抽選しない)。ランダムなのは「どのセクターに出るか」だけ。
// - 距離は種類ごとに固定(乱数なのは方角=セクターだけ)。区域境界=ゲートと構造的に衝突しない値を選ぶ。
//
// この層は renderer-agnostic(PixiJS非依存)。座標/割り当ての純粋関数だけを置く。
// 病院(world/hospital.ts)・武器庫(world/armory.ts)・警察署(world/police.ts)は、
// ここの位置計算だけを共有し、各々の当たり判定/滞在判定/アリーナ判定は個別に持つ
// (循環import回避: ここは pois.ts に依存するが、pois.ts はここに依存しない)。
import { AREA_THRESHOLDS } from '../utils/enemyUtils';
import { POI_SECTORS } from './pois';

export type DetourKind = 'police' | 'armory' | 'hospital';

// 距離。価値の並びが深さと一致する: 警察署 < 武器庫 < 病院。
//
// ★v0.25.3172(社長指示「警察署はデンジャーに寄せる」): 警察署だけ **2250(研究対象区域の中点)→
// 3500(デンジャーゾーンの手前寄り)** へ移した。理由は「拠点(BASE_SITE_RADIUS=3200)を解放すると
// その方角のPOIに矢印が出る」仕組みなので、**矢印が出た瞬間に来た道を戻らされる**のが体験として
// おかしかったこと(社長報告「poiの設置場所がデンジャーゾーンの中にない時がある」)。
// 帯の中の位置は「デンジャーゾーン(3000〜5000)を4等分した 25% / 50%」で置く=拠点のすぐ外に
// 警察署、その先に武器庫、と横に並ぶ。**廃病院(6250)は据え置き=社長裁定待ち**(初心者救済である
// ワクチンが未確認汚染エリアにあるのは妥当か、という論点が別途あるため)。
const DANGER_LO = AREA_THRESHOLDS[1];                 // 3000
const DANGER_SPAN = AREA_THRESHOLDS[2] - DANGER_LO;   // 2000
export const DETOUR_DIST: Record<DetourKind, number> = {
  police: DANGER_LO + DANGER_SPAN * 0.25,                  // = 3500(デンジャーゾーンの手前寄り)
  armory: (AREA_THRESHOLDS[1] + AREA_THRESHOLDS[2]) / 2,   // = 4000(デンジャーゾーンの中点)
  hospital: (AREA_THRESHOLDS[2] + AREA_THRESHOLDS[3]) / 2, // = 6250(未確認汚染エリアの中点)
};

// 病院と同じ「近づく→サークル→3秒滞在」の共通値(§6.24 A4)。武器庫も同じ値を使う
// (警察署はアリーナ方式なのでここは使わない)。
export const DETOUR_CIRCLE_RADIUS = 95;
export const DETOUR_DWELL_MS = 3000;

// セクターの中心角(rad)。拠点(createBaseSites)と同じ方角=セクター i は i*(360/POI_SECTORS)°。
// sectorIndexForAngle の逆変換に一致させること(セクター中心に置けば往復判定が一致する)。
const SECTOR_ANGLE_STEP = (Math.PI * 2) / POI_SECTORS;
export const sectorAngle = (sector: number): number => sector * SECTOR_ANGLE_STEP;

// セクター番号 → ワールド座標(kind の固定距離・セクター中心の角度)。
export const detourPosForSector = (kind: DetourKind, sector: number): { x: number; y: number } => {
  const a = sectorAngle(sector);
  const d = DETOUR_DIST[kind];
  return { x: Math.cos(a) * d, y: Math.sin(a) * d };
};

/**
 * 3種(police/armory/hospital)へ、裏ボスのセクター(bossSector。無ければ null)を除いた
 * 残りセクターをランダムに割り当てる。
 *
 * 不変条件(§6.24 発注メモ4):
 * - 3種+裏ボスが4セクターに1つずつ(重複なし・空きなし=裏ボスがある時)。
 * - 裏ボスのセクターには何も割り当てない(動かさない・矢印が1拠点に集中しない)。
 * - 3種とも必ず割り当てる(抽選しない=ランダムなのは位置だけ)。
 *
 * `rand` は注入可能な乱数源(既定 Math.random)。テストは決定的なシーケンスを渡して検証する。
 */
export const assignDetourSectors = (
  bossSector: number | null,
  rand: () => number = Math.random,
): Record<DetourKind, number> => {
  const pool: number[] = [];
  for (let i = 0; i < POI_SECTORS; i++) if (i !== bossSector) pool.push(i);
  // Fisher-Yates(注入した rand を使うので呼び出し側で決定的に固定できる)。
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  // pool は裏ボス有り=3要素・無し=4要素(先頭3つを使う)。
  const [police, armory, hospital] = pool;
  return { police, armory, hospital };
};

