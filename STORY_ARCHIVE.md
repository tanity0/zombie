# 資料室 全レコード正本(実装からの逆転記)

> **この文書は設計時の姿です。現行仕様の正はコード+DEVELOPMENT_LOG。案件の状態は PROJECT_STATUS.md を見る。**

本ファイルは実装コード(社長承認済み文言)からの逆転記(v0.25.2172)。以後この文面が正。
元はリポ外の統合正本(共有パッケージ2026-07-23「the ONE 資料室全件実装」)。

**転記の原則(社長指示・厳守)**:
- 実装済みコードに存在する社長承認済みの文言だけを逆転記する。文言の新規作成・要約・言い換え・補完は一切しない。
- 未実装の文言・仮文言・フォールバック文言は正史として転記しない。
- 既存正本(STORY_M0_M3.md / OPENING_REVIVAL_SPEC.md / STORY_UI_SPEC.md)と衝突する記述があっても、
  このファイルはそれらを上書き・統合しない。相違点は本チャットの最終報告に列挙する。
- 各節の直下に「転記元」行(実装ファイル名・データID)を付す。

解放条件の種類(`src/data/storyArchive.ts` の実装に基づく):
- **初期解放**: `INITIAL_RECORD_IDS` に含まれ、ゲーム開始時点から資料室に格納されている。
- **ミッションクリア解放**: 該当 `ArchiveRecord.unlockStageId` の値のステージ(`src/data/campaign.ts`
  `StageMission.unlockedRecordIds`)をクリアすると解放される。
- **通常エンディング後解放**: `ENDING_RECORD_IDS` に含まれ、通常エンディング視聴後(`endingSeen`)に解放される。
- **条件付き解放**: 「グレンの薬」のみ、M7クリア+任意サブ3本完了+通常エンディング視聴後
  (`endingSeen && medicineOwned`)に `backfillStoryArchive` 経由で解放される(いずれのミッションの
  `unlockedRecordIds` にも載らない)。

---

## mission-military-regen-plan「軍再生医療計画」

- category: mission / sortOrder: 41
- 解放条件: stage-2(M2)クリア

軍が主導していた再生医療研究の計画名。負傷兵の欠損治療を目的に発足したとされる。
この研究所は計画の中枢拠点のひとつだったことが、回収データから確認された。

**転記元**: `src/data/storyArchive.ts` `ARCHIVE_RECORDS['mission-military-regen-plan']`

---

## mission-phill-plan-record「PHILL計画記録」

- category: mission / sortOrder: 42
- 解放条件: stage-2(M2)クリア

支給装備「PHILLガン」の開発計画記録。感染発生より以前から、この研究所で運用されていた形跡がある。
通常火器が通用しない個体への対抗手段として設計された可能性が高い。
詳細な仕様・命名の由来は別の記録に分かれている(現時点では未回収)。

**転記元**: `src/data/storyArchive.ts` `ARCHIVE_RECORDS['mission-phill-plan-record']`

---

## mission-abnormal-growth-data「異常増殖データ」

- category: mission / sortOrder: 43
- 解放条件: stage-2(M2)クリア

壊滅直前まで記録され続けていた細胞増殖の観測データ。
通常の治療で説明できる範囲を大きく超えた数値が、末尾に残されている。
記録はそこで途切れている。

**転記元**: `src/data/storyArchive.ts` `ARCHIVE_RECORDS['mission-abnormal-growth-data']`

---

## mission-remote-lab-comm-log「東部医療科学センターとの通信履歴」

- category: mission / sortOrder: 50
- emphasis: `グレアム・ケスラー` / `ノラ・ソレル` / `試験記録は削除`
- 解放条件: stage-2(M2)クリア

PHILL再生医療研究所は、東部医療科学センターと正常な再生速度、投与量、停止値に関するデータを共有していた。
共同研究の責任者として、グレアム・ケスラーとノラ・ソレルの名が記録されている。
事故直前、研究所から異常値に関する照会が送られていたが、添付された試験記録は削除されている。

**転記元**: `src/data/storyArchive.ts` `ARCHIVE_RECORDS['mission-remote-lab-comm-log']`

---

## mission-glen-medicine「グレンの薬」

- category: mission / sortOrder: 180
- emphasis: `ミラから託された` / `特定の対象` / `効果不明`
- 解放条件: 条件付き解放(M7クリア+任意サブ3本完了+通常エンディング視聴後。いずれのミッションの
  unlockedRecordIdsにも載らない)

