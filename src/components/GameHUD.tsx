import React, { useMemo, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useGameStore, subWeaponDisplayName } from '../store/gameStore';
import { shallow } from 'zustand/shallow';
import { formatTime } from '../utils/renderUtils';
import { getWeaponShortName } from '../utils/weaponUtils';
import { FINALE_BOSS_TIME_MS } from '../utils/stageDirector';
import { getStage } from '../data/campaign';
import { getSelectedStageId } from '../data/progress';
import type { AmmoType } from '../types/game';
import { isAudioMuted, setAudioMuted } from '../audio/audioManager';
import { buildKatanaShape, type KatanaVariant } from '../utils/katanaShape';

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

const GameHUD: React.FC = () => {
  const [audioMuted, setAudioMutedState] = useState(isAudioMuted);
  // player 全体ではなく HUD が使うフィールドだけを shallow 購読(移動で毎フレーム再描画しないように)。
  const player = useGameStore(s => ({
    health: s.player.health,
    maxHealth: s.player.maxHealth,
    experience: s.player.experience,
    experienceToNextLevel: s.player.experienceToNextLevel,
    level: s.player.level,
    weapons: s.player.weapons,
    activeWeaponId: s.player.activeWeaponId,
    ammoHandgun: s.player.ammoHandgun,
    ammoShotgun: s.player.ammoShotgun,
    ammoRifle: s.player.ammoRifle,
    ammoPhill: s.player.ammoPhill,
    subWeapons: s.player.subWeapons,
    subWeaponLevels: s.player.subWeaponLevels,
    straps: s.player.straps,
  }), shallow);
  // 装備中スキル(サブウェポン)のチップ表示用。村雨を持っていれば刀チップは出さない(同一系統)。
  const equippedSkills = player.subWeapons.filter(
    k => !(k === 'katana' && player.subWeapons.includes('murasame'))
  );
  const setActiveWeapon = useGameStore(state => state.setActiveWeapon);
  const lastWeaponGet = useGameStore(state => state.lastWeaponGet);
  // 時計/ボス警告は1秒粒度で十分。秒で購読し、毎フレーム再描画を避ける。
  const gameTime = useGameStore(state => Math.floor(state.gameTime / 1000)) * 1000;
  // 個別フィールドを購読(rhythm全体を購読すると resync の firstBeatAt 更新で毎フレーム再描画になり重い)。
  // コマンド/入力矢印は Pixi オーバーレイ側で描画。HUDはコンボ数のみ(左上)。
  // 近接フィニッシュのコンボ。ダンス(rhythm)中だけでなく通常の連続フィニッシュでも表示する。
  // コンボ窓(meleeFinishComboUntil)が有効な間だけ出す(7s窓・gameTimeは秒粒度なので失効後~1sで消える)。
  const rhythmCombo = useGameStore(state => state.meleeFinishComboCount);
  const rhythmComboUntil = useGameStore(state => state.meleeFinishComboUntil);
  // 配列ではなく派生値だけ購読(敵の移動で配列参照が毎フレーム変わっても、件数/ボス有無が
  // 変わらなければ再描画しない)。FPS/負荷表示は PerfOverlay へ分離済み。
  const enemyCount = useGameStore(state => state.enemies.length);
  const bossActive = useGameStore(state => state.enemies.some(e => e.type === 'giantbat'));

  // 出撃中ステージ名(選択ステージに連動。研究所なら「研究所跡」。未取得時は従来名)。
  const stageName = getStage(getSelectedStageId())?.name ?? 'マッド・フォレスト';
  const formattedTime = formatTime(gameTime / 1000);
  // ダンス中はレベルアップ保留でEXPが溢れるため、表示は100%でカンスト(止める)。
  const expPercentage = Math.min(100, (player.experience / player.experienceToNextLevel) * 100);
  const healthPercentage = (player.health / player.maxHealth) * 100;

  const bossImminent =
    !bossActive &&
    gameTime >= FINALE_BOSS_TIME_MS - BOSS_WARN_LEAD &&
    gameTime < FINALE_BOSS_TIME_MS;

  const itemGetVisible = lastWeaponGet !== null && Date.now() - lastWeaponGet.at < 5000;
  const isTreasureGet = lastWeaponGet?.kind === 'treasure';
  const isDataGet = lastWeaponGet?.kind === 'data'; // 研究所の重要データ確保(武器/トレジャーと同じバナーUI)

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
              isTreasureGet ? 'ring-amber-300/70' : isDataGet ? 'ring-emerald-300/70' : 'ring-sky-400/70'
            }`}
          >
            <span className="text-xl">{isTreasureGet ? '💎' : isDataGet ? '💾' : '🔫'}</span>
            <div className="leading-tight">
              <div
                className={`text-[10px] font-bold tracking-wide ${
                  isTreasureGet ? 'text-amber-100/85' : isDataGet ? 'text-emerald-100/85' : 'text-sky-200/80'
                }`}
              >
                {isTreasureGet ? 'トレジャーを入手！' : isDataGet ? 'データを確保！' : '新しい銃器を入手！'}
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

      {/* コンボ数を左上に表示(近接フィニッシュ/四神舞 共通)。コマンド/入力矢印は Pixi 頭上オーバーレイ側。 */}
      {rhythmCombo >= 2 && rhythmComboUntil >= gameTime && (
        <div
          className="absolute text-left"
          style={{
            top: 'calc(max(env(safe-area-inset-top), 8px) + 132px)',
            left: 'max(env(safe-area-inset-left), 18px)',
          }}
        >
          <div className="leading-none">
            <div
              className="text-[9px] tracking-[0.18em] text-amber-100/75 font-bold"
              style={{ textShadow: '0 1px 0 rgba(0,0,0,0.9), 0 0 6px rgba(251,191,36,0.35)' }}
            >
              COMBO
            </div>
            <div
              className="font-black tabular-nums text-amber-100"
              style={{ WebkitTextStroke: '1px rgba(20,12,4,0.86)', textShadow: '0 2px 0 rgba(0,0,0,0.55), 0 0 14px rgba(251,191,36,0.28)' }}
            >
              <span key={`combo-${rhythmCombo}`} className="combo-count-pop inline-block text-3xl">{rhythmCombo}</span>
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
          敵 {enemyCount}
        </div>
        {/* 拾ったスクラップ数(表示のみ)。 */}
        <div className="glass-pill px-3 py-1 text-[13px] font-semibold tabular-nums">
          🔩 {player.straps}
        </div>
      </div>

      {/* Stage label(選択ステージ名に連動。ベンチ/フリー等で未取得なら従来名) */}
      <div
        className="absolute left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.3em] text-white/40"
        style={{ top: 'calc(max(env(safe-area-inset-top), 8px) + 30px)' }}
      >
        {stageName}
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
            <span className="text-[10px] uppercase tracking-widest text-emerald-200/80 w-12">PHILL</span>
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

      {/* 装備中スキル(サブウェポン)のチップ。武器パネルの上に並べる。 */}
      {equippedSkills.length > 0 && (
        <div
          className="absolute flex flex-wrap gap-1 max-w-[62vw]"
          style={{
            left: 'max(env(safe-area-inset-left), 12px)',
            bottom: 'calc(max(env(safe-area-inset-bottom), 12px) + 66px)'
          }}
        >
          {equippedSkills.map(key => (
            <div
              key={key}
              className="glass-pill px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1"
            >
              <span className="text-sky-200/90">{subWeaponDisplayName(key)}</span>
              <span className="text-white/45 tabular-nums">Lv{player.subWeaponLevels[key] ?? 1}</span>
            </div>
          ))}
        </div>
      )}

      {/* Equipped weapons + ammo. Guns are tappable to switch the active one. */}
      {(() => {
        const guns = player.weapons.filter(w => !w.isMelee);
        const melee = player.weapons.find(w => w.isMelee);
        const activeGun = guns.find(w => w.id === player.activeWeaponId) ?? guns[0];
        const ammoFieldFor = (t: AmmoType) =>
          t === 'handgun' ? player.ammoHandgun : t === 'shotgun' ? player.ammoShotgun : t === 'phill' ? player.ammoPhill : player.ammoRifle;
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

      {/* Stats(撃破/DMG/SCRAP)は StatsHud に分離(頻繁な再描画をHUD本体から切り離す)。 */}

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
    </div>
  );
};

export default GameHUD;
