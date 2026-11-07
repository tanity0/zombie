// research/JUN_ESCORT.md §1: ステージ4だけ、進軍NPCの隊にジュンが加わり、最初からプレイヤーについて歩き(拠点解放には行かない)、城ボスの少し前に隊を離れる。
// resetGame を直接呼んで「ステージ4だけ」「他のステージの名簿には混ざらない」「離れたら隊から外れる」を固定する。
// localStorage のモックは escortDeployment.test.ts と同じ作法(getSelectedStageId がステージを読めるように)。
import { describe, it, expect, beforeEach } from 'vitest';

const backing: Record<string, string> = {};
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (k in backing ? backing[k] : null),
  setItem: (k: string, v: string) => { backing[k] = v; },
  removeItem: (k: string) => { delete backing[k]; },
  clear: () => { for (const k of Object.keys(backing)) delete backing[k]; },
  key: () => null,
  get length() { return Object.keys(backing).length; },
} as Storage;

const SELECTED_KEY = 'zombie.progress.selectedStage';
const setStage = (id: string) => { backing[SELECTED_KEY] = id; };

import { useGameStore, baseSoldierName, NPC_DIALOGUE_MS } from './gameStore';
import { JUN_ESCORT_INDEX } from '../data/junEscortLines';
import { isJunEscort, JUN_ESCORT_ID, JUN_DEPART_WALK_DELAY_MS, JUN_BASE_ID, JUN_LEFT_BEHIND_PX } from '../utils/junEscort';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import { vi } from 'vitest';
import type { EscortSoldier } from '../types/game';

const roster = () => {
  const s = useGameStore.getState();
  return [...s.escorts, ...s.pendingEscorts];
};
const deploy = () => useGameStore.setState(s => ({ escorts: [...s.escorts, ...s.pendingEscorts], pendingEscorts: [] }));
const tick = (ms: number) => {
  const st = useGameStore.getState();
  useGameStore.setState({ gameTime: st.gameTime + ms });
  useGameStore.getState().updateNpcDialogue(useGameStore.getState().gameTime);
  useGameStore.getState().stepJunDeparture(ms / 1000);
};

beforeEach(() => { for (const k of Object.keys(backing)) delete backing[k]; });

describe('ジュンの同行(ステージ4だけ)', () => {
  it('ステージ4は隊の4人+ジュン。隊の4人は4つの拠点を1人ずつ担当(他のステージと同じ)・ジュンはどの拠点の担当でもなく名簿の末尾', () => {
    setStage('stage-4');
    useGameStore.getState().resetGame('warrior');
    const r = roster();
    expect(r.length).toBe(5);
    const jun = r[r.length - 1];
    expect(jun.id).toBe(JUN_ESCORT_ID);
    expect(jun.soldierIndex).toBe(JUN_ESCORT_INDEX);
    const squad = r.filter(e => !isJunEscort(e));
    expect(squad.length).toBe(4);
    const bases = useGameStore.getState().baseSites.map(b => b.id).sort();
    expect(squad.map(e => e.baseId).sort()).toEqual(bases);
    expect(jun.baseId).toBe(JUN_BASE_ID);
    expect(bases).not.toContain(jun.baseId);
    expect(jun.maxHealth).toBe(r[0].maxHealth);
    expect(r.filter(isJunEscort).length).toBe(1);
    expect(baseSoldierName(JUN_ESCORT_INDEX)).toBe('ジュン');
  });
  it('他のステージの名簿にはジュンが混ざらない(4人のまま)', () => {
    for (const id of ['stage-1', 'stage-3', 'stage-5', 'stage-7', '']) {
      setStage(id);
      for (let k = 0; k < 20; k++) {
        useGameStore.getState().resetGame('warrior');
        const r = roster();
        expect(r.length, id).toBe(4);
        expect(r.some(isJunEscort), id).toBe(false);
        for (const e of r) expect(e.soldierIndex).toBeLessThan(8);
      }
    }
  });
});

