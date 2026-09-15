// ボス・ガントレット(全ボス×bot実機テスト)の判定中核。**正は research/BOSS_GAUNTLET.md**。
//
// このモジュールが持つのは「観測した値から**バグを検出する**」純関数と、その最小限の観測状態だけ。
// ★**記録専用**: ゲームの挙動・判定・数値・演出には一切触れない(触ってよいのは記録だけ)。
// 駆動(出撃・枠の切り替え・画面)は components/GauntletRunner.tsx、台帳は utils/bossPractice.ts。
//
// 掟(CLAUDE.md「Rendering vs. game logic」): 判定は world/store/utils 側に置く。pixiScene には置かない。
import { PRACTICE_SLOTS, type PracticeSlot } from './bossPractice';
import { createMoveCancelWatch, type MoveCancelWatch } from './moveCancelGuard';

// -------------------------------------------------------------------------------------------------
// しきい値(BOSS_GAUNTLET.md v3・社長裁定2026-08-19「推薦で」= 叩き台のまま実測で調整する)
// -------------------------------------------------------------------------------------------------
/** 1戦の打ち切り(実時間)。gameTimeではなく**実時間**で測る=gameTimeごと固まるハングも必ず切れる。 */
export const GAUNTLET_TIMEOUT_MS = 180_000;
/** 座標異常: ボスとプレイヤーの距離がこれを超えたら異常(場外・吹き飛び・座標破壊の検出)。 */
export const GAUNTLET_FAR_DIST_PX = 4000;
/** ソフトロック①(gameTime基準): 同じ状態のまま。 */
export const SOFTLOCK_SAME_STATE_MS = 20_000;
/** ソフトロック①(gameTime基準): ボスが動かない。 */
export const SOFTLOCK_NO_MOVE_MS = 15_000;
/** ソフトロック②(実時間基準): 実時間がこれだけ進んだのに gameTime がほぼ進んでいない。 */
export const SOFTLOCK_REALTIME_MS = 30_000;
/** ソフトロック②の「ほぼ進まない」= 実時間に対する gameTime の進み率がこの割合未満。 */
export const SOFTLOCK_GAMETIME_RATE = 0.02;
/** ボスが「動いた」とみなす1フレームの移動量(px)。これ未満の揺れは静止扱い。 */
export const SOFTLOCK_MOVE_EPS_PX = 1.5;

/**
 * ソフトロック判定から**除外**する状態(BOSS_GAUNTLET.md「除外: dormant・帰巣・休憩系・pause」)。
 * dormant(未起動)と pause は状態名ではなくフラグで来るので、呼び出し側が `excluded` で渡す。
 */
export const SOFTLOCK_EXCLUDED_STATES: ReadonlySet<string> = new Set([
  'return',     // 帰巣(リーシュで定位置へ戻る)
  'mk-repose',  // 舞妓の休憩(bountyTick: 台本の間合い取り)
]);

// -------------------------------------------------------------------------------------------------
// 走る枠(PRACTICE_SLOTS 全22枠 − スキップ)
// -------------------------------------------------------------------------------------------------
/**
 * 走らない枠。`giantbat@stage-2` は**そのステージに城ボスが存在しない**(bossPractice.castleSortie が
 * reachable:false を返す枠)ので、出撃しても永久にボスが出ない=タイムアウトを1本無駄にするだけ。
 * **スキップした事実は結果へ明記する**(黙って減らさない)。
 *
 * `guardian-phantom@practice`(research/GHOST_BOSS.md の実験枠「決闘」)は**未検証のボスを自動テストへ
 * 混ぜない**ため。安定したらこの行を外す(=外せば自動的にガントレットへ入る)。
 */
export const GAUNTLET_SKIP_SLOT_KEYS: readonly string[] = ['giantbat@stage-2', 'guardian-phantom@practice'];

export const gauntletSlots = (slots: readonly PracticeSlot[] = PRACTICE_SLOTS): readonly PracticeSlot[] =>
  slots.filter(s => !GAUNTLET_SKIP_SLOT_KEYS.includes(s.slotKey));

export const gauntletSkippedSlots = (slots: readonly PracticeSlot[] = PRACTICE_SLOTS): readonly PracticeSlot[] =>
  slots.filter(s => GAUNTLET_SKIP_SLOT_KEYS.includes(s.slotKey));

