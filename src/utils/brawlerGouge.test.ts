// ★抉り打ち(research/BRAWLER.md §37・§37-7)の溜めと離しの純関数。入力の境目(0.5秒)・溜めが消える条件・段のつなぎ・取り消しの道を固める。
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  BRAWLER_GOUGE_CHARGE_MS, brawlerGougePress, brawlerGougeTick, brawlerGougeReleaseKind, brawlerGougeAfterHurt, brawlerGougeLinkable,
  brawlerGougeFireFrom, brawlerGougeBody, brawlerGougeGlow, brawlerGougeClear, brawlerGougeNoteLinkHits, brawlerLinkWithCarry, brawlerGougeMote,
  BRAWLER_GOUGE_GLOW_DELAY_MS, type BrawlerGougeCtx,
} from './brawlerGouge';
import {
  initialBrawlerState, brawlerStartAttack, brawlerAfterResolve, brawlerStartTech, brawlerFinish, brawlerStageSpec, brawlerRouteAllows, brawlerPoseAt, brawlerStandAt,
  brawlerGougeChargeSink,
  brawlerTechAllowed, brawlerStageGuardCancelOk, BRAWLER_TECHS, BRAWLER_TEMPO_DEFAULT, brawlerStepStart, brawlerSecretStep,
  type BrawlerState,
} from './brawler';
import { setBrawlerTempoAll } from './brawlerCombo';
import { brawlerTimeKeeperDiscount } from './brawlerSkills';

beforeAll(() => { setBrawlerTempoAll(1.3); });
afterAll(() => { setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT); });

const FREE: BrawlerGougeCtx = { gateOk: true, airLocked: false, moveInput: false };
const T0 = 10_000; // gameTime
const N0 = 5_000_000; // Date.now
/** 押して、wallMs の間(10ms 刻みで)時計を回した状態。 */
const hold = (s0: BrawlerState, wallMs: number, ctx: (i: number) => BrawlerGougeCtx = () => FREE): { s: BrawlerState; readyAt: number | null } => {
  let s = brawlerGougePress(s0, T0, N0, ctx(0));
  let readyAt: number | null = null;
  for (let ms = 10; ms <= wallMs; ms += 10) {
    const r = brawlerGougeTick(s, T0 + ms, N0 + ms, ctx(ms));
    s = r.state;
    if (r.ready) readyAt = ms;
  }
  return { s, readyAt };
};
/** 段を当てた直後(止めが明けた後・後隙の中)の状態。 */
const stageHitState = (stage: number): { s: BrawlerState; at: number } => {
  const a = brawlerStartAttack(initialBrawlerState(), stage, T0, false);
  const at = T0 + a.windupMs;
  const s = brawlerAfterResolve(a, at, 1, { pointCap: 20, countPoint: true, hitstopMs: 0, landed: 1 });
  return { s, at };
};

