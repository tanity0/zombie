import React, { useEffect, useRef, useState } from 'react';
import { EX_ENDING_TITLE, EX_ENDING_SECTIONS } from '../data/exEnding';
import { setEndingBgm } from '../audio/audioManager';

// EXエンディング(社長指示 2026-08-21): フィル撃破→フェードアウト後に、最終調査記録の原稿を
// **キーボードの打ち込みのように**1文字ずつ表示して流す。軍の端末ログ風(等幅・薄緑・カーソル点滅)。
// - タップ押しっぱなしで高速送り(FAST_MULT)。打ち終わったらタップで終了(onDone→リザルトへ)。
// - 負荷: ゲーム停止中の単独DOM画面(タイマー1本+テキスト更新のみ)=1/10。
// - 速度は全て叩き台(実機で調整)。

const CHAR_MS = 34;            // 1文字あたり
const NEWLINE_EXTRA_MS = 170;  // 改行(息継ぎ)
const SECTION_PAUSE_MS = 1400; // セクション区切り(⸻)
const FAST_MULT = 7;           // タップ押下中の速度倍率
const START_DELAY_MS = 1200;   // 黒フェードインの間

interface ExEndingScreenProps {
  onDone: () => void;
}

const ExEndingScreen: React.FC<ExEndingScreenProps> = ({ onDone }) => {
  // エンディングBGM(社長支給)。この画面のマウント中だけ再生(EndingScreenと同じ作法)。
  useEffect(() => {
    setEndingBgm(true);
    return () => setEndingBgm(false);
  }, []);
  const [shown, setShown] = useState<string[]>(['']);
  const [finished, setFinished] = useState(false);
  const fastRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    let alive = true;
    let timer = 0;
    let sec = 0;
    let chars = 0;
    const tick = () => {
      if (!alive) return;
      const text = EX_ENDING_SECTIONS[sec] ?? '';
      let delay = CHAR_MS;
      if (chars < text.length) {
        const ch = text[chars];
        chars++;
        if (ch === '\n') delay = CHAR_MS + NEWLINE_EXTRA_MS;
        const cut = text.slice(0, chars);
        setShown(prev => { const next = prev.slice(); next[sec] = cut; return next; });
      } else if (sec < EX_ENDING_SECTIONS.length - 1) {
        sec++;
        chars = 0;
        delay = SECTION_PAUSE_MS;
        setShown(prev => [...prev, '']);
      } else {
        setFinished(true);
        return;
      }
      timer = window.setTimeout(tick, fastRef.current ? delay / FAST_MULT : delay);
    };
    timer = window.setTimeout(tick, START_DELAY_MS);
    return () => { alive = false; window.clearTimeout(timer); };
  }, []);

  // 打ち込みに合わせて自動で下へ流す(手動スクロールはさせない=onDoneまで一本道)。
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown, finished]);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black select-none"
      style={{ touchAction: 'manipulation' }}
      onPointerDown={() => { fastRef.current = true; }}
      onPointerUp={() => { fastRef.current = false; }}
      onPointerCancel={() => { fastRef.current = false; }}
      onClick={() => { if (finished) finish(); }}
    >
      <style>{`
        @keyframes exEndIn{from{opacity:0}to{opacity:1}}
        @keyframes exCaretBlink{0%,55%{opacity:1}56%,100%{opacity:0}}
        .ex-end-root{animation:exEndIn 1.1s ease-out forwards}
        .ex-caret{display:inline-block;margin-left:2px;animation:exCaretBlink 0.9s step-end infinite}
      `}</style>
      <div ref={scrollRef} className="ex-end-root h-full w-full overflow-y-hidden px-6 py-10">
        <div className="mx-auto w-full max-w-xl">
          <p
            className="mb-8 text-center text-[13px] tracking-[0.25em] text-emerald-200/70"
            style={{ fontFamily: '"Courier New", "Hiragino Kaku Gothic ProN", monospace' }}
          >
            {EX_ENDING_TITLE}
          </p>
          {shown.map((s, i) => (
            <div key={i}>
              {i > 0 && <div className="my-7 text-center text-[13px] text-emerald-100/25">⸻</div>}
              <p
                className="text-[14px] leading-relaxed text-emerald-100/85"
                style={{ whiteSpace: 'pre-wrap', fontFamily: '"Courier New", "Hiragino Kaku Gothic ProN", monospace' }}
              >
                {s}
                {i === shown.length - 1 && !finished && <span className="ex-caret">▌</span>}
              </p>
            </div>
          ))}
          {finished && (
            <p className="screen-in mt-10 pb-6 text-center text-[11px] tracking-widest text-white/40">タップで終了</p>
          )}
          <div style={{ height: '26vh' }} />
        </div>
      </div>
    </div>
  );
};

export default ExEndingScreen;