/** 次に走る枠の番号。終わっていれば null(= 完走)。 */
export const nextGauntletIndex = (current: number, total: number): number | null =>
  current + 1 < total ? current + 1 : null;

// -------------------------------------------------------------------------------------------------
// 1戦の終了判定
// -------------------------------------------------------------------------------------------------
export type GauntletOutcome = 'win' | 'death' | 'timeout';

export interface RunEndInput {
  /** store の gameWon(練習の勝利=ボス撃破)。 */
  won: boolean;
  /** bot(プレイヤー)のHP。 */
  playerHealth: number;
  /** この戦いを始めてからの**実時間**(ms)。 */
  elapsedRealMs: number;
  timeoutMs?: number;
}

/**
 * 1戦が終わったか。優先順位は **win > death > timeout**(同フレームに複数立った時の決定性のため)。
 * タイムアウトは敗北ではなく「時間内に削れず」の記録(BOSS_GAUNTLET.md: バランスは別件)。
 */
export const judgeRunEnd = (i: RunEndInput): GauntletOutcome | null => {
  if (i.won) return 'win';
  if (i.playerHealth <= 0) return 'death';
  if (i.elapsedRealMs >= (i.timeoutMs ?? GAUNTLET_TIMEOUT_MS)) return 'timeout';
  return null;
};

// -------------------------------------------------------------------------------------------------
// 発見(finding)
// -------------------------------------------------------------------------------------------------
export type GauntletFindingKind = 'cancel' | 'softlock' | 'error' | 'anomaly';

export interface GauntletFinding {
  kind: GauntletFindingKind;
  detail: string;
  /** その瞬間のボスの状態(`enemy.bossState ?? enemy.aiPhase`)。 */
  bossState: string | null;
  bossX: number | null;
  bossY: number | null;
  playerX: number | null;
  playerY: number | null;
  /** ゲーム内時刻(ms)。 */
  gameTimeMs: number;
  /** 実時刻(ISO)。 */
  at: string;
}

/** 毎フレームこれ1つを渡す(store から集めた値の写し。ここで store を読まない=テスト可能に保つ)。 */
export interface GauntletSample {
  gameTimeMs: number;
  realMs: number;
  /** ポーズ中/バックグラウンド(シミュが止まっている)= 時計を進めない。 */
  frozen: boolean;
  player: { x: number; y: number; health: number } | null;
  /** 対象ボス(未出現/撃破後は null)。 */
  boss: {
    id: string;
    state: string | null;
    x: number; y: number;
    health: number;
    posture: number | null;
    dormant: boolean;
  } | null;
  /** そのフレームにボスが出していた技キー(moveReaction.anyMoveKeyForEnemy の結果)。 */
  moveKey: string | null;
}

interface SoftlockState {
  lastState: string | null;
  stateSinceGameTime: number | null;
  lastBossX: number | null;
  lastBossY: number | null;
  movedAtGameTime: number | null;
  lastGameTime: number | null;
  lastRealMs: number | null;
  stallRealMs: number;
}

export interface GauntletWatch {
  cancel: MoveCancelWatch;
  softlock: SoftlockState;
  /** この戦いで一度でも出た技キー(技カバレッジ用)。 */
  seenMoves: Set<string>;
  findings: GauntletFinding[];
  /** 同じ発見で溢れさせないための既出キー。 */
  reported: Set<string>;
  /** この戦いで失ったHPの合計(bot の被弾量の目安)。 */
  hpLost: number;
  lastPlayerHealth: number | null;
}

export const createGauntletWatch = (): GauntletWatch => ({
  cancel: createMoveCancelWatch(),
  softlock: {
    lastState: null, stateSinceGameTime: null,
    lastBossX: null, lastBossY: null, movedAtGameTime: null,
    lastGameTime: null, lastRealMs: null, stallRealMs: 0,
  },
  seenMoves: new Set<string>(),
  findings: [],
  reported: new Set<string>(),
  hpLost: 0,
  lastPlayerHealth: null,
});

