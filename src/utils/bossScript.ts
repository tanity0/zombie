// PACING_PUZZLE.md §6.28 バッチM52: 全ボスのソウル式化=共通基盤(ロットL1)。
// §6.26(城ボス=ジャイアント・M51実装済み)で確立した「予告(windup)/実行(active)/硬直(recover)/
// 待機(idle)」の4チャンネル分解(§6.26-4)と掟W1〜W7(§6.28-3)を、ボス種別に依存しない形へ
// 切り出した共通ヘルパ(純関数のみ・レンダラ/store非依存=giantScript.tsと同じ流儀)。
// L2(ゲート2ボス6体)/L3(裏ボス4体+idol)/L4(物語ボス)の各台本(<boss>Script.ts)はここを土台にする。
//
// 注意(重要): giantScript.ts自体はこのファイルへ依存を追加していない。ジャイアントは既に
// 社長実機評価「いい感じ」を得た実装(§6.26-9で全件裁定済み)なので、1ミリも挙動を変えないために
// あえて据え置いた(CLAUDE.md「仕様変更のルール」)。新規9体の台本(L2/L3/L4)だけがこのファイルを使う想定。
//
// 数値の根拠は PACING_PUZZLE.md §6.26-4/§6.26-5/§6.28-2/§6.28-3/§6.28-13(W1〜W7)を参照。

// ---- 4チャンネル分解: 汎用フェーズ種別 -------------------------------------------------------
// 個々のボスは自分の状態名(例: 'g-stomp-windup'や'harai-windup')を自由に持ってよい。ここでは
// 「その状態名が4チャンネルのどれに属するか」を呼び出し側が申告する形の、状態名リスト方式にする
// (giantScript.tsのGIANT_RANGE/GiantMoveパターンと同じ「呼び出し側が語彙を持ち込む」設計)。
export type BossPhaseKind = 'idle' | 'windup' | 'active' | 'recover';

// W6(§6.28-3・§6.26-4(d)): 硬直中の色=青白固定(全ボス共通の1色)。赤=危険/青白=好機の二色制。
// 既存のジャイアント実装(pixiScene.ts:8479)がハードコードしている値と同一(そちらは無改変のまま
// 据え置く=CLAUDE.md「仕様変更のルール」。新規ボスの描画コードはこの定数を参照すること)。
export const BOSS_RECOVER_TINT = 0xbfe8ff;

// 予告SE(§6.26-9 #5・§6.28-21★4): 素材支給まで全ボス共通で `hunter-alert` を流用する。
// SfxKeyの型はaudioManager.ts側にあるが、文字列そのものをここへ集約して各台本がハードコードで
// 綴りを繰り返さないようにする(差し替え時はここ1箇所を直せば全ボスに効く)。
export const BOSS_ALERT_SFX_KEY = 'hunter-alert' as const;

// PACING_PUZZLE.md §6.28-12(バッチM54/M56/M58/M59・ロットL3): 裏ボス4体(mimir/jormungand/skadi/
// thor)のフォールバックフラグ(`?<boss>script=0`・angelBossTick.tsのscriptFlagと同じ作法)。
// useGameLoop.ts(ロジック)とpixiScene.ts(描画=HPバー色/テレグラフのゲート)の両方が同じ値を
// 参照する単一の出所(ここが分岐すると「ロジックは旧挙動なのに赤テレグラフだけ出る」等の食い違いが起きる)。
const hiddenBossScriptFlag = (name: string): boolean =>
  typeof window === 'undefined' || new URLSearchParams(window.location.search).get(name) !== '0';
export const MIMIR_SCRIPT_ENABLED = hiddenBossScriptFlag('mimirscript');
export const JORMUNGAND_SCRIPT_ENABLED = hiddenBossScriptFlag('jormungandscript');
export const SKADI_SCRIPT_ENABLED = hiddenBossScriptFlag('skadiscript');
export const THOR_SCRIPT_ENABLED = hiddenBossScriptFlag('thorscript');

// 任意のフェーズ文字列が「windup(予告)一覧」に含まれるか。呼び出し側は自分のwindup状態名の
// リストを渡すだけでよい(ボス非依存)。
export const isWindupPhase = (phase: string | undefined, windupPhases: readonly string[]): boolean =>
  phase !== undefined && windupPhases.includes(phase);

// W6: 「硬直(recover)一覧」に含まれるか。true の間、呼び出し側は必ず次の3点を守ること
// (§6.28-13 受け入れ条件7): ①vx=vy=0の完全静止 ②BOSS_RECOVER_TINTで描画 ③次技の抽選をしない。
export const isRecoverPhase = (phase: string | undefined, recoverPhases: readonly string[]): boolean =>
  phase !== undefined && recoverPhases.includes(phase);

// W7(§6.28-3・§6.28-13 #8・§6.28-21★3): カウンター(パリィ)可否の統一判定。
// windup中の接触=可 / active中はその技の判定に委ねる(=ここでは対象外なのでfalseを返す。呼び出し側が
// 個別に判断する) / recover中の接触=可。呼び出し側は「今のフェーズ文字列」と自分のwindup/recover
// 状態名一覧を渡すだけでよい。
export const isCounterablePhase = (
  phase: string | undefined,
  windupPhases: readonly string[],
  recoverPhases: readonly string[],
): boolean => isWindupPhase(phase, windupPhases) || isRecoverPhase(phase, recoverPhases);

