// エンディング演出(仮組み・ENDING_SCENE.md 演出仕様v2)の状態機械 — 純関数のみ。
// CLAUDE.md「配線ロジックは純関数に切り出してテスト」「Rendering vs. game logic」に従い、
// 兵士(右→左・歩→停→発砲ループ)とフィル(=プレイヤー実体・自動右歩行+倒れ兵士の救護)の
// シミュレーションをここに集約する。useGameLoop は毎フレームこれを呼ぶだけ、pixiScene は
// 返ってきた値(x/y/phase/frame/velMult等)を読んで描くだけで、当たり判定は一切持たない
// (観賞シーン=兵士とフィルに衝突なし)。
//
// 対応表(演出仕様v2):
//   §1 兵士の発砲          → EndingSoldier.phase='fire' / lastShotAt(描画側がここからマズルフラッシュ/
//                             トレイル/薬莢/反動の経過時間を逆算する。ここには視覚専用の値を持たせない)
//   §7 慣性(兵士の停止/再発進) → phase='decel'/'accel' の velMult ease(EASE_MS)
//   §9 兵士の群れ           → DEFAULT_ENDING_SOLDIER_TUNING(常在数はuseGameLoop側の?endsoldiers=)
//   §2 フィルの描画          → EndingPhillState.frame(pixi側はこれをそのままコマ番号として使う)
//   §8 救護シーン           → EndingPhillState.phase='approachDecel'..'healReverse'+fallenSoldierAt()

// ---- 兵士 ---------------------------------------------------------------

export type EndingSoldierPhase = 'walk' | 'decel' | 'stopped' | 'fire' | 'accel';

export interface EndingSoldier {
  id: string;
  x: number;
  y: number;
  speed: number;           // 個体の基準歩速(px/s)。walk/decel/accelで使う上限速度。
  phase: EndingSoldierPhase;
  phaseMs: number;         // 現在フェーズの経過時間(ms)
  walkLegMs: number;       // 今の歩行区間の目標時間(ms・walkフェーズ用)
  stopDurationMs: number;  // 今回の停止(発砲前の間)の目標時間(ms・stoppedフェーズ用)
  velMult: number;         // 0..1 現在の速度係数(decel/accelのease。walk=1/stopped・fire=0)
  shotsPlanned: number;    // 今回のfireフェーズで撃つ発数
  shotsFired: number;
  nextShotAtMs: number;    // fireフェーズ内、次弾を撃つ経過時間(ms)
  lastShotAt: number;      // 直近の発砲 gameTime(ms)。0=まだ未発砲。描画側のマズルフラッシュ/反動の起点。
}

export interface EndingSoldierTuning {
  speedMin: number; speedMax: number;       // px/s
  walkMsMin: number; walkMsMax: number;
  stopMsMin: number; stopMsMax: number;
  shotsMin: number; shotsMax: number;       // 発砲フェーズで撃つ発数(整数)
  shotIntervalMs: number;
  easeMs: number;                            // decel/accelの慣性(CLAUDE.md「動きの絶対ルール」)
  bandHalfPx: number;                        // 初期/再投入時のY散らし半幅(playableAreaの帯に合わせる)
}

// ENDING_SCENE.md §9(叩き台)。実機調整用に useGameLoop が ?endsoldiers= 等で上書きして渡す。
export const DEFAULT_ENDING_SOLDIER_TUNING: EndingSoldierTuning = {
  speedMin: 52, speedMax: 78,
  walkMsMin: 2500, walkMsMax: 5000,
  stopMsMin: 600, stopMsMax: 1200,
  shotsMin: 1, shotsMax: 3,
  shotIntervalMs: 300,
  easeMs: 200,
  bandHalfPx: 100,
};

const lerpRange = (rand: () => number, min: number, max: number): number =>
  min + rand() * (max - min);

// 新規スポーン(初期配置/画面外再投入 共通)。phase='walk'から始める(いきなり停止/発砲では出さない)。
export const spawnEndingSoldier = (
  id: string, x: number, rand: () => number = Math.random,
  tuning: EndingSoldierTuning = DEFAULT_ENDING_SOLDIER_TUNING,
): EndingSoldier => ({
  id,
  x,
  y: lerpRange(rand, -tuning.bandHalfPx * 0.8, tuning.bandHalfPx * 0.8), // 帯の外周いっぱいは使わない(叩き台)
  speed: lerpRange(rand, tuning.speedMin, tuning.speedMax),
  phase: 'walk',
  phaseMs: 0,
  walkLegMs: lerpRange(rand, tuning.walkMsMin, tuning.walkMsMax),
  stopDurationMs: 0,
  velMult: 1,
  shotsPlanned: 0,
  shotsFired: 0,
  nextShotAtMs: 0,
  lastShotAt: 0,
});

