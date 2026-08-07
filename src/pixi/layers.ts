// Scene-graph layer construction.
//
// The 7 named layers requested for the HD-2D foundation. Everything from
// backgroundLayer..lightingLayer lives inside `world`, which is offset by the
// camera each frame (so its children use world coordinates). `uiLayer` is a
// sibling of `world` pinned to screen space for full-screen / edge HUD-ish
// world effects (damage flashes, off-screen supply arrows).
//
//   farBackdrop  – screen-space distant panorama (slow parallax, top band)
//   worldGroup
//     ├─ groundBase    – screen-space tiling forest floor
//     ├─ horizonForest – screen-space forest seam above the ground, below gameplay
//     └─ filteredWorld – screen-space filter wrapper
//        └─ world (camera-offset)
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
  stage: Container;        // ルート(全画面グレーディング等のフィルタ適用先)
  farBackdrop: TilingSprite;
  horizonForest: TilingSprite;
  nearHorizon: TilingSprite;
  worldGroup: Container;
  groundBase: Container;
  groundStrips: TilingSprite[];
  frontForest: TilingSprite;
  filteredWorld: Container;
  world: Container;
  backgroundLayer: Container;
  groundLayer: Container;
  actorLayer: Container;
  frontObjectLayer: Container;
  effectLayer: Container;
  lightingLayer: Container;
  // ダンスUI(ミラーボール/サークル/矢印/四神名)専用。filteredWorld の外＝被写体深度(tilt-shift)で
  // ボケない。ワールド座標で追従させるため、毎フレーム world と同じカメラオフセットを適用する。
  danceUiLayer: Container;
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
  // 遠景手前森(地平の森の「手前」に重なる近めの帯。ステージ3のみ使用。既定は空テクスチャ/非表示)。
  const nearHorizon = new TilingSprite({ texture: Texture.EMPTY, width: 1, height: 1 });
  nearHorizon.visible = false;
  const groundBase = new Container();
  // §6.37 床の縦延長(「本数追加」方式・PACING_PUZZLE.md §6.37-1): 72 → 72×1/ZOOM_MIN_ABS(=180)。
  // stripH/t の定義は不変のまま、増えた分は下方向(近景側)へだけ積み増す
  // (src/pixi/pixiScene.ts の computeGroundBandLayout/groundStripT・updatePerspectiveGround)。
  const GROUND_STRIP_COUNT = 180;
  const groundStrips = Array.from(
    { length: GROUND_STRIP_COUNT },
    () => new TilingSprite({ texture: forestTexture, width: 1, height: 1 })
  );
  groundBase.addChild(...groundStrips);
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

  // worldGroup holds the fixed screen-space ground, the horizon seam, and the
  // camera-offset world. The seam sits above groundBase but below gameplay
  // actors/effects so it can hide the floor edge without covering objects.
  // Filters are applied to filteredWorld only, so the ground never bleeds into
  // the far panorama through blur while world still draws above it.
  const worldGroup = new Container();
  // danceUiLayer は filteredWorld の後(=上)に置く: フィルタ外なのでボケず、front forest より下=従来の
  // effectLayer と同じ重なり順を保つ。位置(カメラオフセット)は pixiScene が毎フレーム world と同期する。
  const danceUiLayer = new Container();
  // nearHorizon は horizonForest の「手前(上=後で描画)」・gameplay(filteredWorld)の「後ろ」に置く。
  worldGroup.addChild(groundBase, horizonForest, nearHorizon, filteredWorld, danceUiLayer);

  const uiLayer = new Container();

  stage.addChild(farBackdrop, worldGroup, frontForest, uiLayer);

  return {
    stage,
    farBackdrop,
    horizonForest,
    nearHorizon,
    worldGroup,
    groundBase,
    groundStrips,
    frontForest,
    filteredWorld,
    world,
    backgroundLayer,
    groundLayer,
    actorLayer,
    frontObjectLayer,
    effectLayer,
    lightingLayer,
    danceUiLayer,
    uiLayer,
  };
};
