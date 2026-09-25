// ★薙ぎ払いの絵(社長支給2026-09-22「**伐採人の薙払いの時のモーション**」)。PixiJS非依存の純関数。
//
// ★**跳ぶ技(`enemyJumpSheet`)と同じ核**(`sheetSections`)を使う。違うのは**区間の名前と時計**だけ:
//   跳ぶ = しゃがむ / 滞空 / 着地   ←→   薙ぎ = 溜め / 薙ぎ / 戻り
//
// ★★**尺は自分で持たない**。溜め・薙ぎ・戻りの時計は**判定側(store)が既に持っている**
// (`LOGGER_SWEEP_WINDUP_MS` / `_ACTIVE_MS` / `_RECOVER_MS`)ので、**その進み具合(0..1)を
// 受け取ってコマ番号へ写すだけ**にする。
//
// ★★**掟③(消え切る時刻 = 当たる時刻)がここでは「区間の境目」になる。**
// 薙ぎの当たり(カプセル)は**溜めの末尾で1回だけ積まれる**(`gameStore` の `logger-sweep-windup` →
// `-active` の遷移)。だから **「溜めの最後のコマが終わる瞬間 = 当たる瞬間 = 薙ぎの先頭コマが出る瞬間」**。
// ⇒ **刃が地を噛むコマ(火花)は「薙ぎ」区間の先頭に置く**。溜め側へ入れると、
//    **火花が出ているのにまだ当たらない**という嘘になる。
//
// ★**位相は線形**(加減速は絵の側に描かれている)。

import { sectionFrame, sectionLastFrame, sectionsTotal, type SectionCounts, type SectionWeights } from './sheetSections';

/** 1枚のシートを3区間へ割る。合計がコマ数と一致すること。 */
export interface SweepSplit {
  /** 溜め(構えて止まる)。先頭から。**この区間が終わる瞬間に当たる。** */
  windup: number;
  /** 薙ぎ(刃が走っている判定の窓)。**先頭コマ=当たった瞬間。** */
  active: number;
  /** 戻り(硬直=反撃の窓)。末尾まで。 */
  recover: number;
  /**
   * ★**コマごとの表示の長さの比**(シート全体ぶん・省略=等分)。
   * 社長指示2026-09-24「**普通に流すと突きがゆったりしてる**」——同じ姿勢のコマが並ぶ絵は
   * 等分だと突きが伸びないので、**溜めは長く・突きは短く**配る。区間の境目は動かない。
   */
  weights?: SectionWeights;
  /**
   * ★**このシートの中で「立ち絵の枠」に当たる高さ**(省略=シートの枠の高さ=従来どおり)。
   *
   * ★なぜ要るか(社長支給2026-09-25「叩きつけ」・高さが難しい と添えられていた):
   * 背丈合わせ(`utils/sheetFit.ts`)は**枠の高さ**を揃えることで「1コマの1画素=立ち絵の1画素」を
   * 保っている。これは**生き物が枠いっぱいに描かれている**間だけ正しい。城ボス3の叩きつけは
   * **振り上げた蔓のぶんだけ枠が20px高い**(枠170・立ち姿135=立ち絵と同じ)ので、そのままでは
   * **枠の差(150/170)がそのまま縮みになり、本体が11.8%小さくなる**。
   * ⇒ **「立ち絵の枠150に当たるのはこの170のうち150」**と1つ書いて、そこで揃える。
   * ★**書かなければ従来どおり**(既定=枠の高さ)。既存のシートは1ビットも変わらない。
   */
  bodyH?: number;
}

const counts = (s: SweepSplit): SectionCounts => [s.windup, s.active, s.recover];

export const sweepSplitFrames = (s: SweepSplit): number => sectionsTotal(counts(s));

export type SweepPhase = 'windup' | 'active' | 'recover';

/** store の `aiPhase` → 区間。表に無い `aiPhase` は `null`(=この絵を出さない)。 */
export const LOGGER_SWEEP_PHASES: Readonly<Record<string, SweepPhase>> = {
  'logger-sweep-windup': 'windup',
  'logger-sweep-active': 'active',
  'logger-sweep-recover': 'recover',
};

