// ★ゾンビの噛みつきVFX(社長支給2026-09-18「ゾンビ用の噛みつきVFX / 左向きですこれは」)。
//
// ★何を決める葉か: **噛みつき台本(`enemyBite.ts` / PACING_PUZZLE.md §12)の尺の上に乗る絵だけ**。
// 判定・ダメージ・射程・尺は1msも触らない(CLAUDE.md「Visual vs hitbox」)。
//
// ★素材は**左向きで描かれている**(社長指定)。右向きの個体は左右反転して出す。
// 4コマは**共通の外接箱で切り出してある**ので、コマ間で中心がズレない。
//
// ★コマの読み(設計者の読み・違ったら1語で直せる):
//   1・2コマ目=**歯形の輪が閉じていく**(=噛みつく直前の予備) / 3コマ目=**噛んだ瞬間の飛沫**
//   4コマ目=**飛沫が広がり切った所**。⇒ **当たる瞬間は3コマ目**(0始まりで2)。
//   最後のコマは切り落とさず、広がった絵を残してから緩く抜く(パッと消さない=慣性)。
//
// ★色は**その技がカウンターできるかで決まる**(CLAUDE.md「色と形の文法」)。
// ゾンビは §16の技「2連噛み」(`zombie-double`)が `counterable: true` =**赤**、
// §12の既定の噛みつきが false =**紫**。バット/スケルトンと同じ作法で、台帳は `enemyBite.ts` の1箇所。
import type { Enemy } from '../types/game';
import { biteSpecFor } from './enemyBite';
import { frameByHold, holdTotalMs, holdLeadMs, frameWithWindupHold } from './fxFrameClock';

/**
 * この敵が噛みつきVFXを出すか。
 * ★**ラボゾンビも同じ噛みつき**(社長指示2026-09-18「ラボゾンビは今回の噛みつきで」)。
 * ★**`lab-zombie-3` だけ外す**(社長指示「3はジャンプなのでいらない。(パンプキンと同等)」)——
 * 巨体でパンプキン相当=技が**跳んで着地**なので、噛みつきの絵は付かない。
 */
export const ZOMBIE_BITE_TYPES: readonly string[] = ['zombie', 'lab-zombie-1', 'lab-zombie-2'];
export const usesZombieBiteFx = (e: Pick<Enemy, 'type'>): boolean =>
  ZOMBIE_BITE_TYPES.includes(e.type);

/** 噛みつきの尺(型と技から引く)。描画側が手写ししないための薄い窓口。 */
export const zombieBiteTiming = (e: Enemy): { windupMs: number; biteMs: number } => {
  const spec = biteSpecFor(e.type, e.chaffMove, e.aiPhase);
  return { windupMs: spec.windupMs, biteMs: spec.biteMs };
};

/** その敵が「いま出している攻撃」がカウンターできるか。 */
export const zombieBiteCounterable = (e: Enemy): boolean =>
  biteSpecFor(e.type, e.chaffMove, e.aiPhase).counterable;

export const ZOMBIE_BITE_FRAMES = 4;
/** **当たる瞬間に出るコマ**=飛沫の1枚目(0始まりで2)。前の2コマは歯形の輪が閉じる予備。 */
export const ZOMBIE_BITE_IMPACT_FRAME = 2;
/**
 * 各コマの尺(ms)。前2コマ=輪が閉じる(合計80ms=短く差し込む。**当たる前に判定の点で赤を長居させない**)/
 * 3コマ目=噛んだ瞬間 / 4コマ目=広がり切った絵を残す(一番長い)。等間隔にしない。
 */
export const ZOMBIE_BITE_HOLD_MS: readonly number[] = [40, 40, 90, 150];
/** 最後のコマを抜くフェード(ms)。 */
export const ZOMBIE_BITE_FADE_MS = 110;
/** 正規化の基準幅(素材の幅)。 */
export const ZOMBIE_BITE_REF_W = 246;
/** 見かけの横幅(px)。判定(接触35px)より大きく出す=②派手さの絵。 */
export const ZOMBIE_BITE_W_PX = 190;

export const zombieBiteFrame = (sinceImpactMs: number): number | null =>
  frameByHold(sinceImpactMs, ZOMBIE_BITE_HOLD_MS, ZOMBIE_BITE_IMPACT_FRAME);

/**
 * ★構え(§16-E)入りの送り。溜めのあいだ(`sinceWindupMs < windupMs`)は0コマ目(牙を構えた形)で
 * 静止し、溜め明けからは `zombieBiteFrame`(=`frameByHold`)と1ミリも変わらない送りに戻る。
 */
export const zombieBiteFrameWithWindup = (
  sinceWindupMs: number, windupMs: number, sinceImpactMs: number,
): number | null =>
  frameWithWindupHold(sinceWindupMs, windupMs, sinceImpactMs, zombieBiteFrame);

/** 濃さ。出は即・引きは最後のコマの後ろ側で緩く抜く(パッと消さない=慣性)。 */
export const zombieBiteAlpha = (sinceImpactMs: number): number => {
  const tail = holdTotalMs(ZOMBIE_BITE_HOLD_MS) - holdLeadMs(ZOMBIE_BITE_HOLD_MS, ZOMBIE_BITE_IMPACT_FRAME);
  const left = tail - sinceImpactMs;
  if (left <= 0) return 0;
  if (left >= ZOMBIE_BITE_FADE_MS) return 1;
  const t = left / ZOMBIE_BITE_FADE_MS;
  return t * t;
};

/** 絵が流れ切るまでの長さ(ms・ラッチの寿命に使う)。 */
export const zombieBiteTotalMs = (): number =>
  holdTotalMs(ZOMBIE_BITE_HOLD_MS) - holdLeadMs(ZOMBIE_BITE_HOLD_MS, ZOMBIE_BITE_IMPACT_FRAME);

/** テクスチャ名(赤=返せる / 紫=返せない)。 */
export const zombieBiteTexName = (frame: number, counterable: boolean): string =>
  counterable ? `fx/zombie-bite-${frame}` : `fx/zombie-bite-p-${frame}`;
