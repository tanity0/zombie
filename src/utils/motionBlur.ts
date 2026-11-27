// ブラー表現「詰めた残像」(research/BLUR.md)の純関数。PixiJS を読まない・描画だけが使う(判定・移動・時間には一切関与しない)。
// 型: 速く動いている間だけ、本体のすぐ後ろに本体の過去の位置の写しを詰めて並べ(古いほど薄い)、本体を半分の濃さにする。
// 止まったら本体はすぐ元の濃さへ戻り、残像は加減速つきに薄れて消える。止め(ヒットストップ)の間は残像の時計も止める。

/** 刀の一閃・居合一閃・殺陣: 残像3枚・10msおき。 */
export const BLUR_KATANA_GHOSTS = 3;
export const BLUR_KATANA_SPACING_MS = 10;
/** 格闘の飛び蹴り・5段目の突進・抉り打ちの踏み込み: 刀と同じ(見本の3枚・10msおき・濃さ 0.46/0.32/0.18)。 */
export const BLUR_BRAWLER_GHOSTS = 3;
export const BLUR_BRAWLER_SPACING_MS = 10;
/** 強く吹き飛ばされた敵: 見本の3枚(濃さ 0.46/0.32/0.18・間隔は画素で決める blurEnemySpacingMs・本体は透けさせない)。 */
export const BLUR_ENEMY_GHOSTS = 3;
export const BLUR_ENEMY_SPACING_MS = 10;
/** 敵の残像の間隔の上限(ms)。間隔は画素で決める(blurEnemySpacingMs)=遅い間は時間を延ばし、速い間は 10ms まで詰める。 */
export const BLUR_ENEMY_SPACING_MAX_MS = 28;
/** 敵の残像どうしを離す距離=体の幅のこの割合(体の幅の 15〜20%)。 */
export const BLUR_ENEMY_GAP_BODY_FRAC = 0.17;
/** 体の幅が分からない時の離す距離(px)。 */
export const BLUR_ENEMY_GAP_PX = 14;
/**
 * 敵の残像の間隔(ms): 画素で決める=gapPx / 速さ を [BLUR_ENEMY_SPACING_MS, BLUR_ENEMY_SPACING_MAX_MS] に収める
 * (10ms 固定だと遅くなった所で写しが本体に重なって二重写りに見える)。速さが 0 以下なら上限。
 */
export const blurEnemySpacingMs = (gapPx: number, speedPxPerMs: number): number => {
  if (!(speedPxPerMs > 0) || !(gapPx > 0)) return BLUR_ENEMY_SPACING_MAX_MS;
  return Math.min(BLUR_ENEMY_SPACING_MAX_MS, Math.max(BLUR_ENEMY_SPACING_MS, gapPx / speedPxPerMs));
};
/** 同時に残像を出す敵の数の上限。 */
export const BLUR_ENEMY_MAX = 4;
/** 敵の残像を始める速さ(world px / ゲーム時間 ms)・続ける速さの下限。 */
export const BLUR_ENEMY_START_SPEED = 0.6;
export const BLUR_ENEMY_KEEP_SPEED = 0.3;
/** 止まった後に残像が消えるまで。 */
export const BLUR_FADE_MS = 140;
/** 走っている間の本体の濃さ(プレイヤーだけ)。 */
export const BLUR_BODY_ALPHA = 0.5;
/** 通った道の白い筋の濃さ(走っている間)。 */
export const BLUR_STREAK_ALPHA = 0.5;
/** 1フレームでこれ以上跳んだら瞬間移動(残像の列を切る)。 */
export const BLUR_TELEPORT_PX = 160;
/** これ未満の動きは「止まっている」(止めの間は残像の時計を止める)。 */
export const BLUR_STILL_PX = 0.05;
/** 1フレームの時計の進みの上限(タブ復帰などで大きく跳ばない)。 */
export const BLUR_MAX_DT_MS = 100;

/** 残像 i(1=一番新しい・n=一番古い)の濃さ。3枚なら 0.46 / 0.32 / 0.18(見本の値)。 */
export const blurGhostAlpha = (i: number, n: number): number => {
  if (!(n > 0) || i < 1 || i > n) return 0;
  return 0.18 + 0.42 * (n - i) / n;
};

