// PACING_PUZZLE.md §6.28-19 バッチM63: アクラシエル(stage-6 ゲート2)の技選択=純関数。
// レンダラ非依存・store非依存(angelBossTick.ts からのみ import される。giantScript.tsと同じ流儀)。
// 数値の根拠は PACING_PUZZLE.md §6.28-19 を参照。
// 再構築では、脚がなくてもプレイヤーとの距離は変わるため距離帯の役割を追加した。
// 5技は候補から消さず、密着=爆発 / 中距離=放射棘 / 遠距離=槍・転移・凝視の比重を上げる。
import { bossZoneForDistance, phaseForHealth, pickComboFollowup, pickWeightedMove, type BossMoveWeights } from './bossScript';
import { distToSegment } from './geometry';

export interface AcrasielPlan {
  x: number; y: number; rotation: number; gapMask: number;
  bodyX?: number; bodyY?: number;
  startedAt: number;
  combo: boolean;
  wave?: number; // 放射棘の波数(1始まり。Phase2以降は2波=acrasielSpikeWaveCount)
  impactAt?: number;
  targets: { x: number; y: number; angle: number }[];
  refuge?: { x: number; y: number };
}
export const ACRASIEL_SPEAR_FLIGHT_MS = 350;
export const ACRASIEL_WARP_ACTIVE_MS = 200;
export const ACRASIEL_GAZE_ACTIVE_MS = 160;
export const acrasielEase = (t: number): number => {
  const p = Math.max(0, Math.min(1, t));
  return p * p * (3 - 2 * p);
};

// 判定と予告が同じ頂点を読む。円弧を分割した扇形(帯の間に未指定の安全域を残さない)。
export const acrasielSectorPolygon = (x: number, y: number, rotation: number, sector: number, range: number): number[] => {
  const points = [x, y];
  const start = rotation + sector * Math.PI / 4 - Math.PI / 8;
  for (let i = 0; i <= 12; i++) {
    const angle = start + i * Math.PI / 48;
    points.push(x + Math.cos(angle) * range, y + Math.sin(angle) * range);
  }
  return points;
};
export const acrasielPolygonHitsCircle = (points: number[], x: number, y: number, radius: number): boolean => {
  let inside = false;
  for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
    const ax = points[i], ay = points[i + 1], bx = points[j], by = points[j + 1];
    if (distToSegment({ x, y }, { x: ax, y: ay }, { x: bx, y: by }) <= radius) return true;
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
};

// ★カウンターの受付判定(純関数・v0.25.4198)。「溜め中と硬直中の本体接触はカウンター可」(掟W7)は
// 保つが、**カウンターで入った硬直の間だけは受け付けない**。受け付けると
// 「カウンター→硬直→その硬直中の接触でまたカウンター」が延々と続き、動かないアクラシエルは
// 近接を振り続けるだけで沈む(社長報告2026-09-10「突っ立ってるところに近接当てるだけで
// カウンター連発」)。ロックは硬直が明けるまでで、技を出し直せば再びカウンターできる。
export const acrasielCounterAccepted = (
  counterLockUntil: number | undefined, now: number,
): boolean => now >= (counterLockUntil ?? 0);

// ★社長指示2026-09-11「紅ライン予告出る割に弾が1発出るだけとかも、他と比べて簡単すぎる。
// 全部の技を見直して激ムズ派手に」。単眼レーザー(gaze)は450msの射線予告に対して**弾1発**だった。
// 絵には**眼が複数ある**(§6.28-19「複数ある眼のどれかが光る」)ので、W8「絵にある特徴は必ず
// 1技以上で使う」に沿って**扇状の多射線**にする。フェーズで本数が増える。
// ★判定(angelBossTick)と予告(pixiScene)は**この同じ関数**を読む=絶対にズレない。
export const acrasielGazeBeamCount = (phase: 1 | 2 | 3): number => phase === 1 ? 5 : phase === 2 ? 7 : 9;
export const ACRASIEL_GAZE_SPREAD_RAD = Math.PI * 0.62; // 扇の総角度(約112度)
export const acrasielGazeAngles = (baseAngle: number, phase: 1 | 2 | 3): number[] => {
  const n = acrasielGazeBeamCount(phase);
  const step = ACRASIEL_GAZE_SPREAD_RAD / Math.max(1, n - 1);
  return Array.from({ length: n }, (_, i) => baseAngle + (i - (n - 1) / 2) * step);
};

