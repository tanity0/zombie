// ★サブウェポン「格闘」の敵側の流れ(research/BRAWLER.md §11・社長指示2026-11-08)。
// 食らいの固まり(当たった雑魚・強個体は食らいの動作だけになる)・減衰(連打では止め切れない)・同じ技の罰・反撃(振り払い)。
// 純関数だけ(store が読んで敵へ書く・pixi は読むだけ)。時計は Date.now(敵の hitStunUntil / knockbackUntil と同じ)。
// 反撃の溜めと当たる時刻だけは敵の技の時計(gameTime・aiStartedAt / aiPhaseUntil)で持つ(予告の円が同じ時計を読む)。
import type { EnemyType } from '../types/game';
import { isBossType } from './enemyUtils';
import { POSTURE_ELITE_TYPES } from './bossPosture';
import { meteorPhase } from './telegraphStyle';
import { isRecoverHoldPhase } from './recoverPhase';
import { BRAWLER_LIFT_MS, BRAWLER_TEMPO, brawlerLiftArcRel, brawlerTempoMs, setBrawlerTempo } from './brawler';

/**
 * 当たりが途切れたら流れ(コンボ時計・反撃の数・同じ技の記録)を0へ戻す(ms)。
 * ★社長承認2026-11-09 で 600→700(係数1.3で910)。止めを長くした分、3段目→4段目の間(係数1.3で約774ms)が切れに接していたため。
 */
export let BRAWLER_COMBO_GAP_MS = 700; // ×BRAWLER_TEMPO(係数1.0の値)
/** 固まりの減衰: 長さ = 基本 × max(床, 1 − 時計 / この ms)。 */
export let BRAWLER_COMBO_DECAY_MS = 3000; // ×BRAWLER_TEMPO(係数1.0の値)
/** 固まりの減衰の下限。★§13-1(社長指示2026-11-09「止めすぎるとハメ殺せるのはやめたい」)で 0.4→0(いずれ必ず固まらなくなる)。 */
export const BRAWLER_COMBO_FLOOR = 0;
/** 同じ段・同じ技を1つの流れで当て直すと、時計に足す ms(1段目の連打・同じ技の擦りだけが早く抜けられる)。 */
export let BRAWLER_SAME_MOVE_PENALTY_MS = 400; // ×BRAWLER_TEMPO(係数1.0の値)
/** 反撃の数(1つの流れで受けた格闘の当たり)。雑魚・強個体とも7(社長指示2026-11-08「強個体も雑魚と同じにして」)。ボス級は反撃しない。 */
export const BRAWLER_REVENGE_HITS_MOB = 7;
/** 振り払い: 溜め(=赤い予告が出てから消え切るまで)・当たりの円の半径・威力(接触/噛みつきの倍率)・押す距離と時間。 */
export let BRAWLER_REVENGE_WINDUP_MS = 350; // ×BRAWLER_TEMPO(係数1.0の値)
export const BRAWLER_REVENGE_RADIUS = 90;
export const BRAWLER_REVENGE_DMG_MULT = 1.5;
export const BRAWLER_REVENGE_PUSH_PX = 60;
export const BRAWLER_REVENGE_PUSH_MS = 200;
/** 振り払いの後、その敵が固まらない時間(すぐ固め直せない・ms)。 */
export let BRAWLER_REVENGE_NO_HOLD_MS = 1200; // ×BRAWLER_TEMPO(係数1.0の値)
/** 振り払いの予告の円の描き切る位置(流星の位相 `meteorPhase` の drawFrac)。前半で円が描かれ、後半で外から内へ流れて消える。 */
export const BRAWLER_REVENGE_DRAW_FRAC = 0.45;

/**
 * 当たりの名札(同じ技の罰と、固まりの基本の長さの引き先)。段は s1..s5、飛び蹴りは何発目か、秘奥義の9連撃は1本。
 * 5段の順・飛び蹴りの3連は名札が違う=罰を受けない。
 */
export type BrawlerMoveKey =
  | 's1' | 's2' | 's3' | 's4' | 's5'
  | 'kick1' | 'kick2' | 'kick3'
  | 'stomp' | 'kiko' | 'secret' | 'secret-land';

