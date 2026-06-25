import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Settings, ShoppingBag, BookOpen, Swords, Volume2, VolumeX, ChevronLeft, Lock, Check, Play, Sparkles
} from 'lucide-react';
import { getBloomEnabled, setBloomEnabled } from '../config/graphics';
import { subWeaponDisplayName, useGameStore, getCarriedEquipId, type GachaPullResult } from '../store/gameStore';
import { equipmentById, equipmentDescription, equipIconName, hasEquipIcon } from '../data/equipment';
import { spritePath } from '../utils/spriteLoader';
import { rhythmIntervalForLevel } from '../config/shijin';
import { DEV_TOOLS_ENABLED } from '../config/devtools';
import type { AmmoType, CharacterClass, SubWeaponKey, SkillKey } from '../types/game';
import {
  STAGES, getStage, CHARACTER_CLASSES, SUB_WEAPON_KEYS, CHARACTER_SUBWEAPON_KEYS, SKILL_KEYS, SKILLS, MAX_EQUIPPED_SKILLS, WORLD_INTRO, BESTIARY,
  GACHA_PULL_COST, RARITY_LABEL, skillMaxLevel, skillDescForLevel,
  gachaSuperPercent, gachaPityRemaining, gachaPromotePercent, type SkillRarity, type Stage
} from '../data/campaign';
import {
  getClearedStages, isStageUnlocked, setSelectedStageId, setSelectedFreeMode, unlockAllStages, resetProgress, getStageHighScore
} from '../data/progress';
import {
  getBgmVolume, getSfxVolume, isAudioMuted, setAudioMuted, setBgmVolume, setSfxVolume, setBgmScene, playSfx
} from '../audio/audioManager';

interface MissionSelectProps {
  onStartGame: (characterClass: string) => void;
  onStartBenchmark: (characterClass: string) => void;
}

// 画面(導線): ホーム → ステージ選択 → ミッション詳細 → キャラ選択 → 装備選択 → スタート。
// ホームからはオプション / 開発施設 / 資料室 へも分岐する。UIデザインは後追い(ここは導線優先の仮UI)。
type Screen =
  | { name: 'home' }
  | { name: 'options' }
  | { name: 'weaponDev' }
  | { name: 'archive' }
  | { name: 'stageSelect' }
  | { name: 'missionDetail'; stageId: string }
  | { name: 'characterSelect'; stageId: string }
  | { name: 'loadout' };

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="screen-in h-full w-full flex flex-col items-center justify-start bg-[#0b0b12] overflow-hidden"
    style={{
      backgroundImage: `linear-gradient(rgba(8,7,14,0.6), rgba(8,7,14,0.82)), url(${import.meta.env.BASE_URL}backgrounds/title-the-one.png)`,
      backgroundSize: 'cover',
      backgroundPosition: 'center top',
      backgroundAttachment: 'local',
      paddingTop: 'max(env(safe-area-inset-top), 16px)',
      paddingBottom: 'max(calc(env(safe-area-inset-bottom) + 24px), 40px)',
      paddingLeft: 'max(env(safe-area-inset-left), 12px)',
      paddingRight: 'max(env(safe-area-inset-right), 12px)',
    }}
  >
    {/* ページ全体(背景ごと)はスクロールさせない=ブラウザっぽさの元を排除。はみ出す時は
        枠(panel)の中だけがスクロールする(スクロールバーは全要素で非表示済み・overscroll-contain)。 */}
    <div className="max-w-3xl w-full max-h-full glass-panel rounded-3xl overflow-y-auto overscroll-contain">{children}</div>
  </div>
);

const Header: React.FC<{ title: string; subtitle?: string; onBack?: () => void }> = ({ title, subtitle, onBack }) => (
  <div className="relative px-5 pt-5 pb-3 text-center border-b border-white/10">
    {onBack && (
      <button
        onClick={onBack}
        className="absolute top-3 left-3 h-9 px-2.5 rounded-xl bg-white/5 border border-white/10 text-white/80 flex items-center gap-1 active:bg-white/10"
        aria-label="戻る"
      >
        <ChevronLeft size={16} /><span className="text-[12px]">戻る</span>
      </button>
    )}
    <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
    {subtitle && <p className="text-[12px] text-white/55 mt-1">{subtitle}</p>}
  </div>
);

// スキルのレア度別カラー(装備カード枠/ガチャ結果で共用)。
const RARITY_TEXT: Record<SkillRarity, string> = {
  normal: 'text-white/60', rare: 'text-sky-300', super: 'text-amber-300',
};
const RARITY_BORDER: Record<SkillRarity, string> = {
  normal: 'border-white/10', rare: 'border-sky-400/40', super: 'border-amber-300/55',
};

