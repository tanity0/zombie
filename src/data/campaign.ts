// キャンペーン(ストーリー / ステージ / ミッション)のデータ正本。
// UIデザインは後追いで詰める前提なので、ここには「内容(導線に必要なデータ)」だけを置き、
// 見た目は画面コンポーネント側で持つ。文章は差し替え前提のドラフト(社長提供の本文を反映)。
//
// 進行ルール(統合正本『the ONE』/ 一括制作指示書 2026-07-16):
// - ステージ1〜7はメインミッションをクリアすると次が解放される(開発番号M1〜M7は画面に出さない)。
// - 洋館［SUB］再訪 = stage-6 と同じ親ノードの秘密任務(REVISIT_MISSION)。解放条件は
//   「通常ED完了+任意サブ3本完了+グレンの薬所持+未使用」(utils/storyProgress.ts)。
// - EX1(異常変異体調査) = 軍の正式任務。再訪で薬を使用後(storyFlags.medicineUsed)に出現。
// - stage-ex2 は旧構想の残置データ(hidden=導線なし)。正史のEXは stage-ex1 のみ。

import type { CharacterClass, SubWeaponKey, SkillKey, IntroLine, EnemyType } from '../types/game';

// --- ステージ / ミッションの型 -------------------------------------------
export interface StageVoiceLine {
  speaker: string;
  text: string;
}

export interface StageMission {
  code: string;          // 'M1' / 'EX1' など
  title: string;         // ミッション名(例: 救助)
  summary: string;       // ステージ選択「一覧」に出す短い目的説明(1行)
  synopsis: string[];    // 選択した中(ミッション詳細)に出すあらすじ(数行)。クリア後は debrief に切替表示
  briefing: string[];    // ステージ開始前の説明(段落配列。ゲーム内導入向け)
  debrief: string[];     // ステージクリア後の説明(段落配列。詳細の説明欄にクリア後表示)
  radio?: boolean;       // ブリーフィング中に無線ノイズSEの「間」を挟むか
  voices?: StageVoiceLine[]; // 生存者などの声(ブリーフィング後段)
  // ステージ開始時の会話イベント(時間停止・オートタイプ)。ミッションごとに内容/有無が変わる。
  // 未指定/空 = 会話なし(フリーミッション等)。
  dialogue?: IntroLine[];
  // PACING_PUZZLE.md §6.17 M40 / STORY_UI_SPEC.md 7章: 勝利リザルトの「任務報告」欄(2〜4短文)。
  // 未指定のステージは debrief をフォールバック表示する(リザルト側の責務。ここでは空のままでよい)。
  clearReport?: string[];
  // 統合正本11.2 / 指示書2.2: true なら任務報告欄そのものを出さない(debriefフォールバックも抑止)。
  // 秘密行動(洋館再訪)用=軍向けの記録を一切残さない。
  suppressDebrief?: boolean;
  // クリアで解放する資料室(src/data/storyArchive.ts の ArchiveRecord.id)。未指定 = 解放なし。
  unlockedRecordIds?: string[];
  // 出撃ページに出す特殊条件の短ラベル(データのみ先行。表示はM42)。未指定 = 特殊条件なし。
  specialConditions?: string[];
  // PACING_PUZZLE.md §6.19 M42 / STORY_UI_SPEC.md追補1-4: 出撃ページの「特殊支給装備」欄。
  // 未指定 = 非表示。
  specialEquipment?: string[];
}

export interface SubMission {
  id: string;
  title: string;
  desc: string;
}

export interface Stage {
  id: string;            // 'stage-1' / 'stage-ex1'
  index: number;         // 表示順(1..7、EXは100以降、freeは0)
  kind: 'main' | 'ex' | 'free'; // main=本編 / ex=クリア後の隠しステージ / free=周回(ミッション無し・会話なし)
  name: string;          // ステージ名(地名寄り)
  area: string;          // 舞台の短い説明
  main: StageMission;    // メインミッション
  subs: SubMission[];    // サブミッション(今は空=準備中。後で追加)
  unlockBy: string | null; // このステージ解放に必要な「直前ステージのid」(null=最初から解放)
  hidden?: boolean;      // trueならステージ選択に一切出さない(ロック表示もしない)。データ/進行は残る。
  // PACING_PUZZLE.md §6.19 M42 / STORY_UI_SPEC.md追補1: 親ノード(日時・場所)の表示情報。
  // ミッション側(StageMission)へは重複記載しない(追補1-4「日時と場所名を、各ミッションデータへ
  // 重複記載しない」)。値は社長指定(追補1-2)。
  day: number;            // ゲーム内経過日数(例: 26)
  time: string;           // 'hh:mm' 形式(例: '16:20')
  // 統合正本5.2 / 指示書2.1: 日時の表示文字列を上書きする(例: M6='某日／未明' / EX='数日後／未明')。
  // 意図的な曖昧表示を数値日時へ無理に変換しないための器。未指定=「DAY {day} / {time}」を表示。
  timeLabel?: string;
  locationTitle: string;  // 場所名(例: '東部避難回廊')
  indoor?: boolean;      // 屋内(研究施設)ステージ=手書き壁マップ/カメラクランプ/湧き抑制
  theme?: 'lab';         // 見た目テーマ(屋外構造のままテクスチャだけ差し替え)。'lab'=研究所スキン。
  farBackdrop?: string;  // 遠景パノラマの差し替えキー(forestテーマの距離パノラマだけ変える)。'city'=夜の廃都。
  nearHorizon?: string;  // 遠景森2(手前に重ねる帯)のキー。'forest'=森シルエット / 'city'=廃墟都市。未指定=なし。
  bgm?: string;          // ステージBGMキー(audioManager の GAME_BGM)。未指定なら theme/既定で解決。
  mainEvent?: 'suppression'; // メインミッションのゲームプレイ・イベント種別。'suppression'=4拠点制圧。
  hiddenBoss?: EnemyType; // このステージの深層域に出現する裏ボス('mimir'=ステージ1 / 'jormungand'=ステージ3)。未指定=なし。
  // 統合正本M7/EX(10.2-10.3): ストーリーボス専用ステージ。通常湧き・城ボス・ハンター・ゲート・
  // 紅き夜・死神・演出波を全停止し、「(会話)→ボス出現→撃破→勝利」だけで構成する(useGameLoop側で配線)。
  storyBossOnly?: boolean;
}

