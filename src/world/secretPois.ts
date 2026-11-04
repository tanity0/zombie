// 隠しPOI(research/HIDDEN_POI.md)。ステージ1・3・4・5の深層域に、ステージごとに固定で 7/7/8/8 個。
// 地図・矢印・拠点解放の印・結果画面には一度も出さない(完全に秘密)。正面(下)から触れると発見。
// 近づいた時だけ深層域のセピアが抜ける(唯一の手がかり=色)。
//
// この層は renderer-agnostic(PixiJS非依存)。位置・当たり判定・発見判定・セピアの係数の純関数だけ。
// 発見の記録は gameStore、描画は pixiScene がここの値を読む。
import { footRect, resolveAabb, touchesFromBelow, type Rect } from './obstacles';
import { AREA_THRESHOLDS } from '../utils/enemyUtils';

export interface SecretPoiDef {
  /** 'secret-01'〜'secret-30'(支給シートの左上から右へ・上の行からの番号)。 */
  id: string;
  /** 絵の名前(public/sprites/ からの相対・拡張子なし)。 */
  texture: string;
  name: string;
  /** 年表の動詞(「見つけた」「辿り着いた」など)。 */
  verb: string;
}

export interface SecretPoi extends SecretPoiDef {
  x: number;
  y: number;
}

/**
 * 名前と年表の動詞(§7)。番号=支給シートの並び。絵に描いてある物をなぞるだけの名前にしない(一覧では絵の真下に出る=
 * 名前は絵に無いこと=誰が・いつ・何があったかを足す・クリエイティブ監査#5)。同じ語を重ねない。
 * 帯の色を危険の赤にする語(危険/汚染/深層/検知 など)は使わない。
 */
const SECRET_NAMES: readonly (readonly [string, string])[] = [
  ['第三搬入坑', '足を踏み入れた'], ['紫晶の洞', '見つけた'], ['封鎖線の詰所', '辿り着いた'], ['喰われた獣', '見つけた'],
  ['根の心臓', '覗いた'], ['誰も知らない滝', '辿り着いた'], ['崩れた柱廊', 'くぐった'], ['七号観測室', '足を踏み入れた'],
  ['胞子溜まり', '覗いた'], ['読めない碑', '見つけた'], ['吊るされた檻', '覗いた'], ['祈り続ける者', '見つけた'],
  ['凍らない泉', '辿り着いた'], ['喉の奥', '覗いた'], ['消えない陣', '足を踏み入れた'], ['浸水した通路', '辿り着いた'],
  ['晶の苗床', '見つけた'], ['血溜まり', '見つけた'], ['孵らなかった卵', '覗いた'], ['天井の裂け目', '見上げた'],
  ['大百足の骸', '見つけた'], ['最後の野営', '辿り着いた'], ['開かずの門', 'くぐった'], ['燃え残る蝋燭', '見つけた'],
  ['段の水場', '辿り着いた'], ['名を削られた神', '見つけた'], ['終電', '見つけた'], ['肉の繭', '覗いた'],
  ['水鏡', '覗き込んだ'], ['紅い結晶床', '見つけた'],
];
/** 「に」を取る動詞(それ以外は「を」)。 */
const NI_VERBS = new Set(['足を踏み入れた', '辿り着いた']);
/** 年表の一文(例「七号観測室に足を踏み入れた」「喰われた獣を見つけた」)。 */
export const secretChroniclePhrase = (d: SecretPoiDef): string => `${d.name}${NI_VERBS.has(d.verb) ? 'に' : 'を'}${d.verb}`;
/** 隠しPOIの名前の集合(帯の色を決める HUD が引く)。 */
export const SECRET_POI_NAMES: ReadonlySet<string> = new Set(SECRET_NAMES.map(([n]) => n));

const defOf = (n: number): SecretPoiDef => {
  const nn = String(n).padStart(2, '0');
  const [name, verb] = SECRET_NAMES[n - 1];
  return { id: `secret-${nn}`, texture: `secret-poi/secret-poi-${nn}`, name, verb };
};

