// research/AI_HUMANIZE.md B1(コマ台帳・記録側)のユニットテスト。
// §7受け入れ条件5「JSON往復でnullが保存されること」/ §6 B1「族別正規化の境界・包含検査・
// リング10件・null往復・帰属(押し遅れが取れる)・キャンセル州は録らない・保存サイズ上限30KB assert」を
// 機械化する。counterReach.test.ts の宣言表検査の隣に置く(EPISODE_KEYS包含検査)。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  EPISODE_KEYS, EPISODE_SHAPE_DECL, TRACKED_SHAPE_KEYS, reachKeyFor, habitPos, unhabitPos, isAxisDegenerate,
  shapeForEpisodeReplay, axisForEpisodeReplay, habitFamilyOfShape,
  HABIT_RING_SIZE, HABIT_FAMILY_MIN_N, HABIT_FAMILY_KEYS, familyRawToStat, HABIT_BODY_UNIT_PX,
  settleEpisode, notePressEdge, tickHabitEpisodeMaintenance, markHabitGhostRun,
  takeRunHabitFold, resetRunHabitState,
  type HabitEpisode, type HabitFamilyRaw,
} from './habitEpisode';
import type { Enemy } from '../types/game';
import { IMPACT_AT_WINDUP_END_BOSS_STATES, GIANT_IMPACT_AT_WINDUP_END } from './ghostCounterAim';
import { COUNTER_REACH_DECL, type CounterReachShape } from './counterReach';
// ★検収是正(中3・74の数値複製に機械検査): habitEpisode.ts本体はstore非依存を保つためMELEE_RADIUSを
// 複製している(HABIT_BODY_UNIT_PX)。ズレ検知はテスト側でgameStoreを直接importして行う
// (bossTelegraph.test.ts:47の前例と同型=本体には持ち込まない)。
import { MELEE_RADIUS } from '../store/gameStore';

const BOSS_RECT = { x: -22, y: -22, width: 44, height: 44 };

const baseInput = (overrides: Partial<Parameters<typeof settleEpisode>[0]>): Parameters<typeof settleEpisode>[0] => ({
  gameTime: 10_000,
  enemyType: 'thor',
  state: 'issen-windup',
  bcx: 0, bcy: 0, pcx: 100, pcy: 0,
  bossRect: BOSS_RECT,
  playerHealth: 100, playerMaxHealth: 100,
  lastDamagedAtGame: undefined,
  ...overrides,
});

beforeEach(() => {
  resetRunHabitState();
});

// =================================================================================================
// EPISODE_KEYS包含検査(§1-0「EPISODE_KEYS ⊆ 両台帳」の機械検査)
// =================================================================================================
describe('EPISODE_KEYS ⊆ 着弾宣言表∪giant表(machine test・counterReach.test.tsの隣)', () => {
  const LEDGER = new Set<string>([
    ...IMPACT_AT_WINDUP_END_BOSS_STATES,
    ...GIANT_IMPACT_AT_WINDUP_END.map(p => `giantbat:${p}`),
  ]);

  it('EPISODE_KEYSの全キーが2本の着弾宣言表のどちらかに実在する', () => {
    const missing = EPISODE_KEYS.filter(k => !LEDGER.has(k));
    expect(missing).toEqual([]);
  });

  it('合計34州(トール3+バス停2+馬乗り4+バランス4+舞子4+天使7+giant10)', () => {
    expect(EPISODE_KEYS.length).toBe(34);
  });

  it('EPISODE_SHAPE_DECLはEPISODE_KEYSの全キーを1つずつ分類している(漏れ・重複なし)', () => {
    const declKeys = Object.keys(EPISODE_SHAPE_DECL);
    expect(new Set(declKeys)).toEqual(new Set(EPISODE_KEYS));
    expect(declKeys.length).toBe(EPISODE_KEYS.length);
  });

  it('紫(カウンター不可)技は台帳自体に存在しない(EPISODE_KEYSにnone州が混入していない)', () => {
    for (const key of EPISODE_KEYS) {
      const [enemyType, ...rest] = key.split(':');
      const state = rest.join(':');
      const reachKey = reachKeyFor(enemyType, state);
      // 宣言が無い(=live/body-only)キーはnoneではありえない(そもそも宣言を引かない)。
      // 宣言があるキーはnoneでないことを確認する(紫の混入フィルタ)。
      if (COUNTER_REACH_DECL[reachKey] !== undefined) {
        expect(COUNTER_REACH_DECL[reachKey], key).not.toBe('none');
      }
    }
  });

  it('「declared」分類のキーは必ずCOUNTER_REACH_DECLに実在の宣言を持つ(分類の一致検査)', () => {
    for (const [key, category] of Object.entries(EPISODE_SHAPE_DECL)) {
      if (category !== 'declared') continue;
      const [enemyType, ...rest] = key.split(':');
      const reachKey = reachKeyFor(enemyType, rest.join(':'));
      expect(COUNTER_REACH_DECL[reachKey], key).toBeDefined();
    }
  });

  it('分類の内訳: declared17 / live16(天使7+giant9) / body-only1(giantbat:g-bolt-windup)', () => {
    const counts = { declared: 0, live: 0, 'body-only': 0 };
    for (const category of Object.values(EPISODE_SHAPE_DECL)) counts[category] += 1;
    expect(counts).toEqual({ declared: 17, live: 16, 'body-only': 1 });
    expect(EPISODE_SHAPE_DECL['giantbat:g-bolt-windup']).toBe('body-only');
  });

  it('TRACKED_SHAPE_KEYSはEPISODE_KEYSの部分集合(thor:tsuki-windupの1件だけ)', () => {
    expect(TRACKED_SHAPE_KEYS).toEqual(['thor:tsuki-windup']);
    for (const k of TRACKED_SHAPE_KEYS) expect(EPISODE_KEYS).toContain(k);
  });
});