// 統合正本「任意サブ共通UI」/ 指示書3: 任意サブ3本(ステージ1/3/4)は同じタイトル・説明を使う。
// 実体は各ステージ出撃中の二人組クエスト(utils/eventQuest.ts)。ここは表示用の共通カード。
export const SUB_RESCUE_MISSION: SubMission = {
  id: 'sub-rescue',
  title: '身元不明民間人の救助',
  desc: '変異体出没地にて2名の民間人の目撃証言有り。念の為救助に当たれ。',
};

// 親ノード見出しの日時表示(統合正本5.2)。timeLabel があればそれを優先(M6/EXの意図的な曖昧表示)。
export const stageDateLabel = (stage: Pick<Stage, 'day' | 'time' | 'timeLabel'>): string =>
  stage.timeLabel ?? `DAY ${stage.day} / ${stage.time}`;

// 統合正本9章 / 指示書7: 洋館［SUB］再訪。M6と同じ親ノード(stage-6)にぶら下がる秘密任務。
// 軍の正式任務ではない=任務報告なし(suppressDebrief)・資料解放なし・会話/通信なし。
// クリア状態はミッション単位クリア(REVISIT_MISSION_ID)と storyFlags(medicineUsed/revisitCleared)で管理。
export const REVISIT_MISSION_ID = 'stage-6:revisit';
export const REVISIT_MISSION: StageMission = {
  code: 'SUB-REVISIT',
  title: '再訪',
  summary: '洋館へ戻り、保存槽にグレンの薬を使う。',
  synopsis: [
    '洋館の保存槽には、あの男がまだ眠っている。',
    'ミラから託されたグレンの薬を、秘密裏に届ける。',
    '軍への報告は行わない。',
  ],
  briefing: [],
  debrief: [],
  suppressDebrief: true,
  specialConditions: ['軍の正式任務ではない（秘密行動）', '任務報告なし'],
  dialogue: [],
};

