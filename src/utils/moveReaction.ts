// BOT_AND_GHOST.md §2.9 G4a(1): 技への反応表(per-move reactions)の判定中核。**計測のみ・記録専用**で、
// ゲームの挙動・判定・数値には一切影響しない(呼び出し側=playerTraits.tsのセッションからだけ使われる)。
// komaLog.ts/playerTraits.tsと同じ流儀: 純関数+小さな状態オブジェクト。store/React/PixiJS非依存。
//
// 単位=「暴露」(§2.9(1)): ボスの技が1回解決する(=技のエピソードが1回終わる)たび、プレイヤーが
// その技の狙い対象(ヘイトのロック対象) or 危険域内に居たなら1暴露。結果は3分類・優先順位
// **counter > hit > dodge**:
//  - counter: その技の間にカウンター成立(成立7箇所=counterMaster.tsのリファンド呼び出し箇所と同じ)
//  - hit: その技のダメージを食らった(damagePlayerのdamageSourceMoveタグ経由)
//  - dodge: 暴露されたが無傷(上2つ以外の残り)
//
// 実装メモ(計測上の解釈・挙動には無関係):
//  - 計測はゴースト不在ラン限定(playerTraits側のゲート)なので、狙いをロックする技(aimed)の
//    ロック対象は常にプレイヤー=技が解決した時点で暴露1と数える。自己中心でロックを持たない技
//    (g-stomp/g-nova)だけ「危険域内に居たか」を溜め(windup/active)中の距離で判定する。
//  - エピソード終了後も MOVE_REACTION_LINGER_MS の間は「残響」として保持する: 遅延起爆
//    (giantDelayedHits)や飛翔中の咆哮弾など、技のフェーズが終わった後に届くダメージ/反射カウンター
//    をその技に帰属させるため。残響を過ぎて届いた分(例: グレンの血溜まり床の踏み直し)は数えない。
//  - counterのマークは「開いているエピソード全部(無ければ残響中のエピソード)」= §2.9の文言どおり
//    時間窓の帰属(その技"の間"に成立)。hitは技キー付きなのでキー一致で帰属する。
//  - counter/hit が付いたエピソードは暴露も真にする(危険域サンプリングの取りこぼし防止。
//    当たった/構えて弾いた=その技と関わったことが確定しているため)。
import type { Enemy } from '../types/game';

// ---- 技キーの台帳(G2.5のボス×技表=DEVELOPMENT_LOG v0.25.2448 の名称に揃える) -------------------
// G4a対象=城ボス系(giantbat: 通常5技+ステージ技+グレン技)+トール(4技)。G4b(天使/idol/裏ボス)は対象外。
export const MOVE_REACTION_KEYS = [
  'g-stomp', 'g-sweep', 'g-jump', 'g-dash', 'g-bolt',
  'g-trijump', 'g-bite', 'g-slam', 'g-glide', 'g-dive', 'g-quad', 'g-nova', 'g-wing', 'g-sweepbeam',
  'g-talon', 'g-boon', 'g-reach', 'g-nihil',
  'g-tailslam', // v0.25.3139: 尻尾の叩きつけ→弾連射(帯の一撃。連射する弾は既存の胴体弾='g-parts')
  'thor-issen', 'thor-tsuki', 'thor-harai', 'thor-jump',
  // v0.25.2603(社長指示「ちゃんと広げて揃えましょう」): **残り全ボスの近接/AoE技**。
  // ここが城ボス+トールだけで止まっていたため、天使6体/アイドル/裏ボス3体は「弾を撃つ技」しか
  // 記録されず(BULLET_MOVE_KEYS=v0.25.2543で全数化済み)、評点・技への反応・避け方向の全部が
  // 出せなかった。状態名は各ボスの状態機械から全数を洗って対応させる(下の *_STATE_TO_MOVE)。
  // 裏ボス3体(useGameLoop.ts)。burst/radial は弾台帳に既出なのでここには入れない。
  'mimir-bite', 'mimir-laser', 'mimir-dash',
  'jormungand-coil', 'jormungand-dash',
  'skadi-ice', 'skadi-blade', 'skadi-cage', 'skadi-dash',
  // 天使6体(angelBossTick.ts)。volley/bolt/gaze は弾台帳に既出。
  'miguel-mdash', 'miguel-tate', 'miguel-harai',
  'jibril-consecrate', 'jibril-lantern',
  'rafi-bone', 'rafi-jump', 'rafi-sweep',
  'uri-downslash', 'uri-sweep', 'uri-thrust',
  'suriel-ring', 'suriel-sweep',
  'acrasiel-burst', 'acrasiel-spear', 'acrasiel-spike',
  // アイドル(useGameLoop.ts)。aim/fan は弾台帳に既出。
  'idol-roll', 'idol-punch',
  // v0.25.2613(バッチ3・idolのMAX化): 狙撃線=帯の近接技。追尾弾は弾台帳(下)へ。
  'idol-snipe',
  // PACING_PUZZLE.md §6.38 B2a(賞金首・bountyTick.ts): バス停/馬乗りの近接/レーザー技。
  'br-push', 'br-laser',
  'bm-charge', 'bm-combo1', 'bm-combo2', 'bm-combo3', 'bm-snipe',
] as const;

