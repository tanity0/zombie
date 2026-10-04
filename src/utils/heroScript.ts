// 英雄(変異)— 中立の騎馬ボスの台本(research/MUTANT_HERO.md)。**依存ゼロの葉**(store を読まない)。
// 数値・技の表・図形・狙いの選び方・絵のコマの割り付けを純関数で持つ。動かすのは heroTick.ts、描くのは pixiScene。
//
// 掟(設計書 §5): 全技が赤(カウンター可)。赤い予告は「溜めの開始で出て、当たる瞬間に消え切る」。
// 突進・タックルは走る体では当てず、走り終わりの一撃だけで当てる(=当たる瞬間が1点に決まる)。

export const HERO_TYPE = 'mutant-hero' as const;

/** 英雄が狙う相手を探す距離(中心から)。 */
export const HERO_AGGRO_RANGE = 480;
/** 一度決めた相手を変えない時間。 */
export const HERO_TARGET_LATCH_MS = 1500;
/** 相手を乗り換えた時に止まって向き直る間。 */
export const HERO_RETARGET_PAUSE_MS = 200;
/** 左右の向きが入れ替わる前に止まる間。 */
export const HERO_FLIP_PAUSE_MS = 120;
/** 雑魚・強個体が英雄を追う距離(英雄の中心から)。錬金の召喚用の 380 とは別の口。 */
export const HERO_LURE_RANGE = 360;
/** 敵の攻撃を英雄が受ける時の倍率(敵の技の値はプレイヤー向け)。 */
export const HERO_INCOMING_MULT = 3;
/** 英雄の技が敵に当たる時の倍率。 */
export const HERO_VS_ENEMY_MULT = 6;
/** 技の間の休み(直前の結果で変える)。 */
export const HERO_REST_MS = { hit: 1800, miss: 700, countered: 2400 } as const;
/** 後半(HP半分)へ移る時の立ち上がり。技ではない=赤なし。 */
export const HERO_ROAR_MS = 1700;
/** 立ち上がりの割り付け: 0→7 で立ち上がる(400ms)→ 7で止まっていななく(1000ms)→ 8→12 で降りる(300ms)。降りた瞬間に霧が膨らむ。 */
export const HERO_ROAR_RISE_MS = 400;
export const HERO_ROAR_HOLD_MS = 1000;
/** カウンターされた直後の怯み(低く構えて後ずさる絵)。休み(2400ms)の頭に置く。 */
export const HERO_FLINCH_MS = 700;
/** 乗り換えの鼻息の最短間隔(群れの中で鳴り続けない)。 */
export const HERO_SNORT_COOLDOWN_MS = 4500;
/** 駆け足の歩幅(1コマで進む距離 px)。走りのコマは進んだ距離で送る=足が滑らない。 */
export const HERO_STRIDE_PX = 26;
/** 歩く速さ(px/秒)と、帰巣中の倍率。 */
export const HERO_WALK_SPEED = 95;
export const HERO_HOMING_SPEED_MULT = 0.5;
/** 佇み: 巣のまわりの別の点へ歩いて移る半径と間隔。 */
export const HERO_LOITER_RADIUS = 300;
export const HERO_LOITER_MIN_MS = 2000;
export const HERO_LOITER_MAX_MS = 5000;
/** 当たった後の振り残し(絵のため・判定は無い)。 */
export const HERO_STRIKE_MS = 260;
/** 練習ランで湧かせる雑魚の上限(英雄の枠だけ・設計書 §2-0)。 */
export const HERO_PRACTICE_MOB_CAP = 14;

export type HeroMoveKey = 'overhead' | 'combo' | 'upper' | 'sweep' | 'rear' | 'leap' | 'charge' | 'tackle' | 'leapcharge';

/** 赤い予告=当たりの形。溜めの開始時に置き場所を決め、当たる瞬間まで動かさない。 */
export type HeroShape =
  | { kind: 'band'; fx: number; fy: number; tx: number; ty: number; halfWidth: number }
  | { kind: 'fan'; cx: number; cy: number; angle: number; halfArc: number; radius: number }
  | { kind: 'circle'; cx: number; cy: number; radius: number };

