import type { EnemyType } from '../types/game';

// 文脈カメラズーム: 敵が多い/大型がいるほど「少し」引く。当たり/射程は変えないが、スポーンと
// ボスの交戦・離脱・画面外判定は、引いた分の実可視域に合わせる(=同じ target をゲームロジックも読む)。
// この純関数を pixiScene(カメラ)と useGameLoop/store(判定)の両方から使う。
//
// 社長指示の効き幅(私案・実機調整前提):
//  ・引きは「一回り」= 最大 CONTEXT_ZOOM_MIN(0.9)。
//  ・敵数 7体までは固定(引かない)、8体以上で線形に引き、20体で最大。
//  ・通常の大型(reaper/hunter)は従来どおり0.7。正規ボスは体格と距離に応じた専用値を使う。

export const CONTEXT_ZOOM_MIN = 0.8;        // 最大の引き(社長指示で引き幅2倍: 1.0→0.9 の 0.1 → 0.2)
export const CONTEXT_ZOOM_COUNT_FLOOR = 7;  // この体数までは引かない
export const CONTEXT_ZOOM_COUNT_CEIL = 20;  // この体数で最大引き

// 通常戦闘の引き(体数ドリブン=CONTEXT_ZOOM_MIN)は**据え置き**。`?bosszoom=0.65` 等を
// 指定した時は距離/体格プロファイルを固定値で上書きできる(0.3〜1)。指定無しなら下記の既定値。
const BOSS_ZOOM_OVERRIDE: number | null = (() => {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('bosszoom');
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0.3 && n <= 1 ? n : null;
})();
export const BOSS_ZOOM_MIN = BOSS_ZOOM_OVERRIDE ?? 0.7;

// Boss camera v3(社長指示v0.25.2947「ボスの足元では等倍。そこからの引き倍率」):
// 近(足元)=**等倍1.0** → 中距離=**1.7倍引き(1/1.7≈0.59)** → 遠距離(離脱帯まで)=**2.5倍引き(0.40)**。
// 3倍引き(0.33)は保留: 新ドット素材(1ドット≈2.24ワールドpx)が1画面px を割って間引きチラつきが
// 出る領域のため、まず2.5倍で実機確認(社長)。Distances are AABB-edge gaps, not centre-to-centre,
// so a very wide boss does not zoom out merely because its centre is far away.
export const BOSS_DISTANCE_ZOOM_NEAR_PX = 180;   // ここまで=足元(等倍)
export const BOSS_DISTANCE_ZOOM_MID_PX = 500;    // 中距離アンカー(旧FAR)
export const BOSS_DISTANCE_ZOOM_FAR_PX = 1200;   // 遠距離アンカー(以遠は張り付き。離脱判定は画面px基準で別途換算)
export const BOSS_ZOOM_NEAR = 1.0;               // 足元=等倍(社長指示)
export const BOSS_ZOOM_MID = 1 / 1.7;            // ≈0.588=「中距離で1.7倍引き」
export const BOSS_DISTANCE_ZOOM_MIN = BOSS_ZOOM_OVERRIDE ?? 0.40;
export const BOSS_DISTANCE_ZOOM_TAU = 0.45;
export const BOSS_DISTANCE_ZOOM_RETURN_TAU = 1.0;

export type BossZoomClass = 'compact' | 'standard' | 'giant';
export interface BossZoomProfile { near: number; mid: number; far: number }

// far のみ体格で差を付ける(人型ボスまで2.5倍で引くと絵が米粒になるため浅め)。near/mid は全級共通。
export const BOSS_ZOOM_PROFILES: Record<BossZoomClass, BossZoomProfile> = {
  compact: { near: BOSS_ZOOM_NEAR, mid: BOSS_ZOOM_MID, far: 0.48 },
  standard: { near: BOSS_ZOOM_NEAR, mid: BOSS_ZOOM_MID, far: 0.44 },
  giant: { near: BOSS_ZOOM_NEAR, mid: BOSS_ZOOM_MID, far: 0.40 },
};

const COMPACT_BOSS_TYPES = new Set<EnemyType>([
  'miguel', 'jibril', 'rafi', 'uri', 'suriel', 'acrasiel', 'idol',
]);
const GIANT_BOSS_TYPES = new Set<EnemyType>(['mimir', 'jormungand', 'skadi']);

