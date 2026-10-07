// research/ESCORT_TARGETED.md(進軍NPCを敵が狙う・体力・倒れて起こす)のロジック層の統合テスト。
// 純関数の値そのもの(escortHealth/escortAggro/bossHate)は src/utils/*.test.ts。ここは「実装精度の規律4」どおり、
// gameStore の配線(resetGame の体力打刻・updateSuppression の倒れる/起こす・damageEscort・updateEnemies の狙い・
// combatTick/heroBlast の被弾入口)を実際に回して確かめる。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { applyContactDamage, applyPumpkinBlastDamage, applyEnemyProjectileHits, applyEnemyFire, NOOP_COMBAT_EFFECTS } from '../utils/combatTick';
import { hitThirdParties } from '../utils/heroBlast';
import { applyContactToEscorts, enemyDealsContactToAllies } from '../utils/escortHit';
import { escortMaxHealthFor, ESCORT_SELF_REVIVE_MS, ESCORT_REVIVE_NEED_MS, ESCORT_HIT_INVULN_MS } from '../utils/escortHealth';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import { escortHateSide } from '../utils/bossHate';
import type { Enemy, EscortSoldier, Projectile } from '../types/game';

const ORIGIN = 50_000;
const GT = 10_000_000;
const CAM = { x: ORIGIN - 215, y: ORIGIN - 466 };

const esc = (): EscortSoldier[] => useGameStore.getState().escorts;
const escById = (id: string): EscortSoldier => esc().find(e => e.id === id)!;
const setEsc = (id: string, patch: Partial<EscortSoldier>) =>
  useGameStore.setState(s => ({ escorts: s.escorts.map(e => (e.id === id ? { ...e, ...patch } : e)) }));

/** 軍人0を (dx,dy) に置き、残り3人は遠くへ。プレイヤーは原点・カメラは原点中心・ズーム1。 */
const setup = (dx = 100, dy = 40, over: Partial<EscortSoldier> = {}) => {
  useGameStore.getState().resetGame('assault');
  useGameStore.setState(s => ({
    gameTime: GT,
    camera: { ...CAM }, gameBounds: { width: 430, height: 932 }, viewZoom: 1,
    enemies: [],
    projectiles: [],
    pumpkinBlasts: [],
    player: { ...s.player, x: ORIGIN - 14, y: ORIGIN - 14, health: 9999, maxHealth: 9999, invulnerable: false, invulnerableTime: 0 },
    baseSites: s.baseSites.map(b => (b.id === 'base-0' ? { ...b, x: ORIGIN + 3000, y: ORIGIN + 40 } : b)),
    escorts: s.escorts.map((e, i) => (i === 0
      ? { ...e, x: ORIGIN + dx, y: ORIGIN + dy, health: 72, maxHealth: 72, ...over }
      : { ...e, x: ORIGIN + 20_000 + i * 500, y: ORIGIN + 20_000 })),
  }));
};
const tickSupp = (gt: number, dt = 1 / 60) => {
  useGameStore.getState().setGameTime(gt);
  return useGameStore.getState().updateSuppression(dt);
};
const tickEnemies = (gt: number, dt = 1 / 60) => {
  useGameStore.getState().setGameTime(gt);
  useGameStore.getState().updateEnemies(dt);
};
const put = (type: Parameters<typeof spawnEnemyAt>[0], x: number, y: number, over: Partial<Enemy> = {}): Enemy => {
  const e = { ...spawnEnemyAt(type, 0, 0, GT), ...over };
  e.x = x - e.width / 2; e.y = y - e.height / 2;
  useGameStore.setState(s => ({ enemies: [...s.enemies, e] }));
  return e;
};
const enemy = (id: string): Enemy => useGameStore.getState().enemies.find(e => e.id === id)!;

beforeEach(() => { setTreesDisabled(true); setTorchesDisabled(true); });

describe('出撃時の体力(§3)', () => {
  it('通常出撃: 4人の体力=出撃時のプレイヤー最大体力×0.6(全員同じ・満タン)', () => {
    useGameStore.getState().resetGame('assault');
    const s = useGameStore.getState();
    const expected = escortMaxHealthFor(s.player.maxHealth);
    expect(s.escorts.length).toBe(4);
    for (const e of s.escorts) {
      expect(e.maxHealth).toBe(expected);
      expect(e.health).toBe(expected);
      expect(e.downedAt).toBeUndefined();
    }
  });
  it('M0(訓練)の随行2人(軍人+衛生兵)は体力を持たない(対象外)', () => {
    useGameStore.setState({ pendingFarBackdrop: 'tutorial' });
    try {
      useGameStore.getState().resetGame('assault');
      const s = useGameStore.getState();
      expect(s.farBackdrop).toBe('tutorial');
      expect(s.escorts.length).toBe(2);
      for (const e of s.escorts) {
        expect(e.maxHealth).toBeUndefined();
        expect(e.health).toBeUndefined();
      }
      // 被弾も倒れもしない(従来どおり)
      expect(useGameStore.getState().damageEscort(s.escorts[0].id, 999, 0, 0).dealt).toBe(0);
    } finally {
      useGameStore.setState({ pendingFarBackdrop: '' });
    }
  });
});

