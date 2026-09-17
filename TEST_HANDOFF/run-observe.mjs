// 観測ランナー(P0-3 Run Manifest / P0-4 イベント連動キャプチャ / P0-5 First-run Observation Mode)。
// 出どころ: 2026-09-17_the_one_ai_review_accuracy_dev_requirements.md の P0。
//
// ★このファイルは TEST_HANDOFF/ 配下=テストチャットの担当範囲。src/ は一切書き換えない。
// ★P0-1(Test Bridge)と P0-2(Event Timeline)は src/ 側の実装が要るので**ここには入っていない**。
//   発注文は TEST_HANDOFF/REQUEST-devbridge.md。Bridge が生えたら readState() が自動でそちらを使い、
//   Bridge の名前(screenId/botReportReady 等)をこのランナーの名前へ翻訳する(監査A-5の是正)。
//
// 使い方(プロジェクト直下で実行すること。/tmp から実行すると node_modules を解決できない):
//   node TEST_HANDOFF/run-observe.mjs [mode] [分] [追加クエリ]
//     mode : smoke(既定・?smoke=1で出撃)| firstrun(タイトルから実クリックで出撃=P0-5)
//     分   : 1ランの上限(既定 8)
//     例) node TEST_HANDOFF/run-observe.mjs smoke 8 "stage=stage-1&bot=standard&botskill=master"
//        node TEST_HANDOFF/run-observe.mjs firstrun 6
//
// 前提: 状態の読み取りに window.__gameStore を使う。これは import.meta.env.DEV ゲートなので
//       **開発サーバ(5173)でだけ**生える。preview(4173)で読めるようにするのが P0-1 の目的。
//       このランナーは __TEST_BRIDGE__ があればそちらを優先するので、P0-1 着地後は 4173 でも動く。
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require_ = createRequire(path.join(process.cwd(), 'package.json'));
const pw = await import(pathToFileURL(require_.resolve('playwright')).href);
const chromium = pw.chromium ?? pw.default?.chromium;

const MODE = (process.argv[2] ?? 'smoke').toLowerCase();
const LIMIT_MS = Number(process.argv[3] ?? 8) * 60000;
const EXTRA_QUERY = process.argv[4] && process.argv[4] !== 'none' ? process.argv[4] : 'bot=standard&botskill=master&stage=stage-1';

const root = process.cwd();
const outDir = path.join(root, 'TEST_HANDOFF/results');
fs.mkdirSync(outDir, { recursive: true });
// 候補フレームの一時置き場。★Git管理外(scratchpad)。最後に最大5枚だけ results/ へ移す。
const tmpDir = path.join(process.env.TEMP ?? process.env.TMP ?? '/tmp', `zombie-observe-${Date.now()}`);
fs.mkdirSync(tmpDir, { recursive: true });

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const commit = (() => { try { return execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); } catch { return null; } })();
const stamp = new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '').replace(/(\d{8})(\d{4})/, '$1-$2');

// ── サーバ: 開発サーバ(5173)が既に上がっていればそれを使う。無ければ落として報告する ────────
// ★ここでビルドやサーバ起動をしない。理由: 裏で設計チャットが src/ を編集しているので、
//   こちらが勝手に build すると書きかけを焼いてしまう(社長指示2026-09-17の分業)。
// ★接続先。既定は開発サーバ(5173)。Test Bridge(?testbridge=1)を preview で確かめる時は
//   OBSERVE_BASE=http://localhost:4173/zombie/ を渡す。
const BASE = process.env.OBSERVE_BASE || 'http://localhost:5173/zombie/';
const alive = await fetch(BASE).then(r => r.ok).catch(() => false);
if (!alive) {
  console.error(`[setup] サーバが見つからない: ${BASE}`);
  console.error('[setup] 開発サーバなら `npm run dev`(5173)。preview なら `npx vite preview --port 4173` を先に上げる。');
  console.error('[setup] 理由: 状態の読み取りに __TEST_BRIDGE__(?testbridge=1)か __gameStore(dev のみ)が要る。');
  process.exit(1);
}
console.log(`[setup] 開発サーバに接続: ${BASE}`);

const url = MODE === 'firstrun'
  ? `${BASE}?${EXTRA_QUERY}`                    // ★smoke=1 を付けない(初見導線をそのまま通る)
  : `${BASE}?smoke=1&autotut=1&${EXTRA_QUERY}`;

