import { describe, it, expect } from 'vitest';
import {
  gauntletSlots, gauntletSkippedSlots, nextGauntletIndex, judgeRunEnd, anomalyReasons,
  stepSoftlock, createGauntletWatch, stepGauntletWatch, pushFinding, missingMoves,
  summarizeGauntlet, formatGauntletReport, appendGauntletLog, GAUNTLET_STORAGE_KEY,
  GAUNTLET_SKIP_SLOT_KEYS, GAUNTLET_TIMEOUT_MS, GAUNTLET_FAR_DIST_PX,
  SOFTLOCK_SAME_STATE_MS, SOFTLOCK_NO_MOVE_MS, SOFTLOCK_REALTIME_MS,
  type GauntletSample, type GauntletRecord,
} from './gauntlet';
import { PRACTICE_SLOTS } from './bossPractice';

const sample = (o: Partial<GauntletSample> = {}): GauntletSample => ({
  gameTimeMs: 0,
  realMs: 0,
  frozen: false,
  player: { x: 100, y: 100, health: 100 },
  boss: { id: 'b1', state: 'chase', x: 200, y: 100, health: 500, posture: 10, dormant: false },
  moveKey: null,
  ...o,
});

describe('走る枠(スキップの明示)', () => {
  it('giantbat@stage-2(城ボス不在)だけを外す。残りは PRACTICE_SLOTS のまま', () => {
    expect(gauntletSlots().length).toBe(PRACTICE_SLOTS.length - 1);
    expect(gauntletSlots().some(s => s.slotKey === 'giantbat@stage-2')).toBe(false);
    expect(gauntletSkippedSlots().map(s => s.slotKey)).toEqual([...GAUNTLET_SKIP_SLOT_KEYS]);
  });
  it('スキップ枠は「無かったこと」にせず取り出せる(結果に明記するため)', () => {
    expect(gauntletSkippedSlots().length).toBe(1);
  });
});

describe('次の枠', () => {
  it('最後の枠の次は null(=完走)', () => {
    expect(nextGauntletIndex(0, 3)).toBe(1);
    expect(nextGauntletIndex(2, 3)).toBeNull();
  });
});

describe('1戦の終了判定', () => {
  it('勝ち > 死亡 > タイムアウト の優先順位(同時に立っても決定的)', () => {
    expect(judgeRunEnd({ won: true, playerHealth: 0, elapsedRealMs: 999_999 })).toBe('win');
    expect(judgeRunEnd({ won: false, playerHealth: 0, elapsedRealMs: 999_999 })).toBe('death');
    expect(judgeRunEnd({ won: false, playerHealth: 10, elapsedRealMs: GAUNTLET_TIMEOUT_MS })).toBe('timeout');
  });
  it('まだ終わっていなければ null', () => {
    expect(judgeRunEnd({ won: false, playerHealth: 10, elapsedRealMs: 1000 })).toBeNull();
  });
});

describe('座標・状態の異常(検出器6)', () => {
  it('正常な戦闘中は何も出さない', () => {
    expect(anomalyReasons(sample())).toEqual([]);
  });
  it('NaN座標・NaN HP・体勢の負値を拾う', () => {
    const r = anomalyReasons(sample({
      player: { x: NaN, y: 0, health: 100 },
      boss: { id: 'b', state: 'chase', x: 0, y: 0, health: NaN, posture: -5, dormant: false },
    }));
    expect(r.some(x => x.includes('プレイヤー座標'))).toBe(true);
    expect(r.some(x => x.includes('ボスHP'))).toBe(true);
    expect(r.some(x => x.includes('体勢が負値'))).toBe(true);
  });
  it('ボスとの距離が閾値を超えたら異常(場外の代わりに距離で見る)', () => {
    const far = sample({ boss: { id: 'b', state: 'chase', x: GAUNTLET_FAR_DIST_PX + 200, y: 100, health: 1, posture: null, dormant: false } });
    expect(anomalyReasons(far).some(x => x.includes('距離が異常'))).toBe(true);
    const near = sample({ boss: { id: 'b', state: 'chase', x: 100 + GAUNTLET_FAR_DIST_PX - 10, y: 100, health: 1, posture: null, dormant: false } });
    expect(anomalyReasons(near).some(x => x.includes('距離が異常'))).toBe(false);
  });
});

