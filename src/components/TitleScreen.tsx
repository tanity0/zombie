import React, { useState, useRef } from 'react';
import { playSfx } from '../audio/audioManager';

interface TitleScreenProps {
  onStart: () => void;                 // 同意時: BGM解禁(再生開始)
  waitForAssets?: () => Promise<void>; // STARTタップ後に待つ本物の素材ロード完了
  onDone: () => void;                  // ローディング完了でメニューへ
}

// FF7リメイク風UIテーマ(社長指示・カラーは紫)。共通の「角ばった黒パネル＋紫の細線/グロー＋四隅ブラケット」。
// 装飾のみ(レイアウト/ロジックは不変)。アクセント紫 = violet ~ rgba(168,85,247)。

// 四隅のL字ブラケット(FF7R風HUD枠)。装飾のみ・クリック透過。
const Corners: React.FC<{ color?: string; size?: number }> = ({ color = 'rgba(192,132,252,0.85)', size = 14 }) => {
  const s = size, b = '1.5px solid ' + color;
  const base: React.CSSProperties = { position: 'absolute', width: s, height: s, pointerEvents: 'none' };
  return (
    <>
      <span style={{ ...base, top: -1, left: -1, borderTop: b, borderLeft: b }} />
      <span style={{ ...base, top: -1, right: -1, borderTop: b, borderRight: b }} />
      <span style={{ ...base, bottom: -1, left: -1, borderBottom: b, borderLeft: b }} />
      <span style={{ ...base, bottom: -1, right: -1, borderBottom: b, borderRight: b }} />
    </>
  );
};

// FF7R風パネルの共通スタイル(角ばり・紫エッジ・外側グロー)。
const PANEL_STYLE: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(13,10,22,0.96), rgba(8,7,14,0.97))',
  border: '1px solid rgba(168,85,247,0.35)',
  boxShadow: '0 0 26px rgba(168,85,247,0.22), inset 0 0 0 1px rgba(168,85,247,0.06)',
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
      {/* FF7R質感: 紫のビネット＋微スキャンライン(装飾・クリック透過)。 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(120% 90% at 50% 60%, transparent 55%, rgba(46,16,84,0.45) 100%)',
          mixBlendMode: 'multiply',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{ backgroundImage: 'repeating-linear-gradient(0deg, #fff 0, #fff 1px, transparent 1px, transparent 3px)' }}
      />

      {/* バージョン表示: スタート画面(タイトル)の右上 */}
      {phase === 'title' && (
        <span className="absolute top-3 right-3 px-2 py-0.5 text-[10px] font-mono tabular-nums text-purple-200/80" style={{ background: 'rgba(10,8,18,0.55)', border: '1px solid rgba(168,85,247,0.35)' }}>
          v{__APP_VERSION__}
        </span>
      )}

      {/* ご利用にあたって(同意画面・最初に表示) */}
      {phase === 'notice' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 px-4 py-6">
          <div className="relative flex max-h-full w-full max-w-md flex-col overflow-hidden" style={PANEL_STYLE}>
            <Corners />
            {/* 上端の紫アクセントバー */}
            <div className="h-[2px] w-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.9), transparent)' }} />
            <div className="overflow-y-auto overscroll-contain touch-pan-y px-5 pt-4 pb-3 text-white/85" style={{ fontFamily: '"Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif' }}>
              <div className="flex items-center justify-between" style={{ fontFamily: 'inherit' }}>
                <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-[0.16em] text-purple-100">
                  <span className="inline-block h-2.5 w-2.5 rotate-45" style={{ background: 'rgba(168,85,247,0.9)', boxShadow: '0 0 8px rgba(168,85,247,0.8)' }} />
                  ご利用にあたって
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono tabular-nums text-purple-200/75" style={{ border: '1px solid rgba(168,85,247,0.3)' }}>v{__APP_VERSION__}</span>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-white/70">
                本作は戦闘を含むアクションゲーム(フィクション)です。
              </p>
              <ul className="mt-3 space-y-2.5 text-[12.5px] leading-relaxed text-white/75">
                <li>・光/点滅/画面揺れの演出があります。光過敏性発作の経験がある方は注意し、明るい部屋で離れて・休憩しながら遊んでください。異常を感じたら中止し医師へ。</li>
                <li>・突然の大きな音が出ます。音量にご注意ください(設定で変更可)。</li>
                <li>・死/戦闘の描写を含みます(過度なグロ表現はありません)。</li>
                <li>・個人情報は収集しません。設定はブラウザ内にのみ保存。課金なし。</li>
                <li>・開発中のため不具合が生じる場合があります。自己責任でお楽しみください。</li>
              </ul>
            </div>
            <div className="p-4" style={{ borderTop: '1px solid rgba(168,85,247,0.18)' }}>
              <button
                onClick={(e) => { e.stopPropagation(); agree(); }}
                className="group relative w-full overflow-hidden py-3 text-[14px] font-bold tracking-[0.22em] text-purple-50 transition-colors active:brightness-125"
                style={{
                  background: 'linear-gradient(180deg, rgba(124,58,237,0.42), rgba(91,33,182,0.5))',
                  border: '1px solid rgba(168,85,247,0.7)',
                  boxShadow: '0 0 18px rgba(168,85,247,0.35), inset 0 0 12px rgba(168,85,247,0.25)',
                }}
              >
                <span className="relative z-10">▶ 同意して始める</span>
                {/* 左端の発光アクセント */}
                <span className="absolute inset-y-0 left-0 w-1" style={{ background: 'rgba(192,132,252,0.95)', boxShadow: '0 0 10px rgba(192,132,252,0.9)' }} />
              </button>
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
          {/* 左右に紫のブラケット線を添えた START(FF7R風) */}
          <div className="flex items-center gap-4">
            <span className="h-[1px] w-10 sm:w-16" style={{ background: 'linear-gradient(90deg, transparent, rgba(192,132,252,0.85))' }} />
            <span
              className="animate-pulse text-3xl font-bold tracking-[0.45em] text-white"
              style={{ textShadow: '0 0 18px rgba(168,85,247,0.85), 0 2px 10px rgba(0,0,0,0.7)' }}
            >
              START
            </span>
            <span className="h-[1px] w-10 sm:w-16" style={{ background: 'linear-gradient(90deg, rgba(192,132,252,0.85), transparent)' }} />
          </div>
          <span className="mt-3 text-[11px] tracking-[0.34em] text-purple-200/55">画面をタップして開始</span>
        </div>
      )}

      {/* 本物ローディング(START後・暗転の前に素材完了を待つ) */}
      {phase === 'loading' && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-end bg-black/55 pb-[18%]">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-purple-400/20 border-t-purple-300/85" />
          <span className="mt-4 text-[11px] tracking-[0.34em] text-purple-200/60">LOADING…</span>
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
