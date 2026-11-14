// ★撃たれた時の押し戻し(社長指示2026-10-20「ステージ2のアイドルや塊は撃たれても反応するようにして」)。
//
// アイドル(手で描いたシートで動く)と変異塊(本体は敵配列の外・弾は代理が受ける)は、弾が当たっても
// 体が持っていかれる手応えが無かった(ボス級は弾でノックバックしない・しなりの強さも下限に張り付く)。
// ここでは**描画の位置だけ**を、弾の進む向きへ押して戻す。シート絵を伸ばす/縮める/回す(=歪み)は使わない。
//
// 動きの作り(品質/クリエイティブ監査 2026-10-20・2巡):
// - **1発の弾=衝撃**。1発ごとに速さを足し、ばね+減衰で戻す。連射では押しが積もり、上限(maxPx)で柔らかく頭打ち。
//   1発ごとの小さなガクッは残る。逆向きの弾は速さが打ち消し合って0へ寄る(左右から撃たれても暴れない)。
// - **継続して当たるもの(火炎・光線(アイレーザー)・金環のレーザー・塊弾の脈)=押し続ける力**。当たっている間は
//   ばねの釣り合い点が後ろへずれて下がって居座り、細かい震えが少し乗る。止んだらばねで戻る。
// - 強さは押し戻し専用の曲線 `shotRecoilStrength`(√(ダメージ/14)・上限3)。怯みの窓口(hitFlinch・上限1)とは別。
//   同じ処理で同じ敵へ当たった粒(散弾)はダメージを足してから曲線に通す=粒の数で得をしない。重い1発ほど大きく持っていかれる。
// - 型ごとに動き方を分ける: アイドル=短く鋭く、行き過ぎなしで硬く止まる(臨界減衰)。
//   変異塊=1発では数pxの身震い(速い小さな揺れ)、積もった時だけ大きく下がる(遅いばね)。動き出しに質量の遅れ、
//   戻りで少し行き過ぎて前へのめる(押し返されても振り払って迫る)。
// - 判定・当たり箱・移動は変えない。呼び手が絵の位置と、体ごと押される物(影・手に持つ銃・ランタン)に足す。
//   影には「体ごと下がる」成分(bodyMode)だけを足し、速い身震い・震えは本体とランタンだけ。
// - ここは純関数だけ(store・Pixi 非依存)。打刻は store(弾の当たり処理)、動きを回すのは pixiScene。
import type { Enemy, EnemyType } from '../types/game';

/** 撃たれた時の押し戻しを持つ型: ステージ2のアイドルと、変異塊の代理(`lab-crawler`)だけ。他の敵には出さない。 */
export const hasShotRecoil = (t: EnemyType): boolean => t === 'idol' || t === 'lab-crawler';

/** 押し戻しの強さ: √(ダメージ/14)、上限3(14=序盤の近接1振りで1)。拳銃(9)≈0.80 / ハンドキャノン(31)≈1.49 / 狙撃(100)≈2.67。 */
export const SHOT_RECOIL_STRENGTH_DMG = 14;
export const SHOT_RECOIL_STRENGTH_MAX = 3;
export const shotRecoilStrength = (damage: number | undefined): number =>
  Math.min(SHOT_RECOIL_STRENGTH_MAX, Math.sqrt(Math.max(0, damage ?? 0) / SHOT_RECOIL_STRENGTH_DMG));

// ------------------------------------------------------------ 打刻(store 側)

/** 同じ処理で同じ敵へ当たった弾の集計(向きはダメージで重みづけして足す)。stream=継続して当たるもの。 */
export interface ShotHitAcc { dx: number; dy: number; dmg: number; stream: boolean; px?: number; py?: number }

/** 当たりを1つ足す。dir は正規化して dmg で重みづけ。px/py=当たった点(最後のもの)。 */
export const addShotHit = (
  acc: Map<string, ShotHitAcc>, id: string, dirX: number, dirY: number, dmg: number | undefined,
  stream = false, at?: { x: number; y: number },
): void => {
  const len = Math.hypot(dirX, dirY);
  if (!(len > 1e-6)) return;
  const d = Math.max(0, dmg ?? 0);
  const w = d > 0 ? d : 1;
  const cur = acc.get(id) ?? { dx: 0, dy: 0, dmg: 0, stream };
  cur.dx += (dirX / len) * w; cur.dy += (dirY / len) * w; cur.dmg += d;
  cur.stream = cur.stream && stream;
  if (at) { cur.px = at.x; cur.py = at.y; }
  acc.set(id, cur);
};