/**
 * 固まりの基本の長さ(ms)。0=固めない(吹き飛ばす技=5段目・飛び蹴り3発目・大踏み潰し・秘奥義の締めは今どおり飛ばす)。
 * 4段目は今の浮かせ(450ms)と同じ長さ。
 */
export const BRAWLER_HOLD_BASE_MS_BASE: Readonly<Record<BrawlerMoveKey, number>> = {
  s1: 300, s2: 300, s3: 450, s4: 450, s5: 0,
  kick1: 350, kick2: 350, kick3: 0,
  stomp: 0, kiko: 300, secret: 300, 'secret-land': 0,
};
/** 固まりの基本の長さ(係数を掛けた値・ms)。 */
export let BRAWLER_HOLD_BASE_MS: Readonly<Record<BrawlerMoveKey, number>> = BRAWLER_HOLD_BASE_MS_BASE;

/** 段の番号(1..5)から名札。 */
export const brawlerStageMoveKey = (stage: number): BrawlerMoveKey =>
  (['s1', 's2', 's3', 's4', 's5'] as const)[Math.max(1, Math.min(5, Math.round(stage))) - 1];
/** 飛び蹴りの何発目か(1..3)から名札。 */
export const brawlerKickMoveKey = (kickN: number): BrawlerMoveKey =>
  (['kick1', 'kick2', 'kick3'] as const)[Math.max(1, Math.min(3, Math.round(kickN))) - 1];

/**
 * 区分(CLAUDE.md「敵の仕様は種類で固める」)。強個体=体勢値を持つエリート雑魚(POSTURE_ELITE_TYPES)。
 * `isBossType` は強個体まで含む別目的の表なので、強個体を先に見る(telegraphStyleFor と同じ順)。
 */
export const brawlerComboClass = (type: EnemyType): 'mob' | 'strong' | 'boss' =>
  POSTURE_ELITE_TYPES.has(type) ? 'strong' : isBossType(type) ? 'boss' : 'mob';
/**
 * 振り払い(反撃・§11-3)の対象か(雑魚・強個体。ボス級は振り払わない)。
 * ★食らいの固まり・減衰・同じ技の罰は**ボス級にも掛かる**(社長指示2026-11-08「ボスも、雑魚と共通の止まりにしよう 数値だけ今のまま」・§11-1)。
 */
export const isBrawlerComboSubject = (type: EnemyType): boolean => brawlerComboClass(type) !== 'boss';
/** 反撃の数。雑魚・強個体は同じ7(格闘では強個体を雑魚と同じに扱う)。ボス級は反撃しない=Infinity。 */
export const brawlerRevengeHitsFor = (type: EnemyType): number =>
  brawlerComboClass(type) === 'boss' ? Infinity : BRAWLER_REVENGE_HITS_MOB;

/**
 * ★格闘の固まり・止め・反撃が「技を出している最中」として除外する相(社長実機報告2026-11-08「まだ攻撃で敵が止まるのは一切入ってないね?」)。
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
 *  b-windup / b-lunge / b-grab / s-arc / s-bite / z-red-pause / z-lunge-in / z-bite1 / z-stagger / z-bite2 / lich-blink / br-revenge / ボスの g-*)、
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
 * 予算(BRAWLER_TECH_HOLD_BUDGET_MS)の分だけ固める。予告の時刻は行動の時計の台帳(aiPhaseUntil・aiStartedAt・biteAt・chaffMoveAt)
 * から引くので、固めている間は流星の位相も止まり、明けたら続きから(出る=溜め開始・消え切る=当たる が崩れない)。
 * 攻撃の振り(判定が出ている間)は止めない。**ボスの bossState の溜め・城ボスの g-* の溜めは入れていない**(§9-72: 予告の時刻を
 * 台帳の外の欄=命中の予約・コントローラの時計から引く技があり、全部の一致を確かめ切れていない=予告が嘘になるくらいなら止めない)。
 */
