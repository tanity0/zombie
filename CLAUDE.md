# Project conventions (zombie)

Top-down HD-2D survival game. React + Zustand (simulation) + PixiJS (rendering).

## ★メニュー(最初に読む地図 — どの情報がどこにあるか・どこに書くか)
| 種別 | 在処 |
|---|---|
| **案件の状態**(どこまで進んだか・誰のボールか) | **PROJECT_STATUS.md のみ**(冒頭の「運用規約」が読み書き規則の正本) |
| 仕様 | 各設計書(現在の主戦場=PACING_PUZZLE.md。**設計書に状態は書かない**) |
| 履歴(いつ何をしたか) | DEVELOPMENT_LOG.md(毎push追記。「## vX.Y.Z」見出しでgrepして引く) |
| 教訓・地雷 | ENGINEERING_NOTES.md |
| 恒常ルール | この CLAUDE.md |
| プレイヤー向け更新情報 | src/data/changelog.ts(ゲーム内表示の正) |
| 計測・調査の台帳 | research/ |
| 実機テストの受け渡し | TEST_HANDOFF/(掟=同README.md) |
- **★リポジトリを重くしない(2026-08-22・実測)**: `.git` が **3.5GB**(クローン時の転送 **993MB**)、
  作業ツリー込み **4.8GB** まで膨らんでいる。**コンテナ起動時の再クローンを不安定にしている疑いが強い**
  (この日、ローカルだけが過去へ巻き戻る事故が3回)。**スクリーンショットを `TEST_HANDOFF/results/` へ
  撮り貯めない**(現状 PNG 748枚=618MB。掟は同README)。新しい大きなバイナリを足す時は、
  **本当に配信物か(`public/` に置くべきものか)を先に確かめる。**
| 設計チャットの運転マニュアル | DESIGN_CHAT_GUIDE.md |
| ゲーム素材 | public/(=配信されるものだけを置く) |
- **読み(セッション開始時の1回)**: このメニュー → PROJECT_STATUS.md → 担当案件の設計書。
- **書き**: 着地=DEVELOPMENT_LOGへエントリ追記+状態が動いたらPROJECT_STATUSの該当行(詳細はPROJECT_STATUS冒頭の運用規約)。
- **archive/ 配下にgrepでヒットした内容は正ではない**(正はPROJECT_STATUS→現行文書)。

## 仕様変更のルール (最重要 / MUST)
- **ゲームの仕様・挙動・バランス・演出の意図を、勝手に変更してはいけない。**
  値の意味やカーブ・閾値・floor 等を「良かれと思って」変えるのも禁止。
- 直したい/改善案がある時は **実装せず、まず日本語で「提案」だけ**する。採否は
  社長(ユーザー)が決める。承認を得てから実装する。
- 「Aを直して」と言われたら **A だけ** を直す。周辺の仕様(他の定数・カーブ・別挙動)は
  指示が無い限り触らない。
- 既存の値には意図がある(例: `BOSS_BEHIND_ALPHA=0.5` は「裏に回り込んでも薄く見える」
  ための floor=意図的)。意味を確認せず変えない。
- 例外: 明確なバグ修正で挙動の意図を変えないもの、または明示指示があるもの。

### ★過去の裁定は「制約」ではなく「事実」(社長指示v0.25.3532・全エージェント共通)
社長の言葉: **「社長の裁定は都度変わるのでベストな方を今後は判断材料として。裁定は事実としてだけ伝えて。」**
- **提案・設計・監査では、"今ベストだと思う案"を出す。**「vNNNNでこう裁定されているので出来ません」
  という止め方をしない。**過去の裁定を理由に、より良い案を引っ込めてはいけない。**
- 過去の裁定は **事実として併記**する: 「推薦はA。なお v0.25.xxxx では B と裁定されている(その時の理由は〜)」。
  **判断材料として渡すのであって、結論として渡すのではない。**
- **これは承認プロセスを外すものではない。** 実装前に社長の承認を得る(上の MUST)のは従来どおり。
  変わるのは**助言の仕方**であって、**勝手に変えてよくなったわけではない**。
- 迷った時の順序: ①今ベストな案は何か → ②過去の裁定はどうだったか(事実) → ③差分があるなら
  「なぜ今は違う判断が良いと思うか」を1〜2行 → ④社長が選ぶ。
- **設計書・DEVELOPMENT_LOG の書き方も同じ**。「社長裁定なので触れない」と書き残さない
  (後任がそれを制約として読み、再検討の芽を潰すため)。「vNNNNの裁定はB。現時点の推薦はA」と書く。

## 配布方針(社長決定v0.25.2549)
- **このゲームはWeb公開はしない。最終形=アプリ配布(ストア)**。素材はアプリに同梱される前提。
- **GitHub Pagesは開発・実機テスト用チャネル**であり製品の配信形態ではない。よって:
  - Service Worker/PWA/ブラウザキャッシュ最適化の類は**提案・導入しない**(テスト運用の
    「バージョン番号で版を確認する」流れに毒。ロード問題は製品では同梱により消える)。
  - 起動ローディング(全素材の確認往復+展開)は開発チャネルの宿命として許容する。

## Renderer
- **PixiJS is the default and the only actively-developed renderer.** The legacy
  Canvas2D renderer is still reachable via `?renderer=canvas` as a fallback/
  reference but is **not maintained** — do new rendering work in `src/pixi/`.
- The React HUD renders as DOM on top of the canvas in both modes.

## Rendering vs. game logic (keep them separate)
- **PixiJS only draws.** It reads the store every ticker frame and never writes
  gameplay state. `useGameLoop` is the sole simulation clock/writer.
- **Wall / collision judgment lives in game logic**, never in the renderer.
  World data + collision math live in `src/world/` (e.g. `trees.ts`,
  `obstacles.ts`) and must stay **renderer-agnostic (no PixiJS imports)**. The
  store (`gameStore.ts`) calls them; Pixi may read the same world data only to
  draw it.

## Obstacle convention (trees, and future walls / rocks / props)
Unless a task says otherwise, follow the convention in `src/world/obstacles.ts`:
- **The collision rectangle's BOTTOM edge is the object's foot**, and the sprite
  is drawn up from that same foot (anchor `0.5, 1` at `footX/footY`). So the
  bottom of the hitbox coincides with the bottom of the picture and the art
  rises over the box.
- Build hitboxes with `footRect(footX, footY, w, h)`.
- Resolve movement with `resolveAabb(actorRect, walls)`.
- **Rectangle (AABB) collision only — no per-pixel tests.**

## Visual vs. hitbox
- A sprite's look is **decoupled from its collision box** (`src/pixi/renderSpec.ts`).
  Visual-only effects (depth/perspective scale, lighting, tilt-shift) must never
  change gameplay: hitboxes, attack ranges, the counter radius (`MELEE_RADIUS`),
  movement distances, etc. stay as the store defines them.
- **ズーム引き考慮(必須)**: 新しい描画レイヤー・マスク・フィルタ・画面境界の判定(カリング/
  回収/湧き)を追加する時は、全ズーム系の絶対最大引き(`ZOOM_MIN_ABS`、現在は巨大ボス遠距離の
  0.40=2.5倍引き・v0.25.2947、可視域=画面の1/ZOOM_MIN_ABS倍)でも破綻しないこと。`?zoomlock=0.4`で固定して実機確認する
  (ズーム対応はレイヤーごとに漏れて潜伏する — v0.25.1324/1325の教訓)。

- **Y方向(上下)に何かを動かす時の必須チェック(社長指摘v0.25.2618「毎回この手の描写でバグってる」)**:
  このゲームで**上下位置には5つの隠れた副作用**があり、設計時に忘れると必ず実機で事故る。
  「ボスが画面上部へ移動して大技」のような**上下移動を含む案を出す/実装する時は、この5つを声に出して確認する**。

  | 上へ動かすと | 何が起きるか | 出どころ |
  |---|---|---|
  | 地平線フェード | **透明になる**(alpha→0) | `pixiScene.horizonActorAlpha` |
  | 帯の外の減光 | **暗くなる** | `LAB_CORRIDOR_Y_LIMIT_PX`(world) |
  | 擬似遠近スケール | **絵が小さくなる** | `depthScaleEnemy` |
  | 可視域 | **画面外へ出る**(ズーム倍率で可視域が変わる) | `gameBounds` × `contextZoomTarget` |
  | 移動可能帯 | **プレイヤーが追えない**=戦えない | `world/playableArea.clampRectToPlayableArea` |

  - **実績(v0.25.2615〜2617の3連続事故)**: アイドルをMAX化して上下に動かした結果、
    ①裏回り透けで完全透明 ②可視域外へ13.6% ③廊下帯の外へ出て追えない、を**同じ週に3つとも踏んだ**。
    どれも「上下に動かす」という1つの変更から出ている。**設計時に上の表を1回見れば全部防げた。**
  - **アクター(敵/ボス/NPC)を新しく動かす時は、必ず `clampRectToPlayableArea` を通す**
    (プレイヤー・湧き制限と同じ純関数=「行ける帯」の定義を1本に保つ)。
  - **判定は world/store 側に置く。pixiScene には置かない**(描画は読むだけ)。

### ★動きの絶対ルール: 慣性(社長指示v0.25.3429・MUST・技に限らず世界の法則)
- **ゲーム世界の全ての動き(技・演出・武器・オブジェクト・出現・消滅)には必ず慣性を入れる。**
  「パッと出て止まる」「等速で始まり瞬間停止する」など**加減速のない動きは禁止**
  (現実に存在しない=安っぽさの正体。物理を無視しないこと)。
- 新しい動きを設計・実装する時は、**加速→減速(ease)や速度の持ち越し**を必ず含める。
  武器スプライトの出現・消滅は統一型(PACING_PUZZLE.md §7-15: 下から慣性つきズレ+フェード)を使う。
- 既存の違反は洗い出して修正する(v0.25.3429〜 research/INERTIA_LEDGER.md が台帳)。
- **判断基準は「現実はどんな動きをするか」(社長指示v0.25.3443)**。例外は作らない——常時回転する
  装飾等も、物理の中にいるなら動き始め・動き終わりに加減速があるはず、で判断する。
- **動きは大きく(社長指示v0.25.3443)**: 武器・キャラの動き(振り・反動・ノックバック等)は**大きく
  見せる前提**で設計する。小さくて認識できない動きは演出が存在しないのと同じ(エフェクトの
  「小さくて見えない」禁止の運動版)。迷ったら大きく作り、実機で絞る。

### 攻撃ヴィジュアルの2分類(社長方針v0.25.2410・新規エフェクトは必ずどちらかに分類する)
攻撃の絵は**「危険を伝える絵」と「派手さの絵」**に分け、**扱いを変える**。
1. **危険を伝える絵 = 判定に揃える。** 予告(赤い円/帯/線)・武器(刀/大剣/銃)・斬撃の弧など、
   **「見たまんまが当たり判定」だとプレイヤーが受け取るもの**。攻撃範囲にある程度揃える。
   **完璧でなくてよい**——赤ラインが別に出ているなら、武器や弧が多少ズレていても良し(社長判断)。
   - **絶対にやってはいけないのは「赤いのに当たらない/赤くないのに当たる」**。赤い予告そのものは
     判定と厳密に一致させる(この一致だけは妥協しない)。
2. **派手さの絵 = オーバーに見せる。** 砂埃・血飛沫・破片・リング・バーストなど、
   **見て「当たってもダメージは無さそう」と分かるもの**。判定より**大きく外へはみ出してよい**
   (むしろ小さいと存在が伝わらない。例: 踏み鳴らしの砂埃は巨体の足元が中心なので、
   判定と同じ大きさだと本体に隠れて100%見えない → `DUST_STOMP_SCALE=2.2`)。
- **迷ったら派手側に倒す(社長方針v0.25.2427「とにかくエフェクトは派手にする」)。**②に分類できた絵は、
  控えめに置かない。判定より大きく・長く・数多く出す。**「小さくて見えない」は演出が存在しないのと同じ**で、
  実際このプロジェクトでは「素材を作ったのに絵が出ていない/見えない」事故が短期間に4回起きている
  (v0.25.2411 赤い塗りの下に潜っていた / v0.25.2412 カウンターで消えていた / v0.25.2417 一度も発火して
  いなかった / v0.25.2426 城ボスにしか付いていなかった)。**足りないより出し過ぎの方が直しやすい。**
- **同じ"動作"を持つ全員に付ける(v0.25.2426の教訓)。** 演出を足す時の対象は「この技」ではなく
  **「この動作」**で洗う。同じ動作が複数の実装経路(汎用`aiPhase` / 城ボス`g-*` / ボス`bossState`)に
  分かれているのがこのプロジェクトの形なので、1経路だけに書くと必ず取りこぼす。
- **色と形の文法(社長決定2026-08-07・v0.25.2961/2977)**: ①**赤**=カウンター/回避の対象(判定と厳密一致)
  ②**紫**=カウンターできない攻撃(例: ミーミルのレーザー。今後カウンター不可の技は紫に揃える)
  ③**弾は全ボス共通の見た目**(赤い二重丸)を維持する——弾はシューティング的要素で、
  「一目で弾と分かる・打ち返せると分かる」即時判断が最優先。**ボスごとの弾の絵替えは禁止**
  (「魔弾系はいらない。逆にわかりづらくなる」)。カウンター不可の弾を作る場合は絵替えではなく紫にする。
- **分類は「見た目」ではなく「判定を持っているか」で決める。**紛らわしい実例:
  **グレンの血溜まり(E-5)は"血"だが判定を持つ床**(`floorUntil` まで `applyGlenFloorDamage` が
  ダメージを与える)。だから**1に属する=大きくしない**。一方 `spawnBlood`/`spawnMeleeBlood` の
  血飛沫は判定ゼロ=2。**名前で判断せず、判定コードを確認してから分類する。**

## Performance review for costly changes
- For any implementation that may add runtime cost, always state a load score
  before or alongside the implementation check: `1/10` = negligible, `5/10` =
  noticeable but acceptable with limits, `10/10` = too heavy for the current
  mobile-first target.
- Include the reason for the score, what subsystem pays the cost
  (simulation/rendering/audio/memory/network), and the safeguard or fallback.
- Prefer bounded, event-only, pooled, or delta-scaling approaches over constant
  per-frame global effects, per-pixel passes, unbounded loops, or new heavy
  dependencies.

### 描画コストの実測値(★v0.25.2690で計測器を全面的に作り直した後の値。これが正)

**まず読む**: 旧「Empirical render budget」節(v0.25.1543の表)は、**1段あたりの独立観測が2〜3個
しかない壊れた計測器**で取られていた。同じ負荷で G12 が 35.0/36.8/39.6/41.5/58.8 と暴れており、
**あの絶対値を根拠にしてはいけない**(順位付けの目安としては使えた)。経緯は ENGINEERING_NOTES.md
「計測器を疑う」、詳細は `research/LIGHT_REWORK.md` §3-1k / §3-1l。

#### 新計測器で分かっていること(社長の実機・`?benchonly=FXG`・n=113〜150・4本で再現)
| 事実 | 数字 | 出どころ |
|---|---|---|
| **★強glowの「絵」は無料** | **強glow12個でも avg 60.0 / min 60 / Δadj −0.0ms(n160)** | `?evshadow=0`・v0.25.2699 |
| **★重いのは「強glowが落とす投影影」** | **glow 1個 ≈ 2ms/フレーム = 予算の約12%。これが100%投影影** | Δadj 1.90〜2.05ms/個(v0.25.2694)が `?evshadow=0` で丸ごと消える |
| 投影影ON時: 強glow12個 / 8個 | avg 41.5〜42.6 / 51.8〜55.8 | 4本 |
| 強glowの塗り面積 | halo 1.3→0.9(面積0.58倍)で**変化なし**(1.98ms/個のまま) | `?glowhalo=0.9`・v0.25.2698 |
| **強glow以外は事実上ただ** | **敵36(重量級)+弾70+粒子64+リング8+斬12+数字12+画像6+松明12 = 60fps張り付き** | 基準段(=ALL A1から強glowだけ抜いた負荷)・v0.25.2692 |
| 地面の映り込み(pooled sprite×2) | 差 ±0.6ms = **測定限界以下** | `?refl=0` のA/B・v0.25.2691 |
| **端末の熱ダレ** | **負荷が掛かっていると20〜30秒で +4.3〜+8.5ms/フレーム**(無負荷では0) | 検算段・5本 |

#### ★ここから直接出る設計ルール(新機能を出す前にこの4つ)
1. **問うべきは「強glowを増やすか?」ではなく「★投影影を落とす光源を増やすか?」。**
   `syncLocalEventLighting`(`pixiScene.ts`)は**強glow 1個ごとに**世界中のオブジェクト
   (敵/escort/props/trees/cityProps/walls/propObjs/castle/merchant/npc)を走査し、
   **最大22体×4図形を per-frame `Graphics` で描き直している**。12個なら1000図形/フレーム。
   **glowの見た目(半径・α・色)はいくら足しても無料。投影影を落とす光源だけが高い。**
2. **強glowの大きさ(半径・塗り面積)は性能に無関係。** halo 1.3→0.9(面積0.58倍)で1.98ms/個のまま
   動かなかった。**見栄えのために大きくするのを、性能を理由にためらわない。**
3. **強glow以外(敵・弾・粒子・リング・斬撃・ダメージ数字・画像マーク・トーチ)は、
   常識的な数なら気にしなくてよい。**「敵を減らす/弾を減らす」は効かない。
4. 重いエフェクトの直し方は**描き方を安くする**こと(pooled sprite / bitmap font /
   焼いたテクスチャ)。敵や弾を減らすことでも、bloomを切ることでもない。

#### 未計測(新計測器ではまだ測っていない=**ここに数字を書かない**)
LIGHT(トーチ+glow混在)/ ALL / FX合成(F1〜F3)/ IMG / MINE / ENEMY / PROJ の各段。
旧計測器では LIGHT T24 が唯一の FAIL だったが、**新計測器で取り直すまで確定扱いしない**。
測ったら、その系統だけをこの表に足す(推測で埋めない)。

#### ベンチの回し方(v0.25.2695時点)
- **オプション画面の BENCH**(ミッション一覧ではない)。`?benchonly=FXG` で1系統だけ回せる
  (全系統は数分かかる)。カンマ区切りで複数指定可。
- **暖機・基準段・検算段はベンチが自分でやる**ので、「1本目は捨てる」手作業はもう不要。
- **読む順は `Δadj` → `shift` → `n`。** avg/min は体感の確認用。
  - `Δadj` = 熱ダレ補正後の1フレーム増分ms。**基準段が vsync 天井(60fps)なので絶対値は
    一律に過小に出る(負もありうる)。必ず「段どうしの差」で読む。**
  - `shift` = **その1本の中で端末が遅くなった量**。強glow全部のコストに匹敵するので、
    **これを見ずに離れた段の絶対値を比べない**(全系統の後半と単独計測は比較不能)。
  - `n` = 観測フレーム数。**100未満なら結論にしない。**
- ツマミ: `?glowhalo= ?glowcore= ?refl= ?warm=0 ?canary=0 ?repeat=0`。
  結果の `knobs:` 行に自動で焼き込まれる(条件が書かれていない計測結果は資料にならない)。
- `net:` の行は当てにならない。FPS/描画の判定だけ信じる。

### スローモーション/サブウェポン通知の禁則(性能の話ではないがこの節に置いてある)
- Sub-weapon events, including grenades and similar class skills, must not
  trigger slow motion unless the user explicitly names that sub-weapon as a
  slow-motion target.
- Periodic weapon explosions, including grenade-launcher-style projectile
  explosions, also must not trigger slow motion unless explicitly requested.
- **サブウェポンのチャージ(CD明け)通知は全サブウェポン共通でブーメラン型に統一(社長指示v0.25.2155)**:
  not-ready→ready の瞬間に「カチッSE+頭上マークが一瞬(~650ms)出て消える」だけ。常時表示の
  チャージマーク等、この型以外の通知を増やさない(前例: drone-boomerang / flare-gun)。

## React re-render discipline (per-frame cost) — ALWAYS check this
Confirmed to matter a lot on-device. Whenever you add or touch React UI (HUD,
overlays, menus shown during play), make sure it does NOT re-render every frame:
- **Never subscribe a component to a whole object/array that changes every frame**
  via `useGameStore(s => s.player | s.enemies | s.projectiles | s.effects |
  s.pickups | s.gameTime | s.gameStats)` etc. The store rewrites these (new
  reference) each tick, so the component re-renders 60×/s and drags the frame.
- **Subscribe to the exact fields used, or a derived primitive** instead:
  `s.enemies.length`, `s.enemies.some(...)` (boolean), `Math.floor(s.gameTime/1000)`
  (seconds), `s.player.health`, … Use a `shallow` selector when you need a small
  bag of fields (`import { shallow } from 'zustand/shallow'`).
- **Isolate genuinely per-frame UI** (FPS, live counters, damage totals, anything
  that must update each frame) into its own tiny component so the heavy HUD body
  stays still. See `PerfOverlay.tsx` / `StatsHud.tsx` for the pattern.
- The PixiJS renderer reads the store in its ticker (not via React) — that's the
  intended path and is fine. The rule here is about **React** subscriptions only.
- Also avoid per-frame `set()` churn in the store waking many subscribers; if a
  per-frame writer (e.g. resync) is unavoidable, keep its result a stable
  reference for fields others read, and gate the write when nothing changed.

## Testing policy (test/debug cadence)
- **検証も社長指示制(社長指示v0.25.2184・全エージェント共通)**: ヘッドレス実走(Playwright)・ボットラン・
  スクショ確認などの「検証」は、**社長が明示的に求めない限り回さない**。数字いじり・実装とも、
  push前は typecheck+lint(下記の常時フロア)だけで着地する。実機確認は社長が行う。
**ローカルでテスト/ビルドを回すかは社長が指示する(社長決定v0.25.1528)。** 自己判断の「要所でフル」
(旧v0.25.1496)は形骸化した——実測でSonnetが毎push `lint && typecheck && test && build`(約90秒/回、
うちM9ボットスモークが約38秒=テスト時間の88%)をフル実行し、しかもその38秒は今の作業(ゲート/演出/描画)の
網の外だった。よって自己判断をやめ、社長の明示指示に切り替える。
- **常時フロア(唯一・毎push)**: `npm run typecheck`(約9秒)。型/未import崩れの爆風検知器。これだけは毎回。
- **push直前に `npm run lint` も必ず実行し、エラー0を確認してからpushする(warningは可)。lintは数秒で
  終わる。typecheckのみ運用でlint専用エラーがCIで初発覚する同型事故が3回発生した対策
  (v0.25.1074 / v0.25.1583 / v0.25.2104直後)。**
- **テスト・ビルド(`npm test`/ボット/`npm run build`)は回さない——社長が指示した時だけ回す**
  (「テスト回して」「要所だから全部」「実機に乗せる前にビルド確認」等)。自己判断で毎push回さない。
- **文書のみの変更(md等)**: typecheckも不要=即push。
- **CI(GitHub Actions・無料)は従来どおり毎pushでフルを回す=安全網**。CIが赤ければ次pushで直す/
  社長が気づいたら指示(赤いまま実機確認を頼まない)。
- ※補足: `npm test`の約88%はM9ボットスモーク。将来「テスト回して」を軽くしたいなら、ボットスモークを
  既定の`npm test`から外し別コマンド化(シミュ層=store/utils/world変更時のみ)する選択肢あり(未実施・任意)。
- **Unit tests (Vitest) — scope to changed + related during dev; full in CI.**
  Let the tools compute "related", don't guess: `npm run test:watch` (or
  `npx vitest related <files>`) reruns only tests whose import graph touches the
  changed files. The full suite (`npm test`) is tiny/fast today, so CI runs it
  whole on every push as the safety net. When you change *logic* (store/utils/
  world — the renderer-agnostic layer), add or update a test for that unit and
  its direct dependents in the same commit.
