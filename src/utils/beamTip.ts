// レーザーの先端の絵(絵だけ・判定ゼロ)。社長 2026-11-12「金環などのレーザー周りの表現…先端のちぎれ方が雑」。
// 本体(芯と光の帯の長方形)は今のまま、最後の区間だけを**ドットの段で細らせ・薄くし**(幅 100%→70%→40%→1ドット、
// 最後の2段はドットを1つおきに抜く点線)、先端そのものが1ドットずつ伸び縮みして、**縮んだ瞬間にその1ドットが粒として
// ちぎれて離れる**。粒は「生まれた回」から決まる(毎フレーム乱数を引かない=同じ時刻なら同じ絵・時刻が進むと流れ続ける)。
// 粒は**生まれた時の射線の向きと端の位置**で世界座標を飛ぶ(射線を振っても置いていかれる=慣性)。
// 段も粒も**世界の原点基準の1ドット格子**へ丸める(斜めでもドットの段に見える・粒と食い違わない)。
// 純関数のみ(PixiJS を import しない)。描画は pixiScene.drawBeamTip。
//
// 距離は「根元から射線に沿った距離 s(px)」と「射線から横へのずれ l(px)」。len=判定の端までの距離。
// 置き方: 'inside'=細りを判定の端の内側で終える(見た目の長さは変わらない・プレイヤー側の光線)/
//         'outside'=判定の端までは今の太さのまま、細りを外へ足す(危険を伝える絵=敵の光線に使う時の掟)。

/** 段の幅(本体の幅に対する割合)。最後の 0 は「1ドット」。 */
export const BEAM_TIP_FRACS: readonly number[] = [1, 0.7, 0.4, 0];
/** 段の長さの配分(長い・短いを混ぜる)。境目は光線ごとの種で ±1ドット揺らす。 */
export const BEAM_TIP_STEP_WEIGHTS: readonly number[] = [0.42, 0.14, 0.32, 0.12];
/** 段ごとの濃さ(本体の濃さに対する割合)。 */
export const BEAM_TIP_HALO_ALPHA: readonly number[] = [1, 0.8, 0.55, 0.3];
export const BEAM_TIP_CORE_ALPHA: readonly number[] = [1, 0.9, 0.7, 0.45];
/** この段番号から先は点線(ドットを1つおきに抜く)。 */
export const BEAM_TIP_DITHER_FROM = 2;
/** 細る区間の長さ=光の帯の幅の何倍か。 */
export const BEAM_TIP_LEN_MUL = 2.5;
/** 芯が光の帯より先へ届くドット数。 */
export const BEAM_TIP_CORE_REACH_DOTS = 2;
/** 先端の伸び縮みの周期(ms・光線ごとに種で決まる)。縮む瞬間に1ドットがちぎれる。 */
export const BEAM_TIP_PULSE_MIN_MS = 80;
export const BEAM_TIP_PULSE_MAX_MS = 150;
/** 粒の寿命(ms)。 */
export const BEAM_TIP_LIFE_MIN_MS = 350;
export const BEAM_TIP_LIFE_MAX_MS = 650;
/** 1本あたりの上限(=描画側のプールの枚数)。 */
export const BEAM_TIP_PARTICLE_MAX = 20;
export const BEAM_TIP_HALO_CELL_MAX = 48;
export const BEAM_TIP_CORE_CELL_MAX = 32;
/** 粒の濃さの上限: 帯の色の粒=帯の濃さ×0.9 / 芯の色の粒=0.7。 */
export const BEAM_TIP_HALO_PARTICLE_MUL = 0.9;
export const BEAM_TIP_CORE_PARTICLE_CAP = 0.7;

export type BeamTipPlacement = 'inside' | 'outside';

export interface BeamTipInput {
  /** 根元から判定の端までの距離(px)。 */
  len: number;
  /** 光の帯・芯の全幅(px・出現の係数を掛けた後=本体と同じ値)。 */
  haloW: number; coreW: number;
  /** 光の帯・芯の濃さ(出現/消滅の係数込み=本体と同じ値)。 */
  haloAlpha: number; coreAlpha: number;
  /** 1ドットの大きさ(world px)。 */
  dot: number;
  /** 時刻(ms・gameTime)。 */
  time: number;
  /** 光線ごとの種。 */
  seed: number;
  placement: BeamTipPlacement;
}

