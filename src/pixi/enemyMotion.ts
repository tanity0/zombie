// 敵の歩行二次モーション(社長承認①〜③・v0.25.2899)の**正本**。PixiJS非依存の純関数。
// v0.25.2903 で pixiScene.ts から切り出した——本編(pixiScene)と動物園ビューア(zoo.html)が
// **同じ表・同じ式**を読むため(手写しの二重管理にしない。angelSwordSync事故の教訓)。
//
// 絵は1枚のまま、**実移動量と同期**した bob/足元支点の揺れ/歩幅スカッシュを重ねて「歩いている」
// ように見せる。v0.25.1771 の実機確定「動作中の変形はドット崩れとして知覚されない」に乗る。
// **視覚のみ=判定・座標(store)は不変**。
//
// ★分類は**内部ID名ではなく現在の絵の見た目**で行う(社長指示v0.25.2899「ID名は旧世代の名残で
// 絵と一致していない」)。実際: bat=茨光輪の徘徊者(男)/鳥頭骨のよろめき(女)でコウモリではない、
// skeleton=包帯頭+点滴の四つ這いの獣、zombie=ナックルウォークの巨躯、werewolf=自転車に跨がる死体。
import { spriteVariantIndex } from '../utils/enemyVariant';

export interface EnemyMotionSpec {
  /** walk=直立歩行 / crawl=四足(前後ピッチング) / heavy=巨躯(左右ロール) / hover=浮遊 / none=固定砲台 */
  kind: 'walk' | 'crawl' | 'heavy' | 'hover' | 'none';
  bobPx: number;     // 上下の揺れ幅(px)
  rockRad: number;   // 足元支点の回転揺れ(rad)。足元アンカーなので回転=体の傾ぎに見える
  sqAmp: number;     // 歩幅スカッシュ振幅(1歩2拍)
  strideHz: number;  // 全速時の歩調(Hz)
  uneven: number;    // 0=規則正しい行進 / 1=千鳥足(副周期を混ぜて規則性を崩す)
  faceMove: boolean; // 移動X方向へ左右ミラーするか。**絵が明確に横向きの個体だけ** true
  faceRight?: boolean; // 素材が**右向き**の個体は true(既定は左向き)。ミラーの向きが反転する
  /**
   * 路面振動(社長指示v0.25.2904「自転車、動いてる時は小刻みに上下ガタガタ」)。歩幅のbobとは別に、
   * 高周波の細かい上下ジッタを移動量に比例して足す。2つの無関係な周波数を混ぜて「ガタガタ」の
   * 不規則さを出す(単一sinだと機械的なバイブレーションに見える)。
   */
  rattlePx?: number;  // 振動の振幅(px)
  rattleHz?: number;  // 振動の基本周波数(Hz・TEMPO適用前)
}

/** ③振り向き: 左右ミラーの切替をこのmsかけて scale.x を 旧→0→新 で潰す(=体を捻って向き直る)。 */
export const ENEMY_TURN_MS = 120;
/**
 * 歩調の全体倍率(社長指示v0.25.2900「もう少しゆっくり動いてほしい」)。
 * 型ごとの strideHz の**比率は保ったまま**全体のテンポだけ落とす1つまみ。速さの再調整はまずここ。
 */
export const ENEMY_MOTION_TEMPO = 0.7;

