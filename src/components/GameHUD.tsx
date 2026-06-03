import React from 'react';
import { useGameStore } from '../store/gameStore';
import { formatTime } from '../utils/renderUtils';

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

      {/* Weapons */}
      <div
        className="absolute"
        style={{
          left: 'max(env(safe-area-inset-left), 12px)',
          bottom: 'calc(max(env(safe-area-inset-bottom), 12px) + 8px)'
        }}
      >
        <div className="glass-panel rounded-2xl px-2 py-1.5">
          <div className="flex items-center gap-1.5">
            {player.weapons.map(weapon => (
              <div
                key={weapon.id}
                className="w-7 h-7 rounded-xl bg-white/10 flex items-center justify-center text-[11px] font-bold text-white"
                title={`${weapon.name} (Lv ${weapon.level})`}
              >
                {weapon.level}
              </div>
            ))}
          </div>
        </div>
      </div>

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
