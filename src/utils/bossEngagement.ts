// ボス交戦中の判定(社長裁定v0.25.2412)。
//
// なぜ要るのか: 社長方針「**敵が多くて難易度を上げるのは不評**(エルデンリング等のレビュー)」。
// ボス戦の難しさは**ボスの技を読むこと**から来るべきで、雑魚の数から来るべきではない。
// 見下ろし型でロックオンが無い本作は特にこの罠に弱く、実機ラン#1の死因も「敵の飛び道具」だった
// (=戦っている相手以外に殺された)。そこでボス交戦中だけ湧きを強制リラックスへ落とす。
//
// 既に同じ思想の実装が1つある: **ゲート戦中は死神を抑止**(v0.25.1555/1579・社長の実機報告発)。
// これはその考え方をボス全般へ広げたもの(社長裁定 質問③「全ボスで」)。
//
// 掟: **ここは判定するだけの純関数**。どう使うか(湧きを落とす/コマ時計を止める)は directorTick 側。
import type { Enemy, EnemyType } from '../types/game';
import { BOSS_ZOOM_PROFILES, bossZoomClassFor, zoomCompensatedWorldDistance, ZOOM_MIN_ABS } from './cameraZoom';
import { isBountyType, isGuardianPhantom } from './enemyUtils';

/**
 * 「交戦中」として扱うボスの型。
 *
 * **死神(reaper)は入れない**: 死神は"ボス戦"ではなく**追跡**のギミックで、深層に居る間ずっと
 * 湧いている可能性がある。ここに入れると深層の湧きが常時リラックスに落ちてしまい、ペーシング設計
 * (§6.27)が丸ごと壊れる。死神は既に「ゲート戦中は抑止」で別途面倒を見ている。
 *
 * **hunter も入れない**: ハンターは索敵→立ち去りのある巡回敵で、ボス戦の幕が上がる相手ではない。
 * (どちらも `isBossType` には含まれるので、`isBossType` を流用せず**この表を正本にする**。)
 */
// export はボス戦テストメニュー(bossTest.test.ts)の網羅突き合わせ用(読み取りのみ)。
export const ENGAGEABLE_BOSS_TYPES = new Set<EnemyType>([
  'giantbat',                                   // 城ボス(ジャイアント)+ ストーリーボス(グレン/未確認変異体)
  'mimir', 'jormungand', 'skadi', 'thor',       // 裏ボス4体
  'miguel', 'jibril', 'rafi', 'uri', 'suriel', 'acrasiel', // ゲート2ボス6体
  'idol',                                       // stage-2 隠しボス
  'phillboss',                                  // PACING_PUZZLE.md §10(EXボス「フィル(変異体)」・最奥ボス)
  // PACING_PUZZLE.md §6.38 v3(賞金首・社長裁定「城ボス方式に反転」): ズーム・リーシュじわ回復・
  // bossFightNow経由の先送り・施設ロックを既存土管でまとめて受けるため、城ボスと同じ交戦系に乗せる。
  'bounty-ranged', 'bounty-melee', 'bounty-balance', 'bounty-maiko',
  // research/GHOST_BOSS.md(守護霊ボス「幻影」・ボスモードの実験枠): HPバー/体勢値(紫)/ボス引きズーム/
  // 致命の一撃は**この集合由来**なので、ボスとして戦わせるには編入が必要。
  // ただし下の isGhostEligibleBoss(守護霊召喚等の5系統)からは賞金首と同様に除外する。
  'guardian-phantom',
]);

export const isEngageableBoss = (type: EnemyType): boolean => ENGAGEABLE_BOSS_TYPES.has(type);

