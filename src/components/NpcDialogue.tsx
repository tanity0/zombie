import { useGameStore } from '../store/gameStore';
import { spritePath } from '../utils/spriteLoader';

// 進軍NPC(護衛軍人)の名前 → ユニーク立ち絵のベース名。セリフ表示時に上半身(バスト)を出すのに使う。
// pixiScene の ESCORT_SPRITE_BASE と同じ対応(index 0..7 = エドガー/ジョセフ/エリザベス/武蔵/
// ムハンマド/チェン/ローレン/フェイザー)。
const NPC_PORTRAIT_BASE: Record<string, string> = {
  'エドガー': 'edgar',
  'ジョセフ': 'joseph',
  'エリザベス': 'elizabeth',
  '武蔵': 'musashi',
  'ムハンマド': 'muhammad',
  'チェン': 'chen',
  'ローレン': 'lauren',
  'フェイザー': 'phaser',
};

// NPCリアルタイムセリフのHUD表示(時間停止なし・軽量)。表示位置はアテンションバナーと同じ左上ゾーンで、
// 優先度は「コンボ > アテンション > NPCセリフ」。コンボ/バナーの有無に応じて下へずらして重ならないようにする。
// 毎フレーム再描画しないよう、狭いセレクタ(派生プリミティブ)で購読する。
export const NpcDialogue = () => {
  const npc = useGameStore(s => s.npcDialogue);
  const comboActive = useGameStore(s => s.meleeFinishComboCount >= 2 && s.meleeFinishComboUntil >= s.gameTime);
  const bannerActive = useGameStore(s => !!s.eventBannerText && s.eventBannerUntil >= s.gameTime);
  if (!npc) return null;
  const topPx = 132 + (comboActive ? 58 : 0) + (bannerActive ? 58 : 0);
  // 話者の立ち絵(あれば)。上半身だけ見せるため、立ち絵を高さ基準で拡大し枠で上部だけ切り出す。
  const portraitBase = NPC_PORTRAIT_BASE[npc.name];
  return (
    <div
      className="absolute text-left flex items-end gap-2"
      style={{
        top: `calc(max(env(safe-area-inset-top), 8px) + ${topPx}px)`,
        left: 'max(env(safe-area-inset-left), 18px)',
        transition: 'top 0.25s ease',
        maxWidth: 'min(64vw, 286px)',
      }}
    >
      {portraitBase && (
        // 上半身(バスト): 立ち絵を高さ96pxへ拡大して横中央寄せ、枠(56×52)で上部だけ切り出す=頭〜胴。
        <div
          style={{
            position: 'relative',
            width: 56,
            height: 52,
            flex: '0 0 auto',
            overflow: 'hidden',
            borderRadius: 10,
            border: '1px solid rgba(251,191,36,0.5)',
            background: 'linear-gradient(180deg, rgba(20,24,36,0.6), rgba(8,10,18,0.6))',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        >
          <img
            src={spritePath(`npc/${portraitBase}-0`)}
            alt={npc.name}
            draggable={false}
            style={{
              position: 'absolute',
              top: 2,
              left: '50%',
              transform: 'translateX(-50%)',
              height: 96,
              width: 'auto',
              maxWidth: 'none', // Tailwind preflight の img{max-width:100%} が width を枠(56px)へ詰めて縦伸びするのを回避
              imageRendering: 'pixelated',
            }}
          />
        </div>
      )}
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
