export type OpeningRevivalSpeaker = 'graham' | 'phil' | 'nora';

export type OpeningRevivalLine = {
  /** Internal only. Do not display this value in the subtitle UI. */
  speaker: OpeningRevivalSpeaker;
  text: string;
  minDurationMs: number;
  gapAfterMs: number;
};

export const OPENING_REVIVAL_LINES: readonly OpeningRevivalLine[] = [
  {
    speaker: 'nora',
    text: '循環、戻った。神経反応も出てる',
    minDurationMs: 1900,
    gapAfterMs: 220,
  },
  {
    speaker: 'graham',
    text: '増殖値は',
    minDurationMs: 1100,
    gapAfterMs: 180,
  },
  {
    speaker: 'nora',
    text: '基準内。今のところ、きれいに収束してる',
    minDurationMs: 2200,
    gapAfterMs: 220,
  },
  {
    speaker: 'phil',
    text: '記憶は？',
    minDurationMs: 1000,
    gapAfterMs: 180,
  },
  {
    speaker: 'nora',
    text: '反応あるよ。ちゃんと残ってる',
    minDurationMs: 1900,
    gapAfterMs: 220,
  },
  {
    speaker: 'phil',
    text: '……よかった',
    minDurationMs: 1400,
    gapAfterMs: 300,
  },
  {
    speaker: 'graham',
    text: 'まだ安心するな。\n抑制剤を追加して経過を見る',
    minDurationMs: 2300,
    gapAfterMs: 220,
  },
  {
    speaker: 'nora',
    text: 'はいはい。今入れます',
    minDurationMs: 1500,
    gapAfterMs: 220,
  },
  {
    speaker: 'phil',
    text: 'これが安定すれば……',
    minDurationMs: 1600,
    gapAfterMs: 250,
  },
  {
    speaker: 'graham',
    text: '実用段階へ進める',
    minDurationMs: 1500,
    gapAfterMs: 220,
  },
  {
    speaker: 'phil',
    text: 'もっと救える',
    minDurationMs: 1500,
    gapAfterMs: 650,
  },
] as const;

export const OPENING_REVIVAL_TIMING = {
  fadeToBlackMs: 450,
  blackHoldBeforeDialogueMs: 300,
  fadeToTutorialMs: 350,
} as const;

/**
 * Implementation contract:
 * - Render only `line.text`. Never render `line.speaker`.
 * - Cancel every timer/audio/subtitle on skip or scene destroy.
 * - Call the existing tutorial transition exactly once.
 * - Do not introduce a separate save flag unless the existing OP flow requires it.
 */
