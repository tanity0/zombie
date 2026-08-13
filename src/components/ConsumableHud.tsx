import React from 'react';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';
import { CONSUMABLES } from '../data/consumables';
import type { ConsumableKey } from '../types/game';

// SKILL_BUILD_REDESIGN.md §23-2条件5: 消費カード発動中は「占有中の枠に残秒表示」。ラン中ずっと
// 見える場所が無いため、この小さな専用HUDを新設する(StatsHud.tsxと同じ「頻繁に変わる表示は
// 本体から分離する」パターン)。
// React再描画規律: player丸ごとではなく5つのUntilフィールドだけをshallowで購読する。秒表示の更新は
// Math.floor(gameTime/1000)という別の派生プリミティブで駆動する(1秒に1回だけ再描画)。
const UNTIL_KEYS: { key: ConsumableKey; field: 'consumableScrapUntil' | 'consumableAttackUntil' | 'consumableSpeedUntil' | 'consumableXpUntil' | 'consumableProtectionUntil' }[] = [
  { key: 'scrap-boost', field: 'consumableScrapUntil' },
  { key: 'attack-doping', field: 'consumableAttackUntil' },
  { key: 'speed-boost', field: 'consumableSpeedUntil' },
  { key: 'xp-boost', field: 'consumableXpUntil' },
  { key: 'protection', field: 'consumableProtectionUntil' },
];

const ConsumableHud: React.FC = () => {
  const untils = useGameStore(s => ({
    consumableScrapUntil: s.player.consumableScrapUntil,
    consumableAttackUntil: s.player.consumableAttackUntil,
    consumableSpeedUntil: s.player.consumableSpeedUntil,
    consumableXpUntil: s.player.consumableXpUntil,
    consumableProtectionUntil: s.player.consumableProtectionUntil,
  }), shallow);
  const secondsNow = useGameStore(s => Math.floor(s.gameTime / 1000));

  const active = UNTIL_KEYS
    .map(({ key, field }) => ({ key, remaining: Math.ceil((untils[field] - secondsNow * 1000) / 1000) }))
    .filter(a => a.remaining > 0);
  if (active.length === 0) return null;

  return (
    <div
      className="absolute flex flex-col gap-1"
      style={{
        left: 'max(env(safe-area-inset-left), 12px)',
        top: 'calc(max(env(safe-area-inset-top), 8px) + 116px)',
      }}
    >
      {active.map(a => (
        <div
          key={a.key}
          className="hud-translucent rounded-2xl px-2.5 py-1 text-[11px] leading-tight text-amber-100 whitespace-nowrap"
        >
          ⏱️ {CONSUMABLES[a.key].name} {a.remaining}s
        </div>
      ))}
    </div>
  );
};

export default ConsumableHud;
