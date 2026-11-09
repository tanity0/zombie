// ★爆発の取りこぼし止め(社長実機報告2026-11-09「銃の弾や爆発、一部格闘の技などで緑の卵が割れない。」)。
// プレイヤー側の爆発は全部 spawnExplosionFx(全爆発共通の絵)を出している。その呼び出しのすぐそばに
// playerBlast(卵も割る・浮かせる=§14)が無い爆発を足したら、ここで落ちる。敵側の爆発など割らない物は、同じ行に「// 卵:」で理由を書く。
// (爆発の判定は useGameLoop の中にありテストから直接回せないので、配線の有無を源で数える=decoySides.test.ts と同じ考え方。)
import { describe, it, expect } from 'vitest';
import loopSrc from '../hooks/useGameLoop.ts?raw';
import storeSrc from './gameStore.ts?raw';

const FILES: Record<string, string> = { 'src/hooks/useGameLoop.ts': loopSrc, 'src/store/gameStore.ts': storeSrc };
const NEAR = 3; // 前後この行数の中に breakEggsInBlast があること

describe('プレイヤー側の爆発は卵も割る(配線の取りこぼし止め)', () => {
  for (const [f, src] of Object.entries(FILES)) {
    it(f, () => {
      const lines = src.split('\n');
      const missing: string[] = [];
      let sites = 0;
      lines.forEach((ln, i) => {
        if (!ln.includes('spawnExplosionFx(') || /^\s*(\/\/|\*)/.test(ln) || /spawnExplosionFx: \(/.test(ln)) return;
        sites += 1;
        if (ln.includes('// 卵:')) return;
        const win = lines.slice(Math.max(0, i - NEAR), i + NEAR + 1).join('\n');
        // ★爆発の浮き(research/BRAWLER.md §14): プレイヤー側の爆発は合流点 playerBlast(卵を割る+浮かせる)を通す。
        // 格闘の技の爆発(気功)は格闘の当たりとして浮くので「// 浮き:」で理由を書き、卵だけ割る。
        const want = ln.includes('// 浮き:') ? 'breakEggsInBlast(' : 'playerBlast(';
        if (!win.includes(want)) missing.push(`${f}:${i + 1}: ${ln.trim().slice(0, 100)}`);
      });
      expect(sites).toBeGreaterThan(0);
      expect(missing).toEqual([]);
    });
  }
});
