// ステージ2の這う塊の配線(runLabCrawlerTick)のテスト: 取り込んだ個体を敵配列から外す/起きたフレームはアテンションだけで終わる。
// 第2版(research/LAB_CRAWLER.md §4): 代理の Enemy(攻撃の窓口)・HP・資料を拾った後の回り込み・壁を壊す・入ればクリアの円。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGameStore, ATTENTION_IN_MS, labEscapeGoalX } from '../store/gameStore';
import { spawnEnemyAt, countsTowardEnemyCap, isBossType } from './enemyUtils';
import { runLabCrawlerTick, breakLabObstaclesInSweep, crawlerSlamShakeMag, crawlerChaseSpeedFor, LAB_CRAWLER_BLAST_OWNER, LAB_ESCAPE_BANNER, labDebrisKind, DEATH_BEAT_STOP_MS } from './labCrawlerTick';
import {
  createLabCrawler, crawlerSlamCenter, crawlerCenter, crawlerRect, CRAWLER_WINDUP_MS, CRAWLER_HP, CRAWLER_HIT_W, CRAWLER_HIT_H,
  CRAWLER_CHASE_SPEED_MULT, type LabCrawler,
} from '../world/labCrawler';
import { CRAWLER_PROXY_ID, CRAWLER_PROXY_HP_PAD } from './labCrawlerProxy';
import { isCrawlerAbsorbable } from './crawlerAbsorb';
import { labWallsInRegion, labWallsInRegionRaw, wallRect, isLabObstacleBroken, labDebrisInRegion, labPropsInRegion, labPropsInRegionRaw } from '../world/labWalls';
import { rectsOverlap } from '../world/obstacles';

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
    expect(st.enemies.filter(e => e.id !== CRAWLER_PROXY_ID).map(e => e.id)).toEqual(['boss-1']); // 代理(攻撃の窓口)は別
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

const proxyOf = () => useGameStore.getState().enemies.find(e => e.id === CRAWLER_PROXY_ID);
const awakeAt = (x: number, extra: Partial<LabCrawler> = {}): LabCrawler => ({ ...createLabCrawler(IDOL), awake: true, x, nextAttackAt: 1e9, ...extra });

