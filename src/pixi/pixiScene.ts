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

import { BlurFilter, Container, Graphics, Sprite, Text, Texture, Rectangle, Filter } from 'pixi.js';
import { TiltShiftFilter, AdvancedBloomFilter } from 'pixi-filters';
import type {
  BreakableProp, CastleEvent, Enemy, EventQuestNpc, Pickup, Player, Projectile, VisualEffect, WeaponMerchant,
} from '../types/game';
import { useGameStore, huntingMeleeRadius, SHAKE_MS, COUNTER_WINDOW, katanaRange } from '../store/gameStore';
import { getEnemyColor } from '../utils/enemyUtils';
import { effectiveReloadMs } from '../utils/weaponUtils';
import { pickupDisplayPosition } from '../utils/collisionUtils';
import { buildKatanaShape, type KatanaVariant } from '../utils/katanaShape';
import type { SceneLayers } from './layers';
import { getTexture } from './pixiTextures';
import { getGlowTexture, getVignetteTexture } from './lighting';
import { enemyFootBox, playerFootBox } from './renderSpec';
import { treesInRegion, TREE_CELL } from '../world/trees';

// --- moonlit atmosphere tuning (tweak freely on-device) -------------------
const GRADE_TINT = 0x7e93c9;   // cool blue multiply over the whole world
const GRADE_ALPHA = 0.4;       // strength of the cool grade
const PLAYER_HUNTING_LIGHT_TINT = 0x60a5fa;
const VIGNETTE_ALPHA = 0.85;
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

// Tilt-shift depth-of-field: keeps a horizontal band sharp and blurs the far
// (top) and near (bottom) edges for the HD-2D "diorama" feel. The sharp band is
// centred a touch above middle so the player (slightly below centre) stays
// crisp. Set ENABLED false if it costs too much on-device.
const TILT_SHIFT_ENABLED = true;
const TILT_SHIFT_BLUR = 14;       // max blur strength at the edges
const TILT_SHIFT_GRADIENT = 440;  // px over which sharp ramps into blur
const TILT_SHIFT_BAND = 0.46;     // sharp-band centre as a fraction of height

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
const STAGE_LIGHT_SHAFT_DRIFT_PX = 18;
const STAGE_LIGHT_SHAFT_DRIFT_WORLD_PX = 620;
const STAGE_LIGHT_SHAFT_PULSE_MS = 5200;
const STAGE_LIGHT_SHAFT_PULSE_AMOUNT = 0.08;
const PLAYER_SHADOW_SCALE = 0.9;

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

const SPRITE_PICKUPS = new Set(['experience', 'health', 'magnet', 'bomb', 'chest', 'weapon-crate', 'treasure']);

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

// Flat elliptical foot shadow, matching renderUtils.drawGroundShadow's geometry
// (the passed `w` is pre-scaled by the caller; ellipse radii are w*0.55/w*0.18).
const drawShadow = (g: Graphics, cx: number, cy: number, w: number, alpha: number) => {
  g.ellipse(cx, cy, w * 0.55, w * 0.18).fill({ color: 0x000000, alpha });
};

