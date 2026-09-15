import { Player, Enemy, Projectile, Pickup, VisualEffect } from '../types/game';
import { getEnemyColor, isPumpkinTier, isReaperFamily } from './enemyUtils';
import { drawSprite, preloadSprites } from './spriteLoader';
import { effectiveReloadMs } from './weaponUtils';
import {
  isCounterActive, // ★カウンター成立の唯一の判定(v0.25.3926・刃が出ている間だけ)
  MELEE_RADIUS, SHAKE_MS,
} from '../store/gameStore';
import { FONT_STACK } from '../config/font';

// Kick off image loads as soon as the renderer module is imported. The
// names map 1:1 to PNG filenames under `public/sprites/`.
// ★v0.25.2893: 旧リストの17件(bat/skeleton/…/pickup-*/tree)は**単体PNGが存在しない**
// (atlas.png の中にしか無い)ため、**毎起動17回の404**を出すだけだった。しかもこのモジュールは
// GameHUD が formatTime を import するので **Pixi描画でも必ず評価される**。実在する player だけ残す。
preloadSprites(['player']);

// Counter ring visualization. Visible only while the counter window is open
// after a finger release; a successful reflect adds a brief gold flash.
const drawCounterShield = (
  ctx: CanvasRenderingContext2D,
  player: Player,
  camera: { x: number; y: number }
) => {
  const cx = player.x + player.width / 2 - camera.x;
  const cy = player.y + player.height / 2 - camera.y;
  // Sized to the actual melee reach so the ring doubles as the close-combat
  // range indicator. Kept subtle/translucent — the bright flash on activation
  // is the separate `glow` effect spawned in triggerCounter.
  const baseRadius = MELEE_RADIUS;
  const now = Date.now();

  if (isCounterActive(player, now)) {
    ctx.save();
    ctx.fillStyle = 'rgba(251, 191, 36, 0.10)';
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (now < player.counterCooldownEnd) {
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
};

// The player sprite is rendered larger than its hitbox so the pixel art reads
// chunky. The visual centers on the hitbox center, so its bottom (the feet)
// sits well below the hitbox bottom — anything anchored at the feet (ground
// shadow, light halo offset, etc.) needs to use this scale.
const PLAYER_VISUAL_SCALE = 1.7;

interface RenderProps {
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  pickups: Pickup[];
  effects: VisualEffect[];
  width: number;
  height: number;
  camera: { x: number; y: number };
  gameTime: number;
  shakeUntil?: number;
}

export const renderGame = (
  ctx: CanvasRenderingContext2D,
  { player, enemies, projectiles, pickups, effects, width, height, camera, gameTime, shakeUntil }: RenderProps
) => {
  ctx.clearRect(0, 0, width, height);

  // Screen shake on damage: jitter the whole canvas, decaying over the window.
  const shakeLeft = shakeUntil ? shakeUntil - Date.now() : 0;
  const shaking = shakeLeft > 0;
  ctx.save();
  if (shaking) {
    const k = Math.min(1, shakeLeft / SHAKE_MS);
    const mag = 7 * k;
    ctx.translate((Math.random() * 2 - 1) * mag, (Math.random() * 2 - 1) * mag);
  }

  drawForestBackground(ctx, width, height, camera);

  // Ground shadows for every gameplay entity, drawn before sprites so they
  // ground each character in the scene without obscuring detail.
  // Player shadow at the visual feet, not the hitbox bottom — the sprite is
  // drawn at PLAYER_VISUAL_SCALE so its feet hang below the hitbox.
  const playerFootY =
    player.y + player.height / 2 + (player.height * PLAYER_VISUAL_SCALE) / 2;
  drawGroundShadow(
    ctx,
    player.x + player.width / 2 - camera.x,
    playerFootY - camera.y - 2,
    player.width * PLAYER_VISUAL_SCALE * 0.55
  );
  for (const enemy of enemies) {
    if (enemy.type === 'ghost') continue; // ghosts hover; no shadow
    // PACING_PUZZLE.md §9-7#1(legacy Canvas2Dレンダラの影): driller はpumpkinと同格。
    const heavy = isReaperFamily(enemy.type) || enemy.type === 'giantbat' || isPumpkinTier(enemy.type);
    drawGroundShadow(
      ctx,
      enemy.x + enemy.width / 2 - camera.x,
      enemy.y + enemy.height - camera.y - 2,
      enemy.width * (heavy ? 1.15 : 1),
      heavy ? 0.5 : 0.4
    );
  }

  // Warm player light halo (and a smaller one per boss). Drawn over the
  // ground but under the sprites so the lit character still reads clearly.
  drawLightHalo(
    ctx,
    player.x + player.width / 2 - camera.x,
    player.y + player.height / 2 - camera.y,
    90,
    'rgba(253, 224, 128, 0.55)',
    0.6
  );
  for (const enemy of enemies) {
    if (isReaperFamily(enemy.type)) {
      drawLightHalo(
        ctx,
        enemy.x + enemy.width / 2 - camera.x,
        enemy.y + enemy.height / 2 - camera.y,
        100,
        'rgba(220, 38, 38, 0.6)',
        0.7
      );
    } else if (enemy.type === 'giantbat' || isPumpkinTier(enemy.type)) {
      drawLightHalo(
        ctx,
        enemy.x + enemy.width / 2 - camera.x,
        enemy.y + enemy.height / 2 - camera.y,
        60,
        'rgba(251, 191, 36, 0.45)',
        0.5
      );
    }
  }

  // World-space effects under sprites (trails)
  effects.forEach(e => {
    if (e.kind === 'trail') drawTrailEffect(ctx, e, camera);
  });

  pickups.forEach(pickup => drawPickup(ctx, pickup, camera));

  // Y-sort enemies so southerly (higher-y) enemies render on top of
  // northerly ones. Without this, sprites of overlapping enemies pop in
  // arbitrary order and depth reads wrong.
  const sortedEnemies = [...enemies].sort(
    (a, b) => (a.y + a.height) - (b.y + b.height)
  );
  sortedEnemies.forEach(enemy => drawEnemy(ctx, enemy, camera, gameTime));

  projectiles.forEach(projectile => drawProjectile(ctx, projectile, camera));
  drawPlayer(ctx, player, camera);
  drawReloadMeter(ctx, player, camera);

  // World-space effects on top of sprites (particles, rings, damage numbers)
  effects.forEach(e => {
    if (e.kind === 'particle') drawParticleEffect(ctx, e, camera);
    else if (e.kind === 'ring') drawRingEffect(ctx, e, camera);
    else if (e.kind === 'glow') drawGlowEffect(ctx, e, camera);
    else if (e.kind === 'slash') drawSlashEffect(ctx, e, camera);
    else if (e.kind === 'damageNumber') drawDamageNumberEffect(ctx, e, camera);
  });

  // Ambient atmosphere layer: drifting fireflies + dust. Persistent and
  // independent of the gameplay-event effects queue.
  drawAmbientParticles(ctx, width, height, camera);

  // End screen-shake transform — overlays below are full-screen and untranslated.
  ctx.restore();

  // Warm color grade + stronger vignette to unify the scene.
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgba(255, 214, 138, 0.92)';
  ctx.globalAlpha = 0.18;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  const vg = ctx.createRadialGradient(
    width / 2, height / 2, 0,
    width / 2, height / 2, Math.max(width, height) * 0.72
  );
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(0.6, 'rgba(0,0,0,0.15)');
  vg.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, width, height);

  // Edge arrows pointing toward air-dropped supplies that are currently
  // off-screen (VS-style). Drawn over the vignette so they stay legible.
  drawOffscreenIndicators(ctx, pickups, camera, width, height);

  // Screen-space flashes overlay everything
  effects.forEach(e => {
    if (e.kind === 'flash') drawFlashEffect(ctx, e, width, height);
  });
};

// Color used for each ammo family's box and its off-screen arrow.
const AMMO_INDICATOR_COLOR: Record<string, string> = {
  'ammo-handgun': '#d4a017',
  'ammo-shotgun': '#ef4444',
  'ammo-rifle': '#f59e0b',
  'health': '#fb7185',
  'weapon-crate': '#60a5fa',
  'weapon-drop': '#bfdbfe'
};

// Draw a clamped edge arrow for every worldDrop ammo pickup that's off-screen,
// pointing from the screen center toward the supply's true position. Keeps the
// player oriented toward resupply crates they have to walk out and grab.
const drawOffscreenIndicators = (
  ctx: CanvasRenderingContext2D,
  pickups: Pickup[],
  camera: { x: number; y: number },
  width: number,
  height: number
) => {
  // Inset the arrow ring from the very edge; a larger top inset keeps arrows
  // clear of the iOS status bar and top HUD that overlay the screen.
  const marginX = 26;
  const marginTop = Math.min(Math.max(154, height * 0.17), height - 96);
  const marginBottom = 30;
  const cxC = width / 2;
  const cyC = height / 2;
  const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 220);

  for (const pickup of pickups) {
    if (!pickup.worldDrop) continue;
    const color = AMMO_INDICATOR_COLOR[pickup.type];
    if (!color) continue;

    // Center of the pickup in screen space.
    const tx = pickup.x + 8 - camera.x;
    const ty = pickup.y + 8 - camera.y;

    // On-screen? Then it speaks for itself — no arrow needed.
    const onScreen = tx >= 0 && tx <= width && ty >= 0 && ty <= height;
    if (onScreen) continue;

    // March from the screen center toward the target until we hit the inset
    // rectangle; that intersection is where the arrow sits.
    const angle = Math.atan2(ty - cyC, tx - cxC);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let t = Infinity;
    if (dx > 0.0001) t = Math.min(t, (width - marginX - cxC) / dx);
    else if (dx < -0.0001) t = Math.min(t, (marginX - cxC) / dx);
    if (dy > 0.0001) t = Math.min(t, (height - marginBottom - cyC) / dy);
    else if (dy < -0.0001) t = Math.min(t, (marginTop - cyC) / dy);
    if (!isFinite(t)) continue;
    const ex = cxC + dx * t;
    const ey = cyC + dy * t;

    ctx.save();
    // Ammo-box chip behind the arrow so the player knows which family it is.
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(ex - 8, ey - 6, 16, 12);
    ctx.fillStyle = color;
    ctx.fillRect(ex - 8, ey - 6, 16, 3);
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(ex - 5, ey, 2, 4);
    ctx.fillRect(ex - 1, ey, 2, 4);
    ctx.fillRect(ex + 3, ey, 2, 4);

    // Arrowhead just outside the chip, pointing toward the supply.
    ctx.translate(ex + dx * 13, ey + dy * 13);
    ctx.rotate(angle);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
};

const drawParticleEffect = (
  ctx: CanvasRenderingContext2D,
  e: Extract<VisualEffect, { kind: 'particle' }>,
  camera: { x: number; y: number }
) => {
  const t = (Date.now() - e.createdAt) / e.duration;
  const alpha = Math.max(0, 1 - t);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(e.x - camera.x, e.y - camera.y, e.size, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const drawRingEffect = (
  ctx: CanvasRenderingContext2D,
  e: Extract<VisualEffect, { kind: 'ring' }>,
  camera: { x: number; y: number }
) => {
  const t = Math.min(1, (Date.now() - e.createdAt) / e.duration);
  const radius = e.startRadius + (e.endRadius - e.startRadius) * t;
  const alpha = 1 - t;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = e.color;
  ctx.lineWidth = e.width;
  ctx.beginPath();
  ctx.arc(e.x - camera.x, e.y - camera.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

// Fixed-radius radial light that fades in place — the counter's reach flash.
const drawGlowEffect = (
  ctx: CanvasRenderingContext2D,
  e: Extract<VisualEffect, { kind: 'glow' }>,
  camera: { x: number; y: number }
) => {
  const t = Math.min(1, (Date.now() - e.createdAt) / e.duration);
  const alpha = (1 - t) * 0.5;
  const cx = e.x - camera.x;
  const cy = e.y - camera.y;
  const grad = ctx.createRadialGradient(cx, cy, e.radius * 0.2, cx, cy, e.radius);
  grad.addColorStop(0, `${e.color}${(alpha * 0.9).toFixed(3)})`);
  grad.addColorStop(0.7, `${e.color}${(alpha * 0.35).toFixed(3)})`);
  grad.addColorStop(1, `${e.color}0)`);
  ctx.save();
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, e.radius, 0, Math.PI * 2);
  ctx.fill();
  // Crisp rim that fades with the glow.
  ctx.globalAlpha = (1 - t) * 0.8;
  ctx.strokeStyle = `${e.color}0.9)`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, e.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

// Short diagonal slash streak drawn over a melee-struck enemy.
const drawSlashEffect = (
  ctx: CanvasRenderingContext2D,
  e: Extract<VisualEffect, { kind: 'slash' }>,
  camera: { x: number; y: number }
) => {
  const t = Math.min(1, (Date.now() - e.createdAt) / e.duration);
  const cx = e.x - camera.x;
  const cy = e.y - camera.y;
  const half = e.length / 2;
  const dx = Math.cos(e.angle) * half;
  const dy = Math.sin(e.angle) * half;
  ctx.save();
  ctx.globalAlpha = 1 - t;
  ctx.strokeStyle = e.color;
  ctx.lineCap = 'round';
  // Slight grow + thin out as it fades for a quick "swipe".
  ctx.lineWidth = 4 * (1 - t) + 1;
  const grow = 1 + t * 0.3;
  ctx.beginPath();
  ctx.moveTo(cx - dx * grow, cy - dy * grow);
  ctx.lineTo(cx + dx * grow, cy + dy * grow);
  ctx.stroke();
  ctx.restore();
};

const drawDamageNumberEffect = (
  ctx: CanvasRenderingContext2D,
  e: Extract<VisualEffect, { kind: 'damageNumber' }>,
  camera: { x: number; y: number }
) => {
  const t = (Date.now() - e.createdAt) / e.duration;
  const alpha = Math.max(0, 1 - t);
  const scale = e.scale ?? (e.crit ? 1.35 : 1);
  const bold = e.crit || scale > 1.2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${bold ? 'bold ' : ''}${Math.round(12 * scale)}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  const label = e.text ?? String(e.value);
  ctx.fillStyle = '#000';
  ctx.fillText(label, e.x - camera.x + 1, e.y - camera.y + 1);
  ctx.fillStyle = e.color;
  ctx.fillText(label, e.x - camera.x, e.y - camera.y);
  ctx.restore();
};

const drawTrailEffect = (
  ctx: CanvasRenderingContext2D,
  e: Extract<VisualEffect, { kind: 'trail' }>,
  camera: { x: number; y: number }
) => {
  const t = Math.min(1, (Date.now() - e.createdAt) / e.duration);
  const cx = e.fromX + (e.toX - e.fromX) * t;
  const cy = e.fromY + (e.toY - e.fromY) * t;
  ctx.save();
  ctx.globalAlpha = 1 - t;
  ctx.strokeStyle = e.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(e.fromX - camera.x, e.fromY - camera.y);
  ctx.lineTo(cx - camera.x, cy - camera.y);
  ctx.stroke();
  ctx.restore();
};

const drawFlashEffect = (
  ctx: CanvasRenderingContext2D,
  e: Extract<VisualEffect, { kind: 'flash' }>,
  width: number,
  height: number
) => {
  const t = (Date.now() - e.createdAt) / e.duration;
  const alpha = Math.max(0, 1 - t);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = e.color;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
};

// Deterministic 2D hash → [0,1). Used for all background detail placement so
// the forest stays anchored to world coordinates as the camera pans.
const hash2 = (x: number, y: number) => {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

// Mad Forest backdrop — denser, layered detail to push the look toward
// Octopath-style pixel art density. Two grids run in parallel:
//   - 32px grass-color grid (dark/mid/light tinted cells)
//   - 32px detail-prop grid (flowers, mushrooms, stones, grass tufts)
// A coarser tree grid sits on top.
const drawForestBackground = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  camera: { x: number; y: number }
) => {
  // Solid grass base.
  ctx.fillStyle = '#1b3a18';
  ctx.fillRect(0, 0, width, height);

  const cell = 32;
  const startX = Math.floor(camera.x / cell) * cell;
  const startY = Math.floor(camera.y / cell) * cell;
  const endX = startX + width + cell;
  const endY = startY + height + cell;

  // Pass 1: cell-fill tints. Sparser than before — only ~22% of cells get a
  // tinted fill so the eye notices each patch instead of seeing a busy
  // checkerboard.
  for (let wx = startX; wx <= endX; wx += cell) {
    for (let wy = startY; wy <= endY; wy += cell) {
      const h = hash2(wx, wy);
      if (h < 0.12) {
        ctx.fillStyle = '#142a11';
        ctx.fillRect(wx - camera.x, wy - camera.y, cell, cell);
      } else if (h < 0.22) {
        ctx.fillStyle = '#234d20';
        ctx.fillRect(wx - camera.x, wy - camera.y, cell, cell);
      }
    }
  }

  // Pass 2: detail props. Each cell rolls a separate hash; the result picks
  // among grass tuft / flower / mushroom / stone or nothing.
  for (let wx = startX; wx <= endX; wx += cell) {
    for (let wy = startY; wy <= endY; wy += cell) {
      const d = hash2(wx + 31, wy + 17);
      if (d >= 0.32) continue; // ~68% of cells stay empty
      // Sub-cell position so props don't all sit on the grid lines.
      const px = wx + 6 + Math.floor(hash2(wx + 1, wy + 2) * (cell - 12)) - camera.x;
      const py = wy + 6 + Math.floor(hash2(wx + 3, wy + 5) * (cell - 12)) - camera.y;
      if (d < 0.16) {
        drawGrassTuft(ctx, px, py);
      } else if (d < 0.22) {
        drawFlower(ctx, px, py, hash2(wx + 7, wy + 11));
      } else if (d < 0.27) {
        drawMushroom(ctx, px, py);
      } else {
        drawSmallStone(ctx, px, py);
      }
    }
  }

  // Trees: coarser grid so they stay sparse and readable.
  const tcell = 220;
  const tStartX = Math.floor((camera.x - tcell) / tcell) * tcell;
  const tStartY = Math.floor((camera.y - tcell) / tcell) * tcell;
  const tEndX = tStartX + width + tcell * 2;
  const tEndY = tStartY + height + tcell * 2;
  for (let wx = tStartX; wx <= tEndX; wx += tcell) {
    for (let wy = tStartY; wy <= tEndY; wy += tcell) {
      const h = hash2(wx + 13, wy - 7);
      if (h < 0.35) {
        const ox = (hash2(wx, wy + 1) - 0.5) * tcell;
        const oy = (hash2(wx + 1, wy) - 0.5) * tcell;
        const sizeRoll = hash2(wx + 5, wy + 23);
        drawTree(
          ctx,
          wx + tcell / 2 + ox - camera.x,
          wy + tcell / 2 + oy - camera.y,
          0.85 + sizeRoll * 0.4
        );
      }
    }
  }
};

const drawGrassTuft = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  ctx.fillStyle = '#3a7a32';
  ctx.fillRect(x, y, 1, 3);
  ctx.fillRect(x + 2, y + 1, 1, 2);
  ctx.fillRect(x - 2, y + 1, 1, 2);
};

const drawFlower = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  colorRoll: number
) => {
  const palette = ['#f87171', '#fbbf24', '#a5b4fc', '#f9a8d4'];
  const color = palette[Math.floor(colorRoll * palette.length)];
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 2, 2);
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(x, y, 1, 1);
  ctx.fillStyle = '#2a5a25';
  ctx.fillRect(x + 1, y + 2, 1, 2);
};

const drawMushroom = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  // Stem
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(x + 1, y + 2, 2, 2);
  // Cap
  ctx.fillStyle = '#b91c1c';
  ctx.fillRect(x, y, 4, 2);
  // Spots
  ctx.fillStyle = '#fef9c3';
  ctx.fillRect(x + 1, y, 1, 1);
};

const drawSmallStone = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  ctx.fillStyle = '#454f53';
  ctx.fillRect(x, y + 1, 4, 2);
  ctx.fillStyle = '#5e6a70';
  ctx.fillRect(x + 1, y, 2, 1);
};

