import { describe, expect, it } from 'vitest';
import {
  fixedGhostFeedbackTarget, fixedGhostStatKey, ghostGoldMultiplier, ghostNetworkSlotKey,
  remoteGhostFeedbackTarget, selectedGhostMode,
} from './ghostOnline';
import {
  sanitizeSharedProfile, GHOST_PROFILE_DEFAULTS, GHOST_KNOB_NAMES,
  GHOST_MASTERY_KEYS, GHOST_MASTERY_MAX_MULT, GHOST_GROWTH_ATK_MAX_MULT,
} from '../../shared/ghostSanitize.mjs';
import { GROWING_MASTERY_KEYS, MASTERY_MAX_LEVEL, MASTERY_MAX_MULT } from '../data/mastery';
import { masteryDamageMult, normalizeMasteryRecord } from './mastery';
import { growthAttackMult } from './playerUpgrades';
import { PLAYER_UPGRADE_MAX_LEVEL } from '../data/playerUpgrades';

describe('G6 online guardian rules', () => {
  it('uses the decided skill priority and gold multipliers', () => {
    expect(selectedGhostMode(['guardian-spirit', 'ghost-slayer'])).toBe('own');
    expect(selectedGhostMode(['ghost-helper', 'ghost-slayer'])).toBe('top');
    expect(selectedGhostMode(['ghost-helper'])).toBe('random');
    expect(ghostGoldMultiplier('own')).toBe(0.5);
    expect(ghostGoldMultiplier('random')).toBe(0.7);
    expect(ghostGoldMultiplier('top')).toBe(0.5);
    expect(ghostGoldMultiplier(null)).toBe(1);
  });

  it('keeps network slots inside the server allow-list', () => {
    expect(ghostNetworkSlotKey('giantbat@stage-7')).toBe('giantbat-stage-7');
  });

  it('builds fixed and online feedback targets without mixing them', () => {
    const fixed = fixedGhostFeedbackTarget('hatsune', 'giantbat@stage-2');
    const remote = remoteGhostFeedbackTarget('record-1');
    expect(fixed).toMatchObject({ kind: 'fixed', guardianId: 'hatsune', slot: 'giantbat-stage-2' });
    expect(remote).toMatchObject({ kind: 'remote', recordId: 'record-1' });
    expect(fixed.eventId).toBeTruthy();
    expect(remote.eventId).toBeTruthy();
    expect(fixedGhostStatKey('giantbat-stage-2', 'hatsune')).toBe('giantbat-stage-2:hatsune');
  });

  it('fills all nine knobs and rejects a mismatched boss slot', () => {
    expect(GHOST_KNOB_NAMES).toEqual([
      'reactionMs', 'counterChance', 'preferredDist', 'meleeBias', 'mobility',
      'hitsPerMin', 'subUsesPerMin', 'stationaryFrac', 'approachPerMin',
    ]);
    const raw = {
      v: 1, runs: 1, moveReactions: {}, subStyles: {},
      bossStyles: { thor: { ...GHOST_PROFILE_DEFAULTS, subStyles: {}, at: 1 } },
    };
    const safe = sanitizeSharedProfile(raw, 'thor');
    expect(safe).not.toBeNull();
    expect((safe as { reactionMs?: number } | null)?.reactionMs).toBe(GHOST_PROFILE_DEFAULTS.reactionMs);
    expect(sanitizeSharedProfile(raw, 'skadi')).toBeNull();
  });

  it('sanitizes public guardian comments and keeps them within 25 characters', () => {
    const raw = {
      v: 1, runs: 1, moveReactions: {}, subStyles: {},
      arrivalComment: `援護\u202e${'あ'.repeat(35)}`,
      departureComment: 'またね！',
      bossStyles: { thor: { ...GHOST_PROFILE_DEFAULTS, subStyles: {}, at: 1 } },
    };
    const safe = sanitizeSharedProfile(raw, 'thor') as { arrivalComment?: string; departureComment?: string } | null;
    expect(safe?.arrivalComment).not.toContain('\u202e');
    expect([...(safe?.arrivalComment ?? '')]).toHaveLength(30);
    expect(safe?.departureComment).toBe('またね！');
  });

  it('research/LUNGE_DODGE.md §4-2: 抜け方の要約(lungeStyle)は範囲へ収めて通し、コマ(moveHabits)は通さない', () => {
    const raw = {
      v: 1, runs: 1, moveReactions: {}, subStyles: {},
      lungeStyle: { chance: 1.7, sideFrac: 0.25, leadMs: 9999, n: 6 },
      moveHabits: { 'thor:tsuki-windup': [{ posA: 1, posB: 0, sub: 0, pressOfs: -200, ctxHp: 0, ctxHit: 0, seq: 1, lg: 1 }] },
      bossStyles: { thor: { ...GHOST_PROFILE_DEFAULTS, subStyles: {}, at: 1 } },
    };
    const safe = sanitizeSharedProfile(raw, 'thor') as { lungeStyle?: unknown; moveHabits?: unknown } | null;
    expect(safe?.lungeStyle).toEqual({ chance: 1, sideFrac: 0.25, leadMs: 400, n: 6 });
    expect(safe?.moveHabits).toBeUndefined();
    const bad = sanitizeSharedProfile({ ...raw, lungeStyle: { chance: 'x' } }, 'thor') as { lungeStyle?: unknown } | null;
    expect(bad?.lungeStyle).toBeUndefined();
  });

  it('SAME_ARENA §8-B2: 間合いの癖(meleeSpacing)は v2 だけを範囲へ収めて通し、測れなかった値は null のまま運ぶ', () => {
    const base = {
      v: 1, runs: 1, moveReactions: {}, subStyles: {},
      bossStyles: { thor: { ...GHOST_PROFILE_DEFAULTS, subStyles: {}, at: 1 } },
    };
    const ms = {
      v: 2, n: 12, swingLagMs: 310, reentryPerMin: 9, backStepPx: null, holdBackStepPx: 18,
      swingsPerEpisode: 2.5, preSwingRate: 1.4, swingLeaveRate: 0.2, holdRate: 0.3,
      counterAimRate: null, counterAimOffsetMs: -99999,
    };
    type Safe = { meleeSpacing?: Record<string, unknown> } | null;
    const safe = sanitizeSharedProfile({ ...base, meleeSpacing: ms }, 'thor') as Safe;
    expect(safe?.meleeSpacing).toMatchObject({ v: 2, n: 12, swingLagMs: 310, backStepPx: null, preSwingRate: 1, counterAimRate: null, counterAimOffsetMs: -2000 });
    // v1(測り方に誤りがあった記録)・記録なしは通さない
    expect((sanitizeSharedProfile({ ...base, meleeSpacing: { ...ms, v: undefined } }, 'thor') as Safe)?.meleeSpacing).toBeUndefined();
    expect((sanitizeSharedProfile({ ...base, meleeSpacing: { ...ms, n: 0 } }, 'thor') as Safe)?.meleeSpacing).toBeUndefined();
  });
});

