# スキル・装備・サブウェポン 効果値 全数台帳

## この台帳の目的
社長方針: 「ボス攻撃パターンの拡充と合わせて、スキルと装備の効果値を全面的に見直したい。
特にクールタイム(CD)と移動スピード。見直しの前に『今なにがどこで何%効いているか』の
正確な台帳が要る」(発注文より引用)。

本台帳は**走査のみ**(コード改変なし)。値は全てファイル:行を添えてコードから引き写した。
「適用箇所が見つからない/届いていない効果」は§Eに疑いとして列挙する(修正はしていない)。

- スキル(SkillKey): **35種**(`SkillRarity`内訳: 超レア7[通常ガチャ枠4+警察署専用3] / レア15 / 通常13)
- 装備(EquipmentDef): **33件**(通常30 = 3部位×2系統×5段階 + 特殊3)
- サブウェポン(SubWeaponKey): **25種**

---

## §A CD(クールダウン)台帳

### A-0. 総論: CDを動かせる経路は3つ+1つの例外ルート
サブウェポンのCD開始は原則 `setSubWeaponCooldown(key, readyAt)` という**一箇所の合流点**を通る
(`src/store/gameStore.ts:6568-6594`)。ここで**必ず**以下の2つが乗る:

```ts
// src/store/gameStore.ts:6568-6594
setSubWeaponCooldown: (key, readyAt) => {
  recordSubUse(key);
  set(state => {
    const mult = skillCooldownMult(state.player);       // タイムキーパー ×0.9/0.8/0.7(Lv)
    const delta = readyAt - state.gameTime;
    if (delta > 0 && Math.random() < skillOverclockChance(state.player)) { // オーバークロック 20/25/30%(Lv)
      recordOverclockProc();
      return {};                                         // CDを設定しない=即再使用可(実質0)
    }
    const effReadyAt = mult !== 1 && delta > 0 ? state.gameTime + delta * mult : readyAt;
    return { player: { ...state.player, subWeaponCooldowns: { ...state.player.subWeaponCooldowns, [key]: effReadyAt } } };
  });
},
```

- **タイムキーパー**(`time-keeper`, 通常): `skillCooldownMult` = Lv1 ×0.9 / Lv2 ×0.8 / Lv3 ×0.7
  (`src/store/gameStore.ts:1111-1114`)。
- **オーバークロック**(`overclock`, 超レア): 発動(CD開始)の瞬間に Lv1 20% / Lv2 25% / Lv3 30% で
  CDを設定しない=**即0**(`src/store/gameStore.ts:1233-1238`, `1234-1238`)。
- **装備(EquipBonus.fireRateMult)はサブウェポンCDに一切効かない**。`fireRateMult` は銃の
  `cooldown`(連射間隔)にのみ乗算される(`src/utils/weaponUtils.ts` 各所 `weapon.cooldown ?? 1000)
  / (player.equipBonus?.fireRateMult ?? 1)` 形、例 `src/store/gameStore.ts:6366`)。**装備でサブCDは
  縮まない**(§Eに記載)。
- **例外ルート(合流点を通らない3つ)**: `dog`(独自倍率が先乗り)/ `sensor-mine`(チャージ制・手動で
  同じ2効果を再実装)/ `support-sniper`(専用タイマー・移動中のみ進行・手動で同じ2効果を再実装)。
  いずれも実装コメントに「合流点を通らないため手動で維持」と明記されている
  (`src/store/gameStore.ts:4105-4108`, `src/hooks/useGameLoop.ts:6391-6393`)。
- **完全に外側(タイムキーパー/オーバークロックが一切効かない)**: 刀/村雨(`katana`/`murasame`)の
  居合ダッシュと 鞭(`whip`)。これらは「サブCD」ではなく**カウンター窓/カウンターCDの使い回し**
  (`counterWindowEnd`/`counterCooldownEnd`)で動いており、`setSubWeaponCooldown` を通らない
  (`src/store/gameStore.ts:5894, 5903-5908`)。§Eに記載。

### A-1. 基礎CD一覧(レベル別・秒)

