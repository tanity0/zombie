// 案山子の顔(変異体対策室の一覧・詳細と練習のリザルト)。絵は横3コマのシートなので、直立の0コマ目だけを切って出す。
// 絵の名前とコマ数の出どころは utils/scarecrow.ts の1箇所(差し替えはそこだけ)。
import React from 'react';
import { spritePath } from '../utils/spriteLoader';
import { SCARECROW_FRAMES, SCARECROW_SHEET } from '../utils/scarecrow';

/** 1コマの縦横比(50×66)。 */
const FRAME_W_OVER_H = 50 / 66;

export const ScarecrowIcon: React.FC<{ height: number; dim?: boolean }> = ({ height, dim }) => (
  <div
    aria-hidden
    className={dim ? 'opacity-40 grayscale' : undefined}
    style={{
      width: Math.round(height * FRAME_W_OVER_H),
      height,
      backgroundImage: `url(${spritePath(SCARECROW_SHEET)})`,
      backgroundSize: `${SCARECROW_FRAMES * 100}% 100%`,
      backgroundPosition: '0 0',
      backgroundRepeat: 'no-repeat',
      imageRendering: 'pixelated',
    }}
  />
);

export default ScarecrowIcon;
