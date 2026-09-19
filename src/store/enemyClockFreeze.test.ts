// ★PACING_PUZZLE.md §16-H(社長指示2026-09-19「硬直中は全ての時計が止まる」)の受け入れ条件(H-7)。
//
// ★H-7の掟: **純関数単体ではなく、store の実ループを回して測る**。`tickEnemyClockFreeze` を
// 単体で試すと、呼び出し位置・順序・dtスケールの誤りが全部すり抜ける。よってここでは
// `updateEnemies` と各コントローラ(賞金首/フィル/アイドル/幻影)を実際に回す。
import { describe, it, expect } from 'vitest';
import { useGameStore } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { isRecoverHoldPhase, ENEMY_ACTION_CLOCKS } from '../utils/enemyClocks';
import { runBountyTick, createBountyTickState, NOOP_BOUNTY_SFX } from '../utils/bountyTick';
import { runIdolTick, createIdolTickState, NOOP_IDOL_SFX } from '../utils/idolTick';
import { runPhillTick, createAngelBossState, NOOP_ANGEL_SFX } from '../utils/angelBossTick';
import { runPhantomTick, createPhantomTickState, NOOP_PHANTOM_SFX } from '../utils/phantomTick';

const DT = 1 / 60;
/** 既定のゲームスピード(?speed=)。H-7-2 は 1.0 と 1.2 の両方で測る。 */
const SPEEDS = [1.0, 1.2];

/**
 * 敵1体だけを置いた状態を作る(他の敵/演出は挟まない)。
 * ★`make` は **resetGame の後の gameTime** で呼ぶ(先に作ると前のテストの時刻で組んでしまう)。
 */
const setup = (make: (gt: number) => Enemy): number => {
  useGameStore.getState().resetGame('assault');
  const gt = useGameStore.getState().gameTime;
  useGameStore.setState({ enemies: [make(gt)], gameTime: gt });
  return gt;
};

/**
 * useGameLoop と同じ回し方: `gameTime += dt*1000`(**未スケール**)→
 * `updateEnemies(dt * MOVE_SPEED_MULT)`(**スケール済み**)。
 * この非対称が H-1④ の1.2倍ズレの正体なので、テストでも必ずこの形で回す。
 */
const step = (frames: number, speed = 1.2): void => {
  for (let i = 0; i < frames; i++) {
    const gt = useGameStore.getState().gameTime;
    useGameStore.getState().setGameTime(gt + DT * 1000);
    useGameStore.getState().updateEnemies(DT * speed);
  }
};

const only = (): Enemy => useGameStore.getState().enemies[0];
/** 期限型の残り(=`期限 − いまの gameTime`)。「1msも進まない」はこれが不変であること。 */
const remain = (field: keyof Enemy): number =>
  (only()[field] as number) - useGameStore.getState().gameTime;

/** 遠くに置く(追跡・接触・技の発火に巻き込まれないため)。 */
const FAR = 4000;
const mob = (type: EnemyType, gt: number, extra: Partial<Enemy>): Enemy =>
  ({ ...spawnEnemyAt(type, FAR, FAR, gt), ...extra }) as Enemy;

