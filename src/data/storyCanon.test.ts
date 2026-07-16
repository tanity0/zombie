import { describe, it, expect } from 'vitest';
import {
  STAGES, getStage, stageDateLabel, REVISIT_MISSION, REVISIT_MISSION_ID, SUB_RESCUE_MISSION,
  WORLD_INTRO, type Stage, type StageMission,
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
      ['stage-1', 'DAY 26 / 16:20', '東部避難回廊'],
      ['stage-2', 'DAY 28 / 01:40', 'PHILL再生医療研究所'],
      ['stage-3', 'DAY 30 / 10:30', '東部医療科学センター'],
      ['stage-4', 'DAY 32 / 17:10', '北部封鎖区域'],
      ['stage-5', 'DAY 35 / 22:15', '対変異体防衛本部'],
      ['stage-6', '某日／未明', '旧市街地・洋館'],
      ['stage-7', 'DAY 38 / 04:20', '指定座標地点'],
      ['stage-ex1', '数日後／未明', '旧市街地・洋館跡地'],
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
  it('可視ステージと世界観文にワクチン/息子/少年/蘇生/始祖宿主/腕足反復の旧案が残っていない', () => {
    const banned = ['ワクチン', '息子', '少年', '蘇生', '始祖宿主', '足でも生やそ', '助……て'];
    const texts = [
      ...STAGES.filter(x => !x.hidden).flatMap(playerFacingStrings),
      ...WORLD_INTRO,
    ];
    for (const text of texts) {
      for (const word of banned) {
        expect(text, text).not.toContain(word);
      }
    }
  });

  it('M3の腕台詞は確定稿どおり(M4では反復しない)', () => {
    expect(st('stage-3').main.debrief).toContain('「数値が異常だ。腕でも生やそうとしたのか？」');
    expect(st('stage-4').main.debrief.join('')).not.toContain('生やそう');
  });

  it('M6最終通信は確定稿(「薬が完成した」。ワクチンという語へ変更しない)', () => {
    expect(st('stage-6').main.debrief).toContain(
      'ミラ「こちらミラ。変異体に対する薬が完成した。至急、回収に来て。時間がない」'
    );
  });
});

describe('M7グレン戦直前・確定稿(指示書4.7「台詞順が完全一致」)', () => {
  it('dialogue が確定6行と完全一致', () => {
    expect(st('stage-7').main.dialogue).toEqual([
      { speaker: 'グレン', text: 'きてくれたか……' },
      { speaker: 'ミラ', text: '本部が襲われたのは、私たちのせいなの' },
      { speaker: 'ミラ', text: 'でも、薬はできた' },
      { speaker: 'ミラ', text: '最後に、一つだけお願い' },
      { speaker: 'グレン', text: 'ジカン……ダ' },
      { speaker: 'ミラ', text: '……終わらせてあげて！' },
    ]);
  });
  it('M7/EXはストーリーボス専用(通常湧きなし)', () => {
    expect(st('stage-7').storyBossOnly).toBe(true);
    expect(st('stage-ex1').storyBossOnly).toBe(true);
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
      { name: 'グレン', text: 'またお前か。頼みがある。極秘のミッションでな。理由は聞くな' },
      { name: 'ミラ', text: 'そう！　血液サンプルを持ち帰って、独自開発した製剤の有用性を極秘で調べるんだよ！' },
      { name: 'グレン', text: '……' },
    ]);
    expect(eventQuestSubCompleteLines('stage-1')).toEqual([
      { name: 'ミラ', text: 'ありがと！　これ、報酬ね！' },
      { name: 'グレン', text: 'それ俺のだろ' },
    ]);
    expect(eventQuestSubAcceptLines('stage-3')).toEqual([
      { name: 'グレン', text: 'また会ったな。実は頼みがある。理由は聞くなよ' },
      { name: 'ミラ', text: '秘密だからね！　通常個体とは違う血液が、こっちの試料にどう反応するか――' },
      { name: 'グレン', text: '……あっ、後ろに変異体だ、ミラ！' },
      { name: 'ミラ', text: 'わっ！　どこ！？' },
    ]);
    expect(eventQuestSubCompleteLines('stage-3')).toEqual([
      { name: 'グレン', text: '報酬はそうだなぁ……' },
      { name: 'ミラ', text: 'もう渡したよ！' },
      { name: 'グレン', text: 'また俺の……' },
    ]);
    expect(eventQuestSubAcceptLines('stage-4')).toEqual([
      { name: 'グレン', text: 'よく会うな。追っかけか？　まあいい、頼みがある' },
      { name: 'ミラ', text: 'うぐ……めっちゃ怒られるから、理由は言えないの……' },
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
    expect(SUB_RESCUE_MISSION.desc).toBe('変異体出没地にて2名の民間人の目撃証言有り。念の為救助に当たれ。');
    for (const id of ['stage-1', 'stage-3', 'stage-4']) {
      expect(st(id).subs, id).toEqual([SUB_RESCUE_MISSION]);
    }
    expect(st('stage-5').subs).toEqual([]);
  });
});