describe('§37-2 0.5秒の境目(実時間・テンポ係数を掛けない)', () => {
  it('待機で押して0.5秒で溜まる(その瞬間に1度だけ合図)。0.5秒未満の離しは今どおり(normal)', () => {
    const r = hold(initialBrawlerState(), 700);
    expect(r.readyAt).toBe(BRAWLER_GOUGE_CHARGE_MS);
    expect(brawlerGougeReleaseKind(r.s, N0 + 700)).toBe('gouge');
    const short = hold(initialBrawlerState(), BRAWLER_GOUGE_CHARGE_MS - 10);
    expect(short.readyAt).toBeNull();
    expect(brawlerGougeReleaseKind(short.s, N0 + BRAWLER_GOUGE_CHARGE_MS - 1)).toBe('normal');
  });
  it('毎フレームの判定より先に離しても、0.5秒経っていれば抉り打ち(境目は時刻で決まる)', () => {
    const s = brawlerGougePress(initialBrawlerState(), T0, N0, FREE);
    expect(brawlerGougeReleaseKind(s, N0 + BRAWLER_GOUGE_CHARGE_MS)).toBe('gouge');
    expect(brawlerGougeReleaseKind(s, N0 + BRAWLER_GOUGE_CHARGE_MS - 1)).toBe('normal');
  });
  it('テンポ係数を変えても境目は500ms のまま', () => {
    setBrawlerTempoAll(1.0);
    expect(hold(initialBrawlerState(), 600).readyAt).toBe(500);
    setBrawlerTempoAll(1.3);
    expect(hold(initialBrawlerState(), 600).readyAt).toBe(500);
  });
  it('溜めの光: 押してから150ms までは一切出ない(タップ・連打は光らない)。そこから溜まるまで直線で強まる。溜めていなければ0', () => {
    const s = brawlerGougePress(initialBrawlerState(), T0, N0, FREE);
    for (let ms = 0; ms <= BRAWLER_GOUGE_GLOW_DELAY_MS; ms += 10) expect(brawlerGougeGlow(s, N0 + ms).level).toBe(0);
    expect(BRAWLER_GOUGE_GLOW_DELAY_MS).toBe(150);
    const a = brawlerGougeGlow(s, N0 + 200).level, b = brawlerGougeGlow(s, N0 + 325).level, c = brawlerGougeGlow(s, N0 + 450).level;
    expect(a).toBeGreaterThan(0.1); // 150ms を超えたらすぐ手応えが返る
    expect(b - a).toBeCloseTo(c - b, 6); // 直線
    expect(brawlerGougeGlow(s, N0 + BRAWLER_GOUGE_CHARGE_MS - 1).level).toBeGreaterThan(0.99);
    expect(brawlerGougeGlow(initialBrawlerState(), N0).level).toBe(0);
    // 0.5秒未満のタップは、構えの絵(沈み)も出ない
    for (let ms = 0; ms <= BRAWLER_GOUGE_GLOW_DELAY_MS; ms += 10) expect(brawlerGougeChargeSink(s, N0 + ms)).toBe(0);
  });
  it('溜めの光: 溜まった後は溜めの終わりの強さ(1)を下回らずに脈打つ(しぼまない)', () => {
    const r = hold(initialBrawlerState(), 800).s;
    let lo = Infinity, hi = -Infinity;
    for (let ms = 500; ms <= 2000; ms += 5) {
      const g = brawlerGougeGlow(r, N0 + ms);
      expect(g.ready).toBe(true);
      lo = Math.min(lo, g.level); hi = Math.max(hi, g.level);
    }
    expect(lo).toBeGreaterThanOrEqual(1);
    expect(hi).toBeGreaterThan(1.1); // 脈打つ
  });
  it('溜めの粒: 光が出ている間だけ、外から拳へ近づいて(加速して)入る。溜まった後は出ない', () => {
    const d = (ms: number) => { const m = brawlerGougeMote(0, ms, false)!; return Math.hypot(m.dx, m.dy); };
    expect(brawlerGougeMote(0, -1, false)).toBeNull();
    expect(d(10)).toBeGreaterThan(d(140));
    expect(d(10) - d(70)).toBeLessThan(d(140) - d(200)); // 後ほど速く縮む=加速
    expect(brawlerGougeMote(0, 100, true)).toBeNull();
  });
});

describe('§37-7 移動で溜めは消える(タッチの遊びの外・PC の移動キー・パッドのスティック)', () => {
  it('遊びの外へ出た指は、戻ってきても離すまで溜めない(離しは今どおり)', () => {
    const r = hold(initialBrawlerState(), 900, ms => ({ ...FREE, moveInput: ms >= 200 && ms < 300 }));
    expect(r.readyAt).toBeNull();
    expect(r.s.gougePressAt).toBeUndefined();
    expect(brawlerGougeReleaseKind(r.s, N0 + 900)).toBe('normal');
  });
  it('移動の入力がある間に押した押下は溜めを始めない', () => {
    const s = brawlerGougePress(initialBrawlerState(), T0, N0, { ...FREE, moveInput: true });
    expect(s.gougePressAt).toBeUndefined();
    expect(brawlerGougeReleaseKind(s, N0 + 900)).toBe('normal');
  });
  it('溜まった後に移動しても消える', () => {
    const r = hold(initialBrawlerState(), 900, ms => ({ ...FREE, moveInput: ms >= 700 }));
    expect(r.readyAt).toBe(500);
    expect(brawlerGougeReleaseKind(r.s, N0 + 900)).toBe('normal');
  });
});

