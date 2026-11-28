// パニッシャーの衝突の瞬間の「止め+小さな浮き」(社長指示2026-11-20・utils/punisherImpact.ts)の配線テスト。
// 飛んで来た敵(ぶつかった側)とぶつけられた側の両方が、止まってから浮く。ボス級は浮かない。ダメージ・勢い・連鎖は今どおり。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, PUNISHER_TWO_BEAT_MS } from './gameStore';
import { spawnEnemyAtWithTier } from '../utils/enemyUtils';
import { PUNISHER_STOP_MS, punisherLiftPeak, punisherLiftMs, punisherLiftPatch, punisherFlyerStopPatch } from '../utils/punisherImpact';
import { BRAWLER_JUGGLE_PUSH } from '../utils/brawlerCombo';
import type { Enemy, EnemyType } from '../types/game';

let now = 2_000_000;
const st = () => useGameStore.getState();
const byId = (id: string) => st().enemies.find(e => e.id === id)!;

const setup = (victimType: EnemyType) => {
  st().resetGame('warrior');
  useGameStore.setState(s => ({ player: { ...s.player, skills: ['punisher'], skillLevels: { punisher: 1 } } }));
  const p = st().player;
  const px = p.x + 400, py = p.y; // プレイヤーから離れた所(近接・接触に巻き込まれない)
  const flyer: Enemy = { ...spawnEnemyAtWithTier('zombie', px, py, st().gameTime, 'none'), id: 'fly', health: 999, maxHealth: 999,
    knockbackUntil: now + 200, knockbackVx: 300, knockbackVy: 0 };
  const victim: Enemy = { ...spawnEnemyAtWithTier(victimType, px + 10, py, st().gameTime, 'none'), id: 'vic', health: 99999, maxHealth: 99999 };
  useGameStore.setState({ enemies: [flyer, victim] });
};

beforeEach(() => { now = 2_000_000; vi.spyOn(Date, 'now').mockImplementation(() => now); });
afterEach(() => { vi.restoreAllMocks(); });

describe('パニッシャーの衝突: 止め+小さな浮き', () => {
  it('雑魚どうし: 両方が止まり、止めが明けてから浮く。飛ぶ勢いと押しの残りは変わらない', () => {
    setup('zombie');
    const kbBefore = byId('fly').knockbackUntil!;
    st().updateEnemies(1 / 60);
    const fly = byId('fly'), vic = byId('vic');
    // ぶつけられた側: 既存の一拍目(その場で固まる)=止め。浮きはその一拍が明けた時から。
    expect(vic.punisherPendingAt).toBe(now + PUNISHER_TWO_BEAT_MS);
    expect(vic.brawlerLiftAt).toBe(now + PUNISHER_TWO_BEAT_MS);
    expect(vic.liftUntil).toBe(now + PUNISHER_TWO_BEAT_MS + punisherLiftMs('mob'));
    expect(vic.brLiftPeak).toBeCloseTo(BRAWLER_JUGGLE_PUSH.s4 * 0.4, 5);
    expect(vic.punisherPendingVx).toBe(300); // 勢いは同じ(継承)
    // ぶつかった側: 止め+押しの残りを後ろへずらす+止めが明けてから浮く。
    expect(fly.hitStunUntil).toBe(now + PUNISHER_STOP_MS);
    expect(fly.knockbackUntil).toBe(kbBefore + PUNISHER_STOP_MS);
    expect(fly.knockbackVx).toBe(300);
    expect(fly.brawlerLiftAt).toBe(now + PUNISHER_STOP_MS);
    // 止めの間は動かない
    const x0 = fly.x;
    now += 50; st().updateEnemies(1 / 60);
    expect(byId('fly').x).toBe(x0);
    // 二拍目: ダメージと継承の押し(今どおり)
    now += PUNISHER_TWO_BEAT_MS; st().updateEnemies(1 / 60);
    expect(byId('vic').health).toBeLessThan(99999);
    expect(byId('vic').knockbackVx).toBe(300);
  });

  it('ボス級は浮かない(止めは今どおりの一拍)', () => {
    setup('giantbat');
    st().updateEnemies(1 / 60);
    const vic = byId('vic');
    expect(vic.punisherPendingAt).toBe(now + PUNISHER_TWO_BEAT_MS); // 巻き込みは今どおり起きている
    expect(vic.brawlerLiftAt).toBeUndefined();
    expect(vic.liftUntil === undefined || vic.liftUntil <= now).toBe(true);
    expect(byId('fly').brawlerLiftAt).toBe(now + PUNISHER_STOP_MS); // ぶつかった雑魚は浮く
    expect(punisherLiftPeak('boss')).toBe(0);
  });
});

describe('純関数', () => {
  it('重さで低く短くなる・ボスは0', () => {
    expect(punisherLiftPeak('strong')).toBeLessThan(punisherLiftPeak('mob'));
    expect(punisherLiftMs('strong')).toBeLessThanOrEqual(punisherLiftMs('mob'));
    expect(punisherLiftPatch({}, 'boss', now, now, 0)).toBeNull();
    expect(punisherLiftPatch({}, null, now, now, 0)).toBeNull();
  });
  it('もう浮いている敵は浮き直さない・予算は1使う', () => {
    expect(punisherLiftPatch({ brLiftUntil: now + 100 }, 'mob', now, now, 0)).toBeNull();
    expect(punisherLiftPatch({}, 'mob', now, now, 0)!.brLiftBudget).toBe(5);
  });
  it('止め: 既に止まっていれば重ねない・押しが無ければ止めだけ', () => {
    expect(punisherFlyerStopPatch({ hitStunUntil: now + 10 }, now)).toBeNull();
    expect(punisherFlyerStopPatch({}, now)).toEqual({ hitStunUntil: now + PUNISHER_STOP_MS });
    expect(punisherFlyerStopPatch({ knockbackUntil: now + 100, knockbackStopFor: now + 100 }, now))
      .toEqual({ hitStunUntil: now + PUNISHER_STOP_MS, knockbackUntil: now + 100 + PUNISHER_STOP_MS, knockbackStopFor: now + 100 + PUNISHER_STOP_MS });
  });
});
