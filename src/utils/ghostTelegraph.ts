// BOT_AND_GHOST.md §2.12 要件7(回避対応表の全ボス技化)。**守護霊(ghostDriver)専用の予告台帳**。
//
// なぜ別ファイルか: 既存の `botSkill.telegraphDodge` は**テストAI(playtestBot)と共有**の関数で、
// そちらの挙動は今回の発注の対象外(掟「プレイヤー挙動・計測・ボス側は一切変更しない」/ボットも
// 別の仕様)。そこで **botSkill には一切手を入れず**(図形を作る純関数 circleThreat/bandThreat を
// export しただけ=挙動不変)、ゴースト側で「既存表が拾えない予告」だけを足す差分表をここに置く。
//
// 台帳の形(CLAUDE.md「同じ"動作"を持つ全員に付ける」の機械化):
//  - **ボスの予告状態を1つ残らず列挙**し、1件ずつ coverage を付ける。
//      'shared' = 既存 telegraphDodge がその図形を拾う(ここでは何も足さない)
//      'ghost'  = 既存表が拾えない → **この表が足す**
//      'both'   = 既存表も拾うが図形が実態とズレる → ゴーストだけ正しい図形を足す
//      'none'   = 避ける図形が無い/定義できない(硬直・移動・弾・別エンティティ)。理由を必ず書く。
//  - 網羅は `ghostTelegraph.test.ts` が**ソースを走査して突き合わせ**る(状態を1つ足したら
//    テストが落ちる=分類しないとマージできない)。憲法テスト(constitution.test.ts)と同じ流儀。
//
// 掟: **新しい判定を発明しない**(botSkill.telegraphDodge のコメントと同じ)。図形は敵(Enemy)が
// 既に持っているフィールド(aiFromX/aiTargetX/gStompRadius/…)だけから作る。半径/半幅のような
// 「ボス側の実寸」は store 非依存を保つため**複製値**を置く(moveReaction.ts の
// GIANT_STOMP_RADIUS_MIRROR と同じ確立済みの作法)。**回避は安全側に広くて構わない**——
// 判定と厳密に一致させる義務があるのは「赤い絵」の側であって、避ける側ではない。
import type { Enemy } from '../types/game';
import { bandThreat, circleThreat, DODGE_BAND_HALF_WIDTH, type DodgeThreat } from './botSkill';
import { IDOL_SHOT_SLOTS } from './idolScript';
import { MIMIR_BITE_RADIUS } from './bodyCenteredAoe';

/**
 * GHOST-CMD-1B(§2.18-2/-3): この台帳が返す脅威。`shape: 'circle'` = 円形の危険域
 * (circleThreatで作った脅威)で、守護霊の「避け方向の癖」(ghostDriver.ghostDodgeVector)が
 * 単位ベクトルを接線側へ回転させてよい対象。帯(bandThreat)はタグ無し=幾何のまま
 * (横へ降りる一択なので癖の入り込む余地が無い)。DodgeThreat自体(botSkill.ts)は
 * テストボット共用のため触らない=拡張はこちら側で持つ。
 */
export interface GhostDodgeThreat extends DodgeThreat { shape?: 'circle' }

/** circleThreatの結果に円形タグを付ける(nullはそのまま)。 */
const tagCircle = (t: DodgeThreat | null): GhostDodgeThreat | null =>
  t ? { ...t, shape: 'circle' } : null;