/** 動きの種類(位置の動き。絵は伸び縮みさせない)。 */
export type HeroMotion = 'none' | 'lunge' | 'leap' | 'run';

export interface HeroStepSpec {
  /** 当たりの形の作り方。 */
  shape:
    | { kind: 'band'; length: number; halfWidth: number }
    | { kind: 'fan'; radius: number; arcDeg: number; offsetDeg?: number; atEnd?: boolean }
    | { kind: 'circle'; radius: number; forward?: number; atTarget?: number }
    | { kind: 'endBand'; length: number; halfWidth: number };
  /** 溜め(ms)。この間に位置の動きは無い(踏み込みの最後だけは例外=lungeTailMs)。 */
  windupMs: number;
  /** 位置の動き(溜めの後・当たる瞬間まで)。 */
  motion: HeroMotion;
  motionMs: number;
  motionPx: number;
  /** 振り下ろしの「溜めの最後で前へ踏み込む」距離と長さ(溜めの中に含む)。 */
  lungeTailPx?: number;
  lungeTailMs?: number;
  /** 対プレイヤーのダメージ。 */
  damage: number;
  /** 吹き飛ばし(距離・ms)。 */
  kb?: { distPx: number; ms: number };
}

export interface HeroMoveSpec {
  key: HeroMoveKey;
  steps: readonly HeroStepSpec[];
  recoverMs: number;
}

const band = (length: number, halfWidth: number) => ({ kind: 'band' as const, length, halfWidth });

export const HERO_MOVES: Readonly<Record<HeroMoveKey, HeroMoveSpec>> = {
  // 1. 振り下ろし: 頭上で構え、溜めの最後の250msで前へ60px踏み込んで縦に斬る。
  overhead: {
    key: 'overhead', recoverMs: 600,
    steps: [{ shape: band(260, 35), windupMs: 750, motion: 'none', motionMs: 0, motionPx: 0, lungeTailPx: 60, lungeTailMs: 250, damage: 20 }],
  },
  // 2. 三連: 縦→横→縦。段ごとに別の予告と時刻(1段目は短め・2段目は一番速い・3段目は頭上で長く溜める)。
  combo: {
    key: 'combo', recoverMs: 700,
    steps: [
      { shape: band(240, 35), windupMs: 700, motion: 'none', motionMs: 0, motionPx: 0, damage: 14 },
      { shape: { kind: 'fan', radius: 240, arcDeg: 140 }, windupMs: 300, motion: 'none', motionMs: 0, motionPx: 0, damage: 14 },
      { shape: band(260, 35), windupMs: 900, motion: 'none', motionMs: 0, motionPx: 0, lungeTailPx: 40, lungeTailMs: 200, damage: 20 },
    ],
  },
  // 3. 払い上げ(ためらう技): 下段で長く止まり、右前へ扇で払い上げる。
  upper: {
    key: 'upper', recoverMs: 600,
    steps: [{ shape: { kind: 'fan', radius: 220, arcDeg: 100, offsetDeg: 30 }, windupMs: 1250, motion: 'none', motionMs: 0, motionPx: 0, damage: 16 }],
  },
  // 4. 横薙ぎ: 水平に構え、前方の広い扇。
  sweep: {
    key: 'sweep', recoverMs: 700,
    steps: [{ shape: { kind: 'fan', radius: 270, arcDeg: 160 }, windupMs: 850, motion: 'none', motionMs: 0, motionPx: 0, damage: 22 }],
  },
  // 5. 棹立ち: 前脚を上げきって止まり、前脚の着く点に円。
  rear: {
    key: 'rear', recoverMs: 700,
    steps: [{ shape: { kind: 'circle', radius: 160, forward: 45 }, windupMs: 1000, motion: 'none', motionMs: 0, motionPx: 0, damage: 24, kb: { distPx: 160, ms: 320 } }],
  },
  // 6. 跳躍: 速く立ち上がって離陸、相手の位置(最大360px先)に着地。予告1800msは半径180から歩いて出られる長さ(AOE_TELEGRAPH_AUDIT)。
  leap: {
    key: 'leap', recoverMs: 800,
    steps: [{ shape: { kind: 'circle', radius: 180, atTarget: 360 }, windupMs: 1350, motion: 'leap', motionMs: 450, motionPx: 360, damage: 28, kb: { distPx: 200, ms: 360 } }],
  },
  // 7. 突進: 前脚を掻いていななき → 一直線に駆け抜け、終点で斬る(当たるのは終点の扇だけ)。
  charge: {
    key: 'charge', recoverMs: 700,
    steps: [{ shape: { kind: 'fan', radius: 200, arcDeg: 120, atEnd: true }, windupMs: 900, motion: 'run', motionMs: 450, motionPx: 520, damage: 22 }],
  },
  // 8. タックル(一番速い技): 体を沈めて、短く踏み込み、止まった瞬間に正面の帯へ。大きく吹き飛ばす。
  tackle: {
    key: 'tackle', recoverMs: 500,
    steps: [{ shape: band(220, 50), windupMs: 350, motion: 'lunge', motionMs: 160, motionPx: 140, damage: 16, kb: { distPx: 260, ms: 380 } }],
  },
  // 9. 後半(HP半分から): 跳躍 → 着地の瞬間から溜め直してタックル突進(終点の帯)。
  leapcharge: {
    key: 'leapcharge', recoverMs: 800,
    steps: [
      { shape: { kind: 'circle', radius: 180, atTarget: 360 }, windupMs: 1350, motion: 'leap', motionMs: 450, motionPx: 360, damage: 28, kb: { distPx: 200, ms: 360 } },
      { shape: { kind: 'endBand', length: 150, halfWidth: 50 }, windupMs: 450, motion: 'run', motionMs: 500, motionPx: 600, damage: 22, kb: { distPx: 260, ms: 380 } },
    ],
  },
};