/**
 * ★**削岩型の突きも同じ3相**(社長支給2026-09-24「削岩機の突きのアニメーション」)。
 * 溜めてドリルを引き込む → 突き出す → 出し切った姿で硬直、と**薙ぎと同じ形**なので
 * **新しい仕組みを作らない**(区間の割り方も尺の読み方もそのまま借りる)。名前だけ違う。
 */
export const DRILLER_THRUST_PHASES: Readonly<Record<string, SweepPhase>> = {
  'driller-thrust-windup': 'windup',
  'driller-thrust-active': 'active',
  'driller-thrust-recover': 'recover',
};

// ★城ボスの相(`g-*`)は**ここには入れない**。城ボスは `giantMotionSpanOf`(下)が
// 相の名前から区間を決める別経路で、こちらは伐採人・削岩型の2型だけが使う
// (`sweepPhaseOf` は「薙ぎの震え」「帯の向き」の判定にも使われるので、混ぜると城ボスへ波及する)。
const THREE_PHASE_TECH: Readonly<Record<string, SweepPhase>> = {
  ...LOGGER_SWEEP_PHASES, ...DRILLER_THRUST_PHASES,
};

/**
 * ★★**叩きつけのモーションを「跳ぶ」以外の技“全部”へ配る**(社長指示2026-09-25
 * 「モーションの叩きつけをジャンプ以外の技に入れたい」→「**ジャンプ以外の攻撃全てだよ**」)。
 *
 * ★なぜ要ったか(★実在確認の掟): **叩きつけ(slam)の技は、どのステージにも割り当てられていない**
 * (`giantScript.GIANT_STAGE_UNIQUE_MOVE` / `_ULT_MOVE` のどちらにも 'slam' が無い。
 *  v0.25.2863 で stage-1 の大技が slam → wing へ移った時から)。
 * ⇒ `g-slam-*` は実戦で一度も出ない=せっかくのシートが1コマも画面に出ない。
 * ⇒ だから**実際に出る技の全部**へこの絵を配る。
 *
 * ★**表を作らず、相の名前で決める。** 城ボスの相は `g-<技>-<区間>` の形に揃っているので、
 * 末尾だけを見れば「溜め/当たり/戻り」のどれかが決まる。**新しい技を足しても勝手に乗る**
 * (書き忘れで絵が出ない、が起きない)。
 *
 * ★**跳ぶ技だけ外す**(社長指示の「ジャンプ以外」)。跳びは専用のシートを持っている。
 *
 * ★**当たりの相を持たない技**(踏み鳴らし・爪・祝福・薙ぎ抜け・急降下・虚無)は、
 * **戻りの相が「当たり+戻り」をまとめて**受け持つ——それらは**溜めの終わりで当たる**ので、
 * **戻りの先頭コマ=砂埃の出るコマ=当たる瞬間**になる(掟③)。
 */
export type SweepSpan = readonly [SweepPhase, SweepPhase];

/** 跳ぶ技(専用シートを持つので配らない)。 */
const GIANT_JUMP_TECHS = ['g-jump-', 'g-trijump-'];

/**
 * **当たりの相を持たない技**(= `-active` 等が無く、溜めの終わりで当たる)。
 * ここに載っている技は、戻りの相が「当たり+戻り」を受け持つ。
 */
const GIANT_NO_ACTIVE_TECHS: readonly string[] = [
  'g-stomp-', 'g-talon-', 'g-boon-', 'g-reach-', 'g-dive-', 'g-nihil-',
];

/** 溜めに当たる相の末尾(構える・狙う・唱える)。 */
const GIANT_WINDUP_SUFFIX = ['-windup', '-hold', '-track', '-chant1', '-chant2', '-chant3'];
/** 当たりに当たる相の末尾(判定が出ている・体をぶつけている)。 */
const GIANT_ACTIVE_SUFFIX = ['-active', '-burst', '-volley', '-charge'];

