// プレイヤーの刀(刀/小烏丸)の斬撃の絵=社長支給の横並び3コマ(fx/katana-slash-sheet・378×34・青白い横一文字)。
// 左から「細い1本線(出)→一番太く飛沫が多い(振り切り)→散りかけ(余韻)」。
// コマは素材の等間隔のセル(378÷3=126px 幅・高さ34)のまま切る=作り手のコマごとの位置合わせ(高さ・幅の違い)を生かす。
// 刃筋は +x 向き(左=尾・右=刃先)として扱う。
// 描画は pixiScene が読むだけ(判定・射程・タイミングには関わらない=派手さの絵)。

export const KATANA_SLASH_SHEET_TEX = 'fx/katana-slash-sheet';

/** 素材のセルの寸法(等間隔)。 */
export const KATANA_SLASH_CELL_W = 126;
export const KATANA_SLASH_CELL_H = 34;
export const KATANA_SLASH_CELLS = 3;

/** 振り切りのコマでも主人公を覆う帯にしない太さの上限(ワールドpx)。縦の倍率はこれに収まる整数にする。 */
export const KATANA_SLASH_THICK_CAP = 40;

/**
 * 最近傍で描く時の倍率=整数(ドットを割らない)。長さ(横)は狙いの長さに近い整数、
 * 太さ(縦)は横と同じ整数を上限に KATANA_SLASH_THICK_CAP へ収める(長さを足す時は細い線の側で稼ぐ)。
 */
export const katanaSlashIntScale = (wantLen: number): { kx: number; ky: number } => {
  const kx = Math.max(1, Math.round(wantLen / KATANA_SLASH_CELL_W));
  const ky = Math.max(1, Math.min(kx, Math.floor(KATANA_SLASH_THICK_CAP / KATANA_SLASH_CELL_H)));
  return { kx, ky };
};

/** 刀の技ごとの絵の種類(尺の割合・上下の反転に使う)。 */
export type KatanaSlashMove = 'swing' | 'issen' | 'tsubame' | 'satsujin' | 'kill';

