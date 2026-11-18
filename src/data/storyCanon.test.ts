import { describe, it, expect } from 'vitest';
import {
  STAGES, getStage, stageDateLabel, REVISIT_MISSION, REVISIT_MISSION_ID, SUB_RESCUE_MISSION,
  type Stage, type StageMission,
} from './campaign';
import { ENDING_HEADER, ENDING_SCRIPT, ENDING_FINAL_WORD } from './ending';
import { getArchiveRecord } from './storyArchive';
import {
  EVENT_QUEST_CONFIG, EVENT_QUEST_LINES_FORCED, EVENT_QUEST_ENCOUNTER_LINES,
  eventQuestSubAcceptLines, eventQuestSubCompleteLines,
} from '../utils/eventQuest';

// the ONE 統合正本(2026-07-16)/一括制作指示書12章の必須テスト。
// 確定台詞・親タイトルは一言一句の完全一致で機械化する(憲法テストと同じ発想)。

const st = (id: string): Stage => {
  const s = getStage(id);
  if (!s) throw new Error(`stage not found: ${id}`);
  return s;
};

describe('親ノード(日時・場所)の確定値(指示書2.3)', () => {
  it('全8親ノードの日時・場所が正確', () => {
    const expected: [string, string, string][] = [
      ['stage-1', 'DAY 26 / 16:20', '避難回廊'],
      ['stage-2', 'DAY 28 / 01:40', 'PHILL再生医療研究所'],
      ['stage-3', 'DAY 30 / 10:30', '東部医療科学センター'],
      ['stage-4', 'DAY 32 / 17:10', '北部封鎖区域'],
      ['stage-5', 'DAY 35 / 22:15', '対変異体防衛本部'],
      ['stage-6', '某日／未明', '旧市街地・洋館'],
      ['stage-7', 'DAY 38 / 04:20', '指定座標地点'],
      ['stage-ex1', '数日後／未明', 'EX 旧市街地・洋館'],
    ];
    for (const [id, date, loc] of expected) {
      const s = st(id);
      expect(stageDateLabel(s), id).toBe(date);
      expect(s.locationTitle, id).toBe(loc);
    }
  });

  it('M6/EXは意図的な曖昧表示(timeLabel)で、数値日時へ変換されない', () => {
    expect(st('stage-6').timeLabel).toBe('某日／未明');
    expect(st('stage-ex1').timeLabel).toBe('数日後／未明');
    // timeLabel未指定のステージは従来の数値表記のまま
    expect(stageDateLabel(st('stage-1'))).toMatch(/^DAY \d+ \/ \d{2}:\d{2}$/);
  });
});

// プレイヤー画面に出得る文字列を全部集める(code=開発番号は内部IDなので除外)。
const playerFacingStrings = (s: Stage): string[] => {
  const m: StageMission = s.main;
  return [
    s.name, s.locationTitle, s.timeLabel ?? '',
    m.title, m.summary,
    ...m.synopsis, ...m.briefing, ...m.debrief,
    ...(m.clearReport ?? []),
    ...(m.specialConditions ?? []),
    ...(m.specialEquipment ?? []),
    ...(m.voices ?? []).flatMap(v => [v.speaker, v.text]),
    ...(m.dialogue ?? []).map(d => d.text),
    ...s.subs.flatMap(sub => [sub.title, sub.desc]),
  ];
};

describe('開発番号の非露出(指示書12「M1〜M7番号がプレイヤー画面へ出ない」)', () => {
  it('可視ステージのプレイヤー向け文字列に M番号/EX番号が現れない', () => {
    for (const s of STAGES.filter(x => !x.hidden)) {
      for (const text of playerFacingStrings(s)) {
        expect(text, `${s.id}: ${text}`).not.toMatch(/M\d|EX\d/);
      }
    }
  });
});

