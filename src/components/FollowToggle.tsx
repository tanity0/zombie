// 「連れて歩く」の切り替え(research/ESCORT_FOLLOW.md §9・社長指示2026-10-13)。
// 解放済みの拠点の円の中に居る間だけ、画面の下中央に「拠点でできること」の札が立つ(設定のボタン列には並べない=監査CR-1)。
// 札の言葉は押した結果(連れていく/待たせる)・下に今の状態(その拠点の軍人の名で)。返事は store の toggleEscortFollow が言わせる。
// ★押し続けて左の帯が満ちた時だけ切り替わる(途中で離せば戻る)。下中央は全画面スティックの親指が落ちる所なので、
//   触れただけでは変わらない(納品監査A-2・CR-1)。キー(E)・パッド(X)は押した瞬間に切り替わる(誤って触れる場所ではない)。
// ★購読は真偽値と名前だけ=値が変わった時しか描き直さない(CLAUDE.md の React 再描画の掟)。帯の伸びは rAF で DOM を直接動かす。
import React, { useEffect, useRef, useState } from 'react';
import { useGameStore, BASE_CAPTURE_RADIUS, baseSoldierName } from '../store/gameStore';
import { followToggleBaseAt } from '../utils/escortFollowToggle';
import { HudKey } from './HudKey';
import { useHudHintStyle, hudGlyph } from '../utils/hudHints';

const IN_MS = 340;
const OUT_MS = 220;
/** 押し続けて切り替わるまで(ms)。 */
export const FOLLOW_HOLD_MS = 450;

export const FollowToggle: React.FC<{ landscape: boolean }> = ({ landscape }) => {
  const baseId = useGameStore(s => {
    if (s.corridorMode || s.gameWon || s.player.health <= 0) return null;
    const p = s.player;
    return followToggleBaseAt(p.x + p.width / 2, p.y + p.height / 2, s.baseSites, BASE_CAPTURE_RADIUS);
  });
  // その拠点の軍人の名(倒れていても名は出す=「誰を」の札)。居なければ null。
  const name = useGameStore(s => {
    if (!baseId) return null;
    const e = s.escorts.find(x => x.baseId === baseId);
    return e ? baseSoldierName(e.soldierIndex) : null;
  });
  const on = useGameStore(s => s.escortFollowEnabled);
  const hint = useHudHintStyle(landscape);
  const inBase = baseId !== null;
  // 立つ/沈むは慣性つき。立つ時は帯が先に点き、札が少し行き過ぎてから止まる/沈む時は帯が先に消える(均質を崩す・CR-3)。
  const [mounted, setMounted] = useState(inBase);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (inBase) {
      setMounted(true);
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    const t = window.setTimeout(() => setMounted(false), OUT_MS);
    return () => window.clearTimeout(t);
  }, [inBase]);

  // 押し続け: 帯(fill)を下から満たす。満ちたら切り替え。離す/指が外れたら戻る。
  const fillRef = useRef<HTMLSpanElement>(null);
  const holdRef = useRef<{ start: number; raf: number; done: boolean } | null>(null);
  const setFill = (k: number) => { if (fillRef.current) fillRef.current.style.transform = `scaleY(${k})`; };
  const stopHold = () => {
    const h = holdRef.current;
    if (h) cancelAnimationFrame(h.raf);
    holdRef.current = null;
    if (fillRef.current) {
      fillRef.current.style.transition = 'transform 160ms cubic-bezier(0.4,0,0.2,1)';
      setFill(0);
    }
  };
  useEffect(() => () => { if (holdRef.current) cancelAnimationFrame(holdRef.current.raf); }, []);
  if (!mounted) return null;

  const press = (e: React.PointerEvent<HTMLButtonElement>) => {
    // 画面全体がスティックなので、押した指を移動・反撃にしない(一時停止と同じ作法)。
    e.preventDefault();
    e.stopPropagation();
    if (holdRef.current) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 取れない環境は素通し */ }
    if (fillRef.current) fillRef.current.style.transition = 'none';
    const h = { start: performance.now(), raf: 0, done: false };
    holdRef.current = h;
    const step = () => {
      const k = Math.min(1, (performance.now() - h.start) / FOLLOW_HOLD_MS);
      setFill(1 - Math.pow(1 - k, 2)); // 満ち始めは速く、満ちる直前に少し溜める
      if (k >= 1) {
        h.done = true;
        useGameStore.getState().toggleEscortFollow();
        stopHold();
        return;
      }
      h.raf = requestAnimationFrame(step);
    };
    h.raf = requestAnimationFrame(step);
  };
  const release = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    stopHold();
  };

  const who = name ?? '軍人';
  return (
    <div
      className="pointer-events-none absolute left-1/2"
      style={{
        bottom: landscape ? 112 : 'calc(max(env(safe-area-inset-bottom), 24px) + 118px)',
        translate: '-50% 0',
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : 'translateY(14px)',
        transition: shown
          ? `opacity ${IN_MS - 120}ms ease-out 40ms, transform ${IN_MS}ms cubic-bezier(0.34,1.4,0.64,1) 40ms`
          : `opacity ${OUT_MS}ms ease-in 60ms, transform ${OUT_MS}ms cubic-bezier(0.5,0,0.75,0) 60ms`,
      }}
    >
      <button
        type="button"
        onPointerDown={press}
        onPointerUp={release}
        onPointerCancel={release}
        onContextMenu={e => e.preventDefault()}
        aria-label={on ? `${who}を拠点で待たせる(長押し)` : `${who}を連れていく(長押し)`}
        className="pointer-events-auto relative flex select-none items-stretch text-left"
        style={{
          background: 'linear-gradient(90deg, rgba(8,10,12,0.84), rgba(8,10,12,0.5))',
          boxShadow: '0 2px 10px rgba(0,0,0,0.55)',
          WebkitTouchCallout: 'none',
          touchAction: 'none',
        }}
      >
        {/* 左の細い帯=今の状態の色(同行=琥珀/待機=鈍い灰)。押し続けると白が下から満ちる。立つ時は札より一拍先に点く。 */}
        <span
          aria-hidden
          className="relative overflow-hidden"
          style={{
            width: 3,
            background: on ? '#e0a33a' : '#5b6063',
            opacity: shown ? 1 : 0,
            transition: shown ? 'background 180ms ease-out, opacity 90ms ease-out' : 'background 180ms ease-out, opacity 80ms ease-in',
          }}
        >
          <span ref={fillRef} className="absolute inset-0" style={{ background: '#f4efe4', transformOrigin: '50% 100%', transform: 'scaleY(0)' }} />
        </span>
        <span className="flex flex-col py-[7px] pl-[11px] pr-[14px]" style={{ minWidth: 132 }}>
          <span className="flex items-center gap-[7px] text-[13px] font-semibold text-white" style={{ letterSpacing: '0.12em' }}>
            {hint && <HudKey key={hint} hint={hint} act="follow" glyph={hudGlyph(hint, 'follow', false)} className="hud-key--static" />}
            {on ? '待たせる' : '連れていく'}
          </span>
          <span className="mt-[3px] text-[10px]" style={{ color: on ? 'rgba(224,163,58,0.85)' : 'rgba(255,255,255,0.42)', letterSpacing: '0.1em' }}>
            {on ? `${who}が同行中` : `${who}は拠点に残る`}
          </span>
        </span>
      </button>
    </div>
  );
};

export default FollowToggle;
