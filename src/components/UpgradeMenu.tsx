import React, { useState } from 'react';
import { useGameStore, activeConsumableCount } from '../store/gameStore';
import { playSfx } from '../audio/audioManager';
import { hasEquipIcon, equipIconName, equipmentById } from '../data/equipment';
import { spritePath } from '../utils/spriteLoader';
import { SKILLS, RARITY_LABEL } from '../data/campaign';
import { runBuildCapacity, rerollPrice, MAX_BANISH_PER_RUN } from '../utils/runSkillDraft';
import type { UpgradeOption } from '../types/game';

// SKILL_BUILD_REDESIGN.md §17-1点3/§16-10 ★C: スキルカードのレア度バッジ色。
const SKILL_RARITY_BADGE: Record<'normal' | 'rare' | 'super', string> = {
  normal: 'bg-slate-400/30 text-slate-100',
  rare: 'bg-purple-600/30 text-purple-100',
  super: 'bg-amber-400/30 text-amber-100',
};

// 装備アイコン1個(画像が無ければ絵文字フォールバック=特殊は🏯/通常は🛡️)。確認ダイアログ用。
const EquipIcon: React.FC<{ defId: string }> = ({ defId }) => {
  const def = equipmentById(defId);
  const img = hasEquipIcon(defId) ? spritePath(equipIconName(defId)) : null;
  return (
    <div className="w-16 h-16 rounded-none flex items-center justify-center text-3xl overflow-hidden bg-purple-400/10">
      {img
        ? <img src={img} alt="" className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
        : (def?.special ? '🏯' : '🛡️')}
    </div>
  );
};

