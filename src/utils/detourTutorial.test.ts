import { describe, expect, it } from 'vitest';
import { shouldShowDetourTutorial } from './detourTutorial';
import { getTutorial } from '../data/tutorials';

const READY = {
  anyBaseCaptured: true,
  seen: false,
  trainingStage: false,
  popupOpen: false,
  menuOpen: false,
  dialogueActive: false,
  bossFight: false,
  attention: false,
};

describe('shouldShowDetourTutorial(寄り道・拠点を初めて確保した時)', () => {
  it('拠点を確保したら出す', () => {
    expect(shouldShowDetourTutorial(READY)).toBe(true);
  });

  it('拠点を確保するまでは出さない', () => {
    expect(shouldShowDetourTutorial({ ...READY, anyBaseCaptured: false })).toBe(false);
  });

  it('端末で既読なら二度と出さない', () => {
    expect(shouldShowDetourTutorial({ ...READY, seen: true })).toBe(false);
  });

  it('訓練(M0)では出さない', () => {
    expect(shouldShowDetourTutorial({ ...READY, trainingStage: true })).toBe(false);
  });

  it('会話・別ポップアップ・メニュー・ボス戦・アテンションへ割り込まない', () => {
    for (const k of ['popupOpen', 'menuOpen', 'dialogueActive', 'bossFight', 'attention'] as const) {
      expect(shouldShowDetourTutorial({ ...READY, [k]: true }), k).toBe(false);
    }
  });
});

describe('detour-poi の台帳', () => {
  it('ゲーム中に出るので、資料室には既読になってから並ぶ(archiveAlwaysではない)', () => {
    const t = getTutorial('detour-poi');
    expect(t).toBeTruthy();
    expect(t!.archiveAlways).toBeFalsy();
  });

  it('武将の祠と赤いドクロは書かない・印の色や形で説明しない', () => {
    const body = getTutorial('detour-poi')!.lines.join('');
    expect(body).not.toMatch(/祠|ドクロ|緑の十字|琥珀|青い星/);
  });
});