// ---- 弾技の台帳(GHOST-BULLET-TECH・v0.25.2543) -------------------------------------------------
// 社長方針「**弾も技である以上、記録に弾を避ける確率、避ける動きもあるべき**」。上のG4a台帳は
// 城ボス(giantbat)とトールの近接/AoE技しか持たず、**弾で被弾しても技別に記録されなかった**
// (弾で技キーが付くのは g-bolt だけ=combatTick の ownerType 判定)。ここでボス
// (isEngageableBoss)の**弾を撃つ技**を全数台帳化する。
//
// 掟(CLAUDE.md v0.25.2426の教訓「同じ"動作"を持つ全員に付ける」): 弾の発射は
// **3実装経路**に分かれている。1経路だけ書くと必ず取りこぼすので全部を洗って表に載せる:
//   ① gameStore.ts   : giantbat の咆哮弾(aiPhase 'g-bolt-*')= 既存 MOVE_REACTION_KEYS の 'g-bolt'
//   ② useGameLoop.ts : 裏ボス4体(mimir/jormungand/skadi/thor)の burst/radial + idol の aim/fan
//   ③ angelBossTick.ts: 天使(miguel/jibril の volley・uri の bolt・suriel/acrasiel の gaze)
// ※弾を撃たない技(acrasielのburst=自己中心の爆発、rafiの骨=別エンティティ)は**入れない**。
export const BULLET_MOVE_KEYS = [
  'mimir-burst', 'mimir-radial',
  'jormungand-burst', 'jormungand-radial',
  'skadi-burst', 'skadi-radial',
  'thor-burst', 'thor-radial',
  'miguel-volley', 'jibril-volley', 'uri-bolt', 'suriel-gaze', 'acrasiel-gaze',
  'idol-aim', 'idol-fan', 'idol-orb',
  // v0.25.3027(社長裁定): グレン第二形態の胴体弾(連結パーツからのV字斉射・gameStore.ts)。
  // 専用aiPhaseを持たない周期斉射のため状態表(BULLET_STATE_TO_MOVE)からは引けず、
  // 発射側が生成後に srcMoveKey を直接付ける(監査指摘対応)。
  'g-parts',
  // 射撃部品(v0.25.2638・BOSS_MAKER.md): 社長がメーカーで足す弾撃ち技の8枠。
  // **技キーは枠の記号(s1〜s8)で固定**する——社長が付けた名前(「ジャブ」等)は実行中に変わるので、
  // 記録のキーに使うと**同じ技の記録が名前を変えた瞬間に分断される**。表示名は引く側で解決する。
  'idol-s1', 'idol-s2', 'idol-s3', 'idol-s4', 'idol-s5', 'idol-s6', 'idol-s7', 'idol-s8',
] as const;
export type BulletMoveKey = (typeof BULLET_MOVE_KEYS)[number];

/**
 * idol の射撃枠の**複製値**(v0.25.2638)。このファイルは store/ボス実装に依存しない層なので、
 * 状態名は全て文字列リテラルで持つ流儀にしてある(`GIANT_STOMP_RADIUS_MIRROR` と同じ確立済みの作法)。
 * 本体は `idolScript.IDOL_SHOT_SLOTS`。**ズレたら moveReaction.test.ts が落ちる**。
 */
const IDOL_SHOT_SLOTS_MIRROR = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'] as const;

export type MoveReactionKey = (typeof MOVE_REACTION_KEYS)[number] | BulletMoveKey;
const MOVE_KEY_SET: ReadonlySet<string> = new Set<string>(MOVE_REACTION_KEYS);

/** エピソード終了後もこのms間はhit/counterの帰属先として残す(遅延起爆・飛翔中の弾の着弾を拾う)。 */
export const MOVE_REACTION_LINGER_MS = 2000;

// 自己中心技(狙いロックを持たない)の危険域判定用の複製値。store非依存を保つためgameStore.tsからは
// importせず同じ値を複製する(playerTraits.tsのMELEE_RADIUS_MIRRORと同じ確立済みの作法)。
// g-stompは溜め開始時にステージ倍率込みの実半径が enemy.gStompRadius へ確定するのでそちらを優先。
const GIANT_STOMP_RADIUS_MIRROR = 130;  // = gameStore.GIANT_STOMP_RADIUS(★v0.25.2893: 旧92が130への変更に取り残されていた。gStompRadius欠落時のフォールバックのみで使用)
const GIANT_NOVA_RADIUS_END_MIRROR = 400; // = gameStore.GIANT_NOVA_RADIUS_END(輪の最大半径)