describe('damageEscort(被弾の唯一の入口)', () => {
  it('体力が減り、被弾後1秒は無敵・射撃が止まり・滑りが積まれる', () => {
    setup();
    const r = useGameStore.getState().damageEscort('escort-0', 20, ORIGIN - 100, ORIGIN + 26);
    expect(r.dealt).toBe(20);
    const e = escById('escort-0');
    expect(e.health).toBe(52);
    expect(e.invulnUntil).toBe(GT + ESCORT_HIT_INVULN_MS);
    expect(e.lastHitAt).toBe(GT);
    expect(e.fireHoldUntil).toBe(GT + 300);
    expect(e.slideUntil).toBeGreaterThan(GT);
    // 無敵の間の2発目は通らない
    expect(useGameStore.getState().damageEscort('escort-0', 20, ORIGIN - 100, ORIGIN + 26).dealt).toBe(0);
    expect(escById('escort-0').health).toBe(52);
  });
  it('体力が尽きたら倒れる(死なない・escorts から消えない)=「倒れた」の場面が記録される', () => {
    setup(100, 40, { health: 10 });
    const r = useGameStore.getState().damageEscort('escort-0', 99, ORIGIN, ORIGIN);
    expect(r.downedNow).toBe(true);
    const e = escById('escort-0');
    expect(e.health).toBe(0);
    expect(e.downedAt).toBe(GT);
    expect(esc().length).toBe(4);
    expect(e.lastScene).toEqual({ kind: 'downed', at: GT });
  });
  it('倒れた軍人を追っていた敵は、追いを外して1秒の「見失い」に入る/ボスの狙いはプレイヤーへ戻る', () => {
    setup(100, 40, { health: 10 });
    const z = put('zombie', ORIGIN + 150, ORIGIN, { id: 'z1', targetEscortId: 'escort-0' });
    const other = put('zombie', ORIGIN + 400, ORIGIN, { id: 'z2', targetEscortId: 'escort-1' });
    const boss = put('thor', ORIGIN + 500, ORIGIN, { id: 'b1', hateTarget: escortHateSide('escort-0') });
    useGameStore.getState().damageEscort('escort-0', 99, ORIGIN, ORIGIN);
    expect(enemy(z.id).targetEscortId).toBeUndefined();
    expect(enemy(z.id).escortLostUntil).toBe(GT + 1000);
    expect(enemy(other.id).targetEscortId).toBe('escort-1');
    expect(enemy(other.id).escortLostUntil).toBeUndefined();
    expect(enemy(boss.id).hateTarget).toBe('player');
  });
  it('存在しないid・M0の随行(体力なし)は何も起きない', () => {
    setup();
    expect(useGameStore.getState().damageEscort('nope', 10, 0, 0).dealt).toBe(0);
    setEsc('escort-0', { health: undefined, maxHealth: undefined });
    expect(useGameStore.getState().damageEscort('escort-0', 10, 0, 0).dealt).toBe(0);
  });
  it('台詞のフック: 倒れた場面は lastScene に記録され、文言が無い人(武蔵=無言)は何も出さない(キューは増えない)', () => {
    setup(100, 40, { health: 5, soldierIndex: 3 }); // 武蔵: 倒れても無言
    const before = useGameStore.getState().npcDialogueQueue.length;
    useGameStore.getState().damageEscort('escort-0', 50, 0, 0);
    expect(useGameStore.getState().npcDialogueQueue.length).toBe(before);
    expect(escById('escort-0').lastScene?.kind).toBe('downed');
  });
  it('台詞: 倒れた瞬間は全員無言(社長裁定§13c-3) / 起こされた台詞はCDを通さずキューの先頭へ / 自力で起きた時は無言', () => {
    setup(100, 40, { health: 5, soldierIndex: 1 }); // ジョセフ
    const q0 = useGameStore.getState().npcDialogueQueue.length;
    useGameStore.getState().damageEscort('escort-0', 50, 0, 0);
    expect(useGameStore.getState().npcDialogueQueue.length).toBe(q0); // 倒れた瞬間は無言
    // 起こされた=先頭へ割り込む
    useGameStore.getState().noteEscortScene('escort-0', 'revived');
    const q1 = useGameStore.getState().npcDialogueQueue;
    expect(q1.length).toBe(q0 + 1);
    expect(q1[0]).toMatchObject({ name: 'ジョセフ' });
    // 自力(silent)=無言
    useGameStore.getState().noteEscortScene('escort-0', 'revived', { silent: true });
    expect(useGameStore.getState().npcDialogueQueue.length).toBe(q0 + 1);
  });
});

