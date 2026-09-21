import type { JumpSplit } from './enemyJumpSheet';
// ★敵のアニメーションシートの台帳(**依存ゼロの葉モジュール**)。
//
// ★なぜ葉にするか(ENGINEERING_NOTES「循環importは…」): この表は
// `enemyWalkSheet`(歩き)・`enemyAttackSheet`(攻撃)・`batLanternSwing`(武器)・描画側 の
// **4方向から引かれる**。どれか1つに置くと、その1つを他が import し返して環になる
// (実際 v0.25.4537 で `enemyAttackSheet ⇄ batLanternSwing` の環を作ってしまった)。
// **表と名前だけをここへ置き、計算はそれぞれのモジュールが持つ。**
//
// ★素材を足す時はここへ1行。`pixiTextures` のロード登録も揃える。
// ※`JumpSplit` は **型だけ** を借りる(値を持ち込まないので葉のままでいられる)。
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
  // 社長支給2026-09-21「skeleton女の子歩き」。9コマ(1コマ 115×130)。常駐 0.51MB。縮小していない。
  // ★**支給時点で揃っていた**(全コマ下端y=129・絵の中心が56.5〜57.0=0.5px以内)。
  // 送りは既定の前方ループ。継ぎ目の実測は**隣の平均の1.20倍**だが、**継ぎ目より大きい隣が在る**
  // (0→1が1.25倍)ので「継ぎ目だけが跳ねている」形ではない。男(0.77倍)と同じ四つ足の歩様で、
  // 折り返すと前進→後退に見えるため、ここは比だけで判断しない。
  'skeleton-female': 9,
  // 社長支給2026-09-21「ゾンビの歩行」。7コマ(1コマ 192×256)。常駐 1.31MB。
  // ★**支給は 2800×520(1コマ400×520)で、絵はきっちり2倍に引き伸ばされていた**
  //   (2×2ブロックの一致率 **100.0%**)。⇒ **最近傍で半分にすると1ビットも失われない**
  //   (色数65のまま。コウモリ女の時のような滑らかさは出ない)。原盤は `art-masters/` へ。
  // ★**透明な余白を切り落とした**(全コマ共通の矩形 x4-195 / y4-259 = 192×256)。
  //   理由: 立ち絵 `zombie-common` は絵が canvas いっぱい(464×640)だが、シートには左右12px・
  //   上12pxの余白があり、`containScale` は**余白ごと**枠に収める。
  //   ★**ゾンビの枠は正方形**(判定が36×36で `enemyFootBox` は boxW=幅×倍率 / boxH=高さ×倍率)。
  //   絵はどれも縦長なので**内接は必ず高さで決まる** ⇒ **描画高さの比 = 中身の高さ ÷ cellの高さ**。
  //   立ち絵=1.000 に対し、歩きの先頭コマは **切る前 0.954 / 切った後 0.969**
  //   (=歩き出しの縮みが **4.6% → 3.1%**)。残差は「シートの中身が cell の高さいっぱいではない」ぶん。
  //   切る矩形は全コマ共通なので**コマ間の位置関係は動かない**。
  //   ★**攻撃シートが来た時も同じ処理をすること**(片方だけ切ると歩き↔攻撃で体格が変わる)。
  // ★足元は支給時点で揃っていた(全コマ下端が cell の底・中心 94.5〜95.5=1px以内)。
  // ★送りは既定の前方ループ(継ぎ目は隣の平均の 0.85倍・継ぎ目より大きい隣が在る)。
  'zombie-common': 7,
  // 社長支給2026-09-21「雲歩き」(=**蜘蛛**歩き。`pumpkin`=蜘蛛の機械足の襤褸)。
  // 12コマ(支給 2100×130 → 透明余白を切って **160×120**)。常駐 0.88MB。
  // ★**切るのがここでは効く**: 立ち絵 `pumpkin-common` は**横長**(1024×768)で、枠が正方形なので
  //   **内接は幅で決まる**。シートは1コマ175px幅の中に絵が144〜160しか無く、そのまま出すと
  //   **最大17%小さくなる**。切ると一番広いコマが立ち絵とぴったり同じ大きさになる。
  // ★切る矩形は全コマ共通(x8-167 / y10-129)=コマ間の位置関係は動かない(和集合の中心 87.5)。
  // ★足元は支給時点で揃っていた(全コマ下端が cell の底・中心 87.0〜88.0=1px以内)。
  // ★送りは既定の前方ループ(継ぎ目は隣の平均の 1.05倍で、継ぎ目より大きい隣が在る。
  //   隣どうしの差も 11.1〜13.7 と**ほぼ一定**=途切れない歩様)。
  'pumpkin-common': 12,
};

