# Sprites

Drop PNG files into this folder using the exact filenames below. The
renderer checks for each PNG at startup; if it's present, it replaces the
procedural drawing for that entity. Missing files fall back gracefully.

All PNGs should be square pixel art. Source size doesn't have to match the
render size — the renderer scales without smoothing.

## Recommended source sizes

| Filename | Source | Renders at | Notes |
|---|---|---|---|
| `player.png` | 16×16 | 28×28 | Faces right; auto-flipped when moving left. |
| `bat.png` | 16×16 | 22×22 | |
| `skeleton.png` | 16×16 | 26×26 | |
| `zombie.png` | 16×16 | 30×30 | |
| `plant.png` | 16×16 | 28×28 | |
| `ghost.png` | 16×16 | 24×24 | Rendered at 65% alpha. |
| `werewolf.png` | 16×16 | 30×30 | |
| `pumpkin.png` | 32×32 | 40×40 | Boss — gets bat marker overlaid. |
| `giantbat.png` | 32×32 | 60×60 | Boss — gets bat marker overlaid. |
| `reaper.png` | 64×64 | 80×80 | Boss — gets red bat marker overlaid. |
| `pickup-xp-blue.png` | 8×8 | 16×16 | Drops from non-elite enemies. |
| `pickup-xp-green.png` | 8×8 | 16×16 | Elite drop (value 2-4). |
| `pickup-xp-red.png` | 8×8 | 16×16 | Boss drop (value 5+). |
| `pickup-health.png` | 8×8 | 16×16 | Chicken / heart. |
| `pickup-magnet.png` | 8×8 | 16×16 | |
| `pickup-bomb.png` | 8×8 | 16×16 | |
| `pickup-chest.png` | 16×16 | 16×16 | Boss drop, opens upgrade menu. |
| `tree.png` | 32×32 or 48×64 | 48×64 | Scattered as Mad Forest decor. |
| `torch.png` | any cropped pixel-art PNG | 42×68 | Breakable prop; fire is rendered as Pixi light/glow, not baked into the sprite. |

## Recommended source

[Kenney "Tiny Dungeon"](https://kenney.nl/assets/tiny-dungeon) (CC0, no
attribution required). Most of the creatures we need are in there.
