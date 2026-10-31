import { describe, it, expect } from 'vitest';
import { enemyHitReaction, knockbackDurationMul } from '../utils/hitFlinch';
import { useGameStore, KNOCKBACK_DURATION } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { HIT_STUN_MS_MOB, HIT_STUN_MS_STRONG, KILL_CHAIN_WINDOW_MS } from '../utils/combatFeel';

// 戦闘の手触り(社長指示2026-09-13「では入れてみて」)の配線テスト: 純関数(utils/combatFeel.test.ts)ではなく
// damageEnemy / 近接経路 / updateEnemies / knockbackEnemy / registerPlayerKills に**実際に効いているか**を見る
// (実装精度の規律4)。v0.25.4269: 監査A(近接が丸ごと抜けていた/サブ起因スロー)の再発防止を追加。
const setup = () => {
  useGameStore.getState().resetGame('warrior');
  const st = useGameStore.getState();
  const px = st.player.x + st.player.width / 2;
  const py = st.player.y + st.player.height / 2;
  return { px, py, gt: st.gameTime };
};
const put = (e: ReturnType<typeof spawnEnemyAt>) => {
  useGameStore.setState(s => ({ enemies: [...s.enemies.filter(x => x.id !== e.id), e] }));
  return e.id;
};
const enemy = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;

describe('戦闘の手触り① 局所ストップ(damageEnemy→updateEnemies)', () => {
  it('雑魚はプレイヤーの銃ダメージで hitStunUntil(約60ms)が立ち、DoTでは立たない', () => {
    const { px, py, gt } = setup();
    const id = put({ ...spawnEnemyAt('zombie', px + 200, py, gt), health: 1000, maxHealth: 1000 });
    const t0 = Date.now();
    useGameStore.getState().damageEnemy(id, 5, false, false, false, 'gun', 'player');
    const u = enemy(id).hitStunUntil ?? 0;
    expect(u).toBeGreaterThanOrEqual(t0 + HIT_STUN_MS_MOB - 5);
    expect(u).toBeLessThanOrEqual(Date.now() + HIT_STUN_MS_MOB + 5);
    const id2 = put({ ...spawnEnemyAt('zombie', px + 260, py, gt), health: 1000, maxHealth: 1000 });
    useGameStore.getState().damageEnemy(id2, 5, false, false, false, 'dot', 'player');
    expect(enemy(id2).hitStunUntil).toBeUndefined();
  });

  it('連打の2発目(再発火ガード内)は止めを書き直さない', () => {
    const { px, py, gt } = setup();
    const id = put({ ...spawnEnemyAt('zombie', px + 200, py, gt), health: 1000, maxHealth: 1000 });
    useGameStore.getState().damageEnemy(id, 5, false, false, false, 'gun', 'player');
    const u1 = enemy(id).hitStunUntil;
    useGameStore.getState().damageEnemy(id, 5, false, false, false, 'gun', 'player');
    expect(enemy(id).hitStunUntil).toBe(u1);
  });

  it('強個体(pumpkin)は約40ms、ボス級(thor)は立たない', () => {
    const { px, py, gt } = setup();
    const t0 = Date.now();
    const idP = put({ ...spawnEnemyAt('pumpkin', px + 300, py, gt), health: 100000, maxHealth: 100000 });
    useGameStore.getState().damageEnemy(idP, 5, false, false, false, 'gun', 'player');
    const uP = enemy(idP).hitStunUntil ?? 0;
    expect(uP).toBeGreaterThanOrEqual(t0 + HIT_STUN_MS_STRONG - 5);
    expect(uP).toBeLessThanOrEqual(Date.now() + HIT_STUN_MS_STRONG + 5);
    const idT = put({ ...spawnEnemyAt('thor', px + 400, py, gt), health: 100000, maxHealth: 100000 });
    useGameStore.getState().damageEnemy(idT, 5, false, false, false, 'gun', 'player');
    expect(enemy(idT).hitStunUntil).toBeUndefined();
  });

  it('止まっている間は updateEnemies で動かない(期限はずらさない=書き手が足す)', () => {
    const { px, py, gt } = setup();
    const far = Date.now() + 100000;
    const id = put({
      ...spawnEnemyAt('zombie', px + 200, py, gt), health: 1000, maxHealth: 1000,
      hitStunUntil: far, knockbackUntil: far + 280, knockbackVx: 200, knockbackVy: 0,
    });
    const before = enemy(id);
    useGameStore.getState().updateEnemies(1 / 60);
    const after = enemy(id);
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    expect(after.knockbackUntil).toBe(before.knockbackUntil);
  });

  it('knockbackEnemy は止めの残りぶんノックバックの期限を後ろへずらす(止めが明けてから満額で飛ぶ)', () => {
    const { px, py, gt } = setup();
    const id = put({ ...spawnEnemyAt('zombie', px + 200, py, gt), health: 1000, maxHealth: 1000 });
    useGameStore.getState().damageEnemy(id, 5, false, false, false, 'gun', 'player');
    const stunUntil = enemy(id).hitStunUntil ?? 0;
    const t0 = Date.now();
    useGameStore.getState().knockbackEnemy(id, 1, 0, 1, 3);
    const kb = enemy(id).knockbackUntil ?? 0;
    // ★v0.25.4453: ノックバックの**長さ自体がのけぞりと連動**するようになった
    // (社長指示2026-09-17「のけぞりとノックバックは連動」= `knockbackDurationMul`)。
    // 旧テストは `KNOCKBACK_DURATION` 固定を縛っていたので、軽い一撃(rDur<1)で落ちる。
    // 縛るのは「**止めの残りぶん後ろへずれる**」という手触りの方=ずらし幅そのものを見る。
    const kbDur = KNOCKBACK_DURATION * knockbackDurationMul(enemyHitReaction(enemy(id)));
    expect(kb).toBeGreaterThanOrEqual(stunUntil + kbDur - 2);
    expect(kb).toBeLessThanOrEqual(t0 + HIT_STUN_MS_MOB + kbDur + 5);
    // 止めていない敵は「今から」= ずらしが乗らない(同じのけぞりでも期限が止め残りぶん手前)
    const id2 = put({ ...spawnEnemyAt('zombie', px + 260, py, gt), health: 1000, maxHealth: 1000 });
    const t1 = Date.now();
    useGameStore.getState().knockbackEnemy(id2, 1, 0, 1, 3);
    const kb2Dur = KNOCKBACK_DURATION * knockbackDurationMul(enemyHitReaction(enemy(id2)));
    expect(enemy(id2).knockbackUntil ?? 0).toBeLessThanOrEqual(t1 + kb2Dur + 5);
  });
});

