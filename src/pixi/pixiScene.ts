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

import { BlurFilter, Container, Graphics, Sprite, Text, Texture, Rectangle, Filter, TilingSprite } from 'pixi.js';
import { TiltShiftFilter, AdvancedBloomFilter } from 'pixi-filters';
import type {
  BreakableProp, CastleEvent, Enemy, EventQuestNpc, Pickup, Player, Projectile, VisualEffect, WeaponMerchant, Summon,
} from '../types/game';
import { useGameStore, huntingMeleeRadius, SHAKE_MS, MELEE_FINISH_ZOOM_MS, CAMERA_IDLE_ZOOM_MAG, CAMERA_IDLE_ZOOM_TAU, CAMERA_MOVE_ZOOM_MAG, CAMERA_MOVE_ZOOM_TAU, CAMERA_INTRO_ZOOM_MAG, COUNTER_WINDOW, katanaRange, HURRICANE_DURATION_MS_BY_LEVEL, PLAYER_INTRO_MS, PLAYER_INTRO_HELI_FRAC, playerIntroOffset, playerIntroScale, playerIntroDescent, PUMPKIN_CROUCH_MS, PUMPKIN_JUMP_MS, PUMPKIN_RECOVER_MS, PUMPKIN_JUMP_HEIGHT, WIRE_ANCHOR_RANGE, WIRE_PLANT_MS } from '../store/gameStore';
import { LAB_BOUNDS, LAB_OUTER_BOUNDS, LAB_WALLS, LAB_DOORS, LAB_BUTTON, LAB_GOAL_TRIGGER, LAB_ROOMS } from '../world/labMap';
import { getEnemyColor } from '../utils/enemyUtils';
import { ALCHEMY_SUMMON_TINT, ALCHEMY_CHANNEL_MS } from '../utils/summonUtils';
import { effectiveReloadMs } from '../utils/weaponUtils';
import { pickupDisplayPosition } from '../utils/collisionUtils';
import { buildKatanaShape, type KatanaVariant } from '../utils/katanaShape';
import type { SceneLayers } from './layers';
import { getTexture } from './pixiTextures';
import { getGlowTexture, getVignetteTexture, getSoftShadowTexture, getFogTexture } from './lighting';
import { enemyFootBox, playerFootBox, summonFootBox } from './renderSpec';
import {
  RHYTHM_DIM_ALPHA, RHYTHM_DIM_EASE, RHYTHM_TAP_GLOW_MS, RHYTHM_TAP_GLOW_ALPHA,
  RHYTHM_STAGE_COLORS, RHYTHM_FINISH_RAINBOW_MS, RHYTHM_BALL_DIAM, RHYTHM_RAINBOW_PALETTE,
  RHYTHM_ARROW_GRID, SHIJIN_JP, SHIJIN_BY_ARROW,
  RHYTHM_JUST_BURST_MS, RHYTHM_JUST_RING_MAX_SCALE, RHYTHM_JUST_FLICK_TRAVEL,
  RHYTHM_JUST_CYCLE_COLORS,
} from '../config/shijin';
import { treesInRegion, TREE_CELL, treeHash } from '../world/trees';

// --- moonlit atmosphere tuning (tweak freely on-device) -------------------
const GRADE_TINT = 0x7e93c9;   // cool blue multiply over the whole world
const GRADE_ALPHA = 0.4;       // strength of the cool grade
const PLAYER_HUNTING_LIGHT_TINT = 0x60a5fa;
const FAR_BACKDROP_HEIGHT_RATIO = 0.22;
const FAR_BACKDROP_MIN_HEIGHT = 150;
const FAR_BACKDROP_PARALLAX_X = 0.09;
const FAR_BACKDROP_BLUR = 1.1;
const HORIZON_FOREST_PARALLAX_X = 0.16;
const HORIZON_FOREST_HEIGHT_RATIO = 0.22;
const HORIZON_FOREST_MIN_HEIGHT = 120;
const HORIZON_FOREST_MAX_HEIGHT = 185;
const HORIZON_FOREST_OVERLAP_RATIO = 0.18;
const HORIZON_FOREST_Y_OFFSET_PX = -100;
const HORIZON_FOREST_BOTTOM_FADE_PX = 10;
const HORIZON_ACTOR_HIDE_OFFSET_PX = 0;
const HORIZON_ACTOR_FADE_PX = 120;
const HORIZON_REVEAL_OFFSET_PX = 200;
const HORIZON_REVEAL_FADE_PX = 90;
const FRONT_FOREST_PARALLAX_X = 0.68;
const FRONT_FOREST_HEIGHT_RATIO = 0.5;
const FRONT_FOREST_MIN_HEIGHT = 270;
const FRONT_FOREST_MAX_HEIGHT = 410;
const FRONT_FOREST_ALPHA = 0.78;
const FRONT_FOREST_BLUR = 2.2;
const FRONT_FOREST_FADE_IN_RATIO = 0.52;
const FRONT_FOREST_FADE_TOP_ALPHA = 0.58;
const FRONT_FOREST_FADE_MID_ALPHA = 0.82;
const CASTLE_FOOT_OFFSET_Y = 38;
const CASTLE_TARGET_HEIGHT = 125;
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
// 研究所の擬似3D(斜め遠近)試作フラグ。?labpersp=1 で床だけ遠近(A1)。既定OFF=現状維持(回帰なし)。
// 描画のみ。当たり判定/移動/aim は不変(store の値そのまま)。
const LAB_PERSP = tsBool('labpersp', false);
const TILT_SHIFT_ENABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('ts') !== '0';
const TILT_SHIFT_BLUR = tsNum('tsblur', 14);       // max blur strength at the edges
const TILT_SHIFT_GRADIENT = tsNum('tsgrad', 440);  // px over which sharp ramps into blur
const TILT_SHIFT_BAND = tsNum('tsband', 0.46);     // sharp-band centre as a fraction of height

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
const LAB_VIGNETTE_ALPHA = 0.97;
// 壁テクスチャは「線画＋内側が透明」なので、そのままだと床が透ける。各壁の背面に不透明な下地を敷く色。
const LAB_WALL_FILL = 0x2b3240;
// 立体壁の「立ち上がり高さ」(px)。実機調整 → 既定へ。?labrise=38 で上書き。
const LAB_WALL_RISE = Math.max(0, tsNum('labrise', 38));

// --- フェーズ2-A: 月明り(光のシャフト)を明るく --------------------------------
// 暗くしたベース(フェーズ1)の上で、暖色シャフトを加算(add)で強めに光らせる。加算なので
// 光の当たる筋だけが明るくなり、周りの暗さはそのまま=メリハリ。新規パスなし=無料。
//   ?shaft=0.2  シャフトの明るさ(0=なし。従来の素の値は 0.085)
const SHAFT_ALPHA = Math.max(0, tsNum('shaft', 0.11));
// 環境光シャフトの横パララックス: 左右の移動(camera.x)に連動して森のように流れる。
// 0=動かない。森より遅め(front forest=0.68)。?shaftpara= で生調整。
const SHAFT_PARALLAX_X = Math.max(0, tsNum('shaftpara', 0.35));
// シャフトのぼかし(エッジを柔らかく)。BlurFilter 1枚。既定0=なし。?shaftblur= で有効化。
const SHAFT_BLUR = Math.max(0, tsNum('shaftblur', 0));

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
const LIGHT_POOL_TINT = 0xffe3a3; // 暖色(月明り/松明と同系)

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

