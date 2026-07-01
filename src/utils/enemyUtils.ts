import { DifficultyRank, EnemyColorTier, Enemy, EnemyType, GameBounds, Player, Projectile, Summon } from '../types/game';

// 固定ビュー矩形からの「画面外」バンド(px・社長指示Bで具体値決め直し)。全辺一律で「画面端から○px外」を意味する。
// 固定ビューにしたので画面サイズ比ではなく固定px。SPAWN<RECYCLE のヒステリシスで湧いた敵が即リサイクルされない。実機で微調整可。
export const OFFSCREEN_SPAWN_MARGIN = 140;    // ビュー矩形の外側この距離で湧く(全辺一律)
export const OFFSCREEN_RECYCLE_MARGIN = 240;  // ビュー矩形の外側この距離を超えたら画面外送り(湧き直し)。社長指示で 420→240=すぐ回収

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
  // 変異体(抱卵型・旧ghost): 直進せずプレイヤーの周囲を周回し、1秒ごとに緑卵(mine)を撒く(AIは store)。internal idは'ghost'のまま。
  ghost:     { width: 24, height: 24, speed: 48,  health: 26,   damage: 6,   experienceValue: 3 },
  werewolf:  { width: 30, height: 30, speed: 105, health: 32,   damage: 12,  experienceValue: 3 },
  pumpkin:   { width: 40, height: 40, speed: 55,  health: 150,  damage: 16,  experienceValue: 8 },
  // 新型(lich・ステージ4): 速度はゴースト(90)の1.2倍=108。旋回しながら詰めてくる(AIは store)。
  lich:      { width: 30, height: 30, speed: 108, health: 36,   damage: 12,  experienceValue: 4 },
  giantbat:  { width: 60, height: 60, speed: 70,  health: 200,  damage: 19,  experienceValue: 30 },
  reaper:    { width: 80, height: 80, speed: 130, health: 4000, damage: 999, experienceValue: 0 },
  // 研究所専用ゾンビ(通常敵データ参考)。Lv1=雑魚〜 / Lv2=変異(中) / Lv3=巨体(パンプキン相当)。動きは通常チェイス。
  // 社長指示: 耐久値(health)はデフォルトに戻す(2倍化を撤回)。damage は据え置き(2倍のまま)。
  // 研究所(ステージ2)の敵は耐久値を全員2倍(社長指示)。lab-zombie はこのステージ専用。
  'lab-zombie-1': { width: 28, height: 28, speed: 52, health: 80,  damage: 20, experienceValue: 4 },
  'lab-zombie-2': { width: 34, height: 34, speed: 105, health: 180, damage: 28, experienceValue: 8 }, // 速度を犬(werewolf)と同じ105へ(社長指示=研究所の犬が遅い対策)
  'lab-zombie-3': { width: 46, height: 46, speed: 48, health: 320, damage: 36, experienceValue: 20 },
  // 裏ボス(ステージ1=ミーミル / ステージ3=ヨルムンガルド)。仕様は共通(社長指示):
  //  ・大きさ=通常ジャイアント(giantbat 60)の約3倍 ・速度=ジャイアントと同じ(70)
  //  ・耐久=ジャイアントの3倍 ・攻撃力(接触)=ジャイアントの2倍。
  // 耐久/攻撃は CONSTANT_STRENGTH_TYPES 経由で giantbat と同じ固定スケール(hpMult=ENEMY_HP_MULT, dmgMult=1)に乗る。
  //  → health 600×5=3000(giant 200×5=1000 の3倍) / damage 38(giant 19 の2倍)。
  // 裏ボスの width/height は「当たり判定の帯(足元の四角・社長指定)」。絵はこれより大きくフル表示する
  // (pixiScene の BOSS_SPRITE_FIT で帯=絵の下部に合わせて配置)。見た目=絵 / 判定=この帯、で分離。
  // 帯サイズは素材アスペクト×指定フレームから算出(BOSS_SPRITE_FIT と整合させること)。
  // 裏ボスは hpMult を掛けず health をそのまま maxHealth にする(buildEnemy 参照)。個別指定(社長指示)。
  // 帯(=当たり判定/見た目の基準)を ×1.5(社長指示「敵すべて1.5倍・ボスも」)。絵は BOSS_SPRITE_FIT で帯基準に追従。
  mimir:      { width: 248, height: 138, speed: 90, health: 6666,  damage: 38, experienceValue: 0 },
  jormungand: { width: 519, height: 90,  speed: 90, health: 7500,  damage: 38, experienceValue: 0 },
  skadi:      { width: 456, height: 102, speed: 90, health: 10000, damage: 38, experienceValue: 0 },
  // ハンター変異体(イベント専用・通常プールには入れない)。強さは通常敵と同じ計算式に乗せる
  // (CONSTANT_STRENGTH_TYPES には入れない=エリア/距離・色でスケール)。社長指示の規定値:
  //  実効「耐久6000・攻撃40」スタート → 通常式 health×(ENEMY_HP_MULT=5)×areaDiff を踏まえ
  //  base health=1200(=6000/5)、base damage=40(非fixed: damage×areaDiff)。深いエリアほど上昇。
  //  近接フィニッシュは即死しない(isBossType=true=ボス級のクリットダメージ扱い)。
  hunter:     { width: 56, height: 64, speed: 82, health: 1200, damage: 40, experienceValue: 120 },
  // 変異体(叫喚型・イベント専用=通常プールに入れない。useGameLoop のディレクターが同時1体だけ出す)。
  // 役割は周囲の通常敵の一時強化。直接火力は弱め(接触6)、中程度HP=叫ぶ前に倒して阻止する優先処理対象。
  screamer:   { width: 36, height: 36, speed: 55, health: 60, damage: 6, experienceValue: 3 }
};

