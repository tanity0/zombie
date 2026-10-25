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
import { frameByHold, holdTotalMs, holdLeadMs } from './fxFrameClock';

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
export const ZOMBIE_BITE_W_PX = 142; // 190→142(社長「CとAの折衷案」2026-10-06: 判定をこの絵の芯に揃えるため4分の3へ・utils/biteFxHit)

export const zombieBiteFrame = (sinceImpactMs: number): number | null =>
  frameByHold(sinceImpactMs, ZOMBIE_BITE_HOLD_MS, ZOMBIE_BITE_IMPACT_FRAME);

/**
 * ★構え(§16-E)入りの送り。溜めのあいだ(`sinceWindupMs < windupMs`)は0コマ目(牙を構えた形)で静止し、
 * 噛み(`biteMs`)の後ろ半分で1コマ目、**当たる瞬間からは `zombieBiteFrame`(=`frameByHold`)と1ミリも変わらない**。
 * 溜めの頭から流し切るまで絵は1度も途切れない。
 */
export const zombieBiteFrameWithWindup = (
  sinceWindupMs: number, windupMs: number, sinceImpactMs: number, biteMs = 0,
): number | null => {
  if (sinceWindupMs < 0) return null;
  // 当たった後(飛沫)は従来の送り(`zombieBiteFrame`=frameByHold)と1ミリも変えない。
  if (sinceImpactMs >= 0) return zombieBiteFrame(sinceImpactMs);
  // ★噛み(溜め明け〜当たる瞬間=赤い線が根元から消えていく区間)の後ろ半分は1コマ目(輪が閉じかけ)。
  //   社長指摘2026-10-25「噛みつきの予告と噛みつきの絵が噛み合ってない」: 旧は溜め明けから当たる80ms前まで
  //   **絵が一度消え**、線が消えていく間も輪は開いたまま、最後の80msで急に閉じていた。
  //   いまは「線が消えていく=輪が締まっていく(zombieBiteClose)→ 消え切った瞬間に飛沫」で一続きにする。
  const closeMs = Math.max(biteMs * ZOMBIE_BITE_CLOSE_FRAME_FRAC, ZOMBIE_BITE_HOLD_MS[1]);
  if (sinceWindupMs >= windupMs && sinceImpactMs >= -closeMs) return 1;
  return 0; // 構え(§16-E)=0コマ目
};

/**
 * 噛み(biteMs)のうち、1コマ目(輪が閉じかけ)を出す後ろの割合。素材の輪は1コマ目の方が径が約0.72倍と小さいので、
 * 切り替えは噛みの最後に寄せて「閉じる瞬間のスナップ」として使う(クリエイティブ監査2026-10-25 #2: 真ん中で切り替えると
 * 締めの途中でガクッと縮み、あとはだらだらに見えた)。
 */
export const ZOMBIE_BITE_CLOSE_FRAME_FRAC = 0.22;
/** 溜めの終わりまでに輪が締まる大きさ(監査 #1・2巡目 #4: 溜めの中盤から締まりが見える深さ)。 */
export const ZOMBIE_BITE_WINDUP_SCALE = 0.87;
/** 溜めの締まりの曲線の指数(1=等速・2=後ろ寄り)。中盤から見えるよう緩い ease-in。 */
const ZOMBIE_BITE_WINDUP_POW = 1.4;
/**
 * 噛みの終わり(=当たる瞬間の直前)に輪が締まり切る大きさ。**素材の顎は上下の歯列=縦に閉じる絵**なので、
 * 向きに関係なく縦(顎の隙間)を強く、横を弱く締める(クリエイティブ監査2巡目 #3: 噛む向きで配ると横向きの噛みが「すぼむ」)。
 */