const UpgradeMenu: React.FC = () => {
  const upgradeOptions = useGameStore(state => state.upgradeOptions);
  const selectUpgrade = useGameStore(state => state.selectUpgrade);
  // SKILL_BUILD_REDESIGN.md §17-1点3: スキル専業レベルアップの残枠表示+リロール/バニッシュ。
  // React再描画規律: いずれも「毎フレーム変わらない」プリミティブ/小配列だけを購読する
  // (upgradeOptions自体も既存どおりレベルアップ時にしか変わらない)。
  const runBuild = useGameStore(state => state.runBuild);
  const straps = useGameStore(state => state.player.straps);
  const rerollsUsedThisRun = useGameStore(state => state.rerollsUsedThisRun);
  const vanishedCount = useGameStore(state => state.vanishedSkills.length);
  const rerollUpgradeOptions = useGameStore(state => state.rerollUpgradeOptions);
  const banishSkillFromRun = useGameStore(state => state.banishSkillFromRun);
  // SKILL_BUILD_REDESIGN.md §23-2条件1: ノーマル枠の残り表示は消費中バフの占有分も含める(派生した
  // プリミティブ数値だけを購読=React再描画規律。s.playerの参照は毎フレーム変わるがこの値自体は
  // メニュー表示中(ポーズ中でgameTimeが進まない)は変わらない)。
  const activeConsumables = useGameStore(s => activeConsumableCount(s.player, s.gameTime));
  const isSkillDraft = upgradeOptions.some(o => o.type === 'skill');
  const rerollCost = rerollPrice(rerollsUsedThisRun);
  const canReroll = straps >= rerollCost;
  const canBanish = vanishedCount < MAX_BANISH_PER_RUN;
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
      className="fixed inset-0 z-50 flex items-center justify-center px-6 upgrade-menu-backdrop"
      style={{ background: 'rgba(11, 11, 18, 0.55)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
    >
      <div className="glass-panel rounded-none w-full max-w-md overflow-hidden upgrade-menu-panel flex flex-col max-h-[88dvh]">
        <div className="px-5 pt-5 pb-3 text-center shrink-0 relative">
          <h2 className="text-xl font-semibold tracking-tight text-white">レベルアップ</h2>
          <p className="text-xs text-white/60 mt-1">強化を選んでください</p>
          {/* 所持スクラップ(社長指示v0.25.3276)。リロール代の判断材料なので常時見せる。 */}
          <span className="absolute right-4 top-5 text-[12px] text-white/75 tabular-nums">🔩 {straps}</span>
        </div>
        <div className="px-3 pb-4 flex flex-col gap-2 overflow-y-auto min-h-0 overscroll-contain touch-pan-y">
          {upgradeOptions.map(upgrade => {
            // SKILL_BUILD_REDESIGN.md §12-1/§17-1点3: スキル専業レベルアップ(新規取得 or Lv+1)。
            // 既存の装備/scrap/heal/knifeカードとは別レイアウト(レア度バッジ+残枠+除外ボタン)。
            if (upgrade.type === 'skill' && upgrade.skillKey) {
              const rarity = upgrade.skillRarity ?? 'normal';
              const isNew = upgrade.skillCardKind === 'new';
              // §23-2条件1: ノーマル枠は消費中バフの占有分も差し引く(枠会計をUIにも反映)。
              const occupiedExtra = rarity === 'normal' ? activeConsumables : 0;
              const remaining = Math.max(0, runBuildCapacity(rarity) - runBuild.filter(k => SKILLS[k].rarity === rarity).length - occupiedExtra);
              const skillKey = upgrade.skillKey;
              return (
                <div
                  key={upgrade.id}
                  className="flex items-start gap-2 rounded-none bg-purple-400/5 p-3 upgrade-menu-option"
                >
                  <button
                    type="button"
                    onClick={() => handleSelect(upgrade)}
                    className="flex-1 min-w-0 text-left flex items-start gap-3 active:opacity-70"
                  >
                    <div className="w-9 h-9 shrink-0 rounded-none flex items-center justify-center text-base bg-purple-400/10">✨</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <h3 className="text-[15px] font-semibold text-white truncate">{upgrade.name}</h3>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${SKILL_RARITY_BADGE[rarity]}`}>
                          {isNew ? `NEW・${RARITY_LABEL[rarity]}` : `Lv${upgrade.skillFromLv}→${upgrade.skillLv}`}
                        </span>
                      </div>
                      <p className="text-[12px] text-white/70 leading-snug mt-0.5">{upgrade.description}</p>
                      {isNew && (
                        <p className="text-[10px] text-white/40 mt-1">{RARITY_LABEL[rarity]}枠 残り{remaining}</p>
                      )}
                    </div>
                  </button>
                  <button
                    type="button"
                    disabled={!canBanish}
                    onClick={() => { if (canBanish) { playSfx('ui-select'); banishSkillFromRun(skillKey); } }}
                    className="shrink-0 self-start text-[10px] px-2 py-1 rounded-none bg-rose-500/15 text-rose-200/80 active:bg-rose-500/30 disabled:opacity-30"
                  >
                    除外
                  </button>
                </div>
              );
            }
            // SKILL_BUILD_REDESIGN.md §23: 消費カード(取得で即発動・60秒・ノーマル枠を1つ占有)。
            // バニッシュ対象外(vanishedSkillsはSkillKey専用の仕組みなので混ぜない)。
            if (upgrade.type === 'consumable' && upgrade.consumableKey) {
              const remaining = Math.max(0, runBuildCapacity('normal') - runBuild.filter(k => SKILLS[k].rarity === 'normal').length - activeConsumables);
              return (
                <button
                  key={upgrade.id}
                  type="button"
                  onClick={() => handleSelect(upgrade)}
                  className="text-left p-3 rounded-none active:bg-amber-400/10 transition-colors flex items-start gap-3 upgrade-menu-option bg-amber-400/5"
                >
                  <div className="w-9 h-9 shrink-0 rounded-none flex items-center justify-center text-base bg-amber-400/10">⏱️</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <h3 className="text-[15px] font-semibold text-white truncate">{upgrade.name}</h3>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-400/25 text-amber-100 shrink-0">
                        60秒
                      </span>
                    </div>
                    <p className="text-[12px] text-white/70 leading-snug mt-0.5">{upgrade.description}</p>
                    <p className="text-[10px] text-white/40 mt-1">{RARITY_LABEL.normal}枠 残り{remaining}</p>
                  </div>
                </button>
              );
            }
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
                className={`text-left p-3 rounded-none active:bg-purple-400/10 transition-colors flex items-start gap-3 upgrade-menu-option ${isSpecial ? 'bg-amber-400/10' : 'bg-purple-400/5'}`}
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
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-400/30 text-amber-100 shrink-0">
                        特殊
                      </span>
                    ) : upgrade.type === 'equipment' ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-600/30 text-purple-100 shrink-0">
                        R{upgrade.level}
                      </span>
                    ) : upgrade.type === 'knife' ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/30 text-rose-100 shrink-0">
                        T{upgrade.level}
                      </span>
                    ) : upgrade.type === 'weapon' && upgrade.level > 1 ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-600/30 text-purple-100 shrink-0">
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
        {/* SKILL_BUILD_REDESIGN.md §16-10 ★C: リロール(有料・全引き直し)。スキル専業画面でのみ出す
            (装備3択=ボスドロップ宝箱にはリロール/バニッシュを作らない=既存仕様のまま)。 */}
        {isSkillDraft && (
          <div className="px-3 pb-4 shrink-0">
            <button
              type="button"
              disabled={!canReroll}
              onClick={() => { if (canReroll) { playSfx('ui-select'); rerollUpgradeOptions(); } }}
              className="w-full py-2.5 rounded-none bg-purple-400/10 text-white/85 font-semibold text-[13px] tracking-wide active:bg-purple-400/20 disabled:opacity-30"
            >
              リロール({rerollCost} スクラップ)
            </button>
          </div>
        )}
      </div>

      {/* 既装備の部位を別系統で上書きする時だけ: 現装備→新装備 のアイコンを見せて YES/NO で確認(テキストなし)。 */}
      {confirm && (
        <div
          className="absolute inset-0 z-[60] flex items-center justify-center px-6"
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
                className="flex-1 py-2.5 rounded-none bg-purple-400/10 text-white/90 font-bold tracking-wide active:bg-purple-400/20"
              >
                NO
              </button>
              <button
                type="button"
                onClick={() => commit(confirm.upgrade)}
                className="flex-1 py-2.5 rounded-none bg-amber-400/25 text-amber-100 font-bold tracking-wide active:bg-amber-400/40"
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