describe('ソフトロックの時計2本(検出器2)', () => {
  const st = () => createGauntletWatch().softlock;

  it('①gameTime基準: 同じ状態のまま20秒で鳴る', () => {
    const s = st();
    let out: string[] = [];
    for (let t = 0; t <= SOFTLOCK_SAME_STATE_MS + 100; t += 100) {
      out = stepSoftlock(s, sample({ gameTimeMs: t, realMs: t, boss: { id: 'b', state: 'bite-windup', x: 200 + t * 0.1, y: 100, health: 1, posture: null, dormant: false } }));
      if (out.length > 0) break;
    }
    expect(out.some(x => x.includes('同じ状態'))).toBe(true);
  });

  it('①gameTime基準: ボスが動かないまま15秒で鳴る(状態は変わっていても)', () => {
    const s = st();
    let found: string[] = [];
    for (let t = 0; t <= SOFTLOCK_NO_MOVE_MS + 200; t += 100) {
      const state = t % 1000 < 500 ? 'chase' : 'bite-windup'; // 状態は動いている=①の片方だけ鳴る
      const out = stepSoftlock(s, sample({ gameTimeMs: t, realMs: t, boss: { id: 'b', state, x: 200, y: 100, health: 1, posture: null, dormant: false } }));
      if (out.length > 0) { found = out; break; }
    }
    expect(found.some(x => x.includes('動かない'))).toBe(true);
  });

  it('除外(dormant/帰巣/休憩/pause)の間は鳴らない', () => {
    for (const s0 of [
      sample({ boss: { id: 'b', state: 'return', x: 200, y: 100, health: 1, posture: null, dormant: false } }),
      sample({ boss: { id: 'b', state: 'mk-repose', x: 200, y: 100, health: 1, posture: null, dormant: false } }),
      sample({ boss: { id: 'b', state: 'chase', x: 200, y: 100, health: 1, posture: null, dormant: true } }),
      sample({ frozen: true }),
    ]) {
      const s = st();
      let rang = false;
      for (let t = 0; t <= 60_000; t += 250) {
        if (stepSoftlock(s, { ...s0, gameTimeMs: t, realMs: t }).length > 0) rang = true;
      }
      expect(rang, JSON.stringify(s0.boss ?? s0.frozen)).toBe(false);
    }
  });

  it('②実時間基準: 実時間30秒進んだのにgameTimeが進まない(ハング)を拾う', () => {
    const s = st();
    let rang = false;
    for (let t = 0; t <= SOFTLOCK_REALTIME_MS + 500; t += 100) {
      // gameTime は据え置き、実時間だけ進む
      if (stepSoftlock(s, sample({ gameTimeMs: 5000, realMs: t })).length > 0) rang = true;
    }
    expect(rang).toBe(true);
  });

  it('②はポーズ/バックグラウンド中には鳴らない(仕様どおり止まっているだけ)', () => {
    const s = st();
    let rang = false;
    for (let t = 0; t <= SOFTLOCK_REALTIME_MS * 2; t += 100) {
      if (stepSoftlock(s, sample({ gameTimeMs: 5000, realMs: t, frozen: true })).length > 0) rang = true;
    }
    expect(rang).toBe(false);
  });

  it('普通に進んでいる時は鳴らない', () => {
    const s = st();
    let rang = false;
    for (let t = 0; t <= 120_000; t += 100) {
      const out = stepSoftlock(s, sample({
        gameTimeMs: t, realMs: t,
        boss: { id: 'b', state: t % 2000 < 1000 ? 'chase' : 'bite-windup', x: 200 + (t % 500), y: 100, health: 1, posture: null, dormant: false },
      }));
      if (out.length > 0) rang = true;
    }
    expect(rang).toBe(false);
  });
});

