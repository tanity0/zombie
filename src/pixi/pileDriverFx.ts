// パイルドライバー(handgun-t3-piledriver)の弾の絵(社長指示2026-11-13「もっとパイルドライバーっぽく」+「銃の絵は出ないので弾の挙動だけで」・
// 同日クリエイティブ監査の8点を反映)。
// ★描くだけ。判定は既存の弾(store の projectiles)のまま。弾・敵・刺さった記録(utils/pileHitLog)を読むだけで store を書かない。
//   形: 撃ち手の手元の筒(排気口つき)→ ピストンの胴(細い棒・紫の溝)→ 太く短い杭(つば+円錐の先=武器の絵の先に寄せる)。
//       色は鋼の灰が主。紫は溝・排気口・面の筋の差し色と、杭の後ろへ流れる尾だけ(先端に光の玉は付けない)。
//   1. 撃った瞬間: 最初の2フレーム(PILE_SNAP_MS)で、射線上の敵の手前(居なければ射程の手前)まで一気に伸びてガンと止まる。
//      残りは弾の到達を待つ(弾の位置+弾の半径までしか伸びない=判定は弾のまま)。手元の筒は撃った向きの逆へ蹴られて慣性で戻る。
//   2. 当たった瞬間: 先は当たった所で切る(食い込んだ分は敵の体の中=描かない)。杭と火花・衝撃だけを PILE_FREEZE_MS 止める
//      (画面全体のヒットストップはしない)。衝撃は撃った向きへずらした扁平な楕円2重+敵の背中側へ抜ける破片。
//   3. 当たった後: 戻りは非対称。最初にカシュッと一段引き(PILE_KICKBACK_MS で戻りの PILE_KICKBACK_FRAC)、残りを引きずる。
//      引いた瞬間に筒の両脇の排気口から蒸気が短く鋭く噴いてから広がる。
//   4. 外れた時: 射程の端まで伸び切ってガクッと止まり(小さく跳ね返る)、先で小さな火花。
//   前後関係: 上へ撃った杭は自分の体の後ろ(アクターの層で自分の足元Yのすぐ奥)、それ以外は手前。
//   杭の根元は毎フレームのプレイヤーの体の中心に付く(動いても離れない)。
// 2分類(CLAUDE.md): 杭は自分の弾(敵の危険を伝える絵ではない)。火花・衝撃・破片・蒸気は派手さの絵。
// 負荷: 杭は同時に最大 PILE_MAX 本(実際は1〜2本)、Graphics を毎フレーム描き直す(1本あたり約30図形)。衝撃は最大 IMPACT_MAX 件
// (1件あたり線・多角形約30)。蒸気は pooled sprite STEAM_MAX 枚。強glow・投影影・フィルタは使わない。
import { Container, Graphics, Sprite } from 'pixi.js';
import type { Enemy, Player, Projectile } from '../types/game';
import { PILEDRIVER_WEAPON_KEY, piledriverRangePx } from '../utils/weaponUtils';
import { getSoftGlowTexture } from './lighting';
import { getPileHitLog } from '../utils/pileHitLog';

