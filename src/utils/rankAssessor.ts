// PACING_PUZZLE.md バッチM2: ランク査定+コマ内の盤面目標ランプ+リアルタイム緩急。
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(src/utils)。
//
// 責務分離(実装精度の規律4): このファイルは「今の盤面目標・基本CD・ランクは何か」だけを扱う。
// 実際に何を湧かせるか(型の選び方・邪魔者/特別枠の構成)はscriptPuzzle.ts(M3)の責務。

export type PuzzleRank = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const BASE_CAP = 10;      // R1〜R6の盤面上限(憲法第1条: 基本10)
export const R7_CAP_MIN = 10;
export const R7_CAP_MAX = 20;    // 憲法第1条の天井20と一致
export const R7_CAP_STEP = 2;    // R7中の上限成長/縮小の刻み(叩き台)

export const clampRank = (r: number): PuzzleRank => Math.max(1, Math.min(7, Math.round(r))) as PuzzleRank;

// ---- 持続状態(コマをまたいで引き継ぐ) ----------------------------------------------------

export interface PuzzleClockState {
  rank: PuzzleRank;
  r7Cap: number;          // R7中だけ意味を持つ(10..20)。R1〜R6ではBASE_CAP固定。
  boardTarget: number;    // 盤面の目標数(コマをまたいで引き継ぐ・毎分リセットしない)
  belowTargetMs: number;  // 「盤面数<目標」の連続継続時間(ms)。追いついたら0へ(リアルタイム締めトリガー用)。
  msSinceRampMs: number;  // 直近の目標+1からの経過ms(ランプ間隔判定用)。
  minRank?: number;       // ラン中の降格の絶対下限(社長決定v0.25.1988)。省略=1(全体下限)。開始最低ランクの1つ下=stageInRunFloorRank で与える。
}

export const createPuzzleClockState = (): PuzzleClockState => ({
  rank: 1, r7Cap: R7_CAP_MIN, boardTarget: 1, belowTargetMs: 0, msSinceRampMs: 0, minRank: 1,
});

export const capForState = (state: PuzzleClockState): number => (state.rank === 7 ? state.r7Cap : BASE_CAP);

// ---- 3-D: CD基準値(ランク別・叩き台) --------------------------------------------------

// R1=1.0s〜R6=0.25s。R7は0.1sだが、上限成長がR7_CAP_MAXに達したらCD0(最恐形)。
const CD_BASIS_MS: Record<PuzzleRank, number> = { 1: 1000, 2: 850, 3: 700, 4: 550, 5: 400, 6: 250, 7: 100 };

export const cdBasisForRank = (rank: PuzzleRank, r7Cap: number): number =>
  (rank === 7 && r7Cap >= R7_CAP_MAX) ? 0 : CD_BASIS_MS[rank];

// §0.5攻略性の原則: この基本CD(チャフの補充テンポ)は締め/成長でどこまでも縮められるが、
// 邪魔者・特別枠自体の投入CD(3秒・scriptPuzzle.ts側)は締めても絶対に縮めない(仕様どおり)。
// v0.25.1386(M6実装時の仕様適合修正): §3-D「①基本CDを1ランク上の基準値へ締める(R7中は0へ)」——
// M2実装ではR7の締めをbasis(7)のままにしていたが、仕様の字義どおり0へ(最恐形)。
export const cdBasisTightened = (rank: PuzzleRank, r7Cap: number): number => {
  if (rank === 7) return 0; // §3-D: R7中の締めはCD0へ
  return cdBasisForRank(Math.min(7, rank + 1) as PuzzleRank, r7Cap);
};

// ---- 3-A/3-D: 毎フレームの目標ランプ+リアルタイム緩急 --------------------------------

