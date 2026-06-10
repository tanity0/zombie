import React, { useState } from 'react';
import { Settings, Volume2, VolumeX } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import type { AmmoType } from '../types/game';
import {
  getBgmVolume,
  getSfxVolume,
  isAudioMuted,
  setAudioMuted,
  setBgmVolume,
  setSfxVolume
} from '../audio/audioManager';

interface MainMenuProps {
  onStartGame: (characterClass: string) => void;
  onStartBenchmark: (characterClass: string) => void;
}

const MainMenu: React.FC<MainMenuProps> = ({ onStartGame, onStartBenchmark }) => {
  const [selectedClass, setSelectedClass] = useState('warrior');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [audioMuted, setAudioMutedState] = useState(isAudioMuted);
  const [bgmVol, setBgmVol] = useState(getBgmVolume);
  const [sfxVol, setSfxVol] = useState(getSfxVolume);

  // Start-screen ammo drop-rate setting (persisted in the store/localStorage).
  const meleeAmmoDropPercent = useGameStore(s => s.meleeAmmoDropPercent);
  const setMeleeAmmoDropPercent = useGameStore(s => s.setMeleeAmmoDropPercent);
  const ammoPickupAmounts = useGameStore(s => s.ammoPickupAmounts);
  const setAmmoPickupAmount = useGameStore(s => s.setAmmoPickupAmount);
  const [dropInput, setDropInput] = useState(String(meleeAmmoDropPercent));
  const [ammoInputs, setAmmoInputs] = useState<Record<AmmoType, string>>({
    handgun: String(ammoPickupAmounts.handgun),
    shotgun: String(ammoPickupAmounts.shotgun),
    rifle: String(ammoPickupAmounts.rifle)
  });

  const commitDrop = (raw: string) => {
    setDropInput(raw);
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n)) setMeleeAmmoDropPercent(n);
  };
  const normalizeDrop = () => {
    setDropInput(String(useGameStore.getState().meleeAmmoDropPercent));
  };
  const commitAmmoPickup = (type: AmmoType, raw: string) => {
    setAmmoInputs(prev => ({ ...prev, [type]: raw }));
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n)) setAmmoPickupAmount(type, n);
  };
  const normalizeAmmoPickup = (type: AmmoType) => {
    setAmmoInputs(prev => ({
      ...prev,
      [type]: String(useGameStore.getState().ammoPickupAmounts[type])
    }));
  };
  const toggleAudio = () => {
    const next = !audioMuted;
    setAudioMutedState(next);
    setAudioMuted(next);
  };
  const changeBgmVolume = (raw: string) => {
    const next = Number(raw) / 100;
    setBgmVol(next);
    setBgmVolume(next);
  };
  const changeSfxVolume = (raw: string) => {
    const next = Number(raw) / 100;
    setSfxVol(next);
    setSfxVolume(next);
  };
  const spriteVersion = encodeURIComponent(__APP_VERSION__);
  
  const characterClasses = [
    {
      id: 'warrior',
      name: 'ヘビーガンナー',
      description: 'ソードオフ・ショットガンとダガーで近距離を制圧する。',
      sprite: `${import.meta.env.BASE_URL}sprites/player-shotgun-walk-0.png?v=${spriteVersion}`,
      accent: 'rgba(248, 113, 113, 0.55)',
      stats: {
        health: 'Medium',
        speed: 'Medium',
        damage: 'Medium'
      }
    },
    {
      id: 'mage',
      name: 'マークスマン',
      description: 'マグナムとナイフ。一撃の重さで遠距離から狙撃する。',
      sprite: `${import.meta.env.BASE_URL}sprites/player-magnum-walk-0.png?v=${spriteVersion}`,
      accent: 'rgba(168, 85, 247, 0.52)',
      stats: {
        health: 'Low',
        speed: 'Medium',
        damage: 'High'
      }
    },
    {
      id: 'rogue',
      name: 'ストライカー',
      description: 'ハンドガンとファイティングナイフ。手数とフィニッシュで攻める。',
      sprite: `${import.meta.env.BASE_URL}sprites/player-scavenger-walk-0.png?v=${spriteVersion}`,
      accent: 'rgba(52, 211, 153, 0.48)',
      stats: {
        health: 'Low',
        speed: 'High',
        damage: 'Medium'
      }
    },
    {
      id: 'necromancer',
      name: 'スカベンジャー',
      description: 'ハンドガンとナイフ。拾った武器で戦況を変える。',
      sprite: `${import.meta.env.BASE_URL}sprites/player-striker-walk-0.png?v=${spriteVersion}`,
      accent: 'rgba(129, 140, 248, 0.48)',
      stats: {
        health: 'Medium',
        speed: 'Low',
        damage: 'High'
      }
    }
  ];
  const ammoDebugFields: { type: AmmoType; label: string }[] = [
    { type: 'handgun', label: 'ハンドガン' },
    { type: 'shotgun', label: 'ショットガン' },
    { type: 'rifle', label: 'ライフル' }
  ];
  
  return (
    <div
      className="h-full w-full flex flex-col items-center justify-start bg-[#0b0b12] overflow-y-auto overscroll-contain"
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 16px)',
        paddingBottom: 'max(calc(env(safe-area-inset-bottom) + 24px), 40px)',
        paddingLeft: 'max(env(safe-area-inset-left), 12px)',
        paddingRight: 'max(env(safe-area-inset-right), 12px)'
      }}
    >
      <div className="max-w-3xl w-full shrink-0 glass-panel rounded-3xl overflow-hidden">
        <div className="relative px-5 pt-6 pb-3 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            ゾンビサバイバル
          </h1>
          <p className="text-[13px] text-white/60 mt-1">
            弾を節約し、群れを捌いて生き延びろ
          </p>
          <span className="absolute top-3 right-3 glass-pill px-2 py-0.5 text-[10px] font-mono tabular-nums text-white/70">
            v{__APP_VERSION__}
          </span>
          <button
            onClick={() => setSettingsOpen(v => !v)}
            className="absolute top-3 left-3 w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-white/80 flex items-center justify-center active:bg-white/10"
            aria-label="設定"
            title="設定"
          >
            <Settings size={17} />
          </button>
        </div>

        <div className="p-3">
          <h2 className="text-[13px] uppercase tracking-widest text-white/50 mb-2 px-1">
            キャラクターを選択
          </h2>

          <div className="grid grid-cols-2 gap-2 mb-4">
            {characterClasses.map((charClass) => (
              <div
                key={charClass.id}
                className={`relative min-h-[154px] overflow-hidden rounded-2xl transition-colors cursor-pointer border ${
                  selectedClass === charClass.id
                    ? 'bg-blue-500/15 border-blue-400/60'
                    : 'bg-white/5 border-white/10 active:bg-white/10'
                }`}
                onClick={() => setSelectedClass(charClass.id)}
              >
                <div
                  className="pointer-events-none absolute -left-7 -bottom-8 w-32 h-32 rounded-full blur-2xl opacity-40"
                  style={{ backgroundColor: charClass.accent }}
                />
                <div className="relative flex min-h-[154px]">
                  <div className="relative w-[86px] flex-shrink-0 flex items-end justify-center pt-3 pb-2">
                    <div
                      className={`absolute bottom-2 h-6 w-16 rounded-full blur-md transition-opacity ${
                        selectedClass === charClass.id ? 'opacity-80' : 'opacity-35'
                      }`}
                      style={{ backgroundColor: charClass.accent }}
                    />
                    <img
                      src={charClass.sprite}
                      alt={charClass.name}
                      className="relative z-10 max-h-[122px] max-w-[86px] object-contain drop-shadow-[0_10px_16px_rgba(0,0,0,0.55)]"
                      style={{
                        imageRendering: 'pixelated',
                        transform: selectedClass === charClass.id ? 'scale(1.06)' : 'scale(1)',
                        transformOrigin: '50% 100%',
                        transition: 'transform 140ms ease-out'
                      }}
                    />
                  </div>
                  <div className="relative flex-1 min-w-0 px-2.5 py-3">
                    <h3 className="text-base font-semibold text-white leading-tight">{charClass.name}</h3>
                    <p className="mt-1 text-[11px] leading-snug text-gray-300">{charClass.description}</p>
                    
                    <div className="mt-2 grid grid-cols-3 w-full text-center text-xs text-gray-300">
                      <div>
                        <div className="font-semibold mb-1 text-[10px]">体力</div>
                        <div className={`text-[10px] ${
                          charClass.stats.health === 'High' ? 'text-green-400' : 
                          charClass.stats.health === 'Medium' ? 'text-yellow-400' : 
                          'text-red-400'
                        }`}>
                          {charClass.stats.health === 'High' ? '高い' : 
                           charClass.stats.health === 'Medium' ? '普通' : 
                           '低い'}
                        </div>
                      </div>
                      <div>
                        <div className="font-semibold mb-1 text-[10px]">速度</div>
                        <div className={`text-[10px] ${
                          charClass.stats.speed === 'High' ? 'text-green-400' : 
                          charClass.stats.speed === 'Medium' ? 'text-yellow-400' : 
                          'text-red-400'
                        }`}>
                          {charClass.stats.speed === 'High' ? '高い' : 
                           charClass.stats.speed === 'Medium' ? '普通' : 
                           '低い'}
                        </div>
                      </div>
                      <div>
                        <div className="font-semibold mb-1 text-[10px]">攻撃力</div>
                        <div className={`text-[10px] ${
                          charClass.stats.damage === 'High' ? 'text-green-400' : 
                          charClass.stats.damage === 'Medium' ? 'text-yellow-400' : 
                          'text-red-400'
                        }`}>
                          {charClass.stats.damage === 'High' ? '高い' : 
                           charClass.stats.damage === 'Medium' ? '普通' : 
                           '低い'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {selectedClass === charClass.id && (
                  <>
                    <div className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.8)]" />
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-300/80 shadow-[0_0_14px_rgba(147,197,253,0.9)]" />
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center px-2">
            {settingsOpen && (
              <div className="w-full mb-3 rounded-2xl bg-white/5 border border-white/10 px-3 py-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-left">
                    <div className="text-[13px] font-medium text-white">弾ドロップ率</div>
                    <div className="text-[11px] text-white/50">デバッグ用。撃破時。近接フィニッシュは×1.5。</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={100}
                      value={dropInput}
                      onChange={(e) => commitDrop(e.target.value)}
                      onBlur={normalizeDrop}
                      className="w-16 text-right bg-white/10 border border-white/15 rounded-lg px-2 py-1 text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-400/60"
                    />
                    <span className="text-white/60 text-sm">%</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/15 px-3 py-2">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[13px] font-medium text-white">弾薬箱取得量</div>
                      <div className="text-[11px] text-white/50">デバッグ用。重複武器取得時はこの2倍。</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {ammoDebugFields.map(field => (
                      <label key={field.type} className="block">
                        <span className="mb-1 block text-[10px] text-white/60">{field.label}</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={999}
                          value={ammoInputs[field.type]}
                          onChange={(e) => commitAmmoPickup(field.type, e.target.value)}
                          onBlur={() => normalizeAmmoPickup(field.type)}
                          className="w-full text-right bg-white/10 border border-white/15 rounded-lg px-2 py-1 text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-400/60"
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <label className="block">
                  <div className="mb-1 flex items-center justify-between text-[12px] text-white/70">
                    <span>BGM</span>
                    <span className="tabular-nums">{Math.round(bgmVol * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(bgmVol * 100)}
                    onChange={(e) => changeBgmVolume(e.target.value)}
                    className="w-full accent-blue-400"
                  />
                </label>

                <label className="block">
                  <div className="mb-1 flex items-center justify-between text-[12px] text-white/70">
                    <span>SE</span>
                    <span className="tabular-nums">{Math.round(sfxVol * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(sfxVol * 100)}
                    onChange={(e) => changeSfxVolume(e.target.value)}
                    className="w-full accent-emerald-400"
                  />
                </label>

                <button
                  onClick={toggleAudio}
                  className={`w-full py-2.5 rounded-2xl text-sm font-semibold border flex items-center justify-center gap-2 ${
                    audioMuted
                      ? 'bg-white/5 border-white/10 text-white/70'
                      : 'bg-emerald-400/10 border-emerald-300/35 text-emerald-100'
                  }`}
                  aria-label={audioMuted ? '音をオンにする' : '音をオフにする'}
                >
                  {audioMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
                  {audioMuted ? '音なし' : '音あり'}
                </button>
              </div>
            )}

            <button
              onClick={() => onStartGame(selectedClass)}
              className="w-full py-3 rounded-2xl text-base font-semibold text-white"
              style={{
                background: 'linear-gradient(180deg, rgba(96, 165, 250, 0.95), rgba(59, 130, 246, 0.95))',
                boxShadow: '0 8px 24px rgba(59, 130, 246, 0.35)'
              }}
            >
              はじめる
            </button>

            <div className="mt-3 text-[12px] text-white/60 space-y-1 text-center">
              <p>画面のどこでも指を置いてスワイプ＝移動。銃は自動で発射。</p>
              <p className="text-amber-300/90">
                指を離すと近接攻撃＆弾反射！クリで気絶した敵は一撃で仕留められます。
              </p>
              <p className="text-white/40 text-[11px]">PC: WASD / 矢印で移動・Space で近接カウンター</p>
            </div>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onStartBenchmark(selectedClass)}
        className="fixed rounded-md border border-cyan-200/30 bg-black/35 px-2 py-1 text-[10px] font-semibold tracking-wide text-cyan-100/70 shadow-lg backdrop-blur-sm active:text-white"
        style={{
          right: 'max(env(safe-area-inset-right), 12px)',
          bottom: 'max(env(safe-area-inset-bottom), 10px)',
          zIndex: 60
        }}
      >
        BENCH
      </button>
    </div>
  );
};

export default MainMenu;
