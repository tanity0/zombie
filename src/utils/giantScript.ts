// PACING_PUZZLE.md §6.26 バッチM51: 城ボス「ジャイアント」の行動・攻撃パターン改訂。
// 「間合い/CD/HP段階から次の技を選ぶ」purely-functionな判断ロジック(実装精度の規律4)。
// レンダラ非依存・store非依存(gameStore.ts からのみ import される。逆import禁止=循環回避)。
// 数値の根拠(帯の由来/リード秒数/裁定内容)は PACING_PUZZLE.md §6.26-5/6.26-6/6.26-9 を参照。
// 実効(実時間)msの定数はこのファイル側に置き、gameStore.ts 側で ENEMY_ATTACK_SPEED_MULT を
// 掛けて atkUntil() 用の生値に変換する(このファイル自体は攻撃倍速の概念を知らない=純粋)。
//
// ==== M60追記(PACING_PUZZLE.md §6.28-11・ロットL4) ====
// Phase1/2向けの5関数(giantPhaseForHealth/giantPhaseJustChanged/giantMoveEligible/
// pickGiantMove/pickGiantCombo)は、通常ステージ(1〜6)の城ボスが今も使っている「社長実機評価
// 済み」の実装。CLAUDE.md「仕様変更のルール」に従い、Phase1/2の挙動が1ミリも変わらないことを
// 最優先に、下記の方針で拡張した:
//  ・giantPhaseForHealth / GIANT_COMBO_FOLLOWUP / GIANT_COMBO_CHANCE / pickGiantCombo は無改変
//    (Phase3はstoryBoss個体だけが到達する上位フェーズなので、別関数として「上に積む」)。
//  ・giantPhaseJustChanged / giantMoveEligible / pickGiantMove は phase の型を 1|2 → GiantPhase
//    (1|2|3)へ広げたが、phase∈{1,2}の入力に対する出力は一切変えていない(3は今までのコードから
//    絶対に来ない値だったので、新しい枝を1つ足しただけ=既存の到達可能な入力領域では無改変)。
//  ・Phase3専用の新規ロジック(giantPhaseForHealthStory/pickGiantStoryCombo等)はファイル末尾に集約。
//
// ==== BOSS_RANGE_REWORK.md追記(社長裁定v0.25.2455「城の重みづけはそれで」) ====
// 基本5技(stomp/sweep/jump/dash/bolt)の距離ハードゲートを「距離ゾーン別の重み付き抽選」へ再設計。
// ゾーン=密着0-120/近120-300/中300-600/遠600+(上限なし)、重み表=GIANT_MOVE_WEIGHTS(1箇所)。
// followupの「まだその技の間合いに居るなら」は「そのゾーンの重み>0」へ読み替え(意味を保存する最小変更)。
// CD・連携(followup)の構造・ステージ独自技(GIANT_STAGE_MOVE_RANGE)・グレン技(GLEN_MOVE_RANGE)・
// フェーズ制約(sweep=P2+/nihil=P2+)・trijump・移動AIは不変。上のM60の「無改変」の記述は
// M60時点の経緯の記録として残す(本リワークで抽選方式そのものが変わった)。

import { phaseForHealth } from './bossScript';

export type GiantMove = 'stomp' | 'sweep' | 'jump' | 'dash' | 'bolt';
// Phase3は§6.28-11でstoryBoss(グレン/未確認変異体)専用に追加された上位フェーズ。
// 通常城ボスはgiantPhaseForHealth(無改変)しか呼ばないため、実際には1|2までしか出ない。
export type GiantPhase = 1 | 2 | 3;

// 間合いのゾーン境界(px・中心間距離)。BOSS_RANGE_REWORK.md(社長裁定v0.25.2455)で距離ハードゲート
// (旧6.26-6の表: 密着140/近320/中620/遠上限1000/飛び掛かり上限700)を廃止し、
// 「密着0-120 / 近120-300 / 中300-600 / 遠600+」の4ゾーン×重み表(GIANT_MOVE_WEIGHTS)へ再設計した。
// 遠ゾーンに上限は無い(旧FAR_MAX/JUMP_MAXの上限は撤廃=「重み0」がハードゲートの後継。
// 引き撃ちで完全に安全な距離が構造的に存在しないようにする)。
export const GIANT_RANGE = {
  MELEE_MAX: 120, // 密着 0〜120
  NEAR_MAX: 300,  // 近 120〜300
  MID_MAX: 600,   // 中 300〜600(これを超えたら「遠」・上限なし)
} as const;

