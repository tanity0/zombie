// research/BRAWLER_PHANTOM.md §16: 拳鬼の攻めの台本(頭脳の純関数)。受け入れ条件 §16-6 の1〜3。
import { describe, expect, it } from 'vitest';
import {
  createPhantomBrawlerMind, decidePhantomBrawler, pbAffordableScripts, pbPickScript, pbScriptCost, pbSecretAfterLeap, pbHpPolicy,
  pbInterruptScript, pbScriptFinisherKiko, phantomBrawlerBreath, pbOnLeapJumped, pbOnShukuchi, pbUndoStamps, PB_BREATH_MIN_MS, PB_SCRIPT_IDS,
  type PhantomBrawlerInput, type PhantomBrawlerMind, type PbScriptId,
} from './phantomBrawlerAi';
import {
  initialBrawlerState, brawlerStartAttack, brawlerStartTech, brawlerAfterResolve, brawlerFinish, brawlerStageForPress, brawlerNextKickN,
  brawlerTechCost, brawlerDueEvent, brawlerStageSpec, BRAWLER_KICK_HITSTOP_MS, BRAWLER_STOMP_HITSTOP_MS, BRAWLER_KICK_CHAIN_MS,
} from './brawler';
import { KENKI_PREP_RAISE_MS } from './kenkiPrep';
import { brawlerTimeKeeperDiscount } from './brawlerSkills';
import type { BrawlerState, BrawlerTechKind } from './brawlerTypes';

const T = 1_000_000;
const disc = (k: BrawlerTechKind): number => brawlerTimeKeeperDiscount(k, 3);
const base = (o: Partial<PhantomBrawlerInput> = {}, s: Partial<BrawlerState> = {}): PhantomBrawlerInput => ({
  s: { ...initialBrawlerState(), ...s }, t: T, edgeDist: 40, reach: 74, reachReady: true, playerReach: 74, kikoClear: true,
  discount: disc, counterChance: 0, meleeBias: 0.95, bullet: null, rand: () => 0.999, ...o,
});
/** 払える台本が全部(1〜5)の時に、id を引く乱数。 */
const randFor = (id: PbScriptId): number => (id - 1) / 5 + 0.01;

/**
 * 頭脳の決めを、プレイヤーと同じ純関数で状態へ当てていく小さな運転手(当たりは全部「体力を削った」)。
 * 押した順(段='s1'..'s5'・技名)を返す。
 */
const drive = (id: PbScriptId, o: { missAt?: number } = {}): { seq: string[]; m: PhantomBrawlerMind } => {
  const m = createPhantomBrawlerMind();
  let t = T;
  let s: BrawlerState = { ...initialBrawlerState(), points: 20 };
  const seq: string[] = [];
  const decide = () => decidePhantomBrawler(base({ t, rand: () => randFor(id) }, s), m);
  const first = decide();
  expect(first).toEqual({ kind: 'attack' });
  expect(m.script?.id).toBe(id);
  s = brawlerStartAttack(s, brawlerStageForPress(s, t), t, false); seq.push(`s${s.stage}`);
  for (let k = 0; k < 20; k++) {
    // 判定を解く(o.missAt 手目は外す)。★判定の時刻=出だしの終わり(§19-2: 取り消しの受付は判定を解いた時刻から数える=
    //   出だしを飛ばして解くと受付が開かない。旧の運転手は出した時刻のまま解いていた)。
    t = Math.max(t, s.startAt + s.windupMs);
    const miss = o.missAt === seq.length;
    s = brawlerAfterResolve(s, t, miss ? 0 : 1, { pointCap: 20, countPoint: s.phase === 'attack', hitstopMs: 0 });
    // 蹴りの連続の受付は着いた瞬間に制御が張る(phantomBrawlerTick.resolveAction と同じ)。
    if (s.phase === 'tech' && s.tech === 'kick') s = { ...s, kickChainUntil: s.kickN >= 3 ? 0 : t + 650, kickCount: s.kickN >= 3 ? 0 : s.kickN };
    if (!miss) m.landedStartAt = s.startAt;
    t += 1;
    const a = decide();
    if (!a) break;
    if (a.kind === 'buffer') {
      s = { ...s, buffered: true };
      t += 1;
      expect(decide()).toBeNull(); // 先行入力の後、前の段の終わりを待っている間は何もしない(台本は続く)
      expect(m.script).not.toBeNull();
      const f = brawlerFinish(s, t);
      s = f.state;
      expect(f.fire).toBe(true);
      s = brawlerStartAttack(s, brawlerStageForPress(s, t), t, false); seq.push(`s${s.stage}`);
    } else if (a.kind === 'tech') {
      const kickN = a.tech === 'kick' ? brawlerNextKickN(s, t) : 0;
      const cancel = s.phase === 'tech' && !(a.tech === 'kick' && s.tech === 'kick');
      s = { ...brawlerStartTech(s, a.tech, t, kickN, cancel), points: s.points - brawlerTechCost(a.tech, false, disc(a.tech)) };
      seq.push(a.tech);
    } else {
      throw new Error(`unexpected ${a.kind}`);
    }
  }
  return { seq, m };
};

