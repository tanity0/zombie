// 揺れの整理(research/SHAKE_UNIFY.md・社長承認2026-09-14): プレイヤー起因のダメージ揺れを1本の式にする。
//   土台: レート正規化(REF より短い間隔で当たる/撃つ源は 1回ぶんを 間隔/REF 倍に絞る=1秒あたりの揺れ量に天井)
//   1層目: base = clamp(K * sqrt(ダメージ), 0, BASE_MAX)     ダメージ=実効・クリ倍率を掛ける前・過剰分は切る(impactDamageOf)
//   2層目: 特殊パターンの倍率(振幅と長さの2値)を掛け合わせ、HARD_MAX で止める
// 純関数のみ(store/描画から独立)。描画側の SHAKE_GLOBAL_MULT(×2)はこの外で掛かる。
export const IMPACT_K = 0.65;
export const IMPACT_BASE_MAX = 8;    // 倍率前の天井(150ダメ以上だけ着く)
export const IMPACT_HARD_MAX = 11;   // 倍率込みの天井=被弾(SHAKE_MAG 16)の約0.7倍。殴られた方が必ず大きく、見分けもつく
// 社長裁定2026-09-14(クリエイティブ監査15/16「すべて推薦で」): 処刑だけ天井を上げて「最大の一撃」を他と並べない。近接だけ最低振幅の床
// (序盤の刀12ダメ=2.3px が旧7の1/3に痩せるため)。どちらも被弾16の下。
export const IMPACT_FINISH_MAX = 14;
export const IMPACT_MELEE_MIN = 3;
export const IMPACT_RATE_REF_MS = 300;
export const IMPACT_MS_BASE = 60;
export const IMPACT_MS_PER_PX = 8;
export const IMPACT_MS_MIN = 90;   // 最短(v0.25.4285 クリエイティブ監査4: 3コマの白色ノイズは「チラつき」=存在しない揺れ)

export interface ImpactFlags {
  crit?: boolean;      // クリティカル/ヘッドショット
  kill?: boolean;      // 本人の直接キル
  explosion?: boolean; // 爆風で入った束
  counter?: boolean;   // カウンター成立(ダメージあり)
  finish?: boolean;    // 近接フィニッシュ(処刑・フル演出の回だけ)
  bash?: boolean;      // シールドバッシュ/スケボー着弾
}
export type ImpactFlagKey = keyof ImpactFlags;
export const IMPACT_FLAG_KEYS: readonly ImpactFlagKey[] = ['crit', 'kill', 'explosion', 'counter', 'finish', 'bash'];
// 振幅倍率 / 長さ倍率(性格: クリ=短く鋭く・爆発=長く低く)
export const IMPACT_MULT: Readonly<Record<ImpactFlagKey, { mag: number; ms: number }>> = {
  crit:      { mag: 1.6, ms: 0.8 },
  kill:      { mag: 1.3, ms: 1.0 },
  explosion: { mag: 1.3, ms: 1.6 },
  counter:   { mag: 1.5, ms: 1.0 },
  finish:    { mag: 2.0, ms: 1.2 },
  bash:      { mag: 1.5, ms: 1.1 },
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** レート正規化。intervalMs 未指定/0以下=単発扱い(1)。 */
export const impactRateMult = (intervalMs?: number): number =>
  intervalMs === undefined || !(intervalMs > 0) ? 1 : Math.min(1, intervalMs / IMPACT_RATE_REF_MS);

/** 1層目: 純粋なダメージ→振幅px(倍率前)。 */
export const impactBase = (damage: number): number =>
  clamp(IMPACT_K * Math.sqrt(Math.max(0, damage)), 0, IMPACT_BASE_MAX);

/** 揺れに使うダメージ: 実効(applied)を残HPで切り(過剰分は数えない)、クリ倍率を外す。 */
export const impactDamageOf = (applied: number, healthBefore: number, critMult = 1): number => {
  const cut = Math.max(0, Math.min(applied, Math.max(0, healthBefore)));
  return cut / (critMult > 0 ? critMult : 1);
};

export interface ImpactShake { mag: number; ms: number }
export const impactShakeFor = (damage: number, flags: ImpactFlags = {}, intervalMs?: number): ImpactShake => {
  const base = impactBase(damage) * impactRateMult(intervalMs);
  let m = 1, t = 1;
  for (const k of IMPACT_FLAG_KEYS) {
    if (flags[k]) { m *= IMPACT_MULT[k].mag; t *= IMPACT_MULT[k].ms; }
  }
  const mag = Math.min(flags.finish ? IMPACT_FINISH_MAX : IMPACT_HARD_MAX, base * m);
  const ms = Math.max(IMPACT_MS_MIN, Math.round((IMPACT_MS_BASE + IMPACT_MS_PER_PX * base) * t));
  return { mag, ms };
};

/** 1つの命中(登録単位)。source=発生源の鍵(同じ源の同フレームの束は1事象に合算)。away=射線の逆へ(銃)。 */
export interface ImpactEntry {
  source: string;
  damage: number;
  flags: ImpactFlags;
  x: number;
  y: number;
  intervalMs?: number;
  away?: boolean;
  /** 最低振幅(近接の床=IMPACT_MELEE_MIN)。レート正規化の後に効く。 */
  minMag?: number;
}
export interface ImpactEvent extends ImpactEntry { count: number }

/** 同じ source の束を1事象へ: ダメージは合計・フラグは和・位置は平均。 */
export const mergeImpactEntries = (entries: readonly ImpactEntry[]): ImpactEvent[] => {
  const byKey = new Map<string, ImpactEvent>();
  for (const e of entries) {
    const cur = byKey.get(e.source);
    if (!cur) {
      byKey.set(e.source, { ...e, flags: { ...e.flags }, count: 1 });
      continue;
    }
    cur.damage += e.damage;
    for (const k of IMPACT_FLAG_KEYS) if (e.flags[k]) cur.flags[k] = true;
    cur.x = (cur.x * cur.count + e.x) / (cur.count + 1);
    cur.y = (cur.y * cur.count + e.y) / (cur.count + 1);
    cur.count += 1;
    if (cur.intervalMs === undefined) cur.intervalMs = e.intervalMs;
    cur.away = cur.away || e.away;
    if (e.minMag !== undefined) cur.minMag = Math.max(cur.minMag ?? 0, e.minMag);
  }
  return [...byKey.values()];
};

export interface ResolvedImpact extends ImpactShake { x: number; y: number; away: boolean }
/** 複数事象が同フレームに重なった時は「強い方優先」(合算しない・今の triggerShake の規則と同じ)。 */
export const strongestImpact = (events: readonly ImpactEvent[]): ResolvedImpact | null => {
  let best: ResolvedImpact | null = null;
  for (const ev of events) {
    const raw = impactShakeFor(ev.damage, ev.flags, ev.intervalMs);
    const s = ev.minMag !== undefined && ev.damage > 0 ? { ...raw, mag: Math.max(raw.mag, ev.minMag) } : raw;
    if (s.mag <= 0) continue;
    if (!best || s.mag > best.mag) best = { ...s, x: ev.x, y: ev.y, away: ev.away === true };
  }
  return best;
};
