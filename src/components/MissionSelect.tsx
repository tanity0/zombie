import React, { useEffect, useState } from 'react';
import {
  Settings, ShoppingBag, BookOpen, Swords, Volume2, VolumeX, ChevronLeft, Lock, Check, Play, Sparkles
} from 'lucide-react';
import { getBloomEnabled, setBloomEnabled } from '../config/graphics';
import { subWeaponDisplayName, useGameStore, getCarriedEquipId } from '../store/gameStore';
import { equipmentById, equipmentDescription, equipIconName, hasEquipIcon } from '../data/equipment';
import { spritePath } from '../utils/spriteLoader';
import { rhythmIntervalForLevel } from '../config/shijin';
import { DEV_TOOLS_ENABLED } from '../config/devtools';
import type { AmmoType, CharacterClass, SubWeaponKey, SkillKey } from '../types/game';
import {
  STAGES, getStage, CHARACTER_CLASSES, SUB_WEAPON_KEYS, SKILL_KEYS, SKILLS, MAX_EQUIPPED_SKILLS, WORLD_INTRO, BESTIARY,
  GACHA_PULL_COST, GACHA_REFUND_BY_RARITY, RARITY_LABEL, rollGachaSkill, type SkillRarity, type Stage
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
// ホームからはオプション / 武器開発 / 資料室 へも分岐する。UIデザインは後追い(ここは導線優先の仮UI)。
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
    className="h-full w-full flex flex-col items-center justify-start bg-[#0b0b12] overflow-y-auto overscroll-contain"
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
    <div className="max-w-3xl w-full shrink-0 glass-panel rounded-3xl overflow-hidden">{children}</div>
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
        <HubButton icon={<ShoppingBag size={18} />} label="武器開発" desc="スキル/サブウェポンの解放" onClick={() => setScreen({ name: 'weaponDev' })} />
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
                解禁済みのスキルがありません。武器開発のスキルガチャでゴールドを使って解禁してください。
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
                        <span className="text-[13px] font-semibold">{SKILLS[k].name}</span>
                        {on && <Check size={15} className="shrink-0" />}
                      </span>
                      <span className={`text-[9px] font-semibold uppercase tracking-wider ${RARITY_TEXT[rarity]}`}>{RARITY_LABEL[rarity]}</span>
                      <span className="text-[10px] leading-snug text-white/50">{SKILLS[k].desc}</span>
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
              {SUB_WEAPON_KEYS.map(k => {
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
  // 武器開発(スキルショップ: サブウェポンの陳列レベル解放)
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

// === スキルガチャ(武器開発トップに組み込み) ===========================
// ゴールド残高で1回引く。当選=所持解禁、重複=レア度別ゴールド返金。
type GachaResult = { key: SkillKey; rarity: SkillRarity; duplicate: boolean; refund: number };
const SkillGacha: React.FC = () => {
  const goldBalance = useGameStore(s => s.goldBalance);
  const ownedCount = useGameStore(s => s.ownedSkills.length);
  const grantSkill = useGameStore(s => s.grantSkill);
  const spendGold = useGameStore(s => s.spendGold);
  const addGold = useGameStore(s => s.addGold);
  const [result, setResult] = useState<GachaResult | null>(null);
  const [noGold, setNoGold] = useState(false);

  const pull = () => {
    setNoGold(false);
    // コスト0(無料)のときは課金スキップ。有料のときだけ残高を消費。
    if (GACHA_PULL_COST > 0 && !spendGold(GACHA_PULL_COST)) { setNoGold(true); setResult(null); return; }
    const key = rollGachaSkill();
    const rarity = SKILLS[key].rarity;
    const duplicate = useGameStore.getState().ownedSkills.includes(key);
    if (duplicate) {
      const refund = GACHA_REFUND_BY_RARITY[rarity];
      addGold(refund);
      setResult({ key, rarity, duplicate, refund });
    } else {
      grantSkill(key);
      setResult({ key, rarity, duplicate, refund: 0 });
    }
  };

  return (
    <div className="rounded-2xl border border-fuchsia-300/30 bg-fuchsia-300/[0.06] p-3 mb-3">
      <div className="flex items-center justify-between px-0.5 mb-2">
        <span className="text-[12px] font-semibold text-fuchsia-100">スキルガチャ</span>
        <span className="text-[12px] text-amber-200 font-semibold">所持ゴールド {goldBalance.toLocaleString()}</span>
      </div>
      <p className="text-[10px] leading-snug text-white/50 mb-2">
        装備スキルをゴールドで解禁。{RARITY_LABEL.normal}60% / {RARITY_LABEL.rare}35% / {RARITY_LABEL.super}5%。重複はゴールド返金。解禁済み {ownedCount}/{SKILL_KEYS.length}
      </p>
      <button
        type="button"
        onClick={pull}
        disabled={goldBalance < GACHA_PULL_COST}
        className={`w-full rounded-xl px-3 py-2.5 text-[13px] font-semibold ${
          goldBalance < GACHA_PULL_COST
            ? 'border border-white/10 bg-white/[0.03] text-white/30'
            : 'border border-fuchsia-300/50 bg-fuchsia-400/20 text-fuchsia-50 active:bg-fuchsia-400/30'
        }`}
      >
        {GACHA_PULL_COST > 0 ? `1回引く（${GACHA_PULL_COST} ゴールド）` : '1回引く（無料）'}
      </button>
      {noGold && <p className="mt-2 text-[11px] text-rose-300 text-center">ゴールドが足りません。</p>}
      {result && (
        <div className={`mt-2 rounded-xl border px-3 py-2 ${RARITY_BORDER[result.rarity]} bg-black/20`}>
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-white">{SKILLS[result.key].name}</span>
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${RARITY_TEXT[result.rarity]}`}>{RARITY_LABEL[result.rarity]}</span>
          </div>
          <p className="text-[10px] leading-snug text-white/55 mt-0.5">{SKILLS[result.key].desc}</p>
          <p className={`text-[11px] mt-1 font-semibold ${result.duplicate ? 'text-amber-200' : 'text-emerald-300'}`}>
            {result.duplicate ? `重複 → ${result.refund} ゴールド返金` : '新規解禁！'}
          </p>
        </div>
      )}
    </div>
  );
};

// === 武器開発(スキルショップ) ==========================================
const WeaponDev: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const unlockedShopSkillCards = useGameStore(s => s.unlockedShopSkillCards);
  const setUnlockedShopSkillCard = useGameStore(s => s.setUnlockedShopSkillCard);
  const startWithTestStraps = useGameStore(s => s.startWithTestStraps);
  const setStartWithTestStraps = useGameStore(s => s.setStartWithTestStraps);
  return (
    <>
      <Header title="武器開発" subtitle="スキルガチャ / サブウェポン陳列レベル解放" onBack={onBack} />
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
