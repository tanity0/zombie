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
import { LICH_BLINK_WINDUP_MS, LICH_BLINK_BITE_MS } from './lichBlink';

export interface BiteSpec {
  /** 発火と判定に共通で使う半径(px)。★2つに割らないこと。 */
  rangePx: number;
  /** 溜め(踏み込みながら反り返る)ms。 */
  windupMs: number;
  /**
   * ★踏み込みが走り切るまでの時間(ms)。PACING_PUZZLE.md §16-D(社長指示2026-09-19
   * 「距離詰めてから噛みつくまでに0.3秒の停止を入れて」)。
   * 省略時は `windupMs` と同じ扱い(=踏み込みが溜めをいっぱいまで使う・従来どおり)。
   * `lungeMs < windupMs` の場合、`lungeMs` 地点で踏み込みが止まり、`windupMs` まで
   * (`windupMs − lungeMs` ぶん)**完全に静止**してから噛み(`biteMs`)へ入る(`biteLungeFrac`)。
   * ★既定はwindupMs=省略した型は1ビットも変わらない(D-2)。
   */
  lungeMs?: number;
  /** 噛み(前かがみに突っ込む)ms。合計 = windupMs + biteMs。 */
  biteMs: number;
  /** 踏み込みで詰める見た目の距離(px)。判定は伸びない(掟1)。 */
  lungePx: number;
  /**
   * 噛んだ後、次の噛みつきに入れるまでの時間(ms)。0だと外した敵が即座に構え直す。
   * ★このうち**先頭 `BITE_RECOVER_STILL_MS` は本当に動けない硬直**で、残りが再発火のCD。
   */
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
  // ★社長裁定2026-08-25「噛みつきはやはり紫にする」。当初は「一旦カウンター可の赤。あまりに簡単に
  // なったら紫にする可能性もあり」という条件付きの赤で、その条件が引かれた形。
  // 紫=カウンター不可(CLAUDE.md 色と形の文法②)。**点滅の色も紫に揃える**(pixiScene の biteTint)。
  counterable: false,
};

/**
 * 敵ごとの上書き(既定と違う所だけ書く)。社長「変わるのは今後調整だけど、
 * 30pxの範囲と、500msのスピードかなー」+「踏み込みも敵によって変動するかも」。
 */
export const BITE_BY_TYPE: Partial<Record<EnemyType, Partial<BiteSpec>>> = {
  /**
   * ★600msへ復帰(PACING_PUZZLE.md §16-8・社長裁定2026-09-16「4は戻して様子見」)。
   *
   * 一時 10_000ms(社長指示2026-09-16「ゾンビ噛みつきのクールダウン10秒で」)にしていたが、
   * それは §16(雑魚の「詰めさせない技」)を足す前の暫定だった。10_000 は社長指示だったので
   * 設計者の判断では覆せない(整合監査A-8)——今回は社長裁定で明示的に600msへ戻し、実機を見る。
   * §16のゾンビ赤2連(z-bite1/z-bite2)は別枠(この既定値を経由しない・state machineが直接焼く)。
   */
  /**
   * ★§16-D(社長指示2026-09-19「距離詰めてから噛みつくまでに0.3秒の停止を入れて」)。
   * windupMsを300→600へ延ばし、踏み込みは先頭のlungeMs=300で走り切って、残り300ms
   * (=windupMs−lungeMs)を完全に静止してから噛む(biteMs/lungePx/recoverMsは変えない)。
   * ★対象は§12の噛みつき(この型オーバーライド)だけ——`zombie-double`(z-bite1/z-bite2)は
   * BITE_BY_PHASE側で`lungeMs`を自分のwindupMsと同値に上書きして打ち消してある(§16-D D-3)。
   */
  zombie: { recoverMs: 600, windupMs: 600, lungeMs: 300 },
  /**
   * ★リッチ(§16-B B-5・v0.25.4447)。既定の600msでは、**硬直350ms+消滅260ms+出現**でCDがほぼ
   * 使い切られ、着地した時にはもう次の噛みへ走り出す=社長の言う「**CD中は**帯で保つ」の
   * 「CD中」が存在しない。転移して**離れている時間**が見えるだけの長さを置く。
   * **叩き台(実機で社長が詰める)**: 3000ms。内訳の目安は 790ms(硬直+転移)+ 約2.2秒の待ち。
   */
  lich: { recoverMs: 3000 },
  /**
   * ★§16-E E-3(社長指示2026-09-19「武器を構えて一瞬止まる」)。骸骨だけが「止まる拍」を
   * 持っていなかった(コウモリ=`BAT_WINDUP_STILL_MS`/ゾンビ=§16-D `lungeMs` で既にある)ので、
   * 骸骨にも足す。**`windupMs`(300)は変えない**——同じ300msの内訳を割るだけ。
   * `lungeMs: 180` = 踏み込みは180msで走り切り、残り120ms(= windupMs − lungeMs)を完全に静止。
   * 「速く詰めて、止まってから来る」。`lungePx`/`biteMs` も変えない(総尺は不変)。
   */
  skeleton: { lungeMs: 180 },
  /**
   * ★★**強個体3種**(蜘蛛・削岩型・伐採人 = `isPumpkinTier`)の溜めを **300 → 600ms** へ
   * (社長報告2026-09-25「**削岩機…噛みつきではなく、重なっただけでダメージ食らってる気がする**」
   *  → 調べたら**接触ダメージは残っていなかった**(平時に触れて痛いのは死神/使者/幻影の3型だけ)。
   *  正体は**既定の溜めが0.3秒しかないこと**——詰めの速い型ほど「重なった瞬間に食らった」に見える。
   *  社長裁定2026-09-25「推薦で」)。
   *
   * ★**形はゾンビと同じ**(§16-D 社長指示2026-09-19「距離詰めてから噛みつくまでに0.3秒の停止を入れて」):
   * 踏み込みは先頭の `lungeMs=300` で走り切り、残り300msを**完全に静止**してから噛む。
   * ⇒ 「詰めてくる」と「噛みにくる」が分かれて読める。噛み・間合い・CD・踏み込み距離は**変えていない**。
   *
   * ★**区分で固める**(CLAUDE.md「敵の仕様は種類で固める」): 3型は同じ区分(強個体)なので
   * 1型だけ直さない。**表に3行**で、他の型は1ビットも変わらない。
   */
  pumpkin: { windupMs: 600, lungeMs: 300 },
  driller: { windupMs: 600, lungeMs: 300 },
  logger: { windupMs: 600, lungeMs: 300 },
};

/**
 * ★§16(雑魚の「詰めさせない技」・PACING_PUZZLE.md §16-7 穴2)専用の上書き表。
 * `biteSpecFor` は「型」ではなく「いま出している技」(`Enemy.chaffMove`)からこちらを優先して引く
 * (型の表 `BITE_BY_TYPE` の上に**技の表**を重ねる=技単位で spec/色を分ける)。
 * ★『zombie-double』は windup/bite/lunge が1発目/2発目で違う(§16-8)ので、その3つはここに置かず
 * `BITE_BY_PHASE`(下)を `aiPhase`(z-bite1/z-bite2)で重ねる(検収監査A-3・§16-7b「尺の引き方は2段」)。
 * ここには**技として不変**な `recoverMs`/`counterable` だけを置く。
 */
