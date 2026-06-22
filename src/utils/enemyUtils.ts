import { DifficultyRank, EnemyColorTier, Enemy, EnemyType, GameBounds, Player, Projectile, Summon } from '../types/game';

// 敵の湧き位置を「画面端の外側」に出すためのマージン(画面サイズ比)。
// 可視範囲はワールドと1:1。カメラ先行(CAMERA_CENTER_CLAMP_FRAC=0.07=画面幅7%)で
// プレイヤーが中心からずれても確実に画面外へ出せるよう、それより大きい割合にする=完全に画面サイズ比例。
export const SPAWN_OFFSCREEN_MARGIN_FRAC = 0.10;

// Mad-Forest port: a stat sheet per enemy type. Difficulty multiplier scales
// the base values over time so a 25-minute zombie has more HP than a 1-minute
// zombie, mirroring how VS ramps. Spawn weights for each type live in the
// stage director (selectEnemyType) below.
interface EnemyStats {
  width: number;
  height: number;
  speed: number;       // px/s at base difficulty
  health: number;
  damage: number;
  experienceValue: number;
}

const ENEMY_STATS: Record<EnemyType, EnemyStats> = {
  bat:       { width: 22, height: 22, speed: 75,  health: 8,    damage: 6,   experienceValue: 1 },
  skeleton:  { width: 26, height: 26, speed: 60,  health: 18,   damage: 8,   experienceValue: 1 },
  zombie:    { width: 30, height: 30, speed: 42,  health: 40,   damage: 10,  experienceValue: 2 },
  plant:     { width: 28, height: 28, speed: 8,   health: 25,   damage: 0,   experienceValue: 2 },
  ghost:     { width: 24, height: 24, speed: 90,  health: 14,   damage: 5,   experienceValue: 1 },
  werewolf:  { width: 30, height: 30, speed: 105, health: 32,   damage: 12,  experienceValue: 3 },
  pumpkin:   { width: 40, height: 40, speed: 55,  health: 150,  damage: 16,  experienceValue: 8 },
  giantbat:  { width: 60, height: 60, speed: 70,  health: 200,  damage: 22,  experienceValue: 30 },
  reaper:    { width: 80, height: 80, speed: 130, health: 99999,damage: 999, experienceValue: 0 },
  // 研究所専用ゾンビ(通常敵データ参考)。Lv1=雑魚〜 / Lv2=変異(中) / Lv3=巨体(パンプキン相当)。動きは通常チェイス。
  // 社長指示: 耐久値(health)はデフォルトに戻す(2倍化を撤回)。damage は据え置き(2倍のまま)。
  // 研究所(ステージ2)の敵は耐久値を全員2倍(社長指示)。lab-zombie はこのステージ専用。
  'lab-zombie-1': { width: 28, height: 28, speed: 52, health: 80,  damage: 20, experienceValue: 4 },
  'lab-zombie-2': { width: 34, height: 34, speed: 105, health: 180, damage: 28, experienceValue: 8 }, // 速度を犬(werewolf)と同じ105へ(社長指示=研究所の犬が遅い対策)
  'lab-zombie-3': { width: 46, height: 46, speed: 48, health: 320, damage: 36, experienceValue: 20 }
};

// Big set-piece enemies. They use a different crit ruleset (no instant melee
// finisher; crits hit much harder instead).
export const isBossType = (t: EnemyType): boolean =>
  t === 'pumpkin' || t === 'giantbat' || t === 'reaper' || t === 'lab-zombie-3';

// Stage director: which enemy types are eligible at this gameTime, and how
// likely each is to be picked. Modeled after Mad Forest's gentle ramp.
interface EnemyWeight { type: EnemyType; weight: number; }

