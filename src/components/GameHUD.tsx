import React, { useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useGameStore, subWeaponDisplayName } from '../store/gameStore';
import { shallow } from 'zustand/shallow';
import { formatTime } from '../utils/renderUtils';
import { hasWeaponIcon, weaponIconName } from '../utils/weaponUtils';
import { spritePath } from '../utils/spriteLoader';
import VitalsOrb from './VitalsOrb';
import { NpcDialogue } from './NpcDialogue';
import { LowHpVignette } from './LowHpVignette';
import type { AmmoType } from '../types/game';
import { isAudioMuted, setAudioMuted } from '../audio/audioManager';

// 二人組クエストの進捗(右上スクラップ下・社長裁定v0.25.1686 #8「サブクエスト系は右上の
// スクラップ下に短く表示 n/Nも」)。受領中のみ表示、目標達成で緑+「納品」。
// 購読はプリミティブ3つだけ(受領/キル/納品の時にしか変わらない=React再描画規律)。
const EventQuestPill: React.FC = () => {
  const active = useGameStore(s => s.eventQuestActive);
  const kills = useGameStore(s => s.eventQuestKills);
  const goal = useGameStore(s => s.eventQuestGoalCount);
  if (!active || goal <= 0) return null;
  const done = kills >= goal;
  const label = active === 'forced' ? '変異種討伐' : 'サンプル集め';
  return (
    <div
      className="absolute glass-pill px-3 py-1 text-[12px] font-semibold tabular-nums"
      style={{
        top: 'calc(max(env(safe-area-inset-top), 8px) + 34px)',
        right: 'max(env(safe-area-inset-right), 12px)',
        color: done ? '#4ade80' : '#e2e8f0',
      }}
    >
      🧪 {label} {Math.min(kills, goal)}/{goal}{done ? ' 納品' : ''}
    </div>
  );
};

