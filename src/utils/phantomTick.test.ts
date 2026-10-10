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
import { phantomHitGate, playerIframeApplies } from './phantomGate';
import { GUARDIAN_PHANTOM_TUNING as GP_T, PVP_DAMAGE_SCALE } from './phantomScript';
import { phantomMeleeDamage } from './phantomTick';
import { COUNTER_REACH_DECL } from './counterReach';
import { usesPostureSystem, applyBossPostureDamage } from './bossPosture';
import { strongestGuardian } from '../data/fixedGuardians';
import { setPhantomIdentity } from './phantomIdentity';
import { PLAYER_PROFILES } from '../data/playerProfiles';
import { useGameStore, INVULN_MS, MELEE_RADIUS, COUNTER_WINDOW, MELEE_WINDUP_MS, KNOCKBACK_SPEED, KNOCKBACK_DURATION } from '../store/gameStore';
import { HUMAN_REACTION_MS } from './bossSkeleton';
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

/**
 * 幻影を「たった今、近接を振った」状態にする=**パリィの窓が開く**(GHOST_BOSS.md v9)。
 * 窓の起点は store に入った `gpSwingAt` を読む(実装と同じ入口)。
 */
const armSwing = (id: string): void => {
  const gt = useGameStore.getState().gameTime;
  useGameStore.setState(s => ({ enemies: s.enemies.map(e => e.id === id ? { ...e, gpSwingAt: gt } : e) }));
};

beforeEach(() => {
  setTreesDisabled(true);
  setTorchesDisabled(true);
  useGameStore.getState().resetGame('assault');
});
afterEach(() => { vi.restoreAllMocks(); });

