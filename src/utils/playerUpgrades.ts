// 永続育成「強化」の純関数+保存(research/GROWTH.md v4)。値の正本は data/playerUpgrades.ts。
//
// ★ここには **store も AMMO_MAX も import しない**(循環import回避)。
//   AMMO_MAX は gameStore.ts にあるため、素値は `effectiveAmmoMax(baseMax, activeLevel)` の
//   **引数で渡す**(import時評価の初期化順事故=幻影HPで踏んだ型のバグを新規に作らない)。
//
// メーター式: 系統ごとに `bought`(購入済み段数・不可逆)と `active`(有効段数・いつでも上下可)を持ち、
// **常に 0 ≦ active ≦ bought ≦ PLAYER_UPGRADE_MAX_LEVEL**。active の変更は「次の出撃(resetGame)」から
// 反映される(ラン中の参照は Player へ焼いた値だけを読む=gameStore 側の「★焼き込みの原則」)。
import {
  PLAYER_UPGRADE_COSTS, PLAYER_UPGRADE_IDS, PLAYER_UPGRADE_MAX_LEVEL, playerUpgradeDef,
  type PlayerUpgradeId,
} from '../data/playerUpgrades';

export interface PlayerUpgradeEntry {
  /** 購入済み段数(不可逆・返金なし)。 */
  bought: number;
  /** 有効段数(メーター)。次の出撃から反映。 */
  active: number;
}

export type PlayerUpgradeState = Record<PlayerUpgradeId, PlayerUpgradeEntry>;

/** 保存キー。名前空間は進行系統(src/data/progress.ts と同じ `zombie.progress.*`)。 */
export const PLAYER_UPGRADES_KEY = 'zombie.progress.playerUpgrades';

/** 何も買っていない初期状態(=育成機能が無かった時と一致する状態)。 */
export const emptyPlayerUpgrades = (): PlayerUpgradeState =>
  PLAYER_UPGRADE_IDS.reduce((acc, id) => {
    acc[id] = { bought: 0, active: 0 };
    return acc;
  }, {} as PlayerUpgradeState);

const clampLevel = (n: unknown, max: number): number => {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : 0;
  return Math.max(0, Math.min(max, v));
};

/**
 * 保存データ/入力を「0 ≦ active ≦ bought ≦ 上限」へ必ず畳む。壊れた保存・旧データ・
 * 手で書いた値のどれが来ても、この不変条件の外へは出られない。
 */
export const normalizePlayerUpgrades = (raw: unknown): PlayerUpgradeState => {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<PlayerUpgradeId, unknown>>;
  return PLAYER_UPGRADE_IDS.reduce((acc, id) => {
    const e = (src[id] && typeof src[id] === 'object' ? src[id] : {}) as Partial<PlayerUpgradeEntry>;
    const bought = clampLevel(e.bought, PLAYER_UPGRADE_MAX_LEVEL);
    acc[id] = { bought, active: clampLevel(e.active, bought) };
    return acc;
  }, {} as PlayerUpgradeState);
};

export const loadPlayerUpgrades = (): PlayerUpgradeState => {
  if (typeof localStorage === 'undefined') return emptyPlayerUpgrades();
  try {
    const raw = localStorage.getItem(PLAYER_UPGRADES_KEY);
    return normalizePlayerUpgrades(raw ? JSON.parse(raw) : {});
  } catch {
    return emptyPlayerUpgrades();
  }
};

export const savePlayerUpgrades = (s: PlayerUpgradeState): void => {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(PLAYER_UPGRADES_KEY, JSON.stringify(normalizePlayerUpgrades(s))); }
  catch { /* ignore (quota / private mode) */ }
};

/** 次の1段の価格。上限まで買っていれば 0(=買えない)。 */
export const playerUpgradeCost = (bought: number): number =>
  bought >= PLAYER_UPGRADE_MAX_LEVEL ? 0 : (PLAYER_UPGRADE_COSTS[Math.max(0, bought)] ?? 0);

/** 有効段数の読み出し(欠損・壊れた保存は0段)。 */
export const activeUpgradeLevel = (s: PlayerUpgradeState | undefined, id: PlayerUpgradeId): number =>
  clampLevel(s?.[id]?.active, PLAYER_UPGRADE_MAX_LEVEL);

const perLevel = (id: PlayerUpgradeId): number => playerUpgradeDef(id).perLevel;
const eff = (activeLevel: number): number => clampLevel(activeLevel, PLAYER_UPGRADE_MAX_LEVEL);

// ── 段数 → 効果値(全て純関数。0段は必ず「無効果」= 加算0 / 倍率1.0 / 素値そのまま) ────────────

/** 体力: 有効段数ぶんの最大HP加算。 */
export const growthMaxHpBonus = (activeLevel: number): number => perLevel('health') * eff(activeLevel);

/** 攻撃力: 与ダメージ倍率。 */
export const growthAttackMult = (activeLevel: number): number => 1 + perLevel('attack') * eff(activeLevel);

/** ゴールド獲得: 付与額の倍率。 */
export const growthGoldMult = (activeLevel: number): number => 1 + perLevel('gold') * eff(activeLevel);

/**
 * 弾数: 所持弾薬**上限**の実効値。**素値(AMMO_MAX)は引数で受ける**(冒頭の循環import回避)。
 * マガジン装填数・リロード・弾ドロップ率の枯渇度には一切関与しない(「持てる母数」だけを広げる)。
 */
export const effectiveAmmoMax = (baseMax: number, activeLevel: number): number =>
  Math.round(baseMax * (1 + perLevel('ammo') * eff(activeLevel)));

/** 弾種ごとの素値テーブルを丸ごと実効上限へ変換する(キーは呼び出し側の型のまま)。 */
export const effectiveAmmoMaxMap = <K extends string>(
  base: Record<K, number>, activeLevel: number,
): Record<K, number> => {
  const out = {} as Record<K, number>;
  for (const k of Object.keys(base) as K[]) out[k] = effectiveAmmoMax(base[k], activeLevel);
  return out;
};
