import { describe, it, expect } from 'vitest';
import {
  EVENT_QUEST_CONFIG, getEventQuestConfig, questNamedSpawnPos, pickQuestNamedType,
  questKillProgress, QUEST_NAMED_DIST_MIN, QUEST_NAMED_DIST_MAX,
} from './eventQuest';

describe('eventQuest config (社長裁定v0.25.1686)', () => {
  it('強制を実際に課すのはステージ1のみ(3/4/5は最初からクリア済み扱い)', () => {
    expect(EVENT_QUEST_CONFIG['stage-1'].forced).toBe(true);
    expect(EVENT_QUEST_CONFIG['stage-3'].forced).toBe(false);
    expect(EVENT_QUEST_CONFIG['stage-4'].forced).toBe(false);
    expect(EVENT_QUEST_CONFIG['stage-5'].forced).toBe(false);
  });
  it('サブ目標: st1=全10体 / st3=青5 / st4=紫5 / st5=赤5', () => {
    expect(EVENT_QUEST_CONFIG['stage-1'].sub).toEqual({ tier: null, count: 10 });
    expect(EVENT_QUEST_CONFIG['stage-3'].sub).toEqual({ tier: 'blue', count: 5 });
    expect(EVENT_QUEST_CONFIG['stage-4'].sub).toEqual({ tier: 'purple', count: 5 });
    expect(EVENT_QUEST_CONFIG['stage-5'].sub).toEqual({ tier: 'red', count: 5 });
  });
  it('設定の無いステージ(=二人が出ない)は null', () => {
    expect(getEventQuestConfig('stage-2')).toBeNull();
    expect(getEventQuestConfig('stage-6')).toBeNull();
    expect(getEventQuestConfig('')).toBeNull();
  });
  it('ネームド候補はパンプキンか犬(社長指示)', () => {
    for (const id of ['stage-1', 'stage-3', 'stage-4', 'stage-5']) {
      expect(EVENT_QUEST_CONFIG[id].namedTypes).toEqual(['pumpkin', 'werewolf']);
    }
    expect(pickQuestNamedType(EVENT_QUEST_CONFIG['stage-1'], () => 0)).toBe('pumpkin');
    expect(pickQuestNamedType(EVENT_QUEST_CONFIG['stage-1'], () => 0.99)).toBe('werewolf');
  });
});

describe('questNamedSpawnPos: 二人と反対側の研究対象区域', () => {
  it('原点から見て二人の反対方向・距離2000-2600(研究対象区域1500-3000内)', () => {
    for (const [nx, ny, r] of [[700, 0, 0], [0, -500, 0.5], [-400, 400, 0.99]] as const) {
      const pos = questNamedSpawnPos(nx, ny, () => r);
      const dist = Math.hypot(pos.x, pos.y);
      expect(dist).toBeGreaterThanOrEqual(QUEST_NAMED_DIST_MIN - 1e-6);
      expect(dist).toBeLessThanOrEqual(QUEST_NAMED_DIST_MAX + 1e-6);
      expect(dist).toBeGreaterThan(1500); // 研究対象区域の内側
      expect(dist).toBeLessThan(3000);
      // 反対方向 = 二人ベクトルとの内積が負(ほぼ真逆)
      expect(pos.x * nx + pos.y * ny).toBeLessThan(0);
    }
  });
});

describe('questKillProgress: キル1件の進捗判定', () => {
  it('未受注(null)は常に無反応', () => {
    expect(questKillProgress(null, null, 0, {})).toBeNull();
  });
  it('forced はクエスト対象個体のみ 1 になる', () => {
    expect(questKillProgress('forced', null, 0, { questTarget: true })).toBe(1);
    expect(questKillProgress('forced', null, 0, {})).toBeNull();
    expect(questKillProgress('forced', null, 0, { colorTier: 'red' })).toBeNull();
  });
  it('sub tier=null は全キルを数える', () => {
    expect(questKillProgress('sub', null, 0, {})).toBe(1);
    expect(questKillProgress('sub', null, 7, { colorTier: 'blue' })).toBe(8);
  });
  it('sub 指定色は colorTier 一致のみ数える', () => {
    expect(questKillProgress('sub', 'blue', 2, { colorTier: 'blue' })).toBe(3);
    expect(questKillProgress('sub', 'blue', 2, { colorTier: 'red' })).toBeNull();
    expect(questKillProgress('sub', 'purple', 0, {})).toBeNull();
  });
});
