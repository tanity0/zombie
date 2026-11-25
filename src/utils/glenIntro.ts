// ステージ7の戦闘前会話とグレン出現の順序を一箇所で定義する。
// 初回は咆哮を最後まで見せてから出現し、既読後の出撃は会話を省略して即出現できる。
export const GLEN_FINAL_LINE = '……終わらせてあげて！';
export const GLEN_ROAR_LINE = 'グガガガガガガガガ！';

export interface GlenIntroSpawnGate {
  introSkipped: boolean;
  roarQueued: boolean;
  roarShown: boolean;
  currentText: string | null;
  roarPending: boolean;
}

export const isGlenBossSpawnReady = (gate: GlenIntroSpawnGate): boolean => {
  if (gate.introSkipped) return true;
  return gate.roarQueued
    && gate.roarShown
    && gate.currentText !== GLEN_ROAR_LINE
    && !gate.roarPending;
};

// ─────────────────────────────────────────────────────────────────────────
// 変身の場面(research/GLEN_TRANSFORM.md §2): 咆哮の行が表示に入った瞬間から、時間を止めた寄りの中で
// 人間のグレンが現れ → 苦しみ → 弾けて第一形態が出る。時間停止の中で進むので、全部「場面の開始からの
// 実時間(ms)」で決める。ここは純関数だけ(store が状態を持ち、useGameLoop が出来事を撃ち、pixi は姿を読んで描く)。
// ─────────────────────────────────────────────────────────────────────────

/** 立ち姿で現れる尺(下から上がりながらフェードイン・ease-out)。 */
export const GLEN_TF_APPEAR_MS = 450;
/** 苦しむ絵へ切り替わり、膝が落ちる時刻。 */
export const GLEN_TF_SUFFER_AT_MS = 700;
/** 苦しみの1段の長さ(4段)。 */
export const GLEN_TF_STAGE_MS = 400;
/** 苦しみの段の数。 */
export const GLEN_TF_STAGES = 4;
/** 震え最大のまま光が速く脈打つ区間の始まり(= 苦しみの4段の終わり)。 */
export const GLEN_TF_PEAK_AT_MS = GLEN_TF_SUFFER_AT_MS + GLEN_TF_STAGE_MS * GLEN_TF_STAGES; // 2300
/** 弾ける時刻(第一形態が出る)。 */
export const GLEN_TF_BURST_AT_MS = 2600;
/** 弾けの光の中で人間のグレンが消える尺(ease-in)。 */
export const GLEN_TF_VANISH_MS = 120;
/** 弾けてから寄りを保つ長さ(現れた第一形態と弾けの光を見せてから戻る)。 */
export const GLEN_TF_AFTER_BURST_MS = 500;
/** 場面の寄り(アテンション)の倍率。 */
export const GLEN_TF_ZOOM_IN = 1.6;
/** 胸の赤い光を置く高さ(足元から体の高さの何割上か)。 */
export const GLEN_TF_CHEST_K = 0.55;
/** 胸の赤い光の半径(強glow=44 未満で一番大きく=投影影を落とさない小さい光の経路。さらに noShadow で出す)。 */
export const GLEN_TF_PULSE_GLOW_R = 43;
/** 1段目の「控えめ」の光の半径。 */
export const GLEN_TF_PULSE_GLOW_R_SOFT = 30;

/**
 * 場の人間のグレンの絵(社長支給の2枚・原寸)。2枚とも同じ倍率を掛ける(1枚ずつ高さに合わせない)。
 * footX=「足元の行(両足が載る揃った一番下の行=下から2行目の不透明行)の不透明画素の横の中心」を画素で測った値。
 * footY=不透明の一番下の行の下端(2枚とも 64)。
 * 立ち姿 35×64: 行62 の不透明 x=3..29 → 中心 16.5(行60〜62 の中心も 16〜17)。行63 まで不透明。
 * 苦しむ 51×65: 行62 の不透明 x=4..40 → 中心 22.5(行60〜62 の中心も 22.5〜23)。行63 まで不透明・行64 は空。
 */
export const GLEN_HUMAN_ART = {
  stand: { name: 'npc/glen-human-stand', w: 35, h: 64, footX: 16.5, footY: 64 },
  suffer: { name: 'npc/glen-human-suffer', w: 51, h: 65, footX: 22.5, footY: 64 },
} as const;
/** 大きさの基準=二人組の場の絵(quest-futari・高さ66)を場で描く倍率と同じ(描画側で EVENT_NPC_TARGET_HEIGHT / これ)。 */
export const GLEN_HUMAN_REF_TEX_H = 66;
/** 二人組の場の絵を場で描く高さ(pixiScene の EVENT_NPC_TARGET_HEIGHT の写し・食い違いはテストが止める)。 */
export const GLEN_HUMAN_TARGET_REF_H = 108;
/** 立ち姿の体の高さ(world px・遠近の縮みを掛ける前)。寄り先・胸の光の高さに使う(描画は pixi が同じ倍率で描く)。 */
export const GLEN_HUMAN_BODY_H = GLEN_HUMAN_ART.stand.footY * GLEN_HUMAN_TARGET_REF_H / GLEN_HUMAN_REF_TEX_H;

