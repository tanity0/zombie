// research/HERO_DOG.md: 英雄の犬の配線(出入り・噛み・ヘイト・被弾・錬金術との同居)。純関数側は utils/heroDog.test.ts。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, skillOutgoingDamageMult } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setTreesDisabled } from '../world/trees';
import { HERO_DOG_HP, HERO_DOG_RESPAWN_MS, HERO_DOG_HATE_MS, isHeroDog } from '../utils/heroDog';
import { buildSummon } from '../utils/summonUtils';

const giveHero = (full = true) => {
  useGameStore.setState(s => ({ player: { ...s.player, skills: [...s.player.skills.filter(k => k !== 'hero'), 'hero'], maxHealth: 100, health: full ? 100 : 60 } }));
};
const dog = () => useGameStore.getState().summons.find(isHeroDog);

describe('英雄の犬(store)', () => {
  beforeEach(() => { setTreesDisabled(true); useGameStore.getState().resetGame('warrior'); });

  it('スキル「英雄」+HP満タンで現れ、HPは100固定', () => {
    useGameStore.getState().updateHeroDog();
    expect(dog()).toBeUndefined();
    giveHero(true);
    useGameStore.getState().updateHeroDog();
    expect(dog()?.health).toBe(HERO_DOG_HP);
    expect(dog()?.maxHealth).toBe(100);
  });
  it('HPが満タンでなくなると去る(expiresAt)。満タンに戻れば呼び戻す', () => {
    giveHero(true); useGameStore.getState().updateHeroDog();
    giveHero(false); useGameStore.getState().updateHeroDog();
    expect(dog()?.expiresAt).toBeDefined();
    giveHero(true); useGameStore.getState().updateHeroDog();
    expect(dog()?.expiresAt).toBeUndefined();
    expect(useGameStore.getState().summons.filter(isHeroDog).length).toBe(1);
  });
  it('死ぬと消え、10秒後に戻る', () => {
    giveHero(true); useGameStore.getState().updateHeroDog();
    const d = dog()!;
    useGameStore.setState({ gameTime: 5000 });
    useGameStore.getState().damageSummon(d.id, 999, d.x - 50, d.y);
    expect(dog()).toBeUndefined();
    expect(useGameStore.getState().heroDogRespawnAt).toBe(5000 + HERO_DOG_RESPAWN_MS);
    useGameStore.getState().updateHeroDog();
    expect(dog()).toBeUndefined();
    useGameStore.setState({ gameTime: 5000 + HERO_DOG_RESPAWN_MS });
    useGameStore.getState().updateHeroDog();
    expect(dog()?.health).toBe(100);
  });
  it('噛むと敵が犬を追う(dogHateUntil)。噛みは「跳んで→届いてから」で、威力はスキル倍率を受けない', () => {
    giveHero(true); useGameStore.getState().updateHeroDog();
    const d0 = dog()!;
    // 横に着いた状態にする(着くまでは狩りに出ない)
    useGameStore.setState(s => ({ summons: s.summons.map(x => x.id === d0.id ? { ...x, heroDogSettled: true } : x) }));
    const d = dog()!;
    const e = spawnEnemyAt('zombie', 0, 0, 0);
    e.x = d.x + d.width / 2 + 20 - e.width / 2; e.y = d.y + d.height / 2 - e.height / 2;
    useGameStore.setState({ enemies: [e], gameTime: 1000 });
    const hp0 = e.health;
    useGameStore.getState().updateSummons(0.016);
    // 1フレーム目=跳び付き開始(まだ噛んでいない)
    expect(useGameStore.getState().enemies.find(x => x.id === e.id)!.health).toBe(hp0);
    expect(dog()?.biteLungeUntil).toBeDefined();
    // 届く=跳び付き中に間合いの内側(0.6倍)へ入る/時間切れ → 噛む
    for (let i = 0; i < 12; i++) useGameStore.getState().updateSummons(0.016);
    const after = useGameStore.getState().enemies.find(x => x.id === e.id)!;
    expect(after.health).toBe(hp0 - d.damage);
    expect(after.dogHateUntil).toBe(1000 + HERO_DOG_HATE_MS);
    expect(dog()?.biteTargetId).toBe(e.id);
    expect(dog()?.biteLungeUntil).toBeUndefined();
  });
  it('強個体(パンプキン)に噛まれ判定が立ち、犬を追う(isBossType ではなく本物のボスだけ除く)', async () => {
    const { resolveEnemyTarget } = await import('../utils/enemyUtils');
    giveHero(true); useGameStore.getState().updateHeroDog();
    const d0 = dog()!;
    useGameStore.setState(s => ({ summons: s.summons.map(x => x.id === d0.id ? { ...x, heroDogSettled: true } : x) }));
    const d = dog()!;
    const e = spawnEnemyAt('pumpkin', 0, 0, 0);
    e.x = d.x + d.width / 2 + 20 - e.width / 2; e.y = d.y + d.height / 2 - e.height / 2;
    useGameStore.setState({ enemies: [e], gameTime: 1000 });
    for (let i = 0; i < 14; i++) useGameStore.getState().updateSummons(0.016);
    const after = useGameStore.getState().enemies.find(x => x.id === e.id)!;
    expect(after.dogHateUntil).toBe(1000 + HERO_DOG_HATE_MS);
    const p = useGameStore.getState().player;
    const t = resolveEnemyTarget({ ...after, x: p.x + 500, y: p.y }, p, useGameStore.getState().summons, 380, false, 1000);
    expect(t.isSummon).toBe(true);
  });
  it('ドッグの拾い物を代行中は敵を狙わず拾い物へ走る', () => {
    giveHero(true); useGameStore.getState().updateHeroDog();
    const d0 = dog()!;
    useGameStore.setState(s => ({ summons: s.summons.map(x => x.id === d0.id ? { ...x, heroDogSettled: true, vx: 0, vy: 0 } : x) }));
    const d = dog()!;
    const e = spawnEnemyAt('zombie', 0, 0, 0);
    e.x = d.x + d.width / 2 + 20 - e.width / 2; e.y = d.y + d.height / 2 - e.height / 2;
    const fx = d.x + d.width / 2 - 200, fy = d.y + d.height / 2;
    useGameStore.setState({ enemies: [e], gameTime: 1000, heroDogFetch: { x: fx, y: fy } });
    const hp0 = e.health;
    for (let i = 0; i < 6; i++) useGameStore.getState().updateSummons(0.016);
    expect(useGameStore.getState().enemies.find(x => x.id === e.id)!.health).toBe(hp0);
    expect(dog()!.vx).toBeLessThan(0); // 拾い物(左)へ
    expect(dog()!.biteTargetId).toBeUndefined();
  });
  it('錬金術の召喚攻撃ボーナスに犬は数えない/錬金術の召喚で犬は消えない', () => {
    giveHero(true); useGameStore.getState().updateHeroDog();
    const p = useGameStore.getState().player;
    const withDog = skillOutgoingDamageMult(p);
    useGameStore.setState({ summons: [] });
    expect(skillOutgoingDamageMult(p)).toBeCloseTo(withDog);
    useGameStore.getState().updateHeroDog();
    const unit = buildSummon(1, 'normal', p.x, p.y);
    useGameStore.setState(s => ({ summons: [...s.summons, unit] }));
    expect(useGameStore.getState().summons.some(isHeroDog)).toBe(true);
  });
  it('去りかけの犬は敵の接触で傷つかない', () => {
    giveHero(true); useGameStore.getState().updateHeroDog();
    giveHero(false); useGameStore.getState().updateHeroDog();
    const d = dog()!;
    useGameStore.getState().damageSummon(d.id, 50, d.x - 50, d.y);
    expect(dog()?.health).toBe(100);
  });
});