const selectEnemyType = (gameTime: number): EnemyType => {
  const t = gameTime;
  const pool: EnemyWeight[] = [];

  // Compressed ~5-minute arc (vs the old 30-min ramp). Types unlock fast so the
  // whole bestiary is seen inside one short, escalating run.
  // 0:00-0:25 — only bats
  pool.push({ type: 'bat', weight: 100 });

  if (t >= 25000)  pool.push({ type: 'skeleton', weight: 55 });   // 0:25
  // Ranged plants enter early so the counter has targets from the start. A hard
  // cap of 2 live plants is enforced in the spawner so they never get annoying.
  if (t >= 45000)  pool.push({ type: 'plant',    weight: 14 });   // 0:45
  if (t >= 75000)  pool.push({ type: 'zombie',   weight: 45 });   // 1:15
  if (t >= 150000) pool.push({ type: 'ghost',    weight: 45 });   // 2:30
  if (t >= 195000) pool.push({ type: 'werewolf', weight: 45 });   // 3:15

  // Thin the bats out as the run heats up so heavier types dominate late.
  if (t >= 150000) pool[0].weight = 45;
  if (t >= 240000) pool[0].weight = 22; // 4:00 onward, bats are rare

  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const entry of pool) {
    r -= entry.weight;
    if (r <= 0) return entry.type;
  }
  return pool[pool.length - 1].type;
};

// 研究所スキン(stage-2)専用の湧き選択: 研究所テストで作ったラボ用ゾンビ(Lv1/2/3)のみ。
// 序盤=Lv1中心、中盤でLv2、後半に巨体Lv3がたまに混ざる(時間で難度上昇)。
export const selectLabEnemyType = (gameTime: number): EnemyType => {
  const t = gameTime;
  const pool: EnemyWeight[] = [{ type: 'lab-zombie-1', weight: 100 }];
  if (t >= 45000)  pool.push({ type: 'lab-zombie-2', weight: 45 });  // 0:45
  if (t >= 150000) pool.push({ type: 'lab-zombie-3', weight: 16 });  // 2:30 巨体は控えめ
  if (t >= 150000) pool[0].weight = 55; // 後半は Lv1 を減らして重い個体を増やす
  if (t >= 240000) pool[0].weight = 32;
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const entry of pool) {
    r -= entry.weight;
    if (r <= 0) return entry.type;
  }
  return pool[pool.length - 1].type;
};

// Compute a difficulty multiplier. Retuned for the compressed ~5-min run: it
// climbs to ~2.5× by the finale instead of 5× over 30 min, so enemies get
// meaningfully tougher across the sprint without becoming bullet sponges. HP
// and damage scale with it; base speed does not.
const difficultyFor = (gameTime: number) => Math.min(1 + gameTime / 150000, 2.5);

const distanceFromStart = (x: number, y: number) => Math.hypot(x, y);

const distanceZoneFor = (x: number, y: number): number => {
  const d = distanceFromStart(x, y);
  if (d < 900) return 1;
  if (d < 1800) return 2;
  if (d < 3000) return 3;
  return 4;
};

const distanceMultiplierForZone = (zone: number): number => {
  switch (zone) {
    case 2: return 1.25;
    case 3: return 1.6;
    case 4: return 2.1;
    default: return 1;
  }
};

const difficultyRankForZone = (zone: number): DifficultyRank => {
  switch (zone) {
    case 2: return 'strong';
    case 3: return 'elite';
    case 4: return 'danger';
    default: return 'normal';
  }
};

// Global enemy toughness multiplier on top of the difficulty ramp. Bumped so
// fights are chunkier and ammo/positioning matter more. Damage is unaffected.
const ENEMY_HP_MULT = 5;
// Global enemy speed multiplier — slows the whole bestiary for a more
// deliberate, survival-horror pace (matches the slower player).
const ENEMY_SPEED_MULT = 2 / 3;

