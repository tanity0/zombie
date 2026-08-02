# CO-3 signaling server

Cloudflare Worker + Durable Object で動く、揮発性の待ち合わせサーバです。ゲームデータは受け付けず、部屋の掲示とSDP/ICEだけを中継します。

Durable Objectを1つのロビー正本にした理由は、複数クライアントの先着joinと部屋所有権を1か所で判定できるためです。部屋はメモリだけに置き、ホストの最終heartbeatから90秒経過したopen部屋を次の操作時に削除します。募集時刻はheartbeatで変わりません。永続DBは使いません。

## 起動

Node.js 22以降で、`server/` の中だけを使います。

```sh
cd server
npm ci --ignore-scripts --no-audit --no-fund
npm start
```

`ws://localhost:8787` で待ち受け、`http://localhost:8787/health` が `{"status":"ok"}` を返します。localhost、loopback、RFC1918のLAN Originだけを許可し、Cloudflareへのログイン・デプロイは行いません。

テストは `npm test` です。
