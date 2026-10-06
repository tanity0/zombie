// 雑魚の技の当たり判定を「エフェクトの絵」に揃える(社長指示2026-10-06「どちらかというと、エフェクトの方に合わせてほしい。
// 武器や爪痕、噛みつきの」→「CとAの折衷案」)。
//  - エフェクト(ゾンビの噛み跡/スケルトンの爪/コウモリの叩きつけ)は、技を始めた瞬間にプレイヤーが立っていた点
//    (予告の線の終点)に出る。旧判定は「踏み込んだ敵の足元の帯とプレイヤーの足元が重なるか」で、
//    踏み込みに上限があるスケルトンは**絵が重なっているのに外れる**ことがあった(実測)。
//  - ⇒ 判定の中心を**エフェクトの出る点**にし、半径を**エフェクトの幅の40%**(=絵の芯の8割)にする。
//    エフェクト自体は折衷で4分の3へ縮めた(全体で当てると歩いてよけられないため)。
// store も PixiJS も読まない葉モジュール。
import type { Enemy } from '../types/game';
import { ZOMBIE_BITE_W_PX } from './zombieBiteFx';
import { SKEL_CLAW_W_PX } from './skeletonClaw';
import { BAT_SLAM_W_PX } from './batLanternSwing';

/** 判定の半径 = エフェクトの見かけの幅 × この割合。 */
export const BITE_FX_HIT_FRAC = 0.4;

/** この技の当たりをエフェクトで見るなら、その半径(px)。対象外なら null(=従来の体の重なり)。 */
export const biteFxHitRadius = (chaffMove: Enemy['chaffMove']): number | null => {
  switch (chaffMove) {
    case 'zombie-double': return ZOMBIE_BITE_W_PX * BITE_FX_HIT_FRAC;
    case 'skel-bite': return SKEL_CLAW_W_PX * BITE_FX_HIT_FRAC;
    case 'bat-grab': return BAT_SLAM_W_PX * BITE_FX_HIT_FRAC;
    default: return null;
  }
};

/** エフェクトの出る点から、プレイヤーの体(当たり判定の四角)までが半径以内か。 */
export const biteFxHitsPlayer = (
  tx: number, ty: number, radius: number, p: { x: number; y: number; width: number; height: number },
): boolean => {
  const dx = Math.max(p.x - tx, 0, tx - (p.x + p.width));
  const dy = Math.max(p.y - ty, 0, ty - (p.y + p.height));
  return Math.hypot(dx, dy) <= radius;
};