// 出撃時の初期配置(常在N人・§9)。1点に固まらないよう、rightEdgeを基準に等間隔+個体乱数で散らす。
export const createInitialEndingSoldiers = (
  count: number, rightEdgeX: number, spanX: number,
  rand: () => number = Math.random,
  tuning: EndingSoldierTuning = DEFAULT_ENDING_SOLDIER_TUNING,
): EndingSoldier[] => {
  const out: EndingSoldier[] = [];
  for (let i = 0; i < Math.max(0, count); i++) {
    const x = rightEdgeX - (spanX * i) / Math.max(1, count) - lerpRange(rand, 0, spanX / Math.max(1, count));
    const s = spawnEndingSoldier(`ending-soldier-${i}`, x, rand, tuning);
    // 初期配置だけは「歩行区間の途中から」始める(全員が同時に立ち止まって行進に見えるのを防ぐ・不規則性)。
    s.phaseMs = lerpRange(rand, 0, s.walkLegMs);
    out.push(s);
  }
  return out;
};

// 1フレーム進める(純関数・新オブジェクトを返す)。速度係数(velMult)は「このフレーム開始時点の値」を
// 使って移動してからフェーズ/velMultを更新する(1フレーム遅延はあるが十分小さい=叩き台として許容)。
export const stepEndingSoldier = (
  s: EndingSoldier, dtMs: number, nowMs: number,
  tuning: EndingSoldierTuning = DEFAULT_ENDING_SOLDIER_TUNING,
  rand: () => number = Math.random,
): EndingSoldier => {
  if (dtMs <= 0) return s;
  const dtSec = dtMs / 1000;
  const x = s.x - s.speed * s.velMult * dtSec; // 常に右→左(-x方向)
  const phaseMs = s.phaseMs + dtMs;
  switch (s.phase) {
    case 'walk': {
      if (phaseMs < s.walkLegMs) return { ...s, x, phaseMs, velMult: 1 };
      return { ...s, x, phase: 'decel', phaseMs: 0, velMult: 1 };
    }
    case 'decel': {
      const t = Math.min(1, phaseMs / tuning.easeMs);
      if (t >= 1) {
        return {
          ...s, x, phase: 'stopped', phaseMs: 0, velMult: 0,
          stopDurationMs: lerpRange(rand, tuning.stopMsMin, tuning.stopMsMax),
        };
      }
      return { ...s, x, phaseMs, velMult: 1 - t };
    }
    case 'stopped': {
      if (phaseMs < s.stopDurationMs) return { ...s, x, phaseMs, velMult: 0 };
      return {
        ...s, x, phase: 'fire', phaseMs: 0, velMult: 0,
        shotsPlanned: Math.round(lerpRange(rand, tuning.shotsMin, tuning.shotsMax)),
        shotsFired: 0, nextShotAtMs: 0,
      };
    }
    case 'fire': {
      let shotsFired = s.shotsFired;
      let nextShotAtMs = s.nextShotAtMs;
      let lastShotAt = s.lastShotAt;
      while (shotsFired < s.shotsPlanned && phaseMs >= nextShotAtMs) {
        shotsFired++;
        lastShotAt = nowMs;
        nextShotAtMs += tuning.shotIntervalMs;
      }
      if (shotsFired >= s.shotsPlanned) {
        return { ...s, x, phase: 'accel', phaseMs: 0, velMult: 0, shotsFired, lastShotAt };
      }
      return { ...s, x, phaseMs, velMult: 0, shotsFired, nextShotAtMs, lastShotAt };
    }
    case 'accel': {
      const t = Math.min(1, phaseMs / tuning.easeMs);
      if (t >= 1) {
        return {
          ...s, x, phase: 'walk', phaseMs: 0, velMult: 1,
          walkLegMs: lerpRange(rand, tuning.walkMsMin, tuning.walkMsMax),
        };
      }
      return { ...s, x, phaseMs, velMult: t };
    }
    default:
      return { ...s, x };
  }
};