/** 発見を1件積む(同じ種別×詳細は1戦につき1回だけ=ログが溢れない)。 */
export const pushFinding = (
  w: GauntletWatch, kind: GauntletFindingKind, detail: string, s: GauntletSample,
): boolean => {
  const dedupe = `${kind}|${detail}`;
  if (w.reported.has(dedupe)) return false;
  w.reported.add(dedupe);
  w.findings.push({
    kind, detail,
    bossState: s.boss?.state ?? null,
    bossX: s.boss ? Math.round(s.boss.x) : null,
    bossY: s.boss ? Math.round(s.boss.y) : null,
    playerX: s.player ? Math.round(s.player.x) : null,
    playerY: s.player ? Math.round(s.player.y) : null,
    gameTimeMs: Math.round(s.gameTimeMs),
    at: new Date().toISOString(),
  });
  return true;
};

/**
 * 座標・状態の異常(BOSS_GAUNTLET.md 検出器6)。**見つかった理由の全数**を返す純関数。
 * NaN座標/HP・体勢の負値・ボスとプレイヤーの距離が異常。
 */
export const anomalyReasons = (s: GauntletSample, farDistPx = GAUNTLET_FAR_DIST_PX): string[] => {
  const out: string[] = [];
  const bad = (v: number | null | undefined): boolean => v !== null && v !== undefined && !Number.isFinite(v);
  if (s.player) {
    if (bad(s.player.x) || bad(s.player.y)) out.push('プレイヤー座標がNaN/無限');
    if (bad(s.player.health)) out.push('プレイヤーHPがNaN/無限');
  }
  const b = s.boss;
  if (b) {
    if (bad(b.x) || bad(b.y)) out.push('ボス座標がNaN/無限');
    if (bad(b.health)) out.push('ボスHPがNaN/無限');
    if (b.posture !== null && bad(b.posture)) out.push('ボス体勢がNaN/無限');
    if (b.posture !== null && Number.isFinite(b.posture) && b.posture < 0) out.push('ボス体勢が負値');
    if (s.player && Number.isFinite(b.x) && Number.isFinite(b.y)
      && Number.isFinite(s.player.x) && Number.isFinite(s.player.y)) {
      const d = Math.hypot(b.x - s.player.x, b.y - s.player.y);
      if (d > farDistPx) out.push(`ボスとの距離が異常(${Math.round(d)}px > ${farDistPx}px)`);
    }
  }
  return out;
};

/**
 * ソフトロックの時計2本を1フレーム進める。見つかった理由(0〜2件)を返す。
 * ① gameTime基準: 同一状態20秒 / ボス無動作15秒(熱ダレでフレームが落ちても誤検知しない)
 * ② 実時間基準: 実時間30秒進んだのに gameTime がほぼ進まない
 *    (hitstop/attention の固まりは①の時計では**原理的に見えない**ため別に持つ)
 * 除外: dormant・帰巣(return)・休憩(mk-repose)・pause/バックグラウンド。
 */
export const stepSoftlock = (st: SoftlockState, s: GauntletSample): string[] => {
  const out: string[] = [];
  // ---- ② 実時間の時計 ----
  // ★**ボスが居る間だけ**回す。出撃ローディング中(素材のGPUアップロード等)は gameTime が進まない
  // ままフレームだけ流れるので、回しっぱなしにすると**読み込みの遅さをハングと誤検知**する。
  // 狙いの事故(hitstop/attentionの固まり)は戦闘中に起きるので、これで取り逃さない。
  if (st.lastRealMs !== null && st.lastGameTime !== null) {
    const dReal = s.realMs - st.lastRealMs;
    const dGame = s.gameTimeMs - st.lastGameTime;
    if (s.frozen || s.boss === null || dReal <= 0) {
      st.stallRealMs = 0;
    } else if (dGame < dReal * SOFTLOCK_GAMETIME_RATE) {
      st.stallRealMs += dReal;
      if (st.stallRealMs >= SOFTLOCK_REALTIME_MS) {
        out.push(`実時間${Math.round(st.stallRealMs / 1000)}秒でgameTimeがほぼ進まない(ハング)`);
        st.stallRealMs = 0; // 一度出したら測り直す(毎フレーム出さない)
      }
    } else {
      st.stallRealMs = 0;
    }
  }
  st.lastRealMs = s.realMs;
  st.lastGameTime = s.gameTimeMs;

  // ---- ① gameTime の時計(対象ボスが起きていて、除外状態でない間だけ) ----
  const b = s.boss;
  const excluded = s.frozen || b === null || b.dormant
    || (b.state !== null && SOFTLOCK_EXCLUDED_STATES.has(b.state));
  if (excluded || b === null) {
    st.lastState = null; st.stateSinceGameTime = null;
    st.lastBossX = null; st.lastBossY = null; st.movedAtGameTime = null;
    return out;
  }
  if (b.state !== st.lastState || st.stateSinceGameTime === null) {
    st.lastState = b.state;
    st.stateSinceGameTime = s.gameTimeMs;
  } else if (s.gameTimeMs - st.stateSinceGameTime >= SOFTLOCK_SAME_STATE_MS) {
    out.push(`同じ状態(${b.state ?? 'なし'})のまま${Math.round((s.gameTimeMs - st.stateSinceGameTime) / 1000)}秒`);
    st.stateSinceGameTime = s.gameTimeMs; // 測り直す
  }
  if (st.lastBossX === null || st.lastBossY === null || st.movedAtGameTime === null) {
    st.lastBossX = b.x; st.lastBossY = b.y; st.movedAtGameTime = s.gameTimeMs;
  } else {
    if (Math.hypot(b.x - st.lastBossX, b.y - st.lastBossY) >= SOFTLOCK_MOVE_EPS_PX) {
      st.lastBossX = b.x; st.lastBossY = b.y; st.movedAtGameTime = s.gameTimeMs;
    } else if (s.gameTimeMs - st.movedAtGameTime >= SOFTLOCK_NO_MOVE_MS) {
      out.push(`ボスが${Math.round((s.gameTimeMs - st.movedAtGameTime) / 1000)}秒動かない`);
      st.movedAtGameTime = s.gameTimeMs; // 測り直す
    }
  }
  return out;
};

