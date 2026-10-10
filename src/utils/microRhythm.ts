// research/AI_HUMANIZE.md B3(§4①②④⑥⑧・マイクロリズム=操作の指紋)。
// 「止まりの長さ/攻撃間隔/回り方の利き/被弾直後の反応/判断の間隔」の**録り**(状態機械)と、
// プロファイルへ焼く形(MicroRhythmProfile・ghostDriver/phantomTickの写しが読む共通の型)。
// habitEpisode.ts/meleeSpacing.tsと同じ流儀: 純関数+呼び出し側が持つ状態オブジェクト。
// store/React/PixiJS非依存(ヘッドレスでテスト可能)。
//
// ③(平時の間合い=既存16ビンdistBuckets)・⑤(ピンチの間合い)はplayerTraits.ts側(既存の距離計測に
// 相乗り)で、⑦(硬直パニッシュの速さ)はpunishWindow.ts側(既存のrecover窓判定に相乗り)で録る
// (このファイルでは録らない=§4「既存tick関数への相乗りのみ」の指示どおり、既存の計測フックが
// 一番近い場所にそれぞれ置く)。MicroRhythmProfile の型はこの3ファイルぶんを合わせた形。

// ---- 保存形(叩き台の3ビン分布・16ビン分布) -----------------------------------------------------
/** 3分類の割合(rate2 = 1-rate0-rate1)。n=観測数の累計。 */
export interface MicroBin3Dist { n: number; rate0: number; rate1: number }
/** 16ビンの分布(sum(rates)≈1)。n=観測数の累計。 */
export interface MicroHistDist { n: number; rates: number[] }
/** 2分類の割合(④回り方の利き)。 */
export interface MicroOrbitDist { n: number; rightRate: number }

/**
 * §4①〜⑧の保存形(軸1のみ・moveReactions/meleeSpacingと同じ扱い=ボス別スロットへは複製しない)。
 * 各項目は独立して欠損しうる(観測0件のものはキー自体が無い=消費側がその項目だけフォールバック)。
 */
export interface MicroRhythmProfile {
  /** ①止まりの長さ: bin0=〜200ms未満 / bin1=〜600ms未満 / bin2=それ以上(叩き台)。 */
  stillness?: MicroBin3Dist;
  /** ②攻撃間隔の揺らぎ: bin0=密(<500ms) / bin1=中(<1200ms) / bin2=疎(叩き台)。 */
  swingInterval?: MicroBin3Dist;
  /** ③平時の間合い(既存16ビンdistBuckets・50px刻み。playerTraits.ts側で埋める)。 */
  distDist?: MicroHistDist;
  /** ⑤ピンチ(HP<=30%)の間合い(同上の別ヒストグラム)。 */
  pinchDistDist?: MicroHistDist;
  /** ④回り方の利き(接敵中の接線速度の符号)。 */
  orbit?: MicroOrbitDist;
  /** ⑥被弾直後1秒の反応: bin0=下がる / bin1=固まる / bin2=殴り返す(叩き台)。 */
  hitReact?: MicroBin3Dist;
  /** ⑦硬直パニッシュの速さ(recover窓開き→最初の振りまでのms・punishWindow.ts側で埋める):
   * bin0=即 / bin1=普通 / bin2=様子見(叩き台)。 */
  punishRecoverSpeed?: MicroBin3Dist;
  /** ⑧判断の間隔(lastDirectionが120ms以上安定した回数の間隔): bin0=速い / bin1=中 / bin2=遅い(叩き台)。 */
  decisionInterval?: MicroBin3Dist;
}

// ---- ①〜④⑥⑧の叩き台しきい値(§7-8実測主義=発明した定数は全て明記) -----------------------------
export const STILL_SHORT_MS = 200;   // 叩き台(§4①「〜200ms」)
export const STILL_MID_MS = 600;     // 叩き台(§4①「〜600ms」)
export const SWING_DENSE_MS = 500;   // 叩き台(§4②「密」)
export const SWING_MID_MS = 1200;    // 叩き台(§4②「中」。これ以上=疎)
export const HIT_REACT_WINDOW_MS = 1000; // 叩き台(§4⑥「被弾から1秒間」)
export const HIT_REACT_AWAY_PX = 40;     // 叩き台: この距離以上ボスから離れたら「下がる」、未満は「固まる」
export const DECISION_DWELL_MS = 120;    // 叩き台(§4⑧「120ms以上継続」=指の震えの除去)
export const DECISION_FAST_MS = 400;     // 叩き台(§4⑧「速い」)
export const DECISION_MID_MS = 1000;     // 叩き台(§4⑧「中」。これ以上=遅い)
/** ④回り方の利き: 接線成分の比率がこれ未満(=ほぼ放射方向の移動)は「回っていない」として数えない(叩き台)。 */
export const ORBIT_TANGENT_FRAC_MIN = 0.3;
/** ④回り方の利き: この実移動速度未満は静止扱いで数えない(px/s・叩き台=stationaryFrac計測と同じ桁)。 */
export const ORBIT_MIN_SPEED_PX_PER_SEC = 12;

