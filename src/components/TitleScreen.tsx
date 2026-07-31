import React, { useState, useRef, useMemo, useEffect } from 'react';
import { assetUrl } from '../config/assetUrl';
import { playSfx } from '../audio/audioManager';
import { Ff7rButton } from './ff7r';
import { getLastHeartbeat } from '../utils/crashDiagnostics';
import { CHANGELOG } from '../data/changelog';
import { loadChronicle, getChronicleStartAt, type ChronicleEntry } from '../data/progress';
import { bossIconSrc } from '../utils/bossIcon';
import { getLoadProgress, subscribeLoadProgress } from '../utils/loadProgress';
import { normalizeNamedNamesInText } from '../utils/namedEnemy';
import BossTestMenu from './BossTestMenu'; // ボス戦テストメニュー(社長依頼2026-07-31・開発チャネル用)

// 前回セッション末尾の状態(クラッシュ診断・社長報告のスマホ真っ白現象の手がかり用)。タイトル表示のたび
// 読み直しても軽い(localStorageの読み取り1回)ので、レンダー内で直接読む(state化するほどでもない)。
// 社長指示v0.25.1778: 通常は非表示(世界観に合わない)。クラッシュ調査時だけ ?hb=1 で表示する。
const SHOW_HEARTBEAT: boolean = (() => {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('hb') === '1';
})();
const formatHeartbeat = (): string | null => {
  const h = getLastHeartbeat();
  if (!h) return null;
  const mm = Math.floor(h.gameTimeSec / 60);
  const ss = String(h.gameTimeSec % 60).padStart(2, '0');
  const heap = h.heapMB != null ? ` heap${h.heapMB}MB` : '';
  return `前回終了: 敵${h.enemies} 弾${h.projectiles} FX${h.effects} 拾${h.pickups} 設置${h.breakableProps} / ${mm}:${ss}${heap}`;
};