// 判定に必要な最小限のEnemyフィールド(テストを軽くするためのPick)。
export type MoveReactionEnemy = Pick<
  Enemy, 'id' | 'type' | 'aiPhase' | 'bossState' | 'x' | 'y' | 'width' | 'height' | 'gStompRadius'
>;

// 自己中心技: 暴露=「この技のこのフェーズ中に半径内へ居たか」。それ以外の技は全てaimed
// (ロック対象=プレイヤー)なので技の解決そのものが暴露になる。
const SELF_EXPOSURE: Partial<Record<MoveReactionKey, {
  phases: readonly string[];
  radius: (e: MoveReactionEnemy) => number;
}>> = {
  'g-stomp': { phases: ['g-stomp-windup'], radius: e => e.gStompRadius ?? GIANT_STOMP_RADIUS_MIRROR },
  'g-nova': { phases: ['g-nova-windup', 'g-nova-active'], radius: () => GIANT_NOVA_RADIUS_END_MIRROR },
};

// ---- 技キーの導出(純関数) ---------------------------------------------------------------------
// giantbat: aiPhase 'g-<move>-...' → 'g-<move>'(例: g-quad-breath-windup → g-quad / g-nihil-chant1 → g-nihil)。
// thor: bossState → thor-issen/tsuki/harai/jump(counter-leap/backstep/orbit-step/chase等は技ではない=null)。
// 名前が他ボスと衝突する状態('harai'等はミゲルも使う)があるため必ずtypeでゲートする。
const GIANT_MOVE_RE = /^g-([a-z]+)/;
const THOR_STATE_TO_MOVE: Readonly<Record<string, MoveReactionKey>> = {
  'issen-windup': 'thor-issen', 'issen-dash': 'thor-issen', 'issen-recover': 'thor-issen',
  'tsuki-windup': 'thor-tsuki', 'tsuki': 'thor-tsuki', 'tsuki-recover': 'thor-tsuki',
  'harai-windup': 'thor-harai', 'harai': 'thor-harai', 'harai-recover': 'thor-harai',
  'jump-windup': 'thor-jump', 'jump-attack': 'thor-jump', 'jump-recover': 'thor-jump',
};

/**
 * v0.25.2603: 近接/AoE技の状態→技キー(**必ず type でゲートする**: 状態名は複数のボスで衝突する。
 * 'sweep-*'=rafi/uri/suriel、'burst-*'=acrasiel と裏ボス、'gaze-*'=suriel/acrasiel、'jump-*'=rafi/thor)。
 * **その技の全フェーズ(溜め/実行/硬直)を同じキーへ寄せる**のが掟(THOR_STATE_TO_MOVE と同じ流儀)。
 * 中間フェーズを載せ忘れるとエピソードが途中で閉じて開き直る=**1つの技が2回に数えられる**。
 * 移動だけの状態(warp系・counter-leap・backstep・chase・return)は技ではないので**載せない**。
 */
