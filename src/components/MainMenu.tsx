import React, { useState } from 'react';
import { Skull, Wand2, Swords } from 'lucide-react';

interface MainMenuProps {
  onStartGame: (characterClass: string) => void;
}

const MainMenu: React.FC<MainMenuProps> = ({ onStartGame }) => {
  const [selectedClass, setSelectedClass] = useState('warrior');
  
  const characterClasses = [
    {
      id: 'warrior',
      name: 'ウォーリア',
      description: 'バランスの取れた剣士で、強力な剣撃を放ちます。',
      icon: <Swords className="w-8 h-8 text-red-500" />,
      stats: {
        health: 'High',
        speed: 'Medium',
        damage: 'Medium'
      }
    },
    {
      id: 'mage',
      name: 'メイジ',
      description: '魔法を使って遠距離から敵を攻撃します。',
      icon: <Wand2 className="w-8 h-8 text-purple-500" />,
      stats: {
        health: 'Low',
        speed: 'Medium',
        damage: 'High'
      }
    },
    {
      id: 'rogue',
      name: 'ローグ',
      description: '素早く俊敏で、攻撃速度が速いです。',
      icon: <Swords className="w-8 h-8 text-green-500" />,
      stats: {
        health: 'Low',
        speed: 'High',
        damage: 'Medium'
      }
    },
    {
      id: 'necromancer',
      name: 'ネクロマンサー',
      description: '闇の力を操り、近くの敵にダメージを与えます。',
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
            ダークサバイバーズ
          </h1>
          <p className="text-[13px] text-white/60 mt-1">
            マッド・フォレストで30分生き延びろ
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
              <p>画面のどこでも指を置いてスワイプ＝移動。</p>
              <p className="text-amber-300/90">
                指を離した瞬間にカウンター発動！敵の弾を反射できます。
              </p>
              <p className="text-white/40 text-[11px]">PC: WASD / 矢印で移動・Space でカウンター</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainMenu;