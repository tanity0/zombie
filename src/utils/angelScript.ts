// ボスメーカー横展開・第3弾(BOSS_MAKER.md §6 フェーズ4): 天使6体の**可変チューニングテーブル**。
//
// 方針は idol / 賞金首と同じ「台本はコード / 数字はテーブル」(BOSS_MAKER.md §2-2):
//  - 状態機械(angelBossTick.ts)のロジックは一切変えず、**数値の置き場所だけ**をここへ移す。
//  - 既存コードは使用時参照(tick中/描画中に読む)なので、テーブルのプロパティを読む形にすれば
//    挙動は1バイトも変わらない。**既定値は現行の実装値と完全一致**(=リファクタとして無変更)。
//  - 判定(angelBossTick)と描画(pixiScene)は**このテーブルの同じ場所を読む**。どちらか一方が
//    古い定数を読むと「赤いのに当たらない」になるので、寸法は必ずここに1つだけ置く
//    (第1弾で確立: スカラーの再exportは数値のコピー=画面で動かしても古い値のまま。
//     **入れ子オブジェクトだけが live**)。
//
// ★このファイルは**依存の軽い葉**でなければならない(import は deepClone / bossTelegraph の2つ=
//   いずれも store を触らない層だけ)。理由は bountyDims.ts 冒頭の「gameStore → levelUpGate →
//   bountyTick → gameStore の循環importで本番バンドルがTDZ=起動直後真っ暗」(v0.25.3390)。
//   **gameStore を import しないこと。**
//
// ここに**無い**もの(=まだ画面から触れない・意図的):
//  - 技の**抽選**(距離帯・重み・CD の選び方): miguelScript/jibrilScript/rafiScript/uriScript/
//    surielScript/acrasielScript.ts が正本(別の「依存ゼロの葉」)。第1弾の三段突き/射撃サイクルと
//    同じ扱いで、テーブル化には持ち主側の分解が要る。
//  - アリーナの幾何(GATE_ARENA_RADIUS=300 / 縁のマージン): 拘束サークル(useGameLoop)と共有する
//    「場」の寸法であって技の数字ではない。触ると円と移動可能域が食い違う。
//  - 旧実装(`?<boss>script=0` の runXxxTickLegacy)専用の値: フォールバックは変更前の姿を保つのが
//    役目なので、可変化しない。
import { deepCloneTuning } from './deepClone';
import { withRecoverFloor } from './bossTelegraph';

// =================================================================================================
// 6体共通(★複製して分岐を作らない=共有のまま1箇所に置く)
// =================================================================================================
/**
 * 天使6体で**実際に共有されている**値。スキーマ側では「関係するボスのパネル」に同じパスで載せるが、
 * ヘルプに「6体共通」と明記する(1つ動かすと全員が動く)。
 * ボスごとに複製すると挙動の構造が変わる=仕様変更なので、共有のままにしてある。
 */
export interface AngelCommonTuning {
  /** 3連弾(ミゲルの弾幕 volley / ウリの雷弾 bolt が同じ形で使う)。 */
  burst: { shots: number; gapMs: number };
  /** 完全気絶(紫)明けの次アクション先送り(6体共通)。 */
  stunNextActionMs: number;
  /** カウンター成立後の後退ジャンプの時間(=THOR_COUNTER_LEAP_MS)。 */
  counterLeapMs: number;
  /** 剣ボスの踏み込みの先行時間(溜めの最後のこの時間から踏み出す。ミゲル/ウリ共通)。 */
  lungeLeadMs: number;
  /** 突進系をカウンターした時に弾き返す距離(ミゲル踏み込み/ウリ突きで共通)。 */
  dashCounterPushbackPx: number;
}

export const ANGEL_COMMON_TUNING: AngelCommonTuning = {
  burst: { shots: 3, gapMs: 500 },   // = 旧 BOSS_BURST_SHOTS / BOSS_BURST_GAP_MS
  stunNextActionMs: 2600,            // = 旧 BOSS_ACTION_MIN_MS
  counterLeapMs: 260,                // = 旧 ANGEL_COUNTER_LEAP_MS
  lungeLeadMs: 180,                  // = 旧 ANGEL_LUNGE_LEAD_MS
  dashCounterPushbackPx: 150,        // = 旧 MIGUEL_DASH_COUNTER_PUSHBACK_PX(ウリの突きも読む)
};

/**
 * 各ボスのテーブルは**同じ共通オブジェクトを参照で持つ**(`common:` の中身は6体で1個)。
 * こうしてあるのは、ボスメーカーの欄が「ボスのテーブルからのパス」でしか値を指せないため
 * ——複製して各ボスに配ると「画面で動かしたのに片方だけ変わる」= 挙動の構造が変わる(仕様変更)。
 */
interface AngelSharedHolder { common: AngelCommonTuning }

// =================================================================================================
// ミゲル(miguel・§6.28-4)
// =================================================================================================
export interface AngelMiguelTuning extends AngelSharedHolder {
  /** 旋回(home中心をCCWで回る)の角速度の元になる速さ。 */
  orbit: { speed: number };
  /** 「移動中、たまにゆっくり歩く」(トールのSLOWWALKと同型)。 */
  slowWalk: { ms: number; mult: number; minGapMs: number; maxGapMs: number };
  /** 殴られた直後だけ旋回が速くなる(meleeHitAtからの時間)。 */
  meleeDash: { ms: number; mult: number };
  /** 払い→縦払いの2段。judge=ロックした帯(カプセル)。 */
  harai: { windup: number; active: number; range: number; halfWidth: number; tateRecover: number };
  /** 弾幕(3連弾・本数と間隔は共通テーブル)。 */
  volley: { windup: number; recover: number };
  /** 踏み込み(溜め→直進→斬り抜け)。 */
  dash: { windup: number; moveMs: number; strikeMs: number; recover: number; cdMs: number };
  /** 剣を振る間合いまで詰める踏み込み(判定は動かない・見た目と本体だけ)。 */
  lunge: { standoffPx: number; maxPx: number };
}

export const ANGEL_MIGUEL_TUNING: AngelMiguelTuning = {
  common: ANGEL_COMMON_TUNING, // ★6体で同じ実体(複製しない)
  orbit: { speed: 70 },
  slowWalk: { ms: 1500, mult: 0.4, minGapMs: 4000, maxGapMs: 9000 },
  meleeDash: { ms: 1000, mult: 2 },
  // ★振り速度2倍(社長指示v0.25.2885): 220→110。判定の持続窓も半分=技そのものが速い。
  harai: { windup: 1000, active: 110, range: 190, halfWidth: 40, tateRecover: withRecoverFloor(800) },
  volley: { windup: 450, recover: withRecoverFloor(300) },
  // strikeMs の既定は harai.active と同値(設計書「MIGUEL_HARAI_ACTIVE_MS相当の斬り抜け」)。
  // **別の欄として持つ**(揃っていることは angelTuning.test.ts が既定値で機械検査する)。
  dash: { windup: 700, moveMs: 230, strikeMs: 110, recover: withRecoverFloor(800), cdMs: 6000 },
  // 詰める先=帯の中点(狙いをロックした点)から80px手前。上限150px=「踏み込みであって突進ではない」。
  lunge: { standoffPx: 80, maxPx: 150 },
};

// =================================================================================================
// ジブリル(jibril・§6.28-6)
// =================================================================================================
export interface AngelJibrilTuning extends AngelSharedHolder {
  /** 後退(常にプレイヤーから離れる中立移動)。被弾数がしきい値を超えると速くなる。 */
  retreat: { speed: number; fastMult: number; hitsFaster: number };
  /** 転移(被弾数 or 縁への張り付きで発火)。**硬直だけは床を適用しない**(判定を持たない移動のため)。 */
  warp: { hits: number; windup: number; recover: number };
  /** 5連射(奇数発目=狙い弾 / 偶数発目=全方位リング)。間隔は共通テーブルの burst.gapMs。 */
  volley: { shots: number; omniBullets: number; windup: number; recover: number };
  /** ランス(ランタンが縁まで飛び、その間を赤ラインで結ぶ→到着でレーザー)。 */
  lance: {
    count: number; intervalMs: number;
    lanternSpeed: number; turnRate: number;
    minWindup: number; windupCapMs: number;
    beamMs: number; halfWidth: number; recover: number;
  };
  /** ランタン(足場を焼く火を置き続ける)。 */
  lantern: { ms: number; windup: number; recover: number; fireGapMs: number };
  /** 置かれる火そのもの(ランタン/聖別で共有)。 */
  fire: { telegraphMs: number; lifeMs: number; damage: number; radius: number };
  /** 聖別(自分を中心としたリング上に火・隙間1箇所)。Phase2専用。 */
  consecrate: { windup: number; recover: number; cdMs: number; ringRadius: number; fireCount: number };
}

export const ANGEL_JIBRIL_TUNING: AngelJibrilTuning = {
  common: ANGEL_COMMON_TUNING, // ★6体で同じ実体(複製しない)
  retreat: { speed: 55, fastMult: 1.7, hitsFaster: 3 },
  // ★warp.recover は**意図的に withRecoverFloor を通さない**(v0.25.2609): 転移はダメージ判定を
  // 持たない純粋な移動で、'warp-recover' はカウンター分岐が存在しない州。床の目的は
  // 「パニッシュ窓を作ること」なので、カウンターできない州を伸ばしてもただの待ち時間が増えるだけ。
  warp: { hits: 10, windup: 450, recover: 400 },
  volley: { shots: 5, omniBullets: 8, windup: 450, recover: withRecoverFloor(400) },
  // v0.25.3202: 速度と旋回率を同率(1/4)にしてある=軌道は同じで所要時間だけ4倍。
  // **速度だけ変えると旋回半径が変わり「振り切れる」が壊れる**ので、片方を触ったら両方を見る。
  lance: {
    count: 3, intervalMs: 1000,
    lanternSpeed: 275, turnRate: 0.8,
    minWindup: 360, windupCapMs: 8000,
    beamMs: 140, halfWidth: 26, recover: withRecoverFloor(600),
  },
  lantern: { ms: 5000, windup: 700, recover: withRecoverFloor(750), fireGapMs: 700 },
  fire: { telegraphMs: 700, lifeMs: 2000, damage: 30, radius: 22 },
  consecrate: { windup: 700, recover: withRecoverFloor(750), cdMs: 8000, ringRadius: 160, fireCount: 6 },
};

// =================================================================================================
// ラフィ(rafi・§6.28-8)
// =================================================================================================
export interface AngelRafiTuning extends AngelSharedHolder {
  /** 直進の追跡速度。 */
  chase: { speed: number };
  /** 横ステップ(Phase2は間隔が短い)。 */
  step: { ms: number; speed: number; minGapMs: number; maxGapMs: number; minGapMsP2: number; maxGapMsP2: number };
  /** 骨刃(プレイヤーの周囲リングから内向きに飛ぶ遅延刃)。 */
  bone: { count: number; gapMs: number; windup: number; recover: number; ringMin: number; ringMax: number; delayMs: number };
  /** 跳びかかり(着地円)。カウンターされると最大2回まで跳び直す。 */
  jump: { maxRejumps: number; windup: number; ms: number; radius: number; recover: number };
  /** 薙ぎ(Phase2専用・前方カプセル)。 */
  sweep: { windup: number; active: number; recover: number; cdMs: number; range: number; halfWidth: number };
  /** ★v0.25.3592(社長指示「バックロール追加。その後刃を2発高速で飛ばしてくる技を追加。台本化」):
   *  ロール台本=後退→骨刃2連射。刃は自分の脇から出て短い遅延で高速射出(既存の骨刃と同じ飛翔体)。 */
  roll: { rollMs: number; rollDist: number };
  quickblades: { windup: number; count: number; gapMs: number; launchDelayMs: number; sideOffsetPx: number; recover: number };
}

export const ANGEL_RAFI_TUNING: AngelRafiTuning = {
  common: ANGEL_COMMON_TUNING, // ★6体で同じ実体(複製しない)
  chase: { speed: 62 },
  step: { ms: 220, speed: 360, minGapMs: 1800, maxGapMs: 3600, minGapMsP2: 1400, maxGapMsP2: 2800 },
  // ringMin/ringMax/delayMs はスカジの骨刃と同値(既定値の流用。ここを動かしてもスカジは変わらない)。
  bone: { count: 7, gapMs: 600, windup: 450, recover: withRecoverFloor(700), ringMin: 100, ringMax: 180, delayMs: 1000 },
  // windup/ms/radius/recover はトールのジャンプと同値(既定値の流用)。
  jump: { maxRejumps: 2, windup: 700, ms: 360, radius: 70, recover: 900 },
  // range/halfWidth はトールの払いと同値(既定値の流用・§6.26-9 #3の作法を継承)。
  sweep: { windup: 700, active: 220, recover: withRecoverFloor(700), cdMs: 7000, range: 310, halfWidth: 40 },
  // ★v0.25.3592: 数値は叩き台。ロール=賞金首のロール台本と同寸(190px/300ms)。
  // 刃はlaunchDelayMs後に射出(既存骨刃の1000msと違い短い=「高速で飛んでくる」の正体)。
  roll: { rollMs: 300, rollDist: 190 },
  quickblades: { windup: 350, count: 2, gapMs: 120, launchDelayMs: 250, sideOffsetPx: 40, recover: withRecoverFloor(900) },
};