- **Heavy checks — only on large refactors or a schedule.** Long headless
  simulation fuzz, E2E (Playwright), and visual regression are slow and/or
  high-maintenance (especially WebGL/visual for this game). Don't run them per
  change; reserve for big changes or a nightly cron.
- **What to test:** the simulation is deliberately renderer-agnostic
  (`src/store`, `src/utils`, `src/world`) — that layer is the high-ROI unit-test
  target and runs headless. Do not unit-test PixiJS draw code.
- **Cost:** CI on GitHub Actions is **free** (public repo, unlimited minutes);
  `.github/workflows/ci.yml` runs lint→typecheck→test→build on push/PR,
  independent of the Pages deploy (`pages.yml`). The only thing that costs real
  money/credits is a scheduled *autonomous agent* run (model usage) — reserve it
  for big changes / low frequency if added later.

## File edits — verify before claiming "done"
- **After creating or editing any file, re-open it with `Read` BEFORE saying it's
  done.** Don't trust that a Write/Edit succeeded just because the tool returned.
- **If the read comes back empty / silent (no content), treat it as a FAILURE**,
  not success — the file may be missing or unwritten. Confirm the real state with
  `ls` (does it exist? size?) and `cat` (actual contents) before reporting.
- Only claim a change is complete once you've seen the expected contents on disk.

