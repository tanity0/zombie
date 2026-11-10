// 出撃前のボス一覧(社長指示2026-11-02「スタートボタン押した時に、モンハンみたいに出現予定のボスたちを?で表示。
// 出会ったら名前を表示」)。ステージ → そのステージで出会い得るボスの並び。
//
// ★台帳を新しく持たない。出どころは2本だけ:
//  ① 変異体対策室の台帳 `PRACTICE_SLOTS`(城のボス・ゲートの天使・賞金首・深層の裏ボス・フィル)。
//     `reachable`(本編で会えるか)と `stageId`(どのステージか)をそのまま使う。
//  ② 変異体(英雄・解放群・宇宙飛行群・亡霊)。対策室では「確認用の枠」(出撃先=ステージ1固定・reachable=false)なので
//     ①からは引けない。本編で出るステージは `HERO_PATROL_STAGES` 1本(useGameLoop の4つの出現条件が全部これを見る)。
//
// 「出会った」は対策室の解放と同じ記録(utils/bossEncounter.ts)を見る。対策室の「常時解放」(alwaysUnlocked)は
// 確認用の入口の都合なので、ここでは見ない(本編で会うまでは「?」)。
import { PRACTICE_SLOTS, PRACTICE_HIDDEN_SLOT_KEYS, type PracticeSlot } from './bossPractice';
import { HERO_PATROL_STAGES } from './heroScript';
import { PHANTOM_BRAWLER_ENCOUNTER_KEY, PHANTOM_BRAWLER_STAGES } from './phantomBrawlerSpawn';

/** 拳鬼の一覧の絵(research/BRAWLER_PHANTOM.md §8)。 */
export const PHANTOM_BRAWLER_ICON_SPRITE = 'kenki-idle'; // 拳鬼の待機の絵(社長支給2026-11-10)
import type { EnemyType } from '../types/game';

export type SortieBossKind = 'stage' | 'gate' | 'bounty' | 'mutant' | 'phantom' | 'deep';

export interface SortieBoss {
  /** 遭遇記録のキー(bossEncounter と同じ形式)。 */
  encounterKey: string;
  bossType: EnemyType;
  kind: SortieBossKind;
  /** 対策室と同じ表示名(未指定なら enemyDeathLabel で引く=画面側)。 */
  label?: string;
  /** 出会ったことがあるか(false なら「?」)。 */
  known: boolean;
  /** 絵を引く時のステージ(城のボスはステージで絵が変わる)。 */
  iconStageId: string;
  /** 型から絵を引けない時の絵の論理名(spritePath に渡す)。固有の幻影=プレイヤーの立ち絵(research/BRAWLER_PHANTOM.md §6-3)。 */
  iconSprite?: string;
}

/** 変異体の遭遇記録キー(対策室の encounterSlotKey と同じ)。出現時に useGameLoop が記録する。 */
export const MUTANT_ENCOUNTER_KEYS = ['mutant-hero', 'mutant-liberty', 'mutant-astro', 'mutant-wraith'] as const;
export type MutantEncounterKey = typeof MUTANT_ENCOUNTER_KEYS[number];

const KIND_ORDER: readonly SortieBossKind[] = ['stage', 'gate', 'bounty', 'mutant', 'phantom', 'deep'];

const kindOfSlot = (s: PracticeSlot): SortieBossKind | null => {
  if (s.param === 'bountynow') return 'bounty';
  if (s.param === 'gateboss') return 'gate';
  if (s.bossType === 'giantbat' || s.bossType === 'phillboss') return 'stage';
  if (s.param === 'bossnow' || s.param === 'idolnow') return 'deep';
  return null; // 確認用の枠(変異体・幻影)=②で扱う/本編に居ない
};

export interface SortieRosterOpts {
  /** 英雄を昇天させた後は本編に二度と出ない(heroAscended)。 */
  heroAscended?: boolean;
}

/**
 * そのステージで出会い得るボスの並び(ステージのボス → ゲート → 賞金首 → 変異体 → 深層)。
 * 出会い得るボスが居ないステージ(チュートリアル・洋館の通路等)は空配列。
 */
export const sortieBossRoster = (
  stageId: string,
  isKnown: (encounterKey: string) => boolean,
  opts: SortieRosterOpts = {},
): SortieBoss[] => {
  const out: SortieBoss[] = [];
  for (const s of PRACTICE_SLOTS) {
    if (!s.reachable || s.stageId !== stageId || PRACTICE_HIDDEN_SLOT_KEYS.includes(s.slotKey)) continue;
    const kind = kindOfSlot(s);
    if (!kind) continue;
    if (out.some(o => o.encounterKey === s.encounterSlotKey)) continue;
    out.push({ encounterKey: s.encounterSlotKey, bossType: s.bossType, kind, label: s.label, known: isKnown(s.encounterSlotKey), iconStageId: s.stageId });
  }
  if (HERO_PATROL_STAGES.includes(stageId)) {
    for (const key of MUTANT_ENCOUNTER_KEYS) {
      if (key === 'mutant-hero' && opts.heroAscended) continue;
      const slot = PRACTICE_SLOTS.find(s => s.encounterSlotKey === key);
      if (!slot) continue;
      out.push({ encounterKey: key, bossType: slot.bossType, kind: 'mutant', label: slot.label, known: isKnown(key), iconStageId: stageId });
    }
  }
  // ③ 固有の幻影「拳鬼」(research/BRAWLER_PHANTOM.md §6-3)。本編の出るステージは PHANTOM_BRAWLER_STAGES 1本。
  // 一時停止の一覧は「この出撃で出現した物だけ」を出す(bossAppearances.appearedOnly)ので、ステージ1の条件(城のボスを倒した後)は出現の側で効く。
  if (PHANTOM_BRAWLER_STAGES.includes(stageId)) {
    const slot = PRACTICE_SLOTS.find(s => s.encounterSlotKey === PHANTOM_BRAWLER_ENCOUNTER_KEY);
    if (slot) {
      out.push({
        encounterKey: PHANTOM_BRAWLER_ENCOUNTER_KEY, bossType: slot.bossType, kind: 'phantom', label: slot.label,
        known: isKnown(PHANTOM_BRAWLER_ENCOUNTER_KEY), iconStageId: stageId, iconSprite: PHANTOM_BRAWLER_ICON_SPRITE,
      });
    }
  }
  return out.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
};
