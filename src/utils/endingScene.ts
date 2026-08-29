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
//   §9 兵士の群れ           → DEFAULT_ENDING_SOLDIER_TUNING(常在数・投入位置だけはgameStore側の
//                             ?endsoldiers=/?endsoldx=等。tuning本体の実行時上書きは現状無い=検収C-1是正)
//   §2 フィルの描画          → EndingPhillState.frame(pixi側はこれをそのままコマ番号として使う)
//   §8 救護シーン           → EndingPhillState.phase='approachDecel'..'healReverse'+fallenSoldierAt()

// ---- 兵士 ---------------------------------------------------------------

// blown/downed/getup は爆撃(演出仕様v3.1)の一時転倒: 吹き飛び→横たわる→起き上がり→accel→walk復帰。
export type EndingSoldierPhase = 'walk' | 'decel' | 'stopped' | 'fire' | 'accel' | 'blown' | 'downed' | 'getup';

// 一時転倒のフェーズ時間(v3.1・叩き台)。回転演出がpixi側でも同じ時間を使うためexport。
export const ENDING_BLOWN_MS = 550;  // 吹き飛び(ノックバック+倒れ込み回転)
export const ENDING_GETUP_MS = 450;  // 起き上がり(回転戻し)。この後は既存accel(200ms)を通ってwalkへ

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
  knockDirX: number;       // 爆撃の吹き飛び方向(±1・v3.1)。blown中の移動と倒れ込み回転の向き。
  knockV0: number;         // 吹き飛び初速(px/s・v3.1)。blown中に(1-t)²で減衰。
  downDurationMs: number;  // downed(横たわり)の目標時間(ms・v3.1・個体乱数)
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

// ENDING_SCENE.md §9(叩き台)。呼び出し側(gameStore.updateEndingScene)はこの既定値のまま使う
// (?endsoldiers=等のツマミは常在数・投入位置のみ。tuningの上書き配線は現状存在しない=検収C-1是正)。
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
  knockDirX: 1,
  knockV0: 0,
  downDurationMs: 0,
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
    // ---- 爆撃の一時転倒(v3.1)。歩行のx(冒頭のvelMult移動)はvelMult=0で不動、blownだけ
    //      ノックバック変位を別途足す。velocity=(1-t)²のease-out減衰(慣性MUST)。
    case 'blown': {
      const t0 = Math.max(0, Math.min(1, s.phaseMs / ENDING_BLOWN_MS));
      const t1 = Math.max(0, Math.min(1, phaseMs / ENDING_BLOWN_MS));
      const vAvg = s.knockV0 * (((1 - t0) ** 2) + ((1 - t1) ** 2)) / 2; // 区間平均速度(台形近似)
      const bx = x + s.knockDirX * vAvg * dtSec;
      if (phaseMs >= ENDING_BLOWN_MS) return { ...s, x: bx, phase: 'downed', phaseMs: 0, velMult: 0 };
      return { ...s, x: bx, phaseMs, velMult: 0 };
    }
    case 'downed': {
      if (phaseMs >= s.downDurationMs) return { ...s, x, phase: 'getup', phaseMs: 0, velMult: 0 };
      return { ...s, x, phaseMs, velMult: 0 };
    }
    case 'getup': {
      // 起き上がり(回転はpixi側がphaseMsから引く)→ 既存accel(200ms ease)を通ってwalkへ(慣性MUST)。
      if (phaseMs >= ENDING_GETUP_MS) return { ...s, x, phase: 'accel', phaseMs: 0, velMult: 0 };
      return { ...s, x, phaseMs, velMult: 0 };
    }
    default:
      return { ...s, x };
  }
};

// 一時転倒中か(v3.1)。再投入スキップ(監査B-1)・発砲/マズル消灯(監査B-6)・影切替(監査B-3)の合流点。
export const isEndingSoldierTumbling = (s: EndingSoldier): boolean =>
  s.phase === 'blown' || s.phase === 'downed' || s.phase === 'getup';

