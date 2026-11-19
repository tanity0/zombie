// 案山子(変異体対策室の「練習」枠・社長指示2026-11-19「雑魚扱いで、HPは無限で何もしないサンドバック。練習用」)。
// 純関数と台帳の決まりを固定する(配線=実際に倒れない・動かないは src/store/scarecrow.store.test.ts)。
import { describe, it, expect, afterEach } from 'vitest';
import {
  enemyHealthAfterHit, isScarecrow, scarecrowSwayFrame, SCARECROW_SWAY_MS, SCARECROW_FRAMES, SCARECROW_SHEET,
  scarecrowSwayStep, scarecrowFaceMul,
} from './scarecrow';
import {
  PRACTICE_SLOTS, PRACTICE_CATEGORY_ORDER, SCARECROW_SLOT_KEY, practiceSlotByKey, practiceSlotUnlocked, practiceBossHealth,
  beginPracticeRun, endPracticeRun, isNoProgressRun, practiceForces,
} from './bossPractice';
import { ENEMY_STATS, isBossType, isTrueBossType, isPumpkinTier, spawnEnemyAtWithTier } from './enemyUtils';
import { isEliteEnemy, resolveStunnedMeleeHit, stunnedMeleeOutcome } from './meleeExecute';
import { gauntletSlots, gauntletSkippedSlots } from './gauntlet';
import { sortieBossRoster } from './sortieBossRoster';
import { STAGES } from '../data/campaign';
import { bossHintsFor } from '../data/bossHints';
import { BOSS_STORY_EXCLUDED_KEYS } from './bossStoryArchive';

afterEach(() => { endPracticeRun(); });

describe('案山子の枠(変異体対策室)', () => {
  const slot = practiceSlotByKey(SCARECROW_SLOT_KEY)!;

  it('一覧の最後・棚「練習」も最後', () => {
    expect(PRACTICE_SLOTS[PRACTICE_SLOTS.length - 1].slotKey).toBe(SCARECROW_SLOT_KEY);
    expect(PRACTICE_CATEGORY_ORDER[PRACTICE_CATEGORY_ORDER.length - 1]).toBe('practice');
    expect(slot.label).toBe('案山子');
    expect(slot.bossType).toBe('scarecrow');
  });

  it('遭遇なしで最初から選べる(本編に居ない)', () => {
    expect(practiceSlotUnlocked(slot, new Set())).toBe(true);
    expect(slot.reachable).toBe(false);
  });

  it('体力の表示は無限(∞)', () => {
    expect(practiceBossHealth(slot)).toBe(Number.POSITIVE_INFINITY);
    expect(Number.POSITIVE_INFINITY.toLocaleString()).toBe('∞');
  });

  it('攻略ヒントがある(一覧の全枠の掟)・半角数字なし', () => {
    const hints = bossHintsFor('scarecrow', slot.stageId);
    expect(hints.length).toBeGreaterThan(0);
    for (const h of hints) expect(/[0-9]/.test(h)).toBe(false);
  });

  it('ガントレット(全ボス自動テスト)には入らない=勝ちが無いので', () => {
    expect(gauntletSlots().some(s => s.slotKey === SCARECROW_SLOT_KEY)).toBe(false);
    expect(gauntletSkippedSlots().some(s => s.slotKey === SCARECROW_SLOT_KEY)).toBe(true);
  });

  it('出撃の地図(どのステージ)にも、資料室の特殊変異体の棚にも出ない', () => {
    for (const st of STAGES) {
      expect(sortieBossRoster(st.id, () => true).some(b => b.bossType === 'scarecrow'), st.id).toBe(false);
    }
    expect(BOSS_STORY_EXCLUDED_KEYS).toContain('scarecrow');
  });

  it('湧かせる旗は練習ランの間だけ立つ。練習ランは進行を1つも残さない(撃破・年表・熟練度・クエストの書き込みが止まる)', () => {
    expect(practiceForces('scarecrownow')).toBe(false);
    beginPracticeRun(slot, { stageId: 'stage-1', mission: 'revisit', free: false });
    expect(practiceForces('scarecrownow')).toBe(true);
    expect(isNoProgressRun()).toBe(true);
    endPracticeRun();
    expect(practiceForces('scarecrownow')).toBe(false);
  });
});