interface TitleScreenProps {
  onStart: () => void;                 // 同意時: BGM解禁(再生開始)
  // 更新情報の「OK」直後に呼ぶ(オープニング再生トリガ・社長指示v0.25.2022)。
  // 指定時は onStart の代わりにこちらを呼ぶ(音声解禁とBGM開始のタイミングを呼び側で制御するため)。
  onNoticeOk?: () => void;
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
// 読み取り専用の記録。heartbeat と同じ「タイトル表示時に localStorage を1回読むだけ」方針
// (store購読なし=毎フレーム再描画しない)。上=過去 / 下=最新(最下部へ自動スクロール)。指で上へスクロール
// して過去へ遡れる。スクロールバーは出さない。上下端はマスクでフェード=「流れていく」見た目。
// スタイル(社長指示v0.25.1630): 見出し無し・中央揃え・フォントは更新情報くらい(12.5px)・全体エルデンリング風
// (金色の明朝体・淡い金の区切り線・強い影で背景の上でも読める)。
// 年表アイコン(社長指示v0.25.1720): 天使(ミゲル/ジブリル/ラフィ)・城ボス(giantbat)・裏ボス4体の
// 討伐行に、テキスト横へ絵文字サイズの絵を添える。entryのkey=`stageId::kind::detail`のdetail(敵型)で引く。
// ハンター/死神など対象外の行はアイコン無し(社長指名の3グループのみ)。
// v0.25.2553: 対応表そのものは `utils/bossIcon.ts` へ移し、リザルトの撃破年表/討伐記録一覧
// (BOT_AND_GHOST.md §2.16)と共用する(表を2箇所に持たない)。ここは年表エントリの分解だけを行う。
const chronicleIconSrc = (e: ChronicleEntry): string | null => {
  if (e.kind !== 'boss') return null;
  const [stageId, , detail] = e.key.split('::');
  return detail ? bossIconSrc(detail, stageId) : null;
};

// 「初ミッション」行の実日付表示(社長指示v0.25.1772)。例: 2026/7/16
const formatChronicleDate = (at: number): string => {
  const d = new Date(at);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
};

const ChronicleTimeline: React.FC = () => {
  const entries = useMemo(() => loadChronicle().slice().sort((a, b) => a.at - b.at), []);
  // 年表の先頭に常設する「初ミッション」行(社長指示v0.25.1772): 記録が空でも年表に置き、
  // すぐ下にプレイ開始の実日付をグレーで出す(初回参照時に永続化=以後固定)。
  const startAt = useMemo(() => getChronicleStartAt(), []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [entered, setEntered] = useState(false);
  // 登場演出(社長指示v0.25.1637): 上(過去)から下(最新)へスクロール位置を流し込む+フェードイン。
  // イージングは easeOutQuart(強い減速=スクロールの「慣性」)。ユーザーが触ったら即中断して手動へ譲る。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const reveal = requestAnimationFrame(() => setEntered(true)); // フェードイン開始
    const target = el.scrollHeight - el.clientHeight; // 最下部(最新)までの距離
    let raf = 0;
    let startTs: number | null = null;
    let cancelled = false;
    const stop = () => { cancelled = true; };
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 4); // 慣性(終端でぬるっと止まる)
    const DURATION = 1600;
    const tick = (ts: number) => {
      if (cancelled) return;
      if (startTs === null) startTs = ts;
      const p = Math.min(1, (ts - startTs) / DURATION);
      el.scrollTop = target * easeOut(p); // 上→下へ流し込む
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    if (target > 1) {
      el.addEventListener('touchstart', stop, { passive: true });
      el.addEventListener('wheel', stop, { passive: true });
      el.addEventListener('pointerdown', stop, { passive: true });
      raf = requestAnimationFrame(tick);
    } else {
      el.scrollTop = el.scrollHeight; // スクロール不要な短いリストは最新に置くだけ
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(reveal);
      cancelAnimationFrame(raf);
      el.removeEventListener('touchstart', stop);
      el.removeEventListener('wheel', stop);
      el.removeEventListener('pointerdown', stop);
    };
  }, []);
  const fade = 'linear-gradient(to bottom, transparent 0, #000 22px, #000 calc(100% - 22px), transparent 100%)';
  return (
    <div
      className="absolute left-1/2 top-4 z-[35] flex w-[96%] max-w-[680px] -translate-x-1/2 flex-col"
      style={{
        // 社長指示v0.25.1653: ローディング中だけ、上から下まで全画面に広げる(フォントサイズは不変)。
        bottom: 'max(calc(env(safe-area-inset-bottom) + 3%), 4%)',
        opacity: entered ? 1 : 0,
        transition: 'opacity 700ms ease-out', // 流し込みと同時にふわっと現れる(-translate-x-1/2は不変=transformは触らない)
      }}
      onClick={(e) => e.stopPropagation()} // 年表を触って(スクロール等)もゲームを開始させない
    >
      <style>{`.chronicle-scroll::-webkit-scrollbar{display:none}`}</style>
      <div
        ref={scrollRef}
        className="chronicle-scroll min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain"
        style={{ scrollbarWidth: 'none', maskImage: fade, WebkitMaskImage: fade }}
      >
        <ul className="flex flex-col items-center py-5">
          {/* 先頭に常設の「初ミッション」(社長指示v0.25.1772)。すぐ下に実日付をグレーで。 */}
          <li
            className="text-center text-[12.5px] leading-relaxed"
            style={{
              fontFamily: '"Hiragino Mincho ProN", "Yu Mincho", "Songti SC", serif',
              color: 'rgba(255,255,255,0.94)',
              letterSpacing: '0.06em',
              textShadow: '0 1px 4px rgba(0,0,0,0.95), 0 0 12px rgba(0,0,0,0.6)',
            }}
          >
            初ミッション
            <span
              className="block leading-snug"
              style={{ color: 'rgba(255,255,255,0.42)', fontSize: '10.5px', letterSpacing: '0.08em', marginTop: 2 }}
            >
              {formatChronicleDate(startAt)}
            </span>
          </li>
          {entries.map((e) => (
            <React.Fragment key={e.key}>
              {/* 行間の区切り: エフェクト無しの縦棒「|」(社長指示v0.25.1652。旧=金の横グラデ線)。
                  先頭に常設行が入ったため全エントリの前に置く。 */}
              <span
                aria-hidden
                className="my-2 select-none text-[12.5px] leading-none"
                style={{ color: 'rgba(255,255,255,0.45)' }}
              >
                |
              </span>
              <li
                className="text-center text-[12.5px] leading-relaxed"
                style={{
                  fontFamily: '"Hiragino Mincho ProN", "Yu Mincho", "Songti SC", serif',
                  color: 'rgba(255,255,255,0.94)',
                  letterSpacing: '0.06em',
                  textShadow: '0 1px 4px rgba(0,0,0,0.95), 0 0 12px rgba(0,0,0,0.6)',
                }}
              >
                {/* §6.20 M45: 記録済みの旧名(カタカナ)も表示時に CODE:ローマ字 へ正規化(保存データは不変)。 */}
                {chronicleIconSrc(e) && (
                  <img
                    src={chronicleIconSrc(e)!}
                    alt=""
                    draggable={false}
                    style={{
                      // 社長指示v0.25.1735: 行間の「|」ぶんの余白を使い、絵を上方向へ拡大表示する。
                      // height 16→28 + marginTop -12 でマージンボックスは従来の16pxのまま
                      // (=行送り・レイアウト不変)、描画だけが上の余白帯へはみ出す。
                      display: 'inline-block',
                      height: 28,
                      width: 'auto',
                      maxWidth: 42,
                      objectFit: 'contain',
                      verticalAlign: '-3px',
                      marginTop: -12,
                      marginRight: 6,
                    }}
                  />
                )}
                {normalizeNamedNamesInText(e.label)}
                {/* 開放した時の日時をグレーで(社長指示v0.25.1878。初ミッション行と同じ体裁)。at=Date.now()。 */}
                <span
                  className="block leading-snug"
                  style={{ color: 'rgba(255,255,255,0.42)', fontSize: '10.5px', letterSpacing: '0.08em', marginTop: 2 }}
                >
                  {formatChronicleDate(e.at)}
                </span>
              </li>
            </React.Fragment>
          ))}
        </ul>
      </div>
    </div>
  );
};

