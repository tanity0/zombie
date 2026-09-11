import { describe, expect, it } from 'vitest';
import type { EnemyType } from '../types/game';
import {
  telegraphStyleFor, meteorPhase, TELEGRAPH_METEOR_DRAW_FRAC_DEFAULT,
  TELEGRAPH_STYLE_MOB, TELEGRAPH_STYLE_ELITE, TELEGRAPH_STYLE_BOSS, TELEGRAPH_STYLE_TERMINAL,
} from './telegraphStyle';

// research/CREATIVE_AUDIT_2026-09-11.md #25(b): 雑魚=既定(今の値)/強個体/ボス級/終端の3種+既定。
const ALL_TYPES: EnemyType[] = [
  'bat', 'skeleton', 'zombie', 'plant', 'ghost', 'werewolf', 'pumpkin', 'driller', 'logger',
  'giantbat', 'reaper', 'hangedman', 'lich', 'lab-zombie-1', 'lab-zombie-2', 'lab-zombie-3',
  'mimir', 'jormungand', 'skadi', 'thor', 'miguel', 'jibril', 'rafi', 'uri', 'suriel', 'acrasiel',
  'idol', 'hunter', 'screamer', 'bounty-ranged', 'bounty-melee', 'bounty-balance', 'bounty-maiko',
  'guardian-phantom', 'phillboss',
];

describe('telegraphStyleFor(#25(b)・区分ごとの赤予告スタイル)', () => {
  it('雑魚=今の値(既定・1pxも変えない)', () => {
    expect(TELEGRAPH_STYLE_MOB).toEqual({ drawFrac: 0.45, haloRel: 0.34, bandHalfW: 0.34, pulseMs: 110, easePow: 2 });
    for (const t of ['bat', 'skeleton', 'zombie', 'plant', 'ghost', 'werewolf', 'lich', 'screamer', 'hangedman', 'lab-zombie-1', 'lab-zombie-2'] as EnemyType[]) {
      expect(telegraphStyleFor(t)).toEqual(TELEGRAPH_STYLE_MOB);
    }
  });

  it('強個体(体勢値を持つ型=POSTURE_ELITE_TYPES): パンプキン/削岩型/伐採人/実験体3/死神', () => {
    for (const t of ['pumpkin', 'driller', 'logger', 'lab-zombie-3', 'reaper'] as EnemyType[]) {
      expect(telegraphStyleFor(t)).toEqual(TELEGRAPH_STYLE_ELITE);
    }
  });

  it('ボス級(isBossType かつ終端でないもの・賞金首含む)', () => {
    for (const t of [
      'hunter', 'miguel', 'jibril', 'rafi', 'uri', 'suriel', 'acrasiel', 'idol', 'guardian-phantom',
      'bounty-ranged', 'bounty-melee', 'bounty-balance', 'bounty-maiko',
    ] as EnemyType[]) {
      expect(telegraphStyleFor(t)).toEqual(TELEGRAPH_STYLE_BOSS);
    }
  });

  it('終端(Stage.hiddenBoss型+城ボス+EXボス)', () => {
    for (const t of ['mimir', 'jormungand', 'skadi', 'thor', 'giantbat', 'phillboss'] as EnemyType[]) {
      expect(telegraphStyleFor(t)).toEqual(TELEGRAPH_STYLE_TERMINAL);
    }
  });

  it('未知の型は雑魚に落ちる(区分に無いものは既定)', () => {
    expect(telegraphStyleFor('not-a-real-type' as EnemyType)).toEqual(TELEGRAPH_STYLE_MOB);
  });

  it('全区分で D<1・帯幅>0・周期>0(受け入れ条件)', () => {
    for (const style of [TELEGRAPH_STYLE_MOB, TELEGRAPH_STYLE_ELITE, TELEGRAPH_STYLE_BOSS, TELEGRAPH_STYLE_TERMINAL]) {
      expect(style.drawFrac).toBeGreaterThan(0);
      expect(style.drawFrac).toBeLessThan(1);
      expect(style.haloRel).toBeGreaterThan(0);
      expect(style.bandHalfW).toBeGreaterThan(0);
      expect(style.pulseMs).toBeGreaterThan(0);
      expect(style.easePow).toBeGreaterThan(0);
    }
  });

  // ★追記(品質監査1巡目・2026-09-12): 帯(カプセル)の窓幅は円の haloRel と同じ比を使う
  // (区分ごとに独立の値を発明しない)。
  it('bandHalfW は haloRel と同じ比を使う(#25(b)追記)', () => {
    for (const style of [TELEGRAPH_STYLE_MOB, TELEGRAPH_STYLE_ELITE, TELEGRAPH_STYLE_BOSS, TELEGRAPH_STYLE_TERMINAL]) {
      expect(style.bandHalfW).toBe(style.haloRel);
    }
  });

  it('重いボスほど遅く・太く・ゆっくり脈打つ(雑魚<強個体は逆に速く・細く。ボス級<終端は重くなる方向)', () => {
    // 強個体は雑魚より速く・細く(CLAUDE.md「速い個体は早く・細く・速く脈打つ」)。
    expect(TELEGRAPH_STYLE_ELITE.drawFrac).toBeLessThan(TELEGRAPH_STYLE_MOB.drawFrac);
    expect(TELEGRAPH_STYLE_ELITE.haloRel).toBeLessThan(TELEGRAPH_STYLE_MOB.haloRel);
    expect(TELEGRAPH_STYLE_ELITE.pulseMs).toBeLessThan(TELEGRAPH_STYLE_MOB.pulseMs);
    // ボス級・終端は雑魚より遅く・太く(CLAUDE.md「重いボスは遅く・太く・ゆっくり脈打つ」)。
    expect(TELEGRAPH_STYLE_BOSS.drawFrac).toBeGreaterThan(TELEGRAPH_STYLE_MOB.drawFrac);
    expect(TELEGRAPH_STYLE_TERMINAL.drawFrac).toBeGreaterThan(TELEGRAPH_STYLE_BOSS.drawFrac);
    expect(TELEGRAPH_STYLE_TERMINAL.haloRel).toBeGreaterThan(TELEGRAPH_STYLE_BOSS.haloRel);
    expect(TELEGRAPH_STYLE_TERMINAL.pulseMs).toBeGreaterThan(TELEGRAPH_STYLE_BOSS.pulseMs);
    expect(TELEGRAPH_STYLE_TERMINAL.easePow).toBeGreaterThanOrEqual(TELEGRAPH_STYLE_BOSS.easePow);
  });

  it('区分から漏れなく全型を分類できる(未定義の型名を参照していない=コンパイルが通ることで担保)', () => {
    for (const t of ALL_TYPES) {
      expect(() => telegraphStyleFor(t)).not.toThrow();
    }
  });
});

