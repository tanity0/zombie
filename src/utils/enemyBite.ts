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
import { isTrueBossType } from './enemyUtils';
import { isPassThroughPhase, isPassThroughBossState } from './enemyMotion';

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
  lungePx: 30,
  recoverMs: 600,   // 叩き台。0にすると外した敵が即再構えでずっと噛みつき状態になる
  counterable: true, // 一旦カウンター可の赤
};

/**
 * 敵ごとの上書き(既定と違う所だけ書く)。社長「変わるのは今後調整だけど、
 * 30pxの範囲と、500msのスピードかなー」+「踏み込みも敵によって変動するかも」。
 * **空=全敵が既定値**(今はここが正しい状態。調整はここへ足す)。
 */
export const BITE_BY_TYPE: Partial<Record<EnemyType, Partial<BiteSpec>>> = {};

/**
 * ★ボス・賞金首の噛みつきの硬直(=CD)。社長の問い2026-08-25「ボスに関しては、CD少なめの
 * 近接台本の扱いになるのかな?」→ そのとおり。**技の合間のつなぎ**として置くので、
 * 雑魚(600ms)より長い CD にする(雑魚の実効周期は台本500ms+硬直600ms=約1.1秒)。
 * 射程は**体の大きさに比例**する既存の式(判定帯+30px)がそのまま効くので、巨大ボスほど自然に広い。
 * 値は叩き台(実機調整前提・社長裁定「まず推薦で入れてみて」)。
 */
export const BITE_BOSS_RECOVER_MS = 1500;

