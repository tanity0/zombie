// シールドで技を防いだ瞬間の「演出の曲線・色・間引き」の純関数(第2回クリエイティブ監査 2026-10-18・research/SHIELD_BLOCK.md §8)。
// 視覚/音だけを決める。判定・耐久の削れ量・予告の絵は 1 ミリも読まない/変えない(shieldGuardCost / shieldBlock の領分)。
// pixiScene(絵)と useGameLoop(粒子・音)が同じ式を読む。依存ゼロの葉モジュール。

const smooth = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const frac = (x: number): number => x - Math.floor(x);

// ---------------------------------------------------------------------------------------------
// 押し戻し(盾が攻撃の向きへ弾かれて戻る)
// ---------------------------------------------------------------------------------------------

/** 押し出されきるまで(ms)。30〜50ms=「パンッ」と一気に出る。 */
export const SHIELD_PUSH_SNAP_MS = 40;
/** ボス級(耐久が削れた)の防ぎの押し戻し距離の幅(px)。10〜14。 */
export const SHIELD_PUSH_HEAVY_MIN_PX = 10;
export const SHIELD_PUSH_HEAVY_MAX_PX = 14;
/** それ以外の防ぎの押し戻し距離(px)。 */
export const SHIELD_PUSH_LIGHT_PX = 6;
/** 光線が当たり続けている間の不規則な震えの最大(px)。2〜3。 */
export const SHIELD_HOLD_JITTER_PX = 2.5;

/** 押し戻しの大きさ(px)。seed(防ぎの始まりの時刻)で 10〜14 の中をばらす(毎回同じ距離にならない)。 */
export const shieldPushPx = (heavy: boolean, seed: number): number =>
  heavy ? SHIELD_PUSH_HEAVY_MIN_PX + (SHIELD_PUSH_HEAVY_MAX_PX - SHIELD_PUSH_HEAVY_MIN_PX) * frac(seed * 0.61803398875) : SHIELD_PUSH_LIGHT_PX;

/**
 * 押し戻し1発の変位(最大 1 に正規化)。防ぎの始まりからの経過 t(ms):
 *   0〜SNAP: ease-out で一気に押し出される(出だしが最速=「弾かれた」) → 以後は減衰しながら戻り、
 *   わずかに行き過ぎて(-13%ほど・攻撃した側へ押し込む向き)ばね戻りで 0 に収まる。左右非対称(smoothstep の往復ではない)。
 */
export const shieldPushCurve = (t: number): number => {
  if (t <= 0) return 0;
  if (t < SHIELD_PUSH_SNAP_MS) { const u = t / SHIELD_PUSH_SNAP_MS; return 1 - (1 - u) * (1 - u); }
  const a = t - SHIELD_PUSH_SNAP_MS;
  if (a > 900) return 0;
  return Math.exp(-a / 95) * Math.cos(a / 62);
};

/**
 * 光線が当たり続けている間の「押されたまま」の量(0..1)。当たり続けて 120ms から立ち上がり(ease)、離れると指数で戻る。
 *   contactMs = 防ぎの始まり〜直近に防いだ時刻 / sinceEndMs = 直近に防いだ時刻からの経過(離れた後)。
 */
export const shieldHoldAmount = (contactMs: number, sinceEndMs: number): number => {
  const grow = smooth((contactMs - 120) / 200);
  if (grow <= 0) return 0;
  return sinceEndMs <= 0 ? grow : grow * Math.exp(-sinceEndMs / 110);
};

/** 当たり続けている時の不規則な震え(px)。速さの違う3つの揺れを重ねる=周期が見えない。amount=shieldHoldAmount。 */
export const shieldHoldJitter = (tMs: number, seed: number, amount: number): number => {
  if (amount <= 0.001) return 0;
  const s = frac(seed * 0.7548776662) * 6.2831853;
  const v = 1.2 * Math.sin(tMs / 19 + s) + 0.9 * Math.sin(tMs / 7.7 + 2.1 * s) + 0.6 * Math.sin(tMs / 3.3 + 0.7 * s);
  return (v / 2.7) * SHIELD_HOLD_JITTER_PX * amount;
};

/** 防いだ瞬間の光(0..1): 一瞬で立ち上がり(20ms)、指数で退く。当たり続けは holdAmount の分だけ薄く残る。 */
export const shieldGuardGlow = (sinceStartMs: number, holdAmount: number): number => {
  const hit = sinceStartMs <= 0 ? 0 : Math.min(1, sinceStartMs / 20) * Math.exp(-Math.max(0, sinceStartMs - 20) / 140);
  return Math.min(1, hit + 0.35 * holdAmount);
};

/** 「欠けた」暗さ(0..1): 耐久が実際に削れた直後に一気に濁り、ゆっくり戻る。 */
export const shieldChipDark = (sinceChipMs: number): number => {
  if (sinceChipMs <= 0) return 0;
  const attack = Math.min(1, sinceChipMs / 30);
  return attack * Math.exp(-Math.max(0, sinceChipMs - 30) / 520);
};

// ---------------------------------------------------------------------------------------------
// 盾が壊れた時の残骸(攻撃の向きへ飛んで薄れる)
// ---------------------------------------------------------------------------------------------

/** 飛んでいく距離(px)。 */
export const SHIELD_GHOST_FLY_PX = 150;
/** 残骸が消えるまで(ms)。 */
export const SHIELD_GHOST_LIFE_MS = 750;