ミラから託された未登録薬剤。
グレンが基礎処方と最終調合を行い、ミラが分析、投与設計、安定化、検証を担当した。
変異体を治療するためのものなのか。特定の対象に合わせて調整された形跡があるが、現状は効果不明。

**転記元**: `src/data/storyArchive.ts` `ARCHIVE_RECORDS['mission-glen-medicine']`

---

## investigation_01_outbreak「災害発生状況」

- category: world / sortOrder: 10
- emphasis: `再生医療研究施設` / `感染の起点は特定できていない`
- 解放条件: 初期解放(`INITIAL_RECORD_IDS`)

最初の集団発生は、森林地下にある再生医療研究施設の周辺で確認された。
曝露者は症状が現れる前に移動し、避難・医療・輸送経路を通じて感染を拡大させた。発生から短期間で国境を越え、現在も世界各地で被害が続いている。
軍は研究施設を初発地点とみているが、事故の詳細と感染の起点は特定できていない。

**転記元**: `src/data/storyArchive.ts` `ARCHIVE_RECORDS['investigation_01_outbreak']`

---

## investigation_02_symptoms「感染者の症状」

- category: world / sortOrder: 20
- emphasis: `血液または体液` / `有効な治療法も確立していない`
- 解放条件: 初期解放(`INITIAL_RECORD_IDS`)

感染は、変異体の血液または体液への曝露によって成立すると考えられている。特に創傷部や粘膜へ接触した例で発症が多い。
多くは24時間以内に発熱、全身痛、痙攣、意識混濁へ進む。高濃度の体液に曝露した場合、数時間で急変する例も確認された。
既存の鎮静・麻酔は十分な効果を示さず、有効な治療法も確立していない。

**転記元**: `src/data/storyArchive.ts` `ARCHIVE_RECORDS['investigation_02_symptoms']`

---

## investigation_03_morphology「異形化の傾向」

- category: mutant / sortOrder: 30
- emphasis: `形態変化` / `本能、記憶、自己像`
- 解放条件: stage-1(M1)クリア

変異体は発症後も、進化とも退化とも呼べない形態変化を続けている。
変化には、取り込んだ生体材料だけでなく、元の個体が持つ本能、記憶、自己像が影響している可能性がある。
神や天使、獣、武人を思わせる個体も確認されているが、形態変化の原理は解明されていない。

**転記元**: `src/data/storyArchive.ts` `ARCHIVE_RECORDS['investigation_03_morphology']`

---

## investigation_04_phill_public「PHILL再生医療計画」

- category: term / sortOrder: 40
- emphasis: `人体への適用にも成功` / `細胞増殖値が安全域を超えた`
- 解放条件: stage-2(M2)クリア

初発地点の施設では、重傷者の救命を目的とした再生医療計画「PHILL」が進められていた。
損傷した組織や臓器を急速に再構築する技術で、人体への適用にも成功。軍の医療技術として正式採用されていた。
一方、事故直前の記録には、細胞増殖値が安全域を超えた痕跡が残る。重要な試験記録の一部は削除されており、集団発生との関係は確認できない。

**転記元**: `src/data/storyArchive.ts` `ARCHIVE_RECORDS['investigation_04_phill_public']`

---

## investigation_06_suppressant「異常増殖抑制用試薬」

- category: item / sortOrder: 60
- emphasis: `一時的に低下` / `起点を除去できたとは判断できない`
- 解放条件: stage-3(M3)クリア

PHILL再生医療研究所から回収された未完成の試薬。異常な増殖を示す組織へ選択的に作用するよう設計されている。
体液へ曝露した衛生兵へ緊急投与した結果、発熱、痙攣、異常値は一時的に低下した。
変異組織の活動を抑える効果は確認できたが、感染の成立や異常再構築の起点を除去できたとは判断できない。

**転記元**: `src/data/storyArchive.ts` `ARCHIVE_RECORDS['investigation_06_suppressant']`

---

## investigation_07_living_mutation「生存状態からの変異」

- category: mutant / sortOrder: 70
- emphasis: `生存したまま変異` / `蘇った死者ではない`
- 解放条件: stage-4(M4)クリア

北部封鎖区域で、治療中の衛生兵が心停止や死亡を経ず、生存したまま変異した。
変異体は蘇った死者ではない。生きた人間の細胞増殖、分化、組織の配置、停止制御が崩れ、身体の再構築が続いている。
抑制剤は進行を遅らせたが、根治には至らなかった。末期個体を正常化する手段は、現在も確認されていない。