// ---- ボス側の実寸の複製値(叩き台ではなく**実装の複製**。元の定数が動いたらここも合わせる) ----
const NOVA_RADIUS_END_MIRROR = 400;      // = gameStore.GIANT_NOVA_RADIUS_END(輪の最大半径)
const DIVE_RADIUS_MIRROR = 220;          // = gameStore.GIANT_DIVE_RADIUS(急降下の着弾円)
// ★複製をやめてimport(v0.25.2893)。旧: 92 の手写しが v0.25.2612 の判定是正(92→216)に取り残され、
// 守護霊が実際の半分以下の円で回避していた(=噛まれる)。bodyCenteredAoe は純関数モジュールなので
// store/hook非依存の掟は破らない。
const MIMIR_BITE_RADIUS_MIRROR = MIMIR_BITE_RADIUS; // = bodyCenteredAoe.MIMIR_BITE_RADIUS(群体の噛みつき円)
const SURIEL_RINGSPIN_RADIUS_MIRROR = 92;// = angelBossTick.SURIEL_RINGSPIN_RADIUS(回転斬りの円)
const SURIEL_BEAM_RANGE_MIRROR = 2600;   // = angelBossTick.SURIEL_BEAM_RANGE(環ビームの射程)
const ACRASIEL_SPIKE_RANGE_MIRROR = 310; // = angelBossTick.ACRASIEL_SPIKE_RANGE_PX(放射8本の長さ)
const ACRASIEL_BURST_RADIUS_MIRROR = 140;// = angelBossTick.ACRASIEL_BURST_RADIUS(大円)
const ACRASIEL_WARP_IMPACT_MIRROR = 92;  // = angelBossTick.ACRASIEL_WARP_IMPACT_RADIUS(転移衝撃)
const IDOL_PUNCH_RANGE_MIRROR = 90;      // = useGameLoop.IDOL_TUNING.shape.punchRange(前方の短い帯の長さ)
// PACING_PUZZLE.md §10(フィル・バッチ2)の複製値 = angelScript.ANGEL_PHILL_TUNING の該当欄。
const PHILL_GOLDRING_RADIUS_MIRROR = 220;  // = PH_T.goldring.radius(金環の大円)
const PHILL_CAGE_START_RADIUS_MIRROR = 260; // = PH_T.cage.startRadius(羽根の檻・回避は安全側に広く=初期半径を使う)
const PHILL_DIVE_RADIUS_MIRROR = 110;      // = PH_T.dive.radius(急降下の着地円)

/** 既存 telegraphDodge がその状態で読む図形(テストのプローブ生成用=「何を根拠に shared と言えるか」)。 */
export type SharedShape = 'band' | 'circle-target' | 'stomp' | 'tri-jump' | 'delayed';

/** ゴースト側で足す図形。`range` 付きの band は aiFrom から aiTarget 方向へ range px 伸ばした線分。 */
export type GhostShape =
  | { kind: 'band'; range?: number }
  | { kind: 'circle-self'; radius: number }
  | { kind: 'circle-target'; radius: number; targetIsTopLeft?: boolean };

export type TelegraphCoverage = 'shared' | 'ghost' | 'both' | 'none';

export interface TelegraphLedgerEntry {
  coverage: TelegraphCoverage;
  sharedShape?: SharedShape;
  ghostShape?: GhostShape;
  /** 状態名が複数ボスで衝突する時の type ゲート(例: 'burst' は裏ボス=弾 / アクラシエル=大円)。 */
  types?: readonly string[];
  note: string;
}

type Ledger = Record<string, TelegraphLedgerEntry>;

const put = (into: Ledger, keys: readonly string[], entry: TelegraphLedgerEntry): void => {
  for (const k of keys) into[k] = entry;
};

const LEDGER: Ledger = {};

// ---- shared: 既存 telegraphDodge が拾う(ここでは何も足さない) ---------------------------------
put(LEDGER, ['g-stomp-windup'], {
  coverage: 'shared', sharedShape: 'stomp',
  note: '足元の円。gStompRadius(ステージ倍率込み)を既存表が読む。',
});
put(LEDGER, ['g-jump-windup', 'g-jump-air', 'jump-windup', 'jump-attack'], {
  coverage: 'shared', sharedShape: 'circle-target',
  note: '着地点の円。既存表が aiTarget 中心の円として拾う(ラフィの溜めは着地点未確定=本体位置へフォールバック)。',
});
put(LEDGER, ['g-trijump-windup', 'g-trijump-air'], {
  coverage: 'shared', sharedShape: 'tri-jump',
  note: '連続ジャンプの残り着地点(gTriJumpPts)を既存表が円で拾う。',
});
put(LEDGER, ['g-nihil-chant1', 'g-nihil-chant2', 'g-nihil-chant3'], {
  coverage: 'shared', sharedShape: 'delayed',
  note: '虚無の三唱は giantDelayedHits の遅延円=既存表がキューを直接読む(唱えている間ずっと見える)。',
});
// §15追尾相パイロット(v0.25.4075): 追尾相は**まだ狙いが定まっていない照準表示**=避ける図形として
// 拾わせない(coverage:'none')。ゴースト/ボットはロック(windup)から反応する=**現行の反応開始と同じ**。
// 追尾相から避け始めさせるか(=ボスの当たりやすさが変わる)は全展開時の裁定(監査A14)。
put(LEDGER, ['g-sweep-track'], {
  coverage: 'none',
  note: '§15追尾相(sweep)。狙いが動いている間は避ける対象にしない=反応はロック(windup)から(現行維持)。',
});
put(LEDGER, [
  // giantbat(城ボス/グレン/EX): 'g-' 接頭辞 + -windup/-active/-charge を既存表が帯として拾う。
  'g-sweep-windup', 'g-sweep-active', 'g-dash-windup', 'g-dash-charge',
  'g-bite-windup', 'g-bite-active', 'g-slam-windup', 'g-slam-active',
  'g-glide-windup', 'g-glide-active', 'g-quad-windup', 'g-quad-charge',
  'g-quad-breath-windup', 'g-quad-breath-active', 'g-wing-windup', 'g-wing-active',
  'g-trishot-windup', 'g-trishot-active',
  'g-sweepbeam-windup', 'g-sweepbeam-active', 'g-talon-windup', 'g-boon-windup',
  'g-reach-windup', // v0.25.3159b: 触手は同時に複数本出るが、帯の始点/終点は最新の1本を写す
  'g-tailslam-windup', 'g-tailslam-active', // v0.25.3139: 尻尾の叩きつけ(帯=aiFrom→aiTarget)
  // bossState 系(トール/天使/裏ボス/idol): 語尾 '-windup' を既存表が帯として拾う。
  'mdash-windup', 'harai-windup', 'tate-windup', 'sweep-windup', 'downslash-windup',
  'thrust-windup', 'ring-move-windup', 'ring-beam-windup', 'dash-windup', 'laser-windup',
  'coil-windup', 'issen-windup', 'tsuki-windup',
  'thor-dash-windup', // v0.25.3780: トールの突進(§4)。裏ボスの dash-windup と同じ流星ライン=語尾ルールで拾える
  // 既存表が状態名で名指ししている実行フェーズ(トール)。
  'harai', 'issen-dash', 'tsuki',
  // PACING_PUZZLE.md §10(フィル・バッチ2): 溜め開始(begin*)でaiFrom/aiTargetをロックする3技の溜め。
  'phill-wingslash-windup', 'phill-wingthrust-windup', 'phill-wingcombo-windup', 'phill-ringtoss-windup',
], {
  coverage: 'shared', sharedShape: 'band',
  note: '始点(aiFrom)→終点(aiTarget)の帯。既存表の語尾ルール/名指しで拾えている。',
});