/** 1フレームの観測(検出器1・2・4・6をまとめて回す)。5(例外)はイベント駆動なので別口。 */
export const stepGauntletWatch = (w: GauntletWatch, s: GauntletSample): void => {
  // 4: 技カバレッジ(出た技を溜める)
  if (s.moveKey) w.seenMoves.add(s.moveKey);
  // 1: 技キャンセル違反(実戦の状態=bossState ?? aiPhase を毎フレーム食わせる)
  if (s.boss) {
    const v = w.cancel.observe(s.boss.id, s.boss.state);
    if (v !== null) pushFinding(w, 'cancel', v, s);
  }
  // 2: ソフトロック(時計2本)
  for (const r of stepSoftlock(w.softlock, s)) pushFinding(w, 'softlock', r, s);
  // 6: 座標・状態の異常
  for (const r of anomalyReasons(s)) pushFinding(w, 'anomaly', r, s);
  // 被弾量の目安(記録用。回復で増えた分は数えない)
  if (s.player) {
    if (w.lastPlayerHealth !== null && s.player.health < w.lastPlayerHealth) {
      w.hpLost += w.lastPlayerHealth - s.player.health;
    }
    w.lastPlayerHealth = s.player.health;
  }
};

// -------------------------------------------------------------------------------------------------
// 1戦の記録
// -------------------------------------------------------------------------------------------------
export interface MoveTallyRow { exposures: number; counters: number; hits: number }

export interface GauntletRecord {
  slotKey: string;
  label: string;
  bossType: string;
  stageId: string;
  outcome: GauntletOutcome;
  /** 所要(gameTime・ms)。 */
  durationMs: number;
  /** 所要(実時間・ms)。 */
  realMs: number;
  findings: GauntletFinding[];
  /** 技への反応表(暴露/カウンター/被弾)。**被弾内訳はこの hits**(技キー付きの被弾)。 */
  moveTally: Record<string, MoveTallyRow>;
  /** 技カバレッジ: この戦いで一度も出なかった技。 */
  movesMissing: string[];
  /** この戦いで出た技。 */
  movesSeen: string[];
  /** 失ったHPの合計(技キーが付かない被弾も含む総量)。 */
  hpLost: number;
}

export interface GauntletHeader {
  version: string;
  startedAt: string;
  /** 走行条件(bot設定・装備概要など。人間が読む1行)。 */
  conditions: string;
  skipped: string[];
  slotCount: number;
}

/** 技カバレッジ(出なかった技)。台帳(そのボスが持ち得る技)と実測の差。 */
export const missingMoves = (
  ledger: readonly string[], seen: ReadonlySet<string>,
): string[] => ledger.filter(k => !seen.has(k));

