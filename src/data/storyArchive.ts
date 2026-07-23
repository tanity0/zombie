// ストーリー情報UI 第1弾(PACING_PUZZLE.md §6.17 バッチM40)の資料台帳+永続状態。
// 仕様の正 = STORY_UI_SPEC.md(7章のデータ型/6章の任務記録/9章の再プレイ挙動)。
// このファイルは「資料室UI本体(閲覧画面)」は持たない(M41でやる)。ここは:
//   1. ArchiveRecord の台帳(現状はM2の任務記録4件のみ。他ステージ/カテゴリは後続バッチで追加)
//   2. StoryArchiveState の localStorage 永続(load/save/unlockRecordsForStage/markRecordRead)
// を提供する純関数群。gameStore を経由しない(heartbeat/chronicleと同じ「必要時に1回読む」方針)。

// 'world'=調査記録(共有パッケージ2026-07-23「the ONE 資料室全件実装」で追加)。
export type ArchiveCategory = 'world' | 'mutant' | 'weapon' | 'item' | 'term' | 'mission';

export interface ArchiveRecord {
  id: string;
  category: ArchiveCategory;
  title: string;
  body: string[]; // 2〜4短文程度。共有パッケージ2026-07-23で全件確定文面へ更新。
  unlockStageId?: string;
  // 共有パッケージ2026-07-23で追加: 資料室の一覧表示順(小さいほど上)。未指定=末尾(既存順維持)。
  sortOrder?: number;
  // 強調語(太字+琥珀で表示)。「色だけに依存せず、通常文字でも意味が通るように」(パッケージ実装原則)。
  emphasis?: string[];
}

