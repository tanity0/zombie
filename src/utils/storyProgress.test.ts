import { describe, it, expect } from 'vitest';
import {
  SUB_QUEST_STAGE_IDS, subsAllCompleted, revisitCardState, canShowEx, endingFollowup,
} from './storyProgress';
import { emptyStoryFlags, type StoryFlags } from '../data/progress';

const flags = (patch: Partial<StoryFlags> = {}): StoryFlags => ({ ...emptyStoryFlags(), ...patch });

describe('the ONE ストーリー分岐(統合正本8〜10章 / 指示書9・12章)', () => {
  it('任意サブ3本 = ステージ1/3/4(ステージ5は遭遇のみで対象外)', () => {
    expect([...SUB_QUEST_STAGE_IDS]).toEqual(['stage-1', 'stage-3', 'stage-4']);
  });

  it('subsAllCompleted: 0〜2本では false、3本で true(サブ0〜2本では薬を受け取らない)', () => {
    expect(subsAllCompleted(() => false)).toBe(false);
    expect(subsAllCompleted(id => id === 'stage-1')).toBe(false);
    expect(subsAllCompleted(id => id !== 'stage-4')).toBe(false);
    expect(subsAllCompleted(() => true)).toBe(true);
    // stage-5 のサブフラグ(遭遇のみで立つ)は判定に関与しない
    expect(subsAllCompleted(id => id === 'stage-5')).toBe(false);
  });

  describe('revisitCardState(再訪は薬所持・未使用時だけ出る)', () => {
    it('条件未成立(旧セーブ含む全て初期値)では hidden', () => {
      expect(revisitCardState(flags(), false)).toBe('hidden');
      expect(revisitCardState(flags(), true)).toBe('hidden');
    });
    it('通常ED完了+サブ3本+薬所持+未使用 → available', () => {
      expect(revisitCardState(flags({ endingSeen: true, medicineOwned: true }), true)).toBe('available');
    });
    it('どれか欠けたら hidden(ED未見/薬未所持/サブ未完了)', () => {
      expect(revisitCardState(flags({ medicineOwned: true }), true)).toBe('hidden');
      expect(revisitCardState(flags({ endingSeen: true }), true)).toBe('hidden');
      expect(revisitCardState(flags({ endingSeen: true, medicineOwned: true }), false)).toBe('hidden');
    });
    it('薬使用後は cleared(CLEAR表示+非活性・再受注不可)', () => {
      expect(revisitCardState(flags({ endingSeen: true, medicineOwned: true, medicineUsed: true, revisitCleared: true }), true)).toBe('cleared');
    });
  });

  it('canShowEx: 再訪で薬を使用後にのみ EX ノードが出る', () => {
    expect(canShowEx(flags())).toBe(false);
    expect(canShowEx(flags({ endingSeen: true, medicineOwned: true }))).toBe(false);
    expect(canShowEx(flags({ medicineUsed: true }))).toBe(true);
  });

  describe('endingFollowup(ED後の後続はどちらか一方・本文は共通)', () => {
    it('サブ3本完了・薬未付与 → medicine(付与+資料解放)', () => {
      expect(endingFollowup(flags(), true)).toBe('medicine');
    });
    it('サブ3本完了・薬付与済み(再クリア) → none(重複取得しない)', () => {
      expect(endingFollowup(flags({ medicineOwned: true }), true)).toBe('none');
    });
    it('サブ未完了・初回 → hint / 表示済み → none(毎回表示しない)', () => {
      expect(endingFollowup(flags(), false)).toBe('hint');
      expect(endingFollowup(flags({ hintShown: true }), false)).toBe('none');
    });
  });
});