/**
 * ★★**そのシートが「正面向き」に描かれているか**(社長支給2026-09-21「雲歩き」)。
 *
 * ★**既定は false = 横向き**。横向きのシートは**必ずミラーする**
 * (社長裁定2026-09-21「全敵アニメーション入れる予定なのでミラーさせます」。ミラーしないと
 *  脚も武器の振りも進行方向と逆になる=「半分の時間ムーンウォーク」)。
 *
 * ★**正面向きのシートだけは例外**。左右反転しても得るものが無い上に、振り向きの潰し
 * (`ENEMY_TURN_MS` で横スケールを 旧→0→新 と潰す)が**進む向きを変えるたびに走る**ので、
 * **正面の絵が理由もなく捻れる**。蜘蛛(pumpkin)は正面絵で、型の設定も `faceMove: false`。
 */
export const ENEMY_SHEET_FRONT_ON: Readonly<Record<string, boolean>> = {
  'pumpkin-common': true,
};

/** そのシートは正面向きか(=ミラーしない)。 */
export const sheetFrontOn = (idleTexName: string | null | undefined): boolean =>
  !!(idleTexName && ENEMY_SHEET_FRONT_ON[idleTexName]);

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
  // 社長支給2026-09-21「skeleton女の子引っ掻き」。9コマ(1コマ 142×130)。常駐 0.63MB。縮小していない。
  // ★**揃っていた**(全コマ下端y=129・絵の中心が69.5〜70.5=1px以内)。
  // 読み: 0,1=構え / 2=前へ踏み込む / 3,4=腕を上げる / **5=振り上げ切り** /
  //       **6=振り下ろし(当たる)** / 7,8=戻り。
  // ⇒ ★**当たるコマは 6**(既定の「末尾から2コマ目=7」ではない)。**戻りが2コマある**切り方なので、
  //    既定のままだと**振り切った後の絵で当たる**=掟③(消え切る時刻=当たる時刻)が嘘になる。下の表で指定した。
  'skeleton-female': 9,
  // 社長支給2026-09-21「ゾンビの噛みつき」。11コマ(支給 1232×130 → **透明な余白を切って 108×126**)。
  // 常駐 0.57MB。★切る矩形は全コマ共通(x2-109 / y4-129)=**コマ間の位置関係は動かない**
  //   (和集合の中心 55.5 = cell の中心 55.5)。歩きと同じ処理(v0.25.4548)。
  // 読み: 0=構え(立ち絵と同じ姿) / 1〜5=体を起こして伸び上がる / **6=伸び切り(溜め切り)** /
  //       **7=前へ落として噛みつく(当たる)** / 8,9,10=四つ這いで着地して戻る。
  // ⇒ ★**当たるコマは 7**(既定の「末尾から2コマ目=9」ではない)。**戻りが3コマある**切り方。
  'zombie-common': 11,
};

/**
 * ★**当たる瞬間のコマ**(掟③「消え切る時刻 = 当たる時刻」)。
 * 既定は **末尾から2コマ目**——支給された2枚ともこの形だった
 * (最後の1コマは**振り抜き**=当たった後の余韻。無いと「当たって終わり」で慣性が切れる)。
 * 違う切り方のシートが来たらここへ1行足す。
 */
export const ENEMY_ATTACK_IMPACT_FRAME: Readonly<Record<string, number>> = {
  // 骸骨(女)は**戻りが2コマ**(7,8)ある切り方。振り下ろしは6コマ目。
  'skeleton-female': 6,
  // ゾンビは**戻りが3コマ**(8,9,10)ある切り方。噛みつくのは7コマ目。
  'zombie-common': 7,
};

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
  // ★**骸骨(男/女)はこの表に載せない**(社長指示2026-09-21「**別スプライトの爪は消さなくていい**」)。
  // v0.25.4543〜4545 は「シートに爪の腕ごと描かれている=二本になる」と考えて true にしていたが、
  // 社長裁定で**爪は出したまま**になった。⇒ 骸骨の爪は全個体で無条件に出る(`pixiScene` 側も
  // シートの有無を見ない)。**この表を見ているのは今はコウモリ(男)のランタンだけ。**
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
 * ★**弾を撃つ絵**(噛みつきとは別の表)。シート名は `<立ち絵名>-shot`。
 *
 * ★**なぜ攻撃シートと分けたか**: 攻撃シートの表は **`hasAnimSheet`=ミラーする個体**の定義も
 * 兼ねている。プラントは**正面向きの花**で `faceMove: false`(左右に向き直らない)なので、
 * 攻撃の表に入れると**撃つたびに左右反転する**。絵の持つ意味が違うので表ごと分ける。
 * ★尺の出どころも違う——噛みつきは `biteAt`+噛み台本、こちらは**次に撃つ時刻**
 * (`utils/plantShot.ts`)。
 */
