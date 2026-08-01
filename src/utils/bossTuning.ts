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
  /**
   * **この欄を出す条件**(v0.25.2638・射撃部品)。指定したパスの値が 0 以外の時だけ表示する。
   * 用途: 「まだ足していない射撃スロット」の欄を丸ごと隠す——8枠×15欄=120行が常時並ぶと
   * 道具として使えない(社長報告v0.25.2628「大分まだみづらい」の再来になる)。
   * 隠れている欄は**コピーの平文からも外す**(=貼る相手に読ませない)。
   */
  visibleWhen?: string;
}

/**
 * 文字の入力欄(v0.25.2638)。**数値ではない設定は原則ここへ持ち込まない**——唯一の用途は
 * 「社長が足した技に名前を付ける」こと。`s3` のままでは台本に並べた時にどれが何か分からない。
 */
export interface TuningTextField {
  path: string;
  label: string;
  group: 'behavior' | 'move';
  section: string;
  maxLen?: number;
  placeholder?: string;
  visibleWhen?: string;
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
  /** 文字の欄(技の名前など・未定義=無し)。 */
  textFields?: readonly TuningTextField[];
  /** 個別再生のボタン(未定義=そのボスは再生に未対応)。 */
  playables?: readonly PlayableAction[];
  /**
   * 見出しの表示名の差し替え(未定義=`section` をそのまま出す)。
   * 社長が技に付けた名前を**畳んだ見出しにも反映する**ために要る(スキーマは起動時に1回作るので、
   * `section` 文字列そのものを後から書き換えることはできない)。
   */
  sectionLabel?: (section: string) => string;
  /** 「技を1つ足す」ボタン(未定義=そのボスは追加に未対応)。押すと空きスロットを1つ有効にする。 */
  addMove?: () => { ok: boolean; message: string };
  /**
   * 台本エディタ(3便目・v0.25.2642)。未定義=そのボスは台本編集に未対応。
   * **UIはボスを一切知らない**まま編集できるよう、必要な操作を全部ここから受け取る
   * (スキーマ駆動のフォームと同じ考え方。ボスを足す側がこの1個を宣言すれば画面が生える)。
   */
  scripts?: BossScriptApi;
  /** 再生の実行(ボス側の状態機械へ繋ぐ)。 */
  onPlay?: (action: PlayableAction, opts: { solo: boolean; loop: boolean }) => void;
  /** いま何を再生中か(▶の点灯表示用)。 */
  playState?: () => { verb: string | null; loop: string | null };
}

/**
 * 台本エディタがボスへ求めるもの(v0.25.2642)。
 * 読み取り(`rows`/`moveChoices`/`cutoff`/`warnings`)と書き込み(`edit`)を分けてあるのは、
 * **書き込みは必ずボス側の純関数を通す**ため(UIが配列を直接触ると検証を素通りする)。
 */
export interface BossScriptApi {
  /** いまの台本(表示用のコピー)。 */
  rows: () => { zone: string; zoneLabel: string; weight: number; moves: { key: string; label: string }[] }[];
  /** 段に置ける技の一覧(射撃枠を足せば増える)。 */
  moveChoices: () => { key: string; label: string }[];
  /** 距離帯の一覧。 */
  zoneChoices: () => { key: string; label: string }[];
  /** フェーズ上限で切られる段数(ここから先は実戦で出ない)。 */
  cutoff: () => { p1: number; p2: number };
  /** 気づかせるだけの警告(止めない)。 */
  warnings: () => string[];
  /** 編集。戻り値のメッセージはそのまま画面へ出す。 */
  edit: (op: BossScriptOp) => { ok: boolean; message: string };
  /** 保存/コピー用の1行。既定と同じなら null(=保存しない・貼り付け文にも出さない)。 */
  serialize: () => string | null;
  /** 読み戻す。成功したら true。壊れていたら既定のまま false。 */
  deserialize: (text: string) => boolean;
  /** 既定の台本へ戻す(部屋を出る時=本編へ調整値を持ち出さないため)。 */
  reset: () => void;
}

