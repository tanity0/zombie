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

// バッチ3.5-Bの追補(問題児リフラクトリ): 型ごとの最終キル時刻(gameTime ms)。
// 問題児(pumpkin/werewolf/plant/ghost)のみ記録すれば足りるが、汎用にEnemyType全体で持つ。
let lastKillAt: Partial<Record<EnemyType, number>> = {};

// method: 'gun' はガン/接触/爆発(damageEnemyのkill分岐)、'melee' は近接全経路
// (grantMeleeKillRewards=シールドバッシュ/カウンター/刀/鞭/アンカー等)。
// gameTimeMs省略時はリフラクトリ判定を使わない呼び出し向け(既存呼び出しの後方互換)。
export const recordKill = (type: EnemyType, method: 'gun' | 'melee', gameTimeMs?: number): void => {
  totals.byBucket[bucketForKill(type)] += 1;
  if (method === 'gun') totals.gunKills += 1;
  else totals.meleeKills += 1;
  if (gameTimeMs !== undefined) lastKillAt[type] = gameTimeMs;
};

export const getKillTotals = (): Readonly<KillTotals> => totals;
export const getLastKillAt = (type: EnemyType): number | undefined => lastKillAt[type];

// GAME_AUDIT追補(v0.25.1343): フェーズ境界のアンカー用ディープコピー。getKillTotals()は生きている
// オブジェクトを返すため、参照のまま保存すると「開始時点」も一緒に増えて差分が常に0になる
// (バッチ4の苦戦判定が全featured型を毎回キル0=苦戦と誤認していた実バグの原因)。
export const snapshotKillTotals = (): KillTotals => ({
  byBucket: { ...totals.byBucket },
  gunKills: totals.gunKills,
  meleeKills: totals.meleeKills,
});

// GAME_AUDIT追補(v0.25.1343): 型別の「出現」数(バケツ単位)。苦戦判定を
// 「出現したのにキルが少ない」にするための記録。gameStore.addEnemy(全スポーン経路の合流点)が加算。
let spawnsByBucket: Record<KillBucket, number> = { pumpkin: 0, werewolf: 0, plant: 0, ghost: 0, screamer: 0, chaff: 0 };
export const recordSpawn = (type: EnemyType): void => {
  spawnsByBucket[bucketForKill(type)] += 1;
};
export const snapshotSpawns = (): Record<KillBucket, number> => ({ ...spawnsByBucket });

export const resetKillTelemetry = (): void => {
  totals = createTotals();
  lastKillAt = {};
  spawnsByBucket = { pumpkin: 0, werewolf: 0, plant: 0, ghost: 0, screamer: 0, chaff: 0 };
};

// 直前に完了したフェーズの種別キル内訳+その時点のスタイル(デバッグ表示用)。
export interface PhaseKillDebug {
  phaseKey: string;
  killsByBucket: Record<KillBucket, number>;
  spawnsByBucket?: Record<KillBucket, number>; // v0.25.1343: そのフェーズ中の出現数(苦戦判定用)
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
