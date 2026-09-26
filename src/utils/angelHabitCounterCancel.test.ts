// research/AI_HUMANIZE.md B1(検収是正・§1-0例外/中6): 天使7州で「溜め中の体当てカウンター成立→
// 州キャンセル」の経路(angelBossTickの `overlap && counterActive` 分岐)でも、その瞬間にコマを
// 確定することを検証する(T=州の満了予定時刻のまま)。
//
// ★実在確認(検収前の裏取り): `bodyOverlapNow` は `isBodySlamNow(enemy.bossState)` が true の間だけ
// overlap を返す設計(★カウンター憲法v0.25.3947)。harai-windup/ring-spin-windup等の「溜め」州の
// bossState文字列は `enemyBite.ts` の BODY_SLAM_BOSS_STATES/PASS_THROUGH_BOSS_STATES のどちらにも
// 現状載っていない(実測=下の「実測: 自然な対戦ではこの分岐へ到達しない」テストで固定)ため、
// この分岐は**現状の実戦では到達しない**(=挙動不変。settleEpisodeを足しても実害ゼロ)。
// それでも配線(到達した時に正しくT/形で録れるか)を検証するため、以下のテストは
// `isBodySlamNow` をスタブして分岐を強制到達させる(**本番コードの判定ロジックは一切変更しない**)。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runAngelBossTick, createAngelBossState, NOOP_ANGEL_SFX,
  requestAngelMovePlay, clearAngelPlayback, type AngelMoveKey,
} from './angelBossTick';
import { useGameStore } from '../store/gameStore';
import { spawnEnemyAt } from './enemyUtils';
import type { EnemyType } from '../types/game';
import * as enemyBite from './enemyBite';
import { resetRunHabitState, takeRunHabitFold, tickHabitEpisodeMaintenance } from './habitEpisode';

const DT = 1 / 60;

// setup/standAtBossの型はangelCounter.test.tsと同じ流儀(▸個別再生で州を狙って作る)。
const setup = (type: EnemyType, distance: number) => {
  useGameStore.getState().resetGame('assault');
  const e = spawnEnemyAt(type, 0, -distance, 0);
  e.fromEvent = true; e.dormant = false; e.fixed = false;
  e.bossState = 'chase'; e.bossPhase = 1;
  e.bossNextActionAt = Number.MAX_SAFE_INTEGER; // 自発的な抽選を止める=強制発動だけを見る
  e.homeX = 0; e.homeY = 0;
  e.health = 99999; e.maxHealth = 99999;
  useGameStore.setState(s => ({
    enemies: [e], projectiles: [], pumpkinBlasts: [], bossFires: [], acrasielSpears: [],
    player: { ...s.player, x: 0, y: 0, health: 9999, maxHealth: 9999 },
  }));
  const st = createAngelBossState();
  let gt = 0;
  const step = (ms = DT * 1000): void => {
    gt += ms;
    useGameStore.setState({ gameTime: gt });
    runAngelBossTick(st, gt, ms / 1000, 1, NOOP_ANGEL_SFX, () => {});
  };
  const boss = () => useGameStore.getState().enemies[0];
  const state = (): string => boss()?.bossState ?? '(なし)';
  const play = (k: AngelMoveKey): void => { requestAngelMovePlay(k, { solo: false, loop: false }); step(); };
  return { step, boss, state, play, now: () => gt };
};

const standAtBoss = (): void => {
  useGameStore.setState(s => {
    const b = s.enemies[0];
    return { player: { ...s.player, x: b.x, y: b.y, counterWindowEnd: Date.now() + 5000 } };
  });
};

describe('実測: 自然な対戦ではこの分岐へ到達しない(isBodySlamNowスタブ無しの対照)', () => {
  beforeEach(() => { clearAngelPlayback(); resetRunHabitState(); });

  it('ミゲルharai-windup: 体を重ねて窓を開けたままでも溜めは完走する(overlap===falseのまま)', () => {
    const g = setup('miguel', 300);
    g.play('mg-harai');
    expect(g.state()).toBe('harai-windup');
    const hp0 = g.boss().health;
    standAtBoss();
    for (let i = 0; i < 200 && g.state() === 'harai-windup'; i++) g.step();
    expect(g.state()).toBe('harai'); // 中断されず実行州へ自然遷移=分岐は不成立のまま
    expect(g.boss().health).toBe(hp0); // 反撃も入らない
  });
});

describe('AI_HUMANIZE B1(検収是正・§1-0例外/中6): 溜め中カウンター成立でもコマを確定する', () => {
  beforeEach(() => { clearAngelPlayback(); resetRunHabitState(); });

  it('ミゲル harai-windup(帯・非退化軸): overlap&&counterActive成立でsettleEpisodeが呼ばれ、T=満了予定時刻で1件録れる', () => {
    const spy = vi.spyOn(enemyBite, 'isBodySlamNow').mockReturnValue(true);
    const g = setup('miguel', 300);
    g.play('mg-harai');
    expect(g.state()).toBe('harai-windup');
    const scheduledUntil = g.boss().bossStateUntil!;
    standAtBoss();
    g.step(); // ここでovelap&&counterActive成立→州中断(spyでisBodySlamNowを強制true)
    spy.mockRestore();
    expect(g.state()).toBe('counter-leap'); // 中断された証拠(既存挙動どおり=変更していない)
    // T=満了予定時刻のまま確定する(§1-0例外)ので、帰属確定もscheduledUntil基準で行う。
    tickHabitEpisodeMaintenance(scheduledUntil + 300);
    const folded = takeRunHabitFold();
    expect(folded).not.toBeNull();
    expect(folded!.episodes['miguel:harai-windup']?.length).toBe(1);
  });

  it('うり sweep-windup(帯): overlap&&counterActive成立でも1件録れる', () => {
    const spy = vi.spyOn(enemyBite, 'isBodySlamNow').mockReturnValue(true);
    const g = setup('uri', 300);
    g.play('ur-sweep');
    expect(g.state()).toBe('sweep-windup');
    const scheduledUntil = g.boss().bossStateUntil!;
    standAtBoss();
    g.step();
    spy.mockRestore();
    expect(g.state()).toBe('chase'); // uri/surielは呼び出し側で明示的にchaseへ戻す(従来どおり)
    tickHabitEpisodeMaintenance(scheduledUntil + 300);
    const folded = takeRunHabitFold();
    expect(folded).not.toBeNull();
    expect(folded!.episodes['uri:sweep-windup']?.length).toBe(1);
  });

  it('スリエル ring-spin-windup(自分中心円・軸退化): overlap&&counterActive成立でも1件録れ、posBは軸退化どおり0のまま', () => {
    const spy = vi.spyOn(enemyBite, 'isBodySlamNow').mockReturnValue(true);
    const g = setup('suriel', 300);
    g.play('sr-ringspin');
    expect(g.state()).toBe('ring-spin-windup');
    const scheduledUntil = g.boss().bossStateUntil!;
    standAtBoss();
    g.step();
    spy.mockRestore();
    expect(g.state()).toBe('chase');
    tickHabitEpisodeMaintenance(scheduledUntil + 300);
    const folded = takeRunHabitFold();
    expect(folded).not.toBeNull();
    const eps = folded!.episodes['suriel:ring-spin-windup'];
    expect(eps?.length).toBe(1);
    // ★退避チェック(角度の軸退化・§1-2): 自分中心円は軸をscx,scy,scx,scyへ強制退化させているので、
    // 中断経路でもposBは常に0(=前回のaiFrom/aiTargetを誤って引きずっていない)。
    expect(eps![0].posB).toBe(0);
  });
});
