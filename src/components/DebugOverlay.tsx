import React, { useEffect, useRef, useState } from 'react';
import { useGameStore, isInputLocked, isGameTimeStopped } from '../store/gameStore';
import { isHiddenBoss } from '../utils/enemyUtils';
import { getSelectedStageId, getBaseGrowthForStage, getBaseGrowth, setBaseGrowth } from '../data/progress';

// 凍結診断用オンスクリーン表示(?debug=1)。ゲームループとは独立に自前 raf で毎フレーム更新するので、
// シムが固まっても(ループ早期return等)この表示だけは動き続け、何が張り付いているか分かる。
const DebugOverlay: React.FC = () => {
  const [, setTick] = useState(0);
  const raf = useRef<number | undefined>(undefined);
  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      setTick(t => (t + 1) % 1_000_000);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    // デバッグ用: コンソールから拠点Lv/EXPを書き込んで永続/ステージ別分離を検証できる。
    //   __bumpBaseExp('base-0', 50) … 現ステージの base-0 に EXP+50(永続)。リロード/ステージ切替で確認。
    //   __setBaseLevel('base-0', 3) … Lv を直接セット。  (Step3 のEXP加算実装までの確認用フック)
    const w = window as unknown as Record<string, unknown>;
    w.__bumpBaseExp = (baseId: string, amt: number) => {
      const sid = getSelectedStageId(); const g = getBaseGrowth(sid, baseId);
      setBaseGrowth(sid, baseId, { level: g.level, exp: g.exp + (amt || 0) });
      return getBaseGrowth(sid, baseId);
    };
    w.__setBaseLevel = (baseId: string, lv: number) => {
      const sid = getSelectedStageId(); const g = getBaseGrowth(sid, baseId);
      setBaseGrowth(sid, baseId, { level: lv, exp: g.exp });
      return getBaseGrowth(sid, baseId);
    };
    return () => {
      running = false; if (raf.current) cancelAnimationFrame(raf.current);
      delete w.__bumpBaseExp; delete w.__setBaseLevel;
    };
  }, []);

  const s = useGameStore.getState();
  const now = Date.now();
  const boss = s.enemies.find(e => isHiddenBoss(e.type));
  const hs = Math.max(0, Math.round(s.hitstopUntil - now));
  const introActive = s.introUntil === -1 || (s.introUntil > 0 && now < s.introUntil);
  const Y = (b: boolean) => (b ? 'Y' : '·');
  const p = s.player;
  const stageId = getSelectedStageId();
  const baseGrowth = getBaseGrowthForStage(stageId); // 現ステージ4拠点の永続Lv/EXP(未登録=Lv1/EXP0)
  // 移動を止めうるプレイヤー状態(各 *Until は Date.now 基準。残り>0 なら移動入力を無視する)。
  const blk = [
    now < p.wireDashUntil ? 'wireDash' : '',
    p.wireStuckEnemyId ? 'wireStuck' : '',
    now < p.katanaDashUntil ? 'katDash' : '',
    now < p.katanaRecoveryUntil ? 'katRecov' : '',
    now < p.shijinSlideUntil ? 'slide' : '',
  ].filter(Boolean).join(',') || '-';
  const lines = [
    `t ${(s.gameTime / 1000).toFixed(1)}s sw${s.swipeDirection ? 'Y' : '·'}`,
    `p ${Math.round(p.x)},${Math.round(p.y)} hp ${Math.round(p.health)}`,
    `att${Y(!!s.attention)} hs${hs} pause${Y(s.isPaused)}`,
    `dlg${Y(s.introDialogueActive)} intro${Y(introActive)}`,
    `gts${Y(isGameTimeStopped())} lock${Y(isInputLocked())}`,
    `blk ${blk}`,
    `chase${Y(s.bossChasing)} boss${Y(!!boss)}`,
    ...(boss ? [`bx ${Math.round(boss.x)},${Math.round(boss.y)} ${boss.bossState ?? '-'} bhp ${Math.round(boss.health)}`] : []),
    ...(s.debugLoopError ? [`ERR ${s.debugLoopError}`] : []),
    // 拠点の永続Lv/EXP(出撃中のHP/captured等とは別。stage×base ごと・未登録=Lv1/EXP0)。
    `base[${stageId || '?'}] ${baseGrowth.map(b => `${b.baseId.replace('base-', '')}:L${b.level}/${b.exp}`).join(' ')}`,
  ];

  return (
    <div
      className="fixed px-2 py-1 rounded text-[10px] tabular-nums leading-tight"
      style={{
        left: 'max(env(safe-area-inset-left), 8px)',
        top: 'calc(max(env(safe-area-inset-top), 8px) + 64px)',
        zIndex: 95,
        color: '#9effa0',
        background: 'rgba(0,0,0,0.78)',
        textShadow: '0 1px 2px rgba(0,0,0,0.95)',
        pointerEvents: 'none',
        maxWidth: '62vw',
        whiteSpace: 'normal',
        wordBreak: 'break-word',
      }}
    >
      {lines.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
};

export default DebugOverlay;
