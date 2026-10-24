// オープニングの「たまに画面が乱れる」ホラー演出(社長指示2026-10-19・社長の答え「乱れは曖昧な記憶なので」)。
// 思い出している記憶があやふやになる・欠ける・ずれる。映像機器の故障の記号(走査線・ロールバー・赤青分離・白い帯)は使わない。
// このファイルは**作曲(どの拍で・何を・どの順番で)**だけを持つ純関数。描画は components/OpeningGlitch.tsx。
//
// 【作曲の方針】(クリエイティブ監査2巡目)
// - 主要な拍(廊下の台詞・パン!・カット2回・山場・暗闇)は道具・順番・時刻を固定で作曲する。乱数は装飾の揺らぎ
//   (ずれ幅・置き場所・濃さ)だけ。
// - 記憶の乱れの時間は 200ms〜1秒。道具ごとに長さを変える(人が抜ける 400〜700ms・止まるは1回だけ 250〜400ms)。
//   2〜3コマの細かい刻みは1拍につき1か所までのアクセント。
// - 道具の入りは 100〜300ms ずつ順番に(色が抜け始める→他の人が薄れる→色が戻っても残像だけ残る)。
// - 慣性: 入りは 60〜150ms の ease-in で沈め、戻りは長めの ease-out。「気づいたら戻っている」を狙う瞬時の戻りは
//   暗闇の拍の閃き1か所だけ(instantOut)。
// - 段階は「何が乱れるか」で上げる: 背景(色・溶け)→(空振り)→主人公本人→時間(止まる)→他人→全部。
// - 射撃シーンは乱さない(ここに予定が無い)。蘇生は字幕だけ(planRevivalGlitches)。

export type GlitchSegment = 'off' | 'walk' | 'arena' | 'shoot' | 'revival';
export type Rng = () => number;
export const FRAME_MS = 1000 / 60;

/** 何が乱れるか(段階の物差し) */
export type Subject = 'bg' | 'none' | 'hero' | 'time' | 'others' | 'all' | 'dark';

export type Act =
  /** 夢の中の動き(粒・呼吸・光・紙吹雪・カメラ)と、廊下では主人公・カメラも止まる。終わりで止まった分だけ先へ跳ぶ */
  | { tool: 'freeze'; at: number; hold: number }
  /** 記憶が褪せる: 彩度を落とし黒を持ち上げる(コントラストが抜ける)。持ち上げの色は作品の光(廊下=灯りの琥珀/アリーナ=紫) */
  | { tool: 'cold'; at: number; in: number; hold: number; out: number; depth: number }
  /** 主人公の色だけが抜ける */
  | { tool: 'drain'; at: number; in: number; hold: number; out: number; /** 色が抜けている間ずっと、画面全体がガクガクと飛ぶ(1コマずつの位置 px と長さ ms。長さの合計=hold)。テープが噛んだような音が同じ刻みで鳴る */ jitter?: readonly { dx: number; dy: number; ms: number }[] }
  /** 人が抜ける: face=顔が柔らかい楕円で抜ける(顔が思い出せない)/fade=その人が薄れる */
  | { tool: 'missing'; at: number; in: number; hold: number; out: number; mode: 'face' | 'fade'; who: 'hero' | 'others'; floor: number }
  /** 残像: 1人だけ。world=その場に置き去り(歩き去る本人との距離=時間の経過)/screen=画面に固定(寄るカメラに置いていかれる) */
  | { tool: 'ghost'; at: number; out: number; who: 'hero'; anchor: 'world' | 'screen'; op: number }
  /** 背景の細部が溶けて、下へ垂れながら広がって消える */
  | { tool: 'melt'; at: number; in: number; hold: number; out: number; place: 'feet' | 'audience'; jx: number }
  /** 記憶の位置がずれる: 柔らかい縁の帯の中だけ横へ流れて戻る(思い違えて思い直す)。人物は避ける */
  | { tool: 'slice'; at: number; in: number; hold: number; out: number; dx: number; place: 'above' | 'below'; jy: number }
  /** 前の場面が残る: take で写し取り(カットの1コマ前)、at から薄れていく */
  | { tool: 'sceneGhost'; at: number; take: number; out: number; op: number; instantOut?: boolean }
  /** 縁が赤く中心が抜ける(蘇生場面と同じ絵・同じ鼓動)。絵のある所に合わせる */
  | { tool: 'red'; at: number; in: number; out: number };