// bat枝1=男(茨の光輪の徘徊者・直立ゆったり) / 枝2=女(鳥頭骨・猫背のよろめき)。
const MOT_HOBBLER: EnemyMotionSpec = { kind: 'walk', bobPx: 1.1, rockRad: 0.040, sqAmp: 0.028, strideHz: 1.9, uneven: 0.25, faceMove: false };
const MOT_STAGGER: EnemyMotionSpec = { kind: 'walk', bobPx: 1.4, rockRad: 0.055, sqAmp: 0.030, strideHz: 2.2, uneven: 0.80, faceMove: false };
const ENEMY_MOTION_TABLE: Partial<Record<string, EnemyMotionSpec>> = {
  // skeleton=包帯頭+点滴の**四つ這いの獣**(絵は左向き)。獣の駆け足=速い小刻みピッチング。
  skeleton: { kind: 'crawl', bobPx: 1.8, rockRad: 0.050, sqAmp: 0.045, strideHz: 3.0, uneven: 0.35, faceMove: true },
  // zombie=ナックルウォークの巨躯(絵は左向き)。重く遅い左右ロール。
  zombie: { kind: 'heavy', bobPx: 2.2, rockRad: 0.048, sqAmp: 0.050, strideHz: 1.3, uneven: 0.45, faceMove: true },
  // werewolf=**自転車に跨がる死体**(v0.25.2901)。歩幅のbobは無し(車輪は跳ねない)、代わりに
  // 移動中だけ**路面振動のガタガタ**(rattle・v0.25.2904)+不安定なふらつき(rock)。
  // 絵はハンドルが右=右向きなので faceRight。
  // rattle調整履歴: 1.5→2.6(v0.25.2907「増やして」)/ 13→7Hz(v0.25.2910「早すぎ」)/
  //                 7→4.5Hz+2.6→3.6px(v0.25.2915「もう少し遅く・上下もう少し増やして」)
  werewolf: { kind: 'walk', bobPx: 0, rockRad: 0.035, sqAmp: 0.010, strideHz: 1.3, uneven: 0.50, faceMove: true, faceRight: true, rattlePx: 3.6, rattleHz: 4.5 },
  // pumpkin=**蜘蛛の機械足の襤褸**(v0.25.2905・旧: 樽腹の巨漢)。多脚が細かく脚を運ぶスキッター
  // =左右ロールをやめて小さめの速いピッチ+機械脚のカタカタ(rattle小)。正面絵なのでミラーなし。
  pumpkin: { kind: 'crawl', bobPx: 0.8, rockRad: 0.018, sqAmp: 0.020, strideHz: 2.6, uneven: 0.25, faceMove: false, rattlePx: 0.9, rattleHz: 11 },
  // ghost=卵を抱いた花嫁。歩かず滑る=浮遊ゆらぎ(常時)。
  ghost: { kind: 'hover', bobPx: 2.6, rockRad: 0.018, sqAmp: 0, strideHz: 0.55, uneven: 0, faceMove: false },
  // lich=針金ワイヤーの機械死体(絵は左向き)。無機質に滑走=揺れ最小のホバー。
  lich: { kind: 'hover', bobPx: 1.2, rockRad: 0.008, sqAmp: 0, strideHz: 0.8, uneven: 0, faceMove: true },
  // screamer=スーツの絶叫男。痙攣風(unevenほぼ最大)の小刻み。
  screamer: { kind: 'walk', bobPx: 1.0, rockRad: 0.030, sqAmp: 0.020, strideHz: 2.0, uneven: 0.90, faceMove: false },
  // plant=玉座の花女(speed8のほぼ固定砲台)。社長指示v0.25.2904「花びらが動いてる感じ」→
  // 「百合は上に向かって咲いているので**開いたり閉じたり**に見えるのが理想」。
  // 左右の首振り(rock)はほぼ無しにして、**ゆっくり大きめのスカッシュ脈動**を主役にする:
  // sqXが広がる(=花弁が開く)+sqYがわずかに縮む → 戻る、の呼吸。足元アンカーの横スケールは
  // 最も幅の広い花冠が一番大きく動いて見える。hover=移動量に関係なく常時。bob=0で根は接地したまま。
  // (v0.25.2943: v0.25.2927の食人植物絵を社長指示で撤回し、この花女アートへ復元した)
  plant: { kind: 'hover', bobPx: 0, rockRad: 0.008, sqAmp: 0.045, strideHz: 0.25, uneven: 0.3, faceMove: false },
  // hunter=棺桶担ぎの巨人。重い踏みしめ(ジャンプ等は既存aiSqが担当・歩行のみ)。
  hunter: { kind: 'heavy', bobPx: 1.6, rockRad: 0.030, sqAmp: 0.035, strideHz: 1.2, uneven: 0.20, faceMove: false },
  // giantbat=城ボス。**唯一ステージ別絵が残る型**なので動きもステージ別(下の
  // GIANTBAT_MOTION_BY_BACKDROP)。この行は既定=ステージ1(馬ぐるま)/3(四足獣)の這い。
  giantbat: { kind: 'crawl', bobPx: 1.6, rockRad: 0.035, sqAmp: 0.035, strideHz: 1.8, uneven: 0.55, faceMove: false },
  // reaper=チェーンソーを掲げた襤褸外套(v0.25.2901)。裾を引きずって歩く=重い踏みしめ(正面絵)。
  reaper: { kind: 'heavy', bobPx: 1.6, rockRad: 0.030, sqAmp: 0.035, strideHz: 1.1, uneven: 0.20, faceMove: false },
  // ★検収監査の補修(v0.25.4009・群3項目10): PACING_PUZZLE.md §14-2(伐採人・logger)は本体絵を
  // reaper-common.png(=上のreaper行と全く同じ絵)そのまま流用しているのに、この表に行が無く
  // 未登録の雑魚の既定(MOT_HOBBLER=直立ゆったり千鳥足)へ落ちていた=強個体(pumpkinTier)の
  // 重量感と絵が食い違っていたバグ。**同じ絵は同じ動き**(CLAUDE.md「同じ動作を持つ全員に付ける」の
  // 絵版)なので、reaper行の値をそのまま複製する(新しい値を作らない)。
  logger: { kind: 'heavy', bobPx: 1.6, rockRad: 0.030, sqAmp: 0.035, strideHz: 1.1, uneven: 0.20, faceMove: false },
  // PACING_PUZZLE.md §14-4-3(使者・hangedman): 吊るされた人形が宙を滑って迫る=歩かずhover
  // (ghost/lich/plantと同じ扱い。足取りではなく吊られたまま左右へ揺れる不気味さを出す・叩き台)。
  hangedman: { kind: 'hover', bobPx: 2.2, rockRad: 0.022, sqAmp: 0, strideHz: 0.6, uneven: 0, faceMove: false },
  'lab-zombie-1': { kind: 'walk', bobPx: 1.2, rockRad: 0.045, sqAmp: 0.028, strideHz: 1.8, uneven: 0.55, faceMove: false },
  'lab-zombie-2': { kind: 'walk', bobPx: 1.3, rockRad: 0.050, sqAmp: 0.030, strideHz: 2.0, uneven: 0.65, faceMove: false },
  // lab-zombie-3=**四つ這いの巨獣**(v0.25.2923で新絵・骨の尾)。heavy→crawlへ(見た目で判断)。
  'lab-zombie-3': { kind: 'crawl', bobPx: 1.8, rockRad: 0.040, sqAmp: 0.040, strideHz: 2.0, uneven: 0.35, faceMove: false },
  // research/GHOST_BOSS.md(守護霊ボス「幻影」)= **プレイヤーのクラス立ち絵**なので、雑魚の既定
  // (MOT_HOBBLER・uneven 0.25=千鳥足)に落ちると「もう1人のプレイヤー」に見えない。
  // 規則正しい直立歩行(uneven 0)にして、歩きは立ち絵の歩きコマ側だけに任せる。
  'guardian-phantom': { kind: 'walk', bobPx: 1.0, rockRad: 0.026, sqAmp: 0.024, strideHz: 2.1, uneven: 0, faceMove: false },
};