export const RAMP_INTERVAL_NORMAL_MS = 6000;
export const RAMP_INTERVAL_TIGHT_MS = 4000;
export const RAMP_NO_HIT_HOLD_MS = 10000;   // 直近10秒に被弾があれば目標を増やさない(据え置き)
export const TIGHTEN_NO_HIT_MS = 15000;     // 締めトリガー: 直近15秒無被弾
export const TIGHTEN_PERF_MIN = 0.6;
export const TIGHTEN_STARVE_MS = 15000;     // 締めトリガー: 盤面<目標が15秒継続

export interface ClockTickInput {
  dtMs: number;
  msSinceLastHit: number; // 直近被弾からの経過ms(被弾した瞬間に0へ戻る前提・AIディレクター本体と同じ計測)
  perf: number;           // 0..1のパフォーマンス指標(AIディレクターのperformanceを想定)
  boardCount: number;     // 現在の盤面数(パズル管理下の敵のみ)
}

export interface ClockTickResult {
  state: PuzzleClockState;
  tightened: boolean; // このフレームが締め状態か(永続しない・毎回この入力から導出)
  cdMs: number;        // 実効基本CD(ms)。tightened時は1ランク上の基準値。
}

export const tickPuzzleClock = (state: PuzzleClockState, input: ClockTickInput): ClockTickResult => {
  const cap = capForState(state);
  const belowTargetMs = input.boardCount < state.boardTarget ? state.belowTargetMs + input.dtMs : 0;
  const tightened = input.msSinceLastHit >= TIGHTEN_NO_HIT_MS
    && (input.perf >= TIGHTEN_PERF_MIN || belowTargetMs >= TIGHTEN_STARVE_MS);
  const rampIntervalMs = tightened ? RAMP_INTERVAL_TIGHT_MS : RAMP_INTERVAL_NORMAL_MS;
  const canIncrease = input.msSinceLastHit >= RAMP_NO_HIT_HOLD_MS;

  let boardTarget = state.boardTarget;
  let msSinceRampMs = state.msSinceRampMs + input.dtMs;
  if (!canIncrease) {
    msSinceRampMs = 0; // 被弾直後は足踏み。無被弾に戻ってからフルの間隔を待つ。
  } else if (msSinceRampMs >= rampIntervalMs) {
    if (boardTarget < cap) boardTarget += 1;
    msSinceRampMs = 0;
  }

  const cdMs = tightened ? cdBasisTightened(state.rank, state.r7Cap) : cdBasisForRank(state.rank, state.r7Cap);
  return { state: { ...state, boardTarget, belowTargetMs, msSinceRampMs }, tightened, cdMs };
};

// ---- 3-B/3-C: コマ境界(60秒ごと)の査定 ------------------------------------------------

export interface KomaAssessmentInput {
  capReached: boolean; // コマ中にboardTargetが上限へ到達した瞬間があったか
  perfAvg: number;
  intensAvg: number;
  dmgRatio: number;    // このコマの被ダメ合計 ÷ maxHealth
  starveRatio: number; // このコマ中「盤面数<目標」だった時間の割合(0..1)
  /**
   * このコマの被弾**回数**(計測専用)。**任意扱いにしてあるのは意図的**で、
   * 「査定(assessKomaDelta / combineCycleDelta)はこの値を読まない=無くても判定が成立する」
   * ことを型で表明している。スコア制への作り替えを検討するための実測データ用(社長指示v0.25.2356)。
   */
  hits?: number;
}

export type RankDelta = 1 | 0 | -1;