export interface Bgm { dip: number; in: number; hold: number; out: number; rate?: number }
export interface Beat {
  name: string;
  subject: Subject;
  /** アリーナ=アリーナ開始からの時刻 / 廊下=アンカー(台詞)からの遅れ */
  at: number;
  /** 廊下の拍のアンカー: 台詞 line が出た時(そこからの遅れが at) */
  anchor?: { line: number; on: 'show' };
  acts: Act[];
  bgm: Bgm | null;
}

const range = (rng: Rng, a: number, b: number) => a + (b - a) * rng();
const sign = (rng: Rng) => (rng() < 0.5 ? -1 : 1);
const F = Math.round(FRAME_MS);

/** 道具1つの始まりと終わり(拍の中の ms) */
export const actStart = (a: Act): number => (a.tool === 'sceneGhost' ? Math.min(a.take, a.at) : a.at);
export const actEnd = (a: Act): number => {
  switch (a.tool) {
    case 'freeze': return a.at + a.hold;
    case 'ghost': case 'sceneGhost': return a.at + a.out;
    case 'red': return a.at + a.in + a.out;
    default: return a.at + a.in + a.hold + a.out;
  }
};
/** 見えている長さ(sceneGhost は写し取りから表示までを含めない) */
export const actLen = (a: Act): number => actEnd(a) - a.at;
export const beatSpan = (b: Beat): number => Math.max(0, ...b.acts.map(actEnd));

// ── 廊下(歩き)。台詞 WALK_LINES: 0=さ、いこっか(0.10) / 1=お！主役のお出ましだな！(0.30) / 2=最高のステージ期待してる！(0.50)
//    3=きょ、今日もかわいいですね！(0.70) / 4=みんながアナタを待ってるよ！(0.90)。どれも表示 3600ms。
/**
 * 廊下の作曲。乱数は装飾(濃さ・置き場所)だけ。
 * 台詞は歩き続けると約4秒おきに出て各3.6秒残る=「台詞が消えてから」の空きは0.4秒ほどしか無い。だから全部の拍を
 * **意図した台詞にだけ重ねる**(どの台詞の、出てから何ms後か、で固定)。
 * W1 背景: 「お！主役のお出ましだな！」が出て 900ms 後、主役と呼ばれた瞬間に廊下の色が褪せ、彼女の足元の床が溶けて垂れる。
 * W2 空振り: 「最高のステージ期待してる！」が出て 1200ms 後、BGM だけが遠のいて、何も起きない。
 * W3 主人公: 「今日もかわいいですね」が出て 900ms 後、主人公の色だけが抜ける。
 * W4 時間: 「アナタを待ってるよ」が出て 1800ms 後(読み終わってから)、主人公の顔が抜け→時間が止まり→
 *    動き出しても止まった所に彼女の姿だけが置き去りになって薄れる。BGM が遠のく。
 */
/**
 * W3(色抜け)の画面の飛び方。1コマずつ [横px, 縦px, 長さms]。長さの合計=色抜けの長さ(450ms)。
 * テープのトラッキング乱れの文法: 横に大きく裂ける→細かい痙攣→いったん元に戻る(偽の回復・音も止む)→縦に1回ロールして張り付く→ばらけて戻る。
 * 斜めの小刻みな往復(手ブレ・地震に見える)にしない。縦はロールの1回だけ。
 */
