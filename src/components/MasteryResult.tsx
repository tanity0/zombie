// リザルトの「MASTERY」区画(research/MASTERY.md §6-2・バッチB): この出撃で伸びた武器・サブウェポンの棒が貯まっていく。
// 社長の言葉「リザルトは溜まる演出にしてほしい」。
//
// ・貯まる順番は純関数 masteryFillSteps / masteryResultRows(utils/masteryView)。ここは尺と動きだけ。
// ・動きはこの部品の中だけの rAF で DOM を直接書く(store を購読しない・毎フレーム setState しない)。
//   区画が画面に入った時に始め、画面の外に居る間は rAF を止める(IntersectionObserver。無い環境はマウント時に開始)。
// ・行は1本ずつ順に貯める(前の行が止まってから次)。並びは「上がらない行 → 上がる行」=上がる行を最後に見せる。
// ・塗り分け: 出撃前までの部分は暗い金、今回伸びた部分は明るい金。段階が上がった後の段は0から全部明るい。
//   演出が終わった静止画でも「今回どれだけ伸びたか」が読める。
// ・段階が上がる瞬間: 行の背景を明るい帯が1度なめる / 棒が白く飽和して戻る / 棒が太く膨らんで戻る /
//   札は前の数字が上へ押し出され新しい数字が下から入る。MAX は別扱い(金のまま残す・字間を広げた MAX・SE を強く)。
// ・数字(倍率・量・%)は出さない。名前・段階・棒だけ。
import React, { useEffect, useMemo, useRef } from 'react';
import { playSfx } from '../audio/audioManager';
import { subWeaponDisplayName } from '../store/gameStore';
import type { SubWeaponKey } from '../types/game';
import { MASTERY_MAX_LEVEL, type GrowingMasteryKey } from '../data/mastery';
import type { MasteryCommitResult } from '../utils/mastery';
import {
  MASTERY_GOLD, masteryDebugLine, masteryDebugRunLine, masteryFillSteps, masteryLevelLabel, masteryResultRows, type MasteryFillStep,
} from '../utils/masteryView';
import { isMasteryRunIgnored } from '../utils/masteryRun';
import { MASTERY_DEBUG_ACTIVE } from '../utils/devTestKnobs';

const GUN_NAME: Partial<Record<GrowingMasteryKey, string>> = {
  handgun: 'ハンドガン', shotgun: 'ショットガン', rifle: 'ライフル', glauncher: 'グレネードガン', phill: 'PHILLガン',
};
const masteryName = (key: GrowingMasteryKey): string =>
  GUN_NAME[key] ?? (key === 'melee' ? '近接' : subWeaponDisplayName(key as SubWeaponKey));

// ── 尺 ──────────────────────────────────────────────────────────────
/** 始まってから1行目が動き出すまで。 */
const LEAD_MS = 260;
/** 前の行が止まってから次の行が動き出すまで。 */
const ROW_GAP_MS = 180;
/** 段階が上がらない行(1区間)の尺: 約0.5秒。 */
const plainDur = (span: number): number => 420 + 160 * span;
/** 段階が上がる行の区間の尺(またぐ区間 / 最後の区間)。 */
const climbDur = (span: number): number => 260 + 640 * span;
const finalDur = (span: number): number => 320 + 520 * span;
/** 段階が上がった後、満ちたまま止まる間。連続する時は詰め(300→240→240…)、その行の最後の1回だけ重く(460)。 */
const holdMs = (nth: number, total: number): number => (nth === total - 1 ? 460 : nth === 0 ? 300 : 240);
/** 止めの最後のこの間に、明るい塗りの不透明度を落としてから空の棒へ戻す。 */
const HOLD_FADE_MS = 120;
const LEVEL_UP_GAIN = 0.35;
const MAX_GAIN = 0.6;
const TICK_GAIN = 0.2;

const easeInOutCubic = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
/** 止まる区間: 早めに乗って、長く減速して止まる(出だしと終わりの速さは 0)。 */
const easeSettle = (x: number): number => easeInOutCubic(Math.pow(x, 0.7));

