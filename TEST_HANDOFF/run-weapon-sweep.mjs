// 全武器AI実機テスト(research/WEAPON_AI_TEST.md S3+S4)。層A(実機ボット・?bot=standard)で
// ユニーク武器21挺+サブウェポン金環の計22件を1挺ずつ回し、§5-1(共通C1〜C4)+§5-2(武器ごと)の
// 受け入れ行を判定する。土台はbotrun-local.mjs/run-e2e-sweep.mjsと同じ(build→preview→実走)。
// 使い方: node TEST_HANDOFF/run-weapon-sweep.mjs [weaponKeyの部分一致でフィルタ(省略可・カンマ区切り)]
//   例: node TEST_HANDOFF/run-weapon-sweep.mjs handgun-t1-derringer,gold-ring
// 出力: TEST_HANDOFF/results/<stamp>-weapon-sweep-raw.json + コンソールへ§7-5形式のサマリ。
//
// ★道具作り専用(研究/WEAPON_AI_TEST.md §0「対象外」どおり、強さのバランス/絵の出来/ボス仕様は見ない)。
// ★ボット本体(playtestDriver.ts/decideBotInput)は一切書き換えていない。ページ側の口は
//   DEV_LOADOUT_ACTIVEでゲートされた3つ(__BOT_SAMPLE__拡張/__BOT_MANUAL_FIRE__/__BOT_RESET__。
//   いずれもsrc/hooks/useGameLoop.ts)だけ=新しい窓口を増やさない設計に従う。
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync } from 'node:child_process';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'TEST_HANDOFF/results');
fs.mkdirSync(outDir, { recursive: true });

// ★未決#T2の推薦どおり既定60秒(実機/十分に速い環境向け)。★実測メモ(2026-09-08・このコンテナ):
// swiftshaderソフトウェアレンダリングでgameTimeの進みが実時間の1/35〜1/40しかない(4本の独立
// プローブで再現)。この環境で60秒回すと戦闘がほぼ発生しない=偽陰性の温床になるため、遅い環境では
// WEAPON_SWEEP_RUN_MS を秒数×35倍程度に伸ばす(例: 実機60秒相当を狙うなら約2100000=35分)。
const RUN_MS = Number(process.env.WEAPON_SWEEP_RUN_MS ?? 60000);
const SAMPLE_MS = 300;   // __BOT_SAMPLE__のポーリング間隔(毎秒より高頻度=速い現象取りこぼし対策)
const MANUAL_FIRE_MS = 700; // 手動アクション代役(§S3-a)を叩く間隔

// ── §5-2の22件(21ユニーク+金環)。keyがnull=既定武器のまま(金環はサブだけ強制)。──────────
const RANGE_BY_CATEGORY = { handgun: 170, shotgun: 140, rifle: 250, glauncher: 250 }; // weaponUtils.ts:780
const PILEDRIVER_RANGE_PX = 108;      // MELEE_RADIUS(74)+HUNTING_MELEE_RADIUS_BONUS_BY_LEVEL[3](34)
const GUNBLADE_MELEE_RANGE_PX = 90;   // gunbladeMelee.ts
const SUPPRESS_RANGE_PX = 250;        // weaponUtils.ts CATALOG['shotgun-t2-suppress'].rangeOverride
const BOLT_RANGE_PX = 320;            // weaponUtils.ts CATALOG['rifle-t1-bolt'].rangeOverride
const FOCUS_SPREAD_FLOOR_RAD = 0.36;  // focusSpread.ts
const FOCUS_SPREAD_INITIAL_RAD = 1.30;
const SIGNAL_STRIKE_DELAY_MS = 900;   // signalLauncher.ts(t=gameTime基準。dueAt-900=記録時刻)

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const nearestEnemyDist = (s) => {
  if (!s.enemies.length) return Infinity;
  const pcx = s.player.x, pcy = s.player.y;
  let best = Infinity;
  for (const e of s.enemies) {
    const d = dist(pcx, pcy, e.x + e.width / 2, e.y + e.height / 2);
    if (d < best) best = d;
  }
  return best;
};
const weaponOf = (s, key) => s.weapons.find(w => w.key === key);
const finalTelemetry = (samples) => samples.length ? samples[samples.length - 1].telemetry : null;
// モードの遷移回数(undefinedは既定値として扱う)。
const countTransitions = (samples, key, field, fallback) => {
  let last, transitions = 0;
  const seen = new Set();
  for (const s of samples) {
    const w = weaponOf(s, key);
    if (!w) continue;
    const v = w[field] ?? fallback;
    seen.add(v);
    if (last !== undefined && v !== last) transitions++;
    last = v;
  }
  return { transitions, seen };
};

