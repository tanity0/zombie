import React, { useEffect, useRef, useState } from 'react';
import TapWord from './TapWord';
import { EX_ENDING_TITLE, EX_ENDING_SECTIONS } from '../data/exEnding';
import { setEndingBgm } from '../audio/audioManager';

// EXエンディング(社長指示 2026-08-21): フィル撃破→フェードアウト後に、最終調査記録の原稿を
// **キーボードの打ち込みのように**1文字ずつ表示して流す。軍の端末ログ風(等幅・薄緑・カーソル点滅)。
// - ★一区切り1タップ(社長指示2026-10-14「エンディングと、EXクリア後の文章、早すぎて読めない。一区切り、1タップ制にする？」→はい):
//   ⸻ の区切りを1つ打ち終えたら**止まって待つ**。タップで次の区切りへ。打っている途中のタップは、その区切りを最後まで出す。
//   新しい区切りは画面の上端へ送ってから打ち始める(読み始めの位置を毎回そろえる)。区切りが画面より長い端末では指で上下に送れる
//   (送るのは click=指が滑ったスクロールでは進まない)。最後の区切りの後はタップで終了(onDone→リザルトへ)。
// - 負荷: ゲーム停止中の単独DOM画面(タイマー1本+テキスト更新のみ)=1/10。
// - 速度は全て叩き台(実機で調整)。

const CHAR_MS = 34;            // 1文字あたり
const NEWLINE_EXTRA_MS = 170;  // 改行(息継ぎ)
const START_DELAY_MS = 1200;   // 黒フェードインの間
const SECTION_LEAD_MS = 520;   // 次の区切りを上端へ送ってから打ち始めるまで

type Mode = 'typing' | 'waiting' | 'finished';

interface ExEndingScreenProps {
  onDone: () => void;
}

const ExEndingScreen: React.FC<ExEndingScreenProps> = ({ onDone }) => {
  // エンディングBGM(社長支給)。この画面のマウント中だけ再生(EndingScreenと同じ作法)。
  useEffect(() => {
    setEndingBgm(true);
    return () => setEndingBgm(false);
  }, []);
  const [sec, setSec] = useState(0);
  const [chars, setChars] = useState(0);
  const [mode, setMode] = useState<Mode>('typing');
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const doneRef = useRef(false);
  const isLast = sec >= EX_ENDING_SECTIONS.length - 1;

  // 打ち込み(区切り1つぶん)。最後まで打ったら止まって待つ。
  useEffect(() => {
    if (mode !== 'typing') return;
    const text = EX_ENDING_SECTIONS[sec] ?? '';
    if (chars >= text.length) {
      setMode(isLast ? 'finished' : 'waiting');
      return;
    }
    const lead = chars === 0 ? (sec === 0 ? START_DELAY_MS : SECTION_LEAD_MS) : 0;
    const delay = lead + (chars > 0 && text[chars - 1] === '\n' ? CHAR_MS + NEWLINE_EXTRA_MS : CHAR_MS);
    const t = window.setTimeout(() => setChars(c => c + 1), delay);
    return () => window.clearTimeout(t);
  }, [mode, sec, chars, isLast]);

  // 新しい区切りに入ったら、その区切りを上端へ送る(区切り線ごと)。
  useEffect(() => {
    if (sec === 0) return;
    const el = scrollRef.current, head = sectionRefs.current[sec];
    if (el && head) el.scrollTo({ top: head.offsetTop - 24, behavior: 'smooth' });
  }, [sec]);

  // 打っている間は、打っている区切りの末尾が画面の下へ出たら追いかける(打ち終えた後は、読む人が送った位置を動かさない)。
  useEffect(() => {
    if (mode !== 'typing' || chars === 0) return;
    const el = scrollRef.current, cur = sectionRefs.current[sec];
    if (!el || !cur) return;
    const bottom = cur.offsetTop + cur.offsetHeight;
    const margin = 56;
    if (bottom > el.scrollTop + el.clientHeight - margin) el.scrollTop = bottom - el.clientHeight + margin;
  }, [mode, sec, chars]);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  const onTap = () => {
    if (mode === 'typing') {
      // 打っている途中: その区切りを最後まで出す(次の区切りへは進まない)。
      setChars((EX_ENDING_SECTIONS[sec] ?? '').length);
    } else if (mode === 'waiting') {
      setSec(i => i + 1);
      setChars(0);
      setMode('typing');
    } else {
      finish();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black select-none"
      style={{ touchAction: 'pan-y' }}
      onClick={onTap}
    >
      <style>{`
        @keyframes exEndIn{from{opacity:0}to{opacity:1}}
        @keyframes exCaretBlink{0%,55%{opacity:1}56%,100%{opacity:0}}
        .ex-end-root{animation:exEndIn 1.1s ease-out forwards}
        .ex-caret{display:inline-block;margin-left:2px;animation:exCaretBlink 0.9s step-end infinite}
      `}</style>
      <div ref={scrollRef} className="ex-end-root h-full w-full overflow-y-auto px-6 py-10" style={{ scrollbarWidth: 'none' }}>
        <div className="mx-auto w-full max-w-xl">
          <p
            className="mb-8 text-center text-[13px] tracking-[0.25em] text-emerald-200/70"
            style={{ fontFamily: '"Courier New", "Hiragino Kaku Gothic ProN", monospace' }}
          >
            {EX_ENDING_TITLE}
          </p>
          {EX_ENDING_SECTIONS.slice(0, sec + 1).map((text, i) => (
            <div key={i} ref={el => { sectionRefs.current[i] = el; }}>
              {i > 0 && <div className="my-7 text-center text-[13px] text-emerald-100/25">⸻</div>}
              <p
                className="text-[14px] leading-relaxed text-emerald-100/85"
                style={{ whiteSpace: 'pre-wrap', fontFamily: '"Courier New", "Hiragino Kaku Gothic ProN", monospace' }}
              >
                {i < sec ? text : text.slice(0, chars)}
                {i === sec && mode !== 'finished' && <span className="ex-caret">▌</span>}
              </p>
            </div>
          ))}
          {/* 最後の区切りでも上端まで送れるだけの余白(画面の高さぶん)。 */}
          <div style={{ height: 'calc(70svh / var(--hud-s, 1))' }} />
        </div>
      </div>
      {/* 待っている合図は画面の下端に固定(区切りが画面より長くても見える)。 */}
      {mode !== 'typing' && (
        <p
          key={`${mode}-${sec}`}
          className="screen-in pointer-events-none absolute inset-x-0 text-center text-[11px] tracking-widest text-white/40"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 22px)' }}
        >
          <TapWord />{mode === 'finished' ? 'で終了' : 'で次へ'}
        </p>
      )}
    </div>
  );
};

export default ExEndingScreen;
