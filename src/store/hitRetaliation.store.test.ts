// ★被弾反撃(research/HIT_RETALIATION.md)の受け入れ条件を、ストアを実際に動かして固定する。
// 窓の開閉 / 入力の検証 / 硬直と吹き飛びの打ち切り / 飛び込み / 着地の命中(×2・CDと窓を触らない・相手1体だけ)。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { RETALIATE_WINDOW_MS, RETALIATE_LUNGE_MS } from '../utils/hitRetaliation';
import { applyPumpkinBlastDamage, applyContactDamage, NOOP_COMBAT_EFFECTS } from '../utils/combatTick';

const NO_INPUT = { up: false, down: false, left: false, right: false } as never;
let now = 5_000_000;

const setup = () => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true },
    player: { ...st.player, counterCooldownEnd: 0, pendingSwingAt: 0, health: 100, maxHealth: 100 },
  }));
};
const center = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const zombieAt = (dx: number, dy: number, id: string, health = 99999) => {
  const c = center();
  const e = spawnEnemyAt('zombie', 0, 0, useGameStore.getState().gameTime);
  e.x = c.x + dx - e.width / 2; e.y = c.y + dy - e.height / 2; e.health = health; e.id = id;
  return e;
};
/** 相手 id から実被弾を受ける(retaliateFromId つき)。 */
const hitBy = (id: string, amount = 5) => {
  // 実被弾は無敵(invulnerable)に弾かれるので、前の被弾の無敵は解いておく。
  useGameStore.setState(st => ({ player: { ...st.player, invulnerable: false } }));
  return useGameStore.getState().damagePlayer(amount, 'test', undefined, undefined, undefined, undefined, undefined, undefined, id);
};
/** ゲームループ相当: 時間を進めながら移動を解く(飛び込みを実際に歩かせる)。 */
const advance = (ms: number) => {
  const end = now + ms;
  while (now < end) { now += 16; useGameStore.getState().movePlayer(NO_INPUT, 0.016); }
};
const hpOf = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)?.health ?? 0;

beforeEach(() => {
  now = 5_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // クリを出さない(ダメージを決め打ちで比べる)
});
afterEach(() => { vi.restoreAllMocks(); });

describe('被弾反撃: 窓の開閉(damagePlayer)', () => {
  it('retaliateFromId つきの実被弾で開く。開く瞬間=被弾の瞬間、閉じる=ヒットストップ明け+300ms', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(100, 0, 'z')] });
    hitBy('z', 5); // 5/100=軽段(ストップ70ms)
    const w = useGameStore.getState().hitRetaliation!;
    expect(w.fromId).toBe('z');
    expect(w.openedAt).toBe(now);
    expect(w.closesAt).toBe(useGameStore.getState().hitstopUntil + RETALIATE_WINDOW_MS);
    expect(w.closesAt - now).toBe(70 + RETALIATE_WINDOW_MS);
    expect(w.dirX).toBeCloseTo(1); // 食らった相手の方向(右)
  });
  it('指名なしの被弾(弾・床・爆発)は開かない', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(100, 0, 'z')] });
    useGameStore.getState().damagePlayer(5, 'bullet');
    expect(useGameStore.getState().hitRetaliation).toBeNull();
  });
  it('ダメージ0の被弾では開かない', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(100, 0, 'z')] });
    hitBy('z', 0);
    expect(useGameStore.getState().hitRetaliation).toBeNull();
  });
  it('相手が場にいなければ開かない', () => {
    setup();
    useGameStore.setState({ enemies: [] });
    hitBy('ghost', 5);
    expect(useGameStore.getState().hitRetaliation).toBeNull();
  });
  it('窓の最中の指名なしの被弾は、窓を閉じも開き直しもしない', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(100, 0, 'z')] });
    hitBy('z', 5);
    const before = useGameStore.getState().hitRetaliation;
    now += 50;
    useGameStore.setState(st => ({ player: { ...st.player, invulnerable: false } }));
    useGameStore.getState().damagePlayer(5, 'bullet');
    expect(useGameStore.getState().hitRetaliation).toBe(before);
  });
  it('別の相手に殴られたら新しい相手で上書きする', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(100, 0, 'a'), zombieAt(-100, 0, 'b')] });
    hitBy('a', 5);
    now += 50;
    hitBy('b', 5);
    expect(useGameStore.getState().hitRetaliation!.fromId).toBe('b');
  });
  it('死亡で閉じる', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(100, 0, 'z')] });
    hitBy('z', 5);
    now += 50;
    hitBy('z', 9999);
    expect(useGameStore.getState().hitRetaliation).toBeNull();
  });
});