export const bossZoomClassFor = (type: EnemyType, isStoryBoss = false): BossZoomClass => {
  if (type === 'giantbat' && isStoryBoss) return 'giant';
  if (GIANT_BOSS_TYPES.has(type)) return 'giant';
  if (COMPACT_BOSS_TYPES.has(type)) return 'compact';
  return 'standard';
};

const smooth01 = (raw: number): number => {
  const t = Math.max(0, Math.min(1, raw));
  return t * t * (3 - 2 * t);
};

// v0.25.2954(社長指示「引きになる位置が遅い。ボスが見えない位置で引きになってる」): フレーミング項。
// 被写体(ボス中心)が画面端に近づいたら、距離アンカー曲線を待たずに「映るのに必要なズーム」まで先に引く。
//
// ★何倍まで引けるかの算定(社長依頼の答え):
//  - 床は現行の**2.5倍引き(0.40)が上限**。根拠1: 新ドット素材は1ドット≈2.24wpx で、0.40だと
//    1ドット≈0.90画面px。これ未満(3倍引き0.33≈0.75px)は間引きチラつき領域(v0.25.2947で3倍引きを
//    保留したのと同じ根拠)。根拠2: ZOOM_MIN_ABS=0.40 で監査済みのオーバースキャン/湧き/回収/マスク系を
//    そのまま使える(床を下げると全レイヤー再監査=CLAUDE.mdズーム掟)。
//  - 床0.40で縦に捉えられる限界=中心距離 (H/2−マージン)/0.40(800×600なら約610wpx)。横は約860wpx。
//    それより遠い被写体は物理的に映せない(=そこは交戦域の広さ側で扱う)。
export const BOSS_FRAME_EDGE_MARGIN_PX = 40; // 被写体中心を可視窓の端からこの画面px内側に保つ
// v0.25.2969(Sonnetのヘッドレス実写で確定): 実機は**縦持ち(例390×844)**で、アクターが実際に見えるのは
// 画面全体ではなく**中央の帯**(上≈1/3は遠景アート・下≈1/4は前景の霧)。フレーミングの縦基準を
// 画面全高にすると「縦は余裕」と誤認して引かず(社長報告「上下がボス見えない」)、横は幅が狭いので
// 過剰に引く(「豆粒」)。縦の基準は**帯の高さ=画面高×この係数**で測る。
export const BOSS_FRAME_BAND_H_FRAC = 0.45;
export const bossFramingZoom = (
  dxCenter: number, dyCenter: number, viewport: { width: number; height: number },
): number => {
  // 役割分担(社長スクショ3枚+実写から):
  // ・**縦=ズーム担当**: 帯の半径で全量を測る=上下に離れたら素直に引いてボスを小さく映す。
  // ・**横=寄せ担当**: 要求は中心差の半分(寄せ50%が負担)。さらに**床=BOSS_ZOOM_MID(1.7倍引き)**を
  //   割らない=横のためにそれ以上は引かない(縦持ちの狭い幅で豆粒化するくらいなら、画面外は
  //   オフスクリーン矢印+即帰巣リーシュ(v0.25.2968)に任せる)。
  const bandHalfY = (viewport.height * BOSS_FRAME_BAND_H_FRAC) / 2;
  const needY = Math.max(0.01, bandHalfY - BOSS_FRAME_EDGE_MARGIN_PX) / Math.max(1, Math.abs(dyCenter));
  const needX = Math.max(
    BOSS_ZOOM_MID,
    (viewport.width / 2 - BOSS_FRAME_EDGE_MARGIN_PX) / Math.max(1, Math.abs(dxCenter) / 2),
  );
  return Math.min(needX, needY);
};

export interface BossFramingInput { dxCenter: number; dyCenter: number; viewport: { width: number; height: number } }