/**
 * ステージ → (裏ボスの巣の方角, [絵の番号, 巣の方角からの角度(度), 原点からの距離])。
 * 社長「30個あるので後半に+1個で」=1・3は7個、4・5は8個。巣の方角は world/pois.ts の BOSS_LAIR と同じ(1=西/3=東/4=北/5=南)。
 * - 絵は舞台に合わせて選ぶ(森=茸・根・晶 / 医療科学センター=端末・卵・陣 / 封鎖地域(雪)=湯気・水・像 / 軍本部=旗・野営・車両・骸)。
 * - **置き場所は1個ずつ手で決める**(等間隔の格子にしない=2個見つけても残りが読めない・品質監査A-4)。
 * - **各ステージの1個目は巣へ向かう道筋の脇の浅い所**(巣の方角±8°・距離11900=道筋から横へ約1650)。深層域で一番よく通る道の
 *   近くに1個置き、「色が戻る=何かある」を体で覚えさせる(品質監査A-3)。これより道筋へ寄せると裏ボスの出現範囲(巣から2250)に
 *   入る=触りに行くとボスが起きるので、ここが下限(巣から約2390)。
 * - 距離は深層域の境界(11250)+ゲート2の囲い(300)より奥、死神のリスク蓄積(21900)より手前。深い物は死神の気配の中。
 */
const STAGE_TABLE: Record<string, { lairAngle: number; spots: readonly (readonly [number, number, number])[] }> = {
  'stage-1': { lairAngle: Math.PI, spots: [
    [9, 8, 11900], [5, 58, 14700], [2, 97, 12800], [24, 151, 17300], [6, 188, 13600], [28, 236, 16200], [1, 292, 18400],
  ] },
  'stage-3': { lairAngle: 0, spots: [
    [8, -8, 11900], [19, 41, 16900], [15, 83, 13100], [14, 129, 18200], [17, 174, 12400], [23, 219, 15600], [10, 301, 14300],
  ] },
  'stage-4': { lairAngle: -Math.PI / 2, spots: [
    [13, 8, 11900], [29, 49, 13800], [25, 88, 17600], [16, 117, 12500], [20, 162, 15100], [12, 203, 18500], [26, 248, 13300], [7, 318, 16300],
  ] },
  'stage-5': { lairAngle: Math.PI / 2, spots: [
    [22, -8, 11900], [3, 36, 15900], [27, 71, 12700], [11, 109, 18100], [4, 158, 14000], [18, 196, 12300], [21, 244, 17000], [30, 287, 13600],
  ] },
};

/** 全30個の定義(年表の分母・一覧の並びに使う)。 */
export const ALL_SECRET_POI_DEFS: readonly SecretPoiDef[] = Array.from({ length: 30 }, (_, i) => defOf(i + 1));

/** そのステージに置く隠しPOIの番号(定義のみ・位置なし)。対象外のステージは空。 */
export const secretPoiDefsForStage = (stageId: string): SecretPoiDef[] =>
  (STAGE_TABLE[stageId]?.spots ?? []).map(([num]) => defOf(num));

/** そのステージの隠しPOI(位置つき・表の順)。対象外のステージは空。 */
export const secretPoisForStage = (stageId: string): SecretPoi[] => {
  const t = STAGE_TABLE[stageId];
  if (!t) return [];
  return t.spots.map(([num, deg, d]) => {
    const a = t.lairAngle + (deg * Math.PI) / 180;
    return { ...defOf(num), x: Math.cos(a) * d, y: Math.sin(a) * d };
  });
};

/** 深層域の境界(テスト用に export)。 */
export const SECRET_MIN_DIST = AREA_THRESHOLDS[3];

/** 表示の高さ(px・等倍時)。寄り道の建物188・祠170より一回り低い(斜め上から見た岩の塊の絵=箱庭の断面)。 */
export const SECRET_DISPLAY_H = 150;
/** 当たり判定=手前の縁(土台)。絵(約200×165)の下端に沿った帯。 */
export const SECRET_HITBOX_W = 140;
export const SECRET_HITBOX_H = 36;

export const secretPoiRect = (p: { x: number; y: number }): Rect => footRect(p.x, p.y, SECRET_HITBOX_W, SECRET_HITBOX_H);

/** 隠しPOIの土台で移動を解決する。遠い物は判定しない。 */
export const resolveSecretPoiCollision = (rect: Rect, pois: readonly SecretPoi[]): { x: number; y: number } => {
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  const walls: Rect[] = [];
  for (const p of pois) {
    if (Math.abs(cx - p.x) > 600 || Math.abs(cy - p.y) > 600) continue;
    walls.push(secretPoiRect(p));
  }
  if (walls.length === 0) return { x: rect.x, y: rect.y };
  return resolveAabb(rect, walls);
};

/** プレイヤーが正面(下)から触れている隠しPOI(無ければ null)。 */
export const secretPoiTouchedBy = (actor: Rect, pois: readonly SecretPoi[]): SecretPoi | null => {
  for (const p of pois) if (touchesFromBelow(actor, secretPoiRect(p))) return p;
  return null;
};

