// ★兵士のトス(research/ESCORT_TOSS.md・社長指示2026-10-12「進軍NPCは稀に(クリティカルで？)こちらに敵を吹き飛ばしてくる。
// 吹き飛んだ敵を近接するとクリティカル中と同じ扱いにする」)。
// 兵士の会心で倒れずに気絶した敵を、プレイヤーの手前(近接が届く所)へ飛ばす。気絶は既存のまま=近接は既存のとどめ。
// ここは判定と幾何の純関数だけ(store が呼ぶ・テストで固定する)。gameStore を import しない。
import type { Enemy, EnemyType } from '../types/game';
import { isBossType, isCorpse, isHangedman, isHordeFollower, resistsChipKnockback } from './enemyUtils';

/** 飛ぶ時間(ms・ゲーム時間)。 */
export const ESCORT_TOSS_MS = 420;
/** 前のトスからこれだけ空ける(ms・ゲーム時間)=「稀に」。 */
export const ESCORT_TOSS_CD_MS = 8000;
/** まだ一度もトスしていない時の「前回の時刻」(出撃の0msからでも間隔に掛からない)。 */
export const ESCORT_TOSS_NEVER = -1e9;
/** 敵の中心からプレイヤーの中心までの距離の範囲(px)。近すぎると飛ばす意味が無い/遠すぎると届かない。 */
export const ESCORT_TOSS_MIN_DIST = 160;
export const ESCORT_TOSS_MAX_DIST = 640;
/** 着地点=プレイヤーの中心から敵の方へこの距離(px・近接が届く所)。 */
export const ESCORT_TOSS_STOP_PX = 72;
/** 着地点を「プレイヤーの向いている側」へ回す最大角(度)。真正面へ一直線だと突進してくる敵に見えるため(クリエイティブ監査 #1)。 */
export const ESCORT_TOSS_SWING_DEG = 35;

export interface EscortTossInput {
  enemy: Pick<Enemy, 'type' | 'health' | 'corpseUntil' | 'dormant' | 'fromEvent' | 'aiPhase' | 'hordeLeaderId' | 'hordeState'>
    & { x: number; y: number; width: number; height: number };
  playerCx: number;
  playerCy: number;
  playerAlive: boolean;
  inputLocked: boolean;      // 会話・一時停止・アテンション
  gameTime: number;
  lastTossAt: number;        // 前のトスの時刻(まだ無い時は ESCORT_TOSS_NEVER)
}

/** 型として飛ばせるか(ボス級・使者・押されにくい型は飛ばさない)。 */
export const escortTossableType = (t: EnemyType): boolean =>
  !isBossType(t) && !isHangedman(t) && !resistsChipKnockback(t);

/** いまトスしてよいか(兵士の会心で倒れずに気絶した瞬間に呼ぶ)。 */
export const escortTossDecision = (i: EscortTossInput): boolean => {
  const e = i.enemy;
  if (!i.playerAlive || i.inputLocked) return false;
  if (i.gameTime - i.lastTossAt < ESCORT_TOSS_CD_MS) return false;
  if (!(e.health > 0) || isCorpse(e) || e.dormant === true || e.fromEvent) return false;
  if (!escortTossableType(e.type) || isHordeFollower(e)) return false;
  if (e.aiPhase === 'jump' || e.aiPhase === 'charge') return false; // 技を完遂するまで位置が動かない(品質監査 A-2)
  const d = Math.hypot(e.x + e.width / 2 - i.playerCx, e.y + e.height / 2 - i.playerCy);
  return d >= ESCORT_TOSS_MIN_DIST && d <= ESCORT_TOSS_MAX_DIST;
};

/**
 * 着地点(敵の中心が来る点)。プレイヤーの中心から敵の方へ STOP_PX の点を、プレイヤーの向き(faceX/faceY)の側へ
 * 最大 SWING_DEG 回す(向きが無い・敵が真後ろ/真正面なら回さない向きも含めて、近い側へ寄せる)。
 */
export const escortTossLanding = (
  enemyCx: number, enemyCy: number, playerCx: number, playerCy: number, faceX: number, faceY: number,
): { x: number; y: number } => {
  let ax = enemyCx - playerCx, ay = enemyCy - playerCy;
  const al = Math.hypot(ax, ay) || 1;
  ax /= al; ay /= al;
  let ang = Math.atan2(ay, ax);
  const fl = Math.hypot(faceX, faceY);
  if (fl > 0.001) {
    const fa = Math.atan2(faceY / fl, faceX / fl);
    let diff = fa - ang;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const max = (ESCORT_TOSS_SWING_DEG * Math.PI) / 180;
    ang += Math.max(-max, Math.min(max, diff));
  }
  return { x: playerCx + Math.cos(ang) * ESCORT_TOSS_STOP_PX, y: playerCy + Math.sin(ang) * ESCORT_TOSS_STOP_PX };
};