export const bossDistanceZoomTarget = (
  type: EnemyType, bodyDistancePx: number, isStoryBoss = false,
  framing?: BossFramingInput,
): number => {
  if (BOSS_ZOOM_OVERRIDE != null) return BOSS_ZOOM_OVERRIDE;
  const profile = BOSS_ZOOM_PROFILES[bossZoomClassFor(type, isStoryBoss)];
  // v0.25.3013(社長指示「一定の距離を越えると一気にグイッとカーブがかかる。そうではなく常に一定に
  // 離れていくように」): 旧「2段スムーズステップ(足元→中1.7倍引き→遠)」は、足元の平坦帯を抜けた
  // 直後の区間(NEAR→MID)だけ勾配が急=「グイッ」の正体だった。**足元(NEAR以内)=等倍(v2947不変)、
  // そこから最深(FAR)まで距離に比例した一直線**へ変更=どの距離でも同じ割合で引けていく。
  // 中間アンカー(BOSS_ZOOM_MID)は距離カーブからは撤去(フレーミングの横床としては存続)。
  const anchor = bodyDistancePx <= BOSS_DISTANCE_ZOOM_NEAR_PX
    ? profile.near
    : profile.near + (profile.far - profile.near) * Math.min(1,
        (bodyDistancePx - BOSS_DISTANCE_ZOOM_NEAR_PX)
        / (BOSS_DISTANCE_ZOOM_FAR_PX - BOSS_DISTANCE_ZOOM_NEAR_PX));
  if (!framing) return anchor;
  // 足元(NEAR以内)は等倍のまま(社長裁定v0.25.2947「足元では等倍」不変)。それより外では
  // アンカー曲線とフレーミング要求の**引きが強い方**を採る(=見えなくなるより早めに引く)。床はfar。
  // v0.25.2964: フレーミング項はNEAR→MIDの間で滑らかに効かせる(旧: NEAR境界の外側で即フル適用=
  // 境界をまたぐたびに目標が段差で飛び、ぎこちなさの一因だった)。
  if (bodyDistancePx <= BOSS_DISTANCE_ZOOM_NEAR_PX) return anchor;
  const frame = bossFramingZoom(framing.dxCenter, framing.dyCenter, framing.viewport);
  const w = smooth01((bodyDistancePx - BOSS_DISTANCE_ZOOM_NEAR_PX)
    / (BOSS_DISTANCE_ZOOM_MID_PX - BOSS_DISTANCE_ZOOM_NEAR_PX));
  const blended = anchor + (Math.min(anchor, frame) - anchor) * w; // frameが強い分だけwで効かせる
  return Math.max(profile.far, blended);
};

export interface Aabb { x: number; y: number; width: number; height: number }
export const aabbGapDistance = (a: Aabb, b: Aabb): number => {
  const dx = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), 0);
  const dy = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height), 0);
  return Math.hypot(dx, dy);
};

/** ズーム後も画面上の距離を一定に保つため、画面pxをワールドpxへ戻す。寄り方向では拡縮しない。 */
export const zoomCompensatedWorldDistance = (screenPx: number, zoom: number): number => {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? Math.min(1, zoom) : 1;
  return screenPx / safeZoom;
};

export interface ZoomedViewportBounds { left: number; top: number; right: number; bottom: number }

/** 引きズーム後に実際に見えるワールド矩形。余白は画面pxの見た目を保ったまま換算する。
 * marginXScreenPx(省略時=marginScreenPx)で左右だけ余白を変えられる(v0.25.3005・社長指摘
 * 「左右だけズーム射程と撤退ラインが短くない?」対応: 縦長画面の左右不足分を呼び出し側が足す)。 */
export const zoomedViewportBounds = (
  camera: { x: number; y: number }, viewport: { width: number; height: number },
  zoom: number, marginScreenPx = 0, marginXScreenPx = marginScreenPx,
): ZoomedViewportBounds => {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? Math.min(1, zoom) : 1;
  const visibleW = viewport.width / safeZoom;
  const visibleH = viewport.height / safeZoom;
  const extraX = (visibleW - viewport.width) / 2;
  const extraY = (visibleH - viewport.height) / 2;
  const marginWorldY = marginScreenPx / safeZoom;
  const marginWorldX = marginXScreenPx / safeZoom;
  return {
    left: camera.x - extraX - marginWorldX,
    top: camera.y - extraY - marginWorldY,
    right: camera.x + viewport.width + extraX + marginWorldX,
    bottom: camera.y + viewport.height + extraY + marginWorldY,
  };
};

export const isPointInZoomedViewport = (
  x: number, y: number,
  camera: { x: number; y: number }, viewport: { width: number; height: number },
  zoom: number, marginScreenPx = 0, marginXScreenPx = marginScreenPx,
): boolean => {
  const b = zoomedViewportBounds(camera, viewport, zoom, marginScreenPx, marginXScreenPx);
  return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
};

