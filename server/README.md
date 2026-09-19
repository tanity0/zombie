# CO-2 signaling + G6 online guardian Worker

Cloudflare Worker + Durable Objectで動く既存の待ち合わせサーバに、D1を使うオンライン守護霊APIを追加しています。守護霊は同意済みのボス別記録だけを受け付け、共有サニタイザをブラウザ側とWorker側の両方で通します。

Durable Objectを1つのロビー正本にした理由は、複数クライアントの先着joinと部屋所有権を1か所で判定できるためです。CO-2では接続中にメモリ状態を保つ標準WebSocket APIを使います。部屋はメモリだけに置き、openから90秒経過したものを次の操作時に削除します。永続DBは使いません。

## 起動

Node.js 22以降で、`server/` の中だけを使います。

```sh
cd server
npm ci --ignore-scripts --no-audit --no-fund
npm start
```

`ws://localhost:8787` で待ち受け、`http://localhost:8787/health` が `{"status":"ok"}` を返します。守護霊APIは `/ghost` 以下です。

テストは `npm test` です。

本番反映は `npx wrangler d1 migrations apply zombie-ghost-online --remote` の後に `npm run deploy` を使います。GitHub Pagesへ渡すのは公開Worker URLだけで、Cloudflare認証情報は渡しません。
