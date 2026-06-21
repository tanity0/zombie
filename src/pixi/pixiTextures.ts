// PixiJS texture provider for the world renderer.
//
// Reuses the EXACT same art the Canvas2D renderer uses: a single `atlas.png`
// (enemies, tree, atlas-backed pickups) plus a standalone `player.png`. Each
// atlas entry is a sub-Texture carved out with an explicit source frame, so
// swapping in real sprites later is just a matter of editing the frames (or
// pointing a name at its own PNG).
//
// Nearest-neighbour scaling keeps the pixel art crisp at any zoom, matching
// the Canvas2D path's `imageSmoothingEnabled = false`.

import { Assets, Rectangle, Texture } from 'pixi.js';
import { ATLAS_RECTS } from '../utils/spriteAtlas';
import { spritePath } from '../utils/spriteLoader';
import { CITY_PROPS } from '../world/cityProps';
import { setEnemyArtAspect } from './renderSpec';

const textures = new Map<string, Texture>();
let ready = false;
let loading: Promise<void> | null = null;

// Load the atlas + player image and slice every named frame. Idempotent: the
// first caller kicks off the load, later callers await the same promise.
export const ensureTextures = (): Promise<void> => {
  if (ready) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    const playerWalkNames = [
      'player-magnum-walk-0',
      'player-magnum-walk-1',
      'player-magnum-walk-2',
      'player-magnum-game-0',
      'player-magnum-game-1',
      'player-magnum-game-2',
      'player-striker-walk-0',
      'player-striker-walk-1',
      'player-striker-walk-2',
      'player-striker-game-0',
      'player-striker-game-1',
      'player-striker-game-2',
      'player-shotgun-walk-0',
      'player-shotgun-walk-1',
      'player-shotgun-walk-2',
      'player-shotgun-game-0',
      'player-shotgun-game-1',
      'player-shotgun-game-2',
      'player-scavenger-walk-0',
      'player-scavenger-walk-1',
      'player-scavenger-walk-2',
      'player-scavenger-game-0',
      'player-scavenger-game-1',
      'player-scavenger-game-2',
      // 武将セット(特殊3点)フル装備時の立ち絵。小烏丸も装備していれば刀バージョン。
      'player-warlord-gun-walk-0',
      'player-warlord-gun-walk-1',
      'player-warlord-gun-walk-2',
      'player-warlord-katana-walk-0',
      'player-warlord-katana-walk-1',
      'player-warlord-katana-walk-2',
      'dog-walk-0',
      'dog-walk-1',
      'treasure-1',
      'treasure-2',
      'treasure-3',
      'treasure-4',
      'treasure-5',
      'treasure-6',
      'weapon-merchant',
      'quest-futari',
      // 設置型シールド: 上下左右の向き別スプライト(向き=防ぐ面)。
      'shield-up',
      'shield-down',
      'shield-left',
      'shield-right',
      // 設置型デコイ(全方向の単体装置スプライト)。
      'decoy',
    ];
    // 単体PNG。scaleMode 未指定は既定(linear)のまま(魔法陣/鞭のソフト発光用)。
    // nearest=ピクセルアート、linear=高解像度を縮小描画するもの(球/ヘリ)。
    const standalone: { name: string; scaleMode?: 'nearest' | 'linear' }[] = [
      { name: 'player', scaleMode: 'nearest' },
      { name: 'katana-item', scaleMode: 'nearest' }, // 背負い刀(刀/小烏丸 装備中にプレイヤー背面へ表示)
      // 銃スプライト(ワールドのドロップ/ピックアップ表示 + HUDの武器アイコン)。武器keyで引く。
      { name: 'weapons/handgun-t1', scaleMode: 'nearest' },
      { name: 'weapons/handgun-t2', scaleMode: 'nearest' },
      { name: 'weapons/handgun-t3', scaleMode: 'nearest' },
      { name: 'weapons/rifle-t1', scaleMode: 'nearest' },
      { name: 'weapons/rifle-t2', scaleMode: 'nearest' },
      { name: 'weapons/rifle-t3', scaleMode: 'nearest' },
      { name: 'weapons/shotgun-t1', scaleMode: 'nearest' },
      { name: 'weapons/shotgun-t2', scaleMode: 'nearest' },
      { name: 'weapons/shotgun-t3', scaleMode: 'nearest' },
      { name: 'weapons/phill-revolver', scaleMode: 'nearest' },
      { name: 'zan' }, // 刀フィニッシュの習字「斬」(拡大表示なので既定linearで滑らかに)
      { name: 'torch', scaleMode: 'nearest' },
      { name: 'castle', scaleMode: 'nearest' },
      { name: 'magic-circle' },        // 既定(linear)のまま
      { name: 'whip-hurricane' },      // 既定のまま
      { name: 'whip' },                // 既定のまま
      { name: 'mirror-ball', scaleMode: 'linear' },
      { name: 'helicopter', scaleMode: 'nearest' }, // ぼかさない(平滑化なし=くっきり)
      { name: 'fog-alpha', scaleMode: 'linear' },     // 森下の霧素材(アルファ透過版=通常合成で重ねる)
      // 研究施設(屋内)アセット。サブディレクトリ込みの名前で登録(spritePath が sprites/<name>.png)。
      { name: 'lab/lab-wall-open-top', scaleMode: 'nearest' },
      { name: 'lab/lab-wall-open-mid', scaleMode: 'nearest' },
      { name: 'lab/lab-wall-open-bottom', scaleMode: 'nearest' },
      { name: 'lab/lab-wall-closed-top', scaleMode: 'nearest' },
      { name: 'lab/lab-wall-closed-mid', scaleMode: 'nearest' },
      { name: 'lab/lab-wall-closed-bottom', scaleMode: 'nearest' },
      { name: 'lab/lab-wall-side-long', scaleMode: 'nearest' },
      { name: 'lab/lab-wall-side-block1', scaleMode: 'nearest' },
      { name: 'lab/lab-wall-side-block2', scaleMode: 'nearest' },
      { name: 'lab/lab-wall-side-block3', scaleMode: 'nearest' },
      { name: 'lab-floor/lab-floor-r1-c1', scaleMode: 'nearest' },
      { name: 'lab-floor/lab-floor-r5-c1', scaleMode: 'nearest' },
      { name: 'lab-floor/lab-floor-ground', scaleMode: 'nearest' }, // シームレス床(ステージ1風)
      { name: 'lab-floor/lab-floor-stage2', scaleMode: 'nearest' }, // stage-2 屋外ラボ床(社長提供の最新タイル。専用名でキャッシュ確実更新)
      // 新ドット絵タイル(64²・シームレス・16色)。床ベース＝clean、変種＝blood/grime/crack/scorch、隅AO。
      { name: 'lab-floor/lab-floor-clean', scaleMode: 'nearest' },
      { name: 'lab-floor/lab-floor-blood', scaleMode: 'nearest' },
      { name: 'lab-floor/lab-floor-grime', scaleMode: 'nearest' },
      { name: 'lab-floor/lab-floor-crack', scaleMode: 'nearest' },
      { name: 'lab-floor/lab-floor-scorch', scaleMode: 'nearest' },
      { name: 'lab-floor/lab-floor-ao', scaleMode: 'nearest' },
      { name: 'lab-floor/lab-floor-persp', scaleMode: 'nearest' }, // 遠近床用 強グリッド(?labpersp)
      { name: 'lab-floor/lab-floor-persp-plate', scaleMode: 'nearest' }, // 焼き込み遠近プレート(?labpersp 一枚絵床)
      // 無地壁スライス(前面=左右シームレス / 上端キャップ)＋装飾壁(ガラス窓パネル/横ビーム)。
      { name: 'lab/lab-wall-front', scaleMode: 'nearest' },
      { name: 'lab/lab-wall-top', scaleMode: 'nearest' },
      { name: 'lab/lab-wall2-panel', scaleMode: 'nearest' },
      { name: 'lab/lab-wall2-beam', scaleMode: 'nearest' },
      // 手置き壁オブジェクト(横/縦の一枚絵ビルボード。足元アンカーで配置・遮蔽物)。
      { name: 'lab/lab-wall-obj-h', scaleMode: 'nearest' },
      { name: 'lab/lab-wall-obj-v', scaleMode: 'nearest' },
      // 研究所スキンの背景3層(屋外テーマ時に森レイヤーを差し替える。レイヤー構造は不変)。
      { name: 'lab/lab-far-backdrop' },  // 遠景パノラマ(不透明)
      { name: 'lab/lab-horizon-band' },  // 地平の機械帯(紫=透過)
      { name: 'lab/lab-front-band' },    // 手前のボヤけ機械帯(紫=透過。ブラーは既存フィルタで継続)
      { name: 'lab/lab-ceiling-band' },  // 最前面の天井ケーブル帯(紫=透過・上寄せ・半透明オーバーレイ)
      // 背景の天井/void プレート(外周マージンに低速パララックスで敷く・縦横シームレス)。
      { name: 'lab/lab-bg-void', scaleMode: 'nearest' },
      { name: 'lab-uv-bar', scaleMode: 'nearest' }, // 研究所のUVライトバー(松明の代わり)
      { name: 'lab-clear-item', scaleMode: 'nearest' }, // 研究所クリア条件アイテム(拾うとクリア)
      { name: 'wire-anchor-tip', scaleMode: 'nearest' }, // ワイヤーアンカー先端(爪=左下基準。穴=右上にワイヤー接続)
      // 研究所オブジェ(木の代わりの障害物。紫透過済み)。
      { name: 'lab-props/lab-prop-r1-c1', scaleMode: 'nearest' },
      { name: 'lab-props/lab-prop-r1-c2', scaleMode: 'nearest' },
      { name: 'lab-props/lab-prop-r1-c3', scaleMode: 'nearest' },
      { name: 'lab-props/lab-prop-r1-c4', scaleMode: 'nearest' },
      { name: 'lab-props/lab-prop-r2-c1', scaleMode: 'nearest' },
      { name: 'lab-props/lab-prop-r2-c2', scaleMode: 'nearest' },
      { name: 'lab-props/lab-prop-r2-c3', scaleMode: 'nearest' },
      { name: 'lab-props/lab-prop-r2-c4', scaleMode: 'nearest' },
      { name: 'lab-props/lab-prop-r3-c1', scaleMode: 'nearest' },
      { name: 'lab-props/lab-prop-r3-c2', scaleMode: 'nearest' },
      { name: 'lab-props/lab-prop-r3-c3', scaleMode: 'nearest' },
      { name: 'lab-props/lab-prop-r3-c4', scaleMode: 'nearest' },
      // 救助イベントのNPC(射撃手/一般人 男女)。各2コマ歩き(0=待機,1=歩き)。紫背景は透過済み。
      { name: 'rescue/shooter-0', scaleMode: 'nearest' },
      { name: 'rescue/shooter-1', scaleMode: 'nearest' },
      { name: 'rescue/civ-m-0', scaleMode: 'nearest' },
      { name: 'rescue/civ-m-1', scaleMode: 'nearest' },
      { name: 'rescue/civ-f-0', scaleMode: 'nearest' },
      { name: 'rescue/civ-f-1', scaleMode: 'nearest' },
      // 研究所ゾンビ(Lv1/2 は男女、Lv3 は巨体1種)。
      { name: 'lab-zombie/lab-zombie-lv1-male', scaleMode: 'nearest' },
      { name: 'lab-zombie/lab-zombie-lv1-female', scaleMode: 'nearest' },
      { name: 'lab-zombie/lab-zombie-lv2-male', scaleMode: 'nearest' },
      { name: 'lab-zombie/lab-zombie-lv2-female', scaleMode: 'nearest' },
      { name: 'lab-zombie/lab-zombie-lv3', scaleMode: 'nearest' },

      // ステージ3(廃都)のランダム散布オブジェクト。詳細イラスト調なので linear で滑らかに縮小。
      ...CITY_PROPS.map((p) => ({ name: p.tex, scaleMode: 'linear' as const })),
      // ステージ3(廃都)専用の敵絵(アトラス敵を見た目で差し替え)。アトラス敵と同じピクセル調=nearest。
      ...['zombie', 'bat', 'skeleton', 'plant', 'ghost', 'werewolf', 'pumpkin', 'giantbat', 'reaper']
        .map((t) => ({ name: `stage3-enemies/${t}`, scaleMode: 'nearest' as const })),

      ...playerWalkNames.map((name) => ({ name, scaleMode: 'nearest' as const })),
    ];

    // 1アセットのロード失敗が全体を巻き込まないよう個別に握りつぶす。失敗した絵は
    // 未登録(getTexture=null)になり、その描画だけスキップ/手続き描画にフォールバック。
    // 以前は Promise.all で1つでも失敗すると ready が永久に立たず画面が真っ暗になっていた。
    const loadOne = async (name: string): Promise<Texture | null> => {
      try {
        return await Assets.load(spritePath(name));
      } catch (e) {
        console.warn(`[pixiTextures] failed to load sprite "${name}":`, e);
        return null;
      }
    };

    // 紫ベタ背景の単体PNGを「左上隅の色をキーに透過」して登録(自動タレット絵など。背景未透過対策)。
    const loadKeyed = async (name: string, scaleMode: 'nearest' | 'linear' = 'nearest') => {
      try {
        const img = new Image();
        await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = spritePath(name); });
        const w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) return;
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const im = ctx.getImageData(0, 0, w, h);
        const d = im.data;
        const kr = d[0], kg = d[1], kb = d[2]; // 左上隅 = 背景(紫)を基準色に
        const tol2 = 80 * 80;
        for (let i = 0; i < d.length; i += 4) {
          const dr = d[i] - kr, dg = d[i + 1] - kg, db = d[i + 2] - kb;
          if (dr * dr + dg * dg + db * db <= tol2) d[i + 3] = 0;
        }
        ctx.putImageData(im, 0, 0);
        const tex = Texture.from(cv);
        tex.source.scaleMode = scaleMode;
        textures.set(name, tex);
      } catch (e) {
        console.warn(`[pixiTextures] failed to color-key "${name}":`, e);
      }
    };

    await Promise.all([
      // アトラス(敵/木/一部拾い物)。読めたらフレームを切り出す。失敗時はその絵だけ欠落。
      (async () => {
        const atlas = await loadOne('atlas');
        if (!atlas) return;
        atlas.source.scaleMode = 'nearest';
        for (const [name, [sx, sy, sw, sh]] of Object.entries(ATLAS_RECTS)) {
          textures.set(
            name,
            new Texture({ source: atlas.source, frame: new Rectangle(sx, sy, sw, sh) })
          );
        }
      })(),
      ...standalone.map(async ({ name, scaleMode }) => {
        const tex = await loadOne(name);
        if (!tex) return;
        if (scaleMode) tex.source.scaleMode = scaleMode;
        textures.set(name, tex);
      }),
    ]);

    // 自動タレット(紫背景未透過)を色キーで透過して登録。
    await Promise.all([loadKeyed('turret-fixed'), loadKeyed('turret-omni')]);

    // 既存の木(atlasの'tree')を新しい木の一枚絵で差し替える(社長指示)。atlas切り出しの後に
    // 上書きしてキーを確実に置き換える。詳細イラスト調なので linear で滑らかに縮小描画。
    const newTree = await loadOne('tree-new');
    if (newTree) { newTree.source.scaleMode = 'linear'; textures.set('tree', newTree); }
    // 城(ステージ3のフィナーレ拠点)を廃教会の絵に差し替え(社長提供)。足元アンカー・高さ基準スケールは不変。
    const church = await loadOne('castle-church');
    if (church) { church.source.scaleMode = 'nearest'; textures.set('castle', church); }

    // 敵スプライトのアスペクト(texH/texW)を登録(PHILLサークルの頭スナップを実描画に合わせる)。
    const regAspect = (key: string, texName: string) => {
      const t = textures.get(texName);
      if (t && t.width > 0) setEnemyArtAspect(key, t.height / t.width);
    };
    for (const ty of ['zombie', 'bat', 'skeleton', 'plant', 'ghost', 'werewolf', 'pumpkin', 'giantbat', 'reaper']) {
      regAspect(`default:${ty}`, ty);                 // アトラス(森系)の敵絵
      regAspect(`stage3:${ty}`, `stage3-enemies/${ty}`); // 廃都(ステージ3)の敵絵
    }
    regAspect('default:lab-zombie-1', 'lab-zombie/lab-zombie-lv1-male');
    regAspect('default:lab-zombie-2', 'lab-zombie/lab-zombie-lv2-male');
    regAspect('default:lab-zombie-3', 'lab-zombie/lab-zombie-lv3');

    ready = true; // 一部失敗しても描画は継続(真っ暗を防ぐ)。
  })();
  return loading;
};

