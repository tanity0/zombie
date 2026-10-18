// research/NEW_GUNS.md(第4版): 新しい銃3挺の絵(塊弾の塊・衛星弾の玉・スキャンの扇と印)。
// ★描くだけ。判定・位置は utils/newGunsTick.ts(getNewGunsView)と store(enemies.scanMarkUntil・projectiles)を読む。
// 素材は使わない(Graphics のみ)。強glow(投影影を落とす光源)も使わない。図形は上限つき:
// 塊≤4・回る弾≤8・放った弾≤16・扇1・印≤MARK_DRAW_MAX・接点≤12・出来事≤16・焦げ跡≤6。
// 2分類(CLAUDE.md): 塊の輪郭・玉の芯は当たりと同じ大きさ(=見えている所が当たる)。土埃・ひび・火の粉・尾・外光は派手さの絵。
// 色: スキャン=彩度を落とした青白い燐光+白い芯 / 衛星弾=ランタンの炎の濁った琥珀 / 塊=冷えかけの鉱滓(縁だけ熱い)。
// 会心(#fbbf24)・レベルアップ(#fde68a)・弾薬回収(#67e8f9)・危険の赤/紫とは別の色にしてある。
import { Container, Graphics } from 'pixi.js';
import type { Enemy, Player, Projectile } from '../types/game';
import { getNewGunsView, type NewGunsEvent } from '../utils/newGunsTick';
import { BLOB_RADIUS_PX, BLOB_LIFE_MS, BLOB_FADE_MS, blobVisualScale, blobSpeedAt, BLOB_SPEED_PX_PER_SEC, type BlobShot } from '../utils/blobShot';
import { SAT_BULLET_RADIUS_PX, SAT_ORBIT_RADIUS_PX, SAT_SPAWN_EASE_MS, SAT_RELEASE_IDLE_MS, SATELLITE_WEAPON_KEY, satelliteOrbitPoint, type SatelliteOrbit } from '../utils/satelliteOrbit';
import {
  SCAN_FAN_HALF_ANGLE_RAD, SCAN_FAN_LENGTH_PX, SCAN_SWEEP_MS, scanFanSweepFrac, scanFanGroundAngle, scanFanScreenPoint, scanBeatPhase, SCAN_BEAT_MS, SCAN_WEAPON_KEY, SCAN_FAN_GROUND_Y_SCALE, isScanMarked, scanMarkRemainFrac,
  type ScanFan,
} from '../utils/scanSensor';
import { enemyFootBox, enemyHeadY, enemyHitStrip } from './renderSpec';

const SCAN = 0x9fd8d0;        // 燐光
const SCAN_DEEP = 0x4f8a85;   // 燐光の沈んだ側
const WHITE = 0xffffff;
const FOOT_BEAT = 0xe4f7f3;  // 足元の拍(白寄り=印の燐光の輪と色で分ける)
const SAT = 0xe8b25a;         // ランタンの炎の濁った琥珀
const SAT_OUT = 0xb35a1e;     // 外光
const SAT_HOT = 0xfff0cf;     // 芯の白熱
const BLOB_BODY = 0x3f2410;
const BLOB_BODY_HI = 0x6a3d1b; // 本体の段(丸み)
const BLOB_RIM = 0xffa646;
const BLOB_HEAT = 0xe0832a;
const COOL_RED = 0x8a2c1c;    // 冷える途中の鈍い赤
const COOL_ASH = 0x5b5650;    // 冷え切った灰
const SCORCH = 0x150d08;
const DUST = 0x9c8a70;
const SMOKE = 0xb3aba1;

const MARK_DRAW_MAX = 24;
const MARK_POP_MS = 240;
const FAN_FADE_MS = 260;
const ORBIT_FADE_MS = 400;
const TRAIL_MS = 600;
const SCORCH_MS = 800;
const SCORCH_MAX = 6;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);
const easeInQuad = (t: number): number => { const c = clamp01(t); return c * c; };
const smooth = (t: number): number => { const c = clamp01(t); return c * c * (3 - 2 * c); };
const lerpColor = (a: number, b: number, t: number): number => {
  const k = clamp01(t);
  const r = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * k;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * k;
  const bl = (a & 255) + ((b & 255) - (a & 255)) * k;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};
/** 橙→鈍い赤→灰(消える間に冷える)。 */
const coolColor = (hot: number, t: number): number =>
  t < 0.5 ? lerpColor(hot, COOL_RED, t / 0.5) : lerpColor(COOL_RED, COOL_ASH, (t - 0.5) / 0.5);
/** id から 0..1 の決まった値(輪郭の揺らぎ・ひびの形を個体ごとに変える)。 */
const seedOf = (id: string): number => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
};
const frac = (v: number): number => v - Math.floor(v);

interface BlobDraw {
  outer: number[]; inner: number[]; step: number[]; band: number[];
  rim: number; dull: number; body: number; bodyHi: number; heat: number; alpha: number;
  cracks: number[][]; crackW: number; crackA: number;
}
interface BlobFxState { swirl: number; lastGt: number; trail: { x: number; y: number; t: number }[]; x: number; y: number; dirX: number; dirY: number; seed: number }