const drawTree = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale = 1
) => {
  // Sprite-first
  if (drawSprite(ctx, 'tree', x - 24 * scale, y - 32 * scale, 48 * scale, 64 * scale)) {
    return;
  }
  // Drop shadow on the ground
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + 18 * scale, 18 * scale, 5 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Trunk with shading
  ctx.fillStyle = '#2a190b';
  ctx.fillRect(x - 4 * scale, y, 8 * scale, 18 * scale);
  ctx.fillStyle = '#4a2d14';
  ctx.fillRect(x - 4 * scale, y, 3 * scale, 18 * scale);
  // Canopy — three darker layers
  ctx.fillStyle = '#0c2a0c';
  ctx.beginPath();
  ctx.arc(x, y - 6 * scale, 22 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#143d14';
  ctx.beginPath();
  ctx.arc(x - 8 * scale, y - 10 * scale, 12 * scale, 0, Math.PI * 2);
  ctx.arc(x + 9 * scale, y - 8 * scale, 14 * scale, 0, Math.PI * 2);
  ctx.fill();
  // Top-light highlight
  ctx.fillStyle = '#2d6028';
  ctx.beginPath();
  ctx.arc(x - 4 * scale, y - 16 * scale, 6 * scale, 0, Math.PI * 2);
  ctx.fill();
};

// Small flat elliptical drop shadow under entities. Anchored at the entity's
// feet so vertical movement reads as actual depth.
const drawGroundShadow = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  width: number,
  alpha = 0.4
) => {
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(cx, baseY, width * 0.55, width * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

// Soft additive warm halo. Used for the player and (smaller) for bosses to
// make them feel like light sources in the dark forest.
const drawLightHalo = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string,
  intensity = 0.55
) => {
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = intensity;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

// Ambient particle layer. A pool of fireflies + dust motes drifts persistently
// around the camera viewport, completely separate from the gameplay-event
// effects[] queue. Each particle's age is reset (and position re-randomized
// near the camera) once its lifetime expires or it drifts far off-screen.
type AmbientParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  hue: 'firefly' | 'dust';
  bornAt: number;
  lifetime: number;
};

const AMBIENT_COUNT = 50;
const ambientParticles: AmbientParticle[] = [];
let lastAmbientTick = 0;

const respawnAmbient = (
  p: AmbientParticle,
  camera: { x: number; y: number },
  width: number,
  height: number,
  now: number
) => {
  // Spawn within a generous box around the camera so they're already in view
  // (or just outside) when they appear.
  p.x = camera.x - width * 0.1 + Math.random() * (width * 1.2);
  p.y = camera.y - height * 0.1 + Math.random() * (height * 1.2);
  p.hue = Math.random() < 0.45 ? 'firefly' : 'dust';
  const drift = p.hue === 'firefly' ? 8 : 14;
  p.vx = (Math.random() - 0.5) * drift;
  p.vy = (Math.random() - 0.5) * drift - 4; // gentle upward bias
  p.size = p.hue === 'firefly' ? 1.5 + Math.random() * 1.2 : 1 + Math.random() * 0.6;
  p.bornAt = now;
  p.lifetime = (p.hue === 'firefly' ? 5000 : 3500) + Math.random() * 2500;
};

const ensureAmbientPool = (
  camera: { x: number; y: number },
  width: number,
  height: number,
  now: number
) => {
  while (ambientParticles.length < AMBIENT_COUNT) {
    const p: AmbientParticle = {
      x: 0, y: 0, vx: 0, vy: 0, size: 1, hue: 'dust',
      bornAt: now, lifetime: 0
    };
    respawnAmbient(p, camera, width, height, now);
    // Stagger ages so the pool doesn't all fade together on first render.
    p.bornAt -= Math.random() * p.lifetime;
    ambientParticles.push(p);
  }
};

const drawAmbientParticles = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  camera: { x: number; y: number }
) => {
  const now = Date.now();
  ensureAmbientPool(camera, width, height, now);
  const dt = lastAmbientTick === 0 ? 0 : Math.min(0.05, (now - lastAmbientTick) / 1000);
  lastAmbientTick = now;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of ambientParticles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const age = now - p.bornAt;
    const t = age / p.lifetime;
    // Far off-screen or expired → recycle.
    const sx = p.x - camera.x;
    const sy = p.y - camera.y;
    if (t >= 1 || sx < -60 || sy < -60 || sx > width + 60 || sy > height + 60) {
      respawnAmbient(p, camera, width, height, now);
      continue;
    }
    // Fade in for first 15%, hold, fade out for last 30%.
    let alpha: number;
    if (t < 0.15) alpha = t / 0.15;
    else if (t > 0.7) alpha = (1 - t) / 0.3;
    else alpha = 1;
    // Fireflies pulse softly.
    if (p.hue === 'firefly') {
      alpha *= 0.55 + 0.45 * Math.sin(age / 220);
      ctx.fillStyle = `rgba(253, 224, 128, ${alpha * 0.95})`;
    } else {
      ctx.fillStyle = `rgba(220, 220, 200, ${alpha * 0.35})`;
    }
    ctx.beginPath();
    ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

const drawPlayer = (
  ctx: CanvasRenderingContext2D,
  player: Player,
  camera: { x: number; y: number }
) => {
  const cx = player.x + player.width / 2 - camera.x;
  const cy = player.y + player.height / 2 - camera.y;

  if (player.invulnerable) {
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(Date.now() / 50);
  }

  // Sprite-first: if a player.png exists, draw it (flipped when facing
  // left). Otherwise fall back to the procedural cape/head/hat figure.
  // The visual is rendered larger than the hitbox so the sprite's pixels
  // read as chunky pixel art instead of being downscaled into mush. The
  // collision box stays at player.width/height.
  const flipH = player.direction === 'left'
    || (player.lastDirection && player.lastDirection.x < 0);
  const visW = player.width * PLAYER_VISUAL_SCALE;
  const visH = player.height * PLAYER_VISUAL_SCALE;
  const visX = (player.x + player.width / 2) - visW / 2 - camera.x;
  const visY = (player.y + player.height / 2) - visH / 2 - camera.y;
  const drewSprite = drawSprite(
    ctx, 'player',
    visX, visY,
    visW, visH,
    !!flipH
  );
  if (!drewSprite) {
    // Cape / body
    ctx.fillStyle = '#3a2a55';
    ctx.beginPath();
    ctx.arc(cx, cy + 2, player.width / 2, 0, Math.PI * 2);
    ctx.fill();
    // Head
    ctx.fillStyle = '#e9d5b3';
    ctx.beginPath();
    ctx.arc(cx, cy - 4, player.width / 3.2, 0, Math.PI * 2);
    ctx.fill();
    // Hat
    ctx.fillStyle = '#1a1024';
    ctx.fillRect(cx - 9, cy - 12, 18, 4);
    ctx.fillRect(cx - 14, cy - 9, 28, 3);
  }

  ctx.globalAlpha = 1;
  drawCounterShield(ctx, player, camera);
};

// Tiny bat silhouette that floats above bosses. Drawn with a subtle bob so
// it animates without depending on per-frame state.
const drawBossMarker = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  topY: number,
  glowColor: string
) => {
  const bob = Math.sin(Date.now() / 220) * 2;
  const baseY = topY - 10 + bob;
  ctx.save();
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#0f0f14';
  // Body
  ctx.beginPath();
  ctx.ellipse(cx, baseY, 3, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Wings — two stubby triangles. Tip apex is offset to make them readable
  // even at 1× zoom.
  ctx.beginPath();
  ctx.moveTo(cx - 2, baseY);
  ctx.lineTo(cx - 9, baseY - 3);
  ctx.lineTo(cx - 5, baseY + 1);
  ctx.closePath();
  ctx.moveTo(cx + 2, baseY);
  ctx.lineTo(cx + 9, baseY - 3);
  ctx.lineTo(cx + 5, baseY + 1);
  ctx.closePath();
  ctx.fill();
  // Eye spark
  ctx.shadowBlur = 0;
  ctx.fillStyle = glowColor;
  ctx.fillRect(cx - 1, baseY - 1, 1, 1);
  ctx.fillRect(cx + 1, baseY - 1, 1, 1);
  ctx.restore();
};

const drawHealthBar = (
  ctx: CanvasRenderingContext2D,
  enemy: Enemy,
  camera: { x: number; y: number }
) => {
  if (enemy.health >= enemy.maxHealth) return;
  const w = enemy.width;
  const h = 3;
  const x = enemy.x - camera.x;
  const y = enemy.y - h - 2 - camera.y;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x, y, w, h);
  const pct = enemy.health / enemy.maxHealth;
  ctx.fillStyle = pct < 0.3 ? '#ef4444' : '#10b981';
  ctx.fillRect(x, y, w * pct, h);
};

