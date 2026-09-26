// スキル「救難信号」(rescue-signal) の純関数群。近接ヒット時に一定確率で味方(プレイヤーと
// 別クラス)が背後から飛来し、対象の敵へ必中1撃(倍率1・素の近接ダメージ)を入れる。
// レンダラ非依存・store非依存=ヘッドレスでユニットテスト可能(src/utils)。実際の発生/演出/
// ダメージ適用の配線は src/store/gameStore.ts(applyRescueSignalProc/tickRescueAllies)側。

import type { CharacterClass } from '../types/game';

// レベル別の発動率(叩き台。ターレット等とのバランス調整は今後・数値は暫定)。
// index 0 は「未所持/Lv0」用のダミー(常に0%)。
export const RESCUE_SIGNAL_CHANCE_BY_LEVEL: readonly number[] = [0, 0.10, 0.15, 0.20];

// スキルレベル(0..3)から発動率(0..1)を引く。範囲外は端にクランプ(0=未所持扱い/3超は3扱い)。
export const rescueSignalProcChance = (level: number): number => {
  const lvl = Math.max(0, Math.min(RESCUE_SIGNAL_CHANCE_BY_LEVEL.length - 1, Math.floor(level)));
  return RESCUE_SIGNAL_CHANCE_BY_LEVEL[lvl] ?? 0;
};

// 対象選定に必要な最小限の情報(store の Enemy 型そのものを要求せず、テストしやすい形に絞る)。
export interface RescueSignalTargetCandidate {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  health: number;
}

// 索敵は「プレイヤー(fromX/fromY)から maxRange(=ハンドガン射程)以内」に限る(社長指示v0.25.1615)。
// 近接ヒットした敵(hitEnemyId)が生存 かつ 射程内 ならそれを対象にする。既に死亡(そのスイングで
// 倒された=enemies配列に存在しない、またはhealth<=0)or 射程外なら、射程内で最も近い生存敵へ。
// 射程内に生存中の敵が誰もいなければ null(=発動をスキップ=範囲内に敵がいなければ発動しない)。
export const selectRescueSignalTarget = <T extends RescueSignalTargetCandidate>(
  hitEnemyId: string,
  enemies: readonly T[],
  fromX: number,
  fromY: number,
  maxRange: number,
): T | null => {
  const maxSq = maxRange * maxRange;
  const distSqFrom = (e: T): number => {
    const dx = e.x + e.width / 2 - fromX;
    const dy = e.y + e.height / 2 - fromY;
    return dx * dx + dy * dy;
  };
  const hit = enemies.find(e => e.id === hitEnemyId && e.health > 0);
  if (hit && distSqFrom(hit) <= maxSq) return hit;
  let best: T | null = null;
  let bestDistSq = Infinity;
  for (const e of enemies) {
    if (e.health <= 0) continue;
    const distSq = distSqFrom(e);
    if (distSq <= maxSq && distSq < bestDistSq) { bestDistSq = distSq; best = e; }
  }
  return best;
};

// プレイアブル4クラス。援護に来る仲間はプレイヤーの現在クラスと異なるものをランダムに選ぶ。
export const RESCUE_SIGNAL_ALLY_CLASSES: readonly CharacterClass[] = ['warrior', 'mage', 'rogue', 'necromancer'];

export const pickRescueSignalAllyClass = (
  currentClass: CharacterClass,
  rng: () => number = Math.random,
): CharacterClass => {
  const pool = RESCUE_SIGNAL_ALLY_CLASSES.filter(c => c !== currentClass);
  if (pool.length === 0) return currentClass; // 理論上到達しない(4クラス中3つは必ず残る)
  const idx = Math.max(0, Math.min(pool.length - 1, Math.floor(rng() * pool.length)));
  return pool[idx];
};
