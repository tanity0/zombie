import React from 'react';
import { GameStats } from '../types/game';
import { formatTime } from '../utils/renderUtils';
import { calculateResultScore } from '../utils/resultScoring';

interface GameOverScreenProps {
  stats: GameStats;
  onReturnToMenu: () => void;
  onPlayAgain: () => void;
  won?: boolean;
}

const GameOverScreen: React.FC<GameOverScreenProps> = ({
  stats,
  onReturnToMenu,
  onPlayAgain,
  won = false
}) => {
  const {
    damageScore,
    comboScore,
    treasureScore,
    strapScore,
    clearMultiplier,
    totalScore,
    goldEarned,
  } = calculateResultScore(stats, won);
  const remainingStraps = Math.max(0, stats.strapsCollected - stats.strapsSpent);
  const statsItems = [
    { label: '生存時間', value: formatTime(stats.timeAlive) },
    { label: '撃破', value: stats.enemiesKilled },
    { label: '与ダメ', value: Math.floor(stats.damageDealt) },
    { label: 'Lv', value: stats.maxLevel },
    { label: '最大コンボ', value: stats.maxCombo },
    { label: 'トレジャー', value: stats.treasuresCollected },
    { label: 'ストラップ残', value: remainingStraps },
    { label: 'ゴールド', value: goldEarned }
  ];
  const scoreItems = [
    { label: '与ダメ', value: damageScore },
    { label: '最大コンボ', value: comboScore },
    { label: 'トレジャー', value: treasureScore },
    { label: '残ストラップ', value: strapScore },
    { label: 'クリア倍率', value: `x${clearMultiplier}` }
  ];

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-3"
      style={{ background: 'rgba(11, 11, 18, 0.85)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
    >
      <div className="glass-panel rounded-3xl w-full max-w-lg overflow-hidden">
        <div className="px-4 pt-5 pb-2 text-center">
          <h2 className={`text-2xl font-semibold tracking-tight ${won ? 'text-amber-300' : 'text-white'}`}>
            {won ? 'ステージクリア！' : 'ゲームオーバー'}
          </h2>
          <p className="text-[13px] text-white/60 mt-1">
            {won ? '森を生き延びた' : '闇に飲み込まれました'}
          </p>
        </div>
        <div className="px-4 pb-4">
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="rounded-2xl bg-white/5 border border-white/10 px-3 py-2">
              <div className="mb-1.5 text-[10px] uppercase tracking-widest text-white/45">RESULT</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {statsItems.map(item => (
                  <div key={item.label} className="min-w-0">
                    <div className="text-[9px] tracking-wide text-white/45 truncate">{item.label}</div>
                    <div className="text-[15px] font-semibold text-white tabular-nums truncate">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl bg-black/25 border border-white/10 px-3 py-2">
              <div className="mb-2">
                <div className="text-[10px] uppercase tracking-widest text-white/45">SCORE</div>
                <div className="text-2xl font-bold text-amber-200 tabular-nums leading-tight">{totalScore}</div>
              </div>
              <div className="space-y-1 text-[11px] text-white/65 tabular-nums">
                {scoreItems.map(item => (
                  <div key={item.label} className="flex items-center justify-between gap-2">
                    <span>{item.label}</span>
                    <span className="text-right text-white/80">{item.value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[9px] leading-tight text-white/45">
                ゴールド = SCORE / 3000
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onPlayAgain}
              className="w-full py-3 rounded-2xl text-sm font-semibold text-white"
              style={
                won
                  ? {
                      background: 'linear-gradient(180deg, rgba(251, 191, 36, 0.95), rgba(245, 158, 11, 0.95))',
                      boxShadow: '0 8px 24px rgba(245, 158, 11, 0.35)'
                    }
                  : {
                      background: 'linear-gradient(180deg, rgba(96, 165, 250, 0.95), rgba(59, 130, 246, 0.95))',
                      boxShadow: '0 8px 24px rgba(59, 130, 246, 0.35)'
                    }
              }
            >
              もう一度プレイ
            </button>
            <button
              onClick={onReturnToMenu}
              className="w-full py-3 rounded-2xl text-sm font-semibold text-white/90 bg-white/10 border border-white/10"
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