// =================================================================================================
// reachKeyFor(写像ヘルパ)
// =================================================================================================
describe('reachKeyFor(enemyType, state)', () => {
  it('bounty-*系はbounty:プレフィクスへ写る', () => {
    expect(reachKeyFor('bounty-ranged', 'br-push-windup')).toBe('bounty:br-push-windup');
    expect(reachKeyFor('bounty-melee', 'bm-whip360-windup')).toBe('bounty:bm-whip360-windup');
    expect(reachKeyFor('bounty-balance', 'bb-sweep-windup')).toBe('bounty:bb-sweep-windup');
    expect(reachKeyFor('bounty-maiko', 'mk-spin-windup')).toBe('bounty:mk-spin-windup');
  });
  it('裏ボス4体(thor/mimir/jormungand/skadi)はhidden:プレフィクスへ写る', () => {
    expect(reachKeyFor('thor', 'issen-windup')).toBe('hidden:issen-windup');
    expect(reachKeyFor('mimir', 'bite-windup')).toBe('hidden:bite-windup');
    expect(reachKeyFor('jormungand', 'coil-windup')).toBe('hidden:coil-windup');
    expect(reachKeyFor('skadi', 'skadi-ice-recover')).toBe('hidden:skadi-ice-recover');
  });
  it('天使・giantbatはtypeそのまま', () => {
    expect(reachKeyFor('miguel', 'harai-windup')).toBe('miguel:harai-windup');
    expect(reachKeyFor('giantbat', 'g-stomp-windup')).toBe('giantbat:g-stomp-windup');
  });
});

// =================================================================================================
// habitPos(§1-2 図形ローカル座標)の境界
// =================================================================================================
describe('habitPos: band', () => {
  const band: CounterReachShape = {
    kind: 'band',
    bands: [{ fx: 0, fy: 0, tx: 100, ty: 0, halfWidth: 20 }],
  };
  it('始点=posA0・終点=posA1(±halfWidthの中心線上=posB0)', () => {
    expect(habitPos(band, 0, 0, 0, 0, 100, 0, BOSS_RECT)).toEqual({ posA: 0, posB: 0, sub: 0 });
    expect(habitPos(band, 100, 0, 0, 0, 100, 0, BOSS_RECT)).toEqual({ posA: 1, posB: 0, sub: 0 });
  });
  it('posAは終点を超えて2でクランプ(始点より手前は0でクランプ)', () => {
    expect(habitPos(band, 500, 0, 0, 0, 100, 0, BOSS_RECT)?.posA).toBe(2);
    expect(habitPos(band, -500, 0, 0, 0, 100, 0, BOSS_RECT)?.posA).toBe(0);
  });
  it('posBはhalfWidthで正規化され±1でクランプ(符号は法線の向き)', () => {
    expect(habitPos(band, 50, 20, 0, 0, 100, 0, BOSS_RECT)?.posB).toBe(1);
    expect(habitPos(band, 50, -20, 0, 0, 100, 0, BOSS_RECT)?.posB).toBe(-1);
    expect(habitPos(band, 50, 200, 0, 0, 100, 0, BOSS_RECT)?.posB).toBe(1); // クランプ
    expect(habitPos(band, 50, 10, 0, 0, 100, 0, BOSS_RECT)?.posB).toBeCloseTo(0.5, 5);
  });
  it('複数帯は最寄りの1本のindexを返す(sub)', () => {
    const multi: CounterReachShape = {
      kind: 'band',
      bands: [
        { fx: 0, fy: 0, tx: 100, ty: 0, halfWidth: 10 },
        { fx: 0, fy: 200, tx: 100, ty: 200, halfWidth: 10 },
      ],
    };
    expect(habitPos(multi, 50, 5, 0, 0, 100, 0, BOSS_RECT)?.sub).toBe(0);
    expect(habitPos(multi, 50, 205, 0, 0, 100, 0, BOSS_RECT)?.sub).toBe(1);
  });
});

describe('habitPos: circle / circle-or-body', () => {
  const circle: CounterReachShape = { kind: 'circle', cx: 0, cy: 0, radius: 100 };
  it('中心=posA0・縁=posA1・2倍の距離で2にクランプ', () => {
    expect(habitPos(circle, 0, 0, 0, 0, 100, 0, BOSS_RECT)?.posA).toBe(0);
    expect(habitPos(circle, 100, 0, 0, 0, 100, 0, BOSS_RECT)?.posA).toBe(1);
    expect(habitPos(circle, 1000, 0, 0, 0, 100, 0, BOSS_RECT)?.posA).toBe(2);
  });
  it('軸(from→to)が退化(自分中心)している時はposB固定0', () => {
    // bm-whip360/mk-spin/bite等と同型: axisFrom===axisTo(長さ0)。
    expect(habitPos(circle, 0, 100, 0, 0, 0, 0, BOSS_RECT)?.posB).toBe(0);
    expect(habitPos(circle, 100, -100, 5, 5, 5, 5, BOSS_RECT)?.posB).toBe(0);
  });
  it('軸が実在する時は差角/πで符号つきposBが出る(90度=0.5)', () => {
    // 軸=+X方向。本人は+Y側(90度)にいる → 差角/π = 0.5。
    const posB = habitPos(circle, 0, 100, 0, 0, 100, 0, BOSS_RECT)?.posB;
    expect(posB).toBeCloseTo(0.5, 5);
  });
  it('circle-or-bodyもcircleと同じ式(kindが違うだけ)', () => {
    const cob: CounterReachShape = { kind: 'circle-or-body', cx: 0, cy: 0, radius: 50 };
    expect(habitPos(cob, 50, 0, 0, 0, 50, 0, BOSS_RECT)).toEqual({ posA: 1, posB: 0, sub: 0 });
  });
});

describe('HABIT_BODY_UNIT_PX(★検収是正・中3): gameStoreのMELEE_RADIUSと同値(複製のズレ検知)', () => {
  it('HABIT_BODY_UNIT_PX = MELEE_RADIUS(bossTelegraph.test.ts:47と同型の機械検査)', () => {
    expect(HABIT_BODY_UNIT_PX).toBe(MELEE_RADIUS);
  });
});

describe('habitPos: body(縁基準・§1-2「中心距離は使わない」)', () => {
  it('縁距離(AABB最近点)/74・箱の内側は0', () => {
    const body: CounterReachShape = { kind: 'body' };
    expect(habitPos(body, 0, 0, 0, 0, 0, 0, BOSS_RECT)?.posA).toBe(0); // ボス矩形の内側
    // 矩形の右端(x=22)からさらに74px離れた位置(x=96) → 縁距離74 → posA=1。
    expect(habitPos(body, 96, 0, 0, 0, 0, 0, BOSS_RECT)?.posA).toBeCloseTo(1, 5);
  });
  it('none(紫)はnullを返す(§1-2「紫は対象外」)', () => {
    expect(habitPos({ kind: 'none' }, 0, 0, 0, 0, 0, 0, BOSS_RECT)).toBeNull();
  });
});

// =================================================================================================
// settleEpisode + tickHabitEpisodeMaintenance(帰属・リング・キャンセル)
// =================================================================================================
describe('settleEpisode: 対象外キーは無視する(安全側)', () => {
  it('EPISODE_KEYS外のenemyType/stateは録らない', () => {
    settleEpisode(baseInput({ enemyType: 'zombie', state: 'bite' }));
    tickHabitEpisodeMaintenance(20_000);
    const folded = takeRunHabitFold();
    expect(folded).toBeNull();
  });
});