export const BRAWLER_WINDUP_PHASES: ReadonlySet<string> = new Set([
  'windup', 'scream', 'driller-thrust-windup', 'logger-sweep-windup', 'b-windup', 's-arc', 'z-red-pause', 'z-lunge-in', 'z-stagger', 'lich-blink',
]);
/** 1回の技(溜め)ごとに固められる合計(ms・×BRAWLER_TEMPO)。使い切ったら押し切る(その技が終わるまで固まらない)。 */
export let BRAWLER_TECH_HOLD_BUDGET_MS = 400; // ×BRAWLER_TEMPO(係数1.0の値)
export type BrawlerPhaseKind = 'free' | 'windup' | 'active';
/**
 * 格闘の止めから見た、いまの相の種類。free=技ではない(移動・待ち・後退・硬直・休み)=いくらでも固める /
 * windup=技の溜め(予告中)=予算の分だけ固める / active=攻撃の振り・固めない技=固めない。会心の気絶中は free。
 */
export const brawlerPhaseKind = (
  e: { type?: EnemyType; aiPhase?: string; chaffMove?: string; biteAt?: number; stunUntil?: number; bossFullStunUntil?: number; bossState?: string },
  gameTime: number,
): BrawlerPhaseKind => {
  if (e.stunUntil !== undefined && gameTime < e.stunUntil) return 'free';
  if (e.bossFullStunUntil !== undefined && gameTime < e.bossFullStunUntil) return 'free';
  // ボス(天使・裏ボス・偶像・賞金首など)は技を bossState で持つ。追いかけ・帰り・休み・技の後の硬直以外は技の最中(溜めも固めない=§9-72)。
  if (e.bossState !== undefined && !BRAWLER_HOLDABLE_BOSS_STATES.has(e.bossState) && !isRecoverHoldPhase(e.bossState)) return 'active';
  if (e.aiPhase === 'br-revenge') return 'active';
  // 噛みつきの構え(biteAt=噛む瞬間・噛みはその瞬間に判定)=溜め。死神・使者は固めない(神付きの台本)。
  if (e.biteAt !== undefined && e.biteAt > 0) return e.type === 'reaper' || e.type === 'hangedman' ? 'active' : 'windup';
  if (e.aiPhase === undefined) return e.chaffMove !== undefined ? 'active' : 'free';
  if (BRAWLER_HOLDABLE_PHASES.has(e.aiPhase) || isRecoverHoldPhase(e.aiPhase)) return 'free';
  return BRAWLER_WINDUP_PHASES.has(e.aiPhase) ? 'windup' : 'active';
};
/** 本当に技を出している最中か(溜めも含む・浮かせ/振り払い/ボスの止めの判定に使う)。会心の気絶中は false。 */
export const isBrawlerTechBusy = (
  e: { type?: EnemyType; aiPhase?: string; chaffMove?: string; biteAt?: number; stunUntil?: number; bossFullStunUntil?: number; bossState?: string },
  gameTime: number,
): boolean => brawlerPhaseKind(e, gameTime) !== 'free';
/** いまの技(溜め)の札(予算を数え直す区切り)。相の名前+噛みの有無。 */
export const brawlerTechHoldKey = (e: { aiPhase?: string; chaffMove?: string; biteAt?: number }): string =>
  `${e.aiPhase ?? ''}|${e.chaffMove ?? ''}|${e.biteAt !== undefined && e.biteAt > 0 ? 'bite' : ''}`;
/**
 * 溜めを固める予算の適用(§13-1-A)。いまの止めの終わり(prevUntil)より先へ伸ばす分だけ予算から使う。
 * 返り値 until=実際に書く止めの終わり(予算で頭打ち)・used=使った後の量・key=札。予算を使い切っていれば until は prevUntil のまま(押し切る)。
 */
export const brawlerTechHoldApply = (
  e: { aiPhase?: string; chaffMove?: string; biteAt?: number; brTechHoldKey?: string; brTechHoldUsed?: number; brHoldUntil?: number },
  wantUntil: number, now: number,
): { until: number | undefined; used: number; key: string } => {
  const key = brawlerTechHoldKey(e);
  const used0 = e.brTechHoldKey === key ? (e.brTechHoldUsed ?? 0) : 0;
  const prev = e.brHoldUntil !== undefined && e.brHoldUntil > now ? e.brHoldUntil : now;
  const room = Math.max(0, BRAWLER_TECH_HOLD_BUDGET_MS - used0);
  const ext = Math.max(0, Math.min(wantUntil - prev, room));
  return { until: ext > 0 ? prev + ext : (prev > now ? prev : undefined), used: used0 + ext, key };
};

