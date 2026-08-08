// ボットの「目的(ゴール)」層(社長指示v0.25.2339)。
//
// 診断: v0.25.2338 で腕前を段階化したのに master が最も被弾した。原因は**ゴールが無かったこと**
// (社長の見立て)。目的が無いと「上手さ」は最適化する対象を持たず、ただ目の前の敵に反応するだけになる。
// 腕前は**目的に対して**しか意味を持たない。
//
// この層がやること: 世界の状態を見て**「今どこへ向かい、誰を狙うか」**を1つ決める。
// 腕前(botSkill)は「どれだけ上手くそれを遂行するか」、ペルソナは「どんな癖で動くか」。3層は直交する。
//
// 設計の掟:
// - **純関数だけ**(store/React/PixiJS非依存)。世界の状態は呼び出し側が `ObjectiveWorld` に詰めて渡す。
// - **既定(`none`)は目的なし=v0.25.2338 までと完全に同じ挙動**。既存のボットランを動かさない。
// - 目的は**移動先と狙う敵を返すだけ**。実際の入力合成(回避との優先順位等)は呼び出し側の責務。
import type { Enemy, Pickup, EnemyType, CastleEvent, BaseSite, InputState } from '../types/game';

/** ボットの目的。 */
export type BotObjective =
  /** 目的なし(従来の挙動)。 */
  | { kind: 'none' }
  /** メインミッションをクリアする(城ボス撃破→帰還サークルで帰還)。 */
  | { kind: 'clear' }
  /** ハイスコアを狙う(トレジャー最優先→強敵→深部)。 */
  | { kind: 'score' }
  /** 裏ボスを倒しに行く(必要ならレベル上げしてから巣へ向かう)。 */
  | { kind: 'hiddenBoss'; minLevel?: number }
  /** 指定の敵を探して倒す(死神/ハンター/叫喚型など)。 */
  | { kind: 'hunt'; enemyType: EnemyType }
  /** 指定の深さまで潜る。 */
  | { kind: 'depth'; dist: number }
  /** 撃破数を稼ぐ(サブクエ検証用)。 */
  | { kind: 'kills'; count: number }
  /** 拠点をn個解放する(サブクエ検証用)。 */
  | { kind: 'bases'; count: number }
  /**
   * 通し(キャンペーン)。社長指示のシナリオ順に1本で消化する:
   * 拠点を順に奪取 → 寄り道POI(武器庫/病院/警察)を開放 → 城ボスを討伐 → 帰還。
   * `clear` との違いは**城へ直行しない**こと。通しプレイテスト用。
   */
  | { kind: 'campaign'; minLevel?: number };