// 社長裁定: オンラインで来る他人の守護霊にも、記録主の熟練度の倍率と育成の攻撃力を乗せる。
// 共有の正規化(shared/ghostSanitize.mjs)が3欄を通す事・丸め方・台帳(src/)との一致をここで固定する。
describe('他人の守護霊の熟練度・育成の攻撃力(共有の正規化)', () => {
  type Snap = { masteryMult?: Record<string, number>; masteryLoadoutMult?: number; growthAtkMult?: number };
  const withSnap = (snapshot: Record<string, unknown>) => ({
    v: 1, runs: 1, moveReactions: {}, subStyles: {},
    snapshot: { maxHealth: 130, speed: 3, level: 5, ...snapshot },
    bossStyles: { thor: { ...GHOST_PROFILE_DEFAULTS, subStyles: {}, at: 1, snapshot: { maxHealth: 130, speed: 3, level: 5, ...snapshot } } },
  });
  const slotSnap = (snapshot: Record<string, unknown>): Snap | undefined =>
    (sanitizeSharedProfile(withSnap(snapshot), 'thor') as { bossStyles: { thor: { snapshot: Snap | null } } } | null)
      ?.bossStyles.thor.snapshot ?? undefined;
  const topSnap = (snapshot: Record<string, unknown>): Snap | undefined =>
    (sanitizeSharedProfile(withSnap(snapshot), 'thor') as { snapshot?: Snap } | null)?.snapshot;

  it('台帳と一致: 熟練度のキー(育つキー+max)・上限(Lv10の倍率)・育成の攻撃力の上限', () => {
    expect(new Set(GHOST_MASTERY_KEYS)).toEqual(new Set([...GROWING_MASTERY_KEYS, 'max']));
    expect(GHOST_MASTERY_KEYS).toHaveLength(GROWING_MASTERY_KEYS.length + 1);
    expect(GHOST_MASTERY_MAX_MULT).toBe(MASTERY_MAX_MULT);
    expect(GHOST_MASTERY_MAX_MULT).toBe(masteryDamageMult(MASTERY_MAX_LEVEL));
    expect(GHOST_GROWTH_ATK_MAX_MULT).toBe(growthAttackMult(PLAYER_UPGRADE_MAX_LEVEL));
  });

  it('範囲内の値はそのまま通る(枠の記録・共通の記録の両方)', () => {
    const raw = { masteryMult: { melee: 1.5, handgun: 1.2, max: 1.9 }, masteryLoadoutMult: 1.3, growthAtkMult: 1.12 };
    for (const s of [slotSnap(raw), topSnap(raw)]) {
      expect(s?.masteryMult).toEqual({ melee: 1.5, handgun: 1.2, max: 1.9 });
      expect(s?.masteryLoadoutMult).toBe(1.3);
      expect(s?.growthAtkMult).toBe(1.12);
    }
  });

  it('上限で頭打ち・1未満は1(熟練度の1は表から落とす)', () => {
    const s = slotSnap({ masteryMult: { melee: 99, rifle: 0.2, katana: 1 }, masteryLoadoutMult: 50, growthAtkMult: 9 });
    expect(s?.masteryMult).toEqual({ melee: GHOST_MASTERY_MAX_MULT });
    expect(s?.masteryLoadoutMult).toBe(GHOST_MASTERY_MAX_MULT);
    expect(s?.growthAtkMult).toBe(GHOST_GROWTH_ATK_MAX_MULT);
    const low = slotSnap({ masteryLoadoutMult: 0.1, growthAtkMult: -3 });
    expect(low?.masteryLoadoutMult).toBe(1);
    expect(low?.growthAtkMult).toBe(1);
  });

  it('知らないキー・特別なキー(loadout/none)・数でない値は落ちる', () => {
    const s = slotSnap({
      masteryMult: { melee: 1.4, evil: 1.9, loadout: 1.9, none: 1.9, __proto__x: 1.9, shotgun: 'x', rifle: Number.NaN, phill: Infinity },
    });
    expect(s?.masteryMult).toEqual({ melee: 1.4 });
  });

  it('物でない熟練度の表は欄ごと落ちる・数でない倍率は欄なし(=受け取り側で1)', () => {
    for (const bad of [[1.9], 'x', 1.5, null, true]) {
      expect(slotSnap({ masteryMult: bad })).not.toHaveProperty('masteryMult');
    }
    const s = slotSnap({ masteryLoadoutMult: 'x', growthAtkMult: Number.NaN });
    expect(s).not.toHaveProperty('masteryLoadoutMult');
    expect(s).not.toHaveProperty('growthAtkMult');
    expect(slotSnap({ growthAtkMult: Infinity })).not.toHaveProperty('growthAtkMult');
  });

  it('古い記録(欄なし)は今までどおり読め、欄は出ない=受け取り側で1', () => {
    const s = slotSnap({});
    expect(s).toBeTruthy();
    expect(s).not.toHaveProperty('masteryMult');
    expect(s).not.toHaveProperty('masteryLoadoutMult');
    expect(s).not.toHaveProperty('growthAtkMult');
    expect(normalizeMasteryRecord(s?.masteryMult, s?.masteryLoadoutMult)).toEqual({ masteryMult: {}, masteryLoadoutMult: 1 });
  });

  it('キーの数は既知のキーの数で頭打ち', () => {
    const many: Record<string, number> = {};
    for (let i = 0; i < 200; i++) many[`junk-${i}`] = 1.5;
    for (const k of GHOST_MASTERY_KEYS) many[k] = 1.5;
    const s = slotSnap({ masteryMult: many });
    expect(Object.keys(s?.masteryMult ?? {})).toHaveLength(GHOST_MASTERY_KEYS.length);
  });

  it('受け取り側の normalizeMasteryRecord を重ねても値は変わらない(二重の丸めで害が無い)', () => {
    const s = slotSnap({ masteryMult: { melee: 99, handgun: 1.35, evil: 1.9 }, masteryLoadoutMult: 1.25 });
    const once = { masteryMult: s?.masteryMult ?? {}, masteryLoadoutMult: s?.masteryLoadoutMult ?? 1 };
    expect(normalizeMasteryRecord(s?.masteryMult, s?.masteryLoadoutMult)).toEqual(once);
    // 正規化した物をもう一度共有の正規化へ通しても同じ(サーバ保存→配る時の再浄化)。
    expect(slotSnap({ masteryMult: s?.masteryMult, masteryLoadoutMult: s?.masteryLoadoutMult })?.masteryMult).toEqual(s?.masteryMult);
  });
});
