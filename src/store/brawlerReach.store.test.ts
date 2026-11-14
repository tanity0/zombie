// ★基本技の前進は「決まった距離を、出した瞬間の向きへ」(research/BRAWLER.md §31・社長裁定2026-11-12)を、実際の AI(updateEnemies)を実際の刻みで回して固める。
//  - 押しの表(utils/brawlerReach の BRAWLER_PUSH_ZOMBIE_PX)が、雑魚に当てた実際の押しと合っている
//  - 代表の道(弱→弱→強→4段目→5段目 / 弱→飛び蹴り1→2→3 / 飛び蹴り1→2→3 / 飛び蹴り2→踵落とし / 強→気功)は、相手の手前から始めて、続きを一番早く出しても一番遅く出しても当たる
//  - 外れる: 踏み込み+届く範囲より遠い相手には空振りする / 3発目の飛ぶ間に相手が動くと外れる(取り直さない・蹴り飛ばしは溜め無し=§33-2)
// 全部のつなぎの距離の計算は utils/brawlerReach.test.ts。
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { useGameStore } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setBrawlerTempoAll, brawlerHeldNow } from '../utils/brawlerCombo';
import {
  BRAWLER_TEMPO_DEFAULT, BRAWLER_STANDOFF_PX, BRAWLER_LUNGE_PX, initialBrawlerState, brawlerDistTo, brawlerElapsed, brawlerTechAllowed, brawlerStageForPress, brawlerNextKickN,
  type BrawlerState, type BrawlerRouteNode,
} from '../utils/brawler';
import { BRAWLER_PUSH_ZOMBIE_PX } from '../utils/brawlerReach';

const NO = { up: false, down: false, left: false, right: false } as never;
let now = 7_000_000;
const FRAME = 16;

const setup = (type: EnemyType = 'zombie', dx = 200, extra: Partial<Enemy> = {}) => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
    player: {
      ...st.player, health: 99999, maxHealth: 99999, invulnerable: false, subWeapons: ['brawler'], subWeaponLevels: { brawler: 3 },
      lastDirection: { x: 1, y: 0 }, brawler: { ...initialBrawlerState(), points: 20 },
    },
  }));
  const p = useGameStore.getState().player;
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  useGameStore.setState({ enemies: [{ ...e, x: p.x + p.width / 2 + dx - e.width / 2, y: p.y + p.height / 2 - e.height / 2, id: 'z', health: 9_999_999, maxHealth: 9_999_999, dormant: false, ...extra } as Enemy] });
};
const en = () => useGameStore.getState().enemies.find(x => x.id === 'z')!;
const br = (): BrawlerState => useGameStore.getState().player.brawler!;
const gt = () => useGameStore.getState().gameTime;
const adv = () => {
  now += FRAME;
  // 画面全体の止めの間は壁時計だけ進む。★実機のループと同じ順(時刻を進めてから止めを見る=止めが明けた最初のフレームは動く・2026-11-14)。
  if (now < useGameStore.getState().hitstopUntil) return;
  useGameStore.getState().setGameTime(gt() + FRAME);
  useGameStore.getState().movePlayer(NO, FRAME / 1000);
  useGameStore.getState().tickBrawler();
  useGameStore.getState().updateEnemies(FRAME / 1000);
};
const pc = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
/** プレイヤーの中心から相手の帯の縁まで。 */
const dist = () => { const c = pc(); return brawlerDistTo(c.x, c.y, en()); };
/** 相手を縁まで gap の所へ置き直す(押しを消す)。 */
const placeAt = (gap: number) => {
  const d = dist();
  useGameStore.setState(st => ({ enemies: st.enemies.map(e => ({ ...e, x: e.x + (gap - d), knockbackVx: 0, knockbackVy: 0, knockbackUntil: 0 })) }));
};
const isStage = (n: BrawlerRouteNode): boolean => /^s[1-5]$/.test(n);
const issue = (n: BrawlerRouteNode): boolean => {
  const g = useGameStore.getState();
  if (isStage(n)) return g.brawlerPress();
  if (n === 'kick1' || n === 'kick2' || n === 'kick3') return g.brawlerTech(1, 0);
  if (n === 'heel' || n === 'stomp') return g.brawlerTech(0, 1);
  if (n === 'kiko') return g.brawlerTech(-1, 0);
  return false;
};
const nodeNow = (): BrawlerRouteNode => {
  const b = br();
  if (b.phase === 'attack') return (['s1', 's2', 's3', 's4', 's5'] as const)[b.stage - 1];
  if (b.phase === 'tech' && b.tech === 'kick') return b.kickHeel ? 'heel' : (['kick1', 'kick2', 'kick3'] as const)[b.kickN - 1];
  if (b.phase === 'tech') return b.tech as BrawlerRouteNode;
  return 'idle';
};
/** いま B を A の続きとして出せるか(段のつなぎ・取り消し・飛び蹴りの連続)。 */
const validNow = (a: BrawlerRouteNode, b: BrawlerRouteNode): boolean => {
  const s = br(); const t = gt();
  if (isStage(b)) return s.phase !== 'idle' ? nodeNow() === a : brawlerStageForPress(s, t) === Number(b[1]);
  const kind = b.startsWith('kick') || b === 'heel' ? 'kick' : b as 'stomp' | 'kiko';
  if (s.phase !== 'idle') return nodeNow() === a && brawlerTechAllowed(s, kind, t);
  if (kind === 'kick' && (a === 'kick1' || a === 'kick2')) return brawlerNextKickN(s, t) === Number(a[4]) + 1;
  return false;
};