/** 伸び: 最初の2フレームで止まる所まで届く。止まる所=射線上の敵の手前 PILE_SNAP_SHORT_PX(居なければ射程の手前)。 */
export const PILE_SNAP_MS = 34;
const PILE_SNAP_SHORT_PX = 8;
/** 弾の半径(弾の中心からこの分だけ先までは杭が出てよい=弾の当たりの縁)。 */
const PILE_BULLET_HALF_PX = 6;
/** 当たった瞬間に杭・火花・衝撃だけを止める尺(約3フレーム)。 */
export const PILE_FREEZE_MS = 45;
/** 止めた後、縮み始めるまで(食い込んだまま)。 */
export const PILE_HIT_HOLD_MS = 70;
/** 先が当たった所から敵の体の中へ入っている深さ(見えない)。 */
const PILE_BURY_PX = 12;
/** 当たった後に縮み切るまで / そのうち最初の一段引き。 */
export const PILE_HIT_RETRACT_MS = 360;
export const PILE_KICKBACK_MS = 60;
const PILE_KICKBACK_FRAC = 0.35;
/** 外れ: 伸び切ってから縮み始めるまで(ガクッと止まって小さく跳ね返る) / 縮み切るまで。 */
export const PILE_MISS_HOLD_MS = 60;
export const PILE_MISS_RETRACT_MS = 240;
const PILE_MISS_BOUNCE_PX = 5;
/** 手元の筒の反動(撃った向きの逆へ蹴られて戻る)。 */
const PILE_RECOIL_PX = 7;
const PILE_RECOIL_IN_MS = 25;
const PILE_RECOIL_OUT_MS = 220;
/** 根元(筒)を体の中心から前へずらす量。 */
const PILE_BASE_OFFSET_PX = 8;
// 寸法(world px)。
const HOUSING_BACK = 8, HOUSING_FRONT = 4, HOUSING_HW = 6.5;
const ROD_HW = 3.5;
const CONE_LEN = 22, CONE_HW = 9.5;
const COLLAR_LEN = 5, COLLAR_HW = 11;
const NECK_LEN = 10, NECK_HW = 7;
/** 杭の頭(首+つば+円錐)の長さ。 */
const HEAD_LEN = CONE_LEN + COLLAR_LEN + NECK_LEN;
const PILE_MAX = 4;
const IMPACT_MAX = 4;
const STEAM_MAX = 16;
const STEAM_MS = 620;

const STEEL = 0x6c717b;
const STEEL_HI = 0xc8ccd4;
const STEEL_MID = 0x8f949d;
const STEEL_DARK = 0x2b2e34;
const STEEL_DEEP = 0x1c1e22;
const PURPLE = 0x9b4dff;
const PURPLE_HOT = 0xd9b8ff;
const SPARK_HOT = 0xfff6dc;
const SPARK_WARM = 0xffd27a;
const STEAM = 0xe4e1ea;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);
const easeOutQuart = (t: number): number => 1 - Math.pow(1 - clamp01(t), 4);
const easeInOutQuad = (t: number): number => { const c = clamp01(t); return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2; };
/** 戻りの進み(0..1): 最初にカシュッと一段(PILE_KICKBACK_FRAC まで速く)、残りを引きずる。 */
export const pileRetractFrac = (t: number, totalMs: number): number => {
  if (t <= PILE_KICKBACK_MS) return PILE_KICKBACK_FRAC * easeOutQuart(t / PILE_KICKBACK_MS);
  return PILE_KICKBACK_FRAC + (1 - PILE_KICKBACK_FRAC) * easeInOutQuad((t - PILE_KICKBACK_MS) / Math.max(1, totalMs - PILE_KICKBACK_MS));
};
/** 撃ってからの手元の筒の反動(px・撃った向きの逆)。 */
const recoilPx = (t: number): number => {
  if (t < 0) return 0;
  if (t < PILE_RECOIL_IN_MS) return PILE_RECOIL_PX * easeOutCubic(t / PILE_RECOIL_IN_MS);
  return PILE_RECOIL_PX * (1 - easeOutCubic((t - PILE_RECOIL_IN_MS) / PILE_RECOIL_OUT_MS));
};
const hash01 = (n: number): number => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** 射線(原点 ox,oy・向き ux,uy)が敵の箱へ入る距離(maxD 以内で最も近いもの)。無ければ null。 */
const rayEnemyEntry = (ox: number, oy: number, ux: number, uy: number, maxD: number, enemies: readonly Enemy[]): number | null => {
  let best: number | null = null;
  for (const e of enemies) {
    if (e.health <= 0) continue;
    let t0 = 0, t1 = maxD;
    const axes: [number, number, number, number][] = [[ox, ux, e.x - PILE_BULLET_HALF_PX, e.x + e.width + PILE_BULLET_HALF_PX], [oy, uy, e.y - PILE_BULLET_HALF_PX, e.y + e.height + PILE_BULLET_HALF_PX]];
    let ok = true;
    for (const [o, d, lo, hi] of axes) {
      if (Math.abs(d) < 1e-6) { if (o < lo || o > hi) { ok = false; break; } continue; }
      let a = (lo - o) / d, b = (hi - o) / d;
      if (a > b) { const tmp = a; a = b; b = tmp; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 > t1) { ok = false; break; }
    }
    if (ok && (best === null || t0 < best)) best = t0;
  }
  return best;
};

