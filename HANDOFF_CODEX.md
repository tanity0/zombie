# HANDOFF_CODEX.md — Codexへの引き継ぎブリーフ(v0.26.17時点・方向転換フォーク)

このファイルは、開発をCodex(または任意の新しいエージェント)へ引き継ぐための入口。
**最初にこのファイルを読み、次に§3の順でファイルを読むこと。**

## 0. 30秒サマリ

- 作業ブランチは **`claude/direction-shift`**(方向転換フォーク・バージョン0.26.x)。
  旧線 `claude/chat-context-continuity-saxlH` はセーブポイントとして**凍結・push禁止**。
- 進行プロジェクトは **PACING_V2.md**(難易度調整AIの作り直し)。**バッチR1〜R4・R6・R7は実装完了**。
  残タスクは ①社長の統合テストのフィードバック反映 ②R5(ゴールド経済・価格の社長採否待ち・着手禁止)。
- **旧・憲法(constitution.test.ts)は社長指示で廃止済み**(v0.26.8)。テストファイル自体は現存機構の
  回帰ガードとして残っているが「全条維持」の縛りは無い。現行の出現規定はPACING_V2.md§2(エリア台本)。
- 実機確認URL: **https://tanity0.github.io/zombie/v2/**(新線)/ https://tanity0.github.io/zombie/(旧線)。
  pushごとに両線合成で自動デプロイされる(§5参照)。

## 1. 何をしたいか(目的)

**大目的**: トップダウンHD-2Dサバイバル(React+Zustand+PixiJS/モバイルSafari実機・60fps死守)の
ゲーム体験を「ジェットコースター(最初からMAX)」から「**心電図**(緩急が呼吸する)」へ再設計し、
コアループ(①秒=刈る手触り/②分=関所と深入りの意思決定/③ラン=ゴールド→強化)を閉じること。

## 2. いまどういう状況か(実装済みの全体像)

このフォークで実装済み(詳細な仕様は各々PACING_V2.mdの該当節):

| バッチ | 内容 | 版 |
|---|---|---|
| R1 | 台本ローテーション: rank寄せ廃止→時間解禁(unlockMs)+未見優先+直前禁止+一様抽選。主題保証(関所15秒でfeatured未出現なら確定投入)。pressure上げτ8→5s・Intensityホールド撤廃 | v0.26.3 |
| R2 | 時間骨格60秒化: 導入60s→関所60s⇄緩60s交互、7:00-7:30城ボス(中間ゴール)、7:30以降=深入りモード(報酬×1.5)で交互を無限継続 | v0.26.4 |
| R3 | 関所テーマ可視化: 関所開始バナーに台本名(「数の関所」等)。診断グラフに台本id | v0.26.5 |
| R4 | 緩整理(純休憩⇄HARVEST交互・立て直しコマ7:30-8:30は純休憩固定)+浅エリア追加表現(非イベント関所のみshallowExpression: tempo/ring/pincer/waves。イベント関所はv0.26.17で本来イベントを止めない) | v0.26.7-8 / 補正v0.26.17 |
| R6 | ディレクター再統合: relaxSpawnAdjust(緩める側)デフォルトON(既存ブレーキとmax合成)・buildup(強める側)はopt-inのまま・リザルトの緊張曲線+難易度スコアをデフォルト表示。台本選択に非類似優先(テーマタグ)+最高段非収束の保証 | v0.26.12 |
| R7 | エリア台本(PACING_V2.md§2): エリア1〜4で15秒ロール×エリア別確率[0,0.20,0.25,0.30,0.35]で問題児セット注入。キャップ=パンプキン2/犬2/弾3、別枠=叫び1/ゴースト2(3分超orエリア3以降)。ディレクター連携(gateコマ中のみ・RELAX中・intensity≥0.75・pity中は発火しない)。v0.26.17で敵エリア制約を撤廃し、エリア1でもパンプキン等を止めない | v0.26.13 / 補正v0.26.16-17 |
| R5 | ゴールド経済接続 — **着手禁止**(CORE_LOOP.md§6の価格叩き台の社長採否待ち) | 未着手 |

- **数値は全部「叩き台」**(実機調整前提)。ただし勝手に変えるのは禁止(CLAUDE.mdの仕様変更ルール)。
- **テスト方針(社長指示)**: この線はバッチごとの実機確認をせず、一気に実装→統合テスト1回で判定。
  現在は**社長の統合テスト待ち**。フィードバックが出たらそれを反映するのが次の仕事。