/** 段の溜め開始から当たる瞬間までの長さ。 */
export const heroStepHitDelay = (step: HeroStepSpec): number => step.windupMs + step.motionMs;

// ---------------------------------------------------------------------------------------------
// 技の選び方
// ---------------------------------------------------------------------------------------------
/** 距離の帯。近(<150)/ 中(150〜330)/ 遠(330〜480)。 */
export const HERO_NEAR = 150;
export const HERO_MID = 330;

export const heroMoveCandidates = (dist: number, phase2: boolean): HeroMoveKey[] => {
  if (dist < HERO_NEAR) return ['combo', 'upper', 'tackle'];
  if (dist < HERO_MID) return ['overhead', 'sweep', 'rear'];
  return phase2 ? ['leap', 'charge', 'leapcharge'] : ['leap', 'charge'];
};

/** 候補から1つ選ぶ。直前と同じ技は避ける(候補が1つしかない時を除く)。rnd は [0,1)。 */
export const pickHeroMove = (dist: number, phase2: boolean, last: HeroMoveKey | undefined, rnd: number): HeroMoveKey => {
  const c = heroMoveCandidates(dist, phase2);
  const pool = c.length > 1 && last ? c.filter(k => k !== last) : c;
  return pool[Math.min(pool.length - 1, Math.floor(Math.max(0, rnd) * pool.length))];
};

/**
 * つなぎ(抽選しない連係・設計書 §5-2): タックルが当たったら必ず振り下ろし /
 * 突進で駆け抜けた後、相手が中距離に残っていれば振り返って横薙ぎ。それ以外は null(休みへ)。
 */
export const heroFollowUp = (move: HeroMoveKey, hitSomething: boolean, distAfter: number): HeroMoveKey | null => {
  if (move === 'tackle' && hitSomething) return 'overhead';
  if (move === 'charge' && distAfter >= HERO_NEAR && distAfter < HERO_MID) return 'sweep';
  return null;
};

export const heroRestMs = (result: 'hit' | 'miss' | 'countered'): number => HERO_REST_MS[result];

