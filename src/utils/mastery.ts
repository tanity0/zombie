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
  DEFAULT_MELEE_MASTERY_KEY, GROWING_MASTERY_KEYS, LEGACY_MELEE_MASTERY_KEY, MASTERY_BASE, MASTERY_GROWTH, MASTERY_KEY,
  MASTERY_MAX_LEVEL, MASTERY_MAX_MULT, MASTERY_PENDING_KEY, MASTERY_XP_WEIGHT, SUB_TO_MASTERY_KEY, isGrowingMasteryKey,
  gunMasteryKeyOfWeaponKey, meleeMasteryKeyOfWeaponKey, type GrowingMasteryKey, type MasteryKey, type MasteryMeleeKey,
} from '../data/mastery';
import {
  clearMasteryReport, clearPendingMastery, getPendingMastery, hasPendingMastery, isMasteryRunCommitted,
  isMasteryRunIgnored, markMasteryRunCommitted, setLastMasteryCommit, type MasteryCommitResult, type MasteryXpTable,
} from './masteryRun';
import { brawlerEnemyClass } from './brawlerCombo';
import type { EnemyType, Player, SubWeaponKey } from '../types/game';

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

/** 旧 `melee`(ナイフごとに分ける前の1本)の移し先 = 装備している近接武器のキー。分からなければ基本のナイフ。 */
export const legacyMeleeTarget = (equippedMeleeKey?: string | null): MasteryMeleeKey =>
  meleeMasteryKeyOfWeaponKey(equippedMeleeKey) ?? DEFAULT_MELEE_MASTERY_KEY;

/** xp の表に旧 `melee` の欄が在るか(値が壊れていても欄が在れば true=消すために移行を通す)。 */
export const hasLegacyMeleeXp = (table: unknown): boolean =>
  !!table && typeof table === 'object' && Object.prototype.hasOwnProperty.call(table, LEGACY_MELEE_MASTERY_KEY);

/**
 * 旧 `melee` の量を、装備している近接武器のキーへ足して移し、旧 `melee` の欄を消す(純関数・元の表は変えない)。
 * 移し先に量が在れば足す。旧 `melee` が無ければ同じ表をそのまま返す(=2度通しても二重に足さない)。
 */
export const migrateLegacyMeleeXp = (table: Record<string, unknown>, equippedMeleeKey?: string | null): Record<string, unknown> => {
  if (!hasLegacyMeleeXp(table)) return table;
  const { [LEGACY_MELEE_MASTERY_KEY]: legacy, ...rest } = table;
  const add = cleanXp(legacy);
  if (add <= 0) return rest;
  const to = legacyMeleeTarget(equippedMeleeKey);
  return { ...rest, [to]: cleanXp(rest[to]) + add };
};

/**
 * 壊れた保存・旧データ・特別なキー・未知のキーを捨て、xp を 0 以上の有限値へ畳む。
 * 旧 `melee` は `equippedMeleeKey`(分からなければ基本のナイフ)のキーへ移してから畳む(捨てない)。
 */
export const normalizeMastery = (raw: unknown, equippedMeleeKey?: string | null): MasteryState => {
  const src = (raw && typeof raw === 'object' ? (raw as { xp?: unknown }).xp : undefined);
  const table = migrateLegacyMeleeXp((src && typeof src === 'object' ? src : {}) as Record<string, unknown>, equippedMeleeKey);
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

/**
 * 保存の読み出し。旧 `melee` が残っていれば `equippedMeleeKey` のキーへ移す(社長裁定2026-11-12「ナイフ毎の括り」の移行)。
 * 装備が分かる時(=`equippedMeleeKey` を渡した時: 出撃の頭の resetGame)は移した結果を書き戻す=移行は1度だけ・
 * 2度読んでも二重に足さない(書き戻した後は旧 `melee` が無い)。装備が分からない読み(作戦室の表示など)は
 * 基本のナイフへ移した形で返すだけで書き戻さない(=次の出撃の頭で、その時の装備へ移す)。
 */
export const loadMastery = (equippedMeleeKey?: string | null): MasteryState => {
  if (typeof localStorage === 'undefined') return emptyMastery();
  try {
    const raw = readJson(MASTERY_KEY);
    const legacy = hasLegacyMeleeXp((raw as { xp?: unknown } | null)?.xp);
    const s = normalizeMastery(raw, equippedMeleeKey);
    if (legacy && equippedMeleeKey != null) saveMastery(s);
    return s;
  }
  catch { return emptyMastery(); }
};

export const saveMastery = (s: MasteryState): void => {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(MASTERY_KEY, JSON.stringify(normalizeMastery(s))); }
  catch { /* ignore (quota / private mode) */ }
};

