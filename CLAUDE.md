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

### Empirical render budget (from the in-game benchmark — keep scores aligned to this)
The bottleneck is **NOT enemy/projectile count, and NOT the bloom post-process.**
A bloom-OFF run barely changed any result (FX/IMG/LIGHT still FAIL), so the cost
is the **per-effect DRAW METHOD itself**, not the full-screen filter. Score new
work by what kind of effect-draw it adds and how many are alive at once.
- **Cheap (score low):**
  - `enemy` — 60 on screen is *safe* (E60 PASS). Sprite draw is light.
  - `projectile` — 130 *safe* (J130 PASS). Movement + collision is light.
  - **mine (緑卵)** — 52 *safe* (`M52` PASS avg55 @res1, `M32` 60fps・実測v0.25.1543)。
    ベイク済プールスプライト1枚+卵1個ごとの影キャスターだが、待ち伏せ最悪ケースの52個でも耐える。
    **重い原因ではないと実測で確定**(M23=§5.24でこの切り分けのために追加)。
  - **small glow** (radius < `STRONG_GLOW_RADIUS` ~44) — drawn as a pooled
    tinted sprite (`drawSmallGlowSprite`), cheap.
  - **Bloom (AdvancedBloomFilter)** — turning it off barely moves FPS; treat its
    marginal cost as small. It is NOT the thing to cut first.
