// 変異体対策室(練習ラン)の開幕: 全ての枠で大型武器庫(金箱)と、その下の武器商人が立つ(社長指示2026-11-20)。本編は今までどおり。
import { describe, it, expect, afterEach } from 'vitest';
import { useGameStore } from './gameStore';
import { beginPracticeRun, endPracticeRun, PRACTICE_SLOTS, practiceSlotByKey, SCARECROW_SLOT_KEY } from '../utils/bossPractice';

const st = () => useGameStore.getState();
afterEach(() => { endPracticeRun(); });

describe('練習ランの開幕の設備', () => {
  it('案山子の枠: 金箱1個+その下に武器商人(会話できる半径)', () => {
    beginPracticeRun(practiceSlotByKey(SCARECROW_SLOT_KEY)!, { stageId: 'stage-1', mission: 'revisit', free: false });
    st().resetGame('soldier');
    const chests = st().pickups.filter(p => p.type === 'bounty-chest');
    expect(chests.map(c => c.id)).toEqual(['practice-start-chest']);
    const m = st().weaponMerchant;
    expect(m.radius).toBeGreaterThan(0);
    expect(m.y).toBeGreaterThan(chests[0].y);
  });

  it('全ての枠で金箱と商人が立つ(ステージ7の枠も金箱は1個だけ)', () => {
    for (const slot of PRACTICE_SLOTS) {
      beginPracticeRun(slot, { stageId: slot.stageId, mission: 'revisit', free: false });
      st().resetGame('soldier');
      const chests = st().pickups.filter(p => p.id === 'practice-start-chest' || p.id === 'stage7-start-chest');
      expect(chests.length, slot.slotKey).toBe(1);
      expect(st().weaponMerchant.radius, slot.slotKey).toBeGreaterThan(0);
      endPracticeRun();
    }
  });

  it('本編(練習ではない出撃)は今までどおり=練習の金箱は置かない', () => {
    st().resetGame('soldier');
    expect(st().pickups.some(p => p.id === 'practice-start-chest')).toBe(false);
  });
});
