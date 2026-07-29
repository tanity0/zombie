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

import { phaseForHealth } from './bossScript';

export type GiantMove = 'stomp' | 'sweep' | 'jump' | 'dash' | 'bolt';
// Phase3は§6.28-11でstoryBoss(グレン/未確認変異体)専用に追加された上位フェーズ。
// 通常城ボスはgiantPhaseForHealth(無改変)しか呼ばないため、実際には1|2までしか出ない。
export type GiantPhase = 1 | 2 | 3;

// 間合いの帯(px・中心間距離)。6.26-6の表で確定した最終値(由来はgameStore.ts側の定数から導出済み)。
export const GIANT_RANGE = {
  MELEE_MAX: 140,   // 密着 0〜140
  NEAR_MAX: 320,    // 近 140〜320
  MID_MAX: 620,     // 中 320〜620
  FAR_MAX: 1000,    // 遠 620〜1000
  JUMP_MAX: 700,    // 飛び掛かりの上限(近〜中 140〜700)
} as const;

// フェーズ移行のHP閾値(社長裁定6.26-9 #4で60%のまま据え置き)。
export const GIANT_PHASE_HP_THRESHOLD = 0.6;

export const giantPhaseForHealth = (healthFrac: number): 1 | 2 =>
  healthFrac <= GIANT_PHASE_HP_THRESHOLD ? 2 : 1;

// フェーズが「今フレームで切り替わった瞬間」かどうか(HPバー点滅のトリガー判定に使う)。
// 初回(prevPhase未設定=初期化前)は「変わった」扱いにしない=ラン開始直後に誤発火させない。
// (M60: 型をGiantPhaseへ広げただけ。単純な数値比較なので3が来ても挙動は変わらない。)
export const giantPhaseJustChanged = (prevPhase: GiantPhase | undefined, nextPhase: GiantPhase): boolean =>
  prevPhase !== undefined && prevPhase !== nextPhase;

// 各技の間合い適格判定(6.26-6 状態機械の抽選条件と同一)。CD(readyAt)は呼び出し側(gameStore.ts)が
// 個別に持つタイムスタンプで判定するため、ここでは「間合い」と「フェーズ」だけを見る。
// (M60: phaseの型をGiantPhaseへ広げ、sweepをphase>=2へ緩和。phase∈{1,2}での出力は無改変
//  =通常城ボスは今までどおりphase===2の時だけsweepが解禁される。phase===3はstoryBoss専用で、
//  「Phase2で解禁された技はPhase3でも消えない」という原則⑥(6.28-2-2)どおりsweepを維持する。)
export const giantMoveEligible = (move: GiantMove, distance: number, phase: GiantPhase): boolean => {
  switch (move) {
    case 'stomp': return distance <= GIANT_RANGE.MELEE_MAX;
    case 'sweep': return (phase === 2 || phase === 3) && distance > GIANT_RANGE.MELEE_MAX && distance <= GIANT_RANGE.NEAR_MAX;
    case 'jump':  return distance > GIANT_RANGE.MELEE_MAX && distance <= GIANT_RANGE.JUMP_MAX;
    case 'dash':  return distance > GIANT_RANGE.NEAR_MAX && distance <= GIANT_RANGE.FAR_MAX;
    case 'bolt':  return distance > GIANT_RANGE.NEAR_MAX && distance <= GIANT_RANGE.MID_MAX;
    default: return false;
  }
};

const ALL_MOVES: GiantMove[] = ['stomp', 'sweep', 'jump', 'dash', 'bolt'];

// 間合い+フェーズ+CD明けの技から等確率で1つ選ぶ(既存スケジューラ gameStore.ts:7338-7339 と同じ作法)。
// 該当技が無ければ null(=通常チェイスへフォールスルー)。(M60: phase型のみGiantPhaseへ拡張。)
export const pickGiantMove = (
  distance: number,
  phase: GiantPhase,
  ready: Record<GiantMove, boolean>,
  rand: () => number = Math.random,
): GiantMove | null => {
  const pool = ALL_MOVES.filter(m => ready[m] && giantMoveEligible(m, distance, phase));
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
};