/** 止まってからの残像の濃さの掛け(1→0・ease-out=止まった瞬間に速く薄れ始め、終わりはゆっくり消える)。列の縮み(写しが本体へ追いつく)にも同じ掛けを使う。 */
export const blurFadeK = (sinceEndMs: number, fadeMs = BLUR_FADE_MS): number => {
  if (!(sinceEndMs > 0)) return 1;
  if (sinceEndMs >= fadeMs) return 0;
  const v = 1 - sinceEndMs / fadeMs;
  return v * v;
};

/** 瞬間移動した瞬間、写しを道のりに広げておき、通常の間隔の並びへ縮めるまで(ms・ease-out)。 */
export const BLUR_WARP_SPREAD_MS = 70;

export interface BlurSample { t: number; x: number; y: number; r: number; h: number }

export interface BlurTrail {
  /** 残像の時計(ms)。動いている間だけ進む(止めの間・止まっている間は進まない)。 */
  clock: number;
  samples: BlurSample[];
  active: boolean;
  /** 止まってからの経過(ms)。止めの間は進まない。 */
  sinceEnd: number;
  /** 動き出した点(通った道の筋の根元)。 */
  ox: number; oy: number; oh: number;
  lastX: number; lastY: number; hasLast: boolean;
  /** 前のフレームのゲーム時間(dt を出す)。 */
  lastGt: number;
  /** 最後の瞬間移動からの経過(ms・止めの間は進まない)。瞬間移動が無ければ +∞。 */
  warpEl: number;
  /** 最後の瞬間移動の元(f)と先(t)の点。 */
  wfx: number; wfy: number; wfh: number; wtx: number; wty: number; wth: number;
}

export const createBlurTrail = (): BlurTrail => ({
  clock: 0, samples: [], active: false, sinceEnd: Number.POSITIVE_INFINITY,
  ox: 0, oy: 0, oh: 0, lastX: 0, lastY: 0, hasLast: false, lastGt: Number.NaN,
  warpEl: Number.POSITIVE_INFINITY, wfx: 0, wfy: 0, wfh: 0, wtx: 0, wty: 0, wth: 0,
});

export interface BlurStepIn {
  /** ゲーム時間(ms)。止め(画面全体)の間は進まない。 */
  gt: number;
  /** 速い技の最中か。 */
  active: boolean;
  /** 本体の今の位置(絵の位置)・回り・高さ。 */
  x: number; y: number; r?: number; h?: number;
  /** 技の止めの最中(残像の時計も止める)。 */
  stop?: boolean;
  /** このフレームで瞬間移動した(居合一閃のワープ・殺陣の各発): 元の位置から今の位置へ、この速さ(px/ms)で走ったように残像を詰める。 */
  warpFrom?: { x: number; y: number; h?: number };
  warpSpeed?: number;
}

// 列を残す長さ: 一番古い写し(敵の3枚目=間隔の上限×3)まで点が残るように(足りないと3枚目が出ない時がある)。
const KEEP_MS = Math.max(80, BLUR_ENEMY_SPACING_MAX_MS * BLUR_ENEMY_GHOSTS + 20);

const pushSample = (tr: BlurTrail, s: BlurSample): void => {
  tr.samples.push(s);
  const cut = tr.clock - KEEP_MS;
  while (tr.samples.length > 2 && tr.samples[1].t <= cut) tr.samples.shift();
};

