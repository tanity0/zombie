// Scene-graph layer construction.
//
// The 7 named layers requested for the HD-2D foundation. Everything from
// backgroundLayer..lightingLayer lives inside `world`, which is offset by the
// camera each frame (so its children use world coordinates). `uiLayer` is a
// sibling of `world` pinned to screen space for full-screen / edge HUD-ish
// world effects (damage flashes, off-screen supply arrows).
//
//   farBackdrop  – screen-space distant panorama (slow parallax, top band)
//   groundBase   – screen-space tiling forest floor (below the horizon band)
//   horizonForest – screen-space forest seam over the ground/far boundary
//   filteredWorld – screen-space filter wrapper
//     └─ world (camera-offset)
//       ├─ backgroundLayer  – trees and other far props
//       ├─ groundLayer      – foot shadows, ground trails, pickups
//       ├─ actorLayer       – player + enemies, Y-SORTED by foot Y (+ overlays)
//       ├─ frontObjectLayer – projectiles (above the actors)
//       ├─ effectLayer      – over-sprite effects, counter ring, reload meter
//       └─ lightingLayer    – RESERVED (halos / vignette land here next phase)
//   frontForest    – screen-space nearest forest foreground (fast parallax)
//   uiLayer        – screen-space world effects (flash, off-screen arrows)

import { Container, TilingSprite, Texture } from 'pixi.js';

export interface SceneLayers {
  farBackdrop: TilingSprite;
  horizonForest: TilingSprite;
  worldGroup: Container;
  groundBase: TilingSprite;
  frontForest: TilingSprite;
  filteredWorld: Container;
  world: Container;
  backgroundLayer: Container;
  groundLayer: Container;
  actorLayer: Container;
  frontObjectLayer: Container;
  effectLayer: Container;
  lightingLayer: Container;
  uiLayer: Container;
}

export const buildLayers = (
  stage: Container,
  forestTexture: Texture,
  farTexture: Texture,
  horizonForestTexture: Texture,
  frontForestTexture: Texture
): SceneLayers => {
  const farBackdrop = new TilingSprite({ texture: farTexture, width: 1, height: 1 });
  const horizonForest = new TilingSprite({ texture: horizonForestTexture, width: 1, height: 1 });
  const groundBase = new TilingSprite({ texture: forestTexture, width: 1, height: 1 });
  const frontForest = new TilingSprite({ texture: frontForestTexture, width: 1, height: 1 });

  const filteredWorld = new Container();
  const world = new Container();

  const backgroundLayer = new Container();
  const groundLayer = new Container();
  const actorLayer = new Container();
  // Y-sort: children render in ascending zIndex, which we set to each actor's
  // foot Y every frame. Southerly (larger Y) actors draw on top.
  actorLayer.sortableChildren = true;
  const frontObjectLayer = new Container();
  const effectLayer = new Container();
  const lightingLayer = new Container();

  world.addChild(
    backgroundLayer,
    groundLayer,
    actorLayer,
    frontObjectLayer,
    effectLayer,
    lightingLayer
  );
  filteredWorld.addChild(world);

  // worldGroup holds the fixed screen-space ground plus the camera-offset world.
  // Filters are applied to filteredWorld only, so the ground never bleeds into
  // the far panorama through blur while world still draws above it. The horizon
  // seam forest draws above the gameplay world so it does not get hidden by the
  // shared fade/cutoff tuning.
  const worldGroup = new Container();
  worldGroup.addChild(groundBase, filteredWorld, horizonForest);

  const uiLayer = new Container();

  stage.addChild(farBackdrop, worldGroup, frontForest, uiLayer);

  return {
    farBackdrop,
    horizonForest,
    worldGroup,
    groundBase,
    frontForest,
    filteredWorld,
    world,
    backgroundLayer,
    groundLayer,
    actorLayer,
    frontObjectLayer,
    effectLayer,
    lightingLayer,
    uiLayer,
  };
};