const MissionSelect: React.FC<MissionSelectProps> = ({ onStartGame, onStartBenchmark }) => {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [selectedClass, setSelectedClass] = useState<CharacterClass>('warrior');
  const [freeMode, setFreeMode] = useState(false);               // 出撃がフリー(周回・会話なし)か
  // 装備(サブ/スキル)はトップの独立「装備メニュー」で選び、store に永続。出撃時に resetGame が反映。
  const equippedSubs = useGameStore(state => state.pendingLoadout);
  const equippedSkills = useGameStore(state => state.pendingSkills);
  const ownedSkills = useGameStore(state => state.ownedSkills);
  const ownedSkillLevels = useGameStore(state => state.ownedSkillLevels);
  const setPendingLoadout = useGameStore(state => state.setPendingLoadout);
  const setPendingSkills = useGameStore(state => state.setPendingSkills);
  const [cleared, setCleared] = useState<Set<string>>(() => getClearedStages());

  // タイトル曲の自動再生制限対策(初回タップで確実に再生開始)。
  useEffect(() => {
    const kick = () => setBgmScene('menu');
    window.addEventListener('pointerdown', kick, { once: true });
    return () => window.removeEventListener('pointerdown', kick);
  }, []);
  // ステージ選択へ入るたびにクリア状況を読み直す(ゲームから戻った直後の解放を反映)。
  const goStageSelect = () => { playSfx('ui-select'); setCleared(getClearedStages()); setScreen({ name: 'stageSelect' }); };

  // --- 開始処理 ---------------------------------------------------------
  const startMission = (stageId: string, charId: CharacterClass) => {
    playSfx('mission-start');
    useGameStore.getState().setDanceTestMode(false);
    setSelectedStageId(stageId);          // 勝利時にこのステージをクリア扱いにする(App側)
    setSelectedFreeMode(freeMode);        // フリー(周回)=会話なし & クリア進行に影響させない
    // 装備(サブ/スキル)はトップの装備メニューで選んだ永続値を resetGame がそのまま反映する(ここでは触らない)。
    onStartGame(charId);
  };

  // ====================================================================
  // ホーム(ミッション選択画面)
  // ====================================================================
  const renderHome = () => (
    <>
      <Header title="ミッション選択" subtitle="the ONE" />
      <div className="p-3 space-y-2">
        <HubButton icon={<Swords size={18} />} label="ステージ選択" desc="メインミッションへ出撃" onClick={goStageSelect} accent />
        <HubButton icon={<Check size={18} />} label="装備" desc={`サブウェポン1 / スキル最大${MAX_EQUIPPED_SKILLS}`} onClick={() => setScreen({ name: 'loadout' })} />
        <HubButton icon={<Settings size={18} />} label="オプション" desc="音量・各種設定" onClick={() => setScreen({ name: 'options' })} />
        <HubButton icon={<ShoppingBag size={18} />} label="開発施設" desc="スキル/サブウェポンの解放" onClick={() => setScreen({ name: 'weaponDev' })} />
        <HubButton icon={<BookOpen size={18} />} label="資料室" desc="ストーリー記録・図鑑" onClick={() => setScreen({ name: 'archive' })} />
        <p className="pt-1 text-center text-[11px] text-white/35">v{__APP_VERSION__}</p>
      </div>
    </>
  );

  // ====================================================================
  // ステージ選択
  // ====================================================================
  const renderStageSelect = () => {
    const mains = STAGES.filter(s => s.kind === 'main');
    const exs = STAGES.filter(s => s.kind === 'ex');
    return (
      <>
        <Header title="ステージ選択" subtitle="クリアで次のステージが解放される" onBack={() => setScreen({ name: 'home' })} />
        <div className="p-3 space-y-2">
          {mains.map(stage => <StageRow key={stage.id} stage={stage} />)}
          {exs.some(s => isStageUnlocked(s, cleared)) && (
            <div className="pt-2 text-[11px] uppercase tracking-widest text-fuchsia-200/60 px-1">クリア後 / 隠しステージ</div>
          )}
          {exs.map(stage => isStageUnlocked(stage, cleared)
            ? <StageRow key={stage.id} stage={stage} />
            : <LockedExHint key={stage.id} />)}
        </div>
      </>
    );
  };

  const StageRow: React.FC<{ stage: Stage }> = ({ stage }) => {
    const unlocked = isStageUnlocked(stage, cleared);
    const done = cleared.has(stage.id);
    const hiScore = getStageHighScore(stage.id);
    return (
      <button
        type="button"
        disabled={!unlocked}
        onClick={() => { playSfx('ui-select'); setScreen({ name: 'missionDetail', stageId: stage.id }); }}
        className={`w-full flex items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors ${
          unlocked ? 'border-white/12 bg-white/5 active:bg-white/10' : 'border-white/8 bg-black/25 opacity-60'
        }`}
      >
        <span className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-[12px] font-bold ${
          stage.kind === 'ex' ? 'bg-fuchsia-400/15 text-fuchsia-100'
            : stage.kind === 'free' ? 'bg-emerald-400/15 text-emerald-100'
            : 'bg-blue-400/15 text-blue-100'
        }`}>
          {stage.main.code}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-semibold text-white truncate">
            {stage.name}
            {done && <span className="ml-2 align-middle text-[10px] text-emerald-300/90">クリア済</span>}
            {unlocked && hiScore > 0 && (
              <span className="ml-2 align-middle text-[10px] text-amber-300/85 tabular-nums">HI {hiScore}</span>
            )}
          </span>
          <span className="block text-[11px] text-white/45 truncate">{stage.main.title}・{stage.area}</span>
          <span className="mt-0.5 block text-[12px] leading-snug text-white/70 truncate">
            {unlocked ? stage.main.summary : '前ステージのクリアで解放'}
          </span>
        </span>
        {unlocked ? <ChevronLeft size={16} className="rotate-180 text-white/40" /> : <Lock size={15} className="text-white/40" />}
      </button>
    );
  };

  const LockedExHint: React.FC = () => (
    <div className="w-full flex items-center gap-3 rounded-2xl border border-white/8 bg-black/25 px-3 py-3 opacity-60">
      <span className="shrink-0 w-11 h-11 rounded-xl bg-white/5 flex items-center justify-center"><Lock size={16} className="text-white/40" /></span>
      <span className="text-[12px] text-white/45">？？？（未解放）</span>
    </div>
  );

  // ====================================================================
  // ミッション詳細(メインミッションのブリーフィング + サブミッション)
  // ====================================================================
  const renderMissionDetail = (stageId: string) => {
    const stage = getStage(stageId);
    if (!stage) return null;
    const m = stage.main;
    const done = cleared.has(stage.id);
    return (
      <>
        <Header title={`${m.code}：${m.title}`} subtitle={`${stage.name} / ${stage.area}`} onBack={() => setScreen({ name: 'stageSelect' })} />
        <div className="p-3 space-y-3">
          {/* 説明欄: 未クリアは「あらすじ」、クリア後は「クリア後の記録(debrief)」を表示。 */}
          <Section label={done ? 'クリア後' : 'あらすじ'}>
            {(done ? m.debrief : m.synopsis).map((line, i) => (
              <p key={i} className="text-[13px] leading-relaxed text-white/85">{line}</p>
            ))}
          </Section>

          <Section label="サブミッション">
            {stage.subs.length === 0
              ? <p className="text-[12px] text-white/45">{stage.kind === 'free' ? 'なし（周回ミッション）' : '準備中（後日追加）'}</p>
              : stage.subs.map(s => (
                <div key={s.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="text-[13px] font-semibold text-white">{s.title}</div>
                  <div className="text-[11px] text-white/55">{s.desc}</div>
                </div>
              ))}
          </Section>

          <button
            onClick={() => { playSfx('ui-select'); setFreeMode(false); setScreen({ name: 'characterSelect', stageId }); }}
            className="w-full py-3 rounded-2xl text-base font-semibold text-white"
            style={{ background: 'linear-gradient(180deg, rgba(96,165,250,0.95), rgba(59,130,246,0.95))', boxShadow: '0 8px 24px rgba(59,130,246,0.35)' }}
          >
            出撃準備（キャラ選択へ）
          </button>

          {/* このステージのフリー(周回)出撃: 会話なし・クリア進行に影響しない。同じ舞台を周回。 */}
          <button
            onClick={() => { playSfx('ui-select'); setFreeMode(true); setScreen({ name: 'characterSelect', stageId }); }}
            className="w-full py-2.5 rounded-2xl text-[13px] font-semibold text-emerald-50 border border-emerald-300/40 bg-emerald-400/10 active:bg-emerald-400/20"
          >
            フリー（周回）で出撃 ・ 会話なし
          </button>
        </div>
      </>
    );
  };

  // ====================================================================
  // キャラクター選択
  // ====================================================================
  const renderCharacterSelect = (stageId: string) => {
    // 前ランからの持ち越し装備(localStorage)。ラン開始時に該当スロットへ自動装備される。
    const carriedDef = equipmentById(getCarriedEquipId());
    const carriedIcon = carriedDef && hasEquipIcon(carriedDef.id) ? spritePath(equipIconName(carriedDef.id)) : null;
    return (
    <>
      <Header title="キャラクター選択" subtitle="性能差なし。初期装備と専用スキルで選ぶ" onBack={() => setScreen({ name: 'missionDetail', stageId })} />
      <div className="p-3">
        <div className="grid grid-cols-2 gap-2 mb-4">
          {CHARACTER_CLASSES.map(c => (
            <div
              key={c.id}
              onClick={() => { playSfx('ui-select'); setSelectedClass(c.id); }}
              className={`relative flex flex-col min-h-[154px] overflow-hidden rounded-2xl cursor-pointer border ${
                selectedClass === c.id ? 'bg-blue-500/15 border-blue-400/60' : 'bg-white/5 border-white/10 active:bg-white/10'
              }`}
            >
              <div className="pointer-events-none absolute -left-7 -bottom-8 w-32 h-32 rounded-full blur-2xl opacity-40" style={{ backgroundColor: c.accent }} />
              <h3 className="relative px-3 pt-2.5 pb-1 text-base font-semibold text-white leading-tight">{c.name}</h3>
              <div className="relative flex min-h-[122px] flex-1">
                <div className="relative w-[86px] flex-shrink-0 flex items-end justify-center pt-3 pb-2">
                  <div className={`absolute bottom-2 h-6 w-16 rounded-full blur-md ${selectedClass === c.id ? 'opacity-80' : 'opacity-35'}`} style={{ backgroundColor: c.accent }} />
                  <img
                    src={c.sprite}
                    alt={c.name}
                    className="relative z-10 max-h-[122px] max-w-[86px] object-contain drop-shadow-[0_10px_16px_rgba(0,0,0,0.55)]"
                    style={{
                      imageRendering: 'pixelated',
                      transform: `translateY(${c.portraitNudgeY}px) ${selectedClass === c.id ? 'scale(1.06)' : 'scale(1)'}`,
                      transformOrigin: '50% 100%', transition: 'transform 140ms ease-out',
                    }}
                  />
                </div>
                <div className="relative flex-1 min-w-0 px-2.5 py-3 space-y-2 text-left">
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-white/40">初期装備</div>
                    <div className="text-[11px] leading-snug text-gray-200">{c.gear}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-white/40">専用スキル</div>
                    <div className="text-[12px] font-semibold leading-tight text-amber-200/90">{subWeaponDisplayName(c.skillKey)}</div>
                    <div className="text-[10px] leading-snug text-gray-300">{c.skillDesc}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-white/40">固有スキル（自動）</div>
                    <div className="text-[12px] font-semibold leading-tight text-emerald-200/90">{c.name}</div>
                    <div className="text-[10px] leading-snug text-gray-300">{c.charSkillDesc}</div>
                  </div>
                </div>
              </div>
              {selectedClass === c.id && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-300/80 shadow-[0_0_14px_rgba(147,197,253,0.9)]" />}
            </div>
          ))}
        </div>
        <button
          onClick={() => startMission(stageId, selectedClass)}
          className="w-full py-3.5 rounded-2xl text-lg font-bold text-white flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(180deg, rgba(52,211,153,0.95), rgba(16,185,129,0.95))', boxShadow: '0 8px 24px rgba(16,185,129,0.35)' }}
        >
          <Play size={20} /> スタート
        </button>
        {carriedDef && (
          <div className="mt-3 rounded-2xl bg-amber-400/10 border border-amber-300/30 px-3 py-2 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center overflow-hidden shrink-0 text-base">
              {carriedIcon
                ? <img src={carriedIcon} alt="" className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
                : (carriedDef.special ? '🏯' : '🛡️')}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[9px] uppercase tracking-wider text-amber-200/70">持ち越し装備</div>
              <div className="text-[13px] font-semibold text-white truncate">{carriedDef.name}</div>
              <div className="text-[10px] text-white/60 leading-snug truncate">{equipmentDescription(carriedDef)}</div>
            </div>
          </div>
        )}
        <p className="pt-2 text-center text-[11px] text-white/40">装備の変更はホームの「装備」から</p>
      </div>
    </>
    );
  };

  // ====================================================================
  // 装備メニュー(トップから独立) — サブウェポン + スキル(最大2)。store に永続。出撃時に反映。
  // ====================================================================
  const renderLoadout = () => {
    // サブウェポンは1つだけ選択(単一選択=選び直しで置き換え。同じものを再タップで解除)。
    const toggleSub = (k: SubWeaponKey) => {
      playSfx('ui-select');
      setPendingLoadout(equippedSubs.includes(k) ? [] : [k]);
    };
    const toggleSkill = (k: SkillKey) => {
      playSfx('ui-select');
      if (equippedSkills.includes(k)) { setPendingSkills(equippedSkills.filter(x => x !== k)); return; }
      if (equippedSkills.length >= MAX_EQUIPPED_SKILLS) return; // 最大2(満杯なら無視)
      setPendingSkills([...equippedSkills, k]);
    };
    return (
      <>
        <Header title="装備" subtitle="ステージ共通。サブウェポンとスキルを選択（自動保存）" onBack={() => setScreen({ name: 'home' })} />
        <div className="p-3 space-y-4">
          {/* スキル(別枠・最大2)。装備候補はガチャで解禁済み(ownedSkills)のみ。 */}
          <div>
            <div className="flex items-center justify-between px-1 mb-1.5">
              <span className="text-[11px] uppercase tracking-widest text-fuchsia-200/70">スキル</span>
              <span className="text-[11px] text-white/45">{equippedSkills.length}/{MAX_EQUIPPED_SKILLS}</span>
            </div>
            {ownedSkills.length === 0 ? (
              <p className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-[11px] leading-snug text-white/50">
                解禁済みのスキルがありません。開発施設の強化訓練でゴールドを使って解禁してください。
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {/* SKILL_KEYS 順に、所持済みのみ表示(レア度色付き)。 */}
                {SKILL_KEYS.filter(k => ownedSkills.includes(k)).map(k => {
                  const on = equippedSkills.includes(k);
                  const full = !on && equippedSkills.length >= MAX_EQUIPPED_SKILLS;
                  const rarity = SKILLS[k].rarity;
                  return (
                    <button
                      key={k}
                      onClick={() => toggleSkill(k)}
                      disabled={full}
                      className={`flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left ${
                        on ? 'border-fuchsia-300/55 bg-fuchsia-300/15 text-fuchsia-50'
                          : full ? 'border-white/5 bg-white/[0.03] text-white/30'
                          : `${RARITY_BORDER[rarity]} bg-white/5 text-white/85 active:bg-white/10`
                      }`}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold">{SKILLS[k].name} <span className="text-amber-200">Lv{ownedSkillLevels[k] ?? 1}</span></span>
                        {on && <Check size={15} className="shrink-0" />}
                      </span>
                      <span className={`text-[9px] font-semibold uppercase tracking-wider ${RARITY_TEXT[rarity]}`}>{RARITY_LABEL[rarity]}</span>
                      <span className="text-[10px] leading-snug text-white/50">{skillDescForLevel(k, ownedSkillLevels[k] ?? 1)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {/* サブウェポン */}
          <div>
            <div className="px-1 mb-1.5 text-[11px] uppercase tracking-widest text-emerald-200/70">サブウェポン（1つ）</div>
            <div className="grid grid-cols-2 gap-2">
              {/* キャラ固有スキル(職スキル枠)はトップの装備メニューには載せない(自動付与・選択不可)。 */}
              {SUB_WEAPON_KEYS.filter(k => !CHARACTER_SUBWEAPON_KEYS.includes(k)).map(k => {
                const on = equippedSubs.includes(k);
                return (
                  <button
                    key={k}
                    onClick={() => toggleSub(k)}
                    className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left ${
                      on ? 'border-emerald-300/45 bg-emerald-300/15 text-emerald-50' : 'border-white/10 bg-white/5 text-white/85 active:bg-white/10'
                    }`}
                  >
                    <span className="text-[13px] font-semibold">{subWeaponDisplayName(k)}</span>
                    {on && <Check size={15} className="shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="text-[11px] text-white/45 text-center">
            スキル: {equippedSkills.length === 0 ? 'なし' : equippedSkills.map(k => SKILLS[k].name).join(' / ')}
            {' ／ '}サブ: {equippedSubs.length === 0 ? 'なし' : equippedSubs.map(k => subWeaponDisplayName(k)).join(' / ')}
          </p>
        </div>
      </>
    );
  };

  // ====================================================================
  // オプション(音量 + テスト開発ツール)
  // ====================================================================
  const renderOptions = () => (
    <>
      <Header title="オプション" onBack={() => setScreen({ name: 'home' })} />
      <div className="p-3 space-y-3">
        <AudioSettings />
        <GraphicsSettings />
        {DEV_TOOLS_ENABLED && <DevTools selectedClass={selectedClass} onStartGame={onStartGame} onStartBenchmark={onStartBenchmark} onRefreshCleared={() => setCleared(getClearedStages())} />}
      </div>
    </>
  );

  // ====================================================================
  // 開発施設(スキルショップ: サブウェポンの陳列レベル解放)
  // ====================================================================
  const renderWeaponDev = () => <WeaponDev onBack={() => setScreen({ name: 'home' })} />;

  // ====================================================================
  // 資料室(ストーリー記録 + 図鑑)
  // ====================================================================
  const renderArchive = () => (
    <>
      <Header title="資料室" subtitle="ストーリー記録・変異体図鑑" onBack={() => setScreen({ name: 'home' })} />
      <div className="p-3 space-y-3">
        <Section label="世界観">
          {WORLD_INTRO.map((line, i) => <p key={i} className="text-[12px] leading-relaxed text-white/80">{line}</p>)}
        </Section>
        <Section label="任務記録">
          {STAGES.filter(s => s.kind === 'main').map(s => {
            const done = cleared.has(s.id);
            return (
              <div key={s.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className="text-[12px] font-semibold text-white">{s.main.code}：{s.main.title}</div>
                <div className="text-[12px] leading-relaxed text-white/70 mt-1">
                  {done ? s.main.debrief.join(' ') : <span className="text-white/40">未クリア（クリアで記録が開示される）</span>}
                </div>
              </div>
            );
          })}
        </Section>
        <Section label="変異体図鑑">
          {BESTIARY.map(b => (
            <div key={b.id} className="flex gap-2 text-[12px] leading-snug">
              <span className="shrink-0 min-w-[7rem] font-semibold text-white/85">{b.name}</span>
              <span className="text-white/55">{b.note}</span>
            </div>
          ))}
        </Section>
      </div>
    </>
  );

  // --- ルーティング ----------------------------------------------------
  return (
    <Shell>
      {screen.name === 'home' && renderHome()}
      {screen.name === 'stageSelect' && renderStageSelect()}
      {screen.name === 'missionDetail' && renderMissionDetail(screen.stageId)}
      {screen.name === 'characterSelect' && renderCharacterSelect(screen.stageId)}
      {screen.name === 'loadout' && renderLoadout()}
      {screen.name === 'options' && renderOptions()}
      {screen.name === 'weaponDev' && renderWeaponDev()}
      {screen.name === 'archive' && renderArchive()}
    </Shell>
  );
};

// === 共通の小物 =========================================================
const HubButton: React.FC<{ icon: React.ReactNode; label: string; desc: string; onClick: () => void; accent?: boolean }> = ({ icon, label, desc, onClick, accent }) => (
  <button
    onClick={() => { playSfx('ui-select'); onClick?.(); }}
    className={`w-full flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left active:bg-white/10 ${
      accent ? 'border-blue-400/40 bg-blue-400/10' : 'border-white/10 bg-white/5'
    }`}
  >
    <span className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${accent ? 'bg-blue-400/20 text-blue-100' : 'bg-white/8 text-white/80'}`}>{icon}</span>
    <span className="flex-1">
      <span className="block text-[15px] font-semibold text-white">{label}</span>
      <span className="block text-[11px] text-white/50">{desc}</span>
    </span>
    <ChevronLeft size={16} className="rotate-180 text-white/35" />
  </button>
);

const Section: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
    <div className="text-[11px] uppercase tracking-widest text-white/45 mb-2">{label}</div>
    <div className="space-y-1.5">{children}</div>
  </div>
);

// === オプション内: 音量設定 =============================================
const AudioSettings: React.FC = () => {
  const [audioMuted, setAudioMutedState] = useState(isAudioMuted);
  const [bgmVol, setBgmVol] = useState(getBgmVolume);
  const [sfxVol, setSfxVol] = useState(getSfxVolume);
  return (
    <Section label="サウンド">
      <label className="block">
        <div className="mb-1 flex items-center justify-between text-[12px] text-white/70"><span>BGM</span><span className="tabular-nums">{Math.round(bgmVol * 100)}%</span></div>
        <input type="range" min={0} max={100} value={Math.round(bgmVol * 100)} onChange={e => { const v = Number(e.target.value) / 100; setBgmVol(v); setBgmVolume(v); }} className="w-full accent-blue-400" />
      </label>
      <label className="block">
        <div className="mb-1 flex items-center justify-between text-[12px] text-white/70"><span>SE</span><span className="tabular-nums">{Math.round(sfxVol * 100)}%</span></div>
        <input type="range" min={0} max={100} value={Math.round(sfxVol * 100)} onChange={e => { const v = Number(e.target.value) / 100; setSfxVol(v); setSfxVolume(v); }} className="w-full accent-emerald-400" />
      </label>
      <button
        onClick={() => { const next = !audioMuted; setAudioMutedState(next); setAudioMuted(next); }}
        className={`w-full py-2.5 rounded-2xl text-sm font-semibold border flex items-center justify-center gap-2 ${audioMuted ? 'bg-white/5 border-white/10 text-white/70' : 'bg-emerald-400/10 border-emerald-300/35 text-emerald-100'}`}
      >
        {audioMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}{audioMuted ? '音なし' : '音あり'}
      </button>
    </Section>
  );
};

// === オプション内: グラフィック設定 =====================================
// ブルーム(発光)= gameplay world 全体にかかる AdvancedBloomFilter。明るいピクセル(光・
// 銃口炎・宝石・クリ・松明・月など)を全画面でにじませて HD-2D らしい発光感を出す効果。
// 反面、明るい演出が増えるほど全画面ブラーが重くなる=実機の最大ボトルネック。OFFで軽くなる。
const GraphicsSettings: React.FC = () => {
  const [bloom, setBloom] = useState(getBloomEnabled);
  return (
    <Section label="グラフィック">
      <button
        onClick={() => { const next = !bloom; setBloom(next); setBloomEnabled(next); playSfx('ui-select'); }}
        className={`w-full py-2.5 rounded-2xl text-sm font-semibold border flex items-center justify-center gap-2 ${bloom ? 'bg-amber-400/10 border-amber-300/35 text-amber-100' : 'bg-white/5 border-white/10 text-white/70'}`}
      >
        <Sparkles size={17} />ブルーム(発光){bloom ? 'あり' : 'なし'}
      </button>
      <p className="text-[11px] leading-relaxed text-white/45">
        光・炎・宝石などをにじませて発光させる演出。華やかになる反面、実機では最も重い処理。
        カクつく時はOFFにすると軽くなります(リロード不要)。
      </p>
    </Section>
  );
};

// === オプション内: テスト開発ツール(FPS/撃破数表示・ダンスモード・BENCH・デバッグ入力) ===
const DevTools: React.FC<{
  selectedClass: CharacterClass;
  onStartGame: (c: string) => void;
  onStartBenchmark: (c: string) => void;
  onRefreshCleared: () => void;
}> = ({ selectedClass, onStartGame, onStartBenchmark, onRefreshCleared }) => {
  const showStatsOverlay = useGameStore(s => s.showStatsOverlay);
  const setShowStatsOverlay = useGameStore(s => s.setShowStatsOverlay);
  const setDanceTestMode = useGameStore(s => s.setDanceTestMode);
  const setDanceTestLevel = useGameStore(s => s.setDanceTestLevel);
  const setDanceTestInterval = useGameStore(s => s.setDanceTestInterval);
  const danceTestAutoTap = useGameStore(s => s.danceTestAutoTap);
  const setDanceTestAutoTap = useGameStore(s => s.setDanceTestAutoTap);
  const danceForceJust = useGameStore(s => s.danceForceJust);
  const setDanceForceJust = useGameStore(s => s.setDanceForceJust);
  const meleeAmmoDropPercent = useGameStore(s => s.meleeAmmoDropPercent);
  const setMeleeAmmoDropPercent = useGameStore(s => s.setMeleeAmmoDropPercent);
  const ammoPickupAmounts = useGameStore(s => s.ammoPickupAmounts);
  const setAmmoPickupAmount = useGameStore(s => s.setAmmoPickupAmount);

  const [danceLevel, setDanceLevel] = useState(1);
  const [danceIntervalInput, setDanceIntervalInput] = useState(String(Math.round(rhythmIntervalForLevel(1))));
  const [dropInput, setDropInput] = useState(String(meleeAmmoDropPercent));
  const [ammoInputs, setAmmoInputs] = useState<Record<AmmoType, string>>({
    handgun: String(ammoPickupAmounts.handgun), shotgun: String(ammoPickupAmounts.shotgun), rifle: String(ammoPickupAmounts.rifle),
  });

  const selectDanceLevel = (lv: number) => { setDanceLevel(lv); setDanceIntervalInput(String(Math.round(rhythmIntervalForLevel(lv)))); };
  const startDancePractice = () => {
    const n = parseInt(danceIntervalInput, 10);
    setDanceTestInterval(Number.isFinite(n) ? n : 0);
    setDanceTestLevel(danceLevel);
    setDanceTestMode(true);
    setSelectedStageId('');     // 練習はステージ進行に影響させない
    setSelectedFreeMode(false);
    useGameStore.getState().setPendingLoadout([]);
    onStartGame(selectedClass);
  };
  const ammoFields: { type: AmmoType; label: string }[] = [
    { type: 'handgun', label: 'ハンドガン' }, { type: 'shotgun', label: 'ショットガン' }, { type: 'rifle', label: 'ライフル' },
  ];

  return (
    <div className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.06] p-3 space-y-3">
      <div className="text-[11px] uppercase tracking-widest text-amber-200/70">テスト開発用（?dev=0 で非表示）</div>

      {/* FPS/撃破数表示 on/off */}
      <button
        type="button"
        onClick={() => setShowStatsOverlay(!showStatsOverlay)}
        className={`w-full flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left ${showStatsOverlay ? 'border-emerald-300/35 bg-emerald-300/15 text-emerald-50' : 'border-white/10 bg-white/5 text-white/80 active:bg-white/10'}`}
        aria-pressed={showStatsOverlay}
      >
        <span><span className="block text-[13px] font-semibold">撃破数/FPS表示</span><span className="block text-[11px] text-white/50">{showStatsOverlay ? '表示ありで開始' : '通常は無し'}</span></span>
        <span className="text-[11px] font-semibold shrink-0">{showStatsOverlay ? 'ON' : 'OFF'}</span>
      </button>

      {/* ダンスモード(練習) */}
      <div className="rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/5 p-2.5 space-y-2">
        <span className="block text-[11px] text-fuchsia-200/80">🕺 ダンスモード（練習）</span>
        <div className="flex items-center gap-2">
          {[1, 2, 3].map(lv => (
            <button key={lv} onClick={() => selectDanceLevel(lv)} aria-pressed={danceLevel === lv}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold border ${danceLevel === lv ? 'text-white border-fuchsia-300/80 ring-1 ring-fuchsia-300/60' : 'text-fuchsia-100 border-fuchsia-400/40'}`}
              style={{ background: 'linear-gradient(180deg, rgba(217,70,239,0.22), rgba(168,85,247,0.22))' }}>Lv{lv}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[12px] text-white/75">
          <span className="shrink-0">サークル間隔</span>
          <input type="number" inputMode="numeric" value={danceIntervalInput} onChange={e => setDanceIntervalInput(e.target.value)}
            className="w-20 rounded-lg border border-white/15 bg-black/30 px-2 py-1 text-right font-mono tabular-nums text-white/90 outline-none focus:border-fuchsia-300/60" />
          <span className="shrink-0 text-white/45">ms/拍</span>
        </label>
        <button type="button" onClick={() => setDanceTestAutoTap(!danceTestAutoTap)} aria-pressed={danceTestAutoTap}
          className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-1.5 text-left text-[12px] ${danceTestAutoTap ? 'border-emerald-300/35 bg-emerald-300/15 text-emerald-50' : 'border-white/10 bg-white/5 text-white/75 active:bg-white/10'}`}>
          <span>自動タップ(JUSTでドラム)</span><span className="shrink-0 font-semibold">{danceTestAutoTap ? 'ON' : 'OFF'}</span>
        </button>
        <button type="button" onClick={() => setDanceForceJust(!danceForceJust)} aria-pressed={danceForceJust}
          className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-1.5 text-left text-[12px] ${danceForceJust ? 'border-emerald-300/35 bg-emerald-300/15 text-emerald-50' : 'border-white/10 bg-white/5 text-white/75 active:bg-white/10'}`}>
          <span>強制JUST判定(タップ常に成功)</span><span className="shrink-0 font-semibold">{danceForceJust ? 'ON' : 'OFF'}</span>
        </button>
        <button type="button" onClick={startDancePractice} className="w-full py-2 rounded-xl text-sm font-bold text-white border border-fuchsia-300/60"
          style={{ background: 'linear-gradient(180deg, rgba(217,70,239,0.45), rgba(168,85,247,0.45))' }}>決定（開始）</button>
      </div>

      {/* BENCH */}
      <button type="button" onClick={() => { setSelectedStageId(''); setSelectedFreeMode(false); useGameStore.getState().setPendingLoadout([]); onStartBenchmark(selectedClass); }}
        className="w-full py-2.5 rounded-2xl text-sm font-semibold border border-cyan-200/30 bg-cyan-300/10 text-cyan-100 active:bg-cyan-300/15">
        BENCH（ベンチマーク開始）
      </button>

      {/* デバッグ入力: 弾ドロップ率 / 弾薬箱取得量 */}
      <div className="rounded-2xl border border-white/10 bg-black/15 p-2.5 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="text-left"><div className="text-[13px] font-medium text-white">弾ドロップ率</div><div className="text-[11px] text-white/50">撃破時。近接フィニッシュは×1.5</div></div>
          <div className="flex items-center gap-1">
            <input type="number" inputMode="numeric" min={0} max={100} value={dropInput}
              onChange={e => { setDropInput(e.target.value); const n = parseInt(e.target.value, 10); if (!Number.isNaN(n)) setMeleeAmmoDropPercent(n); }}
              onBlur={() => setDropInput(String(useGameStore.getState().meleeAmmoDropPercent))}
              className="w-16 text-right bg-white/10 border border-white/15 rounded-lg px-2 py-1 text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-400/60" />
            <span className="text-white/60 text-sm">%</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {ammoFields.map(f => (
            <label key={f.type} className="block">
              <span className="mb-1 block text-[10px] text-white/60">{f.label}</span>
              <input type="number" inputMode="numeric" min={0} max={999} value={ammoInputs[f.type]}
                onChange={e => { setAmmoInputs(prev => ({ ...prev, [f.type]: e.target.value })); const n = parseInt(e.target.value, 10); if (!Number.isNaN(n)) setAmmoPickupAmount(f.type, n); }}
                onBlur={() => setAmmoInputs(prev => ({ ...prev, [f.type]: String(useGameStore.getState().ammoPickupAmounts[f.type]) }))}
                className="w-full text-right bg-white/10 border border-white/15 rounded-lg px-2 py-1 text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-400/60" />
            </label>
          ))}
        </div>
      </div>

      {/* ステージ進行(導線テスト用) */}
      <div className="flex gap-2">
        <button type="button" onClick={() => { unlockAllStages(); onRefreshCleared(); }} className="flex-1 py-2 rounded-xl text-[12px] font-semibold border border-white/15 bg-white/5 text-white/80 active:bg-white/10">全ステージ解放</button>
        <button type="button" onClick={() => { resetProgress(); onRefreshCleared(); }} className="flex-1 py-2 rounded-xl text-[12px] font-semibold border border-white/15 bg-white/5 text-white/80 active:bg-white/10">進行リセット</button>
      </div>
    </div>
  );
};

