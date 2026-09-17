// PACING_PUZZLE.md §16-1(bat — 回りながら詰めて掴む)・§16-8b手順6の統合テスト。
//
// 純関数(batOrbitDurationMs/batStrafeAngularMul/batWantsChaffSlot等の値そのもの)は
// chaffMoves.test.ts、biteLungeFrac のbat専用曲線は enemyBite.test.ts に置く。
// ここは「実装精度の規律4」どおり、配線(gameStore.ts の状態機械)を updateEnemies を実際に
// 回して確かめる統合テスト+★受け入れ条件(殴り返せる時間350ms以上)の機械化。
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useGameStore, INVULN_MS } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { applyContactDamage, NOOP_COMBAT_EFFECTS } from '../utils/combatTick';
import { biteSpecFor, biteLungeDistanceAtFire } from '../utils/enemyBite';
import {
  BAT_ORBIT_RADIUS_PX, BAT_GRAB_HOLD_MS, BAT_ORBIT_MIN_MS, BAT_ORBIT_MAX_MS,
} from '../utils/chaffMoves';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import type { Enemy } from '../types/game';

const ORIGIN = 50_000;
const START_GT = 10_000_000;

/** プレイヤーを(ORIGIN,ORIGIN)中心に置き、batをそこから中心間距離distだけ離して置く(静止プレイヤー)。 */
const place = (dist: number, over: Partial<Enemy> = {}): Enemy => {
  const e = { ...spawnEnemyAt('bat', 0, 0, START_GT), ...over };
  e.x = ORIGIN + dist - e.width / 2;
  e.y = ORIGIN - e.height / 2;
  useGameStore.setState(s => ({
    enemies: [e],
    gameTime: START_GT,
    player: {
      ...s.player,
      x: ORIGIN - s.player.width / 2, y: ORIGIN - s.player.height / 2,
      health: 9999, maxHealth: 9999, invulnerable: false, invulnerableTime: 0,
      grabbedUntil: undefined,
    },
  }));
  return e;
};

const tick = (gt: number, dt = 1 / 60) => {
  useGameStore.getState().setGameTime(gt);
  useGameStore.getState().updateEnemies(dt);
};

const first = (): Enemy => useGameStore.getState().enemies[0];

beforeEach(() => {
  setTreesDisabled(true); setTorchesDisabled(true);
  useGameStore.getState().resetGame('assault');
});

describe('構え前(aiPhase未設定=b-approach) → 円(b-orbit)', () => {
  it('円の半径(100px)以内に入った個体はb-orbitへ入り、900〜1800msの尺を持つ', () => {
    place(80);
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).toBe('b-orbit');
    expect(e.aiPhaseUntil).toBeGreaterThanOrEqual(START_GT + BAT_ORBIT_MIN_MS);
    expect(e.aiPhaseUntil).toBeLessThanOrEqual(START_GT + BAT_ORBIT_MAX_MS);
  });

  it('円の外(150px)では何も起きない(aiPhase未設定のまま)', () => {
    place(150);
    tick(START_GT);
    expect(first().aiPhase).toBeUndefined();
  });

  it('★技後CD中は円の半径内に入ってもb-orbitへ入らない', () => {
    place(80, { chaffMoveCdUntil: START_GT + 2000 });
    tick(START_GT);
    expect(first().aiPhase).toBeUndefined();
  });

  it('①走り寄るは等倍(★社長訂正2026-09-16): 円の外側では通常のchaff移動速度のまま近づく', () => {
    const e0 = place(150);
    tick(START_GT);
    const e = first();
    // 中心間距離が縮まっている(=詰めている。①は等倍で遅くしない)。
    const d0 = Math.hypot((e0.x + e0.width / 2) - ORIGIN, (e0.y + e0.height / 2) - ORIGIN);
    const d1 = Math.hypot((e.x + e.width / 2) - ORIGIN, (e.y + e.height / 2) - ORIGIN);
    expect(d1).toBeLessThan(d0);
  });
});

