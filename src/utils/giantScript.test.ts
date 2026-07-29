import { describe, it, expect } from 'vitest';
import {
  giantPhaseForHealth, giantPhaseJustChanged, giantMoveEligible, pickGiantMove, pickGiantCombo,
  giantPhaseForHealthStory, pickGiantStoryCombo,
  giantStageRangeMult,
  GIANT_RANGE, type GiantMove, glenTriJumpPoints, GLEN_TRIJUMP_COUNT,
  GIANT_STAGE_UNIQUE_MOVE, GIANT_STAGE_ULT_MOVE, GIANT_STAGE_MOVE_RANGE,
  giantStageMoveEligible, pickGiantMoveWithStage,
  GIANT_QUAD_DASH_COUNT, giantQuadDashComplete, GIANT_QUAD_ICE_COUNT,
  type GiantStageMoveId,
  // M67(PACING_PUZZLE.md §6.26-12): グレン(stage-7)専用の新技4つ。
  glenScriptApplies, glenMoveEligible, pickGiantMoveWithGlen, GLEN_MOVE_RANGE, GLEN_NIHIL_CHANT_COUNT,
  type GlenMoveId,
} from './giantScript';

const ALL_MOVES: GiantMove[] = ['stomp', 'sweep', 'jump', 'dash', 'bolt'];
const allReady = (): Record<GiantMove, boolean> => ({ stomp: true, sweep: true, jump: true, dash: true, bolt: true });

describe('giantPhaseForHealth', () => {
  it('is phase 1 above the 60% threshold', () => {
    expect(giantPhaseForHealth(1)).toBe(1);
    expect(giantPhaseForHealth(0.61)).toBe(1);
  });
  it('is phase 2 at or below the 60% threshold', () => {
    expect(giantPhaseForHealth(0.6)).toBe(2);
    expect(giantPhaseForHealth(0.1)).toBe(2);
    expect(giantPhaseForHealth(0)).toBe(2);
  });
});

describe('giantPhaseJustChanged', () => {
  it('is false on the very first frame (no previous phase yet)', () => {
    expect(giantPhaseJustChanged(undefined, 1)).toBe(false);
    expect(giantPhaseJustChanged(undefined, 2)).toBe(false);
  });
  it('is false while staying in the same phase', () => {
    expect(giantPhaseJustChanged(1, 1)).toBe(false);
    expect(giantPhaseJustChanged(2, 2)).toBe(false);
  });
  it('is true exactly on the transition frame', () => {
    expect(giantPhaseJustChanged(1, 2)).toBe(true);
  });
});

describe('giantMoveEligible — 受け入れ条件①③: 各帯(密着含む)に必ず1つ以上の技がある', () => {
  const bandSamples = [70, 230, 470, 800]; // 密着/近/中/遠の代表距離

  it('every band has at least one eligible move in phase 1', () => {
    for (const d of bandSamples) {
      const anyEligible = ALL_MOVES.some(m => giantMoveEligible(m, d, 1));
      expect(anyEligible).toBe(true);
    }
  });

  it('every band has at least one eligible move in phase 2', () => {
    for (const d of bandSamples) {
      const anyEligible = ALL_MOVES.some(m => giantMoveEligible(m, d, 2));
      expect(anyEligible).toBe(true);
    }
  });

  it('密着帯(0〜140)にはstompが必ずある=ハメ間合いが存在しない', () => {
    expect(giantMoveEligible('stomp', 0, 1)).toBe(true);
    expect(giantMoveEligible('stomp', 140, 1)).toBe(true);
    expect(giantMoveEligible('stomp', 70, 2)).toBe(true);
  });

  it('sweep is phase-2 only', () => {
    expect(giantMoveEligible('sweep', 230, 1)).toBe(false);
    expect(giantMoveEligible('sweep', 230, 2)).toBe(true);
  });
});

describe('giantMoveEligible — 受け入れ条件②: Phase2で追加されるのは種類/頻度だけ(既存技の帯を狭めない)', () => {
  it('phase 2 never removes eligibility phase 1 already granted (monotonic)', () => {
    for (let d = 0; d <= GIANT_RANGE.FAR_MAX; d += 10) {
      for (const m of ALL_MOVES) {
        if (giantMoveEligible(m, d, 1)) {
          expect(giantMoveEligible(m, d, 2)).toBe(true);
        }
      }
    }
  });
});