// 社長提供の本編シナリオ(the ONE)をそのまま反映。地名(name/area)は文脈からの仮置き。
// フリーミッションは独立ステージではなく、各ステージにぶら下がる「周回(会話なし)」出撃として
// ミッション詳細から選べる(社長指示)。'free' kind の独立ステージは廃止。
export const STAGES: Stage[] = [
  {
    id: 'stage-1',
    index: 1,
    kind: 'main',
    name: '狂い咲きの森',
    area: '森林地帯 / 偵察部隊 救助',
    unlockBy: null,
    day: 26,
    time: '16:20',
    locationTitle: '東部避難回廊',
    nearHorizon: 'forest', // 遠景森2(手前の森シルエット帯)
    mainEvent: 'suppression', // メインミッション=4拠点制圧イベント(東西南北)
    hiddenBoss: 'mimir', // 深層域の裏ボス=ミーミル(巨大な眼)
    subs: [SUB_RESCUE_MISSION], // 任意サブ1(二人組クエスト)の表示カード(指示書3: 3本共通の文面)
    main: {
      code: 'M1',
      title: '救助任務',
      summary: '変異体に包囲された偵察部隊を救出する。',
      synopsis: [
        '研究所の場所を特定した偵察部隊が、帰還中に変異体に包囲された。',
        '研究所奪還に向かう予定だった抗体部隊は、急遽、偵察部隊の救助に向かう。',
      ],
      radio: true,
      briefing: [
        '緊急通信。任務を一時中断する。',
        '研究所から帰還中の偵察部隊が、変異体に包囲された。',
        '現在地から近い。座標を送る。救助を優先してくれ。',
      ],
      voices: [
        { speaker: 'エドガー', text: '……聞こえるか！ くそ、弾がねぇ！' },
        { speaker: 'エドガー', text: 'グレッグ……！ ちくしょう、助け……' },
      ],
      debrief: [
        '偵察部隊の生存者を救助。',
        '研究所の座標データを回収した。',
        '研究所奪還作戦が開始される。',
      ],
      // ゲーム内の登場会話(時間停止・オートタイプ)。冒頭会話は削除(社長指示)=空配列で無会話。
      dialogue: [],
    },
  },
  {
    id: 'stage-2',
    index: 2,
    kind: 'main',
    name: '研究所跡',
    area: '壊滅した研究所 / 中枢データ回収',
    unlockBy: 'stage-1',
    day: 28,
    time: '01:40',
    locationTitle: 'PHILL再生医療研究所',
    subs: [],
    // ステージ2は「野外ラボ」=屋外スクロール(他ステージと同じサバイバル進行)＋研究所スキン。
    // 内容差は theme:'lab' による「見た目(遠景/地平/床=ラボ・木なし)＋ラボ壁が障害物として出現」＋死神なし。
    // (屋内迷路モード indoor は本作では不採用。indoorMode 基盤は将来用に残置するがこのステージでは使わない。)
    theme: 'lab',
    nearHorizon: 'lab', // 遠景森2(手前に重ねる帯)= 研究所の機材シルエット

    main: {
      code: 'M2',
      title: '研究所再突入',
      summary: '壊滅した研究所へ突入し、中枢データを回収して撤退する。',
      synopsis: [
        '偵察部隊が持ち帰った座標により、研究所の場所が判明した。',
        '抗体部隊は研究所に再突入し、残された中枢データの回収を行う。',
      ],
      briefing: [
        '偵察部隊が持ち帰った座標により、研究所の場所が特定された。',
        '研究所はすでに壊滅状態にあるが、中枢データが残っている可能性がある。',
        '目的は奪還ではない。',
        '必要なデータを回収し、撤退する。',
      ],
      debrief: [
        '研究所中枢データを回収。',
        '軍用再生薬計画の存在を確認した。',
        '主任研究者は死亡認定。',
        'ただし、壊滅直前の記録の一部は欠損していた。',
      ],
      // PACING_PUZZLE.md §6.17 M40 / STORY_UI_SPEC.md 5章・6章・3章の M2例文をそのまま反映。
      clearReport: [
        '施設は軍の再生医療研究所だった。',
        '壊滅直前のデータには、通常の治療では説明できない異常値が残されている。',
        '別地域の共同研究所との通信記録を確認。生存者の捜索を開始する。',
      ],
      unlockedRecordIds: [
        'mission-military-regen-plan',
        'mission-phill-plan-record',
        'mission-abnormal-growth-data',
        'mission-remote-lab-comm-log',
      ],
      specialConditions: ['単身潜入', 'PHILLガン固定', '弾薬有限', '敵の殲滅は不要'],
      // PACING_PUZZLE.md §6.19 M42: 特殊支給装備(叩き台・社長指定)。
      specialEquipment: ['PHILLガン'],
    },
  },
  {
    id: 'stage-3',
    index: 3,
    kind: 'main',
    name: 'リモート研究施設',
    area: '連携研究施設 / 責任者 救出',
    unlockBy: 'stage-2',
    day: 30,
    time: '10:30',
    locationTitle: '東部医療科学センター',
    farBackdrop: 'city', // 遠景を昼の廃都パノラマ(正午ステージ)へ差し替え(森の地形・地平はそのまま)。
    nearHorizon: 'city', // 遠景森2(手前の廃墟都市帯)
    hiddenBoss: 'jormungand', // 深層域の裏ボス=ヨルムンガルド(巨蛇)
    bgm: 'stage3',       // ステージ3専用BGM(public/audio/stage3.mp3)
    subs: [SUB_RESCUE_MISSION], // 任意サブ2(二人組クエスト)の表示カード
    main: {
      code: 'M3',
      title: 'リモート研究所',
      summary: '連携研究施設の責任者を救出する。再生薬データを握る人物。',
      synopsis: [
        '研究所本体とリモートで協力していた研究施設がある。',
        'その責任者は、事故前の再生薬データを解析していた。',
        '通信は途絶えているが、生存の可能性がある。',
      ],
      briefing: [
        '研究所本体とリモートで協力していた研究施設がある。',
        'そこの責任者は、事故前の再生薬データを解析していた。',
        '通信は途絶えているが、生存の可能性はある。',
        '救出に向かう。',
      ],
      debrief: [
        'リモート研究所の責任者を救助。',
        '再生薬は当初、順調に開発が進んでいた。',
        'しかし直近のデータでは、明らかに過剰な細胞増殖へ振り切っていた。',
        // 統合正本M3の確定台詞(腕台詞はここだけ。M4で同種の台詞を反復しない)。
        '「数値が異常だ。腕でも生やそうとしたのか？」',
        '薬は傷を治すものから、身体を作り替えるものに変わり始めていた。',
      ],
    },
  },
  {
    id: 'stage-4',
    index: 4,
    kind: 'main',
    name: '封鎖地域',
    area: 'ロックダウン地域 / 医師団 接触',
    unlockBy: 'stage-3',
    day: 32,
    time: '17:10',
    locationTitle: '北部封鎖区域',
    farBackdrop: 'snow', // 遠景を雪原の要塞パノラマへ差し替え(地形/地平は森のまま)
    bgm: 'stage4',       // ステージ4専用BGM(public/audio/stage4.mp3)
    hiddenBoss: 'skadi', // 深層域の裏ボス=スカジ(氷の死王)
    subs: [SUB_RESCUE_MISSION], // 任意サブ3(二人組クエスト)の表示カード
    main: {
      code: 'M4',
      title: '封鎖地域',
      summary: '封鎖地域へ強行突入し、戻らない医師団と接触する。',
      synopsis: [
        '壁に囲まれ、完全にロックダウンされた地域がある。',
        '通信網は死に、救済に向かった医師団も戻っていない。',
        '抗体部隊は医師団との接触に向かう。',
      ],
      briefing: [
        '壁に囲まれ、完全にロックダウンされた地域がある。',
        '通信網は死んでいる。',
        'そこへ救済に向かった医師団が戻っていない。',
        '医師団の中には、細胞再生の第一人者が含まれている。',
        '道中は変異体だらけだ。急いで接触する。',
      ],
      debrief: [
        '医師団と接触。',
        // 旧「足でも生やそうとしているのか？」は削除(指示書10: 腕・足の同種台詞をM3以外で反復しない)。
        '研究資料を見た医師は、変異体の正体に気づいた。',
        '変異体は死者が蘇ったものではない。',
        '生きたまま細胞が異常増殖と分裂を繰り返した結果だった。',
        '元は人間であった何か。',
        '軍が変異体サンプルから導いていた答えとも一致した。',
        '理論上、戻せる可能性はある。',
        'しかし現状では、異常に増えた細胞を取り除くしかない。',
        'ここまで変異したものからそれを取り除くことは、ほぼ殺すのと変わらない。',
        '直後、軍本部に変異体が押し寄せているとの緊急通信を受信。',
        '援護に向かう。',
      ],
    },
  },
  {
    id: 'stage-5',
    index: 5,
    kind: 'main',
    name: '軍本部',
    area: '防衛線 / 本部 防衛',
    unlockBy: 'stage-4',
    day: 35,
    time: '22:15',
    locationTitle: '対変異体防衛本部',
    bgm: 'stage5',        // ステージ5専用BGM(public/audio/stage5.mp3)
    farBackdrop: 'stage5', // 遠景を紅き月の城塞パノラマへ差し替え(社長提供素材)。地形/前景は森のまま(未提供)。
    nearHorizon: 'stage5', // 遠景森2(手前に重ねる帯)= 戦場の残骸(旗/大砲/木箱、社長提供素材)
    hiddenBoss: 'thor', // 深層域の裏ボス=トール(鬼刀の武人・社長提供素材)
    subs: [],
    main: {
      code: 'M5',
      title: '軍本部防衛',
      summary: '押し寄せる変異体の群れから、軍本部の防衛線を守り抜く。',
      synopsis: [
        '軍本部に変異体の群れが押し寄せている。',
        '本部が落ちれば、研究者も設備も失われる。',
        '抗体部隊は防衛線の援護に向かう。',
      ],
      briefing: [
        '軍本部の防衛線が突破されかけている。',
        '変異体の群れが押し寄せている。',
        '本部が落ちれば、研究者も設備も失われる。',
        // 旧「ワクチン計画も止まる」は置換(指示書10: ワクチンは本編中に完成せず、計画としても明示しない)。
        '救助活動も、研究も止まる。',
        'ただちに援護に向かう。',
      ],
      debrief: [
        '軍本部防衛に成功。',
        '戦闘中、別地点で交戦していた変異体が、進路を変えてこちらへ向かってきた。',
        '周囲の変異体が倒されたことに反応した可能性がある。',
        '研究者は、単なる反射ではないと判断。',
        '怒り、または同種個体の喪失への情動反応かもしれない。',
        '変異体には、まだ何かが残っている可能性がある。',
      ],
    },
  },
  {
    id: 'stage-6',
    index: 6,
    kind: 'main',
    name: '古い洋館',
    area: '廃屋 / 私設ラボ 確認',
    unlockBy: 'stage-5',
    day: 36,
    time: '23:10',
    timeLabel: '某日／未明', // 統合正本5.2: 意図的な曖昧表示(日時未設定の代用ではない)。内部時系列はM5後・M7前。
    locationTitle: '旧市街地・洋館',
    bgm: 'stage6',       // ステージ6専用BGM(public/audio/stage6.mp3)
    subs: [],
    main: {
      code: 'M6',
      title: '古い洋館',
      summary: '変異体の発生源と疑われる古い洋館へ向かい、内部を確認する。',
      synopsis: [
        '軍本部に現れた変異体たちの経路を逆算した結果、特定地域から来ている個体が多いことが判明した。',
        'その地域には古い洋館がある。',
        '内部には、外観と不釣り合いな最新設備が確認されている。',
      ],
      radio: true,
      briefing: [
        '軍本部に現れた変異体たちの経路を逆算した。',
        '複数の個体が、ある特定の地域から来ている。',
        'その地域には、古い洋館がある。',
        '表向きはただの廃屋。',
        'しかし内部には、明らかに不釣り合いな最新設備がある可能性が高い。',
        '確認に向かう。',
      ],
      // 統合正本M6(6章)/知識管理: 旧案(主人公一致の実験ログ/「助……て……！ ワクチン……！」)は削除し、
      // 最終通信=ミラの確定通信文へ置換(指示書4.6「ワクチン」という語へ変更しない)。
      // 修正差分メモD-05(2026-07-16): M6ではフィル本人・保存槽・中身を見せない。地下は
      // 「厳重に施錠された冷却設備付き区画(扉は開かない)」の違和感だけを残す。
      debrief: [
        '洋館内部を確認。',
        '外観と不釣り合いな、最新の研究設備があった。',
        '地下に、厳重に施錠された冷却設備付きの区画を確認。',
        '扉は開かず、内部は確認できていない。',
        '直後、軍用暗号通信に通信が入った。',
        'ミラ「こちらミラ。変異体に対する薬が完成した。至急、回収に来て。時間がない」',
        '発信地点を逆探知した。',
      ],
      clearReport: [
        '洋館内部に、私設と思われる最新の研究設備を確認。',
        '地下に厳重に施錠された冷却設備付き区画を確認。扉は開かず、内部は不明。',
        '「こちらミラ。変異体に対する薬が完成した。至急、回収に来て。時間がない」',
        '発信地点を逆探知。座標を特定した。',
      ],
    },
  },
  {
    id: 'stage-7',
    index: 7,
    kind: 'main',
    name: '逆探知地点',
    area: '通信の発信地点 / 二人組',
    unlockBy: 'stage-6',
    day: 38,
    time: '04:20',
    locationTitle: '指定座標地点',
    storyBossOnly: true, // 統合正本M7: 敵のいない短い導入→確定会話→グレン戦直結(通常湧きなし)
    subs: [],
    main: {
      code: 'M7',
      title: '逆探知地点',
      summary: 'ミラからの通信を逆探知。発信地点へ向かい、待つ二人と対峙する。',
      synopsis: [
        'ミラからの通信を逆探知した。',
        '「変異体に対する薬が完成した」——発信地点へ向かう。',
      ],
      briefing: [
        '通信の発信地点を逆探知した。',
        '現地へ向かう。',
        'そこには、これまで各地で出会っていた二人がいる。',
      ],
      // 統合正本M7「グレン戦直前・確定稿」(指示書4.7)。一言一句変更しない。
      dialogue: [
        { speaker: 'グレン', text: 'きてくれたか……' },
        { speaker: 'ミラ', text: '本部が襲われたのは、私たちのせいなの' },
        { speaker: 'ミラ', text: 'でも、薬はできた' },
        { speaker: 'ミラ', text: '最後に、一つだけお願い' },
        { speaker: 'グレン', text: 'ジカン……ダ' },
        { speaker: 'ミラ', text: '……終わらせてあげて！' },
      ],
      // 旧debrief(始祖宿主の長文報告/ワクチンデータ)は削除(指示書10)。最小文面のみ(統合正本15.3)。
      debrief: [
        '発信地点で、各地で遭遇していた二人と接触。',
        '男は変異し、排除された。',
        '女の身柄を保護。聴取を行う。',
      ],
      clearReport: [
        '発信地点で二人と接触。男は大型の変異体と化し、交戦の末に排除した。',
        '女の身柄を保護。本部で聴取を行う。',
      ],
    },
  },
  {
    // 統合正本10章 / 指示書8: EX=軍の正式な調査・排除任務。旧「洋館再訪(任意EXステージ)」構造は廃止
    // (再訪は stage-6 の［SUB］= REVISIT_MISSION へ移設)。解放=再訪で薬を使用後(storyFlags.medicineUsed)。
    id: 'stage-ex1',
    index: 101,
    kind: 'ex',
    name: '洋館跡地',
    area: 'クリア後 / 軍の正式任務',
    unlockBy: 'stage-7',
    day: 42,
    time: '03:40',
    timeLabel: '数日後／未明', // 統合正本5.2: 表示上の時間経過(数値日時へ変換しない)
    locationTitle: '旧市街地・洋館跡地',
    storyBossOnly: true, // 開始通信なし・現地到着後いきなり未確認変異体が出現し即戦闘(統合正本10.2)
    subs: [],
    main: {
      code: 'EX1',
      // 修正差分メモD-07(2026-07-16): EXの表示は全箇所「異常変異体」→「未確認変異体」。
      title: '未確認変異体調査',
      summary: '洋館跡地で確認された、既存分類に該当しない大型変異体を調査・排除する。',
      // 軍の出撃説明(統合正本10.1の確定2行)。
      synopsis: [
        '洋館跡地で既存分類に該当しない大型変異体を確認。',
        '現地へ向かい、対象を調査・排除せよ。',
      ],
      briefing: [
        '洋館跡地で既存分類に該当しない大型変異体を確認。',
        '現地へ向かい、対象を調査・排除せよ。',
      ],
      dialogue: [], // 開始通信なし(指示書8.3)
      // 任務報告(統合正本10.4の確定2行)。正体表示・説明はしない。
      debrief: [
        '未確認変異体を排除。',
        '発生原因は特定できず。',
      ],
      clearReport: [
        '未確認変異体を排除。',
        '発生原因は特定できず。',
      ],
    },
  },
  {
    id: 'stage-ex2',
    index: 102,
    kind: 'ex',
    name: '変異した洋館跡',
    area: 'クリア後 / 隠しステージ',
    unlockBy: 'stage-ex1',
    hidden: true, // 社長指示v0.25.1752「ex2は一旦非表示」。統合正本(2026-07-16)反映後は旧構想の残置データ
                  // (正史のEXは stage-ex1=異常変異体調査のみ)。導線なし・進行にも未使用。
    // 日時=DAY45/03:40は社長裁定v0.25.1751「そのまま とりあえず」の暫定確定値。
    day: 45,
    time: '03:40',
    locationTitle: '旧市街地・洋館跡地',
    subs: [],
    main: {
      code: 'EX2',
      title: '変異した洋館跡',
      summary: '異常反応の地点に潜む、巨大変異体を討伐する。',
      synopsis: [
        '新たな異常反応が検知された。',
        '地形は大きく変わっているが、構造はあの洋館周辺と酷似している。',
        '奥には、破壊された洋館のようなものがある。',
      ],
      briefing: [
        '新たに検知された異常反応の地点へ向かう。',
        '地形は大きく変わっている。',
        '一見、別の土地に見える。',
        'しかし構造は、あの洋館周辺と酷似している。',
        '奥には、破壊された洋館のようなものがある。',
        'そこに巨大な変異体がいる。',
      ],
      debrief: [
        '巨大変異体を討伐。',
        'それが何だったのかは明示されない。',
        'ただ、破壊された洋館跡と、冷凍保存室の残骸だけが残っていた。',
        'これで、すべての任務は完了となる。',
      ],
    },
  },
];

