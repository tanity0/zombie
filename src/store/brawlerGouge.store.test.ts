// ★抉り打ち(research/BRAWLER.md §37・§37-7)を store で実際に回す: 溜め→離す→小ジャンプ→当たって浮く・技ポイント・取り消し・段のつなぎ・被弾・移動。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setKenkiLevelForTest } from '../utils/kenkiLevel';
import { useGameStore } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { initialBrawlerState, BRAWLER_TECHS, BRAWLER_TEMPO_DEFAULT } from '../utils/brawler';
import { setBrawlerTempoAll, brawlerAirborne } from '../utils/brawlerCombo';
import { BRAWLER_GOUGE_CHARGE_MS } from '../utils/brawlerGouge';
import { BRAWLER_TECH_NAMES } from '../data/brawlerTechNames';
import { TUTORIALS } from '../data/tutorials';

const NO_INPUT = { up: false, down: false, left: false, right: false } as never;
let now = 9_000_000;
const setup = (points: number) => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
    swipeDirection: null,
    inputState: { up: false, down: false, left: false, right: false },
    player: {
      ...st.player, health: 9999, maxHealth: 9999, invulnerable: false, skills: [] as never, skillLevels: {},
      subWeapons: ['brawler'], subWeaponLevels: { brawler: 2 }, lastDirection: { x: 1, y: 0 }, brawler: { ...initialBrawlerState(), points },
    },
    skillProcFeed: [],
  }));
};
const center = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const enemyAt = (dx: number, dy: number, id: string) => {
  const c = center();
  const e = spawnEnemyAt('zombie', 0, 0, useGameStore.getState().gameTime);
  e.x = c.x + dx - e.width / 2; e.y = c.y + dy - e.height / 2; e.health = 99999; e.maxHealth = 99999; e.id = id;
  return e;
};
const advance = (ms: number) => {
  const end = now + ms;
  while (now < end) {
    now += 10;
    if (now - 10 < useGameStore.getState().hitstopUntil) continue;
    useGameStore.setState(st => ({ gameTime: st.gameTime + 10 }));
    useGameStore.getState().movePlayer(NO_INPUT, 0.01);
    useGameStore.getState().tickBrawler();
  }
};
const br = () => useGameStore.getState().player.brawler!;
const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;
const feed = () => useGameStore.getState().skillProcFeed.map(e => e.key);
const waitHit = () => { for (let k = 0; k < 120 && !(br().resolved && !(useGameStore.getState().gameTime < br().stopUntil)); k++) advance(10); };
/** 押して holdMs 押し続けて離す(離しの結果を返す=呼び手が 'normal' の時は通常攻撃を出す・タッチ/PC と同じ)。 */
const pressHold = (holdMs: number): 'gouge' | 'none' | 'normal' => {
  useGameStore.getState().brawlerGougePress();
  advance(holdMs);
  const r = useGameStore.getState().brawlerGougeRelease();
  if (r === 'normal') useGameStore.getState().beginMeleeSwing();
  useGameStore.getState().brawlerGougeClear();
  return r;
};