describe('被弾反撃: 入力(tryHitRetaliation)', () => {
  it('窓が無ければ false', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(100, 0, 'z')] });
    expect(useGameStore.getState().tryHitRetaliation(1, 0)).toBe(false);
  });
  it('窓が閉じた後(ストップ明け+300ms以降)は false', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(100, 0, 'z')] });
    hitBy('z', 5);
    now += 70 + RETALIATE_WINDOW_MS;
    expect(useGameStore.getState().tryHitRetaliation(1, 0)).toBe(false);
  });
  it('ヒットストップの最中(開いた直後)から受け付ける', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(100, 0, 'z')] });
    hitBy('z', 5);
    expect(now).toBeLessThan(useGameStore.getState().hitstopUntil);
    expect(useGameStore.getState().tryHitRetaliation(1, 0)).toBe(true);
  });
  it('向きが±45度の外なら false(窓は残る)/ 相手の方向なら true', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(100, 0, 'z')] });
    hitBy('z', 5);
    expect(useGameStore.getState().tryHitRetaliation(-1, 0)).toBe(false);
    expect(useGameStore.getState().tryHitRetaliation(0, 1)).toBe(false);
    expect(useGameStore.getState().hitRetaliation).not.toBeNull();
    expect(useGameStore.getState().tryHitRetaliation(1, 0.5)).toBe(true);
  });
  it('向きは入力の瞬間の「プレイヤー→相手」で測る(相手が回り込んだら、新しい方向が正)', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(100, 0, 'z')] });
    hitBy('z', 5);
    useGameStore.setState(st => ({ enemies: st.enemies.map(e => ({ ...e, y: e.y - 200 })) })); // 相手が真上へ移動
    expect(useGameStore.getState().tryHitRetaliation(1, 0)).toBe(false); // 窓を開いた時の方向(右)ではもう届かない
    expect(useGameStore.getState().tryHitRetaliation(0, -1)).toBe(true);
  });
  it('相手の体の縁まで260pxを超えたら false', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(600, 0, 'z')] });
    hitBy('z', 5);
    expect(useGameStore.getState().tryHitRetaliation(1, 0)).toBe(false);
  });
  it('相手が死んだ/死体なら false', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(100, 0, 'z')] });
    hitBy('z', 5);
    useGameStore.setState(st => ({ enemies: st.enemies.map(e => ({ ...e, corpseUntil: now + 5000 })) }));
    expect(useGameStore.getState().tryHitRetaliation(1, 0)).toBe(false);
  });
  it.each([
    ['訓練で近接が未解禁', (st: ReturnType<typeof useGameStore.getState>) => ({ m0Unlocked: { ...st.m0Unlocked, melee: false } })],
    ['スケボー乗車中', (st: ReturnType<typeof useGameStore.getState>) => ({ player: { ...st.player, skaterRiding: true } })],
    ['リズム中', (st: ReturnType<typeof useGameStore.getState>) => ({ rhythm: { ...st.rhythm, active: true } })],
    ['一時停止中', () => ({ isPaused: true })],
    ['アテンション中', () => ({ attention: { startReal: now } as never })],
    ['対人の紫/気絶中', (st: ReturnType<typeof useGameStore.getState>) => ({ player: { ...st.player, pvpPosture: { posture: 0, breakUntil: st.gameTime + 9999 } as never } })],
  ])('反撃が出せない状態(%s)は false=従来の入力経路へ', (_n, patch) => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(100, 0, 'z')] });
    hitBy('z', 5);
    expect(useGameStore.getState().tryHitRetaliation(1, 0)).toBe(true); // 状態を変える前は成立する(=下の false はその状態のせい)
    // 成立で窓が閉じるので、もう一度被弾して窓を開き直してから状態を変える。
    now += 1100;
    hitBy('z', 5);
    useGameStore.setState(patch(useGameStore.getState()) as never);
    expect(useGameStore.getState().tryHitRetaliation(1, 0)).toBe(false);
  });
});

