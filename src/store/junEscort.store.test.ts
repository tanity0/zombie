// research/JUN_ESCORT.md §1: ステージ4だけ、進軍NPCにジュンが5人目として加わり、城ボスの少し前に隊を離れる。
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
import { isJunEscort, JUN_ESCORT_ID, JUN_DEPART_WALK_DELAY_MS } from '../utils/junEscort';

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
  it('ステージ4は4人+ジュン=5人。ジュンは4人の誰かと同じ拠点の担当で、名簿の末尾', () => {
    setStage('stage-4');
    useGameStore.getState().resetGame('warrior');
    const r = roster();
    expect(r.length).toBe(5);
    const jun = r[r.length - 1];
    expect(jun.id).toBe(JUN_ESCORT_ID);
    expect(jun.soldierIndex).toBe(JUN_ESCORT_INDEX);
    expect(r.slice(0, 4).map(e => e.baseId)).toContain(jun.baseId);
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
