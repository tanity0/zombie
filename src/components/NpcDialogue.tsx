import { useGameStore } from '../store/gameStore';
import { spritePath } from '../utils/spriteLoader';

// 話者名 → 立ち絵のベースパス(spritePathの`${base}-0`)+枠幅。セリフ表示時に上半身(バスト)を出す。
// 社長ルール(v0.25.1849): **このゲームの通信は基本的に全てモデル入り**(モデルが大きい場合は半身)。
// 新しい通信話者を足す時はここに立ち絵を必ず登録する。boxW=表示幅(横に広い素材は文字被り防止で広げる)。
// 護衛軍人はpixiSceneのESCORT_SPRITE_BASEと同じ対応(index 0..7)。
const NPC_PORTRAIT: Record<string, { base: string; boxW: number }> = {
  'エドガー': { base: 'npc/edgar', boxW: 40 },
  'ジョセフ': { base: 'npc/joseph', boxW: 40 },
  'エリザベス': { base: 'npc/elizabeth', boxW: 40 },
  '武蔵': { base: 'npc/musashi', boxW: 40 },
  'ムハンマド': { base: 'npc/muhammad', boxW: 40 },
  'チェン': { base: 'npc/chen', boxW: 40 },
  'ローレン': { base: 'npc/lauren', boxW: 40 },
  'フェイザー': { base: 'npc/phaser', boxW: 40 },
  // 二人組(クエストNPC)。話者名=社長命名(v0.25.1719): グレン(男)/ミラ(女) → 専用バストアップ
  // (社長素材v0.25.1716・sprites/npc/futari-*-0.png=頭〜胸の切り出し)。肩まで入る=枠広め(v0.25.1719)。
  'グレン': { base: 'npc/futari-man', boxW: 62 },
  'ミラ': { base: 'npc/futari-woman', boxW: 62 },
  // チュートリアル随行(社長指示v0.25.1849「グレッグたちの通信にもモデル表示」):
  // グレッグ=軍人(レスキューのヘルメット兵=rescue/shooter・92x120=縦長) / ジュン=衛生兵
  // (npc/medic-walk 78x64=横長のためboxW広め)。
  'グレッグ': { base: 'rescue/shooter', boxW: 40 },
  'ジュン': { base: 'npc/medic-walk', boxW: 72 },
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
  const portrait = NPC_PORTRAIT[npc.name];
  const portraitBase = portrait?.base;
  const portraitBoxW = portrait?.boxW ?? 40;
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
          <div className="relative self-stretch shrink-0" style={{ width: portraitBoxW }}>
            <img
              src={spritePath(`${portraitBase}-0`)}
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
