import { describe, it, expect } from 'vitest';
import ledger from '../../scripts/asset-masters.json';
import { enemyArtName } from './enemyArt';

describe('enemyArtName(リザルトの「倒した相手」の絵)', () => {
  it('見た目の表を引く(全ステージ共通)', () => {
    expect(enemyArtName('zombie', 'e1', 'forest')).toBe('zombie-common');
    expect(enemyArtName('reaper', 'e1', 'snow')).toBe('reaper2-common');
  });
  it('城ボスはステージ別の絵', () => {
    expect(enemyArtName('giantbat', 'b', 'stage7')).toBe('glen-boss');
    expect(enemyArtName('giantbat', 'b', 'city')).toBe('stage3-enemies/giantbat');
    expect(enemyArtName('giantbat', 'b', 'snow')).toBe('stage4-enemies/giantbat');
  });
  it('フィルは素材名が phill', () => {
    expect(enemyArtName('phillboss', 'p', 'forest')).toBe('phill');
  });
  it('主な雑魚・強個体の絵は原盤台帳(public/sprites)に実在する', () => {
    for (const t of ['zombie', 'skeleton', 'bat', 'plant', 'ghost', 'lich', 'screamer', 'werewolf', 'reaper', 'pumpkin', 'driller', 'logger']) {
      const name = enemyArtName(t, 'id-1', 'forest');
      expect(`sprites/${name}.png` in (ledger as { files: Record<string, unknown> }).files, `${t} → ${name}`).toBe(true);
    }
  });
});
