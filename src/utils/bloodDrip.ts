// B10 血の覚醒: 体から離れる血の滴の「出どころ」と「初速」(描画専用の見せ方・判定には一切使わない)。純関数。
//
// 物理の向き(クリエイティブ監査): 体から離れた滴は**もう体のものではない**=世界速度はほぼ 0 で、そこへ重力が掛かる。
// 尾を引いて見えるのは**自分が走り去るから**であって、滴が後ろへ加速しているのではない。
// 旧は「後方へ 50〜240px/s」で押し出していた(物理の向きが逆)。いまは体の速度の 10〜20% を**前へ持ち越す**だけ。
// 出どころは体の中心1点ではなく、左右へ体幅の 0.3〜0.4・高さ 0.5〜0.9 に散らす。足の線(footY)で止める。

export const BLOOD_DRIP_CARRY_MIN = 0.10;
export const BLOOD_DRIP_CARRY_MAX = 0.20;
/** 出どころの左右(体の中心から体幅の何倍か)。 */
export const BLOOD_DRIP_SIDE_MIN = 0.3;
export const BLOOD_DRIP_SIDE_MAX = 0.4;
/** 出どころの高さ(体の上端から高さの何倍か。0=頭 / 1=足)。 */
export const BLOOD_DRIP_H_MIN = 0.5;
export const BLOOD_DRIP_H_MAX = 0.9;
/** 動いている間、進行方向の後ろ側(体の背中側)から出す確率。 */
export const BLOOD_DRIP_TRAILING_BIAS = 0.65;
/** 足の線で止まった滴が小さな点として地面に残る時間(ms)。 */
export const BLOOD_DRIP_DOT_MS = 300;

export interface DripBody { x: number; y: number; width: number; height: number }

export interface DripSpec {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** この y で止まる(体の足の線 footY=体矩形の下端)。 */
  floorY: number;
}

/**
 * 滴1個の出どころと初速。
 * @param body      プレイヤーの矩形(下端=足)
 * @param bodyVx    体の速度(px/s・世界座標)
 * @param bodyVy    同
 * @param moving    走っているか(呼び手の moveFrac > 0.15)。停止中は「真下へ滴る」(従来どおり)。
 * @param rnd       0..1 の乱数源(テストで固定できる)
 */
export const bloodDripSpec = (body: DripBody, bodyVx: number, bodyVy: number, moving: boolean, rnd: () => number): DripSpec => {
  const cx = body.x + body.width / 2;
  // 左右: 動いている間は背中側へ偏らせる(尾を引く側から滴る)。停止中は左右半々。
  let sign: 1 | -1 = rnd() < 0.5 ? 1 : -1;
  if (moving && Math.abs(bodyVx) > 1) {
    const trailing: 1 | -1 = bodyVx > 0 ? -1 : 1;
    sign = rnd() < BLOOD_DRIP_TRAILING_BIAS ? trailing : (-trailing as 1 | -1);
  }
  const side = BLOOD_DRIP_SIDE_MIN + rnd() * (BLOOD_DRIP_SIDE_MAX - BLOOD_DRIP_SIDE_MIN);
  const h = BLOOD_DRIP_H_MIN + rnd() * (BLOOD_DRIP_H_MAX - BLOOD_DRIP_H_MIN);
  const x = cx + sign * body.width * side;
  const y = body.y + body.height * h;
  const floorY = body.y + body.height;
  if (!moving) {
    // 停止中は今のまま: ほぼ真下へ(左右にわずか・下へわずか)。
    return { x, y, vx: (rnd() - 0.5) * 16, vy: rnd() * 10, floorY };
  }
  const carry = BLOOD_DRIP_CARRY_MIN + rnd() * (BLOOD_DRIP_CARRY_MAX - BLOOD_DRIP_CARRY_MIN);
  return {
    x, y,
    vx: bodyVx * carry + (rnd() - 0.5) * 14,
    vy: bodyVy * carry - rnd() * 20, // ぽたっと離れる小さな浮き。以後は重力だけ
    floorY,
  };
};