/** 1フレーム進める(描画の側で毎フレーム呼ぶ)。止めの間(dt=0 か stop)は何も進めない=残像はその場で止まる。 */
export const stepBlurTrail = (tr: BlurTrail, i: BlurStepIn): void => {
  const r = i.r ?? 0, h = i.h ?? 0;
  const dt = Number.isNaN(tr.lastGt) ? 0 : i.gt - tr.lastGt;
  tr.lastGt = i.gt;
  if (dt < 0 || dt > 10 * BLUR_MAX_DT_MS) { // 時計が戻った(新しいゲーム)・大きく跳んだ=やり直し
    tr.active = false; tr.samples.length = 0; tr.sinceEnd = Number.POSITIVE_INFINITY; tr.warpEl = Number.POSITIVE_INFINITY;
    tr.lastX = i.x; tr.lastY = i.y; tr.hasLast = true;
    return;
  }
  const d = Math.min(BLUR_MAX_DT_MS, dt);
  const moved = tr.hasLast ? Math.hypot(i.x - tr.lastX, i.y - tr.lastY) : 0;
  if (!i.stop && d > 0) tr.warpEl += d; // 瞬間移動の広がりの時計(止めの間は進まない)
  if (i.active) {
    const starting = !tr.active;
    if (starting) {
      tr.active = true; tr.samples.length = 0; tr.sinceEnd = 0;
      tr.ox = i.x; tr.oy = i.y; tr.oh = h;
    }
    if (i.warpFrom && d > 0) {
      // 瞬間移動: 元の位置から今の位置まで、その速さで走ったように列を作り直す(時計はその分だけ進める)。
      const sp = Math.max(0.05, i.warpSpeed ?? 0.85);
      const fx = i.warpFrom.x, fy = i.warpFrom.y, fh = i.warpFrom.h ?? h;
      const dist = Math.hypot(i.x - fx, i.y - fy);
      const dur = dist / sp;
      tr.samples.length = 0;
      const t0 = tr.clock;
      const step = 4;
      for (let t = 0; t < dur; t += step) {
        const k = t / dur;
        tr.samples.push({ t: t0 + t, x: fx + (i.x - fx) * k, y: fy + (i.y - fy) * k, r, h: fh + (h - fh) * k });
      }
      tr.clock = t0 + dur;
      tr.samples.push({ t: tr.clock, x: i.x, y: i.y, r, h });
      const cut = tr.clock - KEEP_MS;
      while (tr.samples.length > 2 && tr.samples[1].t <= cut) tr.samples.shift();
      tr.ox = fx; tr.oy = fy; tr.oh = fh;
      // 写しはこのフレーム道のりに広げて置き、BLUR_WARP_SPREAD_MS で通常の並びへ縮める(着いた所に団子にしない)。
      tr.warpEl = 0; tr.wfx = fx; tr.wfy = fy; tr.wfh = fh; tr.wtx = i.x; tr.wty = i.y; tr.wth = h;
    } else if (moved > BLUR_TELEPORT_PX) {
      // 予告の無い瞬間移動=列を切って今の位置から
      tr.samples.length = 0;
      tr.ox = i.x; tr.oy = i.y; tr.oh = h;
      tr.samples.push({ t: tr.clock, x: i.x, y: i.y, r, h });
    } else {
      if (starting && tr.hasLast && moved > BLUR_STILL_PX) {
        // 動き出しの1フレーム前の位置から(最初のフレームから後ろに並ぶ)
        tr.ox = tr.lastX; tr.oy = tr.lastY;
        tr.samples.push({ t: tr.clock, x: tr.lastX, y: tr.lastY, r, h });
      }
      const frozen = !!i.stop || d <= 0 || (tr.samples.length > 0 && moved < BLUR_STILL_PX);
      if (!frozen) {
        tr.clock += d;
        pushSample(tr, { t: tr.clock, x: i.x, y: i.y, r, h });
      } else if (tr.samples.length === 0) {
        tr.samples.push({ t: tr.clock, x: i.x, y: i.y, r, h });
      }
    }
  } else {
    if (tr.active) { tr.active = false; tr.sinceEnd = 0; }
    if (!i.stop && d > 0) {
      tr.sinceEnd += d;
      // 技が終わった後も体が滑っている間(一閃の後の慣性など)は列を伸ばし続ける=残像は体のすぐ後ろに付いたまま薄れる(体から取り残さない)。
      if (tr.samples.length > 0 && moved > BLUR_STILL_PX && moved <= BLUR_TELEPORT_PX && blurFadeK(tr.sinceEnd) > 0) {
        tr.clock += d;
        pushSample(tr, { t: tr.clock, x: i.x, y: i.y, r, h });
      }
    }
  }
  tr.lastX = i.x; tr.lastY = i.y; tr.hasLast = true;
};

