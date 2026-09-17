/**
 * ★ローカルテスト用の読み取り口(TEST_HANDOFF/REQUEST-devbridge.md **A. P0-1 Local Test Bridge**)。
 *
 * ★何のためか: 状態の読み取り口 `window.__gameStore` は `import.meta.env.DEV` ゲートで
 * **開発サーバ(5173)にしか生えない**。本番ビルド(`vite preview` 4173)では読めないので、
 * 自動レビューが「停滞」「死亡後の停止」「商人画面」「進行中」を区別できず、
 * **preview のランが事実上スクショだけ**になっていた。
 *
 * ★ゲートは `?testbridge=1`(社長裁定2026-09-17・URLツマミ方式)。理由は `devTestKnobs.ts` の
 * `TEST_BRIDGE_ACTIVE` のコメントに書いてある(ビルド時defineを採らなかった理由も含む)。
 *
 * ★書き込みは `closeBlockingMenu()` の**1つだけ**。移動・攻撃・数値変更の口は作らない。
 * ★**ゲームの挙動を1ミリも変えない。** 読むだけ + 既存の「閉じる」操作を呼ぶだけ。
 * ★画面の名前は、React側(App/MissionSelect/TitleScreen)が `reportTestScreen` で置いていく
 * (store には画面の状態が無いため。ツマミが立っていない時は何も記録しない=通常プレイのコストゼロ)。
 */
import { useGameStore } from '../store/gameStore';
import { TEST_BRIDGE_ACTIVE } from './devTestKnobs';
import { getSelectedStageId } from '../data/progress';
import { parseBotSkill } from './botSkill';
import { parseBotObjective } from './botObjective';

/** 自動レビューが押し分ける画面(発注文の `screenId` の値域)。 */
export type TestScreenId =
  | 'title' | 'updateModal' | 'opening' | 'opsRoom' | 'stagePick' | 'briefing' | 'charSelect'
  | 'loadout' | 'gameplay' | 'result' | 'other';

let screenId: TestScreenId = 'title';

/** React 側から画面名を置く。ツマミが立っていない時は何もしない。 */
export const reportTestScreen = (id: TestScreenId): void => {
  if (!TEST_BRIDGE_ACTIVE) return;
  screenId = id;
};

// ---------------------------------------------------------------------------------------------
// 「進んでいるか」の2つの時刻
// ---------------------------------------------------------------------------------------------
/**
 * ★`lastSignificantEventAt` の定義(テストチャットの提案をそのまま採用・2026-09-17):
 * **プレイヤーのHPが減った / レベルが上がった / ボスが出た・消えた / 結果画面に入った**のいずれか。
 * **「敵が1体湧いた」「弾が出た」は含めない**——停滞の判定に使うので、
 * **止まっていても動くもの**を入れると、固まっていても「進んでいる」に見えてしまう。
 *
 * ★`lastProgressAt` は**ゲーム内時計が進んだ最後の実時刻**(=止まっているかどうかそのもの)。
 */
let lastProgressAt = 0;
let lastSignificantEventAt = 0;
let unsubscribe: (() => void) | null = null;

const bossLikeCount = (enemies: readonly { type: string }[]): number =>
  enemies.filter(e => BOSS_LIKE.has(e.type)).length;

/** ここでの「ボス」= 画面の主役になる大物。`enemyUtils` の述語を import すると循環するので型名で持つ。 */
const BOSS_LIKE: ReadonlySet<string> = new Set([
  'giantbat', 'reaper', 'hangedman', 'mimir', 'jormungand', 'skadi', 'thor',
  'miguel', 'jibril', 'rafi', 'uri', 'suriel', 'acrasiel', 'idol', 'phillboss',
  'bounty-ranged', 'bounty-melee', 'bounty-balance', 'bounty-maiko',
]);

const watchSignificant = (): void => {
  let prevHealth = -1, prevLevel = -1, prevBosses = -1, prevGameTime = -1;
  unsubscribe = useGameStore.subscribe(s => {
    const now = Date.now();
    if (s.gameTime !== prevGameTime) { prevGameTime = s.gameTime; lastProgressAt = now; }
    const h = s.player.health, lv = s.player.level, nb = bossLikeCount(s.enemies);
    // 初回は基準を取るだけ(「起動した瞬間に大事件が起きた」ことにしない)。
    if (prevHealth < 0) { prevHealth = h; prevLevel = lv; prevBosses = nb; lastSignificantEventAt = now; return; }
    if (h < prevHealth || lv > prevLevel || nb !== prevBosses) lastSignificantEventAt = now;
    prevHealth = h; prevLevel = lv; prevBosses = nb;
  });
};

