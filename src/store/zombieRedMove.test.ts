// PACING_PUZZLE.md §16-3(ゾンビ — 2連続噛みつき(赤) / 高速追尾(紫))・§16-8b手順5の統合テスト。
//
// 純関数(zombieRedWaitMs / zombieWantsChaffRedSlot / endChaffMove の値そのもの)は
// chaffMoves.test.ts、isBodySlamNow のzrush分岐とBiteSpecの2段引きは enemyBite.test.ts に置く。
// ここは「実装精度の規律4」どおり、配線(gameStore.ts の状態機械)を updateEnemies を実際に
// 回して確かめる統合テスト。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  useGameStore, ZOMBIE_RUSH_MS, ZOMBIE_PAUSE_MS,
} from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { applyContactDamage, NOOP_COMBAT_EFFECTS } from '../utils/combatTick';
import { biteSpecFor, BITE_CONTACT_DIST_PX, biteLungeDistanceAtFire } from '../utils/enemyBite';
import {
  ZOMBIE_LUNGE_RANGE_PX, ZOMBIE_STAGGER_MS, ZOMBIE_RECOVER_MS,
  zombieRedPauseMs, ZOMBIE_RED_TRIGGER_MIN_PX, // §16-3z追補①: 停止の長さ±30%(id+spawnedAt由来)
  ZOMBIE_RETREAT_TARGET_PX, // §16-A7条目: 技を出し切ったら得意な距離(150px)へ離れる
} from '../utils/chaffMoves';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import type { Enemy } from '../types/game';

const ORIGIN = 50_000;
const START_GT = 10_000_000;

/** プレイヤーを(ORIGIN,ORIGIN)中心に置き、ゾンビをそこから中心間距離distだけ離して置く。 */
const place = (dist: number, over: Partial<Enemy> = {}): Enemy => {
  const e = { ...spawnEnemyAt('zombie', 0, 0, START_GT), ...over };
  e.x = ORIGIN + dist - e.width / 2;
  e.y = ORIGIN - e.height / 2;
  useGameStore.setState(s => ({
    enemies: [e],
    gameTime: START_GT,
    player: {
      ...s.player,
      x: ORIGIN - s.player.width / 2, y: ORIGIN - s.player.height / 2,
      health: 9999, maxHealth: 9999, invulnerable: false, invulnerableTime: 0,
    },
  }));
  return e;
};

const tick = (gt: number, dt = 1 / 60) => {
  useGameStore.getState().setGameTime(gt);
  useGameStore.getState().updateEnemies(dt);
};

const first = (): Enemy => useGameStore.getState().enemies[0];

beforeEach(() => {
  setTreesDisabled(true); setTorchesDisabled(true);
  useGameStore.getState().resetGame('assault');
});

describe('帯(200〜100px)への進入 → z-wait', () => {
  it('帯(150px)に入った個体はz-waitへ入り、待ちの尺(300〜2800ms)を持つ', () => {
    place(150);
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).toBe('z-wait');
    expect(e.aiPhaseUntil).toBeGreaterThanOrEqual(START_GT + 300);
    expect(e.aiPhaseUntil).toBeLessThanOrEqual(START_GT + 2800);
  });

  it('帯の外(250px)では何も起きない(aiPhase未設定のまま)', () => {
    place(250);
    tick(START_GT);
    expect(first().aiPhase).toBeUndefined();
  });

  it('★赤の技後CD中は帯に入ってもz-waitへ入らない(§16-3「紫の停止にも入らない」の前段)', () => {
    place(150, { chaffMoveCdUntil: START_GT + 2000 });
    tick(START_GT);
    expect(first().aiPhase).toBeUndefined();
  });
});

