import React from 'react';
import { setAudioMuted } from '../audio/audioManager';
import { useAudioMuted } from '../hooks/useAudioMuted';
import { PixelIcon } from './PixelIcon';

// 音を消す/戻すボタン(社長指示2026-11-08「ミュートボタンオープニングから押せるようにしといて」)。
// Bluetooth のイヤホン・スピーカーにつながっている iPhone はマナーモードでも鳴る(Web からは変えられない)ので、
// オープニングから先のどの画面でもワンタップで黙らせられるようにする。状態はオプションの「音なし」と同じ1つ(setAudioMuted)。
// - 押した音は鳴らさない(黙らせるボタンが鳴るのは逆)。
// - 押したタップは下の画面へ渡さない(オープニングの「次へ」・エンディングの送り・歩きの操作に吸われない)。
// - 当たりは 44px 四方。見た目は2種: hud=ゲーム中の音のボタンと同じ半透明の丸(34px)/ ds=作戦室の下段の歯車と同じ線の枡。
const stop = (e: React.SyntheticEvent) => { e.stopPropagation(); };

const MuteButton: React.FC<{ style?: React.CSSProperties; className?: string; variant?: 'hud' | 'ds' }> = ({ style, className, variant = 'hud' }) => {
  const muted = useAudioMuted();
  const handlers = {
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); e.stopPropagation(); setAudioMuted(!muted); },
    onPointerUp: stop, onClick: stop, onTouchStart: stop, onTouchEnd: stop,
  };
  if (variant === 'ds') {
    return (
      <button type="button" aria-label={muted ? '音を戻す' : '音を消す'} aria-pressed={muted} {...handlers}
        className={`ds-foot-gear ${className ?? ''}`} style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', ...style }}>
        <PixelIcon name={muted ? 'volume-off' : 'volume-on'} size={16} />
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-label={muted ? '音を戻す' : '音を消す'}
      aria-pressed={muted}
      {...handlers}
      className={`pointer-events-auto flex h-11 w-11 items-center justify-center ${className ?? ''}`}
      style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', ...style }}
    >
      <span className={`hud-translucent flex h-[34px] w-[34px] items-center justify-center rounded-full ${muted ? 'text-white/45' : 'text-white/70'}`}>
        <PixelIcon name={muted ? 'volume-off' : 'volume-on'} size={17} />
      </span>
    </button>
  );
};

export default MuteButton;