describe('runLabCrawlerTick 第2版: 代理の Enemy(当たり判定を通常の敵と同じに)', () => {
  it('起きている間だけ、塊の箱と同じ位置・大きさの代理が敵配列に1体居る(待機中は居ない)', () => {
    runLabCrawlerTick(10_016, 1 / 60); // 待機中(プレイヤーは原点=順路20%未満・視界の外)
    expect(useGameStore.getState().labCrawler!.awake).toBe(false);
    expect(proxyOf()).toBeUndefined();
    useGameStore.setState({ labCrawler: awakeAt(-2000) });
    runLabCrawlerTick(10_032, 1 / 60);
    const c = useGameStore.getState().labCrawler!;
    const px = proxyOf()!;
    expect(px).toBeDefined();
    const r = crawlerRect(c);
    expect({ x: px.x, y: px.y, w: px.width, h: px.height }).toEqual({ x: r.x, y: r.y, w: CRAWLER_HIT_W, h: CRAWLER_HIT_H });
    expect(px.health).toBe(CRAWLER_PROXY_HP_PAD + CRAWLER_HP);
    expect(useGameStore.getState().enemies.filter(e => e.id === CRAWLER_PROXY_ID).length).toBe(1);
  });

  it('代理はボス級の区分(ノックバック・気絶・取り込みの対象外)・敵の数に入らない・接触ダメージ0・経験値0・動かない', () => {
    useGameStore.setState({ labCrawler: awakeAt(-2000) });
    runLabCrawlerTick(10_016, 1 / 60);
    const px = proxyOf()!;
    expect(isBossType(px.type)).toBe(true);
    expect(countsTowardEnemyCap(px)).toBe(false);
    expect(isCrawlerAbsorbable(px)).toBe(false);
    expect(px.damage).toBe(0);
    expect(px.experienceValue).toBe(0);
    expect(px.fixed).toBe(true);
    // 敵の更新(移動AI)を回しても動かない
    const before = { x: px.x, y: px.y };
    useGameStore.getState().updateEnemies(0.1);
    const after = proxyOf()!;
    expect({ x: after.x, y: after.y }).toEqual(before);
  });

  it('代理に入ったダメージ(銃の経路 damageEnemy)が塊の体力から引かれ、代理は撃破されない(撃破数も増えない)', () => {
    useGameStore.setState({ labCrawler: awakeAt(-2000) });
    runLabCrawlerTick(10_016, 1 / 60);
    const kills = useGameStore.getState().gameStats.enemiesKilled;
    const killed = useGameStore.getState().damageEnemy(CRAWLER_PROXY_ID, 1234, false, false, false, 'gun');
    expect(killed).toBe(false);
    runLabCrawlerTick(10_032, 1 / 60);
    expect(useGameStore.getState().labCrawler!.hp).toBe(CRAWLER_HP - 1234);
    expect(proxyOf()!.health).toBe(CRAWLER_PROXY_HP_PAD + CRAWLER_HP - 1234); // 書き直された=次のフレームの減りだけを数える
    runLabCrawlerTick(10_048, 1 / 60);
    expect(useGameStore.getState().labCrawler!.hp).toBe(CRAWLER_HP - 1234); // 二重に引かない
    expect(useGameStore.getState().gameStats.enemiesKilled).toBe(kills);
  });

  it('HP0で昇天(崩れて昇る)へ。代理は外れる。昇天し終えると塊は消える', () => {
    useGameStore.setState({ labCrawler: awakeAt(-2000, { hp: 100 }) });
    runLabCrawlerTick(10_016, 1 / 60);
    useGameStore.getState().damageEnemy(CRAWLER_PROXY_ID, 500, false, false, false, 'gun');
    runLabCrawlerTick(10_032, 1 / 60);
    const c = useGameStore.getState().labCrawler!;
    expect(c.hp).toBe(0);
    expect(c.state).toBe('ascend');
    expect(proxyOf()).toBeUndefined();
    // 倒した瞬間の一拍(社長指示2026-10-20): 時間が止まり、面した縁へ寄る。
    const st = useGameStore.getState();
    expect(st.hitstopUntil - Date.now()).toBeGreaterThan(DEATH_BEAT_STOP_MS - 100);
    expect(st.hitstopUntil - Date.now()).toBeLessThanOrEqual(DEATH_BEAT_STOP_MS);
    expect(st.zoomHasTarget).toBe(true);
    for (let t = 10_048; t < 14_000; t += 16) runLabCrawlerTick(t, 1 / 60);
    expect(useGameStore.getState().labCrawler).toBeNull();
    expect(proxyOf()).toBeUndefined();
  });

  it('叩きつけの爆風の持ち主=代理(カウンターの反撃が塊に入る)。名札は代理の id と同じ文字列', () => {
    expect(LAB_CRAWLER_BLAST_OWNER).toBe(CRAWLER_PROXY_ID);
    const c0 = awakeAt(0);
    const s = crawlerSlamCenter(c0);
    useGameStore.setState(st => ({
      labCrawler: { ...c0, state: 'windup', stateAt: 10_000 - CRAWLER_WINDUP_MS, hitAt: 10_010, slamX: s.x, slamY: s.y },
      player: { ...st.player, x: s.x - 14, y: s.y - 14 },
    }));
    runLabCrawlerTick(10_016, 1 / 60);
    const b = useGameStore.getState().pumpkinBlasts.find(x => x.moveKey === 'crawler-slam')!;
    expect(b.enemyId).toBe(CRAWLER_PROXY_ID);
  });
});

