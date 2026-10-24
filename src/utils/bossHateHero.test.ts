// research/MUTANT_HERO.md §3-2(社長指示2026-10-17「(ボスにも英雄を)狙わせる」): ボスの狙いの候補に英雄を入れる。
import { describe, it, expect } from 'vitest';
import {
  addHateDamage, pickHateTarget, resolveBossHateAim, resolveBossLockedHateAim,
  type PickHateTargetInput, type HateHeroSource,
} from './bossHate';

const base = (o: Partial<PickHateTargetInput> = {}): PickHateTargetInput => ({
  enemyCenter: { x: 0, y: 0 },
  player: { x: 300, y: 0 },
  ghost: null,
  escorts: [],
  playerHateBuckets: undefined, ghostHateBuckets: undefined, escortHateBuckets: undefined,
  gameTime: 1000, currentTarget: undefined,
  ...o,
});
const boss = (o: Record<string, unknown> = {}) => ({ id: 'boss', x: -50, y: -50, width: 100, height: 100, ...o });
const NO_ESC = { inView: [], alive: [] };
const heroAt = (x: number, y: number, inView = true): HateHeroSource => {
  const c = { id: 'hero', x, y, vx: 30, vy: -10, footY: y + 40 };
  return { inView: inView ? c : null, alive: c };
};

describe('ボスの狙い: 英雄も候補', () => {
  it('誰もまだ殴っていない時は、英雄がいちばん近ければ英雄', () => {
    expect(pickHateTarget(base({ hero: { x: 100, y: 0 } }))).toBe('hero');
    expect(pickHateTarget(base({ hero: { x: 500, y: 0 } }))).toBe('player');
  });
  it('英雄はダメージを見ず近さで決まる: プレイヤーが殴り続けていても、英雄の方が近ければ英雄', () => {
    const playerHateBuckets = addHateDamage(undefined, 1000, 5000);
    expect(pickHateTarget(base({ hero: { x: 250, y: 0 }, playerHateBuckets }))).toBe('hero');
    expect(pickHateTarget(base({ hero: { x: 350, y: 0 }, playerHateBuckets }))).toBe('player');
  });
  it('今の相手が英雄なら、少し遠くなっても英雄のまま(行ったり来たりしない)', () => {
    expect(pickHateTarget(base({ hero: { x: 350, y: 0 }, currentTarget: 'hero' }))).toBe('hero'); // 300×1.3=390 まで
    expect(pickHateTarget(base({ hero: { x: 400, y: 0 }, currentTarget: 'hero' }))).toBe('player');
  });
  it('英雄より近い守護霊・軍人が居れば、英雄ではなく従来の決め方', () => {
    expect(pickHateTarget(base({ hero: { x: 250, y: 0 }, ghost: { x: 100, y: 0 } }))).toBe('ghost');
  });
  it('resolveBossHateAim: 英雄を選んだら英雄の中心・速度・足元を返す', () => {
    const aim = resolveBossHateAim(boss(), { x: 400, y: 0 }, [], 1000, NO_ESC, heroAt(80, 0));
    expect(aim).toEqual({ x: 80, y: 0, side: 'hero', hero: { vx: 30, vy: -10, footY: 40 } });
  });
  it('画面外の英雄は候補にしない', () => {
    expect(resolveBossHateAim(boss(), { x: 400, y: 0 }, [], 1000, NO_ESC, heroAt(80, 0, false)).side).toBe('player');
  });
  it('英雄自身は自分を狙わない', () => {
    const aim = resolveBossHateAim(boss({ id: 'hero' }), { x: 400, y: 0 }, [], 1000, NO_ESC, heroAt(80, 0));
    expect(aim.side).toBe('player');
  });
  it('技の途中は英雄を追い続ける(画面外でも)・居なくなればプレイヤーへ戻る', () => {
    const b = boss({ hateTarget: 'hero' });
    expect(resolveBossLockedHateAim(b, { x: 400, y: 0 }, [], NO_ESC, heroAt(900, 0, false)).side).toBe('hero');
    expect(resolveBossLockedHateAim(b, { x: 400, y: 0 }, [], NO_ESC, { inView: null, alive: null })).toEqual({ x: 400, y: 0, side: 'player' });
  });
  it('英雄が居なければ従来どおり(プレイヤー)', () => {
    expect(resolveBossHateAim(boss(), { x: 400, y: 0 }, [], 1000, NO_ESC, { inView: null, alive: null }).side).toBe('player');
  });
});
