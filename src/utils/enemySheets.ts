// ★敵のアニメーションシートの台帳(**依存ゼロの葉モジュール**)。
//
// ★なぜ葉にするか(ENGINEERING_NOTES「循環importは…」): この表は
// `enemyWalkSheet`(歩き)・`enemyAttackSheet`(攻撃)・`batLanternSwing`(武器)・描画側 の
// **4方向から引かれる**。どれか1つに置くと、その1つを他が import し返して環になる
// (実際 v0.25.4537 で `enemyAttackSheet ⇄ batLanternSwing` の環を作ってしまった)。
// **表と名前だけをここへ置き、計算はそれぞれのモジュールが持つ。**
//
// ★素材を足す時はここへ1行。`pixiTextures` のロード登録も揃える。
// ★**アスペクトは登録しない**(登録すると `enemyHitStrip`=当たり判定がシートの縦横比で動く)。

/** 歩きシートを持つ立ち絵(立ち絵のテクスチャ名 → コマ数)。シート名は `<立ち絵名>-walk`。 */
export const ENEMY_WALK_SHEETS: Readonly<Record<string, number>> = {
  // 社長支給2026-09-20。8コマ(1コマ 360×520→配信180×260)。
  'bat-female': 8,
  // 社長支給2026-09-21。9コマ(1コマ 97×130)。★**縮小していない**——支給時点で既に小さく、
  // 画面上の描画(高さ60〜90px)に対して1.4〜2.2倍しか余裕が無いため。常駐 0.43MB。
  // ★**足元は支給時点で揃っていた**(全コマ下端y=129・絵の中心が47.5〜48.5=1px以内)。
  'bat-male': 9,
};

/**
 * ★コマの送り方。既定は**前方ループ**(0→末→0)。`pingpong` は 0→末→0 と折り返す
 * (プレイヤーの5コマ歩きと同じ作法)。
 *
 * ★**測って決める**: 「末コマ→先頭コマ」の絵の差を、隣り合うコマの差の平均と比べる。
 * 前方ループなら継ぎ目は隣と同じかそれ以下(女の実測 **0.68倍**)。**1を超えたら継ぎ目が跳ねる**
 * =前方ループではない(男の実測 **1.34倍**——しかも継ぎ目が全コマ中で最大の差だった)。
 * 男は襤褸で脚がほぼ隠れており、接地点から歩幅を読めないので、この指標で判断した。
 */
export type SheetPlayback = 'loop' | 'pingpong';
export const ENEMY_WALK_PLAYBACK: Readonly<Record<string, SheetPlayback>> = {
  'bat-male': 'pingpong',
};

export const walkPlayback = (idleTexName: string | null | undefined): SheetPlayback =>
  (idleTexName && ENEMY_WALK_PLAYBACK[idleTexName]) || 'loop';

/** 攻撃シートを持つ立ち絵(立ち絵のテクスチャ名 → コマ数)。シート名は `<立ち絵名>-attack`。 */
export const ENEMY_ATTACK_SHEETS: Readonly<Record<string, number>> = {
  // 社長支給2026-09-20「武器を振り下ろす絵」。6コマ。足元を揃えてある(v0.25.4536)。
  'bat-female': 6,
};

/**
 * ★シートが**右向き**で描かれている立ち絵(既定は左向き)。
 * ミラーの向きが反転する(`enemyMotion.EnemyMotionSpec.faceRight` と同じ意味)。
 * bat-female の2枚はどちらも**左向き**なので、ここには載せない。
 */
export const ENEMY_SHEET_FACES_RIGHT: Readonly<Record<string, boolean>> = {};

export const walkSheetName = (idleTexName: string): string => `${idleTexName}-walk`;
export const attackSheetName = (idleTexName: string): string => `${idleTexName}-attack`;

export const walkSheetFrames = (idleTexName: string | null | undefined): number =>
  (idleTexName && ENEMY_WALK_SHEETS[idleTexName]) || 0;

export const attackSheetFrames = (idleTexName: string | null | undefined): number =>
  (idleTexName && ENEMY_ATTACK_SHEETS[idleTexName]) || 0;

/**
 * ★その立ち絵が**動く絵(歩き or 攻撃)を持っているか**。
 *
 * 社長裁定2026-09-21「**全敵、アニメーション入れる予定なのでミラーさせます / 少しずつ揃えていくので
 * 個々実装**」: シートは**明確に横向き**に描かれているので、進行方向へ**左右ミラー**しないと
 * 脚も振りも逆を向く。だが素材は1体ずつ届くので、**型ではなく個体で**判定する
 * (同じバットでも、シートのある女はミラーし、まだ無い男は従来どおり)。
 */
export const hasAnimSheet = (idleTexName: string | null | undefined): boolean =>
  walkSheetFrames(idleTexName) > 1 || attackSheetFrames(idleTexName) > 1;

/** その立ち絵のシートが右向きか(シートが無ければ false=既定の左向き)。 */
export const sheetFacesRight = (idleTexName: string | null | undefined): boolean =>
  !!(idleTexName && ENEMY_SHEET_FACES_RIGHT[idleTexName]);
