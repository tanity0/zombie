// `?piledemo=1`(utils/devTestKnobs.ts): パイルドライバーの杭の絵の撮影用。製品の挙動は変えない(ツマミが無ければ即 return)。
// プレイヤーのすぐ右(射程の内側)に「動かない・倒れない」敵を1体置き続ける。押し返されても PILE_DEMO_RESET_MS 後に元の位置へ戻す
// (=押し返しの絵も撮れて、また射程に入って自動で撃つ)。
import { useGameStore } from '../store/gameStore';
import { spawnEnemyAt } from './enemyUtils';
import { PILE_DEMO_ACTIVE } from './devTestKnobs';

export const PILE_DEMO_ENEMY_ID = 'pile-demo-target';
/** 敵の中心をプレイヤーの中心から右へ置く距離(射程=約108pxの内側)。 */
const PILE_DEMO_OFFSET_X = 72;
/** 撃たれてから元の位置へ戻すまで。 */
const PILE_DEMO_RESET_MS = 600;

export const tickPileDemo = (gameTime: number): void => {
  // lastHit は実時計(Date.now)で打たれる。
  if (!PILE_DEMO_ACTIVE) return;
  const st = useGameStore.getState();
  const pl = st.player;
  const pcx = pl.x + pl.width / 2, pcy = pl.y + pl.height / 2;
  const cur = st.enemies.find(e => e.id === PILE_DEMO_ENEMY_ID);
  if (!cur) {
    const e = spawnEnemyAt('zombie', pcx + PILE_DEMO_OFFSET_X, pcy, gameTime);
    e.id = PILE_DEMO_ENEMY_ID;
    e.x = pcx + PILE_DEMO_OFFSET_X - e.width / 2;
    e.y = pcy - e.height / 2;
    e.dormant = true; e.aggroRange = 0; e.fixed = true;
    st.addEnemy(e);
    return;
  }
  const back = Date.now() - cur.lastHit >= PILE_DEMO_RESET_MS;
  const nx = back ? pcx + PILE_DEMO_OFFSET_X - cur.width / 2 : cur.x;
  const ny = back ? pcy - cur.height / 2 : cur.y;
  if (cur.dormant && cur.health === cur.maxHealth && nx === cur.x && ny === cur.y) return;
  useGameStore.setState(s => ({
    enemies: s.enemies.map(e => (e.id === PILE_DEMO_ENEMY_ID ? { ...e, x: nx, y: ny, dormant: true, aggroRange: 0, health: e.maxHealth } : e)),
  }));
};
