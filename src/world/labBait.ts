// ステージ2「変異塊」の叩き潰しの登場(research/LAB_CRAWLER.md §11・社長 2026-10-24)。
// 社長「意図的に潰される用の敵を等間隔に配置し、そこを通過するとそのイベントが発生する(バイオハザードによくある演出)」
// 「レベル2の敵が前か斜め前の画面外からプレイヤーを通り過ぎる形で突進してくる。それを叩き潰して登場。」
//
// ここは判定と位置の純関数だけ(renderer-agnostic・store を読まない)。配線は utils/labBaitTick.ts。
import { CRAWLER_HIT_W, CRAWLER_SLAM_FWD_PX, CRAWLER_SLAM_HAND_UP_PX } from './labCrawler';

/** 生け贄の数(資料→ゴールを4等分した3点)。 */
export const LAB_BAIT_COUNT = 3;
/** 発火: 生け贄が進む向きの見えている端からこれだけ外に居るうちに起こす(=まだ画面の外)。 */
export const LAB_BAIT_FIRE_MARGIN_PX = 60;
/** 通り過ぎる筋の縦のずれ(生け贄の出た側へ)。プレイヤーの横を通り過ぎる=重ならない。 */
export const LAB_BAIT_LANE_PX = 110; // 60→110(クリエイティブ監査: 60 だと体の絵が重なり「すり抜け」に見える)
/**
 * 着地点の後ろへの距離(px)。「すぐ後ろ」。叩きつけの円(半径230)は立ち止まったプレイヤーの背中に掛かる=赤い円が見えたら前へ出る
 * (溜めはスローで約2秒・歩き続けていれば当たる瞬間には円の外)。スマホの画面(幅430)に、前へ逃げるプレイヤーと叩く地点を両方収める距離。
 */
export const LAB_BAIT_LAND_PX = 200;
/** 突進の速さ=プレイヤーの歩き×これ。 */
export const LAB_BAIT_SPEED_MULT = 2.4;
/** 突進の出だしで速さが乗るまで(ms)と、着地点の手前で減速を始める距離(px)。 */
export const LAB_BAIT_ACCEL_MS = 150;
export const LAB_BAIT_BRAKE_PX = 120;
/** 塊が来ないまま突進/待ちがこれだけ続いたら、普通の敵に戻す(ms)。 */
export const LAB_BAIT_GIVE_UP_MS = 6000;
/** 塊を置き直す時、箱の前の縁を見えている端からこれだけ外へ。 */
export const LAB_BAIT_WARP_OUT_PX = 60;

export type LabBaitPhase = 'wait' | 'charge' | 'held';

export interface LabBaitSlot { cx: number; cy: number }

/** 置く位置(純関数): 資料の x → ゴールの x を4等分した3点。縦は帯の上の縁・下の縁へ交互(1つ目が上)。 */
export const labBaitSlots = (docX: number, goalX: number, bandLimit: number, enemyH: number): LabBaitSlot[] => {
  if (docX === goalX) return [];
  const edge = Math.max(0, bandLimit - enemyH / 2 - 12);
  const out: LabBaitSlot[] = [];
  for (let k = 1; k <= LAB_BAIT_COUNT; k++) {
    out.push({ cx: docX + (goalX - docX) * (k / (LAB_BAIT_COUNT + 1)), cy: (k % 2 === 1 ? -1 : 1) * edge });
  }
  return out;
};

/**
 * 発火するか(純関数)。dir=進む向き(ゴールの方・±1)。aheadEdge=プレイヤーの中心から進む向きの見えている端までの距離(ズーム込み)。
 * 生け贄が前に居て、見えている端+マージンより内側に入ったら(=次のフレームには画面に入りうる)。
 */
export const labBaitShouldFire = (baitX: number, playerX: number, dir: number, aheadEdge: number): boolean => {
  const d = dir * (baitX - playerX);
  return d > 0 && d <= aheadEdge + LAB_BAIT_FIRE_MARGIN_PX;
};

