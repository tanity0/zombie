// ★サブウェポン「格闘」の敵側の流れ(research/BRAWLER.md §11・§19・社長指示2026-11-08/2026-11-10)。
// 確定の固まり(§19-3: つながっている間、敵は一切動けない)・コンボの区切りと固まらない時間・浮かせ追撃。
// 純関数だけ(store が読んで敵へ書く・pixi は読むだけ)。
// 時計: 流れの数え・浮き・押しは Date.now(敵の hitStunUntil / knockbackUntil と同じ)。
//       確定の固まり(brLockUntil)・コンボの後の固まらない時間(brLockNoHoldUntil)は gameTime(プレイヤーの段・技と同じ時計=
//       全体のスローが途中から掛かっても外れても、続きが当たる時刻とずれない・§19-3 ⑥)。
// ★§19 で撤去した物(2026-11-10): 固まりの減衰(brawlerHoldDecay・BRAWLER_COMBO_DECAY_MS)・同じ技の罰(BRAWLER_SAME_MOVE_PENALTY_MS)・
//   溜めの止め予算(brawlerTechHoldApply・BRAWLER_TECH_HOLD_BUDGET_MS)・5段の確定(brawlerComboInOrder・brawlerChainGuardMs)。
// ★§20 で撤去した物(2026-11-11・フレームで決まるつながり): 続きを出した瞬間の延ばし(brawlerLockExtendPatch)・同じ技2回目は固めない・
//   当てた技の名札(brLockMoves)・余白の定数(BRAWLER_HOLD_FRAME_MARGIN_MS / BRAWLER_CHAIN_GUARD_MARGIN_MS)。
//   固まりは「当たりの瞬間に1回書く(置き換え)」だけ=技ごとの数字(utils/brawler の BRAWLER_HOLD_MS)で決まる。
import type { EnemyType } from '../types/game';
import type { BrawlerMoveKey, BrawlerRouteNode } from './brawlerTypes';
export type { BrawlerMoveKey } from './brawlerTypes';
import { hasStrongIndividualMark, isBossType, isTerminalReaper } from './enemyUtils';
import { POSTURE_ELITE_TYPES } from './bossPosture';
import { isRecoverHoldPhase } from './recoverPhase';
import {
  BRAWLER_LIFT_MS, BRAWLER_TEMPO, BRAWLER_CANCEL_WINDOW_MS, brawlerLiftArcRel, brawlerTempoMs, setBrawlerTempo, brawlerStageSpec, BLAST_LIFT_SHAPE,
  BRAWLER_LIFT_RISE_FRAC, BRAWLER_LIFT_HOVER_FRAC, type LiftArcShape,
  BRAWLER_HOLD_MS, BRAWLER_TECHS, BRAWLER_KICK3_CHARGE_MS, BRAWLER_KICK_HITSTOP_MS, BRAWLER_STOMP_HITSTOP_MS, BRAWLER_KIKO_SPEED, BRAWLER_KIKO_HIT_PAD,
  brawlerRouteAllows,
} from './brawler';

/**
 * 当たりが途切れたら流れ(ダメージ補正の数・バウンドの区切り)を0へ戻す(ms)。
 * ★社長承認2026-11-09 で 600→700(係数1.3で910)。止めを長くした分、3段目→4段目の間(係数1.3で約774ms)が切れに接していたため。
 * ※確定の固まりのコンボ(§19-3 ④)はこの時計では区切らない(敵が固まりでも浮きでもなくなった時=brawlerComboEndPatch)。
 */
export let BRAWLER_COMBO_GAP_MS = 700; // ×BRAWLER_TEMPO(係数1.0の値)
// ★振り払い(殴られ続けた敵の反撃・§11-3)は撤去した(社長指示2026-11-11「格闘の敵の反撃は外して」)。数え・溜めの相・赤い予告・威力ごと無い。

/**
 * ★秘奥義の9連撃の1発の固まり(ms・壁時計・§11-1 の「9連撃の各発 300ms」を今どおり)。秘奥義の間は画面内の敵を §17 の止めが止めているので、
 * これは今までの見え方(のけぞりの留め)を保つためだけに残す。確定の固まり(§19-3)の規則の外(道も区切りも無い)。
 */
export let BRAWLER_SECRET_HOLD_MS = 300; // ×BRAWLER_TEMPO(係数1.0の値)

/** 段の番号(1..5)から名札。 */
export const brawlerStageMoveKey = (stage: number): BrawlerMoveKey =>
  (['s1', 's2', 's3', 's4', 's5'] as const)[Math.max(1, Math.min(5, Math.round(stage))) - 1];
/** 飛び蹴りの何発目か(1..3)から名札。 */
export const brawlerKickMoveKey = (kickN: number, heel = false): BrawlerMoveKey =>
  (heel && kickN >= 3 ? 'heel' : (['kick1', 'kick2', 'kick3'] as const)[Math.max(1, Math.min(3, Math.round(kickN))) - 1]);

/**
 * 区分(CLAUDE.md「敵の仕様は種類で固める」)。強個体=体勢値を持つエリート雑魚(POSTURE_ELITE_TYPES)。
 * `isBossType` は強個体まで含む別目的の表なので、強個体を先に見る(telegraphStyleFor と同じ順)。
 */
export const brawlerComboClass = (type: EnemyType): 'mob' | 'strong' | 'boss' =>
  POSTURE_ELITE_TYPES.has(type) ? 'strong' : isBossType(type) ? 'boss' : 'mob';
/**
 * ★敵1体の区分(格闘・爆発・スラッシャーの浮き・固まりが使う1本・research/BRAWLER.md §14)。
 * 型の区分に加えて、個体の印(赤い個体・宿敵=hasStrongIndividualMark)があれば雑魚の型でも強個体(区分仕様への整合)。
 */
export const brawlerEnemyClass = (e: { type: EnemyType; colorTier?: string; isNamed?: boolean }): 'mob' | 'strong' | 'boss' => {
  const c = brawlerComboClass(e.type);
  return c === 'mob' && hasStrongIndividualMark(e) ? 'strong' : c;
};
/** ★浮きの区分。null=浮かない(終端の死神=深奥チェイサーは、格闘・爆発・スラッシャーのどれでも浮かない)。 */
export const brawlerLiftClass = (e: { type: EnemyType; colorTier?: string; isNamed?: boolean; reaperChaser?: boolean }): 'mob' | 'strong' | 'boss' | null =>
  isTerminalReaper(e) ? null : brawlerEnemyClass(e);

/**
 * ★格闘の固まり・止めが「技を出している最中」として除外する相(社長実機報告2026-11-08「まだ攻撃で敵が止まるのは一切入ってないね?」)。
 * `combatFeel.isEnemyAttacking` は aiPhase が付いていれば全部「攻撃中」と見る(スーパーアーマー・押しの決まり=そちらは変えない)。
 * ところが雑魚は、近くに居る間ほぼ常に**移動・待ち・後退・様子見の相**(ゾンビの zpause/zrush など)に居るので、
 * それを使うと殴っている敵が一度も固まらなかった。格闘はこの表で「本当に技を出している最中」だけを除外する。
 *
 * 固める相(=技ではない。固めている間はその相の時計も止まり、明けたら続きから):
 *  - ゾンビ: zpause(立ち止まり)/ zrush(速足で寄る)/ z-wait(帯で待つ)/ z-recover(2連の後の硬直)/ z-retreat(後退)
 *  - コウモリ: b-approach(走り寄る)/ b-orbit(回る)/ b-release(離して後ずさる)
 *  - 骸骨: s-crouch(弧の前のしゃがみ・赤はまだ出ない)/ s-recover(噛みの後の硬直)/ s-retreat(後退)
 *  - パンプキン型・自転車: crouch(跳ぶ前のしゃがみ・赤はまだ出ない)/ recover(着地の硬直)/ dash-recover(突進の後の硬直)/ w-retreat(走り去る)
 *  - 削岩型・伐採人: driller-thrust-recover / logger-sweep-recover(技の後の硬直)
 *  - ★**技の後の硬直は全部**(社長指示2026-11-09「技を出し終えた隙に殴って固める=確定反撃」): 綴りの規則 `isRecoverHoldPhase`
 *    (`*-recover`・`recover`・`b-release`)。城ボスの g-*-recover も入る。止めている間は硬直の残りも止まり、明けたら続きから(utils/enemyClocks)。
 * ボス(bossState): 追いかけ(chase)・帰り(return)・技の後の硬直(`*-recover`)・休み(BRAWLER_HOLDABLE_BOSS_STATES)は固める。それ以外は技の最中。
 * 技の最中(固めない): 予告の溜め・攻撃の相(windup / charge / jump / scream / driller-thrust-windup・active / logger-sweep-windup・active /
 *  b-windup / b-lunge / b-grab / s-arc / s-bite / z-red-pause / z-lunge-in / z-bite1 / z-stagger / z-bite2 / lich-blink / ボスの g-*)、
 *  噛みつきの構え・振り(biteAt>0)、§16の技の相(chaffMove が立っていて上の固める相に居ない)。**表に無い相は技の最中**(安全側)。
 */