// ★追記(品質監査1巡目・2026-09-12「meteorPhase を純関数へ出して」): 旧 PixiScene の private static
// メソッドをここへ出した(pixiScene.ts 側は委譲するだけの薄いラッパー)。
describe('meteorPhase(溜め進行から描き/消しを導く・純関数)', () => {
  it('既定 D=TELEGRAPH_METEOR_DRAW_FRAC_DEFAULT(0.45・今の挙動)', () => {
    expect(TELEGRAPH_METEOR_DRAW_FRAC_DEFAULT).toBe(0.45);
    expect(meteorPhase(0.2)).toEqual(meteorPhase(0.2, TELEGRAPH_METEOR_DRAW_FRAC_DEFAULT));
  });

  it('prog=0 は描き0・消し0', () => {
    expect(meteorPhase(0)).toEqual({ p: 0, er: 0 });
  });

  it('任意の 0<D<1 で prog=1 のとき er=1 になる(=消え切り=判定発生の瞬間と必ず一致する)', () => {
    for (const D of [0.05, 0.2, 0.4, 0.45, 0.5, 0.58, 0.8, 0.95]) {
      const ph = meteorPhase(1, D);
      expect(ph.p).toBe(1);
      expect(ph.er).toBeCloseTo(1, 10);
    }
  });

  it('D 以下は描きだけ進み消しは0(p=prog/D)・D を超えると描き切ってp=1固定、消しが進む', () => {
    const D = 0.4;
    expect(meteorPhase(0.2, D)).toEqual({ p: 0.5, er: 0 });
    expect(meteorPhase(D, D)).toEqual({ p: 1, er: 0 });
    const after = meteorPhase(0.7, D);
    expect(after.p).toBe(1);
    expect(after.er).toBeCloseTo((0.7 - D) / (1 - D), 10);
  });

  it('prog を 0〜1 の外へ渡してもクランプされる', () => {
    expect(meteorPhase(-1, 0.4)).toEqual({ p: 0, er: 0 });
    expect(meteorPhase(2, 0.4).p).toBe(1);
    expect(meteorPhase(2, 0.4).er).toBeCloseTo(1, 10);
  });
});
