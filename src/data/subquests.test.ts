// サブクエスト台帳の不変条件(research/SUBQUESTS.md テスト節)。
// 「id/orderユニーク・報酬20..200・台帳は stage-1〜6 のみ」+ 種別ごとの必須パラメータ。
// ここが機械化されていれば、後から台帳を足す時に形の崩れが必ず落ちる。
import { describe, it, expect } from 'vitest';
import {
  SUBQUESTS, SUBQUEST_STAGE_IDS, SUBQUEST_REWARD_MIN, SUBQUEST_REWARD_MAX,
  subquestsForStage, subquestLabel, subquestById,
} from './subquests';

describe('サブクエスト台帳の不変条件', () => {
  it('idは全体でユニーク', () => {
    const ids = SUBQUESTS.map(q => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('orderはステージ内でユニークかつ1から連番', () => {
    for (const stageId of SUBQUEST_STAGE_IDS) {
      const defs = subquestsForStage(stageId);
      const orders = defs.map(d => d.order);
      expect(new Set(orders).size).toBe(orders.length);
      expect(orders).toEqual(orders.map((_, i) => i + 1));
    }
  });

  it('報酬は20〜200Gの範囲(裁定1)', () => {
    for (const q of SUBQUESTS) {
      expect(q.rewardGold).toBeGreaterThanOrEqual(SUBQUEST_REWARD_MIN);
      expect(q.rewardGold).toBeLessThanOrEqual(SUBQUEST_REWARD_MAX);
    }
  });

  it('★台帳が存在するのは stage-1〜6 のみ(訓練/stage-7/EXには無い)', () => {
    expect([...SUBQUEST_STAGE_IDS].sort()).toEqual(
      ['stage-1', 'stage-2', 'stage-3', 'stage-4', 'stage-5', 'stage-6']
    );
    for (const none of ['stage-tutorial', 'stage-7', 'stage-ex1', 'stage-ex2', '']) {
      expect(subquestsForStage(none)).toEqual([]);
    }
  });

  it('必要数は1以上・種別ごとの必須パラメータが揃っている', () => {
    for (const q of SUBQUESTS) {
      expect(q.target).toBeGreaterThan(0);
      if (q.kind === 'kill-tier') expect(q.tier).toBeTruthy();
      else expect(q.tier).toBeUndefined();
      if (q.kind === 'kill-lab') expect([1, 2, 3]).toContain(q.labLevel);
      else expect(q.labLevel).toBeUndefined();
    }
  });

  it('★labelに数値を直書きしない(必ず {n} 差し込み・チュートリアル台帳と同じ掟)', () => {
    for (const q of SUBQUESTS) {
      expect(q.label).toContain('{n}');
      // 必要数そのものが文面に焼かれていないこと(「研究所Lv1」のような**種別の識別子**は数値ではない
      // ので許す。禁じているのは「バランス調整で嘘になる数字」)。
      expect(q.label.replace('{n}', '')).not.toContain(String(q.target));
      expect(subquestLabel(q)).toContain(String(q.target));
      expect(subquestLabel(q)).not.toContain('{n}');
    }
  });

  it('赤ティアを要求するのは stage-4/5/6 のみ(赤は area>=3 でしか湧かない・v2)', () => {
    for (const q of SUBQUESTS) {
      if (q.kind === 'kill-tier' && q.tier === 'red') {
        expect(['stage-4', 'stage-5', 'stage-6']).toContain(q.stageId);
      }
    }
  });

  it('ハンター系は屋内/研究所(stage-2)に置かない(ハンターが出ないステージ)', () => {
    for (const q of SUBQUESTS) {
      if (q.kind === 'hunter-survive') expect(q.stageId).not.toBe('stage-2');
    }
  });

  it('subquestById は台帳の全idを引ける', () => {
    for (const q of SUBQUESTS) expect(subquestById(q.id)).toBe(q);
    expect(subquestById('sq-none')).toBeUndefined();
  });
});