// =================================================================================================
// H-7-1: 硬直中に1msも進まない(a〜e の全ての硬直で、台帳のフィールドの残り時間が不変)
// =================================================================================================
describe('★H-7-1 硬直中は行動の時計が1msも進まない(a〜e)', () => {
  const cases: { name: string; make: (gt: number) => Enemy }[] = [
    {
      name: '(a)技後の硬直相(パンプキンの着地硬直)',
      make: gt => mob('pumpkin', gt, {
        aiPhase: 'recover', aiPhaseUntil: gt + 100000,
        aiReadyAt: gt + 5000, biteReadyAt: gt + 3000, chaffMoveCdUntil: gt + 7000,
      }),
    },
    {
      name: '(b)噛みつき直後の硬直(biteRecoverUntil)',
      make: gt => mob('zombie', gt, {
        biteRecoverUntil: gt + 100000, biteAt: 0,
        aiReadyAt: gt + 5000, biteReadyAt: gt + 3000, chaffMoveCdUntil: gt + 7000,
      }),
    },
    {
      name: '(c)被弾硬直(hitStunUntil・技を出していない個体)',
      make: gt => mob('skeleton', gt, {
        hitStunUntil: Date.now() + 100000, biteAt: 0,
        aiReadyAt: gt + 5000, biteReadyAt: gt + 3000, chaffMoveCdUntil: gt + 7000,
      }),
    },
    {
      name: '(d)気絶(stunUntil)',
      make: gt => mob('bat', gt, {
        stunUntil: gt + 100000,
        aiReadyAt: gt + 5000, biteReadyAt: gt + 3000, chaffMoveCdUntil: gt + 7000,
      }),
    },
    {
      name: '(d)紫の完全気絶(bossFullStunUntil)',
      make: gt => mob('giantbat', gt, {
        bossFullStunUntil: gt + 100000, stunUntil: gt + 100000,
        aiReadyAt: gt + 5000, gStompReadyAt: gt + 4000,
        gStageReadyAt: { bite: gt + 9000, slam: gt + 11000 },
      }),
    },
    {
      name: '(e)拘束(rootUntil)',
      make: gt => mob('zombie', gt, {
        rootUntil: gt + 100000,
        aiReadyAt: gt + 5000, biteReadyAt: gt + 3000, chaffMoveCdUntil: gt + 7000,
      }),
    },
    {
      name: '(e)持ち上げ(liftUntil・Date.now系)',
      make: gt => mob('zombie', gt, {
        liftUntil: Date.now() + 100000,
        aiReadyAt: gt + 5000, biteReadyAt: gt + 3000, chaffMoveCdUntil: gt + 7000,
      }),
    },
  ];

  for (const c of cases) {
    it(`${c.name}: 残り時間が60フレーム回しても不変`, () => {
      setup(c.make);
      step(1); // 1フレーム目で預かりが立つ。基準はここで測る。
      const gt0 = useGameStore.getState().gameTime;
      const before = {
        aiReadyAt: remain('aiReadyAt'),
        biteReadyAt: only().biteReadyAt !== undefined ? remain('biteReadyAt') : undefined,
        chaffMoveCdUntil: only().chaffMoveCdUntil !== undefined ? remain('chaffMoveCdUntil') : undefined,
        stage: only().gStageReadyAt?.bite !== undefined ? (only().gStageReadyAt?.bite ?? 0) - gt0 : undefined,
      };
      step(60);
      const gt1 = useGameStore.getState().gameTime;
      expect(remain('aiReadyAt')).toBeCloseTo(before.aiReadyAt, 6);
      if (before.biteReadyAt !== undefined) expect(remain('biteReadyAt')).toBeCloseTo(before.biteReadyAt, 6);
      if (before.chaffMoveCdUntil !== undefined) expect(remain('chaffMoveCdUntil')).toBeCloseTo(before.chaffMoveCdUntil, 6);
      if (before.stage !== undefined) {
        // マップ型(城ボスの技ごとCD)も畳む。
        expect((only().gStageReadyAt?.bite ?? 0) - gt1).toBeCloseTo(before.stage, 6);
      }
      // 実際に時間は進んでいる(=「回っていないから不変」ではない)。
      expect(gt1 - gt0).toBeGreaterThan(900);
    });
  }
});

