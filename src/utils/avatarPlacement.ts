// アバターのパーツ(耳・尻尾…)を体の絵のどこへ置くかの計算(1本だけ=ゲーム中の焼き込みと、メニュー/記録画面の絵が同じ式を使う)。
// 社長指示2026-10-26「このアバターの位置取りについて、今後も流用するので覚えておいて」/2026-10-27「アバターは選択画面とか
// 守護霊記録とか幻影とかにも反映」。描画の道具は持たない(PixiJS も DOM も import しない)=純粋な計算だけ。
import type { AvatarPart } from '../data/avatars';
import { PLAYER_HEAD_ANCHORS } from '../data/playerHeadAnchors';

/** 体の絵(右向き)の中のパーツの四角。原点=足元(絵の下端の横中央)・単位=体の絵のpx・上=負。 */
export interface AvatarPartRect { left: number; top: number; width: number; height: number }

/**
 * パーツ1つの置き場所。
 * @param partW/partH  パーツの絵の寸法(px)
 * @param boxW/boxH    プレイヤーの表示枠(px)。パーツの大きさと置き方はこの枠の割合で決まっている(`avatars.ts`)
 * @param artPerBoxPx  体の絵1pxが枠の何pxに当たるか(= 体の絵の拡大率)
 * @param headDx/headDy このコマの頭が待機絵の頭からどれだけずれているか(体の絵のpx・下=正)
 */
export const placeAvatarPart = (
  part: AvatarPart, partW: number, partH: number,
  boxW: number, boxH: number, artPerBoxPx: number, headDx: number, headDy: number,
): AvatarPartRect => {
  const toArt = 1 / Math.max(1e-6, artPerBoxPx);
  const srcPx = part.sizeBasis === 'width' ? partW : partH;
  const sc = ((part.sizeBasis === 'width' ? boxW : boxH) * part.sizeFrac * toArt) / Math.max(1, srcPx);
  const x = part.offsetXFrac * boxW * toArt + headDx;
  const y = part.offsetYFrac * boxH * toArt + (part.followsHead ? headDy : 0);
  const width = partW * sc, height = partH * sc;
  return { left: x - part.anchorX * width, top: y - part.anchorY * height, width, height };
};

/** 台帳(playerHeadAnchors)だけで出す頭のずれ。台帳に無いコマは null(呼び出し側の自動計測へ落とす)。 */
export const headAnchorDelta = (currentName: string, baselineName: string): { dx: number; dy: number } | null => {
  const ac = PLAYER_HEAD_ANCHORS[currentName], ab = PLAYER_HEAD_ANCHORS[baselineName];
  if (!ac || !ab) return null;
  return { dx: ac.x - ab.x, dy: ab.y - ac.y };
};

/** 画像のURL(…/sprites/player-xxx-walk-1.png?v=…)からテクスチャ名(player-xxx-walk-1)を取る。 */
export const spriteNameFromUrl = (url: string): string => {
  const file = url.split('?')[0].split('/').pop() ?? '';
  return file.replace(/\.png$/i, '');
};
