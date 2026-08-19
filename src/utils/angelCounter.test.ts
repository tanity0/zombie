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

describe('ラフィ: 跳びかかりの成立域=着地円(監査B-5)', () => {
  beforeEach(() => { clearAngelPlayback(); });

  it('着地円の中(=溜め開始でロックされた自分の足元)なら、遠く離れていてもカウンターが成立する', () => {
    const g = setup('rafi', 300);
    g.play('rf-jump');
    expect(g.state()).toBe('jump-windup');
    expect(touching()).toBe(false); // 体には一切触れていない(300px先)
    const hp = g.boss().health;
    openWindow();
    g.step();
    // 成立の証拠=反撃ダメージ(ラフィは成立後、再ジャンプの溜めを取り直すので州は'jump-windup'のまま)。
    expect(g.boss().health).toBeLessThan(hp);
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

describe('ラフィ: 薙ぎの実行中に帯カウンターがある(監査B-6・ミゲル/ウリ/スリィエルと同じ形)', () => {
  beforeEach(() => { clearAngelPlayback(); });

  it('赤い帯(310×40)の中に居れば、体に触れていなくても実行中に成立する', () => {
    const g = setup('rafi', 200);
    g.play('rf-sweep');
    expect(g.state()).toBe('sweep-windup');
    g.until('sweep');
    expect(g.state()).toBe('sweep');
    expect(touching()).toBe(false);
    const hp = g.boss().health;
    openWindow();
    g.step();
    expect(g.state()).toBe('chase');          // カウンター成立=技を中断
    expect(g.boss().health).toBeLessThan(hp); // 反撃ダメージ
  });
});

describe('アクラシエル: 転移衝撃の成立域=赤円(監査A-4・カウンター手段が1つも無かった技)', () => {
  beforeEach(() => { clearAngelPlayback(); });

  it('予告の1000msの間、赤円の中に居れば成立して衝撃が止まる', () => {
    const g = setup('acrasiel', 300);
    g.play('ac-warp');
    g.until('warp-in');
    expect(g.state()).toBe('warp-in');
    const b = g.boss();
    // 転移先(=赤円の中心)はランダム。判定と同じ aiTargetX/Y を読んでその中心に立つ。
    standAt(b.aiTargetX ?? 0, b.aiTargetY ?? 0);
    const hp = b.health;
    const php = useGameStore.getState().player.health;
    g.step();
    expect(g.state()).toBe('chase');
    expect(g.boss().health).toBeLessThan(hp);
    expect(useGameStore.getState().player.health).toBe(php); // 衝撃は出ない(潰した)
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