// ---------------------------------------------------------------------------------------------
// 狙い(中立)
// ---------------------------------------------------------------------------------------------
export interface HeroTargetCand { id: string; x: number; y: number; onScreen: boolean }

/**
 * 狙う相手を決める(設計書 §3-1)。候補=プレイヤー/守護霊/敵(呼び手が死体・ボス級を除いて渡す)。
 * 中心から HERO_AGGRO_RANGE 以内で画面内の、一番近いもの。今の相手は粘りの間(latchUntil)は変えない
 * (相手が候補から消えた=死んだ・画面外・範囲外の時を除く)。
 */
export const pickHeroTarget = (
  hx: number, hy: number, cands: readonly HeroTargetCand[], currentId: string | undefined,
  latchUntil: number | undefined, now: number, range = HERO_AGGRO_RANGE,
): HeroTargetCand | null => {
  const r2 = range * range;
  const live = cands.filter(c => c.onScreen && (c.x - hx) ** 2 + (c.y - hy) ** 2 <= r2);
  if (live.length === 0) return null;
  if (currentId !== undefined && latchUntil !== undefined && now < latchUntil) {
    const keep = live.find(c => c.id === currentId);
    if (keep) return keep;
  }
  let best = live[0], bd = Infinity;
  for (const c of live) {
    const d = (c.x - hx) ** 2 + (c.y - hy) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  return best;
};

/**
 * 雑魚・強個体が英雄を追うか(設計書 §3-2)。英雄が自分から HERO_LURE_RANGE 以内で、プレイヤーより近い時だけ。
 * ボス級はこの関数を呼ばない(呼び手=resolveEnemyTarget がボスなら見ない)。
 */
export const mobPrefersHero = (ex: number, ey: number, heroX: number, heroY: number, playerX: number, playerY: number): boolean => {
  const dh2 = (heroX - ex) ** 2 + (heroY - ey) ** 2;
  if (dh2 > HERO_LURE_RANGE * HERO_LURE_RANGE) return false;
  return dh2 < (playerX - ex) ** 2 + (playerY - ey) ** 2;
};

// ---------------------------------------------------------------------------------------------
// 図形
// ---------------------------------------------------------------------------------------------
const DEG = Math.PI / 180;

/**
 * 段の当たりの形を、溜め開始の瞬間の位置と狙いから作る(以後動かさない)。
 * hx,hy=英雄の中心 / ax,ay=狙いの点 / faceX=左右の向き(払い上げの「右」を決める)。
 * 戻り値の endX/endY=動きの終点(踏み込み・跳躍・突進の行き先。動かない段は今の位置)。
 */
export const heroStepShape = (
  step: HeroStepSpec, hx: number, hy: number, ax: number, ay: number, faceX: 1 | -1,
): { shape: HeroShape; endX: number; endY: number; ang: number } => {
  let dx = ax - hx, dy = ay - hy;
  let d = Math.hypot(dx, dy);
  if (d < 0.001) { dx = faceX; dy = 0; d = 1; }
  const ux = dx / d, uy = dy / d;
  const ang = Math.atan2(uy, ux);
  const lungeTail = step.lungeTailPx ?? 0;
  let endX = hx, endY = hy;
  if (step.motion === 'lunge' || step.motion === 'run') { endX = hx + ux * step.motionPx; endY = hy + uy * step.motionPx; }
  if (step.motion === 'leap') {
    const reach = Math.min(d, step.motionPx);
    endX = hx + ux * reach; endY = hy + uy * reach;
  }
  if (lungeTail > 0) { endX = hx + ux * lungeTail; endY = hy + uy * lungeTail; }
  const sh = step.shape;
  if (sh.kind === 'band') {
    return { shape: { kind: 'band', fx: hx, fy: hy, tx: hx + ux * sh.length, ty: hy + uy * sh.length, halfWidth: sh.halfWidth }, endX, endY, ang };
  }
  if (sh.kind === 'endBand') {
    return { shape: { kind: 'band', fx: endX, fy: endY, tx: endX + ux * sh.length, ty: endY + uy * sh.length, halfWidth: sh.halfWidth }, endX, endY, ang };
  }
  if (sh.kind === 'fan') {
    // 「右」= 画面の向きで、顔の向き(faceX)の側から見た右。左向きなら反対へ回す。
    const off = (sh.offsetDeg ?? 0) * DEG * (faceX > 0 ? 1 : -1);
    const cx = sh.atEnd ? endX : hx, cy = sh.atEnd ? endY : hy;
    return { shape: { kind: 'fan', cx, cy, angle: ang + off, halfArc: (sh.arcDeg / 2) * DEG, radius: sh.radius }, endX, endY, ang };
  }
  // circle
  if (sh.atTarget !== undefined) {
    return { shape: { kind: 'circle', cx: endX, cy: endY, radius: sh.radius }, endX, endY, ang };
  }
  const fwd = sh.forward ?? 0;
  return { shape: { kind: 'circle', cx: hx + ux * fwd, cy: hy + uy * fwd, radius: sh.radius }, endX, endY, ang };
};

/** 角度を [-π, π] へ。 */
const wrapAng = (a: number): number => {
  let r = a;
  while (r > Math.PI) r -= 2 * Math.PI;
  while (r < -Math.PI) r += 2 * Math.PI;
  return r;
};

/** 円(中心 px,py・半径 pr)が扇に触れるか。扇の縁の外へは当たりを広げない(半径+相手の半径、角度は相手の見かけの幅だけ許す)。 */
export const circleHitsFan = (
  px: number, py: number, pr: number, cx: number, cy: number, angle: number, halfArc: number, radius: number,
): boolean => {
  const dx = px - cx, dy = py - cy;
  const d = Math.hypot(dx, dy);
  if (d > radius + pr) return false;
  if (d <= pr) return true; // 扇の要に重なっている
  const slack = Math.asin(Math.min(1, pr / d));
  return Math.abs(wrapAng(Math.atan2(dy, dx) - angle)) <= halfArc + slack;
};

const distToSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const vx = bx - ax, vy = by - ay;
  const l2 = vx * vx + vy * vy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2)) : 0;
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
};