**転記元**: `src/data/storyArchive.ts` `ARCHIVE_RECORDS['investigation_07_living_mutation']`

---

## investigation_08_affective_behavior「特殊個体の行動変化」

- category: mutant / sortOrder: 80
- emphasis: `進路を変更` / `怒り、あるいは防衛反応`
- 解放条件: stage-5(M5)クリア

対変異体防衛本部の戦闘中、別方向で交戦していた特殊個体が、多数の変異体の死後に進路を変更した。
個体は他の標的を無視し、変異体を排除していた主人公部隊へ向かった。
単純な反射だけでは説明しにくい。研究班は、同種の喪失に対する怒り、あるいは防衛反応の可能性を挙げている。ただし、人間の意識が残っているとは断定できない。

**転記元**: `src/data/storyArchive.ts` `ARCHIVE_RECORDS['investigation_08_affective_behavior']`

---

## investigation_09_mansion_facility「旧市街地・洋館設備調査」

- category: mission / sortOrder: 90
- emphasis: `一人分` / `維持対象は確認できなかった` / `主電源が失われた`
- 解放条件: stage-6(M6)クリア

旧市街地の洋館内部から、PHILL再生医療研究所と同系統の研究設備が発見された。
地下には、一人分の冷却、灌流、自動投与、状態監視を行う施錠区画が存在する。扉は開放できず、維持対象は確認できなかった。
戦闘と撤退の過程で主電源が失われた。非常電源だけでは、冷却と灌流を正常な状態で維持できない。

**転記元**: `src/data/storyArchive.ts` `ARCHIVE_RECORDS['investigation_09_mansion_facility']`

---

## investigation_10_public_history「PHILL計画・設立記録」

- category: mission / sortOrder: 100
- emphasis: `フィル・ケスラー` / `戦争で失われる命を救う` / `現場責任者`
- 解放条件: 通常エンディング後解放(`ENDING_RECORD_IDS`)

PHILL計画は、フィル・ケスラー、グレアム・ケスラー、ノラ・ソレルによる再生医療研究から始まった。
三人は戦争で失われる命を救うことを目的とし、人体治験にも成功。技術は軍の医療へ正式採用された。
フィルは研究者であると同時に現場責任者を務め、戦地で負傷者への再生処置を行っていた。

**転記元**: `src/data/storyArchive.ts` `ARCHIVE_RECORDS['investigation_10_public_history']`

---

## investigation_11_phil_injury「フィル・ケスラー負傷記録」

- category: mission / sortOrder: 110
- emphasis: `爆撃` / `運用限界を超える処置` / `停止しない異常組織`
- 解放条件: 通常エンディング後解放(`ENDING_RECORD_IDS`)

フィル・ケスラーは戦地で爆撃を受け、四肢と複数臓器を含む広範囲の損傷を負った。
当時のPHILL技術では、損傷した全身を正常に再構築できなかった。
グレアムは救命のため、承認された投与量と運用限界を超える処置を実施。再構築は始まったが、細胞増殖が制御限界を越え、停止しない異常組織が発生した。

**転記元**: `src/data/storyArchive.ts` `ARCHIVE_RECORDS['investigation_11_phil_injury']`

---

## investigation_12_graham_experiment「規定値超過実験」

- category: mission / sortOrder: 120
- emphasis: `自分の身体` / `異常細胞はグレアムに蓄積` / `危険を理解したうえで`
- 解放条件: 通常エンディング後解放(`ENDING_RECORD_IDS`)

フィルの回復が止まると、グレアムは自分の身体へフィル由来の細胞を移植した。
正常な人体内で安定した細胞を選び、フィルへ戻すことが目的だった。処置を重ねるほどフィルの安定細胞は増えたが、選別から外れた異常細胞はグレアムに蓄積した。
ノラは細胞解析、投与量設計、抑制処置、安定細胞の採取を担当し、危険を理解したうえで実験を継続していた。

**転記元**: `src/data/storyArchive.ts` `ARCHIVE_RECORDS['investigation_12_graham_experiment']`

---

## investigation_13_outbreak_origin「研究所感染の起点」

- category: mission / sortOrder: 130
- emphasis: `事故以前から` / `秘密実験が原因` / `実験を続けた`
- 解放条件: 通常エンディング後解放(`ENDING_RECORD_IDS`)

