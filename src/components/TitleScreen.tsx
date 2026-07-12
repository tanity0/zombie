import React, { useState, useRef, useMemo, useEffect } from 'react';
import { playSfx } from '../audio/audioManager';
import { Ff7rButton } from './ff7r';
import { getLastHeartbeat } from '../utils/crashDiagnostics';
import { CHANGELOG } from '../data/changelog';
import { getSelectedStageId, getWallMeta, loadChronicle } from '../data/progress';
import { deepestReachedBadge } from '../utils/wallProgress';
import { clampRank } from '../utils/rankAssessor';

// 前回セッション末尾の状態(クラッシュ診断・社長報告のスマホ真っ白現象の手がかり用)。タイトル表示のたび
// 読み直しても軽い(localStorageの読み取り1回)ので、レンダー内で直接読む(state化するほどでもない)。
const formatHeartbeat = (): string | null => {
  const h = getLastHeartbeat();
  if (!h) return null;
  const mm = Math.floor(h.gameTimeSec / 60);
  const ss = String(h.gameTimeSec % 60).padStart(2, '0');
  const heap = h.heapMB != null ? ` heap${h.heapMB}MB` : '';
  return `前回終了: 敵${h.enemies} 弾${h.projectiles} FX${h.effects} 拾${h.pickups} 設置${h.breakableProps} / ${mm}:${ss}${heap}`;
};

// PACING_PUZZLE.md §5.17 M14: タイトルバッジ「最深到達: {区域名}の{ランク名}」(選択中ステージの自己最深)。
// heartbeatと同じ「レンダー内で直接読む」方針(localStorage読み取り1回・state化するほどでもない)。
const formatWallBadge = (): string | null => {
  const meta = getWallMeta(getSelectedStageId());
  if (meta.selfDeepestDist <= 0) return null;
  return deepestReachedBadge(meta.selfDeepestDist, clampRank(meta.selfHighestRank));
};

interface TitleScreenProps {
  onStart: () => void;                 // 同意時: BGM解禁(再生開始)
  waitForAssets?: () => Promise<void>; // STARTタップ後に待つ本物の素材ロード完了
  onDone: () => void;                  // ローディング完了でメニューへ
}

// FF7リメイク風UIテーマ(社長指示・カラーは紫)。FF7Rメニューの肝を踏襲:
//  - パネルは「左=不透明 → 右へフェードして半透明」になる横グラデ(最大の特徴)
//  - 発光やブラケットは抑え、極細(1px)の紫ヘアライン＋左端の紫アクセントバー
//  - ボタン/行は片側ナナメ(skew)で、選択(active/hover)時に紫の帯がスッと差し込む
//  - 文字は基本白、紫はアクセント(線・選択帯)だけ。余白広め。
// アクセント紫 = violet ~ rgba(168,85,247)。装飾のみ(レイアウト/ロジックは不変)。

// 右へフェードする半透明パネル(FF7R定番)。左に紫の細いアクセントバー＋上下の極細ヘアライン。
const PANEL_STYLE: React.CSSProperties = {
  background: 'linear-gradient(95deg, rgba(9,8,14,0.6) 0%, rgba(9,8,14,0.48) 50%, rgba(9,8,14,0.16) 100%)',
  borderLeft: '1px solid rgba(168,85,247,0.75)',
};