// 資料台帳。既存5件(M40/M41)+共有パッケージ2026-07-23「the ONE 資料室全件実装」の全レコード。
// パッケージの実装原則: 同内容の資料が既存IDで存在する場合はIDを維持し本文/解放条件だけ更新
// (mission-remote-lab-comm-log=investigation_05 / mission-glen-medicine=mission_record_glenn_medicine)。
// M1〜M7は開発用番号(campaignのStageMission.code)=プレイヤー向け本文には出さない。
export const ARCHIVE_RECORDS: ArchiveRecord[] = [
  {
    id: 'mission-military-regen-plan',
    category: 'mission',
    title: '軍再生医療計画',
    body: [
      '軍が主導していた再生医療研究の計画名。負傷兵の欠損治療を目的に発足したとされる。',
      'この研究所は計画の中枢拠点のひとつだったことが、回収データから確認された。',
    ],
    unlockStageId: 'stage-2',
    sortOrder: 41,
  },
  {
    id: 'mission-phill-plan-record',
    category: 'mission',
    title: 'PHILL計画記録',
    body: [
      '支給装備「PHILLガン」の開発計画記録。感染発生より以前から、この研究所で運用されていた形跡がある。',
      '通常火器が通用しない個体への対抗手段として設計された可能性が高い。',
      '詳細な仕様・命名の由来は別の記録に分かれている(現時点では未回収)。',
    ],
    unlockStageId: 'stage-2',
    sortOrder: 42,
  },
  {
    id: 'mission-abnormal-growth-data',
    category: 'mission',
    title: '異常増殖データ',
    body: [
      '壊滅直前まで記録され続けていた細胞増殖の観測データ。',
      '通常の治療で説明できる範囲を大きく超えた数値が、末尾に残されている。',
      '記録はそこで途切れている。',
    ],
    unlockStageId: 'stage-2',
    sortOrder: 43,
  },
  {
    id: 'mission-remote-lab-comm-log',
    category: 'mission',
    // 正史M2: 共同研究先の正式名称=「東部医療科学センター」。本文は共有パッケージ2026-07-23
    // (investigation_05_east_center_comms)の確定文面へ更新(ID/タイトルは既存を維持)。
    title: '東部医療科学センターとの通信履歴',
    body: [
      'PHILL再生医療研究所は、東部医療科学センターと正常な再生速度、投与量、停止値に関するデータを共有していた。',
      '共同研究の責任者として、グレアム・ケスラーとノラ・ソレルの名が記録されている。',
      '事故直前、研究所から異常値に関する照会が送られていたが、添付された試験記録は削除されている。',
    ],
    unlockStageId: 'stage-2',
    sortOrder: 50,
    emphasis: ['グレアム・ケスラー', 'ノラ・ソレル', '試験記録は削除'],
  },
  {
    // 「グレンの薬」。本文は共有パッケージ2026-07-23(mission_record_glenn_medicine)の確定文面へ更新
    // (ID/タイトルは既存を維持。旧: 統合正本8.3/修正差分メモD-10)。
    // 解放=M7クリア+任意サブ3本完了で通常エンディング後(App側の endingFollowup 'medicine' 経路)。
    // ミッションクリアの unlockedRecordIds には載せない(条件付き解放のためステージ勝利では解放しない)。
    id: 'mission-glen-medicine',
    category: 'mission',
    title: 'グレンの薬',
    body: [
      'ミラから託された未登録薬剤。',
      'グレンが基礎処方と最終調合を行い、ミラが分析、投与設計、安定化、検証を担当した。',
      '変異体を治療するためのものなのか。特定の対象に合わせて調整された形跡があるが、現状は効果不明。',
    ],
    sortOrder: 180,
    emphasis: ['ミラから託された', '特定の対象', '効果不明'],
  },
  // ── ここから共有パッケージ2026-07-23の新規レコード(IDはパッケージのまま) ──────────────
  {
    id: 'investigation_01_outbreak',
    category: 'world',
    title: '災害発生状況',
    body: [
      '最初の集団発生は、森林地下にある再生医療研究施設の周辺で確認された。',
      '曝露者は症状が現れる前に移動し、避難・医療・輸送経路を通じて感染を拡大させた。発生から短期間で国境を越え、現在も世界各地で被害が続いている。',
      '軍は研究施設を初発地点とみているが、事故の詳細と感染の起点は特定できていない。',
    ],
    sortOrder: 10,
    emphasis: ['再生医療研究施設', '感染の起点は特定できていない'],
  },
  {
    id: 'investigation_02_symptoms',
    category: 'world',
    title: '感染者の症状',
    body: [
      '感染は、変異体の血液または体液への曝露によって成立すると考えられている。特に創傷部や粘膜へ接触した例で発症が多い。',
      '多くは24時間以内に発熱、全身痛、痙攣、意識混濁へ進む。高濃度の体液に曝露した場合、数時間で急変する例も確認された。',
      '既存の鎮静・麻酔は十分な効果を示さず、有効な治療法も確立していない。',
    ],
    sortOrder: 20,
    emphasis: ['血液または体液', '有効な治療法も確立していない'],
  },
  {
    id: 'investigation_03_morphology',
    category: 'mutant',
    title: '異形化の傾向',
    body: [
      '変異体は発症後も、進化とも退化とも呼べない形態変化を続けている。',
      '変化には、取り込んだ生体材料だけでなく、元の個体が持つ本能、記憶、自己像が影響している可能性がある。',
      '神や天使、獣、武人を思わせる個体も確認されているが、形態変化の原理は解明されていない。',
    ],
    unlockStageId: 'stage-1',
    sortOrder: 30,
    emphasis: ['形態変化', '本能、記憶、自己像'],
  },
  {
    id: 'investigation_04_phill_public',
    category: 'term',
    title: 'PHILL再生医療計画',
    body: [
      '初発地点の施設では、重傷者の救命を目的とした再生医療計画「PHILL」が進められていた。',
      '損傷した組織や臓器を急速に再構築する技術で、人体への適用にも成功。軍の医療技術として正式採用されていた。',
      '一方、事故直前の記録には、細胞増殖値が安全域を超えた痕跡が残る。重要な試験記録の一部は削除されており、集団発生との関係は確認できない。',
    ],
    unlockStageId: 'stage-2',
    sortOrder: 40,
    emphasis: ['人体への適用にも成功', '細胞増殖値が安全域を超えた'],
  },
  {
    id: 'investigation_06_suppressant',
    category: 'item',
    title: '異常増殖抑制用試薬',
    body: [
      'PHILL再生医療研究所から回収された未完成の試薬。異常な増殖を示す組織へ選択的に作用するよう設計されている。',
      '体液へ曝露した衛生兵へ緊急投与した結果、発熱、痙攣、異常値は一時的に低下した。',
      '変異組織の活動を抑える効果は確認できたが、感染の成立や異常再構築の起点を除去できたとは判断できない。',
    ],
    unlockStageId: 'stage-3',
    sortOrder: 60,
    emphasis: ['一時的に低下', '起点を除去できたとは判断できない'],
  },
  {
    id: 'investigation_07_living_mutation',
    category: 'mutant',
    title: '生存状態からの変異',
    body: [
      '北部封鎖区域で、治療中の衛生兵が心停止や死亡を経ず、生存したまま変異した。',
      '変異体は蘇った死者ではない。生きた人間の細胞増殖、分化、組織の配置、停止制御が崩れ、身体の再構築が続いている。',
      '抑制剤は進行を遅らせたが、根治には至らなかった。末期個体を正常化する手段は、現在も確認されていない。',
    ],
    unlockStageId: 'stage-4',
    sortOrder: 70,
    emphasis: ['生存したまま変異', '蘇った死者ではない'],
  },
  {
    id: 'investigation_08_affective_behavior',
    category: 'mutant',
    title: '特殊個体の行動変化',
    body: [
      '対変異体防衛本部の戦闘中、別方向で交戦していた特殊個体が、多数の変異体の死後に進路を変更した。',
      '個体は他の標的を無視し、変異体を排除していた主人公部隊へ向かった。',
      '単純な反射だけでは説明しにくい。研究班は、同種の喪失に対する怒り、あるいは防衛反応の可能性を挙げている。ただし、人間の意識が残っているとは断定できない。',
    ],
    unlockStageId: 'stage-5',
    sortOrder: 80,
    emphasis: ['進路を変更', '怒り、あるいは防衛反応'],
  },
  {
    id: 'investigation_09_mansion_facility',
    category: 'mission',
    title: '旧市街地・洋館設備調査',
    body: [
      '旧市街地の洋館内部から、PHILL再生医療研究所と同系統の研究設備が発見された。',
      '地下には、一人分の冷却、灌流、自動投与、状態監視を行う施錠区画が存在する。扉は開放できず、維持対象は確認できなかった。',
      '戦闘と撤退の過程で主電源が失われた。非常電源だけでは、冷却と灌流を正常な状態で維持できない。',
    ],
    unlockStageId: 'stage-6',
    sortOrder: 90,
    emphasis: ['一人分', '維持対象は確認できなかった', '主電源が失われた'],
  },
  {
    id: 'investigation_10_public_history',
    category: 'mission',
    title: 'PHILL計画・設立記録',
    body: [
      'PHILL計画は、フィル・ケスラー、グレアム・ケスラー、ノラ・ソレルによる再生医療研究から始まった。',
      '三人は戦争で失われる命を救うことを目的とし、人体治験にも成功。技術は軍の医療へ正式採用された。',
      'フィルは研究者であると同時に現場責任者を務め、戦地で負傷者への再生処置を行っていた。',
    ],
    sortOrder: 100,
    emphasis: ['フィル・ケスラー', '戦争で失われる命を救う', '現場責任者'],
  },
  {
    id: 'investigation_11_phil_injury',
    category: 'mission',
    title: 'フィル・ケスラー負傷記録',
    body: [
      'フィル・ケスラーは戦地で爆撃を受け、四肢と複数臓器を含む広範囲の損傷を負った。',
      '当時のPHILL技術では、損傷した全身を正常に再構築できなかった。',
      'グレアムは救命のため、承認された投与量と運用限界を超える処置を実施。再構築は始まったが、細胞増殖が制御限界を越え、停止しない異常組織が発生した。',
    ],
    sortOrder: 110,
    emphasis: ['爆撃', '運用限界を超える処置', '停止しない異常組織'],
  },
  {
    id: 'investigation_12_graham_experiment',
    category: 'mission',
    title: '規定値超過実験',
    body: [
      'フィルの回復が止まると、グレアムは自分の身体へフィル由来の細胞を移植した。',
      '正常な人体内で安定した細胞を選び、フィルへ戻すことが目的だった。処置を重ねるほどフィルの安定細胞は増えたが、選別から外れた異常細胞はグレアムに蓄積した。',
      'ノラは細胞解析、投与量設計、抑制処置、安定細胞の採取を担当し、危険を理解したうえで実験を継続していた。',
    ],
    sortOrder: 120,
    emphasis: ['自分の身体', '異常細胞はグレアムに蓄積', '危険を理解したうえで'],
  },
  {
    id: 'investigation_13_outbreak_origin',
    category: 'mission',
    title: '研究所感染の起点',
    body: [
      'グレアムの体内に蓄積した異常細胞は、研究所事故以前から血液と体液を介した曝露リスクを生じさせていた。',
      '非正規区画に残った血液、汚染器具、処置廃棄物を通じて研究員が曝露。潜伏期間中に施設外へ移動した者もいた。',
      'グレアムとノラは秘密実験が原因だと認識したが、通報による研究停止を避け、フィルと必要機材を洋館へ移して実験を続けた。',
    ],
    sortOrder: 130,
    emphasis: ['事故以前から', '秘密実験が原因', '実験を続けた'],
  },
  {
    id: 'investigation_14_protagonist_trial',
    category: 'mission',
    title: 'PHILL適合成功例',
    body: [
      '主人公部隊の四名は、アウトブレイク以前に死亡し、PHILLの臨床試験対象として再生処置を受けていた。',
      '損傷が比較的少なく、死亡後の経過も短かったため、身体、神経、記憶を維持した状態で増殖を停止できた。',
      '四名はPHILLの適合成功例であり、軍が「抗体」または「耐性」と呼んでいた性質は、再生処置後に残った変異への抵抗性を指す。',
    ],
    sortOrder: 140,
    emphasis: ['四名', 'PHILLの適合成功例', '抗体', '耐性'],
  },
  {
    id: 'investigation_15_phil_maintenance',
    category: 'mission',
    title: '洋館維持対象記録',
    body: [
      '洋館地下の維持対象はフィル・ケスラーだった。',
      '安定細胞を戻し続けた結果、身体形状、臓器機能、循環、神経反応は人間に近い状態まで回復していた。ただし、異常細胞は完全には除去されていない。',
      '状態は冷却、灌流、抑制剤、自動監視に依存していた。M6の電源喪失後、残存する異常細胞が再び優勢となり、想定を超える速度で状態が後退した。',
    ],
    sortOrder: 150,
    emphasis: ['フィル・ケスラー', '人間に近い状態', '状態が後退'],
  },
  {
    id: 'investigation_16_trial_formulation',
    category: 'item',
    title: '未登録試作製剤',
    body: [
      'ノラから回収した未登録の試作製剤。グレアムの抑制処置を基礎に、異常細胞の増殖力と再構築能力を弱めるよう調整されている。',
      '異常細胞を完全に消す薬ではない。正常組織を優勢に戻し、再構築を制御できる状態へ近づけることを目的としている。',
      '成分、有効性、安全性、再現性は未確認。研究部門による検証が続いている。',
    ],
    unlockStageId: 'stage-7',
    sortOrder: 160,
    emphasis: ['増殖力と再構築能力を弱める', '完全に消す薬ではない', '未確認'],
  },
  {
    id: 'investigation_17_contact_reason',
    category: 'mission',
    title: 'グレン／ミラ接触記録',
    body: [
      'グレアムとノラは、主人公部隊がPHILLの適合成功例であることを知っていた。',
      '二人が戦場で接触を重ねたのは、主人公たちを秘密から遠ざけるためではない。完全変異したグレアムへ対抗できる力と、最後の依頼を託せる相手かを確かめるためだった。',
      '小さな依頼と報酬のやり取りは、正体を明かさず関係を保つための口実でもあった。',
    ],
    sortOrder: 170,
    emphasis: ['PHILLの適合成功例', '完全変異したグレアム', '関係を保つ'],
  },
];