/** 段の1つ(根元からの距離 s0→s1・全幅 w・射線からの中心のずれ off・濃さ・点線か)。 */
export interface BeamTipSeg { s0: number; s1: number; w: number; off: number; alpha: number; dither: boolean }

export interface BeamTipLayout {
  /** 細る区間の長さ。 */
  L: number;
  /** 本体の長方形の長さ(根元から)。 */
  haloBodyLen: number; coreBodyLen: number;
  halo: BeamTipSeg[]; core: BeamTipSeg[];
  /** 芯の先(伸びている1ドットを含まない)。 */
  tipEnd: number;
  /** 先端の伸び縮みの周期と位相(ms)。 */
  pulseMs: number; phaseMs: number;
  /** いま先端が1ドット伸びているか。 */
  extended: boolean;
}

/** 世界の格子へ丸めた四角(左上 x,y・幅 w・高さ h・濃さ)。 */
export interface BeamTipCell { x: number; y: number; w: number; h: number; alpha: number }

/** ちぎれた粒(世界の格子へ丸めた左上 x,y・一辺 size・濃さ・芯の色か・生まれた時刻・寿命のどこか)。 */
export interface BeamTipParticle { x: number; y: number; size: number; alpha: number; core: boolean; bornAt: number; u: number }

/** 粒が生まれた時の光線の姿(根元・向きの単位ベクトル・判定の端までの距離)。 */
export interface BeamTipOrigin { ax: number; ay: number; ux: number; uy: number; len: number }

const hash01 = (a: number, b: number, c: number): number => {
  let h = Math.imul(a + 0x3c6e, 0x85ebca6b) ^ Math.imul(b + 0x51f1, 0xc2b2ae35) ^ Math.imul(c + 0x2545f491, 0x27d4eb2f);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

/** 光線の id(文字列)から種を作る(同じ id なら同じ種)。 */
export const beamTipSeed = (id: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) % 100000;
};

/**
 * 細る区間の段。幅と濃さは段ごとに単調に落ちる(増えない)。中心は段ごとに 0〜±1ドット(種で)ずれる=片側が先に欠ける。
 * salt=帯と芯で別の揺らぎにするための値。
 */
export const beamTipSegments = (
  s0: number, s1: number, fullW: number, dot: number, alpha: number, alphaSteps: readonly number[], seed: number, salt: number,
): BeamTipSeg[] => {
  const out: BeamTipSeg[] = [];
  const L = s1 - s0;
  if (!(L > 0) || !(fullW > 0) || !(dot > 0)) return out;
  let acc = 0;
  let prevB = s0;
  let prevW = Infinity;
  const n = BEAM_TIP_FRACS.length;
  for (let j = 0; j < n; j++) {
    acc += BEAM_TIP_STEP_WEIGHTS[j];
    const jitter = Math.floor(hash01(seed, salt, 10 + j) * 3) - 1; // -1/0/+1 ドット
    const b = j === n - 1 ? s1 : Math.max(prevB, Math.min(s1, s0 + (Math.round((L * acc) / dot) + jitter) * dot));
    const f = BEAM_TIP_FRACS[j];
    const q = f === 0 ? dot : Math.max(dot, Math.round((fullW * f) / dot) * dot);
    const w = Math.min(q, fullW, prevW); // 本体より太くしない(出現の立ち上がり中も)・前の段より太くしない
    prevW = w;
    const room = Math.floor(Math.max(0, (fullW - w) / 2) / dot) * dot; // 本体の帯の外へは出さない
    const want = j === 0 ? 0 : (Math.floor(hash01(seed, salt, 20 + j) * 3) - 1) * dot;
    const off = Math.max(-room, Math.min(room, want));
    if (b - prevB > 1e-6) out.push({ s0: prevB, s1: b, w, off, alpha: alpha * alphaSteps[j], dither: j >= BEAM_TIP_DITHER_FROM });
    prevB = b;
  }
  return out;
};

