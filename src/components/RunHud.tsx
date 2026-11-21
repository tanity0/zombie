import React, { useEffect, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';
import { CONSUMABLES } from '../data/consumables';
import { SKILLS, skillIcon } from '../data/campaign';
// v0.25.3499: 社長支給の1枚シートが入っていればドット絵アイコン、無ければ従来の絵文字。
import { useSkillIconSheet } from '../utils/useSkillIconSheet';
import { skillIconStyle, hasSkillIcon, skillSingleIconName } from '../data/skillIcons';
import { spritePath } from '../utils/spriteLoader';
import { runSkillDisplayCap, skillLevelTone, type SkillLevelTone } from '../utils/runSkillLevelLabel';
import { SKILL_RARITY_RING } from './skillRarityRing';
import type { ConsumableKey } from '../types/game';

// 社長指示v0.25.3298: ①装備中のランスキルを**左下**にアイコンで表示 ②強化バフ中は**その上の段**に
// バフアイコンを表示。旧ConsumableHud(右上のテキストピル)はこの上段に統合して置き換え。
// アイコンは絵文字プレースホルダ(campaign.tsのSKILL_ICON台帳=選択画面と共有。画像は確定後に差し替え検討)。
//
// React再描画規律: runBuildは取得時にしか参照が変わらない小配列。Lvは派生プリミティブ(join文字列)で購読。
// 各アイコンの右上に今のLvの数字を常時重ねる(社長指示2026-11-12)。
// バフ残秒は Math.floor(gameTime/1000) 駆動=1秒に1回だけ再描画(旧ConsumableHudと同じ)。

const LV_TONE_CLASS: Record<SkillLevelTone, string> = {
  max: 'ui-acc-text', // 上限に達した=琥珀
  low: 'text-white/55', // Lv1(上限未満)=白を一段落とす
  normal: 'text-white',
};

// アイコン右上のLv数字。値が変わった時だけ一度ふくらむ(skill-lv-pop)。初回の表示では動かさない。
// 再描画は親(Lvの派生文字列が変わった時だけ)+変化時の1回だけ=毎フレームの負担にならない。
const SkillLvBadge: React.FC<{ lv: number; tone: SkillLevelTone }> = ({ lv, tone }) => {
  const prev = useRef(lv);
  const [pops, setPops] = useState(0);
  useEffect(() => {
    if (prev.current !== lv) { prev.current = lv; setPops(n => n + 1); }
  }, [lv]);
  return (
    <span
      key={pops}
      className={`gt-outline absolute -top-1 -right-1 text-[9px] font-bold tabular-nums leading-none ${LV_TONE_CLASS[tone]}${pops > 0 ? ' skill-lv-pop' : ''}`}
    >
      {lv}
    </span>
  );
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
  // この出撃で届く上限(所持Lvが天井=runLevelCap)。出撃中は変わらない派生プリミティブ。
  const capsKey = useGameStore(s => s.runBuild.map(k => runSkillDisplayCap(k, s.player.skillLevels?.[k] ?? 1, s.ownedSkillLevels)).join(','));
  const untils = useGameStore(s => ({
    consumableScrapUntil: s.player.consumableScrapUntil,
    consumableAttackUntil: s.player.consumableAttackUntil,
    consumableSpeedUntil: s.player.consumableSpeedUntil,
    consumableXpUntil: s.player.consumableXpUntil,
    consumableProtectionUntil: s.player.consumableProtectionUntil,
  }), shallow);
  const secondsNow = useGameStore(s => Math.floor(s.gameTime / 1000));

  const levels = levelsKey.length > 0 ? levelsKey.split(',').map(n => parseInt(n, 10) || 1) : [];
  const caps = capsKey.length > 0 ? capsKey.split(',').map(n => parseInt(n, 10) || 1) : [];
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
        <div className="flex flex-row flex-wrap gap-1 max-w-[calc(60vw/var(--hud-s,1))]">
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
        <div className="flex flex-row flex-wrap gap-1 max-w-[calc(60vw/var(--hud-s,1))]">
          {runBuild.map((k, i) => (
            // 角丸と overflow-hidden は中の絵を包む要素だけに付け、Lv数字は外側の枠に置いて角へ少しはみ出させる
            // (枠ごと切ると数字が角丸で欠ける)。数字は縁(gt-outline)だけ=板は敷かない。
            <div key={k} className="relative w-6 h-6" title={SKILLS[k].name}>
              <div className={`hud-translucent rounded-lg border ${SKILL_RARITY_RING[SKILLS[k].rarity]} w-full h-full flex items-center justify-center text-[13px] leading-none overflow-hidden`}>
                {(() => {
                  // ①単体ファイルのアイコン(POI報酬3種) ②1枚シート ③絵文字、の順に優先。
                  const single = skillSingleIconName(k);
                  if (single) return <img src={spritePath(single)} alt="" className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />;
                  const st = skillSheet && hasSkillIcon(k)
                    ? skillIconStyle(k, skillSheet.url, 22, skillSheet) : null;
                  return st ? <span style={st} aria-hidden /> : skillIcon(k);
                })()}
              </div>
              {/* 社長指示2026-11-12: 今のLvを常時(Lv1も)。Lv1=白55% / 2以上=白 / 上限=琥珀。 */}
              <SkillLvBadge lv={levels[i] ?? 1} tone={skillLevelTone(levels[i] ?? 1, caps[i] ?? 1)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RunHud;
