// 会話の窓のタップで一言ずつ送る(社長指示2026-11-26「周回でもステージ7の会話は流して。タップで一言ずつ飛ばせればいい」)。
// 窓をタップすると今の一言を閉じ、次の行を行間を待たずにすぐ出す。最後の行なら閉じるだけ(行間はいつもどおり空ける)。
// 送れない行: 寄り(アテンション)の間=会話の時計が止まっている間(ステージ4のジュンの場面・ステージ7の変身の場面など、
// 場面の時刻表が行を出し入れしている)/ステージ7の変身の場面が立っている間/咆哮の行(変身の場面が預かって出し入れする)。
// 会話の終わりに紐づく発火(ステージ7の咆哮→変身・到着の会話の後のロック解除・撃破後の終幕など)は、
// どれも「表示中の行・キュー」を見ているだけなので、送っても同じ順で起きる(早まるだけ)。
import { GLEN_ROAR_LINE } from './glenIntro';

export interface NpcAdvanceCtx {
  /** 寄り(アテンション/カットイン)の間か。会話の時計が凍結している=送らない。 */
  attention: boolean;
  /** ステージ7のグレンの変身の場面が立っているか。 */
  glenTransform: boolean;
}

/** いま表示中の行を、窓のタップで送ってよいか。 */
export const canAdvanceNpcLine = (line: { text: string } | null | undefined, ctx: NpcAdvanceCtx): boolean =>
  !!line && !ctx.attention && !ctx.glenTransform && line.text !== GLEN_ROAR_LINE;

export interface NpcAdvanceTiming {
  lineMs: number;      // NPC_DIALOGUE_MS
  gapMs: number;       // NPC_DIALOGUE_GAP_MS
  slowExtraMs: number; // NPC_DIALOGUE_SLOW_EXTRA_MS
}

/**
 * 送った後の会話の状態。次の行があれば今すぐ出す(尺はいつもと同じ=自動で進む時と同じ式)。
 * 無ければ閉じて、次に積まれた行は行間の後に出る(updateNpcDialogue が行を閉じた時と同じ)。
 */
export const advanceNpcDialogueState = <Q extends { text: string; slow?: boolean }>(
  queue: readonly Q[],
  now: number,
  t: NpcAdvanceTiming,
): { npcDialogue: (Q & { until: number }) | null; npcDialogueQueue: Q[]; npcDialogueNextAt: number } => {
  if (queue.length === 0) return { npcDialogue: null, npcDialogueQueue: [], npcDialogueNextAt: now + t.gapMs };
  const head = queue[0];
  return {
    npcDialogue: { ...head, until: now + t.lineMs + (head.slow ? t.slowExtraMs : 0) },
    npcDialogueQueue: queue.slice(1),
    npcDialogueNextAt: now,
  };
};
