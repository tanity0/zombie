// 一時プローブ: ヘッドレスで「プレイヤーが実際に被弾しているか」と「その被弾がコマ集計へ
// 届いているか」を分けて観測する(社長指示v0.25.2356の計測が全コマ dmg=0 だった件の切り分け)。
// RANK_PROBE=1 の時だけ走る。判定はせずログを出すだけ。
import { describe, it, vi } from 'vitest';
import { useGameStore } from './gameStore';
import { createPlaytestRefs, runPlaytestTick } from '../utils/playtestDriver';
import { enableKomaLog, resetKomaLog, getKomaLog, komaLogRunRef } from '../utils/komaLog';

declare const process: { env?: Record<string, string | undefined> } | undefined;

const DT = 1 / 60;

describe('rank probe', () => {
  it.runIf(typeof process !== 'undefined' && process?.env?.RANK_PROBE)(
    'standard×4分: store側のHP減少と、コマ集計のdmgTaken/hits を突き合わせる',
    () => {
      enableKomaLog(); resetKomaLog(); komaLogRunRef.current = 1;
      const realEpoch = Date.now();
      vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ['Date'] });
      vi.setSystemTime(realEpoch);
      let storeHpLost = 0;      // store のHPが実際に減った合計(真値)
      let storeHitFrames = 0;   // 減ったフレーム数(=被弾回数の真値)
      let minHp = Infinity;
      try {
        useGameStore.getState().resetGame('assault');
        const refs = createPlaytestRefs();
        const ticks = 4 * 60 * 60;
        for (let i = 0; i < ticks; i++) {
          const before = useGameStore.getState();
          if (before.player.health <= 0) break;
          const hpBefore = before.player.health;
          vi.setSystemTime(realEpoch + before.gameTime + DT * 1000);
          runPlaytestTick(refs, { persona: 'standard', tickIndex: i, wanderSeed: 7, dt: DT });
          const after = useGameStore.getState();
          const d = Math.max(0, hpBefore - after.player.health);
          if (d > 0) { storeHpLost += d; storeHitFrames += 1; }
          minHp = Math.min(minHp, after.player.health);
        }
      } finally { vi.useRealTimers(); }
      const log = getKomaLog();
      const komaDmg = log.reduce((a, r) => a + r.input.dmgRatio * r.maxHealth, 0);
      const komaHits = log.reduce((a, r) => a + (r.input.hits ?? 0), 0);
      console.log(`[probe] store: hpLost=${storeHpLost.toFixed(1)} hitFrames=${storeHitFrames} minHp=${minHp}`);
      console.log(`[probe] koma : komaCount=${log.length} dmgSum=${komaDmg.toFixed(1)} hitsSum=${komaHits}`);
      console.log('[probe] ※store側>0 なのに koma側=0 なら、集計への配線が切れている。');
    },
    300_000,
  );
});
