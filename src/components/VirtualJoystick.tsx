import React, { useCallback, useEffect, useRef, useState } from 'react';
import { playSfx, playEnemyDeath } from '../audio/audioManager';
import {
  useGameStore,
  isInputLocked,
  isAttackLocked, // v0.25.2589: 死亡モーション/アテンション/帰還サークル内の攻撃禁止(共通ゲート)
  KATANA_FLICK_WINDOW_MS,
  KATANA_FLICK_MIN_DIST,
  KATANA_FLICK_MIN_SPEED,
  KILLFX_TOTAL_MS, // KILL処刑演出中の通常近接SE抑止(FB5/FB7)
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
// スケボー(新仕様)ダブルタップ判定: 直前が「短く小移動のタップ」で、離しからこの時間内に再タップ=ダブルタップ=乗車。
const SKATER_DOUBLETAP_MS = 300;   // 1タップ目の離し→2タップ目の押下 までの許容間隔
const SKATER_TAP_MAX_MS = 220;     // 「タップ」とみなす最大接触時間
const SKATER_TAP_MAX_DRAG = 24;    // 「タップ」とみなす最大ドラッグ量(px)

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
  const mountSkater = useGameStore(state => state.mountSkater);
  const dismountSkater = useGameStore(state => state.dismountSkater);
  // スケボー(新仕様): ダブルタップで乗車。直前タップの離し時刻/それがタップ(短く小移動)だったか、最大ドラッグ量。
  const lastUpAtRef = useRef(0);
  const lastWasTapRef = useRef(false);
  const maxDragRef = useRef(0);

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
    // v0.25.2589(社長報告「死にモーション中に攻撃できちゃう/アテンション中も/ゴール内から一方的に攻撃」):
    // 判定を共通ゲート isAttackLocked() へ置換。旧は時間停止と一時停止しか見ていないため、
    // **死亡モーション中(health<=0)・アテンション演出中・帰還サークル内**では指離しの近接/カウンター/
    // 一閃/PHILL/ホーミングが全部通っていた(押下は isInputLocked で弾かれても、押しっぱなしからの
    // 指離しは素通りする=死ぬ瞬間に握っていると必ず暴発する)。
    const returnPromptOpened = pointerId !== null && fireCounter
      ? useGameStore.getState().requestStoryReturnPrompt()
      : false;
    if (pointerId !== null && fireCounter && !returnPromptOpened && !isAttackLocked()) {
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
        // ★実機FB5(v0.25.3611「まだKILL演出確定時に通常の近接SEが鳴ってる」)+FB7(v0.25.3614):
        // KILL処刑演出がこのスイングで発動した場合に加え、**演出の最中の追加タップ**でも通常の近接SE
        // (振り音/フィニッシュ音)を出さない——演出側が斬撃直後に専用SEを鳴らす。
        const kfxNow = useGameStore.getState().killFx;
        const killFxJustFired = !!kfxNow && Date.now() - kfxNow.startAt < KILLFX_TOTAL_MS;
        if (counter.swung && !isWhip && !killFxJustFired) playSfx('melee');
        if (counter.finish && !killFxJustFired) playSfx('melee-finish');
        else if (counter.hit && !isWhip && !killFxJustFired) playSfx('slash-damage');
        if (counter.killed > 0) playEnemyDeath(); // slain enemies grunt
      }
    }
    // スケボー(新仕様): この接触が「タップ」(短く小移動)だったかを記録し、次回押下のダブルタップ判定に使う。
    // また、乗車中に指を離したら降車(=1秒以上乗っていれば進行方向へスケボーを投げてバッシュ)。dismountSkater は
    // 未装備/非乗車なら無害。カウンター(上の triggerCounter)は従来どおり出るので、両立する。
    if (pointerId !== null && !returnPromptOpened) {
      // タップ記録(ダブルタップ判定用)は「本物の指離し」の時だけ更新する。強制/中断リリース(fireCounter=false)
      // で更新すると、多点タッチで先発ポインタが強制解放された際に偽のタップが記録されダブルタップが誤爆する。
      if (fireCounter) {
        const now = performance.now();
        lastWasTapRef.current =
          now - pointerDownTimeRef.current < SKATER_TAP_MAX_MS &&
          maxDragRef.current < SKATER_TAP_MAX_DRAG;
        lastUpAtRef.current = now;
      }
      dismountSkater();
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
  }, [setSwipeDirection, setTouchActive, triggerCounter, rhythmInput, tryFireKatanaDash, tryFireWireAnchor, dismountSkater]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // 操作不可(ヘリ登場/セリフ/一時停止/死亡)中は移動・向き・攻撃を一切受け付けない(社長指示)。
    if (isInputLocked()) return;
    if (pointerIdRef.current !== null) release(false);
    pointerIdRef.current = e.pointerId;
    setTouchActive(true);
    const nowT = performance.now();
    // スケボー: 直前が短い小移動タップで、離しから SKATER_DOUBLETAP_MS 以内の再タップ=ダブルタップ=乗車。
    // (2発目はそのままホールド=移動。skater 未装備なら store 側で無害。) release で降車(+条件で投擲)。
    if (lastWasTapRef.current && nowT - lastUpAtRef.current <= SKATER_DOUBLETAP_MS) mountSkater();
    pointerDownTimeRef.current = nowT;
    maxDragRef.current = 0;
    flickFiredRef.current = false;
    const o = { x: e.clientX, y: e.clientY };
    originRef.current = o;
    flickSamplesRef.current = [{ x: e.clientX, y: e.clientY, t: nowT }];
    setOrigin(o);
    setDelta({ x: 0, y: 0 });
    zoneRef.current?.setPointerCapture(e.pointerId);
  }, [release, setTouchActive, mountSkater]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current !== e.pointerId) return;
      // ドラッグ中に操作不可へ移行したら向き/移動の更新を止める(セリフ/ヘリ/死亡中に向きが変わらないように)。
      if (isInputLocked()) { setSwipeDirection(null); return; }
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
      if (dist > maxDragRef.current) maxDragRef.current = dist; // ダブルタップ判定用: この接触の最大ドラッグ量
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
      release(e.type === 'pointerup');
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
              // 旧: backdrop-filter: blur(14px)。指追従で毎フレ背景キャンバスを再サンプル合成する
              // のがモバイルWKWebViewで重い。背景をぼかさず自己完結の半透明グラデで擦りガラス感を再現。
              background:
                'radial-gradient(circle at 50% 45%, rgba(255,255,255,0.10), rgba(255,255,255,0.05) 60%, rgba(255,255,255,0.02))',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              boxShadow: 'inset 0 1px 6px rgba(255,255,255,0.10)'
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
