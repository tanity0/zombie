// research/GHOST_BOSS.md v6(守護霊ボス「幻影」v2「守護霊ミラー」)の結合テスト+不変条件。
//
// ここで守りたいのは「実装が動くか」ではなく、**裁定が壊れていないか**:
//  ① 即発近接が**プレイヤーと同じ周期**で出て、当たればプレイヤーのHPが減る(予告も硬直も無い)
//  ② 被弾無敵中は**7系統すべて**でダメージ0(1経路でも素通りがあれば「無敵が存在しない」)
//  ③ パリィ成立 → gpParriedAt → **次tickで周期を無視した割り込み反撃**が出る
//  ④ 銃ミラー: 敵弾が生成され、マガジン切れ(リロード中)は撃たない
//  ⑤ 通常被弾のノックバック中も**止まらない**(プレイヤーと同条件=止める手段は無い)
//  ⑥ 【不変条件】幻影に体勢値(紫)が積まれない / phantomGate は幻影以外の敵に恒等 / gp州が残っていない
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  runPhantomTick, createPhantomTickState, pickActivePhantom, phantomProfile, edgeDistTo,
  PHANTOM_MELEE_PERIOD_MS, GUARDIAN_PHANTOM_TYPE, NOOP_PHANTOM_SFX,
} from './phantomTick';
import { phantomHitGate } from './phantomGate';
import { GUARDIAN_PHANTOM_TUNING as GP_T, PVP_DAMAGE_SCALE } from './phantomScript';
import { phantomMeleeDamage } from './phantomTick';
import { COUNTER_REACH_DECL } from './counterReach';
import { usesPostureSystem, applyBossPostureDamage } from './bossPosture';
import { strongestGuardian } from '../data/fixedGuardians';
import { PLAYER_PROFILES } from '../data/playerProfiles';
import { useGameStore, INVULN_MS } from '../store/gameStore';
import { spawnEnemyAt } from './enemyUtils';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import type { Enemy } from '../types/game';

// gameTimeの起点を0にしない(gpHitAt などの既定0と、tick開始直後の時刻が偶然近づくのを避ける)。
const START_GT = 10_000_000;
const ORIGIN = 50_000; // 原点から遠く離す=施設/街プロップと無縁

/** 幻影1体+プレイヤーの盤面を作り、tickを手動で進めるヘルパ(bountyTick.test.ts の setup を踏襲)。 */
const setup = (playerOffsetX: number, over: Partial<Enemy> = {}) => {
  const e = spawnEnemyAt(GUARDIAN_PHANTOM_TYPE, ORIGIN, ORIGIN, START_GT);
  Object.assign(e, over);
  useGameStore.setState(s => ({
    enemies: [e],
    gameTime: START_GT,
    player: {
      ...s.player,
      x: e.x + e.width / 2 + playerOffsetX, y: e.y + e.height / 2 - s.player.height / 2,
      health: 9999, maxHealth: 9999, invulnerable: false, invulnerableTime: 0,
    },
  }));
  let gt = START_GT;
  const s = createPhantomTickState();
  const step = (ms: number): void => {
    gt += ms;
    useGameStore.setState({ gameTime: gt });
    const cur = useGameStore.getState().enemies.find(x => x.id === e.id);
    // headless では Date.now 基準の代わりに gt を流用する(どちらも相対時間しか使わない)。
    if (cur) runPhantomTick(cur, s, gt, ms / 1000, 1, gt, NOOP_PHANTOM_SFX, () => 0.999);
  };
  const cur = (): Enemy => useGameStore.getState().enemies.find(x => x.id === e.id)!;
  return { id: e.id, step, cur, state: s, gt: () => gt };
};

beforeEach(() => {
  setTreesDisabled(true);
  setTorchesDisabled(true);
  useGameStore.getState().resetGame('assault');
});
afterEach(() => { vi.restoreAllMocks(); });

