import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { hasEquipIcon, equipIconName } from '../data/equipment';
import { spritePath } from '../utils/spriteLoader';

// コンパクトなバイタル表示: HP は「数字主体の球体(オーブ)」、その外周を EXP の白いリングが一周。
// 一周溜まる=レベルアップ。被弾した瞬間はオーブを点滅+パンチさせて分かりやすくする。
//
// 再描画規律: player 丸ごとではなく必要な数値だけを個別購読(HP/EXP は被弾・取得イベントでのみ変化)。
const SIZE = 76;          // 全体の一辺(px)
const STROKE = 5;         // EXPリングの太さ
const RING_R = (SIZE - STROKE) / 2 - 1;       // EXPリング半径
const RING_C = 2 * Math.PI * RING_R;          // 円周
const ORB_R = RING_R - STROKE - 2;            // 内側オーブ半径
const CX = SIZE / 2;
const CY = SIZE / 2;

const VitalsOrb: React.FC = () => {
  const health = useGameStore(s => s.player.health);
  const maxHealth = useGameStore(s => s.player.maxHealth);
  const experience = useGameStore(s => s.player.experience);
  const expToNext = useGameStore(s => s.player.experienceToNextLevel);
  const level = useGameStore(s => s.player.level);
  // 装備(部位ごとに個別購読=装備変更時のみ再描画)。アイコンがある装備だけ表示。
  const equipBody = useGameStore(s => s.player.equipment.body);
  const equipArms = useGameStore(s => s.player.equipment.arms);
  const equipAccessory = useGameStore(s => s.player.equipment.accessory);
  const equipIcons = [equipBody, equipArms, equipAccessory]
    .filter((id): id is string => hasEquipIcon(id))
    .map(id => ({ id, src: spritePath(equipIconName(id)) }));

  // 被弾検知: HP が下がった瞬間にアニメをキー変更で再生。
  const prevHealth = useRef(health);
  const [hitKey, setHitKey] = useState(0);
  useEffect(() => {
    if (health < prevHealth.current - 0.01) setHitKey(k => k + 1);
    prevHealth.current = health;
  }, [health]);

  const hpFrac = maxHealth > 0 ? Math.max(0, Math.min(1, health / maxHealth)) : 0;
  const expFrac = expToNext > 0 ? Math.max(0, Math.min(1, experience / expToNext)) : 0;

  // 液面(下から hpFrac ぶん満ちる)。clip 内の矩形の上端 y。
  const fillTopY = CY + ORB_R - 2 * ORB_R * hpFrac;
  // HP低下で色を赤→暗赤へ(全体に赤寄り。危険ほど暗い赤)。
  const hpHi = hpFrac > 0.5 ? '#ef4444' : hpFrac > 0.25 ? '#dc2626' : '#b91c1c';
  const hpLo = hpFrac > 0.25 ? '#7f1d1d' : '#641414';

  // EXP リングの描画(上=12時から時計回り)。
  const dash = `${RING_C * expFrac} ${RING_C}`;

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
      {/* 被弾パンチ: key 変更で都度アニメ再生。中身全体を軽くスケール。 */}
      <div key={hitKey} className={hitKey ? 'hud-orb-hit' : undefined} style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <defs>
            <clipPath id="orbClip">
              <circle cx={CX} cy={CY} r={ORB_R} />
            </clipPath>
            <linearGradient id="hpFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={hpHi} />
              <stop offset="100%" stopColor={hpLo} />
            </linearGradient>
          </defs>

          {/* オーブ土台(暗い球) */}
          <circle cx={CX} cy={CY} r={ORB_R} fill="rgba(10,10,16,0.78)" />
          {/* HP 液面(下から満ちる) */}
          <g clipPath="url(#orbClip)">
            <rect
              x={CX - ORB_R}
              y={fillTopY}
              width={ORB_R * 2}
              height={Math.max(0, CY + ORB_R - fillTopY)}
              fill="url(#hpFill)"
              style={{ transition: 'y 280ms ease-out, height 280ms ease-out' }}
            />
            {/* 液面のハイライト線 */}
            {hpFrac > 0.02 && hpFrac < 0.99 && (
              <rect x={CX - ORB_R} y={fillTopY} width={ORB_R * 2} height={2} fill="rgba(255,255,255,0.35)" />
            )}
          </g>
          {/* ガラスの艶 */}
          <ellipse cx={CX} cy={CY - ORB_R * 0.42} rx={ORB_R * 0.6} ry={ORB_R * 0.32} fill="rgba(255,255,255,0.12)" />
          {/* オーブ縁(トンマナ統一で紫寄り) */}
          <circle cx={CX} cy={CY} r={ORB_R} fill="none" stroke="rgba(192,132,252,0.4)" strokeWidth={1.5} />

          {/* EXP リング: トラック + 進捗(白) */}
          <g transform={`rotate(-90 ${CX} ${CY})`}>
            <circle cx={CX} cy={CY} r={RING_R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={STROKE} />
            <circle
              cx={CX}
              cy={CY}
              r={RING_R}
              fill="none"
              stroke="#ffffff"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={dash}
              style={{ transition: 'stroke-dasharray 280ms ease-out', filter: 'drop-shadow(0 0 2px rgba(255,255,255,0.6))' }}
            />
          </g>

          {/* HP 数字(主役) */}
          <text
            x={CX}
            y={CY + 1}
            textAnchor="middle"
            dominantBaseline="central"
            fontWeight="800"
            fontSize={ORB_R * 0.78}
            fill="#ffffff"
            style={{ fontVariantNumeric: 'tabular-nums', paintOrder: 'stroke', stroke: 'rgba(2,6,23,0.85)', strokeWidth: 3 }}
          >
            {Math.max(0, Math.ceil(health))}
          </text>
        </svg>

        {/* 被弾フラッシュ(白い円が一瞬光ってフェード)。key で都度再生。 */}
        {hitKey > 0 && (
          <span
            key={`flash-${hitKey}`}
            className="hud-orb-flash"
            style={{
              position: 'absolute',
              left: CX - ORB_R,
              top: CY - ORB_R,
              width: ORB_R * 2,
              height: ORB_R * 2,
              borderRadius: '9999px',
              background: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,120,120,0.5) 60%, transparent 72%)',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>

      {/* レベル(オーブ下の小バッジ): 半透明の背景・1行固定(折り返さない) */}
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] font-bold leading-none whitespace-nowrap"
        style={{ bottom: -8, backgroundColor: 'rgba(13,10,20,0.6)', border: '1px solid rgba(168,85,247,0.4)' }}
      >
        Lv {level}
      </div>
      </div>

      {/* 装備アイコン(HP右隣)。アイコンを持つ装備のみ縦に並べる。 */}
      {equipIcons.length > 0 && (
        <div className="flex flex-col gap-1">
          {equipIcons.map(ic => (
            <img
              key={ic.id}
              src={ic.src}
              alt=""
              draggable={false}
              className="w-6 h-6 rounded-md hud-translucent p-0.5 object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default VitalsOrb;