export const biteSpecFor = (type: EnemyType): BiteSpec => ({
  ...BITE_DEFAULT,
  // ★ボス・賞金首は「技の合間のつなぎ」なので硬直(CD)を長めに(社長裁定2026-08-25)。
  ...(isTrueBossType(type) ? { recoverMs: BITE_BOSS_RECOVER_MS } : {}),
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
/**
 * ★「敵を貫通しないための壁」の箱(社長裁定2026-08-25)。
 *
 * 社長「**攻撃の当たり判定はプレイヤーは歩いて入れる。重なる。(予告線と同じ)**
 * あくまで、敵を貫通しないための**壁判定は固定**」。
 *
 * ★なぜ分けるか(v0.25.3912の失敗): 壁を**敵の当たり判定そのもの(帯)**にしていたため、
 * プレイヤーは帯の外へ押し出され続け、**攻撃の四角(帯+30px)の中に立っていられなかった**
 * =「プレイヤーからぶつかりに行かないと当たり判定がほぼ出ない」。
 * 壁を**足元の小さな固定の箱**にすれば、攻撃の四角は**歩いて入って重なれる領域**になる
 * (予告線と同じ扱い=重なるのが普通で、押し出されない)。
 *
 * 値は叩き台(実機調整前提)。**全ての通常敵で同じ**(社長「固定」)。
 * 足元 = 当たり判定の下辺(このプロジェクトの物の置き方=`obstacles.ts` の footRect と同じ)。
 */
/**
 * ★噛みつきの「中断の逓減」(社長報告2026-08-25「なんどでもノックバックさせれて攻撃あたらん」)。
 *
 * ノックバックで毎回中断できると、**撃ち続けるだけで永久に噛まれない**(ノックバック280msに対し
 * 台本は500ms・硬直600msなので、当て続けている限り一度も成立しない)。
 * かといって中断できないと「攻撃を当てても必ず食らう」に戻る(社長の元の報告)。
 * ⇒ **1回は中断できる。その後この時間だけは"振り切って"噛む**。
 * このプロジェクトの「止める効果は逓減させる」文法(`bossStopDr.ts`)と同じ考え方。
 * 値は叩き台(実機調整前提)。
 */
export const BITE_CANCEL_DR_MS = 3000;

/**
 * ★v0.25.3922(社長報告2026-08-25「ボスに壁判定が無いかも?」): **固定サイズをやめ、体の大きさに比例**
 * させる。24×14 の固定だと、ヨルムンガンドのような巨体では**足元の点にしか壁が無い**=素通しに見える。
 * 係数は**雑魚が今までと同じ大きさになる値**を選んである(ゾンビ 36×36 → 23.8×14.4 ≒ 従来の 24×14)ので、
 * 雑魚の当たり心地は変わらない。下限も従来値に置いて、小さい敵が薄くならないようにする。
 */
export const BITE_WALL_W = 24;   // 下限
export const BITE_WALL_H = 14;   // 下限
export const BITE_WALL_W_FRAC = 0.66;
export const BITE_WALL_H_FRAC = 0.40;

/** 上の「壁」の実体。敵の当たり判定(AABB)の**足元中央**に置く。 */
export const biteWallRect = (
  e: Pick<Enemy, 'x' | 'y' | 'width' | 'height'>,
): { x: number; y: number; width: number; height: number } => {
  const w = Math.max(BITE_WALL_W, e.width * BITE_WALL_W_FRAC);
  const h = Math.max(BITE_WALL_H, e.height * BITE_WALL_H_FRAC);
  return { x: e.x + e.width / 2 - w / 2, y: e.y + e.height - h, width: w, height: h };
};

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
 * - **体をぶつけに行く技の最中**(社長2026-08-25「技というのは体をぶつけに行く技ね」):
 *   突進(`charge`)・飛びかかり(`jump`)・トールの一閃/突き・ミゲルの踏み込み等。
 *   **レーザー/弾/設置/叫びの最中は含まない**——体をぶつけていないので触れても痛くない。
 *   ★ただし**ゾンビの接近リズム(`zpause`→`zrush`)は技ではない**(社長報告2026-08-25
 *   「足が速くなってついてくる攻撃だと思うけど、これも最終的には噛みつきです。
 *   射程に入ったら噛みつきをするっていう台本です」)。旧実装は `aiPhase` が付いているだけで
 *   除外していたため、**ゾンビは近づくと必ず zrush に入る=噛みつきの対象に一度もならなかった**。
 * - **接触ダメージを持たない敵**(plant など damage<=0): 噛ませても0なので触らない。
 * - `isBoss` で渡された型(現在は `isBiteExemptType` = 死神 / 幻影)。
 */
/**
 * ★「技ではない」= 噛みつきの対象であり続ける aiPhase(移動のリズムでしかないもの)。
 * ここに入っていない技(`charge`/`jump` 等)は従来どおり**体当たりが技本体**=接触ダメージを持つ。
 */
const BITE_OK_PHASES = new Set<string>(['zpause', 'zrush']);

/** ★技ではない bossState(=追いかけているだけ)。ここ以外の州は技本体なので噛みつきの対象外。 */
const BITE_OK_BOSS_STATES = new Set<string>(['chase']);

export const isBiteSubject = (
  enemy: Pick<Enemy, 'type' | 'aiPhase' | 'bossState' | 'damage'>,
  isBoss: (t: EnemyType) => boolean,
): boolean => {
  if (isBoss(enemy.type)) return false;
  if ((enemy.damage ?? 0) <= 0) return false;
  // ★接触ダメージが復活するのは「**体をぶつけに行く技**」の最中だけ(社長2026-08-25
  // 「技というのは体をぶつけに行く技ね」)。突進・飛び掛かり・滞空の実行中は**体当たりが技本体**なので、
  // 触れたら痛い側に戻す。レーザー・弾・設置・叫び等は体をぶつけていないので**触れても痛くない**。
  // ★表は発明しない: `enemyMotion` の「ダッシュ/滞空中はオブジェクトを貫通」の表をそのまま使う
  // (=このプロジェクトが既に「体を投げ出している状態」として定義している唯一の場所)。
  if (isPassThroughPhase(enemy.aiPhase) || isPassThroughBossState(enemy.bossState)) return false;
  return true;
};

/**
 * 今このフレームで**新しく構え始められる**か。
 * 拘束(rootUntil)・気絶(stunUntil)中は構えない=**罠で止めた敵は噛んでこない**
 * (拘束の意味が「止める」なので、止まっているのに噛むのは矛盾する)。
 */
export const canStartBite = (
  enemy: Pick<Enemy, 'biteAt' | 'biteReadyAt' | 'rootUntil' | 'stunUntil' | 'aiPhase' | 'bossState'>,
  gameTime: number,
): boolean => {
  // ★突進中(ゾンビの `zrush`=2秒間2倍速)は構えない(社長報告2026-08-25「ゾンビが走ってこなくなった
  // ような?」)。**数字で確認した真因**: ゾンビの絵は幅113px=足元の判定帯が約62px。
  // 噛みつきの射程は「判定+30px」なので、プレイヤーの体(28px)込みで**中心間およそ75px**で発火する。
  // ところがゾンビが停止→突進のリズムに入る距離は `MELEE_RADIUS` = **74px**。**ほぼ同じ**なので、
  // 範囲に入った瞬間に噛みつきが始まり、踏み込み(500ms)が通常の移動を上書きして
  // **2秒の突進が一度も走らなくなっていた**。
  // ⇒ 突進の間は噛まない。「止まる→噛む→走る」の順で両方が出る。
  if (enemy.aiPhase === 'zrush') return false;
  // ★技を出している最中は構え始めない(噛みつきは**技の合間のつなぎ**)。
  // 接触ダメージの有無(上の `isBiteSubject`)とは**別の話**なので、判定もここに分けて置く——
  // レーザー中の敵は「触れても痛くない(接触なし)」が「噛みつきも始めない」。
  if (enemy.aiPhase !== undefined && !BITE_OK_PHASES.has(enemy.aiPhase)) return false;
  if (enemy.bossState !== undefined && !BITE_OK_BOSS_STATES.has(enemy.bossState)) return false;
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

/**
 * ★噛みの瞬間の判定(社長裁定2026-08-25)。
 *
 * 社長「30PXで反応、30PX移動してくる、この際、**壁判定は通過可能になり、当たり判定の瞬間に
 * 被っていたらダメージ**、壁判定に戻す。で繰り返せば?」
 * 「すると、**赤く光った敵がプレイヤーにかぶさってくる形**になる。絵としてわかりやすくなる」
 *
 * ⇒ **専用の当たり判定の四角を持たない**。噛みの瞬間に**敵の体とプレイヤーが重なっていたら**当たり。
 * 絵(赤く光る敵そのもの)と判定が同一なので、「赤いのに当たらない」が原理的に起こらない。
 * 併せて**当たり判定の線は描かない**(社長「興ざめなので」)。
 */
export const biteBodyOverlapsPlayer = (
  enemyBox: { x: number; y: number; width: number; height: number },
  player: { x: number; y: number; width: number; height: number },
): boolean =>
  player.x < enemyBox.x + enemyBox.width && player.x + player.width > enemyBox.x
  && player.y < enemyBox.y + enemyBox.height && player.y + player.height > enemyBox.y;

/**
 * ★噛みつきの踏み込み中は「すり抜け防止の壁」を開ける(社長「この際、壁判定は通過可能になり」)。
 * 開けないと**覆いかぶされない**=踏み込んだ先でプレイヤーを押し出してしまい、
 * 「被っていたらダメージ」が成立しない。噛みが終われば壁は戻る。
 * 踏み込みは**溜めから始まっている**(`biteLungeFrac` は溜めで半分出る)ので、
 * 開けるのは**台本の間ずっと**(溜め+噛み)。
 */
export const isBiteWallOpen = (
  enemy: Pick<Enemy, 'type' | 'biteAt'>, gameTime: number,
): boolean => bitePhaseOf(enemy, gameTime) !== 'none';

/** 予告した円の中にプレイヤーが居るか(掟2: 敵の実位置は見ない)。 */
export const isInBiteCircle = (
  biteX: number, biteY: number, pcx: number, pcy: number, rangePx: number,
): boolean => {
  const dx = pcx - biteX, dy = pcy - biteY;
  return dx * dx + dy * dy <= rangePx * rangePx;
};
