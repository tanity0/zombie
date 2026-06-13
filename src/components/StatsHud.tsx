import React from 'react';
import { useGameStore } from '../store/gameStore';

// 撃破/与ダメ/スクラップ表示。damageDealt は被弾/与ダメ毎に変わり頻繁に再描画されるため、
// メインの GameHUD から分離してこの小コンポーネントだけ更新させる。
const StatsHud: React.FC = () => {
  const kills = useGameStore(s => s.gameStats.enemiesKilled);
  const dmg = useGameStore(s => Math.floor(s.gameStats.damageDealt));
  const scrap = useGameStore(s => s.player.straps);

  return (
    <div
      className="absolute"
      style={{
        right: 'max(env(safe-area-inset-right), 12px)',
        top: 'calc(max(env(safe-area-inset-top), 8px) + 116px)',
      }}
    >
      <div className="glass-panel rounded-2xl px-2.5 py-1.5 text-[11px] leading-tight text-white/80">
        <div>撃破 {kills}</div>
        <div>DMG {dmg}</div>
        <div>SCRAP {scrap}</div>
      </div>
    </div>
  );
};

export default StatsHud;
