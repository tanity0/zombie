// ジャンプ着地攻撃(パンプキン/研究所Lv3/ハンター/旧ジャイアントバット)の一歩を、呼べる形に切り出した純関数。
// 縮み溜め(crouch)→ その時のプレイヤーの所へ跳ぶ(jump・空中は障害物を越える)→ 着地(爆風)→ 着地後の停止(recover)。
// gameStore.updateEnemies の中に書かれていた物をそのまま移した(挙動は1bitも変えていない)。
// research/BRAWLER_PHANTOM.md §15: 拳鬼の跳びかかりもこの同じ一歩を、ハンターの値のまま呼ぶ(書き写さない)。
import type { Enemy } from '../types/game';
import { airHopEase01 } from './airHop';

export type GroundJumpActor = Pick<Enemy,
  'x' | 'y' | 'width' | 'height' | 'aiPhase' | 'aiPhaseUntil' | 'aiStartedAt' | 'aiFromX' | 'aiFromY' | 'aiTargetX' | 'aiTargetY'>;

export interface GroundJumpInput {
  gameTime: number;
  /** 着地の狙い(=いまのプレイヤーの中心)。溜めが明けた瞬間の値で着地点が決まる(以後動かない)。 */
  aimX: number;
  aimY: number;
  /** 攻撃の時刻の割り(gameTime + ms / ENEMY_ATTACK_SPEED_MULT)。 */
  atkUntil: (ms: number) => number;
  /** ゲームスピード(ENEMY_ATTACK_SPEED_MULT)。滞空の進みを atkUntil と同じ割り方で出す。 */
  attackSpeedMult: number;
  /** 滞空の時間(割る前の ms)。パンプキン=PUMPKIN_JUMP_MS / ハンター=÷HUNTER_JUMP_SPEED_MULT。 */
  jumpMsRaw: number;
  /** 着地後の停止(割る前の ms)。pumpkinRecoverMs(type)。 */
  recoverMsRaw: number;
  /** 着地点の頭打ち(ハンターの視界の縁・パンプキンの最大距離)。無ければプレイヤーの所そのまま。 */
  clampAim?: (ecx: number, ecy: number, ax: number, ay: number, dist: number) => { x: number; y: number };
  /** 空中で盾にぶつかったか(ぶつかったらその場に落ちるだけ=爆発なし)。 */
  shieldHit?: (nx: number, ny: number) => boolean;
}

export interface GroundJumpStep {
  /** 敵へ合成するパッチ。 */
  patch: Partial<Enemy>;
  /** 着地した(爆風の中心=着地した体の中心)。 */
  landed?: { x: number; y: number };
  /** 空中で盾にぶつかって落ちた所(体の中心)。 */
  blocked?: { x: number; y: number };
  /** 着地後の停止が明けた(呼び手が次の溜めまでの猶予などを書く)。 */
  done?: boolean;
}

/** 溜めを始める(縮み溜め)。 */
export const groundJumpStartCrouch = (atkUntil: (ms: number) => number, crouchMsRaw: number): Partial<Enemy> =>
  ({ aiPhase: 'crouch', aiPhaseUntil: atkUntil(crouchMsRaw), vx: 0, vy: 0 });

/** いまの相の一歩。crouch/jump/recover 以外なら null(呼び手の通常の動きへ)。 */
export const groundJumpStep = (e: GroundJumpActor, i: GroundJumpInput): GroundJumpStep | null => {
  const { gameTime } = i;
  if (e.aiPhase === 'crouch') {
    if (gameTime >= (e.aiPhaseUntil ?? 0)) {
      // 溜め終了 → ジャンプ開始(この瞬間のプレイヤー位置へ。アークは描画側)。
      const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
      const dist = Math.hypot(i.aimX - ecx, i.aimY - ecy);
      const at = i.clampAim ? i.clampAim(ecx, ecy, i.aimX, i.aimY, dist) : { x: i.aimX, y: i.aimY };
      return {
        patch: {
          aiPhase: 'jump', vx: 0, vy: 0,
          aiFromX: e.x, aiFromY: e.y,
          aiTargetX: at.x - e.width / 2, aiTargetY: at.y - e.height / 2,
          aiStartedAt: gameTime, aiPhaseUntil: i.atkUntil(i.jumpMsRaw),
        },
      };
    }
    return { patch: { vx: 0, vy: 0 } }; // 溜め中は静止(縮みは描画側)
  }
  if (e.aiPhase === 'jump') {
    // ジャンプ滞空時間も攻撃倍速で短縮(着地=t>=1。set側 aiPhaseUntil と同じ scaled 値で揃える)。
    const t = Math.max(0, Math.min(1, (gameTime - (e.aiStartedAt ?? gameTime)) / (i.jumpMsRaw / i.attackSpeedMult)));
    const fx = e.aiFromX ?? e.x, fy = e.aiFromY ?? e.y;
    const tx = e.aiTargetX ?? e.x, ty = e.aiTargetY ?? e.y;
    // v0.25.3076(社長指示「滑空って全てのジャンプね」): 汎用ジャンプも同じ曲線で運ぶ。着地時刻・着地点・爆発判定はすべて不変。
    const gEs = airHopEase01(t);
    const nx = fx + (tx - fx) * gEs;
    const ny = fy + (ty - fy) * gEs;
    // 盾にぶつかったらジャンプ攻撃をキャンセルして、その場に落ちるだけ(爆発なし)。
    if (i.shieldHit?.(nx, ny)) {
      return {
        patch: { x: nx, y: ny, vx: 0, vy: 0, aiPhase: 'recover', aiStartedAt: gameTime, aiPhaseUntil: i.atkUntil(i.recoverMsRaw) },
        blocked: { x: nx + e.width / 2, y: ny + e.height / 2 },
      };
    }
    if (t >= 1) {
      return {
        patch: { x: tx, y: ty, vx: 0, vy: 0, aiPhase: 'recover', aiPhaseUntil: i.atkUntil(i.recoverMsRaw) },
        landed: { x: tx + e.width / 2, y: ty + e.height / 2 },
      };
    }
    return { patch: { x: nx, y: ny, vx: 0, vy: 0 } }; // 空中は障害物を飛び越える(衝突無視)
  }
  if (e.aiPhase === 'recover') {
    if (gameTime >= (e.aiPhaseUntil ?? 0)) return { patch: { vx: 0, vy: 0, aiPhase: undefined }, done: true };
    return { patch: { vx: 0, vy: 0 } }; // 着地後の停止
  }
  return null;
};

/** 円の爆風がプレイヤーに掛かるか(爆心からプレイヤーの中心までが 半径+プレイヤーの当たり半径 以内)。applyPumpkinBlastDamage と同じ式。 */
export const groundBlastCircleHits = (px: number, py: number, pr: number, bx: number, by: number, radius: number): boolean =>
  Math.hypot(px - bx, py - by) <= radius + pr;
