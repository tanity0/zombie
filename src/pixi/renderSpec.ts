// Visual spec: how a gameplay hitbox maps to its on-screen drawing box.
//
// CORE RULE — the sprite's look is decoupled from the collision box. Gameplay
// (collision, ranges, ammo, counters) only ever uses Player/Enemy width/height
// from the store. Nothing here feeds back into the simulation; it only decides
// how big to draw a sprite and where its FEET sit, which is also the value used
// for Y-sorting. Swap real sprites in later by changing only these numbers.

import type { Enemy, Player, Summon } from '../types/game';
import { ZOOM_MIN_ABS } from '../utils/cameraZoom';

// The sprites read as chunky pixel art by drawing larger than their gameplay
// hitboxes. Feet stay anchored to the hitbox bottom; the extra height rises
// upward, so collision and melee ranges remain unchanged.
export const PLAYER_VISUAL_SCALE = 2.3;

const ENEMY_VISUAL_SCALE: Partial<Record<Enemy['type'], number>> = {
  bat: 2.35,
  skeleton: 2.15,
  zombie: 2.1,
  plant: 2.15,
  ghost: 2.0,
  werewolf: 2.05,
  // 社長指示v0.25.3174「パンプキンの大きさを少しだけ大きく」: 1.75→1.95(絵の幅 105→117px)。
  // ★この倍率は**足元の判定帯(enemyHitStrip)にも同じ割合で効く**(帯=影=見えている足元の幅、という
  // ENEMY_SHADOW_WIDTH_FRAC の規格)。旧: ゾンビ(113px)より小さい絵だったのでエリートに見えなかった。
  pumpkin: 1.95,
  giantbat: 1.55,
  reaper: 1.45,
  hunter: 1.9, // ハンター変異体(ミニボス級の存在感)
  screamer: 1.95, // 変異体(叫喚型・やや大きめの存在感)
  // PACING_PUZZLE.md §6.38 B1.5-7(賞金首): 未登録だと既定値2.0(パンプキン1.95〜werewolf2.05の
  // ヘビー級帯からわずかに外れる)にフォールバックしていた。4型とも同じ体格(ENEMY_STATS)なので
  // 一律1.95(パンプキン相当)を叩き台として明示登録する。
  'bounty-ranged': 1.95,
  'bounty-melee': 1.95,
  'bounty-balance': 1.95,
  'bounty-maiko': 1.95,
};

// A foot-anchored draw box in WORLD space. `footX/footY` is the bottom-centre
// the sprite is pinned to (also its Y-sort key); `boxW/boxH` is the box the
// texture is "contain"-fitted into.
export interface FootBox {
  footX: number;
  footY: number;
  boxW: number;
  boxH: number;
}

export const playerFootBox = (p: Player): FootBox => {
  const boxW = p.width * PLAYER_VISUAL_SCALE;
  const boxH = p.height * PLAYER_VISUAL_SCALE;
  const cx = p.x + p.width / 2;
  // Foot sits on the hitbox BOTTOM (not below it), so the drawn feet line up
  // with the collision the simulation uses — see the obstacle convention in
  // CLAUDE.md / src/world/obstacles.ts. The oversized sprite then rises upward
  // from there.
  return { footX: cx, footY: p.y + p.height, boxW, boxH };
};

// 通常敵(非・裏ボス)の【見た目だけ】の一括倍率(段階調整用・社長指示)。当たり判定は裏ボスと同じ「帯」方式
// (=ゲーム上の生の矩形 e.width×e.height)に統一したので、この倍率は描画(enemyFootBox)にしか掛からない。
// 帯はこの描画ボックスの下部中央バンドに一致する(footY=足元に底辺・上へ伸びる)=裏ボスの足元帯と同構造。
export const ENEMY_SIZE_MULT = 1.5;

export const enemyFootBox = (e: Enemy): FootBox => {
  const scale = (ENEMY_VISUAL_SCALE[e.type] ?? 2) * ENEMY_SIZE_MULT;
  return {
    footX: e.x + e.width / 2,
    footY: e.y + e.height,
    boxW: e.width * scale,
    boxH: e.height * scale,
  };
};

// 敵スプライト素材の縦横比(texH/texW)を type×バリアント(default/stage3)別に登録する小さなレジストリ。
// 描画は containScale で枠(boxW×boxH)に内接させるため、横長素材は実描画が枠より低くなる=頭の位置が
// 素材ごとに変わる。PHILLサークルの「頭スナップ」を実描画に合わせるためのデータ橋渡し(描画→ロジック)。
const enemyArtAspect = new Map<string, number>();
export const setEnemyArtAspect = (key: string, aspect: number): void => { if (aspect > 0 && Number.isFinite(aspect)) enemyArtAspect.set(key, aspect); };