describe('runLabCrawlerTick 第2版: 資料を拾った瞬間、前から出てくる', () => {
  it('拾うと(beginLabEscape)スタート地点に帰還サークルが出て、次のフレームで塊がプレイヤーの前方(画面の外)へ回り込みアテンション', () => {
    useGameStore.setState(st => ({
      labEscapeRun: true, labEscapeAt: 0, returnCircle: null,
      labCrawler: createLabCrawler(IDOL), // 待機中のまま(後ろ=アイドル側に居る)
      player: { ...st.player, x: -7000 - 14, y: -14 }, // 資料(左)の所
      camera: { x: -7000 - st.gameBounds.width / 2, y: -st.gameBounds.height / 2 }, viewZoom: 1,
    }));
    useGameStore.getState().beginLabEscape();
    const st0 = useGameStore.getState();
    expect(st0.labEscapeAt).toBeGreaterThan(0);
    // 逃走経路にレベル1の雑魚が1画面1体で並ぶ(社長指示2026-10-20)。休眠・回収されない印つき・原点の手前まで。
    const route = st0.enemies.filter(e => e.escapeRoute && !e.labBait);
    // 塊の叩き潰しの登場の生け贄(LAB_CRAWLER §11): レベル2が3体・視界0の休眠・資料とゴールの間。
    const baits = st0.enemies.filter(e => e.labBait);
    expect(baits).toHaveLength(3);
    for (const b of baits) {
      expect(b.type).toBe('lab-zombie-2');
      expect(b.dormant).toBe(true);
      expect(b.aggroRange).toBe(0);
      expect(b.x + b.width / 2).toBeGreaterThan(-7000);
      expect(b.x + b.width / 2).toBeLessThan(0);
    }
    expect(route.length).toBeGreaterThan(5);
    for (const e of route) {
      expect(e.type).toBe('lab-zombie-1');
      expect(e.dormant).toBe(true);
      const cx = e.x + e.width / 2;
      expect(cx).toBeLessThan(0);
      expect(cx).toBeGreaterThan(-7000);
    }
    expect(isCrawlerAbsorbable(route[0])).toBe(true); // 塊には食べられる(足止め役)
    // 逃走中もプロップは取り除かない(社長2026-10-20「やはり無しで。簡単になりすぎた」=壊れていない物はそのまま立っている)。
    expect(labPropsInRegion(-4000, -300, -2000, 300).length).toBe(labPropsInRegionRaw(-4000, -300, -2000, 300).filter(q => !isLabObstacleBroken(q.id)).length);
    expect(st0.returnCircle).toMatchObject({ x: labEscapeGoalX(useGameStore.getState().labIdolSide, -7000), y: 0 });
    expect(Math.abs(st0.returnCircle!.x)).toBeGreaterThan(58 + 95); // 武器商人(原点)の会話の円と重ならない
    expect(st0.labEscapeBannerPending).toBe(true); // 帯はアテンションが戻ってから
    expect(st0.eventBannerText).not.toBe(LAB_ESCAPE_BANNER);
    runLabCrawlerTick(10_016, 1 / 60);
    const st = useGameStore.getState();
    const c = st.labCrawler!;
    expect(c.chasing).toBe(true);
    expect(c.awake).toBe(true);
    const r = crawlerRect(c);
    expect(r.x + r.width).toBeLessThan(st.camera.x); // 画面の左端の外(資料の奥)
    expect(r.x + r.width).toBeGreaterThan(st.camera.x - 200); // すぐ外
    expect(st.attention).not.toBeNull();
    expect(st.attention!.x).toBeCloseTo(crawlerCenter(c).x);
    expect(proxyOf()).toBeDefined();
    expect(st.labEscapeBannerPending).toBe(true);
    // アテンションが戻ったら「入り口まで走れ」
    useGameStore.setState({ attention: null });
    runLabCrawlerTick(10_032, 1 / 60);
    expect(useGameStore.getState().labEscapeBannerPending).toBe(false);
    expect(useGameStore.getState().eventBannerText).toBe(LAB_ESCAPE_BANNER);
  });

  it('塊が既に倒れている時は、拾った瞬間に帯を出す(回り込みが無い)', () => {
    useGameStore.setState({ labEscapeRun: true, labEscapeAt: 0, returnCircle: null, labCrawler: null });
    useGameStore.getState().beginLabEscape();
    expect(useGameStore.getState().labEscapeBannerPending).toBe(false);
    expect(useGameStore.getState().eventBannerText).toBe(LAB_ESCAPE_BANNER);
  });

  it('ゴールは武器商人の手前(資料の側・重ならない)。手を離すと帰還の確認=とどまっても通り抜けてもクリアにならない(社長2026-10-20)', () => {
    useGameStore.setState(st => ({ labEscapeRun: true, labEscapeAt: 0, returnCircle: null, gameWon: false, labIdolSide: 1, storyReturnPromptVisible: false, isPaused: false, player: { ...st.player, x: -3000, y: -14 } }));
    useGameStore.getState().beginLabEscape();
    const rc = useGameStore.getState().returnCircle!;
    expect(rc.x).toBeLessThan(0); // 資料(アイドルの反対=左)の側
    expect(Math.hypot(rc.x - 0, rc.y - (-60))).toBeGreaterThan(rc.radius + 58); // 商人の会話の円と重ならない
    useGameStore.setState(st => ({ player: { ...st.player, x: rc.x - 14, y: -14 } }));
    for (let i = 0; i < 6; i++) useGameStore.getState().updateReturnPhase(1);
    expect(useGameStore.getState().gameWon).toBe(false); // とどまってもクリアしない
    expect(useGameStore.getState().requestStoryReturnPrompt()).toBe(true); // 手を離す=帰還の確認
    useGameStore.getState().answerStoryReturnPrompt(true);
    expect(useGameStore.getState().gameWon).toBe(true);
  });

  it('円の外で手を離しても確認は出ない', () => {
    useGameStore.setState(st => ({ labEscapeRun: true, labEscapeAt: 0, returnCircle: null, gameWon: false, labIdolSide: 1, storyReturnPromptVisible: false, isPaused: false, player: { ...st.player, x: -3000, y: -14 } }));
    useGameStore.getState().beginLabEscape();
    expect(useGameStore.getState().requestStoryReturnPrompt()).toBe(false);
  });

  it('塊を置いていない出撃では beginLabEscape は何もしない(従来の流れ)', () => {
    useGameStore.setState({ labEscapeRun: false, labEscapeAt: 0, returnCircle: null });
    useGameStore.getState().beginLabEscape();
    expect(useGameStore.getState().labEscapeAt).toBe(0);
    expect(useGameStore.getState().returnCircle).toBeNull();
  });

  it('追跡の速さ=歩きの速さ×ゲームのテンポ×1.1', () => {
    expect(crawlerChaseSpeedFor(100, 1.2)).toBeCloseTo(100 * 1.2 * CRAWLER_CHASE_SPEED_MULT);
    expect(crawlerChaseSpeedFor(-5, 1.2)).toBe(0);
  });
});

