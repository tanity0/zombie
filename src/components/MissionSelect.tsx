import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// 任務詳細のタイピング表示(社長指示v0.25.1847: クリア前=状況説明/クリア後=任務後の記録のみ)。
// 行ごとに順に1文字ずつ表示(タイプ中は▌カーソル)。メニュー画面(ゲーム外)専用で、
// 短周期の再レンダーはこの小コンポーネント内に閉じる(打ち終わったらタイマー停止)。
// 資料本文の強調語(共有パッケージ2026-07-23): 該当フレーズを太字+琥珀で表示。
// 「色だけに依存せず、通常文字でも意味が通るように」(パッケージ実装原則)=装飾のみで情報は本文に完結。
const renderEmphasizedLine = (line: string, emphasis?: string[]): React.ReactNode => {
  if (!emphasis?.length) return line;
  let parts: React.ReactNode[] = [line];
  emphasis.forEach((em, ei) => {
    if (!em) return;
    parts = parts.flatMap((p, pi) => {
      if (typeof p !== 'string' || !p.includes(em)) return [p];
      const segs = p.split(em);
      const out: React.ReactNode[] = [];
      segs.forEach((s, si) => {
        if (si > 0) out.push(<strong key={`em-${ei}-${pi}-${si}`} className="font-semibold text-amber-200">{em}</strong>);
        if (s) out.push(s);
      });
      return out;
    });
  });
  return parts;
};

const TYPE_CHAR_MS = 28;      // 1文字あたり(叩き台。IntroDialogueの55msより読み物向けに速め)
const TYPE_LINE_GAP_MS = 260; // 行間の間
const TypewriterLines: React.FC<{ lines: string[]; className: string; resetKey: string; onDone?: () => void }> = ({ lines, className, resetKey, onDone }) => {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    const startedAt = Date.now();
    const total = lines.reduce((s, l) => s + l.length * TYPE_CHAR_MS + TYPE_LINE_GAP_MS, 0);
    if (total <= 0) { onDone?.(); return; }
    const iv = window.setInterval(() => {
      const el = Date.now() - startedAt;
      setElapsed(el);
      if (el >= total) { window.clearInterval(iv); onDone?.(); }
    }, 33);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);
  let remaining = elapsed;
  return (
    <>
      {lines.map((line, i) => {
        const lineTotal = line.length * TYPE_CHAR_MS + TYPE_LINE_GAP_MS;
        const local = remaining;
        remaining -= lineTotal;
        if (local <= 0) return null; // まだ到達していない行
        const shown = Math.min(line.length, Math.floor(local / TYPE_CHAR_MS));
        const typing = local < lineTotal && shown < line.length;
        return (
          <p key={i} className={className}>
            {line.slice(0, shown)}
            {typing && <span className="opacity-70">▌</span>}
          </p>
        );
      })}
    </>
  );
};

// クリア前ブリーフィング: 状況説明タイプ→完了で「任務目標」を一気にフェードイン(社長指示v0.25.1848)。
// key付きでページごとにマウントし直すローカルstate=ページを跨いでtyped状態が残らない
// (v0.25.1850「任務目標が一瞬チラついて消える」修正。旧実装は親の共有stateで前ページの完了が漏れて
// 開いた瞬間に一瞬見えてから消えていた)。
const PreClearBriefing: React.FC<{ synopsis: string[]; summary: string; resetKey: string }> = ({ synopsis, summary, resetKey }) => {
  const [typed, setTyped] = useState(false);
  return (
    <>
      <Section label="状況説明">
        <TypewriterLines
          lines={synopsis}
          className="text-[13px] leading-relaxed text-white/85"
          resetKey={resetKey}
          onDone={() => setTyped(true)}
        />
      </Section>
      <div style={{ opacity: typed ? 1 : 0, transition: 'opacity 600ms ease' }}>
        <Section label="任務目標">
          <p className="text-[13px] leading-relaxed text-white/85">{summary}</p>
        </Section>
      </div>
    </>
  );
};
import {
  Settings, ShoppingBag, BookOpen, Swords, Volume2, VolumeX, ChevronLeft, Lock, Check, Sparkles, Ghost, Skull
} from 'lucide-react';
import { getBloomEnabled, setBloomEnabled } from '../config/graphics';
import { subWeaponDisplayName, useGameStore, getCarriedEquipId, type GachaPullResult } from '../store/gameStore';
import { equipmentById, equipIconName, hasEquipIcon } from '../data/equipment';
import { AVATARS, AVATAR_IDS, type AvatarId } from '../data/avatars';
import { spritePath } from '../utils/spriteLoader';
import { rhythmIntervalForLevel } from '../config/shijin';
import { DEV_TOOLS_ENABLED } from '../config/devtools';
import { Ff7rButton } from './ff7r';
import type { CharacterClass, SubWeaponKey, SkillKey } from '../types/game';
import { portraitSrcFor, menuWalkFrameSrc } from '../data/portraits';
import { TUTORIALS, type TutorialId } from '../data/tutorials';
import TutorialMedia from './TutorialMedia';
import { loadSeenTutorials } from '../utils/tutorialArchive';
import { loadPlayerName, savePlayerName, normalizePlayerNameInput, PLAYER_NAME_MAX_LEN, PLAYER_NAME_WHEN_BLANK } from '../utils/playerName';
import {
  GHOST_COMMENT_MAX_LEN, loadGhostComments, saveGhostComments,
} from '../utils/ghostComment';
// BOT_AND_GHOST.md §2.14/§2.16 C: 独立メニュー「守護霊」= 名前の決定 + 討伐の保持記録(G5アルバム)。
// カードはリザルト年表と**同じ部品**を流用する(§2.16 B)。
import { loadPlayerProfile, type BossStyleSlot } from '../utils/playerTraits';
import { buildAlbumCards, buildDuoAlbumCards, type BossClearCard } from '../utils/ghostAlbum';
import { loadDuoAlbum } from '../utils/duoRecords';
import type { GhostAllySnapshot } from '../utils/playerBuild';
import { GhostAllyCard } from './GhostRecordCards';
import { GhostBossDossier } from './GhostBossDossier';
import { GHOST_DOSSIER_SLOTS } from '../utils/ghostDossier';
import {
  acknowledgeGhostInbox, ghostNetworkSlotKey, hasGhostOnlineConsent,
  loadFixedGhostStats, loadGhostInbox, refreshGhostInbox,
  requestGhostOnlineConsent, type FixedGhostStat, type GhostInboxItem,
} from '../utils/ghostOnline';

import { prefetchStageTextures } from '../pixi/stageTextures';
import {
  STAGES, getStage, CHARACTER_CLASSES, SUB_WEAPON_KEYS, CHARACTER_SUBWEAPON_KEYS, SKILL_KEYS, SKILLS, MAX_EQUIPPED_SKILLS, BESTIARY,
  gachaPullCostFor, RARITY_LABEL, skillMaxLevel, skillDescForLevel, stageDateLabel, REVISIT_MISSION,
  gachaSuperPercent, gachaPityRemaining, gachaPromotePercent, type SkillRarity, type Stage
} from '../data/campaign';
import {
  getClearedStages, isStageUnlocked, setSelectedStageId, setSelectedFreeMode, unlockAllStages, resetProgress, getStageHighScore,
  getStoryFlags, updateStoryFlags, setSelectedMission, getEventQuestMeta, getWallMeta, type SelectedMission
} from '../data/progress';
// ステージ別の自己最高ランク表示(社長指示v0.25.3182)。rankLabel=「ランクn 罪名」の唯一の出どころ。
import { rankLabel } from '../utils/wallProgress';
import { clampRank } from '../utils/rankAssessor';
import { subsAllCompletedFromMeta, revisitCardState, canShowEx } from '../utils/storyProgress';
import {
  ARCHIVE_RECORDS, getArchiveRecord, loadStoryArchive, markRecordRead, consumeLatestUnlocked,
  type ArchiveRecord, type StoryArchiveState,
} from '../data/storyArchive';
import {
  getBgmVolume, getSfxVolume, isAudioMuted, setAudioMuted, setBgmVolume, setSfxVolume, setBgmScene, playSfx
} from '../audio/audioManager';
import BossRush from './BossRush'; // BOSS_MAKER.md §20: ボスラッシュ(練習モード)
import type { PracticeSlot } from '../utils/bossPractice';

interface MissionSelectProps {
  /** 開いた直後に表示する画面(`?screen=bossrush` 等)。未指定なら拠点。v0.25.2861。 */
  initialScreen?: string | null;
  /** ボスラッシュの練習出撃。★ページ再読込せず通常の出撃と同じ経路で戦闘へ(v0.25.2862)。 */
  onStartPractice: (slot: PracticeSlot, characterClass: string) => void;
  onStartGame: (characterClass: string) => void;
  onStartBenchmark: (characterClass: string) => void;
}

// キャラ選択チップ: 選択中のクラスだけ、ドット絵をゲーム内と同じ「5コマ×ピンポン」歩きモーションで再生
// (社長指示v0.25.1578)。メニュー画面限定の孤立小コンポーネント=再レンダは自分(56ms間隔)に閉じる
// (CLAUDE.md再レンダ規律。プレイ中のHUDではないので毎フレーム相当でも影響なし)。
// コマのURLは idle スプライトURLの命名規則(…-idle.png → …-walk-N.png)から導出(全4クラス共通規則)。
const MENU_WALK_PINGPONG = [0, 1, 2, 3, 4, 3, 2, 1]; // pixiScene の playerWalkSequence と同じ並び
const MENU_WALK_CYCLE_MS = 900;                      // 同 PINGPONG_WALK_CYCLE_MS
const MENU_WALK_DISPLAY_H = 50;                      // 旧 max-h-[50px] と同じ表示高さ
const MENU_WALK_ENABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('menuwalk') !== '0'; // ?menuwalk=0 で静止画へ復帰
// menuWalkFrameSrc は src/data/portraits.ts に集約(先読みと同じ規則を使うため・v0.25.2233)。
// 実機バグ修正(v0.25.1580「ガタガタずれる/つなぎがおかしい」): <img>+pixelated の非整数スケールは
// コマごとに nearest の間引き/太りが変わって輪郭が這う。→ キャンバスへ「整数倍nearest焼き→最終フィットは
// 平滑」の2段にして、全コマ同一の量子化=剛体的な動きにする(setStateも廃止=再レンダ0)。
const WalkingClassSprite: React.FC<{ idleSrc: string; alt: string; nudgeY: number }> = ({ idleSrc, alt, nudgeY }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const k = Math.min(3, Math.max(1, Math.ceil((MENU_WALK_DISPLAY_H * dpr) / 73))); // 整数倍(端末密度ぶんを確保)
    canvas.width = 86 * k;
    canvas.height = 73 * k;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false; // 焼きは nearest(ドットの太りを全コマ均一に)
    const imgs: HTMLImageElement[] = [];
    for (let f = 0; f < 5; f++) { const im = new Image(); im.src = menuWalkFrameSrc(idleSrc, f); imgs.push(im); }
    let lastStep = -1;
    const stepMs = MENU_WALK_CYCLE_MS / MENU_WALK_PINGPONG.length;
    const draw = () => {
      const step = Math.floor((Date.now() % MENU_WALK_CYCLE_MS) / stepMs);
      if (step === lastStep) return;
      const im = imgs[MENU_WALK_PINGPONG[step] ?? 0];
      if (!im || !im.complete || im.naturalWidth === 0) return; // 未ロード中は前コマ表示のまま(チラつき防止)
      lastStep = step;
      // 高解像度素材(社長決定v0.25.1763・NPC方式)の受け入れ: 素材がキャンバスより大きい=縮小になる時だけ
      // 平滑(linear相当)で焼く。等倍素材(現行)は従来どおり nearest(ドットの太りを全コマ均一に)=挙動不変。
      ctx.imageSmoothingEnabled = im.naturalWidth > canvas.width;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(im, 0, 0, canvas.width, canvas.height);
    };
    draw();
    const iv = window.setInterval(draw, stepMs / 2);
    return () => window.clearInterval(iv);
  }, [idleSrc]);
  return (
    <canvas
      ref={canvasRef}
      aria-label={alt}
      className="relative"
      style={{ height: MENU_WALK_DISPLAY_H, width: 'auto', transform: `translateY(${nudgeY}px) scale(1.08)`, transformOrigin: '50% 100%', transition: 'transform 140ms ease-out' }}
    />
  );
};

// 画面(導線): ホーム → ステージ選択 → ミッション詳細 → キャラ選択 → 装備選択 → スタート。
// ホームからはオプション / 開発施設 / 資料室 へも分岐する。UIデザインは後追い(ここは導線優先の仮UI)。
type Screen =
  | { name: 'home' }
  | { name: 'options' }
  | { name: 'weaponDev' }
  | { name: 'archive' }
  // BOT_AND_GHOST.md §2.14/§2.16 C: 独立メニュー「守護霊」(名前の決定+討伐の保持記録)。
  | { name: 'ghost' }
  | { name: 'bossRush' }
  | { name: 'stageSelect' }
  | { name: 'missionDetail'; stageId: string; mission?: SelectedMission }
  | { name: 'characterSelect'; stageId: string; mission?: SelectedMission }
  | { name: 'loadout' };