// 足元から見た「頭付近」の世界Y。実描画の縦範囲(box内接フィット)に基づき、その上部=頭へスナップさせる。
// stage3=廃都の敵絵バリアント。アスペクト未登録時は従来どおり box の 0.83 にフォールバック。
export const enemyHeadY = (e: Enemy, stage3: boolean): number => {
  const fb = enemyFootBox(e);
  const aspect = enemyArtAspect.get((stage3 ? 'stage3:' : 'default:') + e.type) ?? enemyArtAspect.get('default:' + e.type);
  if (aspect == null) return fb.footY - fb.boxH * 0.83;
  // 実描画の縦割合 = min(1, (boxW/boxH)×(texH/texW))。その上部(×0.86)を頭中心の目安に。
  const dispFrac = Math.min(1, (fb.boxW / Math.max(1, fb.boxH)) * aspect);
  return fb.footY - fb.boxH * dispFrac * 0.86;
};

// 当たり判定の「帯」幅の規格。Pixiの接地影(actorShadowWidthFromSprite)と同じ「実描画スプライト幅×0.55」。
// 社長指示:「帯は影と同じ規格の幅で」。これで帯=影=見えてる足元の幅、が揃う。
export const ENEMY_SHADOW_WIDTH_FRAC = 0.55;
// 帯の高さ=実描画スプライト高さ×この割合(足元を底に固定して上へ伸ばす)。社長指示で 50%(=見た目の下半分が当たり判定)。
// 実機で微調整可。1.0=見た目の全身が当たり判定。
export const ENEMY_STRIP_HEIGHT_FRAC = 0.5;

// 通常敵(非・裏ボス)の当たり判定「帯」(AABB)。幅=影と同規格(実描画幅×0.55)、高さ=実描画高さ×ENEMY_STRIP_HEIGHT_FRAC、
// 足元アンカー(footX中心・footYが底)で上方向へ伸ばす。実描画寸法は contain フィット(min(boxW,boxH/アスペクト) /
// min(boxH,boxW×アスペクト))で影/絵の実寸と一致(アスペクト未登録時は box にフォールバック)。深度スケールは掛けない
// (当たり判定不変)。裏ボスは別経路(生の帯=ENEMY_STATS)なので呼び出し側で除外する。
export const enemyHitStrip = (e: Enemy): { x: number; y: number; width: number; height: number } => {
  const fb = enemyFootBox(e);
  const aspect = enemyArtAspect.get('default:' + e.type); // texH/texW
  const drawnW = aspect && aspect > 0 ? Math.min(fb.boxW, fb.boxH / aspect) : fb.boxW;
  const drawnH = aspect && aspect > 0 ? Math.min(fb.boxH, fb.boxW * aspect) : fb.boxH;
  const w = drawnW * ENEMY_SHADOW_WIDTH_FRAC;
  const h = drawnH * ENEMY_STRIP_HEIGHT_FRAC;
  return { x: fb.footX - w / 2, y: fb.footY - h, width: w, height: h };
};

// 召喚ユニットは流用元の敵タイプと同じ視覚スケールで描く(敵と大きさを揃える)。
export const summonFootBox = (s: Summon): FootBox => {
  const scale = ENEMY_VISUAL_SCALE[s.reusedType] ?? 2;
  return {
    footX: s.x + s.width / 2,
    footY: s.y + s.height,
    boxW: s.width * scale,
    boxH: s.height * scale,
  };
};