/** プレイヤーが生け贄を追い越したか(生け贄が後ろ)。 */
export const labBaitPassed = (baitX: number, playerX: number, dir: number): boolean => dir * (baitX - playerX) <= 0;

/** 後ろへの着地距離(純関数)。 */
export const labBaitLandDist = (): number => LAB_BAIT_LAND_PX;

/**
 * 通り過ぎる筋(純関数): プレイヤーの横 LAB_BAIT_LANE_PX の高さ。生け贄の出た側を優先し、帯からはみ出すなら反対側。
 * 突進はまず「発火の瞬間のプレイヤーの横」(W)を通り、それから着地点 L(後ろへ labBaitLandDist)へ向かう。
 */
export const labBaitLaneY = (pcy: number, baitY: number, bandLimit: number, enemyH: number): number => {
  const lim = Math.max(0, bandLimit - enemyH / 2 - 4);
  const pref = baitY < pcy ? -1 : 1;
  for (const s of [pref, -pref]) {
    const y = pcy + s * LAB_BAIT_LANE_PX;
    if (Math.abs(y) <= lim) return y;
  }
  return Math.max(-lim, Math.min(lim, pcy + pref * LAB_BAIT_LANE_PX));
};

/**
 * 突進の1ステップ(純関数・慣性つき): 出だしは LAB_BAIT_ACCEL_MS で最高速へ、着地点の手前 LAB_BAIT_BRAKE_PX から減速して止まる。
 * 戻り値 arrived=着いた。
 */
export const stepLabBaitCharge = (
  x: number, y: number, tx: number, ty: number, speedNow: number, maxSpeed: number, dtSec: number, brake = true,
): { x: number; y: number; speed: number; arrived: boolean } => {
  const dx = tx - x, dy = ty - y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return { x: tx, y: ty, speed: 0, arrived: true };
  const accel = maxSpeed / (LAB_BAIT_ACCEL_MS / 1000);
  // 止まれる速さ(手前から減速): v = max × 残り/ブレーキ距離 の平方根(等減速)。
  const brakeCap = brake ? maxSpeed * Math.sqrt(Math.min(1, dist / LAB_BAIT_BRAKE_PX)) : maxSpeed;
  const want = Math.min(maxSpeed, brakeCap);
  const speed = speedNow < want ? Math.min(want, speedNow + accel * dtSec) : want;
  const step = Math.max(speed * dtSec, Math.min(dist, 2));
  if (step >= dist) return { x: tx, y: ty, speed: 0, arrived: true };
  return { x: x + (dx / dist) * step, y: y + (dy / dist) * step, speed, arrived: false };
};

/**
 * 塊の置き直し先(純関数): 箱の前の縁が、プレイヤーの後ろの見えている端より LAB_BAIT_WARP_OUT_PX 外。
 * behindEdge=プレイヤーの中心から後ろの見えている端までの距離(ズーム込み)。戻り値は塊の中心 x。
 */
export const labBaitWarpX = (pcx: number, dir: number, behindEdge: number): number =>
  pcx - dir * (behindEdge + LAB_BAIT_WARP_OUT_PX + CRAWLER_HIT_W / 2);

/** 線分(突進の道)と点の最短距離(純関数・テスト用にも使う)。 */
export const segPointDist = (ax: number, ay: number, bx: number, by: number, px: number, py: number): number => {
  const vx = bx - ax, vy = by - ay;
  const L2 = vx * vx + vy * vy;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2)) : 0;
  return Math.hypot(ax + vx * t - px, ay + vy * t - py);
};

/** 塊が這い込む区間(溜めのこの割合までで手の着く点=L へ寄り切る。後半は止まって叩く)。 */
export const LAB_BAIT_LUNGE_FRAC = 0.55;
/** スローの当たった後の止まり(実時間 ms)・等速へ一気に戻る区間(ms)。 */
export const LAB_BAIT_SLOW_AFTER_MS = 90;
export const LAB_BAIT_SLOW_RETURN_MS = 280;
/** 場面のカメラ: 後ろへ寄せる上限(画面幅の比)・L を見えている端からこれだけ内側に入れる・寄せの時定数。 */
export const LAB_BAIT_CAM_MAX_FRAC = 0.45;
export const LAB_BAIT_CAM_INSET_PX = 60;
/** 叩きつけの後、カメラを戻すまでの余韻(ゲーム時間 ms)。 */
export const LAB_BAIT_SCENE_TAIL_MS = 800;

