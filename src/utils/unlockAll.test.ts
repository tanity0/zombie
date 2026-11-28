// 開発用「すべて解放」(utils/unlockAll)のテスト。社長指示2026-11-28。
// 掟: オンの間だけ各判定が「本来の判定 || isUnlockAllOn()」になる。**保存されている進行の記録は書き換えない**
// (オフにすれば元の進み具合に戻る)。localStorage は最小スタブ(既存テストと同じ作法)。
import { describe, it, expect, beforeEach } from 'vitest';

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
} as Storage;

const { isUnlockAllOn, setUnlockAllOn, resetUnlockAllCacheForTest, withUnlockAll, UNLOCK_ALL_KEY } = await import('./unlockAll');
const { STAGES, POLICE_REWARD_SKILLS, UNLOCK_ALL_SKILL_KEYS, skillMaxLevel, shownOwnedSkills, shownOwnedSkillLevels, shownSubShelfLevel } = await import('../data/campaign');
const { isStageUnlocked, isStageUnlockedRecorded, isKogarasuUnlocked, isKogarasuUnlockedRecorded, markKogarasuUnlocked, emptyStoryFlags } = await import('../data/progress');
const { canShowEx, canShowExRecorded, revisitCardState } = await import('./storyProgress');
const { ARCHIVE_RECORDS, isRecordUnlocked, shownUnlockedRecordIds, emptyStoryArchiveState } = await import('../data/storyArchive');
const { isBrawlerArtLearned, setKenkiLevelForTest } = await import('./kenkiLevel');
const { isAvatarUnlocked, LOCKED_AVATARS } = await import('./avatarUnlock');
const { PRACTICE_SLOTS, practiceSlotUnlocked } = await import('./bossPractice');
const { buildBossStoryGroups } = await import('./bossStoryArchive');
const { lockedPreviewStage } = await import('./opsMapSelect');
const { nextOperationStage } = await import('./dsHome');
const { unlockedWeaponKeys, shelfWeaponKeys, allSlotCandidateKeys, defaultSlotKeys } = await import('./weaponSlot');
const { isGachaComplete } = await import('./gachaGuarantee');

type SkillKey = import('../types/game').SkillKey;
const stage = (id: string) => {
  const s = STAGES.find(x => x.id === id);
  if (!s) throw new Error(`no stage ${id}`);
  return s;
};
const lockedMain = STAGES.find(s => s.kind === 'main' && s.unlockBy !== null)!;
const exStage = STAGES.find(s => s.kind === 'ex' && !s.hidden)!;

beforeEach(() => {
  store.clear();
  resetUnlockAllCacheForTest();
  setKenkiLevelForTest(1);
});

describe('スイッチ本体', () => {
  it('既定はオフ・切り替えると1つのキーにだけ書く・オフで消す', () => {
    expect(isUnlockAllOn()).toBe(false);
    setUnlockAllOn(true);
    expect(isUnlockAllOn()).toBe(true);
    expect([...store.keys()]).toEqual([UNLOCK_ALL_KEY]);
    setUnlockAllOn(false);
    expect(isUnlockAllOn()).toBe(false);
    expect(store.size).toBe(0);
  });

  it('起動し直しても端末の値を読む', () => {
    store.set(UNLOCK_ALL_KEY, '1');
    resetUnlockAllCacheForTest();
    expect(isUnlockAllOn()).toBe(true);
  });

  it('withUnlockAll: オフは本来の集合のコピー・オンは全部を足す(元の集合は変えない)', () => {
    const real = new Set(['a']);
    const off = withUnlockAll(real, ['a', 'b']);
    expect([...off]).toEqual(['a']);
    expect(off).not.toBe(real);
    setUnlockAllOn(true);
    expect([...withUnlockAll(real, ['a', 'b'])].sort()).toEqual(['a', 'b']);
    expect([...real]).toEqual(['a']);
  });
});