interface PileView {
  dirX: number; dirY: number;
  firedAt: number;
  phase: 'extend' | 'freeze' | 'hold' | 'retract';
  hit: boolean;
  phaseAt: number;
  /** 根元からの先の距離(切る前)。 */
  len: number;
  /** 最初の2フレームで届く所。 */
  snapLen: number;
  /** 弾が消えて刺さった所が分かった(伸び切り=snap が終わるのを待って止める)。 */
  pinned: boolean;
  pinX: number; pinY: number;
  /** 戻り始めの先の距離(外れ)。 */
  fromLen: number;
  steamAt: number;
  steamSide: number;
}
interface Impact { x: number; y: number; ux: number; uy: number; at: number; freezeUntil: number; seed: number; miss: boolean }
interface SteamPuff { x: number; y: number; vx: number; vy: number; at: number; w: number }
interface Jet { x: number; y: number; dx: number; dy: number; at: number; len: number }

interface Pen { glow: Graphics; body: Graphics; holder: Container }

export class PileDriverFx {
  /** 上へ撃った杭(自分の体の奥)と、それ以外(手前)。どちらもアクターの層で自分の足元Yに並べる。 */
  private readonly back: Pen;
  private readonly front: Pen;
  private readonly fxg = new Graphics();
  private readonly fxAdd = new Graphics();
  private readonly steamLayer = new Container();
  private readonly views = new Map<string, PileView>();
  /** 杭は戻り切ったが弾はまだ飛んでいる(外れ)id。同じ弾から杭を出し直さない。 */
  private readonly finished = new Set<string>();
  /** 読み終えた刺さった記録の id。 */
  private readonly notesDone = new Set<string>();
  private readonly impacts: Impact[] = [];
  private readonly steamPool: Sprite[] = [];
  private readonly puffs: SteamPuff[] = [];
  private readonly jets: Jet[] = [];
  private seedN = 1;

  constructor(actorLayer: Container, effectLayer: Container) {
    const mk = (): Pen => {
      const holder = new Container();
      const glow = new Graphics(); glow.blendMode = 'add';
      const body = new Graphics();
      holder.addChild(glow, body); // 紫の尾は鋼の下(鋼が主役)
      actorLayer.addChild(holder);
      return { glow, body, holder };
    };
    this.back = mk();
    this.front = mk();
    this.fxAdd.blendMode = 'add';
    effectLayer.addChild(this.steamLayer, this.fxg, this.fxAdd);
  }

  /** 丸い弾を描かない対象(pixiScene.syncProjectiles / 地面の映り込みが読む)。 */
  static owns(p: Projectile): boolean {
    return p.weaponKey === PILEDRIVER_WEAPON_KEY && !p.hostile && !p.reflected;
  }