/** 目的を決めるために必要な世界の状態(呼び出し側が store から詰める)。 */
export interface ObjectiveWorld {
  px: number;              // プレイヤー中心X
  py: number;              // プレイヤー中心Y
  level: number;
  enemies: readonly Enemy[];
  pickups: readonly Pickup[];
  /** 帰還サークル(出ていれば「ここに立てば任務達成」)。 */
  returnCircle: { x: number; y: number; radius: number } | null;
  castleEvent: CastleEvent | null;
  /** 城ボス(フィナーレ)を撃破済みか。 */
  finaleDefeated: boolean;
  /** このステージの裏ボス種別(いなければ null)。 */
  hiddenBoss: EnemyType | null;
  /** 裏ボスの巣の座標(world/pois の bossLairPos。無ければ null)。 */
  hiddenBossLair: { x: number; y: number } | null;
  hiddenBossDefeated: boolean;
  baseSites: readonly BaseSite[];
  enemiesKilled: number;
  gameWon: boolean;
  /**
   * 進行中の囲いイベント(関所ゲート1/2・囲い・救助)。**これが出ている間は前へ進めない**ので、
   * 目的より先にこれを片付ける(v0.25.2340)。null = 進行中のイベント無し。
   */
  activeEvent: { kind: 'horde' | 'boss' | 'rescue'; x: number; y: number; radius: number } | null;
  /**
   * 寄り道POI(武器庫/病院/警察署)。**campaign 目的だけが読む**。
   * 省略(undefined)= 従来どおり=POIを考慮しない(既存の目的の挙動は1ビットも変わらない)。
   * `cost` は解放に要るスクラップ(武器庫のみ)。足りない間はそのPOIを後回しにする。
   */
  pois?: readonly { kind: 'armory' | 'hospital' | 'police'; x: number; y: number; taken: boolean; radius: number; cost?: number }[];
  /** 所持スクラップ(武器庫の費用判定に使う)。省略=費用チェックをしない。 */
  scrap?: number;
  /** 拠点制圧サークルの半径。省略=距離判定をしない。 */
  baseCaptureRadius?: number;
  /**
   * 護衛軍人NPC(担当拠点へ前進して制圧する主体)。**campaign だけが読む**。
   *
   * ★重要(v0.25.3059で実走から判明): **拠点はプレイヤーが円内に立っても制圧されない。**
   * 制圧するのは escort であり(`gameStore.updateBaseSites`)、しかも escort は
   * **画面内に居る間しか前進しない**(画面外=座標保持)。したがってボットの正しい行動は
   * 「拠点の中心へ行って留まる」ではなく **「担当 escort に付き添って画面内に入れ続ける」**。
   */
  escorts?: readonly { baseId: string; x: number; y: number }[];
}

/** 目的が出す指示。 */
export interface ObjectivePlan {
  /** 向かう先(world座標)。null = 目的地なし(その場の戦闘に任せる)。 */
  destination: { x: number; y: number } | null;
  /** この目的にとって最優先で倒すべき敵。null = 通常の標的選択に任せる。 */
  focus: Enemy | null;
  /**
   * 移動を戦闘より優先するか。true = 目的地へ進むことを最優先(道中の敵は無視して進む)。
   * false = 目的地へ寄りつつも普段どおり戦う。
   */
  travel: boolean;
  /**
   * 退避を止めて攻めきるか。**囲いイベント中は true**。
   * 理由(v0.25.2340の実走で判明): 囲いの中は敵が密集するので「囲まれたら退避」が常時発火し、
   * 上手い段階ほど近接距離まで詰められず**台本敵を倒しきれない**(seed3が484秒交戦して未突破)。
   * 強制的な囲いは逃げても終わらないので、**攻めきるのが唯一の正解**。
   */
  pressAttack: boolean;
  /** 目的を達成したか(レポート/テスト用)。 */
  done: boolean;
  /** 今何をしているか(1行・ログとレポート用)。 */
  note: string;
  /**
   * **その場に留まる**(移動入力を0にする)。拠点の制圧(10秒)/POIの滞在(3秒)は
   * 「サークル内に居続ける」ことが条件だが、`steerTo` は到着圏内(ARRIVE_DIST=70)で null を返し
   * 通常の徘徊入力へ落ちるため、**放っておくと滞在が永久に貯まらない**(依頼#6で実測)。
   * 省略(undefined)= 従来どおり=留まらない。合成側の優先度は **回避 > hold > 目的地ステア**
   * (生存を犠牲にしてまで留まらない)。
   */
  hold?: boolean;
}

const NO_PLAN: ObjectivePlan = { destination: null, focus: null, travel: false, pressAttack: false, done: false, note: '目的なし' };

