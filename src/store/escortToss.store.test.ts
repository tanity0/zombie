// research/ESCORT_TOSS.md v3.1(兵士の蹴り飛ばし)の配線テスト: updateSuppression(蹴りの制御+軍人の map)→ updateEnemies を
// 実際に回して、画面内の気絶中の敵へ一番近い兵士が0.5秒で背後へ跳び、蹴り、敵がプレイヤーの手前へ地面を滑って止まることを見る。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import {
  ESCORT_TOSS_MS, ESCORT_TOSS_STOP_PX, ESCORT_TOSS_CD_MS, ESCORT_KICK_TO_HIT_MS, ESCORT_KICK_RECOVER_MS,
  ESCORT_KICK_CROUCH_MS, ESCORT_KICK_JUMP_MS,
} from '../utils/escortToss';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';

const enemy = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;
let px = 0, py = 0;
beforeEach(() => {
  setTreesDisabled(true); setTorchesDisabled(true);
  useGameStore.getState().resetGame('warrior');
  const st = useGameStore.getState();
  px = st.player.x + st.player.width / 2;
  py = st.player.y + st.player.height / 2;
  useGameStore.setState(s => ({
    enemies: [], gameTime: 100_000, activeEvent: null,
    camera: { x: px - 400, y: py - 300 }, viewZoom: 1,
    player: { ...s.player, lastDirection: { x: 1, y: 0 } },
  }));
});
const put = (dx: number, dy = 0, stunMs = 5000) => {
  const st = useGameStore.getState();
  const e = { ...spawnEnemyAt('zombie', px + dx - 15, py + dy - 15, st.gameTime), width: 30, height: 30, health: 50, maxHealth: 50, speed: 0 };
  useGameStore.setState(s => ({ enemies: [...s.enemies, e] }));
  useGameStore.getState().stunEnemy(e.id, st.gameTime + stunMs);
  return e.id;
};
const step = (ms: number) => {
  const st = useGameStore.getState();
  useGameStore.setState({ gameTime: st.gameTime + ms });
  useGameStore.getState().updateSuppression(ms / 1000);
  useGameStore.getState().updateEnemies(ms / 1000);
};
const run = (ms: number, dt = 16) => { for (let t = 0; t < ms; t += dt) step(dt); };
const distToPlayer = (id: string) => { const e = enemy(id); return Math.hypot(e.x + e.width / 2 - px, e.y + e.height / 2 - py); };

describe('兵士の蹴り飛ばし v3.1', () => {
  it('画面内の気絶中の敵へ兵士が0.5秒で背後へ跳び、蹴って、敵がプレイヤーの手前まで滑って止まる(気絶はそのまま)', () => {
    const id = put(300, -40);
    step(16);
    const k = useGameStore.getState().escortKick;
    expect(k?.enemyId).toBe(id);
    const kicker = k!.escortId;
    // 跳び終わり(0.5秒)で兵士は蹴る位置に居る=敵の向こう側(プレイヤーから見て敵より遠い)
    run(ESCORT_KICK_CROUCH_MS + ESCORT_KICK_JUMP_MS + 20);
    const esc = useGameStore.getState().escorts.find(e => e.id === kicker)!;
    const ex = enemy(id).x + 15, ey = enemy(id).y + 15;
    expect(Math.hypot(esc.x - px, esc.y - py)).toBeGreaterThan(Math.hypot(ex - px, ey - py));
    // 命中→滑り込み→到着
    run(ESCORT_KICK_TO_HIT_MS - ESCORT_KICK_CROUCH_MS - ESCORT_KICK_JUMP_MS + ESCORT_TOSS_MS + 80);
    expect(enemy(id).escortToss).toBeUndefined();
    expect(enemy(id).escortTossLandedAt).toBeDefined();
    expect(distToPlayer(id)).toBeCloseTo(ESCORT_TOSS_STOP_PX, 0);
    expect((enemy(id).stunUntil ?? 0) > useGameStore.getState().gameTime).toBe(true);
    run(ESCORT_KICK_RECOVER_MS + 40);
    expect(useGameStore.getState().escortKick).toBeNull();
  });
  it('割り当て中の兵士は撃たない(蹴りに行く敵を自分で倒さない)', () => {
    const id = put(300, -40);
    step(16);
    const before = useGameStore.getState().projectiles.filter(p => p.weaponKey === 'escort' && p.escortId === useGameStore.getState().escortKick!.escortId).length;
    run(ESCORT_KICK_TO_HIT_MS - 40);
    const after = useGameStore.getState().projectiles.filter(p => p.weaponKey === 'escort' && p.escortId === useGameStore.getState().escortKick?.escortId).length;
    expect(after).toBe(before);
    expect(enemy(id).health).toBe(50);
  });
  it('間隔8秒・同時1件・気絶の残りが足りない敵とすぐそばの敵は対象外', () => {
    put(300, -40);
    put(-300, 40);
    step(16);
    const first = useGameStore.getState().escortKick!;
    expect(first).not.toBeNull();
    run(ESCORT_KICK_TO_HIT_MS + ESCORT_KICK_RECOVER_MS + 100);
    expect(useGameStore.getState().escortKick).toBeNull(); // 8秒たつまで次は来ない
    useGameStore.setState(s => ({ gameTime: s.gameTime + ESCORT_TOSS_CD_MS }));
    useGameStore.setState(s => ({ enemies: s.enemies.map(e => ({ ...e, stunUntil: s.gameTime + 5000 })) }));
    step(16);
    expect(useGameStore.getState().escortKick).not.toBeNull();
    // 残りが足りない・すぐそば
    useGameStore.getState().resetGame('warrior');
    useGameStore.setState(s => ({ enemies: [], gameTime: 100_000, activeEvent: null, camera: { x: px - 400, y: py - 300 }, viewZoom: 1, player: { ...s.player } }));
    put(300, -40, 700);
    put(100, 0);
    step(16);
    expect(useGameStore.getState().escortKick).toBeNull();
  });
  it('気絶が切れたら中止し、同じ気絶中の同じ敵へは割り当て直さない', () => {
    const id = put(300, -40);
    step(16);
    expect(useGameStore.getState().escortKick).not.toBeNull();
    useGameStore.setState(s => ({ enemies: s.enemies.map(e => e.id === id ? { ...e, stunUntil: s.gameTime + 1 } : e) }));
    run(ESCORT_KICK_CROUCH_MS + ESCORT_KICK_JUMP_MS + 40);
    expect(useGameStore.getState().escortKick).toBeNull();
    expect(enemy(id).escortToss).toBeUndefined();
  });
  it('着地後の押しの飛距離は、蹴られていない個体と同じ(ノックバックの欄を使わない)', () => {
    const a = put(300, -40);
    step(16);
    run(ESCORT_KICK_TO_HIT_MS + ESCORT_TOSS_MS + 60);
    const b = put(-300, 60);
    const ay0 = enemy(a).y, by0 = enemy(b).y;
    useGameStore.getState().knockbackEnemy(a, 0, 1, 1);
    useGameStore.getState().knockbackEnemy(b, 0, 1, 1);
    for (let k = 0; k < 20; k++) { useGameStore.setState(s => ({ gameTime: s.gameTime + 16 })); useGameStore.getState().updateEnemies(0.016); }
    const da = enemy(a).y - ay0, db = enemy(b).y - by0;
    expect(db).toBeGreaterThan(1);
    expect(Math.abs(da - db)).toBeLessThan(db * 0.03);
  });
});