// 左画面外(呼び出し側がズーム外周+マージンで渡す)へ抜けたら右から再投入(プール・§9)。
// 画面外でなければそのまま返す(無変更)。
export const reenterEndingSoldierIfOffscreen = (
  s: EndingSoldier, leftBoundX: number, rightEdgeX: number, spawnJitterX: number,
  rand: () => number = Math.random,
  tuning: EndingSoldierTuning = DEFAULT_ENDING_SOLDIER_TUNING,
): EndingSoldier => {
  if (s.x >= leftBoundX) return s;
  return spawnEndingSoldier(s.id, rightEdgeX + lerpRange(rand, 0, spawnJitterX), rand, tuning);
};

// ---- 倒れ兵士(ワールド固定配置・§8) --------------------------------------

// 900〜1400px間隔(§8)= セル1150px・ジッター±125px(隣接ジッター込みの最悪ケースでも900〜1400に収まる:
// (1150+125)-(0-125)=1400 / (1150-125)-(0+125)=900)。木(trees.ts)と同じ「セル+ハッシュjitter」方式。
const FALLEN_CELL_PX = 1150;
const FALLEN_JITTER_PX = 125;
// 最初の1体は開始地点(x=0)からある程度離す(出撃直後に即・救護シーンへ入らないように=叩き台)。
const FALLEN_START_OFFSET_PX = 1200;