/**
 * ★踏み込みの「接触距離」(社長指摘2026-09-17「敵の攻撃が通り過ぎちゃうことがある(突っ立ってても)」・
 * PACING_PUZZLE.md §16-A「★踏み込みの終点」)。
 *
 * ★設計者の訂正(2026-09-17): 旧規則「`lungePx` が接触距離を超えないこと」(=固定の踏み込み距離)は
 * **誤り**だった。それは踏み込みが接触距離ちょうどから始まる場合しか正しくない——100px圏で発火する
 * bat/skeletonは、旧`lungePx`(接触距離ぎりぎり)のままだと**遠くから出すと大きく手前で止まる**
 * (bat: 100px発火・旧30px・接触距離32px→70pxの位置で止まり40px手前/skeleton: 同様に26px手前)。
 *
 * ★訂正後の規則: 踏み込みは「固定距離」ではなく「**接触距離まで詰める距離**」。**発火の瞬間に
 * `踏み込み距離 = (その時の中心間距離 − 接触距離)` を計算して焼く**(上限つき=`BITE_LUNGE_CAP_PX`)。
 * ⇒終点は常に接触距離。届かないことも、通り抜けることも起きない。この定数はその**引く方**
 * (詰める目標=接触距離)を持つ——旧名`BITE_SAFE_LUNGE_PX`は「踏み込み距離そのもの」という
 * 誤った役割の名だったので、実態(接触距離)に合わせて改名した。
 *
 * ★「発火の瞬間に焼く」は追尾ではない(向きと同じく、距離も発火の1回だけ計算して固定する。
 * 再生中は位置を見直さない=`Enemy.biteLungePx`に焼いて`biteLungeDistanceAtFire`は発火時にだけ呼ぶ)。
 *
 * 接触距離(=体の半幅の和)は `enemyContactBox`(collisionUtils.ts)と**命中判定が実際に使う
 * プレイヤーの矩形**(`playerHitbox`=箱の2/3)から求める。`enemyContactBox`は実描画スプライトのアスペクト比
 * (`texH/texW`)がcontain fitで幅を縮める(このプロジェクトの敵絵は3体とも横長ではなく
 * 縦長=幅が縮む側)。実測値(`file`コマンドでPNGのIHDRを読んだ):
 *   zombie: public/sprites/zombie-common.png 464×640 → aspect=640/464=1.3793
 *   bat:    public/sprites/bat-male.png      368×512 → aspect=512/368=1.3913(ENEMY_VARIANT_SETS.bat[0])
 *   skeleton: public/sprites/skeleton-female.png 452×512 → aspect=512/452=1.1327(ENEMY_VARIANT_SETS.skeleton[0])
 * これらを`setEnemyArtAspect`で登録した状態で`enemyContactBox`を実行し、
 * 幅の半分+プレイヤー半幅(14px)・高さの半分+プレイヤー半幅(14px)のうち**小さい方**
 * (=どの向きから踏み込んでも安全な下限)を接触距離とした:
 *
 * ★★**訂正(2026-09-20・社長報告「プレイヤーより上にいるバット…攻撃が届いてない」)**:
 * 上の導出は**プレイヤーの箱を28px(半幅14)**として計算していた。だが命中判定
 * (`biteBodyOverlapsPlayer` の相手)は **`playerHitbox`=箱の2/3(19px・半幅9.5)** である。
 * ⇒ **半幅を4.5px大きく見積もっていた**ぶん、余裕(1.6〜2.3px)が丸ごと吹き飛び、**3型とも
 * 終点が「重なる限界」の外**になっていた=**踏み込み切っても当たらない**。
 *
 * **正しい限界(半幅9.5で引き直した値)と、旧値の余裕**:
 *   zombie:   **横32.1** / 縦37.9 → 旧35 は余裕 **−2.9**
 *   bat:      **横27.6** / 縦32.4 → 旧30 は余裕 **−2.4**
 *   skeleton: **横33.8** / 縦34.5 → 旧36 は余裕 **−2.2**
 *
 * 終点の実測ばらつきは±10px級(溜めの間は向きだけ追い直すため)なので、**限界から4px以上内側**を
 * 要求する。⇒ zombie **27** / bat **23** / skeleton **29**。
 * ★これは「見たまんまが当たり判定」(CLAUDE.md 攻撃ヴィジュアルの2分類①)の是正であって、
 * 強さの調整ではない。**踏み込みが深くなるぶん、絵の上では敵がより覆いかぶさる**
 * (§12の掟「踏み込み中は壁が開いてプレイヤーへ覆いかぶさる」と同じ向き)。
 * (機械化: `src/utils/enemyBite.test.ts` の「踏み込みの終点」。**旧テストは `PLAYER_HITBOX`=28 を
 *  手写ししていたため、この穴を一度も捕まえられなかった**=`playerHitbox` を通すよう直してある。)
 */
export const BITE_CONTACT_DIST_PX: Record<'zombie' | 'bat' | 'skeleton', number> = {
  zombie: 27,
  bat: 23,
  skeleton: 29,
};

/**
 * ★踏み込み距離の上限(遠くから発火した時に飛びすぎないための帯・PACING_PUZZLE.md §16-A
 * 「上限は要る(遠くから発火した時に飛びすぎないため)」)。値は現在の発火距離+余裕から
 * 設計者が置いた叩き台(bat/skeletonの発火距離100px・ゾンビz-lunge-inの上限75pxに対して):
 * bat 90px / skeleton 90px / zombie 45px。
 */
export const BITE_LUNGE_CAP_PX: Record<'zombie' | 'bat' | 'skeleton', number> = {
  zombie: 45,
  bat: 90,
  skeleton: 90,
};

/**
 * ★踏み込み距離を発火の瞬間に計算する(PACING_PUZZLE.md §16-A「★踏み込みの終点」)。
 * `踏み込み距離 = (その時の中心間距離 − 接触距離)`、下限0(密着より近くからは進まない)・
 * 上限`BITE_LUNGE_CAP_PX`(遠くから発火しても飛びすぎない)。
 * ★追尾ではない: 呼び出し側は**発火した1フレームだけ**これを呼び、結果を`Enemy.biteLungePx`に
 * 焼いて以後は読むだけにする(向き=`biteDirX/Y`と同じ作法)。
 */
export const biteLungeDistanceAtFire = (
  type: 'zombie' | 'bat' | 'skeleton',
  distAtFireCenterPx: number,
): number => {
  const target = distAtFireCenterPx - BITE_CONTACT_DIST_PX[type];
  return Math.max(0, Math.min(BITE_LUNGE_CAP_PX[type], target));
};

