import { describe, it, expect } from 'vitest';
import {
  FORMATION_TABLE, HARVEST_PATTERN, patternsForRank, nuisanceTarget, selectPattern, allPatternsSeen,
  SPECIAL_SLOTS, eligibleSpecialSlots, nextSpecialDeficit, nextNuisanceDeficit,
  NUISANCE_CD_MS, SPECIAL_CD_MS, POST_HIT_GUARD_MS, pickChaffType, CHAFF_WEIGHTS_DEFAULT,
  decideNextSpawn,
  peakRedTier,
  nextKomaKind, KOMA_ORDER, KOMA_BASE_MS, KOMA_EXTENSION_MAX_MS,
  chaffWeightsForKoma, chaffTargetForKoma, rampIntervalForKoma, cdForKoma, stepChaffRamp,
  isScriptCleared, selectRotationPattern, LOWER_MIX_CHANCE, LOWER_MIX_CHANCE_HIT,
  ZERO_NUISANCE, type NuisanceCounts,
} from './scriptPuzzle';
import { cdBasisForRank, R7_CAP_MIN, R7_CAP_MAX } from './rankAssessor';

describe('FORMATION_TABLE (社長決定・確定表)', () => {
  it('has the right pattern counts per rank (R1-R5=4, R6=2, R7=3)', () => {
    for (const r of [1, 2, 3, 4, 5] as const) expect(patternsForRank(r)).toHaveLength(4);
    expect(patternsForRank(6)).toHaveLength(2);
    expect(patternsForRank(7)).toHaveLength(3);
  });

  it('every pattern total (config for the whole board slot) stays within the documented max caps (犬3/弾3/ゴースト2 implied by pumpkin/plant peaks)', () => {
    const maxWerewolf = Math.max(...FORMATION_TABLE.map(p => p.nuisance.werewolf ?? 0));
    const maxPlant = Math.max(...FORMATION_TABLE.map(p => p.nuisance.plant ?? 0));
    const maxPumpkin = Math.max(...FORMATION_TABLE.map(p => p.nuisance.pumpkin ?? 0));
    expect(maxWerewolf).toBe(3);
    expect(maxPlant).toBe(3);
    expect(maxPumpkin).toBe(2);
  });

  it('R1-A is the empty (basic-set-only) pattern, used by HARVEST', () => {
    expect(nuisanceTarget(FORMATION_TABLE[0])).toEqual(ZERO_NUISANCE);
    expect(HARVEST_PATTERN).toBe(FORMATION_TABLE[0]);
  });

  it('all pattern ids are unique', () => {
    const ids = FORMATION_TABLE.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('selectPattern', () => {
  it('never repeats the immediately-previous pattern (when the rank has more than one option)', () => {
    for (let i = 0; i < 50; i++) {
      const picked = selectPattern(2, new Set(), 'R2-A', i / 50);
      expect(picked.id).not.toBe('R2-A');
    }
  });

  it('prefers unseen patterns over seen ones', () => {
    const seen = new Set(['R2-A', 'R2-B', 'R2-C']); // only R2-D unseen
    const picked = selectPattern(2, seen, null, 0.5);
    expect(picked.id).toBe('R2-D');
  });

  it('once all patterns for a rank are seen, allPatternsSeen reports true (caller resets the seen-set on this signal)', () => {
    const all = new Set(patternsForRank(3).map(p => p.id));
    expect(allPatternsSeen(3, all)).toBe(true);
    expect(allPatternsSeen(3, new Set())).toBe(false);
  });

  it('falls back to the single available pattern when everything else is excluded', () => {
    // R6 only has 2 patterns; excluding the last one and marking the other seen should still return something.
    const picked = selectPattern(6, new Set(['R6-A', 'R6-B']), 'R6-A', 0.9);
    expect(picked.id).toBe('R6-B');
  });
});

describe('special slots (distance-gated)', () => {
  it('screamer unlocks at area>=3, ghost at area>=4', () => {
    expect(eligibleSpecialSlots(2)).toHaveLength(0);
    expect(eligibleSpecialSlots(3).map(s => s.type)).toEqual(['screamer']);
    expect(eligibleSpecialSlots(4).map(s => s.type)).toEqual(['screamer', 'ghost']);
  });

  it('nextSpecialDeficit returns the first eligible type under its target count', () => {
    expect(nextSpecialDeficit(4, {})).toBe('screamer');
    expect(nextSpecialDeficit(4, { screamer: 1 })).toBe('ghost');
    expect(nextSpecialDeficit(4, { screamer: 1, ghost: 2 })).toBeNull();
  });

  it('caps match the table: screamer=1, ghost=2', () => {
    expect(SPECIAL_SLOTS.find(s => s.type === 'screamer')?.count).toBe(1);
    expect(SPECIAL_SLOTS.find(s => s.type === 'ghost')?.count).toBe(2);
  });
});

// ★v0.25.3177(社長裁定): 欠員の基準は「その台本で**まだ出していない数**」。生存数ではない。
describe('nextNuisanceDeficit(基準=その台本で出した数)', () => {
  it('ノルマを出し切っていれば null', () => {
    const target: NuisanceCounts = { plant: 1, werewolf: 0, pumpkin: 2 };
    expect(nextNuisanceDeficit(target, { plant: 1, werewolf: 0, pumpkin: 2 })).toBeNull();
  });
  it('まだ出していない型を返す', () => {
    const target: NuisanceCounts = { plant: 0, werewolf: 0, pumpkin: 2 };
    expect(nextNuisanceDeficit(target, ZERO_NUISANCE)).toBe('pumpkin');
  });

  // ここが今回の本丸(社長報告「R7まで遊んでパンプキンが一度も出なかった」の再発防止)。
  it('★倒されても行列は先頭へ戻らない=最後尾のパンプキンに必ず順番が回る', () => {
    const target: NuisanceCounts = { plant: 0, werewolf: 3, pumpkin: 2 }; // R7-A相当
    // 犬を3体出した時点で、たとえ全員倒されて生存0でも次はパンプキン。
    expect(nextNuisanceDeficit(target, { plant: 0, werewolf: 3, pumpkin: 0 })).toBe('pumpkin');
    // 旧実装(生存数基準)ならここは 'werewolf' を返し続けていた。
  });

  it('ノルマを出し切ったら、倒されても同じ型を補充しない(片付き判定と同じ基準)', () => {
    const target: NuisanceCounts = { plant: 0, werewolf: 3, pumpkin: 2 };
    expect(nextNuisanceDeficit(target, { plant: 0, werewolf: 3, pumpkin: 2 })).toBeNull();
  });

  it('先頭優先の順(plant→werewolf→pumpkin)自体は不変', () => {
    const target: NuisanceCounts = { plant: 1, werewolf: 1, pumpkin: 1 };
    expect(nextNuisanceDeficit(target, ZERO_NUISANCE)).toBe('plant');
    expect(nextNuisanceDeficit(target, { plant: 1, werewolf: 0, pumpkin: 0 })).toBe('werewolf');
    expect(nextNuisanceDeficit(target, { plant: 1, werewolf: 1, pumpkin: 0 })).toBe('pumpkin');
  });
});

describe('pickChaffType', () => {
  it('honors the 5:3:1 default weighting boundaries', () => {
    // total=9: [0,5)=bat, [5,8)=skeleton, [8,9)=zombie
    expect(pickChaffType(CHAFF_WEIGHTS_DEFAULT, 0)).toBe('bat');
    expect(pickChaffType(CHAFF_WEIGHTS_DEFAULT, 4.9 / 9)).toBe('bat');
    expect(pickChaffType(CHAFF_WEIGHTS_DEFAULT, 5.1 / 9)).toBe('skeleton');
    expect(pickChaffType(CHAFF_WEIGHTS_DEFAULT, 8.5 / 9)).toBe('zombie');
  });
});

describe('decideNextSpawn', () => {
  const base = {
    boardCount: 0, boardTarget: 10, cdElapsedMs: 99999, cdMs: 500,
    nuisanceElapsedMs: 99999, nuisanceTargetCounts: ZERO_NUISANCE, nuisanceSpawnedCounts: ZERO_NUISANCE,
    specialElapsedMs: 99999, area: 0, aliveSpecial: {},
    msSinceLastHit: 99999, chaffWeights: CHAFF_WEIGHTS_DEFAULT, tieBreakRandom: 0.5,
  };

  it('returns null when the board is already at/above target', () => {
    expect(decideNextSpawn({ ...base, boardCount: 10 })).toBeNull();
  });

  it('returns null while the base CD has not elapsed', () => {
    expect(decideNextSpawn({ ...base, cdElapsedMs: 100, cdMs: 500 })).toBeNull();
  });

  it('falls back to a chaff pick when no nuisance/special deficit exists', () => {
    const r = decideNextSpawn(base);
    expect(r?.slot).toBe('chaff');
  });

  it('prioritizes a nuisance deficit over chaff when its own CD has elapsed', () => {
    const r = decideNextSpawn({ ...base, nuisanceTargetCounts: { plant: 0, werewolf: 0, pumpkin: 1 } });
    expect(r).toEqual({ type: 'pumpkin', slot: 'nuisance' });
  });

  it('does not fill a nuisance deficit before its own 3s CD has elapsed (falls back to chaff instead)', () => {
    const r = decideNextSpawn({ ...base, nuisanceTargetCounts: { plant: 0, werewolf: 0, pumpkin: 1 }, nuisanceElapsedMs: 100 });
    expect(r?.slot).toBe('chaff');
  });

  it('prioritizes a special deficit over chaff (but not over nuisance) when eligible and its CD has elapsed', () => {
    const r = decideNextSpawn({ ...base, area: 4, aliveSpecial: {} });
    expect(r).toEqual({ type: 'screamer', slot: 'special' });
  });

  it('§0.5: the post-hit guard (1.5s) blocks nuisance/special even if their own CDs are ready, but chaff still flows', () => {
    const nuisanceBlocked = decideNextSpawn({
      ...base, nuisanceTargetCounts: { plant: 0, werewolf: 0, pumpkin: 1 }, msSinceLastHit: 500,
    });
    expect(nuisanceBlocked?.slot).toBe('chaff');
    const specialBlocked = decideNextSpawn({ ...base, area: 4, msSinceLastHit: 500 });
    expect(specialBlocked?.slot).toBe('chaff');
  });

  it('the nuisance CD (3s) matches NUISANCE_CD_MS; special CD extended to 30s (v0.25.1586)', () => {
    expect(NUISANCE_CD_MS).toBe(3000);
    expect(SPECIAL_CD_MS).toBe(30000);
    expect(POST_HIT_GUARD_MS).toBe(1500);
  });
});

// v0.25.3177: 旧 noNewSupplyNuisanceTarget は削除。緩コマは**ノルマ0**を渡すだけで新規投入が止まる。
describe('緩コマ(relax/harvest)の邪魔者補充停止', () => {
  it('ノルマ0なら、何体出していようが新規投入は起きない', () => {
    expect(nextNuisanceDeficit(ZERO_NUISANCE, ZERO_NUISANCE)).toBeNull();
    expect(nextNuisanceDeficit(ZERO_NUISANCE, { plant: 1, werewolf: 0, pumpkin: 2 })).toBeNull();
  });
});

describe('M6 §4-C: 4コマサイクル', () => {
  it('KOMA_ORDER is relax→harvest→normal→peak, run starts at relax, and nextKomaKind cycles it', () => {
    expect(KOMA_ORDER).toEqual(['relax', 'harvest', 'normal', 'peak']);
    expect(nextKomaKind('relax')).toBe('harvest');
    expect(nextKomaKind('harvest')).toBe('normal');
    expect(nextKomaKind('normal')).toBe('peak');
    expect(nextKomaKind('peak')).toBe('relax');
  });

  it('koma timing constants: base 40s, extension cap +30s', () => {
    expect(KOMA_BASE_MS).toBe(40000);
    expect(KOMA_EXTENSION_MAX_MS).toBe(30000);
  });

  it('chaff weights per koma: relax 6:4:0 / harvest 7:3:0 / normal・peak default 5:3:1', () => {
    expect(chaffWeightsForKoma('relax')).toEqual({ bat: 6, skeleton: 4, zombie: 0 });
    expect(chaffWeightsForKoma('harvest')).toEqual({ bat: 7, skeleton: 3, zombie: 0 });
    expect(chaffWeightsForKoma('normal')).toEqual(CHAFF_WEIGHTS_DEFAULT);
    expect(chaffWeightsForKoma('peak')).toEqual(CHAFF_WEIGHTS_DEFAULT);
  });

  it('chaff targets per koma: relax 10% / normal 50% / harvest・peak 100% of the cap', () => {
    // v0.25.3529(社長指示「リラックスは敵ほぼ沸かない」): 緩=0.4→0.1。
    expect(chaffTargetForKoma('relax', 10)).toBe(1);
    expect(chaffTargetForKoma('normal', 10)).toBe(5);
    expect(chaffTargetForKoma('harvest', 10)).toBe(10);
    expect(chaffTargetForKoma('peak', 20)).toBe(20);
  });

  it('relax stays the emptiest koma at every cap (休憩が休憩でなくなる並びを作らない)', () => {
    for (const cap of [5, 8, 10, 12, 16, 20, 24]) {
      const relax = chaffTargetForKoma('relax', cap);
      expect(relax).toBeLessThan(chaffTargetForKoma('normal', cap));
      expect(relax).toBeLessThan(chaffTargetForKoma('harvest', cap));
      expect(relax).toBeLessThan(chaffTargetForKoma('peak', cap));
    }
  });

  it('ramp intervals: harvest 2s / others 6s (4s while tightened)', () => {
    expect(rampIntervalForKoma('harvest', false)).toBe(2000);
    expect(rampIntervalForKoma('normal', false)).toBe(6000);
    expect(rampIntervalForKoma('normal', true)).toBe(4000);
    expect(rampIntervalForKoma('relax', false)).toBe(6000);
  });
});

describe('M6 cdForKoma', () => {
  it('relax=×2 / harvest=×0.5 of the rank basis', () => {
    expect(cdForKoma('relax', 3, R7_CAP_MIN, false, false)).toBe(cdBasisForRank(3, R7_CAP_MIN) * 2);
    expect(cdForKoma('harvest', 3, R7_CAP_MIN, false, false)).toBe(cdBasisForRank(3, R7_CAP_MIN) * 0.5);
  });
  it('normal = rank basis, tightened = one step up', () => {
    expect(cdForKoma('normal', 3, R7_CAP_MIN, false, false)).toBe(cdBasisForRank(3, R7_CAP_MIN));
    expect(cdForKoma('normal', 3, R7_CAP_MIN, true, false)).toBe(cdBasisForRank(4, R7_CAP_MIN));
  });
  it('§3-D: tighten at R7 goes to CD0 (最恐形)', () => {
    expect(cdForKoma('normal', 7, R7_CAP_MIN, true, false)).toBe(0);
  });
  it('peak = one step tighter as its base; R7 peak = basis(7)×0.5; tighten stacks one more (clamped at the table end)', () => {
    expect(cdForKoma('peak', 3, R7_CAP_MIN, false, false)).toBe(cdBasisForRank(4, R7_CAP_MIN));
    expect(cdForKoma('peak', 3, R7_CAP_MIN, true, false)).toBe(cdBasisForRank(5, R7_CAP_MIN));
    expect(cdForKoma('peak', 7, R7_CAP_MIN, false, false)).toBe(cdBasisForRank(7, R7_CAP_MIN) * 0.5);
    expect(cdForKoma('peak', 7, R7_CAP_MIN, true, false)).toBe(0);
    // R6 peak base = basis(7); tighten clamps at the table end (no further reduction, no invented value).
    expect(cdForKoma('peak', 6, R7_CAP_MIN, true, false)).toBe(cdBasisForRank(7, R7_CAP_MIN));
  });
  it('R7 cap grown to 20 makes the basis 0 (peak inherits it)', () => {
    expect(cdForKoma('normal', 7, R7_CAP_MAX, false, false)).toBe(0);
    expect(cdForKoma('peak', 7, R7_CAP_MAX, false, false)).toBe(0);
  });
  it('§3-D改訂: soften multiplies ×1.5 in every koma and wins over tighten', () => {
    expect(cdForKoma('harvest', 3, R7_CAP_MIN, false, true)).toBe(cdBasisForRank(3, R7_CAP_MIN) * 0.5 * 1.5);
    // soften+tighten同時: 緩め優先=締めは無効(基準×1.5)。
    expect(cdForKoma('normal', 3, R7_CAP_MIN, true, true)).toBe(cdBasisForRank(3, R7_CAP_MIN) * 1.5);
  });
});

describe('M6 stepChaffRamp', () => {
  it('ramps up by 1 per interval toward the koma target', () => {
    let s = { target: 1, msSinceRampMs: 0 };
    s = stepChaffRamp(s, { dtMs: 6000, komaTarget: 5, rampIntervalMs: 6000, holdIncrease: false });
    expect(s.target).toBe(2);
  });
  it('snaps down immediately when above the koma target (下げは即)', () => {
    const s = stepChaffRamp({ target: 10, msSinceRampMs: 0 }, { dtMs: 16, komaTarget: 4, rampIntervalMs: 6000, holdIncrease: false });
    expect(s.target).toBe(4);
  });
  it('holds (no increase) right after a hit (§3-A被弾ホールド)', () => {
    const s = stepChaffRamp({ target: 2, msSinceRampMs: 5900 }, { dtMs: 200, komaTarget: 5, rampIntervalMs: 6000, holdIncrease: true });
    expect(s.target).toBe(2);
    expect(s.msSinceRampMs).toBe(0); // 足踏み=間隔もリセット
  });
  it('never exceeds the koma target', () => {
    let s = { target: 4, msSinceRampMs: 0 };
    for (let i = 0; i < 10; i++) s = stepChaffRamp(s, { dtMs: 6000, komaTarget: 5, rampIntervalMs: 6000, holdIncrease: false });
    expect(s.target).toBe(5);
  });
  it('snapUp(ピーク・社長裁定v0.25.3705①): 上げも即スナップ・被弾ホールドより優先', () => {
    const s = stepChaffRamp({ target: 5, msSinceRampMs: 0 }, { dtMs: 16, komaTarget: 10, rampIntervalMs: 6000, holdIncrease: true, snapUp: true });
    expect(s.target).toBe(10);
    // 下げは従来どおり即(snapUpと無関係に成立)
    const down = stepChaffRamp({ target: 10, msSinceRampMs: 0 }, { dtMs: 16, komaTarget: 4, rampIntervalMs: 6000, holdIncrease: false, snapUp: true });
    expect(down.target).toBe(4);
  });
});

describe('M6 §4-D: isScriptCleared(片付き判定)', () => {
  const target: NuisanceCounts = { plant: 0, werewolf: 0, pumpkin: 2 };
  it('cleared only when all were spawned AND none remain alive', () => {
    expect(isScriptCleared(target, { plant: 0, werewolf: 0, pumpkin: 2 }, ZERO_NUISANCE)).toBe(true);
  });
  it('not cleared while some are still alive', () => {
    expect(isScriptCleared(target, { plant: 0, werewolf: 0, pumpkin: 2 }, { plant: 0, werewolf: 0, pumpkin: 1 })).toBe(false);
  });
  it('not cleared before the full count has spawned (最初の1体だけ倒しても未片付き)', () => {
    expect(isScriptCleared(target, { plant: 0, werewolf: 0, pumpkin: 1 }, ZERO_NUISANCE)).toBe(false);
  });
  it('a nuisance-less script (R1-A 基本のみ) counts as cleared immediately', () => {
    expect(isScriptCleared(ZERO_NUISANCE, ZERO_NUISANCE, ZERO_NUISANCE)).toBe(true);
  });
  it('special/chaff leftovers do not block clearing (判定は邪魔者のみ)', () => {
    // aliveNuisanceにしか邪魔者は入らない前提のAPI=特別枠・チャフは判定に混ざらないことを型で担保。
    expect(isScriptCleared(target, { plant: 0, werewolf: 0, pumpkin: 2 }, { plant: 0, werewolf: 0, pumpkin: 0 })).toBe(true);
  });
});

describe('M6 §4-D: selectRotationPattern(下位混入つきの次台本選択)', () => {
  it('mixes one rank lower 25% of the time (50% right after a hit) via the pool roll', () => {
    // poolRoll=0.2 (<0.25) → 1ランク下のプールから引く。
    const lower = selectRotationPattern(3, new Set(), null, false, 0.2, 0);
    expect(lower.rank).toBe(2);
    // poolRoll=0.3 (>=0.25) → 現ランク。
    const same = selectRotationPattern(3, new Set(), null, false, 0.3, 0);
    expect(same.rank).toBe(3);
    // 直近被弾あり: しきい値0.5に拡大 → poolRoll=0.4でも下位。
    const lowerHit = selectRotationPattern(3, new Set(), null, true, 0.4, 0);
    expect(lowerHit.rank).toBe(2);
    expect(LOWER_MIX_CHANCE).toBe(0.25);
    expect(LOWER_MIX_CHANCE_HIT).toBe(0.5);
  });
  it('R1 has no lower rank — always draws from R1', () => {
    const p = selectRotationPattern(1, new Set(), null, true, 0, 0.5);
    expect(p.rank).toBe(1);
  });
  it('never repeats the immediately-previous pattern (引き単位の直前禁止)', () => {
    for (let i = 0; i < 20; i++) {
      const p = selectRotationPattern(2, new Set(), 'R2-A', false, 0.9, i / 20);
      expect(p.id).not.toBe('R2-A');
    }
  });
});

describe('peakRedTier(ピークの赤い個体1体・社長裁定v0.25.3546)', () => {
  it('ピークのコマの最初のチャフだけが赤になる', () => {
    expect(peakRedTier('peak', 'chaff', false)).toBe('red');
  });

  it('★【不変条件】1コマに1体だけ(2体目以降は赤にしない)', () => {
    expect(peakRedTier('peak', 'chaff', true)).toBeUndefined();
  });

  it('★【不変条件】ピーク以外のコマでは赤を出さない', () => {
    // 緩(ほぼ湧かない)・収穫(稼ぐ)・通常に赤が混ざると、コマの役割分担が壊れる。
    for (const kind of ['relax', 'harvest', 'normal'] as const) {
      expect(peakRedTier(kind, 'chaff', false)).toBeUndefined();
    }
  });

  it('★【不変条件】邪魔者・特別枠は赤にしない(台本のノルマを強化しない)', () => {
    // 邪魔者(plant/werewolf/pumpkin)と特別枠(叫喚/ゴースト)は台本のノルマ側。
    // ここを赤くすると「1体だけ強い」ではなく台本そのものが強化されてしまう。
    expect(peakRedTier('peak', 'nuisance', false)).toBeUndefined();
    expect(peakRedTier('peak', 'special', false)).toBeUndefined();
  });
});