/** 変身の場面を出すか(=今のボス出現の条件と同じ組み合わせ・GLEN_TRANSFORM.md §2-2「出す/出さないの条件は1つの関数」)。 */
export interface GlenTransformGate {
  isM7: boolean;
  introSkipped: boolean;
  cineSuppress: boolean;
  forceGateboss: boolean;
  noSpawn: boolean;
  practiceWantsCastleBoss: boolean;
}
export const shouldPlayGlenTransform = (g: GlenTransformGate): boolean =>
  g.isM7 && !g.introSkipped && !g.cineSuppress && !g.forceGateboss && (!g.noSpawn || g.practiceWantsCastleBoss);

export interface GlenBossBox { x: number; y: number; width: number; height: number }

/**
 * 第一形態の箱(当たり判定=素の寸法の2倍)と人間のグレンの足元。今のボス出現と同じ式(プレイヤーの中心から北へ dist の点に
 * 素の箱の左上を置き、2倍にして中心を保つ)で箱を作り、行ける帯へ収める。足元=箱の下辺の中央。
 */
export const glenTransformBossBox = (
  playerCx: number, playerCy: number, dist: number, baseW: number, baseH: number,
  clamp: (x: number, y: number, w: number, h: number) => { x: number; y: number },
): { box: GlenBossBox; footX: number; footY: number } => {
  const sx = playerCx, sy = playerCy - dist; // 素の箱の左上(今の出現の spawnEnemyAt の x,y)
  const w = baseW * 2, h = baseH * 2;
  const c = clamp(sx - baseW / 2, sy - baseH / 2, w, h);
  const box = { x: c.x, y: c.y, width: w, height: h };
  return { box, footX: box.x + w / 2, footY: box.y + h };
};

/** 寄り(アテンション)のホールド延長=弾けて GLEN_TF_AFTER_BURST_MS 見せるまで寄りを保つ。in/hold は呼び手の定数。 */
export const glenTransformExtraHoldMs = (attnInMs: number, attnHoldMs: number): number =>
  Math.max(0, GLEN_TF_BURST_AT_MS + GLEN_TF_AFTER_BURST_MS - attnInMs - attnHoldMs);

/** 苦しみの段(0=まだ苦しんでいない・1..4=段・5=弾ける直前の最大)。 */
export const glenTransformStageAt = (t: number): number => {
  if (t < GLEN_TF_SUFFER_AT_MS) return 0;
  if (t >= GLEN_TF_PEAK_AT_MS) return GLEN_TF_STAGES + 1;
  return 1 + Math.floor((t - GLEN_TF_SUFFER_AT_MS) / GLEN_TF_STAGE_MS);
};

/** 段ごとの震え(体の高さに対する割合・速さHz)。5=最大のまま(段4と同じ)。 */
const TREMBLE_AMP = [0, 0.02, 0.03, 0.045, 0.06, 0.06];
const TREMBLE_HZ = [0, 9, 12, 16, 20, 20];
/** 段の頭で震えの強さが前の段から寄る尺(跳ばない=慣性)。 */
const TREMBLE_RAMP_MS = 140;
/** よろめき(段の頭で横へ行って戻る)。[段, 向き×量(体の高さ比), 尺ms] */
const STAGGERS: readonly (readonly [number, number, number])[] = [[2, 0.08, 360], [3, -0.1, 360]];
/** 膝が落ちる(下へ沈む)。[時刻, 量(体の高さ比), 落ちる尺ms, 跳ね返りの量(比)] */
const KNEE_DROPS: readonly (readonly [number, number, number, number])[] = [
  [GLEN_TF_SUFFER_AT_MS, 0.06, 140, 0.018],
  [GLEN_TF_SUFFER_AT_MS + GLEN_TF_STAGE_MS * 3, 0.03, 120, 0.01], // 段4の頭でもう一段
];
const KNEE_BOUNCE_MS = 200;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (u: number) => { const c = clamp01(u); return c * c * (3 - 2 * c); };
const easeOutCubic = (u: number) => { const c = clamp01(u); return 1 - (1 - c) * (1 - c) * (1 - c); };

