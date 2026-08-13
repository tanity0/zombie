import React from 'react';
import { useGameStore } from '../store/gameStore';
import { portraitSrcFor } from '../data/portraits';
import { berserkerFrameLight, OVERCLOCK_LIGHT_MS } from '../utils/frameLight';

// 枠光(SKILL_BUILD_REDESIGN.md §12-2#11・社長意図「枠線=プレイヤーの立ち絵」):
// ゲーム中HUDに小さな立ち絵チップを置き、その枠を光らせる。
// - バーサーカー(金): HP70%未満で点灯・強度は失HP比例(判定はframeLight.tsの純関数)。
// - オーバークロック(青): proc(player.overclockLightUntil更新)から800msのCSSアニメ1発。
//   gameTimeを購読すると毎フレーム再描画になるため、値の更新をキーにした実時間アニメで代用
//   (ポーズ跨ぎで最大800msズレうるが視覚のみ・叩き台)。
// 再描画規律: 購読は全てプリミティブ(class/HP/max/until/boolean)。毎フレーム値は購読しない。
const CHIP = 56; // 立ち絵チップの一辺(px)。VitalsOrb(76px)の隣に置く前提の叩き台。

const PlayerPortraitFrame: React.FC = () => {
  const characterClass = useGameStore(s => s.player.characterClass);
  const health = useGameStore(s => s.player.health);
  const maxHealth = useGameStore(s => s.player.maxHealth);
  const hasBerserker = useGameStore(s => s.runBuild.includes('berserker'));
  const hasOverclock = useGameStore(s => s.runBuild.includes('overclock'));
  const overclockLightUntil = useGameStore(s => s.player.overclockLightUntil);

  const gold = berserkerFrameLight(hasBerserker, health, maxHealth);
  // proc毎にkeyが変わる=アニメが1発再生される。0(未proc)は再生しない。
  const overclockKey = hasOverclock ? overclockLightUntil : 0;

  const goldShadow = gold.lit
    ? `0 0 ${4 + 10 * gold.intensity}px ${1 + 3 * gold.intensity}px rgba(251,191,36,${0.35 + 0.55 * gold.intensity})`
    : 'none';

  return (
    <div
      style={{
        width: CHIP,
        height: CHIP,
        borderRadius: 10,
        overflow: 'hidden',
        position: 'relative',
        border: gold.lit ? '2px solid rgba(251,191,36,0.9)' : '2px solid rgba(255,255,255,0.28)',
        boxShadow: goldShadow,
        background: 'rgba(0,0,0,0.35)',
      }}
    >
      <img
        src={portraitSrcFor(characterClass)}
        alt=""
        draggable={false}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'top', // 全身立ち絵から顔まわりを見せる
        }}
      />
      {overclockKey > 0 && (
        <div
          key={overclockKey}
          style={{
            position: 'absolute',
            inset: -2,
            borderRadius: 10,
            border: '2px solid rgba(96,165,250,0.95)',
            boxShadow: '0 0 12px 3px rgba(96,165,250,0.75)',
            pointerEvents: 'none',
            animation: `portrait-frame-overclock ${OVERCLOCK_LIGHT_MS}ms ease-out forwards`,
          }}
        />
      )}
      <style>{`
        @keyframes portrait-frame-overclock {
          0% { opacity: 1; }
          70% { opacity: 0.9; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default PlayerPortraitFrame;
