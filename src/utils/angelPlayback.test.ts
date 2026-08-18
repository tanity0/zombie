// ボスメーカー(BOSS_MAKER.md §6-1): 天使6体の**技の個別再生(▸)を状態機械ごと**検証する。
// idolTick.test.ts の「個別再生」describe と同じ流儀——パネル(React)は要求箱(module変数)へ積むだけ
// なので、要求→tick→状態遷移を実際に回して確かめる。
//
// ここで機械化していること:
//  ① 24技すべてが▸から始まる(=「押しても何も起きないボタン」を作らない・社長指示「技再生ボタンは必須」)
//  ② 単独再生(solo)は技が終わったら**必ず立ち下がる**(=停止⏸が二度と効かなくなる事故を防ぐ)
//  ③ 要求箱は createAngelBossState() の副作用で消えない(v0.25.2625の実バグの型)
import { describe, it, expect, beforeEach } from 'vitest';
import {
  runAngelBossTick, createAngelBossState, NOOP_ANGEL_SFX,
  requestAngelMovePlay, angelPlaybackActive, getAngelPlayback, clearAngelPlayback,
  ANGEL_MOVES_BY_TYPE, type AngelMoveKey,
} from './angelBossTick';
import { useGameStore } from '../store/gameStore';
import { spawnEnemyAt } from './enemyUtils';
import type { EnemyType } from '../types/game';

const DT = 1 / 60;

/** 天使1体+プレイヤーの盤面を作り、tickを回すヘルパ(ボスメーカーの部屋と同じ形)。 */
const setup = (type: EnemyType, distance = 200) => {
  useGameStore.getState().resetGame('assault');
  const e = spawnEnemyAt(type, 0, -distance, 0);
  e.fromEvent = true; e.dormant = false; e.fixed = false;
  e.bossState = 'chase'; e.bossPhase = 1;
  e.bossNextActionAt = Number.MAX_SAFE_INTEGER; // 自発的な抽選を止める=強制発動だけを見る
  e.homeX = 0; e.homeY = 0;                     // 旋回/縁クランプの中心(部屋の出現ブロックと同じ)
  e.health = 99999; e.maxHealth = 99999;        // フェーズ移行で技の候補が変わらないようにする
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
  const state = (): string => useGameStore.getState().enemies[0]?.bossState ?? '(なし)';
  return { st, step, state, now: () => gt };
};

/** 技キー → その技が最初に入る州(=▸を押した次のフレームに見えるはずの状態)。 */
const ENTRY_STATE: Readonly<Record<AngelMoveKey, string>> = {
  'mg-harai': 'harai-windup',
  'mg-dash': 'mdash-windup',
  'mg-volley': 'volley-windup',
  'jb-volley': 'volley-windup',
  'jb-lantern': 'lantern-windup',
  'jb-consecrate': 'consecrate-windup',
  'jb-lance': 'lance-windup',
  'jb-warp': 'warp-windup',
  'rf-bone': 'bone-windup',
  'rf-jump': 'jump-windup',
  'rf-sweep': 'sweep-windup',
  'ur-sweep': 'sweep-windup',
  'ur-downslash': 'downslash-windup',
  'ur-thrust': 'thrust-windup',
  'ur-bolt': 'bolt-windup',
  'sr-ringshot': 'ring-move-windup',
  'sr-ringspin': 'ring-spin-windup',
  'sr-sweep': 'sweep-windup',
  'sr-gaze': 'gaze-windup',
  'ac-spike': 'spike-windup',
  'ac-spear': 'spear-windup',
  'ac-warp': 'warp-out',
  'ac-burst': 'burst-windup',
  'ac-gaze': 'gaze-windup',
};

describe('個別再生: 天使6体の技を1つだけ強制発動できる', () => {
  beforeEach(() => { clearAngelPlayback(); });

  for (const [type, moves] of Object.entries(ANGEL_MOVES_BY_TYPE)) {
    it(`${type}: ${moves.length}技すべてが▸から始まる(距離帯・CD・抽選をバイパス)`, () => {
      for (const m of moves) {
        clearAngelPlayback();
        const g = setup(type as EnemyType);
        g.step();
        expect(g.state(), `${m} の前は中立`).toBe('chase');
        requestAngelMovePlay(m, { solo: false, loop: false });
        g.step();
        expect(g.state(), m).toBe(ENTRY_STATE[m]);
      }
    });
  }

  it('技キーの表(ANGEL_MOVES_BY_TYPE)と入口の表が同じ集合を張っている', () => {
    const all = Object.values(ANGEL_MOVES_BY_TYPE).flat().sort();
    expect(all).toEqual(Object.keys(ENTRY_STATE).sort());
  });

  it('別のボスの技キーを渡しても握り潰さない(再生状態ごと消える=⏸が固まらない)', () => {
    const g = setup('miguel');
    g.step();
    requestAngelMovePlay('ac-burst', { solo: true, loop: false }); // ミゲルは持っていない技
    expect(angelPlaybackActive()).toBe(true);
    g.step();
    expect(angelPlaybackActive()).toBe(false); // 要求も solo も消えている
    expect(g.state()).toBe('chase');
  });
});

