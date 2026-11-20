// 鞭の追加攻撃(research/WHIP_FOLLOWUP.md §4 受け入れ条件)をストアを動かして固める。
//  (社長 2026-11-20 改定) 当たった振りから300ms以内の反対フリック=当たった雑魚を浮かせつつ手前40pxへ寄せる(ボス級は動かない・浮かない)/
//  その直後300ms以内の進行方向フリック=浮いている敵を叩き落として2倍ダメージ(ボス級は当たりだけ)/1段目を飛ばした進行方向は何も起きない/
//  引き寄せ〜叩き落としの間はプレイヤーの位置と向きが固定/300ms過ぎ・空振り・横向き=何も起きない/1撃目は今のまま。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, WHIP_KNOCKBACK_SPEED } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { brawlerAirborne } from '../utils/brawlerCombo';
import { WHIP_FOLLOWUP_WINDOW_MS, whipZakoApexDelayMs } from '../utils/whipFollowup';
import { COUNTER_LIFT_MOVE } from '../utils/airLift';
import { WHIP_PULL_GAP_PX, WHIP_PULL_MS } from '../utils/whipFollowup';

let now = 13_000_000;
const NO = { up: false, down: false, left: false, right: false } as never;
const center = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const place = (type: EnemyType, dx: number, dy: number, id: string): Enemy => {
  const c = center();
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  return { ...e, x: c.x + dx - e.width / 2, y: c.y + dy - e.height / 2, id, health: 99999, maxHealth: 99999, dormant: false } as Enemy;
};
const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;
const step = (ms = 10) => {
  now += ms;
  useGameStore.setState(st => ({ gameTime: st.gameTime + ms }));
  useGameStore.getState().movePlayer(NO, ms / 1000);
  useGameStore.getState().updateEnemies(ms / 1000);
};
const run = (ms: number) => { const end = now + ms; while (now < end) step(10); };
const swing = () => useGameStore.getState().triggerCounter();
/** 敵の縁とプレイヤーの縁の間(横並び)。 */
const gapX = (id: string) => { const p = useGameStore.getState().player; const e = en(id); return e.x - (p.x + p.width); };

beforeEach(() => {
  now = 13_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // クリを出さない
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: false }, breakableProps: [],
    player: { ...st.player, subWeapons: ['whip'], whipCharged: false, whipHitCount: 0, counterCooldownEnd: 0, pendingSwingAt: 0, lastDirection: { x: 1, y: 0 }, health: 9999, maxHealth: 9999 },
  }));
});
afterEach(() => { vi.restoreAllMocks(); });

describe('受付', () => {
  it('当たった振りで受付が開く(向き=振りの向き・当たった敵)。空振りでは開かない', () => {
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z')] });
    swing();
    const w = useGameStore.getState().whipFollowup!;
    expect(w.hitAt).toBe(now);
    expect(w.dirX).toBeCloseTo(1);
    expect(w.hitIds).toEqual(['z']);
    useGameStore.setState(st => ({ enemies: [], player: { ...st.player, counterCooldownEnd: 0 } }));
    swing();
    expect(useGameStore.getState().whipFollowup).toBeNull();
  });
  it('1撃目は今のまま(押しは振りに直交する鞭の押し)', () => {
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z')] });
    swing();
    const z = en('z');
    expect(z.health).toBeLessThan(99999);
    expect(Math.hypot(z.knockbackVx ?? 0, z.knockbackVy ?? 0)).toBeCloseTo(WHIP_KNOCKBACK_SPEED);
    expect(Math.abs(z.knockbackVx ?? 0)).toBeLessThan(1e-6);
  });
});

