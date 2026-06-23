import React, { useCallback, useEffect, useRef, useState } from 'react';
import { playSfx, playEnemyDeath } from '../audio/audioManager';
import {
  useGameStore,
  isGameTimeStopped,
  KATANA_FLICK_WINDOW_MS,
  KATANA_FLICK_MIN_DIST,
  KATANA_FLICK_MIN_SPEED
} from '../store/gameStore';
import {
  RHYTHM_FLICK_FIRE_DIST,
  RHYTHM_FLICK_FIRE_SPEED,
  RHYTHM_FLICK_FIRE_WINDOW_MS
} from '../config/shijin';

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
  // 指が触れ始めた時刻(performance.now)。リズムのフリックは接触区間でジャスト判定するのに使う。
  const pointerDownTimeRef = useRef<number>(0);
  // フリックは「スワイプした瞬間に即発火」する(スマホ音ゲー方式)。リズムの四神技も刀の一閃ダッシュも共通。
  // 1接触で一度だけ発火。
  const flickFiredRef = useRef<boolean>(false);

  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [delta, setDelta] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const setSwipeDirection = useGameStore(state => state.setSwipeDirection);
  const setTouchActive = useGameStore(state => state.setTouchActive);
  const setLastDirection = useGameStore(state => state.setLastDirection);
  const triggerCounter = useGameStore(state => state.triggerCounter);
  const triggerKatanaDash = useGameStore(state => state.triggerKatanaDash);
  const triggerWireAnchor = useGameStore(state => state.triggerWireAnchor);
  const rhythmInput = useGameStore(state => state.rhythmInput);

  // 指離し直前の短い窓だけを見るフリック判定。通常のジョイスティック
  // ドラッグは低速・小移動なのでしきい値に届かず、一閃は暴発しない。
  const detectFlick = useCallback((): { x: number; y: number; dt: number } | null => {
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
    // dt = フリックの所要時間(振り始め→振り終わり)。リズム判定の遅延補正に使う。
    return { x: dx / dist, y: dy / dist, dt };
  }, []);

  // リズム中: スワイプが閾値を超えた「その瞬間」にフリックを即確定する(離す瞬間に依存しない)。
  // 1接触につき一度だけ。方向は発火時の直近軌跡ベクトルで固定(=取り違えにくい)。
  const tryFireRhythmFlick = useCallback(() => {
    if (flickFiredRef.current) return;
    const samples = flickSamplesRef.current;
    if (samples.length < 2) return;
    const last = samples[samples.length - 1];
    let first = samples[0];
    for (const s of samples) {
      if (s.t >= last.t - RHYTHM_FLICK_FIRE_WINDOW_MS) { first = s; break; }
    }
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const dist = Math.hypot(dx, dy);
    const dt = Math.max(1, last.t - first.t);
    if (dist < RHYTHM_FLICK_FIRE_DIST || dist / dt < RHYTHM_FLICK_FIRE_SPEED) return;
    flickFiredRef.current = true;
    // 発火の瞬間で判定(contactMs は渡さない=その時刻でジャスト判定)。攻撃実行は useGameLoop 側。
    rhythmInput('flick', { x: dx / dist, y: dy / dist });
  }, [rhythmInput]);

  // 刀の一閃ダッシュは「指を離した瞬間」にフリックか判定して発火する(即発火ではない)。
  // 1接触一度だけ。実際にダッシュした(triggerKatanaDash=true)時だけ消費する。
  const tryFireKatanaDash = useCallback(() => {
    if (flickFiredRef.current) return;
    const flick = detectFlick();
    if (!flick) return;
    if (triggerKatanaDash(flick.x, flick.y)) {
      flickFiredRef.current = true;
      playSfx('katana-dash');
    }
  }, [detectFlick, triggerKatanaDash]);

  // ワイヤーアンカー: 指を離した瞬間にフリックか判定して、フリック方向にワイヤーを刺す(即発火しない)。
  // 装備していない/CD中等なら triggerWireAnchor が false を返すので無害。
  const tryFireWireAnchor = useCallback(() => {
    if (flickFiredRef.current) return;
    const flick = detectFlick();
    if (!flick) return;
    if (triggerWireAnchor(flick.x, flick.y)) {
      flickFiredRef.current = true;
      // 打ち込み音SEは store の anchorPlantFxAt 経由(useGameLoop)で鳴るのでここでは鳴らさない。
    }
  }, [detectFlick, triggerWireAnchor]);

  const release = useCallback((fireCounter = true) => {
    // The core gameplay hook: lifting the finger fires the counter window.
    // The store enforces the cooldown so spam-tapping doesn't help.
    const pointerId = pointerIdRef.current;
    // 会話/登場演出(ゲーム内時間停止)＋一時停止(レベルアップ/ショップ/クエスト等のメニュー)中は
    // 指離しの攻撃入力を一切受け付けない(メニューを閉じた瞬間にカウンター/PHILL/一閃が暴発しないように)。
    const paused = useGameStore.getState().isPaused;
    if (pointerId !== null && fireCounter && !isGameTimeStopped() && !paused) {
      // 四神舞リズムモード中は、タップ/フリックをリズム入力へ振り分ける(カウンター/一閃は出さない)。
      // 攻撃の実行と効果音は useGameLoop 側(pending 消化)が担当する。
      if (useGameStore.getState().rhythm.active) {
        // フリックは move 中に即発火済み(スマホ音ゲー方式)。発火していなければ=タップ。
        if (!flickFiredRef.current) rhythmInput('tap');
      } else {
        // PHILL銃(研究所): 立ち止まってタップ(=移動せず指を離す)で狙いサークル方向へ1発。
        // 移動中(ドラッグ)に離した時は store 側の isMoving ガードで発砲しない。撃てたら発砲SE。
        const gs = useGameStore.getState();
        const gun = gs.player.weapons.find(w => w.id === gs.player.activeWeaponId);
        if (gun?.key === 'phill-revolver') {
          const before = gun.magazine ?? 0;
          gs.firePhillShot();
          const after = useGameStore.getState().player.weapons.find(w => w.id === gs.player.activeWeaponId)?.magazine ?? 0;
          if (after < before) playSfx('handgun-fire');
        }
        // ホーミング弾: 指を離した時にロック済み敵へ一斉発射(装備/CDチェックはstore側=未装備は無害)。
        const hadHomingLocks = useGameStore.getState().homingLocks.length > 0;
        gs.fireHoming();
        if (hadHomingLocks) playSfx('homing-fire');
        // 刀の一閃ダッシュは「指を離した瞬間」にフリックか判定して発火(即発火しない)。
        // 非刀装備なら triggerKatanaDash が false を返すので無害(=何も起きない)。
        tryFireKatanaDash();
        // ワイヤーアンカーも同様にフリックで発動(フリック方向に刺す)。未装備なら無害。
        tryFireWireAnchor();
        // カウンターは従来どおり「指を離した瞬間」に発火(刀装備中はナイフスイープなしで窓だけ開く)。
        const counter = triggerCounter();
        // 鞭装備中はナイフ用の汎用音を出さない(鞭専用SE=whip-swing/whip-hit に任せる)。
        const isWhip = useGameStore.getState().player.subWeapons.includes('whip');
        if (counter.swung && !isWhip) playSfx('melee');
        if (counter.finish) playSfx('melee-finish');
        else if (counter.hit && !isWhip) playSfx('slash-damage');
        if (counter.killed > 0) playEnemyDeath(); // slain enemies grunt
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
  }, [setSwipeDirection, setTouchActive, triggerCounter, rhythmInput, tryFireKatanaDash, tryFireWireAnchor]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== null) release(false);
    pointerIdRef.current = e.pointerId;
    setTouchActive(true);
    pointerDownTimeRef.current = performance.now();
    flickFiredRef.current = false;
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

      // リズム中(四神技)はスワイプ即発火(スマホ音ゲー方式)のまま。
      // 刀の一閃ダッシュは「指を離した瞬間」にフリックか判定する(= release 側で実行。即発火しない)。
      if (useGameStore.getState().rhythm.active) tryFireRhythmFlick();

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
        // デッドゾーン未満では強度を更新しない(直前値を保持 → 離してもアンカー/
        // レティクル/歩行強度が固定される)。方向のみ null にして停止。
        setSwipeDirection(null);
        return;
      }

      // デッドゾーンを0、外周を1に正規化した傾き強度。
      const strength = Math.max(0, Math.min(1, (norm - DEAD_ZONE) / (1 - DEAD_ZONE)));
      const dir = { x: nx, y: ny };
      setSwipeDirection(dir, strength);
      setLastDirection(dir);
    },
    [setSwipeDirection, setLastDirection, tryFireRhythmFlick]
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