// 歴史年表(社長決定v0.25.1628 / 見た目v0.25.1630): 各ステージの要所マイルストーンを時系列で縦に並べる
// 読み取り専用の記録。heartbeat/wallBadge と同じ「タイトル表示時に localStorage を1回読むだけ」方針
// (store購読なし=毎フレーム再描画しない)。上=過去 / 下=最新(最下部へ自動スクロール)。指で上へスクロール
// して過去へ遡れる。スクロールバーは出さない。上下端はマスクでフェード=「流れていく」見た目。
// スタイル(社長指示v0.25.1630): 見出し無し・中央揃え・フォントは更新情報くらい(12.5px)・全体エルデンリング風
// (金色の明朝体・淡い金の区切り線・強い影で背景の上でも読める)。
const ChronicleTimeline: React.FC = () => {
  const entries = useMemo(() => loadChronicle().slice().sort((a, b) => a.at - b.at), []);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight; // 初期表示は最新(最下部)を見せる
  }, []);
  if (entries.length === 0) return null;
  const fade = 'linear-gradient(to bottom, transparent 0, #000 22px, #000 calc(100% - 22px), transparent 100%)';
  return (
    <div
      className="absolute left-1/2 top-24 flex w-[82%] max-w-[340px] -translate-x-1/2 flex-col"
      style={{ bottom: 'max(calc(env(safe-area-inset-bottom) + 25%), 26%)' }}
      onClick={(e) => e.stopPropagation()} // 年表を触って(スクロール等)もゲームを開始させない
    >
      <style>{`.chronicle-scroll::-webkit-scrollbar{display:none}`}</style>
      <div
        ref={scrollRef}
        className="chronicle-scroll min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain"
        style={{ scrollbarWidth: 'none', maskImage: fade, WebkitMaskImage: fade }}
      >
        <ul className="flex flex-col items-center py-5">
          {entries.map((e, i) => (
            <React.Fragment key={e.key}>
              {i > 0 && (
                <span
                  className="my-2.5 h-px w-12"
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(197,170,110,0.32), transparent)' }}
                />
              )}
              <li
                className="text-center text-[12.5px] leading-relaxed"
                style={{
                  fontFamily: '"Hiragino Mincho ProN", "Yu Mincho", "Songti SC", serif',
                  color: 'rgba(255,255,255,0.94)',
                  letterSpacing: '0.06em',
                  textShadow: '0 1px 4px rgba(0,0,0,0.95), 0 0 12px rgba(0,0,0,0.6)',
                }}
              >
                {e.label}
              </li>
            </React.Fragment>
          ))}
        </ul>
      </div>
    </div>
  );
};

