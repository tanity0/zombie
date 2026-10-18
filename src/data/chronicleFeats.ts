// 年表の「実績」行(社長指示2026-10-14「年表に、資料を全て解放 / ボスをソロで全撃破 / 無強化で全ステージクリア /
// 無強化でボスを全撃破 / 全ステータス最大強化 / 全スキル解放 / 全武器解放(購入) / 全サブウェポン解放 /
// ストーリークリア / EXストーリークリア なども入れて」)。
//
// ここは**判定の純関数と無強化の台帳だけ**(store を読まない葉)。進行データを集めて年表へ書くのは
// utils/chronicleFeatsSync.ts(呼び出し点=勝利の瞬間・拠点メニューを開いた時・エンディング)。
// 年表の行は recordChronicleGlobalFirst('feat','feat',<key>,<label>,true)=ゲーム全体で各1回。
//
// ★「無強化」の定義(設計者が決めた・社長の言葉に定義が無い): 拠点の**ステータス強化のメーターが全て0**
// (`PlayerUpgradeState.active` が全系統0)の状態で出撃した**そのラン**で達成したもの。買ってあっても
// メーターを下げて出撃すれば無強化(スコア補正の縛りと同じ読み方)。スキル・武器・サブウェポンは問わない。
import type { PlayerUpgradeState } from '../utils/playerUpgrades';
import { PLAYER_UPGRADE_IDS, PLAYER_UPGRADE_MAX_LEVEL } from './playerUpgrades';
import { SKILL_KEYS, RETIRED_SKILLS, NEW_SLEEPING_SKILLS, POLICE_REWARD_SKILLS, SUB_WEAPON_KEYS, CHARACTER_SUBWEAPON_KEYS, RETIRED_SUB_WEAPONS, STAGES } from './campaign';
import { BOSS_UNLOCK, STORE_SOLD_KEYS, FEAT_EXCLUDED_WEAPON_KEYS } from './weaponSlots';
import { ARCHIVE_RECORDS } from './storyArchive';
import { GHOST_DOSSIER_SLOTS } from '../utils/ghostDossier';
import { bossStyleSlotKey } from '../utils/ghostSlot';
import type { EnemyType, SkillKey, SubWeaponKey } from '../types/game';

export type FeatKey =
  | 'archive-all' | 'boss-solo-all' | 'noupg-stages' | 'noupg-bosses' | 'upgrades-max'
  | 'skills-all' | 'weapons-all' | 'subs-all' | 'story-clear' | 'ex-clear';

/** 年表に出る文(社長の言葉のまま)。順は社長の列挙順。 */
export const FEAT_LABELS: Readonly<Record<FeatKey, string>> = {
  'archive-all': '資料を全て解放',
  'boss-solo-all': 'ボスをソロで全撃破',
  'noupg-stages': '無強化で全ステージクリア',
  'noupg-bosses': '無強化でボスを全撃破',
  'upgrades-max': '全ステータス最大強化',
  'skills-all': '全スキル解放',
  'weapons-all': '全武器解放',
  'subs-all': '全サブウェポン解放',
  'story-clear': 'ストーリークリア',
  'ex-clear': 'EXストーリークリア',
};
export const FEAT_KEYS: readonly FeatKey[] = Object.keys(FEAT_LABELS) as FeatKey[];
/** 年表のキー(`${stageId}::${kind}::${detail}`)の stageId/kind。見出し無し(stageChronicleLabel が '' を返す)。 */
export const FEAT_STAGE_ID = 'feat';

// ---- 各実績の「全部」の集合(台帳から導く=手で列挙しない) ----
/** 本編ステージ(訓練は除く)。 */
export const FEAT_MAIN_STAGE_IDS: readonly string[] = STAGES.filter(s => s.kind === 'main' && s.id !== 'stage-tutorial').map(s => s.id);
/** 守護霊の討伐記録スロット=ソロ撃破の対象ボス(アクラシエルは記録枠が無いので対象外)。
 * ★検収監査A-2: 'giantbat@stage-2' は研究所に城ボスが居ない(bossPractice/gauntlet「城ボス不在」)=誰にも倒せないので外す。 */
export const FEAT_BOSS_SLOT_KEYS: readonly string[] = GHOST_DOSSIER_SLOTS.map(s => s.slotKey).filter(k => k !== 'giantbat@stage-2');
/** 永続で所持できるスキル全て(退役・未配線を除く。★検収監査A-4: 警察署の3種はラン内だけの付与で所持リストに残らない=除く)。 */
export const FEAT_ALL_SKILLS: readonly SkillKey[] = SKILL_KEYS.filter(k =>
  !RETIRED_SKILLS.includes(k) && !NEW_SLEEPING_SKILLS.includes(k) && !POLICE_REWARD_SKILLS.includes(k));
/** 開発施設の棚に並ぶサブウェポン全て(クラス固有・退役は除く)。 */
export const FEAT_ALL_SUBS: readonly SubWeaponKey[] = SUB_WEAPON_KEYS.filter(k => !CHARACTER_SUBWEAPON_KEYS.includes(k) && !RETIRED_SUB_WEAPONS.includes(k));
/** 購入(開発)できる武器全て=ボス設計図の武器+店売り。小烏丸は別台帳(kogarasuUnlocked)。 */
// research/NEW_GUNS.md(品質監査#15): 後から足した3挺(FEAT_EXCLUDED_WEAPON_KEYS)は数えない=既に達成した人が未達に戻らない。
export const FEAT_ALL_WEAPON_KEYS: readonly string[] = [...new Set([...Object.values(BOSS_UNLOCK), ...STORE_SOLD_KEYS])]
  .filter(k => !FEAT_EXCLUDED_WEAPON_KEYS.includes(k));