export const BRAWLER_HOLDABLE_PHASES: ReadonlySet<string> = new Set([
  'zpause', 'zrush', 'z-wait', 'z-recover', 'z-retreat',
  'b-approach', 'b-orbit', 'b-release',
  's-crouch', 's-recover', 's-retreat',
  'crouch', 'recover', 'dash-recover', 'w-retreat',
  'driller-thrust-recover', 'logger-sweep-recover',
]);
/** ボスの「休み」の相(技と技の間の間・社長指示2026-11-09)。偶像の休符・英雄の待ち。 */
export const BRAWLER_HOLDABLE_BOSS_STATES: ReadonlySet<string> = new Set(['chase', 'return', 'idol-rest', 'hero-idle']);
/**
 * ★§13-1(社長指示2026-11-09「攻撃で技も止めたいが、止めすぎるとハメ殺せるのはやめたい」): 技の**溜め(予告中)**の相。
 * 確定の固まり(§19-3)の間は、移動・待ちの相と同じく固める(旧の「1回の溜めにつき合計400ms」の予算は §19 で撤去=歯止めは
 * 「固まりは次に動ける時までしか続かない」と「コンボの後の固まらない時間」が受け持つ)。
 * 予告の時刻は行動の時計の台帳(aiPhaseUntil・aiStartedAt・biteAt・chaffMoveAt)
 * から引くので、固めている間は流星の位相も止まり、明けたら続きから(出る=溜め開始・消え切る=当たる が崩れない)。
 * 攻撃の振り(判定が出ている間)は止めない。**ボスの bossState の溜め・城ボスの g-* の溜めは入れていない**(§9-72: 予告の時刻を
 * 台帳の外の欄=命中の予約・コントローラの時計から引く技があり、全部の一致を確かめ切れていない=予告が嘘になるくらいなら止めない)。
 */
export const BRAWLER_WINDUP_PHASES: ReadonlySet<string> = new Set([
  'windup', 'scream', 'driller-thrust-windup', 'logger-sweep-windup', 'b-windup', 's-arc', 'z-red-pause', 'z-lunge-in', 'z-stagger', 'lich-blink',
]);
export type BrawlerPhaseKind = 'free' | 'windup' | 'active';
/**
 * 格闘の止めから見た、いまの相の種類。free=技ではない(移動・待ち・後退・硬直・休み)=固める /
 * windup=技の溜め(予告中)=固める(§19-3: free と同じ扱い。相の区別は浮かせの取り消し=§12-1b が使う)/
 * active=攻撃の振り・固めない技=固めない。会心の気絶中は free。
 */
export const brawlerPhaseKind = (
  e: { type?: EnemyType; aiPhase?: string; chaffMove?: string; biteAt?: number; stunUntil?: number; bossFullStunUntil?: number; bossState?: string },
  gameTime: number,
): BrawlerPhaseKind => {
  if (e.stunUntil !== undefined && gameTime < e.stunUntil) return 'free';
  if (e.bossFullStunUntil !== undefined && gameTime < e.bossFullStunUntil) return 'free';
  // ボス(天使・裏ボス・偶像・賞金首など)は技を bossState で持つ。追いかけ・帰り・休み・技の後の硬直以外は技の最中(溜めも固めない=§9-72)。
  if (e.bossState !== undefined && !BRAWLER_HOLDABLE_BOSS_STATES.has(e.bossState) && !isRecoverHoldPhase(e.bossState)) return 'active';
  // 噛みつきの構え(biteAt=噛む瞬間・噛みはその瞬間に判定)=溜め。死神・使者は固めない(神付きの台本)。
  if (e.biteAt !== undefined && e.biteAt > 0) return e.type === 'reaper' || e.type === 'hangedman' ? 'active' : 'windup';
  if (e.aiPhase === undefined) return e.chaffMove !== undefined ? 'active' : 'free';
  if (BRAWLER_HOLDABLE_PHASES.has(e.aiPhase) || isRecoverHoldPhase(e.aiPhase)) return 'free';
  return BRAWLER_WINDUP_PHASES.has(e.aiPhase) ? 'windup' : 'active';
};
/** 本当に技を出している最中か(溜めも含む・浮かせ/ボスの止めの判定に使う)。会心の気絶中は false。 */
export const isBrawlerTechBusy = (
  e: { type?: EnemyType; aiPhase?: string; chaffMove?: string; biteAt?: number; stunUntil?: number; bossFullStunUntil?: number; bossState?: string },
  gameTime: number,
): boolean => brawlerPhaseKind(e, gameTime) !== 'free';
/**
 * 技の最中でも、浮く当たりで技を取り消して浮かせてよい相手か(社長承認2026-11-10「技の最中浮く は はい」)。
 * 雑魚・強個体だけ(ボス級は今どおり技を取り消さない=浮かない)。取り消せない相(空中の跳び等)の除外は呼び手(store)が見る。
 */
export const brawlerLiftBreaksTech = (_e: { aiPhase?: string }, cls: 'mob' | 'strong' | 'boss'): boolean =>
  cls !== 'boss';
/**
 * ★§13-2 ダメージ補正: 同じ流れの10ヒット目以降、1発ごとに −5%(下限 50%)。n=この当たりが流れの何発目か(1から)。秘奥義は呼び手が外す。
 */
export const BRAWLER_PRORATION_FROM = 10;
export const BRAWLER_PRORATION_STEP = 0.05;
export const BRAWLER_PRORATION_MIN = 0.5;
export const brawlerProration = (n: number): number =>
  n < BRAWLER_PRORATION_FROM ? 1 : Math.max(BRAWLER_PRORATION_MIN, 1 - BRAWLER_PRORATION_STEP * (n - BRAWLER_PRORATION_FROM + 1));
/** この敵へのいまの当たりの補正(流れが切れていれば1発目から)。 */
export const brawlerProrationFor = (e: { brComboAt?: number; brFlowHits?: number }, now: number): number =>
  brawlerProration((brawlerComboAlive(e, now) ? (e.brFlowHits ?? 0) : 0) + 1);

/**
 * ★いまのフレームの幅(gameTime・ms)。確定の固まりは「終わりの時刻を過ぎた次のフレーム」で明ける(=1フレーム遅れて明ける)。
 * 理由(検収2026-11-10): 続きは「後隙が明けた最初のフレーム」で出る。そのフレームが遅れると(コマ落ち・幅の揺れ)、出た瞬間には
 *   終わりの時刻を過ぎていて延ばせず、3→4・4→5段目が切れた(幅16〜50msの揺れで119本中8本)。ボスの制御はプレイヤーの格闘の時計より
 *   先に回るので、敵の側とプレイヤーの側が**同じ式**(このフレームの頭の時刻で見る)を使わないと、敵が1フレーム先に動く。
 * 書くのは store の setGameTime だけ(1フレームに1回)。上限は1フレームの幅の上限(50ms)。
 */
let brawlerLockFrameMs = 0;
export const BRAWLER_LOCK_FRAME_MAX_MS = 50;
export const setBrawlerLockFrameMs = (dtGameMs: number): void => {
  brawlerLockFrameMs = Number.isFinite(dtGameMs) ? Math.min(BRAWLER_LOCK_FRAME_MAX_MS, Math.max(0, dtGameMs)) : 0;
};
export const getBrawlerLockFrameMs = (): number => brawlerLockFrameMs;
/**
 * 確定の固まり(§19-3 ①②・gameTime)が生きているか。相は見ない(攻撃の振りの最中かは brawlerHeldNow が見る)。
 * ★このフレームの頭の時刻(gameTime − フレームの幅)で見る=終わりの時刻を過ぎた次のフレームで明ける(上の brawlerLockFrameMs)。
 */
export const brawlerLockAlive = (e: { brLockUntil?: number }, gameTime: number): boolean =>
  e.brLockUntil !== undefined && gameTime - brawlerLockFrameMs < e.brLockUntil;
/**
 * 固まりの時計のどちらかが生きているか(§19-3 ⑥)。壁時計の欄(brHoldUntil=秘奥義の間の止め・ボス級の当たりの止めなど)か、
 * gameTime の欄(brLockUntil=確定の固まり)。相は見ない。brHoldUntil を直接読んでいた所(行動の時計・噛みつき・描画)はこれを使う。
 */
export const brawlerHoldClockAlive = (e: { brHoldUntil?: number; brLockUntil?: number }, gameTime: number, nowMs: number): boolean =>
  (e.brHoldUntil !== undefined && nowMs < e.brHoldUntil) || brawlerLockAlive(e, gameTime);