// ボス戦テストメニューの入口(社長依頼2026-07-31)。開発チャネル(GitHub Pages)用。
// アプリ配布(最終形)ではここを false にして入口ごと消す。
const SHOW_BOSS_TEST = true;

const TitleScreen: React.FC<TitleScreenProps> = ({ onStart, onNoticeOk, waitForAssets, onDone }) => {
  const [phase, setPhase] = useState<'notice' | 'title' | 'blackout' | 'loading'>('notice');
  const [bossTestOpen, setBossTestOpen] = useState(false); // ボス戦テストメニュー(タイトル時のみ)
  const doneRef = useRef(false);
  // ローディング%表示(社長指示v0.25.1776)。購読は loading フェーズ中だけ(他フェーズを
  // バックグラウンド先読みの進捗で再描画しない)。更新はファイル完了ごと=毎フレームではない。
  const [loadPct, setLoadPct] = useState(0);
  useEffect(() => {
    if (phase !== 'loading') return;
    const update = () => setLoadPct(Math.round(getLoadProgress() * 100));
    update();
    return subscribeLoadProgress(update);
  }, [phase]);


  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  // 同意 → (オープニング or BGM開始) → タイトルへ
  const agree = () => {
    if (phase !== 'notice') return;
    playSfx('ui-select');
    // OK直後にオープニングを挟む場合は onNoticeOk(音声解禁+オープニング起動。メニューBGMはオープニング後)。
    if (onNoticeOk) onNoticeOk(); else onStart();
    setPhase('title');
  };

  // STARTタップ → 先に本物ローディング(完了待ち) → 完了したら暗転
  const tapStart = () => {
    if (phase !== 'title' || bossTestOpen) return; // テストメニュー表示中は全画面タップを無効化
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

  const heartbeatLine = SHOW_HEARTBEAT && phase === 'title' ? formatHeartbeat() : null;

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
        src={assetUrl('backgrounds/title-the-one.png')}
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

      {/* ボス戦テストの入口(開発チャネル用・左下に控えめ)。全画面タップ(tapStart)に食われないよう
          stopPropagation。メニュー本体は BossTestMenu(出撃=ページ再読込なので閉じれば痕跡なし)。 */}
      {SHOW_BOSS_TEST && phase === 'title' && !bossTestOpen && (
        <button
          className="absolute bottom-3 left-3 px-2 py-1 text-[10px] tracking-wider text-purple-200/50"
          style={{ background: 'linear-gradient(95deg, rgba(9,8,14,0.7), rgba(9,8,14,0.15))', borderLeft: '2px solid rgba(168,85,247,0.4)' }}
          onClick={ev => { ev.stopPropagation(); playSfx('ui-select'); setBossTestOpen(true); }}
        >
          ボス戦テスト
        </button>
      )}
      {bossTestOpen && phase === 'title' && <BossTestMenu onClose={() => setBossTestOpen(false)} />}

      {/* 歴史年表(縦の時系列・各個人の軌跡)。ローディング中だけ全画面表示(社長指示v0.25.1653)。
          z-[35]=暗幕(z-30)より前面で白が沈まない / スピナー(z-40)は年表の更に前面に残す。 */}
      {phase === 'loading' && <ChronicleTimeline />}

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
                ariaLabel="OK"
                emphasis
                fade="both"
                paddingY="0.75rem"
              >
                OK
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
        <>
          {/* 暗幕(z-30)=年表(z-35)の後面で背景を沈める。スピナー(z-40)=年表の更に前面・下端に残す。 */}
          <div className="pointer-events-none absolute inset-0 z-30 bg-black/55" />
          <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-end pb-[6%]">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-purple-400/20 border-t-purple-300/85" />
            <span className="mt-4 text-[11px] tracking-[0.34em] tabular-nums text-purple-200/55">LOADING… {loadPct}%</span>
          </div>
        </>
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
