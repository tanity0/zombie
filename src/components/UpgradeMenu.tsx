import React from 'react';
import { useGameStore } from '../store/gameStore';

const UpgradeMenu: React.FC = () => {
  const player = useGameStore(state => state.player);
  const upgradeOptions = useGameStore(state => state.upgradeOptions);
  const selectUpgrade = useGameStore(state => state.selectUpgrade);
  
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center px-6"
      style={{ background: 'rgba(11, 11, 18, 0.55)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
    >
      <div className="glass-panel rounded-3xl w-full max-w-md overflow-hidden">
        <div className="px-5 pt-5 pb-3 text-center">
          <h2 className="text-xl font-semibold tracking-tight text-white">レベルアップ</h2>
          <p className="text-xs text-white/60 mt-1">強化を選んでください</p>
        </div>
        <div className="px-3 pb-4 flex flex-col gap-2">
          {upgradeOptions.map(upgrade => (
            <button
              key={upgrade.id}
              type="button"
              onClick={() => selectUpgrade(upgrade)}
              className="text-left p-3 rounded-2xl bg-white/5 active:bg-white/10 border border-white/10 transition-colors flex items-start gap-3"
            >
              <div className="w-9 h-9 rounded-2xl bg-white/10 flex items-center justify-center text-base">
                {upgrade.type === 'weapon' ? '⚔️' : '🔮'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[15px] font-semibold text-white truncate">{upgrade.name}</h3>
                  {upgrade.type === 'weapon' && upgrade.level > 1 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/30 text-blue-100 border border-blue-300/30">
                      Lv{upgrade.level}
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-white/70 leading-snug mt-0.5">{upgrade.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default UpgradeMenu;