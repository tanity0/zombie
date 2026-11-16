// 資料室「特殊変異体」の棚の並び(社長指示2026-11-16「ボス全種にバックストーリー」)。純関数+既読の記録。
// 本文の台帳は data/bossStories.ts、倒した記録は utils/bossDefeated.ts(キー=encounterSlotKey)。
// 顔は作戦室の地図・一時停止の地図と同じ頭の切り抜き(data/bossHeadCrops.ts)。表に無い絵は face=null(画面は顔なしの丸で出す)。
import { BOSS_STORIES, type BossStoryEntry, type BossStoryGroup } from '../data/bossStories';
import { BOSS_HEAD_CROPS, type BossHeadCrop } from '../data/bossHeadCrops';
import { PRACTICE_SLOTS } from './bossPractice';
import { bossIconName } from './bossIcon';
import { PATROL_MAP_BOSS } from './sortieMapBosses';

/** 小見出しの並び(対策室の棚の順 PRACTICE_CATEGORY_ORDER に沿う: 賞金首→徘徊→城ボス→関所→裏ボス)。 */
export const BOSS_STORY_GROUP_ORDER: readonly BossStoryGroup[] = ['賞金首', '徘徊', '城ボス', '関所', '裏ボス'];

/** 対策室には居るが棚に載せない枠: 汎用の幻影(本編に居ない=倒した記録が付かない)。 */
export const BOSS_STORY_EXCLUDED_KEYS: readonly string[] = ['guardian-phantom'];

export interface BossStoryFace { sprite: string; crop: BossHeadCrop }

export interface BossStoryCell {
  entry: BossStoryEntry;
  unlocked: boolean;
  /** 倒したが、まだ本文を開いていない(棚に未読の点を出す)。 */
  unread: boolean;
  face: BossStoryFace | null;
}

export interface BossStoryGroupView { group: BossStoryGroup; cells: BossStoryCell[] }

/** その枠の顔(頭の切り抜き)。拳鬼は型(guardian-phantom)では絵が引けないので徘徊の枠の絵を使う(pauseMapFaces と同じ引き方)。 */
export const bossStoryFace = (key: string): BossStoryFace | null => {
  let sprite: string | null;
  if (key === PATROL_MAP_BOSS.brawler.key) {
    sprite = PATROL_MAP_BOSS.brawler.sprite;
  } else {
    const slot = PRACTICE_SLOTS.find(s => s.encounterSlotKey === key);
    sprite = slot ? bossIconName(slot.bossType, slot.stageId) : null;
  }
  if (!sprite) return null;
  const crop = BOSS_HEAD_CROPS[sprite];
  return crop ? { sprite, crop } : null;
};

/**
 * 棚の中身。`defeated`=倒した記録のキー集合、`allUnlocked`=開発用に全部開く(`?archiveall=1`)、
 * `read`=本文を開いたことのあるキー集合。空の小見出しは出さない。
 */
export const buildBossStoryGroups = (
  defeated: ReadonlySet<string>,
  allUnlocked = false,
  read: ReadonlySet<string> = new Set(),
): BossStoryGroupView[] =>
  BOSS_STORY_GROUP_ORDER
    .map(group => ({
      group,
      cells: BOSS_STORIES.filter(e => e.group === group).map(entry => {
        const unlocked = allUnlocked || defeated.has(entry.key);
        return { entry, unlocked, unread: unlocked && !read.has(entry.key), face: bossStoryFace(entry.key) };
      }),
    }))
    .filter(g => g.cells.length > 0);

/** 名前を「本体」と末尾の括弧書き(例: 「(変異体)」)に分ける。括弧が無ければ suffix は空。棚の表示だけで使う。 */
export const splitBossStoryName = (name: string): { main: string; suffix: string } => {
  const m = /^(.+?)([(（][^()（）]*[)）])$/.exec(name);
  return m ? { main: m[1], suffix: m[2] } : { main: name, suffix: '' };
};

// ---- 既読(本文を開いたか)。localStorage 1キー。保存できない環境でも表示は止めない。 ----
const READ_KEY = 'boss.storyRead.v1';

/** 本文を開いたことのあるキーの集合。 */
export const loadReadBossStories = (): Set<string> => {
  try {
    const raw = localStorage.getItem(READ_KEY);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
};

/** 本文を開いた記録を足し、足した後の集合を返す(既読なら書かない)。 */
export const markBossStoryRead = (key: string): Set<string> => {
  const set = loadReadBossStories();
  if (set.has(key)) return set;
  set.add(key);
  try { localStorage.setItem(READ_KEY, JSON.stringify([...set])); } catch { /* 保存不可でも表示は続ける */ }
  return set;
};

/** 開発用: `?archiveall=1` で特殊変異体の棚を全部開く(表示だけ=倒した記録は書かない)。 */
export const BOSS_STORY_ARCHIVE_ALL: boolean =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('archiveall') === '1';
