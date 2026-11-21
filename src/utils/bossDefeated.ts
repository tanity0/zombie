// ボスを「倒した」記録(research/SORTIE_MAP_BOSS_ICONS.md §4)。作戦室の地図に顔を出すかの判定に使う
// (出会った・まだ倒していないボスだけ地図に出す)。
//
// キーは遭遇記録(bossEncounter.ts)と同じ形=`encounterSlotKey`:
//   城ボス=`giantbat@stage-N` / フィル=`phillboss@stage-ex1` / 拳鬼=`phantom-brawler` / それ以外=型名。
// ★書くのは本編で倒した時だけ。練習ラン・ボス戦テスト・ボスメーカーでは書かない(遭遇記録と同じ扱い)。
// ★書かない撃破: イベントで出た城ボス(`fromEvent` の giantbat)・グレンの第1形態(`glenForm===1`)。
// ★この版より前の撃破は取り込まない(社長指示2026-11-13「修正前のデータをどうするか論争は今後いらない」)。
import type { EnemyType, PhantomUniqueKind } from '../types/game';
import { isBossTestOrPracticeRun, PRACTICE_SLOTS } from './bossPractice';
import { bossStyleSlotKey } from './ghostSlot';

const KEY = 'boss.defeated.v1';

/** 記録してよいキー=対策室の台帳に載っている本編側のキー(雑魚の撃破を書かない)。 */
const KNOWN_KEYS: ReadonlySet<string> = new Set(PRACTICE_SLOTS.map(s => s.encounterSlotKey));

export interface DefeatedEnemyLike {
  type: EnemyType;
  fromEvent?: boolean;
  glenForm?: 1 | 2;
  phantomUnique?: PhantomUniqueKind;
}

/**
 * 倒した敵 → 倒した記録のキー(書かない撃破・台帳に無い型は null)。純関数。
 * 拳鬼は撃破時の型が `guardian-phantom`=`phantomUnique==='brawler'` を `phantom-brawler` へ写す。
 */
export const bossDefeatSlotKey = (e: DefeatedEnemyLike, stageId: string): string | null => {
  if (e.type === 'giantbat' && (e.fromEvent || e.glenForm === 1)) return null;
  let key: string;
  if (e.type === 'guardian-phantom') {
    if (e.phantomUnique !== 'brawler') return null; // 汎用の幻影は本編に居ない
    key = 'phantom-brawler';
  } else {
    key = bossStyleSlotKey(e.type, stageId);
  }
  return KNOWN_KEYS.has(key) ? key : null;
};

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

/** 倒したスロットキーの集合(読み取り専用のコピー)。 */
export const loadDefeatedBosses = (): Set<string> => new Set(read());

/** そのスロットのボスを倒したことがあるか。 */
export const hasDefeatedBoss = (slotKey: string): boolean => read().has(slotKey);

/** 倒した敵を記録する(キルの経路から呼ぶ)。対象外・練習系のラン・既に記録済みなら何もしない。 */
export const noteBossDefeated = (e: DefeatedEnemyLike, stageId: string): void => {
  const key = bossDefeatSlotKey(e, stageId);
  if (!key) return;
  if (isBossTestOrPracticeRun()) return;
  const set = read();
  if (set.has(key)) return;
  set.add(key);
  try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch { /* 保存不可でも進行は止めない */ }
};

/** テスト用: メモリキャッシュを捨てて localStorage から読み直す。 */
export const resetBossDefeatedCache = (): void => { cache = null; };

/** 進行リセット(開発用)から呼ぶ。 */
export const clearBossDefeated = (): void => {
  cache = new Set();
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
};
