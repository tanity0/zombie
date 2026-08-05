// ボスとの「遭遇」記録(BOSS_MAKER.md §20-5・社長仕様「一度ステージで出会ったことがあれば解放される」)。
//
// ★何をもって「出会った」とするか(監査で初稿から変更・v0.25.2857)
// 「出現した時」ではない。理由:
//  - **idol は出現しない**。`resetGame` が休眠状態で盤上に直接置くので、stage-2 へ出撃した瞬間に
//    記録されてしまい「探しに行った人だけが会う」という配置意図が壊れる。
//  - **城ボスも `dormant` で城に湧くだけ**。近づかなくても記録されてしまう。
//  - `giantbat` は**イベント産(`fromEvent`)でも出る**ので、型だけ見ると誤解放する。
//  - そもそも出現経路が5つに割れており、1経路だけ書くと必ず取りこぼす。
// ⇒ **`engagedBossSlotKeys`(交戦判定)が返したキーを記録する**。あれは休眠を除外し距離の
//    ヒステリシス付きで全ボスのスロットキーを毎tick返す**唯一の合流点**。
//    意味も社長の言葉に合う——「盤上に居た」ではなく**「実際に近づいて戦い始めた=出会った」**。
//
// キーは `GHOST_DOSSIER_SLOTS.slotKey` / `bossStyleSlotKey()` と**同一形式**(城ボスは
// `giantbat@stage-3` のようにステージ別、それ以外は型名そのもの)。
import { isBossTestOrPracticeRun } from './bossPractice';

const KEY = 'boss.encountered.v1';

/** 端末の遭遇済みキー。初回読み込み後はメモリ側を正とし、増えた時だけ書く(毎tick書かない)。 */
let cache: Set<string> | null = null;

const read = (): Set<string> => {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    cache = new Set(Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    cache = new Set();
  }
  return cache;
};

/** 遭遇済みのスロットキー集合(読み取り専用のコピー)。 */
export const loadEncounteredBosses = (): Set<string> => new Set(read());

/** そのスロットに出会ったことがあるか。 */
export const hasEncounteredBoss = (slotKey: string): boolean => read().has(slotKey);

/**
 * 交戦中のスロットキーを記録する。**毎tick呼ばれる前提**なので:
 *  - 既に入っているキーだけなら**何もしない**(localStorage に書かない)。
 *  - 練習ラン/ボス戦テストのランでは**記録しない**。練習で出会ったことを解放条件に使うと、
 *    入口が自分自身を解放する輪になる(BOSS_MAKER.md §20-5)。
 */
export const markBossesEncountered = (slotKeys: ReadonlySet<string>): void => {
  if (slotKeys.size === 0) return;
  if (isBossTestOrPracticeRun()) return;
  const set = read();
  let added = false;
  for (const k of slotKeys) {
    if (!set.has(k)) { set.add(k); added = true; }
  }
  if (!added) return;
  try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch { /* 保存不可でも進行は止めない */ }
};

/** テスト用: メモリキャッシュを捨てて localStorage から読み直す。 */
export const resetBossEncounterCache = (): void => { cache = null; };

/** 進行リセット(開発用)から呼ぶ。 */
export const clearBossEncounters = (): void => {
  cache = new Set();
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
};