export const ZOMBIE_BITE_CLOSE_SCALE_Y = 0.72;
export const ZOMBIE_BITE_CLOSE_SCALE_X = 0.9;
/** 2連の2発目は一番深く締める(監査2巡目 #5: 山場の2発目を絵でも一番強く)。 */
export const ZOMBIE_BITE2_CLOSE_SCALE_Y = 0.68;
/** 溜めの間の濃さ(監査 #5: 一番濃いのは当たる瞬間に取っておく)。噛みの間に1へ上がる。 */
export const ZOMBIE_BITE_WINDUP_ALPHA = 0.65;
export const ZOMBIE_BITE2_WINDUP_ALPHA = 0.88;
/** 2連の2発目の輪の大きさ(当たる前のコマだけ。飛沫のコマ=判定は元の大きさ)。 */
export const ZOMBIE_BITE2_RING_MUL = 1.1;

/**
 * ★輪の締まり(社長指摘2026-10-25「噛みつきの予告と噛みつきの絵が噛み合ってない」)。
 * 時計は**予告の線と同じ窓**(溜めの頭=線が出た瞬間 → 当たる瞬間=線が消え切る瞬間)。
 * 溜めの間はじわじわ 1→0.87、噛み(=線が根元から消えていく区間)は加速しながら縦0.72 / 横0.9 まで締まり、濃さも上がる
 * (顎は閉じ切る直前が一番速い・utils/biteJawMotion と同じ考え)。
 * **当たる瞬間(`sinceImpactMs >= 0`)は大きさも濃さも1**=飛沫のコマは元の大きさ=判定の四角(utils/biteFxHit)は変わらない。
 */
export const zombieBiteClose = (
  sinceWindupMs: number, windupMs: number, sinceImpactMs: number, biteMs: number, second = false,
): { sx: number; sy: number; alpha: number } => {
  if (sinceImpactMs >= 0 || sinceWindupMs < 0) return { sx: 1, sy: 1, alpha: 1 };
  const ring = second ? ZOMBIE_BITE2_RING_MUL : 1;
  const a0 = second ? ZOMBIE_BITE2_WINDUP_ALPHA : ZOMBIE_BITE_WINDUP_ALPHA;
  if (biteMs <= 0 || sinceImpactMs < -biteMs) {
    const u = Math.max(0, Math.min(1, sinceWindupMs / Math.max(1, windupMs)));
    const k = (1 - (1 - ZOMBIE_BITE_WINDUP_SCALE) * u ** ZOMBIE_BITE_WINDUP_POW) * ring;
    return { sx: k, sy: k, alpha: a0 };
  }
  const p = (sinceImpactMs + biteMs) / biteMs; // 0→1
  const pp = p * p;
  const W = ZOMBIE_BITE_WINDUP_SCALE;
  const cy = second ? ZOMBIE_BITE2_CLOSE_SCALE_Y : ZOMBIE_BITE_CLOSE_SCALE_Y;
  return {
    sx: (W + (ZOMBIE_BITE_CLOSE_SCALE_X - W) * pp) * ring,
    sy: (W + (cy - W) * pp) * ring,
    alpha: a0 + (1 - a0) * pp,
  };
};

/** 体の点滅に合わせた輪の脈(監査2巡目 #4: 輪をゾンビの体の拍につなぐ)。`sinceEdgeMs`=点滅が点いた瞬間からの経過。 */
export const ZOMBIE_BITE_PULSE_RISE_MS = 35;
export const ZOMBIE_BITE_PULSE_FALL_MS = 140;
export const zombieBitePulse = (sinceEdgeMs: number | null): { scale: number; alpha: number } => {
  if (sinceEdgeMs === null || sinceEdgeMs < 0 || sinceEdgeMs >= ZOMBIE_BITE_PULSE_RISE_MS + ZOMBIE_BITE_PULSE_FALL_MS) return { scale: 0, alpha: 0 };
  const k = sinceEdgeMs < ZOMBIE_BITE_PULSE_RISE_MS
    ? 1 - (1 - sinceEdgeMs / ZOMBIE_BITE_PULSE_RISE_MS) ** 2 // カチッと速く立ち上がり
    : (1 - (sinceEdgeMs - ZOMBIE_BITE_PULSE_RISE_MS) / ZOMBIE_BITE_PULSE_FALL_MS) ** 2; // ease-out で戻る
  return { scale: 0.065 * k, alpha: 0.15 * k };
};