// 距離→ゾーン。境界は旧giantMoveEligibleと同じ「上限は含む(<=)」の作法。
export type GiantZone = 'melee' | 'near' | 'mid' | 'far';
export const giantZoneForDistance = (distance: number): GiantZone =>
  distance <= GIANT_RANGE.MELEE_MAX ? 'melee'
  : distance <= GIANT_RANGE.NEAR_MAX ? 'near'
  : distance <= GIANT_RANGE.MID_MAX ? 'mid'
  : 'far';

// フェーズ移行のHP閾値(社長裁定6.26-9 #4で60%のまま据え置き)。
export const GIANT_PHASE_HP_THRESHOLD = 0.6;

export const giantPhaseForHealth = (healthFrac: number): 1 | 2 =>
  healthFrac <= GIANT_PHASE_HP_THRESHOLD ? 2 : 1;

// フェーズが「今フレームで切り替わった瞬間」かどうか(HPバー点滅のトリガー判定に使う)。
// 初回(prevPhase未設定=初期化前)は「変わった」扱いにしない=ラン開始直後に誤発火させない。
// (M60: 型をGiantPhaseへ広げただけ。単純な数値比較なので3が来ても挙動は変わらない。)
export const giantPhaseJustChanged = (prevPhase: GiantPhase | undefined, nextPhase: GiantPhase): boolean =>
  prevPhase !== undefined && prevPhase !== nextPhase;

// ==== 基本5技×距離ゾーンの重み表(BOSS_RANGE_REWORK.md確定表・社長裁定v0.25.2455「城の重みづけはそれで」) ====
// 重み0=その距離では出ない(ハードゲートと同じ意味)。数字はこの表1箇所だけで管理し、
// バランス調整は表の差し替えだけで済むようにする(数字を勝手に変えない=CLAUDE.md仕様変更ルール)。
// sweepの「Phase2+で解禁」は表ではなくgiantMoveWeight側で維持する(重みはフェーズと独立)。
export const GIANT_MOVE_WEIGHTS: Record<GiantMove, Record<GiantZone, number>> = {
  stomp: { melee: 50, near: 15, mid: 0,  far: 0 },
  sweep: { melee: 25, near: 35, mid: 5,  far: 0 },
  jump:  { melee: 10, near: 30, mid: 40, far: 20 },
  bolt:  { melee: 15, near: 20, mid: 40, far: 10 },
  dash:  { melee: 0,  near: 0,  mid: 15, far: 70 },
};

// ★ステージ7(ラスボス)の「無限ジャンプ」(社長指示v0.25.2420「無限ジャンプで実質逃げれないように
// する」)の保険。理由: **ステージ7は雑魚が出ない**ので、走って逃げれば完全に安全な時間が作れてしまい、
// 回復して戻る=消耗戦が成立する。どこまで逃げても飛んで追ってくる=逃げ切れない。**予告(赤い着地円)は
// 従来どおり出る**ので理不尽にはならない。現行の重み表ではjumpは全ゾーン重み>0なので実挙動には出ないが、
// 将来表からjumpの重みを消してもstage-7が跳べなくならないよう、unlimitedJump=trueの時はjumpの実効重みを
// 全ゾーンでこの床(>0)に保証する。
export const GIANT_UNLIMITED_JUMP_WEIGHT_FLOOR = 1;

// 技×距離×フェーズ→実効重み。0=出ない。CD(readyAt)は従来どおり呼び出し側(gameStore.ts)が見る。
// sweepのPhase2+解禁(6.26-9・M60の原則⑥=Phase3でも消えない)はここで維持する。
// weightsを注入可能にしてあるのはunlimitedJumpガードのテストのため(既定は確定表)。
export const giantMoveWeight = (
  move: GiantMove,
  distance: number,
  phase: GiantPhase,
  unlimitedJump = false,
  weights: Record<GiantMove, Record<GiantZone, number>> = GIANT_MOVE_WEIGHTS,
): number => {
  if (move === 'sweep' && phase < 2) return 0; // sweepはPhase2で解禁(従来どおり)
  const w = weights[move][giantZoneForDistance(distance)];
  if (move === 'jump' && unlimitedJump && w <= 0) return GIANT_UNLIMITED_JUMP_WEIGHT_FLOOR;
  return w;
};

