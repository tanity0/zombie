import { describe, it, expect } from 'vitest';
import {
  hitStunMsFor, HIT_STUN_MS_MOB, HIT_STUN_MS_STRONG, knockbackWeightFor, KNOCKBACK_WEIGHT_STRONG,
  stepKillChain, killChainTier, killChainSfxRate, killChainEdgePulseMs, KILL_CHAIN_WINDOW_MS,
  recoilSpecFor, recoilKickOffset, casingSpecFor, casingVelocity,
} from './combatFeel';

describe('戦闘の手触り(utils/combatFeel・社長指示2026-09-13)', () => {
  describe('① 当たった敵の局所ストップ+重さ', () => {
    it('雑魚=60ms・強個体(パンプキン/削岩型/伐採人)=40ms・ボス級=0', () => {
      expect(hitStunMsFor('zombie')).toBe(HIT_STUN_MS_MOB);
      expect(hitStunMsFor('pumpkin')).toBe(HIT_STUN_MS_STRONG);
      expect(hitStunMsFor('driller')).toBe(HIT_STUN_MS_STRONG);
      expect(hitStunMsFor('logger')).toBe(HIT_STUN_MS_STRONG);
      expect(hitStunMsFor('thor')).toBe(0);
      expect(hitStunMsFor('giantbat')).toBe(0);
      expect(hitStunMsFor('mimir')).toBe(0);
    });
    it('強個体の区分3型は全員同じ重さ(区分テンプレ)・雑魚とボス級は1(不変)', () => {
      expect(knockbackWeightFor('pumpkin')).toBe(KNOCKBACK_WEIGHT_STRONG);
      expect(knockbackWeightFor('driller')).toBe(KNOCKBACK_WEIGHT_STRONG);
      expect(knockbackWeightFor('logger')).toBe(KNOCKBACK_WEIGHT_STRONG);
      expect(knockbackWeightFor('zombie')).toBe(1);
      expect(knockbackWeightFor('thor')).toBe(1);
    });
  });

  describe('② 連続撃破の段', () => {
    it('窓内のキルは数を積み、窓を超えると1から', () => {
      let s = stepKillChain({ count: 0, lastAt: -1e9 }, 1000);
      expect(s.count).toBe(1);
      s = stepKillChain(s, 1000 + KILL_CHAIN_WINDOW_MS);
      expect(s.count).toBe(2);
      s = stepKillChain(s, s.lastAt + KILL_CHAIN_WINDOW_MS + 1);
      expect(s).toEqual({ count: 1, lastAt: 1000 + KILL_CHAIN_WINDOW_MS * 2 + 1 });
    });
    it('段は 3/5/10 で上がる', () => {
      expect([0, 1, 2].map(killChainTier)).toEqual([0, 0, 0]);
      expect([3, 4].map(killChainTier)).toEqual([1, 1]);
      expect([5, 9].map(killChainTier)).toEqual([2, 2]);
      expect([10, 30].map(killChainTier)).toEqual([3, 3]);
    });
    it('SEピッチと画面端の長さは段ごとに単調に増える(均質にしない)', () => {
      const rates = [0, 1, 2, 3].map(killChainSfxRate);
      const pulses = [0, 1, 2, 3].map(killChainEdgePulseMs);
      for (let i = 1; i < 4; i++) {
        expect(rates[i]).toBeGreaterThan(rates[i - 1]);
        expect(pulses[i]).toBeGreaterThan(pulses[i - 1]);
      }
      expect(killChainSfxRate(0)).toBe(1);
      expect(killChainEdgePulseMs(0)).toBe(0);
      expect(killChainSfxRate(99)).toBe(killChainSfxRate(3)); // 範囲外は最上段に丸める
    });
  });

  describe('③ 反動', () => {
    it('銃種で差がつく(ハンドガン<ライフル<ショットガン)・レールガンはkeyで上書き', () => {
      const h = recoilSpecFor('handgun'), r = recoilSpecFor('rifle'), s = recoilSpecFor('shotgun');
      expect(h.kickPx).toBeLessThan(r.kickPx);
      expect(r.kickPx).toBeLessThan(s.kickPx);
      expect(recoilSpecFor('rifle', 'railgun').kickPx).toBeGreaterThan(s.kickPx);
      expect(recoilSpecFor('rifle', 'ice-lance')).toEqual(r);
    });
    it('キックは撃った瞬間が最大で、二次のease-outで0へ戻る', () => {
      expect(recoilKickOffset(8, 170, 170)).toBe(8);
      const mid = recoilKickOffset(8, 85, 170);
      expect(mid).toBeCloseTo(2, 5); // 半分の時間で 1/4
      expect(recoilKickOffset(8, 0, 170)).toBe(0);
      expect(recoilKickOffset(8, -5, 170)).toBe(0);
      expect(recoilKickOffset(8, 500, 170)).toBe(8); // 残りが長さを超えても上限
    });
    it('薬莢はレールガン/PHILL/ランチャーで出ない・ショットガンは赤い殻・他は真鍮', () => {
      expect(casingSpecFor('rifle', 'railgun')).toBeNull();
      expect(casingSpecFor('phill')).toBeNull();
      expect(casingSpecFor('glauncher')).toBeNull();
      expect(casingSpecFor('shotgun')?.color).toBe('#b91c1c');
      expect(casingSpecFor('handgun')?.color).toBe('#d4a03a');
    });
    it('薬莢の初速は射線の右手側+上向き(右撃ちなら下側へ、上向き成分は負)', () => {
      const v = casingVelocity(1, 0, 0.5);
      expect(v.vx).toBeLessThan(0);   // 射線の逆へ少し
      expect(v.vy).toBeGreaterThan(-Infinity);
      // 右手側(px,py)=(0,1)→ side は +y、上向きは -y。上向きの方が強いので合計は負(上へ飛び出す)。
      expect(v.vy).toBeLessThan(0);
      const up = casingVelocity(0, -1, 0.5); // 上撃ち: 右手側は +x
      expect(up.vx).toBeGreaterThan(0);
    });
  });
});
