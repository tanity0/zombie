// research/BRAWLER_PHANTOM.md §4: 格闘の幻影(拳鬼)の格闘を幻影の上で回す(結合テスト)。
import { describe, it, expect, beforeEach } from 'vitest';
import { runPhantomTick, createPhantomTickState, NOOP_PHANTOM_SFX } from './phantomTick';
import { phantomBrawlerBossState, phantomBrawlerHoldClock, phantomBrawlerStrikerMult } from './phantomBrawlerTick';
import { initialBrawlerState, brawlerStartAttack, brawlerAfterResolve, brawlerElapsed, brawlerTotalMs } from './brawler';
import { setPhantomIdentity } from './phantomIdentity';
import { uniquePhantomSpec } from '../data/uniquePhantoms';
import { useGameStore, PUMPKIN_CROUCH_MS, ENEMY_ATTACK_SPEED_MULT, groundJumpAirMsRaw } from '../store/gameStore';
import { spawnEnemyAt } from './enemyUtils';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import type { Enemy } from '../types/game';

const START_GT = 10_000_000;
const ORIGIN = 50_000;

describe('相の登録(区分どおり)', () => {
  it('待機=追いかけ・前隙=技の最中・戻り=硬直', () => {
    expect(phantomBrawlerBossState(undefined, 0)).toBe('chase');
    expect(phantomBrawlerBossState(initialBrawlerState(), 0)).toBe('chase');
    const s = brawlerStartAttack(initialBrawlerState(), 1, 1000, false);
    expect(phantomBrawlerBossState(s, 1000)).toBe('gp-brawler');
    const r = brawlerAfterResolve(s, 1000 + s.windupMs, 0, { pointCap: 20, countPoint: true, hitstopMs: 0 });
    expect(phantomBrawlerBossState(r, 1000 + s.windupMs + 1)).toBe('gp-brawler-recover');
  });
  it('戻りで固めている間は格闘の時計が止まる(明けたら戻りの続きから)', () => {
    const s = brawlerStartAttack(initialBrawlerState(), 1, 1000, false);
    const r = brawlerAfterResolve(s, 1000 + s.windupMs, 0, { pointCap: 20, countPoint: true, hitstopMs: 0 });
    const t0 = 1000 + s.windupMs + 10;
    const el0 = brawlerElapsed(r, t0 + 16); // 固め始め(最初の tick)の時点
    let h = r;
    for (let k = 1; k <= 30; k++) h = phantomBrawlerHoldClock(h, t0 + k * 16, 500 - k * 16);
    expect(brawlerElapsed(h, t0 + 30 * 16)).toBeCloseTo(el0, 0);
    expect(brawlerElapsed(h, t0 + 500 + 50)).toBeLessThan(brawlerTotalMs(h));
  });
  it('ストライカーの素手×1.5(格闘中のストライカー)', () => {
    expect(phantomBrawlerStrikerMult('rogue')).toBe(1.5);
    expect(phantomBrawlerStrikerMult('warrior')).toBe(1);
  });
});

