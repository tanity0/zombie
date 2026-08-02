import { expect, test, type CDPSession, type Page } from '@playwright/test';

const HOST_ID = '123e4567-e89b-42d3-a456-426614174000';
const GUEST_ID = '223e4567-e89b-42d3-a456-426614174001';

async function openPage(page: Page, anonymousId: string, online = true): Promise<void> {
  const suffix = online ? '' : '&online=0';
  await page.goto(`/?anonid=${anonymousId}${suffix}`);
  await expect(page.locator('#signal')).toHaveValue('ws://localhost:8787');
}

async function connect(host: Page, guest: Page, buildVersion = 'co3'): Promise<void> {
  await host.locator('#build').fill(buildVersion);
  await guest.locator('#build').fill(buildVersion);
  expect(await host.evaluate(() => window.netcheck.advertise())).toBe(true);
  await expect.poll(() => host.evaluate(() => window.netcheck.snapshot().status)).toBe('advertising');
  const rooms = await guest.evaluate(() => window.netcheck.listOpen());
  expect(rooms).toHaveLength(1);
  expect(await guest.evaluate((roomId) => window.netcheck.join(roomId), rooms[0].roomId)).toBe(true);
  await expect.poll(() => host.evaluate(() => window.netcheck.snapshot().status)).toBe('connected');
  await expect.poll(() => guest.evaluate(() => window.netcheck.snapshot().status)).toBe('connected');
  await expect.poll(() => host.evaluate(() => window.netcheck.snapshot().maintenanceOpen)).toBe(true);
  await expect.poll(() => guest.evaluate(() => window.netcheck.snapshot().maintenanceOpen)).toBe(true);
}

async function heapBytes(session: CDPSession): Promise<number> {
  await session.send('HeapProfiler.collectGarbage');
  const response = await session.send('Runtime.getHeapUsage');
  return response.usedSize;
}

test('P2P bytes, maintenance, close-once, filtering, and reconnect', async ({ browser }) => {
  const context = await browser.newContext();
  const host = await context.newPage();
  const guest = await context.newPage();
  await openPage(host, HOST_ID);
  await openPage(guest, GUEST_ID);

  expect(await host.evaluate(() => window.netcheck.snapshot().implicitEnabled)).toBe(false);
  await connect(host, guest);

  await host.evaluate(() => {
    window.netcheck.sendReliable([11, 12, 13]);
    window.netcheck.sendUnreliable([21, 22, 23]);
  });
  await guest.evaluate(() => {
    window.netcheck.sendReliable([31, 32, 33]);
    window.netcheck.sendUnreliable([41, 42, 43]);
  });
  await expect.poll(() => guest.evaluate(() => window.netcheck.snapshot().receivedPayloads))
    .toEqual(expect.arrayContaining([[11, 12, 13], [21, 22, 23]]));
  await expect.poll(() => host.evaluate(() => window.netcheck.snapshot().receivedPayloads))
    .toEqual(expect.arrayContaining([[31, 32, 33], [41, 42, 43]]));
  await expect.poll(() => host.evaluate(() => window.netcheck.snapshot().messagesReceived)).toBeGreaterThanOrEqual(2);
  await expect.poll(() => guest.evaluate(() => window.netcheck.snapshot().messagesReceived)).toBeGreaterThanOrEqual(2);

  const hostMessagesBeforeIdle = await host.evaluate(() => window.netcheck.snapshot().messagesReceived);
  const guestMessagesBeforeIdle = await guest.evaluate(() => window.netcheck.snapshot().messagesReceived);
  await host.waitForTimeout(10_000);
  expect(await host.evaluate(() => window.netcheck.snapshot().status)).toBe('connected');
  expect(await guest.evaluate(() => window.netcheck.snapshot().status)).toBe('connected');
  expect(await host.evaluate(() => window.netcheck.snapshot().messagesReceived)).toBe(hostMessagesBeforeIdle);
  expect(await guest.evaluate(() => window.netcheck.snapshot().messagesReceived)).toBe(guestMessagesBeforeIdle);

  await guest.evaluate(() => window.netcheck.close());
  await expect.poll(() => host.evaluate(() => window.netcheck.snapshot().closeReasons)).toEqual(['peer-left']);

  await connect(host, guest, 'co3-reconnect');
  await host.evaluate(() => window.netcheck.close());
  await expect.poll(() => guest.evaluate(() => window.netcheck.snapshot().closeReasons)).toEqual(['peer-left']);

  await host.locator('#build').fill('build-a');
  await guest.locator('#build').fill('build-b');
  expect(await host.evaluate(() => window.netcheck.advertise())).toBe(true);
  expect(await guest.evaluate(() => window.netcheck.listOpen())).toEqual([]);
  await host.evaluate(() => window.netcheck.close());
  await context.close();
});

