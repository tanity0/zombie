import { describe, it, expect } from 'vitest';
import { pickAssetVersion, assetUrl, assetVersionFor } from './assetUrl';
import { ASSET_VERSION } from './assetVersion';

// 「更新されたものだけ再DL」の要=ハッシュ表の引き方(純関数)。配線側(assetUrl)は
// BASE_URL の連結と `?v=` の形だけを見る。
describe('pickAssetVersion', () => {
  const hashes = { 'sprites/a.png': 'deadbeef01', 'audio/sfx/hit.mp3': 'cafebabe02' };

  it('表にあるファイルは内容ハッシュを返す', () => {
    expect(pickAssetVersion(hashes, 'sprites/a.png', '61')).toBe('deadbeef01');
    expect(pickAssetVersion(hashes, 'audio/sfx/hit.mp3', '61')).toBe('cafebabe02');
  });

  it('表に無いファイルは版数へフォールバックする(未追跡素材・git不在ビルドでも壊れない)', () => {
    expect(pickAssetVersion(hashes, 'sprites/unknown.png', '61')).toBe('61');
    expect(pickAssetVersion({}, 'sprites/a.png', '61')).toBe('61');
  });

  it('先頭のスラッシュと既存クエリは無視して引く', () => {
    expect(pickAssetVersion(hashes, '/sprites/a.png', '61')).toBe('deadbeef01');
    expect(pickAssetVersion(hashes, 'sprites/a.png?foo=1', '61')).toBe('deadbeef01');
  });

  it('別ファイルは別の版になる(=1枚差し替えで全部のURLが変わらない)', () => {
    const before = { 'sprites/a.png': 'aaaaaaaa01', 'sprites/b.png': 'bbbbbbbb01' };
    const after = { 'sprites/a.png': 'aaaaaaaa02', 'sprites/b.png': 'bbbbbbbb01' };
    expect(pickAssetVersion(after, 'sprites/a.png', '61')).not.toBe(
      pickAssetVersion(before, 'sprites/a.png', '61')
    );
    expect(pickAssetVersion(after, 'sprites/b.png', '61')).toBe(
      pickAssetVersion(before, 'sprites/b.png', '61')
    );
  });
});

describe('assetUrl', () => {
  it('BASE_URL + パス + ?v= の形になる', () => {
    const url = assetUrl('sprites/atlas.png');
    expect(url.startsWith(`${import.meta.env.BASE_URL}sprites/atlas.png?v=`)).toBe(true);
  });

  it('先頭スラッシュ付きでもBASE_URLが二重にならない', () => {
    expect(assetUrl('/sprites/atlas.png')).toBe(assetUrl('sprites/atlas.png'));
  });

  it('版は内容ハッシュ(10桁hex)か、フォールバックの ASSET_VERSION のどちらか', () => {
    const v = assetVersionFor('sprites/atlas.png');
    expect(v === ASSET_VERSION || /^[0-9a-f]{10}$/.test(v)).toBe(true);
  });
});
