import { describe, it, expect } from 'vitest';
import { enemyScreamFrame, enemyScreamLastFrame, enemyScreamReleaseFrame, SCREAM_RELEASE_MS } from './enemyScreamSheet';
import { ENEMY_SCREAM_SHEETS, screamSheetName, screamSheetFrames } from './enemySheets';

const N = ENEMY_SCREAM_SHEETS['screamer-common'];

describe('enemyScreamFrame（叫喚の叫び・v0.25.4611）', () => {
  it('溜めの頭は0コマ目、終わり際は最後のコマ', () => {
    expect(enemyScreamFrame(N, 0)).toBe(0);
    expect(enemyScreamFrame(N, 0.999)).toBe(N - 1);
  });

  it('出し切ったら null（立ち絵へ戻す）', () => {
    expect(enemyScreamFrame(N, 1)).toBeNull();
    expect(enemyScreamFrame(N, 1.5)).toBeNull();
  });

  it('全コマを1度は通る（飛ばさない）', () => {
    const seen = new Set<number>();
    for (let k = 0; k <= 1000; k++) {
      const f = enemyScreamFrame(N, k / 1000);
      if (f !== null) seen.add(f);
    }
    expect(seen.size).toBe(N);
  });

  it('進むほどコマも進む（戻らない）', () => {
    let prev = -1;
    for (let k = 0; k < 1000; k++) {
      const f = enemyScreamFrame(N, k / 1000);
      if (f === null) continue;
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });

  it('負の進みでも落ちない（0コマ目）', () => {
    expect(enemyScreamFrame(N, -0.5)).toBe(0);
  });

  it('シートが無い型は出さない', () => {
    expect(enemyScreamFrame(0, 0.5)).toBeNull();
    expect(enemyScreamFrame(1, 0.5)).toBeNull();
    expect(screamSheetFrames('zombie-common')).toBe(0);
    expect(screamSheetFrames(undefined)).toBe(0);
  });

  it('台帳と名前', () => {
    expect(screamSheetFrames('screamer-common')).toBe(16);
    expect(screamSheetName('screamer-common')).toBe('screamer-common-scream');
    expect(enemyScreamLastFrame(N)).toBe(15);
  });
});

describe('enemyScreamReleaseFrame（叫び終わりの戻り・社長裁定2026-09-23「a」）', () => {
  it('発動の瞬間は最後のコマ（前かがみのまま）', () => {
    expect(enemyScreamReleaseFrame(N, 0)).toBe(N - 1);
  });

  it('戻り切ったら null（立ち絵へ返す）', () => {
    expect(enemyScreamReleaseFrame(N, SCREAM_RELEASE_MS)).toBeNull();
    expect(enemyScreamReleaseFrame(N, SCREAM_RELEASE_MS + 100)).toBeNull();
  });

  it('0コマ目（真っ直ぐ）まで戻る＝背丈の跳ねが残らない', () => {
    let last: number | null = N - 1;
    for (let t = 0; t < SCREAM_RELEASE_MS; t += 1) {
      const f = enemyScreamReleaseFrame(N, t);
      if (f !== null) last = f;
    }
    expect(last).toBe(0);
  });

  it('戻る一方（進み直さない）', () => {
    let prev = N;
    for (let t = 0; t < SCREAM_RELEASE_MS; t += 1) {
      const f = enemyScreamReleaseFrame(N, t);
      if (f === null) break;
      expect(f).toBeLessThanOrEqual(prev);
      prev = f;
    }
  });

  it('★等速ではない（慣性MUST・前半で半分以上戻る）', () => {
    const half = enemyScreamReleaseFrame(N, SCREAM_RELEASE_MS / 2);
    expect(half).not.toBeNull();
    expect(half as number).toBeLessThan((N - 1) / 2);
  });

  it('シートが無い型は戻りも出さない', () => {
    expect(enemyScreamReleaseFrame(0, 10)).toBeNull();
    expect(enemyScreamReleaseFrame(1, 10)).toBeNull();
  });
});
