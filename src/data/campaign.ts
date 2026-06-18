// キャンペーン(ストーリー / ステージ / ミッション)のデータ正本。
// UIデザインは後追いで詰める前提なので、ここには「内容(導線に必要なデータ)」だけを置き、
// 見た目は画面コンポーネント側で持つ。文章は差し替え前提のドラフト(社長提供の本文を反映)。
//
// 進行ルール:
// - ステージ1〜7はメインミッション(M1〜M7)をクリアすると次が解放される。
// - EX1/EX2 はクリア後の任意イベント(隠しステージ)。EX1 は M7 クリアで、EX2 は EX1 クリアで解放。
// - 各ステージには複数のサブミッションがぶら下がる予定(今はメインのみ並べる。後で差し替え)。
// - ゲームプレイは当面ステージ1の内容を流用(後で各ステージ用に差し替える)。

import type { CharacterClass, SubWeaponKey, SkillKey, IntroLine } from '../types/game';

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
  indoor?: boolean;      // 屋内(研究施設)ステージ=手書き壁マップ/カメラクランプ/湧き抑制
}

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
    subs: [],
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
        { speaker: '偵察兵', text: '……聞こえるか！ くそ、弾がねぇ！' },
        { speaker: '偵察兵', text: 'グレッグ……！ ちくしょう、助け……' },
      ],
      debrief: [
        '偵察部隊の生存者を救助。',
        '研究所の座標データを回収した。',
        '研究所奪還作戦が開始される。',
      ],
      // ゲーム内の登場会話(時間停止・オートタイプ)。M1のみ実装、他ミッションは今後。
      dialogue: [
        { speaker: '通信兵', text: '緊急通信。任務を一時中断する' },
        { speaker: '通信兵', text: '研究所から帰還中の偵察部隊が、変異体に包囲された' },
        { speaker: '通信兵', text: '現在地から近い。座標を送る。救助を優先してくれ' },
        { speaker: '__radio__', text: '', holdMs: 1500 },
        { speaker: '偵察兵', text: '……聞こえるか! くそ、弾がねぇ!' },
        { speaker: '偵察兵', text: 'グレッグ……! ちくしょう、助け……' },
      ],
    },
  },
  {
    id: 'stage-2',
    index: 2,
    kind: 'main',
    name: '研究所跡',
    area: '壊滅した研究所 / 中枢データ回収',
    unlockBy: 'stage-1',
    subs: [],
    indoor: true, // 研究所=屋内ステージ(labMap で壁/カードキー/ゴール)。
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
        'ただし、事故直前の自己投与ログは欠損していた。',
      ],
    },
  },
  {
    id: 'stage-3',
    index: 3,
    kind: 'main',
    name: 'リモート研究施設',
    area: '連携研究施設 / 責任者 救出',
    unlockBy: 'stage-2',
    subs: [],
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
    subs: [],
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
        '研究資料を見た医師は、変異体の正体に気づいた。',
        '「足でも生やそうとしているのか？」',
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
        '救助活動も、ワクチン計画も止まる。',
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
    subs: [],
    main: {
      code: 'M6',
      title: '古い洋館',
      summary: '変異体の発生源と疑われる古い洋館へ向かい、内部を確認する。',
      synopsis: [
        'M5で現れた変異体たちの経路を逆算した結果、特定地域から来ている個体が多いことが判明した。',
        'その地域には古い洋館がある。',
        '内部には、外観と不釣り合いな最新設備が確認されている。',
      ],
      radio: true,
      briefing: [
        'M5で現れた変異体たちの経路を逆算した。',
        '複数の個体が、ある特定の地域から来ている。',
        'その地域には、古い洋館がある。',
        '表向きはただの廃屋。',
        'しかし内部には、明らかに不釣り合いな最新設備がある可能性が高い。',
        '確認に向かう。',
      ],
      debrief: [
        '洋館内部を確認。',
        'そこには研究所外の私設ラボと思われる設備があった。',
        '再生薬計画とは別の実験が行われていた痕跡がある。',
        '死亡記録のある人間が、実験対象に含まれていた可能性も確認された。',
        'さらに、主人公たちと一致する実験ログの断片を発見。',
        '詳細は欠損している。',
        '直後、軍用暗号通信に不明な救難信号を受信。',
        '「助……て……！ ワクチン……！」',
        '暗号化された通信網を使っている。',
        '発信者は軍関係者、または軍用キーを持つ人物の可能性が高い。',
        '逆探知した地点へ向かう。',
      ],
    },
  },
  {
    id: 'stage-7',
    index: 7,
    kind: 'main',
    name: '逆探知地点',
    area: '救難信号 発信地点 / 二人組',
    unlockBy: 'stage-6',
    subs: [],
    main: {
      code: 'M7',
      title: '逆探知地点',
      summary: '謎の救難信号を逆探知。発信地点へ向かい、その正体と対峙する。',
      synopsis: [
        'M6の最後に、軍用暗号通信へ不明な救難信号が入った。',
        '内容は断片的だが、ワクチンに関わる可能性がある。',
        '抗体部隊は逆探知した発信地点へ向かう。',
      ],
      briefing: [
        '不明な救難信号の発信地点を逆探知した。',
        '発信者は軍用暗号網を使用している。',
        '内容は断片的だが、ワクチンに関わる可能性がある。',
        '無視はできない。',
        '現地へ向かう。',
        'そこには、これまで各地で出会っていた二人がいる。',
      ],
      debrief: [
        '男は、死亡認定されていた軍用再生薬計画の主任研究者だった。',
        'そして、現在も変異を続ける始祖宿主だった。',
        '女は、男と行動を共にしながら、その変異データを記録していた。',
        '男は限界を迎え、完全変異する。',
        '女はワクチンに必要な最後のデータを渡す。',
        'そして、男を止めるよう頼む。',
        '男は倒された。',
        'ワクチン完成に必要な情報は揃った。',
        'エンディングへ。',
      ],
    },
  },
  {
    id: 'stage-ex1',
    index: 101,
    kind: 'ex',
    name: '洋館再訪',
    area: 'クリア後 / 任意イベント',
    unlockBy: 'stage-7',
    subs: [],
    main: {
      code: 'EX1',
      title: '洋館再訪',
      summary: '洋館の未確認区画へ。冷凍保存設備を調べる（任意）。',
      synopsis: [
        'ワクチンを受け取った。',
        'だが、男が最後に残した言葉がある。',
        '洋館には、まだ確認していない冷凍保存設備が残っている。',
      ],
      briefing: [
        'ワクチンを受け取った。',
        'だが、あの男の最後の言葉が残っている。',
        '「頼む……息子を……」',
        '洋館には、まだ確認していない冷凍保存設備がある。',
        '向かうかどうかは任意。',
      ],
      debrief: [
        '冷凍保存された少年を確認。',
        'ワクチンを使用した。',
        '反応はあった。',
        'しかし、それが成功だったのかは分からない。',
        '新たな異常反応を検知。',
        '別ステージが解放された。',
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
  portraitNudgeY: number;
  profile: string; // 資料室用の人物紹介(ドラフト)
}

export const CHARACTER_CLASSES: CharacterClassInfo[] = [
  {
    id: 'warrior',
    name: 'ヘビーガンナー',
    sprite: `${import.meta.env.BASE_URL}sprites/player-shotgun-walk-0.png?v=${spriteVersion}`,
    accent: 'rgba(248, 113, 113, 0.55)',
    gear: 'ショットガン ＋ ハチェット',
    skillKey: 'heavy-grenade',
    skillDesc: '前方へ手榴弾を転がし、着弾で小範囲を爆破',
    portraitNudgeY: 2.7,
    profile: '近距離での制圧を得意とする重火力兵。群れに飛び込み、退路をこじ開ける。',
  },
  {
    id: 'mage',
    name: 'マークスマン',
    sprite: `${import.meta.env.BASE_URL}sprites/player-magnum-walk-0.png?v=${spriteVersion}`,
    accent: 'rgba(168, 85, 247, 0.52)',
    gear: 'マグナム ＋ ナイフ',
    skillKey: 'marksman-trap',
    skillDesc: '足元に起爆トラップを設置して足止め＆爆破',
    portraitNudgeY: 0,
    profile: '一撃の精度を信条とする狙撃手。トラップで戦場を区切り、確実に仕留める。',
  },
  {
    id: 'rogue',
    name: 'ストライカー',
    sprite: `${import.meta.env.BASE_URL}sprites/player-scavenger-walk-0.png?v=${spriteVersion}`,
    accent: 'rgba(52, 211, 153, 0.48)',
    gear: 'ハンドガン ＋ ファイティングナイフ',
    skillKey: 'striker-hunting',
    skillDesc: '近接の間合いを広げる狩猟術(チャージで強化)',
    portraitNudgeY: 0,
    profile: '接近戦に長けた前衛。狩猟術で間合いを支配し、変異体を捌き続ける。',
  },
  {
    id: 'necromancer',
    name: 'スカベンジャー',
    sprite: `${import.meta.env.BASE_URL}sprites/player-striker-walk-0.png?v=${spriteVersion}`,
    accent: 'rgba(129, 140, 248, 0.48)',
    gear: 'ハンドガン ＋ ハチェット',
    skillKey: 'striker-quick-mag',
    skillDesc: 'クイックリロードでマガジンを即装填',
    portraitNudgeY: 0.7,
    profile: '物資の確保と継戦に強い拾い屋。素早い再装填で火力を切らさない。',
  },
];

// 装備選択(サブウェポン)で選べる候補。スキルショップ(武器開発)の陳列とも共通。
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
];

// 装備スキル(サブウェポンとは別系統のアクティブ能力)。最大2装備。
// ※効果は今後配線(プレースホルダ)。ここでは選択肢/表示名/説明のみ定義する。
export const SKILL_KEYS: SkillKey[] = ['adrenaline', 'emp-pulse', 'nano-heal', 'overload'];
export const SKILLS: Record<SkillKey, { name: string; desc: string }> = {
  'adrenaline': { name: 'アドレナリン', desc: '一定時間、移動と攻撃が速くなる（効果は今後実装）' },
  'emp-pulse':  { name: 'EMPパルス',   desc: '周囲の敵を短時間スタンさせる（効果は今後実装）' },
  'nano-heal':  { name: 'ナノヒール',   desc: '体力を即時回復する（効果は今後実装）' },
  'overload':   { name: 'オーバーロード', desc: '一定時間、与ダメージが上がる（効果は今後実装）' },
};
export const MAX_EQUIPPED_SKILLS = 2;

// --- 資料室(世界観 / 変異体図鑑)のドラフト -------------------------------
export const WORLD_INTRO: string[] = [
  '軍用再生薬計画の事故をきっかけに、各地で「変異体」が発生した。',
  'それは死者の復活ではなく、生きたまま細胞が異常増殖を繰り返した姿だという。',
  '元は人間であった何か——その正体と、ワクチンの行方を追って、任務は続く。',
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
