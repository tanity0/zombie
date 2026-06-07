import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { formatTime } from '../utils/renderUtils';
import { getWeaponShortName } from '../utils/weaponUtils';
import { FINALE_BOSS_TIME_MS } from '../utils/stageDirector';
import type { AmmoType } from '../types/game';
import { isAudioMuted, setAudioMuted } from '../audio/audioManager';

const BOSS_WARN_LEAD = 12 * 1000;
const PERF_CAPTURE_COOLDOWN_MS = 15_000;
const PERF_THRESHOLDS = {
  fps: 45,
  effects: 180,
  projectiles: 45,
  pickups: 130,
  enemies: 12,
};

interface GameHUDProps {
  fps: number;
}

const GameHUD: React.FC<GameHUDProps> = ({ fps }) => {
  const [audioMuted, setAudioMutedState] = useState(isAudioMuted);
  const player = useGameStore(state => state.player);
  const setActiveWeapon = useGameStore(state => state.setActiveWeapon);
  const lastWeaponGet = useGameStore(state => state.lastWeaponGet);
  const gameTime = useGameStore(state => state.gameTime);
  const gameStats = useGameStore(state => state.gameStats);
  const enemies = useGameStore(state => state.enemies);
  const effectsCount = useGameStore(state => state.effects.length);
  const projectilesCount = useGameStore(state => state.projectiles.length);
  const pickupsCount = useGameStore(state => state.pickups.length);
  const lastPerfCaptureAt = useRef(0);

  const formattedTime = formatTime(gameTime / 1000);
  const expPercentage = (player.experience / player.experienceToNextLevel) * 100;
  const healthPercentage = (player.health / player.maxHealth) * 100;

  const bossActive = enemies.some(e => e.type === 'giantbat');
  const bossImminent =
    !bossActive &&
    gameTime >= FINALE_BOSS_TIME_MS - BOSS_WARN_LEAD &&
    gameTime < FINALE_BOSS_TIME_MS;

  const weaponGetVisible = lastWeaponGet !== null && Date.now() - lastWeaponGet.at < 5000;
  const perfIssues = useMemo(() => {
    const issues: string[] = [];
    if (fps > 0 && fps < PERF_THRESHOLDS.fps) issues.push(`fps<${PERF_THRESHOLDS.fps}`);
    if (effectsCount > PERF_THRESHOLDS.effects) issues.push(`fx>${PERF_THRESHOLDS.effects}`);
    if (projectilesCount > PERF_THRESHOLDS.projectiles) issues.push(`p>${PERF_THRESHOLDS.projectiles}`);
    if (pickupsCount > PERF_THRESHOLDS.pickups) issues.push(`item>${PERF_THRESHOLDS.pickups}`);
    if (enemies.length > PERF_THRESHOLDS.enemies) issues.push(`enemy>${PERF_THRESHOLDS.enemies}`);
    return issues;
  }, [fps, effectsCount, projectilesCount, pickupsCount, enemies.length]);
  const perfWarning = perfIssues.length > 0;

  useEffect(() => {
    if (!perfWarning) return;
    const now = Date.now();
    if (now - lastPerfCaptureAt.current < PERF_CAPTURE_COOLDOWN_MS) return;
    lastPerfCaptureAt.current = now;

    const canvas = document.querySelector<HTMLCanvasElement>('canvas');
    if (!canvas || !canvas.toBlob) return;

    const reason = perfIssues.join('_').replace(/[^a-zA-Z0-9_-]/g, '');
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `zombie-perf-${new Date(now).toISOString().replace(/[:.]/g, '-')}-${reason}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }, [perfWarning, perfIssues]);

  const toggleBgm = (e?: React.PointerEvent<HTMLButtonElement>) => {
    e?.preventDefault();
    e?.stopPropagation();
    const next = !audioMuted;
    setAudioMutedState(next);
    setAudioMuted(next);
  };

  return (
    <div className="absolute inset-0 z-40 pointer-events-none text-white">
      {/* New-weapon popup — shows for 5s after picking up a gun / opening a crate */}
      {weaponGetVisible && (
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{ top: 'calc(max(env(safe-area-inset-top), 8px) + 118px)' }}
        >
          <div className="glass-panel rounded-2xl px-4 py-2 flex items-center gap-2 ring-2 ring-sky-400/70 shadow-lg animate-pulse">
            <span className="text-xl">🔫</span>
            <div className="leading-tight">
              <div className="text-[10px] text-sky-200/80 font-bold tracking-wide">新しい銃器を入手！</div>
              <div className="text-sm font-bold text-white">{lastWeaponGet!.name}</div>
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div
        className="absolute left-0 right-0 flex items-center justify-between gap-2 px-3"
        style={{
          top: 'max(env(safe-area-inset-top), 8px)',
          paddingLeft: 'max(env(safe-area-inset-left), 12px)',
          paddingRight: 'max(env(safe-area-inset-right), 12px)'
        }}
      >
        <div className="glass-pill px-3 py-1 text-[13px] font-semibold tracking-tight">
          Lv {player.level}
        </div>
        <div className="glass-pill px-3 py-1 text-[13px] font-semibold tabular-nums">
          {formattedTime}
        </div>
        <div className="glass-pill px-3 py-1 text-[13px] font-semibold">
          敵 {enemies.length}
        </div>
      </div>

      {/* Stage label */}
      <div
        className="absolute left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.3em] text-white/40"
        style={{ top: 'calc(max(env(safe-area-inset-top), 8px) + 30px)' }}
      >
        マッド・フォレスト
      </div>

      {/* Finale boss warning / arrival banner */}
      {(bossImminent || bossActive) && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full text-[13px] font-bold ${
            bossActive
              ? 'bg-red-700/80 text-red-100 animate-pulse'
              : 'bg-red-900/70 text-red-200 animate-pulse'
          }`}
          style={{ top: 'calc(max(env(safe-area-inset-top), 8px) + 56px)' }}
        >
          {bossActive ? '最終ボス出現！' : 'まもなく最終ボスが現れる…'}
        </div>
      )}

      {/* Health + XP card */}
      <div
        className="absolute left-0 right-0 px-3"
        style={{
          top: 'calc(max(env(safe-area-inset-top), 8px) + 40px)',
          paddingLeft: 'max(env(safe-area-inset-left), 12px)',
          paddingRight: 'max(env(safe-area-inset-right), 12px)'
        }}
      >
        <div className="glass-panel rounded-2xl px-3 py-2 mx-auto max-w-md">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-red-200/80 w-8">HP</span>
            <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-rose-500 to-red-400 transition-all duration-300"
                style={{ width: `${healthPercentage}%` }}
              />
            </div>
            <span className="text-[11px] tabular-nums text-white/80 w-12 text-right">
              {Math.floor(player.health)}/{player.maxHealth}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] uppercase tracking-widest text-emerald-200/80 w-8">EXP</span>
            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 transition-all duration-300"
                style={{ width: `${expPercentage}%` }}
              />
            </div>
            <span className="text-[11px] tabular-nums text-white/60 w-12 text-right">
              {Math.floor(expPercentage)}%
            </span>
          </div>
        </div>
      </div>

      {/* Equipped weapons + ammo. Guns are tappable to switch the active one. */}
      {(() => {
        const guns = player.weapons.filter(w => !w.isMelee);
        const melee = player.weapons.find(w => w.isMelee);
        const activeGun = guns.find(w => w.id === player.activeWeaponId) ?? guns[0];
        const ammoFieldFor = (t: AmmoType) =>
          t === 'handgun' ? player.ammoHandgun : t === 'shotgun' ? player.ammoShotgun : player.ammoRifle;
        return (
          <div
            className="absolute"
            style={{
              left: 'max(env(safe-area-inset-left), 12px)',
              bottom: 'calc(max(env(safe-area-inset-bottom), 12px) + 8px)'
            }}
          >
            <div className="glass-panel rounded-2xl px-2.5 py-2 flex items-center gap-2">
              {/* Gun slots — one per owned category; tap to switch. Shows
                  装填弾 / 母数(リザーブ) and a reload indicator. */}
              {guns.map(gun => {
                const ammoType = gun.ammoType;
                const reserve = ammoType ? ammoFieldFor(ammoType) : 0;
                const mag = gun.magazine ?? 0;
                const dry = mag <= 0 && reserve <= 0;
                const active = gun.id === activeGun?.id;
                return (
                  <button
                    key={gun.id}
                    onClick={() => setActiveWeapon(gun.id)}
                    className={`pointer-events-auto flex items-center gap-2 rounded-xl px-1.5 py-1 transition-colors ${
                      active ? 'bg-amber-500/25 ring-2 ring-amber-400/70' : 'bg-white/5 opacity-70'
                    }`}
                    title={gun.name}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center text-base ${
                        dry ? 'bg-white/5 opacity-50' : 'bg-amber-500/20'
                      }`}
                    >
                      🔫
                    </div>
                    <div className="leading-tight text-left">
                      <div className="text-[10px] text-white/60 truncate max-w-[84px]">{gun.name}</div>
                      <div
                        className={`text-[13px] font-bold tabular-nums ${
                          dry ? 'text-red-400 animate-pulse' : 'text-white'
                        }`}
                      >
                        {mag}
                        <span className="text-[10px] text-white/40">/{reserve}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
              {/* Melee slot (always available; not switchable) */}
              {melee && (
                <div className="flex items-center gap-1.5 pl-2 border-l border-white/10">
                  <div className="w-9 h-9 rounded-xl bg-slate-400/15 flex items-center justify-center text-base" title={melee.name}>
                    🔪
                  </div>
                  <div className="text-[10px] text-white/60">{getWeaponShortName(melee.type)}</div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Stats */}
      <div
        className="absolute"
        style={{
          right: 'max(env(safe-area-inset-right), 12px)',
          top: 'calc(max(env(safe-area-inset-top), 8px) + 116px)'
        }}
      >
        <div className="glass-panel rounded-2xl px-2.5 py-1.5 text-[11px] leading-tight text-white/80">
          <div>撃破 {gameStats.enemiesKilled}</div>
          <div>DMG {Math.floor(gameStats.damageDealt)}</div>
        </div>
      </div>

      {/* BGM toggle */}
      <button
        type="button"
        onPointerDown={toggleBgm}
        className="pointer-events-auto absolute w-9 h-9 rounded-full glass-pill flex items-center justify-center text-white/70 active:text-white"
        style={{
          right: 'max(env(safe-area-inset-right), 12px)',
          top: 'calc(max(env(safe-area-inset-top), 8px) + 168px)'
        }}
        title={audioMuted ? 'Audio on' : 'Audio off'}
        aria-label={audioMuted ? 'Audio on' : 'Audio off'}
      >
        {audioMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
      </button>

      {/* Test perf indicator */}
      <div
        className={`absolute glass-pill px-2 py-1 text-[10px] tabular-nums leading-tight ${
          perfWarning ? 'text-red-100 ring-1 ring-red-400/70 bg-red-500/15' : 'text-white/60'
        }`}
        style={{
          right: 'max(env(safe-area-inset-right), 12px)',
          top: 'calc(max(env(safe-area-inset-top), 8px) + 212px)'
        }}
      >
        <div>FPS {fps}</div>
        <div>fx {effectsCount} p {projectilesCount}</div>
        <div>item {pickupsCount} enemy {enemies.length}</div>
        {perfWarning && <div>WARN {perfIssues.join(',')}</div>}
      </div>
    </div>
  );
};

export default GameHUD;
