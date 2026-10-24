// ★ボスのフレーミング入力の組み立て(社長指示2026-10-01「ボスが見切れてる。画面にできるだけ収めたい」)。
// `cameraZoom.ts` に置くと renderSpec(ZOOM_MIN_ABS を読む)と循環するので別ファイル。
import { BOSS_SPRITE_FIT, bossArtCenter } from '../pixi/renderSpec';
import type { BossFramingInput } from './cameraZoom';
/**
 * ボスのフレーミング入力(横=絵の中心と半幅・縦=判定の帯の中心=従来どおり)。描画(pixiScene)・
 * カメラの推定と先読み(useGameLoop)が**同じ1本**を使う(絵の幅を片方だけ見ると、引きと寄せが食い違う)。
 * 絵の寸法は `BOSS_SPRITE_FIT`(描画と同じ表)。表に無い型(城ボス等)は当たり判定の半幅を使う。
 */
export const bossFramingFor = (
  e: { type: string; x: number; y: number; width: number; height: number },
  pcx: number, pcy: number, viewport: { width: number; height: number },
): BossFramingInput => {
  const fit = BOSS_SPRITE_FIT[e.type];
  const art = bossArtCenter(e);
  return {
    dxCenter: art.x - pcx,
    dyCenter: e.y + e.height / 2 - pcy,
    viewport,
    halfW: fit ? (e.width / fit.w) / 2 : e.width / 2,
  };
};