// 予告SEのエッジ検知(§6.28-12「連射系は1発目のみ」の一般形)。前フレームのフェーズをuseRef等で
// 保持し、毎フレームこれへ渡す: windupへ切り替わった瞬間だけtrueになる。
// (ジャイアントの既存インライン実装=useGameLoop.ts:6014-6022 の`isGiantWindupNow`比較を一般化した
// もの。giant自体はこの関数へ移行していない=無改変。新規ボスの台本はこちらを使う)。
export const bossWindupJustEntered = (
  prevPhase: string | undefined,
  currentPhase: string | undefined,
  windupPhases: readonly string[],
): boolean => isWindupPhase(currentPhase, windupPhases) && prevPhase !== currentPhase;

// ---- 間合い(帯)の汎用化(GIANT_RANGEパターンの一般形) -----------------------------------------
export interface RangeBand<T extends string> {
  id: T;
  max: number; // この帯の上限距離(px)。bandsAscendingは昇順(maxが小さい順)に並べて渡すこと。
}

// 距離から帯idを求める。どの帯のmaxにも収まらない(最遠帯のmaxを超える)場合はnull。
export const bandForDistance = <T extends string>(
  distance: number,
  bandsAscending: readonly RangeBand<T>[],
): T | null => {
  for (const band of bandsAscending) {
    if (distance <= band.max) return band.id;
  }
  return null;
};

// ---- HPフェーズの汎用化(giantPhaseForHealth/giantPhaseJustChangedのN段階版) --------------------
// thresholdsDescending = フェーズが上がる閾値を降順で並べたもの。
// 例: 2段(ジャイアント相当)なら[0.6]。3段(スカジ/トール/アクラシエル等)なら[0.7, 0.35]。
// healthFracがその値以下になるたびフェーズ+1(1始まり)。
export const phaseForHealth = (healthFrac: number, thresholdsDescending: readonly number[]): number => {
  let phase = 1;
  for (const threshold of thresholdsDescending) {
    if (healthFrac <= threshold) phase++;
  }
  return phase;
};

// フェーズが「今フレームで切り替わった瞬間」かどうか(HPバー点滅トリガー判定用)。初回
// (prevPhase未設定=初期化前)は「変わった」扱いにしない=ラン開始直後に誤発火させない
// (giantPhaseJustChangedと同じ作法。N段階でもそのまま使える=数値比較のみ)。
export const phaseJustChanged = (prevPhase: number | undefined, nextPhase: number): boolean =>
  prevPhase !== undefined && prevPhase !== nextPhase;

// ---- 技の抽選(pickGiantMove/pickGiantComboの一般形) -------------------------------------------
// 条件を満たす候補から等確率で1つ(giantScript.tsのpickGiantMoveと同じ作法=該当技が無ければnull)。
export const pickEligibleMove = <T>(
  candidates: readonly T[],
  eligible: (move: T) => boolean,
  rand: () => number = Math.random,
): T | null => {
  const pool = candidates.filter(eligible);
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
};

// Phase2以降限定などの確率つき追撃(pickGiantComboの一般形)。followupTableは「直前技→追撃技」の
// 対応表(Partial=許可した組み合わせだけ書く。§6.26-9 #8「3組以上は作らない」を各台本側で守ること)。
export const pickComboFollowup = <T extends string>(
  justFinished: T,
  followupTable: Partial<Record<T, T>>,
  chance: number,
  eligibleForFollowup: (move: T) => boolean,
  rand: () => number = Math.random,
): T | null => {
  const followup = followupTable[justFinished];
  if (followup === undefined) return null;
  if (!eligibleForFollowup(followup)) return null; // 「まだその技の間合いに居るなら」等の呼び出し側判定
  return rand() < chance ? followup : null;
};

// ---- BOT_AND_GHOST.md G1/G2: ボス非依存の「カウンター可能っぽい」概算判定 -----------------------
// isCounterablePhase(上)が正本の判定(呼び出し側=各<boss>Script.ts/useGameLoopが自分のwindup/recover
// 状態名リストを渡す)なのに対し、こちらは**プレイヤー実測(playerTraits.ts)とゴーストの疑似反応
// (ghostDriver.ts)専用**の概算。両者は「多少ズレても実害がない」用途(計測値/AIの参考挙動)なので、
// 11ボスぶんのwindup/recover名リストをここへ複製せず、命名規約(新API=語尾'-windup'/'-recover')+
// 旧API(giantbat以前からある汎用aiPhase: charge/recover/crouch/jump)で概算する。
// ★未決(BOT_AND_GHOST.md参照): 正確な判定にしたいなら各<boss>Script.tsのCOUNTER_WINDUPS/RECOVERS
// をここへ集約する再設計が要る(本バッチのスコープ外)。特に giantbat は combatTick.ts の
// dashParried 判定が 'windup' 語尾ではなく個別の active/recover 名リストを見ているため、
// この概算は giantbat の windup 中を「機会あり」と数える点で実際の当たり判定より広め(=過大評価)。
export const isBossCounterableNowApprox = (
  aiPhase: string | undefined,
  bossState: string | undefined,
): boolean => {
  const suffixHit = (s: string): boolean => s.endsWith('-windup') || s.endsWith('-recover');
  const ph = aiPhase ?? '';
  const bs = bossState ?? '';
  const legacyHit = ph === 'charge' || ph === 'recover' || ph === 'crouch' || ph === 'jump' || ph === 'g-jump-air';
  return suffixHit(ph) || suffixHit(bs) || legacyHit;
};
