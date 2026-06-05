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
// the hero pops). Tilt-shift depth-of-field and ambient fireflies land next.

import { Container, Graphics, Sprite, Text, TilingSprite, Texture, Rectangle, Filter } from 'pixi.js';
import { TiltShiftFilter, AdvancedBloomFilter } from 'pixi-filters';
import type {
  Enemy, Pickup, Player, Projectile, VisualEffect,
} from '../types/game';
import { useGameStore, MELEE_RADIUS, SHAKE_MS } from '../store/gameStore';
import { getEnemyColor } from '../utils/enemyUtils';
import { effectiveReloadMs } from '../utils/weaponUtils';
import type { SceneLayers } from './layers';
import { getTexture } from './pixiTextures';
import { getGlowTexture, getVignetteTexture } from './lighting';
import { enemyFootBox, enemyShadow, playerFootBox } from './renderSpec';
import { treesInRegion, TREE_CELL } from '../world/trees';

// --- moonlit atmosphere tuning (tweak freely on-device) -------------------
const GRADE_TINT = 0x7e93c9;   // cool blue multiply over the whole world
const GRADE_ALPHA = 0.4;       // strength of the cool grade
const PLAYER_LIGHT_TINT = 0xffca7a; // warm hero halo
const PLAYER_LIGHT_ALPHA = 0.32;
const PLAYER_LIGHT_RADIUS = 200;    // halo radius in world px
const VIGNETTE_ALPHA = 0.85;

// Tilt-shift depth-of-field: keeps a horizontal band sharp and blurs the far
// (top) and near (bottom) edges for the HD-2D "diorama" feel. The sharp band is
// centred a touch above middle so the player (slightly below centre) stays
// crisp. Set ENABLED false if it costs too much on-device.
const TILT_SHIFT_ENABLED = true;
const TILT_SHIFT_BLUR = 14;       // max blur strength at the edges
const TILT_SHIFT_GRADIENT = 440;  // px over which sharp ramps into blur
const TILT_SHIFT_BAND = 0.46;     // sharp-band centre as a fraction of height

// Selective bloom — only pixels brighter than the threshold glow, so the dark
// forest stays clean while gems / muzzle flashes / crits / lights / fireflies
// bloom. Applied to the world group alongside the tilt-shift.
const BLOOM_ENABLED = true;
const BLOOM_THRESHOLD = 0.45;  // lower → colored gems/crits bloom too
const BLOOM_SCALE = 1.5;
const BLOOM_BLUR = 8;

// Ambient fireflies drifting through the moonlit forest (soft additive motes).
const FIREFLY_ENABLED = true;
const FIREFLY_COUNT = 40;
const FIREFLY_TINT = 0xcfe89a;   // soft warm green-yellow
const FIREFLY_MARGIN = 90;       // spawn/recycle band around the visible view

// Enemy ground lights: subtle self-emission plus a short brighter pulse when
// hit. These sit under actors so sprites never get washed out.
const ENEMY_LIGHT_ENABLED = true;
const ENEMY_LIGHT_RADIUS = 34;
const ENEMY_HIT_LIGHT_MS = 180;
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

// Pseudo-perspective scale: objects are drawn bigger toward the foreground
// (south / larger world Y) and smaller toward the back (north). PURELY VISUAL —
// it scales sprites + foot shadows only. Collision boxes, attack ranges, the
// counter radius and every other distance are never touched. Measured as a
// scale offset from the player's foot plane, so the player stays ~1.0 and
// objects grow/shrink relative to the hero.
const DEPTH_SCALE_ENABLED = true;
const DEPTH_K = 0.0011;   // scale change per world-Y px from the player plane
const DEPTH_MIN = 0.58;
const DEPTH_MAX = 1.6;
// Enemies get a deliberately more extreme depth falloff than the rest.
const ENEMY_DEPTH_K = 0.0019;
const ENEMY_DEPTH_MIN = 0.4;
const ENEMY_DEPTH_MAX = 2.1;

const SPRITE_PICKUPS = new Set(['experience', 'health', 'magnet', 'bomb', 'chest']);

const AMMO_INDICATOR_COLOR: Record<string, string> = {
  'ammo-handgun': '#d4a017',
  'ammo-shotgun': '#ef4444',
  'ammo-rifle': '#f59e0b',
};

