# チャット引き継ぎ (handoff) — 2026-06-19 時点 / v0.25.590
> **【注意・v0.25.1351】この文書は古い(特にブランチ運用: 現在はchat-context-continuity-saxlHで直接開発)。**
> 現行の引き継ぎは **DESIGN_CHAT_GUIDE.md(設計チャット)/CLAUDE.md(共通規律)** を読むこと。
> 「型チェックの穴」の知見はENGINEERING_NOTES.mdへ移設済み。

次のチャットはこのファイルと CLAUDE.md / DEVELOPMENT_LOG.md を最初に読むこと。

## ブランチ / 配信フロー(重要)
- **作業ブランチ**: `claude/cool-edison-7b8jrl` … コードはここで開発・コミット・push。
- **配信(ライブ)ブランチ**: `claude/chat-context-continuity-saxlH` … GitHub Pages がここからデプロイ。
  - 反映手順: cool-edison に push した後、**`git push origin HEAD:refs/heads/claude/chat-context-continuity-saxlH`**（基本fast-forward）でライブへミラー。
  - 公開URL: **https://tanity0.github.io/zombie/**（数分後反映・強制リロードで確認）。
  - Pages workflow(pages.yml)は許可ブランチ限定。chat-context は許可済み。cool-edison から直接デプロイは環境制約でNG。
- 並行して**別チャット**が同ブランチを進めることがある（例: PNG再圧縮を別セッションが実施）。push前に `git fetch` → 必要ならFF/リベース。**バージョン衝突したら自分の分を繰り上げる**。

## 必須ルール(CLAUDE.md)
- **毎push で package.json `version` を bump**。返信のたびに現バージョンを明記（画面右上/左下に表示）。
- 変更ごとに **DEVELOPMENT_LOG.md** へ追記。
- 実行コストのある変更は **load score(1/10〜10/10)** を述べる。モバイル優先。
- **描画(PixiJS)と game logic を分離**: Pixiは store を読むだけ・書かない。当たり判定/壁は `src/world/`（Pixi import禁止）。`useGameLoop` が唯一のシム書き込み。
- **React 再レンダー規律**: 毎フレーム変わる object/array 全体を購読しない。必要フィールド/派生プリミティブのみ。
- 障害物規約: 当たり矩形の下辺=足元、スプライトは足元から上へ(anchor 0.5,1)。`footRect`/`resolveAabb`、矩形AABBのみ。
- サブ武器/グレネード等は明示指定がない限りスローモーションを出さない。

## 型チェックの穴(注意)
- `npx tsc --noEmit` が**未import識別子(TS2304)を検出しないことがある**（過去 `skillSummonHpMult` 未importでランタイムReferenceErrorがすり抜けた）。
  ビルドは esbuild で型チェックしない。**新規 import 漏れは目視確認**すること。`npx tsc --noEmit; echo exit:$?` で exit を必ず見る（`| head` でマスクしない）。

## このセッションでやったこと(主要)
- 死神スキル(reaper): フィニッシュ時、近接スイング範囲内を全員フィニッシュ/ボスは×5。
- スラッシャー: 「近接命中後、CD中タップで0.3x追撃」(自動でない・専用CD無し)。
- シールド致命バグ修正(`skillSummonHpMult` 未import→毎フレ例外でループ後半停止)。
- シールドバッシュ: 叩いた面方向へ押し出し。
- 投げ(発火)ナイフ 爆発範囲アップ。スケーター 速度3倍/慣性1.2s。
- ガチャ無料(`GACHA_PULL_COST=0`、暫定)。
- 囲い系イベント(`activeEvent`): 円コリジョン閉じ込め(`src/world/arena.ts`)、horde/giantbatミニボス、cap10→20、通常スポーナ停止、終了=全滅/時間。giantbatの勝利判定は `fromEvent` 除外。
- ステージ2: 城マーカー抑制＋クリアアイテム位置マーカー。
- **キャラ固有スキル**(`player.characterClass`で自動・装備枠非消費): ストライカー=弾切れ近接×1.5 / スカベンジャー=弾薬取得で3s銃+10% / マークスマン=移動3s+で射程+10% / ヘビーガンナー=同一攻撃2体以上で3s爆発範囲+10%(`registerMultiHit`)。ショップからキャラ固有サブ武器を除外(`CHARACTER_SUBWEAPON_KEYS`)。
- **PHILLガン**: 狙いサークルが敵頭に吸い付き(`phillReticleDX/DY/phillSnapEnemyId`、`movePlayer`で算出)、スナップ中の発砲=即ヘッドショット(通常弾出さない)/非スナップ=通常射撃。照準サークルは環境光の影響外へ(uiLayer・暗幕より上・screen座標)。設置型サークルは据え置き。
- **容量削減**: 画像=別チャット再圧縮＋段階Aリサイズ(単体スプライト長辺480px=表示×4・コード非改変、8枚 4.68→0.60MB)。音声=不要loop素材削除(10.3MB)＋非リズムBGMを144k再エンコード(41.9→28.3MB)。**dist 89→62MB**。

## 現在の状態
- 最新版: **v0.25.590**。dist≈62MB(音声40.5/PNG22/JS1.2)。
- 一時ツール: `sharp` / `ffmpeg-static` を **--no-save** で導入済み(package.json/lock 非改変、node_modulesは揮発)。次チャットで画像/音声を触るなら再導入が要る場合あり。
- アセット原寸/元データは **git履歴**で復元可能（cool-edison: a1a7208 が再圧縮直後）。`references/` `art_src/` に原寸あり。

## 未対応・任意(やるなら注意点)
- 段階B 床タイル(`lab-floor*`、最大の容量塊): TilingSprite の `GROUND_TILE_SCALE` がソース寸法前提→縮小は**敷き詰めスケール調整＋実機でバンディング/ズレ確認**が必須。
- 段階B 背景/壁: 全画面ボケ注意。**タイトル画像は触らない(社長指示)**。
- 音声さらに: dance-100/120/140.mp3 は**位相キャリブレーション(useGameLoop 981-990の一回スナップ＋ダウンビート補正)**前提なので**触らない**。SFX wav(計261KB)はクリアさ優先で据え置き。
- ガチャ無料は暫定。本番は `GACHA_PULL_COST=150` に戻す。
