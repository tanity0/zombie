import React, { useState, useRef } from 'react';
import { playSfx } from '../audio/audioManager';

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
  background: 'linear-gradient(95deg, rgba(9,8,14,0.95) 0%, rgba(9,8,14,0.86) 50%, rgba(9,8,14,0.42) 100%)',
  borderLeft: '2px solid rgba(168,85,247,0.85)',
  borderTop: '1px solid rgba(168,85,247,0.16)',
  borderBottom: '1px solid rgba(168,85,247,0.16)',
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

      {/* バージョン表示: スタート画面(タイトル)の右上 */}
      {phase === 'title' && (
        <span className="absolute top-3 right-3 px-2 py-0.5 text-[10px] font-mono tabular-nums text-purple-200/75" style={{ background: 'linear-gradient(95deg, rgba(9,8,14,0.7), rgba(9,8,14,0.15))', borderLeft: '2px solid rgba(168,85,247,0.7)' }}>
          v{__APP_VERSION__}
        </span>
      )}

      {/* ご利用にあたって(同意画面・最初に表示) */}
      {phase === 'notice' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 px-4 py-6">
          <div className="relative flex max-h-full w-full max-w-md flex-col overflow-hidden" style={PANEL_STYLE}>
            <div className="overflow-y-auto overscroll-contain touch-pan-y px-5 pt-5 pb-3 text-white/85" style={{ fontFamily: '"Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif' }}>
              <div className="flex items-center justify-between">
                {/* 見出し: 小さめ＋細い紫下線(FF7R風) */}
                <h2 className="pb-1 text-[13px] font-bold tracking-[0.18em] text-white" style={{ borderBottom: '1px solid rgba(168,85,247,0.6)' }}>
                  ご利用にあたって
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono tabular-nums text-purple-200/70">v{__APP_VERSION__}</span>
              </div>
              <p className="mt-4 text-[13px] leading-relaxed text-white/70">
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
            <div className="px-4 pb-4 pt-2">
              {/* FF7R風: 四角いまま両サイドへフェード＋紫の上下細線。ホバー/選択で少し発色(斜めは使わない)。 */}
              <button
                onClick={(e) => { e.stopPropagation(); agree(); }}
                className="group relative block w-full overflow-hidden"
                aria-label="同意して始める"
              >
                <span
                  className="relative block py-3"
                  style={{
                    background: 'linear-gradient(90deg, rgba(22,13,36,0.10) 0%, rgba(22,13,36,0.82) 32%, rgba(22,13,36,0.82) 68%, rgba(22,13,36,0.10) 100%)',
                    borderTop: '1px solid rgba(168,85,247,0.7)',
                    borderBottom: '1px solid rgba(168,85,247,0.7)',
                  }}
                >
                  <span
                    className="absolute inset-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-active:opacity-100"
                    style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.22) 35%, rgba(168,85,247,0.22) 65%, transparent 100%)' }}
                  />
                  <span className="relative z-10 block text-center text-[14px] font-bold tracking-[0.24em] text-white">
                    同意して始める
                  </span>
                </span>
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
