// チュートリアル本文の唯一の出どころ(社長指示v0.25.2252「一度見たやつ資料室にまとめよう」)。
// 発火条件はステージごとの実装(例: M2は src/utils/labTutorial.ts)に置き、**本文はここに集約**する。
// 資料室(MissionSelect の「操作記録」)はこの台帳を引いて、既読のものだけを読み返せるようにする。
// 同じ文章を2箇所で管理しない(STORY_UI_SPEC.md 11章「同一内容の別文章を管理しない」と同じ原則)。

export type TutorialId = 'move' | 'phill' | 'scout';

export interface TutorialEntry {
  id: TutorialId;
  title: string;
  lines: string[];
  art?: 'move';      // インラインSVGの挿絵(TutorialPopup が解釈)
  img?: string;      // 事前収録の手本画像/GIF(public/ 以下の相対パス)
  where: string;     // 資料室の一覧に出す出典(どこで出たか)
}

export const TUTORIALS: TutorialEntry[] = [
  {
    id: 'move',
    title: '移動',
    lines: ['指でなぞった方向に移動。', '右へ。緑のマークが帰還地点。'],
    art: 'move',
    // 手本GIF(事前収録・洞窟で右歩行+随行NPC)。社長決定v0.25.1839「基本的に全部
    // 事前に(手本を)見せるカタチ」=挿絵はライブ撮影でなく収録済み素材で統一。
    img: 'tutorial/move.gif',
    where: '訓練',
  },
  {
    id: 'phill',
    title: 'ＰＨＩＬＬ-銃',
    lines: [
      '狙いサークルは、スティックを倒した向き(マウスならカーソル位置)に出る。撃つのは指を離した瞬間。',
      '【通常】立ち止まって撃つ。サークルの向きへ弾が飛び、頭に当たればヘッドショット。',
      '【吸い付き】サークルが敵の頭に近づくと、自動で頭に吸い付く。この状態なら移動中でも撃てて、ヘッドショットが確定する。',
      '弾は貴重。頭を狙って一撃で仕留めろ。',
    ],
    where: '研究所',
  },
  {
    id: 'scout',
    title: '索敵と遮蔽物',
    lines: [
      '敵は眠っている。薄い赤が敵の視界。この中に入って視線が通ると、起きて襲ってくる。',
      '壁や什器で視線を切れば、赤の中でも見つからない。遮蔽物の裏を伝って進め。',
      '見つかっても、視線を切って離れ続ければ、やがて諦めてまた眠る。',
    ],
    where: '研究所',
  },
];

export const getTutorial = (id: TutorialId): TutorialEntry | undefined =>
  TUTORIALS.find(t => t.id === id);
