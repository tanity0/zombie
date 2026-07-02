// PACING_REDESIGN.md バッチ2(計測)の軽量シングルトン。directorRankState.tsと同じパターン
// (Zustandのper-frame set()経由にしない=購読者を毎フレーム起こさない・CLAUDE.mdのReact再描画規律)。
// gameStore.tsの2つのキル経路(damageEnemyのkill分岐/grantMeleeKillRewards)が加算し、
// useGameLoopがフェーズ境界で読んで差分(そのフェーズ中のキル内訳)を取る。
//
// このバッチはゲーム挙動を一切変えない(記録と表示のみ)。誰も読まなくても加算コストは
// スカラーのインクリメントだけなので無視できる。

import { bucketForKill, styleFromKillCounts, type KillBucket, type PlayStyle } from './killTelemetry';
import type { EnemyType } from '../types/game';

interface KillTotals {
  byBucket: Record<KillBucket, number>;
  gunKills: number;
  meleeKills: number;
}

const createTotals = (): KillTotals => ({
  byBucket: { pumpkin: 0, werewolf: 0, plant: 0, ghost: 0, screamer: 0, chaff: 0 },
  gunKills: 0,
  meleeKills: 0,
});

let totals = createTotals();

// method: 'gun' はガン/接触/爆発(damageEnemyのkill分岐)、'melee' は近接全経路
// (grantMeleeKillRewards=シールドバッシュ/カウンター/刀/鞭/アンカー等)。
export const recordKill = (type: EnemyType, method: 'gun' | 'melee'): void => {
  totals.byBucket[bucketForKill(type)] += 1;
  if (method === 'gun') totals.gunKills += 1;
  else totals.meleeKills += 1;
};

export const getKillTotals = (): Readonly<KillTotals> => totals;

export const resetKillTelemetry = (): void => {
  totals = createTotals();
};

// 直前に完了したフェーズの種別キル内訳+その時点のスタイル(デバッグ表示用)。
export interface PhaseKillDebug {
  phaseKey: string;
  killsByBucket: Record<KillBucket, number>;
  style: PlayStyle;
}

let phaseDebug: PhaseKillDebug | null = null;

export const setPhaseKillDebug = (d: PhaseKillDebug): void => {
  phaseDebug = d;
};

export const getPhaseKillDebug = (): PhaseKillDebug | null => phaseDebug;

export const resetPhaseKillDebug = (): void => {
  phaseDebug = null;
};

export const getCurrentStyle = (): PlayStyle => styleFromKillCounts(totals.gunKills, totals.meleeKills);