test('online=0 overrides an explicit signal URL', async ({ page }) => {
  await openPage(page, HOST_ID, false);
  const state = await page.evaluate(() => window.netcheck.snapshot());
  expect(state.enabled).toBe(false);
  expect(await page.evaluate(() => window.netcheck.advertise())).toBe(false);
});

test('8KB x 20/s stays connected both ways for three minutes and an advertised room stays visible', async ({ browser }) => {
  test.setTimeout(210_000);
  const context = await browser.newContext();
  const host = await context.newPage();
  const guest = await context.newPage();
  const observer = await context.newPage();
  await openPage(host, HOST_ID);
  await openPage(guest, GUEST_ID);
  await openPage(observer, '323e4567-e89b-42d3-a456-426614174002');

  await observer.locator('#match').fill('heartbeat-check');
  await observer.locator('#build').fill('heartbeat-build');
  expect(await observer.evaluate(() => window.netcheck.advertise())).toBe(true);

  await connect(host, guest, 'co3-load');
  await host.evaluate(() => window.netcheck.startTraffic());
  await guest.evaluate(() => window.netcheck.startTraffic());
  const hostCdp = await context.newCDPSession(host);
  const guestCdp = await context.newCDPSession(guest);
  await host.waitForTimeout(5_000);
  const hostHeapBefore = await heapBytes(hostCdp);
  const guestHeapBefore = await heapBytes(guestCdp);
  await host.waitForTimeout(175_000);

  const hostState = await host.evaluate(() => window.netcheck.snapshot());
  const guestState = await guest.evaluate(() => window.netcheck.snapshot());
  expect(hostState.status).toBe('connected');
  expect(guestState.status).toBe('connected');
  expect(hostState.maintenanceOpen).toBe(true);
  expect(guestState.maintenanceOpen).toBe(true);
  expect(hostState.bytesSent).toBeGreaterThan(20 * 8 * 1024 * 170);
  expect(hostState.bytesReceived).toBeGreaterThan(20 * 8 * 1024 * 170);
  expect(guestState.bytesSent).toBeGreaterThan(20 * 8 * 1024 * 170);
  expect(guestState.bytesReceived).toBeGreaterThan(20 * 8 * 1024 * 170);
  expect((await heapBytes(hostCdp)) - hostHeapBefore).toBeLessThan(32 * 1024 * 1024);
  expect((await heapBytes(guestCdp)) - guestHeapBefore).toBeLessThan(32 * 1024 * 1024);

  const listing = await guest.evaluate(async () => {
    const match = document.querySelector<HTMLInputElement>('#match');
    const build = document.querySelector<HTMLInputElement>('#build');
    if (match) match.value = 'heartbeat-check';
    if (build) build.value = 'heartbeat-build';
    window.netcheck.close();
    return window.netcheck.listOpen();
  });
  expect(listing).toHaveLength(1);
  expect(listing[0].ageMs).toBeGreaterThanOrEqual(175_000);

  await host.evaluate(() => window.netcheck.close());
  await observer.evaluate(() => window.netcheck.close());
  await context.close();
});