describe('★検収A-1/A-2(2026-09-16・14秒実走で発覚): 帯への進入は内縁より外だけ・紫の直接入口の復元', () => {
  // 観測: プレイヤー静止・ゾンビ1体を210pxから14秒動かすと、1周目(t=0〜5050ms)は正しく
  // 赤2連が出るが、その後 z-wait(t=8633ms・距離0.6px=密着)→z-red-pause(密着したまま2秒棒立ち)
  // になっていた。原因は2つ: ①帯への新規進入が外縁(200px)しか見ておらず内縁の下限が無かった
  // (密着=0pxでもz-waitに入れた) ②旧「範囲に入った瞬間=1秒停止(紫)」の直接入口が差し替えで
  // 消えており、紫は「z-wait経由で枠が無い時だけ」になっていた(枠が空いていれば距離に関係なく
  // 赤になっていた=紫の通路が事実上死んでいた)。
  it('A-1: 密着(0.6px)している個体は、枠が空いていてもz-waitにもz-red-pauseにも入らない', () => {
    place(0.6); // このゾンビ1体だけ=枠は空いている
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).not.toBe('z-wait');
    expect(e.aiPhase).not.toBe('z-red-pause');
  });

  it('A-2: 密着(0.6px)している個体は紫(zpause・1秒停止)に入る(紫の直接入口の復元)', () => {
    place(0.6);
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).toBe('zpause');
    expect(e.aiPhaseUntil).toBe(START_GT + ZOMBIE_PAUSE_MS);
  });

  it('★2周目の再現: 技後CDが明けていても、密着したままでは赤(z-wait/z-red-pause)に入らない', () => {
    place(0.6, { chaffMoveCdUntil: START_GT - 1 }); // CDは既に明けている
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).not.toBe('z-wait');
    expect(e.aiPhase).not.toBe('z-red-pause');
    expect(e.aiPhase).toBe('zpause'); // CD明け後でも近すぎれば紫
  });

  it('A-2: 枠が空いている状態で、内縁より内側(50px)から始まった個体もzpauseに入る', () => {
    place(50);
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).toBe('zpause');
  });

  it('境界(内縁=100px)ちょうどはzpause側(z-waitは内縁より外側だけ)', () => {
    place(100);
    tick(START_GT);
    expect(first().aiPhase).toBe('zpause');
  });

  it('内縁のすぐ外側(101px)はz-wait側(帯に入る)', () => {
    place(101);
    tick(START_GT);
    expect(first().aiPhase).toBe('z-wait');
  });
});

describe('「赤が先」(§16-3): 帯の内縁(100px)で枠の有無により赤/紫が確定する', () => {
  it('枠が空いていれば赤(z-red-pause・その場)が確定する', () => {
    // ★距離は引き金の最小値(88px)より内側に置く。§16-3z「内縁の引き金に幅(88〜118px・id由来)」
    // により、境界ちょうど(100px)だとidによって赤にならないことがある(非決定的テストを避ける)。
    const e0 = place(ZOMBIE_RED_TRIGGER_MIN_PX - 3, { aiPhase: 'z-wait', aiPhaseUntil: START_GT + 5000 });
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).toBe('z-red-pause');
    // ★①停止の長さ±30%(§16-3z): 全長は固定値ではなくid+spawnedAt由来(zombieRedPauseMs)。
    expect(e.aiPhaseUntil).toBe(START_GT + zombieRedPauseMs(e0.id, e0.spawnedAt));
    expect(e.vx).toBe(0); expect(e.vy).toBe(0); // その場(位置は動かさない)
  });

  it('尺切れ(タイマー満了)でも赤が確定する(距離は100px未満まで来ていなくてもよい)', () => {
    place(140, { aiPhase: 'z-wait', aiPhaseUntil: START_GT - 1 }); // 尺切れ済み
    tick(START_GT);
    expect(first().aiPhase).toBe('z-red-pause');
  });

  it('枠が無ければ紫(旧zpause)へ落ちる。境界は100px(旧MELEE_RADIUS=74ではない)', () => {
    // 枠を埋める2体(z-red-pauseで占有中)+ 内縁に達した3体目。
    const holder1 = { ...spawnEnemyAt('zombie', 0, 0, START_GT), aiPhase: 'z-red-pause' as const, aiPhaseUntil: START_GT + 2000 };
    const holder2 = { ...spawnEnemyAt('zombie', 100, 100, START_GT), aiPhase: 'z-red-pause' as const, aiPhaseUntil: START_GT + 2000 };
    const third = { ...spawnEnemyAt('zombie', 0, 0, START_GT), aiPhase: 'z-wait' as const, aiPhaseUntil: START_GT + 5000 };
    third.x = ORIGIN + 100 - third.width / 2; third.y = ORIGIN - third.height / 2; // 内縁ちょうど
    useGameStore.setState(s => ({
      enemies: [holder1, holder2, third],
      gameTime: START_GT,
      player: { ...s.player, x: ORIGIN - s.player.width / 2, y: ORIGIN - s.player.height / 2 },
    }));
    tick(START_GT);
    const t = useGameStore.getState().enemies.find(e => e.id === third.id)!;
    expect(t.aiPhase).toBe('zpause');
    expect(t.aiPhaseUntil).toBe(START_GT + ZOMBIE_PAUSE_MS);
  });

  it('★境界が100pxへ統一されている: 90px(旧MELEE_RADIUS=74の外側)でも紫の停止に入る', () => {
    place(90, { aiPhase: 'z-wait', aiPhaseUntil: START_GT + 5000 });
    // 枠の候補になれない状況を作る(既に2体が占有)ほうが確実だが、ここは単体でも
    // 「枠が空いていれば赤になる」ので、素の距離境界だけを見るため枠2体を埋めて確認する。
    const holder1 = { ...spawnEnemyAt('zombie', 0, 0, START_GT), aiPhase: 'z-red-pause' as const, aiPhaseUntil: START_GT + 2000 };
    const holder2 = { ...spawnEnemyAt('zombie', 5, 5, START_GT), aiPhase: 'z-red-pause' as const, aiPhaseUntil: START_GT + 2000 };
    const subject = first();
    useGameStore.setState({ enemies: [holder1, holder2, subject] });
    tick(START_GT);
    const s = useGameStore.getState().enemies.find(e => e.id === subject.id)!;
    expect(s.aiPhase).toBe('zpause'); // 74pxではなく100pxが境界=90pxで既にinMelee
  });
});

