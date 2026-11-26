// ★鞭の作り直し: 絡め取り → 振り回し → 投げつけ(research/WHIP_FOLLOWUP.md §8・社長裁定2026-11-25)。
// 判定だけを置く純関数(store にも描画にも依存しない)。数値は叩き台(実機で詰める)。時計は全部 gameTime(ms)。
//  - 絡め取り: 鞭の振りが当たった中でプレイヤーに一番近い掴める1体(雑魚・強個体)。ボス級は掴まない。
//  - 振り回し: プレイヤーを中心に円を描いて回す。掴んだ位置から回り出し、加速して一定の速さへ(慣性)。触れた別の敵へ1周に1回の当たり。
//    壁・木・建物・帯の縁では着弾せず、回す半径を縮めて手前に留める。
//  - 投げつけ: 出だしが一番速く、少しずつ減速して直進。敵・壁・最大距離で着弾=爆発(§6 の爆発の規約)。
import { pickArrowRainCenter } from './arrowRain';

/** 回す半径=鞭の届く距離 × これ。 */
export const WHIP_SWING_RADIUS_MULT = 0.6;
/** 最高の回転(揺れの真ん中)の1周の長さ(ms)。社長指示2026-11-26「振り回し回数減ってもいいので、もう少し振り回しに慣性入れて」で 450→650。 */
export const WHIP_SWING_PERIOD_MS = 650;
/** 掴んでから最高の回転に届くまで(ms・重さに引かれてゆっくり回り出す=加速の出だしも0)。半径もこの間に掴んだ位置から回す半径へ寄る。旧 250。 */
export const WHIP_SWING_ACCEL_MS = 600;
/** 重さで速さが揺れる幅(割合)。敵がプレイヤーの手前(画面の下)を通る時に速く、奥(上)を通る時に遅い=振り下ろして振り上げる感じ。 */
export const WHIP_SWING_SWAY = 0.3;
/** 自動で投げる前の溜め: 最長の手前これだけ(ms)の間に、速さが一段(SURGE 倍)上がる。上がり切るのに SURGE_RAMP_MS。 */
export const WHIP_SWING_SURGE_LEAD_MS = 450;
export const WHIP_SWING_SURGE_RAMP_MS = 300;
export const WHIP_SWING_SURGE = 1.4;
/** 回る角度を数える刻み(ms・数値の積分)。 */
export const WHIP_SWING_INTEGRATE_MS = 2;
/** 振り回しの最長(ms)。過ぎたら自動で投げる。 */
export const WHIP_SWING_MAX_MS = 1500;
/** スラッシャー1Lvごとの最長の上乗せ(ms)。 */
export const WHIP_SWING_SLASHER_MS_PER_LV = 500;
/** 投げの最大距離=鞭の届く距離 × これ。 */
export const WHIP_THROW_DIST_MULT = 2.5;
/** 投げの速さの下限(px/s・回り出してすぐ投げた時でも飛んで見える)。 */
export const WHIP_THROW_MIN_SPEED = 900;
/** 最大距離に着いた時の速さ(出だしの速さに対する割合=少しずつ減速)。 */
export const WHIP_THROW_END_SPEED_FRAC = 0.4;
/** 着弾の爆発の威力=鞭の1撃目 × これ(社長指示2026-11-25「着弾4倍」・旧2)。 */
export const WHIP_THROW_DAMAGE_MULT = 4;
/** 着弾のヒットストップ(ms・今の叩きつけと同じ)。 */
export const WHIP_THROW_HITSTOP_MS = 120;
/** 1フレームでプレイヤーがこれより大きく動いたら瞬間移動(一閃・ワイヤー等)とみなして放す(px)。 */
export const WHIP_SWING_TELEPORT_PX = 140;
/** 壁で半径を縮める時の刻み(px)と、縮める下限(回す半径に対する割合)。 */
export const WHIP_SWING_SHRINK_STEP_PX = 6;
export const WHIP_SWING_MIN_RADIUS_FRAC = 0.2;
/** 投げて飛ぶ間の当たりの見る刻み(px・壁を飛び越さない)。 */
export const WHIP_THROW_SUBSTEP_PX = 12;
/** 途中で放した後に滑る長さ(ms)。回っていた勢いから一定の減速で止まる(瞬間停止しない)。 */
export const WHIP_DROP_MS = 140;
/** これより遅ければ滑らせずにその場で放す(px/s)。 */
export const WHIP_DROP_MIN_SPEED = 60;