describe('§37-2 出せない時(関所・浮き・秘奥義・技/構え/ステップ)', () => {
  it('関所が閉じている・浮いている間は溜めない(押しても記録しない)', () => {
    expect(brawlerGougePress(initialBrawlerState(), T0, N0, { ...FREE, gateOk: false }).gougePressAt).toBeUndefined();
    expect(brawlerGougePress(initialBrawlerState(), T0, N0, { ...FREE, airLocked: true }).gougePressAt).toBeUndefined();
  });
  it('溜めの途中で関所が閉じたら消える', () => {
    const r = hold(initialBrawlerState(), 800, ms => ({ ...FREE, gateOk: ms < 300 }));
    expect(r.readyAt).toBeNull();
    expect(brawlerGougeReleaseKind(r.s, N0 + 800)).toBe('normal');
  });
  it('技の最中に押した押下は、技が終わった時刻から数える', () => {
    const tech = brawlerStartTech(initialBrawlerState(), 'kiko', T0);
    expect(brawlerGougeBody(tech, T0, FREE)).toBe('wait');
    let s = brawlerGougePress(tech, T0, N0, FREE);
    expect(s.gougeWait).toBe(true);
    // 300ms 後に技が終わる(待機へ)
    for (let ms = 10; ms <= 300; ms += 10) s = brawlerGougeTick(s, T0 + ms, N0 + ms, FREE).state;
    s = { ...brawlerFinish(s, T0 + 300).state };
    let readyAt: number | null = null;
    for (let ms = 310; ms <= 1000; ms += 10) { const r = brawlerGougeTick(s, T0 + ms, N0 + ms, FREE); s = r.state; if (r.ready) readyAt = ms; }
    expect(readyAt).toBe(310 + BRAWLER_GOUGE_CHARGE_MS);
  });
  it('溜めの途中でステップ・技に入ったら溜めは消える', () => {
    const r0 = hold(initialBrawlerState(), 200);
    const stepped = brawlerStepStart(r0.s, T0 + 200, N0 + 200);
    expect(brawlerGougeTick(stepped, T0 + 210, N0 + 210, FREE).state.gougePressAt).toBeUndefined();
    const teched = brawlerStartTech(r0.s, 'kick', T0 + 200, 1);
    expect(brawlerGougeTick(teched, T0 + 210, N0 + 210, FREE).state.gougePressAt).toBeUndefined();
  });
});

describe('§37-7 被弾', () => {
  it('怯む被弾で溜めは消え、0.5秒以上押していた離しは何も出さない(0.5秒未満は今どおり)', () => {
    const r = hold(initialBrawlerState(), 300);
    const hurt = brawlerGougeAfterHurt(r.s, true);
    expect(hurt.gougeDead).toBe(true);
    expect(hurt.gougeChargeAt).toBeUndefined();
    // しゃがみの間(関所が閉じる)も、明けた後も、溜めは戻らない
    let s = hurt;
    for (let ms = 310; ms <= 1200; ms += 10) s = brawlerGougeTick(s, T0 + ms, N0 + ms, { ...FREE, gateOk: ms > 700 }).state;
    expect(s.gougeReadyAt).toBeUndefined();
    expect(brawlerGougeReleaseKind(s, N0 + 1200)).toBe('none');
    expect(brawlerGougeReleaseKind(hurt, N0 + 400)).toBe('normal');
  });
  it('溜まった後の被弾でも消える', () => {
    const r = hold(initialBrawlerState(), 700);
    expect(brawlerGougeReleaseKind(brawlerGougeAfterHurt(r.s, true), N0 + 700)).toBe('none');
  });
  it('レバーガードで受け切った被弾・スーパーアーマー中の被弾(kill=false)では消えない', () => {
    const r = hold(initialBrawlerState(), 700);
    const kept = brawlerGougeAfterHurt(r.s, false);
    expect(kept).toBe(r.s);
    expect(brawlerGougeReleaseKind(kept, N0 + 700)).toBe('gouge');
  });
});

