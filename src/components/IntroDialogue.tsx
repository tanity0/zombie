import React, { useEffect, useRef, useState } from 'react';
import {
  useGameStore,
  INTRO_DIALOGUE_LINES,
  INTRO_DIALOGUE_CHAR_MS,
  INTRO_DIALOGUE_LINE_HOLD_MS,
  CHARACTER_CLASS_NAMES,
} from '../store/gameStore';

// 登場時のセリフ(時間停止中に自動で文字が流れる)。VN風の下部ボックス。
// 入力不要(オートタイプ→流れ終わると useGameLoop 側がゲームを再開)。
// per-frame の重い再描画を避けるため、表示中だけ自前 raf でこの小コンポーネントのみ更新する。
const IntroDialogue: React.FC = () => {
  const active = useGameStore((s) => s.introDialogueActive);
  const startedAt = useGameStore((s) => s.introDialogueStartedAt);
  const characterClass = useGameStore((s) => s.player.characterClass);
  const [, setTick] = useState(0);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!active) return;
    let running = true;
    const loop = () => {
      if (!running) return;
      setTick((t) => (t + 1) % 1_000_000);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active]);

  if (!active) return null;

  const elapsed = Date.now() - startedAt;
  // 行ごとの可視文字数を算出(前の行は打ち終え、現在行だけオートタイプ)。
  let remaining = elapsed;
  const rendered: { speaker: string | null; text: string; typing: boolean }[] = [];
  for (const line of INTRO_DIALOGUE_LINES) {
    if (remaining <= 0) break;
    const shown = Math.max(0, Math.min(line.text.length, Math.floor(remaining / INTRO_DIALOGUE_CHAR_MS)));
    rendered.push({ speaker: line.speaker, text: line.text.slice(0, shown), typing: shown < line.text.length });
    remaining -= line.text.length * INTRO_DIALOGUE_CHAR_MS + INTRO_DIALOGUE_LINE_HOLD_MS;
  }
  if (rendered.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(env(safe-area-inset-bottom),18px)]">
      <div
        className="w-full max-w-xl rounded-lg border border-cyan-200/30 bg-slate-950/85 px-4 py-3 shadow-2xl backdrop-blur-sm"
        style={{ fontFamily: '"Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif' }}
      >
        {rendered.map((l, i) => {
          const last = i === rendered.length - 1;
          const cursor = last && l.typing;
          if (l.speaker) {
            // '__class__' は選択中の職業名へ置換。
            const speaker = l.speaker === '__class__'
              ? (CHARACTER_CLASS_NAMES[characterClass] ?? 'プレイヤー')
              : l.speaker;
            return (
              <p key={i} className="text-[13px] leading-relaxed text-amber-100">
                <span className="mr-1 font-bold text-amber-300">{speaker}</span>
                「{l.text}{cursor && <span className="opacity-70">▌</span>}」
              </p>
            );
          }
          return (
            <p key={i} className="text-[13px] leading-relaxed text-cyan-100">
              <span className="mr-2 align-middle text-[10px] font-bold tracking-widest text-cyan-400">▶ 通信</span>
              {l.text}{cursor && <span className="opacity-70">▌</span>}
            </p>
          );
        })}
      </div>
    </div>
  );
};

export default IntroDialogue;
