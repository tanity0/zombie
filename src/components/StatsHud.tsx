import React from 'react';
import { useGameStore } from '../store/gameStore';

// 撃破/与ダメ/スクラップ表示。damageDealt は被弾/与ダメ毎に変わり頻繁に再描画されるため、
// メインの GameHUD から分離してこの小コンポーネントだけ更新させる。
const StatsHud: React.FC = () => {
  const kills = useGameStore(s => s.gameStats.enemiesKilled);
  const dmg = useGameStore(s => Math.floor(s.gameStats.damageDealt));
  const scrap = useGameStore(s => s.player.straps);
  // ★v0.25.3649(成果物監査・中4): 右上のクエスト列(二人組+サブクエ最大2)が3ピルに達すると
  // 従来の固定top(+116px)へ届いて重なる。表示中のサブクエ行数(プリミティブ購読)ぶんだけ下へ退避する
  // (1ピル≒29px。二人組は受注制で常時ではないため、恒常的に積まれるサブクエ行数だけを見る)。
  const subquestRows = useGameStore(s => s.subquests.length);

  return (
    <div
      className="absolute"
      style={{
        right: 'max(env(safe-area-inset-right), 12px)',
        top: `calc(max(env(safe-area-inset-top), 8px) + ${116 + subquestRows * 29}px)`,
      }}
    >
      <div className="hud-translucent rounded-2xl px-2.5 py-1.5 text-[11px] leading-tight text-white/80">
        <div>撃破 {kills}</div>
        <div>DMG {dmg}</div>
        <div>SCRAP {scrap}</div>
      </div>
    </div>
  );
};

export default StatsHud;
