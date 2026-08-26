// v0.25.3958(社長報告2026-08-26「近接当てると飛んでっちゃう」「動いてて突然消えちゃう敵もいる」):
// `?kblog=1` の観測結果(敵の1フレーム大移動/消失+原因名)を**画面に出す**オーバーレイ。
// スマホ実機ではコンソールが見られないため、そのままスクリーンショットで共有できる形にする
// (console出力は従来どおり併存)。GhostDamageLog(?ghostlog=1)と同型。
//
// 再レンダー規律(CLAUDE.md): storeを購読しない。ログはモジュール変数(gameStore.kbLogLinesGet)に
// 溜まるので、ここが**1秒間隔**で読みに行くだけ。`?kblog=1` でない時は何も描かない(通常プレイに影響ゼロ)。
import React, { useEffect, useState } from 'react';
import { kbLogLinesGet } from '../store/gameStore';

const KB_LOG_OVERLAY_ENABLED =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('kblog') === '1';

const KbLogOverlay: React.FC = () => {
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    if (!KB_LOG_OVERLAY_ENABLED) return;
    const id = window.setInterval(() => setLines(kbLogLinesGet()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!KB_LOG_OVERLAY_ENABLED) return null;
  return (
    <div
      className="pointer-events-none absolute left-2 top-24 z-30 max-w-[86vw] font-mono text-[9px] leading-[1.35] text-cyan-200/85"
      style={{ background: 'rgba(9,8,14,0.55)', padding: '4px 6px' }}
    >
      <div className="text-cyan-300/60">[KBLOG] {lines.length}件(大移動/消失の観測)</div>
      {lines.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
};

export default KbLogOverlay;