/** 震えの位相(周回数)。段ごとに速さが変わっても位相は連続(跳ばない)。 */
const tremblePhase = (t: number): number => {
  if (t <= GLEN_TF_SUFFER_AT_MS) return 0;
  let ph = 0;
  for (let st = 1; st <= GLEN_TF_STAGES + 1; st++) {
    const a = GLEN_TF_SUFFER_AT_MS + (st - 1) * GLEN_TF_STAGE_MS;
    const b = st <= GLEN_TF_STAGES ? a + GLEN_TF_STAGE_MS : Infinity;
    if (t <= a) break;
    ph += (Math.min(t, b) - a) / 1000 * TREMBLE_HZ[st];
  }
  return ph;
};

/** 震えの強さ(段の頭で前の段から TREMBLE_RAMP_MS かけて寄る)。 */
const trembleAmp = (t: number): number => {
  const st = glenTransformStageAt(t);
  if (st === 0) return 0;
  const head = st <= GLEN_TF_STAGES ? GLEN_TF_SUFFER_AT_MS + (st - 1) * GLEN_TF_STAGE_MS : GLEN_TF_PEAK_AT_MS;
  const prev = TREMBLE_AMP[st - 1];
  return prev + (TREMBLE_AMP[st] - prev) * smooth((t - head) / TREMBLE_RAMP_MS);
};

/**
 * 震えの横のずれ(体の高さ比)。等速の正弦にしない: 2つの周期(比 1.618)を重ね、段ごとに位相を少しずらす
 * =揺れの間隔が毎回少しずつ乱れる。位相は段をまたいで連続。
 */
const trembleX = (t: number): number => {
  const a = trembleAmp(t);
  if (a <= 0) return 0;
  const ph = tremblePhase(t);
  const v = 0.72 * Math.sin(2 * Math.PI * ph) + 0.28 * Math.sin(2 * Math.PI * ph * 1.618 + 0.9);
  return a * v;
};

/** よろめき(行って戻る・前半 smoothstep で出て後半 smoothstep で戻る=加速→減速の往復)。 */
const staggerX = (t: number): number => {
  let x = 0;
  for (const [st, amt, dur] of STAGGERS) {
    const head = GLEN_TF_SUFFER_AT_MS + (st - 1) * GLEN_TF_STAGE_MS;
    const u = (t - head) / dur;
    if (u <= 0 || u >= 1) continue;
    const k = u < 0.38 ? smooth(u / 0.38) : 1 - smooth((u - 0.38) / 0.62);
    x += amt * k;
  }
  return x;
};

/** 膝が落ちる沈み(下が正・体の高さ比)。落ちる=ease-in(重さで加速)、底で少し跳ね返って落ち着く。 */
const kneeSink = (t: number): number => {
  let y = 0;
  for (const [at, amt, fall, bounce] of KNEE_DROPS) {
    const e = t - at;
    if (e <= 0) continue;
    if (e < fall) { const u = e / fall; y += amt * u * u; continue; }
    const b = (e - fall) / KNEE_BOUNCE_MS;
    // 跳ね返り: 底から bounce だけ戻って(減速)、また底へ(加速→減速)。
    const k = b >= 1 ? 0 : b < 0.45 ? easeOutCubic(b / 0.45) : 1 - smooth((b - 0.45) / 0.55);
    y += amt - bounce * k;
  }
  return y;
};

export interface GlenTransformPose {
  /** どちらの絵(null=もう描かない)。 */
  frame: 'stand' | 'suffer' | null;
  /** 濃さ(0..1)。 */
  alpha: number;
  /** 足元からの体のずれ(体の高さ比・右が正)。位置だけ=絵は伸縮・回転しない。 */
  dx: number;
  /** 足元からの体のずれ(体の高さ比・下が正)。 */
  dy: number;
  /** 苦しみの段(glenTransformStageAt)。 */
  stage: number;
}

