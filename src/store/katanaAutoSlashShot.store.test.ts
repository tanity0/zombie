// 刀のオート斬撃は「射撃」扱い(社長指示2026-11-22「オート斬撃は射撃にする」)の配線テスト。
// performKatanaStrike の asShot=true(オート斬撃だけが渡す)で、キルの記録・与ダメの記録・射撃のキルで動く物が銃の側へ倒れ、
// 一閃(allowFinisher=true・asShot なし)は近接のまま、を固定する。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const backing: Record<string, string> = {};
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (k in backing ? backing[k] : null),
  setItem: (k: string, v: string) => { backing[k] = v; },
  removeItem: (k: string) => { delete backing[k]; },
  clear: () => { for (const k of Object.keys(backing)) delete backing[k]; },
  key: () => null,
  get length() { return Object.keys(backing).length; },
} as Storage;

import { useGameStore, grantMeleeKillRewards } from './gameStore';
import { setSelectedStageId } from '../data/progress';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { getKillTotals, resetKillTelemetry } from '../utils/killTelemetryState';
import { bloodGainFor, bloodSizeMul } from '../utils/bloodAwaken';
import { getBotTelemetry, resetBotTelemetry } from '../utils/botTelemetry';

const st = () => useGameStore.getState();

/** プレイヤーの目の前(密着)に敵を1体だけ置く。 */
const spawnInFront = (health: number, dx = 4) => {
  const p = st().player;
  const e = spawnEnemyAt('zombie', p.x + p.width / 2 + dx, p.y + p.height / 2, st().gameTime);
  e.health = health; e.maxHealth = Math.max(e.maxHealth, health);
  useGameStore.setState({ enemies: [e], pickups: [] });
  return e;
};
const autoSlash = (id: string) => st().performKatanaStrike([id], 1, false, undefined, undefined, undefined, undefined, true);

beforeEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
  setSelectedStageId('stage-1');
  st().resetGame('warrior');
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // クリ・ドロップの抽選を出さない
  useGameStore.setState(s => ({ player: { ...s.player, maxHealth: 100, health: 100, subWeapons: [...s.player.subWeapons, 'katana'] } }));
  resetKillTelemetry();
  resetBotTelemetry();
});
afterEach(() => { vi.restoreAllMocks(); });

describe('オート斬撃(asShot)=射撃のキル', () => {
  it('オート斬撃で倒すと、射撃のキルとして数えられる(近接のキルは増えない)', () => {
    const e = spawnInFront(1);
    const r = autoSlash(e.id);
    expect(r.killed).toBe(1);
    expect(r.killedEnemies?.map(x => x.id)).toEqual([e.id]);
    expect(getKillTotals().gunKills).toBe(1);
    expect(getKillTotals().meleeKills).toBe(0);
  });
  it('与ダメの記録も射撃の側(近接の振りとしては数えない)', () => {
    const e = spawnInFront(99999);
    autoSlash(e.id);
    const t = getBotTelemetry();
    expect(t.damageDealt.gun).toBeGreaterThan(0);
    expect(t.damageDealt.melee).toBe(0);
  });
  it('一閃で倒すと、近接のキルのまま', () => {
    const e = spawnInFront(1);
    st().performKatanaStrike([e.id], 1, true);
    expect(getKillTotals().meleeKills).toBe(1);
    expect(getKillTotals().gunKills).toBe(0);
  });
  it('asShot を渡さないオート斬撃の呼び方(旧来)は近接のまま', () => {
    const e = spawnInFront(1);
    st().performKatanaStrike([e.id], 1, false);
    expect(getKillTotals().meleeKills).toBe(1);
    expect(getKillTotals().gunKills).toBe(0);
  });
});

describe('射撃のキルで動く物が、オート斬撃で動く', () => {
  it('血の覚醒: 射撃のキル(距離≤90px)の分が溜まる(旧: オート斬撃は何も溜まらなかった)', () => {
    const e = spawnInFront(1);
    autoSlash(e.id);
    const p = st().player;
    const dist = Math.hypot(e.x + e.width / 2 - (p.x + p.width / 2), e.y + e.height / 2 - (p.y + p.height / 2));
    const want = bloodGainFor({ kind: 'gun-kill', distPx: dist, sizeMul: bloodSizeMul(e.width, e.height) });
    expect(want).toBeGreaterThan(0);
    expect(st().player.bloodMeter).toBeCloseTo(want);
  });
  it('使役: 射撃のキルと同じく、倒した通常の敵が仲間になる抽選に入る', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // 抽選を必ず通す(クリも出るが1HPなので倒れる)
    useGameStore.setState(s => ({ player: { ...s.player, skills: [...s.player.skills, 'poi-thrall'], skillLevels: { ...s.player.skillLevels, 'poi-thrall': 1 } } }));
    const e = spawnInFront(1);
    autoSlash(e.id);
    expect(st().summons.some(sm => sm.persistent)).toBe(true);
  });
  it('一閃(近接)のキルでは使役の抽選に入らない(今のまま)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    useGameStore.setState(s => ({ player: { ...s.player, skills: [...s.player.skills, 'poi-thrall'], skillLevels: { ...s.player.skillLevels, 'poi-thrall': 1 } } }));
    const e = spawnInFront(1);
    st().performKatanaStrike([e.id], 1, true);
    expect(st().summons.some(sm => sm.persistent)).toBe(false);
  });
});

describe('grantMeleeKillRewards の killMethod', () => {
  it("'gun' は近接のドロップ(経験値・お金・弾・武器箱)を落とさない(呼び手が射撃のドロップを落とす=二重にしない)", () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const dead = spawnEnemyAt('zombie', 100, 100, st().gameTime); dead.health = 0;
    useGameStore.setState({ pickups: [] });
    grantMeleeKillRewards(useGameStore.getState, [{ enemy: dead, finisher: false }], st().player, undefined, false, undefined, false, 'gun');
    expect(st().pickups.some(p => p.id.startsWith('pickup-xp-melee'))).toBe(false);
    expect(getKillTotals().gunKills).toBe(1);
    grantMeleeKillRewards(useGameStore.getState, [{ enemy: { ...dead, id: 'm2' }, finisher: false }], st().player, undefined);
    expect(st().pickups.some(p => p.id.startsWith('pickup-xp-melee'))).toBe(true);
    expect(getKillTotals().meleeKills).toBe(1);
  });
});