describe('settleEpisode: キャンセル州は録らない(=呼ばれなければ記録されない)', () => {
  it('settleEpisodeを呼ばない限りrunEpisodesに何も積まれない', () => {
    // 「満了前に別遷移した」を模す = settleEpisodeを一度も呼ばずにmaintenanceだけ回す。
    tickHabitEpisodeMaintenance(20_000);
    expect(takeRunHabitFold()).toBeNull();
  });
});

describe('帰属(§1-3・§1-0): T+300ms後追い・[T-1500,T+300]・Tに最も近い1件・1押下1コマ', () => {
  it('押し遅れ(T後の押下)が取れる', () => {
    const T = 10_000;
    settleEpisode(baseInput({ gameTime: T }));
    notePressEdge(T, 1); // エッジ検知の準備(基準値)
    notePressEdge(T + 150, 2); // T+150で押下(押し遅れ)
    tickHabitEpisodeMaintenance(T + 300); // 帰属確定(T+300ms後)
    const folded = takeRunHabitFold();
    expect(folded).not.toBeNull();
    const ep = folded!.episodes['thor:issen-windup'][0];
    expect(ep.pressOfs).toBe(150);
  });

  it('[T-1500,T+300]内でTに最も近い1件を引く(早押しと遅押しが両方ある場合)', () => {
    const T = 10_000;
    notePressEdge(0, 0); // 準備
    notePressEdge(T - 1000, 1);
    notePressEdge(T - 100, 2); // Tに最も近い(早押し)
    notePressEdge(T + 250, 3); // Tに近いがT-100の方が近い
    settleEpisode(baseInput({ gameTime: T }));
    tickHabitEpisodeMaintenance(T + 300);
    const ep = takeRunHabitFold()!.episodes['thor:issen-windup'][0];
    expect(ep.pressOfs).toBe(-100);
  });

  it('窓の外(T-1500より前・T+300より後)の押下は無視されnullになる', () => {
    const T = 10_000;
    notePressEdge(0, 0); // 準備(エッジ検知は「値が変わった」時だけ=最初の1回は誤検知させない)
    notePressEdge(T - 2000, 1); // 窓外(早すぎ)= [T-1500,T+300]に入らない
    settleEpisode(baseInput({ gameTime: T }));
    tickHabitEpisodeMaintenance(T + 300);
    const ep = takeRunHabitFold()!.episodes['thor:issen-windup'][0];
    expect(ep.pressOfs).toBeNull();
  });

  it('1つの押下は最も近い1コマにだけ帰属する(2つの州が同じ押下を奪い合わない)', () => {
    const T1 = 10_000, T2 = 10_050;
    notePressEdge(0, 0); // 準備
    notePressEdge(T1 + 20, 1); // T1に近い1件だけ
    settleEpisode(baseInput({ gameTime: T1, state: 'issen-windup' }));
    settleEpisode(baseInput({ gameTime: T2, state: 'harai-windup' }));
    tickHabitEpisodeMaintenance(T2 + 300);
    const folded = takeRunHabitFold()!;
    const issenPress = folded.episodes['thor:issen-windup'][0].pressOfs;
    const haraiPress = folded.episodes['thor:harai-windup'][0].pressOfs;
    // どちらか片方だけが押下を得る(両方がnullになったり両方が同じ押下を得たりはしない)。
    expect([issenPress, haraiPress].filter(v => v !== null).length).toBe(1);
  });
});

describe('リング10件(§1・ラン跨ぎ)', () => {
  it('同じ州キーで11回settleすると最新10件だけが残る', () => {
    const T0 = 100_000;
    for (let i = 0; i < 11; i++) {
      const T = T0 + i * 10_000;
      settleEpisode(baseInput({ gameTime: T, pcx: 100 + i })); // posAをiごとに変えて識別
      tickHabitEpisodeMaintenance(T + 300);
    }
    const folded = takeRunHabitFold()!;
    const eps = folded.episodes['thor:issen-windup'];
    expect(eps.length).toBe(HABIT_RING_SIZE);
    // seqは1..20でカンスト。11回引いたので先頭(1回目=seq1)は落ちて2回目(seq2)から残る。
    expect(eps[0].seq).toBe(2);
    expect(eps[eps.length - 1].seq).toBe(11);
  });

  it('seqは20でカンストする(21回を超えても21のまま増えない)', () => {
    const T0 = 100_000;
    for (let i = 0; i < 25; i++) {
      const T = T0 + i * 10_000;
      settleEpisode(baseInput({ gameTime: T }));
      tickHabitEpisodeMaintenance(T + 300);
    }
    const eps = takeRunHabitFold()!.episodes['thor:issen-windup'];
    expect(eps[eps.length - 1].seq).toBe(20);
  });
});

