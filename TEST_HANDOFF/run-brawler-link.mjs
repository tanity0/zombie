// 格闘の「つながり」(research/BRAWLER.md §19)を、実際のゲームのループ(useGameLoop)を回したまま確かめるランナー(2026-11-11)。
// 使い方: dev サーバを上げて(既定 5201 番・`npx vite --port 5201 --strictPort`)、プロジェクト直下で `node TEST_HANDOFF/run-brawler-link.mjs [port]`。目安3分。
// 読み方: ROUTE の行は「つながる道」1本ぶん。hits=当たった数・unheld=当たりと当たりの間に敵が固まっていなかったフレーム(0が正)・
//   walked=その間に敵が自分で動いた量(px・0付近が正)・stunSeen=途中で会心(気絶)が出た回・fail="enemy or brawler gone" は雑魚が気絶中の1発で処刑された回(今の決まり)。
//   「空振り」は固まりの話ではなく当たりの位置の話(例: 飛び蹴りの3発目は溜め始めの敵の位置へ飛ぶ=2発目の押しで滑った強個体に届かない回がある・2026-11-11 時点で16回中2回)。
//   NONLINK は「つながらない物」(N1=待機から出した表の外の技・N2=締めの後・N3=通常を押し続けても止め続けられない)。MISC は空振りと秘奥義。
// 仕組み: ヘッドレスは rAF が毎秒2回まで絞られ、GPU 無しの描画は1枚0.5秒かかる=rAF をタイマーへ差し替え、描画(scene.sync と renderer.render)だけ止める。
//   ゲームのループ・store・敵の AI は本物で、実時間(毎秒約50フレーム・幅は自然に揺れる)で回る。乱数も本物=会心が出る(ユニットテストは乱数を固定している)。
import { chromium } from 'playwright';
const PORT = process.argv[2] || '5201';
const b = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const errs = [];
p.on('pageerror', e => errs.push('pageerror ' + String(e).slice(0, 300)));
p.on('console', m => { const t = m.text(); if (t.startsWith('KOF ')) console.log(t.slice(0, 600)); else if (m.type() === 'error') errs.push('console ' + t.slice(0, 300)); });
await p.addInitScript(() => {
  // ヘッドレスは rAF が毎秒2回まで絞られる=タイマーで回す(ゲームのループ自体は本物)。描画は下で止める(GPU 無しで1枚0.5秒かかる)。
  let id = 0; const m = new Map();
  window.requestAnimationFrame = cb => { const k = ++id; m.set(k, setTimeout(() => { m.delete(k); cb(performance.now()); }, 16)); return k; };
  window.cancelAnimationFrame = k => { clearTimeout(m.get(k)); m.delete(k); };
});
await p.goto(`http://127.0.0.1:${PORT}/zombie/?smoke=1&stage=stage-1&autotut=1&sub=brawler&nospawn=1`, { timeout: 120000 });
await p.waitForFunction(() => !!document.querySelector('canvas') && !!window.__gameStore, null, { timeout: 120000 });
await p.waitForTimeout(12000);
await p.evaluate(() => { const sc = window.__pixiScene; sc.sync = () => {}; sc.renderer.render = () => {}; });
const version = await p.evaluate(() => document.body.innerText.match(/v?0\.25\.\d+/)?.[0] ?? null);
console.log('VERSION', version);