interface Seg extends MasteryFillStep { t0: number; t1: number; hold: number; settle: boolean }

interface RowView {
  key: GrowingMasteryKey;
  name: string;
  /** 開発用の数字(`?masterydbg=1` の時だけ出す)。 */
  debug: string;
  startLevel: number;
  /** 出撃前の割合(出撃前の段では、ここまでが暗い金)。 */
  startFrac: number;
  segs: Seg[];
  start: number;
  end: number;
}

const buildRows = (commit: MasteryCommitResult | null): RowView[] => {
  let t = LEAD_MS;
  return masteryResultRows(commit).map(r => {
    const steps = masteryFillSteps(r.key, r.entry);
    const ups = steps.filter(s => s.levelUp).length;
    const start = t;
    const segs: Seg[] = [];
    let nth = 0;
    steps.forEach((s, idx) => {
      const span = Math.max(0, s.to - s.from);
      const last = idx === steps.length - 1;
      const dur = ups === 0 ? plainDur(span) : last && !s.levelUp ? finalDur(span) : climbDur(span);
      const hold = s.levelUp ? holdMs(nth++, ups) : 0;
      segs.push({ ...s, t0: t, t1: t + dur, hold, settle: last && !s.levelUp });
      t += dur + hold;
    });
    const end = t;
    if (segs.length > 0) t += ROW_GAP_MS;
    return {
      key: r.key,
      name: masteryName(r.key),
      debug: masteryDebugLine(r.key, r.entry),
      startLevel: steps.length > 0 ? steps[0].level : r.entry.levelBefore,
      startFrac: steps.length > 0 ? steps[0].from : 1,
      segs,
      start,
      end,
    };
  });
};

/** 時刻 t の棒(どの段の棒か・どこまで満ちたか・明るい塗りの不透明度)。 */
const barAt = (r: RowView, t: number): { level: number; frac: number; opacity: number } => {
  let level = r.startLevel;
  let frac = r.startFrac;
  let opacity = 1;
  for (const s of r.segs) {
    if (t < s.t0) break;
    level = s.level;
    if (t < s.t1) {
      const x = (t - s.t0) / Math.max(1, s.t1 - s.t0);
      frac = s.from + (s.to - s.from) * (s.settle ? easeSettle(x) : easeInOutCubic(x));
      break;
    }
    frac = s.to;
    if (s.levelUp) {
      if (s.level + 1 >= MASTERY_MAX_LEVEL) { level = MASTERY_MAX_LEVEL; frac = 1; continue; } // MAX は金で満ちたまま
      const held = t - s.t1;
      if (held < s.hold) opacity = held > s.hold - HOLD_FADE_MS ? Math.max(0, (s.hold - held) / HOLD_FADE_MS) : 1;
      else { level = s.level + 1; frac = 0; }
    }
  }
  return { level, frac, opacity };
};

const labelStyle = (el: HTMLElement, level: number, risen: boolean): void => {
  el.textContent = masteryLevelLabel(level);
  const max = level >= MASTERY_MAX_LEVEL;
  el.style.color = max || risen ? MASTERY_GOLD : '';
  el.style.fontWeight = max || risen ? '600' : '';
  el.style.letterSpacing = max ? '0.24em' : '';
};
const makeLabel = (level: number, risen: boolean): HTMLSpanElement => {
  const el = document.createElement('span');
  el.style.position = 'absolute';
  el.style.right = '0';
  el.style.top = '0';
  labelStyle(el, level, risen);
  return el;
};

interface RowEls {
  row: HTMLDivElement | null;
  sweep: HTMLDivElement | null;
  track: HTMLDivElement | null;
  base: HTMLDivElement | null;
  gain: HTMLDivElement | null;
  flash: HTMLDivElement | null;
  tag: HTMLSpanElement | null;
}

