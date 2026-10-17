// PACING_PUZZLE.md / 監査レポート§3「共通骨格」の純関数レイヤ(v0.25.2613・バッチ3で新設)。
// レンダラ非依存・store非依存。**ボス別の差は全て「外から入るデータ」**にしてある(横展開の土台):
//   ①帯(ZoneEdges) ②重み(StringScript.weight) ③ストリング表 ④休符長 ⑤移動語彙の帯 ⑥懲罰の閾値
// 使う側(<boss>Script.ts)はこの6つを定義するだけでよい。
//
// 背景(監査 v0.25.2609): 既存ボスは「中立=まっすぐ追う/常に離れる」の1語彙しか持たず、技と技の間に
// 主戦帯を維持する概念が無かった。ER資料(research/ELDEN_RING_BOSS_PATTERNS.md)の原則
// ②ストリングと休符のターン制 / ③主戦帯の維持 / ④下がりは仕込み / ⑤懲罰の規則化 を本作へ写す。
import type { BossZone } from './bossScript';
import { PLAYER_WALK_PX_PER_SEC, minWindupMs } from './bossTelegraph';

export type { BossZone };

// ---- ①帯(ゾーン境界はボス別) ------------------------------------------------------------------
/** ボス別のゾーン境界(px・中心間距離)。far は上限なし=引き撃ちで安全な距離を作らない。 */
export interface ZoneEdges { meleeMax: number; nearMax: number; midMax: number }

/** 距離→ゾーン。境界は「上限を含む(<=)」の既存作法(bossZoneForDistance / giantZoneForDistanceと同じ)。 */
export const zoneForDistance = (distance: number, e: ZoneEdges): BossZone =>
  distance <= e.meleeMax ? 'melee'
  : distance <= e.nearMax ? 'near'
  : distance <= e.midMax ? 'mid'
  : 'far';

// ---- ⑤移動語彙(4つ) ---------------------------------------------------------------------------
// ER原則③「中立姿勢は主戦帯で横に回りながら出入りする」。密着張り付きも遠距離待機も例外状態で、
// すぐ主戦帯へ戻る。**休符(hold)だけは距離に関わらず優先**=プレイヤーのターンを距離で奪わない。
export type NeutralVerb = 'close' | 'retreat' | 'strafe' | 'hold';

/** 主戦帯(この距離を保つ)。 */
export interface NeutralBand { min: number; max: number }

export const neutralVerb = (distance: number, band: NeutralBand, resting: boolean): NeutralVerb => {
  if (resting) return 'hold';
  if (distance > band.max) return 'close';
  if (distance < band.min) return 'retreat';
  return 'strafe';
};

// ---- ②③ストリング(連段) -----------------------------------------------------------------------
// ER §1-2(ミドラ=設計の見本)「コンボは最大3段」「ほぼ全コンボ後に1〜2秒のパニッシュ窓」。
// 段の並びはレラーナの経験則(§2-17)「速→速→遅(終)」に従い、**最後の遅い技が終端の合図**になる。
export interface StringScript<M extends string> {
  /** この台本が選ばれる距離ゾーン。 */
  zone: BossZone;
  /** 同ゾーン内での重み(重み比例で1本選ぶ)。0=出ない。 */
  weight: number;
  /** 段の並び。**フェーズ上限(stringMaxLen)で先頭から切り詰めて使う**=P2で1段伸びる。 */
  moves: readonly M[];
  /**
   * 一時的にオフ(BOSS_MAKER.md §15・台本の on/off)。true=抽選の対象から外す。
   * **重みは保持したまま**外せる(重み0にすると値が失われる/削除すると段の並びが失われる、を避ける
   * ための第3の手段=A/B比較の基本操作)。未指定=on。**既存の保存/台本はこのキーを持たないので、
   * そのまま「有効」として読める**(後方互換)。
   */
  off?: boolean;
}

/** フェーズ別のストリング上限段数。 */
export interface StringLenConfig { p1: number; p2: number }