export type BossScriptOp =
  | { t: 'addScript' }
  | { t: 'removeScript'; si: number }
  | { t: 'setZone'; si: number; zone: string }
  | { t: 'setWeight'; si: number; weight: number }
  | { t: 'setStep'; si: number; mi: number; move: string }
  | { t: 'insertStep'; si: number; mi: number; move: string }
  | { t: 'removeStep'; si: number; mi: number }
  | { t: 'moveStep'; si: number; mi: number; dir: -1 | 1 };

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

/** 文字の値を読む(無ければ undefined)。 */
export const getTextAtPath = (obj: unknown, path: string): string | undefined => {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === 'string' ? cur : undefined;
};

/** 文字を書き込む。数値版と同じく**既にキーがある場所にしか書かない**。 */
export const setTextAtPath = (obj: unknown, path: string, value: string): boolean => {
  const keys = path.split('.');
  let cur: unknown = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur === null || typeof cur !== 'object') return false;
    cur = (cur as Record<string, unknown>)[keys[i]];
  }
  if (cur === null || typeof cur !== 'object') return false;
  const last = keys[keys.length - 1];
  const holder = cur as Record<string, unknown>;
  if (typeof holder[last] !== 'string') return false;
  holder[last] = value;
  return true;
};

/**
 * その欄をいま画面に出すか(`visibleWhen` のパスが 0 以外なら出す)。
 * **画面・コピーの平文・畳んだ要点の3箇所が必ずこの1つの関数を通る**こと
 * (どれか1つが独自判定を持つと「画面に無い欄が貼り付け文に出る」ような食い違いが必ず起きる)。
 */
export const fieldVisible = (
  table: unknown,
  f: { visibleWhen?: string },
): boolean => f.visibleWhen === undefined || (getAtPath(table, f.visibleWhen) ?? 0) !== 0;

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

// ---- 自動保存(社長要望v0.25.2631「毎回やり直すのは無理」) ---------------------------------------
//
// ★**復元は「部屋の中だけ」**。数値テーブルは**本編と同じ実体**(ゲームのボスが読む参照そのもの)なので、
// 無条件に復元すると**調整値が本編のボスに乗ってしまう**。よって:
//   ・部屋へ入る時に `applySavedTuning`(既定へ戻してから保存ぶんを適用)
//   ・部屋を出る時に `resetTuning`(必ず既定へ)
// この2つが対になっていることを **テストで固定**する(BossMakerPanel の useEffect が呼ぶ)。
//
// 保存するのは**既定から変えた項目だけ**(貼り戻しの機械行と同じ形)。項目が増減しても壊れない。
const SAVE_KEY = 'bossmaker.tuning.v1';
// 文字(技の名前)は**別のキー**に置く。既存の `SAVE_KEY` は「{パス: 数値}」だけの形で既に
// 社長の端末に保存済みなので、そこへ文字を混ぜると**過去の保存が読めなくなる**(v0.25.2638)。
const LABEL_KEY = 'bossmaker.labels.v1';
// 台本(構造)も**別キー**。数値・名前と同じ理由で、既存の保存を壊さずに足せる。
const SCRIPT_KEY = 'bossmaker.scripts.v1';

/** 既定から変わっている項目だけを {パス: 値} で取り出す(保存/コピーの共通形)。 */
export const tuningDiff = (entry: BossTuningEntry): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const path of changedPaths(entry)) {
    const v = getAtPath(entry.table, path);
    if (v !== undefined) out[path] = v;
  }
  return out;
};

/** 既定から変わっている文字欄だけを {パス: 文字} で取り出す。 */
export const tuningTextDiff = (entry: BossTuningEntry): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const f of entry.textFields ?? []) {
    const v = getTextAtPath(entry.table, f.path);
    if (v !== undefined && v !== getTextAtPath(entry.defaults, f.path)) out[f.path] = v;
  }
  return out;
};

