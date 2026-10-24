// 剣を振るボスの「踏み込み」(社長指示v0.25.3524「本体と剣も踏み込みたい。(もちろん慣性は忘れずに)」)。
//
// ★何のための仕組みか(社長指摘v0.25.3524「ミゲルとかウリとか、剣の動きと当たり判定位置が違うのが気になる」):
// 実測すると、剣の絵は**判定に全く届いていなかった**。
//   ミゲル 払い: 剣40px / 判定=190×80の長方形を**プレイヤーの居た所**(ボスから最大250px先)に置く
//   ウリ 大薙ぎ: 剣85px / 判定=ボスから310pxの帯(内径140or90でくり抜き)=**剣は内径の中で止まっている**
// 原因は事故ではなく経緯で、絵が「大きすぎる」と言われて縮めた時(ミゲル260→160→40 / ウリ130→85)、
// **判定はそのまま**にしたため。つまり「剣は自分の体の中で振れているのに、斬れているのは遠く」。
//
// ★直し方の方針(社長裁定): **判定・射程・溜め時間は一切変えない**(=難易度を下げない)。
// 代わりに**ボス本体を判定の手前まで踏み込ませる**。判定はロック済みの座標なので動かない——
// 動くのは本体だけで、その結果として剣が判定に届く。
//
// ★慣性(CLAUDE.md「加減速のない動きは禁止」): 踏み込みは smoothstep(加速→減速)で、
// **溜めの終盤から始まって振り切りで止まる**。等速で始まって瞬間停止させない。
// 溜めの終盤から始めるのは物理的にもそうだから(人は斬る前に足が出る)であり、
// **短い実行時間(110〜130ms)だけで150px動かすと瞬間移動に見える**のを避けるためでもある。
//
// レンダラ非依存・store非依存の純関数(実装精度の規律4)。angelBossTick.ts からのみ使う。

/** 踏み込み1回ぶんの計画。技の開始時に1度だけ立て、以後は時計から位置を引くだけ。 */
export interface SwordLungePlan {
  /** どの技の踏み込みか(`harai`/`tate`/`sweep`)。別の技の残骸を誤って適用しないための札。 */
  forMove: string;
  /** 起点=踏み込み開始時のボス中心。 */
  fromX: number;
  fromY: number;
  /** 進む向き(単位ベクトル)。 */
  dirX: number;
  dirY: number;
  /** 進む距離(px)。 */
  dist: number;
  /** 開始時刻(gameTime)。 */
  startAt: number;
  /** 全体の長さ(ms)= 溜めの先行ぶん + 実行ぶん。 */
  durMs: number;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** 踏み込みの進行。加速→減速(smoothstep)=踏み出して踏み止まる。 */
export const swordLungeEase = (t: number): number => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

/**
 * 踏み込みの計画を立てる。詰める先は「判定のここまで来たい点」(`toX/toY`)で、
 * そこから `standoffPx` だけ手前に立つ(剣を振る間合いを残す)。上限 `maxPx` で頭打ち。
 *
 * 詰める距離が1px未満なら **null**(=もう十分近い。**0距離の"踏み込み"を作らない**
 * =等速0の動きが混ざると慣性の掟の穴になるため)。
 */
export const planSwordLunge = (
  forMove: string,
  fromX: number, fromY: number,
  toX: number, toY: number,
  standoffPx: number, maxPx: number,
  startAt: number, durMs: number,
): SwordLungePlan | null => {
  const dx = toX - fromX, dy = toY - fromY;
  const d = Math.hypot(dx, dy);
  if (d < 1e-3) return null;
  const dist = Math.max(0, Math.min(maxPx, d - standoffPx));
  if (dist < 1) return null;
  return { forMove, fromX, fromY, dirX: dx / d, dirY: dy / d, dist, startAt, durMs };
};

/**
 * その計画が今も生きているか(=位置を上書きしてよいか)。
 * **札(forMove)が一致し、かつ持ち時間の中**にいる時だけ生きている。
 * 時間で自然に死ぬ形にしてあるのは、**技が中断される経路が多数あるため**——
 * 出口ごとに「計画を消す」を書いて回ると、必ずどこか1つ書き忘れる(このプロジェクトで
 * 繰り返し起きている型の事故)。持ち時間で切れるなら書き忘れようがない。
 */
export const isSwordLungeLive = (
  plan: SwordLungePlan | undefined, forMove: string, now: number,
): plan is SwordLungePlan =>
  plan !== undefined && plan.forMove === forMove && now < plan.startAt + plan.durMs;

/** 今のボス中心。慣性(加速→減速)を効かせた位置。 */
export const swordLungeCenterAt = (plan: SwordLungePlan, now: number): { x: number; y: number } => {
  const k = swordLungeEase((now - plan.startAt) / Math.max(1, plan.durMs));
  return { x: plan.fromX + plan.dirX * plan.dist * k, y: plan.fromY + plan.dirY * plan.dist * k };
};