/** 囲いイベント中に「倒すべき敵」= 台本敵(fromEvent)。通常の雑魚を倒しても囲いは終わらない。 */
export const nearestEventEnemy = (w: ObjectiveWorld): Enemy | null => {
  let best: Enemy | null = null, bestD = Infinity;
  for (const e of w.enemies) {
    if (!e.fromEvent) continue;
    const c = { x: e.x + e.width / 2, y: e.y + e.height / 2 };
    const d = (w.px - c.x) ** 2 + (w.py - c.y) ** 2;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
};

/**
 * 囲いイベント(関所ゲート1/2・囲い・救助)の突破プラン。**どの目的よりも優先される**。
 *
 * 理由(v0.25.2339の実走で判明): 未確認汚染の境界(5000px)で関所ゲート1が発火すると、
 * **倒すまで壁を踏破できない**。ボットにこの行動が無かったため、全ての目的が深度5,270px で
 * 停止していた(depth:7500 すら7分間1歩も進めなかった)。
 *
 * クリア条件は実装(useGameLoop)と同じ: **台本敵(fromEvent)が0体になること**。
 * 通常の雑魚をいくら倒しても終わらないので、**fromEvent だけを狙う**のが唯一の正解。
 * 救助(rescue)だけは例外で、**円内に居続ける**ことが条件なので中心へ入って留まる。
 */
export const arenaPlan = (w: ObjectiveWorld): ObjectivePlan | null => {
  const ae = w.activeEvent;
  if (!ae) return null;
  if (ae.kind === 'rescue') {
    return { destination: { x: ae.x, y: ae.y }, focus: null, travel: true, pressAttack: true, done: false, note: '救助ホールド(円内で待つ)' };
  }
  const target = nearestEventEnemy(w);
  if (target) {
    // 近づけば通常の交戦behaviorへ引き継がれる(steerTo が到着圏内で null を返す)。
    return { destination: centerOf(target), focus: target, travel: true, pressAttack: true, done: false, note: `囲い突破: 台本敵と交戦(${w.enemies.filter(e => e.fromEvent).length}体)` };
  }
  // 台本敵がまだ湧いていない(段階スポーン中)= 円の中心付近で待つ。離れると戻る手間が増える。
  return { destination: { x: ae.x, y: ae.y }, focus: null, travel: true, pressAttack: true, done: false, note: '囲い突破: 台本敵の出現待ち' };
};

const dist2 = (ax: number, ay: number, bx: number, by: number): number => (ax - bx) ** 2 + (ay - by) ** 2;
const centerOf = (e: Enemy): { x: number; y: number } => ({ x: e.x + e.width / 2, y: e.y + e.height / 2 });

/** 種別が一致する最寄りの敵。 */
export const nearestOfType = (w: ObjectiveWorld, type: EnemyType): Enemy | null => {
  let best: Enemy | null = null, bestD = Infinity;
  for (const e of w.enemies) {
    if (e.type !== type) continue;
    const c = centerOf(e);
    const d = dist2(w.px, w.py, c.x, c.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
};

/** 最寄りのピックアップ(種別フィルタつき)。 */
export const nearestPickup = (w: ObjectiveWorld, types: readonly string[]): Pickup | null => {
  let best: Pickup | null = null, bestD = Infinity;
  for (const p of w.pickups) {
    if (!types.includes(p.type)) continue;
    const d = dist2(w.px, w.py, p.x, p.y);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
};

/** 最寄りの未制圧拠点。 */
export const nearestUncapturedBase = (w: ObjectiveWorld): BaseSite | null => {
  let best: BaseSite | null = null, bestD = Infinity;
  for (const b of w.baseSites) {
    if (b.status === 'captured') continue;
    const d = dist2(w.px, w.py, b.x, b.y);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
};

/**
 * その拠点を担当する護衛NPCのうち最寄りのもの。
 * ★拠点を制圧するのは escort であってプレイヤーではない(gameStore.updateBaseSites)。
 *   しかも escort は画面外では前進しないので、ボットは escort に付き添う必要がある。
 */
export const nearestEscortFor = (
  w: ObjectiveWorld, baseId: string,
): { baseId: string; x: number; y: number } | null => {
  if (!w.escorts) return null;
  let best: { baseId: string; x: number; y: number } | null = null, bestD = Infinity;
  for (const e of w.escorts) {
    if (e.baseId !== baseId) continue;
    const d = dist2(w.px, w.py, e.x, e.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
};

/**
 * 最寄りの未開放POI。**費用が足りないものは除く**(武器庫はスクラップが要る)。
 * `pois` 未指定のステージ/呼び出しでは常に null = 従来どおり。
 */
export const nearestUnopenedPoi = (
  w: ObjectiveWorld,
): { kind: 'armory' | 'hospital' | 'police'; x: number; y: number; radius: number } | null => {
  if (!w.pois) return null;
  let best: { kind: 'armory' | 'hospital' | 'police'; x: number; y: number; radius: number } | null = null;
  let bestD = Infinity;
  for (const p of w.pois) {
    if (p.taken) continue;
    // 費用が要るPOI(武器庫)は、払えるようになるまで後回し(=先に雑魚を倒してスクラップを貯める)。
    if (p.cost != null && w.scrap != null && w.scrap < p.cost) continue;
    const d = dist2(w.px, w.py, p.x, p.y);
    if (d < bestD) { bestD = d; best = { kind: p.kind, x: p.x, y: p.y, radius: p.radius }; }
  }
  return best;
};

/** 原点からの距離。 */
export const radiusOf = (w: ObjectiveWorld): number => Math.hypot(w.px, w.py);

/** 現在地から見て「まっすぐ外へ」進む点(深部へ潜るときの目的地)。 */
export const outwardPoint = (w: ObjectiveWorld, targetDist: number): { x: number; y: number } => {
  const r = radiusOf(w);
  if (r < 1) return { x: targetDist, y: 0 }; // 原点直上は東へ(向きが定まらないため)
  return { x: (w.px / r) * targetDist, y: (w.py / r) * targetDist };
};

/** レベル上げ用の狩り場: 原点から中距離(=危険すぎず敵が湧く)を周回する点。 */
export const FARM_RADIUS = 2200;

/** 裏ボスに挑む前に欲しい最低レベル(叩き台。?botgoal=hiddenBoss:LV で上書きできる)。 */
export const HIDDEN_BOSS_MIN_LEVEL = 12;

/** campaign: 城ボスに挑む前に欲しい最低レベル(叩き台。?botgoal=campaign:LV で上書きできる)。 */
export const CAMPAIGN_MIN_LEVEL = 10;

/**
 * campaign: 城ボスを「至近」とみなす距離(px)。これ以内なら拠点/POIより先に交戦する。
 * 城ボスは5分経過で自動出現して追ってくるため、無視して逃げ続けると詰むことへの対処。
 */
export const CAMPAIGN_BOSS_ENGAGE_PX = 900;

/**
 * 目的 → 今tickの指示。**世界の状態だけを見る純関数**(内部状態を持たない)。
 */
export const planObjective = (obj: BotObjective, w: ObjectiveWorld): ObjectivePlan => {
  // 目的なし(既定)は従来どおり何も指示しない。囲いの割り込みも入れない(挙動不変の保証)。
  if (obj.kind === 'none') return NO_PLAN;
  // **囲いイベントは全ての目的に優先する**。倒さない限り前へ進めないため(v0.25.2340)。
  const arena = arenaPlan(w);
  if (arena) return arena;

  switch (obj.kind) {
    case 'clear': {
      if (w.gameWon) return { ...NO_PLAN, done: true, note: '任務達成' };
      // ① 帰還サークルが出ている = あとはそこに立つだけ。最優先で向かう。
      if (w.returnCircle) {
        return { destination: { x: w.returnCircle.x, y: w.returnCircle.y }, focus: null, travel: true, pressAttack: false, done: false, note: '帰還サークルへ' };
      }
      // ② 城ボスが出ている = それを倒すのが任務。
      const castleBoss = w.enemies.find(e => e.type === 'giantbat' && !e.fromEvent) ?? null;
      if (castleBoss) {
        return { destination: centerOf(castleBoss), focus: castleBoss, travel: false, pressAttack: true, done: false, note: '城ボスと交戦' };
      }
      // ③ 城がまだ健在 = 城へ向かってボスを出させる。
      if (w.castleEvent && !w.finaleDefeated) {
        return { destination: { x: w.castleEvent.x, y: w.castleEvent.y }, focus: null, travel: true, pressAttack: false, done: false, note: '城へ向かう' };
      }
      // ④ 城が無いステージ/撃破済みで帰還サークル未出現 = 進行待ち。外へ探索して事象を起こす。
      return { destination: outwardPoint(w, Math.max(1500, radiusOf(w) + 800)), focus: null, travel: true, pressAttack: false, done: false, note: '進行待ち(探索)' };
    }

    case 'campaign': {
      if (w.gameWon) return { ...NO_PLAN, done: true, note: '任務達成' };
      // ① 帰還サークル = 最終段。clear と同じ扱い。
      if (w.returnCircle) {
        return { destination: { x: w.returnCircle.x, y: w.returnCircle.y }, focus: null, travel: true, pressAttack: false, done: false, note: '帰還サークルへ' };
      }
      // ② 城ボスが**至近**なら戦う。
      //    社長のシナリオは「拠点/POIを片付けてから城ボス」だが、城ボスは5分経過で自動出現して
      //    追ってくるため、無視して逃げ続けると詰む。**近い時だけ**例外的に交戦する。
      const castleBoss = w.enemies.find(e => e.type === 'giantbat' && !e.fromEvent) ?? null;
      if (castleBoss) {
        const c = centerOf(castleBoss);
        if (dist2(w.px, w.py, c.x, c.y) <= CAMPAIGN_BOSS_ENGAGE_PX ** 2) {
          return { destination: c, focus: castleBoss, travel: false, pressAttack: true, done: false, note: '城ボスが至近=交戦' };
        }
      }
      // ③ 未制圧の拠点 → **担当の護衛NPCに付き添う**(拠点の中心へ立っても制圧されない)。
      //    escort は画面内でしか前進しないので、ボットの仕事は「escortを画面内に入れ続けて護衛する」。
      //    escort が居ない/未提供の場合だけ、従来どおり拠点そのものを目的地にする。
      const base = nearestUncapturedBase(w);
      if (base) {
        const captured = w.baseSites.filter(b => b.status === 'captured').length;
        const escort = nearestEscortFor(w, base.id);
        if (escort) {
          return {
            destination: { x: escort.x, y: escort.y }, focus: null, travel: true, pressAttack: false,
            done: false, // hold は出さない=付いて行きながら普段どおり戦う(escortを守るのが仕事)
            note: `護衛NPCに随伴して拠点へ(${captured}/${w.baseSites.length})`,
          };
        }
        return {
          destination: { x: base.x, y: base.y }, focus: null, travel: true, pressAttack: false,
          done: false,
          note: `拠点へ(${captured}/${w.baseSites.length})`,
        };
      }
      // ④ 未開放のPOI → 最寄りへ。円内に入ったら**留まる**(3秒の滞在)。
      //    警察署はアリーナ(囲い)が発火するので、その後は①の arenaPlan が引き取る。
      const poi = nearestUnopenedPoi(w);
      if (poi) {
        const inCircle = dist2(w.px, w.py, poi.x, poi.y) <= poi.radius ** 2;
        return {
          destination: { x: poi.x, y: poi.y }, focus: null, travel: !inCircle, pressAttack: false,
          done: false, hold: inCircle && poi.kind !== 'police', // 警察署は留まるのではなく戦う
          note: inCircle ? `${poi.kind}を開放中` : `${poi.kind}へ`,
        };
      }
      // ⑤ 城ボスに挑む前の最低レベル(裏ボスと同じ作法)。
      const need = obj.minLevel ?? CAMPAIGN_MIN_LEVEL;
      if (w.level < need) {
        return { destination: outwardPoint(w, FARM_RADIUS), focus: null, travel: false, pressAttack: false, done: false, note: `Lv上げ中(${w.level}/${need})` };
      }
      // ⑥⑦ ここから先は clear と同じ(城へ向かう/進行待ち)。
      if (castleBoss) {
        return { destination: centerOf(castleBoss), focus: castleBoss, travel: false, pressAttack: true, done: false, note: '城ボスと交戦' };
      }
      if (w.castleEvent && !w.finaleDefeated) {
        return { destination: { x: w.castleEvent.x, y: w.castleEvent.y }, focus: null, travel: true, pressAttack: false, done: false, note: '城へ向かう' };
      }
      return { destination: outwardPoint(w, Math.max(1500, radiusOf(w) + 800)), focus: null, travel: true, pressAttack: false, done: false, note: '進行待ち(探索)' };
    }

    case 'score': {
      // スコアはトレジャー(1個5000)が最大の梃子。次に強敵(エリート3000/ボス8000)。
      const treasure = nearestPickup(w, ['treasure', 'chest']);
      if (treasure) {
        return { destination: { x: treasure.x, y: treasure.y }, focus: null, travel: true, pressAttack: false, done: false, note: 'トレジャーへ' };
      }
      const elite = w.enemies.find(e => e.type === 'pumpkin') ?? w.enemies.find(e => e.type === 'giantbat') ?? null;
      if (elite) {
        return { destination: centerOf(elite), focus: elite, travel: false, pressAttack: false, done: false, note: '強敵と交戦' };
      }
      // 見えるものが無ければ深部へ(深いほどトレジャー/強敵が増える)。
      return { destination: outwardPoint(w, radiusOf(w) + 900), focus: null, travel: true, pressAttack: false, done: false, note: '深部を探索' };
    }

    case 'hiddenBoss': {
      if (w.hiddenBossDefeated) return { ...NO_PLAN, done: true, note: '裏ボス撃破' };
      if (!w.hiddenBoss || !w.hiddenBossLair) {
        return { ...NO_PLAN, note: 'このステージに裏ボスは居ない' };
      }
      // ① 既に出会っている = 倒す。
      const boss = nearestOfType(w, w.hiddenBoss);
      if (boss) {
        return { destination: centerOf(boss), focus: boss, travel: false, pressAttack: true, done: false, note: '裏ボスと交戦' };
      }
      // ② レベルが足りない = 中距離の狩り場でレベル上げ(社長指示「必要であればレベル上げも含めて」)。
      const need = obj.minLevel ?? HIDDEN_BOSS_MIN_LEVEL;
      if (w.level < need) {
        return { destination: outwardPoint(w, FARM_RADIUS), focus: null, travel: false, pressAttack: false, done: false, note: `Lv上げ中(${w.level}/${need})` };
      }
      // ③ 巣へ向かう。
      return { destination: w.hiddenBossLair, focus: null, travel: true, pressAttack: false, done: false, note: '裏ボスの巣へ' };
    }

    case 'hunt': {
      const target = nearestOfType(w, obj.enemyType);
      if (target) {
        return { destination: centerOf(target), focus: target, travel: false, pressAttack: false, done: false, note: `${obj.enemyType}と交戦` };
      }
      // 見つからない = 出現条件を満たしに行く(多くは時間経過+深部)。外へ潜って待つ。
      return { destination: outwardPoint(w, radiusOf(w) + 700), focus: null, travel: true, pressAttack: false, done: false, note: `${obj.enemyType}を探索中` };
    }

    case 'depth': {
      const r = radiusOf(w);
      if (r >= obj.dist) return { ...NO_PLAN, done: true, note: `${Math.round(obj.dist)}mへ到達` };
      return { destination: outwardPoint(w, obj.dist), focus: null, travel: true, pressAttack: false, done: false, note: `深部へ(${Math.round(r)}/${Math.round(obj.dist)}m)` };
    }

    case 'kills': {
      if (w.enemiesKilled >= obj.count) return { ...NO_PLAN, done: true, note: `${obj.count}体撃破` };
      // 敵が見えていれば普通に戦う。居なければ湧きの多い外側へ。
      const any = w.enemies.length > 0;
      return {
        destination: any ? null : outwardPoint(w, radiusOf(w) + 600),
        focus: null, travel: !any, pressAttack: false, done: false,
        note: `撃破 ${w.enemiesKilled}/${obj.count}`,
      };
    }

    case 'bases': {
      const captured = w.baseSites.filter(b => b.status === 'captured').length;
      if (captured >= obj.count) return { ...NO_PLAN, done: true, note: `拠点${obj.count}個解放` };
      const base = nearestUncapturedBase(w);
      if (!base) return { ...NO_PLAN, note: '解放できる拠点が無い' };
      return { destination: { x: base.x, y: base.y }, focus: null, travel: true, pressAttack: false, done: false, note: `拠点へ(${captured}/${obj.count})` };
    }

    default:
      return NO_PLAN;
  }
};

// ---------------------------------------------------------------------------
// 目的地への移動

/** 目的地に「着いた」とみなす距離(px)。ここから先は通常の戦闘behaviorに任せる。 */
export const ARRIVE_DIST = 70;

/**
 * `ObjectivePlan.hold` が立っている時に使う「動かない」入力。
 * 合成側(useGameLoop / playtestDriver)が回避の次の優先度で差し込む。
 */
export const HOLD_INPUT: Readonly<InputState> = { up: false, down: false, left: false, right: false };

/** 目的地へ向かう単位ベクトル。着いていれば null。 */
export const steerTo = (
  px: number, py: number, dest: { x: number; y: number } | null, arriveDist = ARRIVE_DIST,
): { x: number; y: number } | null => {
  if (!dest) return null;
  const dx = dest.x - px, dy = dest.y - py;
  const d = Math.hypot(dx, dy);
  if (d <= arriveDist || d < 0.0001) return null;
  return { x: dx / d, y: dy / d };
};

// ---------------------------------------------------------------------------
// 文字列 → 目的(URLパラメータ / テスト設定から)

/**
 * `?botgoal=` の値を目的へ。書式:
 *   none / clear / campaign / campaign:12 / score / hiddenBoss / hiddenBoss:15 /
 *   hunt:reaper / hunt:hunter / depth:7500 / kills:100 / bases:2
 * 未知の値・壊れた値は `none`(=従来の挙動)へ落とす。
 */
export const parseBotObjective = (v: string | null | undefined): BotObjective => {
  if (!v) return { kind: 'none' };
  const [head, arg] = v.split(':');
  const num = Number(arg);
  switch (head) {
    case 'clear': return { kind: 'clear' };
    case 'campaign': return { kind: 'campaign', ...(Number.isFinite(num) && num > 0 ? { minLevel: num } : {}) };
    case 'score': return { kind: 'score' };
    case 'hiddenBoss': return { kind: 'hiddenBoss', ...(Number.isFinite(num) && num > 0 ? { minLevel: num } : {}) };
    case 'hunt': return arg ? { kind: 'hunt', enemyType: arg as EnemyType } : { kind: 'none' };
    case 'depth': return Number.isFinite(num) && num > 0 ? { kind: 'depth', dist: num } : { kind: 'none' };
    case 'kills': return Number.isFinite(num) && num > 0 ? { kind: 'kills', count: Math.floor(num) } : { kind: 'none' };
    case 'bases': return Number.isFinite(num) && num > 0 ? { kind: 'bases', count: Math.floor(num) } : { kind: 'none' };
    default: return { kind: 'none' };
  }
};