/** 振り回しの状態(プレイヤーに1つ・store の GameState.whipSwing)。時計は gameTime。 */
export interface WhipSwingState {
  enemyId: string;
  /**
   * swing=回している / thrown=投げて飛んでいる / drop=途中で放した後、回っていた勢いのまま短く滑って止まる(着弾なし・止まった所で倒れる)。
   * overhead=ボス区分だけ: 掴んだ瞬間からプレイヤーの頭上を越える弧で反対側へ叩きつける(社長指示2026-11-26)。
   */
  phase: 'swing' | 'thrown' | 'drop' | 'overhead';
  /** 掴んだ時刻。 */
  startAt: number;
  /** 振り回しの最長(ms)。 */
  maxMs: number;
  /** 掴んだ瞬間の角度(プレイヤーの中心から敵の中心・rad)と、その時の距離(px)。 */
  a0: number;
  r0: number;
  /** 回る向き(+1=角度が増える向き)。 */
  dir: 1 | -1;
  /** 回す半径(px・掴んだ時の届く距離から)。 */
  radius: number;
  /** 掴んだ時の鞭の届く距離(ハンティングの伸び込み)。投げの最大距離の元。 */
  reach: number;
  /** 回して当てた敵ごとの最後の当たりの時刻(1周に1回)。 */
  lastHits: Record<string, number>;
  /** 敵の今の中心(死んだ・消えた時の着弾点)。 */
  cx: number;
  cy: number;
  /** 前のフレームのプレイヤーの中心(瞬間移動を見る)。 */
  px: number;
  py: number;
  /** 今の実際の半径(壁で縮めた後)。 */
  rNow: number;
  /** cx,cy を決めた gameTime(投げ・放すの起点=最後に動かしたフレーム。投げた直後の1フレームの止まりを出さない)。 */
  at?: number;
  /** 掴んだ敵の今の速さ(world px/s・前のフレームとの差)。放した時に勢いを持ち越す元。 */
  vx?: number;
  vy?: number;
  /** 壁・帯の縁で半径を縮めている量(px)と、その変わる速さ(px/s)。目標へ臨界減衰のばねで寄る(半径が1フレームで跳ばない)。 */
  shrink?: number;
  shrinkV?: number;
  /** 投げ(phase='thrown' の時だけ)。fromX/fromY=放した時の敵の中心・ux/uy=向き・v0=出だしの速さ(px/s)・maxDist=最大距離。 */
  throwAt?: number;
  fromX?: number;
  fromY?: number;
  ux?: number;
  uy?: number;
  v0?: number;
  maxDist?: number;
  /** 前のフレームまでに飛んだ距離(px)。 */
  dNow?: number;
  /** 放した瞬間の速さ(回っていた勢い)と、投げの直進の速さの差(world px/s)。描画が出だしの曲がりに使う(判定は直進のまま)。 */
  rvx?: number;
  rvy?: number;
  /** プレイヤーの入力(近接・フリック)で投げた(自動の投げは false)。技の行を出すのはこの時の着弾だけ。 */
  byInput?: boolean;
  /** 回し終えた周の数(1周ごとの音を鳴らした所まで)。 */
  lap?: number;
  /** 叩きつけ(phase='overhead' の時だけ)。弧の長さ(ms)・着地点(toX,toY)・弧の中心(pivX,pivY=掴んだ時のプレイヤーの中心。反対側へ置けない時は掴んだ点)。始まり=fromX,fromY・向き=ux,uy。 */
  ohMs?: number;
  toX?: number;
  toY?: number;
  pivX?: number;
  pivY?: number;
  /** 振り下ろしの風切りの音を鳴らした。 */
  ohWhoosh?: boolean;
}

/** 掴む相手の候補(当たった敵1体ぶん)。 */
export interface WhipGrabCandidate { id: string; dist: number; grabbable: boolean; alive: boolean }

/** 当たった中でプレイヤーに一番近い、生き残った掴める1体(居なければ null=掴まない)。 */
export const pickWhipGrabTarget = (cands: readonly WhipGrabCandidate[]): string | null => {
  let best: WhipGrabCandidate | null = null;
  for (const c of cands) {
    if (!c.alive || !c.grabbable) continue;
    if (!best || c.dist < best.dist) best = c;
  }
  return best ? best.id : null;
};

/**
 * 回る向き。振りの向き (ux,uy) とプレイヤーから敵 (rx,ry)。鞭の押しは振りの線から外へ(敵がいる側へ)なので、
 * その押しのまま回り出す向き=振りの線のどちら側にいるか(外積の符号)。線の上ちょうどは +1。
 */
export const whipSwingSpinDir = (ux: number, uy: number, rx: number, ry: number): 1 | -1 =>
  ux * ry - uy * rx < 0 ? -1 : 1;

/** 最高の角速度(rad/s)。 */
export const whipSwingMaxAngVel = (periodMs = WHIP_SWING_PERIOD_MS): number => (2 * Math.PI) / (Math.max(1, periodMs) / 1000);

const smooth3 = (u: number): number => u * u * (3 - 2 * u);

/**
 * 掴んでから t ms の角速度の包絡(rad/s・向きなし・揺れと溜めを掛ける前)。0 から加速の出だしも0で(重さに引かれて)ゆっくり回り出し、
 * 加速の終わりで滑らかに一定へ。
 */
export const whipSwingAngVel = (tMs: number, accelMs = WHIP_SWING_ACCEL_MS, periodMs = WHIP_SWING_PERIOD_MS): number => {
  const w = whipSwingMaxAngVel(periodMs);
  if (!(tMs > 0)) return 0;
  if (tMs >= accelMs) return w;
  return w * smooth3(tMs / Math.max(1, accelMs));
};