/** 手の着く点が L になる塊の位置(純関数)。向き=進む向き(dir<0 なら左向き)。 */
export const labBaitCrawlerPosForSlam = (lx: number, ly: number, dir: number): { x: number; y: number; facingLeft: boolean } =>
  ({ x: lx - dir * CRAWLER_SLAM_FWD_PX, y: ly + CRAWLER_SLAM_HAND_UP_PX, facingLeft: dir < 0 });

/** 這い込みの進み具合 0..1(行き過ぎで 1 を少し超える)。二拍の引きずり: 前へ6割→一拍止まる→残りを詰めて少し行き過ぎて戻る。区間ごとに加速→減速。 */
const easeInOut3 = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const labBaitLungeProgress = (k: number, overshoot: number): number => {
  const c = Math.max(0, Math.min(1, k));
  if (c < 0.55) return 0.6 * easeInOut3(c / 0.55);
  if (c < 0.73) return 0.6;
  if (c < 0.92) return 0.6 + (0.4 + overshoot) * easeInOut3((c - 0.73) / 0.19);
  return 1 + overshoot * (1 - easeInOut3((c - 0.92) / 0.08));
};
/** 這い込みの位置(純関数)。u=溜めの経過/溜めの長さ。溜めの LAB_BAIT_LUNGE_FRAC までで寄り切り、後半は止まって叩く。 */
export const labBaitLungePos = (sx: number, sy: number, ex: number, ey: number, u: number): { x: number; y: number } => {
  const dist = Math.hypot(ex - sx, ey - sy);
  const p = labBaitLungeProgress(u / LAB_BAIT_LUNGE_FRAC, dist > 1 ? 10 / dist : 0);
  return { x: sx + (ex - sx) * p, y: sy + (ey - sy) * p };
};

/**
 * スローの掛け方(純関数・二段): 這い込みと溜めの大半は LAB_BAIT_SLOW_A(重さが残る程度)、手が落ちる最後の LAB_BAIT_SLOW_B_GAME_MS
 * (ゲーム時間)は LAB_BAIT_SLOW_B まで落とし、当たった後は短く戻す。戻り値は store の timeSlow* に直接書く値(段ごと)。
 */
export const LAB_BAIT_SLOW_A = 0.7;
export const LAB_BAIT_SLOW_B = 0.18;
export const LAB_BAIT_SLOW_B_GAME_MS = 200;
export const labBaitSlowParams = (remainGameMs: number, stage: 'a' | 'b'): { scale: number; durationMs: number; holdMs: number } => {
  if (stage === 'a') {
    const holdMs = Math.max(0, remainGameMs - LAB_BAIT_SLOW_B_GAME_MS) / LAB_BAIT_SLOW_A;
    return { scale: LAB_BAIT_SLOW_A, durationMs: holdMs + 1, holdMs };
  }
  const holdMs = Math.max(0, remainGameMs) / LAB_BAIT_SLOW_B + LAB_BAIT_SLOW_AFTER_MS;
  return { scale: LAB_BAIT_SLOW_B, durationMs: holdMs + LAB_BAIT_SLOW_RETURN_MS, holdMs };
};
/** 溜めの始まりから当たる瞬間までの実時間(ms・二段のスロー込み)。溜めの音の頂点を当たる瞬間に合わせるのに使う。 */
export const labBaitRealMsToHit = (windupGameMs: number): number =>
  Math.max(0, windupGameMs - LAB_BAIT_SLOW_B_GAME_MS) / LAB_BAIT_SLOW_A + Math.min(windupGameMs, LAB_BAIT_SLOW_B_GAME_MS) / LAB_BAIT_SLOW_B;