export const W3_JITTER: readonly { dx: number; dy: number; ms: number }[] = [
  { dx: 34, dy: 0, ms: 50 }, { dx: -6, dy: 0, ms: 17 }, { dx: 28, dy: 2, ms: 17 }, { dx: 0, dy: 0, ms: 70 },
  { dx: -26, dy: -48, ms: 133 }, { dx: 10, dy: 0, ms: 17 }, { dx: -4, dy: 0, ms: 33 }, { dx: 18, dy: 0, ms: 50 }, { dx: -3, dy: 0, ms: 63 },
];
export const planWalkBeats = (rng: Rng): Beat[] => [
  {
    name: 'W1', subject: 'bg', at: 900, anchor: { line: 1, on: 'show' },
    acts: [
      { tool: 'cold', at: 0, in: 140, hold: 320, out: 540, depth: +range(rng, 0.5, 0.6).toFixed(2) },
      { tool: 'melt', at: 220, in: 150, hold: 220, out: 520, place: 'feet', jx: +range(rng, -0.4, 0.4).toFixed(2) },
    ],
    bgm: { dip: 0.18, in: 120, hold: 260, out: 560 },
  },
  { name: 'W2', subject: 'none', at: 1200, anchor: { line: 2, on: 'show' }, acts: [], bgm: { dip: 0.14, in: 150, hold: 200, out: 650 } },
  {
    name: 'W3', subject: 'hero', at: 900, anchor: { line: 3, on: 'show' },
    // 色抜けはブツっと入ってブツっと戻す(社長指示2026-10-24「もっとブツっと切らないと、フワッとセピアになっても地味」)。
    // 色が抜けている間ずっと画面がガクガク飛び、色が戻る瞬間に元の位置へ戻る(社長指示2026-10-24「カメラズレ、もっとわかりやすく。
    // セピアとカメラズレを合わせて。画面がバグった感」)。刻みは不揃い・振れ幅も不揃い(機械的な等間隔にしない)。
    acts: [{ tool: 'drain', at: 0, in: 0, hold: 450, out: 0, jitter: W3_JITTER }],
    bgm: { dip: 0.22, in: 120, hold: 380, out: 700 },
  },
  {
    name: 'W4', subject: 'time', at: 1800, anchor: { line: 4, on: 'show' },
    acts: [
      { tool: 'missing', at: 0, in: 150, hold: 300, out: 250, mode: 'face', who: 'hero', floor: 0 },
      { tool: 'freeze', at: 150, hold: 300 },
      { tool: 'ghost', at: 450, out: 820, who: 'hero', anchor: 'world', op: +range(rng, 0.5, 0.58).toFixed(2) },
    ],
    bgm: { dip: 0.45, in: 150, hold: 520, out: 760 },
  },
];
/** 立ち止まっている時の「忘れた頃の1回」(背景だけ・弱い)。打ち止めは IDLE_MAX 回。 */
export const IDLE_MAX = 2;
export const planWalkIdleWait = (rng: Rng): number => Math.round(range(rng, 14000, 20000));
export const planWalkIdleBeat = (rng: Rng): Beat => ({
  name: 'Widle', subject: 'bg', at: 0,
  acts: [{ tool: 'melt', at: 0, in: 150, hold: 200, out: 500, place: 'feet', jx: +range(rng, -0.5, 0.5).toFixed(2) }],
  bgm: { dip: 0.1, in: 120, hold: 150, out: 500 },
});

// ── アリーナ(時刻はアリーナ開始から) ──
export interface ArenaTimes { panMs: number; cuts: readonly number[]; blackStartMs: number; sceneStartMs: number }
/**
 * アリーナの作曲。
 * A1 時間: パン!の1コマ後、紙吹雪の噴き上げごと時間が 320ms 止まる(BGM はまだ鳴っていない)。
 * A2 他人(カット1): 前のアングルが写し取られて新しいアングルの上に残り薄れる→脇の2人が薄れる。
 * A3 主人公(カット2): 前のアングルが残る→客席/天井の帯が流れてずれて戻る→主人公の顔が抜ける。
 * A4 山場(暗転前の全明るさ): 紙吹雪が止まる→色が抜け始める→脇の2人が消える→主人公の残像だけが寄るカメラに
 *    置いていかれる→戻る(約1秒)。BGM が遠のき、音程がごくわずかによれる(音程はここだけ)。
 * A5 暗闇: 射撃シーンへの切替の直前、暗闇の縁が赤く鼓動し(蘇生場面と同じ絵)、その頂点で最後の絵が2コマだけ閃く。
 */