const WINDUP: SweepSpan = ['windup', 'windup'];
const ACTIVE: SweepSpan = ['active', 'active'];
const RECOVER: SweepSpan = ['recover', 'recover'];
const ACTIVE_RECOVER: SweepSpan = ['active', 'recover'];

/**
 * その `aiPhase` が攻撃モーションのどの範囲か(城ボス以外・跳ぶ技・`skip` の技は null=この絵を出さない)。
 * @param skip その立ち絵で**外したい技**の接頭辞(`enemySheets.giantMotionSkipFor`)。
 *   例: 城ボス1は社長指示で**突進も外す**(「ジャンプと突進以外の攻撃モーション」)。
 */
export const giantMotionSpanOf = (
  aiPhase: string | undefined, skip: readonly string[] = [],
  // ★その立ち絵だけ「当たりの相を持たない技」として扱う追加分(`enemySheets.giantNoActiveExtraFor`)。
  //   撃つ/叩く瞬間が**溜め→立ち直りの境目**にある技で、絵の当たり区間を立ち直りの頭から流すため。
  noActiveExtra: readonly string[] = [],
): SweepSpan | null => {
  if (aiPhase === undefined || !aiPhase.startsWith('g-')) return null;
  if (GIANT_JUMP_TECHS.some(t => aiPhase.startsWith(t))) return null;
  if (skip.some(t => aiPhase.startsWith(t))) return null;
  if (GIANT_WINDUP_SUFFIX.some(x => aiPhase.endsWith(x))) return WINDUP;
  if (GIANT_ACTIVE_SUFFIX.some(x => aiPhase.endsWith(x))) return ACTIVE;
  if (aiPhase.endsWith('-recover')) {
    return GIANT_NO_ACTIVE_TECHS.some(t => aiPhase.startsWith(t))
      || noActiveExtra.some(t => aiPhase.startsWith(t)) ? ACTIVE_RECOVER : RECOVER;
  }
  return null;   // 区間名が付いていない相(台本の繋ぎ等)は出さない
};

/**
 * ★当たり区間を**一定の速さでループ**させた時のコマ番号(`enemySheets.GIANT_ACTIVE_LOOP`)。
 * 相の長さに引き伸ばさない=**どの技でも同じ速さで流れる**。経過が負や非数なら当たりの先頭。
 */
export const sweepActiveLoopFrame = (split: SweepSplit, elapsedMs: number, frameMs: number): number => {
  const n = Math.max(1, split.active);
  const step = Number.isFinite(elapsedMs) && elapsedMs > 0 && frameMs > 0 ? Math.floor(elapsedMs / frameMs) : 0;
  return split.windup + (step % n);
};

/**
 * 区間の範囲(span)ぶんをひと続きに流した時のコマ番号。
 * ★**既存の `sectionFrame` をそのまま使う**——[範囲より前 / 範囲 / 範囲より後] の3つに畳んで
 * 真ん中を引くだけ。新しい割り算を書かない(区間の境目の定義を2箇所に持たない)。
 * ※畳むと `weights` は区間をまたぐので**等分**になる(叩きつけのシートは weights を持たない)。
 *
 * ★★**流し切っても絵を捨てない(最後のコマで持つ)。** 城ボスの戻りは台本で伸び縮みする
 * (`scriptRestMs`)ので絵が先に尽きることがあり、そこで立ち絵へ戻すと**相がまだ続いているのに
 * 構えが解けて背丈も跳ねる**——蜘蛛の跳びで実際に起きた事故(v0.25.4605)と同じ形。
 * 相が明ければ `giantMotionSpanOf` が null を返す=そこで初めて歩き/立ち絵へ戻る。
 * (伐採人・削岩型が使う `enemySweepFrame` の「戻りが1を超えたら null」は**そのまま**。)
 */
