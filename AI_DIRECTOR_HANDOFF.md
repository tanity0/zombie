# AIディレクター 引き継ぎ記録 (L4D2型・難易度の“緩急”管理)

最終更新: v0.25.1272 / branch `claude/chat-context-continuity-saxlH` / HEAD (このコミット)
基準点(“面白い”状態への復帰点): **commit `b1eae30` (v0.25.1263)**。崩れたら `git checkout b1eae30`。
（ローカルタグ `diff-baseline-1263` は作成済みだが、このgitプロキシがタグpushを拒否するため remote には無い。commit hash で管理。）

## 0. 一言まとめ
L4D2の AI Director を手本に、**時間台本(①)の上に“状態駆動の波”を薄く乗せる**方針。
現状は **ステップA（信号を算出して可視化するだけ／読むだけ）＋ ステップB（RELAXだけ湧きに接続・最初の実接続）** まで完了。
- `?director=1`：左上にライブ表示、死亡/クリアのリザルトに緊張曲線＋難易度スコア(読むだけ・挙動不変)。
- `?directorApply=relax`：**RELAX中だけ**危険敵を足さない/湧き間隔を伸ばす/湧き上限を下げる(実際にゲームへ効く最初の一歩)。
  フラグ無し(既定)は基準点と完全に同じ挙動。両方同時に付けると、効いてる様子を見ながら確認できる。

## 1. 合意した設計方針（社長＋Codex＋Claude）★ここを外さない
- **Intensity（いま苦しいか）と Performance（いま余裕があるか）を絶対に混ぜない。**
  - Intensity高 → **Relaxへ寄せる**だけに使う（＝危険敵を足さない・湧きを緩める）。
  - Performance高 → **次のBuildUpを強める**だけに使う（＝余裕がある時だけ盛る）。
  - **「被弾が多いから難易度を上げる」は禁止**（最悪パターン）。
- **DirectorState = BUILD_UP / PEAK / RELAX の3状態。PEAK後は必ずRELAXへ落とす。**
- 15分台本(①フェーズ機)は**脚本(骨格)として残す**。Intensityは**演出調整**として上に薄く乗せる。
- 全部フラグで包む（オフれば基準点の挙動に戻る）。純関数＋テスト。スコア/EXP/レベル速度は不変。屋内/ラボは対象外。
- **有効化の順番（Codex推奨・重要）**: まず可視化(A) → 数値が体感と合ったら **RELAXだけ**接続 → 最後に **Performance高でBuildUp**。
  いきなり湧きを変えない（事故時に原因が分からなくなる）。

## 2. 実装済み（ステップA・読むだけ）
- **信号算出（純関数）** `src/utils/aiDirector.ts`
  - `stepDirector(prev, inputs, dtSec)` → `DirectorState`。Date.now/Math.random不使用（resume安全）。
  - Intensity: 被弾スパイク＋低HP＋**近接敵数**＋**危険敵の存在(dangerBias)**。上げ速い/下げ遅い。
  - Performance: HP余裕＋無被弾継続(20s)＋撃破EMA。ゆっくり両方向。**②(累積PP)とは別ソース**。
  - dangerBias（複数該当時は**最大値**を採用・合算しない）: ハンター（追跡=1 / 索敵=0.6 / 撤退=0.3）／
  werewolf突進予告=0.6・実行=1／pumpkinジャンプ予告(crouch)=0.6・滞空(jump)=1／screamer発動準備(scream)=0.7／
  plant射線内(自身の発砲レンジ内)=0.5／ghost(抱卵型)の毒卵密度(半径180px内・3個で最大)。
  - `summarizeRun(samples)` → リザルト用の難易度スコア(0..100)＋平均Perf/PEAK回数など。
- **配線** `src/hooks/useGameLoop.ts`（`?director=1` の時だけ・フレーム末）
  - 近接敵数(半径 `DIRECTOR_NEAR_RADIUS=240`)/被弾/撃破/ハンター状態を集めて `stepDirector` → バスへ。
  - 0.5s刻みで時系列サンプルを記録（リザルト用）。新ランでリセット。
- **可視化** `src/components/DirectorOverlay.tsx`（`?director=1`・左上・自前raf・ストア非購読）。
- **受け渡し/記録バス** `src/utils/aiDirectorDebug.ts`（`setDirectorDebug/getDirectorDebug` ＋ サンプルのリングバッファ）。
- **リザルト** `src/components/DirectorResult.tsx` を `GameOverScreen.tsx` に `?director=1` 時のみ差し込み。
  緊張曲線(Intensity面＋Performance線＋マクロ帯)＋難易度スコアをSVGで静的表示。
- **テスト** `src/utils/aiDirector.test.ts`（16ケース）: 分離ルール/3状態遷移/PEAK後RELAX/スコア集計/relaxSpawnAdjust 等。

