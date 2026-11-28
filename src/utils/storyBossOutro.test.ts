import { describe, expect, it } from 'vitest';
import {
  dialogueBacklogMs, startStoryBossOutro, stepStoryBossOutro, storyBossOutroTailMs,
  type OutroCurrent, type OutroLine, type StoryBossOutro,
} from './storyBossOutro';

const T = { lineMs: 2800, gapMs: 500, slowExtraMs: 1200 };
const TAIL = storyBossOutroTailMs(T);

// gameStore.updateNpcDialogue と同じ規則の通信欄(表示→期限切れ→行間→次の行)。
interface Comm { current: (OutroCurrent & { slow?: boolean }) | null; queue: OutroLine[]; nextAt: number }
const tickComm = (c: Comm, now: number): Comm => {
  let { current, queue, nextAt } = c;
  if (current && now >= current.until) { current = null; nextAt = now + T.gapMs; }
  if (!current && queue.length > 0 && now >= nextAt) {
    const head = queue[0];
    current = { ...head, until: now + T.lineMs + (head.slow ? T.slowExtraMs : 0) };
    queue = queue.slice(1);
  }
  return { current, queue, nextAt };
};

/** 撃破時刻0で lines を積み、勝利の時刻と最後の行が消えた時刻を返す。 */
const run = (lines: OutroLine[], before: Comm, opts: { freeze?: [number, number] } = {}) => {
  const backlog = dialogueBacklogMs(before.current, before.queue, before.nextAt, 0, T);
  let comm: Comm = { ...before, queue: [...before.queue, ...lines] };
  let outro: StoryBossOutro = startStoryBossOutro(lines, 0, backlog, T);
  let wasFrozen = false;
  let lastShownEnd: number | null = null;
  const last = lines[lines.length - 1];
  const dt = 16;
  for (let now = 0; now < 60000; now += dt) {
    const frozen = !!opts.freeze && now >= opts.freeze[0] && now < opts.freeze[1];
    const prevCur = comm.current;
    if (!frozen) {
      if (wasFrozen && comm.current) comm = { ...comm, current: { ...comm.current, until: now + T.lineMs } };
      comm = tickComm(comm, now);
    }
    if (prevCur && prevCur.text === last.text && prevCur.name === last.name && !comm.current) lastShownEnd = now;
    const r = stepStoryBossOutro(outro, { now, current: comm.current, queue: comm.queue, frozen, wasFrozen, dtMs: dt }, T);
    outro = r.outro; wasFrozen = frozen;
    if (r.win) return { winAt: now, lastShownEnd, queueLeft: comm.queue.length, showing: comm.current };
  }
  throw new Error('never won');
};

const L1 = (): OutroLine[] => [{ name: 'ミラ', text: 'ありがとう……ありがとう……' }];
const L3 = (): OutroLine[] => [
  { name: 'ミラ', text: 'ありがとう……ありがとう……' },
  { name: 'ミラ', text: 'グレンの薬を託すよ' },
  { name: 'グレン', text: '……' },
];
const empty = (): Comm => ({ current: null, queue: [], nextAt: 0 });
const busy = (): Comm => ({
  current: { name: '軍人', text: '前の会話', until: 2000 },
  queue: [{ name: '軍人', text: '前の会話2' }, { name: '軍人', text: '前の会話3', slow: true }],
  nextAt: 0,
});
const oldWinAt = (n: number) => n * (T.lineMs + T.gapMs) + 900;

describe('stage-7 終幕(ミラの会話→勝利)', () => {
  it('前の会話なし・1行: 最後の行が消えてから余韻の後に勝利(旧の予約時刻と同じ)', () => {
    const r = run(L1(), empty());
    expect(r.queueLeft).toBe(0);
    expect(r.showing).toBeNull();
    expect(r.lastShownEnd).not.toBeNull();
    expect(r.winAt - r.lastShownEnd!).toBeGreaterThanOrEqual(TAIL);
    expect(r.winAt - r.lastShownEnd!).toBeLessThan(TAIL + 40);
    expect(Math.abs(r.winAt - oldWinAt(1))).toBeLessThan(40);
  });

  it('前の会話なし・3行: 3行とも出終わってから勝利(旧の予約時刻と同じ)', () => {
    const r = run(L3(), empty());
    expect(r.queueLeft).toBe(0);
    expect(r.showing).toBeNull();
    expect(r.winAt - r.lastShownEnd!).toBeGreaterThanOrEqual(TAIL);
    expect(r.winAt - r.lastShownEnd!).toBeLessThan(TAIL + 40);
    expect(Math.abs(r.winAt - oldWinAt(3))).toBeLessThan(80); // 16ms刻みの切り替え遅れ分だけずれる
  });

  it('前の会話が残っている・1行/3行: ずれた分だけ待ち、会話が切れない', () => {
    for (const lines of [L1(), L3()]) {
      const r = run(lines, busy());
      expect(r.queueLeft).toBe(0);
      expect(r.showing).toBeNull();
      expect(r.winAt - r.lastShownEnd!).toBeGreaterThanOrEqual(TAIL);
      expect(r.winAt - r.lastShownEnd!).toBeLessThan(TAIL + 40);
      // 旧の決め打ちより後になる=旧なら途中で切れていた
      expect(r.winAt).toBeGreaterThan(oldWinAt(lines.length));
    }
  });

  it('途中でアテンション(通信の凍結)が挟まっても切れない', () => {
    const r = run(L3(), busy(), { freeze: [3000, 7000] });
    expect(r.queueLeft).toBe(0);
    expect(r.showing).toBeNull();
    expect(r.winAt - r.lastShownEnd!).toBeGreaterThanOrEqual(TAIL);
  });

  it('保険: 会話が詰まって消えなくても上限時刻で勝利する', () => {
    const lines = L3();
    let o = startStoryBossOutro(lines, 0, dialogueBacklogMs(null, [], 0, 0, T), T);
    const stuck = { name: 'ミラ', text: 'ありがとう……ありがとう……', until: Infinity };
    let winAt = -1;
    for (let now = 0; now < 60000; now += 16) {
      const r = stepStoryBossOutro(o, { now, current: stuck, queue: lines.slice(1), frozen: false, wasFrozen: false, dtMs: 16 }, T);
      o = r.outro;
      if (r.win) { winAt = now; break; }
    }
    expect(winAt).toBeGreaterThanOrEqual(oldWinAt(3) + T.lineMs);
    expect(winAt).toBeLessThan(oldWinAt(3) + T.lineMs + 40);
  });

  it('上限時刻=旧の予約時刻+前の会話の残りの最大分+1行ぶんのゆとり', () => {
    const b = busy();
    const backlog = dialogueBacklogMs(b.current, b.queue, b.nextAt, 0, T);
    expect(backlog).toBe(2000 + T.gapMs + 2 * (T.lineMs + T.gapMs) + T.slowExtraMs);
    expect(startStoryBossOutro(L1(), 100, backlog, T).deadline).toBe(100 + backlog + oldWinAt(1) + T.lineMs);
  });
});
