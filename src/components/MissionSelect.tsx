import React, { useEffect, useState } from 'react';
import {
  Settings, ShoppingBag, BookOpen, Swords, Volume2, VolumeX, ChevronLeft, Lock, Check, Play
} from 'lucide-react';
import { subWeaponDisplayName, useGameStore } from '../store/gameStore';
import { rhythmIntervalForLevel } from '../config/shijin';
import { DEV_TOOLS_ENABLED } from '../config/devtools';
import type { AmmoType, CharacterClass, SubWeaponKey } from '../types/game';
import {
  STAGES, getStage, CHARACTER_CLASSES, SUB_WEAPON_KEYS, WORLD_INTRO, BESTIARY, type Stage
} from '../data/campaign';
import {
  getClearedStages, isStageUnlocked, setSelectedStageId, unlockAllStages, resetProgress
} from '../data/progress';
import {
  getBgmVolume, getSfxVolume, isAudioMuted, setAudioMuted, setBgmVolume, setSfxVolume, setBgmScene
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
  | { name: 'equipment'; stageId: string; charId: CharacterClass };

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

const MissionSelect: React.FC<MissionSelectProps> = ({ onStartGame, onStartBenchmark }) => {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [selectedClass, setSelectedClass] = useState<CharacterClass>('warrior');
  const [loadout, setLoadout] = useState<SubWeaponKey[]>([]);     // 装備選択(今は記録のみ)
  const [cleared, setCleared] = useState<Set<string>>(() => getClearedStages());

  // タイトル曲の自動再生制限対策(初回タップで確実に再生開始)。
  useEffect(() => {
    const kick = () => setBgmScene('menu');
    window.addEventListener('pointerdown', kick, { once: true });
    return () => window.removeEventListener('pointerdown', kick);
  }, []);
  // ステージ選択へ入るたびにクリア状況を読み直す(ゲームから戻った直後の解放を反映)。
  const goStageSelect = () => { setCleared(getClearedStages()); setScreen({ name: 'stageSelect' }); };

  // --- 開始処理 ---------------------------------------------------------
  const startMission = (stageId: string, charId: CharacterClass) => {
    useGameStore.getState().setDanceTestMode(false);
    setSelectedStageId(stageId);          // 勝利時にこのステージをクリア扱いにする(App側)
    // loadout は当面「記録のみ」。ゲームへの付与は今後配線する。
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
    return (
      <button
        type="button"
        disabled={!unlocked}
        onClick={() => setScreen({ name: 'missionDetail', stageId: stage.id })}
        className={`w-full flex items-start gap-3 rounded-2xl border px-3 py-3 text-left transition-colors ${
          unlocked ? 'border-white/12 bg-white/5 active:bg-white/10' : 'border-white/8 bg-black/25 opacity-60'
        }`}
      >
        <span className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-[12px] font-bold ${
          stage.kind === 'ex' ? 'bg-fuchsia-400/15 text-fuchsia-100' : 'bg-blue-400/15 text-blue-100'
        }`}>
          {stage.main.code}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-semibold text-white">
            {stage.main.title}
            {done && <span className="ml-2 align-middle text-[10px] text-emerald-300/90">クリア済</span>}
          </span>
          <span className="block text-[11px] text-white/45">{stage.name}・{stage.area}</span>
          {unlocked
            ? (
              <span className="mt-1 block space-y-0.5">
                {stage.main.summary.map((line, i) => (
                  <span key={i} className="block text-[12px] leading-snug text-white/70">{line}</span>
                ))}
              </span>
            )
            : <span className="mt-1 block text-[12px] leading-snug text-white/50">前ステージのクリアで解放</span>}
        </span>
        {unlocked ? <ChevronLeft size={16} className="mt-0.5 rotate-180 text-white/40" /> : <Lock size={15} className="mt-0.5 text-white/40" />}
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
    return (
      <>
        <Header title={`${m.code}：${m.title}`} subtitle={`${stage.name} / ${stage.area}`} onBack={() => setScreen({ name: 'stageSelect' })} />
        <div className="p-3 space-y-3">
          <Section label="ステージ開始前">
            {m.briefing.map((line, i) => <p key={i} className="text-[13px] leading-relaxed text-white/85">{line}</p>)}
            {m.radio && <p className="text-[12px] text-sky-200/55 italic">［無線SE：ガガー……］</p>}
            {m.voices?.map((v, i) => (
              <p key={`v${i}`} className="text-[13px] leading-relaxed text-amber-100/90">
                <span className="text-amber-200/70 mr-1">{v.speaker}</span>{v.text}
              </p>
            ))}
          </Section>

          <Section label="サブミッション">
            {stage.subs.length === 0
              ? <p className="text-[12px] text-white/45">準備中（後日追加）</p>
              : stage.subs.map(s => (
                <div key={s.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="text-[13px] font-semibold text-white">{s.title}</div>
                  <div className="text-[11px] text-white/55">{s.desc}</div>
                </div>
              ))}
          </Section>

          <button
            onClick={() => setScreen({ name: 'characterSelect', stageId })}
            className="w-full py-3 rounded-2xl text-base font-semibold text-white"
            style={{ background: 'linear-gradient(180deg, rgba(96,165,250,0.95), rgba(59,130,246,0.95))', boxShadow: '0 8px 24px rgba(59,130,246,0.35)' }}
          >
            出撃準備（キャラ選択へ）
          </button>
        </div>
      </>
    );
  };

  // ====================================================================
  // キャラクター選択
  // ====================================================================
  const renderCharacterSelect = (stageId: string) => (
    <>
      <Header title="キャラクター選択" subtitle="性能差なし。初期装備と専用スキルで選ぶ" onBack={() => setScreen({ name: 'missionDetail', stageId })} />
      <div className="p-3">
        <div className="grid grid-cols-2 gap-2 mb-4">
          {CHARACTER_CLASSES.map(c => (
            <div
              key={c.id}
              onClick={() => setSelectedClass(c.id)}
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
                </div>
              </div>
              {selectedClass === c.id && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-300/80 shadow-[0_0_14px_rgba(147,197,253,0.9)]" />}
            </div>
          ))}
        </div>
        <button
          onClick={() => setScreen({ name: 'equipment', stageId, charId: selectedClass })}
          className="w-full py-3 rounded-2xl text-base font-semibold text-white"
          style={{ background: 'linear-gradient(180deg, rgba(96,165,250,0.95), rgba(59,130,246,0.95))', boxShadow: '0 8px 24px rgba(59,130,246,0.35)' }}
        >
          装備選択へ
        </button>
      </div>
    </>
  );

  // ====================================================================
  // 装備選択(サブウェポン) — 今は選択を記録するだけ
  // ====================================================================
  const renderEquipment = (stageId: string, charId: CharacterClass) => {
    const toggle = (k: SubWeaponKey) => setLoadout(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);
    return (
      <>
        <Header title="装備選択（サブウェポン）" subtitle="選んだ装備でスタート（反映は今後）" onBack={() => setScreen({ name: 'characterSelect', stageId })} />
        <div className="p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {SUB_WEAPON_KEYS.map(k => {
              const on = loadout.includes(k);
              return (
                <button
                  key={k}
                  onClick={() => toggle(k)}
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
          <p className="text-[11px] text-white/45 text-center">選択中: {loadout.length === 0 ? 'なし' : loadout.map(k => subWeaponDisplayName(k)).join(' / ')}</p>
          <button
            onClick={() => startMission(stageId, charId)}
            className="w-full py-3.5 rounded-2xl text-lg font-bold text-white flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(180deg, rgba(52,211,153,0.95), rgba(16,185,129,0.95))', boxShadow: '0 8px 24px rgba(16,185,129,0.35)' }}
          >
            <Play size={20} /> スタート
          </button>
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
      {screen.name === 'equipment' && renderEquipment(screen.stageId, screen.charId)}
      {screen.name === 'options' && renderOptions()}
      {screen.name === 'weaponDev' && renderWeaponDev()}
      {screen.name === 'archive' && renderArchive()}
    </Shell>
  );
};

// === 共通の小物 =========================================================
const HubButton: React.FC<{ icon: React.ReactNode; label: string; desc: string; onClick: () => void; accent?: boolean }> = ({ icon, label, desc, onClick, accent }) => (
  <button
    onClick={onClick}
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
        <button type="button" onClick={startDancePractice} className="w-full py-2 rounded-xl text-sm font-bold text-white border border-fuchsia-300/60"
          style={{ background: 'linear-gradient(180deg, rgba(217,70,239,0.45), rgba(168,85,247,0.45))' }}>決定（開始）</button>
      </div>

      {/* BENCH */}
      <button type="button" onClick={() => { setSelectedStageId(''); onStartBenchmark(selectedClass); }}
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

// === 武器開発(スキルショップ) ==========================================
const WeaponDev: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const unlockedShopSkillCards = useGameStore(s => s.unlockedShopSkillCards);
  const setUnlockedShopSkillCard = useGameStore(s => s.setUnlockedShopSkillCard);
  const startWithTestStraps = useGameStore(s => s.startWithTestStraps);
  const setStartWithTestStraps = useGameStore(s => s.setStartWithTestStraps);
  return (
    <>
      <Header title="武器開発" subtitle="サブウェポン(スキル)の陳列レベル解放" onBack={onBack} />
      <div className="p-3 grid grid-cols-1 gap-2">
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