describe('ジュンの離脱(隊を外れて城へ歩く)', () => {
  it('一言(文字送りの行)を言い、一拍止まってから向きを変えて歩き出す', () => {
    setStage('stage-4');
    useGameStore.getState().resetGame('warrior');
    deploy();
    useGameStore.setState({ npcDialogue: null, npcDialogueQueue: [], npcDialogueNextAt: 0 });
    const before = useGameStore.getState().escorts.find(isJunEscort)!;
    // 進行方向と逆を向いていた所から
    useGameStore.setState(s => ({ escorts: s.escorts.map(e => (isJunEscort(e) ? { ...e, face: -1 } : e)) }));
    expect(useGameStore.getState().beginJunDeparture(before.x + 500, before.y)).toBe(true);
    let s = useGameStore.getState();
    expect(s.escorts.some(isJunEscort)).toBe(false);
    expect(s.escorts.length).toBe(4);
    expect(s.junDeparture?.phase).toBe('leaving');
    expect(useGameStore.getState().beginJunDeparture(0, 0)).toBe(false);
    // 一言が出る
    tick(16);
    s = useGameStore.getState();
    expect(s.npcDialogue?.text).toBe('変な感じがする…');
    expect(s.npcDialogue?.slow).toBe(true);
    expect(s.npcDialogue!.until - s.gameTime).toBeGreaterThan(NPC_DIALOGUE_MS);
    // 一拍の間は動かない
    const x0 = s.junDeparture!.x;
    for (let t = 0; t < JUN_DEPART_WALK_DELAY_MS - 100; t += 16) tick(16);
    expect(useGameStore.getState().junDeparture!.x).toBe(x0);
    expect(useGameStore.getState().junDeparture!.face).toBe(-1);
    // 歩き出す: 最初はゆっくり、向きは行き先へ
    for (let t = 0; t < 300; t += 16) tick(16);
    const j1 = useGameStore.getState().junDeparture!;
    expect(j1.x).toBeGreaterThan(x0);
    expect(j1.x - x0).toBeLessThan(6);
    expect(j1.face).toBe(1);
    for (let i = 0; i < 60 * 30; i++) tick(16);
    const j2 = useGameStore.getState().junDeparture!;
    expect(j2.phase).toBe('waiting');
  });
  it('離脱の数十秒前から、道中の「変な感じがする…」は出さない', () => {
    setStage('stage-4');
    useGameStore.getState().resetGame('warrior');
    deploy();
    useGameStore.setState({ npcDialogue: null, npcDialogueQueue: [], npcSpokeAt: {}, npcCatAt: {}, junCompanionQuiet: true });
    expect(useGameStore.getState().tryNpcLine('ジュン', 'companion', '変な感じがする…', 0, JUN_ESCORT_ID)).toBe(false);
    useGameStore.setState({ junCompanionQuiet: false });
    expect(useGameStore.getState().tryNpcLine('ジュン', 'companion', '変な感じがする…', 0, JUN_ESCORT_ID)).toBe(true);
  });
  it('置き直しは歩き途中だけ・城の足元に置いたら待つ', () => {
    setStage('stage-4');
    useGameStore.getState().resetGame('warrior');
    deploy();
    const j = useGameStore.getState().escorts.find(isJunEscort)!;
    useGameStore.getState().beginJunDeparture(j.x + 800, j.y);
    useGameStore.getState().relocateJunDeparture(j.x + 500, j.y);
    expect(useGameStore.getState().junDeparture).toMatchObject({ x: j.x + 500, phase: 'leaving', relocated: true });
    useGameStore.getState().relocateJunDeparture(j.x + 800, j.y);
    expect(useGameStore.getState().junDeparture?.phase).toBe('waiting');
  });
  it('新しい出撃では離脱の状態が残らない', () => {
    setStage('stage-4');
    useGameStore.getState().resetGame('warrior');
    const s = useGameStore.getState();
    expect(s.junDeparture).toBeNull();
    expect(s.junCompanionQuiet).toBe(false);
    expect(s.junTransformRealAt).toBe(0);
  });
});