export const stringMaxLen = (phase: number, cfg: StringLenConfig): number => (phase >= 2 ? cfg.p2 : cfg.p1);

/**
 * ゾーンに合う台本から重み比例で1本選び、フェーズ上限で切り詰めて返す。
 * ready=使える技(CD明け)。**1段目が使えない台本は候補から外す**(出だしで空振りしない)。
 * 該当なしは null(呼び出し側は中立を続ける)。
 */
export const pickStringScript = <M extends string>(
  scripts: readonly StringScript<M>[],
  zone: BossZone,
  phase: number,
  lenCfg: StringLenConfig,
  ready: Record<M, boolean>,
  rand: () => number = Math.random,
): M[] | null => {
  const pool = scripts.filter(s => s.zone === zone && s.weight > 0 && s.moves.length > 0 && ready[s.moves[0]]);
  const total = pool.reduce((sum, s) => sum + s.weight, 0);
  if (total <= 0) return null;
  let r = rand() * total;
  let picked = pool[pool.length - 1];
  for (const s of pool) {
    r -= s.weight;
    if (r < 0) { picked = s; break; }
  }
  const len = Math.max(1, Math.min(stringMaxLen(phase, lenCfg), picked.moves.length));
  // CD中の技で途中が詰まらないよう、readyでない段はその場で落とす(段数はREST側の合図で決まる)。
  const seq = picked.moves.slice(0, len).filter(m => ready[m]);
  return seq.length > 0 ? seq : null;
};

// ---- ④休符 -------------------------------------------------------------------------------------
// 換算式③(bossTelegraph.ts): 本作の「1発」= カウンター1サイクル 820ms。休符0.9秒=1発ぶん。
// **0にはしない**(プレイヤーのターンが消えると理不尽)。ER §2-6 ホーラ・ルー「P2は後隙が短い」の型。
export interface RestConfig { p1: number; p2: number }
export const restMsFor = (phase: number, cfg: RestConfig): number => (phase >= 2 ? cfg.p2 : cfg.p1);

// ---- ⑥懲罰(ER原則⑤「懲罰の規則化」) -----------------------------------------------------------
// 「プレイヤーの特定行動に特定の答えを返す」=見られている感。ER §1-5 のとおり**読む対象は絞る**。
export interface PunishSignals {
  /** 主戦帯より遠くに居続けた時間(ms)。 */
  farMs: number;
  /** 密着帯に居続けた時間(ms)。 */
  meleeMs: number;
  /** 同じ方位(±閾値)に居続けた時間(ms)。 */
  sameAngleMs: number;
}
export interface PunishConfig<M extends string> {
  farMs: number; farMove: M;       // (a) 遠距離での長居 → 追う/届かせる技
  meleeMs: number; meleeMove: M;   // (b) 密着の居座り → 剥がす/離脱する技
  sameAngleMs: number;             // (c) 同角度の長居 → 旋回方向を反転
}
export interface PunishResult<M extends string> { move: M | null; flipStrafe: boolean }

export const punishTrigger = <M extends string>(
  sig: PunishSignals,
  cfg: PunishConfig<M>,
): PunishResult<M> => {
  const flipStrafe = sig.sameAngleMs >= cfg.sameAngleMs;
  // 距離の懲罰は排他(同時に成立しない: farとmeleeは同じ距離で両立しない)。遠を先に見る。
  if (sig.farMs >= cfg.farMs) return { move: cfg.farMove, flipStrafe };
  if (sig.meleeMs >= cfg.meleeMs) return { move: cfg.meleeMove, flipStrafe };
  return { move: null, flipStrafe };
};

/**
 * PACING_PUZZLE.md §6.38 B0(先行抽出バッチ): `PunishSignals` の各値(farMs/meleeMs/sameAngleMs)は
 * どれも同じ式で積み上がる——「条件を満たしている間は加算、途切れたら0へリセット」。
 * idolTick.ts はこれをインラインで3回書いていた(s.farSince/s.meleeSince/s.angleSince)。
 * 賞金首(近接型・輸入=懲罰狙撃=遠距離に2秒留まると即発火)からも同じ式で`farMs`を積めるよう
 * ここへ抽出する(idol の挙動は不変・呼び出し側を差し替えただけ)。
 */
