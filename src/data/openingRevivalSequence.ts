export type OpeningRevivalSpeaker = 'graham' | 'phil' | 'nora';

export type OpeningRevivalLine = {
  /** Internal only. Do not display this value in the subtitle UI. */
  speaker: OpeningRevivalSpeaker;
  text: string;
  minDurationMs: number;
  gapAfterMs: number;
};

// v0.25.2165(社長決定・リライト): 11行→9行に短縮。ラスト2行は「これが安定すれば…救える/多くの人を」
// =タイトル『the ONE』と掛けた "This will save / the MANY"(社長意図)。分割と間はこの掛けのために
// 意図的なので、統合・言い換えをしないこと。
export const OPENING_REVIVAL_LINES: readonly OpeningRevivalLine[] = [
  {
    speaker: 'nora',
    text: '循環、戻ったよ。神経反応も出てる',
    minDurationMs: 1900,
    gapAfterMs: 220,
  },
  {
    speaker: 'graham',
    text: '細胞増殖値はどうだ？',
    minDurationMs: 1400,
    gapAfterMs: 180,
  },
  {
    speaker: 'nora',
    text: '基準内。きれいに収束してる',
    minDurationMs: 1900,
    gapAfterMs: 220,
  },
  {
    speaker: 'phil',
    text: '人格反応は？',
    minDurationMs: 1100,
    gapAfterMs: 180,
  },
  {
    speaker: 'nora',
    text: 'あるよ。自己意識も保たれてる',
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
    text: 'まだだ。抑制剤を追加して経過を見る',
    minDurationMs: 2100,
    gapAfterMs: 220,
  },
  {
    speaker: 'phil',
    text: 'これが安定すれば…救える',
    minDurationMs: 1800,
    gapAfterMs: 450, // 「救える」→「多くの人を」の一拍(the MANYの掛けを立てる間)
  },
  {
    speaker: 'phil',
    text: '多くの人を',
    minDurationMs: 1600,
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