// Phase2限定の2連携(社長裁定6.26-9 #8): 許す組み合わせは2つのみ。
// 「相手がまだその技の間合いに居るなら」確率40%でもう1発だけ続ける。
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
  if (!giantMoveEligible(followup, distance, phase)) return null; // 「まだその技の間合いに居るなら」
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
): GiantMove | null => {
  const followup = GIANT_STORY_PHASE3_FOLLOWUP[justFinished];
  if (!followup) return null;
  if (!giantMoveEligible(followup, distance, 3)) return null; // 「まだその技の間合いに居るなら」
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

// 5技(既存・無改変)+ステージ固有の独自技(Phase1から)/大技(Phase2以上のみ)を対象にした統合抽選。
// 複数該当したら等確率で1つ(既存pickGiantMoveと同じ作法)。stageIdに技が定義されていなければ
// 実質pickGiantMoveと同じ結果になる(=stage-6/7/ex1・未知ステージは無改変)。
// 既存pickGiantMove自体はこの関数から呼ばず、ALL_MOVESの絞り込みをここでも独立に行う
// (=pickGiantMoveの挙動・テストに一切触れない。別名の新関数として追加)。
export const pickGiantMoveWithStage = (
  stageId: string,
  distance: number,
  phase: GiantPhase,
  ready: Record<GiantMove, boolean>,
  stageReady: Partial<Record<GiantStageMoveId, boolean>>,
  rand: () => number = Math.random,
): GiantMove | GiantStageMoveId | null => {
  const pool: (GiantMove | GiantStageMoveId)[] = ALL_MOVES.filter(m => ready[m] && giantMoveEligible(m, distance, phase));
  const uniqueMove = GIANT_STAGE_UNIQUE_MOVE[stageId];
  if (uniqueMove && (stageReady[uniqueMove] ?? false) && giantStageMoveEligible(uniqueMove, distance)) pool.push(uniqueMove);
  const ultMove = GIANT_STAGE_ULT_MOVE[stageId];
  if (ultMove && phase >= 2 && (stageReady[ultMove] ?? false) && giantStageMoveEligible(ultMove, distance)) pool.push(ultMove);
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
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

export type GlenMoveId = 'talon' | 'boon' | 'reach' | 'nihil';
const GLEN_MOVES: GlenMoveId[] = ['talon', 'boon', 'reach', 'nihil'];

// 間合い(px・中心間距離)。PACING_PUZZLE.md §6.26-12の表の明記どおり。nihilのみ「全帯」
// (大技=距離では絞らない。解禁自体は下のpickGiantMoveWithGlenでPhase2ゲートする)。
export const GLEN_MOVE_RANGE: Record<GlenMoveId, { min: number; max: number }> = {
  talon: { min: 140, max: 420 },
  boon: { min: 320, max: 900 },
  reach: { min: 420, max: 1000 },
  nihil: { min: 0, max: Infinity },
};

export const glenMoveEligible = (move: GlenMoveId, distance: number): boolean => {
  const r = GLEN_MOVE_RANGE[move];
  return distance >= r.min && distance <= r.max;
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

// 既存5技(stomp/sweep/jump/dash/bolt・pickGiantMove無改変=このプールもALL_MOVESを独立に再絞り込み
// するだけで既存関数は呼ばない・触らない)+グレン専用4技の統合抽選。複数該当したら等確率で1つ
// (既存pickGiantMove/pickGiantMoveWithStageと同じ作法)。
// nihilだけPhase2(HP60%)以上でのみ候補に入る(表の「解禁」列)。talon/boon/reachはPhase1から常時
// 候補(原則⑥=Phase2/3でも消えない。M60が既にsweepで確立した扱いをここでも踏襲)。
export const pickGiantMoveWithGlen = (
  distance: number,
  phase: GiantPhase,
  ready: Record<GiantMove, boolean>,
  glenReady: Record<GlenMoveId, boolean>,
  rand: () => number = Math.random,
): GiantMove | GlenMoveId | null => {
  const pool: (GiantMove | GlenMoveId)[] = ALL_MOVES.filter(m => ready[m] && giantMoveEligible(m, distance, phase));
  for (const move of GLEN_MOVES) {
    if (move === 'nihil' && phase < 2) continue;
    if (glenReady[move] && glenMoveEligible(move, distance)) pool.push(move);
  }
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
};

// 虚無の三唱(nihil)の学習点④「数える」: 詠唱回数は常に3固定(乱数にしない・quaddashの
// GIANT_QUAD_DASH_COUNTと同じ精神)。gameStore.ts側はg-nihil-chant1→chant2→chant3という3つの
// 明示ステートを固定シーケンスで遷移する実装にした(SFXのエッジ検知=aiPhase文字列の変化が
// そのまま3回のパルスになるようにするため。quaddashのようなindexカウンタは使わない)。
// この定数は回数が3であることをテストで固定するためのもの(状態機械のケース数と一致させること)。
export const GLEN_NIHIL_CHANT_COUNT = 3;
