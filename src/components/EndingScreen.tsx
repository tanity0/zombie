import React, { useEffect, useRef, useState } from 'react';
import { ENDING_HEADER, ENDING_SCRIPT, ENDING_FINAL_WORD } from '../data/ending';
import { setEndingBgm } from '../audio/audioManager';
import { useGameStore } from '../store/gameStore';

// 通常エンディング(社長編集稿v0.25.2191): 軍の聴取記録→暗転で「成し得なかった」だけが残り
// フェードアウト→入れ替わりに「the ONE」フェードイン→メニューへ。
// - 台詞はタップで送り(オート送りもあり)。本文はサブ達成状況で変えない。
// - スタッフロールは文面未支給のため最小(タイトルロゴ相当のテキストのみ)=TODO。
// - scenic(社長指示2026-08-29「このシーンを、グレン撃破後のミラの事情聴取の後ろに流して」):
//   背後でエンディングステージ(戦場の観賞シーン)が動いている前提のオーバーレイモード。
//   聴取記録中は薄い黒スクリム(「薄く黒を引いて文字を見やすく」)、暗転(word)以降は従来どおり
//   全黒へフェード(慣性=background-colorのtransition)。z はSortieLoadingOverlay(z-[100])より
//   上=レンダラ初期化中の黒繋ぎの上でも文字が読める。
// 負荷 1/10: 静的DOM+CSSトランジションのみ(scenic時の背後のゲーム描画はステージ側の負荷)。

type Phase = 'script' | 'word' | 'credits';

const LINE_AUTO_MS = 3200;      // オート送りの1行表示時間
const FINAL_WORD_MS = 3200;     // 「成し得なかった」残留(1.8s)+フェードアウト(1.2s)+間
const CREDITS_MS = 3800;        // the ONE フェードイン表示時間

interface EndingScreenProps {
  onDone: () => void;
  /** 背後にエンディングステージを流すオーバーレイモード(上のコメント参照)。 */
  scenic?: boolean;
}

// scenic時のスクリム濃度(聴取記録中)。「薄く黒を引いて文字を見やすく」の叩き台。
const SCENIC_SCRIM_ALPHA = 0.45;

const EndingScreen: React.FC<EndingScreenProps> = ({ onDone, scenic = false }) => {
  // エンディングBGM(社長支給2026-08-20): この画面のマウント中だけ再生。通常BGMは gameState==='ending'
  // 中は App が setBgmScene('off') にしているので重ならない。
  useEffect(() => {
    setEndingBgm(true);
    return () => setEndingBgm(false);
  }, []);
  const [phase, setPhase] = useState<Phase>('script');
  const [lineIdx, setLineIdx] = useState(0); // 表示済みの行数-1(0=最初の1行のみ表示)
  // scenic時: word(暗転)以降は背後の爆撃を止める(ENDING_SCENE.md v3.1 監査A-7——全黒の
  // 「成し得なかった」「the ONE」の裏で爆発音とシェイクを鳴らさない)。滞空弾もstore側で消える。
  useEffect(() => {
    if (scenic && phase !== 'script') useGameStore.getState().setEndingBombing(false);
  }, [scenic, phase]);
  const timerRef = useRef<number | null>(null);
  const doneRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimer();
    onDone();
  };

  // 次へ(タップ/オート共通)。script中=次の行、最終行→word(成し得なかった残留)→credits(the ONE)→onDone。
  const advance = () => {
    clearTimer();
    if (phase === 'script') {
      if (lineIdx < ENDING_SCRIPT.length - 1) setLineIdx(i => i + 1);
      else setPhase('word');
    } else if (phase === 'word') {
      setPhase('credits');
    } else {
      finish();
    }
  };

  // フェーズ/行ごとのオート送りタイマー。
  useEffect(() => {
    clearTimer();
    const delay =
      phase === 'script' ? LINE_AUTO_MS
      : phase === 'word' ? FINAL_WORD_MS
      : CREDITS_MS;
    timerRef.current = window.setTimeout(advance, delay);
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, lineIdx]);

  const onTap = () => advance();

  const visibleLines = ENDING_SCRIPT.slice(0, lineIdx + 1);

  return (
    <div
      className={scenic ? 'fixed inset-0 z-[110] select-none' : 'fixed inset-0 z-50 bg-black select-none'}
      onClick={onTap}
      style={{
        touchAction: 'manipulation',
        ...(scenic
          ? {
              backgroundColor: phase === 'script' ? `rgba(0,0,0,${SCENIC_SCRIM_ALPHA})` : 'rgba(0,0,0,1)',
              transition: 'background-color 900ms ease', // 暗転への移行も慣性(パッと黒にしない)
            }
          : {}),
      }}
    >
      {/* 中央揃え・高さ50vhの帯の中で会話をローリング表示(社長指示v0.25.2194): 新しい行は下から
          積まれ、古い行は上へ流れて上端でフェードアウト(マスク)。長文で下が切れないよう窓を固定高に。 */}
      {phase === 'script' && (
        <div className="flex h-full w-full items-center justify-center px-6">
          <div className="flex w-full max-w-md flex-col" style={{ height: '50vh' }}>
            <p
              className="shrink-0 mb-4 text-center text-[13px] tracking-[0.2em] text-white/55"
              style={{ fontFamily: 'Georgia, "Hiragino Mincho ProN", serif' }}
            >
              {ENDING_HEADER}
            </p>
            <div
              className="relative min-h-0 flex-1"
              style={{
                overflow: 'hidden',
                maskImage: 'linear-gradient(to bottom, transparent 0%, black 26%, black 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 26%, black 100%)',
              }}
            >
              <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end space-y-3">
                {visibleLines.map((l, i) => (
                  <p
                    key={i}
                    className="text-[15px] leading-relaxed text-white/90 screen-in"
                    style={{ fontFamily: 'Georgia, "Hiragino Mincho ProN", serif' }}
                  >
                    <span className="mr-2 text-white/55">{l.speaker}</span>
                    「{l.text}」
                  </p>
                ))}
              </div>
            </div>
            <p className="shrink-0 mt-4 text-center text-[10px] tracking-widest text-white/25">タップで進む</p>
          </div>
        </div>
      )}

      {/* 暗転で「成し得なかった」だけが残り、フェードアウト(社長指定v0.25.2191)。 */}
      {phase === 'word' && (
        <div className="flex h-full w-full items-center justify-center">
          <style>{`@keyframes endWordOut{to{opacity:0}}`}</style>
          <span
            className="text-2xl font-semibold tracking-[0.2em] text-white/90"
            style={{
              fontFamily: 'Georgia, "Hiragino Mincho ProN", serif',
              animation: 'endWordOut 1.2s ease-in 1.8s forwards',
            }}
          >
            {ENDING_FINAL_WORD}
          </span>
        </div>
      )}

      {phase === 'credits' && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3">
          <span
            className="screen-in text-2xl font-semibold tracking-[0.3em] text-white/90"
            style={{ fontFamily: 'Georgia, "Hiragino Mincho ProN", serif', paddingLeft: '0.3em' }}
          >
            the ONE
          </span>
          <span className="screen-in text-[11px] tracking-widest text-white/40">Thank you for playing</span>
        </div>
      )}
    </div>
  );
};

export default EndingScreen;
