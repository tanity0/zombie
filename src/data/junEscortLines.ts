// ステージ4: 衛生兵ジュンの同行と変身(research/JUN_ESCORT.md)の台詞の台帳。
// 道中の文言は設計書 §2 の表、変異の場面の3行は §5 の文言(下の JUN_TRANSFORM_SCENE_LINES)。道中の場面は進軍NPCの既存カテゴリへ当てる:
//   出撃=sortie / 囲まれた=surrounded / 助けられた=rescued / 拠点の近く=baseNear / 拠点を取った=baseCaptured /
//   一緒にいる=companion / 置いていかれそう=neglectFar / 起こしてもらった=revived / ボスに狙われた=targeted。
// 表に無い場面(苦戦の後退・撃破・称賛・作戦準備・倒れた瞬間 …)は**無言**=ここに載せない。
// 他の進軍NPC(名簿0..7)の台帳(npcLines.ts / escortSceneLines.ts)には混ぜない=名簿の表の長さ・index前提を壊さない。

/**
 * ジュン(ステージ4の進軍NPC)の soldierIndex。名簿(BASE_SOLDIERS 0..7)の外に置く印。
 * チュートリアルの随行(衛生兵=100・軍人=101)と同じ「名簿外の特別index」の作法で、M0の随行とは別の値にして
 * チュートリアル側の分岐(台詞の全停止など)と混ざらないようにする。
 */
export const JUN_ESCORT_INDEX = 102;
/** 会話の箱の名前(立ち絵は NpcDialogue の 'ジュン' 行=歩きシートの顔)。 */
export const JUN_NAME = 'ジュン';

/** 進軍NPCの汎用カテゴリ → 文言(複数ある場面はランダム)。 */
export const JUN_NPC_LINES: Readonly<Record<string, readonly string[]>> = {
  sortie: ['だ、大丈夫です…戦えます…', '自分の身は、自分で守らなければ…！'],
  surrounded: ['変異体どもめ…！', '来ないで…来ないでください…！'],
  rescued: ['不思議と、痛みはないんです'],
  baseNear: ['医師団はどこに…'],
  baseCaptured: ['医師団はどこに…'],
  companion: ['変な感じがする…'],
  neglectFar: ['待って…置いていかないで…'],
};

/** 進軍NPCの場面(escortSceneLines の EscortScene と同じ名前)→ 文言。倒れた瞬間(downed)は無言。 */
export const JUN_SCENE_LINES: Readonly<Partial<Record<'downed' | 'revived' | 'targeted', string>>> = {
  revived: '…もう、塞がってます',
  targeted: '私を…見てる…？',
};

/**
 * 城ボスの前の変異の場面の通信(research/JUN_ESCORT.md §5)。3行とも待ち行列に積まずその場で差し替える。
 *  ①寄り始め(カメラがジュンへ寄り始めた瞬間)/②倒れ始め/③地面で震え始めた少し後。
 */
export const JUN_CLOSEUP_LINE = 'あれ…あつい、です';
/** 倒れ始めの一言(社長指示2026-10-20「通信でジュンが い、意識が… と言いながら倒れる」)。 */
export const JUN_COLLAPSE_LINE = 'い、意識が…';
export const JUN_TREMBLE_LINE = '…見ないで…ください…';
/** 3行目は最後まで言わせず、変身で断ち切る: この頭の部分を送り終わった少し後に変身する(=「ください…」の途中)。 */
export const JUN_TREMBLE_LINE_CUT_AFTER = '…見ないで…';
/** 変異の場面の3行は通信の箱に立ち絵を出さない(名前と文だけ)。NpcDialogue の立ち絵の表に無い鍵=立ち絵なし。 */
export const JUN_NO_PORTRAIT = '(立ち絵なし)';
/** 段の順(utils/junEscort junSceneLineAt の答え 0..2 の引き先)。 */
export const JUN_TRANSFORM_SCENE_LINES: readonly [string, string, string] = [JUN_CLOSEUP_LINE, JUN_COLLAPSE_LINE, JUN_TREMBLE_LINE];
// 隊を離れる時(城ボスの少し前)は通信しない(社長指示2026-11-12「ここではジュンは通信しない」)=離脱の一言は無い。

/** カテゴリの文言を1本選ぶ(無い場面は空文字=無言)。 */
export const pickJunLine = (cat: string, rng: () => number = Math.random): string => {
  const v = JUN_NPC_LINES[cat];
  if (!v || v.length === 0) return '';
  return v[Math.min(v.length - 1, Math.floor(rng() * v.length))];
};