export class NewGunsFx {
  private readonly ground = new Graphics();
  private readonly fanGfx = new Graphics();
  private readonly fx = new Graphics();
  private readonly blobState = new Map<string, BlobFxState>();
  private readonly scorches: { x: number; y: number; at: number; r: number }[] = [];
  /** 足元の拍の弧の出入り(0..1)。持ち替えで消える/持つと現れる時に慣性をつける。 */
  private footBeatK = 0;
  private footBeatLastNow = 0;

  constructor(groundLayer: Container, effectLayer: Container) {
    this.fanGfx.blendMode = 'add';
    groundLayer.addChild(this.ground);
    groundLayer.addChild(this.fanGfx); // 扇は地面に倒した形=地面の層(敵・自分の足の下)
    effectLayer.addChild(this.fx);
  }

  sync(
    enemies: readonly Enemy[], player: Player, projectiles: readonly Projectile[], gameTime: number, now: number,
    depthEnemy: (footY: number) => number,
  ): void {
    const v = getNewGunsView();
    const g = this.ground; const f = this.fx; const fan = this.fanGfx;
    g.clear(); f.clear(); fan.clear();
    const pcx = player.x + player.width / 2;
    this.drawMarks(enemies, gameTime, now, depthEnemy, g, f, v.scanMarkedAt, v.scanSweptIds, v.scanSweptAt);
    if (v.scanFan) this.drawFan(pcx, player.y + player.height, gameTime, fan, v.scanFan); // 根元=足元(判定と同じ)
    this.drawFootBeat(player, gameTime, now, g);
    this.drawBlobs(gameTime, g, f, v.blobs);
    this.drawScorches(gameTime, g);
    this.drawContacts(gameTime, f, g, v.blobContacts, v.blobPushed);
    for (const ev of v.events) this.drawEvent(gameTime, g, f, ev);
    // 衛星弾の軌道の根元=足元(判定 newGunsTick と同じ)。奥半分の玉は地面の層(体の後ろ)、手前は効果の層。
    const pfy = player.y + player.height;
    if (v.orbit && v.orbit.slots.length > 0) this.drawOrbit(f, g, v.orbit, pcx, pfy, gameTime, 1, null);
    if (v.orbitFade) {
      const t = (gameTime - v.orbitFade.at) / ORBIT_FADE_MS;
      if (t < 1) this.drawOrbit(f, g, v.orbitFade.orbit, pcx, pfy, gameTime, 1 - easeInQuad(t), gameTime - v.orbitFade.at);
    }
    let shotN = 0;
    for (const p of projectiles) {
      if (p.weaponKey !== SATELLITE_WEAPON_KEY || p.hostile) continue;
      if (++shotN > 16) break;
      this.drawReleasedShot(f, p, now);
    }
  }

  // ── 衛星弾 ────────────────────────────────────────────────────────────
  // 玉: 外光(同心円3段)+軌道に沿って先細る尾+琥珀の芯+白熱の芯。
  private drawOrb(
    f: Graphics, x: number, y: number, tail: readonly { x: number; y: number }[], r: number, bright: number, alpha: number,
  ): void {
    if (alpha <= 0.01 || r <= 0.2) return;
    f.circle(x, y, r * 3.1).fill({ color: SAT_OUT, alpha: 0.03 * alpha * bright });
    f.circle(x, y, r * 2.2).fill({ color: SAT_OUT, alpha: 0.06 * alpha * bright });
    f.circle(x, y, r * 1.5).fill({ color: SAT_OUT, alpha: 0.12 * alpha * bright });
    // 尾: 玉の中心から先端へ細る多角形1枚(継ぎ目なし)。
    const pts = [{ x, y }, ...tail];
    const n = pts.length;
    if (n >= 2) {
      const left: number[] = [];
      const right: number[] = [];
      for (let i = 0; i < n; i++) {
        const a = pts[Math.max(0, i - 1)], c = pts[Math.min(n - 1, i + 1)];
        const tx = c.x - a.x, ty = c.y - a.y;
        const tl = Math.hypot(tx, ty) || 1;
        const nx = -ty / tl, ny = tx / tl;
        const w = r * 0.85 * Math.pow(1 - i / (n - 1), 1.3); // 根元=玉の幅に近く→先は0
        left.push(pts[i].x + nx * w, pts[i].y + ny * w);
        right.unshift(pts[i].x - nx * w, pts[i].y - ny * w);
      }
      // right は (x,y) の組のまま逆順に積んである(unshift に2つ渡すと組の順は保たれる)。
      f.poly([...left, ...right]).fill({ color: SAT, alpha: 0.55 * alpha });
    }
    f.circle(x, y, r).fill({ color: SAT, alpha: Math.min(1, 0.9 * bright) * alpha });
    f.circle(x, y, r * 0.5).fill({ color: SAT_HOT, alpha: Math.min(1, 0.75 * bright) * alpha });
  }