describe('§37-7 通常技から溜める(段のつなぎ)', () => {
  it('1〜4段目を当てた後隙で押した溜めは段のつなぎ(つながりを延ばす)。離すと抉り打ち', () => {
    for (const stage of [1, 2, 3, 4]) {
      const { s: hit, at } = stageHitState(stage);
      const t1 = at + 10;
      expect(brawlerGougeLinkable(hit, t1)).toBe(true);
      let s = brawlerGougePress(hit, t1, N0, FREE);
      expect(s.gougeLink).toBe(true);
      // 段が終わって待機へ(つながりの受付が張られる)
      const endAt = T0 + brawlerStageSpec(stage).windupMs + brawlerStageSpec(stage).recoveryMs;
      let fin = false;
      for (let ms = 10; ms <= 1500; ms += 10) {
        const t = t1 + ms;
        if (!fin && t >= endAt) { s = brawlerFinish(s, t).state; fin = true; }
        s = brawlerGougeTick(s, t, N0 + ms, FREE).state;
      }
      // 押してから1.5秒(段の後のつながり 400×1.3ms を大きく超える)でも、つながりが生きている
      expect(s.nextStage).toBe(stage + 1);
      expect(s.chainUntil).toBeGreaterThanOrEqual(t1 + 1500);
      expect(brawlerGougeReleaseKind(s, N0 + 1500)).toBe('gouge');
      expect(brawlerGougeFireFrom(s)).toBe('fresh');
      expect(brawlerRouteAllows(`s${stage}` as 's1', 'gouge')).toBe(true);
    }
  });
  it('つながりは押し始めから保つ(溜まる前に切れない)。0.5秒未満で離した・溜めが消えた時は元の値へ戻る(今と同じ)', () => {
    const { s: hit } = stageHitState(1);
    const endAt = T0 + brawlerStageSpec(1).windupMs + brawlerStageSpec(1).recoveryMs;
    const idle = brawlerFinish(hit, endAt).state;
    const chain0 = idle.chainUntil;
    // つながりの受付の終わり際(切れる 100ms 前)に押す=溜まる前に元のつながりが切れる時刻が来る
    const tp = chain0 - 100;
    let s = brawlerGougePress(idle, tp, N0, FREE);
    expect(s.gougeLink).toBe(true);
    const t1 = chain0 + 150;
    for (let t = tp + 10; t <= t1; t += 10) s = brawlerGougeTick(s, t, N0 + (t - tp), FREE).state;
    expect(t1 - tp).toBeLessThan(BRAWLER_GOUGE_CHARGE_MS);
    expect(s.gougeReadyAt).toBeUndefined();
    expect(s.chainUntil).toBeGreaterThanOrEqual(t1);
    expect(s.gougeChainOrig).toBe(chain0);
    // 0.5秒未満で離した=溜めの欄を消すと、つながりは元の値(延ばさなかった時と同じ)
    const cleared = brawlerGougeClear(s, N0 + 300);
    expect(cleared.chainUntil).toBe(chain0);
    expect(cleared.gougeChainOrig).toBeUndefined();
  });
  it('段のつなぎの溜めは HIT の数を覚え、当たりはその続きとして数える(敵の固まりが切れていても)', () => {
    const { s: hit, at } = stageHitState(1);
    let s = brawlerGougePress(hit, at + 10, N0, FREE);
    s = brawlerGougeNoteLinkHits(s, 1);
    s = brawlerGougeNoteLinkHits(s, 0); // 固まりが切れて今の数が0になっても覚えた数は減らない
    expect(s.gougeLinkHits).toBe(1);
    expect(brawlerLinkWithCarry(1, s.gougeLinkHits)).toBe(2); // 敵はもう動ける(続きの数0→+1=1)でも 2
    expect(brawlerLinkWithCarry(3, 1)).toBe(3);
    expect(brawlerLinkWithCarry(1, undefined)).toBe(1);
    // つなぎでない溜めは覚えない
    const fresh = brawlerGougePress(initialBrawlerState(), T0, N0, FREE);
    expect(brawlerGougeNoteLinkHits(fresh, 3)).toBe(fresh);
  });
  it('受付の外で押し始めた溜めは、待機からの抉り打ちと同じ(つなぎに数えない)', () => {
    expect(brawlerGougeLinkable(initialBrawlerState(), T0)).toBe(false);
    const a = brawlerStartAttack(initialBrawlerState(), 1, T0, false); // 前隙の頭(空振りの受付より前)
    expect(brawlerGougeLinkable(a, T0 + 1)).toBe(false);
    expect(brawlerGougePress(a, T0 + 1, N0, FREE).gougeLink).toBe(false);
  });
  it('後隙の中で離した=段の後隙を取り消して出す(cancel)・前隙の間は出さない', () => {
    const { s: hit } = stageHitState(2);
    expect(brawlerGougeFireFrom(hit)).toBe('cancel');
    expect(brawlerGougeFireFrom(brawlerStartAttack(initialBrawlerState(), 2, T0, false))).toBeNull();
  });
  it('5段目(締め)の最中に押した押下は、5段目が終わってから数える(待機からの抉り打ち・段のつなぎにはしない)', () => {
    const { s: hit, at } = stageHitState(5);
    expect(brawlerGougeBody(hit, at + 10, FREE)).toBe('wait');
    let s = brawlerGougePress(hit, at + 10, N0, FREE);
    expect(s.gougePressAt).toBe(N0);
    expect(s.gougeWait).toBe(true);
    expect(s.gougeLink).toBe(false);
    expect(brawlerGougeReleaseKind(s, N0 + 900)).toBe('normal'); // 終わる前に離した=今どおり
    const endAt = T0 + brawlerStageSpec(5).windupMs + brawlerStageSpec(5).recoveryMs;
    let readyAt: number | null = null;
    let finAt = -1;
    for (let ms = 10; ms <= 2500; ms += 10) {
      const t = at + 10 + ms;
      if (finAt < 0 && t >= endAt) { s = brawlerFinish(s, t).state; finAt = ms; }
      const r = brawlerGougeTick(s, t, N0 + ms, FREE); s = r.state; if (r.ready) readyAt = ms;
    }
    expect(finAt).toBeGreaterThan(0);
    expect(readyAt).toBe(finAt + BRAWLER_GOUGE_CHARGE_MS); // 終わった時計から数える
    expect(brawlerGougeReleaseKind(s, N0 + 2500)).toBe('gouge');
    expect(brawlerGougeFireFrom(s)).toBe('fresh');
    expect(s.gougeLink).toBe(false);
    expect(brawlerRouteAllows('s5', 'gouge')).toBe(false);
  });
});

