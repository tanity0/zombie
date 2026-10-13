// 年表の「達成数 / 全体数」(chronicleCatalog)のユニット。
import { describe, it, expect } from 'vitest';
import { CHRONICLE_SLOTS, CHRONICLE_FULL_STAGES, chronicleProgress } from './chronicleCatalog';
import type { ChronicleEntry, ChronicleKind } from './progress';
import { STAGES } from './campaign';
import { GATE2_BOSS_TYPE_BY_STAGE } from '../config/gateBoss';

const entry = (stageId: string, kind: ChronicleKind, detail: string): ChronicleEntry =>
  ({ key: `${stageId}::${kind}::${detail}`, stageId, kind, label: '', at: 1 });

describe('年表の達成数 / 全体数', () => {
  it('全体数は73(屋外本編4ステージ×16+研究所1+洋館1+ステージ7の1+EX2+全体初回4)', () => {
    expect(CHRONICLE_SLOTS.length).toBe(73);
  });

  it('枠に重複が無い', () => {
    const keys = CHRONICLE_SLOTS.map(s => `${s.stageId}::${s.kind}::${s.detail}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('屋外本編ステージは全て裏ボスとゲート2の天使を持つ(表が欠けたら分母が黙って減る)', () => {
    for (const id of CHRONICLE_FULL_STAGES) {
      expect(STAGES.find(s => s.id === id)?.hiddenBoss).toBeTruthy();
      expect(GATE2_BOSS_TYPE_BY_STAGE[id]).toBeTruthy();
    }
  });

  it('記録なし=0 / 全部埋めれば分母と一致', () => {
    expect(chronicleProgress([])).toEqual({ got: 0, total: 73 });
    const all = CHRONICLE_SLOTS.map(s => entry(s.stageId ?? 'stage-1', s.kind, s.detail ?? 'x'));
    expect(chronicleProgress(all).got).toBe(73);
  });

  it('拠点は旧形式の記録(方位付き)が何件あっても1枠', () => {
    const got = chronicleProgress([
      entry('stage-1', 'base', 'north'), entry('stage-3', 'base', 'south'), entry('stage-4', 'base', 'b-2'),
    ]).got;
    expect(got).toBe(1);
  });

  it('POIはどのステージで開けても種別ごとに1枠', () => {
    expect(chronicleProgress([entry('stage-4', 'poi', 'police'), entry('stage-5', 'poi', 'police')]).got).toBe(1);
    expect(chronicleProgress([entry('stage-4', 'poi', 'police'), entry('stage-1', 'poi', 'armory')]).got).toBe(2);
  });

  it('表に無い記録(訓練のハンター・ステージ1の区域0)は数えない', () => {
    expect(chronicleProgress([entry('stage-tutorial', 'hunter', 'hunter'), entry('stage-1', 'zone', '0')]).got).toBe(0);
  });

  it('ステージ7のグレンとステージ1の城ボスは別の枠', () => {
    expect(chronicleProgress([entry('stage-7', 'boss', 'giantbat'), entry('stage-1', 'boss', 'giantbat')]).got).toBe(2);
  });
});