describe('① 即発近接(予告なし・プレイヤーと同じ周期)', () => {
  it('射程内なら1tick目で振り、当たればプレイヤーのHPが減る(溜めを待たない)', () => {
    const { step, cur } = setup(80);
    const hp0 = useGameStore.getState().player.health;
    step(16);
    const gp = cur();
    expect(gp.gpSwingAt).toBeDefined();                       // 振った(=即発)
    expect(gp.bossState).toBeUndefined();                     // 州機械は使わない(予告も硬直も無い)
    // 初期近接武器の実ダメージ(v0.25.3641裁定)×対人1/10(社長裁定2026-08-20)。
    expect(useGameStore.getState().player.health).toBe(hp0 - phantomMeleeDamage() * PVP_DAMAGE_SCALE);
  });

  it('次の振りは**プレイヤーの近接の実効周期**(COUNTER_WINDOW+COUNTER_COOLDOWN)を待つ', () => {
    const { step, cur } = setup(80);
    step(16);
    const first = cur().gpSwingAt!;
    step(PHANTOM_MELEE_PERIOD_MS - 100);
    expect(cur().gpSwingAt).toBe(first);                      // 周期の途中では振らない
    step(200);
    expect(cur().gpSwingAt).toBeGreaterThan(first);           // 周期が明けたら振る
  });

  it('射程(reach)の外では振らない=判定と同じ物差し(edgeDistTo)で測っている', () => {
    const { step, cur } = setup(GP_T.melee.reach + 200);
    expect(edgeDistTo(
      cur().x + cur().width / 2, cur().y + cur().height / 2, useGameStore.getState().player,
    )).toBeGreaterThan(GP_T.melee.reach);
    step(16);
    expect(cur().gpSwingAt).toBeUndefined();
  });
});

