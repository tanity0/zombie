// ★研究所(ステージ2)の闇と、PHILLガンの懐中電灯(research/LAB_DARKNESS.md・社長指示2026-11-11
//   「ステージ2を基本ほぼ見えないくらいに暗くして、スポット当たってるところは見える。で、PHILLガンを持つと、
//    ターゲットに付随してフラッシュライトを照らせるようにしたい」)。
// ここは「闇に開ける穴の一覧」と「懐中電灯の形」の純関数だけ。描くのは pixi/pixiScene(描画だけ・判定・視界・湧きには触らない)。
// 座標はワールド(px)。画面への変換とズームは描画側(pixiScene の worldToUi・worldUiScale)。
import { brawlerPhaseKind } from './brawlerCombo';
import { easeToward } from './labFlicker';
import type { EnemyType } from '../types/game';

/** 穴の上限(非常灯の円錐は別枠=描画側が灯りと同じ数だけ開ける)。超えた分は UVバー・光のエフェクトから捨てる(keep は捨てない)。 */
export const LAB_PITCH_MAX_LIGHTS = 24;
/**
 * 懐中電灯の点灯・消灯の尺(ms)。点く方が遅く(電池が立ち上がる)、消える方が速い。
 * 光だまりは狙いサークルをばねで追う(少し遅れて、素早く振ると少し行き過ぎて戻る=手に持った灯りの慣性。吸い付きで瞬間移動しない)。
 */
export const LAB_FLASH_FADE_MS = 180;
export const LAB_FLASH_OFF_MS = 110;
export const LAB_FLASH_SPRING_HZ = 3.6;
export const LAB_FLASH_SPRING_DAMP = 0.62;
/** 懐中電灯の根元: 体の中心から、狙う向きへこの距離・この高さだけずらす(手に持った銃の位置。胸の真ん中から出さない)。 */
export const LAB_FLASH_HAND_PX = 12;
export const LAB_FLASH_HAND_DROP_PX = 5;
/** 懐中電灯の円錐の最短の長さ(px)。狙いサークルが体のすぐそばでも、形が潰れない。 */
export const LAB_FLASH_MIN_LEN = 40;
/**
 * 名札つきの穴(敵・技の届く形・這う塊・注目点)の出入り。
 *  - 出る: **そのフレームから目標の8割以上で開く**(赤い予告は溜めが始まった時刻から見えていなければならない=掟②。0から開けると出始めの流星が闇に沈む)。
 *    初めて出た時も、消えかけ(残光)から戻った時も同じ。残りの2割を短い時定数で寄せる。
 *  - 消える: 残光でゆっくり(時定数 ms)。
 * 半径(体の大きい方×倍率・下限〜上限)・強さ。
 */
export const LAB_REVEAL_IN_START = 0.8;
export const LAB_REVEAL_IN_TAU_MS = 45;
export const LAB_REVEAL_OUT_TAU_MS = 320;
export const LAB_REVEAL_R_MIN = 90;
export const LAB_REVEAL_R_MAX = 240;
export const LAB_REVEAL_BODY_K = 1.5;
export const LAB_REVEAL_A = 0.9;
/** 予告なしで寄ってくる相手(闇で隠さない)。pixiScene の明滅の「危険が画面にある間は暗くしない」も同じ1本を読む。 */
export const LAB_ALWAYS_REVEAL_TYPES: ReadonlySet<string> = new Set(['hunter', 'reaper', 'hangedman']);
/** UVバーの周り(半径・強さ)。 */
export const LAB_UV_R = 110;
export const LAB_UV_A = 0.6;
/** 光のエフェクト(銃の閃光・爆発など)が照らす広さ(光の半径×倍率・上限)と強さ・同時に数える上限。 */
export const LAB_GLOW_R_K = 2.2;
export const LAB_GLOW_R_MAX = 260;
export const LAB_GLOW_A = 0.7;
export const LAB_GLOW_MAX = 12;
/**
 * 技の届く形(赤い予告の線・帯・着地の円が、体の周りの丸い穴に収まらない技のため)。
 * 体の中心→狙いの点に沿った細長い穴(半幅・両端の余り・長さの上限)と、狙いの点の丸い穴(半径)。
 */