// 各技の適格判定=「現在ゾーンの重み>0」(旧ハードゲートの後継・BOSS_RANGE_REWORK.mdの読み替え)。
// followup系(pickGiantCombo/pickGiantStoryCombo)の「まだその技の間合いに居るなら」判定もこの関数
// 経由なので、同じ読み替えが自動的に効く(意味を保存する最小変更)。
// (M60: phaseの型をGiantPhaseへ広げ、sweepをphase>=2へ緩和——phase===3はstoryBoss専用で、
//  「Phase2で解禁された技はPhase3でも消えない」という原則⑥(6.28-2-2)どおりsweepを維持する。)
export const giantMoveEligible = (
  move: GiantMove, distance: number, phase: GiantPhase,
  unlimitedJump = false,
): boolean => giantMoveWeight(move, distance, phase, unlimitedJump) > 0;

const ALL_MOVES: GiantMove[] = ['stomp', 'sweep', 'jump', 'dash', 'bolt'];

// 重み比例で1つ選ぶ(重み付きルーレット)。乱数は既存の流儀に合わせて注入可能(テストのため)。
// rand()が1.0ちょうどを返す端の数値誤差は最後の候補に落とす(旧実装のMath.min(...)と同旨の安全網)。
type GiantWeighted<T> = { move: T; weight: number };
const pickWeighted = <T,>(entries: GiantWeighted<T>[], rand: () => number): T | null => {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  if (total <= 0) return null;
  let r = rand() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r < 0) return e.move;
  }
  return entries[entries.length - 1].move;
};

// 使用可能(CD明け=ready)かつ現在ゾーンの重み>0の技から、重み比例で1つ選ぶ
// (BOSS_RANGE_REWORK.md・旧「等確率」から変更)。該当技が無ければ null(=通常チェイスへフォールスルー)。
export const pickGiantMove = (
  distance: number,
  phase: GiantPhase,
  ready: Record<GiantMove, boolean>,
  rand: () => number = Math.random,
): GiantMove | null => {
  const entries: GiantWeighted<GiantMove>[] = ALL_MOVES
    .map(m => ({ move: m, weight: ready[m] ? giantMoveWeight(m, distance, phase) : 0 }))
    .filter(e => e.weight > 0);
  return pickWeighted(entries, rand);
};

// Phase2限定の2連携(社長裁定6.26-9 #8): 許す組み合わせは2つのみ。
// 「相手がまだその技の間合いに居るなら」確率40%でもう1発だけ続ける。
// (BOSS_RANGE_REWORK.md: 「間合いに居る」=そのゾーンの重み>0、へ読み替え。連携の構造・確率は不変。)
export const GIANT_COMBO_FOLLOWUP: Partial<Record<GiantMove, GiantMove>> = {
  sweep: 'stomp',
  dash: 'stomp',
};
export const GIANT_COMBO_CHANCE = 0.4;

export const pickGiantCombo = (
  justFinished: GiantMove,
  phase: 1 | 2,
  distance: number,
  rand: () => number = Math.random,
): GiantMove | null => {
  if (phase !== 2) return null;
  const followup = GIANT_COMBO_FOLLOWUP[justFinished];
  if (!followup) return null;
  if (!giantMoveEligible(followup, distance, phase)) return null; // 「まだその技の間合いに居るなら」=そのゾーンの重み>0
  return rand() < GIANT_COMBO_CHANCE ? followup : null;
};

// ============================================================================================
// M60(PACING_PUZZLE.md §6.28-11・ロットL4): グレン(stage-7)/未確認変異体(stage-ex1)専用のPhase3。
// 通常城ボス(stage-1〜6)はgameStore.ts側で isStoryBoss !== true のためこれらの関数を一切呼ばない
// (呼び出し箇所は gameStore.ts のジャイアント新スクリプトブロックの isStoryBoss 分岐のみ)。
// ============================================================================================

// フェーズ移行のHP閾値(社長裁定6.28-21★2「足す」・§6.28-11 #1「HP30%以下」)。
// 30%は既存 drawHealthBar の赤しきい値(pct<0.3)と一致=新しい数字を発明しない。
// 60%は通常ジャイアントの GIANT_PHASE_HP_THRESHOLD と同値(Phase1→2の閾値はstoryBossでも変えない)。
export const GIANT_STORY_PHASE_THRESHOLDS = [GIANT_PHASE_HP_THRESHOLD, 0.3] as const;

// bossScript.ts の phaseForHealth(N段階汎用)をそのまま使う(新形式を発明しない)。
// healthFrac<=0.6でPhase2、<=0.3でPhase3、それ以外はPhase1——通常ジャイアントの2段判定と
// 60%の境界で完全に一致する(検証は giantScript.test.ts)。
export const giantPhaseForHealthStory = (healthFrac: number): GiantPhase =>
  phaseForHealth(healthFrac, GIANT_STORY_PHASE_THRESHOLDS) as GiantPhase;

