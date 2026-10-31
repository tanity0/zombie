// v0.25.2591(社長「守護霊、logつけてやったけど、どうしたらいいの?」): `?ghostlog=1` の被弾ログを
// **画面に出す**オーバーレイ。スマホ実機ではコンソールが見られないため、そのままスクリーンショットで
// 共有できる形にする(console出力は従来どおり併存=PCでは開発者ツールからも読める)。
//
// 再レンダー規律(CLAUDE.md): storeを購読しない。ログはモジュール変数(gameStore.ghostDamageLogLines)に
// 溜まるので、ここが**1秒間隔**で読みに行くだけ(被弾は稀なイベント=これで十分)。ゲーム中の
// 毎フレーム再レンダーは発生しない。`?ghostlog=1` でない時は何も描かない(通常プレイに影響ゼロ)。
import React, { useEffect, useState } from 'react';
import { GHOST_DMG_LOG_ENABLED, ghostDamageLogLines } from '../store/gameStore';

const GhostDamageLog: React.FC = () => {
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    if (!GHOST_DMG_LOG_ENABLED) return;
    const id = window.setInterval(() => setLines(ghostDamageLogLines()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!GHOST_DMG_LOG_ENABLED) return null;
  return (
    <div
      className="pointer-events-none absolute left-2 top-24 z-30 max-w-[86vw] font-mono text-[9px] leading-[1.35] text-amber-200/85"
      style={{ background: 'rgba(9,8,14,0.55)', padding: lines.length ? '4px 6px' : 0 }}
    >
      {lines.length > 0 && <div className="text-amber-300/60">[GHOSTDMG] {lines.length}件</div>}
      {lines.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
};

export default GhostDamageLog;