/** 包絡だけで回った角度(rad・whipSwingAngVel の積分)。 */
export const whipSwingTurned = (tMs: number, accelMs = WHIP_SWING_ACCEL_MS, periodMs = WHIP_SWING_PERIOD_MS): number => {
  const w = whipSwingMaxAngVel(periodMs);
  if (!(tMs > 0)) return 0;
  const A = Math.max(1, accelMs) / 1000;
  const t = tMs / 1000;
  // ∫0^u (3s^2-2s^3) ds = u^3 - u^4/2
  const G = (u: number): number => u * u * u - (u * u * u * u) / 2;
  if (t <= A) return w * A * G(t / A);
  return w * A * G(1) + w * (t - A);
};

/** 溜めの掛け(1..SURGE)。最長 maxMs の手前 LEAD から上がり始め、RAMP で上がり切る(出だし・上がり切りの変わり方は滑らか)。 */
export const whipSwingSurge = (tMs: number, maxMs: number): number => {
  const u = Math.max(0, Math.min(1, (tMs - (maxMs - WHIP_SWING_SURGE_LEAD_MS)) / WHIP_SWING_SURGE_RAMP_MS));
  return 1 + (WHIP_SWING_SURGE - 1) * smooth3(u);
};
/** 重さの揺れの掛け。角度 th(プレイヤーから敵・rad・画面の y は下が正)で、手前(sin>0)を通る時に速い。 */
export const whipSwingSway = (th: number): number => 1 + WHIP_SWING_SWAY * Math.sin(th);

/** 振り回しの回り方の元(掴んだ角度・向き・最長)。 */
export interface WhipSwingSpin { a0: number; dir: 1 | -1; maxMs: number }
// 数値の積分の作り置き(同じ掴みの間は前の刻みを使い回す=毎フレームの呼び出しが軽い)。
let spinCache: { key: string; th: number[] } | null = null;
/**
 * 掴んでから t ms の角度(rad・向きつき)と角速度(rad/s・向きなし)。角速度 = 包絡 × 重さの揺れ(角度で決まる) × 溜め(最長の手前)。
 * 角度で速さが変わるので数値で積分する(刻み WHIP_SWING_INTEGRATE_MS・中点法)。
 */
export const whipSwingSpinAt = (tMs: number, spin: WhipSwingSpin): { th: number; w: number } => {
  const { a0, dir, maxMs } = spin;
  const omega = (t: number, th: number): number => whipSwingAngVel(t) * whipSwingSway(th) * whipSwingSurge(t, maxMs);
  if (!(tMs > 0)) return { th: a0, w: 0 };
  const key = `${a0}|${dir}|${maxMs}`;
  if (!spinCache || spinCache.key !== key) spinCache = { key, th: [a0] };
  const arr = spinCache.th;
  const h = WHIP_SWING_INTEGRATE_MS;
  const n = Math.floor(tMs / h);
  while (arr.length <= n) {
    const i = arr.length - 1;
    const t0 = i * h, th0 = arr[i];
    const wMid = omega(t0 + h / 2, th0 + dir * omega(t0, th0) * (h / 2000));
    arr.push(th0 + dir * wMid * (h / 1000));
  }
  const rem = tMs - n * h;
  const thN = arr[n];
  const th = rem > 0 ? thN + dir * omega(n * h + rem / 2, thN) * (rem / 1000) : thN;
  return { th, w: omega(tMs, th) };
};

/**
 * 0→1 の寄り方: 出だしの速さ0(止まっている所から動き出す)・前寄りに速く・着く時も速さ0。速さ = 12u(1-u)^2(u=1/3 で最大)。
 * 半径の寄りと、掴んだ瞬間の縄の巻き付きが使う(ease-out だと出だしの速さが最大=掴んだ瞬間に速さが跳ぶ)。
 */
export const easeStartStop = (u: number): number => {
  const q = Math.max(0, Math.min(1, u));
  return q * q * (6 - 8 * q + 3 * q * q);
};
/** 掴んでから t ms の半径の目標(掴んだ位置の距離 r0 から回す半径 R へ、加速と同じ尺で寄る・寄り始めと着きの速さ0)。 */
export const whipSwingRadiusAt = (tMs: number, r0: number, R: number, accelMs = WHIP_SWING_ACCEL_MS): number => {
  const u = Math.max(0, Math.min(1, tMs / Math.max(1, accelMs)));
  return r0 + (R - r0) * easeStartStop(u);
};

