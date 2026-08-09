// 刃系テクスチャの「絵の中の刃先の向き」(v0.25.3081)。
//
// 社長報告「スカジ達の刃予兆、ちゃんと針っぽく飛んで行ってないかも。横向きで飛んだりしてる」の真因:
// 刃の絵は素材ごとに**刃先が向いている角度**が違う(スカジの氷刃≈-62.8°/ラフィの骨刃=-90°)。
// 本物の刃は `rotation = 進行方向 - この値` で刃先を進行方向へ向けているが、**予兆(扇状バースト)側で
// この補正を掛け忘れていた**ため、進行方向と絵の向きがズレて「横向きに飛ぶ」ように見えていた。
//
// ★ここに置く理由: 値の出どころを1つにするため(同じ値を2箇所で管理しない=CLAUDE.md)。
// 描画(pixiScene)と、予兆を撒く側(store)の**両方**から読む。ただの数値なので renderer-agnostic
// (PixiJSに一切依存しない)=store から読んでも層の掟に反しない。
export const SKADI_BLADE_NATIVE_ANGLE = -62.8 * Math.PI / 180;
export const RAFI_BLADE_NATIVE_ANGLE = -90 * Math.PI / 180;

/** テクスチャ名から刃先の向きの補正を引く。未知の絵は0(補正なし)。 */
export const bladeNativeAngle = (texture: string): number =>
  texture === 'rafi-blade' ? RAFI_BLADE_NATIVE_ANGLE
    : texture === 'skadi-ice-blade' ? SKADI_BLADE_NATIVE_ANGLE
      : 0;
