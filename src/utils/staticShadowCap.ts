// 止まっている物(?proj=1 の置き物)の環境光の影の枚数に上限を設ける(描画だけ・純関数・PixiJS を読まない)。
// research/PERSPECTIVE_PROJECTION.md 段階1 監査の未決「PC の引き0.7で環境光の影が影の枠を使い切る」の裁定:
//   上限 = SHADOW_TOTAL_MESH_MAX − 動く影(爆発など)のために必ず空ける枚数。超える時は主人公に近い物から。
//   選ばれた/外れた物の入れ替わりは alpha を ease で 0↔目標へ(パッと出ない・消えない=慣性の掟)。フェード中の物も枚数に数える。
import { SHADOW_TOTAL_MESH_MAX } from './shadowSlots';

/** 動く影(爆発の影など)のために必ず空けておく枚数。 */
export const STATIC_SHADOW_RESERVED_FOR_MOVING = 20;
/** 止まっている物の環境光の影の上限(枚)。 */
export const STATIC_SHADOW_CAP = SHADOW_TOTAL_MESH_MAX - STATIC_SHADOW_RESERVED_FOR_MOVING;
/** 入れ替わりのフェードの長さ(ms)。 */
export const STATIC_SHADOW_FADE_MS = 250;

export interface StaticShadowCand { id: string; d2: number }

/**
 * 1フレーム進める。state[id] = フェードの進み k(0..1)。out[id] = このフレームの alpha の倍率(smoothstep(k)・0 なら描かない)。
 * - 候補に居ない id は捨てる(描かれない=枠を使わない)。
 * - 近い順の上位 cap が「選ばれた物」。選ばれていて k>0 の物は 1 へ、外れて k>0 の物は 0 へ進む(どちらも枠を使う)。
 * - 選ばれていて k=0 の物は、枠が空いている分だけ(近い順に)フェードインを始める=描く枚数(k>0)は常に cap 以下。
 */
export const stepStaticShadowCap = (
  cands: readonly StaticShadowCand[], state: Map<string, number>, out: Map<string, number>,
  cap: number, dtMs: number, fadeMs: number = STATIC_SHADOW_FADE_MS,
): void => {
  out.clear();
  const present = new Set<string>();
  for (const c of cands) present.add(c.id);
  for (const id of [...state.keys()]) if (!present.has(id)) state.delete(id);
  const sorted = [...cands].sort((a, b) => a.d2 - b.d2 || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const chosen = new Set<string>();
  for (let i = 0; i < sorted.length && i < cap; i++) chosen.add(sorted[i].id);
  let shown = 0;
  for (const k of state.values()) if (k > 0) shown++;
  let budget = Math.max(0, cap - shown);
  const step = fadeMs > 0 ? Math.max(0, dtMs) / fadeMs : 1;
  for (const c of sorted) {
    let k = state.get(c.id) ?? 0;
    if (chosen.has(c.id)) {
      if (k <= 0) {
        if (budget <= 0) continue; // 枠が空くまで待つ(外れた物のフェードアウトが終わると空く)
        budget--;
        k = Math.min(1, Math.max(step, 1e-6));
      } else {
        k = Math.min(1, k + step);
      }
    } else {
      if (k <= 0) { state.delete(c.id); continue; }
      k = Math.max(0, k - step);
    }
    if (k > 0) {
      state.set(c.id, k);
      out.set(c.id, k * k * (3 - 2 * k));
    } else {
      state.delete(c.id);
    }
  }
};

/** これより薄い止まっている物の影は描かず、上限の候補にも入れない(叩き台・?proj=1 のみ)。 */
export const STATIC_SHADOW_MIN_ALPHA = 0.08;

/**
 * 薄い影を消す倍率: 不透明度 a がしきい値の 0.5倍以下で 0、1倍以上で 1、その間は smoothstep=しきい値の前後でパッと消えない/出ない。
 * 0 を返した影は描かず、上限の候補にも入れない。
 */
export const staticShadowLowAlphaMult = (a: number, threshold: number = STATIC_SHADOW_MIN_ALPHA): number => {
  if (!(threshold > 0)) return 1;
  const lo = threshold * 0.5;
  if (a <= lo) return 0;
  if (a >= threshold) return 1;
  const u = (a - lo) / (threshold - lo);
  return u * u * (3 - 2 * u);
};