  sync(projectiles: readonly Projectile[], player: Player, enemies: readonly Enemy[], now: number): void {
    for (const pen of [this.back, this.front]) { pen.glow.clear(); pen.body.clear(); }
    this.fxg.clear(); this.fxAdd.clear();
    const footY = player.y + player.height;
    this.back.holder.zIndex = footY - 0.5;
    this.front.holder.zIndex = footY + 0.5;
    const cap = piledriverRangePx();
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const baseOf = (v: { dirX: number; dirY: number }) => ({ x: pcx + v.dirX * PILE_BASE_OFFSET_PX, y: pcy + v.dirY * PILE_BASE_OFFSET_PX });
    const notes = getPileHitLog();
    const noteOf = (id: string) => notes.find(n => n.id === id);
    const newView = (id: string, ux: number, uy: number, ox: number, oy: number): PileView => {
      const entry = rayEnemyEntry(ox, oy, ux, uy, cap, enemies);
      const stop = entry === null ? cap : Math.min(cap, entry + PILE_BULLET_HALF_PX);
      const v: PileView = {
        dirX: ux, dirY: uy, firedAt: now, phase: 'extend', hit: false, phaseAt: now, len: 0,
        snapLen: Math.max(HEAD_LEN * 0.6, stop - PILE_SNAP_SHORT_PX), pinned: false, pinX: 0, pinY: 0, fromLen: 0, steamAt: 0, steamSide: 1,
      };
      this.views.set(id, v);
      return v;
    };
    const seen = new Set<string>();
    for (const p of projectiles) {
      if (!PileDriverFx.owns(p) || p.createdAt > now) continue;
      seen.add(p.id);
      if (this.finished.has(p.id)) continue;
      let v = this.views.get(p.id);
      const ox = (p.originX ?? p.x) + p.width / 2, oy = (p.originY ?? p.y) + p.height / 2;
      if (!v) {
        if (this.views.size >= PILE_MAX) continue;
        const dl = Math.hypot(p.direction.x, p.direction.y) || 1;
        v = newView(p.id, p.direction.x / dl, p.direction.y / dl, ox, oy);
      }
      if (v.phase !== 'extend') continue; // 外れて伸び切った後も弾は飛び続ける(判定はそのまま)が、杭はもう戻っている
      const traveled = Math.hypot(p.x + p.width / 2 - ox, p.y + p.height / 2 - oy);
      const snap = v.snapLen * easeOutQuart((now - v.firedAt) / PILE_SNAP_MS);
      v.len = Math.min(cap, Math.max(snap, traveled + PILE_BULLET_HALF_PX));
      if (traveled >= cap) {
        v.len = cap; v.phase = 'hold'; v.hit = false; v.phaseAt = now;
        const b = baseOf(v);
        this.pushImpact(b.x + v.dirX * cap, b.y + v.dirY * cap, v.dirX, v.dirY, now, true);
      }
    }
    // 至近で弾が1度も見えずに刺さった(作られた tick で当たって消えた)弾: 刺さった記録から杭を起こす(伸びは同じ2フレーム)。
    for (const n of notes) {
      if (this.notesDone.has(n.id)) continue;
      this.notesDone.add(n.id);
      if (this.views.has(n.id) || this.finished.has(n.id) || seen.has(n.id) || now - n.at > 200 || this.views.size >= PILE_MAX) continue;
      const b = baseOf(n);
      const v = newView(n.id, n.dirX, n.dirY, b.x, b.y);
      v.pinned = true; v.pinX = n.x + n.dirX * PILE_BULLET_HALF_PX; v.pinY = n.y + n.dirY * PILE_BULLET_HALF_PX;
      v.snapLen = Math.max(HEAD_LEN * 0.6, (v.pinX - b.x) * n.dirX + (v.pinY - b.y) * n.dirY);
    }
    for (const id of this.notesDone) if (!notes.some(n => n.id === id)) this.notesDone.delete(id);
    // 弾が伸びている途中で消えた=当たった(敵・壁・盾など)。刺さった所を決め、2フレームの伸びが済んだら止める。
    for (const [id, v] of this.views) {
      if (v.phase !== 'extend') continue;
      if (!v.pinned && !seen.has(id)) {
        v.pinned = true;
        const n = noteOf(id);
        const b = baseOf(v);
        if (n) { v.pinX = n.x + n.dirX * PILE_BULLET_HALF_PX; v.pinY = n.y + n.dirY * PILE_BULLET_HALF_PX; }
        else { v.pinX = b.x + v.dirX * v.len; v.pinY = b.y + v.dirY * v.len; }
      }
      if (v.pinned) {
        const b = baseOf(v);
        const pinD = Math.max(1, (v.pinX - b.x) * v.dirX + (v.pinY - b.y) * v.dirY);
        const k = (now - v.firedAt) / PILE_SNAP_MS;
        v.len = Math.min(pinD, Math.max(v.len, v.snapLen * easeOutQuart(k)));
        if (k >= 1 || v.len >= pinD - 0.5) {
          v.phase = 'freeze'; v.hit = true; v.phaseAt = now;
          this.pushImpact(v.pinX, v.pinY, v.dirX, v.dirY, now, false);
        }
      }
    }
    for (const [id, v] of this.views) {
      if (this.drawPile(v, pcx, pcy, now)) continue;
      this.views.delete(id);
      if (seen.has(id)) this.finished.add(id);
    }
    for (const id of this.finished) if (!seen.has(id)) this.finished.delete(id);
    this.drawImpacts(now);
    this.drawJets(now);
    this.drawSteam(now);
  }

