// スキル「カウンターマスター」を守護霊・幻影にも(社長指示2026-11-22「守護霊や幻影も揃えないと矛盾する。矛盾するものは残さない」)。
//
// プレイヤーの仕様(utils/counterMaster.ts・gameStore.applyCounterMasterRefund / counterMasterOnCounterSuccess):
//  カウンター成立の瞬間に ①近接・サブウェポン・リロードの「残り」を Lv 別の割合で前倒し ②周りの敵を吹き飛ばす
//  ③覚醒(Lv3)=成立後3秒 全攻撃+30%。格闘のときは①②を付けない。
// ここは**同じ純関数**(counterMasterRefund / counterMasterAwakenBuffPatch / counterMasterBlowAround)を、
// 主語=守護霊・幻影の疑似プレイヤー(combatActorPlayer)で評価し、**宛先だけ**その実体の帳簿へ書く(式を写さない)。
//  - 守護霊: 成立の3経路(applyGhostCounterEffect / applyGhostReflectCounterFx の呼び手 / tryGhostContactParry)から呼ぶ。
//    近接の間隔は守護霊の頭脳の起点(ghostLastMeleeAt / ghostLastCounterAttemptAt)=起点を過去へずらして同じ割合だけ縮める。
//  - 幻影: 成立(gpParriedAt / gpBulletParriedAt の新しい打刻)を phantomTick が拾って呼ぶ。近接の周期(nextMeleeAt)・
//    銃のリロードは phantomTick の状態、サブは Enemy.phantomSubWeaponCooldowns。
//    幻影の吹き飛ばし(社長裁定2026-11-22): 周りのプレイヤー・守護霊・英雄を、プレイヤーの吹き飛ばしと同じ強さ・同じ関数
//    (gameStore.counterMasterBlowVector)で弾く。予告は出さない(成立の瞬間の効果=幻影の近接と同じ「予告なし」)。同じフレームで2回出さない。
//    格闘の幻影(拳鬼)の自動の反撃(相手のプレイヤー=ボス級とみなして気功の二連発)は utils/phantomBrawlerTick 側。
import type { Player } from '../types/game';
import {
  useGameStore, combatActorPlayer, skillLevel, isBrawlerMode, counterMasterAwakenBuffPatch, counterMasterBlowAround, counterMasterBlowOpponents,
} from '../store/gameStore';
import { counterMasterRefund, counterMasterRefundFrac, shortenRemaining, type CounterMasterRefundResult } from './counterMaster';
import { counterMasterSkipsRefundAndBlow } from './brawlerCounterMaster';
import { GHOST_MELEE_COOLDOWN_MS, GHOST_COUNTER_MELEE_PERIOD_MS } from './ghostDriver';
import { dashStateOf } from './dashLocomotion';

/**
 * 起点型の間隔(最後に振った時刻 startAt + 間隔 periodMs で次が出る)。次に出られる時刻の残りを frac ぶん前倒しするよう、
 * 起点を過去へずらす(=締切型の shortenRemaining と同じ割合)。未振り(undefined)はそのまま。
 */
export const refundStartAnchor = (startAt: number | undefined, periodMs: number, nowAt: number, frac: number): number | undefined => {
  if (startAt === undefined) return undefined;
  const end = startAt + periodMs;
  const moved = shortenRemaining(end, nowAt, frac);
  return moved === end ? startAt : moved - periodMs;
};

/** 主語(疑似プレイヤー)のカウンターマスターの Lv。格闘のときは前倒し・吹き飛ばしを付けない(プレイヤーと同じ関所)。 */
const refundLevelOf = (actor: Player): number =>
  counterMasterSkipsRefundAndBlow(isBrawlerMode(actor)) ? 0 : skillLevel(actor, 'counter-master');

/** 守護霊・幻影に無い帳簿(鞭の回数・ハンティング・錬金術)は「無し」で渡す=前倒しの対象にならない。 */
const NEUTRAL_FIELDS = {
  huntingChargeStartedAt: 0, huntingCharged: false, whipHitCount: 0, whipCharged: false,
  alchemyChannelStartedAt: 0, alchemyRhythm: undefined,
} as const;

