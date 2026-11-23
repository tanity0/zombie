import { describe, it, expect } from 'vitest';
import { PROJ_FX_KINDS, PROJ_FX_ROWS } from '../utils/projFx';
import { PROJ_ACTOR_ROLES, projRoleMove } from '../utils/projActorPass';

// research/PERSPECTIVE_PROJECTION.md §3-7l 作る物9(段階3「点で出る演出」のソースの番人)。bakeRenderGuard / projActorGuard / projShapeGuard と同じ流儀。
//   ① VisualEffect の kind の一覧(types/game.ts)と台帳の表(PROJ_FX_KINDS)が一致する
//   ② 層(effect・frontObject・ground・actor)へ addChild する所が、関数ごとの数の台帳に載っている(増えたら落ちる=字面の網)。
//      漏れの本命は実行時の計器(?proj=1&projaudit=1 の s3 fx=層を全部歩く数え方)
//   ③ 段階3の関数・別ファイル3つで、旧い遠近の倍率(depthScale・depthEnemy・dsc)を ?proj の分岐の外で演出の大きさに掛けていない
//   ④ 段階3は赤い予告に触れない(予告の役は後掛けで動かない・段階3の関数は流星の位相 meteorPhase を使わない)
//   ⑤ drawPlantSeed は drawProjectile(と弾の投影 projBullet)の後に g.position を写す
//   ⑥ §10 B31 の projKeep の上限の網はまだ無い(網を作る時は D9〜D11 を減らした後の数で固定する)=この項は無い

const sources = import.meta.glob(['./pixiScene.ts', './newGunsFx.ts', './pileDriverFx.ts', './weatherWet.ts', '../types/game.ts'], { eager: true, import: 'default', query: '?raw' }) as Record<string, string>;
const src = sources['./pixiScene.ts'] ?? '';
const ngf = sources['./newGunsFx.ts'] ?? '';
const pdf = sources['./pileDriverFx.ts'] ?? '';
const wet = sources['./weatherWet.ts'] ?? '';
const types = sources['../types/game.ts'] ?? '';

const bodyOf = (s: string, sig: string): string => {
  const i = s.indexOf(sig);
  if (i < 0) return '';
  let k = s.indexOf('(', i), d = 0;
  for (; k < s.length; k++) { if (s[k] === '(') d++; else if (s[k] === ')') { d--; if (d === 0) break; } }
  let j = s.indexOf('{', k);
  const start = j;
  d = 0;
  for (; j < s.length; j++) {
    if (s.startsWith('//', j)) { j = s.indexOf('\n', j); continue; }
    const c = s[j];
    if (c === "'" || c === '"' || c === '`') { const q = c; j++; while (j < s.length && s[j] !== q) { if (s[j] === '\\') j++; j++; } continue; }
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return s.slice(start, j + 1); }
  }
  return '';
};