describe('§37-4・§37-7 抉り打ちの後の取り消し・値段・秘奥義の順番', () => {
  const gougeHit = (landed: number): { s: BrawlerState; at: number } => {
    const a = brawlerStartTech(initialBrawlerState(), 'gouge', T0);
    const at = T0 + a.windupMs;
    return { s: brawlerAfterResolve(a, at, landed, { pointCap: 20, countPoint: true, hitstopMs: 0, landed }), at };
  };
  it('当てた後は飛び蹴り・気功へだけ取り消せる(地割りへは行かない)・後隙から構えへ出せる', () => {
    const { s, at } = gougeHit(1);
    expect(brawlerTechAllowed(s, 'kick', at + 10)).toBe(true);
    expect(brawlerTechAllowed(s, 'kiko', at + 10)).toBe(true);
    expect(brawlerTechAllowed(s, 'stomp', at + 10)).toBe(false);
    expect(brawlerStageGuardCancelOk(s, 'guard', at + 10)).toBe(true);
    expect(brawlerRouteAllows('gouge', 'kick1')).toBe(true);
    expect(brawlerRouteAllows('gouge', 'kiko')).toBe(true);
    expect(brawlerRouteAllows('gouge', 'stomp')).toBe(false);
    expect(brawlerRouteAllows('gouge', 's1')).toBe(false);
  });
  it('空振りの後は飛び蹴り・気功へ取り消せない', () => {
    const { s, at } = gougeHit(0);
    expect(brawlerTechAllowed(s, 'kick', at + 10)).toBe(false);
    expect(brawlerTechAllowed(s, 'kiko', at + 10)).toBe(false);
  });
  it('抉り打ちの後の次の段は1段目から', () => {
    const { s, at } = gougeHit(1);
    const fin = brawlerFinish(s, at + BRAWLER_TECHS.gouge.recoveryMs).state;
    expect(fin.nextStage).toBe(1);
    expect(fin.chainUntil).toBe(0);
  });
  it('技ポイントは使わない(値段0・タイムキーパーの割引の外)・当てた時の増え方は段と同じ', () => {
    expect(BRAWLER_TECHS.gouge.cost).toBe(0);
    for (const lv of [0, 1, 2, 3]) expect(brawlerTimeKeeperDiscount('gouge', lv)).toBe(0);
    const base = { ...initialBrawlerState(), points: 3 };
    const a = brawlerStartTech(base, 'gouge', T0);
    expect(a.points).toBe(3);
    expect(brawlerAfterResolve(a, T0 + a.windupMs, 1, { pointCap: 20, countPoint: true, hitstopMs: 0 }).points).toBe(4);
  });
  it('秘奥義の順番は消さない・進めない(抉り打ちを挟んでも次の技は前の技の続きとして数える)', () => {
    const base = { ...initialBrawlerState(), secretProgress: 2, secretLastEndAt: T0 };
    const a = brawlerStartTech(base, 'gouge', T0 + 100);
    expect(a.secretProgress).toBe(2);
    const fin = brawlerFinish({ ...a, resolved: true }, T0 + 100 + a.windupMs + a.recoveryMs).state;
    expect(fin.secretProgress).toBe(2);
    // 抉り打ちの終わりから間を空けずに順番どおりの次の技(気功)=進む
    const step = brawlerSecretStep(fin.secretProgress ?? 0, fin.secretLastEndAt ?? 0, 'kiko', 0, (fin.secretLastEndAt ?? 0) + 50);
    expect(step.progress).toBe(3);
  });
});