export const advanceLingerMs = (prevMs: number, holding: boolean, stepMs: number): number =>
  holding ? prevMs + stepMs : 0;

// ---- 公平性の歯止め(社長指示「MAXは密度で作る。読めなさで作らない」) ---------------------------
// 分類(監査レポート§2): A=歩くだけで確実に避けられる / B=歩けるが余裕が小さい(位置取りが要る) /
// C=歩いて避けられない=別の答え(カウンター/密着)が要る。
export type MoveClass = 'A' | 'B' | 'C';

/**
 * C分類の予告下限。導出: カウンター窓は400ms。予告開始からTms後に判定が出るとき、プレイヤーが
 * 押してよい時刻pは p ∈ [max(R, T-400), T](R=人の反応時間≒250ms)。この幅を**300ms以上**確保するには
 * T ≧ 550ms(T≧650なら常に400ms幅)。= 「フレーム完璧でなくても間に合う」の機械的な保証。
 */
export const HUMAN_REACTION_MS = 250;
export const MIN_COUNTER_TELEGRAPH_MS = 550;

/** C分類の技で「押してよい時刻の幅」(ms)。公平性の検算に使う。 */
export const counterPressWindowMs = (telegraphMs: number): number =>
  Math.max(0, telegraphMs - Math.max(HUMAN_REACTION_MS, telegraphMs - 400));

/** 1つの技の公平性データ(各<boss>Script.tsが宣言し、テストが機械検査する)。 */
export interface MoveFairness {
  key: string;
  cls: MoveClass;
  /** ヒント(赤い予告図形)が出てから判定が出るまでの時間。 */
  telegraphMs: number;
  /** A/B: 判定から歩いて出るのに要る距離(px)。C(歩いて避けられない技)は undefined。 */
  escapePx?: number;
}

/**
 * 公平性の検算(社長指示「C分類の技は100%、決断の時刻より前にヒントが出ている」)。
 * 破っている技の説明文を返す(空配列=全部公平)。
 *  - A/B: 予告 ≧ 脱出に要る時間(= minWindupMs(escapePx))
 *  - C  : 予告 ≧ MIN_COUNTER_TELEGRAPH_MS(押してよい時刻の幅が300ms以上)
 */
export const fairnessViolations = (moves: readonly MoveFairness[]): string[] => {
  const out: string[] = [];
  for (const m of moves) {
    if (m.cls === 'C') {
      if (m.telegraphMs < MIN_COUNTER_TELEGRAPH_MS) {
        out.push(`${m.key}(C): 予告${m.telegraphMs}ms < 下限${MIN_COUNTER_TELEGRAPH_MS}ms(押してよい幅=${Math.round(counterPressWindowMs(m.telegraphMs))}ms)`);
      }
      continue;
    }
    if (m.escapePx === undefined) {
      out.push(`${m.key}(${m.cls}): A/B分類なのに escapePx が未宣言(歩いて避けられるかを検算できない)`);
      continue;
    }
    const need = minWindupMs(m.escapePx);
    if (m.telegraphMs < need) {
      out.push(`${m.key}(${m.cls}): 予告${m.telegraphMs}ms < 必要${Math.ceil(need)}ms(${m.escapePx}pxを${PLAYER_WALK_PX_PER_SEC}px/sで歩く)`);
    }
  }
  return out;
};

/** 分類の配分(A/B/C の本数)。「C寄りにする」を数字で確認するための集計。 */
export const classMix = (moves: readonly MoveFairness[]): Record<MoveClass, number> => {
  const mix: Record<MoveClass, number> = { A: 0, B: 0, C: 0 };
  for (const m of moves) mix[m.cls] += 1;
  return mix;
};