describe('英雄の犬: 社長指示2026-10-15(噛みのKB・撃破を段へ・ボスのヘイト)', () => {
  beforeEach(() => { setTreesDisabled(true); useGameStore.getState().resetGame('warrior'); });
  const settle = () => {
    giveHero(true); useGameStore.getState().updateHeroDog();
    const d0 = dog()!;
    useGameStore.setState(s => ({ summons: s.summons.map(x => x.id === d0.id ? { ...x, heroDogSettled: true } : x) }));
    return dog()!;
  };
  const putEnemy = (type: 'zombie' | 'giantbat', d: ReturnType<typeof dog> & object, hp: number) => {
    const e = spawnEnemyAt(type, 0, 0, 0);
    e.x = d.x + d.width / 2 + 20 - e.width / 2; e.y = d.y + d.height / 2 - e.height / 2;
    e.health = hp; e.maxHealth = Math.max(e.maxHealth, hp);
    return e;
  };
  it('噛みで敵が犬から離れる向きへノックバックする', () => {
    const d = settle();
    const e = putEnemy('zombie', d, 400);
    useGameStore.setState({ enemies: [e], gameTime: 1000 });
    for (let i = 0; i < 14; i++) useGameStore.getState().updateSummons(0.016);
    const after = useGameStore.getState().enemies.find(x => x.id === e.id)!;
    expect(after.health).toBeLessThan(400);
    expect((after.knockbackVx ?? 0)).toBeGreaterThan(0); // 犬は左・敵は右 → 右へ
  });
  it('犬の噛みで倒すと連続撃破の段に数える', () => {
    const d = settle();
    const e = putEnemy('zombie', d, 1);
    useGameStore.setState({ enemies: [e], gameTime: 1000, killChainCount: 0 });
    for (let i = 0; i < 14; i++) useGameStore.getState().updateSummons(0.016);
    expect(useGameStore.getState().killChainCount).toBe(1);
  });
  it('犬の噛みはボスのヘイト(hateDogBuckets)に積まれ、狙いの相手に犬が選ばれる', async () => {
    const { resolveBossHateAim } = await import('../utils/bossHate');
    const d = settle();
    const boss = spawnEnemyAt('giantbat', 0, 0, 0);
    boss.x = d.x + 200; boss.y = d.y; boss.health = 5000; boss.maxHealth = 5000;
    useGameStore.setState({ enemies: [boss], gameTime: 1000 });
    useGameStore.getState().damageEnemy(boss.id, 50, false, false, false, 'dot', 'dog');
    const after = useGameStore.getState().enemies.find(x => x.id === boss.id)!;
    expect(after.hateDogBuckets?.length ?? 0).toBeGreaterThan(0);
    const p = useGameStore.getState().player;
    const aim = resolveBossHateAim(after, { x: p.x + p.width / 2 + 2000, y: p.y }, useGameStore.getState().summons, 1000);
    expect(aim.side).toBe('dog');
  });
});
