import React from 'react';
import { useGameStore } from '../store/gameStore';
import { brawlerPointCap } from '../utils/brawler';
import { isBloodAwakening } from '../utils/bloodAwaken';

// ★サブウェポン「格闘」の技ポイント(research/BRAWLER.md §2-5)。近接枠の右下に `7/10`。
// 社長指示2026-11-08「格闘ポイントの数字を弾数とかと同じに揃えて」: 位置・大きさ・書式・色を銃の弾数バッジ
// (GameHUD の銃枠の `{mag}/{予備}`)と同じにした(旧: 札の地+技の値段で5段の色)。
// 血の覚醒中は技ポイントを使わない(使い放題)=銃の無限弾と同じく分母を「∞」。
// 購読は数値と真偽値だけ=毎フレーム描き直さない(CLAUDE.md の再描画の規律・§8-2)。
// ポイント不足の技は数字が震えて一瞬暗く沈み、弾を拾う・カウンターで増えた時は一瞬明るく跳ねる(index.css の brawler-deny / brawler-gain)。
const BrawlerPointsBadge: React.FC = () => {
  const rawPoints = useGameStore(s => s.player.brawler?.points ?? 0);
  const cap = useGameStore(s => brawlerPointCap(s.player.subWeaponLevels['brawler'] ?? 1));
  const denyAt = useGameStore(s => s.player.brawler?.denyAt ?? 0);
  const gainAt = useGameStore(s => s.player.brawler?.gainAt ?? 0);
  const awakened = useGameStore(s => isBloodAwakening(s.player, s.gameTime));
  const points = Math.min(rawPoints, cap); // 上限を超えて出さない
  // 新しい方の合図だけを流す(key が変わると animation が頭から再生される)。
  const anim = denyAt >= gainAt
    ? (denyAt > 0 ? 'brawler-deny 300ms cubic-bezier(.2,.9,.3,1)' : undefined)
    : 'brawler-gain 280ms cubic-bezier(.2,.9,.3,1)';
  return (
    <span
      key={`${denyAt}-${gainAt}`}
      className="absolute bottom-0 right-0.5 text-[9px] font-bold tabular-nums leading-none gt-solid text-white"
      style={{ animation: anim }}
    >
      {points}<span className="text-[7px] text-white/45">/{awakened ? '∞' : cap}</span>
    </span>
  );
};

export default BrawlerPointsBadge;
