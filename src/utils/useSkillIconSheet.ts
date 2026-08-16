// スキルアイコンの1枚シート(社長支給)を読み込んで、表示側へ「URL+段組み」を渡すだけの極小フック。
// v0.25.3499(社長「スキル38種類の入れ替え。ドット絵にし忘れてたので。配置は一緒です」)。
//
// 設計の要点3つ:
//  1) **素材が無い間は null を返す**。表示側は null なら従来どおり絵文字を出す=素材が入るまで壊れない
//     (素材未投入のまま配線して「アイコンが全部空白」になる事故を構造的に防ぐ)。
//  2) **段組み(列×段)は画像の実寸から自動判定**(skillSheetGrid)。社長のシートは差し替えのたびに
//     並べ方が変わりうるため、定数で持たない(直し忘れると全アイコンがズレる)。
//  3) **読み込みはモジュール単位で1回だけ**。結果はモジュール変数へキャッシュし、購読中の
//     コンポーネントへ1回だけ通知する(CLAUDE.md「React re-render discipline」=毎フレーム再描画しない。
//     ここは画像の onload 時に1回 setState するだけで、以後は再レンダを起こさない)。
import { useEffect, useState } from 'react';
import { assetUrl } from '../config/assetUrl';
import { skillSheetGrid } from '../data/skillIcons';

export interface SkillIconSheet {
  url: string;
  cols: number;
  rows: number;
}

/** 素材の置き場所(同名で差し替えれば `?v=` は内容ハッシュなので自動更新される)。 */
export const SKILL_SHEET_URL = assetUrl('sprites/skill/skills-sheet.png');

type LoadState = { done: boolean; sheet: SkillIconSheet | null };
const state: LoadState = { done: false, sheet: null };
const listeners = new Set<(s: SkillIconSheet | null) => void>();
let started = false;

const startLoad = (): void => {
  if (started || typeof window === 'undefined') return;
  started = true;
  const img = new Image();
  img.onload = () => {
    const { cols, rows } = skillSheetGrid(img.naturalWidth, img.naturalHeight);
    state.done = true;
    state.sheet = { url: SKILL_SHEET_URL, cols, rows };
    for (const fn of listeners) fn(state.sheet);
  };
  img.onerror = () => {
    // 素材未投入(404)もここへ来る=絵文字フォールバックのまま。コンソールを汚さないため何も出さない。
    state.done = true;
    state.sheet = null;
    for (const fn of listeners) fn(null);
  };
  img.src = SKILL_SHEET_URL;
};

/**
 * シートが使えるなら {url, cols, rows}、使えないなら null。
 * 読み込み完了までは null なので、表示側は素直に絵文字を出しておけばよい。
 */
export const useSkillIconSheet = (): SkillIconSheet | null => {
  const [sheet, setSheet] = useState<SkillIconSheet | null>(state.sheet);
  useEffect(() => {
    if (state.done) { setSheet(state.sheet); return; }
    startLoad();
    listeners.add(setSheet);
    return () => { listeners.delete(setSheet); };
  }, []);
  return sheet;
};
