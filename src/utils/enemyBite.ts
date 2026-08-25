// ★全敵共通の「噛みつき」(社長発案2026-08-25・仕様の正=PACING_PUZZLE.md §12)。
//
// 旧: 敵に**触れた瞬間**にダメージ(予告なし)。前隙200ms+踏み込み30px(SAME_ARENA §7)を入れた結果、
//     プレイヤーが自分から敵へ突っ込む形になり、「なぜ食らったか読めないまま削られる」事故が増えた。
// 新: **30px圏内に入ったら噛みつき台本**。0msで赤く点滅(全敵共通の合図)→300msで踏み込み(反り返り)
//     →200msで前かがみに噛む。**逃げれば空振り**。
//
// ★この台本の3つの掟(どれか1つでも崩すと文法が壊れる):
//  1. **判定＝敵のもともとの当たり判定の箱を、プレイヤーが居る側にだけ30px伸ばした四角**
//     (社長2026-08-25「上下左右に30px伸ばすイメージ。100*50の当たり判定を持つ敵なら、
//      上にプレイヤーがいれば上に30px伸ばした範囲(その場合、下左右には伸ばさない)」)。
//     ★**中心からの距離ではない**——中心で測ると体の大きい敵ほど届かなくなる。
//     実際 v0.25.3902 は中心間30pxで見ており、**ゾンビ(36px)は触れても中心間34px**で
//     一生噛めなかった(社長報告「噛みつき、ゾンビとか漏れてるな」)。
//     踏み込み20pxは「距離を詰める見せ方」であって、判定を伸ばす値ではない。
//  2. **判定は"予告した点"で取り、敵が実際にどこに居るかは見ない。** 壁際でも赤い円と判定が
//     絶対にズレない(「赤いのに当たらない/赤くないのに当たる」の禁止)。
//  3. **踏み込みは絵で見せ、敵の当たり判定は動かさない。** 判定を動かすと壁・「行ける帯」の
//     クランプを自前で書くことになり、v0.25.3875 と同型の穴を作る(CLAUDE.md「Visual vs hitbox」)。
import type { Enemy, EnemyType } from '../types/game';

export interface BiteSpec {
  /** 発火と判定に共通で使う半径(px)。★2つに割らないこと。 */
  rangePx: number;
  /** 溜め(踏み込みながら反り返る)ms。 */
  windupMs: number;
  /** 噛み(前かがみに突っ込む)ms。合計 = windupMs + biteMs。 */
  biteMs: number;
  /** 踏み込みで詰める見た目の距離(px)。判定は伸びない(掟1)。 */
  lungePx: number;
  /** 噛んだ後、次の噛みつきに入れるまでの硬直(ms)。0だと外した敵が即座に構え直す。 */
  recoverMs: number;
  /**
   * カウンターできるか。★社長裁定2026-08-25「一旦カウンター可の赤にしようか。
   * あとでカウンター不可の紫にする可能性もあり(あまりに簡単になったら)」。
   * **赤=カウンター可 / 紫=カウンター不可**(CLAUDE.md 色と形の文法)。
   * 切り替えは**この台帳1箇所**で済むようにしてある。
   */
  counterable: boolean;
}

/** 既定値(叩き台・社長指定)。敵ごとの違いは下の上書き表にだけ書く。 */
export const BITE_DEFAULT: BiteSpec = {
  rangePx: 30,
  windupMs: 300,
  biteMs: 200,
  lungePx: 20,
  recoverMs: 600,   // 叩き台。0にすると外した敵が即再構えでずっと噛みつき状態になる
  counterable: true, // 一旦カウンター可の赤
};

/**
 * 敵ごとの上書き(既定と違う所だけ書く)。社長「変わるのは今後調整だけど、
 * 30pxの範囲と、500msのスピードかなー」+「踏み込みも敵によって変動するかも」。
 * **空=全敵が既定値**(今はここが正しい状態。調整はここへ足す)。
 */
export const BITE_BY_TYPE: Partial<Record<EnemyType, Partial<BiteSpec>>> = {};

export const biteSpecFor = (type: EnemyType): BiteSpec => ({
  ...BITE_DEFAULT,
  ...(BITE_BY_TYPE[type] ?? {}),
});

export type BitePhase = 'none' | 'windup' | 'bite';

/**
 * 今どの区間か。`biteAt` は gameTime 基準(敵側の他のタイマー=rootUntil/stunUntil と同じ系)。
 * 合計を過ぎていれば 'none'(解決済み or 未発火)。
 */