describe('pickGiantMove', () => {
  it('returns null when nothing is ready or eligible', () => {
    expect(pickGiantMove(70, 1, { stomp: false, sweep: false, jump: false, dash: false, bolt: false })).toBeNull();
    expect(pickGiantMove(5000, 1, allReady())).toBeNull(); // 全帯の外
  });

  it('only returns eligible+ready moves (deterministic rand injection)', () => {
    // 距離230(近帯)・phase1: stomp/sweep/dash/boltは不適格、jumpのみ適格。
    const ready = allReady();
    const pick = pickGiantMove(230, 1, ready, () => 0);
    expect(pick).toBe('jump');
  });

  it('respects the ready gate even when eligible', () => {
    const ready = allReady();
    ready.jump = false;
    // 230は jump のみ適格だったので、readyを落とすと候補が空になる。
    expect(pickGiantMove(230, 1, ready)).toBeNull();
  });

  it('picks uniformly among the candidate pool via the injected rand', () => {
    // 距離800(遠帯): dashのみ適格。
    const pick = pickGiantMove(800, 2, allReady(), () => 0.999);
    expect(pick).toBe('dash');
  });
});

describe('pickGiantCombo — 受け入れ条件(6.26-9 #8): 40%・許可2組のみ', () => {
  it('never combos in phase 1', () => {
    expect(pickGiantCombo('sweep', 1, 70, () => 0)).toBeNull();
    expect(pickGiantCombo('dash', 1, 70, () => 0)).toBeNull();
  });

  it('only sweep->stomp and dash->stomp are allowed follow-ups', () => {
    expect(pickGiantCombo('jump', 2, 70, () => 0)).toBeNull();
    expect(pickGiantCombo('bolt', 2, 70, () => 0)).toBeNull();
    expect(pickGiantCombo('stomp', 2, 70, () => 0)).toBeNull();
  });

  it('requires the target to still be in the follow-up move\'s band', () => {
    // stompの追撃はdistance<=140が必要。800は密着帯の外なのでnull。
    expect(pickGiantCombo('sweep', 2, 800, () => 0)).toBeNull();
    expect(pickGiantCombo('dash', 2, 800, () => 0)).toBeNull();
  });

  it('fires the follow-up under the 40% threshold, and not above it', () => {
    expect(pickGiantCombo('sweep', 2, 70, () => 0.39)).toBe('stomp');
    expect(pickGiantCombo('sweep', 2, 70, () => 0.41)).toBeNull();
    expect(pickGiantCombo('dash', 2, 70, () => 0.39)).toBe('stomp');
  });
});

// ====================================================================================
// M60(PACING_PUZZLE.md §6.28-11): グレン/未確認変異体(storyBoss)専用のPhase3。
// これらのテストが守るのは「storyBoss専用の新規関数が正しいこと」であって、上のPhase1/2の
// テスト(通常城ボスが今も使う関数)は1つも書き換えていない=不変性の担保はそのまま生きている。
// ====================================================================================

describe('giantPhaseForHealthStory — 受け入れ条件: Phase1/2の境界は通常版と完全一致・Phase3はHP30%以下', () => {
  it('is phase 1 above the 60% threshold (通常版giantPhaseForHealthと同じ境界)', () => {
    expect(giantPhaseForHealthStory(1)).toBe(1);
    expect(giantPhaseForHealthStory(0.61)).toBe(1);
  });
  it('is phase 2 between 30%(exclusive) and 60%(inclusive)', () => {
    expect(giantPhaseForHealthStory(0.6)).toBe(2);
    expect(giantPhaseForHealthStory(0.31)).toBe(2);
  });
  it('is phase 3 at or below the 30% threshold', () => {
    expect(giantPhaseForHealthStory(0.3)).toBe(3);
    expect(giantPhaseForHealthStory(0.1)).toBe(3);
    expect(giantPhaseForHealthStory(0)).toBe(3);
  });
  it('never disagrees with giantPhaseForHealth above the phase-3 threshold(=通常城ボスと同じ挙動)', () => {
    for (let f = 0.31; f <= 1; f += 0.01) {
      expect(giantPhaseForHealthStory(f)).toBe(giantPhaseForHealth(f));
    }
  });
});

