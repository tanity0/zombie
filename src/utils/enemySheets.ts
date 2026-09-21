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
  // 社長支給2026-09-20。8コマ・**前方ループ**(接地点が右へ流れ、7コマ目が0コマ目の直前へ戻る)。
  'bat-female': 8,
};

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