/** 8方向量子化(45°刻み)。ベクトルの大きさが極小(≒静止)ならnull。 */
export const octantOf = (x: number, y: number): number | null => {
  const m = Math.hypot(x, y);
  if (m < 0.01) return null;
  const ang = Math.atan2(y, x);
  const idx = Math.round(ang / (Math.PI / 4));
  return ((idx % 8) + 8) % 8;
};

// ---- 記録中の状態(セッション単位。playerTraits.Sessionが1個持つ) ----------------------------------
export interface MicroRhythmState {
  // ①止まりの長さ(isMovingのエッジ)
  wasMoving: boolean;
  stillSince: number | null;
  stillN: number; stillShortN: number; stillMidN: number; stillLongN: number;
  // ②攻撃間隔(swungThisTickのエッジ)
  lastSwingAt: number | null;
  swingN: number; swingDenseN: number; swingMidN: number; swingSparseN: number;
  // ④回り方の利き(接敵中の接線速度)
  orbitN: number; orbitRightN: number; orbitLeftN: number;
  // ⑥被弾直後1秒の反応
  hitOpen: boolean; hitOpenAt: number; hitStartDist: number; hitSwungDuring: boolean; hitMaxAwayPx: number;
  hitN: number; hitRetreatN: number; hitFreezeN: number; hitCounterN: number;
  // ⑧判断の間隔(lastDirectionの8方向量子化)
  pendingOctant: number | null; pendingSince: number;
  confirmedOctant: number | null; lastDecisionAt: number | null;
  decisionN: number; decisionFastN: number; decisionMidN: number; decisionSlowN: number;
}

export const createMicroRhythmState = (): MicroRhythmState => ({
  wasMoving: true, stillSince: null,
  stillN: 0, stillShortN: 0, stillMidN: 0, stillLongN: 0,
  lastSwingAt: null, swingN: 0, swingDenseN: 0, swingMidN: 0, swingSparseN: 0,
  orbitN: 0, orbitRightN: 0, orbitLeftN: 0,
  hitOpen: false, hitOpenAt: 0, hitStartDist: 0, hitSwungDuring: false, hitMaxAwayPx: 0,
  hitN: 0, hitRetreatN: 0, hitFreezeN: 0, hitCounterN: 0,
  pendingOctant: null, pendingSince: 0, confirmedOctant: null, lastDecisionAt: null,
  decisionN: 0, decisionFastN: 0, decisionMidN: 0, decisionSlowN: 0,
});

export interface MicroRhythmTickInput {
  gameTime: number;
  /** 実移動の有無(player.isMoving=実速度ベース。movementInputバグ修正=入力源の是正)。 */
  isMoving: boolean;
  /** player.lastDirection(キー/タッチ両方が更新する唯一の実在源)。 */
  lastDirection: { x: number; y: number } | null;
  /** このtickに近接を振ったか(meleeSwingCommitAtのエッジ。playerTraits側で既に計算済みのものを渡す)。 */
  swungThisTick: boolean;
  /** 接敵中のボス中心(いなければnull=④は数えない)。 */
  boss: { bcx: number; bcy: number } | null;
  pcx: number; pcy: number;
  /** 前tickのプレイヤー中心(④の接線速度算出用。初tickはnull)。 */
  prevPcx: number | null; prevPcy: number | null;
  /** 前tickからの経過ms(④の実速度算出用。0以下は④を数えない=初tick)。 */
  dtMs: number;
  /** このtickに被弾したか(player.lastDamagedAtGameのエッジ)。 */
  justDamaged: boolean;
}