const browser = await chromium.launch({ headless: false, channel: 'chrome' })
  .catch(() => chromium.launch({ headless: false }));
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

// ── 記録の箱 ───────────────────────────────────────────────────────────────────────
const events = [];        // P0-2 の外側版(src/ が発火できない範囲を、外からの観測で埋める)
const consoleErrors = [];
const shots = [];         // { file, trigger, atRealSec, atGameSec, priority }
const t0 = Date.now();
const realSec = () => Math.round((Date.now() - t0) / 1000);

const pushEvent = (eventType, gameTimeMs, extra = {}) => {
  events.push({ realSec: realSec(), gameSec: gameTimeMs === null ? null : Math.round(gameTimeMs / 1000), eventType, ...extra });
  console.log(`  [ev] ${String(realSec()).padStart(4)}s ${eventType}${extra.note ? ' — ' + extra.note : ''}`);
};

page.on('console', m => {
  if (m.type() !== 'error') return;
  const text = m.text().slice(0, 600);
  consoleErrors.push({ realSec: realSec(), text });
  pushEvent('consoleError', null, { note: text.slice(0, 120) });
});
page.on('pageerror', e => {
  const text = String(e).slice(0, 600);
  consoleErrors.push({ realSec: realSec(), text });
  pushEvent('pageError', null, { note: text.slice(0, 120) });
});

// ── 状態の読み取り(P0-1 があればそれを使い、無ければ __gameStore から同じ形を組む)────────────
const readState = () => page.evaluate(() => {
  const w = window;
  if (w.__TEST_BRIDGE__ && typeof w.__TEST_BRIDGE__.read === 'function') {
    try {
      const b = w.__TEST_BRIDGE__.read();
      // ★Bridge の名前をこのランナーが使う名前へ**必ず翻訳する**(監査A-5)。
      //   翻訳せずに展開していた旧版は、preview で死亡/クリアを検知できず時間切れまで回り、
      //   関門も押せなかった(read() には botReport も buttons も無いため)。
      return {
        via: 'bridge',
        ...b,
        screen: b.screenId ?? b.screen ?? 'unknown',
        botReport: b.botReport
          ?? (b.botReportReady ? { outcome: b.resultState ?? 'report', deathCause: b.deathCause ?? null } : null),
        bossTypes: b.bossTypes ?? [],
        buttons: b.buttons ?? Array.from(document.querySelectorAll('button,[role="button"],a'))
          .map(x => ({ text: (x.textContent || '').trim().slice(0, 40), aria: x.getAttribute('aria-label') }))
          .filter(o => o.text || o.aria).slice(0, 40),
      };
    } catch { /* fall through */ }
  }
  if (!w.__gameStore) return { via: 'none' };
  const s = w.__gameStore.getState();
  const bossLike = s.enemies.filter(e => e.bossState !== undefined || e.bossPosture !== undefined || e.isStoryBoss === true);
  const txt = document.body ? document.body.innerText : '';
  return {
    via: 'gameStore',
    gameTime: Math.round(s.gameTime),
    isPaused: !!s.isPaused,
    backgrounded: !!s.backgrounded,
    showShopMenu: !!s.showShopMenu,
    showUpgradeMenu: !!s.showUpgradeMenu,
    showEventQuestMenu: !!s.showEventQuestMenu,
    tutorialPopup: !!s.tutorialPopup,
    health: s.player?.health ?? null,
    level: s.player?.level ?? null,
    x: Math.round(s.player?.x ?? 0), y: Math.round(s.player?.y ?? 0),
    enemyCount: s.enemies.length,
    bossTypes: bossLike.map(e => String(e.type)),
    gameWon: !!s.gameWon,
    botReport: w.__BOT_REPORT__ ?? null,
    // 初見導線(P0-5)の画面判定。★実物の文字列で判定する(監査A-4の是正)。
    //  - 旧版は `/START/` でタイトルを loadout と誤判定していた(タイトルのinnerTextに START が入る)。
    //  - `出撃準備` は src/components に存在しない(grep 0件)ので missionList は一度も出なかった。
    //  - クリアの結果画面は `任務完了` ではなく **`任務達成`**(GameOverScreen.tsx)。
    //  順番が意味を持つ: ゲーム中(gameTime>0)を最優先、次に結果画面、最後に各メニュー。
    screen: s.gameTime > 0 ? 'gameplay'
      : /任務失敗|任務達成/.test(txt) ? 'result'
      : /更新情報/.test(txt) ? 'updateModal'
      : /OPERATIONS ROOM/.test(txt) ? 'opsRoom'
      : /作戦地域/.test(txt) ? 'stagePick'
      : /ジョブ選択/.test(txt) ? 'briefing'
      : /タップして開始|CAMERA[\s\S]*NEWS/.test(txt) ? 'title'
      : 'unknown',
    // ★押せる要素の「名前」を textContent / aria-label の両方で残す(P0-5 の空振り解析用。
    //   どの画面に何という名前のボタンが在ったかが results に残らないと、設計チャットが
    //   data-testid をどこに付ければよいか判断できない)。
    buttons: Array.from(document.querySelectorAll('button,[role="button"],a'))
      .map(b => ({ text: (b.textContent || '').trim().slice(0, 40), aria: b.getAttribute('aria-label') }))
      .filter(o => o.text || o.aria).slice(0, 40),
  };
}).catch(() => null);