// ★収縮→爆発(burst): 破片は今まで**絵だけ**で判定が無かった(pixiSceneのdrawAcrasielBurstFragment)。
// 「爆発から逃げ切っても破片が飛んでくる」=逃げ場を削る技にする。絵と同じ本数・同じ向きを返す
// (絵は p.rotation + i*2π/N で描いているので同じ式)。
export const ACRASIEL_BURST_SHARD_COUNT = 8;
export const acrasielBurstShardAngles = (rotation: number): number[] =>
  Array.from({ length: ACRASIEL_BURST_SHARD_COUNT }, (_, i) => rotation + i * Math.PI * 2 / ACRASIEL_BURST_SHARD_COUNT);

// ★結晶の槍(spear): 起爆は半径60の円が6つだけで、円と円の間(約100px)を歩けば無傷だった。
// 起爆の瞬間に**槍1本ごとに3方向へ破片弾**を撒いて隙間を埋める。
export const ACRASIEL_SPEAR_SHARD_PER_SPEAR = 3;
export const acrasielSpearShardAngles = (spearAngle: number): number[] =>
  Array.from({ length: ACRASIEL_SPEAR_SHARD_PER_SPEAR }, (_, i) =>
    spearAngle + (i - (ACRASIEL_SPEAR_SHARD_PER_SPEAR - 1) / 2) * 0.5);

// ★放射棘(spike): Phase2以降は**2波**。1波目の直後に空きが別のセクターへずれて2波目が来る
// =「隙間を読む」を連続で2回やらせる(主題の強化)。2波目にもフルのリードを付ける(掟W4/W5)。
export const acrasielSpikeWaveCount = (phase: 1 | 2 | 3): number => phase === 1 ? 1 : 2;
// 2波目の空きは**1波目の空きの45°隣**へずらす。距離250だと隣まで191px必要でリード1100ms(115px)
// では届かないが、**ボスに近づいていれば届く**(距離100なら76px)。
// ⇒「2波目に備えて詰める」が正解になる=主題(隙間を読む)の発展形。完全ランダムだと詰む。
export const acrasielNextWaveGapMask = (
  prevMask: number, gapCount: number, rand: () => number = Math.random,
): number => {
  let mask = 0;
  const picked = new Set<number>();
  for (let s = 0; s < ACRASIEL_SECTOR_COUNT; s++) {
    if (!isSpikeGapSector(prevMask, s)) continue;
    const dir = rand() < 0.5 ? 1 : -1;
    const next = (s + dir + ACRASIEL_SECTOR_COUNT) % ACRASIEL_SECTOR_COUNT;
    if (!picked.has(next)) { picked.add(next); mask |= (1 << next); }
  }
  // ずらし先が重なって個数が足りなくなったら、空いていないセクターから埋める(gapCountは守る)。
  let guard = 0;
  while (picked.size < gapCount && guard++ < 64) {
    const s = Math.min(ACRASIEL_SECTOR_COUNT - 1, Math.floor(rand() * ACRASIEL_SECTOR_COUNT));
    if (!picked.has(s)) { picked.add(s); mask |= (1 << s); }
  }
  return mask;
};

export const planAcrasielPattern = (
  x: number, y: number, phase: 1 | 2 | 3,
  startedAt: number, spearRange: number, spearCount: number, rand: () => number = Math.random,
): AcrasielPlan => {
  // ★§6.28-19の主題「空きセクターは毎回変わる」。向きも空きも**プレイヤーの位置とは無関係**に選ぶ。
  // (v0.25.4196の再構築は向きをプレイヤー方向±30°に寄せ、空きを常にsector0=正面に固定していた。
  //  結果「その場に立っていれば当たらない」=読む対象が消えていた。到達可能性は angelBossTick の
  //  begin() が退避点探索で担保する=向きを寄せることで担保しない。)
  const rotation = rand() * Math.PI * 2;
  const gapMask = pickSpikeGapMask(acrasielSpikeGapCount(phase), rand);
  const targets = Array.from({ length: spearCount }, (_, i) => {
    const angle = rotation + i * Math.PI * 2 / spearCount;
    return { x: x + Math.cos(angle) * spearRange, y: y + Math.sin(angle) * spearRange, angle };
  });
  return { x, y, rotation, gapMask, targets, startedAt, combo: false };
};

