// ステージ4: 衛生兵ジュンの同行と変身(research/JUN_ESCORT.md §2)の台詞の台帳。
// 文言は設計書 §2 の表そのまま(変えない)。場面は進軍NPCの既存カテゴリへ当てる:
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

/** 城ボスの前に倒れる時、通信で言いながら倒れる一言(社長指示2026-10-20「通信でジュンが い、意識が… と言いながら倒れる」)。 */
export const JUN_COLLAPSE_LINE = 'い、意識が…';

/** 隊を離れる時の一言(表の「一緒にいる」の文言をそのまま使う)。 */
export const JUN_DEPART_LINE = JUN_NPC_LINES.companion[0];

/** カテゴリの文言を1本選ぶ(無い場面は空文字=無言)。 */
export const pickJunLine = (cat: string, rng: () => number = Math.random): string => {
  const v = JUN_NPC_LINES[cat];
  if (!v || v.length === 0) return '';
  return v[Math.min(v.length - 1, Math.floor(rng() * v.length))];
};
