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

import { PB_BREATH_MIN_MS } from './phantomBrawlerAi';
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

  const setup = (offsetX: number, over: Partial<Enemy> = {}, rand: () => number = () => 0.999) => {
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
      if (cur) { runPhantomTick(cur, st, gt, ms / 1000, 1, gt, NOOP_PHANTOM_SFX, rand); states.add(useGameStore.getState().enemies.find(x => x.id === e.id)?.bossState ?? ''); }
    };
    return { id: e.id, step, states, st, cur: () => useGameStore.getState().enemies.find(x => x.id === e.id)! };
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

  // ---- 検収監査2026-11-10 の是正(出荷されるバグ) -------------------------------------------------
  const patchKenki = (id: string, patch: Partial<Enemy>) =>
    useGameStore.setState(s => ({ enemies: s.enemies.map(x => x.id === id ? { ...x, ...patch } : x) }));

  // 1. 「殴られた」は近接だけ。lastHit は銃弾・燃焼・犬・タレットでも書かれる=それで台本・予備動作を崩さない。
  it('弾・燃焼で毎フレーム被弾していても、台本1(通常5連)は5段目まで出る', () => {
    const h = setup(40); // ポイント0=台本1
    let maxStage = 0;
    for (let i = 0; i < 260 && maxStage < 5; i++) {
      patchKenki(h.id, { lastHit: Date.now() + i }); // 弾・燃焼の被弾(近接の打刻 gpMeleeHurtAt は打たれない)
      h.step(16);
      maxStage = Math.max(maxStage, h.cur().phantomBrawler?.stage ?? 0);
    }
    expect(maxStage).toBe(5);
  });
  it('弾・燃焼で毎フレーム被弾していても、予備動作は潰れない(台本5の蹴りが3発目まで出る)', () => {
    const h = setup(40, { phantomBrawler: { ...initialBrawlerState(), points: 20 } }); // 乱数0.999=台本5
    let maxKickN = 0;
    for (let i = 0; i < 300 && maxKickN < 3; i++) {
      patchKenki(h.id, { lastHit: Date.now() + i });
      h.step(16);
      const b = h.cur().phantomBrawler;
      if (b?.phase === 'tech' && b.tech === 'kick') maxKickN = Math.max(maxKickN, b.kickN);
    }
    expect(maxKickN).toBe(3);
  });
  it('近接で殴られたら、予備動作は取り消し・台本は打ち切り(技は出ない・払わない)', () => {
    const h = setup(40, { phantomBrawler: { ...initialBrawlerState(), points: 20 } }); // 台本5
    let cancelled = false;
    for (let i = 0; i < 300 && !cancelled; i++) {
      h.step(16);
      if (h.cur().gpBrawlerPrep) {
        const pts = h.cur().phantomBrawler?.points ?? 0;
        patchKenki(h.id, { gpMeleeHurtAt: useGameStore.getState().gameTime });
        h.step(16);
        expect(h.cur().gpBrawlerPrep).toBeUndefined();
        expect(h.st.brawler?.prep ?? null).toBeNull();
        expect(h.st.brawler?.mind.script ?? null).toBeNull();
        const b = h.cur().phantomBrawler;
        expect(b?.phase === 'tech' && b.tech === 'kick').toBe(false);
        expect(b?.points ?? 0).toBe(Math.min(20, pts + 1)); // 蹴りの代金は払っていない(食らった分の+1だけ・上限)
        cancelled = true;
      }
    }
    expect(cancelled).toBe(true);
  });

  // 2. 締めの気功の「近接扱い」は、気功を決めた時点で決めて弾に持たせる(溜めの間に台本が打ち切られても近接扱いのまま)。
  it('台本3の締めの気功: 溜めの間に弾を食らい、さらに近接で殴られて台本が打ち切られても、近接扱いで当たる', () => {
    const h = setup(40, { phantomBrawler: { ...initialBrawlerState(), points: 1 } }); // 台本1・3=乱数0.999で台本3
    let kikoSeen = false, hitByKiko = false, invBefore = false, punched = false;
    for (let i = 0; i < 200 && !kikoSeen; i++) {
      patchKenki(h.id, { lastHit: Date.now() + i }); // 弾の被弾
      const b0 = h.cur().phantomBrawler;
      // 気功の出だし(判定の前)で近接を食らう=台本は打ち切られる(行動は続く)
      if (!punched && b0?.phase === 'tech' && b0.tech === 'kiko' && !b0.resolved) {
        punched = true;
        patchKenki(h.id, { gpMeleeHurtAt: useGameStore.getState().gameTime });
      }
      const pl = useGameStore.getState().player;
      const hp0 = pl.health;
      const inv = pl.invulnerable && Date.now() - pl.invulnerableTime < 1000;
      h.step(16);
      if (punched && !kikoSeen) expect(h.st.brawler?.mind.script ?? null).toBeNull();
      const b = h.cur().phantomBrawler;
      if (b?.phase === 'tech' && b.tech === 'kiko' && b.resolved) {
        kikoSeen = true;
        invBefore = inv;
        hitByKiko = useGameStore.getState().player.health < hp0 && (useGameStore.getState().lastDamageSource ?? '').includes('気功');
      }
    }
    expect(punched).toBe(true);
    expect(kikoSeen).toBe(true);
    expect(invBefore).toBe(true);
    expect(hitByKiko).toBe(true);
  });

  // 3. 予備動作を取り消されたら「使った」記録を残さない。
  it('詰めの蹴りの予備動作を近接で取り消されたら、「直前に蹴った」の打刻は残らない', () => {
    const h = setup(120, { phantomBrawler: { ...initialBrawlerState(), points: 1 } }, () => 0); // 乱数0=拍ごとに蹴りを選ぶ(構えは払えない)
    let done = false;
    for (let i = 0; i < 200 && !done; i++) {
      h.step(16);
      if (h.cur().gpBrawlerPrep?.tex === 'ready') {
        expect(h.st.brawler!.mind.lastKickAt).toBeGreaterThan(0); // 決めた時点では書いてある
        patchKenki(h.id, { gpMeleeHurtAt: useGameStore.getState().gameTime });
        // 取り消しの直後(次の判断の前)に確かめる: 予備動作の取り消しは判断より先
        const mind = h.st.brawler!.mind;
        mind.approachBeatAt = Number.MAX_SAFE_INTEGER; // この後の拍で蹴り直さない(巻き戻った値を見るため)
        h.step(16);
        expect(h.cur().gpBrawlerPrep).toBeUndefined();
        expect(mind.lastKickAt).toBe(-Infinity);
        done = true;
      }
    }
    expect(done).toBe(true);
  });
  it('台本6: 秘奥義の間隔と跳びかかりのクールダウンは実際に跳んだ時に使う・1手目の蹴りの予備動作を近接で取り消されても秘奥義の狙いは残る', () => {
    const k = uniquePhantomSpec('brawler');
    const h = setup(110, { phantomBrawler: { ...initialBrawlerState(), points: 20 }, phantomBuild: k.profile.snapshot, health: 65 });
    let sawCrouch = false, sawJump = false, cancelledOnce = false, sawSecret = false;
    for (let i = 0; i < 1200 && !sawSecret; i++) {
      h.step(16);
      const e = h.cur();
      const mind = h.st.brawler!.mind;
      if (e.aiPhase === 'crouch') {
        sawCrouch = true;
        expect(mind.lastSecretAt).toBe(-Infinity); // 溜めの間はまだ使っていない
        expect(h.st.brawler!.leapReadyAt).toBe(0);
      }
      if (e.aiPhase === 'jump' && !sawJump) {
        sawJump = true;
        expect(mind.lastSecretAt).toBeGreaterThan(0);
        expect(h.st.brawler!.leapReadyAt).toBeGreaterThan(0);
      }
      if (!cancelledOnce && mind.secretPlan && e.gpBrawlerPrep?.tex === 'ready') {
        cancelledOnce = true;
        expect(mind.secretLaunched).toBe(true);
        patchKenki(h.id, { gpMeleeHurtAt: useGameStore.getState().gameTime });
        h.step(16);
        expect(h.cur().gpBrawlerPrep === undefined || h.cur().gpBrawlerPrep?.tex === 'ready').toBe(true);
        expect(mind.secretPlan).toBe(true); // 狙いは残る(蹴りは出ていない=外れた扱いにしない)
      }
      if (e.phantomBrawler?.secret) sawSecret = true;
    }
    expect(sawCrouch).toBe(true);
    expect(sawJump).toBe(true);
    expect(cancelledOnce).toBe(true);
    expect(sawSecret).toBe(true); // 出し直して秘奥義まで届く
  });

  // 4. 縮地の直後に息継ぎを入れない。
  it('縮地: 台本の最中にカウンターが成立して縮地しても、息継ぎは入らない(そのまま次の行動へ)', () => {
    const h = setup(320);
    h.step(16);
    const mind = h.st.brawler!.mind;
    mind.script = { id: 1, idx: 1 }; mind.wasBusy = true; // 台本の最中・行動中だった
    const counterAt = useGameStore.getState().gameTime;
    patchKenki(h.id, { gpBulletParriedAt: counterAt });
    h.step(16);
    expect(h.cur().gpShukuchi).toBeDefined();
    expect(mind.breathOwed).toBe(false);
    const gt = useGameStore.getState().gameTime;
    // 息継ぎ(300〜700ms)が入っていれば nextStringAt は今より先。縮地の後は今以前のまま=すぐ次の連続へ。
    expect(mind.nextStringAt).toBeLessThanOrEqual(gt);
    let attackedAt = -1;
    for (let i = 0; i < 12 && attackedAt < 0; i++) { h.step(16); if (h.cur().phantomBrawler?.phase === 'attack') attackedAt = useGameStore.getState().gameTime - gt; }
    expect(attackedAt).toBeGreaterThan(0);
    expect(attackedAt).toBeLessThan(200); // 息継ぎの下限(300ms)より前に打ち始める
  });

  // 5. 構えで受けて下がる動きを、次の行動で途中で止めない。
  it('構えで受けて下がり切るまで(280ms)は次の行動を始めない・下がり切ったら動き出す', () => {
    // 下がった後は届く距離の外=詰めの蹴り・気功は拍ごとの抽選なので、このテストは疑似乱数で回す(0.999 固定だと一度も選ばれない)。
    let seed = 5;
    const lcg = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const h = setup(40, { phantomBrawler: { ...initialBrawlerState(), points: 20 } }, lcg);
    h.step(16);
    const x0 = h.cur().x;
    const gt0 = useGameStore.getState().gameTime;
    patchKenki(h.id, { gpParriedAt: gt0 });
    let minX = x0;
    for (let i = 0; i < 17; i++) { // 272ms
      const xPrev = h.cur().x;
      h.step(16);
      const e = h.cur();
      expect(e.phantomBrawler?.phase ?? 'idle').toBe('idle'); // 段・技を始めない
      expect(e.gpBrawlerPrep).toBeUndefined();               // 予備動作も
      expect(e.aiPhase).toBeUndefined();                      // 跳びかかりも
      if (i > 0) expect(e.x).toBeLessThanOrEqual(xPrev + 0.01); // 途中で前へ出ない(下がり続ける。受けた tick だけは歩きの残りがある)
      minX = Math.min(minX, e.x);
    }
    h.step(16); h.step(16);
    minX = Math.min(minX, h.cur().x);
    expect(x0 - minX).toBeGreaterThan(130); // 下がり切る(150px・壁なし。受けた tick の歩きの分だけ差が出る)
    let acted = false;
    for (let i = 0; i < 400 && !acted; i++) {
      h.step(16);
      const e = h.cur();
      if ((e.phantomBrawler?.phase ?? 'idle') !== 'idle' || e.gpBrawlerPrep || e.aiPhase !== undefined) acted = true;
    }
    expect(acted).toBe(true);
  });

  // 7. 締めの気功(近接扱い)は、返された時は触れた時も爆発の縁でも弾けるだけ(拳鬼は押されない・体勢も削れない)。
  it('締めの気功が爆発の縁でカウンターされても、弾けるだけ(プレイヤーは無傷・拳鬼の体勢と位置は変わらない)', () => {
    const h = setup(400);
    h.step(16);
    const e = h.cur();
    const pl = useGameStore.getState().player;
    // 届く距離いっぱいまで飛んで爆発する弾: 爆発の縁(触れてはいない)にプレイヤーが居るように置く。
    const cy = pl.y + pl.height / 2;
    patchKenki(h.id, { gpKiko: { id: 'k1', x: pl.x - 60, y: cy, dirX: 0, dirY: 1, traveled: 419, createdAt: Date.now(), melee: true } });
    useGameStore.setState(s => ({ player: { ...s.player, counterWindowStart: 0, counterWindowEnd: Date.now() + 1e9 } }));
    const hp0 = useGameStore.getState().player.health;
    const post0 = h.cur().pvpPosture;
    h.step(16);
    expect(h.cur().gpKiko).toBeUndefined(); // 爆発した(届く距離の終わり)
    expect(useGameStore.getState().player.health).toBe(hp0);
    expect(h.cur().pvpPosture).toEqual(post0);
    expect(h.cur().knockbackUntil ?? 0).toBeLessThan(Date.now()); // 押されていない(旧: 近接の1本へ流れて、遠くの拳鬼が押されて体勢が削れた)
    void e;
  });

  // 8. スケボーのバッシュ: 板が直接当たった範囲だけ近接として数える。覚醒の爆発で広がった分は爆発=数えない。
  it('スケボーの覚醒の爆発の広がりでは「近接で食らった」を打たない・板が直接当たった範囲では打つ', () => {
    const awaken = () => useGameStore.setState(s => ({ player: { ...s.player, skills: ['skater'], skillLevels: { ...s.player.skillLevels, skater: 3 } } }));
    // 爆発の広がりの中(板の範囲140pxの外・覚醒の半径の内)
    const far = setup(400);
    awaken();
    const e1 = far.cur();
    useGameStore.getState().skaterBoardHit(e1.x + e1.width / 2 + 200, e1.y + e1.height / 2, 1, 0);
    expect(far.cur().health).toBeLessThan(130); // 爆発は当たっている
    expect(far.cur().gpMeleeHurtAt).toBeUndefined();
    // 板が直接当たった範囲
    const near = setup(400);
    awaken();
    const e2 = near.cur();
    useGameStore.getState().skaterBoardHit(e2.x + e2.width / 2 + 60, e2.y + e2.height / 2, 1, 0);
    expect(near.cur().gpMeleeHurtAt).toBeDefined();
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
  // research/BRAWLER_PHANTOM.md §15-4(社長承認2026-11-11・A2「撃たれ続けている時だけ溜めを半分」)
  it('跳びかかりの溜め: 撃たれ続けている時に始めた跳びは溜めが半分・跳んでいる時間(避ける時間)は同じ', () => {
    const h = setup(400, {}, () => 0.5); // 0.5=撃たれ続けている時の確率(0.65)には入り、普段の確率(0.3)には入らない
    let crouchStart = -1;
    for (let i = 0; i < 600 && h.cur().aiPhase !== 'crouch'; i++) {
      // 撃たれ続ける(被弾の時刻を進める)
      if (i % 20 === 0) useGameStore.setState(s => ({ enemies: s.enemies.map(x => x.id === h.id ? { ...x, lastHit: useGameStore.getState().gameTime } : x) }));
      h.step(16);
      if (h.cur().aiPhase === 'crouch') crouchStart = useGameStore.getState().gameTime;
    }
    expect(h.cur().aiPhase).toBe('crouch');
    const crouchLen = h.cur().aiPhaseUntil! - crouchStart;
    expect(crouchLen).toBeGreaterThan(PUMPKIN_CROUCH_MS * 0.5 / ENEMY_ATTACK_SPEED_MULT - 20);
    expect(crouchLen).toBeLessThanOrEqual(PUMPKIN_CROUCH_MS * 0.5 / ENEMY_ATTACK_SPEED_MULT + 1);
    while (h.cur().aiPhase === 'crouch') h.step(16);
    const e1 = h.cur();
    expect(e1.aiPhase).toBe('jump');
    expect(e1.aiPhaseUntil! - e1.aiStartedAt!).toBeCloseTo(groundJumpAirMsRaw('hunter') / ENEMY_ATTACK_SPEED_MULT, 5); // 予告の時間は変えていない
  });
  // research/BRAWLER_PHANTOM.md §15-3(社長指示2026-11-11「ジャンプで詰めてきたら、すぐに攻撃に転じてくる癖をいれたい」)
  it('跳びかかりで詰めた後: 着地後の停止が明けたら、息継ぎなしですぐ次の連続へ(8割)。外れた時は今までどおり息継ぎ', () => {
    const run = (rand: () => number) => {
      const h = setup(400, {}, rand);
      h.step(16);
      const gt0 = useGameStore.getState().gameTime;
      useGameStore.setState(s => ({ enemies: s.enemies.map(x => x.id === h.id ? { ...x, aiPhase: 'crouch', aiPhaseUntil: gt0 + PUMPKIN_CROUCH_MS / ENEMY_ATTACK_SPEED_MULT } : x) }));
      for (let i = 0; i < 2000 && h.cur().aiPhase !== 'recover'; i++) h.step(16);
      expect(h.cur().aiPhase).toBe('recover');
      const recoverFrom = useGameStore.getState().gameTime;
      for (let i = 0; i < 400 && h.cur().aiPhase === 'recover'; i++) h.step(16);
      expect(h.cur().aiPhase).toBeUndefined();
      const doneAt = useGameStore.getState().gameTime;
      const mind = h.st.brawler!.mind;
      const nextStringAt = mind.nextStringAt;
      let attackedAfter = -1;
      for (let i = 0; i < 80 && attackedAfter < 0; i++) { h.step(16); if (h.cur().phantomBrawler?.phase === 'attack') attackedAfter = useGameStore.getState().gameTime - doneAt; }
      return { stopMs: doneAt - recoverFrom, breath: nextStringAt - doneAt, attackedAfter };
    };
    const follow = run(() => 0.5);   // 0.5 < 0.8 = 癖が出る
    const rest = run(() => 0.999);   // 外れ = 今までどおり
    // 着地後の停止(ハンターと同じ長さ)は変えていない
    expect(Math.abs(follow.stopMs - rest.stopMs)).toBeLessThanOrEqual(16);
    expect(follow.breath).toBeLessThanOrEqual(0);        // 息継ぎなし
    expect(rest.breath).toBeGreaterThanOrEqual(PB_BREATH_MIN_MS - 16); // 息継ぎあり(300〜700ms)
    expect(follow.attackedAfter).toBeGreaterThanOrEqual(0);
    expect(follow.attackedAfter).toBeLessThanOrEqual(120); // 停止が明けて数フレームで殴り始める
    expect(rest.attackedAfter === -1 || rest.attackedAfter > follow.attackedAfter + 150).toBe(true);
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