| サブウェポン | 基礎CD(Lv1/2/3) | CD経路 | 参照 |
|---|---|---|---|
| heavy-grenade(手榴弾) | 5.0 / 5.0 / 5.0(全Lv同一) | 合流点 | `useGameLoop.ts:289, 5891` |
| marksman-trap(トラップ) | 6.5 / 6.5 / 6.5(全Lv同一) | 合流点 | `useGameLoop.ts:295, 5924` |
| striker-quick-mag(クイックマガジン投擲) | 10.0 / 8.0 / 6.0 | 合流点 | `useGameLoop.ts:300, 5984-5987` |
| dog(ドッグ) | 0.9 / 0.76 / 0.62(フェッチ完了後の再出動まで) | 合流点+**先乗り**dog-run倍率 | `useGameLoop.ts:303, 6091-6094` |
| decoy(デコイ) | 10.0 / 10.0 / 10.0(全Lv同一) | 合流点 | `useGameLoop.ts:316, 6213` |
| shield(シールド) | 6.0 / 6.0 / 6.0(全Lv同一) | 合流点 | `useGameLoop.ts:338, 6276` |
| turret(タレット) | 10.0 / 10.0 / 10.0(全Lv同一) | 合流点 | `useGameLoop.ts:370, 6327` |
| fire-knife(火炎ナイフ) | 8.0 / 7.0 / 6.0 | 合流点 | `useGameLoop.ts:405, 6619` |
| molotov(火炎瓶・10秒サイクル制) | 10.0 / 10.0 / 10.0(本数Nのみ3/5/7でLv変化) | 合流点 | `molotov.ts:10-11`, `useGameLoop.ts:6351` |
| drone-boomerang(ブーメラン) | 5.0 / 5.0 / 5.0(全Lv同一) | 合流点 | `gameStore.ts:1730, 4101` |
| wire-anchor(ワイヤー・敵ヒット=スラム型) | 実質1.35(=SLAM 0.35+CD 1.0、全Lv同一) | 合流点 | `gameStore.ts:918-922, 6031` |
| wire-anchor(ワイヤー・空振り=プラント型) | 実質2.15(=待ち1.0+ダッシュ0.15+CD 1.0、全Lv同一) | 合流点 | `gameStore.ts:918-922, 6052` |
| homing(ホーミング弾) | 5.0 / 5.0 / 5.0(全Lv同一・ロック数のみLv変化) | 合流点 | `gameStore.ts:527, 6640` |
| shadow-clone(分身) | 3.0 / 2.0 / 1.0 | 合流点 | `gameStore.ts:753, 5007` |
| flare-gun(フレアガン) | 9.0 / 7.0 / 5.0 | 合流点 | `flareGun.ts:9`, `gameStore.ts:4161` |
| sensor-mine(センサー地雷・チャージ制) | 個別チャージ再充填10.0(全Lv同一)。同時設置上限=3/4/5(Lv) | 手動(合流点を**通らない**) | `sensorMine.ts:11-13`, `gameStore.ts:4111-4133` |
| support-sniper(援護射撃・専用タイマー) | 6.0 / 5.0 / 4.0(**移動中のみ**進行) | 手動(合流点を**通らない**) | `supportSniper.ts:7`, `useGameLoop.ts:6360-6406` |
| katana / murasame(刀・居合ダッシュ) | 実質0.82(=COUNTER_WINDOW 0.4+COUNTER_COOLDOWN 0.42、全Lv同一) | カウンター窓流用(**合流点の外**・スキル無効) | `gameStore.ts:803-804, 892, 5894` |
| whip(鞭・ハリケーン) | CD概念なし(ヒット数でチャージ→閾値到達で発動。カウンターCDへ+0.22s上乗せのみ) | カウンター窓流用(**合流点の外**・スキル無効) | `gameStore.ts:1001-1002, 4286-4291` |
| alchemy(錬金術・召喚) | CD概念なし(常駐召喚+個体ごとの攻撃間隔) | — | `gameStore.ts:94-98` 周辺 |
| shijin(四神舞) | CD概念なし(リズム/BPMベース) | — | `gameStore.ts:840-875`, `config/shijin.ts` |
| sage-stone(賢者の石) | CD概念なし(alchemy/whipへの倍率パッシブ。単体では発動しない) | — | `gameStore.ts:1032, 1166-1167` |
| striker-hunting(ハンティング・近接射程延長) | CD概念なし(静止でチャージ→huntingCharged) | — | `gameStore.ts:779-783` |
| first-aid-kit(救急鞄) | CD概念なし(1ラン1回×中身種類の使い切り) | — | `firstAidKit.ts:1-34` |
| junk-weapon(ジャンクウェポン) | CD概念なし(近接スイングと同時発射・弾薬=スクラップ消費で制限) | — | `useGameLoop.ts:4164-4167` |

### A-2. CDに乗る倍率の全経路まとめ

| 経路 | 種別 | 倍率/効果 | 重複可否 | 参照 |
|---|---|---|---|---|
| タイムキーパー(`time-keeper`) | スキル(通常) | ×0.9/0.8/0.7(Lv、残りΔに乗算) | 他と重複可(乗算) | `gameStore.ts:1111-1114` |
| オーバークロック(`overclock`) | スキル(超レア) | 発動時20/25/30%でCD即0(確率的) | タイムキーパーと重複可(先にオーバークロック抽選→外れた分だけタイムキーパー) | `gameStore.ts:1233-1238, 6579-6583` |
| ドッグラン(`dog-run`) | スキル(通常) | dogのみ: Lv1 CD×0.5 / Lv2-3 CD×0(=0秒)+Lv3は射程無限 | dog CDに**先乗り**、その後さらに合流点でタイムキーパー/オーバークロックが乗る(0×何でも0) | `useGameLoop.ts:6091-6094`, `gameStore.ts:1233-1238` |
| 装備(fireRateMult) | 装備(腕) | サブウェポンCDに**無関係**(銃の連射のみ) | — | 上記A-0参照 |

