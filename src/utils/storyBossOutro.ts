// ステージ7(グレン撃破後)の終幕: ミラの会話を最後まで見せてから勝利(gameWon)へ進める判定。
// 旧実装は「撃破時刻 + 行数×(表示+行間) + 900ms」の決め打ちで、撃破の瞬間に通信欄へ前の会話が
// 残っていると、その分ミラの会話が後ろへずれて途中で勝利画面に切られていた。
// ここでは「積んだ行が全部表示され、最後の行が消えた」ことを通信の実状態から判定し、
// そこから旧と同じ余韻(最後の行が消えてから約1.4秒)の後に勝利とする。
// 会話が出ない/詰まった時に永久に勝てない、を作らないため、上限時刻(deadline)も持つ。

export interface OutroLine { name: string; text: string; portrait?: string; slow?: boolean }
export interface OutroCurrent { name: string; text: string; until: number }

export interface DialogueTiming {
  lineMs: number;      // NPC_DIALOGUE_MS
  gapMs: number;       // NPC_DIALOGUE_GAP_MS
  slowExtraMs: number; // NPC_DIALOGUE_SLOW_EXTRA_MS
}

/** 旧の決め打ち式の末尾の定数(行数×(表示+行間)に足していた分)。 */
export const STORY_BOSS_OUTRO_BASE_PAD_MS = 900;

/** 最後の行が消えてから勝利までの余韻。旧式 n×(表示+行間)+900 は、前の会話が無い時に
 *  最後の行が消えてから (行間+900) 後に勝利していた=その間合いをそのまま引き継ぐ。 */
export const storyBossOutroTailMs = (t: DialogueTiming): number => t.gapMs + STORY_BOSS_OUTRO_BASE_PAD_MS;

/** 積む時点で通信欄に残っている前の会話が、表示し終わるまでに掛かる最大の時間。 */
export const dialogueBacklogMs = (
  current: OutroCurrent | null,
  queue: readonly OutroLine[],
  nextAt: number,
  now: number,
  t: DialogueTiming,
): number => {
  let ms = 0;
  if (current) ms += Math.max(0, current.until - now) + t.gapMs;
  else if (queue.length > 0) ms += Math.max(0, nextAt - now);
  for (const l of queue) ms += t.lineMs + (l.slow ? t.slowExtraMs : 0) + t.gapMs;
  return ms;
};

export interface StoryBossOutro {
  /** 撃破で積んだ行(enqueue に渡した同じオブジェクト。キューの中では参照のまま残る)。 */
  lines: readonly OutroLine[];
  /** 最後の行が消えた(=積んだ行が全部出終わった)時刻。まだなら null。 */
  clearedAt: number | null;
  /** 保険の上限時刻。会話が詰まってもこの時刻で勝利する。 */
  deadline: number;
}

/** 撃破の瞬間に作る。deadline = 旧の予約時刻 + 前の会話の残りの最大分 + 1行ぶんのゆとり
 *  (行の切り替えはフレーム単位で少しずつ遅れるので、ゆとり無しだと正常な時も保険が先に効いて余韻が削れる)。 */
export const startStoryBossOutro = (
  lines: readonly OutroLine[],
  now: number,
  backlogMs: number,
  t: DialogueTiming,
): StoryBossOutro => ({
  lines,
  clearedAt: null,
  deadline: now + backlogMs + lines.length * (t.lineMs + t.gapMs) + STORY_BOSS_OUTRO_BASE_PAD_MS + t.lineMs,
});

export interface OutroTickInput {
  now: number;
  current: OutroCurrent | null;
  queue: readonly OutroLine[];
  /** 通信の時計が止まっているか(アテンション/カットイン中は通信が凍結する)。 */
  frozen: boolean;
  /** 前のフレームで凍結していたか(明けた瞬間、表示中の行は尺が張り直される)。 */
  wasFrozen: boolean;
  dtMs: number;
}

/** 毎フレーム呼ぶ。次の状態と、勝利してよいかを返す。 */
export const stepStoryBossOutro = (
  o: StoryBossOutro,
  inp: OutroTickInput,
  t: DialogueTiming,
): { outro: StoryBossOutro; win: boolean } => {
  let deadline = o.deadline;
  // 保険の上限も通信と同じく凍結中は進めない(凍結明けに表示中の行が1行ぶん張り直される分も足す)。
  if (inp.frozen) deadline += inp.dtMs;
  else if (inp.wasFrozen && inp.current) deadline += t.lineMs;
  let clearedAt = o.clearedAt;
  if (clearedAt === null && o.lines.length > 0) {
    const pending = inp.queue.some(l => o.lines.includes(l));
    const last = o.lines[o.lines.length - 1];
    const showingLast = !!inp.current && inp.current.name === last.name && inp.current.text === last.text;
    if (!pending && !showingLast) clearedAt = inp.now;
  } else if (clearedAt === null) {
    clearedAt = inp.now; // 0行(通常は無い)=即座に余韻へ
  }
  const win = (clearedAt !== null && inp.now >= clearedAt + storyBossOutroTailMs(t)) || inp.now >= deadline;
  return { outro: { lines: o.lines, clearedAt, deadline }, win };
};
