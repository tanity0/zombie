# CO-3 netcheck

ゲーム本体とは独立したWebRTC接続確認ページです。`src/online/` の実装を直接importし、部屋、状態、RTT、データ2本の送受信量・レート、netcheckペイロード内の連番から求めたunreliableロス、保守チャネル状態を表示します。

## 準備と起動

Node.js 22以降を使います。別ターミナルで先にシグナリングサーバを起動します。

```sh
cd server
npm ci --ignore-scripts --no-audit --no-fund
npm start
```

netcheckを起動します。

```sh
cd tools/netcheck
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run dev
```

表示された `http://127.0.0.1:4173` を2タブで開き、片方だけURLへ別のv4 UUIDを `?anonid=<uuid>` として付けます。ページ上のSignal URL欄は既定の `ws://localhost:8787` のままで構いません。ホストが「部屋を立てる」、ゲストが「一覧を更新」して部屋ボタンを押します。`connected` と `Maintenance: open` を確認後、負荷ボタンで8KBを毎秒20回送れます。

`onMessage` の `Uint8Array` はコールバック中だけ有効です。接続後5秒でシグナリングWebSocketを閉じるため、それ以降のICE restart・再交渉はできません。

## 自動疎通テスト

初回だけChromium実体を取得します。

```sh
cd tools/netcheck
PLAYWRIGHT_BROWSERS_PATH=0 ./node_modules/.bin/playwright install chromium --only-shell
npm run typecheck
PLAYWRIGHT_BROWSERS_PATH=0 npm run test:online
```

`test:online` はローカルのWorkerとnetcheckを自動起動し、3分間の双方向負荷試験も行うため約4分かかります。通信テストなのでリポジトリ直下の `npm test` には混ぜていません。