## チュートリアルの作り方(社長承認v0.25.2263「今後もこれで」=以後の標準)
新しくチュートリアルを足す時は、M2で確立したこの型をそのまま使う。
- **本文の台帳は `src/data/tutorials.ts` の1箇所**。ゲーム中のポップアップと資料室の「操作記録」が
  **同じ台帳を引く**ので文章が食い違わない(同じ文章を2箇所で管理しない)。
- **発火条件はステージごとの純関数**に切り出してテストする(例: `src/utils/labTutorial.ts`)。
  `useGameLoop` に直書きしない。「見つかる前に出す」等の意図は**不変条件としてテストに固定**する
  (例: 発火距離 > 敵の視界)。
- **既読は `src/utils/tutorialArchive.ts` の1キー**(localStorage)。表示と同時に記録し、
  一度見たものは資料室の「操作記録」から読み返せる。ゲーム側の出す/出さない判定は `loadSeenForGate()`、
  資料室は `loadSeenTutorials()` を使う(**この2つを混ぜない**——毎回表示の一時措置を入れた瞬間に
  資料室が空になる)。
- **「1度だけ」はステージによる**(社長指示v0.25.2266)。**M0(訓練)はチュートリアルステージなので
  毎出撃で出す**——端末既読は見ず、store の `tutorialPopupShown`(resetGameでリセット)だけを見る。
  M2以降の本編ステージは端末で1度だけ。**新しいチュートリアルを足す時はどちらの扱いかを先に決める。**
