// ★★シートの表に書いた名前で、**本当に配信素材が在るか**をファイルで確かめる。
//
// ★なぜこれが要るか(社長支給2026-09-22「ハンターの歩き」で判明):
// これまでは「名前が `ENEMY_VARIANT_SETS`(男女2種などを持つ敵の表)に在るか」で代用していたが、
// **ハンターのように変種を持たない敵はその表に載っていない**ので、正しい名前でも落ちてしまう。
// しかも**あの検査はシート側のファイル名(`<名前>-walk.png` など)を1バイトも見ていない**——
// 「名前を間違えると一生出ない」を本当に捕まえるには、**出す予定の PNG が在るか**を見るのが筋。
import { describe, it, expect } from 'vitest';
import {
  ENEMY_WALK_SHEETS, ENEMY_ATTACK_SHEETS, ENEMY_IDLE_SHEETS, ENEMY_JUMP_SHEETS, ENEMY_SHOT_SHEETS,
  walkSheetName, attackSheetName, idleSheetName, jumpSheetName, shotSheetName,
} from './enemySheets';
import { isAtlasPxOverride, ATLAS_PX2_OVERRIDES } from './atlasPxOverrides';

// ★`node:fs` ではなく Vite の glob で数える(このプロジェクトのテストは `bakeLedger.test.ts` と
// 同じ作法で、ブラウザ向けの型設定のまま動く)。キーは `../../public/sprites/<名前>.png`。
const SPRITE_FILES = new Set(
  Object.keys(import.meta.glob('../../public/sprites/**/*.png'))
    .map(p => p.replace('../../public/sprites/', '').replace(/\.png$/, '')),
);
const hasSprite = (name: string): boolean => SPRITE_FILES.has(name);
const TABLES: [string, Readonly<Record<string, unknown>>, (n: string) => string][] = [
  ['歩き', ENEMY_WALK_SHEETS, walkSheetName],
  ['攻撃', ENEMY_ATTACK_SHEETS, attackSheetName],
  ['待機', ENEMY_IDLE_SHEETS, idleSheetName],
  ['跳ぶ', ENEMY_JUMP_SHEETS, jumpSheetName],
  ['弾', ENEMY_SHOT_SHEETS, shotSheetName],
];

describe('★★表の名前 ⇔ 実在する素材', () => {
  it('検査対象が空ではない(表や素材が読めていないと、この検査は何も言っていない)', () => {
    expect(TABLES.reduce((n, [, t]) => n + Object.keys(t).length, 0)).toBeGreaterThan(5);
    expect(SPRITE_FILES.size).toBeGreaterThan(100);
  });

  it('★★シートの PNG が実在する(名前を間違えると一生出ない)', () => {
    for (const [label, table, nameOf] of TABLES) {
      for (const idle of Object.keys(table)) {
        const f = nameOf(idle);
        expect(hasSprite(f), `${label}: public/sprites/${f}.png が無い`).toBe(true);
      }
    }
  });

  // ★立ち絵は `public/sprites/<名前>.png` とは限らない——**ステージ1セットのドット絵**は
  // `atlas-px2/<名前>.png` を読んで `<名前>` のキーへ差し替える(`utils/atlasPxOverrides.ts`)。
  // 城ボス1(`giantbat`)がこれ。**別名の台帳をローダと共有**して、正しい名前で落とさない。
  it('★立ち絵の PNG も実在する(シートが出ていない時に戻る先)', () => {
    for (const [label, table] of TABLES) {
      for (const idle of Object.keys(table)) {
        const f = isAtlasPxOverride(idle) ? `atlas-px2/${idle}` : idle;
        expect(hasSprite(f), `${label}: public/sprites/${f}.png が無い`).toBe(true);
      }
    }
  });

  it('★上書きの表に書いた名前の素材も実在する(別名の台帳が腐らない)', () => {
    expect(ATLAS_PX2_OVERRIDES.length).toBeGreaterThan(0);
    for (const n of ATLAS_PX2_OVERRIDES) {
      expect(hasSprite(`atlas-px2/${n}`), `public/sprites/atlas-px2/${n}.png が無い`).toBe(true);
    }
  });
});
