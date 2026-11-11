// 熟練度の見せ方(research/MASTERY.md §6・バッチB)の純関数。
// 表示だけが読む。判定・数値・保存の形には触れない(読むのは data/mastery と utils/mastery の純関数だけ)。
//  ・リザルト: この出撃で伸びた物の並び(masteryResultRows)と、1行ぶんの「貯まる順番」(masteryFillSteps)
//  ・装備メニュー/一時停止: 段階の札(masteryBadgeOf・masteryLevelLabel)とサブウェポン → 熟練度のキー(masteryKeyOfSub)
import {
  GROWING_MASTERY_KEYS, MASTERY_MAX_LEVEL, MASTERY_MAXED_SUBS, SUB_TO_MASTERY_KEY,
  type GrowingMasteryKey,
} from '../data/mastery';
import { masteryProgress, type MasteryCommitEntry, type MasteryCommitResult, type MasteryState } from './mastery';

/**
 * 熟練の金(全画面で1つ)。作戦室の `--menu-accent` に揃える。`.command-ui` の外(リザルト・一時停止)では
 * 変数が届かないので、同じ値(#ffb340)へ落ちる。違いは明るさ・不透明度だけで付ける。
 */
export const MASTERY_GOLD = 'var(--menu-accent, #ffb340)';

/** 段階の札の文字。上限は `MAX`、それ以外は `Lv n`。 */
export const masteryLevelLabel = (level: number): string =>
  level >= MASTERY_MAX_LEVEL ? 'MAX' : `Lv ${Math.max(1, Math.floor(level))}`;

/** 札に出す熟練度のキー。`max` は「最初から最大」の物。 */
export type MasteryBadgeKey = GrowingMasteryKey | 'max';

/** サブウェポン → 札のキー。「最初から最大」の5つは `max`・育つ物はそのキー(`murasame`→`katana`)・それ以外は null。 */
export const masteryKeyOfSub = (sub: string): MasteryBadgeKey | null => {
  if (MASTERY_MAXED_SUBS.includes(sub)) return 'max';
  return SUB_TO_MASTERY_KEY[sub] ?? null;
};

export interface MasteryBadge {
  level: number;
  /** 次の段階までの割合(0〜1)。上限では 1。 */
  frac: number;
  /** 上限(`MAX` と出す)か。 */
  max: boolean;
  /** 「最初から最大」の物(キーが `max`)。札だけで棒は出さない。 */
  fixed: boolean;
}

/** 保存の値 → 札。キーが無ければ null(何も出さない)。 */
export const masteryBadgeOf = (key: MasteryBadgeKey | null | undefined, state: MasteryState): MasteryBadge | null => {
  if (!key) return null;
  if (key === 'max') return { level: MASTERY_MAX_LEVEL, frac: 1, max: true, fixed: true };
  const p = masteryProgress(key, state.xp[key]);
  return { level: p.level, frac: p.level >= MASTERY_MAX_LEVEL ? 1 : p.frac, max: p.level >= MASTERY_MAX_LEVEL, fixed: false };
};

/** リザルトの1行(この出撃で伸びた物)。 */
export interface MasteryResultRow {
  key: GrowingMasteryKey;
  entry: MasteryCommitEntry;
  /** 伸びた量(after − before)。並べ替えに使う(画面には出さない)。 */
  gain: number;
  /** この出撃で段階が上がったか。 */
  levelUp: boolean;
}

/**
 * この出撃で伸びた物(after > before)の並び。段階が上がらない物 → 上がる物の順(上がる物を最後へ回す)。
 * それぞれの中は伸びた量の多い順・同量はキーの台帳順。
 */
export const masteryResultRows = (commit: MasteryCommitResult | null | undefined): MasteryResultRow[] => {
  if (!commit) return [];
  const rows: MasteryResultRow[] = [];
  for (const key of GROWING_MASTERY_KEYS) {
    const entry = commit[key];
    if (!entry) continue;
    const gain = entry.after - entry.before;
    if (!(gain > 0)) continue;
    const levelUp = masteryProgress(key, entry.after).level > masteryProgress(key, entry.before).level;
    rows.push({ key, entry, gain, levelUp });
  }
  // sort は安定=同量は台帳順のまま
  return rows.sort((a, b) => (Number(a.levelUp) - Number(b.levelUp)) || (b.gain - a.gain));
};

/** 棒を貯める1区間: 段階 `level` の棒を `from` 割 → `to` 割まで。`levelUp` なら満ちた所で段階が1つ上がる。 */
export interface MasteryFillStep {
  level: number;
  from: number;
  to: number;
  levelUp: boolean;
}

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/**
 * 1件の確定結果 → 貯まる順番。
 *  - 段階をまたがない: [{ Lv, 前の割合 → 後の割合 }]
 *  - またぐ: 最初の段階は前の割合 → 1(levelUp)、途中は 0 → 1(levelUp)、最後の段階は 0 → 後の割合。
 *  - Lv10 に届く: 最後は Lv9 の 0(または前の割合)→ 1(levelUp)で終わる(Lv10 の区間は無い=満ちたまま MAX)。
 *  - 出撃前から Lv10: 空(棒は満ちたまま)。
 * 段階は before/after から引き直す(entry の levelBefore/levelAfter と同じ値になる)。
 */
export const masteryFillSteps = (key: GrowingMasteryKey, entry: MasteryCommitEntry): MasteryFillStep[] => {
  const p0 = masteryProgress(key, entry.before);
  const p1 = masteryProgress(key, Math.max(entry.before, entry.after));
  const steps: MasteryFillStep[] = [];
  for (let level = p0.level; level <= p1.level && level < MASTERY_MAX_LEVEL; level++) {
    const from = level === p0.level ? clamp01(p0.frac) : 0;
    const levelUp = level < p1.level;
    const to = levelUp ? 1 : clamp01(p1.frac);
    if (to <= from && !levelUp) continue;
    steps.push({ level, from, to, levelUp });
  }
  return steps;
};
