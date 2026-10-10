// 雑魚・強個体・ハンターが進軍NPC(軍人)を狙う規則(research/ESCORT_TARGETED.md §4)の純関数。
// 規則: 気づく距離(380px=ALCHEMY_AGGRO_RANGE)の内側で、プレイヤー(と召喚)より近い軍人を追う/撃つ。
// 今の相手に 20% の粘着(替えるのは、新しい方が今の相手より2割近い時)=等距離でパタつかない。
// 葉モジュール(store/enemyUtils を import しない=enemyUtils が安全にこれを使える)。

/** 狙われる候補(画面内で倒れていない軍人)。座標は体の中心。 */
export interface EscortAggroCandidate { id: string; x: number; y: number }

/** 気づく距離(=錬金術の仲間と同じ ALCHEMY_AGGRO_RANGE。resolveEnemyTarget の aggroRange 引数がそのまま入る)。 */
export const ESCORT_AGGRO_RANGE_PX = 380;
/** 粘着: 新しい相手が今の相手のこの割合以下の距離(=2割近い)になった時だけ替える。 */
export const ESCORT_AGGRO_STICKY_RATIO = 0.8;

const NON_ESCORT = '__non_escort__';

/**
 * 軍人を狙うなら その軍人のid、狙わない(=プレイヤー/召喚のまま)なら undefined。
 * @param nonEscortD プレイヤー/召喚のうち最寄りまでの距離(隠れている等で狙えないなら Infinity)
 * @param currentId  今追っている軍人のid(Enemy.targetEscortId)。未設定=今の相手はプレイヤー側
 */
export const chooseEscortAggro = (
  ex: number, ey: number,
  nonEscortD: number,
  escorts: readonly EscortAggroCandidate[],
  currentId: string | undefined,
  range: number = ESCORT_AGGRO_RANGE_PX,
): string | undefined => {
  const items: { key: string; d: number }[] = [];
  if (Number.isFinite(nonEscortD)) items.push({ key: NON_ESCORT, d: nonEscortD });
  let anyEscort = false;
  for (const c of escorts) {
    const d = Math.hypot(c.x - ex, c.y - ey);
    if (d <= range) { items.push({ key: c.id, d }); anyEscort = true; }
  }
  if (!anyEscort) return undefined;
  let best = items[0];
  for (let i = 1; i < items.length; i++) if (items[i].d < best.d) best = items[i];
  // 今の相手: 追っていた軍人が候補に残っていればその軍人、そうでなければプレイヤー側(狙える時)。
  const cur = (currentId !== undefined ? items.find(it => it.key === currentId) : undefined)
    ?? items.find(it => it.key === NON_ESCORT);
  if (cur && best.key !== cur.key && !(best.d <= cur.d * ESCORT_AGGRO_STICKY_RATIO)) best = cur;
  return best.key === NON_ESCORT ? undefined : best.key;
};