// ---------------------------------------------------------------------------
// 地平線フェード帯の幅(社長裁定v0.25.2334・案A)。
//
// 背景: 「地平線に近いアクターは薄れて消える」フェードは、**敵・木・城・商人・NPC・護衛・プロップ・
// 建物のすべて**が共有している(`pixiScene.horizonActorAlpha`)。その帯幅は 120px 固定だったが、
// これは**縦持ちの論理画面高(≒876)に対して調整された値**だった。
//
// 実測(v0.25.2331のテスト): 横持ちPC(1280×800)では論理画面高が **338** まで潰れる(ズーム1.48倍)。
// すると地平線がアクターのすぐ上に来て、120pxの帯が画面のほぼ全体を覆う。結果、足元にある廃病院が
// **alpha 0.216**、**プレイヤー自身ですら 0.783** まで薄くなっていた(=病院固有ではなく横持ち全体の欠陥)。
// なお OrientationGuard は「PC(非タッチ)は横向きで遊ぶため対象外」なので、横持ちは正式なサポート対象。
//
// 直し方(**案A-2**・社長裁定v0.25.2346「横持ち無いので」):
// **縦持ちなら画面高に関係なく常に従来の120px固定**、**横持ちの時だけ**画面高に比例させて縮める。
//
// ※ v0.25.2334の初版(案A-1)は縦横を区別せず `min(120, 高さ×0.14)` にしていた。876×0.14=122.6 なので
//   主力端末では上限に張り付いて従来と同値になるが、**iPhone SE(375×667=論理720)だけ 100.9px** に
//   なっていた。横持ちを遊ばない以上、**使わないモードのために縦持ちの最小端末を変えるのは損しかない**
//   ため、縦持ちを完全な固定へ戻した(=SEも含め全ての縦持ち端末が従来と1pxも変わらない)。
// ※ 横持ちを捨てたわけではない(PCのテストで使う)。比例式はそのまま残すので、上の欠陥は直ったまま。
//
// 縦横の判定は**論理サイズのアスペクト比**(h >= w)で行う。論理サイズは端末の比率をそのまま保つので
// (390×844→405×876 / 1280×800→540×337.5 = どちらも比率一致)、閾値を別に持つ必要がない。
/** 縦持ちの帯幅(px)。**縦持ちでは常にこの値**。横持ちでは上限としてはたらく。 */
export const HORIZON_ACTOR_FADE_PX = 120;
/** 横持ち時に帯幅が食ってよい論理画面高の割合。120/876≒0.137 と同じ水準を横でも保つ。 */
export const HORIZON_FADE_SCREEN_FRAC = 0.14;
/** 帯幅の下限(px)。極端に低い画面でも帯が消えて「アクターが地平線でパツンと切れる」のを防ぐ。 */
export const HORIZON_FADE_MIN_PX = 32;

/**
 * 論理画面サイズ → 地平線フェード帯の幅(px)。
 * **縦持ち(h >= w)は端末を問わず常に120**。横持ち(≒540×338)でのみ約47pxまで縮む。
 */
export const horizonActorFadePx = (screenH: number, screenW: number): number => {
  if (!Number.isFinite(screenH) || screenH <= 0) return HORIZON_ACTOR_FADE_PX;
  // 幅が壊れている/取れていない時は縦持ち扱い=従来値。横持ちの誤検出で縦の絵を変えない方に倒す。
  if (!Number.isFinite(screenW) || screenW <= 0 || screenH >= screenW) return HORIZON_ACTOR_FADE_PX;
  return Math.max(HORIZON_FADE_MIN_PX, Math.min(HORIZON_ACTOR_FADE_PX, screenH * HORIZON_FADE_SCREEN_FRAC));
};

// ---- ボスの「裏回り透け」を掛けてよい絵の大きさ(v0.25.2615) -------------------------------------
// pixiScene の透け処理は、コメントどおり「**巨体の絵で自機が隠れないよう**薄く透かす」ための救済。
// ところが対象を絞っていなかったため、**自機を隠せない大きさの人型ボスにも掛かり**、
// 条件が揃うと alpha=0(完全透明)まで落ちていた。当たり判定は不変なので
// 「見えないのに殺される」(社長報告v0.25.2614「どこにいても影しかない…当たり判定だけあって透明」)。
//
// 絵の幅 = 当たり判定幅 / BOSS_SPRITE_FIT[type].w。実測(自機幅 PLAYER_HITBOX=28):
//   idol 95px(3.40倍) / acrasiel 109px(3.90倍) / 天使5体 120px(**4.29倍**)
//   ‖ 谷 ‖ thor 280px(**10.0倍**) / skadi 330px(11.8倍) / mimir 451px(16.1倍) / jormungand 570px(20.4倍)
// 4.29倍と10.0倍の間が完全に空いているので **谷の中央=7倍** を閾値にする(絶対値をベタ書きしない)。
// 人型サイズを除外側に置く理由: 自機は横へ一歩ずれれば絵からはみ出せる一方、半径300pxのアリーナで
// ボスが透明になる害は比較にならないほど大きい。
export const BOSS_BEHIND_MIN_SPRITE_W_MULT = 7;

