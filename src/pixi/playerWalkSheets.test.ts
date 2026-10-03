import { describe, it, expect } from 'vitest';
import { WALK_SHEET_SEQUENCES, WALK_SEQ_WARLORD } from './playerWalkSheets';

// 実バグ(v0.25.2316): 武将立ち絵は3コマしか無いのに、クラス絵の5コマ用の並び
// [0,1,2,3,4,3,2,1] をそのまま渡していた。存在しないコマ番号は getTexture が null を返し、
// drawPlayer の `?? getTexture('player')` で**既定スキンが1コマだけ描かれる**。
// 「並びが実在コマ数を超えない」ことを素材と突き合わせて機械的に固定する。
// 素材の実在確認は Vite の glob で行う(@types/node に依存しないため)。キーは
// このファイルからの相対パス。`public/sprites/<name>.png` の集合をそのまま台帳にする。
const SPRITE_FILES = new Set(
  Object.keys(import.meta.glob('../../public/sprites/player-*.png', { query: '?url' }))
    .map(k => k.replace('../../public/sprites/', '').replace(/\.png$/, ''))
);

const exists = (name: string): boolean => SPRITE_FILES.has(name);
const frameCount = (prefix: string): number => {
  let n = 0;
  while (exists(`${prefix}-${n}`)) n++;
  return n;
};

describe('プレイヤー歩行/走行のコマ並びと素材の突き合わせ', () => {
  it.each(WALK_SHEET_SEQUENCES)('$prefix の並びは実在コマだけを指す', ({ prefix, sequence }) => {
    const have = frameCount(prefix);
    expect(have).toBeGreaterThan(0); // 素材ごと消えていたらここで落とす
    for (const frame of sequence) {
      expect(
        exists(`${prefix}-${frame}`),
        `${prefix}-${frame}.png が無い(実在は0..${have - 1})=歩行中に既定スキンが混入する`
      ).toBe(true);
    }
  });

  it('武将(3コマ)の並びは往復で、端を重複させない', () => {
    expect([...WALK_SEQ_WARLORD]).toEqual([0, 1, 2, 1]);
    // 接地A(0)→中割り(1)→接地B(2)→中割り(1) の1ストライド。端(0,2)は1回ずつ。
    expect(WALK_SEQ_WARLORD.filter(f => f === 0)).toHaveLength(1);
    expect(WALK_SEQ_WARLORD.filter(f => f === 2)).toHaveLength(1);
  });

  it('銃(青)と刀(赤)の武将は別シート=同じ並びを共有する(tintではない)', () => {
    const gun = WALK_SHEET_SEQUENCES.find(s => s.prefix === 'player-warlord-gun-walk');
    const katana = WALK_SHEET_SEQUENCES.find(s => s.prefix === 'player-warlord-katana-walk');
    expect(gun?.sequence).toBe(WALK_SEQ_WARLORD);
    expect(katana?.sequence).toBe(WALK_SEQ_WARLORD);
    expect(frameCount('player-warlord-gun-walk')).toBe(frameCount('player-warlord-katana-walk'));
  });
});
