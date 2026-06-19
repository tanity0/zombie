# Development Log

This file is the handoff log for Codex, Claude Code, and other agents working
on the zombie game. Append a new entry after each meaningful change.

## Environment
- Repository: `/Users/tanity/zombie`
- Branch: `claude/chat-context-continuity-saxlH`
- Dev server: `npm run dev`
- Local URL: `http://localhost:5173/zombie/` unless Vite chooses another port
- Renderer under active development: PixiJS only

## 🔖 引き継ぎメモ (ローカルで再開) — 2026-06-17 (最新・ここを最初に読む)

**運用**: 開始時に `git fetch` → 最新へ。変更ごとに version を上げ → dev 再起動 → **応答末尾に現バージョン明記**（CLAUDE.md の規約）。

- **ブランチ**: 正本/デプロイ元 `claude/chat-context-continuity-saxlH`、作業ミラー `claude/sharp-euler-hvqloh`。
  **現状この2つは同一コミット**（クラウドでは毎push両方へ反映していた）。ローカルでは正本へ進めればOK
  （push で GitHub Pages 自動デプロイ → https://tanity0.github.io/zombie/）。
- **最新 version**: **`v0.25.431`**（= v0.25.430 の機能＋本引き継ぎメモ整備）。ローカル: `npm install` → `npm run dev`（`http://localhost:5173/zombie/`）。version表示はVite起動時固定なので更新後は dev 再起動。
- **実機調整用URLパラメータ**（既定へ焼く前のチューニング）:
  - カメラ: `?camtau`(追従0.14s) `?camdanger`(危険時0.08) `?camlook`(先読み40px) `?camret`(停止戻り0.20s)
    `?camclamp`(中心復帰0.07=画面幅比) `?camidle`(待機ズーム+0.05 / 負で引き) `?camidletau`(0.3s)。**今“最大値”で実装済→実機で範囲内へ詰める**。
  - ダンス: `?int1/2/3`(1拍ms上書き) `?bo1/2/3`(レベル別ダウンビートoffset ms)。テスト枠: `?dev=0`で開発ツール非表示。

### このクラウドセッション(v0.25.405→430)でやったこと
- **導線/画面刷新 (v0.25.407〜)**: `MainMenu` を廃止し **`MissionSelect.tsx`** に置換。導線=ミッション選択(ホーム)→ステージ選択
  →ミッション詳細→キャラ選択→装備選択→スタート。ホームから オプション/武器開発/資料室。**フリーミッション**(kind=free, 周回・会話なし)追加。
- **ストーリー/ステージのデータ化** `src/data/campaign.ts`: 本編 M1〜M7 + EX1/EX2(社長提供本文)。一覧=`summary`(1行)/詳細=
  `synopsis`(あらすじ)→クリアで`debrief`。進行解放 `src/data/progress.ts`(localStorage、メインクリアで次解放)。`src/config/devtools.ts`(DEV_TOOLS_ENABLED)。
- **会話のミッション別化 (v0.25.428)**: `IntroLine`型 + `StageMission.dialogue`(M1のみ実装)。出撃時にストア `introDialogueLines` へ設定、
  空=会話なし(フリー/ベンチ)。`INTRO_DIALOGUE_LINES`定数は廃止し `introDialogueTotalMs(lines)` に。
- **ダンス同期**: 自動アンカー(v0.25.406)＋**定期リシンク**(4秒/6ms, `RHYTHM_RESYNC_MS`)。曲は**正しいフル曲を復元**(ループ置換の誤りを是正、
  v0.25.419)。numpy解析で**テンポはほぼ600一定・途中ドリフト無し**を確認。計測ツール: **タップ間隔メーター**(`DanceTapMeter`、連続タップ間隔ms＋平均)
  と**強制JUST判定**(オプション)、自動タップも計測対象。ffmpeg/numpyはクラウドに入れたが**非永続**。
- **演出(ジューシー)**: 近接スイングで画面シェイク＋近接フィニッシュでパンチズーム。シェイクに振幅(`triggerShake(dur,mag)`)。
  行動別: シールドバッシュ/ハリケーン/死神召喚/登場着地。**追尾カメラ**(描画のみ・慣性/先読み/危険時タイト/中心クランプ)。
  **待機ズーム**(手を離して静止中に少し寄る)。登場の**飛び降りを3倍速**(`PLAYER_INTRO_LAND_MS` 1700→567)。
- 細部: ミラーボールの影削除 / フリック斬撃音オフ。

### 次の課題（未対応・優先度順の目安）
1. **ダンス「どんどんズレる」検証中**: 実機で `DanceTapMeter`(間隔ms/平均)＋強制JUSTで計測 → 一定オフセットなら**出力遅延**
   (`RHYTHM_BEAT_OFFSET_MS_BY_LEVEL` か簡易キャリブレーション)、増え続けるならリシンク不全を疑い調査。社長報告の数値待ち。
2. **カメラ各値の実機決定**: 今“最大値”実装。`?cam*` で範囲内へ詰めて既定(`gameStore` の CAMERA_* )へ焼く。待機ズームの向き(寄り/引き)も確定。
3. **ステージ固有ゲームプレイ**: 現状**全ステージがステージ1を流用**(`stageDirector.ts`)。ステージ別の波/敵テーマへ差し替え。
4. **会話・サブミッションの本文**: M2以降の `dialogue`、各ステージの `subs`(今は空)。地名(name/area)の確定。
5. **装備選択の開始時付与**: 今は選択を記録するのみ。ゲームへの付与を配線。
6. UIデザインの作り込み(導線は仮UI)。

### ローカル更新 (v0.25.432→433) — 2026-06-17
- **追従カメラ**: `CAMERA_FOLLOW_TAU` 既定 0.14→**0.16**(`?camtau`)。
- **持続ズーム整理** (`pixiScene.ts` 描画ループ): 待機ズームは既定(`CAMERA_IDLE_ZOOM_MAG=+0.05`)のまま。
  **移動中だけ引き** = `CAMERA_MOVE_ZOOM_MAG`(既定 **-0.09**=最大引きを少し深く、`?cammove`)。
  優先順: 移動中→引き / 手放し静止→寄り / それ以外(指タッチ静止・登場・ダンス)→等倍。
- **引きに慣性 (v0.25.433)**: 引きが広がる方向だけ長い時定数 `CAMERA_MOVE_ZOOM_TAU`(既定 **1.5s**≈約3秒でじわっと広がる、`?cammovetau`)。
  **戻り(寄り/等倍へ)は従来の `CAMERA_IDLE_ZOOM_TAU`(0.3s)** をそのまま使用。方向判定 `zoomingOut = zoomTarget < idleZoom`。
  → 実機で `?cammove` / `?cammovetau` / `?camtau` で詰めて既定へ焼く。
- **登場(ヘリ)カメラ (v0.25.434)**: 高いヘリを画面に収めるため **引きから開始→キャラ降下に同期して既定へ戻す**。
  - 高さ係数を1か所に集約: `playerIntroDescent(t)`(=`-playerIntroOffset(t).y / PLAYER_INTRO_HELI_HIGH_Y`、1=開始/最高→0=着地)。
  - カメラ縦をヘリ高度へ寄せる: useGameLoop の登場カメラ縦を `player.y + introOff.y * CAMERA_INTRO_LIFT_FRAC`(既定 0.7、`?camintrolift`)。降下で `introOff.y→0` のため自動で着地面へ戻る。
  - ズーム: pixiScene で登場中だけ `idleZoom = 1 + CAMERA_INTRO_ZOOM_MAG * h`(既定 `-0.35`、`?camintro`)。h が滑らかなので直接代入(ease無し=開始から引き)。
  - 検証: ビルド/起動クリーン。見た目(枠/引き量)は実機で `?camintro` / `?camintrolift` を振って既定へ焼く。
- **衝撃演出: ストップ/スロー/揺れの再設計 (v0.25.435)** — 社長指示。
  - **四神技発動に揺れ**: `fireShijinGod` 冒頭で `triggerShake(SHIJIN_TECH_SHAKE_MS=160, MAG=5)`。描画のみ=リズム不変(stop/slow無し)。
  - **カウンターはスロー廃止→ストップ**: 反射時の `triggerTimeSlow(0.34,560)` を削除し、`triggerHitstop(COUNTER_HITSTOP_MS=65)`(50〜80ms)+`triggerShake(100ms/4px)`(3〜5px・80〜120ms)。
    ストップは gameTime を止めるためダンス中(`rhythm.active`)は入れない。揺れは常時。近接カウンター成立エッジにも同じ揺れを追加。
  - **近接フィニッシュ=ストップ→スロー(半分)**: 既存の `hitstopUntil` 全停止機構はそのまま。`HITSTOP_MS` 300→**65**(ストップを上記カウンターと同じ短さに)、
    `MELEE_FINISH_SLOW_MS` 820→**410**(スローを半分に)。`triggerTimeSlow(0.4, 410)` は既存のまま。
  - 新規: store に `triggerHitstop(ms)` アクション(`hitstopUntil` を max 更新)。本物の全停止はループ早期return(useGameLoop:482)が担当。
  - 検証: `tsc --noEmit` 通過 / dev 起動・コンソールともクリーン。手応え(数値)は実機で確認。
- **ストップ調整 (v0.25.436→437)** — 社長フィードバック「もっと長く」「止まってない」「バッシュにもストップ」。
  - `HITSTOP_MS` 65→**120**(カウンター/近接フィニッシュ/バッシュ共通)。
  - **「止まってない」原因**: カウンターのストップを「弾を反射した時(reflect経路)」だけに入れていた。弾を撃たない敵に近接カウンターを当てても
    ストップが入らなかった。→ **カウンター成立エッジ(`lastCounterSuccessTime`、近接カウンター全般)にもストップを追加**(ダンス中は除外)。
  - **バッシュ**: シールドバッシュが敵にヒット(`bashShove`)したら `triggerHitstop(HITSTOP_MS)`(`updateMelee` 内、ダンス中は除外)。
  - 描画は `PixiStage` の app.ticker で毎フレーム `scene.sync()`(gameLoop と独立)。ストップは gameLoop 早期return(useGameLoop:485)で sim を凍結→静止描画。
  - 検証: `tsc --noEmit` 通過 / dev クリーン。停止の体感は実機で再確認(まだ弱ければ HITSTOP_MS をさらに増やす)。
- **インパクト演出の順序統一+寄りズーム+各ズーム強化 (v0.25.438→439)** — 社長指示。
  - **全揺れ倍化 (438)**: 各 `*_SHAKE_MAG` を2倍(SHAKE_MAG 8→16 ほか全種)。
  - **順序を「ストップ→(後で)演出」に統一 (439)**: 揺れがストップに被って止まりが分かりにくい問題を解消。
    - `triggerHitImpact(stopMs, shakeMs, shakeMag, zoomMag)`: ストップ→`setTimeout(stopMs)`後に 揺れ+寄りズーム。ダンス中はストップ抜きで即時。
    - `triggerFinishImpact()`: ストップ後に 揺れ+スロー+寄りズーム(hitstop は呼び出し側 set で設定済み)。
    - カウンター(reflect/成立エッジ)=`triggerHitImpact`、バッシュ命中=`triggerHitImpact`、近接フィニッシュ3経路=`triggerFinishImpact` に置換。
  - **寄りパンチズームを強烈に**: `MELEE_FINISH_ZOOM_MAG` 0.06→**0.7**、新規 `COUNTER_ZOOM_MAG=0.7` / `BASH_ZOOM_MAG=0.7`。命中時に大きく寄る。
  - **移動中の引きを強化**: `CAMERA_MOVE_ZOOM_MAG` -0.09→**-0.25**(`?cammove`)。
  - **登場ヘリ搭乗を寄りに反転**: `CAMERA_INTRO_ZOOM_MAG` -0.35(引き)→**+0.8(寄り/めっちゃズーム)**(`?camintro`)。降下で既定へ戻るのは従来どおり。
    ※以前の「ヘリを収めるため引きから開始」とは逆向き。社長の最新指示「ヘリ搭乗シーンはめっちゃズーム寄り」に合わせて反転。
  - 検証: `tsc --noEmit` 通過 / dev クリーン。寄り/引き/ストップの強さは実機で `?camintro` `?cammove` 等で調整。
- **参考クリップに合わせた stop→slow 調整 (v0.25.446)** — 社長が参考動画(`references/reference-clip.mov`)を提示「これと同じに」。
  - ffmpeg(社長承認で winget 導入)で解析: フリーズ実測 **約50〜65ms**(4.2s/7.15s/8.75s)、衝撃後に**ほぼ静止に近いスローが約290msかけて等速へ戻る**。
  - 「ぶつ切り」の主因2つを修正: ①フリーズ500ms→**70ms**(`HITSTOP_MS`)。②スローを `setTimeout` 遅延起動から**同期起動**へ(フリーズ明けと競合して一瞬等速に戻る不具合を解消)。
  - スロー: `MELEE_FINISH_SLOW_MS` 410→**300**、開始倍率 0.4→**0.2**(強め)→ smoothstep で 1.0 へランプ(v0.25.445 のランプ機構 `timeSlowStart` を使用)。
  - 検証: `tsc --noEmit` 通過 / dev クリーン。最終の体感は実機で確認し微調整。
- **通常サブウェポン「発火ナイフ」実装 (v0.25.448)** — 敵1体にナイフを投げて刺し、命中時単体ダメージ→2秒後に刺さった位置(敵に追従)で範囲爆発する遅延爆弾型サブ。
  - 型: `SubWeaponKey += 'fire-knife'` / `WeaponType += 'fire-knife-projectile'` / `Projectile += stuckToEnemyId?, isStuck?, explodeAt?`([types/game.ts])。
  - 衝突: `checkProjectileEnemyCollisions` から `fire-knife-projectile` を除外(専用処理)([collisionUtils.ts])。
  - 自動発動: タレット直後に投擲ブロック追加。最も近い非リーパー敵へ投擲(敵が居る時のみ)。Lv別CD `[8000,7000,6000]`、`FIRE_KNIFE_*` 定数群([useGameLoop.ts])。
  - 命中→刺さる→爆発: 専用ブロック(timedGrenades の後)。命中で単体ダメージ+`stickFireKnife` で敵追従化、2秒後に半径 `[54,62,70]` で範囲爆発(falloff+軽ノックバック、reaper除外、プレイヤー/味方無傷)。敵死亡でも死亡地点で爆発。
  - 追従/寿命: `updateProjectiles` に stuck-follow ケース追加。飛行中は `duration=1200ms` で未命中なら消滅(外れ→消える)。刺さると `stickFireKnife` が createdAt/duration をリセットして爆発まで生存。
  - 取得/強化: 汎用 `applySubWeaponCard` に乗るのみ。レベルアップカード追加(全クラス共通・刀/村雨/ダンス装備中は非表示)([upgradeUtils.ts])、`SUB_WEAPON_KEYS += 'fire-knife'`(商人/スタート画面/装備一覧に自動掲載)、`subWeaponDisplayName` に「発火ナイフ」。
  - 演出: ドット調ナイフ(飛行=銀+橙、刺さり=赤橙の火種明滅=導火線)、爆発は既存グレネード演出系を流用(橙リング/バースト/グロー、短命)。スロー対象外・常時glowなし。
  - ダメージ値は仮(命中24/爆発30)で `TODO` コメント。射程・威力は実機調整前提。
  - 検証: `tsc --noEmit` 通過 / dev クリーン起動・コンソールエラーなし。実挙動はゲーム内(カード取得→戦闘)で確認推奨。
- **サブウェポン/敵AI調整 (v0.25.449)** — 社長指示。
  - **ストップ中の揺れ無し**: 既に v0.25.441 で全揺れ共通に実装済み(`now >= s.hitstopUntil` で抑制+停止中はアニメ時計固定)。新規の揺れも自動的に対象。
  - **ドッグ(サブ)が移動軌道上の敵を噛む**: `DogFetchJob` に出発座標/開始時刻/噛み済みSetを追加。往復軌道(出発→対象→プレイヤー)を補間してドッグ位置を毎フレ算出し、`DOG_BITE_RADIUS=28` 内の未噛み敵へ小ダメージ(6)+小ノックバック(0.8)。1往復1回。
  - **犬型(werewolf)突進AI**: 汎用AI状態(`aiPhase` 等)を Enemy に追加。ハンドガン射程+70 で `windup`(0.6s減速)→`charge`(開始時のプレイヤー位置へ通常2倍速で突進)→cooldown。`updateEnemies`(gameStore)に実装。
  - **パンプキン(pumpkin)ジャンプ攻撃AI**: 射程+70 で `crouch`(縮みながら3秒溜め)→`jump`(1秒でその時のプレイヤー位置へ着地・空中は障害物無視)→`recover`(1秒停止)。着地で `pumpkinLanded` を検出し set 後に画面揺れ(`triggerShake`)。描画(`drawEnemy`)に縮み(crouch)/ジャンプアーク/着地スカッシュを追加。
  - 定数は調整可能(`WEREWOLF_*` / `PUMPKIN_*`、ダメージ等に `TODO`)。werewolf は t≥3:15、pumpkin は wave で出現=実機/ゲーム内確認推奨。
  - 検証: `tsc --noEmit` 通過 / dev クリーン起動・コンソールエラーなし。
- **近接揺れの整理 + 登場飛び降り調整 (v0.25.450)** — 社長指示。
  - **スイング揺れは通常ヒット時のみ**: `triggerCounter` 冒頭の無条件スイング揺れを廃止し、関数末尾で `slashAt.length>0 && !finisher` のときだけ発火。空振り→揺れ無し / フィニッシュ→`triggerFinishImpact` の揺れに一本化。
  - **カウンター/フィニッシュ時は近接スイング揺れを出さない**: フィニッシュは上記条件で除外。カウンター(reflect)は `triggerHitImpact` 開始時に `shakeUntil=0` で進行中の揺れを消去→ストップ後のインパクト揺れだけ残す。
  - **登場の飛び降りを真下＋少し速く**: `PLAYER_INTRO_FLY_X` 225→**0**(前進せず垂直落下)、`PLAYER_INTRO_LAND_MS` 567→**460**。横移動はヘリ飛来で確保。
  - 検証: `tsc --noEmit` 通過 / dev クリーン。
- **インパクト微調整 (v0.25.451〜454)**: ストップ`HITSTOP_MS` 70→**140** / スロー`MELEE_FINISH_SLOW_MS` 700→**1400**(倍)。バッシュのエフェクトは**敵ヒット時のみ**(壁押し出しのみは無し)、かつ**寄りズーム無し**(ストップ+揺れのみ)。フィニッシュ/カウンターの寄りズーム`*_ZOOM_MAG` 0.7→**0.5**(控えめ)。
- **フリーミッションを各ステージにぶら下げ (v0.25.455)** — 社長指示「フリーは各ステージにぶら下がってる感じ」。
  - 独立した `stage-free`(kind:'free')を廃止([campaign.ts])。ステージ選択のフリー枠も撤去。
  - 各ステージの**ミッション詳細**に「フリー(周回)で出撃 ・ 会話なし」ボタンを追加([MissionSelect.tsx])。メイン出撃=会話あり/進行解放、フリー=会話なし/進行に影響なし。
  - フリー判定を `progress.ts` の `getSelectedFreeMode/setSelectedFreeMode` で保持。`App.tsx` 開始時にフリーなら会話を空に、勝利時はフリーならクリア扱いにしない。ダンス練習/ベンチ開始でもフラグをクリア。
  - 検証: `tsc --noEmit` 通過 / dev でメニュー導線を実操作確認(M1 詳細に2ボタン表示=メイン出撃＋フリー周回)。
- **装備選択の開始時付与を配線 (v0.25.456→457)** — 社長指示「選んだサブをLv1所持で開始＋商人でそれらのLvアップ販売＋レベルアップ選択肢もそれら(他は非表示)」。
  - インパクト微調整(456): 全ストップ`HITSTOP_MS`=**100ms(0.1s)**、カウンター/バッシュにも**スロー復帰**追加(`triggerHitImpact` に `triggerTimeSlow`)、寄りズーム`*_ZOOM_MAG`=**0.3**。
  - 装備配線(457): 出撃時の `loadout` をストア `pendingLoadout` に保持(`startMission`)。`resetGame` で `subWeapons`=選んだサブ(空なら固有スキルへフォールバック)各Lv1、`unlockedShopSkillCards`=そのサブ群Lv3(=商人はそれらの昇格のみ販売)に設定。
  - `generateUpgradeOptions`: クラス専用サブを所持判定に変更＋**最後に所持サブのみへフィルタ**(村雨=刀Lv3昇格は例外)。サブ昇格は最大2枠+残りパッシブ。ドッグの昇格カードも追加。
  - 検証: `tsc --noEmit` 通過。dev で 同意→START→ステージ→M1→キャラ→装備で「自動タレット＋発火ナイフ」を選び出撃 → HUD に両方Lv1表示・固有手榴弾なし、レベルアップ候補にも自動タレット表示=配線成功を確認。
- **通常サブ「ドローンブーメラン」実装 (v0.25.458)** — 手動発動(立ち止まり中の近接入力)・3フェーズ・CD UI。
  - 型: `SubWeaponKey += 'drone-boomerang'` / `WeaponType += 'drone-boomerang-projectile'` / `Projectile += boomPhase,boomOriginX/Y,boomMaxDist,boomStopMs,boomStopUntil`([types/game.ts])。
  - 発動: `triggerCounter`(近接スイング)内で「`drone-boomerang`所持 & 非排他 & **立ち止まり中(!isMoving)** & CD明け」なら進行方向へ投擲＋5秒CD([gameStore.ts])。自動発動ではない。
  - 挙動: `updateProjectiles` に out(直進貫通)→stop(一定距離で停止)→return(プレイヤー現在地へホーミング)→done(消滅)を実装。安全消滅=`duration` 上限カリング。
  - ダメージ(useGameLoop専用ブロック): 行き/戻り=貫通・通常近接同等(各フェーズ hitEnemies で1回)、停止中=`DRONE_BOOM_PULSE_MS=250ms` パルスで範囲内へ近接1/4。敵弾/反射/ヘイト無し・爆発無し。
  - CD UI: `syncPlayerFx` に gameTime を渡し、CD中は近接CDサークルより一回り大きい円(`r*1.28`)を表示([pixiScene.ts])。
  - 取得/強化: `SUB_WEAPON_KEYS += 'drone-boomerang'`、`subWeaponDisplayName`、`generateUpgradeOptions` に所持時昇格カード。Lv別: 停止2/3/4秒・飛距離200/236/270。
  - 検証: `tsc --noEmit` 通過 / dev でバンドル・全スプライト200 OK・コンソールエラーなし。※preview は音声 `ERR_ABORTED` で START 後のローディングが進まず in-combat 実操作確認は不可(環境制約)。実機で投擲挙動を確認推奨。
- **後続調整 (v0.25.459〜462)**: フリー/メインで固有(デフォルト)サブが落ちる不具合修正(常に固有所持＋選択分)/ ブーメラン発動を近接攻撃と統一・行き速480/距離半減/画面外即帰還 / プレイ中HUDにスクラップ数表示 / 経験値・宝石の呼称を「PHILL」に(HUDの EXP→PHILL)。
- **屋内ステージ「研究施設」仮実装 (v0.25.463)** — 手書き固定レイアウトの屋内ステージ追加(`indoorMode` フラグ+最小フック)。
  - 新規 `src/world/labMap.ts`: `LAB_BOUNDS`(2600²)/`LAB_WALLS`/`LAB_DOORS`(weaponRoom/goal)/`LAB_ROOMS`(6)/`LAB_ENEMIES`(固定休眠5)/カードキー/ボタン/武器箱/ゴール/`resolveLabWalls`。
  - 型: `PickupType+='card-key'` / `Enemy+=dormant?,aggroRange?,fixed?` / `LabDoor`/`LabButton`。
  - 状態: `indoorMode/labDoors/labButtons/hasCardKey/goalReachedAt/pendingIndoor`、`resetGame` で labMap 初期化、action `triggerEventVictory/openLabDoor/setHasCardKey/pressLabButton/setPendingIndoor`。
  - 衝突: `movePlayer`/`updateEnemies` を屋内は `resolveLabWalls`(閉ドアのみ壁)へ分岐。休眠→aggroRangeで起床。
  - useGameLoop: 屋内で自動湧き/wave/城/死神を停止(`&& !indoor`)、`fixed`敵をカリング除外、カメラを`LAB_BOUNDS`にクランプ。カードキー収集→ゴール扉解錠/ボタン近接→武器庫扉/ゴール侵入→演出→`triggerEventVictory`。
  - 描画: `pixiScene.syncLab`(屋外レイヤー非表示＋床/壁/扉/ボタン/ゴールの矩形描画)、card-keyドット絵。
  - 入口: `campaign.ts` に `stage-lab`(常時解放)、`App.startGame` で indoor 橋渡し。
  - 検証: `tsc --noEmit` 通過(各段階)/dev クリーン/ステージ選択に「研究施設(LAB)」表示確認。※preview 音声制約で屋内の実操作は未確認 → 実機で確認推奨。寸法/敵配置/aggro は labMap 定数で微調整。

### v0.25.351 までの旧経緯は下記の過去メモ参照。


- **正本 / デプロイ元ブランチ**: `claude/chat-context-continuity-saxlH`（GitHub `tanity0/zombie`）。
  `.github/workflows/pages.yml` は **このブランチ（と `main`）への push で GitHub Pages を自動デプロイ** → https://tanity0.github.io/zombie/ 。
- **最新 version**: **`v0.25.430`**（手を離して待機中に少しズーム=待機ズーム追加。追尾カメラ/シェイク/計測済。実機確認待ち）。
- **Windows 環境メモ**: dev 再起動に `Start-Process "npm"` を使うと `npm.ps1` がメモ帳で開く（`.ps1`→Notepad 関連付け＋ShellExecute）。**`npm.cmd` を明示するか preview_start を使う**こと。npm.ps1 本体は無傷（壊れていない）。

### このセッション(v0.25.352→405)でやったこと
- **タイトル/起動フロー**: 同意画面→（同意でBGM）→タイトル(the ONE)→STARTタップ→暗転→本物ローディング→セレクト。起動時の「ゾンビサバイバル」ローディングは廃止。ミッション最初の会話に右下スキップ。
- **バージョン表示**: スタート画面の右上へ移動／セレクト画面からは削除。
- **武器バランス**: マシンピストルT3(`handgun-t3`)のみ基礎クリ率を5%に固定（`critChance:0.05`）。
- **リズム/ダンス**: JUST足元バースト（タップ=サークル/フリック=矢印）＋足元発光。フリック成功でも光る。JUST発光は **赤→青→緑→黄** を巡回（`rhythm.judgeSeq`）。**キックドラム** `public/audio/sfx/kick-drum.mp3`（SFX `dance-kick`）をタップ/フリックのJUSTで再生。ダンス開始は**立ち止まり3秒**（`RHYTHM_ENTER_IDLE_MS=3000`）。
- **ダンス練習(セレクト画面下部)**: Lv1/2/3 はレベル選択＝サークル間隔入力欄に既定値(600/500/429ms)が入る → 編集 → **決定で開始**（`danceTestInterval` が実グリッドへ連携）。**自動タップ(JUSTでドラム)** トグル（既定ON、`danceTestAutoTap`）。
- **fog**: 森下＝`fog-alpha.png`（通常合成・森の後ろ）。位置 yFrac 0.66。森上 yFrac 0.92（下すぎを修正）。奥は手続き生成のまま。
- **v0.25.405**: 練習モードで `interval<600` のとき最初のサークルにオートタップ/キックが出ないバグを修正（練習はリードを1拍に固定）。

### 次の課題（未対応）
- **ダンス曲↔サークルの開始位相ズレ（本命）→ v0.25.406 で自動アンカー実装済み**。
  曲が実際に鳴り出した瞬間（`getDanceBeatAnchorMs()` が `Date.now() - bgm.currentTime*1000` を返す）に、
  ビートグリッド起点 `firstBeatAt` を **開始時1回だけ** 最寄りのビート境界へスナップして位相を合わせる
  （毎フレーム同期はしない＝ブルブル回避）。可変な `load()`→`play()` レイテンシはこれで除去される。
  残るのは曲ごとの固定ダウンビート補正のみ → `RHYTHM_BEAT_OFFSET_MS_BY_LEVEL`（`?bo1/2/3` で実機調整 → 既定へ焼く）。
  **実機（ダンス練習・自動タップON）で確認待ち**: それでも頭がズレるなら `?bo*` で各レベルのダウンビートを詰める。
- 検証は音×映像のため自動テスト不可 → 実機（ダンス練習）で確認。

## 🔖 引き継ぎメモ (next: ローカル移行 + チャットfork) — 2026-06-16

**運用**: このチャットを fork してローカルへ移行。開始時に `git fetch` → 最新へ。コード正本は下記ブランチ。
- **デプロイ元 / 正本ブランチ**: `claude/chat-context-continuity-saxlH`(GitHub `tanity0/zombie`)。
  GitHub Pages はこのブランチ(と `main`)への push で自動デプロイ → https://tanity0.github.io/zombie/ 。
- **ミラー**: `claude/zombie-online-handoff-nand99`(オンライン作業中は両方へ同一コミットを push していた)。
  ローカルでは `claude/chat-context-continuity-saxlH` を正本にして進めるのが安全。
- **最新 version**: `v0.25.351`(両ブランチとも commit `bc2d7ee`)。
- ルール据え置き: push毎に version 上げ + このログ追記 / モデル識別子は書かない / React毎フレーム再描画を避ける /
  サブウェポン・グレネード系はスロー禁止 / 2DHDの blur/fog/bloom は全削除しない / 無断パッケージ install しない。
- ローカル: `npm install` → `npm run dev`(`http://localhost:5173/zombie/`。実機 `npm run dev -- --host 0.0.0.0`)。
  version表示はVite起動時固定なので version 更新後は dev 再起動。

### このオンラインセッション(v0.25.328→351)でやったこと
- **ヘリ登場演出の全面強化**: ヘリ画像を透過処理して登録(`public/sprites/helicopter.png`、`pixiTextures` で nearest・
  非ぼかし)。登場を2段化 = フェーズA(ヘリ飛来 `PLAYER_INTRO_HELI_MS=2600`)→フェーズB(従来のジャンプ着地
  `PLAYER_INTRO_LAND_MS=1700`)。キャラはヘリの**ドアに前面(danceUiLayer)で重ねて乗車**(`introHeliBase`/
  `HELI_RIDE_DOOR_FRAC` 等)、低ホバーまで降下(`heliAboveAt`/`HELI_DROP_ABOVE`)→飛び降り(単調落下=谷なし)→
  ヘリは0.3s待って離脱(`HELI_DEPART_DELAY_MS`、ホバー固定で離脱)。右向き。飛来は左遠方(`FAR_X=4500`)から easeOut で高速。
- **登場セリフ(時間停止・オートタイプ・1行ずつ切替)**: `IntroDialogue.tsx`(表示中だけ自前rAF更新)。
  ヘリ低ホバー時(`INTRO_DIALOGUE_TRIGGER_T=PLAYER_INTRO_HELI_FRAC*0.82`)に時間停止。文面は通信3行+生存者の声
  `__voice__`+通信1行(`gameStore.INTRO_DIALOGUE_LINES`、各行保持950ms)。
- **連射タレットの索敵回転**: 前方集中は射線帯に敵が無い間 `TURRET_SCAN_SPEED` でゆっくり回転、捕捉で連射(`useGameLoop`)。
- **ダンスUI再配置**: 技リストを頭上へ、入力済み矢印をキャラ下へ(`pixiScene.syncRhythmOverlay`)。
- **ダンスの近接(タップ)音を合成バスドラムに**: `audioManager.playDanceKick()`(Web Audio、サンプル不要)。
- **影**: 城・拾い物もソフト方向影に統一(v0.25.330)。
- **🩹 真っ暗対策**: (a) `pixiTextures.ensureTextures` を個別try/catch化(1アセット失敗で全画面落ちない)。
  (b) `PixiStage` のティッカー `scene.sync()` と破棄を try/catch、非同期init×unmount競合を修正(ゲームオーバーの真っ暗固まり対策)。

### ⏳ 未完了・次にやること
1. **リズム同期(最重要・未解決)**: 音楽と判定グリッドがズレる(特にLv3)。`audio.currentTime` アンカーは出力レイテンシで
   悪化したため撤回済み(固定グリッドに戻した)。**実機キャリブレーションが正攻法**: 位相 `?bo1/2/3`(ms、正=遅らせる)、
   テンポ `?int1/2/3`(1拍ms)で合わせ、`config/shijin.ts` の `RHYTHM_BEAT_OFFSET_MS_BY_LEVEL`/`intervalOverrides` 既定へ焼く。
   それでも忙しすぎる場合の難易度緩和案(未着手): ミスで全リセットしない/空ビートを見逃す/Lv3半拍ごと/判定窓拡大。
2. **stage2-4 のステージ別BGM**: Drive に `stage2/3/4.mp3` 揃済み(未配置)。配置 + `audioManager` の `BGM_TRACKS` 拡張 +
   ステージ→曲選択の配線が必要(現状 `BGM_TRACKS[0]` 固定)。
3. ライティング各 `?パラメータ` の最終値を実機で決めて既定へ焼く / 強イベントの動的影もソフト化(未)。
4. (任意)登場セリフの「了解。」は一旦削除済み。必要なら職業名話者(`CHARACTER_CLASS_NAMES`/speaker `__class__`)で復活可。


## 2026-06-16 - v0.25.352 - 引き継ぎメモ更新(ローカル移行 + チャットfork準備) (Claude Code)

### 変更
- 先頭の「🔖 引き継ぎメモ」をローカル移行/fork向けに最新化(version/ブランチ/このセッション成果/未完了)。
- コード変更なし(push ルールに従い version のみ bump)。両ブランチ同一コミットで push 済み。

### 引き継ぎ要点
- 正本/デプロイ元: `claude/chat-context-continuity-saxlH`(Pages 自動デプロイ)。ミラー: `claude/zombie-online-handoff-nand99`。
- 最重要の残課題: リズムの音楽⇔判定グリッドのズレ(実機キャリブレーション `?bo`/`?int` → 既定焼き込み)。

## 2026-06-17 - v0.25.430 - 手を離して待機中に少しズーム (Claude Code)

### 変更（社長指示）
- 手を離して静止している間だけ worldGroup を少し拡大する**待機ズーム**(描画のみ)を追加。`CAMERA_IDLE_ZOOM_MAG=+0.05`
  (?camidle、負で引き)・`CAMERA_IDLE_ZOOM_TAU=0.3`s(?camidletau)で滑らかに寄り、操作再開で1.0へ戻る。既存のパンチズームと掛け合わせ。
- 条件: `!touchActive && !player.isMoving`。**登場演出/ダンス中は無効**(演出を妨げない)。Pixi 側で fps非依存に ease。

### 負荷スコア
- **1/10**（rendering）。worldGroup スケール1つ＋1lerp/フレーム。アイドル(=ズーム1.0)時は worldGroup を触らない。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。実機で寄り具合を確認(?camidle で量・向き調整、負で引き)。

## 2026-06-17 - v0.25.429 - 追尾カメラ強化(先読み/危険時タイト/中心クランプ) 最大値で実装 (Claude Code)

### 変更（社長指示: 各パラメータを一旦最大値で実装）
- 追従カメラ(描画のみ)を多パラメータ化。すべて ?キー で実機調整可。**最大値を既定に**:
  - 追従遅延 `CAMERA_FOLLOW_TAU=0.14`s(?camtau) / 危険時 `CAMERA_DANGER_TAU=0.08`s(?camdanger)
  - 進行方向先読み `CAMERA_LOOKAHEAD_MAX=40`px(?camlook、移動中だけ方向へ余白)
  - 停止時の戻り `CAMERA_RETURN_TAU=0.20`s(?camret、先読みを0へ戻す=ピタ止まり回避)
  - 強制中心復帰 `CAMERA_CENTER_CLAMP_FRAC=0.07`(?camclamp、画面幅比。離れ過ぎたらクランプ=見失い防止)
  - 危険判定半径 `CAMERA_DANGER_RADIUS=150`px(敵が近いと先読みを切りτをタイトに=接近戦で安定)
- シェイク通常上限の目安として `SHAKE_MAG` 7→**8**px(通常時の揺れ幅)。
- 判定/スポーン/プロップ生成は実プレイヤー基準(baseCam)のまま=ゲーム性に影響なし。

### 負荷スコア
- **1/10**（rendering）。1フレーム数式＋敵への近接 some ループ(O(敵数)・距離二乗比較)のみ。新規オブジェクト無し。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。実機で挙動確認→範囲内(例 0.08〜0.14 等)へ詰める。

## 2026-06-17 - v0.25.428 - フリーミッション＋会話のミッション別化＋ヘリ飛び降り3倍速 (Claude Code)

### 変更（社長指示）
- **ヘリから飛び降り演出を3倍速**: `PLAYER_INTRO_LAND_MS` 1700→567(フェーズB=飛び降り/着地のみ短縮)。フェーズA(ヘリ飛来)/
  会話トリガー位置は不変(HELI_FRAC基準)。
- **会話をミッション別に**: `IntroLine` 型(types)を新設。`StageMission.dialogue?` を追加し**M1のみ会話を実装**(従来の通信/偵察兵)。
  実行時の会話はストア `introDialogueLines`(出撃時に選択ミッションから設定)。`introDialogueTotalMs(lines)` で所要時間を算出。
  `useGameLoop` は **lines が空なら会話を発生させない**。`IntroDialogue` はストアの行を描画。`INTRO_DIALOGUE_LINES`/`_TOTAL_MS` 定数は廃止。
- **フリーミッション追加**: `STAGES` に kind `free`(`stage-free`、常時選択可・ミッション/会話なし)。ステージ選択の最上段に表示。
  選択→キャラ→装備→開始で**会話なしの周回**ができる。ベンチ/未選択も会話なし。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。実機: フリー=会話なし、M1=会話あり、飛び降りが速いことを確認。

## 2026-06-16 - v0.25.427 - 自動タップも計測対象に (Claude Code)

### 変更（社長指示: 自動タップの間隔も測る）
- 練習の自動タップ呼び出しから `noLog` を外し、**自動タップも `danceTapLog` に記録**。自動タップは練習モード専用なので、
  ON→自動タップの間隔(=~interval、グリッドの一定性確認) / OFF→人間の間隔、がメーターに出る。実ゲームは人間のみ(従来どおり)。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。実機: 練習で自動タップON時に間隔~600(±フレーム量子化)を確認。

## 2026-06-16 - v0.25.426 - テスト: 強制JUST判定モード(オプション) (Claude Code)

### 変更（社長指示: 計測時の紛らわしさ回避）
- `danceForceJust`(store, 既定OFF) + `setDanceForceJust` を追加。ON のとき `rhythmInput` のタップは
  `onBeat=true` 強制=**常にJUST成功**(キック/バースト/コンボが毎タップ発火)。判定タイミングに関係なく計測しやすい。
- オプション(テスト開発枠)のダンス練習に**「強制JUST判定(タップ常に成功)」トグル**を追加(自動タップの下)。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。実機でON時に全タップがJUSTになることを確認。

## 2026-06-16 - v0.25.425 - タップ計測を「連続タップ間隔(ms)」に変更 (Claude Code)

### 変更（社長指摘: 相対オフセットではなく実タップ間隔が欲しい）
- 前回の相対/曲基準オフセット(g/a)を撤去。`danceTapLog` を**実タップの絶対時刻(ms)**に。
- `DanceTapMeter`: **連続タップの間隔(ms)** を右下から上へ表示＋**平均**。Lv1で正しく刻めば各間隔は ~600ms
  (=人間で測った実テンポ)。期待間隔(`rhythm.interval`)に近いほど緑。平均は拍抜け(>1.5倍)を除外。数値は増やさず最小限。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。実機(ダンス中に拍へ手動タップ)で間隔と平均を確認。

## 2026-06-16 - v0.25.424 - 追尾カメラ(慣性・描画のみ) (Claude Code)

### 変更（社長指示: 追尾カメラワーク追加）
- 本編カメラ(useGameLoop)に**指数追従の慣性**を追加。`cam += (target-cam)*(1-exp(-dt/τ))`、`CAMERA_FOLLOW_TAU=0.18s`
  (`?camtau=` で実機調整)。fps非依存。大きく離れたら即スナップ(`CAMERA_SNAP_DIST=600`)。
- **描画用カメラだけ**を遅らせ、`syncBreakableProps`(プロップ生成)・スポーン・判定・敵ターゲットは**実プレイヤー座標(target)**のまま
  =ゲーム性に影響なし。ベンチ/登場演出のカメラは従来どおり。
- ダンス中はプレイヤー静止のためカメラはプレイヤー中央へ収束(ズレなし)。サークルはワールド座標でプレイヤーに追従。

### 負荷スコア
- **1/10**（rendering）。1フレーム数式のみ・新規オブジェクト無し。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。実機で追従の手応え(τ)を確認。重い/軽い遅れは ?camtau=0.12〜0.22 で調整→既定へ。

## 2026-06-16 - v0.25.423 - タップ計測に「曲基準の絶対ms(a)」を追加 (Claude Code)

### 変更（社長指示: 人間側タップの絶対値も算出。相対ではなく絶対）
- `danceTapLog` を `{g,a}` に拡張。**a=曲の実再生位置(`getDanceBeatAnchorMs`=bgm.currentTime)基準の符号付きズレ
  =人間の絶対タップms**、g=ゲームのビートグリッド基準(従来の相対値)。store→audioManager の循環import無し(確認済)。
- `DanceTapMeter`: 各タップを「**太字=a(曲基準)** ／括弧=g(グリッド基準)」で表示。下部に「曲 avg / 曲 drift / n」と
  「grid avg / drift」。**a がほぼ一定オフセット→出力レイテンシ等の固定ズレ / g だけ増える→グリッドが曲からドリフト(リシンク不全)**
  を数値で切り分けられる。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。実機(ダンス中に手動タップ)で a/g の値を確認。

## 2026-06-16 - v0.25.422 - 画面シェイクに振幅(mag)+行動別に追加(近接強化/シールド/ハリケーン/死神) (Claude Code)

### 変更（社長指示: 近接シェイク強化＋似合う行動に追加・ウザくない範囲）
- シェイクに**振幅 `shakeMag`＋長さ `shakeDur`** を持たせ、`triggerShake(durationMs, mag)` で行動別に強さ設定
  (短く強いパンチも可)。重なりは「強い方優先・長さ延長」。被弾シェイクは従来どおり(7px/280ms)。Pixi は
  `shakeMag×(残り/長さ)` で揺らす。**描画のみ・ゲーム性に影響なし**。
- 追加/強化(px×ms): 近接スイング 3.5×110(やや強く) / **シールドバッシュ** 5×160 / **ハリケーン発生** 5.5×220 /
  **死神召喚** 8×340 / 登場着地 7.5×240。順に強くなる(ウザくならない範囲)。

### 負荷スコア
- **1/10**（rendering）。イベント駆動のみ・per-frame新規コスト無し。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。実機で各行動の手応えを要確認(強すぎれば mag を下げる)。

## 2026-06-16 - v0.25.421 - タップms計測オーバーレイ(テスト用) (Claude Code)

### 変更（社長指示: 実タップのms計測＋右下からログ＋平均）
- `rhythmInput('tap')` で**最寄り拍からの符号付きズレ(ms)** を `danceTapLog`(最大60件)に記録。負=早い/正=遅い。
  練習の自動タップは `opts.noLog` で除外。ダンス開始ごとにログをクリア。
- `DanceTapMeter.tsx`: ダンス中のみ画面**右下から上へ**小さくログ表示＋ **avg / |avg| / n / drift(後半平均-前半平均)** を表示。
  `DEV_TOOLS_ENABLED`(?dev=0で非表示)。再描画はタップ時のみ(active=bool / log=配列ref)。
- **切り分け**: drift がほぼ0で avg が一定→出力レイテンシ等の固定オフセット。drift が時間で増える→曲⇔グリッドの累積テンポずれ
  (=リシンク未動作の疑い)。これで「どんどんズレる」の正体を数値で特定する。

### 負荷スコア
- **1/10**（UI）。per-frame購読なし(タップ時のみ更新)。計測は tap 経路に符号付きズレ計算1つ＋ログpushのみ。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。実機(ダンス中に手動タップ)で数値を確認。

## 2026-06-16 - v0.25.420 - 近接攻撃シェイク＋近接フィニッシュ パンチズーム (Claude Code)

### 変更（社長指示）
- **近接攻撃で軽い画面シェイク**: `triggerCounter`(基本近接スイング)発動時に既存シェイク機構を短時間
  (`MELEE_SWING_SHAKE_MS=90`)だけ発火(mag は shakeLeft/SHAKE_MS で自動的に小さくなる=控えめ)。
  進行中の強い揺れは `Math.max` で縮めない。
- **近接フィニッシュで少しズーム(描画のみ)**: store に `zoomUntil/zoomMag` + `triggerZoom(mag,ms)` を追加。
  finisherHit 時に `triggerZoom(MELEE_FINISH_ZOOM_MAG=0.06, 320ms)`。Pixi は `worldGroup` を**画面中央
  (=プレイヤー)基準**で 1+mag*(env) に拡大→1.0へ収束(env=zoomLeft/MS)。カメラ座標/判定は不変。

### 負荷スコア
- **1/10**（rendering）。イベント駆動のみ。シェイクは既存機構の再利用、ズームはアイドル時 worldGroup を一切触らず
  (zoomApplied フラグで終了時に1度だけリセット)。per-frame の新規コスト無し。

### 相談中（未実装）
- カメラ慣性(プレイヤーに0.2sほど遅れて追従)は実装可能。`setCameraPosition` の前で目標カメラへ指数追従
  (`cam += (target-cam)*(1-exp(-dt/τ))`, τ≒0.12-0.2s)させればよい。**描画カメラのみ**に入れ、判定や敵の
  ターゲット座標には影響させない方針。要望あれば実装。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。実機で近接スイング/フィニッシュの手応えを要確認。

## 2026-06-16 - v0.25.419 - ステージ1フル曲を復元(ループ置換の誤りを是正)＋numpy精密計測 (Claude Code)

### 修正（社長指摘: 途中で短く切られた曲になってる / numpyで測れ）
- **誤り是正**: v0.25.417 で `dance-100.mp3` を「ループWAV×14」に置換していたが、フル曲は単純ループ反復ではなく
  **構成のあるフル尺曲**だった(=短く切られて聞こえた)。素材ブランチの**元フル曲(268.032s/128k)を復元**。
- **numpy精密計測**(スペクトラルフラックス＋自己相関/コム): フル曲のテンポは **≒600ms/拍で一定**(前半599.42/後半599.38、
  ループ周期≒19.18s。方式間で±1ms程度のばらつき)。**途中ドリフトは無し**=曲は悪くない。ロスレスのループ素材は600ちょうどで、
  フル曲の書き出しが極僅か(0.08%程度)速いだけ。
- **方針**: フル曲はそのまま(無劣化)。`interval=600`(BPM既定)を維持し、**4秒ごとの定期リシンク**が音声の実再生位置へ
  グリッドを合わせ続けるので、±1msのテンポ差は吸収される(ストレッチ等の再エンコードはしない)。
- リシンク間隔は社長指示で **4秒/6msに戻し**(v0.25.418の1秒/3msから)。

### 残課題（次の候補）
- 一定量だけ常にズレる場合は曲ではなく**音声出力遅延**(特にBluetooth、数十〜数百ms)。固定オフセット
  `RHYTHM_BEAT_OFFSET_MS_BY_LEVEL` か簡易キャリブレーション(基準音にタップしてズレ量を保存)で対応可能。

### Verification
- `npm run build` 成功。実機(v0.25.419にハードリロード)で全曲が流れる(切れない)こと＆ズレを確認。

## 2026-06-16 - v0.25.418 - 曲テンポ検証(一定600)＋定期リシンクをタイト化 (Claude Code)

### 調査（社長: まだズレる/途中からズレる?）
- ループWAVのオンセットをコム解析。**テンポは一定 ~600ms**(前半599.25 / 後半599.00)で**途中ドリフト無し**。
  → 曲ではなく「実時間グリッド vs 音声再生クロック(＋出力遅延)」のズレが原因。
### 変更
- 定期リシンクを **4000ms→1000ms / 閾値6ms→3ms** にタイト化。ドリフトを溜めず追従(currentTime読み＋必要時setのみで軽量)。
### 残課題メモ
- Bluetooth等の**音声出力遅延**は固定オフセットで効く。残るなら `RHYTHM_BEAT_OFFSET_MS_BY_LEVEL` かキャリブレーションで対応。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。実機(v0.25.418にハードリロード)で要確認。

## 2026-06-16 - v0.25.417 - ダンス曲を素材ロスレスWAVから正確な600で再生成 (Claude Code)

### 変更（社長指摘: githubに素材あり / 600になってない）
- 素材ブランチ `claude/zombie-material-handoff-chat-13tpmh` に **ロスレス `dance-100-loop.wav` = 19.200s
  = 32拍×600ms ちょうど(=100BPM・8小節)の完璧なループ** があると判明。現行 `dance-100.mp3`(268s)は
  このループを14回(448拍)レンダリングしたものだが、テンポが僅かに狂って598.3になっていた(=同一曲・テンポだけ誤り)。
- **対応**: ループWAVを `-stream_loop 13`(=14回)連結し 268.8s(448拍) にして 128k mp3 へ**1回だけ**エンコード→
  `public/audio/dance-100.mp3` を差し替え。ビート間隔は**正確に600ms**・継ぎ目なし・**ロスレス由来(1世代)** で
  従来(128k由来)より高品質。先頭の約24msはmp3エンコード遅延の固定オフセット(ドリフトではない/ギャップレス再生＋
  自動アンカー＋定期リシンクが吸収)。コード変更なし(Lv1=BPM100=600の既定のまま)。前版v0.25.416の128kストレッチは破棄。

### 負荷 / 注意
- 1/10(素材差し替えのみ)。WAV(3.68MB)はコミットせず素材ブランチ正本のまま。最終mp3のみ commit。
- Lv2(dance-120-loop.wav=16.0s=32拍×500ms)/Lv3(dance-140-loop.wav=13.714s=32拍×428.57ms)も同手順で是正可能(未対応)。

### Verification
- `npm run build` 成功。dist の dance-100.mp3 を ffprobe 確認(再生上はギャップレスで実質600ms/拍)。実機確認待ち。

## 2026-06-16 - v0.25.416 - ダンス曲を正確な600ms/拍へリタイム + 定期リシンク (Claude Code)

### 変更（社長指示: 曲のBPMをキリよく / 既定値に / 重くせずズレないように）
- **調査**: オプションの「サークル間隔」入力は `danceTestInterval` で、`useGameLoop` の分岐により
  **練習モード時のみ**反映（本編プレイには未反映）と判明。新機能は足さず、下記方針に変更。
- **曲自体をリタイム**: `public/audio/dance-100.mp3` を ffmpeg `atempo=0.997143`(ピッチ保持)で 268.032s→268.8s に
  引き伸ばし、**正確に 600ms/拍(=100BPMちょうど)** へ。128k/48kで再エンコード（サイズはほぼ同じ4.30MB）。
- **既定値をクリーンに**: `RHYTHM_INTERVAL_MS_BY_LEVEL[1]` を 598.339→**0** に戻し、Lv1=BPM100=**600** が既定に
  （オプションの規定表示も自動で600）。
- **プレイ中の定期リシンク**（`useGameLoop` + `RHYTHM_RESYNC_MS=4000`/`RHYTHM_RESYNC_MIN_MS=6`）: アンカー後、
  数秒に1回だけ曲の実再生位置から位相ズレを測り、閾値(±6ms)を超えた分のみ最小補正（拍indexは不変・1拍未満）。
  毎フレーム同期はしないのでブルブルせず、負荷もほぼ0（数秒に1回 getDanceBeatAnchorMs + 必要時のみ set）。

### 負荷
- 1/10（rendering/simulation）。リシンクは数秒に1回・新規オブジェクト無し。曲は素材の差し替えのみ。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。ffprobe で per-beat≈599.95ms(=実質600)を確認。
  実機(ステージ1の四神舞ダンス)で通しでズレないか要確認。残差は定期リシンクが吸収する想定。

## 2026-06-16 - v0.25.415 - ステージ1ダンス: 実測テンポを焼き込み(累積ドリフト対策) (Claude Code)

### 変更（社長指摘: ステージ1の曲が噛み合わない・598付近）
- `dance-100.mp3` をフレーム解析（268.056s / 128kbps / 48kHz）。公称600ms(100BPM)では割り切れず、
  **448拍(=112小節ちょうど)で割り切れる 598.339ms(≒100.28BPM)** が真の1拍と判定（599.678/597.007 は小節割り不可）。
- `config/shijin.ts` に `RHYTHM_INTERVAL_MS_BY_LEVEL = [0, 598.339, 0, 0]` を追加し、Lv1 の既定をこの実測値に焼き込み。
  `rhythmIntervalForLevel` の優先順を「`?intN`(実機調整) > 焼き込み実測値 > 公称BPM算出」に。
- これで開始位相(自動アンカー v0.25.406)＋正確な1拍で、曲全体を通してサークルが追従するはず。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。実機(ステージ1/ダンス練習Lv1=既定598)で要確認。
  なお微調整は `?int1=598.3` 等で可能。Lv2/3 も同様に実測して焼ける(現状0=BPM算出)。

## 2026-06-16 - v0.25.414 - ダンス: ミラーボールの影削除 / フリック斬撃音オフ (Claude Code)

### 変更（社長指示）
- **ミラーボールのドロップシャドウを削除**（`pixiScene.syncRhythmOverlay`）。空中に吊られた演出なので地面影は不自然。
- **フリック(バッシュ)の斬撃音を無音化**（`useGameLoop.executeRhythmPending`、`playSfx('katana-dash')` を削除）。
  拍踏みのキックドラム(`dance-kick`)は従来どおり鳴らす。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。

## 2026-06-16 - v0.25.413 - 登場演出: ヘリをより上空から・横移動を更に半分 (Claude Code)

### 変更（社長指示）
- `PLAYER_INTRO_HELI_HIGH_Y` **300→420**（ヘリ飛来開始をもう少し上空から）。
- `PLAYER_INTRO_FLY_X` **450→225**（人間の横移動を更に半分）。着地点=ヘリ降下終点(-FLY_X)のため、
  ヘリ飛来距離(FAR_X−FLY_X)が 4050→4275 へ +225 自動延長。視覚(登場演出)のみ・ゲーム性影響なし。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。映像は実機(ステージ1登場シーン)で確認。

## 2026-06-16 - v0.25.412 - あらすじの置き場所を修正(一覧=1行/詳細=あらすじ→クリア後) (Claude Code)

### 変更（社長指摘: 置き場所が違う）
- `StageMission` を `summary`（一覧用1行）と `synopsis`（詳細用あらすじ・数行）に分離。
- **ステージ選択一覧**: 短い1行 `summary` に戻す（v0.25.408 相当のレイアウト: 地名/タイトル・エリア/1行）。
- **ミッション詳細の説明欄**: 未クリアは `synopsis`（社長提供のあらすじ）、**クリア後は `debrief`（クリア後の記録）** を表示。
- `briefing`/`voices`/`radio` はデータとして保持（ゲーム内導入向け。メニューでは未使用に）。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。

## 2026-06-16 - v0.25.411 - 登場演出: 着地距離を半分・ヘリ移動を延長 (Claude Code)

### 変更（社長指示）
- `PLAYER_INTRO_FLY_X` を **900→450**（人間の飛び降り着地距離を半分に）。着地点＝ヘリ降下終点(-FLY_X)のため、
  ヘリの飛来距離(FAR_X−FLY_X)が 3600→4050 へ自動的に +450 延長される。視覚(登場演出)のみ・ゲーム性に影響なし。

### 負荷
- 1/10（定数1つ。ランタイムコスト変化なし）。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。映像確認は実機（ステージ1登場シーン）で。

## 2026-06-16 - v0.25.410 - 規約追加: 応答ごとにバージョン明記 (Claude Code)

### 変更（社長指示: ルール化）
- `CLAUDE.md` の Versioning に「**チャット応答のたびに現バージョンを必ず明記する**」を追加（コード変更なし）。

## 2026-06-16 - v0.25.409 - ステージ選択あらすじを社長提供版に差し替え (Claude Code)

### 変更（社長提供のあらすじ本文）
- `StageMission.summary` を **複数行(string[])** に変更し、社長提供の「ステージ選択時あらすじ」を M1〜M7 + EX1/EX2 に反映。
- ミッション名(title)も最新表記へ更新: M1 救助任務 / M2 研究所再突入 / M3 リモート研究所 / M4 封鎖地域（M5以降は据え置き）。
- ステージ選択の各行は、見出し=ミッション名、補助=地名・エリア、本文=あらすじ複数行（未解放は伏せる）。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。

## 2026-06-16 - v0.25.408 - ステージ選択にメインミッション説明文を追加 (Claude Code)

### 変更（社長指示）
- `campaign.ts` の `StageMission` に **`summary`（1行の目的説明）** を追加し、M1〜M7 + EX1/EX2 に記入。
- ステージ選択一覧の各行に、解放済みステージは `summary` を表示（未解放は「前ステージのクリアで解放」）。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。

## 2026-06-16 - v0.25.407 - ストーリー/ステージ導線 + ミッション選択画面 (Claude Code)

### 変更（社長指示: ストーリー＆ステージをざっくり仕上げ＋導線整備）
- **キャンペーン本文をデータ化**（`src/data/campaign.ts`）: 社長提供の本編シナリオ **M1〜M7 + EX1/EX2** を
  ステージ/ミッションのデータとして格納（各メインの「ステージ開始前」「ステージクリア後」本文・無線SEの間・偵察兵の声）。
  地名(name/area)は文脈からの仮置き。**サブミッションは構造のみ（今は空＝準備中）**。キャラ職業データと
  サブウェポン一覧、資料室用の世界観/変異体図鑑もここへ集約（MainMenu から移設）。
- **進行解放**（`src/data/progress.ts`, localStorage のみ・ゲームロジック非依存）: メインミッションをクリアすると
  次ステージ解放。EX1=M7クリア / EX2=EX1クリアで解放。勝利時に `App` が選択中ステージをクリア扱いにする。
- **新しい導線（`src/components/MissionSelect.tsx`）**: ミッション選択(ホーム) → ステージ選択 → ミッション詳細
  (メインのブリーフィング＋サブミッション枠) → キャラ選択 → 装備選択(サブウェポン) → スタート。ホームから
  オプション / 武器開発 / 資料室 へ分岐。**MainMenu は役割を MissionSelect に置換し削除**（キャラカード等は再利用）。
- **装備選択**: サブウェポンを複数選んで保持（**今は記録のみ**。ゲーム付与は今後配線）。
- **テスト開発ツールをオプション内へ集約**（`src/config/devtools.ts` の `DEV_TOOLS_ENABLED`、既定ON / `?dev=0`で非表示）:
  **FPS/撃破数表示 on/off・ダンスモード(練習)・BENCH** を移植。加えて弾ドロップ率/弾薬箱取得量のデバッグ入力、
  導線テスト用の「全ステージ解放/進行リセット」。武器開発はスキルショップ（陳列レベル解放＋1000スクラップ）。

### 負荷スコア
- **1/10**（rendering/UI）。メニュー画面のみ。per-frame で変わる store フィールドは購読しておらず（設定値のみ）、
  HUD/ゲームループには触れていない。ゲームプレイは当面ステージ1の内容を全ステージで流用（後で差し替え）。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。UI見た目は仮（導線優先）。実機での画面遷移は確認待ち。

### 次にやること
- 各ステージのサブミッション本文と、ステージ固有のゲームプレイ（stageDirector のステージ別波/敵テーマ）差し替え。
- 装備選択の「開始時付与」をゲームロジックへ配線。地名(name/area)の確定。資料室UIの作り込み。

## 2026-06-16 - v0.25.406 - ダンス曲↔サークル 開始位相の自動アンカー (Claude Code)

### 変更（本命タスク: ダンス曲とサークルの開始位相ズレ）
- **自動アンカーを実装**。ダンス曲はメインBGM要素の `src` 差し替え→`load()`→`play()` の可変レイテンシ後に
  鳴り出すため、これまでの「ダンス開始時刻（`Date.now()`）基準」の固定ビートグリッドだと毎回ズレていた。
  曲が **実際に鳴り出した瞬間** にグリッド起点 `firstBeatAt` を最寄りのビート境界へ **1回だけ** スナップして
  位相を合わせる。毎フレーム同期はしない（音楽クロックの微ノイズでサークルが微振動する＝ブルブルを回避）。
- 仕組み:
  - `audioManager.getDanceBeatAnchorMs()`: いま鳴っているダンス曲の `currentTime=0` に対応する壁時計時刻
    （`Date.now() - bgm.currentTime*1000`）を返す。差し替え/ロード中・一時停止・先頭停止中は `null`
    （`bgmTargetDanceLevel!==0` / `!paused` / `readyState>=2` / `currentTime>0` でガード）。
  - `gameStore.setRhythmFirstBeat(firstBeatAt)`: `rhythm.firstBeatAt` だけ差し替える軽量アクション
    （`expectBeat`/`inputIndex` 等は触らない＝位相補正のみ）。
  - `useGameLoop`: リズム開始ごとに `rhythmAnchoredRef=false`。先頭ビートを消化する前（`expectBeat===0`）に
    アンカーが取れたら `gridBase = anchor + rhythmBeatOffsetForLevel(lvl)` に対し元の `firstBeatAt` を
    `Math.round` で最寄り境界へスナップ→ `setRhythmFirstBeat`。1回適用したら以後やらない。先頭ビートを
    過ぎてしまった場合（取得が遅れた）はスナップせず固定グリッドのまま継続（途中ジャンプ回避）。
- 残りの曲ごと固定ダウンビート補正は従来どおり `RHYTHM_BEAT_OFFSET_MS_BY_LEVEL`（`?bo1/2/3` で実機調整→焼き込み）。

### 負荷スコア
- **1/10**（rendering/simulation）。アンカー判定はリズム開始直後の数フレームのみ実行し、成立したら
  `rhythmAnchoredRef` で打ち切り。毎フレーム同期や新規オブジェクト/テクスチャ生成は無し。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。
- 音×映像の位相は自動テスト不可 → **実機（セレクト画面のダンス練習・自動タップON）で確認待ち**。
  ズレが残るなら `?bo1/2/3=ms`（正=遅らせる）で各レベルのダウンビートを詰めて既定へ焼く。

## 2026-06-16 - v0.25.388 - 鞭の視認性アップ(発光トレイル+フェード粘り) (Claude Code)

### 変更(社長フィードバック: 鞭が見えづらい)
- 鞭スイング時に軌道へ**明るい加算トレイル**(`trail` エフェクト・シアン)を重ねて発光(bloomで暗い画面でも映える)。軽量(1エフェクト)。
- 鞭スプライトのフェードを「前半は不透明維持→後半でフェード」に(速く消えて見えづらいのを緩和)。`drawWhipSprite` alpha。

### 調査メモ(鞭の破壊について)
- 鞭は既に `breakPropsAlong` を毎振り呼んでおり、**松明(torch HP12)・緑のmine(HP1)は破壊済み**(meleeDamage*2.5 ≈ 15-25 で足りる)。
- 破壊可能オブジェクトは torch/mine のみ(weapon-crate はピックアップで破壊対象外)。「手りゅう弾」に該当する破壊対象は現状コードに無い → 社長に要確認(別記)。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。鞭はサブ武器設置/装備時のみ出るため idle プレビュー未確認(描画コードは検証)。

## 2026-06-16 - v0.25.391 - START後に利用注意(同意画面) / 森下霧を fog-alpha(通常合成)に (Claude Code)

### 変更(社長指示)
- **利用注意(同意画面)を追加**: START → ご利用注意(⚠ 光/音/死戦闘描写/個人情報なし/開発中)を表示 → [同意して始める] → 音楽+ローディング→暗転→セレクト。
  `TitleScreen` を phase('idle'→'notice'→'loading'→'blackout')制に。注意書きは毎起動(タイトル到達ごと)表示。文面は社長提供そのまま。
- **森下霧を fog-alpha.png(アルファ透過版)に切替**: 加算(fog.png) → **通常合成(normal blend)**。素材の最大α~67%のため不透明度を上げる(`?fog` 既定 0.55→0.9)。
  pixiTextures の standalone を `fog`→`fog-alpha`(linear)に。mkFog の blend オプションを add/screen/normal の3択に拡張。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。Claude Preview: START→注意画面表示→同意→メニュー到達、ゲーム中に fog-alpha の霧描画を確認、console エラーなし。
- ※「くわしく(フル版)」は未実装(計画ファイル golden-crafting-hopcroft.md のフル版Aを使う場合は指示で着手)。大容量PNGはコミットせず(素材ブランチ正本)。

## 2026-06-16 - v0.25.390 - 森下霧を fog.png(加算)に置換 / タイトル流れを loading→暗転 に (Claude Code)

### 変更(社長指示)
- **森下霧を素材 fog.png に置換**(やまぎり手描き廃止): `public/sprites/fog.png`(黒背景+白霧)を **加算(add)合成・白tint**で森下レイヤーに。
  fog は非同期ロードのため `FogLayer.texKey='fog'` を追加し、sync 時に getTexture して割当+tileScale 確定。流れ/揺れは既存の霧システムのまま(特別なエフェクトなし)。
  pixiTextures の standalone に `fog`(linear)を追加。getFogBankTexture は不使用に(import削除)。
- **タイトルの流れを明確化**: START タップ → 音楽再生(BGM解禁) → **ローディング処理(スピナー+LOADING表示, ~1s)** → **ゆっくり暗転(1s)** → セレクト。
  `TitleScreen` を phase('idle'→'loading'→'blackout')制に。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。Claude Preview: STARTタップで LOADING 表示→暗転→メニュー到達、ゲーム中に fog.png の霧描画を確認、console エラーなし。
- 注: fog.png の背景は暗灰のため加算でごく僅かに霞が乗る。気になれば `fog-alpha.png`(透過版)+通常合成に切替可。
- ※大容量PNG はコミットせず(素材ブランチに正本・ローカル public/ に配置)。

## 2026-06-16 - v0.25.389 - 鞭でスキルの手榴弾を起爆できるように (Claude Code)

### 変更(社長確認: 「手りゅう弾」=スキルの手榴弾)
- 通常近接(ナイフカウンター)は手榴弾を起爆するが、鞭/刀モードは早期returnで起爆しなかった。
- 鞭ブランチに、**鞭の当たり範囲(線カプセル WHIP_HIT_HALF_WIDTH)内の手榴弾を即起爆**する処理を追加(通常近接と同じく createdAt を寿命切れにして爆発+spawnSlash)。チャージ有無に関わらず毎振り。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。鞭+手榴弾の同時条件は idle プレビューで再現困難 → 実機確認推奨。

## 2026-06-16 - v0.25.387 - START後にゆっくり暗転→セレクト / 無線SEを実音(合成)に (Claude Code)

### 変更(社長指示)
- **START タップ後の遷移**: タップ瞬間に BGM 解禁(unlockDanceAudio + setBgmScene('menu'))→ `TitleScreen` が **ゆっくり暗転(1.4s)+LOADING表示** →
  暗転し切ったら(transitionend / 1.6s フォールバック)メニュー(セレクト)へ。`onStart`/`onDone` の2コールバックに分離。
- **無線SE を実音化**: 会話の `［無線SE…］` テキストを廃止し、`__radio__` 行を **無発話の「間」(holdMs=1500)**に。
  `audioManager.playRadioStatic()`(ホワイトノイズ+バンドパス+途切れエンベロープの合成。アセット不要)を `IntroDialogue` がその間に1回だけ再生。
  行に `holdMs?` を追加し、表示タイミングと `INTRO_DIALOGUE_TOTAL_MS` の計算を上書き対応。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。Claude Preview: STARTタップ→暗転→メニュー到達を確認、
  会話で「無線SE」テキスト非表示(=間+音に置換)・他行表示を確認。console エラーなし(無線音は合成・ヘッドレスでは可聴確認不可)。

## 2026-06-16 - v0.25.386 - ショットガン改名 / ステージ1冒頭会話を差し替え (Claude Code)

### 変更(社長指示)
- 武器名 **ソードオフ → ショットガン**: `weaponUtils` shotgun-t1 の name、`MainMenu` ヘビーガンナーの gear 表記。HUD/拾得テキストも自動反映。
- **ステージ1冒頭会話を差し替え**(`INTRO_DIALOGUE_LINES`): 通信兵3行 → 無線SE(ノイズ) → 偵察兵2行(救助任務の導入)。
  `IntroDialogue` に `__radio__`(中央寄せ・かすれ等幅のSEト書き)分岐を追加、偵察兵は赤系(切迫した別声)で表示。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。Claude Preview: メニュー/HUDが「ショットガン」表示・「ソードオフ」消滅、
  登場会話で 通信兵/無線SE/偵察兵 の全行表示を確認。

## 2026-06-16 - v0.25.385 - タイトル画面(START タップ待機)を追加=BGM自動再生制限の対策 (Claude Code)

### 変更(社長指示: ローディング後、タイトル画面に「START」でタップ待機)
- 新 `GameState 'title'` + `TitleScreen.tsx`(背景=the ONE 全面・「START」点滅+「画面をタップして開始」)。
- フロー: loading → **title(START待機)** → タップ → menu。`App.tsx` boot を `setGameState('title')` に。
- START タップ(=最初のユーザー操作)で `unlockDanceAudio()` + `setBgmScene('menu')` を呼んでから menu へ → **タイトルBGMがその瞬間から再生**(Webの自動再生制限は最初の1タップが必須なので、ここで取得)。
- BGMシーン: title=off(無音=操作前) / menu=タイトル曲 / playing=ステージ曲。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。Claude Preview: タイトル表示→STARTタップ→メニュー遷移を確認。

## 2026-06-16 - v0.25.384 - タイトル/ローディング背景画像 + 自動タレットをスプライト化 (Claude Code)

### アセット(社長が material ブランチに用意 → git show で取得・ローカル配置)
- `public/backgrounds/title-the-one.png`(タイトル/ローディング兼用・全面)
- `public/sprites/turret-fixed.png`(前方集中/定点)・`public/sprites/turret-omni.png`(全方位) ※背景が紫ベタ(未透過)

### 変更
- **タイトル/ローディング背景**: `MainMenu` と `LoadingScreen` の最外 div に title-the-one.png を cover で敷く(暗幕グラデで可読性確保)。
- **自動タレットをスプライト化**: `drawTurret` を Graphics手描き → スプライト描画に。
  - 前方集中=`turret-fixed` を**照準(`p.direction`)へ回転**(art は砲身が下向き基準 → `rotation = atan2(-dx, dy)`)。スキャンで照準が更新されるので回る。
  - 全方位=`turret-omni` を回転なし。テクスチャ未読込時は従来の手描きにフォールバック。
  - モード切替リングはオーバーレイ Graphics で維持。
- **紫背景の透過キー**: `pixiTextures` に `loadKeyed`(左上隅の色を基準に tol=80 で透過)を追加し turret-fixed/omni をキー処理して登録。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。Claude Preview でタイトル背景表示を確認、3アセット配信 HTTP 200、boot色キー読込で warn/error なし。
  タレット本体はサブ武器設置時に表示(棒立ちプレビューには出ない)→ 設置時に要目視。
- ※大容量PNG(計~6.5MB)はコミットせず(素材ブランチに正本)。ローカル public/ に配置済みで dev 配信。

## 2026-06-16 - v0.25.383 - 霧をさらに横へ引き伸ばし (Claude Code)

### 変更(社長フィードバック)
- 全霧層の `widthFrac 1.6 → 2.2`(texture を横ストレッチ。雲/山がさらに横に広がる)。

### Verification
- `npm run build` 成功。dev 再起動・LAN 200。

## 2026-06-16 - v0.25.382 - 死神: 0.9倍速+回り込みワープ / 近接が効くよう修正 / 帰還で退去 (Claude Code)

### 変更(社長フィードバック)
- **追跡を 0.9倍速+ワープ回り込みに変更**(前の0.5→1.2ランプは撤回): `chaseSpeedMult=0.9`(慣性は既存どおり)。
  `warpIntervalMs=4000` ごとにプレイヤーの上下左右いずれか(多少ランダム)へ `warpDistPx=520` でワープして挟み込む(ワープ時 vx/vy=0)。
- **退去条件をスタート帰還に変更**: プレイヤーが原点から `homeRadiusPx=900` 内へ戻ると死神は去る(リスク0へ)。旧 escapeDistance は撤去。
- **近接が効くよう修正(重要バグ)**: 近接(鞭/刀/カウンター)3箇所が `type==='reaper'` を一律スキップしていた → `&& !reaperChaser`
  に変更し、**深奥チェイサーだけは通常の敵(ボス級)として近接が効く**(isBossType経由=5倍ダメージ・即死不可)。通常reaper(召喚レア/終端)は従来どおり除外。

### 補足(質問回答)
- 死神(チェイサー)HP = 6000(有限=極まれば討伐可)。横切りはHPなし(演出のみ)。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。dev 再起動・LAN 200・console エラーなし(`?reapertest=1`)。

## 2026-06-16 - v0.25.381 - 死神: 進行方向の画面外から出現 / 引き離すと消える (Claude Code)

### 変更(社長フィードバック)
- **出現を進行方向の画面外から**: 完全出現の spawn をランダム角 → **プレイヤーの進行方向(速度→なければ最終向き→idleは上)**へ
  `spawnDistFromPlayer=780`(画面外)で配置。前方から迫る。
- **引き離すと消える**: 追跡中、プレイヤー↔死神の距離が `escapeDistancePx=1250` を超えたら死神を despawn(=画面外へ逃げ切り)。
  リスクは0へクールダウン(深奥に留まれば再蓄積→再出現)。ランプ序盤(0.5倍)やダッシュ/移動ビルドで逃走可能。
- 補足: 死神(チェイサー)の **HP=6000**(高いが有限=極まれば討伐可)。横切りはHPなし(演出のみ)。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。Claude Preview `?reapertest=1` で起動・console エラーなし。

## 2026-06-16 - v0.25.380 - 死神: 横切りを進行方向側に+被写界深度/追跡速度ランプ、タイトル曲配置 (Claude Code)

### 死神(社長フィードバック2点)
- **横切りを進行方向側に配置**(`useGameLoop` で player の速度→向きから判定):
  上=上部奥を横断(小さく)/ 下=下部手前を横断(大きく)/ 右=右側を縦断 / 左=左側を縦断。`reaperCross` に axis/band/dir/scale を持たせる。
- **被写界深度を乗せる**: 横切りスプライトを uiLayer → **world 内(`reaperCrossLayer`、actorLayer 前)**へ移し、tilt-shift DoF が乗るように。
  レイヤーは毎フレ画面へピン留め。奥=小スケール・上帯(ボケ)、手前=大スケール・下帯。
- **追跡速度ランプ**: 出現直後は `player.speed × 0.5`、**10秒かけて smoothstep で ×1.2 までフェードイン加速**(`getReaperRampedSpeed`)。
  慣性は既存の updateEnemies チェイス inertia がそのまま(他の敵と同じ)。出現直後の即死緩和にもなる。

### タイトル曲
- 社長が GitHub ブランチ `claude/zombie-material-handoff-chat-13tpmh` の `public/audio/the-lay-of-ruin.mp3` を用意 → `git show` で取得し
  ローカル `public/audio/title.mp3`(4.16MB)へ配置(Drive base64 制約を回避)。dev で HTTP 200 配信確認。実機の初回タップでメニュー再生。
  ※ 4MB バイナリは本コミットには含めない(リポジトリ肥大回避。素材ブランチに正本あり)。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。Claude Preview の `?reapertest=1` で追跡(ランプで生存時間が延びる)・接触を確認、
  title.mp3 配信(HTTP 200/audio/mpeg)確認。console エラーなし。横切りの一瞬フレームは未キャプチャ(描画コードは検証済み)。

## 2026-06-16 - v0.25.379 - 死神(深奥リスク)システム v1 実装 (Claude Code)

### 概要(仕様: repo ルート reaper_spec.md)
無限マップで原点(スタート/商人付近)から遠いほど死神が画面を横切り、深奥に長居すると完全出現してプレイヤーを追跡する。既存 `reaper` 敵(召喚レアと同じ黒い絵)を流用。BGM変更なし。v1範囲のみ実装。

### 実装
- **config**: `src/config/reaper.ts`(`REAPER_CONFIG` 距離閾値px・横切り間隔・リスク・追跡速度・接触ダメージ等 / `getReaperMoveSpeed` / `reaperPassIntervalMs` / `?reapertest=1` テストモード)。
- **フェーズ管理**: `useGameLoop` に `reaperRef`(risk/lastPassAt/passCount/chaserId)+毎フレ manager。原点からの距離 depth で:
  warning(≥1200px)→ 横切り、frequent(≥2200)→ 頻発、spawnRisk(≥3200)/extreme(≥4400)→ リスク蓄積、リスク100で完全出現。
  深奥外ではリスク減衰。新ラン(gameTime rewind)で reset。
- **横切り(無害)**: `store.reaperCross` をセット → `pixiScene` が画面横断する黒シルエット(uiLayer最下層・当たり判定/オートエイム対象外)を描画。
- **追跡(本物の敵)**: `spawnEnemyAt('reaper')` をプレイヤーから 620px 離して1体。`reaperChaser` フラグ・HP6000(有限=討伐可)・接触9999・
  速度=毎フレ `player.speed × 1.2`(成長反映・ダッシュ等は除外)。既存のチェイスAI/接触ダメージ/被弾/カリング保護(type==='reaper')を流用。
  討伐/消滅でリスク0へクールダウン(深奥に居続ければ再蓄積)。
- 型: `Enemy.reaperChaser?`、store `reaperCross` 追加。

### v1の範囲外(後回し)
専用BGM/専用SE(アセット未配置=現状無音。`playSfx('reaper-pass')` フックのみ)/複雑な討伐報酬/専用UI・カットイン/トレジャー・ボス接近によるリスク増加。

### 負荷スコア
1/10(距離計算+横切り1スプライト+追跡1体。新規の重い処理なし)。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。Claude Preview の `?reapertest=1` で完全出現→追跡→接触→ゲームオーバー(「闇に飲み込まれました」)を確認。console エラーなし。通常プレイは原点付近では出現しない(深追いで発生)。
- 実機テスト用URL: `http://192.168.11.17:5173/zombie/?reapertest=1`(常に深奥扱い)。通常は深く進むと自然発生。

## 2026-06-16 - v0.25.378 - タイトル曲(メニューBGM)を配線(ファイル設置待ち) (Claude Code)

### 変更(社長指示: 「the RUIN of LAY」をタイトル曲に)
- Drive 素材フォルダに同名ファイルは無く、本日追加の音声は「Ruined Heartbeat」2つ。社長が **Ruined Heartbeat (1).mp3 (4.2MB)** を選択。
- BGM を画面シーンで切替える方式に: `audioManager` に `TITLE_TRACK`(`public/audio/title.mp3`)・`bgmBaseTrack`・`setBgmScene('menu'|'game'|'off')` を追加。
  `applyDanceAudio` の非ダンス基準曲を `BGM_TRACKS[0]` 固定 → `bgmBaseTrack` に。menu=タイトル / playing=ステージ / 他=停止。
- `App.tsx`: gameState で `setBgmScene` を呼ぶ(menu/playing/off)。`MainMenu`: 自動再生制限対策で初回 pointerdown に `setBgmScene('menu')`。
- **未配置**: `public/audio/title.mp3` 本体。4.2MB バイナリは Drive MCP(base64)では文脈に載らず取り込めない(stage2-4 BGM が「Driveにあるが未配置」なのと同じ制約)。
  → 社長が Drive の「Ruined Heartbeat (1).mp3」を `C:\Users\tanity\zombie\public\audio\title.mp3` として保存すれば、メニューで自動再生(無い間は無音・クラッシュなし)。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。ファイル設置後に実機でタイトル再生を確認予定。

## 2026-06-16 - v0.25.377 - 霧全般を横に引き伸ばし(山のとんがり軽減) (Claude Code)

### 変更(社長フィードバック)
- 全霧層の `widthFrac 1.2 → 1.6`(tileScale.x が上がり texture を横ストレッチ)。山/雲が横に広がり、とんがりがなだらかに。縦は不変。

### Verification
- `npm run build` 成功。Claude Preview で確認。console エラーなし。

## 2026-06-16 - v0.25.376 - 霧を「離散した雲の個体」に+奥を上へ(ブルーム発光の白い塊を解消) (Claude Code)

### 変更(社長フィードバック)
- 「一部だけ強いハイライト」の正体 = 奥霧(filteredWorld内=ブルーム対象)が重なって閾値0.45を超え発光していたもの。
- 雲テクスチャ `getFogTexture` を連続帯 → **離散した雲の個体(K=3、間に隙間)**に。重なり減でブルーム発光も解消。横タイル維持。
- `getFogBankTexture`(森下)も山を離散化: N `9→6`、valley `0.50→0.62`(山の間は薄い)、裾 `wd` を狭めて山どうしを離す。
- 奥をもう少し上: `yFrac 0.24 → 0.16`。

### Verification
- `npm run build` 成功。Claude Preview で確認: 白い強ハイライト消失/奥が上+離散の雲/シャフトがクリア。console エラーなし。

## 2026-06-16 - v0.25.375 - 銃のリザーブ弾プール上限を変更(handgun72/shotgun18/rifle36) (Claude Code)

### 変更(社長指示: 最大弾数)
- `AMMO_MAX`(リザーブ弾プールの上限。HUDの「装填/プール」のプール側)を変更: handgun `240→72` / shotgun `96→18` / rifle `60→36`。
- `AMMO_INITIAL.shotgun` を `40→18` に(新上限を超えないように。handgun60≤72 / rifle24≤36 は据え置き)。
- 注: magSize(マガジン装填数=12/3/6 等)は別物で未変更。AMMO_PICKUP(40/10/20)は各上限内なので問題なし。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。Claude Preview の HUD で「ソードオフ 0/18」=shotgunプール上限18を確認。console エラーなし。

## 2026-06-16 - v0.25.374 - 奥を薄く / 森下を少し上へ(下端は隙間なし) (Claude Code)

### 変更(社長フィードバック)
- 奥を薄く: `?fogback` 既定 `0.85 → 0.65`。
- 森下を少し上へ: `yFrac 0.88 → 0.80`。スプライト下端(yFrac+heightFrac/2=1.275h)は画面外まで伸びるので下に隙間は出ない(Preview実測で確認)。

### Verification
- `npm run build` 成功。Claude Preview で確認(奥が薄い・森下が少し上・下端の隙間なし)。console エラーなし。

## 2026-06-16 - v0.25.373 - 森下の山を浅め+ランダムに (Claude Code)

### 変更(社長フィードバック: 山が鋭すぎる → 浅め+ランダム感)
- `getFogBankTexture()` の山生成: 振幅 `0.14〜0.36h → 0.05〜0.23h`(浅め+ばらつき)、裾 `0.85〜1.5 → 1.0〜1.9`(広く=なだらか)、
  間隔ジッタ `±0.40 → ±0.70`(ランダム感)、N `8 → 9`。横タイル(±w周期)は維持。

### Verification
- `npm run build` 成功。テクスチャ単体(チャットwidget)で浅め+ランダムを確認。dev 再起動。console エラーなし。

## 2026-06-16 - v0.25.372 - 霧を全層「右へ流れる+揺らめき」に(TilingSprite横スクロール) (Claude Code)

### 変更(社長フィードバック: 霧は全部、揺らめきながら右へ流れていく)
- 霧3層を Sprite → **TilingSprite** 化し、`tilePosition.x` を右へ流す(`flow` px/ms)+横の揺らめき(sin)。縦は位置 bob で揺らめき。
  - flow: 奥 0.012 / 森下 0.030 / 森上 0.020(px/ms。`?fogspd` 倍率)。
- テクスチャを**横方向に継ぎ目なくタイル可**に: `getFogTexture` は各パフを ±w にも描画、`getFogBankTexture` は ridge を ±w 周期化。
- 位置/サイズは従来同様(anchorは使わず top-left 計算で中央配置)。`tileScale` は帯にテクスチャ1枚がちょうど収まる値(横1/縦1)。
- レイヤー深度(奥=world / 森下=frontForest後ろ / 森上=最前面)は v371 のまま。

### 負荷スコア
0〜1/10(TilingSprite 3枚・tilePosition更新のみ)。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。Claude Preview で描画/エラー無しを確認(流れは動作のため静止画では出ない)。

## 2026-06-16 - v0.25.371 - 森下を front forest の後ろレイヤーへ移動(森が手前で隠す) (Claude Code)

### 変更(社長指摘: 森下は本当に森の下(後ろ)レイヤーにいる? → いなかった)
- v363 の再編以降、森下は frontBankLayer(uiLayer=front forest より前=最前面)にいた=森の手前だった。
- 新コンテナ `forestUnderLayer` を **stage の frontForest 直前**に挿入し、森下(やまぎり)をそこへ移動。
  stage順: `worldGroup(player) → forestUnderLayer(森下) → frontForest → uiLayer(森上)`。
  = 森下はプレイヤーより前・front forest より後ろ(森が手前で霧を隠す)。
- 森上は uiLayer 最前面のまま(手前の森に被る、の定義どおり)。位置/濃さ/揺れは v370 のまま。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。Claude Preview で確認(森下が前景森の後ろに)。console エラーなし。

## 2026-06-16 - v0.25.370 - 森下を薄く+揺れを速く (Claude Code)

### 変更(社長フィードバック)
- 森下(やまぎり)を薄く: `?fog` 既定 `0.90 → 0.55`。
- 揺れを速く+振幅を少し戻す: `ampY 3 → 9` / `ampX 22 → 26` / `spdX,spdY 0.0003 → 0.0008`。
- 位置(yFrac 0.88)は据え置き。奥は検証濃さ 0.85 のまま(基準=0.45)。

### Verification
- `npm run build` 成功。Claude Preview で確認(薄くなった/位置据え置き)。console エラーなし。

## 2026-06-16 - v0.25.369 - 森下をかなり下げる(稜線が下端から覗く) (Claude Code)

### 変更(社長フィードバック・少しずつ調整の1手目)
- 森下(やまぎり)の位置をかなり下へ: `yFrac 0.52 → 0.88`。霧は画面下〜下端、プレイヤーはその上に出る。

### Verification
- `npm run build` 成功。Claude Preview で確認。console エラーなし。

## 2026-06-16 - v0.25.368 - 森下テクスチャを「連なる山の稜線」に作り直し (Claude Code)

### 変更(社長フィードバック: 森下を山が連なってる感じに)
- `lighting.ts` `getFogBankTexture()` を再設計: 丸い瘤の連なり → **連続した尾根(リッジ)**。8個の raised-cosine の山を重ね
  (谷は底まで落とさない=山が繋がる)、稜線の下を各列の縦グラデ(上端フェザー+下ほど濃い)で塗る。
- 位置/濃さは v367 のまま(yFrac 0.52 / heightFrac 0.95 / 検証濃さ ?fog=0.90)。
- 注: ゲーム内は現在の濃さ(0.90)が厚く稜線がやや潰れる。山並みを強調するなら濃さ↓ or 位置↑で稜線を暗部に出す。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。テクスチャ単体(チャットwidget)で連なる山を確認。Claude Preview のゲーム内も確認。console エラーなし。

## 2026-06-16 - v0.25.367 - 森下霧: 濃い上端をプレイヤーの足元に固定(足元に溜まる地面霧) (Claude Code)

### 変更(社長フィードバック: 下げる指示なのに位置が上にずれていく → 上端を足元に固定したい)
- 原因: yFrac を上げる(=下げる)と濃い本体が画面外へ沈み、薄い上部だけ残って「上にずれた」ように見えていた。
- 対応: 森下(やまぎり)の**濃い本体の上端=プレイヤーの足元**に来るよう実測で配置。`yFrac 0.98→0.52`・`heightFrac 0.70→0.95`
  (本体が足元〜画面下を覆う)。`ampY 16→3`(ほぼ静止=位置が動いて見えない)。
- 濃さは前回の検証値(森下 `?fog=0.90` / 奥 `?fogback=0.85`)のまま。基準(戻り)値=森下0.52/奥0.45は [[zombie-fog-baseline-densities]] と
  コード `★お試し` コメントに控え。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。Claude Preview で実測確認(濃い上端が足元、下まで充填、位置固定)。console エラーなし。

## 2026-06-16 - v0.25.366 - スモッグ濃さ検証(奥/森下を「めっちゃ濃く」) (Claude Code)

### 変更(社長: 現状の濃さを覚えつつ、めっちゃ濃くして見たい)
- お試しで濃く: 奥 `?fogback 0.45 → 0.85` / 森下 `?fog 0.52 → 0.90`。
- **戻り値(現状の良かった濃さ)をコード/メモリに控え**: 奥=0.45 / 森下=0.52(コメント `★お試し` 参照)。
- 注: 森下は `yFrac 0.98` と低く本体が画面外なので、濃く見えるのは主に山の上端。本体濃度を見るなら森下を上げる。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。Claude Preview で確認(奥が大幅に濃い)。console エラーなし。

## 2026-06-16 - v0.25.365 - スモッグ微調整2(奥=さらに上 / 森下=さらに下) (Claude Code)

### 変更(社長フィードバック)
- 奥: `yFrac 0.32 → 0.24`(さらに上)。
- 森下霧(やまぎり): `yFrac 0.90 → 0.98`(さらに下)。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。Claude Preview で確認。console エラーなし。

## 2026-06-16 - v0.25.364 - スモッグ微調整(奥=上へ / 森下=下へ / 森上=薄く) (Claude Code)

### 変更(社長フィードバック)
- 奥: もうちょい上。`yFrac 0.40 → 0.32`。
- 森下霧(やまぎり): もうちょい下。`yFrac 0.82 → 0.90`。
- 森上霧: もうちょい薄く。`?fogbg` 既定 `0.45 → 0.32`。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。Claude Preview で確認。console エラーなし。

## 2026-06-16 - v0.25.363 - スモッグ層を再定義(奥 / 森下やまぎり=プレイヤーに少し被る / 森上=手前の森に被る) (Claude Code)

### 変更(社長フィードバック・層の再定義)
- 上部horizon霧を廃止し、3層を以下に再構成:
  - **奥**: world 内(キャラの後ろ)。遠景〜地面に被る背の高い霧。`yFrac 0.40` / `heightFrac 0.85` / `?fogback=0.45`。
  - **森下霧(やまぎり)**: 最前面(frontBankLayer)。プレイヤーより下で、**山の上端が少しだけプレイヤーに被る**位置。
    `yFrac 0.82` / `heightFrac 0.70` / `ampY 16` / `?fog=0.52`。
  - **森上霧**: 最前面・最下部。**手前の森に被る**低い霧。`yFrac 1.06` / `heightFrac 0.46` / `?fogbg=0.45`(getFogTexture)。
- レイヤー親: 奥=bgCloudLayer(world)、森下霧+森上霧=frontBankLayer(uiLayer 最前面)。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。Claude Preview のゲーム本編で確認:奥が遠景+地面/森下が
  プレイヤー下で少し被る/森上が最下部の森に被る。console エラーなし。

## 2026-06-16 - v0.25.362 - スモッグ位置/濃さ微調整(遠景=下げ / 森上=濃く / 森下やまぎり=さらに下げ森と被る) (Claude Code)

### 変更(社長フィードバック)
- **遠景霧(=奥)**: もう少し下へ。`yFrac 0.52 → 0.62`。
- **森上手前霧(=画面上部)**: もっと濃く。`?fogbg` 既定 `0.30 → 0.48`。
- **森下手前霧(=最前面やまぎり)**: もっと下げて森と被る位置へ。`yFrac 1.00 → 1.13`、`ampY 40 → 28`(下がった分、山の上下は控えめ)。
- ※対応(社長用語→実装層): 遠景霧=奥(中景・world内) / 森上手前霧=上部(world内) / 森下手前霧=最前面やまぎり(uiLayer)。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。Claude Preview のゲーム本編で確認:上部が濃く/奥が下がり/やまぎりが最下部の森に被る。console エラーなし。

## 2026-06-16 - v0.25.361 - スモッグ: 奥を遠景+地面に濃く / 手前下をやまぎりカット(山がたまにプレイヤーに被る) (Claude Code)

### 変更(社長フィードバック)
- **奥**: world 内(キャラの後ろ)に「遠景〜地面に被る背の高い霧」を配置し**濃く**。`yFrac 0.52` / `heightFrac 0.80` /
  `?fogback=0.55`(既定濃いめ)。森上とは別の2枚目として bgCloudLayer に追加。
- **手前下(やまぎりカット)**: 最前面(frontBankLayer)を**山の稜線シルエットの霧**に。`lighting.ts` に `getFogBankTexture()` を追加
  (下が厚い本体+上が rounded humps の山稜線)。**濃く**(`?fog=0.62`)し、`ampY=40`・遅い `spdY`(周期≈24s)で
  **たまに山部分がプレイヤーに少し被る**。
- **森上の霧**: 変更なし(`yFrac 0.12` / `?fogbg=0.30`)。
- レイヤー整理: 旧「front forest 下の薄霧(fgCloudLayer)」は廃止し、3層=森上 / 奥 / 手前下 に再編。
- URL: `?fog`(手前下やまぎり)/ `?fogback`(奥)/ `?fogbg`(森上)/ `?fogspd`(揺れ速さ)。各0で無効。

### 負荷スコア
0〜1/10(霧スプライト3枚・sin揺れのみ。フィルタ/粒子なし)。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。Claude Preview のゲーム本編で確認:
  奥が遠景+地面に濃く乗る/森上は据え置き/手前下が山稜線で揺れる。console エラーなし。

## 2026-06-16 - v0.25.360 - スモッグを「各層1枚をゆらゆら」方式に簡素化(オクトラ準拠) (Claude Code)

### 変更(社長相談: オクトラは枚数を増やさず、各層1枚をゆらゆらさせてるだけ)
- 雲スプライトを多数ドリフトさせる方式(計18枚)を廃止し、**各レイヤー1枚ずつ(計3枚)の幅広もくもく霧**を
  ゆっくり sway(上下左右に微小オシレート)させるだけに簡素化。ドリフト/ラップ撤去。
- `lighting.ts` `getFogTexture()`: 単一パフ → **幅広の帯状もくもくテクスチャ**(1024×320、30パフを横全幅に散らし
  上下は透明にフェード=連続した霧バンク)に変更。
- `pixiScene.ts`: 3層(奥=上部/ front forest下 / 最前面バンク)それぞれに1枚を配置。`widthFrac>1` で画面より広く伸ばし
  揺れても端が出ない。各層は `ampX/ampY`(振幅)・`spdX/spdY`(速さ)・位相で sin 揺れ。奥は world 内でカメラ追従打ち消し。
- URL は据え置き: `?fog`(最前面)/ `?fogsub`(forest下)/ `?fogbg`(奥上部)/ `?fogspd`(揺れの速さ)。

### 負荷スコア
0〜1/10(霧スプライト3枚・sin計算のみ。フィルタ/粒子なし)。前方式(18枚)よりさらに軽量。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。Claude Preview のゲーム本編で確認:
  下部に連続ソフト霧バンク+上部に薄霞、中央クリア、ゆらゆら sway。console エラーなし。

## 2026-06-16 - v0.25.359 - スモッグを参考HD-2Dに寄せ3層化(最前面の分厚いバンク追加) (Claude Code)

### 変更(社長の参考画像 public/references/reference-field-hd2d.png / reference-battle-hd2d.png に準拠)
- 参考は「**画面下部の分厚い白青もくもく霧バンクが最前面**(柵より手前)+ 中景〜奥は大気の霞」。これに合わせて霧を**3層**に。
  - **最前面バンク `frontBankLayer`**(主役): `uiLayer` の grade 上・vignette 下(=front forest より前=最前面)。
    下端に密集(yFrac 0.92〜1.12)・大きい(scale 2.2〜3.4)・濃いめ(`?fog=0.50`)。社長選択の「二層」に対応。
  - **front forest 下の薄霧 `fgCloudLayer`**: 据え置き(`?fogsub=0.22`)。下部の森が手前で隠す。
  - **奥・上部の薄い霞 `bgCloudLayer`**: 弱め(`?fogbg=0.30`。参考は上部が暗いので控えめ)。
- 霧色を参考の白青に寄せて明るめへ(`FOG_TINT` 0xaebfce→0xb8ccdd)。雲テクスチャを「もくもく」化(PUFFS 9→13・コア濃度↑・中間ストップ追加)。
- 各帯は同方向・近速度でまとまって流れる(前回の方針を踏襲)。グループ構成は `groups[]` 設定で管理、resize はグループ別に x 分散。
- URL: `?fog`(最前面バンク)/ `?fogsub`(forest下)/ `?fogbg`(奥上部)/ `?fogspd`(速さ)。各0で無効。

### 負荷スコア
1〜2/10(雲スプライト計18枚=18ドロー。フィルタ追加なし)。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。Claude Preview のゲーム本編で参考と並べて確認:
  下部に明るい白青の分厚いもくもくバンク+上部に薄霞、中央クリア。console エラーなし。
- 参考画像は branch `claude/zombie-material-handoff-chat-13tpmh` の `public/references/` にあり(本ブランチには未取り込み)。

## 2026-06-16 - v0.25.358 - スモッグを上下の帯(サンドウィッチ)に・手前霧をfront forestの下へ (Claude Code)

### 変更(社長フィードバック: Y を狭めて帯に、X はまとまって、中央くっきり帯を上下から挟むサンドウィッチ)
- **Y を狭い帯に集約**(`pixiScene.ts` makeCloud の yFrac):
  - 奥(bg)= 画面上部の帯 `yFrac 0.05〜0.24`(地平の木立沿い)。
  - 手前(fg)= 画面下部の帯 `yFrac 0.80〜1.04`。
  - 中央のくっきり帯(tilt-shift sharp band ≈0.46)は空け、大きめの雲が上下から少しだけ被る=サンドウィッチ。
- **X はまとまって流れる**: 同じ帯は**同方向・近い速度**に統一(奥=右へ `vx 8〜14` / 手前=左へ `vx -16〜-26`)。
  ランダム逆走をやめ、群れが散らばらず帯として一体に動く。雲を大きく(奥 scale 0.7〜1.4 / 手前 1.6〜2.6)+枚数増
  (`FOG_BG_COUNT 6→7` / `FOG_FG_COUNT 4→5`)で横に重なり連続した帯に。
- **手前の霧を front forest(下部の森)より下のレイヤーへ**: `fgCloudLayer` を uiLayer から **stage 直下の frontForest 直前**へ移動
  (`worldGroup < fgCloudLayer < frontForest < uiLayer`)。下部の森が手前で霧を隠す。
- 既定濃さは据え置き(`?fogbg=0.38` / `?fog=0.34` / `?fogspd=1`)。

### 負荷スコア
1/10(雲スプライト計12枚。フィルタ追加なし)。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。Claude Preview のゲーム本編で確認:
  上部に奥の霧バンク+下部に手前の霧、中央クリアのサンドウィッチ。console エラーなし。

## 2026-06-16 - v0.25.357 - スモッグを全面ベタ→「雲の塊」が奥/手前を泳ぐ方式に作り替え (Claude Code)

### 変更(社長フィードバック: 全面にかけたいのではなく、オクトラの森のように雲の塊を手前と奥で泳がせたい)
- 全画面ベタ塗りの霧(TilingSprite veil)を**廃止**し、**離散したソフト雲スプライト**を奥と手前に数枚ずつ漂わせる方式へ。
  - `lighting.ts` `getFogTexture()`: タイル可能ベタ霧 → **不規則なソフト雲パフ1枚**(360×200、縁は完全透明)に作り替え。コア濃度を上げて塊として読めるように。
  - `pixiScene.ts`: 雲レイヤー2枚を追加。
    - **奥 `bgCloudLayer`**: `world` 内 `actorLayer` 直前(=キャラの後ろ・遠景の前)。filteredWorld 内で tilt-shift/envtint が乗り遠くでボケる。
      world内なので camera/shake を打ち消して画面ピン留め。小さめ・遅い・上方(yFrac 0.16〜0.56)。`FOG_BG_COUNT=6`。
    - **手前 `fgCloudLayer`**: `uiLayer` 内 grade の上・vignette の下(=front forest より前=最前面)。大きめ・速い・下方(yFrac 0.55〜1.05)。`FOG_FG_COUNT=4`。
  - 各雲: 時間で横へドリフト(左右ランダム)、画面外でラップ、わずかに上下 bob。screen 合成・寒色 tint(`0xaebfce`)。
- 既定濃さ: 奥 `?fogbg=0.38` / 手前 `?fog=0.34` / 速さ `?fogspd=1`(各0で無効化)。
- 旧 v0.25.355/356 の全面 veil 実装(bgFog/fullFog TilingSprite・パララックス/ドリフト定数)は撤去。

### 負荷スコア
1/10(雲スプライト計10枚=10ドロー。CPUは線形ループのみ、フィルタ追加なし)。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。Claude Preview でゲーム画面を目視確認(全面veil消失、奥の地平に霞+手前に雲の塊が漂う)。console エラーなし。

### 調整候補
- 枚数 `FOG_BG_COUNT`/`FOG_FG_COUNT`、濃さ `?fogbg`/`?fog`、速さ `?fogspd`。塊をもっと大きく/くっきりは texture コア濃度 or scale を上げる。色味は `FOG_TINT`。

## 2026-06-16 - v0.25.356 - スモッグが見えない問題を修正(濃さ・テクスチャ強化) (Claude Code)

### 変更
- v0.25.355 のスモッグが薄すぎて視認できなかったため強化:
  - `lighting.ts` `getFogTexture()`: **連続した薄霧のベース(白 α0.34)を追加**+ブロブを 30→36・peak α0.05〜0.15 → 0.10〜0.32 に。
    まばらで見えない問題を解消し、面で霞むように。
  - 既定の濃さを引き上げ: `FOG_BG_ALPHA` 0.18→**0.45**、`FOG_FULL_ALPHA` 0.10→**0.22**(`pixiScene.ts`)。
- 原因は描画バグではなく**既定値が薄すぎた**こと(Pixi v8 で `screen` は基本ブレンド=動作OK)。
- **プレビューで実描画を確認**: `?fogbg=0.7&fog=0.35` で濃霧を確認(パイプライン正常)→ 既定 0.45/0.22 で
  オクトパス的な霞に着地。console エラーなし。`.claude/launch.json` を追加(preview 用)。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。Claude Preview でゲーム画面の霧描画を目視確認。

### 調整
- 濃すぎ/薄すぎは `?fogbg` / `?fog`、流れは `?fogspd`。好みが出たら既定へ再焼き込み。

## 2026-06-16 - v0.25.355 - スモッグ(オクトパス的な空気感): 背景霧+全面霧(軽量) (Claude Code)

### 変更
- **焼きテクスチャ方式の軽量スモッグ**を追加。`lighting.ts` に `getFogTexture()`(512²のタイル可能なソフト雲を
  起動時1回だけ焼く。30個のソフトブロブを9方向ラップ描画で継ぎ目なし)。
- `pixiScene.ts` に2枚の `TilingSprite` を追加し、`tilePosition` を camera パララックス + 時間ドリフトで流すだけ
  (毎フレームの blur/シェーダ/粒子なし=ほぼ無料。コストは全画面α合成のフィルレートのみ)。
  - **背景霧 `bgFog`**: `world` 内の `actorLayer` 直前(=キャラの後ろ・遠景の前)。`filteredWorld` 内なので
    tilt-shift と envtint が乗り、遠景がふわっと霞んで奥行きが出る。camera-shake は打ち消して画面固定。
  - **全面霧 `fullFog`**: `uiLayer`(全フィルタ外=スクリーン空間)。colour grade/シャフトの上・vignette の下に薄く。
  - 合成は `screen`、tint は寒色(`0x9fb6c8`)。
- **URLチューニング**(他のライティングと同方式): `?fogbg=0.18`(背景霧の濃さ)/ `?fog=0.10`(全面霧)/
  `?fogspd=1`(流れる速さ)/ それぞれ `0` で無効化。実機で詰めて既定へ焼き込む。
- 触ったファイル: `src/pixi/lighting.ts` / `src/pixi/pixiScene.ts`(`layers.ts` は変更なし=world内へ addChildAt で挿入)。

### 負荷スコア
1〜2/10(全画面α合成の TilingSprite 2枚。CPUはほぼゼロ、GPUフィルレートのみ。既存の遠景/前景森と同等)。
退避策: `?fog=0&fogbg=0` で完全無効 / 全面を切って背景のみ / テクスチャ 512→256。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。実機での見た目/FPSは dev 再起動後に確認。
- 既存ルール順守: blur/fog/bloom は削除せず追加のみ。React 無関係(Pixi側で完結)。

### 次の調整候補
- 実機で濃さ/速度/tint を詰めて既定へ焼き込み。必要なら背景霧を2枚(多重パララックス)に。強イベント時の局所濃化フック。

## 2026-06-16 - v0.25.354 - 会話中はゲーム時間停止(攻撃入力を抑止)/会話ボックスを画面中央・大きく (Claude Code)

### 変更
- **会話/登場中の攻撃入力を抑止**(`store/gameStore.ts` に `isGameTimeStopped()` 追加):
  `introDialogueActive` か登場演出中(`introUntil>0 && now<introUntil`)を「ゲーム内時間停止中」と定義。
  - バグ: 登場演出中はループ自体が早期 return で停止しているが、**タップ近接(`triggerCounter`)は入力ハンドラから
    直接 store を叩く**ためループ停止をバイパスして発火していた(=会話中にタップで近接攻撃が出ていた)。
  - 修正: `VirtualJoystick.release()`(タップ近接/刀ダッシュ)と `useGameControls`(Space=カウンター/方向二連打=刀ダッシュ)を
    `isGameTimeStopped()` でガード。停止中は一切発火しない。今後の通常会話も同関数に条件を足せば一括で止まる。
- **会話ボックスを画面中央・読みやすく**(`components/IntroDialogue.tsx`):
  下部VNボックス → **画面中央(`inset-0` + `items-center`)** の枠に変更。枠を強調(`border-2 border-cyan-300/40`・
  `rounded-2xl`・`backdrop-blur-md`・`ring`)、本文/話者/生存者の声を **13px → `text-lg`(18px)** に拡大、
  通信タグ 10px → `text-xs`。行入替時の縦揺れ防止に `min-h-[5rem]`。

### 負荷スコア
0/10(入力ガードの分岐とUIクラスのみ。新規描画・毎フレーム処理なし)。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。実機での見た目/タップ抑止は dev 再起動後に確認。

## 2026-06-16 - v0.25.353 - 登場演出: 人間の飛距離を縮小しヘリの左移動でカバー (Claude Code)

### 変更(`src/store/gameStore.ts`)
- `PLAYER_INTRO_FLY_X` を **2200→900** に縮小。
  - フェーズB(人間の飛び降り)の飛距離が ~2250px → **~980px**(約56%減)。
  - フェーズA(ヘリ飛来)の終点が中央寄り(`-FLY_X`)になるため、ヘリの飛来距離が `FAR_X−FLY_X`=2300px → **3600px** に増加。
    総左移動 `FAR_X`(4500)は据え置き=「左からの移動はヘリで確保」。
- カメラと見た目は同じ `playerIntroOffset(t)` を共有しているため追加配線は不要(両方に自動反映)。

### 負荷スコア
0/10(定数1個の変更のみ。新規描画なし)。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。実機での見た目確認は dev 再起動後に行う。

### 運用メモ
- ルール追加(2026-06-16): **コード変更のたびに dev サーバを必ず再起動**(`__APP_VERSION__`/挙動を確実に反映)。
- 微調整したい場合: 人間の飛距離=`PLAYER_INTRO_FLY_X`(小=人間が飛ばない)、ヘリ飛来の遠さ=`PLAYER_INTRO_HELI_FAR_X`。

## 2026-06-15 - v0.25.351 - ゲームオーバー真っ暗対策(描画堅牢化)/登場を左遠方から高速 (Claude Code)

### 変更
- **🩹 「ゲームオーバーが真っ暗で固まる」対策**(`PixiStage.tsx`): ティッカーの `scene.sync()` を try/catch で保護し、
  1フレームの例外で描画が固まって真っ暗になるのを防止(ログは初回のみ・再生継続)。破棄処理も全て try/catch 化。
  非同期 init と unmount の競合を修正(app を早期に `appRef` 保持→cleanup で確実に破棄、各 await 後に cancelled チェック、
  init は `.catch` で握る)。これでゲームオーバー時の破棄/再生成で固まらない。
- **登場を「もっと左の遠くから高速」に**: `PLAYER_INTRO_HELI_FAR_X` 2600→4500、開始縮尺 0.26→0.22(遠さ強調)、
  フェーズA横移動を easeOut(遠方から猛スピード→収束)に、フェーズA追従 0.98→0.92(左から飛び込んで見える)。

### 負荷スコア
0/10。try/catch と定数/イージング変更のみ。実行時コスト増なし(むしろ例外時の暴走を防止)。

### Verification
- `npx tsc --noEmit` パス、`npm run build` 成功。真っ暗が残る場合はコンソールの `[PixiStage] sync error` で原因特定可。

## 2026-06-15 - v0.25.350 - 登場セリフ:プレイヤー返事を削除/各行+0.2s延長 (Claude Code)

### 変更(`gameStore.ts`)
- 登場セリフから**プレイヤーの返事(職業名「了解。」)を削除**。通信3行→生存者の声→通信1行で終了。
- 各行の保持を **+0.2s 延長**(`INTRO_DIALOGUE_LINE_HOLD_MS` 750→950)。切替がゆっくりに。合計時間/時間停止も自動追従。

### 負荷スコア
0/10。定数・配列のみ。

### Verification
- `npx tsc --noEmit` パス、`npm run build` 成功。

## 2026-06-15 - v0.25.349 - ヘリ登場ゆっくり/セリフ5行+生存者の声/ダンス近接音→バスドラム (Claude Code)

### 変更
- **ヘリ登場を少しゆっくり**: `PLAYER_INTRO_HELI_MS` 2000→2600(フェーズA飛来を緩やかに)。
- **登場セリフ変更**(1行ずつ切替): 通信3行→生存者の声「……マー……ママー！」(`__voice__`=通信タグ無し/斜体/かすれ色)
  →通信「生存者確認！感染者を殲滅しつつ急行せよ。」→(職業名)「了解。」。
- **ダンスの近接音(タップ)を太いバスドラムに**: `playSfx('melee')` → `playDanceKick()`(Web Audio 合成キック=
  サイン波のピッチ落ち160→46Hz+速い減衰、サンプル不要)。拍を踏む「ドンッ」に。フリック(katana-dash)は据え置き。

### 負荷スコア
1/10。合成キックは短いオシレータ1本/タップのみ。

### Verification
- `npx tsc --noEmit` パス、`npm run build` 成功。キックの太さ/音程は `playDanceKick` 内の周波数・減衰で調整可。

## 2026-06-15 - v0.25.348 - リズム:音声アンカー(v0.25.346)を撤回 (Claude Code)

### 変更
- v0.25.346 の「グリッドを `audio.currentTime` へアンカー」を**撤回**(元の固定グリッドへ)。
  理由: `audio.currentTime`(デコード位置)に合わせても、実際に耳へ届く音は出力レイテンシ(端末/BT で100〜200ms)
  分だけ遅れるため、グリッドが音より早くなり**かえってズレが悪化**した。`getDanceAudioTimeMs` も削除。
- 残る「たまにズレる」は mp3 実テンポと公称BPMの差による累積ドリフトの可能性が高く、`?int1/2/3`(1拍ms)での
  テンポ較正→既定焼き込みが正攻法。位相の定数オフセットは `?bo1/2/3`。

### 負荷スコア
0/10。コード撤回のみ。

### Verification
- `npx tsc --noEmit` パス、`npm run build` 成功。

## 2026-06-15 - v0.25.347 - 登場セリフを4行+了解に変更・1行ずつ切替表示 (Claude Code)

### 変更
- 登場セリフを4行(通信)+職業名「了解。」に変更。文面:
  「この先の村に例の研究者もいるはずだ。」/「先発の調査隊の情報によると生存者は…」/
  「絶望的。望みは薄いが掛けるしかない。」/「感染者を殲滅しつつ森の奥へ進め。」/(職業名)「了解。」
- `IntroDialogue.tsx`: 表示を**1行ずつ切り替え**(現在行のみ表示。打ち終え→保持→次行に差し替え)に変更。
- 合計時間は行数から自動算出(`INTRO_DIALOGUE_TOTAL_MS`)。時間停止もそれに追従。

### 負荷スコア
0/10。文言・表示ロジックのみ。

### Verification
- `npx tsc --noEmit` パス、`npm run build` 成功。文字速度/保持は `INTRO_DIALOGUE_CHAR_MS`/`_LINE_HOLD_MS` で調整可。

## 2026-06-15 - v0.25.346 - リズム:判定グリッドをダンス曲へ同期(ズレ修正) (Claude Code)

### 変更
- リズムの拍グリッド(`firstBeatAt`)を、開始リード中に**ダンス曲の実再生位置(`audio.currentTime`)へ1回だけ
  アンカー**。`play()` レイテンシ・開始ズレを解消し、サークル/判定を「耳の拍」へ一致させる。1回だけ(最初の拍より前)
  なので毎フレーム追従のジッターは出ない。
- `audioManager.ts`: `getDanceAudioTimeMs()` を追加(ダンス曲が実際に鳴っている再生位置ms。鳴っていなければnull)。
- `useGameLoop.ts`: リズム開始で `rhythmBeatSyncedRef=false`。active中、未同期かつ曲が鳴っていてリード中なら、
  曲の拍境界に合わせて `firstBeatAt` を再設定(`expectBeat=0`)。残テンポ微差は `?int1/2/3`、位相は `?bo1/2/3` で
  既定へ焼き込み可(mp3の拍1が currentTime=0 でない場合は `?bo` で補正)。

### 負荷スコア
1/10。同期は開始リード中の1回のみ(以後はフラグでスキップ)。audio.currentTime 読み取りは軽量。

### Verification
- `npx tsc --noEmit` パス、`npm run build` 成功。実機で曲と判定の一致を確認 → 残ズレがあれば `?int`/`?bo` で微調整。

## 2026-06-15 - v0.25.345 - 登場:飛び降りの谷を解消/ヘリ待ち0.3秒 (Claude Code)

### 変更(`pixiScene.ts`)
- 飛び降り時にキャラが一瞬下がる「谷」を解消。従来は飛び降りでフェーズB開始の低位置(-LOW_Y)へ下りてから
  アーチで上昇(下→上)していた。**ドア高さ→着地(0)へ単調に加速落下**(横はダッシュ off.x を維持)に変更。
  着地スカッシュは落下進行 `fall>0.85` で。
- ヘリのホバー待ちを 0.5→0.3秒(`HELI_DEPART_DELAY_MS=300`)。

### 負荷スコア
0/10。登場演出中の位置計算のみ。

### Verification
- `npx tsc --noEmit` パス、`npm run build` 成功。

## 2026-06-15 - v0.25.344 - 登場:ヘリを飛び降り地点でホバー固定→待って離脱(一緒に飛ぶバグ修正) (Claude Code)

### 変更(`pixiScene.ts`)
- **バグ修正**: 飛び降り後もヘリが `off`(=プレイヤーの着地ダッシュ軌道)を参照し続け、プレイヤーと一緒に
  飛んで行っていた(=「待たずにすぐ飛ぶ」の原因)。飛び降り時点 `jumpOffT` で基準位置を凍結し、
  **その場でホバー固定**(`introHeliBase(player, min(t, jumpOffT))`)。離脱は上昇+横ドリフト+フェードのみ。
- 待ち時間 `HELI_DEPART_DELAY_MS` 300→500(0.5秒ホバーしてから上昇)。これで「飛び降り→ヘリが少し待つ→上昇」が
  見える。

### 負荷スコア
0/10。登場演出中の位置計算のみ。

### Verification
- `npx tsc --noEmit` パス、`npm run build` 成功。待ち時間は `HELI_DEPART_DELAY_MS` で調整可。

## 2026-06-15 - v0.25.343 - 登場セリフ文面/話者=職業名・ヘリ離脱0.3秒 (Claude Code)

### 変更
- セリフ文面を変更:「任務は研究所奪還の位置特定となる。座標確定後は速やかに帰還せよ。」/ (職業名)「了解。」。
  2行目の話者を**選択中の職業名**に(`CHARACTER_CLASS_NAMES`、speaker `__class__` を置換)。
  warrior=ヘビーガンナー / mage=マークスマン / rogue=ストライカー / necromancer=スカベンジャー。
- ヘリ離脱の待ちを 0.2→0.3秒(`HELI_DEPART_DELAY_MS=300`。セリフ後さらに遅らせる)。

### 負荷スコア
0/10。定数/文言/話者解決のみ。

### Verification
- `npx tsc --noEmit` パス、`npm run build` 成功。

## 2026-06-15 - v0.25.342 - 登場:ヘリ離脱の待ちを0.2秒に (Claude Code)

### 変更(`pixiScene.ts`)
- ヘリ離脱の待ちを `HELI_DEPART_DELAY_MS` 100→200(さらに0.1秒遅れて上昇)。

### 負荷スコア
0/10。定数のみ。

## 2026-06-15 - v0.25.341 - 登場:ヘリ離脱を0.1秒待つ/乗車位置を少し下げる (Claude Code)

### 変更(`pixiScene.ts`)
- **ヘリ離脱を 0.1秒待つ**: キャラ飛び降り(`HELI_RIDE_RELEASE_FROM`)後、`HELI_DEPART_DELAY_MS=100` 分
  待ってからヘリが上昇・離脱するように `releaseStart` をずらした。
- **乗車中の立ち位置を少し下げる**: `HELI_RIDE_DOOR_FRAC` 0.10→0.16。

### 負荷スコア
0/10。定数・オフセット計算のみ。

### Verification
- `npx tsc --noEmit` パス、`npm run build` 成功。待ち時間は `HELI_DEPART_DELAY_MS`、立ち位置は
  `HELI_RIDE_DOOR_FRAC` で調整可。

## 2026-06-15 - v0.25.340 - 登場セリフをヘリ降下後のタイミングに (Claude Code)

### 変更(`gameStore.ts`)
- 登場セリフのトリガーを `t=0.3` から **`PLAYER_INTRO_HELI_FRAC * 0.82`**(フェーズA内 a≈0.82=ヘリが
  低ホバーまで降りてきた頃)へ変更。ヘリが下に降りた状態でセリフ→飛び降り、になる。

### 負荷スコア
0/10。定数変更のみ。

### Verification
- `npx tsc --noEmit` パス、`npm run build` 成功。タイミングは係数(0.82)で調整可。

## 2026-06-15 - v0.25.339 - 登場:ヘリが低く降りてから飛び降りる (Claude Code)

### 変更(`pixiScene.ts`)
- 飛び降りが高すぎる問題を是正。ヘリの随伴高度を固定 `HELI_ABOVE` から、飛来終盤に
  **`HELI_ABOVE(210)→HELI_DROP_ABOVE(70)` へ降下**(`heliAboveAt(t)`、`HELI_DESCEND_FROM=0.5` から
  `HELI_RIDE_RELEASE_FROM=0.85` で低ホバー完了)。キャラはヘリ中心にピン留めなので**一緒に下がって**から
  飛び降りる。`introHeliBase` と `syncIntroHelicopter` の両方で `heliAboveAt(t)` を使用。

### 負荷スコア
0/10。登場演出中のオフセット計算のみ。

### Verification
- `npx tsc --noEmit` パス、`npm run build` 成功。降下開始/低ホバー高度は `HELI_DESCEND_FROM`/`HELI_DROP_ABOVE` で調整可。

## 2026-06-15 - v0.25.338 - 登場セリフ(ヘリ画面内で時間停止・オートタイプ) (Claude Code)

### 変更
- 登場演出で**ヘリが画面内に入った頃(進行 t≈`INTRO_DIALOGUE_TRIGGER_T=0.3`)に時間停止**してセリフを自動表示。
  流れ終わると自動でゲーム開始。
  - セリフ:通信「本任務は研究所奪還に向けて施設の位置特定となる。座標確定後は速やかに帰還せよ。」/
    プレイヤー「…了解。」
- `gameStore.ts`: `INTRO_DIALOGUE_LINES`/速度(`_CHAR_MS=55`)/保持/合計時間/トリガー t を定義。状態
  `introDialogueActive/StartedAt/Shown` と `startIntroDialogue`/`endIntroDialogue` を追加。stamp/リスタートで初期化。
- `useGameLoop.ts`: 登場中に t がトリガーを越えたら `startIntroDialogue`。表示中は `introUntil` を毎フレーム
  delta 分後ろへ送り **t を固定(ヘリ/キャラ静止)**。合計時間経過で `endIntroDialogue`→再開。
- `IntroDialogue.tsx`(新規): VN風の下部ボックス。**表示中だけ自前 raf** でこの小コンポーネントのみ更新
  (毎フレーム再描画の波及を回避)。購読は active(bool)/startedAt(number)のみ。Game.tsx にマウント。

### 負荷スコア
1/10。セリフ中(約4.4秒・1回)だけ小コンポーネントを raf 更新。シミュレーションは停止中。

### Verification
- `npx tsc --noEmit` パス、`npm run build` 成功。文字速度/タイミング/トリガー位置は各定数で調整可。

## 2026-06-15 - v0.25.337 - 登場:乗車位置をヘリ中心から直接ピン留め(ぶら下がり修正) (Claude Code)

### 変更(`pixiScene.ts`)
- 乗車位置の計算を作り直し。`height/2` 経由のリフト(`introRideLift` 廃止)をやめ、**ヘリ中心(`introHeliBase`)
  からの一定オフセットで足元を直接ピン留め**。フェーズA中はドリフトせず常にドアに重なる。
  → 「飛び降りる前にキャラが下にズレてぶら下がる」現象の是正。
- ドア位置を少し上げ(`HELI_RIDE_DOOR_FRAC` 0.18→0.10)、横位置に `HELI_RIDE_DOOR_X` を追加。
- 飛び降り(`a>=HELI_RIDE_RELEASE_FROM`)はドア位置→通常オフセットへ加速補間。ヘリ本体の位置式は
  `introHeliBase` と同一なのでキャラと完全一致。

### 負荷スコア
0/10。登場演出中のオフセット計算のみ。

### Verification
- `npx tsc --noEmit` パス、`npm run build` 成功。ドアの上下/左右は `HELI_RIDE_DOOR_FRAC`/`HELI_RIDE_DOOR_X` で調整可。
  ※もしキャラがヘリに隠れて見えない場合はレイヤー前後(reparent)側の問題なので連絡を。

## 2026-06-15 - v0.25.336 - ダンスUI:技リストを下げ/入力済み矢印をキャラ下へ (Claude Code)

### 変更(`pixiScene.ts` `syncRhythmOverlay`)
- **技リスト(目標コマンド)**を、旧・入力矢印の位置(`cmdY = -r - 18`、頭上)へ**下げた**。四神名テキストも追従。
- **入力済み矢印(入力フリック)**を**キャラの下(足元の下、`inputArrowsY = boxH + 26 + 20`)**へ移動。
- 表示の上下関係: 技リスト(頭上)→ ミラーボール → キャラ → 入力済み矢印(足元下)。

### 負荷スコア
0/10。描画位置定数の変更のみ(内容変化時のみ再描画は従来どおり)。

### Verification
- `npx tsc --noEmit` パス、`npm run build` 成功。位置(`cmdY` / `inputArrowsY`)は実機で微調整可。

## 2026-06-15 - v0.25.335 - 登場:キャラをヘリの「ドア」に重ねる/飛び降りと同時にヘリ上昇 (Claude Code)

### 変更(`pixiScene.ts`)
- 乗車表現を「屋根の上」→**「ドアに重なる」**に変更。フェーズA(乗車中)は**プレイヤーのコンテナを
  ヘリと同じ `danceUiLayer` の前面へ移動**(danceUiLayer は world と同一トランスフォームなので座標そのまま)。
  これでキャラがヘリ画像に**かぶって(前面で重なって)**ドアに乗っているように見える。降車後 `actorLayer` へ戻す。
- 乗車位置を客室/ドア(ヘリ中心のやや下=`HELI_RIDE_DOOR_FRAC`)に調整。
- **飛び降りと同時にヘリ上昇**: ヘリの離脱開始を `hf*HELI_RIDE_RELEASE_FROM`(=キャラが飛び降りる瞬間)へ
  前倒し。キャラ落下とヘリ上昇が同時に始まる。

### 負荷スコア
0/10。レイヤー移動(登場中の addChild 1回)+ オフセット計算のみ。

### Verification
- `npx tsc --noEmit` パス、`npm run build` 成功。ドアの縦位置は `HELI_RIDE_DOOR_FRAC`、
  飛び降り/上昇の同時タイミングは `HELI_RIDE_RELEASE_FROM` で調整可。

## 2026-06-15 - v0.25.334 - 連射タレット:射程に敵が無い時ゆっくり回転して索敵 (Claude Code)

### 変更(`useGameLoop.ts`)
- 前方集中(連射, `TURRET_FWD_FIRE_MS=130`)タレットに**索敵スキャン**を追加。射線帯に敵がいない間は
  砲身の向き(`direction`)を `TURRET_SCAN_SPEED=1.1 rad/s` で**ゆっくり回転**(発射しない)。
  現在の向きの射線帯に敵が入ったら回転停止して連射。スキャン角は `turretAimRef`(id→rad)で保持し、
  敵を捕捉中は固定。
- 回した向きを描画(砲身)へ反映するため、変化のあったタレットだけ1回 `setState` で `direction` を更新。
- omni(全方位)は従来どおり(最寄り敵を狙う)で変更なし。
- タレット消滅時に `turretAimRef` も掃除。

### 負荷スコア
1/10。タレット数は少数(設置上限)。スキャン中のみ向き更新(変化時1回 set/フレーム、既存の毎フレーム
projectiles 更新の範囲内)。描画は既存 `p.direction` 読みのまま。

### Verification
- `npx tsc --noEmit` パス、`npm run build` 成功。回転速度/挙動は `TURRET_SCAN_SPEED` で調整可。

## 2026-06-15 - v0.25.333 - 登場:キャラをヘリに乗せて重ねる (Claude Code)

### 変更(`pixiScene.ts`)
- フェーズA(飛来)中、**プレイヤーをヘリの上に乗せる**よう上方リフトを追加(`introRideLift`)。
  ヘリは最前面(danceUiLayer、ぼかさないため)なので、キャラを**ヘリ屋根(画像の上)に重ねて**見せる
  (ヘリ内部だと前面ヘリに隠れて見えないため)。足はヘリ屋根に少しめり込ませる(`HELI_RIDE_SINK`)。
- フェーズA終端(`HELI_RIDE_RELEASE_FROM=0.85` から)でリフトを 0 に解除=**ヘリから飛び降り**、
  フェーズB(ジャンプ着地)開始点へ連続。
- 調整定数: `HELI_RIDE_SINK` / `HELI_RIDE_RELEASE_FROM`(+ 既存 `HELI_ABOVE` / `HELI_DISPLAY_H`)。

### 負荷スコア
0/10。登場演出中のオフセット計算のみ。実行時コスト増なし。

### Verification
- `npx tsc --noEmit` パス、`npm run build` 成功。乗車位置(屋根の高さ/めり込み)は実機で微調整可。
  ※キャラは actorLayer のため上空で被写界深度が弱くかかる場合あり(ヘリは非ぼかし)。気になれば次回調整。

## 2026-06-15 - v0.25.332 - 真っ暗バグ対策(テクスチャ堅牢化)+ ヘリ:非ぼかし/右向き (Claude Code)

### 変更
- **🩹 スタート時「真っ暗」対策(以前から発生していた長年の原因)**: `pixiTextures.ensureTextures` が
  `Promise.all` で全アセットを読み込んでおり、**1つでもロード失敗すると全体が reject → `ready` が永久に
  立たず画面が真っ暗**(失敗 promise がキャッシュされ再試行もされない)になっていた。各アセットを
  **個別 try/catch** で読み込み、失敗した絵は未登録(`getTexture=null`→その描画だけスキップ)にして
  **`ready` は必ず true** に。1枚の取りこぼしで全画面が落ちないようにした。各 `scaleMode` は現状維持。
- **ヘリ:ぼかさない**: テクスチャ `scaleMode` を `linear`→`nearest`(平滑化なし)に。さらに被写界深度
  (tilt-shift)でボケる `effectLayer` から、**`danceUiLayer`(filteredWorld外=ボケない/world座標で追従)**
  へ移動。これで登場ヘリはくっきり表示。
- **ヘリ:右向き**: 画像が左向きのため X 反転(`scale.set(-sc, sc)`)して右向き(=右へ飛来)に。

### 負荷スコア
0/10。ロード方式の変更(同時実行は同等)+ レイヤー移動 + スケール符号反転のみ。実行時コスト増なし。

### Verification
- `npx tsc --noEmit` パス、`npm run build` 成功。真っ暗の再現は環境依存のため、改善はするが残る場合は
  コンソール警告(`[pixiTextures] failed to load sprite ...`)の有無で原因アセットを特定可能。

## 2026-06-15 - v0.25.331 - 登場演出を2段化(ヘリ飛来2s→ジャンプ着地) (Claude Code)

### 変更
- 登場演出を**2フェーズ**に再設計(社長要望:「ヘリで超遠くから飛来→途中で今のジャンプ着地へ移行、+2秒」)。
  - **フェーズA(ヘリ飛来 `PLAYER_INTRO_HELI_MS=2000`)**: プレイヤー+ヘリが遠方・高所から**小さく**飛来し、
    降下しながら拡大してフェーズB開始点へ**連続**接続。カメラは強追従(`0.98`)でヘリを画面に保持。
  - **フェーズB(ジャンプ着地 `PLAYER_INTRO_LAND_MS=1700`)**: 従来のロックマン的ダッシュ着地そのまま。
    この間にヘリが上昇+横ドリフト+フェードで離脱。カメラ追従は移行域で `0.98→0.82` に滑らかランプ。
  - 全体 `PLAYER_INTRO_MS` = 2000+1700 = **3700ms**(+2秒)。
- `gameStore.ts`: `playerIntroOffset(t)` を2段化、`playerIntroScale(t)`(遠さ=縮尺)/`playerIntroCamFollow(t)`
  を追加。定数 `PLAYER_INTRO_HELI_FAR_X/HIGH_Y/START_SCALE/HELI_CAM_FOLLOW/HELI_FRAC`。
- `useGameLoop.ts`: カメラ追従を `playerIntroCamFollow(introT)` で毎フレーム取得。
- `pixiScene.ts`: プレイヤー描画に `introScale` を乗算、着地スカッシュをフェーズB局所進捗 `b>0.8` に補正。
  `syncIntroHelicopter` をフェーズA随伴(同縮尺で拡大降下)→フェーズB離脱に書き換え。
- 「ヘリが見えない」原因=旧設計はヘリが演出40%で上昇フェードし、プレイヤーが中央到達時には消えていたため。
  フェーズAで2秒間しっかり見えるよう是正。

### 負荷スコア
1/10(rendering)。登場演出中だけスプライト1枚を動かす。演出尺が+2秒延びる=その間ゲーム進行停止(要望どおり)。

### Verification
- `npx tsc --noEmit` パス、`npm run build` 成功。飛来軌道/高度/縮尺/カメラ追従は実機で微調整可
  (`PLAYER_INTRO_HELI_*` 定数、`HELI_DISPLAY_H/ABOVE/RISE/DRIFT_X`)。

## 2026-06-15 - v0.25.330 - 城・拾い物の影をソフト方向影に統一 (Claude Code)

### 変更(`pixiScene.ts`)
- **拾い物**: 足元の平たい楕円(`drawShadow` の Graphics fill)を廃止し、アクターと同じ
  **ソフト方向影(プール式 `placeShadowSprite` → `shadowContainer`)** に統一。`drawPickup` は
  影を直接描かず、`pickupShadows[]`(id=`pk:<id>`)に要求を積み、`syncShadows` が配置。
  重みは `lighting.shadowAlpha` 基準でアクターと揃え、bob で僅かに薄れて浮遊感を残す。
- **城**: これまで足元の接地影なし。`syncCastle` が可視時に `castleShadow` を要求(幅は城スプライト
  幅基準だが巨大ブロブ回避のため `min(120*d, texW*sc*0.42)` に抑制)、`syncShadows` が `'castle'` で配置。
- 未使用化した `drawShadow` ヘルパを削除。これで足影は **全オブジェクトがソフト方向影に統一**
  (プレイヤー/敵/召喚/設置物/商人/NPC/城/拾い物)。

### 負荷スコア
1/10(rendering)。拾い物は「毎フレーム楕円 fill」→「プール Sprite の transform 更新」に置換(微減)。
城は +1スプライト/frame。新規確保は小さな `pickupShadows` 配列の作り直しのみ(可視数で上限)。

### Verification
- `npx tsc --noEmit` パス、`npm run build` 成功、`eslint src/pixi/pixiScene.ts` クリーン。
- 影の見た目(特に城の幅/濃さ、拾い物の方向影の長さ)は次回 dev 起動で実機確認し微調整可。

## 2026-06-15 - v0.25.329 - 登場ヘリ画像を登録・有効化 (Claude Code)

### 変更
- **ヘリ画像受領→有効化**。社長提供の `helicopter` 画像(紫1色背景)を、Node 標準 `zlib` のみで
  PNG デコード→**紫クロマキー透過**(フチをフェザー)→**内容バウンディングボックスでクロップ**→
  **2x ボックス縮小**して `public/sprites/helicopter.png`(452×251 / 130KB)として配置。
  処理スクリプトは `scripts/process-heli.mjs`(ワンオフ・再現用に残置)。
- `src/pixi/pixiTextures.ts`: `helicopter` を **別ロードで登録**。高解像度の縮小描画なので
  `mirror-ball` と同様に **`scaleMode = 'linear'`**(playerWalkNames=nearest 群には入れない)。
- これで `syncIntroHelicopter`(v0.25.328 実装済み)の `getTexture('helicopter')` が解決し、
  登場演出でヘリが表示される。位置/サイズ/挙動は既存 `HELI_*` 定数のまま。

### 負荷スコア
2/10(rendering/memory)。452×251 RGBA テクスチャ1枚=約0.45MB を起動時1回ロードし、登場演出中だけ
1スプライトを動かすのみ。元1254px から 2x 縮小済みでメモリ/転送を削減(742KB→130KB)。

### Verification
- `npx tsc --noEmit` パス、`npm run build` 成功。透過結果を目視確認(紫フチ無し)。
- 実機での登場演出表示・サイズ感は次回 dev 起動時に最終確認(`HELI_DISPLAY_H` 等で微調整可)。

## 2026-06-15 - v0.25.328 - 登場演出にヘリコプター(画像待ち・現状は安全に非表示) (Claude Code)

### 変更(`pixiScene.ts`)
- 登場演出に**ヘリコプター**を追加。序盤はキャラ上方に随伴(=降ろした直後)、後半(t>0.4)で**上へ逃げて
  フェードアウト**。`syncIntroHelicopter` を `sync()` で毎フレーム駆動。world(effectLayer)配置でカメラ追従。
- テクスチャキー **`helicopter`**。**まだ画像が無い**ので getTexture が null → **安全に非表示**(クラッシュなし)。
- 調整定数: `HELI_DISPLAY_H=120` / `HELI_ABOVE=210` / `HELI_RISE=820` / `HELI_DRIFT_X=240`。

### ⚠️ 画像受領後の有効化手順(次チャット向け)
1. `public/sprites/helicopter.png` を配置。
2. `src/pixi/pixiTextures.ts` の `playerWalkNames` 配列に `'helicopter'` を追加(これでロード&登録される)。
   ※先に配列へ足すと画像が無い間 `Assets.load` が失敗するので、**ファイル配置とセットで**行う。
3. dev再起動 → 登場演出でヘリ表示。位置/サイズは上記定数で調整。

### 負荷スコア
0〜1/10(スプライト1枚を登場演出中だけ動かす)。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。実機確認は画像配置後。

## 2026-06-15 - v0.25.327 - 登場演出: 低く飛行＋カメラがステージを横断追従(ロックマン的) (Claude Code)

### 変更
- 登場演出を「カメラがステージを横断してキャラに追従する」方式に。`gameStore` に共有関数
  `playerIntroOffset(t)`(world相対オフセット)を追加し、**カメラ(useGameLoop)と見た目(pixiScene)が
  同じ式**で動くよう同期。
  - `useGameLoop` 演出中: カメラXを `player.x + off.x * PLAYER_INTRO_CAM_FOLLOW(0.82)` に追従(<1なので
    キャラは少し左から入って中央へ)。カメラYは着地面に固定し、飛行アーチは見た目で見せる。
  - キャラは**低く**(`PLAYER_INTRO_LOW_Y=36` + アーチ`120`)、**遠く**(`PLAYER_INTRO_FLY_X=1200`)から猛スピードで
    横断。`PLAYER_INTRO_MS` 650→**700**。
  - 旧: 上から飛び込む方式(pixiローカル定数 `PLAYER_INTRO_START_*`)は撤去し store 共有式へ統一。

### 負荷スコア
0/10(カメラ位置と見た目オフセットの式変更のみ)。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。実機でカメラ横断の速さ・キャラの低空飛行・着地を確認。
  調整: `PLAYER_INTRO_FLY_X`(遠さ)/ `PLAYER_INTRO_LOW_Y`・`ARC_H`(高さ)/ `PLAYER_INTRO_CAM_FOLLOW`(追従)/ `PLAYER_INTRO_MS`(速さ)。

## 2026-06-15 - v0.25.326 - 登場演出を「左の遠くから飛行→着地」に変更 / しなりを少しゆっくり (Claude Code)

### 変更(`pixiScene.ts` / `gameStore.ts`)
- 登場演出: 左上からの短い飛び込み → **フィールドを左の遠く(画面外 -1100px)から猛スピードで飛んできて
  中央着地**に変更。`PLAYER_INTRO_START_X=-1100` / `START_Y=-120` / 飛行中の山なり `PLAYER_INTRO_ARC_H=170`
  (introOffY に `-ARC_H*sin(t*π)` を加算)。滞空確保のため `PLAYER_INTRO_MS` 600→**650**。
- 敵の被弾しなり: `ENEMY_HIT_FLINCH_MS` 130→**230**(少しだけゆっくり)。skew量/向きは据え置き。

### 負荷スコア
0/10(定数・軌道式の変更のみ)。

### Verification
- `npx tsc --noEmit` / `npm run build` 成功。実機で飛行軌道(距離/高さ/速さ)としなりの速さを確認。
  調整: `PLAYER_INTRO_START_X/Y` `PLAYER_INTRO_ARC_H` `PLAYER_INTRO_MS` / `ENEMY_HIT_FLINCH_MS`。

## 2026-06-15 - v0.25.325 - キャラ登場演出(ロックマン的飛び込み) / 敵の被弾しなり (Claude Code)

### 1. キャラ登場演出(左上から高速ジャンプ→中央着地→開始)
- `gameStore`: `PLAYER_INTRO_MS=600` / state `introUntil`(-1=アーム, 0=なし, それ以外=終了時刻)/ `stampPlayerIntro`。
  `resetGame` で `introUntil = -1`(練習モードは 0=演出なし)。
- `useGameLoop`: 初プレイフレームで `stampPlayerIntro` し終了時刻を確定。演出中はゲーム進行/入力/敵スポーンを
  止めて見た目だけ進める(カメラ/エフェクトのみ更新)。着地時にリング/バースト/フラッシュ/軽いシェイク。
- `pixiScene` drawPlayer: 左上(`PLAYER_INTRO_START_X/Y`)→中央へ、横=easeOut/縦=easeIn で飛び込み、
  着地でスカッシュ。背負い刀も追従。登場中は足影を出さない(空中なので)。

### 2. 敵の被弾しなり(頭が後ろにぐにゃっ)
- `pixiScene` drawEnemy: 撃たれた直後(`ENEMY_HIT_FLINCH_MS=130`)だけ、スプライトを後ろ(ノックバック方向)へ
  `skew.x`(最大 `ENEMY_HIT_FLINCH_SKEW=0.42`)+ 軽い縦縮みで反らせ、短時間で戻す。アンカーが足元寄りのため
  skew だけで頭が大きく振れる。新規描画/フィルタ無し=ほぼ無負荷。
  ※単一スプライトの傾けなので「頭だけ」ではなく上半身ごとしなる表現(足元支点)。

### 負荷スコア
登場演出 1/10(演出中はむしろ進行停止)/ 被弾しなり 0〜1/10(transform更新のみ)。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。実機で登場の飛び込み感・着地、被弾しなりの向き/強さを確認。
  しなりの向きが逆なら `drawEnemy` の `dir` 符号、強さは `ENEMY_HIT_FLINCH_SKEW` で調整。

## 2026-06-15 - v0.25.324 - 商人/イベントNPCの影もソフト方向影に統一 (Claude Code)

### 変更(`pixiScene.ts`)
- 商人(`syncMerchant`)とイベントNPC(`syncEventQuestNpc`)の平たい楕円影を撤去し、
  v0.25.320 のソフト方向影スプライトに統一。
  - 各 sync は可視時のみ `merchantShadow` / `npcShadow`(world座標・幅・alpha)を立て、`syncShadows`(後段)が
    `placeShadowSprite('merchant'|'npc', ...)` で配置。非可視/フェード完了時は null=mark-and-sweep で消える。
  - NPC はフェード中の `statusAlpha` も影に反映。
- 城(`syncCastle`)は元々ground影なし=巨大構造物なので今回は対象外。拾い物の小楕円も据え置き。
- `drawShadow`(平たい楕円)は拾い物でまだ使用=残置。

### 負荷スコア
1/10。フィルタ無しのスプライト2枚追加(商人/NPC、可視時のみ)。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。実機で商人/NPCの影の向き・サイズ確認。

## 2026-06-15 - v0.25.323 - 設置物の影サイズ修正 / 松明の改善(不規則flicker+地面光だまり) (Claude Code)

### 1. 設置物の影が見た目と不釣り合いだった件(`pixiScene.ts`)
- 原因: 影幅に `p.width`(ヒットボックス)を使っていて実描画サイズと不一致。さらに**タレットは
  自前の楕円影と二重**だった。
- 修正:
  - タレットの自前楕円影(`g.ellipse(0,0,16,6)`)を撤去し、ソフト影に一本化。
  - `placedWeaponShadowWidth(p)` を追加。盾/デコイは**テクスチャ比×表示高(SHIELD/DECOY_DISPLAY_H)**から
    実描画幅を出し、アクターと同じ基準(×0.55)で影幅を算出。タレットは本体相当の固定値。
  - 召喚はアクターと同経路なので据え置き(基準一致)。

### 2. 松明の改善(プランC)(`pixiScene.ts`)
- **不規則な炎の揺らぎ**: 単一サインの pulse を2周期合成に(0.80 + 0.13·sin(/125) + 0.07·sin(/53))。
  炎・光・地面反射が機械的に見えないように。
- **地面の光だまりを活かす**: reflection を従来比 約1.5倍幅・丸め・やや濃く(alpha 0.2→0.24)。暗い
  ベースの上で松明が光源として読めるように。

### 負荷スコア
1/10。新規オブジェクト無し。影はサイズ算出の変更のみ、松明は既存スプライトのパラメータ調整のみ。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。見た目は実機確認(影の釣り合い・松明の揺らぎ/光だまり)。

## 2026-06-15 - v0.25.322 - ステージBGMを stage1 に差し替え / 設置物・召喚にもソフト影 (Claude Code)

### ステージBGM差し替え(`audioManager.ts`)
- `BGM_TRACKS` を `audio/stage1.mp3` に差し替え(社長提供のローカルファイルを `public/audio/stage1.mp3` へ配置)。
  旧 `rotten-iron-march.mp3` / `rusting-grave-circuit.mp3` は public に残置。stage2-4 は将来ここに並べれば
  ステージ別BGM化できる(今回は stage1 のみ)。
- 取得経緯: Drive フォルダは非公開でcurl不可・MCPはbase64 8MBで文脈破綻 → 社長が `Downloads\stage1.mp3` を
  用意 → それをコピー。

### 影の統一・追加(`pixiScene.ts`)
- `syncShadows` に **召喚(味方ユニット)** と **設置型ウェポン(盾/デコイ/タレット)** を追加。いずれも
  v0.25.320 のソフト方向影スプライト(`placeShadowSprite`/`shadowPool`)で統一。
  - 召喚: `summonFootBox` + `summonViews` 幅、敵と同じ方向影。id=`sum:<id>`。
  - 設置物: 足元=`p.y+p.height` / 幅=`p.width`。id=`pw:<id>`。mark-and-sweep で消滅時に破棄。
- 商人/イベントNPC/城/拾い物の平たい楕円影は今回据え置き(静的構造物。必要なら次で統一)。

### 負荷スコア
1/10。影はフィルタ無しのスプライト transform 更新。BGMはファイル差し替えのみ(8.2MBはやや大きめ=必要なら後で再エンコード可)。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。実機で BGM 再生と各影を確認。

## 2026-06-15 - v0.25.321 - ソフト影のぼかしを少し弱める (Claude Code)

### 変更(`lighting.ts`)
- `getSoftShadowTexture` のグラデを調整(実体部 0.5→**0.66**・濃さ 0.82→**0.94**)。フェードを外周だけに
  寄せ、影のエッジを少しはっきりさせた(=ぼかし弱め)。負荷 0/10。

### Verification
- `npm run build` 成功。

## 2026-06-15 - v0.25.320 - 描画改善: 通常足影をソフト影スプライト化(ぼかしフィルタ不要) (Claude Code)

### 背景
影を柔らかくしたい。BlurFilter は敵が増えると全画面ブラーで重い。代わりに「最初からボケた影
テクスチャ」をスプライトで貼る方式(B)に。光方向への伸び/向きはそのまま保つ。

### 変更
- `lighting.ts`: `getSoftShadowTexture()` 追加(黒のソフト放射状ブロブ。1回だけ生成)。
- `pixiScene.ts`: 通常足影を `shadowGfx`(毎フレーム全描き直しのGraphics)から **ソフト影スプライトの
  プール**(`shadowContainer` + `shadowPool`)へ置換。
  - `placeShadowSprite`: 旧 `drawDirectionalShadow` の幾何(足元→光方向へ length 伸ばす / 太さ=断面)を
    スプライトの **回転(向き)+ width/height(伸び・太さ)+ 位置** で再現。→ 伸び/向きは従来どおり。
  - mark-and-sweep で消えたアクターの影を破棄。
  - 旧 `drawDirectionalShadow` は撤去(`drawShadow` は商人/その他で使用継続)。
- ②(強イベントの動的影 `localEventShadeGfx`)は今回未変更(別系統)。

### 負荷スコア
影に関しては実質 ±0〜微減。フィルタパスは増えない(敵が増えてもブラー無し)。Graphics の毎フレーム
全再描画 → スプライトの transform 更新に変わっただけ。エッジが柔らかくなる分の見た目向上。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。見た目は実機確認。

### 次(任意)
- 良ければ②(イベント影)も同方式へ。極端に長い影でスメアが気になれば「伸び上限/カプセル型テクスチャ」。

## 2026-06-15 - v0.25.319 - シャフトのぼかしを既定OFFに戻す (Claude Code)

### 変更(`pixiScene.ts`)
- `SHAFT_BLUR` 既定 4 → **0**(ぼかし無し)。`?shaftblur=` で再有効化は可能。
- 間引き(2本)・明るさ(0.11)・横パララックスはそのまま。

### Verification
- `npm run build` 成功。

## 2026-06-15 - v0.25.318 - 環境光シャフト: 本数間引き / 明るさ抑え / 軽くぼかし (Claude Code)

### 変更(`pixiScene.ts`)
- **間引き**: period 内のビームを 3本 → **2本**に(オフセット/幅も再調整)。
- **明るさ**: `SHAFT_ALPHA` 0.13 → **0.11**(気持ち抑える)。
- **ぼかし**: `stageLightShaftGfx` に `BlurFilter`(strength=`SHAFT_BLUR` 既定4 / quality=1)を1枚適用しエッジを柔らかく。
  `?shaftblur=0` でOFF、`?shaftblur=` で調整。

### 負荷スコア
2〜3/10。ぼかしは加算シャフトレイヤー1枚への低品質Blur=毎フレーム1パスだが、対象が単純なので軽め。
重い端末では `?shaftblur=0` で即無効化可。間引きでむしろポリゴン数は減。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。見た目/負荷は実機確認。

## 2026-06-15 - v0.25.317 - 環境光シャフトの横パララックスを少し速く 0.22→0.35 (Claude Code)

### 変更(`pixiScene.ts`)
- `SHAFT_PARALLAX_X` 既定 0.22 → **0.35**(左右移動への追従を速く)。`?shaftpara=` で生調整は維持。

### 負荷スコア
0/10(定数値のみ)。

### Verification
- `npm run build` 成功。

## 2026-06-15 - v0.25.316 - 環境光シャフトを弱める＋左右移動に連動して森のように流す (Claude Code)

### 変更(`pixiScene.ts`)
- 明るさを少し弱め: `SHAFT_ALPHA` 既定 0.18 → **0.13**(`?shaft=`)。
- **横パララックス追加**: シャフトを camera.x に連動して横へ流す(森と同じ発想)。`updateStageLightShafts` を
  「period 単位のタイル反復描画」に作り替え、`syncStageLightShaftDrift` で position.x を
  `(-camera.x * SHAFT_PARALLAX_X) % period` を [-period,0] に折り返して継ぎ目なくスクロール。
  - `SHAFT_PARALLAX_X` 既定 **0.22**(front forest=0.68 より遅め)。`?shaftpara=` で生調整(0=動かない)。
  - 旧: 足元X基準のサイン揺れ(`STAGE_LIGHT_SHAFT_DRIFT_*`)は撤去。
- 縦の脈動(`STAGE_LIGHT_SHAFT_PULSE_*`)は従来どおり。

### 負荷スコア
0〜1/10。描画は resize 時のみ(タイル数本)。毎フレームは position.x 更新だけ(redraw無し)。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。流れ方/強さは実機確認(`?shaft=` `?shaftpara=`)。

## 2026-06-15 - v0.25.315 - 周辺暗部(vignette)をもう少し明るく 0.85→0.70 (Claude Code)

### 変更(`pixiScene.ts`)
- `ENV_VIGNETTE_ALPHA` の既定を 0.85 → **0.70** に。周辺の減光を弱め、画面端をもう少し明るく。
  `?vig=` で生調整は維持。環境暗化(envdark)・光だまり(pool)・シャフト(shaft)はそのまま。

### 負荷スコア
0/10(定数値のみ)。

### Verification
- `npx tsc --noEmit` / `npm run build` 成功。

## 2026-06-15 - v0.25.314 - 描画改善A: 光だまり(足元の地面プール)追加 (Claude Code)

### 背景
描画改善プランの A。暗いベース(envdark)の上で「光の島」を作りメリハリを出す。すぐ戻せる前提。

### 変更(`pixiScene.ts`)
- プレイヤー足元の groundLayer(world座標・アクターの下)に、加算スプライト1枚の「光だまり」
  `playerGroundPool` を追加。既存 playerLight(hero補助の控えめな光)とは別に、広く濃いプールを敷く。
  毎フレーム位置追従＋微脈動。暖色 tint(0xffe3a3)。
- すぐ戻せる設計: `?pool=0` で完全無効(visible=false=描画も走らない)。`?pool=濃さ`(既定0.4)/
  `?poolr=半径`(既定210)で実機生調整。コードを残したまま既定で切るのも容易。

### 負荷スコア
1〜2/10。加算スプライト1枚を毎フレーム位置更新するだけ。新規フィルタパス/パーティクル無し。
`?pool=0` 時は visible=false で描画もスキップ。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。見た目は実機確認・値調整待ち。

### 戻し方(メモ)
- 既定で切るだけなら `LIGHT_POOL_ENABLED` を false 相当(既定 `?pool=0`)に。
- 完全撤去は本コミットを revert(`playerGroundPool` の定義/追加/同期の3箇所)。

## 2026-06-15 - v0.25.313 - vignette(円形の周辺減光)を元の濃さ 0.85 に戻す (Claude Code)

### 背景
Phase1 で vignette を 0.85→0.92 に上げていたが、環境暗化と重なり円形の暗部が目立ちすぎ。元に戻す指示。

### 変更(`pixiScene.ts`)
- `ENV_VIGNETTE_ALPHA` の既定を 0.92 → **0.85**(導入前の値)に戻した。`?vig=` での生調整は維持。
- 環境暗化(`?envdark`)・月明りシャフト(`?shaft`)はそのまま。

### 負荷スコア
0/10(定数値のみ)。

### Verification
- `npx tsc --noEmit` / `npm run build` 成功。

## 2026-06-15 - v0.25.312 - 撃破数/FPS表示をTOP画面で有り/無しスタート選択(既定=無し) (Claude Code)

### 背景
音量ボタンの上下に出る撃破数/DMG/SCRAP(StatsHud)と FPS/負荷(PerfOverlay)を、TOP画面で
「表示ありスタート / 無しスタート」選べるようにしたい。通常プレイは無し。

### 変更
- `gameStore.ts`: 設定フラグ `showStatsOverlay`(既定 **false**)+ `setShowStatsOverlay` を追加。
  resetGame では触らない=開始しても設定が維持される。
- `Game.tsx`: `<StatsHud />` と `<PerfOverlay />` を `showStatsOverlay` でゲート(false=非表示)。
- `MainMenu.tsx`: 「はじめる」直下にトグル「撃破数/FPS表示 ON/OFF」を追加(既定OFF)。

### 負荷スコア
0/10。むしろ既定では2つの毎フレーム再描画コンポーネント(StatsHud/PerfOverlay)が描画されなくなり軽くなる。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。

## 2026-06-15 - v0.25.311 - 刀のフリック(一閃ダッシュ)を「指を離した瞬間」に判定 (Claude Code)

### 背景
刀の一閃ダッシュはスワイプ中に即発火していた(スマホ音ゲー方式)。社長指示で、刀のフリックは
**指を離したときにフリックかどうか判定**する方式へ戻す。ダンス(四神技)のフリックは即発火のまま。

### 変更(`VirtualJoystick.tsx`)
- `handlePointerMove` から刀の `tryFireKatanaDash()` 即発火呼び出しを撤去(リズム中の `tryFireRhythmFlick` は維持)。
- `release`(指を離した瞬間・pointerup のみ)で、非リズム時に `tryFireKatanaDash()` を実行=ここでフリック判定。
  非刀装備なら `triggerKatanaDash` が false を返すので無害。カウンター窓の発火は従来どおり同タイミングで継続。
- 依存配列を整理(move から tryFireKatanaDash を除去、release に追加)。

### 負荷スコア
0/10。入力判定タイミングの移動のみ。毎フレームの新規コストはむしろ減る(move 中の flick 試行が消える)。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。操作感は実機確認待ち。

## 2026-06-15 - v0.25.310 - レベルアップのスクロール / 死神AoEを範囲基準に / スキル装備=固有+1個 (Claude Code)

### 背景
別チャット(2台構成のもう一方)が同等の修正を v0.25.307 として push 済みだったが、本チャットの版
(近接破壊+ライティング)を正本として進めるため、その修正指示をこの版の上で再実装した。

### 1. レベルアップで選択肢が多いとスクロールできない (`UpgradeMenu.tsx`)
- パネルを `flex flex-col max-h-[88dvh]`、ヘッダを `shrink-0`、選択肢リストを
  `overflow-y-auto min-h-0 overscroll-contain` に。ヘッダ固定・リストだけスクロール。

### 2. 死神(錬金術レア召喚)の攻撃が当たって見えない (`gameStore.ts` `updateSummons`)
- レア近接AoEを「吸引対象(PULL_RANGE=380/最大12体)」依存から、**オーラの円
  (`ALCHEMY_RARE_SUCTION_RADIUS`=570)内の非reaper敵すべて**へ 0.5秒ごとに変更。
  外周の敵が無傷に見える問題を解消。ダメージ数字も全対象で表示。

### 3. スキル装備=「固有スキル + 新規1個」 (`gameStore.ts` resetGame / `upgradeUtils.ts`)
- `resetGame`: 通常開始時に固有スキル(`classSubWeaponFor`)を Lv1 所持で開始
  (warrior=手榴弾 / mage=トラップ / rogue=ハンティング / necromancer=クイックマガジン)。
  ※ダンス練習モードは従来どおり shijin のみ。
- `upgradeUtils.ts`: 新規取得上限を 2→**1**。さらに固有スキルを上限カウントから除外
  (`classSubWeaponFor(player.characterClass)` を除く)。既所持の昇格カードは従来どおり。
  刀/村雨/ダンスフロアは排他=上限外、取得時の他スキルリセット挙動は維持。

### 負荷スコア
1/10。死神AoEは 0.5秒throttleで範囲判定するだけ。他はUI/初期化/取得条件の変更。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。挙動は実機確認待ち。

## 2026-06-15 - v0.25.309 - ライティングのメリハリ フェーズ2-A: 月明り(光のシャフト)を明るく (Claude Code)

### 背景
フェーズ1で環境のベースを暗く沈めた上で、「月明りの当たる部分は今までみたいに明るく」したい(社長要望)。
A/B案のうち **A=今の暖色シャフトを明るくする(最小変更・確実に軽い)** を選択。

### 変更(`pixiScene.ts`)
- 光のシャフト(`stageLightShaftGfx`)の明るさを可変化し、既定を従来 0.085 → **0.18** に引き上げ。
  シャフトは加算(blendMode 'add')描画なので、暗いベースの上で**光の筋だけが明るく**なり周りの暗さは保たれる=メリハリ。
- `updateStageLightShafts` の参照を preset の素値から可変 `SHAFT_ALPHA` に変更。
- 実機生調整URL: `?shaft=0.2`(0=なし。従来素値は 0.085)。
- 暖色のまま(`sunlight` preset の color 0xffe3a3)。B案(寒色 moonlight)へは preset 切替で対応可能(今回は未実施)。

### 負荷スコア
0/10。既存の加算Graphics(3ポリゴン1枚)の塗り濃度を上げるだけ。新規パス/glow/パーティクル無し。

### Verification
- `npx tsc --noEmit` / `npm run build` 成功。明るさ量は実機確認待ち(`?shaft=` で調整)。

### 次の候補(未着手)
- 物足りなければ、月明りが地面に落ちる位置へ加算の「光だまり」を足す(キャッシュ済み加算スプライト=軽い)。
- B案(寒色の月明りプリセット)に切替えたい場合は `ACTIVE_STAGE_LIGHTING_NAME` を 'moonlight' に。

## 2026-06-15 - v0.25.308 - ライティングのメリハリ フェーズ1: 環境のベース闇を深く (Claude Code)

### 背景
前回の「全体コントラスト(ColorMatrix)」はシーン全体が一律に濃く沈むだけ=メリハリにならず却下、
v0.25.307 へ戻した。HD-2D のメリハリは「光がある所だけ明るい」=ローカル光で作るもの。その第一歩として
**環境(地面・森・遠景・木)のベースだけを暗く沈める**(アクター/光は沈めない)。フェーズ1。

### 変更(`pixiScene.ts`)
- 環境スプライトに **GPU tint で暗色を掛ける**(追加フィルタパス無し=無料):
  地面ストリップ(groundStrips)/遠景(farBackdrop)/森の継ぎ目(horizonForest)/前景の森(frontForest)を
  constructor で一度 tint。木(actorLayer 内の環境物)は `syncTrees` 生成時に同 tint。
- 周辺減光(vignette)の濃さを可変化し既定を 0.85→**0.92** に微増。
- アクター(キャラ/敵)・拾い物・松明やプレイヤーの光・各種グロウは**沈めない**ので、暗いベースの上で
  相対的に明るく浮く=「暗い所はとことん暗く、光の周りは明るい」の土台。
- 実機生調整URL(合った値を既定へ焼き込む):
  - `?envdark=0.6` 環境の明るさ倍率(1=従来 / 小さいほど暗い。既定 **0.62**)
  - `?vig=0.95`   周辺減光の濃さ(既定 **0.92**)
- 全体コントラスト(ColorMatrix)は使わない(前回の失敗)。

### 負荷スコア
0/10。tint と既存スプライトの alpha 変更のみ。新規フィルタパス・パーティクル・glow の追加なし。

### Verification
- `npx tsc --noEmit` / `npm run build` 成功。暗さの量は実機確認待ち(`?envdark=` で調整)。

### 次フェーズ(未着手)
- フェーズ2: 光源まわり(松明/プレイヤー光/グロウ)の加算光を強め、bloom 閾値を少し下げて
  「明るい所をより明るく」。フェーズ3: 必要なら方向性の地面明暗(light shaft/影流用)を最小限。
  ※社長の参考画像(公開URL)が来たらそれに寄せて値を詰める。

## 2026-06-15 - v0.25.307 - ナイフ以外の近接(刀/鞭/ダンス)でも松明・卵を破壊可能に (Claude Code)

### 背景
小物破壊(松明=HP12 / 虫の卵=HP1)は**通常ナイフのスイング(`triggerCounter`)だけ**に実装されており、
刀・鞭は早期return、ダンス(四神舞)は敵のみ攻撃のため、これらナイフ以外の近接では壊せなかった。

### 変更
- 共通ヘルパ `breakPropsAlong(x0,y0,ux,uy,length,halfWidth,damage)` を `gameStore` に追加。
  始点から向きへ length までのカプセル(halfWidth)内の小物を破壊。`length=0` で純円(円範囲)。
  破壊演出(スラッシュ/バースト/リング/グロー)とドロップを内包。何か当たれば true。
- 呼び出しを4経路に統一:
  - **ナイフ**: 既存のインラインループを `breakPropsAlong(円: メレー範囲)` に置換(挙動同じ)。
  - **刀**: カウンタースイング時に `breakPropsAlong(円: katanaRange)`。
  - **鞭**: 毎振り `breakPropsAlong(カプセル: 進行方向×reach, WHIP_HIT_HALF_WIDTH)`。ハリケーン有無に関わらず。
  - **ダンス**: タップ=`breakPropsAlong(円: meleeR)`、線攻撃(フリック/玄武/青龍)=`rhythmLineAttack` 内で
    `breakPropsAlong(カプセル)`。威力は `max(攻撃ダメージ,30)` で松明(12)を確実に砕く。
- 威力は近接各種とも `meleeDamage*2.5`(≈15>12)で松明を一撃破壊。

### 負荷スコア
1/10。破壊時のみ既存の軽量エフェクトを出すだけ。毎フレームの新規コストなし(振った時だけ走る)。

### Verification
- `npx tsc --noEmit` / `npm run lint` / `npm run build` 成功。

## 2026-06-15 - v0.25.306 - 手榴弾とグレネードランチャーの混同を解消 (Claude Code)

### 背景
手榴弾(heavy-grenade サブ武器)とグレネードランチャー(rifle-t3/マグナム系列の最後)が
混同されていた。特に自動タレットの「グレネード弾」が、見た目もロジックも実態は手榴弾
(fuse転がし・半径66)で、演出だけランチャー級に差し替える形になっていた。

### 変更
- 自動タレットの特殊弾(10%)を、本物のグレネードランチャー弾に変更。
  `weaponType:'rifle'` / `weaponKey: GRENADE_WEAPON_KEY('rifle-t3')` で発射し、rifle-t3 と
  同じ直進・着弾爆発(半径92)の経路を通る。見た目もランチャー弾の軌跡になる(従来は
  ホップする手榴弾の見た目)。直撃ダメージは `TURRET_LAUNCHER_DAMAGE=44`(手榴弾とは別値)。
- `weaponType:'grenade'` の爆発処理を手榴弾専用に整理。`sub-turret-grenade` 用の
  `isLauncher` 分岐(死にコード化)を削除し、常に半径66/演出440の手榴弾爆発に。
- `MainMenu` のヘビーガンナー説明文を修正: 「炸裂弾(グレネードランチャー)」→
  「手榴弾を転がし、着弾で小範囲を爆破」(実際の heavy-grenade に一致)。

### 設計の整理(別物として確定)
- 手榴弾(heavy-grenade): warrior サブ武器。fuse転がし、半径66、ダメージ42。
- グレネードランチャー(rifle-t3): マグナム系列の最後の銃。直進・着弾爆発、半径92、ダメージ95。
  自動タレットのランチャー弾もこの経路を共有。

### 負荷スコア
1/10。発射経路を既存の rifle-t3 着弾爆発に統合しただけで、毎フレームの新規コストなし。
むしろタレット用の fuse 監視分岐(isLauncher)が消えて分岐が減った。

### Verification
- `npm run lint` / `npm run build` 成功。

## 2026-06-15 - v0.25.305 - ダンスの矢印を全体的に大きく (Claude Code)

### 変更
- `pixiScene` の矢印ドットサイズ(`block`)を拡大: 入力フリック矢印 2.4→3.0 / コマンド矢印 2.2→2.8(約+25%)。
  間隔(`gap`/`cgap`)は block 依存なので自動で広がる。

### Verification
- `npx tsc --noEmit` / `npm run build` 成功。

## 2026-06-15 - v0.25.304 - ダンスUIを被写体深度(tilt-shift)の影響外に(技VFXは従来どおり) (Claude Code)

### 変更
- ダンスUI(ミラーボール/左右サークル/矢印/四神名)は filteredWorld 配下の effectLayer にあり tilt-shift でボケていた。
  → 新レイヤー **`danceUiLayer`**(filteredWorld の兄弟=フィルタ外、front forest の下=従来の重なり順)を追加し、
    これら4要素を移動。毎フレーム world と同じカメラオフセットを適用してワールド座標で追従。**常にくっきり**に。
- 四神技などの spawn される VFX(斬撃/バースト/リング)は effectLayer のまま=従来どおり被写体深度の影響を受ける。
- 暗転の挿入位置を `getChildIndex(filteredWorld)` 基準に修正(danceUiLayer 追加で index がズレるため)。
- `layers.ts`: `danceUiLayer` を SceneLayers に追加し worldGroup へ(filteredWorld の後)。

### Verification
- `npx tsc --noEmit` / `npm run build` / `npm run lint` 成功。

## 2026-06-15 - v0.25.303 - dance-140 をさらに140へ寄せる(再引き伸ばし) (Claude Code)

### 変更
- 元素材(160k)を高解像度で再測定=139.485 BPM。`atempo=1.003692` で引き伸ばし → 再測定 **139.975 BPM**。
  140との差0.025BPMは測定精度(±0.02)内=ダンス1回(~20s/47拍)で累積~4ms=知覚不可。実質ちょうど140。
- これ以上は測定ノイズの追従になるため確定。`?v=` でキャッシュ更新。

### Verification
- 再測定 139.975 BPM。`npm run build` 成功。

## 2026-06-15 - v0.25.302 - ダンス曲を正確な公称BPMに時間引き伸ばし補正(120/140) (Claude Code)

### 背景
- 実測でdance-120≈119.70 / dance-140≈139.50 BPM(公称よりわずかに遅い)。ユーザー要望「曲側を120/140ちょうどに直したい」。
  Lv1(実測100.05)はユーザーが int1=600 でズレなしと確認済み=測定精度は~0.05BPMで信頼できる。

### 修正
- `public/audio/dance-120.mp3` / `dance-140.mp3` を **ffmpeg atempo(ピッチ維持)** で公称BPMへ時間引き伸ばし:
  - 120: ×1.002506 → 再測定 **120.00 BPM**
  - 140: ×1.003584 → 再測定 **139.96 BPM**
  - 素材は git 26c214d の高音質(160k)版から、128k/48k/stereo で再エンコード。
- dance-100 は実測100.05でほぼ公称のため据え置き。
- これでゲームは公称間隔(Lv2=500 / Lv3=428.6ms)のままで曲と一致(int 上書き不要)。バージョン更新で ?v= キャッシュ更新。

### Verification
- 出力を再測定し 120.00 / 139.96 BPM を確認。`npm run build` 成功。

## 2026-06-15 - v0.25.301 - ダンス練習モードでレベル(1-3)を選べるように (Claude Code)

### 変更
- ダンス練習モードは敵なし=XPが入らずLv上げ不可だったため、キャラ選択の「🕺 ダンス練習」を **Lv1/Lv2/Lv3 ボタン**に。
  押したレベルのダンスフロアを所持して開始(サークル/曲合わせをレベル別に調整できる)。
- `gameStore`: `danceTestLevel`(1-3) + `setDanceTestLevel`。`resetGame` で `{ shijin: danceTestLevel }`。

### Verification
- `npx tsc --noEmit` / `npm run build` / `npm run lint` 成功。

## 2026-06-15 - v0.25.300 - リズムの拍グリッドを実時間(Date.now)基準に: サークルの累積ドリフト(遅れ)を解消 (Claude Code)

### 原因(確定)
- 精密測定で曲はほぼ公称BPM(100.05/119.70/139.50)=テンポずれはごく小。「遅くなる」方向はテンポ要因では説明できず、
  **gameTime が実時間より遅れる(fps低下時)** のが主因。音楽は実時間で鳴るのでサークルが累積で遅れていた。

### 修正
- リズムの**拍グリッド/判定/描画を実時間(Date.now)基準**に統一(音楽と同じ時計)。毎フレーム音声同期ではない=軽いまま。
  - `useGameLoop`: firstBeatAt を `Date.now()` 起点に。
  - `gameStore`: `setRhythmActive`/`rhythmInput`/`tickRhythm` の拍判定 gt を `Date.now()` に。
  - `pixiScene`: `syncRhythmOverlay`/`syncRhythmScreenFx` に `now`(Date.now) を渡す。
  - byakko タイマー/enter-exit(停止)タイマーは gameTime のまま(自己完結)。invulnUntil は未読で無害。
- 残る微小なテンポずれは `?int1=600&int2=501&int3=430`(実測値)で詰められる。

### Verification
- `npx tsc --noEmit` / `npm run build` / `npm run lint` 成功。

## 2026-06-15 - v0.25.299 - サークルの累積ドリフト対策: 1拍の長さ(interval)をURL上書き可能に + 切り分け (Claude Code)

### 背景
- 「サークルが段々ズレて遅くなる」=累積ドリフト。固定オフセット(bo)では直らない。原因候補:
  (a) 曲の実テンポが公称BPMとズレ → interval が合わず累積。 (b) gameTime が実時間より遅れ(fps低下)→ 音楽に対しサークルが遅れる。
- 「遅くなる」方向は (b) と整合(テンポ遅めの曲なら逆に"早くなる"はず)。実測BPM≈99.4/117.5/136(自動推定・誤差あり)。

### 追加
- `config/shijin.ts`: `rhythmIntervalForLevel` に URL 上書き `?int1=603&int2=511&int3=441`(1拍ms)。大=遅く/小=速く。
  ダンス練習モードで「サークルが曲と段々ズレるか」を見て調整。合えば既定に焼き込む。
- 切り分け: 練習モード(高fps)でもズレる → テンポ要因(interval で直る)。練習モードでズレず通常プレイ(低fps)でのみズレる
  → gameTime 遅れ要因(別途、リズムを壁時計基準にする修正を実施予定)。

### Verification
- `npx tsc --noEmit` / `npm run build` 成功。

## 2026-06-15 - v0.25.298 - 仮: ダンス練習モード(敵なし+ダンスフロアLv1所持で開始) (Claude Code)

### 追加
- キャラ選択に「🕺 ダンスモード（練習・敵なし）」ボタン。押すと選択中クラスで開始するが、**敵を一切スポーンせず**、
  **ダンスフロア(shijin)Lv1だけ覚えた状態**でスタート。サークル/フリック/曲合わせの調整用。
- `gameStore`: `danceTestMode` フラグ + `setDanceTestMode`。`resetGame` で true 時は subWeapons=['shijin'], levels={shijin:1}。
- `useGameLoop`: `danceTestMode` 時は敵スポーン3経路(連続スポナー/スクリプトwave/城ボス)を全てゲート。
- 通常「はじめる」は `setDanceTestMode(false)` を明示。

### Verification
- `npx tsc --noEmit` / `npm run build` / `npm run lint` 成功。

## 2026-06-15 - v0.25.297 - キャラ選択: 職名をカード上部の横一列(フル幅)に (Claude Code)

### 変更
- 職名(h3)をテキスト列から出し、カード上部に**フル幅のヘッダー**として配置。立ち絵の上の空きを使い、
  名前が右の狭い列で折り返して窮屈になるのを解消。立ち絵+説明(初期装備/専用スキル)の行は下に残す。
- `MainMenu`: h3 をカード直下(accentブラーの後)へ移動、テキスト列の h3 と mt-2 を撤去。行は min-h を 122 に。

### Verification
- `npx tsc --noEmit` / `npm run build` / `npm run lint` 成功。

## 2026-06-15 - v0.25.296 - キャラ選択立ち絵のズレを構造修正(説明文の量に左右されていた) (Claude Code)

### 原因(ユーザーの指摘が正解)
- カードはグリッドで等高に伸びるが、中の「立ち絵+説明文」行は `min-h-[154px]` のままでカード高さを埋めず、
  立ち絵が**説明文ブロックの下端**に揃っていた。説明文が短いカード(マークスマン)ほど立ち絵が浮く。

### 修正
- `MainMenu`: カードを `flex flex-col`、中の行に `flex-1` を付けてカード高さいっぱいに伸ばし、立ち絵を**カード下端**に
  揃える(説明文の量に依存しない)。マークスマンの暫定ナッジ(12)を 0 に戻す(構造修正で浮き解消)。

### Verification
- `npx tsc --noEmit` / `npm run build` 成功。

## 2026-06-15 - v0.25.295 - 鞭ハリケーンに巻き込みダメージ追加 / 死神・召喚の攻撃をダメージ数字で可視化 (Claude Code)

### 鞭ハリケーン(トルネード)に攻撃を追加
- これまで吸引のみ。死神と同じく**巻き込んだ敵へ0.5秒ごとにAoEダメージ**(`HURRICANE_DAMAGE=10` / `HURRICANE_DAMAGE_INTERVAL_MS=500`)。
  `tickHurricane` に `lastDamageAt` を追加し周期判定。`damageEnemy`+`spawnDamageNumber` で適用＆可視化。

### 死神・召喚の攻撃が「見えない」問題
- 死神(レア召喚)は元々AoEダメージ(10/0.5s)を与えていたが、`damageEnemy` は**ダメージ数字を出さない**ため
  「攻撃してない」ように見えていた。`updateSummons` の attackHits に座標を持たせ、適用時に `spawnDamageNumber` で可視化。
  通常召喚の接触攻撃も同様に数字表示。

### Verification
- `npx tsc --noEmit` / `npm run build` / `npm run lint` 成功。

## 2026-06-15 - v0.25.294 - マークスマン立ち絵を下げる / 被写体深度(tilt-shift)をURL生調整可能に (Claude Code)

### マークスマン立ち絵
- 実機スクショで他3人より浮いて見える(暗いコートで視認上の足元が高い)。`portraitNudgeY` を 0→12 に下げる。
  ※コート裾はカード下端で見切れるが暗色で目立たない。次のスクショで微調整予定。

### 被写体深度(tilt-shift)のURL生調整
- 参考(HD-2D)に合わせて範囲を詰められるよう、URLで上書き可能に(`pixiScene.ts`):
  `?tsblur=18`(端の最大ボケ) / `?tsgrad=280`(くっきり→ボケの距離px。小=焦点帯が狭い) / `?tsband=0.5`(くっきり帯中心0..1) / `?ts=0`(無効化)。
  合った値を既定(BLUR=14 / GRADIENT=440 / BAND=0.46)に焼き込む。

### Verification
- `npx tsc --noEmit` / `npm run build` / `npm run lint` 成功(既定値据え置き)。

## 2026-06-15 - v0.25.293 - サークル位相オフセットの実機生調整用URLパラメータ (Claude Code)

### 追加
- `?bo1=80&bo2=-40&bo3=120` のようにURLで各レベルのビートオフセット(ms)を上書きできる(`config/shijin.ts`)。
  実機でサークルと曲のビートを見比べながら値を探し、合ったら `RHYTHM_BEAT_OFFSET_MS_BY_LEVEL` に焼き込む。
- 正=サークルが遅れて中央に来る / 負=早く来る。

### Verification
- `npx tsc --noEmit` / `npm run build` 成功。

## 2026-06-15 - v0.25.292 - キャラ選択の立ち絵の上下ズレを足元揃えに (Claude Code)

### 原因
- 立ち絵スプライト(128x108)はキャラごとにキャンバス底からの足元の隙間が違う: shotgun=4px / magnum=0 /
  scavenger=0 / striker=1px。`items-end`(下揃え)でキャンバス底は揃うが、中の足元がズレて見えていた。

### 修正
- `MainMenu`: 各キャラに `portraitNudgeY`(画面px)を追加し、立ち絵を少し下へずらして**足元を底ライン(影)へ揃える**。
  値 = 隙間(canvas px) × 描画拡縮(86/128≒0.672)。warrior=2.7 / necromancer=0.7 / 他=0。img の transform に translateY を追加。

### Verification
- `npx tsc --noEmit` / `npm run build` / `npm run lint` 成功。

## 2026-06-15 - v0.25.291 - サークル位相をレベル別の決め打ちオフセットで合わせる(同期なし) (Claude Code)

### 背景/方針
- ダンスのサークル(足元で重なる=拍)は既に固定 gameTime グリッドだけで動作(同期なし・軽い)。
- 「ずれ」の正体は、視覚グリッドの位相(firstBeatAt=開始+LEAD)と曲の実ビート位相のズレ。曲はダンス開始で
  currentTime=0 から鳴るので、**ダンス開始からの固定オフセット**でビート位相を合わせられる(同期不要)。

### 変更
- `config/shijin.ts`: `RHYTHM_MUSIC_OFFSET_MS`(単一0)を撤去し、**レベル別の決め打ちオフセット**
  `RHYTHM_BEAT_OFFSET_MS_BY_LEVEL = [0,0,0,0]`(idx0=フォールバック/1/2/3)+ `rhythmBeatOffsetForLevel(level)` を追加。
  正=サークルが遅れて中央に来る / 負=早く来る。
- `useGameLoop`: firstBeatAt に `rhythmBeatOffsetForLevel(lvl)` を加算。
- 調整方法: 実機でサークルと曲のビートを見比べ、各レベルの値(ms)を決め打ちで詰める。

### Verification
- `npx tsc --noEmit` / `npm run build` / `npm run lint` 成功(既定値0=従来挙動)。

## 2026-06-15 - v0.25.290 - 共存不可スキル取得で他スキルをリセット / 再プレイのミラーボール巨大化を修正 (Claude Code)

### 共存不可スキル取得時のリセット
- 刀/村雨/ダンスフロアなどの**排他スキルを取得したら、同グループ以外の取得済みスキルを除去(リセット)**。
  - `gameStore` `applySubWeaponCard`: `EXCLUSIVE_SUBWEAPON_GROUPS`([katana,murasame] / [shijin])を追加。排他キー取得時に
    subWeapons/subWeaponLevels を同グループのみへ絞る。レベルアップ・ショップ購入の両経路に適用される。

### ミラーボール巨大化バグ(再プレイ)修正
- 症状: ダンスフロア取得→ゲームオーバー→再プレイ→またダンスフロアでミラーボールが画面を埋め尽くす。
- 原因: `resetGame` が **rhythm 状態をリセットしていなかった**。前ゲームの `lastTapAt`(大きい値)が残り、再プレイで
  gameTime が0に戻るため `tapT = 1-(gameTime-lastTapAt)/GLOW` が1を大幅超過 → 発光倍率 `pulse` 巨大化 → 球が巨大化。
- 修正: ①`resetGame` に `rhythm: initialRhythm()` を追加(根本)。②`pixiScene` で `tapT` を [0,1] にクランプ(保険)。

### Verification
- `npx tsc --noEmit` / `npm run build` / `npm run lint` 成功。

## 2026-06-14 - v0.25.289 - スキルは通常2つまで(排他除く) / 装備中スキルをHUD表示 (Claude Code)

### スキル所持上限
- 通常スキル(=排他サブ 刀/村雨/ダンスフロアを除くサブウェポン)は**ゲーム全体で2つまで**。
  - `upgradeUtils`: `EXCLUSIVE_SUBS`(katana/murasame/shijin)を除いた所持数を数え `atSkillCap`(>=2)。
    新規取得カードは `canNewSkill(lvl)=lvl>0||!atSkillCap` でゲート(既所持の昇格は常に可)。刀/ダンスフロアは上限外。

### 装備中スキルの表示
- `GameHUD`: 武器パネルの上(左下)に**装備中スキルのチップ**(名前+Lv)を表示。`subWeaponDisplayName` を使用。
  村雨所持時は刀チップを出さない。`player.subWeaponLevels` を shallow 購読に追加(参照安定=毎フレーム再描画しない)。

### Verification
- `npx tsc --noEmit` / `npm run build` / `npm run lint` 成功。

## 2026-06-14 - v0.25.288 - ダンススキルを「ダンスフロア」に改名+刀と同じ排他 / 刀フリックも即発火に統一 (Claude Code)

### ダンスフロア(旧 四神舞)
- 表示名を **四神舞 → ダンスフロア** に(`gameStore` 表示名 / `upgradeUtils` カード名・説明)。
- **刀と同じ排他**: ダンスフロア装備中は他の通常サブウェポン(鞭/シールド/タレット/錬金/デコイ/各クラス技/刀・村雨)を
  レベルアップに出さない。ダンスフロア自身の昇格カードは出る。**銃のみ共存**。
  - `upgradeUtils`: `ownsShijin`/`blockNormalSubs` を追加し、通常サブを `!blockNormalSubs` に。刀カードは `!ownsShijin`。
  - `subWeaponBlockedByKatana`(実行時ブロック)を拡張: shijin 装備中は shijin 以外のサブを停止(銃は別系統で影響なし)。

### 刀フリックの即発火統一
- 刀の一閃ダッシュも v0.25.287 と同じ「スワイプした瞬間に即発火」に統一(離す瞬間ではなく振った瞬間)。
  - `VirtualJoystick`: `tryFireKatanaDash` を move 中(非リズム)に呼ぶ。1接触一度・ダッシュ成立時のみ消費(CD中は再試行)。
    カウンターは従来どおり「指を離した瞬間」。release からダッシュ判定を撤去。`flickFiredRef` を四神/刀で共用。

### Verification
- `npx tsc --noEmit` / `npm run build` / `npm run lint` 成功。

## 2026-06-14 - v0.25.287 - ダンスのフリック判定をスマホ音ゲー方式(スワイプ即発火)に (Claude Code)

### 背景
- フリックが「不安定」。原因は**判定が指を離した瞬間の速度依存**だったこと(素早く振って止めて離すとタップに化ける)。

### 変更(ユーザー選択: スワイプ即発火＋発火時方向優先・許容広め)
- リズム中のフリックを**スワイプが閾値を超えたその瞬間に即確定**(離す瞬間に依存しない)。1接触1回、
  方向は発火時の直近軌跡ベクトルで固定(arrowFromDirの90°コーン=許容広め)。判定はその時刻でジャスト判定。
- `VirtualJoystick.tsx`: `tryFireRhythmFlick()` を pointermove 中(rhythm.active時)に呼ぶ。`rhythmFlickFiredRef`
  で1接触1回に制御。release は「未発火ならタップ」。離す瞬間の `detectFlick`(rhythm経路)は撤去。
  戦闘の一閃ダッシュ(非rhythm)は従来の離す判定のまま=手触り不変。
- `config/shijin.ts`: 即発火しきい値 `RHYTHM_FLICK_FIRE_DIST=30px` / `RHYTHM_FLICK_FIRE_SPEED=0.5px/ms` /
  `RHYTHM_FLICK_FIRE_WINDOW_MS=120`(距離主体・速度は katana 0.9 より緩め)。

### Verification
- `npx tsc --noEmit` / `npm run build` / `npm run lint` 成功。実機で手触り(発火しやすさ/誤爆/方向)を調整。

## 2026-06-14 - v0.25.286 - ダンス中のカウンター反射はスローモー無しに (Claude Code)

### 変更
- カウンター(敵弾反射)成立時のスローモー(`triggerTimeSlow`)を、**四神舞(ダンス)中は発動しない**よう gate。
  リズムが乱れないように。グロー/リング/バースト/Counter!表示などの演出は残す。
- `useGameLoop.ts`: 反射成立ブロックで `!rhythm.active` の時だけ `triggerTimeSlow`。

### Verification
- `npx tsc --noEmit` / `npm run build` 成功。

## 2026-06-14 - v0.25.285 - 性能調整: レベルアップ周辺ノックバック / ダンスのバッシュ・ダメージ・カウンター (Claude Code)

### ゲーム全般
- **レベルアップ時、プレイヤー周辺の敵を強制ノックバック(2倍相当)**。アップグレードメニューで即ポーズする
  ため velocity 式だと失効する → その場で**位置を即押し出す**(木/小物の当たりは解決、reaper除外)。黄色リング演出付き。
  - `gameStore.ts` `levelUp`: 半径 `LEVELUP_KNOCKBACK_RADIUS=240` 内を `LEVELUP_KNOCKBACK_DISTANCE=96` 押し出す。

### ダンス(四神舞)調整
1. **バッシュ(フリック): ノックバック距離2倍 + 近接フィニッシュ可**。
   - `knockbackEnemy` の強度クランプ(従来 min3)に `maxStrength` 引数を追加。フリックだけ `RHYTHM_FLICK_KNOCKBACK_MAX=6`
     を渡して上限6(=距離2倍)。`rhythmLineAttack` に `kbMax` を追加し透過。
   - フリックの `execute` を `true` に(スタン中の雑魚を近接フィニッシュで処刑。ボスは処刑しない既存仕様のまま)。
2. **ダンス全体のダメージ効率2倍**(`shijin.ts`): タップ4→8 / フリック12→24 / 朱雀48→96 / 玄武30→60 /
   青龍30→60 / 白虎16→32 / 全体フィニッシュ(ボス)120→240。
3. **タップ/フリックでカウンターが発動していなかったのを修正**。`openCounterWindow()` を追加し、タップ・フリック
   実行時にカウンター窓を開く。窓中に当たった敵弾はループ側で反射(=Counter!)。クールダウンは見ない(拍ごとに張れる)。
   - 注: 反射成立時のスローモーは既存のカウンター演出(弾を実際に反射した時のみ)。不要ならダンス中は抑制可能。

### Verification
- `npx tsc --noEmit` / `npm run build` / `npm run lint` 成功。実機での手触り調整待ち(数値は config 一箇所で変更可)。

## 2026-06-14 - v0.25.284 - ダンス曲を軽量フル尺に戻す(8小節ループの継ぎ目ぶつ切り対策) (Claude Code)

### 症状
- ダンス曲(8小節シームレスループMP3)を要素 `loop=true` で回すと、**継ぎ目がぶつ切り**になる
  (HTMLAudioElement の loop はギャップが出る。13〜19秒ごとに当たるので目立つ)。

### 対応
- ダンス曲を**軽量フル尺**に戻す。`git` 履歴(26c214d, 160k/48k)からフル尺を復元し、**128k/48k/stereo**へ再エンコード。
  - `public/audio/dance-100.mp3`(268s/4.3MB) / `dance-120.mp3`(205s/3.3MB) / `dance-140.mp3`(187s/3.0MB)
- フル尺なら継ぎ目(末尾→先頭)は3〜4分に1回でダンス中はほぼ当たらない。要素再生なので軽い(現行方式のまま)。
- `src/audio/audioManager.ts`: `DANCE_LOOP_TRACKS` を `-loop.mp3` → フル尺 `dance-1{00,20,40}.mp3` に変更。
  `unlockDanceAudio` は同定数を参照するので自動追従。方式(単一要素src差し替え+gesture unlock)は不変。
- 旧 8小節ループ素材(`dance-*-loop.{wav,mp3}`)は未使用化(当面残置)。

### 備考
- フル尺は各ダンス突入で頭(イントロ)から再生される。盛り上がり頭出しが欲しい場合は別途調整 or 素材差し替えで対応可。
- もっと良い軽量フル素材があればユーザー提供で差し替え可能。

### Verification
- `npx tsc --noEmit` / `npm run build` 成功。実機で「継ぎ目のぶつ切りが減ったか」を確認待ち。

## 2026-06-14 - v0.25.283 - スタート時に複数曲が重なる代償を解消(unlockの一時要素をミュート維持) (Claude Code)

### 症状
- v0.25.280+ の `unlockDanceAudio()`(スタート操作でダンス曲リソースを解錠)の代償で、
  **ゲーム開始時に複数の曲が一瞬重なって鳴る**。

### 原因
- 解錠用の一時 `Audio` 要素を `muted` で play した後、`.then` で **pause 直後に `muted=false`/`volume` を戻していた**。
  pause が効き切る前に un-mute するため、4本(戦闘+ダンスLv1/2/3)それぞれの頭が一瞬鳴って重なる。

### 修正
- `src/audio/audioManager.ts` `unlockDanceAudio`: 一時要素は使い捨てなので **最後までミュート維持**。
  pause 後の `muted`/`volume` 復帰を削除。解錠(=ジェスチャ内 play)はミュートのままでも成立する。
- 方式(単一BGM要素 src差し替え + gesture unlock)は維持。Web/iOS Safari 向け暫定対策である点も不変。

### Verification
- `npx tsc --noEmit` / `npm run build` 成功。実機で「スタート時に曲が重ならない」を確認待ち。

## 2026-06-15 - v0.25.282 - Claude Code移行準備とダンスBGM成功候補の確定メモ (Codex)

### Summary
- Claude Codeへactive developerを戻すための引き継ぎ準備。
- `v0.25.280` の実機結果を成功候補として明記:
  - ユーザー確認: 「うん、上手くいってる。微調整は必要だけど。」
  - 方式: 単一BGM要素の `src` 差し替え + スタート操作時の `unlockDanceAudio()`
  - 問題の主因: Web/iOS Safariの自動再生制限と音声再生経路差。ダンスVFXではない。
- `v0.25.281` のコメントどおり、この音声対策はWeb/iOS Safari向け。ネイティブアプリ移行時は削除し、アプリ側音声エンジンでBGM切替を実装する。
- 次のClaude Code側作業は、`v0.25.280/281`の方式を維持したまま微調整すること。Web音声対策を不要に戻さない。

### Verification
- `npm run lint`
- `npm run build`

## 2026-06-15 - v0.25.281 - アプリ移行時に消すWeb音声対策メモを追記 (Codex)

### Summary
- `v0.25.280` のダンスタイムBGM対策について、ソースコメントに明記:
  - 単一BGM要素 `src` 差し替え
  - スタート操作時の `unlockDanceAudio()`
  - どちらも Web/iOS Safari 向けの暫定対策
  - ネイティブアプリ移行時は削除し、アプリ側の音声エンジンでBGM切替を実装する

### Verification
- `npm run lint`
- `npm run build`

## 2026-06-15 - v0.25.280 - 単一BGM要素src差し替えをジェスチャ解錠付きで再検証 (Codex)

### 279の実機結果
- 表示version: `0.25.279`
- 通常FPS: `60`
- ダンスFPS: `20`
- ダンス曲: 鳴る

結論: レベル別固定 `HTMLAudioElement` 方式は「鳴る」が、実機では `v0.25.278` の Web Audio buffer loop と同じくダンス中だけ20fpsまで落ちる。固定複数要素方式も最終解ではない。

### Summary
- handoff の次順位案に進めた:
  - BGM要素を1本だけに戻す。
  - ダンス中は同じBGM要素の `src` を該当ダンスMP3へ差し替える。
  - ダンス終了時は300ms遅延して戦闘BGMへ戻す。
  - `loadeddata` / `canplay` / `canplaythrough` でも再生を再試行する。
  - スタート操作中に戦闘曲とLv1/Lv2/Lv3ダンス曲を一時HTMLAudioElementで muted play/pause し、リソース解錠を試す。
- 狙い:
  - `v0.25.269` 系で確認済みの「単一要素src差し替えは軽い」を維持。
  - これまでの無音問題をジェスチャ解錠で潰せるか確認する。

### Performance
- Old load score: `1/10` expected if the single-element swap remains the same as the low-power-OFF `v0.25.269` behavior.
- Performance Budget Score impact: 未確認。狙いは通常60 / ダンス57〜60付近。
- 実機確認が必要:
  - 画面表示 version `0.25.280`
  - 通常FPS / ダンス中FPS / ダンス曲が鳴るか
- もし音が鳴らずFPSだけ軽い場合は、temporary element の muted unlock では単一BGM要素の差し替え先解錠に不十分。
- もし音が鳴ってFPSも軽ければ採用候補。

### Verification
- `npm run lint`
- `npm run build`

## 2026-06-15 - v0.25.279 - ダンスBGMをレベル別固定HTMLAudioElementで再評価 (Codex)

### Summary
- GitHub latest `v0.25.278` / `77a6b6c` を fast-forward で取り込み。
- `HANDOFF_DANCE_AUDIO.md` を読み直し、未検証の本命案に合わせて実装:
  - ダンス曲の長尺 `AudioBufferSourceNode` ループを停止。
  - Lv1/Lv2/Lv3 それぞれに固定 `HTMLAudioElement` を生成。
  - ダンス中は戦闘BGM要素を pause し、該当レベルのダンス要素だけを play。
  - `src` 差し替えはしない。
  - `rhythm.active` の一瞬の揺れによる「ダダダ」防止として、同レベル再生中は鳴らし直さず、停止は300ms遅延。
  - スタート操作時に `unlockDanceAudio()` を呼び、各ダンス要素を muted で短く play/pause して解錠を試す。
- 音楽同期撤去後に残っていた `RHYTHM_MUSIC_OFFSET_MS` の未使用 import を削除。
- `package-lock.json` の自プロジェクト version が古い `0.25.207` のままだったため、`0.25.279` に合わせた。

### Performance
- Old load score: `2/10` expected, but device-dependent.
- Performance Budget Score impact: 未確認。狙いは `v0.25.278` の長尺Web Audio buffer loopより低負荷化。
- 実機確認が必要:
  - 低電力モードOFF
  - 充電ケーブル接続
  - 画面表示 version `0.25.279`
  - 通常FPS / ダンス中FPS / ダンス曲が鳴るか
- もし音が鳴らない場合は、muted unlock では iOS の per-resource 解錠に不十分だった可能性。
- もし鳴るが重い場合は、固定複数HTMLAudioElement自体が端末で重い可能性。

### Verification
- `npm run lint`
- `npm run build`

## 2026-06-14 - v0.25.278 - 音が出る唯一の方式=Web Audioバッファへ確定。低電力OFFで素のFPS再測定 (Claude Code)

### 276の結果と判断
- 差し替え後再生を堅牢化(即時+各種canplayイベント)してもダンス曲は無音 → **やはり自動再生ポリシー**で
  「ゲーム中に新しい曲へ差し替え」はブロックされる(戦闘曲への戻りは最初に許可済みだから鳴る)。
  → **src差し替え方式ではダンス曲は構造的に鳴らせない**(確定)。
- 276のFPS30は**低電力モード再ON**のサイン(本来60の土台が30固定は低電力の典型)。
- 音が出るのは自動再生ブロックを受けない **Web Audioバッファ方式だけ**。275の20fpsも低電力の可能性大。
  (ループ buffer の再生CPUはバッファ長に依らず一定。ハリケーンの loop buffer は軽い=長尺ダンスも本来軽いはず。)

### 対応
- audioManager を 275(Web Audioバッファでダンス曲再生＋連打防止)に戻す。getMusicTimeMs は再削除(277の掃除を維持)。
- 低電力モードを**確実にOFF＋充電ケーブル接続**で、通常/ダンスの素のFPSを取り直してもらう。

### 確認してほしいこと
- 低電力OFF(電池が減ると自動再ONするので充電しながら)で v0.25.278:
  (1)通常FPS (2)ダンスFPS (3)ダンス曲が鳴るか。バッファ方式は音は出るはず=FPSが土台60付近なら完成。

## 2026-06-14 - v0.25.277 - 音楽同期の死にコードを完全撤去(フレーム処理に残骸なしを確定) (Claude Code)

### 背景(ユーザー確認依頼)
- 「サークルと曲を同期させる動き・フレーム処理に残ってる処理はない?」
- 調査結果: 毎フレームの位相再同期(resync)は v0.25.250 で既に廃止済み。サークルは固定 gameTime グリッドで
  一定に動く。ただし紛らわしい死にコードが残っていた:
  - `resyncRhythm`(store): 定義のみでどこからも未呼び出し。
  - `getMusicTimeMs()`(audioManager): null 固定。useGameLoop でダンス開始の1回だけ呼ばれ、`if(musicMs!==null)`
    ブロックは常にスキップ＝実質no-op。
  - `RhythmState.lastMusicMs`: resync 専用フィールド。

### 撤去
- `gameStore.ts`: `resyncRhythm` 実装・interface・`lastMusicMs` 初期化/リセットを削除。
- `types/game.ts`: `RhythmState.lastMusicMs` を削除。
- `audioManager.ts`: `getMusicTimeMs` を削除。
- `useGameLoop.ts`: `getMusicTimeMs` import と、ダンス開始時の musicMs 分岐(死にコード)を削除。
  firstBeatAt は固定 gameTime グリッドのみで算出(挙動は変わらない=従来も null 分岐は通っていない)。

### Verification
- `npx tsc --noEmit` / `npm run build` 成功。フレーム処理系に音楽同期の残骸なしを確定。挙動は不変。
- 毎フレーム走るのは tickRhythm(固定グリッド上の取りこぼし判定のみ)で音楽同期はしない。

## 2026-06-14 - v0.25.276 - 軽い単一要素src差し替えへ回帰＋差し替え後再生を堅牢化(無音解消) (Claude Code)

### 275の結果(低電力OFF)
- 連打(ダダダ)は解消。だが **Web Audio バッファのループ再生はダンス中20fpsで重い**(258の重さは低電力では
  なくバッファ再生そのものだった。短いSFXは軽いが、長いループ常時再生はこの端末で重い)。
- 端末特性の最終整理: 連続バッファ=重い(20)、要素2つ=重い(9)、**要素1つ・src差し替え=軽い(57)**。
- 271の「差し替え無音」は自動再生ブロックではない(戦闘曲への戻りは鳴った=既ロードだから)。
  ダンス曲は差し替え直後まだ未ロードで、1回の play()/canplay 待ちが外れて鳴らなかった可能性。

### 対策
- バッファ方式を捨て、**軽い「要素1つ・src差し替え」へ回帰**(通常=戦闘曲、ダンス=ダンスMP3)。
- `playBgmRobust()`: 差し替え後は即時 play() に加え `loadeddata/canplay/canplaythrough` でも再生を試行。
  token で「さらに差し替え/停止」した古い試行を無効化。これで未ロードでも準備でき次第“確実に”鳴る。
- `src/audio/audioManager.ts` を 272(単一要素MP3差し替え)から復元し applyBgm の再生だけ堅牢化。

### Verification
- `npx tsc --noEmit` / `npm run build` 成功。実機(低電力OFF)で「ダンス曲が鳴る＋57fps前後」を確認待ち。

## 2026-06-14 - v0.25.275 - ダンス曲の連打(ダダダ)を防止: 同レベル再起動なし＋停止ディレイ (Claude Code)

### 274の結果
- ダンス曲は**鳴った**(バッファ方式で自動再生もクリア)。が「ダダダダダ」=頭から高速で鳴り直す連打。
- 原因: `rhythm.active` が一瞬 false に揺れると `setDanceMode(false)→(true)` が高速往復し、バッファが
  stop→start を繰り返す(267の要素再生は冪等寄りで目立たなかっただけ)。コード自体は単発呼び出しなら正しい。

### 対策
- `startDanceBuffer`: 既に同レベルを再生中なら**鳴らし直さない**(`danceSourceLevel` で判定)。
- `applyDanceBuffer`: 停止を即時にせず **300ms ディレイ**。再生条件が戻れば cancel = 一瞬のチラつきで止め→
  鳴り直しが起きない。レベル変更時のみ即 stop。

### Verification
- `npx tsc --noEmit` / `npm run build` 成功。実機(低電力OFF)で「ダンス曲が普通にループ＋連打しない」を確認待ち。

## 2026-06-14 - v0.25.274 - ダンスBGM本実装: SFXと同じWeb Audioバッファで鳴らす(差し替え無音を根治) (Claude Code)

### 273の結果＝原因確定
- 起動時の曲をダンス1ファイルにしたら **起動時は鳴った**(ファイルは無罪)。だがゲーム中の差し替えは無音。
- → 無音の正体は **ブラウザの自動再生ポリシー**。起動時はスタートのタップで許可され鳴るが、ダンスは操作なしで
  始まるため、要素に新しい src を読ませて play() してもブロックされる(MP3でも同じ)。

### 本実装(根治)
- ダンス曲は **SFXと同じ Web Audio のデコード済みバッファ**で鳴らす(`AudioBufferSourceNode` ループ)。
  Web Audio は一度解錠すれば操作なしで鳴り続けられる(SFXが実証)＝自動再生ブロックを受けない。
- **2つ目の HTMLAudioElement を作らない**ので軽い(端末特性: 要素2つ以上で重い)。ダンス中は戦闘要素(1つ)を pause。
- `src/audio/audioManager.ts`: src差し替え/canplay実装を撤去。danceBuffers/loadDanceBuffer/startDanceBuffer/
  stopDanceBuffer/applyDanceBuffer を追加。preload で3レベル分を decodeAudioData 事前デコード。
  setDanceMode は戦闘要素 pause + ダンスバッファ再生。volume/mute/active で danceGain・applyDanceBuffer 反映。
- 注: 258 でも同じバッファ方式を試して重かったが、それは**低電力モードの汚染**(今回は低電力OFF前提)。

### Verification
- `npx tsc --noEmit` / `npm run build` 成功。実機(低電力OFF)で「ダンス曲が鳴る＋57fps前後」を確認待ち。

### Performance（load score: 1/10）
- 追加は AudioBufferSource 1本(SFXと同経路)。HTMLAudioElement は常に1つ。差し替えも2要素も不使用。

## 2026-06-14 - v0.25.273 - 診断: 起動時の通常曲をダンス1ファイルに設定 (Claude Code)

### 272の結果
- 両方軽い(MP3差し替えは軽い)が、**ダンス曲はMP3でも無音**(戦闘曲への戻りは鳴る)。
  → フォーマット(WAV/MP3)ではなく「**ダンス曲ファイルへの差し替え固有**」の問題の疑い。

### 切り分け
- 起動時の通常曲(=戦闘曲の枠)を `dance-100-loop.mp3` に設定(`BGM_DIAG_DANCE1`、既定true)。
  - 起動時に鳴る → ファイルは無罪。無音は「差し替え」固有(canplay待ちの実装/タイミング等)を疑う。
  - 起動時も鳴らない → このダンスMP3が要素で鳴らない(エンコード等ファイル側)。
- `?bgm=normal` で本来の戦闘曲へ。

## 2026-06-14 - v0.25.272 - ダンス曲をMP3化(WAVへの差し替えは無音、MP3なら鳴る) (Claude Code)

### 271の結果
- 通常=戦闘曲OK。**ダンス曲(WAV)だけ鳴らない**。ダンス終了→戦闘曲(MP3)へ戻ると鳴る。FPS 45-50。
- → mid-game の src 差し替えは機能している。ただし **WAVへの差し替えは無音、MP3への差し替えは鳴る**。

### 対策
- ダンス曲を **MP3 化**(`ffmpeg -c:a libmp3lame -b:a 192k -ar 48000`)。
  `public/audio/dance-100/120/140-loop.mp3`(各約330〜460KB。WAVの3.7MB→大幅軽量)。
- `DANCE_LOOP_TRACKS` を `.mp3` に変更。実装は271のまま(単一要素・src差し替え・canplay待ち・素再生)。
- MP3は小さいので差し替え時の読み込みも軽く、FPSも改善が期待できる。

### Verification
- `npx tsc --noEmit` / `npm run build` 成功。実機(低電力OFF)で「ダンス曲が鳴る＋FPS」を確認待ち。

### Performance（load score: 1/10）
- 同時に存在する音声要素は常に1つ。ダンス曲は約400KBのMP3。重い経路は不使用。
- 既知点: MP3ループは継ぎ目に小さな隙間が出る場合あり(エンコーダのパディング由来)。気になれば後日詰める。

## 2026-06-14 - v0.25.271 - ダンスBGM本実装: 単一要素のsrc差し替え+canplay待ちで無音解消 (Claude Code)

### 確定した端末特性(低電力OFFで再計測)
- 269(=266/単一要素・src差し替え)= 通常60/ダンス57fps(軽い)。270(=267/2つのrouted要素)= ダンス9fps(重い)。
  → **HTMLAudioElementは「1つだけ」なら軽い、「2つ以上」だと片方をpauseしても重い**。1要素ならsrc差し替えも軽い。
- 残課題は「src差し替え直後にすぐ play() すると無音」(265/266)。

### 実装
- **唯一の BGM 要素**の src を 戦闘↔ダンス で差し替える(2要素は作らない=軽い)。
  通常=戦闘曲(BGM_TRACKS[0])、ダンス=そのレベルのダンス曲(DANCE_LOOP_TRACKS[level])。
- 無音対策: `applyBgm` で src を変えたら、すぐ play() せず **canplay を待ってから再生**(既に読めていれば即時)。
- `preloadAllAudio` でダンス曲3つを HTTP キャッシュへ事前ウォーム(差し替え時のヒッチ抑制)。
- BGMは素再生(element.volume / `?bgmroute=on`で従来ルーティング。routedだと差し替え後に無音になるので既定は素)。

### Verification
- `npx tsc --noEmit` / `npm run build` 成功。実機(低電力OFF)で「ダンス中:ダンス曲が鳴る＆57fps前後」を確認待ち。

### Performance（load score: 1/10）
- 同時に存在する HTMLAudioElement は常に1つ。重い経路(2要素/AudioBufferSource)は不使用。
- 既知点: iOSは素再生で音量スライダーが効かない(再生はする)。ループ継ぎ目は要素 loop の微小ギャップ(WAVなので小)。

## 2026-06-14 - v0.25.270 - v0.25.267相当(2つのrouted要素)を低電力OFFで再評価 (Claude Code)

### 判明
- 269(=266相当)を低電力OFFで計測 → **通常60fps / ダンス57fps**(追加負荷-3fps)。266方式は元から軽かった。
  これまでの「重い」はほぼ全部 **低電力モード**の汚染だった。
- ただし 269/266 は **ダンス中が無音**(routed/un-routed問わず src 差し替え後は鳴らない=本物の課題)。

### 方針
- 無音を避けるには src 差し替えをしない=「専用の2つ目の要素」方式(267)が正解。267の10fpsも低電力のせいの
  はずなので、**低電力OFFで再評価**する。267コミット(99510f3)から audioManager.ts を復元。
  - 戦闘BGM=routed単一要素(固定)。ダンス=レベル毎の専用要素を各々ルーティング(src差し替えなし=音が出る)。
  - ダンス中は戦闘要素を pause、同時に鳴る系統は常に1つ。

### 確認してほしいこと（低電力OFFで）
- 通常プレイFPS / ダンス中FPS / ダンス中に**ダンス曲が鳴るか**。60/57前後＋音アリなら完成。

## 2026-06-14 - v0.25.269 - v0.25.266相当に巻き戻し(低電力モードOFFで再計測するため) (Claude Code)

### 経緯
- 直近の「常時30fps」は **端末の低電力モード**が原因(ユーザーが気づく)。264〜267の計測は全部これに汚染されていた。
  特に266は通常30/ダンス25fps=ダンスの追加負荷がごく小さい(-5fps)のに、267は-19fps。266の方式の方が軽い可能性。
- そこでユーザー指示により **音声まわりを v0.25.266 相当に巻き戻し**、低電力モードOFFで素のFPSを取り直す。

### 内容
- `src/audio/audioManager.ts` を 266 のコミット(6d6332c)から復元。
  - 通常プレイ=ダンスlevel1(routed要素・起動時)、ダンス中=戦闘MP3へ src 差し替え。
  - `BGM_USE_WEBAUDIO_ROUTING`(既定false)=BGMは素再生(element.volume)。`?bgmroute=on`で従来ルーティング。
  - ※266ではダンス中が無音だった(差し替え後の無音)。今回は「低電力OFFでのFPS」を見るのが目的。

### 確認してほしいこと
- 低電力モードOFFでフル再読込し、(1)通常プレイのFPS (2)ダンス中のFPS (3)音の有無 を計測。

## 2026-06-14 - v0.25.268 - ダンス専用BGMは断念し263の軽い構成へ戻す + 端末発熱の疑い (Claude Code)

### 重要な観測
- v0.25.267 は **ミュートしても30fps**(ユーザー報告)。音を切れば音声コードは何も再生しないのに30fps。
  → 直近の30fpsは **音声コードが原因ではない**。約1時間の重いビルド連続テストで **端末が発熱(サーマルスロットリング)**
    している可能性が高い(263を「軽い」と確認した時刻より後に悪化)。
- ここまで(257〜267)でダンス専用音声は全方式が重い/無音と判明。唯一「単一 routed 要素を差し替えず鳴らす」=263 が軽い。

### 対応
- ダンス専用BGMを断念し、**ダンス中も戦闘BGMをそのまま流す**(音声は一切いじらない=最も軽い=263相当)を正式版に。
- `src/audio/audioManager.ts`: ダンス専用要素/ルーティング/prewarm/applyDanceEl を全撤去。setDanceMode は
  danceActive を更新するだけ(音声は戦闘BGMのまま)。applyBgm から `!danceActive` 条件を除去。

### Verification
- `npx tsc --noEmit` / `npm run build` 成功。
- 推奨: **端末を一度冷ましてから** v0.25.268 をフル再読込し、通常プレイの素のFPSを確認。これで60fpsに戻るなら
  直近の30/10fpsはスロットリング由来。冷えた端末でなら 267 の「2 routed 要素」方式の再評価も可能。

## 2026-06-14 - v0.25.267 - ダンスBGM本実装: 専用の2つ目の要素もWebAuidoルーティングして鳴らす (Claude Code)

### 266の結果(決定的)
- BGMを素再生(element.volume)にしたら **全体30fps/ダンス25fps・無音**。
  → この端末は **WebAudio(MediaElementSource)経由=軽い、要素の素再生=重い**(259が重かったのも素再生だったから)。
  → 一方 routed 要素は **src 差し替え後に無音**(265)。「routed要素を差し替えず鳴らす」だけが軽い＆音が出る(261/263)。

### 本実装(勝ち筋)
- ダンス曲は **専用の2つ目の要素(レベル毎)を用意し、それも WebAudio へルーティングして鳴らす**(src差し替えしない)。
  ダンス中は戦闘要素を pause し、同時に鳴る系統を常に1つに保つ(=戦闘時と同じ負荷=軽い)。
- `src/audio/audioManager.ts`:
  - 戦闘BGMは BGM_TRACKS[0] 固定・常時ルーティング(266の素再生フラグ撤去)。
  - `danceEls`(level→{el,gain,routed})。`ensureDanceEl`/`ensureDanceRouting`(要素毎に createMediaElementSource→
    gain→destination)/`applyDanceEl`(現レベルのみ再生・他は pause)。
  - setDanceMode: danceActive更新→applyBgm(戦闘pause)→applyDanceEl(ダンス再生)。
  - setBgmVolume/Muted/Active で dance gain 更新・applyDanceEl。preload で prewarmDanceTracks。
- 261で「routed要素+ダンスWAV=軽い+音が出る」を実証済みなので、これが本命。

### Verification
- `npx tsc --noEmit` / `npm run build` 成功。実機で「ダンス中:音が出る＆60fps」を確認待ち。

### Performance（load score: 1/10）
- 同時に鳴る系統は常に1つ(=戦闘時と同じ)。重い経路(素再生/AudioBufferSource/大WAVへのsrc差し替え)は不使用。
- 既知点: routed 要素は src を変えないため、レベル毎に要素を持つ(最大3)。再生中は常に1つだけ。

## 2026-06-14 - v0.25.266 - 診断: BGMをWebAudio経由にせず素再生(差し替え後の無音を解消できるか) (Claude Code)

### 265の結果(超重要)
- ダンス突入で「BGM無音・でも軽い」。→ **小さいMP3への src 差し替えは軽い**(262の重さは“大WAVのデコード”だけ)。
  残る問題は「差し替えると無音」。

### 仮説と検証
- 原因はほぼ確実に **BGM を WebAudio(createMediaElementSource)で掴んでいるせい**。要素を一度ノード化すると
  src 差し替え後の音がグラフに乗らず無音になる既知挙動(起動時の最初の曲は鳴る)。
- 検証: `BGM_USE_WEBAUDIO_ROUTING=false`(既定)で BGM を“要素の素再生(element.volume)”にする。これで差し替え後に
  音が出れば原因確定。`?bgmroute=on` で従来ルーティングに戻せる。
- トレードオフ: 素再生だと iOS で element.volume が無視され音量調整が効かない(再生自体はする)。音が出る方を優先。
- 構成は265のまま(通常=ダンスlevel1 / ダンス中=戦闘MP3へ差し替え)。

## 2026-06-14 - v0.25.265 - 診断: 通常=ダンスlevel1、ダンス中=戦闘曲MP3へ差し替え (Claude Code)

### 目的(切り分け)
- 262で「ダンス突入時に“大きいダンスWAV”へ src 差し替え→重い」。今回は逆向き:通常プレイは起動時から
  ダンスlevel1(大WAV)、**ダンス中だけ“小さい戦闘MP3”へ差し替える**。
  - 軽ければ → 重いのは「大きいWAVへの差し替え/デコード」だけ。**ダンス曲を小さいMP3にすれば差し替え方式でOK**。
  - 重ければ → 「mid-game の src 差し替え自体」が重いと確定。
- `src/audio/audioManager.ts`: NORMAL_TRACK=DANCE_LOOP_TRACKS[1]、DANCE_SWAP_TRACK=BGM_TRACKS[0]。
  起動時 bgmSrc=ダンスlevel1。ダンス突入で戦闘MP3へ差し替え。差し替え先MP3は preload で事前ウォーム。

## 2026-06-14 - v0.25.264 - 診断: 戦闘中の曲を起動時からダンスlevel1に (Claude Code)

### 確定事項
- v0.25.263(ダンス中も戦闘曲のまま=src差し替えなし)で **軽い**(ユーザー確認)。
  → 重さの正体は「**ゲーム中に要素 src をダンスWAVへ差し替える/読み込むこと**」で確定。

### この版
- 戦闘中の曲を起動時から `dance-100-loop.wav`(ダンスlevel1)にする(`BGM_USE_DANCE1`、既定true)。
  src 差し替えは起こさない設定のまま。`?bgm=normal` で通常戦闘BGMへ。
- `src/audio/audioManager.ts`: BATTLE_TRACK を切替式に。

## 2026-06-14 - v0.25.263 - 診断: ダンス中もBGMを戦闘曲のまま(src差し替えを起こさない) (Claude Code)

### きっかけ
- v0.25.262(単一要素のsrc差し替え)で「プレイは軽い・**ダンスだけ重い**」。261(ダンスWAVを起動時から
  読み単一要素で再生)は軽かった。差は「mid-game で src をダンスWAVへ差し替える/読み込む」点だけ。

### この版(切り分け)
- 既定で **ダンス中も BGM を戦闘曲のまま**にし、src 差し替えを一切起こさない(`desiredBgmSrc` が常に
  BATTLE_TRACK)。これで「ダンスだけ重い」が消えれば、重さ＝「mid-game の src 差し替え/WAV読み込み」と確定。
- `?dancesrc=on` で従来のレベル毎ダンス曲差し替えに戻せる(比較用)。
- `src/audio/audioManager.ts`: `DANCE_SRC_SWAP`(既定false)を追加。

### 次の手(予想)
- 軽ければ: 差し替えをやめ、261方式=「起動時にダンス曲を要素へ読み込んでおく」必要。ただし1要素では戦闘と
  両立できないので、要素は1つのまま「戦闘曲とダンス曲を“1ファイルに連結/切替”」等、mid-game読み込みを
  避ける設計を検討。

## 2026-06-14 - v0.25.262 - ダンスBGM本実装: 単一要素の src 差し替え方式(2系統目を作らない) (Claude Code)

### 確定した原因と方針
- v0.25.261 の診断で、戦闘BGM要素の src をダンスlevel1曲にしたところ **プレイ中もダンス中も軽く、音も
  切れない(ユーザー確認済み)**。
- → **ダンス曲の中身/WAV/WebAudioルーティングは無罪**。重さの正体は「2系統目の音声を同時に持つこと」だけ
  (v0.25.258 のAudioBufferSource、v0.25.259 の追加要素)。
- 方針確定: **2系統目は作らず、唯一の BGM 要素の src を戦闘↔ダンスで差し替える**。

### 実装
- `src/audio/audioManager.ts`:
  - ダンス専用要素(danceEls)・WebAudioバッファ機構を撤去。診断フラグも撤去。
  - `desiredBgmSrc()`= ダンス中はレベル毎のダンスループ、それ以外は戦闘トラック。
  - `applyBgm()` が要素の `src` を desiredBgmSrc に冪等に合わせて再生(WebAudioルーティングは従来通り、
    src 差し替え後も維持される=軽い)。
  - `setDanceMode` は danceActive/level を更新して applyBgm を呼ぶだけ。
  - `prewarmDanceTracks()`(preload時)でダンス曲を HTTP キャッシュへ事前ウォーム→ src 差し替え時の
    読み込みヒッチを抑制。
  - setAudioMuted/setBgmVolume/setBgmActive の applyDanceEl 呼び出しを撤去(単一要素なので applyBgm のみ)。

### Verification
- `npx tsc --noEmit` / `npm run build` 成功。v0.25.261で単一要素=軽い+音切れなしは実機確認済み。

### Performance（load score: 1/10）
- 同時に持つ音声系統は常に1つ(=戦闘時と同じ)。WebAudioバッファ等の重い経路は不使用。
- 既知の軽微点: ダンス→戦闘へ戻る際、戦闘BGMは src 再読込のため先頭から再生(位置は保持されない)。
  ダンスは一時的な演出なので許容。ループ継ぎ目は要素 loop の微小ギャップのみ(WAVなので小)。

## 2026-06-14 - v0.25.261 - 診断: 戦闘BGMの素をダンスlevel1曲に差し替え (Claude Code)

### 目的(切り分け)
- 戦闘BGM=単一要素・起動時ロード・通常再生は軽いと実証済み。その素を `dance-100-loop.wav` に差し替え、
  ダンス曲を「1要素・通常再生」したとき軽いか重いかを見る。
  - 軽ければ → 曲の中身は無罪。重さの正体は「2系統目の音声を持つこと」。次は1要素で曲を切り替える方向。
  - 重ければ → この WAV(巨大PCM)を要素で鳴らすこと自体が重い。次は小さいMP3を試す。
- `src/audio/audioManager.ts`: `BGM_DIAG_DANCE`(既定true)で ensureBgm の src を DANCE_LOOP_TRACKS[1] に。
  `?bgm=normal` で通常の戦闘BGM(rotten-iron-march.mp3)に戻せる。
- ※これは診断用。確認が取れたら通常BGMに戻す。

## 2026-06-14 - v0.25.260 - ダンス専用音声を既定OFFに(戦闘BGM継続=60fps)。別トラックは全方式で重いと判明 (Claude Code)

### 結論(重要)
- v0.25.259(専用HTMLAudioElement)は **10fps以下=過去最悪**。これで主要3方式すべてが重いと確定:
  - v0.25.257 要素src差し替え → 重い/無音
  - v0.25.258 WebAudioバッファループ → 重い+ブツ切れ
  - v0.25.259 専用HTMLAudioElement(WAVループ)→ **10fps以下**
- 一方 **ダンス中も戦闘BGMを流したまま(?danceaudio=0)= 60fpsで安定**。これは何度も実証済み。
- → **この端末は「ダンス用の別音声を同時に持つ/鳴らす」こと自体が重い**。原因は曲の中身でも方式でもなく
  「2系統目の音声を抱えること」。VFX/リズムは store 側で軽い。

### 対策(まず軽さを最優先で復旧)
- ダンス専用トラックを **既定で完全停止**。ダンス中は戦闘BGMを継続(=実証済み60fps)。
- `?danceaudio=1` のときだけ実験的に専用トラックを鳴らす(将来の切り分け用)。既定では専用要素を
  生成すらしない(余計なデコード/メモリも持たない)。
- `src/audio/audioManager.ts`: `DANCE_TRACK_ENABLED`(既定false)を追加。setDanceMode は無効時 early return、
  preloadAllAudio も無効時は danceEls を作らない。

### Verification
- `npx tsc --noEmit` / `npm run build` 成功。既定で別音声を一切持たないため 60fps 復帰を期待(実機確認待ち)。

### 次の判断材料
- 「ダンス専用BGM」をこの端末で鳴らすのは現実的でない可能性が高い。
- もし諦めず試すなら次の唯一の未検証案 = **小さいMP3(戦闘BGMと同形式・低ビットレート)1要素**。今までは巨大WAVを
  要素に食わせていた。要否はユーザー判断。

## 2026-06-14 - v0.25.259 - ダンス重さ: 重い経路を特定し HTMLAudioElement 直再生へ (Claude Code)

### 原因特定(更新)
- v0.25.258(WebAudio AudioBufferSourceでループ)でも重く、ダンス曲が「ブツブツ」=オーディオ
  アンダーラン(CPU逼迫)。`?danceaudio=0`(WebAudioでダンス音を出さない)は軽い(60fps)。
- 結論: **この端末は WebAudio(AudioContext)で連続再生すると重い**。一方 **HTMLAudioElement の
  直再生は軽い**(戦闘BGMがこれ)。重さの核心は「要素のMP3デコード」でも「サンプルレート」でもなく
  「**WebAudioで連続再生すること**」だった(SE一発は短いので露見せず、連続ループで露見)。
- 決定打: 戦闘BGMは「1要素がMP3をデコードしながら再生」で軽い。なら同時にデコード/再生する要素を
  常に1つに保てば戦闘時と同負荷=軽いはず。

### 対策
- ダンス曲を **専用の HTMLAudioElement(レベル毎)で loop 再生**。WebAudio(createMediaElementSource)
  には通さない=重い経路を回避。ダンス中はメインBGM要素を pause するので、再生中の要素は常に1つだけ。
- `src/audio/audioManager.ts`: AudioBufferSource機構(danceBuffers/loadDanceBuffer/startDanceLoop等)を
  削除し、danceEls(Map<level,HTMLAudioElement>)+ ensureDanceEls/applyDanceEl/stopDanceEls に置換。
  setDanceMode は要素 pause + ダンス要素 play。preloadAllAudio で3要素を事前ロード。
  ループ素材は v0.25.258 のシームレスループWAVをそのまま要素で再生。

### Verification
- `npx tsc --noEmit` / `npm run build` 成功。体感FPSは実機確認待ち(今度こそ60fps期待)。

### Performance（load score: 1/10）
- WebAudio連続再生を排除。再生中のHTMLAudioElementは常に1つ(戦闘時と同じ)。
- 注意: HTMLAudioElement の loop=true は継ぎ目に微小ギャップが出る場合あり(WAVなので小)。
  気になれば2要素ピンポン等で後日詰める。iOSは element.volume 無視(ダンスは素再生=フル音量)。

## 2026-06-14 - v0.25.258 - ダンス重さ確定解消: ダンス曲をPCMバッファのループ再生に変更 (Claude Code)

### 原因特定(確定)
- 診断トグルで切り分け: `?danceaudio=0`(ダンス曲を差し替えず戦闘BGMのまま)= 軽い。
- v0.25.257(48k化・src差し替え)でも重く、しかも「ダンス中は無音なのに重い/ミュートで軽い」。
  → 真因は **HTMLAudioElement にダンスMP3をデコードさせること自体**(この端末でソフトデコード経路に
  落ちて常時CPUを食う)。要素の数でもサンプルレートでもなく「要素での新規MP3デコード」が重さの核心。

### 対策(ユーザー承認方針)
- ダンス曲を SFX と同じ **デコード済みPCMバッファのループ再生(AudioBufferSourceNode)** に変更。
  HTMLAudioElement での再生をやめたので、件のデコード負荷が消える(ハリケーンSEと同じ軽い経路)。
- ダンス中はメインBGM要素を pause し、ダンスループだけ再生。終了でメインBGM再開。
- ループ素材: 各曲の **後半で最も音量の高い8小節フレーズ**(ユーザー指定=盛り上がる所をキリよく)を
  抽出し、継ぎ目をイコールパワー・クロスフェード(0.35s)してシームレス化した WAV。
  - dance-100-loop.wav: 153.6s〜 / 19.2s, dance-120-loop.wav: 160.0s〜 / 16.0s,
    dance-140-loop.wav: 150.857s〜 / 13.714s(いずれも48k/16bit/stereo)。

### 実装
- `src/audio/audioManager.ts`:
  - DANCE_TRACKS(mp3 src差し替え)/swapBgmTo/savedMainSrc/savedMainTime を削除。
  - DANCE_LOOP_TRACKS(wav)+ danceBuffers/loadDanceBuffer/startDanceLoop/stopDanceLoop/applyDanceLoop を追加。
  - setDanceMode: 要素 pause + ダンスループ開始/停止。applyBgm はダンス中(かつ ?danceaudio=0 でない時)
    メインBGM要素を停止。setAudioMuted/setBgmActive/setBgmVolume が applyDanceLoop も呼ぶ。
  - preloadAllAudio: 起動時にループWAVを3本デコードして温める。
- `public/audio/dance-{100,120,140}.mp3`: 不要になったため削除(loop.wavに置換)。

### Verification
- `npx tsc --noEmit` / `npm run build` 成功。継ぎ目クロスフェードでループは解析上シームレス。
- 体感FPSは実機確認待ち(ダンス中も60fps復帰を期待)。

### Performance（load score: 1/10）
- 毎フレームの要素MP3デコードを排除し、ループは単一の AudioBufferSourceNode(=SE1個分)。
- メモリ: デコード済みバッファ3本で約18MB(支払いはmemory)。安全策: レベル毎に1回だけデコードして使い回し。

## 2026-06-14 - v0.25.257 - ダンス重さの真因: サンプルレート不一致(44.1k→48kリサンプル)を解消 (Claude Code)

### Summary
- v0.25.256(1音声要素のsrc入れ替え)でも「ダンス中だけ重い」が継続。これで「2つ目の<audio>」説は否定。
- ffprobeで符号化を比較し真因を特定:
  - 戦闘曲 = 48000Hz / ダンス曲 = 44100Hz(ビットレートはダンスの方が低いので圧縮負荷ではない)。
- BGMは createMediaElementSource で SFX用 AudioContext(端末既定=おそらく48000Hz)に流している。
  ファイルのレートがContextと食い違うと、MediaElementSourceが**再生中ずっとリアルタイム・リサンプリング
  (44100→48000)を回す**。戦闘曲は48kで一致=リサンプル無し=軽い。ダンス曲は44.1k=常時リサンプル=重い。
  → 即時・持続・時間無関係・`?danceaudio=0`で軽い、という全症状に合致。

### 実装
- `public/audio/dance-{100,120,140}.mp3`: 48000Hz / stereo / 160k へ再エンコード(戦闘曲とレート一致)。
  DANCE_TRACKS の `?v=__APP_VERSION__` キャッシュバストでバージョン更新により実機が取り直す。

### Verification
- `ffprobe` で3曲とも 48000Hz/stereo を確認。`npm run build` 成功。
- 体感FPSは実機確認待ち(リサンプル消失でダンス中も60fps復帰を期待)。

## 2026-06-14 - v0.25.256 - ダンス重さ: 1音声要素のsrc入れ替え方式(2つ目の<audio>を作らない) (Claude Code)

### Summary
- v0.25.255(ダンス中メイン停止+ダンス曲を別<audio>で再生)でもまだ重い=「2本同時」ではなく
  「2つ目のHTMLAudioElementの存在」自体がこの端末で重い(2本目はMP3デコードがソフト処理に落ちる)と判明。
- ユーザー指示:「戦闘曲と何か違った? 結局であれば1曲ずつちゃんと再生すれば?」
  → 戦闘BGMと完全に同じ1つの bgm エレメントで、再生する曲(src)だけ入れ替える方式に変更。
  ダンス専用の <audio> は廃止。常に音声要素は1本=戦闘時とまったく同じ負荷。

### 実装
- `src/audio/audioManager.ts`:
  - danceBgm / primeDanceBgm / ensureDanceBgm / playDanceBgm を削除。
  - setDanceMode 開始: メインBGMの src/位置を savedMainSrc/savedMainTime に退避 → bgm の src を
    DANCE_TRACKS[level] に差し替えて頭から再生(swapBgmTo)。
  - setDanceMode 終了: bgm の src をメインBGMへ戻し、保存位置(savedMainTime)から再開。
  - applyBgm はダンス状態に依存せず「bgmActiveなら再生・音量設定」のみ(srcはsetDanceModeが管理)。
  - getMusicTimeMs は null を返す(拍合わせは gameTime グリッドで実施)。
  - 未使用化していた rampGain / setGainNow を削除。
- `public/audio/dance-{100,120,140}.mp3`: フル尺・128k/44.1k/stereoへ再エンコード(シームレスループ用)。

### Verification
- `npx tsc --noEmit` / `npm run build` 成功。
- 体感FPS確認は実機待ち(ダンス中も60fps復帰を期待)。

### Note
- トレードオフ: ダンス開始/終了でBGMが一瞬切れる(同一要素のsrc差し替えのためクロスフェード無し)。
  戦闘曲の再生位置は保持して復帰。
- 確認後の掃除候補: 診断トグル `?danceaudio=0`(audioManager) / `?dancevfx=0`(pixiScene)。

## 2026-06-14 - v0.25.255 - ダンス重さ: 同時2ストリーム回避(ダンス中はメインBGMを停止し1本だけ) (Claude Code)

### Summary
- v0.25.254のネイティブ化でも重いまま=「再生方式」ではなく「メディア要素を2本同時再生」が重さの核心と判明。
  (?danceaudio=0 でメインだけ=1本=60fps、通常はメイン+ダンス=2本=25fps)
- 対策: ダンス中はメインBGMを「ダック(音量0で再生継続)」ではなく「停止(pause)」し、ダンス曲だけ再生。
  常に音声1本に保つ。終了でダンス曲をpause→メインBGMを停止位置から再開(playBgm)。位置は保持される。
- フル尺(187〜268秒)はAudioBuffer化はメモリ過大(60〜90MB)で不可なため、この方式を採用。

### 実装
- `src/audio/audioManager.ts`: setDanceMode 開始で bgm.pause()、終了で playBgm()。applyBgm もダンス中は
  メイン停止に整合(ダック廃止)。rampGain/setGainNow は未使用化(残置)。

### Verification
- `npm run build` 成功。

### Note
- トレードオフ: ダンス開始/終了でメインBGMが一瞬切れる(クロスフェード無し)。位置は保持。気になれば短い
  フェードを後で。診断トグル(?danceaudio=0 / ?dancevfx=0)は残置。

## 2026-06-14 - v0.25.254 - ダンス重さの本対策: ダンス曲をWebAudio非経由のネイティブ再生に (Claude Code)

### Summary
- 診断の結果 ?danceaudio=0 でのみ60fpsに回復=原因は「ダンス曲の再生処理」と確定(描画/ビットレートは無関係)。
- 原因はダンス曲を WebAudio(MediaElementSource→GainNode)経由で常時再生していたこと。メインBGMは
  問題ないが、ダンス曲を2つ目の MediaElementSource として処理するのが重かった。
- 対策: ダンス曲を WebAudio に通さず、ダンス中だけ HTMLAudioElement のネイティブ再生(element.volume/muted)。
  終了で pause(連続デコードしない)。メインBGMのダックは従来通り WebAudio(bgmGain)。
- iOS対策で element.muted も併用。アンロックは BGM 開始ジェスチャ内で一度だけ無音再生→停止(primeDanceBgm)。

### 実装
- `src/audio/audioManager.ts`: ensureDanceRouting/danceGain/danceRouted 撤去。primeDanceBgm 追加。
  setDanceMode をネイティブ再生(開始でplay/終了でpause、音量はelement側)に。applyBgm はアンロックのみ。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。

### Note
- 診断トグル(?danceaudio=0 / ?dancevfx=0)は当面残置(確認用)。問題なければ後で撤去。

## 2026-06-14 - v0.25.253 - 診断: ダンス重さの切り分け用 URLトグル(?danceaudio=0 / ?dancevfx=0) (Claude Code)

### Summary
- 再エンコード(252)で改善せず=ビットレートではない。原因切り分けのため、URLパラメータで
  「ダンス音声OFF」「ダンス描画OFF」を個別に無効化できる診断トグルを追加(1ビルドで原因特定)。
  - `?danceaudio=0`: ダンス曲を一切再生せず、メインBGMのダックもしない。
  - `?dancevfx=0`: ダンスのPixi描画(ミラーボール/サークル/矢印/暗転/発光)を一切出さない。

### 実装
- `src/audio/audioManager.ts`: DANCE_AUDIO_OFF。playDanceBgm/setDanceMode をガード。
- `src/pixi/pixiScene.ts`: RHYTHM_VFX_OFF。syncRhythmOverlay/syncRhythmScreenFx をガード。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。

### Note
- 原因が特定でき次第トグルは撤去予定。

## 2026-06-14 - v0.25.252 - ダンス曲を軽量再エンコード(320k/48kHz→128k/44.1kHz)。ダンス中の重さ対策本命 (Claude Code)

### Summary
- 「ダンス突入で60→25fps、抜けで即60fps、時間無関係」を調査。v0.25.244(軽)からの差分で毎フレームの描画/処理は
  重くなっておらず(むしろ250/251で軽量化)、実質増えたのは「ダンス曲」だけと判明。
- 軽かった頃の pulse-grid は 64kbps/48kHz、提供曲は 320kbps/48kHz(5倍, 7.5〜10.7MB)。ダンス中だけ高ビットレート曲を
  WebAudio で処理する間CPUを食い、音量0(抜け)でアイドル化しFPSが戻る挙動と一致。
- 3曲を 128kbps / 44.1kHz / stereo に再エンコード(ffmpeg)。合計約26MB→約11MB。48→44.1kでランタイムのリサンプリングも解消。

### 実装
- `public/audio/dance-100/120/140.mp3` を再エンコードで差し替え(元アップロードから変換)。コード変更なし。
- URL は ?v=__APP_VERSION__ 付与済みなのでバージョン更新でキャッシュ更新される。

### Verification
- `npm run build` 成功。

### Note
- これで改善しなければ、追加で 96kbps化 / mono化(デコード半減) も可能。元の320k版は uploads に残存。

## 2026-06-14 - v0.25.251 - 四神舞: 重さ対策。頭上の矢印を毎フレーム描き直さない(内容変化時のみ) (Claude Code)

### Summary
- ダンス中が極端に重い件。ダンス中だけ走る Pixi オーバーレイで、コマンド+入力の矢印を毎フレーム
  ~400個の矩形で描き直していたのが主因(リング/ボールは数個だが矢印が重い)。
- 矢印を別 Graphics(rhythmArrowsGfx)に分離。原点基準で描き、位置は毎フレーム transform だけ追従。
  内容(入力履歴/コマンド/進行)が変わった時だけ再描画(キー比較)。四神名 Text も位置追従のみ。
- rhythmOverlay 本体の毎フレーム描画はリング/ボールのハロー/影/判定フラッシュの数個だけに。

### 実装
- `src/pixi/pixiScene.ts`: rhythmArrowsGfx + rhythmArrowsKey。矢印描画を分離・キャッシュ化。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。

### Note
- まだ重い場合、提供mp3(320kbps/7.5〜10.7MB)の再生負荷の可能性。ビットレート/尺の最適化で軽くできる。

## 2026-06-14 - v0.25.250 - 四神舞: 毎フレームの位相再同期(resync)を廃止し、一定リズムに (Claude Code)

### Summary
- サークルがまだ微振動(ブルブル)する件。原因は resync が音楽クロックの微ノイズを毎フレーム追いかけ、
  firstBeatAt を細かく動かしていたこと。毎フレーム再同期を廃止し、開始時に一度だけ合わせた固定グリッドで
  一定に流すように変更(gameTime ベースなので滑らか・一定)。
- 開始拍は従来通りダンストラックの再生位置に合わせる(LEAD は interval の倍数なので拍は概ね一致)。ズレが
  気になる場合は RHYTHM_MUSIC_OFFSET_MS で一定オフセット調整可能。

### 実装
- `src/hooks/useGameLoop.ts`: ダンス中の resyncRhythm 呼び出しを削除(resyncRhythm 自体は未使用で残置)。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。

## 2026-06-14 - v0.25.249 - 四神舞: サークルが固まって微振動するバグを修正(resyncを音楽進行時のみに) (Claude Code)

### Summary
- ダンスのサークルが流れず固まって微振動(ブルブル)する不具合を修正。原因は resync が、曲のロード中など
  音楽再生位置が進んでいない時にも位相補正を行い、firstBeatAt を gameTime ごと引きずっていたこと(大きい
  ダンス曲に差し替えてロードが長くなり顕在化)。
- resync を「音楽が通常再生(realtimeで進行)している時だけ」に限定。ロード中/ループ巻き戻り/大ジャンプ時は
  位相補正をスキップ(サークルは gameTime のグリッドで滑らかに流れ続ける)。

### 実装
- `src/types/game.ts` + `gameStore.ts`: RhythmState.lastMusicMs。resyncRhythm は musicDelta が 1〜200ms の時
  だけ位相補正。ダンス開始時に lastMusicMs を0リセット。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。

## 2026-06-14 - v0.25.248 - 四神舞: レベル別ダンス曲を実配置(100/120/140) + URLキャッシュバスト (Claude Code)

### Summary
- ユーザー提供のダンス曲を配置: dance-100.mp3(Lv1/100BPM) / dance-120.mp3(Lv2/120BPM, 提供版へ差替) /
  dance-140.mp3(Lv3/140BPM)。これで全レベルで音+同期が動作。
- ダンストラックURLに ?v=__APP_VERSION__ を付与し、曲差し替え時の旧ファイルキャッシュを防止。

### Note
- 提供mp3は 320kbps/48kHz で各 7.5〜10.7MB と大きめ。起動時プリロードは dance-120 を待ち、他は先読み。
  ボードが重ければ後でビットレート/長さ最適化を検討可。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。

## 2026-06-14 - v0.25.247 - 四神舞: レベルでBPMが変わる(Lv1=100/Lv2=120/Lv3=140)。トラックも切替 + 無敵=1ビート (Claude Code)

### Summary
- 四神舞レベルの違いをBPM(手数)で表現。Lv1=100/Lv2=120/Lv3=140BPM。間隔(interval)=600/500/≈429ms。
- ダンストラックをレベルで切替(BPMと一致)。ジャストタップ無敵は固定0.5sから「1ビート分(=interval)」に。
- リズム判定/サークル/再同期/ミラーボール反転は全て rhythm.interval を使用。

### 実装
- `src/config/shijin.ts`: RHYTHM_BPM_BY_LEVEL[120,100,120,140] + rhythmIntervalForLevel()。RHYTHM_TAP_INVULN_MS 廃止。
- `src/types/game.ts` + `gameStore.ts`: RhythmState.interval 追加。setRhythmActive(active, firstBeatAt?, interval?)。
  rhythmInput/tickRhythm/resyncRhythm が r.interval を使用。タップ無敵=interval。
- `src/pixi/pixiScene.ts`: オーバーレイ/反転が rhythm.interval。
- `src/hooks/useGameLoop.ts`: 開始時に shijin レベルから interval を算出し setRhythmActive、setDanceMode(true, lvl)。
- `src/audio/audioManager.ts`: DANCE_TRACKS[1/2/3]=dance-100/120/140.mp3、setDanceMode(active, level)で src 切替。
  preloadAllAudio で3トラック先読み。
- `public/audio/dance-120.mp3`: 既存 pulse-grid を流用(Lv2=120は即動作)。

### TODO(曲・ユーザー提供待ち)
- `public/audio/dance-100.mp3`(Lv1/100BPM) と `public/audio/dance-140.mp3`(Lv3/140BPM) を配置すれば各レベルで鳴る。
  未配置の間は Lv1/Lv3 は「正しいテンポの無音(視覚リズムのみ)」で動作。dance-120 も差し替え可。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。

## 2026-06-13 - v0.25.246 - 四神舞: ダンス中は近接ダメージ音オフ / ジャストタップで0.5秒無敵 (Claude Code)

### Summary
- ダンス中はリズムに乗りやすいよう近接ダメージ音(slash-damage / melee)をミュート。
- ジャストタップ成功時にプレイヤーへ0.5秒の無敵を付与(ビート毎にタップすれば実質無敵を維持)。

### 実装
- `src/audio/audioManager.ts`: DANCE_MUTED_SFX(slash-damage/melee)を追加し、danceActive 中は playSfx で無視。
- `src/config/shijin.ts`: RHYTHM_TAP_INVULN_MS=500。
- `src/store/gameStore.ts` rhythmInput: タップ成功時に invulnerable=true + invulnerableTime をずらして
  ループの INVULN_MS 自動解除を 0.5s に(ダッシュ無敵と同手法)。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。

## 2026-06-13 - v0.25.244 - 四神舞: タップでは技リストが変わらないように(タップはミス扱いにしない) (Claude Code)

### Summary
- タップだけで踊っている時に技リスト(コマンド)が変わる不具合を修正。原因はミスタイミングのタップが
  「ミス」判定になり技リストを引き直していたこと。タップはミス扱いにしない仕様に。
- 技リストの引き直しは「フリックのミス」と「発動(完成)」時のみに限定。タップ/スキップ(tickミス)では保持。

### 実装
- `src/store/gameStore.ts` rhythmInput: !onBeat のとき kind==='tap' は空振り(コンボ/進行/リスト不変、ビートだけ
  現在位置へ追従して tick ミスも誘発しない)。フリックのミスのみ従来通りフルリセット+リスト引き直し。
- tickRhythm の miss でも prompt 引き直しを廃止(コンボ/進行/蓄積はリセットするがリストは保持)。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。

## 2026-06-13 - v0.25.243 - 四神舞: ミラーボールが画面全体を覆うバグを修正(テクスチャ未準備時の巨大化対策) (Claude Code)

### Summary
- ダンス時にミラーボールが画面全体を覆って見えなくなる不具合を修正。原因はスケール計算
  `RHYTHM_BALL_DIAM / ball.texture.width` で、ロード中/異常なテクスチャの width が極小(1等)のまま
  256px の画像を巨大スケールで描画していたこと(リロードで直る=テクスチャ状態依存と一致)。

### 実装
- `src/pixi/pixiScene.ts`(syncRhythmOverlay): テクスチャ width>=32 を満たす時だけスプライト表示し、その時の
  実 width で等倍化(巨大化しない)。未準備/異常時はスプライトを隠し、簡易ミラーボール円(Graphics)で代替。
  さらに毎フレーム、無効テクスチャなら getTexture で取り直す(破棄/再生成にも追従)。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。

## 2026-06-13 - v0.25.242 - 重さ対策(続き): HUDの毎フレーム/頻繁再描画を全て解消 (Claude Code)

### 調査で判明した毎フレーム再描画源と対策
- `Game.tsx` が `player` 全体を購読(用途は health のみ)→ `player.health` 購読に。親再描画の子(HUD/Stage)波及を解消。
- `GameHUD` が `player` 全体 / `gameTime` / `gameStats`(与ダメ毎に変化) を購読 →
  - player は使用フィールドのみ shallow 購読、gameTime は秒で購読(時計/ボス警告は1秒粒度)。
  - 撃破/DMG/SCRAP の Stats パネルを `StatsHud` に分離(damageDealt の頻繁更新をHUD本体から切離し)。
- (前版で) FPS/負荷表示は `PerfOverlay` に分離済み。
- 補足: `GameCanvas`(全配列購読)は Canvas2D モード専用で、デフォルトの Pixi では未マウント(無関係)。

これで GameHUD 本体は HP/EXP/Lv/武器/弾/サブ武器/コンボ/敵数/ボス/秒 の変化時のみ再描画。毎フレーム更新は
PerfOverlay と StatsHud の小コンポーネントだけに限定。

### Files
- `src/components/PerfOverlay.tsx`(前版) / `src/components/StatsHud.tsx`(新規)
- `src/components/GameHUD.tsx`: shallow購読/秒購読/派生購読化、Stats・perf撤去。
- `src/components/Game.tsx`: player.health 購読、StatsHud/PerfOverlay を別レンダ。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。

## 2026-06-13 - v0.25.241 - 重さ対策: FPS/負荷表示を分離しHUDの毎フレーム再描画を解消 + スカベンジャー装備変更 (Claude Code)

### Summary
- GameHUD が fps プロップ + effects/projectiles/pickups 件数 + enemies 配列(毎フレーム新参照)を購読していたため
  HUD全体が毎フレーム再描画されていた。FPS/負荷表示を PerfOverlay に分離し、HUDは派生値(enemyCount/bossActive)
  のみ購読に。これでHUD本体は意味のある変化時だけ再描画。
- スカベンジャーの初期装備をハンドガン＋ハチェットに変更。

### 実装
- `src/components/PerfOverlay.tsx`: 新規。fps + 各カウントを購読し小さく毎フレーム再描画(HUDから分離)。
- `src/components/GameHUD.tsx`: fpsプロップ/件数購読/perfオーバーレイを撤去。enemies配列→enemyCount/bossActive 派生購読。
- `src/components/Game.tsx`: GameHUD は props無し、PerfOverlay を別途レンダ。
- `src/data/playerProfiles.ts` / `src/components/MainMenu.tsx`: necromancer(スカベンジャー) melee を hatchet-t2 に、表示も更新。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。

## 2026-06-13 - v0.25.240 - 全キャラ同一性能化(ステータス表示撤廃)・キャラ選択は初期装備+専用スキルのみ表示 (Claude Code)

### Summary
- 全キャラの性能差を撤廃。maxHp を全員同一(110)に。速度はもともと PLAYER_BASE_SPEED で共通、攻撃力は
  装備武器依存(=初期装備の違い)。差は「初期装備」と「専用スキル」のみ。
- キャラ選択UIから体力/速度/攻撃力のステータス表示を撤廃。各カードは「初期装備」と「専用スキル(名+説明)」のみ表示。
- 専用スキルは既存のクラス限定カードに準拠: warrior=heavy-grenade / mage=marksman-trap / rogue=striker-hunting /
  necromancer=striker-quick-mag。

### 実装
- `src/data/playerProfiles.ts`: maxHp を全員 STANDARD_MAX_HP=110 に統一。
- `src/components/MainMenu.tsx`: characterClasses を {gear, skillKey, skillDesc} に作り替え、stats/description 撤廃。
  カードJSXのステータス3列を初期装備+専用スキル表示へ。
- `src/components/LoadingScreen.tsx`: 起動時専用に簡素化(profile依存を撤去、タイトル固定)。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。

## 2026-06-13 - v0.25.239 - 表示位置修正(コンボ左上/コマンドはPixi頭上)・ダンス中はLv保留→終了で一括Lv・起動時ローディングで全DL・タレット持続3倍 (Claude Code)

### Summary
- コンボ数を左上(元位置)へ戻す(HP等と被らない)。目標コマンド+四神名を Pixi 頭上オーバーレイの「入力矢印のすぐ上」へ移動。
- ダンス中はレベルアップを保留(EXPは溜め続け、HP下のEXP表示は100%カンスト)。ダンス終了で溜めた分を一気にレベルアップ
  (アップグレードメニューが連鎖表示。余剰EXPは繰り越し)。
- 起動時にローディング画面を設け、全素材(テクスチャ+BGM+ダンス+SFX)をダウンロードし切ってからメニューへ。
  キャラ選択後のローディングは廃止(即プレイ)。
- 自動タレットの持続を3倍(5s→15s)。

### 実装
- `src/components/GameHUD.tsx`: コンボを左上に。コマンド/入力矢印HUDは撤去(Pixiへ)。EXP表示を min(100%)。
- `src/pixi/pixiScene.ts`: 目標コマンド(ドット矢印)+四神名(Text)を入力矢印の上に描画。
- `src/store/gameStore.ts`: gainExperience はダンス中Lvアップ保留。levelUp は余剰EXP繰り越し。selectUpgrade と
  setRhythmActive(false) でバンクEXPぶんを連鎖Lvアップ。
- `src/audio/audioManager.ts`: preloadAllAudio を完了待ち Promise 化(canplaythrough/タイムアウト)。
- `src/App.tsx` / `src/components/LoadingScreen.tsx`: 起動時ローディング(startup)で全DL→menu。選択後は即playing。
- `src/hooks/useGameLoop.ts`: TURRET_DURATION_BY_LEVEL 5000→15000。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。

## 2026-06-13 - v0.25.238 - ダンスBGM混在/音量修正・素材プリロード・タレットもランチャー級・コマンド移動+コンボ表示・重さ対策 (Claude Code)

### Summary
- ダンスBGMとメインBGMが混ざる問題を修正。ダンス開始でメインBGMを即0(確実に無音)にし、ダンス音量は
  メインと同じ設定値(bgmVolume)に。終了でメインを設定値へフェードイン。
- 起動時に音声素材を全て先読み(SFX/メインBGM/ダンストラック/全BGMトラック)。テクスチャは既存どおり先読み。
- 技リストは miss するとリセット(新コマンドを引き直す)。誤フリック(タイミング成功)では保持のまま。
- 自動タレットのグレネード弾もランチャー級(半径92/演出440)に。heavy-grenadeサブ武器(手榴弾系)は据え置き。
- 「重くなる」対策: GameHUD が rhythm 全体を購読し resync の firstBeatAt 更新で毎フレーム再描画していたのを、
  個別フィールド購読に変更(毎フレーム再描画を解消)。
- コマンド表示を上部中央(=頭上の入力矢印の上)へ移動し、コンボ表示を追加。

### 実装
- `src/audio/audioManager.ts`: setGainNow 追加。setDanceMode を「メイン即0/ダンス=bgmVolume/終了フェードイン」に。
  applyBgm のダンスgainも bgmVolume。preloadAllAudio() 追加。DANCE_VOLUME 撤去。
- `src/App.tsx`: 起動時 preloadAllAudio()。
- `src/store/gameStore.ts`: timing-miss と tick-miss で prompt 再生成(技リストリセット)。
- `src/hooks/useGameLoop.ts`: timedGrenades で weaponKey==='sub-turret-grenade' のみランチャー級半径/演出。
- `src/components/GameHUD.tsx`: rhythm を granular 購読、コマンドを上部中央へ、コンボ表示追加。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。

### 重さ調査メモ
- 主因は resync の per-frame set による HUD 全再描画と推定 → granular 購読で解消。残る毎フレーム描画は Pixi の
  オーバーレイ(ミラーボール/サークル/入力矢印/暗転)程度で軽量。さらに必要なら FPS 計測や描画間引きを追加可能。

## 2026-06-13 - v0.25.237 - 四神舞・朱雀を「グレネードランチャー(rifle-t3)」相当の爆発に修正(手榴弾ではない) (Claude Code)

### Summary
- 「グレネード相当の爆発」という表現は手榴弾(heavy-grenade)ではなくグレネードランチャー(rifle-t3)を指す、との
  指摘を反映。朱雀の爆発をランチャーの爆発に合わせた。半径66→92(GRENADE_BLAST_RADIUS)、演出時間も
  GRENADE_LAUNCHER_EXPLOSION_EFFECT_MS(440)に。色は朱雀(朱)のまま、バーストも大きめに。

### 実装
- `src/config/shijin.ts`: SUZAKU_BLAST_RADIUS を撤去(ランチャー定数を直接流用)。SUZAKU_BLAST_DAMAGE 42→48。
  コメントを「グレネードランチャー相当(手榴弾ではない)」に。
- `src/hooks/useGameLoop.ts`: 朱雀の爆発で GRENADE_BLAST_RADIUS / GRENADE_LAUNCHER_EXPLOSION_EFFECT_MS を使用。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。「グレネード相当」表現は src から消去。

### Note
- 自動タレットは例示。タレットの小爆発(半径64)は別物で behavior は変更なし。heavy-grenadeサブ武器も変更なし。

## 2026-06-13 - v0.25.236 - 四神舞: ダンスBGMが鳴らない問題を修正(常時再生でアンロック) + 左上コマンドの矢印も太いドット絵に (Claude Code)

### Summary
- ダンスBGM(pulse-grid)が鳴らない問題を修正。別エレメントの play() が操作ジェスチャ外でブロックされるため、
  メインBGM開始時(ジェスチャ内)にダンストラックも「無音(gain 0)で再生開始」してアンロック。以後は常時再生の
  連続クロックとし、ダンス中だけ音量を上げる(メインはダック0)。開始拍は再生位置に合わせ、resyncで維持。
- 左上「コマンド」の矢印も、頭上と同じ太いドット絵矢印に統一(SVGで描画)。

### 実装
- `src/audio/audioManager.ts`: applyBgm でダンストラックも再生駆動+メインのダック維持。setDanceMode は停止せず
  gain ランプのみ。getMusicTimeMs は連続再生クロックを返す。playDanceBgm 追加。
- `src/hooks/useGameLoop.ts`: 開始時 firstBeatAt を getMusicTimeMs(連続クロック)の拍に合わせる。
- `src/config/shijin.ts`: RHYTHM_ARROW_GRID を共有化(export)。
- `src/pixi/pixiScene.ts`: ローカル矢印グリッド定義を撤去し共有を import。
- `src/components/GameHUD.tsx`: PixelArrow(SVG) を追加し、コマンドの矢印をドット絵化。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。pulse-grid.mp3 追跡確認。

### Note
- 自動再生方針の都合上、最初のユーザー操作(開始/音声トグル)後にアンロックされる。実機で要確認。

## 2026-06-13 - v0.25.235 - 四神舞: 失敗してもダンス継続(コンボ/技蓄積リセット) / サークルは120BPMで流れ続ける / JUST!・MISS表示 (Claude Code)

### Summary
- ダンスは失敗しても継続。ミス時はコンボに加え技の蓄積(godSuccess)も0にリセット(ミラーボール色も白に戻る)。
- 左右サークルの収束を expectBeat 依存から「固定120BPMグリッド位相」に変更。成功/失敗に関係なく一定間隔で
  流れ続け、音楽とズレない。
- ジャスト成功で頭上に「JUST!」(金)、ミスで「MISS...」(赤)を表示(spawnCallout)。技発動時は四神名を優先。

### 実装
- `src/store/gameStore.ts`: rhythmInput/tickRhythm のミスで godSuccess:0 を追加。JUST!/MISS... の callout。
  tick の playing 判定に godSuccess>0 も含める。
- `src/pixi/pixiScene.ts`: サークル位相を (gameTime-firstBeatAt)%interval ベースに(expectBeat非依存)。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。

## 2026-06-13 - v0.25.234 - 四神舞: pulse-gridはダンスタイム中だけ/メインBGMはダック(0)で流し続け終了でフェードイン/拍を再同期 (Claude Code)

### Summary
- pulse-grid(120BPM)はグローバルBGMから外し、ダンスタイム(四神舞リズムモード)中だけ別エレメントで再生。
- メインBGMはダンス中「ボリューム0だが再生は継続(位置・設定値は保持)」、ダンス終了で元の設定値へフェードイン(0.6s)。
- リズムのビート位相を毎フレーム、ダンストラックの再生位置へPLL風に再同期(長時間のドリフト対策)。

### 実装
- `src/audio/audioManager.ts`: BGM_TRACKS を元に戻し pulse-grid は DANCE_TRACK に。danceBgm/danceGain と
  setDanceMode(active)(ダック&フェード, rampGain)、getMusicTimeMs()(ダンストラック位置)。
- `src/store/gameStore.ts`: resyncRhythm(musicMs) で expectBeat を変えず firstBeatAt の位相だけ最寄り音楽拍へ
  滑らかに(0.2)寄せる。
- `src/hooks/useGameLoop.ts`: 開始時 firstBeatAt=LEAD整列の拍、毎フレーム getMusicTimeMs→resyncRhythm、
  rhythm.active 変化で setDanceMode。effectクリーンアップで setDanceMode(false)(BGM音量を確実に復帰)。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。

### Note / TODO
- ダンス中に音量/ミュート変更すると applyBgm がダックを一瞬上書きする可能性(まれ)。必要なら danceActive ガード。
- 開始直後の音声レイテンシは RHYTHM_MUSIC_OFFSET_MS で補正可。

## 2026-06-13 - v0.25.233 - 四神舞: リズムをBGM(120BPM)の拍に位相同期 + pulse-grid.mp3 をBGMに追加 (Claude Code)

### Summary
- リズムのビート(500ms=120BPM)を、これまでモード開始時点から刻んでいたのを、BGMの再生位置に位相同期。
- 提供の 120BPM トラック pulse-grid.mp3 を public/audio に追加し、BGM の先頭トラック(=再生される)に設定。
  現状の実装は BGM_TRACKS[0] のみ再生するため、これで 120BPM トラックが流れ、リズムがその拍に合う。

### 実装
- `public/audio/pulse-grid.mp3` 追加。`audioManager.ts`: BGM_TRACKS 先頭に追加 + getMusicTimeMs()(再生位置ms)。
- `src/config/shijin.ts`: RHYTHM_MUSIC_OFFSET_MS(拍頭補正, 0)。
- `src/store/gameStore.ts`: setRhythmActive(active, firstBeatAt?) で外部から拍同期した開始拍を受ける。
- `src/hooks/useGameLoop.ts`: モード開始時、getMusicTimeMs() を基準に LEAD 以上先の最も近い拍を firstBeatAt に。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。

### Note / TODO
- BGMの先頭トラックを pulse-grid に変更(現状[0]のみ再生)。元BGMに戻す/リズム中のみ流す等は要望次第。
- currentTime=0 を拍頭とみなす。ズレる場合は RHYTHM_MUSIC_OFFSET_MS で補正。長時間は gameTime と音楽の
  微小ドリフトの可能性あり(必要なら定期再同期)。

## 2026-06-13 - v0.25.232 - 四神舞: 地面さらに暗く / フリックKB2倍 / 矢印を太いドット絵+入力履歴4つスクロール (Claude Code)

### Summary
- 地面暗転を 0.26→0.42 にさらに暗く。
- フリック攻撃のノックバックを2倍(3.6→7.2)。
- 頭上の入力矢印リストを「リズムゲーム風の太いドット絵矢印(7x7・縁取り)」に刷新。
- 表示を入力フリック履歴ベースに変更: 末尾最大4つを順番に表示、5つ目以降は古いものから1つずつ消える。
  最新の1つは金色で強調。技完成/ミス/開始でクリア。

### 実装
- `src/config/shijin.ts`: RHYTHM_DIM_ALPHA=0.42、RHYTHM_FLICK_KNOCKBACK_MULT=7.2。
- `src/types/game.ts` + `gameStore.ts`: RhythmState.inputArrows(入力フリック履歴, 末尾8保持)。フリックで追加、
  発動/ミスでクリア。
- `src/pixi/pixiScene.ts`: ドット行列の矢印グリッド(上基準を回転で4方向)+ drawRhythmArrow をドット絵描画に。
  頭上表示を inputArrows.slice(-4) に。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。

### Note
- 「矢印リスト」は頭上の入力矢印リストに適用。左上「コマンド」(目標)はUnicodeのまま。必要ならそちらもドット絵化可。

## 2026-06-13 - v0.25.231 - 四神舞: ミラーボールにドロップシャドウ + フリックを接触区間ジャスト判定に (Claude Code)

### Summary
- ミラーボールにドロップシャドウを追加(光る時も影が出る=ハローの上に重ねて常時表示、発光時は濃く)。
- フリック判定を大幅に寛容化: 「触れてから離すまで(接触区間)」のどこかにジャストが入っていれば成功
  (離す瞬間は不問)。または離した瞬間がジャストでもOK。タップは従来通り離した瞬間で判定。
- 接触中(touchActive)はビートを失効させない(タッチ中にジャストが過ぎても離した時のフリックで取れる)。

### 実装
- `src/config/shijin.ts`: RHYTHM_FLICK_MAX_CONTACT_MS(700)=接触区間の上限。
- `src/components/VirtualJoystick.tsx`: pointerDownTimeRef で接触時間を計測し rhythmInput('flick', dir, contactMs)。
- `src/store/gameStore.ts`: フリックは beatT が [downGT-win, gt+win] に入れば成功。tickRhythm は touchActive 中は失効しない。
- `src/pixi/pixiScene.ts`: ボール背面に暗い円のドロップシャドウ(発光時は濃く)。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。

### TODO
- 接触中は失効しない=長押しでコンボ保持できる軽い猶予あり(上限700ms)。問題あれば調整。影の位置/濃さは仮。

## 2026-06-13 - v0.25.230 - 四神舞: 暗転を地面/遠景のみに限定 + コマンドが入力途中で変わらないよう修正 (Claude Code)

### Summary
- 暗転がオブジェクト/アクターまで暗くしていたのを、地面/遠景だけに限定。worldGroup の filteredWorld
  手前に暗転Graphicsを挿入(地面/horizon/遠景の上、背景木・影・アクター・エフェクトの下)。タップ発光は
  従来通り uiLayer 最前面(全画面)に分離。
- コマンドが入力途中で別の四神に切り替わる不具合を修正。ミス/誤フリック時にプロンプトを再生成して
  いたのをやめ、コマンドは保持し頭からやり直し。新コマンドは技の発動(完成)時のみ生成。

### 実装
- `src/pixi/pixiScene.ts`: rhythmDimGfx を worldGroup の filteredWorld 直前に挿入。syncRhythmScreenFx を
  暗転(dimGfx)とタップ発光(screenFx)に分離。
- `src/store/gameStore.ts`: rhythmInput のタイミングミス/誤フリック、tickRhythm のミスで randomRhythmPrompt()
  を呼ばないように変更(発動成功時と開始時のみ生成)。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。

## 2026-06-13 - v0.25.229 - 四神舞: ミラーボール素材入替(透過化) + フリック判定の遅延補正 (Claude Code)

### Summary
- ミラーボール素材を新しい高解像度画像に差し替え。元は黒背景・アルファ無し(1254x1254)だったため、
  PILで黒背景を透過化→トリム→256pxへ高品質縮小し、描画は linear(滑らか)に変更。
- フリックは「触れてから振り終わるまで」の所要時間ぶん確定が遅れるので、その遅延(dt)を差し引いて
  判定(=指が動き始めた瞬間で見る)。さらにフリックだけ判定窓を少し拡張(少し甘く)。タップは従来通り。

### 実装
- `public/sprites/mirror-ball.png` 差し替え(黒透過/256px)。`pixiTextures.ts` を nearest→linear。
- `src/config/shijin.ts`: RHYTHM_FLICK_EXTRA_WINDOW_MS(55)。
- `src/components/VirtualJoystick.tsx`: detectFlick が所要時間 dt を返し、rhythmInput('flick', dir, dt)。
- `src/store/gameStore.ts`: rhythmInput に lagMs。フリックは judgeTime=gt-lag、窓=success+extra で判定。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。

### TODO
- 透過の縁に薄いハローが残る場合あり(暗部ランプ22-60)。気になれば閾値調整。フリック甘さ55msは仮。

## 2026-06-13 - v0.25.228 - 四神舞: ミラーボール実素材化(0.5秒左右反転)+ タップ発光 + 連続回数で色変化 (Claude Code)

### Summary
ユーザー提供のミラーボール画像(64x64)を実テクスチャとして採用。手続き描画の円を廃止しスプライト化。
- 0.5秒(1ビート)ごとに左右反転し、回転して見せる。
- ジャストタップでボールが光る(拡大パルス+暖色ハロー)。
- 色は「技を連続で出した回数(godSuccess)」で変化: 0白/1青/2緑/3赤、4=全体フィニッシュで虹色。
  (当初フリック方向で色、としていたがユーザー指示で連続回数方式へ戻し)

### 実装
- `public/sprites/mirror-ball.png` 追加。`pixiTextures.ts` で 'mirror-ball' を nearest で読込・登録。
- `src/config/shijin.ts`: RHYTHM_STAGE_COLORS/RHYTHM_FINISH_RAINBOW_MS/RHYTHM_BALL_DIAM/RHYTHM_RAINBOW_PALETTE。
- `src/types/game.ts` + `gameStore.ts`: RhythmState.lastFinishAt(虹用)。フィニッシュ時に記録。
- `src/pixi/pixiScene.ts`: rhythmBall スプライト(effectLayer)。flip=floor(gameTime/500)%2、tint=段階色/虹、
  タップで scale パルス+ハロー。手続き円ミラーボールは廃止。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。

### TODO
- ボール直径30px/虹の巡回速度/段階色は仮。実機で調整。素材を回転アニメ(コマ)にしたい場合は別対応。

## 2026-06-13 - v0.25.227 - 四神舞: リズム中の画面暗転 + タップ発光の演出追加 (Claude Code)

### Summary
- リズム開始中は画面を少し暗く(フェードで自然に入る/抜ける)。タップ成功で画面が少し光る。
- screen-space(Pixi uiLayer 最下層)に実装。DOMのHUDは canvas の上なので暗転対象外=視認性維持。

### 実装
- `src/config/shijin.ts`: RHYTHM_DIM_ALPHA(0.26)/RHYTHM_DIM_EASE(0.16)/RHYTHM_TAP_GLOW_MS(200)/RHYTHM_TAP_GLOW_ALPHA(0.18)。
- `src/types/game.ts` + `gameStore.ts`: RhythmState に lastTapAt。タップ(方向なし)成功時に記録。
- `src/pixi/pixiScene.ts`: rhythmScreenFx(uiLayer最下層)。dim を毎フレームイージング、暗転の上にタップ発光を重ねる。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。

### TODO
- 暗さ0.26/発光0.18は仮。毎ビート発光が強い場合は alpha 低下。リズムUI(頭上)も暗転対象=必要なら uiLayer へ移して非暗転化。

## 2026-06-13 - v0.25.226 - 四神舞: ジャスト判定を少し甘く / 入力矢印のみ頭上表示 / コマンドを左上表示 (Claude Code)

### Summary
- 成功判定幅を 150→180ms に拡大(ほんの少し甘め)。
- 頭上の矢印は「入力した分だけ」を左から順に最大4表示(発動/リセットで消える)。目標プロンプト全表示は廃止。
- 目標コマンド(4矢印+1本目=四神の和名)を HUD 左上に表示(入力済みは淡色)。rhythm.active 時のみ。

### Files changed
- `src/config/shijin.ts` — RHYTHM_SUCCESS_WINDOW_MS=180, RHYTHM_JUST_WINDOW_MS=75。ARROW_GLYPH/SHIJIN_JP 追加。
- `src/pixi/pixiScene.ts` — 頭上矢印を入力済み(prompt[0..inputIndex-1])のみ描画に変更。
- `src/components/GameHUD.tsx` — 左上に「コマンド」(目標4矢印+四神和名)を追加。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。

### TODO
- 判定幅180msは仮。実機で甘さ再調整。「順番に消えていく」は発動/リセット時クリアで表現(1本ずつのフェードは要望あれば追加)。

## 2026-06-13 - v0.25.225 - 四神舞: タップ=近接範囲ノックバック / フリック=盾バッシュ風スライド攻撃 (Claude Code)

### Summary
リズム入力の挙動をユーザー指定へ変更。(1)ジャストのタップ=近接ナイフ範囲(MELEE_RADIUS+ハンティング補正)
内の敵を強制ノックバック。(2)上下左右フリック=その方向へプレイヤーが短く滑って攻撃(盾バッシュ風)。
さらにフリックのドラッグやスライドでリズムが即終了しないよう、終了条件を「一定時間歩き続けた時のみ」に変更。

### 実装
- `src/config/shijin.ts`: RHYTHM_EXIT_MOVE_MS(320), SHIJIN_SLIDE_DISTANCE(58)/SHIJIN_SLIDE_MS(150) 追加。
  タップは半径廃止し近接範囲基準へ。ノックバック強化(tap=3.4 / flick=3.6)、フリックダメージ12。
- `src/types/game.ts` + `gameStore.ts`: Player に shijinSlideUntil/DirX/DirY。movePlayer にスライド上書き
  (ダッシュと同様、入力無視で固定方向へ SHIJIN_SLIDE_DISTANCE/SHIJIN_SLIDE_MS の速度)。rhythmInput の
  フリック時に主軸(上下左右)方向へスライド開始。
- `src/hooks/useGameLoop.ts`: タップは huntingMeleeRadius(p) 範囲で強制ノックバック。enter/exit を
  rhythmMoveStartRef で「歩き続け RHYTHM_EXIT_MOVE_MS で終了」へ。短いフリック/スライドでは抜けない。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。

### TODO
- スライド距離/時間、ノックバック強度、終了までの歩行時間は仮値。実機で調整。
- スライド中の壁衝突は movePlayer の AABB に従う(貫通しない)。

## 2026-06-13 - v0.25.224 - 四神舞: リズムの輪を「足元めがけて左右→足元中央で重なる」へ修正 (Claude Code)

### Summary
リズムのサークルが頭上で横収束していたのを、ユーザー指定の挙動に修正。輪っかが左右からプレイヤーの
足元めがけて流れ込み、足元のど真ん中(footX,footY)で重なり合う(=ジャスト)。ミラーボール/矢印は頭上のまま。

### 実装
- `src/pixi/pixiScene.ts` `syncRhythmOverlay`: 収束サークルを頭上→足元へ移設。地面に置いた輪に見えるよう
  縦つぶし楕円で描画。spread=64で左右外から接近、足元中央に薄いターゲット、重なる瞬間に発光リング。
  近づくほど alpha が上がりくっきり。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。

### TODO
- 楕円サイズ/接近距離/色は仮値。実機の見やすさで調整。

## 2026-06-13 - v0.25.223 - 「四神舞(リズム)」インタラクティブ実装(リズム判定/四神技/ミラーボールUI) (Claude Code)

### Summary
四神舞の土台(v0.25.222)に、リズム入力・四神技・全体フィニッシュ・ミラーボールUIを実装。ユーザー確認済みの
方式: (1)停止0.6sでリズムモード自動開始/移動で終了、(2)1本目の矢印で四神決定(上=朱雀/下=玄武/左=青龍/右=白虎)、
(3)ランダム4矢印プロンプトを全部オンビート入力で発動(モードA)。**store=状態/判定、useGameLoop=攻撃実行**の分離。

### 実装
- **状態/判定(gameStore)**: `rhythm` 状態 + `setRhythmActive`/`rhythmInput`/`tickRhythm`/`startByakko`/
  `advanceByakko`/`drainRhythmPending`。タイミング判定(0.5秒ビート, 成功窓 `RHYTHM_SUCCESS_WINDOW_MS`)、
  既存コンボカウンター連動、外したら(早/遅/無入力)コンボ全リセット(硬直なし)。攻撃は pending に積む。
- **攻撃実行(useGameLoop)**: idle検出→`setRhythmActive`、`tickRhythm`、pending消化、白虎パルス。
  - タップ=周囲を軽く吹き飛ばし / フリック=方向帯攻撃。
  - 朱雀=近場最大3体をグレネード相当で爆破(既存ヘビーグレネード値流用)。
  - 玄武=上下左右の十字直線 / 青龍=斜めX字直線(プレイヤー幅程度・短命VFX)。
  - 白虎=5秒間0.5秒ごとに射程内の近い敵1体を斬る(最大10回, 毎フレーム探索しない)。
  - 四神技4回成功→画面内フィニッシュ(雑魚=近接フィニッシュ処刑/ボス=大ダメージ・即死なし)。
  - 近接フィニッシュ: スタン雑魚のみ処刑、ボスは処刑しない(多重発火しない設計)。スロー誘発なし。
- **入力ルーティング**: VirtualJoystick(指離し)とPCキー。リズム中はタップ/フリックをリズムへ振り分け、
  カウンター/一閃は出さない。PCは移動キー=フリック(移動しない)/Space=タップ/Escape=終了。
- **UI(pixiScene)**: `syncRhythmOverlay` でプレイヤー頭上にミラーボール(コンボ段階色)+左右収束サークル
  (0.5秒で中央=ジャスト)+4矢印プロンプト(1本目=四神色)+判定フラッシュ。終了で消える。軽量Graphicsのみ。
- **HUD**: 「FINISH / COUNTER」表示を廃止(コンボ段階はミラーボール色で表現)。コンボ状態は内部継続。
- **開始時無敵**: 既存 invulnerable を流用(TODO: 専用秒数 `RHYTHM_START_INVULN_MS`)。

### Files changed
- `src/types/game.ts` — RhythmArrow/ShijinGod/RhythmPending/RhythmState、GameState に rhythm
- `src/config/shijin.ts` — 新規。リズム/四神技の定数(多くTODO仮値)+ヘルパー
- `src/store/gameStore.ts` — rhythm 状態/アクション、initialRhythm、リセットに反映
- `src/hooks/useGameLoop.ts` — idle検出/tick/pending実行/白虎/四神技ヘルパー
- `src/components/VirtualJoystick.tsx` / `src/hooks/useGameControls.ts` — リズム入力ルーティング
- `src/components/GameHUD.tsx` — フィニッシュカウンター表示を廃止
- `src/pixi/pixiScene.ts` — syncRhythmOverlay(ミラーボール/サークル/矢印)
- `package.json` — version 0.25.223

### Performance
- 4/10(Mid)。idle検出は毎フレーム軽量。リズム入力は離散イベント。白虎は0.5秒パルス。四神技は単発。
  UIは軽量Graphics(常時発光/大量パーティクルなし)。全体フィニッシュは一度のみ・軽量フラッシュ。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功。

### TODO / 要確認(未確定で仮値=実機調整)
- 判定幅(成功/ジャスト)、各四神技ダメージ/範囲、白虎射程/ダメージ、タップ/フリック威力、開始無敵秒数、Lv差分。
- ミス時に godSuccess(4回カウント)もリセットするか(現状は維持)。終了時のコンボ扱い(現状維持)。
- 朱雀/玄武/青龍/白虎の入力パターン仕様はモードA(ランダム4矢印・1本目=四神)で実装。固定パターンが要るなら別途。
- リズム自動開始(停止0.6s)は alchemy(立ち止まり召喚)と併存する点に注意(両方発動しうる)。

## 2026-06-13 - v0.25.222 - 通常サブウェポン「四神舞(リズム)」取得/強化の土台のみ (Claude Code)

### Summary
「ベースだけ」要望に対応し、四神舞(リズム/四神舞)を**取得/強化の配管(土台)のみ**実装。リズム入力・ミラーボール・
四神技(朱雀/玄武/青龍/白虎)・四神技4回後の全体フィニッシュ等の**インタラクティブ部分は未実装**(後続)。
理由: 仕様が「リズムモード開始操作は現行入力と衝突しないか実装前に確認」を明記しており、開始操作の決定が
インタラクティブ実装の前提になるため。数値の多くも未確定(TODO)で、勝手に固定しない方針に従う。

### 実装(土台)
- `SubWeaponKey` に `'shijin'` 追加。表示名 `四神舞`。
- 取得/強化フローへ登録: レベルアップカード(upgradeUtils, 説明に実装予定明記)、商人スキルカード
  (MainMenu陳列 / ShopMenu(CLASS_SKILL既定100) / buySkillCardFromShop, `SHOP_SHIJIN_COST=100`/TODO)。
- 刀/村雨装備中は併用不可(他サブと同様)。取得しても現状は無動作(副作用なし)。

### 未実装(後続・要確認/TODO)
- **リズムモード開始/維持操作**(専用ボタン無し→現行入力と非衝突の方式を要確認=次の決定事項)。
- ミラーボール/左右サークルUI(プレイヤー追従)、0.5秒(120BPM)判定、判定幅(TODO)。
- フリック方向パターン→四神技、コンボ全リセット、四神技4回後の全体フィニッシュ。
- 朱雀(近場3体グレネード爆破)/玄武(十字地割れ)/青龍(X字水流)/白虎(5秒・0.5秒毎・最大10斬り)。
- 「フィニッシュカウンター」表示の削除(コンボ統合時に対応予定)、開始時無敵(TODO秒数)。

### Files changed
- `src/types/game.ts` — SubWeaponKey に 'shijin'
- `src/store/gameStore.ts` — subWeaponDisplayName、SHOP_SHIJIN_COST、buySkillCardFromShop価格
- `src/utils/upgradeUtils.ts` — レベルアップカード(実装予定の説明付き)
- `src/components/MainMenu.tsx` — skillShopEntries に 'shijin'
- `package.json` — version 0.25.222

### Verification
- `npx tsc --noEmit` パス。

### Next handoff notes
- 次の決定事項: リズムモードの開始操作(片手操作維持・現行入力と非衝突)。決定後にUI/判定/四神技を実装する。

## 2026-06-13 - v0.25.221 - 通常サブウェポン「自動タレット」実装 (Claude Code)

### Summary
定点支援サブウェポン「自動タレット」を既存サブウェポン構造に乗せて実装(decoy/shieldの設置物パターンを踏襲)。

- **基本挙動**: 10秒ごと(`TURRET_COOLDOWN_MS`)にプレイヤー少し前方(`TURRET_PLACE_FORWARD=24`)へ設置。
  設置物は `weaponType:'turret'` の projectile(speed0・足元アンカー)。追従せず留まる=移動で置き去り。
  同時設置1個(既存があれば消す)。**Lv1持続5秒確定** / Lv2・Lv3は `TURRET_DURATION_BY_LEVEL` で暫定5s据置+TODO。
- **モード**: 設置時は必ず**前方集中**(`turretMode:'forward'`)。プレイヤーが**叩く**(triggerCounter のメレー接触を
  再利用、メレー範囲内のタレットを検出)と**全方位**(`'omni'`)へトグル。切替で見た目変化(色/砲身) + 短いリングVFX。
  - 前方集中: 設置向きへ直線射撃。射程`TURRET_FWD_RANGE=420`、間隔130ms/ダメージ7(handgun-t3=ティア3SMG相当)。
    前方の射線帯(半幅60)に敵がいる時だけ撃つ(空撃ち抑制)。
  - 全方位: 周囲の最も近い敵(近い敵優先)を狙う。射程`TURRET_OMNI_RANGE=200`、間隔420ms/ダメージ9(handgun-t1相当)。
- **グレネード弾**: 通常弾の代わりに**10%**(`TURRET_GRENADE_CHANCE`)でグレネード弾。既存ヘビーグレネードを流用
  (`weaponType:'grenade'`/HEAVY_GRENADE_* / fuse爆発=既存 timedGrenades ブロックで爆発)。全モードで現ターゲット方向へ発射。
- **消滅時爆発**: 寿命終了で小爆発(`TURRET_EXPLOSION_RADIUS=64`/`_DAMAGE=36`、既存爆発演出を流用)。範囲ダメージ+ノック無し。
  updateProjectiles のカリング前に寿命処理して爆発。味方/プレイヤーは無傷(敵のみ)。
- **取得/強化**: 通常サブウェポンとしてレベルアップカード(upgradeUtils)+ 商人スキルカード(MainMenu陳列/ShopMenu/
  buySkillCardFromShop, `SHOP_TURRET_COST=100`/TODO)に登録。刀/村雨装備中は併用不可(他サブと同様)。
- **干渉なし**: タレットは敵を引きつけない/敵弾を消さない/反射しない/味方弾に干渉しない。`weaponType:'turret'` を
  collisionUtils の被弾除外に追加(敵接触で消費されない)。スロー誘発なし(CLAUDE.md準拠)。
- **描画**: pixiScene に `syncTurrets`/`drawTurret`(Graphics、テクスチャ不要)。actorLayer で足元Y y-sort。
  前方集中=設置向きの単一砲身(琥珀)、全方位=放射状の短い砲身(シアン)。設置ポップ/寿命フェード/切替リングのみの軽量演出。

### Files changed
- `src/types/game.ts` — WeaponType/SubWeaponKey に 'turret'、Projectile に turretMode/turretModeSwitchedAt
- `src/utils/collisionUtils.ts` — 'turret' を被弾除外に追加
- `src/store/gameStore.ts` — subWeaponDisplayName、SHOP_TURRET_COST、buySkillCardFromShop価格、triggerCounter でモードトグル
- `src/hooks/useGameLoop.ts` — TURRET_* 定数、turretFireRef、設置ブロック、射撃+消滅爆発ブロック
- `src/utils/upgradeUtils.ts` — レベルアップカード追加
- `src/components/MainMenu.tsx` — skillShopEntries に 'turret'
- `package.json` — version 0.25.221

### Performance
- 3/10(Low-Mid)。10秒に1回・同時1個・Lv1で5秒のみ存在。射撃は既存弾/グレネード/爆発処理を流用。
  ターゲット探索はタレット単体(通常1個)で毎フレーム軽量スキャン。常時glow/大量パーティクル/重い常時エフェクトなし。
  安全弁: 同時設置1個、前方は射線帯ヒット時のみ発射、全方位は範囲内のみ、グレネード/爆発は既存の単発処理。

### Verification
- `npx tsc --noEmit` パス。`npm run build` 成功(2366 modules)。

### Next handoff notes
- 未確定値(TODOで明示): Lv2/Lv3持続・各強化(発射間隔/グレネード率/爆発威力・範囲/射程)、グレネード弾の専用バランス、
  消滅爆発の威力/範囲、SHOP_TURRET_COST。実機で調整。
- タレット見た目は Graphics 仮実装。専用スプライトが用意できたら drawTurret を差し替え可。

## 2026-06-13 - v0.25.220 - 鞭判定をLv非依存化 + ハリケーンチャージ軽減 + 巻き込み中は通常ダメージ + 鳴動音 (Claude Code)

### Summary
- **鞭の判定をレベルで変えない**: `WHIP_LENGTH_BY_LEVEL` [150,180,210] → **全Lv150固定**。射程(進行方向)が
  レベルで変動しなくなった(半幅は既に固定60)。
- **ハリケーンチャージ条件をレベルで軽減**: `WHIP_CHARGE_HITS_BY_LEVEL` [20,20,20] → **[40,35,30]**。
  Lv1=40(従来の倍)を基準に、レベルが上がるごとに-5で必要ヒット数が減る(=育てるほど早く撃てる)。
- **巻き込み中の敵への鞭は通常倍率**: `performWhipStrike` で、発動中ハリケーンの吸引半径内にいる敵には
  鞭の低倍率(0.25)ではなく**通常倍率(1.0)**でダメージ。ボスstun処刑/通常ヒット双方に適用。
- **ハリケーン鳴動「ゴゴゴゴ」音**: 手続き生成した低周波ランブル(`public/audio/sfx/hurricane.wav`,
  2.4sシームレスループ, 7.5Hzトレモロで go-go-go 感)を追加。`setHurricaneRumble(active)` で発動中だけ
  ループ再生(フェードイン/アウト, idempotent)。useGameLoop が毎フレーム現状態で駆動、死亡/アンマウントで停止。

### Files changed
- `src/store/gameStore.ts` — WHIP_LENGTH_BY_LEVEL固定、WHIP_CHARGE_HITS_BY_LEVEL軽減、performWhipStrikeに
  巻き込み判定(inHurricane)と whipMult を追加
- `src/audio/audioManager.ts` — 'hurricane' SfxKey/config、ループ再生 setHurricaneRumble
- `src/hooks/useGameLoop.ts` — 毎フレーム setHurricaneRumble 駆動、死亡/cleanup で停止
- `public/audio/sfx/hurricane.wav` — 新規(手続き生成ランブル, 約207KB)
- `package.json` — version 0.25.220

### Performance
- 鳴動音: 1/10。単一ループのBufferSource(発動中のみ)、毎フレームの駆動は遷移時以外no-op。
  メモリは約207KBのデコード済みバッファ1つ。フォールバック: muted時/buffer未ロード時は無音で安全。

### Verification
- `npx tsc --noEmit` パス。wav はシームレス(seam delta 24/65534)・peak85%で検証済み。

### Next handoff notes
- 鳴動の音量は audioManager の HURRICANE_VOLUME(0.7)で調整可。差し替え音源があれば src を変更。
- 巻き込み中の通常倍率は performWhipStrike の whipMult=1 を別値にすれば微調整可。

## 2026-06-13 - v0.25.219 - 鞭: 射程x半分 + 描画時間2倍/CD後ろ倒し + 近接クレスト非表示 (Claude Code)

### Summary
- **射程範囲の x(直交)を半分**: `WHIP_HIT_HALF_WIDTH` 120 → **60**。進行方向y(reach)はそのまま、
  振り方向に直交する当たり幅だけ半分に。当たり判定(performWhipStrike の perp 判定)が細くなる。
- **描画時間を倍 + クールダウンを後ろ倒し**: lash表示 `duration` 220 → **WHIP_DRAW_MS=440**。
  増分(`WHIP_COOLDOWN_EXTRA_MS`=220)を `counterCooldownEnd` に加算し、描画が伸びた分だけ次の振りも後ろへ。
- **鞭時は近接クレスト非表示**: `performWhipStrike` の per-hit `spawnSlash`(slashストリーク=近接クレスト)を削除。
  鞭は自身の lash スプライトのみで表現。ダメージ数字/ノックバック/弾薬ドロップ等は不変。

### Files changed
- `src/store/gameStore.ts` — WHIP_HIT_HALF_WIDTH半減、WHIP_DRAW_MS/WHIP_COOLDOWN_EXTRA_MS追加、
  triggerCounter(鞭)で duration/CD更新、performWhipStrike の spawnSlash 削除
- `package.json` — version 0.25.219

### Verification
- `npx tsc --noEmit` パス。

### Next handoff notes
- 鞭の太さ(見た目)は lash スプライト由来で当たり幅とは別。当たり幅は WHIP_HIT_HALF_WIDTH 一箇所。
- 描画時間/CD増分は WHIP_DRAW_MS / WHIP_COOLDOWN_EXTRA_MS で調整可。

## 2026-06-13 - v0.25.218 - ハリケーン発光の真因対応(tintをスモーキー暗色へ) (Claude Code)

### Summary
- **「full-alpha で光って見える」問題の真因を特定**: bloom ではなかった(tint 0x646a70 は輝度0.41で
  閾値0.45未満、かつ bloom の輝度抽出は alpha を割り戻すので全 alpha で非bloom と確認)。
  実体は **テクスチャのうずが明るい灰色(≈41%グレー)**で、alpha が上がると自発光に見えていた
  (フェードイン/アウトの低alpha時は暗く見える=「光らない時もある」と一致)。
- **対策**: `WHIP_HURRICANE_TINT` を 0x646a70 → **0x3c4248**(最大輝度0.41→0.26、平均0.33→0.21)へ。
  はっきり暗いスモーキー竜巻になり、full-alpha でも発光して見えない。暗い戦場でも視認は維持。

### Files changed
- `src/pixi/pixiScene.ts` — WHIP_HURRICANE_TINT を暗色化
- `package.json` — version 0.25.218

### Verification
- 比較プレビュー `/tmp/hurricane_tint_cmp.png` で新tintが明確に暗く非発光なのを確認。max輝度0.256。

### Next handoff notes
- 暗すぎて見えにくければ `WHIP_HURRICANE_TINT` を一段明るく(例 0x484e54)。一箇所で調整可。

## 2026-06-13 - v0.25.217 - ハリケーン吸引半径2倍 + 鞭ダメージ判定の調査 (Claude Code)

### Summary
- **惹きつけ範囲を2倍**: `HURRICANE_RADIUS_BY_LEVEL` [0,90,110,130] → **[0,180,220,260]**。
  視覚スプライト幅は `radius × WHIP_HURRICANE_WIDTH_MULT(3.0)` なので竜巻の見た目も比例して拡大する
  (Lv1で270→540px幅)。見た目を据え置きたい場合は WIDTH_MULT を下げて相殺可(視覚のみ)。
- **鞭ダメージ判定の調査**: `performWhipStrike`(gameStore.ts:1544–1640)に**実ダメージ判定あり**。
  `baseDamage = meleeWeapon.damage × WHIP_DAMAGE_MULT(0.25)`(ナイフ8→2/ダガー14→3.5/FN20→5)。
  health 減算・ダメージ数字・kill計上あり、**スタン敵は即処刑(finisher)**、ボスはstun時 ×BOSS_MELEE_STUN_MULT。
  設計コメント上は「低/最小ダメージ」で意図的。完全ノックバック特化(ダメージ0)にするか要確認。

### Files changed
- `src/store/gameStore.ts` — HURRICANE_RADIUS_BY_LEVEL 2倍
- `package.json` — version 0.25.217

### Verification
- 数値定数変更のみ。tsc 影響なし。

### Next handoff notes
- 鞭ダメージを残す/消すはユーザー確認待ち。消す場合は WHIP_DAMAGE_MULT=0 か performWhipStrike の health 減算を分岐。

## 2026-06-13 - v0.25.216 - ハリケーン: 0.1秒毎ミラー + 発光完全停止 + 吸引半径プレビュー (Claude Code)

### Summary
- **0.1秒毎に左右反転**: `syncWhipHurricane` で `scale.x` の符号を `WHIP_HURRICANE_FLIP_MS=100` 周期でトグル。
  脈動(pulse)・伸縮(width)はそのままに符号だけ反転させ、渦が回って見えるミラー演出を追加。
- **発光を完全停止**: ハリケーンは `effectLayer`(AdvancedBloom フィルタ配下)にあり、テクスチャが明る過ぎて
  (不透明画素の99.4%が bloom 閾値0.45超、平均輝度0.806)alpha 脈動に応じて「光ったり光らなかったり」していた。
  `WHIP_HURRICANE_TINT=0x646a70`(全チャンネル<114=0.45×255)を sprite に常設し、合成後輝度を閾値未満に沈めて
  bloom を完全に抑止。スモーキーなブルーグレーの竜巻になり一切発光しない。視覚のみ=吸引/ダメージは不変。
- **吸引半径プレビュー**(確認用画像、ゲームには非投入): 実吸引半径 `HURRICANE_RADIUS_BY_LEVEL`(Lv1=90)を
  赤のピクセルサークルで根元中心に描画。描画スプライト幅=半径×3.0(Lv1で270)は黄ドットで併記。
  **見た目の竜巻(270幅)に対し実際に巻き込む範囲は直径180**と判明=視覚は判定の約3倍幅。

### Files changed
- `src/pixi/pixiScene.ts` — flip周期/tint定数追加、setupでtint常設、syncWhipHurricaneでscale.x符号トグル
- `package.json` — version 0.25.216

### Verification
- `npx tsc --noEmit` パス。吸引半径プレビュー `/tmp/hurricane_range.png` で非発光・ミラー素材・実半径を確認。

### Next handoff notes
- 竜巻の色味/暗さは `WHIP_HURRICANE_TINT` 一箇所で調整可。もっと暗く/明るく/青みは値変更だけ。
- 視覚幅と実吸引半径の乖離(3倍)が気になる場合は `WHIP_HURRICANE_WIDTH_MULT` を下げる(視覚のみ)。

## 2026-06-13 - v0.25.215 - 鞭lash実スプライト + ハリケーン新ドット絵/非発光/滞在4倍 (Claude Code)

### Summary
- **鞭 lash を実スプライト化**(素材IMG_5742をチャット直添付で受領)。紫クロマ背景をキーアウト→クロップして
  `public/sprites/whip.png`(996×132)。Pixi効果に `drawWhipSprite` を追加: **手元グリップをプレイヤー位置に固定し、
  振り方向へ回転・手元→先端が strike 距離(reach)に一致するよう伸縮**、一振りごとにフェード。素材は右向き(+x基準)。
  手続き的lashストロークは `whip` を `drawWhipSprite` へ振り分けて置換。当たり判定(±120)は不変=視覚と判定は別。
- **ハリケーンを新ドット絵竜巻に差し替え**(素材IMG_5750)。クロマキーで元色保持(白〜水色)。
- **ハリケーンを光らせない**: 竜巻スプライトを加算合成→**通常合成**に変更(発光をやめ素材本来の見た目に)。
  アンカー/比率を新素材(正方・縦長竜巻)に合わせ更新(`ANCHOR_Y=0.92`, 高さ=幅)。
- **ハリケーン滞在時間をさらに2倍**(計4倍): `HURRICANE_DURATION_MS_BY_LEVEL` `[0,2400,2800,3200]` → **`[0,4800,5600,6400]`**。
- 負荷スコア: **1/10**(効果スプライト1枚を一振り中のみ更新 / 竜巻は常設1枚)。検証: `lint` クリーン / `build` 成功 / dist出力確認。

### Files changed
- `public/sprites/whip.png`(新規), `public/sprites/whip-hurricane.png`(差替), `src/pixi/pixiTextures.ts`,
  `src/pixi/pixiScene.ts`, `src/store/gameStore.ts`, `package.json`

### Next handoff notes
- 鞭lashのアンカー(`WHIP_SPRITE_ANCHOR_X=0.10, _Y=0.676`)・太さ(スケール等倍)、ハリケーンの竜巻アンカー/サイズは実機で要微調整。定数のみ。

## 2026-06-12 - v0.25.214 - 鞭がナイフ枠を占有(HUD表示) (Claude Code)

### Summary
- **鞭を取得するとナイフ枠を鞭が占有**(ユーザー意図確認済み: 「取得で鞭がナイフ枠を占有」)。鞭は元々 `isWhipMode` で
  ナイフ近接スイープを機能的に置換済みだったが、HUDの近接スロットは🔪/ナイフ表示のままだった。HUDを修正し、
  鞭所持時(刀非装備)は **アイコン➰・ラベル「鞭」** を表示=ナイフ表示が消える。優先順位: 刀 > 鞭 > ナイフ。
- データモデル(WeaponType等)は不変・HUD表示のみの変更で低リスク。負荷スコア **1/10**。
- 検証: `npm run lint` クリーン / `npm run build` 成功。

### Files changed
- `src/components/GameHUD.tsx`, `package.json`

## 2026-06-12 - v0.25.213 - 鞭ハリケーン滞在2倍 + 鞭は必ずノックバック (Claude Code)

### Summary
- **鞭ハリケーンの滞在時間を2倍**。`HURRICANE_DURATION_MS_BY_LEVEL` `[0,1200,1400,1600]` → **`[0,2400,2800,3200]`**。
- **鞭は必ずノックバック**。従来はノックバック無敵窓(`knockbackImmuneUntil`)中の敵は弾かれなかったが、`performWhipStrike`
  でこの窓を無視して**毎回ノックバック**するように(else分岐の「ノックバック0」を撤去)。
- 負荷スコア: **1/10**(定数 + 分岐簡素化のみ)。検証: `lint` クリーン / `build` 成功。

### Files changed
- `src/store/gameStore.ts`, `package.json`

### Next handoff notes
- 「鞭はナイフの置き換えに変更」(task)は**意図確認待ち**。現状すでに鞭装備中はナイフ近接スイープを鞭へ置換済み
  (`isWhipMode`)。ローダウト/取得の構造変更かどうかをユーザーに確認中。
- 鞭 lash スプライト(IMG_5742)は依然 35KB のままで自動ファイル保存経路に乗らず未取得。300KB以上での再書き出し or 許可ホスト公開URLが必要。

## 2026-06-12 - v0.25.212 - 鞭チャージ満タンでピカッと光って通知 (Claude Code)

### Summary
- **鞭のハリケーンチャージ満タンを「ピカッ」と光って通知**。`becameCharged`(ヒット数が閾値到達=次の一振りで
  ハリケーン)の瞬間に、従来の控えめなリング1枚を強化: 画面の一瞬の明滅(`spawnFlash` 150ms)+ 白い閃光リング +
  シアンの輪 + 光の粒バースト。イベント時1回のみ・有界。
- スロー演出は付けない(CLAUDE.md: サブウェポンのスロー禁止に準拠)。負荷スコア **1/10**(チャージ達成時の単発エフェクト)。
- 検証: `npm run lint` クリーン / `npm run build` 成功。

### Files changed
- `src/store/gameStore.ts`, `package.json`

## 2026-06-12 - v0.25.211 - 鞭のx軸(直交)判定を5倍に (Claude Code)

### Summary
- **鞭の当たり判定を横方向に拡大**。鞭は振り方向(=y軸)へ伸びる直線カプセル。その**直交(x軸)半幅**
  `WHIP_HIT_HALF_WIDTH` を `24` → **`120`(5倍)** に。`perp <= WHIP_HIT_HALF_WIDTH + e.width/2` の判定が広がり、
  細い線から幅広いなぎ払いに。視覚帯(`whip` エフェクトの `halfWidth*2` ストローク)も同定数を参照するため一致して広がる。
- 負荷スコア: **1/10**(定数のみ。判定ロジック・計算量は不変)。
- 検証: `npm run lint` クリーン / `npm run build` 成功。

### Files changed
- `src/store/gameStore.ts`, `package.json`

## 2026-06-12 - v0.25.210 - 鞭ハリケーン実スプライト + 死神近接AoE + 召喚耐久2倍 (Claude Code)

### Summary
- **鞭ハリケーンを実スプライト化**。社長提供素材(Drive `188...EtaE/…ハリケーン.png`, 1536×1024 の竜巻)の
  青灰背景をキーアウトし、`cyan→白`の発光竜巻(発光強度=alpha)へ変換、768×512(**184KB**)で `public/sprites/whip-hurricane.png` 生成。
  Pixi の `effectLayer` に竜巻スプライトを常設し、`syncWhipHurricane` が store の `hurricane` 状態がある間だけ表示・
  立ち上がり/消滅で alpha フェード。位置=吸引中心(rootX/rootY)、アンカー=竜巻の根元(地面の渦)、加算発光、わずかな鼓動。
  旧・手続き的リング2枚(`performHurricane` の `spawnRing`)は廃止。**描画専用で吸引半径/ダメージ/持続には不干渉**。
- **召喚レア(死神)に近接AoE**。従来は吸引のみ(ダメージなし)だったが、**0.5秒ごとに巻き込み範囲の敵へ近接ダメージ**
  (`ALCHEMY_RARE_MELEE_DAMAGE=10`, `…INTERVAL_MS=500`)。吸引で寄せた敵を継続的に削る。対象は吸引対象(cap12)を流用。
- **召喚の耐久を2倍**。`ALCHEMY_SUMMON_HP_BY_LEVEL` `[0,100,150,200]` → **`[0,200,300,400]`**(Lv1=200/Lv2=300/Lv3=400)。
- 負荷スコア: **1/10**。竜巻は常設Sprite 1枚をハリケーン中のみ更新。死神AoEは既存の吸引ループに時間判定を1つ足すのみ(対象cap据置)。
- 検証: `npm run lint` クリーン / `npm run build` 成功 / `dist/sprites/whip-hurricane.png` 出力確認。

### Files changed
- `public/sprites/whip-hurricane.png`(新規), `src/pixi/pixiTextures.ts`, `src/pixi/pixiScene.ts`,
  `src/store/gameStore.ts`, `src/utils/summonUtils.ts`, `package.json`

### Next handoff notes
- 鞭の lash スプライト(IMG_5742, 35KB)は **本環境からDrive直取得できず未組込み**。Drive の小サイズ画像は inline base64 で返り、
  確実にファイル化できない(curlは非公開のため不可)。**公開URL(monopro等)での受領を推奨**(handoff記載の既定方式)。
  受領でき次第、magic-circle 同様にキーアウト→「プレイヤー手元アンカー・振り方向へ回転/伸縮」で lash を置換予定。
- 死神AoEダメージ/竜巻サイズ(`WHIP_HURRICANE_WIDTH_MULT=3.0`)・アンカー(`…ANCHOR_Y=0.766`)は実機で要微調整。定数のみで可。

## 2026-06-12 - v0.25.209 - 召喚の被弾をプレイヤーと同じ無敵時間構造に (Claude Code)

### Summary
- **召喚(通常個体)の被弾頻度を是正**。旧実装は「敵×召喚ペアごとに 500ms throttle」だったため、
  敵が群がると敵数ぶん多重被弾し**高頻度で削られすぎ**ていた。
- プレイヤーと**同じ無敵時間(i-frame)構造**へ統一: `damageSummon` 側で `now - lastHit < INVULN_MS(700ms)`
  なら無敵として被弾を無視。これで敵が何体いても **1 無敵窓につき被弾 1 回**に制限される。
- ループ側(`useGameLoop`)は per-pair throttle(`alchemyHitRef`)を撤去し、毎フレーム衝突を `damageSummon` に
  渡すだけに簡素化(プレイヤーの被弾処理と同型)。同フレーム内の重複は 1 体 1 回・最大ダメージへ畳んで set 回数を抑制。
- 負荷スコア: **1/10**(set 呼び出しはむしろ削減。判定ロジックは時間比較のみ)。
- 検証: `npm run lint` クリーン / `npm run build` 成功。

### Files changed
- `src/store/gameStore.ts`(damageSummon に i-frame ゲート)、`src/hooks/useGameLoop.ts`(alchemyHitRef 撤去・簡素化)、`package.json`

### Next handoff notes
- 鞭(whip)の実スプライト素材を Drive `188FNWrSMGGtipDybZYYDNJaZZnunEtaE/IMG_5742.PNG`(1024² の縦長グロー帯)で受領済み。
  用途(現状の手続き的 lash 帯の置換 等)が未確定のため未組込み。指定があれば magic-circle と同様にキーアウト→組込み可能。

## 2026-06-12 - v0.25.208 - 魔法陣スプライト差し替え(手続きリング→足元の常設地面スプライト) (Claude Code)

### Summary
- **錬金術の魔法陣を実スプライト化**(task#1)。社長提供の素材(Drive `188FNWrSMGGtipDybZYYDNJaZZnunEtaE/IMG_5736.PNG`,
  1024² の透視楕円の魔法陣)を採用。背景の不透明インディゴ `(67,8,121)` をキーアウトし、
  **発光強度=alpha** の `cyan(#38bdf8)→白ホット`グローに変換、512²へ縮小して `public/sprites/magic-circle.png`(70KB)を生成。
  透明部もシアンで埋め縮小時の黒縁を回避。
- **手続き的リング(spawnRing 280ms throttle)を廃止**。代わりに Pixi の `groundLayer` に魔法陣スプライトを**常設**し、
  `syncAlchemyCircle` がチャネル中のみ表示・`alpha=溜め進捗(透明→完成で不透明)`で連続フェード。位置は足元(`playerFootBox`)、
  加算合成、完成間際に微鼓動。完成の「光で召喚」は既存 `summonAlchemy` のフラッシュ/バーストが担当。
- 描画専用で当たり判定/召喚ロジックには不干渉(`PixiScene` は store の純粋リーダー)。テクスチャは非同期ロード後に一度だけ割当。
- 変更: `pixiTextures.ts`(`magic-circle` を linear で追加ロード)、`pixiScene.ts`(スプライト+`syncAlchemyCircle`)、
  `useGameLoop.ts`(リング emit と `alchemyCircleRef` 削除)。
- 負荷スコア: **1/10**。常設Sprite 1枚をチャネル中のみ位置/alpha更新、非チャネル時は早期return。
  512²(GPU約1MB)を1回ロード。旧 spawnRing の毎280msエフェクト生成より churn は減少。
- 注: 効果は **PixiJS のみ**。レガシー Canvas2D フォールバック(`?renderer=canvas`)ではチャネル演出は出ない(方針通り未保守)。
- 検証: `npm run lint` クリーン / `npm run build` 成功 / `dist/sprites/magic-circle.png` 出力確認。

### Files changed
- `public/sprites/magic-circle.png`(新規), `src/pixi/pixiTextures.ts`, `src/pixi/pixiScene.ts`,
  `src/hooks/useGameLoop.ts`, `package.json`

### Next handoff notes
- 実機で魔法陣のサイズ(`ALCHEMY_CIRCLE_SIZE=168`)・フェード曲線(`0.08+0.92*progress`)・完成鼓動を要確認。要調整なら定数のみで可。
- 素材は今後も Drive フォルダ `188FNWrSMGGtipDybZYYDNJaZZnunEtaE` に追加される運用。

## 2026-06-12 - v0.25.207 - Sprite PNG optimization + alchemy HP tuning (Claude Code)

### Summary
- **キャラ絵/スプライトPNG最適化(社長承認済み)**: `public/sprites/*.png` 43枚を最適化。
  `pngquant`(quality floor **88**, `--skip-if-larger`)→ `oxipng -o max` の2段。
  品質下限88に届かない要求の高い画像(`atlas.png`/`castle.png`/`player-shotgun-*`/`treasure-2`/`treasure-6`)は
  自動でロスレスにフォールバック。**合計 3.94MB → 2.91MB(−26%, 約1.0MB削減)**。寸法・αは全て不変。
  ピクセルアート(`player.png` −72%)は原画と視覚的に区別不可を目視確認。
  `atlas`/`castle` はフルカラーでパレット化不可(q70も未達)のためロスレス維持(品質優先)。
- **錬金術の召喚体力を調整**(`utils/summonUtils.ts`): `ALCHEMY_SUMMON_HP_BY_LEVEL` を `[0,50,70,100]` →
  **`[0,100,150,200]`**(Lv1=100/Lv2=150/Lv3=200)。レア消滅は既に10秒(`ALCHEMY_RARE_LIFETIME_MS=10000`)で要件充足、変更なし。
- 付随: `gameStore.ts` の未使用import `ALCHEMY_SUMMON_DAMAGE` を削除(base 3b6d11b 由来の既存lintエラー解消、挙動不変)。
- 負荷スコア: **1/10**。ビルド時最適化のみでランタイムコスト増なし(むしろ転送量・デコード減で有利)。
- 検証: `npm run lint` クリーン / `npm run build` 成功。

### Files changed
- `public/sprites/*.png`(43枚), `src/utils/summonUtils.ts`, `src/store/gameStore.ts`, `package.json`

### Next handoff notes
- 魔法陣スプライト差し替え(task#1)は素材待ち: Drive フォルダ `188FNWrSMGGtipDybZYYDNJaZZnunEtaE` に
  `生成画像1 (1).png`(1.7MB, AI生成と思われる魔法陣候補)等あり。採用素材の指定があれば常設地面スプライト化(alpha=溜め進捗)に進む。

## 2026-06-13 - v0.25.206 - Alchemy polish: summon size matches enemy + completion juice (Claude Code)

### Summary
- 召喚ユニットの描画サイズを**敵と一致**。`renderSpec.summonFootBox`(流用元タイプの `ENEMY_VISUAL_SCALE` を使用)を追加し、
  `drawSummon` をそれに差し替え(従来は当たり判定サイズで描き小さく見えていた)。
- **召喚完了演出**を追加(`summonAlchemy`): 暗転(`spawnFlash` 黒)+ スロー(`triggerTimeSlow`)+ パーティクル(`spawnBurst`)。
  レアは強め(スロー長め・パーティクル多め・死神の黒も混ぜる)。
- 検証: `tsc --noEmit` パス。

## 2026-06-13 - v0.25.205 - Terminology: ストラップ/STRAP → スクラップ/SCRAP (Claude Code)

### Summary
- ゲーム内表示用語を「ストラップ/STRAP」→「スクラップ/SCRAP」に統一(表記修正)。変更は**表示ラベルのみ**:
  GameHUD(STRAP→SCRAP)、ShopMenu(STRAP→SCRAP)、GameOverScreen(ストラップ残/残ストラップ→スクラップ)、MainMenu(1000ストラップ開始→スクラップ)。
- 内部変数 `straps` / 定数 `*_STRAP_*` 等は表示対象外のため据え置き(挙動不変)。`s` 接尾はスクラップでも有効なので維持。

## 2026-06-13 - v0.25.204 - Alchemy (錬金術) sub-weapon: summon allies + rare reaper hurricane (Claude Code)

### Summary
- 新通常サブウェポン「錬金術」。プレイヤーが5秒立ち止まる(`player.isMoving=false`)と魔法陣完成→味方ゾンビ召喚。
  チャネルは useGameLoop の hunting-charge 後(gameTime基準、移動で中断・被弾は非中断TODO・クールダウン無し)。
  魔法陣=進捗で濃くなるシアンの地面リング(spawnRing throttle)+完成フラッシュ。
- 召喚は `enemies` と別配列 `summons`(副作用ゼロ: kill統計/勝利/スポーンcap/カリング等は enemies のみ参照)。
  通常個体: HP固定 50/70/100、見た目/速度は敵タイプ流用(Lv1 zombie/Lv2 werewolf/Lv3 pumpkin)、シアンtintで識別。
  最大3体FIFO、プレイヤーへ間合い追従(密着しない)、近接で敵に低ダメ(throttle)、距離/HP0で消滅。
- レア個体(10%): `reaper`(死神)ヴィジュアル。既存通常を全消去し枠専有、10秒で必ず消滅(HP制でない)。
  中心へ敵を吸引(鞭ハリケーンの吸引を `updateSummons` 内に複製、reaper除外・cap12・移動中心へ毎フレーム照準)。
- **敵ターゲット選択(新規)**: `resolveEnemyTarget`(enemyUtils)で aggro範囲(=ハンドガン380)内の通常召喚が
  プレイヤーより近ければ狙う(ソフト/局所、既定プレイヤー)。`updateEnemies` chase と plant 射撃に適用。
  敵→召喚の接触ダメは `checkEnemySummonCollisions`(collisionUtils)+ pair throttle 500ms。召喚は物理ブロックしない。
- 取得/強化: SubWeaponKey 'alchemy' / 表示名「錬金術」/ レベルアップカード(!ownsKatana 排他)/ 商人(SHOP_ALCHEMY_COST=100)/
  スタート画面解放。定数は `utils/summonUtils.ts`(新)に集約、全て仮値TODO。
- 変更: types/game.ts, utils/{enemyUtils,summonUtils(新),collisionUtils,upgradeUtils}.ts, store/gameStore.ts,
  hooks/useGameLoop.ts, pixi/pixiScene.ts, components/MainMenu.tsx。
- 検証: `tsc --noEmit` / `vite build` パス(EXIT 0)。手触り(追従・敵の寄り・吸引・レア演出)は社長の実機確認/調整待ち。

## 2026-06-12 - v0.25.203 - Whip (鞭) sub-weapon + hurricane (Claude Code)

### Summary
- 新通常サブウェポン「鞭」(全クラス共通・取得専用)。装備中はナイフ近接を鞭に置換(刀と排他=`!ownsKatana` +
  `isWhipMode = hasWhip && !isKatanaMode`)。入口は既存 `triggerCounter` の刀分岐直後に自己完結ブランチ(早期return)。
  カウンター窓は通常どおり開くため敵弾反射(カウンター)は自動成立=優先。
- 鞭スイープ: 進行方向の細長いカプセル(刀ダッシュ幾何流用)。`performWhipStrike` で低ダメージ
  (`WHIP_DAMAGE_MULT=0.25`)・大ノックバック(`WHIP_KNOCKBACK_SPEED=KNOCKBACK_SPEED*3=600`、外向き)・クリ・
  近接フィニッシュ(スタン敵即処刑/ボス5×)・弾薬20%固定(`grantMeleeKillRewards` に上書き引数追加)。
- チャージ: ヒットごと加算(空振り0)。`WHIP_CHARGE_HITS_BY_LEVEL=20` 到達で待機(満タン合図リング)。
  次の一振りで `performHurricane` 発動→charge=0。自動発動しない。
- ハリケーン: store状態 `hurricane`(鞭先端=根元の固定点)。`tickHurricane` を毎フレーム(60msスロットル)呼び、
  半径内の敵を距離順に最大12体まで根元へ吸引(knockback場に書込)。`HURRICANE_*` 定数。プレイヤーへは吸わない。
  フィニッシュはハリケーン中の通常スイングで成立。
- 取得/強化: レベルアップカード(`upgradeUtils`、`!ownsKatana && whipLvl<3`)/ 商人(`SHOP_WHIP_COST=100`)/
  スタート画面解放(`MainMenu` skillShopEntries)。表示名「鞭」。
- 数値は実機調整前提の仮値(TODO)。検証: `tsc --noEmit` / `vite build` パス(EXIT 0)。手触りは社長の実機確認待ち。

## 2026-06-12 - v0.25.202 - Decoy enemy-collision + laser/sound, shield clank thicker (Claude Code)

### Summary
- デコイ: 着地後は**敵のみ通行不可**(下部フットプリント `DECOY_FOOT_W=48/H=20` で resolveAabb、reaper貫通)。
  プレイヤーは通す。`useGameLoop` の updateEnemies 直後に専用パス(コスト Low)。
- デコイ迎撃レーザーを見やすく: trail `duration 140→320ms`。
- デコイ迎撃に**効果音追加**(従来無音): `decoy-zap`(counter.mp3 を高ピッチ・小音量・間引き流用)。
- 盾の展開音「ガチャン」を**太く**: `shield-deploy` に `playbackRate=0.82`(低ピッチ化、ファイル追加なし)。
- 検証: `tsc --noEmit` パス。手触り・音は社長の実機確認待ち。

## 2026-06-12 - v0.25.201 - Shield: player-pushable + bash uses travel direction (Claude Code)

### Summary
- 盾はプレイヤーを止めなくなった: 触れると進行方向へ盾を平行移動(スノープラウ)。`gameStore` movePlayer の
  プレイヤー阻止 resolveAabb を撤去し、重なった盾を移動量だけ平行移動。動いた盾は既存の毎フレーム
  「盾→敵 resolveAabb」で前方の敵を比例して押し出す(新規コストほぼゼロ=Low)。敵側の貫通不可は維持。
- バッシュの飛び出し方向を**プレイヤーの進行方向(`lastDirection`)**で決定(設置時の向きではない)。
  停止中は設置法線にフォールバック。飛距離50・耐久-5は据え置き。
- 検証: `tsc --noEmit` パス。手触りは社長の実機確認待ち。

## 2026-06-12 - v0.25.199-200 - Shield graphic/collision + tuning, Decoy sprite (Claude Code)

### Summary
- 設置型シールドをプログラム描画 → **向き別スプライト**へ差替。社長提供の1枚シート
  (1024x1024・紫背景・上下左右4構成、「外側からキャラが持つ」逆構図)を切り出し・紫キーアウトし、
  `public/sprites/shield-{up,down,left,right}.png` を生成(`art_src/shield/` にシート/スクリプト、未コミット)。
  向き対応は社長確認で**完全反転**: シートTOP→down / BOTTOM→up / LEFT→right / RIGHT→left。
  描画は `pixiScene.syncShields`/`drawShield`(`p.direction` で4方向選択、足元アンカー)。
- **当たり判定を木と同じ「下部のみ」フットプリント**に変更。`SHIELD_FOOT_W=54 / SHIELD_FOOT_H=16`
  (旧 `SHIELD_LENGTH/THICKNESS` 壁を撤去)。`actorLayer` に置き足元Yで y-sort → 上部はキャラ被り。
- **すり抜け不可を敵+プレイヤー両方**に。敵は従来どおり `resolveAabb`(footprint)。プレイヤーは
  `gameStore` 移動処理に盾 footprint の `resolveAabb` を追加(木/障害物と同じ流儀)。
- 盾効果範囲(遮断/敵弾削除/バッシュ)は footprint に追従。耐久/フェード/バッシュ/敵弾削除ロジックは温存。
- **「ガチャンッ!」展開演出**: 着地ダストリング + 着地スラム(上から落ちて squash、`SHIELD_DEPLOY_MS=200`/
  `SHIELD_DEPLOY_DROP=16`)+ SFX `shield-deploy`(暫定で counter.mp3 流用、専用クランク音に差替可)。
- 表示サイズ `SHIELD_DISPLAY_H=92`。各値は実機調整TODO。
- **盾の実機調整で確定(v0.25.200)**: 面は法線に直交させ向き別展開(上下=横108/左右=縦108、奥行16)。
  左右向きは `SHIELD_SIDE_DROP=18` で範囲と絵を下げ。着地ダストは固定半径64。バッシュ=飛距離
  `SHIELD_BASH_SHOVE_DISTANCE=50`、一発破壊をやめ `SHIELD_BASH_DURABILITY_COST=5`(耐久を5消費・
  0以下で破壊。Lv1/2/3=10/30/60 → 約2/6/12回バッシュ可)。
- **デコイのグラフィック差し替え(v0.25.200)**: 受領シート(1024²・紫背景・単体装置)をキーアウトし
  `public/sprites/decoy.png`(520x348)を生成。プログラム円盤 → `pixiScene.syncDecoys/drawDecoy` の
  スプライト描画へ(射程サークルは維持)。`DECOY_DISPLAY_H=56`、中心アンカー(下寄り0.9)、向きなし全方向。
- 検証: `tsc --noEmit` / `vite build` パス(EXIT 0)。手触り・サイズは社長の実機確認待ち。

## 2026-06-11 - v0.25.197 - Scavenger standing sprite replaced (Claude Code)

### Summary
- スカベンジャー(necromancer)の立ち絵を新しい髭の銃使いアイドル3フレームに差替。
  差替先は `public/sprites/player-striker-walk-{0,1,2}.png`(歴史的にファイル名とクラス名が
  逆だが、メニュー[MainMenu]・ゲーム内[pixiScene]ともこの3枚を necromancer に一貫使用)。
- 処理(System.Drawing、インストールなし): 元画像(1672x941, 3フレーム/紫背景)を3分割→
  背景透過(紫キー)→各フレームの頭中心を出力 x=64 に統一(横ブレ防止)→足元を共通接地線(y=103)に→
  既存と同じ 128x108・キャラ約70x96 へ NearestNeighbor 縮小(ドット感維持)。
- `-game-`(96x80)は描画未使用のため不変。rogue の `player-scavenger-*`(別キャラ)も不変。
- 旧3枚は `art_src/backup/`、元画像/スクリプトは `art_src/`(未コミット)。
- `v0.25.198`: 選択画面でスカベンジャーだけ小さい指摘を修正。キャラ高を ~96 → ~106 に拡大
  (他クラス占有高 magnum=108 / scavenger-rogue=108 / shotgun=96 に対し striker(scavenger)が96で小さかった)。
  頭中心 x=64・足元基準・透過・NearestNeighbor は維持。

## 2026-06-11 - v0.25.190-196 - Deployable Shield sub-weapon + bash (Claude Code)

### Summary
- 新通常サブウェポン「設置型シールド」: 5秒ごとに進行方向の反対側へ遮蔽壁を自動設置(全Lv共通
  5秒持続)。敵の通行を `resolveAabb` で遮断(プレイヤーは貫通)、接触で外向きノックバック、
  敵弾は重なりで削除、味方/自弾は貫通。耐久は接触1回・敵弾1発で各1消費、Lv1/2/3=10/30/60。
  reaper のみ貫通。`updateProjectiles` の duration カリングで5秒自然消滅(残り600msで早めフェード)。
- シールドバッシュ: 近接が壁に届くと壁を法線方向へトラップと同じ shove 機構でシームレスに押し出し、
  掃過AABBの敵全部に近接×3+押し出し方向への強ノックバック。スライド終了(shieldBreakAt)で強制破壊。
- 取得/強化は既存 `applySubWeaponCard` に統合(レベルアップカード/商人スキルカード/スタート画面解放)。
- 主な定数(調整しやすいよう分離): `SHIELD_*`(useGameLoop), `SHIELD_BASH_*`(gameStore)。

### Code touched
- `src/types/game.ts`(WeaponType/SubWeaponKey に 'shield'、Projectile に shieldHp/shieldMaxHp/shieldBreakAt)
- `src/hooks/useGameLoop.ts`(発動+毎フレーム処理: 遮断/耐久/敵弾消去/強制破壊)
- `src/store/gameStore.ts`(triggerCounter にシールドバッシュ統合、subWeaponDisplayName)
- `src/utils/collisionUtils.ts`('shield' を体当たり判定から除外)
- `src/pixi/pixiScene.ts`(drawProjectile に 'shield' ケース: 表/裏/持ち手/反り/フェード)
- `src/utils/upgradeUtils.ts`(シールドのレベルアップカード)
- `src/components/MainMenu.tsx`(スタート画面スキルショップに 'shield')

### Verification
- OK: `tsc --noEmit` / `vite build`。手触り・見た目は社長の実機確認。

## 2026-06-11 - v0.25.188-189 - Decoy finalize + LAN HMR fix (Claude Code)

### Summary
- デコイ: 射程をLv別 `DECOY_RANGE_BY_LEVEL=[0,120,160,200]`(Lv3で画面横にギリギリ)、
  迎撃間隔 0.5s→0.2s、Lv1持続 5s→7s。射程サークルをドット多数→単一ストローク円(軽量)に。
- バグ修正: デコイ(と設置物)が敵の体当たりで消えていた → `checkProjectileEnemyCollisions` の
  除外リストに `decoy`/`shield` を追加。
- 環境修正: `vite.config.ts` の `hmr.host:'localhost'` を撤去。実機(LAN)で HMR が切れ
  「直しても反映されない」原因だった。未指定で origin 自動判定。

## 2026-06-11 - v0.25.186 - Decoy: show range circle + widen range x3 (Claude Code)

### Summary
- ユーザー指摘2点:
  - デコイの射程をサークル(ピクセル点線)で表示。射程半径はデコイ projectile の
    `area` に載せ、`pixiScene` の decoy 描画でドット円として描く(常時glowなし)。
  - 射程をLv1で現状の約3倍に拡大。`DECOY_RANGE` 150 → 450(全Lv共通)。
    判定(二乗比較)と描画サークルは同じ `area` 値を共有。

### Code touched
- `src/hooks/useGameLoop.ts`(DECOY_RANGE=450、生成時に area=射程をセット)
- `src/pixi/pixiScene.ts`(decoy にピクセル点線の射程サークル描画を追加)
- `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint` / `npm run build`
- 見た目(サークル・拡大射程)は実機で確認予定(プレビューはタブ非アクティブ時
  にループが絞られ安定撮影できないため)。

## 2026-06-11 - v0.25.185 - Add Decoy sub-weapon (bullet interceptor) (Claude Code)

### Summary
- ロールバックアンカー: branch `backup/pre-decoy-2026-06-11` / tag `pre-decoy-v0.25.184`。
- 新通常サブウェポン「デコイ」: 進行方向へ円盤型装置を投げて設置し、設置中は
  0.5秒ごとに射程内の最も近い敵弾を1発だけ迎撃して消す(短いピクセルレーザー
  →弾削除)。敵本体・敵弾を引きつけず、味方弾/近接/カウンター/刀には干渉しない。
- 仕様:
  - クールダウン10秒(全Lv共通)。10秒ごとに自動投擲。方向は `lastDirection`
    (取れなければ `{1,0}`)。
  - 持続: Lv1=5s / Lv2=6s / Lv3=7s(+1s/Lv)。迎撃間隔0.5s・1発固定は全Lv共通。
  - 同時設置1個(新規投擲時に既存デコイを除去)。
  - 迎撃はパルス方式(毎フレームではない)。距離は二乗比較。高速弾が0.5秒の
    間に通過した取りこぼしは許容(swept/補間判定なし)。`hostile` 弾のみ対象。
  - 演出: 小さな円盤装置(明滅コア)+迎撃時の短命 trail レーザー。常時glow・
    大量パーティクル・長時間トレイルなし。スロー対象外。
- 実装:
  - デコイは projectile(`weaponType:'decoy'`)として管理。`decoyLandAt` まで
    投擲方向へ移動し、以降は停止(`updateProjectiles` に分岐追加)。
  - 発動と迎撃パルスは `useGameLoop` に追加。パルス周期は per-decoy の
    `decoyPulseRef`(gameTime ms)で管理。
  - 取得/強化はレベルアップカード+スタート画面スキルショップ解禁→商人購入。
    刀/村雨装備中は出さない(併用不可)。

### Performance
- 旧式負荷スコア: `1.5〜2/10`。Performance Budget Score: Low。
  毎フレームではなく0.5秒ごと・1発・二乗比較・軌跡判定なし。

### Code touched
- `src/types/game.ts`, `src/store/gameStore.ts`, `src/hooks/useGameLoop.ts`,
  `src/pixi/pixiScene.ts`, `src/utils/upgradeUtils.ts`,
  `src/components/MainMenu.tsx`, `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint` / `npm run build`
- OK: 実機(ブラウザ)— レベルアップ候補に「デコイ」出現、ループ駆動で投擲→
  約81px移動→着地停止、CD約10秒設定を確認。迎撃ロジック(ループと同一処理を
  実行)で最近接の敵弾のみ削除・遠い敵弾/範囲外/味方弾は無傷・レーザー生成を
  確認。円盤装置の見た目をスクリーンショットで確認。
- 注: プレビュータブ非表示時はrAFが1fpsに絞られ0.5秒パルスを実時間で待てない
  ため、迎撃は同一ロジックの直接実行で検証(パルス周期は他サブウェポンと同じ
  gameTime方式)。実機では通常どおり0.5秒ごとに作動する。

## 2026-06-11 - v0.25.184 - Katana dash landing recovery (0.2s, all katana) (Claude Code)

### Summary
- ユーザー指摘: 村雨は一閃を連打できてしまう。着地までは発動しない(現状OK)
  ので、着地後0.2秒の「動けない」硬直(後隙)を作る。刀・村雨共通。
- 実装:
  - `Player.katanaRecoveryUntil` を追加。一閃発動時に
    `katanaDashUntil + KATANA_DASH_RECOVERY_MS(=200ms)` を設定。
  - `movePlayer`: 着地後〜硬直中は移動入力を無視してその場停止(moveSpeed=0)。
  - `triggerKatanaDash`: 硬直中は新しい一閃を発動不可
    (`now < katanaRecoveryUntil` で弾く)。村雨はクールダウン無しのままだが、
    硬直0.2sぶん連打間隔が空く。刀はさらに従来クールダウンも適用。

### Performance
- Performance Budget Score impact: `+0`。

### Code touched
- `src/types/game.ts`, `src/store/gameStore.ts`, `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint` / `npm run build`
- OK: 実機(ブラウザ)状態計測 —
  - 着地後の硬直中: 移動入力しても動かない(移動0)、一閃も発動不可。
  - 硬直明け(着地180ms+硬直200ms後): 移動可・一閃再発動可(村雨は無CDなので
    硬直明け即発動)を確認。

## 2026-06-11 - v0.25.183 - Katana polish + Murasame (Lv3 upgrade, no cooldowns, silver) (Claude Code)

### Summary
- ロールバックアンカー: branch `backup/pre-murasame-2026-06-11` / tag `pre-murasame-v0.25.182`。
- ユーザー指摘の細かい修正:
  - 「斬」の縁取り(stroke)を無くした(serif コールアウトは縁取りなしに分岐)。
  - 一閃で松明(破壊可能オブジェクト)も壊せるようにした。ダッシュ経路の
    corridor に入った prop を移動完了後に高ダメージで破壊し、既存の破壊演出
    +ドロップを出す。
  - 一閃の効果音を大きく。専用 SFX キー `katana-dash`(slash.mp3 をフル
    レングス・音量1.0)を追加し、フリック/二連打の一閃で鳴らす(従来は
    クリップした `melee` 0.74)。
- 新サブウェポン「村雨(むらさめ)」:
  - 刀が Lv3 になったらレベルアップ選択に出現(刀カードの代わり)。
  - 弾の打ち返し(カウンター)と一閃ダッシュのクールダウンが無く連発可能。
    ただし発動中(ダッシュ移動中)は新しい一閃を出せない=モーション
    キャンセル不可。
  - 刀身がシルバー(`katanaShape` に variant を追加。背面スプライトと HUD
    アイコンがシルバーになる)。それ以外の仕様は刀と同一(オート斬撃・一閃
    3倍・クリ→スタン・斬・銃/ナイフ無効など)。ステータスは刀Lv3基準。
  - 実装: `isKatanaMode = 刀 or 村雨` ヘルパーで各所の刀判定を統一。村雨所持
    時は dash/counter のクールダウンを 0 にし、counter 連発を許可。

### Performance
- Performance Budget Score impact: `+0`〜`+1`(prop corridor 判定と SFX 追加のみ)。

### Code touched
- `src/types/game.ts`, `src/store/gameStore.ts`, `src/hooks/useGameLoop.ts`,
  `src/hooks/useGameControls.ts`, `src/components/VirtualJoystick.tsx`,
  `src/components/GameHUD.tsx`, `src/utils/upgradeUtils.ts`,
  `src/utils/katanaShape.ts`, `src/pixi/pixiScene.ts`,
  `src/audio/audioManager.ts`, `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint` / `npm run build`
- OK: 実機(ブラウザ)状態計測 —
  - 刀Lv3でレベルアップ候補に「村雨」出現、習得後は再出現しない。
  - 村雨の一閃: 移動中は発動不可(モーションキャンセル防止)、移動後はCD無しで
    即連発可。村雨のカウンター: 連続で窓が即再オープン(無CD)。
  - 一閃で松明破壊を確認。村雨の鞘色 `0xc4ccd6`(シルバー)/刀 `0xb91c1c`(赤)。
  - 背面の村雨がシルバー、HUDが「村雨」+シルバーアイコンをスクリーンショットで確認。
  - 「斬」serif=true 経路(縁取りなし)。一閃SFXは `katana-dash` キーへ差し替え。

## 2026-06-11 - v0.25.182 - Katana zan callout: bigger red mincho + screen darken, no Kill! (Claude Code)

### Summary
- ユーザー指摘4点(一閃の近接フィニッシュ演出):
  - 「斬」をもっと大きく: callout scale `1.9 → 3.6`。
  - 同時に出ていた「Kill!」をやめる: `grantMeleeKillRewards` に
    `suppressKillCallout` を追加し、刀の `performKatanaStrike` から true を渡す
    (オート斬撃はそもそもフィニッシュしないので影響なし)。既存カウンターの
    Kill! は従来どおり。
  - 「斬」表示時だけ画面暗転: 一閃フィニッシュ時に黒の全画面フラッシュ
    `rgba(0,0,0,0.6)`(420ms、flashは通常ブレンドなので暗転になる)。刀の
    フィニッシュからは従来の黄色フラッシュを外した。
  - 「斬」を明朝(serif)・赤に: `VisualEffect.damageNumber` に `serif?` を追加、
    `spawnCallout` に `{ scale, serif }` opts を追加。レンダラーは serif 時に
    和文セリフフォントスタック(Hiragino Mincho ProN / Yu Mincho / MS Mincho /
    Noto Serif JP / serif)を使う。色は赤 `#ef4444`。

### Performance
- Performance Budget Score impact: `+0`(既存の callout / flash 経路を流用)。

### Code touched
- `src/types/game.ts`, `src/store/gameStore.ts`, `src/pixi/pixiScene.ts`,
  `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint` / `npm run build`
- OK: 実機(ブラウザ)状態計測 — 一閃フィニッシュ時に 斬(text='斬',
  color='#ef4444', scale 3.6, serif=true)+ 暗転flash(rgba(0,0,0,0.6))が生成、
  Kill! コールアウトは出ない、敵フィニッシュ成功を確認。視覚フレームの撮影は
  プレビューのタイミング都合で安定せず、見た目の最終確認は実機にて。

## 2026-06-11 - v0.25.181 - Katana zan callout at trajectory midpoint (Claude Code)

### Summary
- ユーザー指摘: 「斬」が移動後のプレイヤー位置に出ていた。仕様どおり、ダッシュ
  軌道(始点→終点)の真ん中に出すよう修正。位置は発動時に確定(`pcx + ux *
  KATANA_DASH_DISTANCE/2`)し、移動完了後のフィニッシュ時にそこへ1つ表示する。

### Code touched
- `src/store/gameStore.ts`, `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint` / `npm run build`
- OK: 実機(ブラウザ)確認 — 始点 x14 / 軌道中点 x78 に「斬」表示、移動後の
  プレイヤー位置 x156 とは別であることを状態計測で確認。

## 2026-06-11 - v0.25.180 - Katana smaller back sprite + dash moves before finisher (Claude Code)

### Summary
- ユーザー指摘2点:
  - 「刀の位置はOK。大きさだけ小さく」: 背負い刀を中心(胸あたり)固定のまま
    `KATANA_BACK_SCALE = 0.72` で縮小。形・幅・角度・位置は据え置き。
  - 「近接フィニッシュすると移動しない。移動したあと斬にして」: 原因は、一閃が
    開始時に即ダメージ+フィニッシュを適用し、フィニッシュのヒットストップ
    (全シム停止300ms)がダッシュ移動ウィンドウ(180ms)を食い潰して
    プレイヤーが動かなかったこと。修正として、ダッシュは先に移動だけ走らせ、
    `KATANA_DASH_MS` 後に斬撃・フィニッシュ・ヒットストップを適用する。
    「斬」コールアウトは移動後のプレイヤー位置に1つだけ表示。

### Performance
- Performance Budget Score impact: `+0`。

### Code touched
- `src/store/gameStore.ts`, `src/pixi/pixiScene.ts`,
  `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint` / `npm run build`
- OK: 実機(ブラウザ)確認 —
  - 一閃: 発動直後は敵生存・斬なし・ヒットストップなし(移動可能)、約180ms後に
    119px移動してから敵フィニッシュ+「斬」表示、を状態計測で確認。
  - 背負い刀が0.72倍に縮小し位置・角度据え置きをスクリーンショットで確認。

## 2026-06-11 - v0.25.179 - Katana crit stun + diagonal back sprite (Claude Code)

### Summary
- ユーザー指摘2点:
  - 「クリが近接武器扱いで発生しない/分からない」: 原因は、刀のクリが既存近接
    (カウンター)と同じく「金色の数字だけ」で、銃クリのような分かりやすい
    フィードバックが無かったこと。刀は銃の代替なので、銃クリと同じ挙動に揃えた。
    倒しきれなかったクリは敵をスタン(`STUN_DURATION_MS`)させ、黄色いリングを
    出す。スタンした敵は一閃の近接フィニッシュで処刑できる(オート斬撃→クリ
    スタン→一閃フィニッシュの連携)。クリ率自体は前版で `player.critChance`
    加算済み。
  - 「刀をもっと斜めに。デザイン・幅は変えず、単純に回転だけ」: `katanaShape`
    の形状と幅(0.6)は v0.25.177 のまま据え置き、背面描画とHUDアイコンを
    同じ角度 `32°` で回転させた(背面は各ドット中心を中心まわりに回転、HUDは
    SVG `rotate` transform)。

### Performance
- Performance Budget Score impact: `+0`(回転は座標計算のみ、描画数同じ)。

### Code touched
- `src/store/gameStore.ts`, `src/utils/katanaShape.ts`,
  `src/pixi/pixiScene.ts`, `src/components/GameHUD.tsx`,
  `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint` / `npm run build`
- OK: 実機(ブラウザ)確認 — クリで敵がスタン(5000ms)+黄リング、HUDの刀
  アイコンが32°回転して表示(`rotate(32 …)`)、背面の背負い刀が斜めに提げた
  見た目になることをスクリーンショットで確認。
- 注: プレビューで刀装備が反映されない事象は、開発中のHMRでevalのstoreが
  二重化していたテスト手法の問題。dev server再起動後の素の状態では装備・HUD
  反映とも正常に確認できた(実アプリ・実機には影響なし)。

## 2026-06-11 - v0.25.177 - Katana visual/crit refinements (Claude Code)

### Summary
- ユーザー確定の調整4点:
  - クリ率にプレイヤーのレベルアップ加算(`player.critChance`)を合算する。
    刀のクリ = レベル別基礎(10/20/30%) + レベルアップクリ率アップ +
    トラップ拘束ボーナス。以前は基礎のみで「クリが出ない」ように見えていた
    (元の近接処理も player.critChance を加算していなかったため)。
  - 射程を全体的に少し狭く。`KATANA_RANGE_BY_LEVEL` 89/107/128 → 76/92/110
    (係数0.86)。一閃も距離150→128、当たり半幅30→26。
  - 背負い刀のデザイン刷新: 赤い鞘(鞘・鍔・柄)・少し反り・もう少し長く。
    新規 `src/utils/katanaShape.ts` に正規化ドット配置を定義し、背面(Pixi
    Graphics)とHUDアイコン(SVG)が同一形状を共有する。背負い刀らしく斜めに
    配置し、柄が肩越し・鞘先が反対の腰下に出るようにした。
  - HUD下部の近接スロットを、絵文字ではなく背負い刀と同じ形状のSVGアイコンで
    表示(「背負っている刀のデザインをそのまま縮小」)。

### Performance
- Old load score: `1/10`。背負い刀は約38 rect/フレーム(プレイヤー1体のみ)、
  HUDアイコンはSVG静的描画。Performance Budget Score impact: `+0` to `+1`。

### Code touched
- `src/store/gameStore.ts`, `src/hooks/useGameLoop.ts`,
  `src/pixi/pixiScene.ts`, `src/components/GameHUD.tsx`,
  `src/utils/katanaShape.ts` (新規), `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint` / `npm run build`
- OK: ブラウザ実機確認 — クリ発火(レベルアップ加算込みでcrit gold number、
  基礎Lv1≈8%)、射程テーブル76/92/110・ダッシュ128/26、HUDの刀アイコン
  (38 rect, 背負い刀と同形状)、背面の背負い刀が斜めに表示されることを
  スクリーンショットで確認。

## 2026-06-11 - v0.25.176 - Katana tuning: level ranges, crit table, visuals (Claude Code)

### Summary
- ユーザー確定仕様を反映 (刀の調整7点):
  - 射程をレベル制に変更: `KATANA_RANGE_BY_LEVEL = [_, 89, 107, 128]`
    (Lv1 = 通常ナイフ74の1.2倍、以降レベルごとに1.2倍)。固定の
    ハンティングLv3相当(108)は廃止。
  - クリ率をレベル制に変更(確定値): Lv1 10% / Lv2 20% / Lv3 30%。
  - 刀装備中はレベルアップに他のサブウェポンカードを出さない
    (`generateUpgradeOptions` でガード。刀自身の強化カードは出る)。
  - 通常斬撃(オート)のエフェクトを2倍サイズに(`spawnSlash` に
    `lengthScale` 追加。一閃のヒット斬撃は等倍のまま)。
  - 一閃で近接フィニッシュ成立時、「斬」を軌道の真ん中に1つ表示
    (複数巻き込んでも1ダッシュ1つ)。
  - 刀所持中、キャラ中央付近・背面(スプライト下レイヤー)に背負い刀の
    ドット絵を表示。専用テクスチャなし、Graphicsドット描画(~15 rect)。
    プレイヤーの向きで左右反転。
  - HUD下部の近接スロット表示を刀所持中は `🗡️ 刀` に変更。
- Verification note: ブラウザ自動テストで直接ストライク検証
  (オート斬撃エフェクト長55=2倍、ダッシュ31=等倍、ダメージ10+30=40、
  「斬」コールアウト表示、レベルアップカードが刀+パッシブのみ、射程テーブル
  89/107/128、HUD刀表示)。ゲームループ経由のオート斬撃はテストタブが
  hidden になり rAF 停止で実測不可(ループ側変更は射程変数の置換のみ)。
  実機プレイでの目視確認を次の確認事項とする。

### Performance
- Old load score: `1/10`。背負い刀は毎フレーム~15 rectのGraphics描画
  (レア敵オーナメントと同等)、斬撃2倍は既存エフェクトのサイズ変更のみ。
- Performance Budget Score impact: `+0` to `+1`。

### Code touched
- `src/store/gameStore.ts`
- `src/hooks/useGameLoop.ts`
- `src/utils/upgradeUtils.ts`
- `src/components/GameHUD.tsx`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint` / `npm run build`
- OK: 直接ストライクのブラウザ検証(上記)
- Not yet: 実機での背負い刀・2倍斬撃・「斬」表示の見た目確認

## 2026-06-11 - v0.25.175 - Restrict katana finishers to dash and gate other sub-weapons (Claude Code)

### Summary
- ユーザー仕様修正3点を反映 (v0.25.174 の刀実装への追補):
  - 近接フィニッシュは一閃ダッシュのみ。オート斬撃はスタン敵にも通常ダメージ
    だけ与え、スタンを消さない(一閃で仕留める導線を残す)。ボスのスタン5×
    ルールも一閃のみ。`performKatanaStrike` に `allowFinisher` フラグを追加。
  - カウンターも一閃クールダウンに依存。ダッシュ時に `counterCooldownEnd` も
    同じ終了時刻まで延ばし、CD中は指離し/Spaceでカウンター窓が開かない。
  - 刀装備中は他のサブウェポン(手榴弾/トラップ/クイックマガジン/ハンティング
    /ドッグ)を発動させない。`KATANA_ALLOWED_SUBWEAPONS`(現状空)による
    許可制で、将来の併用解禁は配列にキーを足すだけ。
- オート斬撃はスタン敵をノックバックさせない(位置を保って一閃で処刑可能)。
- 取得経路(カード/商人/スタート画面ショップ)は変更なし。装備中も他サブ
  ウェポンのカード取得自体は可能(発動だけ停止)。

### Performance
- Old load score: `1/10`。判定追加のみで描画コスト増なし。
- Performance Budget Score impact: `0`(むしろ他サブウェポン停止分わずかに減)。

### Verification
- OK: `npm run lint` / `npm run build`
- OK: ブラウザ実動作確認 — スタンダミーがオート斬撃で30ダメージ(3斬撃)を
  受けつつ生存・スタン維持、一閃で即時フィニッシュ、ダッシュ直後の
  triggerCounter が窓を開かない(CD残875ms)、手榴弾/ドッグ所持でも発動0。

### Code touched
- `src/store/gameStore.ts`
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

## 2026-06-11 - v0.25.174 - Add katana sub-weapon with auto-slash and dash (Claude Code)

### Summary
- Added a rollback anchor before this change:
  - Branch: `backup/pre-katana-subweapon-2026-06-11`
  - Tag: `pre-katana-subweapon-v0.25.173`
- First Claude-side-PC implementation after the 2026-06-11 hybrid handoff
  (Windows clone of the GitHub branch; Node v24.16.0 / npm ci fresh setup).
- Added a new common sub-weapon 刀 (`SubWeaponKey 'katana'`):
  - While owned, guns hold their auto-fire and the release/Space knife sweep
    is disabled. Ammo/reload processing keeps running with no side effects.
  - The counter window still opens on release/Space, so the existing bullet
    reflection (counter) works unchanged. The counter blade/ring effect now
    shows only when a reflect actually succeeds (katana mode suppresses the
    every-release telegraph).
  - Auto-slash: targets like the gun auto-fire (nearest non-stunned enemy
    first, stunned fallback) within a fixed Hunting-Lv3-equivalent radius
    (`KATANA_RANGE = 74 + 34`), one cut per `KATANA_SLASH_INTERVAL_MS`.
    Stunned normal enemies take the existing melee finisher (instant execute,
    same rewards/演出); stunned bosses take the existing 5× rule.
  - Melee kill rewards (XP/currency/ammo scavenge/crates/finisher juice) were
    extracted from `triggerCounter` into a shared `grantMeleeKillRewards`
    helper so katana kills behave exactly like knife kills.
  - 一閃ダッシュ: mobile flick on the virtual joystick layer, PC same-direction
    double-tap (WASD and arrows). Player is invulnerable during the dash
    (reuses the existing INVULN_MS auto-clear), travels
    `KATANA_DASH_DISTANCE` over `KATANA_DASH_MS`, and cuts every enemy along
    the path corridor at 3× auto-slash damage with crit applied last
    (matching the existing melee damage order). Finisher hitstop/flash/slow
    fires once per dash even when multiple enemies are executed.
  - Dash cooldown reuses the melee counter cooldown length
    (`COUNTER_WINDOW + COUNTER_COOLDOWN`) and shows the same faint cooldown
    circle at katana range. During cooldown, movement and auto-slash continue
    and flick/double-tap inputs fall through to normal movement.
  - Counter priority: on release the existing counter path runs first, then
    the flick check. Normal joystick drags stay below the flick thresholds.
- Acquisition/upgrade:
  - Level-up card `刀` (all classes; Lv1-3 through the existing
    `applySubWeaponCard` flow).
  - Merchant skill card via the existing unlocked-stock flow
    (`SHOP_KATANA_COST`).
  - Start-screen skill shop lists `katana` as a merchant-stock unlock entry
    (no starting ownership, consistent with v0.25.169).
- TODO(刀) placeholders (clearly marked in code): damage by level, slash
  interval, crit chance, dash distance/time/width, flick thresholds,
  double-tap window, shop cost. Lv1-3 currently differs only by the damage
  table; detailed balancing is deferred per instruction.

### Performance
- Old load score: `3/10` (simulation + rendering).
- Performance Budget Score impact: `+2` to `+5` while katana is active.
  - Periodic single-target search (interval-gated, squared-distance, no per-
    frame full scans) plus short-lived slash/trail effects only; no constant
    glow, no new filters/layers.
- Current normal-play estimate before change: `44-94`.
- Expected after: roughly `46-99` in torch/crate-heavy moments with katana.
- Fallback: lengthen `KATANA_SLASH_INTERVAL_MS`, trim dash trail/slash
  effects, or skip target search while no enemies are near.

### Code touched
- `src/types/game.ts`
- `src/store/gameStore.ts`
- `src/hooks/useGameLoop.ts`
- `src/hooks/useGameControls.ts`
- `src/components/VirtualJoystick.tsx`
- `src/components/ShopMenu.tsx`
- `src/components/MainMenu.tsx`
- `src/utils/upgradeUtils.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json` (version only)

### Verification
- OK: `npm run lint`
- OK: `npm run build`
- Not yet: on-device feel check for flick / double-tap thresholds and slash
  cadence (all tunable constants, see TODO(刀)).

## 2026-06-11 - v0.25.173 - Widen dog fetch collection range (Codex)

### Summary
- Added a rollback anchor before this change:
  - Branch: `backup/pre-dog-range-widen-2026-06-11`
  - Tag: `pre-dog-range-widen-v0.25.172`
- Widened dog skill pickup behavior:
  - search distance by level: `190/230/270 -> 240/310/380`
  - collection radius at reached item by level: `34/42/50 -> 48/64/80`
- The dog still appears only during fetch actions and does not stay beside the
  player.

### Performance
- Old load score: `1/10`.
- Performance Budget Score impact: `+0` to `+1`.
- Expected normal-play estimate is roughly `44-94`.
- Visual risk: low to medium. Lv2/Lv3 dog may feel noticeably more generous.

### Verification
- `npm run lint`
- `npm run build`

## 2026-06-11 - v0.25.172 - Add free test strap start option (Codex)

### Summary
- Added a rollback anchor before this change:
  - Branch: `backup/pre-test-strap-start-2026-06-11`
  - Tag: `pre-test-strap-start-v0.25.171`
- Added a free temporary test item to the start-screen skill shop:
  - `1000ストラップ開始`
  - toggles ON/OFF from the start menu
  - when ON, the next run starts with `1000` straps
  - when OFF, runs still start with `0` straps
- This is a local testing aid and does not affect merchant prices.

### Performance
- Old load score: `0/10`.
- Performance Budget Score impact: `0`.
- Expected normal-play estimate remains roughly `44-93`.
- Visual risk: low. This only adds a temporary start-menu toggle.

### Verification
- `npm run lint`
- `npm run build`

## 2026-06-11 - v0.25.171 - Restore dog fetch collection behavior (Codex)

### Summary
- Added a rollback anchor before this change:
  - Branch: `backup/pre-dog-range-collect-fix-2026-06-11`
  - Tag: `pre-dog-range-collect-fix-v0.25.170`
- Restored dog skill behavior as an active fetch action:
  - dog selects a nearby pickup target
  - a temporary dog-fetch sprite runs from the player toward that item
  - when the dog reaches the item, it collects nearby pickups in a small radius
  - the fetch then finishes and repeats after a short cooldown
- Skill level now widens both:
  - the distance the dog can search for a pickup
  - the collection radius around the reached item
- The dog is not a persistent companion beside the player; it only appears
  during fetch actions.

### Performance
- Old load score: `1/10`.
- Performance Budget Score impact: `+0` to `+1`.
- Expected normal-play estimate is roughly `44-93`.
- Visual risk: low to medium. Dog fetch timing and level-based range may need
  feel tuning on device.

### Verification
- `npm run lint`
- `npm run build`

## 2026-06-11 - v0.25.170 - Remove persistent dog companion sprite (Codex)

### Summary
- Added a rollback anchor before this change:
  - Branch: `backup/pre-remove-dog-companion-2026-06-11`
  - Tag: `pre-remove-dog-companion-v0.25.169`
- Removed the persistent dog companion sprite that followed the player.
- Dog remains a skill/effect behavior, not a character displayed beside the
  player.
- The v0.25.169 skill-shop merchant unlock flow and wider strap scatter remain.

### Performance
- Old load score: `-1/10` from removing the extra companion sprite.
- Performance Budget Score impact: `-1`.
- Expected normal-play estimate: roughly `44-92`.
- Visual risk: low. This only removes the unintended visible dog companion.

### Verification
- `npm run lint`
- `npm run build`

## 2026-06-11 - v0.25.169 - Unlock skill cards for merchant and show dog companion (Codex)

### Summary
- Added a rollback anchor before this change:
  - Branch: `backup/pre-shop-unlock-dog-scatter-2026-06-11`
  - Tag: `pre-shop-unlock-dog-scatter-v0.25.168`
- Changed the temporary start skill shop from "starting skill ownership" to
  "merchant stock unlock":
  - start-screen skill purchases still cost `0G`
  - starting a run no longer grants those skills automatically
  - the weapon merchant only lists unlocked skill cards
  - buying an unlocked merchant skill card applies it immediately in-run
- Added a lightweight visible dog companion:
  - appears when the player actually has the dog skill
  - uses one sprite plus a small shadow, with no glow/filter
  - follows slightly behind the player
- Increased normal pickup scatter radius from `32` to `42`.
- Weapon-crate strap drops now use a wider `92` scatter radius so they land
  farther from the opened crate and are less likely to be picked up instantly.

### Performance
- Old load score: `2/10`.
- Performance Budget Score impact: `+1` to `+4`.
- Expected normal-play estimate: roughly `45-93`.
- Visual risk: medium. Dog placement and wider strap scatter may need feel
  tuning after device play.

### Verification
- `npm run lint`
- `npm run build`

## 2026-06-11 - v0.25.168 - Add temporary start skill shop (Codex)

### Summary
- Added a simple temporary skill shop entry below character select.
- All skill cards are currently free (`0G`) and can be bought up to Lv3:
  - 手榴弾
  - トラップ
  - ハンティング
  - クイックマガジン
  - ドッグ
- Added `preRunSkillCards` to the store for start-screen purchases.
- `resetGame` now applies purchased start-screen skill cards as initial
  sub-weapons / sub-weapon levels when the run begins.
- This is intentionally placeholder UI; design and final shop structure can be
  replaced later.

### Performance
- Old load score: `1/10`.
- Performance Budget Score impact: `0`.
- Expected normal-play estimate remains roughly `44-89`.
- Visual risk: low to medium. The temporary panel adds height to the start menu
  and may need later layout polish.

### Verification
- `npm run lint`
- `npm run build`

## 2026-06-11 - v0.25.167 - Route shop skills through skill cards (Codex)

### Summary
- Added a rollback anchor before this change:
  - Branch: `backup/pre-shop-skill-card-2026-06-11`
  - Tag: `pre-shop-skill-card-v0.25.166`
- Split the code meaning of skill acquisition:
  - `learnSubWeapon` remains the direct "learn the skill" route
  - level-up sub-weapon choices and merchant skill purchases now share the
    same `applySubWeaponCard` helper
- Merchant skill purchases still apply immediately, but they now behave as
  "skill card acquired" rather than direct hand-written level mutation.
- Ammo, medkit, and vaccine shop items remain immediately applied.

### Performance
- Old load score: `1/10`.
- Performance Budget Score impact: `0`.
- Expected normal-play estimate remains roughly `44-89`.
- Visual risk: low. This is state-flow cleanup, not a visual change.

### Verification
- `npm run lint`
- `npm run build`

## 2026-06-11 - v0.25.166 - Space torch generation at 30 percent (Codex)

### Summary
- Added a rollback anchor before this change:
  - Branch: `backup/pre-torch-density-spacing-2026-06-11`
  - Tag: `pre-torch-density-spacing-v0.25.165`
- Changed torch generation to feel more spaced while using a 30% fixed cell chance:
  - `TORCH_CELL`: `360 -> 460`
  - per-cell torch chance: `22% -> 30%`
- Torch generation is deterministic by world-grid cell. It is not a timed
  random spawn while walking; moving into a new area reveals cells that already
  pass or fail their hash-based placement check. Destroyed torches stay removed.

### Performance
- Old load score: `1/10`.
- Performance Budget Score impact: `+0` to `+2`.
- Current normal-play estimate before change: `44-87`.
- Expected normal-play estimate after change: roughly `44-89`.
- Visual risk: low to medium. Wider cells should reduce clustering, but if a
  mobile viewport still shows more than two torches, raise `TORCH_CELL` again.

### Verification
- `npm run lint`
- `npm run build`

## 2026-06-11 - v0.25.165 - Add gold straps and crate scatter loot (Codex)

### Summary
- Added a rollback anchor before this change:
  - Branch: `backup/pre-strap-gold-crate-drops-2026-06-11`
  - Tag: `pre-strap-gold-crate-drops-v0.25.164`
- Tuned torch coin drops:
  - torch strap value is now randomized from `5-20`
  - default scatter radius increased from `22` to `32`
- Added gold strap compression:
  - a gold strap is `value: 10`
  - gold straps appear only when total dropped value exceeds `20`
  - examples: `21 -> 1 gold + 11 normal`, `31 -> 2 gold + 11 normal`
  - normal strap count stays at `20` or below
- Added weapon-crate scatter loot:
  - opening a weapon crate still grants the weapon
  - it also scatters `30-50` strap value around the crate using gold compression
- Slightly increased torch field density:
  - per-cell torch chance changed from `18%` to `22%`

### Performance
- Old load score: `2/10`.
- Performance Budget Score impact: additional `+2` to `+8` in crate/torch-heavy moments.
- Current normal-play estimate before change: `42-79`.
- Expected normal-play estimate after change: roughly `44-87`.
- Visual risk: medium. Crate openings should feel rewarding, but torch density
  and crate scatter may need tuning on mobile if pickup clutter feels high.

### Verification
- `npm run lint`
- `npm run build`

## 2026-06-11 - v0.25.164 - Torch coin drops and dog range collect (Codex)

### Summary
- Added a rollback anchor before this change:
  - Branch: `backup/pre-torch-coin-drops-2026-06-11`
  - Tag: `pre-torch-coin-drops-v0.25.163`
- Changed torch destruction loot:
  - torches now default-drop `10-14` one-scrap strap pickups
  - torches can additionally drop ammo, health, bomb, or magnet by chance
  - torches no longer drop treasure or weapon drops
- Added default narrow scatter motion to non-world-drop pickups:
  - pickups without an explicit throw now slide/pop out over `360ms`
  - existing thrown quick-magazine behavior is preserved
  - world-drop supplies keep their fixed offscreen placement
- Changed dog ability from screen-wide fetch to narrow area collection:
  - dog now collects nearby landed pickups in a small radius
  - Lv1/Lv2/Lv3 radius is `34/42/50`
  - feedback is a subtle local ring and capped small bursts
- Enemies no longer drop scrap/strap currency. Rare enemy treasure chance is
  unchanged.
- Added a pickup cap safeguard for scattered straps, keeping nearest straps
  when the field exceeds the pickup guardrail.

### Performance
- Old load score: `2/10`.
- Performance Budget Score impact: `+2` to `+6` in torch-heavy moments.
- Current normal-play estimate before change: `40-73`.
- Expected normal-play estimate after change: roughly `42-79`.
- Visual risk: medium. Torch breaks should feel richer, but the coin count and
  scatter radius may need tuning if the screen looks too busy.

### Verification
- `npm run lint`
- `npm run build`

## 2026-06-11 - v0.25.163 - Speed up foreground forest parallax (Codex)

### Summary
- Added a rollback anchor before this change:
  - Branch: `backup/pre-front-forest-parallax-speed-2026-06-11`
  - Tag: `pre-front-forest-parallax-speed-v0.25.162`
- Increased foreground forest horizontal parallax speed:
  - `FRONT_FOREST_PARALLAX_X`: `0.52 -> 0.68`
- No new sprites, filters, layers, or draw calls.

### Performance
- Old load score: `1/10`.
- Performance Budget Score impact: `0`.
- Current normal-play estimate before change: `40-73`.
- Expected normal-play estimate after change: roughly `40-73`.
- Visual risk: low to medium. If the foreground forest feels too screen-attached
  or too fast while moving, tune the constant downward.

### Verification
- `npm run lint`
- `npm run build`

## 2026-06-11 - v0.25.162 - Grade near-ground blur strength (Codex)

### Summary
- Added a rollback anchor before this change:
  - Branch: `backup/pre-near-ground-blur-gradient-2026-06-11`
  - Tag: `pre-near-ground-blur-gradient-v0.25.161`
- Split the lower ground blur into three strength bands instead of one strong
  blur across the whole lower region:
  - `NEAR_GROUND_BLUR_STRIP_RATIO`: `0.32 -> 0.34`
  - `NEAR_GROUND_BLUR_STRENGTHS = [0.8, 1.45, 2.05]`
- This keeps the actual lower `groundStrips` blur approach from `v0.25.161`,
  but makes the blur increase stepwise toward the bottom.

### Performance
- Old load score: `2/10`.
- Performance Budget Score impact: `+1` to `+3` versus `v0.25.161`.
- Current normal-play estimate before change: `39-70`.
- Expected normal-play estimate after change: roughly `40-73`.
- Visual risk: medium. The hard blur jump should soften, but the three blur
  bands may still need ratio/strength tuning if the banding is visible.

### Verification
- `npm run lint`
- `npm run build`

## 2026-06-11 - v0.25.161 - Blur actual near ground strips (Codex)

### Summary
- Added rollback anchors before this change:
  - Branch: `backup/pre-near-ground-strip-blur-2026-06-11`
  - Tag: `pre-near-ground-strip-blur-v0.25.160`
- Replaced the previous near-ground copy overlay approach with actual lower
  ground strip blur:
  - bottom `32%` of existing `groundStrips` are re-parented into
    `nearGroundBlurLayer`
  - `nearGroundBlurLayer` gets one `BlurFilter`
  - no duplicated ground texture layer, no overlay alpha, and no mask copy
- This keeps actors, event characters, pickups, front forest, and HUD outside
  the ground blur. Only the lower ground strips blur.

### Performance
- Old load score: `2/10`.
- Performance Budget Score impact: `+1` to `+4` versus `v0.25.159`.
- Current normal-play estimate before change: `38-66`.
- Expected normal-play estimate after change: roughly `39-70`.
- Visual risk: medium. The blur should now affect the real ground rather than a
  copied overlay, but the seam between normal and blurred strips may need
  tuning by changing `NEAR_GROUND_BLUR_STRIP_RATIO` or blur strength.

### Verification
- `npm run lint`
- `npm run build`

## 2026-06-11 - v0.25.160 - Add visible near-ground blur overlay (Codex)

### Summary
- Added a rollback anchor before this change:
  - Branch: `backup/pre-near-ground-blur-overlay-2026-06-11`
  - Tag: `pre-near-ground-blur-overlay-v0.25.159`
- Added a screen-bottom ground blur overlay so the ground itself visibly softens
  near the foreground:
  - `NEAR_GROUND_BLUR_HEIGHT_RATIO = 0.38`
  - `NEAR_GROUND_BLUR_MIN_HEIGHT = 170`
  - `NEAR_GROUND_BLUR_MAX_HEIGHT = 310`
  - `NEAR_GROUND_BLUR_STRENGTH = 3.2`
  - `NEAR_GROUND_BLUR_ALPHA = 0.48`
- The overlay reuses the ground texture as a single `TilingSprite`, follows
  camera movement, and fades in vertically through a mask.
- This does not reintroduce full-ground blur; only the lower foreground band
  gets the extra softened layer.

### Performance
- Old load score: `2/10`.
- Performance Budget Score impact: `+2` to `+5`.
- Current normal-play estimate before change: `38-66`.
- Expected normal-play estimate after change: roughly `40-71`.
- Visual risk: medium. The blur should now be visible on the ground, but if it
  feels too milky or too detached from the perspective floor, lower alpha or
  height before changing the global DOF.

### Verification
- `npm run lint`
- `npm run build`

## 2026-06-11 - v0.25.159 - Preserve foreground forest opacity in blur mask (Codex)

### Summary
- Added a rollback anchor before this change:
  - Branch: `backup/pre-front-forest-mask-opacity-2026-06-11`
  - Tag: `pre-front-forest-mask-opacity-v0.25.158`
- Adjusted the foreground forest blur mask so the forest no longer fades from
  fully transparent at the top:
  - added `FRONT_FOREST_FADE_TOP_ALPHA = 0.58`
  - added `FRONT_FOREST_FADE_MID_ALPHA = 0.82`
- Kept the widened fade range from `v0.25.158`:
  - `FRONT_FOREST_FADE_IN_RATIO = 0.52`

### Performance
- Old load score: `1/10`.
- Performance Budget Score impact: `0`.
- Current normal-play estimate before change: `38-66`.
- Expected normal-play estimate after change: roughly `38-66`.
- Visual risk: low. The foreground forest should retain more presence while
  the lower foreground still reads as softened.

### Verification
- `npm run lint`
- `npm run build`

## 2026-06-11 - v0.25.158 - Widen foreground blur fade range (Codex)

### Summary
- Added a rollback anchor before this change:
  - Branch: `backup/pre-front-forest-fade-range-2026-06-11`
  - Tag: `pre-front-forest-fade-range-v0.25.157`
- Widened the vertical fade range for the foreground forest blur mask:
  - `FRONT_FOREST_FADE_IN_RATIO`: `0.34 -> 0.52`
- This keeps the same foreground blur filter and mask mechanism, but makes the
  blur overlap feel more gradual across the foreground ground area.

### Performance
- Old load score: `1/10`.
- Performance Budget Score impact: `0`.
- Current normal-play estimate before change: `38-66`.
- Expected normal-play estimate after change: roughly `38-66`.
- Visual risk: low to medium. The foreground blur should enter more gradually,
  but if it hides too much of the lower screen, reduce the ratio.

### Verification
- `npm run lint`
- `npm run build`

## 2026-06-11 - v0.25.157 - Pulse light shafts and fade foreground blur (Codex)

### Summary
- Added a rollback anchor before this change:
  - Branch: `backup/pre-light-pulse-front-blur-2026-06-11`
  - Tag: `pre-light-pulse-front-blur-v0.25.156`
- Removed the full-ground blur added in `v0.25.156`:
  - deleted `GROUND_BASE_BLUR`
  - removed the `groundBase` blur filter setup and destroy path
- Kept foreground forest blur, but constrained its visible range with a vertical
  fade mask:
  - `FRONT_FOREST_BLUR = 2.2`
  - `FRONT_FOREST_FADE_IN_RATIO = 0.34`
  - top of the front forest is transparent, then fades in toward the bottom
- Added a very subtle environmental light shaft pulse:
  - `STAGE_LIGHT_SHAFT_PULSE_MS = 5200`
  - `STAGE_LIGHT_SHAFT_PULSE_AMOUNT = 0.08`
  - no new sprites, filters, or light layers; only the existing shaft graphics'
    alpha changes over time.

### Performance
- Old load score: `1/10`.
- Performance Budget Score impact: `-1` to `+1` versus `v0.25.156`.
- Current normal-play estimate before change: `39-65`.
- Expected normal-play estimate after change: roughly `38-66`.
- Visual risk: medium. The whole ground should no longer be blurred, but the
  foreground forest blur fade may need tuning on device if the top edge is too
  visible or too hidden.

### Verification
- `npm run lint`
- `npm run build`

## 2026-06-11 - v0.25.156 - Blur near foreground instead of fading it (Codex)

### Summary
- Added a rollback anchor before this change:
  - Branch: `backup/pre-near-blur-foreground-2026-06-11`
  - Tag: `pre-near-blur-foreground-v0.25.155`
- Removed the pale near-ground fade sprite and its per-frame sync.
- Restored the foreground forest color treatment:
  - `FRONT_FOREST_ALPHA`: `0.68 -> 0.78`
  - removed `FRONT_FOREST_TINT`
- Replaced the pale foreground treatment with blur:
  - `GROUND_BASE_BLUR = 0.8`
  - `FRONT_FOREST_BLUR = 2.2`
- Slightly brightened the stage environmental light shafts:
  - sunlight `shaftAlpha`: `0.07 -> 0.085`
  - moonlight `shaftAlpha`: `0.035 -> 0.045`
- Kept stage light shaft motion tied to player horizontal movement.

### Performance
- Old load score: `1/10`.
- Performance Budget Score impact: `+2` to `+5`.
- Current normal-play estimate before change: `37-60`.
- Expected normal-play estimate after change: roughly `39-65`.
- Visual risk: medium. The pale wash is gone, but the added blur may soften the
  entire ground base rather than only the very front edge.

### Verification
- `npm run lint`
- `npm run build`

## 2026-06-11 - v0.25.155 - Fade near ground and front forest (Codex)

### Summary
- Added a rollback anchor before this change:
  - Branch: `backup/pre-ground-near-fade-2026-06-11`
  - Tag: `pre-ground-near-fade-v0.25.154`
- Added a ground-only near fade that starts just below the player's foot
  screen position and becomes gradually paler toward the bottom of the screen.
- The near fade is a single screen-blended sprite inside `groundBase`, so it
  affects the floor only and does not wash over actors, enemies, projectiles,
  or HUD.
- Made the foreground forest slightly paler:
  - `FRONT_FOREST_ALPHA`: `0.78 -> 0.68`
  - `FRONT_FOREST_TINT`: `0xdde6d8`
- Changed stage light shaft horizontal drift from automatic time-based motion
  to player-movement-based motion:
  - `x = sin(playerFootX / 620px) * 18px`
  - `y = 0`
  - light shafts stop moving when the player stops moving horizontally.

### Performance
- Old load score: `1/10`.
- Performance Budget Score impact: `+1` to `+3`.
- Current normal-play estimate before change: `36-57`.
- Expected normal-play estimate after change: roughly `37-60`.
- Visual risk: medium. The near floor should feel atmospheric, but if it gets
  too washed out, tune `GROUND_NEAR_FADE_ALPHA` or `FRONT_FOREST_ALPHA`.

### Verification
- `npm run lint`
- `npm run build`

## 2026-06-11 - v0.25.154 - Move light shafts horizontally and smooth front forest (Codex)

### Summary
- Added a rollback anchor before this change:
  - Branch: `backup/pre-horizontal-light-drift-front-forest-2026-06-11`
  - Tag: `pre-horizontal-light-drift-front-forest-v0.25.153`
- Changed stage light shaft drift to a slow horizontal loop:
  - `x = sin(time) * 18px`
  - `y = 0`
  - existing shaft shapes are reused; no new draw calls/layers.
- Reduced the blocky/mosaic look on the foreground forest:
  - `frontForestTexture.source.scaleMode = 'linear'`
  - disabled the foreground-only blur filter by setting `FRONT_FOREST_BLUR = 0`
- Character/atlas pixel-art sampling remains `nearest`.

### Performance
- Old load score: `1/10`.
- Performance Budget Score impact: `+0` to `+2`.
- Current normal-play estimate before change: `36-55`.
- Expected normal-play estimate after change: roughly `36-57`.
- Visual risk: medium. Foreground forest should be smoother, but removing its
  blur may make it feel sharper/closer; tune alpha or blur if it becomes too
  crisp.

### Verification
- `npm run lint`
- `npm run build`

## 2026-06-11 - v0.25.153 - Add subtle light shaft drift and shrink player shadow (Codex)

### Summary
- Added a rollback anchor before this change:
  - Branch: `backup/pre-player-shadow-shaft-drift-2026-06-11`
  - Tag: `pre-player-shadow-shaft-drift-v0.25.152`
- Reduced only the player directional shadow width:
  - `PLAYER_SHADOW_SCALE = 0.9`
  - enemy shadows are unchanged.
- Added a subtle screen-space drift to the stage light shaft graphics:
  - max drift: `18px`
  - period: `11s`
  - drift direction is opposite `STAGE_LIGHT_SHAFT_DIRECTION`.
- No new graphics layers, filters, or draw calls were added.

### Performance
- Old load score: `1/10`.
- Performance Budget Score impact: `+0` to `+1`.
- Current normal-play estimate before change: `36-54`.
- Expected normal-play estimate after change: roughly `36-55`.
- Visual risk: low to medium. Player grounding becomes slightly lighter, and
  stage light shafts should feel less screen-fixed without obvious sliding.

### Verification
- `npm run lint`
- `npm run build`

## 2026-06-11 - v0.25.152 - Align actor shadows with stage light shafts (Codex)

### Summary
- Added a rollback anchor before this change:
  - Branch: `backup/pre-shaft-aligned-shadow-2026-06-11`
  - Tag: `pre-shaft-aligned-shadow-v0.25.151`
- Matched player/enemy directional shadows to the visible screen-space stage
  light shafts.
- Added one shared `STAGE_LIGHT_SHAFT_DIRECTION` constant:
  - stage light shaft travel: `{ x: 0.42, y: 1 }`
  - sunlight shadow direction: same constant
  - moonlight shadow direction: same constant
- This removes the mismatch where shadows were more horizontal than the
  moonlight/environment light drawn across the screen.

### Performance
- Old load score: `1/10`.
- Performance Budget Score impact: `0`.
- Current normal-play estimate before change: `36-54`.
- Expected normal-play estimate after change: roughly `36-54`.
- Visual risk: low to medium. Shadows now follow the visible light shafts, but
  they are more vertical than the previous actor-shadow direction.

### Verification
- `npm run lint`
- `npm run build`

## 2026-06-10 - v0.25.151 - Replace rare enemy glow with ornaments (Codex)

### Summary
- Added a rollback anchor before this change:
  - Branch: `backup/pre-rank-ornaments-2026-06-10`
  - Tag: `pre-rank-ornaments-v0.25.150`
- Replaced constant rank aura glow with lightweight pixel-style ornaments:
  - `strong`: small black wings
  - `elite`: small horns
  - `danger`: red wings plus horns and a thin red foot ring
- Removed rank-driven enemy light radius/tint/alpha boosts. Enemy light now
  remains type/hit/boss driven instead of keeping rare enemies glowing.
- Kept hit flashes, boss marker, stun reticle, strong-event glows, and global
  2DHD fog/depth blur/bloom/DOF unchanged.

### Performance
- Old load score: `1-2/10`.
- Performance Budget Score expected improvement: `-4` to `-8` when ranked
  enemies are common.
- Current normal-play estimate before change: `38-48`.
- Expected normal-play estimate after change: roughly `34-44`.
- Main reduced costs:
  - constant rare enemy glow Sprite updates
  - rank-driven always-on enemy light boosts
- Visual risk: medium. Rank identity changes from colored glow to silhouette
  ornaments, so readability must be checked on mobile. If ornaments are too
  subtle, add a thin foot ring for `strong`/`elite` or restore short event-only
  glow for `danger`.

### Code touched
- `src/pixi/pixiScene.ts`
- `src/types/game.ts`
- `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint`
- OK: `npm run build`

## 2026-06-10 - v0.25.150 - Optimize lightweight Pixi effects (Codex)

### Summary
- Added a rollback anchor before this change:
  - Branch: `backup/pre-perf-budget-2026-06-10`
  - Tag: `pre-perf-budget-v0.25.149`
- Kept 2DHD fog, depth blur, bloom, DOF-style filtering, and strong-event
  lighting intact.
- Converted small glow effects below the strong-event threshold to a single
  cached radial Sprite draw in Pixi instead of several Graphics circles.
- Slightly tightened only small glow radius and duration at spawn time.
  Strong-event glows at `44+` radius are not reduced.
- Skipped drawing world-space effects outside the camera plus viewport margin:
  particles, rings, glow, slash, trails, dog fetch sprite, and damage numbers.
  Effects remain in state and age normally; this is render-side culling only.
- Skipped offscreen torch rendering outside a viewport margin and reduced torch
  light/reflection strength only near the edge margin.
- Skipped glow ground reflections when their glow is offscreen plus margin.

### Performance
- Old load score: `3/10`.
- Performance Budget Score expected improvement: `-8` to `-22`.
- Current normal-play estimate before change: `45-55`.
- Expected normal-play estimate after change: roughly `38-48` when small glows
  and offscreen effects are active.
- Main reduced costs:
  - small glow Graphics work
  - offscreen effect draw calls
  - offscreen torch pulse/flame/ember work
  - offscreen glow ground reflections
- Visual risk: low to medium. Small glow can look slightly tighter, and torch
  light near screen edges can feel a little less broad. Strong event glows,
  boss/death/counter/finisher lighting, global bloom/fog/blur/DOF, and actor
  layer filter structure are unchanged.

### Code touched
- `src/pixi/pixiScene.ts`
- `src/store/gameStore.ts`
- `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint`
- OK: `npm run build`

## 2026-06-10 - v0.25.149 - Add benchmark result copy button (Codex)

### Summary
- Added a benchmark-only copy button to the result screen.
- The button copies a plain-text BENCH report for sharing in the debug chat.
- Copied report includes:
  - version, grade, avg/min/drops, enemy/fx
  - safe/stop
  - device verdict
  - NET RTT and MAIN DELAY
  - weak bottleneck
  - category summaries
  - per-stage details
- Uses `navigator.clipboard.writeText` when available, with a textarea
  `execCommand('copy')` fallback for local HTTP/iOS Safari cases.

### Performance
- Normal gameplay score impact: `0`.
- BENCH result screen only; no rendering stress values changed.

### Code touched
- `src/components/GameOverScreen.tsx`
- `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint`
- OK: `npm run build`

## 2026-06-10 - v0.25.148 - Add BENCH network and main-thread diagnostics (Codex)

### Summary
- Added browser-level diagnostics to BENCH result output.
- BENCH now samples:
  - `NET RTT`: same-origin fetch round-trip timing, as browser-style pseudo-ping.
  - `MAIN DELAY`: timer drift, used to detect device/main-thread stalls.
- Result screen now shows:
  - `device` verdict, such as `network OK / device OK` or
    `device hot / main-thread unstable`.
  - NET avg/max/sample count/failure count.
  - MAIN avg/max/sample count.
- The goal is to distinguish network trouble from hot-device / throttled Safari
  behavior when FPS results swing between runs.

### Performance
- Normal gameplay score impact: `0`.
- BENCH-only additional score: `+1-2`.
- Affected subsystem: benchmark diagnostics and result UI only.
- No normal gameplay rendering, enemy, glow, ring, torch, or shadow values changed.

### Code touched
- `src/components/BenchmarkOverlay.tsx`
- `src/components/GameOverScreen.tsx`
- `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint`
- OK: `npm run build`

## 2026-06-10 - v0.25.147 - Add diagnostic stress benchmark categories (Codex)

### Summary
- Changed benchmark mode into a diagnostic low-to-high stress test.
- Benchmark now tests categories separately:
  - `BASE`: minimum reference load.
  - `PART`: particle bursts at increasing counts.
  - `GLOW`: local glow count at increasing counts.
  - `RING`: ring effect count at increasing counts.
  - `SHDW`: enemy count plus vertical/shadow jitter.
  - `TORCH`: torch/local-light count at increasing counts.
  - `MIX`: combined real-game-like enemy/fx load.
- Each category escalates until the first non-pass, then skips to the next
  category so one failure does not hide later bottlenecks.
- Result screen now shows:
  - `weak`: lowest-performing failed category/profile.
  - category summaries like `PART: safe P50 / stop P90`.
  - each row's category prefix.
- Result card is scrollable on small mobile viewports so the longer diagnostic
  result can be inspected.

### Performance
- Load score during normal gameplay: `0/10`.
- Load score while benchmark is running: `6/10`.
- Affected subsystem: benchmark-only rendering stress and result UI.
- Normal gameplay enemy caps, effects, shadows, torches, and simulation are unchanged.

### Code touched
- `src/components/BenchmarkOverlay.tsx`
- `src/components/GameOverScreen.tsx`
- `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint`
- OK: `npm run build`

## 2026-06-10 - v0.25.146 - Sample benchmark FPS on tick (Codex)

### Summary
- Fixed benchmark attempts after A1 sometimes showing `avg 0.0 / min 0 / n0`.
- Benchmark FPS samples are now collected inside the benchmark tick from
  `fpsRef.current` every 500ms after warm-up.
- Removed dependency on React `fps` prop changes for sample collection, because
  a stable 60fps value may not re-render and therefore produced no samples.

### Conclusion
- The screenshot symptom was a measurement bug, not a true E20 performance
  failure.
- A2 and later attempts should now record samples even when the FPS display
  stays at a constant 60.

### Performance
- Load score: `1/10`.
- Affected subsystem: benchmark measurement logic only.
- No benchmark stress values or normal gameplay rendering cost were changed.

### Code touched
- `src/components/BenchmarkOverlay.tsx`
- `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint`
- OK: `npm run build`

## 2026-06-10 - v0.25.145 - Clarify benchmark safe limit result (Codex)

### Summary
- Clarified benchmark result display for low-to-high benchmark runs.
- Overall benchmark header now uses the highest passing attempt's avg/min/drops
  when a safe profile is found.
- Result card now shows:
  - `safe`: highest confirmed passing stress setting.
  - `stop`: first profile that did not pass, or `max passed`.
- Big benchmark label displays `SAFE` when a safe setting was found, instead of
  showing a broad `PASS` that could be confused with every stage passing.

### Conclusion
- The screenshot was not a benchmark logic failure: `MIN20` and `E20` passed,
  then `E28` failed, so the safe limit was `E20`.
- The old header mixed failed-attempt numbers into the top summary, which made
  the result look contradictory. This patch makes the conclusion explicit.

### Performance
- Load score: `1/10`.
- Affected subsystem: result UI / benchmark summary only.
- No benchmark stress values or normal gameplay rendering cost were changed.

### Code touched
- `src/components/BenchmarkOverlay.tsx`
- `src/components/GameOverScreen.tsx`
- `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint`
- OK: `npm run build`

## 2026-06-10 - v0.25.144 - Isolate benchmark attempt measurements (Codex)

### Summary
- Tightened benchmark measurement isolation between attempts.
- Attempt warm-up is now `1600ms` so the one-second FPS counter is less likely
  to include frames from the previous attempt.
- Benchmark cleanup now clears temporary visual effects as well as benchmark
  enemies and torches.
- Each attempt now tracks its own max enemy/fx/torch counts instead of using
  only the whole-run maximum.
- Result rows now show sample count as `n...` so suspicious low-sample results
  are visible.

### Conclusion
- Stage 2 and later could look suspicious because effects and FPS counter
  windows from the previous attempt could bleed into the next attempt. This
  patch makes attempt results cleaner and easier to audit.

### Performance
- Load score: `2/10`.
- Affected subsystem: benchmark measurement and cleanup only.
- Normal gameplay is unaffected.

### Code touched
- `src/components/BenchmarkOverlay.tsx`
- `src/components/GameOverScreen.tsx`
- `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint`
- OK: `npm run build`

## 2026-06-10 - v0.25.143 - Run benchmark from low to high load (Codex)

### Summary
- Reversed benchmark retry order.
- Benchmark now starts from the minimum profile and increases load step by step:
  - `A1 MIN20`: enemy 10 plus object/effect total 10, combined 20.
  - `A2 E20`
  - `A3 E28`
  - `A4 E36`
  - `A5 E48`
  - `A6 E60`
  - `A7 MAX72`
- If an attempt passes, benchmark proceeds to the next heavier profile.
- The first non-pass attempt stops the benchmark.
- The final safe setting is the last passing profile, not the first passing
  profile.

### Conclusion
- The benchmark now finds the highest confirmed safe load instead of proving
  that only the lowest fallback can pass.

### Performance
- Load score: `8/10`.
- Affected subsystem: benchmark-only rendering and simulation stress.
- Normal gameplay is unaffected.

### Code touched
- `src/components/BenchmarkOverlay.tsx`
- `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint`
- OK: `npm run build`

## 2026-06-10 - v0.25.142 - Retry benchmark until safe stress is found (Codex)

### Summary
- Changed benchmark mode from fixed category stages to retry-search behavior.
- The benchmark now starts from a heavy all-in profile and, if it fails,
  reruns with lighter profiles until it finds a passing condition.
- Retry profiles step down through:
  - `A1 MAX72`: enemy 72 plus heavy object/effect load.
  - `A2 E60`
  - `A3 E48`
  - `A4 E36`
  - `A5 E28`
  - `A6 E20`
  - `A7 MIN20`: enemy 10 plus object/effect total 10, for combined 20.
- The first profile that holds `avg >= 40fps` and `min >= 30fps` becomes the
  passing safe setting shown as `40+` in the result.
- If even `A7 MIN20` fails, the benchmark result is `FAIL`.

### Conclusion
- This is now useful for tuning: the result tells which enemy/object/effect
  budget passed, instead of only saying that the initial high-load test failed.

### Performance
- Load score: `8/10`.
- Affected subsystem: benchmark-only rendering and simulation stress.
- Normal gameplay is unaffected. Benchmark remains bounded and cleans up
  spawned enemies/torches after each retry and at completion.

### Code touched
- `src/components/BenchmarkOverlay.tsx`
- `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint`
- OK: `npm run build`

## 2026-06-10 - v0.25.141 - Isolate benchmark from normal gameplay (Codex)

### Summary
- Fixed benchmark mode still feeling like a normal game run.
- `useGameLoop()` now accepts `benchmarkMode` and skips normal gameplay
  simulation while benchmark mode is active.
- Benchmark mode still updates FPS, camera position, and visual effect
  lifetimes, but it skips normal enemy spawning, weapons, pickups, collisions,
  level-up flow, shops, quests, and regular run progression.
- Benchmark overlay now runs its first stress tick immediately on mount instead
  of waiting for the first interval.

### Conclusion
- Root cause: benchmark mode was previously layered on top of the normal game
  loop, so the regular run started first and benchmark stress appeared later.
- Fix: benchmark mode now replaces normal gameplay simulation for the duration
  of the test.

### Performance
- Load score: `2/10` for this control-flow fix.
- Affected subsystem: simulation control flow.
- Benchmark stress values are unchanged; normal gameplay is unaffected outside
  benchmark mode.

### Code touched
- `src/hooks/useGameLoop.ts`
- `src/components/Game.tsx`
- `src/components/BenchmarkOverlay.tsx`
- `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint`
- OK: `npm run build`

## 2026-06-10 - v0.25.140 - Make benchmark launch unmistakable (Codex)

### Summary
- Made benchmark launch state more robust and visible.
- `App` now keeps the requested benchmark launch in `pendingBenchmarkRef`
  through the async loading step and reapplies it immediately before entering
  gameplay.
- Loading screen now shows `Benchmark Loading` and benchmark-specific copy when
  benchmark mode is requested.
- Gameplay now shows a left-side `BENCH MODE` marker whenever benchmark mode is
  active.
- Start-screen benchmark button is still small, but now has a visible border,
  background, and `BENCH` label so it is harder to confuse with normal start.

### Conclusion
- If the game opens without `Benchmark Loading`, `BENCH MODE`, and the
  benchmark overlay, the normal start path was used.
- The benchmark path is now visually distinguishable from regular gameplay.

### Performance
- Load score: `1/10`.
- Affected subsystem: UI / state handoff only.
- No benchmark stress values or normal gameplay rendering cost were changed.

### Code touched
- `src/App.tsx`
- `src/components/LoadingScreen.tsx`
- `src/components/MainMenu.tsx`
- `src/components/Game.tsx`
- `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint`
- OK: `npm run build`

## 2026-06-10 - v0.25.139 - Fix benchmark completion under heavy load (Codex)

### Summary
- Fixed benchmark runs that could appear to continue forever under very heavy
  stress.
- Benchmark completion is no longer dependent on only one `setTimeout`.
- The interval tick also checks elapsed time and forces the same completion
  path once `BENCHMARK_DURATION_MS` is reached.
- Added a one-shot finalize guard so timeout completion and tick completion
  cannot double-submit results.

### Conclusion
- Root cause: the adaptive stress test became heavy enough that relying on a
  single timeout completion path was too fragile on mobile Safari.
- Fix: use redundant elapsed-time completion and one-shot cleanup.

### Performance
- Load score: `2/10` for this fix itself.
- Affected subsystem: benchmark control flow only.
- Benchmark stress level is unchanged from `v0.25.138`; this patch only makes
  completion reliable.

### Code touched
- `src/components/BenchmarkOverlay.tsx`
- `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint`
- OK: `npm run build`

## 2026-06-10 - v0.25.138 - Add adaptive benchmark stress search (Codex)

### Summary
- Changed benchmark stress behavior so high-density enemies are present from
  the beginning instead of ramping enemy count up gradually.
- Benchmark now tests heavier real rendering scenarios:
  - max enemy density
  - vertical actor movement for normal shadow recalculation
  - local glow/light shadow stress
  - 10 benchmark torches around the player
  - particle-heavy bursts
  - all-in mixed stress
- Added adaptive stress reduction when FPS hits the danger zone:
  - danger line: `30fps`
  - target safe line: `40fps+`
  - reduction order: particles, glow, rings, torches, vertical/shadow motion,
    then enemy count.
- Result screen now shows each stage's starting stress and the remaining
  `40+` stress setting after automatic reduction, so the safe counts can be
  used for tuning.

### Performance
- Load score: `8/10`.
- Affected subsystem: rendering and simulation.
- This is benchmark-only and bounded. Benchmark-spawned enemies and torches
  are removed after the run or unmount.
- Smartphone risk: high inside benchmark mode by design; normal gameplay is
  unaffected.

### Code touched
- `src/components/BenchmarkOverlay.tsx`
- `src/components/GameOverScreen.tsx`
- `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint`
- OK: `npm run build`

## 2026-06-10 - v0.25.137 - Expand benchmark stress categories (Codex)

### Summary
- Expanded benchmark mode from three generic stages to five drawing-stress
  stages.
- New stages:
  - `S1 BASE`: enemy 12, glow 1, ring 1, particle 0.
  - `S2 GLOW`: enemy 16, glow 8, ring 3, particle 0.
  - `S3 PARTICLE`: enemy 18, glow 2, ring 2, particle burst 42.
  - `S4 SHADOW`: enemy 44, glow 1, ring 1, particle burst 8, shadow-size jitter.
  - `S5 MIX`: enemy 64, glow 8, ring 5, particle burst 52, shadow-size jitter.
- Result screen now shows each stage's stress values as `E/G/R/P` alongside
  average FPS, minimum FPS, drops, and judgement.
- Benchmark remains hands-free and exits to the result screen after completion.

### Performance
- Load score: `6/10`.
- Affected subsystem: rendering and simulation.
- This is benchmark-only, bounded by fixed stage targets, short effect
  durations, and the existing effect pool cap. Normal gameplay is unaffected.
- Smartphone risk: medium; `S5 MIX` intentionally combines enemy/normal-shadow
  redraw, glow, ring, and particle pressure to expose mobile Safari limits.

### Code touched
- `src/components/BenchmarkOverlay.tsx`
- `src/components/GameOverScreen.tsx`
- `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint`
- OK: `npm run build`

## 2026-06-10 - v0.25.136 - Add staged benchmark logs (Codex)

### Summary
- Changed benchmark mode from a single flat 8-second test to a 12-second
  staged test.
- Added three bounded stages: `S1 LIGHT`, `S2 MED`, and `S3 HEAVY`.
- Each stage increases benchmark enemy target and glow/ring pulse count.
- Benchmark results now include per-stage average FPS, minimum FPS, drops,
  max enemy/fx counts, and stage judgement.
- The final benchmark judgement considers both total FPS and the worst stage.

### Performance
- Load score: `3/10`.
- Benchmark-only load is intentionally higher, but remains bounded by fixed
  stage enemy targets and fixed pulse counts. Normal play is unaffected.

### Code touched
- `src/components/BenchmarkOverlay.tsx`
- `src/components/GameOverScreen.tsx`
- `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint`
- OK: `npm run build`

## 2026-06-10 - v0.25.135 - Route benchmark completion to result screen (Codex)

### Summary
- Benchmark completion now hands the result to `App` and transitions to the
  existing result screen.
- The result screen shows the benchmark grade plus average FPS, minimum FPS,
  drop count, and enemy/fx max counts.
- The benchmark overlay still flashes the final grade briefly, then the run
  ends automatically.

### Performance
- Load score: `1/10`.
- Result routing is UI state only. It does not add runtime benchmark load.

### Code touched
- `src/components/BenchmarkOverlay.tsx`
- `src/components/Game.tsx`
- `src/components/GameOverScreen.tsx`
- `src/App.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

## 2026-06-10 - v0.25.134 - Prevent benchmark pause skew (Codex)

### Summary
- Prevented benchmark mode from being skewed by level-up pauses.
- During benchmark mode, upgrade menus are forced closed, pause is cleared,
  XP pickups are filtered out, and player experience is kept at zero.
- Benchmark-spawned enemies now use very high HP so auto-fire does not kill
  them and generate XP during the short test.
- FPS sampling ignores the first 1.6 seconds as warm-up so startup spikes do
  not become false `min 1` failures.

### Performance
- Load score: `2/10`.
- Benchmark-only guardrails run on the same bounded interval as the benchmark.
  Normal play remains unaffected unless benchmark mode is active.

### Code touched
- `src/components/BenchmarkOverlay.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

## 2026-06-10 - v0.25.133 - Make benchmark faster and hands-free (Codex)

### Summary
- Shortened benchmark mode from 20 seconds to 8 seconds.
- Increased the controlled benchmark enemy target to 12 and emits stress
  pulses more frequently for a quicker read.
- During benchmark mode, the player is kept healed/invulnerable and enemies are
  made non-damaging/rooted so the user does not need to move or fight.

### Performance
- Load score: `2/10`.
- Benchmark-only load is intentionally higher while active. Normal play remains
  unaffected because the code runs only through the benchmark overlay.

### Code touched
- `src/components/BenchmarkOverlay.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

## 2026-06-10 - v0.25.132 - Add quick benchmark mode (Codex)

### Summary
- Added a small `ベンチ` text button to the start screen.
- Benchmark mode runs for 20 seconds after loading into gameplay.
- It keeps a controlled set of benchmark enemies on screen, emits repeated
  glow/ring stress effects, samples FPS, and shows `PASS` / `CAUTION` / `FAIL`
  with average FPS, minimum FPS, and drop count.
- Benchmark-only enemies are removed when the run finishes or the component
  unmounts.

### Performance
- Load score: `2/10`.
- Benchmark code is inactive in normal play. When active, it uses existing
  enemy/effect systems and bounded intervals; no package install, network,
  dynamic shadow maps, or unbounded loops were added.

### Code touched
- `src/components/BenchmarkOverlay.tsx`
- `src/components/Game.tsx`
- `src/components/MainMenu.tsx`
- `src/App.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

## 2026-06-10 - v0.25.131 - Size normal shadows from sprite pixels (Codex)

### Summary
- Changed normal player/enemy cast-shadow sizing to derive from each actor
  sprite's rendered pixel width.
- Kept the previous foot-box width as a fallback for missing/hidden textures.
- Moved normal shadow sync after actor sync so shadow sizing uses the current
  frame's sprite scale and texture.

### Performance
- Load score: `1/10`.
- The change only reads existing sprite dimensions and still draws into the
  same pooled `shadowGfx`. No new objects, filters, dynamic lights, or loops
  were added.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

## 2026-06-10 - v0.25.130 - Replace normal ellipse shadows with cast shadows (Codex)

### Summary
- Removed the always-on player/enemy elliptical foot shadow from normal
  rendering.
- Made the normal stage-light shadow a wider capsule stroke derived from the
  previous foot-shadow ellipse shape, so `sunlight` casts a short right/down
  shadow without a separate round blob under actors.
- Kept strong-event shadows, 2DHD fog, bloom, DOF, light shafts, and local glow
  behavior unchanged.

### Performance
- Load score: `1/10`.
- Normal shadow draw count is lower than before: player/enemy no longer draw
  both a directional stroke and a separate ellipse. The same pooled
  `shadowGfx` path is used.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

## 2026-06-10 - v0.25.129 - Strengthen sunlight directional shadows (Codex)

### Summary
- Made the active sunlight preset's normal directional contact shadow easier to
  see by increasing its length and alpha.
- Kept the existing foot-shadow ellipse, light shafts, stage preset structure,
  and strong-event shadow system unchanged.

### Performance
- Load score: `1/10`.
- Constant-only tuning. Draw count and rendering paths are unchanged.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

## 2026-06-10 - v0.25.128 - Add switchable stage lighting presets (Codex)

### Summary
- Added switchable `sunlight` / `moonlight` stage lighting presets.
- Enabled `sunlight` first so the left-top light and right-down shadow direction
  are easy to evaluate.
- Added short directional contact shadows while keeping the existing foot
  ellipses for grounding.
- Added subtle static diagonal light shafts and reduced the player assist light
  to avoid a self-emissive player look.
- Routed normal bloom strength through the active lighting preset.

### Active preset
- Active: `sunlight`
- Shadow direction: right/down, from a left-top main light.
- Moonlight preset is defined but inactive and can be enabled by changing
  `ACTIVE_STAGE_LIGHTING_NAME` to `moonlight`.

### Rollback point
- Backup branch: `backup/pre-stage-lighting-presets-2026-06-10`
- Backup tag: `pre-stage-lighting-presets-v0.25.127`
- Previous pushed commit: `0e6375b`
- Safe rollback: `git revert <v0.25.128_commit>`

### Performance
- Load score: `2/10`.
- Cost is rendering-side only: a few static light-shaft polygons and one short
  extra contact-shadow stroke per player/enemy. No per-pixel lighting, dynamic
  shadow map, unbounded light loop, package install, audio, memory, or network
  work was added.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

## 2026-06-10 - v0.25.127 - Tune forest depth and default shadows (Codex)

### Summary
- Increased the foreground forest parallax speed and made the foreground forest
  slightly larger.
- Added a light blur to the far backdrop so the distant scenery sits farther
  behind the play field.
- Made the two-person event NPC ground shadow slightly wider.
- Darkened always-on player/enemy foot shadows slightly.

### Performance
- Load score: `2/10`.
- Cost is rendering-side only: one low-strength blur filter on the fixed far
  backdrop plus small parameter changes. No new game-logic loop, shadow caster,
  audio, memory, or network work was added.

### Code touched
- `src/pixi/pixiScene.ts`
- `src/pixi/renderSpec.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

## 2026-06-10 - v0.25.126 - Exclude periodic weapon explosions from slow motion (Codex)

### Summary
- Removed slow motion from grenade-launcher projectile explosions because they
  can happen periodically during normal combat and interrupt game tempo.
- Kept the orange explosion glow/ring visuals; only the simulation slow trigger
  was removed.
- Added the project rule that periodic weapon explosions must not trigger slow
  motion unless explicitly requested.

### Slow-motion event list after this change
- Player death: red glow + death rings, `0.32x` for `820ms`.
- Castle boss emergence: red castle glow/rings, `0.36x` for `900ms`.
- Counter projectile reflection: cyan glow/ring, `0.34x` for `560ms`.
- Melee finisher / boss finisher hit: gold glow/rings, `0.4x` for `820ms`.

### Performance
- Load score: `1/10`.
- This removes another slow-motion trigger and does not add rendering,
  simulation, audio, memory, or network work.

### Code touched
- `src/hooks/useGameLoop.ts`
- `CLAUDE.md`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

## 2026-06-10 - v0.25.125 - Exclude sub-weapon grenades from slow motion (Codex)

### Summary
- Removed slow motion from the Heavy Gunner timed grenade explosion because
  sub-weapon events are not slow-motion targets unless explicitly named.
- Kept the grenade's orange glow/ring visual effect; only the simulation slow
  trigger was removed.
- Added the project rule that sub-weapon/class-skill events must not trigger
  slow motion by default.

### Slow-motion event list after this change
- Player death: red glow + death rings, `0.32x` for `820ms`.
- Castle boss emergence: red castle glow/rings, `0.36x` for `900ms`.
- Counter projectile reflection: cyan glow/ring, `0.34x` for `560ms`.
- Grenade-launcher projectile explosion: orange glow/ring, `0.5x` for `440ms`.
- Melee finisher / boss finisher hit: gold glow/rings, `0.4x` for `820ms`.

### Performance
- Load score: `1/10`.
- This removes one slow-motion trigger and does not add any new rendering,
  simulation, audio, memory, or network work.

### Code touched
- `src/hooks/useGameLoop.ts`
- `CLAUDE.md`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

## 2026-06-10 - v0.25.124 - Keep strong glow active during slow motion (Codex)

### Summary
- Matched strong-event glow/ring durations to their slow-motion windows so the
  light and event shadows stay visible while the game is slowed.
- Kept the existing lightweight slow-motion model: simulation `deltaTime` is
  scaled; rendering/audio continue normally.
- Added the project rule that potentially costly changes must report a load
  score, affected subsystem, and safeguard.

### Slow-motion event list
- Player death: red glow + death rings, `0.32x` for `820ms`.
- Castle boss emergence: red castle glow/rings, `0.36x` for `900ms`.
- Heavy Gunner timed grenade explosion: orange glow/ring, `0.5x` for `440ms`.
- Counter projectile reflection: cyan glow/ring, `0.34x` for `560ms`.
- Grenade-launcher projectile explosion: orange glow/ring, `0.5x` for `440ms`.
- Melee finisher / boss finisher hit: gold glow/rings, `0.4x` for `820ms`.

### Performance
- Load score: `2/10`.
- Cost is rendering-side only: existing glow/shadow effects live longer during
  bounded one-shot events. No new per-pixel pass, shadow map, dependency, or
  unbounded loop was added.
- Safeguard: strong-event shadows remain capped by `LOCAL_EVENT_MAX_CAST_SHADOWS`.

### Code touched
- `src/hooks/useGameLoop.ts`
- `src/store/gameStore.ts`
- `CLAUDE.md`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

## 2026-06-10 - v0.25.123 - Match event shadow thickness to foot-shadow shape (Codex)

### Summary
- Kept the rounded-stroke strong-event shadow approach from `v0.25.122`.
- Folded the ground-perspective Y compression into the shared cast direction so
  all three shadow layers extend along the same vector.
- Set stroke thickness from the foot-shadow ellipse cross-section perpendicular
  to the cast direction, so vertically stretching shadows inherit the foot
  shadow's wider horizontal body instead of using only its thin height.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The three cast-shadow layers still vary by `distance`, `width`, and `alpha`.
- If vertical cast shadows now feel too heavy, tune the per-layer `width`
  multipliers before changing the foot-shadow-derived thickness formula.

## 2026-06-10 - v0.25.122 - Restore stretched event shadows with round strokes (Codex)

### Summary
- Replaced the separated ellipse-copy event shadows from `v0.25.121` with
  rounded stroke shadows that actually read as stretched foot shadows.
- Kept the normal foot-shadow ellipse at the caster and layered three different
  stroke lengths so the shadow fades as it extends away from the light.
- Preserved the low-cost strong-event-only approach: no shadow maps or per-pixel
  lighting pass.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The visible stretch is now controlled mainly by the three `distance` values
  in `syncLocalEventLighting()`.
- Thickness is tied to normal foot-shadow height via `shadowRadiusY`, not actor
  body width, to avoid the previous oversized cast-shadow band.

## 2026-06-10 - v0.25.121 - Stretch foot shadows with fading copies (Codex)

### Summary
- Replaced the pointed strong-event cast-shadow polygons with three fading
  copies of each actor's normal foot shadow.
- Kept the foot-shadow roundness and base width while offsetting the copies
  away from the strong light source.
- Made the farthest copy very faint so the shadow reads as fading into the
  ground instead of ending in a sharp tip.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- This is a low-cost approximation for Octopath-like event shadows: no dynamic
  shadow map, just a few ellipses during strong light events.
- If the tail feels too short/long, tune the `distance` values in
  `syncLocalEventLighting()`. If it feels too smoky, tune the copied ellipse
  alpha values.

## 2026-06-10 - v0.25.120 - Use foot-shadow width for event cast shadows (Codex)

### Summary
- Reworked strong-event cast shadows to use each actor's normal foot-shadow
  width instead of the full visual body height/width.
- Kept the long strong-event cast direction and darker opacity, so the effect
  reads more like the existing foot shadow stretching away from the light.
- Reduced the oversized band-like look from v0.25.119 while preserving the
  strong event slow-motion behavior.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If the stretched shadow is still too visible, tune `LOCAL_EVENT_SHADOW_ALPHA`
  first. If it is too long, tune `LOCAL_EVENT_SHADOW_REACH_MULT` or the `len`
  formula inside `syncLocalEventLighting()`.

## 2026-06-10 - v0.25.119 - Add strong-event slow motion and max-width shadows (Codex)

### Summary
- Added a lightweight strong-event slow-motion state. It scales simulation
  `deltaTime` for brief impact moments while rendering, audio, FPS display, and
  VFX lifetimes continue normally.
- Triggered the slow motion on melee finishers, counters, grenade explosions,
  boss-castle emergence, and player death.
- Made strong-event cast shadows use a much fuller caster width by taking the
  larger visual dimension for characters/enemies and widening the shadow body.

### Code touched
- `src/store/gameStore.ts`
- `src/hooks/useGameLoop.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Slow-motion tuning is centralized through `triggerTimeSlow(scale, durationMs)`.
  Smaller `scale` means stronger slow; longer `durationMs` means the feel holds
  longer. Current counter value is `0.34 / 560ms`, grenade is `0.5 / 440ms`,
  and finisher is `0.4 / HITSTOP_MS + 520ms`.
- Shadow width is intentionally bold for on-device evaluation. If it reads too
  heavy, reduce the `width` formula in `syncLocalEventLighting()` before
  lowering shadow opacity.

## 2026-06-10 - v0.25.118 - Exaggerate strong-event cast shadows (Codex)

### Summary
- Made strong-event cast shadows longer and wider while keeping the same
  caster cap and same single graphics pass.
- Slightly increased cast-shadow opacity.
- Expanded the strong-event shadow reach so more nearby actors/props can cast
  readable shadows during grenade/counter/finisher-style flashes.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- This is intentionally theatrical. If it feels too heavy visually, tune
  `LOCAL_EVENT_SHADOW_REACH_MULT`, the `len` formula, then the `width` formula
  in that order.

## 2026-06-10 - v0.25.117 - Darken cast shadows and suppress bloom during strong events (Codex)

### Summary
- Made strong-event cast shadows thicker and darker without increasing the
  number of drawn shadow shapes.
- Increased the local event ground darkening while keeping it as a soft fill
  so it does not create a dark rim around the light source.
- Temporarily sets the world `AdvancedBloomFilter` bloom scale to `0` while a
  strong glow event is active, then restores the normal bloom scale afterward.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Strong events should now read with higher contrast: darker cast shadows and
  no global bloom washing the frame while the event glow is alive.
- If this becomes too stark, reduce `LOCAL_EVENT_SHADOW_ALPHA` first, then
  `LOCAL_EVENT_SHADE_ALPHA`.

## 2026-06-10 - v0.25.116 - Remove dark rim from strong event lights (Codex)

### Summary
- Removed the visible dark stroke around strong event glow sources.
- Kept the soft local ground contrast, but changed it to a low-alpha filled
  ellipse so shadows no longer appear to originate from the edge of the light
  disc.
- Preserved multi-source cast shadows for simultaneous grenade/explosion
  events.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Check grenade clusters and melee/counter events. The intended result is:
  multiple shadow directions are allowed, but no dark outline should cling to
  the glow perimeter.

## 2026-06-10 - v0.25.115 - Move strong glow under event shadows (Codex)

### Summary
- Routed strong `glow` effects to the ground layer instead of the top effect
  layer.
- Keeps broad event light below the local event shadow pass, so it should no
  longer sit visibly on top of the cast shadows.
- Normal small glows, rings, slash effects, damage numbers, and dog fetch
  effects remain on the existing upper effect layer.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Re-test strong events. The bright source may now feel less overlaid; if it
  becomes too subtle, add a very small separate core effect rather than moving
  the broad glow back above the shadows.

## 2026-06-10 - v0.25.114 - Keep strong glow from washing over cast shadows (Codex)

### Summary
- Reduced the broad top-layer additive glow used by strong glow events.
- Kept the bright source core and small rim, but stopped the huge glow disc
  from painting over the local event shadow pass.
- Leaves the ground contrast and cast-shadow work in `syncLocalEventLighting`,
  so the Octopath-style event shadow should read more clearly.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Test with counter / melee finisher / grenade. If the shadow is now visible
  but too dark, tune the local shadow constants instead of re-expanding the
  top-layer glow.

## 2026-06-09 - v0.25.113 - Lift event shadows above ground overlays (Codex)

### Summary
- Moved the local event shadow pass from the ground layer to the bottom of the
  actor layer.
- Keeps strong glow event shadows above ground reflections, pickups, and
  additive ground lights while still below characters, trees, props, castle,
  merchant, and event NPCs.
- Fixes the issue where only the protruding parts of the event shadows were
  visible because later ground-layer drawing covered most of the shadow pass.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Re-check with counter, melee finisher, grenade explosion, or boss-castle
  spawn. If the shadow shape is now visible but too strong, tune the alpha and
  length constants added in v0.25.111/v0.25.112.

## 2026-06-09 - v0.25.112 - Make event shadow pass visibly render (Codex)

### Summary
- Moved the local event shadow layer above ground reflections, player ground
  light, and normal foot shadows while keeping it below actors.
- Replaced the line-stroke cast shadow with tapered filled shadow polygons plus
  a darker contact shadow at each caster's foot.
- This should make strong glow event shadows actually visible instead of being
  buried under additive ground lights or lost in the detailed floor texture.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Check with counter, melee finisher, grenade, or boss-castle spawn. If still
  invisible, the next likely issue is that the triggering glow coordinates are
  not close enough to the visible actors/props.

## 2026-06-09 - v0.25.111 - Make event shadows easier to read (Codex)

### Summary
- Increased the local darkness around strong glow events so nearby shadows read
  more clearly.
- Lengthened event-cast shadows and expanded their reach so finishers,
  counters, explosions, and other strong glow events are easier to evaluate on
  device.
- Kept the existing per-light caster cap and screen/radius culling unchanged.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- This is intentionally more visible than the first pass. If it feels too
  theatrical, tune `LOCAL_EVENT_SHADOW_ALPHA`,
  `LOCAL_EVENT_SHADOW_REACH_MULT`, and the `len` formula in
  `syncLocalEventLighting`.

## 2026-06-09 - v0.25.110 - Add strong-light cast shadows (Codex)

### Summary
- Added the first lightweight Octopath-style shadow pass for strong glow
  events only.
- Strong local glow events now cast elongated fake ground shadows from the
  player, enemies, trees, breakable props, castle, weapon merchant, and quest
  NPCs.
- Kept the implementation to one `Graphics` layer with screen/radius culling
  and a per-light cap of 22 shadow casters.
- Fixed the event-shadow enemy caster coordinates to use the current
  `enemyFootBox` fields.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- This is step 1 only: shadows respond to strong one-shot glow events such as
  finishers/counters/explosions.
- Step 2 can extend the same caster pass to torch proximity if the event-only
  version feels good on device.

## 2026-06-09 - v0.25.109 - Lift horizon seam above ground and soften player glow (Codex)

### Summary
- Moved the horizon forest seam one layer up: it now draws above the fixed
  ground layer but below the filtered gameplay world.
- This lets the seam hide the far/ground boundary without covering enemies,
  player, pickups, props, or effects.
- Slightly reduced the constant player ground glow alpha from `0.32` to `0.26`.

### Code touched
- `src/pixi/layers.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The horizon seam is still screen-space and still uses the existing fade mask.
- On-device check: confirm the seam sits visually over the ground edge but does
  not cover gameplay objects.

## 2026-06-09 - v0.25.108 - Match gameplay player sprites to character-select sprites (Codex)

### Summary
- Treat `v0.25.107` as the rollback point for this experiment. If the user says
  "戻して", return the gameplay player sprite selection/scale to that state.
- Changed gameplay player rendering to use the exact same `player-*-walk-*`
  materials shown on the character-select screen.
- Removed the gameplay-only `player-*-game-*` texture reference from the active
  player draw path.
- Matched the gameplay class sprite base scale to the character-select image
  width (`86px`) so the focal-plane player reads close to the menu sprite size
  and material scale.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push remains paused by user instruction.
- The generated `player-*-game-*` files are intentionally left in the repo for
  easy rollback or comparison.

## 2026-06-09 - v0.25.107 - Replace horizon forest seam material (Codex)

### Summary
- Replaced the horizon forest seam material with the newly supplied
  `遠景森.png`.
- Removed only the border-connected purple background by alpha keying.
- Baked a subtle bottom fade into the texture so the added ground strip fades
  from transparent at the bottom into the forest material above.
- Kept the existing runtime horizon forest fade mask in place for final
  in-game blending.

### Code touched
- `public/backgrounds/horizon-forest-band.png`
- `package.json`, `package-lock.json`

### Verification
- Alpha sanity check: upper purple background is transparent, bottom edge fades
  to transparent.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push remains paused by user instruction.
- The output texture is `1672x941`, matching the supplied material aspect ratio.

## 2026-06-09 - v0.25.106 - Revert playable-character layer split (Codex)

### Summary
- Reverted the `v0.25.104` experiment that moved the playable character into a
  separate `characterWorld` layer outside the filtered gameplay world.
- Restored the normal actor-layer composition so player lights, local effects,
  overlap, and Y-sort behavior line up with the rest of the world again.
- Kept the `v0.25.105` Heavy Gunner sprite replacement intact.
- Global world effects remain ON, matching the saved all-effects checkpoint
  direction while we look for a different way to preserve character pixel art.

### Code touched
- `src/pixi/layers.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push remains paused by user instruction.
- Avoid the separate playable-character world approach for now: it caused
  character-related lights to composite under the character.

## 2026-06-09 - v0.25.105 - Replace heavy gunner with new material-preserved sprites (Codex)

### Summary
- Replaced the Heavy Gunner character-select and in-game sprite frames with
  the newly supplied 3-frame material.
- Removed only the border-connected purple background, preserving the character
  artwork itself.
- Kept aspect ratio intact and used nearest-neighbor scaling only for fitting
  into the existing character-select (`128x108`) and gameplay (`96x80`) sprite
  canvases.
- Updated both `player-shotgun-walk-*` and `player-shotgun-game-*` so gameplay
  and character select use the same visual material.

### Code touched
- `public/sprites/player-shotgun-walk-0.png`
- `public/sprites/player-shotgun-walk-1.png`
- `public/sprites/player-shotgun-walk-2.png`
- `public/sprites/player-shotgun-game-0.png`
- `public/sprites/player-shotgun-game-1.png`
- `public/sprites/player-shotgun-game-2.png`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push remains paused by user instruction.
- The source art was not redrawn or reshaped; only the purple background was
  keyed out before uniform nearest-neighbor fitting.

## 2026-06-09 - v0.25.104 - Separate playable character from global world filters (Codex)

### Summary
- Treat `v0.25.103` as the saved "all effects ON" checkpoint.
- Added a camera-following `characterWorld` layer outside `filteredWorld`.
- Moved the playable character sprite container into `characterWorld` so global
  world bloom / tilt-shift no longer brighten or soften the player sprite.
- Kept global bloom, DOF, vignette, color grade, ground glow, shadows, enemy
  effects, pickups, and world effects ON.

### Code touched
- `src/pixi/layers.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push remains paused by user instruction.
- This is the first Octopath-like split: atmosphere remains on the world, while
  playable character pixels stay outside global post-processing.
- Tradeoff to watch on-device: the player is now composited above the filtered
  world, so test whether tree/castle/enemy overlap still feels acceptable.

## 2026-06-09 - v0.25.103 - Restore global world bloom effects (Codex)

### Summary
- Re-enabled the global Pixi world bloom filter after the character washout
  diagnosis pass.
- Player ground glow remains restored at `0.32`.
- This returns the broader atmospheric effect stack for further visual tuning.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push remains paused by user instruction.
- Known tradeoff: global bloom improves atmosphere but can brighten player
  sprites; future tuning may need bloom separation or lower threshold/scale.

## 2026-06-09 - v0.25.102 - Restore player ground glow with world bloom off (Codex)

### Summary
- Restored the warm player ground glow alpha to `0.32`.
- Kept global world bloom disabled because that was the likely cause of the
  persistent in-game character color washout.
- This isolates the player floor halo from the global bloom issue.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push remains paused by user instruction.
- If character color stays correct, keep global bloom off and use localized
  glow/effect sprites instead.

## 2026-06-09 - v0.25.101 - Disable world bloom for gameplay character color test (Codex)

### Summary
- Disabled the global Pixi world bloom filter to test the persistent in-game
  player sprite washout/brightening that does not appear on the character
  select screen.
- Character select uses DOM image sprites and is unaffected by Pixi world
  filters; gameplay sprites were inside `filteredWorld`, so global bloom could
  brighten pale hair/skin/clothing for the entire run.
- Kept tilt-shift depth of field, vignette, cool grade, shadows, and local
  gameplay effects intact.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push remains paused by user instruction.
- If this fixes the character color, reintroduce bloom only on explicit effect
  layers/items instead of the whole gameplay world.

## 2026-06-09 - v0.25.100 - Disable constant player glow for pixel clarity test (Codex)

### Summary
- Set the constant player halo/glow alpha to `0` to test whether the always-on
  additive hero light was softening the player sprites during gameplay.
- Kept depth of field, vignette, environment lighting, shadows, and event
  effects intact.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push remains paused by user instruction.
- If player pixels now read sharper, keep the constant hero halo off and use
  explicit event/skill effects instead.

## 2026-06-09 - v0.25.99 - Add crisp in-game player sprite set (Codex)

### Summary
- Added separate in-game player sprites for all four character classes so the
  menu art can stay large while gameplay uses crisp, size-matched pixel art.
- Generated `*-game-0..2` sprites at a shared `64px` content height with
  nearest-neighbor scaling only.
- Updated Pixi player rendering to use the in-game sprites and a `64px` base
  height, so players near the focal plane are drawn close to 1:1 instead of
  being dynamically downscaled from larger menu sprites.
- Confirmed Pixi texture loading already uses `nearest`; this change addresses
  the remaining mismatch caused by mixed source content heights (`96px` and
  `108px`) and runtime downscaling.

### Code touched
- `public/sprites/player-shotgun-game-0.png`
- `public/sprites/player-shotgun-game-1.png`
- `public/sprites/player-shotgun-game-2.png`
- `public/sprites/player-magnum-game-0.png`
- `public/sprites/player-magnum-game-1.png`
- `public/sprites/player-magnum-game-2.png`
- `public/sprites/player-scavenger-game-0.png`
- `public/sprites/player-scavenger-game-1.png`
- `public/sprites/player-scavenger-game-2.png`
- `public/sprites/player-striker-game-0.png`
- `public/sprites/player-striker-game-1.png`
- `public/sprites/player-striker-game-2.png`
- `src/pixi/pixiTextures.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push remains paused by user instruction.
- Character select continues using the larger `*-walk-*` images; gameplay now
  uses the new `*-game-*` images.

## 2026-06-09 - v0.25.98 - Replace heavy gunner sprites (Codex)

### Summary
- Replaced the Heavy Gunner walk frames with the newly supplied 3-frame sprite
  sheet.
- Purple background was keyed transparent and frames were fit into the existing
  `128x108` player sprite canvas using nearest-neighbor scaling only.
- Lightly aligned head centers across frames to reduce wobble while preserving
  the walking motion and foot baseline.

### Code touched
- `public/sprites/player-shotgun-walk-0.png`
- `public/sprites/player-shotgun-walk-1.png`
- `public/sprites/player-shotgun-walk-2.png`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push remains paused by user instruction.

## 2026-06-09 - v0.25.97 - Align scavenger walk head position (Codex)

### Summary
- Repositioned the Scavenger walk frames so the head center stays consistent
  across the 3-frame animation.
- Kept the existing sprite size, foot baseline, and nearest-neighbor pixels.
- Reduced the visible side-to-side wobble while preserving the leg motion.

### Code touched
- `public/sprites/player-striker-walk-0.png`
- `public/sprites/player-striker-walk-1.png`
- `public/sprites/player-striker-walk-2.png`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push remains paused by user instruction.

## 2026-06-09 - v0.25.96 - Slightly extend trap shove distance (Codex)

### Summary
- Increased the melee shove distance for placed traps from `56px` to `68px`.
- Kept the existing direction logic and smooth slide animation unchanged.

### Code touched
- `src/store/gameStore.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push remains paused by user instruction.

## 2026-06-09 - v0.25.95 - Replace scavenger character sprites (Codex)

### Summary
- Replaced the in-game Scavenger walk frames with the newly supplied 3-frame
  male scavenger sprite sheet.
- Purple background was keyed to transparent and each frame was preserved with
  nearest-neighbor scaling on the existing `128x108` player canvas.
- Kept the existing foot alignment and player class sprite scale so gameplay
  positioning stays consistent.

### Code touched
- `public/sprites/player-striker-walk-0.png`
- `public/sprites/player-striker-walk-1.png`
- `public/sprites/player-striker-walk-2.png`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push remains paused by user instruction.
- The Scavenger class (`necromancer`) currently uses `player-striker-walk-*`
  in both menu and Pixi gameplay rendering due the previous Striker/Scavenger
  sprite swap.

## 2026-06-09 - v0.25.94 - Add random event duo NPC scaffold (Codex)

### Summary
- Added the supplied duo character art as `quest-futari` with the purple
  background keyed transparent.
- Added a random in-world event NPC that appears once per run.
- The duo can be interacted with by standing inside their circle and using
  melee, matching the weapon merchant interaction style.
- Added a short dialogue popup with `受ける` / `受けない`.
- Accepting starts the event quest state for the current run; declining closes
  the dialogue without changing quest state.
- Added a light breathing motion to the duo sprite so they feel alive in-world.

### Code touched
- `public/sprites/quest-futari.png`
- `src/types/game.ts`
- `src/store/gameStore.ts`
- `src/pixi/pixiTextures.ts`
- `src/pixi/pixiScene.ts`
- `src/components/Game.tsx`
- `src/components/EventQuestMenu.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- Quest completion conditions/rewards are intentionally not implemented yet.
- `completeEventQuest()` is available as the future hook for fade-out removal.
- Weapon merchant breathing was left off because the sprite includes large
  attached weapon props and would look like the whole shop is breathing.

## 2026-06-09 - v0.25.93 - Smooth trap shove direction (Codex)

### Summary
- Changed Marksman trap melee shove direction to use the player's position
  relative to the trap center instead of the player's facing direction.
- A player above the trap now pushes it downward, left pushes it right, and
  diagonal positions push it away diagonally.
- Added a short visual-only slide interpolation so shoved traps glide smoothly
  to their new position instead of snapping.

### Code touched
- `src/store/gameStore.ts`
- `src/pixi/pixiScene.ts`
- `src/types/game.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- Trap gameplay position updates immediately; only the Pixi rendering is
  eased for the shove animation.

## 2026-06-09 - v0.25.92 - Replace weapon merchant sprite (Codex)

### Summary
- Replaced the weapon merchant sprite with the supplied dot-art version.
- Keyed the purple background to transparent.
- Normalized the sprite to about the in-game target height (`93x100`) using
  nearest-neighbor scaling so Pixi does not downsample a huge source and crush
  the dots.

### Assets touched
- `public/sprites/weapon-merchant.png`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- On-device check: confirm merchant dot crispness and in-world size after the
  new `93x100` texture.

## 2026-06-09 - v0.25.91 - Add weapon merchant direction indicator (Codex)

### Summary
- Added a screen-edge direction indicator for the weapon merchant when she is
  off-screen.
- The indicator uses a gold/purple merchant-lantern style icon and an arrow
  pointing toward the merchant.
- The indicator stays hidden while the merchant is visible on-screen.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- On-device check: ensure the merchant icon does not clutter the existing
  castle/supply arrows.

## 2026-06-09 - v0.25.90 - Replace striker and marksman sprites (Codex)

### Summary
- Replaced the Striker walk frames with the supplied red-haired character art.
  - Current class mapping uses `player-scavenger-walk-*` for Striker.
- Replaced the Marksman walk frames with the supplied hooded rifle character art.
  - Marksman uses `player-magnum-walk-*`.
- Purple backgrounds were chroma-keyed to transparent, then each frame was
  fitted to the existing `128x108` player sprite canvas using nearest-neighbor
  scaling.

### Assets touched
- `public/sprites/player-scavenger-walk-0.png`
- `public/sprites/player-scavenger-walk-1.png`
- `public/sprites/player-scavenger-walk-2.png`
- `public/sprites/player-magnum-walk-0.png`
- `public/sprites/player-magnum-walk-1.png`
- `public/sprites/player-magnum-walk-2.png`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- Note: file naming still reflects the earlier Striker/Scavenger art swap; the
  rendered class mapping is correct.

## 2026-06-09 - v0.25.89 - Smooth weapon merchant depth scaling (Codex)

### Summary
- Removed the merchant-only 1/256 scale snapping.
- Weapon merchant size now follows the same continuous depth scale as other
  actors, making near/far size changes seamless.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- This may slightly soften merchant pixels at some distances, but avoids visible
  stepping in perspective scale.

## 2026-06-09 - v0.25.88 - Lower horizon forest layer (Codex)

### Summary
- Moved the horizon seam forest layer below the gameplay world group.
- The distant forest still sits in front of the far backdrop, but it no longer
  draws over enemies, pickups, props, the player, castle, or merchant.
- Updated the layer comments to reflect the new ordering.

### Code touched
- `src/pixi/layers.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- On-device check: confirm the far/ground seam still reads naturally now that
  gameplay objects are always above the horizon forest.

## 2026-06-09 - v0.25.87 - Y-sort castle with actors (Codex)

### Summary
- Moved the boss castle from the background layer into the Y-sorted actor layer.
- Set the castle z-index to its foot position, matching trees and other actors.
- The player now appears behind the castle when walking behind it, and in front
  when walking below/in front of it.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- On-device check: confirm the castle hiding point feels aligned with its
  collision footprint.

## 2026-06-09 - v0.25.86 - Increase weapon merchant size (Codex)

### Summary
- Increased the weapon merchant render height from `50` to `100`, roughly 2x
  the previous in-game size.
- Kept the tightened shop interaction rule unchanged: the player must be inside
  the merchant circle and melee to open the shop.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.

## 2026-06-09 - v0.25.85 - Tune weapon merchant scale and interaction radius (Codex)

### Summary
- Reduced the weapon merchant render height from `148` to `50`, roughly one
  third of the previous in-game size.
- Rounded merchant sprite scale to a 1/256 step to keep pixel-art scaling more
  stable and reduce visible distortion.
- Tightened shop opening: melee only opens the shop when the player's center is
  inside the merchant interaction circle, not merely within melee reach.

### Code touched
- `src/pixi/pixiScene.ts`
- `src/store/gameStore.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- On-device check: merchant should feel intentionally interactable but no
  longer oversized.

## 2026-06-09 - v0.25.84 - Add castle collision and reduce castle size (Codex)

### Summary
- Reduced the boss castle render height to roughly half of the previous size.
- Added castle AABB collision using the same obstacle convention as trees:
  bottom-center foot point, narrow collision rectangle, and AABB push-out.
- Player movement now resolves against castle collision after tree and torch
  collision.
- Grenades now treat the castle as a wall and bounce off it like trees/torches.

### Code touched
- `src/store/gameStore.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- On-device check: castle visual scale, foot collision width/height, and
  grenade bounce feel.

## 2026-06-09 - v0.25.83 - Add weapon merchant shop interaction (Codex)

### Summary
- Added the weapon merchant as an in-world Pixi sprite using the supplied art
  with the purple background keyed transparent.
- Placed the merchant randomly near the map center/start area each run.
- Changed shop access to intentional interaction: stand near the merchant and
  use melee to open the shop. Passing nearby no longer auto-opens the menu.
- Added a compact strap shop:
  - handgun / shotgun / rifle ammo packs: `10s`
  - dog: `100s`, levels up each purchase and is removed from level-up options
  - current character subweapon level-up: `100s`
  - medkit: `50s`, same immediate heal amount as meat
  - vaccine: `1000s`, one-time purchase that revives the player once
- Vaccine revive restores 50% max HP, grants invulnerability, and plays a green
  revive flash/callout.

### Code touched
- `src/store/gameStore.ts`
- `src/types/game.ts`
- `src/hooks/useGameLoop.ts`
- `src/pixi/pixiScene.ts`
- `src/pixi/pixiTextures.ts`
- `src/components/Game.tsx`
- `src/components/ShopMenu.tsx`
- `src/utils/upgradeUtils.ts`
- `public/sprites/weapon-merchant.png`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- On-device check: merchant scale/position, melee-open feel, and vaccine revive
  balance.

## 2026-06-09 - v0.25.82 - Adjust provisional score and gold formula (Codex)

### Summary
- Updated provisional result scoring:
  - damage score: `damageDealt * 0.5`
  - max combo score: `maxCombo * 500`
  - treasure score: `treasureValue * 10000`
  - remaining strap score: `remainingStraps * 80`
  - clear multiplier: `won ? 3 : 1`
  - gold: `floor(finalScore / 3000)`
- Gold is now earned even without stage clear, but clear runs receive 3x score
  before gold conversion.
- Result screen now shows the clear multiplier and the `SCORE / 3000` gold
  conversion note instead of saying gold is clear-only.

### Code touched
- `src/utils/resultScoring.ts`
- `src/components/GameOverScreen.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.

## 2026-06-09 - v0.25.81 - Disable reload movement slowdown (Codex)

### Summary
- Removed the current reload movement slowdown by setting the reload movement
  multiplier to `1.0`.
- Kept the multiplier as a single tuning constant so it can be lowered later
  without hunting through movement code.
- Updated the reload-state type comment so it no longer says reload always
  moves at 2/3 speed.

### Code touched
- `src/store/gameStore.ts`
- `src/types/game.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.

## 2026-06-09 - v0.25.80 - Compact result screen into two columns (Codex)

### Summary
- Reworked the result screen into a compact two-column layout.
- Left column now groups run stats in a dense result grid.
- Right column now groups total score and score breakdown.
- Action buttons are now side-by-side to reduce vertical height.

### Code touched
- `src/components/GameOverScreen.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.

## 2026-06-09 - v0.25.79 - Add named treasure sprites and pickup popup (Codex)

### Summary
- Cut the supplied treasure sheet into six individual sprite assets:
  - `public/sprites/treasure-1.png` through `public/sprites/treasure-6.png`
- Removed the sheet's white number labels and purple background from the
  in-game treasure sprites.
- Applied the requested rarity order by treasure value: `4, 2, 3, 1, 5, 6`.
- Added the requested treasure names:
  - 1: ニケ像
  - 2: 宝石袋
  - 3: ダイヤのネックレス
  - 4: 高級腕時計
  - 5: 変異種血液サンプル
  - 6: 謎のコア
- Treasure pickups now use the same top acquisition popup pattern as weapon
  pickups, with a treasure-specific label and coloring.

### Code touched
- `src/store/gameStore.ts`
- `src/types/game.ts`
- `src/pixi/pixiScene.ts`
- `src/pixi/pixiTextures.ts`
- `src/components/GameHUD.tsx`
- `public/sprites/treasure-1.png`
- `public/sprites/treasure-2.png`
- `public/sprites/treasure-3.png`
- `public/sprites/treasure-4.png`
- `public/sprites/treasure-5.png`
- `public/sprites/treasure-6.png`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- Treasure score currently uses `pickup.value`, so the rarity order also affects
  result scoring weight.

## 2026-06-09 - v0.25.78 - Add run currency and result gold scoring (Codex)

### Summary
Added the first pass of the two-currency loop.
- Added in-run `strap` currency to the player.
- Enemies and breakable props can now drop strap pickups.
- Distance-rank enemies can drop treasure pickups:
  - blue/strong: 2%
  - purple/elite: 5%
  - red/danger: 10%
- Added pickup collection stats for straps and treasures.
- Added max combo tracking for result scoring.
- Added result-score calculation:
  - damage: 1 score per damage
  - max combo: 500 score each
  - treasure: 10000 score per treasure unit
  - remaining straps: 100 score each
  - clear gold: `floor(totalScore / 1000)`, awarded/displayed only on victory
- Updated result screen to show score breakdown and earned gold.
- Added HUD strap count.

### Code touched
- `src/types/game.ts`
- `src/store/gameStore.ts`
- `src/hooks/useGameLoop.ts`
- `src/pixi/pixiScene.ts`
- `src/components/GameHUD.tsx`
- `src/components/GameOverScreen.tsx`
- `src/utils/resultScoring.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- Gold persistence and permanent upgrade/shop spending are intentionally not
  connected yet. This pass only implements drops, collection, and result
  scoring.
- Treasure rates are intentionally configurable constants; if treasure becomes
  too dominant, lower blue/purple/red to 1% / 3% / 7% first.

## 2026-06-09 - v0.25.77 - Allow melee shoving Marksman traps (Codex)

### Summary
Made Marksman traps more interactable.
- A melee swing that reaches a placed trap now shoves it a short distance in
  the player's facing direction.
- Trap lifetime, hit target history, area, and target count are preserved when
  shoved.
- Added a small blue slash/ring feedback on trap shove.

### Code touched
- `src/store/gameStore.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- Tune `TRAP_MELEE_SHOVE_DISTANCE` if the shove distance feels too short or too
  strong in play.

## 2026-06-09 - v0.25.76 - Add difficulty aura and readable damage numbers (Codex)

### Summary
Improved difficulty readability and combat feedback.
- Distance-difficulty enemies now emit a lightweight body aura that matches
  their rank color: blue, purple, or red.
- The aura uses one pooled glow sprite per enemy view and a slow pulse, avoiding
  per-enemy particle emission.
- Damage numbers are larger, have stronger dark outlines, pop slightly on
  spawn, and drift upward for better visibility during combat.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- If the aura feels too strong on-device, tune `ENEMY_BODY_AURA_ALPHA` first.

## 2026-06-09 - v0.25.75 - Add distance-based difficulty and castle boss event (Codex)

### Summary
Added the first pass of the exploration-risk difficulty foundation.
- Enemy difficulty now combines existing time scaling with distance from the
  game origin.
- Staying near the start keeps the existing local difficulty curve.
- Enemies spawned farther from the origin receive extra HP/damage multipliers.
- Enemy difficulty metadata now includes distance zone, rank, and multiplier for
  future reward scaling.
- Stronger distance-zone enemies show aura light instead of changing body color:
  blue for strong, purple for elite, red for danger.
- A castle event is generated once per run at a random off-screen distance from
  the starting point.
- At 5 minutes, the castle marks itself active, flashes red, emits ground
  effects, and spawns a `giantbat` boss from its position.
- The castle now renders from the supplied transparent sprite instead of the
  temporary procedural placeholder.
- The castle also gets an off-screen edge arrow, using the same safe HUD clamp
  as world-drop ammo and weapon supplies.

### Code touched
- `public/sprites/castle.png`
- `src/types/game.ts`
- `src/utils/enemyUtils.ts`
- `src/store/gameStore.ts`
- `src/hooks/useGameLoop.ts`
- `src/pixi/pixiTextures.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- Reward scaling for distance zones is intentionally not connected yet.

## 2026-06-09 - v0.25.74 - Replace Heavy Gunner walk sprites (Codex)

### Summary
Replaced the Heavy Gunner walk sprites with the latest blue-haired heavy-gunner
sheet.
- Processed `/tmp/codex-remote-attachments/019e963d-1503-7b22-a39b-597ea91a7423/5622C7E0-49DE-4709-8F0A-2347105D6742/1-写真1.jpg`.
- Extracted three frames for `player-shotgun-walk-0.png` through
  `player-shotgun-walk-2.png`.
- Removed the purple backdrop with hard alpha only.
- Removed small neighboring-frame fragments after extraction.
- Kept the shared 128x108 frame size and 96px visible sprite-height convention
  so in-game scaling follows the existing pixel-art display rules.

### Code touched
- `public/sprites/player-shotgun-walk-0.png`
- `public/sprites/player-shotgun-walk-1.png`
- `public/sprites/player-shotgun-walk-2.png`
- `package.json`, `package-lock.json`

### Verification
- Confirmed all three Heavy Gunner frames are 128x108 RGBA.
- Confirmed zero semi-transparent pixels in all three Heavy Gunner frames.
- Confirmed zero visible purple-key pixels remain in all three Heavy Gunner
  frames.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Pushed after verification.

## 2026-06-09 - v0.25.73 - Shrink Dog and shorten grenade fuse (Codex)

### Summary
Adjusted Dog fetch display size and Heavy Gunner grenade timing.
- Reduced Dog fetch sprite display scale from `0.5` to `1 / 3`.
- Chose a one-third display scale so the 96x72 Dog sprites land near clean
  32x24 display dimensions.
- Shortened Heavy Gunner sub-weapon grenade fuse from `2500ms` to `2000ms`.

### Code touched
- `src/hooks/useGameLoop.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Pushed after verification.

## 2026-06-09 - v0.25.72 - Reduce Dog sprite scale again (Codex)

### Summary
Made the Dog fetch sprite smaller while keeping the pixel-art source untouched.
- Reduced Dog fetch sprite display scale from `0.64` to `0.5`.
- Used a clean half-size display scale to preserve hard pixel edges as much as
  possible in Pixi.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Pushed after verification.

## 2026-06-09 - v0.25.71 - Tune grenade fuse and Dog size (Codex)

### Summary
Adjusted Heavy Gunner grenade timing and Dog fetch sprite size.
- Changed Heavy Gunner sub-weapon grenade fuse from `2000ms` to `2500ms`.
- Reduced Dog fetch sprite display scale from `0.72` to `0.64`.
- Kept the Dog source sprites unchanged so the pixel-art cutout remains intact.

### Code touched
- `src/hooks/useGameLoop.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Pushed after verification.

## 2026-06-09 - v0.25.70 - Replace Marksman walk sprites (Codex)

### Summary
Replaced the Marksman walk sprites with the latest hooded rifle sheet.
- Processed `/tmp/codex-remote-attachments/019e963d-1503-7b22-a39b-597ea91a7423/455F613A-E3DC-468C-9DF6-E8086AF750A9/1-写真1.jpg`.
- Extracted three frames for `player-magnum-walk-0.png` through `player-magnum-walk-2.png`.
- Removed the purple backdrop and internal purple pixels with hard alpha only.
- Re-centered frames by head/top-band position to reduce walk-cycle head wobble.
- Kept the shared 128x108 frame size and 96px visible sprite-height convention.

### Code touched
- `public/sprites/player-magnum-walk-0.png`
- `public/sprites/player-magnum-walk-1.png`
- `public/sprites/player-magnum-walk-2.png`
- `package.json`, `package-lock.json`

### Verification
- Confirmed all three Marksman frames are 128x108 RGBA.
- Confirmed zero semi-transparent pixels in all three Marksman frames.
- Confirmed zero visible purple-key pixels remain in all three Marksman frames.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Pushed after verification.

## 2026-06-09 - v0.25.69 - Add quick-magazine crit buff (Codex)

### Summary
Added a temporary crit bonus to Scavenger's quick magazine reload skill.
- When a `quick-magazine` pickup actually reloads ammo into the active gun, the
  player gains `+10%` gun critical chance for `5s`.
- The buff uses gameTime, so it pauses with the game.
- The bonus is applied at shot creation together with weapon base crit and the
  level-up crit passive.
- Empty quick-magazine pickups that move no ammo do not grant the buff.

### Code touched
- `src/types/game.ts`
- `src/store/gameStore.ts`
- `src/utils/weaponUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Pushed after verification.

## 2026-06-09 - v0.25.68 - Replace Dog fetch animation with sprites (Codex)

### Summary
Replaced the temporary procedural Dog fetch drawing with a two-frame sprite
animation.
- Processed `/tmp/codex-remote-attachments/019e963d-1503-7b22-a39b-597ea91a7423/84043E2F-5B14-4506-A3A0-89DCB06F7D31/1-写真1.jpg`.
- Added `public/sprites/dog-walk-0.png` and `public/sprites/dog-walk-1.png`.
- Removed the purple backdrop and enclosed purple holes around the legs with
  hard alpha only.
- Added the dog sprites to Pixi texture preloading.
- Dog fetch effects now render a sprite with a small ground shadow and 2-frame
  walk animation instead of the temporary blocky Graphics dog.

### Code touched
- `public/sprites/dog-walk-0.png`
- `public/sprites/dog-walk-1.png`
- `src/pixi/pixiTextures.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- Confirmed both dog frames are 96x72 RGBA.
- Confirmed zero semi-transparent pixels in both dog frames.
- Confirmed zero visible purple-key pixels remain in both dog frames.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Pushed after verification.

## 2026-06-09 - v0.25.67 - Double heavy grenade knockback (Codex)

### Summary
Increased Heavy Gunner sub-weapon grenade knockback distance.
- Changed `HEAVY_GRENADE_KNOCKBACK_MULT` from `1.8` to `3.6`.
- This affects the Heavy Gunner thrown grenade blast only.
- Bullet knockback, shotgun pellet knockback, melee knockback, and grenade
  launcher splash damage are unchanged.

### Code touched
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Pushed after verification.

## 2026-06-09 - v0.25.66 - Swap Striker and Scavenger character art (Codex)

### Summary
Swapped the visible character art for Striker and Scavenger.
- Striker (`rogue`) now uses the Scavenger sprite set.
- Scavenger (`necromancer`) now uses the Striker sprite set.
- Updated both the character selection cards and in-game Pixi player rendering.
- Gameplay class ids, stats, loadouts, and sub-weapons are unchanged.

### Code touched
- `src/components/MainMenu.tsx`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-09 - v0.25.65 - Replace Marksman hooded walk sprites (Codex)

### Summary
Replaced the Marksman walk sprites with the new hooded marksman sheet.
- Processed `/tmp/codex-remote-attachments/019e963d-1503-7b22-a39b-597ea91a7423/C9F3F49A-38CD-4174-BDE1-6CB0BF5A847A/1-写真1.jpg`.
- Extracted three frames for `player-magnum-walk-0.png` through `-2.png`.
- Removed the connected purple backdrop with hard alpha only.
- Re-centered the frames by head/top-band position to reduce walk-cycle head wobble.
- Kept the shared 128x108 frame size and 96px visible sprite-height convention.

### Code touched
- `public/sprites/player-magnum-walk-0.png`
- `public/sprites/player-magnum-walk-1.png`
- `public/sprites/player-magnum-walk-2.png`
- `package.json`, `package-lock.json`

### Verification
- Confirmed all three Marksman frames are 128x108 RGBA.
- Confirmed zero semi-transparent pixels in all three Marksman frames.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.64 - Bust class-select sprite cache (Codex)

### Summary
Fixed stale character art on the class selection screen.
- Added the app version query string to `MainMenu` character sprite URLs.
- The Pixi/gameplay renderer already used versioned sprite URLs via
  `spritePath()`, but the React class cards used direct image URLs and could
  keep old cached PNGs.
- This makes class selection art refresh with each version bump.

### Code touched
- `src/components/MainMenu.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Pushed because the issue is visible on the GitHub Pages environment.

## 2026-06-08 - v0.25.63 - Match gameplay player scale to class cards (Codex)

### Summary
Adjusted gameplay player rendering to better match the character selection
card display.
- Changed `PLAYER_VISUAL_SCALE` from `2.6` to `2.3`.
- With the current 128x108 player frames, this makes the central gameplay
  player display height nearly identical to the class-card image height.
- Re-centered Marksman and Striker walk frames by head-position instead of
  full-frame/bounding-box center so their heads no longer sway left/right as
  much during the walk cycle.
- Kept hard-alpha sprites; no semi-transparent pixels were introduced.

### Code touched
- `public/sprites/player-magnum-walk-0.png`
- `public/sprites/player-magnum-walk-1.png`
- `public/sprites/player-magnum-walk-2.png`
- `public/sprites/player-striker-walk-0.png`
- `public/sprites/player-striker-walk-1.png`
- `public/sprites/player-striker-walk-2.png`
- `src/pixi/renderSpec.ts`
- `package.json`, `package-lock.json`

### Verification
- Gameplay center-scale target: class card `86/128 = 0.671875`, gameplay
  player `28*2.3/96 = 0.670833`.
- Confirmed Marksman head centers now stay around x=64px.
- Confirmed Striker head centers now stay around x=64px.
- Confirmed zero semi-transparent pixels in adjusted frames.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.62 - Replace Marksman sprites and retune player scale (Codex)

### Summary
Replaced the Marksman in-game walk sprites and adjusted the gameplay player
display size after local feedback.
- Processed `/Users/tanity/Downloads/4D2D71E4-AFBE-4BF8-B487-836B1E4D0EB1.PNG`.
- Extracted three frames for `player-magnum-walk-0.png` through `-2.png`.
- Removed the connected purple backdrop with hard alpha only.
- Kept the existing `0 -> 1 -> 2 -> 1` Marksman animation sequence.
- Adjusted `PLAYER_VISUAL_SCALE` from `1.5` to `2.6` so in-game characters sit
  closer to the character-select card size.

### Code touched
- `public/sprites/player-magnum-walk-0.png`
- `public/sprites/player-magnum-walk-1.png`
- `public/sprites/player-magnum-walk-2.png`
- `src/pixi/renderSpec.ts`
- `package.json`, `package-lock.json`

### Verification
- Confirmed all three Marksman frames are 128x108 RGBA.
- Confirmed zero semi-transparent pixels in all three Marksman frames.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.61 - Replace Heavy Gunner walk sprites (Codex)

### Summary
Replaced the Heavy Gunner in-game walk sprites with the latest supplied sheet.
- Processed `/Users/tanity/Downloads/94326402-8E4B-4E51-9365-C25966311941.PNG`.
- Extracted three frames for `player-shotgun-walk-0.png` through `-2.png`.
- Removed the connected purple backdrop with hard alpha only.
- Kept the existing `0 -> 1 -> 2 -> 1` Heavy Gunner animation sequence.
- Kept the shared 128x108 frame size and 96px visible sprite-height convention.

### Code touched
- `public/sprites/player-shotgun-walk-0.png`
- `public/sprites/player-shotgun-walk-1.png`
- `public/sprites/player-shotgun-walk-2.png`
- `package.json`, `package-lock.json`

### Verification
- Confirmed all three frames are 128x108 RGBA.
- Confirmed zero semi-transparent pixels in all three frames.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.60 - Halve in-game player display scale (Codex)

### Summary
Reduced the gameplay player sprite size further after local visual feedback.
- Changed `PLAYER_VISUAL_SCALE` from `3.0` to `1.5`.
- This affects only the in-game foot-anchored player drawing box.
- Character selection layout, gameplay collision, movement speed, and melee
  range are unchanged.

### Code touched
- `src/pixi/renderSpec.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.59 - Reduce in-game player display scale (Codex)

### Summary
Adjusted the gameplay-only player sprite size after the crisp sprite rebuild.
- Reduced `PLAYER_VISUAL_SCALE` from `3.45` to `3.0`.
- Keeps player collision, movement speed, melee range, and class selection
  layout unchanged.
- The Pixi player draw path still uses uniform X/Y scale, so this does not add
  vertical stretching or any new masking/filter trick.

### Code touched
- `src/pixi/renderSpec.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.
- If the sprite still feels tall in gameplay, tune `PLAYER_VISUAL_SCALE` again;
  avoid non-uniform Y scaling unless the user explicitly wants squash/stretch.

## 2026-06-08 - v0.25.58 - Rebuild player sprites for crisp dot rendering (Codex)

### Summary
Rebuilt all current player class walk sprites for sharper in-game dot rendering.
- The previous sprites preserved huge source images, then Pixi scaled them down
  heavily in-game. That minification crushed the dot texture.
- Re-extracted Marksman, Heavy Gunner, Striker, and Scavenger frames from the
  latest supplied source sheets.
- Rebuilt each frame as a game-display-size 128x108 PNG with a 96px visible
  sprite height.
- Used nearest-neighbor resizing and hard alpha keying so the rendered sprites
  have no semi-transparent edge blur.
- Increased `PLAYER_VISUAL_SCALE` so these 96px player sprites display near
  their source pixel size instead of being strongly minified.
- Kept the `0 -> 1 -> 2 -> 1` animation sequence for all four classes.

### Code touched
- `public/sprites/player-magnum-walk-0.png`
- `public/sprites/player-magnum-walk-1.png`
- `public/sprites/player-magnum-walk-2.png`
- `public/sprites/player-shotgun-walk-0.png`
- `public/sprites/player-shotgun-walk-1.png`
- `public/sprites/player-shotgun-walk-2.png`
- `public/sprites/player-striker-walk-0.png`
- `public/sprites/player-striker-walk-1.png`
- `public/sprites/player-striker-walk-2.png`
- `public/sprites/player-scavenger-walk-0.png`
- `public/sprites/player-scavenger-walk-1.png`
- `public/sprites/player-scavenger-walk-2.png`
- `src/pixi/renderSpec.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- Confirmed all rebuilt player walk frames are 128x108 RGBA.
- Confirmed rebuilt frames have hard alpha only, with zero semi-transparent pixels.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.
- This intentionally changes player visual scale only; gameplay collision boxes
  remain unchanged.

## 2026-06-08 - v0.25.57 - Replace Marksman walk cycle (Codex)

### Summary
Updated the Marksman player animation.
- Processed `/Users/tanity/Downloads/E92EB5D4-AE38-465D-8FFB-C69778EFA6AB.PNG`.
- Extracted three transparent frames without resampling the source pixels.
- Marksman now uses `player-magnum-walk-0.png` through `-2.png`.
- Marksman playback now loops as `0 -> 1 -> 2 -> 1`.
- Added a Marksman-specific sprite base height so the larger source can stay
  uncropped without changing gameplay scale.

### Code touched
- `public/sprites/player-magnum-walk-0.png`
- `public/sprites/player-magnum-walk-1.png`
- `public/sprites/player-magnum-walk-2.png`
- `src/pixi/pixiTextures.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- Processed frame PNGs are RGBA with transparent backgrounds.
- Confirmed Marksman frames are 430x490.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.56 - Replace Scavenger walk cycle (Codex)

### Summary
Updated the Scavenger player animation.
- Processed `/Users/tanity/Downloads/74737E6E-2E78-4176-BC6A-70EDE7483665.PNG`.
- Extracted three transparent frames without resampling the source pixels.
- Scavenger now uses `player-scavenger-walk-0.png` through `-2.png`.
- Scavenger playback now loops as `0 -> 1 -> 2 -> 1`.
- Added a Scavenger-specific sprite base height so the larger source can stay
  uncropped without changing gameplay scale.

### Code touched
- `public/sprites/player-scavenger-walk-0.png`
- `public/sprites/player-scavenger-walk-1.png`
- `public/sprites/player-scavenger-walk-2.png`
- `src/pixi/pixiTextures.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- Processed frame PNGs are RGBA with transparent backgrounds.
- Confirmed Scavenger frames are 400x470.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.55 - Replace Heavy Gunner and Striker walk cycles (Codex)

### Summary
Updated Heavy Gunner and Striker player animations.
- Processed `/Users/tanity/Downloads/FD56B342-AC47-4A22-9A95-426A21574DED.PNG` for Heavy Gunner.
- Processed `/Users/tanity/Downloads/EA23808E-F62E-45E8-9C7B-219CC68CD4A8.jpg` for Striker.
- Extracted three transparent frames for each class without resampling the
  source pixels.
- Heavy Gunner now uses `player-shotgun-walk-0.png` through `-2.png`.
- Striker now uses `player-striker-walk-0.png` through `-2.png`.
- Heavy Gunner and Striker playback now loops as `0 -> 1 -> 2 -> 1`.
- Added class-specific sprite base heights so the larger Heavy Gunner source
  can stay uncropped without changing gameplay scale.

### Code touched
- `public/sprites/player-shotgun-walk-0.png`
- `public/sprites/player-shotgun-walk-1.png`
- `public/sprites/player-shotgun-walk-2.png`
- `public/sprites/player-striker-walk-0.png`
- `public/sprites/player-striker-walk-1.png`
- `public/sprites/player-striker-walk-2.png`
- `src/pixi/pixiTextures.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- Processed frame PNGs are RGBA with transparent backgrounds.
- Confirmed Heavy Gunner frames are 350x480 and Striker frames are 270x410.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.54 - Explicitly clean up Pixi ticker on replay (Codex)

### Summary
Reduced the likely replay-after-first-run slowdown.
- `PixiStage` now stores the Pixi ticker callback and removes it explicitly on
  unmount.
- The cleanup also clears the host element children after destroying the Pixi
  application, so stale canvases cannot remain attached.
- This targets the symptom where the first play after Safari restart is light,
  but subsequent plays in the same tab feel heavier.

### Code touched
- `src/pixi/PixiStage.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.
- If the issue persists, add a tiny debug counter for live PixiStage instances
  and active ticker callbacks to confirm whether a renderer loop is still
  leaking.

## 2026-06-08 - v0.25.53 - Restore projectile collision freshness (Codex)

### Summary
Fixed a regression from the game-loop performance cleanup.
- Projectile/enemy collision detection now reads fresh `projectiles` and
  `enemies` after movement updates in the same frame.
- Hit processing now looks up projectile and enemy data from that same fresh
  snapshot instead of the older frame-start arrays.
- This keeps the v0.25.52 React churn reduction while restoring gun hit
  detection.

### Code touched
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.52 - Reduce game-loop React churn (Codex)

### Summary
Reduced a likely runtime performance issue in the main game loop.
- Removed high-frequency React subscriptions from `useGameLoop` for `player`,
  `enemies`, `projectiles`, `pickups`, `breakableProps`, `inputState`,
  `swipeDirection`, `gameBounds`, `gameTime`, and `isPaused`.
- The simulation loop now reads the latest Zustand state directly inside each
  animation frame.
- This avoids re-rendering/recreating the RAF effect whenever gameplay arrays
  change, which became expensive after more enemies, pickups, effects, and
  sub-weapons were added.
- Gameplay behavior is intended to remain unchanged.

### Code touched
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.
- If Safari still feels heavy after this, next check Pixi filter cost and effect
  counts rather than texture cache growth.

## 2026-06-08 - v0.25.51 - Replace Striker walk sheet second revision (Codex)

### Summary
Updated the Striker six-frame walk sprites with the latest supplied sheet.
- Processed `/Users/tanity/Downloads/EA23808E-F62E-45E8-9C7B-219CC68CD4A8.PNG`.
- Detected each sprite cluster after purple-key transparency, then rebuilt `player-striker-walk-0.png` through `-5.png`.
- Rebuilt the frames on a taller transparent canvas so the 398px-tall source pixels are not cropped or resampled.
- Kept the current walk animation tempo and six-frame playback code unchanged.
- Added a class-sprite base-height constant so the taller Striker PNGs preserve the existing in-game scale without flattening the source pixels.

### Code touched
- `public/sprites/player-striker-walk-0.png`
- `public/sprites/player-striker-walk-1.png`
- `public/sprites/player-striker-walk-2.png`
- `public/sprites/player-striker-walk-3.png`
- `public/sprites/player-striker-walk-4.png`
- `public/sprites/player-striker-walk-5.png`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- Processed frame PNGs are RGBA with transparent backgrounds.
- Confirmed every Striker frame keeps the full 398px source-height sprite inside a 270x410 canvas.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.50 - Slow player walk animation a touch more (Codex)

### Summary
Slightly slowed the player walk animation again.
- Increased `PLAYER_WALK_CYCLE_MS` from `420` to `460`.
- Movement speed and gameplay physics are unchanged.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.49 - Slightly slow player walk animation (Codex)

### Summary
Adjusted the player walk animation tempo.
- Increased `PLAYER_WALK_CYCLE_MS` from `360` to `420`.
- This makes the six-frame Striker walk sheet advance a little more calmly without changing player movement speed.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.48 - Replace Striker walk sheet revision (Codex)

### Summary
Updated the Striker six-frame walk sprites with the revised sheet.
- Processed `/Users/tanity/Downloads/D31851F7-F5F1-40B0-9E1D-37FE3DCBB40A.PNG`.
- Detected each sprite cluster after purple-key transparency, avoiding adjacent-frame bleed.
- Rebuilt:
  - `public/sprites/player-striker-walk-0.png`
  - `public/sprites/player-striker-walk-1.png`
  - `public/sprites/player-striker-walk-2.png`
  - `public/sprites/player-striker-walk-3.png`
  - `public/sprites/player-striker-walk-4.png`
  - `public/sprites/player-striker-walk-5.png`
- Kept the existing six-frame Striker animation code path unchanged.

### Code touched
- `public/sprites/player-striker-walk-0.png`
- `public/sprites/player-striker-walk-1.png`
- `public/sprites/player-striker-walk-2.png`
- `public/sprites/player-striker-walk-3.png`
- `public/sprites/player-striker-walk-4.png`
- `public/sprites/player-striker-walk-5.png`
- `package.json`, `package-lock.json`

### Verification
- Processed frame PNGs are RGBA with transparent backgrounds.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.47 - Replace Striker with 6-frame walk sheet (Codex)

### Summary
Updated the Striker player animation.
- Processed `/Users/tanity/Downloads/52A72CB6-BAFC-4601-AB43-E569010D6709.PNG`.
- Split the sheet into six frames, keyed out the purple background, and wrote:
  - `public/sprites/player-striker-walk-0.png`
  - `public/sprites/player-striker-walk-1.png`
  - `public/sprites/player-striker-walk-2.png`
  - `public/sprites/player-striker-walk-3.png`
  - `public/sprites/player-striker-walk-4.png`
  - `public/sprites/player-striker-walk-5.png`
- Pixi texture preload now loads all six Striker frames.
- Striker walk animation now plays all six frames in order.
- Other player classes remain on their existing two-frame cycles.

### Code touched
- `public/sprites/player-striker-walk-0.png`
- `public/sprites/player-striker-walk-1.png`
- `public/sprites/player-striker-walk-2.png`
- `public/sprites/player-striker-walk-3.png`
- `public/sprites/player-striker-walk-4.png`
- `public/sprites/player-striker-walk-5.png`
- `src/pixi/pixiTextures.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- Processed frame PNGs are RGBA with transparent backgrounds.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.46 - Animate Dog fetch behavior (Codex)

### Summary
Changed `ドッグ` from instant pickup into a visible fetch action.
- Added a temporary pixel-dog renderer using Pixi `Graphics`.
- Dog now runs from the player to the selected pickup, collects it on arrival,
  then returns to the player.
- The next pickup countdown starts only after Dog has returned.
- Cooldowns changed to:
  - Lv1: `3s`
  - Lv2: `2s`
  - Lv3: `1s`
- Dog still skips `quick-magazine` and full-HP health pickups.

### Code touched
- `src/types/game.ts`
- `src/hooks/useGameLoop.ts`
- `src/pixi/pixiScene.ts`
- `src/utils/upgradeUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.45 - Add common Dog sub-weapon pickup helper (Codex)

### Summary
Added common sub-weapon `ドッグ`.
- Dog can appear as a level-up sub-weapon option for every character.
- At intervals, Dog picks one random eligible item currently inside the visible
  screen.
- Dog does not pick sub-weapon generated `quick-magazine` pickups.
- Dog skips health pickups when the player is already at full health.
- Lv scaling currently shortens the pickup interval:
  - Lv1: `7s`
  - Lv2: `5s`
  - Lv3: `3.5s`
- Added a small trail/burst/ring and matching pickup SFX when Dog fetches an
  item.

### Code touched
- `src/types/game.ts`
- `src/utils/upgradeUtils.ts`
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.44 - Start preload at app launch (Codex)

### Summary
Moved the Pixi texture preload earlier in the app lifecycle.
- `ensureTextures()` now starts immediately when `App` mounts.
- Character-select loading still waits for the same preload promise if it has
  not finished yet.
- The post-selection loading screen keeps its short minimum display time, but
  the heavy asset warmup is no longer first kicked off after selecting a class.

### Code touched
- `src/App.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.43 - Tune Hunting charge times (Codex)

### Summary
Adjusted Striker `ハンティング` charge timing.
- Lv1 charge time: `2.5s`
- Lv2 charge time: `2.0s`
- Lv3 charge time: `1.5s`
- Moved Hunting charge timing into the shared Hunting config so game logic and
  upgrade card text stay aligned.

### Code touched
- `src/config/hunting.ts`
- `src/hooks/useGameLoop.ts`
- `src/utils/upgradeUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.42 - Tighten Hunting high-level range (Codex)

### Summary
Adjusted Striker `ハンティング` range scaling after feel testing.
- Lv1 remains `+18px`.
- Lv2 reduced from `+28px` to `+24px`.
- Lv3 reduced from `+40px` to `+34px`.
- Hit detection, charged range circle, attack crest, and card text all continue
  to share the same range table.

### Code touched
- `src/config/hunting.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.41 - Show Hunting charged range circle (Codex)

### Summary
Improved Striker `ハンティング` charged readability.
- When Hunting is fully charged, a faint blue melee-range circle is shown
  around the player.
- The circle uses the same level-scaled melee radius as the actual hit
  detection and the attack crest.
- The existing attack crest remains the active melee swing visual.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.40 - Scale Hunting range by level (Codex)

### Summary
Adjusted Striker `ハンティング` level scaling.
- Hunting melee range bonus now grows by level:
  - Lv1: `+18px`
  - Lv2: `+28px`
  - Lv3: `+40px`
- The hit detection and Pixi crest/ring rendering now use the same level-based
  radius.
- Upgrade card text now shows the input time and current range bonus.

### Code touched
- `src/config/hunting.ts`
- `src/store/gameStore.ts`
- `src/pixi/pixiScene.ts`
- `src/utils/upgradeUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.39 - Start Hunting charge on touch input (Codex)

### Summary
Adjusted Striker `ハンティング` charge feel.
- Charge timing now starts as soon as the touch joystick is pressed.
- The timer no longer depends on actual movement, so dead-zone touch, blocked
  movement, or slow initial movement do not delay the charge start.
- Keyboard movement input also counts as active input.
- Fully charged Hunting still stays ready until melee/counter use.

### Code touched
- `src/store/gameStore.ts`
- `src/components/VirtualJoystick.tsx`
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.38 - Shorten Hunting default charge (Codex)

### Summary
Adjusted Striker `ハンティング` charge timing.
- Lv1/default charge time changed from `5s` to `3s`.
- Lv2 charge time is now `2s`.
- Lv3 charge time is now `1s`.
- Upgrade card descriptions now reflect the shorter timings.

### Code touched
- `src/hooks/useGameLoop.ts`
- `src/utils/upgradeUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.37 - Keep Hunting charge until melee use (Codex)

### Summary
Adjusted Striker `ハンティング` charge behavior.
- Lv1/default charge time remains `5s`.
- Once Hunting is fully charged, the charge stays ready even if the player
  stops walking.
- The charge is still consumed only when the melee/counter swing is triggered.

### Code touched
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.36 - Add Striker Hunting sub-weapon (Codex)

### Summary
Added Striker `ハンティング` as a charge-based sub-weapon.
- Offered only to Striker (`rogue`) through level-up cards.
- Walking continuously charges the next melee attack.
  - Lv1: `5s`
  - Lv2: `4s`
  - Lv3: `3s`
- When charged, the next melee swing uses an expanded melee target range.
- The charge is consumed when the melee/counter swing is triggered.
- Player ground light shifts from warm amber to blue while Hunting is charged.

### Code touched
- `src/types/game.ts`
- `src/store/gameStore.ts`
- `src/utils/upgradeUtils.ts`
- `src/hooks/useGameLoop.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.35 - Move quick magazine skill to Scavenger (Codex)

### Summary
Adjusted sub-weapon class ownership.
- `クイックマガジン` is now offered to Scavenger (`necromancer`) instead of
  Striker (`rogue`).
- Skill behavior is unchanged.

### Code touched
- `src/utils/upgradeUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.34 - Prevent instant pickup during throw arcs (Codex)

### Summary
Fixed quick magazine pickup timing.
- Thrown pickups are no longer collectible until their throw animation has
  completed.
- This prevents Striker quick magazines from being picked up instantly at the
  player's feet on spawn.

### Code touched
- `src/utils/collisionUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.33 - Tighten pickup collection range (Codex)

### Summary
Adjusted shared item pickup feel.
- Reduced the common pickup collision padding from `24px` to `16px`.
- This affects gems, ammo, weapon drops, quick magazines, and other pickups
  uniformly.

### Code touched
- `src/utils/collisionUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.32 - Fix quick magazine throw freeze (Codex)

### Summary
Fixed a likely runtime freeze when Striker quick magazine appears.
- Removed Canvas-style `Graphics.save/rotate/restore` calls from Pixi pickup
  drawing.
- Kept the throw arc and added a small squash pulse so the magazine still
  reads as popping out without unsafe Graphics transforms.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.31 - Let melee detonate grenades (Codex)

### Summary
Added melee interaction for Heavy Gunner grenades.
- Grenades inside melee range are now treated as hit by the melee swing.
- A hit grenade immediately expires its fuse, so the existing grenade blast
  damage, VFX, sound, and knockback logic runs on the next game-loop pass.

### Code touched
- `src/store/gameStore.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.30 - Animate Striker magazine throw (Codex)

### Summary
Improved Striker quick magazine feel.
- Added short pickup throw metadata so quick magazines move from the player to
  their landing point instead of appearing instantly.
- Pickup collision follows the animated throw position.
- Pixi pickup rendering follows the same animated position and spins the
  magazine during the throw for a small "pop" motion.

### Code touched
- `src/types/game.ts`
- `src/utils/collisionUtils.ts`
- `src/hooks/useGameLoop.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.29 - Add grenade blast knockback (Codex)

### Summary
Confirmed and adjusted Heavy Gunner grenade behavior.
- Heavy Gunner grenade remains non-critical.
- Added knockback to enemies hit by the grenade blast.
- Boss/elite immovable exceptions are kept aligned with bullet knockback.

### Code touched
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.28 - Set grenade fuse to 2 seconds (Codex)

### Summary
Adjusted Heavy Gunner grenade timing after local feel testing.
- Changed grenade fuse from `3000ms` to `2000ms`.

### Code touched
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.27 - Set grenade fuse to 3 seconds (Codex)

### Summary
Adjusted Heavy Gunner grenade timing after local feel testing.
- Changed grenade fuse from `4000ms` to `3000ms`.

### Code touched
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.26 - Add Striker quick magazine sub-weapon (Codex)

### Summary
Added the first Striker sub-weapon and adjusted grenade timing.
- Heavy Gunner grenade fuse extended to `4000ms`.
- Added Striker `クイックマガジン` sub-weapon card.
  - Lv1 cooldown: `10s`
  - Lv2 cooldown: `8s`
  - Lv3 cooldown: `6s`
- When the active gun is not full and reserve ammo exists, the Striker drops
  one nearby magazine pickup.
- Picking up the magazine instantly reloads the active gun by moving ammo from
  reserve into the magazine with no reload delay.
- Only one quick magazine can exist at a time to avoid pickup clutter.

### Code touched
- `src/types/game.ts`
- `src/utils/upgradeUtils.ts`
- `src/hooks/useGameLoop.ts`
- `src/store/gameStore.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.25 - Tune grenade blast and trap crit bonus (Codex)

### Summary
Adjusted the sub-weapon follow-up balance.
- Slightly reduced Heavy Gunner grenade blast radius from `72` to `66`.
- Added a `+10%` critical chance bonus against enemies currently rooted by
  the Marksman trap.
  - The trap itself still does not apply critical stun.
  - The bonus is checked when bullets or melee hits land on the rooted enemy.

### Code touched
- `src/hooks/useGameLoop.ts`
- `src/store/gameStore.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.24 - Fix grenade spread and trap root behavior (Codex)

### Summary
Adjusted the first sub-weapon balance pass from local testing.
- Heavy Gunner grenades now split into clearly different roll directions.
  - Lv1: one grenade toward the target.
  - Lv2: two grenades split left/right.
  - Lv3: three grenades roll in a surrounding pattern around the player.
- Marksman trap no longer uses critical stun.
  - Added a trap-only `rootUntil` state that stops movement without making
    the enemy a finisher/critical target.
  - Lv2+ traps now stay active until their max target count is reached or
    the trap duration expires.
  - Trap hit tracking prevents the same enemy from consuming multiple target
    slots from one trap.

### Code touched
- `src/types/game.ts`
- `src/store/gameStore.ts`
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless the user explicitly asks for GitHub
  handoff again.

## 2026-06-08 - v0.25.23 - Add sub-weapon leveling and Marksman trap (Codex)

### Summary
Expanded the temporary sub-weapon card system.
- Added `subWeaponLevels` to player state.
- Sub-weapon cards can now upgrade existing sub-weapons up to level 3.
- Heavy Gunner grenade now scales by level:
  - Lv1: 1 direction
  - Lv2: 2 directions
  - Lv3: 3 directions
- Added Marksman `トラップ` card.
  - Places a trap at the player's feet on cooldown.
  - Enemies stepping on it are stopped for `3s`.
  - Trap level increases radius and max affected enemies up to 3.
- Trap projectiles are excluded from normal projectile/enemy collision and are
  consumed by their own trigger logic.

### Code touched
- `src/types/game.ts`
- `src/utils/upgradeUtils.ts`
- `src/utils/collisionUtils.ts`
- `src/store/gameStore.ts`
- `src/hooks/useGameLoop.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current Marksman trap test values:
  - cooldown: `6500ms`
  - duration: `9000ms`
  - stun: `3000ms`
  - radius by level: `34 / 42 / 50`
  - max affected enemies by level: `1 / 2 / 3`
- Sub-weapons are still intentionally lightweight until the final decision
  between character skills and equipment is made.

## 2026-06-08 - v0.25.22 - Shorten grenade roll and add hop motion (Codex)

### Summary
Adjusted the Heavy Gunner grenade behavior.
- Reduced grenade travel distance by shortening fuse time and lowering roll
  speed.
- Added grenade-only rolling drag so it slows down before detonation.
- Added a Pixi hop/shadow treatment so the grenade reads as bouncing from the
  player's feet before exploding.
- Wall bounce behavior remains intact for tree trunks and intact torches.

### Code touched
- `src/hooks/useGameLoop.ts`
- `src/store/gameStore.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current Heavy Gunner grenade test values:
  - cooldown: `5000ms`
  - fuse: `1050ms`
  - initial roll speed: `118`
  - roll drag: `1.45`
  - damage: `42`
  - radius: `72`

## 2026-06-08 - v0.25.21 - Add Heavy Gunner grenade sub-weapon card (Codex)

### Summary
Added the first test sub-weapon skill as a level-up card.
- Heavy Gunner can now roll a `手榴弾` card in the level-up menu.
- Once learned, the skill has unlimited uses with a `5s` game-time cooldown.
- The grenade rolls toward the nearest enemy, waits `1.2s`, then explodes for
  small-area damage.
- Grenades do not explode on contact with enemies.
- Grenades bounce off tree trunks and intact torches instead of passing through
  them.

### Code touched
- `src/types/game.ts`
- `src/utils/upgradeUtils.ts`
- `src/utils/collisionUtils.ts`
- `src/store/gameStore.ts`
- `src/hooks/useGameLoop.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current test values:
  - cooldown: `5000ms`
  - fuse: `1200ms`
  - damage: `42`
  - radius: `72`
  - roll speed: `150`
- Sub-weapons are currently stored on `player.subWeapons` and cooldowns on
  `player.subWeaponCooldowns`. This is intentionally lightweight while the
  final "character skill vs equipment" decision is still open.

## 2026-06-08 - v0.25.20 - Add class HP differences and extend combo window (Codex)

### Summary
Made character HP differences affect actual gameplay and extended combo timing.
- Added `maxHp` to `PLAYER_PROFILES`.
- `resetGame` now initializes player `health` / `maxHealth` from the selected
  character profile.
- Starting HP:
  - Heavy Gunner: `130`
  - Marksman: `100`
  - Striker: `105`
  - Scavenger: `120`
- Melee finisher / counter combo window extended from `5s` to `7s`.

### Code touched
- `src/data/playerProfiles.ts`
- `src/store/gameStore.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- `PLAYER_BASE_HP` remains as the generic fallback/default initial store value;
  run-start HP now comes from `PLAYER_PROFILES`.

## 2026-06-08 - v0.25.19 - Fix settings scroll and retune shotgun spread (Codex)

### Summary
Fixed the start-menu settings panel scrolling and retuned shotgun spread.
- Main menu now uses a top-aligned vertical scroll container so expanded
  settings remain reachable on mobile.
- Added extra bottom safe-area padding for the settings/start section.
- Shotgun spread cone by tier is now:
  - T1: `1.00`
  - T2: `0.70`
  - T3: `0.36`

### Code touched
- `src/components/MainMenu.tsx`
- `src/utils/weaponUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If the settings panel grows again, keep the root menu as a scroll container
  and avoid vertical centering on mobile-height layouts.

## 2026-06-08 - v0.25.18 - Tune shotgun spread tiers (Codex)

### Summary
Adjusted shotgun spread by tier.
- T1 spread cone: `0.70`
- T2 spread cone: `0.50`
- T3 spread cone: `0.34`

### Code touched
- `src/utils/weaponUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Loading currently preloads Pixi texture assets through `ensureTextures()`.
  Those textures are cached in memory by Pixi and can also use the browser HTTP
  cache. Audio is warmed by the audio manager when gameplay/audio activates, not
  as a hard loading-screen completion gate.

## 2026-06-08 - v0.25.17 - Add post-character loading screen (Codex)

### Summary
Added a loading step after character selection and before gameplay starts.
- `App` now transitions `menu` -> `loading` -> `playing`.
- The loading screen shows the selected survivor name and a compact animated
  loading treatment.
- Pixi textures are warmed during loading via `ensureTextures()`.
- Loading has a short minimum display time so the transition does not flicker.

### Code touched
- `src/App.tsx`
- `src/components/LoadingScreen.tsx`
- `src/types/game.ts`
- `src/index.css`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Minimum loading display time is controlled by `LOADING_MIN_MS` in
  `src/App.tsx`.

## 2026-06-08 - v0.25.16 - Strengthen combo count pop (Codex)

### Summary
Refined the combo HUD treatment.
- Combo count is larger.
- `COMBO` label is slightly smaller and dimmer.
- Combo glow is flatter and softer, spreading more horizontally with less
  concentrated brightness.
- Combo count pop animation is longer and more exaggerated so count changes read
  as a visible bounce.

### Code touched
- `src/components/GameHUD.tsx`
- `src/index.css`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The combo bounce is controlled by `.combo-count-pop` and
  `@keyframes combo-count-pop` in `src/index.css`.

## 2026-06-08 - v0.25.15 - Tier shotgun spread and combo pop (Codex)

### Summary
Adjusted shotgun spread by tier and refined combo display.
- Shotgun spread is now tier-specific:
  - T1: `0.40rad`
  - T2: `0.36rad`
  - T3: `0.34rad`
- Combo display now separates the count from the `COMBO` label.
- `COMBO` text is smaller.
- Combo number pops in with a short bounce animation whenever the count changes.

### Code touched
- `src/utils/weaponUtils.ts`
- `src/components/GameHUD.tsx`
- `src/index.css`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Shotgun spread is controlled by `SHOTGUN_SPREAD_CONE_RAD_BY_TIER` in
  `src/utils/weaponUtils.ts`.

## 2026-06-08 - v0.25.14 - Add weapon tier pickup colors and shotgun shove tuning (Codex)

### Summary
Improved weapon pickup readability and adjusted shotgun knockback feel.
- Weapon pickup popup now prefixes acquired guns with `T1` / `T2` / `T3`.
- Weapon pickup popup text color now changes by tier:
  - T1: white
  - T2: blue
  - T3: gold
- Duplicate same/lower-tier gun pickups also show the tier prefix before the
  ammo conversion text.
- Renamed weapons:
  - `拳銃` -> `ハンドガン`
  - `二丁拳銃` -> `二丁ハンドガン`
  - `鉈` -> `ダガー`
  - `マチェーテ` -> `ファイティングナイフ`
- Shotgun projectile knockback now applies a small shotgun-only boost on top of
  the existing same-frame pellet hit count multiplier, still capped at 3x.

### Code touched
- `src/store/gameStore.ts`
- `src/components/GameHUD.tsx`
- `src/hooks/useGameLoop.ts`
- `src/utils/weaponUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Shotgun spread is controlled by `SHOTGUN_SPREAD_CONE_RAD = 0.34` in
  `src/utils/weaponUtils.ts`. It is a fixed total cone width shared by all
  shotgun tiers; higher tiers add pellets inside the same cone.

## 2026-06-08 - v0.25.13 - Add debug ammo pickup settings (Codex)

### Summary
Adjusted ammo-box values and exposed them on the start-screen debug settings.
- Default ammo-box pickup amounts changed to:
  - Handgun: +40
  - Shotgun: +10
  - Rifle/Magnum: +20
- Start settings now include debug inputs for each ammo-box amount.
- Duplicate same/lower-tier gun pickups now use the configured amount ×2.
- Debug settings persist in localStorage alongside the melee ammo drop rate.

### Code touched
- `src/store/gameStore.ts`
- `src/components/MainMenu.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The melee ammo drop rate and ammo-box amount settings are debug controls and
  should be removed from the public start menu before release.

## 2026-06-08 - v0.25.12 - Lower heavy-gunner displayed health (Codex)

### Summary
Adjusted the start-menu class stat display.
- Heavy Gunner health display changed from `High` to `Medium`.
- Confirmed current ammo pickup values:
  - Ammo box: handgun +15, shotgun +6, rifle/magnum +4.
  - Duplicate same/lower-tier gun pickup: handgun +30, shotgun +12,
    rifle/magnum +8.

### Code touched
- `src/components/MainMenu.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- This change updates the class-select display only. Current gameplay HP still
  starts from the shared `PLAYER_BASE_HP` unless class-specific HP is added.

## 2026-06-08 - v0.25.11 - Use character sprites in start menu (Codex)

### Summary
Reworked the start-character selection cards to use the actual class sprites.
- Removed the lucide class icons from the character cards.
- Each class card now shows the corresponding standing sprite:
  - `warrior`: shotgun/heavy-gunner female
  - `mage`: marksman/blond rifle
  - `rogue`: striker/white-haired handgun
  - `necromancer`: scavenger
- Added a small character stage, class-colored glow, selected-card scale, and
  bottom highlight so the cards read as character choices rather than icon
  buttons.

### Code touched
- `src/components/MainMenu.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Menu sprites currently use each class's `*-walk-0.png` standing frame.

## 2026-06-08 - v0.25.10 - Correct marksman and striker sprite assignment (Codex)

### Summary
Corrected the marksman/striker sprite assets after the previous assignment mixup.
- Replaced `player-magnum-walk-*` with the supplied blond marksman/rifle frames.
- Replaced `player-striker-walk-*` with the supplied white-haired striker/handgun
  frames.
- Class-to-texture code did not need a mapping change:
  - `mage` already reads `player-magnum-walk-*`
  - `rogue` already reads `player-striker-walk-*`

### Code touched
- `public/sprites/player-magnum-walk-0.png`
- `public/sprites/player-magnum-walk-1.png`
- `public/sprites/player-striker-walk-0.png`
- `public/sprites/player-striker-walk-1.png`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current class sprite mapping remains:
  - `warrior`: shotgun/heavy-gunner female
  - `mage`: marksman/blond rifle
  - `rogue`: striker/white-haired handgun
  - `necromancer`: scavenger

## 2026-06-08 - v0.25.9 - Add scavenger player sprite (Codex)

### Summary
Added the dedicated scavenger player sprite.
- Extracted two transparent `player-scavenger-walk-*` PNGs from the supplied
  purple-matte source image.
- `necromancer` now uses the scavenger sprite instead of temporarily using the
  striker sprite.
- All four starting classes now have distinct player sprite mappings.

### Code touched
- `public/sprites/player-scavenger-walk-0.png`
- `public/sprites/player-scavenger-walk-1.png`
- `src/pixi/pixiTextures.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current class sprite mapping:
  - `warrior`: shotgun/heavy-gunner female
  - `mage`: magnum/sniper
  - `rogue`: striker
  - `necromancer`: scavenger

## 2026-06-08 - v0.25.8 - Replace striker and add shotgun player sprite (Codex)

### Summary
Updated the starting-class player sprites.
- Replaced the striker walk frames with the supplied blond shotgun/rifle character.
- Added a new two-frame shotgun/heavy-gunner walk sheet from the supplied female
  shotgun character.
- `warrior` now uses the shotgun/heavy-gunner female sprite.
- `rogue` uses the updated striker sprite.
- `necromancer` still temporarily uses the striker sprite until scavenger art is
  supplied.
- `mage` continues to use the magnum/sniper sprite.

### Code touched
- `public/sprites/player-striker-walk-0.png`
- `public/sprites/player-striker-walk-1.png`
- `public/sprites/player-shotgun-walk-0.png`
- `public/sprites/player-shotgun-walk-1.png`
- `src/pixi/pixiTextures.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current class sprite mapping:
  - `warrior`: shotgun/heavy-gunner female
  - `mage`: magnum/sniper
  - `rogue`: striker
  - `necromancer`: striker temporarily
- Replace the temporary `necromancer` mapping when scavenger art is ready.

## 2026-06-08 - v0.25.7 - Reduce class walk sheets to two frames (Codex)

### Summary
Replaced the class walk sheets with the supplied two-frame versions.
- Re-extracted the striker walk sheet from the new two-pose source image.
- Re-extracted the magnum/sniper walk sheet from the new two-pose source image.
- Removed the unused `*-walk-2.png` and `*-walk-3.png` files for both class
  sprite sets.
- Pixi now loads two frames per class sprite set and alternates them during
  movement.
- Current class sprite mapping is unchanged:
  - `mage`: magnum/sniper
  - `rogue`: striker
  - `warrior`: striker temporarily
  - `necromancer`: striker temporarily

### Code touched
- `public/sprites/player-magnum-walk-0.png`
- `public/sprites/player-magnum-walk-1.png`
- `public/sprites/player-magnum-walk-2.png` deleted
- `public/sprites/player-magnum-walk-3.png` deleted
- `public/sprites/player-striker-walk-0.png`
- `public/sprites/player-striker-walk-1.png`
- `public/sprites/player-striker-walk-2.png` deleted
- `public/sprites/player-striker-walk-3.png` deleted
- `src/pixi/pixiTextures.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- `PLAYER_WALK_FRAME_COUNT` is now 2. If future class art returns to 4 poses,
  update the loader and frame count together.

## 2026-06-08 - v0.25.6 - Add striker player walk frames (Codex)

### Summary
Added the striker player walk sheet and assigned it to the remaining starting
classes for now.
- Extracted four transparent `player-striker-walk-*` PNGs from the supplied
  purple-matte walk sheet using the dot-sprite extraction workflow.
- `rogue` now uses the striker walk frames.
- `warrior` and `necromancer` also temporarily use the striker frames until
  their dedicated heavy-gunner/scavenger art is supplied.
- `mage` continues to use the magnum/sniper walk frames from v0.25.5.
- Player class sprites use height-based scaling to preserve body size even when
  gun barrels extend past the hitbox width.

### Code touched
- `public/sprites/player-striker-walk-0.png`
- `public/sprites/player-striker-walk-1.png`
- `public/sprites/player-striker-walk-2.png`
- `public/sprites/player-striker-walk-3.png`
- `src/pixi/pixiTextures.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current class sprite mapping:
  - `mage`: magnum/sniper
  - `rogue`: striker
  - `warrior`: striker temporarily
  - `necromancer`: striker temporarily
- Replace the temporary `warrior` / `necromancer` mapping when heavy-gunner and
  scavenger walk sheets are ready.

## 2026-06-08 - v0.25.5 - Add magnum-start player walk frames (Codex)

### Summary
Added a dedicated animated player sprite for the magnum/sniper starting class.
- Extracted four transparent `player-magnum-walk-*` PNGs from the supplied
  purple-matte walk sheet using the dot-sprite extraction workflow.
- The normal `player.png` remains unchanged.
- Pixi now preloads all four magnum walk frames and uses them only when the
  starting class is `mage` (the marksman/magnum loadout).
- The magnum sprite scales by height so the long rifle barrel does not shrink
  the character body; other player sprites keep the existing contain scaling.
- Removed the previous squash/sway/rotation walk fake for the magnum sprite;
  only a tiny vertical bob remains under the real frame animation.

### Code touched
- `public/sprites/player-magnum-walk-0.png`
- `public/sprites/player-magnum-walk-1.png`
- `public/sprites/player-magnum-walk-2.png`
- `public/sprites/player-magnum-walk-3.png`
- `src/pixi/pixiTextures.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tune `PLAYER_WALK_CYCLE_MS` if the walk tempo feels too fast or slow.
- If any tiny purple matte specks are visible in-game, rerun the extraction pass
  with a slightly wider purple threshold instead of adding runtime filters.
- Current trigger is `player.characterClass === 'mage'`, matching the existing
  marksman/magnum starting profile.

## 2026-06-08 - v0.25.4 - Add player walk motion (Codex)

### Summary
Added a lightweight walk motion to the player sprite.
- Player sprite now bobs, sways, rotates slightly, and subtly squash-stretches
  while moving.
- The effect is visual-only: gameplay position, speed, hitbox, and foot z-sort
  are unchanged.
- The sprite returns to neutral scale/rotation when idle.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tune `PLAYER_WALK_CYCLE_MS`, `PLAYER_WALK_BOB_PX`, `PLAYER_WALK_SWAY_PX`, and
  `PLAYER_WALK_ROTATION` in `src/pixi/pixiScene.ts` if the gait feels too subtle
  or too wobbly.

## 2026-06-08 - v0.25.3 - Buff level upgrades and tighten shotgun cone (Codex)

### Summary
Adjusted level-up values and fixed shotgun grouping.
- Max HP passive now grants +30 max HP and fully heals, instead of +10.
- Might passive now multiplies gun/melee damage by 1.2, instead of 1.06.
- Upgrade descriptions now match the new values.
- Shotgun spread now treats `0.34rad` as the total cone width across all pellets,
  not the per-pellet step, so higher-tier shotguns no longer fan out too widely.

### Code touched
- `src/store/gameStore.ts`
- `src/utils/upgradeUtils.ts`
- `src/utils/weaponUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tune `SHOTGUN_SPREAD_CONE_RAD` in `src/utils/weaponUtils.ts` if shotgun
  grouping still needs another pass.

## 2026-06-07 - v0.25.2 - Raise crit upgrade to 3 percent (Codex)

### Summary
Adjusted the level-up crit bonus amount.
- Crit Chance passive now grants +3% per pickup instead of +2.5%.
- The +30% player bonus cap remains unchanged.
- Upgrade menu copy now reflects the 3% value.

### Code touched
- `src/store/gameStore.ts`
- `src/utils/upgradeUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- With the +30% cap, the crit passive reaches cap after 10 pickups.

## 2026-06-07 - v0.25.1 - Count counters and multi-finish combos (Codex)

### Summary
Expanded combo counting and simplified combo UI.
- Simultaneous melee finishers now add one combo count per finished enemy.
- Boss melee finisher-grade hits still add one combo count.
- Successful counters/reflections add one combo count when a projectile is
  actually reflected.
- Combo HUD moved to the left, removed the pill frame, and now uses smaller
  outlined text.

### Code touched
- `src/store/gameStore.ts`
- `src/hooks/useGameLoop.ts`
- `src/components/GameHUD.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The shared combo helper is `addMeleeFinishCombo()` in `src/store/gameStore.ts`.
  The name is historical; it now also covers successful counters.

## 2026-06-07 - v0.25.0 - Add weapon base crit rates (Codex)

### Summary
Moved gun critical chance to weapon-based rates with level-up bonus on top.
- Guns now receive base crit by family: shotgun 5%, handgun 10%, rifle/magnum
  20%.
- Weapon tier adds +3% crit per tier above tier 1.
- Shotgun pellets roll crit independently per pellet using the weapon base rate
  plus player bonus.
- Level-up crit bonus is now capped at +30% and starts at 0%, instead of being
  the whole gun crit chance.
- Melee weapons keep their fixed weapon crit rates.

### Code touched
- `src/utils/weaponUtils.ts`
- `src/types/game.ts`
- `src/store/gameStore.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current gun crit totals before level-up bonus: shotgun 5/8/11%, handgun
  10/13/16%, rifle 20/23/26%.
- Tune `BASE_CRIT_BY_CATEGORY` or `TIER_CRIT_STEP` in `src/utils/weaponUtils.ts`
  if balance needs another pass.

## 2026-06-07 - v0.24.99 - Add melee finisher combo timer (Codex)

### Summary
Added melee finisher combo tracking and tightened boss finisher reaction.
- Bosses no longer advance while the melee finisher lift reaction is active.
- Any melee finisher-grade hit starts a 5-second combo window, including boss
  stunned-finisher damage.
- The HUD begins showing combo count from 2 combo onward if another finisher
  lands inside the 5-second window.

### Code touched
- `src/store/gameStore.ts`
- `src/components/GameHUD.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Combo timing uses `gameTime`, so pause/upgrade menus do not drain the window.
- The first finisher only arms the timer; display starts at 2 combo by design.

## 2026-06-07 - v0.24.98 - Tighten shotgun spread and stack pellet knockback (Codex)

### Summary
Improved shotgun feel and pellet impact.
- Tightened shotgun pellet spacing from `0.5rad` to `0.34rad` for better
  grouping.
- Projectile collision handling now counts how many bullets hit the same enemy
  in the same frame.
- Bullet knockback receives that hit count as a multiplier, capped at 3x, so
  stacked pellets shove enemies farther without launching them infinitely.

### Code touched
- `src/utils/weaponUtils.ts`
- `src/hooks/useGameLoop.ts`
- `src/store/gameStore.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tune `SHOTGUN_SPREAD_STEP_RAD` in `src/utils/weaponUtils.ts` if grouping needs
  another pass.
- Knockback strength is still bounded in `knockbackEnemy()` with a hard 3x cap.

## 2026-06-07 - v0.24.97 - Add boss finisher lift reaction (Codex)

### Summary
Added a visual lift reaction when a stunned boss takes melee finisher-grade
damage.
- Bosses that survive a stunned melee finisher hit now get a short visual-only
  lift window (`liftUntil`).
- Pixi offsets only the enemy sprite upward with a subtle shake, leaving foot
  position, z-sort, collision, and gameplay movement unchanged.
- Normal enemies and boss deaths are unchanged.

### Code touched
- `src/types/game.ts`
- `src/store/gameStore.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tune `BOSS_FINISH_LIFT_MS` and `BOSS_FINISH_LIFT_PX` in
  `src/pixi/pixiScene.ts` if the reaction should be heavier or subtler.

## 2026-06-07 - v0.24.96 - Add one-time insect egg ambush (Codex)

### Summary
Added a mid-run insect egg ambush event.
- At 2:30 game time, the run stores a one-time ambush anchor at the player's
  current position.
- The event places 52 eggs in a noisy 3-row elliptical ring outside the current
  screen area, creating a breakable encirclement.
- Eggs reuse existing mine/egg behavior: 1 HP, acid contact damage, liquid burst
  effects, and destroyed eggs stay gone through `destroyedBreakableProps`.

### Code touched
- `src/world/mines.ts`
- `src/store/gameStore.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tune `MINE_AMBUSH_TIME_MS` in `src/store/gameStore.ts` if the event should
  happen earlier/later.
- Tune `count`, `rx`, and `ry` in `mineAmbushAround()` if the ring feels too
  dense or too far outside the screen.

## 2026-06-07 - v0.24.95 - Add paired insect egg drawing (Codex)

### Summary
Updated insect egg visuals so each trap unit reads as a paired egg set.
- Added a smaller side egg next to the main egg using the same muted moss/olive
  palette.
- Kept collision, spawning, and damage behavior unchanged; this is a visual-only
  adjustment.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The small egg is drawn before the main egg so the pair stays compact and does
  not increase the gameplay footprint.

## 2026-06-07 - v0.24.94 - Mute egg colors and stagger rows (Codex)

### Summary
Adjusted insect eggs so they blend into the ground and form less mechanical
patches.
- Muted egg colors from vivid yellow-green to darker moss/olive tones with much
  softer highlights.
- Forward pressure egg patches now lay out in deterministic 2-3 staggered rows
  instead of a mostly single line.
- Preserved the 5-10 egg random count and occasional pass-through gap behavior.

### Code touched
- `src/pixi/pixiScene.ts`
- `src/world/mines.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Color choices intentionally avoid saturated green so future gray/brown floor
  variants should not make eggs look like UI markers.

## 2026-06-07 - v0.24.93 - Randomize egg patch count (Codex)

### Summary
Changed insect egg patch size from fixed 7 eggs to deterministic random counts.
- World egg patches now roll 5-10 eggs per patch.
- Forward pressure egg patches also roll 5-10 eggs per patch.
- Optional gap behavior is suppressed for smaller patches so the visible count
  does not drop too low.

### Code touched
- `src/world/mines.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Counts are deterministic from the existing hash seeds, so patches remain
  stable instead of flickering frame-to-frame.

## 2026-06-07 - v0.24.92 - Scatter egg patches farther ahead (Codex)

### Summary
Adjusted pressure egg placement so it feels less like a clean line and appears
farther off-screen.
- Moved pressure patch centers farther ahead of the player's movement direction
  (`310-430px` instead of `210-290px`).
- Increased perpendicular and forward jitter so eggs form an organic clump/loose
  barrier instead of a neatly spaced row.
- Kept the 7-egg target count and occasional gap behavior.

### Code touched
- `src/world/mines.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If eggs now feel too far away on narrow phones, tune `ahead` in
  `pressureMinesNearPlayer()` down slightly while keeping the new jitter values.

## 2026-06-07 - v0.24.91 - Make egg bursts read as liquid (Codex)

### Summary
Changed insect egg contact/break effects away from light explosions and toward
green liquid spray.
- Added a non-additive `liquid` particle rendering path: no glow halo and no
  white hot core, so droplets read as fluid instead of sparks.
- Egg contact now emits upward-biased green droplets instead of a ring/glow
  blast.
- Projectile breakage also uses the same liquid splash helper at lower
  intensity.

### Code touched
- `src/types/game.ts`
- `src/pixi/pixiScene.ts`
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Melee breaking eggs still uses the store-side burst path; if it also reads too
  spark-like on device, move the shared liquid helper into the store or a small
  effect utility.

## 2026-06-07 - v0.24.90 - Convert mines to insect eggs (Codex)

### Summary
Converted the mine/caltrop trap concept into insect eggs and increased patch
size.
- World and pressure patches now use 7 eggs instead of 4-6 mines.
- The trap remains mechanically identical: passable, one-hit breakable, no loot,
  and damaging when touched.
- Contact and break effects now use green acid/liquid bursts, rings, and glows
  instead of orange/red explosions.
- Pixi procedural drawing now renders a small green egg sac with a pulsing core
  instead of dark metal spikes.

### Code touched
- `src/world/mines.ts`
- `src/hooks/useGameLoop.ts`
- `src/store/gameStore.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Internal type names still use `mine` to keep this change small and avoid a
  broad rename; gameplay/readable comments now treat them as insect eggs.
- If the 7-egg line feels too dense, retune `spacing` and optional gap behavior
  in `pressureMinesNearPlayer()`.

## 2026-06-07 - v0.24.89 - Add forward pressure mine patches (Codex)

### Summary
Adjusted mines so they actually appear and sometimes block the player's advance.
- Added a pressure-mine generator that places a small mine line ahead of the
  player's recent movement direction.
- Pressure patches spawn only on some 18-second time segments, so the pattern
  creates occasional route pressure without becoming constant.
- Patches contain roughly 4-6 mines, with occasional gaps so the player can
  sometimes thread through instead of always shooting.
- Existing deterministic world mines remain in place as background traps.
- Destroyed pressure mines use the existing `destroyedBreakableProps` tracking,
  so they do not immediately respawn within the same segment.

### Code touched
- `src/world/mines.ts`
- `src/store/gameStore.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tuning points for pressure mines are in `pressureMinesNearPlayer()`:
  the `18000` segment length, `0.58` spawn threshold, `ahead` distance,
  `count`, and `spacing`.

## 2026-06-07 - v0.24.88 - Keep supply arrows below top HUD (Codex)

### Summary
Adjusted off-screen supply arrow clamping so upward arrows no longer hide under
the iOS status bar or top HUD.
- Pixi arrow anchors now use a responsive top safe line of roughly 154px / 17%
  of screen height, capped for short screens.
- Canvas fallback arrows use the same top safe line for consistency.
- Bottom and side arrow margins remain unchanged.

### Code touched
- `src/pixi/pixiScene.ts`
- `src/utils/renderUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If the top HUD height changes, retune the `154` / `0.17` values in the arrow
  margin calculation in both renderers.

## 2026-06-07 - v0.24.87 - Add clustered breakable mines (Codex)

### Summary
Added low-frequency clustered mine/caltrop traps as a separate field-pressure
object from enemies.
- Mines spawn in deterministic clusters of roughly 4-6 pieces, at a lower
  frequency than torches, so they occasionally block a route without becoming
  constant friction.
- Mines are passable traps: the player can walk over them, but stepping on one
  detonates it for damage and destroys it.
- Mines have 1 HP, so bullets or melee can disarm them in one hit.
- Destroyed mines drop no items, unlike torches.
- Enemies and player movement are no longer blocked by mines; torches remain
  solid environmental props.
- Pixi renders mines procedurally as small dark metal spikes with a faint red
  warning dot, keeping the asset load light.

### Code touched
- `src/world/mines.ts`
- `src/types/game.ts`
- `src/store/gameStore.ts`
- `src/hooks/useGameLoop.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tuning points: `MINE_CELL` and the `0.09` spawn threshold in
  `src/world/mines.ts`, and `MINE_DAMAGE` in `src/store/gameStore.ts`.
- Current mine damage is 34 and uses the existing player invulnerability window,
  so stepping into a cluster cannot stack every mine instantly.

## 2026-06-07 - v0.24.86 - Tighten enemy recycling and supply arrows (Codex)

### Summary
Adjusted enemy pressure and pickup guidance after the first recycling pass.
- Enemy recycling now triggers much closer to the viewport, so the player cannot
  kite far away from the horde as easily.
- Continuous spawns and recycled enemies now occasionally bias toward the
  player's movement direction, creating mild path-blocking pressure without
  making every spawn predictable.
- Ammo, weapon crates, weapon drops, and meat/health pickups now opt into the
  off-screen arrow system when dropped by enemies or breakable torches.
- Arrow colors now cover meat/health and weapon supplies in Pixi and the canvas
  fallback renderer.
- To prevent uncollected XP gems from growing without bound, the game trims only
  far XP gems after the pickup count exceeds a guardrail; important supplies are
  kept.

### Code touched
- `src/hooks/useGameLoop.ts`
- `src/utils/enemyUtils.ts`
- `src/store/gameStore.ts`
- `src/pixi/pixiScene.ts`
- `src/utils/renderUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- VS-style behavior: XP gems can remain for collection/magnet feel, but this
  implementation trims distant XP when item count is high for mobile perf.
- Tuning points: `ENEMY_RECYCLE_DISTANCE_MULT`, `PICKUP_HARD_CAP`, and
  `XP_PICKUP_KEEP_COUNT` in `src/hooks/useGameLoop.ts`; spawn direction bias is
  inside `generateEnemy()` in `src/utils/enemyUtils.ts`.

## 2026-06-07 - v0.24.85 - Recycle distant enemies near viewport (Codex)

### Summary
Added VS-style enemy recycling for enemies that drift too far from the player.
- Continuous spawn now respects the live enemy cap before adding new enemies,
  avoiding spawn-then-cull churn.
- Distant regular enemies are refreshed into the current spawn pool and moved
  back just outside the active viewport while reusing their renderer id.
- Boss-class enemies and the reaper keep HP/type/state and only warp position
  when they get far away, matching the expected Vampire Survivors-style boss
  pressure.
- Scripted-wave enemies still get their 10-second grace period before they are
  eligible for recycling or density cleanup.
- The hard cap remains in place after wave events so enemy-heavy scenes do not
  grow without bound.

### Code touched
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The next performance hotspot is still likely `updateEnemies`, especially the
  per-enemy collision checks against trees/torches when enemy count is high.
- On-device tuning point: `ENEMY_RECYCLE_DISTANCE_MULT` in `useGameLoop.ts`
  controls how far an enemy can drift before being repositioned.

## 2026-06-07 - v0.24.84 - Remove perf screenshots and cull enemy lights (Codex)

### Summary
Removed the automatic perf screenshot path and added a first enemy-count
optimization.
- Removed threshold-triggered PNG downloads from the perf HUD.
- Removed the test-only Pixi screenshot extraction helper and global types.
- Kept the always-visible perf numbers on screen.
- When enemy count reaches `7+`, normal enemies stop drawing their constant
  subtle self-light; boss lights and hit-pulse lights remain active.

### Code touched
- `src/components/GameHUD.tsx`
- `src/pixi/PixiStage.tsx`
- `src/pixi/pixiScene.ts`
- `src/vite-env.d.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The next likely enemy-heavy hotspot is simulation-side enemy movement and
  collision, especially per-enemy tree/torch resolution during crowded frames.
- If FPS still drops mainly with enemies, consider profiling/refactoring
  `useGameLoop` subscriptions and `updateEnemies`.

## 2026-06-07 - v0.24.83 - Burn perf metrics into captures and harden touch recovery (Codex)

### Summary
Improved perf capture readability and mobile joystick recovery.
- Perf warning screenshots now draw the current debug metrics directly onto the
  extracted PNG, so the saved preview includes `FPS`, `fx`, `p`, `item`,
  `enemy`, and warning reasons.
- `GameHUD` publishes the current perf lines to `window.__zombiePerfDebug` for
  the Pixi capture helper.
- `VirtualJoystick` now recovers from stale pointer state by clearing any
  previous pointer on a new touch, listening for global `pointerup` /
  `pointercancel`, and clearing on `blur`, `pagehide`, or lost pointer capture.
- This targets the mobile case where low-FPS/enemy-heavy moments can delay or
  drop pointer-end events after a melee release, leaving movement unresponsive.

### Code touched
- `src/components/GameHUD.tsx`
- `src/components/VirtualJoystick.tsx`
- `src/pixi/PixiStage.tsx`
- `src/vite-env.d.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The one-finger control model still fires melee/counter on normal pointer-up.
- Recovery paths such as `pointercancel`, `blur`, and stale-pointer replacement
  clear movement without firing another melee action.

## 2026-06-07 - v0.24.82 - Use Pixi extraction for perf screenshots (Codex)

### Summary
Changed warning screenshot capture away from direct WebGL canvas reads.
- `PixiStage` now exposes a test-only `window.__zombieCapturePng()` helper that
  uses `app.renderer.extract.download({ target: app.stage })`.
- `GameHUD` uses the Pixi extraction helper first, falling back to canvas
  `toBlob` only when the helper is unavailable.
- Removed `preserveDrawingBuffer` from Pixi init because Pixi extraction should
  avoid the black-backbuffer issue without adding that ongoing render cost.

### Code touched
- `src/pixi/PixiStage.tsx`
- `src/components/GameHUD.tsx`
- `src/vite-env.d.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The downloaded perf screenshot captures the Pixi stage, not the native iOS
  browser download popup and not the React HUD overlay.
- iOS Safari may still ask before downloading, but the saved PNG should be less
  prone to the mostly-black WebGL backbuffer read bug.

## 2026-06-07 - v0.24.81 - Keep perf HUD above darkness and stabilize captures (Codex)

### Summary
Improved the test performance overlay and warning screenshots.
- Moved the performance counter block to a fixed high-z overlay with a dark
  opaque backing, so it stays readable above in-game darkness/flash effects.
- Enabled Pixi `preserveDrawingBuffer` during this test phase so WebGL canvas
  PNG captures are less likely to be blank/black.
- Delayed warning captures by `320ms` after threshold detection to avoid
  catching the darkest instant of a flash/fade.

### Code touched
- `src/components/GameHUD.tsx`
- `src/pixi/PixiStage.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- `preserveDrawingBuffer` can slightly hurt rendering performance; keep it only
  while screenshot-based perf testing is useful.
- Browser auto-download limitations still apply on iOS Safari.

## 2026-06-07 - v0.24.80 - Add perf debug counters and warning capture (Codex)

### Summary
Expanded the always-visible test performance HUD.
- The in-game debug pill now shows `FPS`, active effect count, projectile count,
  pickup count, and enemy count.
- The pill turns red and lists warning reasons when counts cross conservative
  test thresholds.
- On threshold exceed, the game attempts to save a canvas PNG named
  `zombie-perf-...png`, with a 15-second cooldown to avoid download spam.

### Code touched
- `src/components/GameHUD.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Threshold constants live in `GameHUD`: `PERF_THRESHOLDS`.
- Browser auto-download behavior is platform-dependent. Desktop browsers should
  generally save the PNG; iOS Safari may block or ask for user action.
- The screenshot captures the game canvas, not necessarily the overlaid React
  HUD, depending on browser/WebGL capture behavior.

## 2026-06-07 - v0.24.79 - Show in-game FPS during testing (Codex)

### Summary
Made the existing FPS counter visible during gameplay testing.
- The game loop already measured FPS once per second; the HUD now displays it
  as a small `FPS xx` pill below the right-side audio button.
- Kept the indicator lightweight and read-only so it does not affect gameplay
  simulation or rendering logic.

### Code touched
- `src/components/GameHUD.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- This is intentionally always visible for the current test phase.
- If it becomes distracting later, hide or gate the block in `GameHUD`.

## 2026-06-07 - v0.24.78 - Full BGM default and duplicate weapon ammo (Codex)

### Summary
Adjusted audio defaults, duplicate weapon pickups, and reload HUD placement.
- Changed the default BGM volume for new/unset settings from `55%` to `100%`.
- Existing saved `zombie:bgmVolume` values are still respected; the new default
  applies when no saved BGM volume exists yet.
- Picking up a gun category already owned at the same or lower tier now converts
  to ammo worth `AMMO_PICKUP * 2` instead of being discarded.
- Higher-tier gun pickups still upgrade the weapon as before.
- Reload progress is now positioned from the rendered player head height, so the
  meter sits above the character art instead of overlapping the face.

### Code touched
- `src/audio/audioManager.ts`
- `src/store/gameStore.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Duplicate gun ammo conversion lives in `grantWeapon`.
- Melee weapon replacement behavior was left unchanged.
- Reload meter placement uses `playerFootBox` plus `depthScale` to match the
  HD-2D visual size.

## 2026-06-07 - v0.24.77 - Add grenade blast damage (Codex)

### Summary
Buffed the grenade launcher and gave it real splash damage.
- Raised `rifle-t3` / グレネードランチャー base damage from `75` to `95`.
- Projectiles now carry their source `weaponKey`, so the loop can distinguish
  grenade shots from other rifle-family bullets.
- Grenade launcher shots now explode on first enemy hit and are removed instead
  of acting like piercing sniper rounds.
- The blast deals falloff splash damage in a `92px` radius, spawns blast VFX,
  blood bursts, damage numbers, and XP gems for enemies killed by splash.

### Code touched
- `src/types/game.ts`
- `src/utils/weaponUtils.ts`
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tuning constants live in `src/hooks/useGameLoop.ts`:
  `GRENADE_BLAST_RADIUS`, `GRENADE_BLAST_DAMAGE_MULT`.
- Source weapon detection uses `Projectile.weaponKey === 'rifle-t3'`.

## 2026-06-07 - v0.24.76 - Add opening settings and melee damage numbers (Codex)

### Summary
Added opening-screen settings and fixed missing melee damage numbers.
- Normal melee hits now spawn damage numbers, not only critical melee hits.
- Critical melee and stunned-boss melee damage still use the gold/crit number
  style.
- Added a settings button to the opening menu.
- Moved the ammo drop percentage into the settings panel.
- Added persistent BGM and SE volume sliders.
- Raised the default BGM volume from `0.30` to `0.55`.
- BGM volume is applied through the existing WebAudio gain path for iOS-safe
  control; SE volume scales all SFX while preserving per-sound balance.

### Code touched
- `src/audio/audioManager.ts`
- `src/components/MainMenu.tsx`
- `src/store/gameStore.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Volume storage keys: `zombie:bgmVolume`, `zombie:sfxVolume`.
- Mute remains separate via `zombie:audioMuted`.
- If the settings panel feels crowded on small screens, keep it collapsible and
  adjust spacing rather than returning all controls to the main menu surface.

## 2026-06-07 - v0.24.75 - Add bullet-hit blood and chest crate art (Codex)

### Summary
Added small bullet-hit blood feedback and swapped weapon crates to existing
treasure chest art.
- Bullet/projectile hits on enemies now spawn a small red/dark-red burst before
  kill logic, with crits using a slightly larger count.
- Kill splashes remain larger and separate, so normal hits read as chip blood
  rather than a death splash.
- `weapon-crate` pickups now use the atlas-backed `pickup-chest` sprite instead
  of the old procedural box drawing.

### Code touched
- `src/hooks/useGameLoop.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The weapon crate still behaves as a weapon crate; only its pickup art now maps
  to `pickup-chest`.
- If hit blood feels too busy, lower the two `spawnBurst` counts near projectile
  enemy collision handling.

## 2026-06-07 - v0.24.74 - Slightly raise enemy breathing amplitude (Codex)

### Summary
Made enemy idle breathing a little easier to perceive.
- Increased `ENEMY_BREATH_SCALE_X` from `0.012` to `0.016`.
- Increased `ENEMY_BREATH_SCALE_Y` from `0.018` to `0.024`.
- Kept timing, phase offsets, foot anchoring, and gameplay/collision behavior
  unchanged.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If the motion becomes too rubbery, reduce these constants before changing the
  animation method.

## 2026-06-07 - v0.24.73 - Apply breathing to all enemies (Codex)

### Summary
Updated enemy idle breathing after confirming all current enemies are humanoid
zombies in the active art direction.
- Removed the old `bat` exclusion from enemy breathing.
- All enemy sprites now receive the same renderer-only breathing pulse, while
  heavy enemy types still use reduced amplitude.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Type names such as `bat` may remain in data/code for legacy behavior, but
  current art direction treats enemies as humanoid zombie variants for idle
  sprite breathing.

## 2026-06-07 - v0.24.72 - Add subtle enemy breathing (Codex)

### Summary
Added a lightweight idle breathing motion to enemy sprites.
- Enemies now get a tiny foot-anchored X/Y scale pulse, giving them a subtle
  living/undead breathing feel without moving hitboxes or gameplay state.
- Each enemy gets a stable phase offset from its id so groups do not pulse in
  perfect sync.
- Heavy enemies use a reduced amplitude.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tuning constants: `ENEMY_BREATH_SCALE_X`, `ENEMY_BREATH_SCALE_Y`,
  `ENEMY_BREATH_MS`.
- This is renderer-only and does not affect collision or AI movement.

## 2026-06-07 - v0.24.71 - Fade pickups into horizon zone (Codex)

### Summary
Fixed pickup objects overlapping the far background in the upper transparent
zone.
- Applied `horizonActorAlpha` to the whole pickup container, not only selected
  ground reflections.
- This covers weapon crates, ammo boxes, gems, meat/health, magnet, bomb, and
  other pickup sprites/procedural drawings consistently.
- Pickups now hide completely at alpha zero and z-sort by their foot Y.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If another object overlaps the far backdrop, check whether its container also
  uses `horizonActorAlpha(footY)`.

## 2026-06-07 - v0.24.70 - Stabilize player screen-pixel snap (Codex)

### Summary
Reduced player-only jitter during movement.
- Added a screen-pixel snap helper that accounts for the current world/camera
  offset.
- Changed only the player sprite placement to snap after camera offset, rather
  than rounding raw world coordinates. This avoids a 1px tug-of-war between the
  player sprite and the camera's fractional movement.
- Left enemies, pickups, ground, DOF, and depth scaling untouched.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If jitter remains visible, next check camera follow smoothing / camera
  fractional values before changing sprite textures or DOF.

## 2026-06-07 - v0.24.69 - Soften gem glow and reduce shimmer (Codex)

### Summary
Softened the previous glow pass after playtest feedback.
- Reduced gem body glow intensity and widened the outer color halo so gems read
  as a faint self-emission instead of an obvious painted glow disc.
- Shrank the gem white core to keep the sprite from becoming a flat white orb.
- Rounded gem glow and strong-event lighting coordinates to reduce subpixel
  shimmer while moving.
- Kept long event shadows, but lowered the local darkening/stroke strength so
  strong-light events contrast without making the scene look jagged.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If gems still feel too artificial, lower `GEM_BODY_GLOW_ALPHA` further before
  changing the pickup sprite asset.
- If motion still looks rough, inspect the perspective ground strip rendering
  next; this change only addresses the new Graphics-based glow/shadow shimmer.

## 2026-06-07 - v0.24.68 - Make gems self-glow and deepen event contrast (Codex)

### Summary
Adjusted the glow direction after playtest feedback.
- Removed experience gems from the damp-ground reflection pass so their light no
  longer reads as a cheap floor ellipse.
- Strengthened the gem's own additive body glow with a wider colored halo and a
  smaller white core.
- Increased strong-event local contrast: wider dark falloff around bright glow
  events and longer cast shadows from nearby actors.
- Kept the heavier contrast event-only (`glow.radius >= STRONG_GLOW_RADIUS`) so
  ordinary movement and pickups do not permanently darken the field.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Gem self-glow strength is `GEM_BODY_GLOW_ALPHA`.
- Strong-event contrast is controlled by `LOCAL_EVENT_SHADE_ALPHA`,
  `LOCAL_EVENT_SHADOW_ALPHA`, and the reach/length literals in
  `syncLocalEventLighting`.

## 2026-06-07 - v0.24.67 - Strengthen local glow contrast (Codex)

### Summary
Improved the cheap-looking damp-ground light around gems and strong glow events.
- Added a dedicated additive pickup-glow layer so experience gems get a colored
  multi-layer body glow instead of reading as flat white orbs.
- Added local-only contrast shading and short cast shadows for strong `glow`
  effects (`radius >= 44`), so finishers, torch breaks, level-up flashes, and
  other big events deepen nearby ground without darkening the whole scene.
- Upgraded strong glow rendering with wider bloom layers, a hot core, and subtle
  red/cyan fringe for event-only impact.
- Added a strong local glow to successful counters so the same local event-light
  treatment applies there too.

### Code touched
- `src/pixi/pixiScene.ts`
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The event-only threshold is `STRONG_GLOW_RADIUS`.
- Gem body glow strength is `GEM_BODY_GLOW_ALPHA`.
- Local darkening is intentionally ground-only and temporary; do not replace it
  with a global darkness/DOF change unless the art direction changes.

## 2026-06-07 - v0.24.66 - Make damp ground reflections visible (Codex)

### Summary
Raised the subtle reflection pass to a visible level after playtest feedback.
- Increased global reflection alpha from `0.12` to `0.28`.
- Widened pickup, projectile, and glow reflection ellipses.
- Strengthened torch foot reflection alpha and size.
- Kept the same cheap rendering strategy: one shared `Graphics` for generic
  glow reflections plus one simple Sprite per torch reflection.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If the reflection now reads too watery, lower `GROUND_REFLECTION_ALPHA` first
  before changing the drawing approach.

## 2026-06-07 - v0.24.65 - Reflect glowing effects on damp ground (Codex)

### Summary
Extended the lightweight wet-ground reflection pass beyond torches.
- Added one shared additive `Graphics` layer for ground reflections.
- Gems, magnet, bomb, weapon pickups, active projectiles, and `glow` effects
  now paint subtle flattened light onto the damp forest floor.
- Kept the implementation cheap: no reflected sprites, no render textures, no
  full-scene postprocess. Reflections are just small additive ellipses.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Global strength is `GROUND_REFLECTION_ALPHA`.
- This intentionally reflects only light-like objects/effects, not character
  bodies, to preserve performance and avoid a water-surface look.

## 2026-06-07 - v0.24.64 - Add lightweight torch ground reflection (Codex)

### Summary
Added the first lightweight reflection pass.
- Each torch now gets a thin warm additive ground reflection under its foot.
- The effect reuses the existing glow texture as a horizontally stretched
  Sprite, so it avoids expensive reflected-scene rendering.
- Reflection pulse follows the torch flame pulse and respects horizon fade.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tune only `TORCH_REFLECTION_W`, `TORCH_REFLECTION_H`, and reflection alpha in
  `drawBreakableProp` if the wet-ground glint is too strong or too weak.

## 2026-06-07 - v0.24.63 - Clean torch purple fringe and improve flame (Codex)

### Summary
Refined the new torch prop visuals.
- Removed remaining opaque purple fringe pixels from `public/sprites/torch.png`.
- Also normalized fully transparent pixels to black RGB to prevent purple
  color bleed during texture sampling.
- Reworked the torch fire from small round glows into a taller rising flame
  with a warm orange body, pale core, and drifting ember particles.

### Code touched
- `public/sprites/torch.png`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- Purple-ish nontransparent pixel check: `0`
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Flame height/embers are purely Pixi-side; the torch sprite remains a clean
  transparent prop body.

## 2026-06-07 - v0.24.62 - Add breakable torch props (Codex)

### Summary
Added torch environmental objects with Octopath-like fire lighting.
- Added deterministic torch placement around the camera via `src/world/torches.ts`.
- Added `BreakableProp` state so torches can be destroyed and stay destroyed
  for the run.
- Torches can be broken by projectiles or melee/counter swings.
- Broken torches roll a small non-gem loot table: mostly ammo, sometimes
  health, magnet, bomb, or a rare weapon drop. They never drop XP gems.
- Added `public/sprites/torch.png` from the supplied purple-background asset
  using the purple-key sprite workflow.
- Pixi renders the torch body as crisp pixel art, then adds warm additive glow,
  soft flame motes, and hit/break sparks in code.

### Code touched
- `src/types/game.ts`
- `src/world/torches.ts`
- `src/store/gameStore.ts`
- `src/hooks/useGameLoop.ts`
- `src/pixi/pixiTextures.ts`
- `src/pixi/pixiScene.ts`
- `public/sprites/torch.png`
- `public/sprites/README.md`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Torch fire is not baked into the sprite. Tune the light in
  `TORCH_LIGHT_RADIUS`, `TORCH_VISUAL_W`, and `TORCH_VISUAL_H` in
  `src/pixi/pixiScene.ts`.
- Drop chance is `BREAKABLE_PROP_DROP_CHANCE = 0.28` in `src/store/gameStore.ts`.
- Torch placement density is controlled in `src/world/torches.ts`.

## 2026-06-07 - v0.24.61 - Set vertical ground scroll feel to 3.0 (Codex)

### Summary
Locked the horizontal ground scroll feel and raised only the vertical feel.
- Kept `GROUND_SCROLL_X_FEEL = 1.2`.
- Changed `GROUND_SCROLL_Y_FEEL` from `2.0` to `3.0`.
- Player speed, camera tracking, collisions, and object positions are unchanged.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Horizontal terrain feel is considered accepted at `1.2`; avoid changing it
  unless explicitly requested.

## 2026-06-07 - v0.24.60 - Tune ground scroll feel X/Y (Codex)

### Summary
Adjusted visual-only ground texture scroll feel on both axes.
- Changed vertical ground scroll feel from `1.8` to `2.0`.
- Added horizontal ground scroll feel at `1.2`.
- Player speed, camera tracking, collisions, and object positions are unchanged.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Terrain texture scroll is now independently tunable via
  `GROUND_SCROLL_X_FEEL` and `GROUND_SCROLL_Y_FEEL`.

## 2026-06-07 - v0.24.59 - Increase vertical ground scroll feel to 1.8 (Codex)

### Summary
Raised the visual-only ground texture vertical scroll feel.
- Changed `GROUND_SCROLL_Y_FEEL` from `1.6` to `1.8`.
- Player speed, camera tracking, collisions, and object positions are unchanged.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Terrain texture Y-scroll is now `1.8`; tune this single constant for further
  movement-feel checks.

## 2026-06-07 - v0.24.58 - Increase vertical ground scroll feel to 1.6 (Codex)

### Summary
Raised the visual-only ground texture vertical scroll feel again.
- Changed `GROUND_SCROLL_Y_FEEL` from `1.4` to `1.6`.
- Player speed, camera tracking, collisions, and object positions are unchanged.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Terrain texture Y-scroll is now intentionally exaggerated for stronger
  movement feel.

## 2026-06-07 - v0.24.57 - Increase vertical ground scroll feel (Codex)

### Summary
Raised the visual-only ground texture vertical scroll feel.
- Changed `GROUND_SCROLL_Y_FEEL` from `1.2` to `1.4`.
- Player speed, camera tracking, collisions, and object positions are unchanged.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- This is a terrain-texture feel tweak only.

## 2026-06-07 - v0.24.56 - Ground scroll feel, HP full heal, crest ring polish (Codex)

### Summary
Adjusted three feel/presentation points without changing player movement speed.
- Increased only the terrain texture's vertical scroll feel to `1.2x`.
- Changed max-HP level-up upgrades to fully heal after increasing max HP.
- Reworked the melee crest into a 360-degree luminous ring with thin linework
  and angle-weighted glow, while keeping the stronger crescent belly.

### Code touched
- `src/pixi/pixiScene.ts`
- `src/store/gameStore.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- `GROUND_SCROLL_Y_FEEL` is visual-only; player speed and camera tracking are
  unchanged.

## 2026-06-07 - v0.24.55 - Replace player with purple-keyed source cutout (Codex)

### Summary
Replaced the player sprite with the user-provided source art instead of the old
32x32 cutout.
- Chroma-keyed the purple background to alpha 0.
- Cropped to the sprite bounds only; no resize, sharpening, outline, or
  redraw/correction pass was applied.
- Left gameplay sizing and Pixi rendering logic unchanged.

### Code touched
- `public/sprites/player.png`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The new `player.png` is intentionally much higher resolution and vertically
  proportioned (`270x487`) than the previous `32x32` asset. If in-game size
  feels off, adjust visual scale separately rather than resampling the source.

## 2026-06-07 - v0.24.54 - Pixel-crisp focused sprites (Codex)

### Summary
Reduced sampling blur on focused pixel sprites without removing HD-2D depth
effects.
- Enabled Pixi renderer `roundPixels` for crisper pixel-art sampling.
- Rounded only player, enemy, and sprite-backed pickup display positions.
- Left gameplay coordinates, hitboxes, Y-sort, depth scale, DOF, bloom, fog, and
  source art unchanged.

### Code touched
- `src/pixi/PixiStage.tsx`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- This is intentionally not a sharpening/outline pass. If center sprites still
  lack detail, inspect source art resolution next rather than adding fake
  correction layers.

## 2026-06-07 - v0.24.53 - Horizon forest parallax direction fix (Codex)

### Summary
Fixed the depth cue where the forest in front of the distant panorama appeared
to move slower than the far background.
- Converted the horizon forest seam from a static `Sprite` to a `TilingSprite`.
- Added `HORIZON_FOREST_PARALLAX_X = 0.16`, faster than the far backdrop's
  `0.09` and slower than the nearest foreground forest's `0.44`.
- Kept the existing horizon position, fade mask, and actor fade behavior.

### Code touched
- `src/pixi/layers.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The parallax order is now far backdrop `0.09` < horizon forest `0.16` <
  front forest `0.44`.

## 2026-06-07 - v0.24.52 - Crisp fireflies and lighter front forest blur (Codex)

### Summary
Adjusted atmosphere layering after the HD-2D perspective pass.
- Reduced the lower foreground forest blur from `2.4` to `1.6`.
- Moved ambient firefly sprites from the filtered world `lightingLayer` to the
  screen-space `uiLayer`, before grade/vignette overlays.
- Kept firefly motion in world coordinates but draw them in screen coordinates,
  so they still drift with the field while staying outside depth-of-field blur.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Fireflies are intentionally outside `filteredWorld` now. Do not move them back
  into `lightingLayer` unless they should be blurred by the field DoF again.

## 2026-06-07 - v0.24.51 - Centralize sprite atlas rects (Codex)

### Summary
Reduced atlas-maintenance risk after the modern sprite swaps.
- Added `src/utils/spriteAtlas.ts` as the single source of truth for atlas
  source rectangles.
- Updated both the Canvas fallback loader and PixiJS texture provider to import
  the shared atlas rectangles.
- Removed the duplicated `ATLAS_RECTS` maps that previously had to be kept in
  sync manually.

### Code touched
- `src/utils/spriteAtlas.ts`
- `src/utils/spriteLoader.ts`
- `src/pixi/pixiTextures.ts`
- `package.json`, `package-lock.json`

### Verification
- `rg "const ATLAS_RECTS|ATLAS_RECTS" src/utils src/pixi` OK
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Future atlas rebuilds should update only `src/utils/spriteAtlas.ts` for
  source rectangles, plus `public/sprites/atlas.png` for the image itself.
- This is a source-organization change only; no intended gameplay or visual
  behavior change.

## 2026-06-07 - v0.24.50 - Smooth vertical perspective scale (Codex)

### Summary
Softened and smoothed vertical scale changes for enemies, trees, and pickups.
- Reduced the player-relative depth scale strength for normal objects and
  enemies.
- Narrowed min/max scale clamps so vertical movement feels less extreme.
- Changed the ground-perspective blend from linear interpolation to logarithmic
  interpolation, making scale transitions feel less jumpy.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Main tuning knobs:
  `DEPTH_K`, `ENEMY_DEPTH_K`, and `OBJECT_GROUND_RELATIVE_WEIGHT`.
- If the effect still feels too strong, lower `OBJECT_GROUND_RELATIVE_WEIGHT`
  first before changing sprite visual sizes.

## 2026-06-07 - v0.24.49 - Rebuild atlas from transparent Drive PNG (Codex)

### Summary
Rebuilt the modern enemy/tree/pickup atlas from the transparent PNG supplied in
AI MEGLIO materials, removing the white-edge artifacts left by the JPEG
white-key extraction.
- Source asset:
  `/Users/tanity/マイドライブ（tanity0@gmail.com）/AI MEGLIO/素材/260601/IMG_5503.PNG`
- Used the source alpha channel directly instead of chroma/white-keying.
- Replaced `public/sprites/atlas.png` with the transparent extraction.
- Updated atlas rectangles in both PixiJS and Canvas fallback loaders.
- Bumped app version so sprite cache query strings refresh.

### Code touched
- `public/sprites/atlas.png`
- `src/pixi/pixiTextures.ts`
- `src/utils/spriteLoader.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The local Drive sync path for AI MEGLIO materials is
  `/Users/tanity/マイドライブ（tanity0@gmail.com）/AI MEGLIO/素材`.
- Prefer transparent PNG sources for future sprite atlas updates; avoid JPEG
  white-keying because pale highlights and antialiasing leave visible fringes.

## 2026-06-07 - v0.24.48 - Match object scale to ground perspective relatively (Codex)

### Summary
Reduced the mismatch where enemies, trees, and pickups moved vertically with the
world but did not change scale as strongly as the perspective ground.
- Reintroduced ground-curve influence as a relative scale ratio, using the
  player's current foot position as `1.0`.
- Kept baseline character/object sizes from v0.24.47 instead of applying the
  absolute ground scale that made everything too small in v0.24.42.
- Applied the stronger perspective response through the existing `depthScale`
  path, so enemies, trees, pickups, and their shadows stay visually consistent.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tune `OBJECT_GROUND_RELATIVE_WEIGHT` to adjust how strongly objects follow the
  ground curve. Keep it relative to the player's foot plane to avoid global
  shrinkage.

## 2026-06-07 - v0.24.47 - Enlarge modern sprite presentation (Codex)

### Summary
Adjusted the modern sprite atlas presentation so the pixel art reads larger and
less crushed, closer to an Octopath-style chunky sprite scale.
- Increased player visual scale from `1.7` to `2.05`.
- Added per-enemy visual scale factors while keeping gameplay hitboxes,
  collisions, melee radius, and movement unchanged.
- Increased tree and pickup visual sizes so the new atlas does not collapse into
  tiny unreadable details.
- Resized shadows to follow the enlarged visual boxes.

### Code touched
- `src/pixi/renderSpec.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- This is visual-only scaling. If gameplay feels easier/harder, inspect
  perception first; collision boxes were not changed.

## 2026-06-07 - v0.24.46 - Replace world sprites with modern atlas (Codex)

### Summary
Replaced the enemy, tree, and pickup atlas with the supplied modern pixel-art
sheet.
- Keyed the white JPEG background to transparent and rebuilt
  `public/sprites/atlas.png`.
- Updated the atlas rectangles in both the PixiJS renderer and Canvas fallback.
- Added a version query to `spritePath()` so changed sprite files are not stuck
  behind browser cache.
- Confirmed `public/sprites/player.png` is already the new black-armored
  player sprite; the apparent old sprite was likely cached.

### Sprite mapping
- `zombie`: standing zombie with bat
- `bat`: four-legged crawler
- `skeleton`: armored gas-mask enemy
- `plant`: carnivorous plant
- `ghost`: pale ghost
- `werewolf`: large wolf creature
- `pumpkin`: bloated boss
- `giantbat`: winged demon boss
- `reaper`: scythe reaper
- `tree`: dead tree
- `pickup-xp-blue/green/red`: blue, green, red vials
- `pickup-health`: medical pack
- `pickup-magnet`: magnet
- `pickup-bomb`: bomb
- `pickup-chest`: open chest

### Code touched
- `public/sprites/atlas.png`
- `src/pixi/pixiTextures.ts`
- `src/utils/spriteLoader.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The unused hooded normal enemy from the source sheet was intentionally skipped.
- If the player still appears old in browser, force reload once; future sprite
  loads now include the app version query.

## 2026-06-07 - v0.24.45 - Restore object visual sizes (Codex)

### Summary
Restored character, enemy, item, and projectile sizes after the
ground-perspective scale trial.
- Removed the ground-derived object scale blend from `depthScaleWith`.
- Removed `groundObjectScale()` and related tuning constants.
- Reset projectile graphics scale to `1` each frame so old scale state cannot
  persist.
- Kept the strong perspective ground, seam fixes, and outlined player sprite
  unchanged.

### Code touched
- `src/pixi/pixiScene.ts` (object scale reset)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- v0.24.42 was the object-scale trial that made world objects too small.
- If object speed/scale matching is revisited, keep it behind a small trial
  constant and avoid changing baseline sprite sizes globally.

## 2026-06-07 - v0.24.44 - Sharpen player sprite outline (Codex)

### Summary
Regenerated the player sprite with a clearer pixel outline.
- Used the reusable `AI_MEGLIO/skills/purple_key_sprite` workflow.
- Kept the purple-background keying and `32x32` transparent PNG contract.
- Added a dark 1px pixel outline to improve readability over the darker forest
  and moss ground.

### Code touched
- `public/sprites/player.png`
- `package.json`, `package-lock.json`

### Verification
- `file public/sprites/player.png` OK (`32 x 32`, RGBA PNG)
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Runtime code was not changed.
- The reusable purple-key sprite workflow now lives in
  `/Users/tanity/AI_MEGLIO/skills/purple_key_sprite/`.

## 2026-06-07 - v0.24.43 - Replace player sprite (Codex)

### Summary
Replaced the player sprite with the supplied black-armored character.
- Converted the supplied purple-background image into a transparent PNG.
- Cropped the foreground character and resized it to match the existing
  `32x32` player sprite contract.
- Replaced `public/sprites/player.png`.

### Code touched
- `public/sprites/player.png`
- `package.json`, `package-lock.json`

### Verification
- `file public/sprites/player.png` OK (`32 x 32`, RGBA PNG)
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The purple background was keyed out via a one-off local CoreGraphics/Swift
  conversion script. No runtime code changed.
- If the in-game sprite feels too small/large, regenerate the sprite with a
  different crop padding rather than changing gameplay box sizes.

## 2026-06-07 - v0.24.42 - Match object scale to ground perspective (Codex)

### Summary
Aligned object visual scale more closely with the perspective ground.
- Added `groundObjectScale()` based on the same horizon-to-foreground curve used
  by the ground strips.
- Blended that ground-derived scale into the existing tree/player/enemy/item
  depth scale.
- Applied the same depth scale to projectile graphics.
- Left gameplay positions, hitboxes, collision, and simulation speed unchanged.

### Code touched
- `src/pixi/pixiScene.ts` (object scale derived from ground perspective)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- This is a visual-only scale pass. If object movement speed also needs to
  parallax with the ground, do it as a separate trial because it can create
  visible hitbox/position mismatch.
- Tune `OBJECT_GROUND_SCALE_WEIGHT` for how strongly objects follow the ground
  curve, and `OBJECT_GROUND_SCALE_MIN/MAX` for far/near size limits.

## 2026-06-07 - v0.24.41 - Trial stronger ground perspective (Codex)

### Summary
Created a trial version with stronger ground depth, closer to the first
perspective pass, while preserving the v0.24.40 sampling fixes.
- Changed `GROUND_TILE_SCALE_Y_FAR` from `0.38` to `0.12`.
- Changed `GROUND_PERSPECTIVE_CURVE` from `1.45` to `2.05`.
- Kept the 72-strip ground and scale-aware tilePosition from v0.24.40.

### Code touched
- `src/pixi/pixiScene.ts` (ground perspective tuning)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- `v0.24.40` / commit `1a1deea` is the current preferred stable baseline for
  the perspective ground before this stronger-depth trial.
- If this trial feels too aggressive, compare against `v0.24.40` and tune
  `GROUND_TILE_SCALE_Y_FAR` upward before changing other constants.

## 2026-06-07 - v0.24.40 - Reduce perspective ground sampling artifacts (Codex)

### Summary
Reduced visible artifacts in the perspective ground while moving vertically.
- Increased perspective ground strips from `36` to `72` so each band is thinner.
- Changed strip tile position to account for `tileScale`, keeping source-image
  sampling continuous across scaled strips.
- Kept the softened depth tuning from v0.24.38/v0.24.39.

### Code touched
- `src/pixi/layers.ts` (ground strip count)
- `src/pixi/pixiScene.ts` (ground tilePosition sampling)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If artifacts remain, the next safer step is to reduce `GROUND_TILE_SCALE_Y`
  contrast further or replace the strip method with a single pre-rendered
  perspective texture.

## 2026-06-06 - v0.24.39 - Smooth perspective ground strip seams (Codex)

### Summary
Reduced visible texture jumps between perspective ground strips.
- Removed per-strip horizontal scale variation.
- Kept `GROUND_TILE_SCALE_X` constant so vertical strip borders align better.
- Changed vertical tile sampling to accumulate continuous source Y across
  strips instead of recalculating each strip independently.
- Slightly overlapped strip heights to hide subpixel seams.

### Code touched
- `src/pixi/pixiScene.ts` (ground strip texture sampling)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If strip seams remain visible, increase strip count in `src/pixi/layers.ts`
  or add a tiny per-strip alpha overlap mask.

## 2026-06-06 - v0.24.38 - Soften ground perspective depth (Codex)

### Summary
Reduced the perceived depth/motion of the perspective ground.
- Changed `GROUND_TILE_SCALE_Y_FAR` from `0.06` to `0.38`.
- Changed `GROUND_PERSPECTIVE_CURVE` from `2.15` to `1.45`.
- Left the supplied moss/dirt texture and strip count unchanged.

### Code touched
- `src/pixi/pixiScene.ts` (ground perspective tuning)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If the ground still moves too much, raise `GROUND_TILE_SCALE_Y_FAR` further
  toward `0.5`. If it becomes too flat, lower it toward `0.25`.

## 2026-06-06 - v0.24.37 - Add perspective moss ground (Codex)

### Summary
Replaced the generated forest-floor base with the supplied moss/dirt ground
texture and added a lightweight pseudo-perspective ground renderer.
- Added `public/backgrounds/ground-moss-dirt.jpg`.
- Loaded the new ground texture in `PixiStage`.
- Changed `groundBase` from one `TilingSprite` to a `Container` of 36 horizontal
  tiled strips.
- Scaled each strip vertically so the ground compresses toward the horizon
  forest, matching the supplied perspective reference without a 3D mesh.

### Code touched
- `public/backgrounds/ground-moss-dirt.jpg`
- `src/pixi/PixiStage.tsx` (ground texture loading)
- `src/pixi/layers.ts` (strip-based ground layer)
- `src/pixi/pixiScene.ts` (perspective strip layout and sync)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK
- `curl -I http://localhost:5175/zombie/backgrounds/ground-moss-dirt.jpg` OK
  (`200`, `image/jpeg`)

### Handoff notes
- Tune `GROUND_TILE_SCALE_Y_FAR`, `GROUND_TILE_SCALE_Y_NEAR`, and
  `GROUND_PERSPECTIVE_CURVE` for stronger/weaker horizon compression.

## 2026-06-06 - v0.24.36 - Fade actors into horizon forest (Codex)

### Summary
Changed the horizon disappearance from an abrupt cutoff to a distance-based fade.
- Added `HORIZON_ACTOR_FADE_PX = 120`.
- Faded trees, enemy containers, enemy shadows, and enemy lights as their foot
  position approaches the horizon forest hide line.
- Kept the final fully-hidden point at the forest seam line from v0.24.35.

### Code touched
- `src/pixi/pixiScene.ts` (actor/tree/shadow/light horizon alpha)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tune `HORIZON_ACTOR_FADE_PX` for fade length. Larger values fade earlier and
  more gradually; smaller values fade later and faster.

## 2026-06-06 - v0.24.35 - Separate actor hide line from ground fade (Codex)

### Summary
Fixed enemies/trees not disappearing near the horizon forest.
- Added `HORIZON_ACTOR_HIDE_OFFSET_PX`.
- Kept ground/world reveal using `HORIZON_REVEAL_OFFSET_PX`.
- Changed enemy/tree hide cutoff to use the rendered `horizonForest` bottom
  line instead of the much higher ground-fade zero line.

### Code touched
- `src/pixi/pixiScene.ts` (horizon actor hide cutoff)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If actors vanish too early/late at the forest seam, tune
  `HORIZON_ACTOR_HIDE_OFFSET_PX` without changing the ground fade constants.

## 2026-06-06 - v0.24.34 - Restore horizon actor fade cutoff (Codex)

### Summary
Restored the enemy/tree fade-out behavior near the horizon forest.
- Added `horizonRevealZeroScreenY()` so the cutoff is derived from the current
  visible `horizonForest` position every frame.
- Updated `horizonForestFootWorldY` during `sync()` after the forest position is
  set, avoiding stale resize-time cutoff values.
- Kept the bottom 10px forest fade and the 100px raised seam placement.

### Code touched
- `src/pixi/pixiScene.ts` (horizon fade cutoff calculation)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If actors still appear in front of the far panorama, inspect
  `HORIZON_REVEAL_OFFSET_PX` first; the cutoff now follows the rendered forest.

## 2026-06-06 - v0.24.33 - Fade horizon forest bottom edge (Codex)

### Summary
Softened the lower edge of the visible boundary forest.
- Added a dedicated alpha mask for `horizonForest`.
- Kept the forest opaque through most of its height, fading only the bottom
  `10px` to transparent.
- Left horizon placement, gameplay cutoff, ground rendering, and layer order
  unchanged.

### Code touched
- `src/pixi/pixiScene.ts` (horizon forest bottom alpha mask)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tune `HORIZON_FOREST_BOTTOM_FADE_PX` if the seam needs a wider/narrower fade.

## 2026-06-06 - v0.24.32 - Raise horizon forest seam (Codex)

### Summary
Moved the visible boundary forest seam 100px upward.
- Added `HORIZON_FOREST_Y_OFFSET_PX = -100`.
- Applied the offset in both resize and frame sync placement.
- Left horizon reveal/fade logic, gameplay alpha cutoff, ground, and layer order unchanged.

### Code touched
- `src/pixi/pixiScene.ts` (horizon forest Y placement)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If the forest now overlaps the HUD/far backdrop too much, tune only
  `HORIZON_FOREST_Y_OFFSET_PX` first.

## 2026-06-06 - v0.24.31 - Render horizon forest as sprite (Codex)

### Summary
Made the boundary forest layer render without tiling/cropping.
- Changed `horizonForest` from `TilingSprite` to a regular `Sprite`.
- Removed `tileScale` / `tilePosition` handling for the boundary forest.
- Kept it as the topmost non-UI layer, after `frontForest` and before `uiLayer`.

### Code touched
- `src/pixi/layers.ts` (horizon forest display type)
- `src/pixi/pixiScene.ts` (removed horizon forest tiling controls)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- This is a visibility fix. If the forest is now too vertically compressed,
  tune `HORIZON_FOREST_HEIGHT_RATIO/MIN/MAX` next.

## 2026-06-06 - v0.24.30 - Move horizon forest to top non-UI layer (Codex)

### Summary
Moved the boundary forest layer to the top of the game scene.
- Removed `horizonForest` from `worldGroup`.
- Added `horizonForest` directly to the stage after `frontForest` and before
  `uiLayer`, making it the topmost non-UI visual layer.
- Kept `HORIZON_REVEAL_OFFSET_PX = 200` and the restored individual far-hide
  behavior unchanged.

### Code touched
- `src/pixi/layers.ts` (horizon seam stage order)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- `uiLayer` remains above the forest so HUD, mobile controls, flashes, and
  arrows remain usable.

## 2026-06-06 - v0.24.29 - Keep horizon forest visible above gameplay fade (Codex)

### Summary
Restored visibility for the forest that sits in front of the distant backdrop.
- Moved `horizonForest` above `filteredWorld` inside `worldGroup`.
- Kept `HORIZON_REVEAL_OFFSET_PX = 200` and the restored individual far-hide
  behavior unchanged.
- This separates the seam forest PNG from gameplay/object transparency tuning.

### Code touched
- `src/pixi/layers.ts` (horizon seam draw order)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- `HORIZON_REVEAL_OFFSET_PX` controls gameplay object cutoff, not the
  `horizonForest` PNG position.

## 2026-06-06 - v0.24.28 - Raise restored horizon cutoff by 40px (Codex)

### Summary
Adjusted the restored horizon disappearance point.
- Changed `HORIZON_REVEAL_OFFSET_PX` from 160 to 200, moving the disappear point
  another 40px upward.
- Kept the restored individual far-hide behavior intact.

### Code touched
- `src/pixi/pixiScene.ts` (horizon reveal offset)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current restored cutoff: `HORIZON_REVEAL_OFFSET_PX = 200`.

## 2026-06-06 - v0.24.27 - Raise restored horizon cutoff by another 30px (Codex)

### Summary
Adjusted the restored horizon disappearance point.
- Changed `HORIZON_REVEAL_OFFSET_PX` from 130 to 160, moving the disappear point
  another 30px upward.
- Kept the restored individual far-hide behavior intact.

### Code touched
- `src/pixi/pixiScene.ts` (horizon reveal offset)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current restored cutoff: `HORIZON_REVEAL_OFFSET_PX = 160`.

## 2026-06-06 - v0.24.26 - Raise restored horizon cutoff by 30px (Codex)

### Summary
Adjusted the restored horizon disappearance point.
- Changed `HORIZON_REVEAL_OFFSET_PX` from 100 to 130, moving the disappear point
  30px upward.
- Kept the restored individual far-hide behavior intact.

### Code touched
- `src/pixi/pixiScene.ts` (horizon reveal offset)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current restored cutoff: `HORIZON_REVEAL_OFFSET_PX = 130`.

## 2026-06-06 - v0.24.25 - Raise restored horizon cutoff slightly (Codex)

### Summary
Adjusted the restored v0.24.23 horizon disappearance point.
- Changed `HORIZON_REVEAL_OFFSET_PX` from 50 to 100, moving the disappear point
  50px upward.
- Kept the restored individual far-hide behavior intact.

### Code touched
- `src/pixi/pixiScene.ts` (horizon reveal offset)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current restored cutoff: `HORIZON_REVEAL_OFFSET_PX = 100`.

## 2026-06-06 - v0.24.24 - Lower restored horizon cutoff (Codex)

### Summary
Adjusted the restored v0.24.23 horizon disappearance point.
- Changed `HORIZON_REVEAL_OFFSET_PX` from 150 to 50, moving the disappear point
  100px downward.
- Kept the v0.24.23 individual far-hide behavior intact.

### Code touched
- `src/pixi/pixiScene.ts` (horizon reveal offset)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- This is based on the restored v0.24.23 logic, not the later v0.24.30/31 path.

## 2026-06-06 - v0.24.23 restore - Restore completed horizon fade behavior (Codex)

### Summary
Restored the runtime code to the known-good `6d3f17a / v0.24.23` state after
the later branch/version confusion.
- Restored `package.json`, `package-lock.json`, `src/pixi/layers.ts`, and
  `src/pixi/pixiScene.ts` from commit `6d3f17a`.
- This brings back the completed top-edge disappearance logic where gameplay
  objects use the shared horizon fade and hard cutoff behavior from v0.24.23.

### Code touched
- `package.json`, `package-lock.json`
- `src/pixi/layers.ts`
- `src/pixi/pixiScene.ts`
- `DEVELOPMENT_LOG.md` (this restore note)

### Verification
- `npm run lint` pending
- `npm run build` pending

### Handoff notes
- Treat `6d3f17a / v0.24.23` as the reference point for the horizon fade logic.
- Do not remove the individual far-hide logic again unless explicitly requested.

## 2026-06-06 - v0.24.31 - Use alpha channel for horizon fade mask (Codex)

### Summary
Fixed the shared horizon fade mask so it actually uses the transparent gradient.
- Switched `filteredWorld` from `.mask = worldFadeMask` to
  `setMask({ mask: worldFadeMask, channel: 'alpha' })`.
- Kept trees/enemies visible individually; all top-edge disappearance should come
  from the shared alpha mask.

### Code touched
- `src/pixi/pixiScene.ts` (mask channel selection)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Pixi sprite masks read the red channel by default. This mask is encoded in
  canvas alpha, so it must stay on `channel: 'alpha'`.

## 2026-06-06 - v0.24.30 - Restore shared horizon fade without hiding trees (Codex)

### Summary
Fixed the horizon fade behavior after the branch restore confusion.
- Removed the remaining per-tree and per-enemy hard alpha cutoff.
- Kept `worldFadeMask` as the single shared top-edge fade for all gameplay
  rendering in `filteredWorld`.
- Restored trees, enemy shadows, and enemy lights so they fade with the shared
  mask instead of disappearing independently.

### Code touched
- `src/pixi/pixiScene.ts` (removed individual far-hide alpha gates)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Top-edge disappearance should now be controlled by `HORIZON_REVEAL_OFFSET_PX`
  and `HORIZON_REVEAL_FADE_PX` only.

## 2026-06-06 - v0.24.29 - Shrink horizon seam forest (Codex)

### Summary
Adjusted the horizon seam forest scale after screenshot review.
- Reduced horizon seam forest height tuning by about half:
  `0.3 / 170-260px` -> `0.15 / 85-130px`.
- Kept `HORIZON_FOREST_Y_OFFSET_PX = -100`.

### Code touched
- `src/pixi/pixiScene.ts` (horizon seam height tuning)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current seam draw order is still topmost non-UI for visual tuning.

## 2026-06-06 - v0.24.28 - Lower horizon seam forest slightly (Codex)

### Summary
Adjusted the horizon seam forest placement after screenshot review.
- Changed `HORIZON_FOREST_Y_OFFSET_PX` from -200 to -100, moving the seam forest
  100px downward.
- Kept the temporary topmost non-UI draw order and front forest blur disabled.

### Code touched
- `src/pixi/pixiScene.ts` (horizon seam Y offset)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current seam placement offset: `HORIZON_FOREST_Y_OFFSET_PX = -100`.

## 2026-06-06 - v0.24.27 - Move horizon seam forest upward (Codex)

### Summary
Adjusted the visible horizon seam forest placement after screenshot review.
- Added `HORIZON_FOREST_Y_OFFSET_PX = -200`.
- Moved the horizon seam forest 200px upward in both resize and per-frame sync.
- Kept the temporary topmost non-UI draw order and front forest blur disabled.

### Code touched
- `src/pixi/pixiScene.ts` (horizon seam Y offset)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current seam placement is intentionally frontmost for visibility testing. Once
  the visual position is approved, decide whether to move it back below
  `frontForest` or keep it as a foreground seam.

## 2026-06-06 - v0.24.26 - Disable front forest blur and force horizon seam front (Codex)

### Summary
Adjusted forest layers after playtest feedback.
- Disabled the bottom/front forest blur by setting `FRONT_FOREST_BLUR = 0` and
  only creating a `BlurFilter` when the value is greater than zero.
- Enlarged the horizon seam forest band and increased overlap with the far/ground
  boundary so the seam forest should be more visible.
- Moved `horizonForest` out of `worldGroup` and above `frontForest` so it is the
  topmost non-UI layer for visibility testing.

### Code touched
- `src/pixi/layers.ts` (temporary topmost horizon seam draw order)
- `src/pixi/pixiScene.ts` (forest layer tuning)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If the horizon seam still does not appear in this topmost placement, the next
  check should be the visible source region of `horizon-forest-band.png`, not
  enemy/tree alpha or draw order.

## 2026-06-06 - v0.24.25 - Keep horizon seam clear of world fade mask (Codex)

### Summary
Adjusted the shared horizon fade mask so it cannot cover the horizon seam forest.
- Moved `worldFadeMask` from `worldGroup` into `filteredWorld`.
- Kept the mask applied only to gameplay rendering.
- Left `horizonForest` outside the mask and above gameplay in draw order.

### Code touched
- `src/pixi/pixiScene.ts` (mask parent)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The per-enemy/per-procedural-tree hide logic still only affects gameplay
  actors/trees, not the `horizonForest` seam PNG.

## 2026-06-06 - v0.24.24 - Draw horizon forest seam above gameplay world (Codex)

### Summary
Restored visibility for the horizon boundary forest.
- Moved `horizonForest` above `filteredWorld` in `worldGroup` draw order.
- Kept `groundBase` below gameplay and outside DoF/bloom filters.
- Kept the shared horizon fade mask unchanged.

### Code touched
- `src/pixi/layers.ts` (horizon seam draw order)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Horizon seam forest should remain outside the gameplay filter wrapper and draw
  over the far/ground transition.

## 2026-06-06 - v0.24.23 - Lower horizon fade cutoff slightly (Codex)

### Summary
Adjusted the horizon reveal after playtest feedback.
- Moved the fully-hidden gameplay fade cutoff 50px lower, from 200px above the
  horizon forest foot to 150px above it.
- Kept the shared `filteredWorld` mask and fade length unchanged.

### Code touched
- `src/pixi/pixiScene.ts` (horizon reveal offset)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current cutoff: `HORIZON_REVEAL_OFFSET_PX = 150`.

## 2026-06-06 - v0.24.22 - Raise horizon fade cutoff again (Codex)

### Summary
Adjusted the horizon reveal further after playtest feedback.
- Moved the fully-hidden gameplay fade cutoff from 100px above the horizon
  forest foot to 200px above it.
- Kept the shared `filteredWorld` mask and fade length unchanged.

### Code touched
- `src/pixi/pixiScene.ts` (horizon reveal offset)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The fade now starts much higher; if the fade feels too long or too short,
  tune `HORIZON_REVEAL_FADE_PX` separately.

## 2026-06-06 - v0.24.21 - Raise horizon fade cutoff (Codex)

### Summary
Adjusted the horizon reveal after playtest feedback.
- Moved the fully-hidden gameplay fade cutoff from 50px above the horizon forest
  foot to 100px above it.
- Kept the same shared `filteredWorld` mask approach and fade length.

### Code touched
- `src/pixi/pixiScene.ts` (horizon reveal offset)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If objects still pop near the top, tune `HORIZON_REVEAL_FADE_PX` next rather
  than adding per-object alpha rules.

## 2026-06-06 - v0.24.20 - Smooth horizon reveal fade (Codex)

### Summary
Smoothed the top-edge appearance of gameplay objects near the horizon forest.
- Moved the hard fully-hidden line 50px upward from the horizon forest foot.
- Added a screen-space alpha mask to `filteredWorld` so all gameplay rendering
  fades in together from the forest line instead of popping in per object.
- Kept the existing per-tree/per-enemy full hide as a backup at the alpha-zero
  line while pickups, projectiles, effects, and actors share the same mask fade.

### Code touched
- `src/pixi/pixiScene.ts` (horizon reveal mask and shifted hide line)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The fade is implemented as one stretched 4px-wide canvas texture mask, so it
  avoids per-object opacity work and should stay cheap.

## 2026-06-06 - v0.24.19 - Restore actor/object visibility after ground filter split (Codex)

### Summary
Fixed a regression where the ground rendered above characters, enemies, trees,
pickups, and other gameplay objects.
- Added a screen-space `filteredWorld` wrapper between `worldGroup` and the
  camera-offset `world`.
- Kept `groundBase` and `horizonForest` outside the DoF/bloom filters.
- Applied DoF/bloom to `filteredWorld`, not directly to the camera-offset
  `world`, so the filter area stays aligned to the screen and gameplay objects
  render above the ground again.

### Code touched
- `src/pixi/layers.ts` (added `filteredWorld` wrapper)
- `src/pixi/pixiScene.ts` (filter target moved to `filteredWorld`)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Do not apply screen-sized filter areas directly to the camera-offset `world`.
  Use a screen-space wrapper when filtering gameplay layers without including
  the fixed ground.

## 2026-06-06 - v0.24.18 - Keep ground out of DoF and hide far actors (Codex)

### Summary
Fixed the ground bleeding over the distant panorama and made far-side actors
disappear behind the horizon forest.
- Moved bloom/tilt-shift filters from `worldGroup` to the camera-offset `world`
  so `groundBase` and `horizonForest` are not blurred into the panorama.
- Added a horizon-forest foot line in world coordinates.
- Set tree sprites and enemy containers to `alpha = 0` when their foot position
  is above that line.
- Skipped hidden enemies' lights and foot shadows.

### Code touched
- `src/pixi/layers.ts` (filter ownership comment)
- `src/pixi/pixiScene.ts` (filter target and far actor/tree hiding)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The ground should stay outside DoF/bloom. If blur is needed later, add a
  separate ground-only effect that cannot sample into the panorama band.
- The player is intentionally not hidden by the horizon line in this pass.

## 2026-06-06 - v0.24.17 - Restore Claude v0.24.7 melee crest (Codex)

### Summary
Corrected the melee/counter indicator target after clarification.
- Replaced the restored 360-degree ring with Claude Code's `v0.24.7` static
  crest/crescent indicator.
- Kept the horizon seam forest layering fix from `v0.24.16` intact.

### Code touched
- `src/pixi/pixiScene.ts` (melee/counter crest restore)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The intended melee indicator is the Claude Code `v0.24.7` crest/crescent,
  not the earlier Codex 360-degree ring.

## 2026-06-06 - v0.24.16 - Restore smooth melee ring and reveal seam forest (Codex)

### Summary
Fixed two regressions spotted during visual review.
- Restored the smooth 360-degree melee/counter ring with subtle right-side
  thickening from the earlier Codex pass, replacing the static crescent style
  that had remained from the later Claude Code tuning.
- Moved `horizonForest` into `worldGroup` above `groundBase` and below the
  camera-offset `world`, so the seam forest is visible over the ground/far
  boundary without covering actors.

### Code touched
- `src/pixi/layers.ts` (horizon forest layer ordering)
- `src/pixi/pixiScene.ts` (melee/counter ring restore, import cleanup)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If the seam forest disappears again, check that it is a child of `worldGroup`
  after `groundBase`, not a stage child behind `worldGroup`.
- The intended melee indicator is the smooth full ring, not the static crescent.

## 2026-06-06 - v0.24.15 - Lower horizon forest seam (Codex)

### Summary
Adjusted the horizon forest seam so it hides the ground/panorama boundary
without covering too much of the distant backdrop.
- Reduced the horizon forest height.
- Lowered the layer by reducing its overlap into the far backdrop.

### Code touched
- `src/pixi/pixiScene.ts` (`HORIZON_FOREST_*` tuning)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If it still covers too much distant scenery, lower `HORIZON_FOREST_OVERLAP_RATIO`
  further. If a hard seam appears, raise it slightly.

## 2026-06-06 - v0.24.14 - Smaller blurred front forest (Codex)

### Summary
Adjusted the nearest foreground forest after visual review.
- Changed the front forest from full-screen cover sizing to a bottom-anchored
  band with capped height, so the trees read closer to normal scale.
- Added a light Pixi `BlurFilter` to soften the nearest foreground layer.
- Kept front forest parallax horizontal-only.

### Code touched
- `src/pixi/pixiScene.ts` (front forest sizing and blur)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tune `FRONT_FOREST_HEIGHT_RATIO`, `FRONT_FOREST_MIN_HEIGHT`,
  `FRONT_FOREST_MAX_HEIGHT`, and `FRONT_FOREST_BLUR` in
  `src/pixi/pixiScene.ts` after on-device visual review.

## 2026-06-06 - v0.24.13 - Horizon forest seam and horizontal-only parallax (Codex)

### Summary
Refined the depth-background setup based on visual feedback.
- Converted the supplied purple-back boundary forest image into
  `public/backgrounds/horizon-forest-band.png`.
- Added a `horizonForest` screen-space seam layer between the distant panorama
  and the ground.
- Removed the previous dark rectangle horizon blend layer that looked like a
  black band over the distant church/castle area.
- Stopped vertical parallax for the distant panorama and nearest foreground
  forest so endless north/south movement cannot expose texture edges.

### Code touched
- `src/pixi/layers.ts` (horizon forest layer)
- `src/pixi/PixiStage.tsx` (horizon forest texture load)
- `src/pixi/pixiScene.ts` (seam layout, horizontal-only far/front parallax)
- `public/backgrounds/horizon-forest-band.png`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tune `HORIZON_FOREST_*` constants in `src/pixi/pixiScene.ts` if the seam
  sits too high/low on phone screens.
- The source is JPEG chroma-keyed, so a true alpha PNG would still be cleaner if
  purple fringe appears against the panorama.

## 2026-06-06 - v0.24.12 - Front forest foreground parallax layer (Codex)

### Summary
Added the supplied purple-back forest image as the nearest foreground layer.
- Converted the purple JPEG background into an alpha PNG locally and saved it as
  `public/backgrounds/front-forest-foreground.png`.
- Added a new `frontForest` screen-space `TilingSprite` above the Pixi world and
  below the UI layer.
- Gave the front forest faster parallax than the ground so it reads as the
  closest moving layer.

### Code touched
- `src/pixi/layers.ts` (front forest layer)
- `src/pixi/PixiStage.tsx` (front forest texture load)
- `src/pixi/pixiScene.ts` (front forest resize/parallax sync)
- `public/backgrounds/front-forest-foreground.png`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK
- `curl -I http://localhost:5176/zombie/backgrounds/front-forest-foreground.png` OK (`200`, `image/png`)

### Handoff notes
- Tune `FRONT_FOREST_PARALLAX_X`, `FRONT_FOREST_PARALLAX_Y`, and
  `FRONT_FOREST_ALPHA` in `src/pixi/pixiScene.ts` after on-device visual review.
- The source was a JPEG chroma key, so a small purple edge fringe may remain; a
  true alpha PNG source would be cleaner if this becomes noticeable in motion.

## 2026-06-06 - v0.24.10 - Opaque panorama and horizon blend (Codex)

### Summary
Adjusted the new distant panorama based on visual feedback.
- Made the far panorama fully opaque (`alpha = 1`) so it reads as a solid
  background instead of slightly translucent.
- Added a soft dark horizon blend band over the panorama/ground boundary so the
  transition into the ground feels foggier and less hard-edged.

### Code touched
- `src/pixi/pixiScene.ts` (far backdrop opacity and horizon blend overlay)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Boundary softness is controlled by `HORIZON_BLEND_HEIGHT` and the three
  rectangles in `drawHorizonBlend()`.

## 2026-06-06 - v0.24.9 - Distant panorama parallax layer (Codex)

### Summary
Added the first background-depth pass using the generated distant panorama.
- Added `public/backgrounds/distant-night-panorama.jpg`.
- Added a new `farBackdrop` screen-space TilingSprite behind the Pixi world.
- The panorama occupies the upper horizon band and scrolls slowly with camera
  movement for parallax depth.
- Shifted the forest-floor `groundBase` down so the top band remains distant
  scenery instead of tiled ground.

### Code touched
- `src/pixi/layers.ts` (far backdrop layer)
- `src/pixi/PixiStage.tsx` (load distant panorama texture)
- `src/pixi/pixiScene.ts` (resize/parallax layout)
- `public/backgrounds/distant-night-panorama.jpg`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tune `FAR_BACKDROP_HEIGHT_RATIO`, `FAR_BACKDROP_MIN_HEIGHT`, and parallax
  constants in `src/pixi/pixiScene.ts` after on-device visual review.
- Next depth pass should add a soft horizon mist/seam treatment and lightweight
  ground-depth shading below the panorama.

## 2026-06-06 - v0.24.8 - Melee ammo drop slider fallback fix (Codex)

### Summary
Investigated the report that ammo drops from melee-circle kills did not feel
linked to the start-screen percentage.
- Confirmed the normal melee kill path reads `meleeAmmoDropPercent / 100`, and
  melee finishers still use `×1.5` capped at 100%.
- Found one mismatch: melee kills only created ammo when `getActiveGun(player)`
  returned a gun with `ammoType`, while gun kills already fall back to owned gun
  ammo types.
- Added the same owned-gun fallback to melee kills so the start-screen slider
  governs melee drops even if the active gun pointer is temporarily unavailable.

### Code touched
- `src/store/gameStore.ts` (melee ammo drop fallback)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The label says "撃破時。近接フィニッシュは×1.5。"; current behavior matches
  that: all kills use the slider, melee finishers multiply it.
- If the user wants the slider to apply only to melee kills again, revert the
  gun-kill drop block in `src/hooks/useGameLoop.ts` from v0.24.5.

## 2026-06-05 - v0.24.7 - Thicker melee crescent + 0.1s freeze on knockback-immune (Claude Code)

### Summary
- Melee crescent a touch thicker: stroke `4*taper+0.4` -> `5*taper+0.6`.
- Melee counter on an enemy whose knockback is on cooldown (would NOT be shoved)
  now freezes it in place for 0.1s instead of doing nothing. Implemented by
  reusing the knockback override with zero velocity (`knockbackVx/Vy = 0`,
  `knockbackUntil = now + 100`) in `triggerCounter`'s immune branch, so
  `updateEnemies` holds it still (no chase) for 100ms while damage still lands.

### Code touched
- `src/pixi/pixiScene.ts` (crescent width), `src/store/gameStore.ts` (freeze)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK / `npm run build` OK. Pushed -> Pages auto-deploy.

## 2026-06-05 - v0.24.6 - Melee circle: static, quick, thinner (Claude Code)

### Summary
Tuned the melee/counter reach circle per feedback:
- No rotation: the blade is now a STATIC crescent (faces the player's last
  heading) instead of a comet sweeping around the ring.
- Quicker: it snaps in and fades over ~140ms (a brief flash) rather than showing
  for the whole counter window.
- Thinner reach ring: faint full ring width 1.4 -> 0.8.

### Code touched
- `src/pixi/pixiScene.ts` (syncPlayerFx counter-window branch; import COUNTER_WINDOW)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK / `npm run build` OK. Pushed -> Pages auto-deploy.

### Handoff notes
- Flash duration is the `/ 140` term; crescent width via the stroke `4*taper+0.4`;
  reach ring width 0.8 — all easy to retune.

## 2026-06-05 - v0.24.5 - Pause-on-levelup, ammo drop on all kills, weapon popup position (Claude Code)

### Summary
1. Level-up (and any pause) now stops the sim reliably: the game loop read
   `isPaused` from the captured closure, which could stay stale during the async
   effect re-run window, so the sim kept running for a few frames. Now reads
   `useGameStore.getState().isPaused` fresh inside the loop.
2. Ammo drop rate now applies to ALL kills, not just melee. The melee-only rate
   felt like ~20% because the auto-gun lands most killing blows (it even avoids
   stunned enemies, but still steals normal kills). Gun kills now roll an ammo
   drop at the start-screen rate (melee path already did; finisher still x1.5).
   Start-screen label updated: "撃破時。近接フィニッシュは×1.5。". Revertible to
   melee-only if undesired.
3. New-weapon popup moved down (top +64px -> +118px) so it no longer overlaps the
   HP/EXP status card.

### Code touched
- `src/hooks/useGameLoop.ts` (fresh isPaused read; ammo drop on gun kills)
- `src/components/GameHUD.tsx` (weapon popup position)
- `src/components/MainMenu.tsx` (drop-rate label)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK / `npm run build` OK. Pushed -> Pages auto-deploy.

### Handoff notes
- At 100% drop, every kill now drops an ammo box of the active gun's family —
  that's a lot of pickups; the slider is meant to be dialed down for normal play.
- Still deferred: Marksman magnum-vs-sniper direction.

## 2026-06-05 - v0.24.4 - Audio fixes: melee-kill grunt, iOS BGM toggle/volume, balance (Claude Code)

### Summary
1. Enemies killed by slash/melee now grunt: `triggerCounter` returns a `killed`
   count on `CounterTriggerResult`; both input handlers call `playEnemyDeath()`
   when `killed > 0` (was only on gun/projectile kills).
2. BGM toggle/volume on iOS fixed: HTMLAudioElement.volume is ignored on iOS, so
   the old volume-fade couldn't mute or balance BGM there. BGM is now routed
   through the SFX WebAudio context via a GainNode (createMediaElementSource ->
   gain -> destination), with on/off done by play()/pause(). Removed the fade
   timer; added `ensureBgmRouting()` + `applyBgm()`; `setAudioMuted`/`setBgmActive`
   just call `applyBgm()`. Falls back to element.volume if routing is unsupported.
3. Volume balance: BGM 0.42 -> 0.30; quiet SFX nudged up (pickup .62->.74,
   handgun .46->.52, shotgun .58->.66, rifle .54->.62); over-loud counter
   .98->.88.

### Code touched
- `src/audio/audioManager.ts` (BGM WebAudio routing, volume balance)
- `src/store/gameStore.ts` (`CounterTriggerResult.killed`)
- `src/components/VirtualJoystick.tsx`, `src/hooks/useGameControls.ts` (grunt on melee kill)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK / `npm run build` OK. Pushed -> Pages auto-deploy.
- iOS BGM routing uses createMediaElementSource; needs an on-device check that
  BGM both plays and toggles after the WebAudio routing (fallback included).

### Handoff notes
- Per-file inherent loudness still varies; the volume numbers in `SFX_SOURCES`
  are easy to retune. If a specific SE is still extreme, adjust its `volume`.
- Still DEFERRED (need user input): melee-kill ammo drop rate, Marksman magnum.

## 2026-06-05 - v0.24.3 - Stylish melee circle + shotgun/handgun ammo tweaks (Claude Code)

### Summary
Visual:
- Restyled the melee/counter reach circle (`syncPlayerFx`) again, per reference
  (Samurai Shodown circular slash, but refined): a faint reach ring plus a
  comet-like blade arc that tapers from a bright head to a thin tail and sweeps
  around the circle. Replaced the previous rotating "rune" ring.

Balance (requested):
- Shotgun now spends 1 round per trigger pull (was 1 per pellet). `fireWeapon`
  `consume = 1`; shotgun magazines resized from pellet-counts (15/18/21) to
  3 shots each (preserves the old ~3-shots-per-mag cadence, reserve lasts far
  longer).
- Handgun starting reserve halved: `AMMO_INITIAL.handgun` 120 -> 60.

### Code touched
- `src/pixi/pixiScene.ts` (melee circle), `src/utils/weaponUtils.ts` (shotgun),
  `src/store/gameStore.ts` (handgun ammo), `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK / `npm run build` OK. Pushed to the dev branch, which the
  Pages workflow auto-deploys to https://tanity0.github.io/zombie/ .

### Handoff notes — DEFERRED (need user input, left unchanged)
- Melee-kill ammo DROP rate: code in `triggerCounter` already applies
  `meleeAmmoDropPercent` on melee KILLS (50% base, finisher x1.5). Couldn't find
  a bug; likely melee kills are simply infrequent. Need the user to confirm
  whether drops are missing on confirmed melee finishes before changing design.
- Marksman (mage) magnum: starting `rifle-t1` is named マグナム but plays
  sniper-like (range 312, piercing). User wants it to feel like a magnum -
  confirm desired direction (handgun-class punchy revolver vs just retune) before
  changing, since it also affects the rifle upgrade tree.

## 2026-06-05 - v0.24.2 - Revert slash rework; restyle melee reach-ring (Claude Code)

### Summary
Two targeted changes from playtest feedback (the earlier "slash" rework was the
wrong target):
- Reverted the `slash` effect (`drawEffectGfx`) from the crescent swoosh back to
  the simple additive streak (the crescent wasn't what was wanted).
- Restyled the melee/counter reach-ring (`syncPlayerFx`, shown while the counter
  window is open) from the flat amber triple-circle + right-side arc into a
  sleeker "rune" ring: faint glow rim + crisp bright ring, small rotating tick
  marks, and two symmetric bright sweeps orbiting the rim. Normal blend so the
  reload meter is unaffected; bright cream pixels bloom on their own.

### Code touched
- `src/pixi/pixiScene.ts` (`drawEffectGfx` slash revert, `syncPlayerFx` ring)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK
- Needs on-device look (ring rotation speed / brightness).

### Handoff notes
- Ring tuning is in `syncPlayerFx`: `spin` (rotation speed), `ticks` count,
  `sweep` length, and the stroke colors/alphas. Cooldown ring still the faint
  gray circle.
- Built on the 0.24.1 merge (Codex red-death-splash + my slash crescent). The
  crescent is now gone again per request.

## 2026-06-05 - v0.24.0 - Red death/kill splash and smoother melee ring (Codex)

### Summary
Added red impact presentation and refined the melee/counter ring.
- Player death now holds the game view briefly before game-over, showing a deep
  red flash, red rings, red glow, and blood-like burst particles.
- Delayed the fallback `Game.tsx` health-zero transition so it does not hide the
  death VFX immediately.
- Enemy kill splashes are now red/dark-red for projectile kills and melee kills,
  including melee finishers.
- Smoothed the melee/counter ring: full 360-degree glowing rim with a subtle
  right-side thickening made from blended arcs instead of a hard separate mark.

### Code touched
- `src/hooks/useGameLoop.ts` (player death VFX, projectile kill splash)
- `src/store/gameStore.ts` (melee kill / finisher splash)
- `src/components/Game.tsx` (delayed health-zero fallback transition)
- `src/pixi/pixiScene.ts` (smoother full melee/counter ring)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Player game-over transition delay is 650ms in `useGameLoop.ts` and 700ms in
  `Game.tsx` as a fallback. Tune both together if the death hold feels too
  short or too long.
- The ring's right-side thickening is controlled by `accent` and the three
  local `arc(...)` calls in `src/pixi/pixiScene.ts`.

## 2026-06-05 - v0.23.2 - Full melee ring and stronger level-up VFX (Codex)

### Summary
Adjusted melee/counter and level-up presentation based on playtest feedback.
- Changed the melee/counter indicator from a partial crescent to a full 360
  degree glowing ring.
- Added a subtly thicker/brighter right-side arc on top of the full ring.
- Made level-up much flashier with a stronger flash, triple rings, center glow,
  larger gold burst, white sparkle burst, and a `LEVEL UP!` callout.

### Code touched
- `src/pixi/pixiScene.ts` (full melee/counter ring with right-side accent)
- `src/hooks/useGameLoop.ts` (level-up VFX combo)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Right-side ring accent is fixed slightly above the horizontal right side
  (`accent = -0.18`) so it is only subtly biased, as requested.
- If the level-up gets too busy on mobile, first reduce the gold burst count
  from `44` in `src/hooks/useGameLoop.ts`.

## 2026-06-05 - v0.23.1 - Melee crescent visibility and level-up reveal timing (Codex)

### Summary
Adjusted the previous visual polish based on playtest feedback.
- Made the melee/counter crescent wider, brighter, and longer so it reads as a
  visible slash edge instead of a tiny thin line.
- Delayed the UpgradeMenu overlay by 450ms after level-up so the game-side
  level-up flash/rings are visible before the selection panel appears.
- Slightly lengthened the UpgradeMenu backdrop fade to match the delayed reveal.

### Code touched
- `src/pixi/pixiScene.ts` (melee/counter crescent)
- `src/components/Game.tsx`, `src/index.css` (UpgradeMenu reveal timing)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If the pause delay feels too long, tune the `450` ms timer in
  `src/components/Game.tsx`.

## 2026-06-05 - v0.23.0 - Sparkle, level-up, and enemy light pass (Codex)

### Summary
Added the next visual polish pass requested by the player.
- Strengthened item pickup sparkles with richer bursts, small pickup-local
  rings, and short glows for gems / ammo / health / weapon pickups.
- Added level-up screen feedback before the pause fully reads: a subtle flash,
  extra white ring, larger burst, and UpgradeMenu entrance animation.
- Added Pixi enemy floor self-lights plus a short brighter hit pulse, kept under
  sprites so enemies do not get washed out.

### Code touched
- `src/hooks/useGameLoop.ts` (pickup and level-up VFX combos)
- `src/components/UpgradeMenu.tsx`, `src/index.css` (UpgradeMenu entrance)
- `src/pixi/pixiScene.ts` (enemy self-emission / hit pulse lights)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Enemy lights are intentionally subtle. Tune `ENEMY_LIGHT_RADIUS`,
  `ENEMY_HIT_LIGHT_MS`, and `ENEMY_LIGHT_TINT` in `src/pixi/pixiScene.ts`.
- If pickup effects become too busy on mobile, reduce the per-pickup
  `spawnBurst` counts in `src/hooks/useGameLoop.ts`.

## 2026-06-05 - v0.22.2 - Crescent melee counter indicator (Codex)

### Summary
Changed the active melee/counter indicator from a filled yellow circle into a
thin crescent-like rim.
- Removed the inner fill from the active counter radius.
- Draws only a short forward-facing arc based on the player's last movement
  direction.
- Uses a faint wide halo stroke plus a thin bright stroke so the edge glows
  without lighting the inside of the circle.

### Code touched
- `src/pixi/pixiScene.ts` (Pixi player counter indicator)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The cooldown ring is still the old faint gray full circle. If desired, it can
  be converted to the same crescent style in a later pass.

## 2026-06-05 - v0.22.1 - Remove player-covering counter glow (Codex)

### Summary
Reduced the melee/counter visual noise that was flashing over the player.
- Removed the yellow player-centered glow from the melee/counter release.
- Removed the cyan full-screen flash and player-centered glow from successful
  projectile counter reflection.
- Kept the counter shockwave ring, sparks, callout, and SFX so the action still
  reads without covering the player.

### Code touched
- `src/store/gameStore.ts` (melee/counter release VFX)
- `src/hooks/useGameLoop.ts` (projectile counter success VFX)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If more reduction is needed, the next candidates are the remaining counter
  ring/burst in `src/hooks/useGameLoop.ts` and the Pixi counter-radius ring in
  `src/pixi/pixiScene.ts`.

## 2026-06-05 - v0.22.0 - Octopath-style combat juice, pass 1 (Claude Code)

### Summary
First pass at "Octopath Traveler-level" flashy effects (visual only; no gameplay
change per CLAUDE.md). Two parts:
- Pixi effect RENDERING upgraded to additive + glowing cores so every existing
  effect pops and is caught by the bloom filter:
  - `particle` -> additive spark (soft halo + colored body + hot white core)
  - `ring` -> additive shockwave (soft band + crisp edge + hot inner line)
  - `glow` -> brighter additive disc + core
  - `slash` -> additive streak with a white-hot core line
- Layered effect COMBOS at the headline moments:
  - Crit / headshot: gold shockwave ring + gold sparks + glow.
  - Melee finisher: white shockwave + gold ring + 24 sparks + glow + stronger
    full-screen flash (0.18 -> 0.28).
  - Counter (reflect): cyan shockwave + sparks + glow + brief flash + callout.
  - Player damage: red full-screen flash (on top of the existing shake/burst).
  - Gunfire: warm muzzle flash glow at the gun, pointed along the shot.

### Code touched
- `src/pixi/pixiScene.ts` (drawEffectGfx additive/glow rendering)
- `src/hooks/useGameLoop.ts` (crit / counter / player-damage / muzzle combos)
- `src/store/gameStore.ts` (melee finisher combo + flash boost)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK
- Needs on-device pass (brightness/bloom interaction, perf with muzzle flashes).

### Handoff notes
- All effect intensities are literals at the spawn sites / drawEffectGfx - easy
  to dial up or down after seeing it on-device.
- NEXT (not done yet): item-pickup sparkle pass, LEVEL-UP production (best done
  as a UpgradeMenu entrance animation since level-up pauses immediately), and
  deeper environment/lighting (enemy emissive, dynamic light on hits).

## 2026-06-05 - v0.21.1 - Add Drive SFX assets and finalize event sounds (Codex)

### Summary
- Added the actual Drive-provided SFX files for the v0.21.0 event-sound wiring.
- Kept Claude Code's event wiring as the base:
  - random zombie death grunts on projectile/gun kills
  - `melee-finish` for normal melee finishers and stunned-boss finisher damage
  - `counter` for successful projectile reflection
  - `player-damage`, `bomb`, and `eat` on their matching events
- Adjusted melee input playback so finishers play `melee-finish`; normal melee
  hits play `slash-damage`.

### Assets added
- `public/audio/sfx/zombie-1.mp3`
- `public/audio/sfx/zombie-2.mp3`
- `public/audio/sfx/zombie-3.mp3`
- `public/audio/sfx/zombie-4.mp3`
- `public/audio/sfx/kill.mp3`
- `public/audio/sfx/counter.mp3`
- `public/audio/sfx/player-damage.mp3`
- `public/audio/sfx/bomb.mp3`
- `public/audio/sfx/eat.mp3`

### Code touched
- `src/audio/audioManager.ts`
- `src/hooks/useGameControls.ts`
- `src/components/VirtualJoystick.tsx`
- `package.json`
- `package-lock.json`
- `CLAUDE.md`
- `DEVELOPMENT_LOG.md`

### Verification
- `npm run lint`
- `npm run build`

### Handoff notes
- Drive asset copying is a Codex responsibility when Claude Code cannot access
  the user's local/Drive material folder.
- Continue from `v0.21.1`; `v0.21.0` below was Claude Code's wiring pass with
  assets marked pending.

## 2026-06-05 - v0.21.0 - Kill/counter/player-damage/zombie/bomb/eat SFX (Claude Code)

### Summary
Wired the remaining gameplay SFX triggers on top of Codex's audio system:
- `enemy death` -> random zombie grunt (`zombie-1..4`) on a gun/projectile kill,
  via new `playEnemyDeath()` (shared 70ms throttle so sprays don't stack).
- `melee-finish` (kill.mp3) -> melee finisher executing a normal enemy AND
  finisher-grade damage to a stunned boss. Surfaced via a new `finish` field on
  `CounterTriggerResult`; played from both input handlers.
- `counter` (counter.mp3) -> when a hostile bullet is actually reflected (parry
  success). Deliberately a touch louder (volume 0.98).
- `player-damage` -> when the player actually takes damage (projectile + contact
  paths, guarded by invulnerability so blocked hits stay silent).
- `eat` -> health/meat pickup; `bomb` -> bomb pickup (split out of generic
  `pickup`).

### Assets - PENDING (must be added on the Mac, then committed)
The cloud agent cannot write Drive binaries into the repo. Download these from
Drive `素材/SE` and save into `public/audio/sfx/` with EXACTLY these names:
- `zombie-1.mp3`, `zombie-2.mp3`, `zombie-3.mp3`, `zombie-4.mp3` (Drive zombie1..4.mp3)
- `kill.mp3`            (key `melee-finish`)
- `counter.mp3`        (key `counter`)
- `player-damage.mp3`  (Drive player_damage.mp3)
- `bomb.mp3`, `eat.mp3`
Until these exist the game runs fine but those sounds are silent (audioManager
swallows missing/undecodable buffers).

### Code touched
- `src/audio/audioManager.ts` (new keys, sources, `playEnemyDeath()`)
- `src/hooks/useGameLoop.ts` (counter / player-damage / enemy-death / eat / bomb)
- `src/store/gameStore.ts` (`CounterTriggerResult.finish`, boss-finish tracking)
- `src/components/VirtualJoystick.tsx`, `src/hooks/useGameControls.ts` (finish sound)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK
- Audio not verifiable in the cloud headless env; needs on-device check once the
  asset files above are dropped in.

### Handoff notes
- Mapping: gun kills -> zombie grunt; melee finisher -> kill.mp3; bomb ->
  bomb.mp3 (so a single death never doubles up). Adjust in `useGameLoop.ts` /
  the counter handlers if a different split is wanted.
- Counter volume is 0.98 in `SFX_SOURCES.counter` - tune there if too loud/soft.
- NEXT AGENT: add the 8 asset files above, commit them, on-device pass.

## 2026-06-05 - v0.20.5 - Damage SFX handoff completion

### Summary
- Completed the enemy damage SFX split:
  - `headshot` plays when a projectile hit is critical.
  - `shot-damage` plays on non-critical projectile hits.
  - `slash-damage` plays only when a melee counter actually hits at least one enemy.
- Kept `melee` as the swing sound, separate from damage impact.
- SFX playback remains on Web Audio buffers to avoid frame hitches caused by
  repeatedly controlling `HTMLAudioElement` instances.

### Assets
- `public/audio/sfx/headshot.mp3`
- `public/audio/sfx/shot-damage.mp3`
- `public/audio/sfx/slash-damage.mp3`

### Code touched
- `src/audio/audioManager.ts`
- `src/hooks/useGameLoop.ts`
- `src/hooks/useGameControls.ts`
- `src/components/VirtualJoystick.tsx`
- `src/store/gameStore.ts`
- `package.json`
- `package-lock.json`
- `CLAUDE.md`
- `DEVELOPMENT_LOG.md`

### Verification
- `npm run lint`
- `npm run build`

### Handoff notes
- User wants Codex and Claude Code to hand off development through this log.
- Development environment is `/Users/tanity/zombie`, not `/Users/tanity/AI_MEGLIO`.
- If a sound feels late or quiet, tune `SFX_SOURCES` in `src/audio/audioManager.ts`.
## v0.25.498 — アナログスティック強度で移動速度・狙い距離を可変化 (2026-06-17)

### 概要
フローティングジョイスティックの傾き強度(これまで方向だけ使い大きさは破棄していた)を
`swipeStrength`(0..1)として活用。従来の固定距離を「最大」とし、傾きが弱いほど近く/遅く。
- キャラ移動(タッチのみ・全ステージ): 弱い傾き=ゆっくり歩く(最低 `STICK_WALK_MIN_FACTOR` 倍)。
- ワイヤーアンカー飛距離・PHILLレティクル/プレビュー距離も同係数で可変(描画/距離のみ。弾は直進)。
- 後続: 歩行下限 0.35→0.20(v0.25.499) / PHILL残弾HUD修正・ラボ武器庫・ラボ時間スコア・照準なめらか化
  (v0.25.500) / ジャンプ攻撃中の無敵(v0.25.501) / ワイヤー着地2倍ノックバック・0.1s発射・CD1s(v0.25.502)
  / ラボLv2=犬AI・図面比率・廊下敵・PHILL3箇所・画面外復帰(v0.25.503)。

### 負荷スコア
1/10〜(各項目とも軽微。詳細は各コミットメッセージ参照)。

### Code touched
- `src/store/gameStore.ts` / `src/components/VirtualJoystick.tsx` / `src/components/GameHUD.tsx`
- `src/components/GameOverScreen.tsx` / `src/utils/resultScoring.ts` / `src/hooks/useGameLoop.ts`
- `src/world/labMap.ts` / `src/types/game.ts` / `src/pixi/pixiScene.ts`

### Verification
- `npm run lint` / `npm run build`

## v0.25.504 — 研究所 描画刷新 Phase A(床テクスチャ/変種散布/隅AO/壁落ち影) (claude/cool-edison-7b8jrl)

### 概要
作戦書(moonlit-bubbling-avalanche.md)の実装ハンドオフ Phase A。描画のみ・当たり判定/屋外は不変。
- `pixiTextures.ts`: 新ドット絵タイルを scaleMode:'nearest' で登録(lab-floor clean/blood/grime/crack/scorch/ao、
  lab/lab-wall-front/-top/-wall2-panel/-wall2-beam)。
- `syncLab()`: 床ベースを lab-floor-clean に、tileScale 300→120、`LAB_ENV_TINT` 0x4f5a6b→0x6b7686。
- `buildLabFloorDecor()`: 各部屋に treeHash 決定的散布(~28%セルに変種)＋四隅 -ao。シグネチャで1度だけ生成。
- 壁の焼き込み落ち影 `labWallShadow`: 右上光源→左下オフセット。壁/扉シグネチャで再構築。

### 負荷スコア
2/10(rendering)。静的・シグネチャゲートで1度だけ構築。

## v0.25.505 — 研究所 描画刷新 Phase B(壁の立体規約統一) (claude/cool-edison-7b8jrl)

### 概要
`syncLab()` の壁を縦横統一の立体規約へ。内壁=foot-anchored Container(actorLayer・zIndex=footY)、背の高い壁は
SEG=160px で Y方向スライス。前面 lab-wall-front＋上端 lab-wall-top キャップ。立ち上がり `LAB_WALL_RISE`(既定38、
?labrise= 可)。外周リングは平面据え置き。装飾窓壁 lab-wall2-panel は広い横壁(≥360)の約半数(要所のみ)。

### 負荷スコア
3/10(rendering)。扉開閉/?labrise 時のみ再構築。外周平面据え置きで枚数抑制。

## v0.25.506 — マージ: 描画(Phase A/B) ＋ ゲーム調整(v0.25.498〜503) 統合 (claude/cool-edison-7b8jrl)
chat-context のゲーム調整(アナログ歩行/PHILL残弾/ワイヤー/ジャンプ無敵/ラボ敵AI・地形・スコア等)を
cool-edison にマージし、研究所描画 Phase A/B と1本に統合。競合は pixiScene.ts(import)/package.json/本ログのみ。
gameStore・useGameLoop・GameHUD 等のゲーム調整はクリーンに合流。lint/build 通過。

## v0.25.507 — レベルアップ等メニュー中の指離し暴発を防止 (claude/cool-edison-7b8jrl)
`VirtualJoystick.release()` の攻撃ガードに `isPaused` を追加。これまで `isGameTimeStopped()`(会話/登場演出)
のみで、レベルアップ/ショップ/クエスト等の一時停止(isPaused=true)を見ておらず、メニュー中に指を離すと
カウンター/PHILL発射/一閃ダッシュが暴発していた。停止中は指離しの攻撃入力を一切受け付けないように修正。
負荷スコア 1/10(条件1つ追加のみ)。lint/build 通過。

## v0.25.508 — 研究所のデータ確保を武器取得と同じ取得バナーUIに統一 (claude/cool-edison-7b8jrl)
研究所クリアアイテム(lab-clear-item)取得時の表示を、独自の浮きコールアウトから武器/トレジャーと同じ
取得バナー(lastWeaponGet)へ変更。専用 kind='data'(💾・「データを確保！」・エメラルド)を追加し、GameHUD の
バナー分岐に反映。到達演出(flash/ring/burst→1.5s後にイベント勝利)はそのまま。負荷スコア 1/10。lint/build 通過。

## v0.25.509 — PHILL弾/アンカーの弾道をサークル方向に統一＋サークルに慣性 (claude/cool-edison-7b8jrl)
進行方向(lastDirection 瞬時)ではなく「照準サークル方向」へ撃つよう統一。store に慣性付き照準ベクトル
`player.aimX/aimY`(向き=lastDirection×傾き強度、長さ0..1)を追加し、movePlayer で毎フレーム `AIM_INERTIA_TAU=0.10`
で更新。firePhillShot とワイヤーアンカー打ち込みは aim 方向/距離を使用。レンダラの PHILL レティクル・ワイヤー
プレビューは store の aim をそのまま使用(center+aim*range)＝サークル位置と弾道が一致。旧レンダラ側イージング
(aimReticleOff*)は撤去。負荷スコア 1/10(スカラー数個/フレーム)。lint/build 通過。

## v0.25.510 — パンプキン着地爆発(範囲狭め)＋盾CD 6秒 (claude/cool-edison-7b8jrl)
- パンプキン(/lab-zombie-3)のジャンプ攻撃が**着地時に爆発攻撃**。範囲狭め(`PUMPKIN_EXPLOSION_RADIUS=66`)、
  ダメージは各敵の `damage`。着地点を store `pumpkinBlasts` に記録し、useGameLoop が消化(爆発FL/リング/バースト＋
  半径内ならプレイヤー被弾、無敵中は無効、死亡時は通常の死亡演出)。空中無敵(v0.25.501)はそのままなので、
  「空中はすり抜け→着地で爆発」の駆け引きになる。スロー演出は付けない(社長規約遵守)。負荷 1/10(着地時のみ)。
- 盾(設置型シールド)のクールダウンを 5000ms→**6000ms**(`SHIELD_COOLDOWN_MS`)。
lint/build 通過。

## v0.25.511 — 研究所 遠近(1): 立体壁を擬似遠近(depthScale)に参加 (claude/cool-edison-7b8jrl)
描画のみ・当たり判定/store/屋外不変。立体壁(addBlock の actorLayer ブロック)を高さ方向だけ擬似遠近に参加。
- 各ブロックの footY と元総高(h+RISE)を `labWallDepth` に保持。毎フレーム `depthScaleWith(footY, DEPTH_K*labdepth,
  0.8, 1.35)` で `scale.y` を更新し、`position.y = footY - fullH*scaleY` で**足元(下辺)をピン留め**。
- **width は不変**(scale.x=1。横に伸ばすと床グリッド/隣接/判定とズレるため)。SEG スライス壁は各スライスの footY で個別。
- `depthRefY`(プレイヤー足元)が変化した時だけ更新(静止中はスキップ)。外周リング(平面)は対象外。
- 強さ `?labdepth=`(既定0.6=床オブジェクトより緩め)。RISE は既存 `?labrise=`(既定38。視認性中間なら48〜56)。
- 床(labFloor/変種/AO)は据え置き(world-space で歪めると壁とズレるため)。遠近は壁＋アクター＋(後続)前後層で表現。

### 負荷スコア
1〜2/10(rendering)。毎フレームは壁数ぶん(数十)の scale.y/position.y 更新のみ・geometry 再生成なし・静止中スキップ。

### 次: 遠近(2) 前後パララックス層 — 要新規アセット(未受領)
- 前景 `lab-fg/lab-fg-beam|-pipe|-duct|-cable.png`(マスターシート Row4 から縮小・減色)
- 背景 `lab/lab-bg-void.png`(暗い天井/void が上へ消える縦長シームレス・ドット絵)
素材が入り次第、frontObjectLayer(前景・パララックス＋微ぼかし)＋外周暗リング置換(背景プレート・低速パララックス)を実装。

## v0.25.512 — 研究所 遠近(2)背景: 天井/void プレート＋低速パララックス (claude/cool-edison-7b8jrl)
描画のみ・当たり判定/store/屋外不変。
- 新規アセット `public/sprites/lab/lab-bg-void.png`(240x768・148KB・縦横シームレス seam=0)。受領素材(724x2172/1.2MB)を
  ハイライト保持ダウンスケール(暗部=ブロック平均/光源=ブロック最大で窓・赤灯を残す)＋エッジブレンドで作成。
  ※暗部99.97%に対し光源が極小高輝度コアのため median-cut 量子化では潰れる → RGB保存(それでも148KB)。
- `pixiScene::syncLab()`: 背景 void を `TilingSprite` で最下層(床の下)に敷設。**床(labFloor)は LAB_BOUNDS のみ**を
  覆うよう変更し、外周マージンに void が見える形に。旧「暗リング塗り」(labGfx)は廃止(void 未ロード時のみ保険で残す)。
- 低速パララックス: `tilePosition = camera*LAB_VOID_PARALLAX(0.12)`。タイル幅 `LAB_VOID_TILE=420` で外周の繰り返しを抑制。

### 負荷スコア
2/10(rendering)。TilingSprite 1枚＋毎フレーム tilePosition 更新のみ。geometry 再生成なし。

### 残: 遠近(2)前景(オーバーヘッド梁/配管) — 要アセット未受領
`lab-fg/lab-fg-beam|-pipe|-duct|-cable.png`(マスターシート Row4)が入り次第、frontObjectLayer に疎配置＋微ぼかし＋
軽パララックスで実装予定。

## v0.25.513 — 研究所 擬似3D遠近 試作 A1: 床だけ遠近(?labpersp=1) (claude/cool-edison-7b8jrl)
描画のみ・当たり判定/store/移動/aim 不変・屋外無変更。試作フラグ `LAB_PERSP = tsBool('labpersp', false)`(既定OFF)。
- A1: ?labpersp 時、研究所のフラット床(labFloor)/変種/AO/void を使わず、ステージ1の遠近 ground(groundBase/
  groundStrips + updatePerspectiveGround)を流用。ストリップのテクスチャを `lab-floor-clean` に差し替え、tint=LAB_ENV_TINT。
  既存の遠近定数(GROUND_TILE_SCALE_Y_FAR/NEAR・GROUND_PERSPECTIVE_CURVE)をそのまま使用。
- groundBase の表示を `!indoor || persp` に。屋外復帰/非persp では `restoreGroundStrips()` で元テクスチャ/ENV_TINT へ戻す
  (groundStripBaseTex に屋外テクスチャを退避)。壁/プロップ/アクターは現状(depthScale)のまま=A1の評価対象は床のみ。
- OFF(既定)では persp=false 固定で完全に現状動作(回帰なし)。
- 未実装(評価後判断): A2(壁/プロップの footY を遠近写像で床に乗せる)、A3(アクター/aim のフル投影＋逆写像)。
  ?labperspk(NEAR/FAR 可変)は A1 では未追加。

### 負荷スコア
1〜2/10(rendering)。既存の updatePerspectiveGround を屋内でも回すだけ(ストリップ数ぶんのタイル更新)。新規確保なし。

### Verification
- `npm run lint` / `npm run build` 通過。屋外は groundBase=ENV_TINT/元テクスチャで無変更。?labpersp=1 で研究所の床が斜め遠近に。

## v0.25.514 — 研究所 擬似3D遠近 A1強化: 強カーブ＋地平フェード＋グリッド床 (claude/cool-edison-7b8jrl)
?labpersp 配下のみ・屋外無変更・OFFで回帰なし。描画のみ(当たり判定/移動/aim 不変)。
1. 研究所専用の強い遠近(屋外定数を流用せず分離)。`updatePerspectiveGround` を (farScale, nearScale, curve) 受け取りに
   拡張し、研究所では `LAB_PERSP_FAR=0.04`(屋外0.12より奥を強く縮める)・`LAB_PERSP_CURVE=2.8`(収束を急に)を使用。
   `?labperspfar=` / `?labperspcurve=` で生調整可。屋外は従来定数のまま。
2. 擬似地平フェード `labHorizonFade`: 上=ほぼ黒→下=透明の縦グラデ(canvas生成1枚をキャッシュ)を worldGroup の
   groundBase 直上に重ね、遠近床の奥を暗がりへ沈める。`?labhorizon=`(既定0.85, 0でOFF)。壁/アクターは暗くしない
   (groundBase の直上=床のみに掛かる)。
3. 強グリッド床テクスチャ `public/sprites/lab-floor/lab-floor-persp.png`(128²・20KB・シームレス seam=0、受領素材を
   減色48色・エッジブレンド)。?labpersp 時の遠近ストリップに使用(無ければ lab-floor-clean にフォールバック)。

### 負荷スコア
1〜2/10(rendering)。遠近更新は既存ループにスカラー数個追加のみ。地平フェードは Sprite 1枚。新規確保は起動時1テクスチャ。

### Verification
- lint/build 通過。屋外=従来定数/元床で無変更。?labpersp=1 で奥が強く縮み、上方が暗幕で消える。

## v0.25.515 — 研究所 擬似3D遠近 A2: 壁・プロップを遠近床に乗せる＋?labvig (claude/cool-edison-7b8jrl)
?labpersp 配下のみ・描画のみ(判定/移動/aim/store 不変)・屋外無変更・OFFで回帰なし。
- 写像 `labProjectFootY(footY)`: 焦点面=プレイヤー足元(depthRefY)から床に沿った表示距離 = ∫相対スケール dy を
  数値積分(4サンプル)し、表示 worldY＋uniform スケールを返す。床と同じ lab カーブ(LAB_PERSP_FAR/CURVE)で算出。
  `groundScaleAt`/`groundRelativeScale` を (far,near,curve) 引数化して流用。
- 壁ブロック(addBlock): ?labpersp 時は A1.5 の高さのみスケールに代えて labProjectFootY で位置＋高さ＋幅を写像
  (幅は足元中心基準で対称に縮小)、z は写像後Yでソート → 収束する床に乗る。x0/w を保持。
- プロップ: 同写像で位置＋スケール、z も写像後Y。元 foot を labPropFoot に保持し、非persp/屋外は従来 depthScaleEnemy。
- 敵/プレイヤー/弾は据え置き(線形＋depthScale=ステージ1の割り切り)。まず環境だけで評価。
- 評価レバー: `LAB_VIGNETTE_ALPHA` を `?labvig=`(既定0.97)で可変に。明るくして見え方を調整可(最終値はPhase C)。

### 負荷スコア
2〜3/10(rendering)。壁(数十)＋プロップ(数個)に毎フレーム 4サンプル積分の写像。壁は depthRefY 変化時のみ。新規確保なし。

### Verification
- lint/build 通過。屋外/OFF 不変。?labpersp=1 で壁・プロップが収束床に乗り、奥ほど上方＋縮小。?labvig=0.7 で明るく確認。
### 次
- A3(任意): 敵/プレイヤー/弾の Y も写像＋aim/タップ移動の screen↔world 逆写像。A2で十分なら見送り。

## v0.25.516 — 研究所 台形透視床 Step1: PerspectiveMesh 床 (claude/cool-edison-7b8jrl)
?labpersp 配下のみ・描画のみ(判定/移動/aim/store 不変)・屋外無変更・OFFで完全回帰。
- Step1: 縦ストリップ流用を ?labpersp 時はやめ、PixiJS 8.19 の `PerspectiveMesh` で床平面を1枚描く。
  - texture=`lab-floor/lab-floor-persp`(source.style.addressMode='repeat')、tint=LAB_ENV_TINT、verticesX/Y=24。
  - 台形コーナー: 下辺=全幅@screenH(手前) / 上辺=中央付近に狭く@horizonY(奥・消失点)。
    `?labvp`(消失点X比=0.5) `?labtop`(上辺幅比=0.22) `?labhorizon`(上辺Y比=0.34)。画面/パラメータ変化時のみ setCorners。
  - タイル密度 `?labtiles`(=7)＝基準UV(0..1)×tiles。UV を camera.x/y で遠近スクロール(手前ほど速く=メッシュ前方短縮の自然効果)。
    repeat ラップで継ぎ目なく巡回。毎フレーム UV バッファ(24×24×2)更新。
  - worldGroup 内・groundBase 直上(=world/壁/アクターの下)に配置。屋内では屋外ストリップ groundBase は非表示。
  - 擬似地平フェード(?labfade=0.6, 旧 labhorizon から改名)を床メッシュ直上に重ね、奥(上辺)を暗がりへ。
- 評価レバー ?labvig=(ヴィネット可変, 既定0.97)併用。
- 壁/プロップは現状(A2写像)のまま=Step1は床の見え方を評価。Step2 で同じホモグラフィ H に統一予定。

### 負荷スコア
2/10(rendering)。PerspectiveMesh 1枚＋毎フレーム UV 更新(約1152 float)。setCorners は変化時のみ。新規確保は起動時のみ。

### Verification
- lint/build 通過。屋外/OFF 不変。?labpersp=1 で床が台形に奥へ収束。?labvp/labtop/labhorizon/labtiles/labvig/labfade で調整。
### 次
- Step2: 台形と同じ H で 壁/プロップ/(その後)敵・プレイヤー・弾 の足元を screen 投影＋深度スケール(ビルボード維持)。

## v0.25.517 — 修正: ?labpersp 時に床フォールバック塗りが遠近メッシュを覆う不具合 (claude/cool-edison-7b8jrl)
Step1(台形メッシュ床)で `?labpersp` 時に `floorTex=null` にしていたため、labGfx の保険塗り
`if (!floorTex) fill(LAB_BOUNDS, 0x10151c)` が迷路全体を不透明で塗り、遠近床メッシュ(world の下)を覆っていた。
`!persp` でガード(?labpersp 時は台形メッシュを使うので塗らない)。負荷増なし。lint/build 通過。

## v0.25.518 — 研究所 ?labpersp 床を焼き込み遠近プレート(一枚絵)に差し替え (claude/cool-edison-7b8jrl)
?labpersp 配下のみ・描画のみ(判定/移動/aim/store 不変)・屋外無変更・OFFで回帰。
- 新規 `public/sprites/lab-floor/lab-floor-persp-plate.png`(560x373・284KB、受領素材1536x1024をLANCZOS縮小・RGB)。
- `?labpersp` 時: 縦ストリップ/台形メッシュは使わず、この一枚絵を screen-space 背景として全画面に敷く
  (`updateLabFloorPlate`)。worldGroup の groundBase 直上・world の下。tint=LAB_ENV_TINT。少し大きめ(×1.10)に敷き、
  カメラ×0.02 のごく弱いパララックス(オーバスキャン内クランプ)。消失点=上中央で固定。
- 台形メッシュ床(updateLabFloorMesh)は休止(常に false)。地平フェードはプレートが焼き込み済みのため未使用。
- 壁/アクターは現状のまま上に重ねる(まず床の見た目を評価)。?labvig=(既定0.97)併用。
- 既知の割り切り: 一枚絵なのでカメラ移動で床は厳密にスクロールしない/壁と整合しない(試作)。

### 負荷スコア
1/10(rendering)。Sprite 1枚＋毎フレーム position/size 更新のみ。新規確保は起動時テクスチャ1枚。

### Verification
- lint/build 通過。屋外/OFF 不変。?labpersp=1&labvig=0.6 でプレート床が全画面に。

## v0.25.519 — 装備メニュー(トップ独立)＋スキル枠(最大2) (claude/cool-edison-7b8jrl)
サブウェポンとは別系統の「スキル枠」を新設。装備はステージ選択フローから切り離し、トップメニューの独立
「装備」メニューで選択(自動保存・全ステージ共通)。
- 型: `SkillKey`('adrenaline'|'emp-pulse'|'nano-heal'|'overload')＋ `player.skills: SkillKey[]`。
  campaign に `SKILL_KEYS`/`SKILLS`(表示名・説明)/`MAX_EQUIPPED_SKILLS=2`(プレースホルダ。効果は今後配線)。
- store: `pendingSkills`(最大2)＋`setPendingSkills`、`pendingLoadout`(サブ)も localStorage 永続化
  (`zombie:loadoutSubs`/`zombie:loadoutSkills`、起動時復元)。resetGame で `player.skills = pendingSkills`(≤2)、
  サブは既存の runSubs(=固有＋pendingLoadout)経路でそのまま反映。
- MissionSelect: ホームに「装備」HubButton→独立 `loadout` 画面(スキル最大2＋サブ複数、自動保存)。
  ステージ選択フローの旧「装備選択(サブ)」工程は廃止し、キャラ選択→そのままスタート。
- 反映: 出撃時にサブ＝初期装備、スキル＝player.skills に保持(アクティブ効果は未配線=枠/保存/UIのみ)。

### 負荷スコア
0〜1/10。UI＋localStorage 永続のみ。ゲームループへの新規コストなし(スキル効果は未実装)。

### Verification
- lint/build 通過。トップ「装備」でサブ/スキルを選び自動保存→出撃に反映。スキル効果は後続で配線。
### 次
- スキルのアクティブ効果(発動操作・クールダウン・各能力)の実装。能力仕様が来たら配線。

## v0.25.520 — ステージ2を「ステージ1構造＋研究所スキン」に作り直し / PHILL=商人が無料配布 (claude/cool-edison-7b8jrl)
研究所(stage-2)の屋内迷路は一旦保留。stage-2 を屋外サバイバル構造(stage1同等: 波/オープン/木/進行)に戻し、
テクスチャだけ研究所に張り替えるテーマ機構を追加。壁は無し(=屋外構造そのまま)。
- campaign: Stage に `theme?: 'lab'`。stage-2 は `indoor:true` をコメントアウトし `theme:'lab'` を付与
  (labMap 迷路/カードキー/ゴールは温存・未使用)。
- types: `StageTheme='forest'|'lab'`、ShopItemKey に `buy-phill`。
- store: `pendingStageTheme`/`setPendingStageTheme`/`stageTheme`。resetGame で stageTheme を確定。
  buyShopItem に `buy-phill`(PHILL銃を無料配布・未所持時のみ・即装備・PHILL弾を初期量まで補充)。
- App: 出撃時に stage.theme を pendingStageTheme へ受け渡し。
- 描画(pixiScene): `applyOutdoorGroundTheme` 追加。lab テーマ時は屋外地面ストリップを
  `lab-floor/lab-floor-ground`(シームレス・ステージ1風)＋LAB_ENV_TINT に貼り替え(テーマ変化時のみ・毎フレーム再代入なし)。
  forest は従来地面へ復元。判定/移動/aim/store 不変。
- ShopMenu: lab テーマで「ＰＨＩＬＬ-銃(無料配布)」を陳列＋弾4種目に phill を追加。0コストは「無料」表示。
- ヘッドショット: 既存実装のまま(PHILL弾のみ頭部判定・全敵共通=enemyFootBox の上部リージョン)。追加変更なし。

### 負荷スコア
1/10。地面テクスチャ差し替えはテーマ変化時の1回のみ(TilingSprite.texture 再代入)。商人/陳列はUIイベント。

### Verification
- lint/build 通過。stage-2 出撃で屋外構造＋ラボ床スキン、武器商人で PHILL を無料入手→ヘッドショット動作。
### 次
- 研究所スキンの調整(床タイル密度/色味、敵スキンや背景のラボ化は要望次第)。屋内迷路の作り直しは別途。

## v0.25.521 — 研究所(stage-2)の壁を「横/縦2種の一枚絵オブジェクト手置き」方式に (claude/cool-edison-7b8jrl)
旧 procedural 迷路壁(LAB_WALLS)はもともと indoorMode 限定で、stage-2 は屋外化済み=不使用。
代わりに開けたステージ1規模マップ上に、足元アンカーのビルボード壁を手置きで点在(迷路/進行ゲートにしない=遮蔽物)。
- 素材: アップロード画像(横長ラボ壁・5パネル)を PIL でトリミング→256幅へ縮小→40色へ減色→近黒を透過し
  `public/sprites/lab/lab-wall-obj-h.png`(256x153)。90°回転で `lab-wall-obj-v.png`(153x256)。
  pixiTextures に nearest 登録(`lab/lab-wall-obj-h`,`lab/lab-wall-obj-v`)。
- world データ: `src/world/labWalls.ts`(renderer-agnostic)。`PlacedWall{id,orient,footX,footY}`、
  `wallRect()`(横=幅広薄帯 footRect(150,22)/縦=細長帯 footRect(22,150))、表示箱 WALL_DISPLAY_H/V、
  手置き配置 `STAGE2_WALLS`(14枚・原点周辺を空けてL字/孤立片で散布)。
- store: `placedWalls`/`wallRects` を追加。resetGame で `stageTheme==='lab' && !indoor` のとき STAGE2_WALLS を
  セットし wallRects を precompute。
  - 移動ブロック: プレイヤー屋外解決チェーン末尾＋敵 resolveMove に resolveAabb(wallRects) を追加。
  - 視線遮り: 敵の起床判定 segmentBlocked を losWalls(屋内=lab壁 / 屋外=wallRects)に統一。近接フィニッシャの
    meleeWalls(屋外)にも wallRects を加え、壁越し不可に。
- 描画(pixiScene): `syncLabWalls()` 追加。木/lab-props と同じ足元アンカー(0.5,1)+zIndex=footY+depthScale で
  actorLayer に配置(背面は被る=ビルボード遮蔽)。配置は静的なので生成は reset 時のみ・以後は depthScale だけ毎フレーム。
- クリア条件は据え置き(ステージ1同様 giantbat 撃破)/死神(Reaper)もステージ1ロジックのまま。壁は移動・敵にも作用。

### 負荷スコア
1/10(simulation/rendering)。当たり判定=毎フレーム14矩形の resolveAabb をアクター毎に1回(無視できる)。
描画=14ビルボードを生成1回、以後 depthScale のみ。視線は近接スイング時のみ14矩形。pooled/静的で安全。

### 未確定(要判断)
- 「キーアイテムを探索範囲内に手置き」は、屋外クリアが giantbat 撃破でキーアイテム機構が無いため今回は見送り。
  データ回収を実クリア条件にするなら別途、手置きピックアップ＋勝利配線を追加可能。

### Verification
- lint/build 通過。stage-2 出撃で壁が点在描画され、プレイヤー/敵が衝突・回り込み、背面は壁に被る。
### 次
- 壁テクスチャの本制作(現状はアップロード画像の自動縮小/減色版)。配置バランス調整。キーアイテム要否の確定。

## v0.25.522 — 研究所(stage-2)を整理: 縦壁/木/城/松明を排除し UV バー設置 (claude/cool-edison-7b8jrl)
研究所スキン(stageTheme==='lab')専用の調整。社長指示:
- 縦壁オブジェクト廃止 → STAGE2_WALLS は横壁(h)のみ(10枚)。
- 木を出さない → syncTrees は lab で空、移動/敵/近接の木当たり判定もスキップ。
- 城(建物)を出さない → 描画/当たり判定を抑止。※ giantbat ボスは城座標に湧く(クリア条件)ので湧き自体は維持。
- 松明を出さない → syncBreakableProps は lab で torchesInRegion を呼ばない。
- 代わりに UV バーを手置き(STAGE2_UV_BARS=8本)。type:'uv-bar' の破壊可能プロップ(光源/装飾)。
  reset で配置し、syncBreakableProps が毎フレーム持ち越す(壊れたら除去)。UV バーは当たり判定なし
  (solidProps/solidPropsForShove から 'uv-bar' を除外)=移動/弾は通す。遮蔽は壁オブジェクトが担当。
- 弾の遮蔽(grenadeWallsFor)も lab では木/松明/城を使わず wallRects のみ。
- 死神(Reaper)・波・クリア(giantbat)はステージ1のまま。
変更: src/world/labWalls.ts(縦壁削除＋STAGE2_UV_BARS), src/store/gameStore.ts(reset UV配置/
syncBreakableProps/solidProps×3/木・城ゲート/grenadeWallsFor), src/pixi/pixiScene.ts(syncTrees lab空/城非表示).

### 負荷スコア
1/10(むしろ軽量化)。lab では木/松明の手続き生成を停止。UV バー8・壁10は静的。差分は無視できる。

### Verification
- lint/build 通過。stage-2 で木/城/松明が消え、横壁＋UVバー(紫グロー)配置。壁は移動/弾/視線を遮る。
### 次
- 壁/UVバーの配置バランス調整。壁テクスチャ本制作。地雷を lab で残すか要確認(今回は維持)。

## v0.25.523 — 研究所スキンの床テクスチャ差し替え (claude/cool-edison-7b8jrl)
社長提供の新しいタイル床画像(血/サビ付きダークタイル)で、屋外ラボテーマの地面テクスチャを差し替え。
描画レイヤー構造(applyOutdoorGroundTheme のストリップ・タイリング+LAB_ENV_TINT)はそのまま、画像のみ置換。
- 差し替え対象: public/sprites/lab-floor/lab-floor-ground.png(applyOutdoorGroundTheme が参照)。
- 既存タイル寸法 1254×1254 を維持するため、新画像(1536×1024)を中央正方クロップ→1254×1254 にリサイズ(歪み無し)。
  タイリング密度/tileScale は不変。コード変更なし。
- ※新画像はパース込みのため、ストリップで反復するとパースが重なって見える点は仕様(レイヤー構造維持の指示通り)。

### 負荷スコア
1/10。テクスチャ1枚の差し替えのみ。実行時コスト不変。

### Verification
- build 通過。stage-2(研究所スキン)で地面が新タイル床に置き換わる。
### 次
- 反復時の見栄えが気になる場合はシームレス・タイル化(面直クロップ/継ぎ目処理)を検討。

## v0.25.524 — 研究所スキンの背景3層(遠景/地平帯/手前帯)を差し替え (claude/cool-edison-7b8jrl)
社長提供の3枚で、屋外ラボテーマ時の森系背景レイヤーをラボ版に差し替え。レイヤー構造
(パララックス/ブラー/フェード/マスク)は不変=TilingSprite の .texture を貼り替えるだけ。ステージ1(森)は不変。
- 素材(PIL生成・public/sprites/lab/):
  - lab-far-backdrop.png … 遠景パノラマ(不透明・1672x941)。
  - lab-horizon-band.png … 地平の機械帯。紫背景(≈86,54,138)を距離キーで透過。
  - lab-front-band.png … 手前のボヤけ機械帯。紫背景(≈65,27,117)を透過。発光タンクは明るく残存。
    ※ブラーは frontForest 既存の BlurFilter がテクスチャに依らず継続=指示通りボヤけ維持。
  - pixiTextures に登録(linear)。
- 描画: applyOutdoorGroundTheme を拡張。lab で far/horizon/front の .texture をラボ版へ、forest で元の森へ復元
  (元テクスチャは初回に一度だけ退避)。tint は据え置き(地面=LAB_ENV_TINT / 背景3層=ENV_TINT)。
  テーマ変化時のみ貼り替え(毎フレーム再代入なし)。
- レイアウト(tileScale/位置/フェードマスク)は既存の毎フレーム処理が新テクスチャ寸法から再計算=変更不要。

### 負荷スコア
1/10。差し替えはテーマ変化時の3回のみ。実行時の追加コストなし。メモリは背景PNG3枚分(数MB)増のみ。

### Verification
- lint/build 通過。stage-2(研究所スキン)で遠景/地平/手前がラボ機械背景に。手前帯はボヤけ維持。森は透過。
### 次
- 各帯の横タイリング継ぎ目や明るさ(ENV_TINT 下での視認性)を実機確認して微調整。

## v0.25.525 — 最前面の天井ケーブル帯(研究所スキン) + 死神出現距離3倍 (claude/cool-edison-7b8jrl)
1) 天井オーバーレイ: 社長提供画像(天井から吊られたケーブル/チェーン/フック)を最前面レイヤーとして上寄せ・
   紫透過・半透明で追加。
   - 素材: 紫背景(≈85,52,142)を距離キーで透過→内容bboxにクロップ(1536×747)→public/sprites/lab/lab-ceiling-band.png。
     pixiTextures に登録。
   - 描画: updateLabCeiling()。screen-space の Sprite を anchor(0,0)=上寄せ、幅=画面幅・アスペクト維持、
     alpha=LAB_CEILING_ALPHA(?ceil 既定0.55)。frontForest の直前(uiLayer の下)=ゲームプレイ/前景より手前。
     lab テーマ かつ 非屋内 のときのみ表示。
2) 死神(Reaper)出現領域を従来比3倍へ(config/reaper.ts): warning 1200→3600 / frequent 2200→6600 /
   spawnRisk 3200→9600 / extreme 4400→13200。原点からより遠くまで安全に探索できる。

### 負荷スコア
1/10。天井帯は screen-space スプライト1枚(毎フレーム位置/サイズ更新のみ)。reaper はしきい値定数の変更のみ。

### Verification
- lint/build 通過。stage-2 で天井ケーブル帯が画面上端に半透明表示。死神は約3倍遠方まで出現しない。
### 次
- 天井帯の横タイリング要否(現状は1枚を画面幅にフィット)・alpha 微調整は実機確認後に。

## v0.25.526 — 修正: 全画面真っ暗(TDZ)回帰 (claude/cool-edison-7b8jrl)
v0.25.525 で `const LAB_CEILING_ALPHA = tsNum('ceil', 0.55)` を `tsNum` 定義(99行目)より前(67行目付近)に
置いてしまい、モジュール初期化時に「Cannot access 'tsNum' before initialization」(TDZ)で pixiScene の
読み込みが失敗→レンダラ全体がクラッシュ→タイトル含め真っ暗だった。ビルド/lint は通る(実行時エラー)ため見逃した。
- 修正: LAB_CEILING_ALPHA の定義を tsNum/tsBool の後ろ(LAB_PERSP の直後)へ移動。挙動は v0.25.525 と同じ。

### 負荷スコア
1/10。定義位置の移動のみ。

### Verification
- lint/build 通過。タイトル/ゲームが再び描画される(天井帯・背景差し替え・死神3倍は v0.25.525 のまま有効)。

## v0.25.527 — 研究所スキンの地面 色味調整(LAB_ENV_TINT)を一旦外す (claude/cool-edison-7b8jrl)
applyOutdoorGroundTheme の lab 分岐で地面ストリップに掛けていた LAB_ENV_TINT を白(0xffffff=無補正)へ。
テクスチャ本来の色で表示して評価するため(社長指示「一旦色味調整を外して」)。レイヤー構造/本数(72)は不変。
背景3層(far/horizon/front)の tint(ENV_TINT)は今回そのまま。LAB_ENV_TINT 定義は屋内ラボ床等で引き続き使用。

### 負荷スコア
1/10。tint 値の変更のみ。

### Verification
- build 通過。stage-2 の地面が暗色補正なしのテクスチャ本来色に。

## v0.25.528 — 研究所スキンの湧きをラボ用ゾンビのみに + 床素材入れ替え (claude/cool-edison-7b8jrl)
1) 敵: stage-2(lab テーマ)の湧きを研究所テストで作ったラボ用ゾンビ(lab-zombie-1/2/3)だけに。
   - enemyUtils に selectLabEnemyType(gameTime) 追加(序盤Lv1中心→中盤Lv2→後半に巨体Lv3が控えめに混ざる)。
   - useGameLoop 継続スポナー: lab テーマ時は generateEnemy に forcedType=selectLabEnemyType を渡す
     (画面外ランダム配置の仕組みはそのまま流用)。森の plant 上限ロジックは非 lab のみ。
   - 森系の演出波(consumeDueWaves: plant/pumpkin/zombie/skeleton/werewolf + finale)を lab では発火させない。
   - ※クリアボス giantbat は別経路(城ボス spawn)で維持=ステージは引き続きクリア可能。
2) 床: stage-2 の地面テクスチャを新素材(フラットなトップダウンのシームレス床)へ差し替え。1254×1254、
   public/sprites/lab/lab-floor-ground.png を更新。レイヤー構造(72ストリップ)/tint(白=無補正)は不変。

### 負荷スコア
1/10。湧きは型選択の分岐のみ(数・間隔は据え置き)。床はテクスチャ差し替えのみ。

### Verification
- lint/build 通過。stage-2 で湧きがラボゾンビのみ・画面外ランダム。床が新素材に。
### 未確定: 「ラボ用の敵だけ」に giantbat(クリアボス)を含めるか。今回は維持。要望あれば lab ボスへ差し替え/撤去。

## v0.25.529 — 研究所スキンのクリア条件=書類(重要データ)取得に / giantbat 撤去 (claude/cool-edison-7b8jrl)
社長指示「クリア条件は書類を見つけること」。
- 書類(クリアアイテム)を探索域に手置き。type は既存 'lab-clear-item'(拾うと goalReachedAt→演出後に
  triggerEventVictory。取得表示は「重要データ」)を流用。配置 STAGE2_DOCUMENT={720,-470}(labWalls.ts)。
  resetGame の lab テーマ分岐で runPickups に追加。
- 勝利判定: 屋内ゴール用の goalReachedAt→triggerEventVictory チェックを lab テーマでも回す
  (useGameLoop に labTheme 用の同等チェックを追加)。
- giantbat(旧クリアボス)は lab では出さない: 城ボス spawn を !labTheme でゲート。これで湧きは完全にラボ敵のみ。
  (森の演出波は前版で既に lab 無効化済み。giantbat 撃破による gameWon 経路は giantbat 不在で発火しない。)

### 負荷スコア
1/10。ピックアップ1個追加と勝利判定の分岐のみ。

### Verification
- lint/build 通過。stage-2 は書類取得でクリア、giantbat 非出現、湧きはラボ敵のみ。
### 次: 書類への誘導(エッジ矢印/マーカー)要否。現状は探索で発見。

## v0.25.530 — 近接フィニッシュのコンボ表示を復活 / ステージ2敵を索敵仕様に (claude/cool-edison-7b8jrl)
1) コンボ表示: GameHUD のコンボ数表示が `rhythmActive`(ダンス中)ゲートに取られて近接フィニッシュ単体で
   出なくなっていた。条件を「コンボ窓(meleeFinishComboUntil)が有効 かつ count>=2」に変更し、
   近接フィニッシュでも四神舞でも表示。gameTime は秒粒度なので失効後~1sで自然に消える。
   (rhythmActive 購読は不要になり削除。)
2) ステージ2の索敵仕様: lab テーマの湧き敵を休眠(dormant)+aggroRange(=300)付きで生成。
   既存 updateEnemies の dormant ブロックにより、プレイヤーが aggroRange 内 かつ 壁越しでない(視界)
   ときだけ起床(視界遮蔽は wallRects=手置き壁オブジェクトで segmentBlocked)。
   fixed は付けないので、遠くで眠ったままの個体は敵数キャップで通常カリングされ溜まらない。

### 負荷スコア
1/10。表示条件の変更と、湧き時のフラグ付与のみ。索敵判定は既存ロジックを流用。

### Verification
- lint/build 通過。近接フィニッシュ連続でコンボ数が左上に表示。ステージ2の敵は視界+距離で起床。

## v0.25.531 — ステージ2 配置仕様(横ラン壁/縦2画面帯/奥) + 区画密度 + 床キャッシュ修正 + UV光 + 索敵半減 (claude/cool-edison-7b8jrl)
社長指示まとめて対応。
- 床が切り替わらない: spritePath の ?v=__APP_VERSION__ が更新前キャッシュを引く問題。専用ファイル
  public/sprites/lab-floor/lab-floor-stage2.png(最新タイル)を新規名で追加し、applyOutdoorGroundTheme が
  優先参照。新URL=確実にキャッシュ更新。
- 壁/UVバーを「区画(LAB_ZONE=900)ごとの手続き生成」に刷新(静的 placedWalls/wallRects は廃止)。
  - 壁: 横方向に連なるラン。通常帯=1〜5個 / 奥(deep)=6〜13個。footX を WALL_RUN_SPACING=150 で右へ連結。
  - 縦帯: |セル中心Y|<=LAB_DEEP_Y(=2*900=約2画面)が通常帯。超えると deep=極端に連なる壁が増える。
    deep には UVバー/アイテムを置かない(敵のみ)。
  - UVバー: 通常帯のみ区画1本(奥は無し)。当たり判定なしの光源。
  - 当たり判定/視線/弾遮り/描画は全て labWallsInRegion を region 問い合わせ(木と同じ方式)。長いランの
    左方伸長に備え左に+3セル走査。updateEnemies はプレイヤー周辺1ビューポート分を1回問い合わせて使い回す。
- 区画密度: 1画面区画あたりラボ敵は3体まで(labZoneKey で集計しスポーン抑制)。
- スタート地点付近(原点 LAB_START_SAFE_RADIUS=700)には湧かせない。
- ラボ敵の索敵範囲を半分(300→150)。
- UVバーの光: 広く弱く(半径150→190、ピークα~0.28)。ハイライト抑え気味で暗部を紫がかって少し明るく。

### 負荷スコア
2〜3/10。壁は region 生成+リサイクル/当たりは近傍区画のみ。deep は壁数が増えるがアクター上限内の AABB。
床は1枚差し替え。いずれも毎フレームの新規確保は最小。

### Verification
- lint/build 通過。stage-2: 床が新タイルに更新、横ラン壁・通常帯/奥の壁密度、区画3体・原点周辺は無湧き、
  UVは通常帯のみで広く柔らかい紫光、索敵150。
### 次: 縦帯の広さ/ラン長/密度は実機で要微調整。横方向の通路感(ランの隙間)も調整余地。

## v0.25.532 — ステージ2は「ラボ敵以外は沸かない」=死神も停止 (claude/cool-edison-7b8jrl)
社長指示。研究所スキンでは死神(Reaper)システムも無効化(reaper ブロックを !labTheme でゲート)。
これで lab の出現は continuous spawner のラボゾンビ(Lv1/2/3)のみ(森波/giantbat/死神は全て無効)。

### 負荷スコア
1/10。条件ゲート1つ追加のみ。

### Verification
- lint/build 通過。stage-2 は死神も含め非ラボ敵が一切出ない。

## v0.25.533 — ステージ2: 縦帯を半分 / リサイクル機構の森敵混入を修正 (claude/cool-edison-7b8jrl)
- 縦帯(LAB_DEEP_Y)を 2*LAB_ZONE(1800)→ 1*LAB_ZONE(900)へ半減。通常帯を狭め横移動重視を強める。
- 「ラボ敵以外が湧く」残因を修正: 敵リサイクル機構(遠方の敵を generateAt で作り替え)が
  タイプ未指定=森の selectEnemyType を使っていた。labテーマでは selectLabEnemyType(Lv1/2/3)に固定し、
  リサイクル個体も dormant+aggroRange(索敵仕様)で再配置。これで lab は完全にラボ敵のみ。

### 負荷スコア
1/10。定数変更とリサイクル時の型選択分岐のみ。

### Verification
- lint/build 通過。stage-2 は森敵が一切混ざらず、縦帯が約半分に。

## v0.25.534 — ステージ2の床が切り替わらない件: 毎フレーム強制再適用 + repeat wrap (claude/cool-edison-7b8jrl)
コード/アセット/gitは正常(lab-floor-stage2.png 追加済み・applyOutdoorGroundTheme は lab で参照)だが
現地で床が変わらない報告。確実化のため applyOutdoorGroundTheme を変更:
- 変更ゲートで早期 return せず、lab の間は毎フレーム ground ストリップへ床テクスチャを再適用
  (strip.texture!==tex のときだけ代入=churn 回避)。何かが戻しても確実に張り替わる。
- NPOT でもタイル反復できるよう tex.source の addressMode='repeat' を明示(屋内ラボ床と同じ)。
- 背景3層の差し替え/森への復元はテーマ変化時のみ(従来どおり)。
注: それでも変わらない場合はブラウザの強キャッシュが濃厚 → ハードリロード推奨(?v=版バージョンでバスト)。

### 負荷スコア
1/10。lab 時に72ストリップの参照比較+tint 設定/フレーム(代入は初回のみ)。

### Verification
- lint/build 通過。

## v0.25.535 — 出撃中HUDのステージ名を選択ステージに連動 (claude/cool-edison-7b8jrl)
GameHUD のステージ名が「マッド・フォレスト」ハードコードで、研究所(stage-2)でも森名が出ていた。
getStage(getSelectedStageId()).name に連動(未取得=ベンチ/フリー等は従来名フォールバック)。研究所では「研究所跡」表示。
### 負荷スコア 1/10(描画時に選択ID参照のみ)。
### Verification lint/build 通過。

## v0.25.536 — 床切り替わらない件の切り分け用デバッグ表示 (claude/cool-edison-7b8jrl)
床がまだ変わらない報告。コード/アセット/git は正常に見えるため、実機で「ラボ床テクスチャがロードできているか」を
確認するデバッグを左下バージョン横に追加: `floor:SGC`(S=lab-floor-stage2 / G=lab-floor-ground / C=lab-floor-clean、
ロード済み=その文字、未ロード=ハイフン)。これで「読み込み失敗(=---/--C等)」か「読込OKだがスワップ未反映」かを切り分ける。
### Verification lint/build 通過。確認後にデバッグ表示は除去予定。

## v0.25.537 — ラボ床を「森の地面と同じ Assets.load 経路」で確実読み込み (claude/cool-edison-7b8jrl)
床が切り替わらない件の本命対策。マニフェスト(getTexture)経由の読込に何らかの不具合がある可能性を回避し、
PixiStage で森の地面/背景と同じ Assets.load(`sprites/lab-floor/lab-floor-stage2.png`、?v無し=別URLでキャッシュ回避)
でラボ床を直接ロード→ scene.setLabGroundTexture() で注入。applyOutdoorGroundTheme は this.labGroundTex を最優先で
使用(repeat wrap/nearest 設定済み)。注入時に outdoorGroundTheme を null へ戻し再適用。
念のため正規アップロード画像で lab-floor-stage2/ground.png を再保存(バイト一致保証)。
### 負荷スコア 1/10(テクスチャ1枚の追加ロード)。
### Verification lint/build 通過。左下 floor: デバッグは継続(確認後に除去)。

## v0.25.538 — 研究所の床が見えない件: 床は適用済み、霧/暗さで隠れていた → ラボは霧OFF+暗さ緩和 (claude/cool-edison-7b8jrl)
左下デバッグ `floor:SGC` で3種ロード成功を確認、syncLab→applyOutdoorGroundTheme も毎フレーム実行。
=床テクスチャ(がれき床)は正しく適用済み。見えにくい原因は 森の霧(FOG)+クールグレード+ビネット の重なり。
研究所スキンでの対策:
- 森の霧(fogLayers)を renderable=false で非表示(visible 有効フラグは保持・森は従来どおり)。
- クールグレード gradeSprite.alpha を lab では 0.45 倍に。
- 周辺減光 vignette を lab では 0.5 倍に。
これで がれき床がはっきり見える。
### 負荷スコア 1/10(フラグ/α変更のみ)。
### Verification lint/build 通過。確認後 floor: デバッグ表示は除去予定。

## v0.25.539 — 装備=サブ1つ/スキル最大2 / 拍数メーターはダンス練習時のみ (claude/cool-edison-7b8jrl)
- 装備メニュー: サブウェポンを単一選択(1つだけ。選び直しで置換・再タップで解除)。スキルは従来どおり最大2。
  resetGame でも装備サブは先頭1件に制限(旧保存の複数選択もガード)。ラベルを「サブウェポン1 / スキル最大2」に更新。
- DanceTapMeter(拍数計測テスト表示): rhythm.active 条件だと通常プレイの四神舞使用時にも出ていた。
  danceTestMode(ダンス練習)時のみ表示に限定。
（※床反映は v0.25.538 で解決済み=がれき床適用済み、霧/暗さ緩和で視認可に。）
### 負荷スコア 1/10。
### Verification lint/build 通過。

## v0.25.540 — ステージ2「可視可能ゾーン」(フォグ・オブ・ウォー風) (claude/cool-edison-7b8jrl)
研究所スキン専用の新効果。
- 乗算の暗闇レイヤー labVisibility を uiLayer 最下に追加(=ワールド/前景の上、グレード/ビネット/HUDの下)。
  AlphaFilter で一度テクスチャ化→全体を blendMode='multiply' で合成。
  内訳: 暗ベース(Sprite, tint=LAB_VIS_DARK=0x14141c) + 明かりの穴(getVisibilityLightTexture: 中心ベタ→際で急落)。
- 穴はプレイヤー + 画面内のUVバー位置(world→screen = world-camera+shake)、半径=LAB_VIS_RANGE(=176=ハンドガン射程)。
  穴の中=通常の明るさ、外=急に暗い(かすかに見える程度)。壁/敵/アイテムはこの層の下=暗所で見えづらい。
- lab テーマ かつ 非屋内 のときのみ表示。?vrange / ?vdark で調整可。ライトはプール(UVバー数分)。

### 負荷スコア
4/10(rendering)。毎フレーム全画面のフィルタ(render-to-texture)+multiply 合成が1パス増える。
研究所スキン限定・森や他ステージは不変。ライトはプール/画面内カリングで bounded。重い端末向けに ?vrange 縮小や
将来 simpler パスへ切替の余地あり。

### Verification
- lint/build 通過。stage-2 でプレイヤー/UVバー周辺だけ明るく、外周は急に暗くなる。

## v0.25.541 — 可視可能ゾーンを「暗幕＋反転マスク」方式に作り直し(真っ暗バグ修正) (claude/cool-edison-7b8jrl)
v0.25.540 の AlphaFilter+multiply 合成では明かりの穴が抜けず全画面が真っ暗だった。確実な方式へ変更:
- 暗幕(labVeil): 全画面の暗い Sprite(tint=LAB_VIS_DARK, alpha=LAB_VIS_ALPHA=0.9)を uiLayer 最下に。
- マスク(labMaskLayer): プレイヤー+画面内UVバー位置に光テクスチャ(中心ベタ→際で急落)を配置。
- veil.setMask({ mask: labMaskLayer, inverse: true }) で「光の形をくり抜く」。穴の中=通常の明るさ、外=暗幕で暗い。
- 半径=LAB_VIS_RANGE(176=ハンドガン射程)。lab+屋外のみ。?vrange/?vdark/?valpha 調整可。AlphaFilter 依存を撤去。
### 負荷スコア 4/10(マスク=render-to-texture 1パス。lab限定・ライトはプール/画面内カリング)。
### Verification lint/build 通過。

## v0.25.542 — 可視可能ゾーン調整: 円形でなだらか/暗ゾーンを少し明るく (claude/cool-edison-7b8jrl)
- ライトテクスチャを滑らかな放射状グラデに(中心明→縁透明)。硬い縁/四角い見えを解消=円形でなだらかに暗くなる。
- 暗幕の濃さ LAB_VIS_ALPHA 0.9→0.8(ほんの少し見える)。
- なだらか化で明域が狭く感じるため半径既定 176→200(?vrange 調整可)。
### 負荷スコア 4/10(据え置き)。
### Verification lint/build 通過。

## v0.25.543 — 可視可能ゾーンの四角問題を修正: RenderTexture+erase で円形ソフトに (claude/cool-edison-7b8jrl)
Container を setMask に使うとステンシル(矩形)扱いになり四角く切り取られていた。方式変更:
- オフスクリーン Container(labRTScene)に 暗幕rect(alpha=LAB_VIS_ALPHA) + 光ディスク(blend='erase') を描き、
  renderer.render で画面サイズの RenderTexture(labRT)へ合成。erase がアルファを削る=円形・なだらかな穴。
- その labRT を1枚のスプライトとして uiLayer 最下に重ねる。PixiScene に setRenderer を追加(PixiStage から app.renderer 注入)。
- ライトテクスチャは滑らかな放射状グラデ(前版)。半径=LAB_VIS_RANGE(200)、暗さ=LAB_VIS_ALPHA(0.8)。
- destroy で labRT 解放。
### 負荷スコア 4/10(RT合成1パス。lab限定・ライトはプール/画面内カリング)。
### Verification lint/build 通過。

## v0.25.544 — 可視可能ゾーン: 背景4層を効果の外に(暗くしない) (claude/cool-edison-7b8jrl)
社長指示「背景はこの効果の外に」。lab 時、暗幕(veil)の上へ 遠景/地平帯/手前帯/天井 を退避(setLabSceneryAboveVeil)。
- uiLayer 内で veil の直上に labBrightScenery を置き、farBackdrop/horizonForest/frontForest/labCeiling を奥→手前順で移動。
- 暗幕で暗くなるのはゲームプレイ(床/壁/敵/アイテム/プレイヤー)だけ。背景は明るいまま(グレード/ビネットは従来どおり乗る)。
- 非lab/非表示時は元の親・位置へ復元(labSceneryOrig)。
### 負荷スコア 4/10(据え置き。退避は親付け替えのみ・RT合成は既存1パス)。
### Verification lint/build 通過。

## v0.25.545 — 四隅ビネットをステージ1と同じ強さに戻す (claude/cool-edison-7b8jrl)
社長指示。v0.25.538 で lab のビネットを0.5倍にしていたのを、ステージ1同様 ENV_VIGNETTE_ALPHA(等倍)へ戻す。
四隅の周辺減光は通常どおり。可視可能ゾーン(暗幕)とは別効果。グレード弱め/フォグOFF は維持。
### Verification lint/build 通過。

## v0.25.546 — 可視可能ゾーン: プレイヤーの明域を一回り狭く (claude/cool-edison-7b8jrl)
社長指示。プレイヤー周辺の可視半径だけ縮小(LAB_VIS_RANGE_PLAYER=160, UVバーは LAB_VIS_RANGE=200 のまま)。
pts[0]=プレイヤー(狭) / pts[1..]=UVバー(通常)で半径を出し分け。?vrangep で調整可。
### Verification lint/build 通過。

## v0.25.547 — 連続調整: 湧き間引き&遠方化 / UV増 / EXP1/3 / S2敵HP×2 / PHILL×2 / クリア書類&ガード / 照準ゆっくり (claude/cool-edison-7b8jrl)
- 敵湧き(ラボ): 1画面区画上限 3→2、湧き間隔×1.6、1回の湧き上限=1、湧き位置を画面外の遠くへ(リング: 最大辺×0.62+ゆらぎ)。
  急に画面内に湧く問題を解消。
- UVバー: 区画の約45%に2本目を追加(少し増やす)。
- 経験値: 全体で獲得スピード1/3(XP_GAIN_MULT=1/3, gainExperience で一律)。
- ステージ2敵: lab-zombie 基礎HP×2(40/90/160→80/180/320)。PHILL銃ダメージ×2(40→80)で釣り合い維持。
- クリア書類(重要データ): 左右どちらかの端にランダム配置。その手前(原点側)に Lv3/2/1 を1体ずつ(固定・休眠・aggro220)。
- 照準サークル(PHILL/アンカー共通)の追従を遅く: AIM_INERTIA_TAU 0.10→0.20。発射基準は従来どおり aimX/aimY(サークル位置)。

### 負荷スコア 1/10(定数/分岐中心。UVは区画生成の延長、ガードは3体)。
### Verification lint/build 通過。

## v0.25.548 — ノックバックのずらし速さを約2/3に (claude/cool-edison-7b8jrl)
社長指示。通常のノックバック速度を約2/3へ。
- BULLET_KNOCKBACK_SPEED 64→43(射撃ヒットの押し戻し)。KNOCKBACK_SPEED 200→133(近接カウンターの押し)。
- 特殊スキルのノックバックは弱体化しないよう従来の絶対値に固定: SHIELD_BASH=960, WIRE_LAND=400, WHIP=600
  (以前は KNOCKBACK_SPEED 連動だったため、基準2/3化の巻き添えを回避)。WIRE大launch/レベルアップ押しは据え置き。
### Verification lint/build 通過。

## v0.25.549 — パンプキン着地予告(赤影)+爆撃範囲縮小 / レベルアップNB 2/3 (claude/cool-edison-7b8jrl)
- パンプキン/lab-zombie-3 のジャンプ攻撃: 空中(aiPhase='jump')の間、着地点に赤い影(楕円・脈動)を表示
  (syncPumpkinTelegraph, groundLayer)。半径=実爆撃範囲に一致。
- 爆撃範囲 PUMPKIN_EXPLOSION_RADIUS 66→54(少し狭く)。
- レベルアップ時ノックバック LEVELUP_KNOCKBACK_DISTANCE 96→64(今の2/3)。
### 負荷スコア 1/10(Graphics1枚に着地中の敵分だけ楕円。通常は0)。
### Verification lint/build 通過。

## v0.25.550 — 武器商人で武器購入時に武器庫取得と同じSE (claude/cool-edison-7b8jrl)
SEは存在(weapon-pickup=武器クレート/ドロップ取得時に鳴るもの)。ShopMenu の武器購入(buy-phill 成功時)に
playSfx('weapon-pickup') を追加。武器庫取得と同じ音が鳴る。
### Verification lint/build 通過。

## v0.25.551 — ブーメランCD表示刷新 / 回転刃&トラップ範囲調整 (claude/cool-edison-7b8jrl)
- ブーメランのCDサークルを廃止。CD明け(not-ready→ready)の瞬間にプレイヤー頭上へブーメランマーク(シアンの「へ」字)が
  一瞬出てふわっと上へ消える(updateBoomerangReadyMark, effectLayer)。同時に「カチッ」SE(専用音未用意のため ui-select を流用)。
  検出は useGameLoop(boomReadyRef)、store に boomerangReadyFxAt を追加。
- 回転刃(停止中)範囲 DRONE_BOOM_RADIUS 72→50(トラップと同程度に)。
- トラップ範囲 MARKSMAN_TRAP_RADIUS_BY_LEVEL 34/42/50→44/52/60(少し拡大)。ブーメランは拡大しない。
### 負荷スコア 1/10(Graphics1枚・650ms演出, 定数変更)。
### Verification lint/build 通過。※カチッ専用SEがあれば差し替え予定。

## v0.25.552 — ブーメランCD明け演出: 位置↑/ピカ!/SE可聴化 (claude/cool-edison-7b8jrl)
- SEが無音だった原因=流用した 'ui-select' に音源未定義。音源のある 'reload'(カチッ系)に変更。
- 頭上マークの表示位置を上げる(player.y-26→-46)。
- 出現直後に「ピカ!」フラッシュ(白い加算グロー、~170msで素早く消える)を追加。boomReadyGfx を blendMode='add' に。
### Verification lint/build 通過。※専用「カチッ」SEがあれば差し替え可。

## v0.25.553 — 盾バッシュ命中音 / ジャンプ着地音(社長提供SE) (claude/cool-edison-7b8jrl)
- 提供SEを public/audio/sfx/heavy-impact.mp3 として配置。SfxKey 'heavy-impact' 登録。
- ジャンプ攻撃(パンプキン/lab-zombie-3)の着地: pumpkinBlasts 消化時に playSfx('heavy-impact')。
- 盾バッシュ命中: triggerCounter の bashHitEnemy 時に store.bashHitFxAt を更新 → useGameLoop が検出して playSfx('heavy-impact')。
### Verification lint/build 通過。

## v0.25.554 — 鞭命中/鞭振り/アンカー打ち込み SE(社長提供) (claude/cool-edison-7b8jrl)
提供3SEを public/audio/sfx/ に配置・登録(whip-hit / whip-swing / anchor-plant)。
store に whipHitFxAt / whipSwingFxAt / anchorPlantFxAt を追加し、各イベントで更新:
- 鞭振り: triggerCounter の鞭分岐(命中問わず) → whip-swing。
- 鞭命中: performWhipStrike の res.hits>0 → whip-hit。
- アンカー打ち込み: wire-anchor 設置時 → anchor-plant。
useGameLoop が各タイムスタンプの更新を検出して playSfx(対応キー)。
### Verification lint/build 通過。

## v0.25.555 — 鞭命中音がナイフ音と重複する問題を修正 (claude/cool-edison-7b8jrl)
counter 呼び出し側(useGameControls/VirtualJoystick)が swung→'melee'、hit→'slash-damage'(ナイフ音)を鳴らしており、
鞭でも重複していた。鞭装備時(subWeapons.includes('whip'))は汎用の melee/slash-damage を抑制し、
鞭専用SE(whip-swing/whip-hit)に一本化。finisher(melee-finish)/敵死亡は据え置き。
### Verification lint/build 通過。

## v0.25.556 — heavy-impact(バッシュ命中/ジャンプ着地)SEの音量UP (claude/cool-edison-7b8jrl)
小さいとの指摘。GainNode は1超で増幅可なので volume 0.9→1.8 に。
### Verification lint/build 通過。

## v0.25.557 — アンカー敵命中=近接音 / ブーメラン投擲音(社長提供) (claude/cool-edison-7b8jrl)
- ワイヤーアンカー: 打ち込み経路に敵がいる(segmentBlocked で判定)場合は近接命中音(slash-damage)だけ、
  いない場合は打ち込み音(anchor-plant)。store に anchorEnemyHitFxAt を追加。
- ブーメラン投擲音: 提供SEを public/audio/sfx/boomerang-throw.mp3 として登録。投擲時(store)に boomerangThrowFxAt 更新→
  useGameLoop が検出して playSfx('boomerang-throw')。
### Verification lint/build 通過。

## v0.25.558 — anchor-plant SE 音量を少し下げる (claude/cool-edison-7b8jrl)
打ち込み音 anchor-plant の volume 0.85→0.65。
### Verification lint/build 通過。

## v0.25.559 — 召喚音(社長提供SE) (claude/cool-edison-7b8jrl)
錬金術の召喚(summonAlchemy)時に summon SE。public/audio/sfx/summon.mp3 登録、store summonFxAt 更新→useGameLoop 再生。
### Verification lint/build 通過。

## v0.25.560〜563 — 装備スキル23種＋ゴールドガチャ＋永続財布（段階実装・進行中） (claude/cool-edison-7b8jrl)
既存スキル規格を流用し、23種の装備スキル＋特殊枠（賢者の石）と効果層を新設中。入手はゴールドガチャ、装備は所持から2枠。
### 基盤 (v0.25.560)
- types/game.ts: SkillKey を23種へ。SubWeaponKey に 'sage-stone'。Player に状態フィールド7種（fireShooterCdUntil ほか）。
- campaign.ts: SKILLS に rarity(normal/rare/super)、GACHA_RARITY_WEIGHTS(60/35/5)、GACHA_PULL_COST=150、
  GACHA_REFUND_BY_RARITY(50/150/500)、rollGachaSkill()、RARITY_LABEL。
- gameStore.ts: hasSkill/hasSageStone、EXCLUSIVE_SUBWEAPON_GROUPS に ['alchemy','sage-stone']、
  永続 ownedSkills(localStorage)・goldBalance(localStorage)＋ grantSkill/addGold/spendGold。
- 武器開発(MissionSelect)トップにスキルガチャを組込（ゴールド消費・重複は返金）。装備画面は所持済みスキルのみ表示（レア度色）。
- GameOverScreen: ランの goldEarned を財布へ加算（マウント1回・ベンチ除外）。所持ゴールド表示。
### 効果 Group A core (v0.25.561)
ナイト(被ダメ-20%)/バーサーカー(被ダメ+20%・失HP%で全攻撃増)/クリD上昇(+0.5・近接+銃)/スナイパー(停止敵・遠距離で銃増)/
ゴールドラッシュ(+10〜30%)/タイムキーパー(サブCD-30%)。純粋関数 skill* ヘルパに集約。load 1/10。
### 効果 (v0.25.562)
シャープシューター(非貫通銃に貫通+1)/ゴーストシューター(20%弾消費なし)/エクスプローダー(爆発半径&ダメ+20%・ランチャー/手榴弾)/
ナイト追加(盾・召喚の最大HP+50%)。load 1〜2/10。
### 効果 (v0.25.563)
スケーター(歩行速度×2・慣性0.4s)/弁慶(武器切替で10s crit率+10%→3sCD)。load 1/10。
### 未実装（次バッチ）
- C近接/カウンター: 死神(finisher波及)/コンボマスター/ナイフマスター/カウンターマスター/スラッシャー/パニッシャー、弁慶のCD終了閃きVFX。
- B弾/爆発spawn: 跳弾/ボマー/ファイアシューター/反射神経/ボムカウンター。
- D: ドッグラン(犬CD0・射程解除)。
- E: 賢者の石（錬金術Lv3で武器商人に陳列・購入導線＋効果: 召喚AoE/死神召喚強化/ハリケーン+20%）。
- 要確認: コンボマスターの「ダメージ増加」は finisher が即死のため、コンボ中の通常近接/銃ダメージに掛ける解釈で進める想定。賢者の石の各数値は仮値。
### Verification: 各コミットで npx tsc --noEmit + npm run build 通過。

## v0.25.565〜567 — 装備スキル 残り効果＋賢者の石（完了） (claude/cool-edison-7b8jrl)
v0.25.564 までで完了済みの12種に続き、残る効果を3グループで実装。各コミットで tsc+build 通過。
### C近接/カウンター (v0.25.565)
- knife-master: 近接ヒットで knifeComboCount を加算（窓3s・窓切れで1にリセット）。近接ダメ ×(1+min(0.20, floor(count/2)*0.01))。
- combo-master: combo-master 装備時 meleeFinishComboUntil を +1s。近接ダメ ×(1+min(0.50, meleeFinishComboCount*0.02))。
  finisher は即死のため、コンボ生存中の非フィニッシュ近接/カウンターダメージに反映（社長確認の解釈）。
  → 3近接ダメージ地点（カウンター/刀/鞭）とカウンター斬撃に共通の skillMeleeComboMult を適用。
- slasher: 近接後 0.5s の窓（slasherWindowUntil）。窓内の追撃は当たり位置近傍へ ×0.3 の追加ヒット1回（有界・自動追撃方式を採用）。
- counter-master: COUNTER_WINDOW +0.5s（triggerCounter の窓アサイン＝sweep/刀/鞭で共通）。成立スイングで MELEE_RADIUS*1.5 内を 2×KNOCKBACK_SPEED で弾く。
- reaper(super): finisher 発生時、仕留めた敵の MELEE_RADIUS 内の他敵へ即死を波及（ボス/reaper 除外・有界）。カウンター/刀/鞭の3経路。
- benkei CD終了VFX: useGameLoop で benkeiCdUntil 跨ぎを useRef でエッジ検出し、頭上に「閃き」フラッシュ（描画のみ・スロー無し）。
- load 2/10（simulation）: 近接イベント毎の近傍走査のみ。毎フレーム全体ループ無し。
### B弾/爆発spawn (v0.25.566)
- ricochet: 通常銃弾命中で20%、最寄りの別敵へ ×0.5 跳弾1発（ricochet フラグで二次跳弾禁止）。
- fire-shooter: 20%の射撃が爆発弾化（×0.3・半径66）。player.fireShooterCdUntil で 3s 裏CD。Projectile.explodeOnHit 経路を新設。
- bomber: 手榴弾が起爆前に一度だけ子グレネード3発を散布（×1/3）＋親の信管 +1s。timed-grenade 爆発が per-grenade の半径/ダメージを参照するよう拡張。
- bomb-counter: 反射カウンター弾に explodeOnHit(GRENADE_*) を付与し命中で爆発。
- reflex: 被弾時、CD明けならプレイヤー中心に GRENADE 級反撃爆発＋近傍2×ノックバック。reflexCdUntil で 1s CD。
- いずれもサブ武器/周期/projectile 爆発のためスロー無し（CLAUDE.md）。load 2/10。
### E賢者の石 (v0.25.567)
- 商人陳列: maybeUnlockSageStone（alchemyLevel>=3 で unlockedShopSkillCards に 'sage-stone' を Lv1 解禁）を selectUpgrade/buyShopItem/buySkillCardFromShop に配線。SHOP_SAGE_STONE_COST=100。EXCLUSIVE_SUBWEAPON_GROUPS の ['alchemy','sage-stone'] で同居。
- 効果: 通常召喚=単体接触→半径90 AoE / レア(死神)=近接ダメ+50%・巻き込み半径+30% / 鞭ハリケーン=半径&ダメージ+20%。
- 各数値は仮値（実機調整前提）。load 2/10。
### Verification: 各グループで npx tsc --noEmit + npm run build 通過。
### 次ハンドオフ: D ドッグラン(犬CD0・射程解除)は別途実装済み（v0.25.564 まで）。全23種＋賢者の石の効果配線が完了。実機での数値調整（コンボ上限/賢者の石の半径・倍率/reflex 威力）が残課題。

## v0.25.568 — コンボマスターを全攻撃へ拡張(社長指示) (claude/cool-edison-7b8jrl)
コンボマスターの「コンボでダメージ増加」を近接限定から**全攻撃(銃含む)**へ。
- skillMeleeComboMult から combo-master 分を skillComboMasterMult として分離(knife-master は近接専用なので銃には乗せない)。
- 銃ヒット処理(useGameLoop)の dmg にも skillComboMasterMult を適用(フィニッシュコンボ生存中 +2%/combo・上限+50%)。
- desc を「コンボ中は全攻撃のダメージ増加」に更新。
load 1/10(定数係数の乗算のみ)。
### Verification: npx tsc --noEmit + npm run build 通過。

## v0.25.572 — ステージ2: 城マーカー抑制＋クリアアイテム位置表示 (claude/cool-edison-7b8jrl)
- 城が描かれないラボ/屋内(ステージ2)で、画面端の城位置マーカーだけが出ていた不具合を修正。
  syncArrows に castleVisible(=!(indoorMode||stageTheme==='lab'))を渡し、城マーカーをゲート。
- クリアアイテム(lab-clear-item=重要データ)の位置マーカーを追加。画面外のとき画面端に
  書類アイコン+矢印(シアン)で誘導。描画のみ(レンダラ read-only)。
load 1/10(boolean分岐＋既存pickup走査に相乗り)。
### Verification: tsc + build 通過。

## v0.25.573 — 死神(reaper)の挙動を仕様に合わせ修正 (claude/cool-edison-7b8jrl)
社長の認識確定: 近接フィニッシュを決めた瞬間、その「近接攻撃範囲(プレイヤー中心の同じスイング範囲)」内の
敵を全員フィニッシュ。ボスは即死せず近接フィニッシュ相当ダメージ(=スタン中ボス近接と同じ ×5)。
- 旧実装は「仕留めた敵の周囲MELEE_RADIUS」で中心がズレ＆ボス除外だった。
- applyMeleeFinishSkillSpread を (finisherOccurred, pcx, pcy, range, baseMeleeDamage) 化。
  カウンター=huntingMeleeRadius / 刀=katanaRange / 鞭=WHIP_LENGTH を範囲に使用。ボスは BOSS_MELEE_STUN_MULT(×5)。
- 発動条件は従来どおり「finisher が1体でも出たスイング」(=スタン敵を近接処刑)。
load 1/10(イベント時・範囲内のみ走査)。
### Verification: tsc + build 通過。

## v0.25.574 — 発火(投げ)ナイフの爆発範囲アップ (claude/cool-edison-7b8jrl)
FIRE_KNIFE_RADIUS_BY_LEVEL を 54/62/70 → 80/94/108 に拡大。爆発グロウも blastR*0.68 で半径に追従。
ダメージ式・ノックバックは据え置き(falloffのみ広がる)。load 1/10。
### Verification: tsc + build 通過。

## v0.25.575 — スケーター慣性を1.5倍 (claude/cool-edison-7b8jrl)
inertiaTau 0.4 → 0.6s(=1.5倍。よりよく滑る/高リスク)。移動速度2倍は据え置き。
### Verification: tsc + build 通過。

## v0.25.576 — シールド致命バグ修正(skillSummonHpMult 未import) (claude/cool-edison-7b8jrl)
原因: useGameLoop の盾設置(1513-1514)が skillSummonHpMult を未importで参照 → 毎フレーム
ReferenceError でメインループ後半が丸ごと中断。結果、盾設置ブロック以降が全て動かず:
  - 敵が湧かない(spawn は後半)
  - コインが拾えない(pickup collection は後半)
  - 手榴弾が転がらない/切っても爆発しない(グレネード物理・爆発も後半)
プレイヤー移動/プロップ破壊は前半なので動いていた=症状が「一部だけ生きてる」状態に。
修正: skillSummonHpMult を import に追加。
注意: `tsc --noEmit` がこの未importを検出できていない(型チェックの穴)。別途要確認。
### Verification: tsc(exit0) + build 通過。盾装備時に後半処理が走る想定。

## v0.25.577 — スケーター慣性をさらに倍 (claude/cool-edison-7b8jrl)
inertiaTau 0.6 → 1.2s(=倍。かなり滑る/高リスク)。移動速度2倍は据え置き。
### Verification: tsc(exit0) + build 通過。

## v0.25.578 — シールドバッシュの押し出し方向を「叩いた面」基準に (claude/cool-edison-7b8jrl)
従来: プレイヤー進行方向(lastDirection)へ押し出し。
変更: プレイヤー中心→盾中心の向き(=叩いた側の反対=叩かれた面)へ押し出す。
進行方向に依存しないので、盾のどの面から叩いてもその面の先へ滑る。
中心がほぼ重なる時のみ設置法線へフォールバック。掃過AABB/敵ノックバックも同方向(dux/duy)を継続使用。
### Verification: tsc(exit0) + build 通過。

## v0.25.579 — スケーター移動速度 2倍→3倍 (claude/cool-edison-7b8jrl)
hasSkill('skater') の速度倍率 2→3(現在値×1.5)。リロード移動にも適用。desc も「3倍」に更新。
慣性(1.2s)は据え置き=さらに高リスク・高速。
### Verification: tsc(exit0) + build 通過。

## v0.25.580 — 囲い系イベント(強制アリーナ戦/ミニボス戦)新規実装 (claude/cool-edison-7b8jrl)
小イベント。開始2分以降ランダムで1回(1ゲーム1回)。プレイヤーを半透明の光る円(柵)に閉じ込め、
円内をイベント用の敵構成に置き換え、全滅/撃破 or 制限時間で終了→通常湧きへ復帰。
- 新規 src/world/arena.ts: clampRectInsideCircle(円コリジョン。renderer非依存)。movePlayer で壁解決の後に最終クランプ。
- types: Enemy.fromEvent / ActiveEvent(kind/x/y/radius/startedAt/endsAt)。
- store: activeEvent 状態 + beginArenaEvent(周辺×1.5の通常敵一掃。reaper/giantbat/pumpkin/fixed除外)/ endArenaEvent(残存fromEvent撤去)。
- useGameLoop: 発火/抑止/終了監視/cap切替。通常スポーナ・演出波は activeEvent 中停止。cap 10→20。
  ・horde=ゾンビ18体(zombie/skeleton/bat)・全滅/30s保険。 boss=giantbat+取り巻き4・撃破/60s保険。
  ・giantbat 流用だが fromEvent は finale勝利(gameWon)から除外(4箇所)。
  ・リサイクル/カリングは fromEvent を保護(円内に保持)。
- pixiScene: syncArena = groundLayer に光る二重リング+淡い塗り(加算)。
排他: activeEvent非null + arenaFiredRef で多重発火/通常湧きを抑止(卵等と重ねない)。
load 2/10(発火は一過性バースト・終了監視は≤20体filter/フレーム・描画は1図形/フレーム)。
### Verification: tsc(exit0) + build 通過。

## v0.25.581 — スラッシャー発動不能を修正 (claude/cool-edison-7b8jrl)
原因: 旧実装は「直前の近接から0.5s以内のスイング」に追撃を限定していたが、カウンターの最短
間隔=COUNTER_WINDOW(400)+COUNTER_COOLDOWN(420)=820ms〜 が窓0.5sより長く、二度と窓内に
入らないため一切発動しなかった。
修正: 説明(「近接直後の追撃(0.3倍)」)どおり、命中したスイングごとに ×0.3 追撃を発動(窓判定を撤去)。
slasherWindowUntil/setSlasherWindow は未使用化(無害・残置)。load 1/10(命中位置の近傍走査1パス)。
### Verification: tsc(exit0) + build 通過。

## v0.25.582 — スラッシャーを「近接成功→タップ追撃」に修正 (claude/cool-edison-7b8jrl)
社長確定仕様: 自動ではない。近接(カウンター)が命中したら arm され、そのCD中にタップで0.3倍追撃を
1回だけ出す。専用CDは持たず、カウンターのCDサイクルに自然に縛られる(1成功カウンター=追撃1回)。
- arm: カウンタースイングの set() で slashAt.length>0 のとき player.slasherWindowUntil = CD明け時刻。
- 発火: triggerCounter のCD早期returnで、hasSkill('slasher') && now<slasherWindowUntil ならタップ追撃
  (applySlasherTapStrike: meleeRange内の敵へ0.3倍・緑スラッシュ)→ setSlasherWindow(0) で消費。
- 旧「毎スイング自動追撃(v0.25.581)」「0.5s窓(発動不能)」は撤去。
load 1/10(タップ時に敵1走査1パス)。
### Verification: tsc(exit0) + build 通過。

## v0.25.583 — キャラ固有スキル(特別枠)追加＋ショップからキャラ固有サブウェポン削除 (claude/cool-edison-7b8jrl)
[Part1] 在ショップ(武器商人 ShopMenu)からキャラ固有サブウェポン(heavy-grenade/marksman-trap/
striker-hunting/striker-quick-mag)を非表示に。campaign.ts に CHARACTER_SUBWEAPON_KEYS を新設し
skillEntries で除外。キャラの初期サブウェポン保持/equip/武器開発は据え置き(社長指示は「ショップ」)。
[Part2] キャラ固有スキル(特別枠・player.characterClass で自動有効・装備スキル枠を消費しない・ラン中不変)。
  ・ストライカー(rogue): 装備銃が弾切れ(マガジン+リザーブ=0)で近接攻撃力 ×1.5。strikerMeleeMult を
    triggerCounter/スラッシャー追撃の meleeDamage へ。
  ・スカベンジャー(necromancer): 弾薬取得で3秒 銃ダメージ ×1.1。collectPickup で arm、fireWeapon の
    素ダメージへ反映(scavengerGunMult)。
  ・マークスマン(mage): 3秒以上連続移動で射程 ×1.1、停止で即解除。movePlayer で marksmanMovingSince 追跡、
    fireWeapon の射程ゲートへ marksmanRangeMult。
  ・ヘビーガンナー(warrior): 同一攻撃で2体以上ヒットで3秒 全爆発範囲 ×1.1。registerMultiHit(count>=2)で arm、
    grenade/explodeOnHit/fire-knife/heavy-grenade/近接 の各サイトで heavyGunnerExplosionMult を半径へ。
  ・新フィールド: scavengerBuffUntil / marksmanMovingSince / heavyGunnerExpBuffUntil(0初期化・resetでも0)。
  ・キャラ選択UIに「固有スキル(自動)」行を追加(名=職名、説明=charSkillDesc)。
load 1/10(全てイベント駆動 or 既存ループ相乗り。movePlayer の追跡はO(1)で既存setに同梱)。
### Verification: tsc(exit0) + build 通過。

## v0.25.584 — PHILLガン仕様追加(サークル内即被弾＋スロットトグル) (claude/cool-edison-7b8jrl)
1) 下部PHILLガンスロットをタップでトグル: 有効中タップ→直前の通常銃へ、無効時タップ→PHILLへ
   (他の銃は従来どおり持ち替え)。GameHUD の銃スロット onClick を分岐。
2) サークル内に即被弾へ変更: 弾を飛ばさず、狙いサークル(レティクル=player中心+aim×190)の位置に
   静止・短命(60ms)の phill-bullet を出し、既存の頭部/胴体コリジョンでその場解決。頭にサークルが
   乗っていればヘッドショット(crit)。着弾リングFXを追加。弾道移動は廃止。
load 1/10(既存プロジェクタイル経路を流用・1ショット1静止弾)。
### Verification: tsc(exit0) + build 通過。

## v0.25.585 — PHILL: トグル廃止＋狙いサークルの頭吸い付き/スナップ即ヘッドショット (claude/cool-edison-7b8jrl)
- v0.25.584の「スロットのトグル」を廃止(銃スロットは従来どおりタップで持ち替え)。
- 通常PHILLに追加:
  ・吸い付き: 狙いサークル(基準=player中心+aim×190)が敵の頭(PHILL_SNAP_RADIUS=46px内)に近づくと
    その頭中心へスナップ。movePlayer が毎フレーム算出し、phillReticleDX/DY/phillSnapEnemyId に格納。
    描画(緑リング=スナップ中/橙=通常)と発砲が同じ結果を共有。
  ・スナップ中に手を離す(発砲)= 即射撃・即被弾: 敵の頭中心に静止phill-bulletを置き既存頭部判定で
    確定ヘッドショット。通常弾は出さない。
  ・非スナップ時は通常通り弾を飛ばす(従来挙動)。
- 新フィールド: phillReticleDX/phillReticleDY/phillSnapEnemyId(0/null初期化)。PHILL_AIM_RANGE/PHILL_SNAP_RADIUS定数化。
load 1/10(PHILL有効時のみ敵≤cap走査/フレーム。描画・発砲は既存経路流用)。
### Verification: tsc(exit0) + build 通過。

## v0.25.586 — 照準サークル(PHILL/アンカー)を環境光の影響外に (claude/cool-edison-7b8jrl)
PHILL狙いサークル＋ワイヤーアンカーのプレビュー円を、playerFx(effectLayer=filteredWorld内・暗転/
tilt-shift/bloom が乗る)から新規 reticleGfx へ分離し danceUiLayer に配置。danceUiLayer は
filteredWorld の外＝フィルタ/暗転(環境光)が乗らず、world座標で追従(camera同期は既存 1519)。
→ 暗い場所でもサークルが減光・ボケせず常に視認可能。
他の playerFx 描画(カウンター/リロード/ワイヤー線・先端)は据え置き。
load 1/10(描画数は不変・レイヤー移動のみ)。
### Verification: tsc(exit0) + build 通過。

## v0.25.587 — 照準サークルが研究所の暗幕で減光される件を修正 (claude/cool-edison-7b8jrl)
v0.25.586 で danceUiLayer に移したが、研究所の暗幕(labVeilSprite)は uiLayer 最下(index0)=
worldGroup/danceUiLayer より上に重なるため、ラボではまだ減光されていた。
→ reticleGfx を uiLayer(暗幕より上)へ移動。uiLayer は screen 座標なので world.position(-camera+shake)
を足して world→screen 変換して描画。森の暗転(filteredWorld内)もラボ暗幕も両方回避。
load 1/10(描画数不変・レイヤー移動＋座標変換のみ)。
### Verification: tsc(exit0) + build 通過。
## 2026-06-19 — public/ PNG 軽量化（v0.25.588・ゲームロジック非改変）
- **目的**: 配信PNGペイロード削減。`src/**`(ゲームロジック)・参照パス・寸法・ファイル名は**一切不変**。`references/`は対象外。
- **手法**: `sharp`(0.35.1, `npm i --no-save`で一時導入)で `public/**/*.png` を**その場で再圧縮**。
  - 透過(RGBA)スプライト: パレット量子化 `{palette:true,quality:90,effort:10,compressionLevel:9}`(準ロスレス)。
  - 透過なし(RGB)背景: `{compressionLevel:9,effort:10}` の**ロスレス再圧縮**(無劣化)。
  - **小さくなった時だけ上書き**(退行防止)。各ファイルで寸法不変を検証。
- **結果**: `public/` PNG **40.75MB → 24.73MB(-16.02MB / -39.3%)**、134枚中**112枚**を縮小。
- **Verification**: 寸法不変を sharp で確認 / サンプル `file` でPNG有効 / `npm run build` exit0。
- load: ビルド時のみ・実行時コスト0(配信が軽くなる分ロードは速くなる)。

## v0.25.589 — 段階A: 単体スプライトのリサイズ(配信PNGのみ・ロジック非改変) (claude/cool-edison-7b8jrl)
表示の8〜20倍あったソース解像度を「長辺480px(≒表示×4・ズーム/DPR余裕込み)」へ縮小。
描画は containScale / targetH/tex.height で表示サイズに自動フィットするためコード変更ゼロ・見た目ほぼ不変。
- sharp を --no-save で一時導入(package.json/lock 非改変)、resize(lanczos3)+png(palette)で再エンコード。
- 縮小しても元より小さくならない6枚はスキップ(再圧縮済みの小物=退行防止)。タイトル/背景/床タイル/atlas は対象外(社長指示:タイトルそのまま/段階Bは別途)。
- 変更8枚: 4.68MB → 0.60MB(−87%)。主因 turret-omni/fixed(1254²→480²)、castle、lab-clear-item、lab-zombie-lv3。
- VRAM も大型テクスチャ(1254² RGBA≈6.3MB×2 等)が 480² に縮小=実メモリ大幅減。
### Verification: 寸法/PNG有効 確認・build(exit0) 通過・git差分は public/*.png 8枚のみ。

## v0.25.590 — 音声最適化(配信PNG非改変・コード非改変) (claude/cool-edison-7b8jrl)
- 未参照の旧ループ素材を削除: dance-*-loop.wav(3本=9.2MB) + dance-*-loop.mp3(3本=1.15MB)。repo全体でgrep参照ゼロ確認。
- 非リズムBGM(7本)を 177〜197k → 144k に再エンコード(同ファイル名=コード非改変)。41.9MB→28.3MB(−32%)。
  ・ffmpeg-static を --no-save 導入(package.json/lock 非改変)。
- リズム曲 dance-100/120/140.mp3 は無改変(位相キャリブレーション保護。bytes一致確認)。SFX wav(計261KB)もクリアさ優先で据え置き。
- 結果: dist 88.85MB → 62MB。dist音声 65MB → 40.5MB。
### Verification: dance3本のbytes不変・src/package非改変・build(exit0)・git差分はpublic/audioのみ。

## v0.25.591 — チャット引き継ぎドキュメント追加 (claude/cool-edison-7b8jrl)
CHAT_HANDOFF.md を新規作成。ブランチ/配信フロー、必須ルール、tsc型チェックの穴、本セッションの実装一覧、
現状(v0.25.590/dist62MB)、一時ツール(sharp/ffmpeg-static --no-save)、未対応/任意項目(段階B床タイル・音声・ガチャ無料の暫定)を集約。次チャットはこれ＋CLAUDE.md＋本ログを最初に読む。

## v0.25.592 — PHILL: 移動中でも頭スナップ中は指離しで即発砲 (claude/sweet-brown-bw8ixm)
- **サークルの吸い付き=頭**: 既に実装済みを確認(`movePlayer` が毎フレーム頭部リージョン中心 `footY - boxH*0.83` へスナップ、ヘッドショット判定リージョンと一致。描画と発砲が共有)。変更なし。
- **移動中の速射**: `firePhillShot` の `if (player.isMoving) return` を、スナップ中(`phillSnapEnemyId`)は素通りさせるよう変更。`snapEnemy` 判定を先頭へ移動し `if (player.isMoving && !snapEnemy) return;` に。
  - 効果: 頭に吸い付いた状態で指を離す(=停止)と、移動中でも従来の即ヘッドショット(`即被弾`)が発動。非スナップの通常射撃は従来どおり立ち止まり必須。
  - 速射の中身は「既存の即被弾ヘッドショット」そのもの(社長確認済み)。CD=武器cooldown(1秒)も従来どおり維持。
- 入力経路は既存のまま(VirtualJoystick `release()` / Space keydown の firePhillShot 呼び出し)。SE/弾消費も既存ロジックを共有。
- 影響範囲: `src/store/gameStore.ts` のみ。**Load score 1/10**(シム: 発砲時1回の分岐変更のみ。毎フレームコスト増なし)。
### Verification: `npx tsc --noEmit` exit:0。

## v0.25.593 — ステージ2: クリアアイテムを少し遠くへ (claude/sweet-brown-bw8ixm)
- 研究所スキン(屋外)のクリア書類(lab-document)の横方向距離を `1400 + rand*600`(1400〜2000) → `2000 + rand*600`(2000〜2600) に拡大(`gameStore.ts` reset の labDoc)。
- ガード(Lv3/2/1)は labDoc 相対配置、画面端マーカーも書類位置参照なので自動追従。変更は1値のみ。
- 影響範囲: `src/store/gameStore.ts` のみ。**Load score 1/10**(初期配置の定数変更のみ・実行コスト増なし)。

## v0.25.594 — ステージ2: クリアアイテムを約3倍遠くへ (claude/sweet-brown-bw8ixm)
- 書類(lab-document)の横方向距離を `2000 + rand*600`(2000〜2600) → `6000 + rand*1800`(6000〜7800)に拡大(約3倍。社長指示)。
- ガード/画面端マーカーは書類位置相対なので自動追従。変更は1値のみ。**Load score 1/10**。

## v0.25.595 — ステージ2: テストステージのプロップ(パソコン/割れたカプセル等)を遮蔽物として散布 (claude/sweet-brown-bw8ixm)
旧テスト(屋内)ステージで置いていた `lab-props`(12種:パソコン/割れたカプセル等)を、現ステージ2(研究所スキン・屋外)にも
区画ごとにランダム生成で再現(社長指示)。木と壁オブジェクトと同じ「決定的ハッシュ→区画クエリ」方式で、描画と当たり判定が必ず一致。
- `src/world/labWalls.ts`: `labPropsInRegion(minX,minY,maxX,maxY)` 追加。LAB_ZONE(900px)区画ごとに 2〜4 個散布。
  奥(deep)/原点(LAB_START_SAFE_RADIUS)付近には置かない(壁/UVバーと同じ方針)。`propRect`(足元当たり46×30)/`PROP_DISPLAY_H`(92px)/`PlacedProp`/`LAB_PROP_VARIANT_COUNT=12` を公開。
- 当たり判定(game logic): labTheme(=研究所スキン屋外)の壁解決3箇所に `labPropsInRegion().map(propRect)` を併用 →
  プレイヤー移動(`movePlayer`)/近接の視線(`triggerCounter` meleeWalls)/グレネード壁(`grenadeWallsFor`)。壁オブジェクトと同列の遮蔽物。
- 描画(pixiScene): `syncLabProps()` 追加(`syncLabWalls` をミラー)。actorLayer に足元アンカー+zIndex=footY、tint=ENV_TINT、
  depthScale+horizonActorAlpha。variant→`lab-props/lab-prop-r{row}-c{col}` テクスチャ。カメラ周辺区画のみ生成/リサイクル(seen で prune)。
  森/屋内では labTheme=false → props=[] で全 prune(no-op)。
- 既存12テクスチャはディスク+pixiTextures に登録済み(追加アセットなし)。
- **Load score 2/10**(rendering+sim)。可視区画ぶんのSprite生成/プルーン(壁と同様)、当たりは近傍区画クエリ(境界つき)。毎フレーム新規確保なし。
### Verification: `npx tsc --noEmit` exit:0(本env未 npm install のため build未実行。esbuildは型チェックしない=tscで担保)。import漏れ目視確認済み。

## v0.25.596 — イベント強制発火のテスト用URLパラメータ (claude/sweet-brown-bw8ixm)
森ステージのイベントを開始直後に強制発火させる調整用パラメータを追加(`useGameLoop.ts`)。描画/判定の本ロジックは不変、発火ゲートのみ上書き。
- `?arenanow=1` … 囲い系イベント(activeEvent)を開始直後に1回発火(2分待ち＋発火確率を無視)。kind はランダム。
  - `?arenanow=horde`(ゾンビ大量) / `?arenanow=boss`(giantbatミニボス) で種類を固定。
- `?castlenow=1` … 城フィナーレボス(giantbat)を開始直後に出現(通常5分→即時)。撃破でクリア。
- いずれも森ステージ専用(`!indoor && !labTheme` のまま)。ステージ2(研究所)/屋内/ダンスでは従来どおり発火しない。
- **Load score 0/10**(起動時にURLを1回読むだけ。毎フレームコスト増なし)。
### Verification: `npx tsc --noEmit` exit:0。

## v0.25.597 — ハンドガン系の連射速度(cooldown)調整 (claude/sweet-brown-bw8ixm)
連射間隔＝`cooldown`(次弾までのms。小=速い)を調整(社長指示)。弾速(projectileSpeed)/リロード(reloadMs)は不変。
- 二丁ハンドガン(handgun-t2): cooldown **300→420**(ハンドガンt1と同じ連射速度。※弾は2発のまま)。
- マシンピストル(handgun-t3, ≒サブマシンガン): cooldown **130→87**(今の2/3＝より速い連射。130×2/3≈86.7)。
- **Load score 0/10**(武器定義の定数変更のみ)。
### Verification: `npx tsc --noEmit` exit:0。

## v0.25.598 — 新イベント「救助ホールド」(activeEvent kind=rescue) (claude/sweet-brown-bw8ixm)
既存の囲い系イベント(activeEvent)を流用した時限防衛イベント。サークル内の逃げ惑うNPC3人を守り、累計25秒しのげば救助成功。
**プレイヤーは円に閉じ込めない=出入り自由**(社長指示)。森ステージ専用・他イベントと排他・2分以降ランダム1回(`?arenanow=rescue` で即発火)。
- 新規 `src/world/rescue.ts`(renderer-agnostic): 定数/編成抽選(1難→3易)/純粋AI `computeSurvivorStep`(円内バウンドカイト=最寄り敵120px内なら逃走・いなければ中央帰還・NPC反発30・円縁は外向き成分除去で接線スライド)/`RescueSurvivor` 型。
- 型(`types/game.ts`): `ActiveEventKind` に `'rescue'`、`ActiveEvent.holdMs?`、`Enemy.escortTarget?`(攻撃者が狙うNPC id)。
- store(`gameStore.ts`): state `rescueSurvivors[]`、`beginRescueEvent`(survivor3人配置＋攻撃者割当)/`updateRescue`(カイト移動・敵接触ダメージ・shooter自衛射撃・ホールドゲージ・勝敗/報酬)/`damageRescueSurvivor`。`endArenaEvent` で survivor も後片付け。`movePlayer` の円拘束は rescue を除外(出入り自由)。`updateEnemies` に escort retarget 分岐(担当NPC死亡時は最寄り生存NPCへ乗換、全滅でプレイヤー)。
- loop(`useGameLoop.ts`): アリーナ抽選を horde/boss/rescue の3択に拡張。rescue は `beginRescueEvent`＋緑リング演出。発火中は攻撃者を3体維持(補充)＋毎フレ `updateRescue`。誤終了する「敵全滅=clear」判定は rescue では使わず、成功(25秒)/全滅(失敗)/保険タイムアウトで終了。
- 描画(`pixiScene.ts`): `syncArena` を rescue=緑＋外周にホールド進捗の円弧へ拡張。`drawRescueSurvivors`(Graphics プレースホルダ人型＋頭上HPバー＋被弾コールアウト、actorLayer 最前)。テクスチャ資産は未使用(将来差し替え可)。
- 報酬は仮置き(生存人数×経験ジェム3)。数値は決め打ち(半径150/25秒/逃走40/トリガー120/反発30/攻撃者3)で実機調整前提。
- **Load score 1〜2/10**(イベント制・NPC最大3＋攻撃者3。毎フレ処理は軽量・新規確保なし)。将来「目的地へ向かう護衛」へ拡張可(座標データ駆動・カイトAI流用)。
### Verification: `npx tsc --noEmit` exit:0(import漏れ目視確認: RESCUE_HOLD_NEED_MS の未import を1件発見し修正済み)。本env未 npm install のため build未実行。

## v0.25.599 — アリーナボス=パンプキン化 / 城ボス=接近で魔法陣出現 / クリ表記の明確化 (claude/sweet-brown-bw8ixm)
1. **囲い系イベント(boss種)**: giantbat → **パンプキン+雑魚**に変更(社長指示)。`useGameLoop` の boss 分岐の spawn を pumpkin に(取り巻きゾンビは従来どおり)。
2. **城のフィナーレボス**: 「5分で出現」→「**城へ接近(<CASTLE_BOSS_APPROACH_DIST=380px)で出現**」に変更。出現時に**錬金と同じ magic-circle テクスチャの魔法陣演出**を城足元に再生(拡大しながらフェード・回転、赤系tint)。
   - 型 `CastleEvent.bossSummonAt?`、`markCastleBossSpawned` で Date.now をセット、`pixiScene` に `castleSummonCircle` スプライト(groundLayer・加算)を追加し `syncCastle` で駆動。ボス種は giantbat のまま。
   - `?castlenow=1` は従来どおり即出現(テスト用)。
3. **クリ表記**: スキル `crit-up` の表示を「クリティカルD上昇 / クリティカル倍率+0.5」→**「クリティカルダメージ上昇 / クリティカルダメージ ×1.5→×2.0(ボス ×5→×5.5)」**に(社長指示=ダメージなら倍率値を明記)。「クリティカル率(発生確率)」表記は据え置き。
- **Load score 1/10**(イベント分岐の差し替え＋短命スプライト1枚＋文言変更)。
### Verification: `npx tsc --noEmit` exit:0。

## v0.25.600 — マークスマン射程上昇の発動を頭上ターゲットマークで通知 (claude/sweet-brown-bw8ixm)
マークスマン(mage)の「移動3秒+で射程+10%」が発動した瞬間、プレイヤー頭上に一瞬ターゲットマーク(照準=二重円+十字・緑)を表示(ブーメランCD明けマークと同じ「ふわっと出て消える」演出)。
- store: top-level `marksmanRangeFxAt`(発火Date.now)/`marksmanRangeFxShownFor`(演出済みの連続移動streak=marksmanMovingSince)。`movePlayer` で射程上昇がこのstreakで初めて3秒到達したフレームに発火(streakごと一度)。
- pixiScene: `updateMarksmanRangeMark`(effectLayer・加算)。`marksmanRangeFxAt` 起点に life650ms でフラッシュ→フェード。射程倍率(marksmanRangeMult)の判定は不変=描画のみ。
- **Load score 1/10**(毎フレ1枚のGraphics描画は発動後650msのみ・通常はclearのみ)。
### Verification: `npx tsc --noEmit` exit:0。