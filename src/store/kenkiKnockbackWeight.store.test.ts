// ★格闘は幻影もプレイヤーも雑魚と同じ扱い(押し・吹き飛び・浮き・空中投げの掴み)。
// 社長裁定2026-11-28「孫悟空は雑魚と同じ重さで」→ 同日「プレイヤーも幻影も格闘には雑魚と同じ扱いにしよう」(utils/brawlerCombo brawlerKbWeightClass・utils/brawlerMobEquiv)。
// 旧: ①汎用の幻影(phantomUnique なし)はボス級の押し(蹴り飛ばしで約3px)・空中投げで掴めない
//     ②孫悟空・汎用の幻影とも、大踏み潰しの浮きが止めの分だけ短い(雑魚 1024ms / 幻影 768ms)
//     ③孫悟空の格闘でプレイヤーが飛ぶ量はプレイヤーの被弾の押し(大踏み潰しで雑魚の約2.5倍)・浮きは止めの分だけ短い(3段目 640ms / 雑魚 816ms)。
// 実際の刻み(プレイヤーの格闘 → updateEnemies → 幻影の頭脳 runPhantomTick)で、雑魚と並べて比べる。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, KNOCKBACK_SPEED, KNOCKBACK_DURATION } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setBrawlerTempoAll, brawlerKbWeightClass, brawlerJuggleHeightRel, brawlerAirborne } from '../utils/brawlerCombo';
import { initialBrawlerState, BRAWLER_TEMPO_DEFAULT, brawlerStartAttack, brawlerStartTech } from '../utils/brawler';
import { brawlerMobHitStage, brawlerMobHitStomp, brawlerMobHitKick, brawlerMobKbTravel, brawlerMobKbForPlayer } from '../utils/brawlerMobEquiv';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import { setPhantomIdentity } from '../utils/phantomIdentity';
import { setKenkiLevelForTest } from '../utils/kenkiLevel';
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
  setKenkiLevelForTest(5); // 蹴り上げ(空中投げの入口)を体得した状態
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  setTreesDisabled(true); setTorchesDisabled(true);
});
afterEach(() => { vi.restoreAllMocks(); setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT); setTreesDisabled(false); setTorchesDisabled(false); });

type Foe = 'zombie' | 'kenki' | 'phantom';
const setup = (foe: Foe, dist = 60, skills: string[] = [], extraEnemies: Enemy[] = []): void => {
  useGameStore.getState().resetGame('warrior');
  const type: EnemyType = foe === 'zombie' ? 'zombie' : 'guardian-phantom';
  pst = foe === 'zombie' ? null : createPhantomTickState();
  const k = uniquePhantomSpec('brawler');
  if (foe === 'kenki') setPhantomIdentity({ name: k.name, profile: k.profile, source: 'unique' });
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
    player: { ...st.player, health: 99999, maxHealth: 99999, skills: skills as never, skillLevels: {}, subWeapons: ['brawler'], subWeaponLevels: { brawler: 3 }, lastDirection: { x: 1, y: 0 }, brawler: { ...initialBrawlerState(), points: 20 } },
  }));
  const p = useGameStore.getState().player;
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  const extra: Partial<Enemy> = foe === 'kenki' ? { phantomUnique: 'brawler', phantomBuild: k.profile.snapshot, bossState: 'chase' } : foe === 'phantom' ? { bossState: 'chase' } : {};
  useGameStore.setState({ enemies: [{ ...e, id: 'z', x: p.x + p.width / 2 + dist - e.width / 2, y: p.y + p.height / 2 - e.height / 2, health: 9e6, maxHealth: 9e6, dormant: false, ...extra } as Enemy, ...extraEnemies] });
};
const z = (): Enemy => useGameStore.getState().enemies.find(x => x.id === 'z')!;
const pl = () => useGameStore.getState().player;
const br = () => pl().brawler!;
type Rec = { px: number; peak: number; airMs: number };
/** 当たった直後から 120 フレーム: 押しが終わるまでに動いた距離・浮きの頂点(高さの割合)・浮いていた長さ(壁時計)。 */
const watch = (pos: () => { x: number; y: number }, lift: () => object | undefined, kbEnd: () => number): Rec => {
  const p0 = pos();
  let px = 0, peak = 0, airMs = 0, was = false, done = false;
  for (let f = 0; f < 120; f++) {
    adv();
    const act = kbEnd() > now - 16;
    if (!done) { const q = pos(); px = Math.hypot(q.x - p0.x, q.y - p0.y); }
    if (act) was = true; else if (was) done = true;
    const L = lift() as never;
    if (L && brawlerAirborne(L, now)) { airMs += 16; peak = Math.max(peak, brawlerJuggleHeightRel(L, now)); }
  }
  return { px, peak, airMs };
};
const foeWatch = (): Rec => watch(() => z(), () => z(), () => Math.max(z().knockbackUntil ?? 0, z().hitStunUntil ?? 0));
const stageTo = (foe: Foe, n: number): Rec => {
  setup(foe);
  for (let k = 1; k <= n; k++) {
    useGameStore.getState().brawlerPress();
    for (let i = 0; i < 400 && !(br().phase === 'attack' && br().stage === k && br().resolved); i++) adv();
    expect(br().connected, `stage ${k} connected`).toBe(true);
  }
  return foeWatch();
};
const tech = (foe: Foe, dx: number, dy: number, n = 1): Rec => {
  setup(foe);
  for (let k = 1; k <= n; k++) {
    expect(useGameStore.getState().brawlerTech(dx, dy), `tech ${k} issued`).toBe(true);
    for (let i = 0; i < 400 && !(br().phase === 'tech' && br().resolved && (dx === 0 || br().kickN === k)); i++) adv();
    expect(br().connected, `tech ${k} connected`).toBe(true);
  }
  return foeWatch();
};
const MOVES = {
  s3: (f: Foe) => stageTo(f, 3),
  s4: (f: Foe) => stageTo(f, 4),
  stomp: (f: Foe) => tech(f, 0, 1),
  kick3: (f: Foe) => tech(f, 1, 0, 3),
} as const;

