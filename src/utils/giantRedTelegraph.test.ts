// ★★赤い予告の4つの掟①(CLAUDE.md・社長指示2026-09-18)。PACING_PUZZLE.md §18-1 C-2 / C-8。
// **旧実装の嘘の検知器**=v0.25.4456以前の壊れ方をそのまま書くと落ちる。
import { describe, it, expect } from 'vitest';
import { giantSweepWindowProg, giantNovaWindupProg } from './giantRedTelegraph';

// 判定側(gameStore.ts)の実効尺(生値 ÷ ENEMY_ATTACK_SPEED_MULT=1.2)。
const SWEEPBEAM = { windup: 1080 / 1.2, active: 1080 / 1.2 };
const QUAD_BREATH = { windup: 1080 / 1.2, active: 840 / 1.2 };
const NOVA_WINDUP = 1200 / 1.2;

describe('★C-8: 氷の横薙ぎの実行相にも周回窓が付く(双子の掃射と同じ式)', () => {
  it('★実行相の窓は「流れ続ける」(旧実装の嘘の検知器: 旧は窓が無く静的な帯だった)', () => {
    // 判定が毎フレーム生きている持続技(§11-4)。窓は周期の頭で0→終わりで1へ流れ、また0へ戻る。
    expect(giantSweepWindowProg(false, QUAD_BREATH.active, QUAD_BREATH.windup, QUAD_BREATH.active)).toBe(0);
    expect(giantSweepWindowProg(false, QUAD_BREATH.active / 2, QUAD_BREATH.windup, QUAD_BREATH.active)).toBeCloseTo(0.5, 6);
    expect(giantSweepWindowProg(false, 0, QUAD_BREATH.windup, QUAD_BREATH.active)).toBe(0); // 周回(1周して頭へ)
    // 「実行の間ずっと静止した1つの値」ではない=流れていることを固定する。
    const samples = new Set<number>();
    for (let r = QUAD_BREATH.active; r >= 0; r -= 40) {
      samples.add(Math.round(giantSweepWindowProg(false, r, QUAD_BREATH.windup, QUAD_BREATH.active) * 100));
    }
    expect(samples.size).toBeGreaterThan(5);
  });

  it('★双子(掃射 g-sweepbeam / 氷の横薙ぎ g-quad-breath)が同じ式を通る', () => {
    // 尺だけが違い、式は1本(横展開漏れをここで固定する)。
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const a = giantSweepWindowProg(false, SWEEPBEAM.active * f, SWEEPBEAM.windup, SWEEPBEAM.active);
      const b = giantSweepWindowProg(false, QUAD_BREATH.active * f, QUAD_BREATH.windup, QUAD_BREATH.active);
      expect(a).toBeCloseTo(b, 6);
    }
  });

  it('溜めは 0→1(消え切り=実行開始)', () => {
    expect(giantSweepWindowProg(true, QUAD_BREATH.windup, QUAD_BREATH.windup, QUAD_BREATH.active)).toBe(0);
    expect(giantSweepWindowProg(true, 0, QUAD_BREATH.windup, QUAD_BREATH.active)).toBe(1);
  });
});

describe('★C-2: 氷結波の溜めが流星になる(輪郭2本を描くだけ、ではない)', () => {
  it('★溜め開始で0・溜め明け(=氷結波の発生)で1(旧実装の嘘の検知器: 旧は流れる位相が1つも無かった)', () => {
    expect(giantNovaWindupProg('g-nova-windup', NOVA_WINDUP, NOVA_WINDUP)).toBe(0);
    expect(giantNovaWindupProg('g-nova-windup', NOVA_WINDUP / 2, NOVA_WINDUP)).toBeCloseTo(0.5, 6);
    expect(giantNovaWindupProg('g-nova-windup', 0, NOVA_WINDUP)).toBe(1);
  });
  it('単調増加(逆流しない)', () => {
    let prev = -1;
    for (let r = NOVA_WINDUP; r >= 0; r -= 25) {
      const v = giantNovaWindupProg('g-nova-windup', r, NOVA_WINDUP)!;
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it('実行相(g-nova-active)には流星を出さない=判定はその瞬間の輪だけ(内側は当たらない)', () => {
    expect(giantNovaWindupProg('g-nova-active', 100, NOVA_WINDUP)).toBeNull();
    expect(giantNovaWindupProg('g-nova-recover', 100, NOVA_WINDUP)).toBeNull();
  });
});