// =================================================================================================
// H-7-2: 明けた瞬間に定義値と一致(★?speed= を 1.0 と 1.2 の両方で=H-1④の1.2倍ズレの再発防止)
// =================================================================================================
describe('★H-7-2 硬直が明けた瞬間、その時点を0としてCDが始まる', () => {
  for (const speed of SPEEDS) {
    it(`?speed=${speed}: 気絶(500ms)が明けた直後の残りが、入った時の残り(3000ms)と一致する`, () => {
      setup(gt0 => mob('zombie', gt0, {
        stunUntil: gt0 + 500, aiReadyAt: gt0 + 3000, biteReadyAt: gt0 + 3000,
      }));
      step(1, speed);                    // 1フレーム目で預かりが立つ(基準)
      const rem0 = remain('aiReadyAt');
      step(29, speed);                   // 合計30フレーム=ちょうど500ms=気絶が明けるフレーム
      const e = only();
      const nowGt = useGameStore.getState().gameTime;
      expect(nowGt).toBeCloseTo(e.stunUntil ?? 0, 3); // ちょうど明けたフレームで測っている
      // ★「明けた瞬間 + 預かった残り」。速度倍率が違っても同じ値になる(H-1④の1.2倍ズレ防止)。
      expect((e.aiReadyAt ?? 0) - nowGt).toBeCloseTo(rem0, 6);
      expect((e.biteReadyAt ?? 0) - nowGt).toBeCloseTo(rem0, 6);
      expect(rem0).toBeCloseTo(3000 - DT * 1000, 6);
    });
  }

  it('★1.0 と 1.2 で同じ結果になる(dtスケールが結果に混ざっていない)', () => {
    const run = (speed: number): number => {
      setup(gt0 => mob('zombie', gt0, { stunUntil: gt0 + 500, aiReadyAt: gt0 + 3000 }));
      step(30, speed);
      const e = only();
      return (e.aiReadyAt ?? 0) - (e.stunUntil ?? 0); // 明けを基準にした残り
    };
    // 預かりが立つのは1フレーム目なので基準は 3000 − 1フレーム。**倍率で1msも変わらない**のが肝。
    expect(run(1.0)).toBeCloseTo(3000 - DT * 1000, 3);
    expect(run(1.2)).toBeCloseTo(3000 - DT * 1000, 3);
    expect(run(1.0)).toBeCloseTo(run(1.2), 6);
  });
});

// =================================================================================================
// H-7-3: 硬直そのものは必ず明ける(除外1/除外2を相ごとに照合)
// =================================================================================================
describe('★H-7-3 硬直そのものは必ず明ける(除外1/除外2)', () => {
  it('★パンプキンは着地硬直から必ず立ち上がる(除外2の型・アンカー)', () => {
    setup(gt0 => mob('pumpkin', gt0, {
      aiPhase: 'recover', aiPhaseUntil: gt0 + 300, biteReadyAt: gt0 - 1, aiReadyAt: gt0 - 1,
    }));
    step(60);
    const e = only();
    expect(e.aiPhase).toBeUndefined();                       // 立ち上がった
    expect(e.frozenClocks).toBeUndefined();                  // 預かりも片付いている
    // ★#H-4(社長裁定・案A): 硬直明けは噛みつきにも猶予(PUMPKIN_COOLDOWN_MS)が入る。
    expect((e.biteReadyAt ?? 0)).toBeGreaterThan(e.aiPhaseUntil ?? 0);
    expect((e.aiReadyAt ?? 0)).toBeGreaterThan(e.aiPhaseUntil ?? 0);
  });

  it('全ての recover 系の相で aiPhaseUntil / bossStateUntil が据え置かれない(除外2)', () => {
    for (const phase of ['recover', 's-recover', 'z-recover', 'b-release', 'z-stagger',
      'g-slam-recover', 'driller-thrust-recover', 'logger-sweep-recover', 'dash-recover'] as const) {
      expect(isRecoverHoldPhase(phase)).toBe(true);
      setup(gt0 => mob('zombie', gt0, { aiPhase: phase as Enemy['aiPhase'], aiPhaseUntil: gt0 + 200 }));
      step(3);
      const e = only();
      // 据え置いていれば「残り200ms」のまま動かない=硬直が永久に明けない。
      expect((e.aiPhaseUntil ?? 0) - useGameStore.getState().gameTime).toBeLessThan(200);
    }
  });

  it('bossState の recover も同じ(ボス側の除外2)', () => {
    setup(gt0 => mob('thor', gt0, { bossState: 'thor-dash-recover', bossStateUntil: gt0 + 200 }));
    step(3);
    expect((only().bossStateUntil ?? 0) - useGameStore.getState().gameTime).toBeLessThan(200);
  });

  it('b-release は「留まり」の間だけ凍る(後ずさりは移動=凍らせない・H-4(a))', () => {
    setup(gt0 => mob('bat', gt0, {
      aiPhase: 'b-release', aiPhaseUntil: gt0 + 200,
      chaffMove: 'bat-grab', aiReadyAt: gt0 + 5000,
    }));
    step(1);
    const rem0 = remain('aiReadyAt');
    step(6); // まだ留まり(約100ms)
    expect(remain('aiReadyAt')).toBeCloseTo(rem0, 6);
    step(60); // 留まりが明けた後は普通に進む
    expect(remain('aiReadyAt')).toBeLessThan(rem0 - 500);
  });

  it('除外1(硬直そのものの期限)は台帳に入っていない', () => {
    const fields = ENEMY_ACTION_CLOCKS.map(c => c.field);
    for (const f of ['stunUntil', 'bossFullStunUntil', 'hitStunUntil', 'biteRecoverUntil',
      'rootUntil', 'liftUntil', 'knockbackUntil']) {
      expect(fields).not.toContain(f);
    }
  });

  it('気絶は実際に明ける(据え置きの巻き添えで伸びない)', () => {
    const gt0 = setup(g => mob('zombie', g, { stunUntil: g + 300, aiReadyAt: g + 3000 }));
    step(60);
    expect(only().stunUntil).toBe(gt0 + 300);
    expect(useGameStore.getState().gameTime).toBeGreaterThan(gt0 + 300);
  });
});

