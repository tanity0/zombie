// ステージ景色テンプレ(単一の真実 = single source of truth)。
// 全ステージは共通のレイヤースロットを持ち、ここの「データ」で各スロットの有無/種類だけを切り替える。
// 目的: 描画コードから `if (isLabStage)` / `farBackdrop==='city'` 等の散在分岐を無くし、仕様変更でも漏れない形へ。
//
// レイヤー(奥→手前) = 遠景 / 地面 / 遠景森1 / 遠景森2 / その他(world) / 霧 / 近景森1 / 画面効果 / 上寄せ追加遠景(topHang)
// ※スロット自体はエンジンが全ステージ共通で1回生成して使い回す。ここはその「出し分けデータ」。
//
// 移行方針: まず本表で全ステージの現状構成を宣言(=現状再現)。描画側を段階的に本表参照へ置き換える。
// 現在 pixiScene が参照しているのは horizon1Visible のみ(遠景森1の有無)。残り(far/ground/front/horizon2)は
// 既存の apply* 経路が担当中で、本表は将来の移行先として宣言済み(値は現状の挙動に一致)。

export type StageSkinKey = 'forest' | 'lab' | 'city' | 'snow';

export interface StageSkin {
  far: StageSkinKey | 'forest';   // 遠景パノラマの種類
  ground: StageSkinKey | 'forest'; // 地面(床)の種類
  horizon1Visible: boolean;        // 遠景森1(森シルエット帯)を出すか
  horizon2: 'forest' | 'city' | 'lab' | null; // 遠景森2(手前の帯)。null=なし
  front: 'forest' | 'city' | 'snow';           // 近景森1の差し替え
  daylightNoon: boolean;           // 昼(正午=city)の環境補正
  topHang: string | null;          // 上寄せ追加遠景(上端アンカーで下に垂れる帯)。null=なし(将来用スロット)
}

export const STAGE_SKINS: Record<StageSkinKey, StageSkin> = {
  // ステージ1: 狂い咲きの森(夜の森)
  forest: { far: 'forest', ground: 'forest', horizon1Visible: true, horizon2: 'forest', front: 'forest', daylightNoon: false, topHang: null },
  // ステージ2: 研究所跡(野外ラボ)。森帯は出さず、遠景森2=機材シルエット。
  lab:    { far: 'lab', ground: 'lab', horizon1Visible: false, horizon2: 'lab', front: 'forest', daylightNoon: false, topHang: null },
  // ステージ3: リモート研究施設(正午の廃都)。
  city:   { far: 'city', ground: 'city', horizon1Visible: true, horizon2: 'city', front: 'city', daylightNoon: true, topHang: null },
  // ステージ4: 封鎖地域(雪原の要塞)。遠景森2は無し、地平帯=氷壁。
  snow:   { far: 'snow', ground: 'snow', horizon1Visible: true, horizon2: null, front: 'snow', daylightNoon: false, topHang: null },
};

// 現在の出撃状態(stageTheme / farBackdrop)からスキンキーを解決。屋外専用(屋内は別パイプライン)。
export const resolveStageSkinKey = (stageTheme: string, farBackdrop: string): StageSkinKey => {
  if (stageTheme === 'lab') return 'lab';
  if (farBackdrop === 'city') return 'city';
  if (farBackdrop === 'snow') return 'snow';
  return 'forest';
};