/**
 * 道を出す。waits[i]=i 番目の手を、前の手が判定を解いてから何フレーム後に出すか(0=一番早い=止めの間の先行入力)。
 * scanAt を渡すと、その手は出さずに「続きとして出せて、相手がまだ固まっている」最後のフレームを返す。
 * 戻り: 各手が当たった時の相手の縁までの距離(当たらなかった手は NaN)。
 */
const drive = (steps: readonly BrawlerRouteNode[], waits: readonly number[], scanAt = -1): { hitAt: number[]; last: number } => {
  setup();
  placeAt(BRAWLER_STANDOFF_PX); // 相手の手前から始める(§31-2)
  const hitAt: number[] = [];
  for (let i = 0; i < steps.length; i++) {
    if (i > 0) {
      if (i === scanAt) {
        let last = -1;
        for (let f = 0; f < 120; f++) { if (validNow(steps[i - 1], steps[i]) && brawlerHeldNow(en(), gt(), now)) last = f; adv(); }
        return { hitAt, last };
      }
      for (let f = 0; f < waits[i]; f++) adv();
    }
    const before = en().lastHit;
    expect(issue(steps[i]), `${steps.join('→')}: ${steps[i]} を出せる`).toBe(true);
    let hit = false;
    for (let f = 0; f < 200 && !hit; f++) {
      adv();
      if (en().lastHit !== before) hit = true;
      else if (nodeNow() === steps[i] && br().resolved && steps[i] !== 'kiko') break;
    }
    hitAt.push(hit ? dist() : NaN);
    // 判定を解くまで進めてから次へ(気功は弾が当たった時点で解いている)
    for (let f = 0; f < 200 && !(nodeNow() === steps[i] && br().resolved); f++) adv();
  }
  return { hitAt, last: -1 };
};
const runRoute = (steps: readonly BrawlerRouteNode[], mode: 'early' | 'late'): number[] => {
  const waits = steps.map(() => 0);
  if (mode === 'late') for (let i = 1; i < steps.length; i++) {
    const { last } = drive(steps, waits, i);
    expect(last, `${steps.join('→')}: ${steps[i]} を出せる最後のフレームがある`).toBeGreaterThanOrEqual(0);
    waits[i] = last;
  }
  return drive(steps, waits).hitAt;
};

beforeEach(() => {
  now = 7_000_000;
  setBrawlerTempoAll(1.3);
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // 会心を出さない
});
afterEach(() => { vi.restoreAllMocks(); });
afterAll(() => { setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT); });