// ── P0-4: イベント連動キャプチャ ────────────────────────────────────────────────────
// 候補は一時領域へ撮り、最後に優先度の高い順に**最大5枚だけ** results/ へ移す。
const PRIORITY = {
  death: 1, clear: 1, stall60s: 2, bossSpawn: 3, firstLevelUp: 4,
  maxEnemies: 5, timeout: 5, gameplayStarted: 6, sortieStarted: 6, shopOpened: 7,
};
const capture = async (trigger, st) => {
  if (shots.some(s => s.trigger === trigger)) return;      // 同じ契機は1枚だけ
  const file = path.join(tmpDir, `${stamp}-${MODE}-${trigger}.png`);
  await page.screenshot({ path: file }).catch(() => {});
  if (!fs.existsSync(file)) return;
  shots.push({ file, trigger, atRealSec: realSec(), atGameSec: st?.gameTime != null ? Math.round(st.gameTime / 1000) : null, priority: PRIORITY[trigger] ?? 9 });
  console.log(`  [shot] ${trigger}(候補・一時領域)`);
};

// ── 起動の関門(README「初回起動の関門」)──────────────────────────────────────────────
const clickGate = async () => page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button,[role="button"]'));
  const hit = btns.find(x => /^スキップ/.test((x.textContent || '').trim()))
    ?? btns.find(x => (x.textContent || '').trim() === 'OK');
  if (hit) { hit.click(); return (hit.textContent || '').trim(); }
  return null;
}).catch(() => null);