/**
 * PACING_PUZZLE.md §6.38 v6 B-2(賞金首): 守護霊召喚/bossClock撃破タイム/notifyBossClearソロ台帳/
 * duoRecords/ghostOnlineのpickスロット列——この5系統は賞金首を**乗せない**(倒す義務のない相手を
 * ゴースト週間の対象に混ぜない)。ENGAGEABLE から賞金首だけを絞った専用集合を1箇所に作り、
 * 5系統全てがここを見る(個別に「賞金首を除く」条件を書き散らさない)。
 *
 * research/GHOST_BOSS.md(幻影): **守護霊ボス「幻影」も同じ理由で除外する。** 幻影は「守護霊の
 * データを相手として立てた実験枠」なので、ここへ入れると守護霊召喚(=守護霊 vs 守護霊)・撃破タイム・
 * ソロ/同行台帳・オンラインのスロット列に、本編の相手ではないものが混ざる。
 */
/** ★開幕の間合い調整ターン(社長指示2026-08-26)。出会ってからこの時間は技を出さない(移動=chaseは続く)。 */
export const BOSS_OPENING_HOLD_MS = 3000;

export const isGhostEligibleBoss = (type: EnemyType): boolean =>
  ENGAGEABLE_BOSS_TYPES.has(type) && !isBountyType(type) && !isGuardianPhantom(type);

// 交戦とみなす距離(社長質問v0.25.2416「ボスの画面外判定はハンターくらい広めならOK?」→ ハンター基準)。
// 基準値は旧ハンター相当。実ワールド距離はボス戦の引きズームに合わせて拡張する。
// **ヒステリシス必須**: 単一しきい値だと境界上で毎フレーム反転し、湧きの設定が振動する。
// v0.25.2968(社長スクショ3+指示「結構延々と遠くまで逃れちゃって、そのぶん引きになってるからやばい。
// 画面外でたらすぐ戻す」): v0.25.2954の2倍化(1800/2800/3000)を撤回し従来値へ戻す。広げた戦闘域は
// 「延々と引き離しながらカメラが引きっぱなし」を生んだ(実機で構図崩壊)。狭いバブル+即帰巣で締める。
export const BOSS_ENGAGE_ENTER_PX = 900;  // 等倍画面での基準。実ワールド距離はボスの遠距離ズームで換算する
export const BOSS_ENGAGE_EXIT_PX = 1400;  // 同上。これより画面上で離れたら交戦解除=**湧きが通常へ戻る**

/** ボス体格別の遠距離ズームと同率で、交戦の入口/出口をワールド距離へ広げる。 */
export const bossEngagementDistancePx = (
  type: EnemyType, engaged: boolean, isStoryBoss = false,
): number => {
  const farZoom = BOSS_ZOOM_PROFILES[bossZoomClassFor(type, isStoryBoss)].far;
  return zoomCompensatedWorldDistance(engaged ? BOSS_ENGAGE_EXIT_PX : BOSS_ENGAGE_ENTER_PX, farZoom);
};

/**
 * いま「ボスと交戦中」か。
 *
 * **① `dormant` を見るのが肝**。城ボスは出現直後は城で待機(`dormant: true`)し、プレイヤーが
 * `GIANT_AGGRO_RANGE` に入ると `dormant: false` になる。**これが「交戦をはじめた」そのもの**なので、
 * 自前の起動判定を書く必要がない。giantbat は再休眠しない(再休眠はラボの lab-zombie 専用)。
 *
 * **② 距離も見る**(社長指摘v0.25.2416「ボスが画面外で待機に入ったら、沸きが戻るとか?」)。
 * 起きているボスが遠くに取り残されると、距離を見ないと**湧きが永久にリラックスのまま**になる。
 * 画面外の遠くに居るボスは「交戦中」ではない=雑魚の湧きは通常へ戻す。
 *
 * `prev` は前フレームの判定(ヒステリシス用)。呼び出し側が持ち回る。
 */
