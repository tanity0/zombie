import React, { useState, useRef } from 'react';
import { playSfx } from '../audio/audioManager';

interface TitleScreenProps {
  onStart: () => void;                 // 同意時: BGM解禁(再生開始)
  waitForAssets?: () => Promise<void>; // STARTタップ後に待つ本物の素材ロード完了
  onDone: () => void;                  // ローディング完了でメニューへ
}

// 流れ: 同意画面(最初) → 同意でBGM開始 → タイトル(the ONE) → STARTタップ → 本物ローディング → ロード完了でゆっくり暗転 → セレクト。
// 注意書きは毎起動(タイトル到達ごと)に表示する。
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
      {/* 正方形レイヤー(窓)に横長画像を object-cover で敷く。窓幅で寄り(ズーム)、下寄せ＋下マージンで
          キャラの足が START のすぐ上に来るよう高さを合わせる。数値(width / paddingBottom)で微調整可。 */}
      {/* 絶対配置で中央固定(flex子にしない)。flex子だと flex-shrink で width が container幅(100vw)に
          clamp され、150vw 等を指定しても効かない(=埒が開かない原因だった)。overflow-hidden(root)で
          はみ出しはクリップ。width が寄り(ズーム)、aspect-square＋object-cover で左右だけクロップ。 */}
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
        <span className="absolute top-3 right-3 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-mono tabular-nums text-white/70 backdrop-blur-sm">
          v{__APP_VERSION__}
        </span>
      )}

      {/* ご利用にあたって(同意画面・最初に表示) */}
      {phase === 'notice' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 px-4 py-6">
          <div
            className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0c0c14]/95 shadow-2xl"
            style={{ fontFamily: '"Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif' }}
          >
            <div className="overflow-y-auto overscroll-contain touch-pan-y px-5 pt-5 pb-3 text-white/85">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-amber-200">⚠ ご利用にあたって</h2>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-mono tabular-nums text-white/70">v{__APP_VERSION__}</span>
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
            <div className="border-t border-white/10 p-4">
              <button
                onClick={(e) => { e.stopPropagation(); agree(); }}
                className="w-full rounded-xl bg-gradient-to-b from-sky-500 to-sky-600 py-3 text-[15px] font-semibold text-white shadow-lg active:from-sky-600 active:to-sky-700"
              >
                同意して始める
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
          <span className="animate-pulse text-3xl font-semibold tracking-[0.45em] text-white/90 drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)]">
            START
          </span>
          <span className="mt-3 text-[11px] tracking-[0.3em] text-white/45">画面をタップして開始</span>
        </div>
      )}

      {/* 本物ローディング(START後・暗転の前に素材完了を待つ) */}
      {phase === 'loading' && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-end bg-black/45 pb-[18%]">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-white/75" />
          <span className="mt-4 text-[11px] tracking-[0.34em] text-white/55">LOADING…</span>
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
