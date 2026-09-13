// 天使(ゲート2ボス)のカウンター成立域=赤い予告の図形 — research/COUNTER_REACH_AUDIT.md の是正(v0.25.3591)
//
// 社長ゴール(言葉のまま):「(カウンターが)身体に触れているかで見ていて、実際カウンターできない技が多い」。
// 型は v0.25.3585(舞妓)と同じ:**体に触れない位置に立ち、赤い図形の中で窓を開く → 成立して反撃が入る。**
// 盤面の作り方は angelPlayback.test.ts と同じ(▸個別再生で州を狙って作る)。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  runAngelBossTick, createAngelBossState, NOOP_ANGEL_SFX, tickAcrasielSpears,
  requestAngelMovePlay, clearAngelPlayback, type AngelMoveKey,
} from './angelBossTick';
import { useGameStore } from '../store/gameStore';
import { spawnEnemyAt } from './enemyUtils';
import { ANGEL_ACRASIEL_TUNING as AC_T } from './angelScript';
import type { EnemyType } from '../types/game';

const DT = 1 / 60;

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
  const until = (want: string, maxSteps = 400): void => {
    for (let i = 0; i < maxSteps && state() !== want; i++) step();
  };
  return { step, boss, state, play, until, now: () => gt };
};

const openWindow = (): void => {
  useGameStore.setState(s => ({ player: { ...s.player, counterWindowEnd: Date.now() + 5000 } }));
};
const standAt = (x: number, y: number): void => {
  useGameStore.setState(s => ({
    player: { ...s.player, x: x - s.player.width / 2, y: y - s.player.height / 2, counterWindowEnd: Date.now() + 5000 },
  }));
};
const touching = (): boolean => {
  const b = useGameStore.getState().enemies[0], p = useGameStore.getState().player;
  return b.x < p.x + p.width && b.x + b.width > p.x && b.y < p.y + p.height && b.y + b.height > p.y;
};

// ★カウンター憲法(社長裁定2026-08-26・v0.25.3947): 溜め中の着地円成立(v3591 B-5)は憲法が上書き。
describe('ラフィ: 跳びかかりの溜めはカウンター不成立(憲法・対処=回避+着地爆風のパリィ)', () => {
  beforeEach(() => { clearAngelPlayback(); });

  it('憲法: 着地円の中に立って窓を開けても、溜め中は成立しない', () => {
    const g = setup('rafi', 300);
    g.play('rf-jump');
    expect(g.state()).toBe('jump-windup');
    expect(touching()).toBe(false); // 体には一切触れていない(300px先)
    const hp = g.boss().health;
    openWindow();
    g.step();
    expect(g.boss().health).toBe(hp); // 反撃は入らない(成立しない)
  });

  it('赤い円の外(着地点から遠い)へ歩けば成立しない=避けた側が正しく報われる', () => {
    const g = setup('rafi', 300);
    g.play('rf-jump');
    expect(g.state()).toBe('jump-windup');
    const hp = g.boss().health;
    standAt(1200, 1200); // ロック済みの着地円から大きく外れた位置
    g.step();
    expect(g.boss().health).toBe(hp);
  });
});

// ★カウンター憲法(v0.25.3947): ラフィの薙ぎのダメージは溜め明けの爆風で解決済み=実行中の帯は
// 「判定後のカウンター専用窓」(v3591 B-6)だった→憲法が上書き。薙ぎは爆風パリィ(判定の瞬間)で返す。
describe('ラフィ: 薙ぎの実行中の帯窓はカウンター不成立(憲法)', () => {
  beforeEach(() => { clearAngelPlayback(); });

  it('憲法: 実行中に帯の中で窓を開けても成立しない(技は完走する)', () => {
    const g = setup('rafi', 200);
    g.play('rf-sweep');
    expect(g.state()).toBe('sweep-windup');
    g.until('sweep');
    expect(g.state()).toBe('sweep');
    expect(touching()).toBe(false);
    const hp = g.boss().health;
    openWindow();
    g.step();
    expect(g.state()).toBe('sweep');       // 中断されない
    expect(g.boss().health).toBe(hp);      // 反撃も入らない
  });
});

