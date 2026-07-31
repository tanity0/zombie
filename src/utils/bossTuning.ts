// ボスメーカー(BOSS_MAKER.md)の中核: **数値テーブルのレジストリ**。
// 純関数のみ・レンダラ/store非依存(UIとゲームロジックの両方から読める中立層)。
//
// 設計(BOSS_MAKER.md §2-2/§2-3):
//  - ボスの数値は今までモジュール定数だったので実行中に書き換えられなかった。**ボスごとの可変テーブル
//    1個**へ寄せ、台本(ロジック)は今までどおりコードに置く。
//  - **読み方は変えない**: 既存コードは使用時参照(tick中に `IDOL_TIMING.aim.windup` を読む)なので、
//    テーブルの同じ入れ子オブジェクトを従来の名前で再exportすれば**使用箇所は1行も変わらない**。
//  - **UIはスキーマからフォームを自動生成する**。1ボス対応=テーブル+スキーマを1つ書くだけ。
//
// 非対応(意図的): 数値以外(配列の並び替え・技の追加削除)はここでは扱わない。台本はコード側の仕事。
export type TuningKind = 'ms' | 'px' | 'num' | 'rate' | 'deg' | 'frac' | 'pxs';

/** 1つの数値入力欄の定義。`path` はテーブル内のドット区切りの場所。 */
export interface TuningField {
  path: string;
  label: string;
  /** 'behavior'=左上(行動パターン) / 'move'=右上(技ごと)。BOSS_MAKER.md §1-4/§1-5。 */
  group: 'behavior' | 'move';
  /** グループ内の見出し(技名など)。同じ section の欄はまとめて表示する。 */
  section: string;
  kind: TuningKind;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}

/**
 * 個別再生(BOSS_MAKER.md・社長要望v0.25.2625「停止中は技、動きごとに再生ボタンで個々に再生」)。
 * **スキーマと同じくボス側が宣言する**ので、UIは一切ボスを知らないまま▶ボタンを並べられる。
 *  - kind='move': 1回だけ再生(停止中なら硬直明けでまた止まる)
 *  - kind='verb': 押した動きを維持し続ける(もう一度押すか別の動きを押すと切替)
 * section = このボタンを出す見出し(スキーマの TuningField.section と対応させる)。
 */
export interface PlayableAction {
  kind: 'move' | 'verb';
  key: string;
  label: string;
  section: string;
}

export interface BossTuningEntry {
  bossType: string;
  label: string;
  /** 実行中に書き換わる本体。ゲームロジックはこの中身を毎フレーム読む。 */
  table: Record<string, unknown>;
  /** 既定値(リセットと差分表示用)。テーブルとは**別のオブジェクト**として保持する。 */
  defaults: Record<string, unknown>;
  fields: readonly TuningField[];
  /** 個別再生のボタン(未定義=そのボスは再生に未対応)。 */
  playables?: readonly PlayableAction[];
  /** 再生の実行(ボス側の状態機械へ繋ぐ)。 */
  onPlay?: (action: PlayableAction, opts: { solo: boolean; loop: boolean }) => void;
  /** いま何を再生中か(▶の点灯表示用)。 */
  playState?: () => { verb: string | null; loop: string | null };
}

const REGISTRY = new Map<string, BossTuningEntry>();

/** 単位のサフィックス(表示用)。 */
export const UNIT_SUFFIX: Record<TuningKind, string> = {
  ms: 'ms', px: 'px', num: '', rate: '/s', deg: '°', frac: '', pxs: 'px/s',
};

/** 深いクローン(数値/文字列/真偽/配列/プレーンオブジェクトのみ。テーブルはこの範囲で作る)。 */
export const deepCloneTuning = <T>(v: T): T => {
  if (Array.isArray(v)) return v.map(deepCloneTuning) as unknown as T;
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = deepCloneTuning(val);
    return out as T;
  }
  return v;
};

export const registerBossTuning = (entry: BossTuningEntry): void => {
  REGISTRY.set(entry.bossType, entry);
};
export const getBossTuning = (bossType: string): BossTuningEntry | undefined => REGISTRY.get(bossType);
export const listBossTuning = (): BossTuningEntry[] => [...REGISTRY.values()];

// ---- パス読み書き ------------------------------------------------------------------------------
export const getAtPath = (obj: unknown, path: string): number | undefined => {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === 'number' ? cur : undefined;
};

/**
 * パスへ数値を書き込む。**既存のキーがある場所にしか書かない**(打ち間違いで新しいキーを生やさない)。
 * 書けたら true。テーブルの入れ子オブジェクトは参照を保ったまま更新するので、
 * 従来名で再exportしている側(`IDOL_TIMING` 等)にもそのまま反映される。
 */
export const setAtPath = (obj: unknown, path: string, value: number): boolean => {
  if (!Number.isFinite(value)) return false;
  const keys = path.split('.');
  let cur: unknown = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur === null || typeof cur !== 'object') return false;
    cur = (cur as Record<string, unknown>)[keys[i]];
  }
  if (cur === null || typeof cur !== 'object') return false;
  const last = keys[keys.length - 1];
  const holder = cur as Record<string, unknown>;
  if (typeof holder[last] !== 'number') return false;
  holder[last] = value;
  return true;
};