// (v3005の bossOffscreenExtraMarginX/Y は v0.25.3018 の案A「プレイヤー中心の一律距離」
//  (bossEngagement.ts の bossRetreatKeepRadiusPx)への置き換えで撤去。)

// ★**安全マージンの基準はこの絶対最小値**(v0.25.2412)。
// 背景のオーバースキャン(ZOOM_OVERSCAN)・敵の回収/湧き距離・カリングは「**一番引いた時でも
// 破綻しない**」ことが条件なので、`CONTEXT_ZOOM_MIN` ではなく必ずこちらを見ること。
// CLAUDE.md の「ズーム引き考慮(必須)」で言及している v0.25.1324/1325 の潜伏バグは、
// 引きの値とマージンの基準がズレると再発する(レイヤーごとに漏れて潜伏するので気づきにくい)。
export const ZOOM_MIN_ABS = Math.min(CONTEXT_ZOOM_MIN, BOSS_ZOOM_MIN, BOSS_DISTANCE_ZOOM_MIN);

// 大型敵(即・最大引き対象)。パンプキン/screamer は含めない(社長指示)。
const LARGE_ZOOM_TYPES = new Set<string>(['reaper', 'giantbat', 'mimir', 'jormungand', 'skadi', 'thor', 'hunter']);
export const isLargeForZoom = (type: string): boolean => LARGE_ZOOM_TYPES.has(type);

// デバッグ: ?zoomlock=1 で常時最大引き(CONTEXT_ZOOM_MIN)に固定、?zoomlock=0.9 等の数値でその倍率に固定。
// ズーム引き対応漏れ(v0.25.1324/1325で修正した潜伏バグの類)を意図的に炙り出すための開発用フラグ。
// 描画(pixiScene)と湧き/回収(useGameLoop)の両方が contextZoomTarget を読むため、ここで固定すれば
// 全系統が一貫する。通常プレイ(パラメータ無し)は完全に従来どおり(社長承認 v0.25.1331)。
const ZOOM_LOCK: number | null = (() => {
  if (typeof window === 'undefined') return null; // ヘッドレス(テスト)では常に無効
  const v = new URLSearchParams(window.location.search).get('zoomlock');
  if (v == null) return null;
  if (v === '1') return CONTEXT_ZOOM_MIN;
  const n = Number(v);
  return Number.isFinite(n) && n > 0.3 && n <= 1 ? n : CONTEXT_ZOOM_MIN;
})();

// 目標ズーム(1.0=等倍)。敵数・大型・交戦中ボスのうち「最も深い引き」を採用。
export const contextZoomTarget = (
  enemyCount: number, hasLarge: boolean, engagedBossTarget: number | null = null,
): number => {
  if (ZOOM_LOCK != null) return ZOOM_LOCK;
  const t = Math.min(1, (enemyCount - CONTEXT_ZOOM_COUNT_FLOOR) / (CONTEXT_ZOOM_COUNT_CEIL - CONTEXT_ZOOM_COUNT_FLOOR));
  const crowdTarget = enemyCount <= CONTEXT_ZOOM_COUNT_FLOOR
    ? 1
    : 1 + (CONTEXT_ZOOM_MIN - 1) * t;
  return Math.min(crowdTarget, hasLarge ? BOSS_ZOOM_MIN : 1, engagedBossTarget ?? 1);
};

// §6.37 v6(社長指示2026-08-07「ズームが引になったら上下の幅を揃える方向に調整」):
// ボス交戦の引きズームに応じてカメラの下げ量(camdown)を増やし、プレイヤーの画面位置を
// 「地平線と画面下端のちょうど中間」へ寄せる=プレイヤーから上(地平線まで)と下(画面下端まで)の
// 地面の幅が等しくなる。
// 導出: 引きの縦支点=地平線(farH)のとき プレイヤー画面比 p(z) = (0.5+off)·z + f·(1-z)
// (f=地平線の画面比)。これを p = (1+f)/2(=地平線と下端の中間)に置くと off = [0.5(1-z) - f(0.5-z)] / z。
// z=1 では off=f/2 < 従来カメラ下げの想定域 → max() で従来値がそのまま勝つ(等倍の構図は不変)。
// CAMERA_HORIZON_FRAC は描画側 FAR_BACKDROP_HEIGHT_RATIO(pixiScene・0.26)の写し(clamp前の近似)。
// 値を変える時は両方を揃えること。スポーン帯(spawnViewOffsetY)もカメラと同じこの値を読むこと
// (v0.25.2148の教訓: カメラとズレると上端で湧きが見える)。
export const CAMERA_HORIZON_FRAC = 0.26;
export const zoomCameraDownFrac = (baseFrac: number, zoom: number): number => {
  if (zoom >= 1) return baseFrac;
  const z = Math.max(ZOOM_MIN_ABS, zoom);
  const eq = (0.5 * (1 - z) - CAMERA_HORIZON_FRAC * (0.5 - z)) / z;
  return Math.max(baseFrac, eq);
};

