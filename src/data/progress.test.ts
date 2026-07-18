// 歴史年表(chronicle)の純ロジック(初回のみ記録=dedup / ラベル前置 / stageId空ガード)のユニット。
// node 既定環境には localStorage が無く、progress.ts の各リーダーは `typeof localStorage === 'undefined'`
// で早期returnする。ここでは最小の localStorage モックを差してから記録系を叩く(import は遅延読みなので
// 呼び出し時にモックが効いていれば良い)。
import { describe, it, expect, beforeEach } from 'vitest';

const backing: Record<string, string> = {};
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (k in backing ? backing[k] : null),
  setItem: (k: string, v: string) => { backing[k] = v; },
  removeItem: (k: string) => { delete backing[k]; },
  clear: () => { for (const k of Object.keys(backing)) delete backing[k]; },
  key: () => null,
  get length() { return Object.keys(backing).length; },
} as Storage;

import {
  recordChronicle, loadChronicle, stageChronicleLabel,
  markStageCleared, getClearedStages, getClearedMissions, markMissionCleared, missionIdForMain, resetProgress,
} from './progress';

beforeEach(() => { for (const k of Object.keys(backing)) delete backing[k]; });

// PACING_PUZZLE.md §6.19 M42 / STORY_UI_SPEC.md追補1-4/5: ミッション単位クリア集合(missionId)。
// 既存のステージクリア保存とは別キー(additive)で、MAINクリア時に両方へ記録される仕様のユニット。
describe('ミッション単位クリア集合(missionId・M42)', () => {
  it('missionIdForMain: `${stageId}:main` 形式を返す', () => {
    expect(missionIdForMain('stage-2')).toBe('stage-2:main');
  });

  it('markMissionCleared: 初回は追加され、getClearedMissions に反映される', () => {
    expect(getClearedMissions().size).toBe(0);
    markMissionCleared('stage-1:main');
    expect(getClearedMissions().has('stage-1:main')).toBe(true);
  });

  it('markMissionCleared: 再クリアで重複しない(冪等)', () => {
    markMissionCleared('stage-1:main');
    markMissionCleared('stage-1:main');
    expect(getClearedMissions().size).toBe(1);
  });

  it('missionId が空なら何もしない', () => {
    markMissionCleared('');
    expect(getClearedMissions().size).toBe(0);
  });

  it('markStageCleared: 既存のステージクリア集合とミッション単位クリア集合の両方へ同時記録する(追補1-5)', () => {
    markStageCleared('stage-2');
    expect(getClearedStages().has('stage-2')).toBe(true);
    expect(getClearedMissions().has('stage-2:main')).toBe(true);
  });

  it('markStageCleared: 既存のステージクリア保存キーとは別キーで保存される(additive)', () => {
    markStageCleared('stage-2');
    // 既存キー(zombie.progress.cleared)には従来どおり stageId のみが入り、missionId形式は混ざらない。
    const raw = backing['zombie.progress.cleared'];
    expect(JSON.parse(raw)).toEqual(['stage-2']);
  });

  it('resetProgress: ミッション単位クリア集合も進行リセットで消える', () => {
    markStageCleared('stage-2');
    resetProgress();
    expect(getClearedMissions().size).toBe(0);
    expect(getClearedStages().size).toBe(0);
  });
});

describe('歴史年表(chronicle)', () => {
  it('初回のみ記録: 同じ(stage,kind,detail)は2回目以降 false で重複しない', () => {
    expect(recordChronicle('stage-1', 'zone', '4', '深層域に到達')).toBe(true);
    expect(recordChronicle('stage-1', 'zone', '4', '深層域に到達')).toBe(false);
    expect(loadChronicle().filter(e => e.key === 'stage-1::zone::4')).toHaveLength(1);
  });

  it('detail違い / kind違い / ステージ違いは別レコードとして共存する', () => {
    recordChronicle('stage-1', 'zone', '3', 'デンジャーゾーンに到達');
    recordChronicle('stage-1', 'zone', '4', '深層域に到達');
    recordChronicle('stage-1', 'boss', 'mimir', 'ミーミルを討伐');
    recordChronicle('stage-2', 'zone', '4', '深層域に到達');
    expect(loadChronicle()).toHaveLength(4);
  });

  it('ラベルにステージ見出し(main=「ステージN」)を前置する', () => {
    recordChronicle('stage-1', 'boss', 'mimir', 'ミーミルを討伐');
    expect(loadChronicle().find(e => e.kind === 'boss')?.label).toBe('ステージ1 ミーミルを討伐');
  });

  it('stageId が空なら記録しない', () => {
    expect(recordChronicle('', 'reaper', 'reaper', '死神を討伐')).toBe(false);
    expect(loadChronicle()).toHaveLength(0);
  });

  it('stageChronicleLabel: 本編ステージは「ステージN」', () => {
    expect(stageChronicleLabel('stage-1')).toBe('ステージ1');
  });
});

// ランク持ち越し(社長決定v0.25.1844): 各ステージごとに「最終ランク−1」を次ランの開始ランクへ。
// 死亡/クリア/撤退すべて同じ扱い・下限R1・上限R7。
describe('ランク持ち越し(startRank・社長決定v0.25.1844→再調整v0.25.1847=そのまま保持)', () => {
  it('carryOverStartRank: 最終ランクをそのまま保持・クランプ1..7', async () => {
    const { carryOverStartRank } = await import('./progress');
    expect(carryOverStartRank(3)).toBe(3);  // R3で死亡→次もR3(次ランの査定で維持/降格が再チェックされる)
    expect(carryOverStartRank(1)).toBe(1);  // 下限R1
    expect(carryOverStartRank(7)).toBe(7);  // R7→R7
    expect(carryOverStartRank(0)).toBe(1);  // 異常値は下限へ
    expect(carryOverStartRank(9)).toBe(7);  // 異常値は上限へ
  });
  it('setStartRankFromFinal→getStartRank がステージ毎に独立して往復する', async () => {
    const { setStartRankFromFinal, getStartRank } = await import('./progress');
    expect(getStartRank('stage-1')).toBe(1); // 未保存=R1
    setStartRankFromFinal('stage-1', 3);
    setStartRankFromFinal('stage-3', 7);
    expect(getStartRank('stage-1')).toBe(3);
    expect(getStartRank('stage-3')).toBe(7);
    expect(getStartRank('stage-4')).toBe(1); // 他ステージは影響なし
  });
  it('stageId空は保存しない・壊れた保存値はR1へフォールバック', async () => {
    const { setStartRankFromFinal, getStartRank } = await import('./progress');
    setStartRankFromFinal('', 5);
    expect(getStartRank('')).toBe(1);
    localStorage.setItem('zombie.progress.startRank', '{"stage-1":"junk"}');
    expect(getStartRank('stage-1')).toBe(1);
  });
});
