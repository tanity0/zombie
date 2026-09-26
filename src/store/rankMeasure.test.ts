// ランク査定の**実測データ収集**(社長指示v0.25.2356)。
//
// 目的: ランク査定をスコア制へ作り替えるにあたり、**式をゲームに実装する前に**、
// 実際のランのログの上で係数と閾値を掃引して決められるようにする。
// ここは「走らせて JSONL を吐く」だけで、**合否判定はしない**(分析は設計チャット)。
//
// 走らせ方(社長指示があった時だけ):
//   RANK_MEASURE=1 npx vitest run src/store/rankMeasure.test.ts
// 出力: TEST_HANDOFF/results/_rank-koma-raw.jsonl (1行1コマ)
//
// 掟:
// - **ゲームの挙動は1ミリも変えない。** 収集は komaLog(記録するだけで誰も読まない)経由。
// - 腕前は `?botskill=` と同じ4段階を回す。「上手い人を退屈させない」の検証には
//   **上手いボットと下手なボットの両方**が要る(片方だけでは閾値が決められない)。
import { describe, it, vi } from 'vitest';
import { useGameStore } from './gameStore';
import { createPlaytestRefs, runPlaytestTick } from '../utils/playtestDriver';
import { enableKomaLog, resetKomaLog, komaLogToJsonl, komaLogRunRef, getKomaLog } from '../utils/komaLog';
import type { BotSkill } from '../utils/botSkill';

// Minimal ambient declarations (playtest.test.ts と同じ流儀。@types/node に依存しない)
declare const process: { env?: Record<string, string | undefined> } | undefined;
declare const require: (m: string) => { writeFileSync: (p: string, d: string) => void; mkdirSync: (p: string, o?: unknown) => void };

const DT = 1 / 60;
const MINUTES = 12;                       // 1ランの長さ(深層まで潜れる長さ=逆進性を見るために必要)
const TICKS = Math.round(MINUTES * 60 * 60);
const RUNS_PER_SKILL = 3;
const SKILLS: BotSkill[] = ['novice', 'casual', 'skilled', 'master'];

// **深く潜らせる**(社長指示v0.25.2356の初回計測が全コマ被ダメ0だった対策)。
// 素の standard ボットは 4分で hpLost=8/被弾1回しか出ず、しかもその1回が relax/harvest コマ
// (=査定の集計対象外)に落ちるため統計にならなかった。深層はエリア倍率(攻撃力×2.1・速度×2.0)が
// 効くので、ここで初めて「被弾の分布」が観測できる。目的層(botObjective)の depth を使う。
const DIVE_DIST = 9000;

const runOne = (skill: BotSkill, runId: number, wanderSeed: number): void => {
  // playtest.test.ts と同じ理由でフェイクタイマー必須(実時間ゲート系=カウンターCD/無敵/ヒットストップが
  // 詰まったままになり、近接がほぼ機能しなくなるため)。
  const realEpoch = Date.now();
  vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ['Date'] });
  vi.setSystemTime(realEpoch);
  try {
    useGameStore.getState().resetGame('assault');
    const refs = createPlaytestRefs();
    komaLogRunRef.current = runId;
    for (let i = 0; i < TICKS; i++) {
      const before = useGameStore.getState();
      if (before.player.health <= 0 || before.gameWon) break; // 死亡/クリアで打ち切り
      vi.setSystemTime(realEpoch + before.gameTime + DT * 1000);
      // persona は standard 固定(腕前の差だけを見たいので、性格の型は動かさない)。
      runPlaytestTick(refs, {
        persona: 'standard', tickIndex: i, wanderSeed, dt: DT, skill,
        objective: { kind: 'depth', dist: DIVE_DIST },
      });
    }
  } finally {
    vi.useRealTimers();
  }
};

describe('ランク査定の実測データ収集(RANK_MEASURE=1 の時だけ走る)', () => {
  it.runIf(typeof process !== 'undefined' && process?.env?.RANK_MEASURE)(
    '4段階の腕前 × 複数ラン を回してコマ査定の生データを JSONL へ吐く',
    () => {
      enableKomaLog();
      resetKomaLog();
      let runId = 0;
      for (const skill of SKILLS) {
        for (let r = 0; r < RUNS_PER_SKILL; r++) {
          runId += 1;
          // run 番号と skill の対応は下の meta 行で残す(JSONL 側は run 番号だけ持つ)。
          runOne(skill, runId, 1000 + runId);
          console.log(`[rank-measure] run ${runId} (${skill}) done: ${getKomaLog().length} koma so far`);
        }
      }
      const meta = { runsPerSkill: RUNS_PER_SKILL, skills: SKILLS, minutes: MINUTES };
      const fs = require('fs');
      fs.mkdirSync('TEST_HANDOFF/results', { recursive: true });
      fs.writeFileSync(
        'TEST_HANDOFF/results/_rank-koma-raw.jsonl',
        `${JSON.stringify({ meta })}\n${komaLogToJsonl()}\n`,
      );
      console.log(`[rank-measure] wrote ${getKomaLog().length} koma records`);
    },
    600_000,
  );
});