export const FEAT_ALL_ARCHIVE_IDS: readonly string[] = ARCHIVE_RECORDS.map(r => r.id);

/** 討伐記録(bossStyles)と同じスロットキー=唯一の規則 bossStyleSlotKey をそのまま使う(別の規則を作らない)。 */
export const featBossSlotKey = (type: EnemyType, stageId: string): string => bossStyleSlotKey(type, stageId);

/** 無強化=メーターが全系統0。 */
export const isNoUpgradeState = (u: PlayerUpgradeState): boolean =>
  PLAYER_UPGRADE_IDS.every(id => (u[id]?.active ?? 0) === 0);

// ---- 無強化の台帳(localStorage) ----
export interface NoUpgradeLedger { stages: string[]; bosses: string[] }
export const NO_UPGRADE_LEDGER_KEY = 'zombie.progress.noUpgradeFeats';
export const loadNoUpgradeLedger = (): NoUpgradeLedger => {
  if (typeof localStorage === 'undefined') return { stages: [], bosses: [] };
  try {
    const raw = localStorage.getItem(NO_UPGRADE_LEDGER_KEY);
    const o = raw ? JSON.parse(raw) as Partial<NoUpgradeLedger> : {};
    const arr = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    return { stages: arr(o.stages), bosses: arr(o.bosses) };
  } catch { return { stages: [], bosses: [] }; }
};
const saveNoUpgradeLedger = (l: NoUpgradeLedger): void => {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(NO_UPGRADE_LEDGER_KEY, JSON.stringify(l)); } catch { /* ignore */ }
};
/** 無強化のランでステージをクリアした(勝利の瞬間・クリア扱いになったステージだけ)。 */
export const noteNoUpgradeStageClear = (stageId: string): void => {
  const l = loadNoUpgradeLedger();
  if (!stageId || l.stages.includes(stageId)) return;
  saveNoUpgradeLedger({ ...l, stages: [...l.stages, stageId] });
};
/** 無強化のランでボスを倒した(討伐記録と同じスロットキー)。 */
export const noteNoUpgradeBossKill = (slotKey: string): void => {
  const l = loadNoUpgradeLedger();
  if (!slotKey || l.bosses.includes(slotKey)) return;
  saveNoUpgradeLedger({ ...l, bosses: [...l.bosses, slotKey] });
};
export const clearNoUpgradeLedger = (): void => {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.removeItem(NO_UPGRADE_LEDGER_KEY); } catch { /* ignore */ }
};

// ---- 判定(純関数) ----
export interface FeatSnapshot {
  unlockedArchiveIds: readonly string[];
  soloBossSlotKeys: readonly string[];   // 守護霊の記録(bossStyles)のキー=ソロ撃破済み
  noUpgrade: NoUpgradeLedger;
  upgrades: PlayerUpgradeState;
  ownedSkills: readonly SkillKey[];
  unlockedWeaponKeys: readonly string[]; // 購入済みユニーク武器
  kogarasuUnlocked: boolean;
  purchasedSubLevels: Readonly<Partial<Record<SubWeaponKey, number>>>;
  /** 本物のクリアだけが書く集合(missionId=`${stageId}:main`)。開発用の全開放(unlockAllStages)はここには書かない(検収監査A-5)。 */
  clearedMissionIds: readonly string[];
}

const hasAll = (have: readonly string[], need: readonly string[]): boolean => {
  const s = new Set(have);
  return need.length > 0 && need.every(k => s.has(k));
};

/** いま達成している実績(順は社長の列挙順)。 */
export const achievedFeats = (s: FeatSnapshot): FeatKey[] => {
  const out: FeatKey[] = [];
  if (hasAll(s.unlockedArchiveIds, FEAT_ALL_ARCHIVE_IDS)) out.push('archive-all');
  if (hasAll(s.soloBossSlotKeys, FEAT_BOSS_SLOT_KEYS)) out.push('boss-solo-all');
  if (hasAll(s.noUpgrade.stages, FEAT_MAIN_STAGE_IDS)) out.push('noupg-stages');
  if (hasAll(s.noUpgrade.bosses, FEAT_BOSS_SLOT_KEYS)) out.push('noupg-bosses');
  if (PLAYER_UPGRADE_IDS.every(id => (s.upgrades[id]?.bought ?? 0) >= PLAYER_UPGRADE_MAX_LEVEL)) out.push('upgrades-max');
  if (hasAll(s.ownedSkills, FEAT_ALL_SKILLS)) out.push('skills-all');
  if (hasAll(s.unlockedWeaponKeys, FEAT_ALL_WEAPON_KEYS) && s.kogarasuUnlocked) out.push('weapons-all');
  if (FEAT_ALL_SUBS.every(k => (s.purchasedSubLevels[k] ?? 0) >= 1)) out.push('subs-all');
  if (s.clearedMissionIds.includes('stage-7:main')) out.push('story-clear');
  if (s.clearedMissionIds.includes('stage-ex1:main')) out.push('ex-clear');
  return out;
};
