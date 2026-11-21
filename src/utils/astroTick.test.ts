// research/ASTRONAUT_HORDE.md: 宇宙飛行群の制御(astroTick)と投げた物の台帳を、store の上で実際に回して確かめる
// (bountyTick.test.ts と同じ作法=resetGame→盤面を作り tick を手で進める)。描画は対象外。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { spawnEnemyAt } from './enemyUtils';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import { runAstroTick, createAstroTickState, runAstroThrows, releaseAstroOwner } from './astroTick';
import { astroHitOffsetMs, ASTRO_RELEASE_MS, type AstroThrowEntry } from './astroScript';

const START_GT = 10_000_000;

const setup = () => {
  const st0 = useGameStore.getState();
  const gb = st0.gameBounds;
  // プレイヤー(原点)の上 300px に浮かせて置き、見つけている所から始める。カメラはプレイヤーが真ん中。
  const e = spawnEnemyAt('mutant-astro', -55, -330, START_GT);
  Object.assign(e, { dormant: false, fixed: true, libAlerted: true, astroHoverFrame: 10, astroHoverAcc: 0, astroHoverDir: -1, heroFaceX: -1, lastHit: 0 });
  useGameStore.setState(s => ({
    enemies: [e],
    player: { ...s.player, x: -s.player.width / 2, y: -s.player.height / 2, health: 500, maxHealth: 1000 },
    camera: { x: -gb.width / 2, y: -gb.height / 2 },
    viewZoom: 1,
    astroThrows: [],
    pumpkinBlasts: [],
    gameTime: START_GT,
  }));
  let gt = START_GT;
  const s = createAstroTickState();
  const step = (ms: number): void => {
    gt += ms;
    useGameStore.setState({ gameTime: gt, pumpkinBlasts: [] });
    const cur = useGameStore.getState().enemies.find(x => x.id === e.id);
    if (cur && cur.health > 0) runAstroTick(cur, s, gt, ms / 1000, gt);
    releaseAstroOwner(s, gt);
    runAstroThrows(gt);
  };
  const me = () => useGameStore.getState().enemies.find(x => x.id === e.id);
  return { id: e.id, s, step, gt: () => gt, me };
};

/** 投げ始めまで進める(着地し切ってから投げる)。 */
const untilThrow = (t: ReturnType<typeof setup>, limitMs = 20000): number => {
  for (let i = 0; i < limitMs / 16; i++) {
    t.step(16);
    if (t.me()?.astroThrowAt !== undefined) return t.gt();
  }
  throw new Error('投げに入らなかった');
};

describe('宇宙飛行群: 制御の流れ', () => {
  beforeEach(() => {
    setTreesDisabled(true);
    setTorchesDisabled(true);
    useGameStore.getState().resetGame('assault');
  });

  it('見つけたら間隔の後に着地して投げる。予告は投げ始めに全部積まれ、命中の時刻は設計どおり', () => {
    const t = setup();
    const start = untilThrow(t);
    const e = t.me()!;
    expect(e.astroHoverFrame).toBe(0); // 必ず着地してから
    const list = useGameStore.getState().astroThrows;
    expect(list.length).toBeGreaterThan(0);
    for (const en of list) {
      expect(en.bornAt).toBe(start);
      expect(en.releaseAt).toBe(start + ASTRO_RELEASE_MS);
      const i = en.kind === 'debris' ? Number(en.id.split('-').pop()) : 0;
      expect(en.hitAt).toBe(start + astroHitOffsetMs(en.kind, i));
    }
  });

  it('手を離す前に崩されたら、その投げは台帳から消える(赤が残って当たらない、を作らない)', () => {
    const t = setup();
    const start = untilThrow(t);
    expect(useGameStore.getState().astroThrows.length).toBeGreaterThan(0);
    useGameStore.setState(st => ({ enemies: st.enemies.map(en => en.id === t.id ? { ...en, bossFullStunUntil: start + 3000 } : en) }));
    t.step(16);
    expect(useGameStore.getState().astroThrows.length).toBe(0);
    expect(t.me()?.astroThrowAt).toBeUndefined();
  });

  it('手を離した後に崩されても、飛んでいる物は残って当たる', () => {
    const t = setup();
    const start = untilThrow(t);
    while (t.gt() < start + ASTRO_RELEASE_MS + 20) t.step(16);
    const before = useGameStore.getState().astroThrows.length;
    useGameStore.setState(st => ({ enemies: st.enemies.map(en => en.id === t.id ? { ...en, bossFullStunUntil: t.gt() + 3000 } : en) }));
    t.step(16);
    expect(useGameStore.getState().astroThrows.length).toBe(before);
  });

  it('投げ手が倒れても、離した後の物は最後まで解決される(離す前の物は消える)', () => {
    const t = setup();
    const start = untilThrow(t);
    while (t.gt() < start + ASTRO_RELEASE_MS + 20) t.step(16);
    useGameStore.setState(st => ({ enemies: st.enemies.map(en => en.id === t.id ? { ...en, health: 0 } : en) }));
    const last = Math.max(...useGameStore.getState().astroThrows.map(en => en.hitAt));
    let resolved = 0;
    while (t.gt() <= last + 20) { t.step(16); resolved = useGameStore.getState().astroThrows.filter(en => en.resolved).length; }
    expect(resolved).toBeGreaterThan(0);
  });

  it('崩れている間は降りる(逆再生で0コマへ)', () => {
    const t = setup();
    useGameStore.setState(st => ({ enemies: st.enemies.map(en => en.id === t.id ? { ...en, bossFullStunUntil: START_GT + 5000 } : en) }));
    for (let i = 0; i < 60; i++) t.step(16);
    expect(t.me()?.astroHoverFrame).toBe(0);
  });
});