describe('赤の台本: z-red-pause → z-lunge-in → z-bite1 → z-stagger → z-bite2 → 技の終わり', () => {
  it('停止2000ms明けでz-lunge-inへ。chaffMoveがここで立つ(§16-7b)', () => {
    place(150, { aiPhase: 'z-red-pause', aiPhaseUntil: START_GT });
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).toBe('z-lunge-in');
    expect(e.chaffMove).toBe('zombie-double');
    expect(e.chaffMoveAt).toBe(START_GT);
  });

  it('射程75pxに達したらz-bite1(biteAt/向き/踏み込み距離を焼く)', () => {
    place(ZOMBIE_LUNGE_RANGE_PX, { aiPhase: 'z-lunge-in', chaffMove: 'zombie-double', chaffMoveAt: START_GT - 500 });
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).toBe('z-bite1');
    expect(e.biteAt).toBe(START_GT);
    // 敵はプレイヤーより+x側に置いた(place)ので、敵→プレイヤー方向は-x。
    expect(e.biteDirX).toBeCloseTo(-1, 5);
    // ★§16-A「踏み込みの終点」: 踏み込み距離は発火時の中心間距離(75px)から接触距離を引いた値を
    // 発火の瞬間に焼く(biteLungeDistanceAtFire・追尾しない=以後は読むだけ)。
    expect(e.biteLungePx).toBeCloseTo(biteLungeDistanceAtFire('zombie', ZOMBIE_LUNGE_RANGE_PX), 5);
  });

  it('射程に届いていない間は2倍速で近づき続ける(z-lunge-inのまま)', () => {
    const e0 = place(ZOMBIE_LUNGE_RANGE_PX + 20, { aiPhase: 'z-lunge-in', chaffMove: 'zombie-double', chaffMoveAt: START_GT - 200 });
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).toBe('z-lunge-in');
    // 近づいている(敵は+x側に居るので、xが減る=プレイヤーへ寄っている)。
    expect(e.x).toBeLessThan(e0.x);
  });

  it('1発目が解決(biteAt=0)したらz-stagger(160ms・その場)へ', () => {
    place(60, { aiPhase: 'z-bite1', chaffMove: 'zombie-double', biteAt: 0 });
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).toBe('z-stagger');
    expect(e.aiPhaseUntil).toBe(START_GT + ZOMBIE_STAGGER_MS);
    expect(e.vx).toBe(0); expect(e.vy).toBe(0);
  });

  it('よろけ明けでz-bite2へ(biteAt再発火・踏み込み距離はその場の距離から動的に焼く・向きは1発目から僅かにずれる)', () => {
    place(60, { aiPhase: 'z-stagger', aiPhaseUntil: START_GT, chaffMove: 'zombie-double' });
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).toBe('z-bite2');
    expect(e.biteAt).toBe(START_GT);
    // ★§16-A「踏み込みの終点」(社長指摘2026-09-17「通り過ぎちゃう」・設計者の規則ミスを訂正した後):
    // 踏み込み距離は**固定値ではない**——発火時の中心間距離(60px)から接触距離を引いた値を
    // `biteLungeDistanceAtFire`が発火の瞬間に計算し`biteLungePx`へ焼く(追尾しない=以後は読むだけ)。
    expect(e.biteLungePx).toBeCloseTo(biteLungeDistanceAtFire('zombie', 60), 5);
    const spec = biteSpecFor('zombie', 'zombie-double', 'z-bite2');
    expect(spec.windupMs).toBe(300); expect(spec.biteMs).toBe(200);
    // 向きは単位ベクトル。
    const len = Math.hypot(e.biteDirX ?? 0, e.biteDirY ?? 0);
    expect(len).toBeCloseTo(1, 5);
    // まっすぐプレイヤー方向(1,0)からは僅かにずれている(offset角が乗っている)。
    expect(e.biteDirY ?? 0).not.toBe(0);
  });

  it('z-bite1/z-bite2とも保険の既定値(BiteSpec.lungePx)は接触距離に統一されている(実際の踏み込み距離は動的計算=biteLungePxが優先)', () => {
    const spec1 = biteSpecFor('zombie', 'zombie-double', 'z-bite1');
    const spec2 = biteSpecFor('zombie', 'zombie-double', 'z-bite2');
    expect(spec1.lungePx).toBe(BITE_CONTACT_DIST_PX.zombie);
    expect(spec2.lungePx).toBe(BITE_CONTACT_DIST_PX.zombie);
    expect(spec1.windupMs).toBe(220); expect(spec1.biteMs).toBe(160);
  });

  it('★③2発目が解決(biteAt=0)したらz-recover(硬直900ms)へ。その場で伸び切ったまま・chaffMoveは立てたまま(§16-3z)', () => {
    place(60, { aiPhase: 'z-bite2', chaffMove: 'zombie-double', biteAt: 0 });
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).toBe('z-recover');
    expect(e.aiPhaseUntil).toBe(START_GT + ZOMBIE_RECOVER_MS);
    expect(ZOMBIE_RECOVER_MS).toBe(900); // ★社長裁定2026-09-17「推薦で」600→900ms
    expect(e.chaffMove).toBe('zombie-double'); // 技の続き(s-recoverと同型)。CDはまだ書かない。
    expect(e.chaffMoveCdUntil).toBeUndefined();
    expect(e.vx).toBe(0); expect(e.vy).toBe(0);
  });

  it('z-recover硬直中は動かない(移動も次の技も入らない=③の受け入れ条件)', () => {
    const e0 = place(60, { aiPhase: 'z-recover', aiPhaseUntil: START_GT + 400, chaffMove: 'zombie-double' });
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).toBe('z-recover'); // 明けていないので継続
    expect(e.x).toBe(e0.x); expect(e.y).toBe(e0.y); // 動かない(下がらない・詰め切って居座る)
    expect(e.vx).toBe(0); expect(e.vy).toBe(0);
  });

  it('★§16-A7条目: z-recover明け→z-retreatへ(硬直が先・後退が後。まだ技の終わりではない)', () => {
    place(60, { aiPhase: 'z-recover', aiPhaseUntil: START_GT, chaffMove: 'zombie-double' });
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).toBe('z-retreat');
    expect(e.chaffMove).toBe('zombie-double'); // 後退も技の続き(まだ終わっていない)
    expect(e.chaffMoveCdUntil).toBeUndefined(); // CDはまだ書かない(後退が終わってから)
    expect(e.vx).toBe(0); expect(e.vy).toBe(0); // 遷移フレームはその場
  });

  it('z-retreat: 150pxより内側では、プレイヤーから離れる向きへ後退する(1.5倍速・慣性つき)', () => {
    // プレイヤーは(ORIGIN,ORIGIN)、敵はplace(dist)で+x側に置かれる→離れる向きは+x側(さらに遠ざかる)。
    const e0 = place(60, { aiPhase: 'z-retreat', chaffMove: 'zombie-double', zombieWalkRampAt: START_GT - 1000 });
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).toBe('z-retreat'); // まだ150pxに届いていない
    expect(e.x).toBeGreaterThan(e0.x); // プレイヤーから離れる向き(+x)へ動いた
    expect(e.vx).toBeGreaterThan(0);
  });

  it('z-retreat: 後退の立ち上がりに慣性がある(遷移直後は遷移前より遅い=0→満速の段差が無い)', () => {
    // 立ち上がり直後(rampAt=START_GTそのもの=経過0ms)と、立ち上がりが終わった後(経過十分)を比較する。
    place(60, { aiPhase: 'z-retreat', chaffMove: 'zombie-double', zombieWalkRampAt: START_GT });
    tick(START_GT);
    const vFresh = Math.hypot(first().vx ?? 0, first().vy ?? 0);
    const eWarm = place(60, { aiPhase: 'z-retreat', chaffMove: 'zombie-double', zombieWalkRampAt: START_GT - 1000 });
    tick(START_GT);
    const vWarm = Math.hypot(first().vx ?? 0, first().vy ?? 0);
    expect(vFresh).toBeLessThan(vWarm); // 立ち上がり直後は遅い(段差なし=慣性が効いている)
    // 立ち上がりが終わった後は満速(enemy.speed × 1.5倍・skeletonと同じ作法)に達している。
    expect(vWarm).toBeCloseTo(eWarm.speed * 1.5, 1);
  });

  it('z-retreat: 150px(得意な距離)に達したら技の終わり=chaffMove消滅+技後CD(約2500ms・±12%)', () => {
    place(ZOMBIE_RETREAT_TARGET_PX, { aiPhase: 'z-retreat', chaffMove: 'zombie-double', zombieWalkRampAt: START_GT - 1000 });
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).toBeUndefined();
    expect(e.aiPhaseUntil).toBeUndefined();
    expect(e.chaffMove).toBeUndefined();
    expect(e.chaffMoveCdUntil).toBeGreaterThanOrEqual(START_GT + 2500 * 0.88);
    expect(e.chaffMoveCdUntil).toBeLessThanOrEqual(START_GT + 2500 * 1.12);
  });

  it('★受け入れ条件(③の全体): 2連の解決から900ms(硬直)の間、ずっと殴り返せる窓が続く(離れるのはその後)', () => {
    // 2発目解決の瞬間から時間を進め、硬直が明けるまで一度も動かず・次の技(chaffMove)にも入らないこと。
    place(60, { aiPhase: 'z-bite2', chaffMove: 'zombie-double', biteAt: 0 });
    tick(START_GT);
    let e = first();
    const x0 = e.x, y0 = e.y;
    for (let t = START_GT + 1 / 60 * 1000; t < START_GT + ZOMBIE_RECOVER_MS; t += 100) {
      tick(t);
      e = first();
      expect(e.aiPhase).toBe('z-recover'); // 硬直の間、次の技(z-red-pause等)へ進んでいない
      expect(e.x).toBe(x0); expect(e.y).toBe(y0); // 下がらない・詰めない
    }
    tick(START_GT + ZOMBIE_RECOVER_MS); // 硬直明け→後退開始(まだ技の終わりではない)
    e = first();
    expect(e.aiPhase).toBe('z-retreat');
    expect(e.chaffMove).toBe('zombie-double');
    expect(e.chaffMoveCdUntil).toBeUndefined(); // CDはまだ(後退が終わっていない)
  });

  it('★60(実距離)は硬直中も150pxより内側=z-retreatへ入った瞬間はまだ後退の途中(離れる方向へ動く)', () => {
    // 硬直で殴り返した後、後退がちゃんと機能して帯へ戻ることを確認する(受け入れ条件7条目)。
    let e = place(60, { aiPhase: 'z-recover', aiPhaseUntil: START_GT, chaffMove: 'zombie-double' });
    tick(START_GT); // → z-retreat
    e = first();
    expect(e.aiPhase).toBe('z-retreat');
    // 十分な時間を与えれば150pxまで離れ、技が終わる。
    let t = START_GT;
    for (let i = 0; i < 600 && first().aiPhase === 'z-retreat'; i++) {
      t += 1000 / 60;
      tick(t);
    }
    e = first();
    expect(e.aiPhase).toBeUndefined(); // 離れきって通常状態へ戻った
    const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
    const dist = Math.hypot(ecx - ORIGIN, ecy - ORIGIN);
    expect(dist).toBeGreaterThanOrEqual(ZOMBIE_RETREAT_TARGET_PX - 1); // 得意な距離まで離れている
  });
});