**MAX_EQUIPPED_SKILLS = 2**(`src/data/campaign.ts:786`)なので、この3経路のうち同時に効くのは
最大2つ(例: タイムキーパー+オーバークロック、またはドッグラン+オーバークロック等)。

### A-3. 理論上の最短CD(全部盛りの最良ケース)

前提: 2スキル枠=**タイムキーパーLv3(×0.7)** + **オーバークロックLv3(発動時30%で即0)**。
「確定床(deterministic floor)」= 基礎CD(最良Lv)×0.7。「絶対床(absolute floor)」=
オーバークロックが成立した回=0秒(確率的・平均して10回に3回)。

| サブウェポン | 確定床(タイムキーパーLv3) | 絶対床(オーバークロック成立時) |
|---|---|---|
| heavy-grenade | 3.5s | 0s(30%) |
| marksman-trap | 4.55s | 0s(30%) |
| striker-quick-mag | 4.2s(Lv3 6.0×0.7) | 0s(30%) |
| dog | **0s**(dog-runLv2/3が優先、タイムキーパー不要) | 0s(常時、Lv2以上) |
| decoy | 7.0s | 0s(30%) |
| shield | 4.2s | 0s(30%) |
| turret | 7.0s | 0s(30%) |
| fire-knife | 4.2s(Lv3 6.0×0.7) | 0s(30%) |
| molotov(サイクル) | 7.0s | 0s(30%) |
| drone-boomerang | 3.5s | 0s(30%) |
| wire-anchor(スラム型) | 0.945s | 0s(30%、ただしSLAM自体0.35sは不変) |
| wire-anchor(プラント型) | 1.505s | 待ち1.0+ダッシュ0.15は不変、CD分のみ0 |
| homing | 3.5s | 0s(30%) |
| shadow-clone | 0.7s(Lv3 1.0×0.7) | 0s(30%) |
| flare-gun | 3.5s(Lv3 5.0×0.7) | 0s(30%) |
| sensor-mine(1チャージ再充填) | 7.0s | 0s(30%、手動実装で同じ抽選) |
| support-sniper(移動中のみ) | 2.8s(Lv3 4.0×0.7)相当の移動時間 | 0s(30%、手動実装で同じ抽選) |
| katana/murasame(居合CD) | **0.82s(変化なし)** | **変化なし**(合流点の外・スキル無効) |
| whip(ハリケーン) | CD概念なし(チャージ制。カウンターCDのみ+0.22s、これもスキル無効) | — |

**重要**: 刀/村雨/鞭はどれだけスキルを積んでもCDが1ミリ秒も縮まない(合流点の外)。
「全サブウェポン共通でタイムキーパー/オーバークロックが効く」という前提でバランス調整すると、
この3つだけ効果が乗らず、体感の食い違いが出る(§E-1)。

---

## §B 移動速度台帳

### B-0. 実効速度の計算式

```ts
// src/store/gameStore.ts:3578-3579
: reloading ? player.speed * RELOAD_MOVE_SPEED_MULT * (skater&&riding?3:1) * skillRunnerSpeedMult(player,true)
    * marksmanSpeedMult(player, gameTime) * skillWarmUpSpeedMult(player, gameTime) * (equipBonus.moveSpeedMult ?? 1)
: player.speed * (skater&&riding?3:1) * skillRunnerSpeedMult(player) * marksmanSpeedMult(player, gameTime)
    * skillWarmUpSpeedMult(player, gameTime) * (equipBonus.moveSpeedMult ?? 1);
```

この値(px/s)に対し `movePlayer` 呼び出し側で `deltaTime * MOVE_SPEED_MULT` を掛けて実移動量にする
(`useGameLoop.ts:5456`)。`MOVE_SPEED_MULT = GAME_SPEED`(既定1.2・`?speed=`で0.2〜5に変更可能な
開発者ノブ。プレイヤー/敵**双方**に等しく効くので相対速度比は変えない・`config/gameSpeed.ts:10,14`)。

- `PLAYER_BASE_SPEED = 87`(`gameStore.ts:1754`)。`player.speed` はゲーム開始時にこの値で固定され、
  以後**変化しない**(旧レベルアップ「速度」パッシブだけが書き換えていたが、そのパッシブ自体が
  現在は生成されない=事実上の定数。§E-2参照)。
- `RELOAD_MOVE_SPEED_MULT = 1`(`gameStore.ts:1757`)。**定数1=リロード中の速度ペナルティは現状ゼロ**
  (掛けても何も変わらない)。旧仕様の名残でnoopになっている可能性(§E-4)。

### B-1. 倍率の全経路