describe('① 即発近接(予告なし・プレイヤーと同じ周期)', () => {
  // ★v0.25.3869(社長裁定「近接前隙を200にして」): 振り**始め**にカウンター窓(gpSwingAt)が開き、
  // **判定は MELEE_WINDUP_MS 後**に出る。プレイヤーと完全に同条件(SAME_ARENA.md §7)。
  it('射程内なら1tick目で振り始め、判定は前隙(200ms)後に出る', () => {
    const { step, cur } = setup(60); // reach=MELEE_RADIUS(74)内(v0.25.3667で160→74)
    const hp0 = useGameStore.getState().player.health;
    step(16);
    const gp = cur();
    expect(gp.gpSwingAt).toBeDefined();                       // 振り始めた(=窓が開いた)
    expect(gp.gpPendingSwingAt).toBeDefined();                // 前隙の最中
    expect(gp.bossState).toBeUndefined();                     // 州機械は使わない(予告も硬直も無い)
    expect(useGameStore.getState().player.health).toBe(hp0);  // ★前隙中はまだ当たらない
    step(MELEE_WINDUP_MS);
    expect(cur().gpPendingSwingAt).toBeUndefined();           // 解決済み
    // 初期近接武器の実ダメージ(v0.25.3641裁定)×対人1/10(社長裁定2026-08-20)。
    expect(useGameStore.getState().player.health).toBe(hp0 - phantomMeleeDamage() * PVP_DAMAGE_SCALE);
  });

  it('次の振りは**プレイヤーの近接の実効周期**(COUNTER_WINDOW+COUNTER_COOLDOWN)を待つ', () => {
    const { step, cur } = setup(60); // reach=74内(v0.25.3667)
    step(16);
    const first = cur().gpSwingAt!;
    step(PHANTOM_MELEE_PERIOD_MS - 100);
    expect(cur().gpSwingAt).toBe(first);                      // 周期の途中では振らない
    step(200);
    step(16);
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

// ★社長裁定2026-08-24「プレイと幻影は、原則同じ条件にして」「カウンターされた側はノックバックも敵と同じく」
// (research/SAME_ARENA.md §7)。前隙200msが入ったことで、**プレイヤーが幻影の近接をカウンターできる**
// ようになった——それ以前は幻影の近接が damagePlayer 直呼びで、止める手段が1つも無かった(最大の非対称)。
describe('★プレイヤーが幻影の近接をカウンターする(v0.25.3869)', () => {
  it('カウンター窓が開いていれば、幻影の斬撃は通らず幻影の体勢だけが削れる(社長指示2026-08-27)', () => {
    const { cur } = setup(60);
    const s = createPhantomTickState();
    runPhantomTick(cur(), s, START_GT + 16, 0.016, 1, START_GT + 16, NOOP_PHANTOM_SFX, () => 0.999);
    expect(cur().gpPendingSwingAt).toBeDefined(); // 幻影は前隙中
    // プレイヤーが窓を開けている(=幻影より後に振った状態)。
    useGameStore.setState(ps => ({ player: { ...ps.player, counterWindowEnd: Date.now() + 10_000 } }));
    const hpPlayer = useGameStore.getState().player.health;
    const hpPhantom = cur().health;
    const postureBefore = cur().pvpPosture?.posture;
    const gt = START_GT + 16 + MELEE_WINDUP_MS;
    runPhantomTick(cur(), s, gt, 0.016, 1, gt, NOOP_PHANTOM_SFX, () => 0.999);
    expect(useGameStore.getState().player.health).toBe(hpPlayer); // 斬撃は通らない
    // ★社長指示2026-08-27「近接カウンターはカウンターされた側の体勢値だけ削れる」:
    // HPダメージは出ない(旧: meleeSwingBaseDamageの確定クリ)。体勢(counter 0.20)だけが削れる。
    expect(cur().health).toBe(hpPhantom);
    expect(cur().pvpPosture?.posture ?? Number.POSITIVE_INFINITY).toBeLessThan(postureBefore ?? Number.POSITIVE_INFINITY);
    expect(cur().gpPendingSwingAt).toBeUndefined();               // 振りは中断
  });

  it('カウンターされた幻影は「敵と同じ」ノックバックを受ける(社長指示)', () => {
    const { cur } = setup(60);
    const s = createPhantomTickState();
    runPhantomTick(cur(), s, START_GT + 16, 0.016, 1, START_GT + 16, NOOP_PHANTOM_SFX, () => 0.999);
    useGameStore.setState(ps => ({ player: { ...ps.player, counterWindowEnd: Date.now() + 10_000 } }));
    const gt = START_GT + 16 + MELEE_WINDUP_MS;
    runPhantomTick(cur(), s, gt, 0.016, 1, gt, NOOP_PHANTOM_SFX, () => 0.999);
    const gp = cur();
    // 量が敵のカウンターノックバックと同一(専用の叩き台を持たない=対称性のため)。
    expect(Math.hypot(gp.knockbackVx ?? 0, gp.knockbackVy ?? 0)).toBeCloseTo(KNOCKBACK_SPEED, 3);
    expect((gp.knockbackUntil ?? 0) - Date.now()).toBeGreaterThan(KNOCKBACK_DURATION - 100);
  });

  it('窓が閉じていれば従来どおり幻影の斬撃が通る(窓の有無だけが分岐)', () => {
    const { cur } = setup(60);
    const s = createPhantomTickState();
    runPhantomTick(cur(), s, START_GT + 16, 0.016, 1, START_GT + 16, NOOP_PHANTOM_SFX, () => 0.999);
    useGameStore.setState(ps => ({ player: { ...ps.player, counterWindowEnd: 0 } }));
    const hpPlayer = useGameStore.getState().player.health;
    const gt = START_GT + 16 + MELEE_WINDUP_MS;
    runPhantomTick(cur(), s, gt, 0.016, 1, gt, NOOP_PHANTOM_SFX, () => 0.999);
    expect(useGameStore.getState().player.health).toBeLessThan(hpPlayer);
  });

  it('幻影の反応は人間の下限(HUMAN_REACTION_MS)より速くならない', () => {
    expect(phantomProfile().reactionMs).toBeGreaterThanOrEqual(HUMAN_REACTION_MS);
  });
});

// ★社長裁定2026-08-20「近接攻撃は無敵時間無視で(近接にCDがあるので)」: 無敵(i-frame)で弾くのは
// **弾・遠隔だけ**になった。近接系(スイング/分身/刀/鞭/スケボー/カウンター反撃)は無敵中でも通る
// (銃連射が張る i-frame に近接が吸われて「近接が効かない」体感になっていた)。
// このスイートは両方向を固定する: 遠隔=0のまま/近接=無敵中でも減る(退行するとまた「効かない」へ戻る)。
describe('② 被弾無敵: 弾・遠隔は0/近接系は無敵を無視して通る(社長裁定2026-08-20)', () => {
  /** 幻影を「たった今、有効打を受けた」状態にする(=以後 INVULN_MS は弾・遠隔がダメージ0)。 */
  const armInvuln = (id: string): void => {
    const gt = useGameStore.getState().gameTime;
    useGameStore.setState(s => ({ enemies: s.enemies.map(e => e.id === id ? { ...e, gpHitAt: gt } : e) }));
  };
  const hpOf = (id: string): number => useGameStore.getState().enemies.find(e => e.id === id)!.health;

  it('①damageEnemy(銃・サブ・爆発の合流点)は無敵で0', () => {
    const { id } = setup(40);
    armInvuln(id);
    const hp = hpOf(id);
    useGameStore.getState().damageEnemy(id, 500, false, false, false, 'gun', 'player');
    expect(hpOf(id)).toBe(hp);
  });

  it('①damageEnemy(カウンター反撃=postureImpact:counter)は無敵を無視して通る', () => {
    const { id } = setup(40);
    armInvuln(id);
    const hp = hpOf(id);
    useGameStore.getState().damageEnemy(id, 500, false, true, false, 'other', 'player', 'counter');
    expect(hpOf(id)).toBeLessThan(hp);
  });

  it('②triggerCounter(プレイヤーの近接スイング)は無敵を無視して通る', () => {
    const { id } = setup(20);
    armInvuln(id);
    const hp = hpOf(id);
    const res = useGameStore.getState().triggerCounter();
    expect(hpOf(id)).toBeLessThan(hp);
    expect(res.hit).toBe(true);
  });

  it('③shadowCloneStrike(分身)は無敵を無視して通る', () => {
    const { id } = setup(20);
    armInvuln(id);
    const hp = hpOf(id);
    const p = useGameStore.getState().player;
    useGameStore.getState().shadowCloneStrike({
      x: p.x, y: p.y, width: p.width, height: p.height, facingLeft: false,
      characterClass: p.characterClass, spawnedAt: 0, attacksDone: 0, nextAttackAt: 0,
    });
    expect(hpOf(id)).toBeLessThan(hp);
  });

  it('④performKatanaStrike(刀)は無敵を無視して通る', () => {
    const { id } = setup(20);
    useGameStore.setState(s => ({ player: { ...s.player, subWeapons: ['katana'] } }));
    armInvuln(id);
    const hp = hpOf(id);
    const res = useGameStore.getState().performKatanaStrike([id], 1, true, undefined);
    expect(hpOf(id)).toBeLessThan(hp);
    expect(res.hit).toBe(true);
  });

  it('⑤performWhipStrike(鞭)は無敵を無視して通る', () => {
    const { id } = setup(20);
    armInvuln(id);
    const hp = hpOf(id);
    const res = useGameStore.getState().performWhipStrike([id]);
    expect(hpOf(id)).toBeLessThan(hp);
    expect(res.hits).toBeGreaterThan(0);
  });

  it('⑥skaterBoardHit(スケボー)は無敵を無視して通る', () => {
    const { id } = setup(20);
    armInvuln(id);
    const hp = hpOf(id);
    const e = useGameStore.getState().enemies.find(x => x.id === id)!;
    useGameStore.getState().skaterBoardHit(e.x + e.width / 2, e.y + e.height / 2, 1, 0);
    expect(hpOf(id)).toBeLessThan(hp);
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

  // ★GHOST_BOSS.md v9: 近接パリィは**窓**(幻影のスイングが開けた COUNTER_WINDOW)。抽選しない。
  it('phantomGate 単体: 無敵/近接の窓/通過の全分岐(窓入力で固定)', () => {
    const base = {
      enemyType: GUARDIAN_PHANTOM_TYPE, amount: 100, gameTime: 5000,
      invulnMs: 1000, parryCdMs: 1000,
      swingWindowMs: COUNTER_WINDOW,
    } as const;
    // 無敵中: 弾・遠隔は0/近接系は無敵を無視して通る(社長裁定2026-08-20)。
    for (const source of ['bullet', 'ranged'] as const) {
      const r = phantomHitGate({ ...base, source, gpHitAt: 4500 });
      expect(r.damage).toBe(0);
      expect(r.effects).toBe(false);
      expect(r.blocked).toBe(true);
      expect(r.patch.gpBlockedAt).toBe(5000);
    }
    for (const source of ['melee', 'counter'] as const) {
      const r = phantomHitGate({ ...base, source, gpHitAt: 4500 });
      expect(r.blocked).toBe(false);
      expect(r.damage).toBe(100);
      expect(r.patch.gpHitAt).toBe(5000);
    }
    // 無敵外・近接・**窓の中**=パリィ。
    const parry = phantomHitGate({ ...base, source: 'melee', gpSwingAt: 4900 });
    expect(parry.parried).toBe(true);
    expect(parry.damage).toBe(0);
    expect(parry.patch.gpParriedAt).toBe(5000);
    expect(parry.patch.gpParryCdUntil).toBe(6000);
    // **窓の外**(スイングから COUNTER_WINDOW 以上経った)=素通り。
    const late = phantomHitGate({ ...base, source: 'melee', gpSwingAt: 5000 - COUNTER_WINDOW });
    expect(late.parried).toBe(false);
    expect(late.damage).toBe(100);
    expect(late.patch.gpHitAt).toBe(5000);
    // 一度も振っていない(gpSwingAt 未設定)=窓が無い=素通り(リーチ外からの近接がここに落ちる)。
    const noSwing = phantomHitGate({ ...base, source: 'melee' });
    expect(noSwing.parried).toBe(false);
    expect(noSwing.damage).toBe(100);
    // パリィCD中は窓が開いていても成立しない=通る。
    const cd = phantomHitGate({ ...base, source: 'melee', gpSwingAt: 4900, gpParryCdUntil: 9999 });
    expect(cd.parried).toBe(false);
    expect(cd.damage).toBe(100);
    // カウンター反撃・弾以外の遠隔(サブ/爆発)はパリィ不可(窓の中でも通る)。
    for (const source of ['counter', 'ranged'] as const) {
      const r = phantomHitGate({ ...base, source, gpSwingAt: 4900 });
      expect(r.parried).toBe(false);
      expect(r.damage).toBe(100);
      expect(r.patch.gpHitAt).toBe(5000);
    }
  });

  // ★v0.25.3667(社長指摘「こっちが届かない近距離攻撃をしてくる」): 幻影の近接リーチは
  // プレイヤーの近接範囲(MELEE_RADIUS)と同値=「全てプレイヤーと同条件」。
  // phantomScript は葉で gameStore を import できないため値の写し——ここで等値を機械検査する。
  it('幻影の近接リーチ=プレイヤーの MELEE_RADIUS(写経ズレの機械検知)', () => {
    expect(GP_T.melee.reach).toBe(MELEE_RADIUS);
  });

  // ★v0.25.3665(社長指摘「鴉、銃の弾反撃しないよ?」): プレイヤーの銃弾('bullet')もパリィ対象。
  // ★GHOST_BOSS.md v10(社長2026-10-10): 弾も近接と同じ**窓**(抽選・飛翔時間は使わない)。
  it('phantomGate 単体: 銃弾は振りの窓の中だけ打ち返す(gpBulletParriedAt に打刻)', () => {
    const base = {
      enemyType: GUARDIAN_PHANTOM_TYPE, amount: 100, gameTime: 5000,
      invulnMs: 1000, parryCdMs: 1000,
      swingWindowMs: COUNTER_WINDOW,
    } as const;
    // 窓の中=打ち返す(A2: 飛翔時間に関係なく)。
    const r = phantomHitGate({ ...base, source: 'bullet', gpSwingAt: 4900 });
    expect(r.parried).toBe(true);
    expect(r.damage).toBe(0);
    expect(r.effects).toBe(false);
    expect(r.patch.gpBulletParriedAt).toBe(5000);   // 弾ヒット処理が同tickで消費=弾を打ち返す
    expect(r.patch.gpParriedAt).toBeUndefined();    // 近接反撃・プレイヤーshoveは出さない
    expect(r.patch.gpParryCdUntil).toBe(6000);      // CDは近接と共有
    // 窓の外/一度も振っていない=通る(A1: 以前の抽選は無い)。
    for (const gpSwingAt of [5000 - COUNTER_WINDOW, undefined]) {
      const out = phantomHitGate({ ...base, source: 'bullet', gpSwingAt });
      expect(out.parried).toBe(false);
      expect(out.damage).toBe(100);
      expect(out.patch.gpHitAt).toBe(5000);
    }
    // CD中は窓の中でも通る。
    const cd = phantomHitGate({ ...base, source: 'bullet', gpSwingAt: 4900, gpParryCdUntil: 9999 });
    expect(cd.parried).toBe(false);
    expect(cd.damage).toBe(100);
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
    runPhantomTick(e, s, START_GT + 16, 0.016, 1, START_GT + 16, sfx, () => 0.999); // 振り始め(前隙)
    expect(hurt).toBe(0); // ★前隙中はまだ当たっていない
    const gt1 = START_GT + 16 + MELEE_WINDUP_MS;
    runPhantomTick(useGameStore.getState().enemies[0], s, gt1, 0.016, 1, gt1, sfx, () => 0.999);
    expect(hurt).toBe(1); // 前隙が明けて当たった=鳴る
    // HPが実際に減らなかった時は鳴らない。**i-frameでは検証できない**(v0.25.3866の裁定で幻影の
    // 近接はプレイヤーのi-frameを無視して通るようになったため)。代わりに訓練(M0)の「HP1で
    // 踏みとどまる」を使う=amountが0にクランプされHPが動かない、まさに旧バグと同じ形。
    useGameStore.setState(ps => ({ farBackdrop: 'tutorial', player: { ...ps.player, health: 1 } }));
    const s2 = createPhantomTickState();
    runPhantomTick(useGameStore.getState().enemies[0], s2, START_GT + 5000, 0.016, 1, START_GT + 5000, sfx, () => 0.999);
    const gt2 = START_GT + 5000 + MELEE_WINDUP_MS;
    runPhantomTick(useGameStore.getState().enemies[0], s2, gt2, 0.016, 1, gt2, sfx, () => 0.999);
    expect(useGameStore.getState().player.health).toBe(1); // 減っていない
    expect(hurt).toBe(1); // 増えない
    void step; // setupのヘルパは未使用(直接tickで検証)
  });

  // ★社長裁定2026-08-24「無敵時間については、幻影側にプレイヤーも合わせて。
  //   (これは幻影とプレイヤー間だけの制約のはず)」
  it('裁定v0.25.3866: 幻影の近接はプレイヤーのi-frameを無視して通る(幻影側①と対称)', () => {
    const { step } = setup(40);
    // プレイヤーをi-frame中にする(直前に何かで被弾した状態)。
    useGameStore.setState(ps => ({ player: { ...ps.player, invulnerable: true, invulnerableTime: Date.now() } }));
    const before = useGameStore.getState().player.health;
    const s2 = createPhantomTickState();
    runPhantomTick(useGameStore.getState().enemies[0], s2, START_GT + 16, 0.016, 1, START_GT + 16, NOOP_PHANTOM_SFX, () => 0.999);
    const gt3 = START_GT + 16 + MELEE_WINDUP_MS;
    runPhantomTick(useGameStore.getState().enemies[0], s2, gt3, 0.016, 1, gt3, NOOP_PHANTOM_SFX, () => 0.999);
    expect(useGameStore.getState().player.health).toBeLessThan(before);
    void step;
  });

  it('裁定v0.25.3866の適用範囲: 通常の敵・環境ダメージのi-frameは従来どおり効く', () => {
    useGameStore.setState(ps => ({ player: { ...ps.player, health: 9999, maxHealth: 9999, invulnerable: true, invulnerableTime: Date.now() } }));
    const before = useGameStore.getState().player.health;
    // damagerType 未指定=通常の敵・環境(飛び道具・爆発・地雷など全ての共通経路)。
    useGameStore.getState().damagePlayer(50, 'テスト');
    expect(useGameStore.getState().player.health).toBe(before);
    // 幻影の型名を渡した時だけ門が開く(規則の唯一の出どころ=playerIframeApplies)。
    expect(playerIframeApplies(undefined)).toBe(true);
    expect(playerIframeApplies('zombie')).toBe(true);
    expect(playerIframeApplies(GUARDIAN_PHANTOM_TYPE)).toBe(false);
    useGameStore.getState().damagePlayer(50, 'テスト', undefined, undefined, GUARDIAN_PHANTOM_TYPE);
    expect(useGameStore.getState().player.health).toBeLessThan(before);
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

  it('監査A: 近接由来(gpSource=melee)の damageEnemy はパリィの窓に掛かる(スラッシャー追撃の経路)', () => {
    const { id } = setup(400);
    // ★v9: 窓が開いていること(=幻影が今しがた振ったこと)が成立条件。乱数は関係しない。
    armSwing(id);
    const hp = useGameStore.getState().enemies.find(e => e.id === id)!.health;
    useGameStore.getState().damageEnemy(id, 100, false, false, false, 'other', 'player', null, 1, 'melee');
    const e = useGameStore.getState().enemies.find(x => x.id === id)!;
    expect(e.health).toBe(hp);                                        // パリィ=ダメージ0
    expect(e.gpParriedAt).toBe(useGameStore.getState().gameTime);     // 反撃の合図が立つ
  });

  // ★GHOST_BOSS.md v9: 窓が開いていなければ(=振っていない間に斬られたら)そのまま通る。
  it('v9: 窓の外の近接は素通り(スイング直後の隙を狙えば通る)', () => {
    const { id } = setup(400);
    const hp = useGameStore.getState().enemies.find(e => e.id === id)!.health;
    useGameStore.getState().damageEnemy(id, 100, false, false, false, 'other', 'player', null, 1, 'melee');
    const e = useGameStore.getState().enemies.find(x => x.id === id)!;
    expect(e.health).toBeLessThan(hp);
    expect(e.gpParriedAt).toBeUndefined();
  });
});

describe('③ パリィ(スイングの窓)→ 次tickで割り込み反撃', () => {
  it('窓の中の近接はパリィされ gpParriedAt が立ち、次tickで周期を無視して振り返す', () => {
    const { id, step, cur, state } = setup(40);
    // ★v9: 成立条件は「幻影が今しがた振った=窓が開いている」こと(抽選ではない)。
    armSwing(id);
    expect(phantomProfile().reactionMs).toBeGreaterThan(0);
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
    const { step, cur, id } = setup(60); // reach=74内(v0.25.3667)
    useGameStore.setState(s => ({
      enemies: s.enemies.map(e => e.id === id ? { ...e, knockbackUntil: START_GT + 5000 } : e),
    }));
    step(16);
    expect(cur().gpSwingAt).toBeDefined();
  });

  it('気絶(stunUntil)では従来どおり止まる=「止まらない」のは通常被弾のノックバックだけ', () => {
    const { step, cur, id } = setup(60); // reach=74内(=止まる理由がstunだけであることを保証)
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
        invulnMs: 1000, parryCdMs: 1000,
        swingWindowMs: COUNTER_WINDOW,
        gpHitAt: 4999,    // 幻影ならこれで無敵ブロックされる条件を、あえて渡す
        gpSwingAt: 4999,  // 幻影ならこれで必ずパリィされる窓を、あえて渡す
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

describe('research/LUNGE_DODGE.md §4(段L3): 幻影の踏み込み回避', () => {
  it('プレイヤーが走って詰めてくると、届く直前にプレイヤーから離れる向きへ踏み込みながら振る(既定の人格)', () => {
    const b = setup(150); // 縁から約110px(普段の振りの届く74pxの外)
    const p0 = useGameStore.getState().player;
    // プレイヤーが幻影の方(-x)へ走っている
    useGameStore.setState({ player: { ...p0, speed: 200, vx: -200, vy: 0 } });
    let gt = START_GT;
    let swung: Enemy | null = null;
    for (let i = 0; i < 120 && !swung; i++) {
      gt += 16;
      // プレイヤーを実際に幻影へ寄せる(幻影も自分で歩くので、速度だけ立てて止めておくと距離が開いて不安定になる)
      const pl = useGameStore.getState().player;
      const ph = b.cur();
      const dir = Math.sign((ph.x + ph.width / 2) - (pl.x + pl.width / 2)) || -1;
      useGameStore.setState({ gameTime: gt, player: { ...pl, x: pl.x + dir * 200 * 0.016, vx: dir * 200, vy: 0 } });
      runPhantomTick(b.cur(), b.state, gt, 0.016, 1, gt, NOOP_PHANTOM_SFX, () => 0); // 抽選は必ず「抜ける」
      if (b.cur().gpPendingSwingAt !== undefined) swung = b.cur();
    }
    expect(swung).not.toBeNull();
    // 滑る向き=プレイヤーから離れる向き。振る向き(当たり)はプレイヤーの方のまま=2つは逆向き。
    const pl = useGameStore.getState().player;
    const toPlayerX = Math.sign((pl.x + pl.width / 2) - (swung!.x + swung!.width / 2));
    expect(Math.sign(swung!.knockbackVx ?? 0)).toBe(-toPlayerX);
    expect(Math.sign(Math.cos(swung!.gpSwingAngle ?? 0))).toBe(toPlayerX);
    expect(swung!.gpLungeAngle).toBeDefined();
    // 詰め始めから反応の下限(250ms)より前には出ない
    expect((swung!.gpSwingAt ?? 0) - START_GT).toBeGreaterThanOrEqual(HUMAN_REACTION_MS);
  });
  it('抽選で抜けない時は今のまま(抜けの振りは出ない)', () => {
    let escaped = false;
    const b = setup(150);
    const p0 = useGameStore.getState().player;
    useGameStore.setState({ player: { ...p0, vx: -p0.speed, vy: 0 } });
    let gt = START_GT;
    for (let i = 0; i < 40; i++) {
      gt += 16;
      useGameStore.setState({ gameTime: gt });
      runPhantomTick(b.cur(), b.state, gt, 0.016, 1, gt, NOOP_PHANTOM_SFX, () => 0.999);
      if (b.cur().gpLungeAngle !== undefined) escaped = true;
    }
    // 幻影が自分で歩いて74px以内に入れば普段どおり振る(それは今のまま)。抜けの振りだけが出ない。
    expect(escaped).toBe(false);
  });
  it('止まっているプレイヤーには抜けの踏み込みを出さない', () => {
    let escaped = false;
    const b = setup(150);
    const p0 = useGameStore.getState().player;
    useGameStore.setState({ player: { ...p0, vx: 0, vy: 0 } });
    let gt = START_GT;
    for (let i = 0; i < 40; i++) {
      gt += 16;
      useGameStore.setState({ gameTime: gt });
      runPhantomTick(b.cur(), b.state, gt, 0.016, 1, gt, NOOP_PHANTOM_SFX, () => 0);
      if (b.cur().gpLungeAngle !== undefined) escaped = true;
    }
    expect(escaped).toBe(false);
  });
});

describe('対人スケールは打ち返しでも1回だけ(社長指摘2026-10-10「幻影がフェアじゃない」)', () => {
  it('幻影の弾(焼き込み済み)を打ち返して幻影に当てる時だけ、焼いた分を戻してゲートへ渡す', async () => {
    const { pvpHitDamageForGate, PVP_DAMAGE_SCALE } = await import('./phantomScript');
    // 幻影の弾の素のダメージ D=10 → 生成時に ×0.2 で 2 → プレイヤーが打ち返して ×10 で 20
    const reflected = 10 * PVP_DAMAGE_SCALE * 10;
    // ゲートは ×0.2 を掛けるので、渡す値は 20/0.2=100 → 幻影が受けるのは 20 = 普通の1発(10×0.2=2)の10倍
    expect(pvpHitDamageForGate(reflected, true, true) * PVP_DAMAGE_SCALE).toBeCloseTo(10 * PVP_DAMAGE_SCALE * 10);
    // プレイヤーの弾(焼き込み無し)と、幻影以外への命中は素通し
    expect(pvpHitDamageForGate(7, false, true)).toBe(7);
    expect(pvpHitDamageForGate(7, true, false)).toBe(7);
  });
});

describe('GHOST_BOSS.md v10: 弾に対して、人格の記録どおりに「振って返す/食らう」を選ぶ', () => {
  // プレイヤーの直接銃の弾を、幻影の正面から当たる向きで置く(経過は人の反応の下限を十分に過ぎた状態)。
  const putBullet = (phantom: Enemy, gt: number, distPx: number, speed = 600): void => {
    const cx = phantom.x + phantom.width / 2, cy = phantom.y + phantom.height / 2;
    useGameStore.setState({
      projectiles: [{
        id: 'pb-1', x: cx - distPx - 5, y: cy - 5, width: 10, height: 10, speed,
        direction: { x: 1, y: 0 }, damage: 10, hostile: false, weaponKey: PLAYER_PROFILES.rogue.gunKey,
        createdAt: gt - 2000, hitEnemies: [],
      } as unknown as import('../types/game').Projectile],
    });
  };
  const withRates = (name: string, counterRate: number, hitRate: number): void => {
    const base = strongestGuardian().profile;
    setPhantomIdentity({ name, source: 'fixed', profile: { ...base, moveReactions: { 'mimir-burst': { n: 10, counterRate, hitRate } } } });
  };
  afterEach(() => setPhantomIdentity(null));

  it('A4: 打ち返す人格は、着弾が振りの窓以内になった時に振る(間合いの外=空振り)', () => {
    withRates('v10-counter', 1, 0);
    const { step, cur, gt } = setup(500); // 近接の間合いの外
    step(16);
    const before = cur().gpSwingAt;
    putBullet(cur(), gt(), 150); // 150px ÷ 600px/s = 250ms ≦ COUNTER_WINDOW
    step(16);
    expect(cur().gpSwingAt).toBeDefined();
    expect(cur().gpSwingAt).not.toBe(before);
    expect(cur().gpLungeAngle).toBeUndefined(); // 抜けの踏み込みではない(普通の振り)
  });

  it('A4: 着弾までが窓より長いうちは振らない(決めてから待つ)', () => {
    withRates('v10-wait', 1, 0);
    const { step, cur, gt } = setup(500);
    step(16);
    const before = cur().gpSwingAt;
    putBullet(cur(), gt(), 480); // 800ms > COUNTER_WINDOW
    step(16);
    expect(cur().gpSwingAt).toBe(before);
  });

  it('A4: 食らう人格は振らない', () => {
    withRates('v10-take', 0, 1);
    const { step, cur, gt } = setup(500);
    step(16);
    const before = cur().gpSwingAt;
    putBullet(cur(), gt(), 150);
    step(16);
    expect(cur().gpSwingAt).toBe(before);
  });

  it('A2/A6: 判断と同じ1本=打ち返し済み・軍人・守護霊の弾には振らない', () => {
    withRates('v10-filter', 1, 0);
    const { step, cur, gt } = setup(500);
    step(16);
    const before = cur().gpSwingAt;
    putBullet(cur(), gt(), 150);
    useGameStore.setState(s => ({ projectiles: s.projectiles.map(p => ({ ...p, weaponKey: 'escort' })) }));
    step(16);
    expect(cur().gpSwingAt).toBe(before);
  });
});

describe('被弾反撃: 幻影の近接も窓を開く(社長指示2026-10-10「幻影との戦いの近接後は反撃できない?できるようにして」)', () => {
  it('幻影の近接が当たると、相手=幻影の反撃の窓が開く', () => {
    const { id, step } = setup(60); // 近接の間合いの中
    useGameStore.setState({ hitRetaliation: null });
    let opened = false;
    for (let i = 0; i < 120 && !opened; i++) {
      step(16);
      opened = useGameStore.getState().hitRetaliation?.fromId === id;
    }
    expect(opened).toBe(true);
  });
});
