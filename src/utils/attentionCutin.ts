// ボス出現カットイン(PACING_PUZZLE.md §6.36「BOSS-INTRO-CUTIN」)の純関数側。
// 判定・尺の計算はここに置き、gameStore(トリガ)/useGameLoop(位相)/BossCutin.tsx(DOM)が同じ1本を引く。
import type { EnemyType } from '../types/game';
import { bossCutinName } from '../data/bossCutin';
import { bossIconSrc } from './bossIcon';

/** カットインの表示情報。attention レコードに載せて DOM(BossCutin.tsx)が読む。 */
export interface AttentionCutin {
  name: string;
  /** 全画面に大写しする絵のURL(bossIconSrc)。無いボスは名前だけ出す。 */
  art: string | null;
}

/** カットインの尺(§6.36: 1.1秒・毎回出す=社長裁定2026-08-07)。 */
export const BOSS_CUTIN_MS = 1100;

/**
 * 出現カットインのペイロード。台帳(bossCutin.ts)に名前が無いボス=実装してないボスは
 * undefined(=カットイン無しで従来のattentionのみ)。呼び出し側はこれをtriggerAttentionへ渡す。
 */
export const bossCutinPayload = (bossType: EnemyType, stageId?: string | null): AttentionCutin | undefined => {
  const name = bossCutinName(bossType, stageId);
  if (!name) return undefined;
  return { name, art: bossIconSrc(bossType, stageId) };
};

/**
 * 後着の triggerAttention を無視すべきか(§6.36 first-wins)。
 * attention が生きている間、新旧どちらかが cutin 持ちなら後着を無視する。
 * 素のattention同士は従来どおり上書き(=false)で挙動不変。
 */
export const shouldIgnoreAttention = (
  existingAlive: boolean,
  existingHasCutin: boolean,
  incomingHasCutin: boolean,
): boolean => existingAlive && (existingHasCutin || incomingHasCutin);

/**
 * カットイン窓(hold終了〜out開始の間)か(v0.25.2958・社長指示で復帰): in→hold→cutin→out。
 * カメラはカットイン中もhold位置に静止し、outはカットイン後に始まる。
 * cutinMs=0(素のattention)は常にfalse=従来と1msも変わらない。
 */
export const isCutinWindow = (
  elapsedMs: number,
  inMs: number,
  holdMs: number,
  cutinMs: number,
): boolean => cutinMs > 0 && elapsedMs >= inMs + holdMs && elapsedMs < inMs + holdMs + cutinMs;
