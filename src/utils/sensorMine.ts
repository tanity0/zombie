// センサー地雷(sensor-mine)サブウェポン: 設置(同時数上限+最古置換)と感知→2秒起爆の判定を
// 純関数に閉じ込める(CLAUDE.md「実装精度の規律」4: 配線ロジックは純関数に切り出してテスト)。
// 設置は gameStore.triggerCounter(近接スイング)、起爆の反映と爆発処理は useGameLoop、
// 描画は pixiScene.syncSensorMines(読むだけ)。仕様の正は PACING_PUZZLE.md §6.4(バッチM27)。

// --- 調整用定数(§6.4 確定値+叩き台) ---
export const SENSOR_MINE_DAMAGE = 50;   // = HEAVY_GRENADE_DAMAGE 42 × 1.2(手榴弾の1.2倍・社長指定)
export const SENSOR_MINE_RADIUS = 79;   // = HEAVY_GRENADE_RADIUS 66 × 1.2(爆発半径。センサー範囲も同値=叩き台)
export const SENSOR_MINE_FUSE_MS = 2000; // 感知から起爆まで(赤点滅テレグラフの長さ)
export const SENSOR_MINE_COOLDOWN_MS = 10000; // 設置CD(§6.10 M33①・社長指示。旧: CDなし=スイング毎設置)
export const SENSOR_MINE_CAP_BY_LEVEL: readonly number[] = [0, 3, 4, 5]; // index=level(1..3)。同時設置数の上限

// 設置済みの地雷1個。triggeredAt=0 は待機(未感知)、>0 はその gameTime に感知済み
// (triggeredAt + SENSOR_MINE_FUSE_MS で起爆)。
export interface SensorMineState {
  id: string;
  x: number;         // 設置点(プレイヤー足元)
  y: number;
  placedAt: number;  // 設置時刻(gameTime ms)。最古置換の比較キー
  triggeredAt: number;
}

// 設置: 上限(cap)到達中は最古(placedAt 最小。同時刻は配列で先のもの)を消して置き直す(§6.4 叩き台)。
// 副作用なし(新しい配列を返す)。cap<=0 は「置けない」(現状 level>=1 なので通常は到達しない)。
export const placeSensorMine = (
  mines: readonly SensorMineState[],
  mine: SensorMineState,
  cap: number,
): SensorMineState[] => {
  if (cap <= 0) return [...mines];
  const next = [...mines];
  while (next.length >= cap) {
    let oldest = 0;
    for (let i = 1; i < next.length; i++) {
      if (next[i].placedAt < next[oldest].placedAt) oldest = i;
    }
    next.splice(oldest, 1);
  }
  next.push(mine);
  return next;
};

export interface SensorMineTickInput {
  mines: readonly SensorMineState[];
  enemies: readonly { x: number; y: number }[]; // 敵の中心座標(敵のみ。プレイヤー/召喚/護衛は渡さない)
  gameTime: number;
  sensorRadius?: number; // 既定 SENSOR_MINE_RADIUS
  fuseMs?: number;       // 既定 SENSOR_MINE_FUSE_MS
}

export interface SensorMineTickResult {
  mines: SensorMineState[];      // 次フレームへ持ち越す地雷(感知した地雷は triggeredAt 付き・起爆分は除外)
  detonated: SensorMineState[];  // このフレームで起爆する地雷(爆発処理は呼び出し元=useGameLoop)
  changed: boolean;              // mines に変化があったか(store 書き込みの間引き用)
}

// 1フレーム分の感知/起爆判定(副作用なし)。
// 感知=敵の中心が sensorRadius の円内(molotov の isEnemyInGroundFire と同じ Math.hypot系の円判定)。
// 感知済みの地雷は敵が離れても解除しない(信管は戻らない=感応式)。
export const tickSensorMines = ({
  mines,
  enemies,
  gameTime,
  sensorRadius = SENSOR_MINE_RADIUS,
  fuseMs = SENSOR_MINE_FUSE_MS,
}: SensorMineTickInput): SensorMineTickResult => {
  if (mines.length === 0) return { mines: [], detonated: [], changed: false };
  const r2 = sensorRadius * sensorRadius;
  const remaining: SensorMineState[] = [];
  const detonated: SensorMineState[] = [];
  let changed = false;
  for (const m of mines) {
    if (m.triggeredAt > 0) {
      if (gameTime >= m.triggeredAt + fuseMs) {
        detonated.push(m);
        changed = true;
      } else {
        remaining.push(m);
      }
      continue;
    }
    let sensed = false;
    for (const e of enemies) {
      const dx = e.x - m.x;
      const dy = e.y - m.y;
      if (dx * dx + dy * dy <= r2) { sensed = true; break; }
    }
    if (sensed) {
      remaining.push({ ...m, triggeredAt: gameTime });
      changed = true;
    } else {
      remaining.push(m);
    }
  }
  return { mines: remaining, detonated, changed };
};