/**
 * ★「できるだけシビアに」(社長指示2026-09-17)で bat/skeleton の値を差し替えた。
 * シビアの定義(設計者確定): 「手数が増え、読む時間が減る。ただし読めば必ず返せるし、返せば必ず殴れる」
 * =削るのは**予告の長さ**と**技後CD**だけ。**硬直(プレイヤーの取り分)・同時に構えられる数・
 * 判定/ダメージ量は削らない**(削ると理不尽になる)。
 * - bat: 踏み込みの溜め 350→**250ms**(=windupMs 500→**400ms**。踏み込み150msは不変)。
 *   技後CD 6000→**4000ms**。掴みの拘束500ms・実行220msは不変。
 * - skeleton: 前隙 350→**300ms**。技後CD 5000→**3500ms**。噛み後の硬直500msは**不変**
 *   (社長裁定の値・プレイヤーの取り分)。
 * ★zombie-double はこのバッチの対象外(ゾンビの値は設計チャット側)。
 *
 * ★踏み込みの終点は「体が重なる位置」(社長指摘2026-09-17「攻撃が通り過ぎちゃうことがある
 * (突っ立ってても)」)。★設計者の規則ミスを訂正(同日): 一度は旧85px→`BITE_CONTACT_DIST_PX`
 * (体の大きさから逆算した固定値)へ縮めたが、これは「発火が常に接触距離から始まる」場合しか
 * 正しくなく、**100px圏で発火するbat/skeletonは遠くから出すと大きく手前で止まった**
 * (PACING_PUZZLE.md §16-A「★踏み込みの終点」参照)。
 * ⇒ **`lungePx` を固定値のまま使うのをやめ、発火の瞬間に`biteLungeDistanceAtFire`で
 * (その場の中心間距離 − 接触距離)を計算して`Enemy.biteLungePx`へ焼く**(gameStore.ts側の
 * 各発火点=b-orbit→b-windup/s-arc→s-bite/z-lunge-in→z-bite1/z-stagger→z-bite2)。
 * 下の`lungePx`は**その計算が届かない場合の保険の既定値**(`BITE_CONTACT_DIST_PX`=接触距離
 * そのもの。密着から発火した最悪ケースでも通り抜けない値)として残す。
 */
export const BITE_BY_MOVE: Partial<Record<NonNullable<Enemy['chaffMove']>, Partial<BiteSpec>>> = {
  // bat の掴み(§16-1・§16-8「bat の BiteSpec への写し方」)。
  // windupMs=400(溜め250+踏み込み150。最後の150msで lungePx を出し切る専用曲線=biteLungeFrac側の
  // BAT_WINDUP_STILL_MS分岐)/ biteMs=220(掴み=カウンターの受付幅)。
  // lungePx=保険の既定値(実際は発火時にbiteLungeDistanceAtFireで計算しbiteLungePxへ焼く)。
  'bat-grab': { windupMs: 400, biteMs: 220, lungePx: BITE_CONTACT_DIST_PX.bat, recoverMs: 4000, counterable: true },
  // skeleton の噛み(§16-2・§16-8)。windupMs=300(前隙)/ biteMs=200(噛み=受付幅)。
  // lungePx=保険の既定値(同上)。
  'skel-bite': { windupMs: 300, biteMs: 200, lungePx: BITE_CONTACT_DIST_PX.skeleton, recoverMs: 3500, counterable: true },
  // ゾンビ2連(§16-3・§16-8「ゾンビ 赤の技後CD」)。windup/bite/lungeは1発目/2発目で違うので
  // ここには置かない(BITE_BY_PHASEが重なる)。counterable/recoverMsは2発とも共通=ここで決まる。
  // ★2026-09-17「できるだけシビアに」で 4000→2500ms(§16-8台帳)。
  'zombie-double': { recoverMs: 2500, counterable: true },
  /**
   * ★リッチ「転移噛み」(§16-C・C-7発注文3)。windup 800ms(=溜め1000ms−現れる幅200ms)/
   * biteMs 200ms(=カウンター受付幅・社長裁定2026-09-18「b」)/ counterable:true(赤)。
   * `lungePx: 0` = **踏み込みを出さない**(C-3-b5「その場で1秒硬直」)。lungePxが0なら
   * `biteLungeFrac`が何を返しても移動量=0になる(既存の踏み込み機構を「動かさない」ために使う=
   * 新しい仕組みを増やさない)。
   * `recoverMs`はここでは上書きしない=`BITE_BY_TYPE.lich`(3000ms)がそのまま効く
   * (§16-B B-5で既に間合い保持(`biteReadyAt`)と嚙み合うよう調整済みの値=そのまま再利用する)。
   */
  'lich-blink': { windupMs: LICH_BLINK_WINDUP_MS, biteMs: LICH_BLINK_BITE_MS, lungePx: 0, counterable: true },
};

/**
 * ★bat専用の踏み込み曲線(PACING_PUZZLE.md §16-8「最後の150msでlungePxを出し切る専用曲線」)。
 * windupMs(400ms)の**先頭250msは動かない**(溜め=身を低くするだけ)。**残り150ms(踏み込み)で
 * 一気にlungePxを出し切る**(鋭い立ち上がり=ease-in)。biteMs(掴み220ms)の間は既に伸び切ったまま
 * 留まる(「留まる→離す」の「留まる」)。biteLungeFrac側の分岐で使う(下)。
 * ★シビア反映(2026-09-17)で溜めは350→250ms(踏み込み150msは不変=windupMs総量だけ400msへ縮む)。
 */
export const BAT_WINDUP_STILL_MS = 250;

/**
 * ★ゾンビ2連の1発目/2発目の尺(PACING_PUZZLE.md §16-8・検収監査A-3)。`aiPhase`(z-bite1/z-bite2)で
 * `BITE_BY_MOVE['zombie-double']` の上にさらに重ねる(`biteSpecFor` の第3引数)。
 * windup/biteは台帳の値をそのまま置く(発明しない): 1発目=220/160・2発目=300/200。
 * ★lungePxは実際には`biteLungeDistanceAtFire`が発火時に計算し`biteLungePx`へ焼く(上の
 * `BITE_BY_MOVE`のコメント参照)。ここの`lungePx`は保険の既定値(`BITE_CONTACT_DIST_PX.zombie`)
 * =1発目/2発目とも同じ(通り抜けない制約はどちらの発でも同じ接触距離に縛られるため)。
 */
export const BITE_BY_PHASE: Partial<Record<NonNullable<Enemy['aiPhase']>, Partial<BiteSpec>>> = {
  // ★§16-D D-3「zombie-doubleには掛けない」: BITE_BY_TYPE.zombieのlungeMs:300をそのまま継承すると
  // (z-bite1のwindupMs=220 < lungeMs=300という壊れた値になる)、`lungeMs`をここで自分のwindupMsと
  // 同値に上書きして打ち消す(=踏み込みが溜めをいっぱいまで使う従来どおりの形に戻す)。
  'z-bite1': { windupMs: 220, biteMs: 160, lungePx: BITE_CONTACT_DIST_PX.zombie, lungeMs: 220 },
  'z-bite2': { windupMs: 300, biteMs: 200, lungePx: BITE_CONTACT_DIST_PX.zombie, lungeMs: 300 },
};