describe('旧案文面の削除・置換監査(指示書10章)', () => {
  it('可視ステージにワクチン/息子/少年/蘇生/始祖宿主/腕足反復の旧案が残っていない', () => {
    // (旧「世界観」導入文 WORLD_INTRO は社長指示で削除済み=v0.25.1835・監査対象からも除外)
    const banned = ['ワクチン', '息子', '少年', '蘇生', '始祖宿主', '足でも生やそ', '助……て'];
    const texts = STAGES.filter(x => !x.hidden).flatMap(playerFacingStrings);
    for (const text of texts) {
      for (const word of banned) {
        expect(text, text).not.toContain(word);
      }
    }
  });

  it('腕台詞はM3差分正史(2026-07-17)で削除済み・M4でも反復しない', () => {
    // 旧統合正本ではM3 debriefに「腕でも生やそうとしたのか？」があったが、M0〜M3制作差分の
    // リザルト確定文面(STORY_M0_M3.md)には含まれない=差分が勝つ。
    expect(st('stage-3').main.debrief.join('')).not.toContain('生やそう');
    expect(st('stage-4').main.debrief.join('')).not.toContain('生やそう');
  });

  it('M6最終通信は確定稿(「薬が完成した」。ワクチンという語へ変更しない)', () => {
    expect(st('stage-6').main.debrief).toContain(
      '「変異体に対する薬が完成した。至急、回収に来て。時間がない」'
    );
  });

  it('M6ではフィル本人・保存槽・中身を見せない(修正差分メモD-05: 施錠された冷却区画の違和感のみ)', () => {
    const m6 = [...st('stage-6').main.debrief, ...(st('stage-6').main.clearReport ?? []),
      ...st('stage-6').main.synopsis, ...st('stage-6').main.briefing].join('');
    expect(m6).toContain('施錠された冷却設備付き');
    expect(m6).not.toMatch(/冷凍保存|保存槽|成人男性|フィル/);
  });
});

