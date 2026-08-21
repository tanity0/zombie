import React from 'react';
import { useGameStore } from '../store/gameStore';
import { isBossType } from '../utils/enemyUtils';

// v0.25.3728(社長GO「バロメーターライン入れて」): 戦況ライン=1本の細いラインに意味の層を重ねる。
//  層1: 色+脈動 = ディレクターのコマ(リラックス青緑・静止/ハーベスト金・ゆらぎ/通常 白・弱明滅/
//        ピーク赤・速い脈動+少し太く)
//  層2: 満ち幅 = ランク1〜7(左→右へ満ちる。下地に7つの刻み。ランク変化の瞬間はフラッシュ)
//  層3: 上書き = 紅き夜=紫に染まる / ボス戦中=両端に金の縁
// 再レンダー規律: hudDirector はdirectorTickが**変化時のみ**書くミラー(コマ=約40秒に1回・ランク変化時)。
// ボス有無は boolean 派生値の購読(変わった時だけ再描画)。脈動はCSSアニメ=JSの毎フレーム処理なし。
const KOMA_STYLE: Record<string, { color: string; dur: string; label: string }> = {
  relax:   { color: '#2dd4bf', dur: '0s',    label: 'RELAX' },   // 青緑・静止
  harvest: { color: '#fbbf24', dur: '2.6s',  label: 'HARVEST' }, // 金・ゆっくり
  normal:  { color: '#e5e7eb', dur: '1.8s',  label: 'NORMAL' },  // 白・弱い明滅
  peak:    { color: '#ef4444', dur: '0.55s', label: 'PEAK' },    // 赤・速い脈動
};

const DirectorLine: React.FC = () => {
  const hud = useGameStore(s => s.hudDirector);
  const redNight = useGameStore(s => s.redNight?.phase === 'active');
  const bossBattle = useGameStore(s => s.enemies.some(e => isBossType(e.type)));
  const st = KOMA_STYLE[hud.koma] ?? KOMA_STYLE.relax;
  const color = redNight ? '#a855f7' : st.color; // 紅き夜=紫が色の文法ごと乗っ取る
  const peak = hud.koma === 'peak';
  const fillPct = Math.max(0, Math.min(1, hud.rank / 7)) * 100;
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2"
      style={{ top: 'calc(max(env(safe-area-inset-top), 8px) + 30px)', width: 72 }}
    >
      <style>{`@keyframes dlPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
@keyframes dlRankFlash { 0% { filter: brightness(2.6); } 100% { filter: brightness(1); } }`}</style>
      <div
        className="relative overflow-hidden rounded-full"
        style={{
          height: peak ? 5 : 4,
          background: 'rgba(255,255,255,0.13)',
          // 下地の刻み7つ(=ランクの段)。satisfies: 正確に読みたい人向け・遠目にはただの質感。
          backgroundImage: 'repeating-linear-gradient(90deg, transparent 0, transparent calc(100%/7 - 1px), rgba(255,255,255,0.22) calc(100%/7 - 1px), rgba(255,255,255,0.22) calc(100%/7))',
          // ボス戦中=両端に金の縁(層3)。
          boxShadow: bossBattle ? '0 0 0 1px rgba(251,191,36,0.55)' : 'none',
          transition: 'height 300ms ease',
        }}
      >
        <div
          key={hud.rank} // ランク変化の瞬間に dlRankFlash が1回走る(keyで再マウント)
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${fillPct}%`,
            background: color,
            animation: `dlRankFlash 500ms ease-out 1${st.dur !== '0s' ? `, dlPulse ${st.dur} ease-in-out infinite` : ''}`,
            boxShadow: peak ? `0 0 6px ${color}` : 'none',
            transition: 'width 400ms ease, background 500ms ease',
          }}
        />
      </div>
    </div>
  );
};

export default DirectorLine;