const WEAPONS = [
  {
    name: 'デリンジャー', key: 'handgun-t1-derringer',
    check: (ctx) => {
      const t = ctx.tele;
      const ratio = t.projectilesSpawned > 0 ? t.reloads / t.projectilesSpawned : 0;
      return [{ label: '装弾2・頻繁なリロード(reloads/shots≧1/2)', pass: t.projectilesSpawned > 0 && ratio >= 0.5,
        detail: `reloads=${t.reloads} shots=${t.projectilesSpawned} 比=${ratio.toFixed(2)}` }];
    },
  },
  {
    name: 'ハンドキャノン', key: 'handgun-t2-handcannon',
    check: (ctx) => {
      let maxHits = 0;
      let resetObserved = false;
      let prevReloads = 0;
      const prevHitsById = new Map();
      for (const s of ctx.samples) {
        for (const e of s.enemies) {
          const h = e.handcannonHits ?? 0;
          if (h > maxHits) maxHits = h;
          const prevH = prevHitsById.get(e.id) ?? 0;
          if (s.telemetry.reloads > prevReloads && prevH > 0 && h === 0) resetObserved = true;
          prevHitsById.set(e.id, h);
        }
        prevReloads = s.telemetry.reloads;
      }
      return [
        { label: '同一敵への連続命中(減衰台帳が2以上まで進む)', pass: maxHits >= 2, detail: `観測した最大連続命中回数=${maxHits}` },
        { label: 'リロードで減衰リセット', pass: resetObserved, detail: resetObserved ? 'リロード直後に連続命中カウントの0復帰を観測' : '観測できない(リロード後に同じ敵が生存し続けなかった可能性)' },
      ];
    },
  },
  {
    name: 'パイルドライバー', key: 'handgun-t3-piledriver',
    check: (ctx) => {
      // ★射程外(>108px)発射チェックは意図的に「観測できない」とする: パイルドライバーの飛翔距離
      // (108px÷620px/s≈174ms)がこのランナーの実測サンプル間隔(評価コールのラウンドトリップに
      // 引きずられ実測1〜1.5秒/回=CLAUDE.md「実在確認」以前に、そもそも弾が生きている時間より
      // サンプル間隔が長い)より短く、「射程外に見えた弾」は実際には別の敵が新たに最寄りになった後の
      // 残像を拾っただけ(=鏡ではなく「取れない信号」)である可能性が高い。取れない信号を条件にせず、
      // 射程ゲート自体はfireWeapon(weaponUtils.ts)の全武器共通コードで機械的に保証されている
      // (rangeOverride=piledriverRangePx=108を超えたら`return []`)ことをソースで確認済み、と報告する。
      const kb = ctx.tele.gunKnockbacks > 0; // カウンタ(サンプルのknockbackActiveより信頼できる=280ms窓を取りこぼさない)
      const t = ctx.tele;
      return [
        { label: `射程外(>${PILEDRIVER_RANGE_PX}px)の発射0`, pass: null,
          detail: '観測できない(弾の生存時間≈174msがサンプル間隔より短く、実機サンプルでは信頼できる判定ができない。fireWeaponの共通射程ゲートで構造的に保証されていることはソースで確認済み)' },
        { label: 'ノックバック(KB)が発生する', pass: kb, detail: `gunKnockbacks=${t.gunKnockbacks}` },
        { label: '体勢崩し>0', pass: t.postureBroken > 0, detail: `postureBroken=${t.postureBroken}` },
      ];
    },
  },
  {
    name: 'クロスボウ', key: 'handgun-t1-crossbow',
    check: (ctx) => {
      const ammo = ctx.samples.map(s => s.player.ammoHandgun);
      const reserveSteady = ammo.length > 0 && Math.max(...ammo) === Math.min(...ammo);
      const t = ctx.tele;
      return [
        { label: 'リザーブ(ammoHandgun)が減らない(infiniteAmmo)', pass: reserveSteady, detail: `観測レンジ ${Math.min(...ammo)}〜${Math.max(...ammo)}` },
        { label: '発射数 == リロード回数(1発ごとに装填)', pass: t.projectilesSpawned > 0 && t.reloads === t.projectilesSpawned, detail: `shots=${t.projectilesSpawned} reloads=${t.reloads}` },
      ];
    },
  },
  {
    name: 'デュアルレンジ', key: 'handgun-t2-dualrange',
    check: (ctx) => {
      const { seen } = countTransitions(ctx.samples, 'handgun-t2-dualrange', 'dualRangeMode', 'far');
      const t = ctx.tele;
      return [{ label: '近/遠どちらのモードも確認 かつ 発射>0', pass: seen.has('near') && seen.has('far') && t.projectilesSpawned > 0,
        detail: `観測モード=${[...seen].join(',')} shots=${t.projectilesSpawned}` }];
    },
  },
  {
    name: 'ガンブレード', key: 'handgun-t3-gunblade',
    check: (ctx) => {
      const t = ctx.tele;
      // 至近モード中はfireWeaponが弾を1つも作らない(weaponUtils.ts:1073-1122の`return []`)ので、
      // gunbladeMeleeMode===trueのサンプルでガンブレード弾が観測されないことをサニティチェックする。
      let meleeModeStrayShot = false;
      for (const s of ctx.samples) {
        const w = weaponOf(s, 'handgun-t3-gunblade');
        if (w?.gunbladeMeleeMode && s.projectiles.some(p => p.weaponKey === 'handgun-t3-gunblade' && !p.hostile)) meleeModeStrayShot = true;
      }
      return [
        { label: '至近モードで近接ダメージが成立(meleeFromGun>0)', pass: t.meleeFromGun > 0, detail: `meleeFromGun=${t.meleeFromGun}` },
        { label: '至近モード中に弾が観測されない', pass: !meleeModeStrayShot, detail: meleeModeStrayShot ? '至近モード中に弾を観測(仕様と食い違う)' : '観測どおり0個' },
      ];
    },
  },
  {
    name: '収束型SG', key: 'shotgun-t1-focus',
    check: (ctx) => {
      let minRad = Infinity, sawInitial = false;
      for (const s of ctx.samples) {
        const w = weaponOf(s, 'shotgun-t1-focus');
        const r = w?.focusSpreadRad;
        if (r === undefined) continue;
        if (r <= minRad) minRad = r;
        if (Math.abs(r - FOCUS_SPREAD_INITIAL_RAD) < 0.01) sawInitial = true;
      }
      const reachedFloor = minRad <= FOCUS_SPREAD_FLOOR_RAD + 0.02;
      return [{ label: `命中の連続で下限(${FOCUS_SPREAD_FLOOR_RAD}rad)まで収束する`, pass: reachedFloor,
        detail: `観測した最小focusSpreadRad=${minRad === Infinity ? 'なし' : minRad.toFixed(3)}(初期値1.30を観測=${sawInitial})` }];
    },
  },
  {
    name: '制圧型SG', key: 'shotgun-t2-suppress',
    check: (ctx) => {
      let maxEngageAtFire = 0;
      for (const s of ctx.samples) {
        if (s.projectiles.some(p => p.weaponKey === 'shotgun-t2-suppress' && !p.hostile)) {
          const d = nearestEnemyDist(s);
          if (d < Infinity && d > maxEngageAtFire) maxEngageAtFire = d;
        }
      }
      return [{ label: `既定SG射程(${RANGE_BY_CATEGORY.shotgun}px)超での交戦を観測`, pass: maxEngageAtFire > RANGE_BY_CATEGORY.shotgun,
        detail: `発射観測中の最大交戦距離(近似)=${Math.round(maxEngageAtFire)}px(rangeOverride=${SUPPRESS_RANGE_PX}px)` }];
    },
  },
  {
    name: '火炎放射器', key: 'shotgun-t3-flamer',
    check: (ctx) => {
      const t = ctx.tele;
      return [{ label: '弾を作らず持続ヒット(beamPulses)>0', pass: t.projectilesSpawned === 0 && t.beamPulses > 0,
        detail: `projectilesSpawned=${t.projectilesSpawned} beamPulses=${t.beamPulses}` }];
    },
  },
  {
    name: '切替式SG', key: 'shotgun-t1-cycle',
    check: (ctx) => {
      const { transitions, seen } = countTransitions(ctx.samples, 'shotgun-t1-cycle', 'cycleMode', 'shot');
      const t = ctx.tele;
      return [{ label: '両モード確認 かつ 反転回数がリロード回数と整合', pass: seen.has('shot') && seen.has('slug') && transitions > 0 && transitions <= t.reloads + 1,
        detail: `観測モード=${[...seen].join(',')} 観測遷移=${transitions} reloads=${t.reloads}` }];
    },
  },
  {
    name: 'コイルSG', key: 'shotgun-t2-coil',
    check: (ctx) => {
      // ★近似(§4-2の「毎秒」より高頻度=300ms間隔でも、コイル弾の寿命(140px÷弾速≈300ms)は
      // ぎりぎりしか捉えられない。「70px<140pxの横ズレ比較」の代わりに、同一ペレット(id)の
      // 軌跡が「最初と最後を結ぶ直線」から外側へ膨らんでから戻る(bow型)ことを検出する
      // ——振幅0→最大→0という仕様の芯(coilShotgun.ts)は変えずに捉える、観測解像度が理由の代替指標。
      // 観測できた場合は"bow検出"、1発も追跡できなければ「観測できない」と報告する(すり替えない)。
      const track = new Map(); // id -> [{t,x,y}]
      for (const s of ctx.samples) {
        for (const p of s.projectiles) {
          if (p.weaponKey !== 'shotgun-t2-coil' || p.hostile) continue;
          if (!track.has(p.id)) track.set(p.id, []);
          track.get(p.id).push({ t: s.t, x: p.x, y: p.y });
        }
      }
      let bowFound = false, tracked = 0;
      for (const pts of track.values()) {
        if (pts.length < 3) continue;
        tracked++;
        const a = pts[0], b = pts[pts.length - 1];
        const abLen = Math.max(0.001, dist(a.x, a.y, b.x, b.y));
        let maxPerp = 0;
        for (const p of pts) {
          // 点pの直線abからの垂直距離(2D外積/長さ)。
          const cross = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y));
          const perp = cross / abLen;
          if (perp > maxPerp) maxPerp = perp;
        }
        if (maxPerp > 8) bowFound = true; // 直線からの膨らみが8px超=単純な直進拡散とは違う軌道
      }
      return [{ label: '弾が外へ広がってから再収束する(bow型軌道・近似)', pass: tracked > 0 ? bowFound : null,
        detail: tracked === 0 ? '観測できない(コイル弾の軌跡を300ms間隔で3点以上追跡できなかった)' : `追跡できたペレット${tracked}発中bow検出=${bowFound}` }];
    },
  },
  {
    name: '誘導散弾SG', key: 'shotgun-t3-homing',
    check: (ctx) => {
      // 「必ず命中/1体なら全弾集中」はsrc/utils/homingShotgun.test.tsの純関数テストで担保
      // (既存: 「1体だけなら全弾が同じ1体に集中する」= §7-3の要求そのもの・batch C-2から存在)。
      // 走査ではC1〜C4のみを見る(仕様どおり=このrowは武器固有チェック無し)。
      return [];
    },
  },
  {
    name: 'デザートテック', key: 'rifle-t1-deserttech',
    check: (ctx) => {
      let rifleHitZero = false, otherDecreased = false;
      let firstOther = null, lastOther = null;
      for (const s of ctx.samples) {
        if (s.player.ammoRifle === 0) rifleHitZero = true;
        const otherSum = s.player.ammoHandgun + s.player.ammoShotgun + s.player.ammoGlauncher;
        if (firstOther === null) firstOther = otherSum;
        lastOther = otherSum;
      }
      otherDecreased = firstOther !== null && lastOther < firstOther;
      const t = ctx.tele;
      return [{ label: 'ライフル弾0でも発射>0 かつ他弾が減る', pass: rifleHitZero && t.projectilesSpawned > 0 && otherDecreased,
        detail: `ammoRifle0到達=${rifleHitZero} shots=${t.projectilesSpawned} 他弾${firstOther}→${lastOther}` }];
    },
  },
  {
    name: '大型狙撃銃', key: 'rifle-t2-heavysniper',
    check: (ctx) => {
      // 同一ラン内比較(§7-4): 静止蓄積(heavySniperStillMs)が大きい時ほど交戦距離が伸びるか。
      let stillHigh = null, stillLow = null;
      for (const s of ctx.samples) {
        const still = s.player.heavySniperStillMs;
        const d = nearestEnemyDist(s);
        const hasFire = s.projectiles.some(p => p.weaponKey === 'rifle-t2-heavysniper' && !p.hostile);
        if (!hasFire || d === Infinity) continue;
        if (still >= 2800) { if (stillHigh === null || d > stillHigh) stillHigh = d; }
        else if (still <= 200) { if (stillLow === null || d > stillLow) stillLow = d; }
      }
      const pass = stillHigh !== null && stillLow !== null ? stillHigh > stillLow : null;
      return [{ label: '静止3秒後の射程 > 直後(同一ラン内比較)', pass,
        detail: stillHigh === null || stillLow === null ? '観測できない(静止3秒到達 または 静止直後の発射を捉えられなかった)' : `静止直後の最大交戦距離=${Math.round(stillLow)}px / 3秒静止後=${Math.round(stillHigh)}px` }];
    },
  },
  {
    name: 'レールガン', key: 'rifle-t3-railgun',
    check: (ctx) => {
      const t = ctx.tele;
      const autoShots = t.projectilesSpawned - t.manualShots;
      const guaranteedCrits = t.critStats.total.guaranteedCrits;
      return [
        { label: 'オートでも発射>0', pass: autoShots > 0, detail: `auto(推定)=${autoShots}(total=${t.projectilesSpawned} manual=${t.manualShots})` },
        { label: '手動発射が成立する(manualShots>0)', pass: t.manualShots > 0, detail: `manualShots=${t.manualShots}` },
        { label: '確定クリティカルを観測(頭部命中相当・近似)', pass: guaranteedCrits > 0, detail: `guaranteedCrits=${guaranteedCrits}(近接の確定クリと重複しうる=近似)` },
      ];
    },
  },
  {
    name: 'ボルトアクション', key: 'rifle-t1-bolt',
    check: (ctx) => {
      let maxEngageAtFire = 0;
      for (const s of ctx.samples) {
        if (s.projectiles.some(p => p.weaponKey === 'rifle-t1-bolt' && !p.hostile)) {
          const d = nearestEnemyDist(s);
          if (d < Infinity && d > maxEngageAtFire) maxEngageAtFire = d;
        }
      }
      return [{ label: `既定ライフル射程(${RANGE_BY_CATEGORY.rifle}px)超での交戦を観測`, pass: maxEngageAtFire > RANGE_BY_CATEGORY.rifle,
        detail: `発射観測中の最大交戦距離(近似)=${Math.round(maxEngageAtFire)}px(rangeOverride=${BOLT_RANGE_PX}px)` }];
    },
  },
  {
    name: '氷槍ライフル', key: 'rifle-t2-icelance',
    check: (ctx) => {
      // 床(未凍結)の終点(bx,by)が、対応する生きた弾(projectileId一致)の現在位置と揃っているか。
      // ずれていれば「弾より先まで伸びている」旧バグ(検収監査A-1)の再発。
      let checked = 0, mismatched = 0;
      for (const s of ctx.samples) {
        for (const f of s.iceLanceFloors) {
          if (f.frozen) continue;
          const proj = s.projectiles.find(p => p.id === f.projectileId);
          if (!proj) continue;
          checked++;
          if (dist(f.bx, f.by, proj.x, proj.y) > 24) mismatched++; // 24px=弾サイズ+移動の余裕
        }
      }
      const anyFloor = ctx.samples.some(s => s.iceLanceFloors.length > 0);
      return [{ label: '床は弾の後ろに伸びる(先行しない)', pass: checked > 0 ? mismatched === 0 : null,
        detail: checked === 0 ? (anyFloor ? '床は観測したが弾との対応が取れなかった' : '観測できない(床が1本も観測できなかった)') : `${checked}回中${mismatched}回で床が弾の位置と24px超ずれた` }];
    },
  },
  {
    name: 'アイレーザー', key: 'rifle-t3-eyelaser',
    check: (ctx) => {
      const t = ctx.tele;
      const beamSeen = ctx.samples.some(s => s.eyeLaserBeam !== null);
      return [
        { label: '照射(弾を作らない持続線)が観測できる', pass: t.projectilesSpawned === 0 && beamSeen && t.beamPulses > 0,
          detail: `projectilesSpawned=${t.projectilesSpawned} beamPulses=${t.beamPulses} beam観測=${beamSeen}` },
        // ★仕様は v0.25.4193 で「再ターゲット無し」→「敵が死んだら時間までは次の標的へ少しゆっくり
        // 合わせにいく」へ変わっている(社長指示2026-09-08)。照射の残り時間を使い切るかは
        // キル時刻との対応づけが要るので観測しない。ここでは貫通だけを見る。
        { label: '貫通する(1パルスで2体以上に当たった回数>0)', pass: t.beamPulses > 0 ? t.beamMultiHitPulses > 0 : null,
          detail: t.beamPulses === 0 ? '観測できない(パルスが1度も発生していない)' : `beamMultiHitPulses=${t.beamMultiHitPulses} / beamPulses=${t.beamPulses}` },
      ];
    },
  },
  {
    name: 'ロケラン', key: 'glauncher-t1-rocket',
    check: (ctx) => {
      const t = ctx.tele;
      return [
        { label: '着弾すると爆発する(explosions>0)', pass: t.explosions > 0, detail: `explosions=${t.explosions}` },
        { label: '何にも当たらなければ不発', pass: null, detail: '観測できない(常に敵がいる実戦シナリオでは「何もない方向」を作れない=湧きを止める口が無い。§4-3と同じ制約)' },
      ];
    },
  },
  {
    name: '錬金砲', key: 'glauncher-t2-alchemy', manual: true, resetCheck: true,
    check: (ctx) => {
      const t = ctx.tele;
      const stage3 = ctx.samples.some(s => s.enemies.some(e => (e.alchemyStoneStage ?? 0) >= 3));
      // 起爆1回で2体以上: stoneDetonationsが1以上増えた直後、alchemyStoneStage持ちの敵が同時に
      // 2体以上いた(=起爆対象が複数)ことをサンプルから近似する。
      let multiTargetDetonation = false;
      let prevDet = 0;
      for (const s of ctx.samples) {
        const stoneCount = s.enemies.filter(e => (e.alchemyStoneStage ?? 0) > 0).length;
        if (s.telemetry.stoneDetonations > prevDet && stoneCount >= 2) multiTargetDetonation = true;
        prevDet = s.telemetry.stoneDetonations;
      }
      return [
        { label: '付着>0', pass: t.stonesAttached > 0, detail: `stonesAttached=${t.stonesAttached}` },
        { label: '3段到達を観測', pass: stage3, detail: `3段到達=${stage3}` },
        { label: '起爆(stoneDetonations)>0', pass: t.stoneDetonations > 0, detail: `stoneDetonations=${t.stoneDetonations}` },
        { label: '起爆1回で2体以上に届く(近似)', pass: t.stoneDetonations > 0 ? multiTargetDetonation : null,
          detail: t.stoneDetonations === 0 ? '観測できない(起爆自体が発生しなかった)' : `起爆時に石持ち敵2体以上を観測=${multiTargetDetonation}` },
      ];
    },
  },
  {
    name: 'シグナル', key: 'glauncher-t3-signal', manual: true, resetCheck: true,
    check: (ctx) => {
      const t = ctx.tele;
      const signalKeyShots = ctx.samples.some(s => s.projectiles.some(p => p.weaponKey === 'glauncher-t3-signal' && !p.hostile));
      // dueAt(=記録時刻+900ms・両方gameTime)を持つstrikeが、消滅した時のサンプル時刻tと近いか。
      const seenStrikes = new Map(); // id -> {dueAt, lastSeenT}
      for (const s of ctx.samples) {
        for (const st of s.signalStrikes) seenStrikes.set(st.id, { dueAt: st.dueAt, lastSeenT: s.t });
        for (const [id, rec] of seenStrikes) {
          if (!s.signalStrikes.some(st => st.id === id) && rec.resolvedAtT === undefined) rec.resolvedAtT = s.t;
        }
      }
      let delayOk = 0, delayChecked = 0;
      for (const rec of seenStrikes.values()) {
        if (rec.resolvedAtT === undefined) continue;
        delayChecked++;
        if (Math.abs(rec.resolvedAtT - rec.dueAt) <= SAMPLE_MS * 3) delayOk++;
      }
      return [
        { label: 'signalキーの弾は自動発射されない(手動専用)', pass: !signalKeyShots, detail: signalKeyShots ? 'signal弾を観測(手動専用のはずが自動発射)' : '観測どおり0' },
        { label: '記録から約900ms後(gameTime基準)に着弾', pass: delayChecked > 0 ? delayOk === delayChecked : null,
          detail: delayChecked === 0 ? '観測できない(空爆の消滅を1件も捉えられなかった)' : `${delayChecked}件中${delayOk}件がdueAt通りに消滅` },
        { label: '体勢崩し>0', pass: t.postureBroken > 0, detail: `postureBroken=${t.postureBroken}` },
      ];
    },
  },
  {
    name: '金環', key: null, sub: 'gold-ring',
    check: (ctx) => {
      const t = ctx.tele;
      const deployedTwo = ctx.samples.some(s => s.goldRings.length >= 2);
      // 本体無ダメージ: プレイヤーのdamageTaken計測窓は既存telemetryに無い(gameStats.damageTaken)。
      // ここではgoldRings由来の自傷経路が無い設計(仕様上プレイヤーは対象にならない)を、
      // 「金環展開中に自弾が原因のダメージ源(hateSource等)が記録されないか」までは既存窓口で
      // 追えないため、展開・パルスの成立のみを機械観測し、本体無ダメージは観測対象外と明記する。
      let lockedDir = true;
      const beamDirById = new Map();
      for (const s of ctx.samples) {
        for (const r of s.goldRings) {
          if (r.phase !== 'firing' || !r.beam) continue;
          const dirKey = `${Math.round(r.beam.ax)},${Math.round(r.beam.ay)},${Math.round(r.beam.bx)},${Math.round(r.beam.by)}`;
          const prev = beamDirById.get(r.id);
          if (prev !== undefined && prev !== dirKey) lockedDir = false;
          beamDirById.set(r.id, dirKey);
        }
      }
      return [
        { label: '2本展開する', pass: deployedTwo, detail: `2本同時展開を観測=${deployedTwo}` },
        { label: 'パルス(beamPulses)>0', pass: t.beamPulses > 0, detail: `beamPulses=${t.beamPulses}` },
        { label: '発射後、射線(a/b)が固定される(追尾しない)', pass: beamDirById.size > 0 ? lockedDir : null,
          detail: beamDirById.size === 0 ? '観測できない(firing中の金環を捉えられなかった)' : `射線固定を観測=${lockedDir}` },
        { label: '本体無ダメージ', pass: null, detail: '観測できない(既存のbotTelemetryにプレイヤー被ダメの原因別内訳が無い=取れない信号を条件にしない)' },
      ];
    },
  },
];