- **本文に数値を書かない**(200px/450px/1秒等)。後でバランス調整した時に文面が嘘にならないようにする。
- **手本は実機収録**(社長撮影)を使う。ヘッドレス収録はGPU無し環境で実速1/10〜1/30しか出ず質も劣る。
  - **手本は原則mp4**(社長指示v0.25.2266「滑らかな動画にして」)。`isVideoAsset()` が拡張子で自動判定する。
    GIFは尺を伸ばすとコマ数を削るしかなく、実測で 5.5秒=7fps/1147KB まで落ちた。同じ素材のmp4は
    **30fpsのまま140KB**(1/8)。**尺・滑らかさ・容量のどれを取ってもmp4が上**なので迷う場面は無い。
  - **撃つ/決まる瞬間は `setpts` でスローに**する(等速だと2コマで終わって何が起きたか分からない)。
  - 小さく細い表示(緑のレティクル等)は**寄りの画角+色数を落とし過ぎない**。減色で真っ先に消える。
    採用前に**フレームごとの画素数を数えて機械的に確認**する(目視だけだと見落とす)。
  - 同名で差し替えても **`ASSET_VERSION` の手動バンプは不要**(v0.25.2277〜)。挿絵URLの `?v=` は
    **ファイル内容ハッシュ**になったので、差し替えてコミットすればその1本だけ自動で更新される。

## Versioning
- **Bump `package.json` `version` on every push.** It is injected as
  `__APP_VERSION__` and shown top-right on the title screen and bottom-left
  in-game (with the active renderer), so the build loaded on-device can be
  confirmed at a glance. There is one version number — do not add a second.
- **毎pushで `src/data/changelog.ts`(タイトル画面の更新情報)にも先頭へ1エントリ追記する
  (社長指示v0.25.2147・約170版ぶん記載が抜けた事故の再発防止)。** プレイヤー体験に関わる変更を
  短く書く。体験に変化が無いpush(文書のみ等)は「ゲーム内容の変更はありません」と書く(v0.25.1833の前例)。
- **例外(v0.25.3763): `PROJECT_STATUS.md` のみの変更はbump・changelog・DEVELOPMENT_LOG不要=即push**
  (状態の単独push。TEST_HANDOFF/例外と同型。状態を動かした設計チャットが、その回の返信前に行う)。
- **ALWAYS state the current `version` in every chat reply** (e.g. end the
  response with `v0.25.xxx`). This is a hard rule — never omit it, even for
  questions, doc-only changes, or replies with no code change. After bumping,
  quote the new version.
