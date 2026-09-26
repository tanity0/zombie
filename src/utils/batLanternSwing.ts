// ★バットの武器=ランタン(社長支給2026-09-18「バットの武器 鞭のようにランタンを背中上から下に
// 振り下ろすイメージ」「振り下ろすエフェクトは左から右へアニメーション」)。
//
// ★何を決める葉か: **噛みつき台本(`enemyBite.ts` / PACING_PUZZLE.md §12)の尺の上に乗る絵だけ**。
// 判定・ダメージ・射程・尺は1msも触らない(CLAUDE.md「Visual vs hitbox」)。
//
// ★上下は**画面の縦で固定**する(重力)。吊りランタンなので、静止は必ず**真下に垂れる**。
// 狙いで動かすのは**左右の鏡だけ**——上下まで狙い方向に連動させると、プレイヤーが真上に居る時に
// 「振り下ろし」が空へ振り上がる(クリエイティブ監査2026-09-18 #3)。
//
// ★慣性(CLAUDE.md MUST): 振り上げは上ほど遅く(easeOut)、振り下ろしは落ちるほど速く(easeIn)、
// 叩いた後は**減衰する揺れ**で止まる(対称なS字=何にも当たっていない動き、にしない)。
import type { Enemy } from '../types/game';
import { biteSpecFor, bitePhaseOf } from './enemyBite';
import { sheetHasWeapon } from './enemySheets';
import { variantTextureName } from './enemyVariant';
import { frameWithWindupHold } from './fxFrameClock';

/** 鎖の見かけの長さ(px)。実際は「握り→落とす点」の距離に合わせて伸縮する(下の clamp)。 */
export const BAT_LANTERN_LEN_PX = 92;
export const BAT_LANTERN_LEN_MIN_PX = 64;
export const BAT_LANTERN_LEN_MAX_PX = 138;
/** 素材の中で「柄→先端」が向いている角度。鎖が上・灯が下なので**真下**。 */
export const BAT_LANTERN_INTRINSIC_ANGLE = Math.PI / 2;
/** 柄(回転の軸)=鎖の上端=手。 */
export const BAT_LANTERN_GRIP_X = 0.5;
export const BAT_LANTERN_GRIP_Y = 0.02;

const D2R = Math.PI / 180;
/** 静止=真下に垂れる(画面の縦で固定)。 */
export const BAT_LANTERN_REST = 90 * D2R;
/** 振り上げ切った所=背中の上。右向きは左上(225°)、左向きは右上(-45°)。 */
export const batLanternBack = (s: number): number => (90 + s * 135) * D2R;
/** 振り下ろし切った所の既定(落とす点が無い時)。背中の上から**頭の上を通って**180°。 */
export const batLanternDownDefault = (s: number): number => (90 + s * 315) * D2R;
/** 振り抜いた後の揺れ(叩いた反動)。 */
export const BAT_LANTERN_SETTLE_MS = 220;
export const BAT_LANTERN_SETTLE_DEG = 22;

const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const easeIn = (t: number): number => t * t * t;

export interface BatLanternPose {
  angle: number;
  alpha: number;
}

/**
 * 落とす点の角度を、**背中の上→頭の上→前**の1本の振りに乗る値へ展開する
 * (`atan2` の折り返しで振りが逆回りしないようにする)。
 */
export const batLanternDownAngle = (s: number, rawAngle: number | null): number => {
  const nominal = batLanternDownDefault(s);
  if (rawAngle === null) return nominal;
  let a = rawAngle;
  while (a - nominal > Math.PI) a -= 2 * Math.PI;
  while (nominal - a > Math.PI) a += 2 * Math.PI;
  // 振りが暴れないよう、既定から±70°に留める(落とす点が真横/真後ろでも1本の振りに見える)。
  const lim = 70 * D2R;
  return Math.max(nominal - lim, Math.min(nominal + lim, a));
};

/**
 * 噛みつきの経過(ms)からランタンの姿勢を出す。走っていなければ null。
 * `s` は右向き=+1 / 左向き=-1。`downAngle` は `batLanternDownAngle` で展開済みの着弾角。
 */