const GameHUD: React.FC = () => {
  const [audioMuted, setAudioMutedState] = useState(isAudioMuted);
  // player 全体ではなく HUD が使うフィールドだけを shallow 購読(移動で毎フレーム再描画しないように)。
  const player = useGameStore(s => ({
    weapons: s.player.weapons,
    activeWeaponId: s.player.activeWeaponId,
    ammoHandgun: s.player.ammoHandgun,
    ammoShotgun: s.player.ammoShotgun,
    ammoRifle: s.player.ammoRifle,
    ammoPhill: s.player.ammoPhill,
    subWeapons: s.player.subWeapons,
    subWeaponLevels: s.player.subWeaponLevels,
    straps: s.player.straps,
  }), shallow);
  // 装備中スキル(サブウェポン)のチップ表示用。村雨を持っていれば刀チップは出さない(同一系統)。
  const equippedSkills = player.subWeapons.filter(
    k => !(k === 'katana' && player.subWeapons.includes('murasame'))
  );
  const setActiveWeapon = useGameStore(state => state.setActiveWeapon);
  const lastWeaponGet = useGameStore(state => state.lastWeaponGet);
  // 時計/ボス警告は1秒粒度で十分。秒で購読し、毎フレーム再描画を避ける。
  const gameTime = useGameStore(state => Math.floor(state.gameTime / 1000)) * 1000;
  // 個別フィールドを購読(rhythm全体を購読すると resync の firstBeatAt 更新で毎フレーム再描画になり重い)。
  // コマンド/入力矢印は Pixi オーバーレイ側で描画。HUDはコンボ数のみ(左上)。
  // 近接フィニッシュのコンボ。ダンス(rhythm)中だけでなく通常の連続フィニッシュでも表示する。
  // コンボ窓(meleeFinishComboUntil)が有効な間だけ出す(7s窓・gameTimeは秒粒度なので失効後~1sで消える)。
  const rhythmCombo = useGameStore(state => state.meleeFinishComboCount);
  const rhythmComboUntil = useGameStore(state => state.meleeFinishComboUntil);
  // イベント発生告知バナー(コンボ表示付近。コンボがあればその下にずらす)。
  const eventBannerText = useGameStore(state => state.eventBannerText);
  const eventBannerUntil = useGameStore(state => state.eventBannerUntil);
  // 配列ではなく派生値だけ購読(敵の移動で配列参照が毎フレーム変わっても、件数/ボス有無が
  // 変わらなければ再描画しない)。FPS/負荷表示は PerfOverlay へ分離済み。
  const formattedTime = formatTime(gameTime / 1000);

  const itemGetVisible = lastWeaponGet !== null && Date.now() - lastWeaponGet.at < 5000;
  const isTreasureGet = lastWeaponGet?.kind === 'treasure';
  const isDataGet = lastWeaponGet?.kind === 'data'; // 研究所の重要データ確保(武器/トレジャーと同じバナーUI)
  // 寄り道POIの入手(PACING_PUZZLE.md §6.24-UX 確定要件2): 警察署スキル/武器庫装備/病院ワクチンを
  // **この同じトースト枠**で出す(「何を貰ったか」と「それが何をするか」を同じ場所で読ませる)。
  // 説明文(desc)/但し書き(note)は store が既存定義(SKILLS・equipmentDescription)から詰めてくる。
  const poiGetKind =
    lastWeaponGet?.kind === 'poi-skill' || lastWeaponGet?.kind === 'poi-equip' || lastWeaponGet?.kind === 'poi-vaccine'
      ? lastWeaponGet.kind
      : null;
  const poiGetIcon = poiGetKind === 'poi-skill' ? '✨' : poiGetKind === 'poi-equip' ? '🎖️' : '💉';
  const poiGetLabel =
    poiGetKind === 'poi-skill' ? 'スキルを入手！' : poiGetKind === 'poi-equip' ? '装備を入手！' : 'ワクチンを入手！';
  const poiGetLabelClass =
    poiGetKind === 'poi-skill' ? 'text-sky-200/85' : poiGetKind === 'poi-equip' ? 'text-amber-100/85' : 'text-emerald-100/85';

  const toggleBgm = (e?: React.PointerEvent<HTMLButtonElement>) => {
    e?.preventDefault();
    e?.stopPropagation();
    const next = !audioMuted;
    setAudioMutedState(next);
    setAudioMuted(next);
  };

  return (
    <div className="absolute inset-0 z-40 pointer-events-none text-white">
      <LowHpVignette />
      {/* Acquisition popup — shows for 5s after picking up notable items. */}
      {itemGetVisible && (
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{ top: 'calc(max(env(safe-area-inset-top), 8px) + 118px)', maxWidth: 'min(88vw, 360px)' }}
        >
          <div className="glass-pill px-4 py-2 flex items-center gap-2 animate-pulse">
            {isTreasureGet && lastWeaponGet!.treasureVariant
              // トレジャーは拾った実物の画像(treasure-N)を表示(社長指示)。variant が無ければ💎にフォールバック。
              ? <img src={spritePath(`treasure-${lastWeaponGet!.treasureVariant}`)} alt="" className="w-7 h-7 object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
              : !isTreasureGet && !isDataGet && !poiGetKind && hasWeaponIcon(lastWeaponGet!.weaponKey)
              ? <img src={spritePath(weaponIconName(lastWeaponGet!.weaponKey!))} alt="" className="w-7 h-7 object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
              : <span className="text-xl">{poiGetKind ? poiGetIcon : isTreasureGet ? '💎' : isDataGet ? '💾' : '🔫'}</span>}
            <div className="leading-tight">
              <div
                className={`text-[10px] font-bold tracking-wide ${
                  poiGetKind ? poiGetLabelClass : isTreasureGet ? 'text-amber-100/85' : isDataGet ? 'text-emerald-100/85' : 'text-purple-200/80'
                }`}
              >
                {poiGetKind ? poiGetLabel : isTreasureGet ? 'トレジャーを入手！' : isDataGet ? 'データを確保！' : '新しい銃器を入手！'}
              </div>
              <div
                className="text-sm font-bold"
                style={{ color: lastWeaponGet!.color ?? '#ffffff' }}
              >
                {lastWeaponGet!.name}
              </div>
              {/* 効果説明1行(寄り道POIの入手のみ)。「何を貰ったか」だけでは何が起きたか分からない
                  =§6.24-UXの穴5への対応。但し書き(note)は警察署スキルの「この出撃のみ」。 */}
              {lastWeaponGet!.desc && (
                <div className="mt-0.5 text-[11px] font-medium text-white/75" style={{ whiteSpace: 'normal' }}>
                  {lastWeaponGet!.desc}
                  {lastWeaponGet!.note && <span className="ml-1 text-amber-200/85">({lastWeaponGet!.note})</span>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* フィニッシュカウンター表示は四神舞仕様で廃止(コンボ段階はミラーボールの色で表現)。
          コンボ状態(meleeFinishComboCount)は内部で継続使用。 */}

      {/* イベント発生告知バナー。コンボ表示があるときはその下にシームレスにずらす(規定秒数まで消えない)。 */}
      {eventBannerText && eventBannerUntil >= gameTime && (
        <div
          className="absolute text-left"
          style={{
            top: (rhythmCombo >= 2 && rhythmComboUntil >= gameTime)
              ? 'calc(max(env(safe-area-inset-top), 8px) + 190px)'
              : 'calc(max(env(safe-area-inset-top), 8px) + 132px)',
            left: 'max(env(safe-area-inset-left), 18px)',
            transition: 'top 0.25s ease',
            // 長い文言(護衛が居ない出撃でPOIの通信がここへフォールバックする時)でも画面外へはみ出さない。
            // 既存のバナーはどれも短いので見た目は変わらない。
            maxWidth: 'min(70vw, 320px)',
          }}
        >
          <div
            className="glass-pill px-3 py-1 text-[13px] font-bold tracking-wide"
            style={{
              color: /成功|達成|救難|凌いだ/.test(eventBannerText) ? '#bbf7d0' : /危険|デンジャー|汚染|深層|検知/.test(eventBannerText) ? '#fecaca' : '#bae6fd',
              border: `1px solid ${/成功|達成|救難|凌いだ/.test(eventBannerText) ? 'rgba(74,222,128,0.6)' : /危険|デンジャー|汚染|深層|検知/.test(eventBannerText) ? 'rgba(239,68,68,0.6)' : 'rgba(56,189,248,0.6)'}`,
              textShadow: '0 1px 0 rgba(0,0,0,0.9)',
            }}
          >
            {eventBannerText}
          </div>
        </div>
      )}

      {/* コンボ数を左上に表示(近接フィニッシュ/四神舞 共通)。コマンド/入力矢印は Pixi 頭上オーバーレイ側。 */}
      {rhythmCombo >= 2 && rhythmComboUntil >= gameTime && (
        <div
          className="absolute text-left"
          style={{
            top: 'calc(max(env(safe-area-inset-top), 8px) + 132px)',
            left: 'max(env(safe-area-inset-left), 18px)',
          }}
        >
          <div className="leading-none">
            <div
              className="text-[9px] tracking-[0.18em] text-amber-100/75 font-bold"
              style={{ textShadow: '0 1px 0 rgba(0,0,0,0.9), 0 0 6px rgba(251,191,36,0.35)' }}
            >
              COMBO
            </div>
            <div
              className="font-black tabular-nums text-amber-100"
              style={{ WebkitTextStroke: '1px rgba(20,12,4,0.86)', textShadow: '0 2px 0 rgba(0,0,0,0.55), 0 0 14px rgba(251,191,36,0.28)' }}
            >
              <span key={`combo-${rhythmCombo}`} className="combo-count-pop inline-block text-3xl">{rhythmCombo}</span>
            </div>
          </div>
        </div>
      )}

      {/* NPCリアルタイムセリフ(コンボ/アテンションの下・優先度はその次)。 */}
      <NpcDialogue />

      {/* Timer(中央)=両サイドフェードの黒背景(枠なし) */}
      <div
        className="absolute left-1/2 -translate-x-1/2 glass-pill-both px-5 py-1 text-[13px] font-semibold tabular-nums"
        style={{ top: 'max(env(safe-area-inset-top), 8px)' }}
      >
        {formattedTime}
      </div>
      {/* スクラップ(右)=右フェード(枠なし) */}
      <div
        className="absolute glass-pill px-3 py-1 text-[13px] font-semibold tabular-nums"
        style={{
          top: 'max(env(safe-area-inset-top), 8px)',
          right: 'max(env(safe-area-inset-right), 12px)'
        }}
      >
        🔩 {player.straps}
      </div>
      <EventQuestPill />

      {/* フィナーレボスの予告/常時バナーは廃止。出現時の告知は city/castle 側の eventBanner「危険変異体出現」に一本化。 */}

      {/* バイタル: HP球体 + 外周EXPリング(被弾点滅)。左上に配置(タイマーが中央へ移った分、上へ)。 */}
      <div
        className="absolute"
        style={{
          top: 'max(env(safe-area-inset-top), 8px)',
          left: 'max(env(safe-area-inset-left), 12px)'
        }}
      >
        <VitalsOrb />
      </div>

      {/* 右側にまとめた装備UI: 装備スキル(詳細) + 武器(アイコンのみ・銃はタップで切替)。下端から上へ縦並び。 */}
      {(() => {
        const guns = player.weapons.filter(w => !w.isMelee);
        const melee = player.weapons.find(w => w.isMelee);
        const activeGun = guns.find(w => w.id === player.activeWeaponId) ?? guns[0];
        const ammoFieldFor = (t: AmmoType) =>
          t === 'handgun' ? player.ammoHandgun : t === 'shotgun' ? player.ammoShotgun : t === 'phill' ? player.ammoPhill : player.ammoRifle;
        const murasameEquipped = player.subWeapons.includes('murasame');
        const katanaEquipped = murasameEquipped || player.subWeapons.includes('katana');
        const whipEquipped = !katanaEquipped && player.subWeapons.includes('whip');
        return (
          <div
            className="absolute flex flex-col items-end gap-1.5 pointer-events-none"
            style={{
              right: 'max(env(safe-area-inset-right), 12px)',
              top: '58%',
              transform: 'translateY(-50%)'
            }}
          >
            {/* 装備スキル(サブウェポン)= 装備の詳細。コンパクトに縦並び。 */}
            {equippedSkills.length > 0 && (
              <div className="flex flex-col items-end gap-1">
                {equippedSkills.map(key => (
                  <div
                    key={key}
                    className="glass-pill px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1"
                  >
                    <span className="text-purple-200/90">{subWeaponDisplayName(key)}</span>
                    <span className="text-white/45 tabular-nums">Lv{player.subWeaponLevels[key] ?? 1}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 武器: アイコンのみ。銃=タップで切替(押せるボタン)/弾数のみ表示・名前なし。メレー=表示のみ。 */}
            <div className="hud-translucent rounded-none p-1.5 flex flex-col items-end gap-1.5">
              {/* メレー枠(切替なし=アイコン表示のみ)。刀/鞭装備時はそれを表示。 */}
              {melee && (
                <div
                  className="w-11 h-11 rounded-none bg-purple-400/12 flex items-center justify-center text-lg"
                  title={katanaEquipped ? (murasameEquipped ? '小烏丸' : '刀') : whipEquipped ? '鞭' : melee.name}
                >
                  {katanaEquipped
                    // 刀/小烏丸(村雨)とも、背中に背負う鞘入り刀の絵(katana-item)をそのままアイコンへ流用(社長指示)。
                    ? <img src={spritePath('katana-item')} alt="" className="w-9 h-9 object-contain" draggable={false} />
                    : whipEquipped ? '➰'
                    : hasWeaponIcon(melee.key)
                      ? <img src={spritePath(weaponIconName(melee.key!))} alt="" className="w-8 h-8 object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
                      : '🔪'}
                </div>
              )}
              {/* 銃スロット(所持カテゴリごと1つ)。タップで切替。弾数=装填/リザーブのみ(名前なし)。 */}
              {guns.map(gun => {
                const ammoType = gun.ammoType;
                const reserve = ammoType ? ammoFieldFor(ammoType) : 0;
                const mag = gun.magazine ?? 0;
                const dry = mag <= 0 && reserve <= 0;
                const active = gun.id === activeGun?.id;
                return (
                  <button
                    key={gun.id}
                    // タッチでの反応を良くする: onClick(touchend待ち＋クリック遅延＋微ドラッグで無効化)ではなく
                    // onPointerDown で押した瞬間に切替。touchAction:manipulation でタップ遅延も除去(社長指示)。
                    onPointerDown={(e) => { e.preventDefault(); setActiveWeapon(gun.id); }}
                    style={{ touchAction: 'manipulation' }}
                    className={`pointer-events-auto relative w-11 h-11 rounded-none flex items-center justify-center overflow-hidden transition-colors ${
                      active ? 'bg-purple-500/25 ring-1 ring-purple-400/80' : dry ? 'bg-purple-400/5 opacity-50' : 'bg-purple-500/12 opacity-80'
                    }`}
                    title={gun.name}
                    aria-label={gun.name}
                  >
                    {hasWeaponIcon(gun.key)
                      ? <img src={spritePath(weaponIconName(gun.key!))} alt="" className="w-8 h-8 object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
                      : <span className="text-lg">🔫</span>}
                    {/* 弾数バッジ(右下・小さく)。装填/リザーブ。 */}
                    <span
                      className={`absolute bottom-0 right-0.5 text-[9px] font-bold tabular-nums leading-none ${
                        dry ? 'text-red-400 animate-pulse' : 'text-white'
                      }`}
                      style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}
                    >
                      {mag}<span className="text-[7px] text-white/45">/{reserve}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Stats(撃破/DMG/SCRAP)は StatsHud に分離(頻繁な再描画をHUD本体から切り離す)。 */}

      {/* BGM toggle: 右下・一時停止(MobileControls の "II")のすぐ上に配置。 */}
      <button
        type="button"
        onPointerDown={toggleBgm}
        className="pointer-events-auto absolute w-9 h-9 rounded-full hud-translucent flex items-center justify-center text-white/70 active:text-white"
        style={{
          right: 'max(env(safe-area-inset-right), 16px)',
          bottom: 'calc(max(env(safe-area-inset-bottom), 24px) + 48px)'
        }}
        title={audioMuted ? 'Audio on' : 'Audio off'}
        aria-label={audioMuted ? 'Audio on' : 'Audio off'}
      >
        {audioMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
      </button>
    </div>
  );
};

export default GameHUD;