describe('宇宙飛行群: 台帳の解決', () => {
  beforeEach(() => {
    setTreesDisabled(true);
    setTorchesDisabled(true);
    useGameStore.getState().resetGame('assault');
  });

  const entry = (over: Partial<AstroThrowEntry>): AstroThrowEntry => ({
    id: 'x-0', throwId: 'x', ownerId: 'gone', kind: 'missile', bornAt: 0, releaseAt: 490, hitAt: 1000,
    fromX: 0, fromY: -300, x: 0, y: 0, radius: 110, damage: 22, ...over,
  });

  it('隕石は弾けない旗つき・範囲内の敵にも当たる。ミサイルは弾ける(持ち主には返らない)', () => {
    const z = spawnEnemyAt('zombie', 100, 0, 0);
    z.dormant = false;
    const hp0 = z.health;
    useGameStore.setState({ enemies: [z], pumpkinBlasts: [], astroThrows: [
      entry({ id: 'm-0', kind: 'meteor', radius: 380, damage: 60 }),
      entry({ id: 'k-0', kind: 'missile' }),
    ] });
    runAstroThrows(1000);
    const pb = useGameStore.getState().pumpkinBlasts;
    const meteor = pb.find(b => b.moveKey === 'astro-meteor')!;
    const missile = pb.find(b => b.moveKey === 'astro-missile')!;
    expect(meteor.noParry).toBe(true);
    expect(meteor.parryLocal).toBeUndefined();
    expect(missile.parryLocal).toBe(true);
    expect(missile.noParry).toBeUndefined();
    const z1 = useGameStore.getState().enemies.find(e => e.id === z.id);
    expect(z1 === undefined || z1.health < hp0).toBe(true);
  });

  it('国旗は帯(起点=投げ始めの投げ手の位置)で当たる', () => {
    useGameStore.setState({ pumpkinBlasts: [], astroThrows: [
      entry({ kind: 'flag', capsule: { fx: 0, fy: -300, tx: 0, ty: 400, halfWidth: 18 }, x: 0, y: 400, radius: 18 }),
    ] });
    runAstroThrows(1000);
    const b = useGameStore.getState().pumpkinBlasts[0];
    expect(b.moveKey).toBe('astro-flag');
    expect(b.capsule).toEqual({ fx: 0, fy: -300, tx: 0, ty: 400, halfWidth: 18 });
    expect(b.origin).toEqual({ x: 0, y: -300 });
  });

  it('花束: 輪の中なら最大体力の5%回復(爆風は積まない)・外なら何も起きない', () => {
    useGameStore.setState(s => ({ player: { ...s.player, x: -s.player.width / 2, y: -s.player.height / 2, health: 500, maxHealth: 1000 }, pumpkinBlasts: [], astroThrows: [
      entry({ kind: 'bouquet', x: 10, y: 10, radius: 60, damage: 0 }),
    ] }));
    runAstroThrows(1000);
    expect(useGameStore.getState().player.health).toBe(550);
    expect(useGameStore.getState().pumpkinBlasts).toHaveLength(0);
    expect(useGameStore.getState().astroThrows[0].bounced).toBe(true);
    useGameStore.setState(s => ({ player: { ...s.player, health: 500 }, astroThrows: [entry({ kind: 'bouquet', x: 400, y: 0, radius: 60, damage: 0 })] }));
    runAstroThrows(1000);
    expect(useGameStore.getState().player.health).toBe(500);
  });

  it('解決した物は残る時間の後に台帳から消える', () => {
    useGameStore.setState({ astroThrows: [entry({ kind: 'missile', resolved: true })] });
    runAstroThrows(1000 + 10_000);
    expect(useGameStore.getState().astroThrows).toHaveLength(0);
  });
});