export const getStage = (id: string): Stage | undefined => STAGES.find(s => s.id === id);

// --- キャラクター(職業) ---------------------------------------------------
// 性能差は撤廃(全員同一性能)。違いは「初期装備」と「専用スキル」のみ。
// 立ち絵スプライト(128x108)の足元位置の微差を底ライン(影)へ揃えるための portraitNudgeY を保持。
const spriteVersion = encodeURIComponent(typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev');

export interface CharacterClassInfo {
  id: CharacterClass;
  name: string;
  sprite: string;
  accent: string;
  gear: string;
  skillKey: SubWeaponKey;
  skillDesc: string;
  charSkillDesc: string; // キャラ固有スキル(職名そのまま=name)の効果説明。選択時に自動有効。
  portraitNudgeY: number;
  profile: string; // 資料室用の人物紹介(ドラフト)
}

export const CHARACTER_CLASSES: CharacterClassInfo[] = [
  {
    id: 'warrior',
    name: 'ヘビーガンナー',
    sprite: `${import.meta.env.BASE_URL}sprites/player-shotgun-idle.png?v=${spriteVersion}`,
    accent: 'rgba(248, 113, 113, 0.55)',
    gear: 'ショットガン ＋ ハチェット',
    skillKey: 'heavy-grenade',
    skillDesc: '前方へ手榴弾を転がし、着弾で小範囲を爆破',
    charSkillDesc: '同一攻撃で2体以上に当てると、3秒間すべての爆発範囲が10%広がる',
    portraitNudgeY: 2.7,
    profile: '近距離での制圧を得意とする重火力兵。群れに飛び込み、退路をこじ開ける。',
  },
  {
    id: 'mage',
    name: 'マークスマン',
    sprite: `${import.meta.env.BASE_URL}sprites/player-magnum-idle.png?v=${spriteVersion}`,
    accent: 'rgba(168, 85, 247, 0.52)',
    gear: 'マグナム ＋ ナイフ',
    skillKey: 'marksman-trap',
    skillDesc: '足元に起爆トラップを設置して足止め＆爆破',
    charSkillDesc: '3秒以上移動を続けると移動速度が20%アップ。止まると解除',
    portraitNudgeY: 0,
    profile: '一撃の精度を信条とする狙撃手。トラップで戦場を区切り、確実に仕留める。',
  },
  {
    id: 'rogue',
    name: 'ストライカー',
    sprite: `${import.meta.env.BASE_URL}sprites/player-scavenger-idle.png?v=${spriteVersion}`,
    accent: 'rgba(52, 211, 153, 0.48)',
    gear: 'ハンドガン ＋ ファイティングナイフ',
    skillKey: 'striker-hunting',
    skillDesc: '近接の間合いを広げる狩猟術(チャージで強化)',
    charSkillDesc: '弾が切れた状態だと、近接攻撃力が1.5倍になる',
    portraitNudgeY: 0,
    profile: '接近戦に長けた前衛。狩猟術で間合いを支配し、変異体を捌き続ける。',
  },
  {
    id: 'necromancer',
    name: 'スカベンジャー',
    sprite: `${import.meta.env.BASE_URL}sprites/player-striker-idle.png?v=${spriteVersion}`,
    accent: 'rgba(129, 140, 248, 0.48)',
    gear: 'ハンドガン ＋ ハチェット',
    skillKey: 'striker-quick-mag',
    skillDesc: 'クイックリロードでマガジンを即装填',
    charSkillDesc: '弾薬を拾うと、3秒間銃のダメージが10%アップする',
    portraitNudgeY: 0.7,
    profile: '物資の確保と継戦に強い拾い屋。素早い再装填で火力を切らさない。',
  },
];

// キャラ固有サブウェポン(各キャラの職スキル枠)。キャラ固有スキル化に伴い、ショップでは扱わない。
export const CHARACTER_SUBWEAPON_KEYS: SubWeaponKey[] = [
  'heavy-grenade',   // ヘビーガンナー
  'marksman-trap',   // マークスマン
  'striker-hunting', // ストライカー
  'striker-quick-mag', // スカベンジャー
];

// 装備選択(サブウェポン)で選べる候補。スキルショップ(開発施設)の陳列とも共通。
export const SUB_WEAPON_KEYS: SubWeaponKey[] = [
  'heavy-grenade',
  'marksman-trap',
  'striker-hunting',
  'striker-quick-mag',
  'dog',
  'katana',
  'decoy',
  'shield',
  'whip',
  'alchemy',
  'turret',
  'shijin',
  'fire-knife',
  'drone-boomerang',
  'wire-anchor',
  'homing',
  'shadow-clone',
  'molotov',
  'first-aid-kit',
  'sensor-mine',
  'support-sniper',
  'flare-gun',
  'junk-weapon',
];

// 装備スキル(サブウェポンとは別系統のパッシブ能力)。最大2装備。入手はゴールドガチャ、装備は所持から2枠選択。
// rarity: normal/rare/super(超レア)。ガチャのレア度枠と装備UIの色分けに使用。
export type SkillRarity = 'normal' | 'rare' | 'super';
export const SKILL_KEYS: SkillKey[] = [
  'reaper', 'berserker', 'skater', 'overclock',
  'crit-up', 'knight', 'exploder', 'sharpshooter', 'sniper', 'ricochet',
  'bomber', 'fire-shooter', 'bomb-counter', 'punisher', 'combo-master',
  'knife-master', 'benkei', 'reflex', 'rescue-signal',
  'gold-rush', 'time-keeper', 'ghost-shooter', 'dog-run', 'counter-master', 'slasher',
  'attack-shooter', 'runner', 'seeker', 'scrap-builder',
  'magnet', 'last-magazine', 'warm-up',
];
export const SKILLS: Record<SkillKey, { name: string; desc: string; rarity: SkillRarity }> = {
  // 超レア
  'reaper':       { name: '死神',           desc: '近接フィニッシュ時、その攻撃範囲内の敵を全員フィニッシュ（ボスは即死せず5倍ダメージ）', rarity: 'super' },
  'berserker':    { name: 'バーサーカー',   desc: '失ったHP%だけ全攻撃が増加。代償として被ダメージ+20%', rarity: 'super' },
  'skater':       { name: 'スケーター',     desc: '移動速度3倍。ただし慣性が強くなり操作が難しくなる', rarity: 'super' },
  'overclock':    { name: 'オーバークロック', desc: 'サブウェポン発動時、20%の確率でクールダウンを即リセット(Lvで25%/30%)', rarity: 'super' },
  // レア
  'crit-up':      { name: 'クリティカルダメージ上昇', desc: 'クリティカルダメージ ×1.5→×2.0(ボス ×5→×5.5)', rarity: 'rare' },
  'knight':       { name: 'ナイト',         desc: '被ダメージ-20%。盾/召喚の最大HP+50%', rarity: 'rare' },
  'exploder':     { name: 'エクスプローダー', desc: '全ての爆発の範囲とダメージ+20%', rarity: 'rare' },
  'sharpshooter': { name: 'シャープシューター', desc: '銃弾の貫通+1', rarity: 'rare' },
  'sniper':       { name: 'スナイパー',     desc: '銃ダメージが停止中の敵/遠距離ほど増加', rarity: 'rare' },
  'ricochet':     { name: '跳弾',           desc: '命中弾が20%で近くの別の敵へ跳ねる(0.5倍)', rarity: 'rare' },
  'bomber':       { name: 'ボマー',         desc: '手榴弾の爆発時にミニ手榴弾を3個撒く', rarity: 'rare' },
  'fire-shooter': { name: 'ファイアシューター', desc: '発射の20%が爆発弾になる(裏CDあり)', rarity: 'rare' },
  'bomb-counter': { name: 'ボムカウンター', desc: 'カウンターの反射弾が爆発する', rarity: 'rare' },
  'punisher':     { name: 'パニッシャー',   desc: 'ノックバック中の敵が他の敵に当たると巻き込む(近接の半分ダメージ＋2倍ノックバック)', rarity: 'rare' },
  'combo-master': { name: 'コンボマスター', desc: '近接フィニッシュのコンボ窓延長＋コンボ中は全攻撃のダメージ増加', rarity: 'rare' },
  'knife-master': { name: 'ナイフマスター', desc: '近接ダメージのコンボでダメージ増加(+2%/hit, 最大+60%)。近接クリ率+20%。ただし弾薬ドロップ0%', rarity: 'rare' },
  'benkei':       { name: '弁慶',           desc: '武器を切り替えると10秒間クリティカル率+10%', rarity: 'rare' },
  'reflex':       { name: '反射神経',       desc: '被弾時に反撃の爆発(CDあり)', rarity: 'rare' },
  'rescue-signal':{ name: '救難信号',       desc: '近接ヒット時、一定確率で味方が援護攻撃(必中・倍率1)。ズーム演出', rarity: 'rare' },
  // 通常
  'gold-rush':    { name: 'ゴールドラッシュ', desc: 'ゴールドの獲得量+20%(Lvで+35%/+50%)。リザルト・宿敵討伐・クエスト報酬が対象', rarity: 'normal' },
  'time-keeper':  { name: 'タイムキーパー', desc: 'サブウェポンのクールダウン-30%', rarity: 'normal' },
  'ghost-shooter':{ name: 'ゴーストシューター', desc: '20%の確率で弾を消費しない', rarity: 'normal' },
  'dog-run':      { name: 'ドッグラン',     desc: '犬のクールダウン0・射程制限解除(犬装備時)', rarity: 'normal' },
  'counter-master':{ name: 'カウンターマスター', desc: 'カウンター窓延長＋成功時に周囲を強ノックバック', rarity: 'normal' },
  'slasher':      { name: 'スラッシャー',   desc: '近接命中後のタイミングリングをジャストタップで追撃(最大3連・各2/3減衰・ノックバック)', rarity: 'normal' },
  'attack-shooter':{ name: 'アタックシューター', desc: '銃ダメージ+10%(Lvで+20%/+30%)', rarity: 'normal' },
  'runner':       { name: 'ランナー',       desc: '移動速度+10%(Lvで+15%/+20%)。リロード中はさらに+10%', rarity: 'normal' },
  'seeker':       { name: 'シーカー',       desc: '被弾時に一定確率で3秒間半透明化し、通常敵から狙われなくなる(CD10秒)', rarity: 'normal' },
  'scrap-builder':{ name: 'スクラップビルダー', desc: '出撃開始時の初期スクラップ+50(Lvで+100/+150)。スクラップ取得量+10%(Lvで+20%/+30%)', rarity: 'normal' },
  'magnet':       { name: 'マグネット',     desc: '弾薬ピックアップの拾得範囲+10%(Lvで+20%/+30%)', rarity: 'normal' },
  'last-magazine':{ name: 'ラストマガジン', desc: '弾倉最後の1発のダメージ×2.0(Lvで×2.5/×3.0)。ショットガンは最終シェルの全ペレット', rarity: 'normal' },
  'warm-up':      { name: 'ウォームアップ', desc: '出撃から60秒間、移動速度+10%・リロード時間-20%・クリティカル率+20%', rarity: 'normal' },
};

// レベル別の説明。共通説明(base)は必ず残し、現在のLvの具体値(lv[])を併記する
// (いきなりLv2の数値だけ見せると意味が分からなくなるため)。lv が無いものはLv変化なし(Lv1固定)。
const SKILL_LEVEL_INFO: Partial<Record<SkillKey, { base: string; lv?: [string, string, string] }>> = {
  // 超レア
  'reaper':       { base: '近接フィニッシュ時、攻撃範囲内の敵を全員フィニッシュ（ボスは即死せず5倍ダメージ）' },
  'berserker':    { base: '失ったHP%だけ全攻撃が増加。代償として被ダメージ+20%', lv: ['増加量×1.0', '増加量×1.25', '増加量×1.5'] },
  'skater':       { base: '移動速度3倍。ただし慣性が強く操作が難しくなる', lv: ['慣性 強', '慣性 中', '慣性 弱（最も扱いやすい）'] },
  'overclock':    { base: 'サブウェポン発動時、一定確率でクールダウンを即リセット', lv: ['発動20%', '25%', '30%'] },
  // レア
  'crit-up':      { base: 'クリティカルダメージが上昇（ボスにも適用）', lv: ['×1.5', '×1.75', '×2.0'] },
  'knight':       { base: '被ダメージ減少＋盾/召喚の最大HP増加', lv: ['被ダメ-20%／召喚HP+50%', '被ダメ-30%／召喚HP+75%', '被ダメ-40%／召喚HP+100%'] },
  'exploder':     { base: '全ての爆発の範囲とダメージが増加', lv: ['+20%', '+35%', '+50%'] },
  'sharpshooter': { base: '銃弾の貫通が増加', lv: ['+1', '+2', '+3'] },
  'sniper':       { base: '銃ダメージが停止中の敵/遠距離ほど増加', lv: ['停止+最大50%／距離+最大50%', '+最大75%／+最大75%', '+最大100%／+最大100%'] },
  'ricochet':     { base: '命中弾が一定確率で近くの別の敵へ跳ねる', lv: ['20%・跳弾×0.5', '30%・×0.6', '40%・×0.7'] },
  'bomber':       { base: '手榴弾の爆発時にミニ手榴弾を3個撒く' },
  'fire-shooter': { base: '発射が一定確率で爆発弾になる（裏CDあり）', lv: ['20%', '25%', '30%'] },
  'bomb-counter': { base: 'カウンターの反射弾が爆発＋成立時に自分中心でも爆発', lv: ['ダメージ×1.0／範囲×1.0', '×1.25／×1.15', '×1.5／×1.3'] },
  'punisher':     { base: 'ノックバック中の敵が他の敵に当たると巻き込む（近接ダメージ＋ノックバック）', lv: ['ダメージ50%／KB×2', '70%／×2.5', '90%／×3'] },
  'combo-master': { base: '近接フィニッシュのコンボ窓延長＋コンボ中は全攻撃のダメージ増加', lv: ['+2%/combo(上限+50%)・窓+1.0s', '+3%/combo(上限+60%)・窓+1.5s', '+4%/combo(上限+70%)・窓+2.0s'] },
  'knife-master': { base: '近接コンボでダメージ増加＋近接クリ率上昇。ただし弾薬ドロップ0%', lv: ['+2%/hit(上限+40%)・近接クリ+10%', '+2%/hit(上限+50%)・+15%', '+4%/hit(上限+60%)・+20%'] },
  'benkei':       { base: '武器を切り替えるとクリティカル率が一時上昇', lv: ['+5%/10秒', '+10%/12秒', '+15%/15秒'] },
  'reflex':       { base: '被弾時に反撃の爆発（CDあり）', lv: ['ダメージ60／半径92／CD1.0s', '80／104／0.8s', '100／116／0.6s'] },
  'rescue-signal':{ base: '近接ヒット時、一定確率で味方が援護攻撃（必中・倍率1）', lv: ['発動10%', '発動15%', '発動20%'] },
  // 通常
  'gold-rush':    { base: 'ゴールドの獲得量が増加（リザルト・宿敵討伐・クエスト報酬。装備したランに適用）', lv: ['+20%', '+35%', '+50%'] },
  'time-keeper':  { base: 'サブウェポンのクールダウン減少', lv: ['-10%', '-20%', '-30%'] },
  'ghost-shooter':{ base: '一定確率で弾を消費しない', lv: ['10%', '20%', '30%'] },
  'dog-run':      { base: '犬のクールダウン短縮（犬装備時）', lv: ['CD-50%', 'CD0', 'CD0＋射程制限解除'] },
  'counter-master':{ base: 'カウンター窓延長＋成功時に周囲を強ノックバック', lv: ['窓+0.12s／KB×2', '+0.18s／×2.5', '+0.25s／×3'] },
  'slasher':      { base: '近接命中後のタイミングリングをジャストタップで追撃（各2/3減衰・ノックバック）', lv: ['最大1連', '最大2連', '最大3連'] },
  'attack-shooter':{ base: '銃ダメージが上昇', lv: ['+10%', '+20%', '+30%'] },
  'runner':       { base: '移動速度が上昇。リロード中はさらに+10%（Lv不問）', lv: ['+10%', '+15%', '+20%'] },
  'seeker':       { base: '被弾時に一定確率で3秒間半透明化し、通常敵から狙われなくなる（CD10秒）', lv: ['発動30%', '40%', '50%'] },
  'scrap-builder':{ base: '出撃開始時の初期スクラップが増え、スクラップ取得量も増加', lv: ['初期+50・取得+10%', '初期+100・取得+20%', '初期+150・取得+30%'] },
  'magnet':       { base: '弾薬ピックアップの拾得範囲が拡大（弾薬以外は従来どおり）', lv: ['+10%', '+20%', '+30%'] },
  'last-magazine':{ base: '弾倉最後の1発のダメージが増加（ショットガンは最終シェルの全ペレット）', lv: ['×2.0', '×2.5', '×3.0'] },
  'warm-up':      { base: '出撃から60秒間、移動速度+10%・リロード時間-20%・クリティカル率+20%' },
};
// 現在Lvに即した説明。共通説明＋「Lv○：具体値」を併記。Lv変化なしは共通説明のみ。
export const skillDescForLevel = (key: SkillKey, level: number): string => {
  const info = SKILL_LEVEL_INFO[key];
  if (!info) return SKILLS[key].desc; // フォールバック(未登録)
  if (!info.lv) return info.base;     // Lv1固定など段階変化なし
  const lv = Math.max(1, Math.min(info.lv.length, Math.floor(level || 1)));
  return `${info.base}（Lv${lv}：${info.lv[lv - 1]}）`;
};
export const MAX_EQUIPPED_SKILLS = 2;
// ガチャのレア度抽選: 基本 normal70 / rare25 / super5。super が出ない pull ごとに
// normal −5 / rare +4 / super +1 を蓄積(ソフト天井)。normal が 0 になる14pullで打ち止め
// (super19 / rare81 / normal0)。super が出たら基本へリセット。ハード天井(確定枠)なし。
export const GACHA_BASE_RARITY_WEIGHTS: Record<SkillRarity, number> = { normal: 70, rare: 25, super: 5 };
export const GACHA_PITY_MAX = 14; // normal が 0 になる pull 数(= super 19% で打ち止め)
// 「直近 super からの pull 数」pity からレア度重みを算出(純粋関数)。
export const rarityWeightsForPity = (pity: number): Record<SkillRarity, number> => {
  const c = Math.max(0, Math.min(GACHA_PITY_MAX, Math.floor(pity)));
  return { normal: 70 - 5 * c, rare: 25 + 4 * c, super: 5 + c };
};
export const skillsByRarity = (r: SkillRarity): SkillKey[] => SKILL_KEYS.filter(k => SKILLS[k].rarity === r);
// ガチャ1回の価格 / 重複時のレア度別返金額。// ※テスト用に一旦0円(無料)。本番は150想定。
export const GACHA_PULL_COST = 0;
export const GACHA_REFUND_BY_RARITY: Record<SkillRarity, number> = { normal: 10, rare: 30, super: 50 };
// レア度ごとの表示ラベルと色(装備UI/ガチャ結果で共用)。
export const RARITY_LABEL: Record<SkillRarity, string> = { normal: 'ノーマル', rare: 'レア', super: '超レア' };

// ガチャ(強化訓練)からは出さないスキル。死神(reaper)は「死神を倒すと習得」専用(社長指示)。
export const GACHA_EXCLUDED_SKILLS: SkillKey[] = ['reaper'];
// pity からレア度を抽選し SkillKey を返す(枠内均等。純粋関数)。pity は呼び出し側が管理。
export const rollGachaSkill = (pity = 0, rng: () => number = Math.random): SkillKey => {
  const weights = rarityWeightsForPity(pity);
  const total = weights.normal + weights.rare + weights.super;
  let r = rng() * total;
  let rarity: SkillRarity = 'normal';
  for (const tier of ['super', 'rare', 'normal'] as SkillRarity[]) {
    if (r < weights[tier]) { rarity = tier; break; }
    r -= weights[tier];
  }
  // 死神等はガチャ対象外。除外でその枠が空になったらレアへフォールバック。
  const pool = skillsByRarity(rarity).filter(k => !GACHA_EXCLUDED_SKILLS.includes(k));
  const safe = pool.length ? pool : skillsByRarity('rare').filter(k => !GACHA_EXCLUDED_SKILLS.includes(k));
  return safe[Math.floor(rng() * safe.length)] ?? safe[0];
};
// 現在の super 確率(%)と天井までの残り pull(可視化用)。
export const gachaSuperPercent = (pity: number): number => rarityWeightsForPity(pity).super;
export const gachaPityRemaining = (pity: number): number => Math.max(0, GACHA_PITY_MAX - Math.max(0, Math.floor(pity)));

// スキルの最大Lv。一部スキルはLv1固定(効果表でLv2/3が none のもの)。
export const SKILL_MAX_LEVEL: Partial<Record<SkillKey, number>> = { reaper: 1, bomber: 1, 'warm-up': 1 }; // warm-up=全Lv同値(固定)のためLv1止まり(§6.8 M31)
export const skillMaxLevel = (key: SkillKey): number => SKILL_MAX_LEVEL[key] ?? 3;
// Lv抽選: スキルごとの「被り回数(dupeCount)」とレア度で [Lv1,Lv2,Lv3] の重みを決める。
// 0回=初取得。被るほど高Lvが出やすくなる(社長確定表)。
export const levelWeightsFor = (rarity: SkillRarity, dupeCount: number): number[] => {
  const d = Math.max(0, Math.floor(dupeCount));
  if (rarity === 'super') {
    if (d === 0) return [70, 20, 10];
    if (d === 1) return [20, 60, 20];
    return [10, 30, 60];
  }
  if (rarity === 'rare') {
    if (d === 0) return [80, 15, 5];
    if (d === 1) return [70, 20, 10];
    if (d === 2) return [50, 40, 10];
    return [20, 40, 40];
  }
  // normal
  if (d === 0) return [80, 15, 5];
  if (d <= 2) return [70, 20, 10];
  if (d <= 5) return [50, 40, 10];
  return [20, 40, 40];
};
export const rollSkillLevel = (rarity: SkillRarity, dupeCount: number, maxLv: number, rng: () => number = Math.random): number => {
  const w = levelWeightsFor(rarity, dupeCount).slice(0, Math.max(1, maxLv));
  const total = w.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < w.length; i++) { if (r < w[i]) return i + 1; r -= w[i]; }
  return 1;
};
// 可視化: 次pullで現Lvより上が出る確率(=昇格確率, %)。dupeCount/レア度/現Lv/maxLv から算出。
export const gachaPromotePercent = (rarity: SkillRarity, curLv: number, dupeCount: number, maxLv: number): number => {
  if (curLv >= maxLv) return 0;
  const w = levelWeightsFor(rarity, dupeCount).slice(0, Math.max(1, maxLv));
  const total = w.reduce((a, b) => a + b, 0) || 1;
  // index i(0始まり)= Lv(i+1)。現Lv超え = index >= curLv。
  const above = w.slice(curLv).reduce((a, b) => a + b, 0);
  return Math.round((above / total) * 100);
};

