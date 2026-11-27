import { describe, it, expect } from 'vitest';
import { brawlerLinkHitPatch, brawlerLinkRestoreOnLift, brawlerAirborneWithoutLink } from './brawlerLinkLift';
import { brawlerLinkMax, brawlerLinkFree } from './brawlerCombo';

describe('宙の敵の「N HIT」(utils/brawlerLinkLift・§23)', () => {
  it('格闘の当たりで書く数: 当たる直前に動けなければ続き(+1)・動けたら 1', () => {
    expect(brawlerLinkHitPatch({}, 5000, 100)).toEqual({ brComboHits: 1 });
    expect(brawlerLinkHitPatch({ brComboHits: 4, brLiftUntil: 200 }, 5000, 100)).toEqual({ brComboHits: 5 }); // 宙=動けない
    expect(brawlerLinkHitPatch({ brComboHits: 4 }, 5000, 100)).toEqual({ brComboHits: 1 });                    // 地上で動ける
  });
  it('数を持った敵は宙にいる間は動けない=数が残る(切れない)・着地したら動ける', () => {
    const e = { brComboHits: 3, brLiftUntil: 1000, health: 10 };
    expect(brawlerLinkFree(e, 0, 999)).toBe(false);
    expect(brawlerLinkMax([e], 0, 999)).toBe(3);
    expect(brawlerLinkFree(e, 0, 1000)).toBe(true);
    expect(brawlerLinkMax([e], 0, 1000)).toBe(0);
  });
  it('後から掛かる爆発の浮き: 当たった時の数を戻す(間に消されていても)・多い方を残す・浮かなければ戻さない', () => {
    const lift = { brLiftUntil: 600 };
    expect(brawlerLinkRestoreOnLift({}, lift, 2, 100)).toEqual({ brComboHits: 2 });
    expect(brawlerLinkRestoreOnLift({ brComboHits: 5 }, lift, 2, 100)).toBeNull();             // 既に多い数を持っている
    expect(brawlerLinkRestoreOnLift({ brComboHits: 1 }, lift, 2, 100)).toEqual({ brComboHits: 2 });
    expect(brawlerLinkRestoreOnLift({}, null, 2, 100)).toBeNull();                              // 浮かなかった
    expect(brawlerLinkRestoreOnLift({}, { brLiftUntil: 100 }, 2, 100)).toBeNull();              // もう着地している弧
    expect(brawlerLinkRestoreOnLift({}, lift, undefined, 100)).toBeNull();                      // 格闘の爆発ではない(手榴弾など)=数を作らない
  });
  it('検査: 宙なのに数を持たない生きた敵だけを挙げる(倒れた敵・地上の敵は挙げない)', () => {
    const es = [
      { id: 'a', health: 5, brLiftUntil: 500 },
      { id: 'b', health: 5, brLiftUntil: 500, brComboHits: 1 },
      { id: 'c', health: 0, brLiftUntil: 500 },
      { id: 'd', health: 5, brLiftUntil: 500, corpseUntil: 900 },
      { id: 'e', health: 5 },
    ];
    expect(brawlerAirborneWithoutLink(es, 100)).toEqual(['a']);
  });
});
