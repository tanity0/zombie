// UI_OVERHAUL.md §3-1-2b「次の作戦地域」+§3-2 等高線シードの不変条件(監査A-6/A-7/B-4)。
import { describe, expect, it } from 'vitest';
import { STAGES } from '../data/campaign';
import { emptyStoryFlags } from '../data/progress';
import {
  CONTOUR_BAND_EPS, CONTOUR_BAND_MIN_SAMPLES, CONTOUR_H, CONTOUR_HILL_INNER, CONTOUR_STEP,
  CONTOUR_THRESHOLDS, CONTOUR_W,
  contourField, contourHills, directSortieStage, isTargetCandidate, nextOperationStage, OPTIONAL_STAGE_IDS, sortieTarget,
} from './dsHome';

const MAIN_IDS = STAGES.filter(s => s.kind === 'main' && !s.hidden).map(s => s.id);

describe('任意のチュートリアルは目標にならない(社長 2026-11-27「洞窟が目標になることは無い。任意のチュートリアルなので」)', () => {
  it('任意のステージ=stage-tutorial(実在する本編・誰にも解放済み)', () => {
    expect([...OPTIONAL_STAGE_IDS]).toEqual(['stage-tutorial']);
    const t = STAGES.find(s => s.id === 'stage-tutorial');
    expect(t?.kind).toBe('main');
    expect(t?.unlockBy).toBeNull();
    expect(isTargetCandidate(t!)).toBe(false);
    expect(isTargetCandidate(STAGES.find(s => s.id === 'stage-1')!)).toBe(true);
  });

  it('ステージ1はチュートリアルを経ずに解放済み(新しい端末の目標が解放されている)', () => {
    expect(STAGES.find(s => s.id === 'stage-1')?.unlockBy).toBeNull();
  });

  it('クリア状態の全組合せ・薬の有無・前回の記録の有無で、目標(kind next)が stage-tutorial にならない', () => {
    const ids = [...MAIN_IDS, 'stage-ex1'];
    for (const flags of [emptyStoryFlags(), { ...emptyStoryFlags(), medicineUsed: true }]) {
      for (let mask = 0; mask < 1 << ids.length; mask++) {
        const cleared = new Set(ids.filter((_, i) => mask & (1 << i)));
        const next = nextOperationStage(STAGES, cleared, flags);
        expect(next?.id).not.toBe('stage-tutorial');
        for (const last of [null, 'stage-tutorial', 'stage-1']) {
          const t = sortieTarget(STAGES, next, cleared, flags, last);
          if (t?.kind === 'next') expect(t.stage.id).not.toBe('stage-tutorial');
        }
      }
    }
  });

  it('チュートリアルだけクリア=ステージ1、ステージ1までクリア=ステージ2、チュートリアル未クリアでステージ1クリア=ステージ2', () => {
    const f = emptyStoryFlags();
    expect(nextOperationStage(STAGES, new Set(['stage-tutorial']), f)?.id).toBe('stage-1');
    expect(nextOperationStage(STAGES, new Set(['stage-tutorial', 'stage-1']), f)?.id).toBe('stage-2');
    expect(nextOperationStage(STAGES, new Set(['stage-1']), f)?.id).toBe('stage-2');
  });

  it('チュートリアル以外の本編を全部クリア=最終ノード(チュートリアルが未クリアでも目標に戻らない)', () => {
    const cleared = new Set(MAIN_IDS.filter(id => id !== 'stage-tutorial'));
    const next = nextOperationStage(STAGES, cleared, emptyStoryFlags());
    expect(next?.id).toBe('stage-7');
    expect(directSortieStage(next, cleared)).toBeNull();
  });
});

