// research/SAME_ARENA.md O-5「幻影の中身が『他人』になる」。
//
// これまでの幻影は **常に同じ1人**(`strongestGuardian()`)だった——頭脳(癖)も、ビルドも、名前も。
// 装備だけ他人にしても「戦い方が同じ1体」では**誰と戦っているかが生まれない**ので、
// **癖・ビルド・名前を必ず同じ人物から取る**のがこのモジュールの役目。
//
// 選び方(優先順):
//   ① オンラインの実プレイヤー(このランで取得済みの候補があれば)
//   ② 固定の先人守護霊20人から1人(ラン毎に抽選)= オフライン/未取得時のフォールバック
// ②でも**毎回違う人**になるので、「常に同じ1人」は①が無くても解消する。
//
// 掟: このモジュールは**判定と抽選だけ**。HP/武器/倍率の式は持たない(それは phantomTick と
// bossHealth の仕事)。乱数は注入可能=テストで固定できる。
import type { PlayerProfile } from './playerTraits';
import { FIXED_GUARDIANS, strongestGuardian } from '../data/fixedGuardians';
import { resolveRemoteGhost } from './ghostOnline';
import { ENGAGEABLE_BOSS_TYPES, isGhostEligibleBoss } from './bossEngagement';
import { bossStyleSlotKey } from './ghostSlot';

/** 幻影の「中身」= 1人ぶんの人格。癖(profile)・ビルド(profile.snapshot)・名前を必ずここから取る。 */
export interface PhantomIdentity {
  /** 表示名(素の人物名。「(幻影)」の付与は表示側)。 */
  name: string;
  /** 頭脳(癖)とビルド(snapshot)の出どころ。 */
  profile: PlayerProfile;
  /** どこから来た人か(通信・デバッグ表示用)。 */
  source: 'remote' | 'fixed';
}

/**
 * オンラインの実プレイヤー候補を1人拾う。
 * 候補は**ボススロット別**に取ってあるので、幻影(=スロットを持たない決闘)は
 * **取得済みのどれか1枠を借りる**。枠の選び方に意味は無いので、決定的に先頭から順に探す
 * (「たまたま取れていた人と戦う」で十分=誰と戦うかは中身で決まる)。
 *
 * ★取得そのものは `beginGhostOnlineRun`(gameStore)が担い、**プレイヤーが守護霊スキルを
 * 装備している時だけ**走る。よって幻影が実プレイヤーになるのは今のところ「そのランで
 * 守護霊オンラインが動いていた場合」に限られる。**幻影のために毎ラン取得しに行くかは未決**
 * (SAME_ARENA ★未決Q8)。
 */
export const remotePhantomProfile = (stageId: string): PlayerProfile | null => {
  for (const type of ENGAGEABLE_BOSS_TYPES) {
    if (!isGhostEligibleBoss(type)) continue;
    const cand = resolveRemoteGhost(bossStyleSlotKey(type, stageId));
    if (cand?.profile) return cand.profile;
  }
  return null;
};

/** 固定の先人守護霊20人から1人(ラン毎の抽選)。乱数は注入可能。 */
export const pickFixedPhantom = (random: () => number = Math.random): PhantomIdentity => {
  const roll = random();
  const safe = Number.isFinite(roll) ? Math.max(0, Math.min(0.999999999, roll)) : 0;
  const g = FIXED_GUARDIANS[Math.floor(safe * FIXED_GUARDIANS.length)] ?? strongestGuardian();
  return { name: g.name, profile: g.profile, source: 'fixed' };
};

/**
 * 幻影1体ぶんの「中身」を決める(スポーン時に1回だけ呼ぶ)。
 * ①オンラインの実プレイヤー → ②固定20人から抽選、の順。
 */
export const pickPhantomIdentity = (
  stageId: string,
  random: () => number = Math.random,
): PhantomIdentity => {
  const remote = remotePhantomProfile(stageId);
  if (remote) {
    const name = typeof (remote as { srcName?: unknown }).srcName === 'string'
      ? (remote as { srcName: string }).srcName
      : '???';
    return { name, profile: remote, source: 'remote' };
  }
  return pickFixedPhantom(random);
};

// ---------------------------------------------------------------------------------------------
// 現在の幻影の人格(スポーンで設定し、以後の描画・通信・tickが読む1箇所)
// ---------------------------------------------------------------------------------------------
let current: PhantomIdentity | null = null;

/** スポーン時に1回だけ設定する。 */
export const setPhantomIdentity = (identity: PhantomIdentity | null): void => { current = identity; };
/** 未設定なら null(呼び出し側は従来の固定値へ落ちる)。 */
export const getPhantomIdentity = (): PhantomIdentity | null => current;
/** ラン境界・テスト用。 */
export const clearPhantomIdentity = (): void => { current = null; };

/** 表示名(「◯◯(幻影)」)。未設定なら台帳の最強データ=従来の表示と1bit同じ。 */
export const phantomDisplayLabel = (): string =>
  `${current?.name ?? strongestGuardian().name}(幻影)`;