/** 飛んでいる途中の位置の割合(ease-out=1-(1-t)^2・初速最大→着地で0)。 */
export const escortTossProgress = (gameTime: number, startAt: number, endAt: number): number => {
  const t = Math.max(0, Math.min(1, (gameTime - startAt) / Math.max(1, endAt - startAt)));
  return 1 - (1 - t) * (1 - t);
};

// ---------------------------------------------------------------------------------------------
// ★v3.1(社長指示2026-10-13): 兵士の蹴り飛ばし。画面内の気絶中の敵へ、一番近い兵士が(どこに居ても)0.5秒で背後へ跳び、
// 着地してすぐ蹴る → 敵がプレイヤーの斜め前まで地面を滑り込む。research/ESCORT_TOSS.md「仕様 v3.1」。
// ---------------------------------------------------------------------------------------------
/** しゃがみ(溜め)。KILL の跳びつきと同じ型(しゃがみ→跳躍)。 */
export const ESCORT_KICK_CROUCH_MS = 100;
/** 跳躍。しゃがみと合わせて 0.5秒(社長「どんなに遠くても0.5秒で背後にジャンプ」)。 */
export const ESCORT_KICK_JUMP_MS = 400;
/** 着地から命中まで(足を引く)。 */
export const ESCORT_KICK_WINDUP_MS = 200;
/** 命中から元の動きへ戻るまで(踏み込み→反動→戻り)。 */
export const ESCORT_KICK_RECOVER_MS = 220;
/** 蹴る位置=敵の体の縁からさらにこれだけ外(敵の背中側)。 */
export const ESCORT_KICK_BEHIND_PX = 26;
/** 気絶の残りが「命中まで+これ」以上ある敵だけ。滑り(ESCORT_TOSS_MS)と、着いてからプレイヤーがとどめを入れる間(600ms)を含む
 *  (滑りの途中や着いた直後に気絶が切れて、目の前に来たのにとどめが刺せない、を作らない・検収 A-4)。 */
export const ESCORT_KICK_STUN_MARGIN_MS = ESCORT_TOSS_MS + 600;
/** 割り当てから命中まで。 */
export const ESCORT_KICK_TO_HIT_MS = ESCORT_KICK_CROUCH_MS + ESCORT_KICK_JUMP_MS + ESCORT_KICK_WINDUP_MS;
/** プレイヤーまでこの距離より近い敵は蹴らない(すでに目の前)。 */
export const ESCORT_KICK_MIN_DIST = ESCORT_TOSS_MIN_DIST;

/** 蹴りの進行(store.escortKick)。時計はゲーム時間。 */
export interface EscortKick {
  escortId: string;
  enemyId: string;
  startAt: number;   // 割り当て=しゃがみ開始
  fromX: number; fromY: number; // 跳ぶ前の兵士の足元
  toX: number; toY: number;     // 蹴る位置(兵士の足元)
  dirX: number; dirY: number;   // 蹴る向き(=敵が滑る向き)
  landAt: number;    // 着地
  hitAt: number;     // 命中
  endAt: number;     // 元の動きへ
  hitDone: boolean;
  aborted: boolean;  // 中止(跳躍中なら着地まで飛んでから終わる)
}

/** 型・状態として蹴ってよいか(気絶・画面・距離は見ない)。割り当てと着地の再判定が同じ1本を使う。 */
export const escortKickableState = (
  e: Pick<Enemy, 'type' | 'health' | 'corpseUntil' | 'dormant' | 'fromEvent' | 'aiPhase' | 'hordeLeaderId' | 'hordeState'>,
): boolean =>
  e.health > 0 && !isCorpse(e) && e.dormant !== true && !e.fromEvent && escortTossableType(e.type) && !isHordeFollower(e)
  && e.aiPhase !== 'jump' && e.aiPhase !== 'charge';