const TitleScreen: React.FC<TitleScreenProps> = ({ onStart, waitForAssets, onDone }) => {
  const [phase, setPhase] = useState<'notice' | 'title' | 'blackout' | 'loading'>('notice');
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  // 同意 → BGM開始 → タイトルへ
  const agree = () => {
    if (phase !== 'notice') return;
    playSfx('ui-select');
    onStart();          // 同意の瞬間にBGM解禁＆再生
    setPhase('title');
  };

  // STARTタップ → 先に本物ローディング(完了待ち) → 完了したら暗転
  const tapStart = () => {
    if (phase !== 'title') return;
    playSfx('title-start');
    setPhase('loading');
    const startedAt = performance.now();
    const MIN_LOADING_MS = 900; // ロードが速すぎてもスピナーを一瞬は見せる
    void Promise.resolve(waitForAssets?.()).then(async () => {
      const remaining = MIN_LOADING_MS - (performance.now() - startedAt);
      if (remaining > 0) await new Promise(r => window.setTimeout(r, remaining));
      setPhase('blackout'); // ロード完了 → ゆっくり暗転へ
    });
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && phase === 'title') { e.preventDefault(); tapStart(); }
  };

  const heartbeatLine = phase === 'title' ? formatHeartbeat() : null;
  const wallBadgeLine = phase === 'title' ? formatWallBadge() : null;

  return (
    <div
      onClick={phase === 'title' ? tapStart : undefined}
      onKeyDown={handleKey}
      role={phase === 'title' ? 'button' : undefined}
      tabIndex={phase === 'title' ? 0 : -1}
      aria-label={phase === 'title' ? 'タップして開始' : undefined}
      className="relative h-full w-full overflow-hidden bg-[#06070d] select-none outline-none"
      style={{ cursor: phase === 'title' ? 'pointer' : 'default' }}
    >
      <img
        src={`${import.meta.env.BASE_URL}backgrounds/title-the-one.png?v=${encodeURIComponent(typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev')}`}
        alt=""
        draggable={false}
        className="pointer-events-none absolute left-1/2 top-1/2 aspect-square max-w-none -translate-x-1/2 -translate-y-1/2 object-cover"
        style={{ width: 'min(150vw, 150svh)' }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/60" />

      {/* バージョン表示: スタート画面(タイトル)の右上 */}
      {phase === 'title' && (
        <span className="absolute top-3 right-3 px-2 py-0.5 text-[10px] font-mono tabular-nums text-purple-200/75" style={{ background: 'linear-gradient(95deg, rgba(9,8,14,0.7), rgba(9,8,14,0.15))', borderLeft: '2px solid rgba(168,85,247,0.7)' }}>
          v{__APP_VERSION__}
        </span>
      )}

      {/* PACING_PUZZLE.md §5.17 M14: 最深到達バッジ(選択中ステージの自己最深・金の細枠+菱形ドット)。 */}
      {wallBadgeLine && (
        <span
          className="absolute top-9 right-3 px-2 py-0.5 text-[10px] font-mono tabular-nums text-amber-100/90"
          style={{
            background: 'linear-gradient(95deg, rgba(9,8,14,0.7), rgba(9,8,14,0.15))',
            border: '1px solid rgba(255,215,0,0.55)',
          }}
        >
          {'◆'} {wallBadgeLine}
        </span>
      )}

      {/* 歴史年表(縦の時系列・各個人の軌跡)。タイトル画面でのみ表示(社長決定v0.25.1628)。 */}
      {phase === 'title' && <ChronicleTimeline />}

      {/* クラッシュ診断: 前回セッション末尾の状態(社長報告のスマホ真っ白現象の手がかり用・読むだけ)。 */}
      {heartbeatLine && (
        <span className="absolute top-16 right-3 max-w-[92vw] px-2 py-0.5 text-[9px] font-mono tabular-nums text-purple-200/45" style={{ background: 'linear-gradient(95deg, rgba(9,8,14,0.6), rgba(9,8,14,0.1))', borderLeft: '2px solid rgba(168,85,247,0.4)' }}>
          {heartbeatLine}
        </span>
      )}

      {/* 更新情報(起動画面・最初に表示。社長指示: 毎回のアップデート内容をここに出す) */}
      {phase === 'notice' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 px-4 py-6">
          <div className="relative flex max-h-full w-full max-w-md flex-col overflow-hidden" style={PANEL_STYLE}>
            <div className="overflow-y-auto overscroll-contain touch-pan-y px-5 pt-5 pb-3 text-white/85" style={{ fontFamily: '"Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif' }}>
              <div className="flex items-center justify-between">
                {/* 見出し: 小さめ＋細い紫下線(FF7R風) */}
                <h2 className="pb-1 text-[13px] font-bold tracking-[0.18em] text-white" style={{ borderBottom: '1px solid rgba(168,85,247,0.6)' }}>
                  更新情報
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono tabular-nums text-purple-200/70">v{__APP_VERSION__}</span>
              </div>
              {CHANGELOG.map(entry => (
                <div key={entry.version} className="mt-4">
                  <p className="text-[11px] font-mono tabular-nums text-purple-200/60">v{entry.version}</p>
                  <ul className="mt-1.5 space-y-2 text-[12.5px] leading-relaxed text-white/75">
                    {entry.items.map((item, i) => (
                      <li key={i}>・{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="px-4 pb-4 pt-2">
              {/* FF7R風: 四角いまま両サイドへフェード＋上下の枠線もフェード(共通 Ff7rButton)。 */}
              <Ff7rButton
                onClick={(e) => { e.stopPropagation(); agree(); }}
                className="w-full"
                ariaLabel="はじめる"
                emphasis
                fade="both"
                paddingY="0.75rem"
              >
                はじめる
              </Ff7rButton>
            </div>
          </div>
        </div>
      )}

      {/* タイトル(the ONE): STARTタップ待機 */}
      {phase === 'title' && (
        <div
          className="absolute inset-x-0 flex flex-col items-center"
          style={{ bottom: 'max(calc(env(safe-area-inset-bottom) + 12%), 13%)' }}
        >
          {/* クリーンな START: 細い紫ヘアラインを上下に添えるだけ(発光は控えめ)。 */}
          <span className="h-[1px] w-28 sm:w-40" style={{ background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.7), transparent)' }} />
          <span
            className="my-3 animate-pulse text-3xl font-bold tracking-[0.5em] text-white"
            style={{ textShadow: '0 0 10px rgba(168,85,247,0.5), 0 2px 8px rgba(0,0,0,0.7)' }}
          >
            START
          </span>
          <span className="h-[1px] w-28 sm:w-40" style={{ background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.7), transparent)' }} />
          <span className="mt-4 text-[11px] tracking-[0.34em] text-white/50">画面をタップして開始</span>
        </div>
      )}

      {/* 本物ローディング(START後・暗転の前に素材完了を待つ) */}
      {phase === 'loading' && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-end bg-black/55 pb-[18%]">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-purple-400/20 border-t-purple-300/85" />
          <span className="mt-4 text-[11px] tracking-[0.34em] text-purple-200/55">LOADING…</span>
        </div>
      )}

      {/* ゆっくり暗転(ロード完了後) → 暗転し切ったらメニューへ。 */}
      <div
        className="pointer-events-none absolute inset-0 z-40 bg-black"
        style={{
          opacity: phase === 'blackout' ? 1 : 0,
          transition: 'opacity 1000ms ease-in',
        }}
        onTransitionEnd={(e) => { if (e.propertyName === 'opacity' && phase === 'blackout') finish(); }}
      />
    </div>
  );
};

export default TitleScreen;
