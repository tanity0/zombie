import React from 'react';
import {
  SHOP_AMMO_COST,
  SHOP_CLASS_SKILL_COST,
  SHOP_DOG_COST,
  SHOP_KATANA_COST,
  SHOP_MEDKIT_COST,
  SHOP_VACCINE_COST,
  subWeaponDisplayName,
  useGameStore
} from '../store/gameStore';
import type { AmmoType, ShopItemKey, SubWeaponKey } from '../types/game';

type ShopEntry = {
  key: ShopItemKey;
  name: string;
  description: string;
  cost: number;
  ammoType?: AmmoType;
  disabled?: boolean;
};

type SkillShopEntry = {
  key: `skill-${SubWeaponKey}`;
  skillKey: SubWeaponKey;
  name: string;
  description: string;
  cost: number;
  disabled?: boolean;
};

const ammoLabel: Record<AmmoType, string> = {
  handgun: 'ハンドガン弾',
  shotgun: 'ショットガン弾',
  rifle: 'ライフル弾',
  phill: 'ＰＨＩＬＬ弾'
};

const ammoShopKey: Record<AmmoType, ShopItemKey> = {
  handgun: 'ammo-handgun',
  shotgun: 'ammo-shotgun',
  rifle: 'ammo-rifle',
  phill: 'ammo-phill'
};

const ShopMenu: React.FC = () => {
  const player = useGameStore(state => state.player);
  const ammoPickupAmounts = useGameStore(state => state.ammoPickupAmounts);
  const unlockedShopSkillCards = useGameStore(state => state.unlockedShopSkillCards);
  const vaccinePurchased = useGameStore(state => state.vaccinePurchased);
  const buyShopItem = useGameStore(state => state.buyShopItem);
  const buySkillCardFromShop = useGameStore(state => state.buySkillCardFromShop);
  const closeShop = useGameStore(state => state.closeShop);

  // 研究所(屋内)では商人はPHILL弾のみ販売。屋外は従来3種。
  const indoorMode = useGameStore(state => state.indoorMode);
  const ammoTypes: AmmoType[] = indoorMode ? ['phill'] : ['handgun', 'shotgun', 'rifle'];
  const ammoEntries = ammoTypes.map(type => ({
    key: ammoShopKey[type],
    name: ammoLabel[type],
    description: `+${ammoPickupAmounts[type]}発`,
    cost: SHOP_AMMO_COST,
    ammoType: type
  }));
  const skillEntries: SkillShopEntry[] = (Object.entries(unlockedShopSkillCards) as [SubWeaponKey, number][])
    .filter(([, unlockedLevel]) => unlockedLevel > 0)
    .map(([skillKey, unlockedLevel]) => {
      const currentLevel = player.subWeaponLevels[skillKey] ?? 0;
      const cappedUnlock = Math.min(3, Math.max(0, unlockedLevel));
      const maxedForStock = currentLevel >= cappedUnlock || currentLevel >= 3;
      return {
        key: `skill-${skillKey}` as const,
        skillKey,
        name: `${subWeaponDisplayName(skillKey)} ${maxedForStock ? 'MAX' : `Lv${currentLevel + 1}`}`,
        description: maxedForStock ? `陳列Lv${cappedUnlock}まで購入済み` : `スキルカード 陳列Lv${cappedUnlock}`,
        cost: skillKey === 'dog' ? SHOP_DOG_COST : skillKey === 'katana' ? SHOP_KATANA_COST : SHOP_CLASS_SKILL_COST,
        disabled: maxedForStock
      };
    });
  const entries: (ShopEntry | SkillShopEntry)[] = [
    ...ammoEntries,
    ...skillEntries,
    {
      key: 'medkit',
      name: '救急セット',
      description: '即時回復',
      cost: SHOP_MEDKIT_COST,
      disabled: player.health >= player.maxHealth
    },
    {
      key: 'vaccine',
      name: 'ワクチン',
      description: vaccinePurchased ? '購入済み' : '一度だけ死亡時に復活',
      cost: SHOP_VACCINE_COST,
      disabled: vaccinePurchased
    }
  ];

  const handleBuy = (entry: ShopEntry | SkillShopEntry) => {
    if (entry.disabled || player.straps < entry.cost) return;
    if ('skillKey' in entry) {
      buySkillCardFromShop(entry.skillKey);
    } else {
      buyShopItem(entry.key, entry.ammoType);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center px-3 pointer-events-auto">
      <div className="absolute inset-0 bg-black/55" />
      <div className="relative glass-panel rounded-3xl w-full max-w-lg overflow-hidden border border-white/10">
        <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-amber-200/65">WEAPON MERCHANT</div>
            <h2 className="text-xl font-bold text-white">武器商人</h2>
          </div>
          <div className="rounded-2xl bg-amber-300/12 border border-amber-200/20 px-3 py-1 text-right">
            <div className="text-[9px] tracking-widest text-amber-100/60">SCRAP</div>
            <div className="text-lg font-black text-amber-100 tabular-nums">{player.straps}s</div>
          </div>
        </div>

        <div className="px-4 pb-3 grid grid-cols-2 gap-2">
          {entries.map(entry => {
            const canBuy = !entry.disabled && player.straps >= entry.cost;
            return (
              <button
                key={`${entry.key}-${entry.ammoType ?? ''}`}
                onClick={() => handleBuy(entry)}
                disabled={!canBuy}
                className={`rounded-2xl border px-3 py-2 text-left transition ${
                  canBuy
                    ? 'bg-white/8 border-white/15 active:scale-[0.98]'
                    : 'bg-white/[0.03] border-white/8 opacity-45'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-white truncate">{entry.name}</div>
                    <div className="text-[10px] leading-tight text-white/50">{entry.description}</div>
                  </div>
                  <div className="text-[12px] font-black text-amber-200 tabular-nums whitespace-nowrap">
                    {entry.cost}s
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-4 pb-4">
          <button
            onClick={closeShop}
            className="w-full rounded-2xl bg-white/10 border border-white/10 py-3 text-sm font-bold text-white/90"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShopMenu;
