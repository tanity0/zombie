// ホーミング弾(homing)サブウェポン: 「ロック蓄積の1ステップ」と「守護霊が押し続ける時間」の判定を
// 純関数に閉じ込める(CLAUDE.md 実装精度の規律4)。
//
// プレイヤー = 指を付けている間0.5秒ごとに1体ずつロック → 指を離して一斉発射(fireHoming)。
// 守護霊     = その「押す」を模擬する。**ロック蓄積は同じ1本(stepHomingLocks)**を通し、
//              押し続ける時間だけ計測平均(BOT_AND_GHOST.md §2.9 G4a の homingHoldMsAvg)で決める。
//              計測が無い(旧プロファイル/未使用)場合は満タンで発射=従来のフォールバック。
// (research/GHOST_PARITY_LEDGER.md「構造ズレ組サブ6種の裁定」+ 社長裁定2026-07-31)

// --- 調整用定数(useGameLoop.ts のローカル定数から移設。値は1つも変えていない) ---
export const HOMING_RANGE = 120;                      // ショットガンと同じ近接射程
export const HOMING_MAX_LOCKS_BY_LEVEL = [0, 3, 6, 10]; // Lv別最大ロック数
export const HOMING_LOCK_INTERVAL_MS = 500;           // ロック付与間隔(0.5秒に1体ずつ)

export interface HomingLockEnemyLike {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
  reaperChaser?: boolean;
}

export interface HomingLockStepInput<E extends HomingLockEnemyLike> {
  /** 現在のロック(同一敵は最大2個入りうるので配列)。 */
  locks: readonly string[];
  /** Lv別の最大ロック数。 */
  maxLocks: number;
  /** ロックの起点(主語の中心)。 */
  ownerCx: number;
  ownerCy: number;
  enemies: readonly E[];
  range?: number;
}

export interface HomingLockStepResult {
  /** 死亡した敵を落としたうえで、必要なら1個足したロック。 */
  locks: string[];
  /** 今回足したロックの段階(SEの鳴らし分け用)。null=足していない。 */
  added: 'first' | 'second' | null;
}

/**
 * ロック蓄積の1ステップ(副作用なし)。優先順は「射程内の未ロック敵(近い順)→既ロック敵へ2ロック目
 * (近い順)」、同一敵は最大2・総数はLv上限まで——**プレイヤーの旧インライン実装と同じ手順**
 * (filter→map→filter→sort→find の順序まで同一=挙動1bit不変)。
 */
export const stepHomingLocks = <E extends HomingLockEnemyLike>({
  locks: prevLocks,
  maxLocks,
  ownerCx,
  ownerCy,
  enemies,
  range = HOMING_RANGE,
}: HomingLockStepInput<E>): HomingLockStepResult => {
  const aliveIds = new Set(enemies.map(e => e.id));
  const locks = prevLocks.filter(id => aliveIds.has(id)); // 死亡した敵のロックは破棄
  let added: HomingLockStepResult['added'] = null;
  if (locks.length < maxLocks) {
    const range2 = range * range;
    const inRange = enemies
      .filter(e => e.type !== 'reaper' || e.reaperChaser)
      .map(e => ({ id: e.id, d2: (e.x + e.width / 2 - ownerCx) ** 2 + (e.y + e.height / 2 - ownerCy) ** 2 }))
      .filter(o => o.d2 <= range2)
      .sort((a, b) => a.d2 - b.d2);
    const count = (id: string): number => locks.filter(l => l === id).length;
    // 未ロック敵を最優先、次に1ロック済み敵(2ロック目)。
    const firstLock = inRange.find(o => count(o.id) === 0);
    const next = firstLock ?? inRange.find(o => count(o.id) === 1);
    if (next) {
      locks.push(next.id);
      added = firstLock ? 'first' : 'second';
    }
  }
  return { locks, added };
};

/**
 * ロックが満タンになるまでの時間(ms)。1体目は押した瞬間に付くので (maxLocks-1)×間隔。
 * 守護霊の「押す時間」の上限=これ(=これ以上押しても増えない)。
 */
export const homingFullLockMs = (maxLocks: number): number =>
  Math.max(0, maxLocks - 1) * HOMING_LOCK_INTERVAL_MS;

/**
 * 守護霊が押し続ける時間(ms)。
 * - 計測平均(homingHoldMsAvg)があればそれを使い、**[0, 満タン到達時間] にclamp**する
 *   (裁定: 上限=ロック満タン到達時間 / 下限=最初のロック成立=押した瞬間)。
 * - 計測が無い(null/undefined/非数)=**満タンで発射**(フォールバック)。
 * ※実際の発射は「この時間が経過し、かつロックが1個以上ある」時。射程内に敵が居ない間は
 *   押したまま待つ(=ロック0で空撃ちしない)。
 */
export const ghostHomingHoldMs = (
  measuredAvgMs: number | null | undefined,
  maxLocks: number,
): number => {
  const full = homingFullLockMs(maxLocks);
  if (measuredAvgMs === null || measuredAvgMs === undefined || !Number.isFinite(measuredAvgMs)) return full;
  return Math.max(0, Math.min(full, measuredAvgMs));
};
