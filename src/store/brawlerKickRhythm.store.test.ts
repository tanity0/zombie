// ★飛び蹴り3段を「ポン・ポン・ドン」のリズムに(research/BRAWLER.md §33・社長裁定2026-11-12)を、実際の AI(updateEnemies)を実際の刻みで回して固める。
//  - 1→2 と 2→3 の当たりの間隔(壁時計)が揃う(差 40ms 以内)。「押せる限り早く連打」と「1発ごとに当たった直後に押す」の2通り。
//  - 画面全体の止めの間、体の絵は当たった蹴りの絵(swing)のまま(次の蹴りを止めの最中に始めても)。止めが明けたら次の蹴りが動き出す。
//  - 3発目(蹴り飛ばし)の当たりの画面全体の止めは BRAWLER_WORLD_STOP_KICK3(340)。1・2発目は今どおり(強)。
// 段取りは brawlerReach.store.test.ts と同じ(係数1.3・雑魚・相手の手前から)。
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { useGameStore } from './gameStore';
import type { Enemy } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setBrawlerTempoAll } from '../utils/brawlerCombo';
import {
  BRAWLER_TEMPO_DEFAULT, BRAWLER_STANDOFF_PX, BRAWLER_WORLD_STOP, BRAWLER_WORLD_STOP_KICK3, initialBrawlerState, brawlerDistTo, brawlerPoseAt, brawlerStandAt,
  type BrawlerState,
} from '../utils/brawler';

const NO = { up: false, down: false, left: false, right: false } as never;
let now = 7_000_000;
const FRAME = 16;

const setup = () => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
    player: {
      ...st.player, health: 99999, maxHealth: 99999, invulnerable: false, subWeapons: ['brawler'], subWeaponLevels: { brawler: 3 },
      lastDirection: { x: 1, y: 0 }, brawler: { ...initialBrawlerState(), points: 20 },
    },
  }));
  const p = useGameStore.getState().player;
  const e = spawnEnemyAt('zombie', 0, 0, useGameStore.getState().gameTime);
  useGameStore.setState({ enemies: [{ ...e, x: p.x + p.width / 2 + 200 - e.width / 2, y: p.y + p.height / 2 - e.height / 2, id: 'z', health: 9_999_999, maxHealth: 9_999_999, dormant: false } as Enemy] });
  // 相手の手前(縁まで BRAWLER_STANDOFF_PX)へ置き直す
  const c = pc();
  const d = brawlerDistTo(c.x, c.y, en());
  useGameStore.setState(st => ({ enemies: st.enemies.map(x => ({ ...x, x: x.x + (BRAWLER_STANDOFF_PX - d) })) }));
};
const en = () => useGameStore.getState().enemies.find(x => x.id === 'z')!;
const br = (): BrawlerState => useGameStore.getState().player.brawler!;
const gt = () => useGameStore.getState().gameTime;
const pc = (): { x: number; y: number } => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const frozen = () => now < useGameStore.getState().hitstopUntil;
const adv = () => {
  const f = frozen();
  now += FRAME;
  if (f) return; // 画面全体の止めの間は壁時計だけ進む(実機のループと同じ)
  useGameStore.getState().setGameTime(gt() + FRAME);
  useGameStore.getState().movePlayer(NO, FRAME / 1000);
  useGameStore.getState().tickBrawler();
  useGameStore.getState().updateEnemies(FRAME / 1000);
};

interface KickRow { n: number; startWall: number; flyWall: number; hitWall: number; stopMs: number }
/**
 * 蹴り3段を出す。mode='mash'=毎フレーム押す(3発目が始まるまで・止めの最中も)/ 'afterHit'=1発目は最初に・2・3発目は当たった直後のフレームに押す。
 * 戻り: 各蹴りの「始めた・飛び始めた(体が動き出した)・当たった」壁時計と、当たりの画面全体の止めの長さ。止めの間の体の絵の破れ(swing でないフレーム)の数。
 */
