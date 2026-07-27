// チュートリアル本文の唯一の出どころ(社長指示v0.25.2252「一度見たやつ資料室にまとめよう」)。
// 発火条件はステージごとの実装(例: M2は src/utils/labTutorial.ts)に置き、**本文はここに集約**する。
// 資料室(MissionSelect の「操作記録」)はこの台帳を引いて、既読のものだけを読み返せるようにする。
// 同じ文章を2箇所で管理しない(STORY_UI_SPEC.md 11章「同一内容の別文章を管理しない」と同じ原則)。

export type TutorialId =
  | 'move'
  // 訓練(M0)の教習ビート(TUTORIAL_STAGE.md「M0 チュートリアル進行案」・社長裁定v0.25.2286〜2291)。
  | 'm0-shoot' | 'm0-melee' | 'm0-crit' | 'm0-finish' | 'm0-counter' | 'm0-levelup' | 'm0-area' | 'm0-hunter' | 'm0-ammo'
  | 'phill' | 'scout';

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
    // v0.25.2302: 帰還サークルを廃止したので「緑のマーク」の案内は嘘になる。行き先だけを言う。
    lines: ['指でなぞった方向に移動。', '右へ進め。'],
    art: 'move', // ドラッグ方向を示す矢印の注釈(動画の上に重ねる)。不要になったらこの行を消すだけ。
    // 手本(**実機収録・社長撮影v0.25.2268**)。訓練の洞窟を右へ歩き、随行NPCが付いてくるところ。
    // 旧 `move.gif` は 1.4秒・10fps・14コマの古いヘッドレス収録でカクついていた(社長指摘v0.25.2266
    // 「滑らかな動画にして」)。実機収録のmp4に差し替え=**8.2秒・30fps・132KB**(旧GIFは681KB)。
    img: 'tutorial/move.mp4',
    where: '訓練',
  },
  // --- 訓練(M0)の教習ビート ---------------------------------------------
  // 発火は `src/utils/m0Tutorial.ts` の純関数(位置/レベルで決まる)。本文に数値は書かない
  // (後でバランス調整した時に文面が嘘にならないように=CLAUDE.md「チュートリアルの作り方」)。
  // 手本はステージ1(森)でヘッドレス収録したもの。洞窟で撮り直すかは社長裁定(★未決)。
  {
    id: 'm0-shoot',
    title: '射撃',
    lines: [
      '銃は、敵が射程に入れば自動で撃つ。狙いを合わせる操作はいらない。',
      '撃たれる前に距離を取れ。'
    ],
    img: 'tutorial/action-shoot.mp4',
    where: '訓練',
  },
  {
    id: 'm0-melee',
    title: '近接',
    lines: [
      '指を離した瞬間(PCはスペース)に、近接で薙ぐ。',
      '弾を使わない。貼り付かれたらこれで剥がせ。',
      '当て続けろ。手応えが変わる瞬間が来る。'
    ],
    img: 'tutorial/action-melee.mp4',
    where: '訓練',
  },
  {
    id: 'm0-crit',
    title: 'クリティカル',
    lines: [
      '今の一撃がクリティカル。金色の数字がその印だ。',
      'クリティカルを受けた相手は体勢を崩して動けなくなる。'
    ],
    img: 'tutorial/action-melee.mp4',
    where: '訓練',
  },
  {
    id: 'm0-finish',
    title: '近接フィニッシュ',
    lines: [
      '崩れて動けない相手に、もう一度近接。',
      '体勢を崩した相手は、残りの体力に関係なく一撃で仕留まる。'
    ],
    img: 'tutorial/action-counter.mp4',
    where: '訓練',
  },
  {
    id: 'm0-counter',
    title: 'カウンター',
    lines: [
      '敵の攻撃に合わせて近接を出すと、弾き返して気絶させられる。',
      '気絶した相手への追撃は、一撃で仕留まる。'
    ],
    img: 'tutorial/action-counter.mp4',
    where: '訓練',
  },
  {
    id: 'm0-levelup',
    title: '成長',
    lines: [
      '倒した敵が落とす結晶を拾うと、経験が溜まる。',
      '溜まると強化を三つから選べる。'
    ],
    img: 'tutorial/demo-levelup.mp4',
    where: '訓練',
  },
  {
    id: 'm0-area',
    title: '区域',
    lines: [
      'ここから先は区域が変わる。',
      '奥へ行くほど敵は強く、数も増える。'
    ],
    img: 'tutorial/demo-area-wall.mp4',
    where: '訓練',
  },
  {
    id: 'm0-hunter',
    title: 'ハンター',
    lines: [
      '追跡型の変異体。一度見つかれば、どこまでも追ってくる。',
      '今の装備では勝てない。振り切って進め。'
    ],
    img: 'tutorial/demo-hunter-detect.mp4',
    where: '訓練',
  },
  {
    id: 'm0-ammo',
    title: '弾薬',
    lines: [
      '弾は落ちている。歩いて拾えば補充される。',
      '切らす前に拾え。'
    ],
    img: 'tutorial/demo-pickup.mp4',
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
    // 手本GIF(実機収録・社長撮影)。**2種類を1本に繋いである**(社長指示v0.25.2261):
    //   前半 = 通常射撃(立ち止まって撃つ→弾が飛ぶ→120ダメージ)
    //   後半 = 吸い付き→発砲→**ヘッドショット確定(120)**まで。寄りの画角で緑を判別できるように。
    // v0.25.2262(社長指示「どっちも全部流して」): **2本の収録を丸ごと連結**した。
    // 20.6秒あるためGIFだと4〜5MBになる(索敵GIFの実測レート約230KB/秒から算出)。
    // **mp4にすると464KB**=2.5秒しか入っていなかった旧GIF(897KB)の半分で、30fpsのまま出せる。
    img: 'tutorial/m2-phill.mp4',
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
    // 手本(実機収録・社長撮影)。**映像を丸ごと5.5秒**。流れ: 敵の視界(薄い赤)の中を進む →
    // 見つかる → 下がる → 壁の裏(下)に隠れる → 薄い赤の視界が壁の上に取り残される。
    // v0.25.2266(社長指示「滑らかな動画にして」): GIF(7fps・1147KB)→**mp4(30fps・140KB)**。
    // GIFは尺を伸ばすとコマ数を削るしかなく実測7fpsまで落ちていた。mp4なら30fpsのまま1/8の容量。
    img: 'tutorial/m2-scout.mp4',
    where: '研究所',
  },
];

export const getTutorial = (id: TutorialId): TutorialEntry | undefined =>
  TUTORIALS.find(t => t.id === id);

// 手本アセットが動画か(mp4/webm)。GIF/PNGはそのまま <img> で出す。
// 長い手本(20秒級)はGIFだと数MBになるのでmp4を置けるようにした(v0.25.2262)。
export const isVideoAsset = (path: string): boolean => /\.(mp4|webm)$/i.test(path);