/** 集計 → 向きつきの強さ(衝撃・力の大きさ=shotRecoilStrength(ダメージの和))。逆向きは打ち消し合う。 */
export const shotHitVector = (h: ShotHitAcc): { x: number; y: number } => {
  const len = Math.hypot(h.dx, h.dy);
  const wsum = h.dmg > 0 ? h.dmg : 1;
  if (!(len > 1e-6)) return { x: 0, y: 0 };
  // 向きの揃い(1=全部同じ向き・0=打ち消し合った)を強さに掛ける。
  const k = shotRecoilStrength(h.dmg) * Math.min(1, len / wsum) / len;
  return { x: h.dx * k, y: h.dy * k };
};

/**
 * 弾の当たりを打刻する(store へ書く前の純関数)。`hasShotRecoil` の型で、**この処理で実際に被弾した**
 * (`lastHit >= since`=弾き・空中の無敵等で無効なら打たない)敵にだけ書く。
 * - 1発の弾: `shotHitAt=lastHit`・`shotImpX/Y`=衝撃・`shotHitPx/Py`=当たった点。
 * - 継続(stream): `shotForceAt=lastHit`・`shotForceX/Y`=押し続ける力(描画は打刻から SHOT_FORCE_HOLD_MS の間効かせる)。
 * 何も書かなければ同じ配列を返す。
 */
export const stampShotHits = (
  enemies: readonly Enemy[], hits: ReadonlyMap<string, ShotHitAcc>, since: number,
): readonly Enemy[] => {
  if (hits.size === 0) return enemies;
  let out: Enemy[] | null = null;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const h = hits.get(e.id);
    if (!h || !hasShotRecoil(e.type) || !(e.lastHit >= since)) continue;
    const v = shotHitVector(h);
    if (v.x === 0 && v.y === 0) continue;
    if (h.stream) {
      if (e.shotForceAt === e.lastHit) continue;
      out ??= enemies.slice();
      out[i] = { ...e, shotForceAt: e.lastHit, shotForceX: v.x, shotForceY: v.y };
    } else {
      if (e.shotHitAt === e.lastHit) continue;
      out ??= enemies.slice();
      out[i] = { ...e, shotHitAt: e.lastHit, shotImpX: v.x, shotImpY: v.y, shotHitPx: h.px, shotHitPy: h.py };
    }
  }
  return out ?? enemies;
};

// ------------------------------------------------------------ 動き(描画側)

/** ばね1本。peakPx=強さ1の衝撃1発で、その成分だけが動いた時の山の高さ(px)。 */
export interface RecoilMode { omega: number; zeta: number; peakPx: number }
export interface RecoilSpec {
  modes: readonly RecoilMode[];
  /** 体ごと下がる成分(影もこれだけ付いてくる)。 */
  bodyMode: number;
  /** 衝撃が体に乗るまでの遅れ(ms・質量)。 */
  delayMs: number;
  /** 押しの上限(px)。積もってもここで柔らかく頭打ち(tanh)。 */
  maxPx: number;
  /** 奥行き(縦)方向の押しの割合。見下ろしの奥行きは縮んで見えるので横より小さく。 */
  yMul: number;
  /** 押し続ける力(強さ1)で、釣り合い点がずれる量(px・bodyMode に掛ける)。 */
  forcePx: number;
  /** 押し続けられている間に乗る細かい震え(px・強さ1)。 */
  tremblePx: number;
}

/**
 * アイドル(人の背丈): 臨界減衰1本=行き過ぎなしで硬く止まる。山まで約40ms・ほぼ300msで止まる。
 * 拳銃1発(強さ0.80)で約8px・ハンドキャノン(1.49)で約14px・狙撃(2.67)は上限近くまで持っていかれる。
 * 火炎・光線を浴び続けると約7〜10px下がって居座る。
 */
export const SHOT_RECOIL_IDOL: RecoilSpec = {
  modes: [{ omega: 26, zeta: 1, peakPx: 10 }],
  bodyMode: 0, delayMs: 0, maxPx: 30, yMul: 0.5, forcePx: 11, tremblePx: 1.6,
};
/**
 * 変異塊(画面幅ほどの巨体): 速い身震い(1発で数px・左右に震えて収まる)+遅いばね(1発ではわずか・連射や重い1発で
 * 大きく下がり、戻りで1割ほど行き過ぎて前へのめる)。動き出しは45ms遅れる(質量)。浴び続けると約14〜20px下がって居座る。
 */
export const SHOT_RECOIL_CRAWLER: RecoilSpec = {
  modes: [{ omega: 38, zeta: 0.28, peakPx: 3.5 }, { omega: 4.2, zeta: 0.55, peakPx: 6 }],
  bodyMode: 1, delayMs: 45, maxPx: 40, yMul: 0.35, forcePx: 20, tremblePx: 2.2,
};
/**
 * アイドルが赤い線(起点=銃口)を出して溜めている間に撃たれた時の、**手に持つ銃だけ**の小刻みな身震い(社長承認2026-10-20)。
 * 体は押さない。速い減衰振動1本で、撃たれた瞬間に立ち上がり、慣性つきで1〜2pxの間を揺れて収まる(上限2px)。
 */