/**
 * 守護霊のカウンター成立の瞬間(成立1回につき1回)。未所持(Lv0)・居ない守護霊は何もしない。
 * 吹き飛ばしは同じフレーム(gameTime)に何度成立しても1回(プレイヤーの成立の縁と同じ)。
 */
export const applyGhostCounterMaster = (ghostId: string, nowMs: number = Date.now()): void => {
  const st = useGameStore.getState();
  const g = st.summons.find(s => s.id === ghostId && s.kind === 'ghost-ally');
  if (!g) return;
  const actor = combatActorPlayer(ghostId);
  if (!actor || !skillLevel(actor, 'counter-master')) return;
  const gameTime = st.gameTime;
  const lv = refundLevelOf(actor);
  const buff = counterMasterAwakenBuffPatch(actor, gameTime).counterMasterBuffUntil;
  const blow = lv > 0 && g.ghostCounterMasterBlowAt !== gameTime;
  let r: CounterMasterRefundResult = { player: {} };
  let lastMeleeAt = g.ghostLastMeleeAt;
  let lastCounterAttemptAt = g.ghostLastCounterAttemptAt;
  if (lv > 0) {
    const dash = dashStateOf(g.ghostDash);
    r = counterMasterRefund({
      counterMasterLv: lv, nowMs, gameTime,
      player: {
        ...NEUTRAL_FIELDS,
        counterCooldownEnd: 0, // 守護霊の近接の間隔は起点型(下の refundStartAnchor)
        subWeapons: actor.subWeapons, subWeaponCooldowns: g.ghostSubWeaponCooldowns ?? {},
        reloadEndsAt: g.ghostReloadEndsAt ?? 0, reloadingWeaponId: g.ghostReloadingWeaponId ?? '',
        katanaDashCooldownEnd: dash.katanaDashCooldownEnd, katanaDashUntil: dash.katanaDashUntil,
      },
      sensorMineCharges: g.ghostSensorMineCharges ?? [], supportSniperCdMs: g.ghostSupportSniperCdMs ?? 0,
      huntingChargeMs: 0, whipChargeHits: 0, alchemyChannelMs: 0,
    });
    const frac = counterMasterRefundFrac(lv);
    lastMeleeAt = refundStartAnchor(g.ghostLastMeleeAt, g.ghostMicroMeleeCooldownMs ?? GHOST_MELEE_COOLDOWN_MS, nowMs, frac);
    lastCounterAttemptAt = refundStartAnchor(g.ghostLastCounterAttemptAt, GHOST_COUNTER_MELEE_PERIOD_MS, nowMs, frac);
  }
  const rp = r.player;
  useGameStore.setState(s => ({
    summons: s.summons.map(x => x.id !== ghostId ? x : {
      ...x,
      ...(buff !== undefined ? { actorCounterMasterBuffUntil: buff } : {}),
      ...(lastMeleeAt !== x.ghostLastMeleeAt ? { ghostLastMeleeAt: lastMeleeAt } : {}),
      ...(lastCounterAttemptAt !== x.ghostLastCounterAttemptAt ? { ghostLastCounterAttemptAt: lastCounterAttemptAt } : {}),
      ...(rp.subWeaponCooldowns ? { ghostSubWeaponCooldowns: rp.subWeaponCooldowns } : {}),
      ...(rp.reloadEndsAt !== undefined ? { ghostReloadEndsAt: rp.reloadEndsAt } : {}),
      ...(rp.katanaDashCooldownEnd !== undefined ? { ghostDash: { ...dashStateOf(x.ghostDash), katanaDashCooldownEnd: rp.katanaDashCooldownEnd } } : {}),
      ...(r.sensorMineCharges ? { ghostSensorMineCharges: r.sensorMineCharges } : {}),
      ...(r.supportSniperCdMs !== undefined ? { ghostSupportSniperCdMs: r.supportSniperCdMs } : {}),
      ...(blow ? { ghostCounterMasterBlowAt: gameTime } : {}),
    }),
  }));
  if (blow) counterMasterBlowAround(g.x + g.width / 2, g.y + g.height / 2, actor);
};