// ★カウンター憲法(v0.25.3947): 転移の予告円成立(v3591 A-4)は判定前=憲法が上書き。
// 対処=予告1000msの間に赤円から歩いて出る(回避)。
describe('アクラシエル: 転移衝撃の予告円はカウンター不成立(憲法・回避で対処)', () => {
  beforeEach(() => { clearAngelPlayback(); });

  it('憲法: 予告の間、赤円の中で窓を開けても成立しない(転移は完走する)', () => {
    const g = setup('acrasiel', 300);
    g.play('ac-warp');
    g.until('warp-in');
    expect(g.state()).toBe('warp-in');
    const b = g.boss();
    standAt(b.aiTargetX ?? 0, b.aiTargetY ?? 0);
    const hp = b.health;
    g.step();
    expect(g.state()).toBe('warp-in');       // 中断されない(予告は続く)
    expect(g.boss().health).toBe(hp);        // 反撃も入らない
  });
});

describe('アクラシエル: 結晶の槍の起爆をカウンターで潰せる(監査A-3・直damagePlayerでパリィすら通らなかった)', () => {
  beforeEach(() => { clearAngelPlayback(); });

  it('赤円の中で窓が開いていれば、起爆はダメージにならず反撃になる', () => {
    const g = setup('acrasiel', 300);
    g.play('ac-spear');
    for (let i = 0; i < 400 && useGameStore.getState().acrasielSpears.length === 0; i++) g.step();
    const spears = useGameStore.getState().acrasielSpears;
    expect(spears.length).toBe(AC_T.spear.count);
    const sp = spears[0];
    standAt(sp.x, sp.y); // 1本目の赤円のど真ん中に立つ+窓を開ける
    const hp = g.boss().health;
    const php = useGameStore.getState().player.health;
    tickAcrasielSpears(sp.fireAt, () => {});
    expect(useGameStore.getState().player.health).toBe(php); // 被弾しない
    expect(useGameStore.getState().enemies[0].health).toBeLessThan(hp); // 反撃が入る
  });

  it('窓が閉じていれば従来どおり被弾する(=カウンターできる技になっただけで、避けなくてよい技にはしない)', () => {
    const g = setup('acrasiel', 300);
    g.play('ac-spear');
    for (let i = 0; i < 400 && useGameStore.getState().acrasielSpears.length === 0; i++) g.step();
    const sp = useGameStore.getState().acrasielSpears[0];
    useGameStore.setState(s => ({
      player: { ...s.player, x: sp.x - s.player.width / 2, y: sp.y - s.player.height / 2, counterWindowEnd: 0, invulnerable: false },
    }));
    const php = useGameStore.getState().player.health;
    tickAcrasielSpears(sp.fireAt, () => {});
    expect(useGameStore.getState().player.health).toBeLessThan(php);
  });
});

describe('ラフィの骨刃は、ラフィを倒したら消える(社長指示v0.25.3591)', () => {
  it('ラフィが盤面から消えたフレームで、残っていた骨刃も片付く', () => {
    useGameStore.getState().resetGame('assault');
    const rafi = spawnEnemyAt('rafi', 0, -300, 0);
    rafi.fromEvent = true; rafi.dormant = false; rafi.bossState = 'chase';
    rafi.health = 99999; rafi.maxHealth = 99999;
    useGameStore.setState(s => ({ enemies: [rafi], player: { ...s.player, x: 0, y: 0 } }));
    // 骨刃を1本置く(発射待ち=予告の状態)。
    useGameStore.getState().spawnSkadiBlade(0, -200, 0, useGameStore.getState().gameTime + 10_000, rafi.id, 'bone');
    expect(useGameStore.getState().skadiIceBlades.length).toBe(1);
    useGameStore.getState().updateEnemies(DT);
    expect(useGameStore.getState().skadiIceBlades.length, 'ラフィが生きている間は残る').toBe(1);
    // ラフィ討伐(盤面から消える)。
    useGameStore.setState({ enemies: [] });
    useGameStore.getState().updateEnemies(DT);
    expect(useGameStore.getState().skadiIceBlades.length, 'ラフィが居なくなったら消える').toBe(0);
  });
});
