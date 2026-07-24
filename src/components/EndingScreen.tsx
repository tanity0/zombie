import React, { useEffect, useRef, useState } from 'react';
import { ENDING_HEADER, ENDING_SCRIPT, ENDING_FINAL_WORD } from '../data/ending';

// 通常エンディング(社長編集稿v0.25.2191): 軍の聴取記録→暗転で「成し得なかった」だけが残り
// フェードアウト→入れ替わりに「the ONE」フェードイン→メニューへ。
// - 台詞はタップで送り(オート送りもあり)。本文はサブ達成状況で変えない。
// - スタッフロールは文面未支給のため最小(タイトルロゴ相当のテキストのみ)=TODO。
// 負荷 1/10: 静的DOM+CSSトランジションのみ(ゲームループ/レンダラは停止済みの画面)。

type Phase = 'script' | 'word' | 'credits';

const LINE_AUTO_MS = 3200;      // オート送りの1行表示時間
const FINAL_WORD_MS = 3200;     // 「成し得なかった」残留(1.8s)+フェードアウト(1.2s)+間
const CREDITS_MS = 3800;        // the ONE フェードイン表示時間

interface EndingScreenProps {
  onDone: () => void;
}

const EndingScreen: React.FC<EndingScreenProps> = ({ onDone }) => {
  const [phase, setPhase] = useState<Phase>('script');
  const [lineIdx, setLineIdx] = useState(0); // 表示済みの行数-1(0=最初の1行のみ表示)
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
      className="fixed inset-0 z-50 bg-black select-none"
      onClick={onTap}
      style={{ touchAction: 'manipulation' }}
    >
      {phase === 'script' && (
        <div className="flex h-full w-full items-center justify-center px-6">
          <div className="w-full max-w-md">
            <p
              className="mb-6 text-center text-[13px] tracking-[0.2em] text-white/55"
              style={{ fontFamily: 'Georgia, "Hiragino Mincho ProN", serif' }}
            >
              {ENDING_HEADER}
            </p>
            <div className="space-y-3">
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
            <p className="mt-8 text-center text-[10px] tracking-widest text-white/25">タップで進む</p>
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