/** 円(相手)が形に触れるか(帯は線分からの距離・円は中心距離)。 */
export const circleHitsHeroShape = (px: number, py: number, pr: number, s: HeroShape): boolean => {
  if (s.kind === 'circle') return Math.hypot(px - s.cx, py - s.cy) <= s.radius + pr;
  if (s.kind === 'band') return distToSeg(px, py, s.fx, s.fy, s.tx, s.ty) <= s.halfWidth + pr;
  return circleHitsFan(px, py, pr, s.cx, s.cy, s.angle, s.halfArc, s.radius);
};

// ---------------------------------------------------------------------------------------------
// 動き(位置)— 全部 加速→減速(慣性MUST)
// ---------------------------------------------------------------------------------------------
export const easeInOut = (t: number): number => {
  const u = Math.max(0, Math.min(1, t));
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
};

/** 跳躍の高さ(見た目だけ・判定は地面)。u=滞空の進み。頂点 peakPx。 */
export const heroLeapLift = (u: number, peakPx = 70): number => {
  const t = Math.max(0, Math.min(1, u));
  return 4 * t * (1 - t) * peakPx;
};

// ---------------------------------------------------------------------------------------------
// 絵のコマ(設計書 §5-1。実物を1コマずつ見て割った)
// ---------------------------------------------------------------------------------------------
export const HERO_SHEETS = {
  walk: { name: 'mutant-hero-walk', frames: 10 },
  rear: { name: 'mutant-hero-rear', frames: 16 },
  slash: { name: 'mutant-hero-slash', frames: 16 },
} as const;
export type HeroSheetKey = keyof typeof HERO_SHEETS;
export interface HeroFrame { sheet: HeroSheetKey; frame: number }

/** 並びを u∈[0,1] に均等に割り付ける。 */
const seqAt = (seq: readonly number[], u: number): number =>
  seq[Math.min(seq.length - 1, Math.max(0, Math.floor(Math.max(0, Math.min(0.999999, u)) * seq.length)))];

