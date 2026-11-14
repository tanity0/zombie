import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5199/zombie/';
const outputDir = process.env.TEST_OUTPUT_DIR ?? path.resolve('TEST_HANDOFF/results');
const maxRealMs = Number(process.env.MAX_REAL_MS ?? 300_000);
const allCases = [
  { id: 'kurogane', name: '黒鉄', roll: 0.025 },
  { id: 'shishimaru', name: 'ししまる', roll: 0.075 },
  { id: 'karasu', name: '鴉', roll: 0.125 },
  { id: 'yuki', name: 'ユキ', roll: 0.175 },
  { id: 'mikazuki', name: '三日月', roll: 0.225 },
  { id: 'nanashi', name: 'ナナシ', roll: 0.275 },
  { id: 'iwamoto', name: '岩本', roll: 0.325 },
  { id: 'donko', name: 'どんこ', roll: 0.375 },
  { id: 'chiyo', name: '千代', roll: 0.425 },
  { id: 'tohmi', name: '遠見', roll: 0.475 },
  { id: 'shizu', name: '静', roll: 0.525 },
  { id: 'hatsune', name: 'ハツネ', roll: 0.575 },
  { id: 'hayase', name: '早瀬', roll: 0.625 },
  { id: 'bambi', name: 'ばんび', roll: 0.675 },
  { id: 'chloe', name: 'クロエ', roll: 0.725 },
  { id: 'bansho', name: '番匠', roll: 0.775 },
  { id: 'akane', name: 'あかね', roll: 0.825 },
  { id: 'ryoken', name: '猟犬', roll: 0.875 },
  { id: 'phill', name: 'フィル', roll: 0.925 },
  { id: 'mumei', name: '無銘', roll: 0.975 },
];
const requestedTargets = new Set((process.env.TARGETS ?? 'kurogane,shishimaru,karasu,yuki,mikazuki,nanashi,iwamoto,donko,chiyo,tohmi,shizu,hatsune,akane,ryoken,phill,mumei').split(',').map((value) => value.trim()).filter(Boolean));
const cases = allCases.filter((testCase) => requestedTargets.has(testCase.id));
if (cases.length === 0) throw new Error(`no valid TARGETS: ${[...requestedTargets].join(',')}`);

const pad = (value) => String(value).padStart(2, '0');
const now = new Date();
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, `${stamp}-miguel-remaining16-solo-raw.json`);

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: [
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ],
});

const results = [];
const writeCheckpoint = () => fs.writeFileSync(outputPath, JSON.stringify({
  generatedAt: new Date().toISOString(), appVersion: '0.25.2841',
  commit: '7224e182fe34a0b759d9e82675b32d4fa9bfdb6d', headless: false,
  soloGuardian: true, browserChannel: 'chrome', baseUrl, requestedTargets: [...requestedTargets], results,
}, null, 2));