// ---- 最初からプレイヤーについて歩く(社長指示2026-10-19「ジュンは最初からプレイヤーについてくる。拠点解放には行かない。」) ----
const GT = 10_000_000;
let sgt = GT;
const stepSupp = (n = 1, dt = 1 / 60) => {
  for (let k = 0; k < n; k++) {
    sgt += dt * 1000;
    useGameStore.getState().setGameTime(sgt);
    useGameStore.getState().updateSuppression(dt);
  }
};
/** プレイヤーを (x,y)(中心)へ置き、カメラも中心に合わせる(ジュンは画面内)。 */
const putPlayer = (x: number, y: number) => useGameStore.setState(s => ({
  player: { ...s.player, x: x - s.player.width / 2, y: y - s.player.height / 2, vx: 0, vy: 0, lastDirection: { x: 1, y: 0 } },
  camera: { x: x - 215, y: y - 466 },
}));
const jun = (): EscortSoldier => useGameStore.getState().escorts.find(isJunEscort)!;
/** ステージ4で出撃し、隊を出陣させる。ジュンは (jx,jy)、隊の4人は sq(i) の位置、プレイヤーは (px,py)。 */
const setupStage4 = (o: { jx: number; jy: number; px: number; py: number; sq?: (e: EscortSoldier, i: number) => Partial<EscortSoldier>; withJun?: boolean }) => {
  sgt = GT;
  setStage('stage-4');
  useGameStore.getState().resetGame('assault');
  deploy();
  useGameStore.setState(s => ({
    gameTime: GT, gameBounds: { width: 430, height: 932 }, viewZoom: 1,
    enemies: [], projectiles: [], pumpkinBlasts: [], activeEvent: null,
    player: { ...s.player, health: 9999, maxHealth: 120, invulnerable: false, invulnerableTime: 0 },
    escorts: s.escorts
      .filter(e => (o.withJun ?? true) || !isJunEscort(e))
      .map((e, i) => (isJunEscort(e) ? { ...e, x: o.jx, y: o.jy, face: 1 } : { ...e, x: 30_000 + i * 500, y: 30_000, ...(o.sq?.(e, i) ?? {}) })),
  }));
  putPlayer(o.px, o.py);
};

