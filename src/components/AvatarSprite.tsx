// メニュー/記録画面のキャラの絵に、アバター(耳・尻尾…)を重ねて出す部品(社長指示2026-10-27「アバターは選択画面とか
// 守護霊記録とか幻影とかにも反映(その当時の記録として)」)。置き方はゲーム中の焼き込みと同じ式
// (utils/avatarPlacement.placeAvatarPart)=頭の位置の台帳(playerHeadAnchors)の頭に付く。
// 記録の絵には**記録した時のアバター**を渡す(今選んでいるアバターではない)。
import React, { useEffect, useState } from 'react';
import { AVATARS, type AvatarId } from '../data/avatars';
import { PLAYER_HITBOX } from '../store/gameStore';
import { PLAYER_VISUAL_SCALE } from '../pixi/renderSpec';
import { PLAYER_ART_BASE_W } from '../pixi/pixiTextures'; // クラス絵の表示基準幅(体の絵1pxが枠の何pxに当たるかの元)
import { placeAvatarPart, headAnchorDelta, spriteNameFromUrl } from '../utils/avatarPlacement';

const BOX = PLAYER_HITBOX * PLAYER_VISUAL_SCALE;
const partUrl = (tex: string): string => `${import.meta.env.BASE_URL}sprites/${tex}.png`;

const sizeCache = new Map<string, { w: number; h: number }>();
const useImageSize = (src: string): { w: number; h: number } | null => {
  const [size, setSize] = useState(() => sizeCache.get(src) ?? null);
  useEffect(() => {
    const hit = sizeCache.get(src);
    if (hit) { setSize(hit); return; }
    let alive = true;
    const im = new Image();
    im.onload = () => { const s = { w: im.naturalWidth, h: im.naturalHeight }; sizeCache.set(src, s); if (alive) setSize(s); };
    im.src = src;
    return () => { alive = false; };
  }, [src]);
  return size;
};

/** アバターのパーツの寸法(全パーツぶん揃ってから描く=1つだけ先に出て跳ねない)。 */
const usePartSizes = (avatarId: AvatarId | null): ({ w: number; h: number } | null)[] => {
  const parts = avatarId ? AVATARS[avatarId]?.parts ?? [] : [];
  const [sizes, setSizes] = useState<({ w: number; h: number } | null)[]>(() => parts.map(p => sizeCache.get(partUrl(p.tex)) ?? null));
  useEffect(() => {
    let alive = true;
    const list = avatarId ? AVATARS[avatarId]?.parts ?? [] : [];
    Promise.all(list.map(p => new Promise<{ w: number; h: number } | null>(res => {
      const url = partUrl(p.tex);
      const hit = sizeCache.get(url);
      if (hit) { res(hit); return; }
      const im = new Image();
      im.onload = () => { const s = { w: im.naturalWidth, h: im.naturalHeight }; sizeCache.set(url, s); res(s); };
      im.onerror = () => res(null);
      im.src = url;
    }))).then(r => { if (alive) setSizes(r); });
    return () => { alive = false; };
  }, [avatarId]);
  return sizes;
};

/** 体の絵(待機絵)にアバターを重ねた <img>。className/style は体の絵へそのまま付く(従来の <img> と同じ大きさで出る)。 */
export const AvatarSprite: React.FC<{
  src: string;
  avatarId: AvatarId | null | undefined;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}> = ({ src, avatarId, alt = '', className, style }) => {
  const id = avatarId && AVATARS[avatarId] ? avatarId : null;
  const body = useImageSize(src);
  const sizes = usePartSizes(id);
  const img = <img src={src} alt={alt} draggable={false} className={className} style={{ imageRendering: 'pixelated', ...style }} />;
  if (!id) return img;
  const parts = AVATARS[id].parts;
  const ready = body && sizes.length === parts.length && sizes.every(Boolean);
  // 体の絵の中の%で置く(体の絵がどの大きさで出ても一緒に伸び縮みする)。待機絵なので頭のずれは0。
  const name = spriteNameFromUrl(src);
  const d = headAnchorDelta(name, name) ?? { dx: 0, dy: 0 };
  const layer = (which: 'above' | 'below') => ready ? parts.map((part, i) => {
    if (part.layer !== which) return null;
    const ps = sizes[i]!;
    const r = placeAvatarPart(part, ps.w, ps.h, BOX, BOX, PLAYER_ART_BASE_W / body.w, d.dx, d.dy);
    return (
      <img
        key={part.tex}
        src={partUrl(part.tex)}
        alt=""
        draggable={false}
        aria-hidden
        className="pointer-events-none absolute max-w-none"
        style={{
          left: `${((body.w / 2 + r.left) / body.w) * 100}%`,
          top: `${((body.h + r.top) / body.h) * 100}%`,
          width: `${(r.width / body.w) * 100}%`,
          imageRendering: 'pixelated',
          zIndex: which === 'above' ? 2 : 0,
        }}
      />
    );
  }) : null;
  // 外側の枠は体の絵の位置ずらし(transform)を受け継がない=体の絵の style は体にだけ付ける。ずらしは枠ごと動かす。
  const { transform, transformOrigin, transition, ...bodyStyle } = style ?? {};
  return (
    <span className="relative inline-flex" style={{ transform, transformOrigin, transition }}>
      {layer('below')}
      <img src={src} alt={alt} draggable={false} className={`relative ${className ?? ''}`} style={{ imageRendering: 'pixelated', zIndex: 1, ...bodyStyle }} />
      {layer('above')}
    </span>
  );
};
