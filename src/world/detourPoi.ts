// 寄り道POI(PACING_PUZZLE.md §6.24)の共通枠組み。
//
// 仕様(§6.24 で全項目確定):
// - 4方角=4枠(POI_SECTORS)。裏ボス方面(9000・ステージ固定・動かさない)以外の3セクターへ、
//   廃病院(4500)/武器庫(4000)/警察署(3500)を**毎ランランダムに1つずつ**割り当てる
//   (v0.25.3172/3173で3種ともデンジャーゾーンの中へ集約)。
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

// ★距離は**3種ともデンジャーゾーン(3000〜5000)の中**(社長決定v0.25.3172/3173)。
// 帯を4等分して 25% / 50% / 75% に置く=**拠点(3200)のすぐ外から、警察署→武器庫→廃病院と横に並ぶ**。
//
// なぜ帯に集めたか(旧: 2250/4000/6250=区域ごとに1つずつ・「深さ=価値」):
//  ① **矢印が出るのは拠点(BASE_SITE_RADIUS=3200)を解放した時**。警察署は 2250=拠点より内側にあり、
//     **矢印が出た瞬間に来た道を引き返す**動線だった(社長報告「デンジャーゾーンの中にない時がある」)。
//  ② **廃病院の報酬=ワクチン(死亡時に一度だけ復活)=初心者救済**なのに 6250(未確認汚染)にあった。
//     **深い場所に置いた救済は救済にならない**(そこへ行ける人はもう困っていない/困っている人は届かない)。
//     商人のワクチンは500スクラップで序盤には払えないため、旧配置では**初心者が現実的に手に入れられる
//     復活が1つも無かった**(社長裁定v0.25.3173「廃病院もデンジャーにしよう」)。
// 「深さ=価値」の並びは**帯の中の順**(3500 < 4000 < 4500)として残す。廃病院だけ帯の一番奥=
// **デンジャーの端まで押し込めば救済が取れる**(タダだが緊張は残す)。
const DANGER_LO = AREA_THRESHOLDS[1];                 // 3000
const DANGER_SPAN = AREA_THRESHOLDS[2] - DANGER_LO;   // 2000
export const DETOUR_DIST: Record<DetourKind, number> = {
  police: DANGER_LO + DANGER_SPAN * 0.25,   // = 3500(拠点のすぐ外)
  armory: DANGER_LO + DANGER_SPAN * 0.50,   // = 4000(帯の中点。旧値と同じ)
  hospital: DANGER_LO + DANGER_SPAN * 0.75, // = 4500(帯の一番奥)
};

// 病院と同じ「近づく→サークル→3秒滞在」の共通値(§6.24 A4)。武器庫も同じ値を使う
// (警察署はアリーナ方式なのでここは使わない)。
export const DETOUR_CIRCLE_RADIUS = 95;
export const DETOUR_DWELL_MS = 3000;

// §7-16(社長指示2026-08-15): 滞在サークルはPOIの当たり判定(footRect)と重ならない位置=
// 「目の前(手前側)」へ置く。この世界の「手前」は常に+Y(画面下=カメラ側。obstacles.ts の規約で
// footRect の下端=足元=常に pos.y なので、円の中心を pos.y からこの分だけ+Y側へずらせば、
// x位置やセクター角に関係なく円は必ず建物の下端より南=当たり判定の外に出る)。
// 病院/武器庫はこのDETOUR_CIRCLE_RADIUSを共有するのでここに一括定義する
// (警察署は別半径=POLICE_ARENA_RADIUSなのでpolice.tsに個別定義)。
export const DETOUR_CIRCLE_FRONT_GAP = 20; // 重なりゼロに足す余白(px)。0だと外接=見た目が窮屈なので少し離す。
export const DETOUR_CIRCLE_FRONT_OFFSET = DETOUR_CIRCLE_RADIUS + DETOUR_CIRCLE_FRONT_GAP; // = 115

// セクターの中心角(rad)。拠点(createBaseSites)と同じ方角=セクター i は i*(360/POI_SECTORS)°。
// sectorIndexForAngle の逆変換に一致させること(セクター中心に置けば往復判定が一致する)。
const SECTOR_ANGLE_STEP = (Math.PI * 2) / POI_SECTORS;
export const sectorAngle = (sector: number): number => sector * SECTOR_ANGLE_STEP;

// ★セクター中心からの角度散らし(社長報告v0.25.3187「施設がデンジャーゾーン横軸の真ん中にあることが
// 多く、拠点で示す意味があまりない」)。旧: 3種とも**セクター中心角ちょうど**=拠点(3200)と同一直線上に
// 並ぶため、拠点へ歩くだけで見つかり、「拠点解放→矢印で示す」仕組みが仕事をしていなかった。
// ±30°(セクター半幅45°に対し余裕15°)の範囲で毎ランずらす=**矢印を見て初めて方向が分かる**。
// 30°に留める理由: poiSectorIndex(最寄りセクターへの丸め)が絶対に隣へ倒れない余裕を残す
// (境界ちょうどだと矢印の解放判定と実体のセクターがズレる)。乱数は resetGame が1度だけ引いて
// 位置を確定させる(この層は純関数のまま=注入)。
export const DETOUR_ANGLE_SCATTER_RAD = Math.PI / 6; // ±30°
export const detourAngleOffset = (rand: number): number => (rand * 2 - 1) * DETOUR_ANGLE_SCATTER_RAD;

// セクター番号 → ワールド座標(kind の固定距離・セクター中心角+散らしオフセット)。
export const detourPosForSector = (kind: DetourKind, sector: number, offsetRad = 0): { x: number; y: number } => {
  const a = sectorAngle(sector) + offsetRad;
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