describe('★受け入れ条件11: b-orbit中は円が距離を詰めない・flankより明確に遅い', () => {
  it('60フレーム(1秒)回しても中心間距離が100pxからほぼ動かない(±20%以内)', () => {
    place(BAT_ORBIT_RADIUS_PX, { aiPhase: 'b-orbit', aiPhaseUntil: START_GT + 5000, chaffOrbitCx: ORIGIN, chaffOrbitCy: ORIGIN });
    let t = START_GT;
    for (let i = 0; i < 60; i++) { t += 1000 / 60; tick(t); }
    const e = first();
    const d = Math.hypot((e.x + e.width / 2) - ORIGIN, (e.y + e.height / 2) - ORIGIN);
    expect(d).toBeGreaterThan(BAT_ORBIT_RADIUS_PX * 0.8);
    expect(d).toBeLessThan(BAT_ORBIT_RADIUS_PX * 1.2);
  });

  // ★v0.25.4453: 旧テストは「円は0.45倍で遅い」を縛っていたが、v0.25.4436(「コウモリの円を等倍へ」)で
  // **技としての円は等倍**になった。**半速で回るのは §16-B の間合い保持の層の役目**へ移っている
  // (`KEEP_ORBIT_SPEED_MULT = 0.5`)。⇒ 縛るのは倍率ではなく「**技の円は素の速度を超えない**」の方。
  it('円運動中の実速度は素の実速度を超えない(技の円は等倍・遅くする役は保持層が持つ)', () => {
    const e = place(BAT_ORBIT_RADIUS_PX, { aiPhase: 'b-orbit', aiPhaseUntil: START_GT + 5000, chaffOrbitCx: ORIGIN, chaffOrbitCy: ORIGIN });
    tick(START_GT + 1000 / 60);
    const after = first();
    const spd = Math.hypot(after.vx ?? 0, after.vy ?? 0);
    if (spd > 0.01) expect(spd).toBeLessThanOrEqual(e.speed + 1e-6);
  });
});

describe('★受け入れ条件21: 円を描いているbatを、プレイヤーが近づかずに殴れない', () => {
  it('円運動中、中心間距離は近接リーチ(MELEE_RADIUS=74)より常に外側', () => {
    place(BAT_ORBIT_RADIUS_PX, { aiPhase: 'b-orbit', aiPhaseUntil: START_GT + 5000, chaffOrbitCx: ORIGIN, chaffOrbitCy: ORIGIN });
    let t = START_GT;
    for (let i = 0; i < 90; i++) {
      t += 1000 / 60; tick(t);
      const e = first();
      const d = Math.hypot((e.x + e.width / 2) - ORIGIN, (e.y + e.height / 2) - ORIGIN);
      expect(d).toBeGreaterThan(74);
    }
  });
});

describe('b-orbit → b-windup(引き金: 尺切れ or プレイヤーが半径の内側へ入った)', () => {
  it('尺切れで踏み込みへ(chaffMove=bat-grab・biteAt発火・向き/踏み込み距離を焼く)', () => {
    place(BAT_ORBIT_RADIUS_PX, { aiPhase: 'b-orbit', aiPhaseUntil: START_GT, chaffOrbitCx: ORIGIN, chaffOrbitCy: ORIGIN });
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).toBe('b-windup');
    expect(e.chaffMove).toBe('bat-grab');
    expect(e.chaffMoveAt).toBe(START_GT);
    expect(e.biteAt).toBe(START_GT);
    expect(Math.hypot(e.biteDirX ?? 0, e.biteDirY ?? 0)).toBeCloseTo(1, 5);
    // ★§16-A「踏み込みの終点」: 踏み込み距離は発火時の中心間距離(=円の半径100px)から
    // 接触距離を引いた値を発火の瞬間に焼く(biteLungeDistanceAtFire・追尾しない=以後は読むだけ)。
    expect(e.biteLungePx).toBeCloseTo(biteLungeDistanceAtFire('bat', BAT_ORBIT_RADIUS_PX), 0);
  });

  it('★引き金(b): プレイヤーが半径の内側へ踏み込んだら尺が残っていても即座に踏み込みへ', () => {
    // 円の中心をプレイヤーからずらし、敵は既に「詰められた」距離(半径-余白より内側)に置く。
    place(40, { aiPhase: 'b-orbit', aiPhaseUntil: START_GT + 5000, chaffOrbitCx: ORIGIN, chaffOrbitCy: ORIGIN });
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).toBe('b-windup');
    // ★近距離(40px)から発火した場合も踏み込み距離は動的に(距離−接触距離)で焼かれる。
    expect(e.biteLungePx).toBeCloseTo(biteLungeDistanceAtFire('bat', 40), 0);
  });
});

