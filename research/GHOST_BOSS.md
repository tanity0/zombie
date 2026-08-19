# 守護霊ボス(ボスモードで守護霊と戦う)設計 v1

## ゴール(社長の言葉のまま)
「試しに、ボスモードに守護霊の最強データを一体、ボスとして配線できる?プレイヤーと守護霊を戦わせてみたい」
(骨子=第1弾3技構成は v0.25.3624 の返信で提示し社長「はい」=GO済み)

## 「ではない」条件(労力をかけない所)
- **「試しに」の第1弾**である: サブウェポン群・スキル群・装備効果のフル再現は**第2弾**(やらない)。
  技は3つ(近接スイング/銃撃/一閃ダッシュ)に絞る。
- **本編への組み込みではない**(ボスモード=変異体対策室の特別枠のみ。湧き表・コマ・イベントには一切触れない)
- **オンライン対戦ではない**(相手は固定守護霊台帳のローカルデータ)
- **botの腕前の改善は別件**(頭脳は既存部品の流用)

## 決定事項
- **相手=固定守護霊台帳(fixedGuardians.ts・20体)の score 最上位1体**(社長「はい」時の既定。
  プレイヤー自身の装備写しは第2弾候補)。名前・クラス・銃/近接キー・得意距離(preferredDist)を台帳から読む。

## 方式
### 枠(入口)
- PRACTICE_SLOTS に独立枠 `ghost-champion@practice` を**1つ**追加(カテゴリ 'duel'・一覧の最下段)。
  ラベル=「(守護霊名)(幻影)」。解放=常時(開発実験枠。遭遇ゲートを新設しない)。
  ※bossPractice.test の「守護霊メニューと同じ台帳」不変条件は「+bounty4+duel1」へ改訂する(裁定として記録)。
- 出撃: stage-1・新 PracticeParam `ghostbossnow`(useGameLoopに賞金首(bountynow)と同型の
  強制スポーン1回を追加。`?ghostbossnow=1` の直リンクも同時に効く)。

### 敵実体
- 新 EnemyType **`ghost-boss`**。**isBossTypeに編入**(即死処刑されない/ボスHPバー/致命の一撃・
  KILL演出の対象/宿敵昇格なし)。HP=専用定数 `GHOST_BOSS_HEALTH = 3000`(叩き台)。体勢値=ボス標準。
- 見た目: 守護霊と同じ**クラス立ち絵の流用描画**(pixiの疑似プレイヤー描画=fakeGhost型)。
  敵と読めるよう**ダーク系tint+赤い目glow**(叩き台。素材は作らない)。頭上に台帳の名前ラベル
  (宿敵ラベルの流用)。

### 頭脳(既存部品の向き替え)
- 移動: 毎tick「プレイヤーを標的」にした簡易ステア——preferredDist を保つ(近接型は詰める/
  射撃型は間合いを取る)+分離(壁は resolveAabb)。bot部品(dodgeVector等)は**流用しない**
  (敵側に回避を持たせるのは第1弾の範囲外。まず戦いが成立することが目的)。
- 技のローテーション: ボス標準の「技→硬直→抽選」型(bossState機械)。距離で抽選を変える
  (近=melee / 中=issen or shot / 遠=shot)。

### 技3つ(カウンター文法準拠=赤は判定と厳密一致)
| 技 | 状態 | 予告 | 判定 |
|---|---|---|---|
| 近接スイング `gb-melee` | `gb-melee-windup`(500ms)→`gb-melee`→`gb-melee-recover` | 赤帯(幅=判定) | 前方帯 |
| 銃撃 `gb-shot` | `gb-shot-windup`(400ms)→発射→`gb-shot-recover` | 構え(体の張り) | **共通の赤二重丸弾**×3連(絵替え禁止の掟どおり) |
| 一閃 `gb-issen` | `gb-issen-windup`(700ms)→`gb-issen-dash`→`gb-issen-recover` | 赤ライン(帯=判定) | ライン帯に沿って高速移動・接触ダメージ |
- カウンター: windup 2種(melee/issen)は帯宣言を **COUNTER_REACH_DECL に登録**(完全性テストが強制)。
  shotは弾を打ち返す(共通弾の既存文法)。
- moveCancelGuard: 新規連携なし(標準の windup→active→recover のみ=申告不要)。
- 反応表: `gb-melee` / `gb-issen`(MELEE_STATE_TO_MOVE)+ `gb-shot`(BULLET側・srcMoveKey)を台帳へ
  追加(MOVE_KEYS_BY_BOSS_TYPE 導出テストに乗る)。

### 数値(全部叩き台・メーカー調整は第2弾)
melee: 帯 160×40px・damage 18 / shot: 弾速480・damage 8×3(gap 120ms)/
issen: ライン420px・幅36・dash 260ms・damage 22 / 技間の休み 900ms / 移動速度 プレイヤー基準×1.0。

## 実装地図(Opusバッチ1本・中)
1. 台帳: fixedGuardians から score最上位を引く純関数 `strongestGuardian()`(+テスト)
2. 枠: bossPractice に duel枠+PracticeParam・テスト改訂 / useGameLoop に強制スポーン
3. 敵: types(EnemyType/bossState)・isBossType編入・HP定数・`src/utils/ghostBossTick.ts`
   (状態機械=純関数寄り・ユニットテスト)・counterReach宣言+テスト・moveReaction台帳+テスト
4. 描画: pixiSceneにghost-boss分岐(クラス立ち絵+tint+赤目+赤帯/赤ライン予告+名前ラベル)
5. 検証: typecheck/lint+関連テスト(憲法・counterReach完全性・moveReaction導出)

## ★未決(裁定不要と判断した点=事実として記録)
- 「最強」=score最上位(台帳の既存指標)。同点時はid昇順。
- 幻影が敗北した時: 通常のpracticeWin(勝ち)。討伐アテンション=ボス標準のまま。