describe('§37-5 体の絵と影のコマ(絵だけ)', () => {
  it('溜めの間は構え(しゃがみの絵)で位置だけ沈む。150ms 未満は何も変えない', () => {
    const s = brawlerGougePress(initialBrawlerState(), T0, N0, FREE);
    expect(brawlerPoseAt(s, T0, N0 + 100)).toBeNull();
    const p = brawlerPoseAt(s, T0, N0 + 400)!;
    expect(p.tex).toBe('ready');
    expect(p.sink).toBeGreaterThan(0);
    expect(p.sqX).toBe(1);
    expect(p.sqY).toBe(1);
  });
  it('跳び=しゃがみの絵(振り上げは使わない)→ 着地=低く沈む(後ろへ引かない)→ 当たり=振り上げ。影は跳び→沈む→突き上げ(上へ速く出て減速)', () => {
    const a = brawlerStartTech(initialBrawlerState(), 'gouge', T0);
    const jump = Math.min(a.windupMs, 160 * 1.3);
    const fly = brawlerPoseAt(a, T0 + jump * 0.5)!;
    expect(fly.tex).toBe('ready');
    expect(fly.jump).toBeGreaterThan(0);
    expect(brawlerStandAt(a, T0 + jump * 0.5)!.kind).toBe('gouge1');
    const land = brawlerPoseAt(a, T0 + a.windupMs - 5)!;
    expect(land.tex).toBe('ready');
    expect(land.push).toBeGreaterThanOrEqual(0);
    expect(land.sink).toBeGreaterThan(0);
    expect(brawlerStandAt(a, T0 + a.windupMs - 5)!.kind).toBe('gouge2');
    const r = { ...a, resolved: true };
    const hitPose = brawlerPoseAt(r, T0 + a.windupMs + 20)!;
    expect(hitPose.tex).toBe('swing');
    const f0 = brawlerStandAt(r, T0 + a.windupMs)!, f1 = brawlerStandAt(r, T0 + a.windupMs + 40)!, f2 = brawlerStandAt(r, T0 + a.windupMs + 100)!;
    expect(f0.kind).toBe('gouge3');
    expect(f0.lift ?? 0).toBe(0);
    expect(f1.lift!).toBeGreaterThan(5);
    expect(f2.lift!).toBeGreaterThanOrEqual(10);
    expect(f2.lift!).toBeLessThanOrEqual(14);
    expect(f1.lift! - (f0.lift ?? 0)).toBeGreaterThan(f2.lift! - f1.lift!); // 速く出て減速
  });
});