/** 固まりの残り(ms・2つの時計の長い方。生きていなければ 0)。 */
export const brawlerHoldRemainMs = (e: { brHoldUntil?: number; brLockUntil?: number }, gameTime: number, nowMs: number): number =>
  Math.max(0, e.brHoldUntil !== undefined ? e.brHoldUntil - nowMs : 0, e.brLockUntil !== undefined ? e.brLockUntil - gameTime + brawlerLockFrameMs : 0); // brawlerLockAlive と同じ式(生きている⇔残り>0)
/**
 * いま格闘の食らいの固まりで止まっているか(全区分共通)。本当に攻撃を振っている最中(active)は止めない。
 * ★時計は2つ(§19-3 ⑥): 壁時計の欄か gameTime の欄のどちらかが生きていれば固まり。
 * 専用の制御で動くボス(裏ボス・天使・偶像・賞金首・英雄・幻影・群れ)も、この述語で移動と次の技の開始を止める
 * (行動の時計は enemyClocks.isEnemyFrozenForClocks が同じ式で止める=明けたら続きから)。
 */
export const brawlerHeldNow = (
  e: { type?: EnemyType; brHoldUntil?: number; brLockUntil?: number; aiPhase?: string; chaffMove?: string; biteAt?: number; stunUntil?: number; bossFullStunUntil?: number; bossState?: string },
  gameTime: number, nowMs: number,
): boolean => brawlerHoldClockAlive(e, gameTime, nowMs) && brawlerPhaseKind(e, gameTime) !== 'active'; // §13-1: 溜めも止める(攻撃の振りは止めない)

/**
 * いま格闘の浮かせ(§12-1・4段目と追撃)で浮いているか(Date.now 系)。近接フィニッシュの跳ね(liftUntil だけ)とは
 * brLiftUntil === liftUntil で見分ける(pixi の絵の見分けと同じ)。
 * ★社長承認2026-11-09: 格闘の浮きは固まりと同じ「止めるだけ」(相と期限を保ち、明けたら続き)。崩さない。
 */
export const brawlerLiftHoldNow = (e: { brLiftUntil?: number; liftUntil?: number }, nowMs: number): boolean =>
  e.brLiftUntil !== undefined && e.liftUntil !== undefined && e.brLiftUntil === e.liftUntil && nowMs < e.liftUntil;
/** 格闘の止め(固まり or 浮き)で「止めるだけ」の状態か。専用の制御で動くボスはこれで止まる(相と期限を保つ)。 */
export const brawlerStopOnlyNow = (
  e: Parameters<typeof brawlerHeldNow>[0] & { brLiftUntil?: number; liftUntil?: number },
  gameTime: number, nowMs: number,
): boolean => brawlerHeldNow(e, gameTime, nowMs) || brawlerLiftHoldNow(e, nowMs);

// ---------------------------------------------------------------------------------------------
// ★確定の固まり(research/BRAWLER.md §19-3 → §20・社長指示2026-11-11「ちゃんとそこも格闘ゲームにしたい フレーム計算で」)。
// 考え方(§20-1): つながる=「次の当たりが入る瞬間に、相手がまだ固まっているか、浮いている」。固まりは当たりの瞬間に技ごとの数字で1回書く(延ばさない)。
// ---------------------------------------------------------------------------------------------
/** ⑤ コンボが終わった後の固まらない時間(ms・gameTime・叩き台・係数なし)。雑魚は無し。 */
export const BRAWLER_COMBO_END_NO_HOLD_BOSS_MS = 1500;
export const BRAWLER_COMBO_END_NO_HOLD_STRONG_MS = 800;
export const brawlerComboEndNoHoldMs = (cls: 'mob' | 'strong' | 'boss'): number =>
  cls === 'boss' ? BRAWLER_COMBO_END_NO_HOLD_BOSS_MS : cls === 'strong' ? BRAWLER_COMBO_END_NO_HOLD_STRONG_MS : 0;

/** 締め(取り消せない技=5段目・飛び蹴り3発目)と気功: 固まりの表が0=固めない(止めだけ)。それまでの固まりを止めの終わりまで切り詰める。 */
export const brawlerLockIsCloser = (move: BrawlerMoveKey): boolean => move === 's5' || move === 'kick3' || move === 'kiko';
/** 固める技(固まりの表が0より長い技=1〜4段目・飛び蹴り1・2発目・大踏み潰し)。秘奥義の9連撃・締め・気功は確定の固まりの規則の外/固めない。 */
export const brawlerLockHolds = (move: BrawlerMoveKey): boolean =>
  move !== 'secret' && move !== 'secret-land' && BRAWLER_HOLD_MS[move] > 0;
/** コンボの減衰(§20-4): 固まりを書いた当たりの何発目か(1始まり)→掛ける倍率。5発目までは1.0、6発目×0.8、7発目×0.64…。 */
export const BRAWLER_LOCK_DECAY_FREE_HITS = 5;
export const BRAWLER_LOCK_DECAY_RATE = 0.8;
export const brawlerLockDecay = (hitNo: number): number =>
  hitNo <= BRAWLER_LOCK_DECAY_FREE_HITS ? 1 : BRAWLER_LOCK_DECAY_RATE ** (Math.round(hitNo) - BRAWLER_LOCK_DECAY_FREE_HITS);
/** 技の固まり(実ms・減衰つき・四捨五入)。hitNo=この当たりが固まりを書く当たりの何発目か。固まり0の技は 0。 */
export const brawlerLockHoldMs = (move: BrawlerMoveKey, hitNo = 1): number =>
  move === 'secret' || move === 'secret-land' ? 0 : Math.round(BRAWLER_HOLD_MS[move] * brawlerLockDecay(hitNo));
/**
 * ① 当てた時の固まりの長さ(当たりの瞬間から・ms)(§20-4)= プレイヤーの止め(stopMs)+ 固まり(表)×コンボの減衰。
 * 固まり0の技(締め・気功・秘奥義)は 0(固まりは書かない)。雑魚・強個体・ボス級とも同じ長さ。
 */
export const brawlerLockHitMs = (move: BrawlerMoveKey, stopMs: number, hitNo = 1): number => {
  const hold = brawlerLockHoldMs(move, hitNo);
  return hold > 0 ? Math.max(0, stopMs) + hold : 0;
};
/** 気功の弾が狙った相手に届くまでの時間(ms)。dist=撃つ所から相手の当たりの縁まで(px)・speed=弾の速さ(px/秒)。 */
export const brawlerKikoTravelMs = (dist: number, speed: number): number =>
  Math.max(0, dist) / Math.max(1, speed) * 1000;

// ---------------------------------------------------------------------------------------------
// ★つながりの計算(§20-6 の3・テストと設計の検算のための純関数。★判定には使わない=store は固まりの数字と時計だけで動く)。
// 「この技を当てた後、この続きをこの出し方で出したら、次の当たりは当たりから何ms後か」「固まりの終わりは当たりから何ms後か」。
// 時刻は全部「前の技が当たった瞬間」を 0 とした game 時計のms。前の技のプレイヤーの止め S の間は行動の時計が止まる(取り消しの受付は S の明けから)。
// ---------------------------------------------------------------------------------------------
/** 当たりの時のプレイヤーの止め(ms・テンポ係数は掛けない別の表=utils/brawler の BRAWLER_HITSTOP)。気功は弾なので 0。 */
export const brawlerMoveStopMs = (move: BrawlerMoveKey): number =>
  move === 's1' || move === 's2' || move === 's3' || move === 's4' || move === 's5' ? brawlerStageSpec(Number(move[1])).hitstopMs
    : move === 'kick1' ? BRAWLER_KICK_HITSTOP_MS[1] : move === 'kick2' ? BRAWLER_KICK_HITSTOP_MS[2] : move === 'kick3' || move === 'heel' ? BRAWLER_KICK_HITSTOP_MS[3]
      : move === 'stomp' ? BRAWLER_STOMP_HITSTOP_MS : 0;
