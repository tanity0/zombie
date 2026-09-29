// ★ウリの魔法の詠唱(社長支給2026-09-29「後半、剣がてっぺん超えたら剣先を光らせて」)。
import { describe, it, expect } from 'vitest';
import angelTickSrc from './angelBossTick.ts?raw';
import { BOSS_PHASE_SHEETS, SHEET_TIP_GLOW, bossPhaseFor, bossPhaseFrame } from './enemySheets';

describe('ウリの詠唱', () => {
  const spec = BOSS_PHASE_SHEETS.find(s => s.name === 'uri-cast')!;
  it('雷弾の3州がこのシートを引き(剣技は待機のまま)、州名は台本に実在する', () => {
    for (const st of ['bolt-windup', 'bolt', 'bolt-recover']) {
      expect(bossPhaseFor('uri', st)?.spec.name, st).toBe('uri-cast');
      expect(angelTickSrc.includes(`'${st}'`), st).toBe(true);
    }
    for (const st of ['sweep-windup', 'downslash', 'thrust-windup', 'chase']) expect(bossPhaseFor('uri', st), st).toBeNull();
  });
  it('溜めの終わりで真上(9)へ掲げ切り、撃つ間は必ず「てっぺんを越えた」コマ(10〜15)', () => {
    expect(bossPhaseFrame(bossPhaseFor('uri', 'bolt-windup')!.phase, 0.999, 0, 90)).toBe(9);
    const bolt = bossPhaseFor('uri', 'bolt')!.phase;
    for (let k = 0; k < 100; k++) expect(bossPhaseFrame(bolt, k / 100, 0, 90)).toBeGreaterThanOrEqual(10);
  });
  it('★剣先が光るのは「てっぺんを越えた」コマ(10〜15)だけ・点は枠の中', () => {
    const tips = SHEET_TIP_GLOW['uri-cast'];
    expect(Object.keys(tips).map(Number).sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 14, 15]);
    for (const [x, y] of Object.values(tips)) {
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1504 / spec.frames);
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThan(170);
    }
  });
});
