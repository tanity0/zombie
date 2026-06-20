import React from 'react';
import { useGameStore } from '../store/gameStore';

const UpgradeMenu: React.FC = () => {
  const upgradeOptions = useGameStore(state => state.upgradeOptions);
  const selectUpgrade = useGameStore(state => state.selectUpgrade);
  
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center px-6 upgrade-menu-backdrop"
      style={{ background: 'rgba(11, 11, 18, 0.55)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
    >
      <div className="glass-panel rounded-3xl w-full max-w-md overflow-hidden upgrade-menu-panel flex flex-col max-h-[88dvh]">
        <div className="px-5 pt-5 pb-3 text-center shrink-0">
          <h2 className="text-xl font-semibold tracking-tight text-white">レベルアップ</h2>
          <p className="text-xs text-white/60 mt-1">強化を選んでください</p>
        </div>
        <div className="px-3 pb-4 flex flex-col gap-2 overflow-y-auto min-h-0 overscroll-contain">
          {upgradeOptions.map(upgrade => {
            // 装備=特殊(level0)は金枠、通常はランク表示。scrap/heal は専用アイコン。
            const isSpecial = upgrade.type === 'equipment' && upgrade.level === 0;
            const icon = upgrade.type === 'scrap' ? '🔩'
              : upgrade.type === 'heal' ? '❤️'
              : upgrade.type === 'equipment' ? (isSpecial ? '🏯' : '🛡️')
              : upgrade.type === 'weapon' ? '⚔️' : '🔮';
            return (
              <button
                key={upgrade.id}
                type="button"
                onClick={() => selectUpgrade(upgrade)}
                className={`text-left p-3 rounded-2xl active:bg-white/10 border transition-colors flex items-start gap-3 upgrade-menu-option ${isSpecial ? 'bg-amber-400/10 border-amber-300/40' : 'bg-white/5 border-white/10'}`}
              >
                <div className={`w-9 h-9 rounded-2xl flex items-center justify-center text-base ${isSpecial ? 'bg-amber-400/20' : 'bg-white/10'}`}>
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[15px] font-semibold text-white truncate">{upgrade.name}</h3>
                    {isSpecial ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-400/30 text-amber-100 border border-amber-300/40 shrink-0">
                        特殊
                      </span>
                    ) : upgrade.type === 'equipment' ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/30 text-blue-100 border border-blue-300/30 shrink-0">
                        R{upgrade.level}
                      </span>
                    ) : upgrade.type === 'weapon' && upgrade.level > 1 ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/30 text-blue-100 border border-blue-300/30 shrink-0">
                        Lv{upgrade.level}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[12px] text-white/70 leading-snug mt-0.5">{upgrade.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default UpgradeMenu;