export const batLanternPose = (
  sinceMs: number, s: number, downAngle: number, windupMs: number, biteMs: number,
): BatLanternPose | null => {
  if (sinceMs < 0) return null;
  const total = windupMs + biteMs;
  if (sinceMs > total + BAT_LANTERN_SETTLE_MS) return null;
  const sg = s >= 0 ? 1 : -1;
  const back = batLanternBack(sg);
  if (sinceMs <= windupMs) {
    // 垂れている所から背中の上へ振り上げる(上ほど遅い)。**動きは大きく**=135°ぶん動く。
    const t = windupMs > 0 ? sinceMs / windupMs : 1;
    return { angle: BAT_LANTERN_REST + (back - BAT_LANTERN_REST) * easeOut(t), alpha: 1 };
  }
  if (sinceMs <= total) {
    const t = biteMs > 0 ? (sinceMs - windupMs) / biteMs : 1;
    return { angle: back + (downAngle - back) * easeIn(t), alpha: 1 };
  }
  // 叩いた反動=**減衰する揺れ**。衝突で角速度が0になり、2往復して収まる。
  const t = (sinceMs - total) / BAT_LANTERN_SETTLE_MS;
  const damp = Math.exp(-3.4 * t);
  const wobble = BAT_LANTERN_SETTLE_DEG * D2R * damp * Math.sin(2 * Math.PI * 2 * t);
  return { angle: downAngle - sg * wobble, alpha: 1 };
};

// ---------------------------------------------------------------------------------------------
// 振り下ろしの炸裂(社長支給の9コマ・左から右へ)
// ---------------------------------------------------------------------------------------------
export const BAT_SLAM_FRAMES = 9;
/**
 * **当たる瞬間に出るコマ**。社長の指定2026-09-18「**9コマあって、7コマ目が叩きつけたピーク。
 * 8-9は残像**」=0始まりで **6**。設計者は当初5(6枚目)と読み違えていた。
 */
export const BAT_SLAM_IMPACT_FRAME = 6;
/**
 * ★当たる前に赤を出す長さ(ms)。**短く**する——長いと「判定の点に立つ赤い柱」になり、
 * 流星でない予告が1本増える(クリエイティブ監査2026-09-18 #1)。落ちてくる線がパッと差す長さ。
 */
export const BAT_SLAM_LEAD_MS = 70;
/** 各コマの尺(ms)。炸裂(5)を**一番長く**持たせ、余韻は減速する(等間隔にしない)。 */
// 先頭6コマ=振り下ろしが届くまで(合計84ms=短く差し込む)/ 7コマ目=叩きつけのピーク(一番長い)/
// 8-9コマ目=残像(減速しながら散る)。
export const BAT_SLAM_HOLD_MS: readonly number[] = [14, 14, 14, 14, 14, 14, 80, 60, 90];
/** 正規化の基準幅(炸裂コマの幅)。 */
export const BAT_SLAM_REF_W = 337;
/** 炸裂コマの見かけの横幅(px)。判定(接触30px)より大きく出す=②派手さの絵。 */
export const BAT_SLAM_W_PX = 118;
/** 各コマの接地点の横位置(コマ幅に対する割合・実測)。縦は全コマ下端で揃えてある。 */
export const BAT_SLAM_ANCHOR_X: readonly number[] =
  [0.403, 0.482, 0.589, 0.535, 0.503, 0.496, 0.491, 0.491, 0.515];

/** 炸裂の全長(ms)。 */
export const batSlamTotalMs = (): number => BAT_SLAM_HOLD_MS.reduce((a, b) => a + b, 0);

/**
 * 炸裂のコマ番号。`sinceImpactMs` は**当たる瞬間を0**とした経過(前は負)。
 * 当たる瞬間にちょうど炸裂コマ(5)へ切り替わる。
 */
