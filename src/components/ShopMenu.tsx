import React from 'react';
import { shallow } from 'zustand/shallow';
import {
  SHOP_AMMO_COST,
  SHOP_CLASS_SKILL_COST,
  SHOP_DOG_COST,
  SHOP_KATANA_COST,
  SHOP_MEDKIT_COST,
  SHOP_SUBWEAPON_SELL_VALUE,
  SHOP_VACCINE_COST,
  subWeaponDisplayName,
  useGameStore
} from '../store/gameStore';
import type { AmmoType, ShopItemKey, SubWeaponKey } from '../types/game';
import { CHARACTER_SUBWEAPON_KEYS } from '../data/campaign';
import { playSfx } from '../audio/audioManager';

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
  // player 全体を購読するとシム稼働中は毎フレーム再描画になるため、ショップで使う
  // フィールドだけを shallow で抜き出す(React 再描画規律: CLAUDE.md 参照)。
  const player = useGameStore(
    state => ({
      health: state.player.health,
      maxHealth: state.player.maxHealth,
      straps: state.player.straps,
      weapons: state.player.weapons,
      subWeapons: state.player.subWeapons,
      subWeaponLevels: state.player.subWeaponLevels
    }),
    shallow
  );
  const ammoPickupAmounts = useGameStore(state => state.ammoPickupAmounts);
  const unlockedShopSkillCards = useGameStore(state => state.unlockedShopSkillCards);
  const vaccinePurchased = useGameStore(state => state.vaccinePurchased);
  const buyShopItem = useGameStore(state => state.buyShopItem);
  const buySkillCardFromShop = useGameStore(state => state.buySkillCardFromShop);
  const sellSubWeapon = useGameStore(state => state.sellSubWeapon);
  const closeShop = useGameStore(state => state.closeShop);
  const returnToBase = useGameStore(state => state.returnToBase);

  // 研究所(屋内)では商人はPHILL弾のみ販売。研究所スキン(lab テーマ)の屋外は従来3種＋PHILL弾。屋外は従来3種。
  const indoorMode = useGameStore(state => state.indoorMode);
  const labTheme = useGameStore(state => state.stageTheme) === 'lab';
  const ammoTypes: AmmoType[] = indoorMode
    ? ['phill']
    : labTheme ? ['handgun', 'shotgun', 'rifle', 'phill'] : ['handgun', 'shotgun', 'rifle'];
  // lab テーマでは PHILL 銃を無料配布(未所持時のみ)。社長指示: 武器商人が無料で販売。
  const hasPhillGun = player.weapons.some(w => !w.isMelee && w.category === 'phill');
  const ammoEntries = ammoTypes.map(type => ({
    key: ammoShopKey[type],
    name: ammoLabel[type],
    description: `+${ammoPickupAmounts[type]}発`,
    cost: SHOP_AMMO_COST,
    ammoType: type
  }));
  const skillEntries: SkillShopEntry[] = (Object.entries(unlockedShopSkillCards) as [SubWeaponKey, number][])
    // キャラ固有サブウェポン(職スキル枠)はショップで扱わない(キャラ固有スキル化)。
    .filter(([skillKey, unlockedLevel]) => unlockedLevel > 0 && !CHARACTER_SUBWEAPON_KEYS.includes(skillKey))
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
    ...(labTheme ? [{
      key: 'buy-phill' as const,
      name: 'ＰＨＩＬＬ-銃',
      description: hasPhillGun ? '所持済み' : '無料配布・ヘッドショット対応',
      cost: 0,
      disabled: hasPhillGun,
    }] : []),
    ...ammoEntries,
    ...skillEntries,
    {
      key: 'medkit',
      name: '救急セット',
      description: '即時にHP30%回復',
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

  // サブウェポン換金: 装備中(選択した)サブを自動で売却。ロードアウトはサブ1枠なので通常は1個。
  // 職固有スキル(CHARACTER_SUBWEAPON_KEYS)は売れない。複数所持時は先頭(=選択したロードアウト)から。
  const sellTarget: SubWeaponKey | undefined =
    player.subWeapons.find(k => !CHARACTER_SUBWEAPON_KEYS.includes(k));

  const handleSell = (key: SubWeaponKey) => {
    playSfx('ui-select');
    sellSubWeapon(key);
  };

  const handleBuy = (entry: ShopEntry | SkillShopEntry) => {
    playSfx('ui-select');
    if (entry.disabled || player.straps < entry.cost) return;
    if ('skillKey' in entry) {
      buySkillCardFromShop(entry.skillKey);
    } else {
      const ok = buyShopItem(entry.key, entry.ammoType);
      // 武器購入(PHILL銃)は武器庫(武器クレート)取得と同じSEを鳴らす。
      if (ok && entry.key === 'buy-phill') playSfx('weapon-pickup');
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
                    {entry.cost === 0 ? '無料' : `${entry.cost}s`}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {sellTarget && (
          <div className="px-4 pb-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-amber-200/55 mb-1.5">サブウェポン換金</div>
            <button
              onClick={() => handleSell(sellTarget)}
              className="w-full rounded-2xl border px-3 py-2 text-left transition bg-white/8 border-white/15 active:scale-[0.98]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-white truncate">{subWeaponDisplayName(sellTarget)} を換金</div>
                  <div className="text-[10px] leading-tight text-white/50">装備中のサブウェポン（Lv{player.subWeaponLevels[sellTarget] ?? 1}）を手放す</div>
                </div>
                <div className="text-[12px] font-black text-emerald-300 tabular-nums whitespace-nowrap">+{SHOP_SUBWEAPON_SELL_VALUE}s</div>
              </div>
            </button>
          </div>
        )}

        <div className="px-4 pb-4 space-y-2">
          <button
            onClick={() => { playSfx('ui-select'); returnToBase(); }}
            className="w-full rounded-2xl border border-amber-300/40 bg-amber-400/15 py-2.5 text-sm font-bold text-amber-100"
          >
            帰還する
            <span className="block text-[10px] font-normal text-amber-100/70">装備を1つ持ち帰り撤収（スコア計上・進行/クリアボーナスなし）</span>
          </button>
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