export const enemySweepSpanFrame = (
  split: SweepSplit, span: SweepSpan, prog: number,
): number | null => {
  const c = counts(split);
  const idx = (p: SweepPhase): number => (p === 'windup' ? 0 : p === 'active' ? 1 : 2);
  const i0 = idx(span[0]), i1 = idx(span[1]);
  let before = 0, len = 0, after = 0;
  for (let i = 0; i < c.length; i++) {
    if (i < i0) before += c[i];
    else if (i <= i1) len += c[i];
    else after += c[i];
  }
  return sectionFrame([before, len, after], 1, prog);
};

export const sweepPhaseOf = (aiPhase: string | undefined): SweepPhase | null =>
  (aiPhase !== undefined && THREE_PHASE_TECH[aiPhase]) || null;

/**
 * コマ番号を返す。`null` = このシートを出さない(立ち絵/歩きへ戻す)。
 * @param prog その区間の進み具合 0..1。**戻りだけは 1 を超えたら `null`**(=硬直明け)。
 */
export const enemySweepFrame = (
  split: SweepSplit, phase: SweepPhase, prog: number,
): number | null =>
  sectionFrame(counts(split), phase === 'windup' ? 0 : phase === 'active' ? 1 : 2, prog, split.weights);

/** ★当たる瞬間に出る最初のコマ(=薙ぎ区間の先頭)。検査が掟③を押さえるのに使う。 */
export const sweepImpactFrame = (split: SweepSplit): number => split.windup;

/** ★溜めの最後のコマ(=当たる直前に見えている姿)。 */
export const sweepWindupLastFrame = (split: SweepSplit): number => sectionLastFrame(counts(split), 0);

/**
 * ★薙ぎの帯が横向きにどちらへ抜けるか(社長裁定2026-09-23「薙の向きは推薦で」)。
 * `+1`=右へ抜ける / `-1`=左へ / `0`=横成分が小さく判断しない(=従来どおり移動方向に任せる)。
 *
 * なぜ要るか: 薙ぎのシートは**常に同じ向き**(伐採人なら左→右)に描かれているのに、
 * 当たる帯の始点→終点は**プレイヤーの位置で入れ替わる**。薙ぎの最中は本体が動かない(vx≈0)ので、
 * 向きを移動方向から決めている今の配線では**帯と絵が逆を向く**ことが起きる
 * ——「見たまんまが当たり判定」(攻撃ヴィジュアルの2分類①)が崩れる。
 *
 * ★焼き付けた座標(`aiFromX`/`aiTargetX`)から読む。判定の正本と同じ出どころなので、絵と判定がズレない。
 */
export const sweepBandDirX = (
  fromX: number | undefined, toX: number | undefined, deadzonePx = 8,
): -1 | 0 | 1 => {
  if (fromX === undefined || toX === undefined) return 0;
  const d = toX - fromX;
  // 不感帯は**含めて**判断しない(=8pxちょうどは0)。真上/真下へ薙ぐ技で向きが揺れないように。
  if (!Number.isFinite(d) || Math.abs(d) <= deadzonePx) return 0;
  return d > 0 ? 1 : -1;
};

/**
 * ★薙ぎ中のミラー(社長報告2026-09-23「武器の進行方向と逆に振ってる」)。
 *
 * **「絵の振り抜き方向」を「帯の向き」へ揃える**ための倍率を返す(体の向きでは決めない)。
 * 武器スプライトは帯(`aiFrom`→`aiTarget`)の上を進むので、絵の振りが帯と逆だと
 * **逆に振っているように見える**(判定は帯のまま=「見たまんまが当たり判定」が崩れる)。
 *
 * 不変条件: 戻り値を `m` とすると **`swingDir * m === bandDir`**
 * (=画面上で絵が振る向き == 帯の向き)。`enemySweepSheet.test.ts` が見張る。
 *
 * @param bandDir  帯の向き(`sweepBandDirX` の戻り。0=判定できない)
 * @param swingDir 絵の素の振り抜き方向(`sweepSwingDir`)
 * @param fallback 帯の向きが読めない時に保つ今の向き
 */
export const sweepFaceMulFor = (bandDir: -1 | 0 | 1, swingDir: 1 | -1, fallback: number): number =>
  bandDir === 0 ? fallback : (bandDir > 0 ? swingDir : -swingDir as 1 | -1);