/** 幻影の近接の周期・銃のリロード(phantomTick の状態のうち、前倒しの対象)。 */
export interface PhantomCounterMasterClocks {
  /** 次に近接を振ってよい時刻(gameTime)。 */
  nextMeleeAt: number;
  /** リロードの終わり(Date.now)。 */
  reloadEndsAt: number;
  reloadingWeaponId: string;
  /** 吹き飛ばしを最後に出した gameTime(同じフレームで2回出さない)。ここで書く。 */
  counterMasterBlowAt?: number;
}

/**
 * 幻影のカウンター成立の瞬間(成立1回につき1回・phantomTick が打刻の新しさで拾う)。clocks は書き換える。
 * 幻影の Enemy の欄(サブの帳簿・援護射撃・覚醒の締め切り)はここで store へ書く(同じ tick の後の書き込みを古い値で潰さないよう、パッチにしない)。
 * 格闘の幻影(拳鬼)は前倒し・吹き飛ばしを付けない(プレイヤーの格闘と同じ=代わりに自動の反撃・utils/phantomBrawlerTick)。覚醒の+30%はプレイヤーと同じく付く。
 */
export const applyPhantomCounterMaster = (
  phantomId: string, clocks: PhantomCounterMasterClocks, gameTime: number, nowMs: number, brawler: boolean,
): void => {
  const actor = combatActorPlayer(phantomId);
  if (!actor || !skillLevel(actor, 'counter-master')) return;
  const e = useGameStore.getState().enemies.find(x => x.id === phantomId);
  if (!e) return;
  const buff = counterMasterAwakenBuffPatch(actor, gameTime).counterMasterBuffUntil;
  const lv = brawler ? 0 : refundLevelOf(actor);
  let r: CounterMasterRefundResult = { player: {} };
  if (lv > 0) {
    r = counterMasterRefund({
      counterMasterLv: lv, nowMs, gameTime,
      player: {
        ...NEUTRAL_FIELDS,
        counterCooldownEnd: 0, // 近接の周期は gameTime の時計(下で同じ割合を当てる)
        subWeapons: actor.subWeapons, subWeaponCooldowns: e.phantomSubWeaponCooldowns ?? {},
        reloadEndsAt: clocks.reloadEndsAt, reloadingWeaponId: clocks.reloadingWeaponId,
        katanaDashCooldownEnd: 0, katanaDashUntil: 0, // 幻影は刀を使わない
      },
      sensorMineCharges: [], supportSniperCdMs: e.gpSupportSniperCdMs ?? 0,
      huntingChargeMs: 0, whipChargeHits: 0, alchemyChannelMs: 0,
    });
    clocks.nextMeleeAt = shortenRemaining(clocks.nextMeleeAt, gameTime, counterMasterRefundFrac(lv));
    if (r.player.reloadEndsAt !== undefined) clocks.reloadEndsAt = r.player.reloadEndsAt;
  }
  const rp = r.player;
  // 吹き飛ばし(格闘の幻影は付けない=lv 0・プレイヤーの格闘と同じ関所)。中心=幻影の体。
  if (lv > 0 && clocks.counterMasterBlowAt !== gameTime) {
    clocks.counterMasterBlowAt = gameTime;
    counterMasterBlowOpponents(e.x + e.width / 2, e.y + e.height / 2, actor, phantomId);
  }
  if (buff === undefined && !rp.subWeaponCooldowns && r.supportSniperCdMs === undefined) return;
  useGameStore.setState(s => ({
    enemies: s.enemies.map(x => x.id !== phantomId ? x : {
      ...x,
      ...(buff !== undefined ? { actorCounterMasterBuffUntil: buff } : {}),
      ...(rp.subWeaponCooldowns ? { phantomSubWeaponCooldowns: rp.subWeaponCooldowns } : {}),
      ...(r.supportSniperCdMs !== undefined ? { gpSupportSniperCdMs: r.supportSniperCdMs } : {}),
    }),
  }));
};
