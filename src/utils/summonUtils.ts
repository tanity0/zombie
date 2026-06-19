// 錬金術(alchemy)サブウェポンの定数と召喚ユニット生成。
// 召喚ユニット(Summon)は敵(Enemy)とは別配列。見た目/速度は敵タイプを流用する。
// 数値は実機調整前提の仮値(TODO)。

import { EnemyType, Summon, SummonKind } from '../types/game';
import { getEnemyBaseSize, getEnemyBaseSpeed } from './enemyUtils';

export const ALCHEMY_CHANNEL_MS = 5000;                 // 立ち止まりチャネル(魔法陣完成まで)
export const ALCHEMY_MAX_NORMAL = 3;                    // 通常個体の最大数(FIFO)
export const ALCHEMY_RARE_CHANCE = 0.10;                // 完成時のレア確率
export const ALCHEMY_SUMMON_HP_BY_LEVEL = [0, 200, 300, 400] as const; // 固定HP(敵スケーリングは使わない・耐久2倍)
export const ALCHEMY_SUMMON_TYPE_BY_LEVEL: (EnemyType | null)[] = [null, 'zombie', 'werewolf', 'pumpkin'];
export const ALCHEMY_RARE_TYPE: EnemyType = 'reaper';   // レアは死神ヴィジュアル
export const ALCHEMY_SUMMON_DAMAGE = 4;                 // 付随的な低火力
export const ALCHEMY_FOLLOW_GAP_PX = 160;               // 主人公から保つ間合い(~5歩)。密着しない
export const ALCHEMY_DESPAWN_DIST = 1100;               // この距離より離れたら消滅(画面外十分)
export const ALCHEMY_AGGRO_RANGE = 380;                 // 敵を引きつける距離(=ハンドガン距離)
export const ALCHEMY_ATTACK_RANGE = 44;                 // 通常個体が敵に接触攻撃する間合い(近接)
export const ALCHEMY_ATTACK_INTERVAL_MS = 600;          // 通常個体の攻撃間隔(throttle)
export const ALCHEMY_RARE_LIFETIME_MS = 10000;          // レアは10秒で必ず消滅
export const ALCHEMY_RARE_MELEE_INTERVAL_MS = 500;      // レア(死神): 巻き込み範囲への近接攻撃間隔
export const ALCHEMY_RARE_MELEE_DAMAGE = 10;            // レア(死神)の近接AoEダメージ(TODO: 実機調整)
export const ALCHEMY_RARE_SUCTION_RADIUS = ALCHEMY_AGGRO_RANGE * 1.5; // レア吸引の見た目範囲
export const ALCHEMY_RARE_SUCTION_PULL_RANGE = ALCHEMY_AGGRO_RANGE;   // 実際に吸引が発生する距離
export const ALCHEMY_RARE_SUCTION_MAX_TARGETS = 12;     // 1tickの吸引対象上限(負荷cap)
export const ALCHEMY_RARE_SUCTION_SPEED = 320;          // 吸引速度(px/s)
export const ALCHEMY_SUMMON_TINT = 0x38bdf8;            // 味方識別のシアンtint
export const SHOP_ALCHEMY_COST = 100;                   // 商人での錬金術カード価格

const clampLevel = (lvl: number): number => Math.max(1, Math.min(3, Math.round(lvl)));

// 召喚ユニット生成。x,y は中心座標(内部で左上に変換)。
// hpMult: スキル「ナイト」(召喚最大HP ×1.5)用。既定1。
export const buildSummon = (level: number, kind: SummonKind, x: number, y: number, hpMult = 1): Summon => {
  const lvl = clampLevel(level);
  const now = Date.now();
  const rng = Math.random().toString(36).slice(2, 7);

  if (kind === 'rare') {
    const size = getEnemyBaseSize(ALCHEMY_RARE_TYPE);
    return {
      id: `summon-rare-${now}-${rng}`,
      x: x - size.width / 2,
      y: y - size.height / 2,
      width: size.width,
      height: size.height,
      speed: getEnemyBaseSpeed(ALCHEMY_RARE_TYPE),
      health: 1,
      maxHealth: 1, // 耐久制ではない: 10秒で消滅
      damage: 0,
      kind: 'rare',
      reusedType: ALCHEMY_RARE_TYPE,
      level: lvl,
      createdAt: now,
      expiresAt: now + ALCHEMY_RARE_LIFETIME_MS,
      lastHit: 0,
    };
  }

  const type = ALCHEMY_SUMMON_TYPE_BY_LEVEL[lvl] ?? 'zombie';
  const size = getEnemyBaseSize(type);
  const hp = Math.round(ALCHEMY_SUMMON_HP_BY_LEVEL[lvl] * hpMult);
  return {
    id: `summon-${lvl}-${now}-${rng}`,
    x: x - size.width / 2,
    y: y - size.height / 2,
    width: size.width,
    height: size.height,
    speed: getEnemyBaseSpeed(type),
    health: hp,
    maxHealth: hp,
    damage: ALCHEMY_SUMMON_DAMAGE,
    kind: 'normal',
    reusedType: type,
    level: lvl,
    createdAt: now,
    lastHit: 0,
  };
};
