/**
 * ★リッチの転移(PACING_PUZZLE.md §16-B B-5・社長指示2026-09-17
 * 「**リッチは、噛みつきを発動したら自分の所定距離までワープする。CD中は例のヒステリシスで**」)。
 *
 * ★**3拍の文法は全型で同じ**——**噛む → 硬直 → 離れる**。スケルトン/ゾンビが走って下がる所を、
 * リッチは**消えて現れる**。違うのは「離れる手段」だけで、**硬直は飛ばさない**
 * (飛ばすとリッチだけ一度も殴り返せない敵になり、読む動機が消える=B-5)。
 *
 * ★**転移そのものに慣性は無い**(瞬間移動に加減速は無い)。慣性MUSTが掛かるのは**演出**の方で、
 * **消滅は加速しながら潰れ、出現は行き過ぎて収まる**。ここはその式だけを持つ(描画はpixiが読む)。
 */
import type { Enemy } from '../types/game';
import { idRespawnUnitHash } from './chaffMoves';

/** 着地距離(§16-B B-3・叩き台)。リッチは自前の間合いを持たないので、ここで新しく置く。 */
export const LICH_KEEP_RADIUS_PX = 200;
/**
 * 消える尺。★クリエイティブ監査(v0.25.4447)で 180ms は**短すぎ**と判明——変形の式が u³ だったため
 * 目に届く変化が**実質3コマ**(30fps端末では1〜2コマ)に圧縮され、「加速しながら潰れる」ではなく
 * 「パッと消える」になっていた。尺を伸ばし、カーブも緩めた。
 */
export const LICH_WARP_VANISH_MS = 260;
/** 現れる尺(消えるより長い=**行き過ぎて収まる**ぶんの時間が要る)。 */
export const LICH_WARP_APPEAR_MS = 300;
/**
 * ★**飛んだ後、元居た場所に陣の跡が残る時間**。これが無いと「消えた場所が残る」は嘘になる
 * (同監査の指摘: 体と同じ時刻で陣も消えていた)。跡と出現が**同時に見える**ので、
 * 「そこから居なくなって、ここに来た」が1目で繋がる。
 */
export const LICH_WARP_TRACE_MS = 200;
/**
 * 陣は**体より長い時計**で回す。`drawWarpCircle` の区切り(開き20%/絞り55%〜/薄れ80%〜)は
 * ボスの転移(約380ms)向けに作られており、短い尺に流用すると**渦に見えない**(開きが2コマで終わる)。
 * 消える側は「体260ms + 跡200ms = 460ms」を1本の時計として渡す。
 */
export const LICH_CIRCLE_VANISH_MS = LICH_WARP_VANISH_MS + LICH_WARP_TRACE_MS;
export const LICH_CIRCLE_APPEAR_MS = 380;
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
 * 陣の進み(0..1)。**体より長い1本の時計**で、消える側は「体 → 跡」を跨いで連続する。
 * 跡の側は座標が飛んだ後なので、描く場所は `lichWarpFromX/Y`(飛ぶ前の足元)。
 */
export const lichCircleVanishProgress = (e: Enemy, gameTime: number): number | null => {
  if (e.lichWarpAt !== undefined) {
    const t = (gameTime - e.lichWarpAt) / LICH_CIRCLE_VANISH_MS;
    return t >= 0 && t < 1 ? t : null;
  }
  if (e.lichWarpDoneAt === undefined) return null;
  const t = (LICH_WARP_VANISH_MS + (gameTime - e.lichWarpDoneAt)) / LICH_CIRCLE_VANISH_MS;
  return t >= 0 && t < 1 ? t : null;
};

/** 陣(出現側)の進み。体(300ms)より長い380msで回す=**体が収まった後も一拍残る**。 */
export const lichCircleAppearProgress = (e: Enemy, gameTime: number): number | null => {
  if (e.lichWarpDoneAt === undefined) return null;
  const t = (gameTime - e.lichWarpDoneAt) / LICH_CIRCLE_APPEAR_MS;
  return t >= 0 && t < 1 ? t : null;
};