const MELEE_STATE_TO_MOVE: Readonly<Partial<Record<string, Readonly<Record<string, MoveReactionKey>>>>> = {
  // ---- 裏ボス3体(useGameLoop.ts) ----
  mimir: {
    'bite-windup': 'mimir-bite', 'bite-recover': 'mimir-bite',
    'laser-windup': 'mimir-laser', 'laser-fire': 'mimir-laser', 'laser-recover': 'mimir-laser',
    'laser-broken': 'mimir-laser', // §6.33: 中断硬直もレーザーの一フェーズ(掟: 全フェーズを同じキーへ)
    'dash-windup': 'mimir-dash', dash: 'mimir-dash', 'dash-recover': 'mimir-dash',
  },
  jormungand: {
    'coil-windup': 'jormungand-coil', coil: 'jormungand-coil', 'coil-recover': 'jormungand-coil',
    'dash-windup': 'jormungand-dash', dash: 'jormungand-dash', 'dash-recover': 'jormungand-dash',
  },
  skadi: {
    'skadi-ice-windup': 'skadi-ice', 'skadi-ice': 'skadi-ice', 'skadi-ice-recover': 'skadi-ice',
    'skadi-blade-windup': 'skadi-blade', 'skadi-blade': 'skadi-blade', 'skadi-blade-recover': 'skadi-blade',
    'cage-windup': 'skadi-cage', 'cage-recover': 'skadi-cage',
    'dash-windup': 'skadi-dash', dash: 'skadi-dash', 'dash-recover': 'skadi-dash',
  },
  // ---- 天使6体(angelBossTick.ts) ----
  miguel: {
    'mdash-windup': 'miguel-mdash', 'mdash-move': 'miguel-mdash', 'mdash-recover': 'miguel-mdash',
    'tate-windup': 'miguel-tate', tate: 'miguel-tate', 'tate-recover': 'miguel-tate',
    'harai-windup': 'miguel-harai', harai: 'miguel-harai',
  },
  jibril: {
    'consecrate-windup': 'jibril-consecrate', 'consecrate-recover': 'jibril-consecrate',
    'lantern-windup': 'jibril-lantern', lantern: 'jibril-lantern', 'lantern-recover': 'jibril-lantern',
  },
  rafi: {
    'bone-windup': 'rafi-bone', bone: 'rafi-bone', 'bone-recover': 'rafi-bone',
    'jump-windup': 'rafi-jump', 'jump-attack': 'rafi-jump', 'jump-recover': 'rafi-jump',
    'sweep-windup': 'rafi-sweep', sweep: 'rafi-sweep', 'sweep-recover': 'rafi-sweep',
  },
  uri: {
    'downslash-windup': 'uri-downslash', downslash: 'uri-downslash', 'downslash-recover': 'uri-downslash',
    'sweep-windup': 'uri-sweep', sweep: 'uri-sweep', 'sweep-recover': 'uri-sweep',
    'thrust-windup': 'uri-thrust', thrust: 'uri-thrust', 'thrust-recover': 'uri-thrust',
  },
  suriel: {
    // 輪は3系統の溜め(移動/ビーム/回転)から実行・硬直まで**1つの技**として扱う。
    'ring-move-windup': 'suriel-ring', 'ring-beam-windup': 'suriel-ring', 'ring-spin-windup': 'suriel-ring',
    'ring-active': 'suriel-ring', 'ring-spin': 'suriel-ring',
    'ring-recover': 'suriel-ring', 'ring-spin-recover': 'suriel-ring',
    'sweep-windup': 'suriel-sweep', sweep: 'suriel-sweep', 'sweep-recover': 'suriel-sweep',
  },
  acrasiel: {
    'burst-windup': 'acrasiel-burst', burst: 'acrasiel-burst', 'burst-recover': 'acrasiel-burst',
    'spear-windup': 'acrasiel-spear', 'spear-recover': 'acrasiel-spear',
    'spike-windup': 'acrasiel-spike', spike: 'acrasiel-spike', 'spike-recover': 'acrasiel-spike',
  },
  // ---- アイドル(useGameLoop.ts) ----
  idol: {
    'idol-roll-windup': 'idol-roll', 'idol-roll': 'idol-roll', 'idol-roll-recover': 'idol-roll',
    'idol-punch-windup': 'idol-punch', 'idol-punch-recover': 'idol-punch',
    'idol-snipe-windup': 'idol-snipe', 'idol-snipe': 'idol-snipe', 'idol-snipe-recover': 'idol-snipe',
  },
  // ---- 賞金首(§6.38 B2a・bountyTick.ts) ----
  // 'laser-windup'/'laser-fire'/'laser-recover'/'laser-broken' はミーミルと状態名を共有する
  // (usesMimirLaser経由の輸入=§4②)。ここはtypeでゲートしているのでミーミル側('mimir-laser')とは
  // 衝突しない=別の技キーへ集計される。
  'bounty-ranged': {
    'br-push-windup': 'br-push', 'br-push': 'br-push', 'br-push-recover': 'br-push',
    'laser-windup': 'br-laser', 'laser-fire': 'br-laser', 'laser-recover': 'br-laser', 'laser-broken': 'br-laser',
  },
  'bounty-melee': {
    'bm-charge-windup': 'bm-charge', 'bm-charge': 'bm-charge', 'bm-charge-recover': 'bm-charge',
    'bm-combo1-windup': 'bm-combo1', 'bm-combo1-recover': 'bm-combo1',
    'bm-combo2-windup': 'bm-combo2', 'bm-combo2-recover': 'bm-combo2',
    'bm-combo3-windup': 'bm-combo3', 'bm-combo3-recover': 'bm-combo3',
    'bm-snipe-windup': 'bm-snipe', 'bm-snipe': 'bm-snipe', 'bm-snipe-recover': 'bm-snipe',
  },
};