describe('通常エンディング(指示書5章)', () => {
  it('聴取記録の台本が確定稿と完全一致(サブ達成状況で本文を変えない=単一の台本)', () => {
    expect(ENDING_HEADER).toBe('［軍本部／聴取記録］');
    expect(ENDING_SCRIPT).toEqual([
      { speaker: '記録官', text: '本名は' },
      { speaker: '女', text: 'ノラ' },
      { speaker: '記録官', text: 'グレンと名乗っていた男は、研究所主任グレアム・ケスラーか' },
      { speaker: 'ノラ', text: 'はい' },
      { speaker: '記録官', text: '研究所の資料から、感染の起点はグレンだったと断定したが？' },
      { speaker: 'ノラ', text: 'はい' },
      { speaker: '記録官', text: 'なぜそのまま研究所を後にした？' },
      { speaker: 'ノラ', text: '研究を止められるわけにはいかなかった' },
      { speaker: '記録官', text: '洋館の保存槽にいた男を戻すためか。彼は？' },
      { speaker: 'ノラ', text: 'グレンの息子。そして私の婚約者' },
      { speaker: '記録官', text: '名前は' },
    ]);
    expect(ENDING_FINAL_WORD).toBe('PHILL');
  });
});

describe('資料「グレンの薬」(指示書6.1)と洋館再訪/EX(指示書7・8章)', () => {
  it('グレンの薬=確定文面。ステージ勝利のunlockedRecordIdsには載っていない(条件付き解放)', () => {
    const rec = getArchiveRecord('mission-glen-medicine');
    expect(rec?.title).toBe('グレンの薬');
    expect(rec?.body).toEqual([
      'ミラから託された未登録薬剤。',
      '変異体を治療するためのものなのか、グレンが最後に調合したと思われる薬。現状は効果不明。',
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
    expect(ex.title).toBe('異常変異体調査');
    expect(ex.briefing).toEqual([
      '洋館跡地で既存分類に該当しない大型変異体を確認。',
      '現地へ向かい、対象を調査・排除せよ。',
    ]);
    expect(ex.clearReport).toEqual(['異常変異体を排除。', '発生原因は特定できず。']);
    expect(ex.dialogue).toEqual([]);
    // ボス表示は「異常変異体」(useGameLoopのバナー)。ステージ文面にも PHILL/フィルの正体明示がない。
    for (const text of playerFacingStrings(st('stage-ex1'))) {
      expect(text, text).not.toMatch(/フィル/);
    }
  });

  it('通常勝利の任務報告は維持(M2/M6/M7はclearReport、他はdebriefフォールバック=非suppress)', () => {
    for (const s of STAGES.filter(x => !x.hidden && x.kind === 'main')) {
      expect(s.main.suppressDebrief, s.id).not.toBe(true);
      const lines = s.main.clearReport?.length ? s.main.clearReport : s.main.debrief;
      expect(lines.length, s.id).toBeGreaterThan(0);
    }
  });
});