describe('被弾反撃: 成立の瞬間', () => {
  it('ヒットストップと吹き飛びを打ち切り、硬直(しゃがみ・移動停止・銃の停止)を終え、相手の方を向き、窓を閉じる', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(120, 0, 'z')] });
    useGameStore.getState().damagePlayer(30, 'test', 0, 0, undefined, undefined, undefined, undefined, 'z'); // 重段(190ms停止・吹き飛びあり)
    const hurtAt = useGameStore.getState().player.lastHurtAt!;
    expect(useGameStore.getState().hitstopUntil).toBeGreaterThan(now);
    expect(useGameStore.getState().player.knockbackUntil!).toBeGreaterThan(now);
    now += 20;
    expect(useGameStore.getState().tryHitRetaliation(1, 0)).toBe(true);
    const s = useGameStore.getState();
    expect(s.hitstopUntil).toBeLessThanOrEqual(now);
    expect(s.player.knockbackUntil!).toBeLessThanOrEqual(now);
    expect(s.player.hurtCancelledAt).toBe(now);
    expect(s.player.lastHurtAt).toBe(hurtAt); // 被弾の段の記録は消さない
    expect(s.player.lastDirection!.x).toBeGreaterThan(0.9);
    expect(s.hitRetaliation).toBeNull();
    expect(s.player.invulnerable).toBe(true); // 被弾の無敵(1秒)はそのまま
  });
  it('別の演出のヒットストップ(その被弾のストップより長い)は切らない', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(120, 0, 'z')] });
    hitBy('z', 5);
    useGameStore.setState({ hitstopUntil: now + 5000 }); // 例: 処刑の演出が後から延ばした
    expect(useGameStore.getState().tryHitRetaliation(1, 0)).toBe(true);
    expect(useGameStore.getState().hitstopUntil).toBe(now + 5000);
  });
  it('近接CDの最中・被弾のしゃがみの最中でも成立し、CDは進めも戻しもしない。前隙中の普通の振りは取り消す', () => {
    setup();
    useGameStore.setState(st => ({ enemies: [zombieAt(120, 0, 'z')], player: { ...st.player, counterCooldownEnd: now + 800, pendingSwingAt: now - 50 } }));
    hitBy('z', 5);
    expect(useGameStore.getState().tryHitRetaliation(1, 0)).toBe(true);
    const p = useGameStore.getState().player;
    expect(p.pendingSwingAt).toBe(0);
    expect(p.counterCooldownEnd).toBe(now + 800);
  });
  it('蝙蝠に掴まれている間も成立し、掴みを解く', () => {
    setup();
    useGameStore.setState(st => ({ enemies: [zombieAt(120, 0, 'z')], player: { ...st.player, grabbedUntil: st.gameTime + 5000 } }));
    hitBy('z', 5);
    expect(useGameStore.getState().tryHitRetaliation(1, 0)).toBe(true);
    const st = useGameStore.getState();
    expect((st.player.grabbedUntil ?? 0) <= st.gameTime).toBe(true);
  });
  it('相手の手前へ約120msで飛び込む(動きは踏み込みの器=lunge・初速最大から減衰)', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(200, 0, 'z')] });
    hitBy('z', 5);
    const x0 = center().x;
    expect(useGameStore.getState().tryHitRetaliation(1, 0)).toBe(true);
    const p = useGameStore.getState().player;
    expect(p.lungeMs).toBe(RETALIATE_LUNGE_MS);
    expect(p.lungeUntil).toBe(now + RETALIATE_LUNGE_MS);
    expect(p.retaliateStrikeAt).toBe(now + RETALIATE_LUNGE_MS);
    advance(RETALIATE_LUNGE_MS + 16);
    expect(center().x - x0).toBeGreaterThan(80); // 実際に飛び込んだ
  });
});