/** 技ごとの尺の割合: out=出の終わり / hold=振り切りの終わり。喉搔きと一閃は振り切りを長く止め、余韻を短く切る。 */
// 燕返しは一閃と同じ斬撃の見え方(社長指示2026-11-22「燕返しも、ちゃんと一閃の斬撃出して」)。違いは上下の反転(V字=katanaFlip)だけ。
export const KATANA_SLASH_TIMING: Record<KatanaSlashMove, { out: number; hold: number }> = {
  swing: { out: 0.2, hold: 0.55 },
  tsubame: { out: 0.12, hold: 0.82 },
  satsujin: { out: 0.2, hold: 0.55 },
  issen: { out: 0.12, hold: 0.82 },
  kill: { out: 0.12, hold: 0.82 },
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutCubic = (u: number) => 1 - (1 - u) ** 3;

export interface KatanaSlashPose {
  /** 使うコマ(0=出 / 1=振り切り / 2=余韻)。 */
  frame: 0 | 1 | 2;
  /** どちらの端を固定して見せるか。tail=尾を固定して刃先へ伸びる(出) / full=全部 / tip=刃先を固定して尾が追いつく(余韻)。 */
  side: 'tail' | 'full' | 'tip';
  /** 見せる割合(コマの幅に対して・0..1)。 */
  reveal: number;
  alpha: number;
  /** 当たりの光(slash-burst)の育ち 0..1(振り切りに入る瞬間に最大)と濃さ。 */
  burstGrow: number;
  burstAlpha: number;
}

/**
 * 斬撃1本の進行 t(0→1)から絵を決める(慣性MUST)。
 * 出: 尾を固定し、減速しながら刃先へ伸びる。振り切り: 全部を保持。余韻: 刃先を固定し、尾が加速しながら追いついて抜ける。
 */
export const katanaSlashPose = (t: number, move: KatanaSlashMove = 'swing'): KatanaSlashPose => {
  const u = clamp01(t);
  const { out, hold } = KATANA_SLASH_TIMING[move];
  if (u < out) {
    const a = u / out;
    const g = easeOutCubic(a);
    return { frame: 0, side: 'tail', reveal: 0.2 + 0.8 * g, alpha: easeOutCubic(clamp01(a * 2)), burstGrow: g, burstAlpha: 1 };
  }
  if (u < hold) return { frame: 1, side: 'full', reveal: 1, alpha: 1, burstGrow: 1, burstAlpha: 1 };
  const v = clamp01((u - hold) / (1 - hold));
  const e = v * v; // 加速して抜ける
  return { frame: 2, side: 'tip', reveal: Math.max(0.06, 1 - e), alpha: 1 - v * v * v, burstGrow: 1, burstAlpha: (1 - v) * (1 - v) };
};

/** 見せている区間の中心(尾=0・刃先=1 の割合)。当たりの光を刃筋に追従させるのに使う。 */
export const katanaSlashVisibleMid = (pose: Pick<KatanaSlashPose, 'side' | 'reveal'>): number =>
  pose.side === 'tail' ? pose.reveal / 2 : pose.side === 'tip' ? 1 - pose.reveal / 2 : 0.5;

/** 文字列から 0..1 の値を決まった形で取る(1振りごとの揺らぎ・切り傷の散らしに使う)。 */
export const hash01 = (s: string, salt = 0): number => {
  let h = (2166136261 ^ salt) >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

/** 1振りごとの角度の揺らぎ(ラジアン・±5〜8°)。 */
export const katanaSlashJitter = (id: string): number => {
  const mag = (5 + 3 * hash01(id, 1)) * (Math.PI / 180);
  return hash01(id, 2) < 0.5 ? -mag : mag;
};

/**
 * 切り傷(research/KATANA_TSUBAME.md §4)の長さ=敵の**表示している絵の高さ**に比例(雑魚からボスまで同じ割合で体に乗る)。
 * 旧の線(34px上限)がゾンビの絵の高さの約3割だったので、その割合をそのまま全員へ。
 */
export const KATANA_CUT_LEN_FRAC = 0.3;
export const katanaCutLength = (spriteH: number): number => Math.max(8, spriteH * KATANA_CUT_LEN_FRAC);

export interface KatanaCutLayout {
  /** 長さの倍率(0.7〜1.2)。 */
  len: number;
  /** 角度(ラジアン)。「/」寄りを主に、交差する「\」も混ぜる。 */
  ang: number;
  /** 体の絵の中の位置(高さは上端からの割合・横は中心からの幅に対する割合)。 */
  fy: number;
  fx: number;
}

/** 切り傷 i 本目の置き方を敵の id から決まった値で散らす(等差・平行の梯子にしない)。 */
export const katanaCutLayout = (id: string, i: number): KatanaCutLayout => {
  const r = (k: number) => hash01(id, 100 + i * 7 + k);
  const len = 0.7 + 0.5 * r(0);
  const cross = i === 2 || r(1) < 0.25; // 3本目は必ず交差・ほかも時々
  const base = cross ? 0.55 + 0.35 * r(2) : -(0.5 + 0.55 * r(2));
  const fy = 0.24 + 0.14 * i + (r(3) - 0.5) * 0.12;
  const fx = (r(4) - 0.5) * 0.36;
  return { len, ang: base, fy, fx };
};

/** 切り傷が開く尺(刃の向きへ減速しながら開く)と、倒れた時に加速しながら薄くなる尺。 */
export const KATANA_CUT_OPEN_MS = 120;
export const KATANA_CUT_DEATH_FADE_MS = 320;
export const katanaCutOpen = (ageMs: number): number => easeOutCubic(clamp01(ageMs / KATANA_CUT_OPEN_MS));
export const katanaCutDeathAlpha = (sinceDeathMs: number): number => {
  const v = clamp01(sinceDeathMs / KATANA_CUT_DEATH_FADE_MS);
  return 1 - v * v;
};

/** 素材の明るさ(0..1)を、暗いにじみ(約0.35)〜芯(1)の範囲で 0..1 に伸ばす。 */
const stretch = (L: number) => clamp01((L - 0.35) / 0.65);

/**
 * 切り傷の色(赤く染めた写し)。縁=黒→濡れた暗い赤、芯=暗い血の色(上限 約160,15,15)。
 * 赤い予告(明るい赤)と明るさでも見分けられる。素材は青いので乗算の tint では赤くならない=写しを焼く。
 */
export const katanaCutRgb = (L: number): [number, number, number] => {
  const l = stretch(L);
  return [Math.round(14 + 146 * Math.pow(l, 0.85)), Math.round(2 + 13 * l), Math.round(2 + 13 * l)];
};

/** 殺陣の白い筋(画面を覆う赤の上)用の白い写し。色は白、暗いにじみほど透明にする(alpha 倍率を返す)。 */
export const katanaWhiteRgba = (L: number): [number, number, number, number] => {
  const l = stretch(L);
  return [255, 255, 255, Math.pow(l, 1.4)];
};
