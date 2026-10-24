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
const FAST_STEP_MS = 16;       // 途中タップ後の高速打ち込み: 1回の間隔
const FAST_STEP_CHARS = 4;     // 同: 1回に打つ文字数(区切り1つ≒1秒強で打ち切る)
const SCROLL_MIN_MS = 320;     // 次の区切りを上端へ送る尺(距離で伸びる)
const SCROLL_MAX_MS = 720;
const AFTER_SCROLL_MS = 140;   // 送り終えてから打ち始めるまで
const TAP_SLOP_PX = 12;        // これ以上指が動いたらスクロール扱い(送らない)

type Mode = 'typing' | 'waiting' | 'finished';

const MONO = '"Courier New", "Hiragino Kaku Gothic ProN", monospace';

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
  const [ready, setReady] = useState(false); // 区切りの頭: 送り終えるまで打たない
  const fastRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const doneRef = useRef(false);
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const isLast = sec >= EX_ENDING_SECTIONS.length - 1;

  // 最初の区切り: 黒から明けるのを待って打ち始める。
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), START_DELAY_MS);
    return () => window.clearTimeout(t);
  }, []);

  // 次の区切りへ: 自前の ease-out で上端へ送り(距離で尺が伸びる)、送り終えてから打ち始める。
  useEffect(() => {
    if (sec === 0) return;
    const el = scrollRef.current, head = sectionRefs.current[sec];
    if (!el || !head) { setReady(true); return; }
    const from = el.scrollTop;
    const to = Math.max(0, Math.min(head.offsetTop - 8, el.scrollHeight - el.clientHeight));
    const dist = Math.abs(to - from);
    const dur = Math.min(SCROLL_MAX_MS, SCROLL_MIN_MS + dist * 0.8);
    const t0 = performance.now();
    let raf = 0, timer = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.scrollTop = from + (to - from) * e;
      if (p < 1) raf = requestAnimationFrame(step);
      else timer = window.setTimeout(() => setReady(true), AFTER_SCROLL_MS);
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(timer); };
  }, [sec]);

  // 打ち込み(区切り1つぶん)。最後まで打ったら止まって待つ。
  useEffect(() => {
    if (mode !== 'typing' || !ready) return;
    const text = EX_ENDING_SECTIONS[sec] ?? '';
    if (chars >= text.length) {
      fastRef.current = false;
      setMode(isLast ? 'finished' : 'waiting');
      return;
    }
    const fast = fastRef.current;
    const delay = fast ? FAST_STEP_MS
      : (chars > 0 && text[chars - 1] === '\n' ? CHAR_MS + NEWLINE_EXTRA_MS : CHAR_MS);
    const t = window.setTimeout(() => setChars(c => Math.min(text.length, c + (fast ? FAST_STEP_CHARS : 1))), delay);
    return () => window.clearTimeout(t);
  }, [mode, ready, sec, chars, isLast]);

  // 打っている間は、打っている区切りの末尾が画面の下へ出たら追いかける(打ち終えた後は、読む人が送った位置を動かさない)。
  useEffect(() => {
    if (mode !== 'typing' || chars === 0) return;
    const el = scrollRef.current, cur = sectionRefs.current[sec];
    if (!el || !cur) return;
    const bottom = cur.offsetTop + cur.offsetHeight;
    const margin = 72;
    if (bottom > el.scrollTop + el.clientHeight - margin) el.scrollTop = bottom - el.clientHeight + margin;
  }, [mode, sec, chars]);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  const onTap = () => {
    if (mode === 'typing') {
      // 打っている途中: 高速で打ち切る(一瞬で全文は出さない=打たれていく手触りを残す)。次の区切りへは進まない。
      if (ready) fastRef.current = true;
    } else if (mode === 'waiting') {
      setReady(false);
      setSec(i => i + 1);
      setChars(0);
      setMode('typing');
    } else {
      finish();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black select-none"
      style={{ touchAction: 'pan-y' }}
      // 触れて離した位置がほぼ同じなら送る(指が滑った=スクロールでは送らない)。触れた瞬間ではなく離した瞬間。
      onPointerDown={(e) => { downRef.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUp={(e) => {
        const d = downRef.current; downRef.current = null;
        if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < TAP_SLOP_PX) onTap();
      }}
      onPointerCancel={() => { downRef.current = null; }}
    >
      <style>{`
        @keyframes exEndIn{from{opacity:0}to{opacity:1}}
        @keyframes exCaretBlink{0%,55%{opacity:1}56%,100%{opacity:0}}
        @keyframes exCaretOut{0%,35%{opacity:1}100%{opacity:0}}
        @keyframes exHintIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
        .ex-end-root{animation:exEndIn 1.1s ease-out forwards}
        .ex-caret{display:inline-block;margin-left:2px;animation:exCaretBlink 0.9s step-end infinite}
        .ex-caret-out{display:inline-block;margin-left:2px;animation:exCaretOut 1.8s ease-in forwards}
        .ex-hint{animation:exHintIn .5s cubic-bezier(.2,.7,.2,1) both}
      `}</style>
      {/* 表題は端末の見出しとして上に固定(本文と一緒に流さない)。 */}
      <p
        className="ex-end-root shrink-0 px-6 pb-4 text-center text-[13px] tracking-[0.25em] text-emerald-200/70"
        style={{ fontFamily: MONO, paddingTop: 'calc(env(safe-area-inset-top, 0px) + 40px)' }}
      >
        {EX_ENDING_TITLE}
      </p>
      <div
        ref={scrollRef}
        className="ex-end-root min-h-0 w-full flex-1 overflow-y-auto px-6"
        style={{
          scrollbarWidth: 'none',
          // 上端で行が半分に切れて見えないよう、上端だけ薄く消す。
          maskImage: 'linear-gradient(to bottom, transparent 0, black 44px, black 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, black 44px, black 100%)',
        }}
      >
        <div className="mx-auto w-full max-w-xl pt-6">
          {EX_ENDING_SECTIONS.slice(0, sec + 1).map((text, i) => (
            <div key={i} ref={el => { sectionRefs.current[i] = el; }}>
              {i > 0 && <div className="my-7 text-center text-[13px] text-emerald-100/25">⸻</div>}
              <p
                className="text-[14px] leading-relaxed text-emerald-100/85"
                style={{ whiteSpace: 'pre-wrap', fontFamily: MONO }}
              >
                {i < sec ? text : text.slice(0, chars)}
                {i === sec && <span className={mode === 'finished' ? 'ex-caret-out' : 'ex-caret'}>▌</span>}
              </p>
            </div>
          ))}
          {/* 最後の区切りでも上端まで送れるだけの余白。 */}
          <div style={{ height: 'calc(70svh / var(--hud-s, 1))' }} />
        </div>
      </div>
      {/* 入力待ちの合図は端末の書式で(等幅・薄緑)。区切りが画面より長くても見えるよう下端に固定。 */}
      {/* キー・パッドの決定もこれを押す(menuNav の主役=data-nav-default)。触った時は画面全体と同じ1回だけ送る。
          ★打っている間も透明のまま置いておく=決定ボタンの連打は「速く打ち切る」へ行き、右下のスキップを押さない。 */}
      <button
        type="button"
        data-nav-default
        aria-label={mode === 'finished' ? '記録を閉じる' : '次の記録へ'}
        className="absolute inset-x-0 mx-auto w-fit px-4 py-2 text-center text-[11px] tracking-[0.18em] text-emerald-100/45"
        style={{ fontFamily: MONO, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)', background: 'transparent' }}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onTap(); }}
      >
        <span key={`${mode}-${sec}`} className={mode === 'typing' ? '' : 'ex-hint'} style={mode === 'typing' ? { opacity: 0 } : undefined}>
          <TapWord />{mode === 'finished' ? 'で記録を閉じる' : 'で次の記録へ'}
        </span>
      </button>
      {/* スキップ(社長指示2026-10-14「EXクリア後の文章にスキップを付ける」): 通常のエンディングと同じ見た目・位置(右下)。
          押した瞬間に記録を閉じてリザルトへ。Esc・パッドのスタートでも押せる(data-skip=utils/menuNav.pressVisibleSkip)。 */}
      {mode !== 'finished' && (
        <button
          type="button"
          data-skip
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); finish(); }}
          style={{
            position: 'absolute', zIndex: 10,
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)', right: 18,
            padding: '6px 14px', fontSize: 12, color: 'rgba(255,255,255,0.75)',
            background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 999,
          }}
        >
          スキップ
        </button>
      )}
    </div>
  );
};

export default ExEndingScreen;