// ---- ghost: 既存表が拾えない予告(この表が足す本体) ---------------------------------------------
put(LEDGER, [
  // 実行フェーズなのに語尾が '-windup/-active/-charge' でないため既存表の網から漏れていた帯。
  // 帯の始点/終点は溜めで確定済み(実行中もそのまま残る)ので、同じフィールドで拾える。
  'g-bite-hold',   // 噛みつきの"溜め直し"(帯を出したまま静止=学習点)
  'dash',          // 裏ボス3体の突進(mimir/jormungand/skadi)
  'coil',          // ヨルムンガルドの巻き付き薙ぎ
  'mdash-move',    // ミゲルの踏み込み突進
  'thor-dash-move', // v0.25.3780: トールの突進の走り(ミゲル mdash-move と同型=語尾が '-windup' でない実行フェーズ)
  'tate',          // ミゲルの縦払い
  'sweep',         // ラフィ/ウリ/スリィエルの薙ぎ
  'downslash',     // ウリの振り下ろし
  'thrust',        // ウリの刺突(本体が線分上を移動する)
  'idol-roll',     // idolの転がり突進
  'idol-nade',     // idolの手榴弾バックロール(v0.25.3444)。本体は後方へ転がるだけ=判定なしだが帯分類でOK(移動線)
  'idol-snipe', 'idol-snipe-windup', // idolの狙撃線(v0.25.2613)。溜めでロックした帯がそのまま判定。
  // PACING_PUZZLE.md §10(フィル・バッチ2): 溜め明けにblastを積んでからも同じaiFrom/aiTargetの帯が
  // 危険(語尾が-windupでない実行フェーズ=既存表の語尾ルールに乗らない)。
  'phill-wingslash-active', 'phill-wingthrust-active',
  'phill-wingcombo-active1', 'phill-wingcombo-gap', 'phill-wingcombo-active2',
  'phill-ringtoss-out', 'phill-ringtoss-back',
], {
  coverage: 'ghost', ghostShape: { kind: 'band' },
  note: '実行中も帯(aiFrom→aiTarget)が危険。既存表は語尾ルールで拾えないためゴースト側で足す。',
});
put(LEDGER, ['laser-fire'], {
  coverage: 'ghost', ghostShape: { kind: 'band' },
  note: 'ミーミルのレーザー。発射中も aiTarget がゆっくり追尾する=毎tickの帯を読む(避けられる技)。',
});
put(LEDGER, ['ring-active'], {
  coverage: 'ghost', ghostShape: { kind: 'band', range: SURIEL_BEAM_RANGE_MIRROR },
  note: 'スリィエルの環ビーム。危険は aiTarget までではなく射線をビーム射程まで伸ばした線分。',
});
put(LEDGER, ['g-nova-windup', 'g-nova-active'], {
  coverage: 'ghost', ghostShape: { kind: 'circle-self', radius: NOVA_RADIUS_END_MIRROR },
  note: '自己中心に広がる輪。終点(aiTarget)を持たないので既存の帯ルールに掛からない=外へ抜ける向きを足す。',
});
put(LEDGER, ['ring-spin-windup', 'ring-spin'], {
  coverage: 'ghost', ghostShape: { kind: 'circle-self', radius: SURIEL_RINGSPIN_RADIUS_MIRROR },
  note: 'スリィエルの回転斬り=本体中心の近接拒否円。',
});
put(LEDGER, ['spike-windup', 'spike'], {
  coverage: 'ghost', ghostShape: { kind: 'circle-self', radius: ACRASIEL_SPIKE_RANGE_MIRROR },
  note: 'アクラシエルの放射8本(隙間あり)。隙間へ入る読みは持たせず、外へ抜ける安全側の円で扱う。',
});
put(LEDGER, ['burst-windup', 'burst'], {
  coverage: 'ghost', ghostShape: { kind: 'circle-self', radius: ACRASIEL_BURST_RADIUS_MIRROR },
  types: ['acrasiel'],
  note: 'アクラシエルの大円。**裏ボスの同名 burst は弾3連**なので type で分ける(弾は projectileDodge)。',
});
put(LEDGER, ['bite-windup'], {
  coverage: 'ghost', ghostShape: { kind: 'circle-self', radius: MIMIR_BITE_RADIUS_MIRROR },
  types: ['mimir'],
  note: 'ミーミルの群体の噛みつき=本体直下の円AoE(踏み鳴らしと同じ作法)。',
});
put(LEDGER, ['idol-punch-windup'], {
  coverage: 'ghost', ghostShape: { kind: 'circle-self', radius: IDOL_PUNCH_RANGE_MIRROR },
  note: 'idolの殴打。溜め中は向きが未確定なので、届く距離の円として外へ出す(安全側)。',
});
put(LEDGER, ['warp-in'], {
  coverage: 'ghost', ghostShape: { kind: 'circle-target', radius: ACRASIEL_WARP_IMPACT_MIRROR },
  note: 'アクラシエルの転移着地の衝撃円(中心=aiTarget=出現先)。',
});
put(LEDGER, ['phill-goldring-windup'], {
  coverage: 'ghost', ghostShape: { kind: 'circle-self', radius: PHILL_GOLDRING_RADIUS_MIRROR },
  note: 'フィルの金環。頭上の金環→本体中心の大円AoE(外へ逃げるが正解)。blastは溜め明けの1回だけなので'
    + '実行(active)側には危険が残らない=windupだけで足りる。',
});
// ★v0.25.3784: `phill-judgment-windup` の登録は**削除**した(死んだキーを溜めない)。
// v0.25.3740 の社長指示「裁きの光の中身を、羽根の檻に差し替え」で `beginJudgment()` は
// `beginCage()` を呼ぶだけになり、**この州へ入る経路が1つも無くなっている**
// (angelBossTick のハンドラは残っているが誰も遷移させない)。危険の実体は
// `phill-cage-windup`(下で登録済み)側。
put(LEDGER, ['phill-cage-windup'], {
  coverage: 'ghost', ghostShape: { kind: 'circle-target', radius: PHILL_CAGE_START_RADIUS_MIRROR },
  note: '★カウンター必須(羽根の檻)。中心は溜め開始でロック(以後追尾しない=逃げ場なし)。回避は安全側に'
    + '広くて構わないので、収縮後の実際の判定半径(closeRadius)ではなく初期半径(startRadius)を使う。',
});
put(LEDGER, ['phill-dive-windup'], {
  coverage: 'ghost', ghostShape: { kind: 'circle-target', radius: PHILL_DIVE_RADIUS_MIRROR },
  note: 'フィルの急降下。追尾する影マーカー(aiTarget=足元を追う・判定なし)。',
});
put(LEDGER, ['phill-dive-fall'], {
  coverage: 'ghost', ghostShape: { kind: 'circle-target', radius: PHILL_DIVE_RADIUS_MIRROR },
  note: 'フィルの急降下・落下中。着地点(aiTarget=windup明けでロック済み)の円だけが危険=本体の軌跡自体は'
    + '接触判定を持たない(ジャンプ着地レールと同型)。',
});
// PACING_PUZZLE.md §9-4(削岩型・driller): 突きはaiPhase駆動(aiFromX/Y→aiTargetX/Y)だが接頭辞が
// 'g-' でも bossState でもないため、botSkill.telegraphDodge の帯の自動判定(ph.startsWith('g-')/
// bs.endsWith('-windup'))に乗らない。他の非'g-'系windup(idol-roll等)と同じ扱いでこの表に足す。
put(LEDGER, ['driller-thrust-windup', 'driller-thrust-active'], {
  coverage: 'ghost', ghostShape: { kind: 'band' },
  note: '削岩型の突き。帯(aiFrom→aiTarget)が危険。activeは1回だけカプセル判定が積まれた直後だが、'
    + '回避は安全側に広くて構わないので windup と同じ帯のまま扱う(g-bite-active等と同じ作法)。',
});
// PACING_PUZZLE.md §14-2(伐採人・logger): 薙ぎ払いもdriller-thrustと同じ帯駆動(aiFrom→aiTarget=
// 帯の両端。長軸がプレイヤー方向と直交する横帯だが、ghostShape側は座標をそのまま結ぶだけなので
// driller-thrustと同じ扱いで足せる)。
put(LEDGER, ['logger-sweep-windup', 'logger-sweep-active'], {
  coverage: 'ghost', ghostShape: { kind: 'band' },
  note: '伐採人の薙ぎ払い。帯(aiFrom→aiTarget=帯の両端)が危険。activeは1回だけカプセル判定が積まれた'
    + '直後だが、回避は安全側に広くて構わないので windup と同じ帯のまま扱う(driller-thrustと同じ作法)。',
});
put(LEDGER, ['g-dive-windup'], {
  coverage: 'both', sharedShape: 'band',
  ghostShape: { kind: 'circle-target', radius: DIVE_RADIUS_MIRROR, targetIsTopLeft: true },
  note: '急降下。既存表は「消える前の本体→着地点」の帯を出すが、実際の危険は着地点の円だけ=ゴーストは円も足す。',
});