// 「上限体験に耐えるスコアなら昇格」の機械化。両方の条件が同時に成立し得る場合(高ダメージ域は
// 重ならないが、低dmgRatio×高intensAvgはあり得る)は降格側を優先する(第5条「ピンチに撃たない」の
// 精神=危険シグナルが出ている時は昇格させない安全側の判定順)。
// 【裁定v0.25.1387】昇格式修正: capReached必須のままだと、補充より速く刈る最速プレイヤーは
// 盤面が目標に届かず永遠に昇格できない(starveRatio経路の存在意義と自己矛盾)。「盤面が埋まった
// 状態を余裕で捌いた」(capReached∧perfAvg)と「埋まる暇がないほど速く刈った」(starveRatio)の
// どちらも圧の試験合格として扱う。R7の上限成長判定もこの式を共有する。
export const assessKomaDelta = (input: KomaAssessmentInput): RankDelta => {
  if (input.dmgRatio >= 0.60 || input.intensAvg >= 0.85) return -1;
  if (input.dmgRatio < 0.35 && ((input.capReached && input.perfAvg >= 0.45) || input.starveRatio >= 0.4)) return 1;
  return 0;
};

// R7中の解釈(社長承認済み・PACING_PUZZLE.md裁定済み記録): 「耐えられない」判定はまず上限を
// -2(下限10)で吸収し、上限が既に下限にいる状態でさらに耐えられない判定が出た時だけ実際にR6へ
// 降格する。新規にR7へ昇格した瞬間は上限を10からやり直す。
// M6(§4-C 2段査定): 確定デルタは検証査定側で合成する(combineCycleDelta)ため、デルタ適用だけを
// 独立させたのがapplyRankDelta。applyKomaAssessmentは旧1段査定の互換ラッパー(挙動不変)。
export const applyRankDelta = (state: PuzzleClockState, delta: RankDelta): PuzzleClockState => {
  // ラン中の降格の絶対下限(社長決定v0.25.1988): 開始最低ランクの1つ下まで(minRank・省略=1)。
  // R7の上限成長やR7→R6降格は minRank(最大でも4)より常に上なので、非R7経路の降格だけを下限で止める。
  const floor = state.minRank ?? 1;
  if (state.rank === 7) {
    if (delta === 1) return { ...state, r7Cap: Math.min(R7_CAP_MAX, state.r7Cap + R7_CAP_STEP) };
    if (delta === -1) {
      if (state.r7Cap > R7_CAP_MIN) return { ...state, r7Cap: Math.max(R7_CAP_MIN, state.r7Cap - R7_CAP_STEP) };
      return { ...state, rank: 6, r7Cap: R7_CAP_MIN, boardTarget: Math.min(state.boardTarget, BASE_CAP) };
    }
    return state;
  }
  const nextRank = clampRank(Math.max(floor, state.rank + delta));
  if (nextRank === 7) return { ...state, rank: nextRank, r7Cap: R7_CAP_MIN }; // state.rank!==7はここまでで確定済み
  return { ...state, rank: nextRank };
};

export const applyKomaAssessment = (state: PuzzleClockState, input: KomaAssessmentInput): PuzzleClockState =>
  applyRankDelta(state, assessKomaDelta(input));

// ---- M6(§4-C): 2段査定の確定規則 -------------------------------------------------------
// 通常コマ終わりの仮査定(assessKomaDelta)を、ピークコマの実績で検証して確定する:
//   昇格 = 仮査定が昇格 かつ ピークでも耐えた(dmgRatio<0.35)
//   降格 = どちらかのコマで降格級(dmgRatio>=0.60 または intensAvg>=0.85)
//     ※通常コマ側の降格級は仮査定-1と同値(assessKomaDeltaは降格を最優先で判定するため)。
//   それ以外 = 維持。
export const isDemoteGrade = (input: KomaAssessmentInput): boolean =>
  input.dmgRatio >= 0.60 || input.intensAvg >= 0.85;

export const combineCycleDelta = (provisional: RankDelta, peakInput: KomaAssessmentInput): RankDelta => {
  if (provisional === -1 || isDemoteGrade(peakInput)) return -1;
  if (provisional === 1 && peakInput.dmgRatio < 0.35) return 1;
  return 0;
};

