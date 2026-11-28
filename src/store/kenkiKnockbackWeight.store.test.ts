// ★孫悟空は雑魚と同じ重さで押される・飛ぶ(社長裁定2026-11-28「孫悟空は雑魚と同じ重さで」・utils/brawlerCombo brawlerKbWeightClass)。
// 旧: 孫悟空(guardian-phantom・phantomUnique 'brawler')はボス級の区分のまま押しを受け、飛び蹴りの3発目(蹴り飛ばし=普通の押し×1.8)が
//     ボス級の小さい押し(×0.35×0.5)に置き換わって約3pxしか動かなかった(雑魚は約174px)。
// 実際の刻み(プレイヤーの格闘 → updateEnemies → 孫悟空の頭脳 runPhantomTick)で、雑魚と孫悟空の飛ぶ距離を並べて比べる。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setBrawlerTempoAll, brawlerKbWeightClass } from '../utils/brawlerCombo';
import { initialBrawlerState, BRAWLER_TEMPO_DEFAULT } from '../utils/brawler';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import { setPhantomIdentity } from '../utils/phantomIdentity';
import { uniquePhantomSpec } from '../data/uniquePhantoms';
import { runPhantomTick, createPhantomTickState, NOOP_PHANTOM_SFX } from '../utils/phantomTick';

const NO = { up: false, down: false, left: false, right: false } as never;
let now = 7_000_000;
let pst: ReturnType<typeof createPhantomTickState> | null = null;
const adv = (): void => {
  const frozen = now < useGameStore.getState().hitstopUntil;
  now += 16;
  if (frozen) return;
  useGameStore.getState().setGameTime(useGameStore.getState().gameTime + 16);
  useGameStore.getState().movePlayer(NO, 0.016);
  useGameStore.getState().tickBrawler();
  useGameStore.getState().updateEnemies(0.016);
  const k = useGameStore.getState().enemies.find(x => x.id === 'z');
  if (pst && k && k.type === 'guardian-phantom') runPhantomTick(k, pst, useGameStore.getState().gameTime, 0.016, 1, now, NOOP_PHANTOM_SFX, () => 0.999);
};
beforeEach(() => {
  now = 7_000_000;
  setBrawlerTempoAll(1.3);
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  setTreesDisabled(true); setTorchesDisabled(true);
});
afterEach(() => { vi.restoreAllMocks(); setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT); setTreesDisabled(false); setTorchesDisabled(false); });

type Foe = 'zombie' | 'kenki' | 'phantom';
const setup = (foe: Foe): void => {
  useGameStore.getState().resetGame('warrior');
  const type: EnemyType = foe === 'zombie' ? 'zombie' : 'guardian-phantom';
  pst = foe === 'zombie' ? null : createPhantomTickState();
  const k = uniquePhantomSpec('brawler');
  if (foe === 'kenki') setPhantomIdentity({ name: k.name, profile: k.profile, source: 'unique' });
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
    player: { ...st.player, health: 99999, maxHealth: 99999, subWeapons: ['brawler'], subWeaponLevels: { brawler: 3 }, lastDirection: { x: 1, y: 0 }, brawler: { ...initialBrawlerState(), points: 20 } },
  }));
  const p = useGameStore.getState().player;
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  const extra: Partial<Enemy> = foe === 'kenki' ? { phantomUnique: 'brawler', phantomBuild: k.profile.snapshot, bossState: 'chase' } : foe === 'phantom' ? { bossState: 'chase' } : {};
  useGameStore.setState({ enemies: [{ ...e, id: 'z', x: p.x + p.width / 2 + 60 - e.width / 2, y: p.y + p.height / 2 - e.height / 2, health: 9e6, maxHealth: 9e6, dormant: false, ...extra } as Enemy] });
};
const z = (): Enemy => useGameStore.getState().enemies.find(x => x.id === 'z')!;
const br = () => useGameStore.getState().player.brawler!;
/** 飛び蹴り1→2→3発目を当て、3発目(蹴り飛ばし)の当たりから 60 フレームで動いた横の距離。 */
const kick3Travel = (foe: Foe): number => {
  setup(foe);
  for (let n = 1; n <= 3; n++) {
    expect(useGameStore.getState().brawlerTech(1, 0), `kick ${n} issued`).toBe(true);
    for (let k = 0; k < 400 && !(br().phase === 'tech' && br().kickN === n && br().resolved); k++) adv();
    expect(br().connected, `kick ${n} connected`).toBe(true);
  }
  const x0 = z().x;
  for (let f = 0; f < 60; f++) adv();
  return z().x - x0;
};

describe('孫悟空は格闘の押し・吹き飛びを雑魚と同じ重さで受ける(社長裁定2026-11-28)', () => {
  it('区分: 孫悟空だけ押しは雑魚・汎用の幻影とほかのボス級は今どおり', () => {
    expect(brawlerKbWeightClass({ type: 'guardian-phantom', phantomUnique: 'brawler' }, 'boss')).toBe('mob');
    expect(brawlerKbWeightClass({ type: 'guardian-phantom' }, 'boss')).toBe('boss');
    expect(brawlerKbWeightClass({ type: 'hunter' }, 'boss')).toBe('boss');
    expect(brawlerKbWeightClass({ type: 'zombie' }, 'mob')).toBe('mob');
  });
  it('飛び蹴りの3発目(蹴り飛ばし)で、孫悟空は雑魚と同じだけ飛ぶ(旧: 約3px)', () => {
    const mob = kick3Travel('zombie');
    const kenki = kick3Travel('kenki');
    expect(mob).toBeGreaterThan(100);
    expect(Math.abs(kenki - mob)).toBeLessThan(2);
  });
  it('汎用の幻影(phantomUnique なし)は今どおりボス級の小さい押し', () => {
    const generic = kick3Travel('phantom');
    expect(generic).toBeLessThan(10);
  });
});