  /** 回っている(または死亡・出撃の終わりで消えていく)軌道。fadeMs!==null の時は減速しながら回り続けて縮む。 */
  private drawOrbit(f: Graphics, behind: Graphics, orbit: SatelliteOrbit, cx: number, cy: number, gameTime: number, life: number, fadeMs: number | null): void {
    const TAU_S = 0.25;
    let angle = orbit.angle;
    let angVel = orbit.angVel;
    if (fadeMs !== null) {
      const ts = fadeMs / 1000;
      angle = orbit.angle + orbit.angVel * TAU_S * (1 - Math.exp(-ts / TAU_S)); // 減速しながら回る
      angVel = orbit.angVel * Math.exp(-ts / TAU_S);
    }
    const spin = Math.min(1, Math.abs(angVel) / (Math.PI * 2 * 1.6));
    // 放つ直前(入力が無くなってから0.15秒): 芯が明るく、尾が縮む=張り詰めた間。
    const tension = fadeMs === null && orbit.idleMs > 0 ? clamp01(orbit.idleMs / SAT_RELEASE_IDLE_MS) : 0;
    const dTheta = angVel * 0.024; // 尾の1点ぶんの角度(速く回るほど長い弧)
    const n = orbit.slots.length;
    for (let i = 0; i < n; i++) {
      const s = orbit.slots[i];
      const spawn = easeOutCubic((gameTime - s.bornAt) / SAT_SPAWN_EASE_MS);
      const shrink = fadeMs !== null ? (0.4 + 0.6 * life) : 1;
      const rad = SAT_ORBIT_RADIUS_PX * spawn * shrink;
      const a = angle + s.phase;
      const { x, y } = satelliteOrbitPoint(cx, cy, a, rad); // 地面に倒した楕円(判定と同じ関数)
      const tail: { x: number; y: number }[] = [];
      const tailK = (0.3 + 0.7 * spin) * (1 - 0.65 * tension);
      // 尾の弧の長さ: 一番長くても隣の玉までの弧の6割(団子に見えない)。
      const span = Math.sign(dTheta) * Math.min(Math.abs(dTheta * 4 * tailK), (0.6 * Math.PI * 2) / Math.max(1, n));
      for (let k = 1; k <= 6; k++) {
        const ta = a - span * (k / 6);
        tail.push(satelliteOrbitPoint(cx, cy, ta, rad));
      }
      // 奥行き(絵だけ): 軌道の奥半分(画面の上側)の玉は少し暗く・小さく。判定の真円は変えない。
      const back = clamp01(-Math.sin(a));
      const depthR = 1 - 0.18 * back, depthB = 1 - 0.4 * back;
      // 8個に絵だけの差: 明るさと芯の大きさを位相ずらしで±10%脈打たせる。加わった直後0.3秒は明るい。
      const pulse = 1 + 0.1 * Math.sin(gameTime / 170 + i * 0.83);
      const fresh = 1 + 0.6 * clamp01(1 - (gameTime - s.bornAt) / 300);
      const r = SAT_BULLET_RADIUS_PX * pulse * depthR * (fadeMs !== null ? life : (0.55 + 0.45 * spawn));
      this.drawOrb(Math.sin(a) < 0 ? behind : f, x, y, tail, r, pulse * fresh * depthB * (1 + 0.3 * tension), fadeMs !== null ? life : 1);
    }
  }

  /** 放った弾: 回っていた時と同じ玉のまま、飛ぶ向きへ尾を2倍に伸ばして飛ぶ(尾は飛んだ距離に合わせて伸びる)。 */
  private drawReleasedShot(f: Graphics, p: Projectile, now: number): void {
    const age = Math.max(0, now - p.createdAt);
    const x = p.x + p.width / 2, y = p.y + p.height / 2;
    const dl = Math.hypot(p.direction.x, p.direction.y) || 1;
    const dx = p.direction.x / dl, dy = p.direction.y / dl;
    const tailLen = Math.min(2 * 4 * SAT_ORBIT_RADIUS_PX * 0.13, (age / 1000) * p.speed); // 回る尾(約33px)の2倍・飛んだぶんまで
    const tail = [1, 2, 3, 4, 5, 6].map(k => ({ x: x - dx * tailLen * k / 6, y: y - dy * tailLen * k / 6 }));
    const left = p.duration - age;
    const endK = left < 90 ? clamp01(left / 90) : 1; // 寿命の終わりは減速しながら縮んで消える
    const e = 1 - (1 - endK) * (1 - endK);
    this.drawOrb(f, x, y, tail, SAT_BULLET_RADIUS_PX * e, 1.1, e);
  }