// -------------------------------------------------------------------------------------------------
// 要約(完走時の表)
// -------------------------------------------------------------------------------------------------
export interface GauntletSummaryRow {
  slotKey: string;
  label: string;
  outcome: GauntletOutcome;
  durationSec: number;
  findings: number;
  cancel: number;
  softlock: number;
  error: number;
  anomaly: number;
  missing: number;
}

export interface GauntletSummary {
  rows: GauntletSummaryRow[];
  total: number;
  wins: number;
  deaths: number;
  timeouts: number;
  findings: number;
}

export const summarizeGauntlet = (records: readonly GauntletRecord[]): GauntletSummary => {
  const rows = records.map<GauntletSummaryRow>(r => {
    const count = (k: GauntletFindingKind): number => r.findings.filter(f => f.kind === k).length;
    return {
      slotKey: r.slotKey,
      label: r.label,
      outcome: r.outcome,
      durationSec: Math.round(r.durationMs / 1000),
      findings: r.findings.length,
      cancel: count('cancel'),
      softlock: count('softlock'),
      error: count('error'),
      anomaly: count('anomaly'),
      missing: r.movesMissing.length,
    };
  });
  return {
    rows,
    total: records.length,
    wins: records.filter(r => r.outcome === 'win').length,
    deaths: records.filter(r => r.outcome === 'death').length,
    timeouts: records.filter(r => r.outcome === 'timeout').length,
    findings: records.reduce((a, r) => a + r.findings.length, 0),
  };
};

/** コピー用のテキスト(ヘッダ=走行条件 + 要約表 + 1戦ごとのJSON)。設計チャットがそのまま読む。 */
export const formatGauntletReport = (
  header: GauntletHeader, records: readonly GauntletRecord[],
): string => {
  const s = summarizeGauntlet(records);
  const lines: string[] = [];
  lines.push('# BOSS GAUNTLET');
  lines.push(`version: ${header.version}`);
  lines.push(`startedAt: ${header.startedAt}`);
  lines.push(`conditions: ${header.conditions}`);
  lines.push(`slots: ${records.length}/${header.slotCount}  skipped: ${header.skipped.join(', ') || 'なし'}`);
  lines.push(`result: win ${s.wins} / death ${s.deaths} / timeout ${s.timeouts}  findings ${s.findings}`);
  lines.push('');
  lines.push('slot\tresult\tsec\tfind\tcancel\tlock\terr\tanom\tmissing');
  for (const r of s.rows) {
    lines.push([
      r.slotKey, r.outcome, r.durationSec, r.findings, r.cancel, r.softlock, r.error, r.anomaly, r.missing,
    ].join('\t'));
  }
  lines.push('');
  lines.push('## records (1行=1戦のJSON)');
  for (const r of records) lines.push(JSON.stringify(r));
  return lines.join('\n');
};

// -------------------------------------------------------------------------------------------------
// 途中経過の保全(localStorage)
// -------------------------------------------------------------------------------------------------
/**
 * ★練習ラン中でも書けるようにするため practiceGuard の許可リストへ入れてある**唯一の記録キー**
 * (社長裁定2026-08-19「推薦で」)。進行・セーブとは無関係の開発用ログ。
 */
export const GAUNTLET_STORAGE_KEY = 'zombie:gauntlet';

export interface GauntletLog { v: 1; header: GauntletHeader; records: GauntletRecord[] }

/** 途中経過の追記(ブラウザが落ちても直前までの戦績が残る)。壊れた値は捨てて上書きする。 */
export const appendGauntletLog = (
  storage: Pick<Storage, 'getItem' | 'setItem'>, header: GauntletHeader, record: GauntletRecord,
): GauntletLog => {
  let log: GauntletLog = { v: 1, header, records: [] };
  try {
    const raw = storage.getItem(GAUNTLET_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GauntletLog>;
      if (parsed && parsed.v === 1 && Array.isArray(parsed.records) && parsed.header?.startedAt === header.startedAt) {
        log = { v: 1, header, records: parsed.records };
      }
    }
  } catch {
    // 壊れていたら新規で書き直す(記録用なので握り潰してよい)
  }
  log.records.push(record);
  try { storage.setItem(GAUNTLET_STORAGE_KEY, JSON.stringify(log)); } catch { /* 容量超過等は無視 */ }
  return log;
};
