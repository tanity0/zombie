// 一時プローブ: 腕前段階(BOT_SKILL_PROFILES)が「**捌く速さ**」に効いているかを確かめる
// (社長の指摘v0.25.2357「それって上手いのではなく、さばけてないのでは?」の検証)。
//
// 背景: ランク査定の計測で master が最も降格し最終ランクも最低だった。設計チャットは当初
// 「intensAvg の逆進性(上手いほど不利)」と読んだが、社長から「master は上手いのではなく
// **捌けていない**だけでは」と指摘。実際 BOT_SKILL_PROFILES のダイヤルは
// retreatHpFrac / dodge / surroundCount と**生存側に偏っており、攻撃側のダイヤルが無い**。
// → 「腕前を上げると kill が減る」なら、master の高 intensAvg は**正しい判定**であり、
//    逆進性ではなく**ボットの腕前モデルの欠陥**ということになる。
//
// RANK_PROBE=1 の時だけ走る。判定はせずログを出すだけ。
import { describe, it, vi } from 'vitest';
import { useGameStore } from './gameStore';
import { createPlaytestRefs, runPlaytestTick } from '../utils/playtestDriver';
import type { BotSkill } from '../utils/botSkill';

declare const process: { env?: Record<string, string | undefined> } | undefined;

const DT = 1 / 60;
const MINUTES = 4;

const runOne = (skill: BotSkill): { kills: number; hpLost: number; hitFrames: number; dist: number } => {
  const realEpoch = Date.now();
  vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ['Date'] });
  vi.setSystemTime(realEpoch);
  let hpLost = 0, hitFrames = 0;
  try {
    useGameStore.getState().resetGame('assault');
    const refs = createPlaytestRefs();
    const ticks = MINUTES * 60 * 60;
    for (let i = 0; i < ticks; i++) {
      const before = useGameStore.getState();
      if (before.player.health <= 0) break;
      const hpBefore = before.player.health;
      vi.setSystemTime(realEpoch + before.gameTime + DT * 1000);
      runPlaytestTick(refs, {
        persona: 'standard', tickIndex: i, wanderSeed: 7, dt: DT, skill,
        objective: { kind: 'depth', dist: 9000 },
      });
      const after = useGameStore.getState();
      const d = Math.max(0, hpBefore - after.player.health);
      if (d > 0) { hpLost += d; hitFrames += 1; }
    }
  } finally { vi.useRealTimers(); }
  const s = useGameStore.getState();
  const p = s.player;
  return {
    kills: s.gameStats.enemiesKilled,
    hpLost, hitFrames,
    dist: Math.hypot(p.x + p.width / 2, p.y + p.height / 2),
  };
};

describe('rank probe', () => {
  it.runIf(typeof process !== 'undefined' && process?.env?.RANK_PROBE)(
    '腕前段階は「捌く速さ(kills)」に効いているか(社長の指摘の検証)',
    () => {
      const skills: BotSkill[] = ['novice', 'casual', 'skilled', 'master'];
      console.log('[probe] skill    kills  hpLost  被弾   到達px');
      for (const sk of skills) {
        const r = runOne(sk);
        console.log(`[probe] ${sk.padEnd(8)} ${String(r.kills).padStart(5)} ${r.hpLost.toFixed(0).padStart(7)} ${String(r.hitFrames).padStart(5)} ${r.dist.toFixed(0).padStart(8)}`);
      }
      console.log('[probe] ※killsが腕前と共に増えないなら「上手い」を捌く速さで表現できていない。');
    },
    600_000,
  );
});