/**
 * 場面のカメラの後ろへの寄せ量(純関数・正の px=後ろへ)。L(今のプレイヤーからの距離 landDist)が後ろの見えている端から LAB_BAIT_CAM_INSET_PX 内側に入る量。
 * 既定の寄せ(baseLead)より小さくはしない・上限は画面幅×LAB_BAIT_CAM_MAX_FRAC。halfView=見えている半幅(ズーム込み)、
 * lookAhead=進む向きへのカメラの先読みの最大(その分だけ後ろが狭くなる)。
 */
export const labBaitCamLead = (landDist: number, halfView: number, lookAhead: number, viewW: number, baseLead: number): number => {
  const need = landDist + LAB_BAIT_CAM_INSET_PX + lookAhead - halfView;
  // 進む向きの前に見えている幅の2割は必ず残す(逃げる先が見えなくならない)。
  const frontCap = halfView - 0.4 * halfView - lookAhead;
  return Math.max(0, Math.min(viewW * LAB_BAIT_CAM_MAX_FRAC, frontCap, Math.max(baseLead, need)));
};
/** 場面の間の文脈ズームの目標(引き)。塊の前半身・L・前へ逃げるプレイヤーを同時に収める(スマホ縦)。 */
export const LAB_BAIT_ZOOM = 0.72;
/** 突進の間、カメラを進む向きへ寄せる量(画面幅の比)。突進が読め、背後の塊が画面の外へ出る。 */
export const LAB_BAIT_CAM_FORWARD_FRAC = 0.12;
/** カメラの寄せの時定数: 前へ振る/後ろへ振る(重く)/場面の後に戻す(遅く)。 */
export const LAB_BAIT_CAM_FWD_TAU_S = 0.25;
export const LAB_BAIT_CAM_BACK_TAU_S = 0.45;
export const LAB_BAIT_CAM_RETURN_TAU_S = 1.0;

/** 線分が矩形と交わるか(純関数・突進の道が壁に当たるかの判定)。 */
export const segHitsRect = (ax: number, ay: number, bx: number, by: number, r: { x: number; y: number; width: number; height: number }, pad = 0): boolean => {
  const x0 = r.x - pad, y0 = r.y - pad, x1 = r.x + r.width + pad, y1 = r.y + r.height + pad;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    return true;
  };
  return clip(-dx, ax - x0) && clip(dx, x1 - ax) && clip(-dy, ay - y0) && clip(dy, y1 - ay) && t0 <= t1;
};

/** 進行中の場面(store の labBaitScene)。位置はすべて世界座標。 */
export interface LabBaitScene {
  k: number;
  baitId: string;
  /** charge=走っている / held=着いて待つ(塊が別の叩きつけの最中なら終わるまで) / lunge=塊が這い込みながら溜め / tail=叩いた後の余韻 */
  phase: 'charge' | 'held' | 'lunge' | 'tail';
  dir: number;
  firedAt: number;
  /** 通り過ぎる点 W と着地点 L。 */
  wx: number; wy: number; lx: number; ly: number;
  /** W を過ぎた(L へ向かっている)。 */
  viaW: boolean;
  /** 生け贄がプレイヤーの横を過ぎた(カメラを後ろへ寄せ・引き始める)。 */
  passed: boolean;
  speed: number;
  /** 生け贄が過ぎた瞬間に塊が画面の外だった=見えない所へ置き直した(以後は這い込みまでそこで待たせる)。 */
  hideX: number | null; hideY: number;
  lunge: { sx: number; sy: number; ex: number; ey: number; at: number; hitAt: number } | null;
  /** 二段目のスロー(手が落ちる直前)を掛けた。 */
  slowB: boolean;
  /** 場面を閉じる時刻(ゲーム時間)。0=未定。 */
  endAt: number;
}

/** 場面の間の文脈ズームの目標(null=掛けない)。突進の頭から場面が閉じるまで引く(叩く時に引き切っているよう早めに)。描画とカメラの推定が同じ式を読む。 */
export const labBaitZoomTarget = (sc: LabBaitScene | null): number | null => (sc ? LAB_BAIT_ZOOM : null);