describe('b-windup/b-lunge/b-grab(720ms級の連続biteAtサイクル・シビア反映で620ms)', () => {
  const spec = biteSpecFor('bat', 'bat-grab');

  it('溜め(250ms)の間はaiPhase=b-windupのまま・動かない(身を低くするだけ)', () => {
    const e0 = place(0, { aiPhase: 'b-windup', chaffMove: 'bat-grab', chaffMoveAt: START_GT, biteAt: START_GT, biteDirX: 1, biteDirY: 0 });
    tick(START_GT + 100);
    const e = first();
    expect(e.aiPhase).toBe('b-windup');
    expect(e.x).toBe(e0.x); expect(e.y).toBe(e0.y); // 溜め中は動かない
  });

  it('250ms経過でb-lungeへ(一気に伸び始める)', () => {
    place(0, { aiPhase: 'b-windup', chaffMove: 'bat-grab', chaffMoveAt: START_GT, biteAt: START_GT, biteDirX: 1, biteDirY: 0 });
    tick(START_GT + 260);
    expect(first().aiPhase).toBe('b-lunge');
  });

  it(`windupMs(${spec.windupMs}ms)経過でb-grabへ(掴み=カウンター受付幅)`, () => {
    place(0, { aiPhase: 'b-lunge', chaffMove: 'bat-grab', chaffMoveAt: START_GT, biteAt: START_GT, biteDirX: 1, biteDirY: 0 });
    tick(START_GT + spec.windupMs + 5);
    expect(first().aiPhase).toBe('b-grab');
  });

  it('★掴みのBiteSpecは技だけで引ける(counterable:true・実行220ms・拘束500ms相当のホールド)', () => {
    expect(spec.counterable).toBe(true);
    expect(spec.biteMs).toBe(220);
    expect(spec.windupMs).toBe(400); // 250(溜め)+150(踏み込み)=シビア反映後
  });
});

describe('b-grab解決 → b-release(留まる→離す→後ずさる)', () => {
  it('掴みが解決(biteAt=0)したらb-releaseへ(一拍=BAT_GRAB_HOLD_MS留まる)', () => {
    place(0, { aiPhase: 'b-grab', chaffMove: 'bat-grab', biteAt: 0 });
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).toBe('b-release');
    expect(e.aiPhaseUntil).toBe(START_GT + BAT_GRAB_HOLD_MS);
    expect(e.vx).toBe(0); expect(e.vy).toBe(0);
  });

  it('一拍の間は動かない', () => {
    const e0 = place(0, { aiPhase: 'b-release', aiPhaseUntil: START_GT + 300, chaffMove: 'bat-grab' });
    tick(START_GT);
    const e = first();
    expect(e.x).toBe(e0.x); expect(e.y).toBe(e0.y);
  });

  it('一拍明けで円の外まで後ずさる(プレイヤーから離れる方向へ移動)', () => {
    const e0 = place(0, { aiPhase: 'b-release', aiPhaseUntil: START_GT, chaffMove: 'bat-grab' });
    tick(START_GT);
    const e = first();
    const d0 = Math.hypot((e0.x + e0.width / 2) - ORIGIN, (e0.y + e0.height / 2) - ORIGIN);
    const d1 = Math.hypot((e.x + e.width / 2) - ORIGIN, (e.y + e.height / 2) - ORIGIN);
    expect(d1).toBeGreaterThan(d0); // 離れている
    expect(e.chaffMove).toBe('bat-grab'); // ★後退は技の続き(§16-7b)
  });

  it('円の外まで下がったら技の終わり(chaffMove消滅+技後CD≒4000ms±12%)', () => {
    place(BAT_ORBIT_RADIUS_PX + 1, { aiPhase: 'b-release', aiPhaseUntil: START_GT, chaffMove: 'bat-grab' });
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).toBeUndefined();
    expect(e.chaffMove).toBeUndefined();
    expect(e.chaffMoveCdUntil).toBeGreaterThanOrEqual(START_GT + 4000 * 0.88);
    expect(e.chaffMoveCdUntil).toBeLessThanOrEqual(START_GT + 4000 * 1.12);
  });
});