// === 強化訓練(スキルガチャ。開発施設トップに組み込み) ===========================
// レア度=pity(直近superからのpull数)で重み変動。Lv=スキル別の被り回数で抽選。逐次処理。
// 演出: 1枚絵+[撃つ]→暗転→上から順にレア度/レベルを表示。レア度で出方が変わり、レベルは
// 名前の後にワンテンポ置いて飛び出す(Lv3が最も派手)。すべてCSS駆動(初期render後はReact非介入)。
type RevealCfg = { nameCls: string; beat: number; step: number; ring: string };
const REVEAL_BY_RARITY: Record<SkillRarity, RevealCfg> = {
  // step = カードの表示時間。レベルは beat 遅延後にポップ(pop=0.34s / pop3=0.6s)するので、
  // step は「beat + ポップ尺 + 見え切る保持 + (superは退場フェード320ms)」を必ず上回るよう長めに取る。
  // レア度が高いほど長く見せる(社長指示)。手動タップ/矢印で早送り可。
  normal: { nameCls: 'gacha-name-normal', beat: 300,  step: 950,  ring: 'border-white/15' },
  rare:   { nameCls: 'gacha-name-rare',   beat: 620,  step: 1400, ring: 'border-sky-400/50 shadow-[0_0_18px_rgba(56,189,248,0.45)]' },
  super:  { nameCls: 'gacha-name-super',  beat: 1150, step: 2500, ring: 'border-amber-300/70 shadow-[0_0_30px_rgba(251,191,36,0.7)]' },
};

