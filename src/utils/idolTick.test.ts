// v0.25.2614(社長報告「ボスモードだからかな？アイドル動かない」): 盤面にアイドルが2体並んだ時の選択。
//
// 事故: ラボ資料のステージでは `resetGame` が**固定・休眠のアイドル**を最奥に置く。そこへ `?idolnow=1`
// が**2体目**をプレイヤーの近くへ強制召喚するので、アイドルが2体並ぶ。コントローラは
// `enemies.find(e => e.type === 'idol')` で**配列の先頭1体しか見ていなかった**ため、先に置かれた
// 遠くの休眠個体が拾われて起床判定に落ち、`runIdolTick` が一度も呼ばれない
// ⇒ **プレイヤーの隣にいる2体目が誰にも動かされず、完全に静止していた。**
//
// 対策は2段構え: ①強制召喚の側で既存アイドルを消してから出す(呼び出し側・useGameLoop)
//              ②ここで起きている個体を優先して選ぶ(万一2体並んでも動く方が制御される)
//
// v0.25.2625: ボスメーカーの「個別再生」を**状態機械ごと**検証する describe を末尾に追加。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  pickActiveIdol,
  runIdolTick, createIdolTickState, NOOP_IDOL_SFX,
  requestIdolMovePlay, requestIdolVerbPlay, requestIdolLeapPlay, idolPlaybackActive, getIdolPlayback, clearIdolPlayback,
} from './idolTick';
import { clampRectToPlayableArea } from '../world/playableArea';
import { LAB_CORRIDOR_Y_LIMIT_PX, labWallsInRegionRaw, labPropsInRegionRaw, wallRect, propRect } from '../world/labWalls';
import { useGameStore } from '../store/gameStore';
import { spawnEnemyAt } from './enemyUtils';
import { IDOL_TUNING, idolGunMuzzle, idolLeapLanding, idolLeapGroundEase, idolLeapLiftPx, idolAirLiftOf } from './idolScript';
import { isEnemyFrozenForClocks } from './enemyClocks';
import { HEAVY_GRENADE_FUSE_MS, HEAVY_GRENADE_DAMAGE, HEAVY_GRENADE_SPEED } from './grenadeSpec';
import type { Enemy } from '../types/game';

const mk = (id: string, dormant: boolean): Enemy =>
  ({ id, type: 'idol', dormant } as unknown as Enemy);

describe('pickActiveIdol: 2体並んでも「動く方」を制御する', () => {
  it('起きている個体を優先する(配列の後ろにいても)', () => {
    expect(pickActiveIdol([mk('fixed', true), mk('forced', false)])?.id).toBe('forced');
  });

  it('起きている個体が先頭でも同じ', () => {
    expect(pickActiveIdol([mk('forced', false), mk('fixed', true)])?.id).toBe('forced');
  });

  it('休眠しかいなければ先頭を返す(従来どおり起床判定に回す=通常プレイは不変)', () => {
    expect(pickActiveIdol([mk('a', true), mk('b', true)])?.id).toBe('a');
  });

  it('アイドルが居なければ undefined(他の敵は拾わない)', () => {
    expect(pickActiveIdol([{ id: 'z', type: 'zombie' } as unknown as Enemy])).toBeUndefined();
    expect(pickActiveIdol([])).toBeUndefined();
  });

  it('通常プレイ(アイドル1体)は従来どおりその1体を返す', () => {
    expect(pickActiveIdol([mk('only', true)])?.id).toBe('only');
    expect(pickActiveIdol([mk('only', false)])?.id).toBe('only');
  });
});

