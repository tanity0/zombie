import React, { useEffect, useState } from 'react';
import { playSfx } from '../audio/audioManager';
import { Ff7rButton } from './ff7r';
import { useGameStore } from '../store/gameStore';
import { CHARACTER_CLASSES } from '../data/campaign';
import { formatTime } from '../utils/renderUtils';

interface PauseMenuProps {
  onResume: () => void;
  onQuit: () => void;
}

// キーボード案内は、キーボードのある端末だけに出す(縦持ちスマホに「ESC / P」を出さない)。
const hasFinePointer = (): boolean => {
  try { return typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches; } catch { return false; }
};

// クリエイティブ監査第2回・第2手A-6(research/CREATIVE_AUDIT_2026-09-11.md・社長裁定):
// 「戦況付きの全画面メニュー」。左=続ける/メニューに戻る(幅は文字幅)、右=経過時間・残りの敵・部隊。
// 値はポーズ中は進行が止まっているため、開いた時(マウント時)に useGameStore.getState() を1回だけ読む
// (購読しない=このコンポーネントは毎フレーム再描画されない)。
// 「残りの敵」の分母・分子は GameHUD 側(SubquestHud.tsx)の既存の出し方
// `${Math.min(r.progress, r.target)}/${r.target}` をそのまま再利用する(数字の意味を変えない)。
const readPauseSnapshot = () => {
  const s = useGameStore.getState();
  const classInfo = CHARACTER_CLASSES.find(c => c.id === s.player.characterClass);
  return {
    gameTimeSec: Math.floor(s.gameTime / 1000),
    subquests: s.subquests,
    playerName: classInfo?.name ?? 'プレイヤー',
    playerHealth: s.player.health,
    playerMaxHealth: Math.max(1, s.player.maxHealth),
    escortCount: s.escorts.length,
  };
};

const PauseMenu: React.FC<PauseMenuProps> = ({ onResume, onQuit }) => {
  // 開いた時に1回だけ読む(state化はするがsetterは使わない=以後は不変のスナップショット)。
  const [snap] = useState(readPauseSnapshot);

  // Ensure pause menu handles events correctly
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'p') {
        onResume();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onResume]);

  // Stop any existing touch events from propagating to the game
  const preventTouchEvent = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  const hpFrac = Math.max(0, Math.min(1, snap.playerHealth / snap.playerMaxHealth));

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center"
      style={{ background: 'rgba(11, 11, 18, 0.6)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
      onTouchStart={preventTouchEvent}
      onTouchMove={preventTouchEvent}
      onTouchEnd={preventTouchEvent}
    >
      <div className="glass-panel command-panel rounded-none w-full h-full overflow-hidden flex flex-col justify-center">
        <div className="px-5 pt-4 pb-2">
          <div className="text-[13px] font-semibold tracking-[0.14em] text-white/70 gt-emboss">一時停止</div>
        </div>
        <div className="px-5 pb-5 grid grid-cols-[auto_1px_minmax(0,1fr)] gap-x-5 gap-y-4">
          {/* 左: メニュー(幅は文字幅)。 */}
          <div className="flex flex-col items-start gap-2">
            <Ff7rButton onClick={() => { playSfx('ui-select'); onResume(); }} emphasis fade="both" paddingY="0.8rem">
              続ける
            </Ff7rButton>
            <Ff7rButton onClick={() => { playSfx('ui-back'); onQuit(); }} fade="both" paddingY="0.8rem">
              メニューに戻る
            </Ff7rButton>
            {hasFinePointer() && <p className="mt-1 text-[11px] text-white/50">
              ESC / P でも再開
            </p>}
          </div>

          <div className="block bg-white/10" />

          {/* 右: 戦況(開いた時点の値・1回読み)。 */}
          <div className="min-w-0 flex flex-col gap-3 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="tracking-[0.16em] text-white/35">経過時間</span>
              <span className="text-[20px] font-semibold tabular-nums text-white/90">{formatTime(snap.gameTimeSec)}</span>
            </div>

            {snap.subquests.length > 0 && (
              <div>
                <div className="mb-1 tracking-[0.16em] text-white/35">討伐</div>
                <div className="flex flex-col gap-1">
                  {snap.subquests.map(r => (
                    <div key={r.id} className="flex items-center justify-between">
                      <span className={r.done ? 'text-emerald-300/70' : 'text-white/70'}>{r.shortLabel}</span>
                      <span className="text-[13px] tabular-nums text-white/85">{Math.min(r.progress, r.target)}/{r.target}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="mb-1.5 tracking-[0.16em] text-white/35">部隊</div>
              <div className="flex items-center justify-between text-white/75">
                <span>{snap.playerName}</span>
                <span className="text-[10px] tabular-nums text-white/45">{Math.round(snap.playerHealth)}/{Math.round(snap.playerMaxHealth)}</span>
              </div>
              <div className="mt-1 h-1 w-full bg-white/10">
                <div className="h-full bg-[var(--menu-accent,#ffb340)]" style={{ width: `${hpFrac * 100}%` }} />
              </div>
              {snap.escortCount > 0 && (
                <div className="mt-1.5 text-[10px] text-white/40">護衛 {snap.escortCount}名</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PauseMenu;