/** 先端の段の並び(1フレームぶん)。濃さの係数が0なら段は空。 */
export const beamTipLayout = (p: BeamTipInput): BeamTipLayout => {
  const { len, haloW, coreW, dot } = p;
  const seed = Math.floor(p.seed) | 0;
  const pulseMs = BEAM_TIP_PULSE_MIN_MS + (BEAM_TIP_PULSE_MAX_MS - BEAM_TIP_PULSE_MIN_MS) * hash01(seed, 0, 1);
  const phaseMs = hash01(seed, 0, 2) * pulseMs;
  const L0 = len > 0 && dot > 0 ? Math.max(dot * 4, Math.round((haloW * BEAM_TIP_LEN_MUL) / dot) * dot) : 0;
  const L = p.placement === 'inside' ? Math.min(L0, Math.max(0, len) * 0.4) : L0;
  const hS0 = p.placement === 'inside' ? Math.max(0, len) - L : Math.max(0, len);
  const hS1 = hS0 + L;
  const cS0 = hS0 + L * 0.5; // 芯は帯より遅く細り始め、帯より少し先まで届く
  const cS1 = hS1 + dot * BEAM_TIP_CORE_REACH_DOTS;
  const cyc = Math.floor((p.time - phaseMs) / pulseMs);
  const extended = p.time - phaseMs - cyc * pulseMs < pulseMs / 2;
  const base = { L, haloBodyLen: hS0, coreBodyLen: cS0, tipEnd: cS1, pulseMs, phaseMs, extended };
  if (!(len > 0) || !(dot > 0) || (p.haloAlpha <= 0.001 && p.coreAlpha <= 0.001)) return { ...base, halo: [], core: [] };
  const halo = p.haloAlpha > 0.001 ? beamTipSegments(hS0, hS1, haloW, dot, p.haloAlpha, BEAM_TIP_HALO_ALPHA, seed, 1) : [];
  const core = p.coreAlpha > 0.001 ? beamTipSegments(cS0, cS1, coreW, dot, p.coreAlpha, BEAM_TIP_CORE_ALPHA, seed, 2) : [];
  // 伸びている間だけ、最後の段の先に1ドット(縮む瞬間にこれが粒として離れる)。点線にしない。
  const last = core[core.length - 1];
  if (extended && last) core.push({ s0: cS1, s1: cS1 + dot, w: dot, off: last.off, alpha: last.alpha, dither: false });
  return { ...base, halo, core };
};

/**
 * 段を世界の格子のドットへ置く。射線上を半ドット刻みで歩き、各点の断面(幅 w)を半ドット刻みで格子へ落とす(重複は1つ)。
 * 点線の段は (gx+gy) が奇数のドットを抜く。最後に縦に続く同じ濃さのドットを1枚の四角にまとめる(水平の光線は1列1枚)。
 */
export const beamTipCells = (
  ax: number, ay: number, ux: number, uy: number, segs: readonly BeamTipSeg[], dot: number, max: number,
): BeamTipCell[] => {
  const nx = -uy, ny = ux;
  const grid = new Map<number, Map<number, number>>(); // gx -> (gy -> alpha)
  const st = dot / 2;
  for (const g of segs) {
    if (g.alpha <= 0.001) continue;
    const half = g.w / 2;
    for (let s = g.s0 + st / 2; s < g.s1; s += st) {
      for (let l = g.off - half + st / 2; l < g.off + half; l += st) {
        const gx = Math.floor((ax + ux * s + nx * l) / dot);
        const gy = Math.floor((ay + uy * s + ny * l) / dot);
        if (g.dither && ((gx + gy) & 1)) continue;
        let col = grid.get(gx);
        if (!col) { col = new Map(); grid.set(gx, col); }
        const prev = col.get(gy);
        if (prev === undefined || g.alpha > prev) col.set(gy, g.alpha);
      }
    }
  }
  const out: BeamTipCell[] = [];
  const gxs = [...grid.keys()].sort((a, b) => a - b);
  for (const gx of gxs) {
    const col = grid.get(gx)!;
    const gys = [...col.keys()].sort((a, b) => a - b);
    let i = 0;
    while (i < gys.length) {
      const a = col.get(gys[i])!;
      let j = i;
      while (j + 1 < gys.length && gys[j + 1] === gys[j] + 1 && col.get(gys[j + 1]) === a) j++;
      if (out.length >= max) return out;
      out.push({ x: gx * dot, y: gys[i] * dot, w: dot, h: (j - i + 1) * dot, alpha: a });
      i = j + 1;
    }
  }
  return out;
};

/** 先端が縮む回 c にちぎれる粒の数(0=出ない間・1・2〜3=塊)。 */
const rawEventCount = (seed: number, c: number): number => {
  const h = hash01(seed, c, 3);
  return h < 0.18 ? 0 : h < 0.55 ? 1 : h < 0.82 ? 2 : 3;
};
export const beamTipEventCount = (seed: number, c: number): number => {
  const n = rawEventCount(seed, c);
  return n === 0 && rawEventCount(seed, c - 1) === 0 ? 1 : n; // 間は1回ぶんだけ(続けて空けない)
};