/** 壁で半径を縮める量が目標へ寄る速さの時定数(ms・臨界減衰)。 */
export const WHIP_SWING_SHRINK_TAU_MS = 28;
/** 壁を先読みする時間(ms)と刻みの数(回る先の壁に、着く前から縮み始める)。 */
export const WHIP_SWING_SHRINK_LOOKAHEAD_MS = 120;
export const WHIP_SWING_SHRINK_LOOKAHEAD_STEPS = 4;
/**
 * 臨界減衰のばね(1次元)の dt ms 後。x=今の値・v=今の速さ(/s)・target=目標。速さを持ち越したまま目標へ寄り、行き過ぎない。
 * (壁で半径を縮める量に使う=縮み始め・戻り始めに速さが跳ばない。)
 */
export const criticalSpringStep = (x: number, v: number, target: number, dtMs: number, tauMs = WHIP_SWING_SHRINK_TAU_MS): { x: number; v: number } => {
  const t = Math.max(0, dtMs) / 1000;
  const w = 1000 / Math.max(1, tauMs);
  const x0 = x - target;
  const e = Math.exp(-w * t);
  const c = v + w * x0;
  return { x: target + (x0 + c * t) * e, v: (v - w * c * t) * e };
};

/** 掴んでから t ms で回し終えた周の数(1周ごとの音)。 */
export const whipSwingLaps = (tMs: number, spin: WhipSwingSpin): number =>
  Math.floor(Math.abs(whipSwingSpinAt(tMs, spin).th - spin.a0) / (2 * Math.PI) + 1e-9);
/** n 周目の音の高さ(回すほど少しずつ上がる・上限あり)。 */
export const whipSwingLapRate = (lap: number): number => Math.min(1.45, 0.92 + 0.09 * Math.max(0, lap - 1));

/** 掴んでから t ms の角度(rad)。 */
export const whipSwingAngle = (s: WhipSwingSpin, tMs: number): number => whipSwingSpinAt(tMs, s).th;

/** 回して当てる: 同じ敵へは1周ぶんの時間ごとに1回。 */
export const whipSwingHitDue = (lastAt: number | undefined, now: number, periodMs = WHIP_SWING_PERIOD_MS): boolean =>
  lastAt === undefined || now - lastAt >= periodMs;

/** 箱どうしの重なり(左上 x,y と大きさ)。 */
export interface Box { x: number; y: number; width: number; height: number }
export const boxesOverlap = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * ★振り回している敵を盾にして敵の弾をかき消す(社長指示2026-11-26「振り回してる敵で弾をかき消せる様にして(簡単なら、その弾でダメージ与えれるといい)」)。
 * 弾の中心の点が、振り回している敵の体の箱に入っていれば消す。対象=プレイヤーへ向かう敵の弾(hostile)。
 * 紫=カウンターできない弾(noCounter)は消さない(色と形の文法)。敵の手榴弾は信管で爆発する物=消さない(プレイヤーへの接触と同じ扱い)。
 */
export interface WhipShieldShot { x: number; y: number; width: number; height: number; hostile: boolean; weaponType?: string; noCounter?: boolean }
export const whipShieldBlocksShot = (shot: WhipShieldShot, body: Box): boolean => {
  if (!shot.hostile || shot.noCounter || shot.weaponType === 'grenade') return false;
  const cx = shot.x + shot.width / 2, cy = shot.y + shot.height / 2;
  return cx >= body.x && cx <= body.x + body.width && cy >= body.y && cy <= body.y + body.height;
};
/**
 * ★盾で消した弾のダメージを盾の敵がその場で受ける(社長指示2026-11-26「ボスも雑魚も同じ経路で、弾のダメージリアルタイムに食らうで」)。
 * 威力=その弾の damage(プレイヤーに当たった時の素の値)。1未満・壊れた値は1。
 */
export const whipShieldHitDamage = (shotDamage: number): number => (Number.isFinite(shotDamage) && shotDamage > 1 ? shotDamage : 1);
/**
 * 盾のダメージで残す体力の下限。ボス=叩きつけの弧の途中で死なない(体力1で止める・致命にしない)。
 * 雑魚・強個体=0(死んだらその場で着弾=途中で死んだ時の今の処理)。cls=格闘の区分(brawlerEnemyClass)・health=今の体力。
 */
export const whipShieldHealthFloor = (cls: 'mob' | 'strong' | 'boss', health: number): number =>
  cls === 'boss' ? Math.max(0, Math.min(1, health)) : 0;
/**
 * 着弾の爆発で投げた本人を必ず倒すか(処刑扱い)。雑魚だけ(社長指示2026-11-26「強個体はクリティカルだけでは死なないでしょ？」)。
 * 強個体・ボスは爆発のダメージを受けるだけ(足りなければ生き残る)。cls=格闘の区分(brawlerEnemyClass)。
 */
export const whipThrowExecutesSelf = (cls: 'mob' | 'strong' | 'boss'): boolean => cls === 'mob';
/** 着弾で出す技の行。ボスの叩きつけ(overhead)=「叩きつけ」・雑魚/強個体の投げ=「大車輪」。 */
export const whipLandTechKind = (phase: string): 'whipoverhead' | 'whipslam' => (phase === 'overhead' ? 'whipoverhead' : 'whipslam');

/**
 * 壁・木・建物・帯の縁で、回す半径を縮めて手前に留める。want=目標の半径・free(r)=その半径の位置に居られるか。
 * 目標から刻みで縮め、最初に居られる半径を返す。下限まで縮めても居られなければ下限(呼び手が行ける帯へ寄せる)。
 */
export const whipSwingClampRadius = (
  want: number, free: (r: number) => boolean, minR: number, stepPx = WHIP_SWING_SHRINK_STEP_PX,
): number => {
  const lo = Math.max(0, Math.min(want, minR));
  for (let r = want; r > lo; r -= Math.max(1, stepPx)) if (free(r)) return r;
  return lo;
};

/** 最長の振り回し(ms)。スラッシャーの Lv ぶん伸びる。 */
export const whipSwingMaxMs = (slasherLv: number): number =>
  WHIP_SWING_MAX_MS + WHIP_SWING_SLASHER_MS_PER_LV * Math.max(0, Math.min(3, Math.floor(slasherLv || 0)));

/** 自動で投げる時刻が来たか(最長の時間に届いた時)。ボスは振り回さない(叩きつけ=overhead)ので、気絶明けの投げは無い。 */
export const whipSwingAutoThrowDue = (s: Pick<WhipSwingState, 'startAt' | 'maxMs' | 'phase'>, now: number): boolean =>
  s.phase === 'swing' && now - s.startAt >= s.maxMs;

// ---- ★ボスへの鞭(社長指示2026-11-25「鞭はボスに先端を当てると大ダメージで。また、気絶してるボスは掴める」) ----
/** 先端の範囲: 根元からの距離が届く距離のこの割合以上(=外側25%)。 */
export const WHIP_TIP_FRAC = 0.75;
/** 先端でボス区分を打った時のダメージの倍率(社長指示2026-11-25「先端5倍」・旧2.5)。 */
export const WHIP_TIP_BOSS_MULT = 5;
/** 先端で当たったか。dist=根元(プレイヤーの中心)から敵の当たりの箱の一番近い点までの距離・reach=この振りの届く距離。 */
export const isWhipTipHit = (dist: number, reach: number): boolean => reach > 0 && dist >= reach * WHIP_TIP_FRAC;
/**
 * ボスの気絶の終わり(gameTime)。気絶=stunUntil(クリ・致命の後の止め)と bossFullStunUntil(紫=体勢の崩れ)。どちらも止まっていない(半減の遅さ等は含めない)。
 * 今より後の遅い方。extra=打つ前に記録した気絶の終わり(打撃の5倍で気絶が解けても、打った時に気絶していれば掴める)。止まっていなければ null。
 */
export const whipBossStunEnd = (e: { stunUntil?: number; bossFullStunUntil?: number }, gameTime: number, extra?: number): number | null => {
  const end = Math.max(e.stunUntil ?? -Infinity, e.bossFullStunUntil ?? -Infinity, extra ?? -Infinity);
  return end > gameTime ? end : null;
};
/** 掴んだ体の大きさで離す距離の下限(px): 体の箱の長い方の半分+プレイヤーの体の半分+隙間。ボスの叩きつけの着地点をプレイヤーに重ねない。 */
export const WHIP_SWING_BODY_GAP_PX = 8;
export const whipSwingBodyRadius = (w: number, h: number, pw: number, ph: number): number =>
  Math.max(w, h) / 2 + Math.max(pw, ph) / 2 + WHIP_SWING_BODY_GAP_PX;

/** 接線の向き(回る向き)。角度 a・向き dir。 */
export const whipSwingTangent = (a: number, dir: 1 | -1): { x: number; y: number } => ({ x: -Math.sin(a) * dir, y: Math.cos(a) * dir });

/**
 * 自動で投げる向き: 掴んでいる本人の位置から、最大距離の内側・見通しが通る敵の中で「最も固まっている場所」(矢の雨の狙いと同じ物差し)。
 * 掴んでいる本人は外す。候補が無ければ接線の向き。
 */
export const pickWhipAutoThrowDir = (
  ox: number, oy: number, targets: readonly { id: string; x: number; y: number }[], heldId: string, maxDist: number,
  visible: (x: number, y: number) => boolean, tangent: { x: number; y: number },
): { x: number; y: number } => {
  const near = targets.filter(t => t.id !== heldId && Math.hypot(t.x - ox, t.y - oy) <= maxDist && Math.hypot(t.x - ox, t.y - oy) > 1e-6 && visible(t.x, t.y));
  const c = pickArrowRainCenter(ox, oy, near);
  if (c) {
    const d = Math.hypot(c.x - ox, c.y - oy);
    if (d > 1e-6) return { x: (c.x - ox) / d, y: (c.y - oy) / d };
  }
  const tl = Math.hypot(tangent.x, tangent.y) || 1;
  return { x: tangent.x / tl, y: tangent.y / tl };
};

/** 投げの減速(px/s²)。出だし v0 から最大距離で v0×終わりの割合まで、一定の割合で減る。 */
export const whipThrowDecel = (v0: number, maxDist: number, endFrac = WHIP_THROW_END_SPEED_FRAC): number =>
  (v0 * v0 * (1 - endFrac * endFrac)) / (2 * Math.max(1, maxDist));
/** 最大距離に着くまで(ms)。 */
export const whipThrowDurationMs = (v0: number, maxDist: number, endFrac = WHIP_THROW_END_SPEED_FRAC): number => {
  const a = whipThrowDecel(v0, maxDist, endFrac);
  return a > 0 ? ((v0 * (1 - endFrac)) / a) * 1000 : 0;
};
/** 放してから t ms で進んだ距離(px)。出だしが一番速く少しずつ減速・最大距離で止める。 */
export const whipThrowDist = (tMs: number, v0: number, maxDist: number, endFrac = WHIP_THROW_END_SPEED_FRAC): number => {
  if (!(tMs > 0)) return 0;
  const T = whipThrowDurationMs(v0, maxDist, endFrac);
  if (tMs >= T) return maxDist;
  const a = whipThrowDecel(v0, maxDist, endFrac);
  const t = tMs / 1000;
  return Math.min(maxDist, v0 * t - 0.5 * a * t * t);
};
/** 放してから t ms の速さ(px/s)。 */
export const whipThrowSpeed = (tMs: number, v0: number, maxDist: number, endFrac = WHIP_THROW_END_SPEED_FRAC): number => {
  const a = whipThrowDecel(v0, maxDist, endFrac);
  const T = whipThrowDurationMs(v0, maxDist, endFrac);
  return v0 - a * Math.min(Math.max(0, tMs), T) / 1000;
};
/** 投げの出だしの速さ=放した時の接線の速さ(角速度×半径)・下限あり。 */
export const whipThrowStartSpeed = (angVel: number, radius: number): number =>
  Math.max(WHIP_THROW_MIN_SPEED, Math.abs(angVel) * Math.max(0, radius));
/** 途中で放した後、t ms で滑った距離(px)。出だし v0(回っていた速さ)から一定の減速で WHIP_DROP_MS に止まる。 */
export const whipDropDist = (tMs: number, v0: number, dropMs = WHIP_DROP_MS): number => {
  const T = Math.max(1, dropMs) / 1000;
  const t = Math.max(0, Math.min(T, tMs / 1000));
  return Math.max(0, v0) * (t - (t * t) / (2 * T));
};

/**
 * 投げて飛ぶ1フレームの当たり。前の距離 d0 から今の距離 d1 まで、刻みで進めて最初に止まる所を返す。
 * hitsEnemy(x,y)=その中心の位置で別の敵に触れるか・blocked(x,y)=その中心の位置に居られないか(壁・木・建物・帯の縁)。
 * 戻り値: kind='enemy'|'wall'|'max'|null(まだ飛ぶ)・x,y=着弾点(壁の時は手前の居られる所)。
 */
export const whipThrowStep = (
  fromX: number, fromY: number, ux: number, uy: number, d0: number, d1: number, maxDist: number,
  hitsEnemy: (x: number, y: number) => boolean, blocked: (x: number, y: number) => boolean,
  substep = WHIP_THROW_SUBSTEP_PX,
): { kind: 'enemy' | 'wall' | 'max' | null; x: number; y: number } => {
  const span = Math.max(0, d1 - d0);
  const n = Math.max(1, Math.ceil(span / Math.max(1, substep)));
  let lastX = fromX + ux * d0, lastY = fromY + uy * d0;
  for (let i = 1; i <= n; i++) {
    const d = d0 + (span * i) / n;
    const x = fromX + ux * d, y = fromY + uy * d;
    if (blocked(x, y)) return { kind: 'wall', x: lastX, y: lastY };
    if (hitsEnemy(x, y)) return { kind: 'enemy', x, y };
    lastX = x; lastY = y;
  }
  if (d1 >= maxDist - 1e-6) return { kind: 'max', x: lastX, y: lastY };
  return { kind: null, x: lastX, y: lastY };
};

/** 途中で放す理由(着弾なし・その場に落ちる)。どれでもなければ null。 */
export type WhipReleaseReason = 'dead' | 'lock' | 'teleport' | 'weapon';
export const whipSwingReleaseReason = (o: {
  playerAlive: boolean; locked: boolean; whipEquipped: boolean; movedPx: number;
}): WhipReleaseReason | null => {
  if (!o.playerAlive) return 'dead';
  if (o.locked) return 'lock';
  if (!o.whipEquipped) return 'weapon';
  if (o.movedPx > WHIP_SWING_TELEPORT_PX) return 'teleport';
  return null;
};

// ---- 着弾の爆発(§6 の爆発の規約・§8-4「投げた敵自身にも爆発の満額」) ----
/** 距離による減り(手榴弾と同じ=爆心1・縁0.55)。 */
export const whipBlastFalloff = (dist: number, radius: number): number =>
  0.55 + (1 - Math.min(1, Math.max(0, dist) / Math.max(1, radius))) * 0.45;

