import { describe, it, expect } from 'vitest';
import { kickAssistShouldSpeak, ESCORT_KICK_ASSIST_WINDOW_MS } from './escortToss';
import type { EscortKickRecord } from '../types/game';
import { NPC_SCENE_VARIANTS, pickNpcLine } from '../data/npcLines';

// 兵士が蹴り飛ばした敵をプレイヤーが窓の内に倒した時、蹴った兵士が一言言うか。
describe('kickAssistShouldSpeak', () => {
  const rec = (over: Partial<EscortKickRecord> = {}): EscortKickRecord => ({ escortId: 'escort-0', soldierIndex: 2, at: 10000, ...over });

  it('inside the window (including the edge) → yes', () => {
    expect(kickAssistShouldSpeak(rec(), 10000, true)).toBe(true);
    expect(kickAssistShouldSpeak(rec(), 11500, true)).toBe(true);
    expect(kickAssistShouldSpeak(rec(), 10000 + ESCORT_KICK_ASSIST_WINDOW_MS, true)).toBe(true);
  });
  it('outside the window → no', () => {
    expect(kickAssistShouldSpeak(rec(), 10000 + ESCORT_KICK_ASSIST_WINDOW_MS + 1, true)).toBe(false);
    expect(kickAssistShouldSpeak(rec(), 9999, true)).toBe(false); // 蹴りより前の時刻(時計の巻き戻り)は数えない
  });
  it('no kicker record → no', () => {
    expect(kickAssistShouldSpeak(undefined, 10000, true)).toBe(false);
  });
  it('already spoken for this kick → no', () => {
    expect(kickAssistShouldSpeak(rec({ spoken: true }), 10500, true)).toBe(false);
  });
  it('kicker gone / unable to speak → no', () => {
    expect(kickAssistShouldSpeak(rec(), 10500, false)).toBe(false);
  });
  it('window is 3 seconds', () => {
    expect(ESCORT_KICK_ASSIST_WINDOW_MS).toBe(3000);
  });
});

describe('kickAssist lines', () => {
  for (let idx = 0; idx <= 7; idx++) {
    it(`soldier ${idx} has a kickAssist line and pickNpcLine returns it`, () => {
      const texts = NPC_SCENE_VARIANTS.filter(v => v.idx === idx && v.cat === 'kickAssist').map(v => v.text);
      expect(texts.length).toBe(1);
      expect(pickNpcLine(idx, 'kickAssist', '__fallback__')).toBe(texts[0]);
    });
  }
});
