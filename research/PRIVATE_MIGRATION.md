# リポジトリ非公開化+実機テストページの Cloudflare Pages 移行 手順書(案)

- 案件: PROJECT_STATUS.md「リポジトリprivate化+実機テストページ分離」(v0.25.3779 で (b) Cloudflare Pages に裁定)
- 起草: 2026-11-25(この時点の版 v0.25.5786・HEAD `8ecc77a9`)。品質監査1巡目の指摘を反映済み。**コード・設定は未編集**。本書は手順の案で、監査→実施の順で使う。
- 社長の決定(事実): ①**リポジトリ全部を非公開**(素材だけ/固まった物だけを分ける案は採らない) ②実機URLは `zombie.pages.dev` 想定
  ③毎push自動デプロイは廃止し、**実機で見たい時だけ1回載せる** ④CIの毎push自動起動を外す ⑤実機ページに **Cloudflare Access(メールのワンタイムコード・社長のアドレスのみ)** を掛ける ⑥2026-11-25 に「はい」で実行決定。
- 決定時との違い(事実と推薦): 決定時は「`deploy` ブランチへ反映して1ビルド」だった。**本書の推薦は「載せるワークフローを手動で起動し、開発ブランチの指定コミットを載せる」**(§1-3)。理由: ブランチを1本増やさずに済み(Branch lock に例外を作らない)、載せた版=コミットSHA が実行記録に残る。
- **社長の決定(2026-11-25)**: ⑦nightly の**毎晩の自動実行はやめる**(時刻指定を外し手動だけ残す)。根拠=直近40回は36成功・4失敗で、失敗4回はどれも約1分で止まった(本体が走る前の段で落ちた見立て・ログ未確認)。結果を見て直した記録は DEVELOPMENT_LOG に1件も無い。⑧代わりに**載せる時(cf-pages.yml)にユニットテスト全体(`npm test`)を回す**=社長の実機に届く前で止める。⑨CI の毎push自動起動を止める件は承知の上で進める。

---

## 0. 何が変わるか(社長目線)

1. ソースも素材も GitHub 上で**誰からも見えなくなる**(今は誰でも見られる・落とせる)。
2. 実機で開くURLが `https://tanity0.github.io/zombie/` → **`https://zombie.pages.dev/`**(名前が取れなかった場合は Cloudflare が付ける別名。§手順B-1)に変わる。初回だけ**メールに届く6桁のコードを入れる**(以後はセッション期限まで入力不要)。**新URLでは端末の保存(進行・設定・既読)が空から始まる**(保存はURLの持ち主ごとに分かれるため)。
3. push しても実機ページは**勝手に変わらない**。社長が「実機で見たい」と言った時に設計チャットが載せる(社長の手間は今と同じ=「見たい」と言うだけ)。載るまで**目安4〜6分**(初回だけ10分前後・未確認)。
4. push ごとの CI は止まる。網は次の3段になる(§1-1b):
   - **毎push**: ローカルの typecheck+lint(既存の必須)。
   - **載せる時**: 循環importの検査+原盤の検査+typecheck(載せるワークフローの中で自動)。
   - **載せる時**に上の3つへ**ユニットテスト全体**も足す(決定⑧)。
   - **手動**: nightly(シミュレーションの長尺ファズと、デバッグボットの通しプレイ)は毎晩の自動をやめ、シミュ層を大きく変えた時に設計チャットが手で回す(決定⑦)。
5. 費用は**全部無料枠の内**の見積もり(§4)。

## 0-1. 社長の手作業の一覧(これだけ)

| # | どこで | 何をする | 目安 |
|---|---|---|---|
| 社1「Pages の鍵の権限確認」 | Cloudflare ダッシュボード → 右上の人型アイコン → **My Profile → API Tokens** | GitHub に入れてある `CLOUDFLARE_API_TOKEN` の行の権限を見る。**Account → Cloudflare Pages → Edit** が無ければ「Edit」で足す(無理なら新しいトークンを作り、GitHub の Settings → Secrets and variables → Actions で `CLOUDFLARE_API_TOKEN` を入れ替え) | 3分 |
| 社2「Zero Trust の開設」 | Cloudflare ダッシュボード左の **Zero Trust** | 初回はチーム名(例 `tanity`)を決め、**Free プラン(50人まで)**を選ぶ。支払い情報の入力を求められる場合がある(未確認・無料のまま課金はされない) | 5分 |
| 社3「Access の設定」 | Zero Trust → **Access → Applications → Add an application → Self-hosted** | §手順C-2 の値を入れる(社長のメールだけ許可)。**初回の載せより前に行う** | 5分 |
| 社4「スマホで確認」 | iPhone の **Safari** | 新URLを開く→メールのコードを入れる→版番号を見る→ホーム画面アイコンを作り直す(§2-1) | 5分 |
| 社5「非公開に切り替え」 | GitHub `tanity0/zombie` → **Settings → General → 一番下の Danger Zone → Change repository visibility → Make private** | 確認でリポジトリ名を打つ | 1分 |
| 社6「古いページを止める」 | GitHub → **Settings → Pages** | 止まっているのを確認(止まっていなければ Unpublish site)。無料プランでは非公開化と同時に自動で止まるはず(未確認) | 1分 |
| 社7「繋がるかの確認」 | この Claude Code の画面と、社長の Mac | 非公開化の直後に設計チャットへ「繋がるか確かめて」と一言。Mac で `cd /Users/tanity/zombie && git pull` が通るかを見る(§手順E-2) | 2分 |

