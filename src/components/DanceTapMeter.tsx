import React from 'react';
import { useGameStore } from '../store/gameStore';
import { DEV_TOOLS_ENABLED } from '../config/devtools';

// テスト用: ダンス中の実タップの「最寄り拍からの符号付きズレ(ms)」を画面右下から上へログ表示し、
// 平均も出す。負=拍より早い / 正=遅い。値が時間とともに一方向へ増えるなら曲⇔グリッドの
// 累積テンポずれ、ほぼ一定なら出力レイテンシ等の固定オフセット、と切り分けられる。
// 再描画はタップ時のみ(active=bool / danceTapLog=配列refはタップでしか変わらない)。
const DanceTapMeter: React.FC = () => {
  const active = useGameStore(s => s.rhythm.active);
  const log = useGameStore(s => s.danceTapLog);
  if (!DEV_TOOLS_ENABLED || !active || log.length === 0) return null;

  const recent = log.slice(-14);
  const avg = log.reduce((a, b) => a + b, 0) / log.length;
  const absAvg = log.reduce((a, b) => a + Math.abs(b), 0) / log.length;
  // 直近の傾き(累積ドリフトの指標): 後半平均 - 前半平均。
  const half = Math.floor(log.length / 2);
  const trend = log.length >= 6
    ? (log.slice(half).reduce((a, b) => a + b, 0) / (log.length - half)) - (log.slice(0, half).reduce((a, b) => a + b, 0) / half)
    : 0;
  const fmt = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(0);
  const col = (v: number) => (Math.abs(v) <= 40 ? '#4ade80' : Math.abs(v) <= 90 ? '#fbbf24' : '#f87171');

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
      {recent.map((v, i) => (
        <div key={log.length - recent.length + i} style={{ color: col(v), opacity: 0.35 + 0.65 * ((i + 1) / recent.length) }}>
          {fmt(v)}ms
        </div>
      ))}
      <div style={{ marginTop: 3, color: '#e2e8f0', fontWeight: 700 }}>avg {fmt(avg)}ms</div>
      <div style={{ color: '#94a3b8' }}>|avg| {absAvg.toFixed(0)} / n {log.length}</div>
      <div style={{ color: col(trend) }}>drift {fmt(trend)}ms</div>
    </div>
  );
};

export default DanceTapMeter;