// =================================================================================================
// ウリ(uri・§6.28-17)
// =================================================================================================
export interface AngelUriTuning extends AngelSharedHolder {
  /** 大薙ぎ(内径の外だけに判定=「懐が安全」がこの技の主題)。内径は uriScript.ts が持つ。 */
  sweep: { windup: number; active: number; recover: number; range: number; halfWidth: number };
  /** 振り下ろし(前方・細長)。 */
  downslash: { windup: number; active: number; recover: number; range: number; halfWidth: number };
  /** 踏み込み突き(溜め→直進→突き)。 */
  thrust: { windup: number; moveMs: number; strikeMs: number; recover: number; range: number; halfWidth: number };
  /** 雷弾(3連弾・本数と間隔は共通テーブル)。 */
  bolt: { windup: number; recover: number };
  /** 大薙ぎの踏み込み(詰める先=帯の始点=内径の位置。上限は内径の maxFrac 倍)。 */
  lunge: { standoffPx: number; maxFrac: number };
}

export const ANGEL_URI_TUNING: AngelUriTuning = {
  common: ANGEL_COMMON_TUNING, // ★6体で同じ実体(複製しない)
  // 社長指示v0.25.3195「ウリの攻撃が遅い。溜を半分に」/ ★振り速度2倍(v0.25.2885)。
  sweep: { windup: 550, active: 130, recover: withRecoverFloor(580), range: 310, halfWidth: 40 },
  // halfWidth 15→40 = v0.25.3589 ボスメーカー貼り戻し(社長確定)。
  downslash: { windup: 500, active: 100, recover: withRecoverFloor(900), range: 310, halfWidth: 40 },
  // range/halfWidth の既定はミゲルの払いと同値(§6.28-4と同型の攻撃と解釈した流用)。
  // **別の欄として持つ**(揃っていることは angelTuning.test.ts が既定値で機械検査する)。
  // moveMs 230→150 = v0.25.3589 ボスメーカー貼り戻し(社長確定・走りが鋭く)。
  thrust: { windup: 450, moveMs: 150, strikeMs: 220, recover: withRecoverFloor(580), range: 190, halfWidth: 40 },
  bolt: { windup: 225, recover: withRecoverFloor(500) },
  lunge: { standoffPx: 40, maxFrac: 0.5 },
};

// =================================================================================================
// スリィエル(suriel・§6.28-18)
// =================================================================================================
export interface AngelSurielTuning extends AngelSharedHolder {
  /** 環の射出(環が相手の反対側へ回り込み、そこからビームで挟む)。 */
  ringshot: { moveMs: number; beamWindup: number; active: number; recover: number };
  /** 環の回転斬(自分中心の円=近接拒否)。 */
  ringspin: { windup: number; active: number; recover: number; radius: number };
  /** 本体の薙ぎ(前方カプセル)。 */
  sweep: { windup: number; active: number; recover: number; range: number; halfWidth: number };
  /** 単眼の凝視(弾を1発)。 */
  /** ★v0.25.3590(社長指示「10連射に変更」): count=連射数。recoverは発間の間(フロア外・貼り戻し値)。 */
  gaze: { windup: number; recover: number; count: number };
  /** ビーム(線)の寸法。 */
  beam: { range: number; halfWidth: number };
  /** 環の待機位置と帰投(判定を持たない=見た目と「展開中か」の判定だけ)。 */
  ring: { hoverOffsetX: number; hoverOffsetY: number; returnSpeed: number; deployThreshold: number; ring2OffsetPx: number };
}