describe('各判定は「本来 || すべて解放」', () => {
  it('ステージの解放(unlockBy)', () => {
    expect(isStageUnlocked(lockedMain, new Set())).toBe(false);
    setUnlockAllOn(true);
    expect(isStageUnlocked(lockedMain, new Set())).toBe(true);
    expect(isStageUnlockedRecorded(lockedMain, new Set())).toBe(false); // 本来の判定は動かない
  });

  it('EX の表示と洋館の再訪', () => {
    const flags = emptyStoryFlags();
    expect(canShowEx(flags)).toBe(false);
    expect(revisitCardState(flags, false)).toBe('hidden');
    setUnlockAllOn(true);
    expect(canShowEx(flags)).toBe(true);
    expect(canShowExRecorded(flags)).toBe(false);
    expect(revisitCardState(flags, false)).toBe('available');
    // クリア済みはクリア済みのまま
    expect(revisitCardState({ ...flags, revisitCleared: true }, false)).toBe('cleared');
  });

  it('資料室の記録(エンディング後の資料・グレンの薬を含む全件)', () => {
    const st = emptyStoryArchiveState();
    expect(isRecordUnlocked('mission-glen-medicine', st)).toBe(false);
    expect(shownUnlockedRecordIds(st)).toEqual([]);
    setUnlockAllOn(true);
    expect(isRecordUnlocked('mission-glen-medicine', st)).toBe(true);
    expect(isRecordUnlocked('investigation_17_contact_reason', st)).toBe(true);
    expect(isRecordUnlocked('no-such-record', st)).toBe(false); // 台帳に無いIDは開かない
    expect(new Set(shownUnlockedRecordIds(st))).toEqual(new Set(ARCHIVE_RECORDS.map(r => r.id)));
    expect(st.unlockedRecordIds).toEqual([]); // 渡した状態は書き換えない
  });

  it('格闘の技(体得)。孫悟空のレベルは変えない', () => {
    expect(isBrawlerArtLearned('gouge')).toBe(false);
    expect(isBrawlerArtLearned('mogura')).toBe(false);
    setUnlockAllOn(true);
    expect(isBrawlerArtLearned('gouge')).toBe(true);
    expect(isBrawlerArtLearned('mogura')).toBe(true);
    expect(store.has('zombie.progress.kenkiLevel')).toBe(false);
  });

  it('アバター', () => {
    const id = LOCKED_AVATARS[0];
    expect(isAvatarUnlocked(id)).toBe(false);
    setUnlockAllOn(true);
    expect(isAvatarUnlocked(id)).toBe(true);
  });

  it('対策室の枠(遭遇)と特殊変異体の棚(撃破)', () => {
    const slot = PRACTICE_SLOTS.find(s => !s.alwaysUnlocked)!;
    expect(practiceSlotUnlocked(slot, new Set())).toBe(false);
    expect(buildBossStoryGroups(new Set()).flatMap(g => g.cells).some(c => c.unlocked)).toBe(false);
    setUnlockAllOn(true);
    expect(practiceSlotUnlocked(slot, new Set())).toBe(true);
    expect(buildBossStoryGroups(new Set()).flatMap(g => g.cells).every(c => c.unlocked)).toBe(true);
  });

  it('作戦室の地図: 未解放の予告を出さない', () => {
    const target = { stage: stage('stage-1'), kind: 'next' as const };
    const before = lockedPreviewStage(STAGES, target);
    setUnlockAllOn(true);
    expect(lockedPreviewStage(STAGES, target)).toBeNull();
    // オフに戻せば元どおり
    setUnlockAllOn(false);
    expect(lockedPreviewStage(STAGES, target)).toEqual(before);
  });

  it('「次の作戦」は本来の進み具合のまま(EX へ飛ばない)', () => {
    const off = nextOperationStage(STAGES, new Set(), emptyStoryFlags());
    setUnlockAllOn(true);
    const on = nextOperationStage(STAGES, new Set(), emptyStoryFlags());
    expect(on?.id).toBe(off?.id);
    expect(on?.id).not.toBe(exStage.id);
  });

  it('銃: 装備で全部えらべる・棚は空(全部開発済みに見える)', () => {
    expect(unlockedWeaponKeys()).toEqual(defaultSlotKeys());
    setUnlockAllOn(true);
    expect(unlockedWeaponKeys()).toEqual(allSlotCandidateKeys());
    expect(shelfWeaponKeys().size).toBe(0);
  });

  it('小烏丸: 解禁に見えるが、本来の記録と「初めて解禁した」の書き込みは本物の記録を見る', () => {
    expect(isKogarasuUnlocked()).toBe(false);
    setUnlockAllOn(true);
    expect(isKogarasuUnlocked()).toBe(true);
    expect(isKogarasuUnlockedRecorded()).toBe(false);
    expect(markKogarasuUnlocked()).toBe(true); // オン中に本当に倒しても、記録はちゃんと書かれる
    expect(isKogarasuUnlockedRecorded()).toBe(true);
  });

  it('スキル・サブウェポンの所持(見え方)。オフなら渡したものをそのまま返す', () => {
    const owned: SkillKey[] = ['sharpshooter'];
    const levels: Partial<Record<SkillKey, number>> = { sharpshooter: 1 };
    expect(shownOwnedSkills(owned)).toBe(owned);
    expect(shownOwnedSkillLevels(levels)).toBe(levels);
    expect(shownSubShelfLevel('dog', {})).toBe(0);
    expect(shownSubShelfLevel('dog', { dog: 2 })).toBe(2);
    setUnlockAllOn(true);
    const ownedArr: SkillKey[] = [...owned];
    const shown = shownOwnedSkills(ownedArr);
    expect(new Set(shown)).toEqual(new Set(UNLOCK_ALL_SKILL_KEYS));
    expect(shown.some(k => POLICE_REWARD_SKILLS.includes(k))).toBe(false);
    expect(shownOwnedSkills(ownedArr)).toBe(shown); // 同じ入力なら作り直さない(毎フレームの購読から引かれる)
    const lv = shownOwnedSkillLevels(levels);
    expect(UNLOCK_ALL_SKILL_KEYS.every(k => lv[k] === skillMaxLevel(k))).toBe(true);
    expect(shownOwnedSkillLevels(levels)).toBe(lv);
    expect(levels).toEqual({ sharpshooter: 1 });
    expect(shownSubShelfLevel('dog', {})).toBe(3);
  });

  it('ガチャのコンプリート: 見えている所持で判定する(オンならコンプリート・保存の所持では未達のまま)', () => {
    const owned: SkillKey[] = ['sharpshooter'];
    const levels: Partial<Record<SkillKey, number>> = { sharpshooter: 1 };
    expect(isGachaComplete(shownOwnedSkills(owned), shownOwnedSkillLevels(levels))).toBe(false);
    setUnlockAllOn(true);
    expect(isGachaComplete(shownOwnedSkills(owned), shownOwnedSkillLevels(levels))).toBe(true);
    expect(isGachaComplete(owned, levels)).toBe(false);
  });
});

describe('記録は書き換えない', () => {
  it('オンで判定を一通り引いても、スイッチのキー以外は何も書かれない', () => {
    setUnlockAllOn(true);
    isStageUnlocked(lockedMain, new Set());
    canShowEx(emptyStoryFlags());
    isRecordUnlocked('mission-glen-medicine', emptyStoryArchiveState());
    isBrawlerArtLearned('heel');
    isAvatarUnlocked(LOCKED_AVATARS[0]);
    isKogarasuUnlocked();
    unlockedWeaponKeys();
    shelfWeaponKeys();
    buildBossStoryGroups(new Set());
    expect([...store.keys()]).toEqual([UNLOCK_ALL_KEY]);
  });
});
