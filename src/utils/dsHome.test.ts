// UI_OVERHAUL.md §3-1-2b「次の作戦地域」+§3-2 等高線シードの不変条件(監査A-6/A-7/B-4)。
import { describe, expect, it } from 'vitest';
import { STAGES } from '../data/campaign';
import { emptyStoryFlags } from '../data/progress';
import {
  CONTOUR_BAND_EPS, CONTOUR_H, CONTOUR_HILL_INNER, CONTOUR_STEP, CONTOUR_THRESHOLDS, CONTOUR_W,
  contourField, contourHills, nextOperationStage,
} from './dsHome';

const MAIN_IDS = STAGES.filter(s => s.kind === 'main' && !s.hidden).map(s => s.id);

describe('nextOperationStage(§3-1-2b)', () => {
  it('新規プレイヤー(クリアなし)はM0=stage-tutorialを指す', () => {
    const next = nextOperationStage(STAGES, new Set(), emptyStoryFlags());
    expect(next?.id).toBe('stage-tutorial');
  });

  it('途中まで進めたら未クリアの先頭(M0+M1クリア→stage-2)', () => {
    const cleared = new Set(['stage-tutorial', 'stage-1']);
    const next = nextOperationStage(STAGES, cleared, emptyStoryFlags());
    expect(next?.id).toBe('stage-2');
  });

  it('本編全クリア(EX非可視)は最終ノード=stage-7', () => {
    const next = nextOperationStage(STAGES, new Set(MAIN_IDS), emptyStoryFlags());
    expect(next?.id).toBe('stage-7');
  });

  it('EXは可視(薬使用済み)かつ未クリアの時だけ最優先(→stage-ex1)', () => {
    const flags = { ...emptyStoryFlags(), medicineUsed: true };
    const next = nextOperationStage(STAGES, new Set(MAIN_IDS), flags);
    expect(next?.id).toBe('stage-ex1');
    // 可視でも本編途中なら…EXは解放条件(stage-7クリア)を満たさないので通常規則のまま。
    const mid = nextOperationStage(STAGES, new Set(['stage-tutorial']), flags);
    expect(mid?.id).toBe('stage-1');
  });

  it('EXもクリア済みなら通常規則へ戻る(最終ノード=stage-7)', () => {
    const flags = { ...emptyStoryFlags(), medicineUsed: true };
    const next = nextOperationStage(STAGES, new Set([...MAIN_IDS, 'stage-ex1']), flags);
    expect(next?.id).toBe('stage-7');
  });

  it('hidden(stage-ex2 / stage-ending 等)はどの進行状態でも絶対に返らない', () => {
    const flagVariants = [emptyStoryFlags(), { ...emptyStoryFlags(), medicineUsed: true }];
    // 進行の全前進段面(クリア0個〜全部)+EXクリア込みを総当たり。
    for (const flags of flagVariants) {
      for (let n = 0; n <= MAIN_IDS.length; n++) {
        for (const extra of [[], ['stage-ex1']]) {
          const cleared = new Set([...MAIN_IDS.slice(0, n), ...extra]);
          const next = nextOperationStage(STAGES, cleared, flags);
          expect(next).not.toBeNull();
          expect(next?.hidden ?? false).toBe(false);
          expect(['stage-ex2', 'stage-ending']).not.toContain(next?.id);
        }
      }
    }
  });
});

describe('contourHills / contourField(§3-2・監査B-4)', () => {
  const allStageIds = STAGES.map(s => s.id);

  it('丘中心は632×300の内側60%領域に必ず収まる(実在stage id全部)', () => {
    const lo = (1 - CONTOUR_HILL_INNER) / 2;
    const hi = 1 - lo;
    for (const id of allStageIds) {
      for (const [cx, cy] of contourHills(id)) {
        expect(cx).toBeGreaterThanOrEqual(CONTOUR_W * lo);
        expect(cx).toBeLessThanOrEqual(CONTOUR_W * hi);
        expect(cy).toBeGreaterThanOrEqual(CONTOUR_H * lo);
        expect(cy).toBeLessThanOrEqual(CONTOUR_H * hi);
      }
    }
  });

  it('どのシードでも9本のしきい値すべてに塗り(サンプル)が出る', () => {
    for (const id of allStageIds) {
      const field = contourField(contourHills(id));
      for (const t of CONTOUR_THRESHOLDS) {
        let count = 0;
        for (let y = 0; y < CONTOUR_H && count === 0; y += CONTOUR_STEP) {
          for (let x = 0; x < CONTOUR_W; x += CONTOUR_STEP) {
            if (Math.abs(field(x, y) - t) < CONTOUR_BAND_EPS) { count++; break; }
          }
        }
        expect(count, `stage=${id} threshold=${t.toFixed(2)}`).toBeGreaterThan(0);
      }
    }
  });

  it('同じstage idは常に同じ地形(決定的)', () => {
    expect(contourHills('stage-3')).toEqual(contourHills('stage-3'));
    // 別idでは(通常)別の地形になる=シードが効いている。
    expect(contourHills('stage-3')).not.toEqual(contourHills('stage-4'));
  });
});