// =================================================================================================
// H-7-4: ノックバックでは止まらない(f の機械化)
// =================================================================================================
describe('★H-7-4 ノックバックは凍結に含めない(社長裁定 H-4 (f))', () => {
  for (const type of ['zombie', 'bat', 'skeleton', 'giantbat'] as const) {
    it(`${type}: ノックバック中もCDは普通に進む`, () => {
      setup(gt0 => mob(type, gt0, {
        knockbackUntil: Date.now() + 100000, knockbackVx: 10, knockbackVy: 0,
        aiReadyAt: gt0 + 5000, biteReadyAt: gt0 + 3000,
      }));
      step(1);
      const before = remain('aiReadyAt');
      step(60);
      expect(remain('aiReadyAt')).toBeLessThan(before - 900); // 1秒ぶん減っている=止まっていない
      expect(only().frozenClocks).toBeUndefined();            // 預かりも作られない
    });
  }
});

// =================================================================================================
// H-7-5: ボスも対象(型名で列挙)+ モジュール状態の4コントローラ
// =================================================================================================
describe('★H-7-5 ボスも対象(城ボス/天使6体/トール/賞金首4体/フィル/アイドル)', () => {
  const BOSS_TYPES: EnemyType[] = [
    'giantbat',                                             // 城ボス
    'miguel', 'jibril', 'rafi', 'uri', 'suriel', 'acrasiel', // 天使6体
    'thor',                                                  // トール
    'bounty-ranged', 'bounty-melee', 'bounty-balance', 'bounty-maiko', // 賞金首4体
    'phillboss',                                             // フィル
    'idol',                                                  // アイドル
    'mimir', 'jormungand', 'skadi',                          // 裏ボス(同じ器)
    'guardian-phantom',                                      // 幻影
  ];
  for (const type of BOSS_TYPES) {
    it(`${type}: 紫(完全気絶)の間 bossNextActionAt の残りが不変`, () => {
      setup(gt0 => mob(type, gt0, {
        bossFullStunUntil: gt0 + 100000, stunUntil: gt0 + 100000,
        bossNextActionAt: gt0 + 2500, bossStateUntil: gt0 + 1800, bossState: 'chase',
      }));
      step(1);
      const before = remain('bossNextActionAt');
      const beforeState = remain('bossStateUntil');
      step(60);
      expect(remain('bossNextActionAt')).toBeCloseTo(before, 6);
      expect(remain('bossStateUntil')).toBeCloseTo(beforeState, 6);
    });
  }
});

