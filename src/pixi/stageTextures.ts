// ステージ別テクスチャの一覧と所属表(PixiStage から切り出し・v0.25.2230)。
// コンポーネントではないモジュールに置くことで、ミッション選択画面(React)からも安全に
// 先読み(prefetchStageTextures)を呼べる。
import { Assets } from 'pixi.js';
import { useGameStore } from '../store/gameStore';

// 出撃時に注入するステージ別テクスチャの一覧。ローディング%の分母を初期化冒頭で全登録するため
// 配列で一元管理(v0.25.1829: 分母を後から増やすと%が逆行する=「100→99→98…」社長報告の修正)。
// ※読み込み結果の分割代入(下方)と位置結合=並びを変える時は両方を同順で更新すること。
export const SORTIE_STAGE_TEXTURE_PATHS = [
  'sprites/lab-floor/lab-floor-stage2.png',
  'backgrounds/stage3-distant-city-day.jpg',
  'backgrounds/stage3-ground-cobble2.jpg',
  'backgrounds/stage3-horizon-city.png',
  'backgrounds/stage3-near-horizon-city.png',
  'backgrounds/stage1-near-forest.png',
  'backgrounds/stage2-lab-far.jpg',
  'backgrounds/stage2-near-horizon2.png',
  'backgrounds/stage2-front.png', // ステージ2(lab)の近景森=什器シルエット(クロマキー透過・社長提供v0.25.2184)
  'backgrounds/stage2-front2.png', // ステージ2(lab)の近景森2=廃研究棟の壁/残骸(クロマキー透過・一番手前・社長提供v0.25.2192)
  'backgrounds/stage2-far-glass.png', // ステージ2(lab)の遠景の窓=ガラス(奥・不透明・社長提供v0.25.2199)
  'backgrounds/stage2-far-frame.png', // ステージ2(lab)の遠景の窓=フレーム(手前・アルファ透過済み・社長提供v0.25.2199)
  'backgrounds/stage4-far.jpg',
  'backgrounds/stage4-front2.png',
  'backgrounds/stage4-ground.jpg',
  'backgrounds/stage4-horizon.png',
  'backgrounds/stage3-front-rooftops.png',
  'backgrounds/stage5-far.jpg',
  'backgrounds/stage5-horizon.png',
  'backgrounds/stage5-near-horizon.png',
  'backgrounds/stage5-front.png',
  'backgrounds/stage5-ground.jpg',
  'backgrounds/tutorial-far.jpg',
  'backgrounds/tutorial-ground.jpg',
  'sprites/tutorial-river-flow-1.png',
  'sprites/tutorial-river-flow-2.png',
  'backgrounds/tutorial-horizon-rocks.png',
  'backgrounds/tutorial-near-rocks.png',
  'backgrounds/tutorial-front-rocks.png',
  'backgrounds/stage7-far.jpg', // M7の遠景(星雲・社長提供v0.25.1907)
  'backgrounds/stage7-clouds-anim.png', // M7の遠景に重ねる雲=6コマアニメアトラス(クロマキー60%・社長提供v0.25.1913)
  'backgrounds/stage1-sky-anim.jpg', // M1の遠景=星空6コマアニメ(縦1列×6行・社長提供v0.25.1931)
  'backgrounds/stage1-castle.png', // M1の星空に重ねる城/山/霧の森(クロマキー・社長提供v0.25.1934)
  'backgrounds/stage1-moon.png', // M1の光源=月(クロマキー透過・社長提供v0.25.1951)
] as const;

