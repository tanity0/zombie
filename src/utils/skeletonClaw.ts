// ★スケルトンの武器=爪の引っ掻き(社長支給2026-09-18「skeletonの爪の斬撃、左向き、上から下に
// 引っ掻くイメージで配置。2枚目がVFX」)。
//
// ★何を決める葉か: **噛みつき台本(`enemyBite.ts` / PACING_PUZZLE.md §12)の尺の上に乗る絵だけ**。
// 判定・ダメージ・射程・尺は1msも触らない(CLAUDE.md「Visual vs hitbox」)。
//
// ★素材は**左向きで描かれている**(社長指定)。右向きの個体は左右反転して出す。
// 4コマの引っ掻き痕は**共通の外接箱で切り出してある**ので、コマ間でズレない(重ねると1本の軌跡になる)。
//
// ★色は**その技がカウンターできるかで決まる**(CLAUDE.md「色と形の文法」)。
// スケルトンは §16の技「噛みつき」(`skel-bite`)が `counterable: true` =**赤**、
// §12の既定の噛みつきが false =**紫**。バットのランタンと同じ作法で、台帳は `enemyBite.ts` の1箇所。
import type { Enemy } from '../types/game';
import { biteSpecFor } from './enemyBite';
import { frameByHold, holdTotalMs, holdLeadMs, frameWithWindupHold } from './fxFrameClock';

/**
 * この敵が爪を振るか。
 * ★**リッチも同じ爪**(社長指示2026-09-18「リッチはskeletonと同じ爪で」)。
 * リッチは骨の系統なので絵を共有する=型ごとに素材を増やさない。
 */
export const SKEL_CLAW_TYPES: readonly string[] = ['skeleton', 'lich'];
export const usesSkeletonClaw = (e: Pick<Enemy, 'type'>): boolean =>
  SKEL_CLAW_TYPES.includes(e.type);

/** 噛みつきの尺(型と技から引く)。描画側が手写ししないための薄い窓口。 */
export const skeletonBiteTiming = (e: Enemy): { windupMs: number; biteMs: number } => {
  const spec = biteSpecFor(e.type, e.chaffMove, e.aiPhase);
  return { windupMs: spec.windupMs, biteMs: spec.biteMs };
};

/** その敵が「いま出している攻撃」がカウンターできるか。 */
export const skeletonClawCounterable = (e: Enemy): boolean =>
  biteSpecFor(e.type, e.chaffMove, e.aiPhase).counterable;

// ---------------------------------------------------------------------------------------------
// 引っ掻き痕(4コマ)
// ---------------------------------------------------------------------------------------------
export const SKEL_CLAW_FRAMES = 4;
/** **当たる瞬間に出るコマ**=痕が出揃った最後のコマ。 */
export const SKEL_CLAW_IMPACT_FRAME = 3;
/**
 * 各コマの尺(ms)。前の3コマ=爪が走る(合計66ms=短く差し込む。**当たる前に判定の点で赤を長居させない**)/
 * 4コマ目=出揃った痕を残す(一番長い)。
 */
export const SKEL_CLAW_HOLD_MS: readonly number[] = [22, 22, 22, 150];
/** 痕が消えるまでのフェード(ms)。最後のコマの尺のうち、後ろからこの長さで薄くなる。 */
export const SKEL_CLAW_FADE_MS = 110;
/** 正規化の基準幅(素材の幅)。 */
export const SKEL_CLAW_REF_W = 282;
/**
 * 引っ掻き痕の見かけの横幅(px)。判定(接触36px)より大きく出す=②派手さの絵。
 * ★社長指示2026-09-18「もう少し両方大きく出してもいいかも」で 104→**150**
 * (CLAUDE.md「迷ったら派手側に倒す/足りないより出し過ぎの方が直しやすい」)。
 */
export const SKEL_CLAW_W_PX = 150;

export const skelClawFrame = (sinceImpactMs: number): number | null =>
  frameByHold(sinceImpactMs, SKEL_CLAW_HOLD_MS, SKEL_CLAW_IMPACT_FRAME);