/** 層へ addChild する所の、関数ごとの数(段階3の着手時=HEAD 743ec87 の上で数えた台帳)。足したら台帳へ載せ、型(3-7b)を決めてから数を直す。 */
const LAYER_ADD_LEDGER: Record<string, number> = {
  constructor: 30, makeActor: 2, makeProp: 2, makeGroundFireView: 2, projDecal: 1, syncLabCrawler: 2,
  syncTrees: 2, makeLabWallView: 1, makeLabPropView: 1, tickLabObstacleCrumble: 1, syncCityProps: 2, syncWraithGrowths: 1,
  syncForestFlowers: 1, syncTorchBack: 1, updateLabVisionCones: 1, updateSkillPickMark: 2, updateBoomerangReadyMark: 1, updateGoldRingReadyMark: 1,
  syncHitboxDebug: 1, syncEggArmBlinks: 2, drawBrawlerAir: 2, updateBenkeiReadyMark: 1, syncSkadiHazards: 1, syncSurielRing: 1,
  syncGoldRings: 1, syncIceLanceFloors: 3, syncIceLanceBolts: 1, syncEyeLaser: 1, syncPhantomFlamer: 1, syncPlayerBurn: 3,
  drawFlamerStreaks: 1, syncAcrasielSpears: 2, syncLibertyArrows: 2, syncAstroThrows: 3, astroGroundArtLayer: 1, syncPlayerArrowRain: 2,
  syncGroundFireKids: 2, syncBloodSpikes: 1, syncBossFires: 2, syncSensorMines: 1, syncRescueAllies: 2, syncThrownBags: 1,
  syncGhostDeathPose: 1, syncHeroDogDeathPose: 1, drawGhostAlly: 4, drawGhostMuzzleFlash: 1, drawKillFxSlash: 4, drawKillFxText: 1,
  stepKamitsukiFx: 2, stepKillFxBlood: 1, drawPlayer: 3, drawCloneSlot: 5, drawEnemy: 4, drawWarpCircle: 1,
  syncProjectiles: 1, drawPlantSeed: 1, boltFxSprite: 1, syncDecoys: 1, syncFireKnives: 1, syncPhantomTurretTelegraphs: 1,
  syncTurrets: 1, syncSkateboards: 1, syncDroneBoomerangs: 1, applyPoiTouchFx: 1, syncSecretPois: 1, syncShrines: 2,
  drawBaseSoldiers: 1, drawEscorts: 2, drawEscortMelee: 1, updateEscortFlash: 1, drawEndingSoldiers: 1, drawEndingPhill: 1,
  syncSignalBombs: 1, drawEndingBombs: 2, drawEndingFallenSoldiers: 2, drawSupportSniper: 1, drawJormRain: 2, drawMuzzleFlash: 1,
  drawBossGunMuzzle: 1, drawBloodPool: 1, drawRunDust: 1, drawDust: 1, drawGroundCrack: 1, drawRescueSurvivors: 1,
  syncShields: 1, syncShieldGhosts: 1, syncLab: 2, syncPickups: 1, drawParticleSprite: 1, drawRingSprite: 1,
  drawTrailSprite: 1, drawExplosionSprite: 1, drawDrainSprite: 1, syncGravityWells: 1, drawSmokeSprite: 1, drawSmallGlowSprite: 1,
  drawStrongGlowSprite: 1, drawWhipSnareSprite: 1, drawWhipRope: 1, drawWhipSprite: 1, drawFireJetSprite: 1, drawBloodSprite: 1,
  drawSlashSprite: 1, drawSurielSweepStreak: 1, drawThorTsukiCharge: 1, drawThorIaiCharge: 1, drawJibrilLantern: 1, drawHoloVolleyCircle: 1,
  drawHoloMiniAt: 1, syncSheetTipGlow: 1, tickHeroLeftFog: 1, drawLibertyRaise: 1, drawScreamBuffMark: 1, drawHeroAscend: 2,
  syncWraithTelegraph: 1, shatterAlchemyRocks: 1, drawGuardianPhantom: 4, drawBountySummonCircle: 1, drawSkelClawSprite: 1, drawCoffinSlam: 1,
  drawBatSlam: 1, drawBountyWeapon: 1, drawBountyWhipRope: 1, drawBountyScissors: 1, drawBountyWhipSmear: 2, drawBountyWhip360Arc: 1,
  triggerBountyScissorFlashOnce: 1, triggerBountySlashArcOnce: 1, ensurePetalPool: 1, triggerMaikoBallDrop: 1, spawnMaikoTrailPuff: 1, drawAngelEyeReady: 1,
  drawDogFetchSprite: 1, drawDamageNumber: 1, drawCalloutWithBg: 1, drawDamageNumberBitmap: 1, drawDamageNumberOutlined: 1, drawMultiHitBanner: 1,
  drawSkillBurstSprite: 1, drawMeleeHitSprite: 1, drawBloodBurstSprite: 2, drawBrawlerKiko: 2, syncAreaBoundaryTape: 1, syncPlayerFx: 1,
};