---

## 1. 現状の調査結果(実物を読んだもの)

### 1-1. ワークフロー4本(`.github/workflows/`)と非公開後の扱い

実測は `gh run list`(直近200本=2026-11-21〜11-24の約3.3日分、server-deploy は直近10本、nightly は直近30本)の実行時間(作成→終了)。課金は**ジョブ単位で分を切り上げ**る。

| ファイル | 今のトリガー | 1回の所要(実測) | 回数 | 非公開のまま放置すると | どう変えるか |
|---|---|---|---|---|---|
| `ci.yml`「CI」 | **全ブランチの毎push** | 中央値 **5.8分**・最大8.6分 | 3.3日で132本(約40本/日。うち中止35・失敗47) | 40本×6分×30日 ≒ **月7,000分**=無料枠2,000分を**数日で使い切る** | `on:` を **`workflow_dispatch` のみ**にする(手動で回せる形は残す) |
| `nightly.yml`「Nightly sim fuzz」 | 毎日 03:00 JST+手動 | 中央値 **15.4分**(最大19.2分) | 1本/日 | 月 **約460〜580分** | **手動だけ残す(決定⑦)**=月の分は手で回した回数ぶんだけ。※決定時の見積もり「月150分」は実測と合わない(実測は約3〜4倍)。それでも枠内(§4) |
| `pages.yml`「Deploy to GitHub Pages」 | 開発ブランチと main の毎push(文書のみは除外) | 中央値 **1.5分**(build+deploy の2ジョブ) | 3.3日で65本 | 無料プランの非公開リポジトリでは GitHub Pages が使えない(=止まる。未確認だが GitHub の料金表どおりならこうなる)。加えて1回約200MBの成果物がストレージ500MB枠を食う | **新ページが動くのを確かめてから削除**(§手順D) |
| `server-deploy.yml`「Server deploy」 | `server/**` `shared/**` が変わった push+手動 | 0.4〜0.8分 | 11月は10本程度 | 月 数分(1回1分に切り上げ) | **残す**(変更なし) |

- ストレージ(非公開は500MB): 今いちばん食うのは pages.yml の成果物(1回約200MB・既にデプロイ直後に消す処理あり)。**新しい載せ方は成果物を作らない**ので、ストレージはほぼ npm のキャッシュ(`setup-node` の `cache: npm`)だけになる。キャッシュが500MB枠に数えられるかは**未確認**。
- 現在のCIは**直近で失敗が続いている**(132本中47本 failure)。毎pushを止めると、この赤に気づくのは nightly か手動実行の時だけになる。

### 1-1b. CI を止めた後の網(実物どおり)

今の `ci.yml` が毎pushで回しているのは7つ: lint / typecheck / 循環importの検査(`scripts/check-circular-imports.mjs`)/ 原盤の検査(`npm run assets:check`)/ ユニットテスト(`npm test`)/ Worker のテスト(`server/` で `npm test`)/ build。止めた後、それぞれがどこで回るか:

| 検査 | 毎push(ローカル・既存の必須) | 載せる時(cf-pages.yml) | 毎晩(nightly.yml) | server/ を変えた時(server-deploy.yml) |
|---|---|---|---|---|
| lint | ○ | — | — | — |
| typecheck | ○ | ○(推薦で入れる) | — | — |
| 循環import | — | ○(入れる) | — | — |
| 原盤(assets:check) | — | ○(入れる) | — | — |
| ユニットテスト全体 | — | — | **今は無い**(推薦で足す) | — |
| Worker のテスト | — | — | — | ○(既存) |
| build | — | ○(載せる本体) | — | — |

- **nightly が今回しているのは2つだけ**(`nightly.yml` の実物): `npm run test:fuzz`(= `SIM_FUZZ=1 vitest run src/store/sim.test.ts`=シミュレーションの長尺ファズ)と `npm run playtest`(= `SIM_FUZZ=1 vitest run src/store/playtest.test.ts`=デバッグボットの通しプレイ)。**ユニットテスト全体は入っていない**。
- 循環importの検査は `npx --yes madge@8.0.0` をその場で取ってくる(依存に入っていない)。原盤の検査は node の標準機能だけで動く。どちらも数十秒の見込み(未計測)。
- typecheck は、この調査環境で実測1分(CLAUDE.md の記載は約9秒。Actions の実機では未計測)。載せる時の所要が1分程度伸びるだけなので入れる。
- **ユニットテスト全体をどこで回すか(比較)**:
  - 案1「載せる前に手動で CI を回す」: 載せるたびに約6分待つ+月60〜180分。社長の「見たい」から載るまでが倍以上に延びる。
  - 案2「nightly に `npm test` を足す」: 毎晩1回・月の増分は数十分〜90分程度(`npm test` 単体の Actions 上の所要は未計測。CI 全体5.8分の内訳から3分前後と推定)。翌朝には赤が分かる。
  - **推薦=案2**。載せる速さを落とさずに、毎日1回は全部を通せる。大きな改修の時だけ、設計チャットが CI を手動で回す(案1を必要な時だけ併用)。

### 1-2. `/zombie/` の前提(`vite.config.ts` の `base: '/zombie/'`)