/**
 * ちぎれた粒(世界座標)。回 c の「縮む瞬間」(位相+c×周期+周期/2)に、伸びていた1ドットの位置で、その段と同じ濃さで生まれる
 * (帯の色の粒は帯の濃さ×0.9)。生まれた時の光線の姿(originAt)で飛ぶので、後で射線が動いても飛んでいる粒は動かない。
 * 濃さはいまの係数(p.coreAlpha / p.haloAlpha)に比例=本体と一緒に消える。
 */
export const beamTipParticles = (
  p: BeamTipInput, originAt: (t: number) => BeamTipOrigin, max = BEAM_TIP_PARTICLE_MAX,
  /** この時刻より前の回は出さない(光線が出る前に生まれた粒を作らない)。 */
  since = -Infinity,
): BeamTipParticle[] => {
  const out: BeamTipParticle[] = [];
  const { dot } = p;
  if (!(dot > 0) || (p.haloAlpha <= 0.001 && p.coreAlpha <= 0.001)) return out;
  const seed = Math.floor(p.seed) | 0;
  const now = beamTipLayout(p);
  const P = now.pulseMs;
  const coreA0 = Math.min(BEAM_TIP_CORE_PARTICLE_CAP, p.coreAlpha * BEAM_TIP_CORE_ALPHA[BEAM_TIP_CORE_ALPHA.length - 1]);
  const haloA0 = p.haloAlpha * BEAM_TIP_HALO_PARTICLE_MUL;
  const cNow = Math.floor((p.time - now.phaseMs - P / 2) / P);
  const cMin = Math.floor((p.time - now.phaseMs - P / 2 - BEAM_TIP_LIFE_MAX_MS) / P);
  for (let c = cNow; c >= cMin && out.length < max; c--) {
    const bornAt = now.phaseMs + c * P + P / 2;
    const age = p.time - bornAt;
    if (age < 0 || bornAt < since) continue;
    const count = beamTipEventCount(seed, c);
    if (count === 0) continue;
    const o = originAt(bornAt);
    const at = beamTipLayout({ ...p, len: o.len, time: bornAt - P / 4 }); // 生まれる直前(伸びていた時)の並び
    const lastCore = at.core.length >= 2 ? at.core[at.core.length - 2] : at.core[0];
    const sBirth = at.tipEnd + dot / 2;
    const lBirth = lastCore ? lastCore.off : 0;
    const nx = -o.uy, ny = o.ux;
    for (let m = 0; m < count && out.length < max; m++) {
      const r = (k: number) => hash01(seed * 31 + m, c, k);
      const life = BEAM_TIP_LIFE_MIN_MS + (BEAM_TIP_LIFE_MAX_MS - BEAM_TIP_LIFE_MIN_MS) * r(4);
      if (age >= life) continue;
      const u = age / life;
      const core = m === 0 || r(5) < 0.4; // 1粒目=伸びていた芯の1ドットそのもの
      const kexp = 1.8 + 2.2 * r(6); // 減速の強さは粒ごと
      const travel = 1 - Math.pow(1 - u, kexp);
      const reach = now.L * (0.6 + 1.4 * r(7));
      const lat0 = lBirth + (m === 0 ? 0 : (r(8) - 0.5) * dot);
      const side = lat0 > 0.01 ? 1 : lat0 < -0.01 ? -1 : (r(9) < 0.5 ? -1 : 1);
      const lat = lat0 + side * dot * r(10) * travel; // 外へ広がる向きに 0〜1ドット流れる
      const size = m > 0 && r(11) < 0.5 && u < 0.6 && p.haloW >= dot * 2 ? dot * 2 : dot;
      const a0 = core ? coreA0 : haloA0;
      const alpha = a0 * Math.pow(1 - u, 1.4); // 生まれた瞬間=本体の段と同じ濃さ(出だしのフェードは無い)
      if (alpha <= 0.005) continue;
      const s = sBirth + reach * travel;
      const wx = o.ax + o.ux * s + nx * lat, wy = o.ay + o.uy * s + ny * lat;
      out.push({ x: Math.round((wx - size / 2) / dot) * dot, y: Math.round((wy - size / 2) / dot) * dot, size, alpha, core, bornAt, u });
    }
  }
  return out;
};