// ---- none: 避ける図形が無い/定義できない(理由を必ず残す) ---------------------------------------
put(LEDGER, [
  'g-stomp-recover', 'g-sweep-recover', 'g-jump-recover', 'g-dash-recover', 'g-bolt-recover',
  'g-bite-recover', 'g-slam-recover', 'g-glide-recover', 'g-dive-recover', 'g-quad-recover',
  'g-nova-recover', 'g-wing-recover', 'g-trishot-recover', 'g-sweepbeam-recover', 'g-talon-recover', 'g-boon-recover',
  'g-reach-recover', 'g-trijump-recover', 'g-nihil-recover', 'g-tailslam-recover',
  'bite-recover', 'bolt-recover', 'bone-recover', 'burst-recover', 'cage-recover', 'coil-recover',
  'consecrate-recover', 'dash-recover', 'downslash-recover', 'gaze-recover', 'harai-recover',
  'idol-aim-recover', 'idol-fan-recover', 'idol-punch-recover', 'idol-roll-recover',
  'idol-snipe-recover', 'idol-orb-recover', 'idol-nade-recover',
  'issen-recover', 'jump-recover', 'lance-recover', 'lantern-recover', 'laser-recover', 'laser-broken', 'mdash-recover',
  'radial-recover', 'ring-recover', 'ring-spin-recover', 'skadi-blade-recover', 'skadi-ice-recover',
  'spear-recover', 'spike-recover', 'sweep-recover', 'tate-recover', 'thrust-recover',
  'tsuki-recover', 'volley-recover', 'warp-recover',
  'thor-dash-recover', // v0.25.3780: トールの突進の硬直(§4)
  'quickblades-recover', // ★v0.25.3784: ラフィの刃2連射の硬直(v0.25.3592)。技は終わっている。
  'driller-thrust-recover', // PACING_PUZZLE.md §9-4(削岩型): 突きの硬直。
  'logger-sweep-recover', // PACING_PUZZLE.md §14-2(伐採人): 薙ぎ払いの硬直。
  // PACING_PUZZLE.md §10(フィル・バッチ2): 硬直(全技共通)+blast溜め明けで既に判定が終わっている実行フェーズ。
  'phill-wingslash-recover', 'phill-wingthrust-recover', 'phill-wingcombo-recover',
  'phill-goldring-active', 'phill-goldring-recover',
  // ★v0.25.3785(検収監査 低J): この2件も `phill-judgment-windup` と**同じく到達不能**
  // (v0.25.3740 で `beginJudgment()` が `beginCage()` を呼ぶだけになり、judgment州へ入る経路が消えた。
  //  angelBossTick.ts のハンドラは残っているが誰も遷移させない)。それでも**台帳から外せない**:
  //  windup は `st === '...'` 形でしか書かれていない=完全性テストの走査に載らないので消せたが、
  //  この2件は `patch.bossState = '...'` の代入として書かれている=**走査が拾う**ため、
  //  外すと「走査で見つかる状態が台帳から漏れている」で落ちる。死にキーではなく「実装が残っている
  //  到達不能キー」として、理由つきで残すのが正しい状態(掃除するならハンドラごと消す=フィル案件)。
  'phill-judgment-active', 'phill-judgment-recover',
  'phill-cage-active', 'phill-cage-recover',
  'phill-ringtoss-recover', 'phill-dive-recover', 'phill-summon-recover', 'phill-feathershot-recover',
], {
  coverage: 'none',
  note: '硬直(技は終わっている)=避ける図形は無い。ここはむしろカウンターの窓側の話。',
});
put(LEDGER, [
  'aim-burst', 'aim-radial', 'radial', 'volley', 'volley-windup', 'bolt', 'bolt-windup',
  // idol-nade-windup(v0.25.3442): 投げ自体に図形なし。転がった手榴弾の赤円はprojectile側の危険=
  // 弾避け(projectileDodge)系の圏内(手榴弾は接触ダメージ無し・爆発は信管2秒後)。
  'gaze-windup', 'idol-aim-windup', 'idol-fan-windup', 'idol-orb-windup', 'idol-nade-windup', 'g-bolt-windup', 'g-bolt-burst',
  'g-tailslam-volley', // v0.25.3139: 叩きつけの後の弾連射(胴体弾と同じ弾)=地面に図形は出ない
  // PACING_PUZZLE.md §10(フィル・バッチ2): 光槍の扇/エルデの流星=共通赤弾のみ(地面に図形なし)。
  'phill-lancefan-windup', 'phill-lancefan-active', 'phill-lancefan-recover',
  'phill-meteor-windup', 'phill-meteor-active', 'phill-meteor-recover',
], {
  coverage: 'none',
  note: '弾を撃つだけの技=地面に図形が出ない。飛んだ弾は projectileDodge が別経路で避ける。',
});
put(LEDGER, [
  'bone', 'bone-windup', 'spear-windup', 'lantern', 'lantern-windup',
  // ★v0.25.3784: ラフィの刃2連射(v0.25.3592・バックロール台本の2手目)。溜め中に地面へ出る
  // 図形は無く(pixiSceneに専用の予告描画が無い=実在確認済み)、危険は spawnSkadiBlade で
  // 撒かれる骨刃そのもの=既存の 'bone-windup' / 'skadi-blade-windup' と同じ別エンティティ族。
  'quickblades-windup',
  'lance-windup', // v0.25.3199/3204 ジブリルの槍: 危険=lanceLanterns(追尾ランタン)+pumpkinBlastsカプセル(別エンティティ)
  'skadi-ice', 'skadi-ice-windup', 'skadi-blade', 'skadi-blade-windup',
  // PACING_PUZZLE.md §10(フィル・バッチ2): 光の雨(小円が時間差でblastsへ積まれる=座標はEnemyに乗らない)・
  // 羽根散弾(専用飛翔体=骨/氷刃と同型)。
  'phill-lightrain-windup', 'phill-lightrain-active', 'phill-lightrain-recover',
  'phill-feathershot-windup', 'phill-feathershot-recover',
], {
  coverage: 'none',
  note: '危険が**別エンティティ**(骨/刃/氷/火)として撒かれる技。Enemyの予告フィールドに乗らないので、'
    + 'この表では扱えない(拾うならエンティティ側の回避=別バッチ)。',
});
put(LEDGER, ['phill-summon-windup'], {
  coverage: 'none',
  note: 'フィルの召喚。判定を持たない技(EX雑魚を呼ぶだけ)=避ける図形がそもそも無い。',
});
put(LEDGER, ['consecrate-windup', 'cage-windup'], {
  coverage: 'none',
  note: 'リング状(自分/プレイヤーを囲む輪の上に置く)。中へ寄るのが正解か外へ抜けるのが正解かが状況依存で、'
    + '一方向の回避ベクトルに落とせない=足すと逆に危険側へ押しかねない。',
});
// 射撃部品(v0.25.2638・BOSS_MAKER.md): 社長がメーカーで足す弾撃ち技。**8枠ぶんを機械的に登録**する
// ——1枠でも手書きで漏らすと「実装したのに台帳に無い」状態になる(v0.25.2426の教訓と同じ形)。
// 分類は既存の弾撃ち技(idol-aim/fan/orb)と同じ `none`: 地面に図形が出ず、危険は飛んだ弾そのもの
// (projectileDodge が別経路で避ける)。連射州(-fire)も同じで、その時点で弾はもう外に出ている。
put(LEDGER, IDOL_SHOT_SLOTS.flatMap(m => [`idol-${m}-windup`, `idol-${m}-fire`]), {
  coverage: 'none',
  note: 'メーカーで足した射撃技。弾を撃つだけ=地面に図形が出ない。飛んだ弾は projectileDodge が避ける。',
});
put(LEDGER, IDOL_SHOT_SLOTS.map(m => `idol-${m}-recover`), {
  coverage: 'none',
  note: '硬直(技は終わっている)=避ける図形は無い。ここはむしろカウンターの窓側の話。',
});
// ★v0.25.3780(research/THOR_ISSEN_REWORK.md §5-3/§5-4): トールの「無の境地」(紫の円)。
// **帯として登録しない**(円であって帯ではない)+**回避脅威にも足さない**(円の中に立っているだけでは
// 何も起きない=ダメージを持たない技)。円が言っているのは「**振るな**」であって「立ち入るな」ではないので、
// 回避ベクトルへ足すと逆に「安全な場所から追い出す」誤った挙動になる。
// 近接を止める側(master/skilled)は botSkill の respectsNihilCircle が別経路で見る(§8-4)。
put(LEDGER, ['issen-nihil'], {
  coverage: 'none',
  note: 'トール「無の境地」=紫の円。判定を持たない予告(ダメージなし・カウンター不可)なので'
    + '避ける図形は無い。危険は次の段(issen-windup の赤帯)。円の中で**近接を振ると必中一閃**が来るが、'
    + 'それは「位置」ではなく「行動」の禁止=回避ベクトルではなく botSkill.respectsNihilCircle が扱う。',
});
put(LEDGER, ['idol-rest'], {
  coverage: 'none',
  note: 'idolの休符(v0.25.2613)。技は出ていない=避ける図形は無い。むしろプレイヤーが殴りに行く州。',
});
put(LEDGER, ['idol-roll-windup'], {
  coverage: 'none',
  note: '溜めの時点では突進先(aiTarget)が未確定=避ける向きが決められない。実行(idol-roll)側で足す。',
});
put(LEDGER, ['warp-windup', 'warp-out'], {
  coverage: 'none',
  note: '転移そのものはダメージを持たない(ジブリルの離脱/アクラシエルの消滅)。危険は着地の warp-in 側。',
});
put(LEDGER, ['chase', 'return', 'backstep', 'orbit-step', 'counter-leap',
  // ★v0.25.3784: ラフィのバックロール(v0.25.3592で追加された台本1手目)。**攻撃判定なし**の
  // 後退移動だけの州(angelBossTick の 'backroll' ハンドラ=smoothstepで後方へ引くだけ)。
  // 既存の backstep / counter-leap と同じ扱い。
  'backroll',
], {
  coverage: 'none',
  note: '移動だけの状態(追跡/戻り/後退/回り込み/カウンター後の跳び退き/バックロール)=攻撃判定を持たない。',
});
put(LEDGER, ['charge', 'crouch', 'jump', 'recover', 'scream', 'windup'], {
  coverage: 'none',
  note: '雑魚(ゾンビ/ウェアウルフ/パンプキン等)の汎用フェーズ。ボスの予告ではなく、'
    + 'chargeDodge/jumpDodge(botSkill)が別経路で扱う=この表では足さない。',
});

