// センサー地雷(sensor-mine)サブウェポン: 設置(同時数上限+最古置換)と感知→2秒起爆の判定を
// 純関数に閉じ込める(CLAUDE.md「実装精度の規律」4: 配線ロジックは純関数に切り出してテスト)。
// 設置は gameStore の近接スイング入口(プレイヤー=triggerCounter / 守護霊=fireGhostMeleeSwingSubs。
// どちらも共通ヘルパ placeSensorMineOnSwing を通る)、起爆の反映と爆発処理は useGameLoop、
// 描画は pixiScene.syncSensorMines(読むだけ)。仕様の正は PACING_PUZZLE.md §6.4(バッチM27)。
// チャージ制(個別CD)の仕様の正は §6.13(バッチM36)。

// --- 調整用定数(§6.4 確定値+叩き台) ---
export const SENSOR_MINE_DAMAGE = 50;   // = HEAVY_GRENADE_DAMAGE 42 × 1.2(手榴弾の1.2倍・社長指定)
export const SENSOR_MINE_RADIUS = 79;   // = HEAVY_GRENADE_RADIUS 66 × 1.2(爆発半径。センサー範囲も同値=叩き台)
export const SENSOR_MINE_FUSE_MS = 2000; // 感知から起爆まで(赤点滅テレグラフの長さ)
export const SENSOR_MINE_CAP_BY_LEVEL: readonly number[] = [0, 3, 4, 5]; // index=level(1..3)。同時設置数の上限・チャージ数と同じ(§6.13)
// §6.13 M36: 消費した1チャージが個別に再準備されるまでの時間(旧SENSOR_MINE_COOLDOWN_MS=グローバルCDは撤去)。
export const SENSOR_MINE_CHARGE_COOLDOWN_MS = 10000;

// 設置済みの地雷1個。triggeredAt=0 は待機(未感知)、>0 はその gameTime に感知済み
// (triggeredAt + SENSOR_MINE_FUSE_MS で起爆)。
export interface SensorMineState {
  id: string;
  x: number;         // 設置点(オーナーの足元)
  y: number;
  placedAt: number;  // 設置時刻(gameTime ms)。最古置換の比較キー
  triggeredAt: number;
  // §2.11追補(v0.25.2541・GHOST-SAME-SPEC): 置いた主語。undefined=プレイヤー(従来と同値)、
  // 文字列=その守護霊(summon.id)。盤面(この配列)は世界の設置物として1本のままだが、
  // **上限・チャージ・爆発の倍率評価は主語ごと**に解決する(実プレイヤーが2人いる時と同じ形)。
  ownerGhostId?: string;
  /**
   * ★耐久(社長指示2026-08-24「それぞれに耐久値設定して」)。
   * 敵対側(幻影)が置いた地雷を、プレイヤーが**踏まずに近接で処理できる**ようにするための値。
   * 台帳は `gameStore.PLACED_DURABILITY['sensor-mine']`(設置側が焼く)。0以下で消滅。
   */
  hp?: number;
  /** 敵対側(幻影)が置いた地雷か。true の時だけプレイヤーの近接で壊せる。 */
  hostile?: boolean;
}

// 設置: 上限(cap)到達中は最古(placedAt 最小。同時刻は配列で先のもの)を消して置き直す(§6.4 叩き台)。
// 副作用なし(新しい配列を返す)。cap<=0 は「置けない」(現状 level>=1 なので通常は到達しない)。
// v0.25.2541: 上限は**同じオーナーの地雷だけ**を数える(=主語ごとの上限。プレイヤーの地雷しか
// 盤面に無い従来ケースでは1bitも変わらない)。
export const placeSensorMine = (
  mines: readonly SensorMineState[],
  mine: SensorMineState,
  cap: number,
): SensorMineState[] => {
  if (cap <= 0) return [...mines];
  const next = [...mines];
  const mineOf = (m: SensorMineState) => m.ownerGhostId === mine.ownerGhostId;
  while (next.filter(mineOf).length >= cap) {
    let oldest = -1;
    for (let i = 0; i < next.length; i++) {
      if (!mineOf(next[i])) continue;
      if (oldest < 0 || next[i].placedAt < next[oldest].placedAt) oldest = i;
    }
    if (oldest < 0) break; // 理論上到達しない(filter長>0なら必ず見つかる)。無限ループ防止。
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

// --- チャージ制(§6.13 M36): グローバルCDではなく「チャージ数=同時設置上限(SENSOR_MINE_CAP_BY_LEVEL)」を
// 個別に管理する。状態は「回復待ち(消費済みでまだ再準備できていない)チャージの readyAt 配列」のみで表現し、
// 準備完了チャージは配列に載せない(要素なし=全チャージ準備完了)。gameStore.triggerCounter が
// 設置のたびに consumeSensorMineCharge を呼び、結果を state.sensorMineCharges として保持する。

// 期限切れ(readyAt<=gameTime = 再準備完了)の要素を取り除いた配列を返す(純粋)。
export const pruneSensorMineCharges = (pending: readonly number[], gameTime: number): number[] =>
  pending.filter(readyAt => readyAt > gameTime);

// 準備完了チャージ数 = cap − 回復待ち件数(prune後)。0未満にはならない。
export const sensorMineChargesReady = (pending: readonly number[], gameTime: number, cap: number): number =>
  Math.max(0, cap - pruneSensorMineCharges(pending, gameTime).length);

// 設置1回分のチャージ消費。準備完了チャージが無ければ null(=設置不可)。
// durationMs<=0 を渡すとオーバークロック成立相当(そのチャージを回復待ちに積まず即再準備)。
// time-keeper 等のCD短縮は呼び出し側が durationMs に乗算済みの値を渡す(setSubWeaponCooldownと同じ流儀)。
export const consumeSensorMineCharge = (
  pending: readonly number[],
  gameTime: number,
  cap: number,
  durationMs: number,
): number[] | null => {
  const pruned = pruneSensorMineCharges(pending, gameTime);
  if (pruned.length >= cap) return null;
  if (durationMs <= 0) return pruned; // 即再準備(回復待ちに積まない)
  return [...pruned, gameTime + durationMs];
};