describe('量子化の往復', () => {
  it('posA/posBは整数量子化され、範囲内(0..200 / -100..100)に収まる', () => {
    const T = 10_000;
    settleEpisode(baseInput({ gameTime: T, pcx: 100, pcy: 0 })); // issen-windupはbandで宣言(hidden側)
    tickHabitEpisodeMaintenance(T + 300);
    const ep = takeRunHabitFold()!.episodes['thor:issen-windup'][0];
    expect(Number.isInteger(ep.posA)).toBe(true);
    expect(Number.isInteger(ep.posB)).toBe(true);
    expect(ep.posA).toBeGreaterThanOrEqual(0);
    expect(ep.posA).toBeLessThanOrEqual(200);
    expect(ep.posB).toBeGreaterThanOrEqual(-100);
    expect(ep.posB).toBeLessThanOrEqual(100);
  });
});

describe('ctxHp / ctxHit / seq', () => {
  it('HP<=30%でctxHp=1・直近2秒被弾でctxHit=1', () => {
    const T = 50_000;
    settleEpisode(baseInput({
      gameTime: T, playerHealth: 30, playerMaxHealth: 100, lastDamagedAtGame: T - 1000,
    }));
    tickHabitEpisodeMaintenance(T + 300);
    const ep = takeRunHabitFold()!.episodes['thor:issen-windup'][0];
    expect(ep.ctxHp).toBe(1);
    expect(ep.ctxHit).toBe(1);
  });
  it('HP>30%・被弾から2秒超でどちらも0', () => {
    const T = 50_000;
    settleEpisode(baseInput({
      gameTime: T, playerHealth: 31, playerMaxHealth: 100, lastDamagedAtGame: T - 2001,
    }));
    tickHabitEpisodeMaintenance(T + 300);
    const ep = takeRunHabitFold()!.episodes['thor:issen-windup'][0];
    expect(ep.ctxHp).toBe(0);
    expect(ep.ctxHit).toBe(0);
  });

  // ★検収是正(中4・番兵0): player.lastDamagedAtGame の既定値は0(gameStore=まだ被弾していない)。
  // 0を被弾時刻として扱うと、ラン開始2秒以内に満了する州(gameTime<=2000)がctxHit=1に化ける。
  it('lastDamagedAtGame=0(未被弾の番兵)はラン開始2秒以内の州満了でもctxHit=1に化けない', () => {
    const T = 1_500; // ラン開始2秒以内
    settleEpisode(baseInput({
      gameTime: T, playerHealth: 100, playerMaxHealth: 100, lastDamagedAtGame: 0,
    }));
    tickHabitEpisodeMaintenance(T + 300);
    const ep = takeRunHabitFold()!.episodes['thor:issen-windup'][0];
    expect(ep.ctxHit).toBe(0);
  });
  it('実際に0ms地点(gameTime=0)で被弾していた場合はlastDamagedAtGame>0で正しく1になる(0除外の副作用チェック)', () => {
    const T = 1_500;
    settleEpisode(baseInput({
      gameTime: T, playerHealth: 100, playerMaxHealth: 100, lastDamagedAtGame: 1, // 1ms地点で被弾=正の値
    }));
    tickHabitEpisodeMaintenance(T + 300);
    const ep = takeRunHabitFold()!.episodes['thor:issen-windup'][0];
    expect(ep.ctxHit).toBe(1);
  });
});

// ★circle-or-body(COUNTER_REACH_DECLの'hidden:jump-windup')は、EPISODE_KEYS(34州)の
// どのキーにも declared 経由で対応しない(thor:jump-windupは「windup終わり=着弾」ではなく
// 着地[jump-air終わり]が着弾なのでIMPACT_AT_WINDUP_END_BOSS_STATESに元から入っていない)。
// このためsettleEpisode経由でこの分岐(§1-2「circle-or-bodyのbodyフォールバックは録らない」)を
// 実キーで踏むことは現状できない——分岐そのものは将来declared側にcircle-or-body州が増えた時のための
// 防御的実装として残す(counterReachKindFor(reachKey)==='circle-or-body'のガード)。同様の理由で
// 「declared州がnoneへ解決される」実例も34州には存在しない(紫技はそもそもIMPACT_AT_WINDUP_END表に
// 載らない設計=上の「紫の混入フィルタ」テストが機械検査している)。純関数habitPos({kind:'none'},...)が
// nullを返すことは上の「habitPos: body」describeで検査済み。