// Spinning targeting reticle around a stunned enemy — reads more clearly than
// a "!" and signals "finish me with melee". Drawn larger than the body so it's
// visible even under the sprite.
const drawStunReticle = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number
) => {
  const r = size * 0.85 + 6;
  const spin = (Date.now() * 0.004) % (Math.PI * 2);
  ctx.save();
  // Soft tint to read the body as "frozen".
  ctx.fillStyle = 'rgba(250, 204, 21, 0.16)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // Rotating reticle: four arc segments + corner ticks.
  ctx.translate(cx, cy);
  ctx.rotate(spin);
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, r, i * (Math.PI / 2) + 0.25, i * (Math.PI / 2) + (Math.PI / 2) - 0.25);
    ctx.stroke();
  }
  ctx.restore();
};

const drawEnemy = (
  ctx: CanvasRenderingContext2D,
  enemy: Enemy,
  camera: { x: number; y: number },
  gameTime: number
) => {
  const cx = enemy.x + enemy.width / 2 - camera.x;
  const cy = enemy.y + enemy.height / 2 - camera.y;
  const color = getEnemyColor(enemy.type);
  const w = enemy.width;
  const h = enemy.height;

  const stunned = enemy.stunUntil !== undefined && gameTime < enemy.stunUntil;
  if (stunned) drawStunReticle(ctx, cx, cy, Math.max(w, h));

  ctx.save();
  if (enemy.type === 'ghost') ctx.globalAlpha = 0.65;

  // Sprite-first. If the file exists in public/sprites/{type}.png the
  // renderer uses it and skips the procedural shape; otherwise we draw
  // the hand-built fallback below.
  const drewSprite = drawSprite(
    ctx, enemy.type,
    enemy.x - camera.x, enemy.y - camera.y,
    w, h
  );
  if (drewSprite) {
    ctx.restore();
    drawHealthBar(ctx, enemy, camera);
    // PACING_PUZZLE.md §9-7#1(legacy Canvas2Dレンダラのボスマーカー): driller はpumpkinと同格。
    if (isPumpkinTier(enemy.type) || enemy.type === 'giantbat' || isReaperFamily(enemy.type)) {
      drawBossMarker(ctx, cx, enemy.y - camera.y - 6, isReaperFamily(enemy.type) ? '#ef4444' : '#fde68a');
    }
    if (Date.now() - enemy.lastHit < 90) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(w, h) / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    return;
  }

  switch (enemy.type) {
    case 'bat': {
      ctx.fillStyle = color;
      // Body
      ctx.beginPath();
      ctx.ellipse(cx, cy, w / 3, h / 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Wings flap with time
      const wing = (Math.sin(Date.now() / 80) + 1) * 0.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx - w / 2 - wing * 4, cy - h / 3);
      ctx.lineTo(cx - w / 3, cy + 1);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + w / 2 + wing * 4, cy - h / 3);
      ctx.lineTo(cx + w / 3, cy + 1);
      ctx.fill();
      // Eyes
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(cx - 3, cy - 2, 2, 2);
      ctx.fillRect(cx + 1, cy - 2, 2, 2);
      break;
    }
    case 'skeleton': {
      // Body/cloak
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(cx - w / 3, cy - h / 4, (w / 3) * 2, h / 2);
      // Skull
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy - h / 4, w / 3.5, 0, Math.PI * 2);
      ctx.fill();
      // Sockets
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(cx - 4, cy - h / 4 - 1, 3, 3);
      ctx.fillRect(cx + 1, cy - h / 4 - 1, 3, 3);
      break;
    }
    case 'zombie': {
      ctx.fillStyle = color;
      ctx.fillRect(cx - w / 2.5, cy - h / 2.2, (w / 2.5) * 2, (h / 2.2) * 2);
      // Darker head
      ctx.fillStyle = '#3f5326';
      ctx.fillRect(cx - w / 3, cy - h / 2.2, (w / 3) * 2, h / 2.5);
      // Eyes
      ctx.fillStyle = '#fde047';
      ctx.fillRect(cx - 5, cy - h / 3, 3, 3);
      ctx.fillRect(cx + 2, cy - h / 3, 3, 3);
      break;
    }
    case 'plant': {
      // Pot
      ctx.fillStyle = '#5c3a1c';
      ctx.fillRect(cx - w / 3, cy + h / 6, (w / 3) * 2, h / 3);
      // Stem
      ctx.fillStyle = '#1f5a1f';
      ctx.fillRect(cx - 1, cy - h / 6, 2, h / 3);
      // Bulb
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy - h / 4, w / 3, 0, Math.PI * 2);
      ctx.fill();
      // Teeth/maw
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 4, cy - h / 5, 2, 3);
      ctx.fillRect(cx + 2, cy - h / 5, 2, 3);
      break;
    }
    case 'ghost': {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx - w / 2.4, cy + h / 2);
      ctx.lineTo(cx - w / 2.4, cy);
      ctx.arc(cx, cy, w / 2.4, Math.PI, 0);
      ctx.lineTo(cx + w / 2.4, cy + h / 2);
      // Wavy bottom
      const wave = Math.sin(Date.now() / 120) * 2;
      ctx.lineTo(cx + w / 4, cy + h / 2 - 4 + wave);
      ctx.lineTo(cx, cy + h / 2 + wave);
      ctx.lineTo(cx - w / 4, cy + h / 2 - 4 - wave);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(cx - 4, cy - 2, 2, 4);
      ctx.fillRect(cx + 2, cy - 2, 2, 4);
      break;
    }
    case 'werewolf': {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(cx, cy, w / 2.5, h / 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Ears
      ctx.beginPath();
      ctx.moveTo(cx - w / 3, cy - h / 3);
      ctx.lineTo(cx - w / 4, cy - h / 2);
      ctx.lineTo(cx - w / 5, cy - h / 3);
      ctx.moveTo(cx + w / 3, cy - h / 3);
      ctx.lineTo(cx + w / 4, cy - h / 2);
      ctx.lineTo(cx + w / 5, cy - h / 3);
      ctx.fill();
      // Eyes
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(cx - 5, cy - 2, 3, 3);
      ctx.fillRect(cx + 2, cy - 2, 3, 3);
      // Fangs
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 3, cy + 4, 2, 4);
      ctx.fillRect(cx + 1, cy + 4, 2, 4);
      break;
    }
    case 'pumpkin': {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(cx, cy, w / 2.1, h / 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      // Ridges
      ctx.strokeStyle = '#7c2d12';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - w / 3, cy - h / 4);
      ctx.lineTo(cx - w / 3, cy + h / 4);
      ctx.moveTo(cx, cy - h / 3);
      ctx.lineTo(cx, cy + h / 3);
      ctx.moveTo(cx + w / 3, cy - h / 4);
      ctx.lineTo(cx + w / 3, cy + h / 4);
      ctx.stroke();
      // Face
      ctx.fillStyle = '#fde047';
      const triangle = (px: number, py: number, s: number) => {
        ctx.beginPath();
        ctx.moveTo(px, py - s);
        ctx.lineTo(px + s, py + s);
        ctx.lineTo(px - s, py + s);
        ctx.closePath();
        ctx.fill();
      };
      triangle(cx - 7, cy - 3, 4);
      triangle(cx + 7, cy - 3, 4);
      ctx.fillRect(cx - 7, cy + 5, 14, 3);
      // Stem
      ctx.fillStyle = '#15803d';
      ctx.fillRect(cx - 3, cy - h / 2 - 2, 6, 5);
      break;
    }
    case 'giantbat': {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(cx, cy, w / 2.5, h / 3, 0, 0, Math.PI * 2);
      ctx.fill();
      const flap = (Math.sin(Date.now() / 90) + 1) * 0.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx - w / 1.5 - flap * 10, cy - h / 3);
      ctx.lineTo(cx - w / 2.5, cy + h / 4);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + w / 1.5 + flap * 10, cy - h / 3);
      ctx.lineTo(cx + w / 2.5, cy + h / 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(cx - 7, cy - 4, 4, 4);
      ctx.fillRect(cx + 3, cy - 4, 4, 4);
      break;
    }
    case 'reaper': {
      // Cloak
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, cy - h / 2.5);
      ctx.quadraticCurveTo(cx, cy - h / 2, cx + w / 2, cy - h / 2.5);
      ctx.lineTo(cx + w / 2.2, cy + h / 2);
      ctx.lineTo(cx - w / 2.2, cy + h / 2);
      ctx.closePath();
      ctx.fill();
      // Glowing eyes
      const pulse = 0.7 + Math.sin(Date.now() / 200) * 0.3;
      ctx.fillStyle = '#dc2626';
      ctx.shadowColor = '#dc2626';
      ctx.shadowBlur = 14 * pulse;
      ctx.fillRect(cx - 12, cy - 6, 6, 6);
      ctx.fillRect(cx + 6, cy - 6, 6, 6);
      ctx.shadowBlur = 0;
      // Scythe
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx + w / 2, cy + h / 2);
      ctx.lineTo(cx + w / 1.5, cy - h / 2.5);
      ctx.stroke();
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.moveTo(cx + w / 1.5, cy - h / 2.5);
      ctx.quadraticCurveTo(cx + w, cy - h / 2.2, cx + w / 1.2, cy - h / 1.8);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
  drawHealthBar(ctx, enemy, camera);

  // Boss marker: a small bat silhouette hovers above pumpkins, giant bats,
  // and the reaper. Bobs gently so the eye finds them in the crowd.
  if (enemy.type === 'pumpkin' || enemy.type === 'giantbat' || isReaperFamily(enemy.type)) {
    drawBossMarker(ctx, cx, enemy.y - camera.y - 6, isReaperFamily(enemy.type) ? '#ef4444' : '#fde68a');
  }

  if (Date.now() - enemy.lastHit < 90) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(w, h) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
};