/**
 * ★構え(§16-E)入りの送り。溜めのあいだ(`sinceWindupMs < windupMs`)は0コマ目(爪を構えた形)で
 * 静止し、溜め明けからは `skelClawFrame`(=`frameByHold`)と1ミリも変わらない送りに戻る。
 * VFX(`skelClawFxFrame`)はここを経由しない=構えには出さない(当たった瞬間の派手さの絵のため)。
 */
export const skelClawFrameWithWindup = (
  sinceWindupMs: number, windupMs: number, sinceImpactMs: number,
): number | null =>
  frameWithWindupHold(sinceWindupMs, windupMs, sinceImpactMs, skelClawFrame);

/** 痕の濃さ。出は即・引きは最後のコマの後ろ側で緩く抜く(パッと消さない=慣性)。 */
export const skelClawAlpha = (sinceImpactMs: number): number => {
  const tail = holdTotalMs(SKEL_CLAW_HOLD_MS) - holdLeadMs(SKEL_CLAW_HOLD_MS, SKEL_CLAW_IMPACT_FRAME);
  const left = tail - sinceImpactMs;                 // 消えるまでの残り
  if (left <= 0) return 0;
  if (left >= SKEL_CLAW_FADE_MS) return 1;
  const t = left / SKEL_CLAW_FADE_MS;
  return t * t;                                      // 引きはゆっくり抜ける
};

// ---------------------------------------------------------------------------------------------
// VFX(5コマ・当たった瞬間が一番大きい)
// ---------------------------------------------------------------------------------------------
export const SKEL_CLAW_FX_FRAMES = 5;
/** **先頭が当たる瞬間**(素材が「一番大きい炸裂→散る」の順で描かれている)。 */
export const SKEL_CLAW_FX_IMPACT_FRAME = 0;
/** 各コマの尺(ms)。散るほど遅くする(等間隔にしない)。 */
export const SKEL_CLAW_FX_HOLD_MS: readonly number[] = [70, 60, 70, 85, 105];
export const SKEL_CLAW_FX_REF_W = 273;
/**
 * VFXの見かけの横幅(px)。痕より大きく出す=②派手さの絵。
 * ★社長報告2026-09-18「爪は出てる。エフェクトが出てるかはわからない」を受けて 126→**168**。
 * 素材が**暗い赤の飛沫**で、夜の森の上では通常合成だと沈む。下の加算合成と合わせて見えるようにする。
 */
export const SKEL_CLAW_FX_W_PX = 210;   // 126→168(見えない対策)→**210**(社長「もう少し両方大きく」)

/**
 * ★VFXは**加算合成**で出す(社長報告2026-09-18「エフェクトが出てるかはわからない」の是正)。
 * 支給素材は**黒地のシート**=元から加算前提の絵で、通常合成で置くと暗部が背景を汚すだけで
 * 明るい芯も夜景に沈む。加算にすると芯が光り、黒地は何も足さない(=透明と同じ)。
 * 引っ掻き痕の方は**アルファ付きPNGの実体のある絵**なので通常合成のまま(加算にすると痕が白飛びする)。
 */
export const SKEL_CLAW_FX_ADDITIVE = true;

export const skelClawFxFrame = (sinceImpactMs: number): number | null =>
  frameByHold(sinceImpactMs, SKEL_CLAW_FX_HOLD_MS, SKEL_CLAW_FX_IMPACT_FRAME);

/** 絵が全部流れ切るまでの長さ(ms・ラッチの寿命に使う)。 */
export const skeletonClawTotalMs = (): number => Math.max(
  holdTotalMs(SKEL_CLAW_HOLD_MS) - holdLeadMs(SKEL_CLAW_HOLD_MS, SKEL_CLAW_IMPACT_FRAME),
  holdTotalMs(SKEL_CLAW_FX_HOLD_MS),
);

/** 引っ掻き痕のテクスチャ名(赤=返せる / 紫=返せない)。 */
export const skelClawTexName = (frame: number, counterable: boolean): string =>
  counterable ? `fx/skel-claw-${frame}` : `fx/skel-claw-p-${frame}`;
/** VFXのテクスチャ名(同上)。 */
export const skelClawFxTexName = (frame: number, counterable: boolean): string =>
  counterable ? `fx/skel-claw-fx-${frame}` : `fx/skel-claw-fx-p-${frame}`;