describe('giantMoveEligible(phase=3) — sweepはPhase2で解禁されたままPhase3でも消えない', () => {
  it('sweep stays eligible in phase 3 with the same band as phase 2', () => {
    expect(giantMoveEligible('sweep', 230, 3)).toBe(true);
    expect(giantMoveEligible('sweep', 70, 3)).toBe(false);  // 密着帯の外
    expect(giantMoveEligible('sweep', 400, 3)).toBe(false); // 近帯の外
  });
  it('phase does not change stomp/jump/dash/bolt eligibility (1と2と3で同じ)', () => {
    const samples = [70, 230, 470, 800];
    for (const d of samples) {
      for (const m of ['stomp', 'jump', 'dash', 'bolt'] as GiantMove[]) {
        expect(giantMoveEligible(m, d, 3)).toBe(giantMoveEligible(m, d, 2));
        expect(giantMoveEligible(m, d, 3)).toBe(giantMoveEligible(m, d, 1));
      }
    }
  });
});

describe('pickGiantStoryCombo — 受け入れ条件(§6.28-11 #2/#3): 薙ぎ払い→踏み鳴らし→突進の3発', () => {
  it('has no follow-up for jump/bolt (第4の連携は作らない)', () => {
    expect(pickGiantStoryCombo('jump', 70, false, () => 0)).toBeNull();
    expect(pickGiantStoryCombo('bolt', 70, false, () => 0)).toBeNull();
  });

  it('keeps the existing 2 pairs alive at phase3 (sweep→stomp / dash→stomp)', () => {
    expect(pickGiantStoryCombo('sweep', 70, false, () => 0)).toBe('stomp');
    expect(pickGiantStoryCombo('dash', 70, false, () => 0)).toBe('stomp');
  });

  it('adds the phase3-only 3rd link: stomp→dash', () => {
    // stomp→dashの帯はdash自体の帯(320<d<=1000)を要求する。
    expect(pickGiantStoryCombo('stomp', 500, false, () => 0)).toBe('dash');
    expect(pickGiantStoryCombo('stomp', 70, false, () => 0)).toBeNull(); // dashの帯の外
  });

  it('requires the target to still be in the follow-up move\'s band', () => {
    expect(pickGiantStoryCombo('sweep', 800, false, () => 0)).toBeNull();
    expect(pickGiantStoryCombo('dash', 800, false, () => 0)).toBeNull();
  });

  it('fires under 60% for グレン(stage-7), not above it', () => {
    expect(pickGiantStoryCombo('sweep', 70, false, () => 0.59)).toBe('stomp');
    expect(pickGiantStoryCombo('sweep', 70, false, () => 0.61)).toBeNull();
  });

  it('fires under 70% for 未確認変異体(stage-ex1・isEx=true), not above it', () => {
    expect(pickGiantStoryCombo('sweep', 70, true, () => 0.69)).toBe('stomp');
    expect(pickGiantStoryCombo('sweep', 70, true, () => 0.71)).toBeNull();
  });

  it('can chain the full 3発(薙ぎ払い→踏み鳴らし→突進)when each roll clears and the target stays in range', () => {
    const first = pickGiantStoryCombo('sweep', 70, false, () => 0);
    expect(first).toBe('stomp');
    const second = pickGiantStoryCombo(first as GiantMove, 500, false, () => 0);
    expect(second).toBe('dash');
  });

  it('does not force a 4th hit(標的が次技の帯の外なら連携は自然に終わる)', () => {
    // dashの直後、標的が密着帯(stompの帯)の外にいれば連携はここで止まる。
    expect(pickGiantStoryCombo('dash', 500, false, () => 0)).toBeNull();
  });

  it('a 4th+ hit can still occur if the target re-enters the next move\'s band(履歴を持たず間合いと確率だけで判断=トールのharai自己ループと同じ作法。既存dash→stompの2組は維持=原則⑥)', () => {
    expect(pickGiantStoryCombo('dash', 70, false, () => 0)).toBe('stomp');
  });
});

