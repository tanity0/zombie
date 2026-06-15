import React, { useState } from 'react';
import { Settings, ShoppingBag, Volume2, VolumeX } from 'lucide-react';
import { subWeaponDisplayName, useGameStore } from '../store/gameStore';
import type { AmmoType, SubWeaponKey } from '../types/game';
import {
  getBgmVolume,
  getSfxVolume,
  isAudioMuted,
  setAudioMuted,
  setBgmVolume,
  setSfxVolume
} from '../audio/audioManager';

interface MainMenuProps {
  onStartGame: (characterClass: string) => void;
  onStartBenchmark: (characterClass: string) => void;
}

const MainMenu: React.FC<MainMenuProps> = ({ onStartGame, onStartBenchmark }) => {
  const [selectedClass, setSelectedClass] = useState('warrior');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [audioMuted, setAudioMutedState] = useState(isAudioMuted);
  const [bgmVol, setBgmVol] = useState(getBgmVolume);
  const [sfxVol, setSfxVol] = useState(getSfxVolume);

  // Start-screen ammo drop-rate setting (persisted in the store/localStorage).
  const meleeAmmoDropPercent = useGameStore(s => s.meleeAmmoDropPercent);
  const setMeleeAmmoDropPercent = useGameStore(s => s.setMeleeAmmoDropPercent);
  const ammoPickupAmounts = useGameStore(s => s.ammoPickupAmounts);
  const setAmmoPickupAmount = useGameStore(s => s.setAmmoPickupAmount);
  const unlockedShopSkillCards = useGameStore(s => s.unlockedShopSkillCards);
  const setUnlockedShopSkillCard = useGameStore(s => s.setUnlockedShopSkillCard);
  const startWithTestStraps = useGameStore(s => s.startWithTestStraps);
  const setStartWithTestStraps = useGameStore(s => s.setStartWithTestStraps);
  const showStatsOverlay = useGameStore(s => s.showStatsOverlay);
  const setShowStatsOverlay = useGameStore(s => s.setShowStatsOverlay);
  const setDanceTestMode = useGameStore(s => s.setDanceTestMode);
  const setDanceTestLevel = useGameStore(s => s.setDanceTestLevel);
  const [dropInput, setDropInput] = useState(String(meleeAmmoDropPercent));
  const [ammoInputs, setAmmoInputs] = useState<Record<AmmoType, string>>({
    handgun: String(ammoPickupAmounts.handgun),
    shotgun: String(ammoPickupAmounts.shotgun),
    rifle: String(ammoPickupAmounts.rifle)
  });

  const commitDrop = (raw: string) => {
    setDropInput(raw);
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n)) setMeleeAmmoDropPercent(n);
  };
  const normalizeDrop = () => {
    setDropInput(String(useGameStore.getState().meleeAmmoDropPercent));
  };
  const commitAmmoPickup = (type: AmmoType, raw: string) => {
    setAmmoInputs(prev => ({ ...prev, [type]: raw }));
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n)) setAmmoPickupAmount(type, n);
  };
  const normalizeAmmoPickup = (type: AmmoType) => {
    setAmmoInputs(prev => ({
      ...prev,
      [type]: String(useGameStore.getState().ammoPickupAmounts[type])
    }));
  };
  const toggleAudio = () => {
    const next = !audioMuted;
    setAudioMutedState(next);
    setAudioMuted(next);
  };
  const changeBgmVolume = (raw: string) => {
    const next = Number(raw) / 100;
    setBgmVol(next);
    setBgmVolume(next);
  };
  const changeSfxVolume = (raw: string) => {
    const next = Number(raw) / 100;
    setSfxVol(next);
    setSfxVolume(next);
  };
  const spriteVersion = encodeURIComponent(__APP_VERSION__);
  
  // 性能差は撤廃(全員同一性能)。違いは「初期装備」と「専用スキル」のみ表示。
  // 立ち絵スプライト(128x108)はキャラごとに足元位置が微妙に違う(キャンバス底からの隙間: shotgun=4px /
  // magnum=0 / scavenger=0 / striker=1px)。足元を底ライン(影)へ揃えるため、各キャラを少し下へずらす(画面px)。
  // 画面拡縮 = 86/128 ≒ 0.672 を掛けた値。
  const characterClasses: {
    id: string; name: string; sprite: string; accent: string;
    gear: string; skillKey: SubWeaponKey; skillDesc: string; portraitNudgeY: number;
  }[] = [
    {
      id: 'warrior',
      name: 'ヘビーガンナー',
      sprite: `${import.meta.env.BASE_URL}sprites/player-shotgun-walk-0.png?v=${spriteVersion}`,
      accent: 'rgba(248, 113, 113, 0.55)',
      gear: 'ソードオフ・ショットガン ＋ ハチェット',
      skillKey: 'heavy-grenade',
      skillDesc: '前方へ手榴弾を転がし、着弾で小範囲を爆破',
      portraitNudgeY: 2.7, // 足元が4px上 → 底へ
    },
    {
      id: 'mage',
      name: 'マークスマン',
      sprite: `${import.meta.env.BASE_URL}sprites/player-magnum-walk-0.png?v=${spriteVersion}`,
      accent: 'rgba(168, 85, 247, 0.52)',
      gear: 'マグナム ＋ ナイフ',
      skillKey: 'marksman-trap',
      skillDesc: '足元に起爆トラップを設置して足止め＆爆破',
      portraitNudgeY: 0, // 構造修正(行をカード高さに伸ばす)で浮きは解消。足元はキャンバス底=他と同じ
    },
    {
      id: 'rogue',
      name: 'ストライカー',
      sprite: `${import.meta.env.BASE_URL}sprites/player-scavenger-walk-0.png?v=${spriteVersion}`,
      accent: 'rgba(52, 211, 153, 0.48)',
      gear: 'ハンドガン ＋ ファイティングナイフ',
      skillKey: 'striker-hunting',
      skillDesc: '近接の間合いを広げる狩猟術(チャージで強化)',
      portraitNudgeY: 0,
    },
    {
      id: 'necromancer',
      name: 'スカベンジャー',
      sprite: `${import.meta.env.BASE_URL}sprites/player-striker-walk-0.png?v=${spriteVersion}`,
      accent: 'rgba(129, 140, 248, 0.48)',
      gear: 'ハンドガン ＋ ハチェット',
      skillKey: 'striker-quick-mag',
      skillDesc: 'クイックリロードでマガジンを即装填',
      portraitNudgeY: 0.7, // 足元が1px上 → 底へ
    }
  ];
  const ammoDebugFields: { type: AmmoType; label: string }[] = [
    { type: 'handgun', label: 'ハンドガン' },
    { type: 'shotgun', label: 'ショットガン' },
    { type: 'rifle', label: 'ライフル' }
  ];
  const skillShopEntries: SubWeaponKey[] = [
    'heavy-grenade',
    'marksman-trap',
    'striker-hunting',
    'striker-quick-mag',
    'dog',
    'katana',
    'decoy',
    'shield',
    'whip',
    'alchemy',
    'turret',
    'shijin'
  ];
  
  return (
    <div
      className="h-full w-full flex flex-col items-center justify-start bg-[#0b0b12] overflow-y-auto overscroll-contain"
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 16px)',
        paddingBottom: 'max(calc(env(safe-area-inset-bottom) + 24px), 40px)',
        paddingLeft: 'max(env(safe-area-inset-left), 12px)',
        paddingRight: 'max(env(safe-area-inset-right), 12px)'
      }}
    >
      <div className="max-w-3xl w-full shrink-0 glass-panel rounded-3xl overflow-hidden">
        <div className="relative px-5 pt-6 pb-3 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            ゾンビサバイバル
          </h1>
          <p className="text-[13px] text-white/60 mt-1">
            弾を節約し、群れを捌いて生き延びろ
          </p>
          <span className="absolute top-3 right-3 glass-pill px-2 py-0.5 text-[10px] font-mono tabular-nums text-white/70">
            v{__APP_VERSION__}
          </span>
          <button
            onClick={() => setSettingsOpen(v => !v)}
            className="absolute top-3 left-3 w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-white/80 flex items-center justify-center active:bg-white/10"
            aria-label="設定"
            title="設定"
          >
            <Settings size={17} />
          </button>
        </div>

        <div className="p-3">
          <h2 className="text-[13px] uppercase tracking-widest text-white/50 mb-2 px-1">
            キャラクターを選択
          </h2>

          <div className="grid grid-cols-2 gap-2 mb-4">
            {characterClasses.map((charClass) => (
              <div
                key={charClass.id}
                className={`relative flex flex-col min-h-[154px] overflow-hidden rounded-2xl transition-colors cursor-pointer border ${
                  selectedClass === charClass.id
                    ? 'bg-blue-500/15 border-blue-400/60'
                    : 'bg-white/5 border-white/10 active:bg-white/10'
                }`}
                onClick={() => setSelectedClass(charClass.id)}
              >
                <div
                  className="pointer-events-none absolute -left-7 -bottom-8 w-32 h-32 rounded-full blur-2xl opacity-40"
                  style={{ backgroundColor: charClass.accent }}
                />
                {/* 職名はカード上部に横一列(フル幅)で置く。立ち絵の上の空きを使い、名前が窮屈にならない。 */}
                <h3 className="relative px-3 pt-2.5 pb-1 text-base font-semibold text-white leading-tight">
                  {charClass.name}
                </h3>
                {/* flex-1 でカード(グリッドで等高に伸びる)の高さいっぱいに行を広げ、立ち絵を「説明文の量」ではなく
                    カード下端に揃える(説明文が短いカードで立ち絵が浮くのを防ぐ)。 */}
                <div className="relative flex min-h-[122px] flex-1">
                  <div className="relative w-[86px] flex-shrink-0 flex items-end justify-center pt-3 pb-2">
                    <div
                      className={`absolute bottom-2 h-6 w-16 rounded-full blur-md transition-opacity ${
                        selectedClass === charClass.id ? 'opacity-80' : 'opacity-35'
                      }`}
                      style={{ backgroundColor: charClass.accent }}
                    />
                    <img
                      src={charClass.sprite}
                      alt={charClass.name}
                      className="relative z-10 max-h-[122px] max-w-[86px] object-contain drop-shadow-[0_10px_16px_rgba(0,0,0,0.55)]"
                      style={{
                        imageRendering: 'pixelated',
                        // 足元を底ラインへ揃える微小ナッジ + 選択時の拡大。
                        transform: `translateY(${charClass.portraitNudgeY}px) ${selectedClass === charClass.id ? 'scale(1.06)' : 'scale(1)'}`,
                        transformOrigin: '50% 100%',
                        transition: 'transform 140ms ease-out'
                      }}
                    />
                  </div>
                  <div className="relative flex-1 min-w-0 px-2.5 py-3">
                    <div className="space-y-2 text-left">
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-white/40">初期装備</div>
                        <div className="text-[11px] leading-snug text-gray-200">{charClass.gear}</div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-white/40">専用スキル</div>
                        <div className="text-[12px] font-semibold leading-tight text-amber-200/90">{subWeaponDisplayName(charClass.skillKey)}</div>
                        <div className="text-[10px] leading-snug text-gray-300">{charClass.skillDesc}</div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {selectedClass === charClass.id && (
                  <>
                    <div className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.8)]" />
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-300/80 shadow-[0_0_14px_rgba(147,197,253,0.9)]" />
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="mb-4 px-1">
            <button
              type="button"
              onClick={() => setShopOpen(v => !v)}
              className="w-full rounded-2xl border border-amber-200/25 bg-amber-300/10 px-3 py-2.5 text-left text-amber-50 active:bg-amber-300/15"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <ShoppingBag size={16} />
                  スキルショップ
                </span>
                <span className="text-[11px] text-amber-100/65">0G</span>
              </span>
            </button>

            {shopOpen && (
              <div className="mt-2 grid grid-cols-1 gap-2 rounded-2xl border border-white/10 bg-black/20 p-2">
                <button
                  type="button"
                  onClick={() => setStartWithTestStraps(!startWithTestStraps)}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left ${
                    startWithTestStraps
                      ? 'border-amber-300/35 bg-amber-300/15 text-amber-50'
                      : 'border-white/10 bg-white/5 text-white active:bg-white/10'
                  }`}
                >
                  <span>
                    <span className="block text-[13px] font-semibold">1000スクラップ開始</span>
                    <span className="block text-[11px] text-white/50">
                      {startWithTestStraps ? '次の開始時に1000s所持' : 'テスト用。無料'}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[12px] font-semibold text-amber-100">0G</span>
                    <span className="block text-[10px] text-white/45">{startWithTestStraps ? 'ON' : 'OFF'}</span>
                  </span>
                </button>
                {skillShopEntries.map(skillKey => {
                  const level = unlockedShopSkillCards[skillKey] ?? 0;
                  const maxed = level >= 3;
                  return (
                    <button
                      key={skillKey}
                      type="button"
                      onClick={() => setUnlockedShopSkillCard(skillKey, Math.min(3, level + 1))}
                      disabled={maxed}
                      className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left ${
                        maxed
                          ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100'
                          : 'border-white/10 bg-white/5 text-white active:bg-white/10'
                      }`}
                    >
                      <span>
                        <span className="block text-[13px] font-semibold">{subWeaponDisplayName(skillKey)}</span>
                        <span className="block text-[11px] text-white/50">商人陳列 Lv{level} → Lv{Math.min(3, level + 1)}</span>
                      </span>
                      <span className="text-right">
                        <span className="block text-[12px] font-semibold text-amber-100">0G</span>
                        <span className="block text-[10px] text-white/45">{maxed ? 'MAX' : '購入'}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col items-center px-2">
            {settingsOpen && (
              <div className="w-full mb-3 rounded-2xl bg-white/5 border border-white/10 px-3 py-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-left">
                    <div className="text-[13px] font-medium text-white">弾ドロップ率</div>
                    <div className="text-[11px] text-white/50">デバッグ用。撃破時。近接フィニッシュは×1.5。</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={100}
                      value={dropInput}
                      onChange={(e) => commitDrop(e.target.value)}
                      onBlur={normalizeDrop}
                      className="w-16 text-right bg-white/10 border border-white/15 rounded-lg px-2 py-1 text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-400/60"
                    />
                    <span className="text-white/60 text-sm">%</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/15 px-3 py-2">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[13px] font-medium text-white">弾薬箱取得量</div>
                      <div className="text-[11px] text-white/50">デバッグ用。重複武器取得時はこの2倍。</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {ammoDebugFields.map(field => (
                      <label key={field.type} className="block">
                        <span className="mb-1 block text-[10px] text-white/60">{field.label}</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={999}
                          value={ammoInputs[field.type]}
                          onChange={(e) => commitAmmoPickup(field.type, e.target.value)}
                          onBlur={() => normalizeAmmoPickup(field.type)}
                          className="w-full text-right bg-white/10 border border-white/15 rounded-lg px-2 py-1 text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-400/60"
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <label className="block">
                  <div className="mb-1 flex items-center justify-between text-[12px] text-white/70">
                    <span>BGM</span>
                    <span className="tabular-nums">{Math.round(bgmVol * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(bgmVol * 100)}
                    onChange={(e) => changeBgmVolume(e.target.value)}
                    className="w-full accent-blue-400"
                  />
                </label>

                <label className="block">
                  <div className="mb-1 flex items-center justify-between text-[12px] text-white/70">
                    <span>SE</span>
                    <span className="tabular-nums">{Math.round(sfxVol * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(sfxVol * 100)}
                    onChange={(e) => changeSfxVolume(e.target.value)}
                    className="w-full accent-emerald-400"
                  />
                </label>

                <button
                  onClick={toggleAudio}
                  className={`w-full py-2.5 rounded-2xl text-sm font-semibold border flex items-center justify-center gap-2 ${
                    audioMuted
                      ? 'bg-white/5 border-white/10 text-white/70'
                      : 'bg-emerald-400/10 border-emerald-300/35 text-emerald-100'
                  }`}
                  aria-label={audioMuted ? '音をオンにする' : '音をオフにする'}
                >
                  {audioMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
                  {audioMuted ? '音なし' : '音あり'}
                </button>
              </div>
            )}

            <button
              onClick={() => { setDanceTestMode(false); onStartGame(selectedClass); }}
              className="w-full py-3 rounded-2xl text-base font-semibold text-white"
              style={{
                background: 'linear-gradient(180deg, rgba(96, 165, 250, 0.95), rgba(59, 130, 246, 0.95))',
                boxShadow: '0 8px 24px rgba(59, 130, 246, 0.35)'
              }}
            >
              はじめる
            </button>

            {/* 撃破数/FPS表示の有り・無しスタート(既定=無し)。音量ボタン上下のオーバーレイを制御。 */}
            <button
              type="button"
              onClick={() => setShowStatsOverlay(!showStatsOverlay)}
              className={`mt-2 w-full flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left ${
                showStatsOverlay
                  ? 'border-emerald-300/35 bg-emerald-300/15 text-emerald-50'
                  : 'border-white/10 bg-white/5 text-white/80 active:bg-white/10'
              }`}
              aria-pressed={showStatsOverlay}
            >
              <span>
                <span className="block text-[13px] font-semibold">撃破数/FPS表示</span>
                <span className="block text-[11px] text-white/50">
                  {showStatsOverlay ? '表示ありで開始' : '通常は無し(デバッグ用)'}
                </span>
              </span>
              <span className="text-[11px] font-semibold shrink-0">{showStatsOverlay ? 'ON' : 'OFF'}</span>
            </button>

            {/* 仮: ダンス練習モード。敵なし + 指定レベルのダンスフロア所持で開始(サークル/フリック/曲合わせの調整用)。 */}
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] text-fuchsia-200/80 shrink-0">🕺 ダンス練習</span>
              {[1, 2, 3].map(lv => (
                <button
                  key={lv}
                  onClick={() => { setDanceTestMode(true); setDanceTestLevel(lv); onStartGame(selectedClass); }}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold text-fuchsia-100 border border-fuchsia-400/40"
                  style={{ background: 'linear-gradient(180deg, rgba(217,70,239,0.22), rgba(168,85,247,0.22))' }}
                >
                  Lv{lv}
                </button>
              ))}
            </div>

            <div className="mt-3 text-[12px] text-white/60 space-y-1 text-center">
              <p>画面のどこでも指を置いてスワイプ＝移動。銃は自動で発射。</p>
              <p className="text-amber-300/90">
                指を離すと近接攻撃＆弾反射！クリで気絶した敵は一撃で仕留められます。
              </p>
              <p className="text-white/40 text-[11px]">PC: WASD / 矢印で移動・Space で近接カウンター</p>
            </div>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onStartBenchmark(selectedClass)}
        className="fixed rounded-md border border-cyan-200/30 bg-black/35 px-2 py-1 text-[10px] font-semibold tracking-wide text-cyan-100/70 shadow-lg backdrop-blur-sm active:text-white"
        style={{
          right: 'max(env(safe-area-inset-right), 12px)',
          bottom: 'max(env(safe-area-inset-bottom), 10px)',
          zIndex: 60
        }}
      >
        BENCH
      </button>
    </div>
  );
};

export default MainMenu;