/** 溜め: 並びを前半(holdFrom まで)で流し、あとは最後のコマで止める=「構えで止まる」。 */
const windupHold = (seq: readonly number[], u: number, holdFrom = 0.6): number =>
  u >= holdFrom ? seq[seq.length - 1] : seqAt(seq, u / holdFrom);

/** 斬撃系の段の「構え」と「振り抜き」。 */
const SLASH_POSE: Readonly<Record<'overhead' | 'horizontal' | 'upper', { windup: readonly number[]; strike: readonly number[]; recover: readonly number[] }>> = {
  overhead: { windup: [8, 9, 10], strike: [11, 12], recover: [13, 14, 15] },
  horizontal: { windup: [0, 1, 2, 3], strike: [4, 5, 6], recover: [7] },
  // 払い上げ: 逆再生は2コマだけ(12→10・11を飛ばして速さで逆回しを隠す)。戻りは 9→8→0 で構えを解く。
  upper: { windup: [13, 14, 15], strike: [12, 10], recover: [9, 8, 0] },
};
/** 三連の段つなぎ: 前の段の終わりのコマから、次の段の構えへ途切れずに入る並び。 */
const COMBO_WINDUP: Readonly<Record<number, readonly number[]>> = {
  1: [13, 14, 15, 0, 1, 2, 3], // 1段目の振り下ろし(刃は左下=12)から、下段を通って水平の構えへ
  2: [7, 8, 9, 10],            // 2段目の横薙ぎ(6)から、頭上へ振りかぶり直す
};

/** その段が斬撃のどの構えか。 */
export const heroSlashPose = (move: HeroMoveKey, step: number): 'overhead' | 'horizontal' | 'upper' | null => {
  if (move === 'overhead') return 'overhead';
  if (move === 'combo') return step === 1 ? 'horizontal' : 'overhead';
  if (move === 'upper') return 'upper';
  if (move === 'sweep') return 'horizontal';
  return null;
};

export interface HeroFrameInput {
  state: string;          // bossState
  move?: HeroMoveKey;
  step: number;
  /** 今の州の進み 0..1(州の長さが決まっている時)。 */
  u: number;
  /** 州に入ってからの経過ms。 */
  sinceMs: number;
  /** 走り・踏み込みで進んだ距離(px)。駆け足のコマは距離で送る。 */
  travelPx?: number;
  /** 佇みの位相をずらす個体の値(0..1)。 */
  phase?: number;
}

/** 佇み: 2〜3回掻いて止まり、間を置いてまた掻く(周期に揺らぎ)。 */
const idlePawFrame = (sinceMs: number, phase: number): number => {
  const period = 2600 + Math.round(phase * 900);
  const t = (sinceMs + phase * 1700) % period;
  const paws = phase < 0.5 ? 2 : 3;
  const pawMs = 300;
  if (t >= paws * pawMs) return 0;
  return [0, 1, 2, 1][Math.floor((t % pawMs) / (pawMs / 4))];
};

/**
 * 今のコマ。null=歩き/立ち絵の既定の仕組みへ任せる(追いかけ・帰巣の間)。
 * 州: hero-windup(溜め)/ hero-motion(踏み込み・跳躍・走り)/ hero-strike(振り抜き)/ hero-recover / hero-idle / hero-roar / hero-turn
 */