describe('拳鬼が格闘で戦う(結合)', () => {
  beforeEach(() => {
    setTreesDisabled(true); setTorchesDisabled(true);
    useGameStore.getState().resetGame('rogue');
    const k = uniquePhantomSpec('brawler');
    setPhantomIdentity({ name: k.name, profile: k.profile, source: 'unique' });
  });

  const setup = (offsetX: number, over: Partial<Enemy> = {}) => {
    const k = uniquePhantomSpec('brawler');
    const e = spawnEnemyAt('guardian-phantom', ORIGIN, ORIGIN, START_GT);
    Object.assign(e, { phantomUnique: 'brawler', phantomBuild: k.profile.snapshot, health: 130, maxHealth: 130, dormant: false, bossState: 'chase' }, over);
    useGameStore.setState(s => ({
      enemies: [e], projectiles: [], gameTime: START_GT,
      player: { ...s.player, x: e.x + e.width / 2 + offsetX, y: e.y + e.height / 2 - s.player.height / 2, health: 9999, maxHealth: 9999, invulnerable: false, invulnerableTime: 0 },
    }));
    let gt = START_GT;
    const st = createPhantomTickState();
    const states = new Set<string>();
    const step = (ms: number): void => {
      gt += ms;
      useGameStore.setState({ gameTime: gt });
      const cur = useGameStore.getState().enemies.find(x => x.id === e.id);
      if (cur) { runPhantomTick(cur, st, gt, ms / 1000, 1, gt, NOOP_PHANTOM_SFX, () => 0.999); states.add(useGameStore.getState().enemies.find(x => x.id === e.id)?.bossState ?? ''); }
    };
    return { id: e.id, step, states, cur: () => useGameStore.getState().enemies.find(x => x.id === e.id)! };
  };

  it('間合いの内のプレイヤーへ通常の段を当てる(HPが減る・段が進む・相が登録される)・銃は撃たない', () => {
    const h = setup(40);
    const hp0 = useGameStore.getState().player.health;
    let maxStage = 0;
    for (let i = 0; i < 200; i++) { h.step(16); maxStage = Math.max(maxStage, h.cur().phantomBrawler?.stage ?? 0); }
    expect(useGameStore.getState().player.health).toBeLessThan(hp0);
    expect(maxStage).toBeGreaterThanOrEqual(2);
    expect(h.states.has('gp-brawler')).toBe(true);
    expect(useGameStore.getState().projectiles.filter(p => p.hostile).length).toBe(0);
  });

  // research/BRAWLER_PHANTOM.md §16-8(社長「どの攻撃も押さない攻撃でも多少押そう。少しずつズレた方が楽しい」→「ボスも拳鬼も」)
  it('押さなかった段(1・2・4段目)も小さく押す・押しても台本1(通常5連)は途切れずに5段目まで出る', () => {
    const h = setup(40); // ポイント0=払えるのは台本1だけ
    let maxStage = 0, pushedOnStage1 = false;
    for (let i = 0; i < 260 && maxStage < 5; i++) {
      const b0 = h.cur().phantomBrawler;
      const px0 = useGameStore.getState().player.x;
      h.step(16);
      const b = h.cur().phantomBrawler;
      maxStage = Math.max(maxStage, b?.stage ?? 0);
      // 1段目が当たった tick: プレイヤーに押しが付く(向き=拳鬼から離れる向き=+x)
      if (b0?.stage === 1 && !b0.resolved && b?.stage === 1 && b.resolved && b.connected) {
        const pl = useGameStore.getState().player;
        if ((pl.knockbackVx ?? 0) > 0 && (pl.knockbackUntil ?? 0) > Date.now() - 1) pushedOnStage1 = true;
        void px0;
      }
    }
    expect(pushedOnStage1).toBe(true);
    expect(maxStage).toBe(5);
  });

  it('技ポイントが通常の当たりで貯まる', () => {
    const h = setup(40);
    for (let i = 0; i < 200; i++) h.step(16);
    expect(h.cur().phantomBrawler?.points ?? 0).toBeGreaterThan(0);
  });

  it('プレイヤーのカウンターの窓の中で当たると、幻影のダメージ0+行動の取り消し', () => {
    const h = setup(40);
    useGameStore.setState(s => ({ player: { ...s.player, counterWindowStart: 0, counterWindowEnd: Date.now() + 1e9 } }));
    const hp0 = useGameStore.getState().player.health;
    for (let i = 0; i < 60; i++) h.step(16);
    expect(useGameStore.getState().player.health).toBe(hp0);
    expect(h.cur().phantomBrawler?.stage ?? 0).toBeLessThanOrEqual(1); // つながらない(毎回1段目で返される)
  });

  // research/BRAWLER_PHANTOM.md §16-3: 秘奥義は台本6(HP半分以下・ポイント満タン → 跳びかかり → 秘奥義)からだけ。
  // 旧のテストは「ポイントが揃っていれば(HP満タンでも)近くで狙う」を守っていた=新しい仕様に合わせて HP を半分にし、跳びを挟む。
  it('台本6: HP半分以下・ポイント満タンなら、近くても跳びかかり→着地後に秘奥義(→↓←↑)まで出し切り、プレイヤーを止めずに当てる・入力の手には予備動作が付く', () => {
    const k = uniquePhantomSpec('brawler');
    const h = setup(110, { phantomBrawler: { ...initialBrawlerState(), points: 20 }, phantomBuild: k.profile.snapshot, health: 65 });
    let sawSecret = false, sawLeap = false;
    const preps = new Set<string>();
    for (let i = 0; i < 900 && !sawSecret; i++) {
      h.step(16);
      const e = h.cur();
      if (e.aiPhase === 'jump') sawLeap = true;
      if (e.gpBrawlerPrep) preps.add(e.gpBrawlerPrep.tex);
      if (e.phantomBrawler?.secret) sawSecret = true;
    }
    expect(sawLeap).toBe(true);
    expect(sawSecret).toBe(true);
    expect(preps.has('ready')).toBe(true); // 1手目の蹴り=しゃがみ
    expect(preps.has('swing')).toBe(true); // 潰し・気功=腕上げ(予備動作の分で秘奥義の間隔が切れない)
    for (let i = 0; i < 400; i++) h.step(16);
    expect(h.cur().phantomBrawler?.points ?? 0).toBeLessThan(20);
    // プレイヤーを止める(brHoldUntil 等)仕組みはプレイヤーには無い=動けるまま
    expect(useGameStore.getState().player.health).toBeLessThan(9999);
  });

  it('HP満タンではポイントが揃っていても秘奥義を狙わない(旧の狙い方では出ない)', () => {
    const h = setup(110, { phantomBrawler: { ...initialBrawlerState(), points: 20 } });
    let sawSecret = false;
    for (let i = 0; i < 400; i++) { h.step(16); if (h.cur().phantomBrawler?.secret) sawSecret = true; }
    expect(sawSecret).toBe(false);
  });

  // research/BRAWLER_PHANTOM.md §16-5: 予備動作(初段の蹴り=しゃがみ・2発目以降の蹴りには出ない・間は判定が出ない)。
  it('予備動作: 台本5(1→飛び蹴り×3)で、初段の蹴りの前だけしゃがみが出る・その間は動かず判定も出ない', () => {
    const h = setup(40, { phantomBrawler: { ...initialBrawlerState(), points: 20 } }); // 乱数0.999=払える5本の最後=台本5
    let prepTicks = 0, prepStarts = 0, wasPrep = false, maxKickN = 0, kick1Starts = 0, lastKickStart = -1;
    let hpDuringPrepChanged = false;
    for (let i = 0; i < 300; i++) {
      const hp0 = useGameStore.getState().player.health;
      const x0 = h.cur().x;
      // 台本5の後に別の台本(潰し・気功=腕上げ)が始まることがある=数えるのはしゃがみ(蹴りの予備動作)だけ。
      const prepBefore = h.cur().gpBrawlerPrep?.tex === 'ready';
      h.step(16);
      const e = h.cur();
      const b = e.phantomBrawler;
      const prepNow = e.gpBrawlerPrep?.tex === 'ready';
      if (prepNow) {
        prepTicks++;
        expect(b?.phase === 'tech' && b.tech === 'kick' && !b.resolved).toBe(false); // 蹴りはまだ出ていない
        if (prepBefore) {
          if (useGameStore.getState().player.health !== hp0) hpDuringPrepChanged = true;
          expect(Math.abs(e.x - x0)).toBeLessThan(1.5); // 踏み込まない(歩きの速さが慣性で落ちる残りだけ=慣性MUST・跳びかかりの溜めと同じ)
        }
      }
      if (prepNow && !wasPrep) prepStarts++;
      wasPrep = prepNow;
      if (b?.phase === 'tech' && b.tech === 'kick' && b.startAt !== lastKickStart) {
        lastKickStart = b.startAt;
        maxKickN = Math.max(maxKickN, b.kickN);
        if (b.kickN === 1) kick1Starts++;
      }
    }
    expect(maxKickN).toBe(3);
    expect(prepStarts).toBeGreaterThan(0);
    expect(prepStarts).toBe(kick1Starts); // しゃがみは1発目の蹴りの数だけ(2・3発目には出ない)
    expect(prepTicks).toBeLessThanOrEqual(prepStarts * 6); // 80ms(16msの tick で5〜6回)
    expect(hpDuringPrepChanged).toBe(false);
  });

  // research/BRAWLER_PHANTOM.md §16-8(社長「あと格闘は攻撃食らっても技ポイント貯まる にしよう。ただし、ボスは銃弾では貯まらない。」)
  it('拳鬼は近接で食らうと技ポイント+1・銃弾では貯まらない', () => {
    const h = setup(400);
    h.step(16);
    const p0 = h.cur().phantomBrawler?.points ?? 0;
    const g = useGameStore.getState();
    g.damageEnemy(h.id, 5, false, false, false, 'gun', 'player', null, 1, 'bullet');
    expect(h.cur().gpMeleeHurtAt).toBeUndefined();
    h.step(16);
    expect(h.cur().phantomBrawler?.points ?? 0).toBe(p0);
    // 被弾無敵(1秒)の外で近接の当たり
    for (let i = 0; i < 70; i++) h.step(16);
    useGameStore.getState().damageEnemy(h.id, 5, false, false, false, 'other', 'player', null, 1, 'melee');
    expect(h.cur().gpMeleeHurtAt).toBeDefined();
    h.step(16);
    expect(h.cur().phantomBrawler?.points ?? 0).toBe(p0 + 1);
  });

  // research/BRAWLER_PHANTOM.md §16-8(社長裁定「台本の締めの気功(台本2・3)は当てる」): 近接の打撃と同じ扱い=被弾無敵に吸われない。
  it('台本3(1-2→気功)の締めの気功は、段の当たりの被弾無敵の中でも当たる', () => {
    const h = setup(40, { phantomBrawler: { ...initialBrawlerState(), points: 1 } }); // 払えるのは台本1・3=乱数0.999で台本3
    let kikoSeen = false, hitByKiko = false, invBefore = false;
    for (let i = 0; i < 200 && !kikoSeen; i++) {
      const pl = useGameStore.getState().player;
      const hp0 = pl.health;
      const inv = pl.invulnerable && Date.now() - pl.invulnerableTime < 1000;
      h.step(16);
      const b = h.cur().phantomBrawler;
      if (b?.phase === 'tech' && b.tech === 'kiko' && b.resolved) {
        // 近い(縁40px)ので、出たその tick に触れて爆発する。
        kikoSeen = true;
        invBefore = inv;
        hitByKiko = useGameStore.getState().player.health < hp0 && (useGameStore.getState().lastDamageSource ?? '').includes('気功');
      }
    }
    expect(kikoSeen).toBe(true);
    expect(invBefore).toBe(true); // 直前の2段目の当たりで被弾無敵の中
    expect(hitByKiko).toBe(true);
  });

  // research/BRAWLER_PHANTOM.md §16-9(社長「まず格闘のカウンターをすると、ポイント全回復 は削除」「雑魚以上の攻撃をカウンターした場合は通常のカウンター効果と、同時に自分が大きくノックバック」)
  it('構えで近接を受けても技ポイントは全回復しない・拳鬼が大きく下がる(加速→減速)', () => {
    const h = setup(40, { phantomBrawler: { ...initialBrawlerState(), points: 3 } });
    h.step(16);
    const x0 = h.cur().x;
    const gt = useGameStore.getState().gameTime;
    useGameStore.setState(s => ({ enemies: s.enemies.map(x => x.id === h.id ? { ...x, gpParriedAt: gt } : x) }));
    const xs: number[] = [];
    for (let i = 0; i < 24; i++) { h.step(16); xs.push(h.cur().x); }
    expect(h.cur().phantomBrawler?.points ?? 0).toBeLessThan(20); // 旧: 上限(20)まで全回復していた
    const moved = x0 - Math.min(...xs); // プレイヤーは右=左へ下がる
    expect(moved).toBeGreaterThan(110);
    expect(moved).toBeLessThan(190);
    expect(x0 - xs[0]).toBeLessThan(20); // 加速→減速: 最初の1歩は小さい
  });
  it('弾の打ち返し(構えで弾を受けた)では下がらない', () => {
    const h = setup(40, { phantomBrawler: { ...initialBrawlerState(), points: 3 } });
    h.step(16);
    const x0 = h.cur().x;
    const gt = useGameStore.getState().gameTime;
    useGameStore.setState(s => ({ enemies: s.enemies.map(x => x.id === h.id ? { ...x, gpBulletParriedAt: gt } : x) }));
    for (let i = 0; i < 24; i++) h.step(16);
    expect(x0 - h.cur().x).toBeLessThan(60); // 下がらない
  });

  it('印の無い幻影は格闘を回さない(今の幻影のまま)', () => {
    const h = setup(40, { phantomUnique: undefined });
    for (let i = 0; i < 100; i++) h.step(16);
    expect(h.cur().phantomBrawler).toBeUndefined();
  });

  // research/BRAWLER_PHANTOM.md §14(社長指示2026-11-10「拳鬼はカウンターすると縮地で距離を一気に詰めてくる。(ただし無限にワープはしない)」)
  it('縮地: 弾を打ち返した(カウンター成立)瞬間、遠ければプレイヤーの手前へ一気に詰める・1回のカウンターで1回・4秒に1回', () => {
    const h = setup(320);
    const edge = (): number => {
      const e = h.cur(); const p = useGameStore.getState().player;
      const cx = e.x + e.width / 2, cy = e.y + e.height / 2;
      const nx = Math.max(p.x, Math.min(cx, p.x + p.width)), ny = Math.max(p.y, Math.min(cy, p.y + p.height));
      return Math.hypot(cx - nx, cy - ny);
    };
    h.step(16);
    const before = edge();
    expect(before).toBeGreaterThan(200);
    const counterAt = useGameStore.getState().gameTime;
    useGameStore.setState(s => ({ enemies: s.enemies.map(x => x.id === h.id ? { ...x, gpBulletParriedAt: counterAt } : x) }));
    h.step(16);
    expect(edge()).toBeLessThan(70); // 手前(箱の縁どうし24px=中心から縁まで約44px)へ・近接の届く距離(74)の内
    expect(h.cur().gpShukuchi).toBeDefined();
    const at1 = h.cur().gpShukuchi!.at;
    // プレイヤーを遠ざける→同じカウンターでは二度と出ない
    const movePlayerAway = () => useGameStore.setState(s => {
      const e = s.enemies.find(x => x.id === h.id)!;
      return { player: { ...s.player, x: e.x + e.width / 2 + 320 } };
    });
    movePlayerAway(); h.step(16);
    expect(edge()).toBeGreaterThan(200);
    // 4秒以内の新しいカウンター=クールダウン中で出ない
    const c2 = useGameStore.getState().gameTime;
    useGameStore.setState(s => ({ enemies: s.enemies.map(x => x.id === h.id ? { ...x, gpBulletParriedAt: c2 } : x) }));
    h.step(16);
    expect(edge()).toBeGreaterThan(200);
    expect(h.cur().gpShukuchi!.at).toBe(at1);
    // 4秒明けてからの新しいカウンター=出る
    for (let i = 0; i < 260; i++) { h.step(16); movePlayerAway(); }
    const c3 = useGameStore.getState().gameTime;
    useGameStore.setState(s => ({ enemies: s.enemies.map(x => x.id === h.id ? { ...x, gpBulletParriedAt: c3 } : x) }));
    h.step(16);
    expect(edge()).toBeLessThan(70);
  });
  // research/BRAWLER_PHANTOM.md §15(社長「一つだけボス技をつけるのは?ジャンプ攻撃。赤予告あり。」→「え、新しい技?ハンターが使ってるよ」)
  it('跳びかかり=ハンターの跳び: 溜めの間は動かず・溜め明けのプレイヤーの所へ・予告の時間ちょうどで着地して当たる・着地後は固まる区分', () => {
    const h = setup(400);
    h.step(16);
    const gt0 = useGameStore.getState().gameTime;
    const crouchEnd = gt0 + PUMPKIN_CROUCH_MS / ENEMY_ATTACK_SPEED_MULT;
    useGameStore.setState(s => ({ enemies: s.enemies.map(x => x.id === h.id ? { ...x, aiPhase: 'crouch', aiPhaseUntil: crouchEnd } : x) }));
    const x0 = h.cur().x;
    h.step(16);
    expect(Math.abs(h.cur().x - x0)).toBeLessThan(1); // 溜めの間は動かない(歩きの慣性の残りだけ)
    expect(h.cur().bossState).toBe('gp-brawler');
    while (h.cur().aiPhase === 'crouch') h.step(16);
    const e1 = h.cur();
    expect(e1.aiPhase).toBe('jump');
    const p = useGameStore.getState().player;
    expect(e1.aiTargetX! + e1.width / 2).toBeCloseTo(p.x + p.width / 2, 5); // 着地点=溜め明けのプレイヤーの所
    const landAt = e1.aiPhaseUntil!;
    expect(landAt - e1.aiStartedAt!).toBeCloseTo(groundJumpAirMsRaw('hunter') / ENEMY_ATTACK_SPEED_MULT, 5); // 予告(描画)と同じ1本の時間
    const hp0 = useGameStore.getState().player.health;
    let landedAt = -1;
    while (h.cur().aiPhase === 'jump') {
      h.step(1);
      if (h.cur().aiPhase === 'recover' && landedAt < 0) landedAt = useGameStore.getState().gameTime;
    }
    expect(landedAt).toBeGreaterThanOrEqual(landAt);
    expect(landedAt - landAt).toBeLessThan(1.0001); // 当たる=予告が消え切る時刻
    expect(useGameStore.getState().player.health).toBeLessThan(hp0);
    expect(h.cur().bossState).toBe('gp-brawler-recover');
    for (let i = 0; i < 200 && h.cur().aiPhase === 'recover'; i++) h.step(16);
    expect(h.cur().aiPhase).toBeUndefined();
  });
  it('縮地: 届く距離の内でのカウンター(近接の窓)では詰めない', () => {
    const h = setup(40);
    h.step(16);
    const x0 = h.cur().x;
    const counterAt = useGameStore.getState().gameTime;
    useGameStore.setState(s => ({ enemies: s.enemies.map(x => x.id === h.id ? { ...x, gpParriedAt: counterAt } : x) }));
    h.step(16);
    expect(h.cur().gpShukuchi).toBeUndefined();
    expect(Math.abs(h.cur().x - x0)).toBeLessThan(10);
  });
});