/** 1フレーム分の進行(副作用は`st`のみ・乱数なし=録りは常に決定的)。 */
export const stepMicroRhythm = (st: MicroRhythmState, input: MicroRhythmTickInput): void => {
  const { gameTime } = input;

  // ---- ①止まりの長さ ----
  if (!input.isMoving && st.wasMoving) {
    st.stillSince = gameTime;
  } else if (input.isMoving && !st.wasMoving && st.stillSince !== null) {
    const dur = gameTime - st.stillSince;
    st.stillN += 1;
    if (dur < STILL_SHORT_MS) st.stillShortN += 1;
    else if (dur < STILL_MID_MS) st.stillMidN += 1;
    else st.stillLongN += 1;
    st.stillSince = null;
  }
  st.wasMoving = input.isMoving;

  // ---- ②攻撃間隔の揺らぎ ----
  if (input.swungThisTick) {
    if (st.lastSwingAt !== null) {
      const gap = gameTime - st.lastSwingAt;
      st.swingN += 1;
      if (gap < SWING_DENSE_MS) st.swingDenseN += 1;
      else if (gap < SWING_MID_MS) st.swingMidN += 1;
      else st.swingSparseN += 1;
    }
    st.lastSwingAt = gameTime;
  }

  // ---- ④回り方の利き ----
  if (input.boss && input.prevPcx !== null && input.prevPcy !== null && input.dtMs > 0) {
    const vx = input.pcx - input.prevPcx, vy = input.pcy - input.prevPcy;
    const speed = Math.hypot(vx, vy);
    const speedPxPerSec = speed / (input.dtMs / 1000);
    if (speedPxPerSec >= ORBIT_MIN_SPEED_PX_PER_SEC) {
      const rx = input.prevPcx - input.boss.bcx, ry = input.prevPcy - input.boss.bcy;
      const rl = Math.hypot(rx, ry);
      if (rl > 1) {
        // 接線成分(decideGhost.orbitVecと同じ規約: orbitSign=+1の接線は(-ry,rx))。
        const cross = rx * vy - ry * vx;
        const tangentialFrac = Math.abs(cross) / (rl * speed);
        if (tangentialFrac >= ORBIT_TANGENT_FRAC_MIN) {
          st.orbitN += 1;
          if (cross > 0) st.orbitRightN += 1; else st.orbitLeftN += 1;
        }
      }
    }
  }

  // ---- ⑥被弾直後1秒の反応 ----
  if (input.justDamaged && !st.hitOpen) {
    st.hitOpen = true;
    st.hitOpenAt = gameTime;
    st.hitStartDist = input.boss ? Math.hypot(input.pcx - input.boss.bcx, input.pcy - input.boss.bcy) : 0;
    st.hitSwungDuring = false;
    st.hitMaxAwayPx = 0;
  }
  if (st.hitOpen) {
    if (input.swungThisTick) st.hitSwungDuring = true;
    if (input.boss) {
      const d1 = Math.hypot(input.pcx - input.boss.bcx, input.pcy - input.boss.bcy);
      st.hitMaxAwayPx = Math.max(st.hitMaxAwayPx, d1 - st.hitStartDist);
    }
    if (gameTime - st.hitOpenAt >= HIT_REACT_WINDOW_MS) {
      st.hitN += 1;
      if (st.hitSwungDuring) st.hitCounterN += 1;
      else if (st.hitMaxAwayPx >= HIT_REACT_AWAY_PX) st.hitRetreatN += 1;
      else st.hitFreezeN += 1;
      st.hitOpen = false;
    }
  }

  // ---- ⑧判断の間隔 ----
  const oct = octantOf(input.lastDirection?.x ?? 0, input.lastDirection?.y ?? 0);
  if (oct !== null) {
    if (st.pendingOctant !== oct) {
      st.pendingOctant = oct;
      st.pendingSince = gameTime;
    } else if (st.confirmedOctant !== oct && gameTime - st.pendingSince >= DECISION_DWELL_MS) {
      if (st.lastDecisionAt !== null) {
        const gap = gameTime - st.lastDecisionAt;
        st.decisionN += 1;
        if (gap < DECISION_FAST_MS) st.decisionFastN += 1;
        else if (gap < DECISION_MID_MS) st.decisionMidN += 1;
        else st.decisionSlowN += 1;
      }
      st.confirmedOctant = oct;
      st.lastDecisionAt = gameTime;
    }
  }
};