| 経路 | 種別 | 値 | 条件 | 参照 |
|---|---|---|---|---|
| skater(スケーター) | スキル(超レア) | ×3(Lv不問・固定) | `skaterRiding`(ダブルタップで乗車)時のみ。Lvは慣性(操作性)のみ変化: `[PLAYER_INERTIA_TAU(0),1.2,0.8,0.5]` | `gameStore.ts:1092(hasSkill判定箇所は3578-3579), 3622-3624` |
| runner(ランナー) | スキル(通常) | +10%/+15%/+20%(Lv)。リロード中はさらに×1.10(Lv不問・固定・乗算) | 常時 | `gameStore.ts:1207-1213` |
| marksman(マークスマン) | キャラ固有パッシブ(mageクラス限定・スキル枠を消費しない) | ×1.2 | 2秒以上連続移動(`isMoving`かつ`marksmanMovingSince`から2000ms経過)。停止で即解除 | `gameStore.ts:1079-1083` |
| warm-up(ウォームアップ) | スキル(通常) | +10%(Lv不問・固定) | 出撃から60秒間のみ(`gameTime<60000`) | `gameStore.ts:1245-1253` |
| 装備(body/mobility) | 装備(体・機動系) | +10/+20/+30/+35/+40%(Tier1-5) | 常時(bodyスロット装備中) | `data/equipment.ts:58-64` |
| 装備(special-body・武将の鎧) | 装備(体・特殊) | +25%(固定・moveSpeedと同時にmaxHealth+120/killGrace+10%も付与) | 常時(特殊装備時。ただしtier5 mobilityの+40%より低いので速度単体では非最適) | `data/equipment.ts:103` |

`equipBonus.moveSpeedMult` は `1 + Σ moveSpeed系ステ値`(装備3点のうちbodyスロットのみが対象。
腕/アクセの系統に `moveSpeed` ステは存在しない)。合成式は `aggregateEquipBonus`
(`data/equipment.ts:166-187`)。

### B-2. 理論上の最高速・最低速

**最高速(2スキル枠=skater+runnerLv3、mageクラス、装備=body mobility Tier5、非リロード)**:

```
倍率 = 3(skater) × 1.20(runnerLv3) × 1.2(marksman) × 1.40(equip) = 6.048
速度 = 87 × 6.048 × 1.2(MOVE_SPEED_MULT) = 631.4 px/s
```

**最高速(同上+リロード中・runnerのリロード追加+10%が乗る)**:

```
倍率 = 3 × (1.20×1.10) × 1.2 × 1.40 = 6.6528
速度 = 87 × 6.6528 × 1.2 = 694.5 px/s
```

**最低速**: **プレイヤーを減速させる経路はコード上どこにも存在しない**
(`equipBonus.moveSpeedMult`は加算のみで負値ステが無い、`RELOAD_MOVE_SPEED_MULT`は定数1、
被弾/被スタン等プレイヤー自身を遅くする処理は見当たらない — 敵側の`bossSlowUntil`等は敵専用)。
よって理論上の最低速 = 何も積まない状態の素の実効速度と同じ:

```
速度(バフ0) = 87 × 1.2 = 104.4 px/s
```

「デバフ込みの最低速」を求められたが、**デバフ経路自体が存在しない**ことが今回の走査結果
(§E-7に記載)。

### B-3. 直近ボスバランスへの影響(社長方針が指す v0.25.2425〜2429)

DEVELOPMENT_LOG.md の実測値を基準に、上記の最高速倍率(非リロード6.048× / リロード中6.653×)を
そのまま線形にスケールした場合の余裕倍率:

| 比較対象 | 基準(バフ0=104.4px/s)での実測 | 最高速(631.4px/s)での換算 | 最高速+リロード(694.5px/s) |
|---|---|---|---|
| ハンター歩き(実効49.2px/s)との差 | +55.2px/s離れる(DEVELOPMENT_LOG v0.25.2429) | +582px/s離れる(約10.5倍) | +645px/s離れる(約11.7倍) |
| ハンターダッシュ(実効738px/s)との比 | プレイヤーは738の**14.1%**(約7.1倍遅い=意図通り「詰められる」) | プレイヤーは738の**85.5%**(ほぼ追いつく速度差) | プレイヤーは738の**94.1%**(ダッシュとほぼ同速) |
| 城ボス(giantbat)飛び掛かり回避余裕(標準stage、実測1.38倍・v0.25.2425) | 1.38倍(基準) | **8.35倍** | **9.18倍** |
| 同・stage-5(×1.30、実測1.09倍) | 1.09倍(基準) | **6.59倍** | **7.24倍** |

**読み**: v0.25.2429の設計意図は「歩きは逃げ切れる/ダッシュは詰められる(逃げ切れない)」という
非対称。最高速ビルド(skater+runnerLv3+mage+装備tier5)は素の状態でこの非対称をほぼ潰し、
**ダッシュにさえ94%まで追いつく**。城ボスの着地円回避(社長裁定で「1.38倍」に整えたばかりの値)は
最高速ビルドで**9倍以上の余裕**になり、着地円の脅威が実質消滅する。→ 今回の「CD/速度を見直したい」
という社長方針の裏付けとして具体的な数字。

---

## §C スキル全数表(35種)