describe('区分(押し・掴みの重さ)', () => {
  it('幻影(汎用・孫悟空)は押し・掴みを雑魚の値で受ける・ほかのボス級は今どおり', () => {
    expect(brawlerKbWeightClass({ type: 'guardian-phantom', phantomUnique: 'brawler' }, 'boss')).toBe('mob');
    expect(brawlerKbWeightClass({ type: 'guardian-phantom' }, 'boss')).toBe('mob');
    expect(brawlerKbWeightClass({ type: 'hunter' }, 'boss')).toBe('boss');
    expect(brawlerKbWeightClass({ type: 'zombie' }, 'mob')).toBe('mob');
  });
});

describe('プレイヤーの格闘を雑魚・汎用の幻影・孫悟空に当てる: 動いた距離・浮きの高さと長さが同じ', () => {
  for (const [name, run] of Object.entries(MOVES)) {
    it(name, () => {
      const mob = run('zombie');
      for (const foe of ['phantom', 'kenki'] as const) {
        const r = run(foe);
        expect(Math.abs(r.px - mob.px), `${foe} ${name} 距離 ${r.px.toFixed(1)} / 雑魚 ${mob.px.toFixed(1)}`).toBeLessThan(3);
        expect(r.peak, `${foe} ${name} 頂点`).toBeCloseTo(mob.peak, 2);
        expect(r.airMs, `${foe} ${name} 浮き`).toBe(mob.airMs);
      }
      if (name === 'kick3') expect(mob.px).toBeGreaterThan(100); // 蹴り飛ばしは大きく飛ぶ(旧: 汎用の幻影は約3px)
    });
  }
});

/** 孫悟空の段・技を直接始め、プレイヤーに当たった瞬間から測る。 */
const kenkiOnPlayer = (mk: (t: number) => ReturnType<typeof initialBrawlerState>): Rec => {
  setup('kenki', 40);
  const gt = useGameStore.getState().gameTime;
  useGameStore.setState(st => ({ enemies: st.enemies.map(e => (e.id === 'z' ? { ...e, phantomBrawler: mk(gt) } : e)) }));
  const hp0 = pl().health;
  for (let i = 0; i < 400 && pl().health === hp0; i++) adv();
  expect(pl().health, 'kenki hit').toBeLessThan(hp0);
  return watch(() => pl(), () => pl().brAir, () => Math.max(pl().knockbackUntil ?? 0, useGameStore.getState().hitstopUntil));
};
const K = (t: number) => ({ ...initialBrawlerState(), points: 20, startAt: t });