// ---- 色付き(影の色)個体 ----------------------------------------------------
// 距離が離れると確率で「色付き」になり、色ごとに強さ倍率が乗る(社長指示)。色=足元の影の色で示す
// (本体の見た目は同じ・装飾は廃止)。ジャイアント/死神/特別敵には付かない(強さ一定)。
// ※出現確率と距離倍率の正式値は後日支給(B)。下記の確率/距離テーブルは暫定。
const COLOR_TIER_MULT: Record<EnemyColorTier, number> = { blue: 1.2, purple: 1.5, red: 2 };
// 「強さ一定」タイプ(距離/時間/色でスケールしない)。将来の特別敵もここへ追加して除外する。
const CONSTANT_STRENGTH_TYPES = new Set<EnemyType>(['giantbat', 'reaper']);
// 距離ゾーン → [色付き確率, 青重み, 紫重み, 赤重み](暫定)。遠いほど色付き率↑・強い色率↑。
const COLOR_TIER_TABLE: Record<number, [number, number, number, number]> = {
  1: [0, 1, 0, 0],
  2: [0.25, 0.80, 0.18, 0.02],
  3: [0.45, 0.55, 0.35, 0.10],
  4: [0.65, 0.35, 0.40, 0.25],
};
const rollColorTier = (x: number, y: number): EnemyColorTier | undefined => {
  const [chance, bw, pw, rw] = COLOR_TIER_TABLE[distanceZoneFor(x, y)] ?? COLOR_TIER_TABLE[1];
  if (Math.random() >= chance) return undefined;
  const r = Math.random() * (bw + pw + rw);
  if (r < bw) return 'blue';
  if (r < bw + pw) return 'purple';
  return 'red';
};

// 錬金術の召喚ユニットが敵タイプの見た目/速度を流用するための取得関数。
export const getEnemyBaseSpeed = (type: EnemyType): number => ENEMY_STATS[type].speed * ENEMY_SPEED_MULT;
export const getEnemyBaseSize = (type: EnemyType): { width: number; height: number } =>
  ({ width: ENEMY_STATS[type].width, height: ENEMY_STATS[type].height });

// 敵のターゲット解決(錬金術): 既定はプレイヤー中心。aggroRange 内に、プレイヤーより近い
// 通常召喚ユニットがいればそれを狙う(ソフト/局所、ハードヘイト固定にしない)。summons は ≤3 で軽量。
export const resolveEnemyTarget = (
  enemy: Enemy,
  player: Player,
  summons: Summon[],
  aggroRange: number
): { x: number; y: number; isSummon: boolean } => {
  const ex = enemy.x + enemy.width / 2;
  const ey = enemy.y + enemy.height / 2;
  const px = player.x + player.width / 2;
  const py = player.y + player.height / 2;
  let bestX = px;
  let bestY = py;
  let bestD2 = (px - ex) * (px - ex) + (py - ey) * (py - ey);
  let isSummon = false;
  const aggro2 = aggroRange * aggroRange;
  for (const s of summons) {
    if (s.kind !== 'normal') continue;
    const sx = s.x + s.width / 2;
    const sy = s.y + s.height / 2;
    const d2 = (sx - ex) * (sx - ex) + (sy - ey) * (sy - ey);
    if (d2 <= aggro2 && d2 < bestD2) { bestD2 = d2; bestX = sx; bestY = sy; isSummon = true; }
  }
  return { x: bestX, y: bestY, isSummon };
};