- 主要な新規モジュール(全てレンダラ非依存の純関数+ユニットテスト):
  `src/utils/gateProgram.ts`(台本ローテ+タグ)/`gateGuarantee.ts`(主題保証)/
  `shallowExpression.ts`(浅エリア代替表現)/`areaScript.ts`(エリア台本)/
  `difficultyDirector.ts`(新PHASES)/`reliefProgram.ts`(緩の演目)。配線はuseGameLoop.ts。

## 3. 読むファイル(この順で)

| 順 | ファイル | 何が書いてあるか |
|---|---|---|
| 1 | **CLAUDE.md** | 絶対規律。仕様変更ルール(勝手に変えない・提案→社長採否)/実装精度の規律/Branch lock/version bump/トークン節約 |
| 2 | **PACING_V2.md** 全文 | 現行プロジェクトの正式仕様(§2エリア台本/§3ディレクター再統合/§4非類似ローテ/R1〜R7の各仕様と受け入れ条件/★未決事項/裁定の経緯) |
| 3 | **DEVELOPMENT_LOG.md** 先頭〜10エントリ | 直近の変更履歴(これが正史)。作業したら必ず追記 |
| 4 | **ENGINEERING_NOTES.md** | 診断の型・実バグ化した地雷(Pixi v8 filterArea/iOS音声/集計の生参照等)・逆引き表。**描画/音声/集計/スポーンを触る前に必読** |
| 5 | PACING_REDESIGN.md | 旧線の緩急仕様(前提知識)。PACING_V2.mdと矛盾したらV2が勝つ |
| 6 | CORE_LOOP.md | コアループ棚卸しとゴールド経済の叩き台(R5の前提) |
| 7 | DESIGN_CHAT_GUIDE.md | 設計チャット役をやる場合の運転マニュアル(社長との流儀) |
| 8 | HANDOFF_DANCE_AUDIO.md | 音声を触る場合のみ |

※CHAT_HANDOFF.md・AI_DIRECTOR_HANDOFF.mdは古い。読まなくてよい。

## 4. 作業ルールの要点(詳細はCLAUDE.md)

- ブランチは **`claude/direction-shift`のみ**。push前に必ず`git fetch`(並行エージェントがいる。
  コンフリクトしたらrebaseで両方のログエントリを残し、versionは自分の分を繰り上げる)。
- **毎pushで`package.json`のversionをbump(0.26.x)**し、**全返信の末尾に現バージョンを明記**。
- 変更ごとにDEVELOPMENT_LOG.mdへ追記(何を・なぜ・検証結果・負荷スコアx/10・
  「PACING_V2.mdの現行設計と矛盾しないか」の自己点検1行)。
- push前検証: `npm run lint && npm run typecheck && npm test && npm run build`(全部通す)。
- **仕様・数値・挙動を勝手に変えない**。未決に当たったら**PACING_V2.mdの★未決事項**に書いて
  止まる(コードコメントに質問を書かない)。
- 挙動を変える機能には復帰フラグ(`?xxx=0`)を付ける。
- シミュレーション(src/store, src/utils, src/world)はレンダラ非依存を維持。PixiJSは読むだけ。
- 配線ロジックはできるだけ`src/utils/`の純関数に切り出し、同コミットでユニットテストを書く。

**主要な復帰フラグ(新線で追加されたもの)**:
| フラグ | 戻る先 |
|---|---|
| `?v2=0` | R1+R2をまとめて旧挙動(rank寄せ選択+旧PHASES)へ |
| `?shallow=0` | R4-C(浅エリア代替表現)無効 |
| `?areascript=0` | R7(エリア台本)無効 |
| `?directorApply=0` | R6のrelaxデフォルトON無効 |
| `?director=0` | リザルトの緊張曲線・スコア非表示(+ディレクター信号自体も無効) |
| 旧線から継続 | ?ladder/?events/?mix/?debt/?setpiece/?beat/?upswing/?gateprogram/?program/?rank/?pity/?stageaggro/?zoomlock |

## 5. インフラの注意(2026-07-03の障害の教訓)

- GitHub Pagesは**両線合成デプロイ**: どちらの線がpushしても、`/zombie/`=旧線・`/zombie/v2/`=新線の
  両方が最新でビルドされる(`.github/workflows/pages.yml`)。
- `github-pages`環境の「Deployment branches and tags」に**両ブランチが許可されている必要がある**
  (v0.26.14で新線を追加済み)。deployジョブが「開始1秒で失敗・ログ404」になったら、まずこの
  許可リストを疑うこと(環境保護ルール拒否のシグネチャ)。
- CI(`.github/workflows/ci.yml`)はlint→typecheck→test→buildをpush/PRごとに実行(公開リポで無料)。
