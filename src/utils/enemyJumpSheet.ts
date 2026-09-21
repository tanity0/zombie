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

/** 1枚のシートを3区間へ割る。合計がコマ数と一致すること。 */
export interface JumpSplit {
  /** しゃがみ(溜め)に使うコマ数。先頭から。 */
  crouch: number;
  /** 滞空(踏み切り〜頂点〜落下)に使うコマ数。 */
  air: number;
  /** 着地(接地〜砂埃〜立ち直り)に使うコマ数。末尾まで。 */
  land: number;
}

export const jumpSplitFrames = (s: JumpSplit): number => s.crouch + s.air + s.land;

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
): number | null => {
  const n = jumpSplitFrames(split);
  if (n <= 1) return null;
  const pick = (base: number, count: number, p: number): number | null => {
    if (count <= 0) return null;
    const i = Math.floor(Math.max(0, Math.min(0.999999, p)) * count);
    return base + Math.min(count - 1, Math.max(0, i));
  };
  if (phase === 'crouch') return pick(0, split.crouch, prog);
  if (phase === 'air') return pick(split.crouch, split.air, prog);
  if (prog >= 1) return null;                       // 着地の絵が終わった=歩き/立ち絵へ返す
  return pick(split.crouch + split.air, split.land, prog);
};

/**
 * ★盾で弾かれて空中から落ちる間に出すコマ(=滞空の最後のコマ)。
 * 着地の絵を先に出すと「まだ落ちている最中に砂埃が上がる」嘘になるので、落ち切るまでは落下の姿で持たせる。
 */
export const enemyJumpFallFrame = (split: JumpSplit): number =>
  Math.max(0, split.crouch + split.air - 1);