const run = (mode: 'mash' | 'afterHit') => {
  setup();
  const rows: KickRow[] = [];
  let started = 0;
  let lastKey = '';
  let lastHit = en().lastHit;
  let pressNext = true;
  let poseBreaks = 0, standBreaks = 0, stopFrames = 0;
  let flyPending: KickRow | null = null;
  for (let f = 0; f < 400 && rows.filter(r => r.hitWall > 0).length < 3; f++) {
    if (started < 3 && (mode === 'mash' || pressNext)) {
      useGameStore.getState().brawlerTech(1, 0);
      pressNext = false;
    }
    const b = br();
    const key = b.phase === 'tech' && b.tech === 'kick' ? `${b.startAt}:${b.kickN}` : '';
    if (key && key !== lastKey) {
      started++;
      expect(b.kickN, `${mode}: ${started} 発目`).toBe(started);
      const row: KickRow = { n: b.kickN, startWall: now, flyWall: 0, hitWall: 0, stopMs: 0 };
      rows.push(row);
      flyPending = row;
      lastKey = key;
    }
    adv();
    // 体が次の蹴りの飛ぶ絵(ready)に替わった=動き出した(壁時計)
    if (flyPending && brawlerPoseAt(br(), gt())?.tex === 'ready') { flyPending.flyWall = now; flyPending = null; }
    if (en().lastHit !== lastHit) {
      lastHit = en().lastHit;
      const row = rows[rows.length - 1];
      row.hitWall = now;
      row.stopMs = useGameStore.getState().hitstopUntil - now;
      if (mode === 'afterHit') pressNext = true;
    }
    if (frozen() && rows.some(r => r.hitWall > 0)) {
      // 画面全体の止めの間(押した次の蹴りが始まっていても)、体は当たった蹴りの絵(swing)・影は伸び切ったまま
      stopFrames++;
      if (brawlerPoseAt(br(), gt())?.tex !== 'swing') poseBreaks++;
      const sf = brawlerStandAt(br(), gt());
      if (!sf || sf.kind !== 'kick' || sf.ext < 1) standBreaks++;
    }
  }
  return { rows, poseBreaks, standBreaks, stopFrames };
};

beforeEach(() => {
  now = 7_000_000;
  setBrawlerTempoAll(1.3);
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // 会心を出さない
});
afterEach(() => { vi.restoreAllMocks(); });
afterAll(() => { setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT); });

describe('§33 飛び蹴り3段のリズム(係数1.3・雑魚・相手の手前から)', () => {
  for (const mode of ['mash', 'afterHit'] as const) {
    it(`${mode === 'mash' ? '押せる限り早く連打' : '1発ごとに当たった直後に押す'}: 当たりの間隔が揃い、止めの間は当たった蹴りの絵のまま、3発目の止めは専用の長さ`, () => {
      const { rows, poseBreaks, standBreaks, stopFrames } = run(mode);
      expect(rows.length).toBe(3);
      rows.forEach(r => expect(r.hitWall, `${mode}: ${r.n} 発目が当たる`).toBeGreaterThan(0));
      // ① 1→2 と 2→3 の当たりの間隔の差が 40ms 以内
      const d12 = rows[1].hitWall - rows[0].hitWall, d23 = rows[2].hitWall - rows[1].hitWall;
      expect(Math.abs(d12 - d23), `${mode}: 間隔 ${d12} / ${d23}`).toBeLessThanOrEqual(40);
      // ② 止めの間、体は swing・影は当たった蹴りの伸び切った影
      expect(stopFrames).toBeGreaterThan(0);
      expect(poseBreaks, `${mode}: 止めの間に swing でないフレーム`).toBe(0);
      expect(standBreaks, `${mode}: 止めの間に当たった蹴りの影でないフレーム`).toBe(0);
      // 次の蹴りは止めが明けてから動き出す(止めの最中は当たった蹴りの絵のまま)
      for (const i of [1, 2]) expect(rows[i].flyWall, `${mode}: ${i + 1} 発目は前の止めの明けの後に飛ぶ`).toBeGreaterThan(rows[i - 1].hitWall + rows[i - 1].stopMs - 1);
      // ③ 止めの長さ: 1・2発目=強 / 3発目=蹴り飛ばし専用(テンポ係数は掛けない=壁時計)
      expect(rows.map(r => r.stopMs)).toEqual([BRAWLER_WORLD_STOP.strong, BRAWLER_WORLD_STOP.strong, BRAWLER_WORLD_STOP_KICK3]);
      expect(BRAWLER_WORLD_STOP_KICK3).toBe(340);
    });
  }
});
