# テスト依頼 #1: M27〜M33(新サブ4種+新スキル+監査修正)のフル速ソーク(v0.25.1706)

## 目的
クラウド(GPU無し・ゲーム時間1/20)では取れなかった**フル速(60fps)の長時間実走**で、
新実装のバグ(consoleエラー/挙動破綻)とバランスの実測データを取る。

## やること
0. **診断(最初に1回)**: デプロイ版が最新か確認——`https://tanity0.github.io/zombie/` を開き、
   タイトル右上のバージョンを記録(v0.25.1707未満なら数分待って再確認)。前回「?smoke=1がタイトルで
   止まる」報告があったため、スクリプトはタイトル検出時に自動でUIクリックへフォールバックする
   (結果の `smokeFallback` フィールドに記録される。trueのランが多い場合はその旨をMDに明記)。
1. `git pull` 後、`npm install`(初回のみ)。起動失敗時は `npx playwright install chromium`。
2. `node scripts/botrun-local.mjs` を実行(構成は `TEST_HANDOFF/request.config.json`=6構成×最大15分。
   合計最大90分・放置可。途中でボットが死んだらそのランは自動で次へ)。
3. 結果を `TEST_HANDOFF/results/<YYYYMMDD-HHMM>-m27-33-soak.md`(+自動出力の.json)にまとめて
   `[test-report]` コミットで push。ゲーム開始まで到達できない場合はREADMEのトラブルシュート→
   それでもダメなら状況(スクショ+console+URL)だけpushして終了。

## 記録してほしい項目(スクリプトが自動収集。MDには要約を)
- 各構成の `[BOT_REPORT]`(outcome/survivedMs/deathCause/kills/playerLevel/maxDepthPx/gold)
- consoleエラー・pageerror(全文。0件なら0件と明記)
- baseline と各構成のキル数/生存時間の差(体感でよいので「明らかに強い/弱い」があれば一言)

## 特に見たい点
- センサー地雷CD10秒後の設置頻度(スパム消滅の確認)・ジャンクのスクラップ収支
- オーバークロック構成でサブ発動が目に見えて増えるか
- バーサーカー全攻撃化(M33②)後、被弾が増えるほど爆発/召喚ダメージが伸びるか
- 援護射撃NPC(非出撃クラス)の出入りが破綻しないか(見た目の異常があればスクショ)