describe('§31-2 押しの表は、雑魚に当てた実際の押しと合っている', () => {
  const PREFIX: Record<string, readonly BrawlerRouteNode[]> = {
    s1: ['s1'], s2: ['s1', 's2'], s3: ['s1', 's2', 's3'], s4: ['s1', 's2', 's3', 's4'],
    kick1: ['kick1'], kick2: ['kick1', 'kick2'], heel: ['kick1', 'kick2', 'heel'], stomp: ['s1', 'stomp'],
  };
  for (const [a, steps] of Object.entries(PREFIX)) {
    it(`${a}: 手前で当てて、下がり切るまで`, () => {
      setup();
      placeAt(60);
      for (let i = 0; i < steps.length; i++) {
        if (i === steps.length - 1) placeAt(BRAWLER_STANDOFF_PX);
        expect(issue(steps[i])).toBe(true);
        for (let f = 0; f < 400 && !(nodeNow() === steps[i] && br().resolved); f++) adv();
        expect(br().connected, `${steps[i]} connected`).toBe(true);
        if (i < steps.length - 1) for (let f = 0; f < 400 && !validNow(steps[i], steps[i + 1]); f++) adv();
      }
      const d0 = dist();
      let dmax = d0;
      for (let f = 0; f < 90; f++) { adv(); dmax = Math.max(dmax, dist()); }
      const push = dmax - d0;
      const table = BRAWLER_PUSH_ZOMBIE_PX[a as BrawlerRouteNode]!;
      expect(push, `${a} の押し`).toBeLessThanOrEqual(table);
      expect(push, `${a} の押し(表が大きすぎない)`).toBeGreaterThanOrEqual(table - 2);
    });
  }
});

describe('飛び蹴り2発目は、あまり飛ばさず少し打ち上げる(社長指示2026-11-12「じゃないと踵落としが届かない」)', () => {
  it('雑魚・地上: 2発目の押しは 10px 以下で、地上から浮く', () => {
    setup();
    placeAt(60);
    expect(issue('kick1')).toBe(true);
    for (let f = 0; f < 400 && !(nodeNow() === 'kick1' && br().resolved); f++) adv();
    expect(br().connected, 'kick1 connected').toBe(true);
    for (let f = 0; f < 400 && !validNow('kick1', 'kick2'); f++) adv();
    placeAt(BRAWLER_STANDOFF_PX); // 地上の雑魚に2発目を当てる(1発目は地上からは浮かせない)
    expect((en().brLiftUntil ?? 0) > now, '2発目の前は地上').toBe(false);
    expect(issue('kick2')).toBe(true);
    for (let f = 0; f < 400 && !(nodeNow() === 'kick2' && br().resolved); f++) adv();
    expect(br().connected, 'kick2 connected').toBe(true);
    expect((en().brLiftUntil ?? 0) > now, '2発目で浮く(打ち上げは今どおり)').toBe(true);
    const d0 = dist();
    let dmax = d0;
    for (let f = 0; f < 90; f++) { adv(); dmax = Math.max(dmax, dist()); }
    expect(dmax - d0, 'kick2 の押し').toBeLessThanOrEqual(10);
  });
});

describe('§31-2 代表の道は、手前から始めて、続きを一番早く出しても一番遅く出しても雑魚に当たる', () => {
  const ROUTES: readonly (readonly BrawlerRouteNode[])[] = [
    ['s1', 's2', 's3', 's4', 's5'],
    ['s1', 'kick1', 'kick2', 'kick3'],
    ['kick1', 'kick2', 'kick3'], // 2発目→3発目(2発目は小さい押し+少し打ち上げ・社長指示2026-11-12)
    ['kick1', 'kick2', 'heel'], // 2発目→踵落とし(同)
    ['s1', 's2', 's3', 'kiko'], // 強→気功(気功は §31 の対象外=今まで繋がっていたものが切れない)
  ];
  for (const steps of ROUTES) for (const mode of ['early', 'late'] as const) {
    it(`${steps.join('→')}・${mode === 'early' ? '一番早く' : '一番遅く(固まりが明ける直前)'}`, () => {
      const hitAt = runRoute(steps, mode);
      expect(hitAt.length).toBe(steps.length);
      hitAt.forEach((d, i) => expect(Number.isFinite(d), `${steps.join('→')} ${mode}: ${i + 1}手目(${steps[i]})が当たる`).toBe(true));
    });
  }
});

