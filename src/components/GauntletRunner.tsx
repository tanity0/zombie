// ボス・ガントレット(全ボス×bot実機テスト)の**駆動**。正は research/BOSS_GAUNTLET.md。
//
// ★これは**開発ツール**であってプレイヤー用の画面ではない(見た目・UXに労力をかけない)。
// ★**記録専用**: ゲームの仕様・挙動・バランス・演出には一切触れない。ここがやるのは
//   ①枠順に自動出撃 ②終了検知 ③切れ目ない枠差し替え ④観測(判定は utils/gauntlet.ts の純関数)
//   ⑤結果の書き出し、の5つだけ。
//
// 掟(CLAUDE.md「React re-render discipline」): 毎フレームの値は**全部 ref**に置き、Reactへは
// 0.5秒に1回の小さな拍(phase/beat)しか流さない。この部品はGameの兄弟なので、拍が立っても
// ゲーム本体のHUDは再描画されない。
import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { ghostRunEnabled } from '../utils/ghostDriver';
import { anyMoveKeyForEnemy, moveKeysForBossType } from '../utils/moveReaction';
import { snapshotMoveTally, resetMoveTally } from '../utils/playerTraits';
import { lastSuppressedError, rearmSuppressedError } from '../utils/errorBeacon';
import { rearmLoopErrorFlags } from '../hooks/useGameLoop';
import { rearmRenderErrorFlags } from '../pixi/renderErrorFlags';
import { PixiScene } from '../pixi/pixiScene';
import type { PracticeSlot } from '../utils/bossPractice';
import {
  createGauntletWatch, stepGauntletWatch, pushFinding, judgeRunEnd, nextGauntletIndex,
  gauntletSlots, gauntletSkippedSlots, missingMoves, summarizeGauntlet, formatGauntletReport,
  appendGauntletLog, GAUNTLET_TIMEOUT_MS,
  type GauntletWatch, type GauntletRecord, type GauntletHeader, type GauntletSample, type MoveTallyRow,
} from '../utils/gauntlet';

const APP_VERSION = __APP_VERSION__;

// -------------------------------------------------------------------------------------------------
// 検出器5: console error / 未捕捉例外 / WebGLコンテキストロスト
// ★フックは**モジュール寿命で1回だけ**張る(canvasは戦いごとに張り直されるので、contextlost は
//   window の capture で取る=BOSS_GAUNTLET.md #14)。拾った文字列は待ち行列へ積み、
//   駆動の毎フレームが今の戦いの記録へ流し込む。
// -------------------------------------------------------------------------------------------------
const errorQueue: string[] = [];
const ERROR_QUEUE_CAP = 200;
let errorHooksInstalled = false;

const pushError = (s: string): void => {
  if (errorQueue.length >= ERROR_QUEUE_CAP) return;
  errorQueue.push(s.slice(0, 300));
};

const installErrorHooks = (): void => {
  if (errorHooksInstalled) return;
  errorHooksInstalled = true;
  window.addEventListener('error', ev => {
    pushError(`onerror: ${ev.message} @${ev.filename ?? '?'}:${ev.lineno ?? 0}`);
  });
  window.addEventListener('unhandledrejection', ev => {
    const r = (ev as PromiseRejectionEvent).reason as { message?: string } | undefined;
    pushError(`unhandledrejection: ${r?.message ?? String(r)}`);
  });
  // canvas は戦いごとに張り直される(再マウント)ので、**window の capture** で受ける。
  window.addEventListener('webglcontextlost', () => pushError('webglcontextlost'), true);
  const orig = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    try {
      pushError(`console.error: ${args.map(a => (a instanceof Error ? a.message : String(a))).join(' ')}`);
    } catch { /* 記録に失敗しても元のログは出す */ }
    orig(...args);
  };
};

// -------------------------------------------------------------------------------------------------
// 駆動の状態(全部 ref に持つ=毎フレームでReactを起こさない)
// -------------------------------------------------------------------------------------------------
interface RunnerState {
  slots: readonly PracticeSlot[];
  index: number;
  header: GauntletHeader;
  records: GauntletRecord[];
  watch: GauntletWatch;
  /** 新しい戦いが立ち上がったか(勝敗の残りかすで即終了しないための安全弁)。 */
  armed: boolean;
  startRealMs: number;
  startGameTime: number;
  /** 「新しい戦いが始まった」の判定に使う水位: **これより gameTime が巻き戻ったら**新しい戦い。
   *  出撃(resetGame)で gameTime は 0 へ戻るので、打ち切り(タイムアウト)のように
   *  勝敗フラグが立たない終わり方でも、前の戦いのまま二重に数え始めることがない。 */
  armWatermark: number;
  /** 0.5秒ごとに控える反応表(撃破の瞬間にセッションが閉じて読めなくなるため)。 */
  lastTally: Record<string, MoveTallyRow>;
  lastTallySampleAt: number;
  finished: boolean;
}