beforeEach(() => {
  setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT);
  setKenkiLevelForTest(5);
  now = 9_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('§37 名前と資料室', () => {
  it('技の行=抉り打ち(つなぎの印)・資料室の格闘の一覧の末尾に1行', () => {
    expect(BRAWLER_TECH_NAMES['tech:gouge']).toEqual({ name: '抉り打ち', dir: 'chain' });
    const t = TUTORIALS.find(x => x.id === 'brawler-moves')!;
    // 機器ごとに書き分ける(タッチ=指を置いたまま・PC=クリック・パッド={press}ボタン)。数値は書かない。
    expect(t.lines[t.lines.length - 1]).toBe('指を置いたまま止めて、離す: 抉り打ち。敵を打ち上げる。');
    expect(t.pcLines![t.pcLines!.length - 1]).toBe('クリックを押したまま溜めて、離す: 抉り打ち。敵を打ち上げる。');
    expect(t.padLines![t.padLines!.length - 1]).toBe('{press}ボタンを押したまま溜めて、離す: 抉り打ち。敵を打ち上げる。');
    for (const lines of [t.lines, t.pcLines!, t.padLines!]) expect(lines[lines.length - 1]).not.toMatch(/[0-9]/);
  });
});

describe('§37 待機から', () => {
  it('0.5秒押して離す=抉り打ち(技ポイントは減らない)。近くの敵へ跳んで詰め、当たった敵が浮く。技の名前の行が出る', () => {
    setup(4);
    useGameStore.setState({ enemies: [enemyAt(70, 0, 'z')] });
    const x0 = center().x;
    expect(pressHold(BRAWLER_GOUGE_CHARGE_MS + 20)).toBe('gouge');
    expect(br().tech).toBe('gouge');
    expect(br().points).toBe(4);
    expect(feed()).toContain('tech:gouge');
    waitHit();
    expect(center().x).toBeGreaterThan(x0 + 20); // 跳んで詰めた
    expect(en('z').health).toBeLessThan(99999);
    expect(brawlerAirborne(en('z'), now)).toBe(true);
    expect(br().points).toBe(5); // 当てた時は段と同じく +1
  });
  it('0.5秒未満は今どおりの通常攻撃(1段目)', () => {
    setup(4);
    useGameStore.setState({ enemies: [enemyAt(50, 0, 'z')] });
    expect(pressHold(BRAWLER_GOUGE_CHARGE_MS - 60)).toBe('normal');
    expect(br().phase).toBe('attack');
    expect(br().stage).toBe(1);
  });
  it('当てた後は飛び蹴りへ取り消せる(地割りへは行かない)', () => {
    setup(9);
    useGameStore.setState({ enemies: [enemyAt(60, 0, 'z')] });
    pressHold(BRAWLER_GOUGE_CHARGE_MS + 20);
    waitHit();
    // 下=地割りは取り消しでは出ない(判定の後に押した技の規則 §25=覚えて、後隙が終わって待機へ戻ってから出る)
    useGameStore.getState().brawlerTech(0, 1);
    expect(br().tech).toBe('gouge');
    expect(useGameStore.getState().brawlerTech(1, 0)).toBe(true); // 右=飛び蹴り
    expect(br().tech).toBe('kick');
  });
});

describe('§37-7 移動・被弾', () => {
  it('PC: 溜めの途中で移動キーを押すと溜めは消え、離しは今どおり', () => {
    setup(0);
    useGameStore.getState().brawlerGougePress();
    advance(200);
    useGameStore.setState({ inputState: { up: false, down: false, left: false, right: true } });
    advance(10);
    useGameStore.setState({ inputState: { up: false, down: false, left: false, right: false } });
    advance(BRAWLER_GOUGE_CHARGE_MS);
    expect(useGameStore.getState().brawlerGougeRelease()).toBe('normal');
  });
  it('タッチ: 指が遊びの外へ出たら溜めは消える', () => {
    setup(0);
    useGameStore.getState().brawlerGougePress();
    advance(100);
    useGameStore.setState({ swipeDirection: { x: 1, y: 0 } });
    advance(10);
    useGameStore.setState({ swipeDirection: null });
    advance(BRAWLER_GOUGE_CHARGE_MS);
    expect(useGameStore.getState().brawlerGougeRelease()).toBe('normal');
  });
  it('溜めの途中で怯む被弾=溜めが消え、0.5秒以上押した離しは何も出ない(段も出ない)', () => {
    setup(0);
    useGameStore.getState().brawlerGougePress();
    advance(200);
    useGameStore.getState().damagePlayer(5);
    expect(br().gougeDead).toBe(true);
    advance(800);
    expect(useGameStore.getState().brawlerGougeRelease()).toBe('none');
    expect(br().phase).toBe('idle');
  });
});

describe('§37-7 通常技から溜める', () => {
  it('1段目を当てた後の押下を0.5秒持って離す=2段目の代わりに抉り打ち(段のつなぎ)', () => {
    setup(0);
    useGameStore.setState({ enemies: [enemyAt(40, 0, 'z')] });
    expect(useGameStore.getState().brawlerPress()).toBe(true);
    waitHit();
    expect(br().stage).toBe(1);
    expect(pressHold(BRAWLER_GOUGE_CHARGE_MS + 20)).toBe('gouge');
    expect(br().tech).toBe('gouge');
    expect(br().linked).toBe(true);
    expect(br().windupMs).toBe(Math.round(BRAWLER_TECHS.gouge.windupMs));
  });
  it('段のつなぎとして出た抉り打ちの当たりは HIT の数を続ける(1段目を当て→0.5秒溜め→離して当たる=2 HIT)', () => {
    setup(0);
    useGameStore.setState({ enemies: [enemyAt(40, 0, 'z')] });
    useGameStore.getState().brawlerPress();
    waitHit();
    expect(br().flowHits).toBe(1);
    expect(pressHold(BRAWLER_GOUGE_CHARGE_MS + 20)).toBe('gouge');
    expect(br().flowHits).toBe(1); // 溜めの間も数は消えない(切れて見えない)
    expect(br().flowBrokenAt ?? 0).toBe(0);
    waitHit();
    expect(br().flowHits).toBe(2);
    expect(en('z').brComboHits).toBe(2);
  });
  it('待機から(つなぎでない)の抉り打ちは数え直す(1 HIT)', () => {
    setup(0);
    useGameStore.setState({ enemies: [enemyAt(60, 0, 'z')] });
    expect(pressHold(BRAWLER_GOUGE_CHARGE_MS + 20)).toBe('gouge');
    waitHit();
    expect(br().flowHits).toBe(1);
  });
  it('段のつなぎの溜めの間はハンティングの範囲の広がりが切れない(押し始めから)', () => {
    setup(0);
    useGameStore.setState(st => ({ enemies: [enemyAt(40, 0, 'z')], player: { ...st.player, huntingCharged: true } }));
    useGameStore.getState().brawlerPress();
    waitHit();
    expect(br().huntingCombo).toBe(true);
    useGameStore.getState().brawlerGougePress();
    advance(BRAWLER_GOUGE_CHARGE_MS * 3); // 段の後のつながりを大きく超えて押し続ける
    expect(br().huntingCombo).toBe(true);
    expect(useGameStore.getState().brawlerGougeRelease()).toBe('gouge');
    expect(br().huntingCombo).toBe(true);
  });
  it('0.5秒未満で離した時は、延ばしたつながりを戻す(段のつながりが切れていれば1段目・ハンティングも今どおり消費)', () => {
    setup(0);
    useGameStore.setState(st => ({ enemies: [enemyAt(40, 0, 'z')], player: { ...st.player, huntingCharged: true } }));
    useGameStore.getState().brawlerPress();
    waitHit();
    // 段が終わってつながりの受付の終わり際まで待ってから押す
    for (let k = 0; k < 400 && !(br().phase === 'idle' && br().chainUntil - useGameStore.getState().gameTime < 100); k++) advance(10);
    expect(br().phase).toBe('idle');
    expect(br().nextStage).toBe(2);
    useGameStore.getState().brawlerGougePress();
    advance(300); // 元のつながりは切れている(延ばしている間は生きている)
    expect(br().huntingCombo).toBe(true);
    const r = useGameStore.getState().brawlerGougeRelease();
    expect(r).toBe('normal');
    expect(br().huntingCombo).toBe(false);
    expect(useGameStore.getState().player.huntingCharged).toBe(false);
    useGameStore.getState().beginMeleeSwing();
    expect(br().stage).toBe(1);
  });
  it('5段目の最中に押したまま待つと、終わってから溜まり、待機からの抉り打ちとして出る', () => {
    setup(0);
    useGameStore.setState({ enemies: [enemyAt(40, 0, 'z')] });
    for (let n = 1; n <= 5; n++) {
      if (n > 1) { for (let k = 0; k < 200 && br().phase !== 'idle'; k++) advance(10); }
      useGameStore.getState().brawlerPress();
      waitHit();
    }
    expect(br().stage).toBe(5);
    useGameStore.getState().brawlerGougePress();
    expect(br().gougeWait).toBe(true);
    for (let k = 0; k < 300 && br().gougeReadyAt === undefined; k++) advance(10);
    expect(br().gougeReadyAt).toBeDefined();
    expect(useGameStore.getState().brawlerGougeRelease()).toBe('gouge');
    expect(br().linked).toBe(false);
  });
});