describe('★H-7-5b Enemy に無い時計(コントローラのモジュール状態)も止まる', () => {
  /** コントローラを毎フレーム回すヘルパ(useGameLoop と同じ形: gameTime は未スケールで進める)。 */
  const driveController = (
    run: (e: Enemy, gt: number, nowMs: number) => void, gt0: number,
  ) => {
    let gt = gt0;
    const tick = (): void => {
      gt += DT * 1000;
      useGameStore.setState({ gameTime: gt });
      run(only(), gt, Date.now());
    };
    return { tick, now: () => gt };
  };

  it('賞金首(bountyTick): tripleReadyAt / pushReadyAt / brCycleEndAt', () => {
    const gt0 = setup(g => mob('bounty-ranged', g, {
      bossFullStunUntil: g + 100000, stunUntil: g + 100000, bossState: 'chase', dormant: false,
    }));
    const s = createBountyTickState();
    s.activeId = only().id;
    s.tripleReadyAt = gt0 + 6000; s.pushReadyAt = gt0 + 2000; s.brCycleEndAt = gt0 + 4000;
    const d = driveController((e, gt, nowMs) => runBountyTick(e, s, gt, DT, 1.2, nowMs, NOOP_BOUNTY_SFX), gt0);
    d.tick();
    const before = [s.tripleReadyAt - d.now(), s.pushReadyAt - d.now()];
    for (let i = 0; i < 30; i++) d.tick();
    expect(s.tripleReadyAt - d.now()).toBeCloseTo(before[0], 6);
    expect(s.pushReadyAt - d.now()).toBeCloseTo(before[1], 6);
    // ★`brCycleEndAt`(射撃サイクルの次弾時刻)は**紫/気絶では捨てられる**のが元からの仕様
    // (`cancelBountyTechnique`・v0.25.3476「止められたら技を中断」)。凍結はそれと争わない——
    // 外から書かれた時計は相手が勝つ、が§16-Hの作法。捨てられた後は0のまま(=次の中立で引き直す)。
    expect(s.brCycleEndAt).toBe(0);
  });

  it('アイドル(idolTick): shotNextAt', () => {
    const gt0 = setup(g => mob('idol', g, {
      bossFullStunUntil: g + 100000, stunUntil: g + 100000, bossState: 'chase', dormant: false,
    }));
    const s = createIdolTickState();
    s.shotNextAt = gt0 + 1500;
    const d = driveController((e, gt) => runIdolTick(e, s, gt, DT, 1.2, NOOP_IDOL_SFX, true, () => {}), gt0);
    d.tick();
    const before = s.shotNextAt - d.now();
    for (let i = 0; i < 30; i++) d.tick();
    expect(s.shotNextAt - d.now()).toBeCloseTo(before, 6);
  });

  it('フィル(angelBossTick): 4大技CD + 共通ゲート', () => {
    const gt0 = setup(g => mob('phillboss', g, {
      bossFullStunUntil: g + 100000, stunUntil: g + 100000, bossState: 'chase', dormant: false,
    }));
    const s = createAngelBossState();
    s.phill.lightrainReadyAt = gt0 + 5000;
    s.phill.goldringReadyAt = gt0 + 6000;
    s.phill.judgmentReadyAt = gt0 + 7000;
    s.phill.cageReadyAt = gt0 + 8000;
    s.phill.requiredReadyAt = gt0 + 4000;
    const d = driveController((e, gt) => runPhillTick(e, s, gt, DT, 1.2, NOOP_ANGEL_SFX, () => {}), gt0);
    d.tick();
    const keys = ['lightrainReadyAt', 'goldringReadyAt', 'judgmentReadyAt', 'cageReadyAt', 'requiredReadyAt'] as const;
    const before = keys.map(k => s.phill[k] - d.now());
    for (let i = 0; i < 30; i++) d.tick();
    keys.forEach((k, i) => expect(s.phill[k] - d.now()).toBeCloseTo(before[i], 6));
  });

  it('幻影(phantomTick): 近接周期 / リロード / decideGhost の内部CD(Date.now系)', () => {
    const gt0 = setup(g => mob('guardian-phantom', g, { stunUntil: g + 100000, dormant: false }));
    const s = createPhantomTickState();
    s.activeId = only().id;
    s.nextMeleeAt = gt0 + 900;
    s.reloadEndsAt = Date.now() + 1200;
    s.ghost.lastShotAt = Date.now() - 400;
    const d = driveController((e, gt, nowMs) => runPhantomTick(e, s, gt, DT, 1.2, nowMs, NOOP_PHANTOM_SFX), gt0);
    d.tick();
    const beforeMelee = s.nextMeleeAt - d.now();
    const beforeReload = s.reloadEndsAt - Date.now();
    for (let i = 0; i < 30; i++) d.tick();
    expect(s.nextMeleeAt - d.now()).toBeCloseTo(beforeMelee, 6);
    // Date.now系(リロード/内部CD)も据え置く。実時間は数ms進むので幅を持って見る。
    expect(s.reloadEndsAt - Date.now()).toBeGreaterThan(beforeReload - 60);
  });
});

