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
  requestIdolMovePlay, requestIdolVerbPlay, idolPlaybackActive, getIdolPlayback, clearIdolPlayback,
} from './idolTick';
import { clampRectToPlayableArea } from '../world/playableArea';
import { LAB_CORRIDOR_Y_LIMIT_PX } from '../world/labWalls';
import { useGameStore } from '../store/gameStore';
import { spawnEnemyAt } from './enemyUtils';
import { IDOL_TUNING } from './idolScript';
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
