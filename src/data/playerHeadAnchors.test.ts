// 頭の位置の台帳の漏れ止め(社長「今後も流用するので覚えておいて」2026-10-26)。
// 体の絵を足した/差し替えたのに台帳を作り直していないと落ちる → `node scripts/avatar-head-anchors.mjs --write` を回して画を見る。
import { describe, it, expect } from 'vitest';
import { PLAYER_HEAD_ANCHORS } from './playerHeadAnchors';

// 素材の実在は Vite の glob で数える(@types/node に依存しない・playerWalkSheets.test と同じ作法)。
const FILES = Object.keys(import.meta.glob('../../public/sprites/player-*.png', { query: '?url' })).map(k => k.split('/').pop() as string);
const BODY = /^player-(magnum|shotgun|striker|scavenger)-(idle|walk-\d|run-\d|melee-ready|melee-swing)\.png$|^player-warlord-(gun|katana)-walk-\d\.png$/;

describe('アバターが付く頭の位置の台帳', () => {
  const bodies = FILES.filter(f => BODY.test(f)).map(f => f.replace(/\.png$/, ''));
  it('体の全コマが台帳に載っている', () => {
    expect(bodies.length).toBeGreaterThan(40);
    expect(bodies.filter(n => !(n in PLAYER_HEAD_ANCHORS))).toEqual([]);
  });
  it('頭は絵の中にある(足元から上・横は絵の幅の内)', () => {
    for (const [n, a] of Object.entries(PLAYER_HEAD_ANCHORS)) {
      expect(a.y, n).toBeGreaterThan(10);
      expect(Math.abs(a.x), n).toBeLessThan(40);
    }
  });
});
