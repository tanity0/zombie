// the ONE — PC 版の入れ物(Electron)。research/PC_SUPPORT.md §12。
// 中身はウェブ版と同じ ../dist(npm run build の出力)をそのまま読む=コードは1本(社長裁定2026-10-02「分けなくて済むなら一番いい」)。
// スマホ版・ウェブの開発チャネルには一切影響しない(このフォルダは独立した package.json を持ち、ルートの依存に入らない)。
//
// - 読み込みは独自の app:// で行う(ビルドは base '/zombie/' 前提=file:// だと /zombie/assets が引けないため)。
// - セーブ(localStorage)は Electron の userData に残る(app://local という1つの出どころに固定=アップデートしても消えない)。
// - 全画面: F11 で切り替え。Esc はゲームの一時停止に使うので全画面の解除には使わない。
// - 音: 最初のクリックを待たずに鳴らせる(ブラウザの自動再生の制限は入れ物の中では要らない)。
const { app, BrowserWindow, protocol, net, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');

const BASE = '/zombie/';
const distDir = app.isPackaged ? path.join(process.resourcesPath, 'dist') : path.join(__dirname, '..', 'dist');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// 内蔵GPUと外付けGPUの2つを持つノートPCで、ゲーム用の外付けGPUで描く(v0.25.4872・社長の RTX 4070 ノートで Chrome が内蔵GPUのまま重かった)。
app.commandLine.appendSwitch('force_high_performance_gpu');

if (!app.requestSingleInstanceLock()) app.quit();

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#000000',
    title: 'the ONE',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.removeMenu();
  win.once('ready-to-show', () => win.show());
  // F11=全画面の切り替え(Esc はゲームが使う)。
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
  // ゲーム内のリンク(外部サイト)は既定のブラウザで開く。
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.loadURL(`app://local${BASE}`);

  // 動作確認用(ZOMBIE_SMOKE=1): 起動して 25 秒後の画面を保存して終わる。
  if (process.env.ZOMBIE_SMOKE === '1') {
    setTimeout(async () => {
      try {
        const img = await win.webContents.capturePage();
        const out = process.env.ZOMBIE_SMOKE_OUT || path.join(app.getPath('temp'), 'the-one-smoke.png');
        fs.writeFileSync(out, img.toPNG());
        const info = await win.webContents.executeJavaScript('JSON.stringify({ v: document.title, screen: Array.from(document.querySelectorAll("[data-screen]")).map(e => e.getAttribute("data-screen")) })');
        console.log('SMOKE', out, info);
      } catch (e) { console.log('SMOKE-ERR', e); }
      app.quit();
    }, 25000);
  }
};

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const u = new URL(request.url);
    let p = decodeURIComponent(u.pathname);
    if (p.startsWith(BASE)) p = p.slice(BASE.length - 1);
    if (p === '/' || p === '') p = '/index.html';
    const file = path.normalize(path.join(distDir, p));
    if (!file.startsWith(distDir)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('second-instance', () => {
  const w = BrowserWindow.getAllWindows()[0];
  if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
