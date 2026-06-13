import React, { useMemo, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { formatTime } from '../utils/renderUtils';
import { getWeaponShortName } from '../utils/weaponUtils';
import { FINALE_BOSS_TIME_MS } from '../utils/stageDirector';
import type { AmmoType } from '../types/game';
import { isAudioMuted, setAudioMuted } from '../audio/audioManager';
import { buildKatanaShape, type KatanaVariant } from '../utils/katanaShape';
import { ARROW_GLYPH, SHIJIN_JP, SHIJIN_BY_ARROW } from '../config/shijin';

// 背負い刀と同じ形状データをそのまま縮小して描くHUDアイコン。背面の刀と
// 同じ角度で斜めに回転させる(KATANA_BACK_ROT_DEG と一致)。村雨はシルバー。
const katanaHex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const KATANA_ICON_ROT_DEG = 32;
const KatanaIcon: React.FC<{ size?: number; variant?: KatanaVariant }> = ({ size = 26, variant = 'katana' }) => {
  const w = size * 0.62;
  const rects = useMemo(() => buildKatanaShape(1, variant), [variant]);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <g transform={`rotate(${KATANA_ICON_ROT_DEG} ${size / 2} ${size / 2}) translate(${(size - w) / 2} 0)`}>
        {rects.map((r, i) => (
          <rect
            key={i}
            x={r.x * w}
            y={r.y * size}
            width={r.w * w}
            height={r.h * size}
            fill={katanaHex(r.color)}
            fillOpacity={r.alpha}
          />
        ))}
      </g>
    </svg>
  );
};