describe('台本1〜5は書いた順に押す(§16-1)', () => {
  it('1: 通常5連', () => expect(drive(1).seq).toEqual(['s1', 's2', 's3', 's4', 's5']));
  it('2: 1-2-3 → 飛び蹴り → 大叩き潰し → 気功(続けて出す・社長裁定 §16-8)', () => expect(drive(2).seq).toEqual(['s1', 's2', 's3', 'kick', 'stomp', 'kiko']));
  it('3: 1-2 → 気功', () => expect(drive(3).seq).toEqual(['s1', 's2', 'kiko']));
  it('4: 1-2-3-4 → 大叩き潰し', () => expect(drive(4).seq).toEqual(['s1', 's2', 's3', 's4', 'stomp']));
  it('5: 1 → 飛び蹴り×3', () => expect(drive(5).seq).toEqual(['s1', 'kick', 'kick', 'kick']));
  it('出し切ったら台本は終わる', () => {
    for (const id of PB_SCRIPT_IDS) expect(drive(id).m.script).toBeNull();
  });
});

describe('台本の選び方', () => {
  it('払えない台本は選ばれない(値段=始める時点で全部・タイムキーパーの割引込み)', () => {
    expect(pbScriptCost(1, disc)).toBe(0);
    expect(pbAffordableScripts(0, disc)).toEqual([1]);
    expect(pbAffordableScripts(1, disc)).toEqual([1, 3]);           // 気功1
    expect(pbAffordableScripts(3, disc)).toEqual([1, 3, 5]);        // 蹴り×3
    expect(pbAffordableScripts(4, disc)).toEqual([1, 3, 4, 5]);     // 潰し4
    expect(pbAffordableScripts(6, disc)).toEqual([1, 2, 3, 4, 5]);  // 蹴り+潰し+気功
    for (let r = 0; r < 1; r += 0.05) expect([1, 3]).toContain(pbPickScript(1, disc, null, () => r));
  });
  it('直前と同じ台本は引かない(払えるのが1本だけなら同じでよい)', () => {
    for (const last of PB_SCRIPT_IDS) {
      for (let r = 0; r < 1; r += 0.02) expect(pbPickScript(20, disc, last, () => r)).not.toBe(last);
    }
    expect(pbPickScript(0, disc, 1, () => 0.5)).toBe(1);
    // 頭脳の中でも: 同じ心で続けて始めると、前の台本は引かない
    const m = createPhantomBrawlerMind();
    decidePhantomBrawler(base({ rand: () => 0.999 }, { points: 20 }), m);
    const first = m.script!.id;
    m.script = null;
    decidePhantomBrawler(base({ rand: () => 0.999 }, { points: 20 }), m);
    expect(m.script!.id).not.toBe(first);
  });
  it('等しい確率(払える台本の数で割る)', () => {
    const seen = new Map<number, number>();
    for (let i = 0; i < 500; i++) { const id = pbPickScript(20, disc, null, () => (i + 0.5) / 500); seen.set(id, (seen.get(id) ?? 0) + 1); }
    expect([...seen.values()]).toEqual([100, 100, 100, 100, 100]);
  });
});