export const heroFrameFor = (inp: HeroFrameInput): HeroFrame | null => {
  const { state, move, step, u } = inp;
  if (state === 'hero-idle') return { sheet: 'rear', frame: idlePawFrame(inp.sinceMs, inp.phase ?? 0) };
  if (state === 'hero-roar') {
    const t = inp.sinceMs;
    if (t < HERO_ROAR_RISE_MS) return { sheet: 'rear', frame: seqAt([0, 1, 2, 3, 4, 5, 6, 7], t / HERO_ROAR_RISE_MS) };
    if (t < HERO_ROAR_RISE_MS + HERO_ROAR_HOLD_MS) return { sheet: 'rear', frame: 7 };
    const d = (t - HERO_ROAR_RISE_MS - HERO_ROAR_HOLD_MS) / Math.max(1, HERO_ROAR_MS - HERO_ROAR_RISE_MS - HERO_ROAR_HOLD_MS);
    return { sheet: 'rear', frame: d < 1 ? seqAt([8, 9, 10, 11, 12], d) : seqAt([13, 14, 15], Math.min(0.999, d - 1)) };
  }
  // 怯み: 低い構え(斬撃8)で止まり、終わりで下段(13)へ。
  if (state === 'hero-flinch') return { sheet: 'slash', frame: u < 0.75 ? 8 : 13 };
  // 向き直り: 呼び手(描画)が直前のコマを保つ。ここは何も返さない。
  if (state === 'hero-turn') return null;
  if (!move) return null;
  const pose = heroSlashPose(move, step);
  if (pose) {
    const p = SLASH_POSE[pose];
    if (state === 'hero-windup') return { sheet: 'slash', frame: windupHold(move === 'combo' ? (COMBO_WINDUP[step] ?? p.windup) : p.windup, u) };
    if (state === 'hero-strike') return { sheet: 'slash', frame: seqAt(p.strike, u) };
    if (state === 'hero-recover') return { sheet: 'slash', frame: seqAt(p.recover, u) };
    return { sheet: 'slash', frame: p.windup[p.windup.length - 1] };
  }
  if (move === 'rear') {
    // 0→7 をゆっくり・7で止め、最後の15%で 8→12 を速く=前脚が着く瞬間が当たる瞬間。
    if (state === 'hero-windup') {
      if (u < 0.7) return { sheet: 'rear', frame: seqAt([0, 1, 2, 3, 4, 5, 6, 7], u / 0.7) };
      if (u < 0.85) return { sheet: 'rear', frame: 7 };
      return { sheet: 'rear', frame: seqAt([8, 9, 10, 11, 12], (u - 0.85) / 0.15) };
    }
    if (state === 'hero-strike') return { sheet: 'rear', frame: 12 };
    return { sheet: 'rear', frame: seqAt([13, 14, 15], u) };
  }
  const isLeapStep = move === 'leap' || (move === 'leapcharge' && step === 0);
  if (isLeapStep) {
    // 溜め: 0→1 を構え、最後の2割で 2→3 を速く通して離陸。滞空: 4→7(前脚を畳む)→ 8→11(降下)。着地=12。
    if (state === 'hero-windup') return { sheet: 'rear', frame: u < 0.8 ? seqAt([0, 1], u / 0.8) : seqAt([2, 3], (u - 0.8) / 0.2) };
    if (state === 'hero-motion') return { sheet: 'rear', frame: seqAt([4, 5, 6, 7, 8, 9, 10, 11], u) };
    if (state === 'hero-strike') return { sheet: 'rear', frame: 12 };
    return { sheet: 'rear', frame: seqAt([13, 14, 15], u) };
  }
  if (move === 'charge') {
    // 溜め: 2回掻いてから、前脚を浮かせたまま(棹立ち2)体を沈めて止まる=「そっちへ行く」を体で言う。
    if (state === 'hero-windup') return { sheet: 'rear', frame: u < 0.55 ? [0, 1, 2, 1][Math.floor(inp.sinceMs / 140) % 4] : 2 };
    if (state === 'hero-motion') {
      // 駆け足(進んだ距離で送る=足が滑らない)→ 終点の手前2割で刃を頭上へ構える。
      if (u > 0.8) return { sheet: 'slash', frame: seqAt([9, 10], (u - 0.8) / 0.2) };
      return { sheet: 'walk', frame: Math.floor((inp.travelPx ?? 0) / HERO_STRIDE_PX) % 10 };
    }
    if (state === 'hero-strike') return { sheet: 'slash', frame: seqAt([11, 12], u) };
    return { sheet: 'slash', frame: seqAt([13, 14, 15], u) };
  }
  // タックル(と後半の突進の2段目): 溜め=棹立ち 0→2 で体を沈める / 踏み込み・走り=駆け足 / 止まった瞬間で当てる。
  if (state === 'hero-windup') return { sheet: 'rear', frame: seqAt([0, 1, 2], Math.min(1, u * 1.4)) };
  if (state === 'hero-motion') {
    return move === 'tackle'
      ? { sheet: 'walk', frame: seqAt([0, 1, 2], u) }
      : { sheet: 'walk', frame: Math.floor((inp.travelPx ?? 0) / HERO_STRIDE_PX) % 10 };
  }
  // 当たりの1枚: 頭を落として前脚を畳む(棹立ち3→4)=体ごとぶつかった絵。
  if (state === 'hero-strike') return { sheet: 'rear', frame: seqAt([3, 4], u) };
  return { sheet: 'rear', frame: seqAt([2, 1, 0], u) };
};