export const SHOT_TREMBLE_IDOL_GUN: RecoilSpec = {
  modes: [{ omega: 60, zeta: 0.22, peakPx: 1.6 }],
  bodyMode: 0, delayMs: 0, maxPx: 2, yMul: 0.6, forcePx: 0, tremblePx: 0,
};
/** 継続の力を、最後の打刻からこの間だけ効かせる(脈の間隔より長く=当たっている間は途切れない)。 */
export const SHOT_FORCE_HOLD_MS = 360;

/** 積分の刻み(ms)。ω=38 でも安定する細かさ。 */
const STEP_MS = 4;
/** 描画が止まっていた等で大きく飛んだら、積分せず静止へ戻す(ms)。 */
const RESET_GAP_MS = 600;
const QUEUE_CAP = 16;
/** 力の入り・抜けのなまし(ms)。 */
const FORCE_RISE_MS = 70;
const FORCE_FALL_MS = 110;

export interface RecoilBody {
  /** 最後に進めた時刻(ms)。0=まだ。 */
  t: number;
  /** 取り込み済みの衝撃の打刻(`shotHitAt`)。 */
  seenAt: number;
  /** 成分ごとの位置・速さ(px・px/s)。 */
  m: { x: number; y: number; vx: number; vy: number }[];
  /** 体に乗る前の衝撃(at=乗り始めてよい時刻・遅れはまだ足していない)。ex/ey=最初の成分(速い身震い)にだけ足す山の高さ(px)。 */
  queue: { at: number; ix: number; iy: number; ex: number; ey: number }[];
  /** 押し続ける力: 向きつきの強さ・効く期限・今の効き(0〜1・なまし済み)。 */
  fx: number; fy: number; fUntil: number; fLevel: number;
}
export const newRecoilBody = (spec: RecoilSpec): RecoilBody => ({
  t: 0, seenAt: 0, m: spec.modes.map(() => ({ x: 0, y: 0, vx: 0, vy: 0 })), queue: [], fx: 0, fy: 0, fUntil: 0, fLevel: 0,
});

const peakCache = new Map<string, number>();
/** 単位の初速で、その成分の位置が最大どこまで行くか(同じ積分で測る=山の高さが peakPx に一致する)。 */
const unitPeak = (md: RecoilMode): number => {
  const key = `${md.omega}:${md.zeta}`;
  const hit = peakCache.get(key);
  if (hit !== undefined) return hit;
  let x = 0, v = 1, peak = 0;
  const dt = STEP_MS / 1000;
  for (let i = 0; i < 2000; i++) {
    v += (-md.omega * md.omega * x - 2 * md.zeta * md.omega * v) * dt;
    x += v * dt;
    if (x > peak) peak = x;
    if (v < 0 && x < peak * 0.5) break;
  }
  const out = Math.max(1e-6, peak);
  peakCache.set(key, out);
  return out;
};

/**
 * 新しい衝撃を取り込む(打刻が取り込み済みより新しい時だけ)。notBefore=これより前には体に乗せない
 * (ヒットストップの明け。止めの間は押しを出さず、明けてから遅れ delayMs ののちに出る)。
 * extraX/Y=同じ衝撃の中で、最初の成分(速い身震い)にだけ足す山の高さ(px)。変異塊の古い怯みを別の曲線で足さず、
 * この1発の衝撃に組み込むのに使う(社長承認2026-10-20)。
 */
export const kickRecoil = (
  b: RecoilBody, hitAt: number | undefined, ix: number | undefined, iy: number | undefined, mul = 1, notBefore = 0,
  extraX = 0, extraY = 0,
): RecoilBody => {
  if (hitAt === undefined || !(hitAt > b.seenAt)) return b;
  const k = Math.max(0, mul);
  const q = b.queue.length >= QUEUE_CAP ? b.queue.slice(1) : b.queue.slice();
  q.push({ at: Math.max(hitAt, notBefore), ix: (ix ?? 0) * k, iy: (iy ?? 0) * k, ex: extraX * k, ey: extraY * k });
  return { ...b, seenAt: hitAt, queue: q };
};

/** 押し続ける力を書き込む(打刻 forceAt から SHOT_FORCE_HOLD_MS の間効く)。 */
export const pushRecoilForce = (
  b: RecoilBody, forceAt: number | undefined, fx: number | undefined, fy: number | undefined, mul = 1,
): RecoilBody => {
  if (forceAt === undefined || forceAt + SHOT_FORCE_HOLD_MS <= b.fUntil) return b;
  const k = Math.max(0, mul);
  return { ...b, fx: (fx ?? 0) * k, fy: (fy ?? 0) * k, fUntil: forceAt + SHOT_FORCE_HOLD_MS };
};