describe('途中で外れたら打ち切る・割り込みも打ち切り(§16-1・§16-7)', () => {
  it('2段目が外れたら3段目は出ない', () => {
    const r = drive(1, { missAt: 2 });
    expect(r.seq).toEqual(['s1', 's2']);
    expect(r.m.script).toBeNull();
  });
  it('台本2の飛び蹴りが外れたら潰し・気功は出ない', () => {
    expect(drive(2, { missAt: 4 }).seq).toEqual(['s1', 's2', 's3', 'kick']);
  });
  it('構えで受けられた・0ダメージ(触れたが体力を削っていない)は外れ扱い', () => {
    const m = createPhantomBrawlerMind();
    decidePhantomBrawler(base({ rand: () => randFor(1) }), m);
    let s = brawlerStartAttack({ ...initialBrawlerState() }, 1, T, false);
    s = brawlerAfterResolve(s, T, 1, { pointCap: 20, countPoint: true, hitstopMs: 0 }); // connected だが landed を書かない
    expect(decidePhantomBrawler(base({ t: T + 1 }, s), m)).toBeNull();
    expect(m.script).toBeNull();
  });
  it('次の技が払えない=打ち切り', () => {
    const m = createPhantomBrawlerMind();
    decidePhantomBrawler(base({ rand: () => randFor(3) }, { points: 20 }), m);
    m.script = { id: 3, idx: 2 }; // 1-2 まで出した
    let s = brawlerStartAttack({ ...initialBrawlerState(), points: 0 }, 2, T, false);
    s = brawlerAfterResolve(s, T, 1, { pointCap: 20, countPoint: false, hitstopMs: 0 });
    m.landedStartAt = s.startAt;
    expect(decidePhantomBrawler(base({ t: T + 1 }, s), m)).toBeNull();
    expect(m.script).toBeNull();
  });
  it('殴られた・縮地(制御が pbInterruptScript を呼ぶ)/構え・ステップが入った=打ち切り', () => {
    const m = createPhantomBrawlerMind();
    decidePhantomBrawler(base({ rand: () => randFor(1) }), m);
    expect(m.script).not.toBeNull();
    pbInterruptScript(m);
    expect(m.script).toBeNull();
    m.breathOwed = false; m.nextStringAt = 0; // 打ち切りの後の息継ぎを飛ばして、次の台本を始める
    decidePhantomBrawler(base({ rand: () => randFor(1) }), m);
    expect(m.script).not.toBeNull();
    // ★§19-1(拳鬼も同じ道の表): 構えは待機からだけ。通常攻撃の最中には構えられない(殴っている間は守れない)=台本は続く。
    //   (旧: 通常攻撃のどこからでも構えを出せたので、段の出だしでも弾を構えで返して台本を打ち切っていた。)
    const s = brawlerStartAttack({ ...initialBrawlerState(), points: 9 }, 1, T, false);
    expect(decidePhantomBrawler(base({ bullet: { kind: 'counter' } }, s), m)).toBeNull();
    expect(m.script).not.toBeNull();
    // 待機(段のつなぎの間など)で構えが入った=打ち切り
    expect(decidePhantomBrawler(base({ bullet: { kind: 'counter' } }, { points: 9 }), m)).toEqual({ kind: 'tech', tech: 'guard' });
    expect(m.script).toBeNull();
  });
});