// v0.25.2617(社長報告「m2は移動できる範囲が限られてるのに、ボスだけその外に移動してる」):
// ボスはプレイヤーが行けない場所へ出てはいけない。ステージ2は横長廊下で、プレイヤー中心Yが
// ±LAB_CORRIDOR_Y_LIMIT_PX(=200)にクランプされる。idolTick は生の座標を書いていたため帯を越えていた。
// ここでは「行ける帯の定義が1本であること」(プレイヤーとボスが同じ純関数を通ること)を固定する。
describe('憲法: ボスはプレイヤーの行ける帯の外へ出ない', () => {
  const ctx = {
    farBackdrop: 'lab', labTheme: true, corridorMode: false,
    m0AdvanceLimitX: null, corridorRunInActive: false,
  };

  it('廊下帯の外へ出ようとした座標は帯の内側へ戻される(上下とも)', () => {
    const h = 20;
    const up = clampRectToPlayableArea(0, -5000, 40, h, ctx);
    const down = clampRectToPlayableArea(0, 5000, 40, h, ctx);
    // 中心Y = y + h/2 が ±200 に収まる。
    expect(up.y + h / 2).toBeGreaterThanOrEqual(-LAB_CORRIDOR_Y_LIMIT_PX);
    expect(down.y + h / 2).toBeLessThanOrEqual(LAB_CORRIDOR_Y_LIMIT_PX);
  });

  it('帯の中の座標は動かさない(通常の移動を邪魔しない)', () => {
    const inside = clampRectToPlayableArea(1234, 0, 40, 20, ctx);
    expect(inside).toEqual({ x: 1234, y: 0 });
  });

  it('横(X)は制限しない=廊下は横に長い', () => {
    expect(clampRectToPlayableArea(999999, 0, 40, 20, ctx).x).toBe(999999);
    expect(clampRectToPlayableArea(-999999, 0, 40, 20, ctx).x).toBe(-999999);
  });

  it('ラボ以外のステージでは何も制限しない(idolのデバッグ召喚が他ステージで動けなくならない)', () => {
    const free = { ...ctx, farBackdrop: 'city', labTheme: false };
    expect(clampRectToPlayableArea(0, 5000, 40, 20, free)).toEqual({ x: 0, y: 5000 });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// v0.25.2625 ボスメーカーの「個別再生」(社長要望)。
// パネル(React)は要求箱(module変数)へ積むだけなので、ここでは要求→tick→状態遷移を実際に回して確かめる。
// ───────────────────────────────────────────────────────────────────────────

const DT = 1 / 60;

/** アイドル1体+プレイヤーの盤面を作り、tickを回すヘルパ。 */
const setup = (distance: number) => {
  useGameStore.getState().resetGame('assault');
  const e = spawnEnemyAt('idol', 0, -distance, 0);
  e.fromEvent = true; e.dormant = false; e.bossState = 'chase'; e.bossPhase = 1;
  e.bossNextActionAt = Number.MAX_SAFE_INTEGER; // 自発的な抽選を止める=強制発動だけを見る
  useGameStore.setState(s => ({
    enemies: [e], projectiles: [], pumpkinBlasts: [],
    // 進軍NPC(出撃地点の周り=画面内)はボスの狙いの候補になる(research/ESCORT_TARGETED.md §5・開幕は一番近い相手)。この試験は
    // 「狙い=プレイヤー」の予告向きだけを見るので外す(軍人の狙いは escortTargeted.store.test.ts / bossHateEscort.test.ts)。
    escorts: [],
    player: { ...s.player, x: 0, y: 0, health: 9999, maxHealth: 9999 },
  }));
  const st = createIdolTickState();
  let gt = 0;
  const step = (ms = DT * 1000): void => {
    gt += ms;
    useGameStore.setState({ gameTime: gt });
    const cur = useGameStore.getState().enemies[0];
    if (cur) runIdolTick(cur, st, gt, ms / 1000, 1, NOOP_IDOL_SFX, false, () => {});
  };
  const state = (): string => useGameStore.getState().enemies[0]?.bossState ?? '(なし)';
  const pos = (): { x: number; y: number } => {
    const b = useGameStore.getState().enemies[0];
    return { x: b.x, y: b.y };
  };
  return { st, step, state, pos, now: () => gt };
};

describe('個別再生: 技を1つだけ強制発動できる', () => {
  beforeEach(() => { clearIdolPlayback(); vi.useRealTimers(); });

  it('CD・距離帯・抽選をバイパスして、押した技が即座に始まる', () => {
    // 密着(60px)= 台本上は狙撃線が出ない帯。それでも強制なら出る。
    const g = setup(60);
    g.step();
    expect(g.state()).toBe('chase');
    requestIdolMovePlay('snipe', { solo: false, loop: false });
    g.step();
    expect(g.state()).toBe('idol-snipe-windup');
  });

  it('6技すべてを強制発動できる', () => {
    for (const m of ['aim', 'fan', 'roll', 'punch', 'snipe', 'orb'] as const) {
      clearIdolPlayback();
      const g = setup(250);
      g.step();
      requestIdolMovePlay(m, { solo: false, loop: false });
      g.step();
      expect(g.state(), m).toBe(`idol-${m}-windup`);
    }
  });

  // ★実バグの教訓(v0.25.2625・実装精度の規律6「教訓は即機械化」):
  // 呼び出し側は `useRef(createIdolTickState())` の形で持つが、**useRefの引数は毎レンダー評価される**。
  // ここに `clearIdolPlayback()` の副作用を入れていたため、パネルが再描画するたびに要求箱が空になり、
  // ▶を押しても技が1フレームで止まって固まった(実機で再現・原因特定まで到達)。
  it('★教訓: createIdolTickState は再生要求を消さない(副作用を持たない)', () => {
    requestIdolMovePlay('aim', { solo: true, loop: false });
    expect(idolPlaybackActive()).toBe(true);
    createIdolTickState();                    // = パネルが再描画するたびに起きること
    expect(idolPlaybackActive()).toBe(true);  // ここが false になると▶が死ぬ
  });

  it('★掟: 強制発動の前に、進行中のストリング・第二波・懲罰シグナルがリセットされる', () => {
    const g = setup(250);
    // 途中まで進んだ状態を人工的に作る
    g.st.seq = ['fan', 'fan', 'orb']; g.st.step = 2; g.st.wavePending = true;
    g.st.farSince = 5000; g.st.meleeSince = 5000; g.st.angleSince = 5000;
    requestIdolMovePlay('punch', { solo: false, loop: false });
    g.step();
    expect(g.st.seq).toEqual([]);
    expect(g.st.step).toBe(0);
    expect(g.st.wavePending).toBe(false);
    expect(g.st.farSince).toBe(0);
    expect(g.st.meleeSince).toBe(0);
    expect(g.st.angleSince).toBe(0);
  });

  it('単独再生(solo)は硬直明けで中立へ戻り、ストリングへ続かない', () => {
    const g = setup(250);
    g.step();
    requestIdolMovePlay('aim', { solo: true, loop: false });
    g.step();
    expect(idolPlaybackActive()).toBe(true);
    // 予告700 + 硬直900 を跨ぐまで進め、「再生が終わった瞬間」を捕まえる。
    // (停止中はここで useGameLoop が tick を呼ばなくなる=そのまま止まる。
    //  再生中でない時間まで回し続けると通常の抽選が再開するのは*正しい*挙動なので、
    //  観測窓は終了時点までにする。)
    let endedAt = -1;
    for (let i = 0; i < 200; i++) {
      g.step(20);
      if (!idolPlaybackActive()) { endedAt = g.now(); break; }
    }
    expect(endedAt).toBeGreaterThan(0);
    expect(g.state()).toBe('chase');          // 硬直明けで中立へ戻る
    expect(g.st.seq).toEqual([]);             // ストリングへ続いていない
    // 予告700+硬直900=1600ms 付近で終わる(1技ぶんだけ再生された証拠)
    expect(endedAt).toBeGreaterThan(1500);
    expect(endedAt).toBeLessThan(2200);
  });

  it('ループ再生ONなら同じ技を繰り返す', () => {
    const g = setup(250);
    g.step();
    requestIdolMovePlay('aim', { solo: true, loop: true });
    g.step();
    for (let i = 0; i < 200; i++) g.step(20);
    // 1回では終わらず、常にaimのどこかの州に居る
    expect(g.state().startsWith('idol-aim-')).toBe(true);
    expect(getIdolPlayback().loop).toBe('aim');
  });

  it('ループ中に同じ▶をもう一度押すと止まる(トグル)', () => {
    const g = setup(250);
    g.step();
    requestIdolMovePlay('aim', { solo: true, loop: true });
    g.step();
    expect(getIdolPlayback().loop).toBe('aim');
    requestIdolMovePlay('aim', { solo: true, loop: true }); // 同じ技=停止
    g.step();
    expect(getIdolPlayback().loop).toBeNull();
    expect(idolPlaybackActive()).toBe(false);
    expect(g.state()).toBe('chase');
  });
});

describe('個別再生: 移動語彙を維持できる', () => {
  beforeEach(() => { clearIdolPlayback(); });

  it('「離れる」を維持すると、プレイヤーから遠ざかり続ける(技は出ない)', () => {
    const g = setup(250);
    g.step();
    requestIdolVerbPlay('retreat');
    g.step();
    const before = g.pos();
    for (let i = 0; i < 60; i++) g.step();
    const after = g.pos();
    // プレイヤーは原点。アイドルは上(-y)に居るので、離れる=yがさらに小さくなる。
    expect(after.y).toBeLessThan(before.y);
    expect(g.state()).toBe('chase'); // 技は出ない=その動きだけを見られる
  });

  it('「詰める」を維持すると近づく', () => {
    const g = setup(250);
    g.step();
    requestIdolVerbPlay('close');
    g.step();
    const before = g.pos();
    for (let i = 0; i < 60; i++) g.step();
    expect(g.pos().y).toBeGreaterThan(before.y);
  });

  it('「止まる」を維持すると動かない', () => {
    const g = setup(250);
    g.step();
    requestIdolVerbPlay('hold');
    g.step();
    const before = g.pos();
    for (let i = 0; i < 60; i++) g.step();
    expect(g.pos().x).toBeCloseTo(before.x, 3);
    expect(g.pos().y).toBeCloseTo(before.y, 3);
  });

  it('同じ語彙をもう一度押すと解除される(トグル)', () => {
    const g = setup(250);
    g.step();
    requestIdolVerbPlay('retreat');
    g.step();
    expect(getIdolPlayback().verb).toBe('retreat');
    requestIdolVerbPlay('retreat');
    g.step();
    expect(getIdolPlayback().verb).toBeNull();
    expect(idolPlaybackActive()).toBe(false);
  });

  // ★実バグ(v0.25.2625・実機で発見): 語彙を解除した時に bossNextActionAt を MAX のままにしていたため、
  // 「再生をやめたのにボスが二度と技を出さない」状態で置き去りになった。解除=通常の中立へ必ず戻す。
  it('★語彙を解除したら通常の抽選が再開する(置き去りにしない)', () => {
    const g = setup(250);
    g.step();
    requestIdolVerbPlay('retreat');
    g.step();
    const held = useGameStore.getState().enemies[0].bossNextActionAt ?? 0;
    expect(held).toBe(Number.MAX_SAFE_INTEGER); // 維持中は抽選しない
    requestIdolVerbPlay('retreat'); // 解除
    g.step();
    const freed = useGameStore.getState().enemies[0].bossNextActionAt ?? 0;
    expect(freed).toBeLessThan(Number.MAX_SAFE_INTEGER);
    // 解除後は普通に技が出る(=止まったままにならない)
    for (let i = 0; i < 120; i++) g.step(20);
    expect(g.state()).not.toBe('chase');
  });

  it('技を再生すると維持中の語彙は解除される(混ざらない)', () => {
    const g = setup(250);
    g.step();
    requestIdolVerbPlay('strafe');
    g.step();
    requestIdolMovePlay('orb', { solo: false, loop: false });
    g.step();
    expect(getIdolPlayback().verb).toBeNull();
    expect(g.state()).toBe('idol-orb-windup');
  });
});

// v0.25.2628(社長指示「弾速度とか個別にしないと」): 弾の性能は**技ごと**。
// ★勘所: `createEnemyProjectile` は size から x/y を逆算する(中心合わせ)ので、
// **生成後に上書きすると弾の位置がズレる**。生成時に渡していることをここで固定する。
describe('弾の性能は技ごとに効く', () => {
  beforeEach(() => { clearIdolPlayback(); });

  /** 指定の技を強制発動し、最初に出た敵弾を返す(予告が明けるまで進める)。 */
  const fireAndGrab = (move: 'aim' | 'fan') => {
    const g = setup(250);
    g.step();
    requestIdolMovePlay(move, { solo: false, loop: false });
    for (let i = 0; i < 200; i++) {
      g.step(20);
      const ps = useGameStore.getState().projectiles.filter(p => p.hostile);
      if (ps.length > 0) return { g, p: ps[0], boss: useGameStore.getState().enemies[0] };
    }
    throw new Error(`${move} の弾が出なかった`);
  };

  it('技ごとに弾速・大きさ・威力が変わる(狙い撃ち=速い / 連射扇=遅い が作れる)', () => {
    const bul = IDOL_TUNING.bullet;
    const save = JSON.stringify(bul);
    try {
      bul.aim.speed = 700; bul.aim.size = 40; bul.aim.damage = 55;
      bul.fan.speed = 90;  bul.fan.size = 8;  bul.fan.damage = 3;

      const a = fireAndGrab('aim');
      expect(a.p.speed).toBe(700);
      expect(a.p.width).toBe(40);
      expect(a.p.height).toBe(40);
      expect(a.p.damage).toBe(55);

      clearIdolPlayback();
      const f = fireAndGrab('fan');
      expect(f.p.speed).toBe(90);
      expect(f.p.width).toBe(8);
      expect(f.p.damage).toBe(3);
    } finally { Object.assign(IDOL_TUNING.bullet, JSON.parse(save)); }
  });

  it('★大きさを変えても弾の中心は銃口のまま(生成時に渡している証拠・社長指示v0.25.3439)', () => {
    const bul = IDOL_TUNING.bullet;
    const save = JSON.stringify(bul);
    try {
      bul.aim.size = 48; // 既定16から大きく変える
      const { p, boss } = fireAndGrab('aim');
      // 起点=銃口(立ち絵の銃の高さ×狙う側の絵の端・idolGunMuzzle)。狙う側はプレイヤーの居る側。
      const pl = useGameStore.getState().player;
      const mz = idolGunMuzzle(
        boss.x + boss.width / 2, boss.y + boss.height,
        (pl.x + pl.width / 2) - (boss.x + boss.width / 2),
      );
      expect(p.x + p.width / 2).toBeCloseTo(mz.x, 3);
      expect(p.y + p.height / 2).toBeCloseTo(mz.y, 3);
    } finally { Object.assign(IDOL_TUNING.bullet, JSON.parse(save)); }
  });
});

// 社長指示v0.25.3442: 手榴弾技(nade)=プレイヤーの手榴弾と同じ仕様のhostile投擲。
describe('手榴弾技(nade・v0.25.3442)', () => {
  beforeEach(() => { clearIdolPlayback(); });
  it('溜め明けにhostileな手榴弾(weaponType=grenade・速度118/威力42/信管2s)を1個投げる', () => {
    const g = setup(250);
    g.step();
    requestIdolMovePlay('nade', { solo: false, loop: false });
    for (let i = 0; i < 200; i++) {
      g.step(20);
      const nades = useGameStore.getState().projectiles.filter(p => p.weaponType === 'grenade' && p.hostile);
      if (nades.length > 0) {
        expect(nades).toHaveLength(1);
        const p = nades[0];
        expect(p.speed).toBe(HEAVY_GRENADE_SPEED);
        expect(p.damage).toBe(HEAVY_GRENADE_DAMAGE);
        expect(p.duration).toBe(HEAVY_GRENADE_FUSE_MS);
        return;
      }
    }
    throw new Error('手榴弾が投げられなかった');
  });
});

// v0.25.2629(社長報告「殴り、狙撃線は何も食らってない」)の切り分け用。
// idolTick だけを回して「線の上に立っていれば当たる」ことを確かめる=当たらなければ tick 側のバグ、
// 当たるならバグは配管側(useGameLoop/updateEnemies/描画)にある、と切り分けられる。
describe('狙撃線は線の上に居れば当たる(切り分け)', () => {
  beforeEach(() => { clearIdolPlayback(); });

  it('プレイヤーが線上に静止していれば狙撃で被弾する', () => {
    const g = setup(250);
    g.step();
    const hp0 = useGameStore.getState().player.health;
    requestIdolMovePlay('snipe', { solo: false, loop: false });
    g.step();
    expect(g.state()).toBe('idol-snipe-windup');
    // 予告(1100ms)+判定(200ms)を跨ぐまで進める。プレイヤーは動かさない。
    const states: string[] = [];
    for (let i = 0; i < 120; i++) {
      g.step(20);
      const st = g.state();
      if (states[states.length - 1] !== st) states.push(st);
    }
    expect(states, `状態遷移=${states.join('→')}`).toContain('idol-snipe');
    const boss = useGameStore.getState().enemies[0];
    expect(boss.aiFromX, '線の起点が未設定だと点に潰れて絶対に当たらない').toBeDefined();
    expect(boss.aiTargetX).toBeDefined();
    expect(useGameStore.getState().player.health).toBeLessThan(hp0);
  });
});

describe('フェーズの扱い(報告事項)', () => {
  beforeEach(() => { clearIdolPlayback(); });
  it('第二波はフェーズ設定を尊重する: P1で技を再生しても第二波は出ない', () => {
    const g = setup(250);
    g.step();
    requestIdolMovePlay('aim', { solo: false, loop: false }); // aim は第二波の対象技
    g.step();
    expect(g.st.wavePending).toBe(false); // HP満タン=P1なので予約されない
  });
  it('HPを下げてP2にすれば第二波が予約される', () => {
    const g = setup(250);
    useGameStore.setState(s => ({
      enemies: s.enemies.map(e => ({ ...e, health: Math.round(e.maxHealth * IDOL_TUNING.phaseHpThreshold * 0.5) })),
    }));
    g.step();
    requestIdolMovePlay('aim', { solo: false, loop: false });
    g.step();
    expect(g.st.wavePending).toBe(true);
  });
});

// v0.25.2895(バッチ2 B1): 他のボス(裏ボス/天使)と同じ掟でトラップ拘束(rootUntil)を止める。
// chase(移動/次攻撃の起点)のみ凍結し、攻撃の実行中は完走させる(angelBossTick.tsと同じ形)。
describe('B1: トラップ拘束(rootUntil)中はchaseの移動も新規攻撃も止まる', () => {
  beforeEach(() => { clearIdolPlayback(); });

  it('rooted中(chase)は移動語彙を維持していても座標が動かない・新規攻撃も始まらない', () => {
    const g = setup(250);
    g.step();
    requestIdolVerbPlay('close'); // 動きの語彙を固定(乱数を排除)
    g.step();
    useGameStore.setState(s => ({
      enemies: s.enemies.map(e => ({ ...e, rootUntil: g.now() + 5000 })),
    }));
    const before = g.pos();
    for (let i = 0; i < 60; i++) g.step();
    const after = g.pos();
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(g.state()).toBe('chase'); // 新規攻撃(windup)へ遷移していない
  });

  it('rootUntilを過ぎれば移動が再開する(置き去りにしない)', () => {
    const g = setup(250);
    g.step();
    requestIdolVerbPlay('close');
    g.step();
    useGameStore.setState(s => ({
      enemies: s.enemies.map(e => ({ ...e, rootUntil: g.now() + 100 })),
    }));
    for (let i = 0; i < 10; i++) g.step(20); // root解除(100ms)を跨ぐまで進める
    const after = g.pos();
    for (let i = 0; i < 30; i++) g.step(20);
    const after2 = g.pos();
    expect(after2).not.toEqual(after); // root明け後は普通に動ける
  });
});

// v0.25.2895(バッチ2 B2): 他の移動語彙(裏ボス/天使のchaseMove)と同じく、クリ黄色窓
// (bossSlowUntil)中はchase移動の速度が半分になる。CD×2(bossCritCdMult)は既存で別経路。
describe('B2: クリ黄色窓(bossSlowUntil)中はchaseの移動が半分になる', () => {
  beforeEach(() => { clearIdolPlayback(); });

  it('bossSlowUntil中の移動距離は通常の半分', () => {
    const g1 = setup(250);
    g1.step();
    requestIdolVerbPlay('close');
    g1.step();
    const before1 = g1.pos();
    for (let i = 0; i < 30; i++) g1.step();
    const after1 = g1.pos();
    const normalDist = Math.hypot(after1.x - before1.x, after1.y - before1.y);

    clearIdolPlayback();
    const g2 = setup(250);
    g2.step();
    useGameStore.setState(s => ({
      enemies: s.enemies.map(e => ({ ...e, bossSlowUntil: g2.now() + 100000 })),
    }));
    requestIdolVerbPlay('close');
    g2.step();
    const before2 = g2.pos();
    for (let i = 0; i < 30; i++) g2.step();
    const after2 = g2.pos();
    const slowDist = Math.hypot(after2.x - before2.x, after2.y - before2.y);

    expect(normalDist).toBeGreaterThan(0); // 前提: 通常時はちゃんと動いている
    expect(slowDist).toBeCloseTo(normalDist / 2, 1);
  });
});

// =================================================================================================
// カウンター成立域=赤い予告の図形(v0.25.3591・research/COUNTER_REACH_AUDIT.md の是正)
// =================================================================================================
describe('カウンター成立域は赤い予告の図形(v0.25.3591 監査是正)', () => {
  beforeEach(() => { clearIdolPlayback(); vi.useRealTimers(); });

  /** アイドル1体+プレイヤー(カウンター有効)の盤面。距離はプレイヤーから見て -y 方向。 */
  const setupCounter = (distance: number) => {
    useGameStore.getState().resetGame('assault');
    const e = spawnEnemyAt('idol', 0, -distance, 0);
    e.fromEvent = true; e.dormant = false; e.bossState = 'chase'; e.bossPhase = 1;
    e.bossNextActionAt = Number.MAX_SAFE_INTEGER;
    e.health = 99999; e.maxHealth = 99999;
    useGameStore.setState(s => ({
      enemies: [e], projectiles: [], pumpkinBlasts: [],
      player: { ...s.player, x: 0, y: 0, health: 9999, maxHealth: 9999 },
    }));
    const st = createIdolTickState();
    let gt = 0;
    const step = (ms = DT * 1000): void => {
      gt += ms;
      useGameStore.setState({ gameTime: gt });
      const cur = useGameStore.getState().enemies[0];
      if (cur) runIdolTick(cur, st, gt, ms / 1000, 1, NOOP_IDOL_SFX, true, () => {});
    };
    const boss = () => useGameStore.getState().enemies[0];
    return { step, boss, state: () => boss()?.bossState ?? '(なし)' };
  };
  const openWindow = (): void => {
    useGameStore.setState(s => ({ player: { ...s.player, counterWindowEnd: Date.now() + 5000 } }));
  };
  const touching = (): boolean => {
    const b = useGameStore.getState().enemies[0], p = useGameStore.getState().player;
    return b.x < p.x + p.width && b.x + b.width > p.x && b.y < p.y + p.height && b.y + b.height > p.y;
  };

  // ★カウンター憲法(社長裁定2026-08-26・v0.25.3947): 溜め中の面成立(v3591 C-5)は憲法が上書き。
  // 拳への対処=hitCapsule爆風のパリィ(判定の瞬間)+回避。
  it('憲法: 拳の溜め=帯の中で窓を開けても成立しない(溜めは続く)', () => {
    const g = setupCounter(60);
    requestIdolMovePlay('punch', { solo: false, loop: false });
    g.step();
    expect(g.state()).toBe('idol-punch-windup');
    expect(touching()).toBe(false);
    const hp = g.boss().health;
    openWindow();
    g.step();
    expect(g.state()).toBe('idol-punch-windup'); // 中断されない(憲法)
    expect(g.boss().health).toBe(hp);            // 反撃も入らない
  });

  it('★狙撃(紫): 帯の中でも体に重なっていても成立しない(社長裁定「避けるだけの技」)', () => {
    const g = setupCounter(20); // 体に重なるほど密着させる=従来なら確実に成立していた位置
    requestIdolMovePlay('snipe', { solo: false, loop: false });
    g.step();
    expect(g.state()).toBe('idol-snipe-windup');
    const hp = g.boss().health;
    openWindow();
    g.step();
    expect(g.state()).toBe('idol-snipe-windup'); // 技は続く
    expect(g.boss().health).toBe(hp);            // 反撃ダメージも入らない
  });
});

// ★v0.25.3978(社長報告「アイドルの拳の当たり判定が予告通りではなさそう」): 拳/狙い撃ち/扇/追尾弾は
// 実行時にヘイト対象(守護霊も含む)へ撃つのに、赤い予告だけがプレイヤー向きに描かれていた。
// 修正=tickが溜め中に狙いを aiTarget へ毎フレーム書き、描画はそれを読むだけ。ここでは
// 「溜め中に aiTarget が狙いへ追従して書かれる」ことを固定する(描画はテスト対象外の掟)。
describe('拳/狙い撃ちの予告向き: tickが書くaiTarget(ヘイト対象)に追従する', () => {
  it('punchの溜め中、aiTargetが狙い(プレイヤー中心)へ毎フレーム追従する', () => {
    const { step, state } = setup(120);
    requestIdolMovePlay('punch', { solo: false, loop: false });
    step();
    expect(state()).toBe('idol-punch-windup');
    useGameStore.setState(s => ({ player: { ...s.player, x: 300, y: 40 } }));
    step();
    const b = useGameStore.getState().enemies[0];
    const pl = useGameStore.getState().player;
    expect(b.aiTargetX).toBeDefined();
    expect(Math.abs((b.aiTargetX ?? 0) - (pl.x + pl.width / 2))).toBeLessThan(1);
    expect(Math.abs((b.aiTargetY ?? 0) - (pl.y + pl.height / 2))).toBeLessThan(1);
  });
  it('aimの溜め開始でも即aiTargetが書かれる(未書込の初回フレームを作らない)', () => {
    const { step, state } = setup(400);
    requestIdolMovePlay('aim', { solo: true, loop: false });
    step();
    expect(state()).toBe('idol-aim-windup');
    expect(useGameStore.getState().enemies[0].aiTargetX).toBeDefined();
  });
});

describe('アイドルの笑い声(社長提供2026-10-05「登場シーンとか、技の時にたまに」)', () => {
  it('目覚めた最初のフレームで1回だけ笑う', () => {
    useGameStore.getState().resetGame('assault');
    const e = spawnEnemyAt('idol', 0, -400, 0);
    e.fromEvent = true; e.dormant = false; e.bossState = 'chase'; e.bossPhase = 1;
    e.bossNextActionAt = Number.MAX_SAFE_INTEGER;
    useGameStore.setState(s => ({ enemies: [e], projectiles: [], pumpkinBlasts: [], player: { ...s.player, x: 0, y: 0, health: 9999, maxHealth: 9999 } }));
    const st = createIdolTickState();
    let laughs = 0;
    const sfx = { ...NOOP_IDOL_SFX, laugh: () => { laughs++; } };
    let gt = 0;
    for (let i = 0; i < 30; i++) {
      gt += 16;
      useGameStore.setState({ gameTime: gt });
      const cur = useGameStore.getState().enemies[0];
      if (cur) runIdolTick(cur, st, gt, 0.016, 1, sfx, false, () => {});
    }
    expect(laughs).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 大ジャンプ→即・追尾弾(社長指示2026-10-20「アイドルから大きく離れると、大ジャンプして少し手前に移動してきて
// すぐ様、誘導弾を打つ台本追加」)。
// ───────────────────────────────────────────────────────────────────────────
describe('大ジャンプ→即・追尾弾', () => {
  beforeEach(() => { clearIdolPlayback(); vi.useRealTimers(); });
  const L = IDOL_TUNING.leap;
  const center = () => {
    const b = useGameStore.getState().enemies[0];
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const playerCenter = () => {
    const p = useGameStore.getState().player;
    return { x: p.x + p.width / 2, y: p.y + p.height / 2 };
  };
  const distToPlayer = () => {
    const c = center(), p = playerCenter();
    return Math.hypot(c.x - p.x, c.y - p.y);
  };
  /** 超遠(900px)に置き、中立のまま回す。抽選は止める(bossNextActionAt=MAX)=跳ぶのは割り込みだけ。 */
  const farSetup = (distance = 900) => setup(distance);
  const runUntil = (g: ReturnType<typeof setup>, pred: () => boolean, maxMs = 6000): number => {
    const t0 = g.now();
    while (!pred() && g.now() - t0 < maxMs) g.step();
    return g.now() - t0;
  };

  it('超遠に居続けて0.8秒で跳ぶ(しゃがむ州へ)。0.8秒未満では跳ばない', () => {
    const g = farSetup();
    while (g.now() < L.triggerMs - 50) { g.step(); expect(g.state()).toBe('chase'); }
    runUntil(g, () => g.state() !== 'chase', 400);
    expect(g.state()).toBe('idol-leap-crouch');
    expect(g.now()).toBeGreaterThanOrEqual(L.triggerMs);
  });

  it('超遠でなければ(遠帯=主戦帯の外でも)跳ばない', () => {
    const g = farSetup(500);
    for (let i = 0; i < 180; i++) { g.step(); expect(g.state()).toBe('chase'); }
  });

  it('しゃがむ間はその場・明けたら空中へ。着地点=狙い(プレイヤー)から約380px手前の線上', () => {
    const g = farSetup();
    runUntil(g, () => g.state() === 'idol-leap-crouch');
    const p0 = g.pos();
    runUntil(g, () => g.state() === 'idol-leap', L.crouchMs + 100);
    expect(g.pos()).toEqual(p0); // しゃがむ間は動かない(踏み切りのフレームまで)
    const b = useGameStore.getState().enemies[0];
    const p = playerCenter();
    expect(Math.hypot((b.aiTargetX ?? 0) - p.x, (b.aiTargetY ?? 0) - p.y)).toBeCloseTo(L.standOffPx, 0);
  });

  it('★着地の瞬間に追尾弾の溜め(短い=300ms)へ。着地した位置はプレイヤーから約380px', () => {
    const g = farSetup();
    runUntil(g, () => g.state() === 'idol-leap');
    runUntil(g, () => g.state() !== 'idol-leap', L.airMs + 100);
    expect(g.state()).toBe('idol-orb-windup');
    const b = useGameStore.getState().enemies[0];
    expect((b.bossStateUntil ?? 0) - g.now()).toBe(L.orbWindupMs);
    // 予告の進みの出どころ: 溜めの頭(bossWindupStartAt)=今。描画はここから明けまでで流星を流す。
    expect(b.bossWindupStartAt).toBe(g.now());
    expect(distToPlayer()).toBeGreaterThan(L.standOffPx - 20);
    expect(distToPlayer()).toBeLessThan(L.standOffPx + 20);
    // 300ms後に通常の追尾弾と同じ数の弾が出て、通常の硬直へ。
    runUntil(g, () => g.state() !== 'idol-orb-windup', L.orbWindupMs + 50);
    expect(g.state()).toBe('idol-orb-recover');
    expect(useGameStore.getState().projectiles.filter(pp => pp.id.startsWith('proj-idolorb-')).length).toBe(IDOL_TUNING.orbCount.p1);
  });

  it('空中の地面の移動は慣性つき(出だしと着地前で速さが違う・単調に近づく)', () => {
    const g = farSetup();
    runUntil(g, () => g.state() === 'idol-leap');
    const ds: number[] = [];
    let prev = distToPlayer();
    while (g.state() === 'idol-leap') { g.step(); const d = distToPlayer(); ds.push(prev - d); prev = d; }
    expect(ds.every(v => v >= -0.001)).toBe(true); // 戻らない
    const head = ds.slice(1, 6).reduce((a, v) => a + v, 0);
    const tail = ds.slice(-6, -1).reduce((a, v) => a + v, 0);
    expect(head).toBeGreaterThan(tail * 2); // 踏み切りは速く、着地前は減速
  });

  it('★着地にダメージは無い: 跳ぶ間も着地の瞬間も、帯・円の判定を積まずプレイヤーの体力も減らない', () => {
    const g = farSetup();
    const hp0 = useGameStore.getState().player.health;
    runUntil(g, () => g.state() === 'idol-orb-windup');
    expect(useGameStore.getState().pumpkinBlasts).toEqual([]);
    expect(useGameStore.getState().projectiles).toEqual([]);
    expect(useGameStore.getState().player.health).toBe(hp0);
  });

  it('クールダウン中は、また超遠に居続けても跳ばない(連発しない)', () => {
    const g = farSetup();
    runUntil(g, () => g.state() === 'idol-leap-crouch');
    const startedAt = g.now();
    runUntil(g, () => g.state() === 'idol-orb-recover');
    runUntil(g, () => g.state() === 'chase' || g.state() === 'idol-rest');
    // もう一度超遠へ離す(プレイヤーを遠ざける)。クールダウンが明けるまでは跳ばない。
    const seen: string[] = [];
    while (g.now() - startedAt < L.cooldownMs - 100) {
      const b = useGameStore.getState().enemies[0];
      useGameStore.setState(s => ({ player: { ...s.player, x: b.x, y: b.y + 1000 } }));
      g.step();
      seen.push(g.state());
    }
    expect(seen).not.toContain('idol-leap-crouch');
    // 明けたら(=中立か、台本の次の段へ移る切れ目で)跳ぶ。
    // ※クールダウンは §16-H どおり硬直の間は止まる(行動の時計)ので、壁時計の7秒ちょうどではない。
    runUntil(g, () => {
      const b = useGameStore.getState().enemies[0];
      useGameStore.setState(s => ({ player: { ...s.player, x: b.x, y: b.y + 1000 } }));
      return g.state() === 'idol-leap-crouch';
    }, 20000);
    expect(g.state()).toBe('idol-leap-crouch');
  });

  it('★台本の途中でも段の切れ目で跳ぶ(技の最中=硬直の中には割り込まない・残りの段は捨てる)', () => {
    const g = farSetup();
    g.step();
    // 3段の台本の1段目(aim)の硬直中、という状態を作る。超遠はもう0.8秒以上続いている。
    g.st.seq = ['aim', 'fan', 'orb']; g.st.step = 1; g.st.leapFarMs = L.triggerMs + 100; g.st.leapReadyAt = 0;
    useGameStore.setState(s2 => ({ enemies: s2.enemies.map(e => ({ ...e, bossState: 'idol-aim-recover' as const, bossStateUntil: g.now() + 500 })) }));
    const seen: string[] = [];
    while (g.state() === 'idol-aim-recover' && seen.length < 200) { g.step(); seen.push(g.state()); }
    // 硬直の中では跳ばず、硬直が明けた切れ目で(次の段 fan ではなく)しゃがむ。
    expect(seen.slice(0, -1).every(x => x === 'idol-aim-recover')).toBe(true);
    expect(g.state()).toBe('idol-leap-crouch');
    expect(g.st.seq).toEqual([]);
    // その後は着地→追尾弾→硬直→休符(捨てた段 fan は出ない)。
    runUntil(g, () => g.state() === 'idol-orb-recover');
    runUntil(g, () => g.state() !== 'idol-orb-recover');
    expect(g.state()).toBe('idol-rest');
  });

  it('切れ目でもクールダウン中・超遠でなければ跳ばず、次の段へ進む', () => {
    const g = farSetup();
    g.step();
    g.st.seq = ['aim', 'fan']; g.st.step = 1; g.st.leapFarMs = L.triggerMs + 100; g.st.leapReadyAt = g.now() + 60000;
    useGameStore.setState(s2 => ({ enemies: s2.enemies.map(e => ({ ...e, bossState: 'idol-aim-recover' as const, bossStateUntil: g.now() + 50 })) }));
    runUntil(g, () => g.state() !== 'idol-aim-recover', 500);
    expect(g.state()).toBe('idol-fan-windup');
  });

  it('休眠中は跳ばない', () => {
    const g = farSetup();
    useGameStore.setState(s => ({ enemies: s.enemies.map(e => ({ ...e, dormant: true })) }));
    for (let i = 0; i < 120; i++) g.step();
    expect(g.state()).toBe('chase');
  });

  it('アテンション中は跳ばない(明けたら跳ぶ)', () => {
    const g = farSetup();
    useGameStore.setState({ attention: { x: 0, y: 0 } as never });
    for (let i = 0; i < 120; i++) { g.step(); expect(g.state()).toBe('chase'); }
    useGameStore.setState({ attention: null as never });
    g.step();
    expect(g.state()).toBe('idol-leap-crouch');
  });

  it('ボスメーカーで移動語彙を維持している間は跳ばない', () => {
    const g = farSetup();
    requestIdolVerbPlay('hold');
    for (let i = 0; i < 120; i++) { g.step(); expect(g.state()).toBe('chase'); }
  });

  it('ボスメーカーの▶(大ジャンプ)は距離と待ち時間を無視して1回だけ見せ、硬直明けに中立へ戻る', () => {
    const g = setup(250);
    requestIdolLeapPlay({ solo: true });
    g.step();
    expect(g.state()).toBe('idol-leap-crouch');
    runUntil(g, () => g.state() === 'idol-orb-recover');
    runUntil(g, () => g.state() !== 'idol-orb-recover');
    expect(g.state()).toBe('chase');
    expect(idolPlaybackActive()).toBe(false);
  });

  it('ステージ2(屋外ラボ): 着地点は行ける帯の中で、壁・プロップに重ならない', () => {
    const g = farSetup();
    useGameStore.setState({ stageTheme: 'lab', indoorMode: false, farBackdrop: 'lab' } as never);
    // 帯の縁にプレイヤー、横に遠くアイドル=素の着地点は帯の外へ出うる斜めの線。
    useGameStore.setState(s => ({
      player: { ...s.player, x: 0, y: LAB_CORRIDOR_Y_LIMIT_PX - 30 },
      enemies: s.enemies.map(e => ({ ...e, x: 1100, y: -LAB_CORRIDOR_Y_LIMIT_PX + 10 })),
    }));
    runUntil(g, () => g.state() === 'idol-leap');
    const b = useGameStore.getState().enemies[0];
    const lx = (b.aiTargetX ?? 0) - b.width / 2, ly = (b.aiTargetY ?? 0) - b.height / 2;
    const ctx = { farBackdrop: 'lab', labTheme: true, corridorMode: false, m0AdvanceLimitX: null, corridorRunInActive: false };
    expect(clampRectToPlayableArea(lx, ly, b.width, b.height, ctx)).toEqual({ x: lx, y: ly });
    const r = 200;
    const obs = [
      ...labWallsInRegionRaw(lx - r, ly - r, lx + r, ly + r).map(wallRect),
      ...labPropsInRegionRaw(lx - r, ly - r, lx + r, ly + r).map(propRect),
    ];
    const hit = obs.some(o => lx < o.x + o.width && lx + b.width > o.x && ly < o.y + o.height && ly + b.height > o.y);
    expect(hit).toBe(false);
    // 寄せた結果でも相手に近すぎない(品質監査B3)。
    const p = playerCenter();
    expect(Math.hypot((b.aiTargetX ?? 0) - p.x, (b.aiTargetY ?? 0) - p.y)).toBeGreaterThanOrEqual(L.minGapPx);
  });

  it('★予兆SEと笑いの数えは1回の跳びにつき1回(しゃがみで予兆・踏み切りで数え・着地後の追尾弾は鳴らさない)', () => {
    const g = farSetup();
    let alerts = 0;
    const sfx = { ...NOOP_IDOL_SFX, alert: () => { alerts++; } };
    // setup の step は NOOP を使うので、ここだけ自前で回す。
    let gt = g.now();
    const st = g.st;
    const stepS = () => { gt += 16; useGameStore.setState({ gameTime: gt }); const cur = useGameStore.getState().enemies[0]; runIdolTick(cur, st, gt, 0.016, 1, sfx, false, () => {}); };
    while (useGameStore.getState().enemies[0].bossState !== 'idol-leap-crouch' && gt < 3000) stepS();
    expect(alerts).toBe(1);
    const moves0 = st.movesSinceLaugh ?? 0;
    while (useGameStore.getState().enemies[0].bossState !== 'idol-orb-recover' && gt < 6000) stepS();
    expect(alerts).toBe(1);
    expect((st.movesSinceLaugh ?? 0) - moves0).toBe(1);
  });

  it('★空中で紫(完全気絶)になっても宙で止まらず着地まで飛び切り、着地後は追尾弾を出さずに中立(=気絶)へ', () => {
    const g = farSetup();
    runUntil(g, () => g.state() === 'idol-leap');
    const b = useGameStore.getState().enemies[0];
    expect(isEnemyFrozenForClocks({ ...b, bossFullStunUntil: g.now() + 5000 } as Enemy, g.now(), Date.now())).toBe(false);
    useGameStore.setState(s2 => ({ enemies: s2.enemies.map(e => ({ ...e, bossFullStunUntil: g.now() + 5000 })) }));
    const until = b.bossStateUntil ?? 0;
    runUntil(g, () => g.state() !== 'idol-leap', L.airMs + 100);
    expect(g.now()).toBeGreaterThanOrEqual(until);
    expect(g.now()).toBeLessThan(until + 50);
    expect(g.state()).toBe('chase');
    const c = center();
    expect(c.x).toBeCloseTo(b.aiTargetX ?? 0, 3);
    expect(c.y).toBeCloseTo(b.aiTargetY ?? 0, 3);
    for (let i = 0; i < 30; i++) g.step();
    expect(useGameStore.getState().projectiles).toEqual([]);
  });
});

describe('大ジャンプの純関数(idolScript)', () => {
  it('宙の体に当たった絵の持ち上げ量: 空中の偶像だけ浮いた高さ・それ以外は0', () => {
    const L = IDOL_TUNING.leap;
    const e = { type: 'idol', bossState: 'idol-leap', bossStateUntil: 1000 + L.airMs * 0.6 };
    expect(idolAirLiftOf(e, 1000)).toBeCloseTo(L.heightPx, 6);
    expect(idolAirLiftOf({ ...e, bossState: 'chase' }, 1000)).toBe(0);
    expect(idolAirLiftOf({ ...e, type: 'zombie' }, 1000)).toBe(0);
    expect(idolAirLiftOf(undefined, 1000)).toBe(0);
  });

  it('★宙の偶像の真下で他の敵に当たった数字・血・火花は持ち上がらない(当てた敵で判断・品質監査2巡目A)', () => {
    const L = IDOL_TUNING.leap;
    useGameStore.getState().resetGame('assault');
    const idol = spawnEnemyAt('idol', 0, 0, 0);
    idol.dormant = false; idol.bossState = 'idol-leap'; idol.bossStateUntil = 1000 + L.airMs * 0.6;
    const z = spawnEnemyAt('zombie', idol.x, idol.y, 0); // 偶像の床の箱と同じ所に居る別の敵
    useGameStore.setState({ enemies: [idol, z], effects: [], gameTime: 1000 });
    const nums = () => useGameStore.getState().effects.flatMap(f => (f.kind === 'damageNumber' ? [f] : []));
    const st = useGameStore.getState();
    st.spawnDamageNumber(idol.x + 20, idol.y, 10, false, { enemyId: z.id, scanMarked: false });
    expect(Math.abs(nums()[0].y - idol.y)).toBeLessThan(10); // 他の敵=床のまま(±乱れ4px)
    st.spawnDamageNumber(idol.x + 20, idol.y, 10, false, { scanMarked: false }); // 名指し無し=床のまま
    expect(Math.abs(nums()[1].y - idol.y)).toBeLessThan(10);
    st.spawnDamageNumber(idol.x + 20, idol.y, 10, false, { enemyId: idol.id, scanMarked: false }); // 偶像=体の高さ
    expect(nums()[2].y).toBeLessThan(idol.y - L.heightPx + 10);
    // 血・火花は点で推測しない=偶像の床の箱の上で出しても動かない(呼び手が当てた敵で持ち上げる)。
    const before = useGameStore.getState().effects.length;
    st.spawnBurst(idol.x + 20, idol.y + 10, '#b91c1c', 4);
    const added = useGameStore.getState().effects.slice(before);
    expect(added.length).toBeGreaterThan(0);
    for (const f of added) if ('y' in f) expect(Math.abs(f.y - (idol.y + 10))).toBeLessThan(40);
  });
  it('着地点: 狙いから standOff 手前の線上。既に近ければその場', () => {
    expect(idolLeapLanding(0, 0, 1000, 0, 380)).toEqual({ x: 620, y: 0 });
    expect(idolLeapLanding(0, 0, 300, 0, 380)).toEqual({ x: 0, y: 0 });
  });
  it('地面の進みは 0→1 で単調・端点が正確', () => {
    expect(idolLeapGroundEase(0)).toBe(0);
    expect(idolLeapGroundEase(1)).toBeCloseTo(1, 10);
    let prev = 0;
    for (let i = 1; i <= 100; i++) { const v = idolLeapGroundEase(i / 100); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
  });
  it('見た目の高さは空中の州でだけ出る・頂点は空中の4割で heightPx・落ちは上がりより着地の直前が速い', () => {
    const L = IDOL_TUNING.leap;
    expect(idolLeapLiftPx('idol-leap', 1000 + L.airMs * 0.6, 1000)).toBeCloseTo(L.heightPx, 6);
    const h = (u: number) => idolLeapLiftPx('idol-leap', 1000 + L.airMs * (1 - u), 1000);
    expect(h(0.97) - h(1)).toBeGreaterThan(h(0.03) - h(0)); // 着地の直前の落ちる速さ > 踏み切り直後の上がる速さ
    expect(idolLeapLiftPx('idol-leap', 1000, 1000)).toBe(0); // 着地の瞬間
    expect(idolLeapLiftPx('idol-leap-crouch', 2000, 1000)).toBe(0);
    expect(idolLeapLiftPx('chase', 2000, 1000)).toBe(0);
  });
});