/** now まで進める(ばね+減衰・刻み積分)。衝撃は at+delayMs に達した刻みで速さへ、力は効いている間だけ加速度へ。 */
export const advanceRecoil = (b: RecoilBody, spec: RecoilSpec, now: number): RecoilBody => {
  if (b.t === 0 || now - b.t > RESET_GAP_MS || now < b.t) {
    // 初回・大きな飛び(止まっていた)・時計の巻き戻り: 静止から始める(古い衝撃は捨てる・新しいものは残す)。
    return {
      ...b, t: now, m: spec.modes.map(() => ({ x: 0, y: 0, vx: 0, vy: 0 })), fLevel: 0,
      queue: b.queue.filter(q => q.at + spec.delayMs >= now - STEP_MS),
    };
  }
  if (now === b.t) return b;
  const m = b.m.map(s => ({ ...s }));
  let queue = b.queue;
  let fLevel = b.fLevel;
  const lim = spec.maxPx * 3;
  let t = b.t;
  while (t < now) {
    const step = Math.min(STEP_MS, now - t);
    t += step;
    if (queue.length > 0) {
      const due = queue.filter(q => q.at + spec.delayMs <= t);
      if (due.length > 0) {
        queue = queue.filter(q => q.at + spec.delayMs > t);
        for (const q of due) {
          spec.modes.forEach((md, i) => {
            const v0 = md.peakPx / unitPeak(md);
            m[i].vx += q.ix * v0 + (i === 0 ? q.ex / unitPeak(md) : 0);
            m[i].vy += q.iy * spec.yMul * v0 + (i === 0 ? q.ey * spec.yMul / unitPeak(md) : 0);
          });
        }
      }
    }
    // 力の効き: 期限内は1へ、切れたら0へ(なまして入り・抜けを滑らかに)。
    const want = t < b.fUntil ? 1 : 0;
    fLevel += (want - fLevel) * (1 - Math.exp(-step / (want > fLevel ? FORCE_RISE_MS : FORCE_FALL_MS)));
    const dt = step / 1000;
    spec.modes.forEach((md, i) => {
      const s = m[i];
      const w2 = md.omega * md.omega, c = 2 * md.zeta * md.omega;
      // 押し続ける力は体ごと下がる成分にだけ掛ける: 釣り合い点が forcePx×強さ だけずれる(加速度= ω²×ずれ)。
      const ax = i === spec.bodyMode ? w2 * spec.forcePx * b.fx * fLevel : 0;
      const ay = i === spec.bodyMode ? w2 * spec.forcePx * b.fy * spec.yMul * fLevel : 0;
      s.vx += (-w2 * s.x - c * s.vx + ax) * dt;
      s.vy += (-w2 * s.y - c * s.vy + ay) * dt;
      s.x = Math.max(-lim, Math.min(lim, s.x + s.vx * dt));
      s.y = Math.max(-lim, Math.min(lim, s.y + s.vy * dt));
    });
  }
  return { ...b, t: now, m, queue, fLevel };
};

/**
 * 今の押し(px)。all=全成分+震え(本体・ランタン用)/body=体ごと下がる成分だけ(影用)。
 * 成分の和を上限 maxPx で柔らかく頭打ちにし、体ごとの成分にも同じ縮めを掛ける(影と本体がずれない)。
 */
export const recoilParts = (b: RecoilBody, spec: RecoilSpec): { x: number; y: number; bodyX: number; bodyY: number } => {
  let x = 0, y = 0;
  for (const s of b.m) { x += s.x; y += s.y; }
  // 押し続けられている間の細かい震え(力の向きに沿って・不規則に見えるよう周期の違う2本の和)。
  const fl = Math.hypot(b.fx, b.fy);
  if (b.fLevel > 1e-3 && fl > 1e-6) {
    const tr = spec.tremblePx * Math.min(1.5, fl) * b.fLevel
      * (Math.sin(b.t * 0.071) * 0.6 + Math.sin(b.t * 0.113 + 1.7) * 0.4);
    x += (b.fx / fl) * tr; y += (b.fy / fl) * tr * spec.yMul;
  }
  const mag = Math.hypot(x, y);
  const k = mag > 1e-6 ? (spec.maxPx * Math.tanh(mag / spec.maxPx)) / mag : 1;
  const bm = b.m[spec.bodyMode];
  return { x: x * k, y: y * k, bodyX: (bm?.x ?? 0) * k, bodyY: (bm?.y ?? 0) * k };
};
export const recoilOffset = (b: RecoilBody, spec: RecoilSpec): { x: number; y: number } => {
  const p = recoilParts(b, spec);
  return { x: p.x, y: p.y };
};