/** 予告状態の台帳(状態名 → 分類)。**ボスの予告はここに全て載っている**ことをテストが保証する。 */
export const GHOST_TELEGRAPH_LEDGER: Readonly<Ledger> = LEDGER;

/** その状態が「ボスの予告(危険)」か。§2.12の「危険時(windup中)」判定はこの1関数を正本にする。 */
export const isTelegraphState = (state: string | undefined): boolean =>
  state !== undefined && (GHOST_TELEGRAPH_LEDGER[state]?.coverage ?? 'none') !== 'none';

/**
 * その敵が今「予告を出している」か(= §2.12 要件3/4 の"危険時")。
 * aiPhase(城ボス系)と bossState(トール/天使/裏ボス/idol)の**両方**を見る=実装経路の取りこぼし防止。
 */
export const isTelegraphActive = (
  e: Pick<Enemy, 'aiPhase' | 'bossState'> | null | undefined,
): boolean => !!e && (isTelegraphState(e.aiPhase) || isTelegraphState(e.bossState));

const threatFor = (
  pcx: number, pcy: number, e: Enemy, entry: TelegraphLedgerEntry,
): GhostDodgeThreat | null => {
  const shape = entry.ghostShape;
  if (!shape) return null;
  if (entry.types && !entry.types.includes(e.type)) return null;
  const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
  // GHOST-CMD-1B: 円形はタグを付ける(避け方向の癖の回転対象)。帯はタグ無しのまま。
  if (shape.kind === 'circle-self') return tagCircle(circleThreat(pcx, pcy, ecx, ecy, shape.radius));
  if (shape.kind === 'circle-target') {
    const half = shape.targetIsTopLeft ? { x: e.width / 2, y: e.height / 2 } : { x: 0, y: 0 };
    const tx = (e.aiTargetX ?? e.x) + half.x, ty = (e.aiTargetY ?? e.y) + half.y;
    return tagCircle(circleThreat(pcx, pcy, tx, ty, shape.radius));
  }
  // band: 始点/終点が揃っていない時は図形が確定していない=足さない(でっち上げない)。
  if (e.aiFromX === undefined || e.aiTargetX === undefined) return null;
  const fx = e.aiFromX, fy = e.aiFromY ?? e.y;
  let tx = e.aiTargetX, ty = e.aiTargetY ?? e.y;
  if (shape.range !== undefined) {
    const dx = tx - fx, dy = ty - fy;
    const l = Math.hypot(dx, dy);
    if (l > 0.0001) { tx = fx + (dx / l) * shape.range; ty = fy + (dy / l) * shape.range; }
  }
  return bandThreat(pcx, pcy, fx, fy, tx, ty, DODGE_BAND_HALF_WIDTH);
};