// 裏ボス共通判定(完全に同一仕様。stage で見た目/名前だけ変わる)。
export const isHiddenBoss = (t: EnemyType): boolean => t === 'mimir' || t === 'jormungand' || t === 'skadi';

// Big set-piece enemies. They use a different crit ruleset (no instant melee
// finisher; crits hit much harder instead).
export const isBossType = (t: EnemyType): boolean =>
  t === 'pumpkin' || t === 'giantbat' || t === 'reaper' || t === 'lab-zombie-3' ||
  t === 'mimir' || t === 'jormungand' || t === 'skadi' || t === 'hunter';

// Stage director: which enemy types are eligible at this gameTime, and how
// likely each is to be picked. Modeled after Mad Forest's gentle ramp.
interface EnemyWeight { type: EnemyType; weight: number; }

// エリア補正テーブル(社長指定)。finalWeight = baseWeight × areaWeight[area]。0 のエリアは候補から除外。
// 添字 = エリア(0 軍備 / 1 研究 / 2 デンジャー / 3 未確認 / 4 深層)。
const AREA_WEIGHT: Partial<Record<EnemyType, number[]>> = {
  bat:      [1.0, 0.7, 0,   0,   0  ],
  skeleton: [1.0, 1.0, 0.8, 0,   0  ],
  zombie:   [0.6, 1.0, 1.0, 1.0, 0.8],
  plant:    [0,   1.0, 1.0, 1.0, 1.0],
  ghost:    [0,   0,   0.8, 1.0, 1.1],
  werewolf: [0,   0,   0.7, 1.1, 1.2],
  pumpkin:  [0,   0,   0,   0.1, 0.3],
  lich:     [0,   0,   0.7, 1.1, 1.2], // 重み付けはウェアウルフと同等(社長指示)。ただし出現はステージ4のみ(下の allowLich でゲート)。
};

// 型ごとの基礎重み(既存値を定数化)。仕様§6/§7: 型の解禁・比率は時間ではなくエリア補正だけで決める。
// finalWeight = BASE_WEIGHT × AREA_WEIGHT[area]。0 のエリアは候補から除外。
// giantbat / reaper / lab-zombie は通常プールに含めない(§10。別経路で出す)。
const BASE_WEIGHT: Partial<Record<EnemyType, number>> = {
  bat:      100,
  skeleton: 55,
  zombie:   45,
  plant:    14,
  ghost:    45,
  werewolf: 45,
  pumpkin:  22,
  lich:     45, // ステージ4のみ(allowLich でゲート)。重みはウェアウルフと同等(社長指示)。
};