const Shell: React.FC<{ children: React.ReactNode; fill?: boolean }> = ({ children, fill }) => (
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
    {/* fill=true(任務詳細): パネルを常に全高にする=内容が短くても最下部固定フッター(ジョブ選択)が
        画面下端に落ちる(社長指示v0.25.1852。max-h-fullのままだと短いページでパネルが縮み中腰になる)。 */}
    <div className={`max-w-3xl w-full glass-panel rounded-none overflow-y-auto overscroll-contain ${fill ? 'h-full' : 'max-h-full'}`}>{children}</div>
  </div>
);

// 戻る/タイトルは常時表示=スクロール領域の先頭で sticky 固定(社長指示)。背景＋blur で
// スクロールしてくる内容を隠す。sticky 自身が absolute 子(戻るボタン)の位置基準になるので relative 不要。
const Header: React.FC<{ title: string; subtitle?: string; onBack?: () => void }> = ({ title, subtitle, onBack }) => (
  <div className="sticky top-0 z-20 px-5 pt-5 pb-3 text-center bg-[rgba(11,9,16,0.94)] backdrop-blur-md" style={{ borderBottom: '1px solid rgba(168,85,247,0.45)' }}>
    {onBack && (
      <button
        onClick={onBack}
        className="absolute top-3 left-3 h-9 px-2 text-purple-100/80 flex items-center gap-1 active:text-white"
        aria-label="戻る"
      >
        <ChevronLeft size={16} /><span className="text-[12px] tracking-wide">戻る</span>
      </button>
    )}
    <h1 className="text-2xl font-semibold tracking-[0.08em] text-white">{title}</h1>
    {subtitle && <p className="text-[12px] text-purple-200/55 mt-1 tracking-wide">{subtitle}</p>}
  </div>
);

// スキルのレア度別カラー(装備カード枠/ガチャ結果で共用)。
const RARITY_TEXT: Record<SkillRarity, string> = {
  normal: 'text-white/60', rare: 'text-sky-300', super: 'text-amber-300',
};

// PACING_PUZZLE.md §6.19 M42 / STORY_UI_SPEC.md追補1-3: ミッション種別ラベル。文字で識別できるように
// し、色だけに依存しない(「色だけに依存せず、文字でも識別可能にする」)。stage.kind から導出する
// (追補1のStoryMissionType 'main'/'sub'/'ex' は新設せず、既存のStage.kindで代用=マッピング確定)。
const MISSION_TYPE_LABEL: Record<Stage['kind'], string> = { main: 'MAIN', ex: 'EX', free: 'FREE' };
const MISSION_TYPE_BADGE_CLS: Record<Stage['kind'], string> = {
  main: 'bg-purple-400/15 text-purple-100',
  ex: 'bg-fuchsia-400/15 text-fuchsia-100',
  free: 'bg-emerald-400/15 text-emerald-100',
};
// SUBミッション(任意サブ表示カード/洋館再訪)のバッジ。MAIN/EXと同じく文字で識別(色だけに依存しない)。
const SUB_BADGE_CLS = 'bg-sky-400/15 text-sky-100';

// キャラ選択の立ち絵URLは src/data/portraits.ts が唯一の出どころ(起動時プリロードと共用・v0.25.2224)。

// キャラ選択 左下の情報行(ラベル＋値＋補足)。立ち絵の上に出すので影を強めに。
const InfoLine: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <div>
    <span className="text-[9px] uppercase tracking-wider text-white/55">{label}</span>
    <div className="text-[12.5px] font-semibold leading-snug text-white" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.95)' }}>{value}</div>
    {sub && <div className="text-[10px] leading-snug text-white/70" style={{ textShadow: '0 1px 5px rgba(0,0,0,0.9)' }}>{sub}</div>}
  </div>
);

// キャラ選択の立ち絵。画像のロード完了後に「下からスッと」アニメを再生する(=未キャッシュの初回でも
// ロード前にアニメが終わって出てこない問題を防ぐ)。ロード前は非表示、完了で portrait-rise を付与。
// キャッシュ済みで onLoad を取りこぼす場合に備え img.complete も拾う。key=クラスで切替ごとに再マウント。
const CharPortrait: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => { if (ref.current?.complete) setLoaded(true); }, [src]);
  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      draggable={false}
      onLoad={() => setLoaded(true)}
      className={`pointer-events-none absolute inset-0 h-full w-full object-cover object-top ${loaded ? 'portrait-rise' : 'opacity-0'}`}
    />
  );
};

// キャラ選択の「光の粒」: 立ち絵の発光と同系(主に金色＋一部薄紫)が足元から立ち上ってフェード。
// CSS駆動・GPU合成で軽量(spanの transform/opacity のみ動かす)。index 由来の決定的シードなので
// キャラ切替で再レンダーしても値が変わらず=アニメが途切れない。
const CHAR_PARTICLE_COUNT = 20;
const CharSelectParticles: React.FC = () => {
  const rnd = (i: number, s: number) => { const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
      {Array.from({ length: CHAR_PARTICLE_COUNT }).map((_, i) => {
        const left = 5 + rnd(i, 1) * 90;          // %
        const size = 2 + rnd(i, 2) * 4;           // px
        const dur = 5 + rnd(i, 3) * 6;            // s
        const delay = -rnd(i, 4) * dur;           // 負=最初からバラけて再生
        const rise = -(130 + rnd(i, 5) * 230);    // px 上へ
        const dx = (rnd(i, 6) - 0.5) * 60;        // px 横ドリフト
        const op = 0.35 + rnd(i, 7) * 0.5;
        const gold = rnd(i, 8) > 0.25;            // 大半は金、一部は薄紫
        const startBottom = 4 + rnd(i, 9) * 46;   // %（下〜中央から）
        const core = gold ? 'rgba(255,214,140,1)' : 'rgba(214,170,255,1)';
        const halo = gold ? 'rgba(255,200,110,0.55)' : 'rgba(190,140,255,0.5)';
        return (
          <span
            key={i}
            className="char-particle"
            style={{
              left: `${left}%`,
              bottom: `${startBottom}%`,
              width: size,
              height: size,
              background: `radial-gradient(circle, ${core} 0%, rgba(0,0,0,0) 70%)`,
              boxShadow: `0 0 ${size * 2.6}px ${size * 0.8}px ${halo}`,
              ['--p-rise' as string]: `${rise}px`,
              ['--p-dx' as string]: `${dx}px`,
              ['--p-dur' as string]: `${dur}s`,
              ['--p-delay' as string]: `${delay}s`,
              ['--p-op' as string]: op,
            }}
          />
        );
      })}
    </div>
  );
};