describe('giantStageRangeMult(M65・社長指示: ステージ別の踏み鳴らし/着地AoE/突進速度の倍率)', () => {
  it('stage-1 is exactly 1.00 (実機合格済みの基準・回帰ガード=最重要)', () => {
    expect(giantStageRangeMult('stage-1')).toBe(1);
  });

  it('is monotonically non-decreasing in stage order (1→3→4→5→6→7→ex1)', () => {
    const order = ['stage-1', 'stage-3', 'stage-4', 'stage-5', 'stage-6', 'stage-7', 'stage-ex1'];
    const values = order.map(id => giantStageRangeMult(id));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
  });

  it('matches the confirmed table values exactly', () => {
    expect(giantStageRangeMult('stage-1')).toBeCloseTo(1.00);
    expect(giantStageRangeMult('stage-3')).toBeCloseTo(1.10);
    expect(giantStageRangeMult('stage-4')).toBeCloseTo(1.20);
    expect(giantStageRangeMult('stage-5')).toBeCloseTo(1.30);
    expect(giantStageRangeMult('stage-6')).toBeCloseTo(1.40);
    expect(giantStageRangeMult('stage-7')).toBeCloseTo(1.50);
    expect(giantStageRangeMult('stage-ex1')).toBeCloseTo(1.50);
  });

  it('falls back to 1.00 for unknown/未定義 stage IDs (安全側)', () => {
    expect(giantStageRangeMult('nonexistent')).toBe(1);
    expect(giantStageRangeMult('')).toBe(1);
    expect(giantStageRangeMult('stage-2')).toBe(1); // 研究所=城ボスが出ないステージ。表に無い=安全側
    expect(giantStageRangeMult('stage-tutorial')).toBe(1);
  });

  it('enabled=false (相当 `?giantstage=0`) forces every stage back to 1.00', () => {
    expect(giantStageRangeMult('stage-1', false)).toBe(1);
    expect(giantStageRangeMult('stage-3', false)).toBe(1);
    expect(giantStageRangeMult('stage-7', false)).toBe(1);
    expect(giantStageRangeMult('stage-ex1', false)).toBe(1);
    expect(giantStageRangeMult('nonexistent', false)).toBe(1);
  });
});

// ====================================================================================
// M66(PACING_PUZZLE.md §6.26-11): 城ボスのステージ別 独自技(Phase1〜)+大技(Phase2〜)。
// これらのテストが守るのは「新設した統合抽選(pickGiantMoveWithStage)が正しいこと」であって、
// 上のPhase1/2/3のテスト(既存pickGiantMove/giantMoveEligible)は1つも書き換えていない
// =既存5技の不変性の担保はそのまま生きている(受け入れ条件「stage-1の既存挙動が変わらない」)。
// ====================================================================================

const ALL_STAGE_MOVES: GiantStageMoveId[] = ['bite', 'slam', 'glide', 'dive', 'quaddash', 'nova', 'wing', 'sweepbeam'];
const stageAllReady = (): Record<GiantStageMoveId, boolean> => ({
  bite: true, slam: true, glide: true, dive: true, quaddash: true, nova: true, wing: true, sweepbeam: true,
});

describe('GIANT_STAGE_UNIQUE_MOVE / GIANT_STAGE_ULT_MOVE — 対象は城ボスが実際に出る4ステージのみ', () => {
  it('defines exactly one unique move and one ult move for stage-1/3/4/5', () => {
    expect(GIANT_STAGE_UNIQUE_MOVE['stage-1']).toBe('bite');
    expect(GIANT_STAGE_UNIQUE_MOVE['stage-3']).toBe('glide');
    expect(GIANT_STAGE_UNIQUE_MOVE['stage-4']).toBe('quaddash');
    expect(GIANT_STAGE_UNIQUE_MOVE['stage-5']).toBe('wing');
    expect(GIANT_STAGE_ULT_MOVE['stage-1']).toBe('slam');
    expect(GIANT_STAGE_ULT_MOVE['stage-3']).toBe('dive');
    expect(GIANT_STAGE_ULT_MOVE['stage-4']).toBe('nova');
    expect(GIANT_STAGE_ULT_MOVE['stage-5']).toBe('sweepbeam');
  });

  it('does NOT define anything for stage-6/7/ex1(社長指示: この3ステージには足さない)', () => {
    for (const id of ['stage-6', 'stage-7', 'stage-ex1']) {
      expect(GIANT_STAGE_UNIQUE_MOVE[id]).toBeUndefined();
      expect(GIANT_STAGE_ULT_MOVE[id]).toBeUndefined();
    }
  });
});