export type SortieTexturePath = (typeof SORTIE_STAGE_TEXTURE_PATHS)[number];
// ステージ別テクスチャの所属表(v0.25.2166・社長指示「ステージ特有のリソースはそのステージの
// ローディング中にだけ読む」): 従来は30枚(デコード後実測~138MB)を毎出撃で全ロードしており、
// iOSのメモリ天井(=勝手リロード)の最大の押し上げ要因だった。出撃ステージの分だけ読む。
// ・キー: stageTheme 'lab' / farBackdrop 'city'|'snow'|'stage5'|'tutorial'|'stage7' / ''=既定の森(M1系)
// ・読まなかった分はnullのまま注入(セッターは全てTexture|null許容)=そのステージでは元々描かれない。
// ・未知のキーは安全側=全ロードにフォールバック。
// ・洋館通路(corridorMode)は通路テクスチャ(別ロード・下のpreloadCorridorTextures)のみ=ここは0枚。
// ・要素はSortieTexturePath型=綴りミスはtypecheckで検出される。
const STAGE_TEXTURE_GROUPS: Record<string, readonly SortieTexturePath[]> = {
  forest: ['backgrounds/stage1-near-forest.png', 'backgrounds/stage1-sky-anim.jpg', 'backgrounds/stage1-castle.png', 'backgrounds/stage1-moon.png'],
  lab: ['sprites/lab-floor/lab-floor-stage2.png', 'backgrounds/stage2-lab-far.jpg', 'backgrounds/stage2-near-horizon2.png', 'backgrounds/stage2-front.png', 'backgrounds/stage2-front2.png', 'backgrounds/stage2-far-glass.png', 'backgrounds/stage2-far-frame.png'],
  city: ['backgrounds/stage3-distant-city-day.jpg', 'backgrounds/stage3-ground-cobble2.jpg', 'backgrounds/stage3-horizon-city.png', 'backgrounds/stage3-near-horizon-city.png', 'backgrounds/stage3-front-rooftops.png'],
  snow: ['backgrounds/stage4-far.jpg', 'backgrounds/stage4-front2.png', 'backgrounds/stage4-ground.jpg', 'backgrounds/stage4-horizon.png'],
  stage5: ['backgrounds/stage5-far.jpg', 'backgrounds/stage5-horizon.png', 'backgrounds/stage5-near-horizon.png', 'backgrounds/stage5-front.png', 'backgrounds/stage5-ground.jpg'],
  tutorial: ['backgrounds/tutorial-far.jpg', 'backgrounds/tutorial-ground.jpg', 'sprites/tutorial-river-flow-1.png', 'sprites/tutorial-river-flow-2.png', 'backgrounds/tutorial-horizon-rocks.png', 'backgrounds/tutorial-near-rocks.png', 'backgrounds/tutorial-front-rocks.png'],
  stage7: ['backgrounds/stage7-far.jpg', 'backgrounds/stage7-clouds-anim.png'],
};
// 遠景森2(近景帯)はミッション個別キー(campaign の nearHorizon)で、farBackdrop とは独立に
// グループを跨げる(例: M7=stage7遠景+『forest』の森シルエット・v0.25.1905)。キー→素材で直引き。
const NEAR_HORIZON_TEXTURES: Record<string, SortieTexturePath> = {
  forest: 'backgrounds/stage1-near-forest.png',
  city: 'backgrounds/stage3-near-horizon-city.png',
  lab: 'backgrounds/stage2-near-horizon2.png',
  stage5: 'backgrounds/stage5-near-horizon.png',
  tutorial: 'backgrounds/tutorial-near-rocks.png',
};
// キー(テーマ/遠景/遠景森2)から必要な素材集合を作る本体。出撃時(ストア)からも、出撃前の先読み
// (ステージ定義)からも同じ規則で引けるように切り出してある。
const stageTexturesFor = (theme: string | undefined, farBackdrop: string, nearHorizon: string): ReadonlySet<string> => {
  const out = new Set<string>();
  if (theme === 'lab') {
    for (const p of STAGE_TEXTURE_GROUPS.lab) out.add(p);
  } else {
    const group = STAGE_TEXTURE_GROUPS[farBackdrop || 'forest'];
    if (!group) return new Set<string>(SORTIE_STAGE_TEXTURE_PATHS); // 未知キー=全ロード(安全側)
    for (const p of group) out.add(p);
  }
  const near = NEAR_HORIZON_TEXTURES[nearHorizon];
  if (near) out.add(near);
  return out;
};

