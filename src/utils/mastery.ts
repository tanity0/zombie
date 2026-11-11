// 熟練度(武器・サブウェポン)の純関数+保存+リザルトでの確定
// (research/MASTERY.md「v2 発注仕様」+「v2.1 追補」)。値の正本は data/mastery.ts。
//
// ★ここには store も weaponUtils も import しない(循環import回避)。読むのは data/mastery(葉)と
//   utils/masteryRun(葉)だけ。player は型だけ受ける。
//
// 流れ(v2 §3・§5 / v2.1 A-4):
//  1. resetGame: recoverMasteryPending()(リザルトを通らずに終わった分を本体へ)→ 焼き込み
//     (masteryMultTable・masteryLoadoutMult)→ beginMasteryRun({ ignored: masteryIgnoredRun(...) })。
//  2. 出撃の間: masteryRun の pending に貯めるだけ(段階は変えない)。
//  3. リザルト: commitMasteryRun() を1回(GameOverScreen の最初の描画)。
import {
  GROWING_MASTERY_KEYS, MASTERY_BASE, MASTERY_GROWTH, MASTERY_KEY, MASTERY_MAX_LEVEL, MASTERY_MAX_MULT,
  MASTERY_PENDING_KEY, SUB_TO_MASTERY_KEY, isGrowingMasteryKey,
  type GrowingMasteryKey, type MasteryKey,
} from '../data/mastery';
import {
  clearMasteryReport, clearPendingMastery, getPendingMastery, hasPendingMastery, isMasteryRunCommitted,
  isMasteryRunIgnored, markMasteryRunCommitted, type MasteryXpTable,
} from './masteryRun';
import type { Player, SubWeaponKey } from '../types/game';

// ── 段階と倍率 ─────────────────────────────────────────────────────────────

/** Lv `level` → `level+1` に要る量(= base × 1.37^(level−1)・四捨五入・最低1)。 */
export const masteryNeedFor = (key: GrowingMasteryKey, level: number): number =>
  Math.max(1, Math.round(MASTERY_BASE[key] * Math.pow(MASTERY_GROWTH, Math.max(1, Math.floor(level)) - 1)));

const cleanXp = (xp: unknown): number =>
  typeof xp === 'number' && Number.isFinite(xp) ? Math.max(0, xp) : 0;

/** 今の段階と、次の段階までの進み。Lv10 では `need=0`・`frac=1`。 */
export interface MasteryProgress {
  level: number;
  /** 今の段階に入ってから貯めた量。 */
  into: number;
  /** 次の段階までに要る量(今の段階の分)。上限では 0。 */
  need: number;
  /** 次の段階までの割合(0〜1)。上限では 1。 */
  frac: number;
}

export const masteryProgress = (key: GrowingMasteryKey, xp: unknown): MasteryProgress => {
  let rest = cleanXp(xp);
  let level = 1;
  while (level < MASTERY_MAX_LEVEL) {
    const need = masteryNeedFor(key, level);
    if (rest < need) return { level, into: rest, need, frac: rest / need };
    rest -= need;
    level++;
  }
  return { level: MASTERY_MAX_LEVEL, into: rest, need: 0, frac: 1 };
};

/** xp → 段階(1〜10)。上限を超えた xp も段階は10。壊れた値は Lv1。 */
export const masteryLevelFor = (key: GrowingMasteryKey, xp: unknown): number => masteryProgress(key, xp).level;

/** 段階 → 与ダメの倍率(Lv1=×1.0 … Lv10=×1.9・範囲の外は丸める)。 */
export const masteryDamageMult = (level: number): number => {
  const l = Number.isFinite(level) ? Math.max(1, Math.min(MASTERY_MAX_LEVEL, Math.floor(level))) : 1;
  return (10 + (l - 1)) / 10;
};

// ── 保存(normalize / load / save の3点組) ─────────────────────────────────

export interface MasteryState {
  xp: Partial<Record<GrowingMasteryKey, number>>;
}

export const emptyMastery = (): MasteryState => ({ xp: {} });