describe('giantStageMoveEligible — 表どおりの間合い', () => {
  it('bite: 密着〜近(≤180)', () => {
    expect(giantStageMoveEligible('bite', 0)).toBe(true);
    expect(giantStageMoveEligible('bite', 180)).toBe(true);
    expect(giantStageMoveEligible('bite', 181)).toBe(false);
  });
  it('slam: 近〜中(140〜420)', () => {
    expect(giantStageMoveEligible('slam', 139)).toBe(false);
    expect(giantStageMoveEligible('slam', 140)).toBe(true);
    expect(giantStageMoveEligible('slam', 420)).toBe(true);
    expect(giantStageMoveEligible('slam', 421)).toBe(false);
  });
  it('glide: 中〜遠(320〜900)', () => {
    expect(giantStageMoveEligible('glide', 319)).toBe(false);
    expect(giantStageMoveEligible('glide', 320)).toBe(true);
    expect(giantStageMoveEligible('glide', 900)).toBe(true);
    expect(giantStageMoveEligible('glide', 901)).toBe(false);
  });
  it('大技3種+quaddash/wingは全帯(設計書に間合いの明記が無いための叩き台)', () => {
    for (const m of ['dive', 'quaddash', 'nova', 'wing', 'sweepbeam'] as GiantStageMoveId[]) {
      expect(giantStageMoveEligible(m, 0)).toBe(true);
      expect(giantStageMoveEligible(m, 5000)).toBe(true);
    }
  });
});

describe('pickGiantMoveWithStage — 受け入れ条件: ステージごとに正しい技が選ばれる', () => {
  it('stage-6/7/ex1・未知ステージは既存5技のみ(pickGiantMoveと同じ結果になる)', () => {
    for (const stageId of ['stage-6', 'stage-7', 'stage-ex1', 'nonexistent-stage']) {
      const withStage = pickGiantMoveWithStage(stageId, 70, 2, allReady(), stageAllReady(), () => 0);
      const legacy = pickGiantMove(70, 2, allReady(), () => 0);
      expect(withStage).toBe(legacy);
    }
  });

  it('stage-1・密着帯(70px)・Phase1: stomp/biteの2択(等確率選択の境界を確認)', () => {
    const ready = allReady();
    const stageReady = stageAllReady();
    // rand=0 → プールの先頭(stomp)。既存ALL_MOVESの並び順=stomp,sweep,jump,dash,bolt+biteが末尾に追加される。
    expect(pickGiantMoveWithStage('stage-1', 70, 1, ready, stageReady, () => 0)).toBe('stomp');
    expect(pickGiantMoveWithStage('stage-1', 70, 1, ready, stageReady, () => 0.99)).toBe('bite');
  });

  it('Phase1では大技(slam)が選ばれない(受け入れ条件: Phase1では大技が選ばれない)', () => {
    const ready = allReady();
    const stageReady = stageAllReady();
    // 距離230(slamの帯140〜420内)・Phase1: stomp/sweep/dash/boltは不適格(sweepはphase2限定・
    // dash/boltは近帯の外)、jumpとbite(密着外なので不適格=180超)は? d=230はbiteの帯(≤180)外なので
    // jumpのみが既存側の候補、slamはphase<2なので候補に入らない。
    for (let i = 0; i < 50; i++) {
      const pick = pickGiantMoveWithStage('stage-1', 230, 1, ready, stageReady, () => i / 50);
      expect(pick).not.toBe('slam');
    }
  });

  it('Phase2になるとslamが候補に入る(距離230・stage-1)', () => {
    const ready = allReady();
    const stageReady = stageAllReady();
    // rand=0.99 → プール末尾(slamが最後に push される)を引く。
    expect(pickGiantMoveWithStage('stage-1', 230, 2, ready, stageReady, () => 0.999)).toBe('slam');
  });

  it('stage-4・全帯対応のquaddash/novaはPhase/距離を問わず候補に入る(CD明けなら)', () => {
    const ready = allReady();
    const stageReady = stageAllReady();
    expect(pickGiantMoveWithStage('stage-4', 5000, 1, ready, stageReady, () => 0.999)).toBe('quaddash');
    expect(pickGiantMoveWithStage('stage-4', 5000, 2, ready, stageReady, () => 0.999)).toBe('nova');
  });

  it('ready(CD未消化)を落とすと候補から外れる', () => {
    const ready = allReady();
    const stageReady = stageAllReady();
    stageReady.bite = false;
    for (let i = 0; i < 20; i++) {
      expect(pickGiantMoveWithStage('stage-1', 70, 1, ready, stageReady, () => i / 20)).toBe('stomp');
    }
  });

  it('5技側のready/eligibleを落としても、ステージ技はそのまま候補に残る(独立)', () => {
    const ready = allReady();
    ready.stomp = false;
    const stageReady = stageAllReady();
    // d=70は密着帯: 5技側はstompのみ適格だがreadyを落としたので候補ゼロ、biteだけが残る。
    expect(pickGiantMoveWithStage('stage-1', 70, 1, ready, stageReady, () => 0)).toBe('bite');
  });

  it('stageReadyのキーが渡されていない(undefined)場合は「未ready」として除外される(安全側)', () => {
    const ready = allReady();
    // ready.stomp=trueなので密着帯ではstompが候補に残る。biteはstageReadyに何も無いのでfalse扱い。
    expect(pickGiantMoveWithStage('stage-1', 70, 1, ready, {}, () => 0.99)).toBe('stomp');
  });

  it('全ステージ技(8種)が定義どおりの間合い/フェーズで一意に取り出せる(網羅チェック)', () => {
    expect(ALL_STAGE_MOVES.length).toBe(8);
    for (const stageId of ['stage-1', 'stage-3', 'stage-4', 'stage-5']) {
      const unique = GIANT_STAGE_UNIQUE_MOVE[stageId] as GiantStageMoveId;
      const ult = GIANT_STAGE_ULT_MOVE[stageId] as GiantStageMoveId;
      expect(ALL_STAGE_MOVES).toContain(unique);
      expect(ALL_STAGE_MOVES).toContain(ult);
      expect(unique).not.toBe(ult);
    }
  });
});