  private pushImpact(x: number, y: number, ux: number, uy: number, now: number, miss: boolean): void {
    if (this.impacts.length >= IMPACT_MAX) this.impacts.shift();
    this.impacts.push({ x, y, ux, uy, at: now, freezeUntil: miss ? now : now + PILE_FREEZE_MS, seed: this.seedN++, miss });
  }

  /** 1本描く。描き終わった(縮み切った)ら false。 */
  private drawPile(v: PileView, pcx: number, pcy: number, now: number): boolean {
    const bx = pcx + v.dirX * PILE_BASE_OFFSET_PX, by = pcy + v.dirY * PILE_BASE_OFFSET_PX;
    let t = now - v.phaseAt;
    if (v.phase === 'freeze' && t >= PILE_FREEZE_MS) { v.phase = 'hold'; v.phaseAt += PILE_FREEZE_MS; t = now - v.phaseAt; }
    const holdMs = v.hit ? PILE_HIT_HOLD_MS : PILE_MISS_HOLD_MS;
    if (v.phase === 'hold' && t >= holdMs) {
      v.phase = 'retract'; v.phaseAt += holdMs; t = now - v.phaseAt;
      v.fromLen = v.len;
      this.ventSteam(bx, by, v, now, v.hit ? 3 : 1, v.hit ? 1 : 0.6); // カシュッ: 筒の両脇から短く鋭く
      v.steamAt = now;
    }
    const retractMs = v.hit ? PILE_HIT_RETRACT_MS : PILE_MISS_RETRACT_MS;
    if (v.phase === 'retract' && t >= retractMs) return false;

    // 軸: 刺さった後は根元→刺さった所(プレイヤーが動いても先は刺さったまま)。
    let ux = v.dirX, uy = v.dirY, tipD = v.len, clipD = Infinity;
    if (v.hit) {
      const dx = v.pinX - bx, dy = v.pinY - by;
      const pinD = Math.max(1, Math.hypot(dx, dy));
      ux = dx / pinD; uy = dy / pinD;
      clipD = pinD;
      if (v.phase === 'freeze' || v.phase === 'hold') tipD = pinD + PILE_BURY_PX;
      else tipD = (pinD + PILE_BURY_PX) * (1 - pileRetractFrac(t, retractMs));
      if (v.phase === 'retract' && now - v.steamAt >= 110 && t > PILE_KICKBACK_MS) { // 引きずる間も細く漏れる
        this.ventSteam(bx, by, v, now, 1, 0.45); v.steamAt = now;
      }
    } else if (v.phase === 'hold') {
      tipD = v.len - PILE_MISS_BOUNCE_PX * Math.sin(Math.PI * clamp01(t / PILE_MISS_HOLD_MS)); // ガクッと止まって小さく跳ね返る
    } else if (v.phase === 'retract') {
      tipD = v.fromLen * (1 - pileRetractFrac(t, retractMs));
    }
    // 尾(紫): 伸びの2フレームとその直後だけ、杭の頭の後ろへ流れる。
    const sinceFire = now - v.firedAt;
    const trail = v.phase === 'extend' || (v.phase === 'freeze') ? clamp01(1 - (sinceFire - PILE_SNAP_MS) / 120) : 0;
    const pen = uy < -0.2 ? this.back : this.front;
    this.drawStake(pen, bx, by, ux, uy, tipD, clipD, recoilPx(sinceFire), trail);
    return true;
  }

