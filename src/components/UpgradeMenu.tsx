import React, { useState } from 'react';
import { shallow } from 'zustand/shallow';
import NoBounceScroller from './NoBounceScroller';
import { useGameStore, activeConsumableCount } from '../store/gameStore';
import { playSfx } from '../audio/audioManager';
import { hasEquipIcon, equipIconName, equipmentById } from '../data/equipment';
import { spritePath } from '../utils/spriteLoader';
// v0.25.3499: スキルの1枚シート(入っていればドット絵アイコン、無ければ従来の絵文字)。
import { useSkillIconSheet, type SkillIconSheet } from '../utils/useSkillIconSheet';
import { skillIconStyle, hasSkillIcon, skillSingleIconName } from '../data/skillIcons';
import { SKILLS, RARITY_LABEL, skillIcon, shownOwnedSkillLevels } from '../data/campaign';
import { runBuildCapacity, rerollPrice, MAX_BANISH_PER_RUN } from '../utils/runSkillDraft';
import { runSkillDisplayCap, skillLevelTone } from '../utils/runSkillLevelLabel';
import { levelUpLayout, levelUpTier } from '../utils/levelUpOrder';
import './levelUp.css';
import type { SkillKey } from '../types/game';
import type { UpgradeOption } from '../types/game';
import { PixelIcon } from './PixelIcon';
import { statBadge } from '../utils/upgradeUtils';

// 取得済みの段のレア度の縁(P3: レアは鋼色・超レアは琥珀。紫はカウンターできない攻撃の色なので使わない)。
const OWNED_RING: Record<'normal' | 'rare' | 'super', string> = {
  normal: 'border-white/25',
  rare: 'border-[#a9bccd]/80',
  super: 'border-amber-300/80',
};

// P3 の落ち方(ms / px)。レベルアップの窓自体は Game.tsx が 450ms 遅らせて出す。
// - 落差はカード1枚の高さの半分以上。落ちる(加速)→床で一度沈んで戻る(慣性の受け)。
// - 間は不均等: 1枚ごとに少しずつ間が延び、最後の1枚だけ一拍溜めてから、より高く・より長く落ちて深く沈む(重い1枚)。
const DROP_FIRST_MS = 60;
const DROP_GAP_MS = 130;      // 1枚目→2枚目の間。以後1枚ごとに +DROP_GAP_GROW
const DROP_GAP_GROW = 30;
const DROP_LAST_BEAT_MS = 260; // 最後の1枚の前の溜め
const DROP_MS = 400;
const DROP_LAST_MS = 560;
const DROP_FALL_PX = 76;
const DROP_LAST_FALL_PX = 132;
const DROP_IMPACT = 0.7;      // 落ちる長さのうち、床に届く位置(levelUp.css の lvup-drop の 70% と同じ)
const isLastDrop = (i: number, n: number) => n > 1 && i === n - 1;
const dropStartMs = (i: number, n: number) => {
  let t = DROP_FIRST_MS;
  for (let k = 0; k < i; k++) t += DROP_GAP_MS + k * DROP_GAP_GROW;
  return t + (isLastDrop(i, n) ? DROP_LAST_BEAT_MS : 0);
};
const dropLandMs = (i: number, n: number) => dropStartMs(i, n) + Math.round((isLastDrop(i, n) ? DROP_LAST_MS : DROP_MS) * DROP_IMPACT);