describe('ゴーストラン(§2.7制約1)は丸ごと破棄する', () => {
  it('markHabitGhostRun後はtakeRunHabitFoldがnullを返す', () => {
    const T = 10_000;
    settleEpisode(baseInput({ gameTime: T }));
    tickHabitEpisodeMaintenance(T + 300);
    markHabitGhostRun();
    expect(takeRunHabitFold()).toBeNull();
  });
});

// =================================================================================================
// 族別集計(§1-4)
// =================================================================================================
describe('familyRawToStat: 発動条件(その族のコマ総数>=5)', () => {
  const raw = (count: number): HabitFamilyRaw => ({
    count, sumPosA: count * 1.0, sumPosB: count * 0.2, pressCount: count, sumPressOfs: count * 50,
  });
  it('n<HABIT_FAMILY_MIN_Nはnull(未達=前回値を保つ=このセッションは寄与しない)', () => {
    expect(familyRawToStat(raw(HABIT_FAMILY_MIN_N - 1))).toBeNull();
  });
  it('n>=HABIT_FAMILY_MIN_Nは量子化された統計を返す', () => {
    const stat = familyRawToStat(raw(HABIT_FAMILY_MIN_N));
    expect(stat).not.toBeNull();
    expect(stat!.n).toBe(HABIT_FAMILY_MIN_N);
    expect(stat!.avgPosA).toBe(100); // 1.0*100
    expect(stat!.avgPressOfs).toBe(50);
    expect(stat!.pressRatePct).toBe(100);
  });
  it('押下0件ならavgPressOfsはnull(pressRatePctは0)', () => {
    const stat = familyRawToStat({ count: 5, sumPosA: 5, sumPosB: 0, pressCount: 0, sumPressOfs: 0 });
    expect(stat!.avgPressOfs).toBeNull();
    expect(stat!.pressRatePct).toBe(0);
  });
  it('HABIT_FAMILY_KEYSは band/circle/body の3つ', () => {
    expect(HABIT_FAMILY_KEYS).toEqual(['band', 'circle', 'body']);
  });
});

describe('族別集計はコマ記録と同じフックで畳まれる(§1-4是正・検収監査中5: ラン内はしきい値ゲート無しで生カウントを返す)', () => {
  it('band族(issen-windup)を1回settleしただけでもfolded.family.bandに生カウント(count=1)が出る', () => {
    // 旧実装はここでHABIT_FAMILY_MIN_N(=5)未満を捨てていた(1ランに4件以下しか出ない族が
    // 永久に集計されない穴)。ラン内はゲート無し=累計と閾値判定は呼び出し側(playerTraits)の責務。
    const T = 10_000;
    settleEpisode(baseInput({ gameTime: T }));
    tickHabitEpisodeMaintenance(T + 300);
    const folded = takeRunHabitFold()!;
    expect(folded.family.band).toBeDefined();
    expect(folded.family.band!.count).toBe(1);
  });
  it('band族(issen-windup)を5回settleするとcount=5の生カウントが返る', () => {
    const T0 = 10_000;
    for (let i = 0; i < 5; i++) {
      const T = T0 + i * 10_000;
      settleEpisode(baseInput({ gameTime: T }));
      tickHabitEpisodeMaintenance(T + 300);
    }
    const folded = takeRunHabitFold()!;
    expect(folded.family.band!.count).toBe(5);
  });
});

// =================================================================================================
// §5 quota退避の前提: 保存サイズ上限30KB(assert)
// =================================================================================================
describe('保存サイズ: 34州×10件のコマ+族別集計15値でも30KB以内(§5の実測見込み10〜15KBの検算)', () => {
  it('worst-case(全州リング満杯)のJSONサイズが30KB未満', () => {
    const ep: HabitEpisode = { posA: 123, posB: -45, sub: 2, pressOfs: -321, ctxHp: 1, ctxHit: 0, seq: 20 };
    const moveHabits: Record<string, HabitEpisode[]> = {};
    for (const key of EPISODE_KEYS) moveHabits[key] = Array.from({ length: HABIT_RING_SIZE }, () => ({ ...ep }));
    const habitFamily = {
      band: { n: 999, avgPosA: 123, avgPosB: -45, avgPressOfs: -321, pressRatePct: 87 },
      circle: { n: 999, avgPosA: 123, avgPosB: -45, avgPressOfs: -321, pressRatePct: 87 },
      body: { n: 999, avgPosA: 123, avgPosB: -45, avgPressOfs: -321, pressRatePct: 87 },
    };
    // ★検収是正(中5): habitFamilyRaw(累計の生値)も実運用で一緒に保存されるので検算に含める。
    const habitFamilyRaw = {
      band: { count: 9999, sumPosA: 123456.789, sumPosB: -45678.123, pressCount: 8888, sumPressOfs: -321987.6 },
      circle: { count: 9999, sumPosA: 123456.789, sumPosB: -45678.123, pressCount: 8888, sumPressOfs: -321987.6 },
      body: { count: 9999, sumPosA: 123456.789, sumPosB: -45678.123, pressCount: 8888, sumPressOfs: -321987.6 },
    };
    const bytes = new TextEncoder().encode(JSON.stringify({ moveHabits, habitFamily, habitFamilyRaw })).length;
    expect(bytes).toBeLessThan(30 * 1024);
  });
});