// ---- M6(§3-D改訂): 下げ方向=全コマ常時の「多少緩め」 -----------------------------------
// 「辛そう」検知: 直近10秒の被ダメ>=maxHealthの15% / 直近10秒のIntensity平均>=0.85 / HP<=30%。
// 緩め=目標-20%(下限3)+基本CD×1.5の1段のみ。解除=無被弾10秒(かつ検知条件が消えている)で基準へ。
// ※HP<=30%が続く限り緩めは維持される(無被弾10秒だけで解除するとHP条件で即再発動して点滅するため、
//   「解除=無被弾10秒」と検知条件の両立をラッチで実装。実装解釈=★裁定済み記録参照)。
// 直近10秒の集計は1秒×10バケツのリングで近似(per-frame配列生成なし・負荷1/10)。
export const SOFTEN_WINDOW_MS = 10000;
export const SOFTEN_DMG_FRAC = 0.15;
export const SOFTEN_INTENS_MIN = 0.85;
export const SOFTEN_HP_FRAC = 0.3;
export const SOFTEN_RELEASE_NO_HIT_MS = 10000;
export const SOFTEN_TARGET_MULT = 0.8;
export const SOFTEN_TARGET_MIN = 3;

const SOFTEN_BUCKETS = 10;

export interface SoftenState {
  dmgFrac: number[];    // バケツごとの被ダメ(maxHealth比)合計
  intensDt: number[];   // バケツごとのIntensity×dt積分
  dt: number[];         // バケツごとの経過ms
  cursorMs: number;     // 現バケツ内の経過ms(1000msで次バケツへローテート)
  idx: number;
  softened: boolean;
}

export const createSoftenState = (): SoftenState => ({
  dmgFrac: new Array(SOFTEN_BUCKETS).fill(0),
  intensDt: new Array(SOFTEN_BUCKETS).fill(0),
  dt: new Array(SOFTEN_BUCKETS).fill(0),
  cursorMs: 0, idx: 0, softened: false,
});

export interface SoftenTickInput {
  dtMs: number;
  dmgFracThisFrame: number; // このフレームの被ダメ ÷ maxHealth
  intensity: number;
  hpFrac: number;
  msSinceLastHit: number;
}

export const stepSoften = (prev: SoftenState, input: SoftenTickInput): SoftenState => {
  const s: SoftenState = { ...prev, dmgFrac: [...prev.dmgFrac], intensDt: [...prev.intensDt], dt: [...prev.dt] };
  // バケツのローテート(dtが大きい時は複数バケツ分進める)。
  s.cursorMs += input.dtMs;
  while (s.cursorMs >= SOFTEN_WINDOW_MS / SOFTEN_BUCKETS) {
    s.cursorMs -= SOFTEN_WINDOW_MS / SOFTEN_BUCKETS;
    s.idx = (s.idx + 1) % SOFTEN_BUCKETS;
    s.dmgFrac[s.idx] = 0; s.intensDt[s.idx] = 0; s.dt[s.idx] = 0;
  }
  s.dmgFrac[s.idx] += input.dmgFracThisFrame;
  s.intensDt[s.idx] += input.intensity * input.dtMs;
  s.dt[s.idx] += input.dtMs;
  const dmg10s = s.dmgFrac.reduce((a, b) => a + b, 0);
  const dtSum = s.dt.reduce((a, b) => a + b, 0);
  const intensAvg10s = dtSum > 0 ? s.intensDt.reduce((a, b) => a + b, 0) / dtSum : 0;
  const detect = dmg10s >= SOFTEN_DMG_FRAC || intensAvg10s >= SOFTEN_INTENS_MIN || input.hpFrac <= SOFTEN_HP_FRAC;
  s.softened = detect || (prev.softened && input.msSinceLastHit < SOFTEN_RELEASE_NO_HIT_MS);
  return s;
};

// ---- コマ集計(呼び出し側が毎フレーム足し込み、コマ境界でfinalizeしてapplyKomaAssessmentへ渡す) ----

