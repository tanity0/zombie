import React, { useCallback, useEffect, useRef, useState } from 'react';
import { playSfx } from '../audio/audioManager';
import { useGameStore } from '../store/gameStore';

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

  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [delta, setDelta] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const setSwipeDirection = useGameStore(state => state.setSwipeDirection);
  const setLastDirection = useGameStore(state => state.setLastDirection);
  const triggerCounter = useGameStore(state => state.triggerCounter);

  const release = useCallback(() => {
    // The core gameplay hook: lifting the finger fires the counter window.
    // The store enforces the cooldown so spam-tapping doesn't help.
    if (pointerIdRef.current !== null) {
      const counter = triggerCounter();
      if (counter.swung) playSfx('melee');
      if (counter.finish) playSfx('melee-finish');
      else if (counter.hit) playSfx('slash-damage');
    }
    pointerIdRef.current = null;
    originRef.current = null;
    setOrigin(null);
    setDelta({ x: 0, y: 0 });
    setSwipeDirection(null);
  }, [setSwipeDirection, triggerCounter]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== null) return;
    pointerIdRef.current = e.pointerId;
    const o = { x: e.clientX, y: e.clientY };
    originRef.current = o;
    setOrigin(o);
    setDelta({ x: 0, y: 0 });
    zoneRef.current?.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current !== e.pointerId) return;
      const o = originRef.current;
      if (!o) return;

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

  // Safety: clear movement state if the component unmounts mid-touch
  useEffect(() => {
    return () => {
      setSwipeDirection(null);
    };
  }, [setSwipeDirection]);

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