export const bossEngagedNow = (
  enemies: readonly Enemy[], playerCx: number, playerCy: number, prev: boolean,
): boolean => {
  return enemies.some(e => {
    if (!isEngageableBoss(e.type) || e.dormant === true) return false;
    const limit = bossEngagementDistancePx(e.type, prev, e.isStoryBoss === true);
    const d = Math.hypot((e.x + e.width / 2) - playerCx, (e.y + e.height / 2) - playerCy);
    return d <= limit;
  });
};

/**
 * v0.25.2577(社長裁定「現状維持でいいんだけど、ボスごとのタイムにはしたいな」): 撃破タイム用の
 * **スロット(ボス×ステージ)ごと**の交戦判定。bossEngagedNowと同じENTER/EXITヒステリシスを
 * キー単位で適用する(prevKeys=前tickで交戦中だったキー集合。在=EXIT/不在=ENTER)。
 * 旧実装は交戦「窓」1本の時計だったため、交戦が途切れない連戦では2体目のタイムが1体目の交戦開始から
 * 数えられていた。同一スロットのボスが複数体いる縮退は「どれかが圏内なら交戦中」(台帳の粒度と同じ)。
 */
export const engagedBossSlotKeys = (
  enemies: readonly Enemy[], playerCx: number, playerCy: number,
  prevKeys: ReadonlySet<string>, slotKeyOf: (t: EnemyType) => string,
): Set<string> => {
  const keys = new Set<string>();
  for (const e of enemies) {
    if (!isEngageableBoss(e.type) || e.dormant === true) continue;
    const key = slotKeyOf(e.type);
    if (keys.has(key)) continue;
    const limit = bossEngagementDistancePx(e.type, prevKeys.has(key), e.isStoryBoss === true);
    const d = Math.hypot((e.x + e.width / 2) - playerCx, (e.y + e.height / 2) - playerCy);
    if (d <= limit) keys.add(key);
  }
  return keys;
};

// ---------------------------------------------------------------------------------------------
// リーシュ(社長裁定v0.25.2418「そのリーシュ方式で」)
// ---------------------------------------------------------------------------------------------
// 旧挙動: 起きた城ボスが遠ざかると、汎用オフスクリーンリサイクル(`runOffscreenRecycleAndCull`)が
// **HP/状態を保ったまま画面外の別位置へ再配置**していた。社長が「ワープしてくる」と感じていた正体。
// 新挙動: 離れ切ったら**その場で待機(dormant)へ戻す**。近づけば既存の aggroRange で再起動する。
//
// なぜ単純に「ワープを止める」だけでは駄目か: ボスの接近手段(突進/飛び掛かり/滑空)は全てCD付きなので、
// 離れて撃つだけで一方的に削れる=ハメが成立する。**待機に戻す**なら、離れている間は削れないので
// ハメにならない。かつテレポートも無くなる。
export const BOSS_LEASH_PX = 700; // v0.25.3065(社長指示「離脱線、700に下げる」)。旧: 1500(v3056)→1000(v3062)。
// v0.25.3056(社長裁定「距離を縮める」): ズーム換算(旧1500/0.44≈3409px)を撤回し**実距離固定**へ。旧値はボス速度70 vs プレイヤー87(差17px/s)+ジャンプ詰めで事実上
// 到達不能=「交戦が終わらない」の真因だった(v0.25.3055報告)。1500に縮めたことでリーシュ(待機)が
// 交戦解除距離(EXIT換算≈3181px)より**内側**で先に発火するが、待機(dormant)はbossEngagedNowが
// 即座に非交戦扱いにするため「待機なのに交戦中のまま」は起きない(テストも新不変条件へ更新済み)。
export const bossLeashDistancePx = (_type: EnemyType, _isStoryBoss = false): number => BOSS_LEASH_PX;

// v0.25.2968(社長指示「画面外でたらすぐ戻す」): 3000→1200ms。画面外/深層外が1.2秒続いたら帰巣開始。
export const BOSS_DISENGAGE_GRACE_MS = 1200;