Cloudflare Pages はドメインの**ルート `/`** で配る。アプリ本体はほぼ全部 `import.meta.env.BASE_URL` 経由なので、base を変えれば追従する。

- **追従するもの(変更不要)**: `src/config/assetUrl.ts`(`assetUrl` / `withAssetVersion`)、`src/audio/audioManager.ts` の BGM/SE 表、`CommandHome.tsx` `MissionSelect.tsx` `AvatarSprite.tsx` `OpeningScene.tsx` `LoadingScreen.tsx` `pixiTextures.ts` `corridorLayer.ts` `stageTextures.ts` `PixiStage.tsx` `data/openingWalkAssets.ts`(src 内 `BASE_URL` の出現は144箇所・テスト含む)。`index.html` / `bossmaker.html` の favicon は相対パス。`BenchmarkOverlay.tsx`(`origin+pathname`)と `App.tsx`(`location.replace(pathname)`)もパス非依存。
- src の**本番コードに `/zombie/` の直書きは無い**(grep で出るのはコメント1件とテスト4ファイル=`playerWalkSheets.test.ts` `spawnSequence.test.ts` `seededRng.test.ts` `avatarPlacement.test.ts`。どれも文字列として使うだけで base に依存しない)。
- Service Worker / PWA マニフェスト / `public/_headers` `_redirects` / **`public/404.html` は無い**。
- **`/zombie/` を前提にした開発用スクリプト・文書**(dev サーバの URL):
  `scripts/botrun-local.mjs`(4173番)・`scripts/device-sweep.mjs`・`scripts/pc-guard.mjs`(`import('/zombie/src/...')` を含む)・`scripts/phone-guard.mjs`・`scripts/retry-leak.mjs`、文書は `CLAUDE.md`・`TEST_HANDOFF/HEADLESS.md`・`TEST_HANDOFF/AI_OPERATOR.md`。
- **旧URL `tanity0.github.io/zombie/` を書いている現行文書(直す対象)**: `TEST_HANDOFF/README.md`(31行目 `?bot=standard` の手順)・`REALDEVICE_TEST.md`(22行目 `?komalog=1` の例)・`AI_DIRECTOR_HANDOFF.md`(122行目 `?director=1` の例)・`HANDOFF_CODEX.md`(17行目「公開先」)。
  - `BOT_AND_GHOST.md`(706行目)は URL ではなく **Worker の `*.github.io` 許可の説明**=§1-4 の許可を変える時に一緒に直す。
  - `DEVELOPMENT_LOG.md`(履歴)と `TEST_HANDOFF/results/`(過去の結果)は直さない。
- **推薦: base を環境変数で切り替える**(`base: process.env.VITE_BASE ?? '/zombie/'`、Cloudflare 向けビルドだけ `VITE_BASE=/`)。dev とローカルの検査スクリプト(phone-guard の基準画像を含む)は今の `/zombie/` のまま動くので、上のスクリプト5本は**触らずに済む**。base を一律 `/` にする案は、スクリプト5本と文書3本の書き換え+phone-guard 基準の確認が要るので採らない。
- **404 の扱い(要対処)**: Cloudflare Pages は**出力に `404.html` が無いと、無いファイルへのアクセスにも `index.html` を 200 で返す**(1ページのアプリ向けの既定動作)。素材のパスを間違えると、画像の代わりに HTML が「成功」として返り、読み込みエラーの形が GitHub Pages(本物の404)と変わる。**`public/404.html`(中身は短い1行でよい)を置く**と、Vite が dist の直下へ写し、Cloudflare は本物の404を返すようになる。

### 1-3. Cloudflare Pages の組み方(推薦=Actions を手動で起動して `wrangler pages deploy`)

| | **推薦: GitHub Actions(手動起動)→ `wrangler pages deploy`(Direct Upload)** | 対案: Cloudflare の GitHub 連携(Cloudflare 側でビルド) |
|---|---|---|
| 「見たい時だけ載せる」 | `workflow_dispatch` で手動起動。入力=載せるコミットSHA(既定は開発ブランチの先頭)。ブランチは増えない | 本番ブランチを別に1本作り(例 `deploy`)、そこへ反映した時だけビルド。プレビューのビルドは None |
| 誰が起動するか | 設計チャットが GitHub の Actions 起動ツール(MCP の `actions_run_trigger`)で起動。社長が Actions 画面の「Run workflow」で押しても同じ | 設計チャットがブランチへ push |
| ビルド環境 | 今の pages.yml と同じ(実績1.5分・`git ls-files` で素材ハッシュを作る仕組みがそのまま動く) | Cloudflare のビルド機がリポジトリを clone する。**クローン転送は約1GB(CLAUDE.md 実測993MB)**。Node の版・`GHOST_API_BASE` を Cloudflare 側に別に入れる必要。ビルド上限20分に収まるかは未確認 |
| 鍵 | 既存の Secrets `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` を使い回す(社1で権限を足すだけ) | Cloudflare の GitHub App に**非公開リポジトリの読み取り**を許可する |
| 費用 | Actions 1回4〜6分(月10〜30回で40〜180分)。Cloudflare のビルド枠(500回/月)は**消費しない** | Actions 0分。Cloudflare のビルド枠を月10〜30回 |
| 戻せるか | Direct Upload で作ったプロジェクトは**後から Git 連携に切り替えられない**(Cloudflare の仕様。公式に明記されていた記憶だが未確認)。切り替える時は別プロジェクトを作る | — |

