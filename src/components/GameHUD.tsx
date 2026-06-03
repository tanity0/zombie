import React from 'react';
import { useGameStore, AMMO_MAX } from '../store/gameStore';
import { formatTime } from '../utils/renderUtils';
import { getWeaponShortName } from '../utils/weaponUtils';
import type { AmmoType } from '../types/game';

const REAPER_TIME_MS = 30 * 60 * 1000;
const REAPER_WARN_LEAD = 30 * 1000;

interface GameHUDProps {
  fps: number;
}

const GameHUD: React.FC<GameHUDProps> = ({ fps }) => {
  const player = useGameStore(state => state.player);
  const gameTime = useGameStore(state => state.gameTime);
  const gameStats = useGameStore(state => state.gameStats);
  const enemies = useGameStore(state => state.enemies);

  const formattedTime = formatTime(gameTime / 1000);
  const expPercentage = (player.experience / player.experienceToNextLevel) * 100;
  const healthPercentage = (player.health / player.maxHealth) * 100;

  const reaperImminent = gameTime >= REAPER_TIME_MS - REAPER_WARN_LEAD && gameTime < REAPER_TIME_MS;
  const reaperArrived = gameTime >= REAPER_TIME_MS;

  return (
    <div className="absolute inset-0 pointer-events-none text-white">
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

      {/* Reaper warning / arrival banner */}
      {(reaperImminent || reaperArrived) && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full text-[13px] font-bold ${
            reaperArrived
              ? 'bg-red-700/80 text-red-100 animate-pulse'
              : 'bg-red-900/70 text-red-200 animate-pulse'
          }`}
          style={{ top: 'calc(max(env(safe-area-inset-top), 8px) + 56px)' }}
        >
          {reaperArrived ? '死神降臨' : 'まもなく死神が訪れる…'}
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

      {/* Equipped weapons + ammo */}
      {(() => {
        const gun = player.weapons.find(w => !w.isMelee);
        const melee = player.weapons.find(w => w.isMelee);
        const ammoFieldFor = (t: AmmoType) =>
          t === 'handgun' ? player.ammoHandgun : t === 'shotgun' ? player.ammoShotgun : player.ammoRifle;
        const ammoType = gun?.ammoType;
        const ammo = ammoType ? ammoFieldFor(ammoType) : 0;
        const ammoMax = ammoType ? AMMO_MAX[ammoType] : 0;
        const dry = ammo <= 0;
        return (
          <div
            className="absolute"
            style={{
              left: 'max(env(safe-area-inset-left), 12px)',
              bottom: 'calc(max(env(safe-area-inset-bottom), 12px) + 8px)'
            }}
          >
            <div className="glass-panel rounded-2xl px-2.5 py-2 flex items-center gap-3">
              {/* Gun slot */}
              {gun && (
                <div className="flex items-center gap-2">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center text-base ${
                      dry ? 'bg-white/5 opacity-50' : 'bg-amber-500/20'
                    }`}
                    title={gun.name}
                  >
                    🔫
                  </div>
                  <div className="leading-tight">
                    <div className="text-[10px] text-white/60 truncate max-w-[88px]">{gun.name}</div>
                    <div
                      className={`text-[13px] font-bold tabular-nums ${
                        dry ? 'text-red-400 animate-pulse' : 'text-white'
                      }`}
                    >
                      {ammo}
                      <span className="text-[10px] text-white/40">/{ammoMax}</span>
                    </div>
                  </div>
                </div>
              )}
              {/* Melee slot */}
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

      {/* FPS */}
      <div
        className="absolute text-[10px] text-white/40 tabular-nums"
        style={{
          right: 'max(env(safe-area-inset-right), 12px)',
          top: 'max(env(safe-area-inset-top), 8px)',
          transform: 'translateY(-2px)'
        }}
      >
        <span className="hidden">{fps}</span>
      </div>
    </div>
  );
};

export default GameHUD;
