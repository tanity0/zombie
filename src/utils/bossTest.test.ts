// ボス戦テストメニュー(bossTest.ts)のユニット。カタログの固定表が実設定(campaign.tsのhiddenBoss/
// ENGAGEABLE_BOSS_TYPES)とズレたら落ちる突き合わせ+URL合成の検証。
import { describe, it, expect } from 'vitest';
import {
  BOSS_TEST_ENTRIES, bossTestQuery, bossTestGhostSkill, parseBossTestMode,
  canForceGateBossNow, type GateBossGateState,
  BOSS_MAKER_BOSSES, BOSS_MAKER_CASTLE_STAGES, BOSS_MAKER_STAGE, bossMakerQuery, parseBossMakerGlenForm2,
  bossMakerStageFor, parseBossMakerBoss,
} from './bossTest';
import { CASTLE_BOSS_NAME_BY_STAGE, bossCutinName } from '../data/bossCutin';
import { ENGAGEABLE_BOSS_TYPES } from './bossEngagement';
import { getStage } from '../data/campaign';

describe('BOSS_TEST_ENTRIES(カタログの整合)', () => {
  it('裏ボス(bossnow)のステージ対応は campaign.ts の hiddenBoss と一致する', () => {
    for (const e of BOSS_TEST_ENTRIES.filter(e => e.param === 'bossnow')) {
      expect(getStage(e.stageId)?.hiddenBoss).toBe(e.boss);
    }
  });

  it('全エントリのステージは実在する', () => {
    for (const e of BOSS_TEST_ENTRIES) {
      expect(getStage(e.stageId), e.stageId).toBeDefined();
    }
  });

  it('掲載ボスは全て守護霊の交戦対象(ENGAGEABLE)=守護霊テストの対象網羅', () => {
    for (const e of BOSS_TEST_ENTRIES) {
      expect(ENGAGEABLE_BOSS_TYPES.has(e.boss), e.boss).toBe(true);
    }
  });

  it('ENGAGEABLEの全ボス型がカタログに1件以上ある(取りこぼしなし)', () => {
    const listed = new Set(BOSS_TEST_ENTRIES.map(e => e.boss));
    for (const t of ENGAGEABLE_BOSS_TYPES) {
      expect(listed.has(t), t).toBe(true);
    }
  });
});

describe('bossTestQuery(URL合成)', () => {
  const entry = { boss: 'mimir', stageId: 'stage-1', param: 'bossnow' } as const;

  it('smoke/stage/強制フラグ/class/retryが常に入る', () => {
    const q = new URLSearchParams(bossTestQuery(entry, { characterClass: 'rogue', ghostMode: null, ghostlog: false }));
    expect(q.get('smoke')).toBe('1');
    expect(q.get('stage')).toBe('stage-1');
    expect(q.get('bossnow')).toBe('1');
    expect(q.get('class')).toBe('rogue');
    expect(q.get('retry')).toBe('1');
    expect(q.get('ghost')).toBeNull();
    expect(q.get('ghostmode')).toBeNull();
    expect(q.get('ghostlog')).toBeNull();
  });

  it('守護霊3択とghostlogをURLへ載せる', () => {
    const q = new URLSearchParams(bossTestQuery(entry, { characterClass: 'warrior', ghostMode: 'random', ghostlog: true }));
    expect(q.get('ghost')).toBe('1');
    expect(q.get('ghostmode')).toBe('random');
    expect(q.get('ghostlog')).toBe('1');
  });

  // PACING_PUZZLE.md §6.38 B1(賞金首): param=bountynowの時だけbountytypeをURLへ載せる。
  it('賞金首エントリはbountytypeをURLへ載せる(param!==bountynowでは載せない)', () => {
    const q = new URLSearchParams(bossTestQuery(
      { boss: 'bounty-melee', stageId: 'stage-1', param: 'bountynow', bountyType: 'melee' },
      { characterClass: 'warrior', ghostMode: null, ghostlog: false },
    ));
    expect(q.get('bountynow')).toBe('1');
    expect(q.get('bountytype')).toBe('melee');
    // 通常エントリ(bountyType未指定)ではbountytypeを載せない。
    expect(new URLSearchParams(bossTestQuery(entry, { characterClass: 'warrior', ghostMode: null, ghostlog: false })).get('bountytype')).toBeNull();
  });

  it('3択を本番と同じスキルへ変換し、旧URLは守護霊へ戻す', () => {
    expect(bossTestGhostSkill('?ghost=1&ghostmode=own')).toBe('guardian-spirit');
    expect(bossTestGhostSkill('?ghost=1&ghostmode=random')).toBe('ghost-helper');
    expect(bossTestGhostSkill('?ghost=1&ghostmode=top')).toBe('ghost-slayer');
    expect(bossTestGhostSkill('?ghost=1')).toBe('guardian-spirit');
    expect(bossTestGhostSkill('?ghostmode=top')).toBeNull();
  });
});

