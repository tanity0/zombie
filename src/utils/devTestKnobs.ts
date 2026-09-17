// research/WEAPON_AI_TEST.md S1-b(全武器AI実機テスト・道具作り専用): 出撃時に対象武器/サブを
// 強制する開発ツマミ。`?unlockall=1`(weaponSlot.ts)と同じ作法——**開発導線なので進行
// (localStorage)へは一切書き込まない**。URLはページロード時点(モジュール評価時)に1回だけ読む
// (以降の書き換えは反映しない=他の開発ツマミと同じ)。
// ★これは道具作りで、ゲームの遊びの仕様は1ミリも変えない: パラメータが無ければ両方とも
// null になり、参照側(getStartingWeapons/grantWeapon/resetGame等)は従来どおりの分岐を通る。
//
// 検証用の妥当キー集合は data/weaponSlots.ts(SLOT_CANDIDATES)と data/campaign.ts
// (SUB_WEAPON_KEYS/CHARACTER_SUBWEAPON_KEYS)から作る。どちらも純データファイルで
// weaponUtils.ts/weaponSlot.ts/gameStore.tsを import しないため、このファイルを
// それらから import しても循環にならない。
import { SLOT_CATEGORIES, SLOT_TIERS, SLOT_CANDIDATES } from '../data/weaponSlots';
import { SUB_WEAPON_KEYS, CHARACTER_SUBWEAPON_KEYS } from '../data/campaign';
import type { SubWeaponKey } from '../types/game';

const readUrlParam = (name: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
};

// SLOT_CANDIDATESの平坦化(ユニーク21挺+各カテゴリの既定キー)。weaponUtils.tsの
// DIRECT_GUN_WEAPON_KEYSと同じ作り方だが、循環import(weaponUtils→devTestKnobs→weaponUtils)を
// 避けるため同じ元データ(data/weaponSlots.ts)からここでも独立に組む。
const VALID_DEV_WEAPON_KEYS: ReadonlySet<string> = new Set<string>(
  SLOT_CATEGORIES.flatMap(cat => SLOT_TIERS.flatMap(tier => SLOT_CANDIDATES[cat][tier]))
);

/** `?weapon=<key>`: 出撃時の銃をそのキーの武器そのものにする(21ユニーク+各カテゴリ既定キーのみ有効)。 */
export const DEV_WEAPON_KEY: string | null = (() => {
  const v = readUrlParam('weapon');
  return v && VALID_DEV_WEAPON_KEYS.has(v) ? v : null;
})();

const VALID_DEV_SUB_KEYS: ReadonlySet<string> = new Set<string>([...SUB_WEAPON_KEYS, ...CHARACTER_SUBWEAPON_KEYS]);

/** `?sub=<key>`: 出撃時にサブウェポンを所持させる(装備選択で選べる候補+キャラ固有サブのみ有効)。 */
export const DEV_SUB_KEY: SubWeaponKey | null = (() => {
  const v = readUrlParam('sub');
  return v && VALID_DEV_SUB_KEYS.has(v) ? (v as SubWeaponKey) : null;
})();

/**
 * ★`?testbridge=1`: ローカルテスト用の読み取り口(`window.__TEST_BRIDGE__`)を生やす
 * (TEST_HANDOFF/REQUEST-devbridge.md A・社長裁定2026-09-17「URLツマミ方式」)。
 *
 * **無指定では何も定義しない。** 本番ビルド(preview/Pages)でも同じバイナリのまま切り替わるので、
 * テスト用ビルドを別に持つ必要がない(ビルド時defineだと preview を作るたびに `npm run build` が要り、
 * 裏で編集中のコードを焼いてしまう危険がある)。
 *
 * ★配布形態との突き合わせ: このゲームは**Web公開しない。最終形はアプリ配布/Steam**
 * (CLAUDE.md 配布方針)なので、**実機ではURLのクエリを叩く経路がプレイヤーに無い**。
 * 残る露出は GitHub Pages だけだが、Bridge は**読み取り + `closeBlockingMenu()` のみ**で、
 * クエリを付けて開かれてもメニューを閉じる以外に何もできない(チート価値なし)。
 */
export const TEST_BRIDGE_ACTIVE: boolean = readUrlParam('testbridge') === '1';

/** どちらかのテスト用ツマミが立っているか(S2-bの観測窓の露出ゲート等に使う)。 */
export const DEV_LOADOUT_ACTIVE: boolean = DEV_WEAPON_KEY !== null || DEV_SUB_KEY !== null;

/**
 * ★`?seed=<整数>`: ランの乱数系のうち **seed配下に入っているもの**(現状はレベルアップ自動選択=
 * `useGameLoop.ts` の `botRandRef`)を、この値で初期化する(TEST_HANDOFF/REQUEST-devbridge.md
 * **C. P0-3 の seed**)。他のURLツマミ(`?weapon=`/`?sub=`)と同じ作法=モジュール評価時に1回だけ読む。
 *
 * ★`?testbridge=1` には**依存させていない**(`TEST_BRIDGE_ACTIVE` を条件にしない)。理由:
 * `botRandRef` はボット自動プレイ(`?bot=`)のレベルアップ選択にのみ使われ、人間プレイでは
 * 触られない経路。Test Bridge(状態の読み取り)とは独立した機能なので、`?weapon=`/`?sub=` と同じ
 * 「単独で効くURLツマミ」にする(Bridgeが無くても `?seed=` 単体でボットランの再現性が取れる)。
 *
 * ★**無指定では通常プレイの挙動を1ミリも変えない**: `botRandRef` は元々 `mulberry32(1)` の
 * ベタ書き固定(=無指定の現状の挙動は「常にseed=1」で、`Math.random()`ではない)だったため、
 * 無指定時のフォールバックは**その既存デフォルト値である1を維持する**(呼び出し側で
 * `DEV_SEED_PARAM ?? 1` として使う)。「指定が無い時は生成した値を使う」ようにすると、
 * 現状は常にseed=1で固定されているランが無指定でも毎回変わることになり、通常プレイの挙動が
 * 変わってしまうため採らない(発注文Cの提案より、この発注の掟「無指定では挙動を変えない」を優先)。
 */
export const DEV_SEED_PARAM: number | null = (() => {
  const v = readUrlParam('seed');
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
})();
