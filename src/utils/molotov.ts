// 火炎瓶(molotov)サブウェポン: 配置タイミング/本数/クールダウンの判定と、地面の火のDoT当たり判定を
// 純関数に閉じ込める(CLAUDE.md「実装精度の規律」4: 配線ロジックは純関数に切り出してテスト)。
// useGameLoop はこの結果を store へ書き込むだけ(Pixiは描画のみ・仕様/挙動はここと gameStore.ts が持つ)。
//
// 数値は全て叩き台(仮値)。挙動の意図: 「10秒サイクルの間に、移動中のみ1秒に1個ずつ、
// レベル別の本数(N)だけ足元に火を設置する」。寿命3秒×間隔1秒なので同時に生きる火は常に
// 最大3〜4個程度(レベルによらず) — これは意図した挙動であり、"直す"対象ではない。

// --- 調整用定数(叩き台) ---
export const MOLOTOV_FIRES_BY_LEVEL: readonly number[] = [0, 3, 5, 7]; // index=level(1..3)。1サイクルで落とす本数(N)
export const MOLOTOV_CYCLE_MS = 10000;        // サイクル長。次サイクルの開始はサイクル開始時刻からこの分だけ後(投下完了を待たない)
export const MOLOTOV_DROP_INTERVAL_MS = 1000; // 火の設置間隔(移動中のみ進む)
export const MOLOTOV_FIRE_LIFETIME_MS = 3000; // 1個の火の生存時間
export const MOLOTOV_FIRE_RADIUS = 22;        // 火のダメージ半径(px)。当たり判定=敵の中心がこの円内
export const MOLOTOV_DOT_DAMAGE = 5;          // 1tickあたりのダメージ
export const MOLOTOV_DOT_INTERVAL_MS = 500;   // 敵1体あたりのダメージ間隔(スロットル。複数の火に重なっても二重取りしない)

// このサイクルの投下進捗。null=アイドル(次サイクルはクールダウン明けで開始)。
export interface MolotovCycleState {
  droppedCount: number; // このサイクルで既に落とした本数
  nextDropAt: number;   // 次に(移動していれば)落とせる gameTime(ms)
}

export interface MolotovTickInput {
  gameTime: number;
  isMoving: boolean;
  cycle: MolotovCycleState | null;
  cooldownAt: number;              // subWeaponCooldowns['molotov'] ?? 0(次サイクルの開始許可時刻)
  maxFires: number;                // レベル別の1サイクルあたりの投下本数(N)
  cycleMs?: number;                // 既定 MOLOTOV_CYCLE_MS
  dropIntervalMs?: number;         // 既定 MOLOTOV_DROP_INTERVAL_MS
}

export interface MolotovTickResult {
  cycle: MolotovCycleState | null; // 次フレームへ持ち越す状態(このサイクルの投下完了時は null)
  cooldownAt: number | null;       // 新サイクル開始時のみ次回のクールダウン到達時刻を返す。null=変更なし
  drop: boolean;                   // true ならこのフレームで足元に火を1個設置する
}

// 1フレーム分の判定。gameTime/isMoving と直前の cycle/cooldownAt を渡すと、
// 「今フレーム火を落とすか」と「次フレームへ持ち越す状態」を返す(副作用なし)。
export const computeMolotovTick = ({
  gameTime,
  isMoving,
  cycle: cycleIn,
  cooldownAt,
  maxFires,
  cycleMs = MOLOTOV_CYCLE_MS,
  dropIntervalMs = MOLOTOV_DROP_INTERVAL_MS,
}: MolotovTickInput): MolotovTickResult => {
  let cycle = cycleIn;
  let cooldownAtOut: number | null = null;

  // アイドル中でクールダウン明け: 新サイクル開始。「10秒はサイクル開始基準」なので、
  // 次回のクールダウン到達時刻はここで確定させる(全本数の投下完了を待たない)。
  if (!cycle && gameTime >= cooldownAt && maxFires > 0) {
    cycle = { droppedCount: 0, nextDropAt: gameTime };
    cooldownAtOut = gameTime + cycleMs;
  }

  let drop = false;
  if (cycle && cycle.droppedCount < maxFires) {
    if (isMoving && gameTime >= cycle.nextDropAt) {
      drop = true;
      cycle = { droppedCount: cycle.droppedCount + 1, nextDropAt: gameTime + dropIntervalMs };
    }
    if (cycle.droppedCount >= maxFires) {
      cycle = null; // このサイクルの投下完了。次サイクルは cooldownAt 明けまでアイドル。
    }
  }

  return { cycle, cooldownAt: cooldownAtOut, drop };
};

// DoT当たり判定: 敵の中心が、生存中の火のいずれかの半径内にあるか(円形距離判定。
// 障害物のAABB規約とは別系統=爆風/オーラ系の既存踏襲: pumpkinBlasts/skadi等と同じ Math.hypot 方式)。
// radiusMult: エクスプローダー等の倍率(呼び出し側から一律に渡す)。個々の火が独自半径(fire.radius。
// SKILL_BUILD_REDESIGN.md §28延焼弾の炎床(大)等)を持つ場合はそちらを基準に掛け算する
// (未指定=既定radius引数=molotovの値、のままでこの倍率だけを乗じる=従来と1bit同じ)。
export const isEnemyInGroundFire = (
  enemyCx: number,
  enemyCy: number,
  fires: readonly { x: number; y: number; radius?: number }[],
  radius: number = MOLOTOV_FIRE_RADIUS,
  radiusMult: number = 1,
): boolean => {
  for (const f of fires) {
    const r = (f.radius ?? radius) * radiusMult;
    const dx = enemyCx - f.x;
    const dy = enemyCy - f.y;
    if (dx * dx + dy * dy <= r * r) return true;
  }
  return false;
};