describe('parseBossTestMode(現在モードの判定・社長指示「いまどのモードか出しといて」)', () => {
  it('素のURL=通常モード', () => {
    const m = parseBossTestMode('');
    expect(m.active).toBe(false);
    expect(m.params).toEqual([]);
  });

  it('テスト出撃のURL=activeで内訳(フラグ/ステージ/守護霊)が取れる', () => {
    const q = bossTestQuery({ boss: 'mimir', stageId: 'stage-1', param: 'bossnow' }, { characterClass: 'warrior', ghostMode: 'top', ghostlog: false });
    const m = parseBossTestMode(q);
    expect(m.active).toBe(true);
    expect(m.params).toEqual(['bossnow']);
    expect(m.stageId).toBe('stage-1');
    expect(m.ghost).toBe(true);
    expect(m.ghostMode).toBe('top');
  });

  it('?ghost=1単独の残留もactiveとして検出する', () => {
    const m = parseBossTestMode('?ghost=1');
    expect(m.active).toBe(true);
    expect(m.params).toEqual([]);
    expect(m.ghost).toBe(true);
  });
});

// ==== v0.25.2611: 走り込み入場中にボスを出さない(社長報告「すりぃえるのボスモードで何もできない」) ====
describe('canForceGateBossNow — ?gateboss=1 の発火ゲート', () => {
  const ok = (): GateBossGateState => ({
    forceParamOn: true, alreadySpawned: false, danceTest: false,
    indoor: false, labTheme: false, corridorRunInActive: false, gameWon: false,
  });

  it('通常条件では発火する', () => {
    expect(canForceGateBossNow(ok())).toBe(true);
  });

  it('【本件の再発防止】洋館の走り込み入場中は発火しない', () => {
    // 走り込み中は入力が奪われている(isInputLocked)。そこへ拘束サークル+ボスを出すと
    // 「強制的に上へ歩かされながら殴られ続ける」状態になる。しかも拘束サークルが
    // 走り込みの解除条件(y<=0到達)を構造的に阻むため、6秒の安全弁まで操作不能だった。
    expect(canForceGateBossNow({ ...ok(), corridorRunInActive: true })).toBe(false);
  });

  it('走り込みが終われば発火する(出さないのではなく「待つ」)', () => {
    const during = { ...ok(), corridorRunInActive: true };
    expect(canForceGateBossNow(during)).toBe(false);
    expect(canForceGateBossNow({ ...during, corridorRunInActive: false })).toBe(true);
  });

  it('既存のガードは従来どおり(パラメータOFF/二重出現/ダンス/屋内/ラボ/クリア後)', () => {
    expect(canForceGateBossNow({ ...ok(), forceParamOn: false })).toBe(false);
    expect(canForceGateBossNow({ ...ok(), alreadySpawned: true })).toBe(false);
    expect(canForceGateBossNow({ ...ok(), danceTest: true })).toBe(false);
    expect(canForceGateBossNow({ ...ok(), indoor: true })).toBe(false);
    expect(canForceGateBossNow({ ...ok(), labTheme: true })).toBe(false);
    expect(canForceGateBossNow({ ...ok(), gameWon: true })).toBe(false);
  });

  it('どのガードも単独で発火を止められる(AND条件であることの固定)', () => {
    const keys: (keyof GateBossGateState)[] = ['alreadySpawned', 'danceTest', 'indoor', 'labTheme', 'corridorRunInActive', 'gameWon'];
    for (const k of keys) {
      expect(canForceGateBossNow({ ...ok(), [k]: true }), `${k} がガードになっていない`).toBe(false);
    }
  });
});

