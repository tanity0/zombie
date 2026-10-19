// ステージ2の這う塊の配線(runLabCrawlerTick)のテスト: 取り込んだ個体を敵配列から外す/起きたフレームはアテンションだけで終わる。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { spawnEnemyAt } from './enemyUtils';
import { runLabCrawlerTick, crawlerSlamShakeMag } from './labCrawlerTick';
import { createLabCrawler, crawlerSlamCenter, crawlerCenter, CRAWLER_WINDUP_MS } from '../world/labCrawler';

// 壁・プロップの出ない所(帯の外の高さは使わない=x を原点の近く)で回す。
const IDOL = { x: 7000, y: 0 };
beforeEach(() => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(s => ({
    enemies: [], pumpkinBlasts: [], attention: null, gameTime: 10_000, stageTheme: 'lab', farBackdrop: 'lab',
    labCrawler: createLabCrawler(IDOL),
    player: { ...s.player, x: -14, y: -14, health: 100 },
  }));
});

describe('runLabCrawlerTick', () => {
  it('起きたフレームはアテンションを出すだけで、動かず・攻撃せず終わる', () => {
    const c0 = useGameStore.getState().labCrawler!;
    const cc = crawlerCenter(c0);
    // 目の前(視界の内・手の届く所)に立つ。
    const s = crawlerSlamCenter(c0);
    useGameStore.setState(st => ({ player: { ...st.player, x: s.x - 14, y: s.y - 14 } }));
    runLabCrawlerTick(10_016, 1 / 60);
    const st = useGameStore.getState();
    expect(st.labCrawler!.awake).toBe(true);
    expect(st.labCrawler!.state).toBe('move');
    expect(st.labCrawler!.x).toBe(c0.x);
    expect(st.attention).not.toBeNull();
    expect(st.attention!.x).toBeCloseTo(cc.x);
    expect(st.pumpkinBlasts.length).toBe(0);
  });

  it('叩きつけの円の中の雑魚を敵配列から外す(撃破ではない)。ボス級は残る', () => {
    const c0 = { ...createLabCrawler(IDOL), awake: true };
    const s = crawlerSlamCenter(c0);
    const mob = { ...spawnEnemyAt('zombie', s.x - 14, s.y - 14, 10_000), id: 'mob-1' };
    const boss = { ...spawnEnemyAt('pumpkin', s.x - 20, s.y - 20, 10_000), id: 'boss-1' };
    useGameStore.setState(st => ({
      enemies: [mob, boss],
      labCrawler: { ...c0, state: 'windup', stateAt: 10_000 - CRAWLER_WINDUP_MS, hitAt: 10_010, slamX: s.x, slamY: s.y },
      player: { ...st.player, x: -3000, y: -14 },
    }));
    const killsBefore = useGameStore.getState().gameStats.enemiesKilled;
    runLabCrawlerTick(10_016, 1 / 60);
    const st = useGameStore.getState();
    expect(st.enemies.map(e => e.id)).toEqual(['boss-1']);
    expect(st.labCrawler!.absorbed).toBe(1);
    expect(st.labCrawler!.absorbing.map(a => a.id)).toEqual(['mob-1']);
    expect(st.gameStats.enemiesKilled).toBe(killsBefore);
    // プレイヤーは遠い=爆風は積まない
    expect(st.pumpkinBlasts.length).toBe(0);
  });

  it('叩きつけの揺れは距離で弱まる', () => {
    expect(crawlerSlamShakeMag(0)).toBeGreaterThan(crawlerSlamShakeMag(300));
    expect(crawlerSlamShakeMag(2000)).toBe(0);
  });
});
