import { describe, it, expect } from 'vitest';
import {
  hitStunMsFor, HIT_STUN_MS_MOB, HIT_STUN_MS_STRONG, HIT_STUN_REARM_MS, nextHitStunUntil,
  stepKillChain, killChainTier, killChainSfxRate, killChainEdgePulseMs, killChainEdgeEnvelope, KILL_CHAIN_WINDOW_MS, KILL_CHAIN_SFX_JITTER,
  recoilSpecForWeapon, recoilKickOffset, recoilKickDir, RECOIL_KICK_MAX_PX, RECOIL_HEAVY_PX,
  casingSpecFor, casingVelocity, stepFloorParticle, isEnemyAttacking,
} from './combatFeel';

describe('戦闘の手触り(utils/combatFeel・社長指示2026-09-13)', () => {
  describe('① 当たった敵の局所ストップ', () => {
    it('雑魚=60ms・強個体(パンプキン/削岩型/伐採人)=40ms・ボス級=0', () => {
      expect(hitStunMsFor('zombie')).toBe(HIT_STUN_MS_MOB);
      expect(hitStunMsFor('pumpkin')).toBe(HIT_STUN_MS_STRONG);
      expect(hitStunMsFor('driller')).toBe(HIT_STUN_MS_STRONG);
      expect(hitStunMsFor('logger')).toBe(HIT_STUN_MS_STRONG);
      expect(hitStunMsFor('thor')).toBe(0);
      expect(hitStunMsFor('giantbat')).toBe(0);
      expect(hitStunMsFor('mimir')).toBe(0);
    });
    it('再発火ガード: 前の止めの開始から REARM 未満は書かない(連射銃で常時停止にならない)', () => {
      const t0 = 10000;
      const u1 = nextHitStunUntil('zombie', undefined, t0);
      expect(u1).toBe(t0 + HIT_STUN_MS_MOB);
      // 100ms 間隔の連射: 2発目(t0+100)はまだガード内 → 書かない
      expect(nextHitStunUntil('zombie', u1, t0 + 100)).toBeUndefined();
      // REARM を過ぎたら次の止め
      expect(nextHitStunUntil('zombie', u1, t0 + HIT_STUN_REARM_MS)).toBe(t0 + HIT_STUN_REARM_MS + HIT_STUN_MS_MOB);
      // ボス級は常に undefined
      expect(nextHitStunUntil('thor', undefined, t0)).toBeUndefined();
    });
  });

  describe('② 連続撃破の段', () => {
    it('窓内のキルは数を積み(近接の同時複数体も)、窓を超えると1から', () => {
      let s = stepKillChain({ count: 0, lastAt: -1e9 }, 1000);
      expect(s.count).toBe(1);
      s = stepKillChain(s, 1000 + KILL_CHAIN_WINDOW_MS, 3); // 刀で3体同時
      expect(s.count).toBe(4);
      s = stepKillChain(s, s.lastAt + KILL_CHAIN_WINDOW_MS + 1, 2);
      expect(s).toEqual({ count: 2, lastAt: 1000 + KILL_CHAIN_WINDOW_MS * 2 + 1 });
    });
    it('段は 3/5/10 で上がる', () => {
      expect([0, 1, 2].map(killChainTier)).toEqual([0, 0, 0]);
      expect([3, 4].map(killChainTier)).toEqual([1, 1]);
      expect([5, 9].map(killChainTier)).toEqual([2, 2]);
      expect([10, 30].map(killChainTier)).toEqual([3, 3]);
    });
    it('SEピッチは段で単調に上がり、1発ごとに±3%揺れる', () => {
      const rates = [0, 1, 2, 3].map(t => killChainSfxRate(t));
      for (let i = 1; i < 4; i++) expect(rates[i]).toBeGreaterThan(rates[i - 1]);
      expect(killChainSfxRate(0)).toBe(1);
      expect(killChainSfxRate(0, 1)).toBeCloseTo(1 + KILL_CHAIN_SFX_JITTER, 9);
      expect(killChainSfxRate(0, 0)).toBeCloseTo(1 - KILL_CHAIN_SFX_JITTER, 9);
      expect(killChainSfxRate(99)).toBe(killChainSfxRate(3)); // 範囲外は最上段に丸める
    });
    it('画面端の脈: 段0は無し・段1/2は一拍・段3は二拍(二拍目の方が強い)', () => {
      expect(killChainEdgePulseMs(0)).toBe(0);
      expect(killChainEdgeEnvelope(0, 10)).toBe(0);
      const p1 = killChainEdgePulseMs(1);
      expect(killChainEdgeEnvelope(1, p1 * 0.12)).toBeGreaterThan(killChainEdgeEnvelope(1, p1 * 0.6));
      expect(killChainEdgeEnvelope(1, p1)).toBe(0);
      expect(killChainEdgeEnvelope(1, -1)).toBe(0);
      // 段3: 一拍目のピーク(≈31ms)より二拍目のピーク(≈200+50ms)が強い。その間(150ms付近)は谷。
      const a = killChainEdgeEnvelope(3, 31), valley = killChainEdgeEnvelope(3, 190), b = killChainEdgeEnvelope(3, 250);
      expect(b).toBeGreaterThan(a);
      expect(valley).toBeLessThan(a);
      expect(killChainEdgeEnvelope(3, killChainEdgePulseMs(3))).toBe(0);
    });
  });

  describe('③ 反動', () => {
    const w = (damage: number, cooldown: number, extra: Partial<Parameters<typeof recoilSpecForWeapon>[0]> = {}) =>
      ({ damage, cooldown, category: 'handgun' as const, ...extra });
    it('武器ごとに差がつく(1発の威力の√・SHAKE_UNIFY): マシンピストル<ハンドキャノン<散弾(全弾ぶん)<対物ライフル', () => {
      const mp = recoilSpecForWeapon(w(7, 100));
      const hc = recoilSpecForWeapon(w(31, 620));
      const am = recoilSpecForWeapon(w(110, 1300, { category: 'rifle' }));
      const sg = recoilSpecForWeapon(w(6, 950, { category: 'shotgun', count: 5 }));
      expect(mp.kickPx).toBeLessThan(hc.kickPx);
      expect(hc.kickPx).toBeLessThan(sg.kickPx);
      expect(sg.kickPx).toBeLessThan(am.kickPx);
      expect(am.kickPx).toBeLessThanOrEqual(RECOIL_KICK_MAX_PX);
      // 押し武器(パイルドライバー knockbackMult 2)は同威力より重い
      expect(recoilSpecForWeapon(w(36, 450, { knockbackMult: 2 })).kickPx).toBeGreaterThan(recoilSpecForWeapon(w(36, 450)).kickPx);
    });
    it('連射系(間隔<300ms)はレート正規化で絞る(マシンピストルはハンドガンの半分未満)。床は無い(弱い銃は小さいまま)', () => {
      const mp = recoilSpecForWeapon(w(7, 100));
      const hg = recoilSpecForWeapon(w(9, 420));
      expect(mp.kickPx).toBeLessThan(hg.kickPx * 0.5);
      expect(mp.kickPx).toBeGreaterThan(0);
      expect(recoilSpecForWeapon(w(110, 1300, { category: 'rifle' })).kickPx).toBeGreaterThan(6);
    });
    it('長さは発射間隔の75%(連射銃は次弾の前に戻り切る)・重い銃だけオーバーシュート', () => {
      expect(recoilSpecForWeapon(w(7, 100)).kickMs).toBe(75);
      expect(recoilSpecForWeapon(w(110, 1300)).kickMs).toBe(190);
      expect(recoilSpecForWeapon(w(7, 100)).overshoot).toBe(0);
      const heavy = recoilSpecForWeapon(w(110, 1300, { category: 'rifle' }));
      expect(heavy.kickPx).toBeGreaterThanOrEqual(RECOIL_HEAVY_PX);
      expect(heavy.overshoot).toBeGreaterThan(0);
    });
    it('キックは撃った瞬間が最大で二次のease-outで0へ。オーバーシュートは途中で僅かに反対側へ出る', () => {
      expect(recoilKickOffset(8, 170, 170)).toBe(8);
      expect(recoilKickOffset(8, 85, 170)).toBeCloseTo(2, 5);
      expect(recoilKickOffset(8, 0, 170)).toBe(0);
      expect(recoilKickOffset(8, 500, 170)).toBe(8);
      expect(recoilKickOffset(8, 170, 170, 0.15)).toBe(8);      // 起点は同じ
      expect(recoilKickOffset(8, 34, 170, 0.15)).toBeLessThan(0); // t=0.2 で負
      expect(recoilKickOffset(8, 34, 170, 0)).toBeGreaterThan(0);
    });
    it('向きは射線の逆に垂直のぶれを混ぜた単位ベクトル。ぶれは毎発同じ側へ片寄る(散らばりではなく傾向)', () => {
      const a = recoilKickDir(-1, 0, 0);
      const b = recoilKickDir(-1, 0, 1);
      expect(Math.hypot(a.x, a.y)).toBeCloseTo(1, 9);
      expect(Math.hypot(b.x, b.y)).toBeCloseTo(1, 9);
      expect(a.x).toBeLessThan(0); expect(b.x).toBeLessThan(0);
      expect(Math.sign(a.y)).toBe(Math.sign(b.y)); // 同じ側
      expect(Math.abs(b.y)).toBeGreaterThan(Math.abs(a.y)); // rand で大きさだけ変わる
      expect(Math.abs(a.y)).toBeGreaterThan(0);
    });
    it('薬莢はレールガン/PHILL/ランチャー/非投射で出ない・散弾は赤い殻・二丁は左右2つ', () => {
      expect(casingSpecFor({ category: 'rifle', key: 'rifle-t3-railgun' })).toBeNull();
      expect(casingSpecFor({ category: 'phill' })).toBeNull();
      expect(casingSpecFor({ category: 'glauncher' })).toBeNull();
      expect(casingSpecFor({ category: 'shotgun', key: 'shotgun-t3-flamer', nonProjectile: true })).toBeNull();
      expect(casingSpecFor({ category: 'shotgun' })?.colors[0]).toBe('#b91c1c');
      expect(casingSpecFor({ category: 'handgun', count: 2 })?.sides).toEqual([1, -1]);
      expect(casingSpecFor({ category: 'rifle' })?.sides).toEqual([1]);
    });
    it('薬莢の初速は右手側(side=+1)+上向き、side=−1 で反対側', () => {
      const r = casingVelocity(1, 0, 1, 0.5);
      expect(r.vx).toBeLessThan(0); // 射線の逆へ少し
      expect(r.vy).toBeLessThan(0); // 右手側(+y)より上向き(−y)が強い
      const l = casingVelocity(1, 0, -1, 0.5);
      expect(l.vy).toBeLessThan(r.vy); // 左手側は上向きが足し合わさる
      const up = casingVelocity(0, -1, 1, 0.5);
      expect(up.vx).toBeGreaterThan(0);
    });
    it('床つき粒: 床に達したら1回跳ね、遅ければ止まる。床の上・上昇中は触らない', () => {
      expect(stepFloorParticle(0, 10, 50, 14)).toEqual({ y: 0, vx: 10, vy: 50, rested: false });
      expect(stepFloorParticle(20, 10, -50, 14)).toEqual({ y: 20, vx: 10, vy: -50, rested: false });
      const b = stepFloorParticle(16, 40, 200, 14);
      expect(b.y).toBe(14); expect(b.vy).toBeLessThan(0); expect(b.rested).toBe(false);
      const r = stepFloorParticle(15, 20, 60, 14);
      expect(r).toEqual({ y: 14, vx: 0, vy: 0, rested: true });
    });
  });
});