/** 気功が撃った所から相手に届くまでの時間(ms)。distPx=プレイヤーの中心から相手までの距離(気功の弾の出る位置と当たりの余白を引く: −18 −当たりの余白)。 */
export const brawlerKikoTravelForDistMs = (distPx: number): number => brawlerKikoTravelMs(distPx - 18 - BRAWLER_KIKO_HIT_PAD, BRAWLER_KIKO_SPEED);
/** 技を出してから当たる(判定を解く)までの時間(ms)。飛び蹴り=出だし(溜め)+飛ぶ時間(flightMs・近いと 156〜遠いと 195)/ 気功=出だし+弾の飛ぶ時間(kikoDistPx から)。 */
const brawlerMoveWindupMs = (move: BrawlerMoveKey, o: { kickFlightMs?: number; kikoDistPx?: number }): number => {
  switch (move) {
    case 's1': case 's2': case 's3': case 's4': case 's5': return brawlerStageSpec(Number(move[1])).windupMs;
    case 'kick1': case 'kick2': case 'kick3': return o.kickFlightMs ?? BRAWLER_TECHS.kick.windupMs; // 蹴り飛ばしは溜め無し(research/BRAWLER.md §33-2)
    case 'heel': return BRAWLER_KICK3_CHARGE_MS + (o.kickFlightMs ?? BRAWLER_TECHS.kick.windupMs);
    case 'stomp': return BRAWLER_TECHS.stomp.windupMs;
    case 'kiko': return BRAWLER_TECHS.kiko.windupMs + brawlerKikoTravelForDistMs(o.kikoDistPx ?? 0);
    default: return 0;
  }
};
/** 当たりの後の後隙(ms)。 */
const brawlerMoveRecoveryMs = (move: BrawlerMoveKey): number =>
  move === 's1' || move === 's2' || move === 's3' || move === 's4' || move === 's5' ? brawlerStageSpec(Number(move[1])).recoveryMs
    : move === 'stomp' ? BRAWLER_TECHS.stomp.recoveryMs : move === 'kiko' ? BRAWLER_TECHS.kiko.recoveryMs : BRAWLER_TECHS.kick.recoveryMs;
/** 続きの出し方: 'recovery-end'=後隙が終わってから待機で出す / 'cancel-now'=止めが明けてすぐ取り消して出す / 'cancel-late'=受付の終わり際(止めの後 BRAWLER_CANCEL_WINDOW_MS)に取り消して出す。 */
export type BrawlerLinkHow = 'recovery-end' | 'cancel-now' | 'cancel-late';
export interface BrawlerLinkTiming {
  /** 続きを出す(押す)時刻(当たりから・ms)。 */
  pressAt: number;
  /** 次の当たりの時刻(当たりから・ms)。 */
  nextHitAt: number;
  /** 固まりの終わり(当たりから・ms)。固まり0の技(締め・気功)は止めの終わり。 */
  lockEndsAt: number;
  /** 余り(ms)= lockEndsAt − nextHitAt。正=次の当たりが入る(相手がまだ固まっている)/負=不足(入らない)。 */
  marginMs: number;
  /** 入るか(余りが正)。 */
  connects: boolean;
  /** 取り消しの規則(brawlerRouteAllows)がこの出し方を許すか('recovery-end' は待機からなので常に true)。 */
  routeOk: boolean;
}
/**
 * 「from を当てた後、to を how で出したら、次の当たりは当たりから何ms後か」と「固まりの終わりは当たりから何ms後か」(§20-6 の3)。
 *  - from の固まり = 止め S + 固まりの表×減衰(fromHitNo=from が固まりを書く当たりの何発目か=減衰。固まり0なら止めの終わりまで)。
 *  - 'recovery-end': S + 後隙 に待機から to を出す。気功の後隙は撃った所(当たりより前)から始まるので、後隙の終わり = 後隙 −(弾の飛ぶ時間 fromKikoDistPx)。
 *  - 'cancel-now': S(止めの明け=受付が開く)に取り消して出す。'cancel-late': S + 受付の長さに取り消して出す。
 *  - to の当たり = 出した時刻 + 出だし(飛び蹴り・気功は距離で変わる: kickFlightMs / kikoDistPx)。
 */
export const brawlerLinkTiming = (
  from: BrawlerMoveKey, to: BrawlerMoveKey, how: BrawlerLinkHow,
  o: { fromHitNo?: number; kickFlightMs?: number; kikoDistPx?: number; fromKikoDistPx?: number } = {},
): BrawlerLinkTiming => {
  const stop = brawlerMoveStopMs(from);
  const lockEndsAt = stop + (brawlerLockHolds(from) ? brawlerLockHoldMs(from, o.fromHitNo ?? 1) : 0);
  const recovery = brawlerMoveRecoveryMs(from);
  const pressAt = how === 'recovery-end'
    ? (from === 'kiko' ? Math.max(0, recovery - brawlerKikoTravelForDistMs(o.fromKikoDistPx ?? 0)) : stop + recovery)
    : how === 'cancel-now' ? stop : stop + BRAWLER_CANCEL_WINDOW_MS;
  const nextHitAt = pressAt + brawlerMoveWindupMs(to, o);
  const isNode = (m: BrawlerMoveKey): boolean => m !== 'secret' && m !== 'secret-land';
  const routeOk = how === 'recovery-end' ? true : isNode(from) && isNode(to) && brawlerRouteAllows(from as BrawlerRouteNode, to as BrawlerRouteNode);
  const marginMs = lockEndsAt - nextHitAt;
  return { pressAt, nextHitAt, lockEndsAt, marginMs, connects: marginMs > 0, routeOk };
};

/** 確定の固まりの欄(store の Enemy のうち、ここが読み書きする所だけ)。brLock* は gameTime・brNoHoldUntil / brHoldUntil / hitStunUntil / brLiftUntil は Date.now。 */
export interface BrawlerLockFields {
  /** 確定の固まりの終わり(gameTime)。 */
  brLockUntil?: number;
  /** このコンボで固まりを書いた当たりの数(§20-4・コンボの減衰)。undefined=コンボの外(④)。 */
  brLockHits?: number;
  /** コンボが終わった後の固まらない時間の終わり(gameTime・⑤)。 */
  brLockNoHoldUntil?: number;
  brNoHoldUntil?: number;
  brHoldUntil?: number;
  hitStunUntil?: number;
  brLiftUntil?: number;
}
/**
 * いま固まらない時間か(§19-3 ⑤)。コンボの後(gameTime の欄)か、ダウンの着地の後(壁時計の欄)の**どちらかが生きている間**。
 * ★どの固まりの書き込み(当たりの固まり・秘奥義の1発の固まり)も、先にこれを見る。
 */
export const brawlerNoHoldNow = (e: Pick<BrawlerLockFields, 'brLockNoHoldUntil' | 'brNoHoldUntil'>, gameTime: number, nowMs: number): boolean =>
  (e.brLockNoHoldUntil !== undefined && gameTime < e.brLockNoHoldUntil) || (e.brNoHoldUntil !== undefined && nowMs < e.brNoHoldUntil);
/**
 * コンボの後の固まらない時間の間か(gameTime の欄だけ)。この間は、格闘の当たりの**止めも書かず(震えの絵だけ)・地上から浮かせない**(§19-3 ⑤)。
 * ダウンの着地の後(壁時計の欄)は、今どおり固まりだけを止める(止め・浮かせは変えない)。
 */
export const brawlerComboEndNoHoldNow = (e: Pick<BrawlerLockFields, 'brLockNoHoldUntil'>, gameTime: number): boolean =>
  e.brLockNoHoldUntil !== undefined && gameTime < e.brLockNoHoldUntil;

/**
 * 格闘の当たり1回ぶんの確定の固まり(§20-4)。**当たりの瞬間に書く。それ以外では書かない・延ばさない。**
 *  - 固まらない時間の間(brawlerNoHoldNow): 何も書かない(noHold=true)。
 *  - 固める技(固まりの表が0より長い)で、固められる当たり(canHold): 長さ = プレイヤーの止め + 固まり×コンボの減衰。**前の固まりを置き換える**
 *    (短くなっても置き換える)。固まりを書いた当たりを brLockHits で数える(countHit=false の呼び手=会心のフィニッシュは数えない)。
 *  - 固めない当たり(canHold=false=攻撃の振りの最中・ダウン)と、固まり0の技(締め・気功): 新しい固まりは書かず、
 *    それまでの固まりを「その敵に掛かる止めの終わり」(gameTime + enemyStopMs)まで切る。数えない。
 *  - コンボの中の印: 固めた時か、この当たりで宙に居る(airborneAfter)時か、もうコンボの中の時に brLockHits を立てる(④の区切りまで)。
 * stopMs=プレイヤーの止め(長さの式)/ enemyStopMs=その敵に実際に掛かる止め(ボス級の吹き飛ばしは 0)。
 */