/** `?masterydbg=1` の時だけ区画の下に出す、出撃の時間(ゲーム内の秒)とステージ。 */
export interface MasteryDebugRun { seconds: number; stage: string }

const MasteryResult: React.FC<{ commit: MasteryCommitResult | null; debugRun?: MasteryDebugRun }> = ({ commit, debugRun }) => {
  const rows = useMemo(() => buildRows(commit), [commit]);
  const dbg = MASTERY_DEBUG_ACTIVE;
  const boxRef = useRef<HTMLDivElement | null>(null);
  const els = useRef<RowEls[]>([]);

  useEffect(() => {
    if (rows.length === 0) return;
    const ups = rows.map(() => 0);
    const ticked = rows.map(() => false);

    const paint = (i: number, t: number) => {
      const r = rows[i];
      const e = els.current[i];
      if (!e?.base || !e.gain) return;
      const { level, frac, opacity } = barAt(r, t);
      const f = Math.max(0, Math.min(1, frac));
      // 出撃前の段だけ暗い金(出撃前の位置まで)。上がった後の段・MAX は0から全部明るい。
      const base = level === r.startLevel && level < MASTERY_MAX_LEVEL ? Math.min(f, r.startFrac) : 0;
      e.base.style.width = `${base * 100}%`;
      e.gain.style.left = `${base * 100}%`;
      e.gain.style.width = `${Math.max(0, f - base) * 100}%`;
      e.gain.style.opacity = String(opacity);
    };

    // 出だしの状態へ(StrictMode の2回目でも同じ所から)
    rows.forEach((r, i) => {
      paint(i, -1);
      const tag = els.current[i]?.tag;
      if (tag) tag.replaceChildren(makeLabel(r.startLevel, false));
    });

    const levelUp = (i: number, level: number) => {
      const e = els.current[i];
      const max = level >= MASTERY_MAX_LEVEL;
      // ① 行の背景を明るい帯が左から右へ1度なめる(金の20%→0・減速)
      e?.sweep?.animate?.(
        [{ transform: 'translateX(-100%)', opacity: 0.2 }, { transform: 'translateX(100%)', opacity: 0 }],
        { duration: 350, easing: 'cubic-bezier(.12,.7,.3,1)' },
      );
      // ② 棒が白く飽和してから戻る
      e?.flash?.animate?.([{ opacity: 0.95 }, { opacity: 0 }], { duration: max ? 420 : 280, easing: 'cubic-bezier(.2,.6,.3,1)' });
      // 棒の太さが約1.5倍に膨らんで戻る(加速→減速)
      e?.track?.animate?.(
        [{ transform: 'scaleY(1)' }, { transform: 'scaleY(1.5)', offset: 0.4 }, { transform: 'scaleY(1)' }],
        { duration: 200, easing: 'ease-in-out' },
      );
      // ③ 札: 前の数字は上へ押し出され、新しい数字が下から入る(縦に約8px・慣性つき)
      const tag = e?.tag;
      if (tag) {
        const olds = Array.from(tag.children) as HTMLElement[];
        olds.forEach(old => {
          const a = old.animate?.(
            [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-8px)', opacity: 0 }],
            { duration: 220, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' },
          );
          if (a) a.onfinish = () => old.remove(); else old.remove();
        });
        const next = makeLabel(level, true);
        tag.appendChild(next);
        next.animate?.(
          [{ transform: 'translateY(8px)', opacity: 0 }, { transform: 'translateY(-1px)', opacity: 1, offset: 0.7 }, { transform: 'translateY(0)', opacity: 1 }],
          { duration: max ? 420 : 300, easing: 'cubic-bezier(.2,.7,.3,1)' },
        );
      }
      playSfx('level-up', max ? MAX_GAIN : LEVEL_UP_GAIN);
    };

    const step = (t: number) => {
      rows.forEach((r, i) => {
        if (r.segs.length === 0) return;
        if (!ticked[i] && t >= r.start) { ticked[i] = true; playSfx('ui-move', TICK_GAIN); } // 伸び始めに1回だけ
        // 段階が上がる瞬間(満ちた所)を順に拾う。1フレームに2つ越えても1つずつ。
        const crossed = r.segs.filter(s => s.levelUp && t >= s.t1);
        while (ups[i] < crossed.length) {
          levelUp(i, crossed[ups[i]].level + 1);
          ups[i]++;
        }
        paint(i, t);
      });
    };

    const allEnd = Math.max(...rows.map(r => r.end));
    let elapsed = 0;
    let last = 0;
    let raf = 0;
    let running = false;
    let done = false;
    const frame = (now: number) => {
      elapsed += Math.max(0, now - last);
      last = now;
      step(elapsed);
      if (elapsed < allEnd + 50) raf = requestAnimationFrame(frame);
      else { running = false; done = true; }
    };
    const resume = () => {
      if (running || done) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const pause = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
    };

    const box = boxRef.current;
    let io: IntersectionObserver | null = null;
    if (box && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(entries => {
        const visible = entries.some(en => en.isIntersecting);
        if (visible) resume(); else pause();
      }, { threshold: 0.2 });
      io.observe(box);
    } else {
      resume();
    }
    return () => { pause(); io?.disconnect(); };
  }, [rows]);

  if (rows.length === 0 && !dbg) return null;
  // 開発用: 何も出ない理由(無視する出撃=練習など / ベンチで確定していない / 伸びた物が無い)
  const dbgEmpty = rows.length > 0 ? null
    : (commit === null || isMasteryRunIgnored()) ? 'この出撃では貯まらない(練習など)' : '貯まった量なし';
  return (
    <div ref={boxRef} className="mb-3 rounded-none bg-black/25 px-3 py-2.5">
      <div className="mb-1.5 text-[10px] uppercase tracking-widest text-white/45">MASTERY</div>
      <div className="space-y-1">
        {rows.map((r, i) => {
          const bind = <K extends keyof RowEls>(k: K) => (el: RowEls[K]) => {
            (els.current[i] ??= { row: null, sweep: null, track: null, base: null, gain: null, flash: null, tag: null })[k] = el;
          };
          return (
            <div key={r.key} ref={bind('row')} className="relative overflow-hidden py-1">
              <div
                ref={bind('sweep')}
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-0"
                style={{ background: `linear-gradient(90deg, transparent, ${MASTERY_GOLD} 45%, ${MASTERY_GOLD} 55%, transparent)` }}
              />
              <div className="relative flex items-end justify-between gap-3">
                <span className="min-w-0 truncate text-[13px] text-white/80">{r.name}</span>
                {/* 札は rAF 側が中身を入れ替える(数字が上へ押し出される)。React はこの中を描かない。 */}
                <span ref={bind('tag')} className="relative inline-block h-[19px] w-[3.6em] shrink-0 overflow-hidden text-right text-[15px] leading-[19px] tabular-nums text-white/70" />
              </div>
              {dbg && <div className="break-words font-mono text-[10px] leading-tight text-white/50">{r.debug}</div>}
              <div ref={bind('track')} className="relative mt-1 h-[5px] w-full bg-white/15">
                <div ref={bind('base')} className="absolute inset-y-0 left-0" style={{ background: MASTERY_GOLD, opacity: 0.35, width: 0 }} />
                <div ref={bind('gain')} className="absolute inset-y-0" style={{ background: MASTERY_GOLD, left: 0, width: 0 }} />
                <div ref={bind('flash')} aria-hidden className="pointer-events-none absolute inset-0 bg-white opacity-0" />
              </div>
            </div>
          );
        })}
      </div>
      {dbg && (
        <div className="mt-1.5 break-words font-mono text-[10px] leading-tight text-white/50">
          {dbgEmpty && <div>{dbgEmpty}</div>}
          {debugRun && <div>{masteryDebugRunLine(debugRun.seconds, debugRun.stage)}</div>}
        </div>
      )}
    </div>
  );
};

export default MasteryResult;