// 初期解放(共有パッケージ: ゲーム開始時=調査記録01・02のみ)。backfillStoryArchive が常時保証する。
export const INITIAL_RECORD_IDS = ['investigation_01_outbreak', 'investigation_02_symptoms'] as const;
// 通常エンディング後に解放する真相資料(共有パッケージ: endingComplete)。
// 「グレンの薬」は別条件(M7+サブ3本=App の medicine 経路)なのでここに含めない。
export const ENDING_RECORD_IDS = [
  'investigation_10_public_history',
  'investigation_11_phil_injury',
  'investigation_12_graham_experiment',
  'investigation_13_outbreak_origin',
  'investigation_14_protagonist_trial',
  'investigation_15_phil_maintenance',
  'investigation_17_contact_reason',
] as const;

export const getArchiveRecord = (id: string): ArchiveRecord | undefined =>
  ARCHIVE_RECORDS.find(r => r.id === id);

// STORY_UI_SPEC.md 7章の StoryArchiveState をそのまま実装。
export interface StoryArchiveState {
  clearedStageIds: string[];
  unlockedRecordIds: string[];
  readRecordIds: string[];
  latestUnlockedRecordIds: string[]; // 直近の unlockRecordsForStage 呼び出しで新規解放された分
}

export const emptyStoryArchiveState = (): StoryArchiveState => ({
  clearedStageIds: [],
  unlockedRecordIds: [],
  readRecordIds: [],
  latestUnlockedRecordIds: [],
});