// Phase3限定の3発目(社長裁定6.28-11 #2「薙ぎ払い→踏み鳴らし→突進」の3発目=踏み鳴らしの後に突進)。
// 既存2組(GIANT_COMBO_FOLLOWUP=sweep→stomp/dash→stomp)はPhase3でも生きたまま(原則⑥=フェーズは
// 技を減らさない)なので、それを土台に3発目のリンクだけを足す。
export const GIANT_STORY_PHASE3_FOLLOWUP: Partial<Record<GiantMove, GiantMove>> = {
  ...GIANT_COMBO_FOLLOWUP,
  stomp: 'dash',
};

// 連携確率(社長裁定6.28-11 #3「頻度だけを上げる」+ #EX注記「stage-ex1だけ60%→70%」)。
export const GIANT_STORY_COMBO_CHANCE_PHASE3 = 0.6;    // グレン(stage-7)
export const GIANT_STORY_COMBO_CHANCE_PHASE3_EX = 0.7; // 未確認変異体(stage-ex1・クリア後コンテンツ)

// Phase3(storyBossのみ到達)の追撃選択。既存pickGiantComboは `phase!==2` で弾く専用実装のため
// 呼び出し側(gameStore.ts)がPhase3の時だけこちらを使う(Phase1/2はpickGiantComboのまま=無改変)。
export const pickGiantStoryCombo = (
  justFinished: GiantMove,
  distance: number,
  isEx: boolean,
  rand: () => number = Math.random,
  // 無限ジャンプ(社長指示v0.25.2420)。ここは storyBoss 専用の追撃なので抽選側(pickGiantMoveWithGlen)
  // と**同じ既定**にする。片方だけ上限が残っていると「初撃は飛んでくるのに追撃だけ届かない」という
  // 不一致になる(同じ判定を2箇所に書いて片方だけ直す事故の典型)。
  unlimitedJump = true,
): GiantMove | null => {
  const followup = GIANT_STORY_PHASE3_FOLLOWUP[justFinished];
  if (!followup) return null;
  if (!giantMoveEligible(followup, distance, 3, unlimitedJump)) return null; // 「まだその技の間合いに居るなら」=そのゾーンの重み>0
  const chance = isEx ? GIANT_STORY_COMBO_CHANCE_PHASE3_EX : GIANT_STORY_COMBO_CHANCE_PHASE3;
  return rand() < chance ? followup : null;
};

// ============================================================================================
// M65(社長指示): ステージが進むほど城ボスの「範囲と速度」を少しずつ厳しくするステージ別倍率。
// 対象は社長指示で明示された3つだけ(踏み鳴らしAoE半径/飛び掛かり着地AoE半径/突進速度)。
// リード(windup/recover/CDの各ms)・ダメージ・HP・巡航速度・図形の意味は一切変えない。
// 既存 src/utils/stageAggro.ts(PACING_REDESIGN.mdバッチ6)と同じ「明示表+未定義は安全側フォール
// バック」の作法に揃えた。ステージIDの出どころは既存の getSelectedStageId()(src/data/progress)。
//
// 「ステージ2から」という社長指示だが、ステージ2(研究所)は潜入ステージで城ボス自体が出ない
// (useGameLoop.ts の `!labTheme` ゲートで城ボスのスポーンを止めている)。よってこの表は
// 「ステージ1を実機合格済みの基準として据え置き、城ボスが実際に出る次のステージ(3)から段階的に
// 上げる」と解釈する(=実際に最初に変わるのはステージ3)。
// ============================================================================================
const GIANT_STAGE_RANGE_MULT: Record<string, number> = {
  'stage-1': 1.00, // 社長が実機で「いい感じ」と合格させた基準。絶対に変えない(CLAUDE.md「仕様変更のルール」)
  'stage-3': 1.10,
  'stage-4': 1.20,
  'stage-5': 1.30,
  'stage-6': 1.40,
  // グレン(storyBoss)は当たり判定込み2倍化(useGameLoop.ts)されている個体だが、それは本体サイズの
  // 話でstomp/jumpのAoE半径は敵の中心からの絶対pxなので独立=単純にこの1.50倍だけが乗る(重複しない)。
  'stage-7': 1.50,
  'stage-ex1': 1.50, // 未確認変異体(storyBoss)。段10=最終
};

// storyBossはstage-7/stage-ex1でしか出現しない(useGameLoop.tsのstoryBossスポーン経路)ため、
// 上の表がステージIDだけで既にstoryBoss判定を包含している=isStoryBossを別引数にする必要が無い。
// enabled=false(`?giantstage=0`相当)で全ステージ1.00に固定=フォールバック。呼び出し側(gameStore.ts)が
// URLパラメータを読んでここへ渡す(このファイル自体はwindow/URLを知らない=純粋性を保つ)。
export const giantStageRangeMult = (stageId: string, enabled: boolean = true): number => {
  if (!enabled) return 1;
  return GIANT_STAGE_RANGE_MULT[stageId] ?? 1; // 未知/未定義のステージIDは安全側の1.00
};

// 生値は gameStore の攻撃速度倍率1.2を通るため、1080msで実効900msになる。
export const GIANT_REBUILD_REST_RAW_MS = 1080;
export const giantRestRawMs = (stageId: string, rawMs: number): number =>
  stageId === 'stage-1' ? rawMs : Math.max(rawMs, GIANT_REBUILD_REST_RAW_MS);

// ============================================================================================
// M66(社長指示・PACING_PUZZLE.md §6.26-11): 城ボスのステージ別「独自技」(Phase1から)+
// 「大技」(Phase2=HP60%から)。stage-1/3/4/5にだけ1組ずつ足す(社長指示で明示された対象=城ボスが
// 実際に出る4ステージのみ。stage-6/7/ex1には足さない=表に定義しないことで自然にゲートする)。
// 既存5技(stomp/sweep/jump/dash/bolt)の値・pickGiantMove/giantMoveEligible自体は無改変のまま
// (このファイルの既存exportに一切手を入れていない)。実際の*_MSタイマー/px定数はgameStore.ts側
// (atkUntil経由でENEMY_ATTACK_SPEED_MULTを掛ける・既存GIANT_STOMP_WINDUP_MS等と同じ流儀)に置く。
// `?giantunique=0`(GIANT_UNIQUE_ENABLED・gameStore.ts側)で本節を丸ごと無効化=today's 5技のみに戻る。
// トレース元(ソウルシリーズ)・学習装置①②③の割当・裁定はPACING_PUZZLE.md §6.26-11参照。
// ============================================================================================

export type GiantStageMoveId = 'bite' | 'slam' | 'glide' | 'dive' | 'quaddash' | 'nova' | 'wing' | 'sweepbeam';

// ステージ→独自技(Phase1から)。表に無いステージ(stage-6/7/ex1・未知ID)はundefined=追加なし。
export const GIANT_STAGE_UNIQUE_MOVE: Partial<Record<string, GiantStageMoveId>> = {
  'stage-1': 'bite', 'stage-3': 'glide', 'stage-4': 'quaddash', 'stage-5': 'wing',
};
// ステージ→大技(Phase2=HP60%からのみ解禁)。
export const GIANT_STAGE_ULT_MOVE: Partial<Record<string, GiantStageMoveId>> = {
  'stage-1': 'slam', 'stage-3': 'dive', 'stage-4': 'nova', 'stage-5': 'sweepbeam',
};

// 間合い(px・中心間距離)。bite/slam/glideは設計書の明記どおり。dive/quaddash/nova/wing/sweepbeamは
// 設計書に間合いの明記が無いため「全帯」を採用した(スカジのice/blade=全帯と同じ扱い方・§6.28-9。
// 実装精度の規律7条に基づく叩き台=最終報告に明記)。
export const GIANT_STAGE_MOVE_RANGE: Record<GiantStageMoveId, { min: number; max: number }> = {
  bite: { min: 0, max: 180 },
  slam: { min: 140, max: 420 },
  glide: { min: 320, max: 900 },
  dive: { min: 0, max: Infinity },
  quaddash: { min: 0, max: Infinity },
  nova: { min: 0, max: Infinity },
  wing: { min: 0, max: Infinity },
  sweepbeam: { min: 0, max: Infinity },
};

export const giantStageMoveEligible = (move: GiantStageMoveId, distance: number): boolean => {
  const r = GIANT_STAGE_MOVE_RANGE[move];
  return distance >= r.min && distance <= r.max;
};