// ---------------------------------------------------------------------------------------------

const urlParam = (k: string): string | null => {
  try { return new URLSearchParams(window.location.search).get(k); } catch { return null; }
};

export interface TestBridgeSnapshot {
  buildVersion: string;
  gitCommit: string | null;
  stageId: string | null;
  screenId: TestScreenId;
  gameTime: number;
  isPaused: boolean;
  pauseReason: string | null;
  showShopMenu: boolean;
  showEventQuestMenu: boolean;
  showUpgradeMenu: boolean;
  tutorialPopup: boolean;
  playerAlive: boolean;
  health: number;
  level: number;
  x: number;
  y: number;
  botPersona: string | null;
  botSkill: string;
  botGoal: string;   // BotObjective.kind(中身は用途別なので種別だけ返す)
  enemyCount: number;
  bossTypes: string[];
  resultState: 'gameOver' | 'victory' | 'returned' | null;
  deathCause: string | null;
  botReportReady: boolean;
  lastProgressAt: number;
  lastSignificantEventAt: number;
}

const read = (): TestBridgeSnapshot => {
  const s = useGameStore.getState();
  const bosses = s.enemies.filter(e => BOSS_LIKE.has(e.type)).map(e => e.type);
  return {
    buildVersion: __APP_VERSION__,
    gitCommit: __GIT_COMMIT__,
    stageId: getSelectedStageId() || null,   // 未選択は '' で返るので null へ寄せる
    screenId,
    gameTime: Math.round(s.gameTime),
    isPaused: s.isPaused,
    // ★`isPaused` が false の時は必ず null。解除側(19箇所)で消し忘れても嘘をつかない形にしてある。
    pauseReason: s.isPaused ? (s.pauseReason ?? null) : null,
    showShopMenu: s.showShopMenu,
    showEventQuestMenu: s.showEventQuestMenu,
    showUpgradeMenu: s.showUpgradeMenu,
    tutorialPopup: s.tutorialPopup !== null && s.tutorialPopup !== undefined,
    playerAlive: s.player.health > 0,
    health: Math.round(s.player.health),
    level: s.player.level,
    x: Math.round(s.player.x),
    y: Math.round(s.player.y),
    botPersona: urlParam('bot'),
    botSkill: parseBotSkill(urlParam('botskill')),
    botGoal: parseBotObjective(urlParam('botgoal')).kind,
    enemyCount: s.enemies.length,
    bossTypes: [...new Set(bosses)],
    // 結果は画面名から出す(store に結果の種別を持つ1箇所が無いため。
    // 勝ち負けの区別が要るようになったら、そこで初めて store 側に足す)。
    resultState: screenId === 'result' ? (s.player.health > 0 ? 'victory' : 'gameOver') : null,
    // ★未提供: 死因の台帳が存在しない(B=別案件として積む)。嘘をつかず null を返す。
    deathCause: null,
    botReportReady: typeof (window as unknown as Record<string, unknown>).__BOT_REPORT__ === 'object'
      || typeof (window as unknown as Record<string, unknown>).__BOT_REPORT__ === 'function',
    lastProgressAt,
    lastSignificantEventAt,
  };
};

/**
 * ★唯一の書き込み。**開いていて進行を止めている画面を閉じる**だけ。
 * どれも既存のプレイヤー操作と同じ経路(ボットが自分で閉じられない画面の代役)。
 */
const closeBlockingMenu = (): void => {
  const s = useGameStore.getState();
  if (s.showShopMenu) useGameStore.setState({ showShopMenu: false, isPaused: false });
  if (s.showEventQuestMenu) useGameStore.setState({ showEventQuestMenu: false, isPaused: false });
  if (s.tutorialPopup) s.closeTutorialPopup();
};

/** `?testbridge=1` の時だけ窓を生やす。無指定では `window.__TEST_BRIDGE__` は `undefined` のまま。 */
export const installTestBridge = (): void => {
  if (!TEST_BRIDGE_ACTIVE) return;
  if (unsubscribe === null) watchSignificant();
  (window as unknown as Record<string, unknown>).__TEST_BRIDGE__ = { read, closeBlockingMenu };
};