describe('戦闘の手触り①② 近接経路(damageEnemy を通らない survivors.push)にも効く(監査A是正)', () => {
  it('刀(performKatanaStrike・本人): 生存した敵に止めが立ち、倒した数が段へ積まれる', () => {
    const { px, py, gt } = setup();
    useGameStore.setState(s => ({ player: { ...s.player, subWeapons: [...s.player.subWeapons, 'katana'] } })); // 刀モードでないと performKatanaStrike は即 return
    const tough = put({ ...spawnEnemyAt('zombie', px + 40, py, gt), health: 100000, maxHealth: 100000 });
    const weak1 = put({ ...spawnEnemyAt('zombie', px + 50, py + 10, gt), health: 1, maxHealth: 1 });
    const weak2 = put({ ...spawnEnemyAt('zombie', px + 60, py - 10, gt), health: 1, maxHealth: 1 });
    const weak3 = put({ ...spawnEnemyAt('zombie', px + 30, py + 20, gt), health: 1, maxHealth: 1 });
    const t0 = Date.now();
    const r = useGameStore.getState().performKatanaStrike([tough, weak1, weak2, weak3], 1, false);
    expect(r.killed).toBe(3);
    expect(enemy(tough).hitStunUntil ?? 0).toBeGreaterThanOrEqual(t0 + HIT_STUN_MS_MOB - 5);
    expect(enemy(tough).knockbackUntil ?? 0).toBeGreaterThanOrEqual((enemy(tough).hitStunUntil ?? 0) + KNOCKBACK_DURATION - 2);
    const s = useGameStore.getState();
    expect(s.killChainCount).toBe(3);
    expect(s.killChainTier).toBe(1);
  });
});