出典: `src/data/campaign.ts:693-733`(SKILLS: 名前/短説明/レア度)、`:737-777`(SKILL_LEVEL_INFO:
Lv別具体値)。効果の実装箇所は個別に列挙(ファイル:行)。Lv配列は `[_, Lv1, Lv2, Lv3]` 形が多い
(index0はダミー)。

### 超レア・通常ガチャ枠(4。他に警察署専用の超レア3種が後述)
| キー | 名前 | 効果(Lv1/2/3) | 実装 |
|---|---|---|---|
| `reaper` | 死神 | 近接フィニッシュ時、範囲内の敵全員フィニッシュ(ボスは即死せず×5ダメージ)。Lv変化なし。ガチャ対象外=死神撃破で習得専用 | `gameStore.ts:2375-2408`(適用) / `2384`(hasSkill判定) / `campaign.ts:695,739` |
| `berserker` | バーサーカー | 失ったHP%×[1.0/1.25/1.5](Lv)ぶん全攻撃ダメージ増加。被ダメ+20%固定(knightと乗算) | `gameStore.ts:1090-1100` |
| `skater` | スケーター | 移動速度×3(Lv不問)。Lvは慣性(操作性)のみ変化 | `gameStore.ts:3578-3579,3622-3624` (§B参照) |
| `overclock` | オーバークロック | サブCD開始時に[20/25/30]%でCD即0 | `gameStore.ts:1233-1238` (§A参照) |

### レア(15)
| キー | 名前 | 効果(Lv1/2/3) | 実装 |
|---|---|---|---|
| `crit-up` | クリティカルダメージ上昇 | crit倍率+[0.5/0.75/1.0](baseに加算。敵ダメージ計算式のbaseへ) | `gameStore.ts:1101-1105` |
| `knight` | ナイト | 被ダメ×[0.8/0.7/0.6]・召喚/盾最大HP×[1.5/1.75/2.0] | `gameStore.ts:1089-1092,1106-1110` |
| `exploder` | エクスプローダー | 全爆発の半径/ダメージ×[1.2/1.35/1.5] | `gameStore.ts:1116-1120` |
| `sharpshooter` | シャープシューター | 銃弾貫通+[1/2/3](passthrough武器は対象外) | `weaponUtils.ts:357-360` |
| `sniper` | スナイパー | 銃ダメージ+停止敵ボーナス最大[50/75/100]%+距離ボーナス最大[50/75/100]%(SNIPER_REF_DIST=480の85%地点で頭打ち) | `gameStore.ts:1181-1200` |
| `ricochet` | 跳弾 | 命中弾が[20/30/40]%で近くの敵へ跳ねる(ダメージ×[0.5/0.6/0.7]・1バウンドのみ) | `useGameLoop.ts:7954-7984` |
| `bomber` | ボマー | 手榴弾等(グレネード/ホーミング/救急鞄/ボムカウンター爆発含む)の爆発でミニ手榴弾3個散布(Lv変化なし・固定ダメ14/半径39.6) | `bomberScatter.ts:1-33`, 呼び出し6箇所(`useGameLoop.ts:7139,7233,7330,7882,7927,9648`, `gameStore.ts:5179`) |
| `fire-shooter` | ファイアシューター | 発射の[20/25/30]%が爆発弾化(直撃ダメージ×0.3・半径66・裏CD3秒) | `weaponUtils.ts:308-316,364-367` |
| `bomb-counter` | ボムカウンター | 反射弾がランチャー弾化(半径×[1.0/1.15/1.3]・ダメージ×[1.0/1.25/1.5])**+カウンター成立の瞬間にプレイヤー中心でも同倍率の爆発**(短い説明文には後者が欠落・§E-3) | `combatTick.ts:343-355`(反射弾) / `useGameLoop.ts:9621-9649`(自爆発) |
| `punisher` | パニッシャー | ノックバック中の敵が他の敵に衝突すると巻き込み(近接ダメ×[0.5/0.7/0.9]・KB×[2/2.5/3]、1次のみ) | `gameStore.ts:8976-9002,9155-9160` |
| `combo-master` | コンボマスター | フィニッシュコンボ窓+[1.0/1.5/2.0]s・コンボ中全攻撃ダメージ+[2/3/4]%/comboで上限[50/60/70]% | `gameStore.ts:1152-1165` |
| `knife-master` | ナイフマスター | 近接コンボ+[2/2/4]%/hitで上限[40/50/60]%・近接クリ+[10/15/20]%。弾薬ドロップ0%(別経路で抑止) | `gameStore.ts:1131-1150,1168-1180` |
| `benkei` | 弁慶 | 武器切替でクリ率+[5/10/15]%、持続[10/12/15]s | `gameStore.ts:1121-1130` |
| `reflex` | 反射神経 | 被弾時、反撃爆発 ダメージ[60/80/100]・半径[92/104/116]・CD[1.0/0.8/0.6]s | `gameStore.ts:6170-6199` |
| `rescue-signal` | 救難信号 | 近接ヒット時[10/15/20]%で味方が援護攻撃(必中・倍率1)。発動中は再発動しない | `rescueSignal.ts:10`, `gameStore.ts:2339-2369` |

