// Per-frame sync: read the store, drive the Pixi scene graph. Pure reader —
// it NEVER writes gameplay state (useGameLoop remains the only clock/writer).
//
// What it reproduces from the Canvas2D renderer (gameplay-faithful):
//   background floor + trees, foot shadows, player & enemies (Y-sorted by foot
//   Y) with their overlays (health bar, hit flash, ghost fade, boss marker,
//   stun reticle), projectiles, pickups, the world-space effects[] queue
//   (particle / ring / glow / slash / damageNumber / trail / flash), the
//   counter ring, the reload meter, and off-screen supply arrows.
//
// HD-2D atmosphere (moonlit / cool): a multiply colour-grade + radial vignette
// (screen space) and a warm player light halo (screen space, above the grade so
// the hero pops). Tilt-shift depth-of-field lands next; ambient fireflies sit
// outside that filter so they stay crisp.

import { BlurFilter, ColorMatrixFilter, Container, Graphics, Sprite, Text, BitmapText, BitmapFont, Texture, Rectangle, Filter, TilingSprite, RenderTexture } from 'pixi.js';
import type { ColorMatrix } from 'pixi.js';
import type { Renderer } from 'pixi.js';
import { TiltShiftFilter, AdvancedBloomFilter } from 'pixi-filters';
import type {
  BreakableProp, CastleEvent, Enemy, EventQuestNpc, Pickup, Player, Projectile, VisualEffect, WeaponMerchant, Summon, StageTheme,
  ActiveEvent, ShadowCloneState, BaseSite,
} from '../types/game';
import { useGameStore, huntingMeleeRadius, hasMurasame, SLASHER_RING_MS, SLASHER_JUST_MS, SHAKE_MS, SHAKE_GLOBAL_MULT, MELEE_FINISH_ZOOM_MS, CAMERA_IDLE_ZOOM_MAG, CAMERA_IDLE_ZOOM_TAU, CAMERA_MOVE_ZOOM_MAG, CAMERA_MOVE_ZOOM_TAU, CAMERA_INTRO_ZOOM_MAG, COUNTER_WINDOW, katanaRange, HURRICANE_DURATION_MS_BY_LEVEL, PLAYER_INTRO_MS, PLAYER_INTRO_HELI_FRAC, playerIntroOffset, playerIntroScale, playerIntroDescent, PUMPKIN_CROUCH_MS, PUMPKIN_JUMP_MS, PUMPKIN_RECOVER_MS, PUMPKIN_JUMP_HEIGHT, PUMPKIN_EXPLOSION_RADIUS, RETURN_CIRCLE_HOLD_MS, BASE_CAPTURE_HOLD_MS, CAMERA_DOWN_OFFSET_FRAC } from '../store/gameStore';
import { hasFullWarlordSet } from '../data/equipment';
import { LAB_BOUNDS, LAB_OUTER_BOUNDS, LAB_WALLS, LAB_DOORS, LAB_BUTTON, LAB_GOAL_TRIGGER, LAB_ROOMS } from '../world/labMap';
import { getEnemyColor, isHiddenBoss } from '../utils/enemyUtils';
import { getRunPois, isPoiRevealed } from '../world/pois';
import { ALCHEMY_SUMMON_TINT, ALCHEMY_CHANNEL_MS } from '../utils/summonUtils';
import { effectiveReloadMs, hasWeaponIcon, weaponIconName, getActiveGun } from '../utils/weaponUtils';
import { pickupDisplayPosition } from '../utils/collisionUtils';
import type { SceneLayers } from './layers';
import { getTexture } from './pixiTextures';
import { getGlowTexture, getVignetteTexture, getVignetteTextureNarrow, getRedVignetteTexture, getSoftShadowTexture, getFogTexture, getVisibilityLightTexture } from './lighting';
import { getBloomEnabled } from '../config/graphics';
import { FONT_STACK } from '../config/font';
import { enemyFootBox, playerFootBox, summonFootBox, PLAYER_VISUAL_SCALE } from './renderSpec';
import {
  RHYTHM_DIM_ALPHA, RHYTHM_DIM_EASE, RHYTHM_TAP_GLOW_MS, RHYTHM_TAP_GLOW_ALPHA,
  RHYTHM_STAGE_COLORS, RHYTHM_FINISH_RAINBOW_MS, RHYTHM_BALL_DIAM, RHYTHM_RAINBOW_PALETTE,
  RHYTHM_ARROW_GRID, SHIJIN_JP, SHIJIN_BY_ARROW,
  RHYTHM_JUST_BURST_MS, RHYTHM_JUST_RING_MAX_SCALE, RHYTHM_JUST_FLICK_TRAVEL,
  RHYTHM_JUST_CYCLE_COLORS,
} from '../config/shijin';
import { treesInRegion, TREE_CELL, treeHash } from '../world/trees';
import { cityPropsInRegion, cityPropDef, STAGE_PROPS, CITY_ZONE } from '../world/cityProps';
import { labWallsInRegion, LAB_ZONE, WALL_DISPLAY_H, labPropsInRegion, PROP_DISPLAY_H } from '../world/labWalls';
import { RescueSurvivor, RESCUE_HOLD_NEED_MS, RESCUE_OUTRO_MS } from '../world/rescue';
import { STAGE_SKINS, resolveStageSkinKey } from '../data/stageSkins';

// --- 深層域グレーディング(退色した暖色セピア) -----------------------------
// 深層域に入っている間だけ、ゲーム画面全体を退色セピアにする描画のみの演出(当たり判定等には不干渉)。
// stage ルートに ColorMatrixFilter 1枚。enter/exit を約1秒でフェード(filter.alpha 補間)。HUDはDOMなので非対象。
const DZ_PARAMS = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const DEEP_ZONE_GRADE_ENABLED = DZ_PARAMS?.get('deepzonegrade') !== '0'; // ?deepzonegrade=0 で無効化
const DEEP_ZONE_GRADE_SAT = (() => {
  const v = Number(DZ_PARAMS?.get('dzsat'));               // ?dzsat= で退色後の彩度を現地調整
  return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.4;  // 目安 0.35〜0.45(色は分かるが褪せてる)
})();
const DEEP_ZONE_GRADE_D = 7500;       // 深層域境界(逆再生BGMの DEEP_BGM_D と一致)。原点からの距離。
const DEEP_ZONE_GRADE_FADE_S = 1.0;   // enter/exit のフェード秒数
// 退色(彩度ダウン)＋暖色セピア寄せの 5x4 カラーマトリクス。sat=退色後の彩度。
const buildDeepGradeMatrix = (sat: number): ColorMatrix => {
  const lr = 0.2126, lg = 0.7152, lb = 0.0722; // 輝度係数
  const s = sat, is = 1 - sat;
  const sr = is * lr, sg = is * lg, sb = is * lb;
  const wR = 1.12, wG = 1.02, wB = 0.80;       // 暖色寄せ(R↑ B↓)
  const oR = 0.05, oG = 0.02, oB = 0.0;        // ごく薄い暖色オフセット
  return [
    (sr + s) * wR, sg * wR, sb * wR, 0, oR,
    sr * wG, (sg + s) * wG, sb * wG, 0, oG,
    sr * wB, sg * wB, (sb + s) * wB, 0, oB,
    0, 0, 0, 1, 0,
  ];
};

// --- moonlit atmosphere tuning (tweak freely on-device) -------------------
const GRADE_TINT = 0x7e93c9;   // cool blue multiply over the whole world
// 昼ステージ(正午=farBackdrop 'city')の環境補正: 夜の暗転・寒色グレード・濃霧・周辺減光を弱め、
// 足元まで明るく見せる。遠景は applyFarBackdrop が tint=白で明るく出す(別管理)。
const DAY_ENV_TINT = 0xffffff;             // 地面/木/森レイヤーを暗転させない(本来色)
const DAY_GRADE_TINT = 0xfff1da;           // 寒色→ごく薄い暖色グレード
const DAY_VIGNETTE_ALPHA = 0.30;           // 周辺減光を薄く
const DAY_FOG_MULT = 0.4;                  // 寒色フォグを薄く
const GRADE_ALPHA = 0.4;       // strength of the cool grade
const DAY_GRADE_ALPHA = GRADE_ALPHA * 0.3; // 昼はグレードをかなり弱く
const PLAYER_HUNTING_LIGHT_TINT = 0x60a5fa;
// 遠景バンドの高さ。下に広げると「遠景エリアが広く・地面が下がり・地平の森も一緒に下がる」(地平森は
// farH 基準で配置されるため自動連動)。戻すときは ratio 0.22 / cap 0.30 / min 150 に戻す(社長:戻す可能性あり)。
const FAR_BACKDROP_HEIGHT_RATIO = 0.26; // 旧 0.22 → 0.30(広げすぎたので少し戻す)
const FAR_BACKDROP_HEIGHT_CAP = 0.38;   // 旧 0.30 → 0.44(少し戻す)
const FAR_BACKDROP_MIN_HEIGHT = 168;    // 旧 150 → 185(少し戻す)
const FAR_BACKDROP_PARALLAX_X = 0.09;
const FAR_BACKDROP_BLUR = 1.1;
const HORIZON_FOREST_PARALLAX_X = 0.16;
const HORIZON_FOREST_BLUR = 0.65; // 地平の森(遠景森)を少しだけぼかす(0=なし)。少し弱めた
const HORIZON_FOREST_HEIGHT_RATIO = 0.22;
const HORIZON_FOREST_MIN_HEIGHT = 120;
const HORIZON_FOREST_MAX_HEIGHT = 185;
const HORIZON_FOREST_OVERLAP_RATIO = 0.18;
const HORIZON_FOREST_Y_OFFSET_PX = -100;
const LAB_HORIZON_FOREST_EXTRA_DOWN = 20; // ステージ2だけ遠景森1を下げる量(px)。他ステージは0。
const HORIZON_FOREST_BOTTOM_FADE_PX = 10;
// 遠景手前森(ステージ3): 地平の森の「手前」に重なる近めの帯。closer=大きく/下/速いパララックス/弱ブラー。
// 遠景森2の高さ(screenH比)。全ステージ共通の既定=0.42(原典)。
const NEAR_HORIZON_HEIGHT_RATIO = 0.42;
// ステージ2(lab)だけ低め。?nh= で現地調整可(でか過ぎたので下げられるように。社長が0.17確定)。
// tsNum はこの行より後に定義のため inline で読む。
const LAB_NEAR_HORIZON_HEIGHT_RATIO = (() => {
  const v = typeof window !== 'undefined' ? Number(new URLSearchParams(window.location.search).get('nh')) : NaN;
  return Number.isFinite(v) && v > 0 ? v : 0.17; // ステージ2既定0.17(社長指定)
})();
const NEAR_HORIZON_PARALLAX_X = 0.5;         // 横パララックス(遠景森2=手前)。|大|=近い
const NEAR_HORIZON_BOTTOM_RATIO = 0.10;      // 底を farH からさらに screenH×この割合だけ下へ(大きいほど下)。少し上へ
const NEAR_HORIZON_BLUR = 0.35;              // 近いので地平の森より弱いブラー
const HORIZON_ACTOR_HIDE_OFFSET_PX = 0;
const HORIZON_ACTOR_FADE_PX = 120;
const HORIZON_REVEAL_OFFSET_PX = 200;
const HORIZON_REVEAL_FADE_PX = 90;
const FRONT_FOREST_PARALLAX_X = 0.68;
const FRONT_FOREST_HEIGHT_RATIO = 0.5;
const FRONT_FOREST_MIN_HEIGHT = 270;
const FRONT_FOREST_MAX_HEIGHT = 410;
const FRONT_SNOW_Y_OFFSET = 100; // ステージ4の近景(氷壁)を下げる(社長指示で30→100)
const FRONT_FOREST_ALPHA = 0.78;
const LAB_FRONT_FOREST_ALPHA = 1.0; // ステージ2だけ近景森を不透明に(社長指示)。他ステージは半透明のまま。
const FRONT_FOREST_BLUR = 2.2;
const FRONT_FOREST_FADE_IN_RATIO = 0.52;
const FRONT_FOREST_FADE_TOP_ALPHA = 0.58;
const FRONT_FOREST_FADE_MID_ALPHA = 0.82;
const CASTLE_FOOT_OFFSET_Y = 38;
const CASTLE_TARGET_HEIGHT = 188; // 125 * 1.5(建物1.5倍指示)
const MERCHANT_TARGET_HEIGHT = 100;
const EVENT_NPC_TARGET_HEIGHT = 108;
const EVENT_NPC_FADE_MS = 1100;
// 鞭ハリケーン竜巻スプライト(視覚のみ。吸引半径/ダメージは store 定義のまま)。
const WHIP_HURRICANE_ANCHOR_Y = 0.92;   // テクスチャ内の地面の渦(根元)位置(縦長竜巻)
const WHIP_HURRICANE_WIDTH_MULT = 3.0;  // 描画幅 = 吸引半径 × この倍率
const WHIP_HURRICANE_FADE_IN_MS = 160;  // 立ち上がりフェード
const WHIP_HURRICANE_FADE_OUT_MS = 280; // 消滅フェード
const WHIP_HURRICANE_FLIP_MS = 100;     // 左右反転の周期(0.1秒毎にミラー)
// 竜巻スプライトを沈める tint。bloom 閾値(0.45)未満にするだけでなく、
// 「明るい灰色のうず」が full-alpha で自発光に見える問題も消すため、はっきり暗い
// スモーキー値(輝度≈0.25)まで落とす。これで alpha が上がっても発光して見えない。
const WHIP_HURRICANE_TINT = 0x3c4248;
// 鞭 lash スプライト(右向き素材: 手元=左, 先端=右)。手元グリップを振り起点に固定して回転/伸縮。
const WHIP_SPRITE_ANCHOR_X = 0.10;  // テクスチャ内の手元(グリップ)= プレイヤー位置のピボット
const WHIP_SPRITE_ANCHOR_Y = 0.676; // 手元の縦位置
const WHIP_SPRITE_TIP_X = 0.99;     // テクスチャ内の鞭先端位置

// Tilt-shift depth-of-field: keeps a horizontal band sharp and blurs the far
// (top) and near (bottom) edges for the HD-2D "diorama" feel. The sharp band is
// centred a touch above middle so the player (slightly below centre) stays
// crisp. Set ENABLED false if it costs too much on-device.
// 被写体深度(tilt-shift)の生調整: URLで上書きできる。?ts=0 で無効化(比較用)。
//   ?tsblur=18   端の最大ボケ強度(大=強くボケる)
//   ?tsgrad=280  くっきり→ボケへ移る距離(px。小=焦点帯が狭くなり上下が強くボケる)
//   ?tsband=0.5  くっきり帯の中心(画面高さに対する割合 0..1。0.5=中央)
// 参考画像(HD-2D)に合わせて値を探し、合ったら下の既定値に焼き込む。
const tsNum = (key: string, def: number): number => {
  if (typeof window === 'undefined') return def;
  const v = new URLSearchParams(window.location.search).get(key);
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : def;
};
const tsBool = (key: string, def: boolean): boolean => {
  if (typeof window === 'undefined') return def;
  const v = new URLSearchParams(window.location.search).get(key);
  return v == null ? def : (v === '1' || v === 'true');
};
// ステージ2(ラボ)の暗闇=可視ゾーン(フラッシュライト)演出。社長指示で廃止(既定OFF)。?labveil=1 で参照用に復活可。
// (いきなり暗転する/画面固定の暗幕が登場ヘリのズーム等でズレる、という課題のため通常照明へ)。
const LAB_VISIBILITY_VEIL = tsBool('labveil', false);
// 遠景森2(ラボ)の明るさ。暗幕を地平下だけにした(載せ替え廃止)後、白tint(全明)だと元素材より眩し過ぎたので下げる。
// グレー乗算tint。?nhbright=0..1 で現地調整(既定0.55)。
const LAB_NEAR_HORIZON_TINT = (() => {
  const b = Math.max(0, Math.min(1, tsNum('nhbright', 0.4)));
  const g = Math.round(255 * b);
  return (g << 16) | (g << 8) | g;
})();
// 研究所の擬似3D(斜め遠近)試作フラグ。?labpersp=1 で床だけ遠近(A1)。既定OFF=現状維持(回帰なし)。
// 描画のみ。当たり判定/移動/aim は不変(store の値そのまま)。
const LAB_PERSP = tsBool('labpersp', false);
// 研究所スキンの最前面オーバーレイ(天井から吊られたケーブル帯)。上寄せ・半透明。?ceil=0 で無効化可。
const LAB_CEILING_ALPHA = tsNum('ceil', 0.55);
// 木/壁/建物/プロップの「裏に回ったら透ける」: プレイヤーを覆う(手前=footY大で重なる)障害物だけ
// alpha をこの値へ滑らかに落とす。1=無効(常に不透明)。?seethru= で生調整。?seethrutau= はフェード時定数(秒)。
const OBSTACLE_SEE_THROUGH_ALPHA = tsNum('seethru', 0.35);
const OBSTACLE_SEE_THROUGH_TAU = tsNum('seethrutau', 0.12);
// 研究所スキン専用「可視可能ゾーン」: プレイヤー/UVバー周辺(=ハンドガン射程)だけ明るく、外は急に暗い。
const LAB_VIS_RANGE = tsNum('vrange', 170);     // UVバー周辺の明るい半径(px。縁はなだらかに減衰。少し暗がりを広げ200→170)
const LAB_VIS_RANGE_PLAYER = tsNum('vrangep', 135); // プレイヤー周辺は一回り狭く(160→135)
const LAB_VIS_DARK = tsNum('vdark', 0x05060a);  // 可視ゾーン外の暗幕の色(暗いほど黒)
const LAB_VIS_ALPHA = tsNum('valpha', 0.8);     // 暗幕の濃さ(1=真っ黒, 0.8=ほんの少し見える)
// 研究所専用の強い遠近(屋外定数を流用せず分離)。奥(FAR)を強く縮め、収束カーブを急に。?で生調整。
const LAB_PERSP_FAR = tsNum('labperspfar', 0.04);    // 奥のタイル縦縮み(小=奥が強く縮む。屋外は0.12)
const LAB_PERSP_CURVE = tsNum('labperspcurve', 2.8); // 収束カーブ(大=手前が急に大きく/奥へ急収束)
const TILT_SHIFT_ENABLED =typeof window === 'undefined' || new URLSearchParams(window.location.search).get('ts') !== '0';
const TILT_SHIFT_BLUR = tsNum('tsblur', 14);       // max blur strength at the edges
const TILT_SHIFT_GRADIENT = tsNum('tsgrad', 440);  // px over which sharp ramps into blur
const TILT_SHIFT_BAND = tsNum('tsband', 0.54);     // sharp-band centre as a fraction of height(camdown=0.08でプレイヤーが0.58へ下がるのに合わせ下げる)

// --- フェーズ1: 環境(地面・森・遠景・木)だけを暗く沈める「ベースの闇」----------
// 全体コントラストではなく、環境スプライトの tint を下げるだけ(GPU tint=追加パスなし=無料)。
// アクター(キャラ/敵/拾い物/光)は沈めないので、暗い背景の上で相対的に明るく浮く。
// 実機生調整 → 合った値を既定へ焼き込む:
//   ?envdark=0.6  環境の明るさ倍率(1=従来 / 小さいほど暗い。0.5〜0.7 目安)
//   ?vig=0.95     周辺減光(vignette)の濃さ(0=なし)。既定 0.70(周辺暗部をもう少し明るく)
const ENV_DARKEN = Math.max(0, Math.min(1, tsNum('envdark', 0.62)));
const ENV_TINT = (() => {
  const g = Math.round(255 * ENV_DARKEN);
  return (g << 16) | (g << 8) | g;
})();
const ENV_VIGNETTE_ALPHA = tsNum('vig', 0.70);
// 瀕死演出: HP がこの値以下で、暗い赤のビネット(赤色テクスチャ)が心拍(ドクン…ドクン…)で脈動。21以上で解除。
const LOW_HP_THRESHOLD = 20;           // HP ≤ 20 でON / ≥ 21 でOFF
const LOW_HP_HEARTBEAT_MS = 1100;      // 心拍1周期(2拍=ドクン…ドクン…)

// --- 研究施設(屋内)の暗さ -------------------------------------------------------
// ステージ全体(床/壁)を乗算tintで沈める。オブジェクト(プロップ/UV/アクター)はtintしない=明るく浮く。
const LAB_ENV_TINT = 0x6b7686;       // 研究所の床/壁を暗くする(寒色の暗灰)。小さいほど暗い。ドット絵床が読めるよう従来より弱め。
// 壁の外側=野外マージンの地面(より暗い)。プレイヤーが端でも中心を保てる余白(野外)。
const LAB_OUTER_TINT = 0x161d16;     // 野外(夜の地面)。かなり暗い緑寄り。
// 屋内の周辺減光(vignette)を屋外より広範囲に暗く(社長指示)。明るい部分を狭く=さらに強める。
const LAB_VIGNETTE_ALPHA = tsNum('labvig', 0.97); // 評価用レバー: ?labvig=0.7 等で明るく見て調整(最終値はPhase Cで決定)
// 壁テクスチャは「線画＋内側が透明」なので、そのままだと床が透ける。各壁の背面に不透明な下地を敷く色。
const LAB_WALL_FILL = 0x2b3240;
// 立体壁の「立ち上がり高さ」(px)。実機調整 → 既定へ。?labrise=38 で上書き。
const LAB_WALL_RISE = Math.max(0, tsNum('labrise', 38));

// --- フェーズ2-A: 月明り(光のシャフト)を明るく --------------------------------
// 暗くしたベース(フェーズ1)の上で、暖色シャフトを加算(add)で強めに光らせる。加算なので
// 光の当たる筋だけが明るくなり、周りの暗さはそのまま=メリハリ。新規パスなし=無料。
//   ?shaft=0.2  シャフトの明るさ(0=なし。従来の素の値は 0.085)
const SHAFT_ALPHA = Math.max(0, tsNum('shaft', 0.5));
// 昼ステージ(ステージ3=正午)の斜め日光シャフトだけ濃く(明るく)する倍率。夜(月明り)は不変。
// ?shaftday= で生調整。既定1.6(社長指示で暫定確定)。
const SHAFT_DAY_BOOST = Math.max(0, tsNum('shaftday', 1.6));
// 環境光シャフトの横パララックス: 左右の移動(camera.x)に連動して森のように流れる。
// 0=動かない。森より遅め(front forest=0.68)。?shaftpara= で生調整。
const SHAFT_PARALLAX_X = Math.max(0, tsNum('shaftpara', 0.35));
// シャフトのぼかし(エッジを柔らかく)。BlurFilter 1枚。既定4(社長指示で暫定確定)。?shaftblur=0 でOFF。
const SHAFT_BLUR = Math.max(0, tsNum('shaftblur', 4));
// シャフトの反復間隔(period)= 画面幅 × この係数。大きいほど筋の間隔が広がる=重なり減。
// 既定0.8(社長指示で暫定確定)。?shaftperiod= で生調整。下限は内部で180pxにクランプ。
const SHAFT_PERIOD_FACTOR = Math.max(0.05, tsNum('shaftperiod', 0.8));
// 筋そのものの太さ倍率。小さいほど細い。既定0.5(社長指示で暫定確定)。?shaftwidth= で生調整。
const SHAFT_WIDTH_FACTOR = Math.max(0.05, tsNum('shaftwidth', 0.5));

// --- スモッグ(オクトパス的)。各レイヤー“1枚ずつ”の幅広霧をゆっくり揺らすだけ(枚数は増やさない)。
// ドリフト/ラップはせず、1枚を上下左右に微妙に sway させる(=オクトラの見え方)。計3枚=軽量。
//   ?fog=0.52    森下霧(やまぎり・最前面。山の上端が少しだけプレイヤーに被る。0=なし)
//   ?fogback=0.45 奥(キャラの後ろ・遠景〜地面に被る。0=なし)
//   ?fogbg=0.45  森上霧(最下部・手前の森に被る低い霧。0=なし)
//   ?fogspd=1    揺れの速さ
// ★お試し中(2026-06-16): 奥は「めっちゃ濃く」0.85 のまま検証中。基準(戻り)値 → 森下=0.52 / 奥=0.45
const FOG_FRONT_ALPHA = Math.max(0, tsNum('fog', 0.9));      // 森下霧(fog-alpha素材・最大α~67%なので濃いめに)
const FOG_BACK_ALPHA = Math.max(0, tsNum('fogback', 0.65));  // 奥(遠景+地面・キャラの後ろ)
const FOG_TOP_ALPHA = Math.max(0, tsNum('fogbg', 0.32));     // 森上霧(手前の森に被る最下部・薄め)
const FOG_SPEED = Math.max(0, tsNum('fogspd', 1));
const FOG_TINT = 0xb8ccdd;   // 寒色の白青(参考の霧色)。やや明るめ
interface FogLayer {
  sp: TilingSprite;
  baseAlpha?: number; // 夜の基準α(昼は DAY_FOG_MULT で薄める)
  yFrac: number;     // 帯の中心Y(画面高さに対する割合)
  widthFrac: number; // スプライト幅(画面幅に対する割合。>=1で画面を覆う)
  heightFrac: number;
  ampX: number; ampY: number; // 揺らめき振幅(px)。ampX=texture横, ampY=縦位置
  spdX: number; spdY: number; // 揺らめき速度(rad/ms)
  flow: number;      // 右への流れ(px/ms。tilePosition.x を増やす)
  ph: number;        // 位相
  texKey?: string;   // 外部PNGテクスチャ(非同期ロード)。指定時は sync で getTexture して割当+tileScale。
}

// --- A: 光だまり(プレイヤー足元の地面に敷く加算ライト) ------------------------
// 暗いベース(envdark)の上で「光の島」を作る。groundLayer(world座標・アクターの下)に
// 加算スプライト1枚。既存の playerLight(hero補助の控えめな光)とは別に、もっと広く濃い
// 地面プールを足してメリハリを出す。負荷 Low(加算スプライト1枚)。
// すぐ戻せる: ?pool=0 で無効化 / ?pool=濃さ / ?poolr=半径 で生調整。
const LIGHT_POOL_ENABLED =
  typeof window === 'undefined' || new URLSearchParams(window.location.search).get('pool') !== '0';
const LIGHT_POOL_ALPHA = Math.max(0, tsNum('pool', 0.4));
const LIGHT_POOL_RADIUS = Math.max(0, tsNum('poolr', 210));
const LIGHT_POOL_TINT = 0xffe3a3; // 昼/日差し用の暖色(足元プール)
const MOON_POOL_TINT = 0xbcd0f5;  // 夜(月明り)用の寒色プール。暖色のままだと夜に黄色く浮く

// Selective bloom — only pixels brighter than the threshold glow, so the dark
// forest stays clean while gems / muzzle flashes / crits / lights bloom.
// Applied to the world group alongside the tilt-shift.
const BLOOM_ENABLED = true;
const BLOOM_THRESHOLD = 0.45;  // lower → colored gems/crits bloom too
const BLOOM_SCALE = 1.5;
const BLOOM_STRONG_EVENT_SCALE = 0;
const BLOOM_BLUR = 8;

type StageLightingPreset = {
  name: 'sunlight' | 'moonlight';
  direction: { x: number; y: number };
  color: number;
  intensity: number;
  contrast: number;
  shadowLength: number;
  shadowAlpha: number;
  shaftAlpha: number;
  bloomScale: number;
  playerAssistAlpha: number;
  playerAssistRadius: number;
};

const STAGE_LIGHT_SHAFT_DIRECTION = { x: 0.42, y: 1 };
// 昼(sunlight)の影だけの方向: 右奥寄り(右＋奥=画面上方向 -y)。god ray は上の定数を使うので影だけに効く。
const SUNLIGHT_SHADOW_DIRECTION = { x: 0.7, y: -0.28 };
// ステージ2(lab)の影だけ右向きにする方向。
const LAB_SHADOW_DIRECTION = { x: 1, y: 0.2 };
const STAGE_LIGHT_SHAFT_PULSE_MS = 5200;
const STAGE_LIGHT_SHAFT_PULSE_AMOUNT = 0.08;
const PLAYER_SHADOW_SCALE = 0.9;
// 登場演出のオフセットは store の playerIntroOffset(t) を共有(カメラと同期)。
// 登場演出のヘリコプター(キャラを降ろして上へ逃げる)。画像 'helicopter' 登録時のみ表示。
const HELI_DISPLAY_H = 120;  // 画面上のヘリ高さ(px。横はテクスチャ比で従属)
const HELI_ABOVE = 210;      // 序盤、キャラ上方への随伴オフセット(px。=飛来高度)
const HELI_DROP_ABOVE = 70;  // 飛び降り直前の低ホバー高度(px。ここまで一緒に降りてから飛び降りる)
const HELI_DESCEND_FROM = 0.5; // フェーズAのこの割合から低ホバーへ降下開始
const HELI_RISE = 820;       // 後半、上へ逃げる距離(px)
const HELI_DRIFT_X = 240;    // 逃げる際の横ドリフト(px)
// フェーズA(飛来)中、キャラをヘリの「ドア」に重ねて乗せる。フェーズA中はキャラのコンテナを
// ヘリと同じ danceUiLayer の前面へ移し、ヘリ画像に重なって(かぶって)見えるようにする。
// 終端でリフト解除=飛び降り、同時にヘリは上昇していく。
const HELI_RIDE_DOOR_FRAC = 0.16;    // ドアの縦位置(ヘリ中心からの下方=H比。足をこの辺りに置く。大きいほど下)
const HELI_RIDE_DOOR_X = 4;          // ドアの横位置(ヘリ中心からのオフセット px*scale。+で進行方向寄り)
const HELI_RIDE_RELEASE_FROM = 0.85; // フェーズAのこの割合から飛び降り開始
const HELI_DEPART_DELAY_MS = 300;    // 飛び降りてからヘリがその場でホバーして待つ時間(0.3秒)→上昇離脱
// ヘリの随伴高度(キャラ上方への距離)。飛来終盤に HELI_ABOVE→HELI_DROP_ABOVE へ降下し、
// 低ホバー完了(=飛び降り開始 HELI_RIDE_RELEASE_FROM)してからキャラが飛び降りる。
// キャラはヘリ中心にピン留めなので、ヘリと一緒に下がってから飛び降りる。
const heliAboveAt = (t: number): number => {
  const hf = PLAYER_INTRO_HELI_FRAC;
  const a = hf > 0 ? Math.min(1, t / hf) : 1;
  if (a <= HELI_DESCEND_FROM) return HELI_ABOVE;
  const k = Math.min(1, (a - HELI_DESCEND_FROM) / Math.max(0.001, HELI_RIDE_RELEASE_FROM - HELI_DESCEND_FROM));
  const s = k * k * (3 - 2 * k);
  return HELI_ABOVE + (HELI_DROP_ABOVE - HELI_ABOVE) * s;
};
// 敵の被弾しなり(頭が後ろにぐにゃっ): 撃たれた直後だけ skew + 軽い縦縮みで反らせる。
const ENEMY_HIT_FLINCH_MS = 230;    // 少しだけゆっくり(0.13s→0.23s)
const ENEMY_HIT_FLINCH_SKEW = 0.42; // 最大skew(ラジアン相当)
const SHIELD_BLOCK_FALL_MS = 180;   // 盾で弾かれたジャンプの空中→着地の落下補間時間(描画のみ)

const SUNLIGHT_PRESET: StageLightingPreset = {
  name: 'sunlight',
  direction: SUNLIGHT_SHADOW_DIRECTION, // 影は右奥寄り(god ray は別=STAGE_LIGHT_SHAFT_DIRECTION)
  color: 0xffe3a3,
  intensity: 0.24,
  contrast: 0.18,
  shadowLength: 36,
  shadowAlpha: 0.38, // 昼の影を少し濃く(0.26→0.38)
  shaftAlpha: 0.085,
  bloomScale: 1.16,
  playerAssistAlpha: 0.1,
  playerAssistRadius: 145,
};

const MOONLIGHT_PRESET: StageLightingPreset = {
  name: 'moonlight',
  direction: STAGE_LIGHT_SHAFT_DIRECTION,
  color: 0x9fb7ff,
  intensity: 0.16,
  contrast: 0.12,
  // 夜の影は従来仕様(全ステージ sunlight 時)に戻す: 長さ32 / 濃さ0.26 / 向きは従来(右手前)。
  shadowLength: 32,
  shadowAlpha: 0.26,
  shaftAlpha: 0.045,
  bloomScale: 1.08,
  playerAssistAlpha: 0.09,
  playerAssistRadius: 140,
};

const STAGE_LIGHTING_PRESETS = {
  sunlight: SUNLIGHT_PRESET,
  moonlight: MOONLIGHT_PRESET,
} as const;
const ACTIVE_STAGE_LIGHTING_NAME: keyof typeof STAGE_LIGHTING_PRESETS = 'sunlight';
const ACTIVE_STAGE_LIGHTING = STAGE_LIGHTING_PRESETS[ACTIVE_STAGE_LIGHTING_NAME];

// Ambient fireflies drifting through the moonlit forest (soft additive motes).
const FIREFLY_ENABLED = true;
const FIREFLY_COUNT = 40;
const FIREFLY_TINT = 0xcfe89a;   // soft warm green-yellow
const FIREFLY_MARGIN = 90;       // spawn/recycle band around the visible view

// Enemy ground lights: subtle self-emission plus a short brighter pulse when
// hit. These sit under actors so sprites never get washed out.
const ENEMY_LIGHT_ENABLED = true;
const ENEMY_LIGHT_CULL_COUNT = 7;
const ENEMY_LIGHT_RADIUS = 34;
const ENEMY_HIT_LIGHT_MS = 180;
const BOSS_FINISH_LIFT_MS = 420;
const BOSS_FINISH_LIFT_PX = 18;
const PLAYER_WALK_CYCLE_MS = 460;
const PLAYER_CLASS_MENU_SPRITE_WIDTH = 86;
// 背負い刀の大きさ倍率(中心固定で縮小)。
const KATANA_BACK_SCALE = 0.72;
// 背負い刀(実画像)の追加回転(rad)。素材が既に斜め(柄=右上/鞘=左下)なので既定0。実機で微調整可。
const KATANA_BACK_IMG_ROT = 0;
const DOG_WALK_FRAME_MS = 150;
const DOG_SPRITE_SCALE = 1 / 3;
const playerWalkSequence = (p: Player): number[] =>
  p.characterClass === 'mage' ||
  p.characterClass === 'rogue' ||
  p.characterClass === 'warrior' ||
  p.characterClass === 'necromancer'
    ? [0, 1, 2, 1]
    : [0, 1];
const playerWalkFrame = (p: Player, now: number, walking: boolean): number => {
  if (!walking) return 0;
  const sequence = playerWalkSequence(p);
  const index = Math.floor((now % PLAYER_WALK_CYCLE_MS) / (PLAYER_WALK_CYCLE_MS / sequence.length));
  return sequence[index] ?? 0;
};
// プレイヤーの立ち絵テクスチャ名(クラス/武将装備/フレーム別)。分身もこれを共有して同じ外見にする。
// ※ necromancer→striker / rogue→scavenger の対応は既存仕様のまま(入れ替えない)。
const playerTextureName = (p: Player, frame: number): string => {
  const warlordFull = hasFullWarlordSet(p.equipment);
  const warlordKatana = warlordFull && hasMurasame(p);
  return warlordKatana ? `player-warlord-katana-walk-${frame}`
    : warlordFull ? `player-warlord-gun-walk-${frame}`
    : p.characterClass === 'mage' ? `player-magnum-walk-${frame}`
    : p.characterClass === 'warrior' ? `player-shotgun-walk-${frame}`
    : p.characterClass === 'necromancer' ? `player-striker-walk-${frame}`
    : p.characterClass === 'rogue' ? `player-scavenger-walk-${frame}`
    : 'player';
};
// 立ち絵のベース拡大率(クラス絵=幅基準 / 武将立ち絵=高さ基準 / 不明クラス=枠内接)。分身と共有。
const playerBaseScale = (p: Player, tex: Texture, boxW: number, boxH: number): number => {
  if (hasFullWarlordSet(p.equipment)) return ((PLAYER_CLASS_MENU_SPRITE_WIDTH / 128) * 108) / tex.height;
  const knownClass = p.characterClass === 'mage' || p.characterClass === 'warrior' ||
    p.characterClass === 'rogue' || p.characterClass === 'necromancer';
  return knownClass ? PLAYER_CLASS_MENU_SPRITE_WIDTH / tex.width : containScale(boxW, boxH, tex.width, tex.height);
};
const PLAYER_WALK_BOB_PX = 0.8;
// 徒歩を自然に見せる二次モーション(3コマの上に重ねる・視覚のみ・判定不変)。
const PLAYER_WALK_LEAN_RAD = 0.035;   // 足元支点の左右リーン(±約2°)。1歩ごとに体重移動
const PLAYER_WALK_SQUASH = 0.05;      // 接地↔遊脚で縦に伸縮するスカッシュ量
// 行動の二次モーション(歩きと同じく静止スプライトに重ねる連続変形・視覚のみ・判定不変)。
// すべて scale倍率/回転加算/足元基準の画面pxオフセット。当たり判定・射程・速度には一切不干渉。
const PLAYER_FIRE_RECOIL_MS = 130;    // 発砲の反動が収まるまで(エンベロープ長)
const PLAYER_FIRE_RECOIL_PX = 3.2;    // 銃口と逆向き(=後方)へ体が下がる最大px
const PLAYER_FIRE_RECOIL_SQUASH = 0.04; // 反動で軽く縦に縮む量
const PLAYER_MELEE_SWING_MS = 230;    // 近接スイングの踏み込み→振り抜き→復帰の長さ
const PLAYER_MELEE_LUNGE_PX = 6;      // 狙い方向へ踏み込む最大px
const PLAYER_MELEE_LEAN_RAD = 0.13;   // 振り抜きの傾き(向き依存・約7.5°)
const PLAYER_MELEE_STRETCH = 0.09;    // 振り抜きピークの横ストレッチ
const PLAYER_COUNTER_MS = 280;        // カウンター成立の決めポーズの長さ
const PLAYER_COUNTER_POP = 0.13;      // 決めポーズの一瞬の膨らみ(縦横)
const PLAYER_COUNTER_LEAN_RAD = 0.10; // 決めポーズの傾き
const PLAYER_RELOAD_BOB_PX = 1.3;     // リロード中の小刻みな上下(手元作業の揺れ)
const PLAYER_RELOAD_LEAN_RAD = 0.022; // リロード中の小刻みな左右リーン
// ホーミングのロックオンサークル出現演出: 0.5秒でズームアウト(×開始倍率)→ターゲット半径へ収束＋フェードイン。
const LOCK_ANIM_MS = 500;
const LOCK_ANIM_START_SCALE = 2.4;
const ENEMY_BREATH_ENABLED = true;
const ENEMY_BREATH_SCALE_X = 0.016;
const ENEMY_BREATH_SCALE_Y = 0.024;
const ENEMY_BREATH_MS = 1500;
const ENEMY_LIGHT_TINT: Partial<Record<Enemy['type'], number>> = {
  zombie: 0x7de28a,
  bat: 0x9aa6ff,
  ghost: 0x9bf6ff,
  skeleton: 0xd7ddff,
  plant: 0x9fe870,
  pumpkin: 0xff9f3f,
  giantbat: 0xb9c4ff,
  reaper: 0xff4f5e,
};
// 色付き個体の「影の色」。装飾は廃止し、足元の影をこの色で染める(青<紫<赤)。
const ENEMY_COLOR_TIER_SHADOW: Record<string, { tint: number; alphaMult: number }> = {
  blue: { tint: 0x3b82f6, alphaMult: 1.7 },
  purple: { tint: 0xa855f7, alphaMult: 1.7 },
  red: { tint: 0xef4444, alphaMult: 1.9 },
};

// Pseudo-perspective scale: objects are drawn bigger toward the foreground
// (south / larger world Y) and smaller toward the back (north). PURELY VISUAL —
// it scales sprites + foot shadows only. Collision boxes, attack ranges, the
// counter radius and every other distance are never touched. Measured as a
// scale offset from the player's foot plane, so the player stays ~1.0 and
// objects grow/shrink relative to the hero.
const DEPTH_SCALE_ENABLED = true;
// 擬似遠近のスケール係数。すべて描画のみ(当たり判定/射程/速度/スコアには不干渉)。実機チューニング用に
// URLで上書き可: ?depthmin= / ?depthmax=(木・物・拾い物) / ?edepthk= / ?edepthmin= / ?edepthmax=(敵)。
// 既定は位置ベースのマッピング(下記 DEPTH_POS_MAP=true)。?depthmap=0 で旧方式(DEPTH_K のクランプ式)へ。
const DEPTH_K = tsNum('depthk', 0.0009);   // (旧方式用) scale change per world-Y px from the player plane
const DEPTH_MIN = tsNum('depthmin', 0.01); // 画面上端(最遠)のスケール。社長確定値。
const DEPTH_MAX = tsNum('depthmax', 1.7);  // 画面下端(最近)のスケール。社長確定値。
// Enemies get a deliberately more extreme depth falloff than the rest.
const ENEMY_DEPTH_K = tsNum('edepthk', 0.00145);
const ENEMY_DEPTH_MIN = tsNum('edepthmin', 0.55);
const ENEMY_DEPTH_MAX = tsNum('edepthmax', 1.85);
// --- 位置ベースの遠近マッピング(既定ON=社長確定。?depthmap=0 で旧方式へ) ------------------
// 「足元が画面外でも頭が見える背の高い物の拡縮が止まる」対処。サイズ範囲(min/max)を“足元の画面位置”に割り当てる:
// プレイヤー面=等倍 / 画面上端=min / 画面下端=max(=画面内でレンジ使い切り)。端を越えても min/max を越えて伸び続け、
// 平坦になるのは画面外 ±DEPTH_EDGE_MARGIN を超えた所だけ=可視範囲では止まらない。
const DEPTH_POS_MAP = tsBool('depthmap', true);
const DEPTH_MAP_CURVE = Math.max(0.2, tsNum('dmapcurve', 1.0)); // 1=線形 / >1=プレイヤー付近ゆっくり・端で速い
const DEPTH_EDGE_MARGIN = Math.max(0, tsNum('depthedge', 500)); // 画面端の外側マージン(背の高い物の頭ぶん)px。社長確定値。
// 設置物の消失(透明化)は他の者(敵/木/プロップ)と同じ共通フェード `horizonActorAlpha`(地平線で消える)を使う。
// 研究所の立体壁を擬似遠近(高さ方向のみ)に参加させる強さ。?labdepth= で調整(既定0.6=床オブジェクトより緩め)。
// 既存 DEPTH_K に対する倍率。clamp はゆるめ(下記)。width は絶対にスケールしない(床/隣接/判定とズレるため)。
const LAB_WALL_DEPTH_STRENGTH = Math.max(0, tsNum('labdepth', 0.6));
const LAB_WALL_DEPTH_MIN = 0.8;
const LAB_WALL_DEPTH_MAX = 1.35;
// 背景 void プレートの低速パララックス係数(0=世界と一緒に動く / 大きいほど奥に見える=ゆっくり)。
const LAB_VOID_PARALLAX = 0.12;
const LAB_VOID_TILE = 420; // 1タイルの world 幅(px)。大きめにして外周での繰り返しを目立たせない。
const GROUND_TILE_SCALE_X = 0.82;
const GROUND_TILE_SCALE_Y_NEAR = 0.82;
// 遠近を少し強める(遠くをもっと遠くへ): 最遠を more 圧縮 + カーブを立てて圧縮域を広げる。
// 戻すなら FAR 0.12 / CURVE 2.05。
// 床の遠景効果(奥の縦圧縮)。?gfar=0.04 等でURL生調整可。小さいほど遠くが圧縮=遠く見える。
// 既定 0.055(旧 0.12→0.09→0.055。社長指示でさらに強化)。
const GROUND_TILE_SCALE_Y_FAR = tsNum('gfar', 0.055);
const GROUND_SCROLL_X_FEEL = 1.2;
const GROUND_SCROLL_Y_FEEL = 3.0;
// 床の遠近カーブ。?gcurve=3 等でURL生調整可。大きいほど手前まで圧縮が効く=奥行き強。
// 既定 2.6(旧 2.05→2.35→2.6。社長指示で強化)。
const GROUND_PERSPECTIVE_CURVE = tsNum('gcurve', 2.6);
const NEAR_GROUND_BLUR_STRIP_RATIO = 0.34;
const NEAR_GROUND_BLUR_STRENGTHS = [0.8, 1.45, 2.05];
// 遠景(奥)側の地面も被写界深度で少しぼかす。最上(最遠)ほど強く。中央は合焦=鮮明のまま。
const FAR_GROUND_BLUR_STRIP_RATIO = 0.28;
const FAR_GROUND_BLUR_STRENGTHS = [0.65, 0.35]; // [最遠, やや遠]。ピークを遠景森(0.65)と同程度に
// 物/敵の擬似遠近は「地面の相対遠近(groundBlend)」が支配的。これらが拡縮の“効く範囲”と飽和位置を決める
// (DEPTH_MIN/MAX を変えても位置が動かないのはこのため)。WEIGHT=地面遠近への追従度、MIN/MAX=相対比のクランプ。
// 範囲を広げたい場合: ogmin↓ / ogmax↑(飽和を遅らせる)、gcurve↓(手前まで均等に効く)、ogw↑(地面に強く追従)。
const OBJECT_GROUND_RELATIVE_WEIGHT = tsNum('ogw', 0.42);
const OBJECT_GROUND_RELATIVE_MIN = tsNum('ogmin', 0.68);
const OBJECT_GROUND_RELATIVE_MAX = tsNum('ogmax', 1.45);
// 物/敵の擬似遠近“専用”カーブ(床=gcurve/gfar とは独立)。これを変えても地面の見た目は変わらない。
// 既定は床と同値=現状維持。?ocurve=(下げると拡縮が手前まで均等に効く=変わる範囲が広がる) / ?ofar= で調整。
const OBJECT_PERSP_CURVE = tsNum('ocurve', GROUND_PERSPECTIVE_CURVE);
const OBJECT_PERSP_FAR = tsNum('ofar', GROUND_TILE_SCALE_Y_FAR);
// 物/敵の遠近の帯を画面外へ延長する量(px)。?opad= で調整。大きいほど画面端でも拡縮が止まらない
// (飽和点が画面外へ出る)。0=従来(画面ちょうどで飽和)。床には影響しない。
const OBJECT_PERSP_PAD = Math.max(0, tsNum('opad', 0));
// 木の見た目倍率。木はステージ1(森)とステージ3(廃都)にのみ出現するため、この値=その2ステージの木サイズ。
// 社長指示で 1.5倍(1.65→2.475)。見た目のみ拡大=幹のヒットボックス(world/trees.ts)は不変(視覚と当たりは分離)。
const TREE_VISUAL_SCALE = 1.65 * 1.5;
const PICKUP_VISUAL_SIZE = 30;
const TORCH_VISUAL_W = 42;
const TORCH_VISUAL_H = 68;
// ステージ4の焚き火(松明の置き換え)。横長の焚き火台なので幅広・低め。炎は台の中央(低い位置)。
const CAMPFIRE_VISUAL_W = 60;
const CAMPFIRE_VISUAL_H = 34;
const TORCH_LIGHT_RADIUS = 92;
const TORCH_EMBER_COUNT = 7;
const TORCH_REFLECTION_W = 92;
const TORCH_REFLECTION_H = 24;
const STRONG_GLOW_RADIUS = 44;
const EFFECT_VIEWPORT_MARGIN = 180;
// 設置型シールド: スプライト表示と「ガチャン」着地スラムのパラメータ(実機調整TODO)。
const SHIELD_DISPLAY_H = 92;     // 画面上の盾の高さ(px)。横幅はテクスチャ比で従属。
const SHIELD_DEPLOY_MS = 200;    // 着地スラム演出の時間
const SHIELD_DEPLOY_DROP = 16;   // 落下開始オフセット(px、上から構える)
const DECOY_DISPLAY_H = 56;      // 設置型デコイ装置の画面上の高さ(px)
const TORCH_VIEWPORT_MARGIN = 170;
const TORCH_FAR_FADE_MARGIN = 120;
const SMALL_GLOW_SPRITE_RADIUS_MAX = STRONG_GLOW_RADIUS - 1;
const SMALL_GLOW_RADIUS_SCALE = 0.88;
const SMALL_GLOW_ALPHA_SCALE = 0.74;
const PLAYER_DEATH_FADE_MS = 1000; // 死亡時に立ち絵をフェードアウトする長さ(社長指示=1秒)
const GROUND_REFLECTION_ENABLED = true;
const GROUND_REFLECTION_ALPHA = 0.28;
const GEM_BODY_GLOW_ALPHA = 0.38;
const LOCAL_EVENT_SHADE_ALPHA = 0.5;
const LOCAL_EVENT_SHADOW_ALPHA = 0.96;
const LOCAL_EVENT_MAX_CAST_SHADOWS = 22;
const LOCAL_EVENT_SHADOW_REACH_MULT = 6.25;

const SPRITE_PICKUPS = new Set(['experience', 'health', 'magnet', 'bomb', 'chest', 'weapon-crate', 'treasure', 'lab-clear-item']);

// 研究所ゾンビのテクスチャ名(Lv1/2 は敵idで男女を固定振り分け、Lv3 は1種)。lab以外は null。
const labEnemyTextureName = (type: string, id: string): string | null => {
  if (type === 'lab-zombie-3') return 'lab-zombie/lab-zombie-lv3';
  if (type === 'lab-zombie-1' || type === 'lab-zombie-2') {
    const lvl = type === 'lab-zombie-2' ? 'lv2' : 'lv1';
    let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    const sex = (h & 1) === 0 ? 'male' : 'female';
    return `lab-zombie/lab-zombie-${lvl}-${sex}`;
  }
  return null;
};

// ステージ3(廃都)専用の敵絵。stage1のアトラス敵を見た目で1:1差し替え(社長提供シート)。
// 当たり判定/サイズは不変(enemyFootBox+containScale で枠に収めるだけ)。farBackdrop==='city' のみ。
const STAGE3_ENEMY_TYPES = new Set(['zombie', 'bat', 'skeleton', 'plant', 'ghost', 'werewolf', 'pumpkin', 'giantbat', 'reaper']);
const stage3EnemyTextureName = (type: string): string | null =>
  STAGE3_ENEMY_TYPES.has(type) ? `stage3-enemies/${type}` : null;
// ステージ3のボス(giantbat)は新絵が少し小さいので見た目だけ 1.2倍(社長指示)。当たり判定/射程は不変。
const STAGE3_BOSS_VISUAL_SCALE = 1.2;

// 裏ボスは「当たり判定=足元の帯(AABB=enemy.width×height)」と「絵(巨体)」を分離して描く(社長指示)。
// fit = 絵の中での帯の位置・大きさ(0..1 の割合): w/h=帯が絵に占める幅/高さ, cx/cy=帯中心の絵内座標(左上原点)。
// これで scale=(帯幅/fit.w)/texW から絵の実寸が決まり、帯=AABBの上に絵が正しく乗る。素材の額装が変わったら再計測。
const BOSS_SPRITE_FIT: Record<string, { w: number; h: number; cx: number; cy: number }> = {
  mimir:      { w: 0.55, h: 0.24, cx: 0.48, cy: 0.84 }, // 眼(縦長 849×1080)。帯=絵の一番下のピクセル寄り(社長指示)。
  jormungand: { w: 0.91, h: 0.21, cx: 0.50, cy: 0.72 }, // 巨蛇(横長 1280×960)。帯=とぐろの下端。
  skadi:      { w: 0.92, h: 0.19, cx: 0.49, cy: 0.88 }, // 氷の王(1151×1243)。帯=足元。
};
const BOSS_FIT_DEFAULT = { w: 0.8, h: 0.2, cx: 0.5, cy: 0.85 };
// 設置物(盾)/召喚が攻撃された時の被弾シェイク。減衰する短い横揺れ(描画のみ)。
const HIT_SHAKE_MS = 220;
const HIT_SHAKE_PX = 4;
// プレイヤーが裏ボスの当たり判定(帯)より奥=裏に回り込んだとき、巨体の絵で自機が隠れないよう薄く透かす(社長指示)。
const BOSS_BEHIND_ALPHA = 0.5;
const STAGE4_ENEMY_VISUAL_SCALE = 1.5; // ステージ4の全敵絵を1.5倍(社長指示)。足元アンカーで上方向に拡大。
// ステージ4の敵絵は接地点(足元)が画像の水平中心からずれている個体がある(切り出し由来)。
// 足元の接地帯(下端12%)のα重心を測った水平位置(テクスチャ幅に対する比率)。0.5=中央。
// drawEnemy で「重心が footX に乗る」ように水平オフセットを掛けて補正する(視覚のみ=hitbox不変)。
const STAGE4_FOOT_FRAC_X: Record<string, number> = {
  bat: 0.367,
  ghost: 0.535,
  giantbat: 0.471,
  lich: 0.505,
  plant: 0.501,
  pumpkin: 0.503,
  reaper: 0.596,
  skeleton: 0.411,
  werewolf: 0.441,
  zombie: 0.428,
};

// ステージ4(雪原)専用の敵絵。既存9種を見た目で1:1差し替え＋新型 lich(社長提供シート)。
// 当たり判定/サイズは不変(enemyFootBox+containScale で枠に収めるだけ)。farBackdrop==='snow' のみ。
const STAGE4_ENEMY_TYPES = new Set(['zombie', 'bat', 'skeleton', 'plant', 'ghost', 'werewolf', 'pumpkin', 'giantbat', 'reaper', 'lich']);
const stage4EnemyTextureName = (type: string): string | null =>
  STAGE4_ENEMY_TYPES.has(type) ? `stage4-enemies/${type}` : null;

const AMMO_INDICATOR_COLOR: Record<string, string> = {
  'ammo-handgun': '#d4a017',
  'ammo-shotgun': '#ef4444',
  'ammo-rifle': '#f59e0b',
  'health': '#fb7185',
  'weapon-crate': '#60a5fa',
  'weapon-drop': '#bfdbfe',
  'quick-magazine': '#cbd5e1',
  'treasure': '#facc15',
};

const containScale = (boxW: number, boxH: number, texW: number, texH: number) =>
  Math.min(boxW / texW, boxH / texH);

const stablePhase = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 1000) / 1000 * Math.PI * 2;
};

const actorShadowWidthFromSprite = (view: ActorView | undefined | null, fallbackW: number) => {
  const spriteW = view?.sprite.visible === false ? 0 : Math.abs(view?.sprite.width ?? 0);
  return spriteW > 0 ? spriteW * 0.55 : fallbackW;
};

// One pooled actor view (player or enemy): a foot-anchored sprite plus a
// behind-sprite reticle layer and an above-sprite overlay layer, all in one
// container whose zIndex is the foot Y (the Y-sort key).
interface ActorView {
  container: Container;
  light: Sprite;
  reticle: Graphics; // below the sprite (stun reticle / tint)
  sprite: Sprite;
  overlay: Graphics; // above the sprite (health bar, hit flash, boss marker)
}

interface PropView {
  container: Container;
  light: Sprite;
  reflection: Sprite;
  sprite: Sprite;
  flame: Graphics;
  overlay: Graphics;
}

interface PickupView {
  container: Container;
  glow: Graphics;
  gfx: Graphics;
  sprite?: Sprite;
}

type EffectView = Container | Graphics | Text | Sprite;

// One drifting ambient mote (蛍 or 雪 — 同じプールを使い回す)。
interface Firefly {
  sprite: Sprite;
  x: number; y: number;   // world position
  vx: number; vy: number; // drift velocity (px/s)
  phase: number; freq: number; base: number; size: number;
  snowFall: number;       // 雪モード時の落下速度(px/s)
  snowDrift: number;      // 雪モード時の横ドリフト(px/s)
}
// ステージ4の雪(蛍プールを流用)。進行方向(プレイヤー速度)に連動して流れる。
const SNOW_TINT = 0xeaf2ff;
const SNOW_WIND_FACTOR = 0.5; // プレイヤー速度に対する雪の流れ係数(逆向き=進む方向へ流れて見える)

// 診断用: URLに ?dancevfx=0 を付けるとダンスのPixi描画(ミラーボール/サークル/矢印/暗転/発光)を一切出さない。
const RHYTHM_VFX_OFF = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('dancevfx') === '0';

export class PixiScene {
  private L: SceneLayers;

  private trees = new Map<string, { sprite: Sprite; baseScale: number; footY: number }>();
  private wallObjs = new Map<string, { sprite: Sprite; baseScale: number; footY: number }>(); // 壁オブジェクト(区画生成)
  private propObjs = new Map<string, { sprite: Sprite; baseScale: number; footY: number }>(); // 遮蔽物プロップ(区画生成・研究所スキン)
  private cityPropObjs = new Map<string, { sprite: Sprite; baseScale: number; footY: number }>(); // ステージ3(廃都)の散布オブジェクト
  private enemies = new Map<string, ActorView>();
  // 錬金術の召喚ユニット(味方)。敵と同じ actor プールを使い、シアンtintで描く。
  private summonViews = new Map<string, ActorView>();
  private breakableProps = new Map<string, PropView>();
  private playerView: ActorView | null = null;
  // 分身(サブウェポン): プレイヤーと同じ立ち絵を白黒キャッシュで描く足元アンカーのスプライト。
  private shadowCloneSprite = new Sprite();
  private shadowCloneAdded = false;
  // 白黒テクスチャのキャッシュ(テクスチャ名→事前ベイクした RenderTexture)。毎フレームのフィルタ処理を避ける。
  private grayTexCache = new Map<string, Texture>();
  private castleView = new Container();
  private castleSprite = new Sprite();
  private castleGlow = new Sprite(getGlowTexture());
  private merchantView = new Container();
  private merchantSprite = new Sprite();
  private merchantGlow = new Sprite(getGlowTexture());
  private merchantGfx = new Graphics();
  private eventNpcView = new Container();
  private eventNpcSprite = new Sprite();
  private eventNpcGlow = new Sprite(getGlowTexture());
  private eventNpcGfx = new Graphics();

  private pickups = new Map<string, PickupView>();
  private projectiles = new Map<string, Graphics>();
  // 設置型シールドは actorLayer に置いて足元Yでy-sort(上部はキャラ被り)。
  private shieldViews = new Map<string, { container: Container; sprite: Sprite }>();
  // 設置型デコイ: 射程サークル(Graphics)+ 装置スプライト。
  private decoyViews = new Map<string, { container: Container; gfx: Graphics; sprite: Sprite }>();
  // 自動タレット: 砲台ボディ(Graphics)。前方集中/全方位でモード別の見た目。
  private turretViews = new Map<string, { container: Container; gfx: Graphics; sprite: Sprite }>();
  private effects = new Map<string, EffectView>();

  // ① 通常足影: ソフト影テクスチャのスプライトプール(Graphics廃止)。光方向へ回転+伸縮で
  // 「伸びる/向き」を保ちつつ、毎フレームのブラーパス無しで柔らかいエッジにする。
  private shadowContainer = new Container();
  private shadowPool = new Map<string, Sprite>();
  // 商人/イベントNPC/城/拾い物 のソフト影リクエスト(各 sync が可視時に設定、syncShadows が配置)。
  private merchantShadow: { x: number; y: number; w: number; alpha: number } | null = null;
  private npcShadow: { x: number; y: number; w: number; alpha: number } | null = null;
  private castleShadow: { x: number; y: number; w: number; alpha: number } | null = null;
  // 拾い物は複数あるので配列で要求(id は 'pk:'+pickup.id)。syncPickups が毎フレーム作り直す。
  private pickupShadows: { id: string; x: number; y: number; w: number; alpha: number }[] = [];
  private introUntil = 0;       // 登場演出の終了時刻(store から毎フレーム反映)
  private introActive = false;  // 登場演出中(影スキップ判定用)
  // 障害物の「裏に回ったら透ける」用: プレイヤーの足元矩形(world)とフェードlerp係数を毎フレ更新。
  private seeThroughPlayer = { cx: 0, footY: 0, halfW: 0, top: 0 };
  private seeThroughLerp = 1;
  private playerRidingHeli = false; // フェーズA中=プレイヤーをヘリ前面(danceUiLayer)へ移しているか
  private helicopter = new Sprite(); // 登場演出のヘリ(画像 'helicopter' 登録時のみ表示)
  // 錬金術の魔法陣: 足元に常設する地面スプライト。チャネル中だけ alpha=溜め進捗で
  // 連続フェード(透明→完成で不透明)。手続き的リングは廃止しこれに置き換え。
  private alchemyCircle = new Sprite();
  private alchemyCircleTextured = false;
  // 城フィナーレボスの出現魔法陣(錬金と同じ magic-circle テクスチャを流用)。bossSummonAt 起点に短時間表示。
  private castleSummonCircle = new Sprite();
  private castleSummonTextured = false;
  // 鞭ハリケーン: 吸引中心に立つ竜巻スプライト。store の hurricane 状態で駆動。
  private whipHurricane = new Sprite();
  private whipHurricaneTextured = false;
  // 四神舞(リズム): プレイヤー頭上のミラーボール+左右サークル+矢印プロンプト(軽量Graphics)。
  private rhythmOverlay = new Graphics();
  // リズム中のタップ発光(screen-space, uiLayer 最前面)。
  private rhythmScreenFx = new Graphics();
  private rhythmDim = 0;
  // リズム中の暗転: 地面/遠景だけを暗くする(worldGroup の filteredWorld 手前に置くので、
  // 背景木・影・アクター等のオブジェクトは暗くならない)。dim は共通のイージング濃さ。
  private rhythmDimGfx = new Graphics();
  // ステージ2(ラボ)の景色ダーク幕。rhythmDimGfx と同じく filteredWorld 直前=プレイヤー/光より下に置き、
  // ミラーボール本体(実テクスチャのスプライト)。0.5秒ごとに左右反転して回転に見せる。
  private rhythmBall = new Sprite();
  // 四神名(コマンドの右に出すテキスト)。テキスト変化時のみ更新。
  private rhythmGodText = new Text({ text: '', style: { fontFamily: 'serif', fontSize: 13, fontWeight: 'bold', fill: 0xfca5a5, stroke: { color: 0x0b1020, width: 3 } } });
  private rhythmGodLast = '';
  // コマンド/入力の矢印は別Graphicsに分離し、内容が変わった時だけ再描画(毎フレームの矩形リビルドを回避)。
  // 位置(プレイヤー追従)は毎フレーム transform だけ更新する。
  private rhythmArrowsGfx = new Graphics();
  private rhythmArrowsKey = '';
  private groundReflectionGfx = new Graphics();
  private arenaGfx = new Graphics(); // 囲い系イベントの柵リング(半透明の光る円ストローク・world座標)
  private returnGfx = new Graphics(); // 帰還サークル(地面・world座標。滞在で外周が満ちる)
  private static enemyDrawErrLogged = false; // drawEnemy 例外ログは初回だけ(1体の描画失敗で全体が固まらないよう保護)
  private baseSitesGfx = new Graphics(); // 拠点候補地サークル(地面・world座標。滞在で外周が満ちる)
  private bossCorpseSprite = new Sprite(); // 裏ボス討伐時のフェードアウト演出(頭基準・world座標。store.bossCorpse を参照)
  private rescueGfx = new Graphics(); // 救助NPCのHPバー/コールアウト(actorLayer 最前=常に見える)
  private rescueSurvivorSprites = new Map<string, Sprite>(); // 救助NPC本体スプライト(2コマ歩き・足元アンカー・y-sort)
  private baseSoldierSprites = new Map<string, Sprite>(); // 拠点駐留兵士の立ち絵(救助NPCと同じ shooter 素材・足元アンカー・y-sort)
  private baseSoldierFace = new Map<string, { px: number; face: number }>(); // 兵士の向き(前フレx差分で決定)
  private rescueFace = new Map<string, { vx: number; face: number }>(); // 向きの平滑化(EMA)＋ヒステリシス。パタパタ反転防止
  private enemyJumpHop = new Map<string, number>(); // ジャンプ中の最新ホップ高(px)。盾ブロック時の落下補間の起点に使う
  private enemyBlockFall = new Map<string, { from: number; start: number }>(); // 盾で弾かれて空中から落ちる演出(from→0へ補間)
  private rescueSweatGfx = new Graphics(); // パニック逃走の汗マーク(uiLayer=環境光の影響外・screen座標)
  private pumpkinTelegraph = new Graphics(); // パンプキン/lab-zombie-3 のジャンプ着地予告(赤い影)
  private boomReadyGfx = new Graphics();     // ドローンブーメランCD明けの頭上マーク(ふわっと出て消える)
  private marksmanMarkGfx = new Graphics();  // マークスマン射程上昇 発動時の頭上ターゲットマーク(一瞬)
  private homingLockGfx = new Graphics();   // ホーミング弾ロックインジケーター(ロック済み敵の頭上マーカー)
  private slasherRingGfx = new Graphics();  // スラッシャー: アクティブリロード型タイミングリング(描画のみ)
  // ロックオンサークルの出現アニメ(敵ID→開始時刻+ロック数)。ズームアウト→イン+フェードインの起点。
  private lockAnim = new Map<string, { startedAt: number; count: number }>();
  private localEventShadeGfx = new Graphics();
  private playerFx = new Graphics();   // counter ring + reload meter (world)
  // 照準サークル(PHILL/ワイヤーアンカーのプレビュー)専用。uiLayer(=研究所の暗幕 labVeil や
  // 森の暗転/tilt-shift より上)に置き、環境光の影響を一切受けない。uiLayer は screen 座標なので
  // 描画時に world.position(=-camera+shake)を足して world→screen 変換する。
  private reticleGfx = new Graphics();
  private wireTip: Sprite | null = null; // ワイヤーアンカー先端スプライト(world座標・遅延生成)
  private flashGfx = new Graphics();   // full-screen damage flashes (screen)
  private arrowGfx = new Graphics();   // off-screen supply arrows (screen)
  private playerDeathAt = 0;           // 死亡で立ち絵フェード開始した時刻(now基準。health>0でリセット)

  // Atmosphere (screen space). gradeSprite multiplies the world cool; the warm
  // playerLight is added on top so the hero stays bright; vignette darkens edges.
  private gradeSprite = new Sprite(Texture.WHITE);
  private playerLight = new Sprite(getGlowTexture());
  private playerGroundPool = new Sprite(getGlowTexture()); // A: 足元の地面に敷く光だまり(加算)
  private playerKatanaBack = new Sprite();                 // 背負い刀(刀/小烏丸 装備中・プレイヤー背面)
  private playerKatanaBackAttached = false;                // playerView.container へ親子付け済みか
  private stageLightShaftGfx = new Graphics();
  private vignette = new Sprite(getVignetteTexture());
  private lowHpVignette = new Sprite(getRedVignetteTexture()); // 瀕死(HP≤20): 暗い赤のビネットがドクンと脈動(赤色テクスチャ)
  private vignetteNarrow: boolean | null = null; // 現在のvignetteが狭い版(lab用)か。差分時だけテクスチャ差し替え。
  private worldFadeMask = new Sprite(Texture.WHITE);
  private worldFadeMaskTexture: Texture | null = null;
  private horizonForestFadeMask = new Sprite(Texture.WHITE);
  private horizonForestFadeMaskTexture: Texture | null = null;
  private frontForestFadeMask = new Sprite(Texture.WHITE);
  private frontForestFadeMaskTexture: Texture | null = null;
  private nearGroundBlurLayers: Container[] = [];
  // 深層域グレーディング(退色セピア・描画のみ)。stageルートに ColorMatrixFilter を1枚、alpha でフェード。
  private deepGradeFilter: ColorMatrixFilter | null = null;
  private deepGradeAmount = 0;   // 0..1 現在のかかり具合(1秒フェード)
  private deepGradeOn = false;   // ヒステリシス: 深層域内か(enter=D / exit=D-200)
  private lastGradeNow = 0;      // フェード用 dt 計測

  private tiltShift: TiltShiftFilter | null = null;
  private bloom: AdvancedBloomFilter | null = null;
  private bloomActive = true; // 現在ブルームをフィルタ配列に入れているか(オプション反映用)
  private farBackdropBlur: BlurFilter | null = null;
  // 昼ステージ(正午)モード。s.farBackdrop==='city' の間 true。環境の暗転/グレード/霧/減光を弱める。
  private daylight = false;
  private snowStage = false; // ステージ4(farBackdrop'snow'): 松明を焚き火スプライトに置き換え
  private isLabStage = false; // 現在の出撃が lab テーマ(ステージ2)か。影向きの分岐に使用。
  private daylightApplied: boolean | null = null;
  // 環境物(地面/木/森)の現在の暗転tint。昼=本来色、夜=ENV_TINT。
  private envTintNow() { return this.daylight ? DAY_ENV_TINT : ENV_TINT; }
  // 現在のステージライティング preset。昼=sunlight(暖色・影長め)/ 夜=moonlight(寒色・影短く淡い)。
  // プレイヤー補助光の色/影の長さ・濃さ/god ray色/bloomScale を駆動する。
  private lighting(): StageLightingPreset { return this.daylight ? SUNLIGHT_PRESET : MOONLIGHT_PRESET; }
  // 昼/夜の一括切り替え(状態変化時のみ適用)。毎フレームのグレードα/木tintは各所が envTintNow / daylight を参照。
  private applyDaylight(on: boolean) {
    if (this.daylightApplied === on) return;
    this.daylightApplied = on;
    const tint = on ? DAY_ENV_TINT : ENV_TINT;
    // 昼(ステージ3)は床=石畳 / 地平帯=廃墟都市 に差し替え(注入済みなら)。夜/ラボは触らない
    // (=テーマ側の管理に任せる)。tint は昼=本来色(白)。
    if (on && this.stage3GroundTex) {
      for (const strip of this.L.groundStrips) if (strip.texture !== this.stage3GroundTex) strip.texture = this.stage3GroundTex;
    }
    if (on && this.stage3HorizonTex && this.L.horizonForest.texture !== this.stage3HorizonTex) {
      this.L.horizonForest.texture = this.stage3HorizonTex;
      this.layoutHorizonForest();
    }
    // 遠景森2(nearHorizon)はステージ別キー(s.nearHorizon)で applyNearHorizon が毎フレーム管理。
    for (const strip of this.L.groundStrips) strip.tint = tint;
    this.L.horizonForest.tint = tint;
    this.L.frontForest.tint = tint;
    this.gradeSprite.tint = on ? DAY_GRADE_TINT : GRADE_TINT;
    this.vignette.alpha = on ? DAY_VIGNETTE_ALPHA : ENV_VIGNETTE_ALPHA;
    // 足元の光だまり: 昼=暖色 / 夜=寒色(月明り)。暖色のままだと夜に黄色く見える(社長指摘)。
    this.playerGroundPool.tint = on ? LIGHT_POOL_TINT : MOON_POOL_TINT;
    for (const f of this.fogLayers) f.sp.alpha = (f.baseAlpha ?? f.sp.alpha) * (on ? DAY_FOG_MULT : 1);
    // 斜め光(god ray)は resize 時しか再生成しないので、昼/夜切替時にここで描き直す
    // (色・濃さ・拡散具合が preset で変わるため)。
    this.updateStageLightShafts(this.screenW, this.screenH);
  }

  // 現在の設定に応じて gameplay world(filteredWorld)のフィルタ配列を作り直す(bloom はON時のみ含める)。
  private rebuildWorldFilters() {
    const filters: Filter[] = [];
    if (this.bloom && this.bloomActive) filters.push(this.bloom);
    if (this.tiltShift) filters.push(this.tiltShift);
    this.L.filteredWorld.filters = filters;
  }
  private nearGroundBlurFilters: BlurFilter[] = [];
  private frontForestBlur: BlurFilter | null = null;
  private horizonForestBlur: BlurFilter | null = null;
  private nearHorizonBlur: BlurFilter | null = null;
  private labCeiling: Sprite | null = null; // 研究所スキンの最前面 天井ケーブル帯(上寄せ・半透明)
  // 可視可能ゾーン(研究所スキン): RenderTexture に「暗幕 + erase で円形の穴」を描き、その1枚を
  // 画面に重ねる。erase はテクスチャのアルファを削る=円形・なだらかな穴(マスクのステンシル矩形問題を回避)。
  private renderer: Renderer | null = null;
  private labRT: RenderTexture | null = null;     // 暗幕(穴あき)の描画先
  private labRTScene = new Container();            // 暗幕rect + 光ディスク(eraseで穴)を描く中身(オフスクリーン)
  private labDarkRect = new Sprite(Texture.WHITE); // 暗幕ベース
  private labVeilFade = new Sprite();              // 暗幕上端のソフトフェード帯(揺れで境界線が出ないように)
  private veilFadeTex: Texture | null = null;      // 縦グラデ(上=透明→下=不透明)テクスチャ(遅延生成)
  private labVeilSprite: Sprite | null = null;     // 画面に重ねる暗幕(=labRT)
  private labVisLights: Sprite[] = [];
  setRenderer(r: Renderer) { this.renderer = r; }
  // 背景4層(遠景/地平帯/手前帯/天井)を暗幕の「上」へ退避し、暗くしない(社長指示)。元位置は復元用に保持。
  private labBrightScenery: Container | null = null;
  private labSceneryOrig: { obj: Container; parent: Container; index: number }[] = [];

  private fireflies: Firefly[] = [];
  private firefliesPlaced = false;
  private fxPrevNow = 0;

  // スモッグ(各層1枚をゆらゆら)。
  // bgCloudLayer=world内 actorLayer直前(奥・キャラの後ろ・tilt-shift/envtintが乗る)、
  // forestUnderLayer=stageのfrontForest直前(森下=やまぎり・森の後ろ=森が手前で隠す)、
  // frontBankLayer=uiLayer内 grade上/vignette下(森上=最前面・手前の森に被る)。
  private bgCloudLayer = new Container();     // 奥 = world 内(キャラの後ろ)
  private forestUnderLayer = new Container(); // 森下(やまぎり)= front forest の後ろ
  private frontBankLayer = new Container();   // 森上 = uiLayer(最前面)
  private fogLayers: FogLayer[] = [];       // 各レイヤー1枚ずつの幅広霧(右へ流れる+揺らめき)
  private fogT0 = 0;                          // 流れ(tilePosition)の基準時刻
  private reaperCrossSprite = new Sprite();   // 死神の横切り演出(無害・画面横断のシルエット)
  private reaperCrossLayer = new Container();  // 死神横切り用(world内=被写界深度tilt-shiftが乗る。actorLayer前に画面ピン留め)

  private screenW = 1;
  private screenH = 1;
  private cameraY = 0;
  private zoomApplied = false; // ズーム(待機/パンチ)を worldGroup に適用中か(終了時に1度だけ戻す)
  private labGfx: Graphics | null = null; // 屋内ステージのマーカー(ボタン/ゴール)(world座標・遅延生成)
  private labFloor: TilingSprite | null = null; // 屋内ステージの床タイル(world座標・遅延生成)
  private labVoid: TilingSprite | null = null;  // 背景の天井/void プレート(外周マージンに敷く・低速パララックス)
  private groundStripBaseTex: Texture | null = null; // 屋外の地面ストリップ元テクスチャ(?labpersp で研究所床に差し替える際の復元用)
  private labFloorPlate: Sprite | null = null;        // ?labpersp の焼き込み遠近プレート(一枚絵・screen-space)
  private labWalls: Container | null = null;    // 屋内ステージの壁スプライト群(縦壁/外周=アクターの下に固定)
  private labWallsSig = '';                      // 壁/扉の現状シグネチャ(変化時のみ再構築)
  private labWallActors: Container[] = [];        // 横壁=アクター層に足元アンカーで配置(裏側=北側に回り込める)。下地+線画の Container。
  // 立体壁の擬似遠近(高さ方向のみ)。各ブロックの footY と元の総高(h+RISE)を保持し、毎フレーム scale.y を更新。
  private labWallDepth: { cont: Container; footY: number; fullH: number; x0: number; w: number }[] = [];
  private labWallDepthRefY = NaN; // 直近の depthRefY(変化なしなら更新スキップ)
  private labFloorDecor: Container | null = null;  // 床の変種パッチ(blood/grime/crack/scorch)＋隅AO。決定的ハッシュで1度だけ生成。
  private labFloorDecorSig = '';                   // 変種散布の生成シグネチャ(部屋集合は静的なので実質1回)。
  private labWallShadow: Graphics | null = null;   // 壁下辺の焼き込み落ち影(右上光源→左下オフセット)。壁/扉と同シグネチャで再構築。
  private labPropSprites: Sprite[] = [];          // 屋内の障害物プロップ(木の代わり)。アクター層で深度ソート。
  private labPropFoot: { sp: Sprite; x: number; y: number }[] = []; // プロップの元 foot(?labpersp 投影/復元用)
  private labPropSig = '';                        // プロップ配置シグネチャ(変化時のみ再構築)
  private idleZoom = 1;        // 手を離して待機中だけ寄る持続ズーム(滑らかに 1↔1+mag)
  private lastZoomNow = 0;     // 待機ズームのフレーム間 dt 計算用
  private hitstopFreezeNow = 0; // ヒットストップ中に固定するアニメ時計(0=非固定)
  private depthRefY = 0; // player foot world-Y this frame (the focal plane)
  private enemyCount = 0;
  private horizonForestFootWorldY = -Infinity;

  constructor(layers: SceneLayers) {
    this.L = layers;

    // Bloom + tilt-shift depth-of-field over the gameplay world wrapper.
    // The fixed ground and horizon seam stay outside these filters so blur never
    // smears ground pixels upward over the far panorama. The wrapper itself is
    // screen-space; the camera-offset `world` remains its child.
    // ブルーム/ティルトシフトのインスタンスは「常に」生成しておき、フィルタ配列への
    // 出し入れで切り替える(オプションのON/OFFをリロード無しで反映できる)。
    if (BLOOM_ENABLED) {
      this.bloom = new AdvancedBloomFilter({
        threshold: BLOOM_THRESHOLD,
        bloomScale: BLOOM_SCALE,
        blur: BLOOM_BLUR,
        quality: 4,
      });
    }
    if (TILT_SHIFT_ENABLED) {
      this.tiltShift = new TiltShiftFilter({
        blur: TILT_SHIFT_BLUR,
        gradientBlur: TILT_SHIFT_GRADIENT,
      });
    }
    this.bloomActive = getBloomEnabled();
    this.rebuildWorldFilters();

    // フェーズ1: 環境(地面・森・遠景)を tint で暗く沈める。tint は持続するので一度だけ。
    // 木(actorLayer 内の環境物)は生成時に syncTrees で同じ tint を掛ける。
    for (const strip of this.L.groundStrips) strip.tint = ENV_TINT;
    this.L.farBackdrop.tint = ENV_TINT;
    this.L.horizonForest.tint = ENV_TINT;
    this.L.frontForest.tint = ENV_TINT;

    // 環境光シャフトを軽くぼかしてエッジを柔らかく(加算レイヤー1枚のBlur。?shaftblur=0 でOFF)。
    if (SHAFT_BLUR > 0) {
      this.stageLightShaftGfx.filters = [new BlurFilter({ strength: SHAFT_BLUR, quality: 1 })];
    }

    this.L.filteredWorld.mask = this.worldFadeMask;
    this.L.worldGroup.addChild(this.worldFadeMask);
    this.L.horizonForest.mask = this.horizonForestFadeMask;
    this.L.horizonForest.parent!.addChild(this.horizonForestFadeMask);
    this.L.frontForest.mask = this.frontForestFadeMask;
    this.L.frontForest.parent!.addChild(this.frontForestFadeMask);

    const nearGroundStripCount = Math.max(1, Math.ceil(this.L.groundStrips.length * NEAR_GROUND_BLUR_STRIP_RATIO));
    const nearGroundStart = Math.max(0, this.L.groundStrips.length - nearGroundStripCount);
    const nearGroundStrips = this.L.groundStrips.slice(nearGroundStart);
    const bandCount = NEAR_GROUND_BLUR_STRENGTHS.length;
    const bandSize = Math.max(1, Math.ceil(nearGroundStrips.length / bandCount));
    for (let i = 0; i < bandCount; i++) {
      const bandStrips = nearGroundStrips.slice(i * bandSize, (i + 1) * bandSize);
      if (!bandStrips.length) continue;
      const layer = new Container();
      const filter = new BlurFilter({
        strength: NEAR_GROUND_BLUR_STRENGTHS[i] ?? NEAR_GROUND_BLUR_STRENGTHS[bandCount - 1],
        quality: 2,
      });
      layer.filters = [filter];
      layer.addChild(...bandStrips);
      this.nearGroundBlurLayers.push(layer);
      this.nearGroundBlurFilters.push(filter);
      this.L.groundBase.addChild(layer);
    }

    // 奥(far)側の地面ストリップも帯状ブラー(最遠ほど強く)。near と同じ仕組み・同じ片付け配列を再利用。
    const farGroundStripCount = Math.max(1, Math.ceil(this.L.groundStrips.length * FAR_GROUND_BLUR_STRIP_RATIO));
    const farGroundStrips = this.L.groundStrips.slice(0, farGroundStripCount); // 配列先頭=画面上=最遠
    const farBandCount = FAR_GROUND_BLUR_STRENGTHS.length;
    const farBandSize = Math.max(1, Math.ceil(farGroundStrips.length / farBandCount));
    for (let i = 0; i < farBandCount; i++) {
      const bandStrips = farGroundStrips.slice(i * farBandSize, (i + 1) * farBandSize);
      if (!bandStrips.length) continue;
      const layer = new Container();
      const filter = new BlurFilter({
        strength: FAR_GROUND_BLUR_STRENGTHS[i] ?? FAR_GROUND_BLUR_STRENGTHS[farBandCount - 1],
        quality: 2,
      });
      layer.filters = [filter];
      layer.addChild(...bandStrips);
      this.nearGroundBlurLayers.push(layer);
      this.nearGroundBlurFilters.push(filter);
      this.L.groundBase.addChild(layer);
    }

    this.farBackdropBlur = new BlurFilter({
      strength: FAR_BACKDROP_BLUR,
      quality: 2,
    });
    this.L.farBackdrop.filters = [this.farBackdropBlur];

    if (FRONT_FOREST_BLUR > 0) {
      this.frontForestBlur = new BlurFilter({
        strength: FRONT_FOREST_BLUR,
        quality: 3,
      });
      this.L.frontForest.filters = [this.frontForestBlur];
    }

    if (HORIZON_FOREST_BLUR > 0) {
      this.horizonForestBlur = new BlurFilter({
        strength: HORIZON_FOREST_BLUR,
        quality: 2,
      });
      this.L.horizonForest.filters = [this.horizonForestBlur];
    }

    if (NEAR_HORIZON_BLUR > 0) {
      this.nearHorizonBlur = new BlurFilter({
        strength: NEAR_HORIZON_BLUR,
        quality: 2,
      });
      this.L.nearHorizon.filters = [this.nearHorizonBlur];
    }

    // Ambient fireflies: screen-space sprites driven by world coordinates.
    // They stay outside filteredWorld so the field depth-of-field never blurs
    // them, but they are added before grade/vignette so atmosphere still binds.
    if (FIREFLY_ENABLED) {
      const tex = getGlowTexture();
      for (let i = 0; i < FIREFLY_COUNT; i++) {
        const sprite = new Sprite(tex);
        sprite.anchor.set(0.5);
        sprite.tint = FIREFLY_TINT;
        sprite.blendMode = 'add';
        this.L.uiLayer.addChild(sprite);
        this.fireflies.push({
          sprite, x: 0, y: 0, vx: 0, vy: 0,
          phase: Math.random() * Math.PI * 2,
          freq: 0.001 + Math.random() * 0.0016,
          base: 0.22 + Math.random() * 0.33,
          size: 4 + Math.random() * 6,
          snowFall: 28 + Math.random() * 34,   // 落下速度(px/s)
          snowDrift: (Math.random() - 0.5) * 18, // 横の自然な揺れ
        });
      }
    }
    // Warm light sits in the GROUND layer, BELOW the actors, so it pools on the
    // floor without ever painting over (and washing out) the character / enemy
    // sprites — they keep their full pixel-art colour and outline (Octopath
    // style). Behind the foot shadows so those still read.
    this.playerLight.anchor.set(0.5);
    this.playerLight.tint = ACTIVE_STAGE_LIGHTING.color;
    this.playerLight.alpha = ACTIVE_STAGE_LIGHTING.playerAssistAlpha;
    this.playerLight.blendMode = 'add';
    this.playerLight.width = this.playerLight.height = ACTIVE_STAGE_LIGHTING.playerAssistRadius * 2;
    // A: 光だまり(足元の広い地面プール)。playerLight より広く濃い。位置/濃さは毎フレーム更新。
    this.playerGroundPool.anchor.set(0.5);
    this.playerGroundPool.tint = LIGHT_POOL_TINT;
    this.playerGroundPool.blendMode = 'add';
    this.playerGroundPool.visible = LIGHT_POOL_ENABLED && LIGHT_POOL_ALPHA > 0;
    // 登場演出のヘリ。danceUiLayer(filteredWorld外=被写界深度でボケない/world座標で追従)に置く。
    // ぼかさない要件のため effectLayer(=tilt-shiftでボケる)からこちらへ移動。画像登場時のみ表示。
    this.helicopter.anchor.set(0.5);
    this.helicopter.visible = false;
    this.L.danceUiLayer.addChild(this.helicopter);
    // 死神の横切り演出: 進行方向側の奥/手前を横断する黒シルエット(無害)。world 内(actorLayer 前)に置き
    // 被写界深度(tilt-shift)を乗せる。レイヤーは毎フレ画面へピン留め(子は素の画面座標)。
    this.reaperCrossSprite.anchor.set(0.5);
    this.reaperCrossSprite.tint = 0x000000;
    this.reaperCrossSprite.alpha = 0.42;
    this.reaperCrossSprite.eventMode = 'none';
    this.reaperCrossSprite.visible = false;
    this.reaperCrossLayer.addChild(this.reaperCrossSprite);
    this.L.world.addChildAt(this.reaperCrossLayer, this.L.world.getChildIndex(this.L.actorLayer));
    this.groundReflectionGfx.blendMode = 'add';
    // 魔法陣スプライト: 加算発光・中心アンカー・既定は非表示(alpha 0)。地面の
    // 反射/光の上、足元シャドウの下に置き、キャラ絵を塗り潰さない。
    this.alchemyCircle.anchor.set(0.5);
    this.alchemyCircle.blendMode = 'add';
    this.alchemyCircle.alpha = 0;
    this.alchemyCircle.visible = false;
    // 城ボスの出現魔法陣も同様(加算発光・中心アンカー・既定非表示)。城の足元の地面に置く。
    this.castleSummonCircle.anchor.set(0.5);
    this.castleSummonCircle.blendMode = 'add';
    this.castleSummonCircle.alpha = 0;
    this.castleSummonCircle.visible = false;
    this.castleSummonCircle.tint = 0xfca5a5; // 城ボスは赤系(錬金のシアンと差別化)
    // tint は付けない: テクスチャに焼いたシアン→白ホットの階調をそのまま活かす。
    this.L.groundLayer.addChild(
      this.groundReflectionGfx,
      this.arenaGfx, // 囲い系イベントの柵リング(地面・アクターの下・world座標)
      this.returnGfx, // 帰還サークル(地面・world座標)
      this.baseSitesGfx, // 拠点候補地サークル(地面・world座標)
      this.pumpkinTelegraph,
      this.playerGroundPool,
      this.playerLight,
      this.alchemyCircle,
      this.castleSummonCircle,
      this.shadowContainer,
    );
    this.bossCorpseSprite.visible = false;
    this.L.actorLayer.addChild(this.bossCorpseSprite); // 裏ボス討伐フェード(アクター層・y-sort)
    this.arenaGfx.blendMode = 'add'; // 半透明の光る柵(加算で発光感)
    this.returnGfx.blendMode = 'add'; // 帰還サークルも加算で発光
    this.baseSitesGfx.blendMode = 'add'; // 拠点候補地サークルも加算で発光
    this.boomReadyGfx.blendMode = 'add'; // 「ピカ!」が光るよう加算
    this.L.effectLayer.addChild(this.boomReadyGfx); // 頭上マークはアクター上に
    this.L.effectLayer.addChild(this.marksmanMarkGfx);
    this.L.effectLayer.addChild(this.homingLockGfx);
    this.L.effectLayer.addChild(this.slasherRingGfx);
    this.marksmanMarkGfx.blendMode = 'add';
    // 鞭ハリケーンは effectLayer(アクター上)に置き、竜巻が吸い込んだ敵を覆う。
    // 通常合成(光らせない=加算しない)。アンカーは竜巻の根元(地面の渦)= 吸引中心。
    this.whipHurricane.anchor.set(0.5, WHIP_HURRICANE_ANCHOR_Y);
    this.whipHurricane.tint = WHIP_HURRICANE_TINT; // 発光を完全に消す(bloom 閾値未満)
    this.whipHurricane.alpha = 0;
    this.whipHurricane.visible = false;
    this.L.effectLayer.addChild(this.whipHurricane);
    // ダンスUI(サークル/矢印/ミラーボール/四神名)は danceUiLayer(filteredWorld外=被写体深度でボケない)へ。
    // spawnされるVFX(四神技の斬撃/バーストなど)は effectLayer のまま=従来どおりボケる。
    this.rhythmOverlay.visible = false;
    this.L.danceUiLayer.addChild(this.rhythmOverlay);
    // タップ発光は screen-space。uiLayer の最下層に置き、画面端マーカー等は上に残す。
    this.rhythmScreenFx.visible = false;
    this.L.uiLayer.addChildAt(this.rhythmScreenFx, 0);
    // 暗転は worldGroup の filteredWorld 直前に挿す(地面/遠景の上、オブジェクト/アクターの下)。
    this.rhythmDimGfx.visible = false;
    this.L.worldGroup.addChildAt(this.rhythmDimGfx, this.L.worldGroup.getChildIndex(this.L.filteredWorld));
    // ミラーボール: 頭上に表示。rhythmOverlay(リング/矢印)より上に描く。
    this.rhythmBall.anchor.set(0.5, 0.5);
    this.rhythmBall.visible = false;
    this.L.danceUiLayer.addChild(this.rhythmBall);
    this.rhythmGodText.anchor.set(0, 0.5);
    this.rhythmGodText.visible = false;
    this.L.danceUiLayer.addChild(this.rhythmGodText);
    this.rhythmArrowsGfx.visible = false;
    this.L.danceUiLayer.addChild(this.rhythmArrowsGfx);

    this.castleSprite.anchor.set(0.5, 1);
    this.castleGlow.anchor.set(0.5);
    this.castleGlow.blendMode = 'add';
    this.castleGlow.tint = 0xef4444;
    this.castleView.addChild(this.castleGlow, this.castleSprite);

    this.merchantSprite.anchor.set(0.5, 1);
    this.merchantGlow.anchor.set(0.5);
    this.merchantGlow.blendMode = 'add';
    this.merchantGlow.tint = 0xfbbf24;
    this.merchantView.addChild(this.merchantGfx, this.merchantGlow, this.merchantSprite);

    this.eventNpcSprite.anchor.set(0.5, 1);
    this.eventNpcGlow.anchor.set(0.5);
    this.eventNpcGlow.blendMode = 'add';
    this.eventNpcGlow.tint = 0x60a5fa;
    this.eventNpcView.addChild(this.eventNpcGfx, this.eventNpcGlow, this.eventNpcSprite);

    this.L.effectLayer.addChild(this.playerFx);
    // 照準サークルは uiLayer(研究所の暗幕/森の暗転より上=環境光の影響外)へ。screen座標で描画する。
    this.L.uiLayer.addChild(this.reticleGfx);
    this.L.uiLayer.addChild(this.rescueSweatGfx); // 汗マーク=環境光の影響外(uiLayer)
    this.localEventShadeGfx.zIndex = -1_000_000;
    this.L.actorLayer.addChild(
      this.localEventShadeGfx,
      this.castleView,
      this.merchantView,
      this.eventNpcView,
    );
    // 救助NPCはアクター最前(zIndex 大)に描く=常に見える(プレースホルダ)。
    this.rescueGfx.zIndex = 1_000_000;
    this.L.actorLayer.addChild(this.rescueGfx);

    this.gradeSprite.tint = GRADE_TINT;
    this.gradeSprite.alpha = GRADE_ALPHA;
    this.gradeSprite.blendMode = 'multiply';

    this.vignette.alpha = ENV_VIGNETTE_ALPHA;

    // 瀕死ビネット(HP≤20): 暗い赤(テクスチャ自体が赤)。中心アンカーで脈動。既定は非表示。
    this.lowHpVignette.anchor.set(0.5);
    this.lowHpVignette.alpha = 0;
    this.lowHpVignette.visible = false;

    // Screen-space overlays: cool multiply grade darkens/cools the whole scene
    // (multiply preserves detail/outlines), then the vignette, then 瀕死赤, then damage
    // flash + off-screen arrows on top of everything.
    this.L.uiLayer.addChild(
      this.stageLightShaftGfx,
      this.gradeSprite, this.vignette, this.lowHpVignette,
      this.flashGfx, this.arrowGfx,
    );

    // --- スモッグ。奥/森下(やまぎり)/森上 の3層を各1枚で揺らす ---
    // 奥=world内 actorLayer直前(キャラの後ろ)。森下=stageのfrontForest直前(=森の後ろ。森が手前で隠す)。森上=uiLayer最前面。
    this.L.world.addChildAt(this.bgCloudLayer, this.L.world.getChildIndex(this.L.actorLayer));
    const fogStage = this.L.uiLayer.parent;
    if (fogStage) fogStage.addChildAt(this.forestUnderLayer, fogStage.getChildIndex(this.L.frontForest));
    else this.L.uiLayer.addChildAt(this.forestUnderLayer, 0);
    this.L.uiLayer.addChildAt(this.frontBankLayer, this.L.uiLayer.getChildIndex(this.vignette));
    const mkFog = (
      layer: Container, tex: Texture, alpha: number, cfg: Omit<FogLayer, 'sp'>,
      opts?: { blend?: 'add' | 'screen' | 'normal'; whiteTint?: boolean }
    ) => {
      const sp = new TilingSprite({ texture: tex, width: 1, height: 1 });
      sp.tint = opts?.whiteTint ? 0xffffff : FOG_TINT;
      sp.blendMode = opts?.blend ?? 'screen'; // 既定 screen / アルファ透過素材は normal / 黒背景素材は add
      sp.eventMode = 'none';
      sp.alpha = alpha;
      sp.visible = alpha > 0;
      layer.addChild(sp);
      this.fogLayers.push({ sp, baseAlpha: alpha, ...cfg });
    };
    // 各レイヤー1枚ずつ。横は texture を tilePosition で右へ流す+揺らめき、縦は位置の bob で揺らめき。
    // 奥: world 内(キャラの後ろ)・遠景〜地面に被る背の高い霧。もうちょい上。
    mkFog(this.bgCloudLayer, getFogTexture(), FOG_BACK_ALPHA,
      { yFrac: 0.16, widthFrac: 2.2, heightFrac: 0.85, ampX: 18, ampY: 8, spdX: 0.00034, spdY: 0.00048, flow: 0.012, ph: 1.9 });
    // 森下霧: front forest の後ろ。霧素材 fog-alpha.png(アルファ透過版)を通常合成でそのまま重ねる(エフェクトなし)。
    // 非同期ロードのため texKey で sync 時に割当。素材の最大αが約67%なので不透明度は高めに。
    mkFog(this.forestUnderLayer, Texture.EMPTY, FOG_FRONT_ALPHA,
      { yFrac: 0.66, widthFrac: 2.2, heightFrac: 0.95, ampX: 26, ampY: 9, spdX: 0.0008, spdY: 0.0008, flow: 0.030, ph: 3.1, texKey: 'fog-alpha' },
      { blend: 'normal', whiteTint: true });
    // 森上霧: 最前面・最下部。手前の森に被る低い霧。
    mkFog(this.frontBankLayer, getFogTexture(), FOG_TOP_ALPHA,
      { yFrac: 0.92, widthFrac: 2.2, heightFrac: 0.46, ampX: 18, ampY: 8, spdX: 0.00036, spdY: 0.0004, flow: 0.020, ph: 0.7 });
  }

  resize(w: number, h: number) {
    this.screenW = w;
    this.screenH = h;
    const farH = this.farBackdropHeight();
    const farScale = Math.max(w / this.L.farBackdrop.texture.width, farH / this.L.farBackdrop.texture.height);
    this.L.farBackdrop.position.set(0, 0);
    this.L.farBackdrop.width = w;
    this.L.farBackdrop.height = farH;
    this.L.farBackdrop.tileScale.set(farScale);
    this.L.farBackdrop.alpha = 1;
    const horizonH = this.horizonForestHeight();
    this.L.horizonForest.width = w;
    this.L.horizonForest.height = horizonH;
    // 横伸び防止: frontForest と同じく y 基準の均一スケール(x も同値)。横は自然比率のままタイルで繰り返して幅を埋める
    // (parallax で横スクロールする=元々シームレスにタイルできる素材)。非均一(w/texW)だと横に引き伸ばされていた。
    this.L.horizonForest.tileScale.set(horizonH / this.L.horizonForest.texture.height);
    this.L.horizonForest.position.set(0, farH - horizonH * HORIZON_FOREST_OVERLAP_RATIO + HORIZON_FOREST_Y_OFFSET_PX + (this.isLabStage ? LAB_HORIZON_FOREST_EXTRA_DOWN : 0));
    this.layoutNearHorizon(); // 遠景手前森の寸法/位置も追従
    this.updateHorizonForestFadeMask(w, horizonH);
    this.updateWorldFadeMask(w, h);
    this.updatePerspectiveGround(0, 0, 0, 0);
    const frontH = this.frontForestHeight();
    const frontScale = frontH / this.L.frontForest.texture.height;
    this.L.frontForest.position.set(0, h - frontH + (this.snowStage ? FRONT_SNOW_Y_OFFSET : 0));
    this.L.frontForest.width = w;
    this.L.frontForest.height = frontH;
    this.L.frontForest.tileScale.set(frontScale);
    this.L.frontForest.alpha = this.isLabStage ? LAB_FRONT_FOREST_ALPHA : FRONT_FOREST_ALPHA;
    this.updateFrontForestFadeMask(w, frontH);
    this.frontForestFadeMask.position.copyFrom(this.L.frontForest.position);
    // Full-screen atmosphere overlays.
    this.gradeSprite.width = w;
    this.gradeSprite.height = h;
    this.vignette.width = w;
    this.vignette.height = h;
    // スモッグ各層: テクスチャ1枚分が帯にちょうど収まる tileScale(横1枚/縦1枚)。位置/流れは sync。
    for (const f of this.fogLayers) {
      f.sp.width = w * f.widthFrac;
      f.sp.height = h * f.heightFrac;
      const tw = f.sp.texture.width || 1;
      const th = f.sp.texture.height || 1;
      f.sp.tileScale.set(f.sp.width / tw, f.sp.height / th);
    }
    this.updateStageLightShafts(w, h);

    // Pin the DoF filter to the screen and put its sharp band at TILT_SHIFT_BAND.
    if (this.tiltShift) {
      this.L.filteredWorld.filterArea = new Rectangle(0, 0, w, h);
      const bandY = h * TILT_SHIFT_BAND;
      this.tiltShift.start = { x: 0, y: bandY };
      this.tiltShift.end = { x: w, y: bandY };
    }
  }

  private shaftPeriod = 0; // 環境光シャフトのタイル反復幅(横パララックスの折り返し単位)

  private updateStageLightShafts(w: number, h: number) {
    const g = this.stageLightShaftGfx;
    g.clear();
    const lp = this.lighting();
    const night = !this.daylight;
    // 明るさは preset の shaftAlpha 連動(夜=月明りで弱く)。?shaft= は昼基準のマスター倍率として効かせる。
    const alpha = SHAFT_ALPHA * (lp.shaftAlpha / SUNLIGHT_PRESET.shaftAlpha) * (this.daylight ? SHAFT_DAY_BOOST : 1);
    if (alpha <= 0) { this.shaftPeriod = 0; return; }
    g.blendMode = 'add';
    // 月明りは淡く青白い拡散光。夜はシャフト色を少しパステル寄りの蒼白へ(プレイヤー光の色には影響しない)。
    const color = night ? 0xc9d6ff : lp.color;
    // 一定間隔の斜めビームを period 単位でタイル反復して描く。横パララックスで position.x を
    // [-period, 0] に折り返すと継ぎ目なくスクロールできる(森の tilePosition と同じ発想)。
    const period = Math.max(180, w * SHAFT_PERIOD_FACTOR);
    this.shaftPeriod = period;
    // 1 period 内に配置するビーム(period 比のオフセット / 幅 / 相対濃さ)。
    // 夜=「広く淡く」=拡散した月明り。昼=「細く強い」=日差し。
    const wf = SHAFT_WIDTH_FACTOR;
    const beams = night
      ? [
          { off: 0.06, width: w * 0.28 * wf, length: h * 1.24, alpha: 0.30 },
          { off: 0.54, width: w * 0.22 * wf, length: h * 1.16, alpha: 0.20 },
        ]
      : [
          { off: 0.06, width: w * 0.17 * wf, length: h * 1.22, alpha: 0.42 },
          { off: 0.52, width: w * 0.12 * wf, length: h * 1.14, alpha: 0.24 },
        ];
    // 画面 + 両端 period ぶんをカバー(折り返し後も隙間が出ないように)。
    for (let base = -period; base <= w + period; base += period) {
      for (const b of beams) {
        const x1 = base + b.off * period;
        const y1 = -h * 0.14;
        const x2 = x1 + b.length * STAGE_LIGHT_SHAFT_DIRECTION.x;
        const y2 = y1 + b.length * STAGE_LIGHT_SHAFT_DIRECTION.y;
        g.poly([
          x1,
          y1,
          x1 + b.width,
          y1,
          x2 + b.width * 0.32,
          y2,
          x2 - b.width * 0.68,
          y2,
        ]).fill({ color, alpha: alpha * b.alpha });
      }
    }
  }

  private syncStageLightShaftDrift(camera: { x: number; y: number }, now: number) {
    // 左右の移動(camera.x)に連動して森のように横へ流す。period 単位で折り返して継ぎ目なし。
    let px = 0;
    if (this.shaftPeriod > 0) {
      px = (-camera.x * SHAFT_PARALLAX_X) % this.shaftPeriod;
      if (px > 0) px -= this.shaftPeriod; // [-period, 0] に正規化
    }
    this.stageLightShaftGfx.position.set(px, 0);
    this.stageLightShaftGfx.alpha =
      1 + Math.sin(now / STAGE_LIGHT_SHAFT_PULSE_MS * Math.PI * 2) * STAGE_LIGHT_SHAFT_PULSE_AMOUNT;
  }

  private farBackdropHeight() {
    return Math.min(this.screenH * FAR_BACKDROP_HEIGHT_CAP, Math.max(FAR_BACKDROP_MIN_HEIGHT, this.screenH * FAR_BACKDROP_HEIGHT_RATIO));
  }

  private horizonForestHeight() {
    return Math.min(
      HORIZON_FOREST_MAX_HEIGHT,
      Math.max(HORIZON_FOREST_MIN_HEIGHT, this.screenH * HORIZON_FOREST_HEIGHT_RATIO)
    );
  }

  private frontForestHeight() {
    const base = Math.min(
      FRONT_FOREST_MAX_HEIGHT,
      Math.max(FRONT_FOREST_MIN_HEIGHT, this.screenH * FRONT_FOREST_HEIGHT_RATIO)
    );
    return this.snowStage ? base * (2 / 3) : base;
  }

  private horizonActorAlpha(footWorldY: number) {
    return Math.max(0, Math.min(1, (footWorldY - this.horizonForestFootWorldY) / HORIZON_ACTOR_FADE_PX));
  }

  // 障害物(木/壁/建物/プロップ)の alpha をフレーム更新。プレイヤーを「覆う」(手前=footY大で、見た目矩形が
  // プレイヤー足元矩形と重なる)ものだけ OBSTACLE_SEE_THROUGH_ALPHA へ滑らかに透かす。それ以外は通常(地平フェード)へ。
  // 既存スプライトの alpha を lerp するだけ=新規描画/フィルタなし(負荷 1/10)。
  private applyObstacleAlpha(sprite: Sprite, footWorldY: number) {
    const base = this.horizonActorAlpha(footWorldY);
    let target = base;
    if (OBSTACLE_SEE_THROUGH_ALPHA < 1 && footWorldY > this.seeThroughPlayer.footY && sprite.visible && sprite.texture && sprite.texture.width > 1) {
      const vw = Math.abs(sprite.scale.x) * sprite.texture.width;
      const vh = Math.abs(sprite.scale.y) * sprite.texture.height;
      const p = this.seeThroughPlayer;
      // 障害物の見た目矩形(foot-anchor 0.5,1) vs プレイヤー足元矩形 の AABB 重なり。
      if (sprite.x + vw / 2 > p.cx - p.halfW && sprite.x - vw / 2 < p.cx + p.halfW
          && sprite.y > p.top && sprite.y - vh < p.footY) {
        target = base * OBSTACLE_SEE_THROUGH_ALPHA;
      }
    }
    sprite.alpha += (target - sprite.alpha) * this.seeThroughLerp;
  }

  private horizonRevealZeroScreenY() {
    return this.L.horizonForest.y + this.L.horizonForest.height - HORIZON_REVEAL_OFFSET_PX;
  }

  private horizonActorHideScreenY() {
    return this.L.horizonForest.y + this.L.horizonForest.height - HORIZON_ACTOR_HIDE_OFFSET_PX;
  }

  private updateHorizonForestFadeMask(w: number, horizonH: number) {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = Math.max(1, Math.ceil(horizonH));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const fadeStart = Math.max(0, canvas.height - HORIZON_FOREST_BOTTOM_FADE_PX);
    const grad = ctx.createLinearGradient(0, fadeStart, 0, canvas.height);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.fillRect(0, 0, canvas.width, fadeStart);
    ctx.fillStyle = grad;
    ctx.fillRect(0, fadeStart, canvas.width, canvas.height - fadeStart);

    const texture = Texture.from(canvas);
    this.horizonForestFadeMask.texture = texture;
    this.horizonForestFadeMask.position.copyFrom(this.L.horizonForest.position);
    this.horizonForestFadeMask.width = w;
    this.horizonForestFadeMask.height = horizonH;
    this.horizonForestFadeMaskTexture?.destroy(true);
    this.horizonForestFadeMaskTexture = texture;
  }

  private updateWorldFadeMask(w: number, h: number) {
    const zeroY = this.horizonRevealZeroScreenY();
    const fullY = zeroY + HORIZON_REVEAL_FADE_PX;

    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = Math.max(1, Math.ceil(h));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const grad = ctx.createLinearGradient(0, zeroY, 0, fullY);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = grad;
    ctx.fillRect(0, zeroY, canvas.width, Math.max(1, fullY - zeroY));
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.fillRect(0, fullY, canvas.width, canvas.height - fullY);

    const texture = Texture.from(canvas);
    this.worldFadeMask.texture = texture;
    this.worldFadeMask.position.set(0, 0);
    this.worldFadeMask.width = w;
    this.worldFadeMask.height = h;
    this.worldFadeMaskTexture?.destroy(true);
    this.worldFadeMaskTexture = texture;
  }

  private updateFrontForestFadeMask(w: number, frontH: number) {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = Math.max(1, Math.ceil(frontH));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, `rgba(255,255,255,${FRONT_FOREST_FADE_TOP_ALPHA})`);
    grad.addColorStop(Math.min(1, FRONT_FOREST_FADE_IN_RATIO), `rgba(255,255,255,${FRONT_FOREST_FADE_MID_ALPHA})`);
    grad.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = Texture.from(canvas);
    this.frontForestFadeMask.texture = texture;
    this.frontForestFadeMask.width = w;
    this.frontForestFadeMask.height = frontH;
    this.frontForestFadeMaskTexture?.destroy(true);
    this.frontForestFadeMaskTexture = texture;
  }

  // Build a fresh actor view and parent it into the actor layer.
  private makeActor(): ActorView {
    const container = new Container();
    const light = new Sprite(getGlowTexture());
    light.anchor.set(0.5);
    light.blendMode = 'add';
    light.visible = false;
    this.L.groundLayer.addChild(light);
    const reticle = new Graphics();
    const sprite = new Sprite();
    sprite.anchor.set(0.5, 1); // foot-centre
    const overlay = new Graphics();
    container.addChild(reticle, sprite, overlay);
    this.L.actorLayer.addChild(container);
    return { container, light, reticle, sprite, overlay };
  }

  private makeProp(): PropView {
    const container = new Container();
    const light = new Sprite(getGlowTexture());
    light.anchor.set(0.5);
    light.blendMode = 'add';
    const reflection = new Sprite(getGlowTexture());
    reflection.anchor.set(0.5);
    reflection.blendMode = 'add';
    this.L.groundLayer.addChild(reflection, light);

    const sprite = new Sprite();
    sprite.anchor.set(0.5, 1);
    const flame = new Graphics();
    flame.blendMode = 'add';
    const overlay = new Graphics();
    container.addChild(sprite, flame, overlay);
    this.L.actorLayer.addChild(container);
    return { container, light, reflection, sprite, flame, overlay };
  }

  // ---- top-level frame sync ------------------------------------------------

  // Visual-only depth scale for an object given its foot world-Y. >1 in front
  // of the player, <1 behind. Never affects gameplay (hitboxes/ranges).
  private depthScaleWith(footWorldY: number, k: number, min: number, max: number): number {
    if (!DEPTH_SCALE_ENABLED) return 1;
    if (DEPTH_POS_MAP) return this.depthScaleMapped(footWorldY, min, max);
    const relative = 1 + (footWorldY - this.depthRefY) * k;
    // 物/敵専用の遠近カーブで地面相対比を取る(床の gcurve/gfar とは独立=地面の見た目は不変)。
    const groundRatio = this.groundRelativeScale(footWorldY, OBJECT_PERSP_FAR, GROUND_TILE_SCALE_Y_NEAR, OBJECT_PERSP_CURVE);
    const groundBlend = Math.exp(Math.log(groundRatio) * OBJECT_GROUND_RELATIVE_WEIGHT);
    const f = relative * groundBlend;
    return f < min ? min : f > max ? max : f;
  }

  // 位置ベース(?depthmap=1): 足元の画面位置で min..max を割り当てる。
  //  プレイヤー面=等倍 / 画面上端=min / 画面下端=max(=画面内でレンジを使い切る=従来と同等のズーム量)。
  //  端を越えても(背の高い物の頭が見える間)は min/max を越えて伸び続け、平坦になるのは
  //  画面外 ±DEPTH_EDGE_MARGIN を超えた所だけ。歪み(無制限)は最終クランプで防止。
  private depthScaleMapped(footWorldY: number, min: number, max: number): number {
    const refScreenY = this.depthRefY - this.cameraY;       // プレイヤー足元の画面Y(≈中央)
    const M = DEPTH_EDGE_MARGIN;
    // 足元の画面Y。画面外±Mで頭打ち(=ここで初めて拡縮が止まる=可視範囲では止まらない)。
    const footScreenY = Math.max(-M, Math.min(this.screenH + M, footWorldY - this.cameraY));
    let s: number;
    if (footScreenY <= refScreenY) {
      // 上側: ref→1.0, 画面上端(0)で t=1=min。さらに上(−M)では t>1 で min を下回り続ける。
      const t = (refScreenY - footScreenY) / Math.max(1, refScreenY);
      s = 1 + (min - 1) * Math.pow(t, DEPTH_MAP_CURVE);
    } else {
      // 下側: ref→1.0, 画面下端(screenH)で t=1=max。さらに下(+M)では t>1 で max を上回り続ける。
      const t = (footScreenY - refScreenY) / Math.max(1, this.screenH - refScreenY);
      s = 1 + (max - 1) * Math.pow(t, DEPTH_MAP_CURVE);
    }
    // 暴走防止の絶対セーフティ(通常は効かない。カメラ先行/登場等の異常時のみ)。
    return s < 0.2 ? 0.2 : s > 3.5 ? 3.5 : s;
  }


  private groundScaleAt(
    footWorldY: number,
    far: number = GROUND_TILE_SCALE_Y_FAR,
    near: number = GROUND_TILE_SCALE_Y_NEAR,
    curve: number = GROUND_PERSPECTIVE_CURVE,
  ): number {
    const farH = this.farBackdropHeight();
    // 物/敵専用(この関数は物/敵スケールだけが使用=床描画は別経路)。OBJECT_PERSP_PAD で遠近の帯を画面外へ
    // 延長し、画面端で t が 0/1 に飽和する(=拡縮が止まって見える)のを防ぐ。pad=0 で従来どおり。
    const top = farH - OBJECT_PERSP_PAD;
    const groundH = Math.max(1, (this.screenH + OBJECT_PERSP_PAD) - top);
    const screenY = footWorldY - this.cameraY;
    const t = Math.max(0, Math.min(1, (screenY - top) / groundH));
    const perspective = Math.pow(t, curve);
    return far + (near - far) * perspective;
  }

  private groundRelativeScale(
    footWorldY: number,
    far: number = GROUND_TILE_SCALE_Y_FAR,
    near: number = GROUND_TILE_SCALE_Y_NEAR,
    curve: number = GROUND_PERSPECTIVE_CURVE,
  ): number {
    const base = Math.max(0.001, this.groundScaleAt(this.depthRefY, far, near, curve));
    const ratio = this.groundScaleAt(footWorldY, far, near, curve) / base;
    return Math.max(OBJECT_GROUND_RELATIVE_MIN, Math.min(OBJECT_GROUND_RELATIVE_MAX, ratio));
  }

  // A2(?labpersp): 遠近床のカーブと整合する world→表示位置の写像。footY を「収束する床の上」に乗せる
  // 表示用 worldY と uniform スケールを返す(描画のみ。判定/移動は不変)。床の screen ステップ=worldステップ×相対
  // スケール を積分して算出(焦点面=プレイヤー足元 depthRefY)。lab 専用カーブ(LAB_PERSP_FAR/CURVE)を使用。
  private labProjectFootY(footWorldY: number): { worldY: number; scale: number } {
    const far = LAB_PERSP_FAR, near = GROUND_TILE_SCALE_Y_NEAR, curve = LAB_PERSP_CURVE;
    const ref = this.depthRefY;
    const span = footWorldY - ref;
    const n = 4;
    let integ = 0;
    for (let i = 0; i < n; i++) {
      const y = ref + span * ((i + 0.5) / n);
      integ += this.groundRelativeScale(y, far, near, curve);
    }
    integ *= span / n; // ∫ 相対スケール dy(=床に沿った表示距離)
    return { worldY: ref + integ, scale: this.groundRelativeScale(footWorldY, far, near, curve) };
  }

  private depthScale(footWorldY: number): number {
    return this.depthScaleWith(footWorldY, DEPTH_K, DEPTH_MIN, DEPTH_MAX);
  }

  // Enemies use a stronger falloff for a more dramatic near/far size gap.
  private depthScaleEnemy(footWorldY: number): number {
    return this.depthScaleWith(footWorldY, ENEMY_DEPTH_K, ENEMY_DEPTH_MIN, ENEMY_DEPTH_MAX);
  }

  private isPointNearViewport(
    x: number,
    y: number,
    camera: { x: number; y: number },
    margin = EFFECT_VIEWPORT_MARGIN
  ) {
    return x >= camera.x - margin &&
      x <= camera.x + this.screenW + margin &&
      y >= camera.y - margin &&
      y <= camera.y + this.screenH + margin;
  }

  private distanceOutsideViewport(x: number, y: number, margin = 0) {
    const left = -this.L.world.position.x - margin;
    const top = -this.L.world.position.y - margin;
    const right = left + this.screenW + margin * 2;
    const bottom = top + this.screenH + margin * 2;
    const dx = x < left ? left - x : x > right ? x - right : 0;
    const dy = y < top ? top - y : y > bottom ? y - bottom : 0;
    return Math.hypot(dx, dy);
  }

  private effectNearViewport(e: VisualEffect, camera: { x: number; y: number }) {
    switch (e.kind) {
      case 'flash':
        return true;
      case 'particle':
        return this.isPointNearViewport(e.x, e.y, camera, EFFECT_VIEWPORT_MARGIN + e.size * 4);
      case 'damageNumber':
        return this.isPointNearViewport(e.x, e.y, camera, EFFECT_VIEWPORT_MARGIN);
      case 'image':
        return this.isPointNearViewport(e.x, e.y, camera, EFFECT_VIEWPORT_MARGIN + 200);
      case 'ring':
        return this.isPointNearViewport(e.x, e.y, camera, EFFECT_VIEWPORT_MARGIN + e.endRadius);
      case 'glow':
        return this.isPointNearViewport(e.x, e.y, camera, EFFECT_VIEWPORT_MARGIN + e.radius);
      case 'slash':
        return this.isPointNearViewport(e.x, e.y, camera, EFFECT_VIEWPORT_MARGIN + e.length);
      case 'trail':
        return this.isPointNearViewport(e.fromX, e.fromY, camera) ||
          this.isPointNearViewport(e.toX, e.toY, camera);
      case 'whip':
        return this.isPointNearViewport(e.fromX, e.fromY, camera) ||
          this.isPointNearViewport(e.toX, e.toY, camera);
      case 'dogFetch':
        return this.isPointNearViewport(e.fromX, e.fromY, camera) ||
          this.isPointNearViewport(e.targetX, e.targetY, camera) ||
          this.isPointNearViewport(e.toX, e.toY, camera);
    }
  }

  private hideEffectView(id: string) {
    const view = this.effects.get(id);
    if (view) view.visible = false;
  }

  private snapToScreenPixel(worldValue: number, worldOffset: number): number {
    return Math.round(worldValue + worldOffset) - worldOffset;
  }

  // 焼き込み遠近プレート(一枚絵)を screen-space 背景として全画面に敷く(farBackdrop と同様の固定＋ごく弱いパララックス)。
  // 消失点=上中央で固定。?labpersp Step1' の評価用。一枚絵なのでカメラでスクロールしない/壁とは整合しない(割り切り)。
  private updateLabFloorPlate(show: boolean) {
    if (!show) { if (this.labFloorPlate) this.labFloorPlate.visible = false; return; }
    const tex = getTexture('lab-floor/lab-floor-persp-plate');
    if (!tex) { if (this.labFloorPlate) this.labFloorPlate.visible = false; return; }
    if (!this.labFloorPlate) {
      const sp = new Sprite(tex);
      sp.anchor.set(0.5, 0.5);
      this.L.worldGroup.addChildAt(sp, this.L.worldGroup.getChildIndex(this.L.groundBase) + 1); // groundBase 直上・world の下
      this.labFloorPlate = sp;
    }
    const sp = this.labFloorPlate;
    sp.visible = true;
    sp.tint = LAB_ENV_TINT;
    const over = 1.10; // 少し大きめに敷き、弱パララックスでも端が出ないようにする
    sp.width = this.screenW * over;
    sp.height = this.screenH * over;
    const cam = useGameStore.getState().camera;
    const mx = (this.screenW * (over - 1)) / 2, my = (this.screenH * (over - 1)) / 2;
    const px = Math.max(-mx, Math.min(mx, -cam.x * 0.02)); // ごく弱いパララックス(端のオーバスキャン内にクランプ)
    const py = Math.max(-my, Math.min(my, -cam.y * 0.02));
    sp.position.set(this.screenW / 2 + px, this.screenH / 2 + py);
  }

  // ?labpersp で研究所床に差し替えた地面ストリップを、屋外/非persp 時に元(屋外地面・ENV_TINT)へ戻す。
  private restoreGroundStrips() {
    if (!this.groundStripBaseTex) return; // 一度も差し替えていなければ何もしない
    for (const strip of this.L.groundStrips) {
      if (strip.texture !== this.groundStripBaseTex) strip.texture = this.groundStripBaseTex;
      strip.tint = this.envTintNow();
    }
  }

  // 屋外サバイバル構造のまま、見た目テーマで地面＋背景3層(遠景/地平帯/手前帯)のテクスチャを差し替える。
  // 'lab'=研究所スキン、'forest'=従来の森。レイヤー構造(パララックス/ブラー/フェード/マスク)は不変=
  // TilingSprite の .texture を貼り替えるだけ。tint は地面=LAB_ENV_TINT、背景3層は据え置き(ENV_TINT)。
  // テーマが変わった時だけ貼り替える(毎フレームの再代入を避ける)。
  private outdoorGroundTheme: StageTheme | null = null;
  private farBackdropBaseTex: Texture | null = null;
  private horizonForestBaseTex: Texture | null = null;
  private frontForestBaseTex: Texture | null = null;
  // ラボ床テクスチャ(PixiStage が森の地面と同じ Assets.load で読み込み、ここへ注入)。
  // マニフェスト(getTexture)が万一読めなくても、こちらを最優先で使う=確実に張り替わる。
  private labGroundTex: Texture | null = null;
  // ステージ別の遠景差し替えテクスチャ(PixiStage が backgrounds/ から読み込み注入)。キー='city' 等。
  private farBackdropOverrides: Record<string, Texture | null> = {};
  // いま遠景に張っている種別。'forest'(既定)/'lab'/差し替えキー。差分があるときだけ張り替える。
  private currentFarKey = 'forest';
  setFarBackdropTexture(key: string, t: Texture | null) {
    if (!t) return;
    this.farBackdropOverrides[key] = t;
    this.currentFarKey = ''; // 注入後に applyFarBackdrop を再評価させる(遅延注入対応)
  }
  // ステージ3(昼/city)用の床・地平帯の差し替えテクスチャ(PixiStage が注入)。
  private stage3GroundTex: Texture | null = null;
  private stage3HorizonTex: Texture | null = null;
  // 近景森(frontForest)のステージ3差し替え=屋根帯。lab は applyOutdoorGroundTheme 管理なので触らない。
  // 重要: マスクは作り直さない(テクスチャ+tileScaleのみ)。前回 updateFrontForestFadeMask の
  // destroy(true) を同期中に呼んで描画破綻したため(v726不具合)。
  private frontOverrides: Record<string, Texture> = {}; // farBackdropキー別の近景差し替え(city=屋根帯/snow=氷壁 等)
  private frontBaseTex: Texture | null = null;
  private currentFrontKey = '';
  setStage3Front(t: Texture | null) {
    if (!t) return;
    this.frontOverrides['city'] = t; // ステージ3=廃都の近景(屋根帯)
    this.currentFrontKey = ''; // 注入後に再適用
  }
  // 近景森(frontForest)の farBackdropキー別差し替え。city=屋根帯(stage3)/snow=氷壁(stage4)等。
  setFrontOverride(key: string, t: Texture | null) {
    if (!t) return;
    this.frontOverrides[key] = t;
    this.currentFrontKey = '';
  }
  // farKey(=s.farBackdrop)に応じて近景森を差し替え。override があればそれ(不透明・フェードOFF)、無ければ森(半透明)。
  private applyStage3Front(farKey: string) {
    if (this.isLabStage) return; // lab は lab-front-band 管理
    if (!this.frontBaseTex) this.frontBaseTex = this.L.frontForest.texture; // 森の近景baseを捕捉
    const override = farKey ? this.frontOverrides[farKey] : null;
    const desired = override ? farKey : 'forest';
    if (this.currentFrontKey === desired) return;
    const tex = override ?? this.frontBaseTex;
    if (!tex) return;
    this.L.frontForest.texture = tex;
    // tileScale だけ更新(maskは不変=安全)。
    const frontH = this.frontForestHeight();
    this.L.frontForest.tileScale.set(frontH / Math.max(1, tex.height));
    // 差し替え近景(屋根帯/氷壁)は半透明にしない(不透明・フェードOFF)。森に戻すと半透明+フェード復帰。
    if (override) {
      this.L.frontForest.alpha = 1;
      this.L.frontForest.mask = null;
    } else {
      this.L.frontForest.alpha = this.isLabStage ? LAB_FRONT_FOREST_ALPHA : FRONT_FOREST_ALPHA;
      this.L.frontForest.mask = this.frontForestFadeMask;
    }
    this.currentFrontKey = desired;
  }
  // 遠景森2(nearHorizon)のステージ別テクスチャ。キー='forest'(森シルエット)/'city'(廃墟都市)等。
  private nearHorizonOverrides: Record<string, Texture | null> = {};
  setNearHorizonTexture(key: string, t: Texture | null) {
    if (!t) return;
    this.nearHorizonOverrides[key] = t;
  }
  // 遠景森2をキー(s.nearHorizon)で出し分け。差分時にテクスチャ差し替え+再レイアウト、tint は昼夜連動。
  private applyNearHorizon(key: string) {
    const tex = key ? this.nearHorizonOverrides[key] : null;
    if (!tex) { this.L.nearHorizon.visible = false; return; }
    if (this.L.nearHorizon.texture !== tex) this.L.nearHorizon.texture = tex;
    // 毎フレーム現在の画面/テクスチャ寸法でレイアウト(テクスチャ未準備なら内部で早期return)。
    // ※以前は「キー変更時に1回だけ」だったため、テクスチャ非同期到着前に空振りすると 1×1 のまま
    //   不可視になり、resize(回転)まで直らなかった(初期表示で遠景森2が出ない/一時停止で中途半端になる)バグ。
    this.layoutNearHorizon();
    this.L.nearHorizon.visible = true;
    // lab の機材帯は暗い素材なので、夜の暗化(ENV_TINT)に飲まれて見えなくなる。
    // ステージ2の前帯と同様に暗化から除外し、本来色(白tint)で出して視認性を確保する。
    // lab は暗幕(地平下)で暗くされないので、白tint(全明)だと眩し過ぎ→グレー乗算で元素材寄りに落とす(?nhbright)。
    this.L.nearHorizon.tint = key === 'lab' ? LAB_NEAR_HORIZON_TINT : this.envTintNow();
  }
  // 遠景手前森(nearHorizon)の寸法/位置を現在のテクスチャと画面から再計算。底を地面シーム少し下に置く。
  private layoutNearHorizon() {
    const tex = this.L.nearHorizon.texture;
    if (!tex || tex.width <= 1 || tex.height <= 1) return;
    const farH = this.farBackdropHeight();
    // 遠景森2の高さ(サイズ)はステージ2だけ低め(社長指示)。他ステージは原典の0.42。
    const heightRatio = this.isLabStage ? LAB_NEAR_HORIZON_HEIGHT_RATIO : NEAR_HORIZON_HEIGHT_RATIO;
    const height = this.screenH * heightRatio;
    const bottom = farH + this.screenH * NEAR_HORIZON_BOTTOM_RATIO;
    this.L.nearHorizon.width = this.screenW;
    this.L.nearHorizon.height = height;
    // 横伸び防止: y 基準の均一スケール(横は自然比率でタイル繰り返し)。nearHorizon も parallax で横スクロールするので継ぎ目なし。
    this.L.nearHorizon.tileScale.set(height / tex.height);
    this.L.nearHorizon.position.set(0, bottom - height);
  }
  setStage3Ground(t: Texture | null) {
    if (!t) return;
    try { const st = t.source.style as { addressMode?: string; update?: () => void }; st.addressMode = 'repeat'; st.update?.(); } catch { /* ignore */ }
    this.stage3GroundTex = t;
    this.daylightApplied = null; // 注入後に再適用
  }
  setStage3Horizon(t: Texture | null) {
    if (!t) return;
    this.stage3HorizonTex = t;
    this.daylightApplied = null;
  }
  // farBackdropキー別の地面差し替え(snow=雪原 等)。stage3(city)の床は applyDaylight が石畳に差し替えるので
  // ここでは扱わない(二重管理回避)。lab も applyOutdoorGroundTheme 管理なので対象外。
  private groundOverrides: Record<string, Texture> = {};
  private currentGroundKey = '';
  setGroundOverride(key: string, t: Texture | null) {
    if (!t) return;
    try { const st = t.source.style as { addressMode?: string; update?: () => void }; st.addressMode = 'repeat'; st.update?.(); } catch { /* ignore */ }
    this.groundOverrides[key] = t;
    this.currentGroundKey = ''; // 注入後に再適用
  }
  private applyGroundOverride(farKey: string) {
    if (this.isLabStage || farKey === 'city') return; // lab / stage3(city=石畳) は別管理
    const override = farKey ? this.groundOverrides[farKey] : null;
    const desired = override ? farKey : 'forest';
    if (this.currentGroundKey === desired) return;
    if (!this.groundStripBaseTex) this.groundStripBaseTex = this.L.groundStrips[0]?.texture ?? null; // 森の地面を退避
    const tex = override ?? this.groundStripBaseTex;
    if (!tex) return;
    for (const strip of this.L.groundStrips) if (strip.texture !== tex) strip.texture = tex;
    this.currentGroundKey = desired;
  }
  // farBackdropキー別の地平帯(遠景森1=horizonForest)差し替え。snow=氷壁帯 等。city/labは別管理。
  private horizonOverrides: Record<string, Texture> = {};
  private currentHorizonKey = '';
  setHorizonOverride(key: string, t: Texture | null) {
    if (!t) return;
    this.horizonOverrides[key] = t;
    this.currentHorizonKey = ''; // 注入後に再適用
  }
  private applyHorizonOverride(farKey: string) {
    if (this.isLabStage || farKey === 'city') return; // lab / stage3(city) は別管理
    const override = farKey ? this.horizonOverrides[farKey] : null;
    const desired = override ? farKey : 'forest';
    if (this.currentHorizonKey === desired) return;
    if (!this.horizonForestBaseTex) this.horizonForestBaseTex = this.L.horizonForest.texture; // 森の地平帯を退避
    const tex = override ?? this.horizonForestBaseTex;
    if (!tex) return;
    this.L.horizonForest.texture = tex;
    this.layoutHorizonForest(); // テクスチャ寸法が違うので再レイアウト
    this.currentHorizonKey = desired;
  }
  // 地平帯(horizonForest)の寸法/タイルスケールを現在のテクスチャと画面幅で再計算(差し替え時に必要)。
  private layoutHorizonForest() {
    const tex = this.L.horizonForest.texture;
    if (!tex || tex.width <= 0 || tex.height <= 0) return;
    const horizonH = this.horizonForestHeight();
    this.L.horizonForest.width = this.screenW;
    this.L.horizonForest.height = horizonH;
    // 横伸び防止: y 基準の均一スケール(横は自然比率でタイル)。resize と同方式。
    this.L.horizonForest.tileScale.set(horizonH / tex.height);
  }
  setLabGroundTexture(t: Texture | null) {
    this.labGroundTex = t;
    if (t) {
      try {
        const st = t.source.style as { addressMode?: string; update?: () => void };
        st.addressMode = 'repeat'; st.update?.();
      } catch { /* ignore */ }
      try { t.source.scaleMode = 'nearest'; } catch { /* ignore */ }
      this.outdoorGroundTheme = null; // 注入後に再適用させる
    }
  }
  // 遠景パノラマの張り替え。theme と farKey('city'等)から張るテクスチャを決め、差分時のみ代入。
  // 森の地形/地平/前景はそのままで「距離パノラマだけ」を差し替えられる(ステージ3の遠景差し替え)。
  private applyFarBackdrop(theme: StageTheme, farKey: string) {
    const override = farKey ? this.farBackdropOverrides[farKey] : null;
    const desired: string = theme === 'lab' ? 'lab' : (override ? farKey : 'forest');
    if (this.currentFarKey === desired) return;
    // 初回の森遠景(distant-night-panorama)を復元用に退避。
    if (!this.farBackdropBaseTex) this.farBackdropBaseTex = this.L.farBackdrop.texture;
    let tex: Texture | null = null;
    if (desired === 'lab') tex = this.farBackdropOverrides['lab'] ?? getTexture('lab/lab-far-backdrop') ?? null;
    else if (desired === 'forest') tex = this.farBackdropBaseTex;
    else tex = this.farBackdropOverrides[desired] ?? this.farBackdropBaseTex;
    if (tex) {
      this.L.farBackdrop.texture = tex;
      this.currentFarKey = desired;
      // 昼の廃都(city=正午ステージ)は夜用の暗転tintを外して本来の明るさで出す。
      // それ以外(森/ラボ)は従来どおり環境の暗転tintを掛ける。
      this.L.farBackdrop.tint = desired === 'city' ? 0xffffff : ENV_TINT;
      // tileScale は resize() でしか計算されないため、差し替えテクスチャの寸法が違うと
      // 旧テクスチャ基準のスケールのまま=見た目が変わらない/崩れる。ここで再レイアウトする。
      this.layoutFarBackdrop();
    }
  }
  // 遠景TilingSpriteの寸法/タイルスケールを現在のテクスチャと画面サイズで再計算。
  private layoutFarBackdrop() {
    const tex = this.L.farBackdrop.texture;
    if (!tex || tex.width <= 0 || tex.height <= 0) return;
    const farH = this.farBackdropHeight();
    const farScale = Math.max(this.screenW / tex.width, farH / tex.height);
    this.L.farBackdrop.width = this.screenW;
    this.L.farBackdrop.height = farH;
    this.L.farBackdrop.tileScale.set(farScale);
  }
  private applyOutdoorGroundTheme(theme: StageTheme, farKey = '') {
    const strips = this.L.groundStrips;
    this.applyFarBackdrop(theme, farKey);
    if (theme === 'lab') {
      const tex = this.labGroundTex ?? getTexture('lab-floor/lab-floor-stage2') ?? getTexture('lab-floor/lab-floor-ground') ?? getTexture('lab-floor/lab-floor-clean');
      if (!tex) return; // まだロードされていなければ次フレームで再試行(テーマは未確定のまま)
      // NPOT でもタイル反復できるよう wrap=repeat を明示(屋内ラボ床と同じ扱い)。
      try {
        const st = tex.source.style as { addressMode?: string; update?: () => void };
        if (st.addressMode !== 'repeat') { st.addressMode = 'repeat'; st.update?.(); }
      } catch { /* ignore */ }
      if (!this.groundStripBaseTex) this.groundStripBaseTex = strips[0]?.texture ?? null; // 屋外地面を復元用に退避
      // 毎フレーム再適用(何かがテクスチャを戻しても確実に張り替わる)。差分があるときだけ代入。
      // 色味調整(LAB_ENV_TINT)は外し、テクスチャ本来の色で表示(tint 白=無補正)。
      for (const strip of strips) { if (strip.texture !== tex) strip.texture = tex; strip.tint = 0xffffff; }
      // 手前の近景(lab-front-band)はステージ2の暗化(ENV_TINT)対象から除外=本来の明るさで表示(社長指示)。
      this.L.frontForest.tint = 0xffffff;
      if (this.outdoorGroundTheme !== 'lab') {
        // 背景2層(地平帯/手前帯)を研究所版へ(森→ラボ)。遠景は applyFarBackdrop が管理。
        // 元テクスチャは復元用に一度だけ退避。テーマ変化時のみ。
        const horizon = getTexture('lab/lab-horizon-band');
        if (horizon) { if (!this.horizonForestBaseTex) this.horizonForestBaseTex = this.L.horizonForest.texture; this.L.horizonForest.texture = horizon; }
        const front = getTexture('lab/lab-front-band');
        if (front) { if (!this.frontForestBaseTex) this.frontForestBaseTex = this.L.frontForest.texture; this.L.frontForest.texture = front; }
        this.outdoorGroundTheme = 'lab';
      }
    } else if (this.outdoorGroundTheme !== 'forest') {
      this.restoreGroundStrips();
      if (this.horizonForestBaseTex) this.L.horizonForest.texture = this.horizonForestBaseTex;
      if (this.frontForestBaseTex) this.L.frontForest.texture = this.frontForestBaseTex;
      this.outdoorGroundTheme = 'forest';
    }
  }

  private updatePerspectiveGround(
    cameraX: number, cameraY: number, shakeX: number, shakeY: number,
    farScale: number = GROUND_TILE_SCALE_Y_FAR,
    nearScale: number = GROUND_TILE_SCALE_Y_NEAR,
    curve: number = GROUND_PERSPECTIVE_CURVE,
  ) {
    const farH = this.farBackdropHeight();
    const groundH = Math.max(1, this.screenH - farH);
    const strips = this.L.groundStrips;
    const stripH = groundH / strips.length;
    let sourceY = cameraY * GROUND_SCROLL_Y_FEEL + farH;
    this.L.groundBase.position.set(shakeX, farH + shakeY);

    for (let i = 0; i < strips.length; i++) {
      const strip = strips[i];
      const y = i * stripH;
      const t = strips.length <= 1 ? 1 : i / (strips.length - 1);
      const perspective = Math.pow(t, curve);
      const scaleY = farScale + (nearScale - farScale) * perspective;

      strip.position.set(0, y);
      strip.width = this.screenW;
      strip.height = Math.ceil(stripH) + 2;
      strip.tileScale.set(GROUND_TILE_SCALE_X, scaleY);
      strip.tilePosition.set(-cameraX * GROUND_TILE_SCALE_X * GROUND_SCROLL_X_FEEL, -sourceY * scaleY);
      sourceY += stripH / Math.max(0.001, scaleY);
    }
  }

  sync() {
    const s = useGameStore.getState();
    const realNow = Date.now();
    // オプションのブルームON/OFFをリロード無しで反映(変化時だけフィルタ配列を作り直す)。
    const wantBloom = getBloomEnabled();
    if (wantBloom !== this.bloomActive) { this.bloomActive = wantBloom; this.rebuildWorldFilters(); }
    // 昼ステージ(正午)モード: 遠景キー 'city' の間は環境を昼へ。木tintより前に確定させる。
    this.daylight = s.farBackdrop === 'city';
    this.snowStage = s.farBackdrop === 'snow';
    this.isLabStage = s.stageTheme === 'lab';
    // vignetteの明るい部分を狭めるのはステージ2だけ(他ステージは既定0.55の通常版)。差分時のみ差し替え。
    if (this.vignetteNarrow !== this.isLabStage) {
      this.vignetteNarrow = this.isLabStage;
      this.vignette.texture = this.isLabStage ? getVignetteTextureNarrow() : getVignetteTexture();
    }
    this.applyNearHorizon(s.nearHorizon); // 遠景森2(ステージ別)
    this.applyDaylight(this.daylight);
    // ヒットストップ中はアニメ時計(now)も停止させる。これで Date.now 基準で動くもの
    // (歩きアニメ・スモッグの流れ・グロー明滅・各種sin揺らぎ等)も止まり、画面ほぼ全停止の
    // 「ストップ感」が出る。シミュレーション自体は useGameLoop 側の早期returnで既に凍結済み。
    if (realNow < s.hitstopUntil) {
      if (this.hitstopFreezeNow === 0) this.hitstopFreezeNow = realNow;
    } else {
      this.hitstopFreezeNow = 0;
    }
    const now = this.hitstopFreezeNow || realNow;
    this.cameraY = s.camera.y;
    // 登場演出の状態を反映(drawPlayer の飛び込みオフセット / 影スキップ / ヘリに使う)。
    this.introUntil = s.introUntil;
    this.introActive = s.introUntil === -1 || (s.introUntil > 0 && now < s.introUntil);
    this.syncIntroHelicopter(s.player, now);

    // Focal plane for the pseudo-perspective scale = the player's feet.
    const pfb = playerFootBox(s.player);
    this.depthRefY = pfb.footY;
    // 「裏に回ったら透ける」判定用のプレイヤー足元矩形(world)。障害物の可視矩形とAABBで重なり判定する。
    this.seeThroughPlayer = { cx: pfb.footX, footY: pfb.footY, halfW: pfb.boxW / 2, top: pfb.footY - pfb.boxH };

    // Camera offset + screen shake on the whole world (and the floor).
    let sx = 0;
    let sy = 0;
    // ストップ(ヒットストップ)中は揺れを描画しない=ストップと揺れを重ねない(社長指示)。
    // インパクトの揺れはストップ後にトリガーされるので、停止が明けてから揺れ始める。
    const shakeLeft = (s.shakeUntil && now >= s.hitstopUntil) ? s.shakeUntil - now : 0;
    if (shakeLeft > 0) {
      // 振幅(shakeMag)×フェード(残り/長さ)。行動別に triggerShake で強さを設定。
      const mag = (s.shakeMag || 7) * SHAKE_GLOBAL_MULT * Math.min(1, shakeLeft / (s.shakeDur || SHAKE_MS));
      sx = (Math.random() * 2 - 1) * mag;
      sy = (Math.random() * 2 - 1) * mag;
    }
    this.L.world.position.set(-s.camera.x + sx, -s.camera.y + sy);
    this.syncLab(); // 屋内ステージの床/壁/扉描画＋屋外レイヤーの表示切替
    // ダンスUI層は world と同じカメラオフセットで追従(ワールド座標のまま、被写体深度の外で描く)。
    this.L.danceUiLayer.position.set(-s.camera.x + sx, -s.camera.y + sy);

    // ズーム(描画のみ): worldGroup を画面中央=プレイヤー基準で拡大。
    //  ・待機ズーム: 手を離して静止している間だけ少し寄る(滑らかに/操作再開で1.0へ)。
    //  ・パンチズーム: 近接フィニッシュで一瞬寄って戻る。両者を掛け合わせる。
    const zdt = this.lastZoomNow ? Math.min(0.1, (now - this.lastZoomNow) / 1000) : 0;
    this.lastZoomNow = now;
    // 透け(裏回り)フェードのlerp係数(時定数=OBSTACLE_SEE_THROUGH_TAU)。木/壁/プロップの alpha 更新で使う。
    this.seeThroughLerp = OBSTACLE_SEE_THROUGH_TAU > 0 ? 1 - Math.exp(-zdt / OBSTACLE_SEE_THROUGH_TAU) : 1;
    // 持続ズーム:
    //  ・登場(ヘリ)中: 高いヘリを収めるため引きから開始 → キャラの降下に同期して既定へ(playerIntroDescent)。
    //  ・移動中: 少し引く(CAMERA_MOVE_ZOOM_MAG=負)。
    //  ・手を離して静止中: 少し寄る(待機ズーム CAMERA_IDLE_ZOOM_MAG=正)。
    if (this.introActive && !s.rhythm.active) {
      const introT = this.introUntil === -1
        ? 0
        : Math.max(0, Math.min(1, 1 - (this.introUntil - now) / PLAYER_INTRO_MS));
      const h = playerIntroDescent(introT);          // 1=開始(最も高い) → 0=着地
      this.idleZoom = 1 + CAMERA_INTRO_ZOOM_MAG * h; // 引きから開始、降下で既定へ(hが滑らかなので直接代入)
    } else {
      let zoomTarget = 1;
      if (!s.rhythm.active) {
        if (s.player.isMoving) zoomTarget = 1 + CAMERA_MOVE_ZOOM_MAG;       // 移動中だけ引き
        else if (!s.touchActive) zoomTarget = 1 + CAMERA_IDLE_ZOOM_MAG;     // 手放し静止で待機ズーム
      }
      // 引き(さらに広がる方向)は慣性でじわっと=長い時定数。戻り(寄り/等倍へ)は従来の戻り時定数。
      const zoomingOut = zoomTarget < this.idleZoom - 0.0001;
      const zoomTau = zoomingOut ? CAMERA_MOVE_ZOOM_TAU : CAMERA_IDLE_ZOOM_TAU;
      this.idleZoom += (zoomTarget - this.idleZoom) * (1 - Math.exp(-zdt / Math.max(0.001, zoomTau)));
    }
    const zoomLeft = s.zoomUntil ? s.zoomUntil - now : 0;
    const punch = (zoomLeft > 0 && s.zoomMag > 0) ? 1 + s.zoomMag * Math.min(1, zoomLeft / MELEE_FINISH_ZOOM_MS) : 1;
    const zoom = this.idleZoom * punch;
    if (Math.abs(zoom - 1) > 0.0005) {
      this.L.worldGroup.scale.set(zoom);
      this.L.worldGroup.position.set((this.screenW / 2) * (1 - zoom), (this.screenH / 2) * (1 - zoom));
      this.zoomApplied = true;
    } else if (this.zoomApplied) {
      this.L.worldGroup.scale.set(1);
      this.L.worldGroup.position.set(0, 0);
      this.zoomApplied = false;
    }
    // スモッグ: 各層1枚を画面に固定し、texture を右へ流す(tilePosition.x↑)+揺らめき。縦は位置の bob で揺らめき。
    // 奥レイヤーは world 内なので camera/shake を打ち消して画面にピン留め(子は素の画面座標で配置)。
    this.bgCloudLayer.position.set(s.camera.x - sx, s.camera.y - sy);
    if (this.fogT0 === 0) this.fogT0 = now;
    const fogT = now - this.fogT0;
    const labThemeFog = s.stageTheme === 'lab'; // 研究所スキンは森の霧を出さない(床を見せる)
    for (const f of this.fogLayers) {
      f.sp.renderable = !labThemeFog; // ラボでは霧を非表示(visible 設定=有効フラグは保持)
      if (!f.sp.visible) continue;
      // 外部PNG(fog.png 等)は非同期ロード。読めたら割当+サイズ/tileScale を確定。
      if (f.texKey && (!f.sp.texture || f.sp.texture.width <= 1)) {
        const ft = getTexture(f.texKey);
        if (!ft) continue;
        f.sp.texture = ft;
        f.sp.width = this.screenW * f.widthFrac;
        f.sp.height = this.screenH * f.heightFrac;
        f.sp.tileScale.set(f.sp.width / ft.width, f.sp.height / ft.height);
      }
      f.sp.x = (this.screenW - f.sp.width) / 2; // 画面中央に固定(横の動きは texture スクロールで)
      f.sp.y = f.yFrac * this.screenH - f.sp.height / 2 + Math.sin(now * f.spdY * FOG_SPEED + f.ph) * f.ampY; // 縦の揺らめき
      f.sp.tilePosition.x = fogT * f.flow * FOG_SPEED + Math.sin(now * f.spdX * FOG_SPEED + f.ph) * f.ampX;    // 右へ流れる+横の揺らめき
      f.sp.tilePosition.y = 0;
    }
    // 研究所スキンは床/素材を見せるため、クール調整を弱める(森はそのまま)。
    this.gradeSprite.alpha = labThemeFog ? GRADE_ALPHA * 0.45 : (this.daylight ? DAY_GRADE_ALPHA : GRADE_ALPHA);

    // 死神の横切り演出(store.reaperCross から駆動)。world内レイヤーを画面へピン留め(被写界深度が乗る)。
    this.reaperCrossLayer.position.set(s.camera.x - sx, s.camera.y - sy);
    const rc = s.reaperCross;
    const rsp = this.reaperCrossSprite;
    if (rc && now - rc.startedAt >= 0 && now - rc.startedAt < rc.durationMs) {
      if (!rsp.texture || rsp.texture.width <= 1) {
        const rtex = getTexture('reaper');
        if (rtex) rsp.texture = rtex;
      }
      const t = (now - rc.startedAt) / rc.durationMs;
      const margin = 200;
      if (rc.axis === 'h') {
        const span = this.screenW + margin * 2;
        rsp.x = rc.dir > 0 ? -margin + span * t : this.screenW + margin - span * t;
        rsp.y = rc.band * this.screenH;
      } else {
        const span = this.screenH + margin * 2;
        rsp.y = rc.dir > 0 ? -margin + span * t : this.screenH + margin - span * t;
        rsp.x = rc.band * this.screenW;
      }
      if (rsp.texture && rsp.texture.height > 0) {
        const sc = ((this.screenH * 0.22) / rsp.texture.height) * rc.scale; // 奥=小さく / 手前=大きく
        const faceLeft = rc.axis === 'h' && rc.dir < 0; // 横断は進行方向へ向ける
        rsp.scale.set(faceLeft ? -sc : sc, sc);
      }
      rsp.visible = true;
    } else {
      rsp.visible = false;
    }

    const farH = this.farBackdropHeight();
    this.L.farBackdrop.position.set(sx * 0.25, 0);
    this.L.farBackdrop.tilePosition.set(
      -s.camera.x * FAR_BACKDROP_PARALLAX_X,
      0
    );
    const horizonH = this.horizonForestHeight();
    this.L.horizonForest.position.set(0, farH - horizonH * HORIZON_FOREST_OVERLAP_RATIO + HORIZON_FOREST_Y_OFFSET_PX + (this.isLabStage ? LAB_HORIZON_FOREST_EXTRA_DOWN : 0));
    this.L.horizonForest.tilePosition.set(
      -s.camera.x * HORIZON_FOREST_PARALLAX_X,
      0
    );
    this.horizonForestFadeMask.position.copyFrom(this.L.horizonForest.position);
    // 遠景手前森(ステージ3): 縦位置は layout 固定、横だけパララックス(地平より速い=近い)。
    if (this.L.nearHorizon.visible) {
      this.L.nearHorizon.tilePosition.set(-s.camera.x * NEAR_HORIZON_PARALLAX_X, 0);
    }
    this.horizonForestFootWorldY = s.camera.y + this.horizonActorHideScreenY();
    // ?labpersp の研究所では床専用の強い遠近カーブを使う(屋外は従来定数)。
    const labPerspNow = s.indoorMode && LAB_PERSP;
    this.updatePerspectiveGround(
      s.camera.x, s.camera.y, sx, sy,
      labPerspNow ? LAB_PERSP_FAR : GROUND_TILE_SCALE_Y_FAR,
      GROUND_TILE_SCALE_Y_NEAR,
      labPerspNow ? LAB_PERSP_CURVE : GROUND_PERSPECTIVE_CURVE,
    );
    const frontH = this.frontForestHeight();
    this.L.frontForest.position.set(sx * 0.75, this.screenH - frontH + (this.snowStage ? FRONT_SNOW_Y_OFFSET : 0));
    this.L.frontForest.tilePosition.set(
      -s.camera.x * FRONT_FOREST_PARALLAX_X,
      0
    );
    this.frontForestFadeMask.position.copyFrom(this.L.frontForest.position);

    this.syncTrees(s.camera);
    this.syncLabWalls(); // 壁オブジェクト(研究所スキン・区画生成。森では no-op)
    this.syncLabProps(); // 遮蔽物プロップ(研究所スキン・区画生成。森/屋内では no-op)
    this.syncCityProps(); // ステージ3(廃都)の散布オブジェクト(その他ステージでは no-op)
    this.updateLabCeiling(s.stageTheme === 'lab' && !s.indoorMode); // 最前面の天井ケーブル帯(lab テーマのみ)
    this.updateLabVisibility(LAB_VISIBILITY_VEIL && s.stageTheme === 'lab' && !s.indoorMode, sx, sy); // 暗闇演出は廃止(社長指示)。?labveil=1 で参照復活
    // 屋内(研究施設)は指定がない限り「最初の部屋に武器商人のみ」。ボス部屋(城)/二人組(クエストNPC)は描画しない。
    if (s.indoorMode || s.stageTheme === 'lab') {
      // 屋内 / 研究所スキンは城(建物)を描かない。※ giantbat ボスは城座標に出る(クリア条件)ので湧き自体は維持。
      this.castleView.visible = false; this.castleShadow = null; this.castleGlow.visible = false;
      this.eventNpcView.visible = false; this.npcShadow = null;
    } else {
      this.syncCastle(s.castleEvent, now);
      this.syncEventQuestNpc(s.eventQuestNpc, s.player, now);
    }
    this.syncMerchant(s.weaponMerchant, s.player, now); // 商人は屋内でも(最初の部屋に)出す
    this.syncBreakableProps(s.breakableProps, now);
    this.syncPickups(s.pickups, now);
    this.syncPumpkinTelegraph(s.enemies, now); // ジャンプ攻撃の着地予告(赤い影)
    this.updateBoomerangReadyMark(s.player, now); // ブーメランCD明けの頭上マーク
    this.updateMarksmanRangeMark(s.player, now);  // マークスマン射程上昇 発動の頭上ターゲットマーク
    this.syncActors(s.player, s.enemies, s.gameTime, now);
    this.syncLockIndicators(s.enemies, s.homingLocks, now);
    this.syncSlasherRing(s.player, s.gameTime);
    this.syncShadows(s.player, s.enemies, s.summons, s.projectiles);
    this.syncStageLightShaftDrift(s.camera, now);
    this.syncProjectiles(s.projectiles, now);
    this.syncShields(s.projectiles, now);
    this.syncArena(s.activeEvent, now);
    this.syncReturnCircle(s.returnCircle, now);
    this.syncBaseSites(s.baseSites, now, s.safeBaseId);
    this.syncBossCorpse(s.bossCorpse, now);
    this.syncLowHpVignette(s.player.health, now);
    // 深層域グレーディング(退色セピア・描画のみ)。逆再生BGMと同じ境界・約1秒フェード。
    this.syncDeepZoneGrade(
      !s.indoorMode && s.stageTheme !== 'lab' && !s.rhythm.active,
      Math.hypot(s.player.x + s.player.width / 2, s.player.y + s.player.height / 2),
      now,
    );
    this.drawRescueSurvivors(s.rescueSurvivors, now);
    this.syncDecoys(s.projectiles, now);
    this.syncTurrets(s.projectiles, now);
    this.syncSummons(s.summons, now);
    this.syncEventBloom(s.effects, now);
    this.syncEffects(s.effects, s.camera, now);
    this.syncGroundReflections(s.pickups, s.projectiles, s.effects, s.camera, now);
    this.syncLocalEventLighting(
      s.effects,
      s.player,
      s.enemies,
      s.breakableProps,
      s.castleEvent,
      s.weaponMerchant,
      s.eventQuestNpc,
      s.camera,
      now
    );
    this.syncPlayerFx(s.player, now);
    // 解放済み(=その方角の拠点が制圧済み)のPOIだけ方角矢印を出す。裏ボスは討伐後は出さない。
    // 出現/解放判定は固定の巣(セクター)で行い、矢印の指す先は「実際に出ている裏ボスの現在地」にする
    // (近接スポーンや追跡で巣からずれても本体を指す)。
    const liveHiddenBoss = s.enemies.find(e => isHiddenBoss(e.type));
    const revealedPois = getRunPois(s.hiddenBoss)
      .filter(p => !(p.kind === 'boss' && s.hiddenBossDefeated))
      .filter(p => isPoiRevealed(p, s.baseSites))
      .map(p => (p.kind === 'boss' && liveHiddenBoss)
        ? { ...p, x: liveHiddenBoss.x + liveHiddenBoss.width / 2, y: liveHiddenBoss.y + liveHiddenBoss.height / 2 }
        : p);
    this.syncArrows(s.pickups, s.castleEvent, s.weaponMerchant, s.camera, !(s.indoorMode || s.stageTheme === 'lab'), s.activeEvent, revealedPois, s.baseSites);
    this.syncFlash(s.effects, now);

    // Warm ground pool follows the player. It lives in the world's groundLayer
    // (camera-offset already applied to the parent), so plain world coords.
    const lx = s.player.x + s.player.width / 2;
    const ly = s.player.y + s.player.height / 2;
    // 屋内(研究施設)は「明るい部分」を狭くする(社長指示): プレイヤー光/光だまりを縮小。
    const lightScale = s.indoorMode ? 0.62 : 1;
    const lp = this.lighting();
    this.playerLight.position.set(lx, ly);
    this.playerLight.tint = s.player.huntingCharged ? PLAYER_HUNTING_LIGHT_TINT : lp.color;
    this.playerLight.alpha = lp.playerAssistAlpha * (s.player.huntingCharged ? 1.3 : 1) * (0.92 + 0.08 * Math.sin(now / 600));
    this.playerLight.width = this.playerLight.height = lp.playerAssistRadius * (s.player.huntingCharged ? 2.2 : 2) * lightScale;

    // A: 光だまり(足元の地面プール)を追従。?pool=0 で無効。微かに脈動。
    if (this.playerGroundPool.visible) {
      this.playerGroundPool.position.set(lx, ly);
      this.playerGroundPool.alpha = LIGHT_POOL_ALPHA * (0.94 + 0.06 * Math.sin(now / 700));
      this.playerGroundPool.width = this.playerGroundPool.height = LIGHT_POOL_RADIUS * 2 * lightScale;
    }

    this.syncAlchemyCircle(s.player, s.gameTime, now);
    this.syncWhipHurricane(s.hurricane, now);
    // リズムの拍/演出は実時間(now=Date.now)基準。store の firstBeatAt/lastTapAt 等も Date.now ベース。
    this.syncRhythmScreenFx(s.rhythm, now);
    this.syncRhythmOverlay(s.rhythm, s.player, now);
    this.syncFireflies(s.camera, now);
  }

  // ---- 四神舞(リズム)UI: ミラーボール + 左右サークル + 矢印プロンプト -------
  // rhythm.active の間だけプレイヤー頭上に表示し追従。ミラーボール色は「技を連続で出した回数
  // (godSuccess)」で 0白/1青/2緑/3赤、フィニッシュで虹。0.5秒ごとに左右反転して回転に見せる。
  // 左右サークルは 0.5秒ごとに足元で重なる(=ジャスト)。リング/矢印は軽量Graphics。
  private syncRhythmOverlay(
    rhythm: { active: boolean; interval: number; firstBeatAt: number; expectBeat: number; prompt: ('up' | 'down' | 'left' | 'right')[]; inputIndex: number; inputArrows: ('up' | 'down' | 'left' | 'right')[]; godSuccess: number; lastJudge: string; lastJudgeAt: number; lastJudgeKind: 'tap' | 'flick' | 'none'; lastJudgeArrow: 'up' | 'down' | 'left' | 'right' | null; judgeSeq: number; lastTapAt: number; lastFinishAt: number },
    player: Player,
    gameTime: number
  ) {
    const g = this.rhythmOverlay;
    if (!rhythm.active || RHYTHM_VFX_OFF) {
      if (g.visible) { g.visible = false; g.clear(); }
      if (this.rhythmBall.visible) this.rhythmBall.visible = false;
      if (this.rhythmGodText.visible) this.rhythmGodText.visible = false;
      if (this.rhythmArrowsGfx.visible) { this.rhythmArrowsGfx.visible = false; }
      this.rhythmArrowsKey = ''; // 次回開始時に必ず再描画
      return;
    }
    const fb = playerFootBox(player);
    const cx = fb.footX;
    const cy = fb.footY - fb.boxH - 26; // 頭上
    g.visible = true;
    g.clear();

    // ミラーボール本体: 実テクスチャのスプライト。0.5秒ごとに左右反転して回転して見せる。
    const r = RHYTHM_BALL_DIAM / 2;
    const ball = this.rhythmBall;
    // 有効なテクスチャ(十分な解像度)が無ければ取得し直す。ロード中/破棄済みのテクスチャを掴むと
    // width が極小になり、スプライトが巨大化して画面全体を覆うバグになるのを防ぐ。
    if (!ball.texture || ball.texture.width < 32) {
      const tex = getTexture('mirror-ball');
      if (tex && tex.width >= 32) { ball.texture = tex; }
    }
    const texOk = !!ball.texture && ball.texture.width >= 32;
    const flipSign = Math.floor(gameTime / rhythm.interval) % 2 === 0 ? 1 : -1;
    // 成功発光: 直後に少し拡大して光る + 背面に暖色ハロー。タップ/フリックどちらの成功(JUST=hit/fire)でも光る
    // (以前は lastTapAt 基準でタップ専用だった)。[0,1] にクランプ(保険。異常値でも pulse が暴れて巨大化しない)。
    const okJudge = rhythm.lastJudge === 'hit' || rhythm.lastJudge === 'fire';
    const tapT = okJudge ? Math.max(0, Math.min(1, 1 - (gameTime - rhythm.lastJudgeAt) / RHYTHM_TAP_GLOW_MS)) : 0;
    // JUST成功ごとに 赤→青→緑→黄 を巡回する発光色(judgeSeqで選択)。
    const cycN = RHYTHM_JUST_CYCLE_COLORS.length;
    const cycleCol = RHYTHM_JUST_CYCLE_COLORS[((rhythm.judgeSeq % cycN) + cycN) % cycN];
    const pulse = 1 + 0.18 * tapT;
    // 色: フィニッシュ虹 > 段階色(0白/1青/2緑/3赤)。
    const sinceFinish = gameTime - rhythm.lastFinishAt;
    const tint = (sinceFinish >= 0 && sinceFinish < RHYTHM_FINISH_RAINBOW_MS)
      ? RHYTHM_RAINBOW_PALETTE[Math.floor(gameTime / 70) % RHYTHM_RAINBOW_PALETTE.length]
      : RHYTHM_STAGE_COLORS[Math.max(0, Math.min(RHYTHM_STAGE_COLORS.length - 1, rhythm.godSuccess))];
    // タップ発光のハロー(暖色)。先に敷く。
    if (tapT > 0.01) g.circle(cx, cy, r + 4 + tapT * 8).fill({ color: cycleCol, alpha: 0.32 * tapT });
    if (texOk) {
      const s = (RHYTHM_BALL_DIAM / ball.texture.width) * pulse; // width>=32 を保証済みなので巨大化しない
      ball.scale.set(s * flipSign, s);
      ball.position.set(cx, cy);
      ball.tint = tint;
      ball.alpha = 1;
      ball.visible = true;
    } else {
      // テクスチャ未準備/異常: スプライトは隠し、簡易ミラーボール円で代替(画面全体化を防止)。
      if (ball.visible) ball.visible = false;
      g.circle(cx, cy, r * pulse).fill({ color: tint, alpha: 0.92 });
      g.circle(cx, cy, r * pulse).stroke({ color: 0x0b1020, width: 1.5, alpha: 0.8 });
    }
    // ミラーボールは空中に吊られている演出なので地面影は描かない(影は不自然)。

    // 左右の輪っか: プレイヤーの「足元」めがけて左右から流れ込み、足元のど真ん中(footX,footY)で
    // 重なり合う(=ジャスト)。地面に置いた輪に見えるよう縦をつぶした楕円で描く。
    // サークルは入力の成否に関係なく、固定の120BPMグリッド位相で流れ続ける(音楽とズレない)。
    const interval = rhythm.interval;
    const intoBeat = (((gameTime - rhythm.firstBeatAt) % interval) + interval) % interval; // 拍内経過(0..interval)
    const toBeat = (interval - intoBeat) / interval; // 1(拍直後)→0(次の拍で足元に重なる)
    const footCx = fb.footX;
    const footCy = fb.footY - 2; // ほぼ接地点
    const spread = 64;           // どれだけ外(左右)から流れてくるか
    const off = spread * toBeat;
    const rw = 16, rh = 7;       // 地面の輪(縦つぶし楕円)
    const just = off < 5;
    const ringCol = just ? 0xfde68a : 0xbae6fd;
    const ringAlpha = 0.5 + 0.4 * (1 - toBeat); // 近づくほどくっきり
    // 重なる場所(足元中央)のターゲットを薄く常時表示。
    g.ellipse(footCx, footCy, rw, rh).stroke({ color: 0x94a3b8, alpha: 0.35, width: 1 });
    // 左右から接近する2つの輪。
    g.ellipse(footCx - off, footCy, rw, rh).stroke({ color: ringCol, alpha: ringAlpha, width: 2.5 });
    g.ellipse(footCx + off, footCy, rw, rh).stroke({ color: ringCol, alpha: ringAlpha, width: 2.5 });
    // ジャスト(重なった瞬間)に小さな発光リング。
    if (just) g.ellipse(footCx, footCy, rw + 3, rh + 2).stroke({ color: 0xfde68a, alpha: 0.85, width: 2 });

    // --- JUST バースト演出(音ゲー風・足元) -----------------------------------
    // 直近JUST(hit/fire)から時間で減衰。タップ=広がって消えるサークル / フリック=入力方向へ飛んで
    // 拡大して消える矢印。加えて足元が一瞬光る。すべて既存 g(rhythmOverlay)に描くので新規オブジェクト
    // やテクスチャを作らず軽量(発生から RHYTHM_JUST_BURST_MS の間だけ数本のdraw)。
    const sinceBurst = gameTime - rhythm.lastJudgeAt;
    if ((rhythm.lastJudge === 'hit' || rhythm.lastJudge === 'fire') && sinceBurst >= 0 && sinceBurst < RHYTHM_JUST_BURST_MS) {
      const bt = sinceBurst / RHYTHM_JUST_BURST_MS;   // 0→1
      const ease = 1 - (1 - bt) * (1 - bt);           // ease-out(序盤に速く広がる)
      const fade = 1 - bt;                            // 透明度の減衰
      const isFire = rhythm.lastJudge === 'fire';
      const burstCol = cycleCol; // JUST毎に 赤→青→緑→黄 を巡回
      // 足元発光(地面が一瞬光る): 明るい潰し楕円を2枚重ねて柔らかく。
      const glowA = 0.5 * fade * fade;
      g.ellipse(footCx, footCy, rw * (1.4 + ease * 1.2), rh * (1.6 + ease)).fill({ color: burstCol, alpha: glowA * 0.6 });
      g.ellipse(footCx, footCy, rw * (0.8 + ease * 0.6), rh * (0.9 + ease * 0.5)).fill({ color: 0xffffff, alpha: glowA });
      if (rhythm.lastJudgeKind === 'flick' && rhythm.lastJudgeArrow) {
        // フリック: 入力方向へ飛びながら拡大して消える矢印。
        const dir = rhythm.lastJudgeArrow;
        const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
        const dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
        const ax = footCx + dx * RHYTHM_JUST_FLICK_TRAVEL * ease;
        const ay = footCy + dy * RHYTHM_JUST_FLICK_TRAVEL * ease - 4;
        const block = 2.6 + ease * 4.2;               // ドットを拡大
        this.drawRhythmArrow(g, ax, ay, dir, burstCol, Math.max(0, fade), block);
      } else {
        // タップ: 広がって消えるサークル(地面の輪を多重に)。
        const s1 = 1 + ease * RHYTHM_JUST_RING_MAX_SCALE;
        g.ellipse(footCx, footCy, rw * s1, rh * s1).stroke({ color: burstCol, alpha: 0.85 * fade, width: 3 });
        const s2 = 1 + ease * (RHYTHM_JUST_RING_MAX_SCALE * 0.6);
        g.ellipse(footCx, footCy, rw * s2, rh * s2).stroke({ color: 0xffffff, alpha: 0.5 * fade, width: 1.5 });
      }
      // 四神技完成(fire)は一段派手に: もう1本外側のリングを足す。
      if (isFire) {
        const s3 = 1 + ease * (RHYTHM_JUST_RING_MAX_SCALE * 1.4);
        g.ellipse(footCx, footCy, rw * s3, rh * s3).stroke({ color: burstCol, alpha: 0.6 * fade, width: 2 });
      }
    }

    // 判定フラッシュ(hit/miss/fire を一瞬の色リングで)。lastJudgeAt は gameTime 基準。
    const sinceJudge = gameTime - rhythm.lastJudgeAt;
    if (sinceJudge >= 0 && sinceJudge < 220) {
      const t = sinceJudge / 220;
      const jc = rhythm.lastJudge === 'miss' ? 0xf43f5e : rhythm.lastJudge === 'fire' ? 0xfde68a : 0x86efac;
      g.circle(cx, cy, r + 4 + t * 10).stroke({ color: jc, alpha: 0.7 * (1 - t), width: 2 });
    }

    // --- 矢印(入力フリック + 目標コマンド) ---------------------------------
    // 別Graphics(rhythmArrowsGfx)に原点(0,0)基準で描き、位置は毎フレーム transform だけ追従。
    // 内容(入力履歴/コマンド/進行)が変わった時だけ再描画する(毎フレームの矩形リビルドを回避)。
    const shown = rhythm.inputArrows.slice(-4);
    const prompt = rhythm.prompt;
    const cblock = 2.8; // コマンド矢印のドットサイズ(全体的に大きめに)
    const cgap = 7 * cblock + 5;
    // 技リスト(目標コマンド)= 旧・入力矢印の位置(頭上)へ下げる。
    const cmdY = -r - 18;                       // 原点(cx,cy=頭上)基準
    // 入力済み矢印 = キャラの下(足元の下)へ移動。cy は頭上なので 足元 = boxH+26、その少し下。
    const inputArrowsY = fb.boxH + 26 + 20;
    const cstartX = -(cgap * (prompt.length - 1)) / 2 - 8; // 名前ぶん少し左寄せ
    const ag = this.rhythmArrowsGfx;
    ag.position.set(cx, cy);
    ag.visible = true;
    const key = `${shown.join('')}|${prompt.join('')}|${rhythm.inputIndex}`;
    if (key !== this.rhythmArrowsKey) {
      this.rhythmArrowsKey = key;
      ag.clear();
      // 入力フリック(末尾最大4)。最新は明るく強調。キャラの下に表示。
      if (shown.length > 0) {
        const block = 3.0; // 入力フリック矢印のドットサイズ(全体的に大きめに)
        const gap = 7 * block + 6;
        const startX = -(gap * (shown.length - 1)) / 2;
        for (let i = 0; i < shown.length; i++) {
          const latest = i === shown.length - 1;
          this.drawRhythmArrow(ag, startX + i * gap, inputArrowsY, shown[i], latest ? 0xfde68a : 0xbae6fd, latest ? 1 : 0.85, block);
        }
      }
      // 目標コマンド(技リスト。入力済みは淡色、1本目=四神色)。
      for (let i = 0; i < prompt.length; i++) {
        const a = i < rhythm.inputIndex ? 0.3 : 1;
        const col = i === 0 ? 0xfca5a5 : 0xe2e8f0;
        this.drawRhythmArrow(ag, cstartX + i * cgap, cmdY, prompt[i], col, a, cblock);
      }
    }
    // 四神名(Text): 位置は毎フレーム追従(cheap)、テキストは変化時のみ更新。
    const godJp = SHIJIN_JP[SHIJIN_BY_ARROW[prompt[0]]];
    if (this.rhythmGodLast !== godJp) { this.rhythmGodText.text = godJp; this.rhythmGodLast = godJp; }
    this.rhythmGodText.position.set(cx + cstartX + (prompt.length - 1) * cgap + cgap * 0.6, cy + cmdY);
    this.rhythmGodText.visible = true;
  }

  // リズムゲーム風の太いドット絵矢印を描く(7x7のドット行列。暗い縁取り付き)。
  private drawRhythmArrow(g: Graphics, x: number, y: number, dir: 'up' | 'down' | 'left' | 'right', color: number, alpha: number, block: number) {
    const grid = RHYTHM_ARROW_GRID[dir];
    const n = grid.length;
    const off = (n - 1) / 2;
    // 縁取り(各ドットを一回り大きい暗色で先に敷く)。
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (grid[r][c]) {
      const px = x + (c - off) * block;
      const py = y + (r - off) * block;
      g.rect(px - block / 2 - 1, py - block / 2 - 1, block + 2, block + 2).fill({ color: 0x0b1020, alpha });
    }
    // 本体ドット。
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (grid[r][c]) {
      const px = x + (c - off) * block;
      const py = y + (r - off) * block;
      g.rect(px - block / 2, py - block / 2, block, block).fill({ color, alpha });
    }
  }

  // リズム中の暗転(地面/遠景だけ・フェード追従)+ タップ発光(全画面・最前面)。
  private syncRhythmScreenFx(rhythm: { active: boolean; lastTapAt: number; lastJudge: string; lastJudgeAt: number; judgeSeq: number }, gameTime: number) {
    const target = (rhythm.active && !RHYTHM_VFX_OFF) ? RHYTHM_DIM_ALPHA : 0;
    this.rhythmDim += (target - this.rhythmDim) * RHYTHM_DIM_EASE;
    // 暗転(worldGroup の filteredWorld 手前): 地面/遠景のみ暗くなる。
    const d = this.rhythmDimGfx;
    if (this.rhythmDim < 0.004) {
      if (d.visible) { d.visible = false; d.clear(); }
    } else {
      d.visible = true;
      d.clear();
      d.rect(0, 0, this.screenW, this.screenH).fill({ color: 0x010512, alpha: this.rhythmDim });
    }
    // 成功発光(uiLayer 最前面・全画面)。タップ/フリックどちらの成功(JUST=hit/fire)でも光る。
    const okJudge = rhythm.lastJudge === 'hit' || rhythm.lastJudge === 'fire';
    const tapGlow = (rhythm.active && !RHYTHM_VFX_OFF && okJudge)
      ? Math.max(0, 1 - (gameTime - rhythm.lastJudgeAt) / RHYTHM_TAP_GLOW_MS) * RHYTHM_TAP_GLOW_ALPHA
      : 0;
    const g = this.rhythmScreenFx;
    if (tapGlow < 0.004) {
      if (g.visible) { g.visible = false; g.clear(); }
    } else {
      g.visible = true;
      g.clear();
      // 全画面フラッシュも JUST毎に 赤→青→緑→黄 を巡回。
      const cycN = RHYTHM_JUST_CYCLE_COLORS.length;
      const cycleCol = RHYTHM_JUST_CYCLE_COLORS[((rhythm.judgeSeq % cycN) + cycN) % cycN];
      g.rect(0, 0, this.screenW, this.screenH).fill({ color: cycleCol, alpha: tapGlow });
    }
  }

  // ---- 鞭ハリケーン(吸引中心に立つ竜巻スプライト) -----------------------
  // store の hurricane 状態がある間だけ表示し、立ち上がり/消滅で alpha フェード。
  // 視覚専用: 吸引半径・ダメージ・持続には一切干渉しない。
  private syncWhipHurricane(
    hurricane: { rootX: number; rootY: number; endsAt: number; radius: number; level: number } | null,
    now: number
  ) {
    if (!hurricane || now >= hurricane.endsAt) {
      if (this.whipHurricane.visible) {
        this.whipHurricane.visible = false;
        this.whipHurricane.alpha = 0;
      }
      return;
    }
    if (!this.whipHurricaneTextured) {
      const tex = getTexture('whip-hurricane');
      if (!tex) return;
      this.whipHurricane.texture = tex;
      this.whipHurricaneTextured = true;
    }
    const total = HURRICANE_DURATION_MS_BY_LEVEL[hurricane.level] ?? 1400;
    const startedAt = hurricane.endsAt - total;
    const elapsed = now - startedAt;
    const remaining = hurricane.endsAt - now;
    const fadeIn = Math.min(1, elapsed / WHIP_HURRICANE_FADE_IN_MS);
    const fadeOut = Math.min(1, remaining / WHIP_HURRICANE_FADE_OUT_MS);
    const width = hurricane.radius * WHIP_HURRICANE_WIDTH_MULT;
    this.whipHurricane.visible = true;
    this.whipHurricane.position.set(hurricane.rootX, hurricane.rootY);
    this.whipHurricane.width = width;
    this.whipHurricane.height = width; // 512x512 正方(縦長竜巻)
    // 竜巻の鼓動: わずかな横揺れ的スケール脈動で生命感を出す(回転はしない)。
    const pulse = 1 + 0.05 * Math.sin(now / 80);
    // 0.1秒毎に左右反転(scale.x の符号トグル)。渦が回って見えるミラー演出。
    const flip = Math.floor(now / WHIP_HURRICANE_FLIP_MS) % 2 === 0 ? 1 : -1;
    this.whipHurricane.scale.x = Math.abs(this.whipHurricane.scale.x) * pulse * flip;
    this.whipHurricane.alpha = Math.min(1, fadeIn * fadeOut);
  }

  // ---- 錬金術の魔法陣(足元の常設地面スプライト) --------------------------
  // チャネル中(player.alchemyChannelStartedAt>0)だけ表示し、alpha=溜め進捗で
  // 連続フェード(透明→完成で不透明)。完成の「光で召喚」は summonAlchemy 側の
  // フラッシュ/バーストが担当する。視覚専用: 当たり判定/召喚ロジックには不干渉。
  private static readonly ALCHEMY_CIRCLE_SIZE = 168; // 足元の魔法陣の直径(px, 視覚のみ)
  private syncAlchemyCircle(player: Player, gameTime: number, now: number) {
    const startedAt = player.alchemyChannelStartedAt ?? 0;
    if (startedAt <= 0) {
      if (this.alchemyCircle.visible) {
        this.alchemyCircle.visible = false;
        this.alchemyCircle.alpha = 0;
      }
      return;
    }
    // テクスチャは非同期ロード。準備できた最初のフレームで一度だけ割り当て。
    if (!this.alchemyCircleTextured) {
      const tex = getTexture('magic-circle');
      if (!tex) return;
      this.alchemyCircle.texture = tex;
      this.alchemyCircle.width = this.alchemyCircle.height = PixiScene.ALCHEMY_CIRCLE_SIZE;
      this.alchemyCircleTextured = true;
    }
    const progress = Math.max(0, Math.min(1, (gameTime - startedAt) / ALCHEMY_CHANNEL_MS));
    const foot = playerFootBox(player);
    this.alchemyCircle.visible = true;
    this.alchemyCircle.position.set(foot.footX, foot.footY);
    // 透明→不透明。完成間際にわずかな鼓動を足して「溜まり切る」高揚を出す。
    const base = 0.08 + 0.92 * progress;
    const pulse = progress > 0.85 ? 1 + 0.08 * Math.sin(now / 70) : 1;
    this.alchemyCircle.alpha = Math.min(1, base * pulse);
  }

  private syncEventBloom(effects: VisualEffect[], now: number) {
    if (!this.bloom || !this.bloomActive) return; // OFF時はフィルタ配列に無いので調整不要
    const hasStrongEventGlow = effects.some(e => {
      if (e.kind !== 'glow' || e.radius < STRONG_GLOW_RADIUS) return false;
      const t = (now - e.createdAt) / e.duration;
      return t >= 0 && t < 1;
    });
    this.bloom.bloomScale = hasStrongEventGlow ? BLOOM_STRONG_EVENT_SCALE : this.lighting().bloomScale;
  }

  // ---- ambient fireflies ---------------------------------------------------

  private syncFireflies(camera: { x: number; y: number }, now: number) {
    if (!this.fireflies.length) return;
    const dt = this.fxPrevNow ? Math.min(50, now - this.fxPrevNow) : 16;
    this.fxPrevNow = now;

    const minX = camera.x - FIREFLY_MARGIN;
    const minY = camera.y - FIREFLY_MARGIN;
    const maxX = camera.x + this.screenW + FIREFLY_MARGIN;
    const maxY = camera.y + this.screenH + FIREFLY_MARGIN;

    if (!this.firefliesPlaced) {
      for (const f of this.fireflies) {
        f.x = minX + Math.random() * (maxX - minX);
        f.y = minY + Math.random() * (maxY - minY);
        const a = Math.random() * Math.PI * 2;
        const s = 5 + Math.random() * 10;
        f.vx = Math.cos(a) * s;
        f.vy = Math.sin(a) * s;
      }
      this.firefliesPlaced = true;
    }

    const sec = dt / 1000;
    // ステージ4は蛍をやめて雪に置き換え(社長指示)。雪は落下＋進行方向(プレイヤー速度)連動で流れる。
    const snow = this.snowStage;
    let windX = 0, windY = 0;
    if (snow) {
      const p = useGameStore.getState().player;
      windX = -(p.vx ?? 0) * SNOW_WIND_FACTOR; // 進む方向と逆へ雪が流れる=移動連動
      windY = -(p.vy ?? 0) * SNOW_WIND_FACTOR;
    }
    for (const f of this.fireflies) {
      if (snow) {
        f.x += (f.snowDrift + windX) * sec;
        f.y += (f.snowFall + windY) * sec; // +y=下へ落下
      } else {
        f.x += f.vx * sec;
        f.y += f.vy * sec;
      }
      // Wrap into the visible band so density follows the camera.
      if (f.x < minX) f.x = maxX; else if (f.x > maxX) f.x = minX;
      if (f.y < minY) f.y = maxY; else if (f.y > maxY) f.y = minY;
      f.sprite.position.set(f.x - camera.x, f.y - camera.y);
      if (snow) {
        f.sprite.tint = SNOW_TINT;
        f.sprite.alpha = f.base * 0.95;          // 雪はほぼ一定の淡い白(瞬きなし)
        f.sprite.width = f.sprite.height = f.size * 0.7;
      } else {
        const twinkle = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(now * f.freq + f.phase));
        f.sprite.tint = FIREFLY_TINT;
        f.sprite.alpha = f.base * twinkle;
        f.sprite.width = f.sprite.height = f.size;
      }
    }
  }

  private syncCastle(castle: CastleEvent, now: number) {
    // ステージ3(廃都=farBackdrop 'city')は廃教会、それ以外(ステージ1の城など)は通常の城。
    const isCity = useGameStore.getState().farBackdrop === 'city';
    const tex = (isCity ? getTexture('castle-church') : null) ?? getTexture('castle');
    if (!tex) {
      this.castleView.visible = false;
      this.castleShadow = null;
      return;
    }

    const footY = castle.y + CASTLE_FOOT_OFFSET_Y;
    const horizonAlpha = this.horizonActorAlpha(footY);
    if (horizonAlpha <= 0) {
      this.castleView.visible = false;
      this.castleShadow = null;
      return;
    }

    const d = this.depthScale(footY);
    const pulse = castle.bossSpawned ? 0.75 + 0.25 * Math.sin(now / 260) : 0;
    const targetH = CASTLE_TARGET_HEIGHT * d;
    const sc = targetH / tex.height;

    // 接地影は syncShadows のソフト方向影に統一(他のオブジェクトと同じプール経路)。
    // 幅は城スプライトの見た目幅基準だが、巨大ブロブを避けるため控えめに抑える。
    const castleFootScreenY = castle.y + CASTLE_FOOT_OFFSET_Y * d;
    this.castleShadow = {
      x: castle.x,
      y: castleFootScreenY,
      w: Math.min(120 * d, tex.width * sc * 0.42),
      alpha: horizonAlpha * 0.8,
    };

    this.castleView.visible = true;
    this.castleView.position.set(Math.round(castle.x), Math.round(castle.y + CASTLE_FOOT_OFFSET_Y * d));
    this.castleView.alpha = Math.min(0.96, horizonAlpha * 0.9);
    this.castleView.zIndex = footY;

    this.castleSprite.texture = tex;
    this.castleSprite.scale.set(sc);

    this.castleGlow.visible = castle.bossSpawned;
    this.castleGlow.position.set(0, -targetH * 0.5);
    this.castleGlow.width = targetH * 1.35;
    this.castleGlow.height = targetH * 0.9;
    this.castleGlow.alpha = castle.bossSpawned ? 0.14 + 0.08 * pulse : 0;

    // 出現魔法陣(錬金と同じ magic-circle テクスチャ)を城の足元に短時間表示(拡大しながらフェードアウト)。
    const SUMMON_MS = 1100;
    const sc2 = this.castleSummonCircle;
    const t = castle.bossSummonAt ? (now - castle.bossSummonAt) / SUMMON_MS : 1;
    if (castle.bossSummonAt && t >= 0 && t < 1) {
      if (!this.castleSummonTextured) {
        const mtex = getTexture('magic-circle');
        if (mtex) { sc2.texture = mtex; this.castleSummonTextured = true; }
      }
      if (this.castleSummonTextured) {
        const size = (160 + 120 * t) * d;       // 拡大
        sc2.visible = true;
        sc2.position.set(castle.x, castleFootScreenY);
        sc2.width = sc2.height = size;
        sc2.alpha = (1 - t) * 0.95;             // フェードアウト
        sc2.rotation = t * 1.2;                 // ゆっくり回転
      }
    } else if (sc2.visible) {
      sc2.visible = false;
      sc2.alpha = 0;
    }
  }

  private syncMerchant(merchant: WeaponMerchant, player: Player, now: number) {
    const tex = getTexture('weapon-merchant');
    if (!tex) {
      this.merchantView.visible = false;
      this.merchantShadow = null;
      return;
    }

    const horizonAlpha = this.horizonActorAlpha(merchant.y);
    if (horizonAlpha <= 0) {
      this.merchantView.visible = false;
      this.merchantShadow = null;
      return;
    }

    const d = this.depthScale(merchant.y);
    const targetH = MERCHANT_TARGET_HEIGHT * d;
    const sc = targetH / tex.height;
    const pulse = 0.5 + 0.5 * Math.sin(now / 420);
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    const dx = merchant.x - pcx;
    const dy = merchant.y - pcy;
    const near = dx * dx + dy * dy <= (merchant.radius + 72) * (merchant.radius + 72);

    this.merchantView.visible = true;
    this.merchantView.position.set(Math.round(merchant.x), Math.round(merchant.y));
    this.merchantView.alpha = horizonAlpha;
    this.merchantView.zIndex = merchant.y;

    this.merchantSprite.texture = tex;
    this.merchantSprite.scale.set(sc);

    this.merchantGlow.position.set(0, -targetH * 0.52);
    this.merchantGlow.width = targetH * 0.92;
    this.merchantGlow.height = targetH * 0.72;
    this.merchantGlow.alpha = (near ? 0.18 : 0.08) + pulse * (near ? 0.08 : 0.025);

    // 接地影は syncShadows のソフト方向影に統一(可視時のみリクエスト)。
    this.merchantShadow = { x: merchant.x, y: merchant.y, w: 82 * d, alpha: horizonAlpha };

    const g = this.merchantGfx;
    g.clear();
    if (near) {
      g.circle(0, -8 * d, merchant.radius * d)
        .stroke({ width: 2 * d, color: 0xfbbf24, alpha: 0.38 + pulse * 0.22 });
      g.circle(0, -targetH * 0.82, 4 * d)
        .fill({ color: 0xfde68a, alpha: 0.82 + pulse * 0.16 });
    }
  }

  private syncEventQuestNpc(npc: EventQuestNpc, player: Player, now: number) {
    const tex = getTexture('quest-futari');
    if (!tex) {
      this.eventNpcView.visible = false;
      this.npcShadow = null;
      return;
    }

    const fadeElapsed = npc.status === 'completed' && npc.fadeStartedAt > 0
      ? now - npc.fadeStartedAt
      : 0;
    if (npc.status === 'completed' && fadeElapsed >= EVENT_NPC_FADE_MS) {
      this.eventNpcView.visible = false;
      this.npcShadow = null;
      return;
    }

    const horizonAlpha = this.horizonActorAlpha(npc.y);
    if (horizonAlpha <= 0) {
      this.eventNpcView.visible = false;
      this.npcShadow = null;
      return;
    }

    const d = this.depthScale(npc.y);
    const targetH = EVENT_NPC_TARGET_HEIGHT * d;
    const sc = targetH / tex.height;
    const breath = 0.5 + 0.5 * Math.sin(now / 760 + npc.questIndex * 0.7);
    const breathX = 1 + (breath - 0.5) * 0.012;
    const breathY = 1 + (breath - 0.5) * 0.022;
    const pulse = 0.5 + 0.5 * Math.sin(now / 360);
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    const dx = npc.x - pcx;
    const dy = npc.y - pcy;
    const near = npc.status === 'available' && dx * dx + dy * dy <= (npc.radius + 72) * (npc.radius + 72);
    const statusAlpha = npc.status === 'completed'
      ? Math.max(0, 1 - fadeElapsed / EVENT_NPC_FADE_MS)
      : 1;

    this.eventNpcView.visible = true;
    this.eventNpcView.position.set(Math.round(npc.x), Math.round(npc.y));
    this.eventNpcView.alpha = horizonAlpha * statusAlpha;
    this.eventNpcView.zIndex = npc.y;

    this.eventNpcSprite.texture = tex;
    this.eventNpcSprite.scale.set(sc * breathX, sc * breathY);

    this.eventNpcGlow.position.set(0, -targetH * 0.58);
    this.eventNpcGlow.width = targetH * 1.05;
    this.eventNpcGlow.height = targetH * 0.72;
    this.eventNpcGlow.alpha = (near ? 0.16 : 0.06) + pulse * (near ? 0.08 : 0.02);

    // 接地影は syncShadows のソフト方向影に統一(可視時のみリクエスト。フェード中は statusAlpha 反映)。
    this.npcShadow = { x: npc.x, y: npc.y, w: 84 * d, alpha: horizonAlpha * statusAlpha };

    const g = this.eventNpcGfx;
    g.clear();
    if (near) {
      g.circle(0, -8 * d, npc.radius * d)
        .stroke({ width: 2 * d, color: 0x60a5fa, alpha: 0.34 + pulse * 0.2 });
      g.circle(0, -targetH * 0.96, 4 * d)
        .fill({ color: 0xbfdbfe, alpha: 0.72 + pulse * 0.18 });
    }
    if (npc.status === 'accepted') {
      g.circle(0, -targetH * 0.98, 5 * d)
        .stroke({ width: 1.5 * d, color: 0x34d399, alpha: 0.46 + pulse * 0.18 });
    }
  }

  // ---- trees: Y-sorted with the actors so you stand in front / behind -------

  private syncTrees(camera: { x: number; y: number }) {
    const st = useGameStore.getState();
    const indoor = st.indoorMode;
    const labTheme = st.stageTheme === 'lab'; // 研究所スキンは木を出さない(社長指示)
    const noTrees = labTheme; // 研究所スキンのみ木なし。ステージ4(雪原)はステージ1と同仕様で木を出す(社長指示)。
    // ステージ3(廃都)は葉付き木、ステージ4(雪原)は雪化粧の木、それ以外(森)は枯れ木。farBackdrop で出し分け。
    const tex = (st.farBackdrop === 'city' ? getTexture('tree-city') : null)
      ?? (st.farBackdrop === 'snow' ? getTexture('tree-snow') : null)
      ?? getTexture('tree');
    const margin = TREE_CELL;
    let trees = noTrees ? [] : treesInRegion(
      camera.x - margin, camera.y - margin,
      camera.x + this.screenW + margin, camera.y + this.screenH + margin,
    );
    // 屋内(研究施設): 内部には木を出さない。壁の外側=野外マージンだけ「森」として残す(社長指示)。
    if (indoor) {
      const b = LAB_BOUNDS;
      trees = trees.filter(t =>
        t.footX < b.x || t.footX > b.x + b.width || t.footY < b.y || t.footY > b.y + b.height
      );
    }

    const seen = new Set<string>();
    for (const t of trees) {
      seen.add(t.key);
      let entry = this.trees.get(t.key);
      if (!entry) {
        const sprite = new Sprite(tex ?? undefined);
        sprite.anchor.set(0.5, 1);
        sprite.tint = this.envTintNow(); // 木も環境として暗く沈める(昼ステージは本来色)
        sprite.x = t.footX;
        sprite.y = t.footY;
        // Y-sort together with the player & enemies by foot Y, so the hero can
        // pass in front of (south) or behind (north) each tree.
        sprite.zIndex = t.footY;
        this.L.actorLayer.addChild(sprite);
        const boxW = 48 * TREE_VISUAL_SCALE * t.scale;
        const boxH = 64 * TREE_VISUAL_SCALE * t.scale;
        const baseScale = tex ? containScale(boxW, boxH, tex.width, tex.height) : 1;
        entry = { sprite, baseScale, footY: t.footY };
        this.trees.set(t.key, entry);
      }
      // Depth scale every frame: a tree's apparent size shifts as the player
      // (the focal plane) walks past it. Anchored at the foot, stays rooted.
      if (tex) entry.sprite.scale.set(entry.baseScale * this.depthScale(entry.footY));
      this.applyObstacleAlpha(entry.sprite, entry.footY);
    }
    for (const [key, entry] of this.trees) {
      if (!seen.has(key)) {
        entry.sprite.destroy();
        this.trees.delete(key);
      }
    }
  }

  // ---- 壁オブジェクト(研究所スキン・区画生成): 木と同じく足元アンカー(0.5,1)+zIndex=footY+depthScale で
  // actorLayer に並べ、カメラ周辺の区画分だけ生成/リサイクル。背面は被る(=ビルボード遮蔽)。
  private syncLabWalls() {
    const s = useGameStore.getState();
    const labTheme = s.stageTheme === 'lab' && !s.indoorMode;
    const cam = s.camera;
    const m = LAB_ZONE;
    const walls = labTheme
      ? labWallsInRegion(cam.x - m, cam.y - m, cam.x + this.screenW + m, cam.y + this.screenH + m)
      : [];
    const seen = new Set<string>();
    for (const w of walls) {
      seen.add(w.id);
      let entry = this.wallObjs.get(w.id);
      if (!entry) {
        const tex = getTexture('lab/lab-wall-obj-h');
        const sprite = new Sprite(tex ?? undefined);
        sprite.anchor.set(0.5, 1);
        sprite.tint = ENV_TINT; // 環境として暗く沈める(木と同じ)
        sprite.x = w.footX;
        sprite.y = w.footY;
        sprite.zIndex = w.footY; // 足元Yでプレイヤー/敵とY-sort(背面は被る)
        this.L.actorLayer.addChild(sprite);
        const baseScale = tex ? containScale(WALL_DISPLAY_H.w, WALL_DISPLAY_H.h, tex.width, tex.height) : 1;
        entry = { sprite, baseScale, footY: w.footY };
        this.wallObjs.set(w.id, entry);
      }
      entry.sprite.scale.set(entry.baseScale * this.depthScale(entry.footY));
      this.applyObstacleAlpha(entry.sprite, entry.footY);
    }
    for (const [id, entry] of this.wallObjs) {
      if (!seen.has(id)) { entry.sprite.destroy(); this.wallObjs.delete(id); }
    }
  }

  // ---- 遮蔽物プロップ(研究所スキン・区画生成): テストステージのパソコン/割れたカプセル等を
  // ランダム散布。壁オブジェクトと同じく足元アンカー+zIndex=footY+depthScale で actorLayer に並べる。
  private syncLabProps() {
    const s = useGameStore.getState();
    const labTheme = s.stageTheme === 'lab' && !s.indoorMode;
    const cam = s.camera;
    const m = LAB_ZONE;
    const props = labTheme
      ? labPropsInRegion(cam.x - m, cam.y - m, cam.x + this.screenW + m, cam.y + this.screenH + m)
      : [];
    const seen = new Set<string>();
    for (const p of props) {
      seen.add(p.id);
      let entry = this.propObjs.get(p.id);
      if (!entry) {
        const row = Math.floor(p.variant / 4) + 1, col = (p.variant % 4) + 1;
        const tex = getTexture(`lab-props/lab-prop2-r${row}-c${col}`);
        const sprite = new Sprite(tex ?? undefined);
        sprite.anchor.set(0.5, 1);
        sprite.tint = ENV_TINT; // 環境として暗く沈める(木/壁オブジェクトと同じ)
        sprite.x = p.footX;
        sprite.y = p.footY;
        sprite.zIndex = p.footY; // 足元Yでプレイヤー/敵とY-sort(背面は被る)
        this.L.actorLayer.addChild(sprite);
        const baseScale = tex ? containScale(PROP_DISPLAY_H, PROP_DISPLAY_H, tex.width, tex.height) : 1;
        entry = { sprite, baseScale, footY: p.footY };
        this.propObjs.set(p.id, entry);
      }
      entry.sprite.scale.set(entry.baseScale * this.depthScale(entry.footY));
      this.applyObstacleAlpha(entry.sprite, entry.footY);
    }
    for (const [id, entry] of this.propObjs) {
      if (!seen.has(id)) { entry.sprite.destroy(); this.propObjs.delete(id); }
    }
  }

  // ---- ステージ3(廃都)の散布オブジェクト: 木/壁オブジェクトと同じ足元アンカー方式。
  // 立ち物=actorLayer で footY を zIndex に Y-sort(背面は隠れる)。decal(血痕/小石)=groundLayer で
  // アクターの下に敷く(Y-sortなし)。当たり判定は store 側(大きい物だけ)。farBackdrop==='city' のみ。
  private syncCityProps() {
    const s = useGameStore.getState();
    const farKey = s.farBackdrop;
    const enabled = !s.indoorMode && !!STAGE_PROPS[farKey]; // city(廃都)/snow(雪原) など散布カタログがある時だけ
    const cam = s.camera;
    const m = CITY_ZONE;
    const props = enabled
      ? cityPropsInRegion(farKey, cam.x - m, cam.y - m, cam.x + this.screenW + m, cam.y + this.screenH + m)
      : [];
    const tint = this.envTintNow(); // 昼=本来色 / 夜=ENV_TINT
    const seen = new Set<string>();
    for (const p of props) {
      seen.add(p.id);
      const def = cityPropDef(farKey, p.variant);
      if (!def) continue;
      let entry = this.cityPropObjs.get(p.id);
      if (!entry) {
        const tex = getTexture(def.tex);
        const sprite = new Sprite(tex ?? undefined);
        sprite.anchor.set(0.5, 1);
        sprite.x = p.footX;
        sprite.y = p.footY;
        if (def.decal) {
          sprite.zIndex = 0;
          this.L.groundLayer.addChild(sprite); // 地面デカール=アクターの下・Y-sortなし
        } else {
          sprite.zIndex = p.footY; // 立ち物=足元Yでアクター/敵とY-sort
          this.L.actorLayer.addChild(sprite);
        }
        const baseScale = tex ? (def.displayH * p.scale) / tex.height : 1;
        entry = { sprite, baseScale, footY: p.footY };
        this.cityPropObjs.set(p.id, entry);
      }
      entry.sprite.tint = tint;
      entry.sprite.scale.set(entry.baseScale * this.depthScale(entry.footY));
      // 立ち物は裏回りで透ける。地面デカール(groundLayer)はプレイヤーの下なので通常alphaのまま。
      if (def.decal) entry.sprite.alpha = this.horizonActorAlpha(entry.footY);
      else this.applyObstacleAlpha(entry.sprite, entry.footY);
    }
    for (const [id, entry] of this.cityPropObjs) {
      if (!seen.has(id)) { entry.sprite.destroy(); this.cityPropObjs.delete(id); }
    }
  }

  // 研究所スキンの最前面オーバーレイ: 天井から吊られたケーブル帯を screen-space で画面上端に上寄せ配置。
  // 半透明(LAB_CEILING_ALPHA)。frontForest の直前(uiLayer の下)に置く=ゲームプレイ/前景森より手前。
  // アスペクト維持で画面幅にフィット(縦は溢れた透過部がクリップされるだけ)。lab テーマ以外は非表示。
  private updateLabCeiling(show: boolean) {
    const tex = show ? getTexture('lab/lab-ceiling-band') : null;
    if (!tex || LAB_CEILING_ALPHA <= 0) { if (this.labCeiling) this.labCeiling.visible = false; return; }
    if (!this.labCeiling) {
      const sp = new Sprite(tex);
      sp.anchor.set(0, 0); // 左上基準=上寄せ
      const parent = this.L.frontForest.parent!;
      parent.addChildAt(sp, parent.getChildIndex(this.L.frontForest) + 1); // frontForest の手前・uiLayer の下
      this.labCeiling = sp;
    }
    const sp = this.labCeiling;
    sp.visible = true;
    sp.texture = tex;
    sp.width = this.screenW;
    sp.height = this.screenW * (tex.height / tex.width); // アスペクト維持
    sp.position.set(0, 0);
    sp.alpha = LAB_CEILING_ALPHA;
  }

  // 可視可能ゾーン(研究所スキン): 画面全体を乗算で暗くし、プレイヤー/UVバー(=ハンドガン射程)に明かりの穴。
  // フィルタで一度テクスチャ化→whole を multiply 合成: 穴の中=通常の明るさ、外=急に暗い(LAB_VIS_DARK)。
  // 壁/敵/アイテムは uiLayer(このレイヤー)の下=暗所では見えづらくなる(社長指示)。
  // 背景4層を暗幕の上へ移す/戻す。lab時のみ上へ(=暗幕で暗くしない)。
  private setLabSceneryAboveVeil(above: boolean) {
    if (above) {
      if (!this.labVeilSprite) return; // 暗幕がまだなら次フレーム
      if (!this.labBrightScenery) this.labBrightScenery = new Container();
      const ui = this.L.uiLayer;
      const veilIdx = ui.getChildIndex(this.labVeilSprite);
      if (this.labBrightScenery.parent !== ui) ui.addChildAt(this.labBrightScenery, veilIdx + 1);
      else ui.setChildIndex(this.labBrightScenery, Math.min(veilIdx + 1, ui.children.length - 1));
      const cont = this.labBrightScenery;
      // 遠景(farBackdrop)・遠景森1(horizonForest)は暗幕の上へ退避しない=プレイヤー/ヘリの後ろのまま
      // (前へ退避するとプレイヤー/ヘリより前に被さるバグになる)。前景の近景森1/天井のみ前面へ。
      const items = [this.L.frontForest, this.labCeiling].filter(Boolean) as Container[];
      for (const obj of items) {
        if (obj.parent === cont) continue;
        if (obj.parent && !this.labSceneryOrig.some(o => o.obj === obj)) {
          this.labSceneryOrig.push({ obj, parent: obj.parent, index: obj.parent.getChildIndex(obj) });
        }
        cont.addChild(obj); // far→horizon→front→ceiling の順で奥→手前
      }
    } else if (this.labSceneryOrig.length) {
      for (const o of this.labSceneryOrig) {
        o.parent.addChildAt(o.obj, Math.min(o.index, o.parent.children.length));
      }
      this.labSceneryOrig = [];
      if (this.labBrightScenery?.parent) this.labBrightScenery.parent.removeChild(this.labBrightScenery);
    }
  }

  // 暗幕上端フェード用の縦グラデ(上=透明→下=不透明・白)。乗算tintで暗色化して使う。1回だけ生成してキャッシュ。
  private ensureVeilFadeTexture(): Texture {
    if (this.veilFadeTex) return this.veilFadeTex;
    if (typeof document === 'undefined') { this.veilFadeTex = Texture.WHITE; return this.veilFadeTex; }
    const h = 64;
    const c = document.createElement('canvas');
    c.width = 4; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) { this.veilFadeTex = Texture.WHITE; return this.veilFadeTex; }
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, h);
    this.veilFadeTex = Texture.from(c);
    return this.veilFadeTex;
  }

  private updateLabVisibility(show: boolean, sx: number, sy: number) {
    if (!show || !this.renderer) {
      if (this.labVeilSprite) this.labVeilSprite.visible = false;
      this.setLabSceneryAboveVeil(false); // 背景を元の位置へ戻す
      return;
    }
    const W = Math.max(1, Math.round(this.screenW));
    const H = Math.max(1, Math.round(this.screenH));
    // 描画先 RenderTexture(画面サイズ。リサイズで作り直し)。
    if (!this.labRT || this.labRT.width !== W || this.labRT.height !== H) {
      this.labRT?.destroy(true);
      this.labRT = RenderTexture.create({ width: W, height: H, antialias: false });
      if (this.labVeilSprite) this.labVeilSprite.texture = this.labRT;
    }
    // オフスクリーンの中身(暗幕 + erase 光ディスク)を用意。
    if (this.labDarkRect.parent !== this.labRTScene) {
      this.labDarkRect.tint = LAB_VIS_DARK;
      this.labDarkRect.alpha = LAB_VIS_ALPHA;
      this.labRTScene.addChild(this.labDarkRect);
    }
    if (this.labVeilFade.parent !== this.labRTScene) {
      this.labVeilFade.texture = this.ensureVeilFadeTexture();
      this.labVeilFade.tint = LAB_VIS_DARK;
      this.labVeilFade.alpha = LAB_VIS_ALPHA;
      this.labRTScene.addChild(this.labVeilFade); // dark rect と同じく erase ディスクより前(下)に置く
    }
    // 暗幕(可視ゾーン)は「地平より下=プレイ領域」だけを覆う。遠景/地平帯/遠景森2(景色)は暗くせず通常z(背面)のまま。?labveiltop=px。
    const veilTopOverride = tsNum('labveiltop', -1);
    const veilTop = veilTopOverride >= 0 ? veilTopOverride : this.farBackdropHeight();
    // 上端はソフトなグラデ帯でフェードイン(ハードな境界線を地平に固定すると揺れでズレて見えるため=社長指摘)。
    const fadeH = Math.max(8, Math.round(this.screenH * 0.08));
    this.labVeilFade.position.set(0, veilTop);
    this.labVeilFade.width = W;
    this.labVeilFade.height = fadeH;
    this.labDarkRect.position.set(0, veilTop + fadeH);
    this.labDarkRect.width = W;
    this.labDarkRect.height = Math.max(1, H - (veilTop + fadeH));
    // 画面に重ねる暗幕スプライト(=labRT)。uiLayer 最下=ワールドの上・HUDの下。
    if (!this.labVeilSprite) {
      const sp = new Sprite(this.labRT);
      sp.position.set(0, 0);
      this.L.uiLayer.addChildAt(sp, 0);
      this.labVeilSprite = sp;
    }
    // 穴位置(world→screen = world - camera + shake)。プレイヤー + 画面内のUVバー。
    const s = useGameStore.getState();
    const cam = s.camera;
    const pts: { x: number; y: number }[] = [
      { x: (s.player.x + s.player.width / 2) - cam.x + sx, y: (s.player.y + s.player.height / 2) - cam.y + sy },
    ];
    for (const p of s.breakableProps) {
      if (p.type !== 'uv-bar') continue;
      const px = p.footX - cam.x + sx, py = p.footY - cam.y + sy;
      if (px < -LAB_VIS_RANGE || px > W + LAB_VIS_RANGE || py < -LAB_VIS_RANGE || py > H + LAB_VIS_RANGE) continue;
      pts.push({ x: px, y: py });
    }
    const tex = getVisibilityLightTexture();
    while (this.labVisLights.length < pts.length) {
      const sp = new Sprite(tex);
      sp.anchor.set(0.5);
      sp.blendMode = 'erase'; // 暗幕のアルファを削る=円形の穴(なだらか)
      this.labRTScene.addChild(sp);
      this.labVisLights.push(sp);
    }
    // pts[0]=プレイヤー(一回り狭い), pts[1..]=UVバー(通常)。
    for (let i = 0; i < this.labVisLights.length; i++) {
      const sp = this.labVisLights[i];
      if (i < pts.length) {
        sp.visible = true;
        sp.position.set(pts[i].x, pts[i].y);
        sp.width = sp.height = (i === 0 ? LAB_VIS_RANGE_PLAYER : LAB_VIS_RANGE) * 2;
      } else {
        sp.visible = false;
      }
    }
    // オフスクリーン合成 → labRT(暗幕に円形の穴)。
    this.renderer.render({ container: this.labRTScene, target: this.labRT, clear: true });
    this.labVeilSprite.visible = true;
    this.labVeilSprite.width = W;
    this.labVeilSprite.height = H;
    // 景色レイヤーの前面載せ替えは廃止(暗幕を地平より下だけにしたので景色は元から暗くならない=通常z維持)。
    // 過去に載せ替えた分があれば元へ戻す。
    this.setLabSceneryAboveVeil(false);
  }

  // ドローンブーメランCD明け: プレイヤー頭上にブーメランマークが一瞬出て、ふわっと上へ消える。
  private updateBoomerangReadyMark(player: Player, now: number) {
    const g = this.boomReadyGfx;
    g.clear();
    const at = useGameStore.getState().boomerangReadyFxAt;
    const life = 650;
    const dt = now - at;
    if (at <= 0 || dt < 0 || dt > life) return;
    const t = dt / life;                       // 0→1
    const alpha = t < 0.18 ? t / 0.18 : 1 - (t - 0.18) / 0.82; // 立ち上がり速→ふわっと減衰
    const rise = -18 * t;                      // 上へ少し浮く
    const cx = player.x + player.width / 2;
    const cy = player.y - 46 + rise;           // 頭上(もう少し上)
    const s = 9 * (0.85 + 0.25 * t);           // 少しだけ拡大
    // 「ピカ!」フラッシュ: 出現直後に白く強く光って素早く消える(加算)。
    const flash = Math.max(0, 1 - dt / 170);
    if (flash > 0) {
      g.circle(cx, cy, 11 + 18 * (1 - flash)).fill({ color: 0xbfefff, alpha: 0.5 * flash });
      g.circle(cx, cy, 5).fill({ color: 0xffffff, alpha: 0.95 * flash });
    }
    // ブーメラン「へ」字マーク(シアン・加算で発光)。
    g.moveTo(cx - s, cy + s * 0.55).lineTo(cx, cy - s * 0.55).lineTo(cx + s, cy + s * 0.55)
      .stroke({ width: 3.0, color: 0x9be8ff, alpha: Math.max(0, alpha), cap: 'round', join: 'round' });
  }

  // マークスマン射程上昇の発動マーク: ブーメランの頭上マークと同じ「一瞬出て消える」ノリで、
  // プレイヤー頭上にターゲット(照準)マーク=円＋十字を出す。緑系で「射程UP」を示す。
  private updateMarksmanRangeMark(player: Player, now: number) {
    const g = this.marksmanMarkGfx;
    g.clear();
    const at = useGameStore.getState().marksmanRangeFxAt;
    const life = 650;
    const dt = now - at;
    if (at <= 0 || dt < 0 || dt > life) return;
    const t = dt / life;                       // 0→1
    const alpha = t < 0.18 ? t / 0.18 : 1 - (t - 0.18) / 0.82;
    const a = Math.max(0, alpha);
    const cx = player.x + player.width / 2;
    const cy = player.y - 46 - 18 * t;         // 頭上(ブーメランと同じ高さ)＋少し浮上
    const r = 9 * (0.85 + 0.35 * t);           // 少し拡大
    const color = 0x86efac;                    // 移動速度UP=緑
    // 出現フラッシュ。
    const flash = Math.max(0, 1 - dt / 170);
    if (flash > 0) g.circle(cx, cy, 12 + 16 * (1 - flash)).fill({ color: 0xbbf7d0, alpha: 0.45 * flash });
    // 移動速度UPの「ブーツ」マーク(L字シルエット・つま先は右向き)。
    const sw = r * 0.62;                         // 筒の幅
    const top = cy - r * 1.25;                   // 筒の上端
    const ankle = cy + r * 0.35;                 // 足首
    const sole = cy + r * 0.95;                  // 靴底
    const toe = cx + r * 1.45;                   // つま先
    g.poly([
      cx - sw, top,
      cx + sw, top,
      cx + sw, ankle,
      toe, sole - r * 0.32,
      toe, sole,
      cx - sw, sole,
    ]).fill({ color, alpha: a * 0.92 });
    g.poly([
      cx - sw, top,
      cx + sw, top,
      cx + sw, ankle,
      toe, sole - r * 0.32,
      toe, sole,
      cx - sw, sole,
    ]).stroke({ width: 1.2, color: 0x14532d, alpha: a * 0.8 });
    // 靴底のハイライト(スピード感の白線)。
    g.moveTo(cx - sw, sole).lineTo(toe, sole).stroke({ width: 1.4, color: 0xeafff1, alpha: a });
  }

  // 特殊行動の予告。ジャンプ着地点(赤い影)＋ダッシュの移動先(赤ライン=直線距離)。
  private syncPumpkinTelegraph(enemies: Enemy[], now: number) {
    const g = this.pumpkinTelegraph;
    g.clear();
    const pulse = 0.5 + 0.5 * Math.sin(now / 110);
    for (const e of enemies) {
      // ジャンプ着地予告(パンプキン/lab-zombie-3/ジャイアントバット)。
      if (e.aiPhase === 'jump' && (e.type === 'pumpkin' || e.type === 'lab-zombie-3' || e.type === 'giantbat')) {
        const tx = (e.aiTargetX ?? e.x) + e.width / 2;
        const ty = (e.aiTargetY ?? e.y) + e.height / 2;
        const R = PUMPKIN_EXPLOSION_RADIUS;
        g.ellipse(tx, ty, R, R * 0.55).fill({ color: 0xff2a2a, alpha: 0.16 + 0.12 * pulse });
        g.ellipse(tx, ty, R, R * 0.55).stroke({ width: 2, color: 0xff3b3b, alpha: 0.45 + 0.3 * pulse });
        continue;
      }
      // ダッシュ突進予告(犬/lab-zombie-2/ジャイアントバット): 溜め中(windup)に移動先まで赤ラインで距離表示。
      if (e.aiPhase === 'windup' && (e.type === 'werewolf' || e.type === 'lab-zombie-2' || e.type === 'giantbat')
          && e.aiTargetX !== undefined && e.aiTargetY !== undefined) {
        const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
        const tx = e.aiTargetX, ty = e.aiTargetY; // dash の狙い点は中心座標
        const a = 0.45 + 0.4 * pulse;
        // 太い半透明の下地＋細い明るい芯のラインで「突進経路」を強調。
        g.moveTo(ex, ey).lineTo(tx, ty).stroke({ width: 6, color: 0xff2a2a, alpha: a * 0.4, cap: 'round' });
        g.moveTo(ex, ey).lineTo(tx, ty).stroke({ width: 2, color: 0xff5a5a, alpha: a, cap: 'round' });
        // 終点に着弾リング。
        g.circle(tx, ty, 9 + 3 * pulse).stroke({ width: 2, color: 0xff5a5a, alpha: a });
      }
    }
  }

  private syncBreakableProps(props: BreakableProp[], now: number) {
    const seen = new Set<string>();
    for (const prop of props) {
      seen.add(prop.id);
      let view = this.breakableProps.get(prop.id);
      if (!view) {
        view = this.makeProp();
        this.breakableProps.set(prop.id, view);
      }
      this.drawBreakableProp(view, prop, now);
    }
    for (const [id, view] of this.breakableProps) {
      if (!seen.has(id)) {
        view.light.destroy();
        view.reflection.destroy();
        view.container.destroy({ children: true });
        this.breakableProps.delete(id);
      }
    }
  }

  private drawGroundReflection(
    g: Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    color: number | string,
    alpha: number
  ) {
    if (!GROUND_REFLECTION_ENABLED || alpha <= 0) return;
    g.ellipse(x, y, width * 0.5, height * 0.5).fill({ color, alpha });
    g.ellipse(x, y, width * 0.28, height * 0.34).fill({ color: 0xffffff, alpha: alpha * 0.22 });
  }

  private syncGroundReflections(
    pickups: Pickup[],
    projectiles: Projectile[],
    effects: VisualEffect[],
    camera: { x: number; y: number },
    now: number
  ) {
    const g = this.groundReflectionGfx;
    g.clear();
    if (!GROUND_REFLECTION_ENABLED) return;

    for (const p of pickups) {
      if (p.type === 'experience') continue;
      const pos = pickupDisplayPosition(p, now);
      const footY = pos.y + 16;
      const horizonAlpha = this.horizonActorAlpha(footY);
      if (horizonAlpha <= 0) continue;
      const bob = Math.sin(now / 300 + p.x * 0.01) * 2;
      const pulse = 0.78 + 0.22 * Math.sin(now / 260 + p.x * 0.018);
      let color: number | null = null;
      let strength = 0;
      // Note: 'experience' pickups are skipped via the `continue` above, so
      // they never reach this glow-color switch.
      if (p.type === 'magnet') {
        color = 0x60a5fa;
        strength = 0.8;
      } else if (p.type === 'bomb') {
        color = 0xfde047;
        strength = 0.85;
      } else if (p.type === 'weapon-crate' || p.type === 'weapon-drop') {
        color = 0xbfdbfe;
        strength = 0.62;
      }
      if (color == null) continue;
      const d = this.depthScale(footY);
      this.drawGroundReflection(
        g,
        pos.x + 8,
        footY + 2 * d,
        52 * d * strength * pulse,
        13 * d * strength,
        color,
        GROUND_REFLECTION_ALPHA * horizonAlpha * strength * (1 - Math.max(0, bob) * 0.03)
      );
    }

    for (const p of projectiles) {
      if (p.createdAt > now) continue;
      const cx = p.x + p.width / 2;
      const cy = p.y + p.height / 2;
      const horizonAlpha = this.horizonActorAlpha(cy);
      if (horizonAlpha <= 0) continue;
      const color =
        p.reflected || p.crit ? 0xfde047 :
          p.weaponType === 'shotgun' ? 0xfdba74 :
            p.weaponType === 'enemy_bolt' ? 0xef4444 :
              0xfef3c7;
      const d = this.depthScale(cy);
      this.drawGroundReflection(
        g,
        cx,
        cy + 6 * d,
        (p.weaponType === 'rifle' ? 46 : 34) * d,
        8 * d,
        color,
        GROUND_REFLECTION_ALPHA * 0.9 * horizonAlpha
      );
    }

    for (const e of effects) {
      if (e.kind !== 'glow') continue;
      if (!this.isPointNearViewport(e.x, e.y, camera, e.radius + EFFECT_VIEWPORT_MARGIN)) continue;
      const t = Math.min(1, (now - e.createdAt) / e.duration);
      const horizonAlpha = this.horizonActorAlpha(e.y);
      if (t >= 1 || horizonAlpha <= 0) continue;
      const d = this.depthScale(e.y);
      this.drawGroundReflection(
        g,
        e.x,
        e.y + 8 * d,
        Math.min(160, e.radius * 1.45) * d,
        Math.min(32, e.radius * 0.3) * d,
        `${e.color}1)`,
        GROUND_REFLECTION_ALPHA * 1.15 * (1 - t) * horizonAlpha
      );
    }
  }

  private syncLocalEventLighting(
    effects: VisualEffect[],
    player: Player,
    enemies: Enemy[],
    props: BreakableProp[],
    castle: CastleEvent,
    merchant: WeaponMerchant,
    eventNpc: EventQuestNpc,
    camera: { x: number; y: number },
    now: number
  ) {
    const g = this.localEventShadeGfx;
    g.clear();

    for (const e of effects) {
      if (e.kind !== 'glow' || e.radius < STRONG_GLOW_RADIUS) continue;
      const t = Math.min(1, (now - e.createdAt) / e.duration);
      const life = 1 - t;
      const horizonAlpha = this.horizonActorAlpha(e.y);
      if (life <= 0 || horizonAlpha <= 0) continue;

      const d = this.depthScale(e.y);
      const shadeAlpha = LOCAL_EVENT_SHADE_ALPHA * life * horizonAlpha;
      const lightX = Math.round(e.x);
      const lightY = Math.round(e.y);
      const rx = e.radius * 2.55 * d;
      const ry = e.radius * 1.04 * d;

      // Soft local contrast under the light source. Avoid a visible dark rim
      // around the glow; the cast shadows below should read as coming from
      // actors/props, not from the edge of the light disc.
      g.ellipse(lightX, lightY + Math.round(18 * d), rx * 1.1, ry * 0.9)
        .fill({ color: 0x000000, alpha: shadeAlpha * 0.22 });

      type CastShadow = {
        x: number;
        y: number;
        w: number;
        falloff: number;
        horizonAlpha: number;
        strength: number;
      };
      const reach = e.radius * LOCAL_EVENT_SHADOW_REACH_MULT;
      const castActors: CastShadow[] = [];
      const isNearScreen = (x: number, y: number, pad = 150) =>
        x >= camera.x - pad &&
        x <= camera.x + this.screenW + pad &&
        y >= camera.y - pad &&
        y <= camera.y + this.screenH + pad;
      const addCaster = (x: number, y: number, w: number, strength = 1) => {
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w)) return;
        if (!isNearScreen(x, y)) return;
        const actorHorizonAlpha = this.horizonActorAlpha(y);
        if (actorHorizonAlpha <= 0) return;
        const dx = x - lightX;
        const dy = y - lightY;
        const dist = Math.hypot(dx, dy);
        if (dist < 1 || dist > reach) return;
        castActors.push({
          x,
          y,
          w,
          falloff: 1 - dist / reach,
          horizonAlpha: actorHorizonAlpha,
          strength,
        });
      };

      const playerBox = playerFootBox(player);
      addCaster(
        playerBox.footX,
        playerBox.footY,
        playerBox.boxW * 0.55 * this.depthScale(playerBox.footY),
        1.12
      );
      for (const enemy of enemies) {
        const box = enemyFootBox(enemy);
        const bossWeight = enemy.type === 'reaper' || enemy.type === 'giantbat' || enemy.type === 'pumpkin'
          ? 1.28
          : 1;
        addCaster(box.footX, box.footY, box.boxW * 0.55 * this.depthScaleEnemy(box.footY), bossWeight);
      }
      for (const prop of props) {
        const propWeight = prop.type === 'torch' ? 0.82 : 0.62;
        const d = this.depthScale(prop.footY);
        const shadowW = prop.type === 'mine'
          ? 16 * prop.scale * d
          : TORCH_VISUAL_W * prop.scale * d * 0.55;
        addCaster(prop.footX, prop.footY, shadowW, propWeight);
      }
      for (const tree of this.trees.values()) {
        addCaster(tree.sprite.x, tree.footY, 48 * TREE_VISUAL_SCALE * this.depthScale(tree.footY) * 0.36, 0.72);
      }
      // ただのオブジェクト(壊せない: トラック/瓦礫/ドラム=city props、ラボの壁/什器)も影を落とす(グローは無し)。
      // 地面デカール(groundLayer 配置・平面)は除外。影幅は表示幅から算出。
      for (const entry of this.cityPropObjs.values()) {
        if (entry.sprite.parent === this.L.groundLayer) continue; // 地面デカールは影なし
        addCaster(entry.sprite.x, entry.footY, Math.max(6, entry.sprite.width * 0.32), 0.6);
      }
      for (const entry of this.wallObjs.values()) {
        addCaster(entry.sprite.x, entry.footY, Math.max(6, entry.sprite.width * 0.3), 0.55);
      }
      for (const entry of this.propObjs.values()) {
        addCaster(entry.sprite.x, entry.footY, Math.max(6, entry.sprite.width * 0.32), 0.6);
      }
      addCaster(castle.x, castle.y + CASTLE_FOOT_OFFSET_Y, 90 * this.depthScale(castle.y + CASTLE_FOOT_OFFSET_Y), castle.bossSpawned ? 1.15 : 0.82);
      addCaster(merchant.x, merchant.y, 82 * this.depthScale(merchant.y), 0.9);
      if (eventNpc.status !== 'completed') {
        addCaster(eventNpc.x, eventNpc.y, 76 * this.depthScale(eventNpc.y), 0.9);
      }

      castActors
        .sort((a, b) => (b.falloff * b.strength) - (a.falloff * a.strength))
        .slice(0, LOCAL_EVENT_MAX_CAST_SHADOWS)
        .forEach(actor => {
          const actorX = Math.round(actor.x);
          const actorY = Math.round(actor.y);
          const dx = actorX - lightX;
          const dy = actorY - lightY;
          const falloff = actor.falloff;
          const groundDx = dx;
          const groundDy = dy * 0.6;
          const groundDist = Math.hypot(groundDx, groundDy) || 1;
          const nx = groundDx / groundDist;
          const ny = groundDy / groundDist;
          const actorDepth = this.depthScale(actor.y);
          const len = (118 + e.radius * 1.9) * falloff * actorDepth * Math.min(1.55, actor.strength);
          const shadowRadiusX = Math.max(4, actor.w * 0.55);
          const shadowRadiusY = Math.max(1.5, actor.w * 0.18);
          const alpha = LOCAL_EVENT_SHADOW_ALPHA * life * falloff * actor.horizonAlpha * horizonAlpha * actor.strength;
          const startX = actorX + nx * Math.min(3, shadowRadiusX * 0.12);
          const startY = actorY + ny * Math.min(2, shadowRadiusY * 0.35) - 1;
          const castThickness = Math.hypot(shadowRadiusX * ny, shadowRadiusY * nx) * 2;
          g.ellipse(actorX, actorY - 1, shadowRadiusX, shadowRadiusY)
            .fill({ color: 0x000000, alpha: alpha * 0.72 });
          [
            { distance: 0.95, width: 1.1, alpha: 0.12 },
            { distance: 0.62, width: 1, alpha: 0.25 },
            { distance: 0.36, width: 0.92, alpha: 0.48 },
          ].forEach(shadow => {
            const endX = startX + nx * len * shadow.distance;
            const endY = startY + ny * len * shadow.distance;
            g.moveTo(startX, startY)
              .lineTo(endX, endY)
              .stroke({
                width: Math.max(2, castThickness * shadow.width),
                color: 0x000000,
                alpha: alpha * shadow.alpha,
                cap: 'round',
              });
          });
        });
    }
  }

  private drawBreakableProp(view: PropView, prop: BreakableProp, now: number) {
    if (prop.type === 'mine') {
      const d = this.depthScale(prop.footY);
      const horizonAlpha = this.horizonActorAlpha(prop.footY);
      const pulse = 0.72 + 0.28 * Math.sin(now / 320 + prop.footX * 0.04);
      const w = 16 * prop.scale * d;
      const h = 13 * prop.scale * d;

      view.container.zIndex = prop.footY;
      view.container.alpha = horizonAlpha;
      view.sprite.visible = false;
      view.light.visible = false;
      view.reflection.visible = false;

      const g = view.flame;
      g.clear();
      const x = Math.round(prop.footX);
      const y = Math.round(prop.footY - h * 0.62);
      if (horizonAlpha > 0) {
        const sx = x + w * 0.42;
        const sy = y + h * 0.34;
        const sw = w * 0.48;
        const sh = h * 0.55;
        g.ellipse(x, prop.footY - h * 0.03, w * 0.82, h * 0.28)
          .fill({ color: 0x07100a, alpha: 0.38 });
        g.ellipse(sx, sy + sh * 0.43, sw * 0.42, sh * 0.18)
          .fill({ color: 0x07100a, alpha: 0.3 });
        g.ellipse(sx, sy + sh * 0.14, sw * 0.35, sh * 0.48)
          .fill({ color: 0x0b2113, alpha: 0.9 });
        g.ellipse(sx - sw * 0.05, sy + sh * 0.06, sw * 0.26, sh * 0.36)
          .fill({ color: 0x24351f, alpha: 0.78 });
        g.ellipse(sx + sw * 0.08, sy - sh * 0.02, sw * 0.13, sh * 0.18)
          .fill({ color: 0x8a9164, alpha: 0.1 + 0.06 * pulse });
        g.ellipse(x, y + h * 0.24, w * 0.44, h * 0.62)
          .fill({ color: 0x0b2113, alpha: 0.92 });
        g.ellipse(x - w * 0.04, y + h * 0.14, w * 0.34, h * 0.48)
          .fill({ color: 0x24351f, alpha: 0.86 });
        g.ellipse(x + w * 0.08, y + h * 0.08, w * 0.22, h * 0.34)
          .fill({ color: 0x52633a, alpha: 0.13 + 0.08 * pulse });
        g.ellipse(x - w * 0.13, y - h * 0.1, w * 0.12, h * 0.16)
          .fill({ color: 0x8a9164, alpha: 0.14 + 0.08 * pulse });
        g.circle(x + w * 0.22, y + h * 0.2, Math.max(1.1, 1.4 * d * prop.scale))
          .fill({ color: 0x11170d, alpha: 0.46 });
      }

      const o = view.overlay;
      o.clear();
      if (now - prop.lastHit < 90) {
        o.circle(x, y, Math.max(13, w * 0.62)).fill({ color: 0xffffff, alpha: 0.28 });
      }
      return;
    }

    if (prop.type === 'uv-bar') {
      // UVライトバー(松明と同じ扱い=破壊可能)。バー本体+紫グロー。container.zIndex=footY で
      // 木/敵と深度ソート(裏に回り込むと上に被る)。当たり判定は無し(屋内移動は壁/プロップのみ)。
      const d = this.depthScale(prop.footY);
      const horizonAlpha = this.horizonActorAlpha(prop.footY);
      const tex = getTexture('lab-uv-bar');
      view.container.zIndex = prop.footY;
      view.container.alpha = horizonAlpha;
      view.reflection.visible = false;
      view.flame.clear();
      view.sprite.visible = !!tex;
      if (tex) {
        view.sprite.texture = tex;
        view.sprite.position.set(Math.round(prop.footX), Math.round(prop.footY));
        view.sprite.scale.set(containScale(22, 13, tex.width, tex.height) * d); // 1/5サイズ
      }
      // 紫グロー(広く弱く=周囲を照らす)。加算スプライト。ハイライトは抑え、暗部を紫がかって少し明るく。
      view.light.visible = true;
      view.light.position.set(prop.footX, prop.footY - 4 * d);
      view.light.tint = 0x9a4fd6;
      const uvPulse = 0.22 + 0.06 * Math.sin(now * 0.0018 + prop.footX * 0.05); // ピーク控えめ(~0.28)
      view.light.width = view.light.height = 190 * d; // 広めに敷いて周囲を照らす
      view.light.alpha = uvPulse * horizonAlpha;
      const o = view.overlay;
      o.clear();
      if (now - prop.lastHit < 90) {
        o.circle(Math.round(prop.footX), Math.round(prop.footY - 8 * d), 16 * d).fill({ color: 0xffffff, alpha: 0.3 });
      }
      return;
    }

    // ステージ4は松明を焚き火に置き換え(破壊可能・炎エフェクトはこのまま流用)。torch型のみ。
    const campfire = this.snowStage && prop.type === 'torch';
    const tex = campfire ? (getTexture('props/stage4-campfire') ?? getTexture(prop.type)) : getTexture(prop.type);
    const d = this.depthScale(prop.footY);
    const visualW = (campfire ? CAMPFIRE_VISUAL_W : TORCH_VISUAL_W) * prop.scale;
    const visualH = (campfire ? CAMPFIRE_VISUAL_H : TORCH_VISUAL_H) * prop.scale;
    const sc = tex ? containScale(visualW, visualH, tex.width, tex.height) * d : d;
    const horizonAlpha = this.horizonActorAlpha(prop.footY);
    const flameX = Math.round(prop.footX);
    // 松明=先端(高い)/焚き火=台の中央付近(低い)に炎を置く。
    const flameY = Math.round(prop.footY - visualH * d * (campfire ? 0.42 : 0.72));
    const viewportDistance = this.distanceOutsideViewport(prop.footX, prop.footY, TORCH_VIEWPORT_MARGIN);
    const visibleTorch = viewportDistance <= 0 && horizonAlpha > 0;
    const outsideScreenDistance = this.distanceOutsideViewport(prop.footX, prop.footY, 0);
    const farFade = 1 - Math.max(0, Math.min(1, outsideScreenDistance / TORCH_FAR_FADE_MARGIN));
    const torchAlpha = horizonAlpha * (0.84 + 0.16 * farFade);
    // 不規則な炎の揺らぎ: 2つの異なる周期を合成して単調なサインに見えないようにする。
    const pulse = visibleTorch
      ? 0.80 + 0.13 * Math.sin(now / 125 + prop.footX * 0.03) + 0.07 * Math.sin(now / 53 + prop.footY * 0.05)
      : 0.94;

    view.container.zIndex = prop.footY;
    view.container.alpha = torchAlpha;
    view.sprite.position.set(Math.round(prop.footX), Math.round(prop.footY));
    view.sprite.visible = !!tex && visibleTorch;
    if (tex) {
      view.sprite.texture = tex;
      view.sprite.scale.set(sc);
    }

    if (!visibleTorch) {
      view.light.visible = false;
      view.reflection.visible = false;
      view.flame.clear();
      view.overlay.clear();
      return;
    }

    view.light.visible = true;
    view.light.position.set(prop.footX, flameY + 6);
    view.light.tint = 0xffb45f;
    view.light.width = TORCH_LIGHT_RADIUS * d * pulse * 2;
    view.light.height = TORCH_LIGHT_RADIUS * d * pulse * 1.45;
    view.light.alpha = 0.18 * torchAlpha * pulse * (0.84 + 0.16 * farFade);

    // 地面の光だまり(reflection を活用): 暗いベースの上で松明が光源として読めるよう、
    // 従来より広く・丸く・少し濃く。揺らぎで微かに脈動。
    view.reflection.visible = true;
    view.reflection.position.set(prop.footX, prop.footY + 3 * d);
    view.reflection.tint = 0xff9f1c;
    view.reflection.width = TORCH_REFLECTION_W * d * prop.scale * (1.5 + 0.16 * pulse);
    view.reflection.height = TORCH_REFLECTION_H * d * prop.scale * (1.35 + 0.18 * pulse);
    view.reflection.alpha = 0.24 * torchAlpha * (0.82 + 0.18 * farFade) * (0.9 + 0.1 * pulse);

    const f = view.flame;
    f.clear();
    if (torchAlpha > 0) {
      const r = 5.5 * d * prop.scale * pulse;
      const sway = Math.sin(now / 160 + prop.footX * 0.015) * r * 0.55;
      f.circle(flameX, flameY + 3, r * 5.1).fill({ color: 0xff9f1c, alpha: 0.09 });
      f.ellipse(flameX + sway * 0.12, flameY - r * 0.6, r * 2.4, r * 4.4)
        .fill({ color: 0xff7a18, alpha: 0.22 });
      f.ellipse(flameX + sway * 0.36, flameY - r * 2.1, r * 1.45, r * 3.7)
        .fill({ color: 0xfbbf24, alpha: 0.34 });
      f.ellipse(flameX + sway * 0.55, flameY - r * 3.1, r * 0.72, r * 2.15)
        .fill({ color: 0xffedd5, alpha: 0.48 });
      f.circle(flameX + sway * 0.25, flameY - r * 0.35, r * 1.2)
        .fill({ color: 0xffffff, alpha: 0.28 });
      for (let i = 0; i < TORCH_EMBER_COUNT; i++) {
        const seed = prop.footX * 0.021 + prop.footY * 0.007 + i * 1.931;
        const rise = ((now / (760 + i * 73) + seed) % 1);
        const drift = Math.sin(now / (230 + i * 29) + seed * 9) * r * (0.9 + i * 0.12);
        const ex = flameX + drift;
        const ey = flameY - r * (1.7 + rise * 9.5);
        const emberAlpha = torchAlpha * Math.sin(rise * Math.PI) * (0.18 + (i % 3) * 0.05);
        const emberR = r * (0.22 + (i % 3) * 0.08);
        f.circle(ex, ey, emberR * 2.4).fill({ color: 0xff9f1c, alpha: emberAlpha * 0.28 });
        f.circle(ex, ey, emberR).fill({ color: i % 2 === 0 ? 0xfef3c7 : 0xfbbf24, alpha: emberAlpha });
      }
    }

    const o = view.overlay;
    o.clear();
    if (now - prop.lastHit < 90) {
      o.circle(prop.footX, prop.footY - visualH * d * 0.48, Math.max(14, visualW * d * 0.45))
        .fill({ color: 0xffffff, alpha: 0.34 });
    }
  }

  // ---- foot shadows (player + enemies) into one graphics -------------------

  // ソフト影スプライトを1体ぶん配置(光方向へ回転+伸縮)。drawDirectionalShadow の
  // 幾何(足元から direction へ length 伸ばす / 太さは断面)をスプライトで再現する。
  private placeShadowSprite(id: string, footX: number, footY: number, w: number, alpha: number, seen: Set<string>, tint = 0x000000, alphaMult = 1) {
    if (alpha <= 0) return;
    const lighting = this.lighting();
    // ステージ2(lab)だけ影を右向きに(社長指示)。長さ/濃さは preset 据え置き。
    const dir = this.isLabStage ? LAB_SHADOW_DIRECTION : lighting.direction;
    const mag = Math.hypot(dir.x, dir.y) || 1;
    const ux = dir.x / mag;
    const uy = dir.y / mag;
    const scale = Math.max(0.7, Math.min(1.55, w / 42));
    const length = lighting.shadowLength * scale;               // 光方向への伸び
    const radiusX = w * 0.55;
    const radiusY = w * 0.18;
    const width = Math.max(3, Math.hypot(radiusX * uy, radiusY * ux) * 2); // 断面(太さ)
    seen.add(id);
    let sp = this.shadowPool.get(id);
    if (!sp) {
      sp = new Sprite(getSoftShadowTexture());
      sp.anchor.set(0.5, 0.5);
      this.shadowContainer.addChild(sp);
      this.shadowPool.set(id, sp);
    }
    sp.tint = tint; // 既定=黒。色付き個体は青/紫/赤に染める。
    sp.rotation = Math.atan2(uy, ux);
    sp.width = length + width;   // 全長 = 基部ブロブ + 伸び
    sp.height = width;           // 太さ
    sp.alpha = Math.min(1, alpha * lighting.shadowAlpha * alphaMult);
    // 中心を足元から光方向へ length/2 ずらし、足元→先端に伸びるように。
    sp.position.set(footX + ux * (length * 0.5), footY - 1 + uy * (length * 0.5));
    sp.visible = true;
  }

  // ヘリ中心(world)と表示縮尺。離脱(上昇)前の基準。drawPlayer の乗車位置と syncIntroHelicopter で共有し、
  // キャラの足元をこの中心から一定オフセット(ドア)へピン留めする(height 経由のドリフトを排除)。
  private introHeliBase(player: Player, t: number): { cx: number; cy: number; scale: number } {
    const off = playerIntroOffset(t);
    const introScale = playerIntroScale(t);
    return {
      cx: player.x + player.width / 2 + off.x,
      cy: player.y + player.height / 2 + off.y - heliAboveAt(t) * introScale,
      scale: introScale,
    };
  }

  // 登場演出のヘリ。
  //  フェーズA(飛来): プレイヤーを乗せて遠く高くから随伴(同じ縮尺で拡大しながら降下)。
  //  フェーズB(ジャンプ着地): プレイヤーが飛び降りる→ヘリは上へ逃げて横ドリフト+フェードアウト。
  // 画像 'helicopter' が未登録なら何もしない(画像受領後に表示)。
  private syncIntroHelicopter(player: Player, now: number) {
    const tex = getTexture('helicopter');
    if (!this.introActive || !tex) {
      this.helicopter.visible = false;
      return;
    }
    const t = this.introUntil === -1
      ? 0
      : Math.max(0, Math.min(1, 1 - (this.introUntil - now) / PLAYER_INTRO_MS));
    if (this.helicopter.texture !== tex) this.helicopter.texture = tex;
    const baseSc = tex.height > 0 ? HELI_DISPLAY_H / tex.height : 1;
    // 飛び降り時点(jumpOffT)。飛び降り後はヘリを「その場でホバー固定」する(プレイヤーの着地ダッシュ
    // 軌道=off を参照し続けると一緒に飛んで行ってしまうため)。基準位置はこの t で凍結。
    const hf = PLAYER_INTRO_HELI_FRAC;
    const jumpOffT = hf * HELI_RIDE_RELEASE_FROM;
    const baseT = Math.min(t, jumpOffT);            // 飛び降り後はホバー位置で固定
    const base = this.introHeliBase(player, baseT); // ヘリ中心(world)+縮尺
    // 飛び降りから HELI_DEPART_DELAY_MS 待ってから離脱(上昇+横ドリフト+フェード)。
    const releaseStart = jumpOffT + HELI_DEPART_DELAY_MS / PLAYER_INTRO_MS;
    const depart = t <= releaseStart ? 0 : Math.min(1, (t - releaseStart) / (1 - releaseStart));
    const dEase = depart * depart;
    // 離脱中は少し拡大して画面外へ抜ける感じ。
    const sc = baseSc * (base.scale + 0.35 * dEase);
    // 画像は左向きなので X 反転して右向きに(進行=右へ飛来)。
    this.helicopter.scale.set(-sc, sc);
    this.helicopter.position.set(
      base.cx + HELI_DRIFT_X * dEase,
      base.cy - HELI_RISE * dEase,
    );
    this.helicopter.rotation = 0.12 * dEase; // 逃げる時に少し機体を傾ける
    this.helicopter.alpha = 1 - dEase;       // 上へ逃げながらフェード(終盤で消える)
    this.helicopter.visible = this.helicopter.alpha > 0.02;
  }

  // 設置物の影幅(= スプライト実描画幅 × 0.55。アクターと同じ基準に揃える)。
  // p.width(ヒットボックス)ではなく見た目の大きさからテクスチャ比で算出する。
  private placedWeaponShadowWidth(p: Projectile): number {
    if (p.weaponType === 'turret') return 26; // Graphics砲台(本体~22px)相当
    if (p.weaponType === 'decoy') {
      const tex = getTexture('decoy');
      const rw = tex && tex.height > 0 ? tex.width * (DECOY_DISPLAY_H / tex.height) : p.width;
      return rw * 0.55;
    }
    if (p.weaponType === 'shield') {
      const tex = getTexture('shield-down');
      const rw = tex && tex.height > 0 ? tex.width * (SHIELD_DISPLAY_H / tex.height) : p.width;
      return rw * 0.55;
    }
    return p.width * 0.55;
  }

  private syncShadows(
    player: Player,
    enemies: Enemy[],
    summons: Summon[],
    projectiles: Projectile[]
  ) {
    const seen = new Set<string>();
    // 登場演出中はプレイヤーが空中なので足影は出さない(着地後に出る)。
    if (!this.introActive) {
      const pf = playerFootBox(player);
      const playerFallbackW = pf.boxW * 0.55 * this.depthScale(pf.footY);
      const playerShadowW = actorShadowWidthFromSprite(this.playerView, playerFallbackW) * PLAYER_SHADOW_SCALE;
      this.placeShadowSprite('__player__', pf.footX, pf.footY - 2, playerShadowW, 1, seen);
    }
    for (const e of enemies) {
      if (e.type === 'ghost') continue;
      const fb = enemyFootBox(e);
      const footY = e.y + e.height;
      const horizonAlpha = this.horizonActorAlpha(footY);
      if (horizonAlpha <= 0) continue;
      // 裏ボスは絵が巨大で当たり判定(帯)と分離しているので、影も帯=当たり判定の幅を基準にする(社長指示)。
      const fallbackW = fb.boxW * 0.55 * this.depthScaleEnemy(footY);
      const shadowW = isHiddenBoss(e.type)
        ? e.width
        : actorShadowWidthFromSprite(this.enemies.get(e.id), fallbackW);
      // 色付き個体は影を色で染める(青<紫<赤)。本体の見た目は変えない。
      const ct = e.colorTier ? ENEMY_COLOR_TIER_SHADOW[e.colorTier] : undefined;
      // 裏ボスの影は「濃い暗赤」(社長指示)。tint=暗い赤・alphaMult を上げて濃く。
      const shadowTint = isHiddenBoss(e.type) ? 0x5a0000 : (ct?.tint ?? 0x000000);
      const shadowAlphaMult = isHiddenBoss(e.type) ? 1.7 : (ct?.alphaMult ?? 1);
      this.placeShadowSprite(e.id, e.x + e.width / 2, footY - 2, shadowW, horizonAlpha, seen, shadowTint, shadowAlphaMult);
    }
    // 召喚(味方ユニット)も敵と同じ方向影で揃える。
    for (const s of summons) {
      const fb = summonFootBox(s);
      const horizonAlpha = this.horizonActorAlpha(fb.footY);
      if (horizonAlpha <= 0) continue;
      const fallbackW = fb.boxW * 0.55 * this.depthScaleEnemy(fb.footY);
      const shadowW = actorShadowWidthFromSprite(this.summonViews.get(s.id), fallbackW);
      this.placeShadowSprite('sum:' + s.id, fb.footX, fb.footY - 2, shadowW, horizonAlpha, seen);
    }
    // 設置型ウェポン(盾/デコイ/タレット)にも接地影を付ける。
    for (const p of projectiles) {
      if (p.weaponType !== 'shield' && p.weaponType !== 'decoy' && p.weaponType !== 'turret') continue;
      const footY = p.y + p.height;
      const horizonAlpha = this.horizonActorAlpha(footY);
      if (horizonAlpha <= 0) continue;
      this.placeShadowSprite('pw:' + p.id, p.x + p.width / 2, footY - 2, this.placedWeaponShadowWidth(p), horizonAlpha, seen);
    }
    // 商人 / イベントNPC(各 sync が可視時にリクエストを立てる)。
    if (this.merchantShadow) {
      const m = this.merchantShadow;
      this.placeShadowSprite('merchant', m.x, m.y, m.w, m.alpha, seen);
    }
    if (this.npcShadow) {
      const n = this.npcShadow;
      this.placeShadowSprite('npc', n.x, n.y, n.w, n.alpha, seen);
    }
    // 城(可視時のみ syncCastle がリクエスト)。
    if (this.castleShadow) {
      const c = this.castleShadow;
      this.placeShadowSprite('castle', c.x, c.y, c.w, c.alpha, seen);
    }
    // 拾い物(syncPickups が毎フレーム配列を作り直す)。
    for (const ps of this.pickupShadows) {
      this.placeShadowSprite(ps.id, ps.x, ps.y, ps.w, ps.alpha, seen);
    }
    // mark-and-sweep: 消えたアクター/設置物の影スプライトを破棄。
    for (const [id, sp] of this.shadowPool) {
      if (!seen.has(id)) { sp.destroy(); this.shadowPool.delete(id); }
    }
  }

  // ---- actors: player + enemies, Y-sorted by foot Y ------------------------

  private syncActors(player: Player, enemies: Enemy[], gameTime: number, now: number) {
    this.enemyCount = enemies.length;

    // Player
    if (!this.playerView) this.playerView = this.makeActor();
    // 背負い刀スプライトをプレイヤーコンテナの「本体スプライトの背面」へ一度だけ親子付け。
    // makeActor の子順 [reticle, sprite, overlay] の reticle と sprite の間(index 1)へ挿入。
    if (!this.playerKatanaBackAttached) {
      this.playerKatanaBack.anchor.set(0.5, 0.5);
      this.playerKatanaBack.visible = false;
      this.playerView.container.addChildAt(this.playerKatanaBack, 1);
      this.playerKatanaBackAttached = true;
    }
    this.drawPlayer(this.playerView, player, gameTime, now);
    this.syncShadowClone(player);

    // Enemies (mark-and-sweep pool)
    const seen = new Set<string>();
    for (const e of enemies) {
      seen.add(e.id);
      let view = this.enemies.get(e.id);
      if (!view) {
        view = this.makeActor();
        this.enemies.set(e.id, view);
      }
      try { this.drawEnemy(view, e, gameTime, now); } catch (err) {
        if (!PixiScene.enemyDrawErrLogged) { PixiScene.enemyDrawErrLogged = true; console.error('[pixiScene] drawEnemy error (suppressed):', err); }
      }
    }
    for (const [id, view] of this.enemies) {
      if (!seen.has(id)) {
        view.light.destroy();
        view.container.destroy({ children: true });
        this.enemies.delete(id);
        this.enemyJumpHop.delete(id);
        this.enemyBlockFall.delete(id);
      }
    }
  }

  // 錬金術の召喚ユニット(味方)。敵と同じ actor プール/y-sort を使い、流用タイプの
  // ホーミング弾ロックインジケーター: ロック済み敵の頭にPHILL風の照準サークルを描く。
  // 1ロック=白 / 2ロック=赤。毎フレーム全クリア＆再描画(最大Lv3で10ロック=軽量)。
  private syncLockIndicators(enemies: Enemy[], locks: string[], now: number) {
    const g = this.homingLockGfx;
    g.clear();
    if (locks.length === 0) {
      if (this.lockAnim.size > 0) this.lockAnim.clear();
      return;
    }
    // 敵IDごとにロック数をカウント(1=白 / 2=赤)。
    const lockCount = new Map<string, number>();
    for (const id of locks) lockCount.set(id, (lockCount.get(id) ?? 0) + 1);
    const seen = new Set<string>();
    for (const [enemyId, count] of lockCount) {
      const enemy = enemies.find(e => e.id === enemyId);
      if (!enemy) continue;
      seen.add(enemyId);
      // ロック付与(またはロック数変化=白→赤)の瞬間からアニメ開始。ズームアウト→インしつつフェードインを 0.5秒。
      let anim = this.lockAnim.get(enemyId);
      if (!anim || anim.count !== count) { anim = { startedAt: now, count }; this.lockAnim.set(enemyId, anim); }
      const t = Math.min(1, Math.max(0, (now - anim.startedAt) / LOCK_ANIM_MS));
      const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const cx = enemy.x + enemy.width / 2;
      const headY = enemy.y + enemy.height * 0.28; // 頭のあたり
      const targetRad = Math.max(enemy.width, enemy.height) * 0.5 + 4;
      // 大きい半径(ズームアウト)→ targetRad(ズームイン)へ収束。
      const rad = targetRad * (LOCK_ANIM_START_SCALE - (LOCK_ANIM_START_SCALE - 1) * ease);
      const fade = ease; // 同時にフェードイン
      const ring = count >= 2 ? 0xef4444 : 0xffffff;  // 2ロック=赤 / 1ロック=白
      const dot = count >= 2 ? 0xfecaca : 0xf1f5f9;
      g.circle(cx, headY, rad).stroke({ width: 2, color: ring, alpha: 0.92 * fade });
      g.circle(cx, headY, 2.2).fill({ color: dot, alpha: 0.92 * fade });
      // 照準の十字(小)。リングと一緒にスケール。
      g.moveTo(cx - rad - 3, headY).lineTo(cx - rad + 2, headY)
        .moveTo(cx + rad - 2, headY).lineTo(cx + rad + 3, headY)
        .moveTo(cx, headY - rad - 3).lineTo(cx, headY - rad + 2)
        .moveTo(cx, headY + rad - 2).lineTo(cx, headY + rad + 3)
        .stroke({ width: 1.5, color: ring, alpha: 0.8 * fade });
    }
    // ロックが外れた敵のアニメ状態を破棄。
    for (const id of [...this.lockAnim.keys()]) if (!seen.has(id)) this.lockAnim.delete(id);
  }

  // スラッシャー: タイミングリング(描画のみ・当たり判定に影響なし)。縮むリングがゴールに重なる瞬間=ジャスト。
  // gameTime ベースで判定と同じ時計を使う(ストア側の追撃判定とズレない)。単一リングなので軽量。
  private syncSlasherRing(player: Player, gameTime: number) {
    const g = this.slasherRingGfx;
    g.clear();
    const start = player.slasherRingStartAt;
    if (!start || start <= 0) return;
    const elapsed = gameTime - start;
    if (elapsed < 0 || elapsed > SLASHER_RING_MS + SLASHER_JUST_MS) return; // 寿命外は描かない
    const cx = player.x + player.width / 2;
    const cy = player.y + player.height / 2;
    const base = huntingMeleeRadius(player);
    const rGoal = base * 0.5;
    const rStart = base * 1.6;
    const t = Math.min(1, elapsed / SLASHER_RING_MS);
    const ease = 1 - Math.pow(1 - t, 2);              // ズームイン(縮む)
    const shrinkR = rStart + (rGoal - rStart) * ease;
    const fade = Math.min(1, t * 1.4);                // フェードイン
    const justNow = elapsed >= SLASHER_RING_MS - SLASHER_JUST_MS;
    // ゴールサークル(薄く・固定)。
    g.circle(cx, cy, rGoal).stroke({ width: 2, color: 0xbef264, alpha: 0.35 });
    // 縮むサークル(フェードイン)。ジャスト窓では白く強調。
    const col = justNow ? 0xffffff : 0xbef264;
    g.circle(cx, cy, shrinkR).stroke({ width: justNow ? 3.5 : 2.5, color: col, alpha: (justNow ? 0.95 : 0.7) * fade });
    if (justNow) g.circle(cx, cy, rGoal).stroke({ width: 2.5, color: 0xffffff, alpha: 0.9 }); // ジャスト合図
  }

  // スプライトにシアンtintを乗せて描く。通常はHPバー、レア(死神)は渦っぽいシアンの円。
  private syncSummons(summons: Summon[], now: number) {
    const seen = new Set<string>();
    for (const s of summons) {
      seen.add(s.id);
      let view = this.summonViews.get(s.id);
      if (!view) { view = this.makeActor(); this.summonViews.set(s.id, view); }
      this.drawSummon(view, s, now);
    }
    for (const [id, view] of this.summonViews) {
      if (!seen.has(id)) {
        view.light.destroy();
        view.container.destroy({ children: true });
        this.summonViews.delete(id);
      }
    }
  }

  private drawSummon(view: ActorView, s: Summon, now: number) {
    // 敵と同じ視覚スケールの足元ボックスで描く(大きさを揃える)。
    const fb = summonFootBox(s);
    const tex = getTexture(s.reusedType);
    view.light.visible = false;
    // 被弾シェイク(攻撃されている表現): 直近ヒットから短時間、減衰する横揺れ。lastHit は Date.now 基準。
    const sinceHit = Date.now() - s.lastHit;
    const hitT = sinceHit >= 0 && sinceHit < HIT_SHAKE_MS ? 1 - sinceHit / HIT_SHAKE_MS : 0;
    const shakeX = hitT > 0 ? Math.sin(sinceHit / 16) * HIT_SHAKE_PX * hitT : 0;
    view.sprite.position.set(Math.round(fb.footX + shakeX), Math.round(fb.footY));
    view.container.zIndex = fb.footY;
    view.container.alpha = 1;
    if (tex) {
      view.sprite.texture = tex;
      const sc = containScale(fb.boxW, fb.boxH, tex.width, tex.height) * this.depthScaleEnemy(fb.footY);
      view.sprite.scale.set(sc, sc);
      // 被弾直後は赤白フラッシュ、それ以外は味方識別のシアン。
      view.sprite.tint = hitT > 0.35 ? 0xffd0d0 : ALCHEMY_SUMMON_TINT;
      view.sprite.visible = true;
    } else {
      view.sprite.visible = false;
    }
    // 背面: レアは渦っぽいシアンの円(吸引が分かる軽い表現)。
    const r = view.reticle;
    r.clear();
    if (s.kind === 'rare') {
      const cx = s.x + s.width / 2;
      const cy = s.y + s.height / 2;
      const pulse = 0.5 + 0.3 * Math.sin(now / 200);
      r.circle(cx, cy, s.width * 0.62).stroke({ color: 0x38bdf8, alpha: 0.5 * pulse, width: 2 });
      r.circle(cx, cy, s.width * 0.42).stroke({ color: 0xbae6fd, alpha: 0.4 * pulse, width: 1.5 });
    }
    // 前面: 通常個体のHPバー。
    const o = view.overlay;
    o.clear();
    if (s.kind === 'normal' && s.health < s.maxHealth) {
      const frac = Math.max(0, Math.min(1, s.health / s.maxHealth));
      const bx = s.x;
      const by = s.y - 6;
      o.rect(bx, by, s.width, 3).fill({ color: 0x000000, alpha: 0.55 });
      o.rect(bx, by, s.width * frac, 3).fill({ color: 0x38bdf8 });
    }
  }

  private drawPlayer(view: ActorView, p: Player, gameTime: number, now: number) {
    const fb = playerFootBox(p);
    const walking = p.isMoving && p.direction !== 'idle';
    const frame = playerWalkFrame(p, now, walking);
    // 武将セット(特殊3点)フル装備時は立ち絵を差し替え。小烏丸(村雨)も装備していれば刀バージョン、
    // 揃っていなければ通常クラス絵へ戻す。立ち絵は高さ基準で正規化する(刀が横に伸びても体の大きさを保つ)。
    const warlordFull = hasFullWarlordSet(p.equipment);
    const textureName = playerTextureName(p, frame);
    const tex = getTexture(textureName) ?? getTexture('player');
    view.sprite.texture = tex ?? view.sprite.texture;
    const phase = walking ? (now / PLAYER_WALK_CYCLE_MS) * Math.PI * 2 : 0;
    const step = Math.sin(phase);
    const bob = walking ? Math.abs(step) * PLAYER_WALK_BOB_PX * this.depthScale(fb.footY) : 0;
    // 徒歩の自然化(3コマの上に重ねる連続モーション・視覚のみ): 接地(lift=0)で縦に潰れて横に広がり、
    // 遊脚の最高点(lift=1)で縦に伸びて横が締まる(スカッシュ&ストレッチ)＋足元支点の左右リーン(体重移動)。
    let walkSqX = 1, walkSqY = 1, walkLean = 0;
    if (walking) {
      const lift = Math.abs(step); // 0=接地 / 1=遊脚中(最高点)
      walkSqY = 1 + PLAYER_WALK_SQUASH * lift - PLAYER_WALK_SQUASH * 0.5 * (1 - lift);
      walkSqX = 1 - PLAYER_WALK_SQUASH * 0.8 * lift + PLAYER_WALK_SQUASH * 0.4 * (1 - lift);
      walkLean = step * PLAYER_WALK_LEAN_RAD;
    }

    // 行動の二次モーション(歩きと同じく静止スプライトに重ねる・視覚のみ・判定不変)。
    // 銃発射=反動 / 近接=踏み込み振り抜き / カウンター=決めポーズ / リロード=手元作業の揺れ。
    let actSqX = 1, actSqY = 1, actLean = 0, actOffX = 0, actOffY = 0;
    const dsc = this.depthScale(fb.footY); // pxオフセットは遠近スケールに合わせる(bob と同じ)
    const face = (p.direction === 'left' || (p.lastDirection != null && p.lastDirection.x < 0)) ? -1 : 1;
    // 狙い方向の単位ベクトル(レティクル優先・無ければ直近向き)。踏み込み/反動の方向に使う。
    let aimx = 0, aimy = 0;
    const am = Math.hypot(p.aimX, p.aimY);
    if (am > 0.001) { aimx = p.aimX / am; aimy = p.aimY / am; }
    else if (p.lastDirection) { const lm = Math.hypot(p.lastDirection.x, p.lastDirection.y) || 1; aimx = p.lastDirection.x / lm; aimy = p.lastDirection.y / lm; }
    // 銃発砲の反動: 銃口と逆向き(後方)へ一瞬引け、軽く縦に縮む(急減衰)。
    const gun = getActiveGun(p);
    if (gun) {
      const sinceFire = now - (gun.lastFired || 0);
      if (sinceFire >= 0 && sinceFire < PLAYER_FIRE_RECOIL_MS) {
        const e = 1 - sinceFire / PLAYER_FIRE_RECOIL_MS;
        actOffX -= aimx * PLAYER_FIRE_RECOIL_PX * e * dsc;
        actOffY -= aimy * PLAYER_FIRE_RECOIL_PX * e * dsc;
        actSqY *= 1 - PLAYER_FIRE_RECOIL_SQUASH * e;
      }
    }
    // 近接スイング: 狙い方向へ踏み込み(踏込→振抜→復帰のアーク)＋振り抜きの傾き＋横ストレッチ。
    const sinceSwing = now - (p.meleeSwingAt || 0);
    if (p.meleeSwingAt > 0 && sinceSwing >= 0 && sinceSwing < PLAYER_MELEE_SWING_MS) {
      const t = sinceSwing / PLAYER_MELEE_SWING_MS;
      const arc = Math.sin(t * Math.PI); // 0→1→0(踏み込みのピークは中盤)
      const whip = 1 - t;                // 開始が一番強い→復帰
      actOffX += aimx * PLAYER_MELEE_LUNGE_PX * arc * dsc;
      actOffY += aimy * PLAYER_MELEE_LUNGE_PX * arc * dsc;
      actLean += face * PLAYER_MELEE_LEAN_RAD * whip;
      actSqX *= 1 + PLAYER_MELEE_STRETCH * arc;
      actSqY *= 1 - PLAYER_MELEE_STRETCH * 0.6 * arc;
    }
    // カウンター成立の決めポーズ: 一瞬ふくらむ膨らみ＋傾き(速い減衰)。
    const sinceCounter = now - (p.lastCounterSuccessTime || 0);
    if (p.lastCounterSuccessTime > 0 && sinceCounter >= 0 && sinceCounter < PLAYER_COUNTER_MS) {
      const pop = (1 - sinceCounter / PLAYER_COUNTER_MS) ** 2; // 速い減衰
      actSqX *= 1 + PLAYER_COUNTER_POP * pop;
      actSqY *= 1 + PLAYER_COUNTER_POP * pop;
      actLean += face * PLAYER_COUNTER_LEAN_RAD * pop;
    }
    // リロード中: 手元作業の小刻みな上下＋左右リーン(リロード中だけ・進行と独立)。
    if (p.reloadingWeaponId && now < p.reloadEndsAt) {
      actOffY += Math.sin(now / 70) * PLAYER_RELOAD_BOB_PX * dsc;
      actLean += Math.sin(now / 110) * PLAYER_RELOAD_LEAN_RAD;
    }

    // 登場演出: store 共有の playerIntroOffset(t) で見た目オフセット + 着地スカッシュ。
    // カメラ(useGameLoop)が同じ式で飛行Xに追従するので、キャラは画面内を低く飛んで着地する。
    let introOffX = 0;
    let introOffY = 0;
    let introSqX = 1;
    let introSqY = 1;
    let introScale = 1; // フェーズA(ヘリ飛来)で小さく見せて遠さを表現
    let riding = false; // フェーズA中=ヘリのドアに重なって乗っている
    const hfPlayer = PLAYER_INTRO_HELI_FRAC;
    const jumpOffT = hfPlayer * HELI_RIDE_RELEASE_FROM; // 飛び降り開始の t
    const computeIntro = (t: number) => {
      const off = playerIntroOffset(t);
      introScale = playerIntroScale(t);
      if (t < jumpOffT) {
        // 乗車中: 足元をヘリのドアへ直接ピン留め(ヘリ中心から一定オフセット)。
        const base = this.introHeliBase(p, t);
        introOffX = base.cx + HELI_RIDE_DOOR_X * base.scale - fb.footX;
        introOffY = base.cy + HELI_DISPLAY_H * HELI_RIDE_DOOR_FRAC * base.scale - fb.footY;
        riding = true;
      } else {
        // 飛び降り後: 横はダッシュ(off.x)、縦はドア高さ→着地(0)へ単調に加速落下。
        // フェーズBのアーチ(下→上)を通さないので「一瞬下に下がる」谷が出ない。
        const jb = this.introHeliBase(p, jumpOffT);
        const jumpStartOffY = jb.cy + HELI_DISPLAY_H * HELI_RIDE_DOOR_FRAC * jb.scale - fb.footY;
        const fall = Math.min(1, (t - jumpOffT) / (1 - jumpOffT)); // 0→1
        const e = fall * fall; // 加速して落下
        introOffX = off.x;                    // 横は従来のダッシュ(中央へ寄る)
        introOffY = jumpStartOffY * (1 - e);  // ドア高さ→0(着地)へ単調降下
        riding = t < hfPlayer;                // フェーズA内(jumpOffT〜hf)はまだ前面レイヤー
        if (fall > 0.85) {
          const sQ = Math.sin(((fall - 0.85) / 0.15) * Math.PI); // 着地でぐにゃっ
          introSqX = 1 + 0.3 * sQ;
          introSqY = 1 - 0.22 * sQ;
        }
      }
    };
    if (this.introUntil === -1) {
      computeIntro(0);
    } else if (this.introUntil > 0) {
      const t = Math.max(0, Math.min(1, 1 - (this.introUntil - now) / PLAYER_INTRO_MS));
      if (t < 1) computeIntro(t);
    }

    // フェーズA(乗車中)はプレイヤーをヘリと同じ danceUiLayer の前面へ移し、ヘリのドアに重ねて見せる
    // (danceUiLayer は world と同一トランスフォームなので座標はそのまま)。降りたら actorLayer へ戻す。
    if (riding && !this.playerRidingHeli) {
      this.L.danceUiLayer.addChild(view.container); // ヘリ(同レイヤー・先に追加)より前面=ドアに重なる
      this.playerRidingHeli = true;
    } else if (!riding && this.playerRidingHeli) {
      this.L.actorLayer.addChild(view.container);
      this.playerRidingHeli = false;
    }

    if (tex) {
      // 武将立ち絵は高さ基準で正規化(標準クラス絵=幅86px相当の128x108 と同じ画面上の高さに合わせる)。
      // 通常クラス絵は従来どおり幅基準。
      const baseScale = playerBaseScale(p, tex, fb.boxW, fb.boxH);
      const sc = baseScale * this.depthScale(fb.footY) * introScale;
      const flip = p.direction === 'left' || (p.lastDirection != null && p.lastDirection.x < 0);
      view.sprite.scale.set((flip ? -sc : sc) * introSqX * walkSqX * actSqX, sc * introSqY * walkSqY * actSqY);
      view.sprite.rotation = walkLean + actLean;
    }
    view.sprite.position.set(
      this.snapToScreenPixel(fb.footX, this.L.world.position.x) + introOffX + actOffX,
      this.snapToScreenPixel(fb.footY - bob, this.L.world.position.y) + introOffY + actOffY,
    );
    // シーカー発動中は半透明(通常敵から狙われない演出)。被弾無敵の点滅より優先。
    const seekerActive = p.seekerUntil > gameTime;
    // 死亡時: 立ち絵を1秒でフェードアウト(現状の死亡演出はそのまま)。health>0 で基準時刻をリセット。
    if (p.health <= 0) { if (this.playerDeathAt === 0) this.playerDeathAt = now; }
    else this.playerDeathAt = 0;
    const deathFade = this.playerDeathAt > 0 ? Math.max(0, 1 - (now - this.playerDeathAt) / PLAYER_DEATH_FADE_MS) : 1;
    view.sprite.alpha = (seekerActive ? 0.4 : (p.invulnerable ? 0.5 + 0.5 * Math.sin(now / 50) : 1)) * deathFade;
    view.container.zIndex = fb.footY;
    view.light.visible = false;
    view.reticle.clear();
    // 刀/小烏丸(村雨)装備中: 実画像(katana-item)をプレイヤー背面へ表示。
    // 武将フル装備の立ち絵中は武器を描いた一枚絵なので背負い刀は隠す(二重表示回避)。
    const hasKatanaSub = p.subWeapons.includes('murasame') || p.subWeapons.includes('katana');
    const katanaTex = getTexture('katana-item');
    const kb = this.playerKatanaBack;
    if (hasKatanaSub && !warlordFull && katanaTex) {
      const d = this.depthScale(fb.footY);
      const h = fb.boxH * d;
      // 画像の対角(=刀の全長)を体高基準のサイズへ。位置は胸あたり中心。向きで左右反転。
      const targetLen = h * 1.7 * KATANA_BACK_SCALE;
      const sc = targetLen / Math.max(katanaTex.width, katanaTex.height);
      const flip = p.direction === 'left' || (p.lastDirection != null && p.lastDirection.x < 0);
      kb.texture = katanaTex;
      kb.visible = true;
      kb.scale.set((flip ? -1 : 1) * sc, sc);
      kb.rotation = KATANA_BACK_IMG_ROT + actLean; // 行動の二次モーションに本体と同じく追従
      kb.position.set(
        this.snapToScreenPixel(fb.footX, this.L.world.position.x) + introOffX + actOffX,
        this.snapToScreenPixel(fb.footY - bob, this.L.world.position.y) + introOffY + actOffY - h * 0.55,
      );
      kb.alpha = view.sprite.alpha;
    } else {
      kb.visible = false;
    }
    view.overlay.clear();
  }

  // 立ち絵テクスチャを白黒化して1度だけベイクし、RenderTexture をキャッシュして返す。
  // 以後は毎フレームのフィルタ処理ではなく、このキャッシュ済みテクスチャをそのまま貼る。
  private grayscaleTexture(name: string): Texture | null {
    const cached = this.grayTexCache.get(name);
    if (cached) return cached;
    const src = getTexture(name);
    if (!src || !this.renderer) return null;
    const tmp = new Sprite(src);
    const wrap = new Container();
    wrap.addChild(tmp);
    const f = new ColorMatrixFilter();
    f.desaturate(); // 彩度0=白黒
    wrap.filters = [f]; // コンテナにかけると render で確実に適用される
    const rt = RenderTexture.create({ width: Math.max(1, src.width), height: Math.max(1, src.height) });
    this.renderer.render({ container: wrap, target: rt, clear: true });
    wrap.destroy({ children: true });
    this.grayTexCache.set(name, rt);
    return rt;
  }

  // 分身(サブウェポン)を描く。外見はプレイヤーと同一(待機=frame0)を白黒キャッシュで。
  // 位置は生成時に固定(clone.x/y)。攻撃の見た目は store 側のスラッシュ/リングが担当する。
  private syncShadowClone(player: Player) {
    const clone: ShadowCloneState | null = useGameStore.getState().shadowClone;
    const spr = this.shadowCloneSprite;
    if (!clone) { spr.visible = false; return; }
    if (!this.shadowCloneAdded) {
      spr.anchor.set(0.5, 1); // foot-centre(プレイヤー本体と同じ)
      this.L.actorLayer.addChild(spr);
      this.shadowCloneAdded = true;
    }
    // 外見はプレイヤーと同じ立ち絵(クラス/武将装備)を共有。待機なので frame 0。
    const name = playerTextureName(player, 0);
    const gray = this.grayscaleTexture(name);
    if (!gray) { spr.visible = false; return; }
    spr.visible = true;
    spr.texture = gray;
    const boxW = clone.width * PLAYER_VISUAL_SCALE;
    const boxH = clone.height * PLAYER_VISUAL_SCALE;
    const footX = clone.x + clone.width / 2;
    const footY = clone.y + clone.height;
    const baseScale = playerBaseScale(player, gray, boxW, boxH);
    const sc = baseScale * this.depthScale(footY);
    spr.scale.set(clone.facingLeft ? -sc : sc, sc);
    spr.position.set(
      this.snapToScreenPixel(footX, this.L.world.position.x),
      this.snapToScreenPixel(footY, this.L.world.position.y),
    );
    spr.zIndex = footY;     // 他アクターと足元Yでy-sort
    spr.alpha = 0.8;        // 分身とわかるよう少し透過
  }

  // 刀サブウェポン: キャラ中央付近・背面に背負った刀のドット絵。専用テクスチャ
  // を増やさず、`katanaShape` の共有ドット配置を軽量Graphicsで描く(HUDアイコン
  // と同じデザイン)。赤い鞘・少し反り・縦やや斜め。村雨は刀身シルバー。

  private drawEnemy(view: ActorView, e: Enemy, gameTime: number, now: number) {
    const fb = enemyFootBox(e);
    // ステージ3(daylight=farBackdrop'city')は廃都セット、ステージ4(snowStage='snow')は雪原セットに敵絵を
    // 差し替え。次にlab、無ければ既定アトラス。
    const tex = getTexture(
      (this.daylight ? stage3EnemyTextureName(e.type) : null)
      ?? (this.snowStage ? stage4EnemyTextureName(e.type) : null)
      ?? labEnemyTextureName(e.type, e.id)
      ?? e.type
    );
    const cx = e.x + e.width / 2;
    const cy = e.y + e.height / 2;

    // パンプキン特殊AI演出(描画のみ): 縮み(しゃがみ)/ジャンプのアーク/着地スカッシュ。Lv3・ジャイアントバットも同様。
    let aiSqX = 1, aiSqY = 1, aiHop = 0;
    if (e.type === 'pumpkin' || e.type === 'lab-zombie-3' || e.type === 'giantbat') {
      if (e.aiPhase === 'crouch') {
        const p = Math.max(0, Math.min(1, 1 - ((e.aiPhaseUntil ?? gameTime) - gameTime) / PUMPKIN_CROUCH_MS));
        aiSqY = 1 - 0.42 * p; aiSqX = 1 + 0.14 * p; // しゃがんで縦縮み・横広がり
      } else if (e.aiPhase === 'jump') {
        const t = Math.max(0, Math.min(1, (gameTime - (e.aiStartedAt ?? gameTime)) / PUMPKIN_JUMP_MS));
        aiHop = Math.sin(t * Math.PI) * PUMPKIN_JUMP_HEIGHT; // 1秒のジャンプアーク(描画のみ)
        aiSqY = 1.08; aiSqX = 0.94;                          // 空中は少し縦伸び
        this.enemyJumpHop.set(e.id, aiHop);                  // 盾ブロック時の落下起点として最新ホップ高を退避
        this.enemyBlockFall.delete(e.id);
      } else if (e.aiPhase === 'recover') {
        // 盾で空中から弾かれた着地(store が block 時に aiStartedAt=recover開始へ揃える)は、
        // 通常着地と違い空中高から始まるので、ホップ高を 0 まで重力ふうに補間して「シームレスに落とす」。
        const recoverStart = (e.aiPhaseUntil ?? gameTime) - PUMPKIN_RECOVER_MS;
        const blockedFall = (e.aiStartedAt ?? -Infinity) >= recoverStart - 1;
        if (blockedFall) {
          let fall = this.enemyBlockFall.get(e.id);
          if (!fall) { fall = { from: this.enemyJumpHop.get(e.id) ?? PUMPKIN_JUMP_HEIGHT * 0.6, start: gameTime }; this.enemyBlockFall.set(e.id, fall); }
          const p = Math.max(0, Math.min(1, (gameTime - fall.start) / SHIELD_BLOCK_FALL_MS));
          aiHop = fall.from * (1 - p * p); // ease-in(加速して落下)。p>=1 で 0 になりそのまま。
          aiSqY = 1.05; aiSqX = 0.97;      // 落下中は少しだけ縦伸び
          // 注: ここで fall/jumpHop を delete すると、まだ recover 中だと次フレームで再生成され
          //     ホップ高が 0.6*JUMP_HEIGHT に戻って再落下=上下ループになる(社長報告)。後片付けは
          //     recover を抜けた時(下の else 枝)で行う。
        } else {
          const since = gameTime - recoverStart;
          if (since >= 0 && since < 170) { const w = 1 - since / 170; aiSqY = 1 - 0.4 * w; aiSqX = 1 + 0.18 * w; } // 着地スカッシュ
          this.enemyJumpHop.delete(e.id);
          this.enemyBlockFall.delete(e.id);
        }
      } else {
        this.enemyJumpHop.delete(e.id);
        this.enemyBlockFall.delete(e.id);
      }
    }

    const liftT = e.liftUntil !== undefined ? Math.max(0, (e.liftUntil - now) / BOSS_FINISH_LIFT_MS) : 0;
    const liftHop = Math.sin(liftT * Math.PI) * BOSS_FINISH_LIFT_PX;
    const liftShake = liftT > 0 ? Math.sin(now / 24) * 2.2 * liftT : 0;
    // 裏ボスは「当たり判定=足元の帯(AABB)」と「絵(巨体)」を分離して描く(社長指示)。
    // 他敵は従来どおり足元アンカー＋遠近スケール。
    const bossFixed = isHiddenBoss(e.type);
    view.container.zIndex = fb.footY;
    const horizonAlpha = this.horizonActorAlpha(fb.footY);
    // 死神の回り込みワープ: 消える(0)→テレポート→出る(1) のフェード(useGameLoop が reaperWarpAlpha を駆動)。
    const reaperWarpFade = e.reaperWarpAlpha ?? 1;
    view.container.alpha = horizonAlpha * reaperWarpFade;

    if (bossFixed && tex) {
      // 裏ボス: 当たり判定=帯(AABB=e.width×e.height)。絵はそれより大きく、帯の上に伸ばす(見た目と判定を分離)。
      const fit = BOSS_SPRITE_FIT[e.type] ?? BOSS_FIT_DEFAULT;
      view.sprite.texture = tex;
      view.sprite.anchor.set(0.5, 0.5);
      const scale = (e.width / fit.w) / tex.width; // 帯幅→絵の実寸(縦横同率=歪まない)
      const spriteW = scale * tex.width, spriteH = scale * tex.height;
      const stripCx = e.x + e.width / 2, stripCy = e.y + e.height / 2;
      // 絵の中心(アンカー)= 帯の中心から、帯が絵内のどこにあるか(fit.cx/cy)ぶん逆にずらす。
      const spx = stripCx + (0.5 - fit.cx) * spriteW;
      const spy = stripCy + (0.5 - fit.cy) * spriteH;
      const breath = this.enemyBreath(e, now);
      const sinceHit = now - e.lastHit;
      let flinchSqY = 1;
      if (sinceHit >= 0 && sinceHit < ENEMY_HIT_FLINCH_MS) {
        const wob = 1 - sinceHit / ENEMY_HIT_FLINCH_MS;
        const dir = (e.knockbackVx ?? 0) > 0.01 ? 1 : (e.knockbackVx ?? 0) < -0.01 ? -1 : 1;
        view.sprite.skew.x = -dir * ENEMY_HIT_FLINCH_SKEW * wob;
        flinchSqY = 1 - 0.1 * wob;
      } else {
        view.sprite.skew.x = 0;
      }
      view.sprite.position.set(Math.round(spx + liftShake), Math.round(spy - liftHop));
      view.sprite.scale.set(scale * breath.x, scale * breath.y * flinchSqY);
      // プレイヤーが帯(当たり判定)より奥=裏に回り込んだら、巨体の絵で自機が隠れないよう薄く透かす(社長指示)。
      const ply = useGameStore.getState().player;
      const behind = (ply.y + ply.height) < fb.footY
        && (ply.x + ply.width) > (spx - spriteW / 2)
        && ply.x < (spx + spriteW / 2);
      view.sprite.alpha = behind ? BOSS_BEHIND_ALPHA : 1;
      view.sprite.visible = true;
    } else {
    view.sprite.anchor.set(0.5, 1);
    view.sprite.position.set(Math.round(fb.footX + liftShake), Math.round(fb.footY - liftHop - aiHop));
    view.sprite.alpha = e.type === 'ghost' ? 0.65 : 1;

    if (tex) {
      view.sprite.texture = tex;
      // ステージ3のボス(giantbat)だけ見た目を1.2倍(元絵が小さめ)。視覚のみ=hitbox不変。
      const stage3BossMul = (this.daylight && e.type === 'giantbat') ? STAGE3_BOSS_VISUAL_SCALE : 1;
      // ステージ4(雪原)の全敵絵を1.5倍。足元アンカー(0.5,1)なので上方向に拡大。視覚のみ=hitbox不変。
      const stage4VisMul = (this.snowStage && STAGE4_ENEMY_TYPES.has(e.type)) ? STAGE4_ENEMY_VISUAL_SCALE : 1;
      const sc = containScale(fb.boxW, fb.boxH, tex.width, tex.height) * this.depthScaleEnemy(fb.footY) * stage3BossMul * stage4VisMul;
      const breath = this.enemyBreath(e, now);
      // 被弾しなり: 撃たれた直後だけ頭(上方)を後ろ(ノックバック方向)へ skew で反らせ、軽く縦縮み。
      // アンカーが足元寄りなので skew だけで頭が大きく振れる。短時間で戻る。新規描画なし=軽い。
      const sinceHit = now - e.lastHit;
      let flinchSqY = 1;
      if (sinceHit >= 0 && sinceHit < ENEMY_HIT_FLINCH_MS) {
        const wob = 1 - sinceHit / ENEMY_HIT_FLINCH_MS; // 1→0 減衰
        const dir = (e.knockbackVx ?? 0) > 0.01 ? 1 : (e.knockbackVx ?? 0) < -0.01 ? -1 : 1;
        view.sprite.skew.x = -dir * ENEMY_HIT_FLINCH_SKEW * wob; // 頭が後ろへ反る
        flinchSqY = 1 - 0.1 * wob;
      } else {
        view.sprite.skew.x = 0;
      }
      const scaleX = sc * breath.x * aiSqX;
      view.sprite.scale.set(scaleX, sc * breath.y * flinchSqY * aiSqY);
      // ステージ4の足元ズレ補正: アンカー(0.5,1)は画像中心を footX に置くため、足の接地重心が
      // 中心からずれた個体は横に流れて見える。重心が footX に乗るよう x を寄せる(視覚のみ)。
      if (this.snowStage) {
        const footFrac = STAGE4_FOOT_FRAC_X[e.type];
        if (footFrac !== undefined) {
          view.sprite.position.x = Math.round(fb.footX + liftShake - (footFrac - 0.5) * tex.width * scaleX);
        }
      }
      view.sprite.visible = true;
    } else {
      view.sprite.skew.x = 0;
      view.sprite.visible = false; // placeholder ellipse drawn in reticle below
    }
    }

    if (horizonAlpha <= 0) view.light.visible = false;
    else {
      this.syncEnemyLight(view, e, fb.footX, fb.footY, now);
      view.light.alpha *= horizonAlpha * reaperWarpFade;
    }

    // Behind-sprite layer: stun reticle (+ a colour placeholder if no texture).
    const r = view.reticle;
    r.clear();
    if (!tex) {
      const col = parseInt(getEnemyColor(e.type).slice(1), 16);
      r.ellipse(cx, cy, e.width / 2.4, e.height / 2.4).fill({ color: col });
    }
    const stunned = e.stunUntil !== undefined && gameTime < e.stunUntil;
    if (stunned) this.drawStunReticle(r, cx, cy, Math.max(e.width, e.height), now);

    // Above-sprite layer: health bar, boss marker, hit flash.
    const o = view.overlay;
    o.clear();
    // 裏ボスの当たり判定=足元の帯(AABB)に統一(こちらの攻撃・向こうの接触とも同じ)。巨体で分かりにくい
    // ので、その帯=四角を常時うっすら表示(社長指示「この四角を当たり判定に」)。脈動する橙の矩形。
    if (isHiddenBoss(e.type)) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 280);
      o.rect(e.x, e.y, e.width, e.height).fill({ color: 0xf97316, alpha: 0.16 + 0.08 * pulse });
      o.rect(e.x, e.y, e.width, e.height).stroke({ width: 3, color: 0xfb923c, alpha: 0.8 + 0.15 * pulse });
    }
    this.drawHealthBar(o, e);
    if (e.type === 'pumpkin' || e.type === 'giantbat' || e.type === 'reaper') {
      this.drawBossMarker(o, cx, e.y - 6, e.type === 'reaper' ? 0xef4444 : 0xfde68a, now);
    }
    // 拠点/レスキューの「専用敵」(fromEvent)は通常湧きと区別(社長指示・軽量マーク): 頭上に橙の下向き三角(脈動)。
    if (e.fromEvent) {
      const my = e.y - 10;
      const pulse = 0.6 + 0.4 * Math.sin(now / 200);
      o.poly([cx - 6, my - 8, cx + 6, my - 8, cx, my]).fill({ color: 0xf59e0b, alpha: 0.92 * pulse });
      o.poly([cx - 6, my - 8, cx + 6, my - 8, cx, my]).stroke({ width: 1.5, color: 0x7c2d12, alpha: 0.9 });
    }
    if (now - e.lastHit < 90) {
      o.circle(cx, cy, Math.max(e.width, e.height) / 2).fill({ color: 0xffffff, alpha: 0.45 });
    }
  }

  private enemyBreath(e: Enemy, now: number) {
    if (!ENEMY_BREATH_ENABLED) return { x: 1, y: 1 };
    const heavy = e.type === 'pumpkin' || e.type === 'giantbat' || e.type === 'reaper';
    const amp = heavy ? 0.65 : 1;
    const phase = now / ENEMY_BREATH_MS * Math.PI * 2 + stablePhase(e.id);
    const inhale = Math.sin(phase);
    const secondary = Math.sin(phase * 2 + 0.7) * 0.28;
    const wave = inhale * 0.72 + secondary;
    return {
      x: 1 + ENEMY_BREATH_SCALE_X * amp * wave,
      y: 1 - ENEMY_BREATH_SCALE_Y * amp * wave,
    };
  }

  private syncEnemyLight(view: ActorView, e: Enemy, footX: number, footY: number, now: number) {
    if (!ENEMY_LIGHT_ENABLED || e.type === 'bat') {
      view.light.visible = false;
      return;
    }
    const hitT = Math.max(0, 1 - (now - e.lastHit) / ENEMY_HIT_LIGHT_MS);
    const boss = e.type === 'pumpkin' || e.type === 'giantbat' || e.type === 'reaper';
    if (this.enemyCount >= ENEMY_LIGHT_CULL_COUNT && !boss && hitT <= 0) {
      view.light.visible = false;
      return;
    }
    const radius = ENEMY_LIGHT_RADIUS * (boss ? 1.55 : 1) * (1 + hitT * 0.42);
    view.light.visible = true;
    view.light.tint = ENEMY_LIGHT_TINT[e.type] ?? 0x9de58f;
    view.light.position.set(footX, footY - e.height * 0.22);
    view.light.width = radius * 2;
    view.light.height = radius * 1.45;
    view.light.alpha = (boss ? 0.18 : 0.08) + hitT * 0.22;
  }

  private drawHealthBar(g: Graphics, e: Enemy) {
    if (e.health >= e.maxHealth) return;
    const w = e.width;
    const h = 3;
    const x = e.x;
    const y = e.y - h - 2;
    g.rect(x, y, w, h).fill({ color: 0x000000, alpha: 0.5 });
    const pct = e.health / e.maxHealth;
    g.rect(x, y, w * pct, h).fill({ color: pct < 0.3 ? 0xef4444 : 0x10b981 });
  }

  private drawStunReticle(g: Graphics, cx: number, cy: number, size: number, now: number) {
    const rad = size * 0.85 + 6;
    const spin = (now * 0.004) % (Math.PI * 2);
    g.circle(cx, cy, rad).fill({ color: 0xfacc15, alpha: 0.16 });
    for (let i = 0; i < 4; i++) {
      const a0 = spin + i * (Math.PI / 2) + 0.25;
      const a1 = spin + i * (Math.PI / 2) + (Math.PI / 2) - 0.25;
      // moveTo before arc: otherwise Pixi draws a connecting line from the
      // previous pen position to the arc start (stray yellow line artifact).
      g.moveTo(cx + Math.cos(a0) * rad, cy + Math.sin(a0) * rad)
        .arc(cx, cy, rad, a0, a1)
        .stroke({ width: 2, color: 0xfacc15 });
    }
  }

  private drawBossMarker(g: Graphics, cx: number, topY: number, glow: number, now: number) {
    const baseY = topY - 10 + Math.sin(now / 220) * 2;
    g.ellipse(cx, baseY, 3, 2.4).fill({ color: 0x0f0f14 });
    g.poly([cx - 2, baseY, cx - 9, baseY - 3, cx - 5, baseY + 1]).fill({ color: 0x0f0f14 });
    g.poly([cx + 2, baseY, cx + 9, baseY - 3, cx + 5, baseY + 1]).fill({ color: 0x0f0f14 });
    g.rect(cx - 1, baseY - 1, 1, 1).fill({ color: glow });
    g.rect(cx + 1, baseY - 1, 1, 1).fill({ color: glow });
  }

  // ---- projectiles ---------------------------------------------------------

  private syncProjectiles(projectiles: Projectile[], now: number) {
    const seen = new Set<string>();
    for (const p of projectiles) {
      if (p.createdAt > now) continue; // scheduled / inactive
      if (p.weaponType === 'shield') continue; // 盾は syncShields で別管理(actorLayer/y-sort)
      if (p.weaponType === 'decoy') continue;  // デコイは syncDecoys で別管理(スプライト+射程円)
      if (p.weaponType === 'turret') continue; // タレットは syncTurrets で別管理(actorLayer/y-sort)
      seen.add(p.id);
      let g = this.projectiles.get(p.id);
      if (!g) {
        g = new Graphics();
        this.L.frontObjectLayer.addChild(g);
        this.projectiles.set(p.id, g);
      }
      this.drawProjectile(g, p);
    }
    for (const [id, g] of this.projectiles) {
      if (!seen.has(id)) {
        g.destroy();
        this.projectiles.delete(id);
      }
    }
  }

  // 設置型デコイは「射程サークル(地面)+ 装置スプライト」を中心アンカーで描画。
  private syncDecoys(projectiles: Projectile[], now: number) {
    const seen = new Set<string>();
    for (const p of projectiles) {
      if (p.weaponType !== 'decoy') continue;
      if (p.createdAt > now) continue;
      seen.add(p.id);
      let v = this.decoyViews.get(p.id);
      if (!v) {
        const container = new Container();
        const gfx = new Graphics();   // 射程サークル(地面)
        const sprite = new Sprite();  // 装置本体
        sprite.anchor.set(0.5, 0.9);  // 接地点が装置の下寄り
        container.addChild(gfx, sprite);
        this.L.frontObjectLayer.addChild(container);
        v = { container, gfx, sprite };
        this.decoyViews.set(p.id, v);
      }
      this.drawDecoy(v, p);
    }
    for (const [id, v] of this.decoyViews) {
      if (!seen.has(id)) {
        v.container.destroy({ children: true });
        this.decoyViews.delete(id);
      }
    }
  }

  private drawDecoy(v: { container: Container; gfx: Graphics; sprite: Sprite }, p: Projectile) {
    v.container.position.set(p.x + p.width / 2, p.y + p.height / 2);
    // 設置物の共通: 上方(奥=画面上)へ流れたら地平線フェードで消す(盾/タレットと統一)。
    v.container.alpha = this.horizonActorAlpha(p.y + p.height);
    // 射程サークル(area=射程半径)。黒フチ+シアン本線の単一ストローク(軽量)。
    const g = v.gfx;
    g.clear();
    const range = p.area ?? 0;
    if (range > 0) {
      const pulse = 0.85 + Math.sin(Date.now() / 320) * 0.15;
      g.circle(0, 0, range).stroke({ color: 0x06121f, alpha: 0.5, width: 3 });
      g.circle(0, 0, range).stroke({ color: 0x38bdf8, alpha: 0.55 * pulse, width: 1.5 });
    }
    // 装置本体スプライト(向きなし・全方向)。
    const tex = getTexture('decoy');
    if (tex) {
      if (v.sprite.texture !== tex) v.sprite.texture = tex;
      const scale = tex.height > 0 ? DECOY_DISPLAY_H / tex.height : 1;
      v.sprite.scale.set(scale);
    }
  }

  // 自動タレットは Graphics の砲台ボディを足元アンカーで描画。actorLayer に置いて
  // 足元Yで y-sort。前方集中=砲身が設置向きへ、全方位=周囲に複数の短い砲身。
  // 重い常時エフェクトは使わず、形状/向き/色でモードが分かるようにする(視覚のみ)。
  private syncTurrets(projectiles: Projectile[], now: number) {
    const seen = new Set<string>();
    for (const p of projectiles) {
      if (p.weaponType !== 'turret') continue;
      if (p.createdAt > now) continue;
      seen.add(p.id);
      let v = this.turretViews.get(p.id);
      if (!v) {
        const container = new Container();
        const sprite = new Sprite();
        sprite.anchor.set(0.5);
        sprite.visible = false;
        const gfx = new Graphics();
        container.addChild(sprite, gfx); // sprite=本体絵 / gfx=モード切替リング等のオーバーレイ
        this.L.actorLayer.addChild(container);
        v = { container, gfx, sprite };
        this.turretViews.set(p.id, v);
      }
      this.drawTurret(v, p);
    }
    for (const [id, v] of this.turretViews) {
      if (!seen.has(id)) {
        v.container.destroy({ children: true });
        this.turretViews.delete(id);
      }
    }
  }

  private drawTurret(v: { container: Container; gfx: Graphics; sprite: Sprite }, p: Projectile) {
    const footX = p.x + p.width / 2;
    const footY = p.y + p.height; // 下辺 = 足元
    const age = Date.now() - p.createdAt;
    // 設置ポップ(最初の180ms)で小さく出現→等倍。
    const pop = age < 180 ? 0.6 + 0.4 * (age / 180) : 1;
    // 寿命末の600msでフェードアウト。さらに他の設置物(盾)と同じ地平線フェードを乗算し、
    // 上方(奥=画面上)へ流れていったら消えるようにする(社長指示・盾と挙動を統一)。
    const remaining = p.duration - age;
    const alpha = Math.max(0, Math.min(1, remaining / 600)) * this.horizonActorAlpha(footY);
    v.container.position.set(footX, footY);
    v.container.zIndex = footY;
    v.container.alpha = alpha;
    v.container.scale.set(pop);

    const mode = p.turretMode ?? 'forward';
    const accent = mode === 'omni' ? 0x38bdf8 : 0xf59e0b; // 全方位=シアン / 前方集中=琥珀
    const tex = getTexture(mode === 'omni' ? 'turret-omni' : 'turret-fixed');
    const g = v.gfx;
    g.clear();
    const sinceSwitch = p.turretModeSwitchedAt ? Date.now() - p.turretModeSwitchedAt : Infinity;

    if (tex) {
      // スプライト描画(紫背景は読込時に透過済み)。前方=照準へ回転(art は砲身が下向き基準)、全方位=回転なし。
      v.sprite.visible = true;
      v.sprite.texture = tex;
      const targetH = 54;
      const sc = targetH / tex.height;
      v.sprite.scale.set(sc);
      v.sprite.position.set(0, -targetH * 0.45); // 足元アンカーから本体を上へ
      v.sprite.rotation = mode === 'forward' ? Math.atan2(-p.direction.x, p.direction.y) : 0;
      if (sinceSwitch < 200) {
        const t = sinceSwitch / 200;
        g.circle(0, -targetH * 0.45, 16 + t * 22).stroke({ color: accent, alpha: 0.7 * (1 - t), width: 2 });
      }
      return;
    }

    // フォールバック: テクスチャ未読込時は従来の手描き。
    v.sprite.visible = false;
    g.roundRect(-11, -22, 22, 20, 4).fill({ color: 0x334155 });
    g.roundRect(-11, -22, 22, 20, 4).stroke({ color: 0x0f172a, alpha: 0.9, width: 1.5 });
    if (sinceSwitch < 200) {
      const t = sinceSwitch / 200;
      g.circle(0, -12, 8 + t * 16).stroke({ color: accent, alpha: 0.7 * (1 - t), width: 2 });
    }
    const cy = -12;
    if (mode === 'forward') {
      const dx = p.direction.x, dy = p.direction.y;
      const dm = Math.max(0.001, Math.hypot(dx, dy));
      const len = 18;
      g.moveTo(0, cy).lineTo((dx / dm) * len, cy + (dy / dm) * len).stroke({ color: accent, width: 5, cap: 'round' });
      g.circle(0, cy, 5).fill({ color: accent });
    } else {
      g.circle(0, cy, 6).fill({ color: accent });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.moveTo(Math.cos(a) * 6, cy + Math.sin(a) * 6).lineTo(Math.cos(a) * 12, cy + Math.sin(a) * 12).stroke({ color: accent, width: 2.5, cap: 'round' });
      }
    }
  }

  // 設置型シールドは向き別スプライトを足元アンカーで描画。actorLayer に置いて
  // 囲い系イベントの柵リング: 半透明の光る円ストローク(world座標・地面=アクターの下)。
  // 単一 Graphics に円を数本引くだけ。負荷 1/10(描画のみ・毎フレーム1図形)。
  private syncArena(ae: ActiveEvent | null, now: number) {
    const g = this.arenaGfx;
    g.clear();
    if (!ae) return;
    const pulse = 0.5 + 0.5 * Math.sin(now / 260);
    const a = 0.30 + 0.18 * pulse;
    // rescue=緑(ホールド帯) / boss=赤 / horde=青
    const color = ae.kind === 'boss' ? 0xef4444 : ae.kind === 'rescue' ? 0x4ade80 : 0x38bdf8;
    // 内側の淡い塗り(囲われている感)+ 二重リング(太い半透明の外周 / 細く明るい内周)。
    g.circle(ae.x, ae.y, ae.radius - 4).fill({ color, alpha: 0.05 + 0.04 * pulse });
    g.circle(ae.x, ae.y, ae.radius).stroke({ width: 6, color, alpha: a * 0.6 });
    g.circle(ae.x, ae.y, ae.radius - 3).stroke({ width: 2, color, alpha: a });
    // rescue: ホールド進捗を外周の円弧で表示(上端始点・時計回り)。
    // ※ arc の前に開始点へ moveTo しないと、直前に描いた円の終点から弧開始点まで
    //   直線が引かれてしまう(地面を横切る線として見える)。必ず moveTo してから arc。
    if (ae.kind === 'rescue') {
      const frac = Math.max(0, Math.min(1, (ae.holdMs ?? 0) / RESCUE_HOLD_NEED_MS));
      if (frac > 0) {
        const start = -Math.PI / 2;
        const rr = ae.radius + 5;
        g.moveTo(ae.x + Math.cos(start) * rr, ae.y + Math.sin(start) * rr)
          .arc(ae.x, ae.y, rr, start, start + Math.PI * 2 * frac)
          .stroke({ width: 4, color: 0xbbf7d0, alpha: 0.95 });
      }
    }
  }

  // 帰還サークル: フィナーレ撃破/終了アイテム後に出る帰還地点。地面の二重リング+滞在進捗の外周円弧。
  // 単一 Graphics に円を数本引くだけ。負荷 1/10(描画のみ・帰還フェーズ中だけ毎フレーム1図形)。
  private syncReturnCircle(rc: { x: number; y: number; radius: number; dwellMs: number } | null, now: number) {
    const g = this.returnGfx;
    g.clear();
    if (!rc) return;
    const pulse = 0.5 + 0.5 * Math.sin(now / 240);
    const a = 0.34 + 0.2 * pulse;
    const color = 0x86efac; // 帰還=緑(安全・脱出)
    g.circle(rc.x, rc.y, rc.radius - 4).fill({ color, alpha: 0.06 + 0.05 * pulse });
    g.circle(rc.x, rc.y, rc.radius).stroke({ width: 6, color, alpha: a * 0.6 });
    g.circle(rc.x, rc.y, rc.radius - 3).stroke({ width: 2, color, alpha: a });
    // 滞在進捗を外周の円弧で表示(上端始点・時計回り)。arc 前に moveTo して地面を横切る線を防ぐ。
    const frac = Math.max(0, Math.min(1, rc.dwellMs / RETURN_CIRCLE_HOLD_MS));
    if (frac > 0) {
      const start = -Math.PI / 2;
      const rr = rc.radius + 5;
      g.moveTo(rc.x + Math.cos(start) * rr, rc.y + Math.sin(start) * rr)
        .arc(rc.x, rc.y, rr, start, start + Math.PI * 2 * frac)
        .stroke({ width: 4, color: 0xdcfce7, alpha: 0.95 });
    }
  }

  // 制圧イベントの拠点。状態で色分け(未制圧=琥珀/制圧=緑/安全地帯=青)。制圧済みはHPバー＋軍人2体マーカー。
  // 描画は画面内の拠点のみ(画面外はカリング=軽量)。攻撃者は通常敵として敵レンダラが描く。
  private syncBaseSites(sites: BaseSite[] | undefined, now: number, safeBaseId: string | null) {
    const g = this.baseSitesGfx;
    g.clear();
    if (!sites || !sites.length || this.isLabStage) return; // ラボ(屋内/野外)では出さない
    const pulse = 0.5 + 0.5 * Math.sin(now / 260);
    const R = 130; // BASE_CAPTURE_RADIUS と一致
    for (const s of sites) {
      if (this.distanceOutsideViewport(s.x, s.y, R + 60) > 0) continue; // 画面外はスキップ
      const captured = s.status === 'captured';
      const safe = s.id === safeBaseId;
      const color = safe ? 0x60a5fa : captured ? 0x34d399 : 0xfbbf24; // 安全=青/制圧=緑/未制圧=琥珀
      const a = 0.22 + 0.14 * pulse;
      g.circle(s.x, s.y, R - 4).fill({ color, alpha: 0.04 + 0.04 * pulse });
      g.circle(s.x, s.y, R).stroke({ width: 5, color, alpha: a * 0.6 });
      g.circle(s.x, s.y, R - 3).stroke({ width: 2, color, alpha: a });
      if (!captured) {
        // 未制圧: 滞在(制圧)進捗アーク。
        const frac = Math.max(0, Math.min(1, s.dwellMs / BASE_CAPTURE_HOLD_MS));
        if (frac > 0) {
          const start = -Math.PI / 2, rr = R + 5;
          g.moveTo(s.x + Math.cos(start) * rr, s.y + Math.sin(start) * rr)
            .arc(s.x, s.y, rr, start, start + Math.PI * 2 * frac)
            .stroke({ width: 4, color: 0xfff7cc, alpha: 0.95 });
        }
      } else {
        // 制圧済み: HPバー(拠点上部)＋ 軍人2体マーカー。
        const hpFrac = Math.max(0, Math.min(1, s.hp / 100));
        const bw = 88, bh = 7, bx = s.x - bw / 2, by = s.y - R - 22;
        g.rect(bx, by, bw, bh).fill({ color: 0x0b1020, alpha: 0.6 });
        const hpCol = hpFrac > 0.5 ? 0x34d399 : hpFrac > 0.25 ? 0xfbbf24 : 0xef4444;
        g.rect(bx, by, bw * hpFrac, bh).fill({ color: hpCol, alpha: 0.95 });
        g.rect(bx, by, bw, bh).stroke({ width: 1, color: 0xffffff, alpha: 0.4 });
        // 兵士本体は立ち絵スプライト(drawBaseSoldiers)で描く=ここではマーカーを出さない。
      }
    }
    this.drawBaseSoldiers(sites, now);
  }

  // 拠点駐留兵士の立ち絵。救助NPCの shooter 素材を流用(足元アンカー・y-sort・向きEMA)。
  // captured 拠点の soldiers を id ごとにプール/プルーンする。描画のみ(シミュレーション非干渉)。
  private drawBaseSoldiers(sites: BaseSite[], now: number) {
    const seen = new Set<string>();
    const walkFrame = Math.floor(now / PixiScene.RESCUE_WALK_FRAME_MS) % 2;
    for (const s of sites) {
      if (s.status !== 'captured') continue;
      s.soldiers.forEach((sol, i) => {
        const id = `${s.id}-${i}`;
        seen.add(id);
        let sp = this.baseSoldierSprites.get(id);
        if (!sp) { sp = new Sprite(); sp.anchor.set(0.5, 1); this.L.actorLayer.addChild(sp); this.baseSoldierSprites.set(id, sp); }
        let fc = this.baseSoldierFace.get(id);
        if (!fc) { fc = { px: sol.x, face: 1 }; this.baseSoldierFace.set(id, fc); }
        const dxm = sol.x - fc.px; fc.px = sol.x;
        if (dxm > 0.6) fc.face = 1; else if (dxm < -0.6) fc.face = -1;
        const moving = Math.abs(dxm) > 0.3;
        const tex = getTexture(`rescue/shooter-${moving ? walkFrame : 0}`) ?? getTexture('rescue/shooter-0');
        if (tex) {
          sp.texture = tex;
          const boxH = PixiScene.RESCUE_NPC_DISPLAY_H, boxW = boxH;
          const sc = containScale(boxW, boxH, tex.width, tex.height) * this.depthScaleEnemy(sol.y);
          sp.scale.set(sc * fc.face, sc);
          sp.visible = true;
        } else sp.visible = false;
        sp.position.set(Math.round(sol.x), Math.round(sol.y));
        sp.zIndex = sol.y;
      });
    }
    for (const [id, sp] of this.baseSoldierSprites) {
      if (!seen.has(id)) { sp.destroy(); this.baseSoldierSprites.delete(id); this.baseSoldierFace.delete(id); }
    }
  }

  // 裏ボス討伐演出: store.bossCorpse がある間だけ、死亡位置に頭基準で本体絵を描き、
  // ドット絵時代のFFボス風に「ゆっくり消えつつ終盤ほど速く明滅(ゴゴゴ…)」でフェードアウトする。
  // 描画のみ(シミュレーション非干渉)。生体は既に enemies から除かれているので別スプライトで出す。
  private syncBossCorpse(corpse: { type: string; x: number; y: number; w: number; h: number; diedAt: number } | null, now: number) {
    const sp = this.bossCorpseSprite;
    if (!corpse) { if (sp.visible) sp.visible = false; return; }
    const tex = getTexture(corpse.type);
    if (!tex) { sp.visible = false; return; }
    const FADE_MS = 2600; // useGameLoop の BOSS_FADE_MS と一致(超過後は store 側が corpse を消す)
    const t = Math.max(0, Math.min(1, (Date.now() - corpse.diedAt) / FADE_MS));
    const flicker = 1 - t * (0.5 + 0.5 * Math.sin(now / 45)); // 終盤ほど深く明滅
    sp.visible = true;
    sp.texture = tex;
    // 生体と同じ「分離描画」で配置(帯=corpse.w×h の上に絵を伸ばす)。これで討伐時に縮まない(社長指摘)。
    const fit = BOSS_SPRITE_FIT[corpse.type] ?? BOSS_FIT_DEFAULT;
    sp.anchor.set(0.5, 0.5);
    const scale = (corpse.w / fit.w) / tex.width;
    const spriteW = scale * tex.width, spriteH = scale * tex.height;
    const stripCx = corpse.x + corpse.w / 2, stripCy = corpse.y + corpse.h / 2;
    sp.scale.set(scale, scale);
    sp.position.set(Math.round(stripCx + (0.5 - fit.cx) * spriteW), Math.round(stripCy + (0.5 - fit.cy) * spriteH));
    sp.zIndex = corpse.y + corpse.h + 1; // アクターと同じ y-sort 帯
    sp.alpha = Math.max(0, (1 - t) * flicker);
  }

  // 瀕死(HP≤20): 暗い赤のビネットが心拍(ドクン…ドクン…)で脈動。HP≥21で解除。screen座標・全画面オーバスキャン。
  private syncLowHpVignette(health: number, now: number) {
    const v = this.lowHpVignette;
    if (health > LOW_HP_THRESHOLD) {
      if (v.visible) { v.visible = false; v.alpha = 0; }
      return;
    }
    v.visible = true;
    // 心拍: 1周期に2拍のガウシアン(ドクン…ドクン…)。
    const ph = (now % LOW_HP_HEARTBEAT_MS) / LOW_HP_HEARTBEAT_MS;
    const bump = (c: number, w: number) => Math.exp(-((ph - c) ** 2) / w);
    const beat = Math.min(1, bump(0.04, 0.0010) + bump(0.22, 0.0013));
    v.position.set(this.screenW / 2, this.screenH / 2);
    v.width = this.screenW * 1.06;  // 隅まで覆うオーバスキャン
    v.height = this.screenH * 1.06;
    v.alpha = 0.20 + 0.26 * beat;   // 0.20→0.46(明るい側を抑え、振れ幅も縮めてチカチカ軽減)
  }

  // 深層域グレーディング: 深層域(eligible かつ原点距離>=D)の間だけ stage ルートへ退色セピアの
  // ColorMatrixFilter を掛け、enter/exit を約1秒でフェード(filter.alpha 補間)。描画のみ=store非干渉。
  // amount≈0 のときはフィルタを外して全画面パスを発生させない(非深層域での追加コスト無し)。
  private syncDeepZoneGrade(eligible: boolean, originDist: number, now: number) {
    if (!DEEP_ZONE_GRADE_ENABLED) return;
    const dt = this.lastGradeNow ? Math.min(0.1, (now - this.lastGradeNow) / 1000) : 0;
    this.lastGradeNow = now;
    // ヒステリシス(行ったり来たりでポップしない): enter=D / exit=D-200。
    if (eligible) {
      if (this.deepGradeOn) { if (originDist < DEEP_ZONE_GRADE_D - 200) this.deepGradeOn = false; }
      else if (originDist >= DEEP_ZONE_GRADE_D) this.deepGradeOn = true;
    } else {
      this.deepGradeOn = false;
    }
    const target = this.deepGradeOn ? 1 : 0;
    if (this.deepGradeAmount !== target) {
      const step = dt / DEEP_ZONE_GRADE_FADE_S;
      this.deepGradeAmount = target > this.deepGradeAmount
        ? Math.min(target, this.deepGradeAmount + step)
        : Math.max(target, this.deepGradeAmount - step);
    }
    if (this.deepGradeAmount <= 0.001) {
      if (this.L.stage.filters && (this.L.stage.filters as Filter[]).length) this.L.stage.filters = [];
      return;
    }
    if (!this.deepGradeFilter) {
      this.deepGradeFilter = new ColorMatrixFilter();
      this.deepGradeFilter.matrix = buildDeepGradeMatrix(DEEP_ZONE_GRADE_SAT);
    }
    const cur = this.L.stage.filters as Filter[] | null;
    if (!cur || !cur.includes(this.deepGradeFilter)) this.L.stage.filters = [this.deepGradeFilter];
    this.deepGradeFilter.alpha = this.deepGradeAmount; // 単位行列↔セピア行列の線形補間(描画のみ)
  }

  // 救助NPC(survivor)の描画。本体は受領素材スプライト(2コマ歩き・足元アンカーで y-sort)、
  // HPバー/コールアウトは rescueGfx(常に最前)。本体スプライトは id ごとにプール/プルーン。
  private static readonly RESCUE_NPC_DISPLAY_H = 54; // 表示の基準高さ(px)
  private static readonly RESCUE_WALK_FRAME_MS = 170;
  private drawRescueSurvivors(survivors: RescueSurvivor[], now: number) {
    const seen = new Set<string>();
    const walkFrame = Math.floor(now / PixiScene.RESCUE_WALK_FRAME_MS) % 2;
    for (const s of survivors) {
      seen.add(s.id);
      const base = s.subtype === 'shooter' ? 'rescue/shooter' : s.gender === 'f' ? 'rescue/civ-f' : 'rescue/civ-m';
      const moving = Math.hypot(s.vx, s.vy) > 4;
      const tex = getTexture(`${base}-${moving ? walkFrame : 0}`) ?? getTexture(`${base}-0`);
      let sp = this.rescueSurvivorSprites.get(s.id);
      if (!sp) { sp = new Sprite(); sp.anchor.set(0.5, 1); this.L.actorLayer.addChild(sp); this.rescueSurvivorSprites.set(s.id, sp); }
      const footX = s.x + s.width / 2;
      const footY = s.y + s.height;
      if (tex) {
        sp.texture = tex;
        const boxH = PixiScene.RESCUE_NPC_DISPLAY_H;
        const boxW = boxH; // contain-fit(縦合わせ)
        const sc = containScale(boxW, boxH, tex.width, tex.height) * this.depthScaleEnemy(footY);
        // 左右の向き: vx を平滑化(EMA)＋デッドゾーンで決め、パタパタ反転を防ぐ(素材は右向き想定)。
        let fs = this.rescueFace.get(s.id);
        if (!fs) { fs = { vx: s.vx, face: 1 }; this.rescueFace.set(s.id, fs); }
        fs.vx = fs.vx * 0.82 + s.vx * 0.18;
        if (fs.vx > 7) fs.face = 1; else if (fs.vx < -7) fs.face = -1; // 範囲内は現状維持
        sp.scale.set(sc * fs.face, sc);
        sp.visible = true;
      }
      // 救助成功の退場: 走りながらフェードアウト。
      sp.alpha = s.savedAt ? Math.max(0, 1 - (now - s.savedAt) / RESCUE_OUTRO_MS) : 1;
      sp.position.set(Math.round(footX), Math.round(footY));
      sp.zIndex = footY;
    }
    for (const [id, sp] of this.rescueSurvivorSprites) {
      if (!seen.has(id)) { sp.destroy(); this.rescueSurvivorSprites.delete(id); this.rescueFace.delete(id); }
    }
    // HPバー＋コールアウト(常に最前=rescueGfx)。
    const g = this.rescueGfx;
    g.clear();
    for (const s of survivors) {
      const cx = s.x + s.width / 2;
      const frac = Math.max(0, Math.min(1, s.health / s.maxHealth));
      const bw = PixiScene.RESCUE_NPC_DISPLAY_H * 0.5;
      const bx = cx - bw / 2;
      const by = s.y + s.height - PixiScene.RESCUE_NPC_DISPLAY_H * this.depthScaleEnemy(s.y + s.height) - 8;
      g.rect(bx, by, bw, 3).fill({ color: 0x000000, alpha: 0.55 });
      g.rect(bx, by, bw * frac, 3).fill({ color: 0x4ade80 });
      if (s.helpUntil && now < s.helpUntil) {
        g.circle(cx + bw * 0.6, by - 6, 5).fill({ color: 0xfca5a5, alpha: 0.92 });
        g.circle(cx + bw * 0.6, by - 6, 5).stroke({ width: 1, color: 0x7f1d1d, alpha: 0.92 });
      }
      // 救助成功: 頭上にハートマーク(少し浮上＋フェード)。
      if (s.savedAt) {
        const t = (now - s.savedAt) / RESCUE_OUTRO_MS;
        if (t >= 0 && t < 1) {
          const ha = Math.max(0, 1 - t);
          const hy = by - 8 - 14 * t; // ふわっと上昇
          const hs = 4.2;
          const col = 0xfb7185;
          // ハート(左右の丸＋下の三角)。
          g.circle(cx - hs * 0.5, hy - hs * 0.3, hs * 0.62).fill({ color: col, alpha: ha });
          g.circle(cx + hs * 0.5, hy - hs * 0.3, hs * 0.62).fill({ color: col, alpha: ha });
          g.poly([cx - hs, hy, cx + hs, hy, cx, hy + hs * 1.25]).fill({ color: col, alpha: ha });
        }
      }
    }
    // パニック逃走中(被弾2秒)の汗マークは、環境光(カラーグレード/暗幕/ティルトシフト)の影響を
    // 受けないよう uiLayer(screen座標)に描く。world.position を足して world→screen 変換。
    const sg = this.rescueSweatGfx;
    sg.clear();
    const rox = this.L.world.position.x, roy = this.L.world.position.y;
    for (const s of survivors) {
      if (s.savedAt) continue; // 退場中はハートを優先(汗は出さない)
      if (!(s.speedBoostUntil && now < s.speedBoostUntil)) continue;
      const cx = s.x + s.width / 2 + rox;
      const headY = s.y + s.height - PixiScene.RESCUE_NPC_DISPLAY_H * this.depthScaleEnemy(s.y + s.height) - 6 + roy;
      const bob = Math.sin(now / 90) * 1.5;
      const sxp = cx - PixiScene.RESCUE_NPC_DISPLAY_H * 0.3;
      const syp = headY + bob;
      // しずく(上が尖り・下が丸い)＋ハイライト。
      sg.poly([sxp, syp - 5, sxp - 3, syp + 1.5, sxp + 3, syp + 1.5]).fill({ color: 0x7dd3fc, alpha: 0.96 });
      sg.circle(sxp, syp + 2, 3.2).fill({ color: 0x7dd3fc, alpha: 0.96 });
      sg.circle(sxp - 1, syp + 1, 1).fill({ color: 0xeaf6ff, alpha: 0.96 });
    }
  }

  // 足元Yで y-sort するので、キャラが盾の上部に被る(当たりは下部のみ)。
  private syncShields(projectiles: Projectile[], now: number) {
    const seen = new Set<string>();
    for (const p of projectiles) {
      if (p.weaponType !== 'shield') continue;
      if (p.createdAt > now) continue;
      seen.add(p.id);
      let v = this.shieldViews.get(p.id);
      if (!v) {
        const container = new Container();
        const sprite = new Sprite();
        sprite.anchor.set(0.5, 1); // 下辺中央 = 足元
        container.addChild(sprite);
        this.L.actorLayer.addChild(container);
        v = { container, sprite };
        this.shieldViews.set(p.id, v);
      }
      this.drawShield(v, p);
    }
    for (const [id, v] of this.shieldViews) {
      if (!seen.has(id)) {
        v.container.destroy({ children: true });
        this.shieldViews.delete(id);
      }
    }
  }

  private drawShield(v: { container: Container; sprite: Sprite }, p: Projectile) {
    // 外向き法線(=防ぐ向き)で4方向スプライトを選択。
    const dir = p.direction;
    const name = Math.abs(dir.x) >= Math.abs(dir.y)
      ? (dir.x >= 0 ? 'shield-right' : 'shield-left')
      : (dir.y >= 0 ? 'shield-down' : 'shield-up');
    const tex = getTexture(name);
    if (tex && v.sprite.texture !== tex) v.sprite.texture = tex;

    // バッシュで押し出されている間は描画位置を補間(drawProjectile と同じ)。
    let drawX = p.x;
    let drawY = p.y;
    if (
      p.shoveStartAt !== undefined &&
      p.shoveDuration !== undefined &&
      p.shoveStartX !== undefined &&
      p.shoveStartY !== undefined
    ) {
      const t = Math.max(0, Math.min(1, (Date.now() - p.shoveStartAt) / Math.max(1, p.shoveDuration)));
      const eased = 1 - Math.pow(1 - t, 3);
      drawX = p.shoveStartX + (p.x - p.shoveStartX) * eased;
      drawY = p.shoveStartY + (p.y - p.shoveStartY) * eased;
    }
    const footX = drawX + p.width / 2;
    const footY = drawY + p.height; // 下辺 = 足元
    const baseScale = tex && tex.height > 0 ? SHIELD_DISPLAY_H / tex.height : 1;

    // ガチャンッ!: 上から落ちて着地し、軽くスカッシュして「構えた」感。
    const age = Date.now() - p.createdAt;
    let drop = 0;
    let sqx = 1;
    let sqy = 1;
    if (age < SHIELD_DEPLOY_MS) {
      const t = age / SHIELD_DEPLOY_MS;
      const e = 1 - Math.pow(1 - t, 3);             // easeOutCubic で着地
      drop = (1 - e) * SHIELD_DEPLOY_DROP;          // 上から下りる
      const squash = Math.sin(t * Math.PI) * 0.16;  // 着地でぐにゃっ
      sqx = 1 + squash;
      sqy = 1 - squash;
    }
    // 被弾シェイク(攻撃されている=ダメージを受けている表現): 直近ヒットから短時間、減衰する横揺れ。
    const sinceHit = Date.now() - (p.shieldHitAt ?? -99999);
    let shakeX = 0;
    const hitT = sinceHit < HIT_SHAKE_MS ? 1 - sinceHit / HIT_SHAKE_MS : 0;
    if (hitT > 0) shakeX = Math.sin(sinceHit / 16) * HIT_SHAKE_PX * hitT;
    v.container.position.set(footX + shakeX, footY - drop);
    v.container.zIndex = footY;
    const shieldDepth = this.depthScale(footY); // 設置物として地面遠近に乗せる(視覚のみ・判定不変)
    v.sprite.scale.set(baseScale * sqx * shieldDepth, baseScale * sqy * shieldDepth);

    // 寿命末で早めにフェードアウト。さらに他の者(敵/木)と同じ地平線フェードを乗算(消える位置を統一)。
    const remaining = p.duration - age;
    v.sprite.alpha = Math.max(0, Math.min(1, remaining / 600)) * this.horizonActorAlpha(footY);

    // 耐久が減ると赤み(亀裂感)。tint のみ・常時glowなし。被弾直後は赤白フラッシュを上書き。
    const hp = p.shieldHp ?? 1;
    const maxHp = p.shieldMaxHp ?? hp;
    const worn = maxHp > 0 ? 1 - Math.max(0, Math.min(1, hp / maxHp)) : 0;
    if (hitT > 0.35) {
      v.sprite.tint = 0xffd0d0; // 被弾フラッシュ(赤白)
    } else if (worn > 0.01) {
      const c = Math.round(255 - 150 * (0.6 * worn));
      v.sprite.tint = (255 << 16) | (c << 8) | c;
    } else {
      v.sprite.tint = 0xffffff;
    }
  }

  private drawProjectile(g: Graphics, p: Projectile) {
    g.clear();
    g.rotation = 0;
    g.scale.set(1);
    g.alpha = 1;
    let drawX = p.x;
    let drawY = p.y;
    if (
      p.shoveStartAt !== undefined &&
      p.shoveDuration !== undefined &&
      p.shoveStartX !== undefined &&
      p.shoveStartY !== undefined
    ) {
      const t = Math.max(0, Math.min(1, (Date.now() - p.shoveStartAt) / Math.max(1, p.shoveDuration)));
      const eased = 1 - Math.pow(1 - t, 3);
      drawX = p.shoveStartX + (p.x - p.shoveStartX) * eased;
      drawY = p.shoveStartY + (p.y - p.shoveStartY) * eased;
    }
    const cx = drawX + p.width / 2;
    const cy = drawY + p.height / 2;
    g.position.set(cx, cy);

    // 「設置物」だけ地面遠近(depthScale)に乗せる(視覚のみ・判定不変)。弾や攻撃エフェクトは対象外。
    // 範囲リング(trap/decoy の射程円)は半径を depthD で割って“見た目の実寸”を保つ(縮ませない)。
    const placedObject = p.weaponType === 'grenade' || p.weaponType === 'trap' || p.weaponType === 'decoy';
    const depthD = placedObject ? this.depthScale(drawY + p.height) : 1;

    if (p.reflected) {
      g.circle(0, 0, Math.max(p.width, p.height) * 0.7).fill({ color: 0xfcd34d });
    }

    switch (p.weaponType) {
      case 'handgun':
      case 'rifle': {
        g.rotation = Math.atan2(p.direction.y, p.direction.x);
        const len = Math.max(p.width, 6) * (p.weaponType === 'rifle' ? 2.6 : 1.7);
        const hh = Math.max(2, p.height / 2);
        g.rect(-len / 2, -hh / 2, len, hh).fill({ color: p.crit ? 0xfde047 : 0xfef3c7 });
        break;
      }
      case 'shotgun': {
        g.circle(0, 0, Math.max(2, p.width / 2)).fill({ color: p.crit ? 0xfde047 : 0xfdba74 });
        break;
      }
      case 'phill-bullet': {
        // リボルバー弾=やや大きめ・輝度高めの弾。橙の芯＋白い軌跡。
        g.rotation = Math.atan2(p.direction.y, p.direction.x);
        const len = Math.max(p.width, 8) * 2.2;
        const hh = Math.max(3, p.height / 2);
        g.rect(-len / 2, -hh / 2, len, hh).fill({ color: 0xffedd5 });
        g.circle(len / 2 - 2, 0, hh * 0.9).fill({ color: 0xfb923c });
        break;
      }
      case 'enemy_bolt': {
        if (p.reflected) break;
        g.circle(0, 0, p.width / 2).fill({ color: 0xb91c1c });
        g.circle(0, 0, p.width / 3).fill({ color: 0xfca5a5 });
        break;
      }
      case 'grenade': {
        const t = Math.max(0, Math.min(1, (Date.now() - p.createdAt) / Math.max(1, p.duration)));
        const hopEnvelope = Math.max(0, 1 - t * 0.58);
        const hop = Math.abs(Math.sin(t * Math.PI * 5.2)) * 9 * hopEnvelope;
        g.ellipse(0, 4, Math.max(3, p.width * 0.48), Math.max(1.2, p.height * 0.14))
          .fill({ color: 0x000000, alpha: 0.28 });
        g.circle(0, -hop, Math.max(3, p.width / 2)).fill({ color: 0x1f2937 });
        g.circle(-1, -hop - 1, Math.max(1.5, p.width / 5)).fill({ color: 0x9ca3af, alpha: 0.55 });
        break;
      }
      case 'fire-knife-projectile': {
        // 飛行中: 進行方向へ向いた小さなドット調ナイフ(刃=銀+橙)。
        // 刺さった後: 短い火種(赤橙の明滅)を足して導火線感を出す(常時glowなし・軽量)。
        g.rotation = Math.atan2(p.direction.y, p.direction.x);
        const len = 13;
        const hh = 3;
        g.rect(-len / 2, -hh / 2, len * 0.62, hh).fill({ color: 0xcbd5e1 });       // 刃
        g.rect(len / 2 - len * 0.42, -hh / 2 - 0.5, len * 0.42, hh + 1).fill({ color: 0x7c2d12 }); // 柄
        g.poly([len / 2, 0, len * 0.1, -hh, len * 0.1, hh]).fill({ color: 0xf1f5f9 }); // 切先
        if (p.isStuck) {
          const blink = 0.55 + Math.sin(Date.now() / 90) * 0.45; // 火種の明滅(導火線)
          g.circle(-len / 2 - 1, 0, 2.6).fill({ color: 0xf97316, alpha: 0.9 * blink });
          g.circle(-len / 2 - 1, 0, 1.3).fill({ color: 0xfde047, alpha: blink });
        }
        break;
      }
      case 'drone-boomerang-projectile': {
        // ドット調のドローン/ブーメラン。常時回転(停止中は強めの周囲リングで判定範囲を示す)。
        g.rotation = (Date.now() / 90) % (Math.PI * 2);
        const rr = Math.max(5, p.width * 0.5);
        // 「く」の字(ブーメラン)2枚羽。
        g.poly([-rr, -2, rr * 0.2, -2, rr * 0.2, -rr, rr * 0.2 + 4, -rr, rr * 0.2 + 4, 2, -rr, 2]).fill({ color: 0x67e8f9 });
        g.circle(0, 0, 2.2).fill({ color: 0xecfeff });
        if (p.boomPhase === 'stop') {
          // 範囲リング(円は回転しても見た目同じなので g.rotation はそのままでOK)。
          const range = p.area ?? 0;
          const pulse = 0.7 + Math.sin(Date.now() / 120) * 0.3;
          g.circle(0, 0, range).stroke({ color: 0x06121f, alpha: 0.5, width: 3 });
          g.circle(0, 0, range).stroke({ color: 0x22d3ee, alpha: 0.5 * pulse, width: 1.5 });
        }
        break;
      }
      case 'homing-missile': {
        // 小型シアン矢形弾。進行方向へ向いた矢印(三角形)+光点。
        g.rotation = Math.atan2(p.direction.y, p.direction.x);
        const r = Math.max(3, p.width / 2);
        g.poly([-r * 1.8, -r * 0.55, r, 0, -r * 1.8, r * 0.55]).fill({ color: 0x38bdf8, alpha: 0.92 });
        g.circle(0, 0, r * 0.55).fill({ color: 0xecfeff });
        break;
      }
      case 'trap': {
        const age = Math.max(0, Math.min(1, (Date.now() - p.createdAt) / Math.max(1, p.duration)));
        const pulse = 0.65 + Math.sin(age * Math.PI * 12) * 0.16;
        const radius = p.area ?? 34;
        g.circle(0, 0, radius / depthD).stroke({ color: 0x38bdf8, alpha: 0.42 * pulse, width: 1.5 });
        g.circle(0, 0, Math.max(4, p.width * 0.38)).fill({ color: 0x0f172a, alpha: 0.88 });
        g.circle(0, 0, Math.max(2, p.width * 0.18)).fill({ color: 0x7dd3fc, alpha: 0.76 });
        break;
      }
      case 'decoy': {
        // 射程サークル。area に射程半径が載っている。クールダウン円と同系の
        // 単一ストローク円(軽量)。黒フチ+シアン本線で暗背景でも視認できる。
        const range = p.area ?? 0;
        if (range > 0) {
          const pulse = 0.85 + Math.sin(Date.now() / 320) * 0.15;
          g.circle(0, 0, range / depthD).stroke({ color: 0x06121f, alpha: 0.5, width: 3 });          // 黒フチ
          g.circle(0, 0, range / depthD).stroke({ color: 0x38bdf8, alpha: 0.55 * pulse, width: 1.5 }); // シアン本線
        }
        // 小さめの円盤型装置。中央のコアが軽く明滅(常時glowなし)。
        const blink = 0.6 + Math.sin(Date.now() / 140) * 0.4;
        const rr = Math.max(5, p.width * 0.46);
        g.ellipse(0, 3, rr * 1.05, rr * 0.42).fill({ color: 0x000000, alpha: 0.26 }); // 影
        g.circle(0, 0, rr).fill({ color: 0x1f2937, alpha: 0.95 });                     // 本体
        g.circle(0, 0, rr).stroke({ color: 0x38bdf8, alpha: 0.6, width: 1.4 });        // 縁
        g.circle(0, 0, Math.max(2, rr * 0.34)).fill({ color: 0x7dd3fc, alpha: 0.85 * blink }); // コア
        break;
      }
      case 'shield': {
        // 外向き法線(p.direction)で回転。ローカル +x = 表(外/敵側)、-x = 裏(プレイヤー側)。
        // 中央が +x へ反った曲面の防壁(左向き設置なら「[」の形に見える)。
        g.rotation = Math.atan2(p.direction.y, p.direction.x);
        // 消滅(寿命切れ)が近づくと早めにフェードアウトする。
        const shieldRemaining = p.duration - (Date.now() - p.createdAt);
        g.alpha = Math.max(0, Math.min(1, shieldRemaining / 600));
        const halfLen = Math.max(p.width, p.height) / 2; // 壁の長さ(local y)
        const t = Math.min(p.width, p.height);           // 厚み(local x)
        const half = t / 2;
        const curveDepth = Math.max(6, half * 1.4);      // 中央の反り量
        const N = 8;
        const cxAt = (y: number) => curveDepth * (1 - (y / halfLen) * (y / halfLen)); // 中央ほど+x
        // プレート外形(表面→裏面)。裏=濃いシルバーをベースに敷く。
        const body: number[] = [];
        for (let i = 0; i <= N; i++) { const y = -halfLen + (2 * halfLen) * (i / N); body.push(cxAt(y) + half, y); }
        for (let i = N; i >= 0; i--) { const y = -halfLen + (2 * halfLen) * (i / N); body.push(cxAt(y) - half, y); }
        g.poly(body).fill({ color: 0x374151 });          // 裏(濃いシルバー・少し暗め)
        // 表面(+x寄り)のシルバー帯(少し暗め)。
        const frontW = Math.max(2, t * 0.44);
        const front: number[] = [];
        for (let i = 0; i <= N; i++) { const y = -halfLen + (2 * halfLen) * (i / N); front.push(cxAt(y) + half, y); }
        for (let i = N; i >= 0; i--) { const y = -halfLen + (2 * halfLen) * (i / N); front.push(cxAt(y) + half - frontW, y); }
        g.poly(front).fill({ color: 0x94a3b8 });          // 表(シルバー・少し暗め)
        g.poly(body).stroke({ color: 0x111827, alpha: 0.85, width: 1.4 }); // 縁取り
        // 持ち手(裏側 -x、中央)。
        g.rect(-half - 4, -halfLen * 0.3, 3, halfLen * 0.6).fill({ color: 0x1f2937 });
        g.circle(-half - 2.5, -halfLen * 0.3, 1.6).fill({ color: 0x1f2937 });
        g.circle(-half - 2.5, halfLen * 0.3, 1.6).fill({ color: 0x1f2937 });
        // 耐久が減ると表面に軽い赤み(亀裂感)。常時glowなし。
        const hp = p.shieldHp ?? 1;
        const maxHp = p.shieldMaxHp ?? hp;
        const worn = maxHp > 0 ? 1 - Math.max(0, Math.min(1, hp / maxHp)) : 0;
        if (worn > 0.01) {
          const blinkW = 0.7 + Math.sin(Date.now() / 150) * 0.3;
          g.poly(front).fill({ color: 0xf87171, alpha: 0.2 * worn * blinkW });
        }
        break;
      }
      default: {
        g.circle(0, 0, p.width / 2).fill({ color: 0xf3f4f6 });
        break;
      }
    }
    // 設置物は地面遠近で一括スケール(範囲リングは上で半径補正済み=実寸維持)＋他の者と同じ地平線フェード。
    if (placedObject) {
      if (depthD !== 1) g.scale.set(depthD);
      g.alpha = this.horizonActorAlpha(drawY + p.height);
    }
  }

  // ---- 屋内(研究施設)ステージの床/壁/扉/マーカー(仮実装=塗り矩形) ----------
  private syncLab() {
    const s = useGameStore.getState();
    const indoor = s.indoorMode;
    const persp = indoor && LAB_PERSP; // A1: 研究所だけ「床を遠近」にする試作(フラグ時のみ)。
    // 屋外の screen-space 背景/床/前景と world の木は屋内では隠す。
    // ?labpersp の屋内床は焼き込み遠近プレート(updateLabFloorPlate)で描くので、
    // 屋外用の縦ストリップ groundBase は屋内では隠す。
    this.L.farBackdrop.visible = !indoor;
    // 遠景森1(森シルエット帯)の有無はステージスキン表(単一の真実)で決める。lab は false(森帯を出さない)。
    // ※散在分岐(isLabStage 等)を表駆動へ移す第一歩。残りスロットも順次この表へ集約予定。
    const skin = STAGE_SKINS[resolveStageSkinKey(s.stageTheme, s.farBackdrop)];
    this.L.horizonForest.visible = !indoor && skin.horizon1Visible;
    this.L.groundBase.visible = !indoor;
    this.L.frontForest.visible = !indoor;
    this.L.backgroundLayer.visible = !indoor;
    if (!indoor) {
      this.applyOutdoorGroundTheme(s.stageTheme, s.farBackdrop); // 研究所スキン(lab)なら屋外地面をラボ床へ。forest は従来へ復元。遠景差し替えは farBackdrop。
      this.applyStage3Front(s.farBackdrop); // 近景森の差し替え(city=屋根帯/snow=氷壁。override無しは森・mask不変)
      this.applyGroundOverride(s.farBackdrop); // 地面の差し替え(snow=雪原。city/labは別管理、override無しは森)
      this.applyHorizonOverride(s.farBackdrop); // 地平帯(遠景森1)の差し替え(snow=氷壁帯。city/labは別管理)
      this.updateLabFloorPlate(false);
      if (this.labGfx) this.labGfx.visible = false;
      if (this.labVoid) this.labVoid.visible = false;
      if (this.labFloor) this.labFloor.visible = false;
      if (this.labFloorDecor) this.labFloorDecor.visible = false;
      if (this.labWallShadow) this.labWallShadow.visible = false;
      if (this.labWalls) this.labWalls.visible = false;
      for (const ts of this.labWallActors) ts.visible = false;
      for (const sp of this.labPropSprites) sp.visible = false;
      // 四隅の周辺減光(ビネット)はステージ1と同じ強さで適用(社長指示)。
      this.vignette.alpha = ENV_VIGNETTE_ALPHA;
      return;
    }
    // 屋内は周辺減光(環境の暗がり)を広範囲に強める(社長指示)。
    this.vignette.alpha = LAB_VIGNETTE_ALPHA;
    // A1 試作(?labpersp): フラット床/変種/void を使わず、ステージ1の遠近 ground を研究所床テクスチャで流用。
    // 当たり判定/移動/aim は不変(描画だけ斜め遠近)。壁/プロップ/アクターは現状(depthScale)のまま。
    if (persp) {
      // 焼き込み遠近プレート(一枚絵)を全画面に敷く。フラット床/変種/void/台形メッシュは使わない。
      this.updateLabFloorPlate(true);
      if (this.labVoid) this.labVoid.visible = false;
      if (this.labFloor) this.labFloor.visible = false;
      if (this.labFloorDecor) this.labFloorDecor.visible = false;
    } else {
      this.updateLabFloorPlate(false);
    }
    // 背景: 天井/void プレートを外周マージンに敷く(床の下=最下層)。床は迷路グリッド(LAB_BOUNDS)だけを
    // 覆い、外側マージンはこの void が見える。低速パララックスで「奥」を表現。(?labpersp 時は使わない)
    const voidTex = persp ? null : getTexture('lab/lab-bg-void');
    if (voidTex) {
      if (!this.labVoid) {
        this.labVoid = new TilingSprite({ texture: voidTex, width: LAB_OUTER_BOUNDS.width, height: LAB_OUTER_BOUNDS.height });
        this.labVoid.position.set(LAB_OUTER_BOUNDS.x, LAB_OUTER_BOUNDS.y);
        const vsc = LAB_VOID_TILE / voidTex.width;
        this.labVoid.tileScale.set(vsc, vsc);
        this.L.world.addChildAt(this.labVoid, 0); // 最下層
      }
      this.labVoid.visible = true;
      // パララックス: world は -camera で動くので、tilePosition を +camera*係数 ずらすと見かけ上ゆっくり流れる。
      this.labVoid.tilePosition.set(s.camera.x * LAB_VOID_PARALLAX, s.camera.y * LAB_VOID_PARALLAX);
    }
    // 床(新ドット絵シームレスタイル=clean)。迷路グリッド(LAB_BOUNDS)のみを覆う(外側は void が見える)。
    const LAB_FLOOR_TILE = 120; // 1タイルの world サイズ(px)。ドット絵が読める粒度(旧300は大きすぎた)。
    const floorTex = persp ? null : (getTexture('lab-floor/lab-floor-clean')
      ?? getTexture('lab-floor/lab-floor-ground') ?? getTexture('lab-floor/lab-floor-r1-c1'));
    if (floorTex) {
      if (!this.labFloor) {
        this.labFloor = new TilingSprite({ texture: floorTex, width: LAB_BOUNDS.width, height: LAB_BOUNDS.height });
        this.labFloor.position.set(LAB_BOUNDS.x, LAB_BOUNDS.y);
        this.labFloor.tileScale.set(LAB_FLOOR_TILE / floorTex.width, LAB_FLOOR_TILE / floorTex.height);
        this.labFloor.tint = LAB_ENV_TINT; // ステージ全体(床)を沈める(オブジェクトは別)
        const vidx = this.labVoid ? this.L.world.getChildIndex(this.labVoid) + 1 : 0;
        this.L.world.addChildAt(this.labFloor, vidx); // void の上・壁/アクターの下
      }
      this.labFloor.visible = true;
    }
    // 床の変種パッチ(blood/grime/crack/scorch)＋隅AO を各部屋に決定的散布(1度だけ生成)。?labpersp 時は world-space で
    // 遠近床と整合しないので生成しない(A1)。
    if (!persp) this.buildLabFloorDecor(LAB_FLOOR_TILE);
    else if (this.labFloorDecor) this.labFloorDecor.visible = false;
    // 壁: 縦横を統一した立体規約。各壁矩形を foot-anchored Container として actorLayer に置き、
    // zIndex=footY(下辺)で深度ソート → プレイヤー/敵が壁の「上(北)」へ回り込める。背の高い壁は
    // Y方向にスライスし各スライスを自分の footY でソート(長い壁でも正しく前後)。前面=lab-wall-front
    // (左右シームレス)/ 上端=lab-wall-top キャップ。外周リング(マップ境界・暗い野外)は従来どおり
    // アクター下に平面で敷く(数が多く・回り込み不要)。装飾窓壁 lab-wall2-panel は広い横壁の要所のみ。
    const frontTex = getTexture('lab/lab-wall-front');
    const topTex = getTexture('lab/lab-wall-top');
    const panelTex = getTexture('lab/lab-wall2-panel');
    {
      if (!this.labWalls) {
        this.labWalls = new Container(); // 外周リング(平面)＋z順アンカー
        const base = this.labFloorDecor ?? this.labFloor;
        this.L.world.addChildAt(this.labWalls, base ? this.L.world.getChildIndex(base) + 1 : 0); // 床/変種の上・アクターの下
      }
      this.labWalls.visible = true;
      // 壁下辺の焼き込み落ち影(右上光源→左下へオフセット)。床/変種の上・壁の下に置く。
      if (!this.labWallShadow) {
        this.labWallShadow = new Graphics();
        this.L.world.addChildAt(this.labWallShadow, this.L.world.getChildIndex(this.labWalls)); // 壁の直下
      }
      this.labWallShadow.visible = true;
      const sig = LAB_DOORS.map(d => (s.labDoors.some(sd => sd.id === d.id && sd.open) ? '1' : '0')).join('') + `|${LAB_WALL_RISE}`;
      if (this.labWallsSig !== sig) {
        this.labWallsSig = sig;
        const sh = this.labWallShadow; sh.clear();
        this.labWalls.removeChildren().forEach(c => c.destroy());
        for (const c of this.labWallActors) c.destroy({ children: true });
        this.labWallActors = [];
        this.labWallDepth = [];
        this.labWallDepthRefY = NaN; // 再構築後は次フレームで必ず深度再計算
        const RISE = LAB_WALL_RISE;
        const SEG = 160; // 背の高い壁のスライス高(px)。各スライスが自分の footY でソート。
        const b = LAB_BOUNDS;
        const isOuter = (r: { x: number; y: number; width: number; height: number }) =>
          r.x <= b.x + 1 || r.y <= b.y + 1 || r.x + r.width >= b.x + b.width - 1 || r.y + r.height >= b.y + b.height - 1;
        const shadowRect = (r: { x: number; y: number; width: number; height: number }) => {
          for (const [d, a] of [[16, 0.22], [8, 0.16]] as [number, number][]) {
            sh.rect(r.x - d, r.y + d, r.width, r.height).fill({ color: 0x04060a, alpha: a });
          }
        };
        // 立体ブロック(actorLayer・足元アンカー)。前面＋上端キャップ＋不透明下地。
        const addBlock = (x: number, _y: number, w: number, h: number, footY: number, decorative: boolean) => {
          const cont = new Container();
          const bg = new Graphics();
          bg.rect(0, 0, w, h + RISE).fill({ color: LAB_WALL_FILL });
          cont.addChild(bg);
          const faceTex = decorative && panelTex ? panelTex : frontTex;
          if (faceTex) {
            const front = new TilingSprite({ texture: faceTex, width: w, height: h + RISE });
            const fsc = (h + RISE) / faceTex.height;
            front.tileScale.set(fsc, fsc);
            front.tint = LAB_ENV_TINT;
            cont.addChild(front);
          }
          if (topTex) {
            const capH = Math.min(h + RISE, Math.max(8, Math.round(topTex.height * (w / topTex.width))), 26);
            const cap = new TilingSprite({ texture: topTex, width: w, height: capH });
            const csc = capH / topTex.height;
            cap.tileScale.set(csc, csc);
            cap.tint = LAB_ENV_TINT;
            cont.addChild(cap); // 上端キャップ(コンテナ最上部=北端)
          }
          cont.position.set(x, footY - (h + RISE));
          cont.zIndex = footY;
          this.L.actorLayer.addChild(cont);
          this.labWallActors.push(cont);
          this.labWallDepth.push({ cont, footY, fullH: h + RISE, x0: x, w }); // 擬似遠近(A1高さ/A2投影)用に保持
        };
        const addWall = (rect: { x: number; y: number; width: number; height: number }) => {
          shadowRect(rect);
          if (isOuter(rect)) {
            // 外周リング: アクター下に平面で敷く(下地→前面)。回り込み不要・数が多いので軽量に。
            const bg = new Graphics();
            bg.rect(rect.x, rect.y, rect.width, rect.height).fill({ color: LAB_WALL_FILL });
            this.labWalls!.addChild(bg);
            if (frontTex) {
              const ts = new TilingSprite({ texture: frontTex, width: rect.width, height: rect.height });
              ts.position.set(rect.x, rect.y);
              const sc = rect.height / frontTex.height;
              ts.tileScale.set(sc, sc);
              ts.tint = LAB_ENV_TINT;
              this.labWalls!.addChild(ts);
            }
            return;
          }
          const horizontal = rect.width >= rect.height;
          const decorative = horizontal && rect.width >= 360 && panelTex !== null
            && treeHash(rect.x + 3, rect.y + 5) >= 0.5; // 要所のみ(広い横壁の約半数)
          if (rect.height <= SEG) {
            addBlock(rect.x, rect.y, rect.width, rect.height, rect.y + rect.height, decorative);
          } else {
            for (let yy = rect.y; yy < rect.y + rect.height; yy += SEG) {
              const segH = Math.min(SEG, rect.y + rect.height - yy);
              addBlock(rect.x, yy, rect.width, segH, yy + segH, false);
            }
          }
        };
        for (const w of LAB_WALLS) addWall(w);
        for (const d of LAB_DOORS) {
          if (!s.labDoors.some(sd => sd.id === d.id && sd.open)) addWall(d.rect); // 閉=壁 / 開=床
        }
      }
      for (const c of this.labWallActors) c.visible = true; // 屋内中は常に表示(深度ソートはアクター層が処理)
      // 壁の擬似遠近。depthRefY(プレイヤー足元)が変わった時だけ更新(静止中スキップ)。
      if (this.labWallDepthRefY !== this.depthRefY) {
        this.labWallDepthRefY = this.depthRefY;
        if (persp) {
          // A2: 収束する床に乗せる。footY を写像して表示位置へ。高さ/幅も写像スケールで縮める。
          // 幅は足元中心(footCenterX)基準で対称に縮め、z は写像後Yでソート。
          for (const e of this.labWallDepth) {
            const p = this.labProjectFootY(e.footY);
            e.cont.scale.set(p.scale, p.scale);
            e.cont.position.set(e.x0 + e.w / 2 - (e.w * p.scale) / 2, p.worldY - e.fullH * p.scale);
            e.cont.zIndex = p.worldY;
          }
        } else if (LAB_WALL_DEPTH_STRENGTH > 0) {
          // A1.5: 高さ方向のみの擬似遠近。足元(下辺)をピン留め、width は不変。
          const k = DEPTH_K * LAB_WALL_DEPTH_STRENGTH;
          for (const e of this.labWallDepth) {
            const d = this.depthScaleWith(e.footY, k, LAB_WALL_DEPTH_MIN, LAB_WALL_DEPTH_MAX);
            e.cont.scale.set(1, d);
            e.cont.position.set(e.x0, e.footY - e.fullH * d);
            e.cont.zIndex = e.footY;
          }
        }
      }
    }
    // マーカー(ボタン/ゴール)。床/壁の上・アクターの下に重ねる。
    if (!this.labGfx) {
      this.labGfx = new Graphics();
      const idx = this.labWalls ? this.L.world.getChildIndex(this.labWalls) + 1
        : (this.labFloorDecor ? this.L.world.getChildIndex(this.labFloorDecor) + 1 : (this.labFloor ? 1 : 0));
      this.L.world.addChildAt(this.labGfx, idx);
    }
    const g = this.labGfx;
    g.visible = true;
    g.clear();
    if (!floorTex && !persp) g.rect(LAB_BOUNDS.x, LAB_BOUNDS.y, LAB_BOUNDS.width, LAB_BOUNDS.height).fill({ color: 0x10151c }); // 床フォールバック(?labpersp 時は台形メッシュを使うので塗らない)
    // 外周マージンは背景 void プレート(labVoid・床の下)で表現するため、旧「暗リング塗り」は廃止。
    // void が見えない場合(テクスチャ未ロード)の保険として、マージンを従来色で薄く沈めておく。
    if (!voidTex && !persp) {
      const o = LAB_OUTER_BOUNDS, b = LAB_BOUNDS;
      const col = LAB_OUTER_TINT, a = 0.82;
      g.rect(o.x, o.y, o.width, b.y - o.y).fill({ color: col, alpha: a });
      g.rect(o.x, b.y + b.height, o.width, (o.y + o.height) - (b.y + b.height)).fill({ color: col, alpha: a });
      g.rect(o.x, b.y, b.x - o.x, b.height).fill({ color: col, alpha: a });
      g.rect(b.x + b.width, b.y, (o.x + o.width) - (b.x + b.width), b.height).fill({ color: col, alpha: a });
    }
    const btnPressed = s.labButtons.some(b => b.id === LAB_BUTTON.id && b.pressed);
    g.circle(LAB_BUTTON.x, LAB_BUTTON.y, LAB_BUTTON.radius).stroke({ color: btnPressed ? 0x22c55e : 0x60a5fa, width: 3, alpha: 0.8 });
    g.circle(LAB_BUTTON.x, LAB_BUTTON.y, 14).fill({ color: btnPressed ? 0x22c55e : 0xf87171 });
    g.rect(LAB_GOAL_TRIGGER.x, LAB_GOAL_TRIGGER.y, LAB_GOAL_TRIGGER.width, LAB_GOAL_TRIGGER.height).fill({ color: 0xfde68a, alpha: 0.06 }); // ゴール区画

    // 障害物プロップ(木の代わり)。木と同じくアクター層に足元アンカーで配置し、足元Yで深度ソート
    // (裏に回り込むとプレイヤー/敵の上に被る)。配置が変わった時だけ作り直す。
    const propSig = s.labProps.map(p => p.id + ':' + p.variant).join(',');
    if (this.labPropSig !== propSig) {
      this.labPropSig = propSig;
      for (const sp of this.labPropSprites) sp.destroy();
      this.labPropSprites = [];
      this.labPropFoot = [];
      for (const p of s.labProps) {
        const tex = getTexture(p.variant);
        if (!tex) continue;
        const sp = new Sprite(tex);
        sp.anchor.set(0.5, 1);            // 足元アンカー
        sp.position.set(Math.round(p.x), Math.round(p.y));
        sp.zIndex = p.y;                  // 木/敵と同じ尺度で深度ソート
        this.L.actorLayer.addChild(sp);
        this.labPropSprites.push(sp);
        this.labPropFoot.push({ sp, x: Math.round(p.x), y: Math.round(p.y) });
      }
    }
    // 毎フレーム depth スケール(プレイヤー足元基準の擬似遠近)。プロップは数個なので軽い。
    // ?labpersp 時は壁と同じ写像で収束する床に乗せる(位置＋scale)。それ以外は従来の depthScaleEnemy。
    const PROP_DISPLAY = 76; // 表示の基準高さ(px)
    for (const e of this.labPropFoot) {
      const sp = e.sp;
      sp.visible = true;
      const t = sp.texture;
      const base = containScale(PROP_DISPLAY, PROP_DISPLAY, t.width, t.height);
      if (persp) {
        const p = this.labProjectFootY(e.y);
        sp.position.set(e.x, p.worldY);
        sp.zIndex = p.worldY;
        sp.scale.set(base * p.scale);
      } else {
        sp.position.set(e.x, e.y);
        sp.zIndex = e.y;
        sp.scale.set(base * this.depthScaleEnemy(e.y));
      }
    }
  }

  // 床の変種パッチ(blood/grime/crack/scorch)＋隅AO を各部屋に決定的散布。部屋集合は静的なので
  // 1度だけ生成し、以後は可視制御のみ(毎フレーム作り直さない=負荷を持たない)。
  private buildLabFloorDecor(tile: number) {
    if (!this.labFloorDecor) {
      this.labFloorDecor = new Container();
      const idx = this.labFloor ? this.L.world.getChildIndex(this.labFloor) + 1 : 0;
      this.L.world.addChildAt(this.labFloorDecor, idx);
    }
    this.labFloorDecor.visible = true;
    const sig = `${LAB_ROOMS.length}:${tile}`;
    if (this.labFloorDecorSig === sig) return;
    this.labFloorDecorSig = sig;
    this.labFloorDecor.removeChildren().forEach(c => c.destroy());

    const variantTex = [
      getTexture('lab-floor/lab-floor-grime'),
      getTexture('lab-floor/lab-floor-crack'),
      getTexture('lab-floor/lab-floor-blood'),
      getTexture('lab-floor/lab-floor-scorch'),
    ].filter((t): t is Texture => !!t);
    const aoTex = getTexture('lab-floor/lab-floor-ao');

    for (const room of LAB_ROOMS) {
      const r = room.rect;
      const cols = Math.max(1, Math.floor(r.width / tile));
      const rows = Math.max(1, Math.floor(r.height / tile));
      // 部屋内をタイル格子で走査し、ハッシュで一部セルにだけ変種を敷く(疎)。決定的=毎回同じ絵。
      if (variantTex.length > 0) {
        for (let cyi = 0; cyi < rows; cyi++) {
          for (let cxi = 0; cxi < cols; cxi++) {
            const gx = r.x + cxi * tile, gy = r.y + cyi * tile;
            if (treeHash(gx * 0.13 + 7, gy * 0.17 + 3) < 0.72) continue; // ~28% のセルのみ
            const tex = variantTex[Math.floor(treeHash(gx + 31, gy + 17) * variantTex.length) % variantTex.length];
            const sp = new Sprite(tex);
            sp.position.set(gx, gy);
            sp.width = tile; sp.height = tile;
            sp.tint = LAB_ENV_TINT; sp.alpha = 0.92;
            this.labFloorDecor.addChild(sp);
          }
        }
      }
      // 隅AO(4角)。透過スタンプを内側へ向けて反転配置(右上光源の逆=隅を沈める)。
      if (aoTex) {
        const aw = Math.min(tile * 1.7, r.width * 0.5), ah = Math.min(tile * 1.7, r.height * 0.5);
        const corners: [number, number, number, number][] = [
          [r.x, r.y, 1, 1], [r.x + r.width, r.y, -1, 1],
          [r.x, r.y + r.height, 1, -1], [r.x + r.width, r.y + r.height, -1, -1],
        ];
        for (const [px, py, sx, sy] of corners) {
          const ao = new Sprite(aoTex);
          ao.anchor.set(0, 0);
          ao.width = aw * sx; ao.height = ah * sy;
          ao.position.set(px, py);
          ao.alpha = 0.5;
          this.labFloorDecor.addChild(ao);
        }
      }
    }
  }

  // ---- pickups -------------------------------------------------------------

  private syncPickups(pickups: Pickup[], now: number) {
    const seen = new Set<string>();
    // 接地影は syncShadows のソフト方向影に統一。毎フレーム作り直す(後段で syncShadows が配置)。
    this.pickupShadows.length = 0;
    for (const p of pickups) {
      seen.add(p.id);
      let entry = this.pickups.get(p.id);
      if (!entry) {
        const container = new Container();
        const glow = new Graphics();
        const gfx = new Graphics();
        glow.blendMode = 'add';
        container.addChild(glow, gfx);
        this.L.groundLayer.addChild(container);
        entry = { container, glow, gfx };
        this.pickups.set(p.id, entry);
      }
      this.drawPickup(entry, p, now);
    }
    for (const [id, entry] of this.pickups) {
      if (!seen.has(id)) {
        entry.container.destroy({ children: true });
        this.pickups.delete(id);
      }
    }
  }

  private drawPickup(
    entry: PickupView,
    p: Pickup,
    now: number
  ) {
    const hitSize = 16;
    const pos = pickupDisplayPosition(p, now);
    const cx = pos.x + hitSize / 2;
    const cy = pos.y + hitSize / 2;
    const footY = pos.y + hitSize;
    const size = PICKUP_VISUAL_SIZE;
    // クリアアイテム(書類)は床置きなので浮遊(bob)させない=「浮いて見える」対策。
    const floatOffset = p.type === 'lab-clear-item' ? 0 : Math.sin(now / 300 + p.x * 0.01) * 2;
    const d = this.depthScale(footY); // foot = base of the pickup hitbox
    const horizonAlpha = this.horizonActorAlpha(footY);
    const glow = entry.glow;
    const g = entry.gfx;
    entry.container.alpha = horizonAlpha;
    entry.container.visible = horizonAlpha > 0;
    entry.container.zIndex = footY;
    glow.clear();
    g.clear();
    if (horizonAlpha <= 0) return;

    // Shadow stays at the base (not floating) so the bob lifts the item off it.
    // ソフト方向影に統一(他オブジェクトと同じプール経路。重みは lighting.shadowAlpha 基準で
    // アクターと揃え、bob で少しだけ薄れて浮遊感を出す)。syncShadows が配置する。
    const lift = Math.max(0.62, 1 - Math.abs(floatOffset) * 0.07);
    this.pickupShadows.push({
      id: 'pk:' + p.id,
      x: cx,
      y: footY,
      w: size * 0.85 * d,
      alpha: horizonAlpha * lift,
    });

    // weapon-drop: ドロップした具体的な銃のスプライト(weaponKey 別)。素材がある銃のみ。
    if (p.type === 'weapon-drop' && hasWeaponIcon(p.weaponKey)) {
      const tex = getTexture(weaponIconName(p.weaponKey!));
      if (tex) {
        if (!entry.sprite) {
          entry.sprite = new Sprite();
          entry.sprite.anchor.set(0.5, 1);
          entry.container.addChild(entry.sprite);
        }
        entry.sprite.texture = tex;
        const sc = containScale(size * 1.5, size * 1.5, tex.width, tex.height) * d; // 銃は横長なので少し大きめ枠
        entry.sprite.scale.set(sc);
        entry.sprite.position.set(Math.round(cx), Math.round(footY + floatOffset));
        entry.sprite.visible = true;
        return;
      }
    }
    if (SPRITE_PICKUPS.has(p.type)) {
        const name =
          p.type === 'experience'
            ? (p.value >= 5 ? 'pickup-xp-red' : p.value >= 2 ? 'pickup-xp-green' : 'pickup-xp-blue')
            : p.type === 'treasure'
              ? `treasure-${Math.max(1, Math.min(6, p.variant ?? p.value ?? 1))}`
          : p.type === 'weapon-crate'
            ? 'pickup-chest'
          : p.type === 'lab-clear-item'
            ? 'lab-clear-item'
            : `pickup-${p.type}`;
      const tex = getTexture(name);
      if (tex) {
        if (p.type === 'experience') {
          const color = p.value >= 5 ? 0xff7878 : p.value >= 2 ? 0x54e68e : 0x70a7ff;
          const pulse = 0.82 + 0.18 * Math.sin(now / 240 + p.x * 0.017);
          const gx = Math.round(cx);
          const gy = Math.round(footY + floatOffset - size * 0.48 * d);
          const r = size * d * pulse;
          glow.circle(gx, gy, r * 1.28).fill({ color, alpha: GEM_BODY_GLOW_ALPHA * 0.12 });
          glow.circle(gx, gy, r * 0.88).fill({ color, alpha: GEM_BODY_GLOW_ALPHA * 0.24 });
          glow.circle(gx, gy, r * 0.52).fill({ color, alpha: GEM_BODY_GLOW_ALPHA * 0.32 });
          glow.circle(gx, gy, r * 0.12).fill({ color: 0xffffff, alpha: GEM_BODY_GLOW_ALPHA * 0.22 });
        }
        if (!entry.sprite) {
          entry.sprite = new Sprite();
          entry.sprite.anchor.set(0.5, 1);
          entry.container.addChild(entry.sprite);
        }
        entry.sprite.texture = tex;
        const itemBox = p.type === 'lab-clear-item' ? size * 2.4 : size; // クリアアイテムは目立つよう大きめ
        const sc = containScale(itemBox, itemBox, tex.width, tex.height) * d;
        entry.sprite.scale.set(sc);
        entry.sprite.position.set(Math.round(cx), Math.round(footY + floatOffset));
        entry.sprite.visible = true;
        return;
      }
    }
    if (entry.sprite) entry.sprite.visible = false;
    glow.clear();
    this.drawProceduralPickup(g, p, cx, cy + floatOffset, now);
  }

  private drawProceduralPickup(g: Graphics, p: Pickup, cx: number, drawY: number, now: number) {
    switch (p.type) {
      case 'ammo-handgun':
      case 'ammo-shotgun':
      case 'ammo-rifle':
      case 'ammo-phill': {
        const box = p.type === 'ammo-shotgun' ? 0xb91c1c : p.type === 'ammo-rifle' ? 0xb45309 : p.type === 'ammo-phill' ? 0xf97316 : 0xa16207;
        g.rect(cx - 7, drawY - 4, 14, 9).fill({ color: 0x1f2937 });
        g.rect(cx - 7, drawY - 4, 14, 3).fill({ color: box });
        g.rect(cx - 5, drawY - 6, 2, 3).fill({ color: 0xfde68a });
        g.rect(cx - 1, drawY - 6, 2, 3).fill({ color: 0xfde68a });
        g.rect(cx + 3, drawY - 6, 2, 3).fill({ color: 0xfde68a });
        break;
      }
      case 'weapon-drop': {
        g.rect(cx - 8, drawY - 2, 14, 4).fill({ color: 0xcbd5e1 });
        g.rect(cx - 8, drawY + 2, 4, 5).fill({ color: 0xcbd5e1 });
        g.rect(cx - 3, drawY + 2, 3, 3).fill({ color: 0x64748b });
        break;
      }
      case 'card-key': {
        // カードキー(ドット調): シアンのカード + 明滅。
        const blink = 0.6 + Math.sin(now / 150) * 0.4;
        g.rect(cx - 7, drawY - 5, 14, 10).fill({ color: 0x0e7490 });
        g.rect(cx - 7, drawY - 5, 14, 10).stroke({ color: 0x67e8f9, width: 1.4, alpha: 0.9 });
        g.rect(cx - 4, drawY - 2, 6, 4).fill({ color: 0x67e8f9, alpha: blink });
        break;
      }
      case 'weapon-crate': {
        g.rect(cx - 9, drawY - 6, 18, 13).fill({ color: 0x334155 });
        g.rect(cx - 9, drawY - 6, 18, 3).fill({ color: 0x475569 });
        g.rect(cx - 9, drawY - 6, 18, 13).stroke({ width: 1.5, color: 0x94a3b8 });
        g.moveTo(cx - 9, drawY - 6).lineTo(cx + 9, drawY + 7)
          .moveTo(cx + 9, drawY - 6).lineTo(cx - 9, drawY + 7)
          .stroke({ width: 1.5, color: 0x94a3b8 });
        g.rect(cx - 2, drawY - 1, 4, 3).fill({ color: 0xbfdbfe });
        break;
      }
      case 'strap': {
        const gold = p.value >= 10;
        g.roundRect(cx - 6, drawY - 6, 12, 12, 2).fill({ color: gold ? 0x3b2604 : 0x1f2937, alpha: 0.95 });
        g.roundRect(cx - 4, drawY - 4, 8, 8, 2).stroke({ width: 1.5, color: gold ? 0xfacc15 : 0xe5e7eb, alpha: 0.95 });
        g.rect(cx - 1.5, drawY - 7, 3, 4).fill({ color: gold ? 0xf59e0b : 0x94a3b8 });
        g.circle(cx, drawY, gold ? 2.4 : 2).fill({ color: gold ? 0xfef3c7 : 0xf8fafc, alpha: 0.82 });
        break;
      }
      case 'treasure': {
        const pulse = 0.8 + Math.sin(now / 220 + p.x * 0.03) * 0.16;
        g.blendMode = 'add';
        g.circle(cx, drawY, 13 * pulse).fill({ color: 0xfacc15, alpha: 0.18 });
        g.blendMode = 'normal';
        g.poly([cx, drawY - 9, cx + 8, drawY - 1, cx + 5, drawY + 8, cx - 5, drawY + 8, cx - 8, drawY - 1])
          .fill({ color: 0xf59e0b });
        g.poly([cx, drawY - 7, cx + 5, drawY - 1, cx, drawY + 5, cx - 5, drawY - 1])
          .fill({ color: 0xfef3c7, alpha: 0.88 });
        break;
      }
      case 'quick-magazine': {
        const t = p.throwStartAt && p.throwDuration
          ? Math.max(0, Math.min(1, (now - p.throwStartAt) / p.throwDuration))
          : 1;
        const squash = t < 1 ? 1 + Math.sin(Math.PI * t) * 0.18 : 1;
        g.roundRect(cx - 8 * squash, drawY - 6, 16 * squash, 10, 2).fill({ color: 0x111827 });
        g.roundRect(cx - 7 * squash, drawY - 5, 14 * squash, 8, 2).stroke({ width: 1.5, color: 0xcbd5e1 });
        g.rect(cx - 5 * squash, drawY - 3, 10 * squash, 2).fill({ color: 0x94a3b8, alpha: 0.9 });
        g.rect(cx - 5 * squash, drawY, 10 * squash, 2).fill({ color: 0x64748b, alpha: 0.8 });
        break;
      }
      default: {
        // experience/health/magnet/bomb/chest only reach here if the atlas
        // failed to load — a small neutral diamond keeps them visible.
        void now;
        g.poly([cx, drawY - 6, cx + 6, drawY, cx, drawY + 6, cx - 6, drawY])
          .fill({ color: 0x93c5fd });
        break;
      }
    }
  }

  // ---- world-space effects[] queue -----------------------------------------

  private syncEffects(effects: VisualEffect[], camera: { x: number; y: number }, now: number) {
    const seen = new Set<string>();
    for (const e of effects) {
      if (e.kind === 'flash') continue; // screen-space, handled separately
      seen.add(e.id);
      if (!this.effectNearViewport(e, camera)) {
        this.hideEffectView(e.id);
        continue;
      }
      if (e.kind === 'damageNumber') {
        this.drawDamageNumber(e, now);
      } else if (e.kind === 'image') {
        this.drawImageEffect(e, now);
      } else if (e.kind === 'dogFetch') {
        this.drawDogFetchSprite(e, now);
      } else if (e.kind === 'glow') {
        // 小glow=プールsprite(従来)。強glowも以前は毎フレ Graphics(clear()+7図形の再テッセレーション=
        // G12 FAIL)だったが、同じプールsprite方式(色haloと白coreの加算スプライト)に変更して激減させる。
        if (e.radius <= SMALL_GLOW_SPRITE_RADIUS_MAX) this.drawSmallGlowSprite(e, now);
        else this.drawStrongGlowSprite(e, now);
      } else if (e.kind === 'whip') {
        this.drawWhipSprite(e, now);
      } else {
        let g = this.effects.get(e.id);
        // 'glow' is handled above as a pooled sprite and never reaches this
        // Graphics path, so only 'trail' targets the ground layer here.
        const targetLayer = e.kind === 'trail'
          ? this.L.groundLayer
          : this.L.effectLayer;
        if (!(g instanceof Graphics)) {
          if (g) g.destroy();
          g = new Graphics();
          this.effects.set(e.id, g);
        }
        if (g.parent !== targetLayer) targetLayer.addChild(g);
        this.drawEffectGfx(g as Graphics, e, now);
      }
    }
    for (const [id, obj] of this.effects) {
      if (!seen.has(id)) {
        obj.destroy({ children: true }); // 強glowは子(halo/core)を持つ Container なので子も破棄(共有texは保持)
        this.effects.delete(id);
      }
    }
  }

  private drawEffectGfx(g: Graphics, e: VisualEffect, now: number) {
    g.visible = true;
    g.clear();
    const t = Math.min(1, (now - e.createdAt) / e.duration);
    switch (e.kind) {
      case 'particle': {
        if (e.liquid) {
          g.blendMode = 'normal';
          g.alpha = Math.max(0, 1 - t * 0.88);
          const r = e.size;
          g.ellipse(e.x, e.y, r * 1.45, r * 0.95).fill({ color: 0x052e16, alpha: 0.46 });
          g.circle(e.x, e.y, r).fill({ color: e.color, alpha: 0.92 });
          g.circle(e.x - r * 0.28, e.y - r * 0.22, r * 0.34).fill({ color: 0xd9f99d, alpha: 0.28 });
          break;
        }
        // Glowing additive spark: soft halo + colored body + hot white core.
        g.blendMode = 'add';
        g.alpha = Math.max(0, 1 - t);
        const r = e.size;
        g.circle(e.x, e.y, r * 2.6).fill({ color: e.color, alpha: 0.22 });
        g.circle(e.x, e.y, r).fill({ color: e.color });
        g.circle(e.x, e.y, r * 0.5).fill({ color: 0xffffff, alpha: 0.75 });
        break;
      }
      case 'ring': {
        // Additive shockwave: soft wide band + crisp edge + hot inner line.
        g.blendMode = 'add';
        g.alpha = 1 - t;
        const radius = e.startRadius + (e.endRadius - e.startRadius) * t;
        g.circle(e.x, e.y, radius).stroke({ width: e.width + 4, color: e.color, alpha: 0.3 });
        g.circle(e.x, e.y, radius).stroke({ width: e.width, color: e.color });
        g.circle(e.x, e.y, radius).stroke({ width: Math.max(1, e.width * 0.4), color: 0xffffff, alpha: 0.5 * (1 - t) });
        break;
      }
      // 'glow' は drawSmallGlowSprite / drawStrongGlowSprite(プールsprite)で描画するため
      // ここ(毎フレ Graphics)には到達しない。重い再テッセレーションを避けるため case は持たない。
      case 'slash': {
        // Additive streak: soft wide underlay + hot white core line.
        g.blendMode = 'add';
        g.alpha = 1 - t;
        const half = e.length / 2;
        const grow = 1 + t * 0.4;
        const dx = Math.cos(e.angle) * half * grow;
        const dy = Math.sin(e.angle) * half * grow;
        g.moveTo(e.x - dx, e.y - dy).lineTo(e.x + dx, e.y + dy)
          .stroke({ width: 8 * (1 - t) + 2, color: e.color, alpha: 0.4, cap: 'round' });
        g.moveTo(e.x - dx, e.y - dy).lineTo(e.x + dx, e.y + dy)
          .stroke({ width: 3 * (1 - t) + 1, color: 0xffffff, alpha: 0.85, cap: 'round' });
        break;
      }
      case 'trail': {
        g.blendMode = 'add';
        g.alpha = 1 - t;
        const cx = e.fromX + (e.toX - e.fromX) * t;
        const cy = e.fromY + (e.toY - e.fromY) * t;
        g.moveTo(e.fromX, e.fromY).lineTo(cx, cy).stroke({ width: 2.5, color: e.color });
        break;
      }
      case 'whip': {
        // 全長を即表示してフェード(伸びない)。当たり範囲=太い半透明の帯(丸キャップ=
        // カプセル)+ 明るい芯 + 白い細芯で視認性を上げる。
        g.blendMode = 'add';
        g.alpha = 1;
        const a = 1 - t;
        g.moveTo(e.fromX, e.fromY).lineTo(e.toX, e.toY)
          .stroke({ width: e.halfWidth * 2, color: e.color, alpha: 0.22 * a, cap: 'round' });
        g.moveTo(e.fromX, e.fromY).lineTo(e.toX, e.toY)
          .stroke({ width: 6, color: e.color, alpha: 0.9 * a, cap: 'round' });
        g.moveTo(e.fromX, e.fromY).lineTo(e.toX, e.toY)
          .stroke({ width: 2, color: 0xffffff, alpha: 0.85 * a, cap: 'round' });
        break;
      }
    }
  }

  private glowTint(color: string) {
    const match = color.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!match) return 0xffffff;
    const r = Math.max(0, Math.min(255, Number(match[1])));
    const g = Math.max(0, Math.min(255, Number(match[2])));
    const b = Math.max(0, Math.min(255, Number(match[3])));
    return (r << 16) | (g << 8) | b;
  }

  private drawSmallGlowSprite(e: Extract<VisualEffect, { kind: 'glow' }>, now: number) {
    const t = Math.min(1, (now - e.createdAt) / e.duration);
    let sprite = this.effects.get(e.id);
    if (!(sprite instanceof Sprite)) {
      if (sprite) sprite.destroy();
      sprite = new Sprite(getGlowTexture());
      (sprite as Sprite).anchor.set(0.5);
      sprite.blendMode = 'add';
      this.L.effectLayer.addChild(sprite);
      this.effects.set(e.id, sprite);
    }
    const life = Math.max(0, 1 - t);
    const radius = e.radius * SMALL_GLOW_RADIUS_SCALE;
    sprite.visible = true;
    sprite.position.set(e.x, e.y);
    sprite.tint = this.glowTint(e.color);
    sprite.width = radius * 2;
    sprite.height = radius * 2;
    sprite.alpha = life * SMALL_GLOW_ALPHA_SCALE;
  }

  // 強glow(radius>=STRONG_GLOW_RADIUS)もプールspriteで描く。以前は drawEffectGfx で毎フレ
  // clear()+約7図形を再テッセレーションしており G12 が FAIL していた。共有の放射グラデtex(getGlowTexture=
  // 白芯→外周0)を2枚、色のhalo(広い柔らかい光球)＋白のcore(熱い芯)として加算合成し、従来の見た目を近似する。
  // strong は従来どおり groundLayer(gameplayの下)に置く。注: Sprite/Graphics も Container 派生なので
  // __strongGlow マーカーで自前の Container だけを再利用する。
  private drawStrongGlowSprite(e: Extract<VisualEffect, { kind: 'glow' }>, now: number) {
    const t = Math.min(1, (now - e.createdAt) / e.duration);
    let view = this.effects.get(e.id);
    if (!(view instanceof Container) || !(view as { __strongGlow?: boolean }).__strongGlow) {
      if (view) view.destroy({ children: true });
      const c = new Container();
      (c as { __strongGlow?: boolean }).__strongGlow = true;
      const halo = new Sprite(getGlowTexture()); halo.anchor.set(0.5); halo.blendMode = 'add';
      const core = new Sprite(getGlowTexture()); core.anchor.set(0.5); core.blendMode = 'add'; core.tint = 0xffffff;
      c.addChild(halo, core);
      view = c;
      this.effects.set(e.id, c);
    }
    if (view.parent !== this.L.groundLayer) this.L.groundLayer.addChild(view);
    const c = view as Container;
    const [halo, core] = c.children as Sprite[];
    const life = Math.max(0, 1 - t);
    c.visible = true;
    c.position.set(e.x, e.y);
    // halo: 色付きの広い柔らかい光球(従来 main disc ~radius*0.82 相当)。
    const haloD = e.radius * 1.7;
    halo.tint = this.glowTint(e.color);
    halo.width = halo.height = haloD;
    halo.alpha = life * 0.5;
    // core: 熱い白芯(従来 white core ~radius*0.22 を少し広めに)。
    const coreD = e.radius * 0.62;
    core.width = core.height = coreD;
    core.alpha = life * 0.55;
  }

  // 鞭 lash を実スプライトで描画。手元(WHIP_SPRITE_ANCHOR)をプレイヤー位置に固定し、
  // 振り方向へ回転、手元→先端が strike 距離(reach)に一致するよう伸縮。一振りごとにフェード。
  private drawWhipSprite(e: Extract<VisualEffect, { kind: 'whip' }>, now: number) {
    const t = Math.min(1, (now - e.createdAt) / e.duration);
    let sprite = this.effects.get(e.id);
    if (!(sprite instanceof Sprite)) {
      if (sprite) sprite.destroy();
      sprite = new Sprite();
      (sprite as Sprite).anchor.set(WHIP_SPRITE_ANCHOR_X, WHIP_SPRITE_ANCHOR_Y);
      this.L.effectLayer.addChild(sprite);
      this.effects.set(e.id, sprite);
    }
    const sp = sprite as Sprite;
    const tex = getTexture('whip');
    if (!tex) { sp.visible = false; return; }
    if (sp.texture !== tex) sp.texture = tex;
    const dx = e.toX - e.fromX;
    const dy = e.toY - e.fromY;
    const reach = Math.hypot(dx, dy) || 1;
    // 手元(ANCHOR_X)→先端(TIP_X)のテクスチャ幅が reach に一致するよう等倍スケール。
    const span = Math.max(1, tex.width * (WHIP_SPRITE_TIP_X - WHIP_SPRITE_ANCHOR_X));
    sprite.scale.set(reach / span);
    sprite.position.set(e.fromX, e.fromY);
    sprite.rotation = Math.atan2(dy, dx); // 素材は右向き=+x基準
    // 視認性: 前半は不透明を保ち、後半でフェード(速く消えて見えづらいのを緩和)。
    sprite.alpha = t < 0.45 ? 1 : Math.max(0, 1 - (t - 0.45) / 0.55);
    sprite.visible = true;
  }

  private dogFetchPose(e: Extract<VisualEffect, { kind: 'dogFetch' }>, now: number) {
    const t = Math.min(1, (now - e.createdAt) / e.duration);
    const outRatio = (e.pickupAt - e.createdAt) / e.duration;
    const outgoing = t <= outRatio;
    const legT = outgoing ? t / Math.max(0.001, outRatio) : (t - outRatio) / Math.max(0.001, 1 - outRatio);
    const ease = legT < 0.5 ? 2 * legT * legT : 1 - Math.pow(-2 * legT + 2, 2) / 2;
    const startX = outgoing ? e.toX : e.targetX;
    const startY = outgoing ? e.toY : e.targetY;
    const endX = outgoing ? e.targetX : e.toX;
    const endY = outgoing ? e.targetY : e.toY;
    return {
      alpha: Math.max(0, Math.min(1, 1 - Math.max(0, t - 0.92) / 0.08)),
      x: startX + (endX - startX) * ease,
      y: startY + (endY - startY) * ease,
      facing: endX >= startX ? 1 : -1,
      carrying: !outgoing,
    };
  }

  private drawDogFetchSprite(e: Extract<VisualEffect, { kind: 'dogFetch' }>, now: number) {
    let container = this.effects.get(e.id);
    if (!(container instanceof Container) || container instanceof Text) {
      if (container) container.destroy();
      container = new Container();
      const shadow = new Graphics();
      shadow.name = 'shadow';
      const sprite = new Sprite();
      sprite.name = 'sprite';
      sprite.anchor.set(0.5, 1);
      container.addChild(shadow, sprite);
      this.L.effectLayer.addChild(container);
      this.effects.set(e.id, container);
    }

    container.visible = true;
    const shadow = container.getChildByName('shadow') as Graphics | undefined;
    const sprite = container.getChildByName('sprite') as Sprite | undefined;
    const pose = this.dogFetchPose(e, now);
    const frame = Math.floor(now / DOG_WALK_FRAME_MS) % 2;
    const tex = getTexture(`dog-walk-${frame}`) ?? getTexture('dog-walk-0');

    container.alpha = pose.alpha;
    container.position.set(Math.round(pose.x), Math.round(pose.y + 11));
    container.zIndex = pose.y + 11;

    if (shadow) {
      shadow.clear();
      shadow.ellipse(0, 0, 23, 7).fill({ color: 0x000000, alpha: 0.24 });
    }
    if (sprite && tex) {
      sprite.texture = tex;
      sprite.scale.set(pose.facing * DOG_SPRITE_SCALE, DOG_SPRITE_SCALE);
      sprite.position.set(0, 2 + Math.sin(now / 90) * 0.8);
      sprite.visible = true;
    }
  }

  // 数値ダメージ用のビットマップフォント(共有グリフアトラス)。一度だけ生成。
  // 数字は毎フレーム大量に出るので、Text(spawn毎にcanvasラスタライズ+GPUアップロード)を避け、
  // BitmapText(アトラスから描画・プール再利用・色はtint)にする=最重だった FX-D を軽くする。
  private static DAMAGE_FONT = 'dmg-num';
  private static DAMAGE_FONT_SIZE = 30; // アトラスのベースサイズ(表示はscaleで縮める)
  private damageFontReady = false;
  private ensureDamageFont() {
    if (this.damageFontReady) return;
    try {
      BitmapFont.install({
        name: PixiScene.DAMAGE_FONT,
        style: {
          // 白で焼き、色は tint で出し分ける(crit=金 / 通常=白 など)。黒フチも焼き込む。
          fontFamily: FONT_STACK,
          fontSize: PixiScene.DAMAGE_FONT_SIZE,
          fontWeight: 'bold',
          fill: 0xffffff,
          stroke: { color: 0x020617, width: 5 },
        },
        chars: '0123456789',
        resolution: 2,
      });
      this.damageFontReady = true;
    } catch {
      // 生成失敗時は Text フォールバックのまま(damageFontReady=false)。
    }
  }

  private drawDamageNumber(e: Extract<VisualEffect, { kind: 'damageNumber' }>, now: number) {
    const t = (now - e.createdAt) / e.duration;
    const scale = e.scale ?? (e.crit ? 1.35 : 1);
    const bold = e.crit || scale > 1.2;
    // 数値のみ(コールアウト文字や明朝でない)は BitmapText の高速パス。
    if (e.text === undefined && !e.serif) {
      this.ensureDamageFont();
      if (this.damageFontReady) { this.drawDamageNumberBitmap(e, t, scale, bold); return; }
    }
    let txt = this.effects.get(e.id) as Text | undefined;
    if (!txt || !(txt instanceof Text)) {
      txt = new Text({
        text: e.text ?? String(e.value),
        style: {
          // 明朝(serif)指定の時は和文セリフのスタック。それ以外は既存フォント。
          fontFamily: e.serif
            ? '"Hiragino Mincho ProN", "Yu Mincho", "YuMincho", "MS Mincho", "Noto Serif JP", serif'
            : FONT_STACK,
          fontSize: Math.round(15 * scale),
          fontWeight: bold ? 'bold' : 'normal',
          fill: e.color,
          // 明朝コールアウト(斬)は縁取りなし。それ以外は従来の黒フチ。
          ...(e.serif ? {} : { stroke: { color: 0x020617, width: bold ? 4 : 3 } }),
        },
      });
      txt.anchor.set(0.5, 0.5);
      this.L.effectLayer.addChild(txt);
      this.effects.set(e.id, txt);
    }
    txt.visible = true;
    const pop = 1 + Math.max(0, 1 - t * 5) * (bold ? 0.22 : 0.14);
    txt.position.set(e.x, e.y - t * 12);
    txt.scale.set(pop);
    txt.alpha = Math.max(0, 1 - t);
  }

  // 数値ダメージの BitmapText 描画(プール再利用・色は tint)。Text のラスタライズコストを回避。
  private drawDamageNumberBitmap(
    e: Extract<VisualEffect, { kind: 'damageNumber' }>, t: number, scale: number, bold: boolean
  ) {
    let bt = this.effects.get(e.id);
    if (!(bt instanceof BitmapText)) {
      if (bt) bt.destroy();
      bt = new BitmapText({ text: String(e.value), style: { fontFamily: PixiScene.DAMAGE_FONT, fontSize: PixiScene.DAMAGE_FONT_SIZE } });
      (bt as BitmapText).anchor.set(0.5, 0.5);
      this.L.effectLayer.addChild(bt);
      this.effects.set(e.id, bt);
    }
    bt.visible = true;
    // 表示高さ(=従来 Text の 15*scale)に合わせてアトラスを縮小 + 出だしの pop。
    const pop = 1 + Math.max(0, 1 - t * 5) * (bold ? 0.22 : 0.14);
    bt.scale.set(((15 * scale) / PixiScene.DAMAGE_FONT_SIZE) * pop);
    bt.position.set(e.x, e.y - t * 12);
    bt.tint = e.color; // crit=金 / 通常=白 などを tint で
    bt.alpha = Math.max(0, 1 - t);
  }

  // 一枚絵マーク(刀フィニッシュの習字「斬」など)。pop-in→保持→末尾フェード。world座標(effectLayer)。
  private drawImageEffect(e: Extract<VisualEffect, { kind: 'image' }>, now: number) {
    const tex = getTexture(e.texture);
    let sp = this.effects.get(e.id);
    if (!tex) { if (sp) sp.visible = false; return; }
    if (!(sp instanceof Sprite)) {
      if (sp) sp.destroy();
      sp = new Sprite();
      (sp as Sprite).anchor.set(0.5, 0.5);
      this.L.effectLayer.addChild(sp);
      this.effects.set(e.id, sp);
    }
    const spr = sp as Sprite;
    const t = Math.min(1, (now - e.createdAt) / e.duration);
    const targetH = 130 * (e.scale ?? 1);            // 表示高さ(world px)
    const pop = 1 + Math.max(0, 1 - t * 4) * 0.18;   // 出だしを少し大きく
    spr.visible = true;
    spr.texture = tex;
    spr.scale.set((targetH / tex.height) * pop);
    spr.position.set(e.x, e.y);
    spr.alpha = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3); // 後半でフェード
  }

  // ---- player FX: counter ring + reload meter (world space) ----------------

  private syncPlayerFx(player: Player, now: number) {
    const g = this.playerFx;
    g.clear();
    const rg = this.reticleGfx; // 照準サークル専用(環境光の影響を受けない層=uiLayer・screen座標)
    rg.clear();
    // uiLayer は screen 座標。world.position(=-camera+shake)を足して world→screen 変換する。
    const rox = this.L.world.position.x;
    const roy = this.L.world.position.y;
    const cx = player.x + player.width / 2;
    const cy = player.y + player.height / 2;
    const r = huntingMeleeRadius(player);
    // ワイヤーアンカー: サークル表示は廃止。フリックで刺さった地点(ax,ay)に先端スプライト+ワイヤー線を
    // 表示するのみ(刺し待ち〜高速移動中)。重いglow/大量パーティクルは使わない(軽いスプライト・線のみ)。
    if (this.wireTip) this.wireTip.visible = false; // 既定は非表示(設置中のみ表示)
    if (player.subWeapons.includes('wire-anchor')) {
      const dashing = now < player.wireDashUntil;
      const anchorSet = (player.wireAnchored || dashing) && (player.wireAnchorX !== 0 || player.wireAnchorY !== 0);
      const ax = player.wireAnchorX, ay = player.wireAnchorY;
      if (anchorSet) {
        // 刺した方向(プレイヤー→アンカー)。先端の「爪」はこの向きへ刺さる(素材の基準向き=左下)。
        let tdx = ax - cx, tdy = ay - cy;
        const tdl = Math.hypot(tdx, tdy) || 1;
        tdx /= tdl; tdy /= tdl;
        // フリックで即座にアンカー地点へ刺さる。以後その位置(ax,ay)に固定表示。
        const tipX = ax, tipY = ay;
        const tipTex = getTexture('wire-anchor-tip');
        const TIP = 34; // 先端の表示サイズ(px)
        if (tipTex) {
          if (!this.wireTip) {
            this.wireTip = new Sprite();
            this.wireTip.anchor.set(0.5);
            this.L.effectLayer.addChild(this.wireTip); // playerFx と同じ world レイヤー(ワイヤーの上)
          }
          this.wireTip.texture = tipTex;
          this.wireTip.scale.set(containScale(TIP, TIP, tipTex.width, tipTex.height));
          this.wireTip.position.set(Math.round(tipX), Math.round(tipY));
          // 素材の爪は左下(角度135°)向き。刺した方向へ回す。
          this.wireTip.rotation = Math.atan2(tdy, tdx) - Math.atan2(1, -1);
          this.wireTip.alpha = 1;
          this.wireTip.visible = true;
        }
        // 穴(eyelet)は爪と反対=プレイヤー側。ワイヤーはここに繋ぐ。
        const holeDist = TIP * 0.4;
        const hx = tipX - tdx * holeDist;
        const hy = tipY - tdy * holeDist;
        // ワイヤー線(穴→プレイヤー)。
        const lineAlpha = dashing ? 0.85 : 0.7;
        g.moveTo(hx, hy).lineTo(cx, cy).stroke({ width: 2.5, color: 0x93c5fd, alpha: lineAlpha });
      }
    }
    // PHILL銃: アクティブ銃が phill-revolver のとき、狙いサークル(赤橙レティクル)を前方に表示。
    // 射撃クールダウン中は薄く(=今は撃てないことを示す)。アンカー(青)と差別化。
    {
      const phill = player.weapons.find(w => w.id === player.activeWeaponId);
      if (phill?.key === 'phill-revolver') {
        // 照準サークルは movePlayer が算出した「吸い付き済み」オフセットに揃える(発砲と完全一致)。
        // 頭にスナップ中は緑＝即ヘッドショット可、未スナップは橙＝通常射撃。
        const ax = cx + player.phillReticleDX + rox;
        const ay = cy + player.phillReticleDY + roy;
        const onCd = now - (phill.lastFired ?? 0) < (phill.cooldown ?? 1000);
        const reloading = phill.id === player.reloadingWeaponId && now < player.reloadEndsAt;
        const a = (onCd || reloading) ? 0.2 : 0.9;
        const snapped = player.phillSnapEnemyId != null;
        const ringColor = snapped ? 0x34d399 : 0xf97316; // 緑=ヘッドショット狙撃可 / 橙=通常
        const dotColor = snapped ? 0xa7f3d0 : 0xfca5a5;
        rg.circle(ax, ay, snapped ? 11 : 9).stroke({ width: snapped ? 2.5 : 2, color: ringColor, alpha: a });
        rg.circle(ax, ay, 3).fill({ color: dotColor, alpha: a });
        // 照準の十字(小)。
        rg.moveTo(ax - 13, ay).lineTo(ax - 6, ay).moveTo(ax + 6, ay).lineTo(ax + 13, ay)
          .moveTo(ax, ay - 13).lineTo(ax, ay - 6).moveTo(ax, ay + 6).lineTo(ax, ay + 13)
          .stroke({ width: 1.5, color: ringColor, alpha: a * 0.8 });
      }
    }
    // ドローンブーメランのクールダウンサークルは廃止(復帰時に頭上マーク+SEで通知=updateBoomerangReadyMark)。
    // 刀装備中は通常ナイフの剣閃テレグラフを出さない。カウンターが実際に
    // 成立した直後だけ既存のカウンターエフェクト(剣閃+リング)を表示する。
    const katana = player.subWeapons.includes('katana') || player.subWeapons.includes('murasame');
    const counterFxVisible = !katana || now - player.lastCounterSuccessTime < 360;
    if (now <= player.counterWindowEnd && counterFxVisible) {
      // A thin reach ring (telegraph) + a STATIC crescent blade that snaps in
      // and fades fast (no rotation). The crescent faces the player's last
      // heading; it's thick in the belly and tapers to thin tips.
      const dir = player.lastDirection;
      const head = dir ? Math.atan2(dir.y, dir.x) : -Math.PI / 2;
      const openAt = player.counterWindowEnd - COUNTER_WINDOW;
      const ft = (now - openAt) / 140; // blade life ~140ms (a quick flash)
      if (ft < 1) {
        const fade = Math.max(0, 1 - ft);
        const fullSegs = 64;
        for (let i = 0; i < fullSegs; i++) {
          const a1 = -Math.PI + (i / fullSegs) * Math.PI * 2;
          const a2 = -Math.PI + ((i + 1) / fullSegs) * Math.PI * 2;
          const mid = (a1 + a2) / 2;
          const forward = Math.max(0, Math.cos(mid - head));
          const rear = Math.max(0, Math.cos(mid - head - Math.PI));
          const glow = 0.25 + forward * 0.75 + rear * 0.12;
          const rr = r + Math.sin(i * 1.7) * 0.9;
          g.moveTo(cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr)
            .lineTo(cx + Math.cos(a2) * rr, cy + Math.sin(a2) * rr)
            .stroke({ width: 2.4 + glow * 8.5, color: 0xff9f1c, alpha: 0.12 * fade * glow, cap: 'round' });
          g.moveTo(cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr)
            .lineTo(cx + Math.cos(a2) * rr, cy + Math.sin(a2) * rr)
            .stroke({ width: 0.75 + glow * 0.65, color: 0xfff3c4, alpha: 0.55 * fade, cap: 'round' });
        }

        const span = Math.PI * 1.08;
        const a0 = head - span / 2;
        const crescentSegs = 24;
        for (let i = 0; i < crescentSegs; i++) {
          const f = i / crescentSegs;
          const taper = Math.sin(f * Math.PI); // 0 at the tips, 1 at the belly
          const a1 = a0 + f * span;
          const a2 = a0 + ((i + 1) / crescentSegs) * span;
          const rr = r + 1.5 + taper * 2;
          g.moveTo(cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr)
            .lineTo(cx + Math.cos(a2) * rr, cy + Math.sin(a2) * rr)
            .stroke({ width: 2 + 12 * taper, color: 0xff7a18, alpha: 0.16 * taper * fade, cap: 'round' });
          g.moveTo(cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr)
            .lineTo(cx + Math.cos(a2) * rr, cy + Math.sin(a2) * rr)
            .stroke({ width: 0.8 + 2.3 * taper, color: 0xfff7cc, alpha: 0.92 * taper * fade, cap: 'round' });
        }
        g.circle(cx + Math.cos(head) * r, cy + Math.sin(head) * r, 2.4 * fade + 0.4)
          .fill({ color: 0xffffff, alpha: 0.9 * fade });
      }
    } else if (player.huntingCharged) {
      const pulse = 0.72 + 0.28 * Math.sin(now / 260);
      g.circle(cx, cy, r)
        .stroke({ width: 7, color: 0x60a5fa, alpha: 0.055 + 0.035 * pulse });
      g.circle(cx, cy, r)
        .stroke({ width: 1.35, color: 0xbfdbfe, alpha: 0.34 + 0.08 * pulse });
      g.circle(cx, cy, r - 3)
        .stroke({ width: 0.8, color: 0xffffff, alpha: 0.12 + 0.04 * pulse });
    } else if (!katana && now < player.counterCooldownEnd) {
      g.circle(cx, cy, r).stroke({ width: 1.5, color: 0x94a3b8, alpha: 0.2 });
    }

    // 刀: 一閃ダッシュのクールダウン表示。既存の近接クールダウンサークルと
    // 同じ見た目を刀の射程半径(レベル制)で出す(クールダウン中のみ)。
    if (katana && now < player.katanaDashCooldownEnd && now >= player.katanaDashUntil) {
      g.circle(cx, cy, katanaRange(player)).stroke({ width: 1.5, color: 0x94a3b8, alpha: 0.2 });
    }

    // Reload meter above the head.
    if (player.reloadingWeaponId && now < player.reloadEndsAt) {
      const gun = player.weapons.find(w => w.id === player.reloadingWeaponId);
      if (gun) {
        const total = effectiveReloadMs(gun, player);
        const progress = Math.max(0, Math.min(1, 1 - (player.reloadEndsAt - now) / total));
        const w = 30;
        const h = 5;
        const x = cx - w / 2;
        const fb = playerFootBox(player);
        const d = this.depthScale(fb.footY);
        const top = fb.footY - fb.boxH * d - 10;
        g.rect(x - 1, top - 1, w + 2, h + 2).fill({ color: 0x000000, alpha: 0.6 });
        g.rect(x, top, w, h).fill({ color: 0xffffff, alpha: 0.18 });
        g.rect(x, top, w * progress, h).fill({ color: 0xfbbf24 });
      }
    }
  }

  // ---- screen-space: off-screen supply arrows ------------------------------

  private syncArrows(
    pickups: Pickup[],
    castle: CastleEvent,
    merchant: WeaponMerchant,
    camera: { x: number; y: number },
    castleVisible: boolean,
    event: ActiveEvent | null,
    pois: { x: number; y: number; kind: 'boss' | 'cave' }[] = [],
    baseSites: { x: number; y: number; status: string }[] = []
  ) {
    const g = this.arrowGfx;
    g.clear();
    const ARROW_NEAR_RADIUS = 500; // 「近く」の方向矢印を出す半径(弾/拠点。社長指示)
    const marginX = 26;
    // Keep upward arrows below the iOS status bar and the top HUD. The icon
    // itself plus the arrowhead extends ~20px above its anchor, so the clamp
    // needs to be materially lower than the visible HUD edge.
    const marginTop = Math.min(Math.max(154, this.screenH * 0.17), this.screenH - 96);
    const marginBottom = 30;
    // リング中心はプレイヤーの画面位置に合わせる(camdown でプレイヤーが中央より下=その分だけ下げる)。ラボは中央。
    const cxC = this.screenW / 2;
    const cyC = this.screenH / 2 + (this.isLabStage ? 0 : this.screenH * CAMERA_DOWN_OFFSET_FRAC);
    const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 220);
    for (const p of pickups) {
      if (!p.worldDrop) continue;
      const colorStr = AMMO_INDICATOR_COLOR[p.type];
      if (!colorStr) continue;
      const tx = p.x + 8 - camera.x;
      const ty = p.y + 8 - camera.y;
      if (tx >= 0 && tx <= this.screenW && ty >= 0 && ty <= this.screenH) continue;
      if (Math.hypot(tx - cxC, ty - cyC) > ARROW_NEAR_RADIUS) continue; // 弾は近く(500px以内)のものだけ矢印表示(社長指示)
      const angle = Math.atan2(ty - cyC, tx - cxC);
      const dx = Math.cos(angle), dy = Math.sin(angle);
      let tdist = Infinity;
      if (dx > 0.0001) tdist = Math.min(tdist, (this.screenW - marginX - cxC) / dx);
      else if (dx < -0.0001) tdist = Math.min(tdist, (marginX - cxC) / dx);
      if (dy > 0.0001) tdist = Math.min(tdist, (this.screenH - marginBottom - cyC) / dy);
      else if (dy < -0.0001) tdist = Math.min(tdist, (marginTop - cyC) / dy);
      if (!isFinite(tdist)) continue;
      const ex = cxC + dx * tdist;
      const ey = cyC + dy * tdist;
      const color = parseInt(colorStr.slice(1), 16);

      g.rect(ex - 8, ey - 6, 16, 12).fill({ color: 0x1f2937, alpha: 0.9 });
      g.rect(ex - 8, ey - 6, 16, 3).fill({ color });
      g.rect(ex - 5, ey, 2, 4).fill({ color: 0xfde68a });
      g.rect(ex - 1, ey, 2, 4).fill({ color: 0xfde68a });
      g.rect(ex + 3, ey, 2, 4).fill({ color: 0xfde68a });

      // Arrowhead, rotated toward the supply.
      const hx = ex + dx * 13, hy = ey + dy * 13;
      const ca = Math.cos(angle), sa = Math.sin(angle);
      const rot = (px: number, py: number): [number, number] => [hx + px * ca - py * sa, hy + px * sa + py * ca];
      g.poly([...rot(7, 0), ...rot(-5, -6), ...rot(-5, 6)]).fill({ color, alpha: pulse });
    }

    const castleX = castle.x - camera.x;
    const castleY = castle.y + 40 - camera.y;
    // 城マーカーは城が実在するステージ(屋外・非ラボ)でのみ表示。
    // ステージ2(ラボ/屋内)は城を描かないので、位置マーカーも出さない。
    // さらにボス出現まで(bossSpawned)はマーカー非表示(社長指示)。
    if (castleVisible && castle.bossSpawned && (castleX < 0 || castleX > this.screenW || castleY < 0 || castleY > this.screenH)) {
      const angle = Math.atan2(castleY - cyC, castleX - cxC);
      const dx = Math.cos(angle), dy = Math.sin(angle);
      let tdist = Infinity;
      if (dx > 0.0001) tdist = Math.min(tdist, (this.screenW - marginX - cxC) / dx);
      else if (dx < -0.0001) tdist = Math.min(tdist, (marginX - cxC) / dx);
      if (dy > 0.0001) tdist = Math.min(tdist, (this.screenH - marginBottom - cyC) / dy);
      else if (dy < -0.0001) tdist = Math.min(tdist, (marginTop - cyC) / dy);
      if (isFinite(tdist)) {
        const ex = cxC + dx * tdist;
        const ey = cyC + dy * tdist;
        const color = castle.bossSpawned ? 0xef4444 : 0xf97316;

        g.circle(ex, ey, 11).fill({ color: 0x020617, alpha: 0.88 });
        g.circle(ex, ey, 10).stroke({ width: 1.5, color, alpha: 0.92 });
        g.rect(ex - 6, ey - 1, 12, 8).fill({ color: 0x1f2937, alpha: 0.95 });
        g.rect(ex - 7, ey - 5, 14, 5).fill({ color: 0x111827, alpha: 0.96 });
        g.moveTo(ex - 7, ey - 5)
          .lineTo(ex, ey - 12)
          .lineTo(ex + 7, ey - 5)
          .fill({ color: 0x020617, alpha: 0.98 });
        g.rect(ex - 2, ey + 2, 4, 5).fill({ color: 0x451a03, alpha: 0.98 });
        g.rect(ex - 5, ey, 3, 3).fill({ color: 0xf59e0b, alpha: 0.65 + 0.2 * pulse });
        g.rect(ex + 2, ey, 3, 3).fill({ color: 0xf59e0b, alpha: 0.65 + 0.2 * pulse });

        const hx = ex + dx * 15, hy = ey + dy * 15;
        const ca = Math.cos(angle), sa = Math.sin(angle);
        const rot = (px: number, py: number): [number, number] => [hx + px * ca - py * sa, hy + px * sa + py * ca];
        g.poly([...rot(7, 0), ...rot(-5, -6), ...rot(-5, 6)]).fill({ color, alpha: pulse });
      }
    }

    const merchantX = merchant.x - camera.x;
    const merchantY = merchant.y - 28 - camera.y;
    if (merchantX < 0 || merchantX > this.screenW || merchantY < 0 || merchantY > this.screenH) {
      const angle = Math.atan2(merchantY - cyC, merchantX - cxC);
      const dx = Math.cos(angle), dy = Math.sin(angle);
      let tdist = Infinity;
      if (dx > 0.0001) tdist = Math.min(tdist, (this.screenW - marginX - cxC) / dx);
      else if (dx < -0.0001) tdist = Math.min(tdist, (marginX - cxC) / dx);
      if (dy > 0.0001) tdist = Math.min(tdist, (this.screenH - marginBottom - cyC) / dy);
      else if (dy < -0.0001) tdist = Math.min(tdist, (marginTop - cyC) / dy);
      if (isFinite(tdist)) {
        const ex = cxC + dx * tdist;
        const ey = cyC + dy * tdist;
        const color = 0xfbbf24;
        const accent = 0xa855f7;

        g.circle(ex, ey, 11).fill({ color: 0x020617, alpha: 0.88 });
        g.circle(ex, ey, 10).stroke({ width: 1.5, color, alpha: 0.92 });
        g.rect(ex - 6, ey - 5, 12, 13).fill({ color: 0x1f2937, alpha: 0.95 });
        g.rect(ex - 4, ey - 2, 8, 7).fill({ color: accent, alpha: 0.34 + 0.22 * pulse });
        g.rect(ex - 2, ey - 8, 4, 4).fill({ color: 0x78350f, alpha: 0.98 });
        g.rect(ex - 7, ey + 6, 14, 3).fill({ color: 0x92400e, alpha: 0.96 });
        g.circle(ex, ey + 1, 3).fill({ color, alpha: 0.58 + 0.28 * pulse });

        const hx = ex + dx * 15, hy = ey + dy * 15;
        const ca = Math.cos(angle), sa = Math.sin(angle);
        const rot = (px: number, py: number): [number, number] => [hx + px * ca - py * sa, hy + px * sa + py * ca];
        g.poly([...rot(7, 0), ...rot(-5, -6), ...rot(-5, 6)]).fill({ color, alpha: pulse });
      }
    }

    // イベント(囲い/救助)の場所マーカー。画面外のとき必ず位置を示す(社長指示=各イベントは常にマップ表示)。
    if (event) {
      const exC = event.x - camera.x, eyC = event.y - camera.y;
      if (exC < 0 || exC > this.screenW || eyC < 0 || eyC > this.screenH) {
        const angle = Math.atan2(eyC - cyC, exC - cxC);
        const dx = Math.cos(angle), dy = Math.sin(angle);
        let tdist = Infinity;
        if (dx > 0.0001) tdist = Math.min(tdist, (this.screenW - marginX - cxC) / dx);
        else if (dx < -0.0001) tdist = Math.min(tdist, (marginX - cxC) / dx);
        if (dy > 0.0001) tdist = Math.min(tdist, (this.screenH - marginBottom - cyC) / dy);
        else if (dy < -0.0001) tdist = Math.min(tdist, (marginTop - cyC) / dy);
        if (isFinite(tdist)) {
          const ex = cxC + dx * tdist;
          const ey = cyC + dy * tdist;
          const color = event.kind === 'boss' ? 0xef4444 : event.kind === 'rescue' ? 0x4ade80 : 0x38bdf8;
          g.circle(ex, ey, 11).fill({ color: 0x020617, alpha: 0.9 });
          g.circle(ex, ey, 10).stroke({ width: 1.5, color, alpha: 0.95 });
          // 中央に「!」マーク(イベント発生中の注意喚起)。
          g.rect(ex - 1.5, ey - 6, 3, 7).fill({ color, alpha: 0.6 + 0.3 * pulse });
          g.rect(ex - 1.5, ey + 3, 3, 3).fill({ color, alpha: 0.6 + 0.3 * pulse });
          const hx = ex + dx * 15, hy = ey + dy * 15;
          const ca = Math.cos(angle), sa = Math.sin(angle);
          const rot = (px: number, py: number): [number, number] => [hx + px * ca - py * sa, hy + px * sa + py * ca];
          g.poly([...rot(7, 0), ...rot(-5, -6), ...rot(-5, 6)]).fill({ color, alpha: pulse });
        }
      }
    }

    // 研究所クリアアイテム(重要データ)の場所マーカー。画面外のとき画面端に書類アイコン+矢印で誘導。
    for (const p of pickups) {
      if (p.type !== 'lab-clear-item') continue;
      const tx = p.x + 8 - camera.x;
      const ty = p.y + 8 - camera.y;
      if (tx >= 0 && tx <= this.screenW && ty >= 0 && ty <= this.screenH) continue; // 画面内なら不要
      const angle = Math.atan2(ty - cyC, tx - cxC);
      const dx = Math.cos(angle), dy = Math.sin(angle);
      let tdist = Infinity;
      if (dx > 0.0001) tdist = Math.min(tdist, (this.screenW - marginX - cxC) / dx);
      else if (dx < -0.0001) tdist = Math.min(tdist, (marginX - cxC) / dx);
      if (dy > 0.0001) tdist = Math.min(tdist, (this.screenH - marginBottom - cyC) / dy);
      else if (dy < -0.0001) tdist = Math.min(tdist, (marginTop - cyC) / dy);
      if (!isFinite(tdist)) continue;
      const ex = cxC + dx * tdist;
      const ey = cyC + dy * tdist;
      const color = 0x22d3ee; // シアン=重要データ(クリア目標)

      g.circle(ex, ey, 11).fill({ color: 0x020617, alpha: 0.88 });
      g.circle(ex, ey, 10).stroke({ width: 1.5, color, alpha: 0.92 });
      // 書類アイコン(白い紙+折れ角)。
      g.rect(ex - 5, ey - 6, 10, 12).fill({ color: 0xe2e8f0, alpha: 0.96 });
      g.poly([ex + 1, ey - 6, ex + 5, ey - 6, ex + 5, ey - 2]).fill({ color: 0x94a3b8, alpha: 0.98 });
      g.rect(ex - 3, ey - 2, 6, 1.5).fill({ color: 0x0e7490, alpha: 0.9 });
      g.rect(ex - 3, ey + 1, 6, 1.5).fill({ color: 0x0e7490, alpha: 0.9 });
      g.rect(ex - 3, ey + 4, 4, 1.5).fill({ color: 0x0e7490, alpha: 0.9 });

      const hx = ex + dx * 15, hy = ey + dy * 15;
      const ca = Math.cos(angle), sa = Math.sin(angle);
      const rot = (px: number, py: number): [number, number] => [hx + px * ca - py * sa, hy + px * sa + py * ca];
      g.poly([...rot(7, 0), ...rot(-5, -6), ...rot(-5, 6)]).fill({ color, alpha: pulse });
    }

    // 探索の道標(POI): 拠点を解放した方角の洞窟/裏ボスを画面端の方向矢印で示す(社長指示)。
    // 距離は出さない=矢印のみ。画面内に入っているPOIは出さない。boss=赤 / cave=琥珀。
    for (const poi of pois) {
      const tx = poi.x - camera.x;
      const ty = poi.y - camera.y;
      if (tx >= 0 && tx <= this.screenW && ty >= 0 && ty <= this.screenH) continue; // 画面内なら不要
      const angle = Math.atan2(ty - cyC, tx - cxC);
      const dx = Math.cos(angle), dy = Math.sin(angle);
      let tdist = Infinity;
      if (dx > 0.0001) tdist = Math.min(tdist, (this.screenW - marginX - cxC) / dx);
      else if (dx < -0.0001) tdist = Math.min(tdist, (marginX - cxC) / dx);
      if (dy > 0.0001) tdist = Math.min(tdist, (this.screenH - marginBottom - cyC) / dy);
      else if (dy < -0.0001) tdist = Math.min(tdist, (marginTop - cyC) / dy);
      if (!isFinite(tdist)) continue;
      const ex = cxC + dx * tdist;
      const ey = cyC + dy * tdist;
      const boss = poi.kind === 'boss';
      const color = boss ? 0xef4444 : 0xf59e0b; // 裏ボス=赤 / 洞窟=琥珀
      g.circle(ex, ey, 11).fill({ color: 0x020617, alpha: 0.9 });
      g.circle(ex, ey, 10).stroke({ width: 1.5, color, alpha: 0.95 });
      if (boss) {
        // ドクロ風: 白い頭+目。
        g.circle(ex, ey - 1, 4.5).fill({ color: 0xe2e8f0, alpha: 0.96 });
        g.rect(ex - 3, ey + 2, 6, 3).fill({ color: 0xe2e8f0, alpha: 0.96 });
        g.circle(ex - 1.8, ey - 1, 1.2).fill({ color: 0x020617, alpha: 0.98 });
        g.circle(ex + 1.8, ey - 1, 1.2).fill({ color: 0x020617, alpha: 0.98 });
      } else {
        // 洞窟アーチ(半円の口)。
        g.rect(ex - 5, ey - 1, 10, 6).fill({ color: 0x451a03, alpha: 0.96 });
        g.circle(ex, ey - 1, 5).fill({ color: 0x451a03, alpha: 0.96 });
        g.circle(ex, ey + 1, 3).fill({ color: 0x020617, alpha: 0.98 });
      }
      const hx = ex + dx * 15, hy = ey + dy * 15;
      const ca = Math.cos(angle), sa = Math.sin(angle);
      const rot = (px: number, py: number): [number, number] => [hx + px * ca - py * sa, hy + px * sa + py * ca];
      g.poly([...rot(7, 0), ...rot(-5, -6), ...rot(-5, 6)]).fill({ color, alpha: pulse });
    }

    // 拠点(未制圧)の方向矢印: 近く(500px以内)で画面外のものだけ示す(社長指示=拠点の表示は半径500)。
    for (const b of baseSites) {
      if (b.status === 'captured') continue; // 制圧済みは出さない(未制圧だけ誘導)
      const tx = b.x - camera.x, ty = b.y - camera.y;
      if (tx >= 0 && tx <= this.screenW && ty >= 0 && ty <= this.screenH) continue; // 画面内は地面サークルで見える
      if (Math.hypot(tx - cxC, ty - cyC) > ARROW_NEAR_RADIUS) continue;
      const angle = Math.atan2(ty - cyC, tx - cxC);
      const dx = Math.cos(angle), dy = Math.sin(angle);
      let tdist = Infinity;
      if (dx > 0.0001) tdist = Math.min(tdist, (this.screenW - marginX - cxC) / dx);
      else if (dx < -0.0001) tdist = Math.min(tdist, (marginX - cxC) / dx);
      if (dy > 0.0001) tdist = Math.min(tdist, (this.screenH - marginBottom - cyC) / dy);
      else if (dy < -0.0001) tdist = Math.min(tdist, (marginTop - cyC) / dy);
      if (!isFinite(tdist)) continue;
      const ex = cxC + dx * tdist, ey = cyC + dy * tdist;
      const color = 0xfbbf24; // 拠点=琥珀(地面サークルと同色)
      g.circle(ex, ey, 11).fill({ color: 0x020617, alpha: 0.9 });
      g.circle(ex, ey, 10).stroke({ width: 1.5, color, alpha: 0.95 });
      g.rect(ex - 5, ey - 4, 10, 9).stroke({ width: 1.5, color, alpha: 0.9 }); // 旗/拠点アイコン(簡易)
      g.rect(ex - 5, ey - 4, 6, 4).fill({ color, alpha: 0.85 });
      const hx = ex + dx * 15, hy = ey + dy * 15;
      const ca = Math.cos(angle), sa = Math.sin(angle);
      const rot = (px: number, py: number): [number, number] => [hx + px * ca - py * sa, hy + px * sa + py * ca];
      g.poly([...rot(7, 0), ...rot(-5, -6), ...rot(-5, 6)]).fill({ color, alpha: pulse });
    }
  }

  // ---- screen-space: full-screen damage flashes ----------------------------

  private syncFlash(effects: VisualEffect[], now: number) {
    const g = this.flashGfx;
    g.clear();
    for (const e of effects) {
      if (e.kind !== 'flash') continue;
      const alpha = Math.max(0, 1 - (now - e.createdAt) / e.duration);
      g.rect(0, 0, this.screenW, this.screenH).fill({ color: e.color, alpha });
    }
  }

  destroy() {
    try { this.labRT?.destroy(true); } catch { /* ignore */ }
    this.labRT = null;
    for (const e of this.trees.values()) e.sprite.destroy();
    for (const e of this.cityPropObjs.values()) e.sprite.destroy();
    for (const v of this.enemies.values()) {
      v.light.destroy();
      v.container.destroy({ children: true });
    }
    for (const v of this.breakableProps.values()) {
      v.light.destroy();
      v.reflection.destroy();
      v.container.destroy({ children: true });
    }
    this.playerView?.light.destroy();
    this.playerView?.container.destroy({ children: true });
    this.merchantView.destroy({ children: true });
    this.eventNpcView.destroy({ children: true });
    for (const e of this.pickups.values()) e.container.destroy({ children: true });
    for (const g of this.projectiles.values()) g.destroy();
    for (const o of this.effects.values()) o.destroy();
    // 影は shadowContainer + プール済みスプライトで管理(旧 shadowGfx は存在しない孤児参照だった)。
    // 以前はここで存在しない shadowGfx.destroy() を呼んで例外→以降の解放(playerFx等)が握り潰されていた。
    this.shadowContainer.destroy({ children: true });
    this.playerFx.destroy();
    this.reticleGfx.destroy();
    this.flashGfx.destroy();
    this.arrowGfx.destroy();
    this.L.farBackdrop.destroy();
    for (const layer of this.nearGroundBlurLayers) layer.filters = [];
    for (const filter of this.nearGroundBlurFilters) filter.destroy();
    this.nearGroundBlurFilters = [];
    this.L.groundBase.destroy({ children: true });
    this.L.horizonForest.destroy();
    this.horizonForestFadeMask.destroy();
    this.horizonForestFadeMaskTexture?.destroy(true);
    this.horizonForestFadeMaskTexture = null;
    this.L.frontForest.mask = null;
    this.frontForestFadeMask.destroy();
    this.frontForestFadeMaskTexture?.destroy(true);
    this.frontForestFadeMaskTexture = null;
    this.L.frontForest.filters = [];
    this.frontForestBlur?.destroy();
    this.frontForestBlur = null;
    this.horizonForestBlur?.destroy();
    this.horizonForestBlur = null;
    this.nearHorizonBlur?.destroy();
    this.nearHorizonBlur = null;
    this.stageLightShaftGfx.destroy();
    this.L.filteredWorld.mask = null;
    this.worldFadeMask.destroy();
    this.worldFadeMaskTexture?.destroy(true);
    this.worldFadeMaskTexture = null;
    this.L.frontForest.destroy();
    this.gradeSprite.destroy();
    this.playerLight.destroy();
    this.vignette.destroy();
    for (const f of this.fireflies) f.sprite.destroy();
    this.fireflies = [];
    if (this.tiltShift || this.bloom) {
      this.L.filteredWorld.filters = [];
      this.tiltShift?.destroy();
      this.bloom?.destroy();
      this.tiltShift = null;
      this.bloom = null;
    }
  }
}
