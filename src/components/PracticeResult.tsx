// 練習(ボスラッシュ)のリザルト。BOSS_MAKER.md §20-7-c。
//
// ★なぜ専用にするか(社長指摘v0.25.2861「表示紛らわしいので、簡素にしてリザルト」):
// 既存の `GameOverScreen` を流用していたため、**報酬額・ハイスコア・掘削記録・守護霊への反映**が
// 並んで見えていた。練習ではそれらを全て封じている(`utils/practiceGuard.ts`)ので**実際には
// 何も増えていない**のに、増えたように読めてしまう。⇒ 練習は練習の情報だけを出す。
//
// 出すのは「勝ったか」「誰と」「どれだけ掛かったか」の3つだけ。
import React, { useState } from 'react';
import { useGameStore, enemyDeathLabel } from '../store/gameStore';
import { practiceActiveSlot, practiceBossType } from '../utils/bossPractice';
import { bossIconSrc } from '../utils/bossIcon';
import { getSelectedStageId } from '../data/progress';

const mmss = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

interface Props {
  won: boolean;
  /** 同じボスと即再戦(★ページ再読込はしない=シームレス・社長指摘v0.25.2862)。 */
  onRetry: () => void;
  /** ボス一覧へ戻る(同上)。 */
  onBackToList: () => void;
}

export const PracticeResult: React.FC<Props> = ({ won, onRetry, onBackToList }) => {
  // 決着時点の値を1回だけ拾う(毎フレーム購読しない=CLAUDE.md の再描画規律)。
  const [elapsed] = useState(() => useGameStore.getState().gameTime);
  const boss = practiceBossType();
  const slot = practiceActiveSlot();
  const bossName = slot?.label ?? (boss ? enemyDeathLabel(boss) : 'ボス');
  const icon = boss ? bossIconSrc(boss, getSelectedStageId(), slot?.startHealthFraction != null ? 'phase2' : undefined) : null;

  return (
    <div className="absolute inset-0 z-[80] flex items-center justify-center bg-[rgba(6,7,13,0.92)] px-6">
      <div className="w-full max-w-xs border border-purple-200/12 bg-[#090b13]/90 p-5 text-center">
        <div className="text-[9px] font-semibold tracking-[0.28em] text-purple-200/55">PRACTICE</div>

        <div className="mx-auto mt-3 flex h-20 w-20 items-end justify-center overflow-hidden bg-black/30">
          {icon && (
            <img
              src={icon}
              alt=""
              draggable={false}
              className={`max-h-[76px] object-contain ${won ? '' : 'opacity-40 grayscale'}`}
              style={{ imageRendering: 'pixelated' }}
            />
          )}
        </div>

        <div className="mt-3 text-[20px] font-semibold tracking-wide text-white">
          {won ? '討伐' : '敗北'}
        </div>
        <div className="mt-0.5 text-[12px] text-white/55">{bossName}</div>

        <div className="mt-4 border-y border-white/[0.07] py-3">
          <div className="text-[8px] uppercase tracking-wider text-white/35">TIME</div>
          <div className="text-[22px] font-semibold tabular-nums text-white">{mmss(elapsed)}</div>
        </div>

        <p className="mt-3 text-[10px] leading-relaxed text-white/35">
          練習なので、討伐記録・ステージ解放・所持金・スコアには残りません。
        </p>

        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={onRetry}
            className="w-full border border-emerald-400/45 bg-emerald-500/15 py-2.5 text-[13px] font-bold text-emerald-100 active:bg-emerald-500/30"
          >もう一度</button>
          <button
            type="button"
            onClick={onBackToList}
            className="w-full border border-white/12 bg-white/[0.04] py-2.5 text-[13px] font-semibold text-white/75 active:bg-white/10"
          >ボスを選ぶ</button>
        </div>
      </div>
    </div>
  );
};

export default PracticeResult;
