// research/WEAPON_AI_TEST.md S1-b(全武器AI実機テスト・道具作り専用): 出撃時に対象武器/サブを
// 強制する開発ツマミ。`?unlockall=1`(weaponSlot.ts)と同じ作法——**開発導線なので進行
// (localStorage)へは一切書き込まない**。URLはページロード時点(モジュール評価時)に1回だけ読む
// (以降の書き換えは反映しない=他の開発ツマミと同じ)。
// ★これは道具作りで、ゲームの遊びの仕様は1ミリも変えない: パラメータが無ければ両方とも
// null になり、参照側(getStartingWeapons/grantWeapon/resetGame等)は従来どおりの分岐を通る。
//
// 検証用の妥当キー集合は data/weaponSlots.ts(SLOT_CANDIDATES)と data/campaign.ts
// (SUB_WEAPON_KEYS/CHARACTER_SUBWEAPON_KEYS)から作る。どちらも純データファイルで
// weaponUtils.ts/weaponSlot.ts/gameStore.tsを import しないため、このファイルを
// それらから import しても循環にならない。
import { SLOT_CATEGORIES, SLOT_TIERS, SLOT_CANDIDATES } from '../data/weaponSlots';
import { SUB_WEAPON_KEYS, CHARACTER_SUBWEAPON_KEYS } from '../data/campaign';
import type { SubWeaponKey } from '../types/game';

const readUrlParam = (name: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
};

// SLOT_CANDIDATESの平坦化(ユニーク21挺+各カテゴリの既定キー)。weaponUtils.tsの
// DIRECT_GUN_WEAPON_KEYSと同じ作り方だが、循環import(weaponUtils→devTestKnobs→weaponUtils)を
// 避けるため同じ元データ(data/weaponSlots.ts)からここでも独立に組む。
const VALID_DEV_WEAPON_KEYS: ReadonlySet<string> = new Set<string>(
  SLOT_CATEGORIES.flatMap(cat => SLOT_TIERS.flatMap(tier => SLOT_CANDIDATES[cat][tier]))
);

/** `?weapon=<key>`: 出撃時の銃をそのキーの武器そのものにする(21ユニーク+各カテゴリ既定キーのみ有効)。 */
export const DEV_WEAPON_KEY: string | null = (() => {
  const v = readUrlParam('weapon');
  return v && VALID_DEV_WEAPON_KEYS.has(v) ? v : null;
})();

const VALID_DEV_SUB_KEYS: ReadonlySet<string> = new Set<string>([...SUB_WEAPON_KEYS, ...CHARACTER_SUBWEAPON_KEYS]);

/** `?sub=<key>`: 出撃時にサブウェポンを所持させる(装備選択で選べる候補+キャラ固有サブのみ有効)。 */
export const DEV_SUB_KEY: SubWeaponKey | null = (() => {
  const v = readUrlParam('sub');
  return v && VALID_DEV_SUB_KEYS.has(v) ? (v as SubWeaponKey) : null;
})();

/** どちらかのテスト用ツマミが立っているか(S2-bの観測窓の露出ゲート等に使う)。 */
export const DEV_LOADOUT_ACTIVE: boolean = DEV_WEAPON_KEY !== null || DEV_SUB_KEY !== null;