グレアムの体内に蓄積した異常細胞は、研究所事故以前から血液と体液を介した曝露リスクを生じさせていた。
非正規区画に残った血液、汚染器具、処置廃棄物を通じて研究員が曝露。潜伏期間中に施設外へ移動した者もいた。
グレアムとノラは秘密実験が原因だと認識したが、通報による研究停止を避け、フィルと必要機材を洋館へ移して実験を続けた。

**転記元**: `src/data/storyArchive.ts` `ARCHIVE_RECORDS['investigation_13_outbreak_origin']`

---

## investigation_14_protagonist_trial「PHILL適合成功例」

- category: mission / sortOrder: 140
- emphasis: `四名` / `PHILLの適合成功例` / `抗体` / `耐性`
- 解放条件: 通常エンディング後解放(`ENDING_RECORD_IDS`)

主人公部隊の四名は、アウトブレイク以前に死亡し、PHILLの臨床試験対象として再生処置を受けていた。
損傷が比較的少なく、死亡後の経過も短かったため、身体、神経、記憶を維持した状態で増殖を停止できた。
四名はPHILLの適合成功例であり、軍が「抗体」または「耐性」と呼んでいた性質は、再生処置後に残った変異への抵抗性を指す。

**転記元**: `src/data/storyArchive.ts` `ARCHIVE_RECORDS['investigation_14_protagonist_trial']`

---

## investigation_15_phil_maintenance「洋館維持対象記録」

- category: mission / sortOrder: 150
- emphasis: `フィル・ケスラー` / `人間に近い状態` / `状態が後退`
- 解放条件: 通常エンディング後解放(`ENDING_RECORD_IDS`)

洋館地下の維持対象はフィル・ケスラーだった。
安定細胞を戻し続けた結果、身体形状、臓器機能、循環、神経反応は人間に近い状態まで回復していた。ただし、異常細胞は完全には除去されていない。
状態は冷却、灌流、抑制剤、自動監視に依存していた。M6の電源喪失後、残存する異常細胞が再び優勢となり、想定を超える速度で状態が後退した。

**転記元**: `src/data/storyArchive.ts` `ARCHIVE_RECORDS['investigation_15_phil_maintenance']`

---

## investigation_16_trial_formulation「未登録試作製剤」

- category: item / sortOrder: 160
- emphasis: `増殖力と再構築能力を弱める` / `完全に消す薬ではない` / `未確認`
- 解放条件: stage-7(M7)クリア

ノラから回収した未登録の試作製剤。グレアムの抑制処置を基礎に、異常細胞の増殖力と再構築能力を弱めるよう調整されている。
異常細胞を完全に消す薬ではない。正常組織を優勢に戻し、再構築を制御できる状態へ近づけることを目的としている。
成分、有効性、安全性、再現性は未確認。研究部門による検証が続いている。

**転記元**: `src/data/storyArchive.ts` `ARCHIVE_RECORDS['investigation_16_trial_formulation']`

---

## investigation_17_contact_reason「グレン／ミラ接触記録」

- category: mission / sortOrder: 170
- emphasis: `PHILLの適合成功例` / `完全変異したグレアム` / `関係を保つ`
- 解放条件: 通常エンディング後解放(`ENDING_RECORD_IDS`)

グレアムとノラは、主人公部隊がPHILLの適合成功例であることを知っていた。
二人が戦場で接触を重ねたのは、主人公たちを秘密から遠ざけるためではない。完全変異したグレアムへ対抗できる力と、最後の依頼を託せる相手かを確かめるためだった。
小さな依頼と報酬のやり取りは、正体を明かさず関係を保つための口実でもあった。

**転記元**: `src/data/storyArchive.ts` `ARCHIVE_RECORDS['investigation_17_contact_reason']`

---

## 解放条件の定数(参考・転記元のみ)

- `INITIAL_RECORD_IDS = ['investigation_01_outbreak', 'investigation_02_symptoms']`
- `ENDING_RECORD_IDS = ['investigation_10_public_history', 'investigation_11_phil_injury',
  'investigation_12_graham_experiment', 'investigation_13_outbreak_origin',
  'investigation_14_protagonist_trial', 'investigation_15_phil_maintenance',
  'investigation_17_contact_reason']`

**転記元**: `src/data/storyArchive.ts` `INITIAL_RECORD_IDS` / `ENDING_RECORD_IDS`