describe('台本7: 詰めの飛び蹴りが当たったら 1〜5 へ(§16-2・§16-7)', () => {
  const seq = (...v: number[]) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };
  const kickOut = (m: PhantomBrawlerMind) => {
    expect(decidePhantomBrawler(base({ edgeDist: 100, rand: seq(0, 0.5, 0) }, { points: 1 }), m)).toEqual({ kind: 'tech', tech: 'kick' });
    expect(m.approachKick).toBe(true);
    let s = brawlerStartTech({ ...initialBrawlerState(), points: 0 }, 'kick', T, 1);
    s = brawlerAfterResolve(s, T + 10, 1, { pointCap: 20, countPoint: false, hitstopMs: 0 });
    return s;
  };
  it('当たったら蹴りの最中に1段目を先行入力する(息継ぎ・反応の下限は掛けない)・台本は蹴りの後の残りで払える物から', () => {
    const m = createPhantomBrawlerMind();
    const s = kickOut(m);
    m.nextStringAt = T + 99_999; // 息継ぎ中でも続ける
    m.landedStartAt = s.startAt;
    expect(decidePhantomBrawler(base({ t: T + 11, reachReady: false, rand: () => 0.999 }, s), m)).toEqual({ kind: 'buffer' });
    expect(m.script?.fromKick).toBe(true);
    expect(m.script!.id).toBe(1); // 蹴りを払った残り(0)で払える台本=台本1だけ
    // 先行入力した後は、蹴りの終わりを待つ(台本は続く)
    expect(decidePhantomBrawler(base({ t: T + 12 }, { ...s, buffered: true }), m)).toBeNull();
    expect(m.script).not.toBeNull();
  });
  it('外れたら続かない', () => {
    const m = createPhantomBrawlerMind();
    const s = kickOut(m); // landed を書かない
    expect(decidePhantomBrawler(base({ t: T + 11 }, s), m)).toBeNull();
    expect(m.script).toBeNull();
    expect(m.approachKick).toBe(false);
  });
  it('蹴りの押しで届く距離の外へ出たら打ち切り(先行入力も捨てる)', () => {
    const m = createPhantomBrawlerMind();
    const s = kickOut(m);
    m.landedStartAt = s.startAt;
    decidePhantomBrawler(base({ t: T + 11 }, s), m);
    expect(decidePhantomBrawler(base({ t: T + 12, edgeDist: 120 }, { ...s, buffered: true }), m)).toEqual({ kind: 'drop' });
    expect(m.script).toBeNull();
  });
});