const SUNLIGHT_PRESET: StageLightingPreset = {
  name: 'sunlight',
  direction: STAGE_LIGHT_SHAFT_DIRECTION,
  color: 0xffe3a3,
  intensity: 0.24,
  contrast: 0.18,
  shadowLength: 32,
  shadowAlpha: 0.26,
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
  shadowLength: 18,
  shadowAlpha: 0.12,
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
// 背負い刀の傾き(ラジアン)。HUDアイコンと同じ角度で斜めに見せる。
const KATANA_BACK_ROT_DEG = 32;
const KATANA_BACK_ROT = (KATANA_BACK_ROT_DEG * Math.PI) / 180;
// 背負い刀の大きさ倍率(中心固定で縮小)。
const KATANA_BACK_SCALE = 0.72;
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
const PLAYER_WALK_BOB_PX = 0.8;
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
const ENEMY_RANK_ORNAMENT: Record<string, { wing: number | null; horn: number | null; ring: number | null }> = {
  strong: { wing: 0x101827, horn: null, ring: null },
  elite: { wing: null, horn: 0xd8b4fe, ring: null },
  danger: { wing: 0xdc2626, horn: 0xfef3c7, ring: 0xef4444 },
};

// Pseudo-perspective scale: objects are drawn bigger toward the foreground
// (south / larger world Y) and smaller toward the back (north). PURELY VISUAL —
// it scales sprites + foot shadows only. Collision boxes, attack ranges, the
// counter radius and every other distance are never touched. Measured as a
// scale offset from the player's foot plane, so the player stays ~1.0 and
// objects grow/shrink relative to the hero.
const DEPTH_SCALE_ENABLED = true;
const DEPTH_K = 0.0009;   // scale change per world-Y px from the player plane
const DEPTH_MIN = 0.68;
const DEPTH_MAX = 1.45;
// Enemies get a deliberately more extreme depth falloff than the rest.
const ENEMY_DEPTH_K = 0.00145;
const ENEMY_DEPTH_MIN = 0.55;
const ENEMY_DEPTH_MAX = 1.85;
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
const GROUND_TILE_SCALE_Y_FAR = 0.12;
const GROUND_SCROLL_X_FEEL = 1.2;
const GROUND_SCROLL_Y_FEEL = 3.0;
const GROUND_PERSPECTIVE_CURVE = 2.05;
const NEAR_GROUND_BLUR_STRIP_RATIO = 0.34;
const NEAR_GROUND_BLUR_STRENGTHS = [0.8, 1.45, 2.05];
const OBJECT_GROUND_RELATIVE_WEIGHT = 0.42;
const OBJECT_GROUND_RELATIVE_MIN = 0.68;
const OBJECT_GROUND_RELATIVE_MAX = 1.45;
const TREE_VISUAL_SCALE = 1.65;
const PICKUP_VISUAL_SIZE = 30;
const TORCH_VISUAL_W = 42;
const TORCH_VISUAL_H = 68;
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

// One drifting ambient mote.
interface Firefly {
  sprite: Sprite;
  x: number; y: number;   // world position
  vx: number; vy: number; // drift velocity (px/s)
  phase: number; freq: number; base: number; size: number;
}

// 診断用: URLに ?dancevfx=0 を付けるとダンスのPixi描画(ミラーボール/サークル/矢印/暗転/発光)を一切出さない。
const RHYTHM_VFX_OFF = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('dancevfx') === '0';

export class PixiScene {
  private L: SceneLayers;

  private trees = new Map<string, { sprite: Sprite; baseScale: number; footY: number }>();
  private enemies = new Map<string, ActorView>();
  // 錬金術の召喚ユニット(味方)。敵と同じ actor プールを使い、シアンtintで描く。
  private summonViews = new Map<string, ActorView>();
  private breakableProps = new Map<string, PropView>();
  private playerView: ActorView | null = null;
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
  private playerRidingHeli = false; // フェーズA中=プレイヤーをヘリ前面(danceUiLayer)へ移しているか
  private helicopter = new Sprite(); // 登場演出のヘリ(画像 'helicopter' 登録時のみ表示)
  // 錬金術の魔法陣: 足元に常設する地面スプライト。チャネル中だけ alpha=溜め進捗で
  // 連続フェード(透明→完成で不透明)。手続き的リングは廃止しこれに置き換え。
  private alchemyCircle = new Sprite();
  private alchemyCircleTextured = false;
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
  // ミラーボール本体(実テクスチャのスプライト)。0.5秒ごとに左右反転して回転に見せる。
  private rhythmBall = new Sprite();
  private rhythmBallTextured = false;
  // 四神名(コマンドの右に出すテキスト)。テキスト変化時のみ更新。
  private rhythmGodText = new Text({ text: '', style: { fontFamily: 'serif', fontSize: 13, fontWeight: 'bold', fill: 0xfca5a5, stroke: { color: 0x0b1020, width: 3 } } });
  private rhythmGodLast = '';
  // コマンド/入力の矢印は別Graphicsに分離し、内容が変わった時だけ再描画(毎フレームの矩形リビルドを回避)。
  // 位置(プレイヤー追従)は毎フレーム transform だけ更新する。
  private rhythmArrowsGfx = new Graphics();
  private rhythmArrowsKey = '';
  private groundReflectionGfx = new Graphics();
  private localEventShadeGfx = new Graphics();
  private playerFx = new Graphics();   // counter ring + reload meter (world)
  private wireTip: Sprite | null = null; // ワイヤーアンカー先端スプライト(world座標・遅延生成)
  private flashGfx = new Graphics();   // full-screen damage flashes (screen)
  private arrowGfx = new Graphics();   // off-screen supply arrows (screen)

  // Atmosphere (screen space). gradeSprite multiplies the world cool; the warm
  // playerLight is added on top so the hero stays bright; vignette darkens edges.
  private gradeSprite = new Sprite(Texture.WHITE);
  private playerLight = new Sprite(getGlowTexture());
  private playerGroundPool = new Sprite(getGlowTexture()); // A: 足元の地面に敷く光だまり(加算)
  private stageLightShaftGfx = new Graphics();
  private vignette = new Sprite(getVignetteTexture());
  private worldFadeMask = new Sprite(Texture.WHITE);
  private worldFadeMaskTexture: Texture | null = null;
  private horizonForestFadeMask = new Sprite(Texture.WHITE);
  private horizonForestFadeMaskTexture: Texture | null = null;
  private frontForestFadeMask = new Sprite(Texture.WHITE);
  private frontForestFadeMaskTexture: Texture | null = null;
  private nearGroundBlurLayers: Container[] = [];

  private tiltShift: TiltShiftFilter | null = null;
  private bloom: AdvancedBloomFilter | null = null;
  private farBackdropBlur: BlurFilter | null = null;
  private nearGroundBlurFilters: BlurFilter[] = [];
  private frontForestBlur: BlurFilter | null = null;

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
  private labWalls: Container | null = null;    // 屋内ステージの壁スプライト群(縦壁/外周=アクターの下に固定)
  private labWallsSig = '';                      // 壁/扉の現状シグネチャ(変化時のみ再構築)
  private labWallActors: Container[] = [];        // 横壁=アクター層に足元アンカーで配置(裏側=北側に回り込める)。下地+線画の Container。
  // 立体壁の擬似遠近(高さ方向のみ)。各ブロックの footY と元の総高(h+RISE)を保持し、毎フレーム scale.y を更新。
  private labWallDepth: { cont: Container; footY: number; fullH: number }[] = [];
  private labWallDepthRefY = NaN; // 直近の depthRefY(変化なしなら更新スキップ)
  private labFloorDecor: Container | null = null;  // 床の変種パッチ(blood/grime/crack/scorch)＋隅AO。決定的ハッシュで1度だけ生成。
  private labFloorDecorSig = '';                   // 変種散布の生成シグネチャ(部屋集合は静的なので実質1回)。
  private labWallShadow: Graphics | null = null;   // 壁下辺の焼き込み落ち影(右上光源→左下オフセット)。壁/扉と同シグネチャで再構築。
  private labPropSprites: Sprite[] = [];          // 屋内の障害物プロップ(木の代わり)。アクター層で深度ソート。
  private labPropSig = '';                        // プロップ配置シグネチャ(変化時のみ再構築)
  private idleZoom = 1;        // 手を離して待機中だけ寄る持続ズーム(滑らかに 1↔1+mag)
  private lastZoomNow = 0;     // 待機ズームのフレーム間 dt 計算用
  private hitstopFreezeNow = 0; // ヒットストップ中に固定するアニメ時計(0=非固定)
  private depthRefY = 0; // player foot world-Y this frame (the focal plane)
  private enemyCount = 0;
  private horizonForestFootWorldY = -Infinity;
  private horizonFadeZeroScreenY = 0;

  constructor(layers: SceneLayers) {
    this.L = layers;

    // Bloom + tilt-shift depth-of-field over the gameplay world wrapper.
    // The fixed ground and horizon seam stay outside these filters so blur never
    // smears ground pixels upward over the far panorama. The wrapper itself is
    // screen-space; the camera-offset `world` remains its child.
    const worldFilters: Filter[] = [];
    if (BLOOM_ENABLED) {
      this.bloom = new AdvancedBloomFilter({
        threshold: BLOOM_THRESHOLD,
        bloomScale: BLOOM_SCALE,
        blur: BLOOM_BLUR,
        quality: 4,
      });
      worldFilters.push(this.bloom);
    }
    if (TILT_SHIFT_ENABLED) {
      this.tiltShift = new TiltShiftFilter({
        blur: TILT_SHIFT_BLUR,
        gradientBlur: TILT_SHIFT_GRADIENT,
      });
      worldFilters.push(this.tiltShift);
    }
    if (worldFilters.length) this.L.filteredWorld.filters = worldFilters;

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
    this.L.horizonForest.parent.addChild(this.horizonForestFadeMask);
    this.L.frontForest.mask = this.frontForestFadeMask;
    this.L.frontForest.parent.addChild(this.frontForestFadeMask);

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
    // tint は付けない: テクスチャに焼いたシアン→白ホットの階調をそのまま活かす。
    this.L.groundLayer.addChild(
      this.groundReflectionGfx,
      this.playerGroundPool,
      this.playerLight,
      this.alchemyCircle,
      this.shadowContainer,
    );
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
    this.localEventShadeGfx.zIndex = -1_000_000;
    this.L.actorLayer.addChild(
      this.localEventShadeGfx,
      this.castleView,
      this.merchantView,
      this.eventNpcView,
    );

    this.gradeSprite.tint = GRADE_TINT;
    this.gradeSprite.alpha = GRADE_ALPHA;
    this.gradeSprite.blendMode = 'multiply';

    this.vignette.alpha = ENV_VIGNETTE_ALPHA;

    // Screen-space overlays: cool multiply grade darkens/cools the whole scene
    // (multiply preserves detail/outlines), then the vignette, then damage
    // flash + off-screen arrows on top of everything.
    this.L.uiLayer.addChild(
      this.stageLightShaftGfx,
      this.gradeSprite, this.vignette,
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
      this.fogLayers.push({ sp, ...cfg });
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
    this.L.horizonForest.tileScale.set(w / this.L.horizonForest.texture.width, horizonH / this.L.horizonForest.texture.height);
    this.L.horizonForest.position.set(0, farH - horizonH * HORIZON_FOREST_OVERLAP_RATIO + HORIZON_FOREST_Y_OFFSET_PX);
    this.updateHorizonForestFadeMask(w, horizonH);
    this.updateWorldFadeMask(w, h);
    this.updatePerspectiveGround(0, 0, 0, 0);
    const frontH = this.frontForestHeight();
    const frontScale = frontH / this.L.frontForest.texture.height;
    this.L.frontForest.position.set(0, h - frontH);
    this.L.frontForest.width = w;
    this.L.frontForest.height = frontH;
    this.L.frontForest.tileScale.set(frontScale);
    this.L.frontForest.alpha = FRONT_FOREST_ALPHA;
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
    const alpha = SHAFT_ALPHA; // 可変の明るさ(?shaft=)
    if (alpha <= 0) { this.shaftPeriod = 0; return; }
    g.blendMode = 'add';
    const color = ACTIVE_STAGE_LIGHTING.color;
    // 一定間隔の斜めビームを period 単位でタイル反復して描く。横パララックスで position.x を
    // [-period, 0] に折り返すと継ぎ目なくスクロールできる(森の tilePosition と同じ発想)。
    const period = Math.max(180, w * 0.5);
    this.shaftPeriod = period;
    // 1 period 内に配置するビーム(period 比のオフセット / 幅 / 相対濃さ)。少し間引いて2本に。
    const beams = [
      { off: 0.06, width: w * 0.17, length: h * 1.22, alpha: 0.42 },
      { off: 0.52, width: w * 0.12, length: h * 1.14, alpha: 0.24 },
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
    return Math.min(this.screenH * 0.3, Math.max(FAR_BACKDROP_MIN_HEIGHT, this.screenH * FAR_BACKDROP_HEIGHT_RATIO));
  }

  private horizonForestHeight() {
    return Math.min(
      HORIZON_FOREST_MAX_HEIGHT,
      Math.max(HORIZON_FOREST_MIN_HEIGHT, this.screenH * HORIZON_FOREST_HEIGHT_RATIO)
    );
  }

  private frontForestHeight() {
    return Math.min(
      FRONT_FOREST_MAX_HEIGHT,
      Math.max(FRONT_FOREST_MIN_HEIGHT, this.screenH * FRONT_FOREST_HEIGHT_RATIO)
    );
  }

  private horizonActorAlpha(footWorldY: number) {
    return Math.max(0, Math.min(1, (footWorldY - this.horizonForestFootWorldY) / HORIZON_ACTOR_FADE_PX));
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
    this.horizonFadeZeroScreenY = zeroY;

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
    const relative = 1 + (footWorldY - this.depthRefY) * k;
    const groundRatio = this.groundRelativeScale(footWorldY);
    const groundBlend = Math.exp(Math.log(groundRatio) * OBJECT_GROUND_RELATIVE_WEIGHT);
    const f = relative * groundBlend;
    return f < min ? min : f > max ? max : f;
  }

  private groundScaleAt(footWorldY: number): number {
    const farH = this.farBackdropHeight();
    const groundH = Math.max(1, this.screenH - farH);
    const screenY = footWorldY - this.cameraY;
    const t = Math.max(0, Math.min(1, (screenY - farH) / groundH));
    const perspective = Math.pow(t, GROUND_PERSPECTIVE_CURVE);
    return GROUND_TILE_SCALE_Y_FAR
      + (GROUND_TILE_SCALE_Y_NEAR - GROUND_TILE_SCALE_Y_FAR) * perspective;
  }

  private groundRelativeScale(footWorldY: number): number {
    const base = Math.max(0.001, this.groundScaleAt(this.depthRefY));
    const ratio = this.groundScaleAt(footWorldY) / base;
    return Math.max(OBJECT_GROUND_RELATIVE_MIN, Math.min(OBJECT_GROUND_RELATIVE_MAX, ratio));
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

  // ?labpersp で研究所床に差し替えた地面ストリップを、屋外/非persp 時に元(屋外地面・ENV_TINT)へ戻す。
  private restoreGroundStrips() {
    if (!this.groundStripBaseTex) return; // 一度も差し替えていなければ何もしない
    for (const strip of this.L.groundStrips) {
      if (strip.texture !== this.groundStripBaseTex) strip.texture = this.groundStripBaseTex;
      strip.tint = ENV_TINT;
    }
  }

  private updatePerspectiveGround(cameraX: number, cameraY: number, shakeX: number, shakeY: number) {
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
      const perspective = Math.pow(t, GROUND_PERSPECTIVE_CURVE);
      const scaleY = GROUND_TILE_SCALE_Y_FAR + (GROUND_TILE_SCALE_Y_NEAR - GROUND_TILE_SCALE_Y_FAR) * perspective;

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
    this.depthRefY = playerFootBox(s.player).footY;

    // Camera offset + screen shake on the whole world (and the floor).
    let sx = 0;
    let sy = 0;
    // ストップ(ヒットストップ)中は揺れを描画しない=ストップと揺れを重ねない(社長指示)。
    // インパクトの揺れはストップ後にトリガーされるので、停止が明けてから揺れ始める。
    const shakeLeft = (s.shakeUntil && now >= s.hitstopUntil) ? s.shakeUntil - now : 0;
    if (shakeLeft > 0) {
      // 振幅(shakeMag)×フェード(残り/長さ)。行動別に triggerShake で強さを設定。
      const mag = (s.shakeMag || 7) * Math.min(1, shakeLeft / (s.shakeDur || SHAKE_MS));
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
    for (const f of this.fogLayers) {
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
    this.L.horizonForest.position.set(0, farH - horizonH * HORIZON_FOREST_OVERLAP_RATIO + HORIZON_FOREST_Y_OFFSET_PX);
    this.L.horizonForest.tilePosition.set(
      -s.camera.x * HORIZON_FOREST_PARALLAX_X,
      0
    );
    this.horizonForestFadeMask.position.copyFrom(this.L.horizonForest.position);
    this.horizonFadeZeroScreenY = this.horizonRevealZeroScreenY();
    this.horizonForestFootWorldY = s.camera.y + this.horizonActorHideScreenY();
    this.updatePerspectiveGround(s.camera.x, s.camera.y, sx, sy);
    const frontH = this.frontForestHeight();
    this.L.frontForest.position.set(sx * 0.75, this.screenH - frontH);
    this.L.frontForest.tilePosition.set(
      -s.camera.x * FRONT_FOREST_PARALLAX_X,
      0
    );
    this.frontForestFadeMask.position.copyFrom(this.L.frontForest.position);

    this.syncTrees(s.camera);
    // 屋内(研究施設)は指定がない限り「最初の部屋に武器商人のみ」。ボス部屋(城)/二人組(クエストNPC)は描画しない。
    if (s.indoorMode) {
      this.castleView.visible = false; this.castleShadow = null; this.castleGlow.visible = false;
      this.eventNpcView.visible = false; this.npcShadow = null;
    } else {
      this.syncCastle(s.castleEvent, now);
      this.syncEventQuestNpc(s.eventQuestNpc, s.player, now);
    }
    this.syncMerchant(s.weaponMerchant, s.player, now); // 商人は屋内でも(最初の部屋に)出す
    this.syncBreakableProps(s.breakableProps, now);
    this.syncPickups(s.pickups, now);
    this.syncActors(s.player, s.enemies, s.gameTime, now);
    this.syncShadows(s.player, s.enemies, s.summons, s.projectiles);
    this.syncStageLightShaftDrift(s.camera, now);
    this.syncProjectiles(s.projectiles, now);
    this.syncShields(s.projectiles, now);
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
    this.syncPlayerFx(s.player, now, s.gameTime);
    this.syncArrows(s.pickups, s.castleEvent, s.weaponMerchant, s.camera);
    this.syncFlash(s.effects, now);

    // Warm ground pool follows the player. It lives in the world's groundLayer
    // (camera-offset already applied to the parent), so plain world coords.
    const lx = s.player.x + s.player.width / 2;
    const ly = s.player.y + s.player.height / 2;
    // 屋内(研究施設)は「明るい部分」を狭くする(社長指示): プレイヤー光/光だまりを縮小。
    const lightScale = s.indoorMode ? 0.62 : 1;
    this.playerLight.position.set(lx, ly);
    this.playerLight.tint = s.player.huntingCharged ? PLAYER_HUNTING_LIGHT_TINT : ACTIVE_STAGE_LIGHTING.color;
    this.playerLight.alpha = ACTIVE_STAGE_LIGHTING.playerAssistAlpha * (s.player.huntingCharged ? 1.3 : 1) * (0.92 + 0.08 * Math.sin(now / 600));
    this.playerLight.width = this.playerLight.height = ACTIVE_STAGE_LIGHTING.playerAssistRadius * (s.player.huntingCharged ? 2.2 : 2) * lightScale;

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
      if (tex && tex.width >= 32) { ball.texture = tex; this.rhythmBallTextured = true; }
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
    if (!this.bloom) return;
    const hasStrongEventGlow = effects.some(e => {
      if (e.kind !== 'glow' || e.radius < STRONG_GLOW_RADIUS) return false;
      const t = (now - e.createdAt) / e.duration;
      return t >= 0 && t < 1;
    });
    this.bloom.bloomScale = hasStrongEventGlow ? BLOOM_STRONG_EVENT_SCALE : ACTIVE_STAGE_LIGHTING.bloomScale;
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
    for (const f of this.fireflies) {
      f.x += f.vx * sec;
      f.y += f.vy * sec;
      // Wrap into the visible band so density follows the camera.
      if (f.x < minX) f.x = maxX; else if (f.x > maxX) f.x = minX;
      if (f.y < minY) f.y = maxY; else if (f.y > maxY) f.y = minY;
      const twinkle = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(now * f.freq + f.phase));
      f.sprite.position.set(f.x - camera.x, f.y - camera.y);
      f.sprite.alpha = f.base * twinkle;
      f.sprite.width = f.sprite.height = f.size;
    }
  }

  private syncCastle(castle: CastleEvent, now: number) {
    const tex = getTexture('castle');
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
    const indoor = useGameStore.getState().indoorMode;
    const tex = getTexture('tree');
    const margin = TREE_CELL;
    let trees = treesInRegion(
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
        sprite.tint = ENV_TINT; // フェーズ1: 木も環境として暗く沈める
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
      entry.sprite.alpha = this.horizonActorAlpha(entry.footY);
    }
    for (const [key, entry] of this.trees) {
      if (!seen.has(key)) {
        entry.sprite.destroy();
        this.trees.delete(key);
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
      if (p.type === 'experience') {
        color = p.value >= 5 ? 0xffb4b4 : p.value >= 2 ? 0x7ee7b0 : 0x8fb8ff;
        strength = p.value >= 5 ? 1.1 : p.value >= 2 ? 0.9 : 0.75;
      } else if (p.type === 'magnet') {
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
      // 紫グロー(薄暗め・脈動)。groundLayer 上の加算スプライト。
      view.light.visible = true;
      view.light.position.set(prop.footX, prop.footY - 4 * d);
      view.light.tint = 0x9a4fd6;
      const uvPulse = 0.30 + 0.12 * Math.sin(now * 0.0018 + prop.footX * 0.05);
      view.light.width = view.light.height = 64 * d;
      view.light.alpha = uvPulse * horizonAlpha;
      const o = view.overlay;
      o.clear();
      if (now - prop.lastHit < 90) {
        o.circle(Math.round(prop.footX), Math.round(prop.footY - 8 * d), 16 * d).fill({ color: 0xffffff, alpha: 0.3 });
      }
      return;
    }

    const tex = getTexture(prop.type);
    const d = this.depthScale(prop.footY);
    const visualW = TORCH_VISUAL_W * prop.scale;
    const visualH = TORCH_VISUAL_H * prop.scale;
    const sc = tex ? containScale(visualW, visualH, tex.width, tex.height) * d : d;
    const horizonAlpha = this.horizonActorAlpha(prop.footY);
    const flameX = Math.round(prop.footX);
    const flameY = Math.round(prop.footY - visualH * d * 0.72);
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
  private placeShadowSprite(id: string, footX: number, footY: number, w: number, alpha: number, seen: Set<string>) {
    if (alpha <= 0) return;
    const lighting = ACTIVE_STAGE_LIGHTING;
    const mag = Math.hypot(lighting.direction.x, lighting.direction.y) || 1;
    const ux = lighting.direction.x / mag;
    const uy = lighting.direction.y / mag;
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
      sp.tint = 0x000000;
      this.shadowContainer.addChild(sp);
      this.shadowPool.set(id, sp);
    }
    sp.rotation = Math.atan2(uy, ux);
    sp.width = length + width;   // 全長 = 基部ブロブ + 伸び
    sp.height = width;           // 太さ
    sp.alpha = alpha * lighting.shadowAlpha;
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
      const fallbackW = fb.boxW * 0.55 * this.depthScaleEnemy(footY);
      const shadowW = actorShadowWidthFromSprite(this.enemies.get(e.id), fallbackW);
      this.placeShadowSprite(e.id, e.x + e.width / 2, footY - 2, shadowW, horizonAlpha, seen);
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
    this.drawPlayer(this.playerView, player, now);

    // Enemies (mark-and-sweep pool)
    const seen = new Set<string>();
    for (const e of enemies) {
      seen.add(e.id);
      let view = this.enemies.get(e.id);
      if (!view) {
        view = this.makeActor();
        this.enemies.set(e.id, view);
      }
      this.drawEnemy(view, e, gameTime, now);
    }
    for (const [id, view] of this.enemies) {
      if (!seen.has(id)) {
        view.light.destroy();
        view.container.destroy({ children: true });
        this.enemies.delete(id);
      }
    }
  }

  // 錬金術の召喚ユニット(味方)。敵と同じ actor プール/y-sort を使い、流用タイプの
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
    view.sprite.position.set(Math.round(fb.footX), Math.round(fb.footY));
    view.container.zIndex = fb.footY;
    view.container.alpha = 1;
    if (tex) {
      view.sprite.texture = tex;
      const sc = containScale(fb.boxW, fb.boxH, tex.width, tex.height) * this.depthScaleEnemy(fb.footY);
      view.sprite.scale.set(sc, sc);
      view.sprite.tint = ALCHEMY_SUMMON_TINT; // 味方識別のシアン
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

  private drawPlayer(view: ActorView, p: Player, now: number) {
    const fb = playerFootBox(p);
    const walking = p.isMoving && p.direction !== 'idle';
    const usesMagnumSprite = p.characterClass === 'mage';
    const usesShotgunSprite = p.characterClass === 'warrior';
    const usesStrikerSprite = p.characterClass === 'rogue';
    const usesScavengerSprite = p.characterClass === 'necromancer';
    const frame = playerWalkFrame(p, now, walking);
    const textureName = usesMagnumSprite
      ? `player-magnum-walk-${frame}`
      : usesShotgunSprite
        ? `player-shotgun-walk-${frame}`
      : usesScavengerSprite
        ? `player-striker-walk-${frame}`
      : usesStrikerSprite
        ? `player-scavenger-walk-${frame}`
        : 'player';
    const tex = getTexture(textureName) ?? getTexture('player');
    view.sprite.texture = tex ?? view.sprite.texture;
    const phase = walking ? (now / PLAYER_WALK_CYCLE_MS) * Math.PI * 2 : 0;
    const step = Math.sin(phase);
    const bob = walking ? Math.abs(step) * PLAYER_WALK_BOB_PX * this.depthScale(fb.footY) : 0;

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
      const baseScale = usesMagnumSprite || usesShotgunSprite || usesStrikerSprite || usesScavengerSprite
        ? PLAYER_CLASS_MENU_SPRITE_WIDTH / tex.width
        : containScale(fb.boxW, fb.boxH, tex.width, tex.height);
      const sc = baseScale * this.depthScale(fb.footY) * introScale;
      const flip = p.direction === 'left' || (p.lastDirection != null && p.lastDirection.x < 0);
      view.sprite.scale.set((flip ? -sc : sc) * introSqX, sc * introSqY);
      view.sprite.rotation = 0;
    }
    view.sprite.position.set(
      this.snapToScreenPixel(fb.footX, this.L.world.position.x) + introOffX,
      this.snapToScreenPixel(fb.footY - bob, this.L.world.position.y) + introOffY,
    );
    view.sprite.alpha = p.invulnerable ? 0.5 + 0.5 * Math.sin(now / 50) : 1;
    view.container.zIndex = fb.footY;
    view.light.visible = false;
    view.reticle.clear();
    // 刀/村雨装備中: スプライトの下レイヤー(reticle)に背負い刀のドットを描く。
    // 村雨は刀身シルバー。
    const katanaVariant: KatanaVariant | null = p.subWeapons.includes('murasame')
      ? 'murasame'
      : p.subWeapons.includes('katana')
        ? 'katana'
        : null;
    if (katanaVariant) {
      const flip = p.direction === 'left' || (p.lastDirection != null && p.lastDirection.x < 0);
      this.drawPlayerKatanaOnBack(view.reticle, fb.footX + introOffX, fb.footY - bob + introOffY, fb.boxH, flip, katanaVariant);
    }
    view.overlay.clear();
  }

  // 刀サブウェポン: キャラ中央付近・背面に背負った刀のドット絵。専用テクスチャ
  // を増やさず、`katanaShape` の共有ドット配置を軽量Graphicsで描く(HUDアイコン
  // と同じデザイン)。赤い鞘・少し反り・縦やや斜め。村雨は刀身シルバー。
  private drawPlayerKatanaOnBack(g: Graphics, footX: number, footY: number, boxH: number, flip: boolean, variant: KatanaVariant) {
    const d = this.depthScale(footY);
    const h = boxH * d;
    // 形・幅・角度・位置(中心)は据え置き。KATANA_BACK_SCALE で全体を中心
    // まわりに縮小するだけ(中心 = 体の胸あたりで固定)。
    const size = h * 1.5 * KATANA_BACK_SCALE;
    const w = size * 0.6;
    const dir = flip ? -1 : 1;
    const pivotX = footX;             // 中心X(体の中央)
    const pivotY = footY - h * 0.59;  // 中心Y(胸あたり)— 縮小しても動かない
    const originX = pivotX - w / 2;
    const originY = pivotY - size / 2;
    const ang = dir * KATANA_BACK_ROT;
    const cosA = Math.cos(ang);
    const sinA = Math.sin(ang);
    for (const r of buildKatanaShape(dir, variant)) {
      const rw = r.w * w;
      const rh = r.h * size;
      const ccx = originX + r.x * w + rw / 2;
      const ccy = originY + r.y * size + rh / 2;
      const ox = ccx - pivotX;
      const oy = ccy - pivotY;
      const nx = pivotX + ox * cosA - oy * sinA;
      const ny = pivotY + ox * sinA + oy * cosA;
      g.rect(nx - rw / 2, ny - rh / 2, rw, rh).fill({ color: r.color, alpha: r.alpha });
    }
  }

  private drawEnemy(view: ActorView, e: Enemy, gameTime: number, now: number) {
    const fb = enemyFootBox(e);
    const tex = getTexture(labEnemyTextureName(e.type, e.id) ?? e.type);
    const cx = e.x + e.width / 2;
    const cy = e.y + e.height / 2;

    // パンプキン特殊AI演出(描画のみ): 縮み(しゃがみ)/ジャンプのアーク/着地スカッシュ。Lv3も同様。
    let aiSqX = 1, aiSqY = 1, aiHop = 0;
    if (e.type === 'pumpkin' || e.type === 'lab-zombie-3') {
      if (e.aiPhase === 'crouch') {
        const p = Math.max(0, Math.min(1, 1 - ((e.aiPhaseUntil ?? gameTime) - gameTime) / PUMPKIN_CROUCH_MS));
        aiSqY = 1 - 0.42 * p; aiSqX = 1 + 0.14 * p; // しゃがんで縦縮み・横広がり
      } else if (e.aiPhase === 'jump') {
        const t = Math.max(0, Math.min(1, (gameTime - (e.aiStartedAt ?? gameTime)) / PUMPKIN_JUMP_MS));
        aiHop = Math.sin(t * Math.PI) * PUMPKIN_JUMP_HEIGHT; // 1秒のジャンプアーク(描画のみ)
        aiSqY = 1.08; aiSqX = 0.94;                          // 空中は少し縦伸び
      } else if (e.aiPhase === 'recover') {
        const since = gameTime - ((e.aiPhaseUntil ?? gameTime) - PUMPKIN_RECOVER_MS);
        if (since >= 0 && since < 170) { const w = 1 - since / 170; aiSqY = 1 - 0.4 * w; aiSqX = 1 + 0.18 * w; } // 着地スカッシュ
      }
    }

    const liftT = e.liftUntil !== undefined ? Math.max(0, (e.liftUntil - now) / BOSS_FINISH_LIFT_MS) : 0;
    const liftHop = Math.sin(liftT * Math.PI) * BOSS_FINISH_LIFT_PX;
    const liftShake = liftT > 0 ? Math.sin(now / 24) * 2.2 * liftT : 0;
    view.sprite.position.set(Math.round(fb.footX + liftShake), Math.round(fb.footY - liftHop - aiHop));
    view.container.zIndex = fb.footY;
    const horizonAlpha = this.horizonActorAlpha(fb.footY);
    view.container.alpha = horizonAlpha;
    view.sprite.alpha = e.type === 'ghost' ? 0.65 : 1;

    if (tex) {
      view.sprite.texture = tex;
      const sc = containScale(fb.boxW, fb.boxH, tex.width, tex.height) * this.depthScaleEnemy(fb.footY);
      const breath = this.enemyBreath(e, now);
      // 被弾しなり: 撃たれた直後だけ頭(上方)を後ろ(ノックバック方向)へ skew で反らせ、軽く縦縮み。
      // アンカーが足元寄りなので skew だけで頭が大きく振れる。短時間で戻る。新規描画なし=軽い。
      const sinceHit = now - e.lastHit;
      let flinchSqY = 1;
      if (sinceHit >= 0 && sinceHit < ENEMY_HIT_FLINCH_MS) {
        const wob = 1 - sinceHit / ENEMY_HIT_FLINCH_MS; // 1→0 減衰
        const dir = e.knockbackVx > 0.01 ? 1 : e.knockbackVx < -0.01 ? -1 : 1;
        view.sprite.skew.x = -dir * ENEMY_HIT_FLINCH_SKEW * wob; // 頭が後ろへ反る
        flinchSqY = 1 - 0.1 * wob;
      } else {
        view.sprite.skew.x = 0;
      }
      view.sprite.scale.set(sc * breath.x * aiSqX, sc * breath.y * flinchSqY * aiSqY);
      view.sprite.visible = true;
    } else {
      view.sprite.skew.x = 0;
      view.sprite.visible = false; // placeholder ellipse drawn in reticle below
    }

    if (horizonAlpha <= 0) view.light.visible = false;
    else {
      this.syncEnemyLight(view, e, fb.footX, fb.footY, now);
      view.light.alpha *= horizonAlpha;
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
    this.drawHealthBar(o, e);
    if (e.type === 'pumpkin' || e.type === 'giantbat' || e.type === 'reaper') {
      this.drawBossMarker(o, cx, e.y - 6, e.type === 'reaper' ? 0xef4444 : 0xfde68a, now);
    }
    this.drawEnemyRankOrnament(o, e, fb.footX, fb.footY);
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

  private drawEnemyRankOrnament(g: Graphics, e: Enemy, footX: number, footY: number) {
    const rank = e.difficultyRank && e.difficultyRank !== 'normal'
      ? ENEMY_RANK_ORNAMENT[e.difficultyRank]
      : undefined;
    if (!rank) return;

    const d = this.depthScaleEnemy(footY);
    const bodyW = Math.max(14, e.width * d);
    const bodyH = Math.max(18, e.height * d);
    const topY = footY - bodyH;
    const shoulderY = topY + bodyH * 0.5;
    const headY = topY + bodyH * 0.15;
    const px = Math.max(1, Math.round(2 * d));

    if (rank.ring != null) {
      g.ellipse(footX, footY - 1 * d, bodyW * 0.48, Math.max(2, bodyW * 0.13))
        .stroke({ width: Math.max(1, px), color: rank.ring, alpha: 0.72 });
    }

    if (rank.wing != null) {
      const wingW = Math.max(5, bodyW * 0.24);
      const wingH = Math.max(4, bodyH * 0.18);
      const leftRoot = footX - bodyW * 0.32;
      const rightRoot = footX + bodyW * 0.32;
      g.poly([
        leftRoot, shoulderY,
        leftRoot - wingW, shoulderY - wingH * 0.42,
        leftRoot - wingW * 0.62, shoulderY + wingH,
      ]).fill({ color: rank.wing, alpha: 0.95 });
      g.poly([
        rightRoot, shoulderY,
        rightRoot + wingW, shoulderY - wingH * 0.42,
        rightRoot + wingW * 0.62, shoulderY + wingH,
      ]).fill({ color: rank.wing, alpha: 0.95 });
      g.rect(leftRoot - wingW * 0.72, shoulderY + wingH * 0.12, Math.max(1, px), Math.max(2, wingH * 0.42))
        .fill({ color: 0x020617, alpha: 0.55 });
      g.rect(rightRoot + wingW * 0.72, shoulderY + wingH * 0.12, Math.max(1, px), Math.max(2, wingH * 0.42))
        .fill({ color: 0x020617, alpha: 0.55 });
    }

    if (rank.horn != null) {
      const hornW = Math.max(3, bodyW * 0.11);
      const hornH = Math.max(5, bodyH * 0.14);
      const hornY = headY + hornH * 0.35;
      const hornOffset = Math.max(4, bodyW * 0.16);
      g.poly([
        footX - hornOffset, hornY,
        footX - hornOffset - hornW, hornY - hornH,
        footX - hornOffset + hornW * 0.35, hornY - hornH * 0.2,
      ]).fill({ color: rank.horn, alpha: 0.95 });
      g.poly([
        footX + hornOffset, hornY,
        footX + hornOffset + hornW, hornY - hornH,
        footX + hornOffset - hornW * 0.35, hornY - hornH * 0.2,
      ]).fill({ color: rank.horn, alpha: 0.95 });
    }
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
    // 寿命末の600msでフェードアウト。
    const remaining = p.duration - age;
    const alpha = Math.max(0, Math.min(1, remaining / 600));
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
    v.container.position.set(footX, footY - drop);
    v.container.zIndex = footY;
    v.sprite.scale.set(baseScale * sqx, baseScale * sqy);

    // 寿命末で早めにフェードアウト。
    const remaining = p.duration - age;
    v.sprite.alpha = Math.max(0, Math.min(1, remaining / 600));

    // 耐久が減ると赤み(亀裂感)。tint のみ・常時glowなし。
    const hp = p.shieldHp ?? 1;
    const maxHp = p.shieldMaxHp ?? hp;
    const worn = maxHp > 0 ? 1 - Math.max(0, Math.min(1, hp / maxHp)) : 0;
    if (worn > 0.01) {
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
      case 'trap': {
        const age = Math.max(0, Math.min(1, (Date.now() - p.createdAt) / Math.max(1, p.duration)));
        const pulse = 0.65 + Math.sin(age * Math.PI * 12) * 0.16;
        const radius = p.area ?? 34;
        g.circle(0, 0, radius).stroke({ color: 0x38bdf8, alpha: 0.42 * pulse, width: 1.5 });
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
          g.circle(0, 0, range).stroke({ color: 0x06121f, alpha: 0.5, width: 3 });          // 黒フチ
          g.circle(0, 0, range).stroke({ color: 0x38bdf8, alpha: 0.55 * pulse, width: 1.5 }); // シアン本線
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
  }

  // ---- 屋内(研究施設)ステージの床/壁/扉/マーカー(仮実装=塗り矩形) ----------
  private syncLab() {
    const s = useGameStore.getState();
    const indoor = s.indoorMode;
    const persp = indoor && LAB_PERSP; // A1: 研究所だけ「床を遠近」にする試作(フラグ時のみ)。
    // 屋外の screen-space 背景/床/前景と world の木は屋内では隠す。
    // ただし ?labpersp の屋内では地面ストリップ(遠近床)を流用するので groundBase は表示する。
    this.L.farBackdrop.visible = !indoor;
    this.L.horizonForest.visible = !indoor;
    this.L.groundBase.visible = !indoor || persp;
    this.L.frontForest.visible = !indoor;
    this.L.backgroundLayer.visible = !indoor;
    if (!indoor) {
      this.restoreGroundStrips(); // 屋外復帰: ?labpersp で差し替えた床を元へ
      if (this.labGfx) this.labGfx.visible = false;
      if (this.labVoid) this.labVoid.visible = false;
      if (this.labFloor) this.labFloor.visible = false;
      if (this.labFloorDecor) this.labFloorDecor.visible = false;
      if (this.labWallShadow) this.labWallShadow.visible = false;
      if (this.labWalls) this.labWalls.visible = false;
      for (const ts of this.labWallActors) ts.visible = false;
      for (const sp of this.labPropSprites) sp.visible = false;
      this.vignette.alpha = ENV_VIGNETTE_ALPHA; // 屋外は通常の周辺減光に戻す
      return;
    }
    // 屋内は周辺減光(環境の暗がり)を広範囲に強める(社長指示)。
    this.vignette.alpha = LAB_VIGNETTE_ALPHA;
    // A1 試作(?labpersp): フラット床/変種/void を使わず、ステージ1の遠近 ground を研究所床テクスチャで流用。
    // 当たり判定/移動/aim は不変(描画だけ斜め遠近)。壁/プロップ/アクターは現状(depthScale)のまま。
    if (persp) {
      const labTex = getTexture('lab-floor/lab-floor-clean');
      if (labTex) {
        if (!this.groundStripBaseTex && this.L.groundStrips[0]) this.groundStripBaseTex = this.L.groundStrips[0].texture;
        for (const strip of this.L.groundStrips) { strip.texture = labTex; strip.tint = LAB_ENV_TINT; }
      }
      if (this.labVoid) this.labVoid.visible = false;
      if (this.labFloor) this.labFloor.visible = false;
      if (this.labFloorDecor) this.labFloorDecor.visible = false;
    } else {
      this.restoreGroundStrips();
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
        const addBlock = (x: number, y: number, w: number, h: number, footY: number, decorative: boolean) => {
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
          this.labWallDepth.push({ cont, footY, fullH: h + RISE }); // 擬似遠近(高さのみ)用に保持
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
      // 擬似遠近(高さ方向のみ): 手前(footY 大)ほど高く、奥ほど低く。足元(下辺)をピン留め、width は不変。
      // depthRefY(プレイヤー足元)が変わった時だけ更新(変化なしならスキップ)。
      if (LAB_WALL_DEPTH_STRENGTH > 0 && this.labWallDepthRefY !== this.depthRefY) {
        this.labWallDepthRefY = this.depthRefY;
        const k = DEPTH_K * LAB_WALL_DEPTH_STRENGTH;
        for (const e of this.labWallDepth) {
          const d = this.depthScaleWith(e.footY, k, LAB_WALL_DEPTH_MIN, LAB_WALL_DEPTH_MAX);
          e.cont.scale.y = d;                       // 高さのみスケール(scale.x は 1 のまま)
          e.cont.position.y = e.footY - e.fullH * d; // 足元(下辺)を footY に固定
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
    if (!floorTex) g.rect(LAB_BOUNDS.x, LAB_BOUNDS.y, LAB_BOUNDS.width, LAB_BOUNDS.height).fill({ color: 0x10151c }); // 床フォールバック
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
      for (const p of s.labProps) {
        const tex = getTexture(p.variant);
        if (!tex) continue;
        const sp = new Sprite(tex);
        sp.anchor.set(0.5, 1);            // 足元アンカー
        sp.position.set(Math.round(p.x), Math.round(p.y));
        sp.zIndex = p.y;                  // 木/敵と同じ尺度で深度ソート
        this.L.actorLayer.addChild(sp);
        this.labPropSprites.push(sp);
      }
    }
    // 毎フレーム depth スケール(プレイヤー足元基準の擬似遠近)。プロップは数個なので軽い。
    const PROP_DISPLAY = 76; // 表示の基準高さ(px)
    for (const sp of this.labPropSprites) {
      sp.visible = true;
      const t = sp.texture;
      sp.scale.set(containScale(PROP_DISPLAY, PROP_DISPLAY, t.width, t.height) * this.depthScaleEnemy(sp.position.y));
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
      } else if (e.kind === 'dogFetch') {
        this.drawDogFetchSprite(e, now);
      } else if (e.kind === 'glow' && e.radius <= SMALL_GLOW_SPRITE_RADIUS_MAX) {
        this.drawSmallGlowSprite(e, now);
      } else if (e.kind === 'whip') {
        this.drawWhipSprite(e, now);
      } else {
        let g = this.effects.get(e.id);
        const targetLayer = e.kind === 'trail' || (e.kind === 'glow' && e.radius >= STRONG_GLOW_RADIUS)
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
        obj.destroy();
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
      case 'glow': {
        // Additive soft disc with a brighter core (radial-gradient approximation).
        g.blendMode = 'add';
        g.alpha = 1 - t;
        const isStrong = e.radius >= STRONG_GLOW_RADIUS;
        const color = `${e.color}1)`;
        if (isStrong) {
          // Strong events get their broad ground contrast from
          // syncLocalEventLighting. Keep this top-layer glow compact so it
          // does not wash over the cast shadows and make them disappear.
          g.circle(e.x - 2, e.y, e.radius * 0.74).fill({ color: 0xff3344, alpha: 0.035 });
          g.circle(e.x + 2, e.y, e.radius * 0.74).fill({ color: 0x38d9ff, alpha: 0.03 });
          g.circle(e.x, e.y, e.radius * 0.82).fill({ color, alpha: 0.1 });
          g.circle(e.x, e.y, e.radius * 0.46).fill({ color, alpha: 0.24 });
          g.circle(e.x, e.y, e.radius * 0.22).fill({ color: 0xffffff, alpha: 0.42 });
          g.circle(e.x, e.y, e.radius * 0.5).stroke({ width: 2.5, color, alpha: 0.5 });
          g.circle(e.x, e.y, e.radius * 0.28).stroke({ width: 1.25, color: 0xffffff, alpha: 0.44 });
        } else {
          g.circle(e.x, e.y, e.radius).fill({ color, alpha: 0.4 });
          g.circle(e.x, e.y, e.radius * 0.55).fill({ color, alpha: 0.5 });
          g.circle(e.x, e.y, e.radius).stroke({ width: 2, color });
        }
        break;
      }
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
      sprite.anchor.set(0.5);
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

  // 鞭 lash を実スプライトで描画。手元(WHIP_SPRITE_ANCHOR)をプレイヤー位置に固定し、
  // 振り方向へ回転、手元→先端が strike 距離(reach)に一致するよう伸縮。一振りごとにフェード。
  private drawWhipSprite(e: Extract<VisualEffect, { kind: 'whip' }>, now: number) {
    const t = Math.min(1, (now - e.createdAt) / e.duration);
    let sprite = this.effects.get(e.id);
    if (!(sprite instanceof Sprite)) {
      if (sprite) sprite.destroy();
      sprite = new Sprite();
      sprite.anchor.set(WHIP_SPRITE_ANCHOR_X, WHIP_SPRITE_ANCHOR_Y);
      this.L.effectLayer.addChild(sprite);
      this.effects.set(e.id, sprite);
    }
    const tex = getTexture('whip');
    if (!tex) { sprite.visible = false; return; }
    if (sprite.texture !== tex) sprite.texture = tex;
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

  private drawDamageNumber(e: Extract<VisualEffect, { kind: 'damageNumber' }>, now: number) {
    const t = (now - e.createdAt) / e.duration;
    const scale = e.scale ?? (e.crit ? 1.35 : 1);
    const bold = e.crit || scale > 1.2;
    let txt = this.effects.get(e.id) as Text | undefined;
    if (!txt || !(txt instanceof Text)) {
      txt = new Text({
        text: e.text ?? String(e.value),
        style: {
          // 明朝(serif)指定の時は和文セリフのスタック。それ以外は既存フォント。
          fontFamily: e.serif
            ? '"Hiragino Mincho ProN", "Yu Mincho", "YuMincho", "MS Mincho", "Noto Serif JP", serif'
            : '"Special Elite", ui-rounded, system-ui, sans-serif',
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

  // ---- player FX: counter ring + reload meter (world space) ----------------

  private syncPlayerFx(player: Player, now: number, gameTime: number) {
    const g = this.playerFx;
    g.clear();
    const cx = player.x + player.width / 2;
    const cy = player.y + player.height / 2;
    const r = huntingMeleeRadius(player);
    // ワイヤーアンカー: 装備中は前方(ショットガン射程)に青サークルを常時表示。打ち込み中/受付中/移動中は
    // アンカー地点を表示。重いglow/大量パーティクルは使わない(軽い円・線のみ)。
    if (this.wireTip) this.wireTip.visible = false; // 既定は非表示(設置中のみ表示)
    if (player.subWeapons.includes('wire-anchor')) {
      const dashing = now < player.wireDashUntil;
      const anchorSet = (player.wireAnchored || dashing) && (player.wireAnchorX !== 0 || player.wireAnchorY !== 0);
      const charging = player.wireAnchored && now < player.wirePlantUntil; // 溜中
      const ax = player.wireAnchorX, ay = player.wireAnchorY;
      if (anchorSet) {
        // 投げた方向(プレイヤー→アンカー)。先端の「爪」はこの向きへ刺さる(素材の基準向き=左下)。
        let tdx = ax - cx, tdy = ay - cy;
        const tdl = Math.hypot(tdx, tdy) || 1;
        tdx /= tdl; tdy /= tdl;
        // 打ち込む挙動: 溜中(1秒)は先端がプレイヤー→アンカーへ飛んでいき、溜完了でアンカー地点に刺さる
        // (=ドット絵が「打ち込まれる」のは1秒後)。溜完了/移動中は刺さった位置(ax,ay)に固定。
        let tipX = ax, tipY = ay;
        if (charging) {
          const p = Math.max(0, Math.min(1, 1 - (player.wirePlantUntil - now) / WIRE_PLANT_MS));
          tipX = cx + (ax - cx) * p;
          tipY = cy + (ay - cy) * p;
        }
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
          // 素材の爪は左下(角度135°)向き。投擲方向へ回す。
          this.wireTip.rotation = Math.atan2(tdy, tdx) - Math.atan2(1, -1);
          this.wireTip.alpha = charging ? 0.9 : 1; // 飛行中は少しだけ薄く、刺さると不透明
          this.wireTip.visible = true;
        }
        // 穴(eyelet)は爪と反対=プレイヤー側。ワイヤーはここに繋ぐ(about)。飛行中も先端基準で算出。
        const holeDist = TIP * 0.4;
        const hx = tipX - tdx * holeDist;
        const hy = tipY - tdy * holeDist;
        // ワイヤー線(穴→プレイヤー)。単独の moveTo→lineTo→stroke(飛ぶにつれ伸びる)。
        const lineAlpha = dashing ? 0.85 : charging ? 0.6 : 0.7;
        g.moveTo(hx, hy).lineTo(cx, cy).stroke({ width: 2.5, color: 0x93c5fd, alpha: lineAlpha });
      } else if (!player.wireAnchored && !dashing && gameTime >= (player.subWeaponCooldowns['wire-anchor'] ?? 0)) {
        // 待機(アンカー未設置・CD明け): 慣性付き aim(向き×傾き強度)の先に青サークルプレビュー。
        // store の打ち込み地点(=center+aim*RANGE)と一致。クールダウン中は非表示(撃てないことを明示)。
        const px = cx + player.aimX * WIRE_ANCHOR_RANGE;
        const py = cy + player.aimY * WIRE_ANCHOR_RANGE;
        g.circle(px, py, 7).stroke({ width: 2, color: 0x60a5fa, alpha: 0.7 });
        g.circle(px, py, 2).fill({ color: 0x93c5fd, alpha: 0.7 });
      }
    }
    // PHILL銃: アクティブ銃が phill-revolver のとき、狙いサークル(赤橙レティクル)を前方に表示。
    // 射撃クールダウン中は薄く(=今は撃てないことを示す)。アンカー(青)と差別化。
    {
      const phill = player.weapons.find(w => w.id === player.activeWeaponId);
      if (phill?.key === 'phill-revolver') {
        // 照準サークルは store の慣性付き aim(向き×傾き強度)に揃える。弾も同じ aim 方向へ撃つ
        // ので、サークル位置と弾道が一致する(慣性は movePlayer 側で付与)。
        const ax = cx + player.aimX * 190; // 190=PHILL_AIM_RANGE。aim 長(0..1)で距離も可変。
        const ay = cy + player.aimY * 190;
        const onCd = now - (phill.lastFired ?? 0) < (phill.cooldown ?? 1000);
        const reloading = phill.id === player.reloadingWeaponId && now < player.reloadEndsAt;
        const a = (onCd || reloading) ? 0.2 : 0.85;
        g.circle(ax, ay, 9).stroke({ width: 2, color: 0xf97316, alpha: a });          // 外リング(橙)
        g.circle(ax, ay, 3).fill({ color: 0xfca5a5, alpha: a });                        // 中心ドット(赤)
        // 照準の十字(小)。
        g.moveTo(ax - 13, ay).lineTo(ax - 6, ay).moveTo(ax + 6, ay).lineTo(ax + 13, ay)
          .moveTo(ax, ay - 13).lineTo(ax, ay - 6).moveTo(ax, ay + 6).lineTo(ax, ay + 13)
          .stroke({ width: 1.5, color: 0xf97316, alpha: a * 0.8 });
      }
    }
    // ドローンブーメランのクールダウン表示: 近接クールダウンサークルより一回り大きい円(社長指示)。
    if (player.subWeapons.includes('drone-boomerang') && gameTime < (player.subWeaponCooldowns['drone-boomerang'] ?? 0)) {
      g.circle(cx, cy, r * 1.28).stroke({ width: 1.5, color: 0x67e8f9, alpha: 0.28 });
    }
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
    camera: { x: number; y: number }
  ) {
    const g = this.arrowGfx;
    g.clear();
    const marginX = 26;
    // Keep upward arrows below the iOS status bar and the top HUD. The icon
    // itself plus the arrowhead extends ~20px above its anchor, so the clamp
    // needs to be materially lower than the visible HUD edge.
    const marginTop = Math.min(Math.max(154, this.screenH * 0.17), this.screenH - 96);
    const marginBottom = 30;
    const cxC = this.screenW / 2;
    const cyC = this.screenH / 2;
    const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 220);
    for (const p of pickups) {
      if (!p.worldDrop) continue;
      const colorStr = AMMO_INDICATOR_COLOR[p.type];
      if (!colorStr) continue;
      const tx = p.x + 8 - camera.x;
      const ty = p.y + 8 - camera.y;
      if (tx >= 0 && tx <= this.screenW && ty >= 0 && ty <= this.screenH) continue;
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
    if (castleX < 0 || castleX > this.screenW || castleY < 0 || castleY > this.screenH) {
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
    for (const e of this.trees.values()) e.sprite.destroy();
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
    this.shadowGfx.destroy();
    this.playerFx.destroy();
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