## 2.5 実装済み（ステップB・RELAXだけ実接続）
- **調整の算出（純関数）** `src/utils/aiDirector.ts` の `relaxSpawnAdjust(macro)`。RELAX中だけ
  `{ escMult:0, intervalMult:1.35, capMult:0.85 }`、それ以外は全部1倍(無補正)。定数は
  `RELAX_ESC_MULT/RELAX_INTERVAL_MULT/RELAX_CAP_MULT`(全部私案・チューニング可)。
- **配線** `src/hooks/useGameLoop.ts`
  - `DIRECTOR_APPLY_RELAX = evParam('directorApply') === 'relax'`。信号算出のゲートを
    `DIRECTOR_ACTIVE = DIRECTOR_ENABLED || DIRECTOR_APPLY_RELAX` に拡張(可視化無しでも適用だけ動かせる)。
  - 適用先3箇所(通常湧きの計算部・屋内外/ラボ判定の直後): `normalSpawnCap`(湧き上限)・`spawnEsc`(③④の強さ/種類
    上乗せ)・`sceneIntervalMult`(湧き間隔)に `relaxAdj` を掛けるだけ。
  - **意図的に触れていないもの**: `enemyCap`(強制カリング上限)。RELAXで既存の敵を間引くと「急に画面から消える」
    体験になる(過去に社長からバグ報告があったパターン)ため、湧き側だけを絞って自然に減らす設計。
  - 前フレームの `directorRef.current.state.macro` を読む(=1フレーム遅延)。RELAXは最低8秒滞在するので無視できる誤差。
- **可視化** `DirectorOverlay.tsx` の見出しが `?directorApply=relax` の時 `(RELAX applied)` に変わる(適用中の目印)。

## 3. まだやっていない（＝次の作業）
1. **数値詰め（実機）**: `?director=1&directorApply=relax` で実際にRELAXが効いているか(湧きが緩む/リザルトの
   曲線でRELAX帯の後に沸きが減るか)を体感で確認し、定数調整。調整対象:
   - Intensity/Performance算出: `aiDirector.ts` 上部 `NEAR_ENEMY_FULL / INT_*_W / INT_TAU_UP/DOWN / INT_DMG_SPIKE /
     PEAK_ENTER/EXIT/HOLD / RELAX_UNTIL/MIN`、`useGameLoop` の `DIRECTOR_NEAR_RADIUS`。
   - RELAX適用の強さ: `RELAX_ESC_MULT/RELAX_INTERVAL_MULT/RELAX_CAP_MULT`(今は0/1.35/0.85)。
2. **効きすぎ/効かなさすぎの判断後、既定ON化を検討**（今はURLフラグ必須。体感が良ければ既定挙動に昇格するか検討）。
3. **ステップC: Performance高でBuildUp強化**（余裕がある時だけ次の山を強める。werewolf/ghost/screamer比率↑等）。
4. ~~危険敵の存在(dangerBias)を拡張~~ → **完了(v0.25.1272)**。werewolf/pumpkin/plant/screamer/ghost毒卵密度を追加済み。
   さらに拡張したい場合の候補: hunterのジャンプ予告(社長からの指摘で追加したpumpkinと同系統)、reaperの接近等。
5. **補給管理（L4D2の本領）**: Performance低＋RELAXで回復/弾ピックアップのdrop率↑、PEAK手前/Performance高で爆弾少し。
   （②③④と同じ「上に薄く乗せる」方式・フラグ化）。
6. **台本(①)との合わせ**: 区間ごとにBuildUp/Relaxの比重を変える（レベル上げ区間=Relax長め / 難関=PEAKあり 等）。

## 4. 実行/検証
- 実機: `https://tanity0.github.io/zombie/?director=1&directorApply=relax`（版が表示に一致するか確認）。
  左上表示(見出しに `(RELAX applied)`)＋リザルト欄。`directorApply` を外せば読むだけに戻る。
- ローカル: `npm run dev` → `/zombie/?director=1&directorApply=relax`。
- 静的検査（毎回）: `npm run lint && npm run typecheck && npm test && npm run build`。
- ディレクターだけ: `npx vitest run src/utils/aiDirector.test.ts`。

## 5. 厳守ルール（このリポジトリ）
- 開発ブランチは **`claude/chat-context-continuity-saxlH` のみ**（CLAUDE.md のブランチロック）。
- push毎に `package.json` version を上げる。返信の最後に必ず現version。
- ステップA〜可視化は**読むだけ**。ゲーム挙動を変える接続(B以降)は**必ずフラグで包み、既定は基準点挙動**。
- 仕様/数値の意図変更は**勝手にやらず、日本語で提案→社長承認**（CLAUDE.md 最重要ルール）。