/** 溜めを抜けた(または別の溜めに入った)敵の予算の札を捨てるパッチ(毎フレーム・無ければ null)。 */
export const brawlerTechHoldResetPatch = (
  e: Parameters<typeof brawlerPhaseKind>[0] & { brTechHoldKey?: string },
  gameTime: number,
): { brTechHoldKey: undefined; brTechHoldUsed: undefined } | null =>
  e.brTechHoldKey !== undefined && (brawlerPhaseKind(e, gameTime) !== 'windup' || brawlerTechHoldKey(e) !== e.brTechHoldKey)
    ? { brTechHoldKey: undefined, brTechHoldUsed: undefined } : null;

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
 * いま格闘の食らいの固まり(①止め+②固まり)で止まっているか(全区分共通・Date.now 系)。本当に技を出している最中は止めない。
 * 専用の制御で動くボス(裏ボス・天使・偶像・賞金首・英雄・幻影・群れ)も、この述語で移動と次の技の開始を止める
 * (行動の時計は enemyClocks.isEnemyFrozenForClocks が同じ式で止める=明けたら続きから)。
 */
export const brawlerHeldNow = (
  e: { type?: EnemyType; brHoldUntil?: number; aiPhase?: string; chaffMove?: string; biteAt?: number; stunUntil?: number; bossFullStunUntil?: number; bossState?: string },
  gameTime: number, nowMs: number,
): boolean => e.brHoldUntil !== undefined && nowMs < e.brHoldUntil && brawlerPhaseKind(e, gameTime) !== 'active'; // §13-1: 溜めも止める(攻撃の振りは止めない)

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

/** 固まりの減衰の倍率(時計 ms から)。 */
export const brawlerHoldDecay = (clockMs: number): number =>
  Math.max(BRAWLER_COMBO_FLOOR, 1 - Math.max(0, clockMs) / BRAWLER_COMBO_DECAY_MS);

/** 敵の流れの欄(store の Enemy のうち、ここが読み書きする所だけ)。 */
export interface BrawlerComboFields {
  type: EnemyType;
  brComboStart?: number;
  brComboAt?: number;
  brComboPenalty?: number;
  brComboHits?: number;
  brComboMoves?: string;
  brRevengePending?: boolean;
  brNoHoldUntil?: number;
  brFlowHits?: number;
}

/** この時刻にまだ流れが続いているか(最後の当たりから GAP 以内)。 */
export const brawlerComboAlive = (e: Pick<BrawlerComboFields, 'brComboAt'>, now: number): boolean =>
  e.brComboAt !== undefined && now - e.brComboAt <= BRAWLER_COMBO_GAP_MS;

/** 今の流れの時計(ms)。流れが切れていれば0。罰の分を含む。 */
export const brawlerComboClock = (e: BrawlerComboFields, now: number): number =>
  brawlerComboAlive(e, now) ? Math.max(0, now - (e.brComboStart ?? now)) + (e.brComboPenalty ?? 0) : 0;

/**
 * 格闘の当たり1回ぶんの流れ(§11-1・§11-2・§11-3)。
 *  - 流れが切れていれば(最後の当たりから 600ms 超)始め直す。
 *  - 同じ名札を同じ流れで2回目以降に当てたら、時計に +400ms。
 *  - 固まり = 基本 × max(0.4, 1 − 時計/3000)。振り払いの後(brNoHoldUntil まで)は固めない。
 *  - countRevenge なら反撃の数を1つ足し、区分の数に達したら反撃を予約する。
 * ★ボス級も同じ(社長指示2026-11-08「ボスも、雑魚と共通の止まりにしよう 数値だけ今のまま」)。反撃の数だけは
 *  区分の数(ボス級=Infinity)に届かないので、ボス級は振り払わない。
 */