export const brawlerLockOnHit = (
  e: BrawlerLockFields, move: BrawlerMoveKey, gameTime: number, nowMs: number,
  o: { stopMs: number; enemyStopMs: number; canHold: boolean; airborneAfter: boolean; countHit?: boolean },
): { patch: Pick<BrawlerLockFields, 'brLockUntil' | 'brLockHits'>; held: boolean; noHold: boolean } => {
  if (brawlerNoHoldNow(e, gameTime, nowMs)) return { patch: {}, held: false, noHold: true };
  const inCombo = e.brLockHits !== undefined;
  const hits = e.brLockHits ?? 0;
  const mark = (yes: boolean): Pick<BrawlerLockFields, 'brLockHits'> => (yes ? { brLockHits: hits } : {});
  const hitNo = hits + 1;
  const len = brawlerLockHitMs(move, o.stopMs, hitNo);
  if (!(len > 0) || !o.canHold) {
    // 固めない当たり: それまでの固まりを止めの終わりまで切る(前の当たりの長い固まりを残さない)。
    const cut = gameTime + Math.max(0, o.enemyStopMs);
    return {
      patch: { ...(e.brLockUntil !== undefined && e.brLockUntil > cut ? { brLockUntil: cut } : {}), ...mark(inCombo || o.airborneAfter) },
      held: false, noHold: false,
    };
  }
  return {
    patch: { brLockUntil: gameTime + len, brLockHits: o.countHit === false ? hits : hitNo },
    held: true, noHold: false,
  };
};
/**
 * ④ コンボの区切り(毎フレーム・敵ごと)。その敵が格闘の固まりでも浮きでもなくなった時(当たりの止めは固まりに含む・押されているだけの時は含まない)に
 * コンボは終わり、固まりの数えを消す。⑤ ボス級・強個体はそこから固まらない時間が始まる(雑魚は無し)。null=まだ続いている/コンボの外。
 * 会心の気絶・カウンターの足止めは別の仕組みなので数えない。
 */
export const brawlerComboEndPatch = (
  e: BrawlerLockFields, cls: 'mob' | 'strong' | 'boss', gameTime: number, nowMs: number,
): Pick<BrawlerLockFields, 'brLockHits' | 'brLockNoHoldUntil'> | null => {
  if (e.brLockHits === undefined) return null;
  if (brawlerHoldClockAlive(e, gameTime, nowMs)) return null;
  if (e.hitStunUntil !== undefined && nowMs < e.hitStunUntil) return null;
  if (brawlerAirborne(e, nowMs)) return null;
  const ms = brawlerComboEndNoHoldMs(cls);
  return { brLockHits: undefined, ...(ms > 0 ? { brLockNoHoldUntil: Math.max(e.brLockNoHoldUntil ?? 0, gameTime + ms) } : {}) };
};

// ---------------------------------------------------------------------------------------------
// つながっているコンボの数(表示・research/BRAWLER.md §23・社長指示2026-11-11「その意味のない数字のどっちか使おう」)
// ---------------------------------------------------------------------------------------------
// 近接枠の左の「N HIT」は、旧は「殴り続けている間に当てた回数」(何にも関係しない数)だった。これを
// **その敵に、動く間を与えずに当て続けた回数**に差し替える。敵ごとに数え(brComboHits)、画面にはいちばん多い敵の数を出す。
//  - 格闘の当たり1回ごとに +1(段・技・気功の爆発・秘奥義の1発・会心のフィニッシュ)。
//  - 当たる直前にその敵が動けた(固まり・当たりの止め・浮きのどれでもない=④ コンボの区切りと同じ見方)なら、1 から数え直す。
//    だから、つながっていない当たり(間に敵が動けた)は数が伸びない。秘奥義の間は画面内の敵が止まっている=伸び続ける。
//  - 画面に出すのも「いま動けない敵」の数だけ(動けるようになった敵の数は出さない)。
//  - 敵の欄は、動けるようになったフレームで store が消す(④ と同じ場所)。消さないと、後で別の理由(秘奥義の止め・他の武器の止め)で
//    止まった時に古い数がよみがえる。当たる時と読む時にも「いま動けるか」を見る(消す前のフレームでも正しく読む)。
//  - 倒した1発は、敵が倒れて数から外れるので、store が当たりの直後にその数を出してから切る。
// 判定・固まり・ダメージには使わない(表示だけ)。
export interface BrawlerLinkFields {
  brComboHits?: number;
  brHoldUntil?: number;
  brLockUntil?: number;
  hitStunUntil?: number;
  brLiftUntil?: number;
  // 気絶・紫と、攻撃の振りの最中かを見る欄(brawlerPhaseKind と同じ物)。
  type?: EnemyType;
  aiPhase?: string;
  chaffMove?: string;
  biteAt?: number;
  stunUntil?: number;
  bossFullStunUntil?: number;
  bossState?: string;
}
/**
 * いま動けるか。動けない=格闘の固まり・浮き・**気絶/紫(完全気絶)**・当たりの止め。
 * ★社長裁定2026-11-11(「1;はい」「2;はい」):
 *  - 気絶・紫の間は、固まりが明けても「動けない」=殴り続ければ数が積み上がる。
 *  - 攻撃を振っている最中(brawlerPhaseKind='active')の当たりの止めは「動けない」に数えない(雑魚は振りの最中は止まらない=実際は振り続けている)。
 */
export const brawlerLinkFree = (e: BrawlerLinkFields, gameTime: number, nowMs: number): boolean => {
  if (brawlerHoldClockAlive(e, gameTime, nowMs) || brawlerAirborne(e, nowMs)) return false;
  if (e.stunUntil !== undefined && gameTime < e.stunUntil) return false;
  if (e.bossFullStunUntil !== undefined && gameTime < e.bossFullStunUntil) return false;
  if (e.hitStunUntil !== undefined && nowMs < e.hitStunUntil && brawlerPhaseKind(e, gameTime) !== 'active') return false;
  return true;
};
/** いまその敵につながっている数(動けるなら 0)。 */
export const brawlerLinkNow = (e: BrawlerLinkFields, gameTime: number, nowMs: number): number =>
  (e.brComboHits !== undefined && !brawlerLinkFree(e, gameTime, nowMs) ? e.brComboHits : 0);
/** この当たりで、その敵のつながっているコンボが何発目になるか(e=当たる直前の敵)。 */
export const brawlerLinkOnHit = (e: BrawlerLinkFields, gameTime: number, nowMs: number): number => brawlerLinkNow(e, gameTime, nowMs) + 1;
/** 画面に出す数=生きている敵のうち、いちばん多くつながっている数(誰もつながっていなければ 0)。 */
export const brawlerLinkMax = (
  enemies: readonly (BrawlerLinkFields & { health: number; corpseUntil?: number })[], gameTime: number, nowMs: number,
): number => {
  let m = 0;
  for (const e of enemies) {
    if (e.brComboHits === undefined || e.brComboHits <= m || !(e.health > 0) || e.corpseUntil !== undefined) continue;
    const n = brawlerLinkNow(e, gameTime, nowMs);
    if (n > m) m = n;
  }
  return m;
};
/**
 * 表示の状態(プレイヤーの格闘の flowHits / flowBrokenAt)を、いまの数 m に合わせる。変わらなければ null。
 *  - m>0: その数を出す(切れていた表示は出し直す)。
 *  - m=0: 出ていたなら「切れた」時刻を打つ(表示は最後の数のまま沈んで消える)。
 */
export const brawlerLinkDisplay = (
  s: { flowHits?: number; flowBrokenAt?: number }, m: number, t: number,
): { flowHits: number; flowBrokenAt: number } | null => {
  const hits = s.flowHits ?? 0;
  const broken = (s.flowBrokenAt ?? 0) > 0;
  if (m > 0) return !broken && hits === m ? null : { flowHits: m, flowBrokenAt: 0 };
  return hits > 0 && !broken ? { flowHits: hits, flowBrokenAt: Math.max(1, t) } : null;
};

/** 敵の流れの欄(store の Enemy のうち、ここが読み書きする所だけ)。 */
export interface BrawlerComboFields {
  type: EnemyType;
  brComboStart?: number;
  brComboAt?: number;
  brNoHoldUntil?: number;
  brFlowHits?: number;
}

/** この時刻にまだ流れが続いているか(最後の当たりから GAP 以内)。 */
export const brawlerComboAlive = (e: Pick<BrawlerComboFields, 'brComboAt'>, now: number): boolean =>
  e.brComboAt !== undefined && now - e.brComboAt <= BRAWLER_COMBO_GAP_MS;

/**
 * 格闘の当たり1回ぶんの流れの数え(§13-2)。固まりはここでは決めない(§19-3 の brawlerLockOnHit)。
 *  - 流れが切れていれば(最後の当たりから GAP 超)始め直す。
 *  - ダメージ補正の数(brFlowHits)と、バウンドの区切り(brComboStart)を進める。
 * 旧: 減衰(時計)と同じ技の罰(§19 で撤去)・反撃の数と予約(振り払い・2026-11-11 撤去)はここで数えていた。
 */
export const brawlerComboOnHit = (
  e: BrawlerComboFields, move: BrawlerMoveKey, now: number,
): { patch: Partial<BrawlerComboFields> } => {
  const alive = brawlerComboAlive(e, now);
  const start = alive ? (e.brComboStart ?? now) : now;
  return {
    patch: {
      brComboStart: start, brComboAt: now,
      // ダメージ補正の数(§13-2)。秘奥義(9連撃・締め)は数えない。
      brFlowHits: (alive ? (e.brFlowHits ?? 0) : 0) + (move === 'secret' || move === 'secret-land' ? 0 : 1),
    },
  };
};

