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
import { BOUNTY_ENEMY_TYPES, isBountyType, isHiddenBoss, spawnEnemyAt } from './enemyUtils';
import { stageHpMult, BOUNTY_HOME_STAGE } from '../config/stageDifficulty';
import { BOUNTY_BASE_HP } from './bountyDims';
import { GLEN_FORM1_HP_MULT } from './glenChain';
import { guardianPhantomHealth } from '../config/bossHealth';
import { PLAYER_PROFILES } from '../data/playerProfiles';
import { growthMaxHpBonus, activeUpgradeLevel, loadPlayerUpgrades } from './playerUpgrades';
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
    // PACING_PUZZLE.md §10-12#2/§10-14#9(ゲートボス交換): stage-6=acrasiel / stage-ex1=suriel。
    // storyBossOnlyがstage-ex1から外れたのでsurielは本編で遭遇可能になった(=unreachableから除外)。
    // 代わりにstage-6側のacrasielが不変で遭遇不能のまま残る(交換前後で「1体は遭遇不能」自体は不変・R9)。
    expect(unreachable).toEqual(['acrasiel', 'giantbat@stage-2', GUARDIAN_PHANTOM_SLOT_KEY].sort());
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

  // 社長報告2026-08-20「難易度補正、ボスモードに入ってない」の修正: 出撃先=**生息ステージ**
  // (BOUNTY_HOME_STAGE)。旧v6 B-5のstage-1固定は「lab/corridorではない野外」が理由で、
  // 生息ステージも全て野外=理由は満たしたまま実戦と同じ係数が乗る。
  it('出撃先は生息ステージ(BOUNTY_HOME_STAGE)・野外・強制出現は?bountynow相乗り・本編到達可能', () => {
    for (const slot of bountySlots()) {
      expect(slot.stageId, slot.slotKey).toBe(BOUNTY_HOME_STAGE[slot.bossType] ?? 'stage-1');
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

  it('HP表示は基準値(BOUNTY_BASE_HP)×生息ステージ係数を出す(実戦と同じ式)', () => {
    for (const slot of bountySlots()) {
      expect(practiceBossHealth(slot), slot.slotKey).toBe(Math.round(BOUNTY_BASE_HP * stageHpMult(slot.stageId)));
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

  // research/STAGE_DIFFICULTY.md(ステージ難度の階段): 表示は常に「プレイヤーが見る実戦の値」。
  // ★通常経路(非計測路)に限定した一致——ボスメーカー/ガントレット中は実戦が1.0/表示は係数込みで
  // 一致しないのが仕様(その場面ではこの一覧を出さない)。
  it('天使/裏ボスの表示 = 実戦スポーン値(台帳HP×ステージ係数)', () => {
    for (const slot of PRACTICE_SLOTS) {
      if (!isHiddenBoss(slot.bossType)) continue; // 天使6体+裏ボス5体(idol含む)
      // PACING_PUZZLE.md §10-14#3(フィル): phillbossはisHiddenBoss編入だが、実効HPは
      // ENEMY_STATSの素の値(プレースホルダ500)ではなく**スポーン時にSTAGE_BOSS_HEALTH_BY_STAGEで
      // 上書きされた値**(giantbat/幻影と同じ「表=実戦」原則)。下の専用テストで別途検証する。
      if (slot.bossType === 'phillboss') continue;
      // 実戦は spawnEnemyAt が書く台帳HP(倍率を通さない固定型)へ、スポーン地点でステージ係数を掛ける。
      const spawned = spawnEnemyAt(slot.bossType, 0, 0, 0);
      expect(practiceBossHealth(slot), slot.slotKey).toBe(Math.round(spawned.health * stageHpMult(slot.stageId)));
    }
  });

  it('フィル(phillboss)の表示 = STAGE_BOSS_HEALTH_BY_STAGE[stage-ex1]×ステージ係数', () => {
    const slot = practiceSlotByKey('phillboss@stage-ex1')!;
    expect(slot).toBeDefined();
    const ledger = STAGE_BOSS_HEALTH_BY_STAGE[slot.stageId];
    expect(practiceBossHealth(slot)).toBe(Math.round(ledger * stageHpMult(slot.stageId)));
  });

  it('城ボス(giantbat)の表示 = 台帳HP×ステージ係数(stage-7形態1枠は×1.5・社長裁定v0.25.3700)', () => {
    for (const slot of PRACTICE_SLOTS.filter(s => s.bossType === 'giantbat')) {
      const ledger = STAGE_BOSS_HEALTH_BY_STAGE[slot.stageId];
      if (ledger === undefined) continue; // stage-ex1 は「—」
      // グレン形態1は最大HP1.5倍で戦う(残り1/3で第二形態へ移行)ので、表示も1.5倍で一致させる。
      const f1 = slot.stageId === 'stage-7' && slot.glenForm2 !== true ? GLEN_FORM1_HP_MULT : 1;
      expect(practiceBossHealth(slot), slot.slotKey).toBe(Math.round(ledger * f1 * stageHpMult(slot.stageId)));
    }
  });

  it('階段に乗るステージの枠は、係数のぶんだけ台帳より大きく表示される', () => {
    const laddered = PRACTICE_SLOTS.filter(s => stageHpMult(s.stageId) > 1 && isHiddenBoss(s.bossType));
    expect(laddered.length).toBeGreaterThan(0); // 台帳の割当が消えたら気付けるようにする
    for (const slot of laddered) {
      expect(practiceBossHealth(slot)!, slot.slotKey).toBeGreaterThan(spawnEnemyAt(slot.bossType, 0, 0, 0).health);
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

  // ★社長裁定2026-08-23「HPもステータス通りに。」(SAME_ARENA §4-a の原則「記録されたその人そのもの」):
  // 幻影HPの正本は**記録の maxHealth**。練習画面の表示と実戦(スポーン時に書き込む値)が原理的に
  // 一致する、という不変条件はこの等値で守る。
  // 旧仕様(GROWTH.md v4)=「初期プレイヤーHP+育成の体力加算」は**記録が無いときのフォールバック**へ降格。
  it('★HPは記録どおり(snapshot.maxHealth)= 練習表示と実戦が一致する', () => {
    const recorded = strongestGuardian().profile.snapshot?.maxHealth;
    expect(recorded).toBeTruthy();
    expect(practiceBossHealth(practiceSlotByKey(GUARDIAN_PHANTOM_SLOT_KEY)!)).toBe(
      guardianPhantomHealth(
        PLAYER_PROFILES[strongestGuardian().classId].maxHp
        + growthMaxHpBonus(activeUpgradeLevel(loadPlayerUpgrades(), 'health')),
        recorded,
      ),
    );
    // 記録が正本=記録の値そのもの(丸めのみ)。
    expect(practiceBossHealth(practiceSlotByKey(GUARDIAN_PHANTOM_SLOT_KEY)!)).toBe(Math.round(recorded!));
  });

  it('★記録が無い(旧データ)ときだけ、従来どおり育成込みの初期プレイヤーHPへ落ちる', () => {
    const base = PLAYER_PROFILES[strongestGuardian().classId].maxHp
      + growthMaxHpBonus(activeUpgradeLevel(loadPlayerUpgrades(), 'health'));
    expect(guardianPhantomHealth(base, undefined)).toBe(Math.round(base));
    expect(guardianPhantomHealth(base, 0)).toBe(Math.round(base));      // 不正値も無視
    expect(guardianPhantomHealth(base, Number.NaN)).toBe(Math.round(base));
  });

  // ★前提の機械化(GROWTH.md v4・検収監査の指摘2): 上の等値は、実戦の基準クラス
  // (そのランのプレイヤー=player.ddaBaseHp)と表示の基準クラス(守護霊台帳の最強クラス)が
  // 別物なのに、**全クラスの maxHp が同値**だから成立している。クラス別HPを導入すると
  // 表示と実戦がズレるので、このテストで前提が破れた瞬間に検知する(その時は表示側の再設計が要る)。
  it('全クラスの maxHp は同値(幻影HP表示=実戦の一致が依存する前提)', () => {
    const values = Object.values(PLAYER_PROFILES).map(p => p.maxHp);
    expect(new Set(values).size).toBe(1);
  });

  it('表示名は守護霊台帳の人物名から組む(名前を写経しない)', () => {
    expect(GUARDIAN_PHANTOM_LABEL).toContain(strongestGuardian().name);
    expect(practiceSlotByKey(GUARDIAN_PHANTOM_SLOT_KEY)!.label).toBe(GUARDIAN_PHANTOM_LABEL);
  });
});