// 破裂演出のレア度段階: 引いた中の最高レア度で 色/フラッシュ/破片量/リング/光/揺れ をエスカレートする。
// すべてCSS駆動の一発演出・要素数に上限あり(破片≤22+リング≤2+光1)・~800msで停止=負荷1/10。
const RARITY_RANK: Record<SkillRarity, number> = { normal: 0, rare: 1, super: 2 };
const bestRarity = (rs: GachaPullResult[]): SkillRarity =>
  rs.reduce<SkillRarity>((m, r) => (RARITY_RANK[r.rarity] > RARITY_RANK[m] ? r.rarity : m), 'normal');
type BurstCfg = { dim: string; flash: string; shard: string; shardCount: number; distBonus: number; shake: boolean; rings: string[]; glow: boolean };
const BURST_FX: Record<SkillRarity, BurstCfg> = {
  normal: { dim: 'bg-black/90', flash: 'bg-white',     shard: 'bg-slate-200/90', shardCount: 12, distBonus: 0,  shake: false, rings: [],                                          glow: false },
  rare:   { dim: 'bg-black/90', flash: 'bg-sky-200',   shard: 'bg-sky-200/90',   shardCount: 16, distBonus: 14, shake: false, rings: ['border-sky-300/70'],                       glow: false },
  super:  { dim: 'bg-black/92', flash: 'bg-amber-200', shard: 'bg-amber-200/95', shardCount: 22, distBonus: 30, shake: true,  rings: ['border-amber-300/80', 'border-fuchsia-300/55'], glow: true  },
};