export const LAB_REACH_MIN_LEN = 60;
/** 細長い穴の長さの上限(絵の大きさの安全弁。どの突進の距離より長い=ハンター1300)。狙いの点の丸い穴は、いつも本当の狙いの点に置く(打ち切らない)。 */
export const LAB_REACH_MAX_LEN = 2400;
export const LAB_REACH_HALF_W = 110;
export const LAB_REACH_PAD = 90;
export const LAB_REACH_AIM_R = 190;
/**
 * 危険を伝える絵(赤い予告・敵の弾)のための穴の強さ。`hard`=穴の絵を2回重ねて削る(縁の近くまで闇が残らない)。
 * 穴の絵は中心から縁へなだらかに薄くなるので、赤い円の輪郭が穴の縁の近くに来ると、輪郭だけ闇に沈む(出始めの流星が見えない)。
 * だから ①穴を予告より十分大きく取り(輪郭が穴の半径の6割より内側) ②2回重ねる。
 */
export const LAB_DANGER_A = 1;
/** 敵の弾の周り(半径・同時に数える上限=自分に近い順)。 */
export const LAB_SHOT_R = 54;
export const LAB_SHOT_MAX = 24;
/**
 * 這う塊: 体の楕円の余り(当たりの箱の半分×倍率)と強さ・叩きつけの円の余り(半径×倍率)。
 * 体の楕円はごく弱い(輪郭がうっすら)。起きた塊がはっきり見えるのは、自分のランタンの周り(描画側がランタンの位置に開ける)・灯りの下・懐中電灯・叩きつけの円。
 */
export const LAB_CRAWLER_BODY_K = 1.1;
export const LAB_CRAWLER_A = 0.25;
export const LAB_CRAWLER_SLAM_K = 1.7;
/** アテンション(カメラが見せたい物へ寄る)の注目点の周り(半径・強さ)。闇は消さず、見せたい物の周りだけ開ける。 */
export const LAB_FOCUS_R = 260;
export const LAB_FOCUS_A = 0.75;

export interface LabDarkCfg {
  /** 自分の周りの半径(px)と強さ(0..1)。 */
  selfR: number; selfA: number;
  /** 懐中電灯の光だまりの半径(px)と強さ(0..1)。 */
  flashR: number; flashA: number;
}

/**
 * 闇に開ける穴1つ。
 *  - disc=丸(x,y=中心・r=半径)。ry があれば楕円(r=rot の向きの半径・ry=それと直交する半径)。
 *  - beam=懐中電灯(x,y=光だまりの中心・r=光だまりの半径・len=根元までの長さ・rot=根元→先の向き)。
 */
export interface LabLight {
  shape: 'disc' | 'beam';
  x: number; y: number; r: number;
  /** 強さ(0..1=幕をどれだけ削るか)。 */
  a: number;
  ry?: number;
  len?: number; rot?: number;
  /** 危険を伝える絵のための穴(描画側が2回重ねて削る=縁の近くまで闇を残さない)。 */
  hard?: boolean;
  /** 2回目の削りの強さ(0..1)。labEaseReveals が書く(hard の切り替わりを1フレームで跳ばさない)。無ければ hard ? 1 : 0。 */
  hardK?: number;
  /** beam の根元(手の位置)。 */
  rootX?: number; rootY?: number;
  /** 上限を超えても捨てない(自分・懐中電灯・技を出している敵)。 */
  keep?: boolean;
  /** 敵の周りの穴の名札(フェードに使う)。 */
  id?: string;
}

export interface LabEnemyLike {
  id: string; type: EnemyType | string; x: number; y: number; width: number; height: number; health?: number;
  aiPhase?: string; chaffMove?: string; biteAt?: number; stunUntil?: number; bossFullStunUntil?: number; bossState?: string;
  /** 技の狙いの点(突進の行き先・着地点・帯の終点)。型によって体の左上基準のこともある=穴は余りを大きく取る。 */
  aiTargetX?: number; aiTargetY?: number;
}

