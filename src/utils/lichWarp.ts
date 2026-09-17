/**
 * ★リッチの転移(PACING_PUZZLE.md §16-B B-5・社長指示2026-09-17
 * 「**リッチは、噛みつきを発動したら自分の所定距離までワープする。CD中は例のヒステリシスで**」)。
 *
 * ★**3拍の文法は全型で同じ**——**噛む → 硬直 → 離れる**。スケルトン/ゾンビが走って下がる所を、
 * リッチは**消えて現れる**。違うのは「離れる手段」だけで、**硬直は飛ばさない**
 * (飛ばすとリッチだけ一度も殴り返せない敵になり、読む動機が消える=B-5)。
 *
 * ★**転移そのものに慣性は無い**(瞬間移動に加減速は無い)。慣性MUSTが掛かるのは**演出**の方で、
 * **消滅は陣へ吸い込まれ、出現は行き過ぎて収まる**。ここはその式だけを持つ(描画はpixiが読む)。
 */
import type { Enemy } from '../types/game';
import { idRespawnUnitHash } from './chaffMoves';

/** 着地距離(§16-B B-3・叩き台)。リッチは自前の間合いを持たないので、ここで新しく置く。 */
export const LICH_KEEP_RADIUS_PX = 200;
/** 消える尺(体)。 */
export const LICH_WARP_VANISH_MS = 260;
/** 現れる尺(体)。消えるより長い=**行き過ぎて収まる**ぶんの時間が要る。 */
export const LICH_WARP_APPEAR_MS = 300;
/** 飛んだ後、**元居た場所に陣の跡が残る**時間。跡と出現が同時に見える=移動が1目で繋がる。 */
export const LICH_WARP_TRACE_MS = 200;
/**
 * ★**陣は体より先に灯る**(クリエイティブ監査2巡目 B-6)。旧実装は陣の「絞り(吸い込み)」が
 * t=0.55=253ms から始まる一方、体は260msで消え終わっていた——**吸う側の動きが、吸われる物が
 * 消えた後に始まっていた**(原因と結果が逆)。噛みの硬直の後半から陣を灯し、体が縮む間に陣が絞る。
 * ついでに**プレイヤーへの予告**にもなる(陣が出たら、逃げられる前に叩く合図)。
 */
export const LICH_CIRCLE_LEAD_MS = 160;
/** 陣(消える側)の通し時計。ボスの転移(約380ms)向けに作られたカーブが読める長さを確保する。 */
export const LICH_CIRCLE_VANISH_MS = LICH_CIRCLE_LEAD_MS + LICH_WARP_VANISH_MS + LICH_WARP_TRACE_MS;
/** 陣(出る側)の時計。体(300ms)より長い=体が収まった後も一拍残る。 */
export const LICH_CIRCLE_APPEAR_MS = 380;
/** ★取り消された時、体が等身へ**戻る**のに掛ける時間(瞬間復帰は慣性MUST違反)。 */
export const LICH_WARP_CANCEL_MS = 220;
/** 体が現れ始めるまでの間(出現の何割を待つか)。**陣が先に灯り、そこから体が立つ。** */
const APPEAR_BODY_DELAY = 0.22;

const SALT_LICH_ANGLE = 0x6c31;

/**
 * 着地点(**中心座標**)。**今いる方角を保ったまま外へ退く**——的を挟んで反対側へ飛ぶと
 * 「どこへ行ったか」が読めず、プレイヤーの正面へ突然現れる事故も起きる。
 * 個体ごとの固定オフセット(±約50度)で、複数体が同じ点に重ならないようにする。
 */
export const lichWarpLanding = (
  tx: number, ty: number, ecx: number, ecy: number,
  id: string, spawnedAt: number | undefined, radiusPx: number = LICH_KEEP_RADIUS_PX,
): { x: number; y: number } => {
  const base = Math.atan2(ecy - ty, ecx - tx);          // 的→リッチ(=今いる方角)
  const off = (idRespawnUnitHash(id, spawnedAt, SALT_LICH_ANGLE) * 2 - 1) * 0.9; // ±約51度
  const a = base + off;
  return { x: tx + Math.cos(a) * radiusPx, y: ty + Math.sin(a) * radiusPx };
};