describe('台本6: HP半分以下・ポイント満タン → 跳びかかり → 秘奥義(§16-3・§16-8)', () => {
  const full = { hpFrac: 0.5, pointCap: 20, leap: { eligible: false, underFire: false, eligibleNear: true } };
  it('HP半分超・ポイント不足・間隔の中では狙わない', () => {
    const m = createPhantomBrawlerMind();
    expect(decidePhantomBrawler(base({ ...full, hpFrac: 0.51 }, { points: 20 }), m)).not.toEqual({ kind: 'leap' });
    expect(decidePhantomBrawler(base({ ...full }, { points: 19 }), createPhantomBrawlerMind())).not.toEqual({ kind: 'leap' });
    const m3 = createPhantomBrawlerMind(); m3.lastSecretAt = T - 1000;
    expect(decidePhantomBrawler(base({ ...full }, { points: 20 }), m3)).not.toEqual({ kind: 'leap' });
  });
  it('条件が揃うと近くても跳ぶ(距離の下限は外す)・着地後に秘奥義を狙う(1手目=蹴り)', () => {
    const m = createPhantomBrawlerMind();
    expect(decidePhantomBrawler(base({ ...full, edgeDist: 40 }, { points: 20 }), m)).toEqual({ kind: 'leap' });
    expect(m.leapForSecret).toBe(true);
    pbSecretAfterLeap(m);
    expect(m.secretPlan).toBe(true);
    expect(decidePhantomBrawler(base({ ...full, edgeDist: 40 }, { points: 20 }), m)).toEqual({ kind: 'tech', tech: 'kick' });
  });
  it('蹴りが外れたら秘奥義は出ない(狙いを打ち切る)', () => {
    const m = createPhantomBrawlerMind();
    decidePhantomBrawler(base({ ...full }, { points: 20 }), m);
    pbSecretAfterLeap(m);
    decidePhantomBrawler(base({ ...full }, { points: 20 }), m);
    // 蹴りが外れて(順番は0のまま)待機へ戻った
    decidePhantomBrawler(base({ ...full, t: T + 500 }, { points: 19, secretProgress: 0 }), m);
    expect(m.secretPlan).toBe(false);
  });
  it('跳ばなかった(溜めで取り消された)跳びは秘奥義につながらない', () => {
    const m = createPhantomBrawlerMind();
    pbSecretAfterLeap(m);
    expect(m.secretPlan).toBe(false);
  });
  // 検収監査2026-11-10: 「使った」記録は技が実際に出た時に書く。
  it('秘奥義の間隔は、跳びかかりを決めた時ではなく実際に跳んだ時に使う', () => {
    const m = createPhantomBrawlerMind();
    expect(decidePhantomBrawler(base({ ...full }, { points: 20 }), m)).toEqual({ kind: 'leap' });
    expect(m.lastSecretAt).toBe(-Infinity); // 決めただけでは使わない(溜めで取り消されたら、また狙える)
    pbOnLeapJumped(m, T + 2000);
    expect(m.lastSecretAt).toBe(T + 2000);
    const m2 = createPhantomBrawlerMind();
    pbOnLeapJumped(m2, T); // 台本6ではない跳びかかりでは使わない
    expect(m2.lastSecretAt).toBe(-Infinity);
  });
  it('決めた時点の打刻(詰めの蹴り・気功の単発・秘奥義の1手目の印)は巻き戻せる', () => {
    const seq = (...v: number[]) => { let k = 0; return () => v[Math.min(k++, v.length - 1)]; };
    const m = createPhantomBrawlerMind();
    m.lastKickAt = T - 9000;
    expect(decidePhantomBrawler(base({ edgeDist: 100, rand: seq(0, 0.5, 0) }, { points: 1 }), m)).toEqual({ kind: 'tech', tech: 'kick' });
    expect(m.lastKickAt).toBe(T);
    pbUndoStamps(m, m.undo);
    expect(m.lastKickAt).toBe(T - 9000);
    const k = createPhantomBrawlerMind();
    expect(decidePhantomBrawler(base({ edgeDist: 400, rand: () => 0 }, { points: 1 }), k)).toEqual({ kind: 'tech', tech: 'kiko' });
    expect(k.lastKikoAt).toBe(T);
    pbUndoStamps(k, k.undo);
    expect(k.lastKikoAt).toBe(-Infinity);
    const q = createPhantomBrawlerMind();
    q.leapForSecret = true; pbSecretAfterLeap(q);
    expect(decidePhantomBrawler(base({ ...full }, { points: 20 }), q)).toEqual({ kind: 'tech', tech: 'kick' });
    expect(q.secretLaunched).toBe(true);
    pbUndoStamps(q, q.undo);
    expect(q.secretLaunched).toBe(false);
    expect(decidePhantomBrawler(base({ ...full, t: T + 100 }, { points: 20 }), q)).toEqual({ kind: 'tech', tech: 'kick' }); // 狙いは続く=出し直す
    // 技を決めなかった判断では巻き戻す物は無い
    expect(decidePhantomBrawler(base({ reachReady: false }), createPhantomBrawlerMind())).toBeNull();
  });
  it('縮地の後は息継ぎを入れない(台本の打ち切りの息継ぎも・行動中→待機の息継ぎも)', () => {
    const m = createPhantomBrawlerMind();
    decidePhantomBrawler(base({ rand: () => randFor(1) }), m);
    m.wasBusy = true; m.nextStringAt = T + 5000;
    pbOnShukuchi(m, T + 50);
    expect(m.script).toBeNull();
    expect(m.breathOwed).toBe(false);
    expect(m.wasBusy).toBe(false);
    expect(m.nextStringAt).toBe(T + 50);
    expect(decidePhantomBrawler(base({ t: T + 50, rand: () => randFor(1) }), m)).toEqual({ kind: 'attack' }); // そのまま次の行動へ
  });
});