const bin3 = (n: number, b0: number, b1: number): MicroBin3Dist | undefined =>
  n > 0 ? { n, rate0: b0 / n, rate1: b1 / n } : undefined;

/**
 * セッション終了時: ①②④⑥⑧の5項目をプロファイルへ焼く形にする(まだ開いている⑥の窓は
 * **畳まない**=1秒未満のエピソードを短縮確定させない。moveReactionの残響と違い「窓の長さ自体が
 * 意味を持つ」項目なので、closeで無理に閉じない=呼び出し側は次セッションへ持ち越さず単に捨てる)。
 * distDist/pinchDistDist/punishRecoverSpeedはここでは埋めない(呼び出し側=playerTraits.tsが合成する)。
 */
export const foldMicroRhythm = (st: MicroRhythmState): MicroRhythmProfile => ({
  stillness: bin3(st.stillN, st.stillShortN, st.stillMidN),
  swingInterval: bin3(st.swingN, st.swingDenseN, st.swingMidN),
  orbit: st.orbitN > 0 ? { n: st.orbitN, rightRate: st.orbitRightN / st.orbitN } : undefined,
  hitReact: bin3(st.hitN, st.hitRetreatN, st.hitFreezeN),
  decisionInterval: bin3(st.decisionN, st.decisionFastN, st.decisionMidN),
});

// ---- ブレンド(meleeSpacing.blendMeleeSpacing/moveReaction.blendDodgeDirStatと同じ数式) ----------
const ema = (a: number, b: number, alpha: number): number => a * (1 - alpha) + b * alpha;

export const blendBin3 = (
  prev: MicroBin3Dist | undefined, sample: MicroBin3Dist | undefined, alpha: number,
): MicroBin3Dist | undefined => {
  if (!sample || sample.n <= 0) return prev;
  if (!prev || prev.n <= 0) return sample;
  return {
    n: prev.n + sample.n,
    rate0: ema(prev.rate0, sample.rate0, alpha),
    rate1: ema(prev.rate1, sample.rate1, alpha),
  };
};

export const blendOrbit = (
  prev: MicroOrbitDist | undefined, sample: MicroOrbitDist | undefined, alpha: number,
): MicroOrbitDist | undefined => {
  if (!sample || sample.n <= 0) return prev;
  if (!prev || prev.n <= 0) return sample;
  return { n: prev.n + sample.n, rightRate: ema(prev.rightRate, sample.rightRate, alpha) };
};

export const blendHistDist = (
  prev: MicroHistDist | undefined, sample: MicroHistDist | undefined, alpha: number,
): MicroHistDist | undefined => {
  if (!sample || sample.n <= 0) return prev;
  if (!prev || prev.n <= 0) return sample;
  const rates = prev.rates.map((r, i) => ema(r, sample.rates[i] ?? 0, alpha));
  return { n: prev.n + sample.n, rates };
};

/**
 * ①②③④⑤⑥⑦⑧まとめて混ぜる(playerTraits.applyPendingSessionから1回で呼ぶ)。
 * どの項目も「サンプル欠損/n=0なら前回値を保つ」(§7-8の掟=測れなかったを0で上書きしない)。
 */
export const blendMicroRhythm = (
  prev: MicroRhythmProfile | undefined, sample: MicroRhythmProfile | undefined, alpha: number,
): MicroRhythmProfile | undefined => {
  if (!sample) return prev;
  const next: MicroRhythmProfile = {
    stillness: blendBin3(prev?.stillness, sample.stillness, alpha),
    swingInterval: blendBin3(prev?.swingInterval, sample.swingInterval, alpha),
    distDist: blendHistDist(prev?.distDist, sample.distDist, alpha),
    pinchDistDist: blendHistDist(prev?.pinchDistDist, sample.pinchDistDist, alpha),
    orbit: blendOrbit(prev?.orbit, sample.orbit, alpha),
    hitReact: blendBin3(prev?.hitReact, sample.hitReact, alpha),
    punishRecoverSpeed: blendBin3(prev?.punishRecoverSpeed, sample.punishRecoverSpeed, alpha),
    decisionInterval: blendBin3(prev?.decisionInterval, sample.decisionInterval, alpha),
  };
  // 全項目が欠損(前回値も無い)なら undefined を返す(profile.microRhythmキー自体を生やさない)。
  const hasAny = Object.values(next).some(v => v !== undefined);
  return hasAny ? next : undefined;
};