// ★城ボスをボスメーカーへ(社長指摘2026-09-25「ボスメーカーに城ボスたちがいない」・v0.25.4639)。
// 城ボスは**1つの型(giantbat)でステージごとに別人**(絵も台本も stageId で決まる)ので、
// **部屋をそのステージで立てる**のがこの機能の肝。ここが崩れると「全部ステージ1のボス」に戻る。
describe('★ボスメーカーの城ボス', () => {
  const OPTS = { characterClass: 'warrior', ghostMode: null, ghostlog: false } as const;

  it('城ボスの並びは表示名の台帳と同じ(2箇所に書かない)', () => {
    expect([...BOSS_MAKER_CASTLE_STAGES]).toEqual(Object.keys(CASTLE_BOSS_NAME_BY_STAGE));
    expect(BOSS_MAKER_CASTLE_STAGES.length).toBeGreaterThan(1);
  });

  it('どのステージにも表示名がある(ボタンが「?」にならない)', () => {
    for (const sid of BOSS_MAKER_CASTLE_STAGES) {
      expect(bossCutinName('giantbat', sid), sid).toBeTruthy();
    }
  });

  it('giantbat は部屋のボスとして選べる(?makerboss= が通る)', () => {
    expect(BOSS_MAKER_BOSSES).toContain('giantbat');
    expect(parseBossMakerBoss('?makerboss=giantbat')).toBe('giantbat');
  });

  it('★部屋はそのボスのステージで立つ(城ボスだけ固定ステージを上書き)', () => {
    for (const sid of BOSS_MAKER_CASTLE_STAGES) {
      const q = new URLSearchParams(bossMakerQuery(OPTS, 'giantbat', sid));
      expect(q.get('stage'), sid).toBe(sid);
      expect(q.get('makerboss'), sid).toBe('giantbat');
      expect(q.get('bossmaker'), sid).toBe('1');
      expect(q.get('nospawn'), sid).toBe('1');
    }
  });

  it('★グレン第二形態は stage-7 の城ボスでだけ立つ(?glenform=2)', () => {
    const q2 = bossMakerQuery(OPTS, 'giantbat', 'stage-7', true);
    expect(new URLSearchParams(q2).get('glenform')).toBe('2');
    expect(parseBossMakerGlenForm2(q2)).toBe(true);
    // 形態1(既定)・他ステージ・他のボスでは付かない
    expect(parseBossMakerGlenForm2(bossMakerQuery(OPTS, 'giantbat', 'stage-7'))).toBe(false);
    expect(new URLSearchParams(bossMakerQuery(OPTS, 'giantbat', 'stage-3', true)).get('glenform')).toBeNull();
    expect(new URLSearchParams(bossMakerQuery(OPTS, 'idol', 'stage-7', true)).get('glenform')).toBeNull();
    // ボスメーカー以外のURLでは効かない
    expect(parseBossMakerGlenForm2('?stage=stage-7&makerboss=giantbat&glenform=2')).toBe(false);
  });

  it('城ボス以外はステージを渡しても固定の部屋(森)のまま', () => {
    expect(bossMakerStageFor('idol', 'stage-3')).toBe(BOSS_MAKER_STAGE);
    expect(new URLSearchParams(bossMakerQuery(OPTS, 'idol', 'stage-3')).get('stage')).toBe(BOSS_MAKER_STAGE);
  });

  it('城ボスでも知らないステージなら固定の部屋へ落ちる(壊れたURLで出撃しない)', () => {
    expect(bossMakerStageFor('giantbat', 'stage-999')).toBe(BOSS_MAKER_STAGE);
    expect(bossMakerStageFor('giantbat')).toBe(BOSS_MAKER_STAGE);
  });
});