describe('孫悟空の格闘をプレイヤーに当てる = プレイヤーの格闘を雑魚に当てた時と同じ押し・浮き', () => {
  const cases: [string, (t: number) => ReturnType<typeof initialBrawlerState>, (f: Foe) => Rec][] = [
    ['s3', t => brawlerStartAttack(K(t), 3, t, false), MOVES.s3],
    ['s4', t => brawlerStartAttack(K(t), 4, t, false), MOVES.s4],
    ['stomp', t => brawlerStartTech(K(t), 'stomp', t), MOVES.stomp],
  ];
  for (const [name, mk, mobRun] of cases) {
    it(name, () => {
      const mob = mobRun('zombie');
      const p = kenkiOnPlayer(mk);
      expect(p.peak, `${name} 頂点`).toBeCloseTo(mob.peak, 2);
      expect(p.airMs, `${name} 浮き ${p.airMs} / 雑魚 ${mob.airMs}`).toBe(mob.airMs);
      // 押しの量は同じ式(利く刻みの差=プレイヤーは止めの明けの1フレームを動かない=最大で1フレームぶんの速さ)。
      expect(Math.abs(p.px - mob.px), `${name} 距離 ${p.px.toFixed(1)} / 雑魚 ${mob.px.toFixed(1)}`).toBeLessThan(Math.max(3, mob.px * 0.12));
    });
  }
  it('蹴り飛ばし(3発目): 地上の雑魚と同じ距離', () => {
    const p = kenkiOnPlayer(t => brawlerStartTech(K(t), 'kick', t, 3));
    const want = brawlerMobKbTravel(brawlerMobHitKick(3, false, false), KNOCKBACK_SPEED, KNOCKBACK_DURATION)!.px;
    expect(Math.abs(p.px - want), `距離 ${p.px.toFixed(1)} / 雑魚の式 ${want.toFixed(1)}`).toBeLessThan(want * 0.12);
    expect(p.px).toBeGreaterThan(100);
  });
});

describe('雑魚の押しの式(純関数)', () => {
  it('プレイヤーの押し(直線の減り)の距離・長さ=雑魚の距離・長さ', () => {
    for (const h of [brawlerMobHitStage(3), brawlerMobHitStage(4), brawlerMobHitStage(5), brawlerMobHitStomp(false), brawlerMobHitKick(1, false, false), brawlerMobHitKick(3, false, false)]) {
      const t = brawlerMobKbTravel(h, KNOCKBACK_SPEED, KNOCKBACK_DURATION)!;
      const kb = brawlerMobKbForPlayer(h, { x: 1, y: 0 }, KNOCKBACK_SPEED, KNOCKBACK_DURATION);
      expect(kb).not.toBe('none');
      if (kb === 'none') continue;
      expect(kb.ms).toBe(t.ms);
      expect((kb.speed * kb.ms) / 2000).toBeCloseTo(t.px, 6);
    }
    // 強制の押し(大踏み潰し)は止めの後の 280ms だけ・押さない技(土竜・踵落とし・蹴り上げ)は 'none'
    expect(brawlerMobKbTravel(brawlerMobHitStomp(false), KNOCKBACK_SPEED, KNOCKBACK_DURATION)!.ms).toBe(KNOCKBACK_DURATION);
    expect(brawlerMobKbForPlayer(brawlerMobHitStomp(true), { x: 1, y: 0 }, KNOCKBACK_SPEED, KNOCKBACK_DURATION)).toBe('none');
    expect(brawlerMobKbForPlayer(brawlerMobHitKick(3, true, false), { x: 1, y: 0 }, KNOCKBACK_SPEED, KNOCKBACK_DURATION)).toBe('none');
    expect(brawlerMobKbForPlayer(brawlerMobHitKick(3, false, true), { x: 1, y: 0 }, KNOCKBACK_SPEED, KNOCKBACK_DURATION)).toBe('none');
  });
});

describe('空中投げ(格闘+パニッシャー): 幻影も雑魚と同じく掴む', () => {
  for (const foe of ['zombie', 'phantom', 'kenki'] as const) {
    it(foe, () => {
      setup(foe, 60, ['punisher']);
      for (let k = 1; k <= 2; k++) {
        expect(useGameStore.getState().brawlerTech(1, 0)).toBe(true);
        for (let i = 0; i < 400 && !(br().phase === 'tech' && br().resolved && br().kickN === k); i++) adv();
        expect(br().connected, `kick ${k}`).toBe(true);
      }
      expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true); // 蹴り上げ
      for (let i = 0; i < 400 && !br().grab; i++) adv();
      expect(br().grab?.enemyId).toBe('z');
    });
  }
});