export interface KomaAccumulatorState {
  perfMsSum: number;
  intensMsSum: number;
  weightMs: number;
  dmgTaken: number;
  /**
   * 被弾「回数」(社長指示v0.25.2356・**計測専用**)。ダメージが入ったフレームを1回と数える。
   * `INVULN_MS=700` の無敵時間があるので、これは**別々の被弾**とほぼ一致する(最大1.4回/秒)。
   * ※現時点では査定(assessKomaDelta)は**この値を一切見ない**=挙動は完全に不変。
   *   ランク査定をスコア制へ作り替えるための実測データを取るためだけに集計している。
   */
  hits: number;
  capReached: boolean;
  belowTargetMsThisKoma: number;
  komaDurationMs: number;
}

export const createKomaAccumulator = (): KomaAccumulatorState => ({
  perfMsSum: 0, intensMsSum: 0, weightMs: 0, dmgTaken: 0, hits: 0, capReached: false, belowTargetMsThisKoma: 0, komaDurationMs: 0,
});

export interface KomaAccumulatorTickInput {
  dtMs: number;
  perf: number;
  intensity: number;
  dmgTakenThisFrame: number;
  boardCount: number;
  boardTarget: number;
  cap: number;
}

// M6(v0.25.1386)でcapReachedの意味を再解釈: 旧「target(ランプ)が上限へ到達」→
// 「盤面数がそのコマの目標(cap引数=コマ総目標)へ実際に到達した瞬間があった」。
// §4-Cのコマ別固定目標では旧字義(通常コマ目標=上限の50%が上限10に届く)が成立し得ないため
// (★裁定済み記録参照)。「意図した圧を実際に経験した上での査定」という趣旨は不変。
export const stepKomaAccumulator = (acc: KomaAccumulatorState, input: KomaAccumulatorTickInput): KomaAccumulatorState => ({
  perfMsSum: acc.perfMsSum + input.perf * input.dtMs,
  intensMsSum: acc.intensMsSum + input.intensity * input.dtMs,
  weightMs: acc.weightMs + input.dtMs,
  dmgTaken: acc.dmgTaken + Math.max(0, input.dmgTakenThisFrame),
  hits: acc.hits + (input.dmgTakenThisFrame > 0 ? 1 : 0), // 無敵700msがあるので「ダメージが入ったフレーム」=1被弾
  capReached: acc.capReached || input.boardCount >= input.cap,
  belowTargetMsThisKoma: acc.belowTargetMsThisKoma + (input.boardCount < input.boardTarget ? input.dtMs : 0),
  komaDurationMs: acc.komaDurationMs + input.dtMs,
});

export const finalizeKomaAssessmentInput = (acc: KomaAccumulatorState, maxHealth: number): KomaAssessmentInput => {
  const dur = Math.max(1, acc.komaDurationMs);
  return {
    capReached: acc.capReached,
    perfAvg: acc.weightMs > 0 ? acc.perfMsSum / acc.weightMs : 0,
    intensAvg: acc.weightMs > 0 ? acc.intensMsSum / acc.weightMs : 0,
    dmgRatio: maxHealth > 0 ? acc.dmgTaken / maxHealth : 0,
    starveRatio: acc.belowTargetMsThisKoma / dur,
    hits: acc.hits,
  };
};

// ---- §5.17-追補(M18で実装): 昇格度スコア(惜しさ指標の差し替え) --------------------------
// 旧「あと1昇格だった」(常に真=情報量ゼロ)の代わりに、既存の昇格判定式(assessKomaDelta)を
// 「ライン=100」へ正規化した連続指標で見せる。**判定バランスは変えない=表示の翻訳のみ**
// (assessKomaDeltaの数値・分岐は一切変更しない。このセクションは読むだけの純関数)。
export type PromotionBottleneck = 'damage' | 'throughput' | 'starve';

