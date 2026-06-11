import React, { useCallback, useEffect, useRef, useState } from 'react';
import { playSfx, playEnemyDeath } from '../audio/audioManager';
import {
  useGameStore,
  KATANA_FLICK_WINDOW_MS,
  KATANA_FLICK_MIN_DIST,
  KATANA_FLICK_MIN_SPEED
} from '../store/gameStore';

// Floating thumb-stick. The user can place a finger anywhere inside the
// activation zone (the left half of the screen, below the HUD), and the
// stick base appears under their finger. Dragging produces a normalized
// 2D direction that is fed into the game store as a swipe direction.
const STICK_RADIUS = 56; // px — visible base radius
const NUB_RADIUS = 28;
const DEAD_ZONE = 0.18; // ignore tiny movements

const VirtualJoystick: React.FC = () => {
  const zoneRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  // 刀フリック判定用の直近ポインタ軌跡(古いサンプルは捨てる)。
  const flickSamplesRef = useRef<{ x: number; y: number; t: number }[]>([]);

  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [delta, setDelta] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const setSwipeDirection = useGameStore(state => state.setSwipeDirection);
  const setTouchActive = useGameStore(state => state.setTouchActive);
  const setLastDirection = useGameStore(state => state.setLastDirection);
  const triggerCounter = useGameStore(state => state.triggerCounter);
  const triggerKatanaDash = useGameStore(state => state.triggerKatanaDash);

  // 指離し直前の短い窓だけを見るフリック判定。通常のジョイスティック
  // ドラッグは低速・小移動なのでしきい値に届かず、一閃は暴発しない。
  const detectFlick = useCallback((): { x: number; y: number } | null => {
    const samples = flickSamplesRef.current;
    if (samples.length < 2) return null;
    const last = samples[samples.length - 1];
    let first = samples[0];
    for (const s of samples) {
      if (s.t >= last.t - KATANA_FLICK_WINDOW_MS) { first = s; break; }
    }
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const dist = Math.hypot(dx, dy);
    const dt = Math.max(1, last.t - first.t);
    if (dist < KATANA_FLICK_MIN_DIST || dist / dt < KATANA_FLICK_MIN_SPEED) return null;
    return { x: dx / dist, y: dy / dist };
  }, []);

  const release = useCallback((fireCounter = true) => {
    // The core gameplay hook: lifting the finger fires the counter window.
    // The store enforces the cooldown so spam-tapping doesn't help.
    const pointerId = pointerIdRef.current;
    if (pointerId !== null && fireCounter) {
      // カウンター優先: 既存のカウンター処理を先に通す(刀装備中はナイフ
      // スイープなしで窓だけ開く)。その後、フリック成立時のみ一閃ダッシュ。
      const counter = triggerCounter();
      if (counter.swung) playSfx('melee');
      if (counter.finish) playSfx('melee-finish');
      else if (counter.hit) playSfx('slash-damage');
      if (counter.killed > 0) playEnemyDeath(); // slain enemies grunt
      const flick = detectFlick();
      if (flick && triggerKatanaDash(flick.x, flick.y)) {
        playSfx('melee');
      }
    }
    flickSamplesRef.current = [];
    if (pointerId !== null && zoneRef.current?.hasPointerCapture(pointerId)) {
      zoneRef.current.releasePointerCapture(pointerId);
    }
    pointerIdRef.current = null;
    originRef.current = null;
    setOrigin(null);
    setDelta({ x: 0, y: 0 });
    setTouchActive(false);
    setSwipeDirection(null);
  }, [setSwipeDirection, setTouchActive, triggerCounter, triggerKatanaDash, detectFlick]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== null) release(false);
    pointerIdRef.current = e.pointerId;
    setTouchActive(true);
    const o = { x: e.clientX, y: e.clientY };
    originRef.current = o;
    flickSamplesRef.current = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    setOrigin(o);
    setDelta({ x: 0, y: 0 });
    zoneRef.current?.setPointerCapture(e.pointerId);
  }, [release, setTouchActive]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current !== e.pointerId) return;
      const o = originRef.current;
      if (!o) return;

      // フリック判定用に直近の軌跡だけ残す。
      const tNow = performance.now();
      const samples = flickSamplesRef.current;
      samples.push({ x: e.clientX, y: e.clientY, t: tNow });
      while (samples.length > 0 && samples[0].t < tNow - KATANA_FLICK_WINDOW_MS * 2) {
        samples.shift();
      }

      const rawX = e.clientX - o.x;
      const rawY = e.clientY - o.y;
      const dist = Math.hypot(rawX, rawY);
      const max = STICK_RADIUS;
      const clamped = Math.min(dist, max);
      const nx = dist > 0 ? rawX / dist : 0;
      const ny = dist > 0 ? rawY / dist : 0;

      setDelta({ x: nx * clamped, y: ny * clamped });

      const norm = clamped / max;
      if (norm < DEAD_ZONE) {
        setSwipeDirection(null);
        return;
      }

      const dir = { x: nx, y: ny };
      setSwipeDirection(dir);
      setLastDirection(dir);
    },
    [setSwipeDirection, setLastDirection]
  );

  const handlePointerEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current !== e.pointerId) return;
      release();
    },
    [release]
  );

  useEffect(() => {
    const handleGlobalPointerEnd = (e: PointerEvent) => {
      if (pointerIdRef.current !== e.pointerId) return;
      release(e.type === 'pointerup');
    };
    const clearWithoutCounter = () => release(false);
    window.addEventListener('pointerup', handleGlobalPointerEnd);
    window.addEventListener('pointercancel', handleGlobalPointerEnd);
    window.addEventListener('blur', clearWithoutCounter);
    window.addEventListener('pagehide', clearWithoutCounter);
    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerEnd);
      window.removeEventListener('pointercancel', handleGlobalPointerEnd);
      window.removeEventListener('blur', clearWithoutCounter);
      window.removeEventListener('pagehide', clearWithoutCounter);
    };
  }, [release]);

  // Safety: clear movement state if the component unmounts mid-touch
  useEffect(() => {
    return () => {
      setTouchActive(false);
      setSwipeDirection(null);
    };
  }, [setSwipeDirection, setTouchActive]);

  return (
    <div
      ref={zoneRef}
      className="absolute inset-0 z-20"
      style={{ touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={handlePointerEnd}
      onLostPointerCapture={() => release(false)}
    >
      {origin && (
        <>
          <div
            className="pointer-events-none absolute rounded-full"
            style={{
              left: origin.x - STICK_RADIUS,
              top: origin.y - STICK_RADIUS,
              width: STICK_RADIUS * 2,
              height: STICK_RADIUS * 2,
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)'
            }}
          />
          <div
            className="pointer-events-none absolute rounded-full"
            style={{
              left: origin.x + delta.x - NUB_RADIUS,
              top: origin.y + delta.y - NUB_RADIUS,
              width: NUB_RADIUS * 2,
              height: NUB_RADIUS * 2,
              background:
                'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.85), rgba(255,255,255,0.35) 60%, rgba(255,255,255,0.15))',
              boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)'
            }}
          />
        </>
      )}
    </div>
  );
};

export default VirtualJoystick;
