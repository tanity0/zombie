// 「連れて歩く」の切り替え(research/ESCORT_FOLLOW.md §9・社長指示2026-10-13)。
// 解放済みの拠点の円の中に居る間だけ、画面の下中央に「拠点でできること」の札が立つ(設定のボタン列には並べない=監査CR-1)。
// 札の言葉は押した結果(連れていく/待たせる)・下に今の状態。返事は store の toggleEscortFollow が軍人に言わせる。
// ★購読は真偽値だけ(円の中か/オンか)=値が変わった時しか描き直さない(CLAUDE.md の React 再描画の掟)。
import React, { useEffect, useState } from 'react';
import { useGameStore, BASE_CAPTURE_RADIUS } from '../store/gameStore';
import { followToggleBaseAt } from '../utils/escortFollowToggle';
import { HudKey } from './HudKey';
import { useHudHintStyle, hudGlyph } from '../utils/hudHints';

const IN_MS = 320;
const OUT_MS = 220;

export const FollowToggle: React.FC<{ landscape: boolean }> = ({ landscape }) => {
  const inBase = useGameStore(s => {
    if (s.corridorMode || s.gameWon || s.player.health <= 0) return false;
    const p = s.player;
    return followToggleBaseAt(p.x + p.width / 2, p.y + p.height / 2, s.baseSites, BASE_CAPTURE_RADIUS) !== null;
  });
  const on = useGameStore(s => s.escortFollowEnabled);
  const hint = useHudHintStyle(landscape);
  // 立つ/沈むは慣性つき(下から立ち上がって止まる/沈みながら消える)。沈む間も描くため mounted を一拍残す。
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
  if (!mounted) return null;

  const press = (e: React.PointerEvent<HTMLButtonElement>) => {
    // 画面全体がスティックなので、押した指を移動・反撃にしない(一時停止と同じ作法)。
    e.preventDefault();
    e.stopPropagation();
    useGameStore.getState().toggleEscortFollow();
  };

  return (
    <div
      className="pointer-events-none absolute left-1/2"
      style={{
        bottom: landscape ? 112 : 'calc(max(env(safe-area-inset-bottom), 24px) + 118px)',
        translate: '-50% 0',
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : 'translateY(14px)',
        transition: shown
          ? `opacity ${IN_MS - 80}ms ease-out, transform ${IN_MS}ms cubic-bezier(0.16,1,0.3,1)`
          : `opacity ${OUT_MS}ms ease-in, transform ${OUT_MS}ms cubic-bezier(0.5,0,0.75,0)`,
      }}
    >
      <button
        type="button"
        onPointerDown={press}
        aria-pressed={on}
        aria-label={on ? '軍人を拠点で待たせる' : '軍人を連れていく'}
        className="pointer-events-auto relative flex items-stretch text-left"
        style={{
          background: 'linear-gradient(90deg, rgba(8,10,12,0.82), rgba(8,10,12,0.55))',
          boxShadow: '0 2px 10px rgba(0,0,0,0.55)',
        }}
      >
        {/* 左の細い帯=今の状態の色(同行=琥珀/待機=鈍い灰) */}
        <span aria-hidden style={{ width: 3, background: on ? '#e0a33a' : '#5b6063', transition: 'background 180ms ease-out' }} />
        <span className="flex flex-col py-[7px] pl-[11px] pr-[14px]" style={{ minWidth: 132 }}>
          <span className="flex items-center gap-[7px] text-[13px] font-semibold text-white" style={{ letterSpacing: '0.12em' }}>
            {hint && <HudKey key={hint} hint={hint} act="follow" glyph={hudGlyph(hint, 'follow', false)} className="hud-key--static" />}
            {on ? '待たせる' : '連れていく'}
          </span>
          <span className="mt-[3px] text-[10px]" style={{ color: on ? 'rgba(224,163,58,0.85)' : 'rgba(255,255,255,0.42)', letterSpacing: '0.1em' }}>
            {on ? '軍人が同行中' : '軍人は拠点で待機中'}
          </span>
        </span>
      </button>
    </div>
  );
};

export default FollowToggle;
