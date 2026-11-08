import React from 'react';
import { useGameStore } from '../store/gameStore';
import { brawlerPointCap, BRAWLER_TECHS } from '../utils/brawler';
import { isBloodAwakening } from '../utils/bloodAwaken';

// ★サブウェポン「格闘」の技ポイント(research/BRAWLER.md §2-5)。近接枠の右下に `7/10` の形(銃の弾数と同じ位置・同じ書式)。
// 購読は数値だけ(ポイント・上限・出なかった時刻)=毎フレーム描き直さない(CLAUDE.md の再描画の規律・§8-2)。
// 数字はアイコンの線と重ならないよう枠の右下の外へ少し出した札に置く(クリエイティブ監査 #17)。
// 色は5段: 0=使えない(薄い) / 1=飛び蹴り(白) / 2=気功(橙) / 3〜4=上の構え(淡い白金) / 5以上=下の踏み込みまで(白金に光る+縁)。
// 段の境は技の値段から引く(上=3・社長指示2026-11-07)。赤・紫・会心の金は使わない。
// ポイント不足の技は数字が震えて一瞬暗く沈む(社長決定 #8・#18)。弾を拾って増えた時は一瞬明るく跳ねる(社長指示2026-11-07)。
const TIER_STYLE: readonly { color: string; glow?: string; ring?: string }[] = [
  { color: 'rgba(255,255,255,0.45)' },
  { color: '#f5f5f4' },
  { color: '#fdba74' },
  { color: '#fff1dc', glow: '0 0 3px rgba(241,230,200,0.7)' },
  { color: '#fffaf0', glow: '0 0 5px rgba(241,230,200,0.95), 0 0 2px #fff', ring: '0 0 0 1px rgba(241,230,200,0.7)' },
];
const BrawlerPointsBadge: React.FC = () => {
  const rawPoints = useGameStore(s => s.player.brawler?.points ?? 0);
  const cap = useGameStore(s => brawlerPointCap(s.player.subWeaponLevels['brawler'] ?? 1));
  const denyAt = useGameStore(s => s.player.brawler?.denyAt ?? 0);
  const gainAt = useGameStore(s => s.player.brawler?.gainAt ?? 0);
  // 血の覚醒中は技ポイントを使わない=数字の代わりに「∞」を最上段の色で出す(社長指示2026-11-08「覚醒中は技ポイント無視して使い放題」)。購読は真偽値だけ。
  const awakened = useGameStore(s => isBloodAwakening(s.player, s.gameTime));
  const points = Math.min(rawPoints, cap); // 上限を超えて出さない
  const T = BRAWLER_TECHS;
  const tier = awakened ? 4 : points >= T.stomp.cost ? 4 : points >= T.guard.cost ? 3 : points >= T.kiko.cost ? 2 : points >= T.kick.cost ? 1 : 0;
  const st = TIER_STYLE[tier];
  // 新しい方の合図だけを流す(key が変わると animation が頭から再生される)。
  const anim = denyAt >= gainAt
    ? (denyAt > 0 ? 'brawler-deny 300ms cubic-bezier(.2,.9,.3,1)' : undefined)
    : 'brawler-gain 280ms cubic-bezier(.2,.9,.3,1)';
  return (
    <span
      key={`${denyAt}-${gainAt}`}
      className="absolute -bottom-1.5 -right-1.5 px-1 py-px bg-black/75 text-[12px] font-bold tabular-nums leading-none gt-solid"
      style={{
        color: st.color,
        textShadow: st.glow,
        boxShadow: st.ring,
        animation: anim,
      }}
    >
      {awakened ? '∞' : <>{points}<span className="text-[9px] text-white/50">/{cap}</span></>}
    </span>
  );
};

export default BrawlerPointsBadge;