export const ENEMY_SHOT_SHEETS: Readonly<Record<string, number>> = {
  // 社長支給2026-09-21「プラントの弾攻撃(蕾になるのを早く流して、閉じたら弾が発射するイメージ)」。
  // 8コマ(支給 952×130 → 透明余白を切って **115×128**)。常駐 0.45MB。
  // 並びは **0=開いた花 → 7=閉じた蕾**。0 が立ち絵とほぼ同じ姿(描画比 0.984 / 立ち絵 1.000)。
  'plant-common': 8,
};

export const shotSheetName = (idleTexName: string): string => `${idleTexName}-shot`;

export const shotSheetFrames = (idleTexName: string | null | undefined): number =>
  (idleTexName && ENEMY_SHOT_SHEETS[idleTexName]) || 0;

/** 弾を撃つ絵を持っているか。★**ミラーの判定には使わない**(上のコメント参照)。 */
export const hasShotSheet = (idleTexName: string | null | undefined): boolean =>
  shotSheetFrames(idleTexName) > 1;

/**
 * ★**待機中(呼吸)の絵**。シート名は `<立ち絵名>-idle`。
 *
 * ★これも**ミラーの表には入れない**(`hasAnimSheet` と別)。理由は上の弾の表と同じ。
 * ★**立ち絵の代わりに常時出る**ので、`enemyBreath`(全敵共通の疑似呼吸)と**二重になる**。
 *   ⇒ 描画側で「シートのコマが出ているフレームは呼吸を掛けない」にしてある
 *   (社長指示2026-09-21「絵が入った敵のパターンには歪み入れないで」の適用)。
 */
export const ENEMY_IDLE_SHEETS: Readonly<Record<string, number>> = {
  // 社長支給2026-09-21「プラントの待機中(呼吸)」。6コマ(支給 714×130 → 余白を切って 115×128)。
  // 常駐 0.34MB。★**先頭コマは弾シートの先頭コマと1ビットも同じ**(実測 差0.0)=繋ぎ目が出ない。
  'plant-common': 6,
};

/** 1周期(吸う→吐く→止まる)の長さ。★叩き台——`?idlebreath=` で実機から触れる。 */
export const ENEMY_IDLE_PERIOD_MS: Readonly<Record<string, number>> = {
  // 置き換える前の疑似呼吸は strideHz 0.25 × テンポ0.7 = **5.7秒**とかなり遅かった。
  // 6コマだと1コマ1秒近くなって途切れて見えるので、**3.6秒**を叩き台にする(社長が実機で詰める)。
  'plant-common': 3600,
};

export const idleSheetName = (idleTexName: string): string => `${idleTexName}-idle`;

export const idleSheetFrames = (idleTexName: string | null | undefined): number =>
  (idleTexName && ENEMY_IDLE_SHEETS[idleTexName]) || 0;

export const idleSheetPeriodMs = (idleTexName: string | null | undefined): number =>
  (idleTexName && ENEMY_IDLE_PERIOD_MS[idleTexName]) || 3600;

/**
 * ★**跳ぶ技の絵**(社長支給2026-09-21「パンプキン(蜘蛛)のジャンプ攻撃時」)。
 * シート名は `<立ち絵名>-jump`。**しゃがみ・滞空・着地の3区間**に割って使う
 * (割り方は `utils/enemyJumpSheet.ts`。尺は判定側=store の時計をそのまま読む)。
 */
export const ENEMY_JUMP_SHEETS: Readonly<Record<string, JumpSplit>> = {
  // 15コマ(支給 2415×130 → 余白を切って **157×128**)。常駐 1.15MB。
  // 読み: **0〜3=しゃがむ**(3で沈み切る) / **4〜9=踏み切り〜頂点〜落下**(7,8が頂点) /
  //       **10〜14=接地〜砂埃〜立ち直り**(11が一番潰れる=着地の瞬間)。
  // ★砂埃は**絵の中にも描かれている**が、**ゲーム側の砂埃エフェクトは消していない**
  //   (社長指示2026-09-21「元々のエフェクトは消さないで」)。
  'pumpkin-common': { crouch: 4, air: 6, land: 5 },
};

/** 着地の絵を流す長さ(ms)。立ち直り(recover)全体はもっと長いので、その頭だけを使う。 */
export const ENEMY_JUMP_LAND_MS: Readonly<Record<string, number>> = {
  'pumpkin-common': 420,
};

export const jumpSheetName = (idleTexName: string): string => `${idleTexName}-jump`;

export const jumpSheetSplit = (idleTexName: string | null | undefined): JumpSplit | null =>
  (idleTexName && ENEMY_JUMP_SHEETS[idleTexName]) || null;

export const jumpLandMs = (idleTexName: string | null | undefined): number =>
  (idleTexName && ENEMY_JUMP_LAND_MS[idleTexName]) || 420;

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