(注: `rescue-signal`はキー数としては上のレア枠だが、`SKILL_KEYS`の並びでは punisher/combo-master に
続くレア枠の最後に置かれている。実装上の扱いはレア。)

### 通常(13・`SkillRarity`='normal')
| キー | 名前 | 効果(Lv1/2/3) | 実装 |
|---|---|---|---|
| `gold-rush` | ゴールドラッシュ | ゴールド獲得+[20/35/50]%(リザルト・宿敵討伐・クエスト報酬。in-runスクラップは対象外) | `gameStore.ts:1215-1221` |
| `time-keeper` | タイムキーパー | サブCD×[0.9/0.8/0.7] | `gameStore.ts:1111-1114` (§A参照) |
| `ghost-shooter` | ゴーストシューター | [10/20/30]%で弾を消費しない | `weaponUtils.ts:374-376` |
| `dog-run` | ドッグラン | dogのCD×[0.5/0/0]・Lv3で射程制限解除(無限) | `useGameLoop.ts:6091-6099` (§A参照) |
| `counter-master` | カウンターマスター | **v2(v0.25.2450・CD_REWORK.md確定2)**: カウンター成立時のみ近接/カウンター共用CD(counterCooldownEnd)の残りを[40/70/100]%リファンド・成立時ノックバック×[2/2.5/3]は従来どおり(旧: 窓+[0.12/0.18/0.25]s=廃止・窓は全員COUNTER_WINDOW固定) | `utils/counterMaster.ts`, `gameStore.ts`(KB) |
| `slasher` | スラッシャー | 近接命中後リングのジャストタップで追撃、最大[1/2/3]連(各2/3減衰) | `gameStore.ts:2435-2480`(概要) |
| `attack-shooter` | アタックシューター | 銃ダメージ+[10/20/30]% | `gameStore.ts:1202-1206` |
| `runner` | ランナー | 移動速度+[10/15/20]%。リロード中さらに×1.10(Lv不問) | `gameStore.ts:1207-1213` (§B参照) |
| `seeker` | シーカー | 被弾時[30/40/50]%で3秒半透明化(通常敵から狙われない)・CD10秒 | `gameStore.ts:1258-1266` |
| `scrap-builder` | スクラップビルダー | 初期スクラップ+[50/100/150]・取得量+[10/20/30]% | `gameStore.ts:1222-1227` |
| `magnet` | マグネット | 弾薬ピックアップの拾得範囲×[1.1/1.2/1.3](弾薬以外は対象外) | `gameStore.ts:1228-1232` |
| `last-magazine` | ラストマガジン | 弾倉最後の1発のダメージ×[2.0/2.5/3.0] | `gameStore.ts:1239-1244` |
| `warm-up` | ウォームアップ | 出撃60秒間: 速度+10%・リロード×0.80・クリ+20%(Lv変化なし) | `gameStore.ts:1245-1257` (§B参照) |

### 警察署アリーナ専用(3・`SkillRarity`='super'・ガチャ対象外=`GACHA_EXCLUDED_SKILLS`)
| キー | 名前 | 効果 | 実装 |
|---|---|---|---|
| `poi-bombing` | 爆撃 | 3秒に1度、近くの敵にグレネードランチャーを自動発射(Lv変化なし) | `useGameLoop.ts:3039以降` |
| `poi-guard` | 防衛 | プレイヤー周囲を常時周回するブーメラン。触れた敵弾も相殺(Lv変化なし) | `useGameLoop.ts:3069以降,7420-7423` |
| `poi-thrall` | 使役 | 倒した敵の20%を仲間ゾンビとして復活(最大1体・死ぬまで追従、Lv変化なし) | `gameStore.ts:7056以降` |

`GACHA_EXCLUDED_SKILLS = ['reaper', 'poi-bombing', 'poi-guard', 'poi-thrall']`
(`campaign.ts:862`)。`MAX_EQUIPPED_SKILLS = 2`(`campaign.ts:786`)。

---

## §D 装備全数表(33件)

出典: `src/data/equipment.ts:20-127`。3部位(体/腕/アクセ)×2系統×5段階(通常30件) + 特殊3件。

### 体(body)
| 系統 | Tier1 | Tier2 | Tier3 | Tier4 | Tier5 |
|---|---|---|---|---|---|
| protection(防護系) | maxHealth+50 | +90 | +130・killGrace+10% | +170・killGrace+15% | +210・killGrace+20% |
| mobility(機動系) | moveSpeed+10% | +20% | +30%・killGrace+10% | +35%・killGrace+15% | +40%・killGrace+20% |
| special(武将の鎧) | maxHealth+120・killGrace+10%・moveSpeed+25%(3ステ・出現率5%・レア度非依存) | | | | |

### 腕(arms)
| 系統 | Tier1 | Tier2 | Tier3 | Tier4 | Tier5 |
|---|---|---|---|---|---|
| firepower(火力系) | damage+20% | +40% | +60%・fireRate+5% | +80%・fireRate+5% | +100%・fireRate+10% |
| handling(取り回し系) | reload-10% | -20% | -30%・fireRate+5% | -40%・fireRate+5% | -50%・fireRate+10% |
| special(武将の小手) | damage+50%・fireRate+6%・reload-25%(3ステ) | | | | |