/**
 * ★ボス・賞金首の噛みつきの硬直(=CD)。社長の問い2026-08-25「ボスに関しては、CD少なめの
 * 近接台本の扱いになるのかな?」→ そのとおり。**技の合間のつなぎ**として置くので、
 * 雑魚(600ms)より長い CD にする(雑魚の実効周期は台本500ms+硬直600ms=約1.1秒)。
 * 射程は**体の大きさに比例**する既存の式(判定帯+30px)がそのまま効くので、巨大ボスほど自然に広い。
 * 値は叩き台(実機調整前提・社長裁定「まず推薦で入れてみて」)。
 */
/**
 * ★噛みつき直後の**本当に動けない硬直**(社長指摘2026-09-17「**噛みつき直後の硬直があるはずだけど？**」)。
 *
 * ★何が起きていたか: 台帳 `recoverMs` は**「硬直」と書いてあり600ms入っていた**のに、
 * 実装は `biteReadyAt` = **「次の噛みつきを構え始められない」ゲートだけ**で、
 * **移動は1msも止まっていなかった**(参照5箇所を数えて確認: `canStartBite` / `isBiteSubject` /
 * `enemyIdleReason` / 書き込み2箇所。移動を止める経路はゼロ)。**名前と実態がズレていた。**
 *
 * ⇒ 噛みつきも他の技と同じ**3拍**にする: **噛む → 硬直(プレイヤーの取り分) → 戻る**。
 *
 * ★値の根拠: **近接1振り(約368ms)がぎりぎり入る最小**。z-recover を900msへ延ばした時と同じ物差し
 * (§16-A の受け入れ条件)——**「硬直がある」と言えるのは、そこで殴り返せる時だけ**。
 * それ未満だと「止まっているのに手が出せないただの間」になる。
 * `recoverMs`(600)の**内訳**であって合計は変えない: **硬直350 + 再発火CD250**。
 *
 * ★**§16の技(`chaffMove` が立っている)には掛けない**——あちらは専用の硬直相
 * (z-recover / s-recover / b-release)を既に持っており、二重に止めると技が終わらない。
 * ★**訂正(§16-H #H-6・社長裁定2026-09-20)**: 旧版はここに「**中断(カウンター成立・クリ気絶)では
 * 書かない**」と書いていたが、**裁定で覆った**——カウンターは全型に成立するのに硬直が付くのは
 * 雑魚だけ(気絶5秒が `isBossType` を丸ごと外す)だったため。カウンターは
 * `COUNTER_RECOVER_STILL_MS`(下)を使う。
 */
export const BITE_RECOVER_STILL_MS = 350;

/**
 * ★カウンターで弾いた時の硬直(§16-H #H-6/#H-7・社長指摘2026-09-20
 * 「**普通に着地した時より、カウンター後の方が硬直が短い**」)。
 *
 * 噛みつき直後の350msを流用したら、**通常の技後硬直より短くなった**=カウンターを取るほど損、という
 * 逆立ちが起きた。数えた通常硬直(実効値):
 * パンプキンの着地 **1667ms**(`atkUntil(2000)`=÷1.2)/ 汎用ジャンプ(ハンター・研究所Lv3) 833ms /
 * 伐採人の薙ぎ 833ms / 人狼の突進 833ms / **骸骨 500ms**(`s-recover` だけ `atkUntil` を通さず
 * 素の `SKELETON_RECOVER_MS` を足している)/ 削岩型の突き 333ms / 噛みつき直後 350ms。
 *
 * ⇒ **一番長い通常硬直(パンプキンの着地)と同じ数字を採る**=新しい数字を増やさずに
 * 「**カウンターが必ず一番大きく崩す**」を成立させる。★ここは1つのツマミ——長さを変えたい時は
 * この値だけを動かす(`BITE_RECOVER_STILL_MS` は噛みつき側の値なので触らない)。
 * ※雑魚はカウンター成立側が別途 気絶5000ms を書くので、そちらが勝つ(この値が効くのは
 *   気絶の対象外=強個体・ボス級)。
 */
export const COUNTER_RECOVER_STILL_MS = 2000;

export const BITE_BOSS_RECOVER_MS = 1500;

/**
 * ★「型」ではなく「いま出している技」で引く(PACING_PUZZLE.md §16-7 穴2)。
 * `move` を渡すと `BITE_BY_MOVE` が最後に重なる=技単位で spec を分けられる
 * (`counterable` を技だけ true にしても §12 の噛みつきはカウンター可にならない=受け入れ条件14)。
 * `move` を渡さない(または表に無い)場合は従来どおり型基準(§12の噛みつき)。
 *
 * ★第3引数 `aiPhase`(検収監査A-3・§16-7b「尺の引き方は2段」): ゾンビ2連だけは1技2発で尺が違う
 * ので、`move`(='zombie-double')の上にさらに `aiPhase`(='z-bite1'/'z-bite2')を重ねる。
 * bat-grab/skel-bite は技だけで引けるので `aiPhase` は無視される(`BITE_BY_PHASE` に無い)。
 */
export const biteSpecFor = (
  type: EnemyType,
  move?: NonNullable<Enemy['chaffMove']>,
  aiPhase?: Enemy['aiPhase'],
): BiteSpec => ({
  ...BITE_DEFAULT,
  // ★ボス・賞金首は「技の合間のつなぎ」なので硬直(CD)を長めに(社長裁定2026-08-25)。
  ...(isTrueBossType(type) ? { recoverMs: BITE_BOSS_RECOVER_MS } : {}),
  ...(BITE_BY_TYPE[type] ?? {}),
  ...(move ? (BITE_BY_MOVE[move] ?? {}) : {}),
  ...(aiPhase ? (BITE_BY_PHASE[aiPhase] ?? {}) : {}),
});

export type BitePhase = 'none' | 'windup' | 'bite';

/**
 * 今どの区間か。`biteAt` は gameTime 基準(敵側の他のタイマー=rootUntil/stunUntil と同じ系)。
 * 合計を過ぎていれば 'none'(解決済み or 未発火)。
 * ★`aiPhase` を渡す(§16-7b「尺の引き方は2段」・§16-8b手順5申し送り): ゾンビ2連は
 * z-bite1/z-bite2で尺が違う(220/160/40 と 300/200/60)ので、ここを2引数のままにすると
 * z-bite1がデフォルト値(300/200)で解決してしまう(2発目しか正しく動かない)。
 */
export const bitePhaseOf = (
  enemy: Pick<Enemy, 'type' | 'biteAt' | 'chaffMove' | 'aiPhase'>, gameTime: number,
): BitePhase => {
  if (enemy.biteAt === undefined || enemy.biteAt <= 0) return 'none';
  const spec = biteSpecFor(enemy.type, enemy.chaffMove, enemy.aiPhase);
  const t = gameTime - enemy.biteAt;
  if (t < 0) return 'none';
  if (t < spec.windupMs) return 'windup';
  if (t < spec.windupMs + spec.biteMs) return 'bite';
  return 'none';
};

