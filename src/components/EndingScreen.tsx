import React, { useEffect, useRef, useState } from 'react';
import { ENDING_HEADER, ENDING_SCRIPT, ENDING_FINAL_WORD } from '../data/ending';

// 通常エンディング(統合正本7章 / 指示書5章): 軍の聴取記録→暗転→PHILL→スタッフロール→メニューへ。
// - 台詞はタップで送り(オート送りもあり)。本文はサブ達成状況で変えない。
// - PHILL は音声・ルビ・追加説明なしで中央に出すだけ。
// - スタッフロールは文面未支給のため最小(タイトルロゴ相当のテキストのみ)=TODO(完了報告に記載)。
// 負荷 1/10: 静的DOM+CSSトランジションのみ(ゲームループ/レンダラは停止済みの画面)。

type Phase = 'script' | 'blackout' | 'phill' | 'credits';

const LINE_AUTO_MS = 3200;     // オート送りの1行表示時間
const BLACKOUT_MS = 1200;      // 「名前は」→PHILL の暗転の間
const PHILL_MS = 3600;         // PHILL 表示時間(タップでも進める)
const CREDITS_MS = 3800;       // 最小スタッフロール表示時間

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

  // 次へ(タップ/オート共通)。script中=次の行、最終行→blackout→phill→credits→onDone。
  const advance = () => {
    clearTimer();
    if (phase === 'script') {
      if (lineIdx < ENDING_SCRIPT.length - 1) setLineIdx(i => i + 1);
      else setPhase('blackout');
    } else if (phase === 'blackout') {
      setPhase('phill');
    } else if (phase === 'phill') {
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
      : phase === 'blackout' ? BLACKOUT_MS
      : phase === 'phill' ? PHILL_MS
      : CREDITS_MS;
    timerRef.current = window.setTimeout(advance, delay);
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, lineIdx]);

  // 暗転はタップでは飛ばさない(「間」を保つ)。それ以外はタップで進行。
  const onTap = () => {
    if (phase === 'blackout') return;
    advance();
  };

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

      {/* 暗転(統合正本7.2「(暗転)」): 完全な黒のみ。 */}

      {phase === 'phill' && (
        <div className="flex h-full w-full items-center justify-center">
          <span
            className="screen-in text-4xl font-semibold tracking-[0.35em] text-white"
            style={{ fontFamily: 'Georgia, "Hiragino Mincho ProN", serif', paddingLeft: '0.35em' }}
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