// ---------------------------------------------------------------------------------------------
// 浮かせ追撃(research/BRAWLER.md §12-1・社長指示2026-11-08「浮いてる間は敵は動けない ただし、段々重くなる 雑魚は軽い 強個体は少し重い ボスは重い」)
// ---------------------------------------------------------------------------------------------
/**
 * ★§13-2 拾える回数の予算(社長決定2026-11-09「雑魚→ボスの順 6.5.4回にしよう」)。§12-1 の 0.75^n の減衰はこの予算に置き換えた。
 * 空中で当たるたびに消費(弱い当たり=1・強い当たりと技=2)。予算が足りない当たりで落ちてダウン(拾えない・着地まで動けない)。
 * =予算は「弱い当たりで拾える回数」(雑魚6回拾えて7回目で落ちる・ボス級は4回拾えて5回目で落ちる)。
 * ★実装で決めた所(§9-73): 4段目(空中で当てた時)=1(ランチャー=拾い直しの起点は軽く)、大踏み潰し=0(バウンドは1コンボ1回で別に縛る)。
 *   設計の例のコンボ(1・2・3段→4段→飛び蹴り→1・2段→大踏み潰し→気功→5段)が雑魚で最後まで繋がる値にした。
 */
export const BRAWLER_JUGGLE_BUDGET: Readonly<Record<'mob' | 'strong' | 'boss', number>> = { mob: 6, strong: 5, boss: 4 };
export const BRAWLER_JUGGLE_COST: Readonly<Record<BrawlerMoveKey, number>> = {
  s1: 1, s2: 1, s3: 2, s4: 1, s5: 2, kick1: 2, kick2: 2, kick3: 2, heel: 2, stomp: 0, kiko: 1, secret: 2, 'secret-land': 2,
};
/** 地面バウンド(§13-2・1コンボに1回)の跳ね返りの高さ(重さの前の倍率)。 */
export const BRAWLER_BOUNCE_F = 0.45;
/** ダウンの着地の後、固まらない時間(ms・×BRAWLER_TEMPO・起き上がり=次のコンボの始まりを区切る)。 */
export let BRAWLER_DOWN_NO_HOLD_MS = 300; // ×BRAWLER_TEMPO(係数1.0の値)
/** 重さ(区分): 浮く高さ・時間に掛ける。 */
// ★社長指示2026-11-10「格闘、一旦ボスの重みやめよう。雑魚と同じ軽さに。」で boss 0.4→1.0(強個体 0.7 はそのまま・拾える回数の予算と押しの半分も変えていない)。
// ★社長裁定2026-11-11「6:普段は少し重く、気絶中からのコンボは軽く」: boss 1.0→0.7(強個体と同じ)。気絶・紫の間に地上から浮かせたコンボは
//   軽い(BRAWLER_JUGGLE_WEIGHT_STUN_BOSS=1.0=雑魚と同じ)まま、着地まで続く(brLiftLight)。
export const BRAWLER_JUGGLE_WEIGHT: Readonly<Record<'mob' | 'strong' | 'boss', number>> = { mob: 1.0, strong: 0.7, boss: 0.7 };
export const BRAWLER_JUGGLE_WEIGHT_STUN_BOSS = 1.0;
/**
 * 当たった段・技ごとの押し上げ量(4段目=1)。1・2段目・気功=小、3段目・飛び蹴り1・2発目=中。
 * 0 = 押し上げない(5段目・飛び蹴り3発目・大踏み潰し・秘奥義の締め=空中からも吹き飛ばす)。
 */
export const BRAWLER_JUGGLE_PUSH: Readonly<Record<BrawlerMoveKey, number>> = {
  s1: 0.5, s2: 0.5, s3: 0.75, s4: 1, s5: 0,
  kick1: 0.75, kick2: 0.75, kick3: 0, heel: 0, // 踵落とし=押し上げない(空中の敵は叩き落とす)
  stomp: 0, kiko: 0.5, secret: 0.75, 'secret-land': 0,
};
/**
 * ★地上の敵を浮かせる当たり(ランチャー)と、その高さ(4段目=1)。ここに無い当たりは地上からは浮かせない。
 * 飛び蹴りの2発目は少しだけ打ち上げる(社長指示2026-11-11「飛び蹴り2段目は少し打ち上げられる仕様にして欲しい」)。3・4段目は今どおり(空中の押し上げ量と同じ値)。
 * ★0.7 の理由(同日「3段目もジャンプして、そこの高さに追いついて、蹴り飛ばす」): 3発目は2発目が当たってから約330ms後に当たる。
 *   0.5(滞空約380ms)だと、その時の雑魚はほぼ着地している(高さ1割)=跳んで追いつく絵にならない。0.7(約530ms)なら落ち始めの高さ(頂点の約7割)で当たる。叩き台。
 * ★大踏み潰しも地上から浮かせる(社長裁定2026-11-11「浮かせながら吹き飛ばす(つまり浮きだけ追加)」)。吹き飛ばし(大きい押し)は今どおり=浮きだけを足した。
 *   高さは3段目と同じ 0.75(叩き台)。空中の敵への大踏み潰し(地面バウンド・1コンボ1回)は今どおり。
 */
export const BRAWLER_GROUND_LAUNCH: Readonly<Partial<Record<BrawlerMoveKey, number>>> = { s3: 0.75, s4: 1, kick2: 0.7, stomp: 0.75 };
/** これより軽い押し上げはもう浮かない(=落ちる)。いずれ必ず落ちる=永久には浮かせられない。 */
export const BRAWLER_JUGGLE_MIN_F = 0.12;
/** 1回の押し上げの浮く時間の下限(ms・短すぎる跳ねは絵がちらつく)。 */
export let BRAWLER_JUGGLE_MIN_MS = 140; // ×BRAWLER_TEMPO(係数1.0の値)
/** 空中から吹き飛ばされた時に地面へ落ちる時間(ms)。 */
export let BRAWLER_JUGGLE_DROP_MS = 200; // ×BRAWLER_TEMPO(係数1.0の値)

/** 敵の浮きの欄(store の Enemy のうち、ここが読み書きする所だけ)。時計は Date.now。 */
export interface BrawlerJuggleFields {
  /** いまの弧の始まり(絵)。 */
  brawlerLiftAt?: number;
  /** いまの弧の長さ(ms)・頂点の高さ(基準の高さ BRAWLER_LIFT_VIS_PX に対する倍率)・始まりの高さ(同じ倍率)。 */
  brLiftMs?: number;
  brLiftPeak?: number;
  brLiftFrom?: number;
  /** この浮きの中で押し上げた回数(0=最初の浮き)。 */
  brLiftN?: number;
  /** 浮きの終わり(=動けない間の終わり。liftUntil にも同じ値を書く=全ての敵の制御が「持ち上げ」として止まる)。 */
  brLiftUntil?: number;
  /** 着地の砂埃をまだ出していない(絵の弧が終わった瞬間に store が出して消す)。 */
  brLiftLand?: boolean;
  /** §13-2: 残りの拾える回数・ダウン中・バウンドを使った流れ・バウンドの落ちる区間。 */
  brLiftBudget?: number;
  brLiftDown?: boolean;
  /** ボス級: 気絶・紫の間に地上から浮かせたコンボ=軽い重さのまま着地まで(社長裁定2026-11-11・research/BRAWLER.md §25)。 */
  brLiftLight?: boolean;
  brBounceCombo?: number;
  brLiftDropMs?: number;
  /** 弧の形('blast'=爆発の浮き・§14)。無し=格闘の弧。 */
  brLiftShape?: 'blast';
  /** ★落ちる部分の時間の倍率(1=元の形)。地上から打ち上げた1回目は遅く、空中で拾うたびに速く(brawlerFallK)。上がり・漂いの時間は変えない。無し=1。 */
  brLiftFallK?: number;
  /** ★爆発の浮き(§14): 今の空中が始まった時刻(爆発で浮き直しても続く)・爆発では浮かない窓の終わり(着地から、浮いていた時間と同じ長さ)。Date.now。 */
  brBlastAirSince?: number;
  brBlastNoLiftUntil?: number;
  /** 流れの始まり(バウンドは1コンボに1回の区切り)。 */
  brComboStart?: number;
  /** ダウンの着地の後の固まらない時間(Date.now)。ダウンで書き直す時は遅い方を残す(§19-3 ⑤)。 */
  brNoHoldUntil?: number;
}
/** 絵の弧が地面に着いたか(砂埃を出す時刻)。 */
export const brawlerJuggleLanded = (e: BrawlerJuggleFields, now: number): boolean =>
  e.brLiftLand === true && e.brawlerLiftAt !== undefined && now >= e.brawlerLiftAt + (e.brLiftMs ?? BRAWLER_LIFT_MS);