describe('観測(まとめて1フレーム)', () => {
  it('技キャンセル違反を発見として積む(申告済みの連携は積まない)', () => {
    const w = createGauntletWatch();
    stepGauntletWatch(w, sample({ boss: { id: 'b', state: 'bite-windup', x: 200, y: 100, health: 1, posture: null, dormant: false } }));
    stepGauntletWatch(w, sample({ gameTimeMs: 16, realMs: 16, boss: { id: 'b', state: 'dash-windup', x: 200, y: 100, health: 1, posture: null, dormant: false } }));
    expect(w.findings.filter(f => f.kind === 'cancel').length).toBe(1);

    const w2 = createGauntletWatch();
    stepGauntletWatch(w2, sample({ boss: { id: 'b', state: 'harai', x: 200, y: 100, health: 1, posture: null, dormant: false } }));
    stepGauntletWatch(w2, sample({ gameTimeMs: 16, realMs: 16, boss: { id: 'b', state: 'tate-windup', x: 200, y: 100, health: 1, posture: null, dormant: false } }));
    expect(w2.findings.filter(f => f.kind === 'cancel').length).toBe(0);
  });

  it('同じ発見は1戦につき1回だけ積む(毎フレーム溢れさせない)', () => {
    const w = createGauntletWatch();
    for (let i = 0; i < 50; i++) {
      stepGauntletWatch(w, sample({
        gameTimeMs: i * 16, realMs: i * 16,
        boss: { id: 'b', state: 'chase', x: 99_999, y: 100, health: 1, posture: null, dormant: false },
      }));
    }
    expect(w.findings.filter(f => f.kind === 'anomaly').length).toBe(1);
  });

  it('発見にはその瞬間の状態・座標・時刻が入る(手掛かりのため)', () => {
    const w = createGauntletWatch();
    const s = sample({ gameTimeMs: 12_345, boss: { id: 'b', state: 'g-sweep-windup', x: 40, y: 60, health: 1, posture: null, dormant: false } });
    pushFinding(w, 'error', 'なにか', s);
    expect(w.findings[0]).toMatchObject({ kind: 'error', bossState: 'g-sweep-windup', bossX: 40, bossY: 60, gameTimeMs: 12_345 });
    expect(typeof w.findings[0].at).toBe('string');
  });

  it('出た技を溜める(技カバレッジ)/HPの減りだけを積む(回復は数えない)', () => {
    const w = createGauntletWatch();
    stepGauntletWatch(w, sample({ moveKey: 'g-stomp', player: { x: 0, y: 0, health: 100 } }));
    stepGauntletWatch(w, sample({ gameTimeMs: 16, realMs: 16, moveKey: 'g-sweep', player: { x: 0, y: 0, health: 80 } }));
    stepGauntletWatch(w, sample({ gameTimeMs: 32, realMs: 32, moveKey: 'g-stomp', player: { x: 0, y: 0, health: 95 } }));
    expect([...w.seenMoves].sort()).toEqual(['g-stomp', 'g-sweep']);
    expect(w.hpLost).toBe(20);
  });
});

describe('技カバレッジ', () => {
  it('台帳にあって出なかった技を返す', () => {
    expect(missingMoves(['a', 'b', 'c'], new Set(['b']))).toEqual(['a', 'c']);
  });
});