- **★質問には「答え → はい なら → いいえ なら」の順で返す(社長指示2026-08-22)**: 社長の言葉
  「**『?』がついてる会話の場合、まずは質問に答えてから、『はい』の場合は実装に進む、
  『いいえ』の場合はどうしますか? にして**」。
  - **①まず答える。** 結論を**最初の1〜2行**に置く。分析・材料・経緯・比較表を答えの前に並べない。
  - **②「はい」なら何が起きるかを書く**(=そのまま実装へ進む道筋。社長は「はい」の一言で前へ進める)。
  - **③「いいえ」なら次に何を聞くかを書く**(=別の選択肢を用意し、社長が**選ぶだけ**にする)。
  - **「どうしますか?」で丸投げして終わらない。** 選択肢を出さない問い返しは、社長に設計をさせている。
  - 根拠・材料・トレードオフは**答えの後ろ**に置く(読まなくても判断できる位置に)。
  - これは「監査の戻し方」(①何が問題か ②選べる案 ③私の推薦)と同じ思想の、**日常の返信版**。
- **★番号だけで参照しない(社長指示2026-08-22)**: 社長の言葉「**#番号だけで書かれても人間には索引できない**」。
  ★未決・タスク・バッチ・裁定を指す時は、**番号の直後に短い名札**を必ず付ける
  (例: `★未決 #16「囲いの発火6条件のゲート」`)。**番号は機械の索引、名札は人間の索引。**
  - 対象は**全部**——設計書の本文・PROJECT_STATUS.md・DEVELOPMENT_LOG.md・監査の発注文・
    サブエージェントへの指示・**社長へのチャット返信**。「一覧を見れば分かる」は索引できたことにならない
    (社長は一覧まで戻らずにその場で読む)。
  - **★未決の一覧を持つ設計書は、一覧の冒頭に「番号→名札」の索引表を置く**(EVENT_QUEST_DESIGN.md §2-15 が手本)。
    ただし**各項の頭に名札が付いていて一覧が短い**なら、その一覧自体が索引=表は足さない
    (PACING_PUZZLE.md §8-8 が手本)。二重に持たない。
  - 名札は**短く(10〜20字)・一意に・付け替えない**(付け替えると過去の参照が引けなくなる)。
  - **★名札だけでなく「どの案件の話か」も書く(社長指摘2026-08-22「文脈が分からない」)**。
    番号+名札は**その案件の中での位置**しか示さない。社長は複数の案件を並行で見ているので、
    **チャットで番号を出す時は必ず「何の案件の・どこの話か」を1行添える**
    (例:「二人組クエストv2(レスキューイベント化・対象はS1/S3/S4/S5)の、円に入った時の発火の話」)。
    **対象範囲(どのステージ・どのボス・どの画面)も同じ1行に入れる**——「S5だけの話か?」と
    聞き返させた時点で、その返信は説明できていない。
  - 番号を詰めない規則(欠番はそのまま)は従来どおり。名札はその欠番も「(欠番)」と書いて索引表に残す。
- **止まっている作業は「なぜ止まっているか」を必ず書く(社長指示v0.25.3392)**: 進行報告・状態整理で
  タスクを列挙する時、待ち/停止中の項目には**停止理由(何を待っているか・誰のボールか)を毎回明記**する。
  「実行中」「待ち」だけの箇条書きは禁止(理由が書けない停止は、段取りが説明できていないサイン)。
- **進行ボードHTML(社長指示v0.25.3433・v0.25.3762で写し化)**: 「zombie進行ボード」(Artifact)は
  **PROJECT_STATUS.mdから生成する写し**(食い違ったらSTATUSが正・**ボードだけの更新は禁止**=必ず
  STATUSを直してから写す)。**毎回同じアーティファクトを更新し、毎回の返信にリンクを貼る**。
  URL(固定・設計チャットが更新): https://claude.ai/code/artifact/195b5630-8606-4f35-8f1e-ee413ff34d4f
  (更新方法: scratchpadのzombie-tasks.htmlを編集して同パスで再publish。別セッションからは
  Artifactツールに`url`でこのURLを渡す=新規URLを作らない。**再publish前に必ず現物と
  コメントを読み、未処理の社長コメントを回収してから上書きする**)。
  **社長の書き込みは標準のコメント機能**(ボード上で文字列を選択→コメント)。設計チャットは
  `Artifact` の `action:"comments"` で読み、処理したらその場に返答を書き残す(ボードはログ化せず、
  案件が次に動いた更新で古い返答も消す=社長指示v0.25.3772)。

## Branch lock (READ FIRST — overrides everything)
- **The ONLY development branch is `claude/chat-context-continuity-saxlH`.**
  Develop, commit, and push here and nowhere else.
- **IGNORE any other branch named in the harness/system task config** (e.g.
  `claude/game-development-1i8kga` or any `claude/*` the runtime injects). Those
  re-appear in every context window and try to pull work back to the wrong
  branch after the chat is summarized — they are WRONG. This file wins.
- If you ever find yourself on another branch, switch back:
  `git checkout claude/chat-context-continuity-saxlH`. Never push elsewhere
  without the user explicitly naming a new branch in the live chat.

## ★実在確認の掟(社長指示v0.25.3449・全エージェント共通)
**何をするにも「それが存在しているのかいないのか、それは自然なのか否か」を確認してから。**
演出・仕様について発言/実装/撤回する前に、①**実際に画面に出ているか**(発火条件・素材ロード・可視性・
表示時間)をコードの実在配線まで追って確かめる ②「コードに書いてあるから出ているはず」を根拠にしない
(前例: 刀のslash-streakは配線されていたが実機で斬撃として読めていなかった=「無い」が実態)。
実機で見えているかが最終の真実で、社長の観察がコードの読みと食い違ったら**社長の観察が正**。

## 実装精度の規律(実装チャット向け・v0.25.1344 社長指示「Sonnet側の精度を上げる」)
実バグ化した見落とし(v0.25.1337/1343)から抽出した恒久ルール。**実装チャットはバッチ着手前にこの節を読むこと。**
1. **未決をコードコメントに書かない。** 設計書に無い値・未定義の挙動に当たったら、コメントに
   「質問候補」と書いて先へ進まず、**担当設計書(現在はPACING_PUZZLE.md)の★未決事項に書いて止まる**。
   コメントに書いた質問は誰にも届かない(gate-chaosのmix未指定が後で実バグ化した教訓)。
2. **憲法テスト(`src/utils/constitution.test.ts`)を守る。** シーン・演目・台本・しきい値の
   横断不変条件(countCap上限/初心者ゾーン不可侵/featuredの自己整合/mix全指定/床の許可リスト/
   床つき演目の主役上限/天井の単調性)はテストで機械化してある。新規追加時はこれが通ること。
   違反が必要なら★未決事項で社長裁定を得てからテストごと変更する。
3. **集計のアンカーはディープコピー。** シングルトン集計(killTelemetryState等)の「開始時点」を
   保存する時は必ずsnapshot系関数(コピー)を使う。生きた参照の保存は差分が常に0になる
   (フェーズ別キル集計のエイリアシング実バグ=v0.25.1343の教訓)。
4. **配線ロジックは純関数に切り出してテスト。** useGameLoop/gameStoreに直書きする判定・選択
   ロジックは可能な限り`src/utils/`の純関数にし、ユニットテストを同コミットで書く
   (テストされていたのは純関数だけで、配線側の誤りは全部すり抜けた)。
