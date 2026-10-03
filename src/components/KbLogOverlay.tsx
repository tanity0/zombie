// v0.25.3958(社長報告2026-08-26「近接当てると飛んでっちゃう」「動いてて突然消えちゃう敵もいる」):
// `?kblog=1` の観測結果(敵の1フレーム大移動/消失+原因名)を**画面に出す**オーバーレイ。
// スマホ実機ではコンソールが見られないため、そのままスクリーンショットで共有できる形にする
// (console出力は従来どおり併存)。GhostDamageLog(?ghostlog=1)と同型。
//
// 再レンダー規律(CLAUDE.md): storeを購読しない。ログはモジュール変数(gameStore.kbLogLinesGet)に
// 溜まるので、ここが**1秒間隔**で読みに行くだけ。`?kblog=1` でない時は何も描かない(通常プレイに影響ゼロ)。
import React, { useEffect, useState } from 'react';
import { useGameStore, kbLogLinesGet } from '../store/gameStore';

const KB_LOG_OVERLAY_ENABLED =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('kblog') === '1';

const KbLogOverlay: React.FC = () => {
  const [lines, setLines] = useState<string[]>([]);
  // ★v0.25.3966(社長指示「一時停止中だけ出るようにして」)→★v0.25.3967修正(社長報告「一時停止中に
  // 出てない。レベルアップで出てくる」): isPaused はレベルアップ/商人/チュートリアル等でも true になる
  // 上に、本物の⏸中は PauseMenu(z-50)がこのオーバーレイ(旧z-30)を覆い隠していた=真逆の見え方だった。
  // 表示条件を「⏸メニューが出ている時」(Game.tsx の PauseMenu 表示条件と同じ)に合わせ、z-index を
  // PauseMenu より上(z-[60])へ。観測(kbLogPush)は常時続く=事が起きたら⏸を押せば直近14件が読める。
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!KB_LOG_OVERLAY_ENABLED) return;
    const id = window.setInterval(() => {
      setLines(kbLogLinesGet());
      const s = useGameStore.getState();
      setPaused(s.isPaused && s.tutorialPopup === null && !s.showUpgradeMenu
        && !s.showShopMenu && !s.showEventQuestMenu && !s.storyReturnPromptVisible);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!KB_LOG_OVERLAY_ENABLED || !paused) return null;
  return (
    <div
      className="pointer-events-none fixed left-2 top-24 z-[60] max-w-[86vw] font-mono text-[9px] leading-[1.35] text-cyan-200/85"
      style={{ background: 'rgba(9,8,14,0.55)', padding: '4px 6px' }}
    >
      <div className="text-cyan-300/60">[KBLOG] {lines.length}件(大移動/消失の観測)</div>
      {lines.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
};

export default KbLogOverlay;