export const bitePhaseOf = (enemy: Pick<Enemy, 'type' | 'biteAt'>, gameTime: number): BitePhase => {
  if (enemy.biteAt === undefined || enemy.biteAt <= 0) return 'none';
  const spec = biteSpecFor(enemy.type);
  const t = gameTime - enemy.biteAt;
  if (t < 0) return 'none';
  if (t < spec.windupMs) return 'windup';
  if (t < spec.windupMs + spec.biteMs) return 'bite';
  return 'none';
};

/** 溜め〜噛みの通し進捗 0..1(絵の2拍と赤い点滅の両方がこれを見る)。 */
export const biteProgress = (enemy: Pick<Enemy, 'type' | 'biteAt'>, gameTime: number): number => {
  if (enemy.biteAt === undefined || enemy.biteAt <= 0) return 0;
  const spec = biteSpecFor(enemy.type);
  const total = spec.windupMs + spec.biteMs;
  return Math.max(0, Math.min(1, (gameTime - enemy.biteAt) / total));
};

/**
 * 踏み込みの**見た目の**進み具合 0..1。
 * ★プレイヤーの踏み込み(初速最大→減衰=素早く避ける)とは**逆の形**にする:
 * こちらは溜めなので**ゆっくり出て、噛む瞬間に伸び切る**(反り返り→解放)。
 * 慣性の掟(CLAUDE.md)=加減速のない動きは作らない。
 */
export const biteLungeFrac = (enemy: Pick<Enemy, 'type' | 'biteAt'>, gameTime: number): number => {
  const spec = biteSpecFor(enemy.type);
  if (enemy.biteAt === undefined || enemy.biteAt <= 0) return 0;
  const t = gameTime - enemy.biteAt;
  if (t <= 0) return 0;
  if (t >= spec.windupMs + spec.biteMs) return 1;
  if (t < spec.windupMs) {
    // 溜め: ease-in(じわっと出る)。u^2 で立ち上がりを遅くする。
    const u = t / spec.windupMs;
    return u * u * 0.5;               // 溜め終わりで半分だけ出ている
  }
  // 噛み: 残り半分を ease-out で一気に伸ばす(伸び切る)。
  const u = (t - spec.windupMs) / spec.biteMs;
  return 0.5 + (1 - (1 - u) * (1 - u)) * 0.5;
};

/**
 * 噛む点(=赤い円の中心=判定の中心)。**発火の瞬間に確定して敵へ焼く**。
 * 敵の中心からプレイヤー方向へ `lungePx` 進んだ所。
 */
export const bitePointFrom = (
  ecx: number, ecy: number, pcx: number, pcy: number, lungePx: number,
): { x: number; y: number } => {
  const dx = pcx - ecx, dy = pcy - ecy;
  const d = Math.hypot(dx, dy);
  if (d < 0.001) return { x: ecx, y: ecy };
  return { x: ecx + (dx / d) * lungePx, y: ecy + (dy / d) * lungePx };
};

/** 判定の四角(左上と寸法)。**赤く描く形とまったく同じ**もの。 */
export interface BiteRect { x: number; y: number; w: number; h: number }

/**
 * ★噛みつきの判定範囲(社長2026-08-25)。
 * 敵のもともとの当たり判定の箱を、**プレイヤーが居る側の1辺だけ** `rangePx` 伸ばす。
 * 例: 100×50 の敵の**上**にプレイヤーが居れば、上へ30px伸ばした 100×80 の四角
 * (下・左・右は伸ばさない)。
 *
 * 向きは**縦横のどちらに寄っているか**で決める(|dx| と |dy| の大きい方)。
 * こうすると①体の大きい敵ほど自然に遠くまで届く ②形が四角のままなので**描いた絵と判定が完全に一致**する
 * (「赤いのに当たらない/赤くないのに当たる」を作らない)。
 */
export const biteReachRect = (
  box: { cx: number; cy: number; w: number; h: number },
  pcx: number, pcy: number, rangePx: number,
): BiteRect => {
  const dx = pcx - box.cx, dy = pcy - box.cy;
  const r: BiteRect = { x: box.cx - box.w / 2, y: box.cy - box.h / 2, w: box.w, h: box.h };
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) r.w += rangePx;            // 右へ伸ばす
    else { r.x -= rangePx; r.w += rangePx; } // 左へ伸ばす
  } else {
    if (dy >= 0) r.h += rangePx;            // 下へ伸ばす
    else { r.y -= rangePx; r.h += rangePx; } // 上へ伸ばす
  }
  return r;
};

/**
 * 判定の四角に**プレイヤーの体(矩形)が重なっているか**。**発火時に焼いた四角**で見る(掟2)。
 *
 * ★v0.25.3912(社長報告「今のままだと一生攻撃が当たらない」): 旧実装は**プレイヤーの中心点**で
 * 見ていた。ところが同じ v0.25.3903 で「敵をすり抜けない」=**プレイヤーの体全体**が敵の箱の外へ
 * 押し出されるようになったので、**押し出された体の中心は、体の半分ぶん(14px)だけ必ず遠い**。
 * 「通れない箱(体で押し出す)」と「攻撃の箱(点で判定する)」が食い違っていたのが真因で、
 * **両方を体(矩形)で見れば構造的に一致する**——押し出されて接している=攻撃の箱に必ず重なる
 * (通れない箱 ⊆ 攻撃の箱 なので、これは常に成り立つ)。
 */