describe('GIANT_QUAD_DASH_COUNT / giantQuadDashComplete — 学習装置③: 回数は常に3固定(乱数にしない)', () => {
  it('is exactly 3 (社長裁定の核心=固定値)', () => {
    expect(GIANT_QUAD_DASH_COUNT).toBe(3);
    expect(GIANT_QUAD_ICE_COUNT).toBe(3);
  });
  it('is not complete after 1st or 2nd dash (index 0, 1)', () => {
    expect(giantQuadDashComplete(0)).toBe(false);
    expect(giantQuadDashComplete(1)).toBe(false);
  });
  it('is complete exactly after the 3rd dash (index 2)', () => {
    expect(giantQuadDashComplete(2)).toBe(true);
  });
  it('stays complete for any index beyond 2 (defensive)', () => {
    expect(giantQuadDashComplete(3)).toBe(true);
    expect(giantQuadDashComplete(10)).toBe(true);
  });
});

describe('GIANT_STAGE_MOVE_RANGE — 表の実値を固定するリグレッションガード', () => {
  it('matches the confirmed design-doc numbers exactly', () => {
    expect(GIANT_STAGE_MOVE_RANGE.bite).toEqual({ min: 0, max: 180 });
    expect(GIANT_STAGE_MOVE_RANGE.slam).toEqual({ min: 140, max: 420 });
    expect(GIANT_STAGE_MOVE_RANGE.glide).toEqual({ min: 320, max: 900 });
  });
});

// ============================================================================================
// M67(PACING_PUZZLE.md §6.26-12・社長指示「ステージ7は別格として技のバリエーションを組んで」):
// グレン(stage-7)専用の新技4つ(血の爪痕/血の弧/伸びる触手/虚無の三唱)。
// ============================================================================================

const noGiantReady: Record<GiantMove, boolean> = { stomp: false, sweep: false, jump: false, dash: false, bolt: false };
const allGlenReady: Record<GlenMoveId, boolean> = { talon: true, boon: true, reach: true, nihil: true, trijump: true };
const noGlenReady: Record<GlenMoveId, boolean> = { talon: false, boon: false, reach: false, nihil: false, trijump: false };

describe('glenScriptApplies — 受け入れ条件: stage-7のグレンだけが新技を選ぶ(通常城ボス/ex1では絶対に選ばれない)', () => {
  it('true only for isStoryBoss=true & storyBossVariant="stage-7" & enabled', () => {
    expect(glenScriptApplies(true, 'stage-7', true)).toBe(true);
  });
  it('false for stage-ex1(未確認変異体) — EXはM60のPhase3のみのまま', () => {
    expect(glenScriptApplies(true, 'stage-ex1', true)).toBe(false);
  });
  it('false for normal city bosses (isStoryBoss undefined/false)', () => {
    expect(glenScriptApplies(undefined, undefined, true)).toBe(false);
    expect(glenScriptApplies(false, undefined, true)).toBe(false);
  });
  it('false when disabled (?glenscript=0 のフォールバック経路)', () => {
    expect(glenScriptApplies(true, 'stage-7', false)).toBe(false);
  });
});