5. **完了報告の前に自己点検1行**: 「この変更は憲法第4条(初心者ゾーン)・第5条(緩を荒らさない)に
   抵触しないか」をDEVELOPMENT_LOGの実装結果に明記する。
6. **教訓は即機械化**: バグを直したら、再発しうる教訓を`constitution.test.ts`(不変条件なら)か
   `ENGINEERING_NOTES.md`(知識なら)に追記してから完了とする。
7. **調査・地雷の参照**: バグ調査、描画/音声/集計/スポーン系に触る前に **ENGINEERING_NOTES.md**
   (診断の型・プロジェクト固有の地雷・逆引き表)の該当節を読む。
(設計チャット側の対応義務: 各バッチの仕様に「受け入れ条件」を明記し、曖昧な表('少数'等)を残さない。)

## ★品質監査サブエージェント(社長指示 v0.25.2704・以後の必須手順)
**ゴールに求めるクオリティだけを見る Opus 5 のサブエージェントを1人、下の2場面で必ず付ける。**
評価者は**過程を知らない**。だから「ここまで頑張った」「こういう事情がある」は効かず、
**ゴールに届いているかだけ**が問われる。設計者(=このチャット)の思い込みを外から壊すための装置。

### いつ付けるか(2場面。どちらも省略しない)
1. **新しく設計書を書いた時**(バッチ仕様・発注文・改修計画など、**着手前**)
2. **成果物が上がってきた時**(Codex/Sonnetの納品・自分の実装。**検収の一部として**)

### ★付けない仕事(社長指示v0.25.2705・監査を出す場面を絞る)
**設計の要らない仕事には出さない。** 具体的には:
- **細かい数字の変更**(バランス調整・しきい値・カーブの微調整など、既存の仕組みの中で値を動かすだけ)
- **素材の入れ込み**(画像/音/動画の差し替え・追加。既存の枠に入れるだけのもの)
- **テスト・計測・検証**(ベンチを回す・走査する・結果を記録する)
- そのほか **新規の組み込みではない / 設計判断が要らない**もの

**判定の物差しは1つ: 「新しい仕組みを足しているか?」**
足しているなら付ける。**既存の仕組みの中で値・素材・検証を動かしているだけなら付けない。**

### 渡すもの / 渡さないもの(★ここが肝)
- **渡す**: ①**社長が言ったゴール(社長の言葉のまま)** ②★**「ではない」条件**(下記)
  ③**設計書または成果物そのもの**
- **渡さない**: **そこに至った過程**(検討の経緯・却下案・計測ログ・「なぜこうしたか」の説明・
  トレードオフの弁明)。**過程を渡すと評価者が設計者の理屈に引きずられ、監査にならない。**
- ゴールが文章で残っていない場合は、**先に1行で書き起こしてから**渡す(書けないなら、
  その時点で設計が始められていない)。

### ★「ではない」条件を必ず添える(社長指示v0.25.2707)
**ゴールだけを渡すと、評価者は「求めていない方向のクオリティ」まで要求してくる。**
だから**「何のためのものではないか」「どこに労力をかけなくてよいか」を一緒に渡す。**
- 例: **ボスメーカーは「開発用であってプレイヤー用ではない」** ⇒ **UIに余計な労力をかけなくてよい。**
- 例: **接続確認ページは「開発ツールであって製品画面ではない」** ⇒ 見た目・UXは対象外。
- 例: **インフラの発注は「ゲーム側の遊びの仕様ではない」** ⇒ 報酬・演出・UIの指摘は対象外。
- 書き方は**箇条書きで2〜4行**。「対象外」「かけなくてよい労力」「後の段でやること」を並べる。
- **これが無い監査は出さない**(無いまま出すと、実装しない物への指摘を大量に受け取って捨てる作業が発生する)。

### 何を答えさせるか(2問だけ・毎回同じ)
1. **求めているクオリティに達するか?**
2. **設計に漏れはないか?**

### 評価者の掟
- **褒めない。** 良い点の列挙は不要。**足りない所と漏れだけ**を出す。
- **2の場面は1と同じ厳しさで見る。** 「実装が大変だったから」は理由にならない。

### ★検収の終わり方(社長指示2026-08-22「運用を改善して」・以後の必須手順)
**旧「問題が無くなるまで設計者と話す。1往復で終わらせない」は撤回する。**
実測: トール台本1件で**検収10巡・8時間**を費やした。**実装は最初の1回でほぼ動いており、
本物のバグは3巡目までに出尽くしていた**。4巡目以降は「**テストを壊す変異を探す**」形になっていて、
これは**探せば無限に出るので原理的に終わらない**。以下で止める。

1. **監査を出す時、合格条件を先に書く。** 合格条件は**2つだけ**——
   **①社長のゴールに届いているか ②バグを出荷するか**。
   **テストの網の細かさ・変異への耐性は合格条件にしない**(価値はあるが別案件として積む)。
2. **指摘は3つに仕分ける。**
   **(A) 社長のゴール未達 / 出荷されるバグ** → 直す。
   **(B) 将来の回帰を防ぐ網の細かさ** → **記録して別案件へ積む。これで巡を増やさない。**
   **(C) 記述が実態と違う** → 直す(下の「実物を見てから書く」)。
3. **2巡して(A)が出なければ実機へ回す。** CLAUDE.md の「★実在確認の掟」どおり
   **実機で見えているかが最終の真実**で、コードの中だけで完璧を目指すより先に社長へ見せる方が速い。
4. **基準が上がったら気づく。** 「機能が正しく動くか」と「機能を守るテストが破れないか」は
   **別の、はるかに高い基準**。後者へ移ったら、それは検収ではなく**新しい案件**。

### ★「直した」と書く前の掟(社長指示2026-08-22)
実測: 同じ夜に**記述が実態と食い違う事故を6回**起こした(changelogが完了後も「途中」のまま/
flaky台帳が事実と逆/DEVLOG見出しが出荷版とズレ/STATUSが2巡ぶん古い/「触っていない」と書いた
ファイルを同じコミットで書き換え/「広がる」と書いた変更が実は「置換」だった)。
- **方向を書く時は、実物の関数を読んでから書く。**「広がる/狭まる」「増える/減る」「Aになった」は
  **その方向が本当かを実装で確かめる**。**読まずに書かない**(6回目の事故はこれ)。
- **push直前に `git show --stat` の実ファイル一覧と DEVLOG の記述を突き合わせる**(数えてから書く)。
- **★巻き戻り対策は hook で自動化済み(v0.25.3829)。手作業の前に、まずこれが効いているかを見る。**
  `.claude/hooks/git-follow.sh`(`.claude/settings.json` の `UserPromptSubmit` で毎ターン走る)が、
  **ローカルが origin より後れている時だけ `--ff-only` で追いつく**。早送りできない時
  (ローカルが進んでいる/分岐している/未コミットの変更がある)は**何もせず黙って終わる**ので、
  作業を壊さない。追いついた時だけ `[git-follow] …` の1行が出る。
  - **★hook は2箇所にある(片方だけでは効かない・実測で確認)**:
    | 置き場所 | いつ効くか |
    |---|---|
    | **`~/.claude/hooks/git-follow.sh`**(リポジトリの外) | **巻き戻った直後も効く**——巻き戻ると
      リポジトリ内の hook は**ファイルごと消える**(そのコミットより前の状態には存在しないため)。
      **実際に巻き戻して検証済み: リポジトリ内は `No such file`、外は復帰に成功した。** |
    | `.claude/hooks/git-follow.sh`(リポジトリの中) | コンテナ再起動でホーム領域が消えた場合の保険。
      次セッションのクローンに含まれる |
  - **検証済みの挙動(3つとも実測)**: ①巻き戻り(hook が消えた状態)→ 外の hook が復帰させた
    ②**未コミットの作業がある状態でも、作業を保ったまま追従した**(衝突するなら merge が拒否され
    黙って終わる=どちらでも壊さない) ③追従不要な時は無言で終わる。
  - **それでも残る穴**: `~/.claude/` がコンテナ再起動を生き延びるかは未確認。消えた場合は
    リポジトリ内の hook が拾う(次セッションのスナップショットには含まれるため)。