describe('HP半分以下は溜める(社長裁定 §16-8「技を使う台本を控えて溜める(通常5連=台本1と構えだけ)」)', () => {
  it('振る舞いは1つの関数で切り替わる', () => {
    expect(pbHpPolicy({ hpFrac: 0.51, pointCap: 20, discount: disc }).hold).toBe(false);
    expect(pbHpPolicy({ hpFrac: 0.5, pointCap: 20, discount: disc })).toMatchObject({ hold: true, scripts: [1], approachKick: false, kikoSingle: false, secretLeap: true });
    expect(pbHpPolicy({ discount: disc }).hold).toBe(false);
  });
  // 検収監査2026-11-10: 技ポイントの上限が秘奥義の合計(タイムキーパーLv3で8)に届かない記録では絞らない(技なしで永久に溜め続けない)。
  it('上限が秘奥義の合計に届かない記録では溜めない(技を使う台本・詰めの蹴りも今どおり)', () => {
    expect(pbHpPolicy({ hpFrac: 0.3, pointCap: 5, discount: disc }).hold).toBe(false);
    expect(pbHpPolicy({ hpFrac: 0.3, pointCap: 8, discount: disc }).hold).toBe(true);
    expect(pbHpPolicy({ hpFrac: 0.3, discount: disc }).hold).toBe(false); // 上限が渡されない呼び手も絞らない
    const m = createPhantomBrawlerMind();
    decidePhantomBrawler(base({ hpFrac: 0.3, pointCap: 5, rand: () => 0.999 }, { points: 5 }), m);
    expect(m.script?.id).not.toBe(1); // 払える台本(1・3・4・5)の最後=5
  });
  it('台本は1だけ・詰めの飛び蹴りと気功の単発は出さない', () => {
    for (let r = 0; r < 1; r += 0.1) {
      const m = createPhantomBrawlerMind();
      decidePhantomBrawler(base({ hpFrac: 0.4, pointCap: 20, rand: () => r }, { points: 10 }), m);
      expect(m.script?.id).toBe(1);
    }
    const kick = decidePhantomBrawler(base({ hpFrac: 0.4, pointCap: 20, edgeDist: 100, rand: () => 0 }, { points: 10 }), createPhantomBrawlerMind());
    expect(kick).toBeNull();
    const kiko = decidePhantomBrawler(base({ hpFrac: 0.4, pointCap: 20, edgeDist: 400, rand: () => 0 }, { points: 10 }), createPhantomBrawlerMind());
    expect(kiko).toBeNull();
  });
  it('構えは出す', () => {
    expect(decidePhantomBrawler(base({ hpFrac: 0.4, pointCap: 20, bullet: { kind: 'counter' }, edgeDist: 300 }, { points: 10 }), createPhantomBrawlerMind()))
      .toEqual({ kind: 'tech', tech: 'guard' });
  });
});

describe('台本の締めの気功(§16-8)', () => {
  it('台本2・3の最後の気功だけ締め扱い(単発・途中の手は違う)', () => {
    const m = createPhantomBrawlerMind();
    expect(pbScriptFinisherKiko(m)).toBe(false);
    m.script = { id: 3, idx: 3 }; expect(pbScriptFinisherKiko(m)).toBe(true);
    m.script = { id: 2, idx: 6 }; expect(pbScriptFinisherKiko(m)).toBe(true);
    m.script = { id: 2, idx: 5 }; expect(pbScriptFinisherKiko(m)).toBe(false);
    m.script = { id: 1, idx: 5 }; expect(pbScriptFinisherKiko(m)).toBe(false);
  });
});