// 超レアの着地で弾ける火の粉。並びは選択肢から決まる擬似乱数(開くたびに散り方が違う・描画は純粋なまま)。
// x=カード幅の% / y=上辺より上は px(負)、縁からは高さの% / dx,dy=流れ / lag=弾ける遅れ / s=大きさ / dur=燃え尽きるまで。
type Ember = { x: number; y: string; dx: number; dy: number; lag: number; s: number; dur: number };
const makeEmbers = (seedText: string): Ember[] => {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 16777619);
  const rnd = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  const out: Ember[] = [];
  for (let k = 0; k < 18; k++) {
    // 多くは上辺から、いくつかは左右の縁から。左寄り(光のにじみの芯)を厚めに。
    const edge = k < 13 ? 'top' : k < 16 ? 'left' : 'right';
    out.push({
      // 左右の縁から出る粉は内へ寄りながら昇る(列の外は切れて見えないため)。
      x: edge === 'top' ? Math.pow(rnd(), 1.4) * 96 : edge === 'left' ? 1 : 97,
      y: edge === 'top' ? `${-4 - Math.round(rnd() * 10)}px` : `${10 + Math.round(rnd() * 70)}%`,
      dx: edge === 'left' ? 4 + rnd() * 18 : edge === 'right' ? -(4 + rnd() * 18) : (rnd() < 0.5 ? -1 : 1) * (6 + rnd() * 30),
      dy: -(46 + rnd() * 70),
      lag: Math.round(rnd() * 280),
      s: 3 + Math.round(rnd() * 3),
      dur: 1100 + Math.round(rnd() * 900),
    });
  }
  return out;
};

// 装備アイコン1個(画像が無ければドット絵アイコン=特殊は sparkles/通常は shield)。確認ダイアログ用。
const EquipIcon: React.FC<{ defId: string }> = ({ defId }) => {
  const def = equipmentById(defId);
  const img = hasEquipIcon(defId) ? spritePath(equipIconName(defId)) : null;
  return (
    <div className="w-16 h-16 rounded-none flex items-center justify-center overflow-hidden bg-white/5 text-white/70">
      {img
        ? <img src={img} alt="" className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
        : <PixelIcon name={def?.special ? 'sparkles' : 'shield'} size={30} />}
    </div>
  );
};

// スキルアイコン1個: ①単体ファイルのアイコン(POI報酬3種) ②1枚シート ③絵文字、の順に優先。
const SkillGlyph: React.FC<{ skillKey: SkillKey; size: number; sheet: SkillIconSheet | null }> = ({ skillKey, size, sheet }) => {
  const single = skillSingleIconName(skillKey);
  if (single) return <img src={spritePath(single)} alt="" className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />;
  const st = sheet && hasSkillIcon(skillKey) ? skillIconStyle(skillKey, sheet.url, size, sheet) : null;
  return st ? <span style={st} aria-hidden /> : <>{skillIcon(skillKey)}</>;
};