// 弾技の状態→技キー(GHOST-BULLET-TECH)。**必ず type でゲートする**: 状態名は複数のボスで衝突する
// ('volley'=miguel/jibril、'burst'/'radial'=裏ボス4体、'gaze-windup'=suriel/acrasiel)。
// 溜め(windup)・実行・硬直(recover)の**全フェーズ**を同じキーへ寄せる(THOR_STATE_TO_MOVE と同じ流儀)=
// エピソードが技の間ずっと開いたままになり、飛翔中の弾の着弾は残響(linger)で帰属できる。
const BULLET_STATE_TO_MOVE: Readonly<Partial<Record<string, Readonly<Record<string, BulletMoveKey>>>>> = {
  // 裏ボス4体(useGameLoop.ts): aim-burst→burst→burst-recover / aim-radial→radial→radial-recover。
  // ※thor は台本(?thorscript=1)では弾を撃たない=旧挙動フォールバック(?thorscript=0)専用。
  mimir: {
    'aim-burst': 'mimir-burst', burst: 'mimir-burst', 'burst-recover': 'mimir-burst',
    'aim-radial': 'mimir-radial', radial: 'mimir-radial', 'radial-recover': 'mimir-radial',
  },
  jormungand: {
    'aim-burst': 'jormungand-burst', burst: 'jormungand-burst', 'burst-recover': 'jormungand-burst',
    'aim-radial': 'jormungand-radial', radial: 'jormungand-radial', 'radial-recover': 'jormungand-radial',
  },
  skadi: {
    'aim-burst': 'skadi-burst', burst: 'skadi-burst', 'burst-recover': 'skadi-burst',
    'aim-radial': 'skadi-radial', radial: 'skadi-radial', 'radial-recover': 'skadi-radial',
  },
  thor: {
    'aim-burst': 'thor-burst', burst: 'thor-burst', 'burst-recover': 'thor-burst',
    'aim-radial': 'thor-radial', radial: 'thor-radial', 'radial-recover': 'thor-radial',
  },
  // 天使(angelBossTick.ts)。
  miguel: { 'volley-windup': 'miguel-volley', volley: 'miguel-volley', 'volley-recover': 'miguel-volley' },
  jibril: { 'volley-windup': 'jibril-volley', volley: 'jibril-volley', 'volley-recover': 'jibril-volley' },
  uri: { 'bolt-windup': 'uri-bolt', bolt: 'uri-bolt', 'bolt-recover': 'uri-bolt' },
  // 視線弾は windup の終わりに1発撃って即 recover へ移る(active フェーズが無い)。
  suriel: { 'gaze-windup': 'suriel-gaze', 'gaze-recover': 'suriel-gaze' },
  acrasiel: { 'gaze-windup': 'acrasiel-gaze', 'gaze-recover': 'acrasiel-gaze' },
  // idol(idolTick.ts)。roll/punch は近接なので入れない。
  idol: {
    'idol-aim-windup': 'idol-aim', 'idol-aim-recover': 'idol-aim',
    'idol-fan-windup': 'idol-fan', 'idol-fan-recover': 'idol-fan',
    'idol-orb-windup': 'idol-orb', 'idol-orb-recover': 'idol-orb',
    // 射撃部品の8枠(v0.25.2638)。溜め/連射中/硬直の3フェーズを**同じキーへ寄せる**
    // (飛翔中の弾を残響で帰属させるため=既存の弾技と同じ作法)。
    ...Object.fromEntries(IDOL_SHOT_SLOTS_MIRROR.flatMap(m => [
      [`idol-${m}-windup`, `idol-${m}`],
      [`idol-${m}-fire`, `idol-${m}`],
      [`idol-${m}-recover`, `idol-${m}`],
    ])) as Record<string, BulletMoveKey>,
  },
};

/** 弾技の技キー導出(弾を撃つ技だけ)。非ボス/弾を撃たない技は null。 */
export const bulletMoveKeyForEnemy = (
  e: Pick<MoveReactionEnemy, 'type' | 'bossState'>,
): BulletMoveKey | null => {
  if (!e.bossState) return null;
  return BULLET_STATE_TO_MOVE[e.type]?.[e.bossState] ?? null;
};

export const moveKeyForEnemy = (
  e: Pick<MoveReactionEnemy, 'type' | 'aiPhase' | 'bossState'>,
): MoveReactionKey | null => {
  if (e.type === 'giantbat' && e.aiPhase) {
    const m = GIANT_MOVE_RE.exec(e.aiPhase);
    if (m) {
      const key = `g-${m[1]}`;
      if (MOVE_KEY_SET.has(key)) return key as MoveReactionKey;
    }
    return null; // 旧スクリプト(?giantscript=0)のwindup/charge等はg-接頭辞が無い=計測対象外
  }
  if (e.type === 'thor' && e.bossState) return THOR_STATE_TO_MOVE[e.bossState] ?? null;
  // v0.25.2603: 残り全ボス(裏3/天使6/idol)の近接・AoE技。typeでゲートしてから状態名を引く。
  if (e.bossState) return MELEE_STATE_TO_MOVE[e.type]?.[e.bossState] ?? null;
  return null;
};

/**
 * 技キーの導出(近接/AoE技=G4a台帳 + 弾技=BULLET台帳)の**唯一の入口**。
 * 計測(stepMoveReactions)とゴースト(ghostDriver.rollGhostMoveReaction)が同じ1本を使う
 * =「見ている技」が2つの真実に割れない。
 */
export const anyMoveKeyForEnemy = (
  e: Pick<MoveReactionEnemy, 'type' | 'aiPhase' | 'bossState'>,
): MoveReactionKey | null => moveKeyForEnemy(e) ?? bulletMoveKeyForEnemy(e);

// ---- 弾へ載せる技キー(Projectile.srcMoveKey) ---------------------------------------------------
/** 弾に載りうる技キーの全数(= 咆哮弾 g-bolt + 弾技台帳)。 */
export const PROJECTILE_MOVE_KEYS: readonly MoveReactionKey[] = ['g-bolt', ...BULLET_MOVE_KEYS];
const PROJECTILE_MOVE_KEY_SET: ReadonlySet<string> = new Set<string>(PROJECTILE_MOVE_KEYS);