// ★社長裁定2026-09-17「攻撃中スーパーアーマーで採用してみよう」。
describe('★攻撃中スーパーアーマー(isEnemyAttacking)', () => {
  const T = 10_000;
  it('技を実行中(chaffMove)ならアーマーが立つ', () => {
    expect(isEnemyAttacking({ chaffMove: 'bat-grab' }, T)).toBe(true);
  });
  it('噛みつきを構えていればアーマーが立つ', () => {
    expect(isEnemyAttacking({ biteAt: T - 100 }, T)).toBe(true);
  });
  it('技の相にいればアーマーが立つ(zpause=ゾンビの紫の停止も予告なので含む)', () => {
    expect(isEnemyAttacking({ aiPhase: 'zpause' }, T)).toBe(true);
    expect(isEnemyAttacking({ aiPhase: 'crouch' }, T)).toBe(true);
  });
  it('何もしていなければアーマーは無い', () => {
    expect(isEnemyAttacking({}, T)).toBe(false);
    expect(isEnemyAttacking({ biteAt: 0 }, T)).toBe(false);
  });
  it('★クリティカルの気絶中はアーマーが切れる(クリで止めた敵は押せる)', () => {
    expect(isEnemyAttacking({ chaffMove: 'bat-grab', stunUntil: T + 5000 }, T)).toBe(false);
    expect(isEnemyAttacking({ aiPhase: 'jump', bossFullStunUntil: T + 1000 }, T)).toBe(false);
  });
  it('気絶が明ければアーマーは戻る', () => {
    expect(isEnemyAttacking({ chaffMove: 'bat-grab', stunUntil: T }, T)).toBe(true);
  });
});
