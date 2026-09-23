// ★跳ぶ技の絵(しゃがむ→跳ぶ→着地)の**コマの割り当て**(社長支給2026-09-21
// 「パンプキン(蜘蛛)のジャンプ攻撃時」)。PixiJS非依存の純関数。
//
// ★**尺は自分で持たない**。しゃがみ・滞空・着地の時計は**判定側(store)が既に持っている**
// (`PUMPKIN_CROUCH_MS` / `AIR_MOVES` の滞空時間 / `pumpkinRecoverMs`)ので、
// **その進み具合(0..1)を受け取ってコマ番号へ写すだけ**にする。
// こうしないと「絵は着地しているのに判定はまだ空中」が起きる(赤い予告の掟③と同じ考え方)。
//
// ★**位相は線形**。絵の側に既に加減速が描かれている(実測: しゃがみの高さが 104→94→86→86 と
// 沈み切る所で詰まる / 着地は 103→92→**86**→90→101→108 と、潰れてから戻る)。
// ここへ ease を重ねると二重になる。

import { sectionFrame, sectionLastFrame, sectionsTotal, type SectionCounts } from './sheetSections';

/** 1枚のシートを3区間へ割る。合計がコマ数と一致すること。 */
export interface JumpSplit {
  /** しゃがみ(溜め)に使うコマ数。先頭から。 */
  crouch: number;
  /** 滞空(踏み切り〜頂点〜落下)に使うコマ数。 */
  air: number;
  /** 着地(接地〜砂埃〜立ち直り)に使うコマ数。末尾まで。 */
  land: number;
}

const counts = (s: JumpSplit): SectionCounts => [s.crouch, s.air, s.land];

export const jumpSplitFrames = (s: JumpSplit): number => sectionsTotal(counts(s));

export type JumpPhase = 'crouch' | 'air' | 'land';

/**
 * コマ番号を返す。`null` = このシートを出さない(立ち絵/歩きへ戻す)。
 *
 * @param split   区間の割り当て
 * @param phase   今どの区間か(store の `aiPhase` から呼び出し側が写す)
 * @param prog    その区間の進み具合 0..1。**着地だけは 1 を超えたら `null`**(=立ち直り終わり)
 */
export const enemyJumpFrame = (
  split: JumpSplit, phase: JumpPhase, prog: number,
): number | null =>
  // ★★選び方の本体は `sheetSections.sectionFrame` の1本(v0.25.4574)。薙ぎ払いと**同じ核**を使う
  //   ——「境目でコマが飛ばない/全コマを1度は通る」の不変条件を2箇所に持たないため。
  sectionFrame(counts(split), phase === 'crouch' ? 0 : phase === 'air' ? 1 : 2, prog);

/**
 * ★盾で弾かれて空中から落ちる間に出すコマ(=滞空の最後のコマ)。
 * 着地の絵を先に出すと「まだ落ちている最中に砂埃が上がる」嘘になるので、落ち切るまでは落下の姿で持たせる。
 */
export const enemyJumpFallFrame = (split: JumpSplit): number =>
  sectionLastFrame(counts(split), 1);

/**
 * ★着地の**最後のコマ**(社長報告2026-09-23「パンプキン、ジャンプの後コマが変になってる
 * (小ジャンプしてるみたいなのが最後に混ざってる)」)。
 *
 * なぜ要るか: 着地の絵の長さ(`ENEMY_JUMP_LAND_MS`)は**硬直の長さとは別物**。
 * 蜘蛛は着地420msに対して**硬直が2000ms(実効1667ms)**あるので、
 * 着地の絵が終わった時点で**残り約1.25秒ぶん、立ち絵へ戻って**いた。
 * 実測: 着地の最終コマの絵の高さ **80.5px** → 立ち絵 **87.8px** =**+7.3px(+9%)跳ね上がる**。
 * 足元が固定なので**body が急に伸びる**=「小ジャンプ」に見える。
 *
 * ⇒ 着地の絵が尽きたら**最後のコマで持たせる**(硬直中はその姿勢のまま)。
 * 技の絵が技の長さを最後まで持つ=「技が終わっていないのに立ち絵へ戻る」を無くす。
 */
export const enemyJumpLandLastFrame = (split: JumpSplit): number =>
  sectionLastFrame(counts(split), 2);

/**
 * ★着地の絵を流す長さ(v0.25.4608・走査で判明)。**相より長くしない。**
 *
 * `ENEMY_JUMP_LAND_MS` は「着地の絵そのものの尺」だが、**立ち直りの相は台本で伸び縮みする**。
 * 城ボス1は絵が700msなのに、台本が次の技へ続く時の立ち直りは**実効250ms**しかない
 * ⇒ 着地5コマのうち**2コマで打ち切られ**、一番潰れる瞬間も立ち直りの姿も出ないまま次の構えへ飛んでいた。
 * 相の方が短い時は**詰めて全部出し切る**(相より長い時は従来どおり=余りは最後のコマで持たせる)。
 */
export const jumpLandDrawMs = (artMs: number, phaseMs: number): number =>
  Math.max(1, phaseMs > 0 ? Math.min(artMs, phaseMs) : artMs);