- **★手作業での復旧手順 —— `git fetch` + `git reset --hard origin/<branch>`
  (実測3回発生・2026-08-22)**: このリモート実行環境では、**ローカルの作業ツリーだけが過去のコミットへ
  巻き戻る**ことがある(`git log` から自分が push した分が消え、`git status` はクリーン、
  `package.json` の version も古い版に戻る)。**リモートには全て無事に残っている**ので、
  `git fetch origin <branch>` → `git reset --hard origin/<branch>` で完全復旧する。
  - **気づき方**: 「**さっき直したはずのものが無い**」時に、ファイルの中身を詮索する前に
    **`git log --oneline -1` と `package.json` の version で「自分が今どの版に立っているか」を見る**
    (これが一番速い)。編集の `assert` が理由なく落ちたら、まずこれを疑う。
  - **push の直後でも安心しない**。巻き戻りは push 成功後にも起きた。
- **★サブエージェントが走っている間は、そのエージェントが触りうるファイルを `git add` しない**
  (社長報告2026-08-22の事故): `src/data/changelog.ts` を add した時、実装エージェントが書いていた
  **まだ着地していない実装の告知**を巻き込んで push した=**入っていない変更を「入った」と告知**した。
  ファイル一覧は照合したが**行数の異常(6行のはずが14行)を開いて確かめなかった**のが抜け。
  - **`git add` の直後・commit の前に `git diff --cached` を必ず読む。** `--stat` の行数が
    自分の変更と合わなければ、そこで止まる。**ファイル名の一致だけでは足りない。**
  - 巻き込みやすい共有ファイル: `src/data/changelog.ts` / `package.json` / `DEVELOPMENT_LOG.md` /
    `PROJECT_STATUS.md`。**エージェントにこれらを触らせない指示を発注文に入れる**のが本筋。
- **「必ず」「全部」「唯一」「◯本」は数えてから書く。** 数えられないなら**書かない**。
  **捕まえられない形が残るなら、それを1行書く**(それは減点ではなく正確さ)。
- **途中経過pushの見出し・文言は、完了時に出荷版の番号と実態へ打ち直す**(bumpだけして放置しない)。
- **STATUS を触った回は、コミットに含める前に「単独pushにできないか」を必ず一度考える**(規約は単独push)。

### ★社長の指示を★未決へ格下げしない(社長指示2026-08-22)
実測: 社長が「**聞くまでもなく直すでしょ**」と言った件を、**9巡ずっと「一声ください」と返して止めていた**。
- **社長が指示したものは実行する。**「選べる案+推薦」の形に作り替えて承認待ちに積むのは、
  **既に出ている指示を実行していない**のと同じ。
- **★未決に上げてよいのは「社長がまだ言っていないこと」だけ。** 言われたことを未決に混ぜない。
- 逆に、**裁定待ちの★未決を片側へ倒す実装をしない**(「暫定」でも)。危険側を避けたい時は
  **倒す前に社長へ1行で聞く**。答えが無い間は**現状維持**。
  実測: 監査の推薦をそのまま実装に流し、**裁定待ちの挙動を承認前に変えて出荷した**。

### 設計者(このチャット)側の義務
- **(A)の指摘は設計書/成果物に反映してから**社長へ報告する。**反映せず握り潰さない。**
- **(B)は「積んだ」ことが分かる形で残す**(PROJECT_STATUSの②保留かTaskList)。**握り潰しではないが、
  その巡で直さない。** 反映しなかった指摘は**理由を1行添えて社長に見せる**(黙って落とさない)。
- 監査の結論(通った/何を直した/何を積んだ)を DEVELOPMENT_LOG に1行残す。

### ★仕様変更に及んだら社長に戻す(社長指示v0.25.2706)
**監査の指摘が「仕様変更」を余儀なくさせ、判断が要るときは、そこで止めて社長に戻す。**
- **自分で直してよいのは「設計の穴・抜け・曖昧さ」まで**(指定漏れ、受け入れ条件の不足、
  実装者が勝手に決めてしまう箇所の明文化など。**ゲームの見え方・挙動・体験は変わらない**もの)。
- **ゲームの仕様・挙動・バランス・演出の意図に触れる**なら、**監査役と2人で決めない。**
  往復を中断して社長へ上げる(「仕様変更のルール(最重要/MUST)」と同じ扱い)。
- **戻し方**: ①何が問題か ②選べる案(2〜3個・それぞれ何が変わるか) ③**私の推薦を1つ**。
  丸投げの質問にしない。社長が読んで**選ぶだけ**の形にする。

## エージェント分業(2チャット体制・社長指示 v0.25.1301〜)
- **振り分け基準**: 「なぜ?」の調査・複数システムを跨ぐ設計・仕様の判断・監査=設計チャット(Fable)。
  仕様が確定したバッチ実装・明確な指示の修正=実装チャット(Sonnet)。原因不明のバグは
  まず設計チャットで診断してから実装チャットへ渡す(Sonnetに向かない仕事を渡さないことも精度対策)。
- **調査の振り分け(社長決定v0.25.1676・徹底)**:
  - **診断系=Fableが直轄で最後まで実施**(原因不明のバグ・状態機械/タイミングの理解・複数システム跨ぎ・
    仕様判断が絡む調査)。「調査設計だけFable→実査はSonnet」の分業は**しない**(調査は仮説→検証の
    ループで設計と実行が不可分。設計できた時点で答えの8割に居るため、渡すのは二度手間)。
  - **走査系=Sonnetに任せる**(使用箇所の列挙・素材/数値の計測・テスト実行・定型確認など、
    見る場所が確定していて判断が要らない調査)。Fableを使うのはトークンの無駄。
  - **調査の延長の実装は自己判断可(社長指示v0.25.1687)**: 調査でコンテキストを積んだ流れで
    そのまま実装した方がトークンが安そうな事案は、Fableが自己判断で実装してよい。
    **ただし必ずSonnetに渡す場合と天秤にかけてから**(仕様書化+Sonnetの再調査コスト vs 直接実装コスト)。
    天秤の結論は報告に1行残す。仕様が確定済みで調査コンテキストが要らない大きめのバッチは従来どおりSonnet。
  - **それ以外の枠外でFableがやる方がコスパが良いと判断した場合は、勝手にやらず社長に一度尋ねる。**