export const planArenaBeats = (rng: Rng, t: ArenaTimes): Beat[] => {
  const [c1, c2] = t.cuts;
  const climaxAt = t.blackStartMs - 1150;
  return [
    { name: 'A1', subject: 'time', at: t.panMs + F, acts: [{ tool: 'freeze', at: 0, hold: 320 }], bgm: null },
    {
      name: 'A2', subject: 'others', at: c1 - F,
      acts: [
        { tool: 'sceneGhost', take: 0, at: 2 * F, out: 700, op: +range(rng, 0.38, 0.45).toFixed(2) },
        { tool: 'missing', at: 2 * F + 250, in: 120, hold: 230, out: 350, mode: 'fade', who: 'others', floor: 0.25 },
      ],
      bgm: { dip: 0.2, in: 120, hold: 220, out: 520 },
    },
    {
      name: 'A3', subject: 'hero', at: c2 - F,
      acts: [
        { tool: 'sceneGhost', take: 0, at: 2 * F, out: 620, op: +range(rng, 0.36, 0.42).toFixed(2) },
        { tool: 'slice', at: 2 * F + 200, in: 150, hold: 160, out: 380, dx: Math.round(sign(rng) * range(rng, 14, 24)), place: rng() < 0.5 ? 'above' : 'below', jy: +range(rng, 0.35, 0.65).toFixed(2) },
        { tool: 'missing', at: 2 * F + 420, in: 150, hold: 250, out: 300, mode: 'face', who: 'hero', floor: 0 },
      ],
      bgm: { dip: 0.3, in: 120, hold: 320, out: 620 },
    },
    {
      name: 'A4', subject: 'all', at: climaxAt,
      acts: [
        { tool: 'freeze', at: 0, hold: 350 },
        { tool: 'cold', at: 150, in: 120, hold: 300, out: 450, depth: +range(rng, 0.78, 0.88).toFixed(2) },
        { tool: 'missing', at: 300, in: 120, hold: 240, out: 340, mode: 'fade', who: 'others', floor: 0.04 },
        { tool: 'ghost', at: 450, out: 560, who: 'hero', anchor: 'screen', op: +range(rng, 0.5, 0.58).toFixed(2) },
      ],
      bgm: { dip: 0.5, in: 120, hold: 420, out: 720, rate: 0.97 },
    },
    {
      name: 'A5', subject: 'dark', at: t.sceneStartMs - 860,
      acts: [
        { tool: 'red', at: 0, in: 300, out: 500 },
        // 「気づいたら戻っている」を狙う唯一の瞬時の戻り(2コマで消える閃き)。
        { tool: 'sceneGhost', take: 300, at: 300, out: 2 * F, op: +range(rng, 0.3, 0.38).toFixed(2), instantOut: true },
      ],
      bgm: { dip: 0.3, in: 150, hold: 200, out: 500 },
    },
  ];
};

/** 撮影用(?opglitch=1): 出しっぱなしにする道具 */
export type HoldTool = 'cold' | 'drain' | 'face' | 'fade' | 'ghost' | 'melt' | 'slice' | 'red';
export const HOLD_DEFAULT: HoldTool[] = ['ghost', 'face', 'melt', 'slice'];

/**
 * 蘇生処置の字幕で乱す行(1〜2行・台本の中盤〜終盤から)。offsetMs=その行が出てからの時刻、durMs=乱れの長さ。
 * 字幕のフェードイン(260ms)が明けてから、行が消える前に終わる。2行のときは隣り合わせない。
 * (社長の答え「字幕はそのまま」= v1 の作りのまま)
 */
export const planRevivalGlitches = (rng: Rng, lines: readonly { minDurationMs: number }[]): { line: number; offsetMs: number; durMs: number }[] => {
  const n = lines.length;
  if (n === 0) return [];
  const lo = Math.min(n - 1, Math.floor(n * 0.4));
  const pool = Array.from({ length: n - lo }, (_, i) => lo + i);
  const pick = (cands: number[]) => cands[Math.floor(rng() * cands.length) % cands.length];
  const first = pick(pool);
  const picked = [first];
  if (rng() < 0.5) {
    const rest = pool.filter(i => Math.abs(i - first) >= 2);
    if (rest.length) picked.push(pick(rest));
  }
  return picked.sort((a, b) => a - b).map(line => {
    const len = lines[line].minDurationMs;
    const durMs = Math.round(range(rng, 150, 230));
    const lo2 = Math.min(320, Math.max(0, len - durMs - 120));
    const hi2 = Math.max(lo2, len * 0.7 - durMs);
    return { line, offsetMs: Math.round(range(rng, lo2, hi2)), durMs };
  });
};