try {
  for (const testCase of cases) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const errors = [];
    const ghostPickResponses = [];

    page.on('pageerror', (error) => errors.push(`page: ${error.stack ?? error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    page.on('response', async (response) => {
      if (!response.url().includes('/ghost/pick')) return;
      let body = null;
      try { body = await response.json(); } catch { /* response may not be JSON */ }
      ghostPickResponses.push({ status: response.status(), url: response.url(), body });
    });

    await page.addInitScript(({ targetRoll }) => {
      const nativeRandom = Math.random.bind(Math);
      let pickHits = 0;
      Math.random = function forcedGuardianRandom() {
        const stack = new Error().stack ?? '';
        if (stack.includes('shouldPickFixedGuardian')) return 0;
        if (stack.includes('pickFixedGuardianForGhostMode')) {
          pickHits += 1;
          window.__forcedGuardianPickHits = pickHits;
          return targetRoll;
        }
        return nativeRandom();
      };

      window.__headedFps = { frames: 0, times: [], last: performance.now() };
      const sample = (time) => {
        const fps = window.__headedFps;
        fps.frames += 1;
        const dt = time - fps.last;
        fps.last = time;
        if (dt > 0 && fps.times.length < 20_000) fps.times.push(dt);
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }, { targetRoll: testCase.roll });

    const query = new URLSearchParams({
      smoke: '1', stage: 'stage-1', gateboss: '1', autotut: '1', retry: '1',
      ghost: '1', ghostmode: 'random', ghostlog: '1',
    });
    const url = `${baseUrl}?${query.toString()}`;
    console.log(`[run] ミゲル vs ${testCase.name}: ${url}`);
    const navigationStartedAt = Date.now();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForFunction(() => Boolean(window.__gameStore?.getState), null, { timeout: 120_000 });

    await page.evaluate(() => {
      const store = window.__gameStore;
      const state = store.getState();
      store.setState({
        player: {
          ...state.player,
          health: 1_000_000_000,
          maxHealth: 1_000_000_000,
          width: 0,
          height: 0,
          weapons: [],
          subWeapons: [],
        },
      });
    });

    let engagementStartedAt = null;
    let engagementGameMs = null;
    let engagementFpsFrames = null;
    let engagementFpsIndex = null;
    let actualGuardian = null;
    let initialGuardian = null;
    let bossMaxHp = null;
    let outcome = 'timeout';
    let finalState = null;
    let mismatch = null;

    while (Date.now() - navigationStartedAt < maxRealMs + 120_000) {
      const state = await page.evaluate(() => {
        const store = window.__gameStore;
        const s = store.getState();
        const boss = s.enemies.find((enemy) => enemy.type === 'miguel' && enemy.dormant !== true) ?? null;
        const ghost = s.summons.find((summon) => summon.kind === 'ghost-ally') ?? null;
        return {
          gameTime: s.gameTime,
          boss: boss ? {
            id: boss.id, type: boss.type, health: boss.health, maxHealth: boss.maxHealth,
            bossState: boss.bossState ?? null, dormant: boss.dormant ?? false,
          } : null,
          ghost: ghost ? {
            id: ghost.id, name: ghost.ghostName ?? null, health: ghost.health,
            maxHealth: ghost.maxHealth, classId: ghost.ghostClass ?? null,
            level: ghost.level, build: ghost.ghostBuild ?? null,
          } : null,
          ghostSource: s.ghostSourceThisRun,
          ghostRecordId: s.ghostRecordIdThisRun,
          player: { health: s.player.health, maxHealth: s.player.maxHealth, level: s.player.level },
          corpseType: s.bossCorpse?.type ?? null,
          visibilityState: document.visibilityState,
          fpsFrames: window.__headedFps?.frames ?? 0,
          fpsIndex: window.__headedFps?.times?.length ?? 0,
          forcedPickHits: window.__forcedGuardianPickHits ?? 0,
        };
      });

      if (state.boss && state.ghost && engagementStartedAt === null) {
        actualGuardian = state.ghost.name;
        initialGuardian = state.ghost;
        if (actualGuardian !== testCase.name) {
          mismatch = `expected ${testCase.name}, got ${actualGuardian}; forcedPickHits=${state.forcedPickHits}`;
          outcome = 'guardian-mismatch';
          finalState = state;
          break;
        }

        const prepared = await page.evaluate(() => {
          const store = window.__gameStore;
          const s = store.getState();
          const boss = s.enemies.find((enemy) => enemy.type === 'miguel' && enemy.dormant !== true);
          const ghost = s.summons.find((summon) => summon.kind === 'ghost-ally');
          if (!boss || !ghost) return null;
          store.setState((current) => ({
            enemies: current.enemies.map((enemy) => enemy.id === boss.id
              ? { ...enemy, health: enemy.maxHealth }
              : enemy),
          }));
          if (window.__soloObserverTimer) clearInterval(window.__soloObserverTimer);
          window.__soloObserverTimer = setInterval(() => {
            const current = store.getState();
            const ally = current.summons.find((summon) => summon.kind === 'ghost-ally');
            if (!ally) return;
            store.setState({
              player: {
                ...current.player,
                x: ally.x + ally.width / 2,
                y: ally.y + ally.height / 2,
                width: 0,
                height: 0,
                health: 1_000_000_000,
                maxHealth: 1_000_000_000,
                weapons: [],
                subWeapons: [],
              },
              showShopMenu: false,
              showUpgradeMenu: false,
              showEventQuestMenu: false,
              isPaused: false,
              merchantDwellMs: 0,
              shopReopenAt: Number.MAX_SAFE_INTEGER,
            });
          }, 16);
          const refreshed = store.getState().enemies.find((enemy) => enemy.id === boss.id);
          return { gameTime: store.getState().gameTime, bossMaxHp: refreshed?.maxHealth ?? boss.maxHealth };
        });
        if (!prepared) throw new Error(`failed to prepare solo observer for ${testCase.name}`);
        engagementStartedAt = Date.now();
        engagementGameMs = prepared.gameTime;
        engagementFpsFrames = state.fpsFrames;
        engagementFpsIndex = state.fpsIndex;
        bossMaxHp = prepared.bossMaxHp;
        await page.screenshot({ path: path.join(outputDir, `${stamp}-miguel-${testCase.id}-engaged.png`) });
      }

      if (engagementStartedAt !== null) {
        if (!state.boss && state.corpseType === 'miguel') {
          outcome = 'killed';
          finalState = state;
          break;
        }
        if (!state.ghost && state.boss) {
          outcome = 'guardian-defeated';
          finalState = state;
          break;
        }
        if (Date.now() - engagementStartedAt >= maxRealMs) {
          outcome = 'timeout';
          finalState = state;
          break;
        }
      }

      await page.waitForTimeout(250);
    }

    if (!finalState) {
      finalState = await page.evaluate(() => {
        const s = window.__gameStore.getState();
        const boss = s.enemies.find((enemy) => enemy.type === 'miguel') ?? null;
        const ghost = s.summons.find((summon) => summon.kind === 'ghost-ally') ?? null;
        return { gameTime: s.gameTime, boss, ghost, corpseType: s.bossCorpse?.type ?? null };
      });
    }

    const engagementRealSec = engagementStartedAt === null ? null : (Date.now() - engagementStartedAt) / 1000;
    const engagementGameSec = engagementGameMs === null ? null : (finalState.gameTime - engagementGameMs) / 1000;
    const fps = await page.evaluate(({ startFrames, startIndex, elapsedMs }) => {
      const data = window.__headedFps ?? { frames: 0, times: [] };
      const samples = data.times.slice(startIndex ?? 0).sort((a, b) => a - b);
      const percentile = (p) => samples.length ? samples[Math.min(samples.length - 1, Math.floor(samples.length * p))] : null;
      return {
        frames: startFrames == null ? null : data.frames - startFrames,
        elapsedMs,
        average: startFrames == null || !elapsedMs ? null : ((data.frames - startFrames) * 1000) / elapsedMs,
        medianFrameMs: percentile(0.5), p95FrameMs: percentile(0.95), p99FrameMs: percentile(0.99),
      };
    }, { startFrames: engagementFpsFrames, startIndex: engagementFpsIndex, elapsedMs: engagementRealSec == null ? null : engagementRealSec * 1000 });

    const environment = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl');
      const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info');
      return {
        visibilityState: document.visibilityState,
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: navigator.deviceMemory ?? null,
        gpuVendor: gl && debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : null,
        gpuRenderer: gl && debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null,
        dpr: devicePixelRatio,
        viewport: { width: innerWidth, height: innerHeight },
      };
    });

    const finalShot = path.join(outputDir, `${stamp}-miguel-${testCase.id}-final.png`);
    await page.screenshot({ path: finalShot });
    const result = {
      case: 'gate-miguel', targetGuardian: testCase.name, actualGuardian, outcome, mismatch,
      url, engagementRealSec, engagementGameSec,
      navigationRealSec: (Date.now() - navigationStartedAt) / 1000,
      bossMaxHp, guardian: initialGuardian, finalState, fps, environment,
      ghostPickResponses, errors,
    };
    results.push(result);
    writeCheckpoint();
    console.log(`[done] ミゲル vs ${testCase.name}: ${outcome}, real=${engagementRealSec}s, game=${engagementGameSec}s, bossHp=${finalState.boss?.health ?? 0}, fps=${fps.average?.toFixed(1)}`);
    await context.close();
  }
} finally {
  await browser.close();
}

writeCheckpoint();
console.log(`[out] ${outputPath}`);