/** その絵に「裏回り透け」を掛けてよいか(=自機を隠しうる大きさか)。描画のみ・判定には無関係。 */
export const bossBehindFadeApplies = (spriteW: number, playerW: number): boolean =>
  spriteW >= playerW * BOSS_BEHIND_MIN_SPRITE_W_MULT;

// ---------------------------------------------------------------------------
// §6.37 FIELD-WIDE-ZOOM: post-zoom 変換の純関数(PACING_PUZZLE.md §6.37)。
//
// 前提: worldGroup(床/森/アクターを含む世界)は「画面中央を基準に scale=zoom で拡縮 + position で
// 平行移動」される(pixiScene.sync のズーム適用)。worldGroup の子である何か(アクターの足元Yなど)の
// 「ローカルY」(=worldGroup変換を適用する前のY。zoom=1・position=(0,0)なら screenY と一致する)を、
// 実際に画面へ描かれる位置(post-zoom screenY)へ変換するのがこの1本の式。
//
// 恒等条件(PACING_PUZZLE.md §6.37 受け入れ条件1): zoom=1 かつ offsetY=0(worldGroupの変換が恒等)の
// とき、postZoomScreenY(L, 1, 0) === L となり、旧来の「ローカルY=スクリーンY」前提の式と厳密一致する。
export const postZoomScreenY = (localY: number, zoom: number, offsetY: number): number =>
  localY * zoom + offsetY;

// 逆変換: 「画面上でこの screenY に見せたい」という**固定のスクリーンY**を、現在の zoom/offsetY のもとで
// worldGroup のローカル座標に置くには何ローカルYに置けばよいか。worldFadeMask/stage5WarMask のように
// 「worldGroup の子として一緒にズームされるが、その境界線自体は画面上の固定位置を保ちたい」ものに使う
// (マスクだけ別変換にしない=対象と同じ順で forward 変換すれば元の screenY に戻る、という設計)。
export const postZoomLocalY = (screenY: number, zoom: number, offsetY: number): number =>
  zoom === 0 ? screenY - offsetY : (screenY - offsetY) / zoom;

/**
 * 「地平線フェード」「手前フェード」等、共通フォーマットの帯フェードの post-zoom 版。
 * `thresholdScreenY`(帯の開始=固定スクリーンY)・`fadePx`(帯幅=固定スクリーンpx)は
 * **旧来どおり画面px基準の定数のまま**(post-zoom化しない)。actor 側だけ postZoomScreenY で
 * 実際の画面Yへ変換してから比較する。これにより、zoom<1(引き)では同じ帯幅(screen px)に到達するのに
 * より広いワールドY(1/zoom倍)が必要になる=「引くほど帯が広がる」が自動的に成立する
 * (PACING_PUZZLE.md §6.37 受け入れ条件3: zoom=ZOOM_MIN_ABSで帯が1/ZOOM_MIN_ABS倍)。
 *
 * 恒等条件: zoom=1・offsetY=0 なら screenY=localY となり、旧来の
 * `clamp((localY - thresholdScreenY) / fadePx, 0, 1)` と厳密一致する。
 */
export const postZoomFadeAlpha = (
  localY: number,
  zoom: number,
  offsetY: number,
  thresholdScreenY: number,
  fadePx: number,
): number => {
  const screenY = postZoomScreenY(localY, zoom, offsetY);
  if (fadePx <= 0) return screenY >= thresholdScreenY ? 1 : 0;
  return Math.max(0, Math.min(1, (screenY - thresholdScreenY) / fadePx));
};

// ---------------------------------------------------------------------------
// §6.37 床の縦延長(「本数追加」方式・PACING_PUZZLE.md §6.37-1)。
//
// stripH・t の**定義そのもの(=72本基準の式)は変えない**。ストリップの本数だけを
// `refStripCount × overscan` へ増やし、追加分は**下方向へ**(=t を1超へ延長して)積み増す。
// 上端(t=0・farHの位置)は一切動かさない——「床を地平線より上まで描くと不自然」(§6.37-2)なので、
// 上の隙間は床でなく farBackdrop 側の下延長で埋める(postZoomScreenY 経由・pixiScene 側)。
export const GROUND_STRIP_REF_COUNT = 72;

// layers.ts が組む床ストリップの実本数(=72 → 72×1/ZOOM_MIN_ABS へ延長・§6.37-1)。ZOOM_MIN_ABS を
// 直接ここから導くことで、絶対最大引きの値が変わっても本数が自動で追従する(ハードコード180の一致は
// renderSpec.test.ts で固定・指摘4)。
export const GROUND_STRIP_COUNT = Math.round(GROUND_STRIP_REF_COUNT / ZOOM_MIN_ABS);

