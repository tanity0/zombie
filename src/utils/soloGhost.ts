// 守護霊ソロ出撃(v0.25.3082・社長指示「実機テストに、守護霊をソロで出撃させたい
// (つまり守護霊ではないけど、強さをコピーして出撃)」)。
//
// **開発用のテスト機能**であってプレイヤー向けの遊びではない。よってUIは作らず、URLパラメータで入れる:
//   ?sologhost=1     … 守護霊の強さ(=保存済みの計測ビルド)をプレイヤーに被せて出撃する
// 守護霊そのものは召喚しない(=「守護霊ではないけど強さをコピー」)。
//
// 「強さ」の正体は `PlayerBuildSnapshot`(HP上限/速度/レベル/所持銃/アクティブ銃/近接/スキルと
// スキルLv/装備と装備効果/クリ率/装填数加算…)。守護霊が戦う時に使っているのと**同じ1枚**なので、
// これを被せれば「守護霊と同じ強さの自分」になる。
//
// ★式を複製しない: 被せ方は守護霊の疑似Playerを作る `buildPseudoPlayer`(playerBuild.ts)と、
// 武器復元は守護霊のビルド解決(ghostBuild.ts)と**同じ関数/同じ順序**を使う。ここで独自に
// 「HPだけコピー」等を書くと、守護霊本体と強さがズレて**テストの意味が無くなる**。
import type { Player, PlayerBuildSnapshot } from '../types/game';
import { buildPseudoPlayer, buildHasLoadout } from './playerBuild';
import { createWeapon } from './weaponUtils';

/** URLに ?sologhost=1 が付いているか(未定義環境=ヘッドレス/テストでは常にfalse)。 */
export const soloGhostRequested = (): boolean => {
  if (typeof window === 'undefined') return false;
  const v = new URLSearchParams(window.location.search).get('sologhost');
  return v !== null && v !== '0';
};

/**
 * 出撃直後のプレイヤーへ守護霊のビルドを被せる(純関数)。snapが無ければ**素通し**
 * (=まだ計測が無い端末では通常出撃になる。無言で弱いプレイヤーを作らない)。
 * 位置・向き・入力状態など「実体の状態」は live のまま(ビルドだけを写す)。
 */
export const applyGhostBuildToPlayer = (live: Player, snap: PlayerBuildSnapshot | undefined): Player => {
  if (!snap) return live;
  const base = buildPseudoPlayer(snap, live);
  // ロードアウト未記録の旧プロファイルは装備だけ引き継げないので、今の初期装備のまま(守護霊側と同じ扱い)。
  if (!buildHasLoadout(snap)) return { ...base, health: base.maxHealth };
  const guns = (snap.gunKeys ?? []).map(k => createWeapon(k));
  const melee = snap.meleeKey ? createWeapon(snap.meleeKey) : undefined;
  const weapons = [...guns, ...(melee ? [melee] : [])];
  if (weapons.length === 0) return { ...base, health: base.maxHealth };
  const active = guns.find(w => w.key === snap.activeGunKey) ?? guns[0];
  return {
    ...base,
    weapons,
    activeWeaponId: active?.id ?? weapons[0].id,
    health: base.maxHealth, // 満タンで出す(HP上限だけ上がって半分から始まる、を防ぐ)
  };
};
