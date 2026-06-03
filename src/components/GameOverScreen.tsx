import React from 'react';
import { GameStats } from '../types/game';
import { formatTime } from '../utils/renderUtils';

interface GameOverScreenProps {
  stats: GameStats;
  onReturnToMenu: () => void;
  onPlayAgain: () => void;
}

const GameOverScreen: React.FC<GameOverScreenProps> = ({
  stats,
  onReturnToMenu,
  onPlayAgain
}) => {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-6"
      style={{ background: 'rgba(11, 11, 18, 0.85)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
    >
      <div className="glass-panel rounded-3xl w-full max-w-md overflow-hidden">
        <div className="px-5 pt-6 pb-3 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-white">ゲームオーバー</h2>
          <p className="text-[13px] text-white/60 mt-1">闇に飲み込まれました</p>
        </div>
        <div className="px-5 pb-5">
          <div className="grid grid-cols-2 gap-2 mb-4">
            {[
              { label: '生存時間', value: formatTime(stats.timeAlive) },
              { label: '撃破した敵', value: stats.enemiesKilled },
              { label: '与ダメ', value: Math.floor(stats.damageDealt) },
              { label: '最高レベル', value: stats.maxLevel }
            ].map(item => (
              <div
                key={item.label}
                className="rounded-2xl bg-white/5 border border-white/10 px-3 py-2 text-center"
              >
                <div className="text-[10px] uppercase tracking-widest text-white/50">{item.label}</div>
                <div className="text-lg font-semibold text-white tabular-nums">{item.value}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={onPlayAgain}
              className="w-full py-3 rounded-2xl text-base font-semibold text-white"
              style={{
                background: 'linear-gradient(180deg, rgba(96, 165, 250, 0.95), rgba(59, 130, 246, 0.95))',
                boxShadow: '0 8px 24px rgba(59, 130, 246, 0.35)'
              }}
            >
              もう一度プレイ
            </button>
            <button
              onClick={onReturnToMenu}
              className="w-full py-3 rounded-2xl text-base font-semibold text-white/90 bg-white/10 border border-white/10"
            >
              メニューに戻る
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameOverScreen;