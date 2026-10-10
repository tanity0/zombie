// SKILL_BUILD_REDESIGN.md §26(KILL吹き飛び・死体を飛ばす)の受け入れ条件を固定するテスト。
// §26-3: ①死体がKB付きで残り期限で消える ②死体は接触ダメージを与えない/受けない
// ③パニッシャー所持時、死体moverが隣の敵を巻き込む ④ボス/ネームドの死亡演出は不変。
import { describe, it, expect, vi } from 'vitest';
import { useGameStore, KNOCKBACK_DURATION, KILL_LAUNCH_DIST_PX, knockbackSpeedFor, PUNISHER_TWO_BEAT_MS, corpseSquashNow, KILL_CORPSE_SQUASH_MS } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { checkPlayerEnemyCollisions } from '../utils/collisionUtils';
import { isCorpse } from '../utils/enemyUtils';

describe('KILL吹き飛び(死体・SKILL_BUILD_REDESIGN.md §26)', () => {
  let now = 1_000_000;
  const timeSpy = () => vi.spyOn(Date, 'now').mockImplementation(() => now);

  it('通常敵をdamageEnemyでキルすると即消滅せず、攻撃者→敵方向へ実距離50pxぶんの死体として残る', () => {
    const spy = timeSpy();
    now = 1_000_000;
    useGameStore.getState().resetGame('warrior');
    const player = useGameStore.getState().player;
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    // 敵をプレイヤーの真東(+x)に置く(中心を揃える)=死体は+x方向へ飛ぶはず。
    const z = spawnEnemyAt('zombie', pcx + 60, pcy, useGameStore.getState().gameTime);
    z.x = pcx + 60 - z.width / 2;
    z.y = pcy - z.height / 2;
    z.health = 1;
    useGameStore.setState({ enemies: [z] });
    const id = useGameStore.getState().enemies[0].id;

    const killed = useGameStore.getState().damageEnemy(id, 999);
    expect(killed).toBe(true);

    const after = useGameStore.getState().enemies.find(e => e.id === id);
    expect(after).toBeTruthy(); // 即消滅していない=死体として残っている
    expect(after!.health).toBe(0);
    expect(isCorpse(after!)).toBe(true);
    // ★v0.25.3930: 吹っ飛び(KNOCKBACK_DURATION)の**後ろに潰れの尺**が足された。
    // 飛距離の積分は knockbackUntil を見ているので、飛び方そのものは不変(下の行で固定)。
    expect(after!.corpseUntil).toBe(now + KNOCKBACK_DURATION + KILL_CORPSE_SQUASH_MS);
    expect(after!.knockbackUntil).toBe(now + KNOCKBACK_DURATION);
    // 攻撃者(プレイヤー)→敵は+x方向なので、死体も+x側へ飛ぶ。
    expect(after!.knockbackVx).toBeGreaterThan(0);
    expect(Math.abs(after!.knockbackVy ?? 0)).toBeLessThan(1);
    const expectedSpeed = knockbackSpeedFor(KILL_LAUNCH_DIST_PX, KNOCKBACK_DURATION);
    expect(Math.hypot(after!.knockbackVx ?? 0, after!.knockbackVy ?? 0)).toBeCloseTo(expectedSpeed, 5);
    // aiPhase/stunUntilは死体化時に解除される(AI状態機械からの完全除外)。
    expect(after!.aiPhase).toBeUndefined();
    expect(after!.stunUntil).toBeUndefined();

    spy.mockRestore();
  });

  it('死体は二重キル/多重ダメージを受けない(damageEnemyの早期return)', () => {
    const spy = timeSpy();
    now = 1_000_000;
    useGameStore.getState().resetGame('warrior');
    const z = spawnEnemyAt('zombie', 100, 100, useGameStore.getState().gameTime);
    z.health = 1;
    useGameStore.setState({ enemies: [z] });
    const id = useGameStore.getState().enemies[0].id;

    useGameStore.getState().damageEnemy(id, 999);
    const statsAfterFirstKill = useGameStore.getState().gameStats.enemiesKilled;
    const corpseBefore = useGameStore.getState().enemies.find(e => e.id === id)!;

    const killedAgain = useGameStore.getState().damageEnemy(id, 50);
    expect(killedAgain).toBe(false); // 早期return=killed扱いにならない
    const corpseAfter = useGameStore.getState().enemies.find(e => e.id === id)!;
    expect(corpseAfter).toEqual(corpseBefore); // 何も変化しない(健康値/KB/期限すべて不変)
    expect(useGameStore.getState().gameStats.enemiesKilled).toBe(statsAfterFirstKill); // 二重加算なし

    spy.mockRestore();
  });

  it('死体は接触ダメージを与えない/受けない(checkPlayerEnemyCollisionsの除外)', () => {
    const spy = timeSpy();
    now = 1_000_000;
    useGameStore.getState().resetGame('warrior');
    const player = useGameStore.getState().player;
    const z = spawnEnemyAt('zombie', player.x, player.y, useGameStore.getState().gameTime); // プレイヤーと完全重複
    z.health = 1;
    useGameStore.setState({ enemies: [z] });
    const id = useGameStore.getState().enemies[0].id;
    useGameStore.getState().damageEnemy(id, 999);
    const corpse = useGameStore.getState().enemies.find(e => e.id === id)!;

    const collisions = checkPlayerEnemyCollisions(useGameStore.getState().player, [corpse]);
    expect(collisions.length).toBe(0); // 重なっていても死体は接触判定に上がらない

    spy.mockRestore();
  });

  it('死体はKBの期限が切れるとupdateEnemiesで配列から除去される', () => {
    const spy = timeSpy();
    now = 1_000_000;
    useGameStore.getState().resetGame('warrior');
    const z = spawnEnemyAt('zombie', 100, 100, useGameStore.getState().gameTime);
    z.health = 1;
    useGameStore.setState({ enemies: [z] });
    const id = useGameStore.getState().enemies[0].id;
    useGameStore.getState().damageEnemy(id, 999);
    expect(useGameStore.getState().enemies.find(e => e.id === id)).toBeTruthy();

    // 期限(吹っ飛び+潰れ)の手前ではまだ残る。
    now += KNOCKBACK_DURATION + KILL_CORPSE_SQUASH_MS - 20;
    useGameStore.getState().updateEnemies(1 / 60);
    expect(useGameStore.getState().enemies.find(e => e.id === id)).toBeTruthy();

    // 期限を過ぎたら除去される。
    now += 40;
    useGameStore.getState().updateEnemies(1 / 60);
    expect(useGameStore.getState().enemies.find(e => e.id === id)).toBeUndefined();

    spy.mockRestore();
  });

  it('パニッシャー所持時、死体moverが隣の敵を巻き込む(KB付与+ダメージ)', () => {
    const spy = timeSpy();
    now = 1_000_000;
    useGameStore.getState().resetGame('warrior');
    useGameStore.setState(s => ({
      player: { ...s.player, skills: ['punisher'], skillLevels: { punisher: 1 } },
    }));
    const player = useGameStore.getState().player;
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;

    const victim = spawnEnemyAt('zombie', pcx + 60, pcy, useGameStore.getState().gameTime);
    victim.health = 1; // これを倒して死体(mover)にする
    const bystander = spawnEnemyAt('zombie', pcx + 60, pcy, useGameStore.getState().gameTime); // 死体と同位置=確実に重なる
    bystander.health = 999;
    useGameStore.setState({ enemies: [victim, bystander] });
    const victimId = useGameStore.getState().enemies.find(e => e.type === 'zombie' && e.health === 1)!.id;
    const bystanderId = useGameStore.getState().enemies.find(e => e.health === 999)!.id;

    useGameStore.getState().damageEnemy(victimId, 999); // victim→死体化(mover候補)
    expect(isCorpse(useGameStore.getState().enemies.find(e => e.id === victimId)!)).toBe(true);

    useGameStore.getState().updateEnemies(1 / 60); // moversの巻き込み判定=一拍目(接触フリーズ・v0.25.3299の二拍化)

    // 一拍目: 接触の瞬間はその場で固まる(punisherPendingAt予約)だけでダメージはまだ入らない。
    const bystanderPending = useGameStore.getState().enemies.find(e => e.id === bystanderId)!;
    expect(bystanderPending.punisherPendingAt).toBeDefined();
    expect(bystanderPending.health).toBe(999);

    // 二拍目(PUNISHER_TWO_BEAT_MS後): 発火パスがダメージ+継承ノックバックを適用する。
    now += PUNISHER_TWO_BEAT_MS + 20;
    useGameStore.getState().updateEnemies(1 / 60);

    const bystanderAfter = useGameStore.getState().enemies.find(e => e.id === bystanderId)!;
    expect(bystanderAfter.health).toBeLessThan(999); // 死体moverに巻き込まれてダメージを受けた
    expect(bystanderAfter.knockbackVx !== undefined || bystanderAfter.knockbackVy !== undefined).toBe(true);

    // 死体自身は巻き込みの被害者にはならない(§26-1)=punisherHoppedが付かない。
    const victimAfter = useGameStore.getState().enemies.find(e => e.id === victimId)!;
    expect(victimAfter.punisherHopped).toBeFalsy();

    spy.mockRestore();
  });

  it('ボス/ネームド/クエスト対象は従来どおり即除去される(死体化しない・演出対象=getsDramaticDeath系は不変)', () => {
    const spy = timeSpy();
    now = 1_000_000;
    useGameStore.getState().resetGame('warrior');

    // ボス系(isBossType=true)。
    const boss = spawnEnemyAt('reaper', 200, 200, useGameStore.getState().gameTime);
    boss.reaperChaser = true; // 撃破可能な個体にする
    boss.health = 1;
    useGameStore.setState({ enemies: [boss] });
    const bossId = useGameStore.getState().enemies[0].id;
    useGameStore.getState().damageEnemy(bossId, 999);
    expect(useGameStore.getState().enemies.find(e => e.id === bossId)).toBeUndefined(); // 死体を残さず即消滅

    // ネームド(isNamed)個体。
    const named = spawnEnemyAt('zombie', 200, 200, useGameStore.getState().gameTime);
    named.health = 1;
    named.isNamed = true;
    useGameStore.setState({ enemies: [named] });
    const namedId = useGameStore.getState().enemies[0].id;
    useGameStore.getState().damageEnemy(namedId, 999);
    expect(useGameStore.getState().enemies.find(e => e.id === namedId)).toBeUndefined();

    // クエスト対象(questTarget)個体。
    const questFoe = spawnEnemyAt('zombie', 200, 200, useGameStore.getState().gameTime);
    questFoe.health = 1;
    questFoe.questTarget = true;
    useGameStore.setState({ enemies: [questFoe] });
    const questId = useGameStore.getState().enemies[0].id;
    useGameStore.getState().damageEnemy(questId, 999);
    expect(useGameStore.getState().enemies.find(e => e.id === questId)).toBeUndefined();

    spy.mockRestore();
  });

  it('近接キル経路(triggerCounter)も同じく死体を残す(grantMeleeKillRewards経由の合流点)', () => {
    const spy = timeSpy();
    now = 1_000_000;
    useGameStore.getState().resetGame('warrior');
    const player = useGameStore.getState().player;
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const z = spawnEnemyAt('zombie', pcx + 4, pcy, useGameStore.getState().gameTime); // 近接圏内
    z.health = 1;
    useGameStore.setState({ enemies: [z] });
    useGameStore.setState(s => ({ player: { ...s.player, counterCooldownEnd: 0 } }));
    const id = useGameStore.getState().enemies[0].id;

    useGameStore.getState().triggerCounter();

    const after = useGameStore.getState().enemies.find(e => e.id === id);
    expect(after).toBeTruthy();
    expect(isCorpse(after!)).toBe(true);
    expect(after!.health).toBe(0);

    spy.mockRestore();
  });
});