// 社長指摘2026-11-10「音の問題なのかな?拳鬼の攻撃間隔がやたら速い気がする」の是正(頭脳と状態機械だけ・store なし)。
// 張り付き(縁40px)・全部命中で30秒回す。予備動作(80ms)と、制御の「行動中→待機で息継ぎ」も同じ形で真似る。
describe('攻撃間隔: 台本と台本の間に必ず息継ぎ・当たりの数が設計の範囲', () => {
  const run = (seed: number) => {
    let sd = seed;
    const rand = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
    const m = createPhantomBrawlerMind();
    let s: BrawlerState = { ...initialBrawlerState() };
    let prep: { kind: BrawlerTechKind; kickN: number; at: number; cancel: boolean } | null = null;
    const T0 = 1_000_000;
    let hits = 0, wasBusy = false, scriptEndAt = -1, scripts = 0;
    const gaps: number[] = [];
    let prevScript: PhantomBrawlerMind['script'] = null;
    const startTech = (kind: BrawlerTechKind, t: number, kickN: number, cancel: boolean) => {
      s = { ...brawlerStartTech(s, kind, t, kind === 'kick' ? kickN : 0, cancel), points: s.points - brawlerTechCost(kind, false, disc(kind)) };
    };
    for (let t = T0; t < T0 + 30_000; t += 16) {
      for (let g = 0; g < 3; g++) {
        const ev = brawlerDueEvent(s, t);
        if (ev === null) break;
        if (ev === 'resolve') {
          if (s.tech === 'guard') { s = { ...s, resolved: true }; continue; }
          const hs = s.phase === 'attack' ? brawlerStageSpec(s.stage).hitstopMs
            : s.tech === 'kick' ? BRAWLER_KICK_HITSTOP_MS[Math.max(1, Math.min(3, s.kickN))] : s.tech === 'stomp' ? BRAWLER_STOMP_HITSTOP_MS : 0;
          s = brawlerAfterResolve(s, t, 1, { pointCap: 20, countPoint: s.phase === 'attack', hitstopMs: hs });
          if (s.tech === 'kick') s = { ...s, kickChainUntil: s.kickN >= 3 ? 0 : t + BRAWLER_KICK_CHAIN_MS, kickCount: s.kickN >= 3 ? 0 : s.kickN };
          m.landedStartAt = s.startAt;
          hits++;
          continue;
        }
        const f = brawlerFinish(s, t);
        s = f.state;
        if (f.fire) s = brawlerStartAttack(s, brawlerStageForPress(s, t), t, false);
        break;
      }
      const inPrep = prep !== null;
      if (prep && t >= prep.at + KENKI_PREP_RAISE_MS) { const p0 = prep; prep = null; startTech(p0.kind, t, p0.kickN, p0.cancel); }
      const busy = s.phase !== 'idle' || prep !== null;
      if (wasBusy && !busy && !(s.nextStage > 1 && t <= s.chainUntil)) m.nextStringAt = t + phantomBrawlerBreath(rand);
      wasBusy = busy;
      if (inPrep) continue;
      const a = decidePhantomBrawler(base({ t, rand, hpFrac: 1, pointCap: 20 }, s), m);
      if (prevScript && !m.script) { scriptEndAt = t; scripts++; }
      if (!prevScript && m.script && !m.script.fromKick && scriptEndAt > 0) gaps.push(t - scriptEndAt);
      prevScript = m.script ? { ...m.script } : null;
      if (!a) continue;
      if (a.kind === 'attack') s = brawlerStartAttack(s, brawlerStageForPress(s, t), t, false);
      else if (a.kind === 'buffer') s = { ...s, buffered: true };
      else if (a.kind === 'drop') s = { ...s, buffered: false };
      else if (a.kind === 'tech') {
        const kickN = a.tech === 'kick' ? brawlerNextKickN(s, t) : 0;
        const cancel = s.phase === 'tech' && !(a.tech === 'kick' && s.tech === 'kick');
        const needs = a.tech === 'kiko' || a.tech === 'stomp' || (a.tech === 'kick' && kickN === 1);
        if (needs) prep = { kind: a.tech, kickN, at: t, cancel };
        else startTech(a.tech, t, kickN, cancel);
      }
      wasBusy = s.phase !== 'idle' || prep !== null;
    }
    return { hitsPerSec: hits / 30, gaps, scripts };
  };
  it('台本と台本の間は息継ぎ(下限)以上空く・30秒の当たりは約1.4〜1.6発/秒から大きく外れない', () => {
    for (const seed of [1, 7, 42]) {
      const r = run(seed);
      expect(r.scripts).toBeGreaterThan(5);
      expect(r.gaps.length).toBeGreaterThan(4);
      for (const g of r.gaps) expect(g).toBeGreaterThanOrEqual(PB_BREATH_MIN_MS);
      console.log(`[攻撃間隔] seed=${seed} 当たり ${r.hitsPerSec.toFixed(2)}発/秒・台本 ${r.scripts}本・台本の間 最短 ${Math.min(...r.gaps)}ms`);
      expect(r.hitsPerSec).toBeGreaterThan(1.1);
      expect(r.hitsPerSec).toBeLessThan(1.9);
    }
  });
  it('段から技へ移るかは台本を選んだ時に決まっている(毎フレーム引き直さない): 台本1は何度呼んでも技へ移らない', () => {
    const m = createPhantomBrawlerMind();
    decidePhantomBrawler(base({ rand: () => randFor(1) }, { points: 20 }), m);
    let st = brawlerStartAttack({ ...initialBrawlerState(), points: 20 }, 1, T, false);
    st = brawlerAfterResolve(st, T, 1, { pointCap: 20, countPoint: true, hitstopMs: 0 });
    m.landedStartAt = st.startAt;
    for (let k = 1; k <= 16; k++) {
      const a = decidePhantomBrawler(base({ t: T + k, rand: () => 0 }, st), m);
      expect(a?.kind === 'tech').toBe(false);
      if (a?.kind === 'buffer') st = { ...st, buffered: true };
    }
  });
});