/**
 * **既存 telegraphDodge が拾えない予告**から逃げる向き(0〜2個)。ゴーストの回避ベクトルへ足す差分。
 * 既存表と二重に数えないよう、coverage が 'ghost'/'both' の状態だけを扱う。
 * GHOST-CMD-1B: 円形の脅威には `shape: 'circle'` タグが付く(避け方向の癖の回転対象の目印)。
 * `excludeMoveKey`(省略可能・AI_HUMANIZE.md B2 §2-1・検収是正#4): このキーと一致する州だけを
 * 抑止する(州単位=botSkill.telegraphDodgeのexcludeMoveKeyと同じ考え方)。
 */
export const ghostExtraTelegraphDodge = (pcx: number, pcy: number, e: Enemy, excludeMoveKey?: string): GhostDodgeThreat[] => {
  const out: GhostDodgeThreat[] = [];
  for (const state of [e.aiPhase, e.bossState]) {
    if (state === undefined) continue;
    if (excludeMoveKey !== undefined && state === excludeMoveKey) continue;
    const entry = GHOST_TELEGRAPH_LEDGER[state];
    if (!entry || (entry.coverage !== 'ghost' && entry.coverage !== 'both')) continue;
    const t = threatFor(pcx, pcy, e, entry);
    if (t) out.push(t);
  }
  return out;
};