推薦理由: 今動いている pages.yml の中身(checkout→`npm ci`→`npm run build`)をほぼそのまま使え、**1GB のクローンを毎回 Cloudflare に取らせない**。鍵もブランチも増えない。

**Node と wrangler の版(実物)**:
- `server/package.json` の devDependencies は `wrangler: 4.114.0`(固定)。`server/package-lock.json` の wrangler 4.114.0 は **engines `node >=22.0.0`**。`server-deploy.yml` は Node 22 で動いている。
- 本体の `package.json` には engines が**無い**。今のビルドは pages.yml で Node 18、ci.yml で Node 20 と揃っていない。
- **載せる手順は wrangler を Node 22 で動かし、版を `wrangler@4.114.0` に固定**する(`npx --yes wrangler@4.114.0 pages deploy ...`。server の版を上げた時は一緒に上げる)。
- **ビルドは今の実績どおり Node 18 のまま**とし、同じジョブの中で setup-node を2回使う(build を Node 18 → `actions/setup-node` を Node 22 でもう一度 → wrangler)。ビルドの Node を上げるかは別件。

**無料枠に dist が収まるか(実測は `public/`。dist はこれ+JS/CSS 数十本+html 3本+404.html)**:
- `public/` のファイル数 **1,288**(git 管理下も1,288)→ 上限20,000の約6%。
- 最大ファイル **7.2MB**(`public/audio/ashen-crown-oath.mp3`)。**25MB 超は0本**。
- 合計 **254MB**。Direct Upload は2回目以降**変わったファイルだけ**送る(内容ハッシュ)ので、普段の載せ替えは数MB〜数十MB。
- JS バンドルの最大サイズは build していないので未確認(25MB に届く心配は小さいが、手順B-3で実測する)。

### 1-4. 既存の Cloudflare 利用と鍵の使い回し

- 守護霊オンライン Worker `zombie-coop-signaling`(`server/wrangler.jsonc`)が同じアカウントにある。URL `https://zombie-coop-signaling.tanity0-zombie.workers.dev`(pages.yml の `GHOST_API_BASE`)=アカウントのサブドメインは `tanity0-zombie`。
- `server-deploy.yml` は 11月に成功しているので、トークンは **Workers と D1 には効いている**。**Pages の権限が付いているかは未確認**(社1)。アカウントID は同じものでよい。
- **Worker の Origin 判定(要修正)**: `server/src/ghost-origin.js` の `allowedGhostOriginValue` は **localhost 系・`capacitor:`/`ionic:`・`https://*.github.io`** だけを許す。`zombie.pages.dev` からの守護霊API(`/ghost`)は **403 になる**。
  - 足すのは **`zombie.pages.dev` とその配下(`*.zombie.pages.dev`=載せるたびに付く個別URL)だけ**。`.pages.dev` 全体は誰でも置ける場所なので許さない。
  - テスト `server/test/ghost-online.node.js` に許可/拒否の行を足す。`server/` の変更なので push で `server-deploy.yml` が自動で本番 Worker に出す。`BOT_AND_GHOST.md` 706行目の許可の説明も同時に直す。
  - 旧 `.github.io` の許可は切り替え完了後に外すかどうか社長判断(残しても害は小さいが、`*.github.io` は誰でも置けるので本来は緩い)。
- 待ち合わせ(`allowedOrigin`・WebSocket)は **localhost のみ許可**。ゲーム側の呼び出し口 `src/online/signaling.ts` は、本番コードのどこからも import されていない(import しているのは `src/online/signaling.test.ts` だけ)=実機ページからは使っていない。今回は対象外。
- Cloudflare Access はページ(`zombie.pages.dev`)だけに掛ける。守護霊 Worker は別ドメイン(workers.dev)なので Access の影響を受けない。

### 1-5. Claude Code のクラウド環境から非公開リポジトリに届くか

- このセッションは GitHub 連携(Claude の GitHub App+プロキシ)で clone/push している。非公開でも **App がこのリポジトリへのアクセスを持っていれば届く前提**だが、この環境から事前に確かめる手段が無い=**未確認**。非公開化の直後に設計チャットが `git fetch`+小さな push で確かめる(§手順E-2)。届かない時は claude.ai の設定 → Connectors → GitHub で App のリポジトリ許可を見直す(社長の操作)。最悪は**公開に戻せる**(§3)。
- Actions の起動ツール(MCP の `actions_run_trigger`)も非公開リポジトリで使えるかは同じく**未確認**。使えない時は社長が Actions 画面の「Run workflow」を押す(社長の手間が1つ増える)。
- このクラウド環境から `*.pages.dev` へ curl が届くかは、ネットワークの許可次第で**未確認**。届かない時は**社長のスマホでの確認(§2-1)が唯一の網**になる。

### 1-6. 非公開化の前に知っておく事実

- **公開中に外へ出た物は取り消せない**: これまでに取られた clone・ダウンロード・各種アーカイブは回収できない。非公開化は「これから先を見せない」だけ。
- フォークは現時点 **0**(GitHub API `forks_count: 0`・2026-11-24 確認)。
- 非公開にすると stars/watchers の一部が外れる、公開リポジトリ前提の外部サービス連携が切れる(GitHub の仕様)。
- 非公開化の前に、履歴に鍵やパスワードが入っていないかを一度見る(入っていたら非公開でも**鍵の方を作り直す**のが正。今回の調査範囲では確認していない=未確認)。