describe('反対フリック=引き寄せ', () => {
  it('200msの反対フリックで、当たった雑魚が手前40pxへ寄る。ボス級は動かない。追加ダメージ無し', () => {
    useGameStore.setState({ enemies: [place('zombie', 120, 0, 'z'), place('hunter', 120, 40, 'h')] });
    swing();
    expect(useGameStore.getState().whipFollowup!.hitIds).toEqual(expect.arrayContaining(['z', 'h']));
    run(200);
    const hpZ = en('z').health;
    const hBefore = { x: en('h').x, y: en('h').y };
    const pc = center();
    const dH0 = Math.hypot(en('h').x + en('h').width / 2 - pc.x, en('h').y + en('h').height / 2 - pc.y);
    expect(useGameStore.getState().tryWhipFollowup(-1, 0)).toBe(true);
    expect(en('z').whipPull).toBeDefined();
    expect(en('h').whipPull).toBeUndefined();
    run(WHIP_PULL_MS + 60);
    const z = en('z');
    expect(z.whipPull).toBeUndefined();
    // 寄った: 手前40px(縁と縁)。引き寄せの線はプレイヤーの中心→敵の中心なので、横並びの縁の間で測る。
    const p = useGameStore.getState().player;
    const zc = { x: z.x + z.width / 2, y: z.y + z.height / 2 };
    const pcx = p.x + p.width / 2, pcy = p.y + p.height / 2;
    const d = Math.hypot(zc.x - pcx, zc.y - pcy);
    const ux = (zc.x - pcx) / d, uy = (zc.y - pcy) / d;
    const edge = d - (Math.abs(ux) * p.width + Math.abs(uy) * p.height) / 2 - (Math.abs(ux) * z.width + Math.abs(uy) * z.height) / 2;
    expect(edge).toBeGreaterThan(WHIP_PULL_GAP_PX - 4);
    expect(edge).toBeLessThan(WHIP_PULL_GAP_PX + 4);
    expect(z.health).toBe(hpZ); // 引き寄せるだけ
    // ボス級は寄らない(引き寄せの欄が付かない=プレイヤーへ近づかない)。
    const h = en('h');
    const dH1 = Math.hypot(h.x + h.width / 2 - pc.x, h.y + h.height / 2 - pc.y);
    expect(dH1).toBeGreaterThanOrEqual(dH0 - 1);
    expect(h.x === hBefore.x && h.y === hBefore.y || dH1 >= dH0 - 1).toBe(true);
    // 1振りに1回だけ(引き寄せ直しは無い。この時刻は叩き落としの受付の中=進行方向なら叩き落としになる)。
    expect(useGameStore.getState().tryWhipFollowup(-1, 0)).toBe(false);
  });
  it('強個体は雑魚と同じに寄る', () => {
    useGameStore.setState({ enemies: [place('driller', 130, 0, 'd')] });
    swing();
    run(100);
    expect(useGameStore.getState().tryWhipFollowup(-1, 0.2)).toBe(true);
    run(WHIP_PULL_MS + 60);
    expect(gapX('d')).toBeLessThan(WHIP_PULL_GAP_PX + 20);
  });
});