describe('戦闘の手触り② 連続撃破の段(registerPlayerKills / damageEnemy)', () => {
  it('銃のキルで数が積まれ、3体目で段1・段が上がった瞬間だけ tierAt が更新される', () => {
    const { px, py, gt } = setup();
    const kill = (i: number) => {
      const id = put({ ...spawnEnemyAt('zombie', px + 200 + i * 40, py, gt), health: 1, maxHealth: 1 });
      return useGameStore.getState().damageEnemy(id, 5, false, false, false, 'gun', 'player');
    };
    expect(kill(0)).toBe(true);
    expect(kill(1)).toBe(true);
    let s = useGameStore.getState();
    expect(s.killChainCount).toBe(2);
    expect(s.killChainTier).toBe(0);
    const tierAtBefore = s.killChainTierAt;
    expect(kill(2)).toBe(true);
    s = useGameStore.getState();
    expect(s.killChainCount).toBe(3);
    expect(s.killChainTier).toBe(1);
    expect(s.killChainTierAt).toBeGreaterThan(tierAtBefore);
    const tierAt1 = s.killChainTierAt;
    expect(kill(3)).toBe(true);
    s = useGameStore.getState();
    expect(s.killChainTier).toBe(1);
    expect(s.killChainTierAt).toBe(tierAt1); // 同じ段の内側では動かない
  });

  it('窓(2.5秒)を過ぎたキルは1から数え直す', () => {
    const { px, py, gt } = setup();
    useGameStore.setState({ killChainCount: 7, killChainLastAt: Date.now() - KILL_CHAIN_WINDOW_MS - 50, killChainTier: 2 });
    const id = put({ ...spawnEnemyAt('zombie', px + 200, py, gt), health: 1, maxHealth: 1 });
    useGameStore.getState().damageEnemy(id, 5, false, false, false, 'gun', 'player');
    const s = useGameStore.getState();
    expect(s.killChainCount).toBe(1);
    expect(s.killChainTier).toBe(0);
  });

  it('護衛NPCの弾(damageChannel=null)は止めもせず数えもせず、画面も揺らさない(監査2巡目A-3・社長指示2026-09-13)', () => {
    const { px, py, gt } = setup();
    const id = put({ ...spawnEnemyAt('zombie', px + 200, py, gt), health: 1000, maxHealth: 1000 });
    useGameStore.setState({ shakeUntil: 0 });
    useGameStore.getState().damageEnemy(id, 5, false, false, false, null, 'player');
    expect(enemy(id).hitStunUntil).toBeUndefined();
    expect(useGameStore.getState().shakeUntil).toBe(0); // 非銃シェイク(v0.25.4267)も出ない
    const id2 = put({ ...spawnEnemyAt('zombie', px + 240, py, gt), health: 1, maxHealth: 1 });
    useGameStore.getState().damageEnemy(id2, 5, false, false, false, null, 'player');
    expect(useGameStore.getState().killChainCount).toBe(0);
  });

  it('killChainSlowOk=false なら銃チャネルでも10体スローは出ない(タレット榴弾・監査2巡目A-4)', () => {
    const { px, py, gt } = setup();
    useGameStore.setState({ killChainCount: 9, killChainLastAt: Date.now(), killChainTier: 2, timeSlowUntil: 0 });
    const id = put({ ...spawnEnemyAt('zombie', px + 200, py, gt), health: 1, maxHealth: 1 });
    useGameStore.getState().damageEnemy(id, 5, false, false, false, 'gun', 'player', null, 1, null, false);
    expect(useGameStore.getState().killChainTier).toBe(3);
    expect(useGameStore.getState().timeSlowUntil).toBe(0);
  });

  it('守護霊側(hateSource=ghost)のキルは数えない', () => {
    const { px, py, gt } = setup();
    const id = put({ ...spawnEnemyAt('zombie', px + 200, py, gt), health: 1, maxHealth: 1 });
    useGameStore.getState().damageEnemy(id, 5, false, false, false, 'other', 'ghost');
    expect(useGameStore.getState().killChainCount).toBe(0);
  });

  it('10体目のスロー: 銃チャネルのキルでは出る・サブウェポン系(other チャネル=投げナイフ/犬/爆発)では出ない', () => {
    const { px, py, gt } = setup();
    // 9体まで積んだ状態 → 10体目を 'other'(投げナイフ等)で倒す → スロー無し
    useGameStore.setState({ killChainCount: 9, killChainLastAt: Date.now(), killChainTier: 2, timeSlowUntil: 0 });
    const idA = put({ ...spawnEnemyAt('zombie', px + 200, py, gt), health: 1, maxHealth: 1 });
    useGameStore.getState().damageEnemy(idA, 5, false, false, false, 'other', 'player');
    expect(useGameStore.getState().killChainTier).toBe(3);
    expect(useGameStore.getState().timeSlowUntil).toBe(0);
    // 銃で10体目 → スロー
    useGameStore.setState({ killChainCount: 9, killChainLastAt: Date.now(), killChainTier: 2, timeSlowUntil: 0 });
    const idB = put({ ...spawnEnemyAt('zombie', px + 240, py, gt), health: 1, maxHealth: 1 });
    useGameStore.getState().damageEnemy(idB, 5, false, false, false, 'gun', 'player');
    expect(useGameStore.getState().timeSlowUntil).toBeGreaterThan(Date.now() - 5);
  });
});

