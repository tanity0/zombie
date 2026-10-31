// アバターシステム(試験・第1弾)の台帳。
//
// 「1アバター = パーツ配列」。各パーツはテクスチャキー(src/pixi/pixiTextures.ts に登録した名前)+
// レイヤー('above'=プレイヤーより上 / 'below'=プレイヤーより下)+プレイヤー基準のオフセット+
// 表示サイズ指定のみを持つ、純粋なデータ。描画(座標計算・スケール・向き追従)は pixiScene 側の
// 汎用ループが担当し、パーツごとの特別分岐は持たない(=新しいアバターはこの表に1エントリ足すだけ)。
//
// ★位置取りは使い回す(社長指示2026-10-26「このアバターの位置取りについて、今後も流用するので覚えておいて。
// 毎回アバターごとにずれると面倒なので」): パーツは**頭の位置の台帳(src/data/playerHeadAnchors.ts)**の頭に付く。
// offsetXFrac/offsetYFrac は「待機絵の頭」からの置き方だけ=**アバターを足す時にコマごとの位置合わせは要らない**。
// 体の絵を差し替えた/コマを足した時だけ `node scripts/avatar-head-anchors.mjs --write` を回して確認用の画を見る。
// 描画は体の各コマへの焼き込み(pixiScene.avatarBakedBody)=体の傾き・伸び縮み・跳ねが自動で乗る。
// 視覚専用(判定/移動/攻撃に一切影響しない)。CLAUDE.md「レンダリングとゲームロジックの分離」に
// 従い、ここは renderer-agnostic なデータのみ(PixiJS import なし)。

export type AvatarId = 'cat-set' | 'devil-set';

export interface AvatarPart {
  /** src/pixi/pixiTextures.ts の standalone リストに登録したテクスチャ名。 */
  tex: string;
  /** 'above' = プレイヤー本体スプライトより前面(上) / 'below' = 本体より背面(下)。 */
  layer: 'above' | 'below';
  /** スプライトのアンカー(0〜1)。素材の基準点(例: 耳=下端中央、尻尾=上端中央)。 */
  anchorX: number;
  anchorY: number;
  /**
   * プレイヤーの足元(footX)からのXオフセット。プレイヤー表示ボックス幅(boxW)の割合で指定
   * (画面px換算は pixiScene 側で depthScale を掛けて行う)。`flipWithFacing` が true の時は
   * 「プレイヤーが右向きの時」の値として扱い、左向きでは符号ごと反転する。
   */
  offsetXFrac: number;
  /** プレイヤーの足元(footY)からのYオフセット。表示ボックス高さ(boxH)の割合。負=上。 */
  offsetYFrac: number;
  /** 表示サイズを sizeBasis の割合で指定(アスペクト比は素材のまま保持)。 */
  sizeFrac: number;
  /** sizeFrac がプレイヤー表示ボックスの幅(width)/高さ(height)どちらを基準にするか。 */
  sizeBasis: 'width' | 'height';
  /** true = プレイヤーの向きに合わせて左右反転(耳のように反転不要なパーツは false で固定)。 */
  flipWithFacing: boolean;
  /**
   * true = 頭頂追従を行う(社長報告「耳が動きとズレる」対策・v0.25.3271)。歩き/しゃがみ/攻撃などで
   * スプライトの頭が上下する差分(pixiScene の頭頂キャッシュ計測値)を offsetYFrac に加算する。
   * 耳のような「頭に付くパーツ」だけ true にする(尻尾など頭と無関係なパーツは省略=false相当)。
   */
  followsHead?: boolean;
  /**
   * true = 本体の絵に焼き込まず、従来どおり毎フレーム重ねて描く(パーツ単体で動かしたい物=羽ばたく羽・揺れる炎など)。
   * 既定(省略)=**焼き込む**: 体の各コマを初めて表示する時に描き込み、本体と同じ1枚の絵として表示する
   * (体の傾き・伸び縮み・反動・跳ねが全部そのまま乗る=ずれようがない・社長「はい」2026-10-26)。
   * ★焼いたパーツは体ごと左右反転する(`flipWithFacing` は効かない)。左右非対称で反転させたくない物は `live: true`。
   */
  live?: boolean;
  /**
   * true = 絵の**進行方向側の半分**だけ頭の裏(本体より後ろ)へ回す。残りの半分は `layer` のまま
   * (社長指示2026-10-31「猫耳、片耳(進行方向の方)をレイヤー下(頭の裏に表示)にできたりする?」「アバター毎に指定する」)。
   * 左右2つが1枚の絵になっている物(猫耳)用。1本ツノのような真ん中の1つの物には付けない(=全部 `layer` のまま)。
   * 割り方は utils/avatarPlacement.avatarPartPieces の1本。
   */
  leadingHalfBehind?: boolean;
}