/** 消えている最中か(この間は動かない・技も出さない)。 */
export const lichIsVanishing = (e: Enemy, gameTime: number): boolean =>
  e.lichWarpAt !== undefined && gameTime < e.lichWarpAt + LICH_WARP_VANISH_MS;

/** 転移の時刻が来たか(このフレームで座標が飛ぶ)。 */
export const lichWarpDue = (e: Enemy, gameTime: number): boolean =>
  e.lichWarpAt !== undefined && gameTime >= e.lichWarpAt + LICH_WARP_VANISH_MS;

/** 0..1(消える進み)。消えていなければ null。 */
export const lichVanishProgress = (e: Enemy, gameTime: number): number | null => {
  if (e.lichWarpAt === undefined) return null;
  const t = (gameTime - e.lichWarpAt) / LICH_WARP_VANISH_MS;
  return t >= 0 && t < 1 ? t : null;
};

/** 0..1(現れる進み)。現れ終わっていれば null。 */
export const lichAppearProgress = (e: Enemy, gameTime: number): number | null => {
  if (e.lichWarpDoneAt === undefined) return null;
  const t = (gameTime - e.lichWarpDoneAt) / LICH_WARP_APPEAR_MS;
  return t >= 0 && t < 1 ? t : null;
};

/**
 * 陣(消える側)の進み。**体より先に灯り、体が消えた後も跡として残る**1本の時計。
 * ★跳びが遅れている間(被弾硬直・ノックバックの滑りが座標の跳びより手前にあるため起きる)は、
 * **体が消えた時点の進みで止める**(品質監査A-9: 止めないと、陣が先に終わって消え、
 * 跳んだ瞬間に絞りの途中から**パッと再点灯**する)。
 */
export const lichCircleVanishProgress = (e: Enemy, gameTime: number): number | null => {
  const holdAt = (LICH_CIRCLE_LEAD_MS + LICH_WARP_VANISH_MS) / LICH_CIRCLE_VANISH_MS;
  if (e.lichWarpAt !== undefined) {
    const t = (gameTime - (e.lichWarpAt - LICH_CIRCLE_LEAD_MS)) / LICH_CIRCLE_VANISH_MS;
    if (t < 0) return null;
    return Math.min(t, holdAt);     // 跳ぶまでは「体が消えた時点」で止める
  }
  if (e.lichWarpDoneAt === undefined) return null;
  const t = holdAt + (gameTime - e.lichWarpDoneAt) / LICH_CIRCLE_VANISH_MS;
  return t < 1 ? t : null;
};

/** 陣(出る側)の進み。体(300ms)より長い380msで回す=**体が収まった後も一拍残る**。 */
export const lichCircleAppearProgress = (e: Enemy, gameTime: number): number | null => {
  if (e.lichWarpDoneAt === undefined) return null;
  const t = (gameTime - e.lichWarpDoneAt) / LICH_CIRCLE_APPEAR_MS;
  return t >= 0 && t < 1 ? t : null;
};

/** 行き過ぎて収まる(back-out)。u=1で必ず1、途中で**約26%**行き過ぎる(極値 ≒1.406)。 */
const backOut = (u: number): number => {
  const c1 = 4.2, c3 = c1 + 1;  // ★監査B-5: 既定(1.70158)の約10%では体高80pxで8px=見えない
  const p = u - 1;
  return 1 + c3 * p * p * p + c1 * p * p;
};

const smooth01 = (u: number): number => {
  const c = Math.max(0, Math.min(1, u));
  return c * c * (3 - 2 * c);
};

