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
export const MOLOTOV_DOT_DAMAGE = 5;          // 延焼1tickあたりのダメージ(v0.25.3280から着火時にburnDpsTickへ書かれる)
export const MOLOTOV_DOT_INTERVAL_MS = 500;   // 敵1体あたりの着火(更新)間隔(スロットル。複数の火に重なっても二重取りしない)
// 社長指示v0.25.3280「火炎瓶を変える。踏んでる間ダメージではなく、一度踏むと延焼にする」:
// 血の履帯(=踏んでいる間だけダメージの床)との差別化。火に触れた敵は延焼(burnUntil/burnDpsTick)が
// 付き、離れても燃え続ける。総量は旧仕様と同水準(旧=踏み続け3秒で5×6tick=30 → 新=一度触れて
// 3秒燃えて5×6tick=30)。踏み続けている間は窓が更新され続ける=離れた時点から3秒。
export const MOLOTOV_IGNITE_BURN_MS = 3000;

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
/**
 * 箱(敵の当たり判定)と火だまりの円が重なるか(LAB_CRAWLER §4・品質監査2巡目A-1)。ステージ2の変異塊の代理(幅742)は
 * 中心で測ると縁に落ちた炎が効かないため、箱の中で火の中心に一番近い点で測る(enemyUtils.blastAnchorOf と同じ最近点)。
 */
export const isBoxInGroundFire = (
  box: { x: number; y: number; width: number; height: number },
  fires: readonly { x: number; y: number; radius?: number }[],
  radius: number = MOLOTOV_FIRE_RADIUS,
  radiusMult: number = 1,
): boolean => {
  for (const f of fires) {
    const r = (f.radius ?? radius) * radiusMult;
    const nx = Math.max(box.x, Math.min(box.x + box.width, f.x));
    const ny = Math.max(box.y, Math.min(box.y + box.height, f.y));
    const dx = nx - f.x, dy = ny - f.y;
    if (dx * dx + dy * dy <= r * r) return true;
  }
  return false;
};

// ---- 延焼の広がり(research/MOLOTOV_SPREAD.md・社長指示2026-11-20) ----
// 「火元の周りにも一回り小さい火が広がっていき、中範囲くらいに継続ダメージ」「レベルに伴い範囲が広がる。1は小範囲」。
// 火元を置くと 0.6秒で MOLOTOV_FIRE_RADIUS → レベルの半径へ ease-out で広がり、寿命の終わりに外側から
// 火元の大きさまで縮む。**当たりの円=その時点で灯っている半径**(見えている火=燃やす所)。
export const MOLOTOV_SPREAD_RADIUS_BY_LEVEL: readonly number[] = [0, 35, 60, 90]; // 社長指示2026-11-20「もう一回り小さく(レベル3が2くらい)」で 55/90/125 から // index=level(1..3)
export const MOLOTOV_SPREAD_GROW_MS = 600;   // 置いてから広がり切るまで
export const MOLOTOV_SPREAD_SHRINK_MS = 600; // 寿命の最後にこの時間で外側から火元の大きさへ縮む

export const molotovSpreadRadiusForLevel = (level: number): number =>
  MOLOTOV_SPREAD_RADIUS_BY_LEVEL[Math.max(1, Math.min(3, Math.floor(level) || 1))];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutCubic = (u: number) => 1 - (1 - u) * (1 - u) * (1 - u);

/**
 * 置いてから ageMs 経った火の、灯っている半径(=当たりの半径・px)。
 * 0〜GROW_MS: MOLOTOV_FIRE_RADIUS → spreadRadius(ease-out=勢いよく広がって止まる)。
 * 寿命の最後 SHRINK_MS: spreadRadius → MOLOTOV_FIRE_RADIUS(ゆっくり縮み始めて加速=火が消えていく)。
 * 寿命外(age<0 / age>=lifetime)は 0。
 */
export const molotovSpreadRadiusAt = (
  spreadRadius: number,
  ageMs: number,
  lifetimeMs: number = MOLOTOV_FIRE_LIFETIME_MS,
): number => {
  if (ageMs < 0 || ageMs >= lifetimeMs) return 0;
  const base = MOLOTOV_FIRE_RADIUS;
  const span = Math.max(0, spreadRadius - base);
  const grow = easeOutCubic(clamp01(ageMs / MOLOTOV_SPREAD_GROW_MS));
  const p = clamp01((ageMs - (lifetimeMs - MOLOTOV_SPREAD_SHRINK_MS)) / MOLOTOV_SPREAD_SHRINK_MS);
  const shrink = 1 - p * p;
  return base + span * Math.min(grow, shrink);
};

/** 火1個の、gameTime 時点の当たり半径(倍率前)。spreadRadius を持つ火(火炎瓶)だけが広がる。他は従来どおり固定。 */
export const groundFireRadiusAt = (
  fire: { createdAt: number; radius?: number; spreadRadius?: number },
  gameTime: number,
): number => {
  if (fire.spreadRadius === undefined) return fire.radius ?? MOLOTOV_FIRE_RADIUS;
  return molotovSpreadRadiusAt(fire.spreadRadius, gameTime - fire.createdAt);
};

/** 当たり判定用に、各火の半径を「今灯っている半径」に置き換えた写し(isEnemyInGroundFire/isBoxInGroundFire へ渡す)。 */
export const groundFiresWithLiveRadius = <T extends { x: number; y: number; createdAt: number; radius?: number; spreadRadius?: number }>(
  fires: readonly T[],
  gameTime: number,
): (T & { radius: number })[] => fires.map(f => ({ ...f, radius: groundFireRadiusAt(f, gameTime) }));

