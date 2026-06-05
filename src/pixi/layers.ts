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
//   horizonForest – screen-space forest strip masking the panorama/ground seam
//   world (camera-offset)
//     ├─ backgroundLayer  – trees and other far props
//     ├─ groundLayer      – foot shadows, ground trails, pickups
//     ├─ actorLayer       – player + enemies, Y-SORTED by foot Y (+ overlays)
//     ├─ frontObjectLayer – projectiles (above the actors)
//     ├─ effectLayer      – over-sprite effects, counter ring, reload meter
//     └─ lightingLayer    – RESERVED (halos / vignette land here next phase)
//   uiLayer        – screen-space world effects (flash, off-screen arrows)

import { Container, TilingSprite, Texture } from 'pixi.js';

export interface SceneLayers {
  farBackdrop: TilingSprite;
  worldGroup: Container;
  groundBase: TilingSprite;
  horizonForest: TilingSprite;
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
  horizonForestTexture: Texture
): SceneLayers => {
  const farBackdrop = new TilingSprite({ texture: farTexture, width: 1, height: 1 });
  const groundBase = new TilingSprite({ texture: forestTexture, width: 1, height: 1 });
  const horizonForest = new TilingSprite({ texture: horizonForestTexture, width: 1, height: 1 });

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

  // worldGroup holds everything the tilt-shift depth-of-field filter applies to
  // (the floor + the camera-offset world). The filter uses a screen-sized
  // filterArea so it never processes the world's enormous bounds. Screen-space
  // overlays (grade / vignette / flash) live in uiLayer, OUTSIDE this group, so
  // they stay sharp.
  const worldGroup = new Container();
  worldGroup.addChild(groundBase, horizonForest, world);

  const uiLayer = new Container();

  stage.addChild(farBackdrop, worldGroup, uiLayer);

  return {
    farBackdrop,
    worldGroup,
    groundBase,
    horizonForest,
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
