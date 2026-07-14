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
  // 二人組(クエストNPC)。台詞(EVENT_QUEST_LINES系)の話者名=男/女 → 専用バストアップ
  // (社長素材v0.25.1716・sprites/npc/futari-*-0.png=頭〜胸の切り出し)。
  '男': 'futari-man',
  '女': 'futari-woman',
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
      className="absolute text-left"
      style={{
        top: `calc(max(env(safe-area-inset-top), 8px) + ${topPx}px)`,
        left: 'max(env(safe-area-inset-left), 18px)',
        transition: 'top 0.25s ease',
        maxWidth: 'min(66vw, 300px)',
      }}
    >
      {/* 枠なし・上半身絵と文字を同一の右フェード背景に。高さは文字に合わせ、上半身絵は上にはみ出してOK。 */}
      <div
        className="glass-pill flex items-stretch gap-1.5 py-1.5 pl-1.5 text-[13px] leading-snug"
        style={{ paddingRight: 44, overflow: 'visible', textShadow: '0 1px 0 rgba(0,0,0,0.9)' }}
      >
        {portraitBase && (
          // バストは背景の高さ(=文字)に対して背が高く、下端を背景下端に合わせて上へはみ出させる。
          <div className="relative self-stretch shrink-0" style={{ width: 40 }}>
            <img
              src={spritePath(`npc/${portraitBase}-0`)}
              alt={npc.name}
              draggable={false}
              style={{
                position: 'absolute',
                left: '50%',
                bottom: 0,
                transform: 'translateX(-50%)',
                height: 64,
                width: 'auto',
                maxWidth: 'none',
                imageRendering: 'pixelated',
              }}
            />
          </div>
        )}
        <div className="self-center" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
          <span className="font-bold text-amber-300/95 mr-1.5">{npc.name}</span>
          <span className="text-white/90">{npc.text}</span>
        </div>
      </div>
    </div>
  );
};