// ステージ技の混ぜ方の基準。stage-1だけは旧仕様の1/(n+k)を厳密に保存する。
// 再構築対象(stage-3以降)はこの平均値へ個性倍率を掛け、固有技が飾りにならないようにする。
const stageMixWeight = <T,>(basicEntries: GiantWeighted<T>[]): number =>
  basicEntries.length > 0
    ? basicEntries.reduce((sum, e) => sum + e.weight, 0) / basicEntries.length
    : 1;

// 再構築: 通常5技は共通語彙として残し、各ステージの「顔」だけを明確に前へ出す。
// stage-1は倍率1.0で従来の当選率を厳密に維持する。HP・判定・技の秒数には触れない。
export const GIANT_STAGE_SPECIAL_WEIGHT_MULT: Partial<Record<string, Partial<Record<GiantStageMoveId, number>>>> = {
  'stage-1': { bite: 1, slam: 1 },
  'stage-3': { glide: 1.6, dive: 2.2 },
  'stage-4': { quaddash: 1.8, nova: 2.1 },
  'stage-5': { wing: 1.7, sweepbeam: 2.2 },
};

export const GIANT_STAGE_BASE_WEIGHT_MULT: Partial<Record<string, Record<GiantMove, number>>> = {
  // stage-1は表に置かない=全て1.0。実機でちょうどよい現行抽選を完全に保持する。
  'stage-3': { stomp: 0.6, sweep: 0.8, jump: 1.4, dash: 1.2, bolt: 0.8 },
  'stage-4': { stomp: 1.2, sweep: 1.25, jump: 0.8, dash: 1.1, bolt: 0.6 },
  'stage-5': { stomp: 0.7, sweep: 1.2, jump: 0.7, dash: 0.8, bolt: 1.4 },
  'stage-ex1': { stomp: 1.1, sweep: 1.25, jump: 1.45, dash: 1.5, bolt: 1.25 },
};

export const giantStageBaseWeightMult = (stageId: string, move: GiantMove): number =>
  GIANT_STAGE_BASE_WEIGHT_MULT[stageId]?.[move] ?? 1;

export const giantStageSpecialWeightMult = (stageId: string, move: GiantStageMoveId): number =>
  GIANT_STAGE_SPECIAL_WEIGHT_MULT[stageId]?.[move] ?? 1;

// 5技(距離ゾーン別の重み付き抽選=BOSS_RANGE_REWORK.md)+ステージ固有の独自技(Phase1から)/
// 大技(Phase2以上のみ)を対象にした統合抽選。ステージ技の範囲表(GIANT_STAGE_MOVE_RANGE)・CD・
// フェーズゲートは不変。stageIdに固有技が無ければ基本5技だけだが、stage-ex1は追撃型の比重へ変わる。
export const pickGiantMoveWithStage = (
  stageId: string,
  distance: number,
  phase: GiantPhase,
  ready: Record<GiantMove, boolean>,
  stageReady: Partial<Record<GiantStageMoveId, boolean>>,
  rand: () => number = Math.random,
): GiantMove | GiantStageMoveId | null => {
  const entries: GiantWeighted<GiantMove | GiantStageMoveId>[] = ALL_MOVES
    .map(m => ({
      move: m as GiantMove | GiantStageMoveId,
      weight: ready[m] ? giantMoveWeight(m, distance, phase) * giantStageBaseWeightMult(stageId, m) : 0,
    }))
    .filter(e => e.weight > 0);
  const extraWeight = stageMixWeight(entries);
  const uniqueMove = GIANT_STAGE_UNIQUE_MOVE[stageId];
  if (uniqueMove && (stageReady[uniqueMove] ?? false) && giantStageMoveEligible(uniqueMove, distance)) {
    entries.push({ move: uniqueMove, weight: extraWeight * giantStageSpecialWeightMult(stageId, uniqueMove) });
  }
  const ultMove = GIANT_STAGE_ULT_MOVE[stageId];
  if (ultMove && phase >= 2 && (stageReady[ultMove] ?? false) && giantStageMoveEligible(ultMove, distance)) {
    entries.push({ move: ultMove, weight: extraWeight * giantStageSpecialWeightMult(stageId, ultMove) });
  }
  return pickWeighted(entries, rand);
};

// stage-4「三連突進→氷の横薙ぎ」の学習装置③(回数で読ませる)。回数は常に3固定=乱数にしない
// (社長裁定の核心)。indexJustFinished(0始まり)が2(=3回目)を終えたら次へ進む。
export const GIANT_QUAD_DASH_COUNT = 3;
export const giantQuadDashComplete = (indexJustFinished: number): boolean => indexJustFinished + 1 >= GIANT_QUAD_DASH_COUNT;

