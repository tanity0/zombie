// スキルアイコンの台帳(社長支給の1枚シート・v0.25.3463)。
//
// 社長から38種のアイコンが**1枚の画像(グリッド)**で支給された。並びは社長指定:
//   「左上から右方向へ、1段ずつ下に進む順番」= 8列×5段(最終段だけ6個)= 38個。
// この台帳は「シートの何番目がどのスキルか」だけを持つ(表示側はここを読むだけ)。
//
// ★画像の置き場所: public/sprites/skill/skills-sheet.png(素材が入るまで表示側は既存のまま)。
//   同名で差し替えれば `?v=` は内容ハッシュなので自動更新される(ASSET_VERSIONの手バンプ不要)。
//
// ★台帳を1箇所にする理由: 装備アイコン(EQUIP_ICON_IDS)と同じ作法。並びの正がコードに1本あれば、
//   後からアイコンを足す/差し替える時に「どの絵がどのスキルか」を探し直さなくて済む。
import type { SkillKey } from '../types/game';

/** シートの列数(1段あたりの個数)。 */
export const SKILL_ICON_COLS = 8;
/** シートの段数。 */
export const SKILL_ICON_ROWS = 5;

/**
 * シートの並び(社長の番号 1〜38 の順)。index 0 = 左上。
 * 社長の名前 → コード上のキーの対応もここで固定する(名前は台帳のコメント側に残す)。
 */
export const SKILL_ICON_ORDER: readonly SkillKey[] = [
  // 1段目
  'reaper',            // 1. 死神
  'berserker',         // 2. バーサーカー
  'skater',            // 3. スケーター
  'overclock',         // 4. オーバークロック
  'crit-up',           // 5. クリティカルダメージ上昇
  'sniper',            // 6. スナイパー
  'knight',            // 7. ナイト
  'exploder',          // 8. エクスプローダー
  // 2段目
  'bomber',            // 9. ボマー
  'fire-shooter',      // 10. ファイアシューター
  'bomb-counter',      // 11. ボムカウンター
  'combo-master',      // 12. コンボマスター
  'knife-master',      // 13. ナイフマスター
  'rescue-signal',     // 14. 救難信号
  'sharpshooter',      // 15. シャープシューター
  'ricochet',          // 16. 跳弾
  // 3段目
  'punisher',          // 17. パニッシャー
  'benkei',            // 18. 弁慶
  'reflex',            // 19. 反射神経
  'gold-rush',         // 20. ゴールドラッシュ
  'time-keeper',       // 21. タイムキーパー
  'ghost-shooter',     // 22. ゴーストシューター
  'dog-run',           // 23. ドッグラン
  'counter-master',    // 24. カウンターマスター
  // 4段目
  'slasher',           // 25. スラッシャー
  'attack-shooter',    // 26. アタックシューター
  'runner',            // 27. ランナー
  'seeker',            // 28. シーカー
  'magnet',            // 29. マグネット
  'last-magazine',     // 30. ラストマガジン
  'ice-shot',          // 31. アイスショット
  'vampire',           // 32. 吸血
  // 5段目(6個)
  'incendiary-round',  // 33. 延焼弾
  'execution-shock',   // 34. 処刑
  'gravity-shot',      // 35. グラビティショット
  'echo-shot',         // 36. エコーショット
  'barrage-king',      // 37. 弾幕の王
  'blood-treads',      // 38. 血の履帯
];

/** スキル→シート番号(0始まり)。台帳に無いスキル(守護霊・POI専用など)は undefined。 */
export const SKILL_ICON_INDEX: Partial<Record<SkillKey, number>> = (() => {
  const out: Partial<Record<SkillKey, number>> = {};
  SKILL_ICON_ORDER.forEach((key, i) => { out[key] = i; });
  return out;
})();

export const hasSkillIcon = (key: SkillKey | null | undefined): boolean =>
  !!key && SKILL_ICON_INDEX[key] !== undefined;

/**
 * 1枚シートから該当アイコンだけを切り出して表示するためのCSS(背景画像方式)。
 * 表示側は `<div style={skillIconStyle(key, sheetUrl, px)} />` で置ける(画像を分割せずに済む)。
 * boxPx = 表示したい1マスの大きさ(px)。
 */
export const skillIconStyle = (
  key: SkillKey, sheetUrl: string, boxPx: number,
): React.CSSProperties | null => {
  const idx = SKILL_ICON_INDEX[key];
  if (idx === undefined) return null;
  const col = idx % SKILL_ICON_COLS;
  const row = Math.floor(idx / SKILL_ICON_COLS);
  return {
    width: boxPx,
    height: boxPx,
    backgroundImage: `url(${sheetUrl})`,
    // シート全体を「列数×段数」倍に拡大し、目的のマスだけを窓から見せる。
    backgroundSize: `${boxPx * SKILL_ICON_COLS}px ${boxPx * SKILL_ICON_ROWS}px`,
    backgroundPosition: `${-col * boxPx}px ${-row * boxPx}px`,
    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated',
  };
};
