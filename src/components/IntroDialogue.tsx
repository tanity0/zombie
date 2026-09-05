import React, { useEffect, useRef, useState } from 'react';
import {
  useGameStore,
  INTRO_DIALOGUE_CHAR_MS,
  introLineMs,
  CHARACTER_CLASS_NAMES,
} from '../store/gameStore';
import { playRadioStatic } from '../audio/audioManager';

// 登場時のセリフ(時間停止中に自動で文字が流れる)。VN風の下部ボックス。
// 入力不要(オートタイプ→流れ終わると useGameLoop 側がゲームを再開)。
// per-frame の重い再描画を避けるため、表示中だけ自前 raf でこの小コンポーネントのみ更新する。
const IntroDialogue: React.FC = () => {
  const active = useGameStore((s) => s.introDialogueActive);
  const startedAt = useGameStore((s) => s.introDialogueStartedAt);
  const lines = useGameStore((s) => s.introDialogueLines); // この出撃の会話(ミッション別)
  const characterClass = useGameStore((s) => s.player.characterClass);
  const endIntroDialogue = useGameStore((s) => s.endIntroDialogue);
  const [, setTick] = useState(0);
  const rafRef = useRef<number | undefined>(undefined);
  const radioFiredAtRef = useRef<number>(-1); // この登場(startedAt)で無線SEを鳴らしたか

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

  if (!active || lines.length === 0) return null;

  // 1行ずつ切り替えて表示: 現在の行だけを出す(打ち終えたら次の行へ差し替わる)。
  const elapsed = Date.now() - startedAt;
  let remaining = elapsed;
  let curIdx = -1;
  let shown = 0;
  for (let i = 0; i < lines.length; i++) {
    const len = lines[i].text.length;
    const lineTotal = introLineMs(lines[i]);
    if (remaining < lineTotal) {
      curIdx = i;
      shown = Math.max(0, Math.min(len, Math.floor(remaining / INTRO_DIALOGUE_CHAR_MS)));
      break;
    }
    remaining -= lineTotal;
  }
  if (curIdx === -1) {
    // 最終保持中: 最後の行を出し切ったまま。
    curIdx = lines.length - 1;
    shown = lines[curIdx].text.length;
  }
  const line = lines[curIdx];

  // タップ: タイプ中なら一気に全文表示、表示済みなら次のセリフへ(最後なら会話終了)。自動送りは維持。
  // 時間ベース表示なので、introDialogueStartedAt をずらして「仮想時刻」を早送りする(終了判定とも整合)。
  const onAdvance = () => {
    const el = Date.now() - startedAt;
    let acc = 0;
    for (let i = 0; i < lines.length; i++) {
      const total = introLineMs(lines[i]);
      if (el < acc + total) {
        const isText = lines[i].holdMs === undefined;
        const typeDur = isText ? lines[i].text.length * INTRO_DIALOGUE_CHAR_MS : 0;
        if (isText && el - acc < typeDur) {
          useGameStore.setState({ introDialogueStartedAt: Date.now() - (acc + typeDur) }); // 一気に全文
        } else if (i >= lines.length - 1) {
          endIntroDialogue(); // 最終行を表示済み→終了
        } else {
          useGameStore.setState({ introDialogueStartedAt: Date.now() - (acc + total) }); // 次のセリフへ
        }
        return;
      }
      acc += total;
    }
    endIntroDialogue();
  };

  // 会話シーン中だけ右下に出すスキップ(ミッション最初の会話=この登場セリフのみ)。
  // タップで会話を即終了→ゲーム再開。タップが下層の攻撃入力に伝播しないよう stopPropagation。
  const skipButton = (
    <button
      onClick={(e) => { e.stopPropagation(); endIntroDialogue(); }}
      className="pointer-events-auto absolute z-50 rounded-full border border-white/25 bg-black/55 px-4 py-2 text-[11px] font-bold tracking-[0.22em] text-white/80 shadow-lg backdrop-blur-sm active:bg-black/75"
      style={{ right: 'max(env(safe-area-inset-right), 16px)', bottom: 'max(calc(env(safe-area-inset-bottom) + 16px), 20px)' }}
    >
      SKIP ▶▶
    </button>
  );

  // 無線SEの「間」: テキストは出さず、実際の無線ノイズ音を1回だけ鳴らす(ボックスは隠すがスキップは出す)。
  if (line.speaker === '__radio__') {
    if (radioFiredAtRef.current !== startedAt) {
      radioFiredAtRef.current = startedAt;
      playRadioStatic();
    }
    return (
      <div className="pointer-events-auto absolute inset-0 z-40" onClick={onAdvance}>
        {skipButton}
      </div>
    );
  }

  const rendered = [{ speaker: line.speaker, text: line.text.slice(0, shown), typing: shown < line.text.length }];

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center px-4" onClick={onAdvance}>
      {skipButton}
      <div
        className="flex min-h-[5rem] w-full max-w-xl items-center rounded-2xl border-2 border-cyan-300/40 bg-slate-950/90 px-6 py-6 shadow-2xl ring-1 ring-black/40 backdrop-blur-md"
        style={{ fontFamily: '"Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif' }}
      >
        {rendered.map((l, i) => {
          const last = i === rendered.length - 1;
          const cursor = last && l.typing;
          // 生存者の声(通信に割り込む別声)。通信タグ無し・かすれた色・斜体で区別。
          if (l.speaker === '__voice__') {
            return (
              <p key={i} className="text-lg italic leading-relaxed text-rose-200/90">
                「{l.text}{cursor && <span className="opacity-70">▌</span>}」
              </p>
            );
          }
          if (l.speaker) {
            // '__class__' は選択中の職業名へ置換。
            const speaker = l.speaker === '__class__'
              ? (CHARACTER_CLASS_NAMES[characterClass] ?? 'プレイヤー')
              : l.speaker;
            // エドガー(偵察兵)=切迫した別声(かすれた赤)。それ以外(通信兵など)=琥珀。
            const isField = speaker === 'エドガー';
            const bodyCls = isField ? 'text-lg leading-relaxed text-rose-100' : 'text-lg leading-relaxed text-amber-100';
            const nameCls = isField ? 'mr-1.5 font-bold text-rose-300' : 'mr-1.5 font-bold text-amber-300';
            return (
              <p key={i} className={bodyCls}>
                <span className={nameCls}>{speaker}</span>
                「{l.text}{cursor && <span className="opacity-70">▌</span>}」
              </p>
            );
          }
          return (
            <p key={i} className="text-lg leading-relaxed text-cyan-100">
              <span className="mr-2 align-middle text-xs font-bold tracking-widest text-cyan-400">▶ 通信</span>
              {l.text}{cursor && <span className="opacity-70">▌</span>}
            </p>
          );
        })}
      </div>
    </div>
  );
};

export default IntroDialogue;