const BOSS_WARN_LEAD = 12 * 1000;
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
  const rhythm = useGameStore(state => state.rhythm);
  const enemies = useGameStore(state => state.enemies);
  const effectsCount = useGameStore(state => state.effects.length);
  const projectilesCount = useGameStore(state => state.projectiles.length);
  const pickupsCount = useGameStore(state => state.pickups.length);

  const formattedTime = formatTime(gameTime / 1000);
  const expPercentage = (player.experience / player.experienceToNextLevel) * 100;
  const healthPercentage = (player.health / player.maxHealth) * 100;

  const bossActive = enemies.some(e => e.type === 'giantbat');
  const bossImminent =
    !bossActive &&
    gameTime >= FINALE_BOSS_TIME_MS - BOSS_WARN_LEAD &&
    gameTime < FINALE_BOSS_TIME_MS;

  const itemGetVisible = lastWeaponGet !== null && Date.now() - lastWeaponGet.at < 5000;
  const isTreasureGet = lastWeaponGet?.kind === 'treasure';
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
  const perfDebugLines = useMemo(() => [
    `FPS ${fps}`,
    `fx ${effectsCount} p ${projectilesCount}`,
    `item ${pickupsCount} enemy ${enemies.length}`,
    ...(perfWarning ? [`WARN ${perfIssues.join(',')}`] : []),
  ], [fps, effectsCount, projectilesCount, pickupsCount, enemies.length, perfWarning, perfIssues]);

  const toggleBgm = (e?: React.PointerEvent<HTMLButtonElement>) => {
    e?.preventDefault();
    e?.stopPropagation();
    const next = !audioMuted;
    setAudioMutedState(next);
    setAudioMuted(next);
  };

  return (
    <div className="absolute inset-0 z-40 pointer-events-none text-white">
      {/* Acquisition popup — shows for 5s after picking up notable items. */}
      {itemGetVisible && (
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{ top: 'calc(max(env(safe-area-inset-top), 8px) + 118px)' }}
        >
          <div
            className={`glass-panel rounded-2xl px-4 py-2 flex items-center gap-2 ring-2 shadow-lg animate-pulse ${
              isTreasureGet ? 'ring-amber-300/70' : 'ring-sky-400/70'
            }`}
          >
            <span className="text-xl">{isTreasureGet ? '💎' : '🔫'}</span>
            <div className="leading-tight">
              <div
                className={`text-[10px] font-bold tracking-wide ${
                  isTreasureGet ? 'text-amber-100/85' : 'text-sky-200/80'
                }`}
              >
                {isTreasureGet ? 'トレジャーを入手！' : '新しい銃器を入手！'}
              </div>
              <div
                className="text-sm font-bold"
                style={{ color: lastWeaponGet!.color ?? '#ffffff' }}
              >
                {lastWeaponGet!.name}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* フィニッシュカウンター表示は四神舞仕様で廃止(コンボ段階はミラーボールの色で表現)。
          コンボ状態(meleeFinishComboCount)は内部で継続使用。 */}

      {/* 四神舞: 目標コマンド(4矢印+1本目=四神)を左上に表示。入力済みは淡色。 */}
      {rhythm.active && (
        <div
          className="absolute text-left"
          style={{
            top: 'calc(max(env(safe-area-inset-top), 8px) + 132px)',
            left: 'max(env(safe-area-inset-left), 18px)',
          }}
        >
          <div
            className="text-[9px] tracking-[0.18em] text-sky-100/75 font-bold"
            style={{ textShadow: '0 1px 0 rgba(0,0,0,0.9), 0 0 6px rgba(56,189,248,0.35)' }}
          >
            コマンド
          </div>
          <div className="flex items-center gap-1 leading-none mt-0.5">
            {rhythm.prompt.map((ar, i) => (
              <span
                key={i}
                className="font-black tabular-nums"
                style={{
                  fontSize: '20px',
                  opacity: i < rhythm.inputIndex ? 0.3 : 1,
                  color: i === 0 ? '#fca5a5' : '#e2e8f0',
                  WebkitTextStroke: '1px rgba(10,14,24,0.85)',
                  textShadow: '0 2px 0 rgba(0,0,0,0.55)',
                }}
              >
                {ARROW_GLYPH[ar]}
              </span>
            ))}
            <span
              className="ml-1 text-[12px] font-bold align-baseline"
              style={{ color: '#fca5a5', textShadow: '0 1px 0 rgba(0,0,0,0.8)' }}
            >
              {SHIJIN_JP[SHIJIN_BY_ARROW[rhythm.prompt[0]]]}
            </span>
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
              {/* Melee slot (always available; not switchable). 刀装備中は
                  ナイフの代わりに刀を表示する。 */}
              {melee && (() => {
                const murasameEquipped = player.subWeapons.includes('murasame');
                const katanaEquipped = murasameEquipped || player.subWeapons.includes('katana');
                const katanaName = murasameEquipped ? '村雨' : '刀';
                // 鞭を取得するとナイフ枠を鞭が占有(刀装備が優先)。ナイフ表示は消える。
                const whipEquipped = !katanaEquipped && player.subWeapons.includes('whip');
                return (
                  <div className="flex items-center gap-1.5 pl-2 border-l border-white/10">
                    <div
                      className="w-9 h-9 rounded-xl bg-slate-400/15 flex items-center justify-center text-base"
                      title={katanaEquipped ? katanaName : whipEquipped ? '鞭' : melee.name}
                    >
                      {katanaEquipped
                        ? <KatanaIcon size={26} variant={murasameEquipped ? 'murasame' : 'katana'} />
                        : whipEquipped ? '➰' : '🔪'}
                    </div>
                    <div className="text-[10px] text-white/60">
                      {katanaEquipped ? katanaName : whipEquipped ? '鞭' : getWeaponShortName(melee.type)}
                    </div>
                  </div>
                );
              })()}
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
          <div>SCRAP {player.straps}</div>
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
        className={`fixed px-2 py-1 rounded-lg text-[10px] tabular-nums leading-tight shadow-lg ${
          perfWarning
            ? 'text-red-50 ring-1 ring-red-300/90 bg-red-950/90'
            : 'text-white/90 ring-1 ring-white/15 bg-black/75'
        }`}
        style={{
          right: 'max(env(safe-area-inset-right), 12px)',
          top: 'calc(max(env(safe-area-inset-top), 8px) + 212px)',
          zIndex: 90,
          textShadow: '0 1px 2px rgba(0,0,0,0.95)'
        }}
      >
        {perfDebugLines.map(line => <div key={line}>{line}</div>)}
      </div>
    </div>
  );
};

export default GameHUD;