const fallenHash = (i: number): number => {
  const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

export interface FallenSoldierSpot { index: number; x: number; y: number; }

// index → 世界座標。純関数(xについて単調増加=呼び出し側は前から順に走査できる)。
export const fallenSoldierAt = (index: number): FallenSoldierSpot => {
  const jitter = (fallenHash(index) - 0.5) * 2 * FALLEN_JITTER_PX;
  const x = FALLEN_START_OFFSET_PX + index * FALLEN_CELL_PX + jitter;
  // Y: 進路中央(0)に固定(叩き台。帯内へ散らす拡張はENDING_SCENE.md未決)。
  return { index, x, y: 0 };
};

// afterIndex より後ろ(index上)かつ fromX 以降(未来)にある最初の1体。
export const nextFallenSoldierAfter = (afterIndex: number, fromX: number): FallenSoldierSpot => {
  let idx = afterIndex + 1;
  let spot = fallenSoldierAt(idx);
  while (spot.x < fromX) { idx++; spot = fallenSoldierAt(idx); }
  return spot;
};

// 描画用: [minX,maxX] にかかる倒れ兵士を全て返す(画面内カリングはpixi側の距離判定に任せ、
// ここでは広めのワールド区間を渡してもらう前提)。
export const fallenSoldiersInRange = (minX: number, maxX: number): FallenSoldierSpot[] => {
  const startIdx = Math.max(0, Math.floor((minX - FALLEN_START_OFFSET_PX - FALLEN_JITTER_PX) / FALLEN_CELL_PX));
  const out: FallenSoldierSpot[] = [];
  for (let idx = startIdx; ; idx++) {
    const spot = fallenSoldierAt(idx);
    if (spot.x > maxX) break;
    if (spot.x >= minX) out.push(spot);
  }
  return out;
};

// ---- フィル(=プレイヤー実体。カメラ台車+救護・§2/§4/§8) -------------------

export type EndingPhillPhase = 'walk' | 'approachDecel' | 'healForward' | 'healHold' | 'healReverse' | 'accel';

export interface EndingPhillState {
  phase: EndingPhillPhase;
  phaseMs: number;
  frame: number;              // 表示コマ(walk=0..2/heal=0..5)。pixi側はそのままテクスチャ添字に使う。
  lastHealedIndex: number;    // 直近に救護し終えた倒れ兵士のindex(-1=まだ無し)
  targetIndex: number | null; // 現在アプローチ/救護中の倒れ兵士index(walk中はnull)
  velMult: number;            // 0..1。呼び出し側がこれを右移動の速度倍率として使う(§4のカメラ台車入力)。
}

export interface EndingPhillTuning {
  approachTriggerPx: number; // 停止目標(倒れ兵士手前stopOffsetPx)までこの距離に入ったら減速開始
  stopOffsetPx: number;      // 倒れ兵士の手前何pxで止まるか(§8: 約60px)
  healFrameMs: number;       // heal 1コマの表示時間(§2/§8: 約280ms)
  healHoldMs: number;        // heal5コマ目の保持(§8: 約600ms)
  accelMs: number;           // 発進のease(§7)
  walkFrameMs: number;       // walk 1コマの表示時間(歩行アニメの速さ・叩き台)
}

export const DEFAULT_ENDING_PHILL_TUNING: EndingPhillTuning = {
  approachTriggerPx: 240,
  stopOffsetPx: 60,
  healFrameMs: 280,
  healHoldMs: 600,
  accelMs: 220,
  walkFrameMs: 260,
};

export const createInitialEndingPhill = (): EndingPhillState => ({
  phase: 'walk', phaseMs: 0, frame: 0, lastHealedIndex: -1, targetIndex: null, velMult: 1,
});

// walk中/accel中の歩行コマ(0,1,2,1のping-pong=中割りが自然に見える3コマの回し方。護衛と同型)。
const WALK_FRAME_SEQ = [0, 1, 2, 1];
const walkFrame = (phaseMs: number, tuning: EndingPhillTuning): number =>
  WALK_FRAME_SEQ[Math.floor(phaseMs / tuning.walkFrameMs) % WALK_FRAME_SEQ.length];

// 1フレーム進める(純関数)。playerX=フィル(=プレイヤー実体)の現在のワールドX。
export const stepEndingPhill = (
  s: EndingPhillState, playerX: number, dtMs: number,
  tuning: EndingPhillTuning = DEFAULT_ENDING_PHILL_TUNING,
): EndingPhillState => {
  if (dtMs <= 0) return s;
  const phaseMs = s.phaseMs + dtMs;
  switch (s.phase) {
    case 'walk': {
      const target = nextFallenSoldierAfter(s.lastHealedIndex, playerX);
      const stopX = target.x - tuning.stopOffsetPx;
      const dist = stopX - playerX;
      if (dist <= tuning.approachTriggerPx) {
        return { ...s, phase: 'approachDecel', phaseMs: 0, velMult: 1, targetIndex: target.index, frame: walkFrame(0, tuning) };
      }
      return { ...s, phaseMs, velMult: 1, frame: walkFrame(phaseMs, tuning) };
    }
    case 'approachDecel': {
      const target = fallenSoldierAt(s.targetIndex ?? 0);
      const stopX = target.x - tuning.stopOffsetPx;
      const dist = Math.max(0, stopX - playerX);
      if (dist <= 2) {
        return { ...s, phase: 'healForward', phaseMs: 0, velMult: 0, frame: 0 };
      }
      const velMult = tuning.approachTriggerPx > 0
        ? Math.max(0.04, Math.min(1, dist / tuning.approachTriggerPx))
        : 0;
      return { ...s, phaseMs, velMult, frame: walkFrame(phaseMs, tuning) };
    }
    case 'healForward': {
      const frame = Math.min(5, Math.floor(phaseMs / tuning.healFrameMs));
      if (phaseMs >= tuning.healFrameMs * 5) return { ...s, phase: 'healHold', phaseMs: 0, velMult: 0, frame: 5 };
      return { ...s, phaseMs, velMult: 0, frame };
    }
    case 'healHold': {
      if (phaseMs >= tuning.healHoldMs) return { ...s, phase: 'healReverse', phaseMs: 0, velMult: 0, frame: 5 };
      return { ...s, phaseMs, velMult: 0, frame: 5 };
    }
    case 'healReverse': {
      const steps = Math.floor(phaseMs / tuning.healFrameMs);
      const frame = Math.max(0, 5 - steps);
      if (phaseMs >= tuning.healFrameMs * 5) {
        return { ...s, phase: 'accel', phaseMs: 0, velMult: 0, frame: 0, lastHealedIndex: s.targetIndex ?? s.lastHealedIndex, targetIndex: null };
      }
      return { ...s, phaseMs, velMult: 0, frame };
    }
    case 'accel': {
      const t = Math.min(1, phaseMs / tuning.accelMs);
      if (t >= 1) {
        return { ...s, phase: 'walk', phaseMs: 0, velMult: 1, frame: walkFrame(0, tuning) };
      }
      return { ...s, phaseMs, velMult: t, frame: walkFrame(phaseMs, tuning) };
    }
    default:
      return s;
  }
};