const containScale = (boxW: number, boxH: number, texW: number, texH: number) =>
  Math.min(boxW / texW, boxH / texH);

// Flat elliptical foot shadow, matching renderUtils.drawGroundShadow's geometry
// (the passed `w` is pre-scaled by the caller; ellipse radii are w*0.55/w*0.18).
const drawShadow = (g: Graphics, cx: number, cy: number, w: number, alpha: number) => {
  g.ellipse(cx, cy, w * 0.55, w * 0.18).fill({ color: 0x000000, alpha });
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
  private playerView: ActorView | null = null;

  private pickups = new Map<string, { container: Container; gfx: Graphics; sprite?: Sprite }>();
  private projectiles = new Map<string, Graphics>();
  private effects = new Map<string, Graphics | Text>();

  private shadowGfx = new Graphics();
  private playerFx = new Graphics();   // counter ring + reload meter (world)
  private flashGfx = new Graphics();   // full-screen damage flashes (screen)
  private arrowGfx = new Graphics();   // off-screen supply arrows (screen)

  // Atmosphere (screen space). gradeSprite multiplies the world cool; the warm
  // playerLight is added on top so the hero stays bright; vignette darkens edges.
  private gradeSprite = new Sprite(Texture.WHITE);
  private playerLight = new Sprite(getGlowTexture());
  private vignette = new Sprite(getVignetteTexture());

  private tiltShift: TiltShiftFilter | null = null;
  private bloom: AdvancedBloomFilter | null = null;

  private fireflies: Firefly[] = [];
  private firefliesPlaced = false;
  private fxPrevNow = 0;

  private screenW = 1;
  private screenH = 1;
  private depthRefY = 0; // player foot world-Y this frame (the focal plane)

  constructor(layers: SceneLayers) {
    this.L = layers;

    // Bloom + tilt-shift depth-of-field over the whole world group (floor +
    // actors). filterArea is pinned to the screen in resize() so Pixi never
    // renders the world's map-sized bounds into a filter texture. Bloom runs
    // first (glow the bright bits), then the DoF blur composes over it.
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
    if (worldFilters.length) this.L.worldGroup.filters = worldFilters;

    // Ambient fireflies: a pool of soft additive motes in the lighting layer.
    if (FIREFLY_ENABLED) {
      const tex = getGlowTexture();
      for (let i = 0; i < FIREFLY_COUNT; i++) {
        const sprite = new Sprite(tex);
        sprite.anchor.set(0.5);
        sprite.tint = FIREFLY_TINT;
        sprite.blendMode = 'add';
        this.L.lightingLayer.addChild(sprite);
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
    this.playerLight.tint = PLAYER_LIGHT_TINT;
    this.playerLight.alpha = PLAYER_LIGHT_ALPHA;
    this.playerLight.blendMode = 'add';
    this.playerLight.width = this.playerLight.height = PLAYER_LIGHT_RADIUS * 2;
    this.L.groundLayer.addChild(this.playerLight, this.shadowGfx);

    this.L.effectLayer.addChild(this.playerFx);

    this.gradeSprite.tint = GRADE_TINT;
    this.gradeSprite.alpha = GRADE_ALPHA;
    this.gradeSprite.blendMode = 'multiply';

    this.vignette.alpha = VIGNETTE_ALPHA;

    // Screen-space overlays: cool multiply grade darkens/cools the whole scene
    // (multiply preserves detail/outlines), then the vignette, then damage
    // flash + off-screen arrows on top of everything.
    this.L.uiLayer.addChild(
      this.gradeSprite, this.vignette,
      this.flashGfx, this.arrowGfx,
    );
  }

  resize(w: number, h: number) {
    this.screenW = w;
    this.screenH = h;
    this.L.groundBase.width = w;
    this.L.groundBase.height = h;
    // Full-screen atmosphere overlays.
    this.gradeSprite.width = w;
    this.gradeSprite.height = h;
    this.vignette.width = w;
    this.vignette.height = h;

    // Pin the DoF filter to the screen and put its sharp band at TILT_SHIFT_BAND.
    if (this.tiltShift) {
      this.L.worldGroup.filterArea = new Rectangle(0, 0, w, h);
      const bandY = h * TILT_SHIFT_BAND;
      this.tiltShift.start = { x: 0, y: bandY };
      this.tiltShift.end = { x: w, y: bandY };
    }
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

  // ---- top-level frame sync ------------------------------------------------

  // Visual-only depth scale for an object given its foot world-Y. >1 in front
  // of the player, <1 behind. Never affects gameplay (hitboxes/ranges).
  private depthScaleWith(footWorldY: number, k: number, min: number, max: number): number {
    if (!DEPTH_SCALE_ENABLED) return 1;
    const f = 1 + (footWorldY - this.depthRefY) * k;
    return f < min ? min : f > max ? max : f;
  }

  private depthScale(footWorldY: number): number {
    return this.depthScaleWith(footWorldY, DEPTH_K, DEPTH_MIN, DEPTH_MAX);
  }

  // Enemies use a stronger falloff for a more dramatic near/far size gap.
  private depthScaleEnemy(footWorldY: number): number {
    return this.depthScaleWith(footWorldY, ENEMY_DEPTH_K, ENEMY_DEPTH_MIN, ENEMY_DEPTH_MAX);
  }

  sync() {
    const s = useGameStore.getState();
    const now = Date.now();

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
    this.L.groundBase.position.set(sx, sy);
    (this.L.groundBase as TilingSprite).tilePosition.set(-s.camera.x, -s.camera.y);

    this.syncTrees(s.camera);
    this.syncShadows(s.player, s.enemies);
    this.syncPickups(s.pickups, now);
    this.syncActors(s.player, s.enemies, s.gameTime, now);
    this.syncProjectiles(s.projectiles, now);
    this.syncEffects(s.effects, now);
    this.syncPlayerFx(s.player, now);
    this.syncArrows(s.pickups, s.camera);
    this.syncFlash(s.effects, now);

    // Warm ground pool follows the player. It lives in the world's groundLayer
    // (camera-offset already applied to the parent), so plain world coords.
    const lx = s.player.x + s.player.width / 2;
    const ly = s.player.y + s.player.height / 2;
    this.playerLight.position.set(lx, ly);
    this.playerLight.alpha = PLAYER_LIGHT_ALPHA * (0.92 + 0.08 * Math.sin(now / 600));

    this.syncFireflies(s.camera, now);
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
      f.sprite.position.set(f.x, f.y);
      f.sprite.alpha = f.base * twinkle;
      f.sprite.width = f.sprite.height = f.size;
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
        const boxW = 48 * t.scale;
        const boxH = 64 * t.scale;
        const baseScale = tex ? containScale(boxW, boxH, tex.width, tex.height) : 1;
        entry = { sprite, baseScale, footY: t.footY };
        this.trees.set(t.key, entry);
      }
      // Depth scale every frame: a tree's apparent size shifts as the player
      // (the focal plane) walks past it. Anchored at the foot, stays rooted.
      if (tex) entry.sprite.scale.set(entry.baseScale * this.depthScale(entry.footY));
    }
    for (const [key, entry] of this.trees) {
      if (!seen.has(key)) {
        entry.sprite.destroy();
        this.trees.delete(key);
      }
    }
  }

  // ---- foot shadows (player + enemies) into one graphics -------------------

  private syncShadows(player: Player, enemies: Enemy[]) {
    const g = this.shadowGfx;
    g.clear();
    const pf = playerFootBox(player);
    drawShadow(g, pf.footX, pf.footY - 2, player.width * 1.7 * 0.55 * this.depthScale(pf.footY), 0.4);
    for (const e of enemies) {
      if (e.type === 'ghost') continue;
      const { width, alpha } = enemyShadow(e);
      const footY = e.y + e.height;
      drawShadow(g, e.x + e.width / 2, footY - 2, width * this.depthScaleEnemy(footY), alpha);
    }
  }

  // ---- actors: player + enemies, Y-sorted by foot Y ------------------------

  private syncActors(player: Player, enemies: Enemy[], gameTime: number, now: number) {
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
    const tex = getTexture('player');
    view.sprite.texture = tex ?? view.sprite.texture;
    if (tex) {
      const sc = containScale(fb.boxW, fb.boxH, tex.width, tex.height) * this.depthScale(fb.footY);
      const flip = p.direction === 'left' || (p.lastDirection != null && p.lastDirection.x < 0);
      view.sprite.scale.set(flip ? -sc : sc, sc);
    }
    view.sprite.position.set(fb.footX, fb.footY);
    view.sprite.alpha = p.invulnerable ? 0.5 + 0.5 * Math.sin(now / 50) : 1;
    view.container.zIndex = fb.footY;
    view.light.visible = false;
    view.reticle.clear();
    view.overlay.clear();
  }

  private drawEnemy(view: ActorView, e: Enemy, gameTime: number, now: number) {
    const fb = enemyFootBox(e);
    const tex = getTexture(e.type);
    const cx = e.x + e.width / 2;
    const cy = e.y + e.height / 2;

    view.sprite.position.set(fb.footX, fb.footY);
    view.container.zIndex = fb.footY;
    view.sprite.alpha = e.type === 'ghost' ? 0.65 : 1;

    if (tex) {
      view.sprite.texture = tex;
      const sc = containScale(fb.boxW, fb.boxH, tex.width, tex.height) * this.depthScaleEnemy(fb.footY);
      view.sprite.scale.set(sc);
      view.sprite.visible = true;
    } else {
      view.sprite.visible = false; // placeholder ellipse drawn in reticle below
    }

    this.syncEnemyLight(view, e, fb.footX, fb.footY, now);

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
    if (now - e.lastHit < 90) {
      o.circle(cx, cy, Math.max(e.width, e.height) / 2).fill({ color: 0xffffff, alpha: 0.45 });
    }
  }

  private syncEnemyLight(view: ActorView, e: Enemy, footX: number, footY: number, now: number) {
    if (!ENEMY_LIGHT_ENABLED || e.type === 'bat') {
      view.light.visible = false;
      return;
    }
    const hitT = Math.max(0, 1 - (now - e.lastHit) / ENEMY_HIT_LIGHT_MS);
    const boss = e.type === 'pumpkin' || e.type === 'giantbat' || e.type === 'reaper';
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
    const cx = p.x + p.width / 2;
    const cy = p.y + p.height / 2;
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
        const gfx = new Graphics();
        container.addChild(gfx);
        this.L.groundLayer.addChild(container);
        entry = { container, gfx };
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
    entry: { container: Container; gfx: Graphics; sprite?: Sprite },
    p: Pickup,
    now: number
  ) {
    const cx = p.x + 8;
    const cy = p.y + 8;
    const size = 16;
    const floatOffset = Math.sin(now / 300 + p.x * 0.01) * 2;
    const d = this.depthScale(cy + size / 2); // foot = base of the item
    const g = entry.gfx;
    g.clear();

    // Shadow stays at the base (not floating) so the bob lifts the item off it.
    const shadowAlpha = Math.max(0.22, 0.35 - floatOffset * 0.025);
    drawShadow(g, cx, cy + size / 2, size * 0.85 * d, shadowAlpha);

    if (SPRITE_PICKUPS.has(p.type)) {
      const name = p.type === 'experience'
        ? (p.value >= 5 ? 'pickup-xp-red' : p.value >= 2 ? 'pickup-xp-green' : 'pickup-xp-blue')
        : `pickup-${p.type}`;
      const tex = getTexture(name);
      if (tex) {
        if (!entry.sprite) {
          entry.sprite = new Sprite();
          entry.sprite.anchor.set(0.5, 1);
          entry.container.addChild(entry.sprite);
        }
        entry.sprite.texture = tex;
        const sc = containScale(size, size, tex.width, tex.height) * d;
        entry.sprite.scale.set(sc);
        entry.sprite.position.set(cx, cy + size / 2 + floatOffset);
        entry.sprite.visible = true;
        return;
      }
    }
    if (entry.sprite) entry.sprite.visible = false;
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

  private syncEffects(effects: VisualEffect[], now: number) {
    const seen = new Set<string>();
    for (const e of effects) {
      if (e.kind === 'flash') continue; // screen-space, handled separately
      seen.add(e.id);
      if (e.kind === 'damageNumber') {
        this.drawDamageNumber(e, now);
      } else {
        let g = this.effects.get(e.id);
        if (!g || g instanceof Text) {
          g = new Graphics();
          // trails sit under the actors; everything else above.
          (e.kind === 'trail' ? this.L.groundLayer : this.L.effectLayer).addChild(g);
          this.effects.set(e.id, g);
        }
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
    g.clear();
    const t = Math.min(1, (now - e.createdAt) / e.duration);
    switch (e.kind) {
      case 'particle': {
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
        g.circle(e.x, e.y, e.radius).fill({ color: `${e.color}1)`, alpha: 0.4 });
        g.circle(e.x, e.y, e.radius * 0.55).fill({ color: `${e.color}1)`, alpha: 0.5 });
        g.circle(e.x, e.y, e.radius).stroke({ width: 2, color: `${e.color}1)` });
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

  private drawDamageNumber(e: Extract<VisualEffect, { kind: 'damageNumber' }>, now: number) {
    const t = (now - e.createdAt) / e.duration;
    const scale = e.scale ?? (e.crit ? 1.35 : 1);
    const bold = e.crit || scale > 1.2;
    let txt = this.effects.get(e.id) as Text | undefined;
    if (!txt || !(txt instanceof Text)) {
      txt = new Text({
        text: e.text ?? String(e.value),
        style: {
          fontFamily: '"Special Elite", ui-rounded, system-ui, sans-serif',
          fontSize: Math.round(12 * scale),
          fontWeight: bold ? 'bold' : 'normal',
          fill: e.color,
          stroke: { color: 0x000000, width: 2 },
        },
      });
      txt.anchor.set(0.5, 0.5);
      this.L.effectLayer.addChild(txt);
      this.effects.set(e.id, txt);
    }
    txt.position.set(e.x, e.y);
    txt.alpha = Math.max(0, 1 - t);
  }

  // ---- player FX: counter ring + reload meter (world space) ----------------

  private syncPlayerFx(player: Player, now: number) {
    const g = this.playerFx;
    g.clear();
    const cx = player.x + player.width / 2;
    const cy = player.y + player.height / 2;
    const r = MELEE_RADIUS;
    if (now <= player.counterWindowEnd) {
      const accent = -0.18;
      const start = accent - 0.58;
      const end = accent + 0.58;
      const startX = cx + Math.cos(start) * r;
      const startY = cy + Math.sin(start) * r;

      g.circle(cx, cy, r)
        .stroke({ width: 5, color: 0xfbbf24, alpha: 0.16 });
      g.circle(cx, cy, r)
        .stroke({ width: 1.8, color: 0xfef3c7, alpha: 0.66 });
      g.moveTo(startX, startY)
        .arc(cx, cy, r, start, end)
        .stroke({ width: 9, color: 0xfbbf24, alpha: 0.2 });
      g.moveTo(startX, startY)
        .arc(cx, cy, r, start, end)
        .stroke({ width: 4, color: 0xfef3c7, alpha: 0.82 });
    } else if (now < player.counterCooldownEnd) {
      g.circle(cx, cy, r).stroke({ width: 1.5, color: 0x94a3b8, alpha: 0.2 });
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
        const top = player.y - 16;
        g.rect(x - 1, top - 1, w + 2, h + 2).fill({ color: 0x000000, alpha: 0.6 });
        g.rect(x, top, w, h).fill({ color: 0xffffff, alpha: 0.18 });
        g.rect(x, top, w * progress, h).fill({ color: 0xfbbf24 });
      }
    }
  }

  // ---- screen-space: off-screen supply arrows ------------------------------

  private syncArrows(pickups: Pickup[], camera: { x: number; y: number }) {
    const g = this.arrowGfx;
    g.clear();
    const marginX = 26, marginTop = 64, marginBottom = 30;
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
    this.playerView?.light.destroy();
    this.playerView?.container.destroy({ children: true });
    for (const e of this.pickups.values()) e.container.destroy({ children: true });
    for (const g of this.projectiles.values()) g.destroy();
    for (const o of this.effects.values()) o.destroy();
    this.shadowGfx.destroy();
    this.playerFx.destroy();
    this.flashGfx.destroy();
    this.arrowGfx.destroy();
    this.gradeSprite.destroy();
    this.playerLight.destroy();
    this.vignette.destroy();
    for (const f of this.fireflies) f.sprite.destroy();
    this.fireflies = [];
    if (this.tiltShift || this.bloom) {
      this.L.worldGroup.filters = [];
      this.tiltShift?.destroy();
      this.bloom?.destroy();
      this.tiltShift = null;
      this.bloom = null;
    }
  }
}
