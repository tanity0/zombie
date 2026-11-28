// ★孫悟空(固有の幻影・拳鬼)のレベルと、格闘技の体得(research/BRAWLER.md §36・社長指示2026-11-20)。
// 依存ゼロの葉(store / PixiJS を読まない)。端末の進行に1つの値(孫悟空のレベル)だけを持つ。体得はレベルから決まる
// (Lv1 を倒した=Lv2 になった時に抉り打ち・Lv2 を倒した=Lv3 になった時に踵落とし・Lv3 を倒した=Lv4 で蹴り上げ・Lv4 を倒した=済(5)で土竜)。
// ※対策室(練習)中の書き込みは practiceGuard が localStorage ごと封じる(ここでも練習では上げない=二重の安全網)。
import { KENKI_LEVEL_NAMES, KENKI_LEVEL_LINES } from '../data/kenkiNames';
import { isUnlockAllOn } from './unlockAll'; // 開発用「すべて解放」(体得だけ全部。孫悟空のレベルは書き換えない)

/** 孫悟空のレベル(1〜4)と済(5=斉天大聖)。 */
export type KenkiLevel = 1 | 2 | 3 | 4 | 5;
export const KENKI_LEVEL_MAX: KenkiLevel = 5;
const KEY = 'zombie.progress.kenkiLevel';

/** 今の孫悟空の体力の式に足す分(§36-1 の表・積み上げ: +50 / +120 / +220)。済は Lv4 と同じ。 */
export const KENKI_LEVEL_HP_BONUS: Readonly<Record<KenkiLevel, number>> = { 1: 0, 2: 50, 3: 120, 4: 220, 5: 220 };
export const kenkiLevelHealth = (base: number, lv: KenkiLevel): number => Math.max(1, Math.round(base + KENKI_LEVEL_HP_BONUS[lv]));

/** 見た目(色・名前)。色は既存の色付き個体の色(青/紫/赤)・済は宿敵の金。名前はレベルごと(data/kenkiNames の1か所)。 */
export type KenkiLook = { tint: 'blue' | 'purple' | 'red' | 'gold' | null; name: string };
export const kenkiLevelLook = (lv: KenkiLevel): KenkiLook => ({
  tint: lv === 2 ? 'blue' : lv === 3 ? 'purple' : lv === 4 ? 'red' : lv === 5 ? 'gold' : null,
  name: KENKI_LEVEL_NAMES[lv],
});
/** その段の孫悟空のセリフ1行(通信に積む形 {name, text})。話者名=その段の名前(頭上の名札と同じ)。文言は data/kenkiNames の1か所。 */
export const kenkiLevelLine = (lv: KenkiLevel, when: 'intro' | 'defeat'): { name: string; text: string } => ({
  name: KENKI_LEVEL_NAMES[lv],
  text: KENKI_LEVEL_LINES[lv][when],
});

/** 体得する格闘技。 */
export type BrawlerArt = 'gouge' | 'heel' | 'kickup' | 'mogura';
/** その技を体得するために倒すレベル(このレベルの孫悟空を倒すと体得)。 */
export const BRAWLER_ART_FROM_LEVEL: Readonly<Record<BrawlerArt, KenkiLevel>> = { gouge: 1, heel: 2, kickup: 3, mogura: 4 }; // 抉り打ち=Lv1 を倒した報酬(社長裁定2026-11-27)
/** 技の名前(帯・リザルト・資料室)。 */
export const BRAWLER_ART_NAME: Readonly<Record<BrawlerArt, string>> = { gouge: '抉り打ち', heel: '踵落とし', kickup: '蹴り上げ', mogura: '土竜' };
/** いまのレベル(=次に出る孫悟空のレベル)で、その技を体得しているか。 */
export const brawlerArtLearnedAt = (lv: KenkiLevel, art: BrawlerArt): boolean => lv > BRAWLER_ART_FROM_LEVEL[art];
/** そのレベルの孫悟空を倒した時に体得する技(無ければ null)。 */
export const brawlerArtLearnedOnKill = (killedLv: KenkiLevel): BrawlerArt | null =>
  (Object.keys(BRAWLER_ART_FROM_LEVEL) as BrawlerArt[]).find(a => BRAWLER_ART_FROM_LEVEL[a] === killedLv) ?? null;

