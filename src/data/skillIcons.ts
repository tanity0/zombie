// スキルアイコンの台帳(社長支給の1枚シート・v0.25.3463)。
//
// 社長から38種のアイコンが**1枚の画像(グリッド)**で支給された。並びは社長指定:
//   「左上から右方向へ、1段ずつ下に進む順番」= 8列×5段(最終段だけ6個)= 38個。
// この台帳は「シートの何番目がどのスキルか」だけを持つ(表示側はここを読むだけ)。
//
// ★画像の置き場所: public/sprites/skill/skills-sheet.png(v0.25.3500で投入済み・5472×136=1段×38列)。
//   同名で差し替えれば `?v=` は内容ハッシュなので自動更新される(ASSET_VERSIONの手バンプ不要)。
//
// ★台帳を1箇所にする理由: 装備アイコン(EQUIP_ICON_IDS)と同じ作法。並びの正がコードに1本あれば、
//   後からアイコンを足す/差し替える時に「どの絵がどのスキルか」を探し直さなくて済む。
import type { SkillKey } from '../types/game';

/**
 * ★シートの並び方(段組み)は**画像の実寸から自動判定する**(v0.25.3499)。
 *
 * 理由: 社長のシートは支給のたびに段組みが変わりうる(初回=8列×5段、v0.25.3499の差し替え=1段×38列)。
 * 「配置は一緒です」=**スキルの順番(SKILL_ICON_ORDER)は不変**だが、**何列×何段に並べたかは別の話**。
 * ここを定数で固定すると差し替えのたびに人がコードを直す必要があり、直し忘れると全部のアイコンが
 * ズレる(素材差し替え事故の典型)。マス目が正方形である限り、**画像の縦横比と個数から段組みは一意に
 * 決まる**ので、読み込んだ実寸から求める。
 */
export const SKILL_ICON_COUNT = 38;

/**
 * 画像の実寸から段組み(列×段)を求める純関数。マス目は正方形前提。
 * 候補は「38個が収まる段数 R=1..SKILL_ICON_COUNT」で、列 C=ceil(38/R)。
 * そのときの縦横比 C/R が実測の縦横比に最も近いものを選ぶ。
 */
export const skillSheetGrid = (
  naturalWidth: number, naturalHeight: number, count: number = SKILL_ICON_COUNT,
): { cols: number; rows: number } => {
  if (!(naturalWidth > 0) || !(naturalHeight > 0) || count <= 0) return { cols: count, rows: 1 };
  const aspect = naturalWidth / naturalHeight;
  let best = { cols: count, rows: 1 };
  let bestErr = Infinity;
  for (let rows = 1; rows <= count; rows++) {
    const cols = Math.ceil(count / rows);
    // 比の誤差は対数で測る(縦長・横長を対等に扱う)。
    const err = Math.abs(Math.log((cols / rows) / aspect));
    if (err < bestErr) { bestErr = err; best = { cols, rows }; }
  }
  return best;
};

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
/** シートの実測値。cellW/cellHは1マスの実寸(**正方形とは限らない**)。 */
export interface SkillSheetGeometry {
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
}

/** 実寸から段組みと1マスの寸法をまとめて求める。 */
export const skillSheetGeometry = (
  naturalWidth: number, naturalHeight: number, count: number = SKILL_ICON_COUNT,
): SkillSheetGeometry => {
  const { cols, rows } = skillSheetGrid(naturalWidth, naturalHeight, count);
  return { cols, rows, cellW: naturalWidth / cols, cellH: naturalHeight / rows };
};

export const skillIconStyle = (
  key: SkillKey, sheetUrl: string, boxPx: number, geo: SkillSheetGeometry,
): React.CSSProperties | null => {
  const idx = SKILL_ICON_INDEX[key];
  if (idx === undefined) return null;
  const col = idx % geo.cols;
  const row = Math.floor(idx / geo.cols);
  // ★マスは正方形とは限らない(実測=144×136)。**contain(縦横比を保って収める)**で拡縮し、
  //   余った側は中央へ寄せる。ここを boxPx の正方形へ強制すると絵が横に潰れる。
  const scale = Math.min(boxPx / geo.cellW, boxPx / geo.cellH);
  const cw = geo.cellW * scale, ch = geo.cellH * scale;
  const padX = (boxPx - cw) / 2, padY = (boxPx - ch) / 2;
  return {
    width: boxPx,
    height: boxPx,
    backgroundImage: `url(${sheetUrl})`,
    // シート全体を同じ倍率で拡縮し、目的のマスだけを窓から見せる。
    backgroundSize: `${geo.cols * cw}px ${geo.rows * ch}px`,
    backgroundPosition: `${-col * cw + padX}px ${-row * ch + padY}px`,
    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated',
  };
};
