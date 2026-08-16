import React from 'react';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';
import { CONSUMABLES } from '../data/consumables';
import { SKILLS, skillIcon } from '../data/campaign';
// v0.25.3499: 社長支給の1枚シートが入っていればドット絵アイコン、無ければ従来の絵文字。
import { useSkillIconSheet } from '../utils/useSkillIconSheet';
import { skillIconStyle, hasSkillIcon, skillSingleIconName } from '../data/skillIcons';
import { spritePath } from '../utils/spriteLoader';
import type { ConsumableKey } from '../types/game';

// 社長指示v0.25.3298: ①装備中のランスキルを**左下**にアイコンで表示 ②強化バフ中は**その上の段**に
// バフアイコンを表示。旧ConsumableHud(右上のテキストピル)はこの上段に統合して置き換え。
// アイコンは絵文字プレースホルダ(campaign.tsのSKILL_ICON台帳=選択画面と共有。画像は確定後に差し替え検討)。
//
// React再描画規律: runBuildは取得時にしか参照が変わらない小配列。Lvは派生プリミティブ(join文字列)で購読。
// バフ残秒は Math.floor(gameTime/1000) 駆動=1秒に1回だけ再描画(旧ConsumableHudと同じ)。

const RARITY_RING: Record<'normal' | 'rare' | 'super', string> = {
  normal: 'border-slate-400/60',
  rare: 'border-purple-400/70',
  super: 'border-amber-300/80',
};

const CONSUMABLE_ICON: Record<ConsumableKey, string> = {
  'scrap-boost': '🔩',
  'attack-doping': '💥',
  'speed-boost': '👟',
  'xp-boost': '📈',
  protection: '🛡️',
};

const UNTIL_KEYS: { key: ConsumableKey; field: 'consumableScrapUntil' | 'consumableAttackUntil' | 'consumableSpeedUntil' | 'consumableXpUntil' | 'consumableProtectionUntil' }[] = [
  { key: 'scrap-boost', field: 'consumableScrapUntil' },
  { key: 'attack-doping', field: 'consumableAttackUntil' },
  { key: 'speed-boost', field: 'consumableSpeedUntil' },
  { key: 'xp-boost', field: 'consumableXpUntil' },
  { key: 'protection', field: 'consumableProtectionUntil' },
];

const RunHud: React.FC = () => {
  const skillSheet = useSkillIconSheet(); // v0.25.3499: 素材が無ければ null=絵文字のまま
  const runBuild = useGameStore(s => s.runBuild);
  // Lvの派生プリミティブ(取得/Lvアップ時にだけ変わる文字列)。
  const levelsKey = useGameStore(s => s.runBuild.map(k => s.player.skillLevels?.[k] ?? 1).join(','));
  const untils = useGameStore(s => ({
    consumableScrapUntil: s.player.consumableScrapUntil,
    consumableAttackUntil: s.player.consumableAttackUntil,
    consumableSpeedUntil: s.player.consumableSpeedUntil,
    consumableXpUntil: s.player.consumableXpUntil,
    consumableProtectionUntil: s.player.consumableProtectionUntil,
  }), shallow);
  const secondsNow = useGameStore(s => Math.floor(s.gameTime / 1000));

  const levels = levelsKey.length > 0 ? levelsKey.split(',').map(n => parseInt(n, 10) || 1) : [];
  const buffs = UNTIL_KEYS
    .map(({ key, field }) => ({ key, remaining: Math.ceil((untils[field] - secondsNow * 1000) / 1000) }))
    .filter(a => a.remaining > 0);

  if (runBuild.length === 0 && buffs.length === 0) return null;

  return (
    // 左下・バージョン表記(最下段の小テキスト)の上に、下段=スキル列/上段=バフ列で積む。
    <div
      className="absolute flex flex-col items-start gap-1 pointer-events-none"
      style={{
        left: 'max(env(safe-area-inset-left), 8px)',
        bottom: 'calc(max(env(safe-area-inset-bottom), 8px) + 24px)',
      }}
    >
      {buffs.length > 0 && (
        <div className="flex flex-row flex-wrap gap-1 max-w-[60vw]">
          {buffs.map(b => (
            <div
              key={b.key}
              className="hud-translucent rounded-lg px-1.5 py-0.5 text-[11px] leading-tight text-amber-100 whitespace-nowrap"
              title={CONSUMABLES[b.key].name}
            >
              {/* v0.25.3510(社長指示): スクラップブーストだけは絵文字ではなく資源アイコンを使い、
                  **外周を赤いドット枠で光らせる**(消耗品バフだと一目で分かる)。他のバフは従来どおり絵文字。 */}
              {b.key === 'scrap-boost' ? (
                <span className="inline-flex items-center gap-1 align-middle">
                  <span className="scrap-boost-frame inline-flex shrink-0">
                    <img
                      src={spritePath('scrap-icon')}
                      alt=""
                      className="w-[13px] h-[13px] object-contain block"
                      style={{ imageRendering: 'pixelated' }}
                      draggable={false}
                    />
                  </span>
                  {b.remaining}s
                </span>
              ) : (
                <>{CONSUMABLE_ICON[b.key]} {b.remaining}s</>
              )}
            </div>
          ))}
        </div>
      )}
      {runBuild.length > 0 && (
        <div className="flex flex-row flex-wrap gap-1 max-w-[60vw]">
          {runBuild.map((k, i) => (
            <div
              key={k}
              className={`relative hud-translucent rounded-lg border ${RARITY_RING[SKILLS[k].rarity]} w-6 h-6 flex items-center justify-center text-[13px] leading-none overflow-hidden`}
              title={SKILLS[k].name}
            >
              {(() => {
                // ①単体ファイルのアイコン(POI報酬3種) ②1枚シート ③絵文字、の順に優先。
                const single = skillSingleIconName(k);
                if (single) return <img src={spritePath(single)} alt="" className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />;
                const st = skillSheet && hasSkillIcon(k)
                  ? skillIconStyle(k, skillSheet.url, 22, skillSheet) : null;
                return st ? <span style={st} aria-hidden /> : skillIcon(k);
              })()}
              {(levels[i] ?? 1) > 1 && (
                <span className="absolute -top-1 -right-1 text-[8px] px-0.5 rounded bg-black/70 text-white leading-tight">
                  {levels[i]}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RunHud;
