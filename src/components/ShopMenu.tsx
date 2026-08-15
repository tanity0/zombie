import React from 'react';
import { shallow } from 'zustand/shallow';
import {
  SHOP_AMMO_COST,
  shopAmmoAmount,
  AMMO_MAX,
  SHOP_CLASS_SKILL_COST,
  SHOP_DOG_COST,
  SHOP_KATANA_COST,
  SHOP_MEDKIT_COST,
  SHOP_SUBWEAPON_SELL_VALUE,
  SHOP_VACCINE_COST,
  EQUIP_SHOP_COST_BY_TIER, // SKILL_BUILD_REDESIGN.md §18-1の2: 商人の装備区画価格表(Tier1→5)
  subWeaponDisplayName,
  useGameStore
} from '../store/gameStore';
import type { AmmoType, EquipSlot, ShopItemKey, SubWeaponKey } from '../types/game';
import { CHARACTER_SUBWEAPON_KEYS } from '../data/campaign';
import { merchantEquipShelf, equipmentById, equipmentDescription, hasEquipIcon, equipIconName } from '../data/equipment';
import { spritePath } from '../utils/spriteLoader';
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

// SKILL_BUILD_REDESIGN.md §13-1+§16-7+§18-1: 商人の装備区画(指名買いカタログ)の1枚。
// defId=null は売り切れ(特殊装備 or 最上段到達)を表す=押せない。
type EquipShopEntry = {
  key: string;
  slot: EquipSlot;
  defId: string | null;
  name: string;
  description: string;
  cost: number;
  disabled: boolean;
};

const ammoLabel: Record<AmmoType, string> = {
  handgun: 'ハンドガン弾',
  shotgun: 'ショットガン弾',
  rifle: 'ライフル弾',
  phill: 'ＰＨＩＬＬ弾',
  glauncher: 'ライフル弾' // グレネードガンはライフル弾共用(v0.25.3290)
};

