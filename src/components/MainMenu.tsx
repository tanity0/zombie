import React, { useState } from 'react';
import { Skull, Wand2, Swords, Volume2, VolumeX } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { isAudioMuted, setAudioMuted } from '../audio/audioManager';

interface MainMenuProps {
  onStartGame: (characterClass: string) => void;
}

const MainMenu: React.FC<MainMenuProps> = ({ onStartGame }) => {
  const [selectedClass, setSelectedClass] = useState('warrior');
  const [audioMuted, setAudioMutedState] = useState(isAudioMuted);

  // Start-screen ammo drop-rate setting (persisted in the store/localStorage).
  const meleeAmmoDropPercent = useGameStore(s => s.meleeAmmoDropPercent);
  const setMeleeAmmoDropPercent = useGameStore(s => s.setMeleeAmmoDropPercent);
  const [dropInput, setDropInput] = useState(String(meleeAmmoDropPercent));

  const commitDrop = (raw: string) => {
    setDropInput(raw);
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n)) setMeleeAmmoDropPercent(n);
  };
  const normalizeDrop = () => {
    setDropInput(String(useGameStore.getState().meleeAmmoDropPercent));
  };
  const toggleAudio = () => {
    const next = !audioMuted;
    setAudioMutedState(next);
    setAudioMuted(next);
  };
  
  const characterClasses = [
    {
      id: 'warrior',
      name: 'ヘビーガンナー',
      description: 'ソードオフ・ショットガンと鉈で近距離を制圧する。',
      icon: <Swords className="w-8 h-8 text-red-500" />,
      stats: {
        health: 'High',
        speed: 'Medium',
        damage: 'Medium'
      }
    },
    {
      id: 'mage',
      name: 'マークスマン',
      description: 'マグナムとナイフ。一撃の重さで遠距離から狙撃する。',
      icon: <Wand2 className="w-8 h-8 text-purple-500" />,
      stats: {
        health: 'Low',
        speed: 'Medium',
        damage: 'High'
      }
    },
    {
      id: 'rogue',
      name: 'ストライカー',
      description: 'ハンドガンとマチェーテ。手数とフィニッシュで攻める。',
      icon: <Swords className="w-8 h-8 text-green-500" />,
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
      icon: <Skull className="w-8 h-8 text-indigo-500" />,
      stats: {
        health: 'Medium',
        speed: 'Low',
        damage: 'High'
      }
    }
  ];
  
  return (
    <div
      className="h-full w-full flex flex-col items-center justify-center bg-[#0b0b12] overflow-auto"
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 16px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
        paddingLeft: 'max(env(safe-area-inset-left), 12px)',
        paddingRight: 'max(env(safe-area-inset-right), 12px)'
      }}
    >
      <div className="max-w-3xl w-full glass-panel rounded-3xl overflow-hidden">
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
        </div>

        <div className="p-3">
          <h2 className="text-[13px] uppercase tracking-widest text-white/50 mb-2 px-1">
            キャラクターを選択
          </h2>

          <div className="grid grid-cols-2 gap-2 mb-4">
            {characterClasses.map((charClass) => (
              <div
                key={charClass.id}
                className={`relative p-3 rounded-2xl transition-colors cursor-pointer border ${
                  selectedClass === charClass.id
                    ? 'bg-blue-500/15 border-blue-400/60'
                    : 'bg-white/5 border-white/10 active:bg-white/10'
                }`}
                onClick={() => setSelectedClass(charClass.id)}
              >
                <div className="flex items-start space-x-2">
                  <div className="flex-shrink-0">
                    {charClass.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-medium text-white">{charClass.name}</h3>
                    <p className="mt-1 text-xs text-gray-300">{charClass.description}</p>
                    
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
                  <div className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.8)]" />
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center px-2">
            {/* Ammo drop-rate setting — melee kill base rate; finisher is ×1.5 */}
            <div className="w-full mb-3 flex items-center justify-between gap-3 rounded-2xl bg-white/5 border border-white/10 px-3 py-2.5">
              <div className="text-left">
                <div className="text-[13px] font-medium text-white">弾ドロップ率</div>
                <div className="text-[11px] text-white/50">近接キル時。フィニッシュは×1.5。</div>
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

            <button
              onClick={toggleAudio}
              className={`mt-2 w-full py-2.5 rounded-2xl text-sm font-semibold border flex items-center justify-center gap-2 ${
                audioMuted
                  ? 'bg-white/5 border-white/10 text-white/70'
                  : 'bg-emerald-400/10 border-emerald-300/35 text-emerald-100'
              }`}
              aria-label={audioMuted ? '音をオンにする' : '音をオフにする'}
            >
              {audioMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
              {audioMuted ? '音なし' : '音あり'}
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
    </div>
  );
};

export default MainMenu;