// =================================================================================================
// H-7-6: 予告と判定が割れない(除外3のフィールドは1msも動かない)
// =================================================================================================
describe('★H-7-6 予告済みの命中予約(除外3)は凍結で1msも動かない', () => {
  it('giantDelayedHits / punisherPendingAt / glenVolleyAt / bossBurstNextAt / lanceLanterns', () => {
    const gt0 = setup(g => mob('giantbat', g, {
      stunUntil: g + 100000, bossFullStunUntil: g + 100000,
      giantDelayedHits: [{ fireAt: g + 700, x: 0, y: 0, radius: 10, damage: 1, bornAt: g, burst: true }],
      glenVolleyAt: g + 600,
      bossBurstNextAt: g + 250,
      lanceLanterns: [{ x: 0, y: 0, dir: 0, bornAt: g, estFireAt: g + 800 }],
    }));
    step(30);
    const e = only();
    expect(e.giantDelayedHits?.[0].fireAt).toBe(gt0 + 700);
    expect(e.giantDelayedHits?.[0].bornAt).toBe(gt0);
    expect(e.glenVolleyAt).toBe(gt0 + 600);
    expect(e.bossBurstNextAt).toBe(gt0 + 250);
    expect(e.lanceLanterns?.[0].estFireAt).toBe(gt0 + 800);
  });

  it('台帳に除外3のフィールドが混ざっていない(検知器)', () => {
    const fields = ENEMY_ACTION_CLOCKS.map(c => c.field);
    for (const f of ['giantDelayedHits', 'lanceLanterns', 'punisherPendingAt', 'glenVolleyAt',
      'bossBurstNextAt', 'gpPendingSwingAt', 'lichWarpAt']) {
      expect(fields).not.toContain(f);
    }
  });
});

// =================================================================================================
// H-7-7: 気絶で aiPhase を中断した個体の aiReadyAt が「気絶明け +300ms ちょうど」(二重適用の検知)
// =================================================================================================
describe('★H-7-7 気絶で技を中断した個体の aiReadyAt は気絶明け+300msちょうど', () => {
  for (const speed of SPEEDS) {
    it(`?speed=${speed}`, () => {
      setup(gt0 => mob('pumpkin', gt0, {
        aiPhase: 'crouch', aiPhaseUntil: gt0 + 2000, stunUntil: gt0 + 500,
      }));
      step(60, speed);
      const e = only();
      expect(e.aiPhase).toBeUndefined();
      // 旧実装(`enemy.stunUntil + 300`)+凍結だと「気絶明け+800ms」まで伸びる=二重適用。
      expect((e.aiReadyAt ?? 0) - (e.stunUntil ?? 0)).toBeCloseTo(300, 0);
    });
  }
});