  private drawStake(pen: Pen, bx: number, by: number, ux: number, uy: number, tipD: number, clipD: number, recoil: number, trail: number): void {
    const b = pen.body, gl = pen.glow;
    const nx = -uy, ny = ux;
    const P = (d: number, s: number): [number, number] => [bx + ux * d + nx * s, by + uy * d + ny * s];
    /** 軸の d0..d1 を幅 hw0..hw1 で塗る(clipD より先は描かない)。side: 1=上半分/-1=下半分/0=全幅。 */
    const band = (d0: number, d1: number, hw0: number, hw1: number, color: number, alpha = 1, side = 0, g: Graphics = b) => {
      if (d1 <= d0) return;
      const e1 = Math.min(d1, clipD);
      if (e1 <= d0) return;
      const hwE = hw0 + (hw1 - hw0) * ((e1 - d0) / (d1 - d0));
      const top0 = side >= 0 ? hw0 : 0, top1 = side >= 0 ? hwE : 0;
      const bot0 = side <= 0 ? -hw0 : 0, bot1 = side <= 0 ? -hwE : 0;
      g.poly([...P(d0, top0), ...P(e1, top1), ...P(e1, bot1), ...P(d0, bot0)]).fill({ color, alpha });
    };
    const line = (d0: number, d1: number, s: number, width: number, color: number, alpha: number, g: Graphics = b) => {
      const e1 = Math.min(d1, clipD);
      if (e1 <= d0) return;
      g.moveTo(...P(d0, s)).lineTo(...P(e1, s)).stroke({ width, color, alpha });
    };
    const hb = -HOUSING_BACK - recoil, hf = HOUSING_FRONT - recoil; // 筒(反動で後ろへ)
    const coneB = tipD - CONE_LEN, collarB = coneB - COLLAR_LEN, neckB = collarB - NECK_LEN;
    // 紫の尾(加算・鋼の下): 頭の後ろへ流れる。
    if (trail > 0.01) {
      const tl = Math.min(Math.max(0, neckB - hf), 60) * trail;
      gl.moveTo(...P(neckB - tl, 0)).lineTo(...P(neckB + 4, 0)).stroke({ width: 13, color: PURPLE, alpha: 0.32 * trail });
      gl.moveTo(...P(neckB - tl * 0.6, 0)).lineTo(...P(neckB + 4, 0)).stroke({ width: 4, color: PURPLE_HOT, alpha: 0.55 * trail });
    }
    // ピストンの胴(筒から頭まで)。
    band(hf - 1, neckB + 1, ROD_HW, ROD_HW, STEEL_DARK);
    band(hf - 1, neckB + 1, ROD_HW - 1, ROD_HW - 1, STEEL, 1, 1);
    line(hf, neckB, ROD_HW - 1.2, 1.2, STEEL_HI, 0.85);
    line(hf + 2, neckB - 1, 0, 1, PURPLE, 0.7); // 紫の溝(差し色)
    // 杭の頭: 首 → つば(張り出し)→ 円錐の先(上の面を明るく・下の面を暗く・面の境に紫の筋)。
    band(neckB, collarB, NECK_HW, NECK_HW + 1, STEEL);
    line(neckB, collarB, NECK_HW - 1.2, 1.2, STEEL_HI, 0.9);
    band(neckB + 2, neckB + 4, NECK_HW + 0.6, NECK_HW + 0.6, STEEL_DEEP);
    band(collarB, coneB, COLLAR_HW, COLLAR_HW, STEEL_DARK);
    band(collarB + 1, coneB - 1, COLLAR_HW - 1, COLLAR_HW - 1, STEEL);
    line(collarB + 1, coneB - 1, COLLAR_HW - 2, 1.4, STEEL_HI, 0.95);
    band(coneB, tipD, CONE_HW, 0, STEEL_HI, 1, 1);
    band(coneB, tipD, CONE_HW, 0, STEEL, 1, -1);
    band(coneB, tipD, CONE_HW * 0.45, 0, STEEL_DARK, 0.9, -1);
    line(coneB + 1, tipD - 3, 0.3, 1.1, PURPLE, 0.8);
    // 手元の筒(排気口つき)。
    band(hb, hf, HOUSING_HW, HOUSING_HW, STEEL_DEEP);
    band(hb + 1, hf - 1, HOUSING_HW - 1.5, HOUSING_HW - 1.5, STEEL_DARK);
    line(hb + 1, hf - 1, HOUSING_HW - 2.5, 1.3, STEEL_MID, 0.9);
    for (const s of [1, -1]) { // 両脇の排気口(蒸気の出どころ)
      b.poly([...P(hb + 3, s * (HOUSING_HW - 1)), ...P(hb + 7, s * (HOUSING_HW - 1)), ...P(hb + 7, s * (HOUSING_HW - 2.6)), ...P(hb + 3, s * (HOUSING_HW - 2.6))]).fill({ color: PURPLE, alpha: 0.85 });
    }
  }