---

## 2. 手順(誰のボールかを各行に明記・「新しいページが動くのを確かめてから古いのを止める」順)

### A. 下ごしらえ(設計チャット・リポジトリが公開のままで行う)

- **A-1「base の切り替え」【設計チャット→実装サブエージェント】**: `vite.config.ts` の `base` を `process.env.VITE_BASE ?? '/zombie/'` に。コメント(「GitHub Pages で /zombie/ 配下」)も現状に合わせる。
- **A-2「404.html」【設計チャット→実装サブエージェント】**: `public/404.html` を足す(短い1行の HTML)。画像ではないので原盤の台帳(`assets:ledger`)は対象外。
- **A-3「載せるワークフロー」【設計チャット→実装サブエージェント】**: 新規 `.github/workflows/cf-pages.yml`(名前は案):
  - `on: workflow_dispatch`。入力は2つ: `sha`(載せるコミット。空なら開発ブランチ `claude/chat-context-continuity-saxlH` の先頭)と `create_project`(初回だけ true。§B-1)。
  - `concurrency: { group: cf-pages, cancel-in-progress: false }`。この設定では**走っている1本は止めず、待ちに置かれるのは最新の1本だけ**(待っていた古い方は取り消される)。続けて何度起動しても、最後に起動した版が載る。
  - 手順:
    1. checkout(`ref` に入力の SHA、空なら開発ブランチ)
    2. setup-node **18**(今の pages.yml と同じ)→ `npm ci`
    3. **載せる前の網**: `npm run typecheck` → `node scripts/check-circular-imports.mjs` → `npm run assets:check`(どれか落ちたら載せない)
    4. `VITE_BASE=/ GHOST_API_BASE=<今の Worker URL> npm run build`
    5. setup-node **22**(wrangler 4.114.0 の要求)
    6. (`create_project` が true の時だけ)`npx --yes wrangler@4.114.0 pages project create zombie --production-branch=main`
    7. `npx --yes wrangler@4.114.0 pages deploy dist --project-name=<B-1 で決まった名前> --branch=main --commit-hash=<載せたSHA>`(`--branch` をプロジェクトの本番ブランチ名と揃えると本番URLに載る。名前 `main` は Cloudflare 側の呼び名で、GitHub のブランチとは無関係)
  - 鍵は `secrets.CLOUDFLARE_API_TOKEN` / `secrets.CLOUDFLARE_ACCOUNT_ID`。鍵が空なら出さずに notice だけ(server-deploy.yml と同じ作法)。
  - 成果物(upload-artifact)は**作らない**=ストレージを食わない。
- **A-4「Worker の許可」【設計チャット→実装サブエージェント】**: §1-4 の `ghost-origin.js`+テスト+`BOT_AND_GHOST.md` の説明。push で server-deploy.yml が本番へ出る。
- **A-5「規約・文書の更新」【設計チャット】**(文書のみ):
  - `CLAUDE.md` の4か所:
    1. 配布方針節「GitHub Pagesは開発・実機テスト用チャネル」→ Cloudflare Pages(`zombie.pages.dev`・Access 付き)・載せ方は手動起動。
    2. Testing policy「CI(GitHub Actions・無料)は従来どおり毎pushでフルを回す=安全網」→ CI は手動。網は §1-1b の表どおり。
    3. Testing policy「Cost: CI on GitHub Actions is free (public repo, unlimited minutes)」→ 非公開は月2,000分。nightly が大半。
    4. 原盤の節「`npm run assets:check`(CIで毎push)」→ 載せる時(cf-pages.yml)に回る。
  - §1-2 の旧URL 4文書を新URLへ。
- **A-6【設計チャット】**: typecheck+lint→push。この時点では pages.yml も ci.yml も今のまま動くので、何も壊れない。

### B. 新しいページを立てる(公開のまま)

- **B-0「鍵の権限」【社長=社1】**。
- **B-1「プロジェクト作成(まだ何も載せない)」【設計チャット】**: cf-pages.yml を `create_project=true` で起動する。ただし初回の起動は**プロジェクト作成だけ**で止める作りにする(手順7の deploy を飛ばす入力を付けるか、作成用の別ジョブにする。実装時に決める)。
  - `zombie` が他人に取られていれば作成は失敗するか、`zombie-xxxx.pages.dev` のような別名になる(どちらになるか未確認)。結果のURLを Actions の実行記録で確かめ、社長へ報告し、以降の URL をそれに読み替える。
  - 手動の代替: Cloudflare ダッシュボード → **Workers & Pages → Create → Pages → Upload assets**(Direct Upload)でも作れる。ただしこの画面は作成時にファイルのアップロードを求める作りで、空のまま作れるかは未確認。そのため Actions からの作成を本線にする。
- **B-2「Access を先に掛ける」【社長=社2・社3】**(値は C-2)。**初回の載せより前に行う**=ゲームが一度も鍵無しで外に出ない。
  - 未確認: 何も載っていない `*.pages.dev` を Access のドメインとして保存できるか。保存できなければ、**中身の無い仮ページ(1行の index.html)を1回だけ載せてから** Access を掛け、その後に本物を載せる。