// ---- ボス戦が明けた時に重なっていたら弾き出す(社長指示2026-11-04) ----
/** 弾き出しの初速(px/s)と尺(ms)。減衰はプレイヤー/敵の既存のノックバック(線形に0)のまま。 */
export const SECRET_EJECT_SPEED = 900;
export const SECRET_EJECT_MS = 320;
/**
 * 隠れ処の土台に重なっている体を、どちらへ弾き出すか(単位ベクトル)。重なっていなければ null。
 * 向き=土台の中心から体の中心へ。ほぼ真上に重なっている時は手前(+Y=画面下)へ。
 */
export const secretEjectDir = (actor: Rect, pois: readonly { x: number; y: number }[]): { dx: number; dy: number } | null =>
  ejectDirFromRects(actor, pois.map(secretPoiRect));
/** 施設の土台(複数)のどれかに重なっている体を、どちらへ弾き出すか(単位ベクトル・重なっていなければ null)。全施設で共通。 */
export const ejectDirFromRects = (actor: Rect, rects: readonly Rect[]): { dx: number; dy: number } | null => {
  for (const r of rects) {
    const overlap = actor.x < r.x + r.width && actor.x + actor.width > r.x && actor.y < r.y + r.height && actor.y + actor.height > r.y;
    if (!overlap) continue;
    const dx = (actor.x + actor.width / 2) - (r.x + r.width / 2);
    const dy = (actor.y + actor.height / 2) - (r.y + r.height / 2);
    const len = Math.hypot(dx, dy);
    return len < 1 ? { dx: 0, dy: 1 } : { dx: dx / len, dy: dy / len };
  }
  return null;
};

// ---- 英雄たち(変異体の巡回)のルートに入らない(社長指示2026-11-04) ----
/** 巡回先の候補から外す半径(隠れ処の強制リラックスの範囲より広く取る)。 */
export const SECRET_PATROL_AVOID_DIST = 1200;
/**
 * 変異体(宇宙飛行群・亡霊ほか)の巡回先の候補から、隠れ処の近くの点を外す。
 * 隠れ処そのものは候補に入れない(秘密=誰も案内しない)。今の候補(巣・寄り道の建物・拠点・深層域より手前の無作為な点)は
 * どれも隠れ処から離れているが、将来候補を足しても入らないようにここを通す。
 */
export const excludeNearSecretPois = <T extends { x: number; y: number }>(
  cands: readonly (T | null | undefined)[], secrets: readonly { x: number; y: number }[],
): T[] => {
  const out: T[] = [];
  for (const c of cands) {
    if (!c) continue;
    if (secrets.some(s => Math.hypot(c.x - s.x, c.y - s.y) < SECRET_PATROL_AVOID_DIST)) continue;
    out.push(c);
  }
  return out;
};

// ---- 近くでは敵の湧きを強制リラックス(社長指示2026-11-04「このPOIの近くは敵の湧きも強制リラックスに」) ----
/**
 * この距離以内に隠しPOIがあれば、湧きを緩(リラックス)のコマとして読む。「画面に捉えた」と同じくらいの近さ
 * (スマホ縦の画面の縦半分 約470 + 色が戻り始める余白 260 ≈ 730 を丸めた値)。ゲーム判定なので画面ではなく距離で持つ。
 */
export const SECRET_RELAX_DIST = 750;
export const isNearSecretPoi = (px: number, py: number, pois: readonly { x: number; y: number }[]): boolean => {
  for (const p of pois) if (Math.hypot(px - p.x, py - p.y) <= SECRET_RELAX_DIST) return true;
  return false;
};

// ---- 画面に捉えた時だけセピアが抜ける(§4) ----
/**
 * 画面の縁の外、この距離から色が戻り始める(px・ワールド)。社長「画面内に捉えたくらいの距離」=判定は**画面の内外**。
 * 距離の円にしない(端末の縦横・ズームで「画面外なのに色が戻る/画面内なのにセピア」が起きる=品質監査A-1)。
 */
export const SECRET_COLOR_LEAD_PX = 260;

/**
 * セピアの残り具合(1=通常のセピア / 0=色が完全に戻る)。`outsidePx`=いちばん近い隠しPOIの、画面の縁からの距離
 * (画面の中=0)。画面に入ったら色が戻り切り、縁の外 SECRET_COLOR_LEAD_PX から戻り始める。間は smoothstep。
 * 描画側はこれをセピアの目標に掛け、フィルタ自体のフェード(約1秒)はそのまま通す=急に色が変わらない。
 */
export const secretSepiaMult = (outsidePx: number): number => {
  if (outsidePx <= 0) return 0;
  if (outsidePx >= SECRET_COLOR_LEAD_PX) return 1;
  const t = outsidePx / SECRET_COLOR_LEAD_PX;
  return t * t * (3 - 2 * t);
};
