// サブウェポン「矢の雨」(research/ARROW_RAIN.md)。純関数だけ(store も PixiJS も読まない)。
// 配線は useGameLoop(撃つ・刺さる)、描画は pixiScene(旗手の矢の雨と同じ矢の描き方)。

/** 1回の雨の本数(Lv0..3)。 */
export const ARROW_RAIN_COUNT_BY_LEVEL = [0, 12, 18, 26] as const;
/** 雨の間隔(ms・Lv0..3)。 */
export const ARROW_RAIN_CD_MS_BY_LEVEL = [0, 9000, 8000, 7000] as const;
/** 矢1本の威力(スキルの与ダメ倍率は呼び側で掛ける)。手榴弾の1割ほど上(ARROW_RAIN.md §2)。 */
export const ARROW_RAIN_DAMAGE = 17;
/** 的を探す範囲(プレイヤー中心から)。 */
export const ARROW_RAIN_SEEK_PX = 420;
/** 的の円の半径。 */
export const ARROW_RAIN_ZONE_PX = 110;
/** 1本が当たる半径(刺さった点から敵の足元まで)。 */
export const ARROW_RAIN_HIT_PX = 24;
/** 1回の雨で矢をばらす長さ(ms)。 */
export const ARROW_RAIN_SPAN_MS = 1100;
/** 矢が見えてから刺さるまで(描画の落ちる尺・ms)。 */
export const ARROW_RAIN_FALL_MS = 420;
/** 敵の足元を狙う矢の割合(残りは円の中のランダムな点)。 */
export const ARROW_RAIN_AIMED_FRAC = 0.7;
/** 刺さった矢が残る長さ(ms)。 */
export const ARROW_RAIN_STUCK_MS = 1500;

export interface RainPoint { x: number; y: number }
export interface RainTarget extends RainPoint { id: string }
/** 当たり判定に使う敵の体の矩形。 */
export interface RainBody { id: string; x: number; y: number; width: number; height: number }
/**
 * 降らせる矢1本。`bornAt` に落ち始め(見え始め)、`landAt` に刺さる(gameTime)。
 * 狙う矢(`targetId` あり)は、落ち始めるまで的の敵の足元を追い直す(監査 A-2: 1秒先には敵が動いている)。
 * `fromX` は落ちてくる側(射手=プレイヤーの側)の目安。
 */
export interface RainArrow {
  x: number; y: number; bornAt: number; landAt: number; fromX: number;
  targetId?: string; ox: number; oy: number;
  /** この矢が落ち始める時に弦の音を鳴らすか(1回の雨で数本だけ)。 */
  sfx?: boolean;
}

export const arrowRainLevel = (lv: number | undefined): 1 | 2 | 3 => Math.max(1, Math.min(3, Math.round(lv ?? 1))) as 1 | 2 | 3;

/**
 * 的の中心。プレイヤーから SEEK 以内の敵(足元)のうち、ZONE 以内に一番多く仲間がいる敵の位置。同数なら近い方。
 * 範囲内に敵がいなければ null(=撃たない)。候補から死体・昇天中・非終端の死神を外すのは呼び側。
 */
export const pickArrowRainCenter = (px: number, py: number, targets: readonly RainTarget[]): RainPoint | null => {
  const near = targets.filter(t => Math.hypot(t.x - px, t.y - py) <= ARROW_RAIN_SEEK_PX);
  if (near.length === 0) return null;
  let best: RainTarget | null = null, bestN = -1, bestD = Infinity;
  for (const a of near) {
    let n = 0;
    for (const b of near) if (Math.hypot(a.x - b.x, a.y - b.y) <= ARROW_RAIN_ZONE_PX) n++;
    const d = Math.hypot(a.x - px, a.y - py);
    if (n > bestN || (n === bestN && d < bestD)) { best = a; bestN = n; bestD = d; }
  }
  return best ? { x: best.x, y: best.y } : null;
};

/**
 * 1回の雨の矢。落ち始める時刻は start から SPAN の間にばらし(1本ごとに別々)、刺さるのは落ち始め+FALL。
 * 7割は円の中の敵(足元)を狙い(小さくずらす)、3割は円の中のランダムな点。rng は 0..1。
 * 弦の音は1本目・1/3・2/3の3本だけ(鳴らし過ぎない)。
 */
export const planArrowRain = (
  center: RainPoint, inZone: readonly RainTarget[], count: number, start: number, fromX: number, rng: () => number,
): RainArrow[] => {
  const out: RainArrow[] = [];
  for (let i = 0; i < count; i++) {
    const bornAt = start + rng() * ARROW_RAIN_SPAN_MS;
    if (inZone.length > 0 && rng() < ARROW_RAIN_AIMED_FRAC) {
      const t = inZone[Math.min(inZone.length - 1, Math.floor(rng() * inZone.length))];
      const a = rng() * Math.PI * 2, r = rng() * 10;
      const ox = Math.cos(a) * r, oy = Math.sin(a) * r;
      out.push({ x: t.x + ox, y: t.y + oy, bornAt, landAt: bornAt + ARROW_RAIN_FALL_MS, fromX, targetId: t.id, ox, oy });
    } else {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * ARROW_RAIN_ZONE_PX;
      out.push({ x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r, bornAt, landAt: bornAt + ARROW_RAIN_FALL_MS, fromX, ox: 0, oy: 0 });
    }
  }
  out.sort((a, b) => a.bornAt - b.bornAt);
  const marks = new Set([0, Math.floor(count / 3), Math.floor((count * 2) / 3)]);
  return out.map((a, i) => (marks.has(i) ? { ...a, sfx: true } : a));
};

/** 落ち始める前の狙う矢を、的の敵の今の足元へ合わせ直す(敵がもういなければそのまま)。 */
export const reaimArrow = (a: RainArrow, gameTime: number, footOf: (id: string) => RainPoint | null): RainArrow => {
  if (!a.targetId || gameTime >= a.bornAt) return a;
  const f = footOf(a.targetId);
  return f ? { ...a, x: f.x + a.ox, y: f.y + a.oy } : a;
};

/** 点から矩形までの距離(中なら0)。 */
const distToRect = (px: number, py: number, r: RainBody): number => {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.width));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.height));
  return Math.hypot(dx, dy);
};

/** 刺さった矢1本が当たる敵(体の矩形まで HIT 以内・監査 A-1: 中心距離にしない=背の高い敵も足元で当たる)。 */
export const arrowRainHits = (arrow: RainPoint, bodies: readonly RainBody[]): string[] =>
  bodies.filter(b => distToRect(arrow.x, arrow.y, b) <= ARROW_RAIN_HIT_PX).map(b => b.id);