/** 溜め〜噛みの通し進捗 0..1(絵の2拍と赤い点滅の両方がこれを見る)。★aiPhaseの理由はbitePhaseOfと同じ。 */
export const biteProgress = (
  enemy: Pick<Enemy, 'type' | 'biteAt' | 'chaffMove' | 'aiPhase'>, gameTime: number,
): number => {
  if (enemy.biteAt === undefined || enemy.biteAt <= 0) return 0;
  const spec = biteSpecFor(enemy.type, enemy.chaffMove, enemy.aiPhase);
  const total = spec.windupMs + spec.biteMs;
  return Math.max(0, Math.min(1, (gameTime - enemy.biteAt) / total));
};

/**
 * 踏み込みの**見た目の**進み具合 0..1。
 * ★プレイヤーの踏み込み(初速最大→減衰=素早く避ける)とは**逆の形**にする:
 * こちらは溜めなので**ゆっくり出て、噛む瞬間に伸び切る**(反り返り→解放)。
 * 慣性の掟(CLAUDE.md)=加減速のない動きは作らない。
 * ★aiPhaseの理由はbitePhaseOfと同じ(ゾンビ2連のlungePxが40/60で分かれる=この関数が呼び手側の
 * 実移動量の元になる。§16-8b手順5申し送り「2箇所に aiPhase を渡すこと」の1つ)。
 */
