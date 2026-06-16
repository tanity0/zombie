import React from 'react';
import { useGameStore } from '../store/gameStore';
import { DEV_TOOLS_ENABLED } from '../config/devtools';

// テスト用: ダンス中の実タップのズレ(ms)を画面右下から上へログ表示し平均も出す。負=早い/正=遅い。
//  a = 曲の実再生位置(currentTime)基準 = 「人間の絶対タップ」(これが本命)
//  g = ゲームのビートグリッド基準(相対・内部値)
// a がほぼ一定オフセット → 出力レイテンシ等の固定ズレ。g だけ時間で増える → グリッドが曲からドリフト(リシンク不全)。
// 再描画はタップ時のみ(active=bool / danceTapLog=配列ref はタップでしか変わらない)。
const avgOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const driftOf = (xs: number[]) => {
  if (xs.length < 6) return 0;
  const h = Math.floor(xs.length / 2);
  return avgOf(xs.slice(h)) - avgOf(xs.slice(0, h));
};
const fmt = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(0);
const col = (v: number) => (Math.abs(v) <= 40 ? '#4ade80' : Math.abs(v) <= 90 ? '#fbbf24' : '#f87171');

const DanceTapMeter: React.FC = () => {
  const active = useGameStore(s => s.rhythm.active);
  const log = useGameStore(s => s.danceTapLog);
  if (!DEV_TOOLS_ENABLED || !active || log.length === 0) return null;

  const recent = log.slice(-14);
  const audioVals = log.map(e => e.a).filter((v): v is number => v != null);
  const gridVals = log.map(e => e.g);
  const hasAudio = audioVals.length > 0;

  return (
    <div
      className="pointer-events-none absolute z-[60]"
      style={{
        right: 'max(env(safe-area-inset-right), 6px)',
        bottom: 'max(calc(env(safe-area-inset-bottom) + 70px), 88px)',
        textAlign: 'right',
        fontFamily: 'monospace',
        fontSize: 11,
        lineHeight: '14px',
        textShadow: '0 1px 2px rgba(0,0,0,0.85)',
      }}
    >
      {/* 1行=1タップ: 太字=絶対(曲基準a) / 括弧=グリッド基準g */}
      {recent.map((e, i) => {
        const av = e.a;
        return (
          <div key={log.length - recent.length + i} style={{ opacity: 0.35 + 0.65 * ((i + 1) / recent.length) }}>
            <span style={{ color: av != null ? col(av) : '#64748b', fontWeight: 700 }}>{av != null ? fmt(av) : '—'}</span>
            <span style={{ color: '#64748b' }}> ({fmt(e.g)})</span>
          </div>
        );
      })}
      <div style={{ marginTop: 3, color: '#e2e8f0', fontWeight: 700 }}>
        曲 avg {hasAudio ? fmt(avgOf(audioVals)) : '—'}ms
      </div>
      {hasAudio && (
        <div style={{ color: col(driftOf(audioVals)) }}>
          曲 drift {fmt(driftOf(audioVals))} / n {audioVals.length}
        </div>
      )}
      <div style={{ color: '#64748b' }}>
        grid avg {fmt(avgOf(gridVals))} / drift {fmt(driftOf(gridVals))}
      </div>
    </div>
  );
};

export default DanceTapMeter;