export interface GroundBandLayout {
  /** 帯の上端(ローカルY)。常に farH のまま(不変)。 */
  top: number;
  /** 帯の下端(ローカルY)。overscan=1 なら screenH 相当・overscan>1 ならその分下へ延長。 */
  bottom: number;
  /** ストリップ総本数。overscan=1 なら refStripCount(=72)。 */
  stripCount: number;
  /** 1本の高さ(ローカルpx)。overscan に関わらず値は不変(=定義域不変)。 */
  stripH: number;
}

/**
 * 床帯の上下端・本数・stripH を算出する。
 * 恒等(overscan=1): top=farH, bottom=screenH相当(=farH+groundH), stripCount=refStripCount,
 * stripH=groundH/refStripCount ——旧来の 72本ぶんの値と厳密一致(受け入れ条件1)。
 * overscan=1/ZOOM_MIN_ABS(=2.5)なら stripCount=180(=72×2.5)で、下端が groundH×2.5 ぶん延長される。
 */
export const computeGroundBandLayout = (
  farH: number,
  screenH: number,
  overscan: number,
  refStripCount: number = GROUND_STRIP_REF_COUNT,
): GroundBandLayout => {
  const groundH = Math.max(1, screenH - farH);
  const stripH = groundH / refStripCount;
  const stripCount = Math.max(1, Math.round(refStripCount * Math.max(1, overscan)));
  const bottom = farH + stripCount * stripH;
  return { top: farH, bottom, stripCount, stripH };
};

/**
 * ストリップ i の遠近進行度 t。**旧来と同じ式**(refStripCount−1 で正規化)を i が旧来の範囲
 * (0..refStripCount-1)を超えても延長するだけ——旧72本の可視範囲では旧来と1ビットも変わらない。
 * i が refStripCount-1 を超えると t は 1 を超えて伸び続ける(=手前の延長ぶん。負にはならないので
 * Math.pow(t, curve) は常に安全)。
 */
export const groundStripT = (i: number, refStripCount: number = GROUND_STRIP_REF_COUNT): number =>
  refStripCount <= 1 ? 1 : i / (refStripCount - 1);

// ---------------------------------------------------------------------------
// §6.37 v4 上接合「隙間埋め帯」(PACING_PUZZLE.md §6.37-2 v4・社長指示2026-08-07で遠景ストレッチから
// 全面差し替え)。farBackdrop(画面固定・常に静的なfarH)はもう毎フレーム動かさない。代わりに
// worldGroup内・森帯(horizonForest)の直上に、森と同じズーム変換を受ける「暗グラデ帯」を敷いて隙間を
// 埋める。帯の**下端はfarH固定**(=horizonForestの上端と常に一致・継ぎ目なし)、**上端は最深ズーム
// (ZOOM_MIN_ABS)で必要な分だけ静的に確保**(毎フレームの再パラメータ化はしない=床と同じ「本数追加」
// 方式の精神)。
//
// 等倍(zoom=1)では帯の上側([farH-H, farH))が farBackdrop 自身の描画範囲([0, farH))と重なるため、
// 帯は farBackdrop の裏側(zより手前=描画順で下)に置いて隠す(pixiScene側の配置・恒等性の担保)。
// この関数が返すのは「その隠れる/現れるちょうど境界」を毎フレーム画面固定(screenY=farH)に保つための
// **ローカルYカットオフ**(postZoomLocalYそのもの・別関数は不要)。

/**
 * 隙間埋め帯の静的な高さ(ワールドローカルpx)。下端=farH(不動)から上へこの分だけ確保しておけば、
 * 最深ズーム(minZoom=ZOOM_MIN_ABS)でも上接合が破綻しない。
 * 導出: 「farHのpost-zoomスクリーンY」が最深ズームでちょうどfarHへ届く高さ
 *   postZoomScreenY(farH - H, minZoom, centerY*(1-minZoom)) === farH を H について解くと
 *   H = (1 - minZoom) / minZoom * (centerY - farH)。
 * 恒等条件: minZoom=1 なら H=0(等倍では隙間そのものが存在しない=帯不要)。
 */
export const worldGapBandHeight = (farH: number, screenH: number, minZoom: number = ZOOM_MIN_ABS): number => {
  const centerY = screenH / 2;
  const safeMinZoom = Math.max(0.001, Math.min(1, minZoom));
  return Math.max(0, (1 - safeMinZoom) / safeMinZoom * (centerY - farH));
};
