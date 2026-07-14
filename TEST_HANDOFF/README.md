# TEST_HANDOFF — 設計チャット⇔テストチャットの受け渡し(社長運用決定 v0.25.1706)

## 流れ
1. **設計チャット**: テストが必要になったら `TEST_HANDOFF/REQUEST.md`(+`request.config.json`)に
   依頼内容を書いて push。
2. **テストチャット(ローカル・テスト専用)**: 社長が「**テストして**」とだけ言う →
   `git pull` → `REQUEST.md` を読む → 実行(基本は `node scripts/botrun-local.mjs`) →
   結果を `TEST_HANDOFF/results/` に書いて push(下記の掟)。
3. 社長が設計チャットに「テストしたよ」と言う → 設計チャットが pull して結果を分析。

## テストチャットの掟(テスト専用)
- **コード(src/等)・設計書・CLAUDE.mdは編集禁止**。触ってよいのは `TEST_HANDOFF/` 以下のみ
  (必要ならローカル一時スクリプトは /tmp に)。
- push は `claude/chat-context-continuity-saxlH` ブランチへ。**TEST_HANDOFF/ のみの変更は
  バージョンbump・changelog・DEVELOPMENT_LOG不要**(コミットメッセージ先頭に `[test-report]`)。
- 結果ファイル: `results/<YYYYMMDD-HHMM>-<件名>.md`(人間向け要約)+同名 `.json`(生データ)。
  最低限入れるもの: 実行環境(OS/ブラウザ/headed or headless)・各ランの `[BOT_REPORT]` 生JSON・
  consoleエラー全文(なければ「0件」)・気づき(任意)。
- ブラウザはローカルChromeを使用(`scripts/botrun-local.mjs` は `channel:'chrome'`)。
  ゲームは既定でデプロイ版(https://tanity0.github.io/zombie/)を叩く=ビルド不要。
  最新pushの反映待ち(Pagesデプロイ数分)に注意。ローカルで最新を試す時は
  `npm install && npm run dev` して `request.config.json` の baseUrl を差し替え。

## セットアップ/トラブルシュート
- 初回: `npm install`。ブラウザ起動に失敗したら `npx playwright install chromium`(Chrome不在フォールバック用)。
- `?smoke=1` はタイトル/メニューを全部スキップして即プレイに入るデバッグ導線。**効かずタイトルで
  止まった場合はスクリプトが自動でUIクリック**(はじめる→狂い咲きの森→出撃準備→START)にフォールバックし、
  `smokeFallback: true` を結果に記録する(=smoke不発の証拠。そのまま結果をpushしてよい)。
- **手動でゲーム開始する場合の操作手順**(スクリプトが全滅した時の最終手段):
  1. `https://tanity0.github.io/zombie/?bot=standard` を開く(botパラメータ付き)
  2. タイトルの「**はじめる**」→ ミッション一覧で「**狂い咲きの森**」(ステージ1)→
     「**▶ 出撃準備**」→ キャラ選択で「**▶ START**」
  3. ゲームが始まればボットが操作を自動で引き継ぐ。死亡 or 15分でF12コンソールに `[BOT_REPORT]` が出る
- どうしても開始できない場合: スクリーンショット+console全文+開いたURLを results/ に書いて終了
  (原因調査は設計チャットの仕事。自分でコードを直さない)。

## 設計チャットの掟
- REQUEST.md には「目的・構成(ロードアウト/スキル/ペルソナ)・時間・記録してほしい項目」を明記。
  `request.config.json` を同時に更新(スクリプトはこれを読む)。
- 結果の分析・裁定材料化は設計チャットの仕事。テストチャットに判断をさせない。
