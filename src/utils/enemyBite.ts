// ★全敵共通の「噛みつき」(社長発案2026-08-25・仕様の正=PACING_PUZZLE.md §12)。
//
// 旧: 敵に**触れた瞬間**にダメージ(予告なし)。前隙200ms+踏み込み30px(SAME_ARENA §7)を入れた結果、
//     プレイヤーが自分から敵へ突っ込む形になり、「なぜ食らったか読めないまま削られる」事故が増えた。
// 新: **30px圏内に入ったら噛みつき台本**。0msで赤く点滅(全敵共通の合図)→300msで踏み込み(反り返り)
//     →200msで前かがみに噛む。**逃げれば空振り**。
//
// ★この台本の3つの掟(どれか1つでも崩すと文法が壊れる):
//  1. **発火の30pxと、噛みの判定の30pxは同じ1つの数**(社長「あくまで当たり判定は30px範囲ね」)。
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

/** 予告した円の中にプレイヤーが居るか(掟2: 敵の実位置は見ない)。 */
export const isInBiteCircle = (
  biteX: number, biteY: number, pcx: number, pcy: number, rangePx: number,
): boolean => {
  const dx = pcx - biteX, dy = pcy - biteY;
  return dx * dx + dy * dy <= rangePx * rangePx;
};