  // ── 塊弾 ──────────────────────────────────────────────────────────────
  private drawBlobs(gameTime: number, g: Graphics, f: Graphics, blobs: readonly BlobShot[]): void {
    const live = new Set<string>();
    const draws: BlobDraw[] = [];
    for (const b of blobs) {
      live.add(b.id);
      let st = this.blobState.get(b.id);
      if (!st) {
        st = { swirl: 0, lastGt: gameTime, trail: [], x: b.x, y: b.y, dirX: b.dirX, dirY: b.dirY, seed: seedOf(b.id) };
        this.blobState.set(b.id, st);
      }
      const age = gameTime - b.bornAt;
      const dtMs = Math.max(0, Math.min(100, gameTime - st.lastGt));
      st.lastGt = gameTime;
      // 中の渦: 進む速さに比例して回り、止まったら0.5秒で減速して止まる。
      const speedK = b.stoppedAt === undefined
        ? blobSpeedAt(age) / BLOB_SPEED_PX_PER_SEC
        : Math.pow(clamp01(1 - (gameTime - b.stoppedAt) / 500), 2);
      st.swirl += dtMs * 0.0042 * speedK;
      st.x = b.x; st.y = b.y; st.dirX = b.dirX; st.dirY = b.dirY;
      // 焦げ線の跡(30msごとに1点・0.6秒で消える)。
      const last = st.trail[st.trail.length - 1];
      if (b.stoppedAt === undefined && (!last || gameTime - last.t >= 30)) st.trail.push({ x: b.x, y: b.y, t: gameTime });
      while (st.trail.length > 0 && gameTime - st.trail[0].t > TRAIL_MS) st.trail.shift();
      const d = this.prepBlob(gameTime, g, b, st);
      if (d) draws.push(d);
    }
    // 重なった塊が融け合って見えるよう、縁を全部先に描き、本体を後からまとめて描く(1個ずつ重ねるとコインの山に見える)。
    for (const d of draws) {
      f.poly(d.outer).fill({ color: d.dull, alpha: 0.95 * d.alpha });
      if (d.band.length >= 6) f.poly(d.band).fill({ color: d.rim, alpha: 0.95 * d.alpha });
    }
    for (const d of draws) {
      f.poly(d.inner).fill({ color: d.body, alpha: 0.96 * d.alpha });
      f.poly(d.step).fill({ color: d.bodyHi, alpha: 0.55 * d.alpha });
    }
    for (const d of draws) {
      for (const line of d.cracks) f.poly(line, false).stroke({ width: d.crackW, color: d.heat, alpha: d.crackA, join: 'miter' });
    }
    // 消えた塊の最後の場所に、黒い焦げ跡を0.8秒。
    for (const [id, st] of this.blobState) {
      if (live.has(id)) continue;
      this.scorches.push({ x: st.x, y: st.y + BLOB_RADIUS_PX * 0.45, at: gameTime, r: BLOB_RADIUS_PX * 0.9 });
      if (this.scorches.length > SCORCH_MAX) this.scorches.shift();
      this.blobState.delete(id);
    }
  }