/**
 * 城ボス(giantbat)のステージ別モーション(v0.25.2909)。絵がステージごとに別物のため動きも分岐する:
 *  - 既定(ステージ1=馬ぐるま/ステージ3=四足獣) → 這い(上の表の giantbat 行)
 *  - snow(ステージ4) = **まだ人間味のある巨躯の二足**(社長評) → 重い踏みしめ
 *  - stage7(グレン) = 人型巨躯 → 同じく重い踏みしめ
 * 描画側(pixiScene)が farBackdrop キーで引く。載っていないキーは既定の這いに落ちる。
 */
export const GIANTBAT_MOTION_BY_BACKDROP: Partial<Record<string, EnemyMotionSpec>> = {
  snow: { kind: 'heavy', bobPx: 1.8, rockRad: 0.034, sqAmp: 0.040, strideHz: 1.2, uneven: 0.35, faceMove: false },
  // stage5=**銃を構えた兵士の融合体**(v0.25.2913)。二足で仁王立ち=重い踏みしめ。背中の群体が
  // ばらばらに蠢く感じを uneven 高めで出す。
  stage5: { kind: 'heavy', bobPx: 1.7, rockRad: 0.032, sqAmp: 0.038, strideHz: 1.2, uneven: 0.55, faceMove: false },
  stage7: { kind: 'heavy', bobPx: 1.6, rockRad: 0.030, sqAmp: 0.035, strideHz: 1.1, uneven: 0.25, faceMove: false },
};

