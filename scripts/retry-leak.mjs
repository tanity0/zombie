// コンティニュー(ゲームオーバー→もう一度プレイ)を繰り返して、積み上がる物が無いかを測る(2026-10-14・社長報告「コンティニュー繰り返すと必ず落ちる」の調査で作成)。
// 使い方: dev サーバ(5199)を上げて `node scripts/retry-leak.mjs <回数> <stage-id>`。1回あたり2〜3分(ヘッドレスはゲーム内時間が遅い)。
// 出力: run ごとに GPU/描画プロセスの実メモリ(ps)・JSヒープ・DOMノード・イベントリスナ数・tex/bake、リスナの増減、
//       ゲームオーバー画面で描画器に残っている画像(AFTER PARK)。
// ★注意: dev は React の StrictMode で画面を二重に出し入れするため、描画器(Pixi)の片付けが途中で投げて
//   リスナが +8/回 増えて見える。**本番相当で測る時は src/main.tsx の StrictMode を一時的に外す**(戻すのを忘れない)。
import { chromium } from '../node_modules/playwright/index.mjs';
import { execSync } from 'node:child_process';
const STAGE = process.argv[3] || 'stage-1';
const rss = () => { const out = execSync("ps -eo rss,args | grep pw-browsers | grep -v grep").toString().trim().split('\n'); let gpu=0, ren=0, other=0; for (const l of out){ const kb=Number(l.trim().split(/\s+/)[0]); if (/--type=gpu-process/.test(l)) gpu+=kb; else if (/--type=renderer/.test(l)) ren+=kb; else other+=kb; } return `gpuMB ${(gpu/1024).toFixed(0)} renMB ${(ren/1024).toFixed(0)} othMB ${(other/1024).toFixed(0)}`; };
const N = Number(process.argv[2] || 6);
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--enable-precise-memory-info','--js-flags=--expose-gc'] });
const p = await b.newPage({ viewport:{width:430,height:932}, deviceScaleFactor:1, isMobile:true, hasTouch:true });
const cdp = await p.context().newCDPSession(p);
await cdp.send('Performance.enable');
p.on('pageerror', e => console.log('PAGEERR', String(e).slice(0,200))); p.on('console', m => { if (m.type()==='error' && !m.text().includes('Failed to load resource')) console.log('CONSOLE', m.text().slice(0,400)); });
await p.addInitScript(()=>{ window.__created={}; const orig=Document.prototype.createElement; Document.prototype.createElement=function(t,...r){ const k=String(t).toLowerCase(); window.__created[k]=(window.__created[k]||0)+1; const el=orig.call(this,t,...r); if(k==='canvas'){ (window.__cv=window.__cv||[]).push({ref:new WeakRef(el), stack:(new Error().stack||'').split('\n').slice(2,6).join(' | ')}); } return el; }; });
await p.goto(`http://localhost:5199/zombie/?smoke=1&stage=${STAGE}&retry=1`, { waitUntil:'domcontentloaded' });
const waitPlaying = async () => { for (let i=0;i<60;i++){ await p.waitForTimeout(2000); const ok = await p.evaluate(()=>{ const s=window.__gameStore?.getState?.(); return !!s && s.rendererReady && s.player.health>0 && s.gameTime>50; }); if (ok) return true; } return false; };
const listenerTypes = async () => {
  const out = {};
  for (const expr of ['window','document','document.body']) {
    const { result } = await cdp.send('Runtime.evaluate', { expression: expr });
    const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
    for (const l of listeners) { const k = expr+':'+l.type; out[k] = (out[k]||0)+1; }
  }
  return out;
};
let prevL = null;
const measure = async (tag) => {
  const L = await listenerTypes();
  if (prevL) { const diff = Object.entries(L).filter(([k,v])=>v!==(prevL[k]||0)).map(([k,v])=>k+':'+(prevL[k]||0)+'→'+v); console.log('  listener diff', diff.join(' ')); }
  prevL = L;
  await p.evaluate(()=>{ try{ window.gc && window.gc(); }catch{} });
  await p.waitForTimeout(500);
  const m = await cdp.send('Performance.getMetrics');
  const g = k => m.metrics.find(x=>x.name===k)?.value;
  const dom = await cdp.send('Memory.getDOMCounters');
  const page = await p.evaluate(()=>{
    const beacon=[...document.querySelectorAll('div')].map(d=>d.textContent||'').find(t=>/tex\d+MB/.test(t) && t.length<300) || '';
    return { canvases: document.querySelectorAll('canvas').length, audio: document.querySelectorAll('audio,video').length, beacon: beacon.slice(0,120) };
  });
  const cr = await p.evaluate(()=>{ const alive=(window.__cv||[]).map(x=>({el:x.ref.deref(), st:x.stack})).filter(x=>x.el && !x.el.isConnected); const big=alive.filter(x=>x.el.width*x.el.height>=4096); const px=alive.reduce((a,x)=>a+x.el.width*x.el.height,0); const by={}; for(const x of alive){ const k=x.st.replace(/https?:\/\/[^ )]*\/(src|node_modules)\//g,'').replace(/\?[^:]*:/g,':').slice(0,160); by[k]=(by[k]||0)+1; } return 'aliveDetached '+alive.length+' big '+big.length+' MB '+(px*4/1048576).toFixed(1)+'\n'+Object.entries(by).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,v])=>'    '+v+' × '+k).join('\n'); }); console.log('  ', cr.split('\n')[0]); const mt = await p.evaluate(()=>{ const ts=window.__pixiScene?.renderer?.texture; const m=ts?.managedTextures||[]; window.__runNo=(window.__runNo??-1)+1; const fresh=[]; for(const src of m){ if(!src) continue; if(src.__seen===undefined){ src.__seen=window.__runNo; fresh.push(src);} } const by={}; for(const src of fresh){ const k=(src.constructor?.name||'?')+(src.resource?.constructor?.name?'/'+src.resource.constructor.name:'')+' '+(src.pixelWidth|0)+'x'+(src.pixelHeight|0)+(src.autoGarbageCollect?'':' noGC')+(src.label?' ['+src.label+']':''); by[k]=(by[k]||0)+1; } return 'fresh '+fresh.length+' :: '+Object.entries(by).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([k,v])=>v+'×'+k).join(' | '); }); console.log('  ', mt);
  console.log(tag, rss(), 'heapMB', (g('JSHeapUsedSize')/1048576).toFixed(1), 'nodes', dom.nodes, 'listeners', dom.jsEventListeners, 'docs', dom.documents, 'canvas', page.canvases, 'media', page.audio, '|', page.beacon);
};
if (!await waitPlaying()) { console.log('not playing'); process.exit(1); }
await measure('run0');
for (let r=1; r<=N; r++) {
  await p.evaluate(()=>{ const S=window.__gameStore; S.setState({ isPaused:false, player: { ...S.getState().player, health: 0 } }); });
  let clicked=false;
  for (let i=0;i<40 && !clicked;i++){ await p.waitForTimeout(1500);
    const has = await p.evaluate(()=>!![...document.querySelectorAll('button')].find(x=>x.textContent?.includes('もう一度プレイ')));
    if (has) { await p.waitForTimeout(800); const left = await p.evaluate(()=>{ const ts=window.__pixiScene?.renderer?.texture; const m=ts?.managedTextures||[]; const by={}; let mb=0; for(const src of m){ if(!src) continue; const k='run'+(src.__seen??'new')+' '+(src.constructor?.name||'?')+(src.resource?.constructor?.name?'/'+src.resource.constructor.name:'')+' '+(src.pixelWidth|0)+'x'+(src.pixelHeight|0)+(src.label?' ['+String(src.label).split('/').pop().slice(0,30)+']':''); by[k]=(by[k]||0)+1; mb+=(src.pixelWidth|0)*(src.pixelHeight|0)*4; } return 'AFTER PARK managed '+m.length+' MB '+(mb/1048576).toFixed(1)+' :: '+Object.entries(by).sort((a,b)=>b[1]-a[1]).slice(0,14).map(([k,v])=>v+'×'+k).join(' | '); }); console.log('  ', left); }
    clicked = await p.evaluate(()=>{ const bt=[...document.querySelectorAll('button')].find(x=>x.textContent?.includes('もう一度プレイ')); if(bt){bt.click();return true;} return false; }); }
  if (!clicked) { console.log('no retry button at', r); break; }
  if (!await waitPlaying()) { console.log('not playing after retry', r); break; }
  await measure('run'+r);
  await p.screenshot({ path: '/tmp/claude-0/-home-user-zombie/cc082381-7eda-5d5f-ac62-3a839bc0d89c/scratchpad/retry-'+r+'.png' });
}
await b.close();