describe('§31-1 外れる(外れやすさはそのまま)', () => {
  it('1段目: 踏み込み+届く範囲より遠い相手には空振りする(体は踏み込みの距離より先へ出ない)', () => {
    setup();
    placeAt(BRAWLER_LUNGE_PX.s1 + 74 + 10);
    const x0 = pc().x;
    const before = en().lastHit;
    expect(issue('s1')).toBe(true);
    for (let f = 0; f < 40; f++) adv();
    expect(en().lastHit).toBe(before);
    expect(pc().x - x0).toBeLessThanOrEqual(BRAWLER_LUNGE_PX.s1 + 0.5);
  });
  it('1段目: 届く範囲の端の相手には、決まった距離だけ進んで当たる(手前まで詰め切らない)', () => {
    setup();
    placeAt(70);
    const x0 = pc().x;
    const before = en().lastHit;
    expect(issue('s1')).toBe(true);
    for (let f = 0; f < 40 && en().lastHit === before; f++) adv();
    expect(en().lastHit).not.toBe(before);
    // 決まった距離の前後(踏み込みの器はフレームの刻みで積むので1割まで行き過ぎる)。相手の手前(縁から24px)まで詰め切る距離(46px)より短い。
    expect(pc().x - x0).toBeGreaterThan(BRAWLER_LUNGE_PX.s1 - 0.5);
    expect(pc().x - x0).toBeLessThanOrEqual(BRAWLER_LUNGE_PX.s1 * 1.1 + 0.5);
    expect(dist()).toBeGreaterThan(BRAWLER_STANDOFF_PX + 10);
  });
  for (const [label, move] of [['奥へ70px', { x: 70, y: 0 }], ['横へ150px', { x: 0, y: 150 }]] as const) {
    it(`飛び蹴りの3発目: 飛ぶ間に相手が${label}動くと外れる(出した瞬間の行き先のまま・取り直さない)`, () => {
      setup('hunter', 60, { aiPhase: 'windup', aiPhaseUntil: 9e9, aiStartedAt: 0 });
      for (let n = 1; n <= 3; n++) {
        const before = en().lastHit;
        expect(issue('kick1'), `kick ${n}`).toBe(true);
        if (n === 3) {
          for (let f = 0; f < 60 && !(br().phase === 'tech' && br().kickN === 3); f++) adv();
          expect(br().kickN).toBe(3);
          expect(br().kickChargeMs ?? 0).toBe(0); // 蹴り飛ばしは溜め無し=出した後は飛ぶだけ(§33-2)
          // 画面全体の止めが明けて、実際に飛び始めてから相手を動かす(飛ぶ間に動く)
          for (let f = 0; f < 60 && (now < useGameStore.getState().hitstopUntil || brawlerElapsed(br(), gt()) <= 0); f++) adv();
          expect(br().resolved, '飛んでいる間').toBe(false);
          useGameStore.setState(st => ({ enemies: st.enemies.map(e => ({ ...e, x: e.x + move.x, y: e.y + move.y, knockbackVx: 0, knockbackVy: 0, knockbackUntil: 0 })) }));
        }
        for (let f = 0; f < 400 && !(br().phase === 'tech' && br().kickN === n && br().resolved); f++) adv();
        if (n < 3) expect(br().connected, `kick ${n} connected`).toBe(true);
        else { expect(br().connected, 'kick 3 whiffs').toBe(false); expect(en().lastHit).toBe(before); }
      }
    });
  }
  it('飛び蹴りの3発目: 相手が動かなければ当たる(上の外れは取り直しをやめた分だけ)', () => {
    setup('hunter', 60, { aiPhase: 'windup', aiPhaseUntil: 9e9, aiStartedAt: 0 });
    for (let n = 1; n <= 3; n++) {
      expect(issue('kick1')).toBe(true);
      for (let f = 0; f < 400 && !(br().phase === 'tech' && br().kickN === n && br().resolved); f++) adv();
      expect(br().connected, `kick ${n} connected`).toBe(true);
    }
  });
});