describe('倒れている間(§6): 前進・射撃・滞在・台詞が止まる / 起こす / 自然に起きる', () => {
  it('倒れている軍人は動かず・撃たず・歩行アニメは止めコマ・拠点の滞在は保たれる', () => {
    setup(100, 40, { health: 0, downedAt: GT - 1000, dwellMs: 4321, reviveMs: 0 });
    // 近くに敵が居ても撃たない
    put('zombie', ORIGIN + 150, ORIGIN + 40, { id: 'z1' });
    const shots = tickSupp(GT);
    const e = escById('escort-0');
    expect(shots.length).toBe(0);
    expect(e.x).toBe(ORIGIN + 100);
    expect(e.y).toBe(ORIGIN + 40);
    expect(e.moving).toBe(false);
    expect(e.dwellMs).toBe(4321);
    expect(e.fireAt).toBe(0);
  });
  it('プレイヤーが90px以内に2秒居ると起き上がる(体力50%・2秒無敵・向きがプレイヤーへ)', () => {
    setup(60, 40, { health: 0, downedAt: GT - 100, reviveMs: 0, face: 1 });
    let gt = GT;
    const frames = Math.ceil(ESCORT_REVIVE_NEED_MS / (1000 / 60)) + 2;
    for (let i = 0; i < frames; i++) { gt += 1000 / 60; tickSupp(gt); }
    const e = escById('escort-0');
    expect(e.downedAt).toBeUndefined();
    expect(e.health).toBe(36);
    expect(e.riseKind).toBe('player');
    expect(e.lastScene?.kind).toBe('revived');
    expect(e.invulnUntil).toBeGreaterThan(gt);
  });
  it('離れていると進まず戻る・誰も起こさなくても30秒で自然に起きる(画面外でも)', () => {
    setup(5000, 40, { health: 0, downedAt: GT, reviveMs: 1500 }); // 画面外・遠い
    tickSupp(GT + 1000, 1);
    expect(escById('escort-0').reviveMs).toBeCloseTo(1000, 3);
    tickSupp(GT + ESCORT_SELF_REVIVE_MS - 10);
    expect(escById('escort-0').downedAt).toBeDefined();
    tickSupp(GT + ESCORT_SELF_REVIVE_MS);
    const e = escById('escort-0');
    expect(e.downedAt).toBeUndefined();
    expect(e.riseKind).toBe('self');
    expect(e.slowUntil).toBe(GT + ESCORT_SELF_REVIVE_MS + 4000);
  });
  it('倒れている間は画面外の自動進行も解放も止まる', () => {
    setup(5000, 40, { health: 0, downedAt: GT, dwellMs: 9990 });
    const x0 = escById('escort-0').x;
    tickSupp(GT + 100, 1);
    expect(escById('escort-0').x).toBe(x0);
    expect(escById('escort-0').dwellMs).toBe(9990);
    expect(useGameStore.getState().baseSites.filter(b => b.status === 'captured').length).toBe(0);
  });
  it('倒れている軍人は台詞を出さない(tryNpcLine が落とす)・stallUntil も付かない', () => {
    setup(100, 40, { health: 0, downedAt: GT, soldierIndex: 3 }); // 武蔵
    const q0 = useGameStore.getState().npcDialogueQueue.length;
    expect(useGameStore.getState().tryNpcLine('武蔵', 'pushback', '下がる。', 1000, 'escort-0')).toBe(false);
    expect(useGameStore.getState().npcDialogueQueue.length).toBe(q0);
    expect(escById('escort-0').stallUntil).toBeUndefined();
    // 立っている軍人は従来どおり
    setEsc('escort-0', { health: 72, downedAt: undefined });
    expect(useGameStore.getState().tryNpcLine('武蔵', 'pushback', '下がる。', 1000, 'escort-0')).toBe(true);
    expect(escById('escort-0').stallUntil).toBeGreaterThan(GT);
  });
  it('同名の別人(駐留兵=id無しの呼び出し)の台詞は、同じ名前の軍人が倒れていても落とさない(進軍NPC起点だけ id で止める)', () => {
    setup(100, 40, { health: 0, downedAt: GT, soldierIndex: 3 }); // 武蔵が倒れている
    const q0 = useGameStore.getState().npcDialogueQueue.length;
    expect(useGameStore.getState().tryNpcLine('武蔵', 'praise', '見事。', 1000)).toBe(true);
    expect(useGameStore.getState().npcDialogueQueue.length).toBe(q0 + 1);
    expect(escById('escort-0').stallUntil).toBeUndefined(); // 苦戦の通信でなければ stall は付かない
  });
  it('倒れ込みが地面に着いた瞬間に1度だけ砂埃の起点が立つ(landedFx)・起きると落ちる', () => {
    setup(100, 40, { health: 5 });
    useGameStore.getState().damageEscort('escort-0', 50, 0, 0);
    expect(escById('escort-0').landedFx).toBeUndefined();
    tickSupp(GT + 100);
    expect(escById('escort-0').landedFx).toBeUndefined(); // まだ落ちている途中
    tickSupp(GT + 400);
    expect(escById('escort-0').landedFx).toBe(true);
    tickSupp(GT + 500);
    expect(escById('escort-0').landedFx).toBe(true); // 立て直さない=1回だけ
    setEsc('escort-0', { downedAt: GT + 600 - 1, landedFx: undefined, reviveMs: 0 });
    useGameStore.getState().damageEscort('escort-0', 1, 0, 0); // 倒れ中は無効(何も起きない)
    expect(escById('escort-0').downedAt).toBe(GT + 599);
  });
  it('倒れている間も「狙っているボス」の一覧は追従する(起きた直後に同じボスが狙い直しても予告の一言が抜けない)', () => {
    setup(100, 40);
    put('thor', ORIGIN + 500, ORIGIN, { id: 'b1', hateTarget: escortHateSide('escort-0'), bossState: 'dash-windup' });
    tickSupp(GT);
    expect(escById('escort-0').hatedByBossIds).toEqual(['b1']);
    // 倒れる→ボスの狙いはプレイヤーへ戻る(damageEscort)。倒れている間の1フレームで一覧が空になる。
    setEsc('escort-0', { health: 5 });
    useGameStore.getState().damageEscort('escort-0', 50, 0, 0);
    expect(enemy('b1').hateTarget).toBe('player');
    tickSupp(GT + 16);
    expect(escById('escort-0').hatedByBossIds).toEqual([]);
    // 起きた直後に同じボスがまた狙う=新しく増えた=場面が打たれる
    setEsc('escort-0', { downedAt: undefined, health: 36, invulnUntil: GT + 5000, slideUntil: undefined, slideStartAt: undefined });
    useGameStore.setState(s => ({ enemies: s.enemies.map(e => (e.id === 'b1' ? { ...e, hateTarget: escortHateSide('escort-0') } : e)) }));
    tickSupp(GT + 32);
    expect(escById('escort-0').lastScene).toEqual({ kind: 'targeted', at: GT + 32 });
  });
});