/**
 * その敵の周りを闇の中でも見せるか(§3)。技を出している(溜め・攻撃の振り・噛みつきの構え)か、予告なしで寄ってくる型。
 * 倒れた敵は見せない。移動・待ち・硬直・気絶の敵は見せない(灯りか懐中電灯で照らす)。
 * ★赤い予告が闇で隠れない、のための述語(CLAUDE.md 色と形の文法=赤いのに見えない、を作らない)。
 */
export const labEnemyRevealed = (e: LabEnemyLike, gameTime: number): boolean => {
  if ((e.health ?? 1) <= 0) return false;
  if (LAB_ALWAYS_REVEAL_TYPES.has(e.type)) return true;
  return brawlerPhaseKind(e as Parameters<typeof brawlerPhaseKind>[0], gameTime) !== 'free';
};
/** 敵の周りの穴の半径(px)。体の大きい方×1.5(下限90・上限240)。 */
export const labRevealRadius = (e: Pick<LabEnemyLike, 'width' | 'height'>): number =>
  Math.max(LAB_REVEAL_R_MIN, Math.min(LAB_REVEAL_R_MAX, Math.max(e.width, e.height) * LAB_REVEAL_BODY_K));

/**
 * 技の届く形の穴(§3)。技を出している敵に狙いの点があれば、体の中心→狙いの点に沿った細長い穴と、狙いの点の丸い穴を返す。
 * 突進の赤い線・帯・着地の円は体から離れた所まで伸びるので、体の周りの丸い穴だけでは「赤いのに見えない」になる。
 * 狙いが体のすぐそば(LAB_REACH_MIN_LEN 未満)なら出さない(体の穴で足りる)。細長い穴の長さだけ LAB_REACH_MAX_LEN で打ち切る(狙いの点の丸い穴は本当の狙いの点)。
 */
export const labEnemyReach = (e: LabEnemyLike, gameTime: number): LabLight[] => {
  if (!e.aiPhase || !labEnemyRevealed(e, gameTime)) return [];
  const tx = e.aiTargetX, ty = e.aiTargetY;
  if (tx === undefined || ty === undefined || !Number.isFinite(tx) || !Number.isFinite(ty)) return [];
  const cx = e.x + e.width / 2, cy = e.y + e.height / 2;
  const d = Math.hypot(tx - cx, ty - cy);
  if (d < LAB_REACH_MIN_LEN) return [];
  const len = Math.min(LAB_REACH_MAX_LEN, d);
  const ux = (tx - cx) / d, uy = (ty - cy) / d;
  const ex = cx + ux * len, ey = cy + uy * len;
  return [
    { shape: 'disc', x: (cx + ex) / 2, y: (cy + ey) / 2, r: len / 2 + LAB_REACH_PAD, ry: LAB_REACH_HALF_W, rot: Math.atan2(uy, ux), a: LAB_DANGER_A, keep: true, hard: true, id: `${e.id}:path` },
    { shape: 'disc', x: tx, y: ty, r: LAB_REACH_AIM_R, a: LAB_DANGER_A, keep: true, hard: true, id: `${e.id}:aim` },
  ];
};

/**
 * 懐中電灯の形(§5)。自分の体の中心(px,py)から狙いサークル(tx,ty)へ伸びる円錐+先端の光だまり。
 * rot=根元→先の向き(rad)・len=根元から光だまりの中心までの長さ(下限 LAB_FLASH_MIN_LEN)。
 * 狙いが体と重なっている時は、向き(dirX,dirY=向いている方)へ最短の長さで出す。
 */
