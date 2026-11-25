// M1(ステージ1)遠景の城/山の絵(stage1-castle.png)の縦の置き方(社長指示2026-11-25「PCだと山しか見えない。真ん中寄せくらいに」)。
// 描画(pixiScene.updateStage1Sky)が読むだけの純関数。横の倍率(Aひとつ分=画面幅)とパララックスはここでは扱わない。
//
// - 縦長(スマホ): 従来どおり。絵の底を farH + castleY に置き、高さ=絵1枚ぶん。
// - 横長(w > h=PC/タブレットの横持ち): 拡大は同じ(画面幅いっぱい)なので絵が縦に大きくなり、城が画面の上の外へ出る。
//   そこで「城の中心が遠景の帯(0..farH)の上下中央」に来るよう絵を下げる。ただし底は従来の位置より下げない
//   (=地面へはみ出さない)ので、窓の底は従来の位置に固定したまま窓を縦に短くし、絵の下の端を切る
//   (切れる所は手前の森/地面が重なる)。絵を下げる方向にだけ動かす(上げると底に隙間が出るため従来どおり)。

/** 絵の中で城(尖塔の先〜城の土台)の上下中央がある高さ(絵の高さ比)。stage1-castle.png(1800×506)を見て実測: 尖塔の先≈97px・土台≈217px → 中心≈157px。 */
export const STAGE1_CASTLE_CENTER_FRAC = 157 / 506;

export interface Stage1CastleLayoutInput {
  screenW: number;
  screenH: number;
  /** 遠景の帯の高さ(画面上端からの px) */
  farH: number;
  /** 絵を表示した時の高さ(texH × 倍率) */
  drawnH: number;
  /** 底の位置調整(px・従来の STAGE1_CASTLE_Y) */
  castleY: number;
}

export interface Stage1CastleLayout {
  /** 窓(TilingSprite)の底の画面Y(anchor 0.5,1) */
  bottomY: number;
  /** 窓の高さ。窓の上端=絵の上端(tilePosition.y=0)なので、drawnH より小さい時は絵の下の端が切れる */
  height: number;
}

export function stage1CastleLayout(i: Stage1CastleLayoutInput): Stage1CastleLayout {
  const bottomY = i.farH + i.castleY;
  if (!(i.screenW > i.screenH)) return { bottomY, height: i.drawnH }; // 縦長=従来どおり(1pxも変えない)
  const currentTop = bottomY - i.drawnH;                               // 従来の絵の上端
  const centeredTop = i.farH * 0.5 - STAGE1_CASTLE_CENTER_FRAC * i.drawnH; // 城の中心=帯の上下中央になる上端
  const top = Math.max(currentTop, Math.min(centeredTop, bottomY));    // 下げる方向だけ・底は越えない
  return { bottomY, height: bottomY - top };
}