describe('立っている軍人: 被弾の滑り・射撃停止・瀕死の後ずさり・全快(§7・§13b)', () => {
  it('被弾で射撃が300ms止まる', () => {
    setup(0, 40);
    put('zombie', ORIGIN + 100, ORIGIN + 40, { id: 'z1' });
    const shots1 = tickSupp(GT);
    expect(shots1.length).toBeGreaterThan(0); // 近くの敵を撃つ
    setEsc('escort-0', { fireAt: 0, fireHoldUntil: GT + 300 });
    expect(tickSupp(GT + 100).length).toBe(0);
    expect(tickSupp(GT + 300).length).toBeGreaterThan(0);
  });
  it('軍人の弾は撃った軍人のidを持つ(ボスのヘイトを軍人ごとのバケツへ積む起因)', () => {
    setup(0, 40);
    put('zombie', ORIGIN + 100, ORIGIN + 40, { id: 'z1' });
    tickSupp(GT);
    const p = useGameStore.getState().projectiles.filter(x => x.weaponKey === 'escort');
    expect(p.length).toBeGreaterThan(0);
    for (const x of p) expect(x.escortId).toBe('escort-0');
  });
  it('被弾の滑りの間は前進せず、滑りは clamp 済みの終点まで ease-out で進み、終われば確定する', () => {
    setup(100, 40);
    useGameStore.getState().damageEscort('escort-0', 10, ORIGIN, ORIGIN + 26); // 左から → 右へ滑る
    const x0 = escById('escort-0').x;
    tickSupp(GT + 50);
    const xm = escById('escort-0').x;
    expect(xm).toBeGreaterThan(x0);
    expect(escById('escort-0').moving).toBe(false);
    const toX = escById('escort-0').slideToX!;
    tickSupp(escById('escort-0').slideUntil! + 1);
    const e = escById('escort-0');
    expect(e.slideUntil).toBeUndefined();
    expect(Math.abs(e.x - toX)).toBeLessThan(2); // 終点に確定(同じフレームの前進ぶん=約1pxだけ進む)
  });
  it('瀕死(30%未満)で近くに敵が居ると、撃ちながら敵から離れる(最寄りの敵の反対へ・速さは後方=70%)', () => {
    setup(0, 40, { health: 10 });
    put('zombie', ORIGIN + 60, ORIGIN + 40 - 14, { id: 'z1' }); // 軍人の右隣(体の中心の高さ)
    const x0 = escById('escort-0').x;
    const shots = tickSupp(GT);
    const e = escById('escort-0');
    expect(e.x).toBeLessThan(x0);          // 敵と反対(左)へ下がる
    expect(e.face).toBe(1);                // 敵(右)を向いたまま
    expect(shots.length).toBeGreaterThan(0); // 撃つ
  });
  it('後ずさりを始めた瞬間に、その人の「下がる」台詞が1回だけ流れる(社長裁定§13c-4)', () => {
    setup(0, 40, { health: 10, soldierIndex: 1 }); // ジョセフ
    useGameStore.setState({ npcDialogueQueue: [], npcSpokeAt: {}, npcCatAt: {} });
    put('zombie', ORIGIN + 60, ORIGIN + 40 - 14, { id: 'z1' });
    tickSupp(GT);
    const q1 = useGameStore.getState().npcDialogueQueue.filter(l => l.name === 'ジョセフ');
    expect(q1.length).toBe(1);
    expect(escById('escort-0').lowRetreat).toBe(true);
    tickSupp(GT + 16); // 後ずさりが続いても2回目は出ない(立ち上がりだけ)
    expect(useGameStore.getState().npcDialogueQueue.filter(l => l.name === 'ジョセフ').length).toBe(1);
  });
  it('体力が十分なら(瀕死でなければ)後ずさらない(前方の敵には止まる=従来どおり)', () => {
    setup(0, 40, { health: 72 });
    put('zombie', ORIGIN + 60, ORIGIN + 40 - 14, { id: 'z1' });
    const x0 = escById('escort-0').x;
    tickSupp(GT);
    expect(escById('escort-0').x).toBeGreaterThanOrEqual(x0 - 0.001);
  });
  it('担当拠点の確保で全快する', () => {
    setup(0, 40, { health: 10 });
    const base = useGameStore.getState().baseSites.find(b => b.id === 'base-0')!;
    setEsc('escort-0', { x: base.x, y: base.y, dwellMs: 9990 });
    // 画面外でも解放は成立する(1/5の自動進行)=拠点の円の中で10秒に届く
    tickSupp(GT + 100, 1);
    const b = useGameStore.getState().baseSites.find(x => x.id === 'base-0')!;
    expect(b.status).toBe('captured');
    const e = escById('escort-0');
    expect(e.health).toBe(72);
    expect(e.healedAt).toBe(GT + 100);
  });
  it('速度(px/s)が記録される(ボスの偏差撃ち用)', () => {
    setup(0, 40);
    const base = useGameStore.getState().baseSites.find(b => b.id === 'base-0')!;
    // 拠点へ向かって歩いている軍人: 画面内に置く
    setEsc('escort-0', { x: ORIGIN, y: ORIGIN + 100 });
    useGameStore.setState({ baseSites: useGameStore.getState().baseSites.map(b => (b.id === base.id ? { ...b, x: ORIGIN + 400, y: ORIGIN + 100 } : b)) });
    tickSupp(GT + 16);
    const e = escById('escort-0');
    expect(e.vx).toBeGreaterThan(10);
    expect(Math.abs(e.vy ?? 0)).toBeLessThan(1);
  });
});

