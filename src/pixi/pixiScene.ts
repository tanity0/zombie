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
  ActiveEvent, ShadowCloneState, BaseSite, EscortSoldier, GroundFire, BossFire, RescueAlly, ThrownBag,
} from '../types/game';
import { useGameStore, TUTORIAL_MEDIC_INDEX, huntingMeleeRadius, hasMurasame, MERCHANT_TALK_DWELL_MS, SLASHER_RING_MS, SLASHER_JUST_MS, SHAKE_MS, SHAKE_GLOBAL_MULT, CAMERA_IDLE_ZOOM_MAG, CAMERA_IDLE_ZOOM_TAU, CAMERA_MOVE_ZOOM_MAG, CAMERA_MOVE_ZOOM_TAU, CAMERA_INTRO_ZOOM_MAG, COUNTER_WINDOW, katanaRange, HURRICANE_DURATION_MS_BY_LEVEL, PLAYER_INTRO_MS, PLAYER_INTRO_HELI_FRAC, playerIntroOffset, playerIntroScale, playerIntroDescent, PUMPKIN_CROUCH_MS, PUMPKIN_JUMP_MS, PUMPKIN_RECOVER_MS, PUMPKIN_JUMP_HEIGHT, PUMPKIN_EXPLOSION_RADIUS, SKADI_ICE_RADIUS, RETURN_CIRCLE_HOLD_MS, BASE_CAPTURE_HOLD_MS, CAMERA_DOWN_OFFSET_FRAC, ENEMY_ATTACK_SPEED_MULT, HUNTER_JUMP_SPEED_MULT, HUNTER_VISION_RANGE, HUNTER_LEAVE_FADE_MS, PLAYER_HITBOX, RESCUE_ALLY_FLYIN_MS, RESCUE_ALLY_ARRIVE_HOLD_MS, RESCUE_ALLY_ATTACK_MS, RESCUE_ALLY_POST_HOLD_MS, RESCUE_ALLY_CROUCH_MS, RESCUE_ALLY_FLYOUT_MS, THROWN_BAG_FLIGHT_MS } from '../store/gameStore';
import { computeTimeSlowScale } from '../utils/timeSlowCurve';
import { SENSOR_MINE_RADIUS, SENSOR_MINE_FUSE_MS, type SensorMineState } from '../utils/sensorMine';
import {
  SUPPORT_SNIPER_SLIDE_IN_MS, SUPPORT_SNIPER_SLIDE_OUT_MS, SUPPORT_SNIPER_SLIDE_START_OUT, SUPPORT_SNIPER_INSET,
  type SupportSniperNpcState,
} from '../utils/supportSniper';
import type { FlareGunFlare } from '../utils/flareGun';
import { biasedShakeOffset, speedLineRemainingMs, speedLineAlpha } from '../utils/dirFx';
import { NAMED_TINT, normalizeNamedName } from '../utils/namedEnemy';
import { hasFullWarlordSet, emptyEquipLoadout } from '../data/equipment';
import { contextZoomTarget, isLargeForZoom, CONTEXT_ZOOM_MIN } from '../utils/cameraZoom';
// 文脈ズームで最大まで引いた時(worldGroup.scale=CONTEXT_ZOOM_MIN)でも画面を覆えるよう、worldGroup内の
// 画面固定レイヤー(地面/地平森)を横方向にこの倍率でオーバースキャンして中央寄せする(黒帯防止)。
const ZOOM_OVERSCAN = 1 / CONTEXT_ZOOM_MIN;
import { LAB_BOUNDS, LAB_OUTER_BOUNDS, LAB_WALLS, LAB_DOORS, LAB_BUTTON, LAB_GOAL_TRIGGER, LAB_ROOMS } from '../world/labMap';
import { getEnemyColor, isHiddenBoss, isGate2AngelBoss } from '../utils/enemyUtils';
import { getRunPois, isPoiRevealed, poiSectorIndex } from '../world/pois';
import { ALCHEMY_SUMMON_TINT, ALCHEMY_CHANNEL_MS } from '../utils/summonUtils';
import { effectiveReloadMs, hasWeaponIcon, weaponIconName, getActiveGun } from '../utils/weaponUtils';
import { pickupDisplayPosition } from '../utils/collisionUtils';
import type { SceneLayers } from './layers';
import { getTexture, PLAYER_ART_BASE_W } from './pixiTextures';
import { getAppliedResolution } from '../config/renderer';
import { snapTexelRatio } from '../utils/texelSnap';
import { getGlowTexture, getEggTexture, getEggTextureArmed, getVignetteTexture, getVignetteTextureNarrow, getSoftShadowTexture, getFogTexture, getVisibilityLightTexture, getCircleTexture, getRingTexture, getRingCoreTexture, getCineWarmTexture, getCineSunTexture, getCineCloudTexture, getCineDustTexture, RING_TEX_BASES } from './lighting';
import { getBloomEnabled } from '../config/graphics';
import { FONT_STACK } from '../config/font';
import { enemyFootBox, enemyHitStrip, playerFootBox, summonFootBox, PLAYER_VISUAL_SCALE } from './renderSpec';
import {
  RHYTHM_DIM_ALPHA, RHYTHM_DIM_EASE, RHYTHM_TAP_GLOW_MS, RHYTHM_TAP_GLOW_ALPHA,
  RHYTHM_STAGE_COLORS, RHYTHM_FINISH_RAINBOW_MS, RHYTHM_BALL_DIAM, RHYTHM_RAINBOW_PALETTE,
  RHYTHM_ARROW_GRID, SHIJIN_JP, SHIJIN_BY_ARROW,
  RHYTHM_JUST_BURST_MS, RHYTHM_JUST_RING_MAX_SCALE, RHYTHM_JUST_FLICK_TRAVEL,
  RHYTHM_JUST_CYCLE_COLORS,
} from '../config/shijin';
import { treesInRegion, TREE_CELL, treeHash } from '../world/trees';
import { cityPropsInRegion, cityPropDef, STAGE_PROPS, CITY_ZONE } from '../world/cityProps';
import { forestFlowersInRegion, FLOWER_ZONE, FLOWER_DISPLAY_H } from '../world/forestDecor';
import { getSelectedStageId } from '../data/progress';
import { labWallsInRegion, LAB_ZONE, WALL_DISPLAY_H, labPropsInRegion, PROP_DISPLAY_H } from '../world/labWalls';
import { RescueSurvivor, RESCUE_HOLD_NEED_MS, RESCUE_OUTRO_MS } from '../world/rescue';
import { STAGE_SKINS, resolveStageSkinKey } from '../data/stageSkins';

// --- 深層域グレーディング(退色した暖色セピア) -----------------------------
// 深層域に入っている間だけ、ゲーム画面全体を退色セピアにする描画のみの演出(当たり判定等には不干渉)。
// stage ルートに ColorMatrixFilter 1枚。enter/exit を約1秒でフェード(filter.alpha 補間)。HUDはDOMなので非対象。
const DZ_PARAMS = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const DEEP_ZONE_GRADE_ENABLED = DZ_PARAMS?.get('deepzonegrade') !== '0'; // ?deepzonegrade=0 で無効化
const FORCE_DEEP_ZONE = DZ_PARAMS?.get('deepzone') === '1'; // 診断: ?deepzone=1 で深層域セピアを距離無視で常時ON(実機で退色グレードの重さ検証・社長v0.25.1561)
// 診断用トグル(社長v0.25.1558): 実機の重さ/クラッシュ切り分け。既定ON=通常挙動不変。
// ?glow=0   … 強glow(加算合成の大面積オーバードロー=ベンチ唯一のFAIL G12)を描画しない(小glowは安いので残す)。
// ?shadow=0 … 全アクターの足影(敵1体=影1枚・数に比例)を描画しない。
const STRONG_GLOW_DISABLED = DZ_PARAMS?.get('glow') === '0';
// シネマティック調(社長試作v0.25.1860)。?cine=1 かつステージ6(古い洋館)のときだけON。
// teal-orange のシネマ グレード= 寒色をより teal 寄りに強め(乗算)+ 暖色の残照オーバーレイ(screen)+
// ヴィネット強め + bloom強め。**描画のみ**(当たり判定/ゲームは不変)。他ステージ・非cineは完全に従来通り。
// 負荷: 全画面スプライト1枚(残照)追加+既存gradeのtint/alpha変更のみ=軽い(1〜2/10)。強glowは足さない。
const CINE_MODE = DZ_PARAMS?.get('cine') === '1';
const CINE_GRADE_TINT = 0x2f6474;          // teal 寄りの寒色乗算(既定 0x7e93c9 より青緑・締まる=影が teal)
const CINE_GRADE_ALPHA = 0.44;             // 乗算の強さ(社長「全体的に淡く」v0.25.1871: 0.52→0.44)
const CINE_VIGNETTE_ALPHA = 0.72;          // 周辺減光(淡く: 0.82→0.72)
const CINE_WARM_ALPHA = 0.60;              // 残照オーバーレイ(screen)の濃さ(淡く: 0.72→0.60)
// オレンジ残照グラデ(光源から下へフェード)のオン/オフ(社長指示v0.25.1926)。既定ON。?cinewarm=0 で消す(ここはtsNum前=DZ_PARAMS直読み)。
const CINE_WARM_ON = DZ_PARAMS?.get('cinewarm') !== '0';
// 光源(太陽/フレア)を右へ寄せる(社長指示v0.25.1871)。0.5=中央→0.62=右寄り。雲(放射原点)も追従。
const CINE_SUN_X_FRAC = 0.62;
// フレアの煌めき(社長指示v0.25.1871「動きは少し・薄濃で煌めき」): 位置ドリフトは減らし alpha を揺らす。
// 光源(太陽)は常時最大で固定=煌めかせない(社長指示v0.25.1885)。煌めきは周りの放射光(cineClouds)側だけ。
const CINE_SUN_ALPHA_MAX = 0.67;           // 光源(cineSun)の常時最大alpha(旧・煌めきの上端 0.5×1.34 を固定値化)
const CINE_CLOUD_ALPHA_BASE = 0.7;         // 放射streak(cineClouds)の基準alpha
// 放射streak(光の線)の「出没=煌めき」定数は tsNum 定義後(下方)に置く(?cloud*= で現地調整可・社長指示v0.25.1906)。
// 影(社長指示v0.25.1871): 光源が右上へ寄ったので、影は斜め左下へ(光源側を少し残す)。
const CINE_SHADOW_DIRECTION = { x: -0.5, y: 1 }; // 斜め左下(光=右上)
const CINE_SHADOW_ALPHA = 0.55;            // 既定 moonlight 0.26 → 濃く(締まる)
const CINE_SHADOW_LENGTH = 52;             // 既定 32 → 夕方の長い影
// 前景(キャラ/木/オブジェクト)の階調立て(社長指示v0.25.1865)。地面(groundBase)は filteredWorld の
// 外なので効かない=大気は柔らかいまま前景だけコントラストが乗る。既存フィルタと同じRTへ1パス相乗り。
const CINE_ACTOR_CONTRAST = 0.2;           // 明暗のメリハリ(0=無変化)
const CINE_ACTOR_SATURATE = 0.12;          // grade で抜けた彩度を少し戻す
// 空を生かす(社長指示v0.25.1865〜1877): 参照シネマグラフの「生きた空気」。既存ベイクSpriteのtransform/alphaだけ=負荷1/10。
// フレア(太陽+放射streak)は位置固定=左右にも動かさず、alphaの薄↔濃(煌めき)だけ(社長v0.25.1877)。塵/残照は生きた動きを維持。
const CINE_SKY_BREATH_SPD = 0.00034;       // 残照alpha呼吸の角速度
const CINE_SKY_WARM_BREATH = 0.11;         // 残照alphaの呼吸(±11%)
const CINE_PARALLAX_DUST = 0.055;          // カメラ移動→塵(近=大)=「生きた空気」は塵で担保(フレアは動かさない)
// (v0.25.1868の遠景DoF強化=CINE_FAR_DOF_MULTは撤回。社長指示v0.25.1870で「遠景はハッキリ」に方針転換
//  =cineでは遠景ボケ(遠景/森1/森2レイヤーのblur+tilt-shift)を外す。空気遠近で奥行きを出す方向へ。)
const ACTOR_SHADOWS_DISABLED = DZ_PARAMS?.get('shadow') === '0';
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

// 紅き夜の画面染色マトリクス。R増・G/B減で血の赤に染める。
// 社長指示で赤みを少し軽減し彩度を残す: R 1.45→1.30、G 0.55→0.70、B 0.35→0.52、赤の流し込み/加算も微減。
const buildRedNightMatrix = (): ColorMatrix => [
  1.30, 0.16, 0.08, 0, 0.04,
  0.00, 0.70, 0.00, 0, 0.00,
  0.00, 0.00, 0.52, 0, 0.00,
  0, 0, 0, 1, 0,
];

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
// チュートリアル(洞窟)の遠景は他ステージより縦を大きく使う(社長仕様2026-07-17: ステージは横長で
// 上下移動が少なく、横長素材の2/3程度しか画面に映らない前提)。
// v0.25.1808: 素材下部の描き込み地面(石畳)をy=710でクロップ(本物の地面レイヤーと二重だった=
// 社長指示「地面のところは本物の地面レイヤーの下に隠す」)。0.55×710/941=0.415で表示倍率は不変
// (川の大きさ維持)。遠景帯が縮んだぶん本物の地面上端(=farH連動)が上がって残りを覆う。
const TUTORIAL_FAR_HEIGHT_RATIO = 0.415;
// 川の流れ(オクトラ風・社長相談2026-07-17): 遠景と同ジオメトリのハイライト筋レイヤー2枚を
// 速度差でスクロール(1枚目=速い/2枚目=遅い)。明部は既存bloomが拾って光る。数値は全て叩き台。
const RIVER_FLOW_SPEED_PX_S = [18, 10];   // tilePositionの流速(表示px/秒)
const RIVER_FLOW_ALPHA = [0.3, 0.22];     // 基本アルファ(加算合成・v0.25.1814でさらに減=社長指示「まだ明るいかも」)
const RIVER_FLOW_WOBBLE = [0.08, 0.06];   // アルファの揺らぎ振幅
const RIVER_FLOW_WOBBLE_MS = [1400, 2300];// 揺らぎ周期
const FAR_BACKDROP_BLUR = 1.1;
const HORIZON_FOREST_PARALLAX_X = 0.16;
const HORIZON_FOREST_BLUR = 0.65; // 地平の森(遠景森)を少しだけぼかす(0=なし)。少し弱めた
const HORIZON_FOREST_HEIGHT_RATIO = 0.22;
const HORIZON_FOREST_MIN_HEIGHT = 120;
const HORIZON_FOREST_MAX_HEIGHT = 185;
// 遠景森1(地平の森)のサイズ倍率(社長指示v0.25.1884「1.5倍」)。通常ステージのみ(stage5/tutorialは実寸固定)。
const FAR_FOREST_SIZE_SCALE = 1.5;
// 北部(stage-4=唯一の farBackdrop 'snow')の遠景森1の拡大/位置は tsNum 定数で下方に定義(?north* で現地調整可)。
const HORIZON_FOREST_OVERLAP_RATIO = 0.18;
const HORIZON_FOREST_Y_OFFSET_PX = -100;
const LAB_HORIZON_FOREST_EXTRA_DOWN = 20; // ステージ2だけ遠景森1を下げる量(px)。他ステージは0。
// 遠景森1の下端フェード幅は tsNum 定数(?horizonfade=)で下方に定義。10pxだと事実上ハードカット(社長「パッツリ切れてる」)。
// 遠景手前森(ステージ3): 地平の森の「手前」に重なる近めの帯。closer=大きく/下/速いパララックス/弱ブラー。
// 遠景森2の高さ(screenH比)。全ステージ共通の既定=0.42(原典)。
const NEAR_HORIZON_HEIGHT_RATIO = 0.42;
// ステージ2(lab)だけ低め。?nh= で現地調整可(でか過ぎたので下げられるように。社長が0.17確定)。
// tsNum はこの行より後に定義のため inline で読む。
const LAB_NEAR_HORIZON_HEIGHT_RATIO = (() => {
  const v = typeof window !== 'undefined' ? Number(new URLSearchParams(window.location.search).get('nh')) : NaN;
  return Number.isFinite(v) && v > 0 ? v : 0.17; // ステージ2既定0.17(社長指定)
})();
// ステージ5の森1/森2は実寸px指定(社長指示v0.25.1742: 比率+クランプ方式だと端末次第で
// 倍率が効かず「大きくならない」ため、固定pxに切り替え)。底は遠景境界線(farH)基準の下オフセット。
const STAGE5_HORIZON_FOREST_HEIGHT_PX = 130; // 森1の高さ(px・社長指示v0.25.1743で150→130)
const STAGE5_HORIZON_FOREST_DOWN_PX = 20;    // 森1の底=境界線から下へ(px)
// チュートリアルの遠景森1=岩帯(社長指示v0.25.1810「川に少しだけ頭被るくらいの位置に遠景森1」)。
// 水面の下端(遠景テクスチャ y516/710)を基準に、帯の上端(トゲ岩の先端)が少しだけ川へ食い込むよう
// farH からの比率で上端を決め、下端は stage5 と同じく境界線(farH)+固定pxで地面へ食い込ませる。
const TUTORIAL_HORIZON_WATER_BOTTOM_FRAC = 516 / 710; // 遠景内の水面下端(クロップ後710px基準)
const TUTORIAL_HORIZON_HEAD_PX = 54;  // 帯上端が水面に被る量(v0.25.1819: 社長指示「10px上へ」で44→54)
// v0.25.1816(社長指示「追従する式に戻しつつ、相対的に20px落として」): 高さ=端末追従式−20px。
// 追従式=上端(水面下端−34px)から境界線(farH)までの距離。−20pxのぶん下端が境界線の20px上で
// 終わり、その下は遠景自身の岩肌が見える(岩on岩なので馴染む想定)。上端アンカー(川被り34px)は不変。
const TUTORIAL_HORIZON_HEIGHT_TRIM_PX = 40; // v0.25.1819: 社長指示「高さを10px縮める」+上移動10px分で20→40(下端=境界線−40px)
// チュートリアルの遠景森2=岩帯2(v0.25.1817・社長指示「この岩帯2を1の手前レイヤーに表示」)。
// ステージ5と同じ実寸px指定(高さ+底=境界線からの下オフセット)。素材2172x368(下端は浮き石の散り)。
// 数値は叩き台(実機調整前提)。
const TUTORIAL_NEAR_HORIZON_HEIGHT_PX = 140; // 岩帯2の高さ(px)(v0.25.1821: 社長指示「+10px」で130→140)
const TUTORIAL_NEAR_HORIZON_DOWN_PX = 25;    // 岩帯2の底=境界線(farH)から下へ(px)(v0.25.1819: 社長指示「20px上へ」で45→25)
// チュートリアルの手前霧(v0.25.1820・社長指示「手前を漂ってる霧を、岩1と岩2の間に、50%の大きさで」):
// frontBank霧(通常=最前面・画面下部)を、z=岩帯1と岩帯2の間へ移し、50%サイズで岩帯の重なり帯に漂わせる。
const TUTORIAL_FRONT_FOG_SCALE = 0.5;        // 霧の大きさ(帯の高さ・柄とも50%)
const TUTORIAL_FRONT_FOG_CENTER_UP_PX = 132; // 霧帯の中心=境界線(farH)から上へ(v0.25.1823: 社長指示「40px上へ」で92→132)
const TUTORIAL_FRONT_Y_OFFSET_PX = 200;      // 手前岩(近景森1)を下へずらす量(v0.25.1825: 社長指示「もう100px下へ」で100→200)
const TUTORIAL_CEILING_SCALE = 1.5;          // ツララ帯の表示倍率(v0.25.1825: 社長指示「1.5倍に」)
const STAGE5_NEAR_HORIZON_HEIGHT_PX = 100;   // 森2の高さ(px)
const STAGE5_NEAR_HORIZON_DOWN_PX = 30;      // 森2の底=境界線から下へ(px・v1744で50→40、v1904で40→30=さらに10px上へ・社長指示)
const NEAR_HORIZON_PARALLAX_X = 0.5;         // 横パララックス(遠景森2=手前)。|大|=近い
const NEAR_HORIZON_BOTTOM_RATIO = 0.10;      // 底を farH からさらに screenH×この割合だけ下へ(大きいほど下)。少し上へ
const NEAR_HORIZON_BLUR = 0.35;              // 近いので地平の森より弱いブラー
const HORIZON_ACTOR_HIDE_OFFSET_PX = 0;
const HORIZON_ACTOR_FADE_PX = 120;
// 非ボス敵の「手前(画面最下端=カメラ近接)で消える」near-plane フェード幅(px)。
// 画面の一番下のこの帯の中だけで 1→0(近くでは消えない=社長指示「距離は下げて」)。
const ENEMY_FOREGROUND_FADE_PX = 110;
const HORIZON_REVEAL_OFFSET_PX = 200;
const HORIZON_REVEAL_FADE_PX = 90;
const FRONT_FOREST_PARALLAX_X = 0.68;
const FRONT_FOREST_HEIGHT_RATIO = 0.5;
const FRONT_FOREST_MIN_HEIGHT = 270;
const FRONT_FOREST_MAX_HEIGHT = 410;
const FRONT_SNOW_Y_OFFSET = 100; // ステージ4の近景(氷壁)を下げる(社長指示で30→100)
const FRONT_STAGE5_Y_OFFSET_RATIO = 0.5; // ステージ5の近景森(戦場の残骸)を半分くらい下げる(社長指示)
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
// NPC8人(=出撃している護衛8人: エドガー/ジョセフ/エリザベス/武蔵/ムハンマド/チェン/ローレン/フェイザー)
// の全表示共通の縮小率(社長指示v0.25.1858「通常NPCとは出撃してるNPC8人のこと。0.8倍・全ての表示で」。
// v0.25.1857の商人/二人組/救助civへの適用は取り違えのため撤回=等倍へ戻した)。
// グレッグ/ジュン(チュートリアル随行)・商人・二人組・救助NPCは対象外。
// 視覚のみ=当たり判定は不変(CLAUDE.md「Visual vs. hitbox」)。会話立ち絵はNpcDialogue側で適用。
const NPC8_SCALE = 0.9; // 0.8→0.9(社長指示v0.25.1859)
const EVENT_QUEST_DWELL_VIS_MS = 3000; // 二人組の滞在受領メーターの満了時間(gameStore.EVENT_QUEST_DWELL_MSと一致)
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
// 北部(stage-4=snow)の遠景森1(氷壁)の拡大/上移動/高さトリム。?northscale= /?northup= /?northtrim= で現地調整可。
const NORTH_FAR_FOREST_EXTRA_SCALE = tsNum('northscale', 1.5);   // 全体1.5倍にさらに上乗せ(=元base比2.25倍)
const NORTH_FAR_FOREST_UP_PX = tsNum('northup', 50);            // 位置を上へ(px。上=Y減算)。v1890で-50、v1891で50に確定(社長・下-50から100px上=+50)
const NORTH_FAR_FOREST_HEIGHT_TRIM_PX = tsNum('northtrim', 100); // 高さを戻す(px)
// 遠景森1(地平の森)の縦「上移動」px を全ステージ個別に持たせる(上=Y減算)。ミッションコード名の ?mXup= で現地調整
// (m0up=tutorial 〜 m7up, ex1up/ex2up)。既定は現行維持(m1up=40, m2up=100, 他=0)。社長指示v0.25.1901。
// 加算関係: snow は別途 northup も効く(加算)/ lab は別途 LAB_HORIZON_FOREST_EXTRA_DOWN(+20下)も効く。
const M0_HORIZON_FOREST_UP_PX = tsNum('m0up', 0);
const M1_HORIZON_FOREST_UP_PX = tsNum('m1up', 60); // 40→60(社長v0.25.1942「森1を20px上へ」)
const M2_HORIZON_FOREST_UP_PX = tsNum('m2up', 60);
const M3_HORIZON_FOREST_UP_PX = tsNum('m3up', 50);
const M4_HORIZON_FOREST_UP_PX = tsNum('m4up', 0);
const M5_HORIZON_FOREST_UP_PX = tsNum('m5up', 0);
const M6_HORIZON_FOREST_UP_PX = tsNum('m6up', 0);
const M7_HORIZON_FOREST_UP_PX = tsNum('m7up', 40); // M1の値をコピー(社長指示v0.25.1905)
const EX1_HORIZON_FOREST_UP_PX = tsNum('ex1up', 0);
const EX2_HORIZON_FOREST_UP_PX = tsNum('ex2up', 0);
const HORIZON_FOREST_UP_BY_STAGE: Record<string, number> = {
  'stage-tutorial': M0_HORIZON_FOREST_UP_PX,
  'stage-1': M1_HORIZON_FOREST_UP_PX,
  'stage-2': M2_HORIZON_FOREST_UP_PX,
  'stage-3': M3_HORIZON_FOREST_UP_PX,
  'stage-4': M4_HORIZON_FOREST_UP_PX,
  'stage-5': M5_HORIZON_FOREST_UP_PX,
  'stage-6': M6_HORIZON_FOREST_UP_PX,
  'stage-7': M7_HORIZON_FOREST_UP_PX,
  'stage-ex1': EX1_HORIZON_FOREST_UP_PX,
  'stage-ex2': EX2_HORIZON_FOREST_UP_PX,
};
// 遠景森1の下端フェード幅(px)。素材下側(雪の地面等)を地面へ滑らかに溶かす。10だと事実上ハードカット。?horizonfade= で調整。
const HORIZON_FOREST_BOTTOM_FADE_PX = tsNum('horizonfade', 120);
// 下端フェードは「絶対px」だと短い森1(tutorial 113px/stage5 130px等)で全体が半透明になる回帰を生む(v1889で10→120にした
// 巻き添え。M0/M5で発覚)。そこで実効フェード幅を「森1高さ×この割合」で頭打ちにし、どのステージでも森1は不透明+下端だけ
// 微ソフトに保つ。半透明の"溶かし"は指名(=snow)だけ(社長指示v0.25.1898)。0.12=stage5で≈16px(v1897承認値を踏襲)。?fadefrac= で調整。
const HORIZON_FOREST_MAX_FADE_FRAC = tsNum('fadefrac', 0.12);
// 【北部(snow)専用】遠景森1が「不透明のまま」でいる下端。horizonH に対する上からの比率。氷壁+足元(赤線=約0.80)より
// 少し下(≈0.86)まで完全不透明にし、そこから下端へ向かってフェード(下ほど透明)=素材の雪原前景の下端だけ地面へ溶かす。
// これより上は透明度0(=不透明)。赤線の上で氷壁を薄めない(社長指示・赤線注釈v0.25.1893)。他ステージは従来どおり。?snowcut= で調整。
const HORIZON_FOREST_SNOW_OPAQUE_UNTIL_FRAC = tsNum('snowcut', 0.86);
// 【北部(snow)専用】遠景森1(氷壁)の横パララックスを森2(nearHorizon)と同等にする(社長指示v0.25.1894)。
// 北部には森2が無い(=氷壁だけ)ため、森2の速度値と揃える。他ステージの森1は従来どおり HORIZON_FOREST_PARALLAX_X。?snowpara= で調整。
const HORIZON_FOREST_SNOW_PARALLAX_X = tsNum('snowpara', NEAR_HORIZON_PARALLAX_X);
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
// チュートリアル(M0)の川の手前の岩間霧を少しぼかす(0=なし。社長指示v0.25.1895)。?tutfogblur= で調整。
const TUTORIAL_FRONT_FOG_BLUR = Math.max(0, tsNum('tutfogblur', 2));
// cine光源の放射streak(光の線)の「出没=煌めき」(社長指示v0.25.1906・?cloud*= で調整)。テクスチャに関わる LAYERS/STREAKS は
// 変更時リロードで再ベイク。SPD/FLOOR は明滅の速さ/下限(FLOOR=0で完全に消える)。
const CINE_CLOUD_LAYERS = Math.max(1, Math.round(tsNum('cloudlayers', 3)));      // 明滅レイヤー数(多いほど細かい/わずかに重い)
const CINE_CLOUD_STREAKS_PER_LAYER = Math.max(1, Math.round(tsNum('cloudstreaks', 22))); // 1層あたりの放射線本数(合計≈従来60)
const CINE_CLOUD_TWINKLE_SPD = Math.max(0, tsNum('cloudspd', 0.0016));           // 明滅の速さ(瞬き感)
const CINE_CLOUD_TWINKLE_FLOOR = Math.max(0, Math.min(1, tsNum('cloudfloor', 0.10))); // 各層の最小alpha倍率(0=完全に消える)
// M7の遠景に重ねる雲(パースフロー: 消失点から拡大＋2枚クロスフェードでループ。社長指示v0.25.1909)。光源の上・空帯にマスク。?scloud*= で調整。
// M7の雲=5コマの下降コンベア+コマ毎の三角クロスフェード(社長指示v0.25.1922/1929)。1波=各コマがフェードイン→ピーク(全alpha)→
// フェードアウトの三角包絡で0→4を再生(次コマは前コマのピーク時に入り始め、前コマが0になる時に次コマがピーク)、頭(フレーム1)も尻(フレーム5)も
// ちゃんとフェード。同時に少しずつ下降。フレーム5(尻フェード)で次波が元の上位置からフレーム1(頭フェード)で湧く=総alpha一定でシームレス。
// 波は最大2本(継ぎ目でだけ重なる)。各波は隣接2コマ=4枚(波A=[0,1]/波B=[2,3])。横位置固定・横いっぱい。森より後ろ・空帯マスク維持。?scloud*= で調整。
const STAGE7_CLOUD_COLS = 1;
const STAGE7_CLOUD_ROWS = 5;
const STAGE7_CLOUD_FRAMES = STAGE7_CLOUD_COLS * STAGE7_CLOUD_ROWS; // 5
const STAGE7_CLOUD_PERIOD_MS = Math.max(750, tsNum('scloudperiod', 1375)); // 1波(フレーム1→5)ms。大きいほどゆっくり(2倍速=2750→1375・社長v0.25.1923)
const STAGE7_CLOUD_ALPHA = Math.max(0, Math.min(1, tsNum('scloudalpha', 0.95))); // 雲のピークalpha(各波の上限)
const STAGE7_CLOUD_DROP = Math.max(0, Math.min(0.4, tsNum('sclouddrop', 0.03)));   // 1波の下降量(screenH比)。「少しだけ下に移動」。0=下降なし(移動距離半分=0.06→0.03・社長v0.25.1924)
const STAGE7_CLOUD_SHRINK = Math.max(0, tsNum('scloudshrink', 20)); // 1コマの寿命(湧き→消滅)で縦に縮む量(px・上下均等・横は不変)。社長v0.25.1938。0=縮み無し
const STAGE7_CLOUD_SIZE = Math.max(0.1, tsNum('scloudsize', 1.0));         // 表示スケール=画面幅×これ÷コマ幅(全画面の空=既定1.0で横いっぱい)。横位置は固定(xy廃止=社長v0.25.1917)
const STAGE7_CLOUD_BAND_FRAC = Math.max(0.05, Math.min(1, tsNum('scloudband', 0.42))); // 雲を見せる空帯の下端(screenH比・maskの高さ)
// M1の遠景=星空6コマの巡回クロスフェード(社長指示v0.25.1931)。farBackdrop(森の空)を覆う・stage-1限定。縦1列×6行。?s1sky*= で調整。
const STAGE1_SKY_FRAMES = 6;
const STAGE1_SKY_PERIOD_MS = Math.max(3000, tsNum('s1skyperiod', 12000)); // 6コマ一巡ms(1コマ≈P/6)。大きいほどゆっくり(2倍速=24000→12000・社長v0.25.1933)
const STAGE1_SKY_ALPHA = Math.max(0, Math.min(1, tsNum('s1skyalpha', 1.0)));  // 星空の不透明度(1=森の空を完全に覆う)
// M1の星空に重ねる城/山/霧の森(緑抜き・静止・社長指示v0.25.1934)。星空の手前・近景森の奥。?s1cast*= で調整。
const STAGE1_CASTLE_SCALE = Math.max(0.2, tsNum('s1castscale', 1.0)); // 横スケール(画面幅比。1=横いっぱい)
const STAGE1_CASTLE_Y = tsNum('s1casty', 0);                           // 底の位置調整(px・+で下へ/−で上へ)。既定0=底を地平(farH)。※px単位(社長v0.25.1936「1以上で消える」修正)
const STAGE1_CASTLE_ALPHA = Math.max(0, Math.min(1, tsNum('s1castalpha', 1.0))); // 不透明度
// 城の横パララックス(社長v0.25.1941「遠景森と同じくプレイヤーが動いたら動く。一番遠いから一番遅い」)。camera.x連動。
// 既存: 銀河0.09 < 森1=0.16 < 森2=0.5。城は森1より遅い(=一番遠い風景)ので既定0.11。?s1castpara= で調整。
const STAGE1_CASTLE_PARALLAX_X = tsNum('s1castpara', 0.11);
// 森2(遠景森2)の手前に重ねる境界霧の濃さ(社長指示v0.25.1874「森と地面の境界を曖昧に」)。?nhmist=で調整。
const NEAR_HORIZON_MIST_ALPHA = Math.max(0, tsNum('nhmist', 0.6));
// 森2境界霧の縦オフセット(社長指示v0.25.1881「100px上へ」)。正=上へ(px)。?nhmistup=で調整。
const NEAR_HORIZON_MIST_UP_PX = tsNum('nhmistup', 100);
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
// プレイヤー足影のスケール。プレイヤー立ち絵は進軍NPCより幅広で影が大きく見えるため、
// 進軍NPCの影(=スプライト幅×0.55・追加スケール無し)と同程度に縮小(社長指示)。実機で微調整可。
const PLAYER_SHADOW_SCALE = 0.7;
// 登場演出のオフセットは store の playerIntroOffset(t) を共有(カメラと同期)。
// 登場演出のヘリコプター(キャラを降ろして上へ逃げる)。画像 'helicopter' 登録時のみ表示。
// 進軍用NPC(護衛軍人)の soldierIndex → ユニーク立ち絵のベース名(`${base}-${frame}`)。
// 0=エドガー / 1=ジョセフ / 2=エリザベス / 3=武蔵 / 4=ムハンマド / 5=チェン / 6=ローレン / 7=フェイザー。
// 未提供のindexは undefined=従来の rescue/shooter にフォールバック(現状は全員提供済み)。
const ESCORT_SPRITE_BASE: (string | undefined)[] = [
  'npc/edgar', 'npc/joseph', 'npc/elizabeth', 'npc/musashi', 'npc/muhammad', 'npc/chen', 'npc/lauren', 'npc/phaser',
];
// 歩行コマ間をクロスフェード補間する soldierIndex。かつてフェイザー=7を対象にしたが、ドット絵で
// 残像(足が二重にボケる)が気になると社長判断(v0.25.1430)で解除=空に戻した。全員素の3コマピンポン。
// 滑らかにしたい軍人が出たら、クロスフェードではなく5コマ素材を用意して差し替える方針。
const ESCORT_CROSSFADE_SOLDIERS = new Set<number>([]);

const HELI_DISPLAY_H = 120;  // 画面上のヘリ高さ(px。横はテクスチャ比で従属)
const HELI_ABOVE = 210;      // 序盤、飛来高度(キャラ上方への随伴オフセット px)
const HELI_LAND_ABOVE = 56;  // 着陸時のヘリ中心高度(px)。=機体下端がほぼ地面=着地。社長指示の「着陸」。
const HELI_DESCEND_FROM = 0.45; // フェーズAのこの割合から着陸降下を開始
const HELI_RISE = 820;       // 離陸で上へ抜ける距離(px)
const HELI_DRIFT_X = 240;    // 離陸時の横ドリフト(px)
const HELI_SIT_MS = 280;     // 着陸後、その場でホバー(着地)してから離陸するまでの間(ms)
// ヘリの随伴高度(キャラ上方への距離)。飛来終盤に HELI_ABOVE→HELI_LAND_ABOVE へ降下して着地する。
// キャラはヘリ中心にピン留めなので、ヘリと一緒に下がってから飛び降りる。
const heliAboveAt = (t: number): number => {
  const hf = PLAYER_INTRO_HELI_FRAC;
  const a = hf > 0 ? Math.min(1, t / hf) : 1;
  if (a <= HELI_DESCEND_FROM) return HELI_ABOVE;
  // 着陸降下: HELI_DESCEND_FROM 〜 フェーズA終端(a=1) で HELI_ABOVE→HELI_LAND_ABOVE まで降りて着地。
  const k = Math.min(1, (a - HELI_DESCEND_FROM) / Math.max(0.001, 1 - HELI_DESCEND_FROM));
  const s = k * k * (3 - 2 * k);
  return HELI_ABOVE + (HELI_LAND_ABOVE - HELI_ABOVE) * s;
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
const ENEMY_HIT_FLASH_MS = 170;        // 被弾フラッシュ(絵を加算で光らせる)の長さ(社長指示で強化: 120→170)
const ENEMY_HIT_FLASH_STRENGTH = 1.0;  // 加算オーバーレイの最大alpha(=光る強さ。社長指示で強化: 0.95→1.0=全面白)
const BOSS_FINISH_LIFT_MS = 420;
const BOSS_FINISH_LIFT_PX = 18;
const PLAYER_WALK_CYCLE_MS = 460;
const PLAYER_CLASS_MENU_SPRITE_WIDTH = 86;
// 背負い刀の大きさ倍率(中心固定で縮小)。
const KATANA_BACK_SCALE = 0.72;
// (旧)近接ナイフのアンカー/角度/三日月定数は、2枚差し替えスイングへの移行で不要になり撤去。
// 2枚差し替えスイング(回転なし・左右ミラーのみ。参考: 社長提供の位置絵)。
// frame1=ダガーをキャラ左下に構え、frame2=ダガー左上+青スラッシュが右へ弧。kt で切替。
// オフセット単位 = キャラ箱高×奥行スケール(unit)。右向き時の値(左向きは ox を反転+画像xミラー)。
// scale = スプライト幅 / unit。実機で微調整可。
const KNIFE_SWING_SWITCH = 0.30;                        // frame1→frame2 切替(kt 0..1)
const KNIFE_SWING_SWITCH2 = 0.62;                       // frame2→frame3 切替(社長提供の3コマ化 v0.25.1444)
const KNIFE_F1 = { scale: 0.95, ox: -0.30, oy: 0.12 };  // 1枚目: キャラ左下のダガー(少し上げた)
const KNIFE_F2 = { scale: 1.80, ox: 0.22, oy: -0.12 };  // 2枚目: 被せ+スラッシュ右へ(少し上げた・少し大きく)
// 3枚目: 弧の残光(ダガー無し)。2枚目と共通クロップで焼いてあるため同じ配置=弧がズレずに残ってフェード。
const KNIFE_F3 = { scale: 1.80, ox: 0.22, oy: -0.12 };
// 装備中の近接武器の実絵をスイングに重ねる(v0.25.1456 社長指示)。武器アイコン5種は同スタイル
// (刃先が右上≈-46°)なので共通の回転定数で合う。値は焼き込みダガーのPCA計測から:
// f1: ダガーはknife-swing-1キャンバス中心・軸-25.3°(刃先左下) → アイコン回転200.7°・長さ=unit×0.95
// f2: 弧テクスチャ内の中心割合(0.173,0.250)・軸26.6°(刃先左上=振り抜き) → 回転252.6°・長さ=unit×0.608
// ※knife-swing-2はv0.25.1456から「弧のみ」(社長提供)。ナイフはこのスプライトが担当する。
const MELEE_WPN_F1 = { rot: 200.7 * Math.PI / 180, len: 0.95 };
const MELEE_WPN_F2 = { rot: 252.6 * Math.PI / 180, len: 0.608, fx: 0.173, fy: 0.250 };
// スイングの時間イージング(社長指示 v0.25.1457): 進行をゆっくり→速く→ゆっくり(smoothstep)に。
// 構えがタメて、振り抜きが鋭く走り、残光がゆったり消える。見た目のみ=当たり判定の
// タイミング・総時間(PLAYER_MELEE_SWING_MS)は不変。
const meleeSwingEase = (t: number): number => t * t * (3 - 2 * t);
// 背負い刀(実画像)の追加回転(rad)。素材が既に斜め(柄=右上/鞘=左下)なので既定0。実機で微調整可。
const KATANA_BACK_IMG_ROT = 0;
// ドローンブーメラン投擲物の表示サイズ(叩き台): 旧procedural描画の視覚半径は p.width*0.5
// (=直径 p.width)だったので、初期値はそれに合わせて 1.0(スプライト表示幅 ≒ p.width)。
// 実機で大きすぎ/小さすぎればここだけ調整する。
const DRONE_BOOMERANG_SPRITE_SCALE = 2.0; // 社長指示v0.25.1611: 絵を2倍(表示のみ・当たり判定 p.width は不変)
// 救急鞄(first-aid-kit)の空鞄投擲スプライトの表示幅(px・叩き台)。CLAUDE.md「敵サイズ程度で読める」
// 指示どおり、雑魚敵(zombie 30px)前後を狙った値。実機で大きすぎ/小さすぎればここだけ調整する。
const THROWN_BAG_SPRITE_WIDTH = 28;
const DOG_WALK_FRAME_MS = 150;
const DOG_SPRITE_SCALE = 1 / 3;
// 5コマ×ピンポン(左→右→折り返し→右→左)歩行を使うクラス。4クラス全て社長提供の5コマ立ち絵を採用:
// スカベンジャー(necromancer→player-striker-*)/ヘビーガンナー(warrior→player-shotgun-*)/
// ストライカー(rogue→player-scavenger-*)/マークスマン(mage→player-magnum-*)。
const usesFiveFramePingPong = (p: Player): boolean =>
  p.characterClass === 'necromancer' || p.characterClass === 'warrior' ||
  p.characterClass === 'rogue' || p.characterClass === 'mage';
const playerWalkSequence = (p: Player): number[] =>
  // 5コマ勢は端(0,4)を重複させず往復してループ=滑らかな折り返し。
  usesFiveFramePingPong(p)
    ? [0, 1, 2, 3, 4, 3, 2, 1]
    : [0, 1];
// 歩行アニメの1周期(ms)。5コマ×ピンポン勢はコマ数が多いぶん、他クラスと同じ460msだと
// コマ送りが速すぎるため専用に長め(社長指示「周期を変えて」)。
const PINGPONG_WALK_CYCLE_MS = 900;
const playerWalkCycleMs = (p: Player): number =>
  usesFiveFramePingPong(p) ? PINGPONG_WALK_CYCLE_MS : PLAYER_WALK_CYCLE_MS;
// 走りモーション(社長提供・移動レバーを目一杯倒した時だけ): マークスマン(magnum-run)+
// ストライカー(scavenger-run・v0.25.1576)。両者とも前方ループ[0..4](マークスマンはv0.25.1639で
// ピンポン→前方ループに変更)。周期は歩きより速める(走り=急ぐ動き)。
// `?playerrun=0`で無効化(常に歩きモーション)。`?runthreshold=`でしきい値を調整可(実機調整前提)。
const PLAYER_RUN_ENABLED = tsBool('playerrun', true);
const PLAYER_RUN_CYCLE_MS = tsNum('runcyclems', 560);
const PLAYER_RUN_SWIPE_THRESHOLD = tsNum('runthreshold', 0.98); // ほぼ最大チルト(浮動小数の丸め対策で1.0ちょうどにしない)
const usesRunAnimation = (p: Player): boolean =>
  PLAYER_RUN_ENABLED && (p.characterClass === 'mage' || p.characterClass === 'rogue' || p.characterClass === 'warrior' || p.characterClass === 'necromancer');
// 走りのコマ並び: ストライカー(rogue)=5コマ前方ループ・ヘビーガンナー(warrior)=6コマ前方ループ・
// スカベンジャー(necromancer=striker接頭辞)=5コマ前方ループ(いずれも折り返さない=社長指示)。
// マークスマン(mage)=5コマ前方ループ(社長指示v0.25.1639「走りピンポンやめる」。旧=歩きと同じ8段ping-pong)。
// ※歩きのコマ並び(playerWalkSequence)は不変=ピンポンのまま。走りだけ前方ループにする。
const playerRunSequence = (p: Player): number[] =>
  p.characterClass === 'warrior' ? [0, 1, 2, 3, 4, 5]
  : [0, 1, 2, 3, 4];
const playerWalkFrame = (p: Player, now: number, walking: boolean, running = false): number => {
  if (!walking) return 0;
  const runAnim = running && usesRunAnimation(p);
  const sequence = runAnim ? playerRunSequence(p) : playerWalkSequence(p);
  const cycle = runAnim ? PLAYER_RUN_CYCLE_MS : playerWalkCycleMs(p);
  const index = Math.floor((now % cycle) / (cycle / sequence.length));
  return sequence[index] ?? 0;
};
// 歩いていない時のクラス別 待機立ち絵(社長提供)。※クラスID↔ファイル名の対応は既存仕様のまま:
// mage=マークスマン / warrior=ヘビーガンナー / necromancer=スカベンジャー / rogue=ストライカー。
const PLAYER_IDLE_SPRITE: Partial<Record<Player['characterClass'], string>> = {
  mage: 'player-magnum-idle',
  warrior: 'player-shotgun-idle',
  necromancer: 'player-striker-idle',
  rogue: 'player-scavenger-idle',
};
// 救難信号アライ用の空装備(v0.25.1726): プレイヤーをspreadした fakeAlly に本人のequipmentが
// 残っていると、武将セットフル装備中は playerTextureName が武将立ち絵を優先して characterClass 差し替えが
// 無視され、仲間がプレイヤー本人の絵になるバグの根因だった。仲間の絵は常に素のクラス待機絵にする。
// (援護射撃NPCはv0.25.1727で軍人立ち絵(ESCORT_SPRITE_BASE)へ変更されたためこの経路を通らない。)
const ALLY_PLAIN_EQUIP = emptyEquipLoadout();
// プレイヤーの立ち絵テクスチャ名(クラス/武将装備/フレーム別)。分身もこれを共有して同じ外見にする。
// ※ necromancer→striker / rogue→scavenger の対応は既存仕様のまま(入れ替えない)。
const playerTextureName = (p: Player, frame: number, walking = true, running = false): string => {
  const warlordFull = hasFullWarlordSet(p.equipment);
  const warlordKatana = warlordFull && hasMurasame(p);
  // 歩いていない時は各クラス専用の待機立ち絵(社長提供)。武将フル装備中は武将立ち絵が優先(待機絵なし)。
  if (!walking && !warlordFull && PLAYER_IDLE_SPRITE[p.characterClass]) return PLAYER_IDLE_SPRITE[p.characterClass]!;
  // 走りモーション(移動レバー全開時のみ・全4クラス)。武将フル装備中は武将立ち絵を優先(走り絵なし)。
  // ※クラスID↔ファイル名の対応は既存仕様のまま: rogue=ストライカー=scavenger / warrior=ヘビーガンナー=shotgun /
  //   necromancer=スカベンジャー=striker / mage=マークスマン=magnum。
  if (running && !warlordFull && usesRunAnimation(p)) {
    return p.characterClass === 'rogue' ? `player-scavenger-run-${frame}`
      : p.characterClass === 'warrior' ? `player-shotgun-run-${frame}`
      : p.characterClass === 'necromancer' ? `player-striker-run-${frame}`
      : `player-magnum-run-${frame}`;
  }
  return warlordKatana ? `player-warlord-katana-walk-${frame}`
    : warlordFull ? `player-warlord-gun-walk-${frame}`
    : p.characterClass === 'mage' ? `player-magnum-walk-${frame}`
    : p.characterClass === 'warrior' ? `player-shotgun-walk-${frame}`
    : p.characterClass === 'necromancer' ? `player-striker-walk-${frame}`
    : p.characterClass === 'rogue' ? `player-scavenger-walk-${frame}`
    : 'player';
};
// 立ち絵のベース拡大率(クラス絵=幅基準 / 武将立ち絵=高さ基準 / 不明クラス=枠内接)。分身と共有。
// クラス絵は表示基準幅 PLAYER_ART_BASE_W(78px)へ正規化(社長決定v0.25.1763・エリオット式=NPC方式):
//  ・現行素材(実寸78px幅)では 78/78=×1.0 で従来(v0.25.1761 等倍)とビット一致=挙動不変。
//  ・高解像度素材(同じ構図を整数倍×2〜×4で描き出した版)が届いたら自動で縮小表示
//    (ロード側 pixiTextures が linear+mipmap 化)。画面上のサイズは変えず密度だけ上がる=
//    NPCが潰れないのと同じ理屈(1ドット<1画面px)。
// 旧86/78≈1.103の非整数nearest拡大が「ドット潰れ」の主因だった経緯は v0.25.1759 参照。
const playerBaseScale = (p: Player, tex: Texture, boxW: number, boxH: number): number => {
  if (hasFullWarlordSet(p.equipment)) return ((PLAYER_CLASS_MENU_SPRITE_WIDTH / 128) * 108) / tex.height;
  const knownClass = p.characterClass === 'mage' || p.characterClass === 'warrior' ||
    p.characterClass === 'rogue' || p.characterClass === 'necromancer';
  return knownClass ? PLAYER_ART_BASE_W / tex.width : containScale(boxW, boxH, tex.width, tex.height);
};
// プレイヤーのピクセルスナップ(v0.25.1768-1774): 1ドット=キャンバス整数px へ丸めて
// 「半端な拡大率」由来のドット潰れ(1px/2px列のまだら)を根治する。復帰フラグ ?psnap=0。
//  ・帯内(常用機のフルスクリーン係数0.889〜1.086)では整数1へスナップ=プレイヤーはキャンバス等倍固定
//    (待機ズームや遠近ではサイズが変わらない)。ズーム演出で帯を外れたら線形ブレンドで素へ(跳ねない)。
//  ・歩行スカッシュ等の演出係数はスナップの外側に掛かる(演出は殺さない。動作中の僅かなまだらは
//    知覚されない=v0.25.1770-1771のA/Bで確定)。
// 数学部分と帯幅(HOLD13%/RELEASE19%)の根拠は utils/texelSnap.ts(純関数・規律4)。
// 機種網羅の不変条件は utils/deviceCoverage.test.ts がCIで機械検査(規律6)。
const TEXEL_SNAP_ENABLED = typeof window === 'undefined'
  || new URLSearchParams(window.location.search).get('psnap') !== '0';
// プレイヤー本体の二次モーション(歩行スカッシュ&ストレッチ/リーン/上下bob・発砲反動・近接踏み込み・
// カウンター決めポーズ・リロード揺れ)の一括スイッチ。v0.25.1770の全OFF検証で「動作中の変形はドットの
// 崩れとして知覚されない」(テンポラルマスキング=毎フレーム別の場所に出る崩れは残像で溶ける。犯人は
// 静止/低速の半端スケールだけ=ピクセルスナップで根治済み)と社長実機確認→**全演出ON=確定(v0.25.1771)**。
// 診断用に `?pmotion=0` で一括OFF(剛体スプライト化)へ切替可。対象はプレイヤー本体の変形のみ
// (コマ差し替え(歩き/走り/近接ポーズ)・登場演出・ノックバック跳ね(敵共通)・分身/救援アライは対象外)。
const PLAYER_MOTION_FX = typeof window === 'undefined'
  || new URLSearchParams(window.location.search).get('pmotion') !== '0';
const PLAYER_WALK_BOB_PX = 0.8;
// ノックバック時の小さな縦の跳ね(社長指示「少し跳ねる感じ」)。敵・プレイヤー共通。視覚のみ=
// 当たり判定/位置(store)は不変。1回のノックバックで sin の1山ぶんポンと跳ねて着地する。
const KNOCKBACK_HOP_PX = 12;   // 跳ねの高さ(px・社長指示でもっと分かりやすく: 6→12)
const KNOCKBACK_HOP_MS = 260;  // 跳ねアークの所要時間(敵=被弾lastHit起点 / プレイヤー=knockbackUntil逆算)
// 徒歩を自然に見せる二次モーション(3コマの上に重ねる・視覚のみ・判定不変)。
const PLAYER_WALK_LEAN_RAD = 0.035;   // 足元支点の左右リーン(±約2°)。1歩ごとに体重移動
const PLAYER_WALK_SQUASH = 0.05;      // 接地↔遊脚で縦に伸縮するスカッシュ量
// 行動の二次モーション(歩きと同じく静止スプライトに重ねる連続変形・視覚のみ・判定不変)。
// すべて scale倍率/回転加算/足元基準の画面pxオフセット。当たり判定・射程・速度には一切不干渉。
const PLAYER_FIRE_RECOIL_MS = 130;    // 発砲の反動が収まるまで(エンベロープ長)
const PLAYER_FIRE_RECOIL_PX = 3.2;    // 銃口と逆向き(=後方)へ体が下がる最大px
const PLAYER_FIRE_RECOIL_SQUASH = 0.04; // 反動で軽く縦に縮む量
const PLAYER_MELEE_SWING_MS = 280;    // 近接スイングの踏み込み→振り抜き→復帰の長さ(社長指示でもう少しスローに: 200→220→250→280。視覚のみ=攻撃レート/判定は別ゲート・不変)
const WIRE_SLAM_JUMP_H = 92;          // アンカー大技の見た目ジャンプ高さ(px・負方向=上)。引き上げ→斬り下ろしの弧。
const PLAYER_MELEE_LUNGE_PX = 6;      // 狙い方向へ踏み込む最大px
const PLAYER_MELEE_LEAN_RAD = 0.13;   // 振り抜きの傾き(向き依存・約7.5°)
const PLAYER_MELEE_STRETCH = 0.09;    // 振り抜きピークの横ストレッチ
const MELEE_POSE_READY_FRAC = 0.4; // 近接専用ポーズ: 構え絵を出すスイング進行の割合(以降は振り抜き絵)。社長指示v0.25.1620・叩き台
// 救急鞄スキル発動演出(社長指示v0.25.1656): 払い出しの瞬間に「振り抜きポーズ+鞄を頭上へ掲げる」一拍。全て叩き台=実機調整前提。
const PLAYER_FIRSTAID_POSE_MS = 620;        // ポーズ+鞄掲げの表示長(描画のみ・判定不変)
const PLAYER_FIRSTAID_BAG_SCALE = 0.92;     // 掲げる鞄の大きさ(体高basis の割合)
const PLAYER_FIRSTAID_BAG_UP_FRAC = 1.18;   // 足元から上へ何体高ぶん掲げるか(=頭上)
const PLAYER_FIRSTAID_BAG_FWD_FRAC = 0.26;  // 狙い/向き方向へ何体高ぶん前へ出すか(掲げる手側)
// 近接に専用2ポーズ絵を持つクラス→ファイル接頭辞(-ready=構え / -swing=振り抜き)。素材のあるクラスのみ登録。
const MELEE_POSE_PREFIX: Record<string, string> = {
  necromancer: 'player-striker-melee', // スカベンジャー(社長提供v0.25.1620)
  mage: 'player-magnum-melee',         // マークスマン(社長提供v0.25.1622)
  warrior: 'player-shotgun-melee',     // ヘビーガンナー(社長提供v0.25.1624)
  rogue: 'player-scavenger-melee',     // ストライカー(社長提供v0.25.1625)=4クラス完備
};
const RESCUE_ALLY_HOP_PX = 48;        // 救援アライの飛来ジャンプ弧の頂点の高さ(px・視覚のみ)。社長指示v0.25.1613
const RESCUE_ALLY_FRONT_MARGIN = 14;  // 着地を敵の足元より何px手前(下=描画で前面)へ取るか。社長指示v0.25.1614
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
  screamer: 0x9fe870, // 変異体(叫喚型・毒々しい緑の発光)
};
// バー/メーターの色トンマナ統一(社長指示)。デザイン理論=同一トーン(Tailwind -400 帯で彩度/明度を揃えた
// 一族)で 緑(健全)/黄(注意・リロード)/赤(危険)/青(味方) を統一。背景は共通の半透明黒。単一の出所に集約。
const BAR_BG_ALPHA = 0.5;       // 数値連動バー共通の半透明黒背景
const STATUS_GREEN = 0x34d399;  // emerald-400: HP高(健全)
const STATUS_RED = 0xf87171;    // red-400: HP低/危険
const STATUS_YELLOW = 0xfbbf24; // amber-400: リロード/注意
const STATUS_ALLY = 0x38bdf8;   // sky-400: 味方(救助対象)
// 裏ボスの影: 当たり判定より一回り大きく見せる倍率＋鮮やかめの赤(社長指示)。
const BOSS_SHADOW_SCALE = 1.35;  // 当たり判定(w×h)に対する影の拡大率
const BOSS_SHADOW_TINT = 0x9a0000; // 暗赤(0x5a0000)→より赤く
// ミーミルのレーザー描画(視覚・useGameLoop のゲームプレイ値と揃える)。
const MIMIR_LASER_VIS_RANGE = 2600;     // 描画上のビーム長(px)
const MIMIR_LASER_VIS_HALFWIDTH = 34;   // 描画上のビーム半太さ(当たり判定と同じ)
const MIMIR_LASER_WINDUP_MS = 3000;     // 溜め時間(進行度の算出用・useGameLoop と一致)
const MIMIR_LASER_FIRE_MS = 1500;       // 発射本体の表示時間(フェード用・useGameLoop と一致)
// トール(ステージ5裏ボス)の独自攻撃の描画(視覚・useGameLoop のゲームプレイ値と揃える)。
const THOR_ISSEN_WINDUP_MS = 3000;      // 一閃の溜め時間(進行度の算出用)
const THOR_ISSEN_DASH_MS = 280;         // 一閃の高速移動そのものの所要時間(フェード用)
const THOR_ISSEN_VIS_HALFWIDTH = 80;    // 一閃の描画半太さ(当たり判定と同じ・社長修正指示で120の2/3へ)
const THOR_HARAI_WINDUP_MS = 1000;      // 払いの予告(逆回転+並行ライン)時間
const THOR_HARAI_ACTIVE_MS = 220;       // 払いの実行(判定持続)時間
const THOR_HARAI_VIS_HALFWIDTH = 40;    // 払いの描画半太さ(当たり判定THOR_HARAI_HALF_WIDTH=40と一致・社長指示v0.25.1610)
// ミゲル(ゲート2ボス)の横払い(狭)描画用(視覚・useGameLoop のゲームプレイ値と一致させること)。
const MIGUEL_HARAI_WINDUP_MS = 1000;    // 払いの予告時間(useGameLoop と一致)
const MIGUEL_HARAI_ACTIVE_MS = 220;     // 払いの実行(判定持続)時間(useGameLoop と一致)
const MIGUEL_HARAI_VIS_HALFWIDTH = 40;  // 払いの描画半太さ(当たり判定MIGUEL_HARAI_HALF_WIDTH=40と一致・社長指示v0.25.1610)
const THOR_TSUKI_WINDUP_MS = 1000;      // 突きの溜め時間(useGameLoop と一致・溜め演出の進行度算出用)
const TSUKI_DRAW_BACK_PX = 20;          // 突き溜め: 手元を狙い線の後方へ引く量(社長指示「少しだけ」ゆっくり)
const THOR_TSUKI_MS = 180;              // 突きの実行(判定持続)時間(useGameLoop と一致)
const THOR_TSUKI_VIS_HALFWIDTH = 15;    // 突きの描画半太さ(当たり判定THOR_TSUKI_HALF_WIDTH=15と一致・社長指示v0.25.1622)
const THOR_JUMP_RADIUS = 70;            // ジャンプ攻撃の着地爆風半径(useGameLoop と一致)
// トールの刀(社長提供・横払い/突きの視認性を上げる追加ビジュアル)。素材(thor-katana、紫背景色キー
// 透過済み・1254x1254正方形)は切っ先が左上・柄/房が右下の対角線上に描かれている。柄(握り)を
// フラクション座標で近似し、そこを回転軸として当たり判定ライン方向へ向ける。実機調整前提。
const THOR_KATANA_GRIP_FRAC = { x: 0.80, y: 0.76 };  // 柄(握り位置)の画像内フラクション座標
const THOR_KATANA_TIP_FRAC = { x: 0.05, y: 0.10 };   // 切っ先の画像内フラクション座標(角度/長さ算出用)

// PACING_PUZZLE.md §5.25 M24(社長採用v0.25.1540): トール全4攻撃(issen/tsuki/harai/jump)の
// 「ダメージ瞬間」の400ms前から、体を鋭く赤フラッシュ(反応の一拍)。既存のゾーンテレグラフ
// (赤線/楕円/斬撃poly/issenの3秒じわランプ)は据え置き=併存。ここは体tintの上書きのみ。
// `?thorflash=0`で無効化。
const THOR_FLASH_ENABLED = tsBool('thorflash', true);
const THOR_FLASH_LEAD_MS = tsNum('thorflashlead', 400);
// 400ms間に2〜3回の鋭いパルスになる周期(issenの緩やかな点滅=now/260 の約4倍速)。
// remainingMs=「ダメージ瞬間」までの残りms(0〜THOR_FLASH_LEAD_MS外ならnullで無効)。
const thorFlashTint = (remainingMs: number, now: number): number | null => {
  if (!THOR_FLASH_ENABLED) return null;
  if (remainingMs < 0 || remainingMs > THOR_FLASH_LEAD_MS) return null;
  const blink = 0.5 + 0.5 * Math.sin(now / 30);
  const gb = Math.round(255 * (1 - blink) * 0.25); // 緑/青を大きく落として鋭い赤みへ寄せる
  return (255 << 16) | (gb << 8) | gb;
};
const THOR_KATANA_INTRINSIC_ANGLE = Math.atan2(
  THOR_KATANA_TIP_FRAC.y - THOR_KATANA_GRIP_FRAC.y,
  THOR_KATANA_TIP_FRAC.x - THOR_KATANA_GRIP_FRAC.x,
); // 画像自体の柄→切っ先方向(ローカル角度)
const THOR_KATANA_BLADE_LEN_FRAC = Math.hypot(
  THOR_KATANA_TIP_FRAC.x - THOR_KATANA_GRIP_FRAC.x,
  THOR_KATANA_TIP_FRAC.y - THOR_KATANA_GRIP_FRAC.y,
); // 柄→切っ先の距離(画像サイズに対する比率)
const THOR_KATANA_LENGTH = 220; // 表示上の柄→切っ先の長さ(px・トールの体格に対して自然な長さ)
// PACING_PUZZLE.md §5.21-追補8: ミゲルの剣(社長提供・miguel-sword.png=805×3437・透過済み。
// 縦長で柄が上・切っ先が下)。thor-katanaと同じ「柄フラクション座標を回転軸にして当たり判定
// ライン方向へ向ける」方式を流用。叩き台(実機調整前提)。
const MIGUEL_SWORD_GRIP_FRAC = { x: 0.51, y: 0.14 };  // 柄(握り位置)の画像内フラクション座標
const MIGUEL_SWORD_TIP_FRAC = { x: 0.47, y: 1.00 };   // 切っ先の画像内フラクション座標
const MIGUEL_SWORD_INTRINSIC_ANGLE = Math.atan2(
  MIGUEL_SWORD_TIP_FRAC.y - MIGUEL_SWORD_GRIP_FRAC.y,
  MIGUEL_SWORD_TIP_FRAC.x - MIGUEL_SWORD_GRIP_FRAC.x,
); // 画像自体の柄→切っ先方向(ローカル角度)
const MIGUEL_SWORD_BLADE_LEN_FRAC = Math.hypot(
  MIGUEL_SWORD_TIP_FRAC.x - MIGUEL_SWORD_GRIP_FRAC.x,
  MIGUEL_SWORD_TIP_FRAC.y - MIGUEL_SWORD_GRIP_FRAC.y,
); // 柄→切っ先の距離(画像サイズに対する比率)
const MIGUEL_SWORD_LENGTH = 40; // 表示上の柄→切っ先の長さ(px・見た目のみ=当たり判定はMIGUEL_HARAI_RANGE。社長指示: v1597「大きすぎる」で260→160、v1600「まだ大きい・半分の半分くらい」で160→40。叩き台=実機調整前提)
// 色付き個体の「影の色」。装飾は廃止し、足元の影をこの色で染める(青<紫<赤)。
const ENEMY_COLOR_TIER_SHADOW: Record<string, { tint: number; alphaMult: number }> = {
  // 色はそのまま、濃さ(alphaMult)を上げて色が地面に乗りやすく=見分けやすく(社長指示)。1.7/1.7/1.9→2.1/2.1/2.3。
  blue: { tint: 0x3b82f6, alphaMult: 2.1 },
  purple: { tint: 0xa855f7, alphaMult: 2.1 },
  red: { tint: 0xef4444, alphaMult: 2.3 },
};
// PACING_PUZZLE.md §5.15 M15(社長決定・既定ON): 体格拡大の代わりに本体スプライトをtintで色分け
// (遠目でも分かる濃さ)。?raretint=0で旧(tintなし=影のみ+体格拡大)へ戻す
// (enemyUtils.tsのRARE_TINT_ENABLEDと同名パラメータ・各自読む=既存の流儀どおり)。
const RARE_BODY_TINT_ENABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('raretint') !== '0';
const ENEMY_COLOR_TIER_BODY_TINT: Record<string, number> = {
  blue: 0x66aaff, purple: 0xbb66ff, red: 0xff5544,
};

// PACING_PUZZLE.md §5.23 M22 Group A(A2弾トレーサー・既定ON): 既存の弾描画(pooled Graphics・
// J130で安全確認済み)に追加のfill呼び出し1回で尾を足すだけ=新規プールなし。?tracer=0で無効化。
const BULLET_TRACER_ENABLED = tsBool('tracer', true);

// PACING_PUZZLE.md §5.23 M22 Group C(C4スピードライン・既定ON): 突進(刀の一閃ダッシュ/ワイヤー
// アンカーの高速移動)またはカウンター成立直後だけ、画面端寄りに薄い速度線を数本出す
// (pooled sprite固定8本・getGlowTextureの使い回し=新規テクスチャなし)。?speedline=0で無効化。
const SPEEDLINE_ENABLED = tsBool('speedline', true);
const SPEED_LINE_COUNT = 8;          // 固定プール=同時数キャップそのもの
const SPEED_LINE_LENGTH = 130;       // screen px
const SPEED_LINE_THICKNESS = 5;      // screen px(細い帯)
const SPEED_LINE_DIST_FRAC = 0.62;   // 画面対角の半分に対する配置距離(画面端寄り)
const SPEED_LINE_FADE_MS = 90;       // 終了間際にこのmsで線形フェード(ポップインは省略=短命なので不要)
const SPEED_LINE_MAX_ALPHA = 0.55;

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
// 緑卵(mine)のプールスプライト表示サイズ(社長指示で気持ち大きく: 18/24→22/29。当たり判定(mineRect)は
// world/mines.ts 側で別管理=見た目だけの変更、判定は不変)。
const EGG_VISUAL_W = 22;
const EGG_VISUAL_H = 29;
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
// 火炎瓶(molotov)の地面の火: 松明の炎(drawFlameShape)をそのまま流用するが、松明の柱は無く
// 地面の火だまりなので松明本体より小さめの半径(見た目のみ・当たり判定は MOLOTOV_FIRE_RADIUS で
// 別管理=CLAUDE.md「見た目と当たり判定の分離」)。
const GROUND_FIRE_FLAME_R = 4.2;
const GROUND_FIRE_LIGHT_RADIUS = 46;
const GROUND_FIRE_VIEWPORT_MARGIN = 120;
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
// 投影影の大きさ倍率(長さ・幅・接地楕円をまとめて拡縮)。v0.25.1077で社長指示により2倍にしたが、
// v0.25.1435で「1058の頃の影に戻す」の一環として1倍(v1077以前の見た目)へ戻した(社長指示)。
const LOCAL_EVENT_SHADOW_SIZE_MULT = 1;
// スカジの氷刃テクスチャの刃先方向(実測: hilt→tip ≈ -62.8°)。発射方向 angle に合わせ rotation=angle-この値。
const SKADI_BLADE_NATIVE_ANGLE = -62.8 * Math.PI / 180;
const RAFI_BLADE_NATIVE_ANGLE = -90 * Math.PI / 180; // 骨刃(rafi-blade)の素材内の刃先向き(叩き台=実機で微調整)
// 発火ナイフ投擲物テクスチャの刃先方向(実測: 柄→刃先 ≈ -52.6°)。進行方向 direction に合わせ rotation=angle-この値。
const FIRE_KNIFE_NATIVE_ANGLE = -52.6 * Math.PI / 180;
const FIRE_KNIFE_DISPLAY_LEN = 22; // 画面上の全長(px)。当たり判定(14x14)より少し大きく見せて視認性を確保(見た目のみ・当たり判定は不変)。
const FIRE_KNIFE_NATIVE_LEN = 624;         // 実測: テクスチャ内の柄(石)中心→刃先の距離(px、原寸)
const FIRE_KNIFE_HILT_RADIUS_FRAC = 0.49;  // 実測: 中心→柄(石)中心は全長の約半分弱
// 木/壁/プロップへの常時足影(太陽/月の方向影)。負荷キャップ=プレイヤーに近い順この個数まで。
// 順位下ほど薄くして境界の入れ替わりポップを防ぐ(社長指示・視覚のみ)。
const OBJECT_SHADOW_MAX = 7;

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

// ★確認用: 全敵の当たり判定「帯」をうっすら色付きで描くデバッグ表示。社長確認OK=通常時OFF(裏ボスの帯は別途常時表示)。
const SHOW_HITBOX_STRIP = false;

// 裏ボスは「当たり判定=足元の帯(AABB=enemy.width×height)」と「絵(巨体)」を分離して描く(社長指示)。
// fit = 絵の中での帯の位置・大きさ(0..1 の割合): w/h=帯が絵に占める幅/高さ, cx/cy=帯中心の絵内座標(左上原点)。
// これで scale=(帯幅/fit.w)/texW から絵の実寸が決まり、帯=AABBの上に絵が正しく乗る。素材の額装が変わったら再計測。
const BOSS_SPRITE_FIT: Record<string, { w: number; h: number; cx: number; cy: number }> = {
  mimir:      { w: 0.55, h: 0.24, cx: 0.48, cy: 0.84 }, // 眼(縦長 849×1080)。帯=絵の一番下のピクセル寄り(社長指示)。
  jormungand: { w: 0.91, h: 0.21, cx: 0.50, cy: 0.72 }, // 巨蛇(横長 1280×960)。帯=とぐろの下端。
  skadi:      { w: 0.92, h: 0.19, cx: 0.49, cy: 0.88 }, // 氷の王(1151×1243)。帯=足元。
  thor:       { w: 0.50, h: 0.20, cx: 0.52, cy: 0.93 }, // 鬼刀の武人(1132×1147)。帯=両足の実測位置。
  miguel:     { w: 0.50, h: 0.20, cx: 0.35, cy: 0.99 }, // 大天使ミゲル(797×1187)。thor流用+足元実測の叩き台(実機微調整前提)。
  jibril:     { w: 0.50, h: 0.18, cx: 0.40, cy: 0.97 }, // 天使ジブリル(740×1267)。ミゲル流用+足元の叩き台(実機微調整前提)。
  rafi:       { w: 0.50, h: 0.16, cx: 0.50, cy: 0.96 }, // 天使ラフィ(728×881・横広の獣性個体)。足元の叩き台(実機微調整前提)。
};
const BOSS_FIT_DEFAULT = { w: 0.8, h: 0.2, cx: 0.5, cy: 0.85 };
// 設置物(盾)/召喚が攻撃された時の被弾シェイク。減衰する短い横揺れ(描画のみ)。
const HIT_SHAKE_MS = 220;
const HIT_SHAKE_PX = 4;
// プレイヤーが裏ボスの当たり判定(帯)より奥=裏に回り込んだとき、巨体の絵で自機が隠れないよう薄く透かす(社長指示)。
const BOSS_BEHIND_ALPHA = 0.5;
// #2(社長指示): 裏に回って 0.5 まで薄くなった後、さらに奥(=手前へ遠ざかる)へ離れたら、
// この距離(behindDist=70→FAR)で 0.5→0(完全透明)へ続ける。#1(0.5まで)の数値・カーブは不変。
const BOSS_BEHIND_FAR_PX = 220;
// #3(社長指示v0.25.1599): 裏に回っても「近接攻撃距離くらい」までは完全透明にせず、半透明
// (=BOSS_BEHIND_ALPHA)を下限に保つ。#2で0へ薄くなる区間でも、この距離以内なら0.5で止める。
// 距離アンカーは近接攻撃距離(gameStore の MELEE_RADIUS=74)に合わせた視覚用の複製値(描画は
// ゲーム定数へ結合させない方針)。当たり判定/近接判定は不変=見た目の下限だけを足す。
const BOSS_BEHIND_MELEE_PX = 74;
const STAGE4_ENEMY_VISUAL_SCALE = 1.5; // ステージ4の全敵絵を1.5倍(社長指示)。足元アンカーで上方向に拡大。
// 色付き(レア)個体のサイズ差は enemyUtils の COLOR_TIER_SIZE_MULT で「当たり判定ごと」拡大する
// (社長指示)。描画は判定箱(fb)にフィットするため、ここでの追加倍率は不要(掛けると二重拡大になる)。
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

// ステージ5(対変異体防衛本部)専用の敵絵。ステージ1と同配置のシート(社長提供・2026-07-16)から
// 9種を1:1差し替え+シート10体目(フード付き亡霊)=lich(社長裁定2026-07-17「一旦リッチと同じでいい」
// =ステージ4と同じ扱いでステージ5にもlichを出す)。当たり判定/サイズは不変。farBackdrop==='stage5' のみ。
const STAGE5_ENEMY_TYPES = new Set(['zombie', 'bat', 'skeleton', 'plant', 'ghost', 'werewolf', 'pumpkin', 'giantbat', 'reaper', 'lich']);
const stage5EnemyTextureName = (type: string): string | null =>
  STAGE5_ENEMY_TYPES.has(type) ? `stage5-enemies/${type}` : null;
// ステージ5の足元ズレ補正(STAGE4_FOOT_FRAC_Xと同方式: 下端12%帯のα重心x比率を実測)。
const STAGE5_FOOT_FRAC_X: Record<string, number> = {
  zombie: 0.460,
  bat: 0.515,
  skeleton: 0.468,
  plant: 0.486,
  ghost: 0.469,
  werewolf: 0.521,
  pumpkin: 0.477,
  giantbat: 0.485,
  reaper: 0.517,
  lich: 0.561,
};

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
  hitFlash: Sprite;  // 被弾時、本体スプライトと同形を白で加算オーバーレイして「絵」を一瞬光らせる(丸光は廃止)
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
  private flowerObjs = new Map<string, { sprite: Sprite; baseScale: number; footY: number }>(); // ステージ1(森)の装飾花(壁判定なし)
  private enemies = new Map<string, ActorView>();
  // 錬金術の召喚ユニット(味方)。敵と同じ actor プールを使い、シアンtintで描く。
  private summonViews = new Map<string, ActorView>();
  // スキル 救難信号: 飛来する援護アライ(一過性)。同時に生きるのは基本1体程度なので per-id プールで十分軽い。
  // 救援アライ(スキル救難信号): 本体スプライト+近接スイング3枚(分身と同じ焼き込みダガー差し替え)を
  // per-idで持つ。飛来=放物線ジャンプ、着弾=本体と同じ近接モーション(社長指示v0.25.1613)。
  private rescueAllyViews = new Map<string, { body: Sprite; knife: Sprite; slash: Sprite; trail: Sprite }>();
  // 救急鞄(first-aid-kit): 空鞄投擲(一過性・1ラン1回=同時に生きるのは常に0-1体)。per-id プール。
  private thrownBagViews = new Map<string, Sprite>();
  private breakableProps = new Map<string, PropView>();
  private playerView: ActorView | null = null;
  // 分身(サブウェポン): プレイヤーと同じ立ち絵を白黒キャッシュで描く足元アンカーのスプライト。
  private shadowCloneSprite = new Sprite();
  private shadowCloneAdded = false;
  // 分身の斬撃モーション(本体と同じナイフ振り2枚)。actorLayer に置き zIndex で本体と前後ソート。
  private cloneKnife = new Sprite();
  private cloneKnifeSlash = new Sprite();
  private cloneKnifeTrail = new Sprite();                  // 3枚目(弧の残光)。本体と同じ3コマ差し替え
  private cloneMeleeWpn = new Sprite();                    // 分身にも装備近接の実絵を重ねる
  private cloneKnifeSetup = false;
  // 白黒テクスチャのキャッシュ(テクスチャ名→事前ベイクした RenderTexture)。毎フレームのフィルタ処理を避ける。
  private grayTexCache = new Map<string, Texture>();
  // 被弾フラッシュ用「真っ白シルエット」テクスチャのキャッシュ(元Texture→白ベイク)。加算で重ねると、
  // 暗い敵でも全面が白く光る(加算は元の色しか足せないので、白ベイクしないと暗部が光らない)。実行時はフィルタ不要=安い。
  private whiteTexCache = new Map<Texture, Texture>();
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
  // 発火ナイフ投擲物: 専用イラスト(飛翔/刺さった状態共通)+ 刺さった時の火種明滅(Graphics)。
  private fireKnifeViews = new Map<string, { container: Container; gfx: Graphics; sprite: Sprite }>();
  // 自動タレット: 砲台ボディ(Graphics)。前方集中/全方位でモード別の見た目。
  private turretViews = new Map<string, { container: Container; gfx: Graphics; sprite: Sprite }>();
  // 投擲スケボー: 進行方向へ回転しながら地面を滑る板スプライト(色キー透過済み)。
  private skateboardViews = new Map<string, { container: Container; sprite: Sprite; gfx: Graphics }>();
  // ドローンブーメラン投擲物: 3枚羽シュリケンのスプライトが常時回転しながら飛ぶ。
  // 停止中(boomPhase==='stop')の射程リングは従来どおり drawProjectile(Graphics)側が描く。
  private droneBoomerangViews = new Map<string, { container: Container; sprite: Sprite }>();
  // 火炎瓶(molotov)の地面の火: 松明と同じ炎Graphics(drawFlameShape流用)+ 小さめの暖色ライト。
  // 状態(寿命/DoT)は gameStore.groundFires が持つ。ここは描画のみ(CLAUDE.md「Pixiは描画専門」)。
  private groundFireViews = new Map<string, { container: Container; flame: Graphics; light: Sprite }>();
  private bossFireGfx = new Graphics();                    // ジブリルのランタン火(紫の単発火)を一括描画(予告=赤円/有効=紫火)
  private sensorMineGfx = new Graphics();                  // センサー地雷(sensor-mine)を一括描画(待機=ディスク+ランプ/感知=赤点滅テレグラフ)
  private supportSniperSprite: Sprite | null = null;       // 援護射撃(support-sniper)のNPC(同時1人・護衛軍人スプライト流用のプールSprite)
  private flareGunViews = new Map<string, { container: Container; flame: Graphics; light: Sprite }>(); // フレアガン(flare-gun)の火(makeGroundFireView流用・同時1-2個)
  private effects = new Map<string, EffectView>();
  // トール(一閃/突き/払い)専用: プレイヤーの斬撃と同じピクセル演出(streak+burst)を、実際の当たり判定
  // ライン(fx,fy→tx,ty・半幅)に合わせて出す。enemy.id keyed(裏ボスは1体のみだが将来の複数化にも耐える)。
  private thorSlashFx = new Map<string, Container>();
  // PACING_PUZZLE.md §5.21-追補8: ミゲル(ゲート2ボス)専用のharai演出コンテナ。thorSlashFxと同じ
  // 仕組み(enemy.id keyed)だが別マップ=別ボス種の同時存在(理論上)でも取り違えない。
  private miguelSlashFx = new Map<string, Container>();
  // PACING_PUZZLE.md §5.14 M13: 宿敵(ネームド)の頭上名前ラベル。同時1体・生成は湧き時1回だけ
  // なのでPixi Text可(CLAUDE.mdの「まれなcallout枠」)。毎フレーム再生成はしない=位置追従のみ。
  private namedFoeLabels = new Map<string, Text>();

  // ① 通常足影: ソフト影テクスチャのスプライトプール(Graphics廃止)。光方向へ回転+伸縮で
  // 「伸びる/向き」を保ちつつ、毎フレームのブラーパス無しで柔らかいエッジにする。
  private shadowContainer = new Container();
  private shadowPool = new Map<string, Sprite>();
  // 商人/イベントNPC/城/拾い物 のソフト影リクエスト(各 sync が可視時に設定、syncShadows が配置)。
  private merchantShadow: { x: number; y: number; w: number; alpha: number } | null = null;
  private npcShadow: { x: number; y: number; w: number; alpha: number } | null = null;
  private castleShadow: { x: number; y: number; w: number; alpha: number } | null = null;
  // 洋館再訪(the ONE): true の間、城(洋館)の画面端マーカーをボス未出現でも表示する。
  private revisitMarker = false;
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
  private hunterVisionGfx = new Graphics(); // ハンターの視界(索敵)範囲=薄い紫サークル(地面・world座標)
  private bossCorpseSprite = new Sprite(); // 裏ボス討伐時のフェードアウト演出(頭基準・world座標。store.bossCorpse を参照)
  private rescueGfx = new Graphics(); // 救助NPCのHPバー/コールアウト(actorLayer 最前=常に見える)
  private rescueSurvivorSprites = new Map<string, Sprite>(); // 救助NPC本体スプライト(2コマ歩き・足元アンカー・y-sort)
  private baseSoldierSprites = new Map<string, Sprite>(); // 拠点駐留兵士の立ち絵(救助NPCと同じ shooter 素材・足元アンカー・y-sort)
  private baseSoldierFace = new Map<string, { px: number; face: number }>(); // 兵士の向き(前フレx差分で決定)
  private escortSprites = new Map<string, Sprite>(); // 護衛軍人NPC(前進・射撃)の立ち絵。shooter 素材を流用。
  private escortBlendSprites = new Map<string, Sprite>(); // クロスフェード対象NPCの「次コマ」重ね描き(滑らか化・視覚のみ)。
  private rescueFace = new Map<string, { vx: number; face: number }>(); // 向きの平滑化(EMA)＋ヒステリシス。パタパタ反転防止
  private enemyJumpHop = new Map<string, number>(); // ジャンプ中の最新ホップ高(px)。盾ブロック時の落下補間の起点に使う
  private enemyBlockFall = new Map<string, { from: number; start: number }>(); // 盾で弾かれて空中から落ちる演出(from→0へ補間)
  private rescueSweatGfx = new Graphics(); // パニック逃走の汗マーク(uiLayer=環境光の影響外・screen座標)
  private pumpkinTelegraph = new Graphics(); // パンプキン/lab-zombie-3 のジャンプ着地予告(赤い影)
  private skadiHazardGfx = new Graphics();   // スカジ氷塊の赤いテレグラフ円(2秒フェードイン)
  private skadiHazardContainer = new Container(); // スカジ氷塊/氷刃のスプライトプール親
  private skadiBlockPool = new Map<string, Sprite>(); // 氷塊スプライト(マーカーid→sprite)
  private skadiBladePool = new Map<string, Sprite>(); // 氷刃スプライト(ブレードid→sprite)
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
  // §5.23 M22 C4: 突進/カウンターの速度線。固定プール(SPEED_LINE_COUNT本・screen座標=uiLayer)。
  // 遅延生成(初回syncSpeedLinesで作る)。getGlowTextureの使い回し=新規テクスチャなし。
  private speedLineSprites: Sprite[] = [];
  private flashGfx = new Graphics();   // full-screen damage flashes (screen)
  private arrowGfx = new Graphics();   // off-screen supply arrows (screen)
  private playerDeathAt = 0;           // 死亡で立ち絵フェード開始した時刻(now基準。health>0でリセット)

  // Atmosphere (screen space). gradeSprite multiplies the world cool; the warm
  // playerLight is added on top so the hero stays bright; vignette darkens edges.
  private gradeSprite = new Sprite(Texture.WHITE);
  // シネマティック残照オーバーレイ(?cine=1 & stage-7 のみ表示・screen合成)。stage-6は洋館(室内)なので
  // 屋外の黄昏空が合わず、逆探知地点(stage-7=未明の屋外)へ移設(社長指示v0.25.1870)。
  private cineWarm = new Sprite(getCineWarmTexture());
  private cineSun = new Sprite(getCineSunTexture());       // ①地平の太陽フレア
  // ②放射状の薄雲(光の線)。出没=煌めき用に複数レイヤー(別seedのstreak群)を位相ちがいで明滅。各層は外側フェード焼き込み済み。
  private cineCloudLayers: Sprite[] = Array.from({ length: CINE_CLOUD_LAYERS }, (_, i) => new Sprite(getCineCloudTexture(i, CINE_CLOUD_STREAKS_PER_LAYER)));
  private cineDust = new TilingSprite({ texture: getCineDustTexture(), width: 1, height: 1 }); // ③大気の塵(ドリフト)
  // M7の遠景に重ねる雲(パースフロー)。光源の上・空帯にマスク。2枚クロスフェードでループ。テクスチャは setStage7Clouds で注入。
  private stage7CloudGroup = new Container();
  // 4枚=2波(各波が隣接2コマをクロスフェード)。2波を位相ずらしで重ねて"薄→濃の急リセット"を消す。
  private stage7Clouds: Sprite[] = [new Sprite(Texture.EMPTY), new Sprite(Texture.EMPTY), new Sprite(Texture.EMPTY), new Sprite(Texture.EMPTY)];
  private stage7CloudFrames: Texture[] = []; // アトラスから切り出した5コマ
  private stage7CloudMask = new Sprite(Texture.WHITE);
  private stage7CloudMaskTex: Texture | null = null; // 縦グラデ(下端フェード)マスク
  // M1の遠景=星空6コマアニメ。2枚クロスフェードで6コマを巡回。farBackdrop(森の空)を覆う=stage-1限定。
  private stage1SkyFrames: Texture[] = []; // シートから切り出した6コマ
  private stage1Sky: Sprite[] = [new Sprite(Texture.EMPTY), new Sprite(Texture.EMPTY)];
  // M1の星空に重ねる城/山/霧の森(緑抜き・横ループ)。テクスチャは[A|左右反転A]のミラー二連=タイル継ぎ目がシームレス。星空の手前・近景森の奥。
  private stage1Castle = new TilingSprite({ texture: Texture.EMPTY, width: 1, height: 1 });
  private stage1IsM1 = getSelectedStageId() === 'stage-1'; // M1判定(レイアウト時に確定)
  private cineEnabled = CINE_MODE && getSelectedStageId() === 'stage-7';
  private playerLight = new Sprite(getGlowTexture());
  private playerGroundPool = new Sprite(getGlowTexture()); // A: 足元の地面に敷く光だまり(加算)
  private playerKatanaBack = new Sprite();                 // 背負い刀(刀/小烏丸 装備中・プレイヤー背面)
  private playerKatanaBackAttached = false;                // playerView.container へ親子付け済みか
  private playerSkateboard = new Sprite();                 // スケボー乗車中に足元へ敷く板(プレイヤー背面=足の下)
  private playerSkateboardAttached = false;                // playerView.container へ親子付け済みか
  private playerKnife = new Sprite();                      // 近接スイング1枚目(ダガー画像 knife-swing-1・装備絵が無い時のフォールバック)
  private playerKnifeSlash = new Sprite();                 // 近接スイング2枚目(弧のみ knife-swing-2)
  private playerKnifeTrail = new Sprite();                 // 近接スイング3枚目(弧の残光 knife-swing-3)
  private playerMeleeWpn = new Sprite();                   // 装備中の近接武器の実絵(f1/f2に重ねる)
  private playerKnifeSetup = false;                        // テクスチャ/アンカー/親子付け済みか
  private playerFirstAidBag = new Sprite();                // 救急鞄スキル発動時に掲げる鞄(first-aid-kit・描画のみ)
  private playerFirstAidBagSetup = false;                  // 鞄スプライトのテクスチャ/親子付け済みか
  private stageLightShaftGfx = new Graphics();
  private vignette = new Sprite(getVignetteTexture());
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
  private deepGradeAmount = 0;       // 0..1 現在のかかり具合(1秒フェード)
  private deepGradeOn = false;       // ヒステリシス: 深層域内か(enter=D / exit=D-200)
  private deepGradeIsRedNight = false; // 紅き夜中は血赤マトリクス / 通常は深層域セピア
  private lastGradeNow = 0;          // フェード用 dt 計測

  private tiltShift: TiltShiftFilter | null = null;
  private bloom: AdvancedBloomFilter | null = null;
  private cineContrast: ColorMatrixFilter | null = null; // cine前景の階調立て(遅延生成)
  private bloomActive = true; // 現在ブルームをフィルタ配列に入れているか(オプション反映用)
  private farBackdropBlur: BlurFilter | null = null;
  // 昼ステージ(正午)モード。s.farBackdrop==='city' の間 true。環境の暗転/グレード/霧/減光を弱める。
  private daylight = false;
  private snowStage = false; // ステージ4(farBackdrop'snow'): 松明を焚き火スプライトに置き換え
  private battlefieldStage = false; // ステージ5(farBackdrop'stage5'): 敵絵=戦場セット・木なし(残骸プロップに置換)
  private stage5Stage = false; // ステージ5(farBackdrop'stage5'): 近景森(戦場の残骸)を下げる
  private isLabStage = false; // 現在の出撃が lab テーマ(ステージ2)か。影向きの分岐に使用。
  private horizonForestUpNow = 0; // 現ステージの遠景森1 上移動px(HORIZON_FOREST_UP_BY_STAGE をstage idで引いてキャッシュ・1回/フレーム)。
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
    this.applyCineGrade(); // cine時は上の寒色grade/減光をシネマ値へ上書き(daylock後に効かせる)
    // 足元の光だまり: 昼=暖色 / 夜=寒色(月明り)。暖色のままだと夜に黄色く見える(社長指摘)。
    this.playerGroundPool.tint = on ? LIGHT_POOL_TINT : MOON_POOL_TINT;
    for (const f of this.fogLayers) f.sp.alpha = (f.baseAlpha ?? f.sp.alpha) * (on ? DAY_FOG_MULT : 1);
    // 斜め光(god ray)は resize 時しか再生成しないので、昼/夜切替時にここで描き直す
    // (色・濃さ・拡散具合が preset で変わるため)。
    this.updateStageLightShafts(this.screenW, this.screenH);
  }

  // シネマティック調(?cine=1 & stage-7)。寒色gradeを teal 寄りへ+減光強め+残照overlay表示。
  // 非cineでは何もしない(=従来値のまま)。applyDaylight末尾から呼ぶ(daylightの上書きに勝つ)。
  private applyCineGrade() {
    const on = this.cineEnabled;
    if (on) {
      this.gradeSprite.tint = CINE_GRADE_TINT;
      this.gradeSprite.alpha = CINE_GRADE_ALPHA;
      this.vignette.alpha = CINE_VIGNETTE_ALPHA;
    }
    this.cineWarm.visible = on && CINE_WARM_ON;   // オレンジ残照グラデ=?cinewarm=0でオフ(社長v0.25.1926)
    this.cineSun.visible = on;
    for (const sp of this.cineCloudLayers) sp.visible = on;
    this.cineDust.visible = on;
  }

  // 現在の設定に応じて gameplay world(filteredWorld)のフィルタ配列を作り直す(bloom はON時のみ含める)。
  private rebuildWorldFilters() {
    const filters: Filter[] = [];
    if (this.bloom && this.bloomActive) filters.push(this.bloom);
    // cine(stage-7)は遠景をハッキリさせる指示(社長v0.25.1870)。tilt-shiftは上(遠景)を大きくぼかす主因なので
    // cine時は外す(参照シネマグラフも全面くっきり=光学ボケではなく空気遠近で奥行きを出す方針)。
    if (this.tiltShift && !this.cineEnabled) filters.push(this.tiltShift);
    // cine(?cine=1 & stage-7): 前景(キャラ/木/オブジェクト)のコントラストを立てる(社長指示v0.25.1865)。
    // filteredWorld=world(actor/背景/効果)だけ=地面(groundBase)は対象外で柔らかいまま。既存フィルタと
    // 同じ render target への追加1パス=安い。bloom の後段に置き、明部判定(=bloom量)は不変に保つ。
    if (this.cineEnabled) {
      if (!this.cineContrast) {
        const f = new ColorMatrixFilter();
        f.contrast(CINE_ACTOR_CONTRAST, false);
        f.saturate(CINE_ACTOR_SATURATE, true);
        this.cineContrast = f;
      }
      filters.push(this.cineContrast);
    }
    this.L.filteredWorld.filters = filters;
  }
  private nearGroundBlurFilters: BlurFilter[] = [];
  private frontForestBlur: BlurFilter | null = null;
  private horizonForestBlur: BlurFilter | null = null;
  private nearHorizonBlur: BlurFilter | null = null;
  private labCeiling: TilingSprite | null = null; // 最前面の天井帯(上寄せ・半透明・横ループ)。lab=固定/チュートリアル=カメラ連動
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
  private contextZoom = 1;     // 文脈ズーム(敵数/大型で少し引く・視覚専用)。目標へイージング追従。
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
  private bossBehindAlpha = 1; // 裏ボスの「裏回り透け」alpha を滑らかに追従させる実値(スナップ回避)
  private enemyCount = 0;
  private horizonForestFootWorldY = -Infinity;

  constructor(layers: SceneLayers) {
    this.L = layers;
    // 背景バンドの初期テクスチャ(森1/遠景)もmipmap化(縮小モアレ対策・社長指示v0.25.1869)。
    // 森2(nearHorizon)は初期EMPTYで、ステージ別の実テクスチャは setNearHorizonTexture 側で適用。
    this.applyBgMipmap(this.L.horizonForest.texture);
    this.applyBgMipmap(this.L.farBackdrop.texture);

    // Bloom + tilt-shift depth-of-field over the gameplay world wrapper.
    // The fixed ground and horizon seam stay outside these filters so blur never
    // smears ground pixels upward over the far panorama. The wrapper itself is
    // screen-space; the camera-offset `world` remains its child.
    // ブルーム/ティルトシフトのインスタンスは「常に」生成しておき、フィルタ配列への
    // 出し入れで切り替える(オプションのON/OFFをリロード無しで反映できる)。
    if (BLOOM_ENABLED) {
      // cine時のみ bloom を少し強め(残照・光源のにじみを増やす。閾値↓/scale↑)。負荷差は僅少
      // (ブルームはベンチ上ほぼ無料=CLAUDE.md render budget)。他は従来値。
      this.bloom = new AdvancedBloomFilter({
        threshold: this.cineEnabled ? BLOOM_THRESHOLD * 0.82 : BLOOM_THRESHOLD,
        bloomScale: this.cineEnabled ? BLOOM_SCALE * 1.25 : BLOOM_SCALE,
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
    // 遠景と川の筋レイヤーを同じグループに入れ、グループにブラーを掛ける(=筋も同じ被写界深度に
    // 入る。社長指摘v0.25.1808「せせらぎが被写界深度の外にいる」)。フィルタパスは従来の遠景1枚分と
    // 同じ1回=負荷増なし。
    // cine(stage-7)は遠景をハッキリさせる(社長指示v0.25.1870)=遠景ボケを外す。
    {
      const farParent = this.L.farBackdrop.parent!;
      farParent.addChildAt(this.farGroup, farParent.getChildIndex(this.L.farBackdrop));
      this.farGroup.addChild(this.L.farBackdrop);
      // M1の星空アニメ=farBackdrop(森の空)の手前・同グループ(同じ被写界深度)に置いて覆う。stage-1のみ可視。
      for (const sp of this.stage1Sky) { sp.eventMode = 'none'; sp.visible = false; this.farGroup.addChild(sp); }
      // 城/山/霧の森=星空の手前(星空を透過部から見せる)・近景森の奥。同じくfarGroup。
      this.stage1Castle.eventMode = 'none'; this.stage1Castle.visible = false; this.farGroup.addChild(this.stage1Castle);
      this.farGroup.filters = this.cineEnabled ? [] : [this.farBackdropBlur];
    }

    if (FRONT_FOREST_BLUR > 0) {
      this.frontForestBlur = new BlurFilter({
        strength: FRONT_FOREST_BLUR,
        quality: 3,
      });
      this.L.frontForest.filters = [this.frontForestBlur];
    }

    // cine(stage-7)は遠景森1/森2のボケも外してハッキリに(社長指示v0.25.1870)。mipmap(v1869)で
    // 縮小モアレは別途抑えているので、ボケ無しでも斜め格子は出ない。
    if (HORIZON_FOREST_BLUR > 0) {
      this.horizonForestBlur = new BlurFilter({
        strength: HORIZON_FOREST_BLUR,
        quality: 2,
      });
      this.L.horizonForest.filters = this.cineEnabled ? [] : [this.horizonForestBlur];
    }

    if (NEAR_HORIZON_BLUR > 0) {
      this.nearHorizonBlur = new BlurFilter({
        strength: NEAR_HORIZON_BLUR,
        quality: 2,
      });
      this.L.nearHorizon.filters = this.cineEnabled ? [] : [this.nearHorizonBlur];
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
      this.hunterVisionGfx, // ハンター視界範囲(薄紫・地面・world座標)
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
    this.L.effectLayer.addChild(this.skadiHazardGfx);      // 氷塊の赤テレグラフ円(地面寄り)
    this.L.effectLayer.addChild(this.skadiHazardContainer); // 氷塊/氷刃スプライト
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

    // Screen-space overlays: cool multiply grade darkens/cools the whole scene
    // (multiply preserves detail/outlines), then the vignette, then damage
    // flash + off-screen arrows on top of everything.
    // cineオーバーレイ群。順序: grade(乗算)→ 雲/太陽/残照/塵(screen=teal-orange)→ vignette。
    for (const sp of [this.cineWarm, this.cineSun, ...this.cineCloudLayers, this.cineDust]) {
      sp.blendMode = 'screen'; sp.visible = false; sp.eventMode = 'none';
    }
    this.cineWarm.alpha = CINE_WARM_ALPHA;
    for (const sp of this.cineCloudLayers) sp.alpha = CINE_CLOUD_ALPHA_BASE;
    this.cineSun.alpha = CINE_SUN_ALPHA_MAX; // 光源は常時最大で固定(毎フレームも同値。煌めきはcineClouds側・社長v0.25.1885)
    this.cineDust.alpha = 0.5;
    // M7の雲(パースフロー)。森1/2・地面より下(=worldGroupの後ろ・銀河の手前)へ(社長指示v0.25.1911)。2枚とも消失点anchor・normal合成、空帯マスクでクリップ。
    for (const sp of this.stage7Clouds) {
      sp.anchor.set(0.5, 0); // 上端基準(コマの雲は上寄り)。基準Yに上端を合わせる。
      sp.blendMode = 'normal'; sp.eventMode = 'none';
      this.stage7CloudGroup.addChild(sp);
    }
    // マスクは縦グラデ(上=不透明→下端で透明)=雲が空帯の下でハードカットせず溶ける。一度だけ生成。
    if (!this.stage7CloudMaskTex) {
      const mc = document.createElement('canvas'); mc.width = 4; mc.height = 256;
      const mctx = mc.getContext('2d');
      if (mctx) {
        const grad = mctx.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.66, 'rgba(255,255,255,1)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        mctx.fillStyle = grad; mctx.fillRect(0, 0, 4, 256);
        this.stage7CloudMaskTex = Texture.from(mc);
        this.stage7CloudMask.texture = this.stage7CloudMaskTex;
      }
    }
    this.stage7CloudGroup.mask = this.stage7CloudMask;
    this.stage7CloudGroup.visible = false;
    this.L.uiLayer.addChild(
      this.stageLightShaftGfx,
      this.gradeSprite, this.cineSun, // 光の線(cineCloudLayers)は森2の裏へ移すのでここには入れない(社長指示v0.25.1912)
      this.cineWarm, this.cineDust, this.vignette,
      this.flashGfx, this.arrowGfx,
    );
    // 光の線(cineClouds)と雲は worldGroup(森1/2・地面・gameplay)の後ろ・farBackdrop(銀河)の手前へ。画面固定の空。
    // 順(奥→手前): 光の線 → 雲 → worldGroup(=森2は雲/光の線の手前)(社長指示v0.25.1911/1912)。
    const stageC = this.L.worldGroup.parent;
    if (stageC) {
      const idx = () => stageC.getChildIndex(this.L.worldGroup);
      for (const sp of this.cineCloudLayers) stageC.addChildAt(sp, idx()); // 光の線=森2の裏
      stageC.addChildAt(this.stage7CloudMask, idx());
      stageC.addChildAt(this.stage7CloudGroup, idx());
    }
    this.applyCineGrade(); // 初期適用(applyDaylight前でもcine値を効かせる)

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
    // 横オーバースキャン: 引いた時に地平森の左右が切れて黒帯にならないよう画面より広く敷いて中央寄せ(worldGroup内=スケール対象)。
    const horizonMarginX = (w * ZOOM_OVERSCAN - w) / 2;
    this.L.horizonForest.width = w * ZOOM_OVERSCAN;
    this.L.horizonForest.height = horizonH;
    // 横伸び防止: frontForest と同じく y 基準の均一スケール(x も同値)。横は自然比率のままタイルで繰り返して幅を埋める
    // (parallax で横スクロールする=元々シームレスにタイルできる素材)。非均一(w/texW)だと横に引き伸ばされていた。
    this.L.horizonForest.tileScale.set(horizonH / this.L.horizonForest.texture.height);
    this.L.horizonForest.position.set(-horizonMarginX, this.horizonForestY(farH, horizonH));
    this.layoutNearHorizon(); // 遠景手前森の寸法/位置も追従
    this.updateHorizonForestFadeMask(w, horizonH);
    this.updateWorldFadeMask(w, h);
    this.updatePerspectiveGround(0, 0, 0, 0);
    const frontH = this.frontForestHeight();
    const frontScale = frontH / this.L.frontForest.texture.height;
    this.L.frontForest.position.set(0, h - frontH + this.frontForestYOffset(frontH));
    this.L.frontForest.width = w;
    this.L.frontForest.height = frontH;
    this.L.frontForest.tileScale.set(frontScale);
    this.L.frontForest.alpha = this.frontForestAlpha();
    this.updateFrontForestFadeMask(w, frontH);
    this.frontForestFadeMask.position.copyFrom(this.L.frontForest.position);
    // Full-screen atmosphere overlays. サブピクセル/解像度丸めで下端などに1pxの未カバー行が
    // 出る(=環境光が届かず色味が違うライン)のを防ぐため、2pxだけ大きく(-1,-1起点で)にじませる。
    this.gradeSprite.position.set(-1, -1);
    this.gradeSprite.width = w + 2;
    this.gradeSprite.height = h + 2;
    this.vignette.position.set(-1, -1);
    this.vignette.width = w + 2;
    this.vignette.height = h + 2;
    this.cineWarm.position.set(-1, -1);
    this.cineWarm.width = w + 2;
    this.cineWarm.height = h + 2;
    // 地平の太陽=画面上部(森の地平帯あたり)・右寄り(社長v0.25.1871)。フレアはそこを中心に大きめ。
    const sunY = h * 0.18;
    const sunX = w * CINE_SUN_X_FRAC;
    const sunSize = Math.max(w, h) * 0.58; // フレア少し絞る(社長指示v0.25.1864・0.7→0.58)
    this.cineSun.anchor.set(0.5);
    this.cineSun.position.set(sunX, sunY);
    this.cineSun.width = this.cineSun.height = sunSize;
    // 放射雲は太陽(下端中央)から上へ扇状に=上部帯を覆う。テクスチャ下端を地平(sunY)に合わせる。全レイヤー同位置・同寸。
    for (const sp of this.cineCloudLayers) {
      sp.anchor.set(0.5, 1);
      sp.position.set(sunX, sunY + h * 0.06);
      sp.width = w * 1.1;
      sp.height = h * 0.5;
    }
    // 塵は全画面タイル。
    this.cineDust.position.set(0, 0);
    this.cineDust.width = w;
    this.cineDust.height = h;
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
    // ★シェーダの uStart/uEnd/gradientBlur は「フィルタ入力テクスチャpx=CSS px」解釈(v0.25.1773判明)。
    // 論理px(w/h)のまま渡すとビューポートスケール≠1の端末(SE2等の縦短端末=0.77)でピント面が下へずれる。
    // 初期値もCSS px換算で渡す(毎フレームの追従ブロックが同じ換算で上書きし続ける)。
    if (this.tiltShift) {
      this.L.filteredWorld.filterArea = new Rectangle(0, 0, w, h);
      const vpScale = this.L.stage.scale.x || 1;
      const bandY = h * TILT_SHIFT_BAND * vpScale;
      this.tiltShift.start = { x: 0, y: bandY };
      this.tiltShift.end = { x: w * vpScale, y: bandY };
      this.tiltShift.gradientBlur = TILT_SHIFT_GRADIENT * vpScale;
      this.tiltShift.blur = TILT_SHIFT_BLUR * vpScale;
    }
  }

  // filterArea を「画面矩形を worldGroup の逆変換でローカルへ写した矩形」に更新する。
  // Pixi v8 は filterArea をローカル座標として worldTransform で変換するため、ズーム
  // (worldGroup.scale/position)中も枠が画面ぴったりを保つにはこの追従が必要(毎フレーム・スカラー演算のみ)。
  private syncWorldFilterArea() {
    if (!this.tiltShift && !this.bloom) return;
    // 実際に worldGroup へ適用済みの値を読む(zoom≈1で未適用の時は scale=1/pos=0 が入っている)。
    const z = this.L.worldGroup.scale.x || 1;
    const tx = this.L.worldGroup.position.x;
    const ty = this.L.worldGroup.position.y;
    const fa = this.L.filteredWorld.filterArea as Rectangle | undefined;
    const rect = fa ?? new Rectangle();
    rect.x = -tx / z;
    rect.y = -ty / z;
    rect.width = this.screenW / z;
    rect.height = this.screenH / z;
    if (!fa) this.L.filteredWorld.filterArea = rect;
  }

  private shaftPeriod = 0; // 環境光シャフトのタイル反復幅(横パララックスの折り返し単位)

  // M7の遠景に重ねる雲=5コマの下降コンベア+コマ毎三角クロスフェード(社長指示v0.25.1922/1929/1932)。各コマは三角包絡
  // (fpos=jでピーク・j±1で0)でフェードイン→ピーク→フェードアウト。頭(フレーム1)は fpos -1→0 で湧きフェードイン、
  // 尻(フレーム5)は fpos 4→5 でフェードアウト。次波は旧波が spawnFrame(既定4)に来たらフレーム1を重ねて開始(?scloudspawn=)。各波2枚。
  private updateStage7Clouds(now: number) {
    const on = this.currentFarKey === 'stage7' && this.stage7CloudFrames.length === STAGE7_CLOUD_FRAMES;
    this.stage7CloudGroup.visible = on;
    if (!on) return;
    const w = this.screenW, h = this.screenH;
    // 空帯マスク(上端〜BAND_FRAC)。プレイヤー/森より上に雲を留める。下降した波の下端はここで溶ける。
    this.stage7CloudMask.position.set(0, 0);
    this.stage7CloudMask.width = w;
    this.stage7CloudMask.height = h * STAGE7_CLOUD_BAND_FRAC;
    const fw = this.stage7CloudFrames[0].width || 1;
    const fhh = this.stage7CloudFrames[0].height || 1;
    const baseScale = (w * STAGE7_CLOUD_SIZE) / fw;
    const baseX = w * 0.5, baseY = 0;                        // 横中央・上端(元の湧き位置)。横は固定。
    const FR = STAGE7_CLOUD_FRAMES;                          // 5
    const P = STAGE7_CLOUD_PERIOD_MS;                        // 1波の長さ(頭/尻フェード含む)
    // 次波が湧く「旧波のフレーム」(1..5)。既定3=旧波がフレーム3に来たら次波のフレーム1を重ねて開始(社長v0.25.1932/1935)。
    // spawn時の旧波fpos=spawnFrame-1、湧き間隔 S=P·spawnFrame/(FR+1)。3未満だと同時3波でスプライト不足のため下限3。
    const spawnFrame = Math.max(3, Math.min(FR, Math.round(tsNum('scloudspawn', 3))));
    const S = P * spawnFrame / (FR + 1);
    const drop = h * STAGE7_CLOUD_DROP;                      // 1波の下降量(px)
    for (const sp of this.stage7Clouds) sp.visible = false;  // 生きてる波だけ下で可視化
    const kCur = Math.floor(now / S);
    for (let k = kCur - 1; k <= kCur; k++) {                 // 生存しうるのはこの2波だけ
      if (k < 0) continue;
      const tau = now - k * S;
      if (tau < 0 || tau >= P) continue;                     // この波は生存範囲外
      const phase = tau / P;                                 // 0..1
      const fpos = phase * (FR + 1) - 1;                     // -1..FR。コマjは fpos=j でピーク(全alpha)、j±1で0=三角
      const y = baseY + drop * phase;                        // 下降(元の上位置→少し下へ)
      const pair = ((k % 2) + 2) % 2;                        // 隣接波は別スプライト対=継ぎ目で共存
      const sprites = [this.stage7Clouds[pair * 2], this.stage7Clouds[pair * 2 + 1]];
      let si = 0;
      const j0 = Math.floor(fpos);
      for (let j = j0; j <= j0 + 1; j++) {                   // fposを挟む隣接2コマ
        if (j < 0 || j > FR - 1 || si >= sprites.length) continue;
        const a = (1 - Math.abs(fpos - j)) * STAGE7_CLOUD_ALPHA; // 三角包絡=コマ毎フェードイン/アウト
        if (a <= 0) continue;
        const sp = sprites[si++];
        sp.visible = true;
        if (sp.texture !== this.stage7CloudFrames[j]) sp.texture = this.stage7CloudFrames[j];
        // 縦縮み: このコマの寿命 t=0(湧き fpos=j-1)→1(消滅 fpos=j+1)で縦だけ SHRINK px 縮む(上下均等・横は不変)。
        const t = Math.max(0, Math.min(1, (fpos - j + 1) / 2));
        const shrink = STAGE7_CLOUD_SHRINK * t;
        sp.scale.x = baseScale;
        sp.scale.y = baseScale - shrink / fhh;               // 表示高さを shrink px 減らす
        sp.position.set(baseX, y + shrink * 0.5);            // 上端anchor(0,)なので中心維持に+shrink/2=上下均等
        sp.alpha = a;
      }
    }
  }

  // M1の遠景=星空6コマの巡回クロスフェード(社長指示v0.25.1931)。stage-1のみ。farBackdrop(森の空)を覆う=現コマは常に全面、
  // 次コマを上に重ねてフェードイン→入れ替え(=背景が透けない綺麗なクロスディゾルブ)。位置/サイズはfarBackdrop rectに合わせる。
  private updateStage1Sky(now: number, cameraX: number) {
    const on = this.stage1IsM1 && this.stage1SkyFrames.length === STAGE1_SKY_FRAMES;
    for (const sp of this.stage1Sky) sp.visible = on;
    const w = this.screenW;
    const farH = this.farBackdropHeight();
    // 城/山/霧の森を星空の手前に横ループ(緑抜き済=透過部から星空が見える)。テクスチャ=[A|反転A]のミラー二連でシームレス。
    // 窓幅=画面幅(=Aひとつ分を表示)・tileScaleで拡縮・tilePosition.xをゆっくり流す。底を地平(farH)へ・横中央。
    const castleOn = on && this.stage1Castle.texture.width > 1;
    this.stage1Castle.visible = castleOn;
    if (castleOn) {
      const texW = this.stage1Castle.texture.width || 2;         // ミラー二連の全幅(=Aの2倍)
      const texH = this.stage1Castle.texture.height || 1;
      const s = (w * STAGE1_CASTLE_SCALE) / (texW / 2);          // Aひとつ分が画面幅×SCALEになる倍率
      this.stage1Castle.tileScale.set(s);
      this.stage1Castle.anchor.set(0.5, 1);                      // 底基準
      this.stage1Castle.width = w;                               // 窓=画面幅(Aひとつ分)
      this.stage1Castle.height = texH * s;                       // 縦は1タイル分だけ(縦リピート無し)
      this.stage1Castle.position.set(w * 0.5, farH + STAGE1_CASTLE_Y); // s1casty=px
      // 横パララックス: プレイヤー(camera.x)連動で流す。一番遠い風景=一番遅い(森1より小さい係数)。ミラー二連でシームレス。
      const period = texW * s;                                  // [A|反転A]一巡の表示幅=シームレス周期
      this.stage1Castle.tilePosition.x = -(((cameraX * STAGE1_CASTLE_PARALLAX_X) % period) + period) % period;
      this.stage1Castle.tilePosition.y = 0;
      this.stage1Castle.alpha = STAGE1_CASTLE_ALPHA;
    }
    if (!on) return;
    const P = STAGE1_SKY_PERIOD_MS;
    const g = ((now / P) % 1 + 1) % 1;
    const fp = g * STAGE1_SKY_FRAMES;
    const fN = Math.floor(fp) % STAGE1_SKY_FRAMES;         // 現コマ(常に全面)
    const nxt = (fN + 1) % STAGE1_SKY_FRAMES;              // 次コマ(上にフェードイン)
    const frac = fp - Math.floor(fp);
    const sp0 = this.stage1Sky[0], sp1 = this.stage1Sky[1];
    if (sp0.texture !== this.stage1SkyFrames[fN]) sp0.texture = this.stage1SkyFrames[fN];
    if (sp1.texture !== this.stage1SkyFrames[nxt]) sp1.texture = this.stage1SkyFrames[nxt];
    for (const sp of this.stage1Sky) {
      sp.anchor.set(0, 0);
      sp.position.set(0, 0);
      sp.width = w;                                        // farBackdrop rect(screenW × farH)に合わせて敷く
      sp.height = farH;
    }
    sp0.alpha = STAGE1_SKY_ALPHA;                          // 現コマ=常に全面(森の空を覆う)
    sp1.alpha = STAGE1_SKY_ALPHA * frac;                   // 次コマ=上に重ねてフェードイン
  }

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
    // チュートリアル(洞窟)だけ縦を大きく使う(TUTORIAL_FAR_HEIGHT_RATIO参照)。
    if (this.currentFarKey === 'tutorial') return this.screenH * TUTORIAL_FAR_HEIGHT_RATIO;
    return Math.min(this.screenH * FAR_BACKDROP_HEIGHT_CAP, Math.max(FAR_BACKDROP_MIN_HEIGHT, this.screenH * FAR_BACKDROP_HEIGHT_RATIO));
  }

  // 遠景森1(horizonForest)の縦位置。ステージ5は縮小により固定オフセット(-100px)が相対的に強く効いて
  // 帯が浮いたため、底を遠景の境界線(farH)に直接合わせる(社長指示v0.25.1740「遠景の境界線に合わせて」)。
  // 他ステージは従来式(重なり比+固定オフセット+lab追加下げ)のまま。
  private horizonForestY(farH: number, horizonH: number): number {
    // 全ステージ共通の「上移動」(?mXup=)。上=Y減算。各分岐で最後に引く(社長指示v0.25.1901)。
    const up = this.horizonForestUpNow;
    // ステージ5: 底=境界線(farH)+20px下(社長指示v0.25.1742の実寸指定)。
    if (this.stage5Stage) return farH + STAGE5_HORIZON_FOREST_DOWN_PX - horizonH - up;
    // チュートリアル: 上端合わせ=水面下端(farH×FRAC)-HEAD_PX(頭が川に少し被る)。高さ140px固定。
    if (this.currentFarKey === 'tutorial') return farH * TUTORIAL_HORIZON_WATER_BOTTOM_FRAC - TUTORIAL_HORIZON_HEAD_PX - up;
    return farH - horizonH * HORIZON_FOREST_OVERLAP_RATIO + HORIZON_FOREST_Y_OFFSET_PX + (this.isLabStage ? LAB_HORIZON_FOREST_EXTRA_DOWN : 0)
      - (this.currentFarKey === 'snow' ? NORTH_FAR_FOREST_UP_PX : 0) // 北部だけ別途 northup も加算(社長指示v0.25.1886)
      - up; // 全ステージ共通の上移動(m1up=40/m2up=100/他=0。?mXup=)
  }
  private horizonForestHeight() {
    const base = Math.min(
      HORIZON_FOREST_MAX_HEIGHT,
      Math.max(HORIZON_FOREST_MIN_HEIGHT, this.screenH * HORIZON_FOREST_HEIGHT_RATIO)
    );
    // ステージ5は実寸150px固定(社長指示v0.25.1742。比率×クランプ×倍率だと端末次第で伸びないため)。
    // 地平の薄消し線(horizonActorHideScreenY)は帯の実位置から導出しているので自動で追従する。
    if (this.currentFarKey === 'tutorial') {
      // 追従式(上端=水面下端−HEAD_PX から境界線まで)−TRIM。上端合わせなので下端がTRIMぶん上がる。
      const farH = this.farBackdropHeight();
      return farH * (1 - TUTORIAL_HORIZON_WATER_BOTTOM_FRAC) + TUTORIAL_HORIZON_HEAD_PX - TUTORIAL_HORIZON_HEIGHT_TRIM_PX;
    }
    // 北部(snow)は遠景森が雪原に溶けて小さく見えるため、さらに拡大(社長指示v0.25.1886)。高さは-100px戻す(v0.25.1888)。
    const northExtra = this.currentFarKey === 'snow' ? NORTH_FAR_FOREST_EXTRA_SCALE : 1;
    const northTrim = this.currentFarKey === 'snow' ? NORTH_FAR_FOREST_HEIGHT_TRIM_PX : 0;
    return this.stage5Stage ? STAGE5_HORIZON_FOREST_HEIGHT_PX : base * FAR_FOREST_SIZE_SCALE * northExtra - northTrim;
  }

  private frontForestHeight() {
    const base = Math.min(
      FRONT_FOREST_MAX_HEIGHT,
      Math.max(FRONT_FOREST_MIN_HEIGHT, this.screenH * FRONT_FOREST_HEIGHT_RATIO)
    );
    return this.snowStage ? base * (2 / 3) : base;
  }

  // ステージ別の近景森Y下げ量。frontH(=frontForestHeight())依存の値はここで受け取る。
  private frontForestYOffset(frontH: number) {
    if (this.snowStage) return FRONT_SNOW_Y_OFFSET;
    if (this.stage5Stage) return frontH * FRONT_STAGE5_Y_OFFSET_RATIO;
    if (this.currentFarKey === 'tutorial') return TUTORIAL_FRONT_Y_OFFSET_PX; // 手前岩を100px下へ(下寄せ)
    return 0;
  }

  private horizonActorAlpha(footWorldY: number) {
    return Math.max(0, Math.min(1, (footWorldY - this.horizonForestFootWorldY) / HORIZON_ACTOR_FADE_PX));
  }

  // 手前(画面の最下端=カメラ近接)で消える near-plane フェード(地平線フェードの対)。非ボス敵用。
  // 画面下端から ENEMY_FOREGROUND_FADE_PX の帯の中だけで 1→0。近く(中央付近)では消えない。
  private foregroundActorAlpha(footWorldY: number) {
    const screenY = footWorldY - this.cameraY;
    const start = this.screenH - ENEMY_FOREGROUND_FADE_PX;
    if (screenY <= start) return 1;
    return Math.max(0, 1 - (screenY - start) / ENEMY_FOREGROUND_FADE_PX);
  }

  // 障害物(木/壁/建物/プロップ)の alpha をフレーム更新。プレイヤーを「覆う」(手前=footY大で、見た目矩形が
  // プレイヤー足元矩形と重なる)ものだけ OBSTACLE_SEE_THROUGH_ALPHA へ滑らかに透かす。それ以外は通常(地平フェード)へ。
  // 既存スプライトの alpha を lerp するだけ=新規描画/フィルタなし(負荷 1/10)。
  private applyObstacleAlpha(sprite: Sprite, footWorldY: number) {
    // 手前(画面下端)でも消える: 地平線フェード × 手前フェード(敵と同じ near-plane フェード)。
    const base = this.horizonActorAlpha(footWorldY) * this.foregroundActorAlpha(footWorldY);
    const mult = (sprite.visible && sprite.texture && sprite.texture.width > 1)
      ? this.seeThroughMult(sprite.x, footWorldY, Math.abs(sprite.scale.x) * sprite.texture.width, Math.abs(sprite.scale.y) * sprite.texture.height)
      : 1;
    sprite.alpha += (base * mult - sprite.alpha) * this.seeThroughLerp;
  }

  // 「裏に回ったら透ける」倍率。プレイヤーを覆う(手前=footWorldYが大きく、見た目矩形が足元矩形と重なる)
  // 障害物は OBSTACLE_SEE_THROUGH_ALPHA、それ以外は 1。城/将来のダンジョン系オブジェも共有(社長指示)。
  // centerX/footWorldY=見た目の中心X・足元Y(world)、vw/vh=見た目の幅・高さ。
  private seeThroughMult(centerX: number, footWorldY: number, vw: number, vh: number): number {
    if (OBSTACLE_SEE_THROUGH_ALPHA >= 1 || footWorldY <= this.seeThroughPlayer.footY) return 1;
    const p = this.seeThroughPlayer;
    // 障害物の見た目矩形(foot-anchor 0.5,1) vs プレイヤー足元矩形 の AABB 重なり。
    if (centerX + vw / 2 > p.cx - p.halfW && centerX - vw / 2 < p.cx + p.halfW
        && footWorldY > p.top && footWorldY - vh < p.footY) {
      return OBSTACLE_SEE_THROUGH_ALPHA;
    }
    return 1;
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

    // 北部(snow)は「赤線(氷壁足元)より少し下=SNOW_OPAQUE_UNTIL_FRAC」まで不透明のまま、そこから下端へフェード
    // (下ほど透明)。氷壁とその足元は薄めない。他ステージは従来どおり下端 HORIZON_FOREST_BOTTOM_FADE_PX をフェード。
    // どちらも fadeEnd=下端で、fadeStart より上は不透明。
    const isSnow = this.currentFarKey === 'snow';
    const fadeEnd = canvas.height;
    // 非snow: 実効フェード幅を「高さ×MAX_FADE_FRAC」で頭打ち=短い森1(tutorial/stage5等)が全体半透明になる回帰を防ぐ
    // (森1は不透明+下端だけ微ソフト)。半透明の"溶かし"は指名=snowのみ(社長指示v0.25.1898)。
    const bottomFadePx = Math.min(HORIZON_FOREST_BOTTOM_FADE_PX, canvas.height * HORIZON_FOREST_MAX_FADE_FRAC);
    const fadeStart = isSnow
      ? Math.max(0, Math.min(canvas.height, Math.round(canvas.height * HORIZON_FOREST_SNOW_OPAQUE_UNTIL_FRAC)))
      : Math.max(0, canvas.height - bottomFadePx);
    const grad = ctx.createLinearGradient(0, fadeStart, 0, fadeEnd);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.fillRect(0, 0, canvas.width, fadeStart);                 // ここより上=不透明(氷壁・足元)
    ctx.fillStyle = grad;
    ctx.fillRect(0, fadeStart, canvas.width, fadeEnd - fadeStart); // fadeStart→下端で 1→0(下ほど透明)

    const texture = Texture.from(canvas);
    this.horizonForestFadeMask.texture = texture;
    this.horizonForestFadeMask.position.copyFrom(this.L.horizonForest.position);
    // マスクも森1と同じオーバースキャン幅にする(w だと中央寄せした森1の左右端が隠れて黒帯になる・v0.25.1884)。
    this.horizonForestFadeMask.width = w * ZOOM_OVERSCAN;
    this.horizonForestFadeMask.height = horizonH;
    this.horizonForestFadeMaskTexture?.destroy(true);
    this.horizonForestFadeMaskTexture = texture;
  }

  private updateWorldFadeMask(w: number, h: number) {
    const zeroY = this.horizonRevealZeroScreenY();
    const fullY = zeroY + HORIZON_REVEAL_FADE_PX;

    // 文脈ズームで引くと可視域(画面に映る world 範囲)が画面より広がる。マスクは worldGroup の子で
    // 一緒に縮むため、画面ちょうど(w×h)のままだと引き時に左右/下の world が固定枠で切り取られてしまう
    // (社長報告「バツっと切れる」)。そこで最大引き(CONTEXT_ZOOM_MIN)でも覆えるよう、中央から
    // ZOOM_OVERSCAN 倍に広げて敷く。地平フェードの位置(zeroY/fullY=画面Y)は据え置き=見た目不変。
    const maskW = w * ZOOM_OVERSCAN;
    const maskH = h * ZOOM_OVERSCAN;
    const maskX = -(maskW - w) / 2;
    const maskY = -(maskH - h) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = Math.max(1, Math.ceil(maskH));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // gradient は local Y の zeroY..fullY に置く。マスク上端が maskY(画面より上)から始まるので、
    // canvas 内では (zeroY - maskY)..(fullY - maskY) の位置へオフセットする(zoom=1 で従来と一致)。
    const gz = zeroY - maskY;
    const gf = fullY - maskY;
    const grad = ctx.createLinearGradient(0, gz, 0, gf);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.clearRect(0, 0, canvas.width, canvas.height); // gz より上=透明=地平の上は隠れる(従来どおり)
    ctx.fillStyle = grad;
    ctx.fillRect(0, gz, canvas.width, Math.max(1, gf - gz));
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.fillRect(0, gf, canvas.width, canvas.height - gf);

    const texture = Texture.from(canvas);
    this.worldFadeMask.texture = texture;
    this.worldFadeMask.position.set(maskX, maskY);
    this.worldFadeMask.width = maskW;
    this.worldFadeMask.height = maskH;
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
    const hitFlash = new Sprite();
    hitFlash.tint = 0xffffff;     // 白で加算=被弾時に絵を光らせる
    hitFlash.blendMode = 'add';
    hitFlash.visible = false;
    const overlay = new Graphics();
    container.addChild(reticle, sprite, hitFlash, overlay);
    this.L.actorLayer.addChild(container);
    return { container, light, reticle, sprite, hitFlash, overlay };
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

  // 火炎瓶(molotov)の地面の火1個ぶんのビュー。松明(makeProp)から「柱スプライト無し」の
  // 最小構成(炎Graphics + 暖色ライトのみ)を切り出したもの。
  private makeGroundFireView(): { container: Container; flame: Graphics; light: Sprite } {
    const container = new Container();
    const light = new Sprite(getGlowTexture());
    light.anchor.set(0.5);
    light.blendMode = 'add';
    this.L.groundLayer.addChild(light);
    const flame = new Graphics();
    flame.blendMode = 'add';
    container.addChild(flame);
    this.L.actorLayer.addChild(container);
    return { container, flame, light };
  }

  // ---- top-level frame sync ------------------------------------------------

  // プレイヤーのピクセルスナップ(?psnap=0で無効)。sc(ワールド単位のスプライトスケール)を
  // 「1テクセル=キャンバス整数px」になるよう丸める。累積スケールは actorLayer.worldTransform
  // (フィット×ズーム。前フレーム値=変化が緩やかなので1フレ遅れは無害)×レンダラ解像度で算出。
  // 視覚のみ(判定不変)。数学は utils/texelSnap.ts の純関数(ユニットテスト対象)。
  private snapTexelScale(sc: number): number {
    if (!TEXEL_SNAP_ENABLED || sc <= 0) return sc;
    const worldScale = this.L.actorLayer.worldTransform.a || 1;
    const res = getAppliedResolution() || 1;
    const k = sc * worldScale * res; // 現在の「キャンバスpx/テクセル」
    const k2 = snapTexelRatio(k);
    return k2 === k ? sc : sc * (k2 / k);
  }

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

  // 文脈ズームで引いた分だけ可視域(画面に映る world 範囲)が広がる。カリング境界もその分だけ
  // 中心から広げないと、引き時に画面端へ現れるはずのエフェクト/リング/松明などが消えてしまう(社長報告)。
  // contextZoom<1(引き)のときだけ拡張。zoom-in(idle/move/punch)は可視域を狭めるので拡張しない(=1.0据え置き)。
  private zoomViewportOverscan(): { exW: number; exH: number; ox: number; oy: number } {
    const zin = 1 / Math.min(1, this.contextZoom || 1); // >=1(引き)
    const exW = this.screenW * zin, exH = this.screenH * zin;
    return { exW, exH, ox: (exW - this.screenW) / 2, oy: (exH - this.screenH) / 2 };
  }

  private isPointNearViewport(
    x: number,
    y: number,
    camera: { x: number; y: number },
    margin = EFFECT_VIEWPORT_MARGIN
  ) {
    const { ox, oy } = this.zoomViewportOverscan();
    return x >= camera.x - ox - margin &&
      x <= camera.x + this.screenW + ox + margin &&
      y >= camera.y - oy - margin &&
      y <= camera.y + this.screenH + oy + margin;
  }

  private distanceOutsideViewport(x: number, y: number, margin = 0) {
    const { ox, oy } = this.zoomViewportOverscan();
    const left = -this.L.world.position.x - ox - margin;
    const top = -this.L.world.position.y - oy - margin;
    const right = left + this.screenW + ox * 2 + margin * 2;
    const bottom = top + this.screenH + oy * 2 + margin * 2;
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
      case 'firejet':
        return this.isPointNearViewport(e.x, e.y, camera, EFFECT_VIEWPORT_MARGIN + e.len);
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
      case 'multiHit':
        return this.isPointNearViewport(e.x, e.y, camera, EFFECT_VIEWPORT_MARGIN);
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
  // 近景森(frontForest)のalpha。M1(stage-1)/M2(stage-2)は「一度」不透明に(半透明をやめる・社長指示v0.25.1912)。
  // stage id で判定(isLabStage はレイアウト実行時に未確定のことがあり取りこぼす)。他ステージは従来の半透明のまま。
  private frontForestAlpha(): number {
    const id = getSelectedStageId();
    if (id === 'stage-1' || id === 'stage-2') return 1;
    if (this.isLabStage) return LAB_FRONT_FOREST_ALPHA;
    return FRONT_FOREST_ALPHA;
  }
  // ラボ床テクスチャ(PixiStage が森の地面と同じ Assets.load で読み込み、ここへ注入)。
  // マニフェスト(getTexture)が万一読めなくても、こちらを最優先で使う=確実に張り替わる。
  private labGroundTex: Texture | null = null;
  // ステージ別の遠景差し替えテクスチャ(PixiStage が backgrounds/ から読み込み注入)。キー='city' 等。
  private farBackdropOverrides: Record<string, Texture | null> = {};
  // いま遠景に張っている種別。'forest'(既定)/'lab'/差し替えキー。差分があるときだけ張り替える。
  private currentFarKey = 'forest';
  setFarBackdropTexture(key: string, t: Texture | null) {
    if (!t) return;
    this.applyBgMipmap(t); // 遠景バンドも縮小敷き=mipmapでモアレ回避(社長指示v0.25.1869)
    this.farBackdropOverrides[key] = t;
    this.currentFarKey = ''; // 注入後に applyFarBackdrop を再評価させる(遅延注入対応)
  }
  // M7の雲アニメ用アトラス(PixiStageが backgrounds/stage7-clouds-anim.png を注入)。3列×2行の6コマに切り出す。
  setStage7CloudAnim(atlas: Texture | null) {
    if (!atlas) return;
    const fw = Math.floor(atlas.width / STAGE7_CLOUD_COLS);
    const fh = Math.floor(atlas.height / STAGE7_CLOUD_ROWS);
    const frames: Texture[] = [];
    for (let row = 0; row < STAGE7_CLOUD_ROWS; row++) {
      for (let col = 0; col < STAGE7_CLOUD_COLS; col++) {
        frames.push(new Texture({ source: atlas.source, frame: new Rectangle(col * fw, row * fh, fw, fh) }));
      }
    }
    this.stage7CloudFrames = frames;
    for (const sp of this.stage7Clouds) sp.texture = frames[0];
  }
  // M1の遠景=星空6コマ(縦1列×6行のシート)を切り出す。PixiStageが注入。
  setStage1SkyAnim(sheet: Texture | null) {
    if (!sheet) return;
    const fw = sheet.width;
    const fh = Math.floor(sheet.height / STAGE1_SKY_FRAMES);
    const frames: Texture[] = [];
    for (let r = 0; r < STAGE1_SKY_FRAMES; r++) {
      frames.push(new Texture({ source: sheet.source, frame: new Rectangle(0, r * fh, fw, fh) }));
    }
    this.stage1SkyFrames = frames;
    for (const sp of this.stage1Sky) sp.texture = frames[0];
    this.currentFarKey = ''; // 遠景レイアウトを再適用(可視判定)
  }
  // M1の星空に重ねる城/山/霧の森(緑抜き済PNG)。PixiStageが注入。
  setStage1CastleTexture(tex: Texture | null) {
    if (tex) this.stage1Castle.texture = tex;
  }
  // 川の流れ(チュートリアル): 遠景に重ねるハイライト筋レイヤー(PixiStageが注入)。
  private riverFlowTexs: (Texture | null)[] = [null, null];
  private riverFlowSprites: TilingSprite[] = [];
  private riverT0 = 0; // 川の流れの基準時刻(霧のfogT0と同じエポック桁あふれ対策)
  private farGroup = new Container(); // 遠景+川筋をまとめて同一ブラー(被写界深度)に入れる箱
  setRiverFlowTextures(t1: Texture | null, t2: Texture | null) {
    this.riverFlowTexs = [t1, t2];
    this.currentFarKey = ''; // 再適用(可視判定とレイアウトをやり直す)
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
      this.L.frontForest.alpha = this.frontForestAlpha();
      this.L.frontForest.mask = this.frontForestFadeMask;
    }
    this.currentFrontKey = desired;
  }
  // 遠景森2(nearHorizon)のステージ別テクスチャ。キー='forest'(森シルエット)/'city'(廃墟都市)等。
  private nearHorizonOverrides: Record<string, Texture | null> = {};
  setNearHorizonTexture(key: string, t: Texture | null) {
    if (!t) return;
    this.applyBgMipmap(t); // 森2は縮小表示でモアレ(斜め格子)化する→背景バンドだけ linear+mipmap で解消(社長指示v0.25.1869)
    this.nearHorizonOverrides[key] = t;
  }
  // 背景バンド(森2/森1/遠景=縮小して敷くTilingSprite)専用: 高周波の縮小で出るモアレ(斜め格子)を
  // GPUのmipmapで解消する。**キャラ等のスプライトには適用しない**(過去にlinear+mipmapでキャラが滲んで撤回=
  // v0.25.1763。背景バンドは縮小前提なのでmipmapが正解)。描画のみ・負荷~1/10(mipmap生成は1度きり)。
  private applyBgMipmap(t: Texture | null) {
    if (!t) return;
    try {
      const src = t.source as unknown as {
        scaleMode?: string; autoGenerateMipmaps?: boolean; update?: () => void;
        style?: { scaleMode?: string; update?: () => void };
      };
      src.scaleMode = 'linear';
      src.autoGenerateMipmaps = false; // mipmap撤回(社長v1872): 透明RGB=白がmip平均でフチに滲み「白い格子」化。linearのみに。
      if (src.style) { src.style.scaleMode = 'linear'; src.style.update?.(); }
      src.update?.();
    } catch { /* ignore */ }
  }
  // チュートリアルの岩間霧(v0.25.1823で方式変更): 既存の手前霧レイヤーの移設は廃止(移設だと
  // 画面下の手前霧が消える=社長報告)。手前の霧2層はストックのまま一切触らず、岩帯1と岩帯2の間に
  // **専用の霧スプライト**(fog-alphaテクスチャ使い回し・50%サイズ)を1枚足す。
  private tutorialFogPlaced = false;
  private tutorialMist: TilingSprite | null = null;
  private nearHorizonMist: TilingSprite | null = null; // 森2の手前=森と地面の境界に重ねる霧(社長指示v0.25.1874・M0の岩間霧と同方式)
  private applyTutorialFrontFog(active: boolean) {
    if (active === this.tutorialFogPlaced) return;
    this.tutorialFogPlaced = active;
    if (!active) { if (this.tutorialMist) this.tutorialMist.visible = false; return; }
    if (!this.tutorialMist) {
      const sp = new TilingSprite({ texture: Texture.EMPTY, width: 1, height: 1 });
      sp.tint = 0xffffff;
      sp.blendMode = 'normal'; // fog-alpha はアルファ透過素材=通常合成(森下霧と同じ)
      sp.eventMode = 'none';
      if (TUTORIAL_FRONT_FOG_BLUR > 0) sp.filters = [new BlurFilter({ strength: TUTORIAL_FRONT_FOG_BLUR, quality: 2 })]; // 少しぼかす(社長指示v0.25.1895)
      this.tutorialMist = sp;
    }
    const wg = this.L.worldGroup;
    wg.addChildAt(this.tutorialMist, wg.getChildIndex(this.L.nearHorizon)); // 岩帯1の上・岩帯2の下
    this.tutorialMist.visible = true;
  }

  // 遠景森2をキー(s.nearHorizon)で出し分け。差分時にテクスチャ差し替え+再レイアウト、tint は昼夜連動。
  private nearHorizonKeyNow = ''; // layoutNearHorizon(resize経由含む)がステージ別高さ比を引くための現在キー
  private applyNearHorizon(key: string) {
    const tex = key ? this.nearHorizonOverrides[key] : null;
    this.nearHorizonKeyNow = key;
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
    // ステージ5は実寸px指定(社長指示v0.25.1742): 高さ100px・底=境界線(farH)+50px下。
    const stage5 = this.nearHorizonKeyNow === 'stage5';
    const tutorial = this.nearHorizonKeyNow === 'tutorial'; // 岩帯2もステージ5と同じ実寸px指定
    const heightRatio = this.isLabStage ? LAB_NEAR_HORIZON_HEIGHT_RATIO : NEAR_HORIZON_HEIGHT_RATIO;
    const height = stage5 ? STAGE5_NEAR_HORIZON_HEIGHT_PX
      : tutorial ? TUTORIAL_NEAR_HORIZON_HEIGHT_PX
      : this.screenH * heightRatio;
    const bottom = stage5
      ? farH + STAGE5_NEAR_HORIZON_DOWN_PX
      : tutorial ? farH + TUTORIAL_NEAR_HORIZON_DOWN_PX
      : farH + this.screenH * NEAR_HORIZON_BOTTOM_RATIO;
    // 横オーバースキャン: 引いた時に左右が切れないよう画面より広く中央寄せ(worldGroup内=スケール対象)。
    const nhMarginX = (this.screenW * ZOOM_OVERSCAN - this.screenW) / 2;
    this.L.nearHorizon.width = this.screenW * ZOOM_OVERSCAN;
    this.L.nearHorizon.height = height;
    // 横伸び防止: y 基準の均一スケール(横は自然比率でタイル繰り返し)。nearHorizon も parallax で横スクロールするので継ぎ目なし。
    this.L.nearHorizon.tileScale.set(height / tex.height);
    this.L.nearHorizon.position.set(-nhMarginX, bottom - height);
  }
  setStage3Ground(t: Texture | null) {
    if (!t) return;
    try { const st = t.source.style as { addressMode?: string; update?: () => void }; st.addressMode = 'repeat'; st.update?.(); } catch { /* ignore */ }
    this.stage3GroundTex = t;
    this.daylightApplied = null; // 注入後に再適用
  }
  setStage3Horizon(t: Texture | null) {
    if (!t) return;
    this.applyBgMipmap(t); // 森1(地平帯)差し替えもmipmap化(社長指示v0.25.1869)
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
    // 引き(ズームアウト)で左右が切れて黒帯が出ないよう、resize と同じく横オーバースキャンして中央寄せ。
    // 以前はここで screenW(=等倍)に戻していたため resize のオーバースキャンが無効化され、引きで左右が黒くなっていた(v0.25.1884)。
    const marginX = (this.screenW * ZOOM_OVERSCAN - this.screenW) / 2;
    this.L.horizonForest.width = this.screenW * ZOOM_OVERSCAN;
    this.L.horizonForest.height = horizonH;
    // 横伸び防止: y 基準の均一スケール(横は自然比率でタイル)。resize と同方式。
    this.L.horizonForest.tileScale.set(horizonH / tex.height);
    this.L.horizonForest.position.set(-marginX, this.horizonForestY(this.farBackdropHeight(), horizonH));
    // 高さがステージ別に変わる(北部=拡大等)ため、フェードマスクをこの高さで焼き直す。
    // resize 時の高さのままだとマスクが森より短く、素材下側(地面)がフェードせず切れる(社長指示v0.25.1888「地面が斬られてる」)。
    this.updateHorizonForestFadeMask(this.screenW, horizonH);
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
      // チュートリアル(洞窟)も同様に素材本来の明るさ(素材自体が暗所として描かれており、
      // ENV_TINTを重ねると川が読めなくなる=社長報告「そもそも川がない」v0.25.1807)。
      // それ以外(森/ラボ)は従来どおり環境の暗転tintを掛ける。
      this.L.farBackdrop.tint = (desired === 'city' || desired === 'tutorial') ? 0xffffff : ENV_TINT;
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
    this.layoutRiverFlow(farH, farScale);
  }
  // 川の流れレイヤー(チュートリアルのみ): 遠景と同ジオメトリで重ねる(素材3枚が同寸=位置合わせ不要)。
  private layoutRiverFlow(farH: number, farScale: number) {
    const show = this.currentFarKey === 'tutorial';
    for (let i = 0; i < 2; i++) {
      const tex = this.riverFlowTexs[i];
      let sp = this.riverFlowSprites[i];
      if (!show || !tex) { if (sp) sp.visible = false; continue; }
      if (!sp) {
        sp = new TilingSprite({ texture: tex });
        // 加算合成=水面のきらめきとして光らせる(bloomにも拾わせる)。既存スプライト2枚の
        // ブレンド変更のみ=描画面積は不変(強glowのような多数の大面積加算とは別物・負荷増なし)。
        sp.blendMode = 'add';
        this.farGroup.addChild(sp); // 遠景の直上(同グループ=同じ被写界深度ブラーに入る)
        this.riverFlowSprites[i] = sp;
      }
      sp.texture = tex;
      sp.visible = true;
      sp.width = this.screenW;
      sp.height = farH;
      sp.tileScale.set(farScale);
      sp.alpha = RIVER_FLOW_ALPHA[i];
      // tint無し(白)=明るい筋のままbloomに拾わせる(遠景本体のENV_TINTは掛けない)。
    }
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
    // 横オーバースキャン: 引いた時に左右の黒帯が出ないよう、地面帯を画面より広く敷いて中央寄せ(視覚のみ)。
    const overW = this.screenW * ZOOM_OVERSCAN;
    const marginX = (overW - this.screenW) / 2;
    this.L.groundBase.position.set(shakeX - marginX, farH + shakeY);

    for (let i = 0; i < strips.length; i++) {
      const strip = strips[i];
      const y = i * stripH;
      const t = strips.length <= 1 ? 1 : i / (strips.length - 1);
      const perspective = Math.pow(t, curve);
      const scaleY = farScale + (nearScale - farScale) * perspective;

      strip.position.set(0, y);
      strip.width = overW;
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
    this.battlefieldStage = s.farBackdrop === 'stage5';
    this.stage5Stage = s.farBackdrop === 'stage5';
    this.isLabStage = s.stageTheme === 'lab';
    this.horizonForestUpNow = HORIZON_FOREST_UP_BY_STAGE[getSelectedStageId()] ?? 0; // 遠景森1のステージ別上移動(?mXup=)。1回/フレーム=無視できるコスト。
    // vignetteの明るい部分を狭めるのはステージ2だけ(他ステージは既定0.55の通常版)。差分時のみ差し替え。
    if (this.vignetteNarrow !== this.isLabStage) {
      this.vignetteNarrow = this.isLabStage;
      this.vignette.texture = this.isLabStage ? getVignetteTextureNarrow() : getVignetteTexture();
    }
    this.applyNearHorizon(s.nearHorizon); // 遠景森2(ステージ別)
    this.applyTutorialFrontFog(this.currentFarKey === 'tutorial'); // 手前霧のz移設(チュートリアルのみ)
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
      // §5.23 M22 C1: 方向指定(shakeDirX/Y、triggerShake側で?dirfx=0なら常に{0,0})があれば
      // その方向へ寄せる。無指定(dirLenほぼ0)は従来どおり完全な等方ランダム。
      const dirLen = Math.hypot(s.shakeDirX, s.shakeDirY);
      if (dirLen > 0.01) {
        const off = biasedShakeOffset(mag, s.shakeDirX / dirLen, s.shakeDirY / dirLen, Math.random() * 2 - 1, Math.random() * 2 - 1);
        sx = off.x; sy = off.y;
      } else {
        sx = (Math.random() * 2 - 1) * mag;
        sy = (Math.random() * 2 - 1) * mag;
      }
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
    // KILL/カウンターの寄りパンチズーム: スロー(triggerTimeSlow)と全く同じ「最大を保持→戻りは
    // 滑らかにランプ」カーブを流用(社長指示: 一番寄っている瞬間をスローの一番遅い区間と揃える)。
    // computeTimeSlowScaleはminScale(=0)から1.0へ向かうカーブを返すので、1から引いて「1(最大寄り)
    // →0(寄り無し)」の減衰係数に反転させる。zoomStart/zoomHoldMsはtriggerZoomが設定する。
    const zoomDecay = (s.zoomUntil > now && s.zoomMag > 0)
      ? 1 - computeTimeSlowScale(now, s.zoomStart, s.zoomUntil, 0, s.zoomHoldMs)
      : 0;
    const punch = 1 + s.zoomMag * zoomDecay;
    // 文脈ズーム: 敵数が多い/大型がいるほど少し引く(視覚専用)。イージング追従＋不感帯でパカパカ防止。
    // 引き(target<現在)は長い時定数でじわっと、戻りは待機と同じ時定数。
    // プレイヤー近く(画面内相当の半径)にいる敵だけ数える。遠くの大型/多数では引かない(社長指示)。
    const zNearR2 = Math.pow(Math.max(this.screenW, this.screenH) * 0.6, 2);
    const zpx = s.player.x + s.player.width / 2, zpy = s.player.y + s.player.height / 2;
    let hasLargeForZoom = false, nearCount = 0;
    for (const e of s.enemies) {
      const dx = e.x + e.width / 2 - zpx, dy = e.y + e.height / 2 - zpy;
      if (dx * dx + dy * dy > zNearR2) continue; // 遠い敵は無視
      nearCount++;
      if (isLargeForZoom(e.type)) hasLargeForZoom = true;
    }
    const czTarget = contextZoomTarget(nearCount, hasLargeForZoom);
    const czTau = czTarget < this.contextZoom - 0.0001 ? CAMERA_MOVE_ZOOM_TAU : CAMERA_IDLE_ZOOM_TAU;
    this.contextZoom += (czTarget - this.contextZoom) * (1 - Math.exp(-zdt / Math.max(0.001, czTau)));
    const zoom = this.idleZoom * this.contextZoom * punch;
    // 寄り先(社長指示・v0.25.1498): KILLはキルされた対象(zoomTargetX/Y・世界座標)を画面中央の
    // 代わりに寄りの軸にする(zoomDecay>0=パンチ演出中のみ・カウンター等は指定なしで従来どおり中央)。
    // world.position は本関数の先頭でカメラオフセット込み更新済みなのでここでそのまま使える。
    const pivotX = (s.zoomHasTarget && zoomDecay > 0) ? this.L.world.position.x + s.zoomTargetX : this.screenW / 2;
    const pivotY = (s.zoomHasTarget && zoomDecay > 0) ? this.L.world.position.y + s.zoomTargetY : this.screenH / 2;
    if (Math.abs(zoom - 1) > 0.0005) {
      this.L.worldGroup.scale.set(zoom);
      this.L.worldGroup.position.set(pivotX * (1 - zoom), pivotY * (1 - zoom));
      this.zoomApplied = true;
    } else if (this.zoomApplied) {
      this.L.worldGroup.scale.set(1);
      this.L.worldGroup.position.set(0, 0);
      this.zoomApplied = false;
    }
    // 被写界深度(tilt-shift)/ブルームの filterArea 追従: Pixi v8 の filterArea はコンテナの
    // ローカル座標で解釈され worldTransform で画面へ写像される。resize時の静的(0,0,w,h)のままだと
    // ズーム中はフィルタ枠が画面中央へ縮み、シャープ帯も画面高の(1-zoom)/2ぶん下へずれる
    // (社長報告: ボス戦=常時最大引きで被写界深度がおかしい・全ステージ)。毎フレーム、画面矩形を
    // worldGroupの現在値で逆変換してローカルに張り直す=フィルタ枠は常に画面ぴったり・
    // tiltShift.start/end(画面px)はそのままで正しくなる。zoom=1でも同式で(0,0,w,h)に一致。
    this.syncWorldFilterArea();
    // 被写界深度(tilt-shift)のシャープ帯をプレイヤーの画面Yへ毎フレーム追従(社長指示v0.25.1758
    // 「(ドット絵の滲みの正体=チルトシフト)プレイヤーは外して」)。帯が固定比率(0.54)だと立ち位置
    // (屋外=camdownで0.58/ラボ・屋内=0.50)とズレ、プレイヤーに薄いボケが常時乗っていた。
    // start/endは画面px扱い(上のfilterArea追従でズーム中も画面基準のまま)なので、ズーム込みの
    // 実画面Yを渡す=プレイヤーは常にピント(ボケ0)。ボケの絵作り(上下のDoF)は従来のまま。
    if (this.tiltShift) {
      // ★単位換算(v0.25.1773・SE2ずれ修正): シェーダは uStart/uEnd/gradientBlur を
      // 「フィルタ入力テクスチャpx=CSS px」で解釈する(vTextureCoord×uInputSize と直接比較)。
      // ここまでの bandY は論理px(stageローカル)なので、ビューポートスケール(論理→CSS)を掛けて渡す。
      // 常用機(CSS幅390-430)は係数≈0.96-1.06でほぼ不変。SE2+Safariバー(375×553)は0.77となり、
      // 旧実装ではピント面が約100px下(手前NPC側)へずれてプレイヤーが薄ボケ帯に入っていた。
      // グラデ幅/ボケ強さも同換算=どの端末でも世界に対して同じDoF(チューニング値は論理px基準で不変)。
      const tz = this.L.worldGroup.scale.x || 1;
      const vpScale = this.L.stage.scale.x || 1;
      // シャープ帯の焦点=カメラが見ている中心(社長指示v0.25.1875「カメラがある中心は常にボヤけない」)。
      // 通常はプレイヤー(zpy)。アテンション中はカメラがフォーカス対象(attention.y)を中央に寄せるので、
      // 帯もそこへ追従させる(=フォーカスした対象がボケない)。KILL寄り(zoomTarget)も同様に軸へ合わせる。
      const bandFocalY = s.attention ? s.attention.y
        : (s.zoomHasTarget && zoomDecay > 0) ? s.zoomTargetY
        : zpy;
      const bandY = ((this.L.world.position.y + bandFocalY) * tz + this.L.worldGroup.position.y) * vpScale;
      this.tiltShift.start = { x: 0, y: bandY };
      this.tiltShift.end = { x: this.screenW * vpScale, y: bandY };
      this.tiltShift.gradientBlur = TILT_SHIFT_GRADIENT * vpScale;
      this.tiltShift.blur = TILT_SHIFT_BLUR * vpScale;
    }
    // スモッグ: 各層1枚を画面に固定し、texture を右へ流す(tilePosition.x↑)+揺らめき。縦は位置の bob で揺らめき。
    // 奥レイヤーは world 内なので camera/shake を打ち消して画面にピン留め(子は素の画面座標で配置)。
    this.bgCloudLayer.position.set(s.camera.x - sx, s.camera.y - sy);
    if (this.fogT0 === 0) this.fogT0 = now;
    // チュートリアル専用の岩間霧(手前霧とは独立の1枚)。ズーム(待機/文脈)につられないよう、
    // worldGroupのズーム変換を毎フレーム打ち消す(S=L×z+p → scale=1/z・position補正で恒等)。
    // 位置=岩帯付近(farH−CENTER_UP)+縦揺らぎ、柄=fog-alphaの50%、横は右へゆっくり流す(森下霧と同係数)。
    if (this.tutorialFogPlaced && this.tutorialMist) {
      const mist = this.tutorialMist;
      if (mist.texture.width <= 1) { const mt = getTexture('fog-alpha'); if (mt) mist.texture = mt; }
      if (mist.texture.width > 1) {
        const wz = this.L.worldGroup.scale.x || 1;
        const w = this.screenW * 2.2;
        const h = this.screenH * 0.95 * TUTORIAL_FRONT_FOG_SCALE;
        const mistT = (now - this.fogT0) * 0.030 * FOG_SPEED + Math.sin(now * 0.0008 * FOG_SPEED + 3.1) * 26;
        mist.width = w;
        mist.height = h;
        mist.tileScale.set((w / mist.texture.width) * TUTORIAL_FRONT_FOG_SCALE, h / mist.texture.height);
        mist.alpha = FOG_FRONT_ALPHA;
        const mx = (this.screenW - w) / 2;
        const my = this.farBackdropHeight() - TUTORIAL_FRONT_FOG_CENTER_UP_PX - h / 2
          + Math.sin(now * 0.0004 * FOG_SPEED + 0.7) * 9;
        // ズーム打ち消し: worldGroup変換の逆を座標/スケールに織り込む(スプライト単体なのでここで完結)。
        mist.scale.set(1 / wz);
        mist.position.set(
          (mx - this.L.worldGroup.position.x) / wz,
          (my - this.L.worldGroup.position.y) / wz
        );
        mist.tilePosition.set(mistT, 0);
      }
    }
    // 森2の手前に境界霧(社長指示v0.25.1874・M0の岩間霧と同方式): 森2の底(=森と地面の境界)へ、fog-alpha素材を
    // 半分サイズで重ねて境界を曖昧にする。'forest'系の森2の時だけ。森2と同じ worldGroup-local 座標系で置くので
    // ズーム(?zoomlock=1)でも森2と一致して破綻しない。負荷: 全画面帯TilingSprite1枚=既存の森下霧と同経路(軽い)。
    {
      const wantNhMist = this.L.nearHorizon.visible && this.nearHorizonKeyNow === 'forest';
      if (wantNhMist && !this.nearHorizonMist) {
        const sp = new TilingSprite({ texture: Texture.EMPTY, width: 1, height: 1 });
        sp.tint = FOG_TINT; sp.blendMode = 'normal'; sp.eventMode = 'none';
        this.nearHorizonMist = sp;
        const wg = this.L.worldGroup;
        wg.addChildAt(sp, wg.getChildIndex(this.L.nearHorizon) + 1); // 森2の「手前」(上に重ねる)・gameplayの後ろ
      }
      const nm = this.nearHorizonMist;
      if (nm) {
        if (!wantNhMist) { nm.visible = false; }
        else {
          if (nm.texture.width <= 1) { const mt = getTexture('fog-alpha'); if (mt) nm.texture = mt; }
          if (nm.texture.width > 1) {
            nm.visible = true;
            const farH = this.farBackdropHeight();
            const seamY = farH + this.screenH * NEAR_HORIZON_BOTTOM_RATIO; // 森2の底=森と地面の境界
            const nhMarginX = (this.screenW * ZOOM_OVERSCAN - this.screenW) / 2;
            const w = this.screenW * ZOOM_OVERSCAN;
            const h = this.screenH * 0.45;                                  // 帯の高さ(境界を跨ぐ)
            nm.width = w; nm.height = h;
            nm.tileScale.set((w / nm.texture.width) * TUTORIAL_FRONT_FOG_SCALE, h / nm.texture.height); // 柄は半分サイズ
            nm.alpha = NEAR_HORIZON_MIST_ALPHA;
            nm.position.set(-nhMarginX, seamY - h * 0.5 - NEAR_HORIZON_MIST_UP_PX + Math.sin(now * 0.0004 * FOG_SPEED + 1.9) * 7);
            const nmT = (now - this.fogT0) * 0.024 * FOG_SPEED + Math.sin(now * 0.0007 * FOG_SPEED + 2.3) * 20;
            nm.tilePosition.set(nmT, 0);
          }
        }
      }
    }
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
    // cine: 空を生かす(A+B・社長指示v0.25.1865)。既存ベイクSpriteのtransformだけ=軽い。
    //  A=idleドリフト+呼吸スケール(sin)、B=層ごとに違う速度+カメラ移動へ僅かに連動=奥行き視差。
    //  遠い層ほど動きを小さく: 太陽(最遠)<雲(中)<塵(近)。
    if (this.cineEnabled) {
      const w = this.screenW, h = this.screenH;
      const sunY = h * 0.18 + tsNum('sundown', 10); // 光源周り(太陽+放射streak)を少し下げる(社長指示v0.25.1930「10px下」・?sundown=で調整)
      const camX = s.camera.x, camY = s.camera.y;
      const sunX = w * CINE_SUN_X_FRAC; // 光源=右寄り(固定)。雲(放射streak)の原点も同じ。
      // 光フレア(太陽+放射streak)は位置固定=左右にも上下にも動かさない(社長v0.25.1877)。
      // 代わりに alpha を薄↔濃で揺らして「出たり消えたり=煌めき」だけ表現。雲と太陽で位相をずらす。
      // 放射streak(光の線)を各レイヤー位相ちがいで明滅=出たり消えたりの煌めき(社長指示v0.25.1906)。
      for (let i = 0; i < this.cineCloudLayers.length; i++) {
        const sp = this.cineCloudLayers[i];
        sp.position.set(sunX, sunY + h * 0.06);
        sp.width = w * 1.1;
        sp.height = h * 0.5;
        const ph = i * (Math.PI * 2 / CINE_CLOUD_LAYERS) + i * 0.9;
        const spd = CINE_CLOUD_TWINKLE_SPD * (1 + i * 0.27); // 層ごとに速さも少し変える
        let tw = Math.sin(now * spd + ph);        // -1..1
        tw = Math.max(0, tw); tw = tw * tw;        // 0..1・低い側に滞在(出没感)
        sp.alpha = Math.max(0, CINE_CLOUD_ALPHA_BASE * (CINE_CLOUD_TWINKLE_FLOOR + (1 - CINE_CLOUD_TWINKLE_FLOOR) * tw));
      }
      this.cineSun.width = this.cineSun.height = Math.max(w, h) * 0.58;
      this.cineSun.position.set(sunX, sunY);
      // 光源(太陽)は常時最大で固定=煌めかせない。明滅(煌めき)は上の cineClouds(周りの放射光)側だけ(社長指示v0.25.1885)。
      this.cineSun.alpha = CINE_SUN_ALPHA_MAX;
      // 残照(全画面グラデ): 端が出ないよう位置は動かさず、alphaだけ呼吸させて「生きている」感を出す。
      this.cineWarm.alpha = CINE_WARM_ALPHA * (1 + Math.sin(now * CINE_SKY_BREATH_SPD * 0.5) * CINE_SKY_WARM_BREATH);
      // 塵(近景): idle斜めドリフト+カメラ連動(最大)=最前面の視差。tilePositionは自動wrap。
      this.cineDust.tilePosition.set(
        (now * 0.006 - camX * CINE_PARALLAX_DUST) % 256,
        (now * 0.004 - camY * CINE_PARALLAX_DUST) % 256,
      );
    }
    this.updateStage7Clouds(now); // M7の雲(farKeyで自己ゲート・cine非依存)
    this.updateStage1Sky(now, s.camera.x); // M1の遠景=星空6コマ+城パララックス(stage-1で自己ゲート)
    // 研究所スキンは床/素材を見せるため、クール調整を弱める(森はそのまま)。
    // cine時は寒色gradeをCINE値で維持(labThemeFog/daylightの上書きに勝つ)。
    this.gradeSprite.alpha = this.cineEnabled ? CINE_GRADE_ALPHA
      : labThemeFog ? GRADE_ALPHA * 0.45 : (this.daylight ? DAY_GRADE_ALPHA : GRADE_ALPHA);

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
    // 川の流れ(チュートリアル): 遠景と同じパララックス+速度差の横流し+アルファの微揺らぎ。
    // 重要: now はエポックms。そのまま速度を掛けると桁が大きすぎて(1e10px級)GPUのfloat32精度で
    // UVが壊れ、筋が描けない/動かない(v0.25.1807の実バグ)。霧(fogT0)と同じ相対時刻に直し、
    // さらにテクスチャ周期でmoduloして永久に桁を溜めない。
    if (this.riverT0 === 0) this.riverT0 = now;
    for (let i = 0; i < 2; i++) {
      const sp = this.riverFlowSprites[i];
      if (!sp || !sp.visible) continue;
      sp.position.set(sx * 0.25, 0);
      const period = sp.texture.width * sp.tileScale.x; // タイル1周のdest px
      const drift = ((now - this.riverT0) / 1000) * RIVER_FLOW_SPEED_PX_S[i];
      sp.tilePosition.set(
        (-s.camera.x * FAR_BACKDROP_PARALLAX_X - drift) % period,
        0
      );
      sp.alpha = RIVER_FLOW_ALPHA[i] + Math.sin(now / RIVER_FLOW_WOBBLE_MS[i] * Math.PI * 2) * RIVER_FLOW_WOBBLE[i];
    }
    const horizonH = this.horizonForestHeight();
    // 横オーバースキャンを中央寄せ(resizeと同一): 引き(ズームアウト)で森1の左右が切れて黒帯が出るのを防ぐ。
    // 以前は x=0 固定でオーバースキャンが右だけに寄り、引きで左側が切れていた(社長指示v0.25.1884)。
    const horizonMarginX = (this.screenW * ZOOM_OVERSCAN - this.screenW) / 2;
    this.L.horizonForest.position.set(-horizonMarginX, this.horizonForestY(farH, horizonH));
    // 北部(snow)は森1の横速度を森2と同等に(社長指示v0.25.1894)。他ステージは従来どおり。
    const horizonParaX = this.currentFarKey === 'snow' ? HORIZON_FOREST_SNOW_PARALLAX_X : HORIZON_FOREST_PARALLAX_X;
    this.L.horizonForest.tilePosition.set(
      -s.camera.x * horizonParaX,
      0
    );
    this.horizonForestFadeMask.position.copyFrom(this.L.horizonForest.position);
    // 遠景手前森(ステージ3): 縦位置は layout 固定、横だけパララックス(地平より速い=近い)。
    if (this.L.nearHorizon.visible) {
      this.L.nearHorizon.tilePosition.set(-s.camera.x * NEAR_HORIZON_PARALLAX_X, 0);
    }
    // 遠景森1/2(と森2境界霧)は worldGroup の子として床と一緒に文脈ズームでスケール/移動する。
    // 床と同一グループ=相対関係がズーム不変なので、引き(裏ボス等)でも森1が床の境界から剥がれず
    // 「地面の切れ目」が出ない(v0.25.1880〜1882の画面固定ピンは森1を床から剥がして切れ目を生んだため撤回=v0.25.1883)。
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
    this.L.frontForest.position.set(sx * 0.75, this.screenH - frontH + this.frontForestYOffset(frontH));
    this.L.frontForest.tilePosition.set(
      -s.camera.x * FRONT_FOREST_PARALLAX_X,
      0
    );
    this.frontForestFadeMask.position.copyFrom(this.L.frontForest.position);

    this.syncTrees(s.camera);
    this.syncLabWalls(); // 壁オブジェクト(研究所スキン・区画生成。森では no-op)
    this.syncLabProps(); // 遮蔽物プロップ(研究所スキン・区画生成。森/屋内では no-op)
    this.syncCityProps(); // ステージ3(廃都)の散布オブジェクト(その他ステージでは no-op)
    this.syncForestFlowers(); // ステージ1(森)の装飾花(その他ステージでは no-op)
    // 最前面の天井帯: lab=ケーブル帯 / チュートリアル(洞窟)=鍾乳石帯(同仕様・上寄せループ)。
    this.updateLabCeiling(
      s.stageTheme === 'lab' && !s.indoorMode ? 'lab/lab-ceiling-band'
        : s.farBackdrop === 'tutorial' ? 'tutorial-ceiling-band'
        : null,
      s.farBackdrop === 'tutorial' ? s.camera.x : 0, // ツララ帯=近景と同係数でカメラ連動(labは従来どおり固定)
      s.farBackdrop === 'tutorial' ? TUTORIAL_CEILING_SCALE : 1 // ツララ帯=1.5倍(labは等倍)
    );
    this.updateLabVisibility(LAB_VISIBILITY_VEIL && s.stageTheme === 'lab' && !s.indoorMode, sx, sy); // 暗闇演出は廃止(社長指示)。?labveil=1 で参照復活
    // 洋館再訪(the ONE): 城(洋館=保存槽)への画面端マーカーをボス未出現でも出す(目的地の誘導)。
    this.revisitMarker = s.revisitMode === true;
    // 屋内(研究施設)は指定がない限り「最初の部屋に武器商人のみ」。ボス部屋(城)/二人組(クエストNPC)は描画しない。
    if (s.indoorMode || s.stageTheme === 'lab') {
      // 屋内 / 研究所スキンは城(建物)を描かない。※ giantbat ボスは城座標に出る(クリア条件)ので湧き自体は維持。
      this.castleView.visible = false; this.castleShadow = null; this.castleGlow.visible = false;
      this.eventNpcView.visible = false; this.npcShadow = null;
    } else {
      this.syncCastle(s.castleEvent, now);
      this.syncEventQuestNpc(s.eventQuestNpc, s.player, now);
    }
    this.syncMerchant(s.weaponMerchant, s.player, now, s.merchantDwellMs); // 商人は屋内でも(最初の部屋に)出す
    this.syncBreakableProps(s.breakableProps, now);
    this.syncPickups(s.pickups, now);
    this.syncPumpkinTelegraph(s.enemies, now); // ジャンプ攻撃の着地予告(赤い影)
    this.updateBoomerangReadyMark(s.player, now); // ブーメランCD明けの頭上マーク
    this.updateMarksmanRangeMark(s.player, now);  // マークスマン射程上昇 発動の頭上ターゲットマーク
    this.syncActors(s.player, s.enemies, s.gameTime, now);
    this.syncLockIndicators(s.enemies, s.homingLocks, now);
    this.syncSlasherRing(s.player, s.realGameTime);
    this.syncSkadiHazards(s.skadiIceMarkers, s.skadiIceBlades, s.gameTime);
    this.syncGroundFires(s.groundFires, now); // 火炎瓶(molotov)の地面の火(松明と同じ炎を流用)
    this.syncBossFires(s.bossFires, s.gameTime, now); // ジブリルのランタン火(紫の単発火・0.7秒予告→2秒)
    this.syncSensorMines(s.sensorMines, s.gameTime, now); // センサー地雷(待機ディスク/感知後2秒の赤点滅テレグラフ)
    this.syncFlareGun(s.flareGunFlares, s.gameTime, now); // フレアガン(飛翔→着弾中3秒の火・molotovの火を流用)
    this.syncRescueAllies(s.rescueAllies, s.player, s.gameTime); // スキル 救難信号: 飛来する援護アライ(着地位置は発生時固定)
    this.syncThrownBags(s.thrownBags, s.enemies, s.gameTime); // 救急鞄: 空鞄投擲(プレイヤー→対象敵への直線飛行)
    this.syncShadows(s.player, s.enemies, s.summons, s.projectiles, s.escorts, s.rescueSurvivors, s.baseSites, now);
    this.syncStageLightShaftDrift(s.camera, now);
    this.syncProjectiles(s.projectiles, now);
    this.syncShields(s.projectiles, now);
    this.syncArena(s.activeEvent, now);
    this.syncReturnCircle(s.returnCircle, now);
    this.syncBaseSites(s.baseSites, now, s.safeBaseId);
    this.syncHunterVision(s.enemies, now);
    this.drawEscorts(s.escorts, now); // 護衛軍人NPC(屋外のみ。屋内/ラボでは s.escorts=[] でプルーン)
    this.drawSupportSniper(s.supportSniperNpc, s.gameTime); // 援護射撃NPC(非出撃の軍人立ち絵・画面縁のスライドイン→発射→後退)
    this.syncBossCorpse(s.bossCorpse, now);
    // 深層域グレーディング(退色セピア・描画のみ)。逆再生BGMと同じ境界・約1秒フェード。
    this.syncDeepZoneGrade(
      !s.indoorMode && s.stageTheme !== 'lab' && !s.rhythm.active,
      Math.hypot(s.player.x + s.player.width / 2, s.player.y + s.player.height / 2),
      now,
      s.redNight?.phase === 'active',
      s.gateActive, // ゲート戦闘中はセピアの切替を凍結(社長指示v0.25.1667)
      s.deepZoneLocked, // ゲート2未クリアの間は深層セピアに入らない(社長報告v0.25.1670)
    );
    this.drawRescueSurvivors(s.rescueSurvivors, now);
    this.syncDecoys(s.projectiles, now);
    this.syncFireKnives(s.projectiles, now);
    this.syncTurrets(s.projectiles, now);
    this.syncSkateboards(s.projectiles, now);
    this.syncDroneBoomerangs(s.projectiles, now);
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
      now,
      s.escorts
    );
    this.syncPlayerFx(s.player, now);
    this.syncSpeedLines(s.player, now); // §5.23 M22 C4: 突進/カウンターの速度線(screen-space・軽量)
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
    const alertedHunters = s.enemies.filter(e => e.type === 'hunter' && e.hunterAlerted && !e.hunterFleeing).map(e => ({ x: e.x + e.width / 2, y: e.y + e.height / 2 }));
    // 二人組クエストの強制目標(同時1体)。近く+画面外の時だけ縁矢印(syncArrows)。
    const questTargets = s.enemies.filter(e => e.questTarget).map(e => ({ x: e.x + e.width / 2, y: e.y + e.height / 2 }));
    // 叫喚型(screamer)は同時1体だけ(ディレクター管理)なので検知条件なしで常に方角を示す(優先処理対象)。
    const liveScreamers = s.enemies.filter(e => e.type === 'screamer').map(e => ({ x: e.x + e.width / 2, y: e.y + e.height / 2 }));
    this.syncArrows(s.pickups, s.castleEvent, s.weaponMerchant, s.camera, !(s.indoorMode || s.stageTheme === 'lab'), s.activeEvent, revealedPois, s.baseSites, s.escorts, { x: s.player.x + s.player.width / 2, y: s.player.y + s.player.height / 2 }, alertedHunters, liveScreamers, questTargets);
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
    // チュートリアルは城(構造物)そのものを出さない(社長指示v0.25.1822「何もかも無し」・報告「ボス城がのこってる」)。
    if (useGameStore.getState().farBackdrop === 'tutorial') {
      this.castleView.visible = false;
      this.castleShadow = null;
      return;
    }
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
    // プレイヤーが城の裏に回り込んだら透かす(木/壁/プロップと同じ規格)。将来のダンジョン系オブジェも同様に。
    const stMult = this.seeThroughMult(castle.x, footY, tex.width * sc, targetH);
    const targetAlpha = Math.min(0.96, horizonAlpha * 0.9) * stMult;
    this.castleView.alpha += (targetAlpha - this.castleView.alpha) * this.seeThroughLerp;
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

  private syncMerchant(merchant: WeaponMerchant, player: Player, now: number, dwellMs: number) {
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
    // 滞在→話しかけの進捗アーク(社長指示v0.25.1842「サークルに3秒滞在」)。帰還/クエスト円の
    // 白アーク・12時起点と同じ意匠(既存のdwellメーターと操作感を揃える)。
    if (dwellMs > 0) {
      const frac = Math.max(0, Math.min(1, dwellMs / MERCHANT_TALK_DWELL_MS));
      const start = -Math.PI / 2;
      const rr = (merchant.radius + 6) * d;
      const cyw = -8 * d;
      g.moveTo(Math.cos(start) * rr, cyw + Math.sin(start) * rr)
        .arc(0, cyw, rr, start, start + Math.PI * 2 * frac)
        .stroke({ width: 4 * d, color: 0xfff7cc, alpha: 0.95 });
    }
  }

  private syncEventQuestNpc(npc: EventQuestNpc, player: Player, now: number) {
    // 過去のプレイで納品済みのステージ: 二人は出現しない(社長指示v0.25.1684)。
    if (npc.status === 'gone') {
      this.eventNpcView.visible = false;
      this.npcShadow = null;
      return;
    }
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
    // 受領済み(accepted)も納品の対話対象なのでサークルを見せる(社長指示v0.25.1684の「同じ動作」)。
    const near = (npc.status === 'available' || npc.status === 'accepted')
      && dx * dx + dy * dy <= (npc.radius + 72) * (npc.radius + 72);
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
    // 滞在受領の進捗メーター(社長指示v0.25.1681): 拠点解放の制圧アークと同じ意匠(白いアーク・12時起点)。
    // 3秒(=EVENT_QUEST_DWELL_MS。useGameLoopが dwellMs を加算)で満了=自動受領。
    // 受領済み(accepted)は納品の再滞在メーターとして同じアークを使う(社長指示v0.25.1684)。
    if ((npc.status === 'available' || npc.status === 'accepted') && npc.dwellMs > 0) {
      const frac = Math.max(0, Math.min(1, npc.dwellMs / EVENT_QUEST_DWELL_VIS_MS));
      const start = -Math.PI / 2, rr = (npc.radius + 6) * d, cyq = -8 * d;
      g.moveTo(Math.cos(start) * rr, cyq + Math.sin(start) * rr)
        .arc(0, cyq, rr, start, start + Math.PI * 2 * frac)
        .stroke({ width: 4 * d, color: 0xfff7cc, alpha: 0.95 });
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
        // 回転つき(散らばりの銃=rotateDeg指定)は中心アンカーでその場回転。
        // 「拾えるアイテム(横向き表示)と見分ける」ための見た目専用(社長指示2026-07-17)。
        if (p.rotation !== 0) {
          sprite.anchor.set(0.5, 0.5);
          sprite.rotation = p.rotation;
        } else {
          sprite.anchor.set(0.5, 1);
        }
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

  // ステージ1(森)の装飾花。立ち物として actorLayer に足元Yで Y-sort(他ステージ/屋内では空=no-op)。
  // 当たり判定なし(純粋な飾り)。明るい花弁は filteredWorld の bloom 閾値を超えるので自然に少し光る
  // (追加の発光スプライトは置かない=描画コストはただのスプライト=軽い)。
  private syncForestFlowers() {
    const s = useGameStore.getState();
    const stageId = s.indoorMode ? '' : getSelectedStageId();
    const cam = s.camera;
    const m = FLOWER_ZONE;
    const flowers = forestFlowersInRegion(stageId, cam.x - m, cam.y - m, cam.x + this.screenW + m, cam.y + this.screenH + m);
    const tint = this.envTintNow();
    const seen = new Set<string>();
    for (const f of flowers) {
      seen.add(f.id);
      let entry = this.flowerObjs.get(f.id);
      if (!entry) {
        const tex = getTexture(`props/flower-${f.variant}`);
        const sprite = new Sprite(tex ?? undefined);
        sprite.anchor.set(0.5, 1);
        sprite.x = f.footX;
        sprite.y = f.footY;
        sprite.zIndex = f.footY; // 立ち物=足元Yでアクター/敵とY-sort
        this.L.actorLayer.addChild(sprite);
        const baseScale = tex ? (FLOWER_DISPLAY_H * f.scale) / tex.height : 1;
        entry = { sprite, baseScale, footY: f.footY };
        this.flowerObjs.set(f.id, entry);
      }
      entry.sprite.tint = tint;
      entry.sprite.scale.set(entry.baseScale * this.depthScale(entry.footY));
      entry.sprite.alpha = this.horizonActorAlpha(entry.footY) * this.foregroundActorAlpha(entry.footY); // 地平線+手前でフェード
    }
    for (const [id, entry] of this.flowerObjs) {
      if (!seen.has(id)) { entry.sprite.destroy(); this.flowerObjs.delete(id); }
    }
  }

  // 最前面の天井帯オーバーレイ: screen-space で画面上端に上寄せ配置。半透明(LAB_CEILING_ALPHA)。
  // frontForest の直前(uiLayer の下)に置く=ゲームプレイ/前景森より手前。アスペクト維持で画面幅にフィット。
  // texName=lab のケーブル帯 or チュートリアルの鍾乳石帯(同仕様)。null=非表示。
  // scrollX: カメラ連動の横スクロール量(world px)。0=固定(lab従来)。チュートリアルのツララ帯は
  // 近景森と同じ係数(FRONT_FOREST_PARALLAX_X)で流す(社長指示v0.25.1824「画面と連動して動くように。
  // この🪨と同じ速度」)。TilingSprite化(横ループ素材の本来の使い方)=見た目のスケールは従来と同一
  // (1ループ=画面幅)。
  private updateLabCeiling(texName: string | null, scrollX = 0, scale = 1) {
    const tex = texName ? getTexture(texName) : null;
    if (!tex || LAB_CEILING_ALPHA <= 0) { if (this.labCeiling) this.labCeiling.visible = false; return; }
    if (!this.labCeiling) {
      const sp = new TilingSprite({ texture: tex, width: 1, height: 1 });
      const parent = this.L.frontForest.parent!;
      parent.addChildAt(sp, parent.getChildIndex(this.L.frontForest) + 1); // frontForest の手前・uiLayer の下
      this.labCeiling = sp;
    }
    const sp = this.labCeiling;
    sp.visible = true;
    if (sp.texture !== tex) sp.texture = tex;
    const h = this.screenW * (tex.height / tex.width) * scale; // アスペクト維持(scale=表示倍率。1ループ=画面幅×scale)
    sp.width = this.screenW;
    sp.height = h;
    sp.tileScale.set(h / tex.height);
    sp.tilePosition.set(-scrollX * FRONT_FOREST_PARALLAX_X, 0);
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
      if (e.aiPhase === 'jump' && (e.type === 'pumpkin' || e.type === 'lab-zombie-3' || e.type === 'giantbat' || e.type === 'hunter')) {
        const tx = (e.aiTargetX ?? e.x) + e.width / 2;
        const ty = (e.aiTargetY ?? e.y) + e.height / 2;
        const R = PUMPKIN_EXPLOSION_RADIUS;
        // 社長指示v0.25.1612「赤の外=安全」: 当たり判定は世界座標の真円(半径R+自機半径)。縦潰し楕円だと
        // 上下に立つと赤の外でも食らうので真円(ry=R)で判定を覆う(判定は不変=見た目だけ実寸に一致)。
        g.ellipse(tx, ty, R, R).fill({ color: 0xff2a2a, alpha: 0.16 + 0.12 * pulse });
        g.ellipse(tx, ty, R, R).stroke({ width: 2, color: 0xff3b3b, alpha: 0.45 + 0.3 * pulse });
        continue;
      }
      // ダッシュ突進予告(犬/lab-zombie-2/ジャイアントバット): 溜め中(windup)に移動先まで赤ラインで距離表示。
      if (e.aiPhase === 'windup' && (e.type === 'werewolf' || e.type === 'lab-zombie-2' || e.type === 'giantbat' || e.type === 'hunter')
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
    now: number,
    escorts: EscortSoldier[] = []
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
      // 進軍NPC(escort)も敵/プレイヤーと同じく爆発などの局所光で影が伸びるようにする(社長指示)。
      // 影幅=立ち絵実幅×0.55(他アクター同基準)。足元=esc.x/esc.y(anchor 0.5,1)。
      for (const esc of escorts) {
        const escSp = this.escortSprites.get(esc.id);
        const escW = escSp && escSp.visible !== false ? Math.abs(escSp.width) : 0;
        const baseW = escW > 0 ? escW : 30 * this.depthScale(esc.y);
        addCaster(esc.x, esc.y, baseW * 0.55, 1);
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
          const len = (118 + e.radius * 1.9) * falloff * actorDepth * Math.min(1.55, actor.strength) * LOCAL_EVENT_SHADOW_SIZE_MULT;
          const shadowRadiusX = Math.max(4, actor.w * 0.55) * LOCAL_EVENT_SHADOW_SIZE_MULT;
          const shadowRadiusY = Math.max(1.5, actor.w * 0.18) * LOCAL_EVENT_SHADOW_SIZE_MULT;
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
      // 緑卵=ベイクしたプールスプライト1枚で描画(旧:per-frame Graphics の clear()+約12楕円塗りを撤去)。
      // 「息づく」脈動はスケールの微振動だけで再現(per-frame Graphics は使わない)。
      // アーム済み(社長仕様v0.25.1846)=赤ベイク版テクスチャ+速く大きいプクプク+光も赤の速い明滅。
      // 描画手法は不変(同じプールスプライト+小さな光1枚)=負荷据え置き。
      const armed = prop.armedAt !== undefined;
      const tex = armed ? getEggTextureArmed() : getEggTexture();
      const d = this.depthScale(prop.footY);
      const horizonAlpha = this.horizonActorAlpha(prop.footY);
      const pulse = armed
        ? 0.94 + 0.10 * Math.sin(now / 85 + prop.footX * 0.04)
        : 0.97 + 0.03 * Math.sin(now / 320 + prop.footX * 0.04);

      view.container.zIndex = prop.footY;
      view.container.alpha = horizonAlpha;
      // 緑卵の光だまり(社長指示): プール済みの加算グロースプライト1枚だけ(per-frame Graphics 無し=軽い)。
      // 卵本体(sprite)は揺らさず、光(light)だけをフワフワ光らせて少し目立たせる。
      // α(明滅)と半径(伸縮)を別周期・位相で揺らし、機械的な明滅ではなく息づくような浮遊感にする
      // (追加スプライト無し=負荷は据え置き)。
      const eggGlowAlphaPulse = armed
        ? 0.55 + 0.45 * Math.sin(now / 110 + prop.footX * 0.05)
        : 0.6 + 0.4 * Math.sin(now / 360 + prop.footX * 0.05);
      const eggGlowSizePulse = armed
        ? 1 + 0.3 * Math.sin(now / 140 + prop.footX * 0.05 + 1.6)
        : 1 + 0.22 * Math.sin(now / 540 + prop.footX * 0.05 + 1.6);
      view.light.visible = horizonAlpha > 0;
      view.light.position.set(Math.round(prop.footX), Math.round(prop.footY - EGG_VISUAL_H * 0.35 * d));
      view.light.tint = armed ? 0xf87171 : 0x4ade80; // アーム=警告の赤 / 通常=毒の緑
      view.light.width = view.light.height = EGG_VISUAL_W * 2.6 * prop.scale * d * eggGlowSizePulse;
      view.light.alpha = (armed ? 0.4 : 0.34) * horizonAlpha * eggGlowAlphaPulse;
      view.reflection.visible = false;
      view.flame.clear();
      view.sprite.visible = !!tex && horizonAlpha > 0;
      if (tex) {
        view.sprite.texture = tex;
        view.sprite.position.set(Math.round(prop.footX), Math.round(prop.footY));
        view.sprite.scale.set(containScale(EGG_VISUAL_W * prop.scale, EGG_VISUAL_H * prop.scale, tex.width, tex.height) * d * pulse);
      }

      const o = view.overlay;
      o.clear();
      if (now - prop.lastHit < 90) {
        o.circle(Math.round(prop.footX), Math.round(prop.footY - EGG_VISUAL_H * 0.5 * d), Math.max(13, EGG_VISUAL_W * 0.7 * d))
          .fill({ color: 0xffffff, alpha: 0.28 });
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
      this.drawFlameShape(f, flameX, flameY, r, sway, prop.footX, prop.footY, now, torchAlpha);
    }

    const o = view.overlay;
    o.clear();
    if (now - prop.lastHit < 90) {
      o.circle(prop.footX, prop.footY - visualH * d * 0.48, Math.max(14, visualW * d * 0.45))
        .fill({ color: 0xffffff, alpha: 0.34 });
    }
  }

  // 松明/焚き火の炎の形そのもの(旧: drawBreakablePropに直書き)。火炎瓶(molotov)の地面の火
  // (syncGroundFires)からも同じ見た目を再利用するため、座標計算のみを外に出して共有する
  // (数式は元のtorch描画と完全に同一=見た目の変更なし)。呼び出し側で g.clear() 済みの Graphics
  // に加算描画する(g自体のblendMode='add'が前提)。emberAlphaMult=各要素の元コードのtorchAlpha相当。
  private drawFlameShape(
    g: Graphics, flameX: number, flameY: number, r: number, sway: number,
    seedX: number, seedY: number, now: number, emberAlphaMult: number,
  ) {
    g.circle(flameX, flameY + 3, r * 5.1).fill({ color: 0xff9f1c, alpha: 0.09 });
    g.ellipse(flameX + sway * 0.12, flameY - r * 0.6, r * 2.4, r * 4.4)
      .fill({ color: 0xff7a18, alpha: 0.22 });
    g.ellipse(flameX + sway * 0.36, flameY - r * 2.1, r * 1.45, r * 3.7)
      .fill({ color: 0xfbbf24, alpha: 0.34 });
    g.ellipse(flameX + sway * 0.55, flameY - r * 3.1, r * 0.72, r * 2.15)
      .fill({ color: 0xffedd5, alpha: 0.48 });
    g.circle(flameX + sway * 0.25, flameY - r * 0.35, r * 1.2)
      .fill({ color: 0xffffff, alpha: 0.28 });
    for (let i = 0; i < TORCH_EMBER_COUNT; i++) {
      const seed = seedX * 0.021 + seedY * 0.007 + i * 1.931;
      const rise = ((now / (760 + i * 73) + seed) % 1);
      const drift = Math.sin(now / (230 + i * 29) + seed * 9) * r * (0.9 + i * 0.12);
      const ex = flameX + drift;
      const ey = flameY - r * (1.7 + rise * 9.5);
      const emberAlpha = emberAlphaMult * Math.sin(rise * Math.PI) * (0.18 + (i % 3) * 0.05);
      const emberR = r * (0.22 + (i % 3) * 0.08);
      g.circle(ex, ey, emberR * 2.4).fill({ color: 0xff9f1c, alpha: emberAlpha * 0.28 });
      g.circle(ex, ey, emberR).fill({ color: i % 2 === 0 ? 0xfef3c7 : 0xfbbf24, alpha: emberAlpha });
    }
  }

  // ---- foot shadows (player + enemies) into one graphics -------------------

  // ソフト影スプライトを1体ぶん配置(光方向へ回転+伸縮)。drawDirectionalShadow の
  // 幾何(足元から direction へ length 伸ばす / 太さは断面)をスプライトで再現する。
  private placeShadowSprite(id: string, footX: number, footY: number, w: number, alpha: number, seen: Set<string>, tint = 0x000000, alphaMult = 1, flatSize?: { w: number; h: number }) {
    if (alpha <= 0) return;
    const lighting = this.lighting();
    // cine(?cine=1 & stage-7): 影を下方向・濃く・長く(太陽が上=地平のため。社長指示v0.25.1864)。
    const shAlpha = this.cineEnabled ? CINE_SHADOW_ALPHA : lighting.shadowAlpha;
    const shLength = this.cineEnabled ? CINE_SHADOW_LENGTH : lighting.shadowLength;
    // flatSize 指定時(裏ボス): 当たり判定と同じ大きさのフラットな楕円影。方向の伸びを付けず、
    // (footX, footY) を中心に w×h ちょうどへスケール(=影=当たり判定サイズ)。
    if (flatSize) {
      seen.add(id);
      let fsp = this.shadowPool.get(id);
      if (!fsp) {
        fsp = new Sprite(getSoftShadowTexture());
        fsp.anchor.set(0.5, 0.5);
        this.shadowContainer.addChild(fsp);
        this.shadowPool.set(id, fsp);
      }
      fsp.tint = tint;
      fsp.rotation = 0;
      fsp.width = Math.max(3, flatSize.w);
      fsp.height = Math.max(3, flatSize.h);
      fsp.alpha = Math.min(1, alpha * shAlpha * alphaMult);
      fsp.position.set(footX, footY);
      fsp.visible = true;
      return;
    }
    // ステージ2(lab)だけ影を右向きに(社長指示)。長さ/濃さは preset 据え置き。
    // cine: 太陽が上=地平のため、影は手前(下)へ落とす(社長指示v0.25.1864)。
    const dir = this.cineEnabled ? CINE_SHADOW_DIRECTION : this.isLabStage ? LAB_SHADOW_DIRECTION : lighting.direction;
    const mag = Math.hypot(dir.x, dir.y) || 1;
    const ux = dir.x / mag;
    const uy = dir.y / mag;
    const scale = Math.max(0.7, Math.min(1.55, w / 42));
    const length = shLength * scale;               // 光方向への伸び
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
    sp.alpha = Math.min(1, alpha * shAlpha * alphaMult);
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
    // フェーズA終端(landT=hf)でヘリが着地。着地後は着地位置で凍結(baseT=hf)し、HELI_SIT_MS だけ
    // その場ホバー → 残り時間で離陸(上昇+横ドリフト+フェード)。プレイヤーは乗せない(飛び降り廃止)。
    const hf = PLAYER_INTRO_HELI_FRAC;
    const baseT = Math.min(t, hf);                  // 着地後は着地位置で固定
    const base = this.introHeliBase(player, baseT); // ヘリ中心(world)+縮尺(着地で1)
    const takeoffStart = hf + HELI_SIT_MS / PLAYER_INTRO_MS;
    const depart = t <= takeoffStart ? 0 : Math.min(1, (t - takeoffStart) / (1 - takeoffStart));
    const dEase = depart * depart;
    // 離陸中は少し拡大して画面外へ抜ける感じ。
    const sc = baseSc * (base.scale + 0.35 * dEase);
    // 画像は左向きなので X 反転して右向きに(進行=右へ飛来)。
    this.helicopter.scale.set(-sc, sc);
    this.helicopter.position.set(
      base.cx + HELI_DRIFT_X * dEase,
      base.cy - HELI_RISE * dEase,
    );
    this.helicopter.rotation = 0.12 * dEase; // 離陸時に少し機体を傾ける
    this.helicopter.alpha = 1 - dEase;       // 上へ抜けながらフェード(終盤で消える)
    this.helicopter.visible = this.helicopter.alpha > 0.02;
  }

  // 登場演出のフェードイン量(0→1)。ヘリが飛び立つ(takeoffStart)までは0、その後フェードイン。
  // 登場中でなければ常に1。プレイヤー本体＋開始時から地面に居る護衛軍人(escorts=上下左右の4人)を
  // 同じタイミングで出すために共有する(社長指示:演出用の別NPCは出さず、既存の兵士をフェードインさせる)。
  private currentIntroFade(now: number): number {
    if (!this.introActive) return 1;
    const t = this.introUntil === -1
      ? 0
      : Math.max(0, Math.min(1, 1 - (this.introUntil - now) / PLAYER_INTRO_MS));
    const takeoffStart = PLAYER_INTRO_HELI_FRAC + HELI_SIT_MS / PLAYER_INTRO_MS;
    const f = t <= takeoffStart ? 0 : Math.min(1, (t - takeoffStart) / Math.max(0.001, (1 - takeoffStart) * 0.8));
    return f * f * (3 - 2 * f); // smoothstep
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
    projectiles: Projectile[],
    escorts: EscortSoldier[] = [],
    rescueSurvivors: RescueSurvivor[] = [],
    baseSites: BaseSite[] = [],
    now = 0
  ) {
    // ?shadow=0 診断(社長v0.25.1558): 全アクター足影オフ。既存のプール影を全破棄して以降1枚も置かない。
    if (ACTOR_SHADOWS_DISABLED) {
      if (this.shadowPool.size > 0) {
        for (const [id, sp] of this.shadowPool) { sp.destroy(); this.shadowPool.delete(id); }
      }
      return;
    }
    const seen = new Set<string>();
    // 登場演出中はプレイヤーが空中なので足影は出さない(着地後に出る)。
    if (!this.introActive) {
      const pf = playerFootBox(player);
      const playerFallbackW = pf.boxW * 0.55 * this.depthScale(pf.footY);
      const playerShadowW = actorShadowWidthFromSprite(this.playerView, playerFallbackW) * PLAYER_SHADOW_SCALE;
      this.placeShadowSprite('__player__', pf.footX, pf.footY - 2, playerShadowW, 1, seen);
    }
    for (const e of enemies) {
      const fb = enemyFootBox(e);
      const footY = e.y + e.height;
      const horizonAlpha = this.horizonActorAlpha(footY);
      if (horizonAlpha <= 0) continue;
      // 色付き個体は影を色で染める(青<紫<赤)。本体の見た目は変えない。
      const ct = e.colorTier ? ENEMY_COLOR_TIER_SHADOW[e.colorTier] : undefined;
      if (isHiddenBoss(e.type)) {
        // 裏ボスは絵が巨大で当たり判定(帯)と分離。帯の中心にフラット楕円(方向の伸びなし)で置く。
        // 当たり判定より一回り大きく見せ(×BOSS_SHADOW_SCALE)、色は鮮やかめの赤(社長指示)。
        this.placeShadowSprite(
          e.id, e.x + e.width / 2, e.y + e.height / 2, e.width, horizonAlpha, seen,
          BOSS_SHADOW_TINT, 1.9,
          { w: e.width * BOSS_SHADOW_SCALE, h: e.height * BOSS_SHADOW_SCALE },
        );
      } else {
        const fallbackW = fb.boxW * 0.55 * this.depthScaleEnemy(footY);
        const shadowW = actorShadowWidthFromSprite(this.enemies.get(e.id), fallbackW);
        this.placeShadowSprite(e.id, e.x + e.width / 2, footY - 2, shadowW, horizonAlpha, seen, ct?.tint ?? 0x000000, ct?.alphaMult ?? 1);
      }
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
    // 護衛軍人NPC(屋外のみ・他アクターと同じ足影)。スプライトは anchor(0.5,1) で esc.x/esc.y が足元。
    // 影幅=スプライト実幅×0.55(他アクターと同基準)。地平線で透明化(空に浮かない描画と整合)。
    // 登場演出中は兵士本体と同じフェードを影にも掛ける(ヘリ飛来中に影だけ先に出るのを防ぐ)。
    const escIntroFade = this.currentIntroFade(now);
    for (const esc of escorts) {
      const ha = this.horizonActorAlpha(esc.y) * escIntroFade;
      if (ha <= 0) continue;
      const escSp = this.escortSprites.get(esc.id);
      const escW = escSp && escSp.visible !== false ? Math.abs(escSp.width) : 0;
      const baseW = escW > 0 ? escW : 30 * this.depthScale(esc.y);
      this.placeShadowSprite('esc:' + esc.id, esc.x, esc.y - 2, baseW * 0.55, ha, seen);
    }
    // 救助NPC(rescueSurvivors)。足元=x+w/2, y+h(anchor 0.5,1)。退場(savedAt)フェードにも追従。
    for (const s of rescueSurvivors) {
      const fy = s.y + s.height;
      const ha = this.horizonActorAlpha(fy);
      if (ha <= 0) continue;
      const sp = this.rescueSurvivorSprites.get(s.id);
      const sw = sp && sp.visible !== false ? Math.abs(sp.width) : 0;
      const baseW = sw > 0 ? sw : 30 * this.depthScale(fy);
      const outroA = s.savedAt ? Math.max(0, 1 - (Date.now() - s.savedAt) / RESCUE_OUTRO_MS) : 1;
      this.placeShadowSprite('rescue:' + s.id, s.x + s.width / 2, fy - 2, baseW * 0.55, ha * outroA, seen);
    }
    // 拠点駐留兵(base soldiers・captured拠点のみ。現状 SUPP_BASE_ATTACKS_ENABLED=false で実体なしだが整合のため対応)。
    for (const bsite of baseSites) {
      for (let i = 0; i < bsite.soldiers.length; i++) {
        const sol = bsite.soldiers[i];
        const ha = this.horizonActorAlpha(sol.y);
        if (ha <= 0) continue;
        const sp = this.baseSoldierSprites.get(`${bsite.id}-${i}`);
        const sw = sp && sp.visible !== false ? Math.abs(sp.width) : 0;
        const baseW = sw > 0 ? sw : 30 * this.depthScale(sol.y);
        this.placeShadowSprite(`bsol:${bsite.id}-${i}`, sol.x, sol.y - 2, baseW * 0.55, ha, seen);
      }
    }
    // 拾い物(syncPickups が毎フレーム配列を作り直す)。
    for (const ps of this.pickupShadows) {
      this.placeShadowSprite(ps.id, ps.x, ps.y, ps.w, ps.alpha, seen);
    }
    // オブジェクト(木/壁/プロップ/city props)の常時足影。負荷キャップで「プレイヤーに近い順
    // OBJECT_SHADOW_MAX 個」だけに出す。順位が下のものほど rankFade で薄くし、境界(N位↔N+1位)の
    // 入れ替わりで影がパッと消えるポップを防ぐ。アクターと同じソフト方向影をプール経由で出す。
    {
      const pfb = playerFootBox(player);
      const cands: { id: string; x: number; y: number; w: number; d: number }[] = [];
      const addObj = (id: string, sx: number, fy: number, w: number) => {
        if (this.horizonActorAlpha(fy) <= 0) return; // 地平線際は出さない(空に浮かない描画と整合)
        const dx = sx - pfb.footX, dy = fy - pfb.footY;
        cands.push({ id, x: sx, y: fy, w, d: dx * dx + dy * dy });
      };
      // 木だけ他のオブジェクト(壁0.34/プロップ0.36)と違う固定係数(0.28・箱基準)で影が小さめだった
      // バグ修正: wallObjs/propObjsと同じ「実際の描画幅(containScale/depthScale込み)×係数」方式に統一。
      for (const [key, t] of this.trees) addObj('osh:tree:' + key, t.sprite.x, t.footY, Math.max(8, Math.abs(t.sprite.width) * 0.34));
      for (const [id, e] of this.wallObjs) addObj('osh:wall:' + id, e.sprite.x, e.footY, Math.max(8, Math.abs(e.sprite.width) * 0.34));
      for (const [id, e] of this.propObjs) addObj('osh:prop:' + id, e.sprite.x, e.footY, Math.max(8, Math.abs(e.sprite.width) * 0.36));
      for (const [id, e] of this.cityPropObjs) {
        if (e.sprite.parent === this.L.groundLayer) continue; // 地面デカールは影なし
        addObj('osh:city:' + id, e.sprite.x, e.footY, Math.max(8, Math.abs(e.sprite.width) * 0.36));
      }
      cands.sort((a, b) => a.d - b.d);
      const n = Math.min(OBJECT_SHADOW_MAX, cands.length);
      for (let i = 0; i < n; i++) {
        const c = cands[i];
        const rankFade = (OBJECT_SHADOW_MAX - i) / OBJECT_SHADOW_MAX; // 近い=濃い → 遠い=薄い
        this.placeShadowSprite(c.id, c.x, c.y - 2, c.w, this.horizonActorAlpha(c.y) * rankFade, seen);
      }
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
    // スケボー乗車中の板を本体スプライトの背面(=足の下)へ一度だけ親子付け。reticle(0) と sprite の間へ挿入。
    // アンカーY=0.43 は「デッキ中央の黒線」の位置(正方形テクスチャ内の実測)。ノーズ/テールは反って上へ跳ねる
    // ので上端(≒0.38)ではなく、この中央の黒線を足元(footY)へ合わせる=足がデッキ中央に乗る(社長指示)。
    if (!this.playerSkateboardAttached) {
      this.playerSkateboard.anchor.set(0.5, 0.43);
      this.playerSkateboard.visible = false;
      this.playerView.container.addChildAt(this.playerSkateboard, 1);
      this.playerSkateboardAttached = true;
    }
    // 近接スイングは3枚の画像(frame1=ダガー / frame2=ダガー+青スラッシュ / frame3=弧の残光)を
    // 差し替えて見せる(社長提供の3コマ化)。本体スプライトの前面に重ね、回転はせず左向きは水平ミラーのみ。
    if (!this.playerKnifeSetup) {
      const f1 = getTexture('knife-swing-1');
      const f2 = getTexture('knife-swing-2');
      const f3 = getTexture('knife-swing-3');
      if (f1 && f2 && f3) {
        this.playerKnife.texture = f1;
        this.playerKnife.anchor.set(0.5, 0.5);
        this.playerKnife.visible = false;
        this.playerView.container.addChild(this.playerKnife);          // 本体の前面
        this.playerKnifeSlash.texture = f2;
        this.playerKnifeSlash.anchor.set(0.5, 0.5);
        this.playerKnifeSlash.visible = false;
        this.playerView.container.addChild(this.playerKnifeSlash);     // ダガー(1枚目)の更に前面
        this.playerKnifeTrail.texture = f3;
        this.playerKnifeTrail.anchor.set(0.5, 0.5);
        this.playerKnifeTrail.visible = false;
        this.playerView.container.addChild(this.playerKnifeTrail);
        this.playerMeleeWpn.anchor.set(0.5, 0.5);
        this.playerMeleeWpn.visible = false;
        this.playerView.container.addChild(this.playerMeleeWpn); // 弧より前面=装備ナイフが手前
        this.playerKnifeSetup = true;
      }
    }
    // 救急鞄スキルの発動演出用スプライト(掲げる鞄)。テクスチャは独立ロードなので別ガードで親子付け。
    if (!this.playerFirstAidBagSetup) {
      const bagTex = getTexture('first-aid-kit');
      if (bagTex) {
        this.playerFirstAidBag.texture = bagTex;
        this.playerFirstAidBag.anchor.set(0.5, 0.5);
        this.playerFirstAidBag.visible = false;
        this.playerView.container.addChild(this.playerFirstAidBag); // 本体の前面(掲げる鞄)
        this.playerFirstAidBagSetup = true;
      }
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
        const slashFx = this.thorSlashFx.get(id);
        if (slashFx) { slashFx.destroy({ children: true }); this.thorSlashFx.delete(id); }
        const miguelFx = this.miguelSlashFx.get(id);
        if (miguelFx) { miguelFx.destroy({ children: true }); this.miguelSlashFx.delete(id); }
        const nameLabel = this.namedFoeLabels.get(id);
        if (nameLabel) { nameLabel.destroy(); this.namedFoeLabels.delete(id); }
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
  private syncSlasherRing(player: Player, realGameTime: number) {
    const g = this.slasherRingGfx;
    g.clear();
    const start = player.slasherRingStartAt;
    if (!start || start <= 0) return;
    const elapsed = realGameTime - start;
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

  // スカジの氷ハザード描画(判定はstore)。氷塊マーカー=赤いテレグラフ円の2秒フェードイン+氷塊スプライトせり上がり。
  // 氷刃=設置中は薄く方向表示→発射後はくっきり、常に向きへ回転。effectLayer=world座標。
  private syncSkadiHazards(
    markers: { id: string; x: number; y: number; bornAt: number; fireAt: number }[],
    blades: { id: string; x: number; y: number; angle: number; launched: boolean; visual?: 'ice' | 'bone' }[],
    gameTime: number,
  ) {
    const g = this.skadiHazardGfx;
    g.clear();
    const seen = new Set<string>();
    const pulse = 0.5 + 0.5 * Math.sin(gameTime / 110);
    for (const m of markers) {
      const total = Math.max(1, m.fireAt - m.bornAt);
      const t = Math.max(0, Math.min(1, (gameTime - m.bornAt) / total)); // 0→1 フェードイン
      const R = SKADI_ICE_RADIUS;
      // 赤いテレグラフ円(2秒でフェードイン)。社長指示v0.25.1612「赤の外=安全」: 当たり判定は世界座標の
      // 真円(半径R+自機半径)なので縦潰しをやめ真円(ry=R)で覆う(判定は不変)。
      g.ellipse(m.x, m.y, R, R).fill({ color: 0xff2a2a, alpha: 0.05 + 0.18 * t + 0.06 * pulse });
      g.ellipse(m.x, m.y, R, R).stroke({ width: 2, color: 0xff3b3b, alpha: 0.2 + 0.45 * t + 0.12 * pulse });
      // 氷塊スプライト(下からせり上がり)。
      const tex = getTexture('skadi-ice-block');
      if (tex) {
        seen.add(m.id);
        let sp = this.skadiBlockPool.get(m.id);
        if (!sp) { sp = new Sprite(tex); sp.anchor.set(0.5, 0.92); this.skadiHazardContainer.addChild(sp); this.skadiBlockPool.set(m.id, sp); }
        const sc = (R * 2.0 / Math.max(1, tex.height)) * (0.55 + 0.45 * t); // せり上がりで拡大
        sp.scale.set(sc);
        sp.position.set(m.x, m.y + 4);
        sp.alpha = 0.5 + 0.5 * t;
        sp.visible = true;
      }
    }
    // 氷刃(skadi)/骨刃(rafi=visual:'bone')は判定/挙動は同じ・見た目のテクスチャだけ差し替える(社長指示v0.25.1665)。
    const iceTex = getTexture('skadi-ice-blade');
    const boneTex = getTexture('rafi-blade');
    for (const b of blades) {
      const btex = b.visual === 'bone' ? boneTex : iceTex;
      if (!btex) continue;
      seen.add(b.id);
      let sp = this.skadiBladePool.get(b.id);
      if (!sp) { sp = new Sprite(btex); sp.anchor.set(0.5, 0.5); this.skadiHazardContainer.addChild(sp); this.skadiBladePool.set(b.id, sp); }
      if (sp.texture !== btex) sp.texture = btex; // 差し替え(プール再利用時の保険)
      sp.scale.set(80 / Math.max(btex.width, btex.height));
      sp.rotation = b.angle - (b.visual === 'bone' ? RAFI_BLADE_NATIVE_ANGLE : SKADI_BLADE_NATIVE_ANGLE); // 刃先を発射方向へ
      sp.position.set(b.x, b.y);
      sp.alpha = b.launched ? 1 : (0.4 + 0.2 * pulse); // 設置中は薄い予告→発射後くっきり
      sp.visible = true;
    }
    for (const [id, sp] of this.skadiBlockPool) { if (!seen.has(id)) { sp.destroy(); this.skadiBlockPool.delete(id); } }
    for (const [id, sp] of this.skadiBladePool) { if (!seen.has(id)) { sp.destroy(); this.skadiBladePool.delete(id); } }
  }

  // 火炎瓶(molotov)の地面の火。lifetime/DoTは gameStore(groundFires/tickGroundFires)側の仕事、
  // ここは配列を読んで松明と同じ炎(drawFlameShape)+小さめの暖色ライトを描くだけ(Pixiは描画専門)。
  // 同時に生きるのは最大3〜4個程度(仕様上の上限)なので、松明と同じ per-id プール(Graphics/Sprite)で十分軽い。
  private syncGroundFires(fires: GroundFire[], now: number) {
    const seen = new Set<string>();
    for (const fire of fires) {
      seen.add(fire.id);
      let view = this.groundFireViews.get(fire.id);
      if (!view) { view = this.makeGroundFireView(); this.groundFireViews.set(fire.id, view); }

      const d = this.depthScale(fire.y);
      const horizonAlpha = this.horizonActorAlpha(fire.y);
      const viewportDistance = this.distanceOutsideViewport(fire.x, fire.y, GROUND_FIRE_VIEWPORT_MARGIN);
      const visible = viewportDistance <= 0 && horizonAlpha > 0;

      view.container.zIndex = fire.y;
      view.container.visible = visible;
      view.container.alpha = horizonAlpha;
      view.light.visible = visible;
      if (!visible) { view.flame.clear(); continue; }

      // 揺らぎ/形は松明(drawBreakableProp)と同じ式を再利用(見た目の一貫性)。
      const pulse = 0.80 + 0.13 * Math.sin(now / 125 + fire.x * 0.03) + 0.07 * Math.sin(now / 53 + fire.y * 0.05);
      const r = GROUND_FIRE_FLAME_R * d * pulse;
      const sway = Math.sin(now / 160 + fire.x * 0.015) * r * 0.55;
      const flameX = Math.round(fire.x);
      const flameY = Math.round(fire.y);

      view.light.position.set(fire.x, fire.y);
      view.light.tint = 0xffb45f;
      view.light.width = view.light.height = GROUND_FIRE_LIGHT_RADIUS * d * pulse;
      view.light.alpha = 0.16 * horizonAlpha * pulse;

      view.flame.clear();
      this.drawFlameShape(view.flame, flameX, flameY, r, sway, fire.x, fire.y, now, horizonAlpha);
    }
    for (const [id, view] of this.groundFireViews) {
      if (!seen.has(id)) {
        view.light.destroy();
        view.container.destroy({ children: true });
        this.groundFireViews.delete(id);
      }
    }
  }

  // フレアガン(flare-gun・§6.6 M29)の火炎弾。飛翔(発射点→着弾点の直線+小さな山なりの見た目)→
  // 着弾中3秒は molotov の地面の火と同じ炎(makeGroundFireView/drawFlameShape 流用・ダメージ無し版)。
  // 引き付け判定は sim 側(activeFlareTargets→resolveEnemyTarget)。ここは s.flareGunFlares を読んで
  // 描くだけ(CLAUDE.md「PixiJSは描画のみ」)。同時1〜2個+per-idプールで軽い。強glowは使わない。
  private syncFlareGun(flares: FlareGunFlare[], gameTime: number, now: number) {
    const seen = new Set<string>();
    for (const f of flares) {
      seen.add(f.id);
      let view = this.flareGunViews.get(f.id);
      if (!view) { view = this.makeGroundFireView(); this.flareGunViews.set(f.id, view); }

      // 位置: 飛翔中は発射点→着弾点を補間し、小さな山なり(見た目のみ)を付ける。着弾後は着弾点固定。
      const flying = gameTime < f.landAt;
      const ft = flying ? Math.max(0, Math.min(1, (gameTime - f.firedAt) / Math.max(1, f.landAt - f.firedAt))) : 1;
      const fx = f.fromX + (f.x - f.fromX) * ft;
      const fy = f.fromY + (f.y - f.fromY) * ft - (flying ? Math.sin(Math.PI * ft) * 36 : 0);

      const d = this.depthScale(fy);
      const horizonAlpha = this.horizonActorAlpha(fy);
      const viewportDistance = this.distanceOutsideViewport(fx, fy, GROUND_FIRE_VIEWPORT_MARGIN);
      // 着弾直前〜終了400msはフェードアウト(ぶつ切り消滅を避ける・見た目のみ)。
      const lifeFade = Math.max(0, Math.min(1, (f.until - gameTime) / 400));
      const visible = viewportDistance <= 0 && horizonAlpha > 0 && lifeFade > 0;

      view.container.zIndex = fy;
      view.container.visible = visible;
      view.container.alpha = horizonAlpha * lifeFade;
      view.light.visible = visible;
      if (!visible) { view.flame.clear(); continue; }

      // 揺らぎ/形は molotov の地面の火(syncGroundFires)と同じ式を再利用。飛翔中は小さめの火。
      // 全体を2/3スケール(社長指示v0.25.1698「フレアガンの火の描写を2/3の大きさに」・見た目のみ=
      // 引き付け範囲や判定は不変)。
      const pulse = 0.80 + 0.13 * Math.sin(now / 125 + f.x * 0.03) + 0.07 * Math.sin(now / 53 + f.y * 0.05);
      const FLARE_VISUAL_SCALE = 2 / 3;
      const sizeMult = (flying ? 0.6 : 1) * FLARE_VISUAL_SCALE;
      const r = GROUND_FIRE_FLAME_R * d * pulse * sizeMult;
      const sway = flying ? 0 : Math.sin(now / 160 + f.x * 0.015) * r * 0.55;

      view.light.position.set(fx, fy);
      view.light.tint = 0xffb45f;
      view.light.width = view.light.height = GROUND_FIRE_LIGHT_RADIUS * d * pulse * sizeMult;
      view.light.alpha = 0.16 * horizonAlpha * pulse * lifeFade;

      view.flame.clear();
      this.drawFlameShape(view.flame, Math.round(fx), Math.round(fy), r, sway, f.x, f.y, now, horizonAlpha * lifeFade);
    }
    for (const [id, view] of this.flareGunViews) {
      if (!seen.has(id)) {
        view.light.destroy();
        view.container.destroy({ children: true });
        this.flareGunViews.delete(id);
      }
    }
  }

  // ジブリルのランタン火(社長指示v0.25.1664): molotovと違い「プレイヤーに」当たるボスハザード。
  // 予告(spawnAt→activateAt=0.7s)=赤い当たり判定フェードイン / 有効(activateAt→expireAt=2s)=紫の火。
  // 判定/寿命は useGameLoop 側。ここは s.bossFires を直読みして1枚のGraphicsへ一括描画(数個・一過性=軽い)。
  private syncBossFires(fires: BossFire[], gameTime: number, now: number) {
    const g = this.bossFireGfx;
    if (!g.parent) { g.blendMode = 'add'; this.L.groundLayer.addChild(g); }
    g.clear();
    if (fires.length === 0) return;
    const HITR = 22;   // 当たり半径(=useGameLoop JIBRIL_FIRE_RADIUS)。予告円をこれに合わせる。
    const FLAMER = 14; // 火の基準サイズ(火炎瓶相当)。
    for (const f of fires) {
      if (gameTime >= f.expireAt) continue;
      if (gameTime < f.activateAt) {
        // 予告=赤い当たり判定フェードイン(社長指示「0.7秒で発動」)。
        const p = Math.max(0, Math.min(1, (gameTime - f.spawnAt) / Math.max(1, f.activateAt - f.spawnAt)));
        g.circle(f.x, f.y, HITR).fill({ color: 0xff2a2a, alpha: 0.08 + 0.20 * p });
        g.circle(f.x, f.y, HITR).stroke({ width: 2, color: 0xff3b3b, alpha: 0.35 + 0.4 * p });
      } else {
        // 有効=紫の火(色は紫・大きさは火炎瓶相当)。終盤フェードアウト。
        const life = Math.max(0, Math.min(1, 1 - (gameTime - f.activateAt) / Math.max(1, f.expireAt - f.activateAt)));
        const pulse = 0.82 + 0.18 * Math.sin(now / 90 + f.x * 0.05) + 0.08 * Math.sin(now / 47 + f.y * 0.06);
        const r = FLAMER * pulse;
        const a = 0.55 + 0.45 * life;
        const sway = Math.sin(now / 150 + f.x * 0.02) * r * 0.5;
        g.circle(f.x, f.y + 2, r * 3.2).fill({ color: 0x7c3aed, alpha: 0.10 * life });           // 外周グロウ
        g.ellipse(f.x + sway * 0.2, f.y - r * 0.6, r * 1.7, r * 3.0).fill({ color: 0x7e22ce, alpha: 0.26 * a });
        g.ellipse(f.x + sway * 0.4, f.y - r * 1.4, r * 1.0, r * 2.4).fill({ color: 0xa855f7, alpha: 0.40 * a });
        g.ellipse(f.x + sway * 0.5, f.y - r * 2.0, r * 0.5, r * 1.5).fill({ color: 0xe9d5ff, alpha: 0.50 * a });
      }
    }
  }

  // センサー地雷(sensor-mine): 待機=暗色の小型ディスク+琥珀ランプの明滅 / 感知後2秒=赤点滅テレグラフ
  // (爆発範囲の赤円+ランプ赤点滅)。ジブリル火(syncBossFires)と同系の「共有Graphics1枚へ一括描画」方式
  // (同時最大5個+小プリミティブ数個=軽い。新規の強glowは使わない)。設置/感知/起爆の判定は sim 側
  // (gameStore/useGameLoop)が担い、ここは s.sensorMines を読んで描くだけ(CLAUDE.md「PixiJSは描画のみ」)。
  private syncSensorMines(mines: SensorMineState[], gameTime: number, now: number) {
    const g = this.sensorMineGfx;
    if (!g.parent) this.L.groundLayer.addChild(g);
    g.clear();
    if (mines.length === 0) return;
    for (const m of mines) {
      // 画面外はスキップ(distanceOutsideViewport はズーム引き(CONTEXT_ZOOM_MIN)込みの可視域で判定)。
      if (this.distanceOutsideViewport(m.x, m.y, SENSOR_MINE_RADIUS + 40) > 0) continue;
      // 本体: 地面に置いた小型ディスク(楕円=接地感)+外周リム。
      g.ellipse(m.x, m.y, 7, 4.6).fill({ color: 0x1f2937, alpha: 0.92 });
      g.ellipse(m.x, m.y, 7, 4.6).stroke({ width: 1.5, color: 0x475569, alpha: 0.9 });
      if (m.triggeredAt <= 0) {
        // 待機: 琥珀ランプがゆっくり明滅(視認用の控えめな存在表示)。
        const lampPulse = 0.5 + 0.5 * Math.sin(now / 420 + m.x * 0.05);
        g.circle(m.x, m.y - 2, 1.7).fill({ color: 0xfbbf24, alpha: 0.35 + 0.5 * lampPulse });
      } else {
        // 感知→起爆(2秒): 赤点滅テレグラフ。ランプ赤点滅+爆発範囲の赤円(ジブリル火の予告と同系の見せ方)。
        const blinkOn = Math.floor((gameTime - m.triggeredAt) / 90) % 2 === 0;
        const p = Math.max(0, Math.min(1, (gameTime - m.triggeredAt) / SENSOR_MINE_FUSE_MS));
        g.circle(m.x, m.y - 2, 2.4).fill({ color: 0xff3b3b, alpha: blinkOn ? 0.95 : 0.25 });
        g.circle(m.x, m.y, SENSOR_MINE_RADIUS).fill({ color: 0xff2a2a, alpha: (blinkOn ? 0.10 : 0.04) + 0.08 * p });
        g.circle(m.x, m.y, SENSOR_MINE_RADIUS).stroke({ width: 2, color: 0xff3b3b, alpha: (blinkOn ? 0.5 : 0.2) + 0.25 * p });
      }
    }
  }

  // スキル 救難信号: 近接ヒットで一定確率で発生する援護アライ(プレイヤーと別クラスの立ち絵)。
  // 背後(fromX/fromY)→対象の発生時点位置(targetX/Y/FootY・固定)→背後、のジャンプ飛来を描く一過性演出
  // (当たり判定なし)。着地位置は発生時点で固定=生きた敵の座標は参照しない(着地後は敵を追わない=張り付かない・
  // 社長指示v0.25.1615)。ダメージ適用/寿命はsim側(gameStore.tickRescueAllies)が担い、ここは rescueAllies を
  // 読んで位置を補間するだけ(CLAUDE.md「PixiJSは描画のみ」)。同時に生きるのは基本1体程度なのでper-idプールで十分軽い。
  private syncRescueAllies(allies: RescueAlly[], player: Player, gameTime: number) {
    const seen = new Set<string>();
    for (const a of allies) {
      seen.add(a.id);
      let v = this.rescueAllyViews.get(a.id);
      if (!v) {
        const body = new Sprite();
        body.anchor.set(0.5, 1); // foot-centre(プレイヤー本体と同じ規約)
        this.L.actorLayer.addChild(body);
        // 近接スイング3枚(焼き込みダガー frame1/2/3)。分身 syncShadowClone と同じ差し替え方式。
        const mk = (texName: string) => {
          const s = new Sprite();
          const t = getTexture(texName);
          if (t) s.texture = t;
          s.anchor.set(0.5, 0.5);
          s.visible = false;
          this.L.actorLayer.addChild(s);
          return s;
        };
        v = { body, knife: mk('knife-swing-1'), slash: mk('knife-swing-2'), trail: mk('knife-swing-3') };
        this.rescueAllyViews.set(a.id, v);
      }
      const { body, knife, slash, trail } = v;
      // クラス→立ち絵テクスチャは既存のplayerTextureNameをそのまま流用(クラスID↔ファイル名の対応=
      // mage→magnum/warrior→shotgun/necromancer→striker/rogue→scavengerを手書きしない・CLAUDE.md注意点)。
      // equipment を空に(ALLY_PLAIN_EQUIP): 援護射撃NPCと同根のバグ(武将フル装備中は武将絵が優先されて
      // klass 差し替えが無視される)をここでも塞ぐ(v0.25.1726)。
      const fakeAlly = { ...player, characterClass: a.klass, equipment: ALLY_PLAIN_EQUIP };
      const name = playerTextureName(fakeAlly, 0, false);
      const tex = getTexture(name) ?? getTexture('player');
      if (!tex) { body.visible = false; knife.visible = false; slash.visible = false; trail.visible = false; continue; }

      // 着地位置は発生時点で固定(社長指示v0.25.1615「着地後は移動しない=敵に張り付かない」)。生きた敵の
      // 座標は参照せず、発生時点の中心(targetX/Y)と足元(targetFootY)を使う=敵が動いても追従しない。
      const tx = a.targetX;
      const ty = a.targetY;
      // 着地は「敵より前面(手前=描画で上)」に取る(社長指示v0.25.1614): 敵の足元(bottom)より少し手前(下)へ。
      // footY を敵の足元より大きくすると actorLayer の y-sort で敵の上に描かれる。
      const efy = a.targetFootY; // 敵の足元(world Y・発生時点で固定)
      const landX = tx;
      const landY = efy + RESCUE_ALLY_FRONT_MARGIN;

      // 進行方向(往路)=飛び込む向き。左右反転/近接の振り向き/バックジャンプの向きに使う(離脱中も反転させない
      // =敵を向いたまま後ろへ跳ぶ=バックジャンプ)。
      const facingLeft = landX < a.fromX;
      const mir = facingLeft ? -1 : 1;

      // フェーズ境界(elapsed=gameTime-spawnedAt)。ダメージ/近接は strikeAt で発火(tickRescueAlliesと一致)。
      const elapsed = gameTime - a.spawnedAt;
      const strikeAt = RESCUE_ALLY_FLYIN_MS + RESCUE_ALLY_ARRIVE_HOLD_MS;
      const swingEnd = strikeAt + RESCUE_ALLY_ATTACK_MS;         // 近接モーション終わり
      const crouchStart = swingEnd + RESCUE_ALLY_POST_HOLD_MS;   // モーション後の一拍の終わり=しゃがみ始め
      const backjumpStart = crouchStart + RESCUE_ALLY_CROUCH_MS; // しゃがみ終わり=バックジャンプ開始

      // ボディ絵の差し替え(社長指示v0.25.1629「ジャンプ着地でしゃがみ絵→切り付けのモーション徹底」):
      // 救援アライもプレイヤー本体と同じクラス別近接ポーズを使う。着地の一拍(ARRIVE_HOLD)=構え(=しゃがみ・
      // -ready)、着弾の近接モーション(ATTACK)=振り抜き(=切り付け・-swing)。素材は待機絵と同じ幅86pxで
      // 焼いてあるので playerBaseScale(幅基準)は不変=足位置/スケールは崩れない。ポーズを持たないクラスは
      // 従来どおり待機絵にフォールバック(?? tex)。
      let bodyTex = tex;
      const meleePosePrefix = MELEE_POSE_PREFIX[a.klass];
      if (meleePosePrefix) {
        if (elapsed >= RESCUE_ALLY_FLYIN_MS && elapsed < strikeAt) {
          bodyTex = getTexture(`${meleePosePrefix}-ready`) ?? tex; // 着地=しゃがみ(構え)
        } else if (elapsed >= strikeAt && elapsed < swingEnd) {
          bodyTex = getTexture(`${meleePosePrefix}-swing`) ?? tex; // 切り付け(振り抜き)
        } else if (elapsed >= crouchStart && elapsed < backjumpStart) {
          bodyTex = getTexture(`${meleePosePrefix}-ready`) ?? tex; // バックジャンプ前のしゃがみ=構え絵(社長指示v0.25.1654)
        }
      }
      let footX: number, footY: number, hop = 0, alpha = 1, jumpStretch = 1;
      if (elapsed < RESCUE_ALLY_FLYIN_MS) {
        // 飛来=放物線ジャンプ(慣性つき): 水平 ease-out(勢いよく出て着地で減速)+垂直 sin1山のホップ。
        const t = Math.max(0, Math.min(1, elapsed / RESCUE_ALLY_FLYIN_MS));
        const ex = 1 - (1 - t) * (1 - t);
        footX = a.fromX + (landX - a.fromX) * ex;
        footY = a.fromY + (landY - a.fromY) * ex;
        hop = Math.sin(Math.PI * t) * RESCUE_ALLY_HOP_PX;
        jumpStretch = 1 + 0.12 * Math.sin(Math.PI * t);
      } else if (elapsed < crouchStart) {
        // 着地→登場一拍→着弾&近接モーション→モーション後の一拍。敵前面で静止。
        footX = landX; footY = landY;
      } else if (elapsed < backjumpStart) {
        // バックジャンプ前のしゃがみ=クラス別しゃがみ絵(-ready)に差し替え済み(社長指示v0.25.1654)。
        // 旧: スクワッシュ(縦潰し)の仮表現。しゃがみ絵を使うので縦潰し(crouchSqX/Y)は掛けない(二重しゃがみ防止)。
        footX = landX; footY = landY;
      } else {
        // バックジャンプ=しゃがみを解いて背後(fromX/Y)へ跳ね戻る(敵を向いたまま後ろへ)。往路より速い放物線。
        const t = Math.max(0, Math.min(1, (elapsed - backjumpStart) / RESCUE_ALLY_FLYOUT_MS));
        const ez = t * t; // ease-in(引くように離脱)
        footX = landX + (a.fromX - landX) * ez;
        footY = landY + (a.fromY - landY) * ez;
        hop = Math.sin(Math.PI * t) * RESCUE_ALLY_HOP_PX;
        jumpStretch = 1 + 0.16 * Math.sin(Math.PI * Math.min(1, t * 1.6)); // 踏み切りの伸び
        alpha = 1 - t * 0.6;
      }

      // 近接モーション(着弾=strikeAt で発火・本体/分身と同じ3枚差し替え+踏み込み二次モーション)。
      const meleeSince = gameTime - (a.spawnedAt + strikeAt);
      const swinging = meleeSince >= 0 && meleeSince < RESCUE_ALLY_ATTACK_MS;
      const dsc = this.depthScale(footY);
      let offX = 0, offY = 0, lean = 0, sqX = 1, sqY = 1;
      if (swinging) {
        const am = Math.hypot(tx - a.fromX, ty - a.fromY) || 1;
        const aimx = (tx - a.fromX) / am, aimy = (ty - a.fromY) / am; // 踏み込みは往路方向(飛び込んで斬る)
        const tt = meleeSince / RESCUE_ALLY_ATTACK_MS;
        const arc = Math.sin(tt * Math.PI);
        const whip = 1 - tt;
        offX += aimx * PLAYER_MELEE_LUNGE_PX * arc * dsc;
        offY += aimy * PLAYER_MELEE_LUNGE_PX * arc * dsc;
        lean += mir * PLAYER_MELEE_LEAN_RAD * whip;
        sqX *= 1 + PLAYER_MELEE_STRETCH * arc;
        sqY *= 1 - PLAYER_MELEE_STRETCH * 0.6 * arc;
      }

      const boxW = PLAYER_HITBOX * PLAYER_VISUAL_SCALE;
      const boxH = PLAYER_HITBOX * PLAYER_VISUAL_SCALE;
      const baseScale = playerBaseScale(fakeAlly, bodyTex, boxW, boxH);
      const sc = this.snapTexelScale(baseScale * dsc); // 本体と同じピクセルスナップ(案1)
      const bx = this.snapToScreenPixel(footX, this.L.world.position.x) + offX;
      const by = this.snapToScreenPixel(footY - hop, this.L.world.position.y) + offY;
      body.texture = bodyTex;
      body.scale.set((facingLeft ? -sc : sc) * sqX, sc * jumpStretch * sqY);
      body.rotation = lean;
      body.position.set(bx, by);
      body.zIndex = footY; // 他アクターと足元Yでy-sort
      body.alpha = alpha;
      body.visible = true;

      // 近接スイング3枚オーバーレイ(分身 syncShadowClone と同一ロジック=本体と同じ見た目。救援アライは
      // 装備武器を持たないので常に焼き込みダガー frame1/2/3 を差し替える)。
      if (swinging) {
        const kt = meleeSwingEase(meleeSince / RESCUE_ALLY_ATTACK_MS);
        const unit = boxH * dsc;
        const baseX = bx; // 本体の踏み込みオフセットを引き継ぐ
        const baseY = this.snapToScreenPixel(footY - hop - boxH * 0.5 * dsc, this.L.world.position.y) + offY; // 胸あたり
        const zc = footY + 0.5; // 本体のすぐ前面
        const place = (s: Sprite, cfg: { scale: number; ox: number; oy: number }, vis: boolean, al: number) => {
          if (!vis || !s.texture || s.texture.width === 0) { s.visible = false; return; }
          const scl = (unit * cfg.scale) / s.texture.width;
          s.scale.set(mir * scl, scl); // 左向き=水平ミラー(回転なし)
          s.position.set(baseX + mir * cfg.ox * unit, baseY + cfg.oy * unit);
          s.zIndex = zc;
          s.alpha = al * alpha;
          s.visible = s.alpha > 0.01;
        };
        if (kt < KNIFE_SWING_SWITCH) {
          const a1 = Math.min(1, kt / (KNIFE_SWING_SWITCH * 0.5));
          place(knife, KNIFE_F1, true, a1); // 振りかぶり(ダガー)
          place(slash, KNIFE_F2, false, 0);
          place(trail, KNIFE_F3, false, 0);
        } else if (kt < KNIFE_SWING_SWITCH2) {
          const t2 = (kt - KNIFE_SWING_SWITCH) / (KNIFE_SWING_SWITCH2 - KNIFE_SWING_SWITCH);
          const a2 = Math.min(1, t2 / 0.25);
          place(knife, KNIFE_F1, false, 0);
          place(slash, KNIFE_F2, true, a2); // 振り抜き(弧)
          place(trail, KNIFE_F3, false, 0);
        } else {
          const t3 = (kt - KNIFE_SWING_SWITCH2) / (1 - KNIFE_SWING_SWITCH2);
          place(knife, KNIFE_F1, false, 0);
          place(slash, KNIFE_F2, false, 0);
          place(trail, KNIFE_F3, true, 1 - t3); // 弧の残光フェード
        }
      } else {
        knife.visible = false; slash.visible = false; trail.visible = false;
      }
    }
    for (const [id, v] of this.rescueAllyViews) {
      if (!seen.has(id)) {
        v.body.destroy(); v.knife.destroy(); v.slash.destroy(); v.trail.destroy();
        this.rescueAllyViews.delete(id);
      }
    }
  }

  // 救急鞄(first-aid-kit): 空鞄投擲(一過性)。プレイヤー(fromX/Y)→対象敵(targetEnemyIdが生存中なら
  // その現在地・消えていればtargetX/Yへのフォールバック)への直線飛行をスプライト1枚で描くだけの
  // 演出(当たり判定なし)。ダメージ適用/寿命はsim側(gameStore.tickThrownBags)が担い、ここは
  // thrownBagsを読んで位置を補間するだけ(CLAUDE.md「PixiJSは描画のみ」)。1ラン1回の使い切りで
  // 同時に生きるのは常に0-1体なのでper-idプールで十分軽い(強glowなし・pooled sprite 1枚)。
  private syncThrownBags(bags: ThrownBag[], enemies: Enemy[], gameTime: number) {
    const seen = new Set<string>();
    for (const b of bags) {
      seen.add(b.id);
      let spr = this.thrownBagViews.get(b.id);
      if (!spr) {
        spr = new Sprite();
        spr.anchor.set(0.5);
        this.L.frontObjectLayer.addChild(spr);
        this.thrownBagViews.set(b.id, spr);
      }
      const tex = getTexture('first-aid-kit');
      if (!tex) { spr.visible = false; continue; } // テクスチャ未読込時は何も描かない(グレースフルにスキップ)

      const target = enemies.find(e => e.id === b.targetEnemyId);
      const tx = target ? target.x + target.width / 2 : b.targetX;
      const ty = target ? target.y + target.height / 2 : b.targetY;

      // elapsed は gameTime(sim clock)基準。tickThrownBags のダメージ適用タイミングと必ず一致させる。
      const elapsed = gameTime - b.spawnedAt;
      const t = Math.max(0, Math.min(1, elapsed / THROWN_BAG_FLIGHT_MS));
      const ease = 1 - (1 - t) * (1 - t); // ease-out(投げ込む勢い。rescueAllyの飛来フェーズと同じ考え方)
      const x = b.fromX + (tx - b.fromX) * ease;
      const y = b.fromY + (ty - b.fromY) * ease;

      const sc = THROWN_BAG_SPRITE_WIDTH / tex.width;
      spr.texture = tex;
      spr.scale.set(sc);
      spr.rotation = t * Math.PI; // 投げ物らしい回転(叩き台・半回転)
      spr.position.set(
        this.snapToScreenPixel(x, this.L.world.position.x),
        this.snapToScreenPixel(y, this.L.world.position.y),
      );
      spr.visible = true;
    }
    for (const [id, spr] of this.thrownBagViews) {
      if (!seen.has(id)) { spr.destroy(); this.thrownBagViews.delete(id); }
    }
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
      o.rect(bx, by, s.width, 3).fill({ color: 0x000000, alpha: BAR_BG_ALPHA });
      o.rect(bx, by, s.width * frac, 3).fill({ color: STATUS_ALLY });
    }
  }

  private drawPlayer(view: ActorView, p: Player, gameTime: number, now: number) {
    const fb = playerFootBox(p);
    // スケボー乗車中は歩きアニメを止める(社長指示): 待機フレームで板に立つ。歩行の上下バウンド(bob)/
    // スカッシュ/踏み込みリーンも walking=false で自動的に止まる。
    const walking = p.isMoving && p.direction !== 'idle' && !p.skaterRiding;
    // 走りモーション: 移動レバー(swipeStrength)を目一杯倒している時だけ(マークスマン先行実装)。
    const running = walking && useGameStore.getState().swipeStrength >= PLAYER_RUN_SWIPE_THRESHOLD;
    const frame = playerWalkFrame(p, now, walking, running);
    // 武将セット(特殊3点)フル装備時は立ち絵を差し替え。小烏丸(村雨)も装備していれば刀バージョン、
    // 揃っていなければ通常クラス絵へ戻す。立ち絵は高さ基準で正規化する(刀が横に伸びても体の大きさを保つ)。
    const warlordFull = hasFullWarlordSet(p.equipment);
    const textureName = playerTextureName(p, frame, walking, running);
    const tex = getTexture(textureName) ?? getTexture('player');
    view.sprite.texture = tex ?? view.sprite.texture;
    const walkCycle = running && usesRunAnimation(p) ? PLAYER_RUN_CYCLE_MS : playerWalkCycleMs(p);
    const phase = walking ? (now / walkCycle) * Math.PI * 2 : 0;
    const step = Math.sin(phase);
    const bob = walking && PLAYER_MOTION_FX ? Math.abs(step) * PLAYER_WALK_BOB_PX * this.depthScale(fb.footY) : 0;
    // 徒歩の自然化(3コマの上に重ねる連続モーション・視覚のみ): 接地(lift=0)で縦に潰れて横に広がり、
    // 遊脚の最高点(lift=1)で縦に伸びて横が締まる(スカッシュ&ストレッチ)＋足元支点の左右リーン(体重移動)。
    let walkSqX = 1, walkSqY = 1, walkLean = 0;
    if (walking && PLAYER_MOTION_FX) {
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
    if (gun && PLAYER_MOTION_FX) {
      const sinceFire = now - (gun.lastFired || 0);
      if (sinceFire >= 0 && sinceFire < PLAYER_FIRE_RECOIL_MS) {
        const e = 1 - sinceFire / PLAYER_FIRE_RECOIL_MS;
        actOffX -= aimx * PLAYER_FIRE_RECOIL_PX * e * dsc;
        actOffY -= aimy * PLAYER_FIRE_RECOIL_PX * e * dsc;
        actSqY *= 1 - PLAYER_FIRE_RECOIL_SQUASH * e;
      }
    }
    // 近接スイング: 狙い方向へ踏み込み(踏込→振抜→復帰のアーク)＋振り抜きの傾き＋横ストレッチ。
    // §5.22-追補(社長決定v0.25.1536): KILL/カウンターのFREEZE→RELEASEスロー演出が有効な間は、
    // スイングの表示窓を既定280msからスロー終了時刻まで伸ばす(=スロー中に振りが消えて棒立ちに
    // 見える不具合を解消)。通常時(スロー無し)は既定どおり280ms・振り自体の判定/攻撃レートは不変
    // (描画のみ)。ヒットストップ中はnow自体が凍結される(hitstopFreezeNow)ため振りも一緒に止まり、
    // 解除後はスロー速度で続き=「フリーズ→スロー継続」の1拍に自然に乗る。
    const juiceSlowUntil = useGameStore.getState().timeSlowUntil;
    const swingWindowMs = juiceSlowUntil > now
      ? Math.max(PLAYER_MELEE_SWING_MS, juiceSlowUntil - (p.meleeSwingAt || 0))
      : PLAYER_MELEE_SWING_MS;
    const sinceSwing = now - (p.meleeSwingAt || 0);
    // 近接専用ポーズを持つクラス(スカベンジャー=necromancer/マークスマン=mage・社長提供素材)は近接スイング中に
    // 本体を差し替える。構え→振り抜きをスイング進行 kt=MELEE_POSE_READY_FRAC で切替。専用ポーズは各クラスの待機絵と
    // 同じ幅86px・足元下端で焼いてあるので描画スケール/足位置は不変(playerBaseScaleは幅基準)。
    const meleePosePrefix = MELEE_POSE_PREFIX[p.characterClass];
    // 救急鞄スキル発動の一拍(振り抜きポーズ+鞄掲げ)。近接スイングとは別トリガー(firstAidPoseAt)。
    const sinceFirstAid = now - (p.firstAidPoseAt || 0);
    const firstAidActive = p.firstAidPoseAt > 0 && sinceFirstAid >= 0 && sinceFirstAid < PLAYER_FIRSTAID_POSE_MS;
    if (meleePosePrefix && !warlordFull && p.meleeSwingAt > 0 && sinceSwing >= 0 && sinceSwing < swingWindowMs) {
      const poseTex = getTexture((sinceSwing / swingWindowMs) < MELEE_POSE_READY_FRAC
        ? `${meleePosePrefix}-ready` : `${meleePosePrefix}-swing`);
      if (poseTex) view.sprite.texture = poseTex;
    } else if (meleePosePrefix && !warlordFull && firstAidActive) {
      // 救急鞄発動: 本体を振り抜き絵(-swing)へ差し替え(社長指示v0.25.1656)。近接スイング中はそちら優先。
      const poseTex = getTexture(`${meleePosePrefix}-swing`);
      if (poseTex) view.sprite.texture = poseTex;
    }
    if (PLAYER_MOTION_FX && p.meleeSwingAt > 0 && sinceSwing >= 0 && sinceSwing < swingWindowMs) {
      const t = sinceSwing / swingWindowMs;
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
    if (PLAYER_MOTION_FX && p.lastCounterSuccessTime > 0 && sinceCounter >= 0 && sinceCounter < PLAYER_COUNTER_MS) {
      const pop = (1 - sinceCounter / PLAYER_COUNTER_MS) ** 2; // 速い減衰
      actSqX *= 1 + PLAYER_COUNTER_POP * pop;
      actSqY *= 1 + PLAYER_COUNTER_POP * pop;
      actLean += face * PLAYER_COUNTER_LEAN_RAD * pop;
    }
    // リロード中: 手元作業の小刻みな上下＋左右リーン(リロード中だけ・進行と独立)。
    if (PLAYER_MOTION_FX && p.reloadingWeaponId && now < p.reloadEndsAt) {
      actOffY += Math.sin(now / 70) * PLAYER_RELOAD_BOB_PX * dsc;
      actLean += Math.sin(now / 110) * PLAYER_RELOAD_LEAN_RAD;
    }

    // 登場演出(社長指示で刷新): 飛び降りは廃止。プレイヤーは着地地点に居たまま、ヘリが
    // 飛び立つタイミング(takeoffStart)からフェードインで現れる。乗車・ジャンプ弧・着地スカッシュは無し。
    const introOffX = 0;
    const introOffY = 0;
    const introSqX = 1;
    const introSqY = 1;
    const introScale = 1;
    const riding = false; // 乗車演出は廃止(常に actorLayer)
    // 登場フェードイン量(ヘリ離陸開始まで0→その後1)。escorts と共有(currentIntroFade)。
    const introFade = this.currentIntroFade(now);

    // アンカー大技: 敵へダッシュしつつ「引き上げ→斬り下ろし」の弧を見た目だけ描く(負=上)。
    // 実座標(当たり/移動)は store のダッシュが担当。ここは body の Y を弧で持ち上げるだけ。
    let slamOffY = 0;
    if (p.wireSlamEnemyId && p.wireSlamStart > 0 && p.wireDashUntil > p.wireSlamStart) {
      const st = Math.max(0, Math.min(1, (now - p.wireSlamStart) / (p.wireDashUntil - p.wireSlamStart)));
      slamOffY = -WIRE_SLAM_JUMP_H * Math.sin(Math.PI * st) * this.depthScale(fb.footY);
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
      // 通常クラス絵は従来どおり幅基準。ピクセルスナップ(案1)は遠近まで掛けた素のスケールに適用し、
      // 登場演出(introScale)や歩行スカッシュ等の演出係数はその外側(=演出は殺さない)。
      const baseScale = playerBaseScale(p, tex, fb.boxW, fb.boxH);
      const sc = this.snapTexelScale(baseScale * this.depthScale(fb.footY)) * introScale;
      const flip = p.direction === 'left' || (p.lastDirection != null && p.lastDirection.x < 0);
      view.sprite.scale.set((flip ? -sc : sc) * introSqX * walkSqX * actSqX, sc * introSqY * walkSqY * actSqY);
      view.sprite.rotation = walkLean + actLean;
    }
    // ノックバック中の小さな跳ね(社長指示・敵と共通): knockbackUntil から進行度を逆算し sin の1山。
    const pKbHop = (p.knockbackUntil !== undefined && now < p.knockbackUntil)
      ? Math.sin(Math.max(0, Math.min(1, 1 - (p.knockbackUntil - now) / KNOCKBACK_HOP_MS)) * Math.PI) * KNOCKBACK_HOP_PX
      : 0;
    view.sprite.position.set(
      this.snapToScreenPixel(fb.footX, this.L.world.position.x) + introOffX + actOffX,
      this.snapToScreenPixel(fb.footY - bob - pKbHop, this.L.world.position.y) + introOffY + actOffY + slamOffY,
    );
    // シーカー発動中は半透明(通常敵から狙われない演出)。被弾無敵の点滅より優先。
    const seekerActive = p.seekerUntil > gameTime;
    // 死亡時: 立ち絵を1秒でフェードアウト(現状の死亡演出はそのまま)。health>0 で基準時刻をリセット。
    if (p.health <= 0) { if (this.playerDeathAt === 0) this.playerDeathAt = now; }
    else this.playerDeathAt = 0;
    const deathFade = this.playerDeathAt > 0 ? Math.max(0, 1 - (now - this.playerDeathAt) / PLAYER_DEATH_FADE_MS) : 1;
    // カウンター成立の無敵は点滅させない(被弾と紛らわしいため・社長指示)。カウンターは invulnerableTime と
    // lastCounterSuccessTime を同時刻に立てるので、両者一致=カウンター由来の無敵と判定して点滅を抑止。
    // 被弾i-frame は invulnerableTime のみ更新されるので一致せず、従来どおり点滅する。
    const counterInvuln = p.invulnerable && p.lastCounterSuccessTime === p.invulnerableTime;
    view.sprite.alpha = (seekerActive ? 0.4 : (p.invulnerable && !counterInvuln ? 0.5 + 0.5 * Math.sin(now / 50) : 1)) * deathFade * introFade;
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
    // スケボー乗車中: 足元に板を敷いて「乗っている」見た目にする(描画のみ・判定不変)。板テクスチャは
    // 投擲弾と同じ色キー透過済み。向きで左右反転。体幅の約1.7倍(社長指示で一回り小さく)へ拡大し、
    // アンカー(0.5,0.43=デッキ中央の黒線)を足元(footY)へ合わせる=足がデッキ中央に乗る見た目。
    const sb = this.playerSkateboard;
    const sbTex = getTexture('skateboard');
    if (p.skaterRiding && sbTex && sbTex.width > 0) {
      const d = this.depthScale(fb.footY);
      const targetW = fb.boxW * 1.7 * d;
      const sc = targetW / sbTex.width;
      const flip = p.direction === 'left' || (p.lastDirection != null && p.lastDirection.x < 0);
      sb.texture = sbTex;
      sb.visible = true;
      sb.scale.set((flip ? -1 : 1) * sc, sc);
      sb.rotation = 0; // 板は地面に水平(体の傾きには追従させない)
      // デッキ中央の黒線(アンカーY=0.43)を足元(footY)に合わせる=余分な縦オフセットは無し(bob には追従)。
      sb.position.set(
        this.snapToScreenPixel(fb.footX, this.L.world.position.x) + introOffX + actOffX,
        this.snapToScreenPixel(fb.footY - bob, this.L.world.position.y) + introOffY + actOffY,
      );
      sb.alpha = view.sprite.alpha;
    } else {
      sb.visible = false;
    }
    // 救急鞄スキル発動: 「鞄を頭上へ掲げる」一拍(振り抜きポーズと同じ窓・描画のみ・判定不変)。
    // 立ち上がりでせり上がり→保持→引きでフェードアウト。向きで左右反転・本体の傾きへ軽く追従。
    const fab = this.playerFirstAidBag;
    if (this.playerFirstAidBagSetup && firstAidActive && fab.texture && fab.texture.width > 0) {
      const t = sinceFirstAid / PLAYER_FIRSTAID_POSE_MS;
      const rise = Math.min(1, t / 0.22);       // 素早く掲げる
      const fall = Math.min(1, (1 - t) / 0.3);  // 終盤で引く
      const appear = Math.max(0, Math.min(rise, fall));
      const targetH = fb.boxH * dsc * PLAYER_FIRSTAID_BAG_SCALE;
      const sc = targetH / fab.texture.height;
      const flip = p.direction === 'left' || (p.lastDirection != null && p.lastDirection.x < 0);
      const fwd = (flip ? -1 : 1) * PLAYER_FIRSTAID_BAG_FWD_FRAC * fb.boxH * dsc;
      const upFrac = PLAYER_FIRSTAID_BAG_UP_FRAC * (0.82 + 0.18 * appear); // 下から持ち上げる感
      fab.visible = true;
      fab.scale.set((flip ? -1 : 1) * sc, sc);
      fab.rotation = actLean * 0.5; // 本体の二次モーションへ軽く追従
      fab.position.set(
        this.snapToScreenPixel(fb.footX, this.L.world.position.x) + introOffX + actOffX + fwd,
        this.snapToScreenPixel(fb.footY - bob, this.L.world.position.y) + introOffY + actOffY - upFrac * fb.boxH * dsc,
      );
      fab.alpha = appear * view.sprite.alpha;
      fab.visible = fab.alpha > 0.01;
    } else if (this.playerFirstAidBagSetup) {
      fab.visible = false;
    }
    // 近接スイングを3枚の画像差し替えで見せる(描画のみ・判定不変)。左向きは水平ミラー。
    // frame1=装備ナイフ左下(構え)→frame2=弧+装備ナイフ振り抜き→frame3=弧の残光フェード。
    // 装備中の近接(weapons/<key>)の実絵を重ね、絵が無い場合のみ旧焼き込みダガーへフォールバック。
    const knife = this.playerKnife;
    const slash = this.playerKnifeSlash;
    const trail = this.playerKnifeTrail;
    const wpn = this.playerMeleeWpn;
    const meleeKey = p.weapons.find(w => w.isMelee)?.key;
    const wtex = meleeKey ? getTexture(`weapons/${meleeKey}`) : null;
    if (this.playerKnifeSetup) {
      if (p.meleeSwingAt > 0 && sinceSwing >= 0 && sinceSwing < swingWindowMs) {
        const kt = meleeSwingEase(sinceSwing / swingWindowMs); // ゆっくり→速く→ゆっくり(§5.22-追補でスロー中は伸長)
        // 右/左だけ(上下に撃っても水平成分で決定)。pure縦は直近の向き(face)。
        let kax = aimx, kay = aimy;
        if (kax === 0 && kay === 0) { kax = face; kay = 0; }
        const facingLeft = kax < 0;
        const mir = facingLeft ? -1 : 1;
        const chestY = fb.footY - fb.boxH * 0.5 * dsc;
        const baseX = this.snapToScreenPixel(fb.footX, this.L.world.position.x) + introOffX + actOffX;
        const baseY = this.snapToScreenPixel(chestY - bob, this.L.world.position.y) + introOffY + actOffY;
        const unit = fb.boxH * dsc;
        const place = (
          spr: Sprite,
          cfg: { scale: number; ox: number; oy: number },
          vis: boolean,
          alpha: number,
        ) => {
          if (!vis || !spr.texture || spr.texture.width === 0) { spr.visible = false; return; }
          const sc = (unit * cfg.scale) / spr.texture.width;
          spr.scale.set(mir * sc, sc);                                 // 左向き=水平ミラー(回転なし)
          spr.position.set(baseX + mir * cfg.ox * unit, baseY + cfg.oy * unit);
          spr.alpha = alpha * view.sprite.alpha;
          spr.visible = spr.alpha > 0.01;
        };
        // 装備近接の実絵を置く: 対角線長=unit×lenFrac、回転は左向きミラー時に反転(ミラー合成)。
        const placeWpn = (ox: number, oy: number, rot: number, lenFrac: number, alpha: number) => {
          if (!wtex) { wpn.visible = false; return; }
          if (wpn.texture !== wtex) wpn.texture = wtex;
          const sc2 = (unit * lenFrac) / Math.max(1, Math.hypot(wtex.width, wtex.height));
          wpn.scale.set(mir * sc2, sc2);
          wpn.rotation = mir * rot;
          wpn.position.set(baseX + mir * ox * unit, baseY + oy * unit);
          wpn.alpha = alpha * view.sprite.alpha;
          wpn.visible = wpn.alpha > 0.01;
        };
        // f2の武器位置: 弧テクスチャ内の割合(fx,fy)を弧の配置(KNIFE_F2)へ写像。
        const arcAspect = slash.texture && slash.texture.width > 0 ? slash.texture.height / slash.texture.width : 0.577;
        const wpnOx2 = KNIFE_F2.ox + (MELEE_WPN_F2.fx - 0.5) * KNIFE_F2.scale;
        const wpnOy2 = KNIFE_F2.oy + (MELEE_WPN_F2.fy - 0.5) * KNIFE_F2.scale * arcAspect;
        if (kt < KNIFE_SWING_SWITCH) {
          // 1枚目(振りかぶり): 装備ナイフをさっと出す(絵が無ければ旧焼き込みダガー)。
          const a1 = Math.min(1, kt / (KNIFE_SWING_SWITCH * 0.5));
          place(knife, KNIFE_F1, !wtex, a1);
          placeWpn(KNIFE_F1.ox, KNIFE_F1.oy, MELEE_WPN_F1.rot, MELEE_WPN_F1.len, a1);
          place(slash, KNIFE_F2, false, 0);
          place(trail, KNIFE_F3, false, 0);
        } else if (kt < KNIFE_SWING_SWITCH2) {
          // 2枚目(振り抜き): 弧(のみ)+装備ナイフを振り抜き位置へ。snapで出す。
          const t2 = (kt - KNIFE_SWING_SWITCH) / (KNIFE_SWING_SWITCH2 - KNIFE_SWING_SWITCH); // 0..1
          const a2 = Math.min(1, t2 / 0.25);
          place(knife, KNIFE_F1, false, 0);
          place(slash, KNIFE_F2, true, a2);
          placeWpn(wpnOx2, wpnOy2, MELEE_WPN_F2.rot, MELEE_WPN_F2.len, a2);
          place(trail, KNIFE_F3, false, 0);
        } else {
          // 3枚目(弧の残光): 2枚目と同配置で弧だけ残り、フェードアウト(武器絵は消す)。
          const t3 = (kt - KNIFE_SWING_SWITCH2) / (1 - KNIFE_SWING_SWITCH2); // 0..1
          const a3 = 1 - t3;
          place(knife, KNIFE_F1, false, 0);
          place(slash, KNIFE_F2, false, 0);
          wpn.visible = false;
          place(trail, KNIFE_F3, true, a3);
        }
      } else {
        knife.visible = false;
        slash.visible = false;
        trail.visible = false;
        wpn.visible = false;
      }
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

  // 元テクスチャの「真っ白シルエット」(RGB→白・α保持)を1度だけベイクしてキャッシュ。被弾フラッシュで
  // これを加算オーバーレイすると、暗い敵でも全面が白く光る。実行時はフィルタ不要(キャッシュ済みを貼るだけ)=安い。
  private whiteSilhouette(src: Texture | null): Texture | null {
    if (!src || src.width <= 1 || !this.renderer) return null;
    const cached = this.whiteTexCache.get(src);
    if (cached) return cached;
    const tmp = new Sprite(src);
    const wrap = new Container();
    wrap.addChild(tmp);
    const f = new ColorMatrixFilter();
    // RGB を一律 1(白)に、α は元のまま(行4=0,0,0,1,0)。→ 不透明部だけが真っ白なシルエット。
    f.matrix = [0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0];
    wrap.filters = [f];
    const rt = RenderTexture.create({ width: Math.max(1, src.width), height: Math.max(1, src.height) });
    this.renderer.render({ container: wrap, target: rt, clear: true });
    wrap.destroy({ children: true });
    this.whiteTexCache.set(src, rt);
    return rt;
  }

  // 分身(サブウェポン)を描く。外見はプレイヤーと同一(待機=frame0)を白黒キャッシュで。
  // 位置は生成時に固定(clone.x/y)。攻撃の見た目は store 側のスラッシュ/リングが担当する。
  private syncShadowClone(player: Player) {
    const clone: ShadowCloneState | null = useGameStore.getState().shadowClone;
    const spr = this.shadowCloneSprite;
    if (!clone) { spr.visible = false; this.cloneKnife.visible = false; this.cloneKnifeSlash.visible = false; this.cloneKnifeTrail.visible = false; this.cloneMeleeWpn.visible = false; return; }
    if (!this.shadowCloneAdded) {
      spr.anchor.set(0.5, 1); // foot-centre(プレイヤー本体と同じ)
      this.L.actorLayer.addChild(spr);
      this.shadowCloneAdded = true;
    }
    // 外見はプレイヤーと同じ立ち絵(クラス/武将装備)を共有。待機なので frame 0・walking=false
    // (スカベンジャーは専用の待機立ち絵になる)。
    const name = playerTextureName(player, 0, false);
    const gray = this.grayscaleTexture(name);
    if (!gray) { spr.visible = false; return; }
    spr.visible = true;
    spr.texture = gray;
    const boxW = clone.width * PLAYER_VISUAL_SCALE;
    const boxH = clone.height * PLAYER_VISUAL_SCALE;
    const footX = clone.x + clone.width / 2;
    const footY = clone.y + clone.height;
    const baseScale = playerBaseScale(player, gray, boxW, boxH);
    const sc = this.snapTexelScale(baseScale * this.depthScale(footY)); // 本体と同じピクセルスナップ(案1)
    spr.scale.set(clone.facingLeft ? -sc : sc, sc);
    spr.position.set(
      this.snapToScreenPixel(footX, this.L.world.position.x),
      this.snapToScreenPixel(footY, this.L.world.position.y),
    );
    spr.zIndex = footY;     // 他アクターと足元Yでy-sort
    spr.alpha = 0.8;        // 分身とわかるよう少し透過

    // 斬撃モーション(本体と同じナイフ振り)を分身にも付与(社長指示)。clone.swingAt 起点で3枚差し替え。
    if (!this.cloneKnifeSetup) {
      const f1 = getTexture('knife-swing-1');
      const f2 = getTexture('knife-swing-2');
      const f3 = getTexture('knife-swing-3');
      if (f1 && f2 && f3) {
        this.cloneKnife.texture = f1; this.cloneKnife.anchor.set(0.5, 0.5); this.cloneKnife.visible = false;
        this.L.actorLayer.addChild(this.cloneKnife);
        this.cloneKnifeSlash.texture = f2; this.cloneKnifeSlash.anchor.set(0.5, 0.5); this.cloneKnifeSlash.visible = false;
        this.L.actorLayer.addChild(this.cloneKnifeSlash);
        this.cloneKnifeTrail.texture = f3; this.cloneKnifeTrail.anchor.set(0.5, 0.5); this.cloneKnifeTrail.visible = false;
        this.L.actorLayer.addChild(this.cloneKnifeTrail);
        this.cloneMeleeWpn.anchor.set(0.5, 0.5); this.cloneMeleeWpn.visible = false;
        this.L.actorLayer.addChild(this.cloneMeleeWpn);
        this.cloneKnifeSetup = true;
      }
    }
    const knife = this.cloneKnife, slash = this.cloneKnifeSlash, trail = this.cloneKnifeTrail;
    const wpn = this.cloneMeleeWpn;
    const meleeKey = player.weapons.find(w => w.isMelee)?.key;
    const wtex = meleeKey ? getTexture(`weapons/${meleeKey}`) : null;
    const cSince = Date.now() - (clone.swingAt ?? 0);
    if (this.cloneKnifeSetup && clone.swingAt && cSince >= 0 && cSince < PLAYER_MELEE_SWING_MS) {
      const kt = meleeSwingEase(cSince / PLAYER_MELEE_SWING_MS); // 本体と同じイージング
      const mir = clone.facingLeft ? -1 : 1;
      const cDsc = this.depthScale(footY);
      const unit = boxH * cDsc;                                   // boxH=clone.height*PLAYER_VISUAL_SCALE(本体と同基準)
      const baseX = this.snapToScreenPixel(footX, this.L.world.position.x);
      const baseY = this.snapToScreenPixel(footY - boxH * 0.5 * cDsc, this.L.world.position.y); // 胸あたり
      const zc = footY + 0.5;                                     // 本体のすぐ前面
      const place = (s: Sprite, cfg: { scale: number; ox: number; oy: number }, vis: boolean, alpha: number) => {
        if (!vis || !s.texture || s.texture.width === 0) { s.visible = false; return; }
        const scl = (unit * cfg.scale) / s.texture.width;
        s.scale.set(mir * scl, scl);                              // 左向き=水平ミラー(回転なし)
        s.position.set(baseX + mir * cfg.ox * unit, baseY + cfg.oy * unit);
        s.zIndex = zc;
        s.alpha = alpha * spr.alpha;                              // 分身の透過(0.8)に合わせる
        s.visible = s.alpha > 0.01;
      };
      // 装備近接の実絵(本体と同じ計測定数・分身の透過/zIndexを継承)。
      const placeWpn = (ox: number, oy: number, rot: number, lenFrac: number, alpha: number) => {
        if (!wtex) { wpn.visible = false; return; }
        if (wpn.texture !== wtex) wpn.texture = wtex;
        const sc2 = (unit * lenFrac) / Math.max(1, Math.hypot(wtex.width, wtex.height));
        wpn.scale.set(mir * sc2, sc2);
        wpn.rotation = mir * rot;
        wpn.position.set(baseX + mir * ox * unit, baseY + oy * unit);
        wpn.zIndex = zc;
        wpn.alpha = alpha * spr.alpha;
        wpn.visible = wpn.alpha > 0.01;
      };
      const arcAspect = slash.texture && slash.texture.width > 0 ? slash.texture.height / slash.texture.width : 0.577;
      const wpnOx2 = KNIFE_F2.ox + (MELEE_WPN_F2.fx - 0.5) * KNIFE_F2.scale;
      const wpnOy2 = KNIFE_F2.oy + (MELEE_WPN_F2.fy - 0.5) * KNIFE_F2.scale * arcAspect;
      if (kt < KNIFE_SWING_SWITCH) {
        const a1 = Math.min(1, kt / (KNIFE_SWING_SWITCH * 0.5));
        place(knife, KNIFE_F1, !wtex, a1);
        placeWpn(KNIFE_F1.ox, KNIFE_F1.oy, MELEE_WPN_F1.rot, MELEE_WPN_F1.len, a1);
        place(slash, KNIFE_F2, false, 0);
        place(trail, KNIFE_F3, false, 0);
      } else if (kt < KNIFE_SWING_SWITCH2) {
        const t2 = (kt - KNIFE_SWING_SWITCH) / (KNIFE_SWING_SWITCH2 - KNIFE_SWING_SWITCH); // 0..1
        const a2 = Math.min(1, t2 / 0.25);                              // 本体と同じくsnapで出す
        place(knife, KNIFE_F1, false, 0);
        place(slash, KNIFE_F2, true, a2);
        placeWpn(wpnOx2, wpnOy2, MELEE_WPN_F2.rot, MELEE_WPN_F2.len, a2);
        place(trail, KNIFE_F3, false, 0);
      } else {
        const t3 = (kt - KNIFE_SWING_SWITCH2) / (1 - KNIFE_SWING_SWITCH2); // 0..1
        place(knife, KNIFE_F1, false, 0);
        place(slash, KNIFE_F2, false, 0);
        wpn.visible = false;
        place(trail, KNIFE_F3, true, 1 - t3);                           // 弧の残光フェード(本体と同じ)
      }
    } else {
      knife.visible = false;
      slash.visible = false;
      trail.visible = false;
      wpn.visible = false;
    }
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
      ?? (this.battlefieldStage ? stage5EnemyTextureName(e.type) : null)
      ?? labEnemyTextureName(e.type, e.id)
      ?? e.type
    );
    const cx = e.x + e.width / 2;
    const cy = e.y + e.height / 2;

    // パンプキン特殊AI演出(描画のみ): 縮み(しゃがみ)/ジャンプのアーク/着地スカッシュ。Lv3・ジャイアントバットも同様。
    let aiSqX = 1, aiSqY = 1, aiHop = 0;
    if (e.type === 'pumpkin' || e.type === 'lab-zombie-3' || e.type === 'giantbat' || e.type === 'hunter') {
      if (e.aiPhase === 'crouch') {
        const p = Math.max(0, Math.min(1, 1 - ((e.aiPhaseUntil ?? gameTime) - gameTime) / (PUMPKIN_CROUCH_MS / ENEMY_ATTACK_SPEED_MULT)));
        aiSqY = 1 - 0.42 * p; aiSqX = 1 + 0.14 * p; // しゃがんで縦縮み・横広がり
      } else if (e.aiPhase === 'jump') {
        // 滞空時間はストアと同じ実効値(攻撃倍速＋ハンターは更に×2)に合わせて着地と同期させる。
        const jumpDur = PUMPKIN_JUMP_MS / ENEMY_ATTACK_SPEED_MULT / (e.type === 'hunter' ? HUNTER_JUMP_SPEED_MULT : 1);
        const t = Math.max(0, Math.min(1, (gameTime - (e.aiStartedAt ?? gameTime)) / jumpDur));
        aiHop = Math.sin(t * Math.PI) * PUMPKIN_JUMP_HEIGHT; // ジャンプアーク(描画のみ・着地と同期)
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
    // ノックバック中の小さな跳ね(社長指示): 被弾(lastHit)を起点に sin の1山ぶんポンと跳ねる。
    // バグ修正(社長報告v0.25.1476): ノックバックCD中(knockbackImmuneUntil)は0速度のまま
    // knockbackUntilだけ再利用してその場に凍結させる経路があり(gameStore.ts)、速度チェック無しだと
    // 実際には押されていないのに跳ねてしまっていた。実速度が乗っている時だけ跳ねるようガード。
    const kbMoving = Math.abs(e.knockbackVx ?? 0) > 0.01 || Math.abs(e.knockbackVy ?? 0) > 0.01;
    const kbHop = (e.knockbackUntil !== undefined && now < e.knockbackUntil && kbMoving)
      ? Math.sin(Math.max(0, Math.min(1, (now - e.lastHit) / KNOCKBACK_HOP_MS)) * Math.PI) * KNOCKBACK_HOP_PX
      : 0;
    // 裏ボスは「当たり判定=足元の帯(AABB)」と「絵(巨体)」を分離して描く(社長指示)。
    // 他敵は従来どおり足元アンカー＋遠近スケール。
    const bossFixed = isHiddenBoss(e.type);
    view.container.zIndex = fb.footY;
    const horizonAlpha = this.horizonActorAlpha(fb.footY);
    // 死神の回り込みワープ: 消える(0)→テレポート→出る(1) のフェード(useGameLoop が reaperWarpAlpha を駆動)。
    const reaperWarpFade = e.reaperWarpAlpha ?? 1;
    // 非ボス敵は「手前(画面最下端)で消える」near-plane フェードを掛ける。裏ボスは自前の裏回りフェード
    // (bossBehindAlpha)で別管理なので掛けない。
    const foreFade = bossFixed ? 1 : this.foregroundActorAlpha(fb.footY);
    // ハンターの索敵タイムアウト立ち去り: hunterLeavingAt(gameTime基準)から HUNTER_LEAVE_FADE_MS
    // かけて透明化(社長指示)。useGameLoop側もgameTime基準で消滅判定するため同じ時計を使う。
    const hunterLeaveFade = e.hunterLeavingAt !== undefined
      ? Math.max(0, 1 - (gameTime - e.hunterLeavingAt) / HUNTER_LEAVE_FADE_MS)
      : 1;
    view.container.alpha = horizonAlpha * reaperWarpFade * foreFade * hunterLeaveFade;

    if (bossFixed && tex) {
      // 裏ボス: 当たり判定=帯(AABB=e.width×e.height)。絵はそれより大きく、帯の上に伸ばす(見た目と判定を分離)。
      const fit = BOSS_SPRITE_FIT[e.type] ?? BOSS_FIT_DEFAULT;
      view.sprite.texture = tex;
      view.sprite.anchor.set(0.5, 0.5);
      // 帯幅→絵の実寸(縦横同率=歪まない)。さらに他敵と同じ擬似遠近スケールを掛ける(画面の前後で大小・視覚のみ)。
      // 当たり判定の帯(e.width×e.height)は不変=絵だけが前で大きく/奥で小さくなる(社長指示)。
      const scale = ((e.width / fit.w) / tex.width) * this.depthScaleEnemy(fb.footY);
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
      view.sprite.position.set(Math.round(spx + liftShake), Math.round(spy - liftHop - kbHop));
      view.sprite.scale.set(scale * breath.x, scale * breath.y * flinchSqY);
      // プレイヤーが帯(当たり判定)より奥=裏に回り込んだら、巨体の絵で自機が隠れないよう薄く透かす(社長指示)。
      // 二値判定ではなく「遠ざかるほど急激」な二乗カーブで透明度を距離に応じて連続変化させる。
      const ply = useGameStore.getState().player;
      const behindDist = fb.footY - (ply.y + ply.height);   // 正 = プレイヤーが帯より奥
      const inHoriz = (ply.x + ply.width) > (spx - spriteW / 2) && ply.x < (spx + spriteW / 2);
      let behindTarget: number;
      if (!inHoriz || behindDist <= 0) {
        behindTarget = 1;
      } else {
        // #1(変更なし): 0→70px で 1.0→0.5(二乗カーブ。裏に回ると薄く残る)。
        const t = Math.min(1, behindDist / 70);
        let a = 1 - t * t * (1 - BOSS_BEHIND_ALPHA);
        // #2(追加): さらに奥(70px超=手前へ遠ざかる)へ離れたら 0.5→0(完全透明)へ続ける。
        if (behindDist > 70) {
          const t2 = Math.min(1, (behindDist - 70) / (BOSS_BEHIND_FAR_PX - 70));
          a = BOSS_BEHIND_ALPHA * (1 - t2);
        }
        behindTarget = a;
      }
      // #3(社長指示v0.25.1599): 近接攻撃距離くらいに居る間は完全透明にせず、半透明(0.5)を下限に保つ。
      // プレイヤー中心→当たり判定帯(AABB)の最近点までの2D距離で判定(gameStoreの近接判定と同じ帯基準)。
      // #2で0へ薄くなる区間でも、近接圏内なら 0.5 で止める(#1/#2のカーブ値自体は不変)。
      {
        const plcx = ply.x + ply.width / 2, plcy = ply.y + ply.height / 2;
        const nx = Math.max(e.x, Math.min(plcx, e.x + e.width));
        const ny = Math.max(e.y, Math.min(plcy, e.y + e.height));
        if (Math.hypot(plcx - nx, plcy - ny) <= BOSS_BEHIND_MELEE_PX) {
          behindTarget = Math.max(behindTarget, BOSS_BEHIND_ALPHA);
        }
      }
      // 透ける/戻るを滑らかにフェード。速度は障害物の透けの2倍(社長指示)= 1-(1-lerp)^2。
      const fastLerp = 1 - (1 - this.seeThroughLerp) ** 2;
      this.bossBehindAlpha += (behindTarget - this.bossBehindAlpha) * fastLerp;
      view.sprite.alpha = this.bossBehindAlpha;
      view.sprite.visible = true;
    } else {
    view.sprite.anchor.set(0.5, 1);
    view.sprite.position.set(Math.round(fb.footX + liftShake), Math.round(fb.footY - liftHop - aiHop - kbHop));
    view.sprite.alpha = 1; // 抱卵型(旧ghost)は地上敵=半透明/浮遊を廃止(不透明＋接地影あり)

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
      if (this.snowStage || this.battlefieldStage) {
        const footFrac = this.snowStage ? STAGE4_FOOT_FRAC_X[e.type] : STAGE5_FOOT_FRAC_X[e.type];
        if (footFrac !== undefined) {
          view.sprite.position.x = Math.round(fb.footX + liftShake - (footFrac - 0.5) * tex.width * scaleX);
        }
      }
      view.sprite.visible = true;
      // PACING_PUZZLE.md §5.15 M15: レア(色付き)個体は本体を専用色でtint(サイズ拡大はネームド専売
      // なのでここでは触らない)。抽選なし/フラグ無効時は明示的に等倍(0xffffff)へ戻す
      // (敵の描画ビューはid単位でプール再利用されるため、リセットしないと別個体へtintが残る)。
      // §5.14 M13: 宿敵は専用tint=黄金(社長確定)。レアのtintより優先(被った場合、金が勝つ)。
      // 二人組クエストの強制目標個体(questTarget)も宿敵と同じ金tint+名前表示(EVENT_QUEST_DESIGN.md)。
      view.sprite.tint = (e.isNamed || e.questTarget)
        ? NAMED_TINT
        : (RARE_BODY_TINT_ENABLED && e.colorTier) ? ENEMY_COLOR_TIER_BODY_TINT[e.colorTier] : 0xffffff;
    } else {
      view.sprite.skew.x = 0;
      view.sprite.visible = false; // placeholder ellipse drawn in reticle below
    }
    }

    // §5.14 M13: 宿敵の頭上に名前を常時表示(同時1体・生成は湧き時1回だけ=Pixi Text可)。
    // クエスト目標個体(questTarget)も同様(名前は個体のquestName。同時1体なので負荷は同等)。
    if (e.isNamed || e.questTarget) {
      let label = this.namedFoeLabels.get(e.id);
      if (!label) {
        label = new Text({
          text: e.questTarget ? (e.questName ?? '') : normalizeNamedName(useGameStore.getState().namedFoe?.name ?? ''),
          resolution: Math.min(3, Math.max(2, Math.round(window.devicePixelRatio || 2))),
          style: { fontFamily: FONT_STACK, fontSize: 15, fontWeight: 'bold', fill: NAMED_TINT, stroke: { color: 0x2a1a00, width: 3 } },
        });
        label.anchor.set(0.5, 1);
        this.L.effectLayer.addChild(label);
        this.namedFoeLabels.set(e.id, label);
      }
      label.visible = true;
      label.position.set(Math.round(fb.footX), Math.round(fb.footY - fb.boxH - 10 - liftHop - aiHop - kbHop));
    } else {
      const label = this.namedFoeLabels.get(e.id);
      if (label) label.visible = false;
    }

    // 被弾フラッシュ: 本体スプライトと同じ形/変形を白で加算オーバーレイし、絵(ピクセル)を一瞬光らせる。
    // 旧・白丸(overlay の circle)は廃止=裏ボス等の大きい絵を隠さない(社長指示)。
    {
      const hf = view.hitFlash;
      const flashT = view.sprite.visible && view.sprite.texture && view.sprite.texture.width > 1
        ? Math.max(0, 1 - (now - e.lastHit) / ENEMY_HIT_FLASH_MS) : 0;
      if (flashT > 0.01) {
        // 真っ白シルエットを加算で重ねる(暗い敵でも全面が白く光る)。未ベイク時は元テクスチャにフォールバック。
        hf.texture = this.whiteSilhouette(view.sprite.texture) ?? view.sprite.texture;
        hf.anchor.set(view.sprite.anchor.x, view.sprite.anchor.y);
        hf.position.set(view.sprite.position.x, view.sprite.position.y);
        hf.scale.set(view.sprite.scale.x, view.sprite.scale.y);
        hf.skew.set(view.sprite.skew.x, view.sprite.skew.y);
        hf.rotation = view.sprite.rotation;
        hf.alpha = flashT * ENEMY_HIT_FLASH_STRENGTH;
        hf.visible = true;
      } else if (hf.visible) {
        hf.visible = false;
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
    if (stunned) {
      // 裏ボスの完全気絶(5クリ)中は黄→紫のサークル(社長指示)。それ以外は従来の黄。
      const fullStun = e.bossFullStunUntil !== undefined && gameTime < e.bossFullStunUntil;
      this.drawStunReticle(r, cx, cy, Math.max(e.width, e.height), now, fullStun ? 0xa855f7 : 0xfacc15);
    }
    // 当たり判定=足元の「帯」(通常敵=幅は影と同規格=実描画幅×0.55 / 高さ=e.height、裏ボス=生の帯)。確認しやすい
    // よう帯=四角をうっすら色付きで表示。絵の「下」=この reticle 層(スプライトより背面)へ。当たり判定と必ず一致させる
    // ため collision と同じ enemyHitStrip を使う。★確認用オーバーレイ(社長: 後で確定したら消す)。
    // SHOW_HITBOX_STRIP=false で通常敵ぶんは一括OFF。裏ボスは元々この帯を常時表示(社長指示)なので OFF でも残す。
    if (SHOW_HITBOX_STRIP || isHiddenBoss(e.type)) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 280);
      const hb = isHiddenBoss(e.type) ? { x: e.x, y: e.y, width: e.width, height: e.height } : enemyHitStrip(e);
      r.rect(hb.x, hb.y, hb.width, hb.height).fill({ color: 0xf97316, alpha: 0.07 + 0.04 * pulse });
      r.rect(hb.x, hb.y, hb.width, hb.height).stroke({ width: 2, color: 0xfb923c, alpha: 0.3 + 0.1 * pulse });
    }

    // Above-sprite layer: health bar, boss marker, hit flash.
    const o = view.overlay;
    o.clear();
    // ミーミルのレーザー: 溜め中=赤い予告ライン(進行で太く明るく)、発射中=太いレーザー本体(フェード)。
    if (e.type === 'mimir' && (e.bossState === 'laser-windup' || e.bossState === 'laser-fire')) {
      const ax = (e.aiTargetX ?? cx) - (e.aiFromX ?? cx);
      const ay = (e.aiTargetY ?? cy) - (e.aiFromY ?? cy);
      const al = Math.hypot(ax, ay) || 1;
      const ux = ax / al, uy = ay / al;
      const ex2 = cx + ux * MIMIR_LASER_VIS_RANGE, ey2 = cy + uy * MIMIR_LASER_VIS_RANGE;
      if (e.bossState === 'laser-windup') {
        const prog = Math.max(0, Math.min(1, 1 - ((e.bossStateUntil ?? gameTime) - gameTime) / MIMIR_LASER_WINDUP_MS));
        const pulse = 0.55 + 0.45 * Math.sin(now / 80);
        o.moveTo(cx, cy).lineTo(ex2, ey2).stroke({ width: 2 + 7 * prog, color: 0xff3030, alpha: (0.18 + 0.5 * prog) * (0.7 + 0.3 * pulse), cap: 'round' });
        o.moveTo(cx, cy).lineTo(ex2, ey2).stroke({ width: 1 + 2 * prog, color: 0xffe0e0, alpha: 0.45 + 0.45 * prog, cap: 'round' });
      } else {
        const life = Math.max(0, Math.min(1, ((e.bossStateUntil ?? gameTime) - gameTime) / MIMIR_LASER_FIRE_MS));
        const fade = Math.min(1, life / 0.25); // 発射中はほぼ全開、最後の25%で消える
        const flick = 0.9 + 0.1 * Math.sin(now / 40); // エネルギーのちらつき
        const w = MIMIR_LASER_VIS_HALFWIDTH * 2 * flick;
        o.moveTo(cx, cy).lineTo(ex2, ey2).stroke({ width: w, color: 0xff2020, alpha: 0.45 * fade, cap: 'round' });
        o.moveTo(cx, cy).lineTo(ex2, ey2).stroke({ width: w * 0.5, color: 0xff6060, alpha: 0.85 * fade, cap: 'round' });
        o.moveTo(cx, cy).lineTo(ex2, ey2).stroke({ width: Math.max(3, w * 0.18), color: 0xffffff, alpha: 0.97 * fade, cap: 'round' });
      }
    }
    // トール(ステージ5裏ボス)の独自攻撃(社長指示): 溜め(放つ前)は従来どおり赤いダメージゾーンの
    // ライン予告のまま、実際に攻撃を放った瞬間(実行状態)だけプレイヤーの斬撃と同じピクセル演出
    // (drawThorSlash=fx/slash-streak-*, fx/slash-burst-*)を当たり判定ラインに合わせて表示する。
    if (e.type === 'thor') {
      const slashFx = this.thorSlashFx.get(e.id);
      if (slashFx) slashFx.visible = false; // 既定で非表示。実行ステートのみ下で表示する
      if (e.bossState === 'issen-windup') {
        // 一閃の溜め: ピクセルが赤くゆっくり点滅(社長指示)。方向は選択時に既にロック済み=
        // 溜め中はプレイヤーを追わない(社長修正指示。aiFromX/Y→aiTargetX/Yは固定値)。
        // 放つ前=普通の赤いダメージゾーン(社長指示: レーザーの二重線ではなく矩形の塗り)。
        const blink = 0.5 + 0.5 * Math.sin(now / 260);
        view.sprite.tint = ((255 << 16) | (Math.round(255 * (1 - blink)) << 8) | Math.round(255 * (1 - blink)));
        // §5.25 M24: ダメージ瞬間(windup終わり)の400ms前は、じわ点滅の代わりに鋭いフラッシュへ切替。
        const issenFlash = thorFlashTint((e.bossStateUntil ?? gameTime) - gameTime, now);
        if (issenFlash !== null) view.sprite.tint = issenFlash;
        const fx = e.aiFromX ?? cx, fy = e.aiFromY ?? cy;
        const tx = e.aiTargetX ?? cx, ty = e.aiTargetY ?? cy;
        const prog = Math.max(0, Math.min(1, 1 - ((e.bossStateUntil ?? gameTime) - gameTime) / THOR_ISSEN_WINDUP_MS));
        const pulse = 0.5 + 0.5 * Math.sin(now / 110);
        // ゾーンの太さ=実際の攻撃判定幅(THOR_ISSEN_VIS_HALFWIDTH*2)と一致させる。矩形(fx,fy)→(tx,ty)を
        // 半幅ぶん左右に膨らませて塗る(ジャンプ攻撃の着地ゾーンと同じ意匠=fill+stroke)。
        // 社長指示v0.25.1617「範囲攻撃の赤表示は全部四角に統一(丸を置くのをやめる)」: 当たり判定は点-線分
        // 距離を[0,長さ]clamp=両端に半径ぶんの丸い張り出しがある。丸(円)ではなく両端を半幅ぶん軸方向へ
        // 延ばした「角ばった四角」で覆う(角のぶん丸より広く覆う=赤の外=安全は維持・判定は不変)。
        const ddx = tx - fx, ddy = ty - fy;
        const ddl = Math.hypot(ddx, ddy) || 1;
        const nx = -ddy / ddl, ny = ddx / ddl; // 進行方向に直交する単位ベクトル
        const ux = ddx / ddl, uy = ddy / ddl;  // 軸方向の単位ベクトル(両端の延長に使う)
        const hw = THOR_ISSEN_VIS_HALFWIDTH;
        const zoneFill = (0.12 + 0.22 * prog) + 0.08 * pulse;
        const pts = [
          fx - ux * hw + nx * hw, fy - uy * hw + ny * hw,
          tx + ux * hw + nx * hw, ty + uy * hw + ny * hw,
          tx + ux * hw - nx * hw, ty + uy * hw - ny * hw,
          fx - ux * hw - nx * hw, fy - uy * hw - ny * hw,
        ];
        o.poly(pts).fill({ color: 0xff2a2a, alpha: zoneFill });
        o.poly(pts).stroke({ width: 2, color: 0xff3b3b, alpha: (0.32 + 0.4 * prog) + 0.15 * pulse });
        // 社長指示: 一閃の溜めは刀を腰に構えて(居合腰)ゆっくり溜める。方向はロック済み(fx,fy→tx,ty)。
        this.drawThorIaiCharge(e.id, fb.footX, fb.footY - fb.boxH * 0.32, tx - fx, ty - fy, prog, now);
      } else if (e.bossState === 'issen-dash') {
        // 一閃(実行): 放った瞬間はプレイヤーの斬撃と同じピクセル演出を当たり判定に合わせて表示。
        view.sprite.tint = 0xffffff;
        const fx = e.aiFromX ?? cx, fy = e.aiFromY ?? cy;
        const tx = e.aiTargetX ?? cx, ty = e.aiTargetY ?? cy;
        const dashProg = Math.max(0, Math.min(1, 1 - ((e.bossStateUntil ?? gameTime) - gameTime) / THOR_ISSEN_DASH_MS));
        // 社長指示: 移動しながら、構えてた刀も振る。柄を居合の抜き位置(dash始点 fx,fy)に置き、刃先が
        // 斬る先(tx,ty)へ抜けていく=居合斬りの振り。showKatana=true + pivot=始点。
        this.drawThorSlash(e.id, fx, fy, tx, ty, THOR_ISSEN_VIS_HALFWIDTH, dashProg, true, true, fx, fy);
      } else if (e.bossState === 'tsuki-windup') {
        // 突きの溜め(社長指示): 弓で矢を引いて放つ感覚。刀の先端を突く方向(プレイヤー)へ向け、
        // 溜めが進むほど手元を後方へ引く(=弓を引く)。実行(tsuki)で前方へ突き出す(=放つ)。
        view.sprite.tint = 0xffffff;
        // §5.25 M24: tsukiは従来無テレグラフだったが、一貫性優先で他3攻撃と同じ400ms前フラッシュを追加。
        const tsukiFlash = thorFlashTint((e.bossStateUntil ?? gameTime) - gameTime, now);
        if (tsukiFlash !== null) view.sprite.tint = tsukiFlash;
        const prog = Math.max(0, Math.min(1, 1 - ((e.bossStateUntil ?? gameTime) - gameTime) / THOR_TSUKI_WINDUP_MS));
        const pl = useGameStore.getState().player;
        // 社長指示v0.25.1621: 溜め中の狙いは「遅延追従する狙い点(aiTarget)」に合わせる(瞬間追従をやめた分、
        // 見た目の切っ先も遅れて追う=当たり判定と一致)。aiTarget未設定時のみプレイヤー中心にフォールバック。
        this.drawThorTsukiCharge(e.id, fb.footX, fb.footY - fb.boxH * 0.55, prog, now,
          e.aiTargetX ?? (pl.x + pl.width / 2), e.aiTargetY ?? (pl.y + pl.height / 2));
      } else if (e.bossState === 'tsuki') {
        // 突き(実行): 溜め中(tsuki-windup)は方向が未確定(社長指示=予告ラインなし)なので、
        // 実行の瞬間だけプレイヤーの斬撃と同じピクセル演出を表示。180msをそのまま1本の
        // 伸縮モーション(0→1)として使う。
        view.sprite.tint = 0xffffff;
        const fx = e.aiFromX ?? cx, fy = e.aiFromY ?? cy;
        const tx = e.aiTargetX ?? cx, ty = e.aiTargetY ?? cy;
        const tsukiProg = Math.max(0, Math.min(1, 1 - ((e.bossStateUntil ?? gameTime) - gameTime) / THOR_TSUKI_MS));
        // 社長指示: 突きは刀を追加表示して攻撃をわかりやすくする。
        this.drawThorSlash(e.id, fx, fy, tx, ty, THOR_TSUKI_VIS_HALFWIDTH, tsukiProg, true, true);
      } else if (e.bossState === 'harai-windup' || e.bossState === 'harai') {
        view.sprite.tint = 0xffffff;
        const fx = e.aiFromX ?? cx, fy = e.aiFromY ?? cy;
        const tx = e.aiTargetX ?? cx, ty = e.aiTargetY ?? cy;
        if (e.bossState === 'harai-windup') {
          // 放つ前=赤いダメージゾーン予告。社長指示v0.25.1617「範囲攻撃の赤表示は全部四角に統一」: 判定は
          // 中心線の両側±THOR_HARAI_HALF_WIDTH(=VIS_HALFWIDTH=40)のカプセル(両端に丸い張り出し)。丸ではなく
          // 両端を半幅ぶん軸方向へ延ばした「角ばった四角」で覆う(角のぶん広く覆う=赤の外=安全は維持・判定不変)。
          const prog = Math.max(0, Math.min(1, 1 - ((e.bossStateUntil ?? gameTime) - gameTime) / THOR_HARAI_WINDUP_MS));
          const pulse = 0.55 + 0.45 * Math.sin(now / 80);
          const hdx = tx - fx, hdy = ty - fy;
          const hdl = Math.hypot(hdx, hdy) || 1;
          const hnx = -hdy / hdl, hny = hdx / hdl; // 進行方向に直交する単位ベクトル
          const hux = hdx / hdl, huy = hdy / hdl;  // 軸方向の単位ベクトル(両端の延長に使う)
          const hhw = THOR_HARAI_VIS_HALFWIDTH;
          const hFill = 0.12 + 0.22 * prog + 0.08 * pulse;
          const hpts = [
            fx - hux * hhw + hnx * hhw, fy - huy * hhw + hny * hhw,
            tx + hux * hhw + hnx * hhw, ty + huy * hhw + hny * hhw,
            tx + hux * hhw - hnx * hhw, ty + huy * hhw - hny * hhw,
            fx - hux * hhw - hnx * hhw, fy - huy * hhw - hny * hhw,
          ];
          o.poly(hpts).fill({ color: 0xff2a2a, alpha: hFill });
          o.poly(hpts).stroke({ width: 2, color: 0xff3b3b, alpha: (0.32 + 0.4 * prog) + 0.15 * pulse });
          o.moveTo(fx, fy).lineTo(tx, ty).stroke({ width: 1 + 2 * prog, color: 0xffe0e0, alpha: 0.35 + 0.35 * prog, cap: 'round' }); // 薙ぎの軸(白芯)
          // 社長指示: 刀を振るモーションの「最初の位置」に最初から構えておく。柄=トールの手元、刃先=薙ぎ
          // 始めの点(fx,fy)。実行(harai)はこの構えから contact を tx,ty へ動かして薙ぐ=構え→振りが連続。
          this.drawThorKatanaReady(e.id, fb.footX, fb.footY - fb.boxH * 0.5, fx, fy, 0.45 + 0.4 * prog);
          // §5.25 M24: ダメージ瞬間(windup終わり=sweep開始)の400ms前は鋭いフラッシュへ切替。
          const haraiFlash = thorFlashTint((e.bossStateUntil ?? gameTime) - gameTime, now);
          if (haraiFlash !== null) view.sprite.tint = haraiFlash;
        } else {
          // 払い(実行): 放った瞬間はプレイヤーの斬撃と同じピクセル演出を当たり判定に合わせて表示。
          const activeProg = Math.max(0, Math.min(1, 1 - ((e.bossStateUntil ?? gameTime) - gameTime) / THOR_HARAI_ACTIVE_MS));
          // 社長指示: 横払いは「トールを軸に刀を振る」動きにして斬撃アニメと合わせる。柄の軸=トールの
          // 手元(足元から胸の高さ)。刃先が判定ライン上を薙いでいく。
          this.drawThorSlash(e.id, fx, fy, tx, ty, THOR_HARAI_VIS_HALFWIDTH, activeProg, true, true, fb.footX, fb.footY - fb.boxH * 0.5);
        }
      } else if (e.bossState === 'jump-windup' || e.bossState === 'jump-attack') {
        // ジャンプ攻撃の着地予告(pumpkin系と同じ意匠の赤い楕円)。
        view.sprite.tint = 0xffffff;
        const tx = e.aiTargetX ?? cx, ty = e.aiTargetY ?? cy;
        if (e.bossState === 'jump-attack') {
          const pulse = 0.5 + 0.5 * Math.sin(now / 110);
          const R = THOR_JUMP_RADIUS;
          // 社長指示v0.25.1612「赤の外=安全」: 当たり判定は世界座標の真円(半径R+自機半径)。地面に寝かせた
          // 縦潰し楕円(旧ry=R*0.55)だと上下に立つと赤の外でも食らうので、真円(ry=R)で判定を覆う(判定は不変)。
          o.ellipse(tx, ty, R, R).fill({ color: 0xff2a2a, alpha: 0.16 + 0.12 * pulse });
          o.ellipse(tx, ty, R, R).stroke({ width: 2, color: 0xff3b3b, alpha: 0.45 + 0.3 * pulse });
          // §5.25 M24: jumpだけ「ダメージ瞬間」=着地(jump-attack終わり)。windupではなく空中フェーズの
          // 残り400msでフラッシュ(仕様どおりjump-windupは対象外)。
          const jumpFlash = thorFlashTint((e.bossStateUntil ?? gameTime) - gameTime, now);
          if (jumpFlash !== null) view.sprite.tint = jumpFlash;
        }
      } else {
        view.sprite.tint = 0xffffff;
      }
    }
    // ミゲル(ゲート2ボス・§5.21-追補8)の払い攻撃。トールのharai描画を流用し、範囲/太さ/剣素材だけ
    // 差し替える。横払い(harai)→縦払い(tate)の2発コンボ=各々が独立した溜め+実行(攻撃3以降は追って追加)。
    if (isGate2AngelBoss(e.type)) {
      // 天使(ゲート2ボス=ミゲル/ジブリル/ラフィ…)はミゲルの攻撃描画を流用(社長指示v0.25.1661「一旦ミゲルをそのままコピー」)。
      // 赤ゾーン予告(武器非依存=理不尽回避のため必ず出す)は共通。武器スプライト(ready/slash)は現状ミゲル専用
      // (miguel-sword)なので、ジブリルの武器=ランタンの振り演出は社長から武器の使い方を受け取ってから追加する
      // (それまでジブリルは予告+ダメージのみ=武器の絵は本体絵に描かれたランタン/剣で代替)。
      const slashFx = this.miguelSlashFx.get(e.id);
      if (slashFx) slashFx.visible = false; // 既定で非表示。実行ステートのみ下で表示する
      // 2発コンボ(横払いharai→縦払いtate)。各々が独立した溜め(*-windup)+実行を持つ(社長指示
      // v0.25.1598「縦切りも溜め=横と仕様を揃える。同時発動をやめる」)。溜めの赤ライン予告は
      // aiFrom→aiTargetの向きで横/縦が自動的に切り替わる(orientation非依存)。
      if (e.bossState === 'harai-windup' || e.bossState === 'harai' || e.bossState === 'tate-windup' || e.bossState === 'tate') {
        view.sprite.tint = 0xffffff;
        const fx = e.aiFromX ?? cx, fy = e.aiFromY ?? cy;
        const tx = e.aiTargetX ?? cx, ty = e.aiTargetY ?? cy;
        if (e.bossState === 'harai-windup' || e.bossState === 'tate-windup') {
          // 放つ前=赤いダメージゾーンの予告。社長指示v0.25.1611「レッドライン=攻撃範囲にする」:
          // 当たり判定は中心線の両側±MIGUEL_HARAI_HALF_WIDTH のカプセルなので、予告も細い線1本ではなく
          // 判定幅ぶん膨らませた矩形ゾーンで描く(トールの一閃ゾーンと同じ意匠。判定は不変=見た目だけ実寸)。
          const prog = Math.max(0, Math.min(1, 1 - ((e.bossStateUntil ?? gameTime) - gameTime) / MIGUEL_HARAI_WINDUP_MS));
          const pulse = 0.55 + 0.45 * Math.sin(now / 80);
          const ddx = tx - fx, ddy = ty - fy;
          const ddl = Math.hypot(ddx, ddy) || 1;
          const nx = -ddy / ddl, ny = ddx / ddl; // 進行方向に直交する単位ベクトル
          const ux = ddx / ddl, uy = ddy / ddl;  // 軸方向の単位ベクトル(両端の延長に使う)
          const hw = MIGUEL_HARAI_VIS_HALFWIDTH; // =当たり判定 MIGUEL_HARAI_HALF_WIDTH と一致
          const zoneFill = (0.12 + 0.22 * prog) + 0.08 * pulse;
          // 社長指示v0.25.1617「範囲攻撃の赤表示は全部四角に統一(丸を置くのをやめる)」: 両端を半幅ぶん
          // 軸方向へ延ばした角ばった四角で、判定の丸い張り出しを角で覆う(赤の外=安全は維持・判定は不変)。
          const pts = [
            fx - ux * hw + nx * hw, fy - uy * hw + ny * hw,
            tx + ux * hw + nx * hw, ty + uy * hw + ny * hw,
            tx + ux * hw - nx * hw, ty + uy * hw - ny * hw,
            fx - ux * hw - nx * hw, fy - uy * hw - ny * hw,
          ];
          o.poly(pts).fill({ color: 0xff2a2a, alpha: zoneFill });
          o.poly(pts).stroke({ width: 2, color: 0xff3b3b, alpha: (0.32 + 0.4 * prog) + 0.15 * pulse });
          // 中心線も薄く残して「薙ぎの軸」を示す(白い芯)。
          o.moveTo(fx, fy).lineTo(tx, ty).stroke({ width: 1 + 2 * prog, color: 0xffe0e0, alpha: 0.35 + 0.35 * prog, cap: 'round' });
          // 剣を振るモーションの「最初の位置」に最初から構えておく。柄=ミゲルの手元、刃先=薙ぎ始めの点。
          // 武器スプライトはミゲル専用(miguel-sword)。ジブリルは武器の使い方を受領後に別途追加(予告のみ)。
          if (e.type === 'miguel') this.drawMiguelKatanaReady(e.id, fb.footX, fb.footY - fb.boxH * 0.5, fx, fy, 0.45 + 0.4 * prog);
        } else {
          // 払い/縦払い(実行): 放った瞬間はプレイヤーの斬撃と同じピクセル演出を当たり判定に合わせて表示。
          const activeProg = Math.max(0, Math.min(1, 1 - ((e.bossStateUntil ?? gameTime) - gameTime) / MIGUEL_HARAI_ACTIVE_MS));
          if (e.type === 'miguel') this.drawMiguelSlash(e.id, fx, fy, tx, ty, MIGUEL_HARAI_VIS_HALFWIDTH, activeProg, true, true, fb.footX, fb.footY - fb.boxH * 0.5);
        }
      } else {
        view.sprite.tint = 0xffffff;
      }
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
    // 被弾フラッシュは hitFlash スプライト(絵を加算で光らせる)へ移行。丸い白フィルは廃止(裏ボスを隠さない・社長指示)。
  }

  private enemyBreath(e: Enemy, now: number) {
    if (!ENEMY_BREATH_ENABLED) return { x: 1, y: 1 };
    const heavy = e.type === 'pumpkin' || e.type === 'giantbat' || e.type === 'reaper' || e.type === 'hunter' || isHiddenBoss(e.type);
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
    const boss = e.type === 'pumpkin' || e.type === 'giantbat' || e.type === 'reaper' || e.type === 'hunter' || isHiddenBoss(e.type);
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
    g.rect(x, y, w, h).fill({ color: 0x000000, alpha: BAR_BG_ALPHA });
    const pct = e.health / e.maxHealth;
    g.rect(x, y, w * pct, h).fill({ color: pct < 0.3 ? STATUS_RED : STATUS_GREEN });
  }

  private drawStunReticle(g: Graphics, cx: number, cy: number, size: number, now: number, color = 0xfacc15) {
    const rad = size * 0.85 + 6;
    const spin = (now * 0.004) % (Math.PI * 2);
    g.circle(cx, cy, rad).fill({ color, alpha: 0.16 });
    for (let i = 0; i < 4; i++) {
      const a0 = spin + i * (Math.PI / 2) + 0.25;
      const a1 = spin + i * (Math.PI / 2) + (Math.PI / 2) - 0.25;
      // moveTo before arc: otherwise Pixi draws a connecting line from the
      // previous pen position to the arc start (stray yellow line artifact).
      g.moveTo(cx + Math.cos(a0) * rad, cy + Math.sin(a0) * rad)
        .arc(cx, cy, rad, a0, a1)
        .stroke({ width: 2, color });
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
      if (p.weaponType === 'skateboard') continue; // 投擲スケボーは syncSkateboards で別管理(スプライト)
      if (p.weaponType === 'fire-knife-projectile') continue; // 発火ナイフは syncFireKnives で別管理(専用イラスト+火種明滅)
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

  // 発火ナイフ投擲物: 専用イラスト(飛翔/刺さった状態共通、center anchorで進行方向へ回転)+
  // 刺さった時は柄側に短い火種(赤橙の明滅)を足して導火線感を出す(常時glowなし・軽量)。
  private syncFireKnives(projectiles: Projectile[], now: number) {
    const seen = new Set<string>();
    for (const p of projectiles) {
      if (p.weaponType !== 'fire-knife-projectile') continue;
      if (p.createdAt > now) continue;
      seen.add(p.id);
      let v = this.fireKnifeViews.get(p.id);
      if (!v) {
        const container = new Container();
        const gfx = new Graphics();   // 刺さった時の火種明滅(柄側)
        const sprite = new Sprite();  // ナイフ本体
        sprite.anchor.set(0.5, 0.5);
        container.addChild(gfx, sprite);
        this.L.frontObjectLayer.addChild(container);
        v = { container, gfx, sprite };
        this.fireKnifeViews.set(p.id, v);
      }
      this.drawFireKnife(v, p);
    }
    for (const [id, v] of this.fireKnifeViews) {
      if (!seen.has(id)) {
        v.container.destroy({ children: true });
        this.fireKnifeViews.delete(id);
      }
    }
  }

  private drawFireKnife(v: { container: Container; gfx: Graphics; sprite: Sprite }, p: Projectile) {
    v.container.position.set(p.x + p.width / 2, p.y + p.height / 2);
    v.container.rotation = Math.atan2(p.direction.y, p.direction.x) - FIRE_KNIFE_NATIVE_ANGLE;
    const tex = getTexture('weapons/fire-knife-projectile');
    if (tex) {
      if (v.sprite.texture !== tex) v.sprite.texture = tex;
      v.sprite.scale.set(FIRE_KNIFE_DISPLAY_LEN / FIRE_KNIFE_NATIVE_LEN);
    }
    const g = v.gfx;
    g.clear();
    if (p.isStuck) {
      const blink = 0.55 + Math.sin(Date.now() / 90) * 0.45; // 火種の明滅(導火線)
      const hiltAngle = FIRE_KNIFE_NATIVE_ANGLE + Math.PI;
      const hiltR = FIRE_KNIFE_DISPLAY_LEN * FIRE_KNIFE_HILT_RADIUS_FRAC;
      const hx = Math.cos(hiltAngle) * hiltR;
      const hy = Math.sin(hiltAngle) * hiltR;
      g.circle(hx, hy, 2.6).fill({ color: 0xf97316, alpha: 0.9 * blink });
      g.circle(hx, hy, 1.3).fill({ color: 0xfde047, alpha: blink });
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

  // 投擲スケボー(スケーター新仕様): 乗車1秒以上で指を離すと進行方向へ飛ぶ板。
  // 進行方向へ向けつつ滑走のスピン(回転)を加えて地面を滑る見た目。テクスチャ未読込時は
  // 手描きの板でフォールバック。当たり判定/挙動はストア側=ここは描画のみ。
  private syncSkateboards(projectiles: Projectile[], now: number) {
    const seen = new Set<string>();
    for (const p of projectiles) {
      if (p.weaponType !== 'skateboard') continue;
      if (p.createdAt > now) continue;
      seen.add(p.id);
      let v = this.skateboardViews.get(p.id);
      if (!v) {
        const container = new Container();
        const sprite = new Sprite();
        sprite.anchor.set(0.5);
        sprite.visible = false;
        const gfx = new Graphics();
        container.addChild(sprite, gfx);
        this.L.frontObjectLayer.addChild(container);
        v = { container, sprite, gfx };
        this.skateboardViews.set(p.id, v);
      }
      this.drawSkateboard(v, p);
    }
    for (const [id, v] of this.skateboardViews) {
      if (!seen.has(id)) {
        v.container.destroy({ children: true });
        this.skateboardViews.delete(id);
      }
    }
  }

  private drawSkateboard(v: { container: Container; sprite: Sprite; gfx: Graphics }, p: Projectile) {
    const cx = p.x + p.width / 2;
    const cy = p.y + p.height / 2;
    const age = Date.now() - p.createdAt;
    const remaining = p.duration - age;
    const alpha = Math.max(0, Math.min(1, remaining / 200)); // 末尾で素早くフェード
    // 進行方向へ向け、さらに滑走のスピンを重ねる(投げ板が回りながら滑る)。
    const heading = Math.atan2(p.direction.y, p.direction.x);
    const spin = (age / 90) % (Math.PI * 2);
    v.container.position.set(cx, cy);
    v.container.zIndex = cy;
    v.container.alpha = alpha;
    const tex = getTexture('skateboard');
    const g = v.gfx;
    g.clear();
    if (tex && tex.height > 0) {
      v.sprite.visible = true;
      v.sprite.texture = tex;
      const targetW = Math.max(28, p.width * 1.4);
      const sc = targetW / tex.width;
      v.sprite.scale.set(sc);
      v.sprite.rotation = heading + spin;
      return;
    }
    // フォールバック: テクスチャ未読込時は手描きの板(黒デッキ+黄ホイール)。
    v.sprite.visible = false;
    const hw = Math.max(14, p.width * 0.7);
    const hh = Math.max(5, p.height * 0.28);
    g.rotation = heading + spin;
    g.roundRect(-hw, -hh, hw * 2, hh * 2, hh).fill({ color: 0x111827 });
    g.circle(-hw * 0.6, hh, 2.4).fill({ color: 0xfacc15 });
    g.circle(hw * 0.6, hh, 2.4).fill({ color: 0xfacc15 });
  }

  // ドローンブーメラン投擲物: 専用イラスト(3枚羽シュリケン)を中心アンカーで常時回転させて描画。
  // 停止中(boomPhase==='stop')の射程リングは syncProjectiles/drawProjectile(Graphics)側が
  // 引き続き描く(ここはスプライト本体のみ・二重描画を避けるため drawProjectile 側からは
  // ブレード形状を削除済み)。
  private syncDroneBoomerangs(projectiles: Projectile[], now: number) {
    const seen = new Set<string>();
    for (const p of projectiles) {
      if (p.weaponType !== 'drone-boomerang-projectile') continue;
      if (p.createdAt > now) continue;
      seen.add(p.id);
      let v = this.droneBoomerangViews.get(p.id);
      if (!v) {
        const container = new Container();
        const sprite = new Sprite();
        sprite.anchor.set(0.5);
        sprite.visible = false;
        container.addChild(sprite);
        this.L.frontObjectLayer.addChild(container);
        v = { container, sprite };
        this.droneBoomerangViews.set(p.id, v);
      }
      this.drawDroneBoomerangSprite(v, p, now);
    }
    for (const [id, v] of this.droneBoomerangViews) {
      if (!seen.has(id)) {
        v.container.destroy({ children: true });
        this.droneBoomerangViews.delete(id);
      }
    }
  }

  private drawDroneBoomerangSprite(v: { container: Container; sprite: Sprite }, p: Projectile, now: number) {
    const cx = p.x + p.width / 2;
    const cy = p.y + p.height / 2;
    v.container.position.set(cx, cy);
    v.container.zIndex = cy;
    const tex = getTexture('drone-boomerang');
    if (tex && tex.height > 0) {
      v.sprite.visible = true;
      if (v.sprite.texture !== tex) v.sprite.texture = tex;
      const targetW = Math.max(1, p.width) * DRONE_BOOMERANG_SPRITE_SCALE;
      const sc = targetW / tex.width;
      v.sprite.scale.set(sc);
      // 常時回転(停止中も回り続ける=旧procedural描画と同じ演出)。
      v.sprite.rotation = (now / 90) % (Math.PI * 2);
    } else {
      // テクスチャ未読込時は何も表示しない(手描きフォールバックは追加しない)。
      v.sprite.visible = false;
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
      }
      if (captured) {
        // 武器庫(中央の小サークル)= 指を離すと遠隔で武器商人を利用(社長指示)。琥珀=ショップ色・小さめ。
        const AR = 50; // ARMORY_RADIUS と一致
        g.circle(s.x, s.y, AR).stroke({ width: 2, color: 0xfbbf24, alpha: 0.45 + 0.3 * pulse });
        g.circle(s.x, s.y, AR - 3).fill({ color: 0xfbbf24, alpha: 0.05 + 0.05 * pulse });
        // 中央に武器箱のビジュアル(社長指示)。木箱＋金属帯＋琥珀の弾薬アクセント。foot(底)= s.y。
        const bw = 30, bh = 22, bx = s.x - bw / 2, by = s.y - bh;
        g.ellipse(s.x, s.y + 2, bw * 0.55, 5).fill({ color: 0x000000, alpha: 0.28 });            // 接地影
        g.rect(bx, by, bw, bh).fill({ color: 0x5b4326, alpha: 0.97 });                            // 木箱本体
        g.rect(bx, by, bw, 5).fill({ color: 0x7a5a33, alpha: 0.97 });                             // 上面ハイライト
        g.rect(bx + 5, by, 3, bh).fill({ color: 0x3f3a33, alpha: 0.95 });                         // 金属帯(縦)
        g.rect(bx + bw - 8, by, 3, bh).fill({ color: 0x3f3a33, alpha: 0.95 });                    // 金属帯(縦)
        g.rect(bx, by + bh / 2 - 1.5, bw, 3).fill({ color: 0x3f3a33, alpha: 0.9 });               // 金属帯(横)
        g.rect(bx + bw / 2 - 4, by + bh / 2 - 3, 8, 6).fill({ color: 0xfbbf24, alpha: 0.55 + 0.35 * pulse }); // 弾薬色アクセント(脈動)
        g.rect(bx, by, bw, bh).stroke({ width: 1.5, color: 0x2a2018, alpha: 0.9 });               // 縁
      }
      // 兵士本体は立ち絵スプライト(drawBaseSoldiers)で描く=ここではマーカーを出さない。
    }
    this.drawBaseSoldiers(sites, now);
  }

  // ハンターの視界(索敵)範囲を薄い紫サークルで表示(社長指示)。撤退中は出さない。
  // ジャンプ範囲もこの円内に限定(store 側でゲート)=見た目と挙動が一致する。
  private syncHunterVision(enemies: Enemy[], now: number) {
    const g = this.hunterVisionGfx;
    g.clear();
    if (this.isLabStage) return;
    const R = HUNTER_VISION_RANGE;
    const pulse = 0.6 + 0.4 * Math.sin(now / 620);
    for (const e of enemies) {
      if (e.type !== 'hunter' || e.hunterFleeing) continue;
      const cx = e.x + e.width / 2, cy = e.y + e.height / 2;
      if (this.distanceOutsideViewport(cx, cy, R + 40) > 0) continue; // 円が完全に画面外なら描かない
      g.circle(cx, cy, R).fill({ color: 0x7c3aed, alpha: 0.05 });                          // 薄い紫の塗り
      g.circle(cx, cy, R).stroke({ width: 3, color: 0xa78bfa, alpha: 0.12 + 0.08 * pulse }); // 境界(脈動)
    }
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
          const sc = this.humanNpcScale(tex.width, tex.height, sol.y); // プレイヤーと同寸
          sp.scale.set(sc * fc.face, sc);
          sp.alpha = this.horizonActorAlpha(sol.y); // 地平線で透明化(空に浮かない)
          sp.visible = sp.alpha > 0;
        } else sp.visible = false;
        sp.position.set(Math.round(sol.x), Math.round(sol.y));
        sp.zIndex = sol.y;
      });
    }
    for (const [id, sp] of this.baseSoldierSprites) {
      if (!seen.has(id)) { sp.destroy(); this.baseSoldierSprites.delete(id); this.baseSoldierFace.delete(id); }
    }
  }

  // 護衛軍人NPC(前進・射撃)の立ち絵。shooter 素材を流用、足元アンカー・y-sort・歩行2コマ。
  // 向きは store の esc.face を使う(描画のみ・シミュレーション非干渉)。
  private drawEscorts(escorts: EscortSoldier[], now: number) {
    const seen = new Set<string>();
    // 3コマ立ち絵(-2 あり)は接地A→通過→接地B→通過 のピンポン[0,1,2,1]、2コマのみは従来[0,1](社長指示)。
    const step = Math.floor(now / PixiScene.RESCUE_WALK_FRAME_MS);
    for (const esc of escorts) {
      seen.add(esc.id);
      let sp = this.escortSprites.get(esc.id);
      if (!sp) { sp = new Sprite(); sp.anchor.set(0.5, 1); this.L.actorLayer.addChild(sp); this.escortSprites.set(esc.id, sp); }
      // soldierIndex ごとのユニーク立ち絵(社長提供)。未提供のNPCは従来の shooter 素材へフォールバック。
      // チュートリアルの衛生兵(TUTORIAL_MEDIC_INDEX)は専用4コマ(ピンポン)。
      const base = esc.soldierIndex === TUTORIAL_MEDIC_INDEX
        ? 'npc/medic-walk'
        : (ESCORT_SPRITE_BASE[esc.soldierIndex] ?? 'rescue/shooter');
      const seq = getTexture(`${base}-3`) ? PixiScene.ESCORT_WALK_SEQ_4
        : getTexture(`${base}-2`) ? PixiScene.ESCORT_WALK_SEQ_3 : PixiScene.ESCORT_WALK_SEQ_2;
      // 追従NPC(moving=false)は静止コマで止める(その場行進を防ぐ)。衛生兵(4コマ)は2=足閉じ
      // (社長指示v0.25.1855「立ち止まってる時の立ち絵を足閉じてるやつに」)。他(3コマ規約)は従来どおり0。
      const animate = esc.moving !== false;
      const idleFrame = esc.soldierIndex === TUTORIAL_MEDIC_INDEX ? 2 : 0;
      const walkFrame = animate ? seq[step % seq.length] : idleFrame;
      const tex = getTexture(`${base}-${walkFrame}`) ?? getTexture(`${base}-0`) ?? getTexture('rescue/shooter-0');
      // クロスフェード補間(対象NPCのみ): コマ内の進行率 frac で「次コマ」を上に α=frac で重ね、
      // 170msごとのパッ切り替えを連続化する。隣接コマは常に接地↔通過なので混色=中間歩に見える。
      const crossfade = ESCORT_CROSSFADE_SOLDIERS.has(esc.soldierIndex);
      const frac = crossfade ? (now % PixiScene.RESCUE_WALK_FRAME_MS) / PixiScene.RESCUE_WALK_FRAME_MS : 0;
      const nextFrame = seq[(step + 1) % seq.length];
      const nextTex = crossfade ? (getTexture(`${base}-${nextFrame}`) ?? tex) : null;

      // 徒歩の自然化(プレイヤーと同じ二次モーション・視覚のみ・判定不変)。護衛は常時行進なので位相は
      // 時間から連続生成し、コマ周期(seq.length×フレーム時間)に同期させてスカッシュ&ストレッチの山を
      // 通過コマに合わせる。接地(lift=0)で縦に潰れ横に広がり、遊脚(lift=1)で縦に伸び横が締まる＋左右リーン。
      const cycleMs = seq.length * PixiScene.RESCUE_WALK_FRAME_MS;
      const phase = (now / cycleMs) * Math.PI * 2;
      const stepS = animate ? Math.sin(phase) : 0;
      const lift = Math.abs(stepS); // 0=接地 / 1=遊脚中(最高点)。静止中は常に接地扱い
      const walkSqY = animate ? 1 + PLAYER_WALK_SQUASH * lift - PLAYER_WALK_SQUASH * 0.5 * (1 - lift) : 1;
      const walkSqX = animate ? 1 - PLAYER_WALK_SQUASH * 0.8 * lift + PLAYER_WALK_SQUASH * 0.4 * (1 - lift) : 1;
      const walkLean = stepS * PLAYER_WALK_LEAN_RAD;

      const bob = lift * PLAYER_WALK_BOB_PX * this.depthScale(esc.y); // 接地↔遊脚の上下動(遠近スケール連動)
      const px = Math.round(esc.x), py = Math.round(esc.y - bob);
      const faceSign = esc.face < 0 ? -1 : 1;
      const baseAlpha = this.horizonActorAlpha(esc.y) * this.currentIntroFade(now);
      if (tex) {
        sp.texture = tex;
        // 衛生兵はドット規格(78x64=横長キャンバス)のため contain-fit だと幅律速で小さくなる。
        // 高さ基準で他NPCと同じ表示高に揃える(社長指示v0.25.1825「大きさ揃えて」)。
        const sc = esc.soldierIndex === TUTORIAL_MEDIC_INDEX
          ? (PixiScene.RESCUE_NPC_DISPLAY_H / tex.height) * this.depthScale(esc.y)
          // NPC8人(index0..7)のみ0.8倍(社長指示v0.25.1858)。チュートリアル随行(100/101)は等倍。
          : this.humanNpcScale(tex.width, tex.height, esc.y) * (esc.soldierIndex < 8 ? NPC8_SCALE : 1);
        sp.scale.set(sc * walkSqX * faceSign, sc * walkSqY);
        sp.rotation = walkLean;
        // 登場演出中はヘリ離陸タイミングでフェードイン(プレイヤーと同期)。上下左右の4人がこれに該当。
        sp.alpha = baseAlpha;
        sp.visible = sp.alpha > 0;
      } else sp.visible = false;
      sp.position.set(px, py);
      sp.zIndex = esc.y;
      // クロスフェードの「次コマ」重ね(同じ変換・同じ足元)。α=frac で徐々に前コマを覆う=A/Bクロスフェード。
      if (crossfade && tex && nextTex && baseAlpha > 0) {
        let bl = this.escortBlendSprites.get(esc.id);
        if (!bl) { bl = new Sprite(); bl.anchor.set(0.5, 1); this.L.actorLayer.addChild(bl); this.escortBlendSprites.set(esc.id, bl); }
        bl.texture = nextTex;
        const sc = this.humanNpcScale(nextTex.width, nextTex.height, esc.y);
        bl.scale.set(sc * walkSqX * faceSign, sc * walkSqY);
        bl.rotation = walkLean;
        bl.position.set(px, py);
        bl.zIndex = esc.y + 0.001; // 主スプライトの直上
        bl.alpha = baseAlpha * frac;
        bl.visible = bl.alpha > 0.003;
      } else {
        const bl = this.escortBlendSprites.get(esc.id);
        if (bl) bl.visible = false;
      }
    }
    for (const [id, sp] of this.escortSprites) {
      if (!seen.has(id)) {
        sp.destroy(); this.escortSprites.delete(id);
        const bl = this.escortBlendSprites.get(id);
        if (bl) { bl.destroy(); this.escortBlendSprites.delete(id); }
      }
    }
  }

  // 援護射撃(support-sniper・PACING_PUZZLE.md §6.5 M28)のNPC=「この出撃で護衛に出ていない軍人」の
  // 立ち絵(§6.9 M32社長訂正v0.25.1727: プレイアブル4クラスではなくエドガー等の軍人NPC。
  // ESCORT_SPRITE_BASE[soldierIndex] の静止コマ0を護衛と同じ humanNpcScale=プレイヤー同寸で描く)。
  // 1枚のプールSprite。
  // 位置/タイミングは sim 側の supportSniperNpc(縁の交点+向き+打刻)からここで補間するだけ(書き込みなし):
  // スライドイン250ms(縁の外30px→内60px・easeOut+フェードイン)→発射→向きを変えずに同じ軸で
  // 後退350ms(easeIn+フェードアウト)。同時1人・イベント駆動=軽い(強glow不使用)。
  private drawSupportSniper(npc: SupportSniperNpcState | null, gameTime: number) {
    let sp = this.supportSniperSprite;
    if (!npc) { if (sp) sp.visible = false; return; }
    if (!sp) {
      sp = new Sprite();
      sp.anchor.set(0.5, 1);
      this.L.actorLayer.addChild(sp);
      this.supportSniperSprite = sp;
    }
    // 軍人立ち絵の静止コマ0(未提供indexは護衛と同じ rescue/shooter フォールバック)。
    const base = ESCORT_SPRITE_BASE[npc.soldierIndex] ?? 'rescue/shooter';
    const tex = getTexture(`${base}-0`) ?? getTexture('rescue/shooter-0');
    if (!tex) { sp.visible = false; return; }
    // スライド位置: 縁の交点(npc.x/y)を基準に、向き(dir=敵の方向)の軸上で 外(-START_OUT)→内(+INSET)。
    let offset: number;
    let alpha: number;
    if (npc.firedAt <= 0) {
      const inT = Math.max(0, Math.min(1, (gameTime - npc.spawnedAt) / SUPPORT_SNIPER_SLIDE_IN_MS));
      const e = 1 - (1 - inT) * (1 - inT); // easeOutQuad(スッと出て止まる)
      offset = -SUPPORT_SNIPER_SLIDE_START_OUT + (SUPPORT_SNIPER_SLIDE_START_OUT + SUPPORT_SNIPER_INSET) * e;
      alpha = Math.min(1, inT * 1.6);
    } else {
      const outT = Math.max(0, Math.min(1, (gameTime - npc.firedAt) / SUPPORT_SNIPER_SLIDE_OUT_MS));
      const e = outT * outT; // easeInQuad(ゆっくり下がり始めてスッと消える)
      offset = SUPPORT_SNIPER_INSET - (SUPPORT_SNIPER_SLIDE_START_OUT + SUPPORT_SNIPER_INSET) * e;
      alpha = 1 - outT;
    }
    const px = npc.x + npc.dirX * offset;
    const py = npc.y + npc.dirY * offset;
    sp.texture = tex;
    // スケール=護衛軍人と同じ humanNpcScale(プレイヤー同寸・遠近込み)。
    const sc = this.humanNpcScale(tex.width, tex.height, py);
    const faceSign = npc.dirX >= 0 ? 1 : -1; // 向き=敵の方向。発射後も変えない(そのまま後退)
    sp.scale.set(sc * faceSign, sc);
    sp.alpha = alpha * this.horizonActorAlpha(py);
    sp.visible = sp.alpha > 0.01;
    sp.position.set(Math.round(px), Math.round(py));
    sp.zIndex = py;
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

  // 深層域グレーディング: 深層域(eligible かつ原点距離>=D)の間だけ stage ルートへ退色セピアの
  // ColorMatrixFilter を掛け、enter/exit を約1秒でフェード(filter.alpha 補間)。描画のみ=store非干渉。
  // 紅き夜(redNightActive)中は血赤マトリクスに切り替え、距離によらず全画面に掛ける。
  // amount≈0 のときはフィルタを外して全画面パスを発生させない(非深層域での追加コスト無し)。
  private syncDeepZoneGrade(eligible: boolean, originDist: number, now: number, redNightActive: boolean, gateActive = false, deepLocked = false) {
    if (!DEEP_ZONE_GRADE_ENABLED) return;
    const dt = this.lastGradeNow ? Math.min(0.1, (now - this.lastGradeNow) / 1000) : 0;
    this.lastGradeNow = now;

    // マトリクス切り替え: モードが変わったらフィルタを更新。
    const prevRedNight = this.deepGradeIsRedNight;
    this.deepGradeIsRedNight = redNightActive;

    if (redNightActive) {
      // 紅き夜: 距離によらず強制 ON。
      this.deepGradeOn = true;
    } else if (FORCE_DEEP_ZONE) {
      // ?deepzone=1 診断: 距離/eligibleを無視して深層域セピアを常時ON(退色グレードの重さ検証)。
      this.deepGradeOn = true;
    } else if (deepLocked) {
      // 社長報告v0.25.1670「ゲート2入った時、まだ深層域に入っちゃってる」: ゲート2は境界を跨いだ後に発火する
      // ため、発火前の隙間でセピアが先に入っていた(gateActive凍結はその後の固定しかできない)。
      // → ゲート2を倒すまで(deepZoneLocked)は深層セピアに入らない(強制OFF)。クリアの瞬間に通常判定へ→フェードイン。
      this.deepGradeOn = false;
    } else if (gateActive) {
      // 社長指示v0.25.1667「ゲートを超えない限りエリア切替を発動しない」: ゲート戦闘中は深層域セピアの
      // ON/OFF を現在のまま凍結。ゲート2の境界(=DEEP_ZONE_GRADE_D)の上にアリーナが張られるため、戦闘中に
      // 境界を行き来してもセピアが行ったり来たりしないよう据え置く。ゲートを超え(クリアし)たら通常判定へ戻る。
    } else {
      // 通常の深層域ヒステリシス(行ったり来たりでポップしない): enter=D / exit=D-200。
      if (eligible) {
        if (this.deepGradeOn) { if (originDist < DEEP_ZONE_GRADE_D - 200) this.deepGradeOn = false; }
        else if (originDist >= DEEP_ZONE_GRADE_D) this.deepGradeOn = true;
      } else {
        this.deepGradeOn = false;
      }
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
      this.deepGradeFilter.matrix = redNightActive
        ? buildRedNightMatrix()
        : buildDeepGradeMatrix(DEEP_ZONE_GRADE_SAT);
    } else if (prevRedNight !== redNightActive) {
      // モード切り替え時にマトリクスを更新。
      this.deepGradeFilter.matrix = redNightActive
        ? buildRedNightMatrix()
        : buildDeepGradeMatrix(DEEP_ZONE_GRADE_SAT);
    }
    const cur = this.L.stage.filters as Filter[] | null;
    if (!cur || !cur.includes(this.deepGradeFilter)) this.L.stage.filters = [this.deepGradeFilter];
    this.deepGradeFilter.alpha = this.deepGradeAmount; // 単位行列↔カラーマトリクスの線形補間(描画のみ)
  }

  // 救助NPC(survivor)の描画。本体は受領素材スプライト(2コマ歩き・足元アンカーで y-sort)、
  // HPバー/コールアウトは rescueGfx(常に最前)。本体スプライトは id ごとにプール/プルーン。
  private static readonly RESCUE_NPC_DISPLAY_H = 65; // 表示の基準高さ(px)。社長指示で 54→65(×1.2)。当たり判定(RESCUE_SURVIVOR_SIZE)も同率で拡大。
  private static readonly RESCUE_WALK_FRAME_MS = 170;
  private static readonly ESCORT_WALK_SEQ_2 = [0, 1];          // 2コマ立ち絵の歩行
  private static readonly ESCORT_WALK_SEQ_3 = [0, 1, 2, 1];    // 3コマ立ち絵(社長提供): 接地A→通過→接地B→通過
  private static readonly ESCORT_WALK_SEQ_4 = [0, 1, 2, 3, 2, 1]; // 4コマ立ち絵(衛生兵): ピンポン(社長指定)
  // 人型NPC(レスキュー/護衛/駐留兵)をプレイヤーと同じくらいの見た目サイズで描く(社長指示)。
  // 表示基準高さ RESCUE_NPC_DISPLAY_H の枠へ contain-fit ＋ プレイヤーと同じ遠近曲線(depthScale)。
  private humanNpcScale(texW: number, texH: number, footY: number): number {
    return containScale(PixiScene.RESCUE_NPC_DISPLAY_H, PixiScene.RESCUE_NPC_DISPLAY_H, texW, texH) * this.depthScale(footY);
  }

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
        const sc = this.humanNpcScale(tex.width, tex.height, footY); // プレイヤーと同寸(同じスケール規定)
        // 左右の向き: vx を平滑化(EMA)＋デッドゾーンで決め、パタパタ反転を防ぐ(素材は右向き想定)。
        let fs = this.rescueFace.get(s.id);
        if (!fs) { fs = { vx: s.vx, face: 1 }; this.rescueFace.set(s.id, fs); }
        fs.vx = fs.vx * 0.82 + s.vx * 0.18;
        if (fs.vx > 7) fs.face = 1; else if (fs.vx < -7) fs.face = -1; // 範囲内は現状維持
        sp.scale.set(sc * fs.face, sc);
        sp.visible = true;
      }
      // 救助成功の退場: 走りながらフェードアウト。さらに地平線フェード(空に浮かない=他アクターと同じ)。
      const outroA = s.savedAt ? Math.max(0, 1 - (now - s.savedAt) / RESCUE_OUTRO_MS) : 1;
      sp.alpha = outroA * this.horizonActorAlpha(s.y);
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
      g.rect(bx, by, bw, 3).fill({ color: 0x000000, alpha: BAR_BG_ALPHA });
      g.rect(bx, by, bw * frac, 3).fill({ color: STATUS_GREEN });
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
    // 弾も敵/プロップと同じ地平線フェードで消す(社長指示v0.25.1810: 奥へ飛んだ弾が遠景の
    // ボケ帯で巨大に滲んで見える対策)。見た目のみ・判定/飛距離は不変。手前(画面下端)の
    // near-planeフェードは掛けない(プレイヤーが画面下端にいる時に自弾が薄くなるのを避ける)。
    g.alpha = this.horizonActorAlpha(p.y + p.height);
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
        // A2弾トレーサー: 弾本体(既存の伸びた矩形)の後方にもう一段薄く長い尾を敷くだけ
        // (同じpooled Graphicsへの追加fill1回=新規オブジェクトなし)。
        if (BULLET_TRACER_ENABLED) {
          const tailLen = len * 2;
          g.rect(-len / 2 - tailLen, -hh / 3, tailLen, hh * 0.66).fill({ color: p.crit ? 0xfde047 : 0xfef3c7, alpha: 0.25 });
        }
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
        if (BULLET_TRACER_ENABLED) {
          const tailLen = len * 1.8;
          g.rect(-len / 2 - tailLen, -hh / 3, tailLen, hh * 0.66).fill({ color: 0xffedd5, alpha: 0.22 });
        }
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
      case 'drone-boomerang-projectile': {
        // 本体(3枚羽シュリケンのスプライト)は syncDroneBoomerangs 側で描画。ここは停止中
        // (boomPhase==='stop')の判定範囲リングのみ(二重描画を避けるため procedural ブレードは廃止)。
        if (p.boomPhase === 'stop') {
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
        else if (STRONG_GLOW_DISABLED) this.hideEffectView(e.id); // ?glow=0 診断: 強glowを描かない(既存プールviewも隠す)
        else this.drawStrongGlowSprite(e, now);
      } else if (e.kind === 'whip') {
        this.drawWhipSprite(e, now);
      } else if (e.kind === 'firejet') {
        this.drawFireJetSprite(e, now);
      } else if (e.kind === 'slash') {
        this.drawSlashSprite(e, now);
      } else if (e.kind === 'particle') {
        this.drawParticleSprite(e, now);
      } else if (e.kind === 'ring') {
        this.drawRingSprite(e, now);
      } else if (e.kind === 'trail') {
        this.drawTrailSprite(e, now);
      } else if (e.kind === 'multiHit') {
        this.drawMultiHitBanner(e, now);
      }
      // 施策1: 全kindがプールsprite化され、per-frame Graphics(clear()+再テッセレーション)の
      // フォールバック経路は撤去した(旧 drawEffectGfx)。ベンチのFX-R/P FAIL筋の解消。
    }
    for (const [id, obj] of this.effects) {
      if (!seen.has(id)) {
        obj.destroy({ children: true }); // 強glowは子(halo/core)を持つ Container なので子も破棄(共有texは保持)
        this.effects.delete(id);
      }
    }
  }

  // ---- 施策1: particle/ring/trail のプールsprite描画(旧 drawEffectGfx=per-frame Graphics を全廃) ----
  // 旧経路はエフェクト1個につき毎フレーム clear()+複数図形の再テッセレーションで、ベンチの
  // FX-P(P64)/FX-R(R8) FAIL の主因だった。以下は共有テクスチャの tint/scale/alpha 更新のみ=敵スプライト並みに安い。
  // 見た目は旧Graphicsの図形(円fill/円周stroke/直線stroke)を同形状のテクスチャで再現する(仕様不変)。

  // rgba文字列のアルファ成分(旧Graphicsは色文字列のαもfill/strokeに反映していたため、spriteでも掛ける)。
  private cssAlpha(color: string): number {
    const m = color.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)/);
    return m ? Math.max(0, Math.min(1, Number(m[1]))) : 1;
  }

  // particle: 共有円盤テクスチャ3枚(halo/本体/芯)。形・色・相対αは生成時に一度だけ設定し、
  // 毎フレームは位置と全体フェードのみ更新(旧: 毎フレーム円fill×3の再テッセレーション)。
  private drawParticleSprite(e: Extract<VisualEffect, { kind: 'particle' }>, now: number) {
    const t = Math.min(1, (now - e.createdAt) / e.duration);
    let view = this.effects.get(e.id);
    if (!(view instanceof Container) || !(view as { __particleFx?: boolean }).__particleFx) {
      if (view) view.destroy({ children: true });
      const c = new Container();
      (c as { __particleFx?: boolean }).__particleFx = true;
      const tex = getCircleTexture();
      const halo = new Sprite(tex); halo.anchor.set(0.5);
      const body = new Sprite(tex); body.anchor.set(0.5);
      const core = new Sprite(tex); core.anchor.set(0.5);
      const r = e.size;
      if (e.liquid) {
        // 液体: 通常合成。下敷きの暗い楕円+本体+左上ハイライト(旧と同配色・同形状)。
        halo.blendMode = 'normal'; halo.tint = 0x052e16; halo.alpha = 0.46;
        halo.width = r * 1.45 * 2; halo.height = r * 0.95 * 2;
        body.blendMode = 'normal'; body.tint = this.glowTint(e.color); body.alpha = 0.92 * this.cssAlpha(e.color);
        body.width = body.height = r * 2;
        core.blendMode = 'normal'; core.tint = 0xd9f99d; core.alpha = 0.28;
        core.width = core.height = r * 0.34 * 2;
        core.position.set(-r * 0.28, -r * 0.22);
      } else {
        // 加算の火花: 柔halo+色本体+白い熱芯(旧と同半径・同α)。
        halo.blendMode = 'add'; halo.tint = this.glowTint(e.color); halo.alpha = 0.22;
        halo.width = halo.height = r * 2.6 * 2;
        body.blendMode = 'add'; body.tint = this.glowTint(e.color); body.alpha = this.cssAlpha(e.color);
        body.width = body.height = r * 2;
        core.blendMode = 'add'; core.tint = 0xffffff; core.alpha = 0.75;
        core.width = core.height = r; // 半径 0.5r
      }
      c.addChild(halo, body, core);
      this.L.effectLayer.addChild(c);
      this.effects.set(e.id, c);
      view = c;
    }
    view.visible = true;
    view.position.set(e.x, e.y);
    view.alpha = e.liquid ? Math.max(0, 1 - t * 0.88) : Math.max(0, 1 - t);
  }

  // ring: 段階ベース半径で焼いた白アニュラス(色リング+白熱芯の2枚)を scale で拡げる。
  // 終端半径に最も近いベースを選び、太さのひずみを±√2以内に抑える(旧: 毎フレーム円周stroke×3)。
  private drawRingSprite(e: Extract<VisualEffect, { kind: 'ring' }>, now: number) {
    const t = Math.min(1, (now - e.createdAt) / e.duration);
    let view = this.effects.get(e.id);
    if (!(view instanceof Container) || !(view as { __ringFx?: boolean }).__ringFx) {
      if (view) view.destroy({ children: true });
      const c = new Container();
      (c as { __ringFx?: boolean; __ringBase?: number }).__ringFx = true;
      let base = RING_TEX_BASES[RING_TEX_BASES.length - 1];
      for (const b of RING_TEX_BASES) { if (e.endRadius <= b * 1.42) { base = b; break; } }
      (c as { __ringBase?: number }).__ringBase = base;
      const ringSp = new Sprite(getRingTexture(base)); ringSp.anchor.set(0.5); ringSp.blendMode = 'add';
      ringSp.tint = this.glowTint(e.color);
      const coreSp = new Sprite(getRingCoreTexture(base)); coreSp.anchor.set(0.5); coreSp.blendMode = 'add';
      c.addChild(ringSp, coreSp);
      this.L.effectLayer.addChild(c);
      this.effects.set(e.id, c);
      view = c;
    }
    const c = view as Container;
    const base = (c as { __ringBase?: number }).__ringBase ?? 64;
    const ringSp = c.children[0] as Sprite;
    const coreSp = c.children[1] as Sprite;
    const radius = e.startRadius + (e.endRadius - e.startRadius) * t;
    const s = radius / base;
    c.visible = true;
    c.position.set(e.x, e.y);
    c.alpha = 1 - t;
    ringSp.scale.set(s);
    ringSp.alpha = this.cssAlpha(e.color);
    coreSp.scale.set(s);
    coreSp.alpha = 0.5 * (1 - t); // 旧: 白芯は全体フェードと二重で減衰
  }

  // trail: 白テクスチャ1枚を線分として伸縮(旧: 毎フレーム直線stroke)。groundLayer は旧経路と同じ。
  private drawTrailSprite(e: Extract<VisualEffect, { kind: 'trail' }>, now: number) {
    const t = Math.min(1, (now - e.createdAt) / e.duration);
    let sprite = this.effects.get(e.id);
    if (!(sprite instanceof Sprite) || !(sprite as { __trailFx?: boolean }).__trailFx) {
      if (sprite) sprite.destroy();
      const sp = new Sprite(Texture.WHITE);
      (sp as { __trailFx?: boolean }).__trailFx = true;
      sp.anchor.set(0, 0.5);
      sp.blendMode = 'add';
      this.L.groundLayer.addChild(sp);
      this.effects.set(e.id, sp);
      sprite = sp;
    }
    const sp = sprite as Sprite;
    const dx = e.toX - e.fromX, dy = e.toY - e.fromY;
    const len = Math.hypot(dx, dy) * t;
    sp.position.set(e.fromX, e.fromY);
    sp.rotation = Math.atan2(dy, dx);
    sp.scale.set(len / Math.max(1, sp.texture.width), 2.5 / Math.max(1, sp.texture.height));
    sp.tint = this.glowTint(e.color);
    sp.alpha = (1 - t) * this.cssAlpha(e.color);
    sp.visible = len > 0.5;
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

  // 銃弾ヒット時、被弾敵の背中側へ生やす火の破裂(2コマ立ち絵)。素材は右向き=+x基準で、根元(左中央)を
  // 出口点に合わせて angle へ回転。0=大きい爆発(前半)→1=細い噴射(後半)。加算で発光、終盤フェード。
  // プールsprite 1枚=安い(per-frame Graphics でも Text でもない)。
  private drawFireJetSprite(e: Extract<VisualEffect, { kind: 'firejet' }>, now: number) {
    const t = Math.min(1, (now - e.createdAt) / e.duration);
    let sprite = this.effects.get(e.id);
    if (!(sprite instanceof Sprite)) {
      if (sprite) sprite.destroy();
      sprite = new Sprite();
      (sprite as Sprite).anchor.set(0, 0.5); // 根元(左中央)を出口点へ
      (sprite as Sprite).blendMode = 'add';  // 火=加算で発光
      this.L.effectLayer.addChild(sprite);
      this.effects.set(e.id, sprite);
    }
    const sp = sprite as Sprite;
    const tex0 = getTexture('fx/hitfire-0');
    const tex1 = getTexture('fx/hitfire-1') ?? tex0;
    const tex = t < 0.5 ? tex0 : tex1; // 左→右(大きい爆発→細い噴射)
    if (!tex || !tex0) { sp.visible = false; return; }
    if (sp.texture !== tex) sp.texture = tex;
    // 両コマとも frame0 の幅を基準にスケール=コマ1(細い)は自然に短く見える(歪ませない)。
    sp.scale.set(e.len / Math.max(1, tex0.width));
    sp.position.set(e.x, e.y);
    sp.rotation = e.angle;
    sp.alpha = t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4); // 終盤フェード
    sp.visible = true;
  }

  // 斬撃エフェクト(ピクセル・社長提供5コマ)。Container に streak(斬撃線)＋burst(中央の当たりバースト)の
  // プールsprite2枚。streak は「右上寄せでグロー(0→4)→折り返して左下寄せでシュリンク(4→0)」で流れるよう動かす。
  // burst は斬撃中央で 0→4 にポップしてフェード。per-frame Graphics ではなくテクスチャ差し替えのみ=安い。
  private drawSlashSprite(e: Extract<VisualEffect, { kind: 'slash' }>, now: number) {
    const t = Math.min(1, (now - e.createdAt) / e.duration);
    let view = this.effects.get(e.id);
    if (!(view instanceof Container) || (view as Container).children.length < 2) {
      if (view) view.destroy({ children: true });
      const c = new Container();
      const streak = new Sprite(); streak.blendMode = 'add';
      const burst = new Sprite(); burst.anchor.set(0.5, 0.5); burst.blendMode = 'add';
      c.addChild(streak, burst);
      this.L.effectLayer.addChild(c);
      this.effects.set(e.id, c);
      view = c;
    }
    const c = view as Container;
    const streak = c.children[0] as Sprite;
    const burst = c.children[1] as Sprite;
    const ref = getTexture('fx/slash-streak-4');
    if (!ref) { c.visible = false; return; }
    c.visible = true;
    // streak: 最大コマ基準で e.length にスケール。小コマは自然に小さく描かれる(=段々大きく)。
    // 向き: 右(face=1)は「左下→右上」に流れる。左(face=-1)は水平反転(scale.x<0)で「右下→左上」。
    const sign = (e.face ?? 1) < 0 ? -1 : 1;
    const sc = e.length / Math.max(1, ref.width);
    const halfW = (ref.width * sc) / 2, halfH = (ref.height * sc) / 2;
    let idx: number;
    if (t < 0.5) {
      idx = Math.min(4, Math.floor((t / 0.5) * 5));      // 0→4 グロー(下の端から伸びる)
      streak.anchor.set(0, 1);                            // 左下の端(bottom-left tip)を固定
      streak.position.set(e.x - halfW * sign, e.y + halfH);
    } else {
      idx = Math.max(0, 4 - Math.floor(((t - 0.5) / 0.5) * 5)); // 4→0 シュリンク(上の端へ収束)
      streak.anchor.set(1, 0);                            // 右上の端(top-right tip)を固定
      streak.position.set(e.x + halfW * sign, e.y - halfH);
    }
    const stex = getTexture(`fx/slash-streak-${idx}`) ?? ref;
    if (streak.texture !== stex) streak.texture = stex;
    streak.scale.set(sc * sign, sc);                     // face=-1 で水平反転
    streak.alpha = 1 - Math.max(0, (t - 0.75) / 0.25);   // 終盤フェード
    // burst: 斬撃中央で 0→4 にポップ→フェード。
    const bref = getTexture('fx/slash-burst-4');
    const bidx = Math.min(4, Math.floor(t * 6));
    const btex = getTexture(`fx/slash-burst-${bidx}`);
    if (btex && bref) {
      if (burst.texture !== btex) burst.texture = btex;
      burst.scale.set((e.length * 0.5) / Math.max(1, bref.width)); // 中央バーストを小さく(社長指示。0.85→0.5)
      burst.position.set(e.x, e.y);
      burst.alpha = 1 - Math.max(0, (t - 0.5) / 0.5);
      burst.visible = burst.alpha > 0.01;
    } else burst.visible = false;
  }

  // トール/ミゲル(一閃/突き/払い)共通: drawSlashSprite と同じピクセル素材(fx/slash-streak-*,
  // fx/slash-burst-*)を、プレイヤーの斬撃のような固定斜め向きではなく、実際の当たり判定ライン
  // (fx,fy→tx,ty・半幅halfWidth)に合わせて回転・伸縮して表示する(社長指示: 一閃/突き/払いを
  // 斬撃ピクセルで当たり判定どおりにモーション)。ボス種ごとの差分(FXマップ/剣テクスチャ/柄フラク
  // 座標/柄→切っ先角度・長さ比・表示長)をパラメータ化し、drawThorSlash/drawMiguelSlash から呼ぶ
  // (§5.21-追補8: 剣の見た目だけ差し替えたいのでヘルパーを共通化・専用関数の重複を避ける)。
  // t: 0(このステートの開始)→1(終了)の進行度。0-0.5でstreakが伸びる(溜め=予告)、0.5-1で縮む(実行=フェード)。
  // burst=trueの間だけ命中点(tx,ty)にバーストがポップ(実行中の手応え。溜め中は出さない)。
  private drawKatanaSlash(
    fxMap: Map<string, Container>, gripFrac: { x: number; y: number }, intrinsicAngle: number,
    bladeLenFrac: number, katanaLength: number, katanaTexName: string,
    id: string, fx: number, fy: number, tx: number, ty: number, halfWidth: number, t: number, burst: boolean,
    showKatana = false, pivotX?: number, pivotY?: number
  ) {
    let c = fxMap.get(id);
    if (!c) {
      const streak = new Sprite(); streak.blendMode = 'add'; streak.anchor.set(0.5, 0.5);
      const burstSp = new Sprite(); burstSp.anchor.set(0.5, 0.5); burstSp.blendMode = 'add';
      const katana = new Sprite(); katana.anchor.set(gripFrac.x, gripFrac.y);
      c = new Container();
      c.addChild(streak, burstSp, katana);
      this.L.effectLayer.addChild(c);
      fxMap.set(id, c);
    }
    const streak = c.children[0] as Sprite;
    const burstSp = c.children[1] as Sprite;
    const katana = c.children[2] as Sprite;
    const ref = getTexture('fx/slash-streak-4');
    if (!ref) { c.visible = false; return; }
    c.visible = true;
    const length = Math.hypot(tx - fx, ty - fy);
    const angle = Math.atan2(ty - fy, tx - fx);
    const sc = length / Math.max(1, ref.width);
    const vsc = (halfWidth * 2) / Math.max(1, ref.height);
    const tt = Math.max(0, Math.min(1, t));
    const idx = tt < 0.5 ? Math.min(4, Math.floor((tt / 0.5) * 5)) : Math.max(0, 4 - Math.floor(((tt - 0.5) / 0.5) * 5));
    const stex = getTexture(`fx/slash-streak-${idx}`) ?? ref;
    if (streak.texture !== stex) streak.texture = stex;
    streak.position.set((fx + tx) / 2, (fy + ty) / 2);
    streak.rotation = angle;
    streak.scale.set(sc, vsc);
    streak.alpha = tt < 0.5 ? (0.35 + 0.5 * (tt / 0.5)) : (1 - Math.max(0, (tt - 0.85) / 0.15));
    if (burst) {
      const bref = getTexture('fx/slash-burst-4');
      const bidx = Math.max(0, Math.min(4, Math.floor(tt * 6)));
      const btex = getTexture(`fx/slash-burst-${bidx}`);
      if (btex && bref) {
        if (burstSp.texture !== btex) burstSp.texture = btex;
        burstSp.scale.set((halfWidth * 2.2) / Math.max(1, bref.width));
        burstSp.position.set(tx, ty);
        burstSp.alpha = 1 - Math.max(0, (tt - 0.5) / 0.5);
        burstSp.visible = burstSp.alpha > 0.01;
      } else burstSp.visible = false;
    } else {
      burstSp.visible = false;
    }
    // 社長提供の刀/剣(横払い/突きの視認性を上げる追加ビジュアル)。柄(グリップ)を判定ラインの始点
    // (fx,fy)に置き、刀身が実際の当たり判定ラインの方向を向くよう回転させる。streakと同じt(0-0.5
    // 伸び/0.5-1縮み)でフェードし、ライン自体の見た目(赤ゾーン/斬撃ピクセル)は変えない=あくまで
    // 追加の視認性補助。
    if (showKatana) {
      const kref = getTexture(katanaTexName);
      if (kref) {
        if (katana.texture !== kref) katana.texture = kref;
        const kscale = katanaLength / (bladeLenFrac * Math.max(1, kref.width));
        katana.scale.set(kscale);
        if (pivotX !== undefined && pivotY !== undefined) {
          // 社長指示: 横払いは「本体を軸に刀を振る」。柄を本体の手元(pivot)へ固定し、刃先を
          // 判定ライン上の現在位置(fx,fy→tx,ty を tt で補間)へ向ける=斬撃アニメと同期して薙ぐ。
          const contactX = fx + (tx - fx) * tt;
          const contactY = fy + (ty - fy) * tt;
          // pivot と contact がほぼ一致する初期フレーム(一閃=pivotが始点)は角度が不定になるので、
          // その時はライン方向(angle)へフォールバックして向きの暴れを防ぐ。
          const pdx = contactX - pivotX, pdy = contactY - pivotY;
          katana.rotation = (Math.hypot(pdx, pdy) < 1 ? angle : Math.atan2(pdy, pdx)) - intrinsicAngle;
          katana.position.set(pivotX, pivotY);
        } else {
          katana.rotation = angle - intrinsicAngle;
          katana.position.set(fx, fy);
        }
        katana.alpha = streak.alpha;
        katana.visible = katana.alpha > 0.01;
      } else katana.visible = false;
    } else {
      katana.visible = false;
    }
  }

  private drawThorSlash(id: string, fx: number, fy: number, tx: number, ty: number, halfWidth: number, t: number, burst: boolean, showKatana = false, pivotX?: number, pivotY?: number) {
    this.drawKatanaSlash(
      this.thorSlashFx, THOR_KATANA_GRIP_FRAC, THOR_KATANA_INTRINSIC_ANGLE, THOR_KATANA_BLADE_LEN_FRAC, THOR_KATANA_LENGTH, 'thor-katana',
      id, fx, fy, tx, ty, halfWidth, t, burst, showKatana, pivotX, pivotY
    );
  }

  // ミゲル(ゲート2ボス)の横払い(狭)実行時の描画。drawThorSlashと同じ仕組みをmiguel-swordで流用。
  private drawMiguelSlash(id: string, fx: number, fy: number, tx: number, ty: number, halfWidth: number, t: number, burst: boolean, showKatana = false, pivotX?: number, pivotY?: number) {
    this.drawKatanaSlash(
      this.miguelSlashFx, MIGUEL_SWORD_GRIP_FRAC, MIGUEL_SWORD_INTRINSIC_ANGLE, MIGUEL_SWORD_BLADE_LEN_FRAC, MIGUEL_SWORD_LENGTH, 'miguel-sword',
      id, fx, fy, tx, ty, halfWidth, t, burst, showKatana, pivotX, pivotY
    );
  }

  // 突きの溜め演出(社長指示): 弓で矢を引いて放つ感覚。刀の先端を突く方向(target=プレイヤー)へ
  // 向け、溜め(prog 0→1)が進むほど手元(pivot=トールの手)を狙い線に沿って後方へ引く。終盤は
  // 小刻みに震わせる(弦の張り)。斬撃ストリーク/バーストは出さない(溜め中は判定なし)。
  private drawThorTsukiCharge(id: string, pivotX: number, pivotY: number, prog: number, now: number, targetX: number, targetY: number) {
    let c = this.thorSlashFx.get(id);
    if (!c) {
      const streak = new Sprite(); streak.blendMode = 'add'; streak.anchor.set(0.5, 0.5);
      const burstSp = new Sprite(); burstSp.anchor.set(0.5, 0.5); burstSp.blendMode = 'add';
      const katana = new Sprite(); katana.anchor.set(THOR_KATANA_GRIP_FRAC.x, THOR_KATANA_GRIP_FRAC.y);
      c = new Container();
      c.addChild(streak, burstSp, katana);
      this.L.effectLayer.addChild(c);
      this.thorSlashFx.set(id, c);
    }
    const streak = c.children[0] as Sprite;
    const burstSp = c.children[1] as Sprite;
    const katana = c.children[2] as Sprite;
    const kref = getTexture('thor-katana');
    if (!kref) { c.visible = false; return; }
    c.visible = true;
    streak.visible = false;
    burstSp.visible = false;
    const kscale = THOR_KATANA_LENGTH / (THOR_KATANA_BLADE_LEN_FRAC * Math.max(1, kref.width));
    katana.scale.set(kscale);
    // 狙い=手元からターゲット(プレイヤー)への向き。刃の先端をこの向きへ合わせる。
    const dx = targetX - pivotX, dy = targetY - pivotY;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;           // 狙いの単位ベクトル(前=突く方向)
    const aimAngle = Math.atan2(dy, dx);
    // 溜めで手元を後方(狙いと逆)へ引く(=弓を引く)。社長指示「少しだけゆっくり後ろに引く」=
    // 引き量を控えめ(TSUKI_DRAW_BACK_PX=20)にし、ease-in(prog^2)でゆっくり引いていく。終盤は
    // 狙い線に直交して小刻みに震える。実行(tsuki)で一気に前へ突き出す。
    const draw = TSUKI_DRAW_BACK_PX * prog * prog;
    const shake = prog > 0.6 ? Math.sin(now / 26) * 2.0 * ((prog - 0.6) / 0.4) : 0;
    katana.rotation = aimAngle - THOR_KATANA_INTRINSIC_ANGLE;   // 先端=突く方向
    katana.position.set(pivotX - ux * draw + (-uy) * shake, pivotY - uy * draw + ux * shake);
    katana.tint = 0xffffff;
    katana.alpha = 0.55 + 0.45 * prog;
    katana.visible = true;
  }

  // 一閃の溜め演出(社長指示): 刀を腰に構えて(居合腰)ゆっくり溜める。一閃の向き(dirX,dirY=斬る方向)
  // に対し、刃を後方へ引いた腰だめの構え。溜め(prog 0→1・3秒)でゆっくり後方へ引き、終盤は小刻みに
  // 震わせて張りつめる。実行(issen-dash)で前方へ抜ける=居合斬り。斬撃ストリークは出さない。
  private drawThorIaiCharge(id: string, hipX: number, hipY: number, dirX: number, dirY: number, prog: number, now: number) {
    let c = this.thorSlashFx.get(id);
    if (!c) {
      const streak = new Sprite(); streak.blendMode = 'add'; streak.anchor.set(0.5, 0.5);
      const burstSp = new Sprite(); burstSp.anchor.set(0.5, 0.5); burstSp.blendMode = 'add';
      const katana = new Sprite(); katana.anchor.set(THOR_KATANA_GRIP_FRAC.x, THOR_KATANA_GRIP_FRAC.y);
      c = new Container();
      c.addChild(streak, burstSp, katana);
      this.L.effectLayer.addChild(c);
      this.thorSlashFx.set(id, c);
    }
    const streak = c.children[0] as Sprite;
    const burstSp = c.children[1] as Sprite;
    const katana = c.children[2] as Sprite;
    const kref = getTexture('thor-katana');
    if (!kref) { c.visible = false; return; }
    c.visible = true;
    streak.visible = false;
    burstSp.visible = false;
    const kscale = THOR_KATANA_LENGTH / (THOR_KATANA_BLADE_LEN_FRAC * Math.max(1, kref.width));
    katana.scale.set(kscale);
    const d = Math.hypot(dirX, dirY) || 1;
    const ux = dirX / d, uy = dirY / d;                 // 斬る方向(前)
    const backAngle = Math.atan2(-uy, -ux);             // 刃の向き=後方(居合の抜き前)
    const draw = 6 + 14 * prog;                          // 溜めで腰の後ろへゆっくり引く
    const tremor = prog > 0.7 ? Math.sin(now / 24) * 1.6 * ((prog - 0.7) / 0.3) : 0;
    katana.rotation = backAngle - THOR_KATANA_INTRINSIC_ANGLE;
    // 柄を腰(hip)に置き、溜めで斬る方向と逆へゆっくり引く。震えは斬る線に直交方向へ。
    katana.position.set(hipX - ux * draw + (-uy) * tremor, hipY - uy * draw + ux * tremor);
    katana.tint = 0xffffff;
    katana.alpha = 0.5 + 0.5 * prog;
    katana.visible = true;
  }

  // 横払いの構え(社長指示): 溜め(harai-windup)の間、刀を「振るモーションの最初の位置」に最初から構えて
  // 置いておく。柄=本体の手元(pivot)、刃先=薙ぎ始めの点(aim=判定ライン始点 fx,fy)へ向ける。streak/burstは
  // 出さない(溜め中は判定なし)。実行(harai)でこの位置から薙ぎ始める=構え→振りが連続する。
  // トール/ミゲル共通(§5.21-追補8: 剣の見た目だけ差し替えるためパラメータ化)。
  private drawKatanaReady(
    fxMap: Map<string, Container>, gripFrac: { x: number; y: number }, intrinsicAngle: number,
    bladeLenFrac: number, katanaLength: number, katanaTexName: string,
    id: string, pivotX: number, pivotY: number, aimX: number, aimY: number, alpha: number
  ) {
    let c = fxMap.get(id);
    if (!c) {
      const streak = new Sprite(); streak.blendMode = 'add'; streak.anchor.set(0.5, 0.5);
      const burstSp = new Sprite(); burstSp.anchor.set(0.5, 0.5); burstSp.blendMode = 'add';
      const katana = new Sprite(); katana.anchor.set(gripFrac.x, gripFrac.y);
      c = new Container();
      c.addChild(streak, burstSp, katana);
      this.L.effectLayer.addChild(c);
      fxMap.set(id, c);
    }
    const streak = c.children[0] as Sprite;
    const burstSp = c.children[1] as Sprite;
    const katana = c.children[2] as Sprite;
    const kref = getTexture(katanaTexName);
    if (!kref) { c.visible = false; return; }
    c.visible = true;
    streak.visible = false;
    burstSp.visible = false;
    const kscale = katanaLength / (bladeLenFrac * Math.max(1, kref.width));
    katana.scale.set(kscale);
    katana.rotation = Math.atan2(aimY - pivotY, aimX - pivotX) - intrinsicAngle;
    katana.position.set(pivotX, pivotY);
    katana.tint = 0xffffff;
    katana.alpha = alpha;
    katana.visible = true;
  }

  private drawThorKatanaReady(id: string, pivotX: number, pivotY: number, aimX: number, aimY: number, alpha: number) {
    this.drawKatanaReady(
      this.thorSlashFx, THOR_KATANA_GRIP_FRAC, THOR_KATANA_INTRINSIC_ANGLE, THOR_KATANA_BLADE_LEN_FRAC, THOR_KATANA_LENGTH, 'thor-katana',
      id, pivotX, pivotY, aimX, aimY, alpha
    );
  }

  // ミゲル(ゲート2ボス)の横払い(狭)溜め時の「構え」描画。drawThorKatanaReadyと同じ仕組みをmiguel-swordで流用。
  private drawMiguelKatanaReady(id: string, pivotX: number, pivotY: number, aimX: number, aimY: number, alpha: number) {
    this.drawKatanaReady(
      this.miguelSlashFx, MIGUEL_SWORD_GRIP_FRAC, MIGUEL_SWORD_INTRINSIC_ANGLE, MIGUEL_SWORD_BLADE_LEN_FRAC, MIGUEL_SWORD_LENGTH, 'miguel-sword',
      id, pivotX, pivotY, aimX, aimY, alpha
    );
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
        // §5.23 M22 C3: 「N HITS」バナー用に space/H/I/T/S を追加(同じアトラス・同じ1回のbake)。
        chars: '0123456789 HITS',
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
    // 色背景付きコールアウト(Counter=青/KILL=赤など): 縁取り無し＋両サイドフェードの色帯を背面に。
    if (e.bg !== undefined) { this.drawCalloutWithBg(e, t, scale); return; }
    let txt = this.effects.get(e.id) as Text | undefined;
    if (!txt || !(txt instanceof Text)) {
      txt = new Text({
        text: e.text ?? String(e.value),
        // 高DPIでも「pixっぽいボケ」を出さないよう解像度を上げて焼く(KILL/Counter等のOrbitronをくっきりHに)。
        resolution: Math.min(3, Math.max(2, Math.round(window.devicePixelRatio || 2))),
        style: {
          // 明朝(serif)指定の時は和文セリフのスタック。それ以外は Orbitron(FONT_STACK)。
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

  // 両サイドへフェードする水平グラデのテクスチャ(白)。tint で色を付けて使い回す。1度だけ生成。
  private static hFadeTex: Texture | null = null;
  private static getHFadeTexture(): Texture {
    if (PixiScene.hFadeTex) return PixiScene.hFadeTex;
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 8;
    const ctx = cv.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 8);
    PixiScene.hFadeTex = Texture.from(cv);
    return PixiScene.hFadeTex;
  }

  // 色背景付きコールアウト: 縁取り無しの文字＋両サイドフェードの色帯(tint)を背面に。Container プール。
  private drawCalloutWithBg(e: Extract<VisualEffect, { kind: 'damageNumber' }>, t: number, scale: number) {
    let view = this.effects.get(e.id);
    if (!(view instanceof Container) || view.children.length < 2 || !(view.children[1] instanceof Text)) {
      if (view) view.destroy({ children: true });
      const c = new Container();
      const bg = new Sprite(PixiScene.getHFadeTexture()); bg.anchor.set(0.5, 0.5);
      const txt = new Text({
        text: e.text ?? '',
        resolution: Math.min(3, Math.max(2, Math.round(window.devicePixelRatio || 2))),
        style: { fontFamily: FONT_STACK, fontSize: Math.round(15 * scale), fontWeight: 'bold', fill: e.color },
      });
      txt.anchor.set(0.5, 0.5);
      c.addChild(bg, txt);
      this.L.effectLayer.addChild(c);
      this.effects.set(e.id, c);
      view = c;
    }
    const c = view as Container;
    const bg = c.children[0] as Sprite;
    const txt = c.children[1] as Text;
    bg.tint = e.bg ?? 0xffffff;
    bg.width = txt.width + 34 * scale;   // 文字より広めに帯を伸ばして両端フェード
    bg.height = txt.height + 10 * scale;
    // holdMs指定時(KILL/カウンター)はそのms分フェードを遅らせ、満alphaを保持してから残り時間で
    // フェードする(社長指示: スローの一番遅い区間と文字の一番ハッキリするタイミングを合わせる)。
    // 未指定(他のbg付きコールアウト)は従来どおり生成直後からフェード=挙動不変。
    const holdMs = Math.max(0, Math.min(e.duration - 1, e.holdMs ?? 0));
    const elapsedMs = t * e.duration;
    const fadeT = elapsedMs < holdMs ? 0 : (elapsedMs - holdMs) / Math.max(1, e.duration - holdMs);
    bg.alpha = Math.max(0, 1 - fadeT) * 0.8; // 透明感を残す
    const pop = 1 + Math.max(0, 1 - t * 5) * 0.2;
    c.position.set(e.x, e.y - t * 12);
    c.scale.set(pop);
    txt.alpha = Math.max(0, 1 - fadeT);
    c.visible = true;
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

  // §5.23 M22 C3: 「N HITS」バナー(プレイヤー頭上)。drawDamageNumberBitmapと同じ手法
  // (dmg-numアトラスのBitmapText・プール再利用・色はtint)。Text生成は一切しない。
  // フォント焼き込みに失敗した稀なケース(damageFontReady=false)は、CLAUDE.mdの
  // 「Text生成禁止」を優先し、この演出だけ非表示にする(数値ダメージと違い必須情報ではない飾りなので)。
  private drawMultiHitBanner(e: Extract<VisualEffect, { kind: 'multiHit' }>, now: number) {
    this.ensureDamageFont();
    if (!this.damageFontReady) { this.hideEffectView(e.id); return; }
    const t = Math.min(1, (now - e.createdAt) / e.duration);
    let bt = this.effects.get(e.id);
    if (!(bt instanceof BitmapText)) {
      if (bt) bt.destroy();
      bt = new BitmapText({
        text: `${e.count} HITS`,
        style: { fontFamily: PixiScene.DAMAGE_FONT, fontSize: PixiScene.DAMAGE_FONT_SIZE },
      });
      (bt as BitmapText).anchor.set(0.5, 0.5);
      this.L.effectLayer.addChild(bt);
      this.effects.set(e.id, bt);
    }
    bt.visible = true;
    const pop = 1 + Math.max(0, 1 - t * 4) * 0.3; // Kill!コールアウトより少し派手なpop-in
    bt.scale.set((20 / PixiScene.DAMAGE_FONT_SIZE) * pop);
    bt.position.set(e.x, e.y - t * 16);
    bt.tint = 0xbef264; // ライム(スラッシャー追撃・薙ぎ倒し系と同系色。gameStore側のリング/glowと揃える)
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
      // 元の黄色い攻撃範囲テレグラフ(社長指示で復活)。細いリーチリング + さっと出て
      // 速く消える静止クレセント。クレセントは狙い方向を向き、腹が太く先端が細い。
      // ※近接スイングの見た目は別途2枚画像差し替えで描画(本ブロックは攻撃範囲の表示)。
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
            .stroke({ width: 2.4 + glow * 8.5, color: 0x3aa0ff, alpha: 0.12 * fade * glow, cap: 'round' });
          g.moveTo(cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr)
            .lineTo(cx + Math.cos(a2) * rr, cy + Math.sin(a2) * rr)
            .stroke({ width: 0.75 + glow * 0.65, color: 0xd8f0ff, alpha: 0.55 * fade, cap: 'round' });
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
            .stroke({ width: 2 + 12 * taper, color: 0x2a78ff, alpha: 0.16 * taper * fade, cap: 'round' });
          g.moveTo(cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr)
            .lineTo(cx + Math.cos(a2) * rr, cy + Math.sin(a2) * rr)
            .stroke({ width: 0.8 + 2.3 * taper, color: 0xeaf8ff, alpha: 0.92 * taper * fade, cap: 'round' });
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
        // 枠(外側の黒縁)＋白トラックを廃止。背景は半透明の黒のみ＋黄色の進捗塗り(社長指示・敵HPバーと同規格・共通トーン)。
        g.rect(x, top, w, h).fill({ color: 0x000000, alpha: BAR_BG_ALPHA });
        g.rect(x, top, w * progress, h).fill({ color: STATUS_YELLOW });
      }
    }
  }

  // §5.23 M22 C4: 固定プール(SPEED_LINE_COUNT本)を一度だけ生成。getGlowTexture(既存の小glowと
  // 同じソフトな放射グラデーション)を引き伸ばして細い帯にする=新規テクスチャ・新規フィルタなし。
  private ensureSpeedLines() {
    if (this.speedLineSprites.length > 0) return;
    const tex = getGlowTexture();
    for (let i = 0; i < SPEED_LINE_COUNT; i++) {
      const sp = new Sprite(tex);
      sp.anchor.set(0.5, 0.5);
      sp.blendMode = 'add';
      sp.tint = 0xe0f2fe;
      sp.visible = false;
      this.L.uiLayer.addChild(sp);
      this.speedLineSprites.push(sp);
    }
  }

  // 突進(刀の一閃ダッシュ/ワイヤーアンカーの高速移動)またはカウンター成立直後だけ、画面端寄りに
  // 速度線を出す(常時ONではない)。screen-space(uiLayer)固定なのでズーム引き(CONTEXT_ZOOM_MIN)でも
  // 常に画面内=カリング判定は不要。`?speedline=0`で無効化。
  private syncSpeedLines(player: Player, now: number) {
    if (!SPEEDLINE_ENABLED) {
      for (const sp of this.speedLineSprites) sp.visible = false;
      return;
    }
    this.ensureSpeedLines();
    const remain = speedLineRemainingMs(
      now, player.katanaDashUntil, player.wireDashUntil, player.lastCounterSuccessTime, PLAYER_COUNTER_MS,
    );
    if (remain <= 0) {
      for (const sp of this.speedLineSprites) sp.visible = false;
      return;
    }
    const alpha = speedLineAlpha(remain, SPEED_LINE_FADE_MS, SPEED_LINE_MAX_ALPHA);
    const cx = this.screenW / 2, cy = this.screenH / 2;
    const dist = Math.hypot(cx, cy) * SPEED_LINE_DIST_FRAC;
    for (let i = 0; i < this.speedLineSprites.length; i++) {
      const sp = this.speedLineSprites[i];
      const ang = (i / this.speedLineSprites.length) * Math.PI * 2 + 0.3; // 均等配置(軸に重ならないよう回転オフセット)
      const jitter = 1 + Math.sin(now / 45 + i) * 0.06; // 軽い明滅(計算コスト最小)
      sp.position.set(cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist);
      sp.rotation = ang;
      sp.width = SPEED_LINE_LENGTH;
      sp.height = SPEED_LINE_THICKNESS;
      sp.alpha = alpha * jitter;
      sp.visible = true;
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
    baseSites: { x: number; y: number; status: string }[] = [],
    escorts: EscortSoldier[] = [],
    playerCenter?: { x: number; y: number },
    hunters: { x: number; y: number }[] = [],
    screamers: { x: number; y: number }[] = [],
    questTargets: { x: number; y: number }[] = []
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
    // さらにボス出現まで(bossSpawned)はマーカー非表示(社長指示)。洋館再訪(the ONE)は目的地=洋館
    // なのでボス無しでも表示する(revisitMarker)。
    if (castleVisible && (castle.bossSpawned || this.revisitMarker) && (castleX < 0 || castleX > this.screenW || castleY < 0 || castleY > this.screenH)) {
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
    // radius<=0 は「商人不在」(チュートリアル=到達不能座標へ退避・v0.25.1820)。誘導マーカーも出さない。
    if (merchant.radius > 0 && (merchantX < 0 || merchantX > this.screenW || merchantY < 0 || merchantY > this.screenH)) {
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

    // 帰還サークルの方角マーカー(v0.25.1829・社長指示「チュートリアルは最初から帰還サークル+マークも表示」)。
    // 画面外のときだけ画面端に緑の二重円+矢印。チュートリアルの常設ゴールに限らず、フィナーレの
    // 帰還サークルにも同じ誘導が付く(従来は城マーカー頼みだった)。
    {
      const rc = useGameStore.getState().returnCircle;
      if (rc) {
        const rx = rc.x - camera.x, ry = rc.y - camera.y;
        if (rx < 0 || rx > this.screenW || ry < 0 || ry > this.screenH) {
          const angle = Math.atan2(ry - cyC, rx - cxC);
          const dx = Math.cos(angle), dy = Math.sin(angle);
          let tdist = Infinity;
          if (dx > 0.0001) tdist = Math.min(tdist, (this.screenW - marginX - cxC) / dx);
          else if (dx < -0.0001) tdist = Math.min(tdist, (marginX - cxC) / dx);
          if (dy > 0.0001) tdist = Math.min(tdist, (this.screenH - marginBottom - cyC) / dy);
          else if (dy < -0.0001) tdist = Math.min(tdist, (marginTop - cyC) / dy);
          if (isFinite(tdist)) {
            const ex = cxC + dx * tdist, ey = cyC + dy * tdist;
            const color = 0x34d399; // 帰還=エメラルド
            g.circle(ex, ey, 11).fill({ color: 0x020617, alpha: 0.88 });
            g.circle(ex, ey, 10).stroke({ width: 1.5, color, alpha: 0.92 });
            g.circle(ex, ey, 5.5).stroke({ width: 1.5, color, alpha: 0.6 + 0.3 * pulse }); // 二重円=帰還サークル
            g.circle(ex, ey, 1.8).fill({ color, alpha: 0.9 });
            const hx = ex + dx * 15, hy = ey + dy * 15;
            const ca = Math.cos(angle), sa = Math.sin(angle);
            const rot = (px: number, py: number): [number, number] => [hx + px * ca - py * sa, hy + px * sa + py * ca];
            g.poly([...rot(7, 0), ...rot(-5, -6), ...rot(-5, 6)]).fill({ color, alpha: pulse });
          }
        }
      }
    }

    // 担当NPC(護衛軍人)の方角矢印: プレイヤーが居る担当エリア(セクター)の担当NPC のみ表示(社長指示)。
    // 担当外のNPCは出さない。画面外のときだけ矢印(画面内マーカーは無し)。制圧後も(NPCが拠点に居る間)表示。
    if (playerCenter && escorts.length) {
      const sector = poiSectorIndex(playerCenter);
      // 担当=その sector の拠点(base-${sector})に配属された護衛。名簿(soldierIndex)はランダムなので
      // 位置(baseId)で実体を引く(soldierIndex は素性=見た目/セリフ用で sector とは別)。
      const npc = escorts.find(e => e.baseId === `base-${sector}`);
      if (npc) {
        const nx = npc.x - camera.x, ny = npc.y - camera.y;
        if (nx < 0 || nx > this.screenW || ny < 0 || ny > this.screenH) {
          const angle = Math.atan2(ny - cyC, nx - cxC);
          const dx = Math.cos(angle), dy = Math.sin(angle);
          let tdist = Infinity;
          if (dx > 0.0001) tdist = Math.min(tdist, (this.screenW - marginX - cxC) / dx);
          else if (dx < -0.0001) tdist = Math.min(tdist, (marginX - cxC) / dx);
          if (dy > 0.0001) tdist = Math.min(tdist, (this.screenH - marginBottom - cyC) / dy);
          else if (dy < -0.0001) tdist = Math.min(tdist, (marginTop - cyC) / dy);
          if (isFinite(tdist)) {
            const ex = cxC + dx * tdist, ey = cyC + dy * tdist;
            const color = 0x4ade80; // 味方NPC=緑
            g.circle(ex, ey, 11).fill({ color: 0x020617, alpha: 0.88 });
            g.circle(ex, ey, 10).stroke({ width: 1.5, color, alpha: 0.92 });
            g.circle(ex, ey - 3, 2.4).fill({ color, alpha: 0.75 + 0.2 * pulse }); // 頭
            g.rect(ex - 4, ey + 1, 8, 4).fill({ color, alpha: 0.6 + 0.25 * pulse }); // 肩
            const hx = ex + dx * 15, hy = ey + dy * 15;
            const ca = Math.cos(angle), sa = Math.sin(angle);
            const rot = (px: number, py: number): [number, number] => [hx + px * ca - py * sa, hy + px * sa + py * ca];
            g.poly([...rot(7, 0), ...rot(-5, -6), ...rot(-5, 6)]).fill({ color, alpha: pulse });
          }
        }
      }
    }

    // ハンター変異体の方角矢印(社長指示): 視界に入った(=検知された)ハンターを赤い矢印で示す。
    // 画面外のときだけ画面端に表示(画面内=直接見えるので不要)。撤退中は出さない(呼び出し側でフィルタ済み)。
    for (const ht of hunters) {
      const tx = ht.x - camera.x;
      const ty = ht.y - camera.y;
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
      const color = 0xef4444; // 脅威=赤
      g.circle(ex, ey, 11).fill({ color: 0x020617, alpha: 0.9 });
      g.circle(ex, ey, 10).stroke({ width: 1.5, color, alpha: 0.7 + 0.25 * pulse });
      // 牙のあるシルエット(白頭+赤い目+下向きの牙)。
      g.circle(ex, ey - 1, 4.2).fill({ color: 0xe2e8f0, alpha: 0.96 });
      g.circle(ex - 1.7, ey - 1.4, 1.1).fill({ color, alpha: 0.95 });
      g.circle(ex + 1.7, ey - 1.4, 1.1).fill({ color, alpha: 0.95 });
      g.poly([ex - 2, ey + 1, ex - 1, ey + 5, ex, ey + 1]).fill({ color: 0xe2e8f0, alpha: 0.96 }); // 牙
      g.poly([ex + 2, ey + 1, ex + 1, ey + 5, ex, ey + 1]).fill({ color: 0xe2e8f0, alpha: 0.96 });
      const hx = ex + dx * 15, hy = ey + dy * 15;
      const ca = Math.cos(angle), sa = Math.sin(angle);
      const rot = (px: number, py: number): [number, number] => [hx + px * ca - py * sa, hy + px * sa + py * ca];
      g.poly([...rot(7, 0), ...rot(-5, -6), ...rot(-5, 6)]).fill({ color, alpha: pulse });
    }

    // 変異体(叫喚型・screamer)の方角矢印(社長指示): 画面外に居る間は常に位置を示す(優先処理対象=
    // 叫ぶ前に見つけて倒してほしいため、ハンターと違い「検知」条件なしで常時表示)。
    for (const sc of screamers) {
      const tx = sc.x - camera.x;
      const ty = sc.y - camera.y;
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
      const color = 0xbef264; // screamer演出と同じ毒々しい黄緑(叫喚コールアウト/FXと同系色)
      g.circle(ex, ey, 11).fill({ color: 0x020617, alpha: 0.9 });
      g.circle(ex, ey, 10).stroke({ width: 1.5, color, alpha: 0.7 + 0.25 * pulse });
      // 叫んでいる顔(丸頭+開いた口)+左右の音波弧。牙(ハンター)と見分けが付くシルエットに。
      g.circle(ex, ey - 1, 4.2).fill({ color: 0xe2e8f0, alpha: 0.96 });
      g.ellipse(ex, ey + 1.2, 2.1, 2.7).fill({ color: 0x1e293b, alpha: 0.95 }); // 開いた口
      // moveTo してから arc(前のペン位置からの連結線=変な線を防ぐ。他のarc使用箇所と同じ作法)。
      const a0L = -Math.PI * 0.35, a1L = Math.PI * 0.35;
      g.moveTo(ex - 6 + Math.cos(a0L) * 3.2, ey - 1 + Math.sin(a0L) * 3.2)
        .arc(ex - 6, ey - 1, 3.2, a0L, a1L)
        .stroke({ width: 1.1, color, alpha: 0.6 + 0.3 * pulse });
      const a0R = Math.PI * 0.65, a1R = Math.PI * 1.35;
      g.moveTo(ex + 6 + Math.cos(a0R) * 3.2, ey - 1 + Math.sin(a0R) * 3.2)
        .arc(ex + 6, ey - 1, 3.2, a0R, a1R)
        .stroke({ width: 1.1, color, alpha: 0.6 + 0.3 * pulse });
      const hx = ex + dx * 15, hy = ey + dy * 15;
      const ca = Math.cos(angle), sa = Math.sin(angle);
      const rot = (px: number, py: number): [number, number] => [hx + px * ca - py * sa, hy + px * sa + py * ca];
      g.poly([...rot(7, 0), ...rot(-5, -6), ...rot(-5, 6)]).fill({ color, alpha: pulse });
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

    // 二人組クエストの強制目標(ネームド)の方向マーク: 拠点と同じ規則(社長裁定v0.25.1686 #7=
    // 注意誘導はせず「近づいたらマーク表示」)。近く(500px以内)かつ画面外の時だけ縁矢印。
    // 画面内は本体(金tint+名前)がそのままマーク。
    for (const qt of questTargets) {
      const tx = qt.x - camera.x, ty = qt.y - camera.y;
      if (tx >= 0 && tx <= this.screenW && ty >= 0 && ty <= this.screenH) continue;
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
      const color = 0xffd700; // ネームドと同じ金(NAMED_TINT)
      g.circle(ex, ey, 11).fill({ color: 0x020617, alpha: 0.9 });
      g.circle(ex, ey, 10).stroke({ width: 1.5, color, alpha: 0.95 });
      g.rect(ex - 1.5, ey - 5, 3, 6).fill({ color, alpha: 0.95 }); // 「!」マーク(簡易)
      g.circle(ex, ey + 4, 1.6).fill({ color, alpha: 0.95 });
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
    for (const o of this.thorSlashFx.values()) o.destroy({ children: true });
    for (const o of this.miguelSlashFx.values()) o.destroy({ children: true });
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
