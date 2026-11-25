import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import './hudPulse.css';

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
//
// research/UIUX_PROPOSAL.md P15「HUD の数字は動いた時だけ出る」: 地(板)は敷かず文字だけを絵の上に直置き(縁取り=gt-outline)。
// 数が動かない間は薄く沈み、増えた瞬間に元の濃さへ戻って**数字だけ**が琥珀に灯って跳ね、ゆっくり薄れる(枠は出さない)。
// React は進捗が変わった時に札を差し替える(key)だけ=灯りと薄れは CSS(hudPulse.css)。
const SubquestRow: React.FC<{ label: string; progress: number; target: number; done: boolean }> = ({ label, progress, target, done }) => {
  const [seen, setSeen] = useState({ progress, seq: 0 });
  if (seen.progress !== progress) setSeen({ progress, seq: progress > seen.progress ? seen.seq + 1 : seen.seq });
  const shown = Math.min(progress, target);
  return (
    <div
      key={seen.seq}
      className={`sq-tag ${seen.seq > 0 ? 'sq-tag--hot' : 'sq-tag--settle'} px-3 py-1 text-[12px] font-semibold tabular-nums gt-outline`}
      style={{ color: done ? '#4ade80' : '#e2e8f0' }}
    >
      {/* v0.25.3705(社長指示): アイコン削除+端的な短縮文(達成は色と薄さで伝える)。
          フル文(「通常の変異体を50体倒す」)はリザルト側=labelのまま。 */}
      {label} <span className="sq-num">{shown}</span>/{target}
    </div>
  );
};

const SubquestHud: React.FC = () => {
  const rows = useGameStore(s => s.subquests);
  if (rows.length === 0) return null;
  return (
    <>
      {rows.map(r => (
        <SubquestRow key={r.id} label={r.shortLabel} progress={r.progress} target={r.target} done={r.done} />
      ))}
    </>
  );
};

export default SubquestHud;