export interface WhipBlastHit { targetId: string; dist: number; scale: number }
/**
 * 着弾の爆発の当たりの並び。爆心 (cx,cy)・投げた敵 selfId(自分の爆発を満額で受ける=距離0・壁越しの判定なし)。
 * ほかの敵は anchor(爆心から見た当たりの点)までが半径以内で、壁越しでなければ当たる(scale=距離の減り)。
 */
export const whipThrowBlastPlan = (
  cx: number, cy: number, selfId: string | null,
  targets: readonly { id: string; anchor: (cx: number, cy: number) => { x: number; y: number }; blocked?: (cx: number, cy: number, x: number, y: number) => boolean }[],
  radius: number,
): WhipBlastHit[] => {
  const out: WhipBlastHit[] = [];
  for (const t of targets) {
    if (t.id === selfId) { out.push({ targetId: t.id, dist: 0, scale: 1 }); continue; }
    const a = t.anchor(cx, cy);
    const d = Math.hypot(a.x - cx, a.y - cy);
    if (d > radius) continue;
    if (t.blocked?.(cx, cy, a.x, a.y)) continue;
    out.push({ targetId: t.id, dist: d, scale: whipBlastFalloff(d, radius) });
  }
  return out;
};

// ---- ★ボスの叩きつけ(社長指示2026-11-26「ボスは振り回しではなく、反対側に頭上を弧を描いて叩きつけ(効果は同じ)にする。ぐるぐる回ってると絵面がよくないので」) ----
// 掴んだ瞬間から、ボスをプレイヤーの頭上を越える弧で反対側へ運んで叩きつける。地面の上の位置は store が毎フレーム書く(判定の位置)。
// 高さは描画だけ(utils/whipSwingMotion の whipOverheadLiftPx)。進み s(0..1)=弧の角度/π(0=掴んだ点・0.5=頭上・1=叩きつけ)。数値は叩き台。
/** 弧の長さ(ms)。 */
export const WHIP_OVERHEAD_MS = 720;
/** 持ち上げの割合(この時刻で頭上=s 0.5)。残りが振り下ろし(見え方の監査 A3: 頂点の停滞を縮め、振り下ろしを速く短く)。 */
export const WHIP_OVERHEAD_RISE_FRAC = 0.75;
/**
 * 頂点を通る速さ(持ち上げの平均の速さに対する割合)。0=頂点で止まる(旧)。持ち上げは頂点の手前で速さを残して越え、
 * 振り下ろしは同じ速さから加速する(頂点で速さが途切れない)。頂点の前後(弧の ±18°)に居る時間は約110ms(旧 約300ms)。
 */
export const WHIP_OVERHEAD_APEX_SLOPE = 1.9;
/** 振り下ろしの加速の強さ(頂点の速さから x^POW の項で加速し、叩きつける瞬間が一番速い)。 */
export const WHIP_OVERHEAD_SLAM_POW = 3;
/** 着地点を手前へ寄せて探す刻み(px)。 */
export const WHIP_OVERHEAD_LAND_STEP_PX = 8;
/** 叩きつけの止め(ms・今の着弾 WHIP_THROW_HITSTOP_MS より重く)と揺れ(長さ ms・強さ)。 */
export const WHIP_OVERHEAD_HITSTOP_MS = 170;
export const WHIP_OVERHEAD_SHAKE_MS = 440;
export const WHIP_OVERHEAD_SHAKE_MAG = 16;

/** 振り下ろしの1次の項の重み(頂点の速さが持ち上げと振り下ろしで揃う値)。 */
const ohSlamLin = (): number => Math.min(1, WHIP_OVERHEAD_APEX_SLOPE * (1 - WHIP_OVERHEAD_RISE_FRAC) / WHIP_OVERHEAD_RISE_FRAC);
/**
 * 弧の進み s(0..1)。tMs=掴んでから・ms=弧の長さ。持ち上げ=止まった所から加速し、頂点の手前で速さを残したまま頭上(s 0.5)へ
 * (3次のエルミート・終わりの傾き APEX_SLOPE)、振り下ろし=頂点と同じ速さから加速(c·y + (1-c)·y^POW)。叩きつける瞬間が一番速い。
 */