  /** 焦げ線と影は地面へ描き、塊の形(縁・本体・ひび)は返す(描くのは drawBlobs が全部の塊でまとめて)。 */
  private prepBlob(gameTime: number, g: Graphics, b: BlobShot, st: BlobFxState): BlobDraw | null {
    const age = gameTime - b.bornAt;
    const sc = blobVisualScale(b, gameTime);
    const coolT = smooth((age - (BLOB_LIFE_MS - BLOB_FADE_MS)) / BLOB_FADE_MS); // 消える間に冷える(段差なし)
    // 焦げ線(進んだ跡)。
    for (let i = 1; i < st.trail.length; i++) {
      const a = st.trail[i - 1], c = st.trail[i];
      const k = 1 - (gameTime - c.t) / TRAIL_MS;
      if (k <= 0) continue;
      g.moveTo(a.x, a.y + BLOB_RADIUS_PX * 0.5).lineTo(c.x, c.y + BLOB_RADIUS_PX * 0.5)
        .stroke({ width: 9 * k, color: SCORCH, alpha: 0.5 * k, cap: 'round' });
      // 焦げの中に残る熾火(先に冷える)。
      g.moveTo(a.x, a.y + BLOB_RADIUS_PX * 0.5).lineTo(c.x, c.y + BLOB_RADIUS_PX * 0.5)
        .stroke({ width: 2.2 * k, color: BLOB_HEAT, alpha: 0.55 * k * k, cap: 'round' });
    }
    if (sc <= 0.01) return null;
    const R = BLOB_RADIUS_PX * sc;
    // 足元の潰れた影。
    g.ellipse(b.x, b.y + R * 0.55, R * 1.1, R * 1.1 * 0.35).fill({ color: 0x000000, alpha: 0.35 * (1 - coolT * 0.5) });
    // 形: 撃ち出しの0.25秒だけ1.5倍まで伸びた涙形(後ろが尖る)→進む間は少し伸び→止まると潰れて戻るばね。
    let along = 1, across = 1, tear = 0;
    if (b.stoppedAt === undefined) {
      const kk = Math.pow(clamp01(1 - age / 250), 2);
      along = 1.06 + 0.44 * kk; across = 1 / Math.sqrt(along); tear = kk;
    } else {
      const since = gameTime - b.stoppedAt;
      const sp = Math.exp(-since / 110) * Math.cos(since / 38);
      along = 1 - 0.38 * sp; across = 1 + 0.30 * sp;
    }
    const ang = Math.atan2(b.dirY, b.dirX);
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const N = 26;
    const outer: number[] = [];
    const inner: number[] = [];
    const step: number[] = [];
    const bandOut: number[] = [];
    const bandIn: number[] = [];
    // i を -N/2..N/2-1 で回す=進む側(th=0)の前後が途切れずに並ぶ(明るい縁の帯を1枚で作るため)。
    for (let ii = 0; ii < N; ii++) {
      const i = ii - N / 2;
      const th = (i / N) * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      // 輪郭の崩し(±約8%・ゆっくり動く)。
      const noise = 1 + 0.08 * (0.6 * Math.sin(3 * th + st.seed * 17 + gameTime / 900) + 0.4 * Math.sin(5 * th - st.seed * 9 - gameTime / 640));
      let lx = c * R * along * noise, ly = s * R * across * noise;
      if (c < 0 && tear > 0) { lx *= 1 + 0.5 * tear * (-c); ly *= 1 - 0.55 * tear * (-c); }
      // 縁の太さ: 進む側 4.5px・後ろ 1.5px。
      const w = (1.5 + 3 * Math.max(0, c)) * Math.max(0.4, sc);
      const len = Math.hypot(lx, ly) || 1;
      const ix = lx * Math.max(0, (len - w) / len), iy = ly * Math.max(0, (len - w) / len);
      const ox = b.x + lx * cos - ly * sin, oy = b.y + lx * sin + ly * cos;
      const qx = b.x + ix * cos - iy * sin, qy = b.y + ix * sin + iy * cos;
      outer.push(ox, oy);
      inner.push(qx, qy);
      // 明るい縁は進む側の弧(全周の約1/3=前後60°)だけ。端は細って鈍い赤へ溶ける。
      if (c > 0.5) {
        const tp = smooth((c - 0.5) / 0.35);
        bandOut.push(qx + (ox - qx) * tp, qy + (oy - qy) * tp);
        bandIn.unshift(qx, qy);
      }
      // 本体の段(左上へ寄せた一回り小さい明るい面=丸み)。
      const sx = ix * 0.7 - R * 0.12, sy = iy * 0.7 - R * 0.16;
      step.push(b.x + sx, b.y + sy);
    }
    const rim = coolColor(BLOB_RIM, coolT);
    const heat = coolColor(BLOB_HEAT, coolT);
    const alpha = 1 - 0.35 * coolT * coolT;
    // 中の熱のひび: 縁寄りの1か所から 3 か 5 本に枝分かれ。角度・長さ・折れ方は個体ごとに±30°ばらつく。渦の角度で回る。
    const cracks: number[][] = [];
    const nCr = st.seed < 0.5 ? 3 : 5;
    const oa = st.swirl + st.seed * Math.PI * 2;
    const lim = R * 0.8 * Math.min(along, across, 1);
    const clampIn = (x: number, y: number): [number, number] => {
      const dx = x - b.x, dy = y - b.y, d = Math.hypot(dx, dy);
      return d > lim ? [b.x + (dx / d) * lim, b.y + (dy / d) * lim] : [x, y];
    };
    const [ox0, oy0] = clampIn(b.x + Math.cos(oa) * R * 0.58, b.y + Math.sin(oa) * R * 0.58);
    const J = Math.PI / 6; // ±30°
    // 幹1本(縁寄りの起点から中へ)と、幹の途中から分かれる枝(残り 2 か 4 本)。長さ・角度・折れは個体ごとにばらつく。
    let trunk: number[] = [];
    for (let k = 0; k < nCr; k++) {
      const jit = (v: number): number => (frac(st.seed * 7.31 + k * 0.618 + v) * 2 - 1);
      let x: number, y: number, dir: number, L: number;
      if (k === 0) {
        x = ox0; y = oy0; dir = oa + Math.PI + jit(0.11) * J; L = R * (0.95 + 0.25 * frac(st.seed * 3.7));
      } else {
        // 幹の 2〜(末尾-1)点目のどれかから分かれる(全部が1点から放射しない=鳥の足に見せない)。
        const nPts = trunk.length / 2;
        const at = 1 + Math.floor(frac(st.seed * 4.1 + k * 0.53) * Math.max(1, nPts - 2));
        x = trunk[at * 2]; y = trunk[at * 2 + 1];
        const side = k % 2 === 0 ? 1 : -1;
        dir = oa + Math.PI + side * (0.6 + 0.35 * frac(st.seed * 2.3 + k * 0.71)) + jit(0.19) * J;
        L = R * (0.22 + 0.3 * frac(st.seed * 3.7 + k * 0.29));
      }
      const segs = k === 0 ? 3 : 2;
      const line = [x, y];
      for (let j = 0; j < segs; j++) {
        dir += jit(0.37 + j * 0.23) * J;
        [x, y] = clampIn(x + Math.cos(dir) * L / segs, y + Math.sin(dir) * L / segs);
        line.push(x, y);
      }
      if (k === 0) trunk = line;
      cracks.push(line);
    }
    return {
      outer, inner, step, band: [...bandOut, ...bandIn], rim,
      dull: lerpColor(COOL_RED, COOL_ASH, coolT * 0.6),
      body: lerpColor(BLOB_BODY, COOL_ASH, coolT * 0.6), bodyHi: lerpColor(BLOB_BODY_HI, COOL_ASH, coolT * 0.6),
      heat, alpha, cracks, crackW: Math.max(1, 2.6 * sc), crackA: (0.9 - 0.5 * coolT) * alpha,
    };
  }

  private drawScorches(gameTime: number, g: Graphics): void {
    for (let i = this.scorches.length - 1; i >= 0; i--) {
      const s = this.scorches[i];
      const t = (gameTime - s.at) / SCORCH_MS;
      if (t >= 1 || t < 0) { this.scorches.splice(i, 1); continue; }
      const a = 0.5 * (1 - easeInQuad(t));
      g.ellipse(s.x, s.y, s.r * 1.15, s.r * 0.42).fill({ color: SCORCH, alpha: a });
      g.ellipse(s.x - s.r * 0.2, s.y + 1, s.r * 0.6, s.r * 0.22).fill({ color: SCORCH, alpha: a * 0.8 });
    }
  }