// レベル表記: 上限(maxLv)に達していたら「Lv3」等ではなく「MAX」と表示する(死神など maxLv1 は常にMAX)。
const lvText = (key: SkillKey, level: number): string => (level >= skillMaxLevel(key) ? 'MAX' : `Lv${level}`);

const SkillGacha: React.FC = () => {
  // 毎フレーム購読しない: プリミティブ/派生のみ購読(CLAUDE.md React再レンダー規律)。
  const goldBalance = useGameStore(s => s.goldBalance);
  const ownedCount = useGameStore(s => s.ownedSkills.length);
  const pity = useGameStore(s => s.gachaPitySinceSuper);
  const pullGacha = useGameStore(s => s.pullGacha);
  const [pendingCount, setPendingCount] = useState<1 | 10 | null>(null); // 選択した訓練回数(=射撃練習場へ遷移中)
  const [results, setResults] = useState<GachaPullResult[] | null>(null); // null=暗転演出オフ(射撃場表示)
  const [idx, setIdx] = useState(0); // 排出結果のページ(矢印めくり。スクロールは使わない)
  const [showList, setShowList] = useState(false); // 排出結果の一覧(サマリー)表示中か(10連で何が出たか振り返る用)
  const [bursting, setBursting] = useState(false); // 撃つ→的が破裂する演出中(results確定済み・暗転前)
  const [leaving, setLeaving] = useState(false);   // 超レアカードが次へ送る前にフェードアウト中か
  const [noGold, setNoGold] = useState(false);

  const coverSrc = `${import.meta.env.BASE_URL}gacha/cover.png`;
  const targetSrc = `${import.meta.env.BASE_URL}gacha/target.png`;

  // n回 逐次で引く(各 pullGacha が get/set で最新stateを参照=スナップショット一括禁止)。
  // 撃つ→的破裂(BURST)→暗転リザルト の順に遷移する。
  const BURST_MS = 820;
  const SHOT_STAGGER = 55; // 連射(バババ)の1発間隔ms
  const pullMany = (n: number) => {
    setNoGold(false);
    const got: GachaPullResult[] = [];
    for (let i = 0; i < n; i++) {
      const r = pullGacha();
      if (!r) { if (got.length === 0) { setNoGold(true); setResults(null); return; } break; } // ゴールド切れで打ち切り
      got.push(r);
    }
    const best = bestRarity(got);
    const m = got.length;
    if (m > 1) {
      // 10連等: 的の数だけ高速連射(バババ)。最後にレア度で着弾音をエスカレート。
      for (let i = 0; i < m; i++) window.setTimeout(() => playSfx('rifle-fire'), i * SHOT_STAGGER);
      window.setTimeout(() => {
        playSfx('bomb');
        if (best === 'rare') playSfx('homing-lock2');
        else if (best === 'super') { playSfx('heavy-impact'); playSfx('event-clear'); }
      }, m * SHOT_STAGGER);
    } else {
      playSfx('shoot'); playSfx('bomb'); // 発砲＋着弾(破裂)
      if (best === 'rare') playSfx('homing-lock2');
      else if (best === 'super') { playSfx('heavy-impact'); playSfx('event-clear'); }
    }
    setIdx(0);
    setLeaving(false);
    setResults(got);     // リザルトは確定(暗転は破裂後に出す)
    setBursting(true);   // まず破裂演出
    // 連射は的が順に倒れる分だけ長め(早めのテンポ)。単発は従来どおり。
    const burstMs = m > 1 ? Math.max(BURST_MS, m * SHOT_STAGGER + 430) : BURST_MS;
    setTimeout(() => setBursting(false), burstMs);
  };
  const closeReveal = () => { setResults(null); setBursting(false); setPendingCount(null); setIdx(0); setShowList(false); setLeaving(false); };

  // 排出結果は「矢印めくり」で1枚ずつ見せる(スクロール無し=ネイティブ感)。破裂明けで先頭(0)から、
  // レア度のテンポで自動的にめくり進む。以後は ◀▶ で前後に見返せる(手動操作で自動送りは停止)。
  const revealTimers = useRef<number[]>([]);
  const clearRevealTimers = () => { revealTimers.current.forEach(clearTimeout); revealTimers.current = []; };
  const LEAVE_MS = 320; // 超レアの退場フェード時間
  useEffect(() => {
    if (!results || bursting) return;
    setIdx(0);
    setShowList(false); // 新しい結果は必ず演出(矢印めくり)から
    setLeaving(false);
    clearRevealTimers();
    let acc = 0;
    for (let i = 1; i < results.length; i++) {
      // 表示中のカード(i-1)の尺(step)で次へ送る。※従来は results[i](次のカード)の step を使っており、
      // 「死神(super)でも次が低レアだと一瞬で送られる」不安定の原因だった。
      acc += REVEAL_BY_RARITY[results[i - 1].rarity].step;
      // 直前(i-1)が超レアなら、切り替え前にフェードアウトしてから次のカードへ。
      if (results[i - 1].rarity === 'super') {
        revealTimers.current.push(window.setTimeout(() => setLeaving(true), Math.max(0, acc - LEAVE_MS)));
        revealTimers.current.push(window.setTimeout(() => { setIdx(i); setLeaving(false); }, acc));
      } else {
        revealTimers.current.push(window.setTimeout(() => setIdx(i), acc));
      }
    }
    return clearRevealTimers;
  }, [results, bursting]);
  // ◀▶ で前後にめくる(手動操作したら自動送りは止める)。
  const pageBy = (d: number) => {
    clearRevealTimers();
    setLeaving(false);
    setIdx(i => Math.max(0, Math.min((results?.length ?? 1) - 1, i + d)));
  };

  const superPct = gachaSuperPercent(pity);
  const pityLeft = gachaPityRemaining(pity);

  // --- 撃つ→的が破裂する演出(レア度でエスカレート) --------------------
  if (bursting) {
    const best = bestRarity(results ?? []);
    const fx = BURST_FX[best];
    const shotCount = (results ?? []).length;
    // 10連等(複数): 的「1枚」を食い気味に連打(各ショットの演出が途中でも次弾を撃ち込む)。
    // super を含む時はパーティクルを散らす特別演出。
    if (shotCount > 1) {
      const isSuper = best === 'super';
      const SHARDS_PER = 4;
      return createPortal(
        <div className={`gacha-dim fixed inset-0 z-50 flex items-center justify-center ${fx.dim}`}>
          <div className={`relative flex items-center justify-center ${isSuper ? 'gacha-burst-shake' : 'gacha-hitshake'}`} style={{ width: '70%', maxWidth: 340, aspectRatio: '3 / 4' }}>
            {/* super: 背後に広がる金色グロー */}
            {isSuper && <span className="gacha-burst-glow absolute inset-[-30%] rounded-full" style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.5), rgba(251,191,36,0) 70%)' }} />}
            <img src={targetSrc} alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain" />
            {/* 連打: 各ショットで素早いフラッシュ＋破片を的中心に重ねる(SHOT_STAGGER間隔=食い気味に重なる) */}
            {Array.from({ length: shotCount }).map((_, s) => (
              <React.Fragment key={s}>
                <span className={`gacha-shot-flash absolute inset-[18%] rounded-full ${fx.flash}`} style={{ animationDelay: `${s * SHOT_STAGGER}ms`, filter: 'blur(8px)' }} />
                {Array.from({ length: SHARDS_PER }).map((_, k) => {
                  const ang = (Math.PI * 2 * (k + s * 0.4)) / SHARDS_PER;
                  const dist = 70 + (k % 3) * 22 + fx.distBonus;
                  return <span key={k} className={`gacha-shard absolute left-1/2 top-1/2 h-2 w-2 rounded-[2px] ${fx.shard}`} style={{ animationDelay: `${s * SHOT_STAGGER}ms`, ['--tx' as string]: `${Math.cos(ang) * dist}px`, ['--ty' as string]: `${Math.sin(ang) * dist}px` }} />;
                })}
              </React.Fragment>
            ))}
            {/* super 特別演出: 金/赤紫のパーティクルを四方に散らす */}
            {isSuper && Array.from({ length: 20 }).map((_, p) => {
              const ang = (Math.PI * 2 * p) / 20 + 0.3;
              const dist = 150 + (p % 4) * 46;
              return <span key={`p${p}`} className={`gacha-super-particle absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full ${p % 3 === 0 ? 'bg-fuchsia-300' : 'bg-amber-200'}`} style={{ animationDelay: `${(p % 6) * 70}ms`, ['--tx' as string]: `${Math.cos(ang) * dist}px`, ['--ty' as string]: `${Math.sin(ang) * dist}px` }} />;
            })}
          </div>
        </div>,
        document.body
      );
    }
    // 単発: 中心から飛び散る破片。--tx/--ty で方向を渡す(CSS駆動)。レア度で枚数・飛距離が増える。
    const shards = Array.from({ length: fx.shardCount }, (_, i) => {
      const ang = (Math.PI * 2 * i) / fx.shardCount;
      const dist = 96 + (i % 3) * 26 + fx.distBonus;
      return { tx: Math.cos(ang) * dist, ty: Math.sin(ang) * dist, i };
    });
    // body 直下へポータル。施設リストの scroll/transform から切り離した真の専用フルスクリーン演出にする。
    return createPortal(
      <div className={`gacha-dim fixed inset-0 z-50 flex items-center justify-center ${fx.dim}`}>
        <div className={`relative flex items-center justify-center ${fx.shake ? 'gacha-burst-shake' : ''}`} style={{ width: '70%', maxWidth: 340, aspectRatio: '3 / 4' }}>
          {/* super: 背後に広がる金色の光(レア度演出の主役) */}
          {fx.glow && (
            <span className="gacha-burst-glow absolute inset-[-30%] rounded-full" style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.55), rgba(251,191,36,0) 70%)' }} />
          )}
          {/* rare/super: 広がる色付きリング(複数で厚みを出す) */}
          {fx.rings.map((ringCls, k) => (
            <span key={k} className={`gacha-burst-ring absolute h-44 w-44 rounded-full border-2 ${ringCls}`} style={{ animationDelay: `${k * 90}ms` }} />
          ))}
          <img src={targetSrc} alt="" className="gacha-target-burst absolute inset-0 h-full w-full object-contain" />
          {shards.map(s => (
            <span
              key={s.i}
              className={`gacha-shard absolute h-2.5 w-2.5 rounded-[2px] ${fx.shard}`}
              style={{ ['--tx' as string]: `${s.tx}px`, ['--ty' as string]: `${s.ty}px` }}
            />
          ))}
          <span className={`gacha-flash absolute inset-0 rounded-full ${fx.flash}`} style={{ filter: 'blur(8px)' }} />
        </div>
      </div>,
      document.body
    );
  }

  // --- 排出結果(矢印めくり・スクロール無しの専用全画面) ----------------
  // 多くのゲームと同様、1枚ずつ中央に大きく見せて ◀▶ でめくる(全画面スクロールを使わない)。
  // 破裂明けにレア度テンポで自動送り→以後は矢印/タップで前後に見返せる。body直下へポータル。
  if (results) {
    const total = results.length;
    const cur = Math.max(0, Math.min(idx, total - 1));
    const r = results[cur];
    const cfg = REVEAL_BY_RARITY[r.rarity];
    const maxLv = skillMaxLevel(r.key);
    const nextPromote = gachaPromotePercent(r.rarity, r.newLevel, r.dupeCount + 1, maxLv);
    const atMax = r.newLevel >= maxLv;
    const lvlCls = atMax ? 'gacha-lvl-pop3' : 'gacha-lvl-pop';
    const lvlColor = atMax ? 'text-amber-300' : r.newLevel === 2 ? 'text-sky-200' : 'text-white';
    const atFirst = cur === 0;
    const atLast = cur === total - 1;
    return createPortal(
      <div className="gacha-dim fixed inset-0 z-50 flex flex-col bg-black/92 backdrop-blur-sm">
        <p className="px-4 pt-5 text-center text-[12px] uppercase tracking-[0.3em] text-fuchsia-200/70">
          スキル強化訓練 結果{showList ? '（一覧）' : ''}
        </p>

        {showList ? (
          // 一覧(サマリー): 10連で何が出たか振り返る。枠内のみスクロール(全画面/バー無し)。
          <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-2">
            <div className="mx-auto flex w-full max-w-md flex-col gap-1.5">
              {results.map((rr, i) => {
                const rc = REVEAL_BY_RARITY[rr.rarity];
                const rMax = rr.newLevel >= skillMaxLevel(rr.key);
                const lc = rMax ? 'text-amber-300' : rr.newLevel === 2 ? 'text-sky-200' : 'text-white';
                return (
                  <div key={i} className={`rounded-lg border bg-black/40 px-3 py-2 ${rc.ring}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[14px] font-bold text-white">
                        {SKILLS[rr.key].name}
                        <span className={`ml-2 text-[15px] font-extrabold ${lc}`}>{lvText(rr.key, rr.newLevel)}</span>
                        {rr.firstAcquire && <span className="ml-2 align-middle rounded border border-emerald-300/60 bg-emerald-400/20 px-1 text-[9px] font-bold text-emerald-200">New</span>}
                      </span>
                      <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider ${RARITY_TEXT[rr.rarity]}`}>{RARITY_LABEL[rr.rarity]}</span>
                    </div>
                    <p className={`mt-0.5 text-[10px] font-semibold ${rr.promoted ? 'text-emerald-300' : 'text-amber-200'}`}>
                      {rr.firstAcquire ? `新規解禁！ Lv${rr.newLevel}`
                        : rr.promoted ? `Lv${rr.prevLevel} → Lv${rr.newLevel} 昇格！`
                        : `現Lv${rr.prevLevel}以下/上限 → ${rr.refund}G返金`}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
        <>
        {/* 中央に1枚ずつ。◀▶でめくる(スクロール無し)。中央タップでも次へ。 */}
        <div
          className="relative flex flex-1 items-center justify-center px-3"
          onClick={() => { if (!atLast) pageBy(1); }}
        >
          {total > 1 && (
            <button
              type="button"
              aria-label="前へ"
              disabled={atFirst}
              onClick={(e) => { e.stopPropagation(); pageBy(-1); }}
              className={`absolute left-1 z-10 flex h-12 w-12 items-center justify-center rounded-full text-4xl font-bold leading-none ${atFirst ? 'text-white/15' : 'text-white/80 active:scale-90'}`}
            >
              ‹
            </button>
          )}

          <div
            key={cur}
            className={`${leaving ? 'gacha-card-out' : `gacha-card ${cfg.nameCls}`} w-full max-w-sm rounded-2xl border bg-black/40 px-5 py-6 ${cfg.ring}`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-bold uppercase tracking-[0.2em] ${RARITY_TEXT[r.rarity]}`}>{RARITY_LABEL[r.rarity]}</span>
              {r.firstAcquire && <span className="rounded-md border border-emerald-300/60 bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-200">New</span>}
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-[22px] font-extrabold text-white">{SKILLS[r.key].name}</span>
              <span className={`gacha-lvl ${lvlCls} text-[26px] font-extrabold ${lvlColor}`} style={{ animationDelay: `${cfg.beat}ms` }}>
                {lvText(r.key, r.newLevel)}
              </span>
            </div>
            <p className="mt-2 text-[12px] leading-snug text-white/60">{skillDescForLevel(r.key, r.promoted ? r.newLevel : r.prevLevel)}</p>
            <p className={`mt-2 text-[13px] font-semibold ${r.promoted ? 'text-emerald-300' : 'text-amber-200'}`}>
              {r.firstAcquire ? `新規解禁！ ${lvText(r.key, r.newLevel)}`
                : r.promoted ? `${lvText(r.key, r.prevLevel)} → ${lvText(r.key, r.newLevel)} 昇格！`
                : `抽選Lv${r.rolledLevel}（現${lvText(r.key, r.prevLevel)}以下/上限）→ ${r.refund}G返金`}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-white/45">
              被り {r.dupeCount + 1}回{r.newLevel < maxLv ? ` ／ 次の昇格確率 ${nextPromote}%` : ' ／ 最大Lv'}
            </p>
          </div>

          {total > 1 && (
            <button
              type="button"
              aria-label="次へ"
              disabled={atLast}
              onClick={(e) => { e.stopPropagation(); pageBy(1); }}
              className={`absolute right-1 z-10 flex h-12 w-12 items-center justify-center rounded-full text-4xl font-bold leading-none ${atLast ? 'text-white/15' : 'text-white/80 active:scale-90'}`}
            >
              ›
            </button>
          )}
        </div>

        {/* ページ位置インジケータ(ドット＋カウンタ)。スクロールバーの代わり。 */}
        {total > 1 && (
          <div className="flex items-center justify-center gap-1.5 pb-1">
            {results.map((_rr, i) => (
              <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: i === cur ? 'rgba(244,114,182,0.95)' : 'rgba(255,255,255,0.22)' }} />
            ))}
          </div>
        )}
        {total > 1 && <p className="pb-1 text-center text-[10px] tracking-wider text-white/35">{cur + 1} / {total}</p>}
        </>
        )}

        <div className="border-t border-white/10 bg-black/60 p-3">
          {total > 1 ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { clearRevealTimers(); setShowList(v => !v); }}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-[14px] font-semibold text-white/80 active:bg-white/10"
              >
                {showList ? '演出にもどる' : '一覧で見る'}
              </button>
              <button
                type="button"
                onClick={closeReveal}
                className="rounded-xl border border-fuchsia-300/50 bg-fuchsia-400/20 px-3 py-3 text-[14px] font-semibold text-fuchsia-50 active:bg-fuchsia-400/30"
              >
                とじる
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={closeReveal}
              className="w-full rounded-xl border border-fuchsia-300/50 bg-fuchsia-400/20 px-3 py-3 text-[14px] font-semibold text-fuchsia-50 active:bg-fuchsia-400/30"
            >
              とじる
            </button>
          )}
        </div>
      </div>,
      document.body
    );
  }

  const cost1 = GACHA_PULL_COST;
  const cost10 = GACHA_PULL_COST * 10;
  const cant1 = goldBalance < cost1;
  const cant10 = goldBalance < cost10;
  const costLabel = (c: number) => (c > 0 ? `${c.toLocaleString()}G` : '無料');

  // --- 射撃練習場(別画面) ----------------------------------------------
  // 回数選択後にここへ遷移。射撃場の絵を画面内に収め(contain)、的(target.png)を画像中央に重ね、
  // その的の下に「撃つ」を画像内テキストとして置く(ボタン見た目にしない)。値段は前画面で確認済みのため非表示。
  // 画面のどこを押しても発射(戻る除く)→破裂→暗転リザルト(上の分岐)へ。
  if (pendingCount !== null) {
    const cantPull = goldBalance < GACHA_PULL_COST * pendingCount;
    // 撃つ画面も body 直下へポータル(施設の scroll/transform から独立した専用フルスクリーン)。
    return createPortal(
      <div
        className="gacha-dim fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-black"
        role="button"
        tabIndex={0}
        onClick={() => { if (!cantPull) pullMany(pendingCount); }}
      >
        {/* 射撃場の絵を画面内に収める(contain)。縦長に伸ばさない。 */}
        <img
          src={coverSrc}
          alt=""
          className="absolute inset-0 h-full w-full object-contain"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/70" />

        {/* 戻る(左上に小さく)。発射のタップとは区別する(stopPropagation)。 */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setPendingCount(null); setNoGold(false); }}
          className="absolute left-4 top-4 z-10 rounded-lg border border-white/20 bg-black/40 px-3 py-1.5 text-[13px] font-semibold text-white/85 active:bg-black/60"
        >
          ‹ 戻る
        </button>

        {/* 的＋「撃つ」を画像中央に重ねる。クリックは下の画面全体へ通す(pointer-events-none)。 */}
        <div className="pointer-events-none relative flex flex-col items-center justify-center gap-1 px-6">
          <img
            src={targetSrc}
            alt="的"
            className="max-h-[46vh] w-auto max-w-[72%] object-contain drop-shadow-[0_6px_24px_rgba(0,0,0,0.75)]"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
          />
          {/* 「撃つ」: ボタンではなく的の下の画像内テキスト(画面どこでもタップで発射)。 */}
          <span className={`pl-[0.4em] text-[30px] font-extrabold tracking-[0.4em] drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)] ${cantPull ? 'text-white/30' : 'text-white gacha-shoot-text'}`}>
            撃つ
          </span>
          {noGold && <p className="text-[11px] text-rose-300">ゴールドが足りません。</p>}
        </div>
      </div>,
      document.body
    );
  }

  // --- 回数選択(開発施設トップ) ---------------------------------------
  // 横長バナーのみ表示。画像の上にタイトル、下に[1回訓練][10回訓練]、その下に金額。
  return (
    <div className="rounded-2xl border border-fuchsia-300/30 bg-fuchsia-300/[0.06] p-3 mb-3">
      {/* 画像の上にタイトル */}
      <div className="flex items-center justify-between px-0.5 mb-2">
        <span className="text-[13px] font-bold text-fuchsia-100">スキル強化訓練</span>
        <span className="text-[12px] text-amber-200 font-semibold">所持ゴールド {goldBalance.toLocaleString()}</span>
      </div>
      {/* 射撃練習場の横長バナー */}
      <div className="relative mb-3 overflow-hidden rounded-xl border border-fuchsia-300/25" style={{ aspectRatio: '16 / 7' }}>
        <img
          src={coverSrc}
          alt=""
          className="h-full w-full object-cover"
          style={{ objectPosition: 'center 40%' }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
      </div>
      {/* 1回訓練 / 10回訓練 */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => { setPendingCount(1); setNoGold(false); }}
          disabled={cant1}
          className={`rounded-xl px-3 py-3 text-[15px] font-bold ${
            cant1
              ? 'border border-white/10 bg-white/[0.03] text-white/30'
              : 'border border-fuchsia-300/50 bg-fuchsia-400/20 text-fuchsia-50 active:bg-fuchsia-400/30'
          }`}
        >
          1回訓練
        </button>
        <button
          type="button"
          onClick={() => { setPendingCount(10); setNoGold(false); }}
          disabled={cant10}
          className={`rounded-xl px-3 py-3 text-[15px] font-bold ${
            cant10
              ? 'border border-white/10 bg-white/[0.03] text-white/30'
              : 'border border-fuchsia-300/50 bg-fuchsia-400/20 text-fuchsia-50 active:bg-fuchsia-400/30'
          }`}
        >
          10回訓練
        </button>
      </div>
      {/* ボタンの下に金額表示 */}
      <div className="mt-1.5 grid grid-cols-2 gap-2 text-center text-[12px] font-semibold">
        <span className={cant1 ? 'text-rose-300' : 'text-amber-200'}>{costLabel(cost1)}</span>
        <span className={cant10 ? 'text-rose-300' : 'text-amber-200'}>{costLabel(cost10)}</span>
      </div>
      <div className="mt-2 flex items-center justify-between rounded-lg border border-fuchsia-300/20 bg-black/20 px-2 py-1 text-[10px]">
        <span className="text-fuchsia-100/80">現在の{RARITY_LABEL.super}確率 <span className="font-semibold text-fuchsia-200">{superPct}%</span></span>
        <span className="text-white/55">{pityLeft > 0 ? `天井まであと ${pityLeft}` : `天井(${RARITY_LABEL.super}最大)`}</span>
      </div>
      <p className="mt-2 text-[10px] leading-snug text-white/50">
        引くほど超レアが出やすく、被るほど高Lvが出やすい。既存Lv以下/上限は返金。解禁済み {ownedCount}/{SKILL_KEYS.length}
      </p>
    </div>
  );
};

// === 開発施設(スキルショップ) ==========================================
const WeaponDev: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const unlockedShopSkillCards = useGameStore(s => s.unlockedShopSkillCards);
  const setUnlockedShopSkillCard = useGameStore(s => s.setUnlockedShopSkillCard);
  const startWithTestStraps = useGameStore(s => s.startWithTestStraps);
  const setStartWithTestStraps = useGameStore(s => s.setStartWithTestStraps);
  return (
    <>
      <Header title="開発施設" subtitle="スキル強化訓練 / サブウェポン陳列レベル解放" onBack={onBack} />
      <div className="p-3">
        <SkillGacha />
      </div>
      <div className="px-3 pb-3 grid grid-cols-1 gap-2">
        <button type="button" onClick={() => setStartWithTestStraps(!startWithTestStraps)}
          className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left ${startWithTestStraps ? 'border-amber-300/35 bg-amber-300/15 text-amber-50' : 'border-white/10 bg-white/5 text-white active:bg-white/10'}`}>
          <span><span className="block text-[13px] font-semibold">1000スクラップ開始</span><span className="block text-[11px] text-white/50">{startWithTestStraps ? '次の開始時に1000s所持' : 'テスト用。無料'}</span></span>
          <span className="text-[10px] text-white/45">{startWithTestStraps ? 'ON' : 'OFF'}</span>
        </button>
        {SUB_WEAPON_KEYS.map(skillKey => {
          const level = unlockedShopSkillCards[skillKey] ?? 0;
          const maxed = level >= 3;
          return (
            <button key={skillKey} type="button" disabled={maxed} onClick={() => setUnlockedShopSkillCard(skillKey, Math.min(3, level + 1))}
              className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left ${maxed ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100' : 'border-white/10 bg-white/5 text-white active:bg-white/10'}`}>
              <span><span className="block text-[13px] font-semibold">{subWeaponDisplayName(skillKey)}</span><span className="block text-[11px] text-white/50">商人陳列 Lv{level} → Lv{Math.min(3, level + 1)}</span></span>
              <span className="text-[10px] text-white/45">{maxed ? 'MAX' : '解放'}</span>
            </button>
          );
        })}
      </div>
    </>
  );
};

export default MissionSelect;