describe('敵が軍人を狙う(§4): updateEnemies の移動と技の目標点', () => {
  it('プレイヤーより2割以上近い軍人を追う(targetEscortId・移動先は軍人)', () => {
    setup(200, 0);
    // 敵(+450,0): プレイヤー(0)までは450px・軍人(+200,0)までは250px(2割以上近い)。
    const z = put('zombie', ORIGIN + 450, ORIGIN - 14, { id: 'z1' });
    tickEnemies(GT);
    const e = enemy(z.id);
    expect(e.targetEscortId).toBe('escort-0');
    expect(e.x + e.width / 2).toBeLessThan(ORIGIN + 450); // 軍人(左)の方へ
  });
  it('軍人が画面外なら狙わない(見えない所では襲われない)', () => {
    setup(5000, 0);
    const z = put('zombie', ORIGIN + 5100, ORIGIN, { id: 'z1' });
    tickEnemies(GT);
    expect(enemy(z.id).targetEscortId).toBeUndefined();
  });
  it('倒れている軍人は狙わない', () => {
    setup(200, 0, { health: 0, downedAt: GT });
    const z = put('zombie', ORIGIN + 300, ORIGIN - 14, { id: 'z1' });
    tickEnemies(GT);
    expect(enemy(z.id).targetEscortId).toBeUndefined();
  });
  it('ボス級(ヘイト表)・英雄・死神は距離規則では軍人を狙わない', () => {
    setup(200, 0);
    for (const t of ['thor', 'mutant-hero', 'reaper'] as const) {
      const e0 = put(t, ORIGIN + 300, ORIGIN - 14, { id: `x-${t}` });
      tickEnemies(GT);
      expect(enemy(e0.id)?.targetEscortId).toBeUndefined();
    }
  });
  it('技の開始時の目標点も同じ相手: パンプキンの跳びの着地点は軍人の体の中心', () => {
    setup(200, 0);
    const p = put('pumpkin', ORIGIN + 300, ORIGIN - 14, {
      id: 'p1', aiPhase: 'crouch', aiPhaseUntil: GT - 1, targetEscortId: 'escort-0',
    });
    tickEnemies(GT);
    const e = enemy(p.id);
    expect(e.aiPhase).toBe('jump');
    // 着地点(aiTargetX/Y=左上)=軍人の体の中心 − 半サイズ(プレイヤー(ORIGIN)ではない)
    expect(e.aiTargetX! + e.width / 2).toBeCloseTo(ORIGIN + 200, 3);
    expect(e.aiTargetY! + e.height / 2).toBeCloseTo(ORIGIN - 14, 3);
  });
  it('軍人を追っていない個体は従来どおり目標点=プレイヤー(1bitも変わらない)', () => {
    setup(5000, 0);
    const p = put('pumpkin', ORIGIN + 300, ORIGIN, { id: 'p1', aiPhase: 'crouch', aiPhaseUntil: GT - 1 });
    tickEnemies(GT);
    const e = enemy(p.id);
    expect(e.aiPhase).toBe('jump');
    expect(e.aiTargetX! + e.width / 2).toBeCloseTo(ORIGIN, 3);
  });
  it('見失い(§13b-1): 倒れた直後の1秒は新しい技を始めず立ち止まる。進行中の技は振り切る', () => {
    setup(200, 0);
    const z = put('zombie', ORIGIN + 300, ORIGIN - 14, { id: 'z1', escortLostUntil: GT + 1000, vx: 50, vy: 0 });
    const x0 = enemy(z.id).x;
    tickEnemies(GT + 100);
    const e = enemy(z.id);
    expect(e.x).toBe(x0);               // 動かない
    expect(Math.abs(e.vx ?? 0)).toBeLessThan(50); // 速度は減衰(慣性)
    // 技の最中(aiPhase)は止めない=進行中の技は最後まで
    const p = put('pumpkin', ORIGIN + 300, ORIGIN - 14, { id: 'p1', aiPhase: 'crouch', aiPhaseUntil: GT - 1, escortLostUntil: GT + 1000 });
    tickEnemies(GT + 200);
    expect(enemy(p.id).aiPhase).toBe('jump');
  });
  it('技の最中(aiPhase あり)は追う相手を決め直さない(技の途中で狙いが別の軍人/プレイヤーへ跳ばない)・技が終われば決め直す', () => {
    setup(-150, 0);
    setEsc('escort-1', { x: ORIGIN + 130, y: ORIGIN }); // 敵のすぐ横にもっと近い軍人が居る
    const z = put('zombie', ORIGIN + 150, ORIGIN, { id: 'z1', targetEscortId: 'escort-0', aiPhase: 'zrush', aiPhaseUntil: GT + 5000 });
    tickEnemies(GT + 16);
    expect(enemy(z.id).targetEscortId).toBe('escort-0'); // 固定
    useGameStore.setState(s => ({ enemies: s.enemies.map(e => (e.id === 'z1' ? { ...e, aiPhase: undefined, aiPhaseUntil: undefined } : e)) }));
    tickEnemies(GT + 32);
    expect(enemy(z.id).targetEscortId).toBe('escort-1'); // 技が終われば粘着20%を超える近さの相手へ
  });
  it('見失いが明ければ(1秒後)また動く', () => {
    setup(5000, 0);
    const z = put('zombie', ORIGIN + 300, ORIGIN, { id: 'z1', escortLostUntil: GT + 1000 });
    const x0 = enemy(z.id).x;
    tickEnemies(GT + 1001);
    expect(enemy(z.id).x).not.toBe(x0);
  });
  it('敵の射撃も追っている軍人へ(applyEnemyFire)', () => {
    setup(200, 0);
    const plant = put('plant', ORIGIN + 400, ORIGIN - 14, { id: 'pl1', lastShot: 0 });
    tickEnemies(GT);
    expect(enemy(plant.id).targetEscortId).toBe('escort-0');
    applyEnemyFire(GT + 100_000);          // 閉じ始める(撃つ前の溜め)
    applyEnemyFire(GT + 100_000 + 300);    // 閉じ切って(260ms)撃つ
    const pr = useGameStore.getState().projectiles.find(p => p.hostile);
    expect(pr).toBeDefined();
    // 弾は軍人(左)へ向かう
    expect(pr!.direction.x).toBeLessThan(0);
  });
});

