import { describe, it, expect, vi } from 'vitest';
import { useGameStore, CRIT_LIGHT_GAP_MS, CRIT_DAMAGE_MULT } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { GLOW_R_L } from '../utils/glowTiers';
import { impactShakeFor, IMPACT_HARD_MAX } from '../utils/impactShake';

// 社長指示2026-09-13「クリティカルダメージの時は大きく画面を揺らしながら、発生源に光源」
// → v0.25.4284 揺れの整理(research/SHAKE_UNIFY.md): 揺れは registerImpact(crit ×1.6)→flushImpacts、光源は spawnCritImpact。
const setup = () => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.getState().flushImpacts(); // 前テストの残りを捨てる
  const st = useGameStore.getState();
  return { px: st.player.x + st.player.width / 2, py: st.player.y + st.player.height / 2, gt: st.gameTime };
};
const glows = () => useGameStore.getState().effects.filter(e => e.kind === 'glow');

describe('クリティカルの揺れ+光源(registerImpact/flushImpacts + spawnCritImpact)', () => {
  it('銃のクリ(damageEnemy crit=true)で強glow(半径≥GLOW_R_L・投影影つき)と、クリ倍率の揺れが flush で出る。非クリの銃命中は揺れない(キックが担う)', () => {
    const { px, py, gt } = setup();
    const id = put(px + 200, py, gt);
    useGameStore.setState({ shakeUntil: 0, shakeMag: 0 });
    useGameStore.getState().damageEnemy(id, 30, false, false, false, 'gun', 'player');
    useGameStore.getState().flushImpacts();
    expect(glows().length).toBe(0);
    expect(useGameStore.getState().shakeMag).toBe(0);
    useGameStore.getState().damageEnemy(id, 30, false, true, false, 'gun', 'player');
    expect(useGameStore.getState().shakeMag).toBe(0); // 登録だけ=tick末まで揺れない
    useGameStore.getState().flushImpacts();
    const s = useGameStore.getState();
    // 揺れ用ダメージ=実効30をクリ倍率で戻した20 → base(20)×1.6
    expect(s.shakeMag).toBeCloseTo(impactShakeFor(30 / CRIT_DAMAGE_MULT, { crit: true }).mag, 6);
    expect(s.shakeMag).toBeLessThanOrEqual(IMPACT_HARD_MAX);
    expect(s.shakeUntil).toBeGreaterThan(Date.now() - 5);
    // 向き=射線の逆(命中点は自機の右→揺れは左へ)
    expect(s.shakeDirX).toBeLessThan(0);
    const g = glows();
    expect(g.length).toBe(1);
    if (g[0].kind === 'glow') { expect(g[0].radius).toBe(GLOW_R_L); expect(g[0].noShadow).toBeUndefined(); }
  });
  it('銃以外(サブ/スキル=other)は非クリでも毎命中が登録され、向きは命中点へ。同フレームの同じ源は1事象に合算される', () => {
    const { px, py, gt } = setup();
    const a = put(px + 200, py, gt);
    const b = put(px + 220, py, gt);
    useGameStore.setState({ shakeUntil: 0, shakeMag: 0 });
    useGameStore.getState().damageEnemy(a, 40, true, false, false, 'other', 'player'); // blast=爆風
    useGameStore.getState().damageEnemy(b, 60, true, false, false, 'other', 'player');
    useGameStore.getState().flushImpacts();
    const s = useGameStore.getState();
    expect(s.shakeMag).toBeCloseTo(impactShakeFor(100, { explosion: true }).mag, 6); // 合計100・爆発倍率
    expect(s.shakeDirX).toBeGreaterThan(0); // 命中点へ
  });
  it('連続クリは CRIT_LIGHT_GAP_MS 以内なら光を1つに畳む', () => {
    const { px, py, gt } = setup();
    const id = put(px + 200, py, gt);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 10_000); // 前のテストの畳み込み窓を抜ける
    try {
      useGameStore.getState().spawnCritImpact(px + 200, py);
      useGameStore.getState().spawnCritImpact(px + 210, py);
      expect(glows().length).toBe(1);
    } finally { vi.useRealTimers(); }
    expect(CRIT_LIGHT_GAP_MS).toBeGreaterThan(0);
    void id;
  });
  it('護衛の弾(channel null)・守護霊(ghost)・召喚/味方/連続源(dot)では光も揺れも出ない', () => {
    const { px, py, gt } = setup();
    const id = put(px + 200, py, gt);
    useGameStore.setState({ shakeUntil: 0, shakeMag: 0 });
    useGameStore.getState().damageEnemy(id, 50, false, true, false, null, 'player');
    useGameStore.getState().damageEnemy(id, 50, false, true, false, 'gun', 'ghost');
    useGameStore.getState().damageEnemy(id, 50, false, true, false, 'dot', 'player');
    useGameStore.getState().flushImpacts();
    expect(glows().length).toBe(0);
    expect(useGameStore.getState().shakeMag).toBe(0);
  });
  it('過剰ダメージは残HPで切られる(残HP1の敵に275でも揺れは1ダメぶん)', () => {
    const { px, py, gt } = setup();
    const e = { ...spawnEnemyAt('zombie', px + 200, py, gt), health: 1, maxHealth: 100 };
    useGameStore.setState(s => ({ enemies: [...s.enemies, e], shakeUntil: 0, shakeMag: 0 }));
    useGameStore.getState().damageEnemy(e.id, 275, true, false, false, 'other', 'player');
    useGameStore.getState().flushImpacts();
    expect(useGameStore.getState().shakeMag).toBeCloseTo(impactShakeFor(1, { explosion: true, kill: true }).mag, 6);
  });
});

function put(x: number, y: number, gt: number): string {
  const e = { ...spawnEnemyAt('zombie', x, y, gt), health: 100000, maxHealth: 100000 };
  useGameStore.setState(s => ({ enemies: [...s.enemies, e] }));
  return e.id;
}