/** その技キーは「弾に載るキー」か(ゴーストの弾フィルタ用)。 */
export const isProjectileMoveKey = (key: string): boolean => PROJECTILE_MOVE_KEY_SET.has(key);

/**
 * 発射した弾に載せる技キー(**記録専用**・createEnemyProjectileが1箇所で付ける)。
 * 弾を撃つ技のキーだけを返す(万一「弾を撃たない技」の状態で弾が生まれても誤タグしない安全弁)。
 * 非ボス(plant等)は常に undefined = 従来どおりタグ無し。
 */
export const projectileMoveKeyForEnemy = (
  e: Pick<MoveReactionEnemy, 'type' | 'aiPhase' | 'bossState'>,
): MoveReactionKey | undefined => {
  const key = anyMoveKeyForEnemy(e);
  return key !== null && PROJECTILE_MOVE_KEY_SET.has(key) ? key : undefined;
};

// 接触ダメージの技キー導出(combatTick.applyContactDamage用): 「体当たりそのものが技のダメージ」の
// フェーズだけ技に帰属させる(突進中/滑空の通過中)。溜め(windup)中や技なし歩行中に体へ触れた
// 被弾は従来どおりの汎用接触=技キーなし。
export const contactDamageMoveKey = (
  e: Pick<MoveReactionEnemy, 'type' | 'aiPhase'>,
): MoveReactionKey | undefined => {
  if (e.type !== 'giantbat') return undefined;
  if (e.aiPhase === 'g-dash-charge') return 'g-dash';
  if (e.aiPhase === 'g-quad-charge') return 'g-quad';
  if (e.aiPhase === 'g-glide-active') return 'g-glide';
  return undefined;
};

// ---- エピソード状態機械 -----------------------------------------------------------------------
export interface MoveEpisode {
  enemyId: string;
  moveKey: MoveReactionKey;
  exposed: boolean;
  countered: boolean;
  hit: boolean;
  // GHOST-CMD-1B(§2.18-2 dodgeの味付け): エピソード中のプレイヤー変位を、その敵への半径方向/
  // 接線方向へ分解した累積(px)。dodgeで確定した時だけ最大軸で3分類に使う(計測のみ・挙動不変)。
  radialOut: number; // 敵から離れる向きの累積
  lateral: number;   // 接線方向の累積(左右は問わない=絶対値)
  radialIn: number;  // 敵へ向かう向きの累積
}
interface PendingEpisode extends MoveEpisode { lingerUntil: number }

export interface MoveReactionTally { exposures: number; counters: number; hits: number }

/** GHOST-CMD-1B: 避け方向の癖のセッション集計(dodgeで確定したエピソードの3分類カウント)。 */
export interface DodgeDirTally { away: number; lateral: number; through: number }

/**
 * GHOST-CMD-1B: 避け方向の癖の保存形(プロファイル/BossStyleSlot共通)。throughRateは
 * 1 − awayRate − lateralRate で導出する(2レートで3分類を持つ)。n=分類できたdodge回数の累計。
 */
export interface DodgeDirStat { n: number; awayRate: number; lateralRate: number }

export interface MoveReactionState {
  open: Record<string, MoveEpisode>;               // enemyId → 進行中のエピソード
  pending: PendingEpisode[];                        // 終了直後の残響(linger)中エピソード
  tally: Partial<Record<MoveReactionKey, MoveReactionTally>>; // セッション集計(確定済みエピソード)
  // GHOST-CMD-1B: 避け方向の癖。**技キー横断**(グローバルな癖=§2.18-2「味付けはスカラー」・
  // 技別に持って標本を薄めない)。
  dodgeDirTally: DodgeDirTally;
  // GHOST-CMD-1B: 前tickのプレイヤー中心(変位分解用)。引数は増やさず状態に持つ(発注仕様§1)。
  lastPx: number | null;
  lastPy: number | null;
}

export const createMoveReactionState = (): MoveReactionState => ({
  open: {}, pending: [], tally: {},
  dodgeDirTally: { away: 0, lateral: 0, through: 0 }, lastPx: null, lastPy: null,
});