export const isInBiteRect = (
  r: BiteRect, player: { x: number; y: number; width: number; height: number },
): boolean =>
  player.x < r.x + r.w && player.x + player.width > r.x
  && player.y < r.y + r.h && player.y + player.height > r.y;

/**
 * ★この敵が噛みつき台本の対象か(=**通常の接触ダメージを持たなくなる敵**)。
 * ここが「噛む側」と「触れたら痛い側」を分ける唯一の境目なので、
 * **接触ダメージを飛ばす判定と、噛みつきを走らせる判定は必ずこの1本を使う**
 * (2箇所に書くと、片方だけ条件が変わって「噛まないのに触っても痛くない敵」が生まれる)。
 *
 * 対象外(=従来どおり触れたら痛い):
 * - **ボス**: 体当たりの意味が違う(社長「技の時は当然当たり判定復活やろ」)。
 * - **技の最中**: 突進(`charge`)・飛びかかり(`jump`)などは体当たりそのものが技。
 *   ★ただし**ゾンビの接近リズム(`zpause`→`zrush`)は技ではない**(社長報告2026-08-25
 *   「足が速くなってついてくる攻撃だと思うけど、これも最終的には噛みつきです。
 *   射程に入ったら噛みつきをするっていう台本です」)。旧実装は `aiPhase` が付いているだけで
 *   除外していたため、**ゾンビは近づくと必ず zrush に入る=噛みつきの対象に一度もならなかった**。
 * - **接触ダメージを持たない敵**(plant など damage<=0): 噛ませても0なので触らない。
 * - **死神の非追跡個体**: 無敵の徘徊体。他の系統でも一律に除外している。
 */
/**
 * ★「技ではない」= 噛みつきの対象であり続ける aiPhase(移動のリズムでしかないもの)。
 * ここに入っていない技(`charge`/`jump` 等)は従来どおり**体当たりが技本体**=接触ダメージを持つ。
 */
const BITE_OK_PHASES = new Set<string>(['zpause', 'zrush']);

export const isBiteSubject = (
  enemy: Pick<Enemy, 'type' | 'aiPhase' | 'damage' | 'reaperChaser'>,
  isBoss: (t: EnemyType) => boolean,
): boolean => {
  if (isBoss(enemy.type)) return false;
  if (enemy.aiPhase !== undefined && !BITE_OK_PHASES.has(enemy.aiPhase)) return false;
  if ((enemy.damage ?? 0) <= 0) return false;
  if (enemy.type === 'reaper' && !enemy.reaperChaser) return false;
  return true;
};

/**
 * 今このフレームで**新しく構え始められる**か。
 * 拘束(rootUntil)・気絶(stunUntil)中は構えない=**罠で止めた敵は噛んでこない**
 * (拘束の意味が「止める」なので、止まっているのに噛むのは矛盾する)。
 */
export const canStartBite = (
  enemy: Pick<Enemy, 'biteAt' | 'biteReadyAt' | 'rootUntil' | 'stunUntil'>,
  gameTime: number,
): boolean => {
  if (enemy.biteAt !== undefined && enemy.biteAt > 0) return false;      // もう構えている
  if (gameTime < (enemy.biteReadyAt ?? 0)) return false;                 // 硬直中
  if (enemy.rootUntil !== undefined && gameTime < enemy.rootUntil) return false;
  if (enemy.stunUntil !== undefined && gameTime < enemy.stunUntil) return false;
  return true;
};

/** 噛みの解決フレームか(台本の合計を過ぎた最初のフレーム)。解決したら `biteAt` を0へ戻す。 */
export const isBiteResolveDue = (
  enemy: Pick<Enemy, 'type' | 'biteAt'>, gameTime: number,
): boolean => {
  if (enemy.biteAt === undefined || enemy.biteAt <= 0) return false;
  const spec = biteSpecFor(enemy.type);
  return gameTime >= enemy.biteAt + spec.windupMs + spec.biteMs;
};

/** 予告した円の中にプレイヤーが居るか(掟2: 敵の実位置は見ない)。 */
export const isInBiteCircle = (
  biteX: number, biteY: number, pcx: number, pcy: number, rangePx: number,
): boolean => {
  const dx = pcx - biteX, dy = pcy - biteY;
  return dx * dx + dy * dy <= rangePx * rangePx;
};
