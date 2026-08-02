# Project conventions (zombie)

Top-down HD-2D survival game. React + Zustand (simulation) + PixiJS (rendering).

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
  回収/湧き)を追加する時は、文脈ズーム最大引き(`CONTEXT_ZOOM_MIN`、可視域=画面の
  1/CONTEXT_ZOOM_MIN倍)でも破綻しないこと。`?zoomlock=1`で常時最大引きに固定して実機確認する
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
- **ALWAYS state the current `version` in every chat reply** (e.g. end the
  response with `v0.25.xxx`). This is a hard rule — never omit it, even for
  questions, doc-only changes, or replies with no code change. After bumping,
  quote the new version.

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

## 実装精度の規律(実装チャット向け・v0.25.1344 社長指示「Sonnet側の精度を上げる」)
実バグ化した見落とし(v0.25.1337/1343)から抽出した恒久ルール。**実装チャットはバッチ着手前にこの節を読むこと。**
1. **未決をコードコメントに書かない。** 設計書に無い値・未定義の挙動に当たったら、コメントに
   「質問候補」と書いて先へ進まず、**PACING_REDESIGN.mdの★未決事項に書いて止まる**。
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
- **渡す**: ①**社長が言ったゴール(社長の言葉のまま)** ②**設計書または成果物そのもの**
- **渡さない**: **そこに至った過程**(検討の経緯・却下案・計測ログ・「なぜこうしたか」の説明・
  トレードオフの弁明)。**過程を渡すと評価者が設計者の理屈に引きずられ、監査にならない。**
- ゴールが文章で残っていない場合は、**先に1行で書き起こしてから**渡す(書けないなら、
  その時点で設計が始められていない)。

### 何を答えさせるか(2問だけ・毎回同じ)
1. **求めているクオリティに達するか?**
2. **設計に漏れはないか?**

### 評価者の掟
- **褒めない。** 良い点の列挙は不要。**足りない所と漏れだけ**を出す。
- **問題が無くなるまで設計者と話す。** 1往復で終わらせない。設計者は指摘に対し
  **設計書を直してから**再提出する(口頭の言い訳で通さない)。
- **2の場面は1と同じ厳しさで見る。** 「実装が大変だったから」は理由にならない。

### 設計者(このチャット)側の義務
- 指摘は**設計書/成果物に反映してから**社長へ報告する。**反映せず握り潰さない。**
- **採用しなかった指摘があれば、その理由を1行添えて社長に見せる**(黙って落とさない)。
- 監査の結論(通った/何を直した)を DEVELOPMENT_LOG に1行残す。

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
  - **実装(Sonnetサブエージェント)**: 設計書のバッチを実装し、結果を DEVELOPMENT_LOG.md と設計書の
    ステータス更新でファイルに残す。**設計判断はしない**(未決事項に当たったら設計書の★未決に書いて
    止め、最終報告で伝える)。
  - **設計チャット(Fable)**: 社長との話し合い・診断・監査・仕様確定・発注・検証。
    **設計チャットの後任(モデル交代含む)は DESIGN_CHAT_GUIDE.md(運転マニュアル)を最初に読むこと。**
- **チャット間でお互いの会話は見えない。** 決定・未決・実装結果・実機フィードバックの要点は
  必ずファイル(PACING_REDESIGN.md / DEVELOPMENT_LOG.md / AI_DIRECTOR_HANDOFF.md /
  DISTRIBUTION_REDESIGN.md / CORE_LOOP.md / ENGINEERING_NOTES.md)に書くこと。チャットにしか書かれていない情報は存在しないのと同じ。
- 現在の進行プロジェクト: **PACING_PUZZLE.md(ランク7段階×台本パズル方式・旧線の再設計)**。
  どちらのチャットも作業開始時にまず PACING_PUZZLE.md(「実装順とステータス」「★未決事項」)と
  DEVELOPMENT_LOG.md の先頭数エントリを読むこと。PACING_REDESIGN.md は前提知識(旧仕様)として
  参照可。矛盾したら PACING_PUZZLE.md が勝つ。

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
PACING_REDESIGN.mdの★未決事項に書いて止まる(設計判断を実装チャットでしない)。

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