export interface PromotionScoreResult {
  total: number;       // 0..PROMOTION_DISPLAY_CAP にクランプした表示用の総合昇格度
  damage: number;       // 被ダメスコア(クランプ前)
  throughput: number;   // 処理スコア(capReached時のみ有効・非到達時は0)
  starve: number;       // 速刈りスコア
  bottleneck: PromotionBottleneck; // 総合を決めている(=足を引っ張っている)項目
}

// 表示の頭打ち(社長承認v0.25.1508: 「上限は120程度で頭打ち表示」)。
export const PROMOTION_DISPLAY_CAP = 120;

export const PROMOTION_BOTTLENECK_LABEL: Record<PromotionBottleneck, string> = {
  damage: '被ダメ',
  throughput: '処理',
  starve: '速刈り',
};

// 正規化式(PACING_PUZZLE.md §5.17-追補の表と1対1):
//   被ダメスコア = 100 × (0.60 − dmgRatio) ÷ 0.25   (0=降格ライン60%被弾 / 100=昇格ライン35%)
//   処理スコア   = 100 × perfAvg ÷ 0.45              (capReached時のみ有効)
//   速刈りスコア = 100 × starveRatio ÷ 0.4
//   総合         = min(被ダメ, max(capReached ? 処理 : 0, 速刈り))
// これは assessKomaDelta の「dmgRatio<0.35 ∧ ((capReached∧perfAvg>=0.45) ∨ starveRatio>=0.4)」と
// 「総合>=100 ⇔ 昇格」でほぼ等価(dmgRatio=0.35ちょうどの境界のみ、assessKomaDeltaの厳密な
// `<` と本式の `>=100`(=dmgRatio<=0.35)がズレる。降格側(intensAvg>=0.85/dmgRatio>=0.60)は
// 「昇格度」に混ぜない=本関数は読まない(§5.17-追補: 意味が濁るため)。
export const promotionScore = (input: KomaAssessmentInput): PromotionScoreResult => {
  const damage = Math.max(0, 100 * (0.60 - input.dmgRatio) / 0.25);
  const throughput = Math.max(0, input.capReached ? 100 * input.perfAvg / 0.45 : 0);
  const starve = Math.max(0, 100 * input.starveRatio / 0.4);
  const route = Math.max(throughput, starve);
  const totalRaw = Math.min(damage, route);
  const bottleneck: PromotionBottleneck = damage <= route ? 'damage' : (throughput >= starve ? 'throughput' : 'starve');
  return {
    total: Math.max(0, Math.min(PROMOTION_DISPLAY_CAP, totalRaw)),
    damage, throughput, starve, bottleneck,
  };
};

// ---- M50(PACING_PUZZLE.md §6.27): 連続査定=「捌けているか」一本化 -----------------------
// コマ境界での離散査定(上のassessKomaDelta/combineCycleDelta)をやめ、常時2つの量だけで判定する。
// 社長設計v0.25.2360。既存の assessKomaDelta / combineCycleDelta / isDemoteGrade は削除しない
// (査定の経路から外すだけ。既存テストとリザルトの「昇格度」表示 promotionScore が読み続ける)。
//
//   昇格: 10秒窓(RANK_WINDOW_MS)ごとに撃破数を見て、V(rank)以上だった窓が総窓数の半分以上
//         (最低RANK_MIN_WINDOWS=6窓=60秒からしか判定しない)。
//   降格: 直近HIT_RECENCY_MS(3秒)以内に被弾がある「被弾中」状態が、途切れずDEMOTE_STREAK_MS
//         (8秒)続いた。「何発食らったか」ではなく「何秒抜け出せなかったか」。
//   ステイ: どちらでもない。
//   ランク変更(昇格・降格どちらでも)で窓カウンタ・被弾ストリークを全てリセットする
//   (新しいランクは新しい証拠で評価する)。
//
// 配線は src/utils/directorTick.ts(store/Reactに触らないのはこのファイルの責務のまま)。