  /** 触れている敵との接点に昇る火の粉/湯気、押された敵の足元の引きずりの土埃(どちらも上限つき・時間から決まる粒)。 */
  private drawContacts(
    gameTime: number, f: Graphics, g: Graphics,
    contacts: readonly { x: number; y: number }[], pushed: readonly { x: number; y: number; dx: number; dy: number }[],
  ): void {
    for (let ci = 0; ci < contacts.length; ci++) {
      const c = contacts[ci];
      for (let k = 0; k < 4; k++) {
        const ph = frac(gameTime / 640 + k / 4 + ci * 0.13);
        const rise = easeOutCubic(ph) * 26;
        const x = c.x + Math.sin(ph * 5 + k * 1.9 + ci) * 5;
        const y = c.y - rise;
        const ember = k % 2 === 0;
        f.circle(x, y, (ember ? 1.8 : 3.2) * (1 - ph * 0.6)).fill({ color: ember ? BLOB_RIM : 0xcfc6bb, alpha: (ember ? 0.9 : 0.3) * (1 - ph) });
      }
    }
    for (let pi = 0; pi < pushed.length; pi++) {
      const p = pushed[pi];
      const l = Math.hypot(p.dx, p.dy) || 1;
      const bx = -p.dx / l, by = -p.dy / l;
      for (let k = 0; k < 3; k++) {
        const ph = frac(gameTime / 420 + k / 3 + pi * 0.21);
        const d = 4 + k * 7 + ph * 6;
        g.circle(p.x + bx * d, p.y + by * d - ph * 4, 3 + k * 2 + ph * 3).fill({ color: DUST, alpha: 0.22 * (1 - ph) });
      }
    }
  }

  /** 出来事ごとの形: 塊の発射=前へ吹く煙1本 / 塊が止まる=進む向きへの扇形の土埃+地面のひび / 衛星弾を放つ=各弾の向きへ伸びる線。 */
  private drawEvent(gameTime: number, g: Graphics, f: Graphics, ev: NewGunsEvent): void {
    const age = gameTime - ev.at;
    if (age < 0) return;
    if (ev.kind === 'blob-fire') {
      const t = age / 420;
      if (t >= 1) return;
      for (let i = 0; i < 3; i++) {
        const d = 6 + 40 * easeOutCubic(t) + i * 8;
        f.circle(ev.x + ev.dirX * d, ev.y + ev.dirY * d - t * 6, 5 + 12 * t + i * 3)
          .fill({ color: SMOKE, alpha: 0.5 * Math.pow(1 - t, 1.5) * (1 - i * 0.22) });
      }
    } else if (ev.kind === 'blob-stop') {
      const t = age / 650;
      if (t >= 1) return;
      const ang = Math.atan2(ev.dirY, ev.dirX);
      for (let i = 0; i < 7; i++) {
        const a = ang + (i / 6 - 0.5) * 1.9;
        const d = 6 + 48 * easeOutCubic(t) * (0.7 + 0.3 * frac(i * 0.618));
        f.circle(ev.x + Math.cos(a) * d, ev.y + Math.sin(a) * d - t * 8, 4 + 9 * t)
          .fill({ color: DUST, alpha: 0.38 * Math.pow(1 - t, 2) });
      }
      // ひび線4本(地面)。素早く走ってから薄れる。
      const run = easeOutCubic(age / 140);
      const fade = 1 - clamp01((t - 0.35) / 0.65);
      // 地面のひび: 塊の真下ではなく、進む向きの前方(当たった所)から横へ開いて走る。地面の上の角度で作って縦を潰す
      // (扇・印の輪と同じ 0.36)=下へ垂れる「脚」にならない。橙の熾火は先端の短い区間だけ。
      const GY = SCAN_FAN_GROUND_Y_SCALE;
      const ga = Math.atan2(ev.dirY / GY, ev.dirX);
      const offs = [-1.6, -1.15, 1.1, 1.55]; // 前方の当たった所から、斜め前〜横へ
      for (let i = 0; i < offs.length; i++) {
        const a0 = ga + offs[i];
        const L = (40 + 16 * (i % 2)) * run;
        const side = offs[i] < 0 ? -1 : 1;
        // 起点: 前方の当たった所から少し横へずらす(地面の上で)。
        let gx = Math.cos(ga) * 4 + Math.cos(ga + side * Math.PI / 2) * BLOB_RADIUS_PX * 0.25;
        let gy = Math.sin(ga) * 4 + Math.sin(ga + side * Math.PI / 2) * BLOB_RADIUS_PX * 0.25;
        const gy0 = ev.y + BLOB_RADIUS_PX * 0.55; // 地面の高さ(塊の影と同じ)
        const pts: number[] = [ev.x + gx, gy0 + gy * GY];
        for (let j = 1; j <= 3; j++) {
          const aj = a0 + (j % 2 === 0 ? 0.3 : -0.28) * side;
          gx += Math.cos(aj) * L / 3; gy += Math.sin(aj) * L / 3;
          pts.push(ev.x + gx, gy0 + gy * GY);
        }
        g.poly(pts, false).stroke({ width: 4, color: SCORCH, alpha: 0.85 * fade, join: 'miter' });
        // 先端の短い熾火(最後の区間の後ろ半分だけ)。先に冷える。
        const n = pts.length;
        const tx = pts[n - 2], ty = pts[n - 1], px = pts[n - 4], py = pts[n - 3];
        g.moveTo(px + (tx - px) * 0.5, py + (ty - py) * 0.5).lineTo(tx, ty)
          .stroke({ width: 1.2, color: BLOB_RIM, alpha: 0.85 * fade * fade, cap: 'round' });
      }
    } else if (ev.kind === 'sat-release' && ev.dirs) {
      const t = age / 260;
      if (t >= 1) return;
      for (const d of ev.dirs) {
        const a = 6 + 4 * t, b = 6 + 34 * easeOutCubic(t);
        f.moveTo(d.x + d.dx * a, d.y + d.dy * a).lineTo(d.x + d.dx * b, d.y + d.dy * b)
          .stroke({ width: 0.6 + 2 * (1 - t), color: SAT, alpha: 0.85 * (1 - t), cap: 'round' });
      }
    }
  }

