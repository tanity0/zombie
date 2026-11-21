// ★プレイヤー側の爆発の取りこぼし止め(卵: 社長実機報告2026-11-09「銃の弾や爆発、一部格闘の技などで緑の卵が割れない。」
//  /浮き: research/BRAWLER.md §14 社長「浮き入れよう。落ちてくるのを爆発のは少しゆっくりに」)。
// 爆発は合流点 playerBlast(卵を割る+当たった敵を浮かせる)を通す。卵を割らない爆発(緑の卵の爆発=周りの卵は連鎖させる)は queueBlastLift(浮きだけ)。
// 爆発を見分ける印は3つ: 全爆発共通の絵 spawnExplosionFx / 爆発のダメージ damageEnemy(…, blast=true) / 爆発の音 'bomb'。
//  - spawnExplosionFx の行: 前後 FX_NEAR 行に playerBlast( が要る(卵も割る)。
//  - damageEnemy(…, true …) と 'bomb' の行: 前後 HIT_NEAR 行に playerBlast( か queueBlastLift( が要る(ダメージの処理は爆発の絵から離れて書かれるので広め)。
// 割らない/浮かせない物(敵の爆発・持続の当たり・拾い物の音・格闘の側で浮かせる気功など)は、同じ行に「// 卵:」か「// 浮き:」で理由を書く。
// (爆発の判定は useGameLoop の中にありテストから直接回せないので、配線の有無を源で数える=decoySides.test.ts と同じ考え方。)
import { describe, it, expect } from 'vitest';
import loopSrc from '../hooks/useGameLoop.ts?raw';
import storeSrc from './gameStore.ts?raw';

const FILES: Record<string, string> = { 'src/hooks/useGameLoop.ts': loopSrc, 'src/store/gameStore.ts': storeSrc };
const FX_NEAR = 3;
const HIT_NEAR = 50;
const BLAST_DAMAGE = /damageEnemy\([^,()]+,[^,()]+(\([^)]*\))?[^,()]*,\s*true\b/;
const BOMB_SFX = /playSfx\('bomb'|brawlerSfx\('bomb'/;

describe('プレイヤー側の爆発は卵を割り、当たった敵を浮かせる(配線の取りこぼし止め)', () => {
  for (const [f, src] of Object.entries(FILES)) {
    it(f, () => {
      const lines = src.split('\n');
      const missing: string[] = [];
      let fx = 0, hits = 0;
      const win = (i: number, n: number) => lines.slice(Math.max(0, i - n), i + n + 1).join('\n');
      lines.forEach((ln, i) => {
        if (/^\s*(\/\/|\*)/.test(ln)) return;
        const marked = ln.includes('// 卵:') || ln.includes('// 浮き:');
        if (ln.includes('spawnExplosionFx(') && !/spawnExplosionFx: \(/.test(ln)) {
          fx += 1;
          if (!marked && !win(i, FX_NEAR).includes('playerBlast(')) missing.push(`${f}:${i + 1}: [絵] ${ln.trim().slice(0, 90)}`);
        } else if (BLAST_DAMAGE.test(ln) || BOMB_SFX.test(ln)) {
          hits += 1;
          const w = win(i, HIT_NEAR);
          if (!marked && !w.includes('playerBlast(') && !w.includes('queueBlastLift(')) missing.push(`${f}:${i + 1}: [当たり/音] ${ln.trim().slice(0, 90)}`);
        }
      });
      expect(fx).toBeGreaterThan(0);
      expect(hits).toBeGreaterThan(0);
      expect(missing).toEqual([]);
    });
  }
});
