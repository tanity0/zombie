// ★研究所の絵を遅延組へ回した時の「判定は1pxも変えない」を固定する(コード監査2026-10-23 M-5)。
// 寸法は原盤台帳(scripts/asset-masters.json・CIの assets:check が素材と照合している)から引く。
import { describe, it, expect } from 'vitest';
import ledger from '../../scripts/asset-masters.json';
import { LAB_ZOMBIE_IDLE_SIZE, LAB_ZOMBIE_ASPECT_KEYS, LAB_PROP_SPRITES, LAB_ZOMBIE_IDLE_SPRITES } from './labActorArt';
import { LAB_PROP_VARIANTS } from '../world/labMap';
import { SHEET_RESIDENCY, sheetDeferred, sheetStageGroup, allEnemySheets } from './enemySheets';

const FILES = (ledger as { files: Record<string, { w: number; h: number }> }).files;

describe('研究所の絵(ステージ2の出撃時だけ読む)', () => {
  it('★立ち絵の寸法表は実物(原盤台帳)と一致する=縦横比(当たり判定の帯)が起動時に測っていた頃と同じ', () => {
    for (const [name, sz] of Object.entries(LAB_ZOMBIE_IDLE_SIZE)) {
      const f = FILES[`sprites/${name}.png`];
      expect(f, `${name} が原盤台帳に無い`).toBeDefined();
      expect({ w: f.w, h: f.h }, name).toEqual(sz);
    }
  });

  it('縦横比の登録先は寸法表に載っている立ち絵', () => {
    for (const [, tex] of LAB_ZOMBIE_ASPECT_KEYS) expect(LAB_ZOMBIE_IDLE_SIZE[tex]).toBeDefined();
  });

  it('障害物の一覧は labMap の配置候補と同じ12枚', () => {
    expect([...LAB_PROP_SPRITES].sort()).toEqual([...LAB_PROP_VARIANTS].sort());
    for (const n of LAB_PROP_SPRITES) expect(FILES[`sprites/${n}.png`], n).toBeDefined();
  });

  it('★研究所ゾンビのシートは全部「研究所の組」=起動時には読まない・ステージ2の出撃時に読む', () => {
    const labSheets = allEnemySheets().filter(s => LAB_ZOMBIE_IDLE_SPRITES.includes(s.idle));
    expect(labSheets.length).toBeGreaterThan(0);
    for (const s of labSheets) {
      expect(SHEET_RESIDENCY[s.idle], s.idle).toBe('lab');
      expect(sheetDeferred(s.idle), s.idle).toBe(true);
      expect(sheetStageGroup(s.idle), s.idle).toBe('labActors');
    }
    // 研究所以外の個体は研究所の組に入らない
    expect(sheetStageGroup('hunter')).toBeNull();
    expect(sheetStageGroup('reaper2-common')).toBeNull();
  });
});