describe('② 被弾無敵: 7系統すべてでダメージ0(1経路でも素通りがあれば無敵が存在しないのと同じ)', () => {
  /** 幻影を「たった今、有効打を受けた」状態にする(=以後 INVULN_MS はダメージ0)。 */
  const armInvuln = (id: string): void => {
    const gt = useGameStore.getState().gameTime;
    useGameStore.setState(s => ({ enemies: s.enemies.map(e => e.id === id ? { ...e, gpHitAt: gt } : e) }));
  };
  const hpOf = (id: string): number => useGameStore.getState().enemies.find(e => e.id === id)!.health;

  it('①damageEnemy(銃・サブ・爆発の合流点)', () => {
    const { id } = setup(40);
    armInvuln(id);
    const hp = hpOf(id);
    useGameStore.getState().damageEnemy(id, 500, false, false, false, 'gun', 'player');
    expect(hpOf(id)).toBe(hp);
  });

  it('①damageEnemy(カウンター反撃=postureImpact:counter もゲートされる)', () => {
    const { id } = setup(40);
    armInvuln(id);
    const hp = hpOf(id);
    useGameStore.getState().damageEnemy(id, 500, false, true, false, 'other', 'player', 'counter');
    expect(hpOf(id)).toBe(hp);
  });

  it('②triggerCounter(プレイヤーの近接スイング)', () => {
    const { id } = setup(20);
    armInvuln(id);
    const hp = hpOf(id);
    const res = useGameStore.getState().triggerCounter();
    expect(hpOf(id)).toBe(hp);
    expect(res.hit).toBe(false);   // 戻り値にも数えない(SEが鳴らない=M1の契約)
    expect(res.killed).toBe(0);
  });

  it('③shadowCloneStrike(分身)', () => {
    const { id } = setup(20);
    armInvuln(id);
    const hp = hpOf(id);
    const p = useGameStore.getState().player;
    useGameStore.getState().shadowCloneStrike({
      x: p.x, y: p.y, width: p.width, height: p.height, facingLeft: false,
      characterClass: p.characterClass, spawnedAt: 0, attacksDone: 0, nextAttackAt: 0,
    });
    expect(hpOf(id)).toBe(hp);
  });

  it('④performKatanaStrike(刀)', () => {
    const { id } = setup(20);
    useGameStore.setState(s => ({ player: { ...s.player, subWeapons: ['katana'] } }));
    armInvuln(id);
    const hp = hpOf(id);
    const res = useGameStore.getState().performKatanaStrike([id], 1, true, undefined);
    expect(hpOf(id)).toBe(hp);
    expect(res.hit).toBe(false);
  });

  it('⑤performWhipStrike(鞭)', () => {
    const { id } = setup(20);
    armInvuln(id);
    const hp = hpOf(id);
    const res = useGameStore.getState().performWhipStrike([id]);
    expect(hpOf(id)).toBe(hp);
    expect(res.hits).toBe(0);
  });

  it('⑥skaterBoardHit(スケボー)', () => {
    const { id } = setup(20);
    armInvuln(id);
    const hp = hpOf(id);
    const e = useGameStore.getState().enemies.find(x => x.id === id)!;
    useGameStore.getState().skaterBoardHit(e.x + e.width / 2, e.y + e.height / 2, 1, 0);
    expect(hpOf(id)).toBe(hp);
  });

  it('⑦接触=そもそも素通り(contact damage 0・phantomTick 以外は幻影を動かさない)', () => {
    const { id } = setup(0);
    const before = useGameStore.getState().player.health;
    useGameStore.getState().updateEnemies(0.016);
    expect(useGameStore.getState().player.health).toBe(before);
    expect(useGameStore.getState().enemies.find(e => e.id === id)).toBeDefined();
  });

  it('無敵が明ければ通る(=無敵は「1秒に1回」であって「無敵化」ではない)', () => {
    const { id } = setup(400);
    armInvuln(id);
    const hp = hpOf(id);
    useGameStore.setState(s => ({ gameTime: s.gameTime + INVULN_MS }));
    useGameStore.getState().damageEnemy(id, 100, false, false, false, 'gun', 'player');
    expect(hpOf(id)).toBeLessThan(hp);
  });

  it('phantomGate 単体: 無敵/パリィ/通過の全分岐(rand注入で固定)', () => {
    const base = {
      enemyType: GUARDIAN_PHANTOM_TYPE, amount: 100, gameTime: 5000,
      invulnMs: 1000, counterChance: 0.5, parryCdMs: 1000,
    } as const;
    // 無敵中(近接でも銃でも0)。
    for (const source of ['melee', 'counter', 'ranged'] as const) {
      const r = phantomHitGate({ ...base, source, gpHitAt: 4500, rand: () => 0 });
      expect(r.damage).toBe(0);
      expect(r.effects).toBe(false);
      expect(r.blocked).toBe(true);
      expect(r.patch.gpBlockedAt).toBe(5000);
    }
    // 無敵外・近接・抽選当たり=パリィ。
    const parry = phantomHitGate({ ...base, source: 'melee', rand: () => 0 });
    expect(parry.parried).toBe(true);
    expect(parry.damage).toBe(0);
    expect(parry.patch.gpParriedAt).toBe(5000);
    expect(parry.patch.gpParryCdUntil).toBe(6000);
    // パリィCD中は抽選しない=通る。
    const cd = phantomHitGate({ ...base, source: 'melee', gpParryCdUntil: 9999, rand: () => 0 });
    expect(cd.parried).toBe(false);
    expect(cd.damage).toBe(100);
    // カウンター反撃・弾以外の遠隔(サブ/爆発)はパリィ不可(抽選当たりでも通る)。
    for (const source of ['counter', 'ranged'] as const) {
      const r = phantomHitGate({ ...base, source, rand: () => 0 });
      expect(r.parried).toBe(false);
      expect(r.damage).toBe(100);
      expect(r.patch.gpHitAt).toBe(5000);
    }
    // 抽選外れ=通る。
    expect(phantomHitGate({ ...base, source: 'melee', rand: () => 0.999 }).damage).toBe(100);
  });

  // ★v0.25.3665(社長指摘「鴉、銃の弾反撃しないよ?」): プレイヤーの銃弾('bullet')もパリィ対象。
  it('phantomGate 単体: 銃弾のパリィは gpBulletParriedAt に打刻(近接の gpParriedAt とは別の合図)', () => {
    const base = {
      enemyType: GUARDIAN_PHANTOM_TYPE, amount: 100, gameTime: 5000,
      invulnMs: 1000, counterChance: 0.5, parryCdMs: 1000,
    } as const;
    const r = phantomHitGate({ ...base, source: 'bullet', rand: () => 0 });
    expect(r.parried).toBe(true);
    expect(r.damage).toBe(0);
    expect(r.effects).toBe(false);
    expect(r.patch.gpBulletParriedAt).toBe(5000);   // 弾ヒット処理が同tickで消費=弾を打ち返す
    expect(r.patch.gpParriedAt).toBeUndefined();    // 近接反撃・プレイヤーshoveは出さない
    expect(r.patch.gpParryCdUntil).toBe(6000);      // CDは近接と共有
    // CD中の弾は抽選せず通る(i-frameの起点を打つ)。
    const cd = phantomHitGate({ ...base, source: 'bullet', gpParryCdUntil: 9999, rand: () => 0 });
    expect(cd.parried).toBe(false);
    expect(cd.damage).toBe(100);
    expect(cd.patch.gpHitAt).toBe(5000);
  });
});