/** 今の残像の濃さの掛け(動いている間 1・止まった後は blurFadeK)。 */
export const blurTrailFade = (tr: BlurTrail): number => (tr.active ? 1 : blurFadeK(tr.sinceEnd));

/** 残像がまだ見えるか。 */
export const blurTrailVisible = (tr: BlurTrail): boolean => tr.samples.length > 1 && blurTrailFade(tr) > 0.001;

/** 本体の濃さの掛け(プレイヤー: 動いている間だけ半分・止まった瞬間に戻す)。 */
export const blurBodyAlpha = (tr: BlurTrail): number => (tr.active ? BLUR_BODY_ALPHA : 1);

export interface BlurGhost { x: number; y: number; r: number; h: number; alpha: number }

/** 時刻 t の位置(列の間を線形に補間)。列の一番古い点より前なら null(=その残像は出さない)。 */
export const blurSampleAt = (samples: readonly BlurSample[], t: number): BlurSample | null => {
  const n = samples.length;
  if (n === 0 || t < samples[0].t - 1e-6) return null;
  if (t >= samples[n - 1].t) return samples[n - 1];
  for (let k = n - 1; k > 0; k--) {
    const a = samples[k - 1], b = samples[k];
    if (t >= a.t) {
      const span = b.t - a.t;
      const u = span > 1e-9 ? (t - a.t) / span : 1;
      return { t, x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, r: a.r + (b.r - a.r) * u, h: a.h + (b.h - a.h) * u };
    }
  }
  return samples[0];
};

/**
 * 残像 n 枚を out へ(i=1 が本体のすぐ後ろ)。出さない残像(列が足りない・薄れ切った)は alpha 0。
 * 位置は残像の時計の spacing ms おきの過去(止めの間は時計が止まる=残像もその場で止まる)。
 * 止まった後は間隔も薄れと同じ掛けで縮む=写しが本体へ追いつきながら消える(ease-out)。
 * 瞬間移動した瞬間は写しを道のりの i/(n+1) の所(3枚なら 75%/50%/25%)に置き、BLUR_WARP_SPREAD_MS で通常の並びへ縮める(ease-out)。
 */
export const blurGhostsInto = (tr: BlurTrail, n: number, spacingMs: number, out: BlurGhost[]): BlurGhost[] => {
  const fade = blurTrailFade(tr);
  const sp = spacingMs * fade; // 止まった後は列が本体へ縮む(動いている間は fade=1)
  const warpW = tr.warpEl < BLUR_WARP_SPREAD_MS ? tr.warpEl / BLUR_WARP_SPREAD_MS : 1;
  const warpE = 1 - (1 - warpW) * (1 - warpW); // ease-out
  for (let i = 1; i <= n; i++) {
    const g = out[i - 1] ?? (out[i - 1] = { x: 0, y: 0, r: 0, h: 0, alpha: 0 });
    const s = fade > 0.001 && tr.samples.length > 1 ? blurSampleAt(tr.samples, tr.clock - i * sp) : null;
    if (!s) { g.alpha = 0; continue; }
    g.x = s.x; g.y = s.y; g.r = s.r; g.h = s.h;
    if (warpE < 1) {
      const k = 1 - i / (n + 1);
      const wx = tr.wfx + (tr.wtx - tr.wfx) * k, wy = tr.wfy + (tr.wty - tr.wfy) * k, wh = tr.wfh + (tr.wth - tr.wfh) * k;
      g.x = wx + (s.x - wx) * warpE; g.y = wy + (s.y - wy) * warpE; g.h = wh + (s.h - wh) * warpE;
    }
    g.alpha = blurGhostAlpha(i, n) * fade;
  }
  out.length = n;
  return out;
};

/** 通った道の筋: 根元(動き出した点)→先(今の列の先)・濃さ。動いていない(列が無い)時は alpha 0。 */
export const blurStreak = (tr: BlurTrail): { x0: number; y0: number; h0: number; x1: number; y1: number; h1: number; alpha: number } => {
  const last = tr.samples[tr.samples.length - 1];
  if (!last || tr.samples.length < 2) return { x0: 0, y0: 0, h0: 0, x1: 0, y1: 0, h1: 0, alpha: 0 };
  return { x0: tr.ox, y0: tr.oy, h0: tr.oh, x1: last.x, y1: last.y, h1: last.h, alpha: BLUR_STREAK_ALPHA * blurTrailFade(tr) };
};

