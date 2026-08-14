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
  recordChronicle, recordChronicleGlobalFirst, loadChronicle, stageChronicleLabel,
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

// 社長裁定2026-07-31: 拠点=「初めて拠点を開放」ゲーム全体で1件のみ / POI=「初めて警察署を開放」等
// 種別ごとゲーム全体で1件のみ(各ステージの2件目以降は載せない)。
describe('recordChronicleGlobalFirst(ゲーム全体で初回のみ)', () => {
  it('拠点(perDetail=false): 別ステージ・別拠点でも同kindが既にあれば載せない', () => {
    expect(recordChronicleGlobalFirst('stage-1', 'base', 'base-1', '初めて拠点を開放')).toBe(true);
    expect(recordChronicleGlobalFirst('stage-1', 'base', 'base-2', '初めて拠点を開放')).toBe(false); // 同ステージ別拠点
    expect(recordChronicleGlobalFirst('stage-2', 'base', 'base-1', '初めて拠点を開放')).toBe(false); // 別ステージ
    expect(loadChronicle().filter(e => e.kind === 'base')).toHaveLength(1);
  });

  it('既存セーブの旧形式(方位付き拠点)も「初回」と数えて新たに載せない(過去記録は消さない)', () => {
    recordChronicle('stage-1', 'base', 'base-3', '北の拠点を開放'); // 旧形式の既存エントリを再現
    expect(recordChronicleGlobalFirst('stage-2', 'base', 'base-1', '初めて拠点を開放')).toBe(false);
    expect(loadChronicle().filter(e => e.kind === 'base')).toHaveLength(1); // 旧エントリだけが残る
  });

  it('POI(perDetail=true): 種別ごとに全体1件=同種は別ステージでも載せず、別種は載る', () => {
    expect(recordChronicleGlobalFirst('stage-1', 'poi', 'police', '初めて警察署を開放', true)).toBe(true);
    expect(recordChronicleGlobalFirst('stage-2', 'poi', 'police', '初めて警察署を開放', true)).toBe(false);
    expect(recordChronicleGlobalFirst('stage-2', 'poi', 'armory', '初めて武器庫を開放', true)).toBe(true);
    expect(recordChronicleGlobalFirst('stage-1', 'poi', 'hospital', '初めて病院を開放', true)).toBe(true);
    expect(loadChronicle().filter(e => e.kind === 'poi')).toHaveLength(3);
  });

  it('ラベルは従来どおりステージ見出しが前置される(記録本体はrecordChronicleへ委譲)', () => {
    recordChronicleGlobalFirst('stage-1', 'poi', 'police', '初めて警察署を開放', true);
    expect(loadChronicle().find(e => e.kind === 'poi')?.label).toBe('ステージ1 初めて警察署を開放');
  });
});

// ランク持ち越し(社長決定v0.25.1844): 各ステージごとに「最終ランク−1」を次ランの開始ランクへ。
// 死亡/クリア/撤退すべて同じ扱い・下限R1・上限R7。
describe('年表のステージ6フィルタ(社長指示v0.25.2150「クリアしたか否かだけ」)', () => {
  it('recordChronicle: stage-6の道中記録(zone/rank/boss等)は記録されない', () => {
    expect(recordChronicle('stage-6', 'zone', '3', '未確認汚染エリアに到達')).toBe(false);
    expect(recordChronicle('stage-6', 'rank', '2', 'ランク到達')).toBe(false);
    expect(recordChronicle('stage-6', 'boss', 'hunter', '変異体(狩猟型)を討伐')).toBe(false);
    expect(loadChronicle()).toEqual([]);
  });

  it("recordChronicle: stage-6の'clear'は記録される(他ステージは従来どおり)", () => {
    expect(recordChronicle('stage-6', 'clear', 'clear', 'クリア')).toBe(true);
    expect(recordChronicle('stage-1', 'zone', '1', '研究対象区域に到達')).toBe(true);
    const list = loadChronicle();
    expect(list.map(e => e.key)).toEqual(['stage-6::clear::clear', 'stage-1::zone::1']);
  });

  it('loadChronicle: 既存セーブに残るstage-6の道中記録は読み出しで非表示(遡及)', () => {
    backing['zombie.progress.chronicle'] = JSON.stringify([
      { key: 'stage-6::zone::3', stageId: 'stage-6', kind: 'zone', label: 'ステージ6 未確認汚染エリアに到達', at: 1 },
      { key: 'stage-6::clear::clear', stageId: 'stage-6', kind: 'clear', label: 'ステージ6 クリア', at: 2 },
      { key: 'stage-1::zone::1', stageId: 'stage-1', kind: 'zone', label: 'ステージ1 研究対象区域に到達', at: 3 },
    ]);
    expect(loadChronicle().map(e => e.key)).toEqual(['stage-6::clear::clear', 'stage-1::zone::1']);
  });

  it('markStageCleared(stage-6): 年表にクリア1件だけ載る(冪等)', () => {
    markStageCleared('stage-6');
    markStageCleared('stage-6');
    const six = loadChronicle().filter(e => e.stageId === 'stage-6');
    expect(six).toHaveLength(1);
    expect(six[0].kind).toBe('clear');
    expect(six[0].label).toBe('ステージ6 クリア');
  });
});

// ランク持ち越し(旧startRank/stageMinStartRank系)はPACING_PUZZLE.md §7-11c(2)で廃止された。
// 置き換え先(rankFloorForElapsed等)のテストは src/utils/rankFloor.test.ts 側にある。