/**
 * ★噛みつきの絵の出だし(社長指示2026-10-25「噛みつき始めの絵が、浮いて止まってる様に見えるので、
 * フェードインか小さくから大きくか、何かしらイン効果入れて」)。
 * 溜めの頭で**小さく・薄く、ゾンビ側に寄った所**から出て、勢いよく膨らんで行き過ぎ、元の大きさ・元の位置に収まる(慣性MUST)。
 * 尺は溜めに比例(監査 #4)。2連の2発目は1発目の余韻から食い込むので、大きめ・短く入る(監査 #8)。
 * 当たる瞬間のコマ(=判定の四角・utils/biteFxHit)より十分前に終わる=判定の絵の大きさ・位置は変えない。
 */
export const ZOMBIE_BITE_IN_FRAC = 0.28;
export const ZOMBIE_BITE_IN_MIN_MS = 110;
export const ZOMBIE_BITE_IN_MAX_MS = 280;
/** 出だしの大きさ(元の大きさに対する割合)。 */
export const ZOMBIE_BITE_IN_SCALE0 = 0.35;
/** 2連の2発目の出だし。 */
export const ZOMBIE_BITE_IN2_SCALE0 = 0.8;
export const ZOMBIE_BITE_IN2_MS = 95;
/** 膨らみの行き過ぎ量(back-out の強さ)。見かけで +10% 前後が出る強さ(監査 #3)。 */
const ZOMBIE_BITE_IN_BACK = 2.6;
/** 出だしで輪をゾンビ側へ寄せておく距離(px・監査 #6: 輪の出どころ=線の根元側から来る)。 */
export const ZOMBIE_BITE_IN_ORIGIN_PX = 28;

/** 出だしの尺(ms)。 */
export const zombieBiteInMs = (windupMs: number, second = false): number =>
  second ? Math.min(ZOMBIE_BITE_IN2_MS, windupMs * 0.8)
    : Math.min(windupMs * 0.8, Math.max(ZOMBIE_BITE_IN_MIN_MS, Math.min(ZOMBIE_BITE_IN_MAX_MS, windupMs * ZOMBIE_BITE_IN_FRAC)));

/**
 * 出だしの大きさの倍率・濃さ・ゾンビ側への寄せ(px)。`sinceWindupMs` は噛みの発火(=溜めの頭)からの経過。
 * 溜めが短い技でも溜めの中で終える。
 */
export const zombieBiteIn = (
  sinceWindupMs: number, windupMs: number, second = false,
): { scale: number; alpha: number; backPx: number } => {
  const dur = Math.max(1, zombieBiteInMs(windupMs, second));
  const t = Math.max(0, Math.min(1, sinceWindupMs / dur));
  if (t >= 1) return { scale: 1, alpha: 1, backPx: 0 };
  const u = t - 1;
  const back = 1 + (ZOMBIE_BITE_IN_BACK + 1) * u * u * u + ZOMBIE_BITE_IN_BACK * u * u; // easeOutBack: 0→1(行き過ぎて戻る)
  const fade = 1 - (1 - Math.min(1, t * 1.6)) ** 2; // 大きさより先に濃くなる
  const s0 = second ? ZOMBIE_BITE_IN2_SCALE0 : ZOMBIE_BITE_IN_SCALE0;
  const travel = 1 - (1 - t) ** 3; // 寄せは easeOut で今の位置へ
  return {
    scale: s0 + (1 - s0) * back,
    alpha: second ? Math.max(0.7, fade) : fade,
    backPx: second ? 0 : ZOMBIE_BITE_IN_ORIGIN_PX * (1 - travel),
  };
};

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