/** 反応表(Partial表)を記録用の素直な表へ均す(undefinedの穴を落とす)。 */
const tallyRows = (t: Partial<Record<string, MoveTallyRow>>): Record<string, MoveTallyRow> => {
  const out: Record<string, MoveTallyRow> = {};
  for (const [k, v] of Object.entries(t)) if (v) out[k] = { exposures: v.exposures, counters: v.counters, hits: v.hits };
  return out;
};

const emptyRecordBase = (slot: PracticeSlot) => ({
  slotKey: slot.slotKey,
  label: slot.label ?? slot.slotKey,
  bossType: String(slot.bossType),
  stageId: slot.stageId,
});

/** 走行条件のヘッダ(あとで結果を読む時に「何で走ったか」が分からないと資料にならない)。 */
const buildHeader = (slotCount: number, skipped: readonly PracticeSlot[]): GauntletHeader => {
  const p = new URLSearchParams(window.location.search);
  const st = useGameStore.getState();
  const conditions = [
    `bot=${p.get('bot') ?? 'なし'}`,
    `botskill=${p.get('botskill') ?? '既定'}`,
    `class=${st.characterClass || p.get('class') || 'warrior'}`,
    `lv=${st.player.level}`,
    `companion=${st.companionSkill ?? 'なし'}`,
    `renderer=${p.get('renderer') ?? 'pixi'}`,
    `timeout=${Math.round(GAUNTLET_TIMEOUT_MS / 1000)}s`,
  ].join(' / ');
  return {
    version: APP_VERSION,
    startedAt: new Date().toISOString(),
    conditions,
    skipped: skipped.map(s => `${s.slotKey}(城ボス不在=出ないためスキップ)`),
    slotCount,
  };
};

interface GauntletRunnerProps {
  /** 枠へ出撃する(App: 次枠の beginPracticeRun → startGame)。 */
  onStartSlot: (slot: PracticeSlot) => void;
  /** 完走(または全枠打ち切り)。App: 練習ランを抜けてメニューへ。 */
  onFinish: () => void;
}