describe('nextOperationStage(§3-1-2b)', () => {
  it('新規プレイヤー(クリアなし)はステージ1=stage-1を指す(任意のチュートリアルは目標にしない)', () => {
    const next = nextOperationStage(STAGES, new Set(), emptyStoryFlags());
    expect(next?.id).toBe('stage-1');
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

describe('directSortieStage(UIUX_PROPOSAL P1 地図から直接出撃)', () => {
  it('新規プレイヤーは地図の目標と同じ stage-1 へ直行', () => {
    const cleared = new Set<string>();
    expect(directSortieStage(nextOperationStage(STAGES, cleared, emptyStoryFlags()), cleared)?.id).toBe('stage-1');
  });

  it('途中の進行では「次の作戦地域」と常に同じ(新しい決め方を作らない)', () => {
    for (let n = 0; n < MAIN_IDS.length; n++) {
      const cleared = new Set(MAIN_IDS.slice(0, n));
      const next = nextOperationStage(STAGES, cleared, emptyStoryFlags());
      expect(directSortieStage(next, cleared)).toBe(next);
    }
  });

  it('EX が次なら EX へ直行', () => {
    const flags = { ...emptyStoryFlags(), medicineUsed: true };
    const cleared = new Set(MAIN_IDS);
    expect(directSortieStage(nextOperationStage(STAGES, cleared, flags), cleared)?.id).toBe('stage-ex1');
  });

  it('全部クリア(次の作戦地域がクリア済み)なら null=一覧へ戻す', () => {
    const cleared = new Set(MAIN_IDS);
    expect(directSortieStage(nextOperationStage(STAGES, cleared, emptyStoryFlags()), cleared)).toBeNull();
    expect(directSortieStage(null, cleared)).toBeNull();
  });
});

describe('sortieTarget(全部クリアした後は最後に出撃した任務)', () => {
  const flags = emptyStoryFlags();
  const at = (cleared: Set<string>, last: string | null, f = flags) =>
    sortieTarget(STAGES, nextOperationStage(STAGES, cleared, f), cleared, f, last);

  it('次の任務がある時は次(記録より NEXT が優先)', () => {
    const cleared = new Set(['stage-tutorial', 'stage-1']);
    expect(at(cleared, 'stage-1')).toEqual({ stage: STAGES.find(s => s.id === 'stage-2'), kind: 'next' });
    expect(at(new Set(), null)?.stage.id).toBe('stage-1');
  });

  it('全部クリア+記録あり=最後に出撃した任務', () => {
    const cleared = new Set(MAIN_IDS);
    const t = at(cleared, 'stage-3');
    expect(t?.kind).toBe('last');
    expect(t?.stage.id).toBe('stage-3');
    expect(at(cleared, 'stage-7')?.stage.id).toBe('stage-7');
  });

  it('全部クリア+記録なし=null(帯は一覧へ)', () => {
    const cleared = new Set(MAIN_IDS);
    expect(at(cleared, null)).toBeNull();
    expect(at(cleared, '')).toBeNull();
  });

  it('記録のステージが存在しない・一覧に出ない・解放されていない時は null', () => {
    const cleared = new Set(MAIN_IDS);
    expect(at(cleared, 'stage-nope')).toBeNull();
    expect(at(cleared, 'stage-ex2')).toBeNull(); // hidden
    // EX は薬を使っていなければ一覧に出ない=null
    expect(at(cleared, 'stage-ex1')).toBeNull();
    // 解放されていない本編(前提が未クリア): 次の任務が無い状態は作れないので、関数へ直接渡して確かめる
    const noneCleared = new Set<string>();
    expect(sortieTarget(STAGES, null, noneCleared, flags, 'stage-3')).toBeNull();
  });

  it('EX は作戦地域の一覧と同じ門(薬を使用済み+解放済み)なら最後の任務になる', () => {
    const f = { ...emptyStoryFlags(), medicineUsed: true };
    const cleared = new Set([...MAIN_IDS, 'stage-ex1']);
    expect(at(cleared, 'stage-ex1', f)).toEqual({ stage: STAGES.find(s => s.id === 'stage-ex1'), kind: 'last' });
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

  it('どのシードでも9本のしきい値すべてが線として見える(各バンド≥40サンプル=検収B-1)', () => {
    for (const id of allStageIds) {
      const field = contourField(contourHills(id));
      for (const t of CONTOUR_THRESHOLDS) {
        let count = 0;
        for (let y = 0; y < CONTOUR_H; y += CONTOUR_STEP) {
          for (let x = 0; x < CONTOUR_W; x += CONTOUR_STEP) {
            if (Math.abs(field(x, y) - t) < CONTOUR_BAND_EPS) count++;
          }
        }
        expect(count, `stage=${id} threshold=${t.toFixed(2)}`).toBeGreaterThanOrEqual(CONTOUR_BAND_MIN_SAMPLES);
      }
    }
  });

  it('同じstage idは常に同じ地形(決定的)', () => {
    expect(contourHills('stage-3')).toEqual(contourHills('stage-3'));
    // 別idでは(通常)別の地形になる=シードが効いている。
    expect(contourHills('stage-3')).not.toEqual(contourHills('stage-4'));
  });
});