/** 残骸の姿勢。t=飛び始めからの経過(ms)。出だしは加速(2つの指数の積=初速0)・以後は減衰=慣性。 */
export const shieldGhostPose = (t: number): { dist: number; rot: number; alpha: number } => {
  if (t <= 0) return { dist: 0, rot: 0, alpha: 1 };
  const dist = SHIELD_GHOST_FLY_PX * (1 - Math.exp(-t / 170)) * (1 - Math.exp(-t / 35));
  const rot = 1.1 * (1 - Math.exp(-t / 230)) * (1 - Math.exp(-t / 60));
  const alpha = 1 - smooth((t - 140) / (SHIELD_GHOST_LIFE_MS - 140));
  return { dist, rot, alpha };
};

// ---------------------------------------------------------------------------------------------
// 色: 物理の技 = 金属の火花(白→淡い金) / 光線 = その光線自身の色(紫の光線は紫・赤は赤)。紫は赤い/物理の攻撃を防ぐ色にしない。
// ---------------------------------------------------------------------------------------------

export interface GuardPalette {
  /** 火花の色(明→暗の順)。 */
  sparks: readonly [string, string];
  /** 光だまりの色(rgba の先頭部分。末尾に alpha と ')' を足して使う)。 */
  glow: string;
  /** 衝撃リング(外・内)。 */
  ring: readonly [string, string];
  /** 全画面の一瞬の閃光。 */
  flash: string;
  /** 盾の絵に重ねる光の色(0xRRGGBB)。 */
  tint: number;
}

export const METAL_PALETTE: GuardPalette = {
  sparks: ['#ffffff', '#fde68a'],
  glow: 'rgba(253,230,138,',
  ring: ['rgba(255,255,255,0.95)', 'rgba(253,230,138,0.9)'],
  flash: 'rgba(255,248,225,0.14)',
  tint: 0xfff0c2,
};
const PURPLE_BEAM_PALETTE: GuardPalette = {
  sparks: ['#f3e8ff', '#c084fc'],
  glow: 'rgba(192,132,252,',
  ring: ['rgba(243,232,255,0.95)', 'rgba(168,85,247,0.9)'],
  flash: 'rgba(216,180,254,0.14)',
  tint: 0xd8b4fe,
};
const RED_BEAM_PALETTE: GuardPalette = {
  sparks: ['#fff1f1', '#ff6b5a'],
  glow: 'rgba(255,90,80,',
  ring: ['rgba(255,241,241,0.95)', 'rgba(255,90,80,0.9)'],
  flash: 'rgba(255,140,130,0.12)',
  tint: 0xff8a7e,
};
/** 紫の光線を撃つ敵(ミーミル=カウンター不可の紫)。他の光線は赤。 */
const PURPLE_BEAM_ATTACKERS: ReadonlySet<string> = new Set(['mimir']);

/** 光線の防ぎの色(攻撃者の型から)。物理の技(kind='hit' など)は METAL_PALETTE を使う。 */
export const shieldBeamPalette = (attackerType: string | undefined): GuardPalette =>
  attackerType !== undefined && PURPLE_BEAM_ATTACKERS.has(attackerType) ? PURPLE_BEAM_PALETTE : RED_BEAM_PALETTE;

/**
 * 飛ぶ刃が盾で砕ける時の欠片の向き: 盾の面(進行方向の主軸)で**反射した向き**(主軸の成分だけ反転・横の成分は残す)。
 * 一様に散らさず、刃が来た向きの「跳ね返り」として欠片が飛ぶ。
 */
export const reflectAlongTravel = (dx: number, dy: number): { x: number; y: number } =>
  Math.abs(dx) >= Math.abs(dy) ? { x: -dx, y: dy } : { x: dx, y: -dy };

// ---------------------------------------------------------------------------------------------
// 1つの技で大きな衝撃(閃光・揺れ・重い音)を1度だけ出すための関門と、光線が当たり続けている間の音の包絡
// ---------------------------------------------------------------------------------------------

export interface TechniqueGateState { key: string | undefined; lastAt: number }

/** 同じ技が途切れたとみなす間隔(ms)。ミーミルの車輪の各本が盾を横切る間の空き(〜1秒)より長く、次の技の間(数秒)より短い。 */
export const TECHNIQUE_GAP_MS = 1500;

/**
 * 「新しい技の1回目の防ぎ」か。key=攻撃者の id+技の始まり(無ければ型)。同じ key で間隔が TECHNIQUE_GAP_MS 以内なら続き。
 * state を更新して返す(呼び出し側は防ぎごとに1回呼ぶ)。key が無い時は常に「新しい」=従来の間隔判定へ委ねる。
 */
export const takeTechniqueStart = (state: TechniqueGateState, key: string | undefined, now: number): boolean => {
  const fresh = key === undefined || key !== state.key || now - state.lastAt > TECHNIQUE_GAP_MS;
  state.key = key;
  state.lastAt = now;
  return fresh;
};

/** 光線が当たり続けている間の接触音の間隔(ms)。1秒に2〜3回=ひと続きの接触に聞こえる。 */
export const BEAM_HOLD_TICK_MS = 380;
/** 接触音の音量(0..): 当たり始めはやや大きく、続くほど細く(包絡)。contactMs=当たり始めからの経過。 */
export const beamHoldGain = (contactMs: number): number => 0.08 + 0.14 * Math.exp(-Math.max(0, contactMs) / 1400);