export const labFlashlightBeam = (
  px: number, py: number, tx: number, ty: number, r: number, a: number, dirX = 1, dirY = 0,
): LabLight => {
  let dx = tx - px, dy = ty - py;
  let d = Math.hypot(dx, dy);
  if (d < 1e-3) { const n = Math.hypot(dirX, dirY) || 1; dx = dirX / n; dy = dirY / n; d = 1; }
  const len = Math.max(LAB_FLASH_MIN_LEN, d);
  const ux = dx / d, uy = dy / d;
  return {
    shape: 'beam', x: px + ux * len, y: py + uy * len, r, a, len, rot: Math.atan2(uy, ux), keep: true,
    rootX: px + ux * LAB_FLASH_HAND_PX, rootY: py + uy * LAB_FLASH_HAND_PX + LAB_FLASH_HAND_DROP_PX,
  };
};
/**
 * 懐中電灯の明るさ(0..1)。a=点灯の進み(stepLabFlash の a)。点く時は加速して立ち上がり、途中で一度だけ短く瞬く(切れかけの電池)。
 * 消える時(on=false)は瞬かずに落ちる。
 */
export const labFlashLevel = (a: number, on: boolean): number => {
  const k = Math.max(0, Math.min(1, a));
  const e = k * k * (3 - 2 * k);
  return on && k > 0.42 && k < 0.58 ? e * 0.3 : e;
};

/** 懐中電灯の、狙いへの追従と点灯のフェード(描画側の状態)。 */
export interface LabFlashState { x: number; y: number; a: number; on: boolean; vx?: number; vy?: number }
/**
 * 1フレーム進める。active=PHILLガンを構えている。target=狙いサークル(ワールド)。
 * 点いた瞬間は狙いの位置から始める(遠くから滑って来ない)。a=点灯の進み(点く LAB_FLASH_FADE_MS / 消える LAB_FLASH_OFF_MS・明るさの曲線は labFlashLevel)。
 * 位置はばねで追う(速さを持ち越す=少し遅れて、素早く振ると少し行き過ぎて戻る)。
 */
export const stepLabFlash = (
  s: LabFlashState | null, active: boolean, target: { x: number; y: number }, dtMs: number,
): LabFlashState => {
  const dt = Math.max(0, Math.min(100, dtMs));
  if (!s || (active && !s.on && s.a <= 0)) {
    return { x: target.x, y: target.y, a: active ? Math.min(1, dt / LAB_FLASH_FADE_MS) : 0, on: active, vx: 0, vy: 0 };
  }
  if (!active) return { x: s.x, y: s.y, a: Math.max(0, s.a - dt / LAB_FLASH_OFF_MS), on: false, vx: 0, vy: 0 }; // 消えていく間は最後の位置のまま
  const a = Math.min(1, s.a + dt / LAB_FLASH_FADE_MS);
  // ばね(半陰的オイラー・細かく刻む=フレームの幅が揺れても暴れない)。
  const w = 2 * Math.PI * LAB_FLASH_SPRING_HZ, c = 2 * LAB_FLASH_SPRING_DAMP * w;
  let x = s.x, y = s.y, vx = s.vx ?? 0, vy = s.vy ?? 0;
  const n = Math.max(1, Math.ceil(dt / 4)), h = dt / n / 1000;
  for (let i = 0; i < n; i++) {
    vx += (w * w * (target.x - x) - c * vx) * h; vy += (w * w * (target.y - y) - c * vy) * h;
    x += vx * h; y += vy * h;
  }
  return { x, y, a, on: true, vx, vy };
};

export interface LabDarkInput {
  /** 自分の体の中心。 */
  player: { x: number; y: number };
  /** 懐中電灯(stepLabFlash の結果)。a=0 なら出さない。dir=向いている方。 */
  flash: { x: number; y: number; a: number; dirX: number; dirY: number } | null;
  enemies: readonly LabEnemyLike[];
  gameTime: number;
  /** 敵の弾(中心)。 */
  shots?: readonly { x: number; y: number }[];
  /**
   * 這う塊(起きている間)。x,y=当たりの箱の中心・halfW,halfH=箱の半分。slam=叩きつけの溜め〜当たりの間の円(中心と半径)。
   * 眠っている間は渡さない(灯りか懐中電灯で照らすまで見えない)。
   */
  crawler?: { x: number; y: number; halfW: number; halfH: number; slam: { x: number; y: number; r: number } | null } | null;
  /** アテンションの注目点(カメラが寄っている先)。無ければ null。 */
  focus?: { x: number; y: number } | null;
  /** UVバーの足元。 */
  uvBars: readonly { x: number; y: number }[];
  /** 光のエフェクト。life=残り(1→0)。 */
  glows: readonly { x: number; y: number; radius: number; life: number }[];
  /** 見えているワールドの範囲(余白込み)。この外の穴は作らない。 */
  view: { x0: number; y0: number; x1: number; y1: number };
}