describe('被弾反撃: 着地の命中(resolveRetaliateStrike)', () => {
  const retaliateAndLand = (extra?: () => void) => {
    expect(useGameStore.getState().tryHitRetaliation(1, 0)).toBe(true);
    extra?.();
    advance(RETALIATE_LUNGE_MS + 16);
    return useGameStore.getState().resolveRetaliateStrike();
  };
  const normalSwingDamage = () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(10, 0, 'z')] });
    useGameStore.getState().triggerCounter();
    return 99999 - hpOf('z');
  };

  it('着地前は null(まだ斬らない)', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(200, 0, 'z')] });
    hitBy('z', 5);
    expect(useGameStore.getState().tryHitRetaliation(1, 0)).toBe(true);
    expect(useGameStore.getState().resolveRetaliateStrike()).toBeNull();
  });
  it('命中: 普通の近接のちょうど2倍のダメージが入る', () => {
    const base = normalSwingDamage();
    expect(base).toBeGreaterThan(0);
    setup();
    useGameStore.setState({ enemies: [zombieAt(200, 0, 'z')] });
    hitBy('z', 5);
    const r = retaliateAndLand();
    expect(r?.swung).toBe(true);
    expect(r?.hit).toBe(true);
    expect(99999 - hpOf('z')).toBeCloseTo(base * 2, 5);
  });
  it('命中の既存処理は通る: ノックバックが付き、近接のコンボ(ヒット数)が進む', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(200, 0, 'z')] });
    hitBy('z', 5);
    expect(useGameStore.getState().meleeHitComboCount).toBe(0);
    retaliateAndLand();
    const e = useGameStore.getState().enemies.find(x => x.id === 'z')!;
    expect(e.lastHit).toBeDefined();
    expect((e.knockbackUntil ?? 0)).toBeGreaterThan(now - 1000);
    expect(useGameStore.getState().meleeHitComboCount).toBe(1); // 近接ヒットのコンボ+1
  });
  it('相手の1体だけを斬る(隣の敵は無傷)', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(200, 0, 'z'), zombieAt(200, 20, 'other')] });
    hitBy('z', 5);
    retaliateAndLand();
    expect(hpOf('z')).toBeLessThan(99999);
    expect(hpOf('other')).toBe(99999);
  });
  it('カウンターの窓もCDも張らない・触らない(近接/カウンターの待ち時間は変えない)', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(200, 0, 'z')] });
    hitBy('z', 5);
    const before = useGameStore.getState().player;
    retaliateAndLand();
    const after = useGameStore.getState().player;
    expect(after.counterCooldownEnd).toBe(before.counterCooldownEnd);
    expect(after.counterWindowEnd).toBe(before.counterWindowEnd);
    expect(after.counterWindowStart).toBe(before.counterWindowStart);
    expect(after.slasherChainReadyAt).toBe(before.slasherChainReadyAt);
  });
  it('振った時のサブウェポン入口(ここではタレット切替)を出さない', () => {
    setup();
    const c = center();
    const turret = {
      id: 'tur', weaponType: 'turret', turretMode: 'forward', x: c.x + 20, y: c.y, width: 20, height: 20,
      direction: { x: 1, y: 0 }, speed: 0, damage: 0, duration: 99999, createdAt: now, passthrough: true, hitEnemies: [], hostile: false, reflected: false, critChance: 0,
    } as never;
    useGameStore.setState({ enemies: [zombieAt(200, 0, 'z')], projectiles: [turret] });
    hitBy('z', 5);
    retaliateAndLand();
    expect(useGameStore.getState().projectiles.find(p => p.id === 'tur')?.turretMode).toBe('forward');
  });
  it('着地の時に相手が居なければ空振り(落ちない・窓/CDも動かない・従来の経路へ落とさない)', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(200, 0, 'z')] });
    hitBy('z', 5);
    const cd = useGameStore.getState().player.counterCooldownEnd;
    const r = retaliateAndLand(() => useGameStore.setState({ enemies: [] }));
    expect(r).toEqual({ swung: true, hit: false, finish: false, killed: 0 });
    expect(useGameStore.getState().player.counterCooldownEnd).toBe(cd);
    expect(useGameStore.getState().player.retaliateStrikeAt).toBe(0);
  });
  it('1回だけ解決される(2回目は null)', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(200, 0, 'z')] });
    hitBy('z', 5);
    expect(retaliateAndLand()).not.toBeNull();
    expect(useGameStore.getState().resolveRetaliateStrike()).toBeNull();
  });
  it('倒せる体力なら倒す(近接のキル集計・死体化は通常どおり)', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(200, 0, 'z', 1)] });
    hitBy('z', 5);
    const r = retaliateAndLand();
    expect(r?.killed).toBe(1);
  });
  it('反撃の後は窓が閉じているので、もう一度は出せない(回数制限は無いが被弾でしか開かない)', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(200, 0, 'z')] });
    hitBy('z', 5);
    retaliateAndLand();
    expect(useGameStore.getState().tryHitRetaliation(1, 0)).toBe(false);
  });
});