  /** 筒の両脇の排気口から蒸気を噴く(短く鋭い筋+その先で広がる玉)。 */
  private ventSteam(bx: number, by: number, v: PileView, now: number, n: number, power: number): void {
    const ux = v.dirX, uy = v.dirY, nx = -uy, ny = ux;
    const sides = n >= 2 ? [1, -1] : [v.steamSide];
    v.steamSide = -v.steamSide;
    for (const s of sides) {
      const vx = bx - ux * (HOUSING_BACK - 5) + nx * s * HOUSING_HW, vy = by - uy * (HOUSING_BACK - 5) + ny * s * HOUSING_HW;
      // 横へ、少し後ろへ。
      const dx = nx * s - ux * 0.35, dy = ny * s - uy * 0.35;
      const dl = Math.hypot(dx, dy) || 1;
      this.jets.push({ x: vx, y: vy, dx: dx / dl, dy: dy / dl, at: now, len: 20 * power });
      if (this.jets.length > 8) this.jets.shift();
      const k = n;
      for (let i = 0; i < k; i++) {
        if (this.puffs.length >= STEAM_MAX) this.puffs.shift();
        const sp = (90 + Math.random() * 70) * power;
        const j = (Math.random() - 0.5) * 0.5; // 噴く向きを少しずつ散らす(玉が一列に並ばない)
        const ddx = dx / dl + ux * j, ddy = dy / dl + uy * j;
        this.puffs.push({ x: vx + dx / dl * 5, y: vy + dy / dl * 5, vx: ddx * sp, vy: ddy * sp - 12, at: now + i * 22, w: 5 + Math.random() * 4 });
      }
    }
  }

  private drawJets(now: number): void {
    const g = this.fxg;
    for (let i = this.jets.length - 1; i >= 0; i--) {
      const j = this.jets[i];
      const t = (now - j.at) / 110;
      if (t >= 1) { this.jets.splice(i, 1); continue; }
      const grow = easeOutQuart(t / 0.35);
      const a = 0.85 * (1 - t * t);
      const l = j.len * grow;
      const s0 = l * clamp01((t - 0.35) / 0.65); // 後半は根元が抜けて先へ飛ぶ
      g.moveTo(j.x + j.dx * s0, j.y + j.dy * s0).lineTo(j.x + j.dx * l, j.y + j.dy * l).stroke({ width: 3, color: STEAM, alpha: a });
      g.moveTo(j.x + j.dx * s0, j.y + j.dy * s0).lineTo(j.x + j.dx * l * 0.7, j.y + j.dy * l * 0.7).stroke({ width: 1.3, color: 0xffffff, alpha: a });
    }
  }