describe('M0〜M3制作差分(STORY_M0_M3.md・2026-07-17)の確定文面', () => {
  it('M0(チュートリアル): 出撃前説明・リザルト・序盤会話3行が完全一致', () => {
    const m0 = st('stage-tutorial').main;
    expect(m0.synopsis).toEqual([
      '正体不明の感染症が世界各地に広がっている。',
      '感染者は異常な形態変化を起こし、各地で被害が続いている。',
      '発生源とみられるPHILL再生医療研究所の座標を特定し、帰還せよ。',
    ]);
    expect(m0.debrief).toEqual([
      'グレッグは帰還しなかった。',
      'PHILL再生医療研究所の座標を特定。周辺の大型変異体を排除し、進路を確保する。',
    ]);
    // v0.25.2307(社長指示): 末尾のジュン「た、頼りにしてますからね！」を**削除**して3行にした。
    // ★v0.25.3542(社長裁定「bは『頼りにしてます！』に変更で」): **短くした形で復活**=4行。
    // 正史の文面は原則いじらないが、どちらも社長本人の裁定なので正本(STORY_M0_M3.md)にも注記がある。
    expect(m0.dialogue).toEqual([
      { speaker: 'グレッグ', text: 'お前が噂の耐性保持者か……' },
      { speaker: 'グレッグ', text: '感染しにくいんだって？　逆に気味が悪いな' },
      { speaker: 'ジュン', text: '心強いじゃないですか！' },
      { speaker: 'ジュン', text: '頼りにしてます！' },
    ]);
  });

  it('M1: 出撃前説明・リザルトが完全一致(旧・救助筋の無線/エドガー台詞は撤去)', () => {
    const m1 = st('stage-1').main;
    expect(m1.synopsis).toEqual([
      'PHILL再生医療研究所の座標を特定したが、周辺には大型変異体が確認されている。',
      'ヘリコプターでの接近は困難だ。',
      '機動部隊とともに対象を排除し、研究所への進路を確保せよ。',
    ]);
    expect(m1.debrief).toEqual([
      '大型変異体の排除を確認。',
      '先行調査隊が研究所への侵入に成功した。',
      '施設内の調査を続行する。',
    ]);
    expect(m1.voices).toBeUndefined();
    expect(m1.radio).toBeUndefined();
    // 正史ゲーム構造「通常ステージとして進行」=4拠点制圧イベントは外す(制圧システム自体は温存)
    expect(st('stage-1').mainEvent).toBeUndefined();
  });

  it('M2: 出撃前説明・リザルトが完全一致(clearReportはリザルトへ一本化)', () => {
    const m2 = st('stage-2').main;
    expect(m2.synopsis).toEqual([
      '先行調査隊は研究所内で壊滅。わずかに生還した隊員によれば、内部の変異体には通常兵器がほとんど通用しなかったという。',
      '作戦を変更する。試作銃「PHILLガン」を用いて単独潜入し、原因特定に必要な資料を回収せよ。',
    ]);
    expect(m2.debrief).toEqual([
      '研究所から「PHILL計画」の資料を回収した。',
      '事故直前、細胞増殖値は安全域を逸脱。一部の試験記録は削除されていた。',
      '共同研究先である東部医療科学センターへ解析協力を要請する。',
    ]);
    expect(m2.clearReport).toBeUndefined();
  });

  it('M3: 出撃前説明・リザルトが完全一致(東部医療科学センター表記)', () => {
    const m3 = st('stage-3').main;
    expect(m3.synopsis).toEqual([
      '解析を依頼していた東部医療科学センターとの通信が途絶えた。',
      '施設が襲撃されている可能性がある。',
      '現地へ向かい、共同研究員を救出せよ。',
    ]);
    expect(m3.debrief).toEqual([
      '共同研究員を救出。事故直前の細胞増殖値が、正常な再生の範囲を大きく超えていたことが分かった。',
      '任務中、ジュンが変異体の体液に曝露。回収した試薬を投与し、症状は一時的に安定した。',
      'ジュンを北部の医療チームへ隔離搬送する。',
    ]);
  });

  it('D-02 名称・用語統一: M0〜M3のプレイヤー向け文字列に旧称が残らない', () => {
    // 旧称・仮称の残留監査(M0〜M3スコープ限定。M4以降は統合正本のまま=別途裁定)。
    const banned = ['抗体部隊', '偵察部隊', '中枢データ', 'リモート研究', 'リモート共同研究所', '探査隊', '捜査隊', '機動隊とともに'];
    for (const id of ['stage-tutorial', 'stage-1', 'stage-2', 'stage-3']) {
      for (const text of playerFacingStrings(st(id))) {
        for (const word of banned) {
          expect(text, `${id}: ${text}`).not.toContain(word);
        }
      }
    }
    // 資料室の通信履歴レコードも正史名称へ
    expect(getArchiveRecord('mission-remote-lab-comm-log')?.title).toBe('東部医療科学センターとの通信履歴');
  });
});

describe('M7グレン戦直前・確定稿(指示書4.7「台詞順が完全一致」)', () => {
  // ★グレンの5行目「ココマデ・・・カ」(旧「ジカン……ダ」)は**社長指示v0.25.2462で意図的に削除**
  // (データが落ちたのではない)。以後グレンの発話は咆哮「グガガガガガガガガ！」だけ=表示終了後の出現合図に一本化。
  // このテストが赤くなっても**台詞を復活させないこと**——確定稿がこの5行。
  it('dialogue が確定5行と完全一致', () => {
    expect(st('stage-7').main.dialogue).toEqual([
      { speaker: 'グレン', text: 'きてくれたか……' },
      { speaker: 'ミラ', text: '本部が襲われたのは、私たちのせいなの' },
      { speaker: 'ミラ', text: 'でも、薬はできた' },
      { speaker: 'ミラ', text: '最後に、一つだけお願い' },
      { speaker: 'ミラ', text: '……終わらせてあげて！' },
    ]);
  });
  it('M7はストーリーボス専用(通常湧きなし)', () => {
    expect(st('stage-7').storyBossOnly).toBe(true);
    // PACING_PUZZLE.md §10-12#8(EXボス「フィル(変異体)」バッチ1): stage-ex1はstoryBossOnlyを
    // 廃止した(旧EXボス=giantbat流用のstoryBossOnly直行フローは撤去。中盤にスリィエルのゲート→
    // 撃破で最奥手前にphillboss出現、という通常ステージ寄りの構成へ変わった)。
    expect(st('stage-ex1').storyBossOnly).toBeUndefined();
  });
});

