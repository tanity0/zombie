// 拠点を開けた軍人が、その担当区域の中だけプレイヤーについてくる(research/ESCORT_FOLLOW.md)。
// 純関数だけ(store/Pixiを import しない=renderer非依存)。判定は store 側(gameStore の護衛ブロック)が呼ぶ。
// 画面の寸法を一切受け取らない=スマホの寸法で結果が変わらない(CLAUDE.md「PC版の作業はスマホを1pxも動かさない」)。
//
// 数値はすべて叩き台(設計書§3「実機で絞る」)。ここが唯一の出どころ=他所に数値を書き写さない。
import { sectorIndexForAngle } from '../world/pois';

export type EscortFollowState = 'follow' | 'return';

// ── 区域の判定(§2-1) ──────────────────────────────────────────
/** 区域の境目(角度)の余白(度)。入る時は区域の中へこれだけ入ったら、出る時は区域の外へこれだけ出たら切り替える。 */
export const FOLLOW_ANGLE_MARGIN_DEG = 6;
/** スタート地点付近を「どの区域にもいない」にする半径の余白(px)。入りは +、出は −(円周に沿って歩いてもパタつかない)。 */
export const FOLLOW_RADIUS_MARGIN_PX = 100;

const SECTOR_HALF_DEG = 45; // 4区域=1区域90°=軸から±45°

/** 区域 sector(0東/1南/2西/3北)の軸の角度(rad)。 */
const sectorAxisRad = (sector: number): number => (sector * Math.PI) / 2;