/** いま浮いているか。 */
export const brawlerAirborne = (e: Pick<BrawlerJuggleFields, 'brLiftUntil'>, now: number): boolean =>
  e.brLiftUntil !== undefined && now < e.brLiftUntil;

// ---- 空中の敵へのダメージ倍率(社長指示2026-11-09「倍率はもっと上げたいのと、格闘以外にも乗せたい」・research/BRAWLER.md §16) ----
/** 空中の敵に当たるたび上がる: 1発目 ×1.25 / 1発ごとに +0.25 / 上限 ×2.0。着地で数え直し(敵ごと)。 */
export const AIR_HIT_FIRST_MULT = 1.25;
export const AIR_HIT_STEP_MULT = 0.25;
export const AIR_HIT_MAX_MULT = 2.0;
/** 空中で n 発目(1始まり)の当たりの倍率。0以下(空中でない)は 1。 */
export const airHitMult = (nth: number): number =>
  nth >= 1 ? Math.min(AIR_HIT_MAX_MULT, AIR_HIT_FIRST_MULT + AIR_HIT_STEP_MULT * (Math.floor(nth) - 1)) : 1;
/** 数えの寿命(ms)。最後に数えてからこれを過ぎた敵は数え直し(1回の浮きより十分長い)。 */
export const AIR_HIT_STALE_MS = 6000;
const airHitCounts = new Map<string, { n: number; at: number }>();
/**
 * 敵に1発当たる瞬間に呼ぶ(1発につき1回)。いま浮いていれば数えを進めて倍率を返し、浮いていなければ(=地上の当たり=打ち上げた一撃も)
 * 数えを捨てて 1 を返す。着地してから次に当たる時は必ず地上の当たりを挟むので、着地で数え直しになる。
 * 状態は敵のid別の小さな表(ストア外)=呼ぶ側は敵の欄を書き足さなくてよい。resetAirHits で捨てる(出撃のはじめ)。
 */
export const airHitMultFor = (e: { id: string; brLiftUntil?: number }, now: number): number => {
  if (!brawlerAirborne(e, now)) { airHitCounts.delete(e.id); return 1; }
  const prev = airHitCounts.get(e.id);
  const n = (prev && now - prev.at <= AIR_HIT_STALE_MS ? prev.n : 0) + 1;
  airHitCounts.set(e.id, { n, at: now });
  if (airHitCounts.size > 256) for (const [k, v] of airHitCounts) if (now - v.at > AIR_HIT_STALE_MS) airHitCounts.delete(k);
  return airHitMult(n);
};
export const resetAirHits = (): void => { airHitCounts.clear(); };

/**
 * 追撃で浮き直した弧の頂点(倍率)。押し上げ(peak)ぶん上がり直すが、今の高さはそのまま積まずに少し目減りさせる
 * (旧の弧の頂点付近 ≒ 0.8×今の高さ+押し上げ と同じ高さ=何度当てても天井へ積み上がらない)。
 * ただし必ず今より少しは上がる(押し上げの3割以上)=頂点は弧の打ち上がりの終わり(25%)に来る。
 */
export const BRAWLER_JUGGLE_CARRY = 0.8;
export const BRAWLER_JUGGLE_MIN_RISE = 0.3;
export const brawlerJuggleTop = (from: number, peak: number): number =>
  Math.max(BRAWLER_JUGGLE_CARRY * from + peak, from + BRAWLER_JUGGLE_MIN_RISE * peak);

// ---- 落ちる速さの重さの増え方(社長裁定2026-11-13「格闘ゲームの空中コンボの重さの増え方」) ----
/** 地上から打ち上げた1回目(brLiftN=0)の落ちる部分の時間の倍率(=速さ約0.8倍)。 */
export const BRAWLER_FALL_FIRST_SLOW = 1.25;
/** 空中で拾った n 回目(1,2,…)は落ちる部分の時間を ÷ これ^n(速さ1.1倍ずつ)。 */
export const BRAWLER_FALL_SPEEDUP_PER_PICK = 1.1;
/** 速さの上限(元の落ちる時間の 1/これ が下限)。 */
export const BRAWLER_FALL_MAX_SPEEDUP = 1.4;
/** 拾った回数 n(0=地上から打ち上げた1回目)の落ちる部分の時間の倍率。 */
export const brawlerFallK = (n: number): number =>
  n <= 0 ? BRAWLER_FALL_FIRST_SLOW : Math.max(1 / BRAWLER_FALL_MAX_SPEEDUP, 1 / Math.pow(BRAWLER_FALL_SPEEDUP_PER_PICK, Math.floor(n)));
/** 元の弧の長さ ms(上がり・漂い・落ち)の落ちる部分だけを k 倍した弧の長さ。shape=弧の配分(省略=格闘の弧)。 */
export const brawlerFallStretchMs = (ms: number, k: number, shape?: LiftArcShape): number => {
  const F = 1 - (shape?.rise ?? BRAWLER_LIFT_RISE_FRAC) - (shape?.hover ?? BRAWLER_LIFT_HOVER_FRAC);
  return Math.round(ms * (1 - F + F * k));
};
/** 落ちる部分を k 倍した弧の配分(上がり・漂いの割合を縮め直す=上がり・漂いの時間は元のまま)。k=1 なら元の配分。 */
export const brawlerFallShape = (k: number, shape?: LiftArcShape): LiftArcShape | undefined => {
  if (k === 1) return shape;
  const R = shape?.rise ?? BRAWLER_LIFT_RISE_FRAC, H = shape?.hover ?? BRAWLER_LIFT_HOVER_FRAC, F = 1 - R - H;
  const tot = R + H + F * k;
  return { rise: R / tot, hover: H / tot };
};

/** いまの浮いた高さ(基準の高さに対する倍率・絵だけ)。弧の頭は始まりの高さから続き、頂点を越えて地面(0)で終わる。 */
export const brawlerJuggleHeightRel = (e: BrawlerJuggleFields, now: number): number => {
  if (e.brawlerLiftAt === undefined) return 0;
  const ms = e.brLiftMs ?? BRAWLER_LIFT_MS;
  const u = (now - e.brawlerLiftAt) / Math.max(1, ms);
  if (u <= 0 || u >= 1) return u <= 0 ? (e.brLiftFrom ?? 0) : 0;
  const from = e.brLiftFrom ?? 0;
  const peak = e.brLiftPeak ?? 1;
  // 地面バウンド(§13-2): 頭の dropMs で今の高さから地面へ落ち、そこから小さく跳ね返る(拾い直せる)。
  const drop = e.brLiftDropMs ?? 0;
  if (drop > 0) {
    const t = now - e.brawlerLiftAt;
    if (t < drop) { const q = t / drop; return from * (1 - q) * (1 - q) * (1 + 2 * q); }
    return brawlerLiftArcRel((t - drop) / Math.max(1, ms - drop), 0, peak, brawlerFallShape(e.brLiftFallK ?? 1));
  }
  // 空中で吹き飛ばされた(押し上げ0)=今の高さから速く叩き落とす(DROP_MS・端で速さ0の滑らかな落ち)。
  if (peak <= 0) return from * (1 - u) * (1 - u) * (1 + 2 * u);
  // 浮き(最初も追撃の浮き直しも同じ形): 打ち上がり18% → 頂点の漂い27% → 落下55%(§12-1・2026-11-13に上りを速く)。爆発の浮きは 15%・20%・65%(§14)。
  return brawlerLiftArcRel(u, from, brawlerJuggleTop(from, peak), brawlerFallShape(e.brLiftFallK ?? 1, e.brLiftShape === 'blast' ? BLAST_LIFT_SHAPE : undefined));
};

/**
 * ★空中の合図の強さ(§12-1・社長承認2026-11-09「合図を頂点に対する割合で満額にする」): いまの高さ ÷ その弧の頂点(0..1)。
 * 重い区分(ボス級0.4・強個体0.7)や爆発の低い浮きでも、頂点では満額の合図(影の縮み・輪・体の拡大)が出る。高さそのものの差は残る。
 * 叩き落とし(押し上げ0)・地面バウンドの落ちる区間は、落ち始めの高さに対する割合。
 */
export const brawlerAirSignal = (e: BrawlerJuggleFields, now: number): number => {
  if (e.brawlerLiftAt === undefined) return 0;
  const h = brawlerJuggleHeightRel(e, now);
  if (h <= 0) return 0;
  const from = e.brLiftFrom ?? 0, peak = e.brLiftPeak ?? 1;
  const dropping = peak <= 0 || ((e.brLiftDropMs ?? 0) > 0 && now - e.brawlerLiftAt < (e.brLiftDropMs ?? 0));
  const top = dropping ? from : (e.brLiftDropMs ?? 0) > 0 ? peak : brawlerJuggleTop(from, peak);
  return top > 1e-6 ? Math.max(0, Math.min(1, h / top)) : 0;
};