/** 退避(masteryPending)の読み出し。壊れていれば空。旧 `melee` は `equippedMeleeKey`(分からなければ基本のナイフ)へ移して読む。 */
export const loadStashedMasteryPending = (equippedMeleeKey?: string | null): MasteryXpTable => {
  if (typeof localStorage === 'undefined') return {};
  try { return normalizeMastery(readJson(MASTERY_PENDING_KEY), equippedMeleeKey).xp; }
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
  /** 持っている銃のキー(武器ごと・重複してよい=1つに数える)。台帳に無い銃は数えない。 */
  gunKeys: readonly (string | undefined)[];
  /** 持っている近接武器のキー(無ければ undefined)。台帳に無い近接は数えない。 */
  meleeKey: string | undefined;
  /** 持っているサブウェポン。 */
  subs: readonly SubWeaponKey[];
}

/**
 * `loadout` の倍率(v2.1 A-11)= 重複なしの集合の平均:
 * 持っている銃(武器ごと) + 近接(格闘を持っていれば `brawler`、無ければ持っている近接武器のキー。近接武器が無い/台帳に無ければ入れない)
 * + 持っているサブのうち育つキー(`murasame`→`katana`・`brawler` は近接の枠と二重に数えない)。空なら1。
 */
export const masteryLoadoutMult = (mults: Partial<Record<MasteryKey, number>>, input: MasteryLoadoutInput): number => {
  const set = new Set<GrowingMasteryKey>();
  for (const g of input.gunKeys) { const k = gunMasteryKeyOfWeaponKey(g); if (k) set.add(k); }
  const hasBrawler = input.subs.includes('brawler');
  if (input.meleeKey !== undefined) {
    const meleeMk = hasBrawler ? 'brawler' : meleeMasteryKeyOfWeaponKey(input.meleeKey);
    if (meleeMk) set.add(meleeMk);
  }
  for (const s of input.subs) {
    const k = SUB_TO_MASTERY_KEY[s];
    if (k) set.add(k);
  }
  if (set.size === 0) return 1;
  let sum = 0;
  for (const k of set) sum += mults[k] ?? 1;
  return sum / set.size;
};

/**
 * 近接の当たりの熟練度のキー=当たりを出した者が**装備している近接武器**のキー(社長裁定2026-11-12「ナイフ毎の括り」)。
 * 本人=player の近接武器・守護霊=疑似プレイヤーの近接武器。近接武器を持っていない/台帳に無い時は `loadout`。
 */
export const meleeMasteryKeyOf = (actor: Pick<Player, 'weapons'> | null | undefined): MasteryKey =>
  meleeMasteryKeyOfWeaponKey(actor?.weapons?.find(w => w.isMelee)?.key) ?? 'loadout';

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
 * 弾・置き物の当たりの倍率(守護霊の熟練度の発注): 作る所で確定させた `masteryMult`(守護霊が作った物)があればそれ、
 * 無ければ当たる所で `player`(本人の焼き値)から `key` で引く(=今までどおり)。
 */
export const objectMasteryMult = (
  obj: { masteryMult?: number } | null | undefined,
  player: Pick<Player, 'masteryMult' | 'masteryLoadoutMult'> | null | undefined,
  key: MasteryKey,
): number => {
  const m = obj?.masteryMult;
  if (typeof m === 'number' && Number.isFinite(m) && m > 0) return m;
  return masteryMultOf(player, key);
};