/** 角度差を [-π, π] へ。 */
const wrapPi = (a: number): number => {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/**
 * プレイヤーの中心 (px,py)(原点=スタート地点からの座標)が、区域 sector の「中」か。
 * prevIn=直前の判定(余白=ヒステリシスの保持)。innerRadius=軍備配置区域の外縁(AREA_THRESHOLDS[0])。
 * 入る: 軸から ±(45−6)° 以内 かつ 半径 ≥ innerRadius+100。 出る: 軸から ±(45+6)° 超 または 半径 < innerRadius−100。
 */
export const followZoneContains = (px: number, py: number, sector: number, prevIn: boolean, innerRadius: number): boolean => {
  const r = Math.hypot(px, py);
  const rLimit = innerRadius + (prevIn ? -FOLLOW_RADIUS_MARGIN_PX : FOLLOW_RADIUS_MARGIN_PX);
  if (r < rLimit) return false;
  const delta = Math.abs(wrapPi(Math.atan2(py, px) - sectorAxisRad(sector))) * (180 / Math.PI);
  const aLimit = SECTOR_HALF_DEG + (prevIn ? FOLLOW_ANGLE_MARGIN_DEG : -FOLLOW_ANGLE_MARGIN_DEG);
  return delta <= aLimit;
};

/** ヒステリシス無しの素の区域(テスト・参照用)。sectorIndexForAngle と同じ割り当て。 */
export const plainSectorOf = (px: number, py: number): number => sectorIndexForAngle(Math.atan2(py, px));

// ── ついてくる/帰るの切り替え(§2-1・§2-4) ────────────────────────
/** 区域を出てから帰り始めるまでの見送り(ms・§2-4)。 */
export const FOLLOW_SEE_OFF_MS = 600;

export interface FollowMachineInput {
  captured: boolean;        // 担当拠点が解放済みか(未解放の軍人は対象外)
  zoneIn: boolean;          // このフレームの区域判定(followZoneContains の結果)
  prev: EscortFollowState | undefined;
  inBaseCircle: boolean;    // 軍人が担当拠点の円の中か
  pauseUntil: number | undefined;
  now: number;
}
export interface FollowMachineResult {
  state: EscortFollowState | undefined;
  pauseUntil: number | undefined;
  /** このフレームでついてき始めた(通常/帰る途中から follow へ入った)。台詞の立ち上がり用。 */
  started: boolean;
}

export const stepFollowMachine = (i: FollowMachineInput): FollowMachineResult => {
  if (!i.captured) return { state: undefined, pauseUntil: undefined, started: false };
  if (i.zoneIn) return { state: 'follow', pauseUntil: undefined, started: i.prev !== 'follow' };
  if (i.prev === 'follow') {
    // 区域を出た。拠点の円の中に居るなら見送るまでもなく通常の巡回へ。
    if (i.inBaseCircle) return { state: undefined, pauseUntil: undefined, started: false };
    return { state: 'return', pauseUntil: i.now + FOLLOW_SEE_OFF_MS, started: false };
  }
  if (i.prev === 'return') {
    // 拠点の円に入ったら終わり(以降は今までどおり縁を巡回)。
    if (i.inBaseCircle) return { state: undefined, pauseUntil: undefined, started: false };
    return { state: 'return', pauseUntil: i.pauseUntil ?? i.now, started: false };
  }
  // 自己回復(検収R2 A-1): 状態が消えていても、拠点の外に居るなら帰る(見送りなし)。
  // 巡回の枝は「拠点の縁の近くに居る」前提なので、遠くから巡回へ入らない(画面外で固まる/接線速度で飛ぶ を入口ごと塞ぐ)。
  if (!i.inBaseCircle) return { state: 'return', pauseUntil: i.now, started: false };
  return { state: undefined, pauseUntil: undefined, started: false };
};

// ── 個体差(§2-3 人らしさ) ────────────────────────────────────
export const FOLLOW_GAP_MIN_PX = 60;
export const FOLLOW_GAP_MAX_PX = 90;
export const FOLLOW_WAKE_MIN_MS = 150;
export const FOLLOW_WAKE_MAX_MS = 250;

const hash01 = (id: string, salt: string): number => {
  let h = 2166136261;
  const s = `${id}#${salt}`;
  for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13;
  return ((h >>> 0) % 10000) / 10000;
};

export interface FollowProfile {
  gapPx: number;    // プレイヤーから目標点までの距離(60〜90)
  wakeMs: number;   // 止まっている所から動き出すまでの反応の遅れ(150〜250)
  side: 1 | -1;     // 後ろ斜めのどちら側に付くか(個体で固定)
}
export const escortFollowProfile = (id: string): FollowProfile => ({
  gapPx: FOLLOW_GAP_MIN_PX + (FOLLOW_GAP_MAX_PX - FOLLOW_GAP_MIN_PX) * hash01(id, 'gap'),
  wakeMs: FOLLOW_WAKE_MIN_MS + (FOLLOW_WAKE_MAX_MS - FOLLOW_WAKE_MIN_MS) * hash01(id, 'wake'),
  side: hash01(id, 'side') < 0.5 ? -1 : 1,
});

// ── 目標点(§5b S-2) ───────────────────────────────────────────
/** 後ろ斜めの角度(移動方向の真後ろからどれだけ横へ振るか・度)。叩き台(設計書に角度の指定が無い=報告の未決)。 */
export const FOLLOW_BACK_ANGLE_DEG = 40;
/** 体が重なる距離(足元どうし)。軍人・プレイヤーの体=28px。 */
export const FOLLOW_OVERLAP_PX = 28;
/** 重なった時に退く距離(半歩・§5b S-2「約20px」)。 */
export const FOLLOW_STEP_BACK_PX = 20;
/** 人を避け始める距離(体の重なりより外から、進路を横へ逸らす)。 */
export const FOLLOW_AVOID_PX = 46;

export interface Vec { x: number; y: number }

/**
 * 目標点=プレイヤーの移動方向の後ろ斜め(足元座標)。dir=最後の移動方向(止まっている間も保持された値)。
 * dir が無い/ゼロなら真後ろを決められないので右向き(1,0)を仮定する(呼び出し側が最後の向きを渡すのが本筋)。
 */
export const followBehindPoint = (playerFeet: Vec, dir: Vec | null | undefined, gapPx: number, side: 1 | -1): Vec => {
  let dx = dir?.x ?? 1, dy = dir?.y ?? 0;
  const l = Math.hypot(dx, dy);
  if (l < 1e-6) { dx = 1; dy = 0; } else { dx /= l; dy /= l; }
  const th = (FOLLOW_BACK_ANGLE_DEG * Math.PI) / 180;
  const back = Math.cos(th) * gapPx, lateral = Math.sin(th) * gapPx * side;
  // 後ろ = −dir、横 = dir を90°回した向き(−dy, dx)。
  return { x: playerFeet.x - dx * back + -dy * lateral, y: playerFeet.y - dy * back + dx * lateral };
};

// ── 動き(§2-3 慣性・制動・反応の遅れ) ─────────────────────────────
/** 速さの上げ下げにかける時間(秒・慣性MUST)。 */
export const FOLLOW_ACCEL_SEC = 0.3;
/** プレイヤーの今の速さに掛ける上限係数(離されない程度に少し速い)。 */
export const FOLLOW_SPEED_MULT = 1.15;
/** 止まっている所から動き出す、目標までの距離(px)。小さなズレでは歩き出さない(足踏みしない)。 */
export const FOLLOW_START_EPS_PX = 14;

/** プレイヤーの今の速さ(px/s)から、ついてくる軍人の最高速。 */
export const followSpeedCap = (playerSpeedPxPerSec: number): number => Math.max(0, playerSpeedPxPerSec) * FOLLOW_SPEED_MULT;

export interface FollowStepInput {
  state: EscortFollowState;
  x: number; y: number;          // 軍人の足元
  speed: number;                  // 慣性の現在の速さ(px/s)
  wakeAt: number | undefined;     // 動き出しの反応の遅れの期限(gameTime ms)。未設定=まだ数えていない
  now: number; dtSec: number;
  player: Vec;                    // プレイヤーの足元
  playerDir: Vec | null | undefined; // プレイヤーの最後の移動方向
  base: Vec;                      // 担当拠点の中心
  profile: FollowProfile;
  /** ついてくる時の最高速(followSpeedCap の値。自力で起きた後の減速はここへ掛けて渡す)。 */
  followVmax: number;
  /** 帰る時の速さ(今の前進と同じ。画面の内外で同じ)。 */
  returnVmax: number;
  /** 帰る前の見送りの期限(gameTime ms)。state==='return' で now がこれ未満の間は止まって見送る。 */
  pauseUntil?: number;
  /** 直近の進行方向(速度ベクトルで可)。見送りに入る時、この向きへ滑りながら減速して止まる(瞬停しない)。 */
  heading?: Vec;
}
export interface FollowStepResult {
  x: number; y: number;
  speed: number;
  wakeAt: number | undefined;
  /** このフレーム実際に動いたか(歩行アニメの切り替え=止まったら false)。 */
  moved: boolean;
  /** 進んだ向き(単位ベクトル)。動かなかった時は 0。 */
  dirX: number; dirY: number;
  /** 見送り中か(プレイヤーの方を向いたまま)。 */
  seeingOff: boolean;
  /** 体が重なって半歩退いている最中か。 */
  yielding: boolean;
}

const approach = (cur: number, target: number, maxDelta: number): number =>
  cur < target ? Math.min(target, cur + maxDelta) : Math.max(target, cur - maxDelta);

/**
 * 1フレームぶんの動き。速さは 0.3秒で上げ下げし(慣性)、止まる時は制動距離(v²/2a)の分だけ手前から減速して
 * 目標でちょうど止まる(瞬停も食い込みもしない)。止まっている所からは反応の遅れ(個体で150〜250ms)を置いてから動く。
 * 体が重なったら半歩(約20px)退く。プレイヤーの体の近くを通る時は進路を横へ逸らす(体を突き抜けない)。
 */
export const stepEscortFollow = (i: FollowStepInput): FollowStepResult => {
  const seeingOff = i.state === 'return' && i.now < (i.pauseUntil ?? 0);
  const following = i.state === 'follow';
  const vmax = Math.max(1, following ? i.followVmax : i.returnVmax);

  // ── 見送り: その場で止まる。今の進行方向へ滑りながら減速する(瞬停しない=慣性MUST) ──
  if (seeingOff) {
    const aStop = Math.max(vmax, i.followVmax, i.returnVmax) / FOLLOW_ACCEL_SEC;
    const sp = approach(i.speed, 0, aStop * i.dtSec);
    const hl = Math.hypot(i.heading?.x ?? 0, i.heading?.y ?? 0);
    if (sp <= 0.01 || hl < 1e-6) {
      return { x: i.x, y: i.y, speed: 0, wakeAt: undefined, moved: false, dirX: 0, dirY: 0, seeingOff, yielding: false };
    }
    const hx = (i.heading!.x) / hl, hy = (i.heading!.y) / hl;
    const st = sp * i.dtSec;
    return { x: i.x + hx * st, y: i.y + hy * st, speed: sp, wakeAt: undefined, moved: st > 0.02, dirX: hx, dirY: hy, seeingOff, yielding: false };
  }

  // ── 目標点 ──
  let tgt: Vec;
  let brake = true;      // 目標で止まるか(帰る時は拠点の円に入った所で次の巡回へ引き継ぐので止まらない)
  let yielding = false;
  if (following) tgt = followBehindPoint(i.player, i.playerDir, i.profile.gapPx, i.profile.side);
  else { tgt = { x: i.base.x, y: i.base.y }; brake = false; }

  // 体の重なり: 止まっている時にプレイヤーが体へ入ってきたら半歩退く(今の位置から離れる向きへ)。
  const pdx = i.x - i.player.x, pdy = i.y - i.player.y;
  const pd = Math.hypot(pdx, pdy);
  if (following && pd < FOLLOW_OVERLAP_PX) {
    let ax = pdx, ay = pdy;
    if (pd < 1e-3) { ax = -(i.playerDir?.x ?? 1); ay = -(i.playerDir?.y ?? 0); }
    const al = Math.hypot(ax, ay) || 1;
    tgt = { x: i.x + (ax / al) * FOLLOW_STEP_BACK_PX, y: i.y + (ay / al) * FOLLOW_STEP_BACK_PX };
    yielding = true;
  }

  const dx = tgt.x - i.x, dy = tgt.y - i.y;
  const dist = Math.hypot(dx, dy);
  const a = vmax / FOLLOW_ACCEL_SEC;

  // ── 止まっている所から動き出す(反応の遅れ) ──
  let wakeAt = i.wakeAt;
  if (i.speed < 0.01) {
    const startEps = yielding ? 1 : FOLLOW_START_EPS_PX;
    if (dist <= startEps) {
      return { x: i.x, y: i.y, speed: 0, wakeAt: undefined, moved: false, dirX: 0, dirY: 0, seeingOff: false, yielding };
    }
    const delay = i.state === 'return' ? 0 : i.profile.wakeMs;
    if (wakeAt === undefined) wakeAt = i.now + delay;
    if (i.now < wakeAt) {
      return { x: i.x, y: i.y, speed: 0, wakeAt, moved: false, dirX: 0, dirY: 0, seeingOff: false, yielding };
    }
  }
  wakeAt = undefined;

  // ── 速さ(慣性+制動距離) ──
  // 目標の手前 v²/2a から減速を始めれば、目標でちょうど止まる(desired=√(2a·残り距離))。上げ下げは必ず a×dt 以内=瞬停しない。
  // 食い込みは1フレームの歩幅を残り距離でクランプして防ぐ(下の step)。
  const desired = brake ? Math.min(vmax, Math.sqrt(2 * a * dist)) : vmax;
  const speed = approach(i.speed, desired, a * i.dtSec);

  // ── 進む向き(目標へ。プレイヤーの体の近くでは横へ逸らす) ──
  let ux = dist > 1e-6 ? dx / dist : 0, uy = dist > 1e-6 ? dy / dist : 0;
  if (following && pd < FOLLOW_AVOID_PX && pd > 1e-3) {
    const w = 1 - pd / FOLLOW_AVOID_PX;
    const awayX = pdx / pd, awayY = pdy / pd;
    // 横へ=外向きを個体の側へ90°回した向き(正面衝突で左右が決まらない時も個体ごとに決まる)。
    const tanX = -awayY * i.profile.side, tanY = awayX * i.profile.side;
    ux += awayX * w * 2 + tanX * w;
    uy += awayY * w * 2 + tanY * w;
    const ul = Math.hypot(ux, uy) || 1;
    ux /= ul; uy /= ul;
  }

  const step = brake ? Math.min(speed * i.dtSec, dist) : speed * i.dtSec;
  const moved = step > 0.02;
  return {
    x: i.x + ux * step, y: i.y + uy * step,
    speed,
    wakeAt, moved,
    dirX: moved ? ux : 0, dirY: moved ? uy : 0,
    seeingOff: false, yielding,
  };
};

// ── 回復(§5b S-1) ─────────────────────────────────────────────
/** 直近の被弾からこれだけ経ったら回復を始める(ms)。 */
export const FOLLOW_HEAL_DELAY_MS = 8000;
/** 回復の速さ(毎秒、最大体力に対する割合)。 */
export const FOLLOW_HEAL_PER_SEC = 0.03;

/**
 * ついてくる間(state==='follow')だけ、直近の被弾から8秒たったらゆっくり回復する。倒れている間・帰る間は回復しない。
 * 戻り値=新しい体力(変わらない時は同じ値)。
 */
export const followHeal = (
  e: { health?: number; maxHealth?: number; downedAt?: number; lastHitAt?: number },
  state: EscortFollowState | undefined, now: number, dtSec: number,
): number | undefined => {
  const max = e.maxHealth ?? 0;
  if (state !== 'follow' || e.downedAt !== undefined || max <= 0 || e.health === undefined) return e.health;
  if (e.health >= max) return e.health;
  if (now - (e.lastHitAt ?? -Infinity) < FOLLOW_HEAL_DELAY_MS) return e.health;
  return Math.min(max, e.health + max * FOLLOW_HEAL_PER_SEC * dtSec);
};

/**
 * 回復の見せ方(社長裁定2026-10-07「はい」): 回復で体力が増えたフレームは healingAt を打ち(線を出す)、
 * 満タンに達したフレームは healedAt を打つ(拠点の確保と同じ「満ちてから消える」見せ方)。増えていなければ前の値のまま。
 */
export const followHealMarks = (
  prevHealth: number | undefined, nextHealth: number | undefined, max: number | undefined, now: number,
  prev: { healingAt?: number; healedAt?: number },
): { healingAt?: number; healedAt?: number } => {
  if (prevHealth === undefined || nextHealth === undefined || !(nextHealth > prevHealth)) return prev;
  const full = (max ?? 0) > 0 && nextHealth >= (max as number) && prevHealth < (max as number);
  return { healingAt: now, healedAt: full ? now : prev.healedAt };
};

// ── 台詞(§2-3) ────────────────────────────────────────────────
/** 解放の直後(この時間以内)に始まるついてくる動きでは台詞を出さない(解放の台詞がその役をする・監査A-7)。 */
export const FOLLOW_LINE_MUTE_AFTER_CAPTURE_MS = 3000;
export const followLineMuted = (capturedAt: number | undefined, now: number): boolean =>
  capturedAt !== undefined && now - capturedAt < FOLLOW_LINE_MUTE_AFTER_CAPTURE_MS;

/**
 * 追う速さの基準にするプレイヤーの速さの範囲(素の歩きの倍率)。刀のダッシュ・スケーター×3 などの一瞬の速さに
 * 歩兵が飛びつかず、硬直中(速さ≒0)でも歩いて寄れるよう、人の足の範囲に収める(検収D1 A-1・叩き台)。
 */
export const FOLLOW_PLAYER_SPEED_CEIL_MULT = 1.3;
export const FOLLOW_PLAYER_SPEED_FLOOR_MULT = 0.6;

/** 後ろ斜めの基準の向きを更新する移動量(px)。これ未満の小刻みな動き・その場の向き替えでは更新しない(検収D1 A-2)。 */
export const FOLLOW_HEADING_STEP_PX = 30;

/** 後ろ斜めの基準の向き(なましたもの)。ax/ay=最後に向きを決めた地点。 */
export interface FollowHeading { dx: number; dy: number; ax: number; ay: number }

/**
 * プレイヤーが**同じ向きへ一定距離動いた時だけ**基準の向きを更新する。その場で向きを変える・左右に細かく揺れる
 * だけでは更新しない=軍人の目標点が跳ばない(止まったら止めコマ、が戦闘中も守られる)。
 * 初回は lastDirection(無ければ右)で始める。
 */
export const nextFollowHeading = (
  prev: FollowHeading | undefined,
  player: { x: number; y: number },
  lastDir: { x: number; y: number } | null | undefined,
): FollowHeading => {
  if (!prev) {
    const l = Math.hypot(lastDir?.x ?? 0, lastDir?.y ?? 0);
    return l > 1e-6 ? { dx: lastDir!.x / l, dy: lastDir!.y / l, ax: player.x, ay: player.y } : { dx: 1, dy: 0, ax: player.x, ay: player.y };
  }
  const mx = player.x - prev.ax, my = player.y - prev.ay;
  const m = Math.hypot(mx, my);
  if (m < FOLLOW_HEADING_STEP_PX) return prev;
  return { dx: mx / m, dy: my / m, ax: player.x, ay: player.y };
};