// v0.25.3018(社長裁定・案A「プレイヤー中心の一律距離に統一」): 帰巣の圏内判定は、カメラ窓ではなく
// **プレイヤー中心の正方形(半径=画面長辺の半分+余白、引きズームで1/z拡大)**で行う。
// 旧カメラ窓基準は、カメラが北を向く構図(v2994〜のカメラ下げ+縦先読み)で「北≈2400/横≈1400/南≈700px」
// と方向で距離感が激変していた(社長報告「縦と横で戦線離脱の距離感全然違う」)。縦横南北すべて同じ距離で
// 粘る。従来どおり1.2秒猶予+交戦EXIT円が外側の上限として効く。
export const BOSS_RETREAT_KEEP_MARGIN_PX = 120; // 画面px余白(旧BOSS_SCREEN_MARGINと同値)
export const bossRetreatKeepRadiusPx = (
  viewport: { width: number; height: number }, zoom: number,
): number => {
  const z = Math.max(ZOOM_MIN_ABS, Math.min(1, Number.isFinite(zoom) && zoom > 0 ? zoom : 1));
  return (Math.max(viewport.width, viewport.height) / 2 + BOSS_RETREAT_KEEP_MARGIN_PX) / z;
};

// ---------------------------------------------------------------------------------------------
// 施設ロック(社長指示v0.25.3054「ボス戦中は拠点とか城とか全部非表示。商人と拠点も。全て。
// 戦闘解除されるとフェードインで復活」)
// ---------------------------------------------------------------------------------------------
// ボス交戦中(bossFightNow)+解除後の復帰猶予(=描画のフェードイン完了まで)の間、施設
// (病院/武器庫/警察署/拠点/武器商人/城)の発火・サークル滞在・当たり判定を止める。
// 猶予を置く理由(監査指摘): 解除の瞬間にゲートだけ先に開くと、まだ絵が薄い(alpha0.2)警察署から
// アリーナが発生する——「見えないのに発火する」を作らないため、絵が戻り切るまでロックを保持する。
export const FACILITY_REENABLE_MS = 700;
export const facilitiesLocked = (
  bossFightNow: boolean, bossFightLastTrueAt: number, now: number,
): boolean =>
  bossFightNow || (bossFightLastTrueAt > 0 && now - bossFightLastTrueAt < FACILITY_REENABLE_MS);

// ---------------------------------------------------------------------------------------------
// ボス戦後の余韻(社長指示2026-08-22「城ボス倒したあと、10秒はリラックスのままで」)
// ---------------------------------------------------------------------------------------------
// 旧: directorTick の `bossRelax` は `bossEngagedNow` の生値だったので、交戦が切れた**その1フレームで**
// 湧きが通常へ戻る=倒した直後に雑魚がドッと湧く(余韻がない)。
// 新: 施設ロック(facilitiesLocked)と**同型の尾**を付ける。新しい仕組みは作らず、しきい値だけ10秒。
// **撃破/離脱は区別しない**(社長の言葉は「倒したあと」だが、逃げ切った直後に通常の湧きへ戻るのも
// 同じく荒いため=交戦終了から10秒で1本。社長裁定=推薦どおり)。
// コマ進行(koma.elapsedMs)の停止も `if (!bossRelax)` のまま自動でこの尾に乗る。
export const BOSS_RELAX_TAIL_MS = 10000;
/**
 * 交戦中、または交戦が切れてから BOSS_RELAX_TAIL_MS 未満か。
 * `lastTrueAt` は「最後に交戦中だったゲーム内時刻」(呼び出し側が持ち回る)。
 * ラン跨ぎで gameTime が 0 へ戻った場合(now < lastTrueAt)は尾を無効にする=前ランの残り火で
 * 開幕がリラックスに落ちない。
 */