describe('★受け入れ条件15: batの掴みが、静止しているプレイヤーに当たる', () => {
  it('体が重なっていれば必ず当たる(空振り0回)', () => {
    const e = place(0, { aiPhase: 'b-grab', chaffMove: 'bat-grab' });
    const spec = biteSpecFor('bat', 'bat-grab');
    useGameStore.setState({ enemies: [{ ...e, biteAt: START_GT - (spec.windupMs + spec.biteMs) }] });
    const hpBefore = useGameStore.getState().player.health;
    useGameStore.getState().setGameTime(START_GT);
    applyContactDamage(START_GT, false, 0, NOOP_COMBAT_EFFECTS);
    const hpAfter = useGameStore.getState().player.health;
    expect(hpAfter).toBeLessThan(hpBefore);
    expect(useGameStore.getState().enemies[0].biteAt).toBe(0);
  });
});

describe('★掴みは文字通り掴む(社長裁定2026-09-16): ダメージが実際に入った時だけ拘束する', () => {
  it('ヒットが成立するとplayer.grabbedUntilがgameTime+500msへ立つ', () => {
    const e = place(0, { aiPhase: 'b-grab', chaffMove: 'bat-grab' });
    const spec = biteSpecFor('bat', 'bat-grab');
    useGameStore.setState({ enemies: [{ ...e, biteAt: START_GT - (spec.windupMs + spec.biteMs) }] });
    useGameStore.getState().setGameTime(START_GT);
    applyContactDamage(START_GT, false, 0, NOOP_COMBAT_EFFECTS);
    expect(useGameStore.getState().player.grabbedUntil).toBe(START_GT + BAT_GRAB_HOLD_MS);
  });

  it('★連続で掴まれない: 被弾無敵(1000ms)中の2体目の掴みはgrabbedUntilを更新しない(空振り)', () => {
    const e1 = place(0, { id: 'bat-a', aiPhase: 'b-grab', chaffMove: 'bat-grab' });
    const spec = biteSpecFor('bat', 'bat-grab');
    const e2 = { ...spawnEnemyAt('bat', 0, 0, START_GT), id: 'bat-b', aiPhase: 'b-grab' as const, chaffMove: 'bat-grab' as const };
    e2.x = e1.x; e2.y = e1.y;
    useGameStore.setState({
      enemies: [
        { ...e1, biteAt: START_GT - (spec.windupMs + spec.biteMs) },
        { ...e2, biteAt: START_GT - (spec.windupMs + spec.biteMs) },
      ],
    });
    useGameStore.getState().setGameTime(START_GT);
    applyContactDamage(START_GT, false, 0, NOOP_COMBAT_EFFECTS);
    const grabbedAfterFirst = useGameStore.getState().player.grabbedUntil;
    expect(grabbedAfterFirst).toBe(START_GT + BAT_GRAB_HOLD_MS);
    // 1体目に掴まれた直後、まだ無敵中(INVULN_MS=1000)に2体目の噛みも解決させる。
    // (biteHitsは同一tick内で両方載るのが通常だが、ここでは「無敵で弾かれた掴みが拘束を
    // 上書きしない」ことを見るため、2回目のapplyContactDamage呼び出しとして再現する。)
    useGameStore.setState(st => ({
      enemies: st.enemies.map(en => en.id === 'bat-b' ? { ...en, biteAt: START_GT - (spec.windupMs + spec.biteMs) } : en),
    }));
    applyContactDamage(START_GT, false, 0, NOOP_COMBAT_EFFECTS);
    // 無敵で弾かれるので、grabbedUntilは最初のまま(動けなくなる期間が延長されない)。
    expect(useGameStore.getState().player.grabbedUntil).toBe(grabbedAfterFirst);
  });
});