/** 壊れた保存・旧データ・特別なキー・未知のキーを捨て、xp を 0 以上の有限値へ畳む。 */
export const normalizeMastery = (raw: unknown): MasteryState => {
  const src = (raw && typeof raw === 'object' ? (raw as { xp?: unknown }).xp : undefined);
  const table = (src && typeof src === 'object' ? src : {}) as Record<string, unknown>;
  const xp: Partial<Record<GrowingMasteryKey, number>> = {};
  for (const k of GROWING_MASTERY_KEYS) {
    const v = cleanXp(table[k]);
    if (v > 0) xp[k] = Math.round(v);
  }
  return { xp };
};

const readJson = (key: string): unknown => {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : {};
};

export const loadMastery = (): MasteryState => {
  if (typeof localStorage === 'undefined') return emptyMastery();
  try { return normalizeMastery(readJson(MASTERY_KEY)); }
  catch { return emptyMastery(); }
};

export const saveMastery = (s: MasteryState): void => {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(MASTERY_KEY, JSON.stringify(normalizeMastery(s))); }
  catch { /* ignore (quota / private mode) */ }
};

/** 退避(masteryPending)の読み出し。壊れていれば空。 */
export const loadStashedMasteryPending = (): MasteryXpTable => {
  if (typeof localStorage === 'undefined') return {};
  try { return normalizeMastery(readJson(MASTERY_PENDING_KEY)).xp; }
  catch { return {}; }
};

const removeStash = (): void => {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.removeItem(MASTERY_PENDING_KEY); } catch { /* ignore */ }
};

const addXp = (s: MasteryState, add: MasteryXpTable): MasteryState => {
  const xp = { ...s.xp };
  for (const k of GROWING_MASTERY_KEYS) {
    const a = cleanXp(add[k]);
    if (a > 0) xp[k] = (xp[k] ?? 0) + a;
  }
  return normalizeMastery({ xp });
};

// ── 焼き込み(resetGame) ───────────────────────────────────────────────────

/** 無視する出撃(倍率は全部1・貯めない)の判定に使う旗。resetGame が集めて渡す。 */
export interface MasteryRunFlags {
  /** isPracticeRun()(練習ラン・幻影の練習・ガントレットの枠を含む) */
  practice: boolean;
  /** isNoProgressRun()(タイトルのボス戦テスト・ベンチ等) */
  noProgress: boolean;
  bossMaker: boolean;
  gauntlet: boolean;
  /** ボット(`bot=` の出撃) */
  bot: boolean;
  /** チュートリアル(farBackdrop === 'tutorial') */
  tutorial: boolean;
  /** state.benchmarkRun */
  benchmark: boolean;
}

/** 熟練度を無視する出撃か。焼き込みと貯める側の両方がこの1本(の結果の旗)を読む。 */
export const masteryIgnoredRun = (f: MasteryRunFlags): boolean =>
  f.practice || f.noProgress || f.bossMaker || f.gauntlet || f.bot || f.tutorial || f.benchmark;

/**
 * 保存の段階 → player.masteryMult。育つキーは段階の倍率(Lv1=1 は載せない)、`max` は固定の ×1.9。
 * 無視する出撃では空(=全部1)。
 */
export const masteryMultTable = (s: MasteryState, ignoredRun: boolean): Partial<Record<MasteryKey, number>> => {
  if (ignoredRun) return {};
  const out: Partial<Record<MasteryKey, number>> = { max: MASTERY_MAX_MULT };
  for (const k of GROWING_MASTERY_KEYS) {
    const m = masteryDamageMult(masteryLevelFor(k, s.xp[k]));
    if (m !== 1) out[k] = m;
  }
  return out;
};

/** 出撃開始時に持っている物(`loadout` の平均の材料)。 */
export interface MasteryLoadoutInput {
  /** 持っている銃の種類(重複してよい=1つに数える)。 */
  gunCategories: readonly (string | undefined)[];
  /** 近接武器を持っているか。 */
  hasMelee: boolean;
  /** 持っているサブウェポン。 */
  subs: readonly SubWeaponKey[];
}