// §6.37 v7(社長指示2026-08-08「左右みたいに、上下もカメラをそちらに寄せれないの？」):
// ボス方向への**縦のカメラ先読み(store側)**。縦は描画側のパン(worldGroupずらし)だと床の上端が
// 地平線から剥がれて「上の地面切れ」が再発するため、**カメラ本体を寄せる**(床帯はカメラ非追従=
// 地平線に貼り付いたまま。スポーン/回収/フェードは全部カメラ基準なので自動で一貫)。
// 返り値は「カメラをボス側へ寄せる世界px」(正=北/上へ寄せる)。
//
// v0.25.3002(社長報告「まだボスが上の被写体深度の中にいるのが基準になっちゃってる」):
// 北のボスは「中心差の半分・上限クランプ」(v2995〜)をやめ、**「ボスを目標の画面高さ
// (BOSS_LEAD_TARGET_SCREEN_FRAC=上のボケ/フェード帯の下)まで引き込む」を直接解く**。
// 旧方式は遠いボスで必ず上限に張り付き、毎回同じ高さ(=ボケ帯の中)に収束していた(報告の正体)。
// プレイヤーは BOSS_LEAD_PLAYER_MAX_FRAC までしか下げない(そこまで寄せても届かない超遠距離は
// 素直に諦める=画面外/上帯のまま)。南のボスは従来どおり中間寄せ+上限(下側にボケ帯問題は無い)。
export const BOSS_CAMERA_LEAD_FRAC = 0.5;             // 南側: 横の寄せ(bossBiasDx*0.5)と同じ「中間寄せ」
export const BOSS_CAMERA_LEAD_MAX_SCREEN_FRAC = 0.18; // 南側: プレイヤーの画面ずれ上限(画面高比)
// v0.25.3015(社長指示): ①ターゲットは寄り引きに関わらず遠景・被写界深度に掛からない位置へ
// (0.36=ギリギリ掛かる→0.44へ下げ) ②かなり引いた時のプレイヤーが近景(手前の茂み)に隠れるため、
// 下限を少し上へ(0.84→0.78)。
export const BOSS_LEAD_TARGET_SCREEN_FRAC = 0.50;     // 北側: ボスをこの画面高さまで引き込む(0.36→0.44→0.50・社長指示「上の位置だけさらに下げたい」)
export const BOSS_LEAD_PLAYER_MAX_FRAC = 0.78;        // 北側: プレイヤーをこの画面高さまでしか下げない
export const bossCameraLeadY = (dyCenter: number, viewH: number, zoom: number): number => {
  const z = Math.max(ZOOM_MIN_ABS, Math.min(1, zoom));
  if (dyCenter >= 0) {
    // 南(ボスが下): 中間寄せ+上限(従来)。負=カメラを南へ。
    const cap = (BOSS_CAMERA_LEAD_MAX_SCREEN_FRAC * viewH) / z;
    return Math.max(-cap, Math.min(0, -dyCenter * BOSS_CAMERA_LEAD_FRAC));
  }
  // 北(ボスが上): 均衡構図(プレイヤー画面比=(1+f)/2)を基準に、ボスが目標ラインへ来る
  // 画面下方向シフトSを解き、プレイヤー下限までの余地でクランプする。
  const pBal = (1 + CAMERA_HORIZON_FRAC) / 2;           // 均衡構図のプレイヤー画面比(≈0.63)
  const bossBasePx = pBal * viewH + dyCenter * z;       // 先読み無しのボス画面Y(近似)
  const wantShiftPx = BOSS_LEAD_TARGET_SCREEN_FRAC * viewH - bossBasePx;
  const maxShiftPx = (BOSS_LEAD_PLAYER_MAX_FRAC - pBal) * viewH; // ≈0.21H
  return Math.max(0, Math.min(maxShiftPx, wantShiftPx)) / z;
};