// --- 子の火(見た目の配置。判定は上の半径だけを見る=子ごとには見ない) ---
export interface MolotovChildFlame {
  dx: number; dy: number; // 火元からの位置(ワールドpx)
  dist: number;           // 火元からの距離(この距離まで当たりが広がった瞬間に灯る)
  size: number;           // 大きさの個体差(1前後)
  seed: number;           // コマ位相・揺らぎの種
  lightAt: number;        // 灯る時刻(置いてからのms)
  outAt: number;          // 消え切る時刻(置いてからのms)
}

export const MOLOTOV_CHILD_GROW_IN_MS = 220;  // 灯ってから大きさが揃うまで
export const MOLOTOV_CHILD_FADE_OUT_MS = 240; // 消え切る前に縮み始める長さ(消え切る時刻=当たりが外れる時刻)

// 簡易の決定的乱数(同じ火は毎フレーム同じ配置)。
const hash01 = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** 当たりの半径が dist に届く時刻(広がり側・ease-out の逆関数)。 */
const growTimeForDist = (spreadRadius: number, dist: number): number => {
  const span = spreadRadius - MOLOTOV_FIRE_RADIUS;
  if (span <= 0 || dist <= MOLOTOV_FIRE_RADIUS) return 0;
  const e = clamp01((dist - MOLOTOV_FIRE_RADIUS) / span);
  return (1 - Math.cbrt(1 - e)) * MOLOTOV_SPREAD_GROW_MS;
};
/** 縮む側で当たりの半径が dist を割る時刻。 */
const shrinkTimeForDist = (spreadRadius: number, dist: number, lifetimeMs: number): number => {
  const span = spreadRadius - MOLOTOV_FIRE_RADIUS;
  if (span <= 0 || dist <= MOLOTOV_FIRE_RADIUS) return lifetimeMs;
  const e = clamp01((dist - MOLOTOV_FIRE_RADIUS) / span);
  return lifetimeMs - MOLOTOV_SPREAD_SHRINK_MS + Math.sqrt(1 - e) * MOLOTOV_SPREAD_SHRINK_MS;
};

/**
 * 子の火の配置。内側の輪+(半径が足りれば)外側の輪。数は輪の周の長さに比例(Lv1=内側の輪だけ)。
 * 角度・距離・大きさを少しずつずらして機械的な等間隔にしない。すべての子は当たりの円の内側に置く
 * (=灯っている所にだけ火が見える)。
 */
export const molotovChildFlameLayout = (
  spreadRadius: number,
  seed: number,
  lifetimeMs: number = MOLOTOV_FIRE_LIFETIME_MS,
): MolotovChildFlame[] => {
  const out: MolotovChildFlame[] = [];
  if (spreadRadius <= MOLOTOV_FIRE_RADIUS) return out;
  // 外側の輪を足すのは半径が中以上(Lv2〜)の時だけ。
  const hasOuter = spreadRadius >= 80;
  const rings: { r: number; count: number }[] = hasOuter
    ? [
        { r: spreadRadius * 0.5, count: Math.round((spreadRadius * 0.5 * Math.PI * 2) / 40) },
        { r: spreadRadius * 0.84, count: Math.round((spreadRadius * 0.84 * Math.PI * 2) / 46) },
      ]
    : [{ r: spreadRadius * 0.74, count: Math.max(5, Math.round((spreadRadius * 0.74 * Math.PI * 2) / 40)) }];
  let k = 0;
  rings.forEach((ring, ri) => {
    const phase = hash01(seed + ri * 7.3) * Math.PI * 2;
    for (let i = 0; i < ring.count; i++, k++) {
      const h1 = hash01(seed + k * 3.17 + 1.1);
      const h2 = hash01(seed + k * 5.71 + 2.3);
      const h3 = hash01(seed + k * 9.13 + 3.7);
      const ang = phase + ((i + (h1 - 0.5) * 0.55) / ring.count) * Math.PI * 2;
      // 距離は輪の半径 ±12%。当たりの円(spreadRadius)からははみ出さない。
      const dist = Math.min(spreadRadius - 4, ring.r * (0.88 + h2 * 0.24));
      const lightAt = growTimeForDist(spreadRadius, dist);
      const outAt = shrinkTimeForDist(spreadRadius, dist, lifetimeMs);
      out.push({
        dx: Math.cos(ang) * dist,
        dy: Math.sin(ang) * dist,
        dist,
        size: 0.82 + h3 * 0.36,
        seed: seed * 0.37 + k * 1.618,
        lightAt,
        outAt,
      });
    }
  });
  return out;
};

/**
 * 子の火の大きさ(0..~1.08)。灯った瞬間に0から勢いよく伸びて少し行き過ぎて落ち着き(慣性)、
 * 消え切る前にゆっくり縮み始めて加速して消える。outAt 以降は 0(=当たりの外では見えない)。
 */
export const molotovChildFlameScale = (flame: MolotovChildFlame, ageMs: number): number => {
  if (ageMs < flame.lightAt || ageMs >= flame.outAt) return 0;
  const u = clamp01((ageMs - flame.lightAt) / MOLOTOV_CHILD_GROW_IN_MS);
  // easeOutBack(行き過ぎ 8%前後)
  const c1 = 1.2, c3 = c1 + 1;
  const grow = 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
  const v = clamp01((flame.outAt - ageMs) / MOLOTOV_CHILD_FADE_OUT_MS);
  const fade = 1 - (1 - v) * (1 - v); // 消え際: 残り時間に対して ease-out=縮み始めはゆっくり、最後に加速
  return Math.max(0, grow) * fade;
};