// ── サーバ(build→preview。botrun-local.mjsと同じ)────────────────────────────────
console.log('[setup] npm run build(最新HEADをテストするため毎回ビルド)');
execSync('npm run build', { cwd: root, stdio: 'inherit' });
const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { cwd: root, stdio: 'ignore', shell: true });
server.on('error', (e) => console.error('[setup] previewサーバのspawnに失敗:', e.message));
let up = false;
for (let i = 0; i < 30 && !up; i++) {
  try { const r = await fetch('http://localhost:4173/zombie/'); up = r.ok; } catch { /* retry */ }
  if (!up) await new Promise(r => setTimeout(r, 1000));
}
if (!up) { console.error('[setup] previewサーバが起動しない'); server.kill(); process.exit(1); }
const baseUrl = 'http://localhost:4173/zombie/';
console.log('[setup] preview起動OK →', baseUrl);

const browser = await chromium.launch({ headless: true, channel: 'chrome' })
  .catch(() => chromium.launch({
    headless: true,
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  }));

const filterArg = process.argv[2];
const filters = filterArg ? filterArg.split(',').map(s => s.trim()).filter(Boolean) : null;
const targets = filters
  ? WEAPONS.filter(w => filters.some(f => (w.key ?? '').includes(f) || (w.sub ?? '').includes(f) || w.name.includes(f)))
  : WEAPONS;

