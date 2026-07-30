// BOT_AND_GHOST.md §2.13(撃破リザルト「年表」)/§2.14(独立メニュー「守護霊」)/§2.16 B・C の
// **表示用の純関数だけ**を置く場所。playerTraits.ts(台帳=保存)とUI(GameOverScreen/MissionSelect)の
// 間に挟まる薄い層で、store/React/PixiJS非依存=ヘッドレスでテストできる(CLAUDE.md 実装精度の規律4)。
//
// 掟:
// - **スコアは保存しない**(§2.13)。ここは保存済みの生値(撃破タイム/被弾per分/カウンター成功率)を
//   受け取って「今回 vs 現在の記録」を組み立てるだけ。新しい保存項目はここでは作らない。
// - ベスト保持の判定は playerTraits の `isBetterBossStyleSample` を**そのまま使う**(記録が実際に
//   上書きされるかと、UIの「記録更新」表示がズレないようにする=写さない・共通化する)。
import type { EnemyType } from '../types/game';
import type { GhostAllySnapshot } from './playerBuild';
import {
  isBetterBossStyleSample,
  type BossStyleSlot, type PendingBossClearView, type PlayerProfile,
} from './playerTraits';

/** 良化/悪化の向き。first=比較対象なし(初記録)。 */
export type ClearTrend = 'first' | 'better' | 'worse' | 'same';

/** 小さい方が良い指標(撃破タイム・被弾/分)の比較。 */
export const trendLowerBetter = (sample: number | null, best: number | null | undefined): ClearTrend => {
  if (sample === null || best === null || best === undefined) return 'first';
  if (sample < best) return 'better';
  if (sample > best) return 'worse';
  return 'same';
};

/** 大きい方が良い指標(カウンター成功率)の比較。 */
export const trendHigherBetter = (sample: number | null, best: number | null | undefined): ClearTrend => {
  if (sample === null || best === null || best === undefined) return 'first';
  if (sample > best) return 'better';
  if (sample < best) return 'worse';
  return 'same';
};

/**
 * `bossStyleSlotKey` の逆変換(純関数)。`giantbat@stage-3` → {bossType:'giantbat', stageId:'stage-3'}、
 * それ以外(`thor` 等)→ {bossType:'thor', stageId:null}。**キーの作り方を変えたらここも直す**
 * (組み立て=playerTraits.bossStyleSlotKey / 分解=ここ、の2箇所だけに閉じる)。
 */
export const parseBossSlotKey = (slotKey: string): { bossType: EnemyType; stageId: string | null } => {
  const at = slotKey.indexOf('@');
  return at < 0
    ? { bossType: slotKey as EnemyType, stageId: null }
    : { bossType: slotKey.slice(0, at) as EnemyType, stageId: slotKey.slice(at + 1) };
};

/** 年表カード1枚ぶんの表示データ(リザルトの年表と、独立メニューの討伐記録一覧で**同じ型**を使う)。 */
export interface BossClearCard {
  slotKey: string;
  bossType: EnemyType;
  /** giantbat(ステージ別スロット)のときだけ非null。 */
  stageId: string | null;
  clearTimeMs: number | null;
  hitsPerMin: number | null;
  counterChance: number | null;
  /** 記録時刻(Date.now)。一覧の並び順に使う。 */
  at: number;
  /** 同行していた守護霊(持ち主名+ビルド写し)。不在ならnull=カード/名前を出さない。 */
  ally: GhostAllySnapshot | null;
  /** 比較対象=**このランを反映する前**の保存記録。一覧(それ自体が記録)ではnull。 */
  best: { clearTimeMs: number | null; hitsPerMin: number | null; counterChance: number | null } | null;
  /** 採用したら記録が上書きされるか(=「記録更新」表示)。既存記録が無ければtrue(初記録)。 */
  isRecordUpdate: boolean;
}

const slotBest = (slot: BossStyleSlot | undefined) => slot
  ? { clearTimeMs: slot.clearTimeMs ?? null, hitsPerMin: slot.hitsPerMin, counterChance: slot.counterChance }
  : null;

/**
 * §2.16 B: このランの撃破(保留中のbossStyleレコード)を**撃破順**に年表カードへ組み立てる。
 * `profile` は**まだこのランを反映していない**保存プロファイル(=現在の記録)。
 */
export const buildRunTimeline = (
  clears: readonly PendingBossClearView[], profile: PlayerProfile | null,
): BossClearCard[] => clears.map(c => {
  const prev = profile?.bossStyles?.[c.slotKey];
  const { bossType, stageId } = parseBossSlotKey(c.slotKey);
  return {
    slotKey: c.slotKey,
    bossType, stageId,
    clearTimeMs: c.clearTimeMs,
    hitsPerMin: c.hitsPerMin,
    counterChance: c.counterChance,
    at: c.at,
    ally: c.ally,
    best: slotBest(prev),
    isRecordUpdate: isBetterBossStyleSample(prev?.hitsPerMin, c.hitsPerMin),
  };
});

/**
 * §2.16 C-2: 保存済みの討伐記録(G5アルバム=ボススロット別ベスト)を一覧カードへ組み立てる。
 * 並びは**新しい順**(at 降順・叩き台)。比較対象は無い(そのカード自身が現在の記録)。
 */
export const buildAlbumCards = (profile: PlayerProfile | null): BossClearCard[] => {
  const slots = profile?.bossStyles;
  if (!slots) return [];
  return Object.entries(slots)
    .map(([slotKey, slot]) => {
      const { bossType, stageId } = parseBossSlotKey(slotKey);
      return {
        slotKey,
        bossType, stageId,
        clearTimeMs: slot.clearTimeMs ?? null,
        hitsPerMin: slot.hitsPerMin,
        counterChance: slot.counterChance,
        at: slot.at,
        ally: slot.ally ?? null,
        best: null,
        isRecordUpdate: false,
      };
    })
    .sort((a, b) => b.at - a.at);
};

/** 撃破タイムの表示(`m:ss.d`)。null=未記録は「—」。 */
export const formatClearTime = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const d = Math.floor((total % 1000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${d}`;
};

/** 0..1 の率を百分率表示に。null=未計測は「—」。 */
export const formatRatePercent = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : `${Math.round(v * 100)}%`;

/** 被弾/分の表示(小数1桁)。null=未計測は「—」。 */
export const formatPerMin = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(1);
