// §6.36 ボス出現カットインの純関数テスト(受け入れ条件5: first-winsの機械検査+位相の不変条件)。
import { describe, expect, it } from 'vitest';
import { BOSS_CUTIN_MS, isCutinWindow, shouldIgnoreAttention } from './attentionCutin';
import { bossCutinName, CASTLE_BOSS_NAME_BY_STAGE } from '../data/bossCutin';

describe('shouldIgnoreAttention (first-wins)', () => {
  it('attentionが居ない時は常に通す(従来どおり)', () => {
    expect(shouldIgnoreAttention(false, false, false)).toBe(false);
    expect(shouldIgnoreAttention(false, false, true)).toBe(false);
  });
  it('素のattention同士は従来どおり上書き=無視しない', () => {
    expect(shouldIgnoreAttention(true, false, false)).toBe(false);
  });
  it('生存中のcutin持ちは後着を無視する(素の後着も無視)', () => {
    expect(shouldIgnoreAttention(true, true, false)).toBe(true);
    expect(shouldIgnoreAttention(true, true, true)).toBe(true);
  });
  it('素のattention生存中にcutin持ちが来ても後着を無視(first-wins)', () => {
    expect(shouldIgnoreAttention(true, false, true)).toBe(true);
  });
});

describe('isCutinWindow (attention開始と同時に出す・v0.25.2956)', () => {
  it('素のattention(cutinMs=0)では常にfalse', () => {
    for (const el of [0, 100, 2000, 3000]) {
      expect(isCutinWindow(el, 0)).toBe(false);
    }
  });
  it('cutin窓はattention開始(0)から始まり、cutinMsで閉じる', () => {
    expect(isCutinWindow(0, BOSS_CUTIN_MS)).toBe(true);
    expect(isCutinWindow(BOSS_CUTIN_MS - 1, BOSS_CUTIN_MS)).toBe(true);
    expect(isCutinWindow(BOSS_CUTIN_MS, BOSS_CUTIN_MS)).toBe(false);
  });
});

describe('bossCutinName (名前の台帳・新名の発明なし)', () => {
  it('城ボスは裁定済みステージだけ名前を持つ(社長裁定2026-08-07)', () => {
    expect(bossCutinName('giantbat', 'stage-1')).toBe('搬送体(変異)');
    expect(bossCutinName('giantbat', 'stage-3')).toBe('樹木管理員(変異)');
    expect(bossCutinName('giantbat', 'stage-4')).toBe('衛生兵(変異)');
    expect(bossCutinName('giantbat', 'stage-5')).toBe('軍隊(変異)');
    expect(bossCutinName('giantbat', 'stage-7')).toBe('グレン');
  });
  it('実装してない城ボス(stage-2/ex1)は台帳に無い=null(「?」表示・カットイン無し)', () => {
    expect(bossCutinName('giantbat', 'stage-2')).toBeNull();
    expect(bossCutinName('giantbat', 'stage-ex1')).toBeNull();
    expect(CASTLE_BOSS_NAME_BY_STAGE['stage-2']).toBeUndefined();
    expect(CASTLE_BOSS_NAME_BY_STAGE['stage-ex1']).toBeUndefined();
  });
  it('固有名ボスはプレイヤー既出の和名', () => {
    expect(bossCutinName('mimir')).toBe('ミーミル');
    expect(bossCutinName('idol')).toBe('偶像');
    expect(bossCutinName('acrasiel')).toBe('アクラシエル');
  });
  it('台帳に無い型はnull(カットイン無し)', () => {
    expect(bossCutinName('hunter')).toBeNull();
    expect(bossCutinName('reaper')).toBeNull();
  });
});