// stage-4「三連突進→氷の横薙ぎ」が薙いだ跡に残す遅延起爆の氷の個数(固定3・学習装置①の氷版)。
export const GIANT_QUAD_ICE_COUNT = 3;

// ============================================================================================
// M67(社長指示・PACING_PUZZLE.md §6.26-12「ステージ7は別格として技のバリエーションを組んで。
// ラスボスなので。しかもここは雑魚いないので。」): グレン(stage-7)専用の新技4つ。
// 対象は isStoryBoss===true && storyBossVariant==='stage-7' の個体だけ(glenScriptApplies=門番)。
// stage-ex1(未確認変異体)には一切効かせない(§6.28-11の裁定どおりEXはM60のPhase3のみ据え置き)。
// 通常ステージ(1〜6)の城ボスにも一切効かない(isStoryBossが立たないため、この節のどの関数も
// 呼ばれる経路自体が無い)。既存5技(stomp/sweep/jump/dash/bolt)・M60のPhase3(3連携)は無改変。
// トレース元(Mohg, Lord of Blood)・学習点・叩き台の根拠は PACING_PUZZLE.md §6.26-12 を参照。
// `?glenscript=0`(GLEN_SCRIPT_ENABLED・gameStore.ts側)で本節を丸ごと無効化=今日までのグレン
// (既存5技のみ)に戻る。
// ============================================================================================

export type GlenMoveId = 'talon' | 'boon' | 'reach' | 'nihil' | 'trijump';
const GLEN_MOVES: GlenMoveId[] = ['talon', 'boon', 'reach', 'nihil', 'trijump'];

// 連続ジャンプ(社長指示v0.25.2430「ジャンプ着地後すぐに次のジャンプ、3回連続」)。
// **回数は3固定**(乱数にしない)。これは §6.28 の学習装置③「回数で読ませる」の実装で、
// 三連突進(GIANT_QUAD_DASH_COUNT=3)・虚無の三唱(GLEN_NIHIL_CHANT_COUNT=3)と同じ一族。
// 「3回目で終わる」と学習できることが技の価値になる。
export const GLEN_TRIJUMP_COUNT = 3;
// 3つの着地点は**溜め開始でまとめてロック**する(社長裁定)。着地ごとに取り直すと「追ってくる」に
// なってしまい、§6.28-3の「何が・どこには嘘をつかない、変えるのは"いつ"だけ」に反する。
// まとめてロックなら3つの赤い円が最初から全部見えている=**見て全部避けるパズル**になる。
// 配置: 1発目=プレイヤーの現在地 / 2・3発目=そこを中心に半径×TRIJUMP_SPREAD の距離で 120° ずつ
// 回した位置(=三つ葉)。基準角はボス→プレイヤーの向き(乱数を使わない=同じ状況なら同じ形が出る)。
export const GLEN_TRIJUMP_SPREAD = 1.45; // 着地円の半径に対する散らばり(1.0=円が接する / 1.45=隙間ができる)

// 間合い(px・中心間距離)。PACING_PUZZLE.md §6.26-12の表の明記どおり。nihilのみ「全帯」
// (大技=距離では絞らない。解禁自体は下のpickGiantMoveWithGlenでPhase2ゲートする)。
export const GLEN_MOVE_RANGE: Record<GlenMoveId, { min: number; max: number }> = {
  talon: { min: 140, max: 420 },
  boon: { min: 320, max: 900 },
  reach: { min: 420, max: 1000 },
  nihil: { min: 0, max: Infinity },
  // 連続ジャンプは「離れたら飛んで詰める」技。密着では出さない(踏み鳴らし等の近接技の領分)。
  trijump: { min: 200, max: Infinity },
};

/**
 * 連続ジャンプの着地点3つ(溜め開始で確定・以後不変)。
 * 純関数にしてあるのは、**判定側(gameStore)と描画側(pixiScene)が同じ値を読む**ため
 * ——同じ計算を2箇所に書くと必ず片方だけズレる(v0.25.2383/2387/2389 で3回起きた型)。
 */
export const glenTriJumpPoints = (
  bossCx: number, bossCy: number, playerCx: number, playerCy: number, radius: number,
): { x: number; y: number }[] => {
  const base = Math.atan2(playerCy - bossCy, playerCx - bossCx);
  const d = radius * GLEN_TRIJUMP_SPREAD;
  const pts = [{ x: playerCx, y: playerCy }];
  for (let i = 1; i < GLEN_TRIJUMP_COUNT; i++) {
    const a = base + (i * 2 * Math.PI) / GLEN_TRIJUMP_COUNT;
    pts.push({ x: playerCx + Math.cos(a) * d, y: playerCy + Math.sin(a) * d });
  }
  return pts;
};