const MissionSelect: React.FC<MissionSelectProps> = ({ onStartGame, onStartBenchmark, initialScreen, onStartPractice }) => {
  const [screen, setScreen] = useState<Screen>(initialScreen === 'bossrush' ? { name: 'bossRush' } : { name: 'home' });
  // 出撃素材の先読み(社長報告v0.25.2230「ステージ開始時に10秒くらい固まる」)。ミッション詳細/キャラ選択に
  // 入った時点で、そのステージのテクスチャをバックグラウンドで取り始める。滞在中(ブリーフィングを読む・
  // キャラを選ぶ)に落とし終えれば出撃時の待ちがほぼ消える。キャッシュ済みなら即解決=無害。
  useEffect(() => {
    const stageId = 'stageId' in screen ? screen.stageId : '';
    if (stageId) prefetchStageTextures(getStage(stageId));
  }, [screen]);
  const [selectedClass, setSelectedClass] = useState<CharacterClass>('warrior');
  const [freeMode, setFreeMode] = useState(false);               // 出撃がフリー(周回・会話なし)か
  // 装備(サブ/スキル)はトップの独立「装備メニュー」で選び、store に永続。出撃時に resetGame が反映。
  const equippedSubs = useGameStore(state => state.pendingLoadout);
  const equippedSkills = useGameStore(state => state.pendingSkills);
  const ownedSkills = useGameStore(state => state.ownedSkills);
  const ownedSkillLevels = useGameStore(state => state.ownedSkillLevels);
  const setPendingLoadout = useGameStore(state => state.setPendingLoadout);
  const setPendingSkills = useGameStore(state => state.setPendingSkills);
  // アバターシステム(試験・第1弾)。装備メニュー内の独立枠。プリミティブ(string|null)購読のみ=React再描画規律に沿う。
  const avatarId = useGameStore(state => state.avatarId);
  const setAvatarId = useGameStore(state => state.setAvatarId);
  const [cleared, setCleared] = useState<Set<string>>(() => getClearedStages());

  // PACING_PUZZLE.md §6.18 バッチM41: 資料室(未読バッジ+閲覧)+「資料が追加されました」ポップアップ。
  // storyArchive は heartbeat/chronicle と同じ「必要時に1回読む」方針(store購読なし・React再描画規律)。
  // archiveState はマウント時に1回読み、資料を開いた(既読化した)/資料室に入った時だけ明示的に
  // 読み直す(毎フレーム購読ではなく、ユーザー操作起点の局所的な再計算)。
  const [archiveState, setArchiveState] = useState<StoryArchiveState>(() => loadStoryArchive());
  const refreshArchiveState = () => setArchiveState(loadStoryArchive());
  const unreadArchiveCount = archiveState.unlockedRecordIds.filter(id => !archiveState.readRecordIds.includes(id)).length;
  const goArchive = () => { playSfx('ui-select'); refreshArchiveState(); setSeenTutorials(loadSeenTutorials()); setScreen({ name: 'archive' }); };
  const goHomeFromArchive = () => { playSfx('ui-select'); refreshArchiveState(); setScreen({ name: 'home' }); };
  const [openArchiveRecordId, setOpenArchiveRecordId] = useState<string | null>(null);
  const handleOpenArchiveRecord = (id: string) => {
    playSfx('ui-select');
    markRecordRead(id);
    refreshArchiveState();
    setOpenArchiveRecordId(id);
  };
  const closeArchiveRecord = () => { playSfx('ui-select'); setOpenArchiveRecordId(null); };
  // 操作記録(社長指示v0.25.2252「一度見たやつ資料室にまとめよう」): 一度見たチュートリアルを読み返す。
  // archiveState と同じ方針で、資料室に入った時だけ読み直す(store購読なし=毎フレーム再描画しない)。
  const [seenTutorials, setSeenTutorials] = useState<Set<TutorialId>>(() => loadSeenTutorials());
  const [openTutorialId, setOpenTutorialId] = useState<TutorialId | null>(null);
  const openTutorial = TUTORIALS.find(t => t.id === openTutorialId) ?? null;
  const handleOpenTutorial = (id: TutorialId) => { playSfx('ui-select'); setOpenTutorialId(id); };
  const closeTutorial = () => { playSfx('ui-select'); setOpenTutorialId(null); };
  // 「資料が追加されました」ポップアップ: ホーム表示(=このコンポーネントのマウント)時に1回だけ
  // latestUnlockedRecordIds を読む。閉じたら consumeLatestUnlocked() で永続側もクリアし、再表示しない。
  const [newRecordsNotice, setNewRecordsNotice] = useState<string[]>(() => loadStoryArchive().latestUnlockedRecordIds);
  const closeNewRecordsNotice = () => {
    playSfx('ui-select');
    consumeLatestUnlocked();
    setNewRecordsNotice([]);
  };
  // 統合正本8.2 / 指示書6.2: サブ未完了で初回エンディングを見た後だけ、一度きりのヒントを出す。
  // 閉じたら hintShown を永続化して二度と出さない(通常EDを「バッドエンド」とは呼ばない)。
  const [storyHintNotice, setStoryHintNotice] = useState<boolean>(() => {
    const f = getStoryFlags();
    return f.endingSeen && !f.hintShown && !subsAllCompletedFromMeta();
  });
  const closeStoryHintNotice = () => {
    playSfx('ui-select');
    updateStoryFlags({ hintShown: true });
    setStoryHintNotice(false);
  };

  // BOT_AND_GHOST.md §2.14/§2.16 C: 独立メニュー「守護霊」。討伐記録(G5アルバム)は
  // storyArchive と同じ「入った時に1回だけ読む」方針(store購読なし=毎フレーム再描画しない)。
  const [ghostAlbum, setGhostAlbum] = useState<BossClearCard[]>([]);
  // §2.17(GHOST-DUO-RECORDS): 同行撃破台帳(二枠のうちの同行枠)。ソロ台帳と同じく入った時に1回だけ読む。
  const [duoAlbum, setDuoAlbum] = useState<BossClearCard[]>([]);
  const [ghostSlotRecords, setGhostSlotRecords] = useState<Record<string, BossStyleSlot>>({});
  const [selectedGhostSlot, setSelectedGhostSlot] = useState(GHOST_DOSSIER_SLOTS[0].slotKey);
  const [ghostInbox, setGhostInbox] = useState<Record<string, GhostInboxItem>>({});
  const [fixedGhostStats, setFixedGhostStats] = useState<Record<string, FixedGhostStat>>({});
  const [ghostSyncState, setGhostSyncState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [ghostSyncUpdatedAt, setGhostSyncUpdatedAt] = useState(0);
  const [ghostNewSummary, setGhostNewSummary] = useState({ uses: 0, likes: 0 });
  const [ghostInboxCursor, setGhostInboxCursor] = useState(0);
  const [openAlly, setOpenAlly] = useState<GhostAllySnapshot | null>(null);
  const goGhost = () => {
    playSfx('ui-select');
    const profile = loadPlayerProfile();
    const album = buildAlbumCards(profile);
    setGhostAlbum(album);
    setGhostSlotRecords(profile?.bossStyles ?? {});
    setSelectedGhostSlot(album.find(card => GHOST_DOSSIER_SLOTS.some(slot => slot.slotKey === card.slotKey))?.slotKey ?? GHOST_DOSSIER_SLOTS[0].slotKey);
    setDuoAlbum(buildDuoAlbumCards(loadDuoAlbum()));
    setGhostInbox(loadGhostInbox());
    setFixedGhostStats(loadFixedGhostStats());
    setGhostSyncState('loading');
    setGhostNewSummary({ uses: 0, likes: 0 });
    setGhostInboxCursor(0);
    setScreen({ name: 'ghost' });
    void refreshGhostInbox().then(result => {
      if (!result) {
        setGhostSyncState('error');
        return;
      }
      setGhostInbox(result.inbox);
      setFixedGhostStats(result.fixedStats);
      setGhostSyncUpdatedAt(result.updatedAt);
      setGhostNewSummary({ uses: result.newUses, likes: result.newLikes });
      setGhostInboxCursor(result.cursor);
      setGhostSyncState('ready');
    });
  };

  // 新着は守護霊部屋へ反映された後にだけ既読にする。通信失敗時は次回入室で再取得できる。
  useEffect(() => {
    if (screen.name !== 'ghost' || ghostInboxCursor <= 0) return;
    const timer = window.setTimeout(() => {
      void acknowledgeGhostInbox(ghostInboxCursor).then(ok => {
        if (ok) setGhostInboxCursor(0);
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [screen.name, ghostInboxCursor]);

  // タイトル曲の自動再生制限対策(初回タップで確実に再生開始)。
  useEffect(() => {
    const kick = () => setBgmScene('menu');
    window.addEventListener('pointerdown', kick, { once: true });
    return () => window.removeEventListener('pointerdown', kick);
  }, []);
  // ステージ選択へ入るたびにクリア状況を読み直す(ゲームから戻った直後の解放を反映)。
  const goBossRush = () => { playSfx('ui-select'); setScreen({ name: 'bossRush' }); };
  const goStageSelect = () => { playSfx('ui-select'); setCleared(getClearedStages()); setScreen({ name: 'stageSelect' }); };

  // --- 開始処理 ---------------------------------------------------------
  const startMission = (stageId: string, charId: CharacterClass, mission: SelectedMission = 'main') => {
    playSfx('mission-start');
    useGameStore.getState().setDanceTestMode(false);
    setSelectedStageId(stageId);          // 勝利時にこのステージをクリア扱いにする(App側)
    setSelectedFreeMode(freeMode);        // フリー(周回)=会話なし & クリア進行に影響させない
    setSelectedMission(mission);          // 'revisit'=洋館［SUB］再訪(会話なし・保存槽ゴール・任務報告なし)
    // 装備(サブ/スキル)はトップの装備メニューで選んだ永続値を resetGame がそのまま反映する(ここでは触らない)。
    onStartGame(charId);
  };

  // ====================================================================
  // ホーム(ミッション選択画面)
  // ====================================================================
  const renderHome = () => (
    <>
      <Header title="拠点" />
      <div className="p-3 space-y-2">
        <HubButton icon={<Swords size={18} />} label="作戦準備" desc="作戦地域を選ぶ" onClick={goStageSelect} accent delay={0} />
        {/* BOSS_MAKER.md §20(社長指示「ボスラッシュを正式にメニュー化。作戦室にならぶ形」)。
            一度戦ったことのあるボスと何度でも練習できる。進行・記録・所持金には一切残らない。 */}
        <HubButton icon={<Skull size={18} />} label="ボスラッシュ" desc="戦ったボスと練習する" onClick={goBossRush} delay={25} />
        <HubButton icon={<Check size={18} />} label="装備" desc={`サブウェポン1 / スキル最大${MAX_EQUIPPED_SKILLS}`} onClick={() => setScreen({ name: 'loadout' })} delay={50} />
        <HubButton icon={<ShoppingBag size={18} />} label="開発施設" desc="スキル/サブウェポンの解放" onClick={() => setScreen({ name: 'weaponDev' })} delay={100} />
        <HubButton icon={<BookOpen size={18} />} label="資料室" desc="記録・変異体資料" onClick={goArchive} delay={150} badge={unreadArchiveCount > 0 ? 'NEW' : undefined} />
        {/* BOT_AND_GHOST.md §2.14(社長裁定「独立メニュー化しよう」): 守護霊=名前の決定+討伐の保持記録。
            資料室(操作記録・物語資料)とは別物なので独立させる。名称/位置は叩き台。 */}
        <HubButton icon={<Ghost size={18} />} label="守護霊" desc="名前・討伐記録" onClick={goGhost} delay={175} />
        {/* オプションは最下段(社長指示v0.25.1781)。 */}
        <HubButton icon={<Settings size={18} />} label="オプション" desc="音量・各種設定" onClick={() => setScreen({ name: 'options' })} delay={200} />
        <p className="pt-1 text-center text-[11px] text-white/35">v{__APP_VERSION__}</p>
      </div>
      {/* PACING_PUZZLE.md §6.18 M41 / STORY_UI_SPEC.md 8章: エンディング(勝利)後にメニューへ戻った時の
          「資料が追加されました」ポップアップ。ホーム表示(=マウント)時に非空なら1回だけ出す。閉じるだけで
          強制遷移なし(仕様書11章「非採用」)。見た目は既存モーダルと同じglass-panelトーン・強glowなし。 */}
      {newRecordsNotice.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-3"
          style={{ background: 'rgba(11, 11, 18, 0.85)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
        >
          <div className="glass-panel w-full max-w-sm rounded-none px-4 py-5 text-center">
            <div className="mb-1 text-[10px] uppercase tracking-widest text-amber-200/70">お知らせ</div>
            {/* 統合正本8.1 / 指示書6.1の確定文言。 */}
            <h3 className="mb-2 text-lg font-semibold text-amber-100" style={{ fontFamily: 'Georgia, "Hiragino Mincho ProN", serif' }}>
              新しい資料が資料室に追加されました
            </h3>
            <p className="mb-4 text-[12px] leading-relaxed text-white/75">
              資料室に新しい記録が{newRecordsNotice.length}件届いています。
            </p>
            <button
              type="button"
              onClick={closeNewRecordsNotice}
              className="w-full rounded-none bg-amber-400/15 px-3 py-2.5 text-[12px] font-semibold text-amber-100"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
      {/* 統合正本8.2: サブ未完了ヒント(初回EDの後のみ・一度きり)。資料追加ポップアップとは排他
          (medicine経路=サブ3本完了とhint経路=未完了は同時に成立しない)。 */}
      {newRecordsNotice.length === 0 && storyHintNotice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-3"
          style={{ background: 'rgba(11, 11, 18, 0.85)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
        >
          <div className="glass-panel w-full max-w-sm rounded-none px-4 py-5 text-center">
            <div className="mb-1 text-[10px] uppercase tracking-widest text-purple-200/70">お知らせ</div>
            <p className="mb-4 text-[13px] leading-relaxed text-white/85">
              グレンとミラとの関係を深めると、新たな資料が見つかるかもしれない。
            </p>
            <button
              type="button"
              onClick={closeStoryHintNotice}
              className="w-full rounded-none bg-purple-400/15 px-3 py-2.5 text-[12px] font-semibold text-white/85"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </>
  );

  // ====================================================================
  // ステージ選択
  // PACING_PUZZLE.md §6.19 M42 / STORY_UI_SPEC.md追補1: 「日時・場所」を親ノード見出しとし、その下に
  // ミッション種別ラベル([MAIN]/[EX])付きの子カードを縦積みする構造(旧: ステージ名を並べたフラットな
  // 一覧)。開発コード(M1〜EX2)はここでは表示しない。
  // ====================================================================
  const renderStageSelect = () => {
    // ロック中ノードは一覧に出さない(社長決定v0.25.1779・No.5)。進行に応じてリストが伸びていく。
    const mains = STAGES.filter(s => s.kind === 'main' && isStageUnlocked(s, cleared));
    // EXノード(統合正本10.1 / 指示書8.1): 条件成立(再訪で薬を使用)まで一切出さない(伏せ表示もしない)。
    // hidden=旧ex2の残置データ(導線なし)。
    const storyFlags = getStoryFlags();
    const exs = STAGES.filter(s => s.kind === 'ex' && !s.hidden && canShowEx(storyFlags) && isStageUnlocked(s, cleared));
    return (
      <>
        <Header title="作戦地域" onBack={() => setScreen({ name: 'home' })} />
        <div className="p-3 space-y-4">
          {mains.map((stage, i) => <StageNode key={stage.id} stage={stage} index={i} />)}
          {exs.length > 0 && (
            <div className="pt-2 text-[11px] uppercase tracking-widest text-fuchsia-200/60 px-1">作戦外行動</div>
          )}
          {exs.map((stage, i) => <StageNode key={stage.id} stage={stage} index={mains.length + i} />)}
        </div>
      </>
    );
  };

  // ステージ選択のノード(社長指示v0.25.1772でUI刷新): 「日付+場所」の親見出しをボタンの顔にして
  // ノード全体を1つのタップ対象にする。ミッション行は枠なしの状態表示のみ=ボタンに見せない
  // (旧: ミッションごとに枠ボタン→SUB情報カードが「押せないボタン」に見えて紛らわしかった)。
  // SUBはB案(社長決定v0.25.1777)=タイトルを並べず「SUB n/N」1行に集約する。今後サブミッションが
  // 何本増えてもノードの高さは一定(MAIN行+SUB集約行の最大2行)。サブの内訳・出撃導線は
  // ミッション詳細ページ側(サブミッション欄)が正。
  const StageNode: React.FC<{ stage: Stage; index?: number }> = ({ stage, index = 0 }) => {
    const unlocked = isStageUnlocked(stage, cleared);
    const done = cleared.has(stage.id);
    const hiScore = getStageHighScore(stage.id);
    // 自己最高ランク(社長指示v0.25.3182「ステージ選ぶところに現状のランクを表示」)。
    // ランク自体はラン内の値(毎回R1から)なので、ここに出す「現状」=**このステージの自己最高**
    // (wallMeta.selfHighestRank=リザルトの断面図と同じ正本)。未出撃(記録なし)の初期値は1なので、
    // 一度もランクを上げた記録が無いステージ(rankReachedが全false)では出さない=空欄。
    const wallMeta = unlocked ? getWallMeta(stage.id) : null;
    const bestRank = wallMeta && wallMeta.rankReached.some(Boolean) ? clampRank(wallMeta.selfHighestRank) : null;
    // 任意サブ(二人組クエスト)の納品状況(表示用CLEAR)。メニュー描画時のみのlocalStorage読取。
    const subQuestDone = stage.subs.length > 0 && getEventQuestMeta(stage.id).sub;
    // 洋館［SUB］再訪(stage-6のみ・統合正本9章)。ここでは行の状態表示のみ(導線は詳細ページ)。
    const revisitState = stage.id === 'stage-6'
      ? revisitCardState(getStoryFlags(), subsAllCompletedFromMeta())
      : 'hidden';
    // SUB集約カウント(B案v0.25.1777): 総数=任意サブ+再訪(表示中のみ)、完了=納品済み+再訪クリア。
    // 各サブのクリア判定は従来の行表示と同じソース(subQuestDone / revisitState)を使う。
    const subTotal = stage.subs.length + (revisitState !== 'hidden' ? 1 : 0);
    const subCleared = (subQuestDone ? stage.subs.length : 0) + (revisitState === 'cleared' ? 1 : 0);
    // ミッション状態行(枠なし)。バッジ+タイトル+CLEAR等のテキストのみ。
    const missionLine = (badgeCls: string, badge: string, title: string, tags: React.ReactNode) => (
      <span className="flex items-center gap-2 min-w-0">
        <span className={`shrink-0 rounded-none px-1.5 py-0.5 text-[9px] font-bold tracking-wider ${badgeCls}`}>{badge}</span>
        <span className="min-w-0 truncate text-[13px] font-semibold text-white/90">{title}</span>
        {tags}
      </span>
    );
    return (
      <button
        type="button"
        disabled={!unlocked}
        onClick={() => { playSfx('ui-select'); setScreen({ name: 'missionDetail', stageId: stage.id }); }}
        className={`ff7r-fade-right w-full rounded-none px-3 py-3 text-left transition-[filter] ${
          unlocked ? 'active:brightness-110 menu-item-in' : 'is-off'
        }`}
        style={unlocked ? { animationDelay: `${index * 50}ms` } : undefined}
      >
        {/* 親見出し(日付+場所)=ボタンの顔。右にシェブロン/ロック。 */}
        <span className="flex items-center gap-3">
          <span className="flex-1 min-w-0">
            <span className="block text-[11px] font-semibold tracking-wide text-purple-200/70 tabular-nums">
              {stageDateLabel(stage)}
            </span>
            <span className="block text-[16px] font-bold text-white truncate">{stage.locationTitle}</span>
          </span>
          {unlocked
            ? <ChevronLeft size={16} className="rotate-180 shrink-0 text-white/40" />
            : <Lock size={15} className="shrink-0 text-white/40" />}
        </span>
        {/* ミッション状態(枠なし・押せる見た目にしない)。ロック中は解放条件のみ。 */}
        {unlocked ? (
          <span className="mt-2 block space-y-1">
            {missionLine(
              MISSION_TYPE_BADGE_CLS[stage.kind], MISSION_TYPE_LABEL[stage.kind], stage.main.title,
              <>
                {done && <span className="shrink-0 text-[10px] text-emerald-300/90">CLEAR</span>}
                {hiScore > 0 && <span className="shrink-0 text-[10px] text-amber-300/85 tabular-nums">HI {hiScore}</span>}
                {bestRank !== null && (
                  <span className="shrink-0 text-[10px] tabular-nums" style={{ color: '#ff6a55' }}>{rankLabel(bestRank)}</span>
                )}
              </>
            )}
            {subTotal > 0 && missionLine(
              SUB_BADGE_CLS, 'SUB', `${subCleared}/${subTotal}`,
              <>
                {subCleared >= subTotal && <span className="shrink-0 text-[10px] text-emerald-300/90">CLEAR</span>}
                {revisitState === 'available' && <span className="shrink-0 text-[10px] text-sky-300/90">出撃可</span>}
              </>
            )}
          </span>
        ) : (
          <span className="mt-1.5 block text-[12px] leading-snug text-white/50">前ステージのクリアで解放</span>
        )}
      </button>
    );
  };

  // ====================================================================
  // ミッション詳細(出撃ページ。メインミッションのブリーフィング + サブミッション)
  // PACING_PUZZLE.md §6.19 M42 / STORY_UI_SPEC.md追補1-3: ヘッダ=日時/場所名/ミッション名 →
  // 状況説明(synopsis) → 任務後の記録(debrief・クリア後のみ) → 任務目標(summary) →
  // 特殊条件(specialConditions・あれば) → 特殊支給装備(specialEquipment・あれば)。
  // 開発コード(M1等)はここでも表示しない。
  // ====================================================================
  const renderMissionDetail = (stageId: string, missionKind: SelectedMission = 'main') => {
    const stage = getStage(stageId);
    if (!stage) return null;
    // 洋館［SUB］再訪(統合正本9章): stage-6と同じ親ノード情報の下に REVISIT_MISSION を表示する。
    // 出撃導線はこの詳細ページ内(サブミッション欄→再訪の詳細ページ)。ステージ選択には枠ボタンを置かない。
    const isRevisit = missionKind === 'revisit';
    const revisitState = stage.id === 'stage-6'
      ? revisitCardState(getStoryFlags(), subsAllCompletedFromMeta())
      : 'hidden';
    const m = isRevisit ? REVISIT_MISSION : stage.main;
    const done = isRevisit ? getStoryFlags().revisitCleared : cleared.has(stage.id);
    return (
      <div className="flex min-h-full flex-col">
        <Header title={stageDateLabel(stage)} subtitle={stage.locationTitle} onBack={() => setScreen({ name: 'stageSelect' })} />
        <div className="menu-stagger p-3 space-y-3">
          <h2 className="px-1 text-[18px] font-bold tracking-wide text-white">{m.title}</h2>

          {/* 状況説明は常時表示。クリア後は差し替えず、下に「任務後の記録(debrief)」を追加表示
              (社長指示v0.25.1836)。debrief空のミッション(再訪=秘密行動)は状況説明のみ。
              タイピング表示(社長指示v0.25.1847): クリア前=状況説明をタイプ/クリア後=任務後の記録
              のみタイプ(状況説明は既読扱い=即表示)。クリア前はPreClearBriefing(key=ページ毎マウント)に
              集約=v0.25.1850「任務目標が一瞬チラつく」修正(ページを跨いで残るtyped状態を撲滅)。 */}
          {done ? (
            <>
              <Section label="状況説明">
                {m.synopsis.map((line, i) => (
                  <p key={i} className="text-[13px] leading-relaxed text-white/85">{line}</p>
                ))}
              </Section>
              {m.debrief.length > 0 && (
                <Section label="任務後の記録">
                  <TypewriterLines
                    lines={m.debrief}
                    className="text-[13px] leading-relaxed text-white/85"
                    resetKey={`${stage.id}:${missionKind}:deb`}
                  />
                </Section>
              )}
              <Section label="任務目標">
                <p className="text-[13px] leading-relaxed text-white/85">{m.summary}</p>
              </Section>
            </>
          ) : (
            <PreClearBriefing
              key={`${stage.id}:${missionKind}`}
              synopsis={m.synopsis}
              summary={m.summary}
              resetKey={`${stage.id}:${missionKind}:syn`}
            />
          )}

          {m.specialConditions && m.specialConditions.length > 0 && (
            <Section label="特殊条件">
              <p className="text-[12px] leading-relaxed text-white/80">
                {m.specialConditions.map(c => `・${c}`).join(' ')}
              </p>
            </Section>
          )}

          {m.specialEquipment && m.specialEquipment.length > 0 && (
            <Section label="特殊支給装備">
              <p className="text-[12px] leading-relaxed text-white/80">{m.specialEquipment.join(' / ')}</p>
            </Section>
          )}

          {!isRevisit && (
            <Section label="サブミッション">
              {stage.subs.length === 0 && revisitState === 'hidden'
                ? <p className="text-[12px] text-white/45">{stage.kind === 'free' ? 'なし（周回ミッション）' : 'なし'}</p>
                : (
                  <>
                    {stage.subs.map(s => (
                      <div key={s.id} className="rounded-none bg-purple-400/5 px-3 py-2">
                        <div className="text-[13px] font-semibold text-white">
                          {s.title}
                          {getEventQuestMeta(stage.id).sub && <span className="ml-2 align-middle text-[10px] text-emerald-300/90">CLEAR</span>}
                        </div>
                        <div className="text-[11px] text-white/55">{s.desc}</div>
                      </div>
                    ))}
                    {/* 洋館［SUB］再訪: 出撃導線はここ(条件成立時のみ)。クリア後はCLEAR表示のみ。 */}
                    {revisitState !== 'hidden' && (
                      <div className="rounded-none bg-purple-400/5 px-3 py-2">
                        <div className="text-[13px] font-semibold text-white">
                          {REVISIT_MISSION.title}
                          {revisitState === 'cleared' && <span className="ml-2 align-middle text-[10px] text-emerald-300/90">CLEAR</span>}
                        </div>
                        <div className="text-[11px] text-white/55">{REVISIT_MISSION.summary}</div>
                        {revisitState === 'available' && (
                          <Ff7rButton
                            onClick={() => { playSfx('ui-select'); setScreen({ name: 'missionDetail', stageId, mission: 'revisit' }); }}
                            className="mt-2 w-full"
                            fade="both"
                            paddingY="0.55rem"
                          >
                            ▶ 再訪の詳細へ
                          </Ff7rButton>
                        )}
                      </div>
                    )}
                  </>
                )}
            </Section>
          )}

        </div>
        {/* 出撃導線=「ジョブ選択」(社長指示v0.25.1850: 旧「担当指名」から改名+最下部固定)。
            mt-auto=内容が短い時もパネル最下部へ(Shell fill=全高パネルとセット・v0.25.1852)。
            sticky bottom=内容が長い時はスクロール中も画面下端に常時固定し、上の内容が下をくぐる。
            グラデ下地でくぐる文字を沈める。 */}
        <div
          className="sticky bottom-0 z-20 mt-auto px-3 pb-3 pt-7"
          style={{ background: 'linear-gradient(to top, rgba(11,9,16,0.96) 62%, rgba(11,9,16,0))' }}
        >
          <Ff7rButton
            onClick={() => { playSfx('ui-select'); setFreeMode(false); setScreen({ name: 'characterSelect', stageId, mission: missionKind }); }}
            className="w-full"
            emphasis
            fade="both"
            paddingY="0.8rem"
          >
            ▶ ジョブ選択
          </Ff7rButton>
        </div>
      </div>
    );
  };

  // ====================================================================
  // キャラクター選択
  // ====================================================================
  // 参考レイアウト(社長提供): 全画面=選択中キャラの立ち絵 / 左下=情報集約 / 最下段=キャラ選択。
  const renderCharacterSelect = (stageId: string, missionKind: SelectedMission = 'main') => {
    // 前ランからの持ち越し装備(localStorage)。ラン開始時に該当スロットへ自動装備される。
    const carriedDef = equipmentById(getCarriedEquipId());
    const carriedIcon = carriedDef && hasEquipIcon(carriedDef.id) ? spritePath(equipIconName(carriedDef.id)) : null;
    const c = CHARACTER_CLASSES.find(x => x.id === selectedClass) ?? CHARACTER_CLASSES[0];
    return (
      <div className="screen-in fixed inset-0 z-0 overflow-hidden bg-black select-none">
        {/* 全画面=選択中キャラの立ち絵。クラス切替=key 再マウント。ロード完了後に下からスッと表示。 */}
        <CharPortrait key={selectedClass} src={portraitSrcFor(selectedClass)} alt={c.name} />
        {/* 視認性スクリム(上=戻る帯 / 下=情報・選択帯)。立ち絵の暗背景に馴染ませる。 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[56%] bg-gradient-to-t from-black/95 via-black/72 to-transparent" />

        {/* 立ち絵の発光と同系の光の粒(足元から立ち上る) */}
        <CharSelectParticles />

        {/* 戻る(左上) */}
        <button
          onClick={() => { playSfx('ui-select'); setScreen({ name: 'missionDetail', stageId, mission: missionKind }); }}
          className="absolute z-20 h-9 px-2.5 rounded-none bg-black/45 text-white/85 flex items-center gap-1 active:bg-black/65"
          style={{ top: 'max(env(safe-area-inset-top), 12px)', left: 'max(env(safe-area-inset-left), 12px)' }}
          aria-label="戻る"
        >
          <ChevronLeft size={16} /><span className="text-[12px]">戻る</span>
        </button>

        {/* 下部UI: 左=情報集約 + 右=スタート、最下段=キャラ選択チップ */}
        <div
          className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3"
          style={{
            paddingLeft: 'max(env(safe-area-inset-left), 16px)',
            paddingRight: 'max(env(safe-area-inset-right), 16px)',
            paddingBottom: 'max(calc(env(safe-area-inset-bottom) + 14px), 18px)',
          }}
        >
          <div className="flex items-end justify-between gap-3">
            {/* 情報パネル(左下=今ある情報を集約)。キャラ切替=key 再マウントで都度フェードイン。 */}
            <div key={selectedClass} className="info-rise min-w-0 max-w-[64%]">
              <div className="text-[22px] font-bold leading-tight text-white" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.95)' }}>{c.name}</div>
              <div className="mt-2 space-y-1.5">
                <InfoLine label="初期装備" value={c.gear} />
                <InfoLine label="専用スキル" value={subWeaponDisplayName(c.skillKey)} sub={c.skillDesc} />
                <InfoLine label="固有スキル（自動）" value={c.charSkillDesc} />
              </div>
              {carriedDef && (
                <div className="mt-2 inline-flex items-center gap-2 rounded-none bg-amber-400/15 px-2 py-1">
                  <div className="w-6 h-6 rounded bg-purple-400/10 flex items-center justify-center overflow-hidden shrink-0 text-[12px]">
                    {carriedIcon
                      ? <img src={carriedIcon} alt="" className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
                      : (carriedDef.special ? '🏯' : '🛡️')}
                  </div>
                  <span className="text-[10px] text-amber-100/90 truncate max-w-[150px]">持ち越し: {carriedDef.name}</span>
                </div>
              )}
            </div>
            {/* スタート(右下)=FF7R風の紫ボタン(社長指示で旧・緑PNGは破棄)。 */}
            <Ff7rButton
              onClick={() => startMission(stageId, selectedClass, missionKind)}
              className="shrink-0 min-w-[150px] active:scale-95 transition-transform"
              ariaLabel="スタート"
              emphasis
              fade="both"
              paddingY="0.8rem"
            >
              ▶ START
            </Ff7rButton>
          </div>

          {/* キャラ選択(最下段。ドット絵チップ。タップで立ち絵＋情報が切替) */}
          <div className="flex items-end gap-2 overflow-x-auto pb-0.5">
            {CHARACTER_CLASSES.map(cc => {
              const on = cc.id === selectedClass;
              return (
                <button
                  key={cc.id}
                  onClick={() => { playSfx('ui-select'); setSelectedClass(cc.id); }}
                  className={`relative shrink-0 flex flex-col items-center justify-end rounded-none pt-2 pb-1 px-2 transition-[filter] ${
                    on ? '' : 'active:brightness-110'
                  }`}
                  style={{
                    width: 74, height: 80,
                    // 枠は上下のみ＋右へフェード(社長指示: 左右の枠は無し、線も右で透明に)。背景も右フェード。
                    background: on
                      ? 'linear-gradient(95deg, rgba(168,85,247,0.26) 0%, rgba(168,85,247,0.09) 55%, transparent 100%)'
                      : 'linear-gradient(95deg, rgba(24,15,38,0.42) 0%, rgba(24,15,38,0.18) 55%, transparent 100%)',
                    borderTop: '1px solid transparent',
                    borderBottom: '1px solid transparent',
                    borderImage: `linear-gradient(90deg, rgba(168,85,247,${on ? 0.9 : 0.45}) 0%, rgba(168,85,247,${on ? 0.5 : 0.25}) 45%, transparent 100%) 1`,
                  }}
                  aria-pressed={on}
                >
                  <div className="absolute bottom-1 h-3 w-10 rounded-full blur-md" style={{ backgroundColor: cc.accent, opacity: on ? 0.85 : 0.3 }} />
                  {/* 選択中のクラスだけ歩きモーション(ドット絵)。非選択は従来の待機立ち絵。?menuwalk=0で全静止。 */}
                  {on && MENU_WALK_ENABLED ? (
                    <WalkingClassSprite idleSrc={cc.sprite} alt={cc.name} nudgeY={cc.portraitNudgeY} />
                  ) : (
                    <img
                      src={cc.sprite}
                      alt={cc.name}
                      draggable={false}
                      className="relative max-h-[50px] object-contain"
                      style={{ imageRendering: 'pixelated', transform: `translateY(${cc.portraitNudgeY}px) ${on ? 'scale(1.08)' : 'scale(1)'}`, transformOrigin: '50% 100%', transition: 'transform 140ms ease-out' }}
                    />
                  )}
                  <span className={`relative mt-0.5 text-[8px] leading-none ${on ? 'text-purple-100' : 'text-white/55'}`}>{cc.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // ====================================================================
  // 装備メニュー(トップから独立) — サブウェポン + スキル(最大2)。store に永続。出撃時に反映。
  // ====================================================================
  const renderLoadout = () => {
    // サブウェポンは1つだけ選択(単一選択=選び直しで置き換え。同じものを再タップで解除)。
    // v0.25.3187(社長報告「買ってないのに全種装備できちゃう」): 開発施設で陳列Lv1を購入したサブだけ
    // 装備できる(未購入はロック表示)。出撃時にも resetGame が同じ条件で落とす=二重の守り。
    const purchasedSubLevels = useGameStore.getState().purchasedSubLevels;
    const subOwned = (k: SubWeaponKey) => (purchasedSubLevels[k] ?? 0) >= 1;
    const toggleSub = (k: SubWeaponKey) => {
      if (!subOwned(k)) return;
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
        <Header title="装備" subtitle="全作戦共通。サブウェポンとスキルを選択（自動保存）" onBack={() => setScreen({ name: 'home' })} />
        <div className="p-3 space-y-4">
          {/* スキル(別枠・最大2)。装備候補はガチャで解禁済み(ownedSkills)のみ。 */}
          <div>
            <div className="flex items-center justify-between px-1 mb-1.5">
              <span className="text-[11px] uppercase tracking-widest text-fuchsia-200/70">スキル</span>
              <span className="text-[11px] text-white/45">{equippedSkills.length}/{MAX_EQUIPPED_SKILLS}</span>
            </div>
            {ownedSkills.length === 0 ? (
              <p className="rounded-none bg-purple-400/5 px-3 py-3 text-[11px] leading-snug text-white/50">
                解禁済みのスキルがありません。開発施設の強化訓練でゴールドを使って解禁してください。
              </p>
            ) : (
              <div className="menu-stagger grid grid-cols-2 gap-2">
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
                      className={`ff7r-fade-right flex flex-col items-start gap-0.5 rounded-none px-3 py-2.5 text-left transition-[filter] ${
                        on ? 'is-on text-white'
                          : full ? 'is-off text-white/40'
                          : 'text-white/85 active:brightness-110'
                      }`}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold">{SKILLS[k].name} <span className="text-amber-200">{lvText(k, ownedSkillLevels[k] ?? 1)}</span></span>
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
            <div className="menu-stagger grid grid-cols-2 gap-2">
              {/* キャラ固有スキル(職スキル枠)はトップの装備メニューには載せない(自動付与・選択不可)。 */}
              {SUB_WEAPON_KEYS.filter(k => !CHARACTER_SUBWEAPON_KEYS.includes(k)).map(k => {
                const on = equippedSubs.includes(k);
                const owned = subOwned(k);
                return (
                  <button
                    key={k}
                    disabled={!owned}
                    onClick={() => toggleSub(k)}
                    className={`ff7r-fade-right flex items-center justify-between gap-2 rounded-none px-3 py-2.5 text-left transition-[filter] ${
                      on ? 'is-on text-white' : owned ? 'text-white/85 active:brightness-110' : 'text-white/35'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold">{subWeaponDisplayName(k)}</span>
                      {!owned && <span className="block text-[10px] text-white/40">未解放（開発施設で解放）</span>}
                    </span>
                    {owned ? (on && <Check size={15} className="shrink-0" />) : <Lock size={13} className="shrink-0 text-white/35" />}
                  </button>
                );
              })}
            </div>
          </div>
          {/* アバター(試験・第1弾)。トグル選択式(なし/猫耳セット)。見た目は既存の装備欄に合わせる=磨き込み不要(試験機能)。 */}
          <div>
            <div className="px-1 mb-1.5 text-[11px] uppercase tracking-widest text-sky-200/70">アバター（試験）</div>
            <div className="menu-stagger grid grid-cols-2 gap-2">
              {([null, ...AVATAR_IDS] as (AvatarId | null)[]).map(id => {
                const on = avatarId === id;
                const label = id === null ? 'なし' : AVATARS[id].name;
                return (
                  <button
                    key={id ?? 'none'}
                    onClick={() => { playSfx('ui-select'); setAvatarId(id); }}
                    className={`ff7r-fade-right flex items-center justify-between gap-2 rounded-none px-3 py-2.5 text-left transition-[filter] ${
                      on ? 'is-on text-white' : 'text-white/85 active:brightness-110'
                    }`}
                  >
                    <span className="block truncate text-[13px] font-semibold">{label}</span>
                    {on && <Check size={15} className="shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="text-[11px] text-white/45 text-center">
            スキル: {equippedSkills.length === 0 ? 'なし' : equippedSkills.map(k => SKILLS[k].name).join(' / ')}
            {' ／ '}サブ: {equippedSubs.length === 0 ? 'なし' : equippedSubs.map(k => subWeaponDisplayName(k)).join(' / ')}
            {' ／ '}アバター: {avatarId ? AVATARS[avatarId].name : 'なし'}
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
      <div className="menu-stagger p-3 space-y-3">
        <AudioSettings />
        <GraphicsSettings />
        {/* 名前の決定は守護霊メニューへ一本化(社長裁定v0.25.2555「オプションから名前は外して」)。 */}
        {DEV_TOOLS_ENABLED && <DevTools selectedClass={selectedClass} onStartGame={onStartGame} onStartBenchmark={onStartBenchmark} onRefreshCleared={() => setCleared(getClearedStages())} />}
      </div>
    </>
  );

  // ====================================================================
  // 開発施設(スキルショップ: サブウェポンの陳列レベル解放)
  // ====================================================================
  const renderWeaponDev = () => <WeaponDev onBack={() => setScreen({ name: 'home' })} />;

  // ====================================================================
  // 資料室(ストーリー記録 + 図鑑) — PACING_PUZZLE.md §6.18 バッチM41で刷新。
  // STORY_UI_SPEC.md 6章のカテゴリ構成へ: 任務記録は ArchiveRecord ベース(解放済み=タイトル一覧+
  // 未読マーク→タップで本文/既読化、未解放=伏せ表示)に差し替え。旧・debrief転載セクションは撤去
  // (仕様書7章・11章「同一内容の別文章を管理しない」)。武器/アイテム/用語は台帳に項目がある時だけ表示。
  // ====================================================================
  const renderArchiveRecordList = (records: ArchiveRecord[]) => (
    <div className="flex flex-col gap-1.5">
      {records.map(r => {
        const unlocked = archiveState.unlockedRecordIds.includes(r.id);
        const unread = unlocked && !archiveState.readRecordIds.includes(r.id);
        return unlocked ? (
          <button
            key={r.id}
            type="button"
            onClick={() => handleOpenArchiveRecord(r.id)}
            className="flex items-center gap-2 rounded-none bg-purple-400/5 px-3 py-2 text-left active:bg-purple-400/10"
          >
            {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" aria-label="未読" />}
            <span className="text-[13px] font-semibold text-white/90">{r.title}</span>
          </button>
        ) : (
          <div key={r.id} className="flex items-center gap-2 rounded-none bg-black/20 px-3 py-2 opacity-55">
            <Lock size={12} className="shrink-0 text-white/40" />
            <span className="text-[13px] text-white/40">？？？（未回収）</span>
          </div>
        );
      })}
    </div>
  );

  const renderArchive = () => {
    // 共有パッケージ2026-07-23: sortOrderで整列(未指定=末尾・既存順維持)。調査記録(world)/変異体の
    // 資料セクションを追加(既存の変異体図鑑=BESTIARYはそのまま・非干渉)。
    const bySort = (a: ArchiveRecord, b: ArchiveRecord) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999);
    const recordsOf = (cat: ArchiveRecord['category']) => ARCHIVE_RECORDS.filter(r => r.category === cat).sort(bySort);
    const worldRecords = recordsOf('world');
    const mutantRecords = recordsOf('mutant');
    const missionRecords = recordsOf('mission');
    const weaponRecords = recordsOf('weapon');
    const itemRecords = recordsOf('item');
    const termRecords = recordsOf('term');
    const openRecord = openArchiveRecordId ? getArchiveRecord(openArchiveRecordId) : null;
    // PACING_PUZZLE.md §6.19 M42 / STORY_UI_SPEC.md追補1-7: 任務記録の本文モーダルへ、日時/場所名の
    // メタ行を unlockStageId → Stageノード参照で表示する(本文へ書き込まない=データの重複管理を避ける)。
    const openRecordStage = openRecord?.unlockStageId ? getStage(openRecord.unlockStageId) : undefined;
    return (
      <>
        <Header title="資料室" subtitle="記録・変異体資料" onBack={goHomeFromArchive} />
        <div className="menu-stagger p-3 space-y-3">
          {/* 操作記録(社長指示v0.25.2252): 一度見たチュートリアルを読み返す。「どう狙うんだっけ」を
              探しに来る場所なので、物語の記録より先に置く。1件も見ていない間はセクションごと出さない。 */}
          {seenTutorials.size > 0 && (
            <Section label="操作記録">
              <div className="flex flex-col gap-1.5">
                {TUTORIALS.map(t => seenTutorials.has(t.id) ? (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleOpenTutorial(t.id)}
                    className="flex items-center gap-2 rounded-none bg-purple-400/5 px-3 py-2 text-left active:bg-purple-400/10"
                  >
                    <span className="text-[13px] font-semibold text-white/90">{t.title}</span>
                    <span className="ml-auto shrink-0 text-[10px] tracking-widest text-purple-200/50">{t.where}</span>
                  </button>
                ) : (
                  // 未取得は他セクションと同じ伏せ表示(まだ習っていない操作があることは伝える)。
                  <div key={t.id} className="flex items-center gap-2 rounded-none bg-black/20 px-3 py-2 opacity-55">
                    <Lock size={12} className="shrink-0 text-white/40" />
                    <span className="text-[13px] text-white/40">？？？（未習得）</span>
                  </div>
                ))}
              </div>
            </Section>
          )}
          {worldRecords.length > 0 && (
            <Section label="調査記録">{renderArchiveRecordList(worldRecords)}</Section>
          )}
          {missionRecords.length > 0 && (
            <Section label="任務記録">{renderArchiveRecordList(missionRecords)}</Section>
          )}
          {mutantRecords.length > 0 && (
            <Section label="変異体">{renderArchiveRecordList(mutantRecords)}</Section>
          )}
          {weaponRecords.length > 0 && (
            <Section label="武器・特殊装備">{renderArchiveRecordList(weaponRecords)}</Section>
          )}
          {itemRecords.length > 0 && (
            <Section label="アイテム">{renderArchiveRecordList(itemRecords)}</Section>
          )}
          {termRecords.length > 0 && (
            <Section label="用語">{renderArchiveRecordList(termRecords)}</Section>
          )}
          <Section label="変異体図鑑">
            {BESTIARY.map(b => (
              <div key={b.id} className="flex gap-2 text-[12px] leading-snug">
                <span className="shrink-0 min-w-[7rem] font-semibold text-white/85">{b.name}</span>
                <span className="text-white/55">{b.note}</span>
              </div>
            ))}
          </Section>
        </div>
        {/* 資料本文モーダル(既存GameOverScreenの回収資料モーダルと同トーン=glass-panel・金色明朝見出し)。
            v0.25.2146(社長報告「スクロール中はその場に出ない」): menu-stagger等のtransform祖先の中では
            fixedが画面基準にならずページ上部に張り付くため、他モーダルと同じくbody直下へポータル。 */}
        {openRecord && createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-3"
            style={{ background: 'rgba(11, 11, 18, 0.85)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
          >
            <div className="glass-panel max-h-[calc(100svh-36px)] w-full max-w-lg overflow-y-auto overscroll-contain touch-pan-y rounded-none">
              <div className="px-4 py-5">
                <div className="mb-1 text-[10px] uppercase tracking-widest text-amber-200/70">資料</div>
                <h3
                  className="mb-3 text-lg font-semibold text-amber-100"
                  style={{ fontFamily: 'Georgia, "Hiragino Mincho ProN", serif' }}
                >
                  {openRecord.title}
                </h3>
                {openRecordStage && (
                  <p className="mb-3 text-[11px] text-purple-200/55 tracking-wide">
                    DAY {openRecordStage.day} / {openRecordStage.time}・{openRecordStage.locationTitle}
                  </p>
                )}
                <div className="space-y-2 text-[13px] leading-relaxed text-white/85">
                  {/* 強調語(emphasis)は太字+琥珀で表示(共有パッケージ実装原則: 色だけに依存しない=太字併用)。 */}
                  {openRecord.body.map((line, i) => <p key={i}>{renderEmphasizedLine(line, openRecord.emphasis)}</p>)}
                </div>
                <button
                  type="button"
                  onClick={closeArchiveRecord}
                  className="mt-4 w-full rounded-none bg-purple-400/10 px-3 py-2 text-[12px] font-semibold text-white/85"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
        {/* 操作記録の本文(社長指示v0.25.2252)。ゲーム中のポップアップと同じ台帳(src/data/tutorials.ts)を
            引くので、文章は常に一致する。挿絵(img)があれば同じものを出す。 */}
        {openTutorial && createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-3"
            style={{ background: 'rgba(11, 11, 18, 0.85)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
          >
            <div className="glass-panel max-h-[calc(100svh-36px)] w-full max-w-lg overflow-y-auto overscroll-contain touch-pan-y rounded-none">
              <div className="px-4 py-5">
                <div className="mb-1 text-[10px] uppercase tracking-widest text-amber-200/70">操作記録・{openTutorial.where}</div>
                <h3
                  className="mb-3 text-lg font-semibold text-amber-100"
                  style={{ fontFamily: 'Georgia, "Hiragino Mincho ProN", serif' }}
                >
                  {openTutorial.title}
                </h3>
                {openTutorial.slides?.length ? (
                  <div className="space-y-5">
                    {openTutorial.slides.map((slide, slideIndex) => (
                      <section key={`${slide.title}:${slideIndex}`} className="border-t border-purple-200/10 pt-3 first:border-t-0 first:pt-0">
                        <h4 className="mb-2 text-[14px] font-semibold tracking-wide text-purple-100/85">{slide.title}</h4>
                        {slide.img && (
                          <div className="relative mb-3 aspect-[16/10] w-full overflow-hidden" style={{ border: '1px solid rgba(168,85,247,0.4)' }}>
                            <TutorialMedia src={slide.img} />
                          </div>
                        )}
                        <div className="space-y-2 text-[13px] leading-relaxed text-white/85">
                          {slide.lines.map((line, lineIndex) => <p key={lineIndex}>{line}</p>)}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <>
                    {openTutorial.img && (
                      <div className="relative mb-3 aspect-[16/10] w-full overflow-hidden" style={{ border: '1px solid rgba(168,85,247,0.4)' }}>
                        {/* 手本の表示はゲーム中のポップアップと共用(mp4/GIF判定・読み込み中のスピナー込み)。 */}
                        <TutorialMedia src={openTutorial.img} />
                      </div>
                    )}
                    <div className="space-y-2 text-[13px] leading-relaxed text-white/85">
                      {openTutorial.lines.map((line, i) => <p key={i}>{line}</p>)}
                    </div>
                  </>
                )}
                <button
                  type="button"
                  onClick={closeTutorial}
                  className="mt-4 w-full rounded-none bg-purple-400/10 px-3 py-2 text-[12px] font-semibold text-white/85"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </>
    );
  };

  // ====================================================================
  // 守護霊(BOT_AND_GHOST.md §2.14/§2.16 C): ①名前の決定 ②討伐の保持記録(G5アルバム)。
  // **アップロードボタンは置かない**(オンライン基盤と同時=死にボタン回避の裁定)。
  // 資料室は不変(操作記録専用)=ここへは何も移していない。文言/並びは叩き台。
  // ====================================================================
  const publishedGhostCount = ghostAlbum.reduce((sum, card) =>
    sum + (ghostInbox[ghostNetworkSlotKey(card.slotKey)]?.published ? 1 : 0), 0);
  const ghostInboxTotals = ghostAlbum.reduce((totals, card) => {
    const inbox = ghostInbox[ghostNetworkSlotKey(card.slotKey)];
    return {
      used: totals.used + (inbox?.used ?? 0),
      likes: totals.likes + (inbox?.likes ?? 0),
    };
  }, { used: 0, likes: 0 });
  const ghostSyncTimeLabel = ghostSyncUpdatedAt > 0
    ? new Date(ghostSyncUpdatedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
    : '未取得';

  // ボスラッシュ(練習モード)。出撃は location 差し替え=ページ再読込(強制出現フラグは
  // useGameLoop のモジュールロード時定数なので React 遷移では効かない・BOSS_MAKER.md §20-7)。
  const renderBossRush = () => (
    <>
      <Header title="ボスラッシュ" subtitle="練習 / 記録には残りません" onBack={() => { playSfx('ui-select'); setScreen({ name: 'home' }); }} />
      <BossRush
        clearedSlotKeys={new Set(ghostAlbum.map(card => card.slotKey))}
        onStartPractice={onStartPractice}
      />
    </>
  );

  const renderGhost = () => (
    <>
      <Header title="守護霊" subtitle="名前・討伐記録" onBack={() => { playSfx('ui-select'); setScreen({ name: 'home' }); }} />
      <div className="menu-stagger p-3 space-y-3">
        <Section label="オンライン共有">
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <span className="text-white/65">共有状態</span>
            <span className={`font-semibold ${publishedGhostCount > 0 ? 'text-emerald-200' : 'text-white/55'}`}>
              {!hasGhostOnlineConsent()
                ? '未設定'
                : ghostSyncState === 'loading'
                  ? '確認中…'
                  : publishedGhostCount > 0
                    ? `公開中 ${publishedGhostCount}体`
                    : '未公開'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 bg-sky-400/[0.06] px-2.5 py-2 text-center tabular-nums">
            <div>
              <div className="text-[9px] text-white/40">他プレイヤーに同行</div>
              <div className="text-[14px] font-semibold text-sky-100">{ghostInboxTotals.used.toLocaleString()}回</div>
            </div>
            <div>
              <div className="text-[9px] text-white/40">いいね</div>
              <div className="text-[14px] font-semibold text-pink-100">♥ {ghostInboxTotals.likes.toLocaleString()}</div>
            </div>
          </div>
          {ghostNewSummary.uses > 0 && (
            <p className="bg-pink-400/10 px-2.5 py-1.5 text-[11px] font-semibold text-pink-100">
              新着：{ghostNewSummary.uses.toLocaleString()}回同行・{ghostNewSummary.likes.toLocaleString()}いいね
            </p>
          )}
          <div className="flex items-center justify-between text-[10px] text-white/40">
            <span>{ghostSyncState === 'error' ? '通信できませんでした（保存済みの値を表示）' : 'ボスごとの内訳は討伐記録に表示'}</span>
            <span>最終更新 {ghostSyncTimeLabel}</span>
          </div>
        </Section>
        <GhostBossDossier
          selectedSlotKey={selectedGhostSlot}
          onSelect={slotKey => { playSfx('ui-select'); setSelectedGhostSlot(slotKey); }}
          cards={ghostAlbum}
          duoCards={duoAlbum}
          slotRecords={ghostSlotRecords}
          inbox={ghostInbox}
          fixedStats={fixedGhostStats}
          networkSlotKey={ghostNetworkSlotKey}
          onAllyTap={setOpenAlly}
        />
        <PlayerNameSettings />
        <GhostCommentSettings />
      </div>
      {/* §2.15 置き場所の訂正③: 同行者の名前タップ→ビルド/ステータスのポップアップ。
          他のモーダルと同じくbody直下へポータル(menu-stagger等のtransform祖先の影響を受けないため)。 */}
      {openAlly && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-3"
          style={{ background: 'rgba(11, 11, 18, 0.85)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
        >
          <div className="glass-panel max-h-[calc(100svh-36px)] w-full max-w-lg overflow-y-auto overscroll-contain touch-pan-y rounded-none">
            <div className="px-4 py-5">
              <GhostAllyCard ally={openAlly} />
              <button
                type="button"
                onClick={() => { playSfx('ui-select'); setOpenAlly(null); }}
                className="mt-4 w-full rounded-none bg-purple-400/10 px-3 py-2 text-[12px] font-semibold text-white/85"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );

  // --- ルーティング ----------------------------------------------------
  // キャラ選択は全画面(立ち絵を画面いっぱい)なので Shell(中央パネル)を介さず単独描画。
  if (screen.name === 'characterSelect') return renderCharacterSelect(screen.stageId, screen.mission ?? 'main');
  return (
    <Shell fill={screen.name === 'missionDetail'}>
      {screen.name === 'home' && renderHome()}
      {screen.name === 'stageSelect' && renderStageSelect()}
      {screen.name === 'missionDetail' && renderMissionDetail(screen.stageId, screen.mission ?? 'main')}
      {screen.name === 'loadout' && renderLoadout()}
      {screen.name === 'options' && renderOptions()}
      {screen.name === 'weaponDev' && renderWeaponDev()}
      {screen.name === 'archive' && renderArchive()}
      {screen.name === 'ghost' && renderGhost()}
      {screen.name === 'bossRush' && renderBossRush()}
    </Shell>
  );
};

// === 共通の小物 =========================================================
// FF7R風メニュー行: 左に紫アクセントバー＋右へフェードする半透明、選択(active/hover)で紫帯が左から差し込む。
const HubButton: React.FC<{ icon: React.ReactNode; label: string; desc: string; onClick: () => void; accent?: boolean; delay?: number; badge?: string }> = ({ icon, label, desc, onClick, accent, delay = 0, badge }) => (
  <button
    onClick={() => { playSfx('ui-select'); onClick?.(); }}
    style={{
      animationDelay: `${delay}ms`,
      background: 'linear-gradient(95deg, rgba(9,8,14,0.9) 0%, rgba(9,8,14,0.7) 55%, rgba(9,8,14,0.18) 100%)',
      borderLeft: `${accent ? 2 : 1}px solid rgba(168,85,247,${accent ? 0.9 : 0.55})`,
    }}
    className="menu-item-in group relative w-full flex items-center gap-3 overflow-hidden px-4 py-3.5 text-left"
  >
    <span className="absolute inset-0 -translate-x-full transition-transform duration-200 ease-out group-hover:translate-x-0 group-active:translate-x-0" style={{ background: 'linear-gradient(95deg, rgba(168,85,247,0.3), rgba(168,85,247,0.03))' }} />
    <span className="relative z-10 shrink-0 w-10 h-10 flex items-center justify-center text-purple-200/90">{icon}</span>
    <span className="relative z-10 flex-1">
      <span className="flex items-center gap-1.5">
        <span className="text-[15px] font-semibold tracking-wide text-white">{label}</span>
        {/* PACING_PUZZLE.md §6.18 M41: 未読資料あり=NEWバッジ(資料室ボタンのみ想定・汎用propとして追加)。 */}
        {badge && (
          <span className="shrink-0 rounded-full bg-amber-400/25 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-100">
            {badge}
          </span>
        )}
      </span>
      <span className="block text-[11px] text-white/50">{desc}</span>
    </span>
    <ChevronLeft size={16} className="relative z-10 rotate-180 text-purple-300/45" />
  </button>
);

const Section: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="p-3" style={{ background: 'linear-gradient(95deg, rgba(11,9,16,0.55), rgba(11,9,16,0.15))' }}>
    <div className="mb-2 text-[11px] uppercase tracking-widest text-purple-200/55">{label}</div>
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
        <input type="range" min={0} max={100} value={Math.round(bgmVol * 100)} onChange={e => { const v = Number(e.target.value) / 100; setBgmVol(v); setBgmVolume(v); }} className="w-full accent-purple-400" />
      </label>
      <label className="block">
        <div className="mb-1 flex items-center justify-between text-[12px] text-white/70"><span>SE</span><span className="tabular-nums">{Math.round(sfxVol * 100)}%</span></div>
        <input type="range" min={0} max={100} value={Math.round(sfxVol * 100)} onChange={e => { const v = Number(e.target.value) / 100; setSfxVol(v); setSfxVolume(v); }} className="w-full accent-purple-400" />
      </label>
      <button
        onClick={() => { const next = !audioMuted; setAudioMutedState(next); setAudioMuted(next); }}
        className={`ff7r-fade-right w-full py-2.5 rounded-none text-sm font-semibold flex items-center justify-center gap-2 text-white transition-[filter] active:brightness-110 ${audioMuted ? 'is-off' : 'is-on'}`}
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
        className={`ff7r-fade-right w-full py-2.5 rounded-none text-sm font-semibold flex items-center justify-center gap-2 text-white transition-[filter] active:brightness-110 ${bloom ? 'is-on' : 'is-off'}`}
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

// === プレイヤー名(守護霊の頭上に表示される名前・v0.25.2477) ==============================
// 台帳は utils/playerName.ts(初期値=player+ランダム5桁を自動生成)。React再描画規律:
// 入力値はローカルstate(store購読なし・毎フレーム再描画なし)。保存ボタン/Enterでのみ確定し、
// 公開注意の確認を通してから保存する。blurだけでは保存しない。
// normalizePlayerNameInput(★文字種フィルタ・trim・最大10文字へ切り詰め・空なら「名無し」
// =§2.16 C-1の叩き台)を通してから savePlayerName し、正規化後の値へ戻す。
// ★v0.25.2765: 不許可文字は**入力中は弾かず、確定時に黙って除去する**(IME変換の途中で
// 文字を奪うと日本語入力が壊れるため)。何が消えるかは下のヘルプ文で先に伝える。
// v0.25.2553: 独立メニュー「守護霊」(§2.14)からも同じ部品を出す(名前の決定はそこが本籍。
// オプション側もこの1部品を使い続ける=文言・挙動が2箇所で食い違わない)。
const PlayerNameSettings: React.FC = () => {
  const [name, setName] = useState(loadPlayerName); // マウント時に1回読む(無ければ生成・保存される)
  // 未変更なら保存しない: 初期ランダム名(player+5桁=11文字)は生成物なので、触らず確定した時に
  // 10文字へ切り詰めてしまわない(切り詰めは手入力に対する正規化)。
  const commit = () => {
    if (!requestGhostOnlineConsent()) return;
    setName(prev => (prev === loadPlayerName() ? prev : savePlayerName(normalizePlayerNameInput(prev))));
  };
  return (
    <Section label="プレイヤー名">
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
            e.preventDefault();
            commit();
          }}
          // ★v0.25.2766(品質監査E-1): HTMLの maxLength は**UTF-16コードユニット長**、こちらのロジックは
          // **コードポイント単位**。同じ数を渡すと `𠮟`(U+20B9F・実在の姓に出る字)が半分しか打てない。
          // 2倍を渡して入力欄では止めず、確定時の normalizePlayerNameInput でコードポイント単位に揃える
          // (暴走ペースト防止の上限としてだけ効かせる)。
          maxLength={PLAYER_NAME_MAX_LEN * 2}
          aria-label="プレイヤー名"
          className="min-w-0 flex-1 rounded-none border border-purple-400/20 bg-black/30 px-3 py-2 text-[14px] text-white/90 outline-none focus:border-purple-300/60"
        />
        <button
          type="button"
          onClick={commit}
          className="shrink-0 border border-purple-300/35 bg-purple-400/15 px-4 py-2 text-[13px] font-semibold text-purple-50 active:bg-purple-400/25"
        >
          保存
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-white/45">
        守護霊(スキル)の頭上に表示される名前。最大{PLAYER_NAME_MAX_LEN}文字。
        絵文字は使えません(記号は <span className="whitespace-nowrap">_ - . ・ ' ! ?</span> と空白のみ)。
        空のまま確定すると「{PLAYER_NAME_WHEN_BLANK}」になります。
      </p>
    </Section>
  );
};

const GhostCommentSettings: React.FC = () => {
  const initial = loadGhostComments();
  const [arrivalComment, setArrivalComment] = useState(initial.arrivalComment);
  const [departureComment, setDepartureComment] = useState(initial.departureComment);
  const commit = () => {
    if (!requestGhostOnlineConsent()) return;
    const next = saveGhostComments({ arrivalComment, departureComment });
    setArrivalComment(next.arrivalComment);
    setDepartureComment(next.departureComment);
  };
  const fields = [
    { label: '登場コメント', value: arrivalComment, setValue: setArrivalComment },
    { label: '退場コメント', value: departureComment, setValue: setDepartureComment },
  ];
  return (
    <Section label="守護霊コメント">
      {fields.map(field => (
        <label key={field.label} className="block">
          <span className="mb-1 block text-[12px] text-white/70">{field.label}</span>
          <input
            type="text"
            value={field.value}
            onChange={e => field.setValue(e.target.value)}
            onKeyDown={e => {
              if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
              e.preventDefault();
              commit();
            }}
            maxLength={GHOST_COMMENT_MAX_LEN}
            aria-label={field.label}
            className="w-full rounded-none border border-purple-400/20 bg-black/30 px-3 py-2 text-[14px] text-white/90 outline-none focus:border-purple-300/60"
          />
        </label>
      ))}
      <button
        type="button"
        onClick={commit}
        className="w-full border border-purple-300/35 bg-purple-400/15 px-4 py-2 text-[13px] font-semibold text-purple-50 active:bg-purple-400/25"
      >
        保存
      </button>
      <p className="text-[11px] leading-relaxed text-white/45">
        各{GHOST_COMMENT_MAX_LEN}文字まで。登場・帰還時の通信に表示され、他のプレイヤーにも公開されます。
        空欄で保存すると既定文に戻ります。
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
  const ammoPickupAmounts = useGameStore(s => s.ammoPickupAmounts);
  const setAmmoPickupAmount = useGameStore(s => s.setAmmoPickupAmount);

  const [danceLevel, setDanceLevel] = useState(1);
  const [danceIntervalInput, setDanceIntervalInput] = useState(String(Math.round(rhythmIntervalForLevel(1))));
  // 自動回収量を調整できるのは handgun/shotgun/rifle のみ(phill は手動射撃で対象外)。
  const [ammoInputs, setAmmoInputs] = useState<Record<'handgun' | 'shotgun' | 'rifle', string>>({
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
  const ammoFields: { type: 'handgun' | 'shotgun' | 'rifle'; label: string }[] = [
    { type: 'handgun', label: 'ハンドガン' }, { type: 'shotgun', label: 'ショットガン' }, { type: 'rifle', label: 'ライフル' },
  ];

  return (
    <div className="rounded-none bg-amber-300/[0.06] p-3 space-y-3">
      <div className="text-[11px] uppercase tracking-widest text-amber-200/70">テスト開発用（?dev=0 で非表示）</div>

      {/* FPS/撃破数表示 on/off */}
      <button
        type="button"
        onClick={() => setShowStatsOverlay(!showStatsOverlay)}
        className={`w-full flex items-center justify-between gap-3 rounded-none border px-3 py-2.5 text-left ${showStatsOverlay ? 'border-emerald-300/35 bg-emerald-300/15 text-emerald-50' : 'border-purple-400/10 bg-purple-400/5 text-white/80 active:bg-purple-400/10'}`}
        aria-pressed={showStatsOverlay}
      >
        <span><span className="block text-[13px] font-semibold">撃破数/FPS表示</span><span className="block text-[11px] text-white/50">{showStatsOverlay ? '表示ありで開始' : '通常は無し'}</span></span>
        <span className="text-[11px] font-semibold shrink-0">{showStatsOverlay ? 'ON' : 'OFF'}</span>
      </button>

      {/* ダンスモード(練習) */}
      <div className="rounded-none bg-fuchsia-500/5 p-2.5 space-y-2">
        <span className="block text-[11px] text-fuchsia-200/80">🕺 ダンスモード（練習）</span>
        <div className="flex items-center gap-2">
          {[1, 2, 3].map(lv => (
            <button key={lv} onClick={() => selectDanceLevel(lv)} aria-pressed={danceLevel === lv}
              className={`flex-1 py-2 rounded-none text-sm font-semibold border ${danceLevel === lv ? 'text-white border-fuchsia-300/80 ring-1 ring-fuchsia-300/60' : 'text-fuchsia-100 border-fuchsia-400/40'}`}
              style={{ background: 'linear-gradient(180deg, rgba(217,70,239,0.22), rgba(168,85,247,0.22))' }}>Lv{lv}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[12px] text-white/75">
          <span className="shrink-0">サークル間隔</span>
          <input type="number" inputMode="numeric" value={danceIntervalInput} onChange={e => setDanceIntervalInput(e.target.value)}
            className="w-20 rounded-none bg-black/30 px-2 py-1 text-right font-mono tabular-nums text-white/90 outline-none focus:border-fuchsia-300/60" />
          <span className="shrink-0 text-white/45">ms/拍</span>
        </label>
        <button type="button" onClick={() => setDanceTestAutoTap(!danceTestAutoTap)} aria-pressed={danceTestAutoTap}
          className={`w-full flex items-center justify-between gap-2 rounded-none border px-3 py-1.5 text-left text-[12px] ${danceTestAutoTap ? 'border-emerald-300/35 bg-emerald-300/15 text-emerald-50' : 'border-purple-400/10 bg-purple-400/5 text-white/75 active:bg-purple-400/10'}`}>
          <span>自動タップ(JUSTでドラム)</span><span className="shrink-0 font-semibold">{danceTestAutoTap ? 'ON' : 'OFF'}</span>
        </button>
        <button type="button" onClick={() => setDanceForceJust(!danceForceJust)} aria-pressed={danceForceJust}
          className={`w-full flex items-center justify-between gap-2 rounded-none border px-3 py-1.5 text-left text-[12px] ${danceForceJust ? 'border-emerald-300/35 bg-emerald-300/15 text-emerald-50' : 'border-purple-400/10 bg-purple-400/5 text-white/75 active:bg-purple-400/10'}`}>
          <span>強制JUST判定(タップ常に成功)</span><span className="shrink-0 font-semibold">{danceForceJust ? 'ON' : 'OFF'}</span>
        </button>
        <button type="button" onClick={startDancePractice} className="w-full py-2 rounded-none text-sm font-bold text-white"
          style={{ background: 'linear-gradient(180deg, rgba(217,70,239,0.45), rgba(168,85,247,0.45))' }}>決定（開始）</button>
      </div>

      {/* BENCH */}
      <button type="button" onClick={() => { setSelectedStageId(''); setSelectedFreeMode(false); useGameStore.getState().setPendingLoadout([]); onStartBenchmark(selectedClass); }}
        className="w-full py-2.5 rounded-none text-sm font-semibold bg-purple-300/10 text-purple-100 active:bg-purple-300/15">
        BENCH（ベンチマーク開始）
      </button>

      {/* デバッグ入力: 弾薬箱取得量(弾ドロップ率の項目はv0.25.2152で撤去=コード既定値・社長指示) */}
      <div className="rounded-none bg-black/15 p-2.5 space-y-2">
        <div className="grid grid-cols-3 gap-2">
          {ammoFields.map(f => (
            <label key={f.type} className="block">
              <span className="mb-1 block text-[10px] text-white/60">{f.label}</span>
              <input type="number" inputMode="numeric" min={0} max={999} value={ammoInputs[f.type]}
                onChange={e => { setAmmoInputs(prev => ({ ...prev, [f.type]: e.target.value })); const n = parseInt(e.target.value, 10); if (!Number.isNaN(n)) setAmmoPickupAmount(f.type, n); }}
                onBlur={() => setAmmoInputs(prev => ({ ...prev, [f.type]: String(useGameStore.getState().ammoPickupAmounts[f.type]) }))}
                className="w-full text-right bg-purple-400/10 rounded-none px-2 py-1 text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-purple-400/60" />
            </label>
          ))}
        </div>
      </div>

      {/* ステージ進行(導線テスト用) */}
      <div className="flex gap-2">
        <button type="button" onClick={() => { unlockAllStages(); onRefreshCleared(); }} className="flex-1 py-2 rounded-none text-[12px] font-semibold bg-purple-400/5 text-white/80 active:bg-purple-400/10">全ステージ+ボス解放</button>
        <button type="button" onClick={() => { resetProgress(); onRefreshCleared(); }} className="flex-1 py-2 rounded-none text-[12px] font-semibold bg-purple-400/5 text-white/80 active:bg-purple-400/10">進行リセット</button>
      </div>
      {/* ガチャだけ初手へ戻す(進行リセットはガチャ状態を消さないので別ボタン)。
          「初戦の稼ぎで2回引ける」等の初回体験を実機で試すため(社長指示v0.25.2347)。 */}
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => { useGameStore.getState().resetGachaProgress(); }} className="flex-1 py-2 rounded-none text-[12px] font-semibold bg-fuchsia-400/10 text-fuchsia-50/85 active:bg-fuchsia-400/20">ガチャリセット(所持スキル・サブ装備・G・階段)</button>
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
  normal: { nameCls: 'gacha-name-normal', beat: 300,  step: 950,  ring: 'border-purple-400/15' },
  rare:   { nameCls: 'gacha-name-rare',   beat: 620,  step: 1400, ring: 'border-purple-400/50 shadow-[0_0_18px_rgba(168,85,247,0.45)]' },
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
  rare:   { dim: 'bg-black/90', flash: 'bg-purple-200',   shard: 'bg-purple-200/90',   shardCount: 16, distBonus: 14, shake: false, rings: ['border-sky-300/70'],                       glow: false },
  // dim: v0.25.2146修正——旧'bg-black/92'は【Tailwind未生成クラス(92はスケール外)=完全透明】で、
  // superの破裂中は暗幕ゼロ→背後の開発施設メニューが丸見えだった(社長報告の真犯人)。/90へ。
  super:  { dim: 'bg-black/90', flash: 'bg-amber-200', shard: 'bg-amber-200/95', shardCount: 22, distBonus: 30, shake: true,  rings: ['border-amber-300/80', 'border-fuchsia-300/55'], glow: true  },
};

// レベル表記: 上限(maxLv)に達していたら「Lv3」等ではなく「MAX」と表示する(死神など maxLv1 は常にMAX)。
const lvText = (key: SkillKey, level: number): string => (level >= skillMaxLevel(key) ? 'MAX' : `Lv${level}`);

const SkillGacha: React.FC = () => {
  // 毎フレーム購読しない: プリミティブ/派生のみ購読(CLAUDE.md React再レンダー規律)。
  const goldBalance = useGameStore(s => s.goldBalance);
  const ownedCount = useGameStore(s => s.ownedSkills.length);
  const pity = useGameStore(s => s.gachaPitySinceSuper);
  const pullsTotal = useGameStore(s => s.gachaPullsTotal); // 階段式価格の段(プリミティブ購読)
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
  const SHOT_STAGGER = 200; // 連射の1発間隔ms
  const SUPER_INTRO_MS = 650; // super時: 連打前に画面全体パーティクルを広げる導入の長さ
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
    // super を含む複数連だけ、連打の前に「パーティクルがパー!と広がる」導入を置く(SEのファンファーレも先頭)。
    const intro = m > 1 && best === 'super' ? SUPER_INTRO_MS : 0;
    if (m > 1) {
      if (best === 'super') window.setTimeout(() => playSfx('event-clear'), 0); // 導入パーティクルの号砲
      // 連打(通常の撃つ演出)。super は導入ぶん遅らせて開始。
      for (let i = 0; i < m; i++) window.setTimeout(() => playSfx('rifle-fire'), intro + i * SHOT_STAGGER);
      window.setTimeout(() => {
        playSfx('bomb');
        if (best === 'rare') playSfx('homing-lock2');
        else if (best === 'super') playSfx('heavy-impact');
      }, intro + m * SHOT_STAGGER);
    } else {
      playSfx('shoot'); playSfx('bomb'); // 発砲＋着弾(破裂)
      if (best === 'rare') playSfx('homing-lock2');
      else if (best === 'super') { playSfx('heavy-impact'); playSfx('event-clear'); }
    }
    setIdx(0);
    setLeaving(false);
    setResults(got);     // リザルトは確定(暗転は破裂後に出す)
    setBursting(true);   // まず破裂演出
    // 連射は連打ぶん＋(superは導入ぶん)長め。単発は従来どおり。
    const burstMs = m > 1 ? Math.max(BURST_MS, intro + m * SHOT_STAGGER + 430) : BURST_MS;
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
    // 10連等(複数): 的「1枚」を食い気味に連打(通常の撃つ演出=フラッシュ＋破片。パーティクルは混ぜない)。
    // super を含む時のみ「最初にパーティクルがパー!っと画面全体に広がってから」連打に入る(導入だけ特別)。
    if (shotCount > 1) {
      const isSuper = best === 'super';
      const intro = isSuper ? SUPER_INTRO_MS : 0; // superは導入パーティクルぶん連打開始を後ろへ
      const SHARDS_PER = 4;
      return createPortal(
        <div className="gacha-dim fixed inset-0 z-50 flex items-center justify-center bg-black">
          {/* v0.25.2146(社長報告「10連演出中に開発室メニューへ戻ってる」): 従来は半透明の暗幕だけを
              返していた=この間は射撃場がアンマウントされ、暗幕越しに背後の開発施設メニューが透けていた。
              不透明の黒を土台に射撃場の絵を敷いたまま破裂させる(場面の連続性も保つ)。 */}
          <img src={coverSrc} alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain" />
          <div className={`absolute inset-0 ${fx.dim}`} />
          {/* super導入: 画面全体に広がるパーティクル(最初に1回だけ。その後に通常の撃つ演出) */}
          {isSuper && Array.from({ length: 30 }).map((_, p) => {
            const ang = (Math.PI * 2 * p) / 30 + 0.2;
            const dist = 300 + (p % 5) * 80; // 画面全体まで広がる大きめの距離
            return <span key={`intro${p}`} className={`gacha-super-particle absolute left-1/2 top-1/2 h-2 w-2 rounded-full ${p % 3 === 0 ? 'bg-fuchsia-300' : 'bg-amber-200'}`} style={{ animationDelay: `${(p % 5) * 35}ms`, ['--tx' as string]: `${Math.cos(ang) * dist}px`, ['--ty' as string]: `${Math.sin(ang) * dist}px` }} />;
          })}
          <div className={`relative flex items-center justify-center ${isSuper ? 'gacha-burst-shake' : 'gacha-hitshake'}`} style={{ width: '70%', maxWidth: 340, aspectRatio: '3 / 4' }}>
            {isSuper && <span className="gacha-burst-glow absolute inset-[-30%] rounded-full" style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.5), rgba(251,191,36,0) 70%)', animationDelay: `${intro}ms` }} />}
            {/* v0.25.3184: 的の1発ごとの反動。1周期=SHOT_STAGGER・発数ぶん反復=各ショットのフラッシュ/
                破片/SE(同じ delay 式)と厳密に同期する。既存の微振動(hitshake)は親に残す=反動の上に乗る。 */}
            <img src={targetSrc} alt="" draggable={false} className="gacha-target-recoil absolute inset-0 h-full w-full object-contain"
              style={{ animationDuration: `${SHOT_STAGGER}ms`, animationDelay: `${intro}ms`, animationIterationCount: shotCount }} />
            {/* 連打: 各ショットで素早いフラッシュ＋破片を的中心に重ねる(superは導入後=intro遅延)。 */}
            {Array.from({ length: shotCount }).map((_, s) => {
              const delay = intro + s * SHOT_STAGGER;
              return (
                <React.Fragment key={s}>
                  <span className={`gacha-shot-flash absolute inset-[18%] rounded-full ${fx.flash}`} style={{ animationDelay: `${delay}ms`, filter: 'blur(8px)' }} />
                  {Array.from({ length: SHARDS_PER }).map((_, k) => {
                    const ang = (Math.PI * 2 * (k + s * 0.4)) / SHARDS_PER;
                    const dist = 70 + (k % 3) * 22 + fx.distBonus;
                    return <span key={k} className={`gacha-shard absolute left-1/2 top-1/2 h-2 w-2 rounded-[2px] ${fx.shard}`} style={{ animationDelay: `${delay}ms`, ['--tx' as string]: `${Math.cos(ang) * dist}px`, ['--ty' as string]: `${Math.sin(ang) * dist}px` }} />;
                  })}
                </React.Fragment>
              );
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
      <div className="gacha-dim fixed inset-0 z-50 flex items-center justify-center bg-black">
        {/* v0.25.2146: 複数連と同じく、不透明の黒+射撃場の絵を基層に(暗幕だけだと背後のメニューが透ける)。 */}
        <img src={coverSrc} alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain" />
        <div className={`absolute inset-0 ${fx.dim}`} />
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
    const lvlColor = atMax ? 'text-amber-300' : r.newLevel === 2 ? 'text-purple-200' : 'text-white';
    const atFirst = cur === 0;
    const atLast = cur === total - 1;
    return createPortal(
      // v0.25.2146: 旧bg-black/92はTailwind未生成=透明(リザルト中も背後メニューがblur越しに透けていた)。/90へ。
      <div className="gacha-dim fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm">
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
                const lc = rMax ? 'text-amber-300' : rr.newLevel === 2 ? 'text-purple-200' : 'text-white';
                return (
                  <div key={i} className={`rounded-none border bg-black/40 px-3 py-2 ${rc.ring}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[14px] font-bold text-white">
                        {SKILLS[rr.key].name}
                        <span className={`ml-2 text-[15px] font-extrabold ${lc}`}>{lvText(rr.key, rr.newLevel)}</span>
                        {rr.firstAcquire && <span className="ml-2 align-middle rounded bg-emerald-400/20 px-1 text-[9px] font-bold text-emerald-200">New</span>}
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
            className={`${leaving ? 'gacha-card-out' : `gacha-card ${cfg.nameCls}`} w-full max-w-sm rounded-none border bg-black/40 px-5 py-6 ${cfg.ring}`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-bold uppercase tracking-[0.2em] ${RARITY_TEXT[r.rarity]}`}>{RARITY_LABEL[r.rarity]}</span>
              {r.firstAcquire && <span className="rounded-md bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-200">New</span>}
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

        <div className="border-t border-purple-400/10 bg-black/60 p-3">
          {total > 1 ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { clearRevealTimers(); setShowList(v => !v); }}
                className="rounded-none bg-purple-400/5 px-3 py-3 text-[14px] font-semibold text-white/80 active:bg-purple-400/10"
              >
                {showList ? '演出にもどる' : '一覧で見る'}
              </button>
              <button
                type="button"
                onClick={closeReveal}
                className="rounded-none bg-fuchsia-400/20 px-3 py-3 text-[14px] font-semibold text-fuchsia-50 active:bg-fuchsia-400/30"
              >
                とじる
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={closeReveal}
              className="w-full rounded-none bg-fuchsia-400/20 px-3 py-3 text-[14px] font-semibold text-fuchsia-50 active:bg-fuchsia-400/30"
            >
              とじる
            </button>
          )}
        </div>
      </div>,
      document.body
    );
  }

  // 階段式(v0.25.2344): 10連は段をまたぐので「単価×10」では嘘になる。必ず合計額を出す。
  const cost1 = gachaPullCostFor(pullsTotal, 1);
  const cost10 = gachaPullCostFor(pullsTotal, 10);
  const cant1 = goldBalance < cost1;
  const cant10 = goldBalance < cost10;
  const costLabel = (c: number) => (c > 0 ? `${c.toLocaleString()}G` : '無料');

  // --- 射撃練習場(別画面) ----------------------------------------------
  // 回数選択後にここへ遷移。射撃場の絵を画面内に収め(contain)、的(target.png)を画像中央に重ね、
  // その的の下に「撃つ」を画像内テキストとして置く(ボタン見た目にしない)。値段は前画面で確認済みのため非表示。
  // 画面のどこを押しても発射(戻る除く)→破裂→暗転リザルト(上の分岐)へ。
  if (pendingCount !== null) {
    const cantPull = goldBalance < gachaPullCostFor(pullsTotal, pendingCount);
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
          className="absolute left-4 top-4 z-10 rounded-none bg-black/40 px-3 py-1.5 text-[13px] font-semibold text-white/85 active:bg-black/60"
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
    <div className="rounded-none bg-fuchsia-300/[0.06] p-3 mb-3">
      {/* 画像の上にタイトル */}
      <div className="flex items-center justify-between px-0.5 mb-2">
        <span className="text-[13px] font-bold text-fuchsia-100">スキル強化訓練</span>
        <span className="text-[12px] text-amber-200 font-semibold">所持ゴールド {goldBalance.toLocaleString()}</span>
      </div>
      {/* 射撃練習場の横長バナー */}
      <div className="relative mb-3 overflow-hidden rounded-none" style={{ aspectRatio: '16 / 7' }}>
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
          className={`rounded-none px-3 py-3 text-[15px] font-bold ${
            cant1
              ? ' bg-purple-400/[0.03] text-white/30'
              : ' bg-fuchsia-400/20 text-fuchsia-50 active:bg-fuchsia-400/30'
          }`}
        >
          1回訓練
        </button>
        <button
          type="button"
          onClick={() => { setPendingCount(10); setNoGold(false); }}
          disabled={cant10}
          className={`rounded-none px-3 py-3 text-[15px] font-bold ${
            cant10
              ? ' bg-purple-400/[0.03] text-white/30'
              : ' bg-fuchsia-400/20 text-fuchsia-50 active:bg-fuchsia-400/30'
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
      <div className="mt-2 flex items-center justify-between rounded-none bg-black/20 px-2 py-1 text-[10px]">
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
// サブウェポン陳列レベル解放のゴールド価格(社長指示v0.25.3185「20G 50G 100G」)。
// index = 現在Lv(0→1 / 1→2 / 2→3)。通貨はガチャと同じ永続ゴールド(goldBalance/spendGold)。
const SHELF_UNLOCK_COST_BY_LEVEL = [20, 50, 100] as const;

const WeaponDev: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  // v0.25.3187: 陳列解放の正本を purchasedSubLevels(永続)へ。旧 unlockedShopSkillCards は
  // ラン内値(resetGameが毎出撃上書き)で、ここで買っても次の出撃で消えていた。
  const purchasedSubLevels = useGameStore(s => s.purchasedSubLevels);
  const setPurchasedSubLevel = useGameStore(s => s.setPurchasedSubLevel);
  const goldBalance = useGameStore(s => s.goldBalance);
  const spendGold = useGameStore(s => s.spendGold);
  const startWithTestStraps = useGameStore(s => s.startWithTestStraps);
  const setStartWithTestStraps = useGameStore(s => s.setStartWithTestStraps);
  return (
    <>
      <Header title="開発施設" subtitle="スキル強化訓練 / サブウェポン陳列レベル解放" onBack={onBack} />
      <div className="p-3">
        <SkillGacha />
      </div>
      {/* 解放(購入)リスト: 2列表示(社長指示v0.25.2147)。テスト用トグルだけ全幅。 */}
      <div className="menu-stagger px-3 pb-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setStartWithTestStraps(!startWithTestStraps)}
          className={`ff7r-fade-right col-span-2 flex items-center justify-between gap-3 rounded-none px-3 py-2 text-left text-white transition-[filter] active:brightness-110 ${startWithTestStraps ? 'is-on' : ''}`}>
          <span><span className="block text-[13px] font-semibold">1000スクラップ開始</span><span className="block text-[11px] text-white/50">{startWithTestStraps ? '次の開始時に1000s所持' : 'テスト用。無料'}</span></span>
          <span className="text-[10px] text-white/45">{startWithTestStraps ? 'ON' : 'OFF'}</span>
        </button>
        {SUB_WEAPON_KEYS.map(skillKey => {
          const level = purchasedSubLevels[skillKey] ?? 0;
          const maxed = level >= 3;
          // v0.25.3185(社長指示): 解放は有料(20G/50G/100G)。支払いはガチャと同じ永続ゴールド。
          // v0.25.3187: Lv1解放が**装備の条件**になった(未購入のサブは装備メニューでロック)。
          const cost = maxed ? 0 : SHELF_UNLOCK_COST_BY_LEVEL[level] ?? 0;
          const cantPay = !maxed && goldBalance < cost;
          return (
            <button key={skillKey} type="button" disabled={maxed || cantPay}
              onClick={() => { if (!maxed && spendGold(cost)) { playSfx('ui-select'); setPurchasedSubLevel(skillKey, Math.min(3, level + 1)); } }}
              className={`ff7r-fade-right flex items-center justify-between gap-2 rounded-none px-3 py-2 text-left text-white transition-[filter] active:brightness-110 ${maxed ? 'is-on' : ''} ${cantPay ? 'opacity-60' : ''}`}>
              <span className="min-w-0"><span className="block truncate text-[13px] font-semibold">{subWeaponDisplayName(skillKey)}</span><span className="block text-[11px] text-white/50">{level === 0 ? '解放して装備可能に' : `商人の陳列上限 Lv${level} → Lv${Math.min(3, level + 1)}`}</span></span>
              <span className={`shrink-0 text-[10px] font-semibold tabular-nums ${maxed ? 'text-white/45' : cantPay ? 'text-rose-300' : 'text-amber-200'}`}>{maxed ? 'MAX' : `${cost}G`}</span>
            </button>
          );
        })}
      </div>
    </>
  );
};

export default MissionSelect;
