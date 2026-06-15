# Development Log

This file is the handoff log for Codex, Claude Code, and other agents working
on the zombie game. Append a new entry after each meaningful change.

## Environment
- Repository: `/Users/tanity/zombie`
- Branch: `claude/chat-context-continuity-saxlH`
- Dev server: `npm run dev`
- Local URL: `http://localhost:5173/zombie/` unless Vite chooses another port
- Renderer under active development: PixiJS only

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
