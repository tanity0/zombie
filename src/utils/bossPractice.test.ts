// ボスラッシュ(練習モード)の台帳テスト。BOSS_MAKER.md §20-8-b の受け入れ条件を機械化する。
import { describe, it, expect } from 'vitest';
import {
  PRACTICE_CATEGORY_ORDER, PRACTICE_SLOTS, practiceSlotByKey, practiceBossHealth,
  practiceSlotUnlocked, GUARDIAN_PHANTOM_SLOT_KEY, GUARDIAN_PHANTOM_LABEL,
} from './bossPractice';
import { GHOST_DOSSIER_SLOTS } from './ghostDossier';
import { GATE2_BOSS_TYPE_BY_STAGE } from '../config/gateBoss';
import { STAGE_BOSS_HEALTH_BY_STAGE } from '../config/bossHealth';
import { STAGES, getStage } from '../data/campaign';
import { BOUNTY_ENEMY_TYPES, isBountyType } from './enemyUtils';
import { BOUNTY_BASE_HP } from './bountyDims';
import { GUARDIAN_PHANTOM_HEALTH } from '../config/bossHealth';
import { strongestGuardian } from '../data/fixedGuardians';

// §6.38 掲載裁定で追記した賞金首4枠(GHOST_DOSSIER_SLOTS由来ではない独立追記枠)。
// 既存テストの「守護霊メニューと同じ台帳」比較から除いて扱う。
const bountySlots = () => PRACTICE_SLOTS.filter(s => isBountyType(s.bossType));
// research/GHOST_BOSS.md の実験枠「決闘」(幻影)も GHOST_DOSSIER_SLOTS 由来ではない独立追記枠なので、
// 「守護霊メニューと同じ台帳」の比較からは除いて扱う(賞金首と同じ扱い)。
const duelSlots = () => PRACTICE_SLOTS.filter(s => s.bossType === 'guardian-phantom');
const ghostDerivedSlots = () =>
  PRACTICE_SLOTS.filter(s => !isBountyType(s.bossType) && s.bossType !== 'guardian-phantom');

describe('ボスラッシュの台帳', () => {
  it('守護霊メニューと同じ台帳をそのまま使う(形態別の独立枠は置かない)', () => {
    expect(ghostDerivedSlots().map(s => s.slotKey)).toEqual(GHOST_DOSSIER_SLOTS.map(s => s.slotKey));
    // 台帳の総数 = 守護霊メニュー由来 + 賞金首4 + 決闘1(幻影)。
    expect(duelSlots()).toHaveLength(1);
    expect(PRACTICE_SLOTS).toHaveLength(GHOST_DOSSIER_SLOTS.length + BOUNTY_ENEMY_TYPES.size + 1);
  });

  // ★社長裁定v0.25.3600「第二形態は第一形態と合体させて。第一倒したら第二に移行」。
  // 旧v0.25.3029「二体」時代の独立枠 'giantbat@stage-7:phase2' を復活させたらここで落ちる。
  // (移行そのもの=形態1討伐→形態2予約が練習でも張られること、はgameStore側の
  //  triggerDramaticDeathの条件で実装。枠はグレン1つだけ=形態1から通しで戦う。)
  it('グレン第二形態の独立枠は無い(合体裁定v0.25.3600)', () => {
    expect(practiceSlotByKey('giantbat@stage-7')).toBeTruthy();
    expect(PRACTICE_SLOTS.some(s => s.slotKey.includes('phase2') || s.glenForm2)).toBe(false);
  });

  // 社長裁定 §20-9-2。台帳は守護霊メニューと共用なので、あちらに足された瞬間ここにも出てしまう。
  // 「足さないこと」を口約束にせず、足された時にその場で落ちるようにする。
  it('死神・凶悪ハンターをボスに含めない', () => {
    const types = PRACTICE_SLOTS.map(s => s.bossType as string);
    expect(types).not.toContain('reaper');
    expect(types.some(t => t.includes('hunter'))).toBe(false);
  });

  it('全ての枠が出撃先ステージを解決できる(解決できないと構築時に例外)', () => {
    for (const slot of PRACTICE_SLOTS) {
      expect(getStage(slot.stageId), slot.slotKey).toBeTruthy();
    }
  });

  it('ゲート2ボスのステージが GATE2_BOSS_TYPE_BY_STAGE と一致する(写経しない)', () => {
    for (const [stageId, bossType] of Object.entries(GATE2_BOSS_TYPE_BY_STAGE)) {
      const slot = PRACTICE_SLOTS.find(s => s.bossType === bossType);
      expect(slot, `${bossType} の枠が無い`).toBeTruthy();
      expect(slot!.stageId).toBe(stageId);
      expect(slot!.param).toBe('gateboss');
    }
  });

  it('裏ボスのステージが campaign.hiddenBoss と一致する(写経しない)', () => {
    for (const stage of STAGES) {
      if (!stage.hiddenBoss) continue;
      const slot = PRACTICE_SLOTS.find(s => s.bossType === stage.hiddenBoss);
      expect(slot, `${stage.hiddenBoss} の枠が無い`).toBeTruthy();
      expect(slot!.stageId).toBe(stage.id);
      expect(slot!.param).toBe('bossnow');
    }
  });

  it('idol は stage-2 の idolnow', () => {
    const slot = practiceSlotByKey('idol')!;
    expect(slot.stageId).toBe('stage-2');
    expect(slot.param).toBe('idolnow');
  });

  // ★致命2の再発検知器: 城ボスの湧きゲートは `!labTheme && !storyBoss` を要求するので、
  // castlenow が効くステージと効かないステージがある。「全ステージで castlenow」に戻したら落ちる。
  it('城ボス: lab/storyBoss のステージでは castlenow を使わない', () => {
    for (const slot of PRACTICE_SLOTS.filter(s => s.bossType === 'giantbat')) {
      const stage = getStage(slot.stageId)!;
      if (stage.theme === 'lab' || stage.storyBossOnly) {
        expect(slot.param, `${slot.slotKey} は castlenow が効かない`).toBeNull();
      } else {
        expect(slot.param, slot.slotKey).toBe('castlenow');
      }
    }
  });

  // 社長裁定 §20-10 = C(「?」のまま並べる)。外さずに置き、将来ボスが本編へ置かれたら
  // 遭遇の仕組みがそのまま働いて解放される。ここは「いま会えない枠がどれか」の記録。
  it('本編で遭遇できない枠はちょうど3つ(台帳からは外さない)', () => {
    const unreachable = PRACTICE_SLOTS.filter(s => !s.reachable).map(s => s.slotKey).sort();
    // 幻影(決闘)は**本編のどこにも置かれていない**ので reachable:false。ただし遭遇記録を待たずに
    // 選べる(alwaysUnlocked)ので、ここに載ることと解放されていることは矛盾しない。
    expect(unreachable).toEqual(['acrasiel', 'giantbat@stage-2', 'suriel', GUARDIAN_PHANTOM_SLOT_KEY].sort());
    expect(ghostDerivedSlots()).toHaveLength(GHOST_DOSSIER_SLOTS.length); // 既存枠を外していない
  });
});