const STORAGE_KEY = 'zombie:storyArchive';

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(x => typeof x === 'string');

const isValidState = (v: unknown): v is StoryArchiveState => {
  if (!v || typeof v !== 'object') return false;
  const s = v as Partial<StoryArchiveState>;
  return isStringArray(s.clearedStageIds) && isStringArray(s.unlockedRecordIds)
    && isStringArray(s.readRecordIds) && isStringArray(s.latestUnlockedRecordIds);
};

export const loadStoryArchive = (): StoryArchiveState => {
  if (typeof localStorage === 'undefined') return emptyStoryArchiveState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStoryArchiveState();
    const obj = JSON.parse(raw);
    if (!isValidState(obj)) return emptyStoryArchiveState();
    return {
      clearedStageIds: [...obj.clearedStageIds],
      unlockedRecordIds: [...obj.unlockedRecordIds],
      readRecordIds: [...obj.readRecordIds],
      latestUnlockedRecordIds: [...obj.latestUnlockedRecordIds],
    };
  } catch {
    return emptyStoryArchiveState();
  }
};

export const saveStoryArchive = (state: StoryArchiveState): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore (quota / private mode) */
  }
};

// ステージクリア確定時に呼ぶ: そのステージの recordIds(= StageMission.unlockedRecordIds)を解放する。
// 冪等(既に解放済みのIDは増えない=STORY_UI_SPEC.md 9章「同じ資料を重複解放しない」)。
// 戻り値は「今回新規に解放されたレコードID」(再クリア時は空配列)。呼び出し側(GameOverScreen)が
// 1回だけ呼ぶことの保証(refガード等)は呼び出し側の責務——ここでの冪等性は多重呼び出しの安全網。
export const unlockRecordsForStage = (stageId: string, recordIds: string[]): string[] => {
  if (!stageId || !recordIds.length) return [];
  const state = loadStoryArchive();
  const newIds = recordIds.filter(id => !state.unlockedRecordIds.includes(id));
  if (!state.clearedStageIds.includes(stageId)) state.clearedStageIds.push(stageId);
  if (newIds.length) state.unlockedRecordIds.push(...newIds);
  state.latestUnlockedRecordIds = newIds;
  saveStoryArchive(state);
  return newIds;
};