export const ANGEL_SURIEL_TUNING: AngelSurielTuning = {
  common: ANGEL_COMMON_TUNING, // ★6体で同じ実体(複製しない)
  // moveMs 900→700 = v0.25.3590 貼り戻し(社長確定)。
  ringshot: { moveMs: 700, beamWindup: 700, active: 220, recover: withRecoverFloor(530) },
  // radius 92: v0.25.2579で GIANT_STOMP_RADIUS 流用をやめ独立値に固定した(描画も同じ値を読む)。
  // radius 92→200 = v0.25.3590 貼り戻し(社長確定)。
  ringspin: { windup: 800, active: 600, recover: withRecoverFloor(700), radius: 200 },
  sweep: { windup: 800, active: 220, recover: withRecoverFloor(650), range: 310, halfWidth: 40 },
  // ★v0.25.3590 貼り戻し+手書き「10連射に変更」: windup300/recover100を1発のサイクルとして
  // count=10連射。recover=発間の間なので**意図的にフロア外**(締めの隙は10連射の総尺が担う・社長確定)。
  gaze: { windup: 300, recover: 100, count: 10 },
  // halfWidth 20→30 = v0.25.3590 貼り戻し(社長確定)。
  beam: { range: 2600, halfWidth: 30 },
  ring: { hoverOffsetX: 0, hoverOffsetY: -64, returnSpeed: 360, deployThreshold: 24, ring2OffsetPx: 34 },
};

// =================================================================================================
// アクラシエル(acrasiel・§6.28-19)
// =================================================================================================
export interface AngelAcrasielTuning extends AngelSharedHolder {
  /** 放射棘(8方向・隙間はフェーズで増える)。 */
  spike: { windup: number; active: number; recover: number; range: number; halfWidth: number };
  /** 結晶の槍(設置→遅延起爆)。 */
  spear: { windup: number; recover: number; count: number; range: number; detonateMs: number; radius: number };
  /** 転移(消える→予告円→着地の衝撃)。 */
  warp: { windup: number; telegraphMs: number; recover: number; impactRadius: number };
  /** 爆発(自分中心の大円)。 */
  burst: { windup: number; active: number; recover: number; radius: number };
  /** 凝視(弾を1発)。 */
  gaze: { windup: number; recover: number };
}

export const ANGEL_ACRASIEL_TUNING: AngelAcrasielTuning = {
  common: ANGEL_COMMON_TUNING, // ★6体で同じ実体(複製しない)
  spike: { windup: 1100, active: 240, recover: withRecoverFloor(500), range: 310, halfWidth: 40 },
  spear: { windup: 700, recover: withRecoverFloor(500), count: 6, range: 310, detonateMs: 2000, radius: 92 },
  // ★telegraphMs は「赤円が見えてから実行まで」そのもの。v0.25.2609で800→1000へ是正した
  // (800msで歩ける距離は83.5px < 半径92px=**見てから歩いても構造的に出られない**状態だった)。
  // **impactRadius を広げたら telegraphMs も伸ばす**(半径/104.4px/s が必要下限)。
  warp: { windup: 800, telegraphMs: 1000, recover: withRecoverFloor(600), impactRadius: 92 },
  // ★burst も同じ関係(半径140 → 必要1341ms。bossTelegraph の minWindupMs が物差し)。
  burst: { windup: 1200, active: 300, recover: withRecoverFloor(900), radius: 140 },
  gaze: { windup: 450, recover: withRecoverFloor(500) },
};

// ---- 既定値(リセット/差分表示用・BOSS_MAKER.md §2-2) --------------------------------------------
// テーブルとは**別のオブジェクト**として焼く(参照を共有すると「リセット」で戻せなくなる)。
export const ANGEL_COMMON_TUNING_DEFAULTS: AngelCommonTuning = deepCloneTuning(ANGEL_COMMON_TUNING);
export const ANGEL_MIGUEL_TUNING_DEFAULTS: AngelMiguelTuning = deepCloneTuning(ANGEL_MIGUEL_TUNING);
export const ANGEL_JIBRIL_TUNING_DEFAULTS: AngelJibrilTuning = deepCloneTuning(ANGEL_JIBRIL_TUNING);
export const ANGEL_RAFI_TUNING_DEFAULTS: AngelRafiTuning = deepCloneTuning(ANGEL_RAFI_TUNING);
export const ANGEL_URI_TUNING_DEFAULTS: AngelUriTuning = deepCloneTuning(ANGEL_URI_TUNING);
export const ANGEL_SURIEL_TUNING_DEFAULTS: AngelSurielTuning = deepCloneTuning(ANGEL_SURIEL_TUNING);
export const ANGEL_ACRASIEL_TUNING_DEFAULTS: AngelAcrasielTuning = deepCloneTuning(ANGEL_ACRASIEL_TUNING);