export type AcrasielMove = 'spike' | 'spear' | 'warp' | 'burst' | 'gaze';

export const ACRASIEL_PHASE_THRESHOLDS = [0.6, 0.3] as const; // Phase2=60%・Phase3=30%
export const acrasielPhaseForHealth = (healthFrac: number): 1 | 2 | 3 =>
  phaseForHealth(healthFrac, ACRASIEL_PHASE_THRESHOLDS) as 1 | 2 | 3;

// §6.28-19: 放射棘の「空き」セクター数。Phase1=2・Phase2以降=1(「隙間の隙間」はPhase3の
// 槍の起爆と棘の同時発生で表現)。
export const acrasielSpikeGapCount = (phase: 1 | 2 | 3): number => phase === 1 ? 2 : 1;

export const ACRASIEL_SECTOR_COUNT = 8;

// 8方向から gapCount 個を重複無しで選び、ビットマスク(bit0..7=1で空き)として返す。
// 溜め開始時に1回だけ呼び、実行まで固定する(掟W4)。
export const pickSpikeGapMask = (
  gapCount: number,
  rand: () => number = Math.random,
): number => {
  const pool = Array.from({ length: ACRASIEL_SECTOR_COUNT }, (_, i) => i);
  let mask = 0;
  const n = Math.max(0, Math.min(gapCount, pool.length));
  for (let i = 0; i < n; i++) {
    const pick = Math.min(pool.length - 1, Math.floor(rand() * pool.length));
    const idx = pool.splice(pick, 1)[0];
    mask |= (1 << idx);
  }
  return mask;
};

export const isSpikeGapSector = (mask: number, sector: number): boolean => (mask & (1 << sector)) !== 0;

const ALL_MOVES: AcrasielMove[] = ['spike', 'spear', 'warp', 'burst', 'gaze'];

export const ACRASIEL_MOVE_WEIGHTS: BossMoveWeights<AcrasielMove> = {
  spike: { melee: 25, near: 35, mid: 45, far: 30 },
  spear: { melee: 20, near: 30, mid: 35, far: 45 },
  warp:  { melee: 10, near: 20, mid: 25, far: 35 },
  burst: { melee: 35, near: 20, mid: 10, far: 0 },
  gaze:  { melee: 10, near: 15, mid: 20, far: 30 },
};

// 全技は候補から消さず、距離帯とPhase3の主題(棘+槍)で重みだけを変える。
export const pickAcrasielMove = (
  distance: number,
  phase: 1 | 2 | 3,
  rand: () => number = Math.random,
): AcrasielMove | null => pickWeightedMove(
  ALL_MOVES,
  m => {
    const base = ACRASIEL_MOVE_WEIGHTS[m][bossZoneForDistance(distance)];
    if (phase >= 3 && m === 'spike') return base * 1.4;
    if (phase >= 3 && m === 'spear') return base * 1.3;
    return base;
  },
  { spike: true, spear: true, warp: true, burst: true, gaze: true },
  rand,
);

// 旧台本用の互換ヘルパー。現在のrunAcrasielTickは使用せず、固定impactAtの複合技を実行する。
export const ACRASIEL_COMBO_FOLLOWUP: Partial<Record<AcrasielMove, AcrasielMove>> = { spike: 'spear', spear: 'warp' };
export const ACRASIEL_PHASE3_COMBO_CHANCE = 1;

export const pickAcrasielCombo = (
  justFinished: AcrasielMove,
  phase: 1 | 2 | 3,
  rand: () => number = Math.random,
): AcrasielMove | null => {
  if (phase !== 3) return null;
  return pickComboFollowup(justFinished, ACRASIEL_COMBO_FOLLOWUP, ACRASIEL_PHASE3_COMBO_CHANCE, () => true, rand);
};