// ★v0.25.3640(成果物監査の機械化)
describe('★成果物監査の再発防止(v0.25.3640)', () => {
  it('Q1-3: 幻影の近接が実際に減らした時だけ被弾SE(hurt)が鳴る(damagePlayerの戻り値は「死んだか」)', () => {
    const { step } = setup(40);
    let hurt = 0;
    const sfx = { ...NOOP_PHANTOM_SFX, hurt: () => { hurt += 1; } };
    // setupのstepはNOOP固定なので、ここは直接runPhantomTickを1回だけ回す。
    const st = useGameStore.getState();
    const e = st.enemies[0];
    const s = createPhantomTickState();
    runPhantomTick(e, s, START_GT + 16, 0.016, 1, START_GT + 16, sfx, () => 0.999);
    expect(hurt).toBe(1); // 当たった=鳴る
    // プレイヤーがi-frame中は減らない=鳴らない。
    useGameStore.setState(ps => ({ player: { ...ps.player, invulnerable: true, invulnerableTime: Date.now() } }));
    const s2 = createPhantomTickState();
    runPhantomTick(useGameStore.getState().enemies[0], s2, START_GT + 5000, 0.016, 1, START_GT + 5000, sfx, () => 0.999);
    expect(hurt).toBe(1); // 増えない
    void step; // setupのヘルパは未使用(直接tickで検証)
  });

  it('監査C: 0ダメージのヒットはゲートを通らない(無害な弾でi-frameが始まらない)', () => {
    const { id } = setup(400);
    useGameStore.getState().damageEnemy(id, 0, false, false, false, 'gun', 'player');
    expect(useGameStore.getState().enemies.find(e => e.id === id)!.gpHitAt).toBeUndefined();
    // 直後の有効打は普通に通る(0ダメ弾が無敵を張っていない)。
    const hp = useGameStore.getState().enemies.find(e => e.id === id)!.health;
    useGameStore.getState().damageEnemy(id, 100, false, false, false, 'gun', 'player');
    expect(useGameStore.getState().enemies.find(e => e.id === id)!.health).toBeLessThan(hp);
  });

  it('監査A: 近接由来(gpSource=melee)の damageEnemy はパリィ抽選に掛かる(スラッシャー追撃の経路)', () => {
    const { id } = setup(400);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const hp = useGameStore.getState().enemies.find(e => e.id === id)!.health;
    useGameStore.getState().damageEnemy(id, 100, false, false, false, 'other', 'player', null, 1, 'melee');
    const e = useGameStore.getState().enemies.find(x => x.id === id)!;
    expect(e.health).toBe(hp);                                        // パリィ=ダメージ0
    expect(e.gpParriedAt).toBe(useGameStore.getState().gameTime);     // 反撃の合図が立つ
  });
});

describe('③ パリィ(counterChanceのミラー)→ 次tickで割り込み反撃', () => {
  it('近接がパリィされると gpParriedAt が立ち、次tickで周期を無視して振り返す', () => {
    const { id, step, cur, state } = setup(40);
    // 抽選を確実に当てる(ゲートの発火点は gameStore 側なので Math.random を固定する)。
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(phantomProfile().counterChance).toBeGreaterThan(0);
    const hp = useGameStore.getState().enemies.find(e => e.id === id)!.health;
    const e = useGameStore.getState().enemies.find(x => x.id === id)!;
    useGameStore.getState().skaterBoardHit(e.x + e.width / 2, e.y + e.height / 2, 1, 0);
    const parried = cur();
    expect(parried.gpParriedAt).toBe(useGameStore.getState().gameTime);
    expect(parried.health).toBe(hp);                       // パリィ=ダメージ0
    // 近接周期を遠い未来へ置く=「周期を無視した割り込み」であることを固定する。
    state.nextMeleeAt = START_GT + 1_000_000;
    step(16);
    expect(cur().gpSwingAt).toBeDefined();                 // 反撃が出た
    expect(state.nextMeleeAt).toBeLessThan(START_GT + 1_000_000); // 反撃後は周期タイマーがリセットされる
  });
});