const foldEpisode = (st: MoveReactionState, ep: MoveEpisode): void => {
  if (!ep.exposed) return; // 暴露なし(遠くで自己中心技が空振り等)は数えない
  const t = st.tally[ep.moveKey] ?? (st.tally[ep.moveKey] = { exposures: 0, counters: 0, hits: 0 });
  t.exposures += 1;
  if (ep.countered) t.counters += 1;       // 優先順位: counter > hit > dodge
  else if (ep.hit) t.hits += 1;
  else {
    // GHOST-CMD-1B: dodge(暴露あり・カウンター/被弾なし)だけ、変位累積の最大軸で避け方向を分類する。
    // 全軸0(エピソード中に一歩も動かず攻撃が外れた等)は方向が定義できない=数えない(nはdodgeDir
    // 独自のnなので薄めない)。同値は radialOut > lateral > radialIn の優先で決める(決定的)。
    const { radialOut, lateral, radialIn } = ep;
    if (radialOut > 0 || lateral > 0 || radialIn > 0) {
      if (radialOut >= lateral && radialOut >= radialIn) st.dodgeDirTally.away += 1;
      else if (lateral >= radialIn) st.dodgeDirTally.lateral += 1;
      else st.dodgeDirTally.through += 1;
    }
  }
};

const closeEpisode = (st: MoveReactionState, enemyId: string, gameTime: number): void => {
  const ep = st.open[enemyId];
  if (!ep) return;
  delete st.open[enemyId];
  st.pending.push({ ...ep, lingerUntil: gameTime + MOVE_REACTION_LINGER_MS });
};

/** 毎tick1回(playerTraitsのセッションtickから)。エピソードの開閉・自己中心技の暴露・残響の確定を行う。 */
export const stepMoveReactions = (
  st: MoveReactionState,
  enemies: readonly MoveReactionEnemy[],
  player: { x: number; y: number; width: number; height: number },
  gameTime: number,
): void => {
  const pcx = player.x + player.width / 2;
  const pcy = player.y + player.height / 2;
  const pr = Math.max(player.width, player.height) / 2;
  const seen = new Set<string>();
  for (const e of enemies) {
    // GHOST-BULLET-TECH: 型のホワイトリスト(giantbat/thorのみ)を廃止し、**技キーが導出できるか**で
    // 判定する(弾技の台帳=裏ボス/天使/idolもここへ入る)。キーが無く追跡中でもない敵は素通り
    // =giantbat/thorの挙動は1bitも変わらない。
    const key = anyMoveKeyForEnemy(e);
    const cur = st.open[e.id];
    if (key === null && cur === undefined) continue;
    seen.add(e.id);
    // GHOST-CMD-1B: 変位アキュムレータ。前tick→今tickのプレイヤー変位を、その敵への半径方向
    // (離れる=radialOut / 向かう=radialIn)と接線方向(lateral)へ分解して累積する。帰属は
    // 「前tick時点で開いていたエピソード」(cur)= 開いた/閉じたそのtickを跨ぐ変位は前の主へ。
    // 分解の基底は敵中心→前tickプレイヤー中心の半径ベクトル(重なり等の縮退は数えない)。
    if (cur && st.lastPx !== null && st.lastPy !== null) {
      const dx = pcx - st.lastPx, dy = pcy - st.lastPy;
      if (dx !== 0 || dy !== 0) {
        const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
        const rx = st.lastPx - ecx, ry = st.lastPy - ecy;
        const rl = Math.hypot(rx, ry);
        if (rl > 0.0001) {
          const radial = (dx * rx + dy * ry) / rl;             // + = 敵から離れる / − = 敵へ向かう
          const tangent = Math.abs((dx * -ry + dy * rx) / rl); // 接線成分(左右は問わない)
          if (radial >= 0) cur.radialOut += radial; else cur.radialIn += -radial;
          cur.lateral += tangent;
        }
      }
    }
    if (cur && cur.moveKey !== key) closeEpisode(st, e.id, gameTime); // 技の切り替わり(連携含む)=前の技を確定へ
    if (key && !st.open[e.id]) {
      st.open[e.id] = {
        enemyId: e.id, moveKey: key,
        exposed: SELF_EXPOSURE[key] === undefined, // aimed技はロック対象=プレイヤー(ゴースト不在ラン)=即暴露
        countered: false, hit: false,
        radialOut: 0, lateral: 0, radialIn: 0, // GHOST-CMD-1B: 変位の累積は次tickから(この技の分だけ)
      };
    }
    const ep = st.open[e.id];
    if (ep && !ep.exposed) {
      const self = SELF_EXPOSURE[ep.moveKey];
      if (self && e.aiPhase !== undefined && self.phases.includes(e.aiPhase)) {
        const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
        if (Math.hypot(pcx - ecx, pcy - ecy) <= self.radius(e) + pr) ep.exposed = true;
      }
    }
  }
  // 追跡中の敵が消えた(撃破/リサイクル)=エピソードを閉じて残響へ
  for (const id of Object.keys(st.open)) {
    if (!seen.has(id)) closeEpisode(st, id, gameTime);
  }
  // 残響が切れたエピソードを確定
  if (st.pending.length > 0) {
    const still: PendingEpisode[] = [];
    for (const p of st.pending) {
      if (gameTime >= p.lingerUntil) foldEpisode(st, p);
      else still.push(p);
    }
    st.pending = still;
  }
  // GHOST-CMD-1B: 次tickの変位分解の基準点(毎tick更新・エピソードの有無に関わらず)。
  st.lastPx = pcx;
  st.lastPy = pcy;
};

