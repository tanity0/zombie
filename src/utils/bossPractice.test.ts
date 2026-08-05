// ボスラッシュ(練習モード)の台帳テスト。BOSS_MAKER.md §20-8-b の受け入れ条件を機械化する。
import { describe, it, expect } from 'vitest';
import { PRACTICE_SLOTS, practiceSlotByKey, practiceBossHealth } from './bossPractice';
import { GHOST_DOSSIER_SLOTS } from './ghostDossier';
import { GATE2_BOSS_TYPE_BY_STAGE } from '../config/gateBoss';
import { STAGES, getStage } from '../data/campaign';

describe('ボスラッシュの台帳', () => {
  it('守護霊メニューと同じ1本の台帳を使う(枠数・キーが一致)', () => {
    expect(PRACTICE_SLOTS.map(s => s.slotKey)).toEqual(GHOST_DOSSIER_SLOTS.map(s => s.slotKey));
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
    expect(unreachable).toEqual(['acrasiel', 'giantbat@stage-2', 'suriel'].sort());
    expect(PRACTICE_SLOTS).toHaveLength(GHOST_DOSSIER_SLOTS.length); // 外していない
  });
});

describe('練習画面のHP表示', () => {
  // ★storyBoss は stageBossHealthFor を通らず base(500)のまま戦っている。表の 6000 を出すと
  // 12倍の嘘になるので出さない(ボス側のHPを変えるのはバランス変更なのでやらない)。
  it('storyBoss(stage-7 / ex1)の城ボスはHPを出さない', () => {
    for (const slot of PRACTICE_SLOTS.filter(s => s.bossType === 'giantbat')) {
      if (getStage(slot.stageId)?.storyBossOnly) {
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