export const RANK_WINDOW_MS = 10000;   // 昇格判定の窓の長さ
export const RANK_MIN_WINDOWS = 6;     // これ未満の窓数(60秒未満)ではサンプル不足として判定しない
export const HIT_RECENCY_MS = 3000;    // これ以内に被弾があれば「被弾中」とみなす
export const DEMOTE_STREAK_MS = 8000;  // 「被弾中」が途切れず続いたら降格するまでの時間

// V(r) = RANK_KILLS_PER_WINDOW_BASE × (1000 / cdBasisForRank(r))。
// ★仮値(係数=2)。人間の実測で較正するまでの叩き台(PACING_PUZZLE.md §6.27「★仮値」参照)。
// 1箇所の名前つき定数として持つ=後で係数を差し替える時はここだけ変える。
export const RANK_KILLS_PER_WINDOW_BASE = 2;

// R7でr7CapがR7_CAP_MAXへ到達しCD=0になった場合、「これ以上速くは湧かない」=到達不能な目標として
// 扱う(Infinity=windowsClearingが増えず昇格しないだけ。r7Capは既にR7_CAP_MAXまで成長済みで実害なし)。
export const rankKillTarget = (rank: PuzzleRank, r7Cap: number): number => {
  const cdBasis = cdBasisForRank(rank, r7Cap);
  return cdBasis > 0 ? RANK_KILLS_PER_WINDOW_BASE * (1000 / cdBasis) : Infinity;
};

// ---- 昇格: 撃破の「窓」を数える(整数2つを持つだけ・中央値も履歴も不要) -----------------

export interface RankWindowState {
  windowElapsedMs: number; // 現在進行中の窓の経過ms
  killsInWindow: number;   // 現在進行中の窓の撃破数
  windowsAtRank: number;   // このランクに来てから閉じた窓の総数
  windowsClearing: number; // そのうち「窓内の撃破数 >= V(rank)」だった窓の数
}

export const createRankWindowState = (): RankWindowState => ({
  windowElapsedMs: 0, killsInWindow: 0, windowsAtRank: 0, windowsClearing: 0,
});

export interface RankWindowTickInput {
  dtMs: number;
  killsThisFrame: number; // このtickで倒した数(enemiesKilledのフレーム差分・呼び出し側で計算)
  rank: PuzzleRank;
  r7Cap: number;
}

export interface RankWindowTickResult {
  state: RankWindowState;
  // このtickで窓が閉じ、かつ「windowsAtRank>=RANK_MIN_WINDOWS ∧ windowsClearing>=半分(切り上げ)」
  // を満たした(=昇格条件成立)。
  promote: boolean;
}

export const stepRankWindow = (state: RankWindowState, input: RankWindowTickInput): RankWindowTickResult => {
  let windowElapsedMs = state.windowElapsedMs + input.dtMs;
  let killsInWindow = state.killsInWindow + Math.max(0, input.killsThisFrame);
  let windowsAtRank = state.windowsAtRank;
  let windowsClearing = state.windowsClearing;
  let promote = false;
  // dtMsが窓長を超える希な大フレームでも複数窓ぶん進める(既存stepSoftenのバケツ回転と同じ作法)。
  while (windowElapsedMs >= RANK_WINDOW_MS) {
    windowElapsedMs -= RANK_WINDOW_MS;
    windowsAtRank += 1;
    if (killsInWindow >= rankKillTarget(input.rank, input.r7Cap)) windowsClearing += 1;
    killsInWindow = 0;
    promote = windowsAtRank >= RANK_MIN_WINDOWS && windowsClearing >= Math.ceil(windowsAtRank / 2);
  }
  return { state: { windowElapsedMs, killsInWindow, windowsAtRank, windowsClearing }, promote };
};

// ---- 降格: 「抜け出せなかった時間」を測る(発数ではなく秒数) -----------------------------

