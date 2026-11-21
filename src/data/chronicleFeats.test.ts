// 年表の実績(社長指示2026-10-14)。判定の純関数と「無強化」の台帳。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  achievedFeats, FEAT_KEYS, FEAT_LABELS, FEAT_ALL_SKILLS, FEAT_ALL_SUBS, FEAT_ALL_WEAPON_KEYS, FEAT_ALL_ARCHIVE_IDS,
  FEAT_BOSS_SLOT_KEYS, FEAT_MAIN_STAGE_IDS, featBossSlotKey, isNoUpgradeState,
  loadNoUpgradeLedger, noteNoUpgradeBossKill, noteNoUpgradeStageClear, clearNoUpgradeLedger, type FeatSnapshot,
} from './chronicleFeats';
import { PLAYER_UPGRADE_IDS, PLAYER_UPGRADE_MAX_LEVEL } from './playerUpgrades';
import { GHOST_DOSSIER_SLOTS } from '../utils/ghostDossier';
import type { PlayerUpgradeState } from '../utils/playerUpgrades';

const installStorage = () => {
  const m = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0,
  } as Storage;
};
const upgrades = (bought: number, active: number): PlayerUpgradeState =>
  PLAYER_UPGRADE_IDS.reduce((acc, id) => { acc[id] = { bought, active }; return acc; }, {} as PlayerUpgradeState);
const full = (): FeatSnapshot => ({
  unlockedArchiveIds: [...FEAT_ALL_ARCHIVE_IDS],
  soloBossSlotKeys: [...FEAT_BOSS_SLOT_KEYS],
  noUpgrade: { stages: [...FEAT_MAIN_STAGE_IDS], bosses: [...FEAT_BOSS_SLOT_KEYS] },
  upgrades: upgrades(PLAYER_UPGRADE_MAX_LEVEL, PLAYER_UPGRADE_MAX_LEVEL),
  ownedSkills: [...FEAT_ALL_SKILLS],
  unlockedWeaponKeys: [...FEAT_ALL_WEAPON_KEYS],
  kogarasuUnlocked: true,
  purchasedSubLevels: Object.fromEntries(FEAT_ALL_SUBS.map(k => [k, 1])),
  clearedMissionIds: ['stage-7:main', 'stage-ex1:main'],
});