/** 行き過ぎて収まる(back-out)。u=1で必ず1、途中で**約25%**行き過ぎる。 */
const backOut = (u: number): number => {
  const c1 = 4.2, c3 = c1 + 1;  // ★監査B-5: 約10%(既定の1.70158)では体高80pxで8px=見えない
  const p = u - 1;
  return 1 + c3 * p * p * p + c1 * p * p;
};

const smooth01 = (u: number): number => {
  const c = Math.max(0, Math.min(1, u));
  return c * c * (3 - 2 * c);
};

/**
 * 体の変形と透明度(`corpseSquashNow` と同じ作法=純関数を描画が読むだけ)。
 *
 * ★**消滅は「潰れ」ではなく「絞られて吸い上げられる」**(クリエイティブ監査 B-6 の是正)。
 * 旧実装は**縦に潰れて横に広がって薄れる**で、これは `corpseSquashNow`(死体の潰れ)と
 * **同じ言語**だった——このゲームで「倒した」を意味する形なので、足元の陣を見ていない限り
 * プレイヤーは「倒れた?」と読む。**死と逆方向へ変形させる**=横に絞り、縦に伸ばす。
 * ★透明度は変形より**遅れて**落とす。同じ進みで0に届くと、一番絞れた形が**一度も見えない**。
 *
 * ★**出現は消滅の逆再生にしない**(同 B-7)。吸われるのと押し出されるのは同じ動きではない。
 * 出現は**しゃがんだ形から立ち上がって行き過ぎ、収まる**(縦の軸で、消滅の横絞りとは別の動き)。
 */
export const lichWarpPose = (e: Enemy, gameTime: number): { sqX: number; sqY: number; alpha: number } => {
  // ★消え切った後、**まだ飛んでいない**間は消えたまま(品質監査A-6)。
  // 消滅の窓を過ぎても `lichWarpAt` が残るのは、被弾硬直・ノックバックの早期returnが
  // 座標の跳びより手前にあるため——その間に等身へ戻すと、**透明だった体が元の場所に全身で現れ、
  // 滑ってから、消滅の絵なしで200px先へ出る**。消えている体は消えたままにする。
  if (e.lichWarpAt !== undefined && gameTime >= e.lichWarpAt + LICH_WARP_VANISH_MS) {
    return { sqX: 1 - 0.72, sqY: 1 + 0.62, alpha: 0 };
  }
  const v = lichVanishProgress(e, gameTime);
  if (v !== null) {
    const shape = Math.pow(v, 1.8);   // 加速はする。ただし u³ ほど終盤に寄せない
    const fade = Math.pow(v, 3.2);    // ★形より遅れて消える=絞り切った姿が見える
    return { sqX: 1 - 0.72 * shape, sqY: 1 + 0.62 * shape, alpha: 1 - fade };
  }
  const a = lichAppearProgress(e, gameTime);
  if (a !== null) {
    // ★陣が先に灯り、少し遅れて体が立つ(B-8「居ない時間がゼロ」の是正)。
    // ★形の時計も**体が見え始めた所から**始める。出現の頭から回すと、一番大きい変形
    // (しゃがんだ姿・行き過ぎの伸び)が**透明な間に終わってしまい一度も見えない**
    // ——消滅側で透明度を遅らせたのと同じ穴が、出現側では時計のズレとして出る。
    const bu = Math.max(0, Math.min(1, (a - APPEAR_BODY_DELAY) / (1 - APPEAR_BODY_DELAY)));
    const b = backOut(bu);
    const alpha = smooth01((a - APPEAR_BODY_DELAY) / 0.33);
    return { sqX: 1.28 - 0.28 * b, sqY: 0.52 + 0.48 * b, alpha };
  }
  return { sqX: 1, sqY: 1, alpha: 1 };
};