// ★社長指示2026-08-25「雑魚敵を倒した時、突然パっと消えちゃうので、すこし吹っ飛んで潰れて
// 消えるようにして」。吹っ飛び(KNOCKBACK_DURATION)の後ろに潰れの尺を足した(v0.25.3930)。
describe('★死体は潰れて消える(v0.25.3930)', () => {
  it('吹っ飛びが終わるまでは潰れない(飛んでいる間は普通の姿)', () => {
    const until = 10_000;
    const sq = corpseSquashNow({ corpseUntil: until }, until - KILL_CORPSE_SQUASH_MS - 1);
    expect(sq.sqX).toBe(1);
    expect(sq.sqY).toBe(1);
    expect(sq.alpha).toBe(1);
  });

  it('★最後の区間で縦に潰れ・横に広がり・透明になる', () => {
    const until = 10_000;
    const mid = corpseSquashNow({ corpseUntil: until }, until - KILL_CORPSE_SQUASH_MS / 2);
    expect(mid.sqY).toBeLessThan(1);   // 縦に潰れる
    expect(mid.sqX).toBeGreaterThan(1); // 横に広がる
    expect(mid.alpha).toBeLessThan(1);  // 薄くなる
    const end = corpseSquashNow({ corpseUntil: until }, until);
    expect(end.alpha).toBeCloseTo(0);   // 消え切る
    // ★色には触らない(社長裁定2026-08-26「敵倒した時の青くなるの、やはりやめる」)。
    // 潰れ+フェードだけが死体の演出=戻したことをここで固定する。
    expect(Object.keys(end)).toEqual(['sqX', 'sqY', 'alpha']);
  });

  it('慣性: 出だしが速く終わりでゆるむ(ease-out=落ちて叩きつけられる動き)', () => {
    const until = 10_000;
    const q1 = corpseSquashNow({ corpseUntil: until }, until - KILL_CORPSE_SQUASH_MS * 0.75); // t=0.25
    const q3 = corpseSquashNow({ corpseUntil: until }, until - KILL_CORPSE_SQUASH_MS * 0.25); // t=0.75
    const end = corpseSquashNow({ corpseUntil: until }, until);                                // t=1
    // **最初の1/4で進む量 > 最後の1/4で進む量**(同じ長さの区間どうしを比べる)。
    expect(1 - q1.alpha).toBeGreaterThan(q3.alpha - end.alpha);
  });

  it('死体でない敵(corpseUntil なし)は一切変形しない', () => {
    const sq = corpseSquashNow({}, 10_000);
    expect(sq).toEqual({ sqX: 1, sqY: 1, alpha: 1 });
  });
});
