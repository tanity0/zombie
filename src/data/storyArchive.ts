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
      '重傷兵の救命を目的として軍が採用した再生医療計画。',
      '回収資料によれば、PHILL再生医療研究所はその中核拠点の一つだった。',
    ],
    unlockStageId: 'stage-2',
    sortOrder: 41,
  },
  {
    id: 'mission-phill-plan-record',
    category: 'mission',
    title: 'PHILL計画記録',
    body: [
      '支給装備「PHILLガン」の開発記録。感染拡大より前から、この研究所で運用されていた形跡がある。',
      '通常火器では対処しきれない個体を想定して設計された可能性が高い。',
      '詳しい仕様と命名の由来は、別の資料に分けられている。',
    ],
    unlockStageId: 'stage-2',
    sortOrder: 42,
  },
  {
    id: 'mission-abnormal-growth-data',
    category: 'mission',
    title: '異常増殖データ',
    body: [
      '研究所が壊滅する直前まで続けられていた、細胞増殖の観測記録。',
      '最後の測定値は、通常の再生医療では説明できないほど高い。',
      'その先の記録は残っていない。',
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
      'PHILL再生医療研究所と東部医療科学センターは、再生速度や投与量、増殖の停止値についてデータを共有していた。',
      '責任者として、グレアム・ケスラーとノラ・ソレルの名前が残されている。',
      '事故直前、研究所から異常値について問い合わせがあった。しかし、添付されていた試験記録は削除されている。',
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
      'ミラから託された未登録の薬剤。',
      '基礎処方と最終調合はグレンが担当し、ミラが分析と投与設計、検証を行った。',
      '特定の対象に合わせた形跡はあるが、何を治療するためのものなのか、効果も含めて分かっていない。',
    ],
    sortOrder: 180,
    emphasis: ['ミラから託された', '特定の対象'],
  },
  // ── ここから共有パッケージ2026-07-23の新規レコード(IDはパッケージのまま) ──────────────
  {
    id: 'investigation_01_outbreak',
    category: 'world',
    title: '災害発生状況',
    body: [
      '最初の集団発生は、森林地下の再生医療研究施設周辺で確認された。',
      '感染に気づかないまま移動した人々を通じて、被害は避難経路や医療施設へ広がった。発生から間もなく国境を越え、現在も各地で拡大している。',
      '軍は研究施設を初発地点とみているが、最初の感染経路は分かっていない。',
    ],
    sortOrder: 10,
    emphasis: ['再生医療研究施設'],
  },
  {
    id: 'investigation_02_symptoms',
    category: 'world',
    title: '感染者の症状',
    body: [
      '変異体の血液や体液に触れることで感染すると考えられている。傷口や粘膜への接触による発症が多い。',
      '多くは24時間以内に発熱、全身痛、痙攣、意識混濁を起こす。高濃度の体液に曝露した場合、数時間で急変する例もある。',
      '既存の鎮静剤や麻酔は効きにくく、有効な治療法は見つかっていない。',
    ],
    sortOrder: 20,
    emphasis: [],
  },
  {
    id: 'investigation_03_morphology',
    category: 'mutant',
    title: '異形化の傾向',
    body: [
      '変異体は発症後も形を変え続けている。その変化には一定の法則が見つかっていない。',
      '取り込んだ生体材料に加え、元の個体の本能や記憶、自己像が関わっている可能性がある。',
      '神や天使、獣、武人に似た姿も確認されている。なぜその形になるのかは、まだ分かっていない。',
    ],
    unlockStageId: 'stage-1',
    sortOrder: 30,
    emphasis: [],
  },
  {
    id: 'investigation_04_phill_public',
    category: 'term',
    title: 'PHILL再生医療計画',
    body: [
      '「PHILL」は、重傷者を救うために開発された再生医療技術。損傷した組織や臓器を急速に再構築し、人体への適用にも成功していた。',
      'その成果から、軍の医療技術として正式採用された。',
      'だが事故直前、研究所では細胞増殖値が安全域を超えていた。一部の試験記録は削除されており、感染拡大との関係は分かっていない。',
    ],
    unlockStageId: 'stage-2',
    sortOrder: 40,
    emphasis: ['人体への適用にも成功'],
  },
  {
    id: 'investigation_06_suppressant',
    category: 'item',
    title: '異常増殖抑制用試薬',
    body: [
      'PHILL再生医療研究所で回収された未完成の試薬。異常に増殖する組織の活動を抑えるために設計された。',
      '体液に曝露した衛生兵への緊急投与で、熱と痙攣、異常値は一時的に下がった。',
      'ただし、感染そのものを止めたわけではない。',
    ],
    unlockStageId: 'stage-3',
    sortOrder: 60,
    emphasis: [],
  },
  {
    id: 'investigation_07_living_mutation',
    category: 'mutant',
    title: '生存状態からの変異',
    body: [
      '北部封鎖区域で治療を受けていた衛生兵は、心停止や死亡を経ず、生きたまま変異した。',
      '変異体は蘇った死者ではない。生きた細胞の増殖と再構築が制御を失った結果だと考えられる。',
      '試薬で進行を遅らせることはできたが、元に戻す方法は見つかっていない。',
    ],
    unlockStageId: 'stage-4',
    sortOrder: 70,
    emphasis: ['蘇った死者ではない'],
  },
  {
    id: 'investigation_08_affective_behavior',
    category: 'mutant',
    title: '特殊個体の行動変化',
    body: [
      '本部防衛戦で、別の場所にいた特殊個体が、多数の変異体が倒された直後に進路を変えた。',
      '個体はほかの標的を無視し、変異体を排除していた対変異体部隊へ向かっている。',
      '研究班は、同種の喪失への怒り、あるいは防衛反応を疑っている。ただし、意識が残っている証拠はない。',
    ],
    unlockStageId: 'stage-5',
    sortOrder: 80,
    emphasis: ['怒り、あるいは防衛反応'],
  },
  {
    id: 'investigation_09_mansion_facility',
    category: 'mission',
    title: '旧市街地・洋館設備調査',
    body: [
      '旧市街地の洋館には、PHILL再生医療研究所と同系統の設備が残されていた。',
      '地下の施錠区画には、冷却、灌流、自動投与、状態監視の装置が一人分だけ備えられている。扉は開かず、中に何があるのかは確認できなかった。',
      '撤退時に主電源を喪失。非常電源だけでは装置を正常に維持できない。',
    ],
    unlockStageId: 'stage-6',
    sortOrder: 90,
    emphasis: ['一人分'],
  },
  {
    id: 'investigation_10_public_history',
    category: 'mission',
    title: 'PHILL計画・設立記録',
    body: [
      'PHILL計画は、フィル・ケスラー、グレアム・ケスラー、ノラ・ソレルの研究から始まった。',
      '三人が目指したのは、戦争で失われる命を救うことだった。人体への適用に成功した技術は、軍に正式採用される。',
      'フィル自身も戦地へ赴き、負傷者の救命にあたっていた。',
    ],
    sortOrder: 100,
    emphasis: ['フィル・ケスラー', '戦争で失われる命を救う'],
  },
  {
    id: 'investigation_11_phil_injury',
    category: 'mission',
    title: 'フィル・ケスラー負傷記録',
    body: [
      '戦地での爆撃により、フィル・ケスラーは四肢と複数の臓器に深刻な損傷を負った。',
      '当時のPHILLでは全身の再構築が追いつかなかった。父グレアムは息子を救うため、許可された限界を超えて処置を続けた。',
      '失われた組織の再生は始まった。しかし、細胞増殖は止まらなくなった。',
    ],
    sortOrder: 110,
    emphasis: ['爆撃'],
  },
  {
    id: 'investigation_12_graham_experiment',
    category: 'mission',
    title: '規定値超過実験',
    body: [
      'フィルの回復が止まると、グレアムは息子由来の細胞を自分の身体へ移植した。',
      '体内で安定した細胞だけを取り出し、フィルに戻すためだった。処置を重ねるほど息子の状態は改善したが、異常な細胞は父親の身体に蓄積していった。',
      'ノラも危険を承知のうえで、解析と抑制処置を続けていた。',
    ],
    sortOrder: 120,
    emphasis: ['自分の身体'],
  },
  {
    id: 'investigation_13_outbreak_origin',
    category: 'mission',
    title: '研究所感染の起点',
    body: [
      'グレアムの身体に蓄積した異常細胞は、事故以前から血液や体液を介して周囲へ広がる危険を抱えていた。',
      '秘密の処置区画に残された血液や器具から研究員が曝露し、症状が出る前に施設の外へ出た者もいた。',
      '研究所内で感染が拡大すると、グレアムとノラは脱出を余儀なくされた。二人はフィルを洋館へ移し、処置を続けた。',
    ],
    sortOrder: 130,
    emphasis: ['事故以前から'],
  },
  {
    id: 'investigation_14_protagonist_trial',
    category: 'mission',
    title: 'PHILL適合成功例',
    body: [
      '対変異体部隊の四名は、感染拡大以前に一度死亡していた。PHILLの最終臨床試験によって蘇生された者たちだった。',
      '四名はいずれもPHILLへの適合基準を満たしており、遺体は極秘裏に研究所へ搬送された。試験では四名全員の蘇生に成功した。',
      '蘇生後の検査では、四名全員に変異への抵抗性が確認された。',
      '軍はこの特性に着目し、四名に戦闘訓練を施したうえで、対変異体部隊に編入した。',
    ],
    sortOrder: 140,
    emphasis: ['四名', '変異への抵抗性'], // 社長稿2026-11-18で本文差し替え(「抗体」「耐性」の語が本文から無くなったため強調も更新)
  },
  {
    id: 'investigation_15_phil_maintenance',
    category: 'mission',
    title: '洋館維持対象記録',
    body: [
      '洋館の地下で維持されていたのは、フィル・ケスラーだった。',
      '父が戻した安定細胞によって、その身体は人間に近い状態まで回復していた。しかし異常細胞は残っており、冷却や灌流、抑制剤なしでは維持できなかった。',
      '洋館の電源が失われた後、異常細胞が再び増殖し始めた。',
    ],
    sortOrder: 150,
    emphasis: ['フィル・ケスラー', '人間に近い状態'],
  },
  {
    id: 'investigation_16_trial_formulation',
    category: 'item',
    title: '未登録試作製剤',
    body: [
      'ノラから回収した未登録の試作製剤。グレアムの抑制処置をもとに、異常細胞の増殖を弱めるよう調整されている。',
      '異常細胞を消し去る薬ではない。正常な組織が優勢になる状態を目指したものだ。',
      '効果と安全性は確認できておらず、検証が続いている。',
    ],
    sortOrder: 160, // 解放=通常ED後(ENDING_RECORD_IDS)。旧: M7クリア(ED前にミラ=ノラが分かるため移設・社長指示2026-11-18)
    emphasis: [],
  },
  {
    id: 'investigation_17_contact_reason',
    category: 'mission',
    title: 'グレン／ミラ接触記録',
    body: [
      'グレアムとノラは、対変異体部隊の四名がPHILLの適合成功例だと知っていた。',
      '各地で接触を重ねたのは、変異したグレアムを止める力があるか、最後の依頼を託せる相手かを確かめるためだった。',
      '小さな依頼と報酬のやり取りは、正体を隠して接触を続ける口実でもあった。',
    ],
    sortOrder: 170,
    emphasis: ['PHILLの適合成功例'],
  },
  {
    // 旧EXエンディング「対変異体災害・最終調査記録」(社長支給2026-08-21)を資料室へ移設(社長指示2026-11-18「いまあるエンディング文章は、資料室に移動」
    // 「EXをクリアすると手に入る文章」)。画面の打ち込み用の改行区切り(一覧・単独語)だけ資料の段落に合わせて繋いだ。解放=EXクリア(campaign stage-ex1 の unlockedRecordIds)。
    id: 'investigation_18_final_report',
    category: 'mission',
    title: '対変異体災害・最終調査記録',
    body: [
      'PHILL再生医療研究は、一人の青年が発見した異常な細胞再生現象から始まった。',
      '発見者、フィル・ケスラー。',
      'フィル・ケスラーは、この現象を医療へ応用するため、再生医療研究者であった父、グレアム・ケスラーへ研究を持ち込んだ。',
      'その後、ノラ・ソレルを加えた研究班は、国家協力のもとで試験を継続。',
      '軽度損傷、重度損傷、組織や臓器の欠損へと、適用範囲は段階的に拡大された。',
      '正式採用前に行われた最終試験では、死亡状態にあった四名の生命活動が回復。',
      'この結果を受け、研究は戦地で重傷を負った兵士の救命と身体再建を目的とする再生医療技術として、軍に正式採用された。',
      '技術には発見者、フィル・ケスラーの名を取り、PHILLと名付けられた。',
      'PHILLは実際に、多くの重傷者を救った。',
      '正式採用後、フィル・ケスラー自身も戦地への派遣を志願。',
      '自ら生み出した技術を用い、負傷者の救命に従事した。',
      'その後、戦地での爆撃により、フィル・ケスラーはPHILLでも再構築不可能なほどの身体欠損を負った。',
      'グレアム・ケスラーは、フィル・ケスラーを救うため、規定値を超える再生処置を実施。',
      '一時、失われた組織の急速な再構築が確認された。',
      'しかし、再生に伴う細胞増殖を抑制し、正常な状態へ収束させることはできなかった。',
      '増殖は、その後も続いた。',
      '以降の処置について、正式な研究記録の多くが失われている。',
      '残存記録から、グレアム・ケスラーが自らの身体を用いた非承認試験を繰り返していたことが確認された。',
      'フィル・ケスラー由来の細胞をグレアム・ケスラーへ導入。',
      'グレアム・ケスラーの正常組織と共存した細胞を抽出し、再びフィル・ケスラーへ戻す。',
      '処置は繰り返された。',
      '処置の結果、フィル・ケスラーの状態には一時的な改善がみられた。',
      'しかしその一方で、グレアム・ケスラーの身体には異常細胞が蓄積していた。',
      '研究所で最初の大規模汚染が確認されたのは、その後である。',
      '事故が一度の偶発的な出来事によって発生したのか。',
      'あるいは、長期間にわたり蓄積した危険が、最後に表面化したものなのか。',
      '残された記録だけでは断定できない。',
      'ただし、感染拡大以前から、研究所内部に制御不能な細胞が存在していたことは確認されている。',
      '研究所の崩壊後も、処置は終了しなかった。',
      '旧市街地の洋館から、冷却設備、灌流設備、自動投与装置、生体監視装置など、一名を長期間維持するための設備が発見された。',
      '維持対象は、フィル・ケスラー。',
      'グレアム・ケスラーとノラ・ソレルは、研究所壊滅後もフィル・ケスラーの治療を継続していた。',
      'グレアム・ケスラーは、その後変異。',
      '対変異体部隊との交戦により死亡した。',
      'ノラ・ソレルは生存し、保護された。',
      'そして後日。',
      '旧市街地の洋館において、既存分類に該当しない大型個体が確認された。',
      '同個体は対変異体部隊によって排除。',
      '残存していた維持記録、生体情報、研究資料との照合により、この個体をフィル・ケスラーと判断する。',
      'これをもって、本災害の発生に直接関係した主要研究対象の追跡を終了した。',
      '［追記］',
      'PHILLは、多くの生命を救った。',
      '同じ技術によって、多くの生命が失われた。',
      'その境界がどこにあったのか。',
      '技術そのものに、それを判断する意思はない。',
      '最後まで、その境界を決めていたのは人間だった。',
      '以上をもって、本件の最終記録とする。',
    ],
    sortOrder: 190,
    emphasis: ['フィル・ケスラー'],
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
  'investigation_16_trial_formulation',
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