const ammoShopKey: Record<AmmoType, ShopItemKey> = {
  handgun: 'ammo-handgun',
  shotgun: 'ammo-shotgun',
  rifle: 'ammo-rifle',
  phill: 'ammo-phill',
  glauncher: 'ammo-rifle'
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
      subWeaponLevels: state.player.subWeaponLevels,
      ammoHandgun: state.player.ammoHandgun,
      ammoShotgun: state.player.ammoShotgun,
      ammoRifle: state.player.ammoRifle,
      ammoPhill: state.player.ammoPhill,
      equipment: state.player.equipment // 商人の装備区画用(購入時以外は同一参照=再描画規律)
    }),
    shallow
  );
  // 弾がMAXのタイプは購入不可(disabled)。
  const ammoNow: Record<AmmoType, number> = {
    handgun: player.ammoHandgun, shotgun: player.ammoShotgun, rifle: player.ammoRifle, phill: player.ammoPhill,
    glauncher: player.ammoRifle
  };
  const ammoPickupAmounts = useGameStore(state => state.ammoPickupAmounts);
  const unlockedShopSkillCards = useGameStore(state => state.unlockedShopSkillCards);
  const vaccinePurchased = useGameStore(state => state.vaccinePurchased);
  const buyShopItem = useGameStore(state => state.buyShopItem);
  const buySkillCardFromShop = useGameStore(state => state.buySkillCardFromShop);
  const buyEquipmentFromShop = useGameStore(state => state.buyEquipmentFromShop);
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
  const ammoEntries = ammoTypes.map(type => {
    const maxed = ammoNow[type] >= AMMO_MAX[type];
    return {
      key: ammoShopKey[type],
      name: ammoLabel[type],
      description: maxed ? 'MAX' : `+${shopAmmoAmount(type, ammoPickupAmounts)}発`, // 商人量(handgun25/rifle15・v0.25.2168)
      cost: SHOP_AMMO_COST,
      ammoType: type,
      disabled: maxed
    };
  });
  const skillEntries: SkillShopEntry[] = (Object.entries(unlockedShopSkillCards) as [SubWeaponKey, number][])
    // キャラ固有サブウェポン(職スキル枠)は他クラスの分は扱わないが、**自分が装備している固定サブは陳列する**
    // (社長指示v0.25.3322→v0.25.3440「最初から上限まで解放(ゲームプレイ中レベル上げれる)」。
    //  v3322でrunShopUnlocksに陳列Lv3を積んだが、この除外フィルタが残っていて一度も商人に並んで
    //  いなかった=ラン中に固定サブのLvを上げる手段が無かった)。
    .filter(([skillKey, unlockedLevel]) => unlockedLevel > 0
      && (!CHARACTER_SUBWEAPON_KEYS.includes(skillKey) || player.subWeapons.includes(skillKey)))
    .map(([skillKey, unlockedLevel]) => {
      const currentLevel = player.subWeaponLevels[skillKey] ?? 0;
      const cappedUnlock = Math.min(3, Math.max(0, unlockedLevel));
      const maxedForStock = currentLevel >= cappedUnlock || currentLevel >= 3;
      return {
        key: `skill-${skillKey}` as const,
        skillKey,
        // 社長指示v0.25.3440(表記): 陳列上限で頭打ちの時に「MAX」と書くと真の上限(Lv3)と紛らわしい。
        // 本当のLv3だけMAX表記、陳列上限止まりは現在Lvをそのまま出す(グレーアウトで買えないのは見て分かる)。
        name: `${subWeaponDisplayName(skillKey)} ${currentLevel >= 3 ? 'MAX'
          : maxedForStock ? `Lv${currentLevel}` : `Lv${currentLevel + 1}`}`,
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
      description: player.health >= player.maxHealth ? '満タン' : '即時にHP30%回復',
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

  // SKILL_BUILD_REDESIGN.md §13-1+§16-7+§18-1: 商人の装備区画(指名買いカタログ・棚は生成しない)。
  // 未装備スロット=両系統Tier1を2枚/装備済み(Tier<5)=次の一段1枚/特殊 or 最上段=売り切れ表示。
  const equipEntries: EquipShopEntry[] = merchantEquipShelf(player.equipment).flatMap((step): EquipShopEntry[] => {
    if (step.kind === 'sold-out') {
      const cur = equipmentById(player.equipment[step.slot]);
      return [{
        key: `equip-${step.slot}-soldout`, slot: step.slot, defId: null,
        name: cur?.name ?? '???', description: '売り切れ', cost: 0, disabled: true,
      }];
    }
    const defs = step.kind === 'next' ? [step.def] : step.options;
    return defs.map((def): EquipShopEntry => {
      const cost = EQUIP_SHOP_COST_BY_TIER[def.tier - 1] ?? Infinity;
      return {
        key: `equip-${step.slot}-${def.id}`, slot: step.slot, defId: def.id,
        name: def.name, description: equipmentDescription(def), cost, disabled: player.straps < cost,
      };
    });
  });

  const handleBuyEquip = (entry: EquipShopEntry) => {
    playSfx('ui-select');
    if (entry.disabled || !entry.defId) return;
    buyEquipmentFromShop(entry.slot, entry.defId);
  };

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
      <div className="relative glass-panel rounded-none w-full max-w-lg overflow-hidden">
        <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-amber-200/65">WEAPON MERCHANT</div>
            <h2 className="text-xl font-bold text-white">武器商人</h2>
          </div>
          <div className="rounded-none bg-amber-300/12 px-3 py-1 text-right">
            <div className="text-[9px] tracking-widest text-amber-100/60">SCRAP</div>
            <div className="text-lg font-black text-amber-100 tabular-nums">{player.straps}s</div>
          </div>
        </div>

        <div className="px-4 pb-3 grid grid-cols-2 gap-2">
          {entries.map(entry => {
            const canBuy = !entry.disabled && player.straps >= entry.cost;
            return (
              <button
                key={`${entry.key}-${('ammoType' in entry ? entry.ammoType : undefined) ?? ''}`}
                onClick={() => handleBuy(entry)}
                disabled={!canBuy}
                className={`rounded-none border px-3 py-2 text-left transition ${
                  canBuy
                    ? 'bg-purple-400/8 border-purple-400/15 active:scale-[0.98]'
                    : 'bg-purple-400/[0.03] border-purple-400/8 opacity-45'
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

        <div className="px-4 pb-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-amber-200/55 mb-1.5">装備</div>
          <div className="grid grid-cols-2 gap-2">
            {equipEntries.map(entry => {
              const canBuy = !entry.disabled;
              return (
                <button
                  key={entry.key}
                  onClick={() => handleBuyEquip(entry)}
                  disabled={!canBuy}
                  className={`rounded-none border px-3 py-2 text-left transition ${
                    canBuy
                      ? 'bg-purple-400/8 border-purple-400/15 active:scale-[0.98]'
                      : 'bg-purple-400/[0.03] border-purple-400/8 opacity-45'
                  }`}
                >
                  {/* 社長指示v0.25.3462「装備が売ってるところ、ちゃんと装備の絵を表示して」:
                      レベルアップ画面(UpgradeMenu)と同じ作法で、専用アイコンがあれば画像・
                      無ければ絵文字(特殊=🏯/通常=🛡️)にフォールバックする。 */}
                  <div className="flex items-start gap-2">
                    <div className="w-11 h-11 shrink-0 flex items-center justify-center overflow-hidden bg-purple-400/10 text-xl">
                      {entry.defId && hasEquipIcon(entry.defId)
                        ? (
                          <img
                            src={spritePath(equipIconName(entry.defId))}
                            alt=""
                            className="w-full h-full object-contain"
                            style={{ imageRendering: 'pixelated' }}
                            draggable={false}
                          />
                        )
                        : (equipmentById(entry.defId)?.special ? '🏯' : '🛡️')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-white truncate">{entry.name}</div>
                      <div className="text-[10px] leading-tight text-white/50">{entry.description}</div>
                    </div>
                    <div className="text-[12px] font-black text-amber-200 tabular-nums whitespace-nowrap">
                      {entry.defId === null ? '—' : `${entry.cost}s`}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {sellTarget && (
          <div className="px-4 pb-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-amber-200/55 mb-1.5">サブウェポン換金</div>
            <button
              onClick={() => handleSell(sellTarget)}
              className="w-full rounded-none border px-3 py-2 text-left transition bg-purple-400/8 border-purple-400/15 active:scale-[0.98]"
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
            className="w-full rounded-none bg-amber-400/15 py-2.5 text-sm font-bold text-amber-100"
          >
            帰還する
            <span className="block text-[10px] font-normal text-amber-100/70">装備を1つ持ち帰り撤収（スコア計上・進行/クリアボーナスなし）</span>
          </button>
          <button
            onClick={closeShop}
            className="w-full rounded-none bg-purple-400/10 py-3 text-sm font-bold text-white/90"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShopMenu;