/** 場面の開始からの実時間 t(ms)の、人間のグレンの姿。描画はこれを読んで置くだけ。 */
export const glenTransformPose = (t: number): GlenTransformPose => {
  const stage = glenTransformStageAt(t);
  if (t < 0) return { frame: 'stand', alpha: 0, dx: 0, dy: 0.08, stage };
  if (t < GLEN_TF_APPEAR_MS) {
    const u = t / GLEN_TF_APPEAR_MS;
    // 下から体の高さの8%ぶん上がりながら現れる(ease-out)。濃さは少し先に満ちる。
    return { frame: 'stand', alpha: easeOutCubic(u * 1.25), dx: 0, dy: 0.08 * (1 - easeOutCubic(u)), stage };
  }
  if (t < GLEN_TF_SUFFER_AT_MS) {
    // 立ち姿で止まる: ごく小さく肩の上下(1回吸って戻る・位置だけ)。
    const u = (t - GLEN_TF_APPEAR_MS) / (GLEN_TF_SUFFER_AT_MS - GLEN_TF_APPEAR_MS);
    return { frame: 'stand', alpha: 1, dx: 0, dy: -0.015 * Math.sin(Math.PI * smooth(u)), stage };
  }
  const vanish = t >= GLEN_TF_BURST_AT_MS ? clamp01((t - GLEN_TF_BURST_AT_MS) / GLEN_TF_VANISH_MS) : 0;
  if (vanish >= 1) return { frame: null, alpha: 0, dx: 0, dy: 0, stage };
  // 消える=ease-in(初めはゆっくり、光の中で一気に)。揺れは止めずにそのまま消える。
  return { frame: 'suffer', alpha: 1 - vanish * vanish, dx: trembleX(t) + staggerX(t), dy: kneeSink(t), stage };
};

/** 場面の出来事(useGameLoop が時刻順に1回ずつ撃つ)。 */
export type GlenTransformEvent =
  | { at: number; kind: 'growl'; rate: number; gain: number }
  | { at: number; kind: 'pulse'; radius: number; count: number; durationMs: number }
  | { at: number; kind: 'burst' };

const PULSE_INTERVAL = [0, 600, 450, 300, 180, 80];

/**
 * 出来事の並び(時刻順)。胸の赤い光は、各段の頭で必ず1回撃ち、その段の間隔で続ける(次の段の頭が先に来たらそこで撃つ)。
 * 強さ: 段1=控えめ(小さい光1つ)/段2=光1つ/段3=明るく(2つ重ね)/段4・最大=最も明るい(3つ重ね)。
 * 呻き: 苦しむ絵へ変わる瞬間(音程0.7)・段2の頭(0.65)・段4の頭(0.6)=音程を下げていく。
 */
export const GLEN_TRANSFORM_EVENTS: readonly GlenTransformEvent[] = (() => {
  const ev: GlenTransformEvent[] = [];
  ev.push({ at: GLEN_TF_SUFFER_AT_MS, kind: 'growl', rate: 0.7, gain: 0.55 });
  ev.push({ at: GLEN_TF_SUFFER_AT_MS + GLEN_TF_STAGE_MS, kind: 'growl', rate: 0.65, gain: 0.6 });
  ev.push({ at: GLEN_TF_SUFFER_AT_MS + GLEN_TF_STAGE_MS * 3, kind: 'growl', rate: 0.6, gain: 0.66 });
  let t = GLEN_TF_SUFFER_AT_MS;
  while (t < GLEN_TF_BURST_AT_MS) {
    const st = glenTransformStageAt(t);
    const interval = PULSE_INTERVAL[st];
    const radius = st === 1 ? GLEN_TF_PULSE_GLOW_R_SOFT : GLEN_TF_PULSE_GLOW_R;
    const count = st <= 2 ? 1 : st === 3 ? 2 : 3;
    // 光の尾: 次の脈まで少し残る(間隔の1.3倍・最大 520ms)。
    ev.push({ at: t, kind: 'pulse', radius, count, durationMs: Math.min(520, Math.round(interval * 1.3)) });
    const nextHead = st <= GLEN_TF_STAGES ? GLEN_TF_SUFFER_AT_MS + st * GLEN_TF_STAGE_MS : Infinity;
    t = Math.min(t + interval, nextHead);
  }
  ev.push({ at: GLEN_TF_BURST_AT_MS, kind: 'burst' });
  return ev.sort((a, b) => a.at - b.at);
})();

/** 次に撃つ出来事の番号 from から、t(ms)までに来た出来事を返す(呼び手は返った next を覚える)。 */
export const glenTransformDueEvents = (from: number, t: number): { due: GlenTransformEvent[]; next: number } => {
  const due: GlenTransformEvent[] = [];
  let i = from;
  while (i < GLEN_TRANSFORM_EVENTS.length && GLEN_TRANSFORM_EVENTS[i].at <= t) { due.push(GLEN_TRANSFORM_EVENTS[i]); i++; }
  return { due, next: i };
};

/** 咆哮の行を閉じる(弾けた瞬間・ボスの登場に人間の台詞を重ねない)。他の行はそのまま。 */
export const glenCloseRoar = <C extends { text: string } | null, Q extends { text: string }>(
  current: C, queue: readonly Q[],
): { npcDialogue: C | null; npcDialogueQueue: Q[] } => ({
  npcDialogue: current && current.text === GLEN_ROAR_LINE ? null : current,
  npcDialogueQueue: queue.filter(l => l.text !== GLEN_ROAR_LINE),
});
