import { useGameStore } from '../store/gameStore';

// NPCリアルタイムセリフのHUD表示(時間停止なし・軽量)。表示位置はアテンションバナーと同じ左上ゾーンで、
// 優先度は「コンボ > アテンション > NPCセリフ」。コンボ/バナーの有無に応じて下へずらして重ならないようにする。
// 毎フレーム再描画しないよう、狭いセレクタ(派生プリミティブ)で購読する。
export const NpcDialogue = () => {
  const npc = useGameStore(s => s.npcDialogue);
  const comboActive = useGameStore(s => s.meleeFinishComboCount >= 2 && s.meleeFinishComboUntil >= s.gameTime);
  const bannerActive = useGameStore(s => !!s.eventBannerText && s.eventBannerUntil >= s.gameTime);
  if (!npc) return null;
  const topPx = 132 + (comboActive ? 58 : 0) + (bannerActive ? 58 : 0);
  return (
    <div
      className="absolute text-left"
      style={{
        top: `calc(max(env(safe-area-inset-top), 8px) + ${topPx}px)`,
        left: 'max(env(safe-area-inset-left), 18px)',
        transition: 'top 0.25s ease',
        maxWidth: 'min(52vw, 230px)',
      }}
    >
      <div
        className="glass-pill px-3 py-1 text-[13px] leading-snug"
        style={{ border: '1px solid rgba(251,191,36,0.45)', textShadow: '0 1px 0 rgba(0,0,0,0.9)', whiteSpace: 'normal', wordBreak: 'break-word' }}
      >
        <span className="font-bold text-amber-300/95 mr-1.5">{npc.name}</span>
        <span className="text-white/90">{npc.text}</span>
      </div>
    </div>
  );
};