const drawProjectile = (
  ctx: CanvasRenderingContext2D,
  projectile: Projectile,
  camera: { x: number; y: number }
) => {
  // Scheduled projectiles (whip chain's second slash) are inactive — skip.
  if (projectile.createdAt > Date.now()) return;
  if (projectile.reflected) {
    const cx = projectile.x + projectile.width / 2 - camera.x;
    const cy = projectile.y + projectile.height / 2 - camera.y;
    ctx.save();
    ctx.shadowColor = '#FBBF24';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#FCD34D';
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(projectile.width, projectile.height) * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  switch (projectile.weaponType) {
    case 'handgun':
    case 'rifle': {
      // Tracer round — a bright streak oriented along travel. Rifle rounds
      // are longer; crits glow gold.
      const angle = Math.atan2(projectile.direction.y, projectile.direction.x);
      const len = Math.max(projectile.width, 6) * (projectile.weaponType === 'rifle' ? 2.6 : 1.7);
      ctx.save();
      ctx.translate(
        projectile.x + projectile.width / 2 - camera.x,
        projectile.y + projectile.height / 2 - camera.y
      );
      ctx.rotate(angle);
      ctx.shadowColor = projectile.crit ? '#fbbf24' : '#fde68a';
      ctx.shadowBlur = projectile.crit ? 12 : 6;
      ctx.fillStyle = projectile.crit ? '#fde047' : '#fef3c7';
      ctx.fillRect(-len / 2, -Math.max(1, projectile.height / 4), len, Math.max(2, projectile.height / 2));
      ctx.restore();
      break;
    }
    case 'shotgun': {
      // Pellet — a small hot dot.
      const cx = projectile.x + projectile.width / 2 - camera.x;
      const cy = projectile.y + projectile.height / 2 - camera.y;
      ctx.save();
      ctx.shadowColor = projectile.crit ? '#fbbf24' : '#f59e0b';
      ctx.shadowBlur = projectile.crit ? 10 : 5;
      ctx.fillStyle = projectile.crit ? '#fde047' : '#fdba74';
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(2, projectile.width / 2), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'enemy_bolt': {
      if (projectile.reflected) break;
      const cx = projectile.x + projectile.width / 2 - camera.x;
      const cy = projectile.y + projectile.height / 2 - camera.y;
      const r = projectile.width / 2;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, '#fca5a5');
      g.addColorStop(1, '#7f1d1d');
      ctx.save();
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 10;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    default: {
      ctx.fillStyle = '#f3f4f6';
      ctx.beginPath();
      ctx.arc(
        projectile.x + projectile.width / 2 - camera.x,
        projectile.y + projectile.height / 2 - camera.y,
        projectile.width / 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
      break;
    }
  }
};

// Gem tier colors derived from value: 1 = blue, 2-4 = green, 5+ = red.
const gemColorFor = (value: number): { fill: string; shimmer: string } => {
  if (value >= 5) return { fill: '#ef4444', shimmer: '#fecaca' };
  if (value >= 2) return { fill: '#10b981', shimmer: '#a7f3d0' };
  return { fill: '#3b82f6', shimmer: '#bfdbfe' };
};

// A reload progress bar floating just above the player's head while the active
// gun is being reloaded.
const drawReloadMeter = (
  ctx: CanvasRenderingContext2D,
  player: Player,
  camera: { x: number; y: number }
) => {
  if (!player.reloadingWeaponId || Date.now() >= player.reloadEndsAt) return;
  const gun = player.weapons.find(w => w.id === player.reloadingWeaponId);
  if (!gun) return;
  const total = effectiveReloadMs(gun, player);
  const progress = Math.max(0, Math.min(1, 1 - (player.reloadEndsAt - Date.now()) / total));

  const w = 30;
  const h = 5;
  const cx = player.x + player.width / 2 - camera.x;
  const top = player.y - camera.y - 16;
  const x = cx - w / 2;

  ctx.save();
  // Track
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x - 1, top - 1, w + 2, h + 2);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x, top, w, h);
  // Fill
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(x, top, w * progress, h);
  ctx.restore();
};

const drawPickup = (
  ctx: CanvasRenderingContext2D,
  pickup: Pickup,
  camera: { x: number; y: number }
) => {
  const cx = pickup.x + 8 - camera.x;
  const cy = pickup.y + 8 - camera.y;
  const size = 16;
  const floatOffset = Math.sin(Date.now() / 300 + pickup.x * 0.01) * 2;
  const drawY = cy + floatOffset;

  // Ground shadow under every pickup. Fixed at the base position (not
  // floating with the item) so the bob animation visibly lifts the sprite
  // away from its shadow — and so pickups pop against the grass.
  const shadowAlpha = 0.35 - floatOffset * 0.025; // shrinks slightly as the pickup rises
  drawGroundShadow(ctx, cx, cy + size / 2, size * 0.85, Math.max(0.22, shadowAlpha));

  // Sprite-first for the original atlas-backed pickups. XP gems pick the
  // tier name from value. RE-specific pickups (ammo, weapon drops/crates)
  // have no atlas art and are drawn procedurally below.
  const SPRITE_PICKUPS = new Set(['experience', 'health', 'magnet', 'bomb', 'chest']);
  if (SPRITE_PICKUPS.has(pickup.type)) {
    const spriteName =
      pickup.type === 'experience'
        ? (pickup.value >= 5 ? 'pickup-xp-red' : pickup.value >= 2 ? 'pickup-xp-green' : 'pickup-xp-blue')
        : `pickup-${pickup.type}`;
    if (drawSprite(ctx, spriteName, pickup.x - camera.x, pickup.y - camera.y + floatOffset, size, size)) {
      return;
    }
  }

  switch (pickup.type) {
    case 'experience': {
      const { fill, shimmer } = gemColorFor(pickup.value);
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(cx, drawY - size / 2);
      ctx.lineTo(cx + size / 2, drawY);
      ctx.lineTo(cx, drawY + size / 2);
      ctx.lineTo(cx - size / 2, drawY);
      ctx.closePath();
      ctx.fill();
      const a = 0.5 + 0.5 * Math.sin(Date.now() / 200);
      ctx.fillStyle = shimmer;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.moveTo(cx, drawY - 4);
      ctx.lineTo(cx + 4, drawY);
      ctx.lineTo(cx, drawY + 4);
      ctx.lineTo(cx - 4, drawY);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case 'health': {
      // Roasted chicken pickup. Drum-shaped body with a bone.
      ctx.fillStyle = '#b45309';
      ctx.beginPath();
      ctx.ellipse(cx, drawY + 1, 8, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(cx - 1, drawY - 7, 2, 5);
      ctx.beginPath();
      ctx.arc(cx, drawY - 7, 2.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'magnet': {
      ctx.strokeStyle = '#1d4ed8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, drawY + 1, 6, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(cx - 8, drawY, 4, 5);
      ctx.fillStyle = '#1d4ed8';
      ctx.fillRect(cx + 4, drawY, 4, 5);
      break;
    }
    case 'chest': {
      // Treasure chest — pulsing gold rim plus a small box.
      const pulse = 0.85 + 0.15 * Math.sin(Date.now() / 220);
      ctx.save();
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 14 * pulse;
      // Wooden body
      ctx.fillStyle = '#7c4a1b';
      ctx.fillRect(cx - 8, drawY - 4, 16, 11);
      // Gold lid
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(cx - 9, drawY - 4);
      ctx.lineTo(cx + 9, drawY - 4);
      ctx.lineTo(cx + 8, drawY - 8);
      ctx.lineTo(cx - 8, drawY - 8);
      ctx.closePath();
      ctx.fill();
      // Latch
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(cx - 2, drawY - 5, 4, 4);
      // Rim highlight
      ctx.strokeStyle = '#fde68a';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - 8, drawY - 4, 16, 11);
      ctx.restore();
      break;
    }
    case 'bomb': {
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(cx, drawY + 1, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(cx - 1, drawY - 8, 2, 4);
      // Spark
      const spark = (Math.sin(Date.now() / 80) + 1) * 0.5;
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(cx, drawY - 10, 2 + spark * 1.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'ammo-handgun':
    case 'ammo-shotgun':
    case 'ammo-rifle': {
      // Small ammo box. Color-coded by family: brass/red/amber.
      const boxColor =
        pickup.type === 'ammo-shotgun' ? '#b91c1c' :
        pickup.type === 'ammo-rifle' ? '#b45309' : '#a16207';
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(cx - 7, drawY - 4, 14, 9);
      ctx.fillStyle = boxColor;
      ctx.fillRect(cx - 7, drawY - 4, 14, 3);
      // Rounds peeking out
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(cx - 5, drawY - 6, 2, 3);
      ctx.fillRect(cx - 1, drawY - 6, 2, 3);
      ctx.fillRect(cx + 3, drawY - 6, 2, 3);
      break;
    }
    case 'weapon-drop': {
      // A gun silhouette glinting on the ground.
      ctx.save();
      ctx.shadowColor = '#93c5fd';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(cx - 8, drawY - 2, 14, 4);   // barrel/body
      ctx.fillRect(cx - 8, drawY + 2, 4, 5);    // grip
      ctx.fillStyle = '#64748b';
      ctx.fillRect(cx - 3, drawY + 2, 3, 3);    // trigger guard
      ctx.restore();
      break;
    }
    case 'weapon-crate': {
      // Metal supply crate with a glowing weapon icon.
      const pulse = 0.85 + 0.15 * Math.sin(Date.now() / 220);
      ctx.save();
      ctx.shadowColor = '#60a5fa';
      ctx.shadowBlur = 14 * pulse;
      ctx.fillStyle = '#334155';
      ctx.fillRect(cx - 9, drawY - 6, 18, 13);
      ctx.fillStyle = '#475569';
      ctx.fillRect(cx - 9, drawY - 6, 18, 3);
      // Cross banding
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - 9, drawY - 6, 18, 13);
      ctx.beginPath();
      ctx.moveTo(cx - 9, drawY - 6); ctx.lineTo(cx + 9, drawY + 7);
      ctx.moveTo(cx + 9, drawY - 6); ctx.lineTo(cx - 9, drawY + 7);
      ctx.stroke();
      // Center icon
      ctx.fillStyle = '#bfdbfe';
      ctx.fillRect(cx - 2, drawY - 1, 4, 3);
      ctx.restore();
      break;
    }
  }
};

export const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};