describe('chronicleFeats: 判定', () => {
  it('全部そろえば10件すべて(社長の列挙順)・何も無ければ0件', () => {
    expect(achievedFeats(full())).toEqual([...FEAT_KEYS]);
    expect(FEAT_KEYS).toHaveLength(10);
    expect(achievedFeats({
      unlockedArchiveIds: [], soloBossSlotKeys: [], noUpgrade: { stages: [], bosses: [] }, upgrades: upgrades(0, 0),
      ownedSkills: [], unlockedWeaponKeys: [], kogarasuUnlocked: false, purchasedSubLevels: {}, clearedMissionIds: [],
    })).toEqual([]);
  });
  it('1つ欠けるとその実績だけ落ちる(台帳の「全部」は手で列挙していない=台帳から導く)', () => {
    const drop = (patch: Partial<FeatSnapshot>) => achievedFeats({ ...full(), ...patch });
    expect(drop({ unlockedArchiveIds: FEAT_ALL_ARCHIVE_IDS.slice(1) })).not.toContain('archive-all');
    expect(drop({ soloBossSlotKeys: FEAT_BOSS_SLOT_KEYS.slice(1) })).not.toContain('boss-solo-all');
    expect(drop({ noUpgrade: { stages: FEAT_MAIN_STAGE_IDS.slice(1), bosses: [...FEAT_BOSS_SLOT_KEYS] } })).not.toContain('noupg-stages');
    expect(drop({ noUpgrade: { stages: [...FEAT_MAIN_STAGE_IDS], bosses: FEAT_BOSS_SLOT_KEYS.slice(1) } })).not.toContain('noupg-bosses');
    expect(drop({ upgrades: upgrades(PLAYER_UPGRADE_MAX_LEVEL - 1, 0) })).not.toContain('upgrades-max');
    expect(drop({ ownedSkills: FEAT_ALL_SKILLS.slice(1) })).not.toContain('skills-all');
    expect(drop({ kogarasuUnlocked: false })).not.toContain('weapons-all');
    expect(drop({ unlockedWeaponKeys: FEAT_ALL_WEAPON_KEYS.slice(1) })).not.toContain('weapons-all');
    expect(drop({ purchasedSubLevels: Object.fromEntries(FEAT_ALL_SUBS.slice(1).map(k => [k, 1])) })).not.toContain('subs-all');
    expect(drop({ clearedMissionIds: ['stage-ex1:main'] })).not.toContain('story-clear');
    expect(drop({ clearedMissionIds: ['stage-7:main'] })).not.toContain('ex-clear');
  });
  it('最大強化は「買った段」で見る(メーターを下げていても達成)。ストーリー/EXは本物のクリア集合(missionId)だけを見る', () => {
    expect(achievedFeats({ ...full(), upgrades: upgrades(PLAYER_UPGRADE_MAX_LEVEL, 0) })).toContain('upgrades-max');
    // 検収監査A-5: 開発用の全開放はステージ集合しか書かないので、missionId を見る限り偽達成にならない。
    expect(achievedFeats({ ...full(), clearedMissionIds: [] })).not.toContain('story-clear');
  });
  it('対象の集合: 本編7ステージ(訓練は除く)/ボス16枠(研究所の城ボス枠は無い)/武器は設計図+店売り/資料は台帳全件', () => {
    expect(FEAT_MAIN_STAGE_IDS).toEqual(['stage-1', 'stage-2', 'stage-3', 'stage-4', 'stage-5', 'stage-6', 'stage-7']);
    expect(FEAT_BOSS_SLOT_KEYS).toHaveLength(16);
    expect(FEAT_BOSS_SLOT_KEYS).toContain('giantbat@stage-7');
    expect(FEAT_BOSS_SLOT_KEYS).toContain('phillboss@stage-ex1');
    expect(FEAT_BOSS_SLOT_KEYS).not.toContain('giantbat@stage-2'); // 研究所に城ボスは居ない(検収監査A-2)
    expect(FEAT_BOSS_SLOT_KEYS).not.toContain('acrasiel');
    // ★配線の一致(検収監査B-4): 対象の各キーは、実際に記録側が生成するキー(bossStyleSlotKey)と同じ規則で作れる。
    for (const s of GHOST_DOSSIER_SLOTS) {
      if (s.slotKey === 'giantbat@stage-2') continue;
      expect(featBossSlotKey(s.bossType, s.stageId ?? 'stage-5'), s.slotKey).toBe(s.slotKey);
    }
    expect(FEAT_ALL_SKILLS).not.toContain('poi-bombing'); // 警察署の3種はラン内だけ(検収監査A-4)
    expect(FEAT_ALL_WEAPON_KEYS).toContain('handgun-t1-crossbow');
    expect(FEAT_ALL_SUBS).not.toContain('shijin'); // 退役
    expect(FEAT_ALL_SKILLS).not.toContain('scrap-builder'); // 退役
    expect(FEAT_ALL_ARCHIVE_IDS.length).toBeGreaterThan(0);
    for (const k of FEAT_KEYS) expect(FEAT_LABELS[k].length).toBeGreaterThan(0);
  });
  it('無強化=メーター(active)が全系統0。買ってあっても下げていれば無強化', () => {
    expect(isNoUpgradeState(upgrades(0, 0))).toBe(true);
    expect(isNoUpgradeState(upgrades(3, 0))).toBe(true);
    expect(isNoUpgradeState(upgrades(3, 1))).toBe(false);
  });
  it('ボスのスロットキーは討伐記録と同じ規則(城ボス=ステージ別・フィル=phillboss@stage-ex1・他=型名)', () => {
    expect(featBossSlotKey('giantbat', 'stage-3')).toBe('giantbat@stage-3');
    expect(featBossSlotKey('phillboss', 'stage-ex1')).toBe('phillboss@stage-ex1');
    expect(featBossSlotKey('thor', 'stage-5')).toBe('thor');
  });
});

describe('chronicleFeats: 無強化の台帳', () => {
  beforeEach(() => { installStorage(); clearNoUpgradeLedger(); });
  it('クリア/撃破を積む。重複は1回・空は無視・リセットで消える', () => {
    noteNoUpgradeStageClear('stage-1'); noteNoUpgradeStageClear('stage-1'); noteNoUpgradeStageClear('');
    noteNoUpgradeBossKill('thor'); noteNoUpgradeBossKill('giantbat@stage-1'); noteNoUpgradeBossKill('thor');
    expect(loadNoUpgradeLedger()).toEqual({ stages: ['stage-1'], bosses: ['thor', 'giantbat@stage-1'] });
    clearNoUpgradeLedger();
    expect(loadNoUpgradeLedger()).toEqual({ stages: [], bosses: [] });
  });
  it('壊れた保存は空として読む', () => {
    localStorage.setItem('zombie.progress.noUpgradeFeats', '{"stages":"x","bosses":[1,"thor"]}');
    expect(loadNoUpgradeLedger()).toEqual({ stages: [], bosses: ['thor'] });
  });
});