/** 跳躍の滞空中の高さ(描画だけ・px)。滞空でなければ 0。 */
export const heroLiftPx = (e: { bossState?: string; heroMove?: HeroMoveKey; heroStep?: number; heroStateAt?: number; bossStateUntil?: number }, gameTime: number): number => {
  if (e.bossState !== 'hero-motion' || e.heroStateAt === undefined || e.bossStateUntil === undefined) return 0;
  const leap = e.heroMove === 'leap' || (e.heroMove === 'leapcharge' && (e.heroStep ?? 0) === 0);
  if (!leap) return 0;
  const u = (gameTime - e.heroStateAt) / Math.max(1, e.bossStateUntil - e.heroStateAt);
  return heroLeapLift(u, 90);
};

/**
 * 寄りズーム(ボスの距離ズーム・カメラの先読み・ピント)の対象にするか(社長裁定2026-10-03)。
 * 英雄はボス戦の判定から外してあるので、**プレイヤーか守護霊を狙っている間だけ**ボスと同じく寄る。
 * ゾンビと斬り合っているだけなら寄らない(プレイヤーの戦いと関係ない方へ画を引っ張らない)。
 */
/**
 * 扇の斬撃を「どちらの縁から、どちらの縁へ」振るか(剣と骨色の弧が同じ道をなぞるための1本)。
 * 振り下ろす技は**画面の上側の縁から**中心線を通って下側の縁へ(左右どちらへ斬っても同じ読み=上から前へ)。
 * 払い上げ(rising)だけは下側から上側へ。返す start→end は中心線(angle)を通る向き。
 * 真上・真下へ斬る時(中心線が垂直から15度以内)は上下が決まらないので、**向いている側(faceX)の縁から**振る
 * (狙いが1px動いただけで振る向きが入れ替わらない)。
 */
export const heroSwingArc = (angle: number, halfArc: number, rising: boolean, faceX = 1): { start: number; end: number } => {
  const e1 = angle - halfArc, e2 = angle + halfArc;
  const nearVertical = Math.abs(Math.cos(angle)) < Math.sin(15 * DEG);
  const e1First = nearVertical
    ? (Math.sign(Math.cos(e1)) || 1) === (faceX >= 0 ? 1 : -1)
    : Math.sin(e1) <= Math.sin(e2);
  return (rising ? !e1First : e1First) ? { start: e1, end: e2 } : { start: e2, end: e1 };
};

export const heroZoomEligible = (e: { type: string; heroTargetId?: string; health: number }): boolean =>
  e.type === HERO_TYPE && e.health > 0 && (e.heroTargetId === 'player' || e.heroTargetId === 'ghost');

/** 描画のピント(被写界深度)を英雄に合わせるか: 寄りズームの対象の間+技の溜め〜当たりの間(狙いが誰でも)。 */
export const heroFocusEligible = (e: { type: string; heroTargetId?: string; health: number; bossState?: string }): boolean =>
  heroZoomEligible(e) || (e.type === HERO_TYPE && e.health > 0
    && (e.bossState === 'hero-windup' || e.bossState === 'hero-motion' || e.bossState === 'hero-strike'));