const buildEnemy = (
  type: EnemyType,
  x: number,
  y: number,
  gameTime: number,
  isWave = false
): Enemy => {
  const stats = ENEMY_STATS[type];
  // 強さ一定タイプ(ジャイアント/死神/特別敵)は距離・時間・色でスケールしない。
  const constant = CONSTANT_STRENGTH_TYPES.has(type);
  const timeDiff = difficultyFor(gameTime);
  const distanceZone = distanceZoneFor(x, y);
  const distanceDiff = distanceMultiplierForZone(distanceZone);
  const difficultyRank = difficultyRankForZone(distanceZone); // トレジャー抽選用(距離ベース・据え置き)
  // 色付き(強さ一定タイプには付かない)。色ごとの倍率を強さに乗せる。
  const colorTier = constant ? undefined : rollColorTier(x, y);
  const colorMult = colorTier ? COLOR_TIER_MULT[colorTier] : 1;
  // 強さ倍率: 通常敵 = 時間×距離×色 / 強さ一定タイプ = 1。
  const diff = constant ? 1 : timeDiff * distanceDiff * colorMult;
  // Reaper は終端個体で別管理。giant 等の強さ一定タイプは全体底上げ(ENEMY_HP_MULT)のみ維持。
  const hpMult = type === 'reaper' ? 1 : (constant ? ENEMY_HP_MULT : diff * ENEMY_HP_MULT);
  const dmgMult = type === 'reaper' ? 1 : (constant ? 1 : Math.min(timeDiff * distanceDiff, 4) * colorMult);

  return {
    id: `enemy-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    x,
    y,
    width: stats.width,
    height: stats.height,
    speed: stats.speed * ENEMY_SPEED_MULT,
    health: stats.health * hpMult,
    maxHealth: stats.health * hpMult,
    damage: Math.round(stats.damage * dmgMult),
    type,
    experienceValue: stats.experienceValue,
    lastHit: 0,
    lastShot: Date.now() - Math.random() * 1500,
    spawnedAt: gameTime,
    isWave,
    distanceZone,
    difficultyRank,
    difficultyMultiplier: diff,
    colorTier
  };
};

// Generate a single enemy at a random point outside the camera viewport but
// close enough that it will plausibly reach the player. Used by both the
// continuous spawner and the wave/elite spawner.
export const generateEnemy = (
  gameTime: number,
  player: Player,
  gameBounds: GameBounds,
  forcedType?: EnemyType,
  pressureDirection?: { x: number; y: number } | null
): Enemy => {
  const type = forcedType ?? selectEnemyType(gameTime);
  const viewportWidth = gameBounds.width;
  const viewportHeight = gameBounds.height;
  // 可視範囲はワールドと1:1(カメラ幅=gameBounds)。プレイヤーはほぼ中央なので可視半幅=W/2・半高=H/2。
  // 画面端の「外側」へ出すマージンは画面サイズに比例(カメラ先行 CAMERA_CENTER_CLAMP_FRAC=0.07 を吸収する余裕)。
  const halfW = viewportWidth / 2;
  const halfH = viewportHeight / 2;
  const margin = Math.max(viewportWidth, viewportHeight) * SPAWN_OFFSCREEN_MARGIN_FRAC;

  const dirMag = pressureDirection
    ? Math.hypot(pressureDirection.x, pressureDirection.y)
    : 0;
  let spawnSide = Math.floor(Math.random() * 4);
  if (dirMag > 0.25 && Math.random() < 0.34) {
    const nx = pressureDirection!.x / dirMag;
    const ny = pressureDirection!.y / dirMag;
    spawnSide = Math.abs(nx) > Math.abs(ny)
      ? (nx > 0 ? 1 : 3)
      : (ny > 0 ? 2 : 0);
  }
  let x = 0;
  let y = 0;
  // 各辺の「外側」(半幅/半高+margin)へ。直交方向は画面幅/高いっぱいに散らす(歩いて入ってくる)。
  switch (spawnSide) {
    case 0: // 上辺の外
      x = player.x - halfW + Math.random() * viewportWidth;
      y = player.y - halfH - margin;
      break;
    case 1: // 右辺の外
      x = player.x + halfW + margin;
      y = player.y - halfH + Math.random() * viewportHeight;
      break;
    case 2: // 下辺の外
      x = player.x - halfW + Math.random() * viewportWidth;
      y = player.y + halfH + margin;
      break;
    case 3: // 左辺の外
      x = player.x - halfW - margin;
      y = player.y - halfH + Math.random() * viewportHeight;
      break;
  }
  return buildEnemy(type, x, y, gameTime, false);
};

// Spawn an enemy at a specific world position (used for Reaper, scripted
// elites, and horde lines). These are tagged isWave so the enemy-cap culler
// gives them a short grace period before they can be removed.
export const spawnEnemyAt = (
  type: EnemyType,
  x: number,
  y: number,
  gameTime: number
): Enemy => buildEnemy(type, x, y, gameTime, true);

// Hostile projectile profiles. In the Mad Forest port only `plant` shoots —
// everything else is pure melee. Plants spit seeds toward the player on a
// generous cadence so the counter has real targets to time off of.
export const ENEMY_PROJECTILE_DURATION = 4000;

interface FireProfile {
  interval: number;
  range: number;
  speed: number;
  damage: number;
  size: number;
}

export const getEnemyFireProfile = (enemy: Enemy): FireProfile | null => {
  if (enemy.type === 'plant') {
    return { interval: 2200, range: 380, speed: 230, damage: 7, size: 12 };
  }
  // ジャイアントバット: 約3秒ごとに弾を撃つ(行動パターンの1つ)。特殊行動(ジャンプ/ダッシュ)中は
  // 呼び出し側(useGameLoop)が aiPhase を見て発砲をスキップする。
  if (enemy.type === 'giantbat') {
    return { interval: 3000, range: 620, speed: 300, damage: 10, size: 14 };
  }
  return null;
};

export const createEnemyProjectile = (
  enemy: Enemy,
  player: Player,
  targetX?: number,
  targetY?: number
): Projectile => {
  const profile = getEnemyFireProfile(enemy) ?? {
    speed: 200, damage: 6, size: 12, interval: 0, range: 0
  };
  const ex = enemy.x + enemy.width / 2;
  const ey = enemy.y + enemy.height / 2;
  // 既定はプレイヤー中心(従来挙動と等価)。錬金術で召喚が標的なら呼出側が座標を渡す。
  const px = targetX ?? (player.x + player.width / 2);
  const py = targetY ?? (player.y + player.height / 2);

  const dx = px - ex;
  const dy = py - ey;
  const dist = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
  const dir = { x: dx / dist, y: dy / dist };

  return {
    id: `proj-enemy-${enemy.id}-${Date.now()}-${Math.random()}`,
    x: ex - profile.size / 2,
    y: ey - profile.size / 2,
    width: profile.size,
    height: profile.size,
    speed: profile.speed,
    damage: Math.round(profile.damage * (enemy.difficultyMultiplier ?? 1)),
    direction: dir,
    weaponType: 'enemy_bolt',
    duration: ENEMY_PROJECTILE_DURATION,
    createdAt: Date.now(),
    passthrough: false,
    hitEnemies: [],
    hostile: true,
    reflected: false
  };
};

// Color palette per type. Used by the renderer for the body fill.
export const getEnemyColor = (type: EnemyType): string => {
  switch (type) {
    case 'bat':      return '#1f1b2c';  // near-black purple
    case 'skeleton': return '#e7e3d3';  // bone white
    case 'zombie':   return '#5a7a3c';  // sickly green
    case 'plant':    return '#7e2a86';  // pink-purple
    case 'ghost':    return '#cbd5e1';  // pale blue-white
    case 'werewolf': return '#6b3f1d';  // dark brown
    case 'pumpkin':  return '#f97316';  // orange
    case 'giantbat': return '#11122c';  // very dark
    case 'reaper':   return '#0a0a0a';  // pitch black
    default:         return '#dc2626';
  }
};

// RE-style spawn cadence: a sparse, deliberate trickle, not a swarm. One
// enemy at a time, slow interval, so the field stays at ~5-10 bodies under
// the hard cap (see useGameLoop) instead of the VS wall-of-enemies.
export const getEnemySpawnInterval = (gameTime: number): number => {
  // ~2000ms at start → ~1200ms floor by ~26 minutes.
  const base = Math.max(1200, 2000 - gameTime / 2000);
  return base + Math.random() * 300;
};

export const getEnemySpawnCount = (): number => {
  // Always one body per spawn tick — density is governed by the cap.
  return 1;
};