  private drawSteam(now: number): void {
    const tex = getSoftGlowTexture();
    let used = 0;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const pf = this.puffs[i];
      const t = (now - pf.at) / STEAM_MS;
      if (t >= 1) { this.puffs.splice(i, 1); continue; }
      if (t < 0) continue;
      let sp = this.steamPool[used];
      if (!sp) {
        sp = new Sprite(tex); sp.anchor.set(0.5, 0.5); sp.blendMode = 'normal';
        this.steamLayer.addChild(sp);
        this.steamPool[used] = sp;
      }
      used++;
      // 速く出て急に緩む(移動は ease-out・広がりは移動より遅れて大きく)。
      const move = easeOutQuart(t) * (STEAM_MS / 1000) * 0.45;
      const grow = easeOutCubic(t);
      const w = pf.w + pf.w * 3.4 * grow;
      sp.tint = STEAM;
      sp.position.set(pf.x + pf.vx * move, pf.y + pf.vy * move - 14 * grow);
      sp.width = w; sp.height = w * 0.75;
      sp.alpha = 0.42 * clamp01(t / 0.08) * (1 - t * t);
      sp.visible = true;
    }
    for (let i = used; i < this.steamPool.length; i++) this.steamPool[i].visible = false;
  }

  /** 火花・衝撃の楕円・背中へ抜ける破片(当たり)/ 小さな火花(外れ)。当たりは最初の PILE_FREEZE_MS だけ最初のコマで止まる。 */
  private drawImpacts(now: number): void {
    const g = this.fxg, ga = this.fxAdd;
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const im = this.impacts[i];
      const te = Math.max(0, now - im.freezeUntil) + 18; // 止まっている間は 18ms 目のコマのまま
      const life = im.miss ? 170 : 460;
      if (te >= life) { this.impacts.splice(i, 1); continue; }
      const ux = im.ux, uy = im.uy, nx = -uy, ny = ux;
      const sparkN = im.miss ? 5 : 13;
      const sparkLife = im.miss ? 150 : 260;
      // 火花: 杭の先から撃ち手側と横へ跳ねる(外れは前寄りに少しだけ)。
      if (te < sparkLife) {
        const k = te / sparkLife;
        for (let s = 0; s < sparkN; s++) {
          const h = hash01(im.seed * 31 + s);
          const h2 = hash01(im.seed * 17 + s * 7);
          const spread = im.miss ? (h - 0.5) * 1.6 : Math.PI + (h - 0.5) * 2.6; // 当たり=撃ち手側の半円/外れ=前
          const ca = Math.cos(spread), sa = Math.sin(spread);
          const dx = ux * ca - uy * sa, dy = uy * ca + ux * sa;
          const sp = (im.miss ? 160 : 260) + h2 * (im.miss ? 120 : 300);
          const dist = sp * (sparkLife / 1000) * easeOutCubic(k) * 0.55;
          const fall = 140 * Math.pow(te / 1000, 2) * 4;
          const sx = im.x + dx * dist, sy = im.y + dy * dist + fall;
          const sl = (im.miss ? 5 : 9) * (1 - k) + 1.5;
          const a = 1 - k * k;
          ga.moveTo(sx - dx * sl, sy - dy * sl).lineTo(sx, sy).stroke({ width: im.miss ? 1.4 : 2, color: h2 > 0.5 ? SPARK_HOT : SPARK_WARM, alpha: a });
        }
      }
      if (im.miss) continue;
      // 衝撃: 撃った向きへずらした扁平な楕円(外=紫/内=白)。出始めが速く止まり際で緩む。
      const ring = (dur: number, fwd0: number, fwd1: number, ra0: number, ra1: number, rb0: number, rb1: number, w: number, color: number, alpha: number) => {
        const k = te / dur;
        if (k >= 1) return;
        const e = easeOutQuart(k);
        const cx = im.x + ux * (fwd0 + (fwd1 - fwd0) * e), cy = im.y + uy * (fwd0 + (fwd1 - fwd0) * e);
        const ra = ra0 + (ra1 - ra0) * e, rb = rb0 + (rb1 - rb0) * e;
        const pts: number[] = [];
        for (let q = 0; q < 18; q++) {
          const th = (q / 18) * Math.PI * 2;
          const a = Math.cos(th) * ra, bb = Math.sin(th) * rb;
          pts.push(cx + ux * a + nx * bb, cy + uy * a + ny * bb);
        }
        g.poly(pts, true).stroke({ width: w * (1 - k * 0.7), color, alpha: alpha * (1 - k * k) });
      };
      ring(360, 10, 30, 8, 30, 14, 46, 4, PURPLE, 0.9);
      ring(200, 6, 20, 5, 18, 8, 28, 2.5, 0xf3eefe, 0.95);
      // 破片: 敵の背中側(撃った向き)へ抜けて落ちる鋼の欠片。
      const kd = te / life;
      for (let s = 0; s < 8; s++) {
        const h = hash01(im.seed * 13 + s * 3);
        const h2 = hash01(im.seed * 29 + s * 11);
        const ang = (h - 0.5) * 1.2;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const dx = ux * ca - uy * sa, dy = uy * ca + ux * sa;
        const sp = 220 + h2 * 260;
        const dist = 18 + sp * (life / 1000) * easeOutCubic(kd) * 0.6;
        const px = im.x + dx * dist, py = im.y + dy * dist + 260 * Math.pow(te / 1000, 2) * 3;
        const r = 2 + h2 * 2.5;
        const rot = h * 6 + te * 0.02 * (h2 > 0.5 ? 1 : -1);
        const c = Math.cos(rot) * r, si = Math.sin(rot) * r;
        g.poly([px + c, py + si, px - si * 0.6, py + c * 0.6, px - c, py - si, px + si * 0.6, py - c * 0.6]).fill({ color: s % 3 === 0 ? PURPLE : (h > 0.5 ? STEEL_MID : STEEL_DARK), alpha: 1 - kd * kd });
      }
    }
  }
}