describe('案山子の型(区分=雑魚)', () => {
  it('ボス・強個体のどの表にも載らない', () => {
    expect(isScarecrow('scarecrow')).toBe(true);
    expect(isScarecrow('zombie')).toBe(false);
    expect(isBossType('scarecrow')).toBe(false);
    expect(isTrueBossType('scarecrow')).toBe(false);
    expect(isPumpkinTier('scarecrow')).toBe(false);
    const e = spawnEnemyAtWithTier('scarecrow', 0, 0, 0, 'none');
    expect(isEliteEnemy(e)).toBe(false);
  });

  it('動かない・攻撃しない・経験値なし', () => {
    expect(ENEMY_STATS.scarecrow.speed).toBe(0);
    expect(ENEMY_STATS.scarecrow.damage).toBe(0);
    expect(ENEMY_STATS.scarecrow.experienceValue).toBe(0);
  });
});

describe('体力は減らない(enemyHealthAfterHit)', () => {
  it('案山子はどんな量でも体力が変わらない', () => {
    const e = { type: 'scarecrow' as const, health: 200 };
    for (const d of [0, 1, 199, 200, 10_000, Number.MAX_SAFE_INTEGER, Number.POSITIVE_INFINITY]) {
      expect(enemyHealthAfterHit(e, d)).toBe(200);
    }
  });
  it('他の敵は従来の式(減って0で止まる)', () => {
    expect(enemyHealthAfterHit({ type: 'zombie', health: 40 }, 15)).toBe(25);
    expect(enemyHealthAfterHit({ type: 'zombie', health: 40 }, 999)).toBe(0);
    expect(enemyHealthAfterHit({ type: 'giantbat', health: 5000 }, 1)).toBe(4999);
  });
  it('気絶中の近接は即死(処刑)にならず、重い一撃になる', () => {
    const e = { ...spawnEnemyAtWithTier('scarecrow', 0, 0, 0, 'none'), stunUntil: 10_000 };
    expect(stunnedMeleeOutcome(e, 5_000)).toBe('heavy');
    expect(resolveStunnedMeleeHit(e, 10, 5_000, 5)?.kind).toBe('heavy');
    // 比べ: 同じ状態のゾンビは即死
    const z = { ...spawnEnemyAtWithTier('zombie', 0, 0, 0, 'none'), stunUntil: 10_000 };
    expect(resolveStunnedMeleeHit(z, 10, 5_000, 5)?.kind).toBe('execute');
  });
});

describe('打たれた時の揺れ(1→2→1→0)', () => {
  it('打たれていない間は直立(0)', () => {
    expect(scarecrowSwayFrame(Number.POSITIVE_INFINITY)).toBe(0);
    expect(scarecrowSwayFrame(SCARECROW_SWAY_MS)).toBe(0);
    expect(scarecrowSwayFrame(SCARECROW_SWAY_MS + 5000)).toBe(0);
  });
  it('1→2→1→0 の順で、一番傾いた所(2)が一番長い=慣性', () => {
    const seq: number[] = [];
    for (let t = 0; t <= SCARECROW_SWAY_MS; t += 5) {
      const f = scarecrowSwayFrame(t);
      if (seq[seq.length - 1] !== f) seq.push(f);
    }
    expect(seq).toEqual([1, 2, 1, 0]);
    expect(SCARECROW_SWAY_MS).toBeGreaterThanOrEqual(400);
    expect(SCARECROW_SWAY_MS).toBeLessThanOrEqual(600);
    const len = (f: number) => Array.from({ length: SCARECROW_SWAY_MS }, (_, t) => scarecrowSwayFrame(t)).filter(x => x === f).length;
    expect(len(1)).toBeGreaterThan(0);
    // 出だしの1(押された瞬間)は戻りの1より短い=立ち上がりが速く、戻りがゆっくり
    expect(scarecrowSwayFrame(0)).toBe(1);
    expect(scarecrowSwayFrame(70)).toBe(2);
  });
  it('ヒットストップで描画の時計が被弾より手前でも、打たれた直後のコマ', () => {
    expect(scarecrowSwayFrame(-30)).toBe(1);
  });
  it('コマ番号はシートの範囲内', () => {
    for (let t = -100; t < 1000; t += 7) {
      const f = scarecrowSwayFrame(t);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(SCARECROW_FRAMES);
    }
    expect(SCARECROW_SHEET).toBe('scarecrow');
  });
});