// 左画面外(呼び出し側がズーム外周+マージンで渡す)へ抜けたら右から再投入(プール・§9)。
// 画面外でなければそのまま返す(無変更)。
export const reenterEndingSoldierIfOffscreen = (
  s: EndingSoldier, leftBoundX: number, rightEdgeX: number, spawnJitterX: number,
  rand: () => number = Math.random,
  tuning: EndingSoldierTuning = DEFAULT_ENDING_SOLDIER_TUNING,
): EndingSoldier => {
  if (s.x >= leftBoundX) return s;
  if (isEndingSoldierTumbling(s)) return s; // 転倒中は再投入しない(監査B-1。起き上がってから通常判定に戻る)
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
  animMs: number;             // 歩行アニメ用の蓄積時間(ms)。velMult連動で進む=減速中は脚もゆっくり
                              // (検収A-4の足滑り対策。walk/approachDecel/accelで使い、フェーズ跨ぎで連続)。
  lastHealedIndex: number;    // 直近に救護し終えた倒れ兵士のindex(-1=まだ無し)
  targetIndex: number | null; // 現在アプローチ/救護中の倒れ兵士index(walk中はnull)
  velMult: number;            // 0..1。呼び出し側がこれを右移動の速度倍率として使う(§4のカメラ台車入力)。
}

export interface EndingPhillTuning {
  approachTriggerPx: number; // 停止目標(倒れ兵士手前stopOffsetPx)までこの距離に入ったらapproachDecelへ
  approachDecelPx: number;   // 実際に速度が落ち始める距離(検収A-4: 240px漸近で9秒失速していたのを短く)
  stopOffsetPx: number;      // 倒れ兵士の手前何pxで止まるか(§8: 約60px)
  healFrameMs: number;       // heal 1コマの表示時間(§2/§8: 約280ms)
  healHoldMs: number;        // heal5コマ目の保持(§8: 約600ms)
  accelMs: number;           // 発進のease(§7)
  walkFrameMs: number;       // walk 1コマの表示時間(歩行アニメの速さ・叩き台)
}

export const DEFAULT_ENDING_PHILL_TUNING: EndingPhillTuning = {
  approachTriggerPx: 240,
  approachDecelPx: 90,
  stopOffsetPx: 60,
  healFrameMs: 280,
  healHoldMs: 600,
  accelMs: 220,
  walkFrameMs: 260,
};

// 停止判定のしきい値(px)。検収A-4: 旧2pxは床0.04×漸近と合わさり到達に9秒超掛かっていた。
// 速度床0.3(下のclamp)と合わせて、減速開始から概ね1秒前後で救護へ入る。
const APPROACH_STOP_EPS_PX = 8;

export const createInitialEndingPhill = (): EndingPhillState => ({
  phase: 'walk', phaseMs: 0, frame: 0, animMs: 0, lastHealedIndex: -1, targetIndex: null, velMult: 1,
});

// walk中/accel中の歩行コマ(0,1,2,1のping-pong=中割りが自然に見える3コマの回し方。護衛と同型)。
// 添字は animMs(velMult連動の蓄積時間)で回す=減速すると脚の回転も同率で遅くなる(検収A-4)。
const WALK_FRAME_SEQ = [0, 1, 2, 1];
const walkFrame = (animMs: number, tuning: EndingPhillTuning): number =>
  WALK_FRAME_SEQ[Math.floor(animMs / tuning.walkFrameMs) % WALK_FRAME_SEQ.length];

// 1フレーム進める(純関数)。playerX=フィル(=プレイヤー実体)の現在のワールドX。
// animMs は「このフレーム開始時点のvelMult」で進める(兵士側stepEndingSoldierの移動と同じ1フレーム遅延の流儀)。
export const stepEndingPhill = (
  s: EndingPhillState, playerX: number, dtMs: number,
  tuning: EndingPhillTuning = DEFAULT_ENDING_PHILL_TUNING,
): EndingPhillState => {
  if (dtMs <= 0) return s;
  const phaseMs = s.phaseMs + dtMs;
  const animMs = s.animMs + dtMs * s.velMult;
  switch (s.phase) {
    case 'walk': {
      const target = nextFallenSoldierAfter(s.lastHealedIndex, playerX);
      const stopX = target.x - tuning.stopOffsetPx;
      const dist = stopX - playerX;
      if (dist <= tuning.approachTriggerPx) {
        return { ...s, phase: 'approachDecel', phaseMs: 0, animMs, velMult: 1, targetIndex: target.index, frame: walkFrame(animMs, tuning) };
      }
      return { ...s, phaseMs, animMs, velMult: 1, frame: walkFrame(animMs, tuning) };
    }
    case 'approachDecel': {
      const target = fallenSoldierAt(s.targetIndex ?? 0);
      const stopX = target.x - tuning.stopOffsetPx;
      const dist = Math.max(0, stopX - playerX);
      if (dist <= APPROACH_STOP_EPS_PX) {
        return { ...s, phase: 'healForward', phaseMs: 0, animMs: 0, velMult: 0, frame: 0 };
      }
      // 速度=距離比例(approachDecelPx内で1→0.3へ)。床0.3=歩き切って止まる(旧0.04は事実上の静止=
      // 9秒の失速。検収A-4)。approachTriggerPx〜approachDecelPxの間はclampで1のまま=等速で寄る。
      const velMult = tuning.approachDecelPx > 0
        ? Math.max(0.3, Math.min(1, dist / tuning.approachDecelPx))
        : 0;
      return { ...s, phaseMs, animMs, velMult, frame: walkFrame(animMs, tuning) };
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
        return { ...s, phase: 'walk', phaseMs: 0, animMs, velMult: 1, frame: walkFrame(animMs, tuning) };
      }
      return { ...s, phaseMs, animMs, velMult: t, frame: walkFrame(animMs, tuning) };
    }
    default:
      return s;
  }
};