  // ── スキャンセンサー ───────────────────────────────────────────────────
  // 扇: 根元→先へ掃く先頭の弧(太い燐光+白い芯)と、遅れて追う細い弧1本。掃き終わりで静かに消える。
  // 地面に倒した扇: 点はすべて scanFanScreenPoint(判定 scanFanContains と同じ潰し方)で置く。根元は足元。
  private drawFan(pcx: number, pcy: number, gameTime: number, g: Graphics, fan: ScanFan): void {
    const sweep = scanFanSweepFrac(fan, gameTime);
    const endAt = fan.abortedAt ?? (fan.startAt + SCAN_SWEEP_MS);
    const fade = fan.resolved ? 1 - easeInQuad((gameTime - endAt) / (fan.abortedAt !== undefined ? FAN_FADE_MS * 0.6 : FAN_FADE_MS)) : 1;
    if (fade <= 0.001) return;
    const open = easeOutCubic((gameTime - fan.startAt) / 90);
    const half = SCAN_FAN_HALF_ANGLE_RAD * (0.35 + 0.65 * open);
    const base = scanFanGroundAngle(fan.dirX, fan.dirY);
    const stopFrac = fan.abortedAt !== undefined ? scanFanSweepFrac(fan, fan.abortedAt) : sweep;
    const reach = SCAN_FAN_LENGTH_PX * stopFrac;
    const steps = 14;
    const arc = (rr: number, widen = 1): number[] => {
      const pts: number[] = [];
      for (let i = 0; i <= steps; i++) {
        const a = base - half * widen + (2 * half * widen * i) / steps;
        const q = scanFanScreenPoint(pcx, pcy, a, rr);
        pts.push(q.x, q.y);
      }
      return pts;
    };
    // 横向きほど地面へ潰れて細くなる。潰れた分だけ塗りと先頭の弧を足す(横向きで塗り0.18・弧12px)。
    const sideK = Math.abs(Math.cos(base));
    // 出始めは先頭の弧を細く(届いた長さに比例・最初の40msはさらに細い=白い欠片に見せない)。
    const grow = clamp01(stopFrac * 1.6) * clamp01((gameTime - fan.startAt) / 40);
    g.poly([pcx, pcy, ...arc(reach)]).fill({ color: SCAN_DEEP, alpha: (0.10 + 0.08 * sideK) * fade });
    // 遅れて追う1本(70ms遅れ)。
    const lagReach = SCAN_FAN_LENGTH_PX * Math.min(stopFrac, scanFanSweepFrac(fan, Math.min(gameTime, endAt) - 70));
    if (lagReach > 10) g.poly(arc(lagReach), false).stroke({ width: 2, color: SCAN, alpha: 0.38 * fade });
    const lead = arc(reach, 1.04);
    const sweeping = !fan.resolved;
    const leadW = (sweeping ? 9 + 3 * sideK : 4 + 1.5 * sideK) * grow;
    g.poly(lead, false).stroke({ width: leadW, color: SCAN, alpha: (sweeping ? 0.5 : 0.3) * fade });
    g.poly(lead, false).stroke({ width: (sweeping ? 2.5 + sideK : 1.2) * grow, color: WHITE, alpha: 0.9 * fade });
    for (const s of [-1, 1]) {
      const q = scanFanScreenPoint(pcx, pcy, base + s * half, reach);
      g.moveTo(pcx, pcy).lineTo(q.x, q.y)
        .stroke({ width: 1.2, color: SCAN, alpha: 0.35 * fade });
    }
  }