/** 欄の値を範囲へ丸める(min/max未指定なら素通し)。 */
export const clampField = (f: TuningField, v: number): number => {
  let out = v;
  if (f.min !== undefined) out = Math.max(f.min, out);
  if (f.max !== undefined) out = Math.min(f.max, out);
  return out;
};

/** 既定値から変わっている欄のパス一覧。 */
export const changedPaths = (entry: BossTuningEntry): string[] =>
  entry.fields
    .filter(f => getAtPath(entry.table, f.path) !== getAtPath(entry.defaults, f.path))
    .map(f => f.path);

/** テーブルを既定値へ戻す(参照は保つ=ゲーム側が持っている参照が切れない)。 */
export const resetTuning = (entry: BossTuningEntry): void => {
  for (const f of entry.fields) {
    const d = getAtPath(entry.defaults, f.path);
    if (d !== undefined) setAtPath(entry.table, f.path, d);
  }
};

// ---- コピー/貼り戻しのテキスト形式(BOSS_MAKER.md §1-6) ----------------------------------------
// 「人が読めて、かつ機械が読み戻せる」= **平文を主**にして、末尾へ機械用のJSONを併記する。
// 既定値から変えた欄には行頭へ `*` を付ける(貼られた側がどこを触ったか一目で分かる)。
const JSON_MARK = '--- machine (paste-back) ---';

export const formatTuningText = (entry: BossTuningEntry, version: string): string => {
  const changed = new Set(changedPaths(entry));
  const lines: string[] = [`# ボスメーカー ${version} — ${entry.label}(${entry.bossType})`];
  const changedCount = changed.size;
  lines.push(changedCount === 0 ? '(既定値から変更なし)' : `(* = 既定から変更: ${changedCount}件)`);
  for (const group of ['behavior', 'move'] as const) {
    const fs = entry.fields.filter(f => f.group === group);
    if (fs.length === 0) continue;
    lines.push('', group === 'behavior' ? '## 行動パターン' : '## 技');
    let section = '';
    for (const f of fs) {
      if (f.section !== section) { section = f.section; lines.push(`### ${section}`); }
      const v = getAtPath(entry.table, f.path);
      const d = getAtPath(entry.defaults, f.path);
      const mark = changed.has(f.path) ? '*' : ' ';
      const unit = UNIT_SUFFIX[f.kind];
      const diff = changed.has(f.path) ? `   (既定 ${d}${unit})` : '';
      lines.push(`${mark} ${f.label} = ${v}${unit}${diff}`);
    }
  }
  // 機械用: **変更があった欄だけ**を出す(全部出すと差分が読めない・貼り戻しは既定+差分で復元できる)。
  const payload: Record<string, number> = {};
  for (const p of changed) {
    const v = getAtPath(entry.table, p);
    if (v !== undefined) payload[p] = v;
  }
  lines.push('', JSON_MARK, JSON.stringify({ boss: entry.bossType, changed: payload }));
  return lines.join('\n');
};

export interface PasteResult { applied: number; errors: string[] }

/**
 * コピーしたテキストを読み戻す。末尾のJSON行だけを見る(平文は人間用)。
 * **既定へ戻してから差分を当てる**ので、貼り戻すと必ずコピー時と同じ状態になる(受け入れ条件4)。
 */
export const parseTuningText = (entry: BossTuningEntry, text: string): PasteResult => {
  const idx = text.indexOf(JSON_MARK);
  if (idx < 0) return { applied: 0, errors: ['機械用の行が見つかりません(コピーしたテキストをそのまま貼ってください)'] };
  const json = text.slice(idx + JSON_MARK.length).trim().split('\n')[0];
  let parsed: { boss?: string; changed?: Record<string, number> };
  try {
    parsed = JSON.parse(json) as { boss?: string; changed?: Record<string, number> };
  } catch {
    return { applied: 0, errors: ['機械用の行が壊れています'] };
  }
  if (parsed.boss !== entry.bossType) {
    return { applied: 0, errors: [`別のボスの数値です(${String(parsed.boss)} → 今は ${entry.bossType})`] };
  }
  const byPath = new Map(entry.fields.map(f => [f.path, f]));
  const errors: string[] = [];
  resetTuning(entry);
  let applied = 0;
  for (const [path, raw] of Object.entries(parsed.changed ?? {})) {
    const f = byPath.get(path);
    if (!f) { errors.push(`不明な項目: ${path}`); continue; }
    if (typeof raw !== 'number' || !Number.isFinite(raw)) { errors.push(`数値ではない: ${path}`); continue; }
    if (setAtPath(entry.table, path, clampField(f, raw))) applied += 1;
    else errors.push(`書き込めない項目: ${path}`);
  }
  return { applied, errors };
};