describe('投影の段階3: 点で出る演出(番人)', () => {
  it('ソースを読めている', () => {
    expect(src.length).toBeGreaterThan(100000);
    expect(types.length).toBeGreaterThan(1000);
  });

  it('① VisualEffect の kind と台帳の表(PROJ_FX_KINDS)が一致する(flash は外)', () => {
    const i = types.indexOf('export type VisualEffect =');
    const j = types.indexOf('\nexport ', i + 10);
    const block = types.slice(i, j);
    const kinds = new Set([...block.matchAll(/^\s{6}kind: '(\w+)';/gm)].map(m => m[1]));
    expect(kinds.size).toBeGreaterThan(15);
    expect(new Set(Object.keys(PROJ_FX_KINDS))).toEqual(kinds);
    expect(PROJ_FX_ROWS[PROJ_FX_KINDS.flash].type).toBe('exempt');
    // syncEffects の分岐の後に段階3の写しが1回だけ・?proj=1 の時だけ
    const se = bodyOf(src, '  private syncEffects(');
    expect(se).toContain('if (this.projFrame) this.projFxEffect(e);');
    expect(se).toContain('this.projFrame ? this.projFxNear(e) : this.effectNearViewport(e, camera)');
    const fe = bodyOf(src, '  private projFxEffect(');
    for (const k of kinds) if (k !== 'flash') expect(fe.includes(`case '${k}'`), k).toBe(true);
  });

  it('② 層へ addChild する所は、関数ごとの数の台帳に載っている(増えたら落ちる)', () => {
    const got = new Map<string, number>(); // Map=「constructor」等の名前が Object の持ち物とぶつからない
    let cur = '(top)';
    for (const l of src.split('\n')) {
      const m = /^ {2}(?:private |public |protected |static |readonly )*(?:async )?(\w+)\s*(?:<[^>]*>)?\(/.exec(l);
      if (m && !/^\s*(if|for|while|switch|return)\b/.test(l.trim())) cur = m[1];
      if (/^\s*(\/\/|\*)/.test(l)) continue;
      const n = (l.match(/this\.L\.(?:effectLayer|frontObjectLayer|groundLayer|actorLayer)\.addChild(?:At)?\(/g) ?? []).length;
      if (n > 0) got.set(cur, (got.get(cur) ?? 0) + n);
    }
    expect(Object.fromEntries(got)).toEqual(LAYER_ADD_LEDGER);
  });

  it('③ 旧い遠近の倍率は ?proj の分岐で外している(演出の大きさに二重に掛けない)', () => {
    expect(bodyOf(src, '  private drawRunDust(')).toContain("if (this.projFrame) this.projFxAt(sp, x, y, 'fx', 0, dsc);");
    expect(bodyOf(src, '  private drawDust(')).toContain("if (this.projFrame) this.projFxAt(sp, x, y, 'fx');");
    expect(bodyOf(src, '  private projFxBloodBurst(')).toContain('/ Math.max(1e-6, d.ds)');
    expect(bodyOf(src, '  private syncWorldEmbers(')).toContain('eq ? projFxScale(eq.s) : this.depthScale(f.y)');
    expect(bodyOf(src, '  private syncMagicFireflies(')).toContain('fq ? fq.s : this.depthScale(f.y)'); // 蛍は奥の下限を外す(CR-6)
    expect(bodyOf(src, '  private syncMoonDust(')).toContain('MOON_DUST_PX * projFxScale(q.s)');
    expect(bodyOf(src, '  private projBullet(')).toContain('g.scale.set(kb); // 設置物の depthD は外す');
    expect(ngf).toContain('const ds = pq ? 1 : depthEnemy(fb.footY);');
    expect(wet).toContain('DEBRIS_ART_SCALE * ks * r.s * pose.scale'); // 波紋: 旧い depthScale を外して s(天井つき・CR-7)
    expect(wet).toContain('d.sp.width = RAIN_WIDTH * kf;');
    expect(pdf).toContain('projF: ProjFrame | null = null');
    // 別ファイルの sync へ投影の枠を渡している(null=今の描き方)
    expect(src).toContain('fy => this.depthScaleEnemy(fy), this.projFrame)');
    expect(src).toContain('.sync(s.projectiles, s.player, s.enemies, now, this.projFrame)');
  });

  it('④ 段階3は赤い予告に触れない', () => {
    for (const [k, r] of Object.entries(PROJ_ACTOR_ROLES)) if (r === 'telegraph') expect(projRoleMove(r), k).toBe('none');
    for (const sig of ['  private projFxEffect(', '  private projFxNear(', '  private projBullet(', '  private projFxAt(', '  private projFxDir(', '  private projFxSeg(',
      '  private projFxOrigin(', '  private projFxHud(', '  private projStage3AuditFrame(']) {
      const b = bodyOf(src, sig);
      expect(b.length, sig).toBeGreaterThan(50);
      expect(/meteorPhase|drawSweep|drawTelegraph|view\.tele\b/.test(b), sig).toBe(false);
    }
    // スキャンの扇(★#29=A): 描く扇は判定と同じ点(scanFanScreenPoint=0.36 の潰し・中心角 scanFanGroundAngle)を頂点ごとに投影する
    const fan = bodyOf(ngf, '  private drawFan(');
    expect(fan).toContain('const base = scanFanGroundAngle(fan.dirX, fan.dirY);');
    expect(fan).toContain('projPoly(g, pf, [pcx, pcy, ...body]');
  });

  it('段階3の後半: 判定と一致する輪の印・殺陣は後掛けの後・数字は敵の足元・体の飾りは後掛けで写す', () => {
    // 輪: 印(e.judge)のある輪は投影そのまま(半径の倍率 1)・印の無い輪だけ閃光の輪
    expect(bodyOf(src, '  private drawRingSprite(')).toContain('const mul = e.judge ? 1 : projFxRingRadiusMul(');
    expect(types).toContain('judge?: boolean;');
    // 殺陣(C11): ?proj=1 は後掛け(と計器)の後に呼ぶ=影の1フレーム遅れを直す
    const sync = bodyOf(src, '  sync(');
    const a = sync.indexOf('this.projActorPostPass();'), b = sync.indexOf('if (this.projFrame) this.syncSatsujin(');
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(sync).toContain('if (!this.projFrame) this.syncSatsujin(');
    // 数字(A1): 当てた敵の足元がある数字は体の相似で置く
    expect(bodyOf(src, '  private projFxEffect(')).toContain('this.projFxHudOnFoot(view, e.x, e.y, e.footX, e.footY)');
    // 体の飾り(D): 後掛け projPostView の中で、記録した命令の範囲を本体と同じ相似で写す
    expect(bodyOf(src, '  private projPostView(')).toContain('projSimFrom(r.g, r.n0, fx, fy, px, py, k, k, 1, r.n1)');
    // 杭(B11=両): 杭ごとに根元=体・先=投影のアフィンで写す
    expect(bodyOf(pdf, '  private projStake(')).toContain('projAffineFrom(pen.body');
  });

  it('⑤ drawPlantSeed は drawProjectile と projBullet の後に位置を写す', () => {
    const sp = bodyOf(src, '  private syncProjectiles(');
    const a = sp.indexOf('this.drawProjectile(g, p);'), b = sp.indexOf('this.projBullet(g, p);'), c = sp.indexOf('this.drawPlantSeed(g, p);');
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(bodyOf(src, '  private drawPlantSeed(')).toContain('sp.position.copyFrom(g.position);');
  });
});