// 資料を開いた時点で既読化(冪等)。
export const markRecordRead = (id: string): void => {
  if (!id) return;
  const state = loadStoryArchive();
  if (state.readRecordIds.includes(id)) return;
  state.readRecordIds.push(id);
  saveStoryArchive(state);
};

export const isRecordUnlocked = (id: string, state: StoryArchiveState = loadStoryArchive()): boolean =>
  state.unlockedRecordIds.includes(id);

export const isRecordRead = (id: string, state: StoryArchiveState = loadStoryArchive()): boolean =>
  state.readRecordIds.includes(id);

// ステージに紐付かない解放(通常エンディング後の真相資料など・共有パッケージ2026-07-23)。
// unlockRecordsForStage と同じ冪等性で unlockedRecordIds に積み、latestUnlockedRecordIds へは
// 【追記マージ】する(直前のステージ/薬解放の通知を上書きしない=ポップアップが全件を数えられる)。
export const unlockRecords = (recordIds: readonly string[]): string[] => {
  if (!recordIds.length) return [];
  const state = loadStoryArchive();
  const newIds = recordIds.filter(id => !state.unlockedRecordIds.includes(id));
  if (!newIds.length) return [];
  state.unlockedRecordIds.push(...newIds);
  state.latestUnlockedRecordIds = [...new Set([...state.latestUnlockedRecordIds, ...newIds])];
  saveStoryArchive(state);
  return newIds;
};