describe('★§16-A7条目: 紫のループ(zpause→zrush)の後も得意な距離(150px)へ離れる', () => {
  it('zrushが完走(phaseUntil到達)したら、まだ間合いにいてもzpauseへは戻らずz-retreatへ', () => {
    // 旧仕様はここでinMeleeならzpauseへ戻り、90回出ている無限ループの本体だった。
    place(60, { aiPhase: 'zrush', aiPhaseUntil: START_GT }); // 完走した瞬間(密着=inMelee継続)
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).toBe('z-retreat');
    expect(e.chaffMove).toBeUndefined(); // 紫はchaffMove/枠を使わない別系統のまま
  });

  it('紫経由のz-retreatが150pxまで離れきっても、技後CDは新設しない(紫は元々CD無しの仕様)', () => {
    place(ZOMBIE_RETREAT_TARGET_PX, { aiPhase: 'z-retreat', zombieWalkRampAt: START_GT - 1000 });
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).toBeUndefined();
    expect(e.chaffMove).toBeUndefined();
    expect(e.chaffMoveCdUntil).toBeUndefined(); // 赤(zombie-double)経由と違い、CDを焼かない
  });

  it('zrush完走・帯の外(250px)でも、当否を問わずz-retreatへ(仕様統一)', () => {
    place(250, { aiPhase: 'zrush', aiPhaseUntil: START_GT }); // 帯の外で完走した場合もretreatへ
    tick(START_GT);
    expect(first().aiPhase).toBe('z-retreat');
  });
});