// ステージスキンのレイヤー種別(v0.25.2279)。ステージ別素材が注入されるまで、そのレイヤーは
// **森(=ステージ1)の下地**を表示してしまう(applyFarBackdrop 等が override 不在時に 'forest' へ
// フォールバックする設計のため)。どのレイヤーを「届くまで隠して待つ」べきかを、ロード対象の
// パス一覧から機械的に導くための対応表。
// ※ここに載っていない素材(雲アニメ/川の流れ/lab窓/M1の星空・城・月など)は、未着でも森の下地が
//   出るわけではない(自前で非表示になる)ので対象外=載せない。
export type StageSkinLayer = 'far' | 'ground' | 'horizon' | 'front';
const LAYER_OF_PATH: Partial<Record<SortieTexturePath, StageSkinLayer>> = {
  'sprites/lab-floor/lab-floor-stage2.png': 'ground',
  'backgrounds/stage2-lab-far.jpg': 'far',
  'backgrounds/stage2-front.png': 'front',
  'backgrounds/stage3-distant-city-day.jpg': 'far',
  'backgrounds/stage3-ground-cobble2.jpg': 'ground',
  'backgrounds/stage3-horizon-city.png': 'horizon',
  'backgrounds/stage3-front-rooftops.png': 'front',
  'backgrounds/stage4-far.jpg': 'far',
  'backgrounds/stage4-ground.jpg': 'ground',
  'backgrounds/stage4-horizon.png': 'horizon',
  'backgrounds/stage4-front2.png': 'front',
  'backgrounds/stage5-far.jpg': 'far',
  'backgrounds/stage5-ground.jpg': 'ground',
  'backgrounds/stage5-horizon.png': 'horizon',
  'backgrounds/stage5-front.png': 'front',
  'backgrounds/tutorial-far.jpg': 'far',
  'backgrounds/tutorial-ground.jpg': 'ground',
  'backgrounds/tutorial-horizon-rocks.png': 'horizon',
  'backgrounds/tutorial-front-rocks.png': 'front',
  'backgrounds/stage7-far.jpg': 'far',
};

// 出撃中のステージが「ステージ別素材で差し替える予定のレイヤー」。注入が終わるまで、この集合の
// レイヤーだけを非表示でホールドすれば、森(ステージ1)の下地を1フレームも見せずに済む。
// 既定の森スキン(M1など farBackdrop 無し)は空集合=ホールドしない(森が正解の画なので隠す意味がない)。
// 純関数版(テスト対象)。ストアを見ずにステージ定義の3キーだけで決める。
export const skinLayersExpectedFor = (
  theme: string | undefined,
  farBackdrop: string,
  nearHorizon: string,
  corridorMode = false
): ReadonlySet<StageSkinLayer> => {
  const out = new Set<StageSkinLayer>();
  if (corridorMode) return out; // 洋館通路は別パイプライン(corridorLayer)が全面を置き換える
  const skinned = theme === 'lab' || (!!farBackdrop && farBackdrop !== 'forest');
  if (!skinned) return out;     // 既定の森スキン(M1等)は森が正解の画=隠さない
  for (const p of stageTexturesFor(theme, farBackdrop, nearHorizon)) {
    const layer = LAYER_OF_PATH[p as SortieTexturePath];
    if (layer) out.add(layer);
  }
  return out;
};

export const sortieSkinLayersExpected = (): ReadonlySet<StageSkinLayer> => {
  const s = useGameStore.getState();
  return skinLayersExpectedFor(s.stageTheme, s.farBackdrop, s.nearHorizon, s.corridorMode);
};

export const sortieTexturesNeeded = (): ReadonlySet<string> => {
  const s = useGameStore.getState();
  if (s.corridorMode) return new Set();
  return stageTexturesFor(s.stageTheme, s.farBackdrop, s.nearHorizon);
};

// 出撃前(ミッション選択の滞在中)に、そのステージの素材を先に取り始める(社長報告v0.25.2230
// 「ステージ開始時に10秒くらい固まる」への対策)。Assets.load はキャッシュ済みなら即解決・
// 同一URLの多重呼び出しも1本にまとめられるので、出撃時のロードはそのまま待ち合わせに乗る。
// 失敗は無視(出撃時に本ロードが再試行する)。進捗カウンタには載せない=出撃%の分母を汚さない。
export const prefetchStageTextures = (stage: { theme?: string; farBackdrop?: string; nearHorizon?: string } | null | undefined): void => {
  if (!stage) return;
  const BASE = import.meta.env.BASE_URL;
  for (const p of stageTexturesFor(stage.theme, stage.farBackdrop ?? '', stage.nearHorizon ?? '')) {
    void Assets.load(`${BASE}${p}`).catch(() => null);
  }
};