export const brawlerComboOnHit = (
  e: BrawlerComboFields, move: BrawlerMoveKey, now: number, countRevenge = true,
): { patch: Partial<BrawlerComboFields>; holdMs: number } => {
  const alive = brawlerComboAlive(e, now);
  const start = alive ? (e.brComboStart ?? now) : now;
  const moves = alive && e.brComboMoves ? e.brComboMoves.split(',') : [];
  const repeat = moves.includes(move);
  const penalty = (alive ? (e.brComboPenalty ?? 0) : 0) + (repeat ? BRAWLER_SAME_MOVE_PENALTY_MS : 0);
  const clock = Math.max(0, now - start) + penalty;
  const base = BRAWLER_HOLD_BASE_MS[move];
  const noHold = e.brNoHoldUntil !== undefined && now < e.brNoHoldUntil;
  const holdMs = base > 0 && !noHold ? Math.round(base * brawlerHoldDecay(clock)) : 0;
  const hits = (alive ? (e.brComboHits ?? 0) : 0) + (countRevenge ? 1 : 0);
  const pending = (alive && e.brRevengePending === true) || (countRevenge && hits >= brawlerRevengeHitsFor(e.type));
  return {
    patch: {
      brComboStart: start, brComboAt: now, brComboPenalty: penalty, brComboHits: hits,
      // ダメージ補正の数(§13-2)。秘奥義(9連撃・締め)は数えない。
      brFlowHits: (alive ? (e.brFlowHits ?? 0) : 0) + (move === 'secret' || move === 'secret-land' ? 0 : 1),
      brComboMoves: repeat ? moves.join(',') : [...moves, move].join(','),
      brRevengePending: pending,
    },
    holdMs,
  };
};

/**
 * 振り払いを今始めてよいか(予約済み・技を出していない・ボス級ではない)。止まっている(気絶など)かは呼び手が先に見る。
 * busy は `isBrawlerTechBusy`(移動・待ち・後退の相からは振り払える)。§16の技の続き(chaffMove が立っている後退・硬直)は技を壊さないよう終わるまで待つ。
 */
export const brawlerRevengeShouldStart = (
  e: { type: EnemyType; brRevengePending?: boolean; aiPhase?: string; chaffMove?: string },
  busy: boolean,
): boolean => e.brRevengePending === true && !busy && e.chaffMove === undefined && e.aiPhase !== 'br-revenge' && isBrawlerComboSubject(e.type);

/** 振り払いの溜めを始めた時の欄(gameTime 系の技の時計)。 */
export const brawlerRevengeStartPatch = (gameTime: number) => ({
  aiPhase: 'br-revenge' as const,
  aiStartedAt: gameTime,
  aiPhaseUntil: gameTime + BRAWLER_REVENGE_WINDUP_MS,
  brRevengePending: false,
  brHoldUntil: undefined,
  vx: 0, vy: 0,
});
/** 振り払いが当たる(=予告が消え切る)時刻か。 */
export const brawlerRevengeDue = (e: { aiPhase?: string; aiPhaseUntil?: number }, gameTime: number): boolean =>
  e.aiPhase === 'br-revenge' && gameTime >= (e.aiPhaseUntil ?? 0);
/** 振り払いが当たった後の欄。流れは0へ戻し、しばらく固まらない。 */
export const brawlerRevengeEndPatch = (now: number) => ({
  aiPhase: undefined, aiPhaseUntil: 0, aiStartedAt: undefined,
  brComboStart: undefined, brComboAt: undefined, brComboPenalty: 0, brComboHits: 0, brComboMoves: undefined,
  brRevengePending: false, brHoldUntil: undefined,
  brNoHoldUntil: now + BRAWLER_REVENGE_NO_HOLD_MS, brRevengeAt: now,
  vx: 0, vy: 0,
});
/** 振り払いの威力(その敵の接触/噛みつきの威力 ×1.5)。 */
export const brawlerRevengeDamage = (contactDamage: number): number =>
  Math.max(0, contactDamage) * BRAWLER_REVENGE_DMG_MULT;

/**
 * 振り払いの赤い予告(★★赤い予告の4つの掟)。位相は `meteorPhase` の1本。
 *  ②出る時刻 = 溜めの開始(startAt)。③消え切る時刻 = 当たる時刻(hitAt)= `er` が1になる瞬間。
 *  visible は startAt ≦ t < hitAt の間だけ(当たった瞬間には消え切っている)。
 */