describe('runLabCrawlerTick 第2版: 壁を壊して進む', () => {
  it('起きた塊の箱に重なった壁は壊れ(store に記録)、判定と描画の問い合わせから消える。プレイヤーも通れる', () => {
    const walls = labWallsInRegionRaw(3000, -200, 6000, 200);
    const w = walls[0];
    expect(w).toBeDefined();
    const c0 = awakeAt(w.footX, { y: CRAWLER_HIT_H / 2 });
    expect(rectsOverlap(crawlerRect(c0), wallRect(w))).toBe(true);
    useGameStore.setState(st => ({ labCrawler: c0, player: { ...st.player, x: -3000, y: -14 } }));
    runLabCrawlerTick(10_016, 1 / 60);
    const broken = useGameStore.getState().labBrokenObstacles;
    expect(broken.some(b => b.id === w.id && b.kind === 'wall')).toBe(true);
    expect(isLabObstacleBroken(w.id)).toBe(true);
    expect(labWallsInRegion(3000, -200, 6000, 200).some(x => x.id === w.id)).toBe(false);
    // 素の配置(決定論の置き場所)には残る
    expect(labWallsInRegionRaw(3000, -200, 6000, 200).some(x => x.id === w.id)).toBe(true);
    // 新しいランで元に戻る
    useGameStore.getState().resetGame('warrior');
    expect(useGameStore.getState().labBrokenObstacles).toEqual([]);
    expect(isLabObstacleBroken(w.id)).toBe(false);
  });

  it('待機中の塊は壊さない(開幕に出現位置の壁を壊さない)', () => {
    const walls = labWallsInRegionRaw(3000, -200, 6000, 200);
    const w = walls[0];
    // プレイヤーは原点(順路20%未満・視界の外)=起きない
    useGameStore.setState(st => ({ labCrawler: { ...createLabCrawler(IDOL), x: w.footX }, player: { ...st.player, x: -14, y: -14 } }));
    runLabCrawlerTick(10_016, 1 / 60);
    expect(useGameStore.getState().labCrawler!.awake).toBe(false);
    expect(useGameStore.getState().labBrokenObstacles).toEqual([]);
  });
});