- **B-3「初回の載せ」【設計チャット】**: cf-pages.yml を `sha` 空(=開発ブランチの先頭)で起動。成功・所要時間・dist のファイル数と最大ファイルを記録し、本書の目安を直す。

### C. Cloudflare Access(社長の画面操作)

- **C-1「Zero Trust 開設」【社長=社2】**: ダッシュボード左 **Zero Trust** → チーム名を決める → **Free** を選ぶ。
- **C-2「アプリ登録」【社長=社3】**: Zero Trust → **Access → Applications → Add an application → Self-hosted**
  1. Application name: `zombie 実機`
  2. **Session Duration: 1 month(推薦)**。理由: スマホで毎回コードを打たされると「見たい」の手間が増える。対象は社長1人なので長めでも漏れの面は小さい。短くするなら 1 week。
  3. Application domain: `zombie.pages.dev`(B-1 の名前)を1行、**もう1行 `*.zombie.pages.dev`**(載せるたびに付く個別URLも塞ぐ)。
  4. Identity providers: **One-time PIN** にチェック(既定で入っていることが多い)。
  5. 次へ → Add a policy: Policy name `社長のみ`、Action **Allow**、Include → **Emails** → 社長のメールアドレス1つ。
  6. 保存。
  - 補足: Cloudflare Pages のプロジェクト設定にある「Access policy を有効にする」スイッチは**プレビューURL(`*.zombie.pages.dev`)しか守らない**(本番 `zombie.pages.dev` は守られない)。上の C-2 で本番も含めて掛けるのが正。
- **C-3「鍵が掛かっているかの確認」【設計チャット】**: Access 未ログインで `curl -I https://zombie.pages.dev/` が Access のログイン画面へ飛ばされる(302/403)ことを確認。**このクラウド環境から pages.dev へ届かない時はこの確認ができない**。その場合は社長のスマホ(§2-1 の手順2でコード入力画面が出ること)が唯一の網になる。

### 2-1. スマホでの確かめ方【社長=社4】

1. iPhone の **Safari** で `https://zombie.pages.dev/`(B-1 の名前)を開く(アプリ内ブラウザではなく Safari で)。
2. Cloudflare の画面でメールアドレスを入れる → 届いた**6桁のコード**を入れる(初回とセッション期限切れの時だけ)。**コード入力の画面が出ずにゲームが開いたら Access が効いていない**ので、設計チャットへ伝える。
3. タイトル画面が出て、**右上の版番号が設計チャットの伝えた最新版と一致**するのを見る(ゲーム中は左下)。
4. 保存が空から始まっている(新URLは別の保存場所)。必要なら開発用の解放操作で進める。
5. 1ステージ遊び、絵と音が出るのを見る。**後から読み込む素材まで見る**: ボスまで進めて技のアニメーション(跳び・薙ぎ等のシート)が出ること(素材のパスが `/` で正しく引けている確認。欠けていれば立ち絵のまま技を出す)。守護霊が出る場面があればそこも(Worker の許可の確認)。
6. **ホーム画面アイコンを作り直す**: 古い `tanity0.github.io` のアイコンは使えなくなるので削除し、Safari の共有ボタン → **ホーム画面に追加**で新URLのアイコンを作る。ホーム画面から開いた時に、もう一度メールのコードを求められることがある(Safari と別の保存になるため・未確認)。
7. 結果を設計チャットへ「開けた/版番号 v…/ボスの技が出た」と一言。

### D. 古いのを止める(**D-0 が「はい」になるまで進めない**)

- **D-0【社長】**: §2-1 でスマホから新URLが開け、版番号が一致した。
- **D-1「CI の自動起動を外す」【設計チャット→実装サブエージェント】**: `ci.yml` の `on:` を `workflow_dispatch` のみに。
- **D-2「nightly の時刻指定を外し、載せる時にユニットテスト全体」【設計チャット→実装サブエージェント】**: `nightly.yml` の `schedule` を消して `workflow_dispatch` だけに。`cf-pages.yml` の build の前に `npm test` を足す(決定⑦⑧。載るまでの目安は+2分前後で6〜8分)。
- **D-3「旧ページのワークフローを消す」【設計チャット】**: `pages.yml` を削除。
- **D-4【設計チャット】**: D-1〜D-3 を**同じ push**で出す(CI の外し忘れは数日で無料枠を使い切る)。

### E. 非公開にする

- **E-1「Make private」【社長=社5】**。
- **E-2「繋がるか」【社長=社7 → 設計チャット】**:
  - 設計チャットが `git fetch origin` と小さな push(文書1行)、Actions 起動ツールで cf-pages.yml を1回起動して確かめる。
  - 社長の Mac で `cd /Users/tanity/zombie && git pull` が通るかを見る(非公開になると GitHub へのログインが要る。聞かれたら GitHub のログインかトークンを入れる)。
  - cf-pages.yml の初回の非公開での実行で `npm test` が通るのを設計チャットが確認。
- **E-3「古いページの確認」【社長=社6】**: Settings → Pages で止まっているのを確認(止まっていなければ Unpublish)。`https://tanity0.github.io/zombie/` が開けないことを見る。
- **E-4【設計チャット】**: DEVELOPMENT_LOG に記録、PROJECT_STATUS の該当行を「実施済み」へ。

### 2-2. 普段の「最新版の載せ方」(切り替え後の運用)