/**
 * 守護霊の当たりの倍率(守護霊の熟練度の発注): 主語が疑似プレイヤー(`pseudoActor`)なら、その記録の焼き値から `key` で引く。
 * 主語が解決できず本人へ落ちた時(守護霊が消えた後に残った物など)は 1(本人の今の値を守護霊に乗せない)。
 * 幻影の疑似プレイヤーは焼き値が空なので 1。
 */
export const guardianMasteryMult = (
  actor: Pick<Player, 'masteryMult' | 'masteryLoadoutMult' | 'pseudoActor'> | null | undefined,
  key: MasteryKey,
): number => (actor?.pseudoActor ? masteryMultOf(actor, key) : 1);

/** 熟練度の焼き値(記録から復元した物)。 */
export interface MasteryRecord {
  masteryMult: Partial<Record<MasteryKey, number>>;
  masteryLoadoutMult: number;
}

const MASTERY_RECORD_KEYS: ReadonlySet<string> = new Set<string>([...GROWING_MASTERY_KEYS, 'max']);
const clampRecordMult = (v: unknown): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 1;
  return Math.max(1, Math.min(MASTERY_MAX_MULT, v));
};

/**
 * 守護霊の記録に写した熟練度の焼き値を復元する(壊れた保存・改ざんへの備えとして正規化する)。
 * 知らないキーは捨てる(育つキーと `max` だけ残す)・倍率は 1〜1.9 に丸める・数でない物は 1(=表から落とす)。
 * 欄が無い(古い記録)は `{}` と `1`(熟練度なしの強さ)。
 * 旧 `melee`(ナイフごとに分ける前の記録・古いクライアントの記録)は、その記録の近接武器 `recordMeleeKey`
 * (無い/台帳に無ければ基本のナイフ)のキーとして読む。同じ記録に新しいキーが在ればそちらを残す。
 * オンラインで届く他人の記録も、共有の正規化(shared/ghostSanitize.mjs の sanitizeSnapshot)が `masteryMult`・
 * `masteryLoadoutMult` を同じ規則(既知のキーだけ・1〜1.9・数でない物は落とす)で通すので届く(=他人の守護霊にも記録主の熟練度が乗る)。
 * ここでの正規化は自分の記録にも他人の記録にも掛かる(共有の正規化を通った値は既に範囲内=二度丸めても変わらない)。
 * ただし共有の正規化が古いサーバで保存された記録は欄が落ちたまま=欄なし(熟練度なし)として読む。
 */
export const normalizeMasteryRecord = (rawMult: unknown, rawLoadout: unknown, recordMeleeKey?: string | null): MasteryRecord => {
  const masteryMult: Partial<Record<MasteryKey, number>> = {};
  if (rawMult && typeof rawMult === 'object' && !Array.isArray(rawMult)) {
    const table = rawMult as Record<string, unknown>;
    for (const [k, v] of Object.entries(table)) {
      if (!MASTERY_RECORD_KEYS.has(k)) continue;
      const m = clampRecordMult(v);
      if (m !== 1) masteryMult[k as MasteryKey] = m;
    }
    if (hasLegacyMeleeXp(table)) {
      const to = legacyMeleeTarget(recordMeleeKey);
      const m = clampRecordMult(table[LEGACY_MELEE_MASTERY_KEY]);
      if (m !== 1 && masteryMult[to] === undefined) masteryMult[to] = m;
    }
  }
  return { masteryMult, masteryLoadoutMult: clampRecordMult(rawLoadout) };
};

/**
 * 敵の区分(雑魚/強個体/ボス級)ごとの貯まり方の重み(v2 §4-1 の貯める量に掛ける)。
 * 区分は既にある brawlerEnemyClass(赤い個体=強個体を含む)。表は data/mastery.ts の MASTERY_XP_WEIGHT。
 */
export const masteryXpWeight = (enemy: { type: EnemyType; colorTier?: string } | null | undefined): number => {
  if (!enemy) return 1;
  const w = MASTERY_XP_WEIGHT[brawlerEnemyClass(enemy)];
  return typeof w === 'number' && Number.isFinite(w) ? Math.max(0, w) : 1;
};