describe('glenMoveEligible / GLEN_MOVE_RANGE — 表(§6.26-12)どおりの間合い(境界含む)', () => {
  it('talon: 140〜420', () => {
    expect(glenMoveEligible('talon', 139)).toBe(false);
    expect(glenMoveEligible('talon', 140)).toBe(true);
    expect(glenMoveEligible('talon', 420)).toBe(true);
    expect(glenMoveEligible('talon', 421)).toBe(false);
  });
  it('boon: 320〜900', () => {
    expect(glenMoveEligible('boon', 319)).toBe(false);
    expect(glenMoveEligible('boon', 320)).toBe(true);
    expect(glenMoveEligible('boon', 900)).toBe(true);
    expect(glenMoveEligible('boon', 901)).toBe(false);
  });
  it('reach: 420〜1000', () => {
    expect(glenMoveEligible('reach', 419)).toBe(false);
    expect(glenMoveEligible('reach', 420)).toBe(true);
    expect(glenMoveEligible('reach', 1000)).toBe(true);
    expect(glenMoveEligible('reach', 1001)).toBe(false);
  });
  it('nihil: 全帯(距離を問わない)', () => {
    expect(glenMoveEligible('nihil', 0)).toBe(true);
    expect(glenMoveEligible('nihil', 5000)).toBe(true);
  });
  it('GLEN_MOVE_RANGE matches the confirmed design-doc numbers exactly (リグレッションガード)', () => {
    expect(GLEN_MOVE_RANGE.talon).toEqual({ min: 140, max: 420 });
    expect(GLEN_MOVE_RANGE.boon).toEqual({ min: 320, max: 900 });
    expect(GLEN_MOVE_RANGE.reach).toEqual({ min: 420, max: 1000 });
    expect(GLEN_MOVE_RANGE.nihil).toEqual({ min: 0, max: Infinity });
  });
});

describe('pickGiantMoveWithGlen — 受け入れ条件: Phase1で大技(nihil)が出ない', () => {
  // 距離2000は既存5技(最大帯=dashの1000)にもtalon/boon/reach(最大帯=reachの1000)にも一切
  // 該当しない=nihil(全帯)だけが候補になりうる距離。Phase1で常にnullなら「大技だけが閉じている」
  // ことを直接証明できる。
  // v0.25.2430: 連続ジャンプ(trijump・全帯に近い間合い)が増えたので、この距離では trijump も候補に
  // なりうる。**このテストの意図は「Phase1で nihil だけが閉じている」ことの証明**なので、
  // trijump は未CD扱いにして nihil の門だけを見る(意図を変えずに新技ぶんだけ除外する)。
  const onlyNihilReady: Record<GlenMoveId, boolean> = { ...allGlenReady, trijump: false };
  it('phase1: nihil is never offered even when everything else is unavailable', () => {
    for (let i = 0; i < 20; i++) {
      expect(pickGiantMoveWithGlen(2000, 1, noGiantReady, onlyNihilReady, () => i / 20)).toBeNull();
    }
  });
  it('phase2 (HP60%): nihil becomes available at the same distance/readiness', () => {
    expect(pickGiantMoveWithGlen(2000, 2, noGiantReady, allGlenReady, () => 0)).toBe('nihil');
  });
  it('phase3 (HP30%): nihil remains available (原則⑥=Phase2で解禁された技はPhase3でも消えない)', () => {
    expect(pickGiantMoveWithGlen(2000, 3, noGiantReady, allGlenReady, () => 0)).toBe('nihil');
  });
});