export interface AvatarDef {
  id: AvatarId;
  name: string;
  parts: AvatarPart[];
}

// 第1弾「猫耳セット」: 耳(頭・above)+尻尾(足元後方・below)。
// スケールの叩き台(社長裁定済み仕様の目安値をそのまま採用): 耳=表示幅×0.9 / 尻尾=表示高×0.6。
export const AVATARS: Record<AvatarId, AvatarDef> = {
  'cat-set': {
    id: 'cat-set',
    name: '猫耳セット',
    parts: [
      {
        tex: 'avatar-cat-ears', // 100×48
        layer: 'above',
        anchorX: 0.5, anchorY: 1, // 素材下端中央=頭頂に置く基準点
        offsetXFrac: 0.05, // 社長指示2026-10-31「耳少し位置を前に移動」(右向き基準=進行方向へ)
        // v0.25.3255 社長実機報告「ズレてる・もっと小さく」: 浮いて見えたため頭頂へ下げ(−0.92→−0.76)、
        // 幅も半分に(0.9→0.45)。
        offsetYFrac: -0.78, // 社長指示2026-10-31「ほんの少しだけ上へ」-0.76→-0.78
        sizeFrac: 0.4, // 社長指示2026-10-31「もう少し耳を小さく」0.45→0.4
        sizeBasis: 'width',
        // 前へずらした(offsetXFrac>0)ので、重ね描きの時も向きで左右を入れ替える(焼き込みは体ごと反転=元から入れ替わる)。
        flipWithFacing: true,
        followsHead: true, // v0.25.3271: 頭頂追従(歩き/しゃがみ/攻撃で頭が動いてもズレない)
        leadingHalfBehind: true, // 進行方向側の耳は頭の裏(社長指示2026-10-31)
      },
      {
        tex: 'avatar-cat-tail', // 76×128
        layer: 'below',
        anchorX: 0.5, anchorY: 1, // 素材下端中央=足元に置く基準点(木/障害物と同じ足元アンカー規約)
        offsetXFrac: -0.28, // 右向き基準で後方(左)へ。左向き時は flipWithFacing で符号反転=常に背後
        offsetYFrac: 0,
        sizeFrac: 0.42, // v0.25.3255「もっと小さく」: 0.6→0.42
        sizeBasis: 'height',
        flipWithFacing: true,
      },
    ],
  },
  // 第2弾「悪魔セット」(社長支給2026-10-31): 角2本(頭・above)+尻尾(腰から後ろへ・below)。
  // 角は猫耳と同じく、進行方向側の1本を頭の裏へ回す(社長指示「同じく一本は後ろに」)。
  'devil-set': {
    id: 'devil-set',
    name: '悪魔セット',
    parts: [
      {
        tex: 'avatar-devil-horns', // 48×30(支給の角2本を1枚に並べた物)
        layer: 'above',
        anchorX: 0.5, anchorY: 1,
        offsetXFrac: 0.05,
        offsetYFrac: -0.78,
        sizeFrac: 0.4,
        sizeBasis: 'width',
        flipWithFacing: true,
        followsHead: true,
        leadingHalfBehind: true,
      },
      {
        tex: 'avatar-devil-tail', // 49×32(右上が付け根・左下が先端)
        layer: 'below',
        anchorX: 0.95, anchorY: 0.08, // 付け根を腰に置く
        offsetXFrac: -0.05,
        offsetYFrac: -0.52,
        sizeFrac: 0.5,
        sizeBasis: 'width',
        flipWithFacing: true,
      },
    ],
  },
};

export const AVATAR_IDS = Object.keys(AVATARS) as AvatarId[];

export const isAvatarId = (v: string | null | undefined): v is AvatarId =>
  !!v && Object.prototype.hasOwnProperty.call(AVATARS, v);
