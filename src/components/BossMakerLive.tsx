// ボスメーカーの「いま何が起きているか」表示(BOSS_MAKER.md §1-5 / 社長補足v0.25.2621)。
//
// ★これは**毎フレーム更新される唯一の部品**。CLAUDE.md「React re-render discipline」に従い、
// 調整フォーム(BossMakerPanel)とは**完全に別コンポーネント**へ隔離してある。
// フォーム側は store を毎フレーム購読しない=数値を摘まんでいる間もカクつかない。
// 手本: PerfOverlay.tsx / StatsHud.tsx。
import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';

interface Live { state: string; dist: number; elapsed: number; hp: number; maxHp: number; phase: number }

export const BossMakerLive = ({ bossType }: { bossType: string }) => {
  const [live, setLive] = useState<Live | null>(null);
  // 状態が切り替わった時刻(経過msの起点)。描画に使うだけなので ref で持つ=再描画を増やさない。
  const stateSince = useRef<{ name: string; at: number }>({ name: '', at: 0 });

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const s = useGameStore.getState();
      const e = s.enemies.find(x => x.type === bossType);
      if (e) {
        const p = s.player;
        const dx = (e.x + e.width / 2) - (p.x + p.width / 2);
        const dy = (e.y + e.height / 2) - (p.y + p.height / 2);
        const name = e.bossState ?? 'chase';
        if (stateSince.current.name !== name) stateSince.current = { name, at: s.gameTime };
        setLive({
          state: name,
          dist: Math.round(Math.hypot(dx, dy)),
          elapsed: Math.round(s.gameTime - stateSince.current.at),
          hp: Math.round(e.health), maxHp: Math.round(e.maxHealth), phase: e.bossPhase ?? 1,
        });
      } else if (live !== null) {
        setLive(null);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // live を依存に入れると毎フレーム貼り直しになるので入れない(意図的)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bossType]);

  if (!live) return <div className="text-[10px] text-white/50">ボス未出現</div>;
  return (
    <div className="font-mono text-[11px] leading-tight text-white/90">
      <div className="text-emerald-300">{live.state}</div>
      <div>
        <span className="text-white/50">距離 </span>{live.dist}px
        <span className="text-white/50"> / 経過 </span>{live.elapsed}ms
      </div>
      <div>
        <span className="text-white/50">HP </span>{live.hp}/{live.maxHp}
        <span className="text-white/50"> / P</span>{live.phase}
      </div>
    </div>
  );
};