/**
 * 貯める量(v2 §4-1): 実際に通った量を熟練度の倍率で割り戻して四捨五入し、区分の重みを掛ける。
 * 育たないキー(`none`・`loadout`・`max`)・出どころ無しは0。
 * `opts.noDivide`: 熟練度の倍率が掛かっていない当たり(処刑=残り体力をそのまま取る)。割り戻さず、区分の重みだけ掛ける。
 */
export const masteryXpAmount = (
  player: Pick<Player, 'masteryMult' | 'masteryLoadoutMult'> | null | undefined,
  key: MasteryKey | null | undefined,
  appliedDamage: number,
  enemy: { type: EnemyType; colorTier?: string } | null | undefined,
  opts?: { noDivide?: boolean },
): number => {
  if (!isGrowingMasteryKey(key)) return 0;
  if (!Number.isFinite(appliedDamage) || appliedDamage <= 0) return 0;
  const m = opts?.noDivide ? 1 : masteryMultOf(player, key);
  return Math.max(0, Math.round(appliedDamage / (m > 0 ? m : 1))) * masteryXpWeight(enemy);
};

/**
 * 燃焼の付け直し(強さは高い方を残す所)で、強さとキーを同じ付け手に揃える。
 * 新しい強さが今の強さ以上なら新しい方のキー、そうでなければ今のキーを残す(=強さが勝った方のキーが残る)。
 * 強さは今までどおり `Math.max(今, 新)`(期限切れの燃焼の強さも今までどおり比べる=与ダメは変えない)。
 */
export const burnRefreshMastery = (
  cur: { burnDpsTick?: number; burnMasteryKey?: MasteryKey; burnMasteryMult?: number },
  newDps: number,
  newKey: MasteryKey,
  /** 守護霊の燃焼の強さに掛けた倍率(守護霊の熟練度の発注)。本人の燃焼は省く(=欄を消す)。 */
  newMult?: number,
): { burnDpsTick: number; burnMasteryKey: MasteryKey | undefined; burnMasteryMult: number | undefined } => {
  const old = cur.burnDpsTick ?? 0;
  const newWins = newDps >= old;
  return {
    burnDpsTick: Math.max(old, newDps),
    burnMasteryKey: newWins ? newKey : cur.burnMasteryKey,
    burnMasteryMult: newWins ? newMult : cur.burnMasteryMult,
  };
};

/**
 * resetGame の頭(焼き込みより前)。`equippedMeleeKey`=この出撃の近接武器(旧 `melee` の移し先)。リザルトを通らずに終わった出撃の分を本体へ足す(v2.1 A-4):
 * メモリの pending に残りがあればメモリを、無ければ退避(masteryPending)を足す=どちらか一方だけ。
 * その後、退避を消し、メモリの pending・報告用の表を空にする(beginMasteryRun は呼び出し側)。
 */
export const recoverMasteryPending = (equippedMeleeKey?: string | null): void => {
  const add = hasPendingMastery() ? getPendingMastery() : loadStashedMasteryPending(equippedMeleeKey);
  if (Object.values(add).some(v => (v ?? 0) > 0)) saveMastery(addXp(loadMastery(equippedMeleeKey), add));
  removeStash();
  clearPendingMastery();
  clearMasteryReport();
};

// ── リザルトでの確定 ──────────────────────────────────────────────────────

export type { MasteryCommitEntry, MasteryCommitResult } from './masteryRun';
export { getLastMasteryCommit } from './masteryRun';

/**
 * リザルトへ入る時に1回。メモリの pending を本体へ足し、pending を空にし、退避も消す。
 * 戻り値=この出撃で貯めた物だけの before/after。2回目以降・無視する出撃では何も足さず空を返す。
 */
export const commitMasteryRun = (): MasteryCommitResult => {
  if (isMasteryRunCommitted()) return {};
  markMasteryRunCommitted();
  if (isMasteryRunIgnored()) { setLastMasteryCommit({}); return {}; }
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
  setLastMasteryCommit(result);
  return { ...result };
};
