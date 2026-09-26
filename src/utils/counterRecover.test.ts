// ★PACING_PUZZLE.md §16-H #H-6(社長裁定2026-09-20「A」)の機械化。
//
// なぜ在るか: 実測(H-9)で、**カウンターは全型に成立するのに硬直が付くのは雑魚だけ**だった。
// 気絶5秒は成立側が `if (!killed && !boss)` で書いており `isBossType`(強個体3種/城ボス/研究所Lv3/
// 裏ボス)は丸ごと外れ、そして**カウンターのpatchはどの型にも `biteRecoverUntil` を書いていなかった**。
// 通常の噛み解決も技の `-recover` 相も硬直を持つのに、カウンターだけが「硬直の付かない攻撃の
// 終わり方」になっていた。ここを1本の不変条件として固定する。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { spawnEnemyAt } from './enemyUtils';
import { dashParriedEnemyPatch } from './combatTick';
import { BITE_RECOVER_STILL_MS, COUNTER_RECOVER_STILL_MS } from './enemyBite';
import type { Enemy, EnemyType } from '../types/game';

const START_GT = 10_000_000;
const REAL0 = 1_700_000_000_000;

describe('★#H-6 カウンター直後の硬直(突進パリィ/守護霊パリィ=dashParriedEnemyPatch)', () => {
  beforeEach(() => { useGameStore.getState().resetGame('assault'); });

  // 雑魚だけでなく**強個体・ボス級**を必ず含める(ここが抜けていた所)。
  const TYPES: EnemyType[] = [
    'zombie', 'skeleton', 'bat',           // 雑魚(気絶5秒が別途付く側)
    'pumpkin', 'driller', 'logger',        // 強個体(isPumpkinTier=isBossType ⇒ 気絶が付かない)
    'giantbat', 'lab-zombie-3',            // ボス級(同上)
  ];

  it.each(TYPES)('%s: 弾かれたら噛みつき直後と同じ硬直が書かれる', t => {
    const e = spawnEnemyAt(t, 500, 500, START_GT);
    const patched = dashParriedEnemyPatch(e, 100, 100, REAL0, START_GT);
    expect(patched.biteRecoverUntil).toBe(START_GT + COUNTER_RECOVER_STILL_MS);
  });

  // ★v0.25.4592(社長裁定2026-09-23「でも台本は続ける」)の機械化。
  // `aiReadyAt` は城ボス(giantbat/グレン)の**技抽選ゲートそのもの**なので、カウンターで +1200ms
  // 書くと「技を消す」だけでなく**台本ごと止まる**。ボスには書かない/雑魚には従来どおり書く。
  it.each<[EnemyType, boolean]>([
    ['zombie', false], ['skeleton', false], ['bat', false],      // 雑魚=従来どおりゲートを書く
    ['giantbat', true], ['pumpkin', true], ['logger', true],     // ボス級/強個体=書かない
    ['lab-zombie-3', true], ['hunter', true],
  ])('%s: カウンター後の技抽選ゲート(aiReadyAt)を書くのはボス以外だけ', (t, isBoss) => {
    const e = spawnEnemyAt(t, 500, 500, START_GT);
    const patched = dashParriedEnemyPatch(e, 100, 100, REAL0, START_GT);
    if (isBoss) expect(patched.aiReadyAt).toBe(e.aiReadyAt);            // 触らない(据え置き)
    else expect(patched.aiReadyAt).toBe(START_GT + 1200);
  });

  it('★中断しない技(尻尾の叩きつけ)には掛けない=技が完走できなくなるため', () => {
    // COUNTER_UNINTERRUPTIBLE_PHASES の相。硬直を書くと updateEnemies の硬直ブロック
    // (`chaffMove === undefined` ゲート・patchがchaffMoveを消すので必ず通る)に掛かって止まる。
    const e = { ...spawnEnemyAt('giantbat', 500, 500, START_GT), aiPhase: 'g-tailslam-volley' } as Enemy;
    const patched = dashParriedEnemyPatch(e, 100, 100, REAL0, START_GT);
    expect(patched.aiPhase).toBe('g-tailslam-volley'); // 技は消えない(従来どおり)
    expect(patched.biteRecoverUntil).toBeUndefined();
  });

  it('★硬直はgameTime系で書く(Date.now系と混ぜない=§16-Hの時計の罠)', () => {
    const e = spawnEnemyAt('pumpkin', 500, 500, START_GT);
    const patched = dashParriedEnemyPatch(e, 100, 100, REAL0, START_GT);
    // 1e12 級の絶対時刻が混ざっていたら、この比較で必ず落ちる。
    expect(patched.biteRecoverUntil!).toBeLessThan(START_GT + 10_000);
  });
});

// ★#H-7(社長指摘2026-09-20「普通に着地した時より、カウンター後の方が硬直が短い」)。
// カウンターを取るほど損、という逆立ちを機械で止める。
describe('★#H-7 カウンターの硬直は、どの通常の技後硬直よりも短くない', () => {
  // 実効値(atkUntil は ÷ENEMY_ATTACK_SPEED_MULT。s-recover だけ素の値を足している)。
  const NORMAL_RECOVER_MS: Record<string, number> = {
    'パンプキンの着地': 2000 / 1.2,
    '汎用ジャンプ(ハンター/研究所Lv3)': 1000 / 1.2,
    '伐採人の薙ぎ': 1000 / 1.2,
    '人狼の突進': 1000 / 1.2,
    '骸骨の弧': 500,
    '削岩型の突き': 400 / 1.2,
    '噛みつき直後': BITE_RECOVER_STILL_MS,
  };
  it.each(Object.entries(NORMAL_RECOVER_MS))('%s(%dms)より短くない', (_name, ms) => {
    expect(COUNTER_RECOVER_STILL_MS).toBeGreaterThanOrEqual(ms);
  });
});

describe('★#H-6 硬直中は1pxも動かない(既存の不変条件が強個体にも効く)', () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(REAL0);
    useGameStore.getState().resetGame('assault');
  });

  it('パンプキンは弾かれてから硬直の間、自分では動かない', () => {
    const p0 = useGameStore.getState().player;
    const e = { ...spawnEnemyAt('pumpkin', p0.x + 200, p0.y, START_GT), health: 99999, maxHealth: 99999 } as Enemy;
    useGameStore.setState(() => ({ enemies: [e], gameTime: START_GT }));
    useGameStore.setState(st => ({
      enemies: st.enemies.map(en => ({ ...dashParriedEnemyPatch(en, p0.x, p0.y, Date.now(), st.gameTime), knockbackUntil: 0 })),
    }));
    const a0 = useGameStore.getState().enemies[0];
    for (let i = 1; i * 16 < COUNTER_RECOVER_STILL_MS; i++) {
      vi.setSystemTime(REAL0 + i * 16);
      useGameStore.getState().setGameTime(START_GT + i * 16);
      useGameStore.getState().updateEnemies(1 / 60);
    }
    const a1 = useGameStore.getState().enemies[0];
    expect(Math.hypot(a1.x - a0.x, a1.y - a0.y)).toBeLessThan(0.5);
    vi.useRealTimers();
  });
});
