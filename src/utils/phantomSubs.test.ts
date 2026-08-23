// research/SAME_ARENA.md O-3「幻影がサブウェポンを使う」の土台の受け入れ条件。
// 守護霊との決定的な違い=**狙う相手がプレイヤー**なので、効果を敵対側(hostile)で撒く必要があり、
// かつ**紫の文法=カウンターできない**を守る必要がある(素通しだと打ち返せてしまう)。
import { describe, it, expect } from 'vitest';
import { playerAsOwner, ghostAsOwner, phantomAsOwner, isHostileOwner, ownerGhostId } from './subWeaponOwner';
import { applyEnemyProjectileHits } from './combatTick';
import { useGameStore } from '../store/gameStore';
import type { Projectile } from '../types/game';

const body = { x: 100, y: 200, width: 32, height: 48 };

describe('O-3 土台: サブウェポンの主語に幻影を足す', () => {
  it('幻影だけが「効果を敵対側で撒く主語」(プレイヤー/守護霊は false)', () => {
    expect(isHostileOwner(phantomAsOwner({ ...body, id: 'gp-1' }))).toBe(true);
    expect(isHostileOwner(ghostAsOwner({ ...body, id: 'g-1' }))).toBe(false);
    expect(isHostileOwner(playerAsOwner({ ...body, lastDirection: { x: 1, y: 0 } }))).toBe(false);
  });

  it('★CD帳簿の宛先idは幻影でも返る(=3者が別財布で回る)', () => {
    expect(ownerGhostId(phantomAsOwner({ ...body, id: 'gp-1' }))).toBe('gp-1');
    expect(ownerGhostId(ghostAsOwner({ ...body, id: 'g-1' }))).toBe('g-1');
    expect(ownerGhostId(playerAsOwner({ ...body }))).toBeUndefined();
  });

  it('幻影オーナーは実体の座標をそのまま持つ(投擲の起点)', () => {
    const o = phantomAsOwner({ ...body, id: 'gp-1' });
    expect(o.kind).toBe('phantom');
    expect(o.x).toBe(100);
    expect(o.y).toBe(200);
    expect(o.summonId).toBe('gp-1');
  });

  it('向きは呼び出し側が渡す(未指定=null で、各サブ固有のフォールバックへ委ねる)', () => {
    expect(phantomAsOwner({ ...body, id: 'gp-1' }).facing).toBeNull();
    expect(phantomAsOwner({ ...body, id: 'gp-1' }, { x: -1, y: 0 }).facing).toEqual({ x: -1, y: 0 });
  });
});

// ---------------------------------------------------------------------------------------------
// ★紫の文法(カウンターできない)の実挙動。O-3a で見つけた「素通しだと打ち返せてしまう」の再発検知器。
// ---------------------------------------------------------------------------------------------
// 演出は全部no-op(何を呼ばれても落ちない)。判定だけを見たいので Proxy で受け流す。
const NOOP_FX = new Proxy({}, { get: () => () => undefined }) as unknown as Parameters<typeof applyEnemyProjectileHits>[5];
const TUNABLES = { grenadeBlastRadius: 0, grenadeBlastDamageMult: 1, counterReflectSlowMs: 0 };

const hostileProjAt = (p: { x: number; y: number }, noCounter?: boolean): Projectile => ({
  id: `t-${noCounter ? 'nc' : 'ok'}`,
  x: p.x, y: p.y, width: 10, height: 10,
  speed: 0, damage: 1,
  direction: { x: 0, y: 1 },
  // ★火炎ナイフの型を使う。手榴弾(weaponType='grenade')は `checkProjectilePlayerCollisions` が
  // **元から反射対象外**(v0.25.3442・idolの手榴弾で入った除外)なので、noCounter の要否を検証できない。
  // noCounter が実際に効く必要があるのは**grenade以外の投擲物**(火炎ナイフ/ホーミング等)。
  weaponType: 'fire-knife-projectile', weaponKey: 'sub-fire-knife',
  duration: 9999, createdAt: 0,
  passthrough: false, hitEnemies: [],
  hostile: true, reflected: false,
  noCounter,
} as Projectile);

describe('O-3 紫の文法: 幻影のサブはカウンターで打ち返せない', () => {
  const setup = (proj: Projectile) => {
    const p0 = useGameStore.getState().player;
    useGameStore.setState({
      projectiles: [proj],
      // カウンター窓を開いた状態(反射が起きうる条件)
      player: { ...p0, x: proj.x, y: proj.y, counterWindowEnd: Number.MAX_SAFE_INTEGER, invulnerable: false },
    });
  };

  it('★noCounter の弾は、カウンター窓が開いていても反射されない(紫=カウンター不可)', () => {
    const proj = hostileProjAt({ x: 400, y: 400 }, true);
    setup(proj);
    applyEnemyProjectileHits(0, useGameStore.getState().player, false, 0, 0, NOOP_FX, TUNABLES);
    const after = useGameStore.getState().projectiles.find(x => x.id === proj.id);
    // 反射されていない=残っていれば reflected が立っていない / 消えていれば「当たった」側
    expect(after?.reflected ?? false).toBe(false);
  });

  it('noCounter を付けない弾は従来どおり反射される(既存の弾を1bitも変えていないことの裏取り)', () => {
    const proj = hostileProjAt({ x: 400, y: 400 }, undefined);
    setup(proj);
    applyEnemyProjectileHits(0, useGameStore.getState().player, false, 0, 0, NOOP_FX, TUNABLES);
    const after = useGameStore.getState().projectiles.find(x => x.id === proj.id);
    expect(after?.reflected ?? false).toBe(true);
  });
});