const stamp = new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '').replace(/(\d{8})(\d{4})/, '$1-$2');

// ★実測メモ(2026-09-08): このコンテナはソフトウェアレンダリング(swiftshader)でgameTimeの進みが
// 実時間の1/35〜1/40しか無い(4本の独立プローブで再現)。並行実行(複数コンテキストを同時に開く)を
// 試したが、CPUを奪い合うだけで合計スループットはほぼ伸びなかった(2並行でも合計サンプル数は
// 直列1本とほぼ同じ)。⇒ 既定は直列(concurrency=1)。並行にしたい場合のみ環境変数で上げる。
const CONCURRENCY = Number(process.env.WEAPON_SWEEP_CONCURRENCY ?? 1);
const PER_WEAPON_HARD_TIMEOUT_MS = RUN_MS + 120000; // 関門/評価が詰まった時の保険(1挺がハングして全体を止めない)

async function runWeaponInner(wpn) {
  const ctx0 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx0.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 500)); });
  page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 500)));

  const q = ['smoke=1', 'stage=stage-1', 'autotut=1', 'bot=standard', 'botskill=master'];
  if (wpn.key) q.push(`weapon=${wpn.key}`);
  if (wpn.sub) q.push(`sub=${wpn.sub}`);
  const url = `${baseUrl}?${q.join('&')}`;
  console.log(`[run] ${wpn.name}(${wpn.key ?? wpn.sub}) → ${url}`);
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load' });

  await page.waitForTimeout(9000);
  const titleTxt = await page.evaluate(() => document.body.innerText).catch(() => '');
  if (titleTxt.includes('はじめる')) {
    try { await page.getByText('はじめる', { exact: false }).first().click({ timeout: 15000 }); } catch { /* 記録のみ */ }
  }
  await page.waitForFunction(() => !!document.querySelector('canvas'), { timeout: 60000 }).catch(() => {});

  const samples = [];
  let manualTick = 0;
  // ★C3のresetGameは botTelemetry も全カウンタ0にする(botTelemetry.ts「リセット」)。だから
  // 「リセットしてから更にサンプルを取り続ける」と、最後のサンプル=空の集計になり、この武器の
  // 全チェックが0で偽赤になる(実測: 錬金砲/シグナルが gameTime=0ms・全カウンタ0で返っていた)。
  // ⇒ C3は走行の最後に1回だけ行い、resetSampleを取ったらそこで打ち切る。
  const resetAtMs = wpn.resetCheck ? RUN_MS - 2000 : -1;
  let resetSample = null;
  while (Date.now() - t0 < RUN_MS) {
    await page.waitForTimeout(SAMPLE_MS);
    if (wpn.manual && Date.now() - t0 - manualTick * MANUAL_FIRE_MS >= MANUAL_FIRE_MS) {
      manualTick++;
      await page.evaluate(() => window.__BOT_MANUAL_FIRE__?.()).catch(() => {});
    }
    const s = await page.evaluate(() => window.__BOT_SAMPLE__?.()).catch(() => null);
    if (s) samples.push(s);
    if (resetAtMs >= 0 && Date.now() - t0 >= resetAtMs && !resetSample) {
      // research/WEAPON_AI_TEST.md S3-c(C3): この武器の一時状態を作った状態で1回resetGameし、
      // 次サンプルで対象フィールドが空かを見る。
      await page.evaluate(() => window.__BOT_RESET__?.()).catch(() => {});
      await page.waitForTimeout(500);
      resetSample = await page.evaluate(() => window.__BOT_SAMPLE__?.()).catch(() => null);
      break; // ★リセット後のサンプルを集計に混ぜない(上のコメント)。
    }
  }
  await ctx0.close();

  const last = samples[samples.length - 1] ?? null;
  const tele = finalTelemetry(samples);
  const checks = [];

  if (!last || !tele) {
    checks.push({ label: '__BOT_SAMPLE__が一度も取れなかった', pass: false, detail: 'サンプル0件(関門で止まった可能性)' });
  } else {
    // C1(層Aのみ): ダメージ>0。classifyProjectileDamageChannel(botTelemetry.ts)どおり、
    // glauncher系/goldringは'other'。さらにnonProjectile(弾を作らない持続線)のアイレーザー/
    // 火炎放射器はapplyBeamPulse(useGameLoop.ts)がdamageChannel='other'固定で記録するので同枠
    // (氷槍ライフルは通常弾もあるので'gun'のまま=床パルスだけ'other'だが弾ダメージで満たせる)。
    const OTHER_CHANNEL_ONLY = new Set(['rifle-t3-eyelaser', 'shotgun-t3-flamer']);
    const isOtherChannel = wpn.key?.startsWith('glauncher-') || wpn.sub === 'gold-ring' || OTHER_CHANNEL_ONLY.has(wpn.key ?? '');
    const dmg = isOtherChannel ? tele.damageDealt.other : tele.damageDealt.gun;
    checks.push({ label: 'C1: その武器で与えたダメージ>0', pass: dmg > 0, detail: `channel=${isOtherChannel ? 'other' : 'gun'} dealt=${Math.round(dmg)}` });
    // C2は層A(実機)専用だが、ヘッドレスと違い本走査もdropEnemyCurrencyは通常のゲーム経路
    // (gameStore.ts)を通る=鏡を測っていない。currencyDroppedをC2として見る(クレートは
    // 強個体の湧きが確率依存なので情報としてのみ添える)。
    checks.push({ label: 'C2: キル時に通貨が落ちる', pass: tele.currencyDropped > 0, detail: `currencyDropped=${tele.currencyDropped} cratesDropped(参考)=${tele.cratesDropped}` });
    // C3
    if (wpn.resetCheck) {
      if (resetSample) {
        const empty = resetSample.goldRings.length === 0 && resetSample.iceLanceFloors.length === 0
          && resetSample.signalStrikes.length === 0 && resetSample.eyeLaserBeam === null
          && resetSample.flamerCone === null && resetSample.enemies.every(e => !(e.alchemyStoneStage > 0));
        checks.push({ label: 'C3: resetGame直後に一時状態が空', pass: empty, detail: empty ? '空を確認' : JSON.stringify({ goldRings: resetSample.goldRings.length, iceLanceFloors: resetSample.iceLanceFloors.length, signalStrikes: resetSample.signalStrikes.length, eyeLaserBeam: resetSample.eyeLaserBeam, flamerCone: resetSample.flamerCone }) });
      } else {
        checks.push({ label: 'C3: resetGame直後に一時状態が空', pass: null, detail: '観測できない(__BOT_RESET__後のサンプルが取れなかった)' });
      }
    }
    // C4
    checks.push({ label: 'C4: コンソールエラー0', pass: errors.length === 0, detail: `errors=${errors.length}` });
    // 武器ごと
    checks.push(...wpn.check({ samples, tele, last }));
  }

  const failed = checks.filter(c => c.pass === false);
  const unknown = checks.filter(c => c.pass === null);
  const result = { weapon: wpn.name, key: wpn.key, sub: wpn.sub, realSec: Math.round((Date.now() - t0) / 1000), sampleCount: samples.length, finalGameTimeMs: last?.t ?? null, errors, checks, failed: failed.length, unknown: unknown.length };
  console.log(`[done] ${wpn.name}: checks=${checks.length} 失敗=${failed.length} 観測不能=${unknown.length} samples=${samples.length} gameTime=${last?.t ?? 'なし'}ms`);
  return result;
}