const drawDirectionalShadow = (
  g: Graphics,
  cx: number,
  cy: number,
  w: number,
  alpha: number,
  lighting: StageLightingPreset
) => {
  const mag = Math.hypot(lighting.direction.x, lighting.direction.y) || 1;
  const ux = lighting.direction.x / mag;
  const uy = lighting.direction.y / mag;
  const scale = Math.max(0.7, Math.min(1.55, w / 42));
  const length = lighting.shadowLength * scale;
  const radiusX = w * 0.55;
  const radiusY = w * 0.18;
  const width = Math.max(3, Math.hypot(radiusX * uy, radiusY * ux) * 2);
  g.moveTo(cx + ux * 1.5, cy - 1 + uy * 1.5)
    .lineTo(cx + ux * length, cy - 1 + uy * length)
    .stroke({
      width,
      color: 0x000000,
      alpha: alpha * lighting.shadowAlpha,
      cap: 'round',
    });
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

export class PixiScene {
  private L: SceneLayers;

  private trees = new Map<string, { sprite: Sprite; baseScale: number; footY: number }>();
  private enemies = new Map<string, ActorView>();
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
  private effects = new Map<string, EffectView>();

  private shadowGfx = new Graphics();
  private groundReflectionGfx = new Graphics();
  private localEventShadeGfx = new Graphics();
  private playerFx = new Graphics();   // counter ring + reload meter (world)
  private flashGfx = new Graphics();   // full-screen damage flashes (screen)
  private arrowGfx = new Graphics();   // off-screen supply arrows (screen)

  // Atmosphere (screen space). gradeSprite multiplies the world cool; the warm
  // playerLight is added on top so the hero stays bright; vignette darkens edges.
  private gradeSprite = new Sprite(Texture.WHITE);
  private playerLight = new Sprite(getGlowTexture());
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

  private screenW = 1;
  private screenH = 1;
  private cameraY = 0;
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
    this.groundReflectionGfx.blendMode = 'add';
    this.L.groundLayer.addChild(
      this.groundReflectionGfx,
      this.playerLight,
      this.shadowGfx,
    );

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

    this.vignette.alpha = VIGNETTE_ALPHA;

    // Screen-space overlays: cool multiply grade darkens/cools the whole scene
    // (multiply preserves detail/outlines), then the vignette, then damage
    // flash + off-screen arrows on top of everything.
    this.L.uiLayer.addChild(
      this.stageLightShaftGfx,
      this.gradeSprite, this.vignette,
      this.flashGfx, this.arrowGfx,
    );
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
    this.updateStageLightShafts(w, h);

    // Pin the DoF filter to the screen and put its sharp band at TILT_SHIFT_BAND.
    if (this.tiltShift) {
      this.L.filteredWorld.filterArea = new Rectangle(0, 0, w, h);
      const bandY = h * TILT_SHIFT_BAND;
      this.tiltShift.start = { x: 0, y: bandY };
      this.tiltShift.end = { x: w, y: bandY };
    }
  }

  private updateStageLightShafts(w: number, h: number) {
    const g = this.stageLightShaftGfx;
    g.clear();
    const alpha = ACTIVE_STAGE_LIGHTING.shaftAlpha;
    if (alpha <= 0) return;
    g.blendMode = 'add';
    const color = ACTIVE_STAGE_LIGHTING.color;
    const shafts = [
      { x: -w * 0.18, y: -h * 0.08, width: w * 0.18, length: h * 1.22, alpha: 0.42 },
      { x: w * 0.08, y: -h * 0.14, width: w * 0.12, length: h * 1.06, alpha: 0.28 },
      { x: w * 0.34, y: -h * 0.2, width: w * 0.16, length: h * 1.18, alpha: 0.22 },
    ];
    for (const s of shafts) {
      const x1 = s.x;
      const y1 = s.y;
      const x2 = s.x + s.length * STAGE_LIGHT_SHAFT_DIRECTION.x;
      const y2 = s.y + s.length * STAGE_LIGHT_SHAFT_DIRECTION.y;
      g.poly([
        x1,
        y1,
        x1 + s.width,
        y1,
        x2 + s.width * 0.32,
        y2,
        x2 - s.width * 0.68,
        y2,
      ]).fill({ color, alpha: alpha * s.alpha });
    }
  }

  private syncStageLightShaftDrift(player: Player, now: number) {
    const t = (playerFootBox(player).footX % STAGE_LIGHT_SHAFT_DRIFT_WORLD_PX) / STAGE_LIGHT_SHAFT_DRIFT_WORLD_PX;
    const drift = Math.sin(t * Math.PI * 2) * STAGE_LIGHT_SHAFT_DRIFT_PX;
    this.stageLightShaftGfx.position.set(drift, 0);
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
    const now = Date.now();
    this.cameraY = s.camera.y;

    // Focal plane for the pseudo-perspective scale = the player's feet.
    this.depthRefY = playerFootBox(s.player).footY;

    // Camera offset + screen shake on the whole world (and the floor).
    let sx = 0;
    let sy = 0;
    const shakeLeft = s.shakeUntil ? s.shakeUntil - now : 0;
    if (shakeLeft > 0) {
      const mag = 7 * Math.min(1, shakeLeft / SHAKE_MS);
      sx = (Math.random() * 2 - 1) * mag;
      sy = (Math.random() * 2 - 1) * mag;
    }
    this.L.world.position.set(-s.camera.x + sx, -s.camera.y + sy);
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
    this.syncCastle(s.castleEvent, now);
    this.syncMerchant(s.weaponMerchant, s.player, now);
    this.syncEventQuestNpc(s.eventQuestNpc, s.player, now);
    this.syncBreakableProps(s.breakableProps, now);
    this.syncPickups(s.pickups, now);
    this.syncActors(s.player, s.enemies, s.gameTime, now);
    this.syncShadows(s.player, s.enemies);
    this.syncStageLightShaftDrift(s.player, now);
    this.syncProjectiles(s.projectiles, now);
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
    this.syncArrows(s.pickups, s.castleEvent, s.weaponMerchant, s.camera);
    this.syncFlash(s.effects, now);

    // Warm ground pool follows the player. It lives in the world's groundLayer
    // (camera-offset already applied to the parent), so plain world coords.
    const lx = s.player.x + s.player.width / 2;
    const ly = s.player.y + s.player.height / 2;
    this.playerLight.position.set(lx, ly);
    this.playerLight.tint = s.player.huntingCharged ? PLAYER_HUNTING_LIGHT_TINT : ACTIVE_STAGE_LIGHTING.color;
    this.playerLight.alpha = ACTIVE_STAGE_LIGHTING.playerAssistAlpha * (s.player.huntingCharged ? 1.3 : 1) * (0.92 + 0.08 * Math.sin(now / 600));
    this.playerLight.width = this.playerLight.height = ACTIVE_STAGE_LIGHTING.playerAssistRadius * (s.player.huntingCharged ? 2.2 : 2);

    this.syncFireflies(s.camera, now);
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
      return;
    }

    const footY = castle.y + CASTLE_FOOT_OFFSET_Y;
    const horizonAlpha = this.horizonActorAlpha(footY);
    if (horizonAlpha <= 0) {
      this.castleView.visible = false;
      return;
    }

    const d = this.depthScale(footY);
    const pulse = castle.bossSpawned ? 0.75 + 0.25 * Math.sin(now / 260) : 0;
    const targetH = CASTLE_TARGET_HEIGHT * d;
    const sc = targetH / tex.height;

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
      return;
    }

    const horizonAlpha = this.horizonActorAlpha(merchant.y);
    if (horizonAlpha <= 0) {
      this.merchantView.visible = false;
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

    const g = this.merchantGfx;
    g.clear();
    drawShadow(g, 0, 0, 82 * d, 0.34);
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
      return;
    }

    const fadeElapsed = npc.status === 'completed' && npc.fadeStartedAt > 0
      ? now - npc.fadeStartedAt
      : 0;
    if (npc.status === 'completed' && fadeElapsed >= EVENT_NPC_FADE_MS) {
      this.eventNpcView.visible = false;
      return;
    }

    const horizonAlpha = this.horizonActorAlpha(npc.y);
    if (horizonAlpha <= 0) {
      this.eventNpcView.visible = false;
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

    const g = this.eventNpcGfx;
    g.clear();
    g.ellipse(0, 0, 76 * d * 0.66, 76 * d * 0.18).fill({ color: 0x000000, alpha: 0.32 });
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
    const tex = getTexture('tree');
    const margin = TREE_CELL;
    const trees = treesInRegion(
      camera.x - margin, camera.y - margin,
      camera.x + this.screenW + margin, camera.y + this.screenH + margin,
    );

    const seen = new Set<string>();
    for (const t of trees) {
      seen.add(t.key);
      let entry = this.trees.get(t.key);
      if (!entry) {
        const sprite = new Sprite(tex ?? undefined);
        sprite.anchor.set(0.5, 1);
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
    const pulse = visibleTorch
      ? 0.82 + 0.18 * Math.sin(now / 130 + prop.footX * 0.03)
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

    view.reflection.visible = true;
    view.reflection.position.set(prop.footX, prop.footY + 3 * d);
    view.reflection.tint = 0xff9f1c;
    view.reflection.width = TORCH_REFLECTION_W * d * prop.scale * pulse;
    view.reflection.height = TORCH_REFLECTION_H * d * prop.scale * (0.86 + 0.14 * pulse);
    view.reflection.alpha = 0.2 * torchAlpha * pulse * (0.82 + 0.18 * farFade);

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

  private syncShadows(player: Player, enemies: Enemy[]) {
    const g = this.shadowGfx;
    g.clear();
    const pf = playerFootBox(player);
    const playerFallbackW = pf.boxW * 0.55 * this.depthScale(pf.footY);
    const playerShadowW = actorShadowWidthFromSprite(this.playerView, playerFallbackW) * PLAYER_SHADOW_SCALE;
    drawDirectionalShadow(g, pf.footX, pf.footY - 2, playerShadowW, 1, ACTIVE_STAGE_LIGHTING);
    for (const e of enemies) {
      if (e.type === 'ghost') continue;
      const fb = enemyFootBox(e);
      const footY = e.y + e.height;
      const horizonAlpha = this.horizonActorAlpha(footY);
      if (horizonAlpha <= 0) continue;
      const fallbackW = fb.boxW * 0.55 * this.depthScaleEnemy(footY);
      const shadowW = actorShadowWidthFromSprite(this.enemies.get(e.id), fallbackW);
      drawDirectionalShadow(g, e.x + e.width / 2, footY - 2, shadowW, horizonAlpha, ACTIVE_STAGE_LIGHTING);
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
    if (tex) {
      const baseScale = usesMagnumSprite || usesShotgunSprite || usesStrikerSprite || usesScavengerSprite
        ? PLAYER_CLASS_MENU_SPRITE_WIDTH / tex.width
        : containScale(fb.boxW, fb.boxH, tex.width, tex.height);
      const sc = baseScale * this.depthScale(fb.footY);
      const flip = p.direction === 'left' || (p.lastDirection != null && p.lastDirection.x < 0);
      view.sprite.scale.set(flip ? -sc : sc, sc);
      view.sprite.rotation = 0;
    }
    view.sprite.position.set(
      this.snapToScreenPixel(fb.footX, this.L.world.position.x),
      this.snapToScreenPixel(fb.footY - bob, this.L.world.position.y),
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
      this.drawPlayerKatanaOnBack(view.reticle, fb.footX, fb.footY - bob, fb.boxH, flip, katanaVariant);
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
    const tex = getTexture(e.type);
    const cx = e.x + e.width / 2;
    const cy = e.y + e.height / 2;

    const liftT = e.liftUntil !== undefined ? Math.max(0, (e.liftUntil - now) / BOSS_FINISH_LIFT_MS) : 0;
    const liftHop = Math.sin(liftT * Math.PI) * BOSS_FINISH_LIFT_PX;
    const liftShake = liftT > 0 ? Math.sin(now / 24) * 2.2 * liftT : 0;
    view.sprite.position.set(Math.round(fb.footX + liftShake), Math.round(fb.footY - liftHop));
    view.container.zIndex = fb.footY;
    const horizonAlpha = this.horizonActorAlpha(fb.footY);
    view.container.alpha = horizonAlpha;
    view.sprite.alpha = e.type === 'ghost' ? 0.65 : 1;

    if (tex) {
      view.sprite.texture = tex;
      const sc = containScale(fb.boxW, fb.boxH, tex.width, tex.height) * this.depthScaleEnemy(fb.footY);
      const breath = this.enemyBreath(e, now);
      view.sprite.scale.set(sc * breath.x, sc * breath.y);
      view.sprite.visible = true;
    } else {
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
        // 小さめの円盤型装置。中央のコアが軽く明滅(常時glowなし)。
        const blink = 0.6 + Math.sin(Date.now() / 140) * 0.4;
        const rr = Math.max(5, p.width * 0.46);
        g.ellipse(0, 3, rr * 1.05, rr * 0.42).fill({ color: 0x000000, alpha: 0.26 }); // 影
        g.circle(0, 0, rr).fill({ color: 0x1f2937, alpha: 0.95 });                     // 本体
        g.circle(0, 0, rr).stroke({ color: 0x38bdf8, alpha: 0.6, width: 1.4 });        // 縁
        g.circle(0, 0, Math.max(2, rr * 0.34)).fill({ color: 0x7dd3fc, alpha: 0.85 * blink }); // コア
        break;
      }
      default: {
        g.circle(0, 0, p.width / 2).fill({ color: 0xf3f4f6 });
        break;
      }
    }
  }

  // ---- pickups -------------------------------------------------------------

  private syncPickups(pickups: Pickup[], now: number) {
    const seen = new Set<string>();
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
    const floatOffset = Math.sin(now / 300 + p.x * 0.01) * 2;
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
    const shadowAlpha = Math.max(0.22, 0.35 - floatOffset * 0.025);
    drawShadow(g, cx, footY, size * 0.85 * d, shadowAlpha);

    if (SPRITE_PICKUPS.has(p.type)) {
        const name =
          p.type === 'experience'
            ? (p.value >= 5 ? 'pickup-xp-red' : p.value >= 2 ? 'pickup-xp-green' : 'pickup-xp-blue')
            : p.type === 'treasure'
              ? `treasure-${Math.max(1, Math.min(6, p.variant ?? p.value ?? 1))}`
          : p.type === 'weapon-crate'
            ? 'pickup-chest'
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
        const sc = containScale(size, size, tex.width, tex.height) * d;
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
      case 'ammo-rifle': {
        const box = p.type === 'ammo-shotgun' ? 0xb91c1c : p.type === 'ammo-rifle' ? 0xb45309 : 0xa16207;
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

  private syncPlayerFx(player: Player, now: number) {
    const g = this.playerFx;
    g.clear();
    const cx = player.x + player.width / 2;
    const cy = player.y + player.height / 2;
    const r = huntingMeleeRadius(player);
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