export default function GauntletRunner({ onStartSlot, onFinish }: GauntletRunnerProps) {
  const [phase, setPhase] = useState<'boot' | 'refused' | 'running' | 'done'>('boot');
  const [refusal, setRefusal] = useState('');
  const [, setBeat] = useState(0);
  const [note, setNote] = useState('');
  const ref = useRef<RunnerState | null>(null);
  // 親(App)から渡される関数は毎レンダー別物になるので ref で受ける
  // (依存に入れると毎レンダーで観測ループを張り直すことになる)。
  const cbRef = useRef({ onStartSlot, onFinish });
  cbRef.current = { onStartSlot, onFinish };
  // StrictMode の二重マウントで2回走り出さないための門(モジュール寿命ではなくこの部品の寿命で足りる)。
  const startedRef = useRef(false);

  // ---- 起動: 守護霊チェック → 1枠目へ ----------------------------------------------------------
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    installErrorHooks();

    // ★守護霊が有効なら**走行を開始しない**(反応表が全滅する+ボスHPが変わる)。
    const ghostDebug = new URLSearchParams(window.location.search).get('ghost') === '1';
    const companion = useGameStore.getState().companionSkill;
    if (ghostRunEnabled(ghostDebug, companion ? [companion] : [])) {
      setRefusal(
        `守護霊(同行者)が有効なため走行しません: ${ghostDebug ? '?ghost=1' : `装備スキル ${companion}`}\n`
        + '理由: ゴーストが出るランは技への反応表が丸ごと計測されず(§2.7 制約1)、ボスHPも変わるため、\n'
        + '結果が資料になりません。同行者を外して(または ?ghost=1 を消して)再度開いてください。',
      );
      setPhase('refused');
      return;
    }

    const slots = gauntletSlots();
    const skipped = gauntletSkippedSlots();
    ref.current = {
      slots,
      index: 0,
      header: buildHeader(slots.length, skipped),
      records: [],
      watch: createGauntletWatch(),
      armed: false,
      startRealMs: performance.now(),
      startGameTime: 0,
      armWatermark: Number.POSITIVE_INFINITY, // 1枠目は待たずに始める
      lastTally: {},
      lastTallySampleAt: 0,
      finished: false,
    };
    setPhase('running');
    cbRef.current.onStartSlot(slots[0]);
    // 起動は1回だけ(依存は意図的に空。親から渡る関数は cbRef 経由で読む)。
  }, []);

  // ---- 観測ループ(rAF・Reactを毎フレーム起こさない) --------------------------------------------
  useEffect(() => {
    if (phase !== 'running') return;
    let raf = 0;
    let beatAt = 0;

    const finishSlot = (outcome: 'win' | 'death' | 'timeout', s: GauntletSample): void => {
      const r = ref.current;
      if (!r || r.finished) return;
      const slot = r.slots[r.index];
      // 反応表は**撃破の瞬間に計測セッションが閉じる**ので、直近の控えを使う(空なら今読める分)。
      const live = tallyRows(snapshotMoveTally());
      const tally = Object.keys(live).length > 0 ? live : r.lastTally;
      const ledger = moveKeysForBossType(String(slot.bossType));
      const record: GauntletRecord = {
        ...emptyRecordBase(slot),
        outcome,
        durationMs: Math.max(0, Math.round(s.gameTimeMs - r.startGameTime)),
        realMs: Math.round(performance.now() - r.startRealMs),
        findings: r.watch.findings,
        moveTally: tally,
        movesMissing: missingMoves(ledger, r.watch.seenMoves),
        movesSeen: [...r.watch.seenMoves].sort(),
        hpLost: Math.round(r.watch.hpLost),
      };
      r.records.push(record);
      // 途中経過の保全(ブラウザが落ちても直前までが残る)+ console にも1行(タブごと落ちた時の手掛かり)。
      try { appendGauntletLog(window.localStorage, r.header, record); } catch { /* 記録失敗は無視 */ }
      console.info('[gauntlet]', JSON.stringify(record));

      const next = nextGauntletIndex(r.index, r.slots.length);
      if (next === null) {
        r.finished = true;
        setPhase('done');
        cbRef.current.onFinish();
        return;
      }
      // 次の戦いへ。**先に「1回きり」フラグを再アーム**してから出撃する(2戦目以降が無音にならない)。
      rearmLoopErrorFlags();
      rearmRenderErrorFlags();
      PixiScene.rearmDrawErrorFlag();
      rearmSuppressedError();
      errorQueue.length = 0;
      r.index = next;
      r.watch = createGauntletWatch();
      r.armed = false;
      r.armWatermark = s.gameTimeMs; // 次の出撃で gameTime が巻き戻るのを待つ
      r.lastTally = {};
      r.startRealMs = performance.now();
      // ★順序の罠(BOSS_GAUNTLET.md): endPracticeRun は**呼ばない**。次枠の beginPracticeRun →
      //   startGame の順で差し替える(一瞬でも isPracticeRun()=false になると、遅れて来た勝敗遷移が
      //   通常経路=セーブ汚染へ落ちる)。実際の差し替えは App 側の onStartSlot が行う。
      cbRef.current.onStartSlot(r.slots[next]);
    };

    const frame = (): void => {
      raf = requestAnimationFrame(frame);
      const r = ref.current;
      if (!r || r.finished) return;
      const st = useGameStore.getState();
      const slot = r.slots[r.index];
      const nowMs = performance.now();

      // 自動テストの地雷(ENGINEERING_NOTES): チュートリアルのポップアップはポーズを立てる=
      // 閉じないとシミュが1フレームも進まない。**「OKを押す」のと同じ**ことをする(進行は書かない)。
      if (st.tutorialPopup) st.closeTutorialPopup();

      // 対象ボス(未出現/撃破後は null)。idol は `?idolnow` で休眠個体が併存するので dormant を外す。
      const boss = st.enemies.find(e => e.type === slot.bossType && !e.dormant)
        ?? st.enemies.find(e => e.type === slot.bossType)
        ?? null;
      const sample: GauntletSample = {
        gameTimeMs: st.gameTime,
        realMs: nowMs,
        frozen: st.isPaused || st.backgrounded,
        player: { x: st.player.x, y: st.player.y, health: st.player.health },
        boss: boss
          ? {
            id: boss.id,
            state: boss.bossState ?? boss.aiPhase ?? null,
            x: boss.x, y: boss.y, health: boss.health,
            posture: boss.bossPosture ?? null,
            dormant: boss.dormant === true,
          }
          : null,
        moveKey: boss ? anyMoveKeyForEnemy(boss) : null,
      };

      // 新しい戦いの立ち上がりを待つ(前の戦いの残りかす=勝敗フラグ・HP・時計で即終了しないため)。
      if (!r.armed) {
        if (st.gameTime < r.armWatermark && !st.gameWon && st.player.health > 0) {
          r.armed = true;
          r.startGameTime = st.gameTime;
          r.startRealMs = nowMs;
          resetMoveTally(); // 前の戦いの反応表を持ち越さない
        }
        return;
      }

      stepGauntletWatch(r.watch, sample);

      // 検出器5: 待ち行列の例外+握り潰しビーコンを、今の戦いの発見として取り込む。
      while (errorQueue.length > 0) {
        const msg = errorQueue.shift();
        if (msg) pushFinding(r.watch, 'error', msg, sample);
      }
      const beacon = lastSuppressedError();
      if (beacon) pushFinding(r.watch, 'error', `握り潰し例外: ${beacon}`, sample);

      // 反応表の控え(0.5秒ごと)。撃破の瞬間に計測セッションが閉じても直前の値が残る。
      if (nowMs - r.lastTallySampleAt >= 500) {
        r.lastTallySampleAt = nowMs;
        const t = tallyRows(snapshotMoveTally());
        if (Object.keys(t).length > 0) r.lastTally = t;
      }

      const outcome = judgeRunEnd({
        won: st.gameWon,
        playerHealth: st.player.health,
        elapsedRealMs: nowMs - r.startRealMs,
      });
      if (outcome) finishSlot(outcome, sample);

      // 画面の拍(0.5秒に1回だけReactを起こす)。
      if (nowMs - beatAt >= 500) { beatAt = nowMs; setBeat(b => b + 1); }
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // ---- 画面(開発ツール。飾らない) ---------------------------------------------------------------
  if (phase === 'refused') {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 p-6">
        <pre className="max-w-[90vw] whitespace-pre-wrap text-[12px] leading-relaxed text-amber-200">
          {`BOSS GAUNTLET: 走行しません\n\n${refusal}`}
        </pre>
      </div>
    );
  }

  const r = ref.current;
  if (phase === 'running' && r) {
    const slot = r.slots[r.index];
    const found = r.watch.findings.length;
    const sec = Math.round((performance.now() - r.startRealMs) / 1000);
    return (
      <div className="pointer-events-none fixed left-1/2 top-1 z-[90] -translate-x-1/2 rounded bg-black/60 px-2 py-0.5 text-[10px] tabular-nums text-emerald-200">
        {`GAUNTLET ${r.index + 1}/${r.slots.length} ${slot.slotKey} ${sec}s 発見${found}`}
      </div>
    );
  }

  if (phase === 'done' && r) {
    const s = summarizeGauntlet(r.records);
    return (
      <div className="fixed inset-0 z-[200] overflow-auto bg-black/95 p-3 text-[11px] text-white/85">
        <div className="mb-2 flex items-center gap-2">
          <span className="font-bold text-emerald-300">BOSS GAUNTLET 完走</span>
          <button
            className="rounded bg-emerald-500/85 px-2 py-1 text-[11px] font-bold text-black"
            onClick={async () => {
              const txt = formatGauntletReport(r.header, r.records);
              try { await navigator.clipboard.writeText(txt); setNote('コピーしました'); }
              catch { window.prompt('コピーしてください', txt); setNote(''); }
            }}
          >コピー</button>
          <span className="text-white/60">{note}</span>
        </div>
        <div className="mb-2 whitespace-pre-wrap text-[10px] text-white/55">
          {`${r.header.conditions}\nskipped: ${r.header.skipped.join(', ') || 'なし'}\n`
            + `win ${s.wins} / death ${s.deaths} / timeout ${s.timeouts}  発見 ${s.findings}`}
        </div>
        <table className="w-full text-left tabular-nums">
          <thead className="text-white/50">
            <tr><th>枠</th><th>結果</th><th>秒</th><th>発見</th><th>切</th><th>固</th><th>例</th><th>異</th><th>未出</th></tr>
          </thead>
          <tbody>
            {s.rows.map(row => (
              <tr key={row.slotKey} className={row.findings > 0 ? 'text-amber-200' : ''}>
                <td>{row.slotKey}</td><td>{row.outcome}</td><td>{row.durationSec}</td>
                <td>{row.findings}</td><td>{row.cancel}</td><td>{row.softlock}</td>
                <td>{row.error}</td><td>{row.anomaly}</td><td>{row.missing}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return null;
}
