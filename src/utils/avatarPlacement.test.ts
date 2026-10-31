import { describe, it, expect } from 'vitest';
import { placeAvatarPart, headAnchorDelta, spriteNameFromUrl, avatarPartPieces } from './avatarPlacement';
import { AVATARS } from '../data/avatars';
import { PLAYER_HEAD_ANCHORS } from '../data/playerHeadAnchors';

// アバターの置き方はゲーム中の焼き込みとメニュー/記録画面で同じ1本の式(社長指示2026-10-26/2026-10-27)。
describe('placeAvatarPart', () => {
  const ears = AVATARS['cat-set'].parts.find(p => p.tex === 'avatar-cat-ears')!;

  it('枠の割合で大きさと位置が決まり、アンカーぶん左上へずれる', () => {
    // 体の絵1px=枠1px(拡大率1)、頭のずれ0。耳=幅基準 sizeFrac。
    const r = placeAvatarPart(ears, 100, 48, 64, 64, 1, 0, 0);
    expect(r.width).toBeCloseTo(64 * ears.sizeFrac);
    expect(r.height).toBeCloseTo(48 * (64 * ears.sizeFrac) / 100);
    expect(r.left + ears.anchorX * r.width).toBeCloseTo(ears.offsetXFrac * 64);
    expect(r.top + ears.anchorY * r.height).toBeCloseTo(ears.offsetYFrac * 64);
  });

  it('体の絵が大きい(拡大率が小さい)ほど、体の絵のpxでは大きく置く=画面では同じ大きさ', () => {
    const a = placeAvatarPart(ears, 100, 48, 64, 64, 1, 0, 0);
    const b = placeAvatarPart(ears, 100, 48, 64, 64, 0.5, 0, 0);
    expect(b.width).toBeCloseTo(a.width * 2);
  });

  it('頭に付くパーツだけが頭のずれを受ける', () => {
    const tail = AVATARS['cat-set'].parts.find(p => p.tex === 'avatar-cat-tail')!;
    const e0 = placeAvatarPart(ears, 100, 48, 64, 64, 1, 0, 0), e1 = placeAvatarPart(ears, 100, 48, 64, 64, 1, 3, 5);
    expect(e1.left - e0.left).toBeCloseTo(3);
    expect(e1.top - e0.top).toBeCloseTo(ears.followsHead ? 5 : 0);
    const t0 = placeAvatarPart(tail, 76, 128, 64, 64, 1, 0, 0), t1 = placeAvatarPart(tail, 76, 128, 64, 64, 1, 3, 5);
    expect(t1.top - t0.top).toBeCloseTo(tail.followsHead ? 5 : 0);
  });
});

describe('headAnchorDelta / spriteNameFromUrl', () => {
  it('台帳の2コマの差(下=正)。台帳に無ければ null', () => {
    const names = Object.keys(PLAYER_HEAD_ANCHORS);
    const [a, b] = [names[0], names[1]];
    expect(headAnchorDelta(b, a)).toEqual({ dx: PLAYER_HEAD_ANCHORS[b].x - PLAYER_HEAD_ANCHORS[a].x, dy: PLAYER_HEAD_ANCHORS[a].y - PLAYER_HEAD_ANCHORS[b].y });
    expect(headAnchorDelta('no-such-frame', a)).toBeNull();
  });

  it('URL(版の印つき)からテクスチャ名を取る', () => {
    expect(spriteNameFromUrl('/zombie/sprites/player-magnum-walk-1.png?v=abc')).toBe('player-magnum-walk-1');
  });
});

// 社長指示2026-10-31「猫耳、片耳(進行方向の方)をレイヤー下(頭の裏に表示)」「アバター毎に指定する」。
describe('avatarPartPieces', () => {
  const ears = AVATARS['cat-set'].parts.find(p => p.tex === 'avatar-cat-ears')!;
  const tail = AVATARS['cat-set'].parts.find(p => p.tex === 'avatar-cat-tail')!;

  it('猫耳は進行方向側(右向きの絵では右半分)だけ頭の裏・もう片方は上のまま', () => {
    const pcs = avatarPartPieces([ears]);
    expect(pcs.map(p => [p.layer, p.u0, p.u1])).toEqual([['above', 0, 0.5], ['below', 0.5, 1]]);
  });
  it('反転しないパーツを左向きで重ね描く時は、絵の左半分が頭の裏', () => {
    const pcs = avatarPartPieces([{ ...ears, flipWithFacing: false }], false);
    expect(pcs.map(p => [p.layer, p.u0, p.u1])).toEqual([['above', 0.5, 1], ['below', 0, 0.5]]);
  });
  it('指定の無いパーツ(尻尾・1本ツノのような物)は割らずに台帳のレイヤーのまま', () => {
    expect(avatarPartPieces([tail]).map(p => [p.layer, p.u0, p.u1, p.anchorX])).toEqual([['below', 0, 1, tail.anchorX]]);
    expect(avatarPartPieces([{ ...ears, leadingHalfBehind: undefined }]).map(p => [p.layer, p.u0, p.u1])).toEqual([['above', 0, 1]]);
  });
  it('割った半分のアンカーは全体のアンカーと同じ点を指す(位置が1pxも変わらない)', () => {
    for (const pc of avatarPartPieces([ears])) {
      expect(pc.u0 + pc.anchorX * (pc.u1 - pc.u0)).toBeCloseTo(ears.anchorX);
    }
  });
});