describe('★立ち下がり: 単独再生は必ず終わる(⏸が効かなくなる事故を作らない)', () => {
  beforeEach(() => { clearAngelPlayback(); });

  // 代表として各ボス1技ずつ(全技を最後まで回すとランタン5秒・ランス8秒などで時間がかかるため、
  // ここは「立ち下がりの配線がボスごとに効いているか」を見る)。
  const CASES: readonly [EnemyType, AngelMoveKey][] = [
    ['miguel', 'mg-volley'],
    ['jibril', 'jb-warp'],
    ['rafi', 'rf-bone'],
    ['uri', 'ur-bolt'],
    ['suriel', 'sr-gaze'],
    ['acrasiel', 'ac-gaze'],
  ];

  for (const [type, move] of CASES) {
    it(`${type}/${move}: 硬直明けに中立へ戻り、再生中フラグが下りる`, () => {
      const g = setup(type);
      g.step();
      requestAngelMovePlay(move, { solo: true, loop: false });
      g.step();
      expect(angelPlaybackActive()).toBe(true);
      let ended = false;
      for (let i = 0; i < 600; i++) {          // 最大12秒ぶん
        g.step(20);
        if (!angelPlaybackActive()) { ended = true; break; }
      }
      expect(ended, '再生が終わらない=停止が効かなくなる').toBe(true);
      expect(g.state()).toBe('chase');
    });
  }

  it('技が割り込みで消された時も立ち下がる(tick冒頭の保険)', () => {
    const g = setup('miguel');
    g.step();
    requestAngelMovePlay('mg-harai', { solo: true, loop: false });
    g.step();
    expect(angelPlaybackActive()).toBe(true);
    // 外から技を消す(カウンター/気絶で chase へ戻された時と同じ状態)。
    useGameStore.setState(s => ({ enemies: s.enemies.map(e => ({ ...e, bossState: 'chase', bossStateUntil: undefined })) }));
    g.step();
    expect(angelPlaybackActive()).toBe(false);
  });

  it('ループ中は同じ技が繰り返し始まり、もう一度押すと止まる', () => {
    const g = setup('acrasiel');
    g.step();
    requestAngelMovePlay('ac-gaze', { solo: true, loop: true });
    g.step();
    expect(getAngelPlayback().loop).toBe('ac-gaze');
    // 1回ぶん回しても再生中のまま(=次の周へ入る)。
    for (let i = 0; i < 120; i++) g.step(20);
    expect(angelPlaybackActive()).toBe(true);
    requestAngelMovePlay('ac-gaze', { solo: true, loop: true }); // 同じ技をもう一度=ループ解除
    expect(getAngelPlayback().loop).toBeNull();
    let ended = false;
    for (let i = 0; i < 600; i++) {
      g.step(20);
      if (!angelPlaybackActive()) { ended = true; break; }
    }
    expect(ended).toBe(true);
  });

  // ★実バグの教訓(v0.25.2625・実装精度の規律6「教訓は即機械化」):
  // 呼び出し側は `useRef(createAngelBossState())` の形で持つが、**useRefの引数は毎レンダー評価される**。
  // ここに clearAngelPlayback() の副作用を入れると、パネルが再描画するたびに要求箱が空になり、
  // ▸を押しても技が1フレームで止まる。
  it('★教訓: createAngelBossState は再生要求を消さない(副作用を持たない)', () => {
    requestAngelMovePlay('mg-harai', { solo: true, loop: false });
    expect(angelPlaybackActive()).toBe(true);
    createAngelBossState();                    // = パネルが再描画するたびに起きること
    expect(angelPlaybackActive()).toBe(true);  // ここが false になると▸が死ぬ
    clearAngelPlayback();
  });
});