export const brawlerRevengeTelegraph = (
  startAt: number, hitAt: number, gameTime: number,
): { visible: boolean; prog: number; p: number; er: number } => {
  const total = Math.max(1, hitAt - startAt);
  const prog = Math.max(0, Math.min(1, (gameTime - startAt) / total));
  const { p, er } = meteorPhase(prog, BRAWLER_REVENGE_DRAW_FRAC);
  return { visible: gameTime >= startAt && gameTime < hitAt, prog, p, er };
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
  s1: 1, s2: 1, s3: 2, s4: 1, s5: 2, kick1: 2, kick2: 2, kick3: 2, stomp: 0, kiko: 1, secret: 2, 'secret-land': 2,
};
/** 地面バウンド(§13-2・1コンボに1回)の跳ね返りの高さ(重さの前の倍率)。 */
export const BRAWLER_BOUNCE_F = 0.45;
/** ダウンの着地の後、固まらない時間(ms・×BRAWLER_TEMPO・起き上がり=次のコンボの始まりを区切る)。 */
export let BRAWLER_DOWN_NO_HOLD_MS = 300; // ×BRAWLER_TEMPO(係数1.0の値)
/** 重さ(区分): 浮く高さ・時間に掛ける。 */
export const BRAWLER_JUGGLE_WEIGHT: Readonly<Record<'mob' | 'strong' | 'boss', number>> = { mob: 1.0, strong: 0.7, boss: 0.4 };
/**
 * 当たった段・技ごとの押し上げ量(4段目=1)。1・2段目・気功=小、3段目・飛び蹴り1・2発目=中。
 * 0 = 押し上げない(5段目・飛び蹴り3発目・大踏み潰し・秘奥義の締め=空中からも吹き飛ばす)。
 */
export const BRAWLER_JUGGLE_PUSH: Readonly<Record<BrawlerMoveKey, number>> = {
  s1: 0.5, s2: 0.5, s3: 0.75, s4: 1, s5: 0,
  kick1: 0.75, kick2: 0.75, kick3: 0,
  stomp: 0, kiko: 0.5, secret: 0.75, 'secret-land': 0,
};
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
  brBounceCombo?: number;
  brLiftDropMs?: number;
  /** 流れの始まり(バウンドは1コンボに1回の区切り)。 */
  brComboStart?: number;
}
/** 絵の弧が地面に着いたか(砂埃を出す時刻)。 */
export const brawlerJuggleLanded = (e: BrawlerJuggleFields, now: number): boolean =>
  e.brLiftLand === true && e.brawlerLiftAt !== undefined && now >= e.brawlerLiftAt + (e.brLiftMs ?? BRAWLER_LIFT_MS);

/** いま浮いているか。 */
export const brawlerAirborne = (e: Pick<BrawlerJuggleFields, 'brLiftUntil'>, now: number): boolean =>
  e.brLiftUntil !== undefined && now < e.brLiftUntil;

/**
 * 追撃で浮き直した弧の頂点(倍率)。押し上げ(peak)ぶん上がり直すが、今の高さはそのまま積まずに少し目減りさせる
 * (旧の弧の頂点付近 ≒ 0.8×今の高さ+押し上げ と同じ高さ=何度当てても天井へ積み上がらない)。
 * ただし必ず今より少しは上がる(押し上げの3割以上)=頂点は弧の打ち上がりの終わり(25%)に来る。
 */
export const BRAWLER_JUGGLE_CARRY = 0.8;
export const BRAWLER_JUGGLE_MIN_RISE = 0.3;
export const brawlerJuggleTop = (from: number, peak: number): number =>
  Math.max(BRAWLER_JUGGLE_CARRY * from + peak, from + BRAWLER_JUGGLE_MIN_RISE * peak);

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
    return brawlerLiftArcRel((t - drop) / Math.max(1, ms - drop), 0, peak);
  }
  // 空中で吹き飛ばされた(押し上げ0)=今の高さから速く叩き落とす(DROP_MS・端で速さ0の滑らかな落ち)。
  if (peak <= 0) return from * (1 - u) * (1 - u) * (1 + 2 * u);
  // 浮き(最初も追撃の浮き直しも同じ形): 打ち上がり25% → 頂点の漂い20% → 落下55%(§12-1)。
  return brawlerLiftArcRel(u, from, brawlerJuggleTop(from, peak));
};

