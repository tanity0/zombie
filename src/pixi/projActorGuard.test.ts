import { describe, it, expect } from 'vitest';
import { PROJ_ACTOR_ROLES, projRoleMove } from '../utils/projActorPass';

// research/PERSPECTIVE_PROJECTION.md §3-5k 作る物10(ソースの番人): 投影の段階2の後掛けは「役の表」に載った物だけを動かす。
// 体の入れ物(view.container / 主人公の入れ物)へ物を足す所が増えたのに役の表(projChildKey の名札・作る所の projTag)へ
// 載せていないと、その物は「未分類」=後掛けで動かない(体から離れる)か、予告なのに動く(赤い予告の掟の違反)になる。
// 足す所の数をここに固定し、増えたら落ちる=役を決めてから数を直す。

const sources = import.meta.glob('./pixiScene.ts', { eager: true, import: 'default', query: '?raw' }) as Record<string, string>;
const src = Object.values(sources)[0] ?? '';

const code = (s: string) => s.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l));

describe('投影の段階2: 後掛けの役の表(番人)', () => {
  it('pixiScene.ts を読めている', () => {
    expect(src.length).toBeGreaterThan(100000);
  });

  it('体の入れ物へ物を足す所は、数えた所だけ(増えたら役の表へ載せてから数を直す)', () => {
    const hits = code(src).filter((l) =>
      /\b(view|this\.playerView)\.container\.addChild(At)?\(/.test(l)
      || /\bc\.addChildAt\(this\.player/.test(l));
    // 内訳: 主人公の入れ物の子 8(+c.addChildAt(this.playerBloodRim) 1)=9 / フィルの羽・撒き羽根 2 / 冷気ブレス 1 /
    // 予告の焼き素材(spikeThrust・burstFrag・bandSlices・rings・bands・shockwaves×2・dashWind・coilBody・clawMarks)10 /
    // 斬撃の弧 1 / 物理の絵 1 / グレンのパーツ 1 / 英雄の霧 4 / 錬金の岩 1 / 刀の切れ目 1 /
    // ブラーの一閃の写しの刀(役 blurGhost=trail・research/BLUR.md)1 = 32
    expect(hits.length).toBe(32);
  });

  it('別名(const vc = view.container の後の vc.addChild 等)や体の親(body.parent / view.sprite.parent)へ足す所も数える', () => {
    const lines = code(src);
    const alias: string[] = [];
    lines.forEach((l, i) => {
      const m = /const (\w+) = (view|this\.playerView)\.container;/.exec(l);
      if (!m) return;
      const re = new RegExp(`\\b${m[1]}\\.addChild(At)?\\(`);
      for (let j = i + 1; j < lines.length; j++) {
        if (/^ {2}(private |)\w+\(|^ {2}\}$/.test(lines[j])) break;
        if (re.test(lines[j])) alias.push(lines[j].trim());
      }
    });
    // 内訳: 主人公の背負い血の縁 1(c.addChildAt・上の数にも入る)/ レア召喚の竜巻 1・棺 1 / 英雄の剣 2 / 英雄の旗 1 = 6
    expect(alias.length).toBe(6);
    // 体の親へ足す所: 格闘の幻影の構えの光 1・格闘の構えの光 1・格闘の残像 1・英雄の昇天の白い体 1 = 4
    expect(lines.filter((l) => /\b(body|view\.sprite)\.parent\.addChild(At)?\(/.test(l)).length).toBe(4);
    // それぞれ名札を付けている
    for (const key of ['summonTornado', 'attachedArt', 'brawlerAura', 'brawlerGhost']) expect(src.includes(`'${key}')`), key).toBe(true);
    expect(src).toContain("this.projTag(c, 'attachedArt'); // ?proj=1 の役の表: 英雄の剣");
    expect(src).toContain("this.projTag(cf, 'attachedArt')");
    expect(src).toContain("this.projTag(tt, 'summonTornado')");
  });

  it('作る所で名札を付ける物(入れ物の子で ActorView のフィールドに無い物)はすべて projTag している', () => {
    for (const key of ['phillBack', 'featherC', 'heroFog', 'heroFog2', 'heroMotes', 'heroTrail', 'alchemyRocks', 'rim', 'avatarPart', 'brawlerAura', 'brawlerGhost']) {
      expect(src.includes(`'${key}')`), key).toBe(true);
    }
    expect(src.includes("this.projAttach(view, frontC, 'phillFront')")).toBe(true);
  });

  it('予告の部品は名札が「予告」に解決され、後掛けでは動かない', () => {
    const body = src.slice(src.indexOf('private projChildKey('), src.indexOf('private projApply('));
    expect(body.length).toBeGreaterThan(100);
    for (const [field, key] of [
      ['view.tele', 'tele'], ['view.overlayTop', 'overlayTop'], ['view.dashWind', 'dashWind'], ['view.coilBody', 'coilBody'],
      ['view.rings', 'rings'], ['view.bands', 'bands'], ['view.bandSlices', 'bandSlices'], ['view.clawMarks', 'clawMarks'],
      ['view.shockwaves', 'shockwaves'], ['view.spikeThrust', 'spikeThrust'], ['view.burstFrag', 'burstFrag'],
    ] as const) {
      expect(body.includes(field), field).toBe(true);
      expect(body.includes(`k = '${key}'`), key).toBe(true);
      expect(projRoleMove(PROJ_ACTOR_ROLES[key])).toBe('none');
    }
  });

  it('予告の子の alpha は ?proj=0 と同じ(world の位置のフェード)=後掛けの alpha の倍率は projChildAlphaMul の1本だけ', () => {
    const body = src.slice(src.indexOf('private projPostView('), src.indexOf('private projActorPostPass('));
    // 入れ物の子の alpha は役ごとに projChildAlphaMul(予告=既定で1・?telefade=0 で world の位置のフェード)で掛ける。
    // §10 B20(段階4で閉じた): ?telefade=0 の予告の子は「予告自身の投影後のY」のフェード(teleW=projTelegraphFade)。既定(ownFade)では 1。
    expect(body).toContain('projChildAlphaMul(role, TELEGRAPH_OWN_FADE, teleW, view.projPosP ?? 1, a)');
    expect(body).toContain('const teleW = TELEGRAPH_OWN_FADE ? 1 : this.projTelegraphFade(view);');
    // 予告の部品は投影後のフェードを受け取らない: drawEnemy の artFade(投影後)を予告の部品の描く関数へ渡していない
    // (予告は自分の world の位置でフェードする telegraphFade の経路)。
    const enemy = src.slice(src.indexOf('private drawEnemy('), src.indexOf('private drawPhillExtras('));
    for (const fn of ['drawTelegraphRing', 'drawTelegraphBand', 'drawSweepCircleFill', 'drawSweepBand', 'drawSweepSectorFill', 'drawAngelZoneCapsule']) {
      const re = new RegExp(`this\\.${fn}\\([^;]*\\bartFade\\b`);
      expect(re.test(enemy), fn).toBe(false);
    }
    // ?telefade=0 の時は入れ物の alpha から位置のフェードを外し、world の値(projPosW)を予告の子へ回す。
    expect(enemy).toContain('const posInKids = !!projTerms && !TELEGRAPH_OWN_FADE;');
    expect(enemy).toContain('view.projPosW = ');
  });

  it('番人③(後掛けの形): 移行した関数は ?proj=1 の時だけ記録を始め、旧い倍率は d として記録にだけ使う(後掛けが s/d で割り戻す)', () => {
    const lines = code(src);
    const kinds = ['escort', 'survivor', 'merchant', 'pickup', 'bossCorpse', 'clone', 'rescueAlly', 'baseSoldier', 'questNpc', 'supportSniper',
      'endingSoldier', 'endingPhill', 'endingFallen', 'turret', 'decoy', 'shield', 'glenHuman',
      'lab-crawler', 'lab-crawler:absorb', // 段階8 U14(研究所の変異塊の体と付属・取り込まれる敵)
      'shieldGhost', 'ghostDeath', 'heroDogDeath']; // v0.25.5836(通し漏れの一掃・組1): 盾の残骸・守護霊と英雄の犬の倒れ絵
    for (const k of kinds) {
      const idx = lines.map((l, i) => (l.includes(`this.projLoose('${k}'`) ? i : -1)).filter((i) => i >= 0);
      expect(idx.length, k).toBe(1);
      // 同じ行か、すぐ上(4行以内)の if (this.projFrame) の中=?proj=0 では記録しない
      const near = lines.slice(Math.max(0, idx[0] - 4), idx[0] + 1).join('\n');
      expect(/if \(this\.projFrame\)/.test(near), k).toBe(true);
    }
    expect(lines.filter((l) => /this\.projLoose\('/.test(l)).length).toBe(kinds.length); // 台帳に無い記録が増えたら落ちる
    const post = src.slice(src.indexOf('private projPostLoose('), src.indexOf('private projActorPostPass('));
    expect(post).toContain('const s = p.s, k = projActorK(s, r.d);');
  });

  it('後掛けは ?proj=1 の時だけ(projFrame が無ければ何もしない)・戻しは寄りの遠近の戻しの直後', () => {
    const post = src.slice(src.indexOf('private projActorPostPass('), src.indexOf('private restoreProjActors('));
    expect(post).toContain('if (!this.projFrame) { this.projLooseN = 0; return; }');
    expect(src).toMatch(/this\.restoreZwarpActors\(\);[^\n]*\n\s*this\.restoreProjActors\(\);/);
    // 後掛けは計器の前(=寄りの遠近 syncZoomWarp の counterWarpActors より前)。
    expect(src).toMatch(/this\.projActorPostPass\(\);[^\n]*\n\s*if \(PROJ_AUDIT\) this\.projAuditEndFrame\(\);/);
  });
});