describe('④ 銃ミラー(台帳武器の実性能・リロードの息継ぎ)', () => {
  it('敵弾が生成される(弾は共通の赤い二重丸=hostile な敵弾)', () => {
    const { id, step } = setup(150);
    let fired = 0;
    for (let i = 0; i < 200 && fired === 0; i++) {
      step(50);
      fired = useGameStore.getState().projectiles.filter(p => p.hostile && p.ownerId === id).length;
    }
    expect(fired).toBeGreaterThan(0);
  });

  it('マガジン切れ(リロード中)は撃たない=息継ぎがある', () => {
    const { id, step, state } = setup(150);
    step(50);
    expect(state.gun).not.toBeNull();
    // マガジンを空にする→次tickで beginWeaponReload が走り、リロード中は1発も出ない。
    state.gun = { ...state.gun!, magazine: 0 };
    useGameStore.setState({ projectiles: [] });
    step(50);
    expect(state.reloadingWeaponId).not.toBe('');
    for (let i = 0; i < 10; i++) step(50);
    expect(useGameStore.getState().projectiles.filter(p => p.hostile && p.ownerId === id).length).toBe(0);
  });

  // ★社長裁定v0.25.3641「スキルまだ無いんだよね?そしたら武器とかも初期で」:
  // 銃=台帳クラスの**初期銃**(スキル・サブ再現が無い現段階は装備も初期で条件を揃える。
  // snapshot.activeGunKey へ戻すのはスキル再現が入る第3弾の候補)。数値を発明していないことは不変。
  it('銃は台帳クラスの初期銃(PLAYER_PROFILES)から作る=数値を発明していない', () => {
    const { step, state } = setup(150);
    step(16);
    expect(state.gun?.key).toBe(PLAYER_PROFILES[strongestGuardian().classId].gunKey);
  });
});

describe('⑤ 殴り続けても止まらない(通常被弾のノックバックで技も移動も止まらない)', () => {
  it('knockbackUntil の最中でも近接を振る', () => {
    const { step, cur, id } = setup(80);
    useGameStore.setState(s => ({
      enemies: s.enemies.map(e => e.id === id ? { ...e, knockbackUntil: START_GT + 5000 } : e),
    }));
    step(16);
    expect(cur().gpSwingAt).toBeDefined();
  });

  it('気絶(stunUntil)では従来どおり止まる=「止まらない」のは通常被弾のノックバックだけ', () => {
    const { step, cur, id } = setup(80);
    useGameStore.setState(s => ({
      enemies: s.enemies.map(e => e.id === id ? { ...e, stunUntil: START_GT + 5000 } : e),
    }));
    step(16);
    expect(cur().gpSwingAt).toBeUndefined();
  });
});

describe('⑥ 【不変条件】撤去したものが戻ってこない', () => {
  it('幻影は体勢値(紫)を持たない=積まれない(裁定「そもそも紫ゲージ無くす」)', () => {
    expect(usesPostureSystem({ type: GUARDIAN_PHANTOM_TYPE })).toBe(false);
    const e = { type: GUARDIAN_PHANTOM_TYPE, bossPosture: 100 } as unknown as Enemy;
    for (const impact of ['counter', 'melee', 'heavy', 'gun-crit', 'reflect'] as const) {
      expect(applyBossPostureDamage(e, impact, 1000)).toBeNull();
    }
  });

  it('phantomGate は幻影以外の敵に恒等(通常敵のダメージ・副作用に1bitも影響しない)', () => {
    for (const type of ['zombie', 'giantbat', 'bounty-ranged', 'pumpkin', 'mimir']) {
      const r = phantomHitGate({
        enemyType: type, amount: 77, source: 'melee', gameTime: 5000,
        invulnMs: 1000, counterChance: 1, parryCdMs: 1000,
        gpHitAt: 4999, // 幻影ならこれで無敵ブロックされる条件を、あえて渡す
        rand: () => 0, // 幻影ならこれで必ずパリィされる乱数を、あえて渡す
      });
      expect(r.damage, type).toBe(77);
      expect(r.effects, type).toBe(true);
      expect(r.blocked, type).toBe(false);
      expect(r.parried, type).toBe(false);
      expect(Object.keys(r.patch), type).toEqual([]);
    }
  });

  it('カウンター成立域の宣言表に gp: が1つも残っていない(予告が無い=取る対象が無い)', () => {
    expect(Object.keys(COUNTER_REACH_DECL).filter(k => k.startsWith('gp:'))).toEqual([]);
  });

  it('盤面から幻影だけを拾う(他のボス/雑魚は拾わない)', () => {
    const fake = (type: Enemy['type'], id: string): Enemy => ({
      id, x: 0, y: 0, width: 10, height: 10, speed: 0, health: 1, maxHealth: 1,
      damage: 0, type, experienceValue: 0, lastHit: 0, lastShot: 0,
    });
    expect(pickActivePhantom([fake('zombie', 'a'), fake('giantbat', 'b')])).toBeUndefined();
    expect(pickActivePhantom([fake('zombie', 'a'), fake(GUARDIAN_PHANTOM_TYPE, 'gp')])?.id).toBe('gp');
  });
});