// ---- 爆撃(ENDING_SCENE.md 演出仕様v3/v3.1) ------------------------------------
// 奥や手前に降ってきて大きく爆発し、近くの兵士が大きくノックバックして倒れる(社長指示2026-08-29)。
// 判定なし(観賞シーン)。落下は重力加速(慣性MUST)・着弾点はアンカー兵士方式(監査A-2=
// 「と同時に兵士がノックバック」を毎回成立させる)。

export type EndingBombPhase = 'fall' | 'explode';

export interface EndingBomb {
  id: string;
  impactX: number;         // 着弾点(ワールド)。描画のzIndex/alpha/スケールも常にこのYを使う(監査B4)
  impactY: number;
  phase: EndingBombPhase;
  phaseMs: number;
  justExploded: boolean;   // 着弾フレームだけtrue(SE/シェイク/ノックバック適用のedge。次stepで下ろす)
}

export interface EndingBombTuning {
  intervalMsMin: number; intervalMsMax: number; // 投下間隔(次の投下までの乱数幅)
  retryMs: number;          // アンカー候補0人で見送った時の再試行間隔(監査A-2)
  maxAirborne: number;      // 同時滞空数
  fallMs: number;           // 落下所要(重力加速)
  fallHeightPx: number;     // 落下開始高さ(監査A-6: 等倍可視半高300+220)
  explodeMs: number;        // 爆発flipbookの表示時間(既存spawnExplosionFxと同じ460ms)
  explosionRadiusPx: number;// 爆発絵の半径(幅=radius×2×1.1・既存作法)
  knockRadiusPx: number;    // ノックバック楕円距離のしきい値(監査A-3: 絵の幅とほぼ一致させる)
  knockDepthMult: number;   // 楕円距離のY圧縮(奥行き方向は見た目の距離感で締める)
  knockV0PxS: number;       // 吹き飛び初速(px/s)。(1-t)²減衰×550ms=移動量≈v0×0.55/3
  downMsMin: number; downMsMax: number; // 横たわり時間(個体乱数)
  anchorOffsetXPx: number;  // アンカー兵士からの着弾Xずらし(±)
  anchorOffsetYMinPx: number; anchorOffsetYMaxPx: number; // 奥/手前へのYずらし(絶対値の幅)
  bandClampYPx: number;     // 着弾Yのクランプ(監査C-2: 地平線フェード帯に入れない)
  viewFracX: number;        // アンカー候補=カメラ中心±(可視半幅×この係数)(監査A-1)
  phillAvoidBehindPx: number; phillAvoidAheadPx: number; // フィル回避帯(前方は落下中の前進を先読み・監査B-4)
}

export const DEFAULT_ENDING_BOMB_TUNING: EndingBombTuning = {
  intervalMsMin: 3500, intervalMsMax: 7000,
  retryMs: 400,
  maxAirborne: 2,
  fallMs: 900,
  fallHeightPx: 520,
  explodeMs: 460,
  explosionRadiusPx: 150,
  knockRadiusPx: 170,
  knockDepthMult: 1.6,
  knockV0PxS: 1200,
  downMsMin: 2500, downMsMax: 4500,
  anchorOffsetXPx: 60,
  anchorOffsetYMinPx: 30, anchorOffsetYMaxPx: 70,
  bandClampYPx: 90,
  viewFracX: 0.75,
  phillAvoidBehindPx: 180, phillAvoidAheadPx: 400,
};