/** いまの差分を端末へ保存する(変更が無ければキーごと消す=綺麗に空へ戻る)。 */
export const saveTuning = (entry: BossTuningEntry): void => {
  try {
    const diff = tuningDiff(entry);
    const key = `${SAVE_KEY}.${entry.bossType}`;
    if (Object.keys(diff).length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(diff));
    const labels = tuningTextDiff(entry);
    const lkey = `${LABEL_KEY}.${entry.bossType}`;
    if (Object.keys(labels).length === 0) localStorage.removeItem(lkey);
    else localStorage.setItem(lkey, JSON.stringify(labels));
    const skey = `${SCRIPT_KEY}.${entry.bossType}`;
    const sc = entry.scripts?.serialize();
    if (!sc) localStorage.removeItem(skey);
    else localStorage.setItem(skey, sc);
  } catch { /* 保存できなくても動く(プライベートモード等) */ }
};

/** 保存済みの差分を読む(無ければ null)。 */
export const loadTuningDiff = (bossType: string): Record<string, number> | null => {
  try {
    const raw = localStorage.getItem(`${SAVE_KEY}.${bossType}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, number>;
  } catch { return null; }
};

/**
 * **部屋へ入る時**に呼ぶ。必ず既定へ戻してから保存ぶんを適用する
 * (前回の残りが混ざらない=「保存した値そのもの」になる)。適用できた件数を返す。
 */
export const applySavedTuning = (entry: BossTuningEntry): number => {
  resetTuning(entry);
  const diff = loadTuningDiff(entry.bossType);
  const labels = loadTuningLabels(entry.bossType);
  let applied = 0;
  if (diff) {
    const byPath = new Map(entry.fields.map(f => [f.path, f]));
    for (const [path, raw] of Object.entries(diff)) {
      const f = byPath.get(path);
      if (!f || typeof raw !== 'number' || !Number.isFinite(raw)) continue;
      if (setAtPath(entry.table, path, clampField(f, raw))) applied += 1;
    }
  }
  if (labels) {
    const okPaths = new Set((entry.textFields ?? []).map(f => f.path));
    for (const [path, raw] of Object.entries(labels)) {
      if (!okPaths.has(path) || typeof raw !== 'string') continue;
      if (setTextAtPath(entry.table, path, raw)) applied += 1;
    }
  }
  // 台本(構造)。**名前より後に当てる**——射撃枠を有効にしてからでないと、その技を含む台本が
  // 「知らない技」として落ちてしまう(復元の順番が意味を持つ数少ない場所)。
  try {
    const raw = localStorage.getItem(`${SCRIPT_KEY}.${entry.bossType}`);
    if (raw && entry.scripts?.deserialize(raw)) applied += 1;
  } catch { /* 読めなくても既定のまま動く */ }
  return applied;
};

/** 保存済みの名前を読む(無ければ null)。 */
export const loadTuningLabels = (bossType: string): Record<string, string> | null => {
  try {
    const raw = localStorage.getItem(`${LABEL_KEY}.${bossType}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, string>;
  } catch { return null; }
};

/** 保存を消す(「保存も消す」操作用)。 */
export const clearSavedTuning = (bossType: string): void => {
  try {
    localStorage.removeItem(`${SAVE_KEY}.${bossType}`);
    localStorage.removeItem(`${LABEL_KEY}.${bossType}`);
    localStorage.removeItem(`${SCRIPT_KEY}.${bossType}`);
  } catch { /* 消せなくても動く */ }
};

/** テーブルを既定値へ戻す(参照は保つ=ゲーム側が持っている参照が切れない)。 */
export const resetTuning = (entry: BossTuningEntry): void => {
  for (const f of entry.fields) {
    const d = getAtPath(entry.defaults, f.path);
    if (d !== undefined) setAtPath(entry.table, f.path, d);
  }
  for (const f of entry.textFields ?? []) {
    const d = getTextAtPath(entry.defaults, f.path);
    if (d !== undefined) setTextAtPath(entry.table, f.path, d);
  }
  entry.scripts?.reset();
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
  const labelOf = (sec: string): string => entry.sectionLabel?.(sec) ?? sec;
  for (const group of ['behavior', 'move'] as const) {
    // 画面に出ていない欄(足していない射撃スロット等)は平文にも出さない=画面と貼り付け文が一致する。
    const fs = entry.fields.filter(f => f.group === group && fieldVisible(entry.table, f));
    const ts = (entry.textFields ?? []).filter(f => f.group === group && fieldVisible(entry.table, f));
    if (fs.length === 0 && ts.length === 0) continue;
    lines.push('', group === 'behavior' ? '## 行動パターン' : '## 技');
    let section = '';
    const openSection = (sec: string): void => {
      if (sec === section) return;
      section = sec;
      lines.push(`### ${labelOf(sec)}`);
      for (const t of ts.filter(t2 => t2.section === sec)) {
        lines.push(`  ${t.label} = ${getTextAtPath(entry.table, t.path) ?? ''}`);
      }
    };
    for (const f of fs) {
      openSection(f.section);
      const v = getAtPath(entry.table, f.path);
      const d = getAtPath(entry.defaults, f.path);
      const mark = changed.has(f.path) ? '*' : ' ';
      const unit = UNIT_SUFFIX[f.kind];
      const diff = changed.has(f.path) ? `   (既定 ${d}${unit})` : '';
      lines.push(`${mark} ${f.label} = ${v}${unit}${diff}`);
    }
    // 欄が1つも無い見出し(名前だけ持つ)を取りこぼさない。
    for (const t of ts) openSection(t.section);
  }
  // 機械用: **変更があった欄だけ**を出す(全部出すと差分が読めない・貼り戻しは既定+差分で復元できる)。
  // ※隠れている欄でも「既定から変わっている」なら機械用には残す(貼り戻しで完全に同じ状態へ戻すため)。
  const payload: Record<string, number> = {};
  for (const p of changed) {
    const v = getAtPath(entry.table, p);
    if (v !== undefined) payload[p] = v;
  }
  const labels = tuningTextDiff(entry);
  const scripts = entry.scripts?.serialize() ?? null;
  if (scripts !== null) {
    lines.push('', '## 台本(* = 既定から変更)');
    for (const [i, r] of entry.scripts!.rows().entries()) {
      lines.push(`* ${i + 1}. ${r.zoneLabel} 重み${r.weight}: ${r.moves.map(m => m.label).join(' → ')}`);
    }
  }
  const machine: Record<string, unknown> = { boss: entry.bossType, changed: payload };
  if (Object.keys(labels).length > 0) machine.labels = labels;
  if (scripts !== null) machine.scripts = scripts;
  lines.push('', JSON_MARK, JSON.stringify(machine));
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
  type Machine = { boss?: string; changed?: Record<string, number>; labels?: Record<string, string>; scripts?: string };
  let parsed: Machine;
  try {
    parsed = JSON.parse(json) as Machine;
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
  // 名前(あれば)。**古い形式(labels 無し)もそのまま読める**ように任意扱いにする。
  const okText = new Set((entry.textFields ?? []).map(f => f.path));
  for (const [path, raw] of Object.entries(parsed.labels ?? {})) {
    if (!okText.has(path)) { errors.push(`不明な名前欄: ${path}`); continue; }
    if (typeof raw !== 'string') { errors.push(`文字ではない: ${path}`); continue; }
    if (setTextAtPath(entry.table, path, raw)) applied += 1;
  }
  // 台本。**名前の後**に当てる(射撃枠を有効にしてから=上の applySavedTuning と同じ理由)。
  if (typeof parsed.scripts === 'string') {
    if (entry.scripts?.deserialize(parsed.scripts)) applied += 1;
    else errors.push('台本を読み戻せませんでした(既定のままにしました)');
  }
  return { applied, errors };
};