- 社長「実機で見たい」→ 設計チャットが typecheck+lint 済みの最新を開発ブランチへ push → Actions 起動ツールで cf-pages.yml を起動(`sha` 空=開発ブランチの先頭。特定の版を載せる時はその SHA)→ 成功を見て「v… を載せました」と返す(**社長の手間は今と同じ**)。
- **載るまでの目安: 4〜6分**(内訳: Actions の起動待ち0.5〜1分+`npm ci`とビルド約1分(今の pages.yml の build 実績)+載せる前の網1〜2分+差分アップロード1〜2分)。初回は全254MBを送るので**10分前後**(未確認・B-3 で実測して本書を直す)。
- 載せる前の網(typecheck・循環import・原盤)が落ちたら載らない。設計チャットが直して起動し直す。
- 見積もり: 社長が「見たい」と言う回数は月10〜30回の想定(決定時の値・実数は未確認)。直近の pages.yml は3.3日で65本=毎pushだったので、**それに比べて大幅に減る**。

---

## 2-3. 家でのすばやい確かめ方(Mac の開発用サーバ・社長決定 2026-11-25「②を基本・④を併用」)

- **使い分け**: 数字をいじっては見る往復=これ(保存してすぐ反映・GitHub の制限に掛からない)。区切りの確認・外出先・重さや滑らかさの判断=Cloudflare のページ(§2-1・§2-2)。
- **Mac で打つ2行**(ターミナルで):
  1. `cd /Users/tanity/zombie && git pull`(設計チャットが push した最新を取り込む。非公開後はログインを求められることがある=E-2)
  2. `npm run dev -- --host`(初回や package.json が変わった時は先に `npm install`)
- **スマホで開く URL**: 2 を打つと `Network: http://192.168.x.x:5173/zombie/` の行が出る。その URL を iPhone の Safari で開く(Mac とスマホが同じ Wi‑Fi にいること)。5173 が使われていれば次の番号になる=表示どおりに開く。
- **合言葉は無い**(家の Wi‑Fi の中だけで開けるため)。止める時はターミナルで Ctrl+C。
- **製品版との違い**: 開発用のサーバは動きが遅めで、開発用の表示も出る。重さ・滑らかさの判断には使わない。
- **守護霊オンライン**: サーバの許可(`server/src/ghost-origin.js`)は今 localhost と `*.github.io` だけ=スマホから `192.168.x.x` で開くと守護霊の通信は弾かれる。A 段で `zombie.pages.dev` を足す時に、**家の中の番地(192.168.x.x / 10.x.x.x / 172.16〜31.x.x の http)も足す**(推薦。Origin の許可は元々ブラウザ以外からは偽れる弱い仕切りなので、家の中の番地を足しても守りはほぼ変わらない)。
- **Remote Control**: 社長の Mac を Remote Control でこの作業場所につなげば、1・2 は設計チャットが打てる(社長はスマホで開くだけ)。

## 3. 戻し方(うまくいかなかった時)

| 詰まった所 | 戻し方 |
|---|---|
| A〜C(新ページが動かない) | 何もしない=古い GitHub Pages がそのまま動いている。cf-pages.yml は放置か削除。base は既定 `/zombie/` のままなので影響なし |
| D の後(新ページが急に壊れた) | Cloudflare のダッシュボード → Workers & Pages → プロジェクト → Deployments で**一つ前のデプロイを Rollback**(1クリック)。または cf-pages.yml を前の SHA で起動。公開中なら `git revert` で pages.yml を戻して GitHub Pages を復活させることもできる |
| E の後(クラウドの Claude が clone/push できない) | 社長が claude.ai の Connectors → GitHub でリポジトリ許可を確認。直らなければ **Settings → Change visibility → Make public で一旦戻す**(GitHub Pages も使うなら D-3 で消した pages.yml を revert し、Settings → Pages で設定し直す) |
| E の後(Actions 起動ツールが使えない) | 社長が Actions 画面 → cf-pages → **Run workflow** を押す(設計チャットが「押してください」と頼む) |
| Access で社長が締め出された | Zero Trust → Access → Applications → `zombie 実機` → Policies でメールを直す/一時的にアプリを無効化 |
| 守護霊APIが 403 | `ghost-origin.js` の許可が本番 Worker に出ているか(server-deploy.yml の実行結果)を確認。出ていなければ Actions から手動実行 |

---

> **決定⑦⑧の後の見積もり(2026-11-25)**: 毎晩の約460〜580分が消え、載せる時に `npm test` 約3分×10〜30回=30〜90分が増える。合計は **月 約100〜300分**(枠2,000分の約5〜15%)。下の表は決定前の値。

## 4. 費用(無料枠の見積もり)

| 何 | 無料枠 | 見積もり(根拠) | 判定 |
|---|---|---|---|
| GitHub Actions 分(非公開) | 月2,000分 | nightly 約460〜580分(実測15.4分×30日・切り上げ込み)+ nightly に `npm test` を足す分 約90分(1回3分の推定)+ cf-pages 40〜180分(4〜6分×10〜30回)+ server-deploy 数分〜十数分 + CI 手動 数回×6分 ≒ **月 約600〜900分** | 枠内(半分以下)。**nightly が全体の6〜8割**。決定時の「月150分」は実測と合わない |
| GitHub Actions ストレージ | 500MB | 成果物を作らない形にするので、残るのは npm キャッシュ(数えられるか未確認) | 枠内の見込み |
| Cloudflare Pages(Direct Upload) | ファイル2万・1ファイル25MB・(Git 連携のビルドは月500回) | ファイル 約1,300本・最大7.2MB。Direct Upload はビルド回数を消費しない | 枠内 |
| Cloudflare Zero Trust(Access) | 50人まで無料 | 社長1人 | 枠内 |
| 守護霊 Worker | 既存のまま | 変更なし | 変化なし |