describe('被弾の入口(§3): 接触 / 敵弾 / 爆風 / ボス技の形(hitThirdParties) / 噛みつき', () => {
  it('接触: 体をぶつけに来る技の最中(突進 charge など=噛みつき台本に乗らない)の敵が軍人に触れたら食らう・見えない所では食らわない', () => {
    setup(100, 40);
    put('werewolf', ORIGIN + 100, ORIGIN + 40 - 14, { id: 'p1', damage: 30, aiPhase: 'charge', dormant: false });
    expect(applyContactToEscorts(GT, false, 0)).toBe(1);
    expect(escById('escort-0').health).toBe(42);
    // 画面外
    setup(5000, 40);
    put('werewolf', ORIGIN + 5000, ORIGIN + 40 - 14, { id: 'p1', damage: 30, aiPhase: 'charge', dormant: false });
    expect(applyContactToEscorts(GT, false, 0)).toBe(0);
    expect(escById('escort-0').health).toBe(72);
  });
  it('接触: 噛みつき個体(ゾンビ)・気絶中・空中の跳びは接触で当たらない(プレイヤーと同じ除外)', () => {
    const z = { ...spawnEnemyAt('zombie', 0, 0, GT), damage: 20 };
    expect(enemyDealsContactToAllies(z, GT)).toBe(false); // 噛みで当てる
    const p = { ...spawnEnemyAt('werewolf', 0, 0, GT), damage: 20, aiPhase: 'charge' as const, dormant: false };
    expect(enemyDealsContactToAllies(p, GT)).toBe(true); // 体をぶつけに行く技の最中=触れたら痛い
    expect(enemyDealsContactToAllies({ ...p, aiPhase: undefined }, GT)).toBe(false); // 平時の接触は噛みつき台本(プレイヤーと同じ)
    const th = { ...spawnEnemyAt('thor', 0, 0, GT), damage: 20, dormant: false };
    expect(enemyDealsContactToAllies({ ...th, bossState: 'thor-issen' as never }, GT)).toBe(false); // 技の最中は技自身の判定に委ねる
    expect(enemyDealsContactToAllies({ ...p, stunUntil: GT + 10 }, GT)).toBe(false);
    expect(enemyDealsContactToAllies({ ...p, aiPhase: 'jump' }, GT)).toBe(false); // 空中は被弾しない側(プレイヤーと同じ)
    expect(enemyDealsContactToAllies({ ...p, damage: 0 }, GT)).toBe(false);
    expect(enemyDealsContactToAllies({ ...p, corpseUntil: GT + 1 }, GT)).toBe(false);
    expect(enemyDealsContactToAllies({ ...p, type: 'mutant-hero' }, GT)).toBe(false);
    expect(enemyDealsContactToAllies({ ...p, type: 'reaper' }, GT)).toBe(false);
  });
  it('接触: 無敵(被弾後1秒)の間は連続で食らわない/倒れた軍人には当たらない', () => {
    setup(100, 40);
    put('werewolf', ORIGIN + 100, ORIGIN + 40 - 14, { id: 'p1', damage: 30, aiPhase: 'charge', dormant: false });
    applyContactToEscorts(GT, false, 0);
    applyContactToEscorts(GT + 500, false, 0);
    expect(escById('escort-0').health).toBe(42);
    useGameStore.setState({ gameTime: GT + 1000 });
    applyContactToEscorts(GT + 1000, false, 0);
    expect(escById('escort-0').health).toBe(12);
    useGameStore.setState({ gameTime: GT + 2100 });
    applyContactToEscorts(GT + 2100, false, 0); // 12 → 倒れる
    expect(escById('escort-0').downedAt).toBeDefined();
    useGameStore.setState({ gameTime: GT + 3200 });
    expect(applyContactToEscorts(GT + 3200, false, 0)).toBe(0);
  });
  it('噛みつき(§12): 噛みの瞬間に重なっていた軍人にも当たる(プレイヤーと同じ判定)', () => {
    setup(100, 40);
    // ゾンビの体(幅/高さ)を軍人の体に重ねる。biteAt を十分過去にして解決時刻を過ぎさせる
    const z = put('zombie', ORIGIN + 100, ORIGIN + 40 - 14, { id: 'z1', damage: 18, biteAt: GT - 2000, biteDirX: 1, biteDirY: 0, biteAimEscortId: 'escort-0' });
    applyContactDamage(GT, false, 0, NOOP_COMBAT_EFFECTS);
    expect(escById('escort-0').health).toBe(72 - 18);
    expect(enemy(z.id).biteAt).toBe(0); // 噛みは終わる
    expect(enemy(z.id).biteAimEscortId).toBeUndefined();
  });
  it('噛みつきの構え始め: プレイヤーが届かず軍人だけが範囲内なら、軍人へ向けて構える(biteAimEscortId)', () => {
    setup(0, 300); // 軍人はプレイヤーの真下300px(画面の中・プレイヤーの噛みの範囲の外)
    const z = put('skeleton', ORIGIN, ORIGIN + 332 - 14, { id: 'z1', damage: 18, biteReadyAt: 0 });
    applyContactDamage(GT, false, 0, NOOP_COMBAT_EFFECTS);
    const e = enemy(z.id);
    expect(e.biteAt).toBe(GT);
    expect(e.biteAimEscortId).toBe('escort-0');
    expect(e.biteDirY!).toBeLessThan(0); // 軍人(上=敵から見て手前)へ
  });
  it('噛みつきの構え始め: 狙っていた軍人が倒れた直後の1秒(見失い)は新しい噛みを始めない', () => {
    setup(0, 300);
    const z = put('skeleton', ORIGIN, ORIGIN + 332 - 14, { id: 'z1', damage: 18, biteReadyAt: 0, escortLostUntil: GT + 1000 });
    applyContactDamage(GT, false, 0, NOOP_COMBAT_EFFECTS);
    expect(enemy(z.id).biteAt ?? 0).toBe(0);
  });
  it('敵弾: 軍人に当たった弾は消え、軍人が食らう(プレイヤーには当たらない・紅き夜×2)', () => {
    setup(100, 40);
    const proj = {
      id: 'ep1', x: ORIGIN + 95, y: ORIGIN + 40 - 19, width: 10, height: 10, speed: 0, damage: 10,
      direction: { x: 1, y: 0 }, weaponType: 'handgun', hostile: true, reflected: false, passthrough: false, hitEnemies: [], duration: 5000, createdAt: Date.now(),
      critChance: 0,
    } as unknown as Projectile;
    useGameStore.setState({ projectiles: [proj] });
    const pl = useGameStore.getState().player;
    applyEnemyProjectileHits(Date.now(), pl, true, 0, GT, NOOP_COMBAT_EFFECTS, { grenadeBlastRadius: 0, grenadeBlastDamageMult: 0, counterReflectSlowMs: 0 });
    expect(escById('escort-0').health).toBe(72 - 20);
    expect(useGameStore.getState().projectiles.find(p => p.id === 'ep1')).toBeUndefined();
    expect(useGameStore.getState().player.health).toBe(9999);
  });
  it('敵弾: 無敵(被弾後1秒)の軍人は弾を消さない=後ろのプレイヤーの盾にならない', () => {
    setup(100, 40);
    setEsc('escort-0', { invulnUntil: GT + 500 });
    const proj = {
      id: 'ep2', x: ORIGIN + 95, y: ORIGIN + 40 - 19, width: 10, height: 10, speed: 0, damage: 10,
      direction: { x: 1, y: 0 }, weaponType: 'handgun', hostile: true, reflected: false, passthrough: false, hitEnemies: [], duration: 5000, createdAt: Date.now(),
      critChance: 0,
    } as unknown as Projectile;
    useGameStore.setState({ projectiles: [proj] });
    const pl = useGameStore.getState().player;
    applyEnemyProjectileHits(Date.now(), pl, true, 0, GT, NOOP_COMBAT_EFFECTS, { grenadeBlastRadius: 0, grenadeBlastDamageMult: 0, counterReflectSlowMs: 0 });
    expect(escById('escort-0').health).toBe(72); // 食らわない
    expect(useGameStore.getState().projectiles.find(p => p.id === 'ep2')).toBeDefined(); // 弾は消えない
  });
  it('爆風(パンプキンの着地・城ボスの跳び・ボス技の帯): 円/帯の中に居れば食らう・外なら食らわない', () => {
    setup(100, 40);
    const c = { x: ORIGIN + 100, y: ORIGIN + 40 - 14 };
    useGameStore.setState({ pumpkinBlasts: [{ x: c.x + 40, y: c.y, radius: 60, damage: 25, enemyId: 'nobody' }] });
    applyPumpkinBlastDamage(NOOP_COMBAT_EFFECTS, { thorOrbitDist: 0, thorCounterLeapMs: 0 });
    expect(escById('escort-0').health).toBe(47);
    setup(100, 40);
    useGameStore.setState({ pumpkinBlasts: [{ x: c.x + 400, y: c.y, radius: 60, damage: 25, enemyId: 'nobody' }] });
    applyPumpkinBlastDamage(NOOP_COMBAT_EFFECTS, { thorOrbitDist: 0, thorCounterLeapMs: 0 });
    expect(escById('escort-0').health).toBe(72);
    setup(100, 40);
    useGameStore.setState({ pumpkinBlasts: [{
      x: c.x, y: c.y, radius: 20, damage: 25, enemyId: 'nobody',
      capsule: { fx: c.x - 300, fy: c.y, tx: c.x + 300, ty: c.y, halfWidth: 20 },
    }] });
    applyPumpkinBlastDamage(NOOP_COMBAT_EFFECTS, { thorOrbitDist: 0, thorCounterLeapMs: 0 });
    expect(escById('escort-0').health).toBe(47);
  });
  it('ボス技の形(hitThirdParties=約27箇所の入口): 円/帯/扇/矩形を軍人にも当てる・無敵の間は1回だけ', () => {
    setup(100, 40);
    const c = { x: ORIGIN + 100, y: ORIGIN + 40 - 14 };
    hitThirdParties({ kind: 'circle', cx: c.x, cy: c.y, r: 30 }, 12, 'boss', 'k');
    expect(escById('escort-0').health).toBe(60);
    hitThirdParties({ kind: 'circle', cx: c.x, cy: c.y, r: 30 }, 12, 'boss', 'k'); // 無敵中
    expect(escById('escort-0').health).toBe(60);
    for (const [i, shape] of ([
      { kind: 'capsule', fx: c.x - 200, fy: c.y, tx: c.x + 200, ty: c.y, hw: 10 },
      { kind: 'rect', x: c.x - 5, y: c.y - 5, w: 10, h: 10 },
      { kind: 'fan', cx: c.x - 100, cy: c.y, angle: 0, halfArc: 0.5, radius: 200 },
    ] as const).entries()) {
      setup(100, 40);
      hitThirdParties(shape, 12, 'boss', `k${i}`);
      expect(escById('escort-0').health).toBe(60);
    }
    // 外れる形
    setup(100, 40);
    hitThirdParties({ kind: 'circle', cx: c.x + 500, cy: c.y, r: 30 }, 12, 'boss', 'k');
    expect(escById('escort-0').health).toBe(72);
  });
  it('プレイヤー・守護霊の攻撃は軍人に当たらない(味方): 軍人の弾は hostile でない', () => {
    setup(100, 40);
    const own = {
      id: 'mine', x: ORIGIN + 95, y: ORIGIN + 40 - 19, width: 10, height: 10, speed: 0, damage: 99,
      direction: { x: 1, y: 0 }, weaponType: 'handgun', weaponKey: 'escort', hostile: false, reflected: false, passthrough: false, hitEnemies: [], duration: 5000, createdAt: Date.now(),
      critChance: 0,
    } as unknown as Projectile;
    useGameStore.setState({ projectiles: [own] });
    applyEnemyProjectileHits(Date.now(), useGameStore.getState().player, false, 0, GT, NOOP_COMBAT_EFFECTS, { grenadeBlastRadius: 0, grenadeBlastDamageMult: 0, counterReflectSlowMs: 0 });
    expect(escById('escort-0').health).toBe(72);
  });
});