describe('2段目: 進行方向フリック=叩き落とし', () => {
  it('引き寄せた直後の進行方向で、浮いている敵を叩き落とし、1撃目の2倍以上のダメージ(空中の倍率も乗る)。押しはしない', () => {
    useGameStore.setState({ enemies: [place('zombie', 120, 0, 'z')] });
    swing();
    const loss1 = 99999 - en('z').health;
    expect(loss1).toBeGreaterThan(0);
    run(100);
    expect(useGameStore.getState().tryWhipFollowup(-1, 0)).toBe(true);
    expect(brawlerAirborne(en('z'), now)).toBe(true); // 浮かせつつ
    expect(useGameStore.getState().whipFollowup?.stage).toBe('pulled');
    run(150);
    expect(brawlerAirborne(en('z'), now)).toBe(true);
    const hp0 = en('z').health;
    expect(useGameStore.getState().tryWhipFollowup(1, 0.1)).toBe(true);
    const loss2 = hp0 - en('z').health;
    expect(loss2).toBeGreaterThanOrEqual(loss1 * 2 - 1e-6);
    expect(en('z').brLiftDown).toBe(true); // 叩き落とし
    expect(en('z').knockbackVx ?? 0).toBe(0);
    expect(en('z').whipPull).toBeUndefined();
    expect(useGameStore.getState().tryWhipFollowup(1, 0)).toBe(false); // 1回だけ
    // 通信の下の技の行(刀の一閃/燕返しと同じ線): 引き寄せ→叩きつけ の順に1行ずつ。
    const keys = useGameStore.getState().skillProcFeed.map(r => r.key);
    expect(keys.filter(k => k === 'tech:whippull')).toHaveLength(1);
    expect(keys.filter(k => k === 'tech:whipslam')).toHaveLength(1);
    expect(keys.indexOf('tech:whippull')).toBeLessThan(keys.indexOf('tech:whipslam'));
  });
  it('浮きが終わった(着地した)敵には何も起きない', () => {
    useGameStore.setState({ enemies: [place('zombie', 120, 0, 'z')] });
    swing();
    run(50);
    useGameStore.getState().tryWhipFollowup(-1, 0);
    run(whipZakoApexDelayMs(COUNTER_LIFT_MOVE) + 10); // 受付が開いた後
    useGameStore.setState(st => ({ enemies: st.enemies.map(e => ({ ...e, brLiftUntil: now - 1, liftUntil: now - 1 })) }));
    const hp0 = en('z').health;
    expect(useGameStore.getState().tryWhipFollowup(1, 0)).toBe(false);
    expect(en('z').health).toBe(hp0);
  });
  it('ボス級: 1段目は動かず浮かず、2段目は当たりだけ2倍', () => {
    useGameStore.setState({ enemies: [place('hunter', 120, 0, 'h')] });
    swing();
    const loss1 = 99999 - en('h').health;
    run(50);
    const x0 = en('h').x;
    expect(useGameStore.getState().tryWhipFollowup(-1, 0)).toBe(true);
    expect(brawlerAirborne(en('h'), now)).toBe(false);
    // ボス級だけ=雑魚の頂点と同じ間合いで開く。
    expect(useGameStore.getState().whipFollowup!.hitAt).toBe(now + whipZakoApexDelayMs(COUNTER_LIFT_MOVE));
    run(whipZakoApexDelayMs(COUNTER_LIFT_MOVE) + 10);
    expect(en('h').whipPull).toBeUndefined();
    const hp0 = en('h').health;
    expect(useGameStore.getState().tryWhipFollowup(1, 0)).toBe(true);
    expect(hp0 - en('h').health).toBeGreaterThanOrEqual(loss1 * 2 - 1e-6);
    void x0;
  });
  it('引き寄せを飛ばした進行方向(当たった直後)は何も起きない', () => {
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z')] });
    swing();
    run(100);
    const hp0 = en('z').health;
    expect(useGameStore.getState().tryWhipFollowup(1, 0)).toBe(false);
    expect(en('z').health).toBe(hp0);
    expect(brawlerAirborne(en('z'), now)).toBe(false);
  });
});

describe('叩き落としの受付=浮き上がり切ってから(社長「敵が浮いたのを見てから入力窓。(早すぎてもだめ)」)', () => {
  it('引き寄せた直後(頂点の手前)の進行方向は何も起きず受付も残る/頂点〜+300msで叩き落とせる', () => {
    useGameStore.setState({ enemies: [place('zombie', 120, 0, 'z')] });
    swing();
    run(100);
    expect(useGameStore.getState().tryWhipFollowup(-1, 0)).toBe(true);
    const pullAt = now;
    const w = useGameStore.getState().whipFollowup!;
    expect(w.armAt).toBe(pullAt);
    expect(w.hitAt).toBeGreaterThan(pullAt); // 引き寄せた瞬間には開かない
    expect(w.hitAt).toBeLessThanOrEqual((en('z').brawlerLiftAt ?? 0) + (en('z').brLiftMs ?? 0));
    // 早すぎ: 何も起きない(ダメージなし・叩き落としなし)・受付は消費しない。
    const hp0 = en('z').health;
    expect(useGameStore.getState().tryWhipFollowup(1, 0)).toBe(true); // 入力は飲む(ワイヤー・一閃へ流さない)
    expect(useGameStore.getState().flickFollowupOpen()).toBe(true);
    expect(en('z').health).toBe(hp0);
    expect(en('z').brLiftDown).not.toBe(true);
    expect(useGameStore.getState().whipFollowup!.used).toBe(false);
    // 頂点の1ms手前もまだ早すぎ。
    now = w.hitAt - 1;
    expect(useGameStore.getState().tryWhipFollowup(1, 0)).toBe(true);
    expect(en('z').health).toBe(hp0);
    // 頂点で叩き落とせる(まだ浮いている)。
    now = w.hitAt;
    expect(brawlerAirborne(en('z'), now)).toBe(true);
    expect(useGameStore.getState().tryWhipFollowup(1, 0)).toBe(true);
    expect(en('z').health).toBeLessThan(hp0);
    expect(en('z').brLiftDown).toBe(true);
  });
  it('頂点+300msを過ぎたら閉じる(何も起きない)', () => {
    useGameStore.setState({ enemies: [place('zombie', 120, 0, 'z')] });
    swing();
    run(100);
    useGameStore.getState().tryWhipFollowup(-1, 0);
    const w = useGameStore.getState().whipFollowup!;
    now = w.hitAt + WHIP_FOLLOWUP_WINDOW_MS + 1;
    const hp0 = en('z').health;
    expect(useGameStore.getState().tryWhipFollowup(1, 0)).toBe(false);
    expect(en('z').health).toBe(hp0);
  });
  it('強個体(浮きの短い区分)でも頂点+300msはまだ浮いている', () => {
    useGameStore.setState({ enemies: [place('pumpkin' as EnemyType, 140, 0, 'k')] });
    swing();
    run(100);
    expect(useGameStore.getState().tryWhipFollowup(-1, 0)).toBe(true);
    expect(brawlerAirborne(en('k'), now)).toBe(true);
    const w = useGameStore.getState().whipFollowup!;
    expect(w.hitAt + WHIP_FOLLOWUP_WINDOW_MS).toBeLessThan(en('k').brLiftUntil ?? 0);
  });
});