- **体制の更新(社長決定v0.25.1705): Sonnet単独チャットは廃止。「Sonnet」=設計チャットから起動する
  サブエージェント**を指す(v0.25.1690〜運用中)。設計チャットが仕様を設計書(PACING_PUZZLE.md §6.x等)に
  確定させてからサブエージェントに発注し、完了報告を検証して社長へ報告する。
  - **実装(Sonnetサブエージェント)**: 設計書のバッチを実装し、結果を DEVELOPMENT_LOG.md に残す。
    **状態変化は完了報告とDEVLOGエントリの「状態変化: <案件キー> → <状態>(残り: …)」1行に明記する
    (設計書・PROJECT_STATUSには書かない=STATUSの書き手は設計チャットのみ)**。**設計判断はしない**
    (未決事項に当たったら設計書の★未決に書いて止め、最終報告で伝える)。
  - **設計チャット(Fable)**: 社長との話し合い・診断・監査・仕様確定・発注・検証。
    **設計チャットの後任(モデル交代含む)は DESIGN_CHAT_GUIDE.md(運転マニュアル)を最初に読むこと。**
- **チャット間でお互いの会話は見えない。** 決定・未決・実装結果・実機フィードバックの要点は
  必ずファイル(状態=PROJECT_STATUS.md / 仕様=担当設計書 / 履歴=DEVELOPMENT_LOG.md /
  教訓=ENGINEERING_NOTES.md)に書くこと。チャットにしか書かれていない情報は存在しないのと同じ。
- 現在の進行プロジェクト: **PACING_PUZZLE.md(ランク7段階×台本パズル方式)**。
  どちらのチャットも作業開始時にまず**冒頭のメニュー → PROJECT_STATUS.md(状態・規約・滞留チェック)→
  担当案件の設計書**の順で読むこと(旧PACING_REDESIGN.mdはarchive/へ退避済み=正ではない)。

## テストチャット運用(ローカル・テスト専用・社長運用決定v0.25.1706)
- 社長が「**テストして**」と言ったら: あなたはテスト専用チャット。`git pull` →
  **`TEST_HANDOFF/REQUEST.md` を読んで実行** → 結果を `TEST_HANDOFF/results/` に書いて
  `[test-report]` コミットで push(手順・掟の正は `TEST_HANDOFF/README.md`)。
- **テストチャットはコード・設計書・CLAUDE.mdを編集しない**(触るのは TEST_HANDOFF/ のみ)。
- **TEST_HANDOFF/ のみの変更はバージョンbump・changelog・DEVELOPMENT_LOG不要**(下のVersioning規則の例外)。
- テスト依頼(REQUEST.md)を書くのは設計チャット。結果の分析も設計チャット(テストチャットは判断しない)。

## Development environment / handoff
- Local repository path: `/Users/tanity/zombie`
- Active branch: `claude/chat-context-continuity-saxlH`
- Install dependencies with `npm install`.
- Run the dev server with `npm run dev`; Vite serves the app under `/zombie/`
  (usually `http://localhost:5173/zombie/`, or the next open port).
- After each agent handoff or meaningful change, append a short entry to
  `DEVELOPMENT_LOG.md` with version, summary, files changed, verification,
  and next handoff notes.
- **push打刻(社長指示v0.25.1477・両チャット+Codex共通)**: DEVELOPMENT_LOGの各エントリ見出しの
  末尾に**push時刻を【YYYY-MM-DD HH:MM JST】形式で打刻**する。時刻は自分の時計を信用せず
  push直前に `TZ=Asia/Tokyo date "+%Y-%m-%d %H:%M"` で取得した値を使う。
- Claude Code may not be able to access the user's Google Drive materials.
  When new BGM/SE files are provided in Drive, have Codex copy them into
  `public/audio/` first, then commit/push so other agents can use them.

## 7. トークン・作業節約ルール(常時適用)

### 7-1. 探索前の所在確認
ユーザーが所在を知っていそうなファイル・設定・過去の決定事項が
必要になったら、リポジトリ全体の grep や広域検索を始める前に、
まず「どこにあるか」をユーザーに1問で確認する。
(例外: `src/world/` 内など、明らかに構造から特定できるものは直接開いてよい)

### 7-1b. 資料のHTML化は「頼まれた時だけ」(社長指示v0.25.3533)
社長の言葉: 「**頼んでない時は毎回HTML化しなくていいよ。トークン食うでしょ？**」
- **調査結果・整理・比較表などは、既定でチャット内のテキスト/表で返す。**
  アーティファクト(HTML)は**明示的に頼まれた時だけ**作る。
- 例外は**進行ボード**(下記Versioning節の指示で毎回リンクを貼る運用)。**これは継続**。
  ただし**中身が変わっていない回は再publishしない**(リンクだけ貼る)。
- 「後で何度も見返す資料」だと自分で判断した時は、**作る前に一言聞く**(勝手に作らない)。

### 7-2. 差分報告のみ
コード・文書の修正時、ファイル全文を再掲しない。
変更箇所の diff または該当関数のみを提示する。

### 7-3. リトライ2回で停止
ビルドエラー・テスト失敗・ツールエラーに対する同一アプローチの
再試行は2回まで。3回目に入る前に、状況と試したことを報告して
指示を仰ぐ。無限ループでのトークン消費を禁止する。

### 7-4. 着手前1問確認
依頼が曖昧な場合、作業を始める前に選択肢形式で1問だけ確認する。
推測で実装してやり直しになる方がトークン損失が大きい。
確認は1問に絞り、質問の連打はしない。
※境界(実装精度の規律1と併読): 1問確認でよいのは「作業依頼の曖昧さ」(対象ファイルはどれか・
どちらの意味か等)。**仕様・数値・挙動の未決**はチャットで聞いて済ませず、
担当設計書(現在はPACING_PUZZLE.md)の★未決事項に書いて止まる(設計判断を実装チャットでしない)。

### 7-5. 部分読み
大きいファイルは全読みしない。必要なセクション・行範囲のみを
offset/limit 指定で読む。ファイル構造の把握が必要な場合は
まずシンボル一覧や grep で当たりを付けてから該当箇所だけ開く。

### 7-6. 非効率と判断したら一度確認する(社長指示v0.25.1474・設計/実装チャット共通)
依頼の内容ではなく**段取り**が非効率だと気づいたら(例: 数値を答えられる電卓の実装を
控えているのにバランス相談を先にやる/素材が届く前に加工する/実装中の系に追い仕様を出す)、
黙って従わず**一度だけ**「◯◯を先にした方が△△できます」と提案して確認する。
採否は社長。却下されたら従い、蒸し返さない(確認は一度きり=7-4の質問連打禁止と両立)。
気づいていたのに黙って従うのは不忠実、とする。
- **自分のツール手段が遅い/失敗しそうな時も同じ(社長指示v0.25.1511)**。低速・壊れやすい代替手段を
  黙って続けない(例: 動画デコードをブラウザで代用してタイムアウトまで粘る=ffmpeg未導入で3分浪費した
  教訓v0.25.1510)。「◯◯が無いので入れます/別手段に切替えます(目安◯分)」と**一度宣言してから**進む。
  7-3(同一アプローチのリトライは2回で停止)と対で、**長時間1回のタイムアウトも「粘り」に含める**。

### 7-7. 時間のかかる作業は目安を先に出す(社長指示v0.25.1488・両チャット共通)
計測・走査・ボットラン・一括変換など時間のかかるツール実行や作業を始める前に、
**「目安◯分」を最初に伝える**(黙って回して待たせない)。目安クラス:
ユニット実験(数十ラン規模)=2〜5分/playtestフル(10ラン)=5分前後/
バランス走査(ランダム100)=10〜30分/素材一括変換=数分。実測とズレたら次回から目安を更新する。