describe('二人組の確定会話(指示書4章)', () => {
  it('M1強制初遭遇=5行完全一致', () => {
    expect(EVENT_QUEST_LINES_FORCED).toEqual([
      { name: 'ミラ', text: 'この国の人？　助かったよ！' },
      { name: 'グレン', text: '俺はグレン。こいつはミラだ。礼を言う。では……' },
      { name: 'ミラ', text: '私たち、隣の国から任務で来たの！' },
      { name: 'グレン', text: 'こら、極秘だぞ' },
      { name: 'ミラ', text: 'わっ！　……またね！' },
    ]);
  });
  it('任意サブ1〜3の受注・完了(ステージ1/3/4)が確定稿と完全一致', () => {
    expect(eventQuestSubAcceptLines('stage-1')).toEqual([
      { name: 'グレン', text: 'またお前か。頼みがある。理由は聞くな' },
      { name: 'ミラ', text: 'そう！　血液サンプルで、こっちの薬が効くか調べたいんだよ！' },
      { name: 'グレン', text: '……' },
    ]);
    expect(eventQuestSubCompleteLines('stage-1')).toEqual([
      { name: 'ミラ', text: 'ありがと！　これ、報酬ね！' },
      { name: 'グレン', text: 'それ俺のだろ' },
    ]);
    expect(eventQuestSubAcceptLines('stage-3')).toEqual([
      { name: 'グレン', text: 'また会ったな。頼みがある。理由は聞くなよ' },
      { name: 'ミラ', text: '秘密だからね！　ちょっと変わった個体の血が必要で――' },
      { name: 'グレン', text: '……あっ、後ろに変異体だ！' },
      { name: 'ミラ', text: 'えっ、どこ！？' },
    ]);
    expect(eventQuestSubCompleteLines('stage-3')).toEqual([
      { name: 'グレン', text: '報酬はそうだなぁ……' },
      { name: 'ミラ', text: 'もう渡したよ！' },
      { name: 'グレン', text: 'また俺の……' },
    ]);
    expect(eventQuestSubAcceptLines('stage-4')).toEqual([
      { name: 'グレン', text: 'よく会うな。追っかけか？　まあいい、頼みがある' },
      { name: 'ミラ', text: 'うぐ……これは言ったら怒られるやつ……' },
      { name: 'グレン', text: '頼んだぞ' },
    ]);
    expect(eventQuestSubCompleteLines('stage-4')).toEqual([
      { name: 'グレン', text: '今日は俺の物を渡すなよ' },
      { name: 'ミラ', text: 'もう渡したよ！' },
      { name: 'グレン', text: '……' },
    ]);
  });
  it('M5は遭遇のみ(encounterOnly)・ミラ2行(グレンは発話しない)', () => {
    expect(EVENT_QUEST_CONFIG['stage-5'].encounterOnly).toBe(true);
    expect(EVENT_QUEST_CONFIG['stage-1'].encounterOnly).toBeUndefined();
    expect(EVENT_QUEST_ENCOUNTER_LINES).toEqual([
      { name: 'ミラ', text: 'なんか大変なことになった！' },
      { name: 'ミラ', text: 'と、とにかくありがとう！　どろん！' },
    ]);
    expect(EVENT_QUEST_ENCOUNTER_LINES.every(l => l.name === 'ミラ')).toBe(true);
  });
  it('任意サブ共通カード(3本とも同じタイトル・説明)がステージ1/3/4に付く', () => {
    expect(SUB_RESCUE_MISSION.title).toBe('身元不明民間人の救助');
    expect(SUB_RESCUE_MISSION.desc).toBe('変異体の出没地で、民間人2名が目撃されている。念のため救助に向かえ。');
    for (const id of ['stage-1', 'stage-3', 'stage-4']) {
      expect(st(id).subs, id).toEqual([SUB_RESCUE_MISSION]);
    }
    expect(st('stage-5').subs).toEqual([]);
  });
});

