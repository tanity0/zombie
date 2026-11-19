// 案山子(変異体対策室の練習の的)の揺れの向きと始まりを、**被弾が store に書かれた瞬間に**決めて store へ書く。
// 社長指示2026-11-19「打たれた向きによって反転させて」「燃焼系は揺れるだけにして」。決め方は utils/scarecrow.scarecrowSwayStep(純関数)。
//
// ★なぜ購読(subscribe)にするか: 被弾を書く所は近接の各経路と damageEnemy に分かれている(案山子の体力の合流点だけで14箇所)。
//   1つずつ向きを書き足すと必ず書き漏らすので、「lastHit が新しくなった」を1箇所で拾う。zustand の購読は set の直後に同期で走る
//   =描画(Pixi のティッカー)が読むより先に決まる。描画は scarecrowSwayAt / scarecrowLeanLeft を読むだけ。
// ★負荷: 敵の配列の参照が変わった時だけ、しかも練習ランの時だけ走る(本編では1行目で抜ける)。1/10。
import { useGameStore } from './gameStore';
import { isPracticeRun } from '../utils/bossPractice';
import { scarecrowSwayStep, type ScarecrowSwayPatch } from '../utils/scarecrow';

let installed = false;

/** 1回だけ呼ぶ(useGameLoop のマウント時)。2回目以降は何もしない。 */
export const installScarecrowSway = (): void => {
  if (installed) return;
  installed = true;
  let prevEnemies = useGameStore.getState().enemies;
  useGameStore.subscribe(s => {
    if (s.enemies === prevEnemies) return;
    prevEnemies = s.enemies;
    if (!isPracticeRun()) return;
    let patches: Map<string, ScarecrowSwayPatch> | null = null;
    const ax = s.player.x + s.player.width / 2;
    const now = Date.now();
    for (const e of s.enemies) {
      if (e.type !== 'scarecrow') continue;
      const p = scarecrowSwayStep(e, ax, now);
      if (p) (patches ??= new Map()).set(e.id, p);
    }
    if (!patches) return;
    const ps = patches;
    useGameStore.setState(st => ({ enemies: st.enemies.map(e => { const p = ps.get(e.id); return p ? { ...e, ...p } : e; }) }));
  });
};
