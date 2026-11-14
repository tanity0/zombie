// ★拳鬼も同じ道の表を読む(research/BRAWLER.md §19-1・§19-2・受け入れ条件 §19-4 の7)。
// 実際の制御(runPhantomTick → stepPhantomBrawler)を回して、台本1〜5・台本7(詰めの飛び蹴り→1段目)・台本6(跳びかかり→秘奥義)が
// 新しい規則(道の上・当たった時だけ・取り消しの受付の内・予備動作80msは決めた時点で成立)の下で最後まで出ることを固める。
import { describe, it, expect, beforeEach } from 'vitest';
import { runPhantomTick, createPhantomTickState, NOOP_PHANTOM_SFX } from './phantomTick';
import {
  initialBrawlerState, brawlerRouteAllows, brawlerStageNode, brawlerTechNode, brawlerCancelWindowOpen, brawlerHitLanded, BRAWLER_CANCEL_WINDOW_MS,
  type BrawlerRouteNode,
} from './brawler';
import { PB_SCRIPTS, PB_SCRIPT_IDS, pbScriptKickN, type PbScriptId } from './phantomBrawlerAi';
import { KENKI_PREP_RAISE_MS, KENKI_PREP_CROUCH_MS } from './kenkiPrep';
import { setPhantomIdentity } from './phantomIdentity';
import { uniquePhantomSpec } from '../data/uniquePhantoms';
import { useGameStore } from '../store/gameStore';
import { spawnEnemyAt } from './enemyUtils';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import type { Enemy } from '../types/game';
import type { BrawlerState } from './brawlerTypes';

const START_GT = 10_000_000;
const ORIGIN = 50_000;
/** 台本 id を引く乱数(払える台本が5本とも有る時)。 */
const randFor = (id: PbScriptId): number => (id - 1) / 5 + 0.01;
const nodeOf = (b: BrawlerState): BrawlerRouteNode => (b.phase === 'attack' ? brawlerStageNode(b.stage) : brawlerTechNode(b.tech!, b.kickN));

describe('拳鬼の台本は道の表の上(§19-1)', () => {
  it('台本1〜5の「段→技」「技→技」は全部、道の表にある組', () => {
    for (const id of PB_SCRIPT_IDS) {
      const steps = PB_SCRIPTS[id];
      for (let k = 1; k < steps.length; k++) {
        const a = steps[k - 1], b = steps[k];
        const from = a.kind === 'stage' ? brawlerStageNode(a.stage) : brawlerTechNode(a.tech, pbScriptKickN(steps, k - 1));
        const to = b.kind === 'stage' ? brawlerStageNode(b.stage) : brawlerTechNode(b.tech, pbScriptKickN(steps, k));
        expect(brawlerRouteAllows(from, to), `台本${id}: ${from}→${to}`).toBe(true);
      }
    }
  });
});