/**
 * 格闘の当たり1回ぶんの浮き(§12-1・§13-2)。cls=区分の重さ。返り値 null=浮きは変わらない。
 *  - 地上: 3段目(アッパー)・4段目が浮かせる(ランチャー)。拾える回数の予算(雑魚6/強個体5/ボス級4)をここで持たせる。
 *  - 空中: 押し上げのある段・技で浮き直す(高さ・時間=押し上げ量×重さ。回数の減りは予算が受け持つ)。当たるたびに予算を使い、
 *    足りない当たりでダウン(今の高さから落ちる・着地まで動けない・着地の後 BRAWLER_DOWN_NO_HOLD_MS は固まらない)。
 *  - 空中の大踏み潰し: 1コンボに1回だけ地面バウンド(落ちて小さく跳ね返る=拾い直せる)。2回目以降は叩き落とし(ダウン)。
 *  - 空中で押し上げ0の技(5段目・飛び蹴り3発目・秘奥義の締め)=締めの叩き落とし(ダウン)。
 *  - ダウン中(落ちている間)は拾えない。
 */
export const brawlerJugglePush = (
  e: BrawlerJuggleFields, cls: 'mob' | 'strong' | 'boss', move: BrawlerMoveKey, now: number,
): Partial<BrawlerJuggleFields> & { liftUntil?: number; brNoHoldUntil?: number } | null => {
  const airborne = brawlerAirborne(e, now);
  const push = BRAWLER_JUGGLE_PUSH[move];
  const w = BRAWLER_JUGGLE_WEIGHT[cls];
  const arc = (f: number) => Math.max(BRAWLER_JUGGLE_MIN_MS, Math.round(BRAWLER_LIFT_MS * f));
  if (!airborne) {
    if (move !== 's4' && move !== 's3') return null;
    const f = push * w;
    if (f < BRAWLER_JUGGLE_MIN_F) return null;
    const ms = arc(f);
    return { brawlerLiftAt: now, brLiftMs: ms, brLiftPeak: f, brLiftFrom: 0, brLiftN: 0, brLiftUntil: now + ms, liftUntil: now + ms, brLiftLand: true,
      brLiftBudget: BRAWLER_JUGGLE_BUDGET[cls], brLiftDown: false, brLiftDropMs: 0 };
  }
  if (e.brLiftDown) return null; // ダウン中は拾えない
  const h = brawlerJuggleHeightRel(e, now);
  const down = (): Partial<BrawlerJuggleFields> & { liftUntil: number; brNoHoldUntil: number } => {
    const ms = BRAWLER_JUGGLE_DROP_MS;
    return { brawlerLiftAt: now, brLiftMs: ms, brLiftPeak: 0, brLiftFrom: h, brLiftUntil: now + ms, liftUntil: now + ms, brLiftLand: true,
      brLiftDown: true, brLiftDropMs: 0, brLiftBudget: 0, brNoHoldUntil: now + ms + BRAWLER_DOWN_NO_HOLD_MS };
  };
  const budget = (e.brLiftBudget ?? BRAWLER_JUGGLE_BUDGET[cls]) - BRAWLER_JUGGLE_COST[move];
  const n = (e.brLiftN ?? 0) + 1;
  if (move === 'stomp') {
    // 地面バウンド: 1コンボに1回・予算が残っている時だけ。
    const combo = e.brComboStart ?? -1;
    if (budget < 0 || e.brBounceCombo === combo) return down();
    const f = BRAWLER_BOUNCE_F * w;
    const dropMs = BRAWLER_JUGGLE_DROP_MS;
    const ms = dropMs + arc(f);
    return { brawlerLiftAt: now, brLiftMs: ms, brLiftPeak: f, brLiftFrom: h, brLiftN: n, brLiftUntil: now + ms, liftUntil: now + ms, brLiftLand: true,
      brLiftBudget: budget, brLiftDown: false, brLiftDropMs: dropMs, brBounceCombo: combo };
  }
  if (push <= 0 || budget < 0) return down();
  const f = push * w;
  if (f < BRAWLER_JUGGLE_MIN_F) return down();
  const ms = arc(f);
  return { brawlerLiftAt: now, brLiftMs: ms, brLiftPeak: f, brLiftFrom: h, brLiftN: n, brLiftUntil: now + ms, liftUntil: now + ms, brLiftLand: true,
    brLiftBudget: budget, brLiftDown: false, brLiftDropMs: 0 };
};

