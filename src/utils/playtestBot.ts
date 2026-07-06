// M9-B: デバッグボットの入力合成(PACING_PUZZLE.md §5.10)。
// 目的はデバッグ(バランス測定ではない)ため、上手さより「想定外の遊び方」を重視した
// ペルソナ5種(叩き台)。純関数(store/Reactに依存しない)= ユニットテスト可能。
// 呼び出し側(headless driver)がこの決定を実際の store アクション(movePlayer/triggerCounter/
// setActiveWeapon)へ反映する。
import type { Enemy, InputState, Player } from '../types/game';

export type BotPersona = 'standard' | 'kiter' | 'stationary' | 'boar' | 'wanderer';

export const BOT_PERSONAS: BotPersona[] = ['standard', 'kiter', 'stationary', 'boar', 'wanderer'];

export interface BotDecision {
  input: InputState;
  wantsMelee: boolean;        // このtickに triggerCounter() を呼ぶか
  wantsWeaponSwitch: boolean; // このtickに武器切替を試みるか(所持武器を巡回)
}

const STILL_INPUT: InputState = { up: false, down: false, left: false, right: false };
const MELEE_ENGAGE_DIST = 80;   // この距離以内なら近接(カウンター)を試みる
const SURROUND_RADIUS = 140;    // この距離以内の敵数で「囲まれた」を判定
const SURROUND_COUNT = 3;

const distTo = (px: number, py: number, e: Enemy): number => Math.hypot(e.x - px, e.y - py);

const nearestEnemy = (px: number, py: number, enemies: Enemy[]): Enemy | undefined => {
  let best: Enemy | undefined;
  let bestD = Infinity;
  for (const e of enemies) {
    const d = distTo(px, py, e);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
};

// スタン中(gameTime基準)の敵を優先ターゲットにする(標準ペルソナ=処刑優先)。
const nearestStunned = (px: number, py: number, enemies: Enemy[], gameTime: number): Enemy | undefined => {
  let best: Enemy | undefined;
  let bestD = Infinity;
  for (const e of enemies) {
    if (e.stunUntil === undefined || e.stunUntil <= gameTime) continue;
    const d = distTo(px, py, e);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
};

const dirInput = (dx: number, dy: number): InputState => ({
  up: dy < -0.3, down: dy > 0.3, left: dx < -0.3, right: dx > 0.3,
});

const approach = (pcx: number, pcy: number, e: Enemy): InputState => {
  const dx = e.x - pcx, dy = e.y - pcy;
  const n = Math.max(0.001, Math.hypot(dx, dy));
  return dirInput(dx / n, dy / n);
};

const retreat = (pcx: number, pcy: number, e: Enemy): InputState => {
  const dx = pcx - e.x, dy = pcy - e.y;
  const n = Math.max(0.001, Math.hypot(dx, dy));
  return dirInput(dx / n, dy / n);
};

// 放浪ペルソナ用: ラン開始時に一度だけ選ぶ固定方向(spawn からの一方向へ直進=戦闘無視)。
const WANDER_DIRS: InputState[] = [
  { up: true, down: false, left: false, right: false },
  { up: false, down: false, left: false, right: true },
  { up: false, down: true, left: false, right: false },
  { up: false, down: false, left: true, right: false },
];
export const wanderDirForSeed = (seed: number): InputState => WANDER_DIRS[Math.abs(seed) % WANDER_DIRS.length];

export const decideBotInput = (
  persona: BotPersona,
  player: Player,
  enemies: Enemy[],
  gameTime: number,
  tickIndex: number,
  wanderSeed: number,
): BotDecision => {
  const pcx = player.x + player.width / 2;
  const pcy = player.y + player.height / 2;

  switch (persona) {
    case 'wanderer':
      // 戦闘を完全に無視し、ラン開始時に決めた一方向へ直進(深部へ)。
      return { input: wanderDirForSeed(wanderSeed), wantsMelee: false, wantsWeaponSwitch: false };

    case 'stationary': {
      // 移動しない。近接圏内の敵にだけ反応する(棒立ちでも殴りはする)。
      const target = nearestEnemy(pcx, pcy, enemies);
      const engage = !!target && distTo(pcx, pcy, target) < MELEE_ENGAGE_DIST;
      return { input: STILL_INPUT, wantsMelee: engage, wantsWeaponSwitch: tickIndex % 600 === 0 };
    }

    case 'kiter': {
      // 常に最寄り敵から距離を取る「引き撃ち専」。近接は使わず、銃の自動射撃だけに頼る。
      const target = nearestEnemy(pcx, pcy, enemies);
      if (!target) return { input: STILL_INPUT, wantsMelee: false, wantsWeaponSwitch: false };
      return { input: retreat(pcx, pcy, target), wantsMelee: false, wantsWeaponSwitch: tickIndex % 900 === 0 };
    }

    case 'boar': {
      // 常に最寄り敵へ突進し、カウンター(近接)を多用する「猪」。
      const target = nearestEnemy(pcx, pcy, enemies);
      if (!target) return { input: STILL_INPUT, wantsMelee: false, wantsWeaponSwitch: false };
      const d = distTo(pcx, pcy, target);
      return { input: approach(pcx, pcy, target), wantsMelee: d < MELEE_ENGAGE_DIST, wantsWeaponSwitch: false };
    }

    case 'standard':
    default: {
      // 近い敵を撃ち(自動射撃に任せる)・囲まれたら離れ・スタン敵は処刑優先。
      const stunned = nearestStunned(pcx, pcy, enemies, gameTime);
      const target = stunned ?? nearestEnemy(pcx, pcy, enemies);
      if (!target) return { input: STILL_INPUT, wantsMelee: false, wantsWeaponSwitch: tickIndex % 1200 === 0 };
      const nearbyCount = enemies.filter(e => distTo(pcx, pcy, e) < SURROUND_RADIUS).length;
      if (nearbyCount >= SURROUND_COUNT) {
        const d = distTo(pcx, pcy, target);
        return { input: retreat(pcx, pcy, target), wantsMelee: d < MELEE_ENGAGE_DIST, wantsWeaponSwitch: false };
      }
      const d = distTo(pcx, pcy, target);
      if (d > MELEE_ENGAGE_DIST) {
        return { input: approach(pcx, pcy, target), wantsMelee: false, wantsWeaponSwitch: false };
      }
      return { input: STILL_INPUT, wantsMelee: true, wantsWeaponSwitch: false };
    }
  }
};
