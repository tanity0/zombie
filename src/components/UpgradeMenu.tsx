import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { playSfx } from '../audio/audioManager';
import { hasEquipIcon, equipIconName, equipmentById } from '../data/equipment';
import { spritePath } from '../utils/spriteLoader';
import type { UpgradeOption } from '../types/game';

// 装備アイコン1個(画像が無ければ絵文字フォールバック=特殊は🏯/通常は🛡️)。確認ダイアログ用。
const EquipIcon: React.FC<{ defId: string }> = ({ defId }) => {
  const def = equipmentById(defId);
  const img = hasEquipIcon(defId) ? spritePath(equipIconName(defId)) : null;
  return (
    <div className="w-16 h-16 rounded-none flex items-center justify-center text-3xl overflow-hidden bg-purple-400/10 border border-purple-400/15">
      {img
        ? <img src={img} alt="" className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
        : (def?.special ? '🏯' : '🛡️')}
    </div>
  );
};

const UpgradeMenu: React.FC = () => {
  const upgradeOptions = useGameStore(state => state.upgradeOptions);
  const selectUpgrade = useGameStore(state => state.selectUpgrade);
  // 既装備の部位に「違うカテゴリー(系統)」の装備を選んだ時だけ確認する(現装備アイコン→新装備アイコン)。
  const [confirm, setConfirm] = useState<{ upgrade: UpgradeOption; oldId: string; newId: string } | null>(null);

  const commit = (upgrade: UpgradeOption) => {
    playSfx('ui-select');
    setConfirm(null);
    selectUpgrade(upgrade);
  };
  // 選択肢タップ: 装備で「同部位・別系統」を上書きする時は確認を挟む。それ以外は即決定。
  const handleSelect = (upgrade: UpgradeOption) => {
    if (upgrade.type === 'equipment' && upgrade.equipDefId) {
      const newDef = equipmentById(upgrade.equipDefId);
      const currentId = newDef ? useGameStore.getState().player.equipment[newDef.slot] : null;
      const currentDef = equipmentById(currentId);
      if (newDef && currentDef && currentId && currentDef.line !== newDef.line) {
        playSfx('ui-select');
        setConfirm({ upgrade, oldId: currentId, newId: upgrade.equipDefId });
        return;
      }
    }
    commit(upgrade);
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center px-6 upgrade-menu-backdrop"
      style={{ background: 'rgba(11, 11, 18, 0.55)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
    >
      <div className="glass-panel rounded-none w-full max-w-md overflow-hidden upgrade-menu-panel flex flex-col max-h-[88dvh]">
        <div className="px-5 pt-5 pb-3 text-center shrink-0">
          <h2 className="text-xl font-semibold tracking-tight text-white">レベルアップ</h2>
          <p className="text-xs text-white/60 mt-1">強化を選んでください</p>
        </div>
        <div className="px-3 pb-4 flex flex-col gap-2 overflow-y-auto min-h-0 overscroll-contain touch-pan-y">
          {upgradeOptions.map(upgrade => {
            // 装備=特殊(level0)は金枠、通常はランク表示。scrap/heal は専用アイコン。
            const isSpecial = upgrade.type === 'equipment' && upgrade.level === 0;
            const icon = upgrade.type === 'scrap' ? '🔩'
              : upgrade.type === 'heal' ? '❤️'
              : upgrade.type === 'knife' ? '🔪'
              : upgrade.type === 'equipment' ? (isSpecial ? '🏯' : '🛡️')
              : upgrade.type === 'weapon' ? '⚔️' : '🔮';
            // 装備に専用アイコン素材があれば実画像、無ければ絵文字フォールバック。
            const iconImg = upgrade.type === 'equipment' && hasEquipIcon(upgrade.equipDefId)
              ? spritePath(equipIconName(upgrade.equipDefId!))
              : null;
            return (
              <button
                key={upgrade.id}
                type="button"
                onClick={() => handleSelect(upgrade)}
                className={`text-left p-3 rounded-none active:bg-purple-400/10 border transition-colors flex items-start gap-3 upgrade-menu-option ${isSpecial ? 'bg-amber-400/10 border-amber-300/40' : 'bg-purple-400/5 border-purple-400/10'}`}
              >
                <div className={`w-9 h-9 rounded-none flex items-center justify-center text-base overflow-hidden ${isSpecial ? 'bg-amber-400/20' : 'bg-purple-400/10'}`}>
                  {iconImg
                    ? <img src={iconImg} alt="" className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
                    : icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[15px] font-semibold text-white truncate">{upgrade.name}</h3>
                    {isSpecial ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-400/30 text-amber-100 border border-amber-300/40 shrink-0">
                        特殊
                      </span>
                    ) : upgrade.type === 'equipment' ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-600/30 text-purple-100 border border-purple-300/30 shrink-0">
                        R{upgrade.level}
                      </span>
                    ) : upgrade.type === 'knife' ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/30 text-rose-100 border border-rose-300/30 shrink-0">
                        T{upgrade.level}
                      </span>
                    ) : upgrade.type === 'weapon' && upgrade.level > 1 ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-600/30 text-purple-100 border border-purple-300/30 shrink-0">
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

      {/* 既装備の部位を別系統で上書きする時だけ: 現装備→新装備 のアイコンを見せて YES/NO で確認(テキストなし)。 */}
      {confirm && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center px-6"
          style={{ background: 'rgba(8, 8, 14, 0.7)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
          onClick={() => { playSfx('ui-select'); setConfirm(null); }}
        >
          <div
            className="glass-panel rounded-none px-6 py-6 flex flex-col items-center gap-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <EquipIcon defId={confirm.oldId} />
              <span className="text-2xl text-white/80">→</span>
              <EquipIcon defId={confirm.newId} />
            </div>
            <div className="flex items-center gap-3 w-full">
              <button
                type="button"
                onClick={() => { playSfx('ui-select'); setConfirm(null); }}
                className="flex-1 py-2.5 rounded-none bg-purple-400/10 border border-purple-400/15 text-white/90 font-bold tracking-wide active:bg-purple-400/20"
              >
                NO
              </button>
              <button
                type="button"
                onClick={() => commit(confirm.upgrade)}
                className="flex-1 py-2.5 rounded-none bg-amber-400/25 border border-amber-300/45 text-amber-100 font-bold tracking-wide active:bg-amber-400/40"
              >
                YES
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UpgradeMenu;