const inView = (v: LabDarkInput['view'], x: number, y: number, r: number): boolean =>
  x + r >= v.x0 && x - r <= v.x1 && y + r >= v.y0 && y - r <= v.y1;

/**
 * 闇に開ける穴の一覧(§3・§4)。非常灯の円錐は入れない(描画側が灯りの絵と同じ形で開ける)。
 * 並びは「捨てない物(自分・懐中電灯・敵とその技の届く形・這う塊・敵の弾)→ UVバー → 光のエフェクト(強い順)」。
 * 上限 LAB_PITCH_MAX_LIGHTS は捨ててよい物(UVバー・光)だけに掛かる=捨てない物が上限を超えていれば、UVバーと光は0になる。
 * 敵の穴は目標の強さ(labEaseReveals がフェードさせる)。
 */
export const labPitchLights = (inp: LabDarkInput, cfg: LabDarkCfg): LabLight[] => {
  const out: LabLight[] = [];
  if (cfg.selfR > 0 && cfg.selfA > 0) out.push({ shape: 'disc', x: inp.player.x, y: inp.player.y, r: cfg.selfR, a: cfg.selfA, keep: true });
  if (inp.flash && inp.flash.a > 0.001 && cfg.flashR > 0 && cfg.flashA > 0) {
    out.push(labFlashlightBeam(inp.player.x, inp.player.y, inp.flash.x, inp.flash.y, cfg.flashR, cfg.flashA * inp.flash.a, inp.flash.dirX, inp.flash.dirY));
  }
  for (const e of inp.enemies) {
    if (!labEnemyRevealed(e, inp.gameTime)) continue;
    const r = labRevealRadius(e);
    const cx = e.x + e.width / 2, cy = e.y + e.height / 2;
    if (!inView(inp.view, cx, cy, r)) continue;
    // 技を出している敵(体の周りに赤い予告が出る)は危険の穴=2回削る。予告なしで寄ってくる型の、技の外の体は普通の穴。
    const tech = brawlerPhaseKind(e as Parameters<typeof brawlerPhaseKind>[0], inp.gameTime) !== 'free';
    out.push({ shape: 'disc', x: cx, y: cy, r, a: tech ? LAB_DANGER_A : LAB_REVEAL_A, keep: true, id: e.id, ...(tech ? { hard: true } : {}) });
    for (const l of labEnemyReach(e, inp.gameTime)) if (inView(inp.view, l.x, l.y, Math.max(l.r, l.ry ?? 0))) out.push(l);
  }
  const cr = inp.crawler;
  if (cr) {
    const rx = cr.halfW * LAB_CRAWLER_BODY_K, ry = cr.halfH * LAB_CRAWLER_BODY_K;
    if (inView(inp.view, cr.x, cr.y, Math.max(rx, ry))) out.push({ shape: 'disc', x: cr.x, y: cr.y, r: rx, ry, rot: 0, a: LAB_CRAWLER_A, keep: true, id: 'crawler' });
    if (cr.slam) {
      const r = cr.slam.r * LAB_CRAWLER_SLAM_K;
      if (inView(inp.view, cr.slam.x, cr.slam.y, r)) out.push({ shape: 'disc', x: cr.slam.x, y: cr.slam.y, r, a: LAB_DANGER_A, keep: true, hard: true, id: 'crawler:slam' });
    }
  }
  if (inp.focus) out.push({ shape: 'disc', x: inp.focus.x, y: inp.focus.y, r: LAB_FOCUS_R, a: LAB_FOCUS_A, keep: true, id: 'focus' });
  // 敵の弾(赤い二重丸)は闇の中でも見せる。数が多い時は自分に近い順に上限まで。
  if (inp.shots && inp.shots.length) {
    const near = inp.shots
      .filter(b => inView(inp.view, b.x, b.y, LAB_SHOT_R))
      .map(b => ({ b, d: (b.x - inp.player.x) ** 2 + (b.y - inp.player.y) ** 2 }))
      .sort((p, q) => p.d - q.d)
      .slice(0, LAB_SHOT_MAX);
    for (const { b } of near) out.push({ shape: 'disc', x: b.x, y: b.y, r: LAB_SHOT_R, a: LAB_DANGER_A, keep: true, hard: true });
  }
  const rest: LabLight[] = [];
  for (const u of inp.uvBars) {
    if (inView(inp.view, u.x, u.y, LAB_UV_R)) rest.push({ shape: 'disc', x: u.x, y: u.y, r: LAB_UV_R, a: LAB_UV_A });
  }
  const glows = inp.glows
    .filter(g => g.life > 0.02 && g.radius > 0)
    .map(g => ({ shape: 'disc' as const, x: g.x, y: g.y, r: Math.min(LAB_GLOW_R_MAX, g.radius * LAB_GLOW_R_K), a: LAB_GLOW_A * Math.min(1, g.life) }))
    .filter(g => inView(inp.view, g.x, g.y, g.r))
    .sort((p, q) => q.a * q.r - p.a * p.r)
    .slice(0, LAB_GLOW_MAX);
  rest.push(...glows);
  const room = Math.max(0, LAB_PITCH_MAX_LIGHTS - out.length);
  return out.concat(rest.slice(0, room));
};