export const bossRelaxWithTail = (
  engagedNow: boolean, lastTrueAt: number, now: number,
): boolean =>
  engagedNow || (lastTrueAt > 0 && now >= lastTrueAt && now - lastTrueAt < BOSS_RELAX_TAIL_MS);

/** 範囲外が連続BOSS_DISENGAGE_GRACE_MS(現行1.2秒)続いた時だけ離脱。1フレームでも戻れば予兆を取り消す。 */
export const advanceBossDisengageGrace = (
  outside: boolean, since: number | undefined, now: number,
): { since: number | undefined; ready: boolean; started: boolean } => {
  if (!outside) return { since: undefined, ready: false, started: false };
  const started = since === undefined;
  const nextSince = since ?? now;
  return { since: nextSince, ready: now - nextSince >= BOSS_DISENGAGE_GRACE_MS, started };
};

/**
 * 待機へ戻す(リーシュする)ボス。**フィールドに出る城ボス系**+**賞金首4体**(v6 D-3・Set化)。
 * 裏ボスは専用コントローラが既に「深層外/画面外なら巣へ帰りつつ回復」を持っている(二重管理しない)。
 * ゲート2ボスは囲いの中の戦闘なので離脱の概念がない。
 * **賞金首はここに乗るが、消費するのは`updateEnemies`のgiantbat専用インライン処理ではなく
 * `bountyTick.ts`の専用コントローラ**(idolTick.ts と同じ「isHiddenBoss相当=専用コントローラで
 * 動く」型のため。isLeashableBoss/bossLeashDistancePx/BOSS_LEASH_REGEN_PER_SEC/
 * BOSS_LEASH_RETURN_SPEED_MULTという**同じ土管**をbountyTick側から直接読むことで、
 * 「離脱距離・じわ回復・帰巣速度の値の出どころ」を城ボスと1本に保つ(homeX/homeY必須・
 * isStoryBoss=falseが前提)。
 */
const LEASHABLE_BOSS_TYPES = new Set<EnemyType>(['giantbat', 'bounty-ranged', 'bounty-melee', 'bounty-balance', 'bounty-maiko']);
export const isLeashableBoss = (type: EnemyType): boolean => LEASHABLE_BOSS_TYPES.has(type);

/**
 * 待機中のじわじわ回復(社長「もし回復するなら、じわじわ回復を条件付きで検討」)。
 *
 * **ソウル系の標準は「じわじわ」ではなく「離脱=即・全快リセット」**(エルデンリングのフィールドボスも
 * デアグロで全快する)。狙いは「削って逃げて回復して戻る」消耗戦の封じ込め。
 * ただし本作は囲いのない開けたフィールドなので、**うっかり離れただけで進捗が全部消える**のは理不尽。
 * じわじわなら、離脱の代償が「離れていた時間」に比例する=消耗戦は成立しないまま事故は起きない。
 *
 * 速度は**裏ボスの既存定数と同値**(`BOSS_REGEN_PER_SEC = 10`/秒。社長が40→10へ調整済み)。
 * 新しい数字を発明せず、バランスの出どころを1つに保つ。城ボスのHPは500なので**全快まで50秒**。
 */
export const BOSS_LEASH_REGEN_PER_SEC = 10;

/**
 * リーシュで待機へ戻った城ボスが**巣(城)へ歩いて帰る**時の速度倍率
 * (社長指示v0.25.2419「城にゆっくり戻ってほしい」)。
 *
 * 追跡時の速度そのままだと「猛然と帰っていく」絵になって、戦意を失って引き上げる感じが出ない。
 * 半分にすると giantbat(speed=70)で 35px/s。ズーム換算後のリーシュ位置からゆっくり城へ戻る。
 * 帰巣中も回復する(裏ボスの帰巣と同じ扱い)ので、**完全に振り切ると進捗はほぼ戻る**=
 * 消耗戦は成立しない、という設計意図もこの速度で成立している。
 */
export const BOSS_LEASH_RETURN_SPEED_MULT = 0.5;