export const whipOverheadProgress = (tMs: number, ms = WHIP_OVERHEAD_MS): number => {
  const T = Math.max(1, ms);
  const u = Math.max(0, Math.min(1, tMs / T));
  const a = WHIP_OVERHEAD_RISE_FRAC, m = WHIP_OVERHEAD_APEX_SLOPE;
  if (u < a) { const x = u / a; return 0.5 * (3 * x * x - 2 * x ** 3 + m * (x ** 3 - x * x)); }
  const c = ohSlamLin(), y = (u - a) / (1 - a);
  return 0.5 + 0.5 * (c * y + (1 - c) * y ** WHIP_OVERHEAD_SLAM_POW);
};
/** 弧の進みの速さ(1/ms)。 */
export const whipOverheadProgressVel = (tMs: number, ms = WHIP_OVERHEAD_MS): number => {
  const T = Math.max(1, ms);
  const u = tMs / T;
  if (!(u > 0) || u > 1) return 0;
  const a = WHIP_OVERHEAD_RISE_FRAC, m = WHIP_OVERHEAD_APEX_SLOPE;
  if (u < a) { const x = u / a; return (0.5 * (6 * x - 6 * x * x + m * (3 * x * x - 2 * x))) / a / T; }
  const c = ohSlamLin(), y = (u - a) / (1 - a), P = WHIP_OVERHEAD_SLAM_POW;
  return (0.5 * (c + (1 - c) * P * y ** (P - 1))) / (1 - a) / T;
};
/**
 * 弧の地面の上の位置。s=進み・(pivX,pivY)=弧の中心(頭上=s 0.5 でここの真上)・(fromX,fromY)=掴んだ点・(toX,toY)=着地点。
 * 角度 θ=π s の cos で、前半は掴んだ点→中心、後半は中心→着地点(着地点が手前へ寄っても s=1 でちょうど着く)。
 */
export const whipOverheadGround = (
  s: number, pivX: number, pivY: number, fromX: number, fromY: number, toX: number, toY: number,
): { x: number; y: number } => {
  const c = Math.cos(Math.PI * Math.max(0, Math.min(1, s)));
  return c >= 0
    ? { x: pivX + (fromX - pivX) * c, y: pivY + (fromY - pivY) * c }
    : { x: pivX + (toX - pivX) * -c, y: pivY + (toY - pivY) * -c };
};
/** 反対側に置けない時に試す、反対の向きからのずらし(rad・この順)。±90°未満=反対側の意図は保つ(見え方の監査 A4)。 */
export const WHIP_OVERHEAD_LAND_TURNS: readonly number[] = [0, Math.PI / 9, (2 * Math.PI) / 9, Math.PI / 3, (4 * Math.PI) / 9];
/**
 * 叩きつけの着地点。掴んだ点 (ex,ey) をプレイヤーの中心 (px,py) について反対側へ写した点(距離は掴んだ時と同じ・minDist より近ければ minDist)。
 * free(x,y)=その中心に体を置けるか(行ける帯・壁・可視域)。置けなければ手前(プレイヤー寄り・minDist まで)へ刻みで寄せる。
 * それでも置けなければ、反対の向きを turns の角度だけ左右へずらして同じく探す(画面の手前=下へ寄る側を先に)。
 * それでも置けなければ looseFree(緩い条件・例: 体の真ん中だけ可視域)で反対の向きを探し、それも無理なら掴んだ点へ
 * (その場で持ち上げて叩きつける=kind 'start'・弧の中心も掴んだ点)。fallback=プレイヤーと重なっている時の「反対」の向き(振りの向き)。
 */
export const whipOverheadLanding = (o: {
  px: number; py: number; ex: number; ey: number; minDist: number; fallbackUx: number; fallbackUy: number;
  free: (x: number, y: number) => boolean; stepPx?: number; turns?: readonly number[]; looseFree?: (x: number, y: number) => boolean;
}): { x: number; y: number; kind: 'mirror' | 'near' | 'turn' | 'start' } => {
  const rx = o.ex - o.px, ry = o.ey - o.py, d0 = Math.hypot(rx, ry);
  let ux: number, uy: number;
  if (d0 > 1) { ux = -rx / d0; uy = -ry / d0; } else {
    const fl = Math.hypot(o.fallbackUx, o.fallbackUy) || 1;
    ux = o.fallbackUx / fl; uy = o.fallbackUy / fl;
  }
  const minD = Math.max(0, o.minDist);
  const want = Math.max(d0, minD);
  const step = Math.max(1, o.stepPx ?? WHIP_OVERHEAD_LAND_STEP_PX);
  const scan = (vx: number, vy: number, free: (x: number, y: number) => boolean): { x: number; y: number; full: boolean } | null => {
    for (let d = want; d >= minD - 1e-6; d -= step) {
      const x = o.px + vx * d, y = o.py + vy * d;
      if (free(x, y)) return { x, y, full: d === want };
    }
    return null;
  };
  for (const th of o.turns ?? [0]) {
    const cands: [number, number][] = th === 0 ? [[ux, uy]] : [1, -1].map(sg => {
      const c = Math.cos(th * sg), sn = Math.sin(th * sg);
      return [ux * c - uy * sn, ux * sn + uy * c] as [number, number];
    }).sort((a, b) => b[1] - a[1]); // 画面の手前(下)へ寄る側を先に
    for (const [vx, vy] of cands) {
      const r = scan(vx, vy, o.free);
      if (r) return { x: r.x, y: r.y, kind: th !== 0 ? 'turn' : r.full ? 'mirror' : 'near' };
    }
  }
  if (o.looseFree) { const r = scan(ux, uy, o.looseFree); if (r) return { x: r.x, y: r.y, kind: r.full ? 'mirror' : 'near' }; }
  return { x: o.ex, y: o.ey, kind: 'start' };
};