// =================================================================================================
// null往復(§1-1「NaNは使わない」)
// =================================================================================================
describe('JSON往復でnullが保存される(NaNに化けない)', () => {
  it('pressOfs=nullはJSON.stringify/parseを経てもnullのまま', () => {
    const ep: HabitEpisode = { posA: 0, posB: 0, sub: 0, pressOfs: null, ctxHp: 0, ctxHit: 0, seq: 1 };
    const round = JSON.parse(JSON.stringify(ep)) as HabitEpisode;
    expect(round.pressOfs).toBeNull();
    expect(Number.isNaN(round.pressOfs)).toBe(false);
  });
  it('settleEpisodeで押下なしのまま帰属確定したコマはpressOfs=null(NaNではない)', () => {
    const T = 10_000;
    settleEpisode(baseInput({ gameTime: T }));
    tickHabitEpisodeMaintenance(T + 300);
    const ep = takeRunHabitFold()!.episodes['thor:issen-windup'][0];
    expect(ep.pressOfs).toBeNull();
    const round = JSON.parse(JSON.stringify(ep)) as HabitEpisode;
    expect(round.pressOfs).toBeNull();
  });
});

// =================================================================================================
// research/AI_HUMANIZE.md B2(再生側)。unhabitPos(逆写像)+isAxisDegenerate+shapeForEpisodeReplay。
// =================================================================================================
const BOSS_RECT2 = { x: 0, y: 0, width: 40, height: 40 };

describe('unhabitPos: habitPosの逆写像(band/circle/body)', () => {
  it('band: posA/posB/subから復元した点をhabitPosへ通すと同じposA/posB/subに戻る(往復一致)', () => {
    const shape: import('./counterReach').CounterReachShape = {
      kind: 'band', bands: [{ fx: 0, fy: 0, tx: 300, ty: 0, halfWidth: 40 }],
    };
    const pt = unhabitPos(shape, 0.6, 0.5, 0, 0, 0, 0, 0, BOSS_RECT2, 0)!;
    const back = habitPos(shape, pt.x, pt.y, 0, 0, 0, 0, BOSS_RECT2)!;
    expect(back.posA).toBeCloseTo(0.6, 6);
    expect(back.posB).toBeCloseTo(0.5, 6);
    expect(back.sub).toBe(0);
  });

  it('circle: 軸が非退化なら axisAngle+posB*π の絶対角で復元する', () => {
    const shape: import('./counterReach').CounterReachShape = { kind: 'circle', cx: 0, cy: 0, radius: 100 };
    // 軸(0,0)→(1,0)=角度0。posB=0.5→角度=0.5π(=90°)。posA=1→半径100。
    const pt = unhabitPos(shape, 1, 0.5, 0, 0, 0, 1, 0, BOSS_RECT2, 999 /* 非退化なので使われない */)!;
    expect(pt.x).toBeCloseTo(0, 5);
    expect(pt.y).toBeCloseTo(100, 5);
  });

  it('circle: 軸が退化(自分中心州)している時は現在角(currentAngleRad)をそのまま使う(絶対角を発明しない)', () => {
    const shape: import('./counterReach').CounterReachShape = { kind: 'circle', cx: 0, cy: 0, radius: 50 };
    const angle = Math.PI / 3; // 60°
    const pt = unhabitPos(shape, 1, 0.5 /* 軸退化では無視される */, 0, 0, 0, 0, 0, BOSS_RECT2, angle)!;
    expect(pt.x).toBeCloseTo(Math.cos(angle) * 50, 5);
    expect(pt.y).toBeCloseTo(Math.sin(angle) * 50, 5);
  });

  it('bandでbandsが空/shape=noneはnull', () => {
    expect(unhabitPos({ kind: 'band', bands: [] }, 0, 0, 0, 0, 0, 0, 0, BOSS_RECT2, 0)).toBeNull();
    expect(unhabitPos({ kind: 'none' }, 0, 0, 0, 0, 0, 0, 0, BOSS_RECT2, 0)).toBeNull();
  });
});