### アクセ(accessory)
| 系統 | Tier1 | Tier2 | Tier3 | Tier4 | Tier5 |
|---|---|---|---|---|---|
| crit(クリ系) | critChance+3% | +6% | +9%・scrap+20% | +12%・scrap+30% | +15%・scrap+40% |
| ammo(弾薬系) | ammoDrop+10% | +15% | +20%・scrap+20% | +25%・scrap+30% | +30%・scrap+40% |
| special(武将の兜) | critChance+8%・scrap+25%・ammoDrop+22%(3ステ) | | | | |

### 集計式(合成)
`aggregateEquipBonus`(`equipment.ts:166-187`): 装備3点(body/arms/accessory)の該当ステを走査し、

- `moveSpeed` → `moveSpeedMult += value`(加算・初期1)
- `killGrace` → `killGraceMult += value`(加算・初期1)
- `damage` → `damageMult += value`(加算・初期1)
- `fireRate` → `fireRateMult += value`(加算・初期1、**銃の連射のみ**。サブCDには不関与=§A)
- `reload` → `reloadMult *= (1 - value)`(**乗算**・他5項目と合成方式が違う)
- `critChance` → `critBonus += value`(加算・初期0)
- `ammoDrop` → `ammoDropBonus += value`(加算・初期0)
- `scrap` → `scrapBonus += value`(加算・初期0)
- `maxHealth` → 別経路(`equipMaxHealthOf`)で `player.maxHealth` へ直接ベイク加算

`rollEquipment`(`equipment.ts:140-150`): 指定Tierの通常装備を系統ランダムで1件、**5%の確率**
(`SPECIAL_EQUIP_CHANCE=0.05`)で特殊装備に差し替え。`equipDefOnPlayer`(`gameStore.ts:661-675`)が
実際にプレイヤーへ装着し、`equipBonus`を再集計・`maxHealth`をベイクする。

`hasFullWarlordSet`(3特殊フル装備)は**見た目(立ち絵/スプライト切替)のみ**でステータス追加は無い
(`equipment.ts:226-227`, 参照元は`pixiScene.ts`の描画切替のみ)。

---

## §E 気づき(重複疑い・片方向・デッドコード疑い。修正はしていない)

### E-1. 刀/村雨/鞭はタイムキーパー・オーバークロックが一切効かない(合流点の外)
`katana`/`murasame`の居合ダッシュCD(`KATANA_DASH_COOLDOWN_MS = COUNTER_WINDOW + COUNTER_COOLDOWN
= 820ms`)と `whip` のカウンターCD延長(+`WHIP_COOLDOWN_EXTRA_MS`)は、`player.counterCooldownEnd`
を直接書き換える経路(`gameStore.ts:5894-5908, 4286-4291`)であり、他の24種が通る
`setSubWeaponCooldown`(タイムキーパー/オーバークロックの合流点)を一切通らない。
社長が「CDを全面的に見直したい」場合、**この3つだけ効果が乗らない**ことを踏まえないと、
バランス調整の意図が実装に反映されない。

### E-2. 【最重要】旧「レベルアップ直接パッシブ強化」12種が完全にデッドコード化している
`generateEquipmentChoices`(`src/utils/upgradeUtils.ts:52-109`)がレベルアップ時の唯一の選択肢
生成関数であり、`type: 'passive'` の選択肢は**もう1つも生成しない**(コメントで明言:
「旧『直接パッシブ強化』報酬…は確定版で全面廃止し、上の装備3選択肢へ置換した」
`upgradeUtils.ts:111-113`)。ところが `gameStore.ts:6460-6536` には旧12種
(`PassiveType = maxHealth/speed/might/area/cooldown/duration/magSize/reloadSpeed/critChance/
stunDuration/ammoDrop/scrapGain`)を処理する巨大な switch 文が**そのまま残置**されており、
到達不能(unreachable)。結果として:

- **`player.speed`** はゲーム開始時の `PLAYER_BASE_SPEED=87` から**一度も変化しない**
  (唯一の書き換え箇所が`case 'speed': updatedPlayer.speed = Math.round(updatedPlayer.speed*1.10)`
  という到達不能コード。§Bで「player.speedは事実上の定数」と記載した根拠)。
- **`player.reloadMult`** は初期値1のまま永久固定(`gameStore.ts:3277,12021`)。
  `weaponUtils.ts:180` のリロード時間計算式に今も乗算されているが、常に×1のno-op。
- **`player.critChance`**(直接クリ率)は初期値0のまま永久固定(`gameStore.ts:3270`)。
  `weaponUtils.ts:337`のクリ率合成式に今も加算されているが、常に+0のno-op。