// 投下を試みる(監査A-1/A-2)。画面内の通常フェーズ兵士から乱数でアンカーを選び、その足元近くへ落とす。
// 候補が居なければ null(呼び出し側が retryMs 後に再試行)。
export const trySpawnEndingBomb = (
  id: string, soldiers: EndingSoldier[], phillX: number, camCenterX: number, viewHalfWPx: number,
  rand: () => number = Math.random,
  tuning: EndingBombTuning = DEFAULT_ENDING_BOMB_TUNING,
): EndingBomb | null => {
  const halfW = viewHalfWPx * tuning.viewFracX;
  const avoidMin = phillX - tuning.phillAvoidBehindPx;
  const avoidMax = phillX + tuning.phillAvoidAheadPx;
  const candidates = soldiers.filter(s =>
    !isEndingSoldierTumbling(s) &&
    Math.abs(s.x - camCenterX) <= halfW &&
    (s.x < avoidMin || s.x > avoidMax));
  if (candidates.length === 0) return null;
  const anchor = candidates[Math.floor(rand() * candidates.length) % candidates.length];
  const impactX = anchor.x + (rand() * 2 - 1) * tuning.anchorOffsetXPx;
  const side = rand() < 0.5 ? -1 : 1; // 奥(-)か手前(+)
  const rawY = anchor.y + side * lerpRange(rand, tuning.anchorOffsetYMinPx, tuning.anchorOffsetYMaxPx);
  const impactY = Math.max(-tuning.bandClampYPx, Math.min(tuning.bandClampYPx, rawY));
  return { id, impactX, impactY, phase: 'fall', phaseMs: 0, justExploded: false };
};

// 1フレーム進める。爆発表示が終わったら null(呼び出し側がfilterで除去)。
export const stepEndingBomb = (
  b: EndingBomb, dtMs: number,
  tuning: EndingBombTuning = DEFAULT_ENDING_BOMB_TUNING,
): EndingBomb | null => {
  if (dtMs <= 0) return b;
  const phaseMs = b.phaseMs + dtMs;
  if (b.phase === 'fall') {
    if (phaseMs >= tuning.fallMs) return { ...b, phase: 'explode', phaseMs: 0, justExploded: true };
    return { ...b, phaseMs };
  }
  if (phaseMs >= tuning.explodeMs) return null;
  return { ...b, phaseMs, justExploded: false };
};

// 落下中の描画Y(重力加速=等加速で impactY-fallHeightPx から impactY へ。慣性MUST・等速落下禁止)。
export const endingBombFallY = (
  b: EndingBomb,
  tuning: EndingBombTuning = DEFAULT_ENDING_BOMB_TUNING,
): number => {
  const t = Math.max(0, Math.min(1, b.phaseMs / tuning.fallMs));
  return b.impactY - tuning.fallHeightPx * (1 - t * t);
};

// 着弾のノックバック適用(監査A-3/A-5)。楕円距離(Yは knockDepthMult 倍で締める)内の通常フェーズ
// 兵士を blown へ。方向は爆心から離れる向き(|dx|<8pxは左右乱数)。転倒中の兵士は重ね掛けしない。
export const blastEndingSoldiers = (
  soldiers: EndingSoldier[], bombX: number, bombY: number,
  rand: () => number = Math.random,
  tuning: EndingBombTuning = DEFAULT_ENDING_BOMB_TUNING,
): EndingSoldier[] =>
  soldiers.map(s => {
    if (isEndingSoldierTumbling(s)) return s;
    const dx = s.x - bombX;
    const dy = (s.y - bombY) * tuning.knockDepthMult;
    if (Math.hypot(dx, dy) > tuning.knockRadiusPx) return s;
    const dir = dx > 8 ? 1 : dx < -8 ? -1 : (rand() < 0.5 ? -1 : 1);
    return {
      ...s, phase: 'blown' as const, phaseMs: 0, velMult: 0,
      knockDirX: dir,
      knockV0: tuning.knockV0PxS * (0.85 + rand() * 0.3), // 個体±15%(全員同じ弧にしない)
      downDurationMs: lerpRange(rand, tuning.downMsMin, tuning.downMsMax),
    };
  });