export const texturesReady = (): boolean => ready;

// 背景パノラマ/床/地平帯はマニフェスト外で URL 直読みする(PixiStage が Assets.load)。
// これらを起動時のローディング画面で先読みしておくと、出撃時に Assets キャッシュから即取得でき、
// 「出撃直後に一瞬ステージ1(森)が映る」フラッシュを防げる(注入を初回ペイント前に間に合わせる)。
const BACKGROUND_PATHS = [
  'backgrounds/distant-night-panorama.jpg',
  'backgrounds/ground-moss-dirt.jpg',
  'backgrounds/horizon-forest-band.png',
  'backgrounds/front-forest-foreground.png',
  'backgrounds/stage3-distant-city-day.jpg',
  'backgrounds/stage3-ground-cobble2.jpg',
  'backgrounds/stage3-horizon-city.png',
  'backgrounds/stage3-near-horizon-city.png',
  'backgrounds/stage1-near-forest.png',
  'backgrounds/stage2-lab-far.jpg',
  'backgrounds/stage2-near-horizon2.png',
  'backgrounds/stage4-far.jpg',
  'backgrounds/stage4-front.png',
  'backgrounds/stage4-ground.jpg',
  'backgrounds/stage4-horizon.png',
  'backgrounds/stage3-front-rooftops.png',
  'sprites/lab-floor/lab-floor-stage2.png',
];
let bgLoading: Promise<void> | null = null;
export const preloadBackgrounds = (): Promise<void> => {
  if (!bgLoading) {
    const BASE = import.meta.env.BASE_URL;
    bgLoading = Promise.all(
      BACKGROUND_PATHS.map((p) => Assets.load(`${BASE}${p}`).catch(() => null))
    ).then(() => {});
  }
  return bgLoading;
};

// Texture for an actor/pickup name, or null when there's no art for it (the
// RE-specific pickups and projectiles are drawn procedurally instead).
export const getTexture = (name: string): Texture | null =>
  textures.get(name) ?? null;
