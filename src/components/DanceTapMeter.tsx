import React from 'react';
import { useGameStore } from '../store/gameStore';
import { DEV_TOOLS_ENABLED } from '../config/devtools';

// テスト用: ダンス中の「連続タップの間隔(ms)」を画面右下から上へ表示し、平均も出す。
// Lv1で正しく拍を刻めば各間隔は ~600ms になる(= 人間で測った実テンポ)。
// 期待間隔(rhythm.interval)に近いほど緑。平均は飛ばし(>1.5倍=拍抜け)を除いて算出。
const DanceTapMeter: React.FC = () => {
  const active = useGameStore(s => s.rhythm.active);
  const danceTest = useGameStore(s => s.danceTestMode);  // ダンス練習(テスト)モードか
  const interval = useGameStore(s => s.rhythm.interval); // 期待間隔(Lv1=600)
  const times = useGameStore(s => s.danceTapLog);        // タップ絶対時刻
  // 拍数計測はダンス練習モード専用。通常プレイ(四神舞でrhythm.active)では出さない。
  if (!DEV_TOOLS_ENABLED || !danceTest || !active || times.length < 2) return null;

  const deltas: number[] = [];
  for (let i = 1; i < times.length; i++) deltas.push(times[i] - times[i - 1]);
  const recent = deltas.slice(-14);
  // 平均は拍抜け(期待の1.5倍超)を除外して算出。
  const clean = interval > 0 ? deltas.filter(d => d <= interval * 1.5) : deltas;
  const avg = clean.length ? clean.reduce((a, b) => a + b, 0) / clean.length : 0;
  const col = (d: number) => {
    if (interval <= 0) return '#e2e8f0';
    const e = Math.abs(d - interval);
    return e <= 25 ? '#4ade80' : e <= 60 ? '#fbbf24' : '#f87171';
  };

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
      {recent.map((d, i) => (
        <div key={times.length - recent.length + i} style={{ color: col(d), opacity: 0.35 + 0.65 * ((i + 1) / recent.length) }}>
          {d.toFixed(0)}ms
        </div>
      ))}
      <div style={{ marginTop: 3, color: '#e2e8f0', fontWeight: 700 }}>
        avg {avg.toFixed(0)}ms{interval > 0 ? ` / 期待${interval.toFixed(0)}` : ''}
      </div>
    </div>
  );
};

export default DanceTapMeter;