describe('通常エンディング(指示書5章)', () => {
  it('聴取記録の台本が確定稿と完全一致(サブ達成状況で本文を変えない=単一の台本)', () => {
    expect(ENDING_HEADER).toBe('［軍本部／聴取記録］');
    // v0.25.4239(2026-09-11)でノラの返答2つが「はい」→「……試験体」/「そうです」→「……」に(社長指示)。
    // 社長編集稿2026-08-29採用(v0.25.4063)。変更5行: 発起人の「だな」削除/フィル負傷行の言い回し/
    // 「止めさせるため」の?削除/「そうです…謝りたい」→「そうです」/最終質問を「フィルの救命を継続した理由は」へ。
    expect(ENDING_SCRIPT).toEqual([
        { speaker: '記録官', text: 'まず、本名を確認する' },
        { speaker: 'ミラ', text: 'ノラ・ソレル' },
        { speaker: '記録官', text: 'グレンと名乗っていた男は、グレアム・ケスラー。PHILL再生医療研究所の主任研究員。あなたたちは正体を隠して対変異体部隊に接触した' },
        { speaker: 'ノラ', text: '……はい' },
        { speaker: '記録官', text: '次に、PHILLの最終試験について。被験者の四名は、現在の対変異体部隊と一致している' },
        { speaker: 'ノラ', text: 'はい。死亡から数日以内で、適合基準を満たした四名の遺体を、極秘裏に研究所へ搬送しました' },
        { speaker: '記録官', text: 'その四名を、PHILLによって蘇生させたと' },
        { speaker: 'ノラ', text: 'はい。脳機能、臓器、血流は正常に回復しました。ただ、感情反応にわずかな鈍化が認められました' },
        { speaker: '記録官', text: '一度死亡した四名が、現在も任務に就いている。これが軍への正式採用を決めた最終試験だったわけだな' },
        { speaker: 'ノラ', text: 'そうです' },
        { speaker: '記録官', text: '技術の発見者はフィル・ケスラー。グレアムの息子で、あなたの婚約者' },
        { speaker: 'ノラ', text: '……はい' },
        { speaker: '記録官', text: 'PHILLは戦地で多くの重傷者を救った。フィル自身も派遣を志願したが、爆撃を受け、重傷を負った' },
        { speaker: 'ノラ', text: '……何度も止めたんです。でも、あの人は聞かなかった' },
        { speaker: '記録官', text: 'グレアムは息子を救うため、規定値を超える再生処置を行った。フィルの身体は再生を始めたが、細胞増殖は止まらなくなった' },
        { speaker: 'ノラ', text: 'はい。増殖を抑える方法を探して、グレアムは自分の身体を使った実験を始めました' },
        { speaker: '記録官', text: 'フィルの細胞を自らに移植し、正常組織と共存させてから再び戻す。その処置を繰り返した結果、フィルには正常な組織の再生が見られた。一方、グレアムの身体には異常細胞が蓄積していた' },
        { speaker: 'ノラ', text: 'はい……すぐに限界が来ることは、あの人も私も分かってた。それでも……' },
        { speaker: '記録官', text: 'あなたが開発した薬で、グレアムの変異の進行を遅らせていた。だが、彼の血液が別の研究者に接触し、研究所内で感染が拡大した。二人は研究所から逃亡している' },
        { speaker: 'ノラ', text: '……あのときは、もう逃げるしかありませんでした' },
        { speaker: '記録官', text: 'その後、対変異体部隊に接触したのは、グレアムが変異した場合に備えるため。そして、蘇生した四名の経過観察も兼ねていたということか' },
        { speaker: 'ノラ', text: '……あの四人は、フィルの……私たちの希望だった' },
        { speaker: '記録官', text: '研究所の崩壊後も、フィルの治療は続いていた。あれだけの犠牲を出して、なぜ続けた' },
        { speaker: 'ノラ', text: '……あの人は、戦争だらけのこの世界を、本気で救おうとしたんです！' },
        { speaker: 'ノラ', text: 'こんな事……こんな事、あの人にしか成し得なかった……！', en: 'He was the only ONE who could.' },
    ]);
    expect(ENDING_FINAL_WORD).toBe('成し得なかった');
  });
});