/**
 * 格闘の当たり1回ぶんの浮き(§12-1・§13-2)。cls=区分の重さ。返り値 null=浮きは変わらない。
 *  - 地上: 3段目(アッパー)・4段目・飛び蹴りの2発目(少しだけ)が浮かせる(ランチャー=BRAWLER_GROUND_LAUNCH)。拾える回数の予算(雑魚6/強個体5/ボス級4)をここで持たせる。
 *  - 空中: 押し上げのある段・技で浮き直す(高さ・時間=押し上げ量×重さ。回数の減りは予算が受け持つ)。当たるたびに予算を使い、
 *    足りない当たりでダウン(今の高さから落ちる・着地まで動けない・着地の後 BRAWLER_DOWN_NO_HOLD_MS は固まらない)。
 *  - 空中の大踏み潰し: 1コンボに1回だけ地面バウンド(落ちて小さく跳ね返る=拾い直せる)。2回目以降は叩き落とし(ダウン)。
 *  - 空中で押し上げ0の技(5段目・飛び蹴り3発目・秘奥義の締め)=締めの叩き落とし(ダウン)。
 *  - ダウン中(落ちている間)は拾えない。
 */
export const brawlerJugglePush = (
  e: BrawlerJuggleFields, cls: 'mob' | 'strong' | 'boss', move: BrawlerMoveKey, now: number,
  /** stunned=当たる時にその敵が気絶・紫か(ボス級を地上から浮かせる時だけ見る=気絶中からのコンボは軽い)。 */
  stunned = false,
  /** ★false=落ちる速さの重さの増え方を当てない(k=1・今の速さ)。スラッシャーの追撃(自動で決まった間隔で出る当たり)が使う(社長裁定2026-11-13)。 */
  fallScale = true,
): Partial<BrawlerJuggleFields> & { liftUntil?: number; brNoHoldUntil?: number } | null => {
  const fallK = (n: number) => (fallScale ? brawlerFallK(n) : 1);
  const airborne = brawlerAirborne(e, now);
  const push = BRAWLER_JUGGLE_PUSH[move];
  // ボス級: 気絶中に浮かせたコンボ(brLiftLight)は軽い重さのまま着地まで。地上から浮かせる時は、いま気絶中かで決める。
  const light = cls === 'boss' && (airborne ? e.brLiftLight === true : stunned);
  const w = light ? BRAWLER_JUGGLE_WEIGHT_STUN_BOSS : BRAWLER_JUGGLE_WEIGHT[cls];
  const arc = (f: number) => Math.max(BRAWLER_JUGGLE_MIN_MS, Math.round(BRAWLER_LIFT_MS * f));
  if (!airborne) {
    const launch = BRAWLER_GROUND_LAUNCH[move];
    if (launch === undefined) return null;
    const f = launch * w;
    if (f < BRAWLER_JUGGLE_MIN_F) return null;
    const fk = fallK(0);
    const ms = brawlerFallStretchMs(arc(f), fk);
    // brBlastAirSince: 空中の始まり(この後に爆発で浮き直した時、爆発で浮かない窓の長さを空中の時間で測る・§14)。
    return { brawlerLiftAt: now, brLiftMs: ms, brLiftPeak: f, brLiftFrom: 0, brLiftN: 0, brLiftUntil: now + ms, liftUntil: now + ms, brLiftLand: true, brLiftShape: undefined, brLiftFallK: fk,
      brLiftBudget: BRAWLER_JUGGLE_BUDGET[cls], brLiftDown: false, brLiftDropMs: 0, brBlastAirSince: now, brLiftLight: light };
  }
  if (e.brLiftDown) return null; // ダウン中は拾えない
  const h = brawlerJuggleHeightRel(e, now);
  const down = (): Partial<BrawlerJuggleFields> & { liftUntil: number; brNoHoldUntil: number } => {
    const ms = BRAWLER_JUGGLE_DROP_MS;
    return { brawlerLiftAt: now, brLiftMs: ms, brLiftPeak: 0, brLiftFrom: h, brLiftUntil: now + ms, liftUntil: now + ms, brLiftLand: true, brLiftShape: undefined, brLiftFallK: 1,
      // ★固まらない時間は遅い方を残す(ダウンの着地で、もっと長い固まらない時間が短くならない・§19-3 ⑤)。
      brLiftDown: true, brLiftDropMs: 0, brLiftBudget: 0, brNoHoldUntil: Math.max(e.brNoHoldUntil ?? 0, now + ms + BRAWLER_DOWN_NO_HOLD_MS) };
  };
  const budget = (e.brLiftBudget ?? BRAWLER_JUGGLE_BUDGET[cls]) - BRAWLER_JUGGLE_COST[move];
  const n = (e.brLiftN ?? 0) + 1;
  if (move === 'stomp') {
    // 地面バウンド: 1コンボに1回・予算が残っている時だけ。
    const combo = e.brComboStart ?? -1;
    if (budget < 0 || e.brBounceCombo === combo) return down();
    const f = BRAWLER_BOUNCE_F * w;
    const dropMs = BRAWLER_JUGGLE_DROP_MS;
    const fk = fallK(n);
    const ms = dropMs + brawlerFallStretchMs(arc(f), fk);
    return { brawlerLiftAt: now, brLiftMs: ms, brLiftPeak: f, brLiftFrom: h, brLiftN: n, brLiftUntil: now + ms, liftUntil: now + ms, brLiftLand: true, brLiftShape: undefined, brLiftFallK: fk,
      brLiftBudget: budget, brLiftDown: false, brLiftDropMs: dropMs, brBounceCombo: combo };
  }
  if (push <= 0 || budget < 0) return down();
  const f = push * w;
  if (f < BRAWLER_JUGGLE_MIN_F) return down();
  const fk = fallK(n);
  const ms = brawlerFallStretchMs(arc(f), fk);
  return { brawlerLiftAt: now, brLiftMs: ms, brLiftPeak: f, brLiftFrom: h, brLiftN: n, brLiftUntil: now + ms, liftUntil: now + ms, brLiftLand: true, brLiftShape: undefined, brLiftFallK: fk,
    brLiftBudget: budget, brLiftDown: false, brLiftDropMs: 0 };
};

// ---------------------------------------------------------------------------------------------
// ★テンポ係数(utils/brawler の BRAWLER_TEMPO・社長承認2026-11-08)。流れの切れ・
// 浮きの下限と叩き落としも同じ係数で伸ばす(格闘の時計が全体に遅くなる分、追撃が届くよう同率)。
// 確定の固まりの長さ(brawlerLockHitMs)は、技ごとの固まりの表(utils/brawler の BRAWLER_HOLD_MS=係数つき)から作る。
// ---------------------------------------------------------------------------------------------
/** 係数を掛けた時間の一式(純関数)。係数1.0なら今までの値と一致する。 */
export const brawlerComboTimesAt = (tempo: number) => ({
  BRAWLER_SECRET_HOLD_MS: brawlerTempoMs(300, tempo),
  BRAWLER_COMBO_GAP_MS: brawlerTempoMs(700, tempo),
  BRAWLER_JUGGLE_MIN_MS: brawlerTempoMs(140, tempo),
  BRAWLER_JUGGLE_DROP_MS: brawlerTempoMs(200, tempo),
  BRAWLER_DOWN_NO_HOLD_MS: brawlerTempoMs(300, tempo),
});
const applyBrawlerComboTempo = (tempo: number): void => {
  const v = brawlerComboTimesAt(tempo);
  BRAWLER_SECRET_HOLD_MS = v.BRAWLER_SECRET_HOLD_MS;
  BRAWLER_COMBO_GAP_MS = v.BRAWLER_COMBO_GAP_MS;
  BRAWLER_JUGGLE_MIN_MS = v.BRAWLER_JUGGLE_MIN_MS;
  BRAWLER_JUGGLE_DROP_MS = v.BRAWLER_JUGGLE_DROP_MS;
  BRAWLER_DOWN_NO_HOLD_MS = v.BRAWLER_DOWN_NO_HOLD_MS;
};
/** 格闘の全部の時間を係数で書き直す(utils/brawler の段・技・秘奥義 + ここの固まり)。テストは明示の係数で呼ぶ。 */
export const setBrawlerTempoAll = (tempo: number): void => {
  setBrawlerTempo(tempo);
  applyBrawlerComboTempo(BRAWLER_TEMPO);
};
applyBrawlerComboTempo(BRAWLER_TEMPO);