// 既存セーブへの遡及解放(共有パッケージ2026-07-23の実装原則)+初期資料の常時保証。App起動時に1回呼ぶ。
// クリア済みステージ(progress.ts CLEARED_KEY=資料システム導入前のセーブでも記録済み)と
// ストーリーフラグ(endingSeen/medicineOwned)から、本来解放されているべき資料を差分追加する。
// 静かに追加する: latestUnlockedRecordIds には積まない(遡及でポップアップを出さない。未読=NEWバッジは付く)。
// 既読(readRecordIds)には触れない=本文更新だけで既読を未読へ戻さない。冪等。
export const backfillStoryArchive = (
  clearedStageIds: ReadonlySet<string>,
  stageRecordIds: (stageId: string) => readonly string[],
  flags: { endingSeen: boolean; medicineOwned: boolean },
): string[] => {
  const want = new Set<string>(INITIAL_RECORD_IDS);
  for (const stageId of clearedStageIds) {
    for (const id of stageRecordIds(stageId)) want.add(id);
  }
  if (flags.endingSeen) for (const id of ENDING_RECORD_IDS) want.add(id);
  // グレンの薬: medicineOwned はM7クリア+サブ3本完了のED後にのみ立つ(App finishEnding)=同条件の遡及。
  if (flags.endingSeen && flags.medicineOwned) want.add('mission-glen-medicine');
  const state = loadStoryArchive();
  const missing = [...want].filter(id => !state.unlockedRecordIds.includes(id));
  if (!missing.length) return [];
  state.unlockedRecordIds.push(...missing);
  saveStoryArchive(state);
  return missing;
};

// PACING_PUZZLE.md §6.18 バッチM41: 「資料が追加されました」ポップアップ(MissionSelectホーム)の通知消費。
// latestUnlockedRecordIds を読み出しつつ空にして保存する(呼んだら通知は消えて二度と出ない)。
// 呼び出し側はポップアップを閉じた時に1回だけ呼ぶ(未読バッジ=unlockedRecordIds−readRecordIds とは
// 別物なので、これを呼んでも未読マーク/ハブのNEWバッジは変化しない)。
export const consumeLatestUnlocked = (): string[] => {
  const state = loadStoryArchive();
  const ids = state.latestUnlockedRecordIds;
  if (!ids.length) return [];
  state.latestUnlockedRecordIds = [];
  saveStoryArchive(state);
  return ids;
};