export interface HitStreakState {
  // 「被弾中」(直近HIT_RECENCY_MS以内に被弾がある)が途切れず継続している時間。
  streakMs: number;
}

export const createHitStreakState = (): HitStreakState => ({ streakMs: 0 });

export interface HitStreakTickInput {
  dtMs: number;
  msSinceLastHit: number; // 直近被弾からの経過ms(既存のdmgTakenThisFrame由来・呼び出し側で計算済み)
}

export interface HitStreakTickResult {
  state: HitStreakState;
  demote: boolean; // このtickで「被弾中」の連続継続がDEMOTE_STREAK_MSへ達した
}

export const stepHitStreak = (state: HitStreakState, input: HitStreakTickInput): HitStreakTickResult => {
  const beingHit = input.msSinceLastHit < HIT_RECENCY_MS;
  const streakMs = beingHit ? state.streakMs + input.dtMs : 0; // 3秒以内に次の被弾が無ければ即リセット
  return { state: { streakMs }, demote: streakMs >= DEMOTE_STREAK_MS };
};

// ---- 合成: 毎tick呼ぶ本体(昇格・降格を1つにまとめ、ランク変更時は自動リセット) --------------

export interface RankPaceState {
  window: RankWindowState;
  hitStreak: HitStreakState;
}

export const createRankPaceState = (): RankPaceState => ({
  window: createRankWindowState(),
  hitStreak: createHitStreakState(),
});

export interface RankPaceTickInput {
  dtMs: number;
  killsThisFrame: number;
  msSinceLastHit: number;
  rank: PuzzleRank;
  r7Cap: number;
  /**
   * ボス交戦中の**昇格凍結**(社長裁定v0.25.2412 質問②「凍結で」)。
   *
   * 昇格は「10秒窓に何体捌けたか」で決まるが、ボス戦中は強制リラックス(=雑魚の密度4割・湧きCD2倍)に
   * するので、**窓の撃破数はどう頑張っても足りない**。そのまま数えると「ボスと戦っただけで昇格が
   * 遠のく」という理不尽が生まれるので、窓そのものを止める(進行中の窓も据え置き=消さない)。
   * **降格側(hitStreak)は止めない**: ボスに削られ続けているなら落ちるのが正しい(社長裁定)。
   */
  freezePromotion?: boolean;
}

export interface RankPaceTickResult {
  state: RankPaceState;
  delta: RankDelta; // 1=昇格 / -1=降格 / 0=ステイ(このtickの結果。適用はapplyRankDeltaを呼ぶ側の責務)
}

// 降格を優先する判定順(既存assessKomaDeltaと同じ安全側の作法。同一tickで両方成立する状況は
// 実運用上ほぼ起こらない=窓は10秒境界でしか閉じずストリームは毎tick評価のため、境界が正確に重なる
// 一瞬だけの理論上の話。危険シグナルが出ている時は昇格させない、を踏襲する)。
export const tickRankPace = (state: RankPaceState, input: RankPaceTickInput): RankPaceTickResult => {
  const streak = stepHitStreak(state.hitStreak, { dtMs: input.dtMs, msSinceLastHit: input.msSinceLastHit });
  if (streak.demote) return { state: createRankPaceState(), delta: -1 };
  // 昇格凍結中は窓を1msも進めない(=windowElapsedMs/killsInWindow/windowsAtRank が据え置き)。
  // 解除後は止めた続きから再開する。
  if (input.freezePromotion) return { state: { window: state.window, hitStreak: streak.state }, delta: 0 };
  const win = stepRankWindow(state.window, {
    dtMs: input.dtMs, killsThisFrame: input.killsThisFrame, rank: input.rank, r7Cap: input.r7Cap,
  });
  if (win.promote) return { state: createRankPaceState(), delta: 1 };
  return { state: { window: win.state, hitStreak: streak.state }, delta: 0 };
};
