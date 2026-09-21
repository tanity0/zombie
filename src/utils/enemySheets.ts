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
  // 社長支給2026-09-21。9コマ(1コマ 118×130)。常駐 0.53MB。縮小していない。
  // ★**絵の中心は揃っていた**(58.5〜59.0=0.5px以内)。★**下端は 122〜128 と6px振れる**が、
  // これは**四つ足の体が伸び上がる動き**(接地しているのが前手→後足と移り変わる)。
  // 位置合わせはしていない——揃えると、せっかくの上下動を潰すことになる。
  'skeleton-male': 9,
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
  // 社長支給2026-09-20「武器を振り下ろす絵」。6コマ(1コマ 552×514→配信276×257)。
  // 足元が最大134pxずれていたので相互相関で揃えた(v0.25.4536)。
  'bat-female': 6,
  // 社長支給2026-09-21。7コマ(1コマ 123×130)。★**縮小していない**(歩きと同じ理由)。
  // ★**足元は支給時点で揃っていた**(全コマ下端y=129・絵の中心が61.0〜61.5=0.5px以内)。
  'bat-male': 7,
  // 社長支給2026-09-21「skeleton男の引っ掻き」(ドット化後)。9コマ(1コマ 107×130)。常駐 0.48MB。
  // ★**揃っていた**(全コマ下端y=129・絵の中心が53.0〜53.5=0.5px以内)。
  // 読み: 0,1=構え / 2,3=引き / **4,5=爪を高く掲げる(溜め切り)** / 6=振り下ろし途中 /
  //       **7=振り切り(当たる)** / 8=戻り。⇒ **当たるコマは既定(末尾から2コマ目=7)のままで合う。**
  'skeleton-male': 9,
};

/**
 * ★**当たる瞬間のコマ**(掟③「消え切る時刻 = 当たる時刻」)。
 * 既定は **末尾から2コマ目**——支給された2枚ともこの形だった
 * (最後の1コマは**振り抜き**=当たった後の余韻。無いと「当たって終わり」で慣性が切れる)。
 * 違う切り方のシートが来たらここへ1行足す。
 */
export const ENEMY_ATTACK_IMPACT_FRAME: Readonly<Record<string, number>> = {};

/**
 * ★★**そのシートが「武器ごと」描かれているか**(社長報告2026-09-21「コウモリ女の攻撃時に武器が消えてる」)。
 *
 * ★**既定は false = 描かれていない**。true にした個体だけ、別スプライトの武器を出さない
 * (絵とスプライトで**二本持ち**になるため)。
 *
 * ★**既定を false にした理由**: 設計者は v0.25.4537 で「シートがある=武器も描かれている」と
 * **推測で決めつけ**、女の別スプライトのランタンを消した。**実際には女のシートは素手で掴む絵**で、
 * ぶら下がっている小さなランタンは**体の装飾**だった。結果、**女の攻撃から武器が丸ごと消えた**。
 * ⇒ 推測で消さない。**「武器が描かれている」とはっきり見えたシートだけ true にする。**
 * 間違えた時、false なら「二本持ち」(気づける)、true なら「消える」(気づきにくい)。**安全な側は false。**
 */
export const ENEMY_SHEET_HAS_WEAPON: Readonly<Record<string, boolean>> = {
  // 男のシートは**刃と振りの弧**がはっきり描かれている(血しぶきも絵に入っている)。
  'bat-male': true,
  // 女のシートは**素手の掴み**。武器は別スプライト(ランタン)が担当する。
  // 骸骨(男)のシートは**爪の腕ごと**描かれている(4,5コマ目で爪を高く掲げる)。
  // ⇒ 別スプライトの**爪**は出さない。★ただし**斬撃のVFXは出す**——あれは武器ではなく
  //   「当たった衝撃の絵」(CLAUDE.md 攻撃ヴィジュアルの2分類②)なので、消すと斬撃が読めなくなる。
  'skeleton-male': true,
};

export const sheetHasWeapon = (idleTexName: string | null | undefined): boolean =>
  !!(idleTexName && ENEMY_SHEET_HAS_WEAPON[idleTexName]);

export const attackImpactFrame = (idleTexName: string | null | undefined): number => {
  const n = attackSheetFrames(idleTexName);
  if (n <= 1) return 0;
  const over = idleTexName ? ENEMY_ATTACK_IMPACT_FRAME[idleTexName] : undefined;
  return over !== undefined ? Math.max(1, Math.min(n - 1, over)) : n - 2;
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
