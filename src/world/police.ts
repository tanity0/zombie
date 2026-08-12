// 警察署オブジェクト(PACING_PUZZLE.md §6.24 M48。旧称「研究施設跡」→社長指示v0.25.2352で改名。
// 距離・アリーナ方式・報酬(専用スキル1つランダム)・入場コストは名称変更の前後で不変)。
//
// 仕様:
// - デンジャーゾーンの手前寄り(3500)に1つ立つ寄り道POI。4方角のうち、裏ボス/病院/武器庫と
//   被らないセクターへ毎ランランダムに配置される(world/detourPoi.ts が割り当てを決める)。
// - 病院/武器庫と違いサークル+滞在ではなく**既存の囲いイベント(アリーナ)をそのまま流用**する
//   (§6.24 F1)。近づくと囲いが発生 → 全滅させると専用スキルを1つランダム入手。
// - 入手すると警察署はフェードアウトして消える(そのランでは再取得できない)。
//
// この層は renderer-agnostic(PixiJS非依存)。座標・当たり判定・近接判定の純関数だけを置く。
// 描画は pixiScene、アリーナの発生/進行/報酬付与は useGameLoop/gameStore が、ここの値を読んで行う。
import { footRect, resolveAabb, type Rect } from './obstacles';
import { DETOUR_DIST, detourPosForSector } from './detourPoi';

/** デンジャーゾーン(AREA_THRESHOLDS[1]〜[2])の手前寄り。v0.25.3172で 2250(研究対象区域の中点)から移動。
 * 理由: 矢印を出す拠点が3200(デンジャー内)にあるのに、POIが2250=**来た道を戻る位置**にあった。 */
export const POLICE_DIST = DETOUR_DIST.police; // = 3500

// 囲いイベント(アリーナ)の半径。既存の ARENA_EVENT_RADIUS(useGameLoop.ts)と同じ値=240(§6.24 F1)。
// useGameLoop.ts 自身も同名の定数をローカルに持つ(playtestDriver.ts が既に同じ値を独立して持つのと
// 同じ既存の慣例=このゲームの「アリーナ半径」は各消費側がリテラルで共有する運用)。
export const POLICE_ARENA_RADIUS = 240;
/** 入手後のフェードアウト時間(ms)。病院/武器庫と同じ。 */
export const POLICE_FADE_MS = 900;

// 素材(社長支給v0.25.2352・public/sprites/police.png・520×472の等角ピクセルアート)。
// 横に広い絵なので**幅基準**で表示サイズを揃える(病院は高さ基準=HOSPITAL_DISPLAY_H)。armory.tsと
// 同じ考え方で幅を合わせる(素材の縦横比が違うので高さは自動的に病院よりわずかに大きくなる)。
// ★実機調整前提の仮値(社長指示v0.25.2352「妥当な値を置いたうえで実機調整前提と明記」)。
// 社長報告v0.25.2389「建物が大半を占めてて邪魔」を受けて縮小(380→300)。
// 警察署だけは**アリーナ(直径480)の中で戦う**ため、病院/武器庫(通り過ぎるだけ)と違い建物の大きさが
// そのまま戦闘スペースを削る。380では絵がアリーナ直径の79%を占めていた → 300で63%。
export const POLICE_DISPLAY_W = 300;
// 当たり判定=建物の土台だけ(絵より小さい・足元の敷地に合わせた低い箱)。
// 社長報告v0.25.2389を受けて縮小(260×80→150×56)。**移動を塞ぐのはこの箱**で、260ではアリーナの
// 幅の54%が通れない壁だった(囲まれた状態で回り込む余地が無い) → 150で31%。
// CLAUDE.mdの障害物規約どおり「絵は箱より大きく、箱の上に絵が立つ」ので、絵を保ったまま足元だけ細くできる。
export const POLICE_HITBOX_W = 150;
export const POLICE_HITBOX_H = 56;

// 一度アリーナが始まったら、**プレイヤーがこの距離まで離れるまで再発動しない**(社長報告v0.25.2389
// 「失敗すると位置がずれて再発動して抜け出せない」の修正)。
// 何が起きていたか: 発動しきい値(isNearPolice)がアリーナ半径と同じ240で、アリーナ中はプレイヤーが
// 円の内側へクランプされる(gameStore の clampRectInsideCircle)。よって**時間切れで失敗した瞬間、
// プレイヤーは必ず半径240の内側に居る**ため、次のフレームで即再発動し、クランプで内側へ弾かれる
// (=「位置がずれる」)。これが無限に続いて抜け出せなくなっていた。
// 直し方はヒステリシス: 発動と再武装のしきい値を別にして、**一度出るまで再発動させない**。
export const POLICE_REARM_RADIUS = POLICE_ARENA_RADIUS + 120; // = 360

/** 警察署の立ち位置。割り当てられたセクター番号から位置だけを計算する純関数(乱数はここで引かない)。 */
export const policePos = (sector: number, offsetRad = 0): { x: number; y: number } => detourPosForSector('police', sector, offsetRad);

/** 建物の当たり判定(足元基準・obstacles.tsの規約どおり)。 */
export const policeRect = (pos: { x: number; y: number }): Rect =>
  footRect(pos.x, pos.y, POLICE_HITBOX_W, POLICE_HITBOX_H);

/**
 * 警察署の壁で移動を解決する。入手後(taken)は建物ごと消えるので素通り。
 * 遠くに居る時は判定自体を省く(1個しか無いので距離1回で足りる)。
 */
export const resolvePoliceCollision = (
  rect: Rect,
  pos: { x: number; y: number } | null,
  taken: boolean,
): { x: number; y: number } => {
  if (!pos || taken) return { x: rect.x, y: rect.y };
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  if (Math.abs(cx - pos.x) > 600 || Math.abs(cy - pos.y) > 600) return { x: rect.x, y: rect.y };
  return resolveAabb(rect, [policeRect(pos)]);
};

/**
 * プレイヤー(矩形の中心)が警察署アリーナの発生半径内に入ったか。
 * サークル+滞在ではなく「近づいた瞬間にアリーナ発生」なので、しきい値は1つだけ(dwellは無い)。
 */
export const isNearPolice = (
  player: { x: number; y: number; width: number; height: number },
  pos: { x: number; y: number } | null,
  radius: number = POLICE_ARENA_RADIUS,
): boolean => {
  if (!pos) return false;
  const px = player.x + player.width / 2, py = player.y + player.height / 2;
  return Math.hypot(px - pos.x, py - pos.y) <= radius;
};

/**
 * 失敗(時間切れ)後、警察署アリーナを**もう一度発動してよい距離まで離れたか**。
 * `isNearPolice` と対になるヒステリシスの外側のしきい値(POLICE_REARM_RADIUS=360 > 発動240)。
 * これが true になるまで再発動させないことで、「失敗→即再発動→円の内側へ弾かれる」の無限ループを断つ。
 * 離れれば再武装するので、**立て直してもう一度挑むことはできる**(報酬を取り上げない)。
 */
export const isPoliceRearmed = (
  player: { x: number; y: number; width: number; height: number },
  pos: { x: number; y: number } | null,
): boolean => {
  if (!pos) return true;
  const px = player.x + player.width / 2, py = player.y + player.height / 2;
  return Math.hypot(px - pos.x, py - pos.y) > POLICE_REARM_RADIUS;
};