※**もし CI の自動起動を外し忘れると**、月7,000分前後で数日のうちに枠を使い切り、以後 nightly も載せる手順も止まる。D-1 は D-3 と同じ push で必ず行う(D-4)。

---

## 5. 出す直前にやること(製品版の守り)——現状調査

非公開化とは別の話。ストア配布の前に、製品ビルドに何が残っているかを `npm run build` を回さずに設定とコードから判断した結果。

### 5-1. 開発用の窓口(`window.__*`)
- 実物を数えた7つ(`__gameStore` `__pixiScene` `__audioDebug` `__getTex` `__texBreak` `__texList` `__opAudioDebug`)は**全て `import.meta.env.DEV` の中**で付く=**製品ビルドには付かない**(`gameStore.ts` 30712行・`PixiStage.tsx` 137行・`audioManager.ts` 2679行・`pixiTextures.ts` 1804行・`OpeningScene.tsx` 609行)。

### 5-2. URL のツマミ(`?proj=` `?bot=` `?smoke` `?benchonly=` など)
- **製品ビルドにも残っている**。`pixiScene.ts` の `tsNum` / `tsBool` は DEV で囲われておらず、ファイル内で `tsNum(`/`tsBool(` を含む行が356行。`useGameLoop.ts` の `evNum` など、`location.search` を読むファイルが src に62本(テスト除く)。
- アプリ配布(ストア)では利用者が URL を打てないので、実害は「WebView に任意の URL を渡せる環境」と「解析された時に開発ツマミが見える」程度。外すなら、ツマミの読み口を1か所に集め、**製品ビルドでは常に既定値を返す**関数に差し替える(仕様を変えない機械的な作業・別案件)。

### 5-3. ソースマップ
- `vite.config.ts` に `build.sourcemap` の指定が無い=Vite の既定(出さない)。**製品ビルドに .map は出ていない**と判断(build して dist を見ての確認は未実施)。

### 5-4. 開発用ページと識別子
- `vite.config.ts` の `build.rollupOptions.input` に `bossmaker.html`(ボスメーカー)と `zoo.html`(敵モーション動物園)が入っている=**本編のバンドルには載らないが、dist にはページとして出る**(今の実機ページにも載っている)。製品ビルドでは input から外す(環境変数で分岐)。
- `__GIT_COMMIT__`(コミットの短いハッシュ)が埋まる。製品で困るものではないが、要らなければ外す。

### 5-5. ストア配布の DRM
- iOS(App Store): ストアの配布自体に暗号化(FairPlay)が掛かる。追加作業は無い。
- Android(Google Play): Play App Signing+**Play Integrity API**(正規の端末・正規のインストールかを確かめる)を使うかどうか。オンライン要素(守護霊 Worker)側で確かめるなら意味がある。
- Steam(別配布の構想がある場合): Steamworks の DRM ラッパーは任意。
- いずれも**ストア側の仕組みに乗るのが推薦**。

### 5-6. 素材の暗号化は推薦しない(理由)
1. **鍵がアプリの中に必ずある**: 復号して表示する以上、鍵も復号処理も端末側に配る。解析すれば取り出せるので、守りとして成り立たない。
2. **メモリが悪化する**: 暗号を解くには「暗号のまま」と「解いた後」を一時的に両方持つ。このゲームは起動時のテクスチャが既に端末のメモリ天井に近い(CLAUDE.md の実測 308MB)ので、天井で落ちる危険が増える。
3. **起動が遅くなる**: 約1,300本・254MB を毎回解く処理が起動ローディングに乗る。
- 代わりの守り: ストアの配布暗号化(上記)+利用規約と著作権表示。素材の原盤は非公開リポジトリと手元に置く(今回の非公開化がそれに当たる)。

### 5-x. AI に取られる道の点検(社長決定 2026-11-25)
- **塞げる**: 非公開化で、外のクローラーはリポジトリを読めなくなる。GitHub は非公開リポジトリの中身を AI の学習に使わない方針(**切り替え時に今の規約を確かめて、この行に日付と結果を書く**)。テストページは Access で入れない。
- **塞げない(事実として残す)**:
  1. 公開だった期間に外へ出た分は取り消せない。
  2. ストアに出した後のアプリの中身(JavaScript・絵・音)は誰でも取り出せる=個人が AI に読ませるのは防げない(どのゲームでも同じ)。出す前の守りは §5 の「開発用ツマミとソースマップを外す」まで。
  3. 開発に使う AI サービス自身(Anthropic・Codex 等の学習への利用の設定): **点検しない**(社長 2026-11-25「その二つは気にしなくていいや」)。
- **出す直前の点検項目**: ①§5 の製品ビルドの確認 ②ストアの配布物の中身を1回取り出して、開発用の文書(research/ 等)が入っていないことを見る。