/**
 * 敵の残像を出すか(強く吹き飛ばされた敵だけ)。candidate=吹き飛び・投げで飛んでいる最中(呼び手が store の欄から決める)。
 * 始め: 候補で、速さが BLUR_ENEMY_START_SPEED 以上、出している数が上限未満。続け: 候補のまま、速さが KEEP 以上か止まっている(=止めの間)。
 */
export const enemyBlurActive = (wasActive: boolean, candidate: boolean, speedPxPerMs: number, still: boolean, activeCount: number, cap = BLUR_ENEMY_MAX): boolean => {
  if (!candidate) return false;
  if (wasActive) return still || speedPxPerMs >= BLUR_ENEMY_KEEP_SPEED;
  return activeCount < cap && speedPxPerMs >= BLUR_ENEMY_START_SPEED;
};

// ---- 鞭の先端の流れの筋(research/BLUR.md §2-3) ----

/** 先端が伸び切る前のどこから筋が出始めるか(ms)・伸び切った後どれだけで消えるか(ms)。 */
export const WHIP_TIP_STREAK_LEAD_MS = 40;
export const WHIP_TIP_STREAK_TAIL_MS = 75;
/** 2本の筋の長さ(縄の長さに対する割合)・太さ(画面の px)・縄の向きからの開き(度)・縄から離す距離(画面の px)。 */
export const WHIP_TIP_STREAK_LEN = [0.30, 0.18] as const;
export const WHIP_TIP_STREAK_THICK_PX = [2.5, 1.5] as const;
export const WHIP_TIP_STREAK_SPREAD_DEG = 12;
export const WHIP_TIP_STREAK_OFFSET_PX = 8;
/** 縄の時計(前隙=伸び切るまで)から、先端の筋の濃さ(0..1)。伸び切る瞬間に一番濃く、すぐ出て、ease-out で消える。 */
export const whipTipStreakAlpha = (ropeElMs: number, windupMs: number): number => {
  const t = ropeElMs - windupMs;
  if (t < -WHIP_TIP_STREAK_LEAD_MS || t >= WHIP_TIP_STREAK_TAIL_MS) return 0;
  if (t < 0) { const u = 1 + t / WHIP_TIP_STREAK_LEAD_MS; return 1 - (1 - u) * (1 - u); } // 速く出て減速
  return blurFadeK(t, WHIP_TIP_STREAK_TAIL_MS); // ease-out
};

// ---- 画面全体の放射状の流れ(research/BLUR.md §2-5) ----

export const RADIAL_FLOW_MS = 200;
/** 流れの強さの最大(画面の中で、点までの距離に対する吸い込みの割合)。 */
export const RADIAL_FLOW_MAX = 0.07;
/** 流れの強さ(0..1): 速く立ち上がり(全体の 25%・ease-out)、少しだけ緩みながら保ち、最後の 30% で ease-in に急に戻る。範囲の外は 0。 */
export const radialFlowK = (elapsedMs: number, totalMs = RADIAL_FLOW_MS): number => {
  if (!(elapsedMs >= 0) || elapsedMs >= totalMs) return 0;
  const u = elapsedMs / totalMs;
  if (u < 0.25) { const a = u / 0.25; return 1 - (1 - a) * (1 - a) * (1 - a); }
  if (u < 0.7) return 1 - 0.1 * (u - 0.25) / 0.45;
  const b = (u - 0.7) / 0.3;
  return 0.9 * (1 - b * b);
};
/** 流れの中心のまわりで強さ 0 の半径・全強さになる半径(画面の短い辺に対する割合)。中心は溶かさず、外へ smoothstep で強める。 */
export const RADIAL_FLOW_CALM_R = 0.12;
export const RADIAL_FLOW_FULL_R = 0.45;
/** 写しの位置(点から外へ向かう割合)と重み。近い写しほど重い=点の側へ尾を引く(吸い込まれる向きが読める)。 */
export const RADIAL_FLOW_TAPS = [[0.33, 0.55], [0.66, 0.28], [1.0, 0.17]] as const;
