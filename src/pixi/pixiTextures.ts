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
import { STAGE_PROPS } from '../world/cityProps';
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
      'player-magnum-walk-3',
      'player-magnum-walk-4',
      'player-magnum-idle',
      'player-magnum-game-0',
      'player-magnum-game-1',
      'player-magnum-game-2',
      'player-striker-walk-0',
      'player-striker-walk-1',
      'player-striker-walk-2',
      'player-striker-walk-3',
      'player-striker-walk-4',
      'player-striker-idle',
      'player-striker-game-0',
      'player-striker-game-1',
      'player-striker-game-2',
      'player-shotgun-walk-0',
      'player-shotgun-walk-1',
      'player-shotgun-walk-2',
      'player-shotgun-walk-3',
      'player-shotgun-walk-4',
      'player-shotgun-idle',
      'player-shotgun-game-0',
      'player-shotgun-game-1',
      'player-shotgun-game-2',
      'player-scavenger-walk-0',
      'player-scavenger-walk-1',
      'player-scavenger-walk-2',
      'player-scavenger-walk-3',
      'player-scavenger-walk-4',
      'player-scavenger-idle',
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
      { name: 'knife-item', scaleMode: 'nearest' },  // (旧)近接ナイフ実画像。互換のため残置
      { name: 'knife-swing-1', scaleMode: 'nearest' }, // 近接スイング1枚目(青ダガー)
      { name: 'knife-swing-2', scaleMode: 'nearest' }, // 近接スイング2枚目(青ダガー+青スラッシュ)
      // ステージ1(森)の装飾: 光る花クラスター12種(壁判定なしの飾り)。
      { name: 'props/flower-0', scaleMode: 'nearest' },
      { name: 'props/flower-1', scaleMode: 'nearest' },
      { name: 'props/flower-2', scaleMode: 'nearest' },
      { name: 'props/flower-3', scaleMode: 'nearest' },
      { name: 'props/flower-4', scaleMode: 'nearest' },
      { name: 'props/flower-5', scaleMode: 'nearest' },
      { name: 'props/flower-6', scaleMode: 'nearest' },
      { name: 'props/flower-7', scaleMode: 'nearest' },
      { name: 'props/flower-8', scaleMode: 'nearest' },
      { name: 'props/flower-9', scaleMode: 'nearest' },
      { name: 'props/flower-10', scaleMode: 'nearest' },
      { name: 'props/flower-11', scaleMode: 'nearest' },
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
      // 近接(ナイフ系)アイコン。銃と同じピックアップ/HUDアイコン(攻撃モーション用ではない)。
      { name: 'weapons/knife-t1', scaleMode: 'nearest' },
      { name: 'weapons/hatchet-t2', scaleMode: 'nearest' },
      { name: 'weapons/machete-t3', scaleMode: 'nearest' },
      { name: 'weapons/tactical-knife-t4', scaleMode: 'nearest' },
      { name: 'weapons/anti-mutant-knife-t5', scaleMode: 'nearest' },
      // 裏ボス スカジの氷ハザード(氷塊テレグラフ / 飛ぶ氷の刃)。ピクセルアート=nearest。
      { name: 'skadi-ice-block', scaleMode: 'nearest' },
      { name: 'skadi-ice-blade', scaleMode: 'nearest' },
      { name: 'zan' }, // 刀フィニッシュの習字「斬」(拡大表示なので既定linearで滑らかに)
      { name: 'torch', scaleMode: 'nearest' },
      // 銃弾ヒット時に被弾敵の背中側へ生やす火の破裂(2コマ。0=大きい爆発→1=細い噴射)。ピクセルアート=nearest。
      { name: 'fx/hitfire-0', scaleMode: 'nearest' },
      { name: 'fx/hitfire-1', scaleMode: 'nearest' },
      // 斬撃エフェクト(ピクセル・5コマ)。burst=当たり判定の中央バースト / streak=斬撃の線(段々大きく)。
      { name: 'fx/slash-burst-0', scaleMode: 'nearest' },
      { name: 'fx/slash-burst-1', scaleMode: 'nearest' },
      { name: 'fx/slash-burst-2', scaleMode: 'nearest' },
      { name: 'fx/slash-burst-3', scaleMode: 'nearest' },
      { name: 'fx/slash-burst-4', scaleMode: 'nearest' },
      { name: 'fx/slash-streak-0', scaleMode: 'nearest' },
      { name: 'fx/slash-streak-1', scaleMode: 'nearest' },
      { name: 'fx/slash-streak-2', scaleMode: 'nearest' },
      { name: 'fx/slash-streak-3', scaleMode: 'nearest' },
      { name: 'fx/slash-streak-4', scaleMode: 'nearest' },
      { name: 'props/stage4-campfire' }, // ステージ4の焚き火(松明置き換え。詳細絵=linear既定)
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
      { name: 'lab-props/lab-prop2-r1-c1', scaleMode: 'nearest' },
      { name: 'lab-props/lab-prop2-r1-c2', scaleMode: 'nearest' },
      { name: 'lab-props/lab-prop2-r1-c3', scaleMode: 'nearest' },
      { name: 'lab-props/lab-prop2-r1-c4', scaleMode: 'nearest' },
      { name: 'lab-props/lab-prop2-r2-c1', scaleMode: 'nearest' },
      { name: 'lab-props/lab-prop2-r2-c2', scaleMode: 'nearest' },
      { name: 'lab-props/lab-prop2-r2-c3', scaleMode: 'nearest' },
      { name: 'lab-props/lab-prop2-r2-c4', scaleMode: 'nearest' },
      { name: 'lab-props/lab-prop2-r3-c1', scaleMode: 'nearest' },
      { name: 'lab-props/lab-prop2-r3-c2', scaleMode: 'nearest' },
      { name: 'lab-props/lab-prop2-r3-c3', scaleMode: 'nearest' },
      { name: 'lab-props/lab-prop2-r3-c4', scaleMode: 'nearest' },
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
      // 進軍用NPC(護衛軍人)のユニーク立ち絵(2コマ歩行・透過済み)。soldierIndex で出し分け。
      { name: 'npc/edgar-0', scaleMode: 'nearest' },
      { name: 'npc/edgar-1', scaleMode: 'nearest' },
      { name: 'npc/edgar-2', scaleMode: 'nearest' },     // 3コマ歩行(社長提供)
      { name: 'npc/joseph-0', scaleMode: 'nearest' },
      { name: 'npc/joseph-1', scaleMode: 'nearest' },
      { name: 'npc/joseph-2', scaleMode: 'nearest' },    // 3コマ歩行(社長提供)
      { name: 'npc/elizabeth-0', scaleMode: 'nearest' },
      { name: 'npc/elizabeth-1', scaleMode: 'nearest' },
      { name: 'npc/elizabeth-2', scaleMode: 'nearest' }, // 3コマ歩行(社長提供)
      { name: 'npc/musashi-0', scaleMode: 'nearest' },
      { name: 'npc/musashi-1', scaleMode: 'nearest' },
      { name: 'npc/chen-0', scaleMode: 'nearest' },
      { name: 'npc/chen-1', scaleMode: 'nearest' },
      { name: 'npc/lauren-0', scaleMode: 'nearest' },
      { name: 'npc/lauren-1', scaleMode: 'nearest' },
      { name: 'npc/lauren-2', scaleMode: 'nearest' },    // 3コマ歩行(社長提供)
      { name: 'npc/phaser-0', scaleMode: 'nearest' },
      { name: 'npc/phaser-1', scaleMode: 'nearest' },
      { name: 'npc/muhammad-0', scaleMode: 'nearest' },
      { name: 'npc/muhammad-1', scaleMode: 'nearest' },

      // ステージ別(廃都/雪原)の散布オブジェクト。詳細イラスト調なので linear で滑らかに縮小。
      ...Object.values(STAGE_PROPS).flat().map((p) => ({ name: p.tex, scaleMode: 'linear' as const })),
      // ステージ3(廃都)専用の敵絵(アトラス敵を見た目で差し替え)。アトラス敵と同じピクセル調=nearest。
      ...['zombie', 'bat', 'skeleton', 'plant', 'ghost', 'werewolf', 'pumpkin', 'giantbat', 'reaper']
        .map((t) => ({ name: `stage3-enemies/${t}`, scaleMode: 'nearest' as const })),
      // ステージ4(雪原)専用の敵絵(既存9種の差し替え＋新型 lich)。詳細イラスト調なので linear で滑らかに縮小。
      ...['zombie', 'bat', 'skeleton', 'plant', 'ghost', 'werewolf', 'pumpkin', 'giantbat', 'reaper', 'lich']
        .map((t) => ({ name: `stage4-enemies/${t}`, scaleMode: 'linear' as const })),

      ...playerWalkNames.map((name) => ({ name, scaleMode: 'nearest' as const })),

      // 裏ボス(深層域の隠しボス)。詳細イラスト調なので linear で滑らかに縮小。
      // 名前=EnemyType と一致させ、drawEnemy の getTexture(e.type) で解決する。
      { name: 'mimir', scaleMode: 'linear' as const },
      { name: 'jormungand', scaleMode: 'linear' as const },
      { name: 'skadi', scaleMode: 'linear' as const },
      // トール(ステージ5)はドット絵タッチの素材なので、他の裏ボス(linear)と違い nearest で
      // ピクセルの輪郭を保つ(hunterと同じ扱い)。
      { name: 'thor', scaleMode: 'nearest' as const },
      // ハンター変異体(イベント敵)。名前=EnemyType と一致=drawEnemy の getTexture(e.type) で解決。
      // ドット絵タッチなので nearest(全ステージ共通の1枚絵・透過済み)。
      { name: 'hunter', scaleMode: 'nearest' as const },
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

    // 自動タレット(紫背景未透過)を色キーで透過して登録。叫喚型(screamer)も紫背景なので同様に色キー透過。
    // スケボー(投擲用)も白背景未透過なので同じ色キー透過(左上=白を抜く。黒デッキ/黄ホイールは残る)。
    // トールの刀(横払い/突き用・社長提供)も紫背景なので同様に色キー透過。詳細イラスト調なのでlinear。
    await Promise.all([loadKeyed('turret-fixed'), loadKeyed('turret-omni'), loadKeyed('screamer'), loadKeyed('skateboard'), loadKeyed('thor-katana', 'linear')]);

    // ステージ1セット(アトラスの敵/ピックアップ/木)をドット絵で上書き(社長指示)。
    // atlas 切り出しの後に textures.set で確実に置換。ドット絵なので nearest。
    const atlasPxNames = ['zombie', 'bat', 'skeleton', 'plant', 'ghost', 'werewolf', 'pumpkin', 'giantbat', 'reaper', 'tree',
      'pickup-xp-blue', 'pickup-xp-green', 'pickup-xp-red', 'pickup-health', 'pickup-magnet', 'pickup-bomb', 'pickup-chest'];
    await Promise.all(atlasPxNames.map(async (n) => {
      const t = await loadOne(`atlas-px2/${n}`);
      if (t) { t.source.scaleMode = 'nearest'; textures.set(n, t); }
    }));
    // ステージ3(廃都)用の木=ドット絵の葉付き木(syncTrees が farBackdrop で出し分け)。既定 'tree' は枯れ木(stage1)。
    const cityTree = await loadOne('tree-new2');
    if (cityTree) { cityTree.source.scaleMode = 'nearest'; textures.set('tree-city', cityTree); }
    // ステージ4(雪原)用の木=雪化粧の針葉樹(社長提供・透過済み)。syncTrees が farBackdrop==='snow' で出し分け。
    const snowTree = await loadOne('tree-snow');
    if (snowTree) { snowTree.source.scaleMode = 'nearest'; textures.set('tree-snow', snowTree); }
    // 廃教会(社長提供)。ステージ3(廃都)のフィナーレ拠点でのみ使用するため 'castle-church' の別キーで登録。
    // 以前は 'castle' を上書きしていたため全ステージ(ステージ1の城も)が教会になっていた→ syncCastle 側で
    // farBackdrop により出し分ける(city=教会 / その他=castle.png)。
    const church = await loadOne('castle-church');
    if (church) { church.source.scaleMode = 'nearest'; textures.set('castle-church', church); }

    // 敵スプライトのアスペクト(texH/texW)を登録(PHILLサークルの頭スナップを実描画に合わせる)。
    const regAspect = (key: string, texName: string) => {
      const t = textures.get(texName);
      if (t && t.width > 0) setEnemyArtAspect(key, t.height / t.width);
    };
    for (const ty of ['zombie', 'bat', 'skeleton', 'plant', 'ghost', 'werewolf', 'pumpkin', 'giantbat', 'reaper']) {
      regAspect(`default:${ty}`, ty);                 // アトラス(森系)の敵絵
      regAspect(`stage3:${ty}`, `stage3-enemies/${ty}`); // 廃都(ステージ3)の敵絵
      regAspect(`stage4:${ty}`, `stage4-enemies/${ty}`); // 雪原(ステージ4)の敵絵
    }
    // 新型 lich はステージ4専用。既定キー 'lich' にも同じ絵を割り当てて drawEnemy のフォールバックを成立させる。
    const lichTex = textures.get('stage4-enemies/lich');
    if (lichTex) { textures.set('lich', lichTex); }
    regAspect('default:lich', 'stage4-enemies/lich');
    regAspect('stage4:lich', 'stage4-enemies/lich');
    regAspect('default:hunter', 'hunter'); // ハンター変異体(全ステージ共通の1枚絵)
    regAspect('default:screamer', 'screamer'); // 変異体(叫喚型・全ステージ共通の1枚絵)
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
  'backgrounds/stage4-front2.png',
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