export const biteLungeFrac = (
  enemy: Pick<Enemy, 'type' | 'biteAt' | 'chaffMove' | 'aiPhase'>, gameTime: number,
): number => {
  const spec = biteSpecFor(enemy.type, enemy.chaffMove, enemy.aiPhase);
  if (enemy.biteAt === undefined || enemy.biteAt <= 0) return 0;
  const t = gameTime - enemy.biteAt;
  if (t <= 0) return 0;
  if (t >= spec.windupMs + spec.biteMs) return 1;
  // ★bat専用(PACING_PUZZLE.md §16-8「最後の150msでlungePxを出し切る専用曲線」): 溜め
  // (先頭 BAT_WINDUP_STILL_MS ぶん)は動かず、残りの踏み込み(windupMs-BAT_WINDUP_STILL_MS)で
  // 一気に伸びる(ease-in=鋭い立ち上がり)。掴み区間(bite)は既に伸び切ったまま留まる。
  if (enemy.type === 'bat' && enemy.chaffMove === 'bat-grab') {
    if (t < BAT_WINDUP_STILL_MS) return 0;
    if (t < spec.windupMs) {
      const lungeMs = Math.max(1, spec.windupMs - BAT_WINDUP_STILL_MS);
      const u = (t - BAT_WINDUP_STILL_MS) / lungeMs;
      return u * u; // 鋭い立ち上がり(一気に)
    }
    return 1; // 掴み中(留まる)
  }
  // ★§16-D(社長指示2026-09-19): 踏み込みは`lungeMs`で走り切り、溜めの残り(windupMs−lungeMs)は
  // 完全に静止する。`lungeMs`省略時(既定=windupMs)は静止区間が0msになり、従来と1ビットも変わらない。
  const lungeMs = Math.min(spec.lungeMs ?? spec.windupMs, spec.windupMs);
  if (t < lungeMs) {
    // 溜め(踏み込み): ease-in(じわっと出る)。u^2 で立ち上がりを遅くする。lungeMsで走り切る。
    const u = t / lungeMs;
    return u * u * 0.5;               // 踏み込み終わりで半分だけ出ている
  }
  if (t < spec.windupMs) {
    return 0.5;                       // ★静止(詰めたあとの停止・§16-D)
  }
  // 噛み: 残り半分を ease-out で一気に伸ばす(伸び切る)。
  const u = (t - spec.windupMs) / spec.biteMs;
  // ★「行き過ぎて戻る」は撤回(社長指摘2026-09-17「攻撃モーションがビヨンビヨンしてて気持ち悪い」・
  // PACING_PUZZLE.md §16-A「★『行き過ぎて戻る』は撤回」)。旧実装はz-bite2だけeaseOutBack
  // (1.0を超えてから戻る)を使っていたが、**「戻る」ぶんは位置の増分クランプ(`Math.max(0, fNow-fPrev)`。
  // v0.25.3923の暴れ対策=外さない)に捨てられ、実際には「行き過ぎたまま戻らず止まる」だけの
  // 挙動になっていた**(ゴムの跳ねに見える正体)。慣性MUST(CLAUDE.md)は「加速して出て減速して
  // 止まる」であって「行き過ぎて戻る」ではないので、z-bite2も他のaiPhase(z-bite1・§12の噛みつき
  // 全般)と同じ、1.0を超えない素直なease-outに揃える。
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
 *
 * ★PACING_PUZZLE.md §16-7 穴1: §16(雑魚の「詰めさせない技」)の新aiPhaseは**全部**ここに足す
 * (足さないと、`biteAt` が生きている間に aiPhase だけ新フェーズへ進んだ瞬間、
 * `isBiteInterruptedByMove` がそのフェーズを知らずに「技へ入った」と誤読して**赤の技が1フレームで
 * 自滅する**)。この集合は「**既に構えている噛み/技を中断しないか**」だけに使う——
 * 「**新しく§12の紫噛みを構え始めてよいか**」は別の集合(`CHAFF_MOVE_PHASES`・下)を見る
 * (穴1と§16-3の両立には述語を2本に割る必要がある。1本のままだと、新フェーズを足した瞬間に
 * 「構え中に§12の紫噛みが始まる」という別の壊れ方をする)。
 */
const BITE_OK_PHASES = new Set<string>([
  'zpause', 'zrush',
  'b-approach', 'b-orbit', 'b-windup', 'b-lunge', 'b-grab', 'b-release',
  's-crouch', 's-arc', 's-bite', 's-recover', 's-retreat',
  // ★z-lunge-in(検収監査A-2): §16-3で足したゾンビ赤の踏み込み相。§16-7bの反映漏れだった。
  // ★z-recover(§16-3z): 2連の後の硬直。s-recoverと同じ「技の続き」扱い。
  // ★z-retreat(§16-A 7条目): 硬直明けの後退(150pxまで)。s-retreatと同じ扱い。
  'z-wait', 'z-red-pause', 'z-lunge-in', 'z-bite1', 'z-stagger', 'z-bite2', 'z-recover', 'z-retreat',
  // ★lich-blink(§16-C「転移噛み」・C-3-b7): 足さないと、構えた直後に aiPhase が付いた瞬間
  // `isBiteInterruptedByMove` が「技へ突入した」と誤読して構えた噛みが1フレームで自滅する。
  'lich-blink',
]);

/**
 * ★§16 の技が持つ aiPhase(=これに入っている間は**新しく**§12の紫噛みを構え始めない)。
 * PACING_PUZZLE.md §16-3「構え中に§12の紫噛みを始めさせない」: bat の円 / skeleton のしゃがみ・
 * 弧 / ゾンビ赤の停止・2連の最中にプレイヤーが30px圏へ入っても、「赤く光っている(かもしれない)敵
 * から紫の噛みが出る」を防ぐ。`w-retreat` は含めない(§16の技ではない=chaffMove/枠を使わない・§16-7b)。
 */
const CHAFF_MOVE_PHASES = new Set<string>([
  'b-approach', 'b-orbit', 'b-windup', 'b-lunge', 'b-grab', 'b-release',
  's-crouch', 's-arc', 's-bite', 's-recover', 's-retreat',
  // ★z-lunge-in(検収監査A-2): 技の頭(chaffMoveが立つ相・§16-7b)なので、新しく§12の紫噛みを
  // 構え始めさせない対象にも入る。
  // ★z-recover(§16-3z): 硬直中も「構えて」いる続き扱い=新しく§12の噛みを始めさせない
  // (硬直中は移動も次の技も入らない、の一部)。
  // ★z-retreat(§16-A 7条目): 後退中も§12の紫噛みを新しく始めない(s-retreatと同じ扱い)。
  'z-wait', 'z-red-pause', 'z-lunge-in', 'z-bite1', 'z-stagger', 'z-bite2', 'z-recover', 'z-retreat',
  // ★lich-blink(§16-C・C-3-b7): 構え中に新しく§12の紫噛みを始めさせない(bat円/skeletonしゃがみ等と同じ扱い)。
  'lich-blink',
]);

/** ★技ではない bossState(=追いかけているだけ)。 */
const BITE_OK_BOSS_STATES = new Set<string>(['chase']);

/**
 * ★「**体をぶつけに行く技**」の実行中か(=接触ダメージが本体なので、噛みつきの対象から外す)。
 *
 * 土台は `enemyMotion` の貫通表(ダッシュ/滞空中は地上物をすり抜ける)。ただし**あちらは
 * 「地上物をすり抜けるか」の表**で、こちらは「**体が武器か**」の表——**同じではない**。
 * 実際、下の4つは体をぶつけに来るのに貫通表には入っていなかった(v0.25.3925 の監査で発覚):
 * トールの突進 / ミゲルの踏み込み / 賞金首(近接型)の突進 / 賞金首の飛び掛かり滞空。
 * これらは**赤い帯や予告を出しているのに接触ダメージだけ失っていた**
 * =CLAUDE.md の絶対禁止「赤いのに当たらない」。
 *
 * ★新しい「体当たり技」を足したら**この表にも足す**(貫通表とは別に持つ)。
 */
const BODY_SLAM_BOSS_STATES = new Set<string>([
  'thor-dash-move',  // トールの突進(赤い体の帯を描いている)
  'mdash-move',      // ミゲルの踏み込み
  'bm-charge',       // 賞金首(近接型)の突進
  'leap-air',        // 賞金首の飛び掛かり(滞空)
]);

// ★検収監査2巡目(A)(2026-08-26・v0.25.3948): 貫通表は「地上物をすり抜けるか」の表で、
// こちらは「体が武器か」の表——同じではない(上のコメントどおり)。**逆向きの差分**(貫通表に
// 居るが体をぶつけに行っていない州)を引く: 偶像の離脱ローリング(idol-roll)は逃げる移動であって
// 攻撃ではないのに、表の流用で「触れたら痛い+受け流し可」になっていた。
const PASS_THROUGH_NOT_BODY_SLAM = new Set<string>(['idol-roll']);

/**
 * gameStore.ts の `ZOMBIE_RUSH_MS`(2000ms=zrushの継続尺)の複製。循環import回避のため値を
 * 複製する(`MELEE_RADIUS_MIRROR` 等と同じ確立済みの作法。enemyBite.tsはgameStore非依存)。
 */
const ZOMBIE_RUSH_MS_MIRROR = 2000;

/**
 * ★「追尾の終わり際」(PACING_PUZZLE.md §16-3・§16-8「ゾンビ『追尾の終わり際』」)。
 * zrush開始からこの尺を過ぎたら体当たり判定を降ろし、§12の噛みを構えさせる(甲2)。
 * gameStore.ts の状態機械(zrush開始から1600ms経過で必ず`biteAt`を焼く)も**この値を共有する**
 * (唯一のexport元=ここ。2箇所が別々の定数を持つと閾値がズレる)。
 */
export const ZOMBIE_RUSH_BODY_SLAM_MS = 1600;

/**
 * ゾンビの zrush(2倍速追尾)は開始から `ZOMBIE_RUSH_BODY_SLAM_MS` 未満だけ体当たり判定を持つ
 * (§16-3「追尾の終わり際」)。開始時刻は専用フィールドを増やさず `aiPhaseUntil`(=開始+2000ms)
 * から逆算する(gameStore.ts側もzrush中は他の系がaiPhaseUntilを書き換えないので正確に一致する。
 * ★理由と代替案は §16-3 落とし穴⑫に記載——専用フィールドを持つ案もあったが、既存の
 * aiPhaseUntil から一意に求まるため増設を避けた)。
 * ★`biteAt` が立っている間(噛みの構え〜実行中)は体当たりではなく噛みの判定に譲る(2つの判定が
 * 同時に有効だと「噛みの窓なのに体当たりでも減る」という二重ダメージ源になるため)。
 */
const isZombieRushBodySlamNow = (
  enemy: Pick<Enemy, 'type' | 'aiPhase' | 'aiPhaseUntil' | 'biteAt'>, gameTime: number,
): boolean => {
  if (enemy.type !== 'zombie' || enemy.aiPhase !== 'zrush') return false;
  if (enemy.biteAt !== undefined && enemy.biteAt > 0) return false;
  const startedAt = (enemy.aiPhaseUntil ?? 0) - ZOMBIE_RUSH_MS_MIRROR;
  return (gameTime - startedAt) < ZOMBIE_RUSH_BODY_SLAM_MS;
};

/**
 * ★`gameTime` を受け取るようにした(PACING_PUZZLE.md §16-7b・実装者視点監査A-3)。
 * ゾンビの「zrush開始から1600ms未満は体当たり判定」(§16-3「追尾の終わり際」)をここに実装する
 * (§16-8b手順5=ゾンビの実装バッチの仕事)。
 * ★貫通は付けない(§16-3「isBodySlamNow(触れたら痛い)とisPassThroughPhase(壁を貫通する)は
 * 別の概念として書く」): `isZombieRushBodySlamNow` は `isPassThroughPhase` の表に足さず、
 * 独立した分岐として素通りで返す(zrushはPASS_THROUGH_PHASESに入っていないままなので、
 * ゾンビは木・壁をこれまでどおりすり抜けない)。
 */
export const isBodySlamNow = (
  enemy: Pick<Enemy, 'type' | 'aiPhase' | 'aiPhaseUntil' | 'biteAt' | 'bossState'>,
  gameTime: number,
): boolean => {
  if (enemy.bossState !== undefined && PASS_THROUGH_NOT_BODY_SLAM.has(enemy.bossState)) return false;
  if (isZombieRushBodySlamNow(enemy, gameTime)) return true;
  return isPassThroughPhase(enemy.aiPhase)
    || isPassThroughBossState(enemy.bossState)
    || (enemy.bossState !== undefined && BODY_SLAM_BOSS_STATES.has(enemy.bossState));
};

/**
 * ★技が始まったか(=噛みつきの台本を**中断すべき**か)。
 *
 * ★v0.25.3924(社長報告2026-08-25「丸いサークル系の予告技が、本体にしかダメージ判定が
 * なくなっちゃってるかも。赤い判定の中にいるのに、本体とずれた位置に立ってると食らわない」):
 * **真因**——噛みつきの踏み込みは `updateEnemies` の敵ループで**早期returnして位置を書く**。
 * 構えた直後に技へ入ると、その敵は台本が終わるまで**AIの本体を丸ごと飛ばされる**ので、
 * **着地爆発や踏み鳴らしの円(`pumpkinBlasts` への push)が実行されない**=円の判定が消える。
 * よって「技が始まったら噛みつきは中断する」を明示の規則にする。
 */
export const isBiteInterruptedByMove = (
  enemy: Pick<Enemy, 'aiPhase' | 'bossState'>,
): boolean =>
  (enemy.aiPhase !== undefined && !BITE_OK_PHASES.has(enemy.aiPhase))
  || (enemy.bossState !== undefined && !BITE_OK_BOSS_STATES.has(enemy.bossState));

export const isBiteSubject = (
  enemy: Pick<Enemy, 'type' | 'aiPhase' | 'aiPhaseUntil' | 'biteAt' | 'bossState' | 'damage'>,
  isBoss: (t: EnemyType) => boolean,
  gameTime: number,
): boolean => {
  if (isBoss(enemy.type)) return false;
  if ((enemy.damage ?? 0) <= 0) return false;
  // ★接触ダメージが復活するのは「**体をぶつけに行く技**」の最中だけ(社長2026-08-25
  // 「技というのは体をぶつけに行く技ね」)。突進・飛び掛かり・滞空の実行中は**体当たりが技本体**なので、
  // 触れたら痛い側に戻す。レーザー・弾・設置・叫び等は体をぶつけていないので**触れても痛くない**。
  // ★表は発明しない: `enemyMotion` の「ダッシュ/滞空中はオブジェクトを貫通」の表をそのまま使う
  // (=このプロジェクトが既に「体を投げ出している状態」として定義している唯一の場所)。
  if (isBodySlamNow(enemy, gameTime)) return false;
  return true;
};

/**
 * 今このフレームで**新しく構え始められる**か。
 * 拘束(rootUntil)・気絶(stunUntil)中は構えない=**罠で止めた敵は噛んでこない**
 * (拘束の意味が「止める」なので、止まっているのに噛むのは矛盾する)。
 */
/**
 * ★「止まっている/眠っている敵は噛まない」の唯一の述語(v0.25.3925)。
 *
 * 監査で発覚: `canStartBite` は**構え始め**しか見ておらず、**構えた後に**気絶/拘束/持ち上げ/
 * 体勢崩し(紫)が入っても**噛みつきは走り切っていた**。
 * 「黄色く気絶して棒立ちの敵に近づいたら噛まれる」「罠で拘束した敵が噛んでくる」という、
 * 止める効果の意味そのものを壊す挙動になっていた。**構え始めと中断で同じ述語を使う。**
 * `dormant`(眠っている敵)も追加——壁越しに眠ったまま噛んでくる経路があった。
 */
/**
 * ★★時計を間違えていた(社長報告2026-09-19「skeletonが攻撃してこない」の**真因**・実機の
 * `?debug=1` が `STUN` を出したのに**残り時間が空だった**ことから判明)。
 *
 * `liftUntil`(近接フィニッシュの浮き・`MELEE_STUN_LIFT_MS`=420ms)は**`Date.now()` で書かれる**
 * (`gameStore.ts` の3箇所とも `liftUntil: now + …`)。ところがここは **`gameTime`** と比べていた。
 * `gameTime` は出撃からの経過ms(35秒なら約35,000)、`Date.now()` は約1.77e12。
 * ⇒ **一度でも浮かされた個体は、以後 `gameTime < liftUntil` が永久に真**になり、
 *   `canStartBite` が二度と通らない=**その個体は一生噛まない・技も出さない**。
 *   移動は別の判定(`now` で正しく比べている)なので**歩いて回り込むだけ**になる。
 *
 * ⇒ **時計ごとに引数を分ける**。`gameTime` 系=`stunUntil`/`rootUntil`、
 *   `Date.now()` 系=`liftUntil`。呼び手が両方渡す(片方だけにすると同じ事故が戻る)。
 */
export const isBiteFrozen = (
  enemy: Pick<Enemy, 'rootUntil' | 'stunUntil' | 'liftUntil' | 'dormant'>,
  gameTime: number,
  nowMs: number,
): boolean =>
  enemy.dormant === true
  || (enemy.rootUntil !== undefined && gameTime < enemy.rootUntil)
  || (enemy.stunUntil !== undefined && gameTime < enemy.stunUntil)
  || (enemy.liftUntil !== undefined && nowMs < enemy.liftUntil);

export const canStartBite = (
  enemy: Pick<Enemy, 'type' | 'biteAt' | 'biteReadyAt' | 'rootUntil' | 'stunUntil' | 'liftUntil' | 'dormant' | 'aiPhase' | 'bossState'>,
  gameTime: number,
  /** ★`liftUntil` は Date.now 系(§isBiteFrozen の注記)。時計を混ぜないため呼び手が両方渡す。 */
  nowMs: number,
): boolean => {
  // ★ゾンビの噛みつきは**立ち止まりが引き金**(社長指示2026-09-16「ゾンビ、立ち止まったら
  // かならずダッシュ噛みつき発動で」)。停止(zpause)が明けて突進(zrush)へ移る**その瞬間に、
  // 距離を見ずに必ず**構える=`canZombieRushBite` を store 側の状態機械が呼ぶ。
  // ここ(距離で見る汎用の発火)は**突進中の2回目以降**を拾う経路として残す。
  // ★ゾンビは「ダッシュ中が噛みつき」(社長指示2026-08-29「ゾンビはダッシュ中が噛みつきで」)。
  // 構え**始められる**のは zrush(2秒間2倍速の突進)中だけ——突進で飛び込んだ勢いのまま噛む。
  // 歩き接近・停止(zpause)中は構えない。台本そのもの(紫点滅→溜め→前かがみ)は全敵共通のまま。
  // なお v0.25.3919 の裁定は逆(zrush中は構えない=「止まる→噛む→走る」。当時の理由=突進が
  // 一度も走らなくなる)。本指示で更新: 突進が噛みつきの運び手になるので、突進の走りが
  // 噛みで削れるのは仕様どおり。停止側で噛まなくなるぶん「止まった瞬間に噛む」も消える。
  if (enemy.type === 'zombie' && enemy.aiPhase !== 'zrush') return false;
  // ★§16(雑魚の「詰めさせない技」)の構え中/技中は§12の紫噛みを新しく始めない
  // (PACING_PUZZLE.md §16-3「構え中に§12の紫噛みを始めさせない」・§16-7 穴1)。
  // ★`isBiteInterruptedByMove`(下)とは**別の集合**を見る——あちらは「既に構えている噛みを
  // 中断しないか」で§16の新フェーズを**許す**必要があり、こちらは「新しく構え始められるか」で
  // §16の新フェーズを**弾く**必要があるため、1つの集合を共有すると両立しない(穴1)。
  if (enemy.aiPhase !== undefined && CHAFF_MOVE_PHASES.has(enemy.aiPhase)) return false;
  // ★技を出している最中は構え始めない(噛みつきは**技の合間のつなぎ**)。
  // 接触ダメージの有無(上の `isBiteSubject`)とは**別の話**なので、判定もここに分けて置く——
  // レーザー中の敵は「触れても痛くない(接触なし)」が「噛みつきも始めない」。
  if (isBiteInterruptedByMove(enemy)) return false;
  if (enemy.biteAt !== undefined && enemy.biteAt > 0) return false;      // もう構えている
  if (gameTime < (enemy.biteReadyAt ?? 0)) return false;                 // 硬直中
  if (isBiteFrozen(enemy, gameTime, nowMs)) return false;
  return true;
};

/**
 * ★ゾンビが「立ち止まり明け」に必ず噛めるか(社長指示2026-09-16
 * 「ゾンビ、立ち止まったらかならずダッシュ噛みつき発動で」)。
 *
 * `canStartBite` との違いは2つだけ:
 *   ①**距離を見ない**(呼び側が距離を見ない=停止そのものが引き金だから)。
 *   ②**aiPhase を見ない**(これから zrush へ移る瞬間に呼ばれるため)。
 * 止める効果(気絶/拘束/持ち上げ/眠り)と硬直と二重構えは**同じ述語を通す**——
 * ここを緩めると「黄色く気絶して棒立ちの敵が噛んでくる」が戻る(v0.25.3600台の事故)。
 */
export const canZombieRushBite = (
  enemy: Pick<Enemy, 'type' | 'biteAt' | 'biteReadyAt' | 'rootUntil' | 'stunUntil' | 'liftUntil' | 'dormant' | 'aiPhase' | 'bossState'>,
  gameTime: number,
  /** ★`liftUntil` は Date.now 系(§isBiteFrozen の注記)。時計を混ぜないため呼び手が両方渡す。 */
  nowMs: number,
): boolean => {
  if (enemy.type !== 'zombie') return false;
  if (isBiteInterruptedByMove(enemy)) return false;
  if (enemy.biteAt !== undefined && enemy.biteAt > 0) return false;   // もう構えている
  if (gameTime < (enemy.biteReadyAt ?? 0)) return false;              // 硬直中
  if (isBiteFrozen(enemy, gameTime, nowMs)) return false;
  return true;
};

/**
 * 噛みの解決フレームか(台本の合計を過ぎた最初のフレーム)。解決したら `biteAt` を0へ戻す。
 * ★aiPhaseの理由はbitePhaseOfと同じ(ゾンビ2連のz-bite1がこれを2引数で見ると尺500ms=
 * 実際の380msより120ms遅く解決してしまう)。
 */
export const isBiteResolveDue = (
  enemy: Pick<Enemy, 'type' | 'biteAt' | 'chaffMove' | 'aiPhase'>, gameTime: number,
): boolean => {
  if (enemy.biteAt === undefined || enemy.biteAt <= 0) return false;
  const spec = biteSpecFor(enemy.type, enemy.chaffMove, enemy.aiPhase);
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
  enemy: Pick<Enemy, 'type' | 'biteAt' | 'chaffMove' | 'aiPhase'>, gameTime: number,
): boolean => bitePhaseOf(enemy, gameTime) !== 'none';

/**
 * ★点滅が今「明るい側」か(社長裁定2026-08-26「溜め300msの間に2回点滅にまとめで」)。
 *
 * 経緯: 一度は**モーションの手前に予告(lead 400ms)を足す**形にしたが(v0.25.3931)、
 * **溜めの中に2回まとめる**形へ確定。台本は元どおり **溜め300ms → 噛み200ms** の通し500ms。
 * 尺(=溜め)を2等分して各回の前半55%を明側にする=**はっきり2回光る**。
 * **噛みの区間(後半200ms)では光らない**——そこは動きだけで読ませる。
 */
export const biteBlinkOn = (
  enemy: Pick<Enemy, 'type' | 'biteAt' | 'chaffMove' | 'aiPhase'>, gameTime: number,
): boolean => {
  if (bitePhaseOf(enemy, gameTime) !== 'windup') return false;
  const spec = biteSpecFor(enemy.type, enemy.chaffMove, enemy.aiPhase);
  const t = gameTime - (enemy.biteAt ?? 0);
  const cyc = Math.max(1, spec.windupMs / 2);
  return (t % cyc) < cyc * 0.55;
};

/** 予告した円の中にプレイヤーが居るか(掟2: 敵の実位置は見ない)。 */
export const isInBiteCircle = (
  biteX: number, biteY: number, pcx: number, pcy: number, rangePx: number,
): boolean => {
  const dx = pcx - biteX, dy = pcy - biteY;
  return dx * dx + dy * dy <= rangePx * rangePx;
};

/**
 * 溜め中の点滅の色。**全敵とも紫**(`counterable: false` と一対=CLAUDE.md 色と形の文法②
 * 「紫=カウンターできない攻撃」)。
 *
 * ★経緯(v0.25.4349→v0.25.4350): 社長指示「ダッシュ噛みつき発動のタイミングで赤点滅させてゾンビ」で
 * 一度ゾンビだけ赤にした。その際こちらから「赤は文法上カウンター/回避の対象で、この技は追尾しないので
 * 避けられる。ただしカウンターは**できない**ので、紫へ戻すかカウンター可にするか揃える必要がある」と
 * 上げたところ、**社長裁定は「紫」**(2026-09-16)。よって全敵とも紫へ戻した。
 * **判定は一度も変えていない**(`counterable` はこの間ずっと false)。
 *
 * ★この関数を残してあるのは、**色の出どころを1箇所に保つ**ため(以前は pixiScene に生の
 * `0x9333ea` が直書きされていて、`counterable` と対で切り替える約束が守りにくかった)。
 * 色を変える時はここだけを触り、**同時に `counterable` を見直す**。
 */
export const BITE_BLINK_TINT = 0x9333ea;
/**
 * ★signature は「型」ではなく「いま出している技」でも引けるように広げてある(§16-7 穴2)。
 * ただし§16の技そのものは**この紫tintの経路を通らない**(PACING_PUZZLE.md §16-5「技フィールドが
 * §16の技なら、紫tintの枝を丸ごと飛ばす」=pixiScene側の仕事・別バッチ)。ここは値を変えていない
 * (全敵とも紫のまま=§12は1bitも変えない)。
 */
export const biteBlinkTintFor = (_type: EnemyType, _move?: NonNullable<Enemy['chaffMove']>): number => BITE_BLINK_TINT;