describe('壊れた物の破片の種類(クリエイティブ監査#8)', () => {
  it('壁=石、プロップは種類ごと(端末・ガラス・カプセル・薬液・鉄)', () => {
    expect(labDebrisKind({ kind: 'wall' })).toBe('stone');
    expect(labDebrisKind({ kind: 'prop', variant: 0 })).toBe('terminal');
    expect(labDebrisKind({ kind: 'prop', variant: 3 })).toBe('glass');
    expect(labDebrisKind({ kind: 'prop', variant: 5 })).toBe('liquid');
    expect(labDebrisKind({ kind: 'prop', variant: 11 })).toBe('capsule');
    expect(labDebrisKind({ kind: 'prop', variant: 9 })).toBe('metal');
  });
});

describe('塊の音(社長支給 2026-10-19「攻撃してくる直前の音 登場時も鳴らす」)', () => {
  const spy = () => {
    const calls: { key: string; gain: number }[] = [];
    return { calls, fn: (key: string, gain: number) => { calls.push({ key, gain }); }, count: (k: string) => calls.filter(c => c.key === k).length };
  };

  it('溜めが始まった瞬間に crawler-windup が1回だけ鳴る(続くフレームでは鳴らない)', () => {
    const c0 = { ...createLabCrawler(IDOL), awake: true, nextAttackAt: 0 };
    const sc = crawlerSlamCenter(c0);
    useGameStore.setState(st => ({ labCrawler: c0, player: { ...st.player, x: sc.x - 14, y: sc.y - 14 },
      camera: { x: sc.x - st.gameBounds.width / 2, y: sc.y - st.gameBounds.height / 2 } }));
    const sp = spy();
    runLabCrawlerTick(10_016, 1 / 60, sp.fn);
    expect(useGameStore.getState().labCrawler!.state).toBe('windup');
    expect(sp.count('crawler-windup')).toBe(1);
    expect(sp.calls.find(c => c.key === 'crawler-windup')!.gain).toBeGreaterThan(0);
    runLabCrawlerTick(10_032, 1 / 60, sp.fn);
    runLabCrawlerTick(10_048, 1 / 60, sp.fn);
    expect(sp.count('crawler-windup')).toBe(1);
  });

  it('起きた時(起床のアテンション)に crawler-appear が1回鳴る(唸りも残す)', () => {
    const c0 = useGameStore.getState().labCrawler!;
    const sc = crawlerSlamCenter(c0);
    useGameStore.setState(st => ({ player: { ...st.player, x: sc.x - 14, y: sc.y - 14 } }));
    const sp = spy();
    runLabCrawlerTick(10_016, 1 / 60, sp.fn);
    expect(useGameStore.getState().labCrawler!.awake).toBe(true);
    expect(sp.count('crawler-appear')).toBe(1);
    expect(sp.count('zombie-growl')).toBe(1);
    expect(sp.calls.find(c => c.key === 'crawler-appear')!.gain).toBe(1); // 距離で弱めない
    runLabCrawlerTick(10_032, 1 / 60, sp.fn);
    expect(sp.count('crawler-appear')).toBe(1);
  });

  it('資料を拾った後の回り込みで、カメラが着く時刻に crawler-appear が1回鳴る(boss-appear も残す)', () => {
    vi.useFakeTimers();
    try {
      useGameStore.setState(st => ({
        labEscapeRun: true, labEscapeAt: 0, returnCircle: null, labCrawler: createLabCrawler(IDOL),
        player: { ...st.player, x: -7000 - 14, y: -14 },
        camera: { x: -7000 - st.gameBounds.width / 2, y: -st.gameBounds.height / 2 }, viewZoom: 1,
      }));
      useGameStore.getState().beginLabEscape();
      const sp = spy();
      runLabCrawlerTick(10_016, 1 / 60, sp.fn);
      expect(useGameStore.getState().labCrawler!.chasing).toBe(true);
      expect(sp.count('crawler-appear')).toBe(0); // 寄り始めはまだ
      vi.advanceTimersByTime(ATTENTION_IN_MS + 5);
      expect(sp.count('crawler-appear')).toBe(1);
      expect(sp.calls.find(c => c.key === 'crawler-appear')!.gain).toBe(1);
      vi.advanceTimersByTime(5000);
      expect(sp.count('crawler-appear')).toBe(1);
      expect(sp.count('boss-appear')).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('壊した壁・プロップの残骸(2巡目#16 社長「推薦で」)', () => {
  it('記録は塊が遠くへ行っても出撃の間ずっと残り、範囲に入る物だけ描画の対象になる。新しい出撃で全部消える', () => {
    const walls = labWallsInRegionRaw(3000, -200, 6000, 200);
    const w = walls[0];
    const c0 = awakeAt(w.footX, { y: CRAWLER_HIT_H / 2 });
    useGameStore.setState(st => ({ labCrawler: c0, player: { ...st.player, x: -3000, y: -14 } }));
    runLabCrawlerTick(10_016, 1 / 60);
    expect(useGameStore.getState().labBrokenObstacles.some(b => b.id === w.id)).toBe(true);
    // 塊が遠くへ去り、何フレームも経っても記録は残る(画面の外へ出ても残骸は消さない)
    useGameStore.setState(st => ({ labCrawler: { ...st.labCrawler!, x: -20_000 } }));
    for (let i = 0; i < 5; i++) runLabCrawlerTick(10_032 + i * 16, 1 / 60);
    const broken = useGameStore.getState().labBrokenObstacles;
    expect(broken.some(b => b.id === w.id)).toBe(true);
    // 描画の対象: 足元が範囲に入る物だけ・種類で分ける
    expect(labDebrisInRegion(broken, 'wall', w.footX - 10, w.footY - 10, w.footX + 10, w.footY + 10).map(b => b.id)).toContain(w.id);
    expect(labDebrisInRegion(broken, 'wall', w.footX + 5000, -200, w.footX + 6000, 200).some(b => b.id === w.id)).toBe(false);
    expect(labDebrisInRegion(broken, 'prop', w.footX - 10, w.footY - 10, w.footX + 10, w.footY + 10).some(b => b.id === w.id)).toBe(false);
    // 判定は無い(問い合わせから消えたまま=上を歩ける)
    expect(labWallsInRegion(3000, -200, 6000, 200).some(x => x.id === w.id)).toBe(false);
    // 新しい出撃で全部消える
    useGameStore.getState().resetGame('warrior');
    expect(useGameStore.getState().labBrokenObstacles).toEqual([]);
    expect(labDebrisInRegion(useGameStore.getState().labBrokenObstacles, 'wall', -1e9, -1e9, 1e9, 1e9)).toEqual([]);
    expect(isLabObstacleBroken(w.id)).toBe(false);
  });
});

describe('アイドルの拳で壁・プロップを壊す(社長指示2026-10-20)', () => {
  it('拳の帯が通った壁は壊れ(判定から消え)、帯の外の物は残る。屋外ラボ以外では壊さない', () => {
    useGameStore.setState({ labBrokenObstacles: [] });
    const w = labWallsInRegion(-4000, -300, -2000, 300)[0];
    const r = wallRect(w);
    const cy = r.y + r.height / 2;
    const n = breakLabObstaclesInSweep(r.x - 150, cy, r.x + r.width / 2, cy, 30, 10_000);
    expect(n).toBeGreaterThan(0);
    expect(isLabObstacleBroken(w.id)).toBe(true);
    expect(labWallsInRegion(-4000, -300, -2000, 300).some(q => q.id === w.id)).toBe(false);
    const b = useGameStore.getState().labBrokenObstacles.find(q => q.id === w.id)!;
    expect(b.kind).toBe('wall');
    expect(b.dir).toBe(1); // 打った者(左)から物への向きに倒れる
    // 遠くの空振りは何も壊さない
    expect(breakLabObstaclesInSweep(0, 0, 10, 0, 20, 10_000)).toBe(0);
    // 屋外ラボ以外
    useGameStore.setState({ stageTheme: 'forest' as never, labBrokenObstacles: [] });
    expect(breakLabObstaclesInSweep(r.x - 150, cy, r.x + r.width / 2, cy, 30, 10_000)).toBe(0);
  });
});