describe('要約とコピー用テキスト', () => {
  const rec = (o: Partial<GauntletRecord>): GauntletRecord => ({
    slotKey: 'x', label: 'X', bossType: 'giantbat', stageId: 'stage-1',
    outcome: 'win', durationMs: 30_000, realMs: 31_000,
    findings: [], moveTally: {}, movesMissing: [], movesSeen: [], hpLost: 0, ...o,
  });

  it('枠×発見数を数える', () => {
    const s = summarizeGauntlet([
      rec({ slotKey: 'a' }),
      rec({
        slotKey: 'b', outcome: 'timeout', movesMissing: ['m1'],
        findings: [
          { kind: 'cancel', detail: 'd', bossState: null, bossX: null, bossY: null, playerX: null, playerY: null, gameTimeMs: 0, at: '' },
          { kind: 'softlock', detail: 'd', bossState: null, bossX: null, bossY: null, playerX: null, playerY: null, gameTimeMs: 0, at: '' },
        ],
      }),
      rec({ slotKey: 'c', outcome: 'death' }),
    ]);
    expect(s.total).toBe(3);
    expect(s.wins).toBe(1); expect(s.deaths).toBe(1); expect(s.timeouts).toBe(1);
    expect(s.findings).toBe(2);
    expect(s.rows[1]).toMatchObject({ slotKey: 'b', cancel: 1, softlock: 1, missing: 1, durationSec: 30 });
  });

  it('コピー用テキストに走行条件・スキップ枠・1戦ごとのJSONが入る', () => {
    const txt = formatGauntletReport(
      { version: '0.25.0', startedAt: 'T', conditions: 'bot=standard', skipped: ['giantbat@stage-2(城ボス不在)'], slotCount: 21 },
      [rec({ slotKey: 'a' })],
    );
    expect(txt).toContain('bot=standard');
    expect(txt).toContain('giantbat@stage-2');
    expect(txt).toContain('"slotKey":"a"');
  });
});

describe('途中経過の保全(localStorage 1キー)', () => {
  const fake = () => {
    const map = new Map<string, string>();
    return {
      map,
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => { map.set(k, v); },
    };
  };
  const header = { version: 'v', startedAt: 'T1', conditions: 'c', skipped: [], slotCount: 2 };
  const rec = (slotKey: string): GauntletRecord => ({
    slotKey, label: slotKey, bossType: 'giantbat', stageId: 'stage-1', outcome: 'win',
    durationMs: 1, realMs: 1, findings: [], moveTally: {}, movesMissing: [], movesSeen: [], hpLost: 0,
  });

  it('同じ走行の記録は追記されていく', () => {
    const s = fake();
    appendGauntletLog(s, header, rec('a'));
    const log = appendGauntletLog(s, header, rec('b'));
    expect(log.records.map(r => r.slotKey)).toEqual(['a', 'b']);
    expect(JSON.parse(s.map.get(GAUNTLET_STORAGE_KEY)!).records.length).toBe(2);
  });

  it('別の走行(startedAtが違う)は前回を引き継がない=混ざらない', () => {
    const s = fake();
    appendGauntletLog(s, header, rec('a'));
    const log = appendGauntletLog(s, { ...header, startedAt: 'T2' }, rec('z'));
    expect(log.records.map(r => r.slotKey)).toEqual(['z']);
  });

  it('壊れた値が入っていても落ちない(記録を書き直す)', () => {
    const s = fake();
    s.setItem(GAUNTLET_STORAGE_KEY, '{壊れている');
    expect(appendGauntletLog(s, header, rec('a')).records.length).toBe(1);
  });
});

describe('②実時間の時計はボスが居る間だけ回す(出撃ローディングを誤検知しない)', () => {
  it('ボス不在(未出現/撃破後)は実時間が進んでも鳴らない', () => {
    const s = createGauntletWatch().softlock;
    let rang = false;
    for (let t = 0; t <= SOFTLOCK_REALTIME_MS * 2; t += 100) {
      if (stepSoftlock(s, sample({ gameTimeMs: 0, realMs: t, boss: null })).length > 0) rang = true;
    }
    expect(rang).toBe(false);
  });
});