describe('被弾反撃: 刀・鞭を持っている時(振りが攻撃しない武器)', () => {
  const land = () => {
    expect(useGameStore.getState().tryHitRetaliation(1, 0)).toBe(true);
    advance(RETALIATE_LUNGE_MS + 16);
    return useGameStore.getState().resolveRetaliateStrike();
  };
  it('刀: 相手へ刀の一閃を直接出す。窓・CDは張らない', () => {
    setup();
    useGameStore.setState(st => ({ enemies: [zombieAt(200, 0, 'z'), zombieAt(200, 20, 'other')], player: { ...st.player, subWeapons: [...st.player.subWeapons, 'katana'] } }));
    hitBy('z', 5);
    const cd = useGameStore.getState().player.counterCooldownEnd;
    const r = land();
    expect(r?.hit).toBe(true);
    expect(hpOf('z')).toBeLessThan(99999);
    expect(hpOf('other')).toBe(99999);
    expect(useGameStore.getState().player.counterCooldownEnd).toBe(cd);
  });
  it('鞭: 相手1体へ鞭の打撃を直接当てる(上乗せ欄は戻る)。窓・CDは張らない', () => {
    setup();
    useGameStore.setState(st => ({ enemies: [zombieAt(200, 0, 'z'), zombieAt(200, 20, 'other')], player: { ...st.player, subWeapons: ['whip'], whipCharged: false, whipHitCount: 0 } }));
    hitBy('z', 5);
    const cd = useGameStore.getState().player.counterCooldownEnd;
    const r = land();
    expect(r?.hit).toBe(true);
    expect(hpOf('z')).toBeLessThan(99999);
    expect(hpOf('other')).toBe(99999);
    expect(useGameStore.getState().player.shukuchiStrikeMult).toBeUndefined();
    expect(useGameStore.getState().player.counterCooldownEnd).toBe(cd);
  });
});

describe('被弾反撃: 配線(爆風の解決行・接触)', () => {
  const blastAtPlayer = (extra: Record<string, unknown>) => {
    const c = center();
    return { x: c.x, y: c.y, radius: 80, damage: 10, enemyId: 'z', ...extra };
  };
  const resolveBlast = () => applyPumpkinBlastDamage(NOOP_COMBAT_EFFECTS, { thorOrbitDist: 300, thorCounterLeapMs: 500 });

  it('retaliate 旗つきの当たり(近接系の技)は窓を開く', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(100, 0, 'z')], pumpkinBlasts: [blastAtPlayer({ retaliate: true, moveKey: 'driller-thrust' })] as never });
    resolveBlast();
    expect(useGameStore.getState().hitRetaliation?.fromId).toBe('z');
  });
  it('旗なしの当たり(爆発・飛び道具・床)は、実被弾しても窓を開かない', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(100, 0, 'z')], pumpkinBlasts: [blastAtPlayer({})] as never });
    const hp0 = useGameStore.getState().player.health;
    resolveBlast();
    expect(useGameStore.getState().player.health).toBeLessThan(hp0); // 食らってはいる
    expect(useGameStore.getState().hitRetaliation).toBeNull();
  });
  it('接触(体当たり)の被弾は窓を開く(トールの突進の走行中=窓が閉じていれば体当たりが入る)', () => {
    setup();
    const t = spawnEnemyAt('thor', 50_000, 50_000, useGameStore.getState().gameTime);
    t.bossState = 'thor-dash-move'; t.bossStateUntil = useGameStore.getState().gameTime + 1000; t.id = 't';
    useGameStore.setState(st => ({
      enemies: [t],
      player: {
        ...st.player,
        x: t.x + t.width / 2 - st.player.width / 2, y: t.y + t.height / 2 - st.player.height / 2,
        health: 9999, maxHealth: 9999, invulnerable: false, counterWindowEnd: 0,
      },
    }));
    const hp0 = useGameStore.getState().player.health;
    applyContactDamage(useGameStore.getState().gameTime, false, 0, NOOP_COMBAT_EFFECTS);
    expect(useGameStore.getState().player.health).toBeLessThan(hp0);
    expect(useGameStore.getState().hitRetaliation?.fromId).toBe('t');
  });
});