const UpgradeMenu: React.FC = () => {
  const skillSheet = useSkillIconSheet(); // v0.25.3499: 素材が無ければ null=絵文字のまま
  const upgradeOptions = useGameStore(state => state.upgradeOptions);
  const selectUpgrade = useGameStore(state => state.selectUpgrade);
  // SKILL_BUILD_REDESIGN.md §17-1点3: スキル専業レベルアップの残枠表示+リロール/バニッシュ。
  // React再描画規律: いずれも「毎フレーム変わらない」プリミティブ/小配列だけを購読する
  // (upgradeOptions自体も既存どおりレベルアップ時にしか変わらない)。
  const runBuild = useGameStore(state => state.runBuild);
  // 社長指示2026-11-12: 上部の「取得済み」段。runBuild(取得順)に並ぶ各スキルの今のLvと、
  // この出撃で届く上限(所持Lvが天井=runLevelCap)。数値だけの小配列を shallow で購読する。
  const ownedRunLevels = useGameStore(s => s.runBuild.map(k => s.player.skillLevels?.[k] ?? 1), shallow);
  const ownedRunCaps = useGameStore(s => s.runBuild.map(k => runSkillDisplayCap(k, s.player.skillLevels?.[k] ?? 1, shownOwnedSkillLevels(s.ownedSkillLevels))), shallow);
  const straps = useGameStore(state => state.player.straps);
  const playerLevel = useGameStore(state => state.player.level);
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

  // ---- P3: カードの落ち方(research/UIUX_PROPOSAL.md P3)。見せる順だけを変える(抽選の中身は levelUpOrder が触らない)。----
  const layout = levelUpLayout(upgradeOptions);
  const cardCount = layout.cards.length;
  const lastLandMs = cardCount > 0 ? dropLandMs(cardCount - 1, cardCount) : 0;
  const embers = React.useMemo(() => makeEmbers(upgradeOptions.map(o => o.id).join('|')), [upgradeOptions]);
  // 落ち始めの時刻。選択肢が入れ替わったら(リロール)最初から落とし直す。
  const dropStartRef = React.useRef(0);
  const landedRef = React.useRef(false);
  const [landed, setLanded] = useState(false);
  React.useLayoutEffect(() => {
    dropStartRef.current = performance.now();
    landedRef.current = false;
    setLanded(false);
  }, [upgradeOptions]);
  // 押した時点で「まだ姿を見せていなかったカード」だけは、その1回の押しを着地に使う(見えていない物を選ばせない)。
  // 見えているカード(落ちている途中を含む)は押した瞬間に選べる=操作を待たせない。
  const pressRef = React.useRef<{ t: number; wasLanded: boolean } | null>(null);
  const onPressCapture = () => {
    const t = performance.now() - dropStartRef.current;
    pressRef.current = { t, wasLanded: landedRef.current };
    if (!landedRef.current && t < lastLandMs) { landedRef.current = true; setLanded(true); }
  };
  const cardWasHidden = (i: number): boolean => {
    const p = pressRef.current;
    pressRef.current = null; // 1回の押しにつき1回だけ見る(キー/パッドの決定=押しの記録なし=そのまま通す)
    return p !== null && !p.wasLanded && p.t < dropStartMs(i, cardCount);
  };
  const dropVars = (i: number): React.CSSProperties => {
    const heavy = isLastDrop(i, cardCount);
    return {
      '--lvup-delay': `${dropStartMs(i, cardCount)}ms`, '--lvup-land': `${dropLandMs(i, cardCount)}ms`,
      '--lvup-dur': `${heavy ? DROP_LAST_MS : DROP_MS}ms`,
      '--lvup-fall': `${-(heavy ? DROP_LAST_FALL_PX : DROP_FALL_PX)}px`,
      '--lvup-sink': `${heavy ? 9 : 4}px`,
    } as React.CSSProperties;
  };
  // 残りの枠は少ない時(1〜2)だけ言う。
  const slotsLeft = (n: number) => (n >= 1 && n <= 2 ? `あと${n}枠` : '');

  // カード1枚の中身(スキル/消費/装備・その他)。外枠と光は下の map が付ける。
  const renderCardBody = (upgrade: UpgradeOption, i: number): React.ReactNode => {
    const pick = (fn: () => void) => () => { if (cardWasHidden(i)) return; fn(); };
    // SKILL_BUILD_REDESIGN.md §12-1/§17-1点3: スキル専業レベルアップ(新規取得 or Lv+1)。レア度+残枠+除外。
    if (upgrade.type === 'skill' && upgrade.skillKey) {
      const rarity = upgrade.skillRarity ?? 'normal';
      const isNew = upgrade.skillCardKind === 'new';
      // §23-2条件1: ノーマル枠は消費中バフの占有分も差し引く(枠会計をUIにも反映)。
      const occupiedExtra = rarity === 'normal' ? activeConsumables : 0;
      const remaining = Math.max(0, runBuildCapacity(rarity) - runBuild.filter(k => SKILLS[k].rarity === rarity).length - occupiedExtra);
      const skillKey = upgrade.skillKey;
      return (
        <>
          <button type="button" onClick={pick(() => handleSelect(upgrade))} className="lvup-pick">
            <span className="lvup-well"><SkillGlyph skillKey={skillKey} size={44} sheet={skillSheet} /></span>
            <span className="lvup-body">
              <span className="lvup-nm"><span>{upgrade.name}</span>
                <span className="lvup-rar">{isNew ? <>NEW<b>{RARITY_LABEL[rarity]}</b></> : `Lv${upgrade.skillFromLv}→${upgrade.skillLv}`}</span>
              </span>
              <span className="lvup-ds block">{upgrade.description}</span>
              <span className="lvup-foot block">{isNew ? slotsLeft(remaining) : ''}</span>
            </span>
          </button>
          <button
            type="button"
            disabled={!canBanish}
            onClick={pick(() => { if (canBanish) { playSfx('ui-select'); banishSkillFromRun(skillKey); } })}
            className="lvup-ban"
          >
            <span>除外</span>
          </button>
        </>
      );
    }
    // SKILL_BUILD_REDESIGN.md §23: 消費カード(取得で即発動・60秒・ノーマル枠を1つ占有)。除外の対象外。
    if (upgrade.type === 'consumable' && upgrade.consumableKey) {
      const remaining = Math.max(0, runBuildCapacity('normal') - runBuild.filter(k => SKILLS[k].rarity === 'normal').length - activeConsumables);
      return (
        <button type="button" onClick={pick(() => handleSelect(upgrade))} className="lvup-pick">
          <span className="lvup-well"><PixelIcon name="clock" size={26} /></span>
          <span className="lvup-body">
            <span className="lvup-nm"><span>{upgrade.name}</span><span className="lvup-rar">60秒</span></span>
            <span className="lvup-ds block">{upgrade.description}</span>
            <span className="lvup-foot block">{slotsLeft(remaining)}</span>
          </span>
        </button>
      );
    }
    // 装備=特殊(level0)は琥珀の縁(超レアと同じ段)、通常はランク表示。
    const isSpecial = upgrade.type === 'equipment' && upgrade.level === 0;
    const icon = upgrade.type === 'heal' ? '❤️'
      : upgrade.type === 'stat' ? <PixelIcon name={upgrade.statKind === 'hp' ? 'heart' : 'swords'} size={22} />
      : upgrade.type === 'knife' ? '🔪'
      : upgrade.type === 'equipment' ? <PixelIcon name={isSpecial ? 'sparkles' : 'shield'} size={26} />
      : upgrade.type === 'weapon' ? '⚔️' : '🔮';
    // 装備に専用アイコン素材があれば実画像、無ければ絵文字フォールバック。
    const iconImg = upgrade.type === 'equipment' && hasEquipIcon(upgrade.equipDefId)
      ? spritePath(equipIconName(upgrade.equipDefId!))
      : null;
    const badge = upgrade.type === 'stat' && upgrade.statKind ? statBadge(upgrade.statKind)
      : isSpecial ? '特殊'
      : upgrade.type === 'equipment' ? `R${upgrade.level}`
      : upgrade.type === 'knife' ? `T${upgrade.level}`
      : upgrade.type === 'weapon' && upgrade.level > 1 ? `Lv${upgrade.level}`
      : null;
    return (
      <button type="button" onClick={pick(() => handleSelect(upgrade))} className="lvup-pick">
        <span className="lvup-well">
          {iconImg
            ? <img src={iconImg} alt="" className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
            : icon}
        </span>
        <span className="lvup-body">
          <span className="lvup-nm"><span>{upgrade.name}</span>{badge && <span className="lvup-rar">{badge}</span>}</span>
          <span className="lvup-ds block">{upgrade.description}</span>
        </span>
      </button>
    );
  };

  return (
    <div className="lvup-backdrop">
      <div className={`lvup-col ${landed ? 'is-landed' : ''}`} onPointerDownCapture={onPressCapture}>
        <div className="lvup-head">
          {/* 題字の横にレベルの数字を大きく(小見出し・飾り線は置かない)。 */}
          <h2 className="lvup-title">レベルアップ<span className="lvup-lv tabular-nums" aria-label={`レベル${playerLevel}`}>{playerLevel}</span></h2>
          {/* 所持スクラップ(社長指示v0.25.3276)。リロール代の判断材料なので常時見せる。 */}
          <span className="lvup-scrap tabular-nums">
            <img src={spritePath('scrap-icon')} alt="" className="w-[15px] h-[15px] object-contain shrink-0" style={{ imageRendering: 'pixelated' }} draggable={false} />
            {straps}
          </span>
        </div>
        {/* 社長指示2026-11-12: 取得済みスキル(取得順)。各アイコン+「今のLv/この出撃で届く上限」。上限に達したら今のLvを琥珀。 */}
        {isSkillDraft && runBuild.length > 0 && (
          <div className="lvup-owned">
            <p className="lvup-owned-cap">取得済み</p>
            <div className="flex flex-row flex-wrap gap-x-3 gap-y-1.5">
              {runBuild.map((k, i) => {
                const lv = ownedRunLevels[i] ?? 1;
                const cap = ownedRunCaps[i] ?? 1;
                const atMax = skillLevelTone(lv, cap) === 'max';
                return (
                  <div key={k} className="inline-flex items-center gap-1" title={SKILLS[k].name}>
                    <span className={`w-5 h-5 shrink-0 flex items-center justify-center text-[11px] leading-none border ${OWNED_RING[SKILLS[k].rarity]} bg-white/5 overflow-hidden`}>
                      <SkillGlyph skillKey={k} size={18} sheet={skillSheet} />
                    </span>
                    <span className="text-[11px] tabular-nums leading-none">
                      <span className={`font-bold ${atMax ? 'ui-acc-text' : 'text-white'}`}>{lv}</span>
                      <span className="text-white/40">/{cap}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {/* 続き下矢印+縁バウンス殺し(UI監査2026-08-29でNoBounceScrollerを展開・選択肢の見逃し対策) */}
        <NoBounceScroller moreColor="rgba(235, 232, 225, 0.55)" className="min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain touch-pan-y no-scrollbar">
          {/* 重い1枚の着地で、列ごと一度だけ受けて沈む(--lvup-jolt=その着地の時刻)。 */}
          <div className={`lvup-list ${cardCount > 1 ? 'lvup-list--jolt' : ''}`} style={{ '--lvup-jolt': `${lastLandMs}ms` } as React.CSSProperties}>
            {layout.cards.map((upgrade, i) => {
              const tier = levelUpTier(upgrade);
              const flash = i === layout.flashIndex ? tier : null;
              return (
                <div key={upgrade.id} className="lvup-slot" style={dropVars(i)}>
                  <div className={`lvup-card lvup-card--${tier} lvup-drop`}>
                    {flash === 'super' && <>
                      <span className="lvup-fx lvup-bloom" />
                      <span className="lvup-fx lvup-streak" />
                      {embers.map((e, k) => (
                        <span key={k} className="lvup-fx lvup-ember" style={{
                          left: `${e.x}%`, top: e.y, width: e.s, height: e.s,
                          '--e-dx': `${e.dx}px`, '--e-dy': `${e.dy}px`, '--e-lag': `${e.lag}ms`, '--e-dur': `${e.dur}ms`,
                        } as React.CSSProperties} />
                      ))}
                    </>}
                    {flash && <span className={`lvup-fx lvup-edge lvup-edge--${flash}`} />}
                    {renderCardBody(upgrade, i)}
                  </div>
                </div>
              );
            })}
          </div>
        </NoBounceScroller>
        {(layout.fillers.length > 0 || isSkillDraft) && (
          <div className="lvup-tail" style={{ '--lvup-tail': `${Math.max(0, lastLandMs - 200)}ms` } as React.CSSProperties}>
            {layout.fillers.map(upgrade => (
              <button key={upgrade.id} type="button" onClick={() => handleSelect(upgrade)} className="lvup-filler">
                <img src={spritePath('scrap-icon')} alt="" draggable={false} />
                <span>{upgrade.name}</span>
              </button>
            ))}
            {/* SKILL_BUILD_REDESIGN.md §16-10 ★C: リロール(有料・全引き直し)。スキル専業画面でのみ出す。 */}
            {isSkillDraft && (
              <button
                type="button"
                disabled={!canReroll}
                onClick={() => { if (canReroll) { playSfx('ui-select'); rerollUpgradeOptions(); } }}
                className="lvup-reroll"
              >
                リロール {rerollCost} スクラップ
              </button>
            )}
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
            className="glass-panel command-panel rounded-none px-6 py-6 flex flex-col items-center gap-5"
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
                className="flex-1 py-2.5 rounded-none bg-white/[0.06] text-white/90 font-bold tracking-wide active:bg-white/[0.12]"
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
