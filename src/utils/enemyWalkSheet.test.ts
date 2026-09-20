// ★敵の歩きモーション(社長支給2026-09-20「バット女の歩きモーション」)の機械化。
// PixiJSの描画側はテストしない(CLAUDE.md)——**どのコマを出すか**の純関数だけを固定する。
import { describe, it, expect } from 'vitest';
import {
  enemyWalkFrame, walkSheetFrames, walkSheetName, enemyWalkPhase,
  ENEMY_WALK_SHEETS, ENEMY_WALK_MIN_SPEED, ENEMY_WALK_CYCLE_MS_DEFAULT,
} from './enemyWalkSheet';
import { ENEMY_VARIANT_SETS } from './enemyVariant';

const FR = ENEMY_WALK_SHEETS['bat-female'];

describe('★歩きシートの表', () => {
  it('シート名は<立ち絵名>-walk', () => {
    expect(walkSheetName('bat-female')).toBe('bat-female-walk');
  });

  it('★表に載る立ち絵は、必ず実在する変種の絵であること(名前を間違えると一生出ない)', () => {
    const all = new Set(Object.values(ENEMY_VARIANT_SETS).flat());
    for (const name of Object.keys(ENEMY_WALK_SHEETS)) expect(all.has(name), name).toBe(true);
  });

  it('表に無い立ち絵は0コマ=従来どおり立ち絵1枚', () => {
    expect(walkSheetFrames('bat-male')).toBe(0);
    expect(walkSheetFrames('zombie-common')).toBe(0);
    expect(walkSheetFrames(null)).toBe(0);
  });
});

describe('★コマの選び方', () => {
  it('★止まっていたら null(=立ち絵へ戻る)', () => {
    expect(enemyWalkFrame('e1', FR, 0, 0)).toBeNull();
    expect(enemyWalkFrame('e1', FR, 1234, ENEMY_WALK_MIN_SPEED)).toBeNull();
  });

  it('動いていればコマ番号が返る(範囲内)', () => {
    for (let t = 0; t < 3000; t += 7) {
      const i = enemyWalkFrame('e1', FR, t, 40);
      expect(i).not.toBeNull();
      expect(i!).toBeGreaterThanOrEqual(0);
      expect(i!).toBeLessThan(FR);
    }
  });

  it('★1周期で全コマをちょうど1回ずつ通る(前方ループ・飛ばさない)', () => {
    const seen: number[] = [];
    for (let t = 0; t < ENEMY_WALK_CYCLE_MS_DEFAULT; t += 1) {
      const i = enemyWalkFrame('e0', FR, t, 40)!;
      if (seen[seen.length - 1] !== i) seen.push(i);
    }
    expect(seen.length).toBe(FR);
    expect(new Set(seen).size).toBe(FR);
    // 昇順(ピンポンではない)。位相ずらしで途中から始まるので、1度だけ0へ折り返すのは可。
    const wraps = seen.filter((v, k) => k > 0 && v < seen[k - 1]).length;
    expect(wraps).toBeLessThanOrEqual(1);
  });

  it('★★個体ごとに位相がずれる(全員が同じ足を出して行進しない)', () => {
    const at = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(id => enemyWalkFrame(id, FR, 0, 40));
    expect(new Set(at).size).toBeGreaterThan(3);
  });

  it('★同じ個体の位相は毎回同じ(ちらつかない)', () => {
    const a = enemyWalkPhase('bat-7', FR);
    for (let k = 0; k < 20; k++) expect(enemyWalkPhase('bat-7', FR)).toBe(a);
  });

  it('コマ数1以下なら常に null(表の書き間違いで落ちない)', () => {
    expect(enemyWalkFrame('e1', 1, 100, 40)).toBeNull();
    expect(enemyWalkFrame('e1', 0, 100, 40)).toBeNull();
  });
});