describe('ボスのヘイト(§5): damageEscort でなく damageEnemy のバケツ', () => {
  it('軍人の弾(hateSource=escort:<id>)は軍人ごとのバケツへ積まれ、プレイヤーのバケツは増えない', () => {
    setup();
    const boss = put('thor', ORIGIN + 500, ORIGIN, { id: 'b1' });
    useGameStore.getState().damageEnemy(boss.id, 10, false, false, false, null, escortHateSide('escort-0'));
    useGameStore.getState().damageEnemy(boss.id, 7, false, false, false, null, 'player');
    const b = enemy(boss.id);
    expect(b.hateEscortBuckets?.['escort-0']?.length).toBeGreaterThan(0);
    const sumOf = (arr?: { dmg: number }[]) => (arr ?? []).reduce((a, x) => a + x.dmg, 0);
    expect(sumOf(b.hateEscortBuckets?.['escort-0'])).toBeGreaterThan(0);
    expect(sumOf(b.hatePlayerBuckets)).toBeGreaterThan(0);
    // 同じダメージ量: 軍人のぶんはプレイヤーのバケツに混ざらない
    const before = sumOf(b.hatePlayerBuckets);
    useGameStore.getState().damageEnemy(boss.id, 10, false, false, false, null, escortHateSide('escort-0'));
    expect(sumOf(enemy(boss.id).hatePlayerBuckets)).toBe(before);
  });
  it('ボスの狙いロック(resolveBossHateAim): 全員0ダメージの開幕は一番近い相手。軍人が近ければ軍人', async () => {
    setup(200, 0);
    const boss = put('thor', ORIGIN + 400, ORIGIN, { id: 'b1' });
    const { resolveBossHateAim } = await import('../utils/bossHate');
    const st = useGameStore.getState();
    const aim = resolveBossHateAim(enemy(boss.id), { x: ORIGIN, y: ORIGIN }, st.summons, st.gameTime);
    expect(aim.side).toBe('escort:escort-0');
    expect(aim.x).toBe(ORIGIN + 200);
  });
  it('軍人が画面外/倒れていると、ボスの狙い候補に入らない', async () => {
    const { resolveBossHateAim } = await import('../utils/bossHate');
    setup(5000, 0);
    const boss = put('thor', ORIGIN + 5100, ORIGIN, { id: 'b1' });
    let st = useGameStore.getState();
    expect(resolveBossHateAim(enemy(boss.id), { x: ORIGIN, y: ORIGIN }, st.summons, st.gameTime).side).toBe('player');
    setup(100, 0, { health: 0, downedAt: GT });
    put('thor', ORIGIN + 150, ORIGIN, { id: 'b1' });
    st = useGameStore.getState();
    expect(resolveBossHateAim(enemy('b1'), { x: ORIGIN, y: ORIGIN }, st.summons, st.gameTime).side).toBe('player');
  });
  it('「ボスの赤い予告が自分に掛かった」場面: ボスが狙いを軍人に決めた瞬間に1度だけ記録される', () => {
    setup(100, 40);
    put('thor', ORIGIN + 500, ORIGIN, { id: 'b1', hateTarget: escortHateSide('escort-0'), bossState: 'dash-windup' });
    tickSupp(GT);
    expect(escById('escort-0').lastScene).toEqual({ kind: 'targeted', at: GT });
    expect(escById('escort-0').hatedByBossIds).toEqual(['b1']);
    tickSupp(GT + 500);
    expect(escById('escort-0').lastScene?.at).toBe(GT); // 同じボスが狙い続けても場面は増えない
  });
  it('追いかけ中(bossState=chase/return)の狙い替えは「予告が掛かった」ではない(賞金首は追跡中も hateTarget を書く)。技の溜めに入った時に初めて場面が出る', () => {
    setup(100, 40);
    put('thor', ORIGIN + 500, ORIGIN, { id: 'b1', hateTarget: escortHateSide('escort-0'), bossState: 'chase' });
    tickSupp(GT);
    expect(escById('escort-0').lastScene).toBeUndefined();
    expect(escById('escort-0').hatedByBossIds ?? []).toEqual([]);
    useGameStore.setState(s => ({ enemies: s.enemies.map(e => (e.id === 'b1' ? { ...e, bossState: 'dash-windup' as const } : e)) }));
    tickSupp(GT + 16);
    expect(escById('escort-0').lastScene).toEqual({ kind: 'targeted', at: GT + 16 });
  });
});

