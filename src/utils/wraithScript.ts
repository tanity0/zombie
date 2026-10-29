// 亡霊(変異体)の純関数(research/WRAITH_MUTANT.md)。store も PixiJS も読まない=ヘッドレスでテストする。
// 社長 2026-10-29「こいつもフワフワ浮いており、プレイヤーの周りを周回する。攻撃されるとたまに反対側にワープもする」。

// ---- 絵(シート) ----
/** 浮遊のシート(mutant-wraith-float): 16コマ・1コマ96×152。ループ。 */
export const WRAITH_FLOAT_FRAMES = 16;
export const WRAITH_FLOAT_FRAME_W = 96;
export const WRAITH_FLOAT_FRAME_H = 152;
export const WRAITH_FLOAT_FRAME_MS = 90;
/**
 * 浮遊のコマごとに体の横位置を止める寄せ(絵のドット・右へ+・§1「体を起点にする」)。
 * 胸・肩の重心と腰の帯の重心のそれぞれで揃えた寄せの平均(0コマ目基準・実測)。
 */
export const WRAITH_FLOAT_ALIGN_X: readonly number[] = [0.0, 0.6, 0.5, 0.5, 0.3, 1.6, 2.6, 4.1, 5.8, 8.2, 9.2, 10.8, 9.7, 11.3, 9.1, 7.7];
/** 叫びのシート(mutant-wraith-scream): 16コマ・1コマ76×135。口が開いていく。 */
export const WRAITH_SCREAM_FRAMES = 16;
export const WRAITH_SCREAM_FRAME_W = 76;
export const WRAITH_SCREAM_FRAME_H = 135;
/**
 * 叫びのコマごとの本体の高さ(絵のドット・実測)。シートが足元を支点に少しずつズームしている(社長「多分スタート側が小さくなってる」)ので、
 * この高さを「立ち絵と同じ背丈へ合わせる」(sheetHeightFix の bodyH)へ渡し、どのコマも浮遊と同じ背丈で描く。
 */
export const WRAITH_SCREAM_BODY_PX: readonly number[] = [111, 112, 113, 114, 116, 116, 118, 120, 121, 123, 125, 126, 131, 129, 129, 130];
/** 浮遊の立ち絵の本体の高さ(枠152のうち)。 */
export const WRAITH_FLOAT_BODY_PX = 150;
/** 叫びのコマの胸の横位置(実測)。0コマ目に揃える寄せ。 */
export const WRAITH_SCREAM_ALIGN_X: readonly number[] = [0, 0.7, 0.6, 1.0, 0.9, 0.8, 1.3, 1.0, 2.2, 2.2, 1.7, 1.7, 2.0, 3.0, 3.3, 3.0];

/** 叫びのコマの bodyH(sheetHeightFix へ渡す値=立ち絵の枠152に対する本体の割合で揃える)。 */
export const wraithScreamBodyH = (frame: number): number => {
  const f = Math.max(0, Math.min(WRAITH_SCREAM_FRAMES - 1, Math.round(frame)));
  return WRAITH_SCREAM_BODY_PX[f] * (WRAITH_FLOAT_FRAME_H / WRAITH_FLOAT_BODY_PX);
};

/** 浮遊のコマ(ゲーム時間と個体ごとの位相から)。 */
export const wraithFloatFrame = (gt: number, phase: number): number =>
  Math.floor((gt + phase) / WRAITH_FLOAT_FRAME_MS) % WRAITH_FLOAT_FRAMES;

// ---- 浮き(絵だけ・判定は地面のまま) ----
export const WRAITH_LIFT_PX = 34;
/** 頭の高さ(判定の中心から上へ・世界px・叫びの声の出どころ)。持ち上げ+背丈の上から2割ほど。 */
export const WRAITH_HEAD_Y_PX = 150;
export const WRAITH_DRIFT_PX = 9; // 動きは大きく(クリエイティブ監査#13: ±3はシートの揺れに埋もれて見えない)
/** 持ち上げ(px)。2つの周期を重ねて揃えない漂い。 */
export const wraithLiftPx = (t: number, phase: number): number =>
  WRAITH_LIFT_PX + (Math.sin((t + phase) / 380) * 0.65 + Math.sin((t + phase * 1.7) / 610 + 1.1) * 0.35) * WRAITH_DRIFT_PX;

// ---- 動き ----
export const WRAITH_PATROL_SPEED = 80;
/** 周回の楕円(プレイヤーの足元が中心・§8 A2=スマホの画面に収まる固定値)と、1周の時間。 */
export const WRAITH_ORBIT_RX = 170;
export const WRAITH_ORBIT_RY = 95;
export const WRAITH_ORBIT_PERIOD_MS = 7000;
/** 逆向きに回り直す間隔。 */
export const WRAITH_REVERSE_MIN_MS = 8000;
export const WRAITH_REVERSE_MAX_MS = 14000;
/** 周回の最高速(楕円の周の長さ約865px ÷ 1周の時間 ≒ 124px/s に少し余裕)。プレイヤーが動いている時はその速さを足す(付いてくる・★未決 #4)。 */
export const WRAITH_ORBIT_SPEED = 140;

/** 楕円の上の点(角度 a)。 */
export const wraithOrbitPoint = (cx: number, cy: number, a: number): { x: number; y: number } =>
  ({ x: cx + Math.cos(a) * WRAITH_ORBIT_RX, y: cy + Math.sin(a) * WRAITH_ORBIT_RY });

/** 今の位置の楕円上の角度(楕円を円へ直してから測る)。 */
export const wraithOrbitAngle = (cx: number, cy: number, x: number, y: number): number =>
  Math.atan2((y - cy) / WRAITH_ORBIT_RY, (x - cx) / WRAITH_ORBIT_RX);

/**
 * 周回の行き先(楕円の上を回る向きへ少し先の点)。dir=+1/-1(画面で見て時計回り=角度が増える向き=+1)。
 * 楕円から外れていれば、先の点へ向かうことで自然に楕円へ寄る。
 */
export const wraithOrbitTarget = (cx: number, cy: number, x: number, y: number, dir: 1 | -1, dtMs: number): { x: number; y: number } => {
  const a = wraithOrbitAngle(cx, cy, x, y);
  const lead = Math.max(0.35, (Math.PI * 2 * dtMs) / WRAITH_ORBIT_PERIOD_MS);
  return wraithOrbitPoint(cx, cy, a + dir * lead);
};

// ---- 反対側へのワープ(§3・§8 A3/A4) ----
export const WRAITH_WARP_CHANCE = 0.3;
export const WRAITH_WARP_FADE_MS = 250;
export const WRAITH_WARP_COOLDOWN_MS = 4000;
/** 被弾ごとの抽選は600msに1回だけ(散弾・継続ダメージで何度も引かない)。 */
export const WRAITH_WARP_ROLL_GAP_MS = 600;

/** ワープの濃さ(0..1)と当たらない間か。outAt=消え始め(gameTime)。消える250ms→現れる250ms。 */
export const wraithWarpState = (gt: number, outAt: number | undefined): { alpha: number; phased: boolean; moveNow: boolean; done: boolean } => {
  if (outAt === undefined || gt < outAt) return { alpha: 1, phased: false, moveNow: false, done: true };
  const t = gt - outAt;
  if (t >= WRAITH_WARP_FADE_MS * 2) return { alpha: 1, phased: false, moveNow: false, done: true };
  const ease = (u: number) => u * u * (3 - 2 * u);
  if (t < WRAITH_WARP_FADE_MS) return { alpha: 1 - ease(t / WRAITH_WARP_FADE_MS), phased: true, moveNow: false, done: false };
  return { alpha: ease((t - WRAITH_WARP_FADE_MS) / WRAITH_WARP_FADE_MS), phased: true, moveNow: true, done: false };
};

/** 反対側の点(楕円の上・今の角度+180°)。 */
export const wraithOppositePoint = (cx: number, cy: number, x: number, y: number): { x: number; y: number } =>
  wraithOrbitPoint(cx, cy, wraithOrbitAngle(cx, cy, x, y) + Math.PI);

// ---- 叫び(§4・§8 A2) ----
export const WRAITH_SCREAM_FRAME_MS = 90;
/** 溜め=16コマ(1440ms)。最後のコマが終わる瞬間に当たる。 */
export const WRAITH_SCREAM_WINDUP_MS = WRAITH_SCREAM_FRAMES * WRAITH_SCREAM_FRAME_MS;
/** 当たった後、最後のコマのまま叫び続ける(判定なし)。 */
export const WRAITH_SCREAM_HOLD_MS = 400;
export const WRAITH_SCREAM_RADIUS = 200;
export const WRAITH_SCREAM_DAMAGE = 20;
export const WRAITH_SCREAM_GAP_MIN_MS = 5000;
export const WRAITH_SCREAM_GAP_MAX_MS = 8000;

/**
 * 叫びのコマ(溜めの始まりからの経過 ms)。溜めの間は0→15、その後は15のまま。
 * 前半は口がゆっくり、最後の数コマで一気に開く(等速で開かない・クリエイティブ監査#7)。当たる時刻(溜め明け)は変わらない。
 */
export const wraithScreamFrame = (sinceMs: number): number => {
  const u = Math.max(0, Math.min(1, sinceMs / WRAITH_SCREAM_WINDUP_MS));
  return Math.max(0, Math.min(WRAITH_SCREAM_FRAMES - 1, Math.floor(WRAITH_SCREAM_FRAMES * Math.pow(u, 1.7))));
};
/** 溜めの間に体が少し浮き上がる(描画の持ち上げ・px)。当たった後はゆっくり戻る。 */
export const wraithScreamRisePx = (sinceMs: number): number => {
  if (sinceMs < 0) return 0;
  if (sinceMs < WRAITH_SCREAM_WINDUP_MS) { const u = sinceMs / WRAITH_SCREAM_WINDUP_MS; return 12 * u * u; }
  const v = Math.min(1, (sinceMs - WRAITH_SCREAM_WINDUP_MS) / WRAITH_SCREAM_HOLD_MS); // 叫び終わりまでに戻り切る(浮遊へ戻る瞬間に跳ねない)
  return 12 * (1 - v * v * (3 - 2 * v));
};

// ---- 近づくと地面から生えてくる物(§9) ----
/** 素材(props/wraith-growths・8コマ×49×66): 0〜3=墓石(壁)・4〜7=花(判定なし)。 */
export const WRAITH_GROWTH_FRAMES = 8;
export const WRAITH_GROWTH_FRAME_H = 66;
export const isWraithGrave = (variant: number): boolean => variant >= 0 && variant <= 3;
export const WRAITH_GROWTH_NEAR_PX = 1200;
export const WRAITH_GROWTH_GAP_FAR_MS = 1500;
export const WRAITH_GROWTH_GAP_NEAR_MS = 250;
export const WRAITH_GROWTH_CAP = 30;
export const WRAITH_GROWTH_AVOID_PLAYER_PX = 140;
export const WRAITH_GROWTH_GAP_PX = 56;
export const WRAITH_GROWTH_GROW_MS = 600;
export const WRAITH_GROWTH_SINK_MS = 500;
/** 墓石が壁になるのは伸び切ってから(伸びている途中は押し出さない)。 */
export const WRAITH_GROWTH_SOLID_AT = 0.85;
/** 描画の高さ(絵66px に掛ける倍率の幅)。 */
export const WRAITH_GROWTH_SCALE_MIN = 1.25;
export const WRAITH_GROWTH_SCALE_MAX = 1.6;

export interface WraithGrowth {
  id: string;
  /** 足元(Y-sort のキー・壁の四角の下端)。 */
  x: number; y: number;
  variant: number; scale: number; flip: boolean;
  bornAt: number;
  sinkAt?: number;
}
export interface WraithGrowthState { nextAt: number; seq: number; lastSinkAt: number }

/** 伸びの進み(0..1・出始めが速く、少し行き過ぎて戻る)。 */
export const wraithGrowthRise = (gt: number, g: Pick<WraithGrowth, 'bornAt' | 'sinkAt'>): number => {
  const u = Math.max(0, Math.min(1, (gt - g.bornAt) / WRAITH_GROWTH_GROW_MS));
  const c = 1.70158 * 0.6; // 行き過ぎは控えめ
  const up = 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2);
  if (g.sinkAt === undefined) return u >= 1 ? 1 : up;
  const s = Math.max(0, Math.min(1, (gt - g.sinkAt) / WRAITH_GROWTH_SINK_MS));
  return Math.min(1, up) * (1 - s * s);
};

/** 墓石の壁の四角(足元の四角・絵の倍率に合わせる)。 */
export const wraithGraveFoot = (g: Pick<WraithGrowth, 'x' | 'y' | 'scale'>): { x: number; y: number; width: number; height: number } => {
  const w = 26 * g.scale, h = 12 * g.scale;
  return { x: g.x - w / 2, y: g.y - h, width: w, height: h };
};

/** 間隔(亡霊との距離が近いほど詰まる)。 */
export const wraithGrowthGapMs = (dist: number): number => {
  const k = Math.max(0, Math.min(1, (dist - 200) / (WRAITH_GROWTH_NEAR_PX - 200)));
  return WRAITH_GROWTH_GAP_NEAR_MS + (WRAITH_GROWTH_GAP_FAR_MS - WRAITH_GROWTH_GAP_NEAR_MS) * k;
};

/**
 * 生えた物を1回分進める。wraith=場にいる亡霊の足元(居なければ null)、view=見えている範囲。
 * canPlace=その点に生やしてよいか(敵・既存の障害物の上でない)。変わらなければ同じ配列を返す。
 */
export const wraithGrowthStep = (
  pieces: readonly WraithGrowth[], wraith: { x: number; y: number } | null, player: { x: number; y: number },
  view: { left: number; right: number; top: number; bottom: number }, canPlace: (x: number, y: number) => boolean,
  gt: number, rng: () => number, st: WraithGrowthState,
): WraithGrowth[] => {
  let out: WraithGrowth[] | null = null;
  const cur = () => out ?? pieces;
  // 沈み切った物・画面から大きく外れた物を消す。
  const far = (p: WraithGrowth) => p.x < view.left - 600 || p.x > view.right + 600 || p.y < view.top - 600 || p.y > view.bottom + 600;
  if (pieces.some(p => (p.sinkAt !== undefined && gt >= p.sinkAt + WRAITH_GROWTH_SINK_MS) || far(p))) {
    out = pieces.filter(p => !((p.sinkAt !== undefined && gt >= p.sinkAt + WRAITH_GROWTH_SINK_MS) || far(p)));
  }
  const dist = wraith ? Math.hypot(player.x - wraith.x, player.y - wraith.y) : Infinity;
  if (wraith && dist <= WRAITH_GROWTH_NEAR_PX && gt >= st.nextAt) {
    st.nextAt = gt + wraithGrowthGapMs(dist) * (0.7 + 0.6 * rng());
    for (let tries = 0; tries < 12; tries++) {
      const x = view.left + 30 + rng() * Math.max(1, view.right - view.left - 60);
      const y = view.top + 60 + rng() * Math.max(1, view.bottom - view.top - 90);
      if (Math.hypot(x - player.x, y - player.y) < WRAITH_GROWTH_AVOID_PLAYER_PX) continue;
      // 亡霊に近い所ほど生えやすい。
      const w = Math.max(0.08, 1 - Math.hypot(x - wraith.x, y - wraith.y) / 1400);
      if (rng() > w) continue;
      if (cur().some(p => p.sinkAt === undefined && Math.hypot(p.x - x, p.y - y) < WRAITH_GROWTH_GAP_PX)) continue;
      if (!canPlace(x, y)) continue;
      out = [...cur(), {
        id: `wraith-growth-${++st.seq}`, x, y,
        variant: Math.floor(rng() * WRAITH_GROWTH_FRAMES) % WRAITH_GROWTH_FRAMES,
        scale: WRAITH_GROWTH_SCALE_MIN + rng() * (WRAITH_GROWTH_SCALE_MAX - WRAITH_GROWTH_SCALE_MIN), flip: rng() < 0.5, bornAt: gt,
      }];
      break;
    }
  }
  if (!wraith && gt - st.lastSinkAt >= 300) {
    // 亡霊が居なくなったら、残った物を古い順に1つずつ沈める。
    const first = cur().find(p => p.sinkAt === undefined);
    if (first) { st.lastSinkAt = gt; out = cur().map(p => (p === first ? { ...p, sinkAt: gt } : p)); }
  }
  // 上限: 沈んでいない物が上限を超えたら、古い順に沈める(パッと消さない)。
  const live = cur().filter(p => p.sinkAt === undefined);
  if (live.length > WRAITH_GROWTH_CAP) {
    const drop = new Set(live.slice(0, live.length - WRAITH_GROWTH_CAP).map(p => p.id));
    out = cur().map(p => (drop.has(p.id) ? { ...p, sinkAt: gt } : p));
  }
  return out ?? (pieces as WraithGrowth[]);
};

/** 伸び切った墓石の壁の四角(沈み始めた物は外す)。 */
export const wraithGraveSolids = (pieces: readonly WraithGrowth[], gt: number): { x: number; y: number; width: number; height: number }[] =>
  pieces.filter(p => isWraithGrave(p.variant) && p.sinkAt === undefined && (gt - p.bornAt) / WRAITH_GROWTH_GROW_MS >= WRAITH_GROWTH_SOLID_AT).map(wraithGraveFoot);