/**
 * 名札つきの穴のフェード(慣性)。prev=前のフレームの穴(名札ごと)。今のフレームに居る穴は目標の強さへ寄せ(出るのは速く)、
 * 居なくなった穴は最後の位置のまま 0 へ寄せて(残光でゆっくり)、消え切ったら捨てる。名札の無い穴(自分・懐中電灯・UV・光)はそのまま通す。
 */
export const labEaseReveals = (
  prev: ReadonlyMap<string, LabLight>, lights: readonly LabLight[], dtMs: number,
): { lights: LabLight[]; next: Map<string, LabLight> } => {
  const dt = Math.max(0, Math.min(100, dtMs));
  const next = new Map<string, LabLight>();
  const out: LabLight[] = [];
  const seen = new Set<string>();
  for (const l of lights) {
    if (!l.id) { out.push(l); continue; }
    seen.add(l.id);
    const p = prev.get(l.id);
    // 強さ: 上がる時(初めて出た・消えかけから戻った)は、そのフレームから目標の8割以上(赤い予告の出始めを闇に沈めない)。下がる時は残光。
    const from = Math.max(p ? p.a : 0, l.a * LAB_REVEAL_IN_START);
    const a = l.a >= (p ? p.a : 0) ? easeToward(Math.min(from, l.a), l.a, dt, LAB_REVEAL_IN_TAU_MS) : easeToward(p!.a, l.a, dt, LAB_REVEAL_OUT_TAU_MS);
    // 2回目の削り: 危険の穴になったフレームから全開。外れる時(名札は居続ける)は残光で抜く(技の終わりに穴が1フレームで暗くならない)。
    // 名札ごと居なくなった時は hardK は残したまま、強さ a の側が残光で 0 へ落ちる(描画は a×hardK)。
    const hardK = l.hard ? 1 : easeToward(p ? (p.hardK ?? 0) : 0, 0, dt, LAB_REVEAL_OUT_TAU_MS);
    const e: LabLight = { ...l, a, hardK: hardK > 0.01 ? hardK : 0 };
    next.set(l.id, e); out.push(e);
  }
  for (const [id, p] of prev) {
    if (seen.has(id)) continue;
    const a = easeToward(p.a, 0, dt, LAB_REVEAL_OUT_TAU_MS);
    if (a <= 0.02) continue;
    const e = { ...p, a };
    next.set(id, e); out.push(e);
  }
  return { lights: out, next };
};
