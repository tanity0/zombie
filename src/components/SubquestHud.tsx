import React from 'react';
import { useGameStore } from '../store/gameStore';

// サブクエストの進捗表示(research/SUBQUESTS.md v3裁定Q2「右上」)。
// スクラップ表示の下・二人組クエストv2の黄色い討伐行(RescueQuestGoalPill)と**同じ縦積みの列**に置く
// (進行中ならその下に続く)。位置は GameHUD 側の縦積みコンテナが持つ。
//
// ★React再描画規律(CLAUDE.md): `subquests` は store 側で**進捗が動いた時にだけ**書き換わる
//   (毎フレームの set は無い)。よってこの配列を購読しても毎フレーム再描画にはならない。
//   他のHUDを巻き込まないよう、表示は必ずこの小コンポーネントに閉じる。
//
// 表示条件: 通常出撃のみ。ベンチ・練習・ガントレット・台帳の無いステージ・プール全消化では
// store 側が `subquests` を空にするので、ここは自然に何も描かない。
const SubquestHud: React.FC = () => {
  const rows = useGameStore(s => s.subquests);
  if (rows.length === 0) return null;
  return (
    <>
      {rows.map(r => (
        <div
          key={r.id}
          className="glass-pill px-3 py-1 text-[12px] font-semibold tabular-nums"
          style={{ color: r.done ? '#4ade80' : '#e2e8f0', opacity: r.done ? 0.65 : 1 }}
        >
          {/* v0.25.3705(社長指示): アイコン削除+端的な短縮文(達成は色と薄さで伝える)。
              フル文(「通常の変異体を50体倒す」)はリザルト側=labelのまま。 */}
          {r.shortLabel} {Math.min(r.progress, r.target)}/{r.target}
        </div>
      ))}
    </>
  );
};

export default SubquestHud;