describe('★受け入れ条件38/39: 掴まれている間は移動・射撃・近接ができない', () => {
  it('grabbedUntilが未来ならbeginMeleeSwingは失敗する', () => {
    useGameStore.setState(s => ({ player: { ...s.player, grabbedUntil: s.gameTime + 500 } }));
    expect(useGameStore.getState().beginMeleeSwing()).toBe(false);
  });
  it('grabbedUntilが過去ならbeginMeleeSwingは通常どおり成立する', () => {
    useGameStore.setState(s => ({ player: { ...s.player, grabbedUntil: s.gameTime - 1, counterCooldownEnd: 0, pendingSwingAt: 0 } }));
    expect(useGameStore.getState().beginMeleeSwing()).toBe(true);
  });
});

describe('★受け入れ条件(350ms): 技が終わってから殴り返せる時間(被弾無敵1000msと重ならない分)が350ms以上', () => {
  let now = 1_000_000;
  beforeEach(() => { now = 1_000_000; vi.spyOn(Date, 'now').mockImplementation(() => now); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('掴みが解決してから(chaffMoveが消えて)技後CDへ入るまでの窓 − 被弾無敵1000ms ≧ 350ms', () => {
    const e = place(0, { aiPhase: 'b-grab', chaffMove: 'bat-grab' });
    const spec = biteSpecFor('bat', 'bat-grab');
    useGameStore.setState({ enemies: [{ ...e, biteAt: START_GT - (spec.windupMs + spec.biteMs) }] });
    useGameStore.getState().setGameTime(START_GT);
    now = 1_000_000;
    applyContactDamage(START_GT, false, 0, NOOP_COMBAT_EFFECTS); // ダメージが入る瞬間=hitAt
    const hitAtGt = START_GT;
    const hitAtNow = now;
    expect(useGameStore.getState().player.invulnerable).toBe(true);

    // 以後、gameTimeとDate.nowを同じ歩幅で進めながらupdateEnemiesを回し、chaffMoveが消える
    // (=技の終わり。後退が円の外まで完了した)瞬間のgameTimeを techEndAt として記録する。
    let t = hitAtGt;
    let techEndAt = -1;
    for (let i = 0; i < 600; i++) { // 最大10秒ぶん(60fps*600=10秒)
      t += 1000 / 60; now = hitAtNow + (t - hitAtGt);
      tick(t);
      if (first().chaffMove === undefined) { techEndAt = t; break; }
    }
    expect(techEndAt).toBeGreaterThan(0); // ちゃんと技が終わっている(無限ループしていない)

    const punishWindowMs = techEndAt - hitAtGt;
    const netPunishMs = punishWindowMs - INVULN_MS; // 被弾無敵と重なっている分は数えない
    expect(netPunishMs).toBeGreaterThanOrEqual(350);

    // 実際に「殴れる」条件(掴まれてもいない・無敵でもない瞬間が350ms以上あるか)も直接確認する。
    let freeMs = 0;
    let tt = hitAtGt;
    for (let i = 0; i < 600; i++) {
      tt += 1000 / 60;
      const nowAt = hitAtNow + (tt - hitAtGt);
      const invulnNow = (nowAt - hitAtNow) < INVULN_MS;
      const grabbedNow = (useGameStore.getState().player.grabbedUntil ?? 0) > tt;
      if (tt <= techEndAt && !invulnNow && !grabbedNow) freeMs += 1000 / 60;
      if (tt >= techEndAt) break;
    }
    expect(freeMs).toBeGreaterThanOrEqual(350 - 1); // フレーム丸めの誤差1ms未満は許容
  });
});
