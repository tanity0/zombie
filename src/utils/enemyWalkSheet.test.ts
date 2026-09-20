// ★敵の歩きモーション(社長支給2026-09-20「バット女の歩きモーション」)の機械化。
// PixiJSの描画側はテストしない(CLAUDE.md)——**どのコマを出すか**の純関数だけを固定する。
import { describe, it, expect } from 'vitest';
import {
  enemyWalkFrame, walkSheetFrames, walkSheetName, enemyWalkPhase, canWalkAnimate,
  ENEMY_WALK_SHEETS, ENEMY_WALK_STRIDE_PER_HEIGHT,
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

const H = 80;                 // 画面上の見た目の身長(px)
const OK = {} as const;       // 歩ける状態

describe('★歩いてはいけない状態(クリエイティブ監査#1の是正)', () => {
  it('★★死体は歩かない(vx/vyは死んでも消えないので、速度だけ見ると死体が歩く)', () => {
    expect(canWalkAnimate({ corpse: true })).toBe(false);
    expect(enemyWalkFrame('e1', FR, 999, H, { corpse: true })).toBeNull();
  });
  it('★押されている/浮かされている間は歩かない(後ろへ飛びながら前へ歩く、を作らない)', () => {
    expect(enemyWalkFrame('e1', FR, 999, H, { pushedOrLifted: true })).toBeNull();
  });
  it('気絶・拘束・休眠でも歩かない', () => {
    expect(enemyWalkFrame('e1', FR, 999, H, { stunned: true })).toBeNull();
    expect(enemyWalkFrame('e1', FR, 999, H, { dormant: true })).toBeNull();
  });
  it('どれでもなければ歩ける', () => {
    expect(canWalkAnimate(OK)).toBe(true);
    expect(enemyWalkFrame('e1', FR, 999, H, OK)).not.toBeNull();
  });
});

describe('★コマの選び方(進んだ距離で刻む)', () => {
  it('動いていればコマ番号が返る(範囲内)', () => {
    for (let d = 0; d < 3000; d += 7) {
      const i = enemyWalkFrame('e1', FR, d, H, OK);
      expect(i).not.toBeNull();
      expect(i!).toBeGreaterThanOrEqual(0);
      expect(i!).toBeLessThan(FR);
    }
  });

  it('★1歩幅で全コマをちょうど1回ずつ通る(前方ループ・飛ばさない)', () => {
    const stride = H * ENEMY_WALK_STRIDE_PER_HEIGHT;
    const seen: number[] = [];
    for (let d = 0; d < stride; d += stride / 2000) {
      const i = enemyWalkFrame('e0', FR, d, H, OK)!;
      if (seen[seen.length - 1] !== i) seen.push(i);
    }
    expect(seen.length).toBe(FR);
    expect(new Set(seen).size).toBe(FR);
    const wraps = seen.filter((v, k) => k > 0 && v < seen[k - 1]).length;
    expect(wraps).toBeLessThanOrEqual(1);
  });

  it('★★足が滑らない: 歩幅は見た目の身長に比例する(絵が大きくなれば歩幅も伸びる)', () => {
    // 身長2倍の個体は、同じコマへ来るのに2倍の距離が要る。
    const d1 = H * ENEMY_WALK_STRIDE_PER_HEIGHT;
    const d2 = H * 2 * ENEMY_WALK_STRIDE_PER_HEIGHT;
    expect(enemyWalkFrame('e0', FR, d1, H, OK)).toBe(enemyWalkFrame('e0', FR, d2, H * 2, OK));
  });

  it('★★個体ごとに位相がずれる(全員が同じ足を出して行進しない)', () => {
    const at = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(id => enemyWalkFrame(id, FR, 0, H, OK));
    expect(new Set(at).size).toBeGreaterThan(3);
  });

  it('★同じ個体の位相は毎回同じ(ちらつかない)', () => {
    const a = enemyWalkPhase('bat-7', FR);
    for (let k = 0; k < 20; k++) expect(enemyWalkPhase('bat-7', FR)).toBe(a);
  });

  it('コマ数1以下なら常に null(表の書き間違いで落ちない)', () => {
    expect(enemyWalkFrame('e1', 1, 100, H, OK)).toBeNull();
    expect(enemyWalkFrame('e1', 0, 100, H, OK)).toBeNull();
  });
});