export const batSlamFrame = (sinceImpactMs: number): number | null => {
  const lead = BAT_SLAM_HOLD_MS.slice(0, BAT_SLAM_IMPACT_FRAME).reduce((a, b) => a + b, 0);
  const t = sinceImpactMs + lead;   // 先頭コマの頭を0にした時計
  if (t < 0) return null;
  let acc = 0;
  for (let i = 0; i < BAT_SLAM_FRAMES; i++) {
    acc += BAT_SLAM_HOLD_MS[i];
    if (t < acc) return i;
  }
  return null;
};

/**
 * ★構え(§16-E)入りの送り。溜めのあいだ(`sinceWindupMs < windupMs`)は0コマ目(ランタンを振りかぶる
 * 前の形)で静止し、溜め明けからは `batSlamFrame` と1ミリも変わらない送りに戻る。
 * ★ランタンそのもの(`batLanternPose`)は元々溜めの間も振り上げの動きを描いているが、この0コマ目の
 * 「構え」は**炸裂シート(bat-slam)側**の絵で、別レイヤーとして重なる(社長指示「牙なら牙の1コマ目で」
 * =各シートの1コマ目を構えに使う、の敵ごとの武器版)。
 */
export const batSlamFrameWithWindup = (
  sinceWindupMs: number, windupMs: number, sinceImpactMs: number,
): number | null =>
  frameWithWindupHold(sinceWindupMs, windupMs, sinceImpactMs, batSlamFrame);

/**
 * ★炸裂の色は**その技がカウンターできるかで決まる**(CLAUDE.md「色と形の文法」
 * ①赤=カウンター/回避の対象 ②紫=カウンターできない攻撃)。
 *
 * バットは**2つの攻撃を持つ**: §16の技「掴み」(`bat-grab`)は `counterable: true` =**赤**、
 * §12の既定の噛みつきは社長裁定2026-08-25で `counterable: false` =**紫**。
 * 同じ絵を両方に赤で出すと、この敵だけ「赤=返せる」が壊れる。色を `counterable` から引けば、
 * **台帳(`enemyBite.ts`)を1行変えるだけで絵の色も追従する**=2箇所で色を持たない。
 */
export const batSlamTexName = (frame: number, counterable: boolean): string =>
  counterable ? `fx/bat-slam-${frame}` : `fx/bat-slam-p-${frame}`;

/** その敵が「いま出している攻撃」がカウンターできるか(技の表→型の表の順で引く)。 */
export const batSlamCounterable = (e: Enemy): boolean =>
  biteSpecFor(e.type, e.chaffMove, e.aiPhase).counterable;

/**
 * この敵が**別スプライトの**ランタンを振るか。
 *
 * ★★**「武器ごと描かれたシート」を持つ個体だけ false**。
 * そのシートは武器を持った腕ごと描かれているので、別スプライトも出すと**二本持ち**になる。
 * ★**「シートがあるか」では判定しない**(社長報告2026-09-21「コウモリ女の攻撃時に武器が消えてる」)。
 * 女のシートは**素手で掴む絵**で武器は描かれていない——そこを推測で決めつけて消した結果、
 * **女の攻撃から武器が丸ごと消えた**。判定は `ENEMY_SHEET_HAS_WEAPON` の明示だけを見る。
 * ★炸裂(`bat-slam`)は**武器ではなく当たった衝撃の絵**なので、こちらは従来どおり出す
 * (CLAUDE.md 攻撃ヴィジュアルの2分類: ①武器=判定に揃える / ②派手さ=大きく出す)。
 */
export const usesBatLantern = (e: Pick<Enemy, 'type' | 'id'>): boolean =>
  e.type === 'bat' && !sheetHasWeapon(variantTextureName('bat', e.id));

/** 噛みつきの尺(型と技から引く)。描画側が手写ししないための薄い窓口。 */
export const batBiteTiming = (e: Enemy): { windupMs: number; biteMs: number } => {
  const spec = biteSpecFor(e.type, e.chaffMove, e.aiPhase);
  return { windupMs: spec.windupMs, biteMs: spec.biteMs };
};

/** 噛みつきが走っているか。 */
export const batBiteRunning = (e: Enemy, gameTime: number): boolean =>
  bitePhaseOf(e, gameTime) !== 'none';