/** バリアント枝ごとの型(添字指定)。動物園ビューアのように枝を直接選ぶ側はこちら。 */
export const enemyMotionSpecAt = (type: string, variantIdx: number): EnemyMotionSpec => {
  if (type === 'bat') return variantIdx === 0 ? MOT_HOBBLER : MOT_STAGGER;
  return ENEMY_MOTION_TABLE[type] ?? MOT_HOBBLER; // 未登録の雑魚は控えめな直立歩行
};
/** 敵IDから型を引く(本編用)。batは**絵の選択と同じ関数**(spriteVariantIndex)で枝が必ず一致する。 */
export const enemyMotionSpec = (type: string, id: string): EnemyMotionSpec =>
  enemyMotionSpecAt(type, type === 'bat' ? spriteVariantIndex(id, 2) : 0);

export interface EnemyMotionPose { rot: number; bob: number; sqX: number; sqY: number }
const POSE_STILL: EnemyMotionPose = { rot: 0, bob: 0, sqX: 1, sqY: 1 };
/**
 * 歩行ポーズの式(本編とビューアの共通部)。
 * @param phaseSeed 個体位相(本編はIDハッシュ=群れが同期行進しない)
 * @param walk 0..1.25=実移動量/基準速度(hoverは常時1を渡す)。0.02未満は静止。
 */
export const enemyMotionPose = (
  spec: EnemyMotionSpec, phaseSeed: number, nowMs: number, walk: number,
): EnemyMotionPose => {
  if (spec.kind === 'none' || walk <= 0.02) return POSE_STILL;
  const ph = nowMs / 1000 * spec.strideHz * ENEMY_MOTION_TEMPO * Math.PI * 2 + phaseSeed;
  // 千鳥足: 無関係な副周期を混ぜて規則性を崩す(uneven=混合率)。
  const wave = Math.sin(ph) * (1 - spec.uneven * 0.5) + Math.sin(ph * 0.63 + 1.7) * spec.uneven * 0.7;
  const sq = Math.sin(ph * 2) * spec.sqAmp * walk;       // 歩幅スカッシュ(1歩2拍)
  // 路面振動(rattle): 歩幅とは無関係の高周波を2本混ぜた不規則な上下ジッタ。移動量に比例。
  let rattle = 0;
  if (spec.rattlePx) {
    const phr = nowMs / 1000 * (spec.rattleHz ?? 12) * ENEMY_MOTION_TEMPO * Math.PI * 2 + phaseSeed * 3.1;
    rattle = (Math.abs(Math.sin(phr)) * 0.7 + Math.abs(Math.sin(phr * 1.37 + 1.3)) * 0.3) * spec.rattlePx * walk;
  }
  return {
    rot: spec.rockRad * wave * walk,                     // 足元支点: walk=リーン/crawl=ピッチ/heavy=ロール
    bob: Math.abs(Math.sin(ph)) * spec.bobPx * walk + rattle, // 1歩=1山の接地リズム+路面振動
    sqX: 1 + sq, sqY: 1 - sq * 0.7,
  };
};
