// ユニーク武器システムの解決点(UNIQUE_WEAPONS.md §4)。純関数+localStorageの薄い読み書き。
// 「どの候補キーで武器を作るか」を1本の関数(resolveSlotKey)へ集約し、これを生成点4箇所
// (weaponDrop.ts / weaponUtils.getStartingWeapons / gameStore.updateArmory / grantWeapon入口)から
// 呼ぶことで、地面の絵(pickup.weaponKey)と拾った時の実体を一致させる(§4-1)。
import { SlotCategory, SlotTier, SLOT_CATEGORIES, SLOT_TIERS, SLOT_CANDIDATES } from '../data/weaponSlots';
import { catalogCategoryTier } from './weaponUtils';
import { getWeaponUnlocks } from '../data/progress';

// 装備設定(恒久・localStorage 1キー・UNIQUE_WEAPONS.md §3-3)。キャラ別にしない(社長指定)。
export type SlotLoadout = Partial<Record<SlotCategory, Partial<Record<SlotTier, string>>>>;

const LOADOUT_KEY = 'zombie.loadout.slots';

const isSlotCategory = (v: string): v is SlotCategory => (SLOT_CATEGORIES as string[]).includes(v);
const isSlotTier = (v: number): v is SlotTier => (SLOT_TIERS as number[]).includes(v);

/** 現在の装備設定(壊れた/欠けたセーブはフィールドごとに素通り=下のresolveSlotKeyが恒等でフォールバックする)。 */
export const getSlotLoadout = (): SlotLoadout => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LOADOUT_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed as SlotLoadout : {};
  } catch {
    return {};
  }
};

const writeSlotLoadout = (loadout: SlotLoadout): void => {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(LOADOUT_KEY, JSON.stringify(loadout)); } catch { /* ignore (quota / private mode) */ }
};

/** 装備設定画面からの1マス更新(§6)。 */
export const setSlotCandidate = (category: SlotCategory, tier: SlotTier, key: string): void => {
  const cur = getSlotLoadout();
  writeSlotLoadout({ ...cur, [category]: { ...cur[category], [tier]: key } });
};

// ─────────────────────────────────────────────────────────────────────────
// 解禁(UNIQUE_WEAPONS.md §3-4/§13-3-7): 各スロットの既定候補(配列の先頭)は常に解放済み扱い。
// `?unlockall=1` は全候補を解放済み扱いにする実機確認用ツマミ(BOSS_UNLOCKが空でも動作確認できる)。
// ★pixiScene.tsのtsBool等ローカルのURLパーサは流用不可(このファイルはpixiSceneに依存できない)ので、
// ここで独自に(typeof window === 'undefined' ガード付きで)パースする。
const parseUnlockAllFlag = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('unlockall') === '1';
  } catch {
    return false;
  }
};
const UNLOCK_ALL = parseUnlockAllFlag();

// テスト用の全解放トグル(社長指示2026-09-05「オプションに武器解放を入れといて(テスト用)」)。
// オプション画面の「テスト開発用」枠から切り替える。URLツマミ `?unlockall=1` と同じ効き方だが、
// **端末に残る**ので毎回URLを付け直さなくてよい。BOSS_UNLOCK が空の間の確認手段。
const TEST_UNLOCK_KEY = 'zombie.dev.weaponUnlockAll';
export const isTestWeaponUnlockAll = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(TEST_UNLOCK_KEY) === '1';
  } catch {
    return false;
  }
};
export const setTestWeaponUnlockAll = (on: boolean): void => {
  if (typeof window === 'undefined') return;
  try {
    if (on) window.localStorage.setItem(TEST_UNLOCK_KEY, '1');
    else window.localStorage.removeItem(TEST_UNLOCK_KEY);
  } catch {
    /* プライベートモード等で書けなくても落とさない */
  }
};

const forEachSlot = (fn: (category: SlotCategory, tier: SlotTier) => void): void => {
  for (const category of SLOT_CATEGORIES) {
    for (const tier of SLOT_TIERS) fn(category, tier);
  }
};

/** 各スロットの既定候補(先頭)。未解放でも常に使える(§3-3「壊れたセーブで詰まない」)。 */
export const defaultSlotKeys = (): Set<string> => {
  const set = new Set<string>();
  forEachSlot((category, tier) => set.add(SLOT_CANDIDATES[category][tier][0]));
  return set;
};

/** 全カテゴリ×Tierの候補キー全部(既定+ユニーク)。`?unlockall=1`用。 */
export const allSlotCandidateKeys = (): Set<string> => {
  const set = new Set<string>();
  forEachSlot((category, tier) => { for (const k of SLOT_CANDIDATES[category][tier]) set.add(k); });
  return set;
};

/** 「今、実際に使ってよい」候補キーの集合(既定 ∪ 恒久解放 ∪ ?unlockall=1 ∪ テスト用トグル)。 */
export const unlockedWeaponKeys = (): Set<string> => {
  if (UNLOCK_ALL || isTestWeaponUnlockAll()) return allSlotCandidateKeys();
  const set = defaultSlotKeys();
  for (const k of getWeaponUnlocks()) set.add(k);
  return set;
};

// ─────────────────────────────────────────────────────────────────────────
/**
 * ★仕組みの中心(UNIQUE_WEAPONS.md §4)。入力キーの category/tier を CATALOG から引き、
 * そのスロットの設定キーへ解決する。**設定が無い / 未解放 / スロット外 / 近接(category無し) /
 * スロット候補が1つしかない(=横が無いカテゴリ)→ 入力キーをそのまま返す(恒等)。**
 * **冪等**: resolveSlotKey(resolveSlotKey(k, ...), ...) === resolveSlotKey(k, ...)。
 * (設定が「解放済みの候補」を指す限り、どの入力キーを渡しても同じ設定キーへ収束するため。)
 */
export const resolveSlotKey = (
  key: string,
  loadout: SlotLoadout,
  unlocked: ReadonlySet<string>,
): string => {
  const { category, tier } = catalogCategoryTier(key);
  if (!category || tier === undefined || !isSlotCategory(category) || !isSlotTier(tier)) return key; // 近接/未知キー
  const candidates = SLOT_CANDIDATES[category][tier];
  if (!candidates || candidates.length <= 1) return key; // 横が無いスロット(第1弾はハンドガンのみ)
  const configured = loadout[category]?.[tier];
  if (!configured) return key; // 未設定
  if (!candidates.includes(configured)) return key; // 壊れた/古いセーブ=スロット外のキー
  if (!unlocked.has(configured)) return key; // 未解放
  return configured;
};

/** 生成点から呼ぶ薄い合成版(現在の装備設定+解禁状況を自分で読む)。UNIQUE_WEAPONS.md §4-1。 */
export const resolveSlotKeyNow = (key: string): string =>
  resolveSlotKey(key, getSlotLoadout(), unlockedWeaponKeys());