export const glenMoveEligible = (move: GlenMoveId, distance: number): boolean => {
  const r = GLEN_MOVE_RANGE[move];
  return distance >= r.min && distance <= r.max;
};

// 最終戦では専用技が「たまに混ざる飾り」にならないよう、役割ごとに比重を持たせる。
// 基本5技だけがreadyの時は従来抽選と完全一致する。
export const GLEN_SPECIAL_WEIGHT_MULT: Record<GlenMoveId, number> = {
  talon: 1.4,
  boon: 1.25,
  reach: 1.5,
  nihil: 1.8,
  trijump: 1.6,
};

// この個体が「グレン専用スクリプト」の対象かどうかの門番(社長指示「対象はstage-7のグレンだけ」)。
// isStoryBoss/storyBossVariantはuseGameLoop.tsのstoryBossスポーン経路でのみ立つため、通常城ボス
// (stage-1〜6)は常にisStoryBoss===undefinedでfalseを返す。stage-ex1(未確認変異体)も
// storyBossVariant==='stage-ex1'なのでfalseを返す(=M60のPhase3のみのまま。§6.28-11の裁定を継承)。
export const glenScriptApplies = (
  isStoryBoss: boolean | undefined,
  storyBossVariant: 'stage-7' | 'stage-ex1' | undefined,
  enabled: boolean,
): boolean => enabled && isStoryBoss === true && storyBossVariant === 'stage-7';

// 既存5技(距離ゾーン別の重み付き抽選=BOSS_RANGE_REWORK.md)+グレン専用4技の統合抽選。
// グレン技の範囲表(GLEN_MOVE_RANGE)・CD・nihilのPhase2ゲートは不変で、混ぜ方はstageMixWeight
// (旧等確率の当選率1/(n+k)を保存・pickGiantMoveWithStageと同じ規則)。
// nihilだけPhase2(HP60%)以上でのみ候補に入る(表の「解禁」列)。talon/boon/reachはPhase1から常時
// 候補(原則⑥=Phase2/3でも消えない。M60が既にsweepで確立した扱いをここでも踏襲)。
export const pickGiantMoveWithGlen = (
  distance: number,
  phase: GiantPhase,
  ready: Record<GiantMove, boolean>,
  glenReady: Record<GlenMoveId, boolean>,
  rand: () => number = Math.random,
  // 無限ジャンプ(社長指示v0.25.2420)。グレン=ステージ7専用の抽選関数なので既定でON。
  // ?glenjump=0 相当のフォールバックが要る時は呼び出し側から false を渡す。
  // (新重み表ではjumpは全ゾーン重み>0なので実挙動には出ないが、将来表を変えた時の保険として
  //  giantMoveWeightのGIANT_UNLIMITED_JUMP_WEIGHT_FLOORガードへ配線を残す。)
  unlimitedJump = true,
): GiantMove | GlenMoveId | null => {
  const entries: GiantWeighted<GiantMove | GlenMoveId>[] = ALL_MOVES
    .map(m => ({ move: m as GiantMove | GlenMoveId, weight: ready[m] ? giantMoveWeight(m, distance, phase, unlimitedJump) : 0 }))
    .filter(e => e.weight > 0);
  const extraWeight = stageMixWeight(entries);
  for (const move of GLEN_MOVES) {
    if (move === 'nihil' && phase < 2) continue;
    if (glenReady[move] && glenMoveEligible(move, distance)) {
      entries.push({ move, weight: extraWeight * GLEN_SPECIAL_WEIGHT_MULT[move] });
    }
  }
  return pickWeighted(entries, rand);
};

// 虚無の三唱(nihil)の学習点④「数える」: 詠唱回数は常に3固定(乱数にしない・quaddashの
// GIANT_QUAD_DASH_COUNTと同じ精神)。gameStore.ts側はg-nihil-chant1→chant2→chant3という3つの
// 明示ステートを固定シーケンスで遷移する実装にした(SFXのエッジ検知=aiPhase文字列の変化が
// そのまま3回のパルスになるようにするため。quaddashのようなindexカウンタは使わない)。
// この定数は回数が3であることをテストで固定するためのもの(状態機械のケース数と一致させること)。
export const GLEN_NIHIL_CHANT_COUNT = 3;