describe('★③技後CD: CD中は紫の停止(zpause)にも入らない(§16-3z・実装者視点監査)', () => {
  it('CD中は内縁(100px)に達しても紫の停止に入らない(通常接近のまま)', () => {
    place(90, { chaffMoveCdUntil: START_GT + 2000 }); // 内縁(100px)より内側・CD中
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).not.toBe('zpause');
  });
  it('CDが明ければ同じ距離で紫の停止に入る', () => {
    place(90, { chaffMoveCdUntil: START_GT - 1 });
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).toBe('zpause');
  });
});

describe('★受け入れ条件40: 静止しているプレイヤーに対して空振りが0回', () => {
  it('z-bite1が解決する瞬間、体の重なりがあれば必ず当たる', () => {
    // 敵の当たり判定と完全に重ねて置く(体の重なり=判定。掟2)。
    const e = place(0, { aiPhase: 'z-bite1', chaffMove: 'zombie-double' });
    // 220+160=380ms前に発火していた=このフレームで解決(isBiteResolveDue)。
    useGameStore.setState({ enemies: [{ ...e, biteAt: START_GT - 400 }] });
    const hpBefore = useGameStore.getState().player.health;
    useGameStore.getState().setGameTime(START_GT);
    applyContactDamage(START_GT, false, 0, NOOP_COMBAT_EFFECTS);
    const hpAfter = useGameStore.getState().player.health;
    expect(hpAfter).toBeLessThan(hpBefore); // 当たった
    expect(useGameStore.getState().enemies[0].biteAt).toBe(0); // 台本は解決済み
  });
});

describe('★甲2(主経路の訂正): zrush開始から1600msを越えた最初のフレームで必ず構える', () => {
  it('1600ms経過時点で biteAt が焼かれる(距離を見ない)', () => {
    // aiPhaseUntil = 開始+ZOMBIE_RUSH_MS。1600ms経過=開始+400msがphaseUntil。
    place(500, { aiPhase: 'zrush', aiPhaseUntil: START_GT + (ZOMBIE_RUSH_MS - 1600) });
    tick(START_GT);
    const e = first();
    expect(e.biteAt).toBe(START_GT);
    expect(e.aiPhase).toBe('zrush'); // aiPhaseそのものはまだzrush(phaseUntil未到達)
  });

  it('1600ms未満ではまだ構えない', () => {
    place(500, { aiPhase: 'zrush', aiPhaseUntil: START_GT + (ZOMBIE_RUSH_MS - 1599) });
    tick(START_GT);
    expect(first().biteAt ?? 0).toBe(0);
  });
});
