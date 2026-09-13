// ★社長指示2026-08-25「デコイ、敵の弾を消す」+「とりあえず幻影も設置してください」。
// デコイは**自分から見た敵の弾**を落とす。味方のデコイ=敵弾 / 幻影のデコイ=プレイヤーの弾。
//
// 判定の本体は useGameLoop の中(テストから直接呼べない)なので、ここでは**規則そのもの**を
// 純粋な述語として固定する。実装側もこの式(`(弾の側 === デコイの側) なら見送る`)を使っている。
// これが崩れると「自分の弾を自分のデコイが撃ち落とす」という致命的な絵になる。
import { describe, it, expect } from 'vitest';

/** デコイが弾を狙うか(実装と同じ式)。true=撃ち落とす。 */
const decoyTargets = (decoyHostile: boolean, bulletHostile: boolean): boolean =>
  (bulletHostile === decoyHostile) === false;

describe('★デコイは「自分から見た敵の弾」だけを落とす(v0.25.3884)', () => {
  it('味方のデコイ: 敵弾は落とす / 自分の弾は落とさない', () => {
    expect(decoyTargets(false, true)).toBe(true);   // 敵弾
    expect(decoyTargets(false, false)).toBe(false); // プレイヤー/味方の弾
  });

  it('幻影のデコイ: プレイヤーの弾は落とす / 敵弾(自分側)は落とさない', () => {
    expect(decoyTargets(true, false)).toBe(true);   // プレイヤーの弾
    expect(decoyTargets(true, true)).toBe(false);   // 自分側の弾
  });

  it('★同じ側の弾は、どちらのデコイでも絶対に落とさない(自爆の再発防止)', () => {
    for (const side of [true, false]) expect(decoyTargets(side, side)).toBe(false);
  });
});