// §6.38 掲載裁定: 賞金首4種(GHOST_DOSSIER_SLOTS由来ではない独立追記枠)。
describe('賞金首の掲載枠', () => {
  it('4種すべて並び、先頭(既存ボス群の前)に置かれている(社長指示v0.25.3444「小ボスは一番上」)', () => {
    expect(bountySlots().map(s => s.bossType).sort()).toEqual([...BOUNTY_ENEMY_TYPES].sort());
    const ghostIdxs = PRACTICE_SLOTS.map((s, i) => (!isBountyType(s.bossType) ? i : -1)).filter(i => i >= 0);
    const bountyIdxs = PRACTICE_SLOTS.map((s, i) => (isBountyType(s.bossType) ? i : -1)).filter(i => i >= 0);
    expect(Math.max(...bountyIdxs)).toBeLessThan(Math.min(...ghostIdxs));
  });

  // ★v0.25.3457の教訓の機械化: 上の台帳順だけでは画面は変わらない(対策室はカテゴリで区切って描く)。
  // **表示順の正=PRACTICE_CATEGORY_ORDER** なので、こちらの先頭も固定する。
  it('画面のカテゴリ順も小ボス(賞金首)が先頭', () => {
    expect(PRACTICE_CATEGORY_ORDER[0]).toBe('bounty');
    // research/GHOST_BOSS.md: 'duel'(決闘=幻影)は末尾の実験枠。
    expect(PRACTICE_CATEGORY_ORDER[PRACTICE_CATEGORY_ORDER.length - 1]).toBe('duel');
    expect([...PRACTICE_CATEGORY_ORDER].sort()).toEqual(['bounty', 'duel', 'gate', 'hidden', 'story']);
  });

  it('出撃先はlab/corridorではないstage-1・強制出現は?bountynow相乗り・本編到達可能', () => {
    for (const slot of bountySlots()) {
      expect(slot.stageId, slot.slotKey).toBe('stage-1');
      expect(slot.param, slot.slotKey).toBe('bountynow');
      expect(slot.reachable, slot.slotKey).toBe(true);
      const stage = getStage(slot.stageId)!;
      expect(stage.theme, slot.slotKey).not.toBe('lab');
    }
  });

  it('遭遇解放キー(encounterSlotKey)はbossType文字列そのもの(bossStyleSlotKeyの規約と一致)', () => {
    for (const slot of bountySlots()) {
      expect(slot.encounterSlotKey).toBe(slot.bossType);
    }
  });

  it('個体名(バス停/馬乗り/鋏/舞妓)が付いている', () => {
    const labels = bountySlots().map(s => s.label).sort();
    expect(labels).toEqual(['バス停(変異)', '舞妓(変異)', '鋏(変異)', '馬乗り(変異)'].sort());
  });

  it('HP表示は基準値(BOUNTY_BASE_HP)を出す', () => {
    for (const slot of bountySlots()) {
      expect(practiceBossHealth(slot), slot.slotKey).toBe(BOUNTY_BASE_HP);
    }
  });
});

