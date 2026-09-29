import { describe, it, expect } from 'vitest';
import tickSrc from './idolTick.ts?raw';
import { BOSS_PHASE_SHEETS, bossPhaseFor, bossPhaseFrame } from './enemySheets';

describe('アイドルの狙撃・追尾弾', () => {
  const spec = BOSS_PHASE_SHEETS.find(s => s.name === 'idol-snipe')!;
  it('狙撃と追尾弾の州がこのシートを引き、州名は台本に実在する(州名を変えたら絵が黙って消える形を止める)', () => {
    for (const ph of spec.phases) {
      expect(tickSrc.includes(`'${ph.state}'`) || tickSrc.includes('`idol-${m}-windup`'), ph.state).toBe(true);
      expect(bossPhaseFor('idol', ph.state)?.spec.name, ph.state).toBe('idol-snipe');
    }
    expect(tickSrc.includes("'idol-snipe'")).toBe(true);
  });
  it('★閃光のコマ(1)は弾が出る瞬間=狙撃は判定の州の頭・追尾弾は硬直の頭。溜めの間は構え(0)のまま', () => {
    expect(bossPhaseFrame(bossPhaseFor('idol', 'idol-snipe-windup')!.phase, 0.999, 0, 90)).toBe(0);
    expect(bossPhaseFrame(bossPhaseFor('idol', 'idol-snipe')!.phase, 0, 0, 90)).toBe(1);
    expect(bossPhaseFrame(bossPhaseFor('idol', 'idol-orb-windup')!.phase, 0.999, 0, 90)).toBe(0);
    expect(bossPhaseFrame(bossPhaseFor('idol', 'idol-orb-recover')!.phase, 0, 0, 90)).toBe(1);
    expect(bossPhaseFrame(bossPhaseFor('idol', 'idol-snipe-recover')!.phase, 0.999, 0, 90)).toBe(15);
  });
  it('他の技(狙い撃ち・扇撃ち・ロール・拳・手榴弾)は引かない', () => {
    for (const st of ['idol-aim-windup', 'idol-fan-windup', 'idol-roll', 'idol-punch-windup', 'idol-nade-windup', 'chase']) {
      expect(bossPhaseFor('idol', st), st).toBeNull();
    }
  });
});
