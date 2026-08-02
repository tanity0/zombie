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
import { displayNameFrom } from './playerName';
import {
  isBetterBossStyleSample,
  type BossStyleSlot, type PendingBossClearView, type PlayerProfile,
} from './playerTraits';
import type { DuoAlbum, DuoRunClearView } from './duoRecords';

/** 良化/悪化の向き。first=比較対象なし(初記録)。 */
export type ClearTrend = 'first' | 'better' | 'worse' | 'same';

/** 小さい方が良い指標(撃破タイム・被弾/分)の比較。 */
/**
 * ★保存済みレコードの同行者名を、表示に出す前に浄化する(品質監査D-3・v0.25.2766)。
 * 名前の入力フィルタ導入前に記録された `ally.name`(絵文字/双方向制御文字/長すぎる名前)が、
 * **討伐記録として永続化されたまま DOM へ出る**経路がここだった。
 * 全部落ちて空になったら `null`=「同行者なし」にする(名前の無い同行者カードは出さない、という
 * `ghostAllySnapshot` 側の既存の契約と揃える)。
 */
const cleanAlly = (a: GhostAllySnapshot | null | undefined): GhostAllySnapshot | null => {
  if (!a) return null;
  const name = displayNameFrom(a.name);
  if (name === null) return null;
  return name === a.name ? a : { ...a, name };
};

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
  best: { clearTimeMs: number | null; hitsPerMin: number | null; counterChance: number | null; perfScore: number | null } | null;
  /** v0.25.2603(社長式): このカード自身の評点(年表用。一覧/同行カードはnull)。 */
  perfScore: number | null;
  /** 採用したら記録が上書きされるか(=「記録更新」表示)。既存記録が無ければtrue(初記録)。 */
  isRecordUpdate: boolean;
}

const slotBest = (slot: BossStyleSlot | undefined) => slot
  ? {
    clearTimeMs: slot.clearTimeMs ?? null, hitsPerMin: slot.hitsPerMin, counterChance: slot.counterChance,
    perfScore: slot.perfScore ?? null, // v0.25.2603(社長式): 記録更新の判定はこの評点で行う
  }
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
    perfScore: c.perfScore,
    at: c.at,
    ally: cleanAlly(c.ally),
    best: slotBest(prev),
    // v0.25.2603(社長式): 判定基準を評点へ差し替え(旧: 被弾/分)。commit側と同じ純関数を使う。
    isRecordUpdate: isBetterBossStyleSample(prev?.perfScore, c.perfScore, prev !== undefined),
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
        perfScore: slot.perfScore ?? null,
        at: slot.at,
        ally: cleanAlly(slot.ally),
        best: null,
        isRecordUpdate: false,
      };
    })
    .sort((a, b) => b.at - a.at);
};

/**
 * §2.17(GHOST-DUO-RECORDS): このランの同行撃破(duoRecordsの打刻ビュー)を**撃破順**に
 * 年表カードへ組み立てる。同行枠は**計測しない**ので評価数値(被弾/分・カウンター率)は常にnull=
 * 表示側(BossClearCardRowのduoモード)がその行自体を出さない。比較対象(best)は打刻時点で確定済みの
 * bestBefore(撃破タイムのみ)を写す=「記録更新」表示は台帳の上書き結果とズレない。
 */
export const buildDuoRunTimeline = (clears: readonly DuoRunClearView[]): BossClearCard[] =>
  clears.map(c => {
    const { bossType, stageId } = parseBossSlotKey(c.slotKey);
    return {
      slotKey: c.slotKey,
      bossType, stageId,
      clearTimeMs: c.clearTimeMs,
      hitsPerMin: null,
      counterChance: null,
      perfScore: null,
      at: c.at,
      ally: cleanAlly(c.ally),
      best: c.bestBefore !== null
        ? { clearTimeMs: c.bestBefore, hitsPerMin: null, counterChance: null, perfScore: null }
        : null,
      isRecordUpdate: c.isRecordUpdate,
    };
  });

/**
 * §2.17(GHOST-DUO-RECORDS): 保存済みの同行撃破台帳(スロット別ベスト)を一覧カードへ組み立てる。
 * 並びはソロ枠(buildAlbumCards)と同じ**新しい順**(at降順)。比較対象は無い(カード自身が現在の記録)。
 */
export const buildDuoAlbumCards = (album: DuoAlbum | null): BossClearCard[] => {
  if (!album) return [];
  return Object.entries(album.slots)
    .map(([slotKey, slot]) => {
      const { bossType, stageId } = parseBossSlotKey(slotKey);
      return {
        slotKey,
        bossType, stageId,
        clearTimeMs: slot.clearTimeMs,
        hitsPerMin: null,
        perfScore: null,
        counterChance: null,
        at: slot.at,
        ally: cleanAlly(slot.ally),
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

/**
 * v0.25.2606(社長指示「ボス別にAIで使うスコアを表示されていればいい」): 評点の表示(整数)。
 * 用途は**判断材料**——「このボスのデータないや」「このボスはもっといいデータ撮るか」を一目で分かるように
 * するためのもので、過去の記録を残すためのものではない(自己ベスト台帳は作らない=社長裁定)。
 * 評点が出せない撃破(技に一度も晒されずに倒し切った等)は **「？？？」**(社長指示v0.25.2606)。
 * 他の数値の「—」(未計測)と違い、ここは「点が付いていない=撮り直す判断がまだできない」を意味するので
 * 別の記号にする。
 */
export const formatPerfScore = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v) ? '？？？' : String(Math.round(v));