- **`player.stunDurationMult`**(初期1)・**`player.ammoDropBonus`**(初期0)・
  **`player.scrapMult`**(初期1)・**`player.magBonus`**(初期0)も同様に永久固定。
  それぞれ気絶時間計算(`gameStore.ts:4596,4923`, `useGameLoop.ts:8028`)、弾薬ドロップ率計算
  (`gameStore.ts:2259`, `useGameLoop.ts:8121`)、スクラップ獲得計算(`gameStore.ts:9862`)、
  マガジン容量計算(`weaponUtils.ts:168`)に**現在も読まれ続けている**が、増減させる手段が無い。

これは「バグ」ではなく意図的な仕様移行(装備3択への統一)の結果だが、**switch文とPlayer型の
フィールド/コメントが「今も生きている機能」であるかのように見える**ため、CD/速度の見直しに
際して「レベルアップでリロード速度を伸ばす」のような旧仕様を前提にした調整案を出すと
実際には何も起きない。次に触るなら「本当に死んでいるか」を確認してから、
`PassiveType`/switch文ごと削除するか(要社長裁定)を検討する価値がある。

### E-3. `bomb-counter` の短い説明文(SKILLS.desc)に自爆発の記載が欠落
ガチャ結果/装備UIの短い説明(`campaign.ts:708`)は「カウンターの反射弾が爆発する」のみだが、
詳細Lv別説明(`campaign.ts:752`、`skillDescForLevel`が実際にゲーム内で表示する文言)は
「反射弾が爆発＋成立時に自分中心でも爆発」と自爆発を明記しており、実装
(`useGameLoop.ts:9621-9649`)もその通り動いている。**実装とLv別説明は一致**しているが、
短い説明(`SKILLS['bomb-counter'].desc`)だけが古いまま。表示箇所によって伝わる情報量が
異なる(バグではなく表記の不整合)。

### E-4. `RELOAD_MOVE_SPEED_MULT = 1` は事実上のno-op定数
`gameStore.ts:1757`で `const RELOAD_MOVE_SPEED_MULT = 1;` と固定されており、移動速度式
(`gameStore.ts:3578`)に乗算されているが1なので何もしない。命名からして「リロード中は遅くなる」
という旧仕様の名残と推測されるが、現状は**リロード中の移動速度ペナルティは存在しない**
(§B-0参照)。E-2のPassive系と同様、「触れば効くはずの値」に見えて実際は不変。

### E-5. 装備の`fireRate`(連射)ステはサブウェポンには一切影響しない
装備アクセ/腕の`fireRate`ステは銃の`weapon.cooldown`にのみ効き(`weaponUtils.ts`各所)、
サブウェポンのCD(`subWeaponCooldowns`)には一切参照されない。§A-0/A-2に既述の通り、
「装備でサブCDが縮む」という誤解が起きやすい設計(名前がどちらも「クールダウン系」に見える)
なので、CD見直しの際に混同しないよう明記した。

### E-6. `sensor-mine`・`support-sniper`は「合流点を通らない」代わりに手動で同じ2効果を再実装済み
バグではなく確認事項として記載: この2つは専用のCD/チャージ管理を持つため
`setSubWeaponCooldown`を通らないが、実装コメント通りタイムキーパー(`skillCooldownMult`)と
オーバークロック(`skillOverclockChance`+`recordOverclockProc`)を**手動で個別に呼んでおり**、
挙動としては他の合流点ルートと同じ2効果が乗る(`gameStore.ts:4120-4121`,
`useGameLoop.ts:6394-6402`)。実装漏れではないことを確認した。

### E-7. プレイヤーを減速させる経路がコード上どこにも無い
§B-2の通り、`equipBonus.moveSpeedMult`は加算のみ(負値ステ無し)、スキルの移動速度系は
全て増加方向、`RELOAD_MOVE_SPEED_MULT`は定数1、敵由来のスロー効果(`bossSlowUntil`等)は
**敵専用**でプレイヤーには適用されない。デバフ経路の追加が今後の見直し候補に入るなら、
「ゼロから設計する」ことになる(既存のデバフを弱める/強めるのではない)。

---

## 参考(走査で辿ったファイル一覧)
- `src/types/game.ts`(SkillKey/SubWeaponKey/PassiveType/Player/EquipBonus型)
- `src/store/gameStore.ts`(スキル効果ヘルパ・CD合流点・装備適用・レベルアップswitch)
- `src/hooks/useGameLoop.ts`(サブウェポン発動配線・CD定数群)
- `src/data/equipment.ts`(装備定義・集計)
- `src/data/campaign.ts`(SKILLS/SKILL_LEVEL_INFO/SKILL_KEYS/ガチャ)
- `src/utils/upgradeUtils.ts`(レベルアップ選択肢生成=装備3択のみ)
- `src/utils/rescueSignal.ts` / `sensorMine.ts` / `supportSniper.ts` / `flareGun.ts` /
  `molotov.ts` / `bomberScatter.ts` / `weaponUtils.ts` / `combatTick.ts`
- `DEVELOPMENT_LOG.md`(v0.25.2425, v0.25.2427, v0.25.2429 — ボスバランス実測値)