describe('pickGiantMoveWithGlen — 受け入れ条件: 既存5技の選択が壊れていない', () => {
  const bandSamples = [70, 230, 470, 800]; // 密着/近/中/遠の代表距離(既存ファイルのbandSamplesと同じ)
  // 無限ジャンプ(社長指示v0.25.2420)をOFFにすれば、既存5技の選択は完全に元どおり。
  // 「グレンの追加分が既存の抽選を汚していない」という元の不変条件はこの形で維持する。
  it('matches pickGiantMove exactly when no Glen move is ready (無限ジャンプOFF時=既存5技は無改変)', () => {
    const ready: Record<GiantMove, boolean> = { stomp: true, sweep: true, jump: true, dash: true, bolt: true };
    for (const distance of bandSamples) {
      for (let i = 0; i < 10; i++) {
        const rand = () => i / 10;
        expect(pickGiantMoveWithGlen(distance, 2, ready, noGlenReady, rand, false))
          .toBe(pickGiantMove(distance, 2, ready, rand));
      }
    }
  });

  // ★社長指示v0.25.2420「ステージ7は無限ジャンプで実質逃げれないようにする」。
  // ステージ7は雑魚が出ないので、走って逃げれば完全に安全な時間が作れてしまい、
  // 回復して戻る消耗戦が成立する。飛び掛かりの上限を外して逃げ切れないようにする。
  it('グレンは飛び掛かりの上限が無い(JUMP_MAXの外でもjumpが候補に入る)', () => {
    const far = GIANT_RANGE.JUMP_MAX + 600; // 従来なら圏外
    const onlyJump: Record<GiantMove, boolean> = { stomp: false, sweep: false, jump: true, dash: false, bolt: false };
    expect(pickGiantMoveWithGlen(far, 2, onlyJump, noGlenReady, () => 0)).toBe('jump');
    // OFF(既定外)なら従来どおり圏外=選ばれない。
    expect(pickGiantMoveWithGlen(far, 2, onlyJump, noGlenReady, () => 0, false)).toBeNull();
  });

  // 初撃だけ届いて追撃だけ届かない、という不一致を作らないため、pickGiantStoryCombo にも同じ
  // unlimitedJump を通してある(既定true)。**現在の追撃表に jump は無い**ので実挙動には出ないが、
  // 将来 jump を追撃に足した時に片方だけ上限が残る事故(同じ判定を2箇所に書く型)を防ぐ配線。
  it('追撃の間合い判定は従来どおり(jumpは追撃表に無いので現状は無影響)', () => {
    const far = GIANT_RANGE.JUMP_MAX + 600; // dash(上限FAR_MAX=1000)の圏外
    expect(pickGiantStoryCombo('stomp', far, false, () => 0)).toBeNull();
  });
  // v0.25.2430: 距離350では連続ジャンプ(min=200)も間合いに入る=候補に加わるのが正しい。
  it('only offers talon/boon/trijump at distance 350 when the existing 5 techs are all unready', () => {
    for (let i = 0; i < 20; i++) {
      const move = pickGiantMoveWithGlen(350, 1, noGiantReady, allGlenReady, () => i / 20);
      expect(['talon', 'boon', 'trijump']).toContain(move);
    }
  });
  it('returns null when nothing is ready/eligible at all', () => {
    expect(pickGiantMoveWithGlen(70, 1, noGiantReady, noGlenReady, () => 0)).toBeNull();
  });
});

describe('GLEN_NIHIL_CHANT_COUNT — 学習点④「数える」: 詠唱回数は常に3固定(乱数にしない)', () => {
  it('is exactly 3', () => {
    expect(GLEN_NIHIL_CHANT_COUNT).toBe(3);
  });
});

// 連続ジャンプ(社長指示v0.25.2430)。3固定と「同じ状況なら同じ形」を不変条件として固定する。
describe('glenTriJumpPoints — 連続ジャンプの着地点', () => {
  it('回数は3固定(乱数にしない=学習装置③「回数で読ませる」)', () => {
    expect(GLEN_TRIJUMP_COUNT).toBe(3);
    expect(glenTriJumpPoints(0, 0, 300, 0, 110)).toHaveLength(3);
  });

  it('1発目は必ずプレイヤーの現在地(嘘をつかない)', () => {
    const pts = glenTriJumpPoints(0, 0, 300, 40, 110);
    expect(pts[0].x).toBeCloseTo(300, 5);
    expect(pts[0].y).toBeCloseTo(40, 5);
  });

  // ★ここが肝。乱数を使っていたら「同じ状況で同じ形」が壊れ、予告の意味が薄れる。
  it('同じ状況なら必ず同じ形(乱数を使っていない)', () => {
    const a = glenTriJumpPoints(0, 0, 300, 40, 110);
    const b = glenTriJumpPoints(0, 0, 300, 40, 110);
    expect(a).toEqual(b);
  });

  it('2・3発目はプレイヤー地点から半径ぶん離れる(円が丸ごと重ならない=逃げ場がある)', () => {
    const r = 110;
    const pts = glenTriJumpPoints(0, 0, 300, 0, r);
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y);
      expect(d).toBeGreaterThan(r); // 中心が半径より離れている=完全な重なりにならない
    }
  });

  it('間合い: 密着では出さない(近接技の領分)', () => {
    expect(glenMoveEligible('trijump', 100)).toBe(false);
    expect(glenMoveEligible('trijump', 600)).toBe(true);
  });
});