/** 蹴る対象になれる敵か(画面内・気絶の残り・型/状態・プレイヤーまでの距離)。onScreen は呼び手が測る(ズーム込みの可視域)。 */
export const escortKickTargetOk = (
  e: Pick<Enemy, 'type' | 'health' | 'corpseUntil' | 'dormant' | 'fromEvent' | 'aiPhase' | 'hordeLeaderId' | 'hordeState' | 'stunUntil' | 'escortToss'>
    & { x: number; y: number; width: number; height: number },
  gameTime: number, playerCx: number, playerCy: number, onScreen: boolean,
  abort: { enemyId: string; stunUntil: number } | null, id: string,
): boolean => {
  if (!onScreen || e.escortToss) return false;
  if (!escortKickableState(e)) return false;
  if (e.stunUntil === undefined || e.stunUntil - gameTime < ESCORT_KICK_TO_HIT_MS + ESCORT_KICK_STUN_MARGIN_MS) return false;
  if (abort && abort.enemyId === id && abort.stunUntil === e.stunUntil) return false; // この気絶中に一度中止した敵
  return Math.hypot(e.x + e.width / 2 - playerCx, e.y + e.height / 2 - playerCy) >= ESCORT_KICK_MIN_DIST;
};

/**
 * 蹴る位置(兵士の足元)。着地点→敵の延長線上の、敵の背中側(蹴る向きと滑る向きを一致させる)。
 * 足元の高さは敵の足元の線に揃える。戻り値 dir=蹴る向き(敵→着地点)。
 */
export const escortKickPoint = (
  enemy: { x: number; y: number; width: number; height: number }, landX: number, landY: number,
): { x: number; y: number; dirX: number; dirY: number } => {
  const ecx = enemy.x + enemy.width / 2, ecy = enemy.y + enemy.height / 2;
  let dx = landX - ecx, dy = landY - ecy;
  const dl = Math.hypot(dx, dy) || 1;
  dx /= dl; dy /= dl;
  const back = enemy.width / 2 + ESCORT_KICK_BEHIND_PX;
  return { x: ecx - dx * back, y: enemy.y + enemy.height - dy * back, dirX: dx, dirY: dy };
};

/**
 * 跳躍の位置(足元)。しゃがみの間は from、跳躍の間は**横は等速**(現実の跳躍=横の速さは変わらない。縦の放物線は描画が足す)、着地後は to。
 * 横を smoothstep にすると「真上に上がってから横へ流れ、ふわっと降りる」になり、跳んできた勢いのまま蹴れない(検収クリエイティブ #3)。
 */
export const escortKickJumpPos = (k: Pick<EscortKick, 'fromX' | 'fromY' | 'toX' | 'toY' | 'startAt'>, gameTime: number): { x: number; y: number; t: number } => {
  const t = Math.max(0, Math.min(1, (gameTime - k.startAt - ESCORT_KICK_CROUCH_MS) / ESCORT_KICK_JUMP_MS));
  return { x: k.fromX + (k.toX - k.fromX) * t, y: k.fromY + (k.toY - k.fromY) * t, t };
};

/** (敵, 兵士) の組のうち、兵士から敵までが一番近い組。どちらも呼び手が条件で絞った候補。 */
export const pickEscortKickPair = <E extends { id: string; x: number; y: number; width: number; height: number }, S extends { id: string; x: number; y: number }>(
  enemies: readonly E[], escorts: readonly S[],
): { enemy: E; escort: S } | null => {
  let best: { enemy: E; escort: S } | null = null, bestD = Infinity;
  for (const e of enemies) {
    const ex = e.x + e.width / 2, ey = e.y + e.height;
    for (const s of escorts) {
      const d = Math.hypot(s.x - ex, s.y - ey);
      if (d < bestD) { bestD = d; best = { enemy: e, escort: s }; }
    }
  }
  return best;
};

/** 止まり際に行き過ぎる量(px)。慣性=止まる所で一度だけ行き過ぎて戻る(クリエイティブ監査 v3 #11)。 */
export const ESCORT_TOSS_OVERSHOOT_PX = 5;
/**
 * 滑り込みの進んだ距離(px)。前の 86% の時間で (距離+行き過ぎ) まで ease-out で進み(着く直前に速度0)、
 * 残りで行き過ぎを戻す(smoothstep)。最後は必ず dist ちょうど(着地点がずれない)。
 */
export const escortTossSlideDist = (gameTime: number, startAt: number, endAt: number, dist: number): number => {
  const t = Math.max(0, Math.min(1, (gameTime - startAt) / Math.max(1, endAt - startAt)));
  const t1 = 0.86;
  const os = Math.min(ESCORT_TOSS_OVERSHOOT_PX, dist * 0.1);
  if (t < t1) { const u = t / t1; return (dist + os) * (1 - (1 - u) * (1 - u)); }
  const u = (t - t1) / (1 - t1);
  return dist + os - os * u * u * (3 - 2 * u);
};