/** カウンター成立(成立7箇所)の通知。開いているエピソード全部(無ければ残響中)にマークする。 */
export const markMoveReactionCounter = (st: MoveReactionState): void => {
  const open = Object.values(st.open);
  const targets: MoveEpisode[] = open.length > 0 ? open : st.pending;
  for (const ep of targets) { ep.countered = true; ep.exposed = true; }
};

/** 技キー付き被弾(damageSourceMove)の通知。キー一致の開いているエピソード(無ければ残響中の最新)にマークする。 */
export const markMoveReactionHit = (st: MoveReactionState, moveKey: string): void => {
  for (const ep of Object.values(st.open)) {
    if (ep.moveKey === moveKey) { ep.hit = true; ep.exposed = true; return; }
  }
  for (let i = st.pending.length - 1; i >= 0; i--) {
    const ep = st.pending[i];
    if (ep.moveKey === moveKey) { ep.hit = true; ep.exposed = true; return; }
  }
  // どのエピソードにも一致しない(残響切れの床ダメージ等)=数えない(実装メモ参照)
};

/** endMoveReactionsの返り値(GHOST-CMD-1B: 技への反応表+避け方向の癖の2集計)。 */
export interface MoveReactionSessionResult {
  tally: MoveReactionState['tally'];
  /** GHOST-CMD-1B: dodgeで確定したエピソードの避け方向3分類(技キー横断)。 */
  dodgeDir: DodgeDirTally;
}

/** セッション終了時: 開いている/残響中のエピソードを全て確定して集計を返す。 */
export const endMoveReactions = (st: MoveReactionState): MoveReactionSessionResult => {
  for (const id of Object.keys(st.open)) {
    foldEpisode(st, st.open[id]);
    delete st.open[id];
  }
  for (const p of st.pending) foldEpisode(st, p);
  st.pending = [];
  return { tally: st.tally, dodgeDir: st.dodgeDirTally };
};

// ---- プロファイル側のEMA更新 -------------------------------------------------------------------
export interface MoveReactionStat { n: number; counterRate: number; hitRate: number }
/** 保存形。キーはMoveReactionKeyだが、localStorage由来の未知キーも壊さないようstringで持つ。 */
export type MoveReactionTable = Partial<Record<string, MoveReactionStat>>;

/**
 * セッション集計をEMA(α)でプロファイル表へ混ぜる。技ごとに: 初記録(n=0/未登録)はサンプルそのまま、
 * 2回目以降は既存6ノブと同じ per-session EMA。nは暴露回数の累計(G4b消費側のゲート兼、§2.18の
 * 袋式(commandBag)の枚数導出のベース。n=0のみフォールバック=GHOST-CMD-1で旧n<3ゲートを廃止)。
 */
export const blendMoveReactionTable = (
  prev: MoveReactionTable,
  tally: MoveReactionState['tally'],
  alpha: number,
): MoveReactionTable => {
  let changed = false;
  const next: MoveReactionTable = { ...prev };
  for (const key of Object.keys(tally)) {
    const t = tally[key as MoveReactionKey];
    if (!t || t.exposures <= 0) continue;
    changed = true;
    const counterSample = t.counters / t.exposures;
    const hitSample = t.hits / t.exposures;
    const p = prev[key];
    next[key] = (!p || p.n <= 0)
      ? { n: t.exposures, counterRate: counterSample, hitRate: hitSample }
      : {
        n: p.n + t.exposures,
        counterRate: p.counterRate * (1 - alpha) + counterSample * alpha,
        hitRate: p.hitRate * (1 - alpha) + hitSample * alpha,
      };
  }
  return changed ? next : prev;
};

/**
 * GHOST-CMD-1B: セッションの避け方向集計をプロファイルの1キー分へ混ぜる。数式は
 * blendMoveReactionTable と同じ(初回=サンプルそのまま・2回目以降はEMA(α)・nは累計)。
 * サンプル0(このセッションで分類できたdodgeなし)は前回値を参照ごと返す(欠損=undefinedのまま)。
 * prev=undefinedへサンプルを混ぜる呼び方(α無視)は「そのセッションの生値」= BossStyleSlotの写しにも使う。
 */
export const blendDodgeDirStat = (
  prev: DodgeDirStat | undefined,
  tally: DodgeDirTally,
  alpha: number,
): DodgeDirStat | undefined => {
  const n = tally.away + tally.lateral + tally.through;
  if (n <= 0) return prev;
  const awaySample = tally.away / n;
  const lateralSample = tally.lateral / n;
  return (!prev || prev.n <= 0)
    ? { n, awayRate: awaySample, lateralRate: lateralSample }
    : {
      n: prev.n + n,
      awayRate: prev.awayRate * (1 - alpha) + awaySample * alpha,
      lateralRate: prev.lateralRate * (1 - alpha) + lateralSample * alpha,
    };
};
