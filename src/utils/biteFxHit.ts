// 雑魚の技の当たり判定を「エフェクトの絵」と一致させる(社長指示2026-10-06「当たりと絵は合わせてほしい。直観でわからなくなる。
// その上で、エフェクトというか武器の大きさを調整していく」)。
//  - 対象: ゾンビの二連の噛み(噛み跡)/スケルトンの爪/コウモリの叩きつけ。
//  - エフェクトは技を始めた瞬間にプレイヤーが立っていた点(予告の線の終点)に出る。
//  - **当たり = 当たる瞬間のコマの「絵が描かれている四角」と、プレイヤーの「キャラの絵の四角」が重なるか**。
//    エフェクトの大きさ(各 *_W_PX)を変えれば判定も同じだけ変わる=大きさの調整がそのまま当たりの調整になる。
// store も PixiJS も読まない葉モジュール(絵の寸法は素材の実測値をここに写す)。
import type { Enemy } from '../types/game';
import { ZOMBIE_BITE_W_PX, ZOMBIE_BITE_REF_W } from './zombieBiteFx';
import { SKEL_CLAW_W_PX, SKEL_CLAW_REF_W } from './skeletonClaw';
import { BAT_SLAM_W_PX, BAT_SLAM_REF_W, BAT_SLAM_ANCHOR_X, BAT_SLAM_IMPACT_FRAME } from './batLanternSwing';
import { PLAYER_VISUAL_SCALE } from '../pixi/renderSpec';

export interface FxRect { x: number; y: number; w: number; h: number }

/**
 * 当たる瞬間のコマの素材の寸法と、絵が描かれている範囲(素材の端からの割合・実測 PIL getbbox)。
 * 素材を差し替えたらここを測り直す。
 */
const FX_ART = {
  // public/sprites/fx/zombie-bite-2.png 246×262・中心に置く(anchor 0.5,0.5)。
  zombie: { texW: 246, texH: 262, x0: 15 / 246, x1: 223 / 246, y0: 19 / 262, y1: 247 / 262 },
  // public/sprites/fx/skel-claw-3.png 282×259・中心に置く。素材は左向き(右向きの個体は左右反転)。
  skeleton: { texW: 282, texH: 259, x0: 3 / 282, x1: 279 / 282, y0: 3 / 259, y1: 259 / 259 },
  // public/sprites/fx/bat-slam-6.png 312×290・下端を当たる点に置く(anchor x=BAT_SLAM_ANCHOR_X[6], y=1)。右向きの素材。
  bat: { texW: 312, texH: 290, x0: 0, x1: 1, y0: 1 / 290, y1: 1 },
} as const;

/**
 * この技のエフェクトが当たる瞬間に描かれている四角(world px)。対象外の技は null(=従来の体の重なり)。
 * `facingRight` は技の向き(biteDirX ≥ 0)。描画(pixiScene)と同じ置き方・同じ倍率で計算する。
 */
export const biteFxRect = (chaffMove: Enemy['chaffMove'], tx: number, ty: number, facingRight: boolean): FxRect | null => {
  if (chaffMove === 'zombie-double') {
    const a = FX_ART.zombie, sc = ZOMBIE_BITE_W_PX / ZOMBIE_BITE_REF_W;
    const W = a.texW * sc, H = a.texH * sc;
    return { x: tx - W / 2 + a.x0 * W, y: ty - H / 2 + a.y0 * H, w: (a.x1 - a.x0) * W, h: (a.y1 - a.y0) * H };
  }
  if (chaffMove === 'skel-bite') {
    const a = FX_ART.skeleton, sc = SKEL_CLAW_W_PX / SKEL_CLAW_REF_W;
    const W = a.texW * sc, H = a.texH * sc;
    // 右向きは左右反転=描かれている範囲も鏡に。
    const x0 = facingRight ? 1 - a.x1 : a.x0, x1 = facingRight ? 1 - a.x0 : a.x1;
    return { x: tx - W / 2 + x0 * W, y: ty - H / 2 + a.y0 * H, w: (x1 - x0) * W, h: (a.y1 - a.y0) * H };
  }
  if (chaffMove === 'bat-grab') {
    const a = FX_ART.bat, sc = BAT_SLAM_W_PX / BAT_SLAM_REF_W;
    const W = a.texW * sc, H = a.texH * sc;
    const ax = BAT_SLAM_ANCHOR_X[BAT_SLAM_IMPACT_FRAME] ?? 0.5;
    const anchor = facingRight ? ax : 1 - ax;
    const x0 = facingRight ? a.x0 : 1 - a.x1, x1 = facingRight ? a.x1 : 1 - a.x0;
    return { x: tx - anchor * W + x0 * W, y: ty - H + a.y0 * H, w: (x1 - x0) * W, h: (a.y1 - a.y0) * H };
  }
  return null;
};

/** プレイヤーのキャラの絵の四角(足元から上へ。素材の実測: 体は描画枠の幅の約半分・高さの約68%)。 */
export const PLAYER_ART_W_FRAC = 0.5;
export const PLAYER_ART_H_FRAC = 0.68;
export const playerArtRect = (p: { x: number; y: number; width: number; height: number }): FxRect => {
  const boxW = p.width * PLAYER_VISUAL_SCALE, boxH = p.height * PLAYER_VISUAL_SCALE;
  const w = boxW * PLAYER_ART_W_FRAC, h = boxH * PLAYER_ART_H_FRAC;
  const cx = p.x + p.width / 2, footY = p.y + p.height;
  return { x: cx - w / 2, y: footY - h, w, h };
};

export const rectsOverlap = (a: FxRect, b: FxRect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