- **Expensive (score high) — and WHY (the actual draw path):**
  - **arbitrary text via `Text` (`FX-D`'s old path) = WORST**: each is a Pixi
    `Text` → glyph rasterization to canvas + GPU texture upload on create. `D20`
    ≈ avg 17 / min 10. Never spawn many `Text` per moment; use a bitmap-font /
    pre-rendered digit atlas / pooled sprites. **NOTE: numeric damage numbers are
    ALREADY fixed** — `drawDamageNumberBitmap` uses a baked `BitmapFont`
    (`dmg-num`, pooled `BitmapText`, color via tint). Only the rare *callout/
    serif* text (e.g. 「斬」) still takes the `Text` fallback; keep those few.
  - **strong glow (`FX-G`) — 残る唯一の主犯 (re-measured v0.25.1446)**: pooled
    additive sprites化(`drawStrongGlowSprite`)後も **`G12` FAIL (avg 32, 旧24)**。
    コストは再テッセレーションではなく**加算合成の大面積オーバードロー(塗り面積)**。
    `T16` FAIL(29.5)や`F2` CAUTION(38.5)も混合中の G10 が主因(純ライト`T24p`は
    PASS=トーチ光自体は安い)。対策方向: 同時強glow数のキャップ/半径縮小/解像度
    (塗り面積)削減。**res1再計測(v0.25.1543・実機スマホ)で `G12` 依然 FAIL avg30**
    (res1.5の32からほぼ横ばい)=強glowは res1 でも律速のまま。解像度では逃げ切れず、
    同時数キャップ/半径縮小が本筋。
  - **ring / particle / slash (`FX-R/P/S`) — FIXED・実測確認済み (v0.25.1446)**:
    per-frame `Graphics` → ALL pooled sprites (v0.25.1425)。再計測で
    **`P90` PASS(60fps) / `R12` PASS(avg55) / `S16` PASS(60fps) / `F1` PASS(avg53)**
    (旧: P64 avg~17 FAIL / R8 FAIL)。`F2`のみCAUTION(38.5)でこれはG10混合が主因。
  - **image marks (`IMG`) — 実測で無罪化 (v0.25.1446)**: `I12` まで PASS(60fps)。
    旧`I4` FAIL(avg~30)は同居していたGraphicsエフェクトが犯人だった。大型αスプライト
    自体は12枚まで安全。
  - **lights / torches (`LIGHT`)** — `T8` PASS(avg46・旧FAIL31) / **`T16` FAIL(29.5)**。
    ただしT16の混合はG10入り=強glowが主因の疑い濃厚。純ライト(`LIGHT-P`)は
    `T24p` PASS(avg51)=トーチ光そのものは安い。
  - **everything-at-once** — `ALL A1` **FAIL avg25**(旧15-17から+8〜10fps改善)。
    まだ**forbidden line**。残る要素はG8(強glow)+T12。
- **Current safe lines (measured v0.25.1446 @resolution1.5):**
  `enemy E60 60fps / projectile J130 60fps / bloom≈free / FX-D D20 60fps /
  FX-R R12 pass / FX-P P90 60fps / FX-S S16 60fps / FX composite F1 pass・F2 caution /
  image I12 pass / light T8 pass・T16 fail / strong glow G12 FAIL(唯一の主犯) /
  all A1 fail(avg25)`。
  (v0.25.1447でスマホ解像度デフォルト1.5→1=塗り面積44%。)
- **Re-measured @res1 (v0.25.1543・実機スマホ・↑の"宿題"消化):**
  `enemy E60 60fps / projectile J130 60fps / mine M52 pass(avg55)・M32 60fps /
  image I12 60fps / FX-P P90・FX-R R12・FX-S S16・FX-D D20 全60fps /
  FX F1 pass・F2 pass(avg40)・F3 FAIL(glow14) / strong glow G12 FAIL(avg30・依然唯一の主犯) /
  pure light T24p pass(avg57)=光は安い・但し light T24/T16 FAIL は混在glowが主因 / all A1 FAIL(avg25)`。
  **res1でもオーバードロー律速(G12/LIGHT/ALL)は解消せず=強glowが本丸のまま。緑卵は無罪確定(M52 pass)。**
  ※`ALL MAX`(A3)/`A2`は絶対ピークでスマホのメモリ天井超え=クラッシュのため、ベンチはスマホ時 ALL を A1 までに制限(v0.25.1542-3)。
- **Scoring rule of thumb (v0.25.1446改訂):** the cost is **draw-method ×
  simultaneous count**。per-frame `Graphics`とText生成は全廃済みなので、現在の
  ランクは: **強glow(加算・大面積オーバードロー)が突出して最重** > 多数のトーチ
  (T16+) ≫ 大型αスプライト(I12まで安全)・リング/パーティクル/スラッシュ
  (pooled sprite=P90でも60fps)・敵/弾(60fps張り付き)。新機能は「同時に生きる
  強glowを増やすか?」を最初に問うこと(増やすならキャップ必須)。
- The fix path for heavy effects is **a cheaper render method (pooled sprite /
  bitmap text / baked texture), not fewer enemies/bullets, and not cutting bloom.**
- (Benchmark caveat: the net diagnostic reads `network unstable`, so trust the
  FPS/render verdicts here, not the network line.)
- Sub-weapon events, including grenades and similar class skills, must not
  trigger slow motion unless the user explicitly names that sub-weapon as a
  slow-motion target.
- Periodic weapon explosions, including grenade-launcher-style projectile
  explosions, also must not trigger slow motion unless explicitly requested.

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
**ローカルでテスト/ビルドを回すかは社長が指示する(社長決定v0.25.1528)。** 自己判断の「要所でフル」
(旧v0.25.1496)は形骸化した——実測でSonnetが毎push `lint && typecheck && test && build`(約90秒/回、
うちM9ボットスモークが約38秒=テスト時間の88%)をフル実行し、しかもその38秒は今の作業(ゲート/演出/描画)の
網の外だった。よって自己判断をやめ、社長の明示指示に切り替える。
- **常時フロア(唯一・毎push)**: `npm run typecheck`(約9秒)。型/未import崩れの爆風検知器。これだけは毎回。
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

## Versioning
- **Bump `package.json` `version` on every push.** It is injected as
  `__APP_VERSION__` and shown top-right on the title screen and bottom-left
  in-game (with the active renderer), so the build loaded on-device can be
  confirmed at a glance. There is one version number — do not add a second.
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

## エージェント分業(2チャット体制・社長指示 v0.25.1301〜)
- **振り分け基準**: 「なぜ?」の調査・複数システムを跨ぐ設計・仕様の判断・監査=設計チャット(Fable)。
  仕様が確定したバッチ実装・明確な指示の修正=実装チャット(Sonnet)。原因不明のバグは
  まず設計チャットで診断してから実装チャットへ渡す(Sonnetに向かない仕事を渡さないことも精度対策)。
- このリポジトリは2つのチャットで運用する:
  - **実装チャット(Sonnet)**: 設計書(PACING_REDESIGN.md 等)のバッチを実装し、結果を
    DEVELOPMENT_LOG.md と設計書のステータス更新でファイルに残す。**設計判断はしない**
    (未決事項に当たったら設計書に質問を書いて止め、社長に報告する)。
  - **設計チャット(Fable)**: 社長との話し合い専用。決定事項は設計書ファイルを直接更新して
    実装チャットへ渡す。コードは書かない。**設計チャットの後任(モデル交代含む)は
    DESIGN_CHAT_GUIDE.md(運転マニュアル)を最初に読むこと。**
- **チャット間でお互いの会話は見えない。** 決定・未決・実装結果・実機フィードバックの要点は
  必ずファイル(PACING_REDESIGN.md / DEVELOPMENT_LOG.md / AI_DIRECTOR_HANDOFF.md /
  DISTRIBUTION_REDESIGN.md / CORE_LOOP.md / ENGINEERING_NOTES.md)に書くこと。チャットにしか書かれていない情報は存在しないのと同じ。
- 現在の進行プロジェクト: **PACING_PUZZLE.md(ランク7段階×台本パズル方式・旧線の再設計)**。
  どちらのチャットも作業開始時にまず PACING_PUZZLE.md(「実装順とステータス」「★未決事項」)と
  DEVELOPMENT_LOG.md の先頭数エントリを読むこと。PACING_REDESIGN.md は前提知識(旧仕様)として
  参照可。矛盾したら PACING_PUZZLE.md が勝つ。

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
