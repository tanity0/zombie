import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true, channel: 'chrome' })
  .catch(() => chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] }));
const p = await b.newPage({ viewport: { width: 800, height: 500 } });
p.on('pageerror', e => console.log('PAGEERR', String(e).slice(0, 200)));
const miss = [];
p.on('response', r => { const u = r.url(); if (/fx\/(shockwave|dust|dust-puff|ground-crack|slash-burst)/.test(u) && r.status() >= 400) miss.push(`${r.status()} ${u.split('/').pop()}`); });
await p.goto('http://localhost:5173/zombie/?smoke=1&stage=stage-1&autotut=1&bot=standard&botskill=master&cinedemo=1', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(12000);
const txt = await p.evaluate(() => document.body.innerText).catch(() => '');
if (txt.includes('はじめる')) { await p.getByText('はじめる', { exact: false }).first().click().catch(() => {}); await p.waitForTimeout(9000); }
for (let i = 0; i < 10; i++) { await p.screenshot({ path: `${process.env.OUT}-${String(i).padStart(2,'0')}.png` }); }
console.log('missing textures:', JSON.stringify(miss));
await b.close();