// ---------------------------------------------------------------------------------------------
// ★テンポ係数(utils/brawler の BRAWLER_TEMPO・社長承認2026-11-08)。固まり・減衰の時計・同じ技の罰・流れの切れ・反撃の溜め・
// 浮きの下限と叩き落としも同じ係数で伸ばす(格闘の時計が全体に遅くなる分、追撃が届くよう同率)。
// ---------------------------------------------------------------------------------------------
/** 係数を掛けた時間の一式(純関数)。係数1.0なら今までの値と一致する。 */
export const brawlerComboTimesAt = (tempo: number) => ({
  holdBase: Object.fromEntries((Object.keys(BRAWLER_HOLD_BASE_MS_BASE) as BrawlerMoveKey[]).map(k => [k, brawlerTempoMs(BRAWLER_HOLD_BASE_MS_BASE[k], tempo)])) as Record<BrawlerMoveKey, number>,
  BRAWLER_COMBO_GAP_MS: brawlerTempoMs(700, tempo),
  BRAWLER_COMBO_DECAY_MS: brawlerTempoMs(3000, tempo),
  BRAWLER_SAME_MOVE_PENALTY_MS: brawlerTempoMs(400, tempo),
  BRAWLER_REVENGE_WINDUP_MS: brawlerTempoMs(350, tempo),
  BRAWLER_REVENGE_NO_HOLD_MS: brawlerTempoMs(1200, tempo),
  BRAWLER_JUGGLE_MIN_MS: brawlerTempoMs(140, tempo),
  BRAWLER_JUGGLE_DROP_MS: brawlerTempoMs(200, tempo),
  BRAWLER_TECH_HOLD_BUDGET_MS: brawlerTempoMs(400, tempo),
  BRAWLER_DOWN_NO_HOLD_MS: brawlerTempoMs(300, tempo),
});
const applyBrawlerComboTempo = (tempo: number): void => {
  const v = brawlerComboTimesAt(tempo);
  BRAWLER_HOLD_BASE_MS = v.holdBase;
  BRAWLER_COMBO_GAP_MS = v.BRAWLER_COMBO_GAP_MS;
  BRAWLER_COMBO_DECAY_MS = v.BRAWLER_COMBO_DECAY_MS;
  BRAWLER_SAME_MOVE_PENALTY_MS = v.BRAWLER_SAME_MOVE_PENALTY_MS;
  BRAWLER_REVENGE_WINDUP_MS = v.BRAWLER_REVENGE_WINDUP_MS;
  BRAWLER_REVENGE_NO_HOLD_MS = v.BRAWLER_REVENGE_NO_HOLD_MS;
  BRAWLER_JUGGLE_MIN_MS = v.BRAWLER_JUGGLE_MIN_MS;
  BRAWLER_JUGGLE_DROP_MS = v.BRAWLER_JUGGLE_DROP_MS;
  BRAWLER_TECH_HOLD_BUDGET_MS = v.BRAWLER_TECH_HOLD_BUDGET_MS;
  BRAWLER_DOWN_NO_HOLD_MS = v.BRAWLER_DOWN_NO_HOLD_MS;
};
/** 格闘の全部の時間を係数で書き直す(utils/brawler の段・技・秘奥義 + ここの固まり・反撃)。テストは明示の係数で呼ぶ。 */
export const setBrawlerTempoAll = (tempo: number): void => {
  setBrawlerTempo(tempo);
  applyBrawlerComboTempo(BRAWLER_TEMPO);
};
applyBrawlerComboTempo(BRAWLER_TEMPO);