  // 足元の拍: 小さな弧が足の前から左右へ回り込んで満ち(拍に近いほど速く=加速)、拍の瞬間に弾けて外へ広がり
  // 減速しながら消える。スキャンセンサーを持っている時だけ(持ち替えると0.15秒ほどで沈む)。画面下の目盛りと同じ時計。
  private drawFootBeat(player: Player, gameTime: number, now: number, g: Graphics): void {
    const holding = player.weapons.find(w => w.id === player.activeWeaponId)?.key === SCAN_WEAPON_KEY && player.health > 0;
    const dt = this.footBeatLastNow > 0 ? Math.min(100, Math.max(0, now - this.footBeatLastNow)) : 16;
    this.footBeatLastNow = now;
    this.footBeatK += ((holding ? 1 : 0) - this.footBeatK) * (1 - Math.exp(-dt / 70));
    if (this.footBeatK < 0.02) return;
    const k = this.footBeatK;
    const fx = player.x + player.width / 2, fy = player.y + player.height - 1;
    const rx = Math.max(16, player.width * 0.75), ry = rx * SCAN_FAN_GROUND_Y_SCALE;
    const phase = scanBeatPhase(gameTime);
    const since = phase * SCAN_BEAT_MS; // 直前の拍からの ms
    // 印の輪(閉じた燐光の輪)と見分けるため、閉じない: 足の前だけの短い弧(全周の約1/3)で、白寄りの色。
    const HALF = Math.PI / 3; // 前後 60° = 全周の1/3
    const arcPts = (span: number, sx: number, sy: number): number[] => {
      const steps = Math.max(3, Math.ceil(12 * span / HALF));
      const pts: number[] = [];
      for (let i = 0; i <= steps; i++) {
        const a = Math.PI / 2 - span + (2 * span * i) / steps;
        pts.push(fx + Math.cos(a) * sx, fy + Math.sin(a) * sy);
      }
      return pts;
    };
    // 満ち: 前の真ん中から左右へ伸びる。phase^1.6 で拍に向けて加速する。
    const fill = Math.pow(phase, 1.6);
    const pre = clamp01((phase - 0.75) / 0.25); // 拍の直前は明るく太く
    g.poly(arcPts(HALF, rx, ry), false).stroke({ width: 1, color: FOOT_BEAT, alpha: 0.18 * k, cap: 'round' }); // 満ちる先の目安
    if (fill > 0.02) {
      const pts = arcPts(HALF * fill, rx, ry);
      g.poly(pts, false).stroke({ width: 4 + 2 * pre, color: SCAN_DEEP, alpha: 0.35 * k, cap: 'round' }); // 下の薄い燐光
      g.poly(pts, false).stroke({ width: 2 + 1.2 * pre, color: FOOT_BEAT, alpha: (0.7 + 0.3 * pre) * k, cap: 'round' });
    }
    // 弾け: 拍から 220ms。弧のまま外へ広がりながら減速(easeOutCubic)・細く薄くなる。最初の 90ms は白く太い。
    if (since < 220) {
      const t = since / 220;
      const grow = 1 + 0.9 * easeOutCubic(t);
      const a = (1 - t) * (1 - t);
      const pts = arcPts(HALF * (1 + 0.25 * easeOutCubic(t)), rx * grow, ry * grow);
      g.poly(pts, false).stroke({ width: 3.5 * (1 - t) + 0.8, color: FOOT_BEAT, alpha: 0.9 * a * k, cap: 'round' });
      if (since < 90) g.poly(arcPts(HALF, rx * (1 + 0.3 * easeOutCubic(since / 90)), ry * (1 + 0.3 * easeOutCubic(since / 90))), false)
        .stroke({ width: 5, color: WHITE, alpha: 0.6 * (1 - since / 90) * k, cap: 'round' });
    }
  }

  // 印: 足元の細い輪(残り時間で欠ける)+頭上の小さな菱形。付いた瞬間は外から縮んで収まる。
  // 掃いて印が付いた敵は0.1秒白く点滅、印のある敵に当てた瞬間は0.12秒強く光る。
  private drawMarks(
    enemies: readonly Enemy[], gameTime: number, now: number, depthEnemy: (footY: number) => number,
    g: Graphics, f: Graphics, markedAt: ReadonlyMap<string, number>, sweptIds: ReadonlySet<string>, sweptAt: number,
  ): void {
    let n = 0;
    const sweptBlink = clamp01(1 - (gameTime - sweptAt) / 100);
    for (const e of enemies) {
      if (n >= MARK_DRAW_MAX) break;
      if (!isScanMarked(e, gameTime)) continue;
      n++;
      const remain = scanMarkRemainFrac(e, gameTime);
      const fb = enemyFootBox(e);
      const ds = depthEnemy(fb.footY);
      const strip = enemyHitStrip(e);
      const at = markedAt.get(e.id);
      const pop = at !== undefined ? easeOutCubic((gameTime - at) / MARK_POP_MS) : 1;
      const hitK = e.lastHit ? Math.pow(clamp01(1 - (now - e.lastHit) / 120), 1.5) : 0;
      const blink = sweptIds.has(e.id) ? sweptBlink : 0;
      const rx = Math.max(12, strip.width * 0.62) * ds * (1 + 0.6 * (1 - pop) + 0.12 * hitK);
      const ry = rx * 0.36;
      const a0 = 0.9 * (0.4 + 0.6 * pop);
      const tail = remain < 0.14 ? remain / 0.14 : 1;
      const sweepA = Math.PI * 2 * remain;
      const start = -Math.PI / 2;
      const pts: number[] = [];
      const seg = Math.max(6, Math.ceil(28 * remain));
      for (let i = 0; i <= seg; i++) {
        const a = start + (sweepA * i) / seg;
        pts.push(fb.footX + Math.cos(a) * rx, fb.footY + Math.sin(a) * ry);
      }
      g.poly(pts, false).stroke({ width: 3 + 3 * hitK, color: SCAN, alpha: Math.min(1, a0 * tail * (0.75 + hitK)) });
      g.poly(pts, false).stroke({ width: 1, color: WHITE, alpha: Math.min(1, (0.6 * a0 + hitK + blink) * tail) });
      const headY = fb.footY - (fb.footY - enemyHeadY(e, false)) * ds;
      const drop = (1 - pop) * 14;
      const cy = headY - 16 * ds - drop;
      const s = 5.5 * Math.max(0.7, ds) * (1 + 0.45 * hitK);
      const dia = [fb.footX, cy - s * 1.25, fb.footX + s, cy, fb.footX, cy + s * 1.25, fb.footX - s, cy];
      f.poly(dia).fill({ color: SCAN, alpha: 0.85 * a0 * tail }).stroke({ width: 1.2, color: WHITE, alpha: 0.9 * a0 * tail });
      if (hitK + blink > 0.01) f.poly(dia).fill({ color: WHITE, alpha: Math.min(1, hitK + blink) * tail });
    }
  }
}