// 社長指示2026-11-19「打たれた向きによって反転させて」「燃焼系は揺れるだけにして」。
describe('揺れの向きと始まり(scarecrowSwayStep)', () => {
  // 案山子の中心 x=100(x=82・幅36)。
  const base = { x: 82, width: 36 };
  const NOW = 1_000_000;

  it('直接の当たり: 攻め手の反対へ傾く(右から打たれたら左=絵のまま / 左から打たれたら右=反転)・揺れを頭から', () => {
    const fromRight = scarecrowSwayStep({ ...base, lastHit: NOW }, 300, NOW)!;
    expect(fromRight).toEqual({ scarecrowSwayFor: NOW, scarecrowSwayAt: NOW, scarecrowLeanLeft: true });
    expect(scarecrowFaceMul(fromRight.scarecrowLeanLeft)).toBe(1);
    const fromLeft = scarecrowSwayStep({ ...base, lastHit: NOW }, -50, NOW)!;
    expect(fromLeft.scarecrowLeanLeft).toBe(false);
    expect(scarecrowFaceMul(fromLeft.scarecrowLeanLeft)).toBe(-1);
  });

  it('押されている最中なら押された向き(攻め手の位置より優先)', () => {
    const p = scarecrowSwayStep({ ...base, lastHit: NOW, knockbackUntil: NOW + 200, knockbackVx: 300 }, 300, NOW)!;
    expect(p.scarecrowLeanLeft).toBe(false); // 右へ押された=右へ傾く
    // 押しが切れていれば攻め手の位置
    expect(scarecrowSwayStep({ ...base, lastHit: NOW, knockbackUntil: NOW - 1, knockbackVx: 300 }, 300, NOW)!.scarecrowLeanLeft).toBe(true);
  });

  it('直接の当たりは揺れの途中でも始め直す', () => {
    const p = scarecrowSwayStep({ ...base, lastHit: NOW + 100, scarecrowSwayAt: NOW, scarecrowSwayFor: NOW, scarecrowLeanLeft: true }, -50, NOW + 100)!;
    expect(p.scarecrowSwayAt).toBe(NOW + 100);
    expect(p.scarecrowLeanLeft).toBe(false);
  });

  it('攻め手が真上・真下なら向きは前のまま(既定は書かない=絵の素の左)', () => {
    expect(scarecrowSwayStep({ ...base, lastHit: NOW, scarecrowLeanLeft: false }, 101, NOW)!.scarecrowLeanLeft).toBe(false);
    expect('scarecrowLeanLeft' in scarecrowSwayStep({ ...base, lastHit: NOW }, 100, NOW)!).toBe(false);
    expect(scarecrowFaceMul(undefined)).toBe(1);
  });

  it('持続ダメージ: 揺れの途中なら何もしない(始め直さない・向きも変えない)', () => {
    const playing = { ...base, lastHit: NOW + 100, lastHitDotAt: NOW + 100, scarecrowSwayAt: NOW, scarecrowSwayFor: NOW, scarecrowLeanLeft: false };
    expect(scarecrowSwayStep(playing, 300, NOW + 100)).toEqual({ scarecrowSwayFor: NOW + 100 });
  });

  it('持続ダメージ: 揺れていなければ普通に揺れ始める。向きは決めない(前の向きのまま)', () => {
    const idle = { ...base, lastHit: NOW + SCARECROW_SWAY_MS, lastHitDotAt: NOW + SCARECROW_SWAY_MS, scarecrowSwayAt: NOW, scarecrowSwayFor: NOW, scarecrowLeanLeft: false };
    expect(scarecrowSwayStep(idle, 300, idle.lastHit)).toEqual({ scarecrowSwayFor: idle.lastHit, scarecrowSwayAt: idle.lastHit });
    // 一度も揺れていない時の持続ダメージも揺れ始める(向きは書かない=既定の左)
    expect(scarecrowSwayStep({ ...base, lastHit: NOW, lastHitDotAt: NOW }, 300, NOW)).toEqual({ scarecrowSwayFor: NOW, scarecrowSwayAt: NOW });
  });

  it('処理済みの被弾・被弾なしは何もしない', () => {
    expect(scarecrowSwayStep({ ...base, lastHit: 0 }, 300, NOW)).toBeNull();
    expect(scarecrowSwayStep({ ...base, lastHit: NOW, scarecrowSwayFor: NOW }, 300, NOW)).toBeNull();
  });
});