// ★実クリック対象は「押せる要素」だけに絞り、候補が複数ある時は**文字数が一番短いもの**を選ぶ。
// 初版は div/span まで対象にしていたため、更新情報の本文を丸ごと抱えた祖先要素を掴んで
// 「はじめる」を押したつもりで何も起きない、という空振りを起こした(実走で確認)。
const clickByText = async (re, maxLen = 40) => page.evaluate(({ src, maxLen }) => {
  const rx = new RegExp(src);
  // ★「名前」は aria-label を先に見る(アクセシブル名の優先順と同じ)。
  //   タイトルの入口は**ルートdiv全体**が role="button" + aria-label="タップして開始" で、
  //   その textContent は "v0.25.xxxxSTARTCAMERANEWS"。textContent を先に見て・長さで弾く版は、
  //   この要素を自分で除外していた(監査A-2)。**長さの上限は textContent にだけ掛ける。**
  const cands = Array.from(document.querySelectorAll('button,[role="button"],a'))
    .filter(x => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .flatMap(x => {
      const aria = (x.getAttribute('aria-label') || '').trim() || (x.getAttribute('title') || '').trim();
      const text = (x.textContent || '').trim();
      const names = [];
      if (aria) names.push({ el: x, t: aria, rank: 0 });                       // aria は長さで弾かない
      if (text && text.length <= maxLen) names.push({ el: x, t: text, rank: 1 });
      return names;
    })
    .filter(o => rx.test(o.t))
    .sort((a, b) => a.rank - b.rank || a.t.length - b.t.length);
  if (cands.length === 0) return null;
  cands[0].el.click();
  return cands[0].t.slice(0, 30);
}, { src: re.source, maxLen }).catch(() => null);

console.log(`[run] mode=${MODE} → ${url}(上限 ${Math.round(LIMIT_MS / 60000)}分)`);
pushEvent('boot', null, { note: url });
await page.goto(url, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => window.__gameStore || window.__TEST_BRIDGE__, { timeout: 120000 }).catch(() => {});

// ── P0-5: First-run Observation Mode ───────────────────────────────────────────────
// 実ユーザー相当のクリックだけでタイトル→ミッション一覧→出撃準備→STARTまで進み、各画面の滞在を測る。
const screenEnteredAt = {};
const screenSearchMs = {};
if (MODE === 'firstrun') {
  // ★ボタンの文言は 2026-09-17 に実機のDOMを読んで確定させた(v0.25.4427)。
  //   README の旧記載(はじめる → 狂い咲きの森 → ▶出撃準備 → ▶START)は**現在どれも存在しない**。
  //   文言が変わると初見導線の計測が黙って空振りするので、空振りしたら results に記録される。
  const steps = [
    { name: 'updateModal', re: /^OK$/ },                 // 更新情報モーダル
    { name: 'title', re: /タップして開始/ },              // タイトル
    { name: 'intro', re: /^スキップ$/ },                  // オープニング
    { name: 'opsRoom', re: /^出\s*撃$/ },                 // OPERATIONS ROOM(「出 撃」=間に空白)
    { name: 'stagePick', re: /洞窟地帯|座標捜索/, maxLen: 160 }, // 作戦地域の一覧(カード)
    { name: 'briefing', re: /ジョブ選択/ },               // 任務ブリーフィング
    { name: 'charSelect', re: /^スタート$/ },             // ジョブ選択 → 出撃
  ];
  for (const st of steps) {
    const enter = Date.now();
    let clicked = null;
    for (let i = 0; i < 10 && !clicked; i++) {
      clicked = await clickByText(st.re, st.maxLen ?? 40);
      if (!clicked) await page.waitForTimeout(1500);
    }
    const dwell = Date.now() - enter;
    // ★これは「その画面の滞在時間」ではなく**押せるものを探していた時間**(監査B-5)。
    //   クリック後の待ち(2.5秒)は含まない。名前も searchMs にしてある。
    screenSearchMs[st.name] = dwell;
    if (clicked) {
      pushEvent(`${st.name}Clicked`, null, { note: `「${clicked}」滞在${Math.round(dwell / 1000)}s` });
    } else {
      pushEvent(`${st.name}NotFound`, null, { note: `${Math.round(dwell / 1000)}s 探したが見つからず(既に通過/不要の可能性)` });
    }
    await page.waitForTimeout(2500);
  }
  // ★出撃の成立は「ゲームが動き出したこと」で判定する(監査A-3の是正)。
  //   旧版は7ステップが全部空振りでも sortieStarted を記録し、そのスクショまで残していた
  //   =事実と違うイベントが Manifest に入っていた。最大60秒だけ gameTime>0 を待つ。
  let sortieOk = false;
  for (let i = 0; i < 30 && !sortieOk; i++) {
    const s = await readState();
    if (s && s.via !== 'none' && s.gameTime > 0) sortieOk = true;
    else await page.waitForTimeout(2000);
  }
  if (sortieOk) {
    pushEvent('sortieStarted', null);
    await capture('sortieStarted', await readState());
  } else {
    pushEvent('sortieFailed', null, { note: '7ステップを押し終えてもゲームが始まらなかった' });
    await capture('sortieFailed', await readState());
  }
}

// ── 観測ループ ─────────────────────────────────────────────────────────────────────
let prev = null;
let shopFixes = 0, gateClicks = 0;
let maxEnemies = 0, maxEnemiesReported = 0, sawGameplay = false, sawFirstLevelUp = false, endedReason = null;
let lastProgressAt = Date.now(), lastGameTime = -1, stallCaptured = false;
const bossSeen = new Set();
let via = 'none';

while (Date.now() - t0 < LIMIT_MS) {
  await page.bringToFront();
  const st = await readState();
  if (!st) { endedReason = 'pageDead'; pushEvent('pageDead', null); break; }
  via = st.via;
  if (st.via === 'none') {
    // まだ関門の中(ストアが無い=タイトル等)。押せるものがあれば押す。
    const label = await clickGate();
    if (label) { gateClicks++; pushEvent('gateClicked', null, { note: label }); }
    await page.waitForTimeout(2000);
    continue;
  }

  // 関門(更新情報OK / 導入スキップ)。★buttons は {text, aria} の配列なので文字列比較しない
  //   (旧版は `b === 'OK'` で常に false=死んだ条件だった。監査B-1)。
  const hasGateBtn = (st.buttons ?? []).some(b => b.text === 'OK' || b.aria === 'OK' || /^スキップ/.test(b.text ?? ''));
  if (st.screen === 'updateModal' || (st.gameTime === 0 && hasGateBtn)) {
    const label = await clickGate();
    if (label) { gateClicks++; pushEvent('gateClicked', null, { note: label }); lastProgressAt = Date.now(); }
  }

  // 掟: 商人画面は false に戻して続行・回数を記録。
  // ★Bridge 経由(preview)では __gameStore が無いので closeBlockingMenu() を使う(監査A-5)。
  if (st.showShopMenu) {
    await page.evaluate(() => {
      const w = window;
      if (w.__TEST_BRIDGE__ && typeof w.__TEST_BRIDGE__.closeBlockingMenu === 'function') { w.__TEST_BRIDGE__.closeBlockingMenu(); return; }
      w.__gameStore?.setState({ showShopMenu: false });
    }).catch(() => {});
    shopFixes++;
    pushEvent('shopOpened', st.gameTime, { note: `${shopFixes}回目・falseへ戻した` });
    await capture('shopOpened', st);
  }

  // 進行
  if (st.gameTime !== lastGameTime) { lastGameTime = st.gameTime; lastProgressAt = Date.now(); stallCaptured = false; }

  if (!sawGameplay && st.gameTime > 0) {
    sawGameplay = true;
    pushEvent('gameplayStarted', st.gameTime);
    await capture('gameplayStarted', st);
  }

  if (prev) {
    // 被弾
    if (st.health !== null && prev.health !== null && st.health < prev.health) {
      pushEvent('damageTaken', st.gameTime, { note: `${prev.health} → ${st.health}` });
    }
    // レベルアップ(初回だけ撮る)
    if (st.level !== null && prev.level !== null && st.level > prev.level) {
      pushEvent('levelUp', st.gameTime, { note: `Lv${prev.level} → Lv${st.level}` });
      if (!sawFirstLevelUp) { sawFirstLevelUp = true; await capture('firstLevelUp', st); }
    }
    // ボス出現
    for (const b of st.bossTypes ?? []) {
      if (bossSeen.has(b)) continue;
      bossSeen.add(b);
      pushEvent('bossSpawn', st.gameTime, { note: b });
      await capture('bossSpawn', st);
    }
    // 同時敵数の更新(密集の瞬間)。★報告済みの水位を別に持つ:
    // 下で maxEnemies を無条件に更新しているので、同じ変数でしきい値を作ると一度も発火しない
    // (初回の実走で実際に0件だった)。
    if (st.enemyCount > maxEnemiesReported + 2) {
      maxEnemiesReported = st.enemyCount;
      pushEvent('maxEnemies', st.gameTime, { note: `同時 ${st.enemyCount} 体` });
      await capture('maxEnemies', st);
    }
  }
  if (st.enemyCount > maxEnemies) maxEnemies = st.enemyCount;

  // 終了
  if (st.botReport) {
    endedReason = st.botReport.outcome ?? 'report';
    pushEvent(endedReason === 'death' ? 'death' : endedReason === 'clear' ? 'clear' : 'return', st.gameTime,
      { note: `deathCause=${st.botReport.deathCause ?? '-'} damageTaken=${st.botReport.damageTaken ?? '-'}` });
    await capture(endedReason === 'clear' ? 'clear' : 'death', st);
    break;
  }

  // 停滞(60秒)
  const stalled = Date.now() - lastProgressAt;
  if (stalled > 60000 && !stallCaptured) {
    stallCaptured = true;
    pushEvent('stall60s', st.gameTime, { note: `shop=${st.showShopMenu} upgrade=${st.showUpgradeMenu} paused=${st.isPaused} screen=${st.screen}` });
    await capture('stall60s', st);
  }
  if (stalled > 300000) { endedReason = 'stallAbort'; pushEvent('stallAbort', st.gameTime); break; }

  prev = st;
  await page.waitForTimeout(1000);
}
if (!endedReason) { endedReason = 'timeLimit'; pushEvent('timeout', lastGameTime); await capture('timeout', await readState()); }

const finalState = await readState();

// ★B(P0-2)の回収: src 側が溜めた短命イベント(dodge/counter/skillUsed/upgrade*/enemySpawn/
//   bossDefeated/paused/resumed)を丸ごと取る。?testbridge=1 が無ければ undefined。
const bridgeEvents = await page.evaluate(() => {
  const f = window.__TEST_EVENTS__;
  return typeof f === "function" ? f() : null;
}).catch(() => null);
const bridgeEventCounts = (bridgeEvents ?? []).reduce((m, e) => { m[e.eventType] = (m[e.eventType] ?? 0) + 1; return m; }, {});

// ── P0-4の後段: 一時領域から results/ へ **最大5枚だけ** 移す ──────────────────────────
shots.sort((a, b) => a.priority - b.priority || a.atRealSec - b.atRealSec);
const kept = shots.slice(0, 5);
const dropped = shots.slice(5);
for (const s of kept) {
  const dest = path.join(outDir, path.basename(s.file));
  fs.copyFileSync(s.file, dest);
  s.kept = path.basename(dest);
}
for (const s of dropped) s.kept = null;

// ── P0-3: Run Manifest ────────────────────────────────────────────────────────────
const manifest = {
  schema: 'run-manifest/1',
  run: {
    mode: MODE, url, stamp,
    startedAt: new Date(t0).toISOString(),
    endedAt: new Date().toISOString(),
    realSec: realSec(),
    endedReason,
    stateSource: via,   // 'bridge'(P0-1着地後) / 'gameStore'(dev 5173) / 'none'
  },
  build: { version: pkg.version, commit },
  env: {
    os: `${process.platform} ${process.arch}`,
    node: process.version,
    browser: browser.version ? browser.version() : null,
    headed: true,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1, isMobile: false, hasTouch: false,
    server: BASE,
  },
  query: Object.fromEntries(new URL(url).searchParams.entries()),
  // ★seed: 現状 src/ 側に URL から乱数seedを受ける口が無い(mulberry32(1) 固定)。
  //   P0-3の seed固定は REQUEST-devbridge.md で設計チャットへ発注済み。着地したらここに実値が入る。
  seed: {
    requested: new URL(url).searchParams.get('seed'),
    effective: finalState?.seed ?? null,   // Bridge が返す「実際に使われた値」(未指定は既定の1)
    note: 'seed 配下は段階的に拡大中。Bridge の seed はレベルアップ選択と敵の湧きを代表する値',
  },
  observed: {
    gateClicks, shopFixes, maxEnemies,
    consoleErrorCount: consoleErrors.length,
    firstRunSearchMs: MODE === 'firstrun' ? screenSearchMs : null,
    finalState,
    botReport: finalState?.botReport ?? null,
  },
  screenshots: shots.map(s => ({
    trigger: s.trigger, atRealSec: s.atRealSec, atGameSec: s.atGameSec,
    kept: s.kept, tempPath: s.kept ? null : s.file,
  })),
  tempDir: tmpDir,
  events,                 // ランナー側の差分観測
  bridgeEvents,           // ★src側の台帳(__TEST_EVENTS__)。null なら ?testbridge=1 が無い
  bridgeEventCounts,
  consoleErrors,
};
const outJson = path.join(outDir, `${stamp}-observe-${MODE}.json`);
fs.writeFileSync(outJson, JSON.stringify(manifest, null, 2));

console.log(`\n[結果] 終了理由=${endedReason} 実${realSec()}s イベント${events.length}件 consoleエラー${consoleErrors.length}件`);
console.log(`[状態源] ${via}${via === 'gameStore' ? '(dev 5173。P0-1着地後は bridge に切り替わる)' : ''}`);
console.log(`[スクショ] 候補${shots.length}枚 → results/ へ${kept.length}枚(残り${dropped.length}枚は ${tmpDir} に保持)`);
console.log(`[Bイベント] ${bridgeEvents ? `${bridgeEvents.length}件 ${JSON.stringify(bridgeEventCounts)}` : '取得できず(?testbridge=1 が無い)'}`);
console.log(`[out] ${outJson}`);
await ctx.close();
await browser.close();