describe('位置と向きの固定', () => {
  it('引き寄せ〜2段目の受付の間は、スティックで動かず向きも変わらない。受付が閉じれば戻る', () => {
    useGameStore.setState({ enemies: [place('zombie', 120, 0, 'z')] });
    swing();
    run(450); // 振りの動けない時間を明ける
    // 受付を今に開け直して(1段目の受付の中で)引き寄せる。
    useGameStore.setState(st => ({ whipFollowup: st.whipFollowup ? { ...st.whipFollowup, hitAt: now } : null }));
    expect(useGameStore.getState().tryWhipFollowup(-1, 0)).toBe(true);
    const x0 = useGameStore.getState().player.x;
    const UP = { up: true, down: false, left: false, right: false } as never;
    for (let i = 0; i < 10; i++) { now += 10; useGameStore.getState().movePlayer(UP, 0.01); }
    useGameStore.getState().setLastDirection({ x: 0, y: -1 });
    expect(Math.abs(useGameStore.getState().player.x - x0)).toBeLessThan(0.5);
    expect(useGameStore.getState().player.lastDirection).toEqual({ x: 1, y: 0 });
    // 固定は叩き落としの受付(浮き上がり切ってから300ms)の終わりまで続く。
    const w = useGameStore.getState().whipFollowup!;
    expect(w.lockUntil).toBe(w.hitAt + WHIP_FOLLOWUP_WINDOW_MS);
    now = w.lockUntil! - 1;
    useGameStore.getState().setLastDirection({ x: 0, y: -1 });
    expect(useGameStore.getState().player.lastDirection).toEqual({ x: 1, y: 0 });
    now = w.lockUntil! + 1;
    useGameStore.getState().setLastDirection({ x: 0, y: -1 });
    expect(useGameStore.getState().player.lastDirection).toEqual({ x: 0, y: -1 });
  });
});

describe('何も起きない', () => {
  it('300msを過ぎた・横向き・当たっていない振りでは何も起きない', () => {
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z')] });
    swing();
    run(100);
    expect(useGameStore.getState().tryWhipFollowup(0, 1)).toBe(false); // 横向き
    expect(useGameStore.getState().tryWhipFollowup(0.2, -1)).toBe(false);
    run(250); // 350ms
    expect(useGameStore.getState().tryWhipFollowup(-1, 0)).toBe(false);
    expect(useGameStore.getState().tryWhipFollowup(1, 0)).toBe(false);
    expect(en('z').whipPull).toBeUndefined();
    // 空振り
    useGameStore.setState(st => ({ enemies: [place('zombie', -200, 0, 'back')], player: { ...st.player, counterCooldownEnd: 0 } }));
    swing();
    expect(useGameStore.getState().tryWhipFollowup(-1, 0)).toBe(false);
    expect(useGameStore.getState().tryFlickFollowup(1, 0)).toBe(false);
  });
});