/**
 * `loadout` の倍率(v2.1 A-11)= 重複なしの集合の平均:
 * 銃の種類 + 近接(格闘を持っていれば `brawler`、無ければ `melee`。近接武器が無ければ入れない)
 * + 持っているサブのうち育つキー(`murasame`→`katana`・`brawler` は近接の枠と二重に数えない)。空なら1。
 */
export const masteryLoadoutMult = (mults: Partial<Record<MasteryKey, number>>, input: MasteryLoadoutInput): number => {
  const set = new Set<GrowingMasteryKey>();
  for (const c of input.gunCategories) if (isGrowingMasteryKey(c)) set.add(c);
  const hasBrawler = input.subs.includes('brawler');
  if (input.hasMelee) set.add(hasBrawler ? 'brawler' : 'melee');
  for (const s of input.subs) {
    const k = SUB_TO_MASTERY_KEY[s];
    if (k) set.add(k);
  }
  if (set.size === 0) return 1;
  let sum = 0;
  for (const k of set) sum += mults[k] ?? 1;
  return sum / set.size;
};

/** 読み口: `none`→1 / `loadout`→焼いた平均 / それ以外→焼いた倍率(無い欄=1)。 */
export const masteryMultOf = (
  player: Pick<Player, 'masteryMult' | 'masteryLoadoutMult'> | null | undefined,
  key: MasteryKey,
): number => {
  if (key === 'none' || !player) return 1;
  if (key === 'loadout') return player.masteryLoadoutMult ?? 1;
  return player.masteryMult?.[key] ?? 1;
};

/**
 * resetGame の頭(焼き込みより前)。リザルトを通らずに終わった出撃の分を本体へ足す(v2.1 A-4):
 * メモリの pending に残りがあればメモリを、無ければ退避(masteryPending)を足す=どちらか一方だけ。
 * その後、退避を消し、メモリの pending・報告用の表を空にする(beginMasteryRun は呼び出し側)。
 */
export const recoverMasteryPending = (): void => {
  const add = hasPendingMastery() ? getPendingMastery() : loadStashedMasteryPending();
  if (Object.values(add).some(v => (v ?? 0) > 0)) saveMastery(addXp(loadMastery(), add));
  removeStash();
  clearPendingMastery();
  clearMasteryReport();
};

// ── リザルトでの確定 ──────────────────────────────────────────────────────

export interface MasteryCommitEntry { before: number; after: number; levelBefore: number; levelAfter: number }
export type MasteryCommitResult = Partial<Record<GrowingMasteryKey, MasteryCommitEntry>>;

let lastCommit: MasteryCommitResult = {};

/**
 * リザルトへ入る時に1回。メモリの pending を本体へ足し、pending を空にし、退避も消す。
 * 戻り値=この出撃で貯めた物だけの before/after。2回目以降・無視する出撃では何も足さず空を返す。
 */
export const commitMasteryRun = (): MasteryCommitResult => {
  if (isMasteryRunCommitted()) return {};
  markMasteryRunCommitted();
  if (isMasteryRunIgnored()) { lastCommit = {}; return {}; }
  const add = getPendingMastery();
  const cur = loadMastery();
  const result: MasteryCommitResult = {};
  for (const k of GROWING_MASTERY_KEYS) {
    const a = cleanXp(add[k]);
    if (a <= 0) continue;
    const before = cur.xp[k] ?? 0;
    const after = before + a;
    result[k] = { before, after, levelBefore: masteryLevelFor(k, before), levelAfter: masteryLevelFor(k, after) };
  }
  if (Object.keys(result).length > 0) saveMastery(addXp(cur, add));
  clearPendingMastery();
  removeStash();
  lastCommit = result;
  return { ...result };
};

/** 直前の commitMasteryRun の結果(リザルトの表示が読み直す)。 */
export const getLastMasteryCommit = (): MasteryCommitResult => ({ ...lastCommit });