describe('isAxisDegenerate: §1-2「自分中心で軸が退化する州は0固定」の判定そのもの', () => {
  it('from===toは退化', () => {
    expect(isAxisDegenerate(10, 20, 10, 20)).toBe(true);
  });
  it('from!==toは非退化', () => {
    expect(isAxisDegenerate(0, 0, 100, 0)).toBe(false);
  });
});

const mkEnemyFor = (overrides: Partial<Enemy> = {}): Enemy => ({
  id: 'e1', x: 0, y: 0, width: 40, height: 40, speed: 0,
  health: 100, maxHealth: 100, damage: 10, type: 'thor', experienceValue: 0,
  lastHit: 0, lastShot: 0,
  ...overrides,
} as Enemy);

describe('shapeForEpisodeReplay: 34州(declared17/live16/body-only1)を1本の関数で解決する(§14=(a))', () => {
  it('declared州(例: thor:issen-windup)はcounterReachShapeForと同じ図形(数値の複製なし)', () => {
    const e = mkEnemyFor({ type: 'thor', x: 0, y: 0, width: 40, height: 40, aiFromX: 0, aiFromY: 0, aiTargetX: 200, aiTargetY: 0 });
    const s = shapeForEpisodeReplay('thor', 'issen-windup', e);
    expect(s?.kind).toBe('band');
  });
  it('live州(例: giantbat:g-stomp-windup)はepisodeShapeForと同じ図形', () => {
    const e = mkEnemyFor({ type: 'giantbat', x: 0, y: 0, width: 40, height: 40, gStompRadius: 77 });
    const s = shapeForEpisodeReplay('giantbat', 'g-stomp-windup', e);
    expect(s).toEqual({ kind: 'circle', cx: 20, cy: 20, radius: 77 });
  });
  it('body-only州(giantbat:g-bolt-windup)はbody', () => {
    const e = mkEnemyFor({ type: 'giantbat' });
    expect(shapeForEpisodeReplay('giantbat', 'g-bolt-windup', e)).toEqual({ kind: 'body' });
  });
  it('EPISODE_KEYS外はnull', () => {
    expect(shapeForEpisodeReplay('giantbat', 'chase', mkEnemyFor())).toBeNull();
  });
  it('EPISODE_KEYSの34州すべてで例外なく解決できる(null/body/band/circleのいずれか)', () => {
    for (const key of EPISODE_KEYS) {
      const [enemyType, ...rest] = key.split(':');
      const state = rest.join(':');
      const e = mkEnemyFor({
        type: enemyType as Enemy['type'], x: 0, y: 0, width: 40, height: 40,
        aiFromX: 10, aiFromY: 10, aiTargetX: 210, aiTargetY: 10, gStompRadius: 100,
      });
      expect(() => shapeForEpisodeReplay(enemyType, state, e)).not.toThrow();
      const shape = shapeForEpisodeReplay(enemyType, state, e);
      expect(shape, key).not.toBeNull(); // 34州は全てEPISODE_SHAPE_DECLに分類済み=必ず何か返る
      if (shape) expect(['band', 'circle', 'circle-or-body', 'body']).toContain(shape.kind);
    }
  });
});

describe('axisForEpisodeReplay + habitFamilyOfShape', () => {
  it('全34州で例外なく軸が返る', () => {
    for (const key of EPISODE_KEYS) {
      const [enemyType, ...rest] = key.split(':');
      const state = rest.join(':');
      const e = mkEnemyFor({ type: enemyType as Enemy['type'], x: 0, y: 0, width: 40, height: 40 });
      expect(() => axisForEpisodeReplay(enemyType, state, e)).not.toThrow();
    }
  });
  it('habitFamilyOfShapeはband/circle/circle-or-body/bodyをband/circle/bodyへ畳む', () => {
    expect(habitFamilyOfShape({ kind: 'band', bands: [] })).toBe('band');
    expect(habitFamilyOfShape({ kind: 'circle', cx: 0, cy: 0, radius: 1 })).toBe('circle');
    expect(habitFamilyOfShape({ kind: 'circle-or-body', cx: 0, cy: 0, radius: 1 })).toBe('circle');
    expect(habitFamilyOfShape({ kind: 'body' })).toBe('body');
  });
});