/** 倒した時にレベルが上がる出撃か(§36-1: 本編・格闘を装備・練習/ボス戦テスト/ベンチ/smoke は除く)。 */
export interface KenkiKillCtx {
  brawlerEquipped: boolean;
  practice: boolean;
  bossTest: boolean;
  bench: boolean;
  smoke: boolean;
}
export const kenkiKillCounts = (c: KenkiKillCtx): boolean => c.brawlerEquipped && !c.practice && !c.bossTest && !c.bench && !c.smoke;
/** 倒した後のレベル(1回に1段・済で止まる)。数えない出撃・済の時は null(変わらない)。 */
export const kenkiLevelAfterKill = (killedLv: KenkiLevel, c: KenkiKillCtx): KenkiLevel | null =>
  kenkiKillCounts(c) && killedLv < KENKI_LEVEL_MAX ? ((killedLv + 1) as KenkiLevel) : null;
/** 出す孫悟空のレベル(練習=変異体対策室は今どおり Lv1=斉天大聖は出ない)。 */
export const kenkiSpawnLevel = (saved: KenkiLevel, practice: boolean): KenkiLevel => (practice ? 1 : saved);

const clampLevel = (n: number): KenkiLevel => (Number.isFinite(n) ? (Math.max(1, Math.min(KENKI_LEVEL_MAX, Math.round(n))) as KenkiLevel) : 1);
// 入力の度に localStorage を読まない(格闘の技の入力から毎回引く)=読み込みは1回だけ・書くたびに更新する。
let cache: KenkiLevel | null = null;
export const loadKenkiLevel = (): KenkiLevel => {
  if (cache !== null) return cache;
  let v: KenkiLevel = 1;
  try { if (typeof localStorage !== 'undefined') v = clampLevel(Number(localStorage.getItem(KEY) ?? '1')); } catch { /* ignore */ }
  cache = v;
  return v;
};
export const saveKenkiLevel = (lv: KenkiLevel): void => {
  cache = clampLevel(lv);
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, String(cache)); } catch { /* ignore */ }
};
/** 進行リセット: Lv1 へ戻す(体得も消える)。 */
export const clearKenkiLevel = (): void => {
  cache = 1;
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY); } catch { /* ignore */ }
};
/** いまその技を体得しているか(格闘の入力が引く)。開発用「すべて解放」がオンの間は全部体得扱い。 */
export const isBrawlerArtLearned = (art: BrawlerArt): boolean => brawlerArtLearnedAt(loadKenkiLevel(), art) || isUnlockAllOn();
/** テスト用: 保存せずにレベルを決める(null=次の読み込みで localStorage から読み直す)。 */
export const setKenkiLevelForTest = (lv: KenkiLevel | null): void => { cache = lv; };

// ---- 歴史年表(社長指示2026-11-20「年表には出して」) ----
/** 年表: そのレベルの孫悟空を倒した行(レベルごとにゲーム全体で1行)。 */
export const kenkiChronicleKillDetail = (lv: KenkiLevel): string => `phantom-brawler-lv${lv}`;
export const kenkiChronicleKillPhrase = (lv: KenkiLevel): string => `${KENKI_LEVEL_NAMES[lv]}を討伐`;
/** 年表: 格闘技を体得した行(技ごとにゲーム全体で1行)。 */
export const brawlerArtChronicleDetail = (art: BrawlerArt): string => `brawler-art-${art}`;
export const brawlerArtChroniclePhrase = (art: BrawlerArt): string => `格闘技『${BRAWLER_ART_NAME[art]}』を体得`;