describe('ジュンは最初からプレイヤーについてくる(拠点解放には行かない)', () => {
  beforeEach(() => { setTreesDisabled(true); setTorchesDisabled(true); });
  it('出撃の位置はプレイヤーのそば', () => {
    setStage('stage-4');
    useGameStore.getState().resetGame('assault');
    const s = useGameStore.getState();
    const j = roster().find(isJunEscort)!;
    const p = s.player;
    expect(Math.hypot(j.x - (p.x + p.width / 2), j.y - (p.y + p.height / 2))).toBeLessThan(120);
  });
  it('プレイヤーが拠点と逆へ歩くと、ジュンは拠点へ向かわずプレイヤーについてくる(追い越さない・慣性で歩き出す)', () => {
    setupStage4({ jx: -40, jy: 40, px: 0, py: 0 });
    const s0 = useGameStore.getState();
    // ジュンにとって一番近い拠点と逆の向きへ歩く
    const near = [...s0.baseSites].sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0];
    const L = Math.hypot(near.x, near.y);
    const ux = -near.x / L, uy = -near.y / L;
    stepSupp(30);
    const speeds: number[] = [];
    for (let k = 0; k < 600; k++) {
      putPlayer(ux * k * 1.5, uy * k * 1.5); // 90px/s で拠点と逆へ
      stepSupp(1);
      speeds.push(jun().followSpeed ?? 0);
    }
    const j = jun();
    const p = useGameStore.getState().player;
    const pcx = p.x + p.width / 2, pcy = p.y + p.height / 2;
    expect(Math.hypot(j.x - pcx, j.y - pcy)).toBeLessThan(200);         // そばに居る
    expect(Math.hypot(j.x - near.x, j.y - near.y)).toBeGreaterThan(L);  // 拠点へは寄っていない
    expect(j.followState).toBeUndefined();                               // 駐留兵の状態機械には乗らない
    // 慣性: 速さは1フレームで跳ばない(0.3秒で上げ下げ)
    for (let k = 1; k < speeds.length; k++) expect(Math.abs(speeds[k] - speeds[k - 1])).toBeLessThan(25);
  });
  it('止まっているプレイヤーの後ろ斜めで止まる(止めコマ)', () => {
    setupStage4({ jx: -300, jy: 120, px: 0, py: 0 });
    stepSupp(60 * 10);
    const j = jun();
    const p = useGameStore.getState().player;
    const d = Math.hypot(j.x - (p.x + p.width / 2), j.y - (p.y + p.height));
    expect(d).toBeGreaterThan(50); expect(d).toBeLessThan(100);
    expect(j.moving).toBe(false);
  });
  it('ジュンが拠点の円に立ち続けても、拠点は解放されない・滞在も進まない', () => {
    setupStage4({ jx: 0, jy: 0, px: 0, py: 0 });
    const b = useGameStore.getState().baseSites[0];
    // プレイヤーごと拠点の中心に立つ(ジュンもついてきて円の中に居続ける)
    useGameStore.setState(s => ({ escorts: s.escorts.map(e => (isJunEscort(e) ? { ...e, x: b.x - 30, y: b.y + 20 } : e)) }));
    putPlayer(b.x, b.y);
    stepSupp(60 * 15);
    const s = useGameStore.getState();
    expect(Math.hypot(jun().x - b.x, jun().y - b.y)).toBeLessThan(150);
    expect(s.baseSites.every(x => x.status === 'open')).toBe(true);
    expect(s.baseSites.every(x => x.dwellMs === 0)).toBe(true);
    expect(jun().dwellMs).toBe(0);
  });
  it('隊の軍人が拠点を解放する進み方は、ジュンが居ても居なくても同じ(4人のまま)', () => {
    const captureFrame = (withJun: boolean): number => {
      setupStage4({ jx: 0, jy: 0, px: 0, py: 0, withJun });
      const b = useGameStore.getState().baseSites[0];
      const owner = useGameStore.getState().escorts.findIndex(e => e.baseId === b.id && !isJunEscort(e));
      expect(owner).toBeGreaterThanOrEqual(0);
      // 担当の軍人を拠点の中心へ。プレイヤーとジュンも拠点のそば(ジュンが円の中に居る条件で比べる)。
      useGameStore.setState(s => ({ escorts: s.escorts.map((e, i) => (i === owner ? { ...e, x: b.x, y: b.y } : isJunEscort(e) ? { ...e, x: b.x + 20, y: b.y + 30, dwellMs: 9_500 } : e)) })); // ジュンに滞在の先行を持たせても早まらない
      putPlayer(b.x + 40, b.y);
      for (let f = 1; f <= 60 * 20; f++) {
        stepSupp(1);
        if (useGameStore.getState().baseSites.find(x => x.id === b.id)!.status === 'captured') return f;
      }
      return -1;
    };
    const without = captureFrame(false);
    const withJ = captureFrame(true);
    expect(without).toBeGreaterThan(0);
    expect(withJ).toBe(without);
    expect(useGameStore.getState().escorts.filter(e => !isJunEscort(e)).length).toBe(4);
  });
  it('離されたら「待って…置いていかないで…」を一度(追いつくまで繰り返さない)', () => {
    setupStage4({ jx: 0, jy: 0, px: 0, py: 0 });
    const spy = vi.fn(() => true);
    useGameStore.setState({ tryNpcLine: spy });
    putPlayer(JUN_LEFT_BEHIND_PX + 100, 0);
    stepSupp(30);
    const calls = (spy.mock.calls as unknown as unknown[][]).filter(c => c[1] === 'junLeftBehind');
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe('ジュン');
    expect(calls[0][2]).toBe('待って…置いていかないで…');
  });
  it('隣に居るジュンが、他の軍人の「遠方で放置」(助けを求める通信)を止めない', () => {
    setupStage4({ jx: 10, jy: 10, px: 0, py: 0 });
    const spy = vi.fn(() => true);
    useGameStore.setState({ tryNpcLine: spy });
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0);
    try { stepSupp(1); } finally { rnd.mockRestore(); }
    const calls = (spy.mock.calls as unknown as unknown[][]).filter(c => c[1] === 'neglectFar');
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every(c => c[0] !== 'ジュン')).toBe(true);
  });
});
