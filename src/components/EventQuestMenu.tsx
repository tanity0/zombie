import React from 'react';
import { useGameStore } from '../store/gameStore';

const dialogue = [
  { speaker: '女', text: '隊長！感染者じゃなさそう！' },
  { speaker: '男', text: '・・・フム、何も見なかった事にしろ。' },
  { speaker: '女', text: '感染者サンプルを探してるの！' },
  { speaker: '男', text: 'ばか言うな！・・・知られたからには手伝ってもらう。' },
];

const EventQuestMenu: React.FC = () => {
  const acceptEventQuest = useGameStore(state => state.acceptEventQuest);
  const declineEventQuest = useGameStore(state => state.declineEventQuest);

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center px-3 pb-24 pointer-events-auto">
      <div className="absolute inset-0 bg-black/35" />
      <div className="relative glass-panel rounded-3xl w-full max-w-lg overflow-hidden border border-sky-200/15">
        <div className="px-4 pt-4 pb-2">
          <div className="text-[10px] uppercase tracking-[0.24em] text-sky-200/65">RANDOM EVENT</div>
          <h2 className="text-lg font-bold text-white">謎の二人組</h2>
        </div>

        <div className="px-4 pb-3 space-y-2">
          {dialogue.map((line, index) => (
            <div key={`${line.speaker}-${index}`} className="flex gap-2 text-sm leading-snug">
              <span className="shrink-0 min-w-8 text-sky-200/80 font-bold">{line.speaker}</span>
              <span className="text-white/90">{line.text}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 px-4 pb-4">
          <button
            onClick={acceptEventQuest}
            className="rounded-2xl bg-sky-300/18 border border-sky-200/20 py-3 text-sm font-bold text-sky-50 active:scale-[0.98]"
          >
            受ける
          </button>
          <button
            onClick={declineEventQuest}
            className="rounded-2xl bg-white/8 border border-white/10 py-3 text-sm font-bold text-white/80 active:scale-[0.98]"
          >
            受けない
          </button>
        </div>
      </div>
    </div>
  );
};

export default EventQuestMenu;