const res = await p.evaluate(async () => {
  const gs = window.__gameStore;
  const eu = await import('/zombie/src/utils/enemyUtils.ts');
  const BR = await import('/zombie/src/utils/brawler.ts');
  const BC = await import('/zombie/src/utils/brawlerCombo.ts');
  const out = { routes: [], nonlink: [], misc: {} };
  const pushN = (o) => { out.nonlink.push(o); console.log('KOF NONLINK ' + JSON.stringify(o)); };
  const st = () => gs.getState();
  const br = () => st().player.brawler;
  const en = () => st().enemies.find(x => x.id === 'z');
  // 毎フレームの頭に呼ぶ関数(1つだけ)
  let onFrame = null; const dts = []; let lastGt = st().gameTime;
  gs.subscribe((s, prev) => { if (s.gameTime !== prev.gameTime) { dts.push(s.gameTime - lastGt); lastGt = s.gameTime; try { onFrame?.(); } catch (e) { out.misc.driverError = String(e); onFrame = null; } } });
  const frames = (n) => new Promise(r => { let k = 0; const prevF = onFrame; onFrame = () => { prevF?.(); if (++k >= n) { onFrame = prevF; r(); } }; });
  const until = (cond, max = 900) => new Promise(r => { let k = 0; const f0 = onFrame; onFrame = () => { f0?.(); if (cond() || ++k >= max) { onFrame = f0; r(k < max); } }; });

  const setup = (points = 20) => {
    gs.setState(s => ({
      m0Unlocked: { ...s.m0Unlocked, melee: true, crit: true },
      enemies: [], projectiles: [],
      player: { ...s.player, health: 999999, maxHealth: 999999, subWeapons: ['brawler'], subWeaponLevels: { ...(s.player.subWeaponLevels ?? {}), brawler: 3 },
        lastDirection: { x: 1, y: 0 }, brawler: { ...BR.initialBrawlerState(), points } },
    }));
  };
  const place = (type, dx, extra = {}) => {
    const s = st(); const q = s.player;
    const e = eu.spawnEnemyAt(type, 0, 0, s.gameTime);
    gs.setState({ enemies: [{ ...e, x: q.x + q.width / 2 + dx - e.width / 2, y: q.y + q.height / 2 - e.height / 2, id: 'z', health: 9999999, maxHealth: 9999999, dormant: false, ...extra }] });
  };
  const spawnFoe = (foe) => {
    const g = st().gameTime;
    if (foe === 'zombie') place('zombie', 60);
    else if (foe === 'driller-windup') place('driller', 60, { aiPhase: 'driller-thrust-windup', aiPhaseUntil: g + 600, aiStartedAt: g });
    else if (foe === 'hunter-move') place('hunter', 60);
    else place('hunter', 60, { aiPhase: 'windup', aiPhaseUntil: g + 600, aiStartedAt: g });
  };
  const FLICK = { kick: [1, 0], stomp: [0, 1], kiko: [-1, 0], guard: [0, -1] };
  const issue = (stp) => (stp.stage ? st().brawlerPress() : st().brawlerTech(FLICK[stp.tech][0], FLICK[stp.tech][1]));
  const isRunning = (stp, b) => (stp.stage ? b.phase === 'attack' && b.stage === stp.stage : b.phase === 'tech' && b.tech === stp.tech);

  /** 道を流す(先行入力=当たった直後に次を入れる)。当たりは格闘の状態(判定を解いた+当たった)で数える。 */
  const runRoute = async (foe, name, steps) => {
    setup(); spawnFoe(foe);
    await frames(2);
    const m = { foe, name, hits: 0, issued: 0, unheld: 0, walked: 0, phaseChanges: 0, frames: 0, gunHits: 0, fail: null, maxDt: 0 };
    let idx = 0, kickSeen = 0, lastResolvedKey = '', px = 0, py = 0, phase, lastHit, watching = false, done = false, kikoFiredAt = 0, lastBrHitAt = -1;
    const dt0 = dts.length;
    const finished = new Promise(resolve => {
      let guard = 0;
      onFrame = () => {
        if (done) return;
        if (++guard > 1500) { m.fail = m.fail ?? 'timeout'; done = true; onFrame = null; resolve(); return; }
        const s = st(); const b = s.player.brawler; const z = s.enemies.find(x => x.id === 'z'); const g = s.gameTime; const now = Date.now();
        if (!z || !b) { m.fail = 'enemy or brawler gone'; done = true; onFrame = null; resolve(); return; }
        // 当たりの数え(格闘の状態)
        const hits0 = m.hits; const key = `${b.phase}:${b.stage}:${b.tech}:${b.kickN}:${b.startedAt ?? ''}`;
        if ((b.phase === 'attack' || b.phase === 'tech') && b.resolved && key !== lastResolvedKey) {
          lastResolvedKey = key;
          if (b.phase === 'tech' && b.tech === 'kiko') { kikoFiredAt = g; lastHit = z.lastHit; }
          else if (b.connected) { m.hits++; watching = true; }
          else { m.fail = `空振り: ${idx} 手目(${b.phase === 'attack' ? b.stage + '段目' : b.tech + (b.kickN || '')})`; m.whiff = true; done = true; onFrame = null; resolve(); return; } // 空振りしたらその道はそこで終わり(後ろの道を汚さない)
        }
        if (kikoFiredAt && z.lastHit !== lastHit) { m.hits++; kikoFiredAt = 0; }
        // 見張り
        const held = BC.brawlerHeldNow(z, g, now); const air = BC.brawlerAirborne(z, now); const pushed = now < (z.knockbackUntil ?? 0);
        if ((z.stunUntil ?? 0) > g) m.stunSeen = true;
        if (watching && m.hits === hits0 && m.hits < steps.length) {
          m.frames++;
          if (!held && !air) m.unheld++;
          if (!pushed && !air) m.walked += Math.hypot(z.x - px, z.y - py);
          if (z.aiPhase !== phase) m.phaseChanges++;
        }
        px = z.x; py = z.y; phase = z.aiPhase;
        // 入力
        if (idx === 0) { if (b.phase === 'idle' && issue(steps[0])) { idx = 1; m.issued++; } }
        else if (idx < steps.length) {
          const prev = steps[idx - 1];
          if (isRunning(prev, b) && b.resolved && (b.connected || prev.tech === 'kiko')) {
            if (issue(steps[idx])) { idx++; m.issued++; }
          } else if (b.phase === 'idle' && m.issued === idx && guard > 5 && !isRunning(prev, b)) {
            // 前の手が終わって待機へ戻ったのに次が出ていない(先行入力は覚えたはず)。少し待って出なければ失敗。
          }
        }
        if (m.hits >= steps.length) { done = true; onFrame = null; resolve(); }
        if (b.phase === 'idle' && idx >= 1 && idx < steps.length && guard > 400) { m.fail = m.fail ?? `stalled before step ${idx}`; done = true; onFrame = null; resolve(); }
      };
    });
    await finished;
    const d = dts.slice(dt0); m.maxDt = Math.round(Math.max(0, ...d)); m.avgDt = Math.round(d.reduce((a, c) => a + c, 0) / Math.max(1, d.length));
    m.walked = Math.round(m.walked * 10) / 10;
    out.routes.push(m); console.log('KOF ROUTE ' + JSON.stringify(m));
    await frames(3);
  };
  const S = n => ({ stage: n }), T = k => ({ tech: k });
  const ROUTES = [
    ['1→2→3→4→5', [S(1), S(2), S(3), S(4), S(5)]],
    ['1→飛び蹴り×3', [S(1), T('kick'), T('kick'), T('kick')]],
    ['2→気功', [S(1), S(2), T('kiko')]],
    ['3→飛び蹴り→大踏み潰し→気功', [S(1), S(2), S(3), T('kick'), T('stomp'), T('kiko')]],
    ['4→大踏み潰し', [S(1), S(2), S(3), S(4), T('stomp')]],
  ];
  out.misc.lockFrameMsBefore = BC.getBrawlerLockFrameMs();
  for (const foe of ['zombie', 'driller-windup', 'driller-windup', 'driller-windup', 'hunter-windup', 'hunter-move']) for (const [name, steps] of ROUTES) await runRoute(foe, name, steps);
  out.misc.lockFrameMsAfter = BC.getBrawlerLockFrameMs();

  // --- つながらない物(ボス級・溜めの相) ---
  const pressUntil = async () => { let ok = false; await until(() => { ok = ok || st().brawlerPress(); return ok; }, 200); return ok; };
  const heldNow = () => { const z = en(); return BC.brawlerHeldNow(z, st().gameTime, Date.now()) || BC.brawlerAirborne(z, Date.now()); };
  // N1: 1段目を当てる→待機へ戻ってから大踏み潰し。潰しが当たる前に、敵が固まっていないフレームがあるはず。
  {
    setup(); spawnFoe('hunter-windup'); await frames(2);
    await pressUntil();
    await until(() => br().phase === 'attack' && br().resolved);
    const hit1 = br().connected;
    await until(() => br().phase === 'idle');
    const lockLeftAtIdle = Math.round((en().brLockUntil ?? 0) - st().gameTime);
    let ok = false; await until(() => { ok = ok || st().brawlerTech(0, 1); return ok; }, 100);
    let free = 0, heldPrev = null;
    await until(() => { const h = heldNow(); const r = br().phase === 'tech' && br().resolved; if (!r) { if (!h) free++; heldPrev = h; } return r; });
    pushN({ name: 'N1 1段目→待機→大踏み潰し', hit1, stompIssued: ok, lockLeftAtIdle, freeFramesBeforeStomp: free, heldJustBeforeStompHit: heldPrev, stompConnected: br().connected });
    await until(() => br().phase === 'idle');
  }
  // N2: 5段の締めの後、プレイヤーの後隙が明ける前にボス級の固まりが切れている。
  {
    setup(); spawnFoe('hunter-windup'); await frames(2);
    const hitsBy = [];
    for (let n = 1; n <= 5; n++) {
      if (n === 1) await pressUntil();
      const ok = await until(() => br().phase === 'attack' && br().stage === n && br().resolved, 300);
      hitsBy.push(ok && br().connected);
      if (n < 5) st().brawlerPress();
    }
    let freeDuringRecovery = 0, recFrames = 0;
    await until(() => { recFrames++; if (!heldNow()) freeDuringRecovery++; return br().phase === 'idle'; });
    const z = en();
    pushN({ name: 'N2 5段の締めの後', hitsBy, recFrames, freeDuringRecovery, lockMoves: z.brLockMoves ?? null, noHoldLeft: Math.round((z.brLockNoHoldUntil ?? 0) - st().gameTime) });
  }
  // N3: 止め続けられない。通常を押し続ける(1→2→3→4→5→1→…)。当たるたびに、固まりが書かれたかと固まらない時間の残りを記録する。
  for (const foe of ['hunter-windup', 'driller-windup']) {
    setup(); spawnFoe(foe); await frames(2);
    const hits = []; let lastKey = '', held = 0, fr = 0; const t0 = st().gameTime;
    await until(() => {
      const s = st(); const b = s.player.brawler; const z = en(); const g = s.gameTime; if (!z) return true;
      fr++; if (BC.brawlerHeldNow(z, g, Date.now()) || BC.brawlerAirborne(z, Date.now())) held++;
      const key = `${b.phase}:${b.stage}:${b.startedAt ?? ''}`;
      if (b.phase === 'attack' && b.resolved && key !== lastKey) { lastKey = key; hits.push(`${Math.round(g - t0)}:s${b.stage}${b.connected ? '' : '(空振り)'}:${BC.brawlerLockAlive(z, g) ? '固まる' : '固まらない'}:残${Math.max(0, Math.round((z.brLockNoHoldUntil ?? 0) - g))}`); }
      if (b.phase === 'idle' || (b.phase === 'attack' && b.resolved)) s.brawlerPress();
      // 離れたら寄せ直す(押し続けを続けるため)
      const q = s.player; const dx = (z.x + z.width / 2) - (q.x + q.width / 2);
      if (Math.abs(dx) > 75 && b.phase === 'idle') gs.setState(s2 => ({ enemies: s2.enemies.map(e => e.id === 'z' ? { ...e, x: q.x + q.width / 2 + 60 - e.width / 2, y: q.y + q.height / 2 - e.height / 2 } : e) }));
      return g - t0 > 7000;
    }, 1200);
    pushN({ name: `N3 通常を押し続ける(${foe})`, heldFrames: held, frames: fr, hits });
  }
  // W: 空振りからは取り消せない(敵なし)。後隙の間に飛び蹴りを入れても、待機へ戻るまで技が始まらない。
  {
    setup(); await frames(2);
    st().brawlerPress();
    await until(() => br().phase === 'attack' && br().resolved);
    const accepted = st().brawlerTech(1, 0);
    let techDuringRecovery = false;
    await until(() => { if (br().phase === 'tech') techDuringRecovery = true; return br().phase === 'idle' || br().phase === 'tech'; });
    await frames(20);
    out.misc.whiff = { connected: false, techInputAccepted: accepted, techStartedBeforeIdle: techDuringRecovery, phaseAfter: br().phase };
  }
  // SEC: 秘奥義 →↓←↑(雑魚・入力の間隔500ms)。
  {
    setup(); spawnFoe('zombie'); await frames(2);
    const seq = [[1, 0], [0, 1], [-1, 0], [0, -1]]; const acc = []; let started = false;
    for (let i = 0; i < 4; i++) {
      const t0 = st().gameTime;
      acc.push(st().brawlerTech(seq[i][0], seq[i][1]));
      await until(() => { if (br().secret) started = true; return started || st().gameTime - t0 >= 500; });
    }
    await until(() => { if (br().secret) started = true; return started; }, 200);
    out.misc.secret = { inputs: acc, started, progress: br().secretProgress ?? null, points: br().points };
    await until(() => !br().secret, 900);
  }
  console.log('KOF MISC ' + JSON.stringify(out.misc));
  const d = dts.slice(-600);
  out.misc.frame = { n: dts.length, avgDt: Math.round(dts.reduce((a, c) => a + c, 0) / dts.length), maxDt: Math.round(Math.max(...dts)), minDt: Math.round(Math.min(...dts)) };
  return out;
});
const bad = res.routes.filter(r => r.unheld > 0 || r.walked >= 2 || (r.fail && !r.whiff && r.fail !== 'enemy or brawler gone'));
const whiffs = res.routes.filter(r => r.whiff);
console.log(`SUMMARY 道 ${res.routes.length}本 / 固まりが外れた道 ${bad.length}本 / 空振りで終わった道 ${whiffs.length}本`);
for (const r of bad) console.log('  外れた', JSON.stringify(r));
for (const r of whiffs) console.log('  空振り', r.foe, r.name, r.fail);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(0, 8)));
await b.close();