// 難易度③(種類軸): escalation で「重い型」の重みを乗算で底上げ(過剰育成なら手強い種類が増える)。
// esc=0 なら 1 倍で現状と完全一致(安全)。
const DDA_TOUGH_TYPES = new Set<EnemyType>(['werewolf', 'pumpkin', 'lich']);
const DDA_VARIETY_ESC_K = 1.8; // esc=1 で重い型の重み ×2.8(私案)
const SCENE_FEATURED_BOOST = 2.5; // シーンで featured 指定した型の重み倍率(乗算バイアス・私案)
// 型選択は「現在エリアの areaWeight」で決める(仕様§6)。esc で重い型に重み加算、featured でシーンの強調型に重み加算。
// featured は乗算バイアス=エリアで出現不可(重み0)の型は0のまま(エリア規約を尊重)。
const selectEnemyType = (area: number, allowLich = false, esc = 0, featured: EnemyType[] = []): EnemyType => {
  const toughBoost = 1 + Math.max(0, esc) * DDA_VARIETY_ESC_K;
  // baseWeight × エリア補正 ×(重い型なら toughBoost)×(シーン強調なら SCENE_FEATURED_BOOST)。補正0(=そのエリアでは出現不可)は除外。
  const pool = (Object.entries(BASE_WEIGHT) as [EnemyType, number][])
    .filter(([type]) => type !== 'lich' || allowLich) // lich はステージ4(雪原)限定
    .map(([type, w]) => ({ type, weight: w * ((AREA_WEIGHT[type]?.[area]) ?? 0) * (DDA_TOUGH_TYPES.has(type) ? toughBoost : 1) * (featured.includes(type) ? SCENE_FEATURED_BOOST : 1) }))
    .filter(e => e.weight > 0);
  if (pool.length === 0) return 'zombie'; // 安全網(zombie は全エリアで出現可)
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

// ---- エリア(距離)モデル ------------------------------------------------------
// 区域: 0 軍備配置(0-1500) / 1 研究対象(1500-3000) / 2 デンジャー(3000-5000) /
//       3 未確認汚染(5000-7500) / 4 深層域(7500-)。距離 = スタート地点(原点)からの距離。
export const AREA_COUNT = 5;
export const areaIndexForPos = (x: number, y: number): number => {
  const d = Math.hypot(x, y);
  if (d >= 7500) return 4;
  if (d >= 5000) return 3;
  if (d >= 3000) return 2;
  if (d >= 1500) return 1;
  return 0;
};

// エリア基礎難易度倍率(社長指定)。最終倍率 = エリア基礎 × 色付き倍率(時間スケールは廃止)。
const AREA_BASE_DIFFICULTY = [1.0, 1.2, 1.45, 1.75, 2.1];
// エリアごとの敵最大数(社長指定)。useGameLoop の通常湧き上限に使用。
export const AREA_MAX_ENEMIES = [5, 7, 10, 10, 10];

// この敵タイプはこのエリアで出現可能か。AREA_WEIGHT が 0 のエリアでは無効(=距離リサイクル対象)。
// 定義がないタイプ(ラボ系/reaper)は常に有効(エリア制限なし)。
export const isValidForArea = (type: EnemyType, area: number): boolean => {
  const w = AREA_WEIGHT[type]?.[area];
  return w === undefined || w > 0;
};

const difficultyRankForArea = (area: number): DifficultyRank => {
  switch (area) {
    case 1: return 'strong';
    case 2: return 'elite';
    case 3: return 'danger';
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
// 影の色で表現(本体の見た目は同じ・旧装飾=黒翼/紫角/赤翼/リング等は廃止)。色ごとに強さ倍率(社長指定)。
// ジャイアント未満の一般敵のみ対象。ジャイアント/死神/特別敵には付かない(強さ一定)。
const COLOR_TIER_MULT: Record<EnemyColorTier, number> = { blue: 1.2, purple: 1.5, red: 2 };
// 「強さ一定」タイプ(距離/色でスケールしない)。将来の特別敵もここへ追加して除外する。
const CONSTANT_STRENGTH_TYPES = new Set<EnemyType>(['giantbat', 'reaper', 'mimir', 'jormungand', 'skadi']);
// ステージ2(ラボ)専用の敵は固定難易度(エリア/色/時間で変動させない・社長指定)。lab-zombie 本来のステータスを使う。
const LAB_FIXED_TYPES = new Set<EnemyType>(['lab-zombie-1', 'lab-zombie-2', 'lab-zombie-3']);
// エリア → [青影, 紫影, 赤影] の出現確率(絶対値・社長指定)。残りは無色。
const COLOR_RATE_BY_AREA: [number, number, number][] = [
  [0,    0,    0   ], // 軍備配置
  [0.03, 0,    0   ], // 研究対象
  [0.05, 0.01, 0   ], // デンジャー
  [0.07, 0.02, 0.01], // 未確認汚染
  [0.12, 0.06, 0.02], // 深層域
];
// 難易度③(強さ軸): escalation(0..1)で色付き(=強い)個体の出現率を乗算で底上げ。
// esc=0 なら boost=1 で現状と完全一致(安全)。エリア基礎が0(軍備配置)なら 0×boost=0 のまま。
const DDA_COLOR_ESC_K = 2.5;   // esc=1 で色出現率 ×3.5(私案)
const DDA_COLOR_SUM_CAP = 0.85; // 色付き合計確率の上限(無色を必ず一定残す)
const rollColorTierForArea = (area: number, esc = 0): EnemyColorTier | undefined => {
  const base = COLOR_RATE_BY_AREA[area] ?? COLOR_RATE_BY_AREA[0];
  const boost = 1 + Math.max(0, esc) * DDA_COLOR_ESC_K;
  let b = base[0] * boost, p = base[1] * boost, red = base[2] * boost;
  const sum = b + p + red;
  if (sum > DDA_COLOR_SUM_CAP) { const s = DDA_COLOR_SUM_CAP / sum; b *= s; p *= s; red *= s; }
  const r = Math.random();
  if (r < red) return 'red';
  if (r < red + p) return 'purple';
  if (r < red + p + b) return 'blue';
  return undefined;
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
  aggroRange: number,
  // シーカー発動中などでプレイヤーを標的にできない場合 true。召喚がいればそれを狙い、
  // いなければ hidden=true(=狙う相手なし。呼び出し側で待機/非発砲にする)。
  playerHidden = false,
): { x: number; y: number; isSummon: boolean; hidden: boolean } => {
  const ex = enemy.x + enemy.width / 2;
  const ey = enemy.y + enemy.height / 2;
  const px = player.x + player.width / 2;
  const py = player.y + player.height / 2;
  let bestX = px;
  let bestY = py;
  let bestD2 = playerHidden ? Infinity : (px - ex) * (px - ex) + (py - ey) * (py - ey);
  let isSummon = false;
  const aggro2 = aggroRange * aggroRange;
  for (const s of summons) {
    if (s.kind !== 'normal') continue;
    const sx = s.x + s.width / 2;
    const sy = s.y + s.height / 2;
    const d2 = (sx - ex) * (sx - ex) + (sy - ey) * (sy - ey);
    if (d2 <= aggro2 && d2 < bestD2) { bestD2 = d2; bestX = sx; bestY = sy; isSummon = true; }
  }
  // プレイヤーが隠れていて召喚も射程外 → 標的なし。
  if (playerHidden && !isSummon) return { x: px, y: py, isSummon: false, hidden: true };
  return { x: bestX, y: bestY, isSummon, hidden: false };
};

const buildEnemy = (
  type: EnemyType,
  x: number,
  y: number,
  gameTime: number,
  isWave = false,
  esc = 0 // 難易度③: 強さ(色ティア)escalation。0=現状据え置き。
): Enemy => {
  const stats = ENEMY_STATS[type];
  // 強さ一定タイプ(ジャイアント/死神)＋ラボ専用敵は距離・色・時間でスケールしない(固定難易度・社長指定)。
  const constant = CONSTANT_STRENGTH_TYPES.has(type);
  const fixed = constant || LAB_FIXED_TYPES.has(type);
  const area = areaIndexForPos(x, y);
  const distanceZone = area; // 互換フィールド(0-4)
  const difficultyRank = difficultyRankForArea(area); // トレジャー抽選用(エリアベース)
  // 色付き(固定難易度タイプには付かない)。色ごとの倍率を強さに乗せる。
  const colorTier = fixed ? undefined : rollColorTierForArea(area, esc);
  const colorMult = colorTier ? COLOR_TIER_MULT[colorTier] : 1;
  // 最終倍率 = エリア基礎難易度 × 色付き倍率(社長指定・時間スケールは廃止)。固定難易度タイプ = 1。
  const diff = fixed ? 1 : AREA_BASE_DIFFICULTY[area] * colorMult;
  // Reaper は終端個体で別管理。giant/ラボ等の固定タイプは全体底上げ(ENEMY_HP_MULT)のみ維持。
  // reaper と裏ボスは health をそのまま使う(裏ボスは個別HPを直接指定=ENEMY_HP_MULT を掛けない)。
  const hpMult = (type === 'reaper' || isHiddenBoss(type)) ? 1 : (fixed ? ENEMY_HP_MULT : diff * ENEMY_HP_MULT);
  const dmgMult = type === 'reaper' ? 1 : (fixed ? 1 : diff);

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
  pressureDirection?: { x: number; y: number } | null,
  viewOffsetY = 0, // カメラ下げ量(px)。可視範囲はプレイヤーより上に viewOffsetY ぶん広いので、縦バンドを上へずらす。
  snowStage = false, // ステージ4(雪原)か。lich を湧きプールに含めるか否かのゲート。
  esc = 0, // 難易度③: escalation(0..1)。0=現状据え置き。種類/強さのバイアスに使う。
  featured: EnemyType[] = [] // シーン(SpawnScene)の強調型。selectEnemyType の重みに乗算バイアス。
): Enemy => {
  // 型選択は「プレイヤーが今いるエリア」の補正で行う(湧きはプレイヤー近傍なので実質同じ)。
  const playerArea = areaIndexForPos(player.x + player.width / 2, player.y + player.height / 2);
  const type = forcedType ?? selectEnemyType(playerArea, snowStage, esc, featured);
  const viewportWidth = gameBounds.width;
  const viewportHeight = gameBounds.height;
  // 可視範囲はワールドと1:1(カメラ幅=gameBounds)。プレイヤーは中央より viewOffsetY 下にいるので、
  // 可視縦バンドの中心は player.y より viewOffsetY 上(=vy0)。そこを基準に上下端の外へ湧かせる。
  const halfW = viewportWidth / 2;
  const halfH = viewportHeight / 2;
  const vy0 = player.y - viewOffsetY; // 可視縦バンドの中心(world Y 近似)
  const margin = OFFSCREEN_SPAWN_MARGIN; // 固定ビュー矩形の外側この距離(全辺一律・社長指示B)

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
      y = vy0 - halfH - margin;
      break;
    case 1: // 右辺の外
      x = player.x + halfW + margin;
      y = vy0 - halfH + Math.random() * viewportHeight;
      break;
    case 2: // 下辺の外
      x = player.x - halfW + Math.random() * viewportWidth;
      y = vy0 + halfH + margin;
      break;
    case 3: // 左辺の外
      x = player.x - halfW - margin;
      y = vy0 - halfH + Math.random() * viewportHeight;
      break;
  }
  return buildEnemy(type, x, y, gameTime, false, esc);
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
  // 裏ボス: 弾の性能(damage/speed/size)はここで定義するが、発射タイミングは
  // useGameLoop の専用コントローラ(3連発/全方位16発)が直接制御する(interval/range は使わない)。
  if (enemy.type === 'mimir' || enemy.type === 'jormungand' || enemy.type === 'skadi') {
    return { interval: 99999, range: 99999, speed: 320, damage: 20, size: 16 };
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
    ownerType: enemy.type,
    ownerId: enemy.id,
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
    case 'lich':     return '#7fb4e6';  // icy blue (ステージ4新型)
    case 'mimir':    return '#7a3b5e';  // 眼の血色がかった紫(裏ボス)
    case 'jormungand': return '#13204a'; // 深い蛇の藍(裏ボス)
    case 'skadi':    return '#bfe6ff';  // 氷の蒼白(裏ボス)
    case 'hunter':   return '#d9cfc4';  // 蒼白い肉色(ハンター変異体)
    case 'screamer': return '#8fae4f';  // くすんだ毒々しい緑(叫喚型)
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
