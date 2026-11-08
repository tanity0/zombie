// ★サブウェポン「格闘」の敵側の流れ(research/BRAWLER.md §11・社長指示2026-11-08)。
// 食らいの固まり(当たった雑魚・強個体は食らいの動作だけになる)・減衰(連打では止め切れない)・同じ技の罰・反撃(振り払い)。
// 純関数だけ(store が読んで敵へ書く・pixi は読むだけ)。時計は Date.now(敵の hitStunUntil / knockbackUntil と同じ)。
// 反撃の溜めと当たる時刻だけは敵の技の時計(gameTime・aiStartedAt / aiPhaseUntil)で持つ(予告の円が同じ時計を読む)。
import type { EnemyType } from '../types/game';
import { isBossType } from './enemyUtils';
import { POSTURE_ELITE_TYPES } from './bossPosture';
import { meteorPhase } from './telegraphStyle';
import { BRAWLER_LIFT_MS, brawlerLiftArcRel } from './brawler';

/** 当たりが途切れたら流れ(コンボ時計・反撃の数・同じ技の記録)を0へ戻す(ms)。 */
export const BRAWLER_COMBO_GAP_MS = 600;
/** 固まりの減衰: 長さ = 基本 × max(床, 1 − 時計 / この ms)。 */
export const BRAWLER_COMBO_DECAY_MS = 3000;
export const BRAWLER_COMBO_FLOOR = 0.4;
/** 同じ段・同じ技を1つの流れで当て直すと、時計に足す ms(1段目の連打・同じ技の擦りだけが早く抜けられる)。 */
export const BRAWLER_SAME_MOVE_PENALTY_MS = 400;
/** 反撃の数(1つの流れで受けた格闘の当たり)。雑魚・強個体とも7(社長指示2026-11-08「強個体も雑魚と同じにして」)。ボス級は反撃しない。 */
export const BRAWLER_REVENGE_HITS_MOB = 7;
/** 振り払い: 溜め(=赤い予告が出てから消え切るまで)・当たりの円の半径・威力(接触/噛みつきの倍率)・押す距離と時間。 */
export const BRAWLER_REVENGE_WINDUP_MS = 350;
export const BRAWLER_REVENGE_RADIUS = 90;
export const BRAWLER_REVENGE_DMG_MULT = 1.5;
export const BRAWLER_REVENGE_PUSH_PX = 60;
export const BRAWLER_REVENGE_PUSH_MS = 200;
/** 振り払いの後、その敵が固まらない時間(すぐ固め直せない・ms)。 */
export const BRAWLER_REVENGE_NO_HOLD_MS = 1200;
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
export const BRAWLER_HOLD_BASE_MS: Readonly<Record<BrawlerMoveKey, number>> = {
  s1: 300, s2: 300, s3: 450, s4: 450, s5: 0,
  kick1: 350, kick2: 350, kick3: 0,
  stomp: 0, kiko: 300, secret: 300, 'secret-land': 0,
};

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
/** 食らいの固まり・減衰・反撃の対象か(雑魚・強個体。ボス級は区分どおり固めない)。 */
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
/** 本当に技を出している最中か(格闘の固まり・止め・反撃の除外にだけ使う)。会心の気絶中は false(isEnemyAttacking と同じ)。 */
export const isBrawlerTechBusy = (
  e: { aiPhase?: string; chaffMove?: string; biteAt?: number; stunUntil?: number; bossFullStunUntil?: number; bossState?: string },
  gameTime: number,
): boolean => {
  if (e.stunUntil !== undefined && gameTime < e.stunUntil) return false;
  if (e.bossFullStunUntil !== undefined && gameTime < e.bossFullStunUntil) return false;
  if (e.biteAt !== undefined && e.biteAt > 0) return true;
  // ボス(天使・裏ボス・偶像・賞金首など)は技を bossState で持つ。追いかけている(chase)・帰っている(return)以外は技の最中(§12-1 でボス級も浮くため)。
  if (e.bossState !== undefined && e.bossState !== 'chase' && e.bossState !== 'return') return true;
  if (e.aiPhase === undefined) return e.chaffMove !== undefined;
  return !BRAWLER_HOLDABLE_PHASES.has(e.aiPhase);
};

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
 * ボス級は何もしない(patch 空・固まり0)。
 */
export const brawlerComboOnHit = (
  e: BrawlerComboFields, move: BrawlerMoveKey, now: number, countRevenge = true,
): { patch: Partial<BrawlerComboFields>; holdMs: number } => {
  if (!isBrawlerComboSubject(e.type)) return { patch: {}, holdMs: 0 };
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
/** 押し上げるたびに浮く高さと時間に掛ける減り(n 回目は DECAY^n)。 */
export const BRAWLER_JUGGLE_DECAY = 0.75;
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
export const BRAWLER_JUGGLE_MIN_MS = 140;
/** 空中から吹き飛ばされた時に地面へ落ちる時間(ms)。 */
export const BRAWLER_JUGGLE_DROP_MS = 200;

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
  // 空中で吹き飛ばされた(押し上げ0)=今の高さから速く叩き落とす(DROP_MS・端で速さ0の滑らかな落ち)。
  if (peak <= 0) return from * (1 - u) * (1 - u) * (1 + 2 * u);
  // 浮き(最初も追撃の浮き直しも同じ形): 打ち上がり25% → 頂点の漂い20% → 落下55%(§12-1)。
  return brawlerLiftArcRel(u, from, brawlerJuggleTop(from, peak));
};

/**
 * 格闘の当たり1回ぶんの浮き(§12-1)。cls=区分の重さ。返り値 null=浮きは変わらない。
 *  - 地上: 4段目だけが浮かせる。空中: 押し上げのある段・技で浮きが続く(n 回目ほど軽く)。
 *  - 空中で押し上げ0の技(吹き飛ばす技)=浮きを終えて、今の高さから地面へ落ちる(押しは別に効く)。
 *  - 押し上げが軽すぎたら(MIN_F 未満)もう浮かない=今の弧のまま落ちる。
 */
export const brawlerJugglePush = (
  e: BrawlerJuggleFields, cls: 'mob' | 'strong' | 'boss', move: BrawlerMoveKey, now: number,
): Partial<BrawlerJuggleFields> & { liftUntil?: number } | null => {
  const airborne = brawlerAirborne(e, now);
  const push = BRAWLER_JUGGLE_PUSH[move];
  if (!airborne) {
    if (move !== 's4') return null;
  } else if (push <= 0) {
    const h = brawlerJuggleHeightRel(e, now);
    return { brawlerLiftAt: now, brLiftMs: BRAWLER_JUGGLE_DROP_MS, brLiftPeak: 0, brLiftFrom: h, brLiftUntil: now, liftUntil: now, brLiftLand: true };
  }
  const n = airborne ? (e.brLiftN ?? 0) + 1 : 0;
  const f = push * BRAWLER_JUGGLE_WEIGHT[cls] * Math.pow(BRAWLER_JUGGLE_DECAY, n);
  if (f < BRAWLER_JUGGLE_MIN_F) return null;
  const ms = Math.max(BRAWLER_JUGGLE_MIN_MS, Math.round(BRAWLER_LIFT_MS * f));
  const from = airborne ? brawlerJuggleHeightRel(e, now) : 0;
  return { brawlerLiftAt: now, brLiftMs: ms, brLiftPeak: f, brLiftFrom: from, brLiftN: n, brLiftUntil: now + ms, liftUntil: now + ms, brLiftLand: true };
};