describe('資料「グレンの薬」(指示書6.1)と洋館再訪/EX(指示書7・8章)', () => {
  it('グレンの薬=確定文面。ステージ勝利のunlockedRecordIdsには載っていない(条件付き解放)', () => {
    const rec = getArchiveRecord('mission-glen-medicine');
    expect(rec?.title).toBe('グレンの薬');
    // 共有パッケージ2026-07-23(mission_record_glenn_medicine)の確定文面(旧: 修正差分メモD-10)。
    expect(rec?.body).toEqual([
      'ミラから託された未登録の薬剤。',
      '基礎処方と最終調合はグレンが担当し、ミラが分析と投与設計、検証を行った。',
      '特定の対象に合わせた形跡はあるが、何を治療するためのものなのか、効果も含めて分かっていない。',
    ]);
    for (const s of STAGES) {
      expect(s.main.unlockedRecordIds ?? [], s.id).not.toContain('mission-glen-medicine');
    }
  });

  it('再訪=秘密任務(clearReportなし・suppressDebriefで既存debriefフォールバックも抑止・通信なし)', () => {
    expect(REVISIT_MISSION_ID).toBe('stage-6:revisit');
    expect(REVISIT_MISSION.title).toBe('再訪');
    expect(REVISIT_MISSION.suppressDebrief).toBe(true);
    expect(REVISIT_MISSION.clearReport).toBeUndefined();
    expect(REVISIT_MISSION.debrief).toEqual([]);
    expect(REVISIT_MISSION.dialogue).toEqual([]);
    expect(REVISIT_MISSION.unlockedRecordIds).toBeUndefined();
  });

  it('EX=軍の正式任務(出撃説明・任務報告が確定2行/開始通信なし/ボス名にPHILL・フィルを使わない)', () => {
    const ex = st('stage-ex1').main;
    // 修正差分メモD-07(2026-07-16): EXの表示は全箇所「未確認変異体」(旧: 異常変異体)。
    expect(ex.title).toBe('未確認変異体調査');
    expect(ex.briefing).toEqual([
      '洋館で、既存分類に該当しない大型変異体が確認された。',
      '現地へ向かい、対象を調査・排除せよ。',
    ]);
    expect(ex.clearReport).toEqual(['未確認変異体を排除した。', '発生原因は特定できていない。']);
    expect(ex.dialogue).toEqual([]);
    // ボス表示は「未確認変異体」(useGameLoopのバナー)。ステージ文面にも PHILL/フィルの正体明示がなく、
    // 旧称「異常変異体」も残さない(D-07チェックリスト)。
    for (const text of playerFacingStrings(st('stage-ex1'))) {
      expect(text, text).not.toMatch(/フィル/);
      expect(text, text).not.toMatch(/異常変異体/);
    }
  });

  it('通常勝利の任務報告は維持(clearReportがあればそれ、無ければdebrief=非suppress。M6/M7は2026-11-18にdebriefへ一本化)', () => {
    for (const s of STAGES.filter(x => !x.hidden && x.kind === 'main')) {
      expect(s.main.suppressDebrief, s.id).not.toBe(true);
      const lines = s.main.clearReport?.length ? s.main.clearReport : s.main.debrief;
      expect(lines.length, s.id).toBeGreaterThan(0);
    }
  });
});