describe('スマホの寸法で結果が変わらない(画面内判定はズーム1で旧定義と同じ)', () => {
  for (const gb of [{ width: 430, height: 932 }, { width: 375, height: 667 }]) {
    it(`${gb.width}×${gb.height}: 画面の中の軍人は(旧と同じく)画面内として動く/画面の外200pxの軍人は画面外として1/5で進む`, () => {
      setup(0, 0);
      useGameStore.setState({ gameBounds: gb, camera: { x: ORIGIN - gb.width / 2, y: ORIGIN - gb.height / 2 } });
      const base = useGameStore.getState().baseSites.find(b => b.id === 'base-0')!;
      useGameStore.setState({ baseSites: useGameStore.getState().baseSites.map(b => (b.id === base.id ? { ...b, x: ORIGIN + 3000, y: ORIGIN } : b)) });
      // 画面内(中央): 画面内の前進速度
      setEsc('escort-0', { x: ORIGIN, y: ORIGIN, advanceSpeedMult: 1, advanceSpeedTarget: 1 });
      tickSupp(GT, 1);
      const inside = escById('escort-0').x - ORIGIN;
      // 画面外(右端+200px): 1/5の自動進行
      setEsc('escort-0', { x: ORIGIN + gb.width / 2 + 200, y: ORIGIN });
      const x1 = escById('escort-0').x;
      tickSupp(GT + 1000, 1);
      const outside = escById('escort-0').x - x1;
      expect(inside).toBeGreaterThan(10);
      expect(outside).toBeGreaterThan(0);
      expect(outside / inside).toBeLessThan(0.35); // おおよそ 0.2×個体差(0.85〜1.15)
    });
  }
});