describe('戦闘の手触り③ 反動(triggerKick / spawnCasing / updateEffects の床)', () => {
  it('triggerKick は単位ベクトルとオーバーシュートを保存する', () => {
    setup();
    const t0 = Date.now();
    useGameStore.getState().triggerKick(6, 120, -3, 0, 0.15);
    const s = useGameStore.getState();
    expect(s.kickMag).toBe(6);
    expect(s.kickDur).toBe(120);
    expect(s.kickOver).toBe(0.15);
    expect(Math.hypot(s.kickDirX, s.kickDirY)).toBeCloseTo(1, 6);
    expect(s.kickDirX).toBeLessThan(-0.9); // 逆向き(垂直ぶれは最大±25%)
    expect(s.kickUntil).toBeGreaterThanOrEqual(t0 + 120);
  });
  it('spawnCasing は側ごとに床つきの固体粒を作り、updateEffects で床に達すると止まる', () => {
    setup();
    const n0 = useGameStore.getState().effects.length;
    useGameStore.getState().spawnCasing(0, 0, 1, 0, ['#d4a03a'], 2.2, [1, -1]);
    let fx = useGameStore.getState().effects;
    expect(fx.length).toBe(n0 + 2);
    const c = fx[fx.length - 1];
    expect(c.kind).toBe('particle');
    if (c.kind !== 'particle') return;
    expect(c.solid).toBe(true);
    expect(c.gravity ?? 0).toBeGreaterThan(0);
    expect(c.floorY ?? -1).toBeGreaterThan(0);
    expect(c.restedAt).toBeUndefined();
    // 床の下に置いて小さな速度で1歩 → 止まる
    useGameStore.setState(s => ({ effects: s.effects.map(e => e.id === c.id && e.kind === 'particle' ? { ...e, y: (e.floorY ?? 0) + 1, vy: 30, vx: 10 } : e) }));
    useGameStore.getState().updateEffects(1 / 60);
    fx = useGameStore.getState().effects;
    const c2 = fx.find(e => e.id === c.id);
    expect(c2 && c2.kind === 'particle' ? c2.restedAt : undefined).toBeDefined();
    expect(c2 && c2.kind === 'particle' ? c2.vy : 1).toBe(0);
  });
});