/**
 * 消える姿(進み 0..1)。★**等方に縮んで、足元の陣へ吸い込まれる。**
 *
 * ★ここは2回作り直している。理由を両方残す(次に触る人が同じ穴を掘らないため):
 * 1巡目は「縦に潰れて横に広がる」だったが、それは `corpseSquashNow`(死体の潰れ)と**同じ言語**で、
 * このゲームでは**「倒した」の絵**——陣を見ていない限り「倒れた?」と読まれる。
 * 2巡目は逆に「横に絞って縦に伸ばす」にしたが、今度は**足元アンカーなので体が天へ伸び**、
 * **床の陣に吸われる絵の逆**になった(行き先が床なのに体は空へ昇る)。加えて、ドット絵を
 * 横0.28×縦1.62に**非等方で歪める**のは、この画作りでは人がやらない(画素が縦縞に溶ける)。
 * ⇒ **等方**に、**足元へ**縮める。アンカーが足元(0.5,1)なので、縮むほど体は陣の中心へ寄る。
 * ★透明度は形より**遅れて**落とす(同じ進みで0に届くと、一番縮んだ姿が一度も見えない)。
 */
const vanishPoseAt = (v: number): { sqX: number; sqY: number; alpha: number } => {
  const shape = Math.pow(v, 1.8);   // 加速はする。ただし u³ ほど終盤に寄せない
  const fade = Math.pow(v, 3.2);    // ★形より遅れて消える
  const s = 1 - 0.88 * shape;
  return { sqX: s, sqY: s, alpha: 1 - fade };
};

/** ★陣の色をどれだけ体へ乗せるか(0..1)。消えるほど**魔法の色に染まってから**居なくなる。 */
export const lichWarpTintStrength = (e: Enemy, gameTime: number): number => {
  if (e.lichWarpCancelAt !== undefined) return 0;
  const v = lichVanishProgress(e, gameTime);
  if (v !== null) return smooth01(v * 1.25);
  return 0;
};

/**
 * 体の変形と透明度(`corpseSquashNow` と同じ作法=純関数を描画が読むだけ)。
 *
 * ★**出現は消滅の逆再生にしない**。消滅は**一方向に縮むだけ**(行き過ぎない)、
 * 出現は**小さい所から行き過ぎて収まる**。吸われるのと押し出されるのは同じ動きではない。
 */
export const lichWarpPose = (e: Enemy, gameTime: number): { sqX: number; sqY: number; alpha: number } => {
  // ★取り消された時の**戻り**(品質監査A-8)。硬直中に殴られてクリ気絶——設計がまさに招いている
  // 場面——で取り消すと、旧実装は縮んで半透明の体が**1フレームで全身に戻っていた**
  // (CLAUDE.md「パッと出て止まる/瞬間停止は禁止」に正面から当たる)。止まった所から戻す。
  if (e.lichWarpCancelAt !== undefined) {
    const u = (gameTime - e.lichWarpCancelAt) / LICH_WARP_CANCEL_MS;
    if (u >= 0 && u < 1) return vanishPoseAt((e.lichWarpCancelFrom ?? 0) * (1 - smooth01(u)));
    return { sqX: 1, sqY: 1, alpha: 1 };
  }
  // ★消え切った後、**まだ飛んでいない**間は消えたまま(品質監査A-6)。消滅の窓を過ぎても
  // `lichWarpAt` が残るのは、被弾硬直・ノックバックの早期returnが座標の跳びより手前にあるため。
  if (e.lichWarpAt !== undefined && gameTime >= e.lichWarpAt + LICH_WARP_VANISH_MS) {
    return vanishPoseAt(1);
  }
  const v = lichVanishProgress(e, gameTime);
  if (v !== null) return vanishPoseAt(v);

  const a = lichAppearProgress(e, gameTime);
  if (a !== null) {
    // ★陣が先に灯り、少し遅れて体が立つ。形の時計も**体が見え始めた所から**始める
    // (頭から回すと、一番大きい変形が透明な間に終わって一度も見えない)。
    const bu = Math.max(0, Math.min(1, (a - APPEAR_BODY_DELAY) / (1 - APPEAR_BODY_DELAY)));
    const s = 0.35 + 0.65 * backOut(bu);
    return { sqX: s, sqY: s, alpha: smooth01((a - APPEAR_BODY_DELAY) / 0.33) };
  }
  return { sqX: 1, sqY: 1, alpha: 1 };
};