describe('練習画面のHP表示', () => {
  // v0.25.3164(社長決定「ボスのHPは増やす台本を適用しよう」): ストーリーボスも台帳のHPで戦うように
  // なったので、**台帳に行がある枠は表示してよい**。行が無い枠(stage-ex1)だけ「—」のまま。
  // ※旧コメントは「base(500)のまま/12倍の嘘」と書いていたが、×ENEMY_HP_MULT(5)を見落とした誤り
  //   (正しくは実効2500=2.4倍のズレ)。同じ見落としを繰り返さないよう経緯を残す。
  it('台帳に行が無い枠(stage-ex1)だけHPを出さない', () => {
    for (const slot of PRACTICE_SLOTS.filter(s => s.bossType === 'giantbat')) {
      if (STAGE_BOSS_HEALTH_BY_STAGE[slot.stageId] === undefined) {
        expect(practiceBossHealth(slot), slot.slotKey).toBeNull();
      }
    }
  });

  it('ゲート2・裏ボス・通常の城ボスはHPが引ける', () => {
    for (const slot of PRACTICE_SLOTS) {
      const stage = getStage(slot.stageId);
      if (slot.bossType === 'giantbat' && (stage?.storyBossOnly || stage?.theme === 'lab')) continue;
      expect(practiceBossHealth(slot), slot.slotKey).toBeGreaterThan(0);
    }
  });
});

// research/GHOST_BOSS.md(守護霊ボス「幻影」): ボスモードの実験枠「決闘」。
describe('決闘(幻影)の掲載枠', () => {
  it('独立枠が1つだけ・一覧の最下段に置かれている', () => {
    expect(duelSlots().map(s => s.slotKey)).toEqual([GUARDIAN_PHANTOM_SLOT_KEY]);
    expect(PRACTICE_SLOTS[PRACTICE_SLOTS.length - 1].slotKey).toBe(GUARDIAN_PHANTOM_SLOT_KEY);
  });

  it('出撃先はlab/corridorではないstage-1・強制出現は?phantomnow', () => {
    const slot = practiceSlotByKey(GUARDIAN_PHANTOM_SLOT_KEY)!;
    expect(slot.stageId).toBe('stage-1');
    expect(slot.param).toBe('phantomnow');
    expect(getStage(slot.stageId)!.theme).not.toBe('lab');
  });

  // ★入口の永久ロックの再発検知器: 幻影は本編のどこにも置かれていないので、遭遇記録の輪だけでは
  // 一生開かない。alwaysUnlocked を外したらここで落ちる。
  it('遭遇記録が空でも選べる(alwaysUnlocked)。既存枠の解放条件は変えない', () => {
    const slot = practiceSlotByKey(GUARDIAN_PHANTOM_SLOT_KEY)!;
    expect(slot.alwaysUnlocked).toBe(true);
    expect(practiceSlotUnlocked(slot, new Set())).toBe(true);
    for (const other of PRACTICE_SLOTS.filter(s => s.slotKey !== GUARDIAN_PHANTOM_SLOT_KEY)) {
      expect(practiceSlotUnlocked(other, new Set()), other.slotKey).toBe(false);
    }
  });

  it('HPは裏ボス方式の固定値(倍率を通さない)', () => {
    expect(practiceBossHealth(practiceSlotByKey(GUARDIAN_PHANTOM_SLOT_KEY)!)).toBe(GUARDIAN_PHANTOM_HEALTH);
  });

  it('表示名は守護霊台帳の人物名から組む(名前を写経しない)', () => {
    expect(GUARDIAN_PHANTOM_LABEL).toContain(strongestGuardian().name);
    expect(practiceSlotByKey(GUARDIAN_PHANTOM_SLOT_KEY)!.label).toBe(GUARDIAN_PHANTOM_LABEL);
  });
});