describe('拳鬼の台本が新しい規則の下で最後まで出る(結合・§19-4-7)', () => {
  beforeEach(() => {
    setTreesDisabled(true); setTorchesDisabled(true);
    useGameStore.getState().resetGame('rogue');
    const k = uniquePhantomSpec('brawler');
    setPhantomIdentity({ name: k.name, profile: k.profile, source: 'unique' });
  });

  /** 拳鬼を置いて回す。押した行動(段・技)の並びと、取り消しで出した技が「道の上・当たった・受付の内に決めた」かを記録する。 */
  const setup = (offsetX: number, over: Partial<Enemy>, rand: () => number) => {
    const k = uniquePhantomSpec('brawler');
    const e = spawnEnemyAt('guardian-phantom', ORIGIN, ORIGIN, START_GT);
    Object.assign(e, { phantomUnique: 'brawler', phantomBuild: k.profile.snapshot, health: 130, maxHealth: 130, dormant: false, bossState: 'chase' }, over);
    useGameStore.setState(s => ({
      enemies: [e], projectiles: [], gameTime: START_GT,
      player: { ...s.player, x: e.x + e.width / 2 + offsetX, y: e.y + e.height / 2 - s.player.height / 2, health: 99999, maxHealth: 99999, invulnerable: false, invulnerableTime: 0 },
    }));
    let gt = START_GT;
    const st = createPhantomTickState();
    const seq: string[] = [];
    /** 取り消しで出た技ごとの記録: 前の行動の節 → 出た技の節・予備動作を始めた(=決めた)時に受付が開いていたか・前の行動が当たっていたか。 */
    const cancels: { from: BrawlerRouteNode; to: BrawlerRouteNode; decidedInWindow: boolean; landed: boolean; prepMs: number }[] = [];
    let lastStart = -1, prevB: BrawlerState | undefined, prepFrom: BrawlerState | undefined, prepAt = -1, sawSecret = false, sawLeap = false;
    const cur = (): Enemy => useGameStore.getState().enemies.find(x => x.id === e.id)!;
    const step = (ms: number): void => {
      const before = cur();
      const b0 = before.phantomBrawler;
      const wasPrep = before.gpBrawlerPrep !== undefined;
      gt += ms;
      useGameStore.setState({ gameTime: gt });
      runPhantomTick(before, st, gt, ms / 1000, 1, gt, NOOP_PHANTOM_SFX, rand);
      const now = cur();
      const b = now.phantomBrawler;
      if (now.aiPhase === 'jump') sawLeap = true;
      if (b?.secret) sawSecret = true;
      // 予備動作を始めた tick=技を決めた時点(その時の行動の状態を覚える)
      if (!wasPrep && now.gpBrawlerPrep !== undefined) { prepFrom = b0; prepAt = gt; }
      if (b && b.phase !== 'idle' && b.startAt !== lastStart && !b.secret) {
        lastStart = b.startAt;
        seq.push(b.phase === 'attack' ? `s${b.stage}` : b.tech === 'kick' ? `kick${b.kickN}` : String(b.tech));
        if (b.phase === 'tech' && b.tech !== 'guard') {
          // この技を決めた時点の行動(予備動作つきなら予備動作を始めた時・無ければ直前の tick)
          const hadPrep = prepFrom !== undefined && gt - prepAt <= 200;
          const from = hadPrep ? prepFrom : prevB;
          const decidedAt = hadPrep ? prepAt : gt;
          if (from && from.phase !== 'idle' && !(from.phase === 'tech' && from.tech === 'kick' && b.tech === 'kick')) {
            cancels.push({
              from: nodeOf(from), to: nodeOf(b), landed: brawlerHitLanded(from),
              // 決めた tick の1つ前の時刻で受付が開いていた(頭脳は tick の中で、その tick の時刻で決める)
              decidedInWindow: brawlerCancelWindowOpen(from, decidedAt) || brawlerCancelWindowOpen(from, decidedAt - ms),
              prepMs: hadPrep ? gt - prepAt : 0,
            });
          }
          prepFrom = undefined;
        }
      }
      prevB = b;
    };
    return { step, seq, cancels, cur, st, get sawSecret() { return sawSecret; }, get sawLeap() { return sawLeap; } };
  };
  const label = (id: PbScriptId): string[] => PB_SCRIPTS[id].map((x, k) => (x.kind === 'stage' ? `s${x.stage}` : x.tech === 'kick' ? `kick${pbScriptKickN(PB_SCRIPTS[id], k)}` : x.tech));
  /** seq の中に want が続きで現れるか。 */
  const hasRun = (seq: readonly string[], want: readonly string[]): boolean => {
    for (let i = 0; i + want.length <= seq.length; i++) if (want.every((w, k) => seq[i + k] === w)) return true;
    return false;
  };

  for (const id of PB_SCRIPT_IDS) {
    it(`台本${id}(${PB_SCRIPTS[id].map(x => (x.kind === 'stage' ? x.stage : x.tech)).join('→')})が最後まで出る・取り消しは道の上/当たった時/受付の内に決めている`, () => {
      const h = setup(40, { phantomBrawler: { ...initialBrawlerState(), points: 20 } }, () => randFor(id));
      const want = label(id);
      for (let i = 0; i < 400 && !hasRun(h.seq, want); i++) h.step(16);
      // 台本の前に構えが1回入ることがある(乱数を小さく固定した時の、間合いの圧で振る構え)=並びの中に台本が続きで出ていること。
      expect(hasRun(h.seq, want), `台本${id}: ${h.seq.join(',')}`).toBe(true);
      for (const c of h.cancels) {
        expect(brawlerRouteAllows(c.from, c.to), `${c.from}→${c.to}`).toBe(true);
        expect(c.landed, `${c.from}→${c.to} landed`).toBe(true);
        expect(c.decidedInWindow, `${c.from}→${c.to} decided in the window`).toBe(true);
      }
      // 台本2〜5 は取り消しを含む(台本1は段だけ)
      const techSteps = PB_SCRIPTS[id].filter((x, k) => x.kind === 'tech' && !(x.tech === 'kick' && pbScriptKickN(PB_SCRIPTS[id], k) > 1)).length;
      expect(h.cancels.length).toBeGreaterThanOrEqual(techSteps);
    });
  }
  it('予備動作(80ms)は受付で落ちない: 台本2の 3段目→飛び蹴り(しゃがみ)・飛び蹴り→大叩き潰し(腕上げ)・大叩き潰し→気功(腕上げ)が、予備動作の後に出る', () => {
    expect([KENKI_PREP_RAISE_MS, KENKI_PREP_CROUCH_MS, BRAWLER_CANCEL_WINDOW_MS]).toEqual([80, 80, 195]);
    const h = setup(40, { phantomBrawler: { ...initialBrawlerState(), points: 20 } }, () => randFor(2));
    for (let i = 0; i < 400 && !hasRun(h.seq, label(2)); i++) h.step(16);
    expect(h.cancels.map(c => `${c.from}→${c.to}`)).toEqual(['s3→kick1', 'kick1→stomp', 'stomp→kiko']);
    for (const c of h.cancels) {
      expect(c.prepMs, `${c.from}→${c.to} prep`).toBeGreaterThanOrEqual(80);
      expect(c.prepMs, `${c.from}→${c.to} prep`).toBeLessThanOrEqual(80 + 32);
    }
  });
  it('台本7: 詰めの飛び蹴り(待機から)が当たったら、蹴りの後の1段目(待機から=取り消しではない)から台本へ続く', () => {
    // 届く距離の外(縁120px)・ポイント1(蹴りの後は0=払えるのは台本1)・乱数は小さく(拍で跳ぶ)
    const h = setup(120, { phantomBrawler: { ...initialBrawlerState(), points: 1 } }, () => 0.01);
    for (let i = 0; i < 500 && !hasRun(h.seq, ['kick1', 's1', 's2', 's3', 's4', 's5']); i++) h.step(16);
    expect(hasRun(h.seq, ['kick1', 's1', 's2', 's3', 's4', 's5'])).toBe(true);
    expect(h.cancels).toEqual([]); // 取り消しは無い(蹴り→1段目は先行入力=技が終わって待機へ戻った瞬間に出る)
  });
  it('台本6: 跳びかかり→秘奥義(→↓←↑)。1手目の蹴りは待機から・蹴り→大叩き潰し→気功は道の上・構えは気功を撃った後の受付の内', () => {
    const k = uniquePhantomSpec('brawler');
    const h = setup(110, { phantomBrawler: { ...initialBrawlerState(), points: 20 }, phantomBuild: k.profile.snapshot, health: 65 }, () => 0.999);
    for (let i = 0; i < 900 && !h.sawSecret; i++) h.step(16);
    expect(h.sawLeap).toBe(true);
    expect(h.sawSecret).toBe(true);
    expect(hasRun(h.seq, ['kick1', 'stomp', 'kiko'])).toBe(true);
    for (const c of h.cancels) expect(brawlerRouteAllows(c.from, c.to), `${c.from}→${c.to}`).toBe(true);
  });
});