// --- 資料室(世界観 / 変異体図鑑)のドラフト -------------------------------
export const WORLD_INTRO: string[] = [
  '軍用再生薬計画の事故をきっかけに、各地で「変異体」が発生した。',
  'それは死者の復活ではなく、生きたまま細胞が異常増殖を繰り返した姿だという。',
  '元は人間であった何か——その正体を追って、任務は続く。',
];

export interface BestiaryEntry {
  id: string;
  name: string;
  note: string;
}

export const BESTIARY: BestiaryEntry[] = [
  { id: 'zombie', name: '変異体(徘徊型)', note: '最も数の多い個体。群れで押し寄せる。' },
  { id: 'skeleton', name: '変異体(痩躯型)', note: '素早く、近接で詰めてくる。' },
  { id: 'werewolf', name: '変異体(獣化型)', note: '高速で突進する危険個体。' },
  { id: 'plant', name: '変異体(定着型)', note: '遠距離から攻撃。カウンターの的。' },
  { id: 'pumpkin', name: '変異体(肥大型)', note: '中ボス級。撃破で物資を落とす。' },
  { id: 'giantbat', name: '変異体(飛行型)', note: 'ステージ終盤に現れる大型個体。' },
  { id: 'reaper', name: '死神', note: '深奥リスクが高まると現れる、避けるべき存在。' },
];