// 1挺がハング(evaluateが返らない等)しても全体を止めないための保険。失敗した挺は
// 「実走できなかった」として結果に残す(黙って落とさない)。
async function runWeapon(wpn) {
  let timer;
  try {
    return await Promise.race([
      runWeaponInner(wpn),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('per-weapon hard timeout')), PER_WEAPON_HARD_TIMEOUT_MS); }),
    ]);
  } catch (e) {
    console.log(`[fail] ${wpn.name}: ${e.message}`);
    return {
      weapon: wpn.name, key: wpn.key, sub: wpn.sub, realSec: null, sampleCount: 0, finalGameTimeMs: null,
      errors: [String(e.message)],
      checks: [{ label: '実走できなかった', pass: false, detail: String(e.message) }],
      failed: 1, unknown: 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

// 簡易な並行数制限プール(依存追加を避けるため自前実装)。
async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

const results = await runPool(targets, runWeapon, CONCURRENCY);

await browser.close();
server.kill();

const outPath = path.join(outDir, `${stamp}-weapon-sweep-raw.json`);
fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), runMs: RUN_MS, results }, null, 2));
console.log(`[out] ${outPath}`);

// ── §7-5形式のサマリ ───────────────────────────────────────────────────────
const totalFailed = results.filter(r => r.failed > 0);
console.log('\n=== 全武器AI走査 (層A: 実機ボット) ===');
console.log(`  ${results.length - totalFailed.length}/${results.length} 緑(観測不能行を除く)`);
for (const r of results) {
  if (r.failed === 0) continue;
  console.log(`  ✗ ${r.weapon}(${r.key ?? r.sub})`);
  for (const c of r.checks) {
    if (c.pass === false) console.log(`      - [${c.label}] 観測: ${c.detail}`);
  }
}
const anyUnknown = results.filter(r => r.unknown > 0);
if (anyUnknown.length) {
  console.log('\n  観測できなかった行:');
  for (const r of anyUnknown) {
    for (const c of r.checks) {
      if (c.pass === null) console.log(`    ・${r.weapon}: [${c.label}] ${c.detail}`);
    }
  }
}
