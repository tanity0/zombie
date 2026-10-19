// ステージ2(屋外ラボ廊下)の「這う塊」(社長指示2026-10-19「ステージ2の敵追加。アイドルがいる側の入り口に
// スタンバイ。通路を遮る様に配置しており、ゆっくり追いかけてくる。画面外でも追いかける。すごくゆっくり」
// +追加「この敵は、通常の敵も攻撃します。10体取り込むと、昇天して消えます。(アテンションは無し)
// プレイヤーはすり抜けられず、手で押しつぶされると大きく吹っ飛ばされます。ダメージは大きめ。即死では無い」)。
//
// 本体は**敵(Enemy)ではない**独立したワールドの存在(状態機械・移動・叩きつけはここ)。
// ★第2版(社長2026-10-19「当たり判定も通常の敵のように追加。HPは37564」・research/LAB_CRAWLER.md §4):
//   攻撃を受ける窓口として、敵配列に**代理の Enemy**(id=CRAWLER_PROXY_ID・型 'lab-crawler')を1体置く
//   (utils/labCrawlerProxy.ts)。弾・近接・爆発・サブウェポン・仲間の攻撃はその代理に当たり、減った分を
//   塊の hp(CRAWLER_HP)から引く。代理は描かない・動かない・落とさない(撃破・経験値・ドロップは無い)。
//   体力バーは出さない。HP0で崩れて沈み、光が昇る(昇天の見せ方)。
// ★第2版: 資料を拾うと、塊はプレイヤーの前方(資料の奥側・画面のすぐ外)へ回り込み(crawlerChaseSpawn)、
//   プレイヤーの今の移動の速さ×1.1で追う(CRAWLER_CHASE_SPEED_MULT)。雑魚を叩きつける間は止まる。
// ★第2版: 廊下の壁・遮蔽プロップは塊の箱が重なると壊れる(crawlerBreaksObstacle・壊れた集合は store)。
// 塊が壁になるのはプレイヤーだけ(雑魚は塊をすり抜けてよい)。
// ★通路の塞ぎ方(社長決定2026-10-19「bで、ただし上下にも移動する」): 当たり判定は廊下(帯±200)を大きく塞ぐ奥行き300の箱。
//   見たまま=当たる範囲にするため、塊は**1体を大きく**描く(社長「これ一体で、でかくしてほしい。5倍くらい」)。
//   絵の胴の幅=元の1体(165)の5倍、当たり判定の幅=その0.9倍。絵の足元=箱の下辺、絵の背丈(約290)≈箱の奥行き(300)。
//   塊の y はプレイヤーの y を追う(上下は速め・慣性つき)=フェイントで逆側の隙間へ回り込めば抜けられる。
//   ★壁・プロップは塊を止めない(肉が床を這って乗り越える)。奥行き300の箱は帯の中の壁の列(|y|≈24〜78)を必ず跨ぐので、
//   止めると一歩も進めなくなるため。プレイヤーを押す時の行き先の確認には壁・プロップを使う(挟み込まない)。
//
// ここは判定と状態機械だけを持つ純関数(renderer-agnostic・PixiJS非依存・store非依存)。
// 配線(store/敵配列/被ダメージの経路)は `utils/labCrawlerTick.ts`、絵は `pixi/pixiScene.ts`。
import { footRect, rectsOverlap, resolveAabb, segmentBlocked, type Rect } from './obstacles';
import { LAB_VISION_RANGE } from '../utils/labStealth'; // 研究所の休眠敵と同じ視界(新しい数値を作らない)
import { clampRectToPlayableArea, isRectInPlayableArea, type PlayableAreaCtx } from './playableArea';

// ---- 寸法・速さ ------------------------------------------------------------------------------
/** 出現位置: スタート(原点)からアイドルの方へこの距離(箱の中心)。600→900(社長2026-10-20「スタート地点近すぎる。もう少しだけ後ろに」)。 */
export const CRAWLER_START_DIST_PX = 900;
/** 絵の胴の表示幅(px)。元の1体(165)の5倍(社長「5倍くらい」)。 */
export const CRAWLER_ART_BODY_DISPLAY_W = 165 * 5;
/** 当たり判定の幅(足元基準の箱)=描いた胴の幅の0.9倍(胴の両端の腕・管の先は通り抜ける程度)。 */
export const CRAWLER_HIT_W = Math.round(CRAWLER_ART_BODY_DISPLAY_W * 0.9);
/**
 * 当たり判定の奥行き(足元から上へ)。帯(±200=幅400)を大きく塞ぎ、塊が帯の真ん中にいる時に上下それぞれ約50の隙間を残す
 * (社長決定2026-10-19)。描画はこの箱と同じ広がりの肉の溜まりを床に敷く=見たまま当たる。
 */
export const CRAWLER_HIT_H = 300;
/** 本体の絵の胴の幅 ÷ 判定の幅(描画が使う)。 */
export const CRAWLER_ART_W_PER_HIT_W = CRAWLER_ART_BODY_DISPLAY_W / CRAWLER_HIT_W;
/**
 * 本体の絵の足元: 箱の下辺(=足元 y)からこれだけ奥。0=絵の下端が箱の下辺。絵の背丈(130画素×倍率2.23≈290)が箱の奥行き300と
 * ほぼ同じなので、絵の上端≈箱の上辺(差約10px)。
 */
export const CRAWLER_BODY_FOOT_UP_PX = 0;
/**
 * 起きる進み具合(社長指示2026-10-19「順路を20%くらい進む(資料がゴールとした時に)と、動き始めます。その時アテンションイベント」)。
 * 順路=スタート(原点)→ゴール資料の廊下の1本道。資料の向きへ進んだx距離 ÷ 資料までのx距離 がこの値以上で起きる。一度起きたら戻らない。
 */
export const CRAWLER_WAKE_PROGRESS = 0.2;
/** 横の最高速度(px/秒)。プレイヤー約104・ゾンビ42 に対して「すごくゆっくり」。 */
export const CRAWLER_MAX_SPEED = 18;
/** 近くに居る時の突進(社長2026-10-19「近くにいるとすごいスピードでおいかけてきて」)。箱の縁からプレイヤーまでこの距離以内で、横の最高速度が RUSH まで上がる(プレイヤーの素の速さより速い)。 */
export const CRAWLER_RUSH_RANGE_PX = 320;
export const CRAWLER_RUSH_SPEED = 135;
/** 突進の時の加減速の時定数(秒)。遠い時より速く寄る。 */
export const CRAWLER_RUSH_TAU_S = 0.35;
/** 縦の最高速度(px/秒)。プレイヤーの y を追う(社長決定「上下にも移動する」・約70)。 */
export const CRAWLER_MAX_SPEED_Y = 70;
/** 縦の追い方: 高さの差(px)×これ を目標の縦速度にする(最高 CRAWLER_MAX_SPEED_Y)。差が詰まるほどゆっくり寄る。 */
export const CRAWLER_Y_GAIN = 1.6;
/** 横の速度を目標へ寄せる時定数(秒)=慣性。走り出し・止まりがこの尺で滑らかになる。 */
export const CRAWLER_ACCEL_TAU_S = 0.8;
/** 縦の時定数(秒)。横より短いが、フェイントで逆側へ回り込める程度に遅れる。 */
export const CRAWLER_ACCEL_TAU_Y_S = 0.5;
/** 向きを変えるのは、プレイヤーが中心からこれ以上反対側へ出た時だけ(その場でパタパタしない)。 */
export const CRAWLER_FACE_HYST_PX = 24;

// ---- 攻撃(手で押しつぶす) -------------------------------------------------------------------
/**
 * 叩きつける円の中心 = 塊の中心から、向いている方へこの距離(縦は手のひらが地面に着く高さ=箱の下辺から CRAWLER_SLAM_HAND_UP_PX)。
 * 攻撃シート(6688×130)の手が地面に着くコマ7〜8で、土埃の出る手のひらは胴の中心から前へ約97〜159画素
 * (中心≈125画素)=表示で約280px。円はそこを中心に置く。
 */
export const CRAWLER_SLAM_FWD_PX = 280;
/** 手のひらが地面に着く高さ: 絵の下端(=箱の下辺)から約15画素=表示で約33px奥。 */
export const CRAWLER_SLAM_HAND_UP_PX = 33;
/**
 * 叩きつける円の半径(=赤い予告の半径=判定)。手のひらが地面に着く範囲(土埃の広がり±55画素)と、伸ばした爪の先(胴の中心から
 * 約195画素=表示約435px)までを含む。箱の横に接して立つプレイヤーには、箱の中ほどの高さまで当たる。
 */
export const CRAWLER_SLAM_RADIUS = 230; // 155→230(社長2026-10-19「攻撃範囲もっと広く」)
/** 歩きシートのコマ数(lab-crawler-walk.png 4800×130・1コマ400px)。 */
export const CRAWLER_WALK_FRAMES = 12;
/** 攻撃シートのコマ数(lab-crawler-attack.png 6688×130・1コマ418px)。 */
export const CRAWLER_ATTACK_FRAMES = 16;
/** 手が地面に着くコマ(0始まり)。最初の土埃が出るコマ(新しい攻撃シートでも同じ7=実測)。ここ=当たる瞬間。 */
export const CRAWLER_ATTACK_IMPACT_FRAME = 7;
/** 溜め(振り上げ)= コマ0〜6 の7コマぶん。巨体らしく遅め。 */
export const CRAWLER_WINDUP_MS = 620; // 980→620(社長2026-10-19「攻撃もっと早めて」)。コマの比(CRAWLER_WINDUP_FRAME_MS)で割り付ける
/** 戻り = コマ7〜15 の9コマぶん(叩きつけ・土埃が舞って収まるまで)。 */
export const CRAWLER_RECOVER_MS = 600; // 900→600(同上)
/** 次の攻撃までの間(戻りが終わってから)。 */
export const CRAWLER_COOLDOWN_MS = 1200; // 2500→1200(同上)
/**
 * 叩きつけのダメージ(プレイヤー)。「大きめ・即死ではない」。基準HP120の1/3。
 * 比較: ステージ2で一番重い一撃=研究所の大型(lab-zombie-3)の跳び36・アイドルの拳/狙撃30、
 * 英雄の跳び28・パンプキン16。これらより一段上。即死させる仕組みは持たない(通常の被ダメージ)。
 */
export const CRAWLER_SLAM_DAMAGE = 40; // 旧・固定値(参照用)。実際はプレイヤーの最大体力 × CRAWLER_SLAM_DAMAGE_FRAC
/** 叩きつけのダメージ=プレイヤーの最大体力の50%(社長2026-10-19「二発喰らうと死ぬ(つまり50%)」)。1発では倒れない(満タンから)。 */
export const CRAWLER_SLAM_DAMAGE_FRAC = 0.5;
export const crawlerSlamDamage = (playerMaxHealth: number): number => Math.max(1, Math.ceil(Math.max(1, playerMaxHealth) * CRAWLER_SLAM_DAMAGE_FRAC));
/** 叩きつけの吹き飛び(距離px・尺ms)。既存最大(英雄の突き260px)・重い被弾の段(約200px)より大きい。 */
export const CRAWLER_SLAM_KB = { distPx: 300, ms: 520 } as const;
/**
 * 昇天(HP0で倒れた時)に昇る光の最少の数。取り込んだ数がこれより多ければその数(描画の上限16)。
 * 第1版は「10体取り込むと昇天」だった(社長2026-10-19「雑魚10体で昇天する仕様はやめる」で廃止)。光の数だけ残す。
 */
export const CRAWLER_ASCEND_SOULS = 10;
/** 体力(社長2026-10-19「HPは37564」)。体力バーは出さない。 */
export const CRAWLER_HP = 37564;
/** 追いかける速さ=プレイヤーの今の移動の速さ×これ(社長「最後追いかけてくる時、プレイヤーより10%早く」)。 */
export const CRAWLER_CHASE_SPEED_MULT = 1.1;
/** 追いかける時の加減速の時定数(秒)=慣性。突進(CRAWLER_RUSH_TAU_S)と同じ尺で寄る。 */
export const CRAWLER_CHASE_TAU_S = 0.35;
/**
 * 横の速さの慣性(社長指示2026-10-20「塊の速さ、慣性持たせて。止まりからは、徐々にスピードを上げる」)。
 * 速める時は一定の加速度でじわじわ(止まりから追跡の速さ約115まで約1.9秒・突進135まで約2.3秒)、
 * 緩める・向きを変える時はそれより強い減速度で(巨体なので止まるのにも少しかかる=約0.6秒)。
 * 旧: 目標の速さへ指数で寄る(時定数0.35〜0.8秒)=止まりから一瞬で速さが乗っていた。
 */
export const CRAWLER_ACCEL_PX_S2 = 60;
export const CRAWLER_DECEL_PX_S2 = 220;
/** 目覚める前後のゆっくり這い(最高18px/秒)の加減速。止まりから約1.2秒で乗り、約0.6秒で止まる。 */
export const CRAWLER_SLOW_ACCEL_PX_S2 = 15;
export const CRAWLER_SLOW_DECEL_PX_S2 = 30;
/** 横の速さを目標へ寄せる(純関数): 速める時は up、緩める/逆向きは down の加速度で。 */
export const approachCrawlerSpeed = (v: number, target: number, dt: number, up = CRAWLER_ACCEL_PX_S2, down = CRAWLER_DECEL_PX_S2): number => {
  if (!(dt > 0)) return v;
  const sameDir = v === 0 || Math.sign(v) === Math.sign(target);
  const rate = sameDir && Math.abs(target) > Math.abs(v) ? up : down;
  const dv = rate * dt;
  return target > v ? Math.min(target, v + dv) : Math.max(target, v - dv);
};
/**
 * 資料を拾った瞬間に現れる位置: プレイヤーの中心から、資料の奥の向きへ「画面の半分+この余白」先に箱の手前の縁が来る
 * (画面のすぐ外=アテンションでカメラが寄るとすぐ見える)。
 */
export const CRAWLER_CHASE_SPAWN_MARGIN_PX = 60;
/**
 * 追いつきの基準距離(品質監査A4): 回り込んだ直後、塊の縁とプレイヤーの隙間がこれより遠い間だけ、追いつく速さで寄せる
 * (横に広い画面=PCでは「見えている端+60」がスマホの4倍遠く、1.1倍では追いつかないため)。一度この距離まで来たら以後は1.1倍だけ
 * (雑魚を食べて離れた後に追いつきへ戻さない=雑魚が時間を稼ぐ仕組みはそのまま)。
 * スマホ縦持ち(横430)では回り込んだ時の隙間が約260px=この距離より近い=追いつきは起きない(従来と同じ)。
 */
export const CRAWLER_CHASE_CATCHUP_GAP_PX = 320;
/** 追いつく速さ=追跡の速さ×これ(下限は突進の速さ)。 */
export const CRAWLER_CHASE_CATCHUP_MULT = 1.5;
/**
 * 追跡中にプレイヤーを狙った叩きつけ(slamMoving)で、溜めの何割まで進み続けるか(0..1・品質監査2巡目A-0)。
 * 社長決定=0.5: 溜めの前半は追跡の速さで進み、赤い円も一緒に動く。後半は止まり、円も止まる(=当たる位置=最後に描いた円)。
 * 真っすぐ走って逃げれば、後半の間に円の外へ出られる。戻りの間は進む。
 */
export const CRAWLER_CHASE_SLAM_ADVANCE_FRAC = 0.5; // 社長決定2026-10-19(中間案): 溜めの前半だけ進み、後半は止まる
/** 資料を拾った後の帯の文言(store の beginLabEscape と labCrawlerTick の両方がここを読む=1か所・クリエイティブ監査2巡目#19)。 */
export const LAB_ESCAPE_BANNER_TEXT = '入り口まで走れ';
/**
 * 資料の後の追跡の終わり(社長2026-10-19「ゴール手前まで来ると消える。アイドルに行くならそのまま奥へ行けばいい」):
 * 塊の前の縁(ゴール側の縁)が原点からこの距離まで来たら、床へ沈んで引いていく(vanish)。消えた後はアイドル側への道が開く。
 */
export const CRAWLER_VANISH_GOAL_DIST_PX = 600;
/** 沈んで引いていく尺(ms・判定なし)。 */
export const CRAWLER_VANISH_MS = 1700;
/** 現れてから最初の攻撃までの間(ms)。出てきた瞬間に手の届く雑魚を叩かない(まず姿を見せる)。 */
export const CRAWLER_CHASE_FIRST_ATTACK_MS = 900;
/**
 * 取り込まれた敵の絵の尺(判定なし)。当たった瞬間に手の下で潰れ(CRAWLER_ABSORB_CRUSH_MS)、戻りの手に合わせて
 * 引きずり込まれ(残り約900ms)、塊の縁の下へ沈んで隠れる。
 */
export const CRAWLER_ABSORB_CRUSH_MS = 160;
export const CRAWLER_ABSORB_MS = CRAWLER_ABSORB_CRUSH_MS + 900;
/** 昇天(崩れて床へ沈み、取り込んだ数だけの光が1つずつ昇って消える)の尺。この間は判定なし(通れる・攻撃しない)。 */
export const CRAWLER_ASCEND_MS = 2900; // 最後(10番目)の光が昇り切る 450+9×140+1050=2770 より少し長く
/**
 * 絵の縮尺の基準=各シートの「1コマの胴の実測幅」(不透明画素の外接幅のコマ平均・シートの画素)。
 * 表示幅(CRAWLER_HIT_W×CRAWLER_ART_W_PER_HIT_W)÷これ がそのシートの倍率=どちらのシートも画面で同じ大きさに見える。
 * ★素材を差し替えたら測り直す。
 *   歩き: lab-crawler-walk.png 4800×130・12コマ×400(2026-10-19差し替え・胴の外接幅の平均370・山の高さ約112。旧2576×70は197)。
 *   攻撃: lab-crawler-attack.png 6688×130・16コマ×418(2026-10-19差し替え・山の高さ約107〜117=歩きと同じ画素の細かさ)。
 *     外接幅(約392)は振り上げた腕と土埃を含むので使わず、山の高さが揃うことから**歩きと同じ倍率**にする(370)。
 *     旧2576×50は151。
 */
export const CRAWLER_WALK_ART_BODY_W = 370;
export const CRAWLER_ATTACK_ART_BODY_W = 370;
/**
 * 歩きシートの中のランタン(目覚めると灯る)の位置。コマの下端中央からのずれ(シートの画素・素材は左向き)。
 * コマ0で実測(歩くとコマごとに数px揺れるが、灯りは柔らかい光なので1組で足りる)。★素材を差し替えたら測り直す。
 */
export const CRAWLER_LANTERNS_WALK_ART: readonly { x: number; y: number }[] = [
  { x: 26, y: -86 }, { x: 7, y: -69 }, { x: 21, y: -44 }, { x: 35, y: -38 },
];

/** ascend=倒れて昇天(HP0) / vanish=資料の後の追跡でゴール手前まで来て床へ沈んで引いていく(倒した報いと区別・光は昇らない)。 */
export type LabCrawlerState = 'move' | 'windup' | 'recover' | 'ascend' | 'vanish';

/** 取り込まれて吸い寄せられている最中の敵(絵だけ・判定なし)。 */
export interface CrawlerAbsorbing {
  id: string; type: string;
  /** 取り込まれた瞬間の足元(中心x・足y)と判定の寸法。 */
  x: number; y: number; w: number; h: number;
  at: number; // gameTime
}

export interface LabCrawler {
  /** 起きているか。起きるまでは動かない・攻撃しない(壁としてはプレイヤーを通さない)。 */
  awake: boolean;
  /** 残りの体力(0で昇天)。 */
  hp: number;
  /** 資料を拾った後の追跡中か(速さ=プレイヤー×1.1・突進は使わない)。 */
  chasing: boolean;
  /** ゴール資料のx(起きる条件の順路の終点)。 */
  goalX: number;
  /** 足元(箱の下辺の中心)。 */
  x: number; y: number;
  vx: number; vy: number;
  facingLeft: boolean;
  state: LabCrawlerState;
  /** 今の状態に入った時刻(gameTime)。 */
  stateAt: number;
  /** 溜め中: 当たる時刻(=溜めの終わり)。 */
  hitAt: number;
  /**
   * 叩きつけの円の中心。資料の前と、雑魚を狙う時は溜め開始の時点で地面に固定(後から追わない)。
   * 追跡中にプレイヤーを狙う時(slamMoving)だけは、溜めの前半(CRAWLER_CHASE_SLAM_ADVANCE_FRAC)は塊と一緒に動き、後半は止まる
   * (=当たる位置=最後に描いた円)。
   */
  slamX: number; slamY: number;
  /**
   * 第2版(品質監査A1): 追跡中にプレイヤーを狙った叩きつけ。溜めの前半と戻りの間は追跡の速さで進み、溜めの後半は止まる
   * (社長決定2026-10-19 CRAWLER_CHASE_SLAM_ADVANCE_FRAC=0.5。雑魚を狙う(食べる)時は溜めの間ずっと止まる)。
   */
  slamMoving: boolean;
  /** 回り込んだ直後の追いつき中(品質監査A4)。基準距離まで来たら false に戻り、以後は立たない。 */
  chaseCatchUp: boolean;
  /** この時刻以降に次の攻撃を始めてよい。 */
  nextAttackAt: number;
  absorbed: number;
  absorbing: CrawlerAbsorbing[];
  /** プレイヤーに押し止められて前へ進めていない(描画が「もがく」コマ送りに使う・判定には使わない)。 */
  pressing: boolean;
}

/** 塊の当たり判定(足元基準)。 */
export const crawlerRect = (c: Pick<LabCrawler, 'x' | 'y'>): Rect => footRect(c.x, c.y, CRAWLER_HIT_W, CRAWLER_HIT_H);
/** 箱の中心。 */
export const crawlerCenter = (c: Pick<LabCrawler, 'x' | 'y'>): { x: number; y: number } => ({ x: c.x, y: c.y - CRAWLER_HIT_H / 2 });
/** 箱の縁からプレイヤーの箱までの隙間(重なっていれば0)。 */
export const crawlerGapToPlayer = (c: Pick<LabCrawler, 'x' | 'y'>, p: Rect): number => {
  const r = crawlerRect(c);
  const gx = Math.max(0, r.x - (p.x + p.width), p.x - (r.x + r.width));
  const gy = Math.max(0, r.y - (p.y + p.height), p.y - (r.y + r.height));
  return Math.hypot(gx, gy);
};
/** 突進中か(プレイヤーが箱の縁から CRAWLER_RUSH_RANGE_PX 以内)。 */
export const crawlerRushing = (c: Pick<LabCrawler, 'x' | 'y'>, p: Rect): boolean => crawlerGapToPlayer(c, p) <= CRAWLER_RUSH_RANGE_PX;
/** 本体の絵の足元(肉の溜まりの上・箱の中心より少し奥)。 */
export const crawlerBodyFoot = (c: Pick<LabCrawler, 'x' | 'y'>): { x: number; y: number } => ({ x: c.x, y: c.y - CRAWLER_BODY_FOOT_UP_PX });
/** 今の向きで叩きつけたら円がどこへ落ちるか(絵の手のひらが地面に着く所)。 */
export const crawlerSlamCenter = (c: Pick<LabCrawler, 'x' | 'y' | 'facingLeft'>): { x: number; y: number } =>
  ({ x: c.x + (c.facingLeft ? -1 : 1) * CRAWLER_SLAM_FWD_PX, y: c.y - CRAWLER_SLAM_HAND_UP_PX });
/**
 * プレイヤーに面した縁の少し内側の x(描画・演出の出どころ用・判定には使わない)。箱は幅約740でスマホの画面より広いので、
 * 中心に出す絵(倒れた時の光・土煙)は画面の外になりやすい。プレイヤーが箱の上下に居る時はプレイヤーの x(箱の中に収める)。
 */
export const crawlerFacingEdgeX = (c: Pick<LabCrawler, 'x' | 'y'>, playerCx: number, inset = 120): number => {
  const r = crawlerRect(c);
  if (playerCx >= r.x + r.width) return r.x + r.width - inset;
  if (playerCx <= r.x) return r.x + inset;
  return Math.max(r.x + inset, Math.min(r.x + r.width - inset, playerCx));
};
/** 資料の後の追跡で進む向き(+1=右/-1=左)=ゴール(原点)の方。資料と逆向き。 */
export const crawlerGoalDir = (c: Pick<LabCrawler, 'goalX'>): number => (c.goalX >= 0 ? -1 : 1);
/** 前の縁(ゴール側の縁)が原点から CRAWLER_VANISH_GOAL_DIST_PX の所まで来たか。 */
export const crawlerReachedGoal = (c: Pick<LabCrawler, 'x' | 'y' | 'goalX'>): boolean => {
  const r = crawlerRect(c);
  const dir = crawlerGoalDir(c);
  const front = dir > 0 ? r.x + r.width : r.x;
  return dir * front >= -CRAWLER_VANISH_GOAL_DIST_PX;
};
/** 昇天中・沈んで消える間は判定が無い(通れる・攻撃しない)。 */
export const crawlerSolid = (c: Pick<LabCrawler, 'state'>): boolean => c.state !== 'ascend' && c.state !== 'vanish';

/**
 * 資料を拾った瞬間、塊をプレイヤーの前方(資料の奥側・画面のすぐ外)へ回り込ませる(社長2026-10-19「資料拾ったら、その瞬間、
 * 後ろにいた塊が前から出てくる」)。待機中・追跡中・どこに居ても同じ。箱の手前の縁=プレイヤーの中心から「画面の半分+余白」先、
 * 高さはプレイヤーに合わせて帯の中へ。向きはプレイヤーの方。起きていなければ起こす(ランタンが灯る)。
 * 昇天中(倒れかけ)は回り込まない=null。
 * `viewHalfW` = 今のズームで見えている横幅の半分(px・ワールド座標)。
 */
export const crawlerChaseSpawn = (
  c: LabCrawler, player: Rect, viewHalfW: number, playable: PlayableAreaCtx, gameTime: number,
): LabCrawler | null => {
  if (!crawlerSolid(c)) return null;
  const dir = c.goalX >= 0 ? 1 : -1; // 資料の奥の向き(原点→資料)
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const nearEdge = pcx + dir * (Math.max(0, viewHalfW) + CRAWLER_CHASE_SPAWN_MARGIN_PX);
  const left = dir > 0 ? nearEdge : nearEdge - CRAWLER_HIT_W;
  const r = clampRectToPlayableArea(left, pcy - CRAWLER_HIT_H / 2, CRAWLER_HIT_W, CRAWLER_HIT_H, playable);
  const foot = { x: r.x + CRAWLER_HIT_W / 2, y: r.y + CRAWLER_HIT_H };
  return {
    ...c,
    chaseCatchUp: crawlerGapToPlayer(foot, player) > CRAWLER_CHASE_CATCHUP_GAP_PX,
    awake: true, chasing: true,
    x: r.x + CRAWLER_HIT_W / 2, y: r.y + CRAWLER_HIT_H,
    vx: 0, vy: 0,
    facingLeft: dir > 0, // プレイヤー(手前=原点の側)を向く
    state: 'move', stateAt: gameTime, hitAt: 0, slamMoving: false,
    nextAttackAt: gameTime + CRAWLER_CHASE_FIRST_ATTACK_MS,
    absorbing: [], // 前の場所で吸い込んでいた絵は持ち越さない(画面を横切って伸びる)
    pressing: false,
  };
};

/**
 * 攻撃が当たった分の体力を引く(純関数)。HP0 で昇天(崩れて沈み、光が昇る)へ。昇天中・0以下のダメージは何もしない。
 * 溜めの最中に倒れたら叩きつけは出ない(赤い予告も消える=crawlerTelegraphProg は溜めの間だけ)。
 */
export const applyCrawlerDamage = (c: LabCrawler, dmg: number, gameTime: number): { next: LabCrawler; died: boolean } => {
  if (!crawlerSolid(c) || !(dmg > 0)) return { next: c, died: false };
  const hp = Math.max(0, c.hp - dmg);
  if (hp > 0) return { next: { ...c, hp }, died: false };
  return { next: { ...c, hp: 0, state: 'ascend', stateAt: gameTime, pressing: false }, died: true };
};

/**
 * 塊の箱が重なった壁・プロップ(社長2026-10-19「この塊は壁を破壊して進む」)。起きていて判定がある時だけ壊す
 * (待機中は動かない=出現位置にかかった壁を開幕で壊さない)。返すのは壊れる物の id。
 */
export const crawlerObstacleHits = (
  c: Pick<LabCrawler, 'x' | 'y' | 'awake' | 'state'>, obstacles: readonly { id: string; rect: Rect }[],
): string[] => {
  if (!c.awake || !crawlerSolid(c)) return [];
  const box = crawlerRect(c);
  return obstacles.filter(o => rectsOverlap(box, o.rect)).map(o => o.id);
};

/**
 * プレイヤーが順路(原点→ゴール資料)をどこまで進んだか(0〜)。x方向だけを見る(廊下の1本道)。資料と逆へ進むと負。
 */
export const crawlerRouteProgress = (playerCx: number, goalX: number): number =>
  Math.abs(goalX) < 1e-6 ? 0 : playerCx / goalX;
/** 起きる条件①(順路の CRAWLER_WAKE_PROGRESS 以上)。 */
export const crawlerShouldWake = (playerCx: number, goalX: number): boolean =>
  crawlerRouteProgress(playerCx, goalX) >= CRAWLER_WAKE_PROGRESS;
/**
 * 起きる条件②(社長指示2026-10-19「近寄っても目覚める」): プレイヤーが近づいた。研究所の休眠敵と同じ視界(LAB_VISION_RANGE)。
 * 距離は**塊の箱の縁から**測る(箱が大きいので、中心から測ると帯の縁を通って起こさずに抜けられる)。壁越しでは起きない。
 * ①②どちらか先に満たした方で起きる。
 */
export const crawlerSeesPlayer = (c: Pick<LabCrawler, 'x' | 'y'>, playerCx: number, playerCy: number, obstacles: readonly Rect[]): boolean => {
  const r = crawlerRect(c);
  const nx = Math.max(r.x, Math.min(r.x + r.width, playerCx)), ny = Math.max(r.y, Math.min(r.y + r.height, playerCy));
  const dx = playerCx - nx, dy = playerCy - ny;
  if (dx * dx + dy * dy > LAB_VISION_RANGE * LAB_VISION_RANGE) return false;
  return !segmentBlocked(playerCx, playerCy, nx, ny, obstacles as Rect[]);
};

/**
 * 出現位置: 原点からアイドルの方向へ `CRAWLER_START_DIST_PX`、箱の中心が廊下の中央(y=0)。
 * 壁・プロップは塊を止めない(肉が乗り越える)ので寄せない。
 * `goalX` はゴール資料のx(未指定=アイドルの点対称=資料の位置。labIdolSpotForDoc の逆)。
 */
export const createLabCrawler = (
  idol: { x: number; y: number },
  goalX: number = -idol.x,
): LabCrawler => {
  const dir = idol.x >= 0 ? 1 : -1;
  return {
    awake: false, goalX, hp: CRAWLER_HP, chasing: false,
    x: dir * CRAWLER_START_DIST_PX, y: CRAWLER_HIT_H / 2,
    vx: 0, vy: 0,
    facingLeft: dir > 0, // 原点(スタート)の方を向いて待つ
    state: 'move', stateAt: 0, hitAt: 0, slamX: 0, slamY: 0, slamMoving: false, chaseCatchUp: false,
    nextAttackAt: 0,
    absorbed: 0, absorbing: [],
    pressing: false,
  };
};

/** 叩きつけの的の候補(プレイヤー or 取り込める雑魚)。r=当たりの半径(円に触れたら当たり)。 */
export interface CrawlerTarget {
  id: string; isPlayer: boolean;
  cx: number; cy: number; r: number;
  /** 取り込みの絵のための寸法(雑魚のみ使う)。 */
  type?: string; footY?: number; w?: number; h?: number;
}

export interface CrawlerStepInput {
  gameTime: number;
  /** 秒。 */
  dt: number;
  player: Rect;
  /** 叩きつけの的の候補。**取り込めない敵(ボス級・名前付き等)は呼び出し側で外しておく**。プレイヤーも含める。 */
  targets: readonly CrawlerTarget[];
  /** 塊の周りの壁・プロップの矩形。 */
  obstacles: readonly Rect[];
  playable: PlayableAreaCtx;
  /**
   * プレイヤーの移動を塞ぐ壁のうち、`obstacles` 以外(噛みつき敵の足元の壁など)。塊がプレイヤーを押し出す時、
   * 押し先がこれらに重なるなら押さずに塊の方が止まる(プレイヤーを挟み込まない)。
   */
  playerBlockers?: readonly Rect[];
  /** 起きるのを待たせる(別のアテンションが出ている間など)。条件を満たしたまま次のステップで起きる。 */
  wakeBlocked?: boolean;
  /**
   * 追跡中の横の最高速度(px/秒)=プレイヤーの今の移動の速さ×CRAWLER_CHASE_SPEED_MULT(呼び出し側が掛けて渡す)。
   * `c.chasing` の時だけ使う。未指定なら突進の速さ。
   */
  chaseSpeed?: number;
}

export interface CrawlerStepResult {
  /** 次の状態。昇天し終えたら null。 */
  next: LabCrawler | null;
  /** このステップで叩きつけた円(当たる瞬間)。無ければ null。 */
  slam: { x: number; y: number; radius: number } | null;
  /** このステップで取り込んだ敵の id。 */
  absorbIds: string[];
  /** 這ってきた塊にプレイヤーが押される量(押し先が壁・帯の外なら塊の方が止まり、0)。 */
  playerPush: { dx: number; dy: number } | null;
  /** このステップで起きた(呼び出し側がアテンションを出す)。 */
  woke: boolean;
}

const inSlam = (sx: number, sy: number, t: Pick<CrawlerTarget, 'cx' | 'cy' | 'r'>): boolean =>
  Math.hypot(t.cx - sx, t.cy - sy) <= CRAWLER_SLAM_RADIUS + t.r;

/**
 * 1ステップ進める(純関数)。順序: ①状態遷移(溜め→叩きつけ→戻り→間/昇天)②移動(慣性・壁・帯・プレイヤー)。
 */
export const stepLabCrawler = (c: LabCrawler, inp: CrawlerStepInput): CrawlerStepResult => {
  const t = inp.gameTime;
  const dt = Math.max(0, inp.dt);
  let n: LabCrawler = { ...c, absorbing: c.absorbing.filter(a => t - a.at < CRAWLER_ABSORB_MS) };
  let slam: CrawlerStepResult['slam'] = null;
  const absorbIds: string[] = [];
  // ---- ⓪ 待機: 起きるまでは何もしない(動かない・攻撃しない)。壁としての当たりは呼び出し側(プレイヤーの移動)が持つ。 ----
  if (!n.awake) {
    const pcx0 = inp.player.x + inp.player.width / 2, pcy0 = inp.player.y + inp.player.height / 2;
    if (!inp.wakeBlocked && (crawlerShouldWake(pcx0, n.goalX) || crawlerSeesPlayer(n, pcx0, pcy0, inp.obstacles))) {
      return { next: { ...n, awake: true, stateAt: t, nextAttackAt: t }, slam: null, absorbIds, playerPush: null, woke: true };
    }
    return { next: { ...n, vx: 0, vy: 0 }, slam: null, absorbIds, playerPush: null, woke: false };
  }

  // ---- ① 状態遷移 ----
  if (n.state === 'ascend') {
    if (t - n.stateAt >= CRAWLER_ASCEND_MS) return { next: null, slam: null, absorbIds, playerPush: null, woke: false };
  } else if (n.state === 'vanish') {
    if (t - n.stateAt >= CRAWLER_VANISH_MS) return { next: null, slam: null, absorbIds, playerPush: null, woke: false };
  } else if (n.chasing && crawlerReachedGoal(n)) {
    // 資料の後の追跡がゴール手前まで来た: 床へ沈んで引いていく(溜めの最中なら叩きつけは出ない=赤い予告も消える)。
    n = { ...n, state: 'vanish', stateAt: t, slamMoving: false, pressing: false };
  } else if (n.state === 'windup') {
    if (t >= n.hitAt) {
      // 当たる瞬間: 最後に描いた円(=c.slamX/Y。雑魚狙い・待ち伏せは溜め開始で固定、プレイヤー狙いは溜めの前半だけ一緒に動いて後半は止まる)
      // の中の雑魚を取り込む(プレイヤーへの当たりは呼び出し側=被ダメージの経路)。
      slam = { x: n.slamX, y: n.slamY, radius: CRAWLER_SLAM_RADIUS };
      const absorbing = [...n.absorbing];
      for (const tg of inp.targets) {
        if (tg.isPlayer) continue;
        if (!inSlam(n.slamX, n.slamY, tg)) continue;
        absorbIds.push(tg.id);
        absorbing.push({ id: tg.id, type: tg.type ?? '', x: tg.cx, y: tg.footY ?? tg.cy, w: tg.w ?? tg.r * 2, h: tg.h ?? tg.r * 2, at: n.hitAt });
      }
      n = { ...n, state: 'recover', stateAt: n.hitAt, absorbed: n.absorbed + absorbIds.length, absorbing };
    }
  }
  if (n.state === 'recover' && t - n.stateAt >= CRAWLER_RECOVER_MS) {
    const end = n.stateAt + CRAWLER_RECOVER_MS;
    // 第2版: 取り込んだ数では昇天しない(社長「雑魚10体で昇天する仕様はやめる」)。昇天は HP0 だけ(applyCrawlerDamage)。
    n = { ...n, state: 'move', stateAt: end, nextAttackAt: end + CRAWLER_COOLDOWN_MS, slamMoving: false };
  }

  const pc = { x: inp.player.x + inp.player.width / 2, y: inp.player.y + inp.player.height / 2 };
  // 向き: 動いている間だけプレイヤーの方へ(攻撃中・昇天中は固定)。資料の後の追跡は振り返らない(ゴールの方を向いたまま・社長2026-10-19)。
  if (n.state === 'move' && !n.chasing) {
    const cc = crawlerCenter(n);
    if (pc.x < cc.x - CRAWLER_FACE_HYST_PX && !n.facingLeft) n = { ...n, facingLeft: true };
    else if (pc.x > cc.x + CRAWLER_FACE_HYST_PX && n.facingLeft) n = { ...n, facingLeft: false };
  }
  // 攻撃の開始: 手の届く範囲(前方の円)にプレイヤーか雑魚が入ったら。両方居れば近い方(=どちらでも溜めは同じ)。
  // 追跡中に狙ったのがプレイヤーなら、溜め・戻りの間も進み続ける(slamMoving・品質監査A1)。雑魚なら止まって食べる。
  if (n.state === 'move' && t >= n.nextAttackAt) {
    const s = crawlerSlamCenter(n);
    let nearest: CrawlerTarget | null = null;
    let nearestD = Infinity;
    for (const tg of inp.targets) {
      if (!inSlam(s.x, s.y, tg)) continue;
      const d = Math.hypot(tg.cx - s.x, tg.cy - s.y);
      if (d < nearestD) { nearestD = d; nearest = tg; }
    }
    if (nearest) {
      n = { ...n, state: 'windup', stateAt: t, hitAt: t + CRAWLER_WINDUP_MS, slamX: s.x, slamY: s.y, slamMoving: n.chasing && nearest.isPlayer };
    }
  }

  // ---- ② 移動(慣性) ----
  // 横: プレイヤーの方へ最高 18px/秒(近ければ突進)。追跡中は「プレイヤーの今の移動の速さ×1.1」だけ(突進は使わない)。
  // 縦: プレイヤーの高さ(帯の中)へ最高 70px/秒(差に比例して寄る)。軸ごとに慣性。
  // 攻撃中(溜め・戻り)は目標の速さ0=慣性で止まる(社長「敵を食べる時は攻撃するので結果的に一瞬止まる」)。
  // 回り込んだ直後の追いつき(品質監査A4): 基準距離まで来たら一度だけ解除。
  // 資料の後の追跡は一方向(社長「振り返って追いかけてはこない」): ゴールの方へだけ進む。プレイヤーが塊の後ろ(資料側)へ抜けても引き返さず、
  // 同じ速さで這い続ける。縦の寄り・追いつきはプレイヤーが前(ゴール側)に居る間だけ。
  const goalDir = crawlerGoalDir(n);
  const playerAhead = goalDir * (pc.x - crawlerCenter(n).x) > 0;
  if (n.chaseCatchUp && (!n.chasing || crawlerGapToPlayer(n, inp.player) <= CRAWLER_CHASE_CATCHUP_GAP_PX)) n = { ...n, chaseCatchUp: false };
  const baseChase = n.chasing ? Math.max(0, inp.chaseSpeed ?? CRAWLER_RUSH_SPEED) : 0;
  const chaseSpeed = n.chaseCatchUp && playerAhead ? Math.max(CRAWLER_RUSH_SPEED, baseChase * CRAWLER_CHASE_CATCHUP_MULT) : baseChase;
  // 進む状態: 動いている間+追跡中にプレイヤーを狙った叩きつけの溜め・戻り(品質監査A1)。
  const windupAdvancing = n.state === 'windup'
    && (t - n.stateAt) < CRAWLER_CHASE_SLAM_ADVANCE_FRAC * Math.max(1, n.hitAt - n.stateAt);
  const advancing = n.state === 'move' || (n.slamMoving && (windupAdvancing || n.state === 'recover'));
  let tvx = 0, tvy = 0;
  if (advancing) {
    const cc = crawlerCenter(n);
    if (n.chasing) {
      tvx = goalDir * chaseSpeed;
      if (playerAhead) tvy = Math.max(-CRAWLER_MAX_SPEED_Y, Math.min(CRAWLER_MAX_SPEED_Y, (pc.y - cc.y) * CRAWLER_Y_GAIN));
    } else {
      const dx = pc.x - cc.x;
      const sp = crawlerRushing(n, inp.player) ? CRAWLER_RUSH_SPEED : CRAWLER_MAX_SPEED;
      if (Math.abs(dx) > 1) tvx = Math.sign(dx) * sp;
      tvy = Math.max(-CRAWLER_MAX_SPEED_Y, Math.min(CRAWLER_MAX_SPEED_Y, (pc.y - cc.y) * CRAWLER_Y_GAIN));
    }
  }
  const rushNow = advancing && crawlerRushing(n, inp.player);
  const ky = dt > 0 ? 1 - Math.exp(-dt / CRAWLER_ACCEL_TAU_Y_S) : 0;
  const vxCap = Math.max(CRAWLER_RUSH_SPEED, chaseSpeed);
  // 横は加速度で寄せる(止まりからは徐々に速く・社長指示2026-10-20)。縦の寄り(プレイヤーの高さへ)は従来の指数のまま。
  const fastMode = n.chasing || rushNow || Math.abs(n.vx) > CRAWLER_MAX_SPEED + 1e-6;
  let vx = Math.max(-vxCap, Math.min(vxCap, fastMode
    ? approachCrawlerSpeed(n.vx, tvx, dt)
    : approachCrawlerSpeed(n.vx, tvx, dt, CRAWLER_SLOW_ACCEL_PX_S2, CRAWLER_SLOW_DECEL_PX_S2)));
  let vy = Math.max(-CRAWLER_MAX_SPEED_Y, Math.min(CRAWLER_MAX_SPEED_Y, n.vy + (tvy - n.vy) * ky));

  let playerPush: CrawlerStepResult['playerPush'] = null;
  let pressing = false;
  if (dt > 0 && (vx !== 0 || vy !== 0)) {
    const from = crawlerRect(n);
    // 壁・プロップでは止まらない(肉が乗り越える)。帯の中には収める。
    const r2 = clampRectToPlayableArea(from.x + vx * dt, from.y + vy * dt, CRAWLER_HIT_W, CRAWLER_HIT_H, inp.playable);
    let moved: Rect = { ...from, x: r2.x, y: r2.y };
    // 昇天中は判定が無い=プレイヤーとは関わらない。
    if (crawlerSolid(n) && rectsOverlap(moved, inp.player)) {
      // 這ってきた塊がプレイヤーに重なった: プレイヤーを押し出す。押し先が壁・帯の外なら塊の方を止める。
      const pushed = resolveAabb(inp.player, [moved]);
      const pRect: Rect = { ...inp.player, x: pushed.x, y: pushed.y };
      const pOk = isRectInPlayableArea(pRect.x, pRect.y, pRect.width, pRect.height, inp.playable)
        && !inp.obstacles.some(o => rectsOverlap(pRect, o))
        && !(inp.playerBlockers ?? []).some(o => rectsOverlap(pRect, o));
      if (pOk) {
        playerPush = { dx: pushed.x - inp.player.x, dy: pushed.y - inp.player.y };
      } else {
        // 塊を止める: プレイヤーの箱から押し戻す。押し戻した先が壁・帯の外なら、動く前の位置に留まる。
        const back = resolveAabb(moved, [inp.player]);
        const backRect: Rect = { ...moved, x: back.x, y: back.y };
        const backOk = isRectInPlayableArea(back.x, back.y, CRAWLER_HIT_W, CRAWLER_HIT_H, inp.playable);
        moved = backOk ? backRect : from;
        pressing = n.state === 'move';
      }
    }
    const nx = moved.x + CRAWLER_HIT_W / 2, ny = moved.y + CRAWLER_HIT_H;
    // 実際に進んだ分を速度にする(壁やプレイヤーに当たって止まった勢いを貯め込まない)。
    vx = (nx - n.x) / dt; vy = (ny - n.y) / dt;
    n = { ...n, x: nx, y: ny };
  }
  // 進みながら溜めている叩きつけの円は塊と一緒に動かす(描かれる円=次のフレームに当たる円=手の位置)。
  if (n.slamMoving && n.state === 'windup' && windupAdvancing) {
    const s = crawlerSlamCenter(n);
    n = { ...n, slamX: s.x, slamY: s.y };
  }
  n = { ...n, vx, vy, pressing };
  return { next: n, slam, absorbIds, playerPush, woke: false };
};

// ---- 見え方(絵だけ・判定なし) ------------------------------------------------------------------
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut3 = (v: number): number => 1 - (1 - clamp01(v)) ** 3;
const easeIn2 = (v: number): number => clamp01(v) ** 2;

/**
 * 溜めの各コマの尺(ms・コマ0〜6)。振り上げの頂点ほど長く溜める(クリエイティブ監査2026-10-19)。合計=CRAWLER_WINDUP_MS。
 * 実際の溜めの長さ(hitAt−stateAt)が違っても、この比で割り付ける=手が着くコマ(7)の頭=当たる時刻は動かない。
 */
export const CRAWLER_WINDUP_FRAME_MS = [57, 57, 70, 82, 95, 114, 145] as const; // 合計620(旧980の比のまま縮めた)
/** 戻り: 手が着いたコマ7をこの尺だけ止めてから、残り8コマを早送り(合計=CRAWLER_RECOVER_MS)。 */
export const CRAWLER_IMPACT_HOLD_MS = 130;

/** 溜め・戻りの攻撃コマ(0〜15)。溜め=コマ0〜6(頂点ほど長い)、戻り=コマ7(着地で止める)〜15。手が着くコマ7の頭=当たる時刻。 */
export const crawlerAttackFrame = (c: Pick<LabCrawler, 'state' | 'stateAt' | 'hitAt'>, gameTime: number): number | null => {
  if (c.state === 'windup') {
    const total = CRAWLER_WINDUP_FRAME_MS.reduce((a, b) => a + b, 0);
    const el = clamp01((gameTime - c.stateAt) / Math.max(1, c.hitAt - c.stateAt)) * total;
    let acc = 0;
    for (let i = 0; i < CRAWLER_WINDUP_FRAME_MS.length; i++) {
      acc += CRAWLER_WINDUP_FRAME_MS[i];
      if (el < acc) return i;
    }
    return CRAWLER_ATTACK_IMPACT_FRAME - 1;
  }
  if (c.state === 'recover') {
    const el = Math.max(0, gameTime - c.stateAt);
    if (el < CRAWLER_IMPACT_HOLD_MS) return CRAWLER_ATTACK_IMPACT_FRAME;
    const rest = CRAWLER_ATTACK_FRAMES - CRAWLER_ATTACK_IMPACT_FRAME - 1; // コマ8〜15
    const u = clamp01((el - CRAWLER_IMPACT_HOLD_MS) / (CRAWLER_RECOVER_MS - CRAWLER_IMPACT_HOLD_MS));
    return CRAWLER_ATTACK_IMPACT_FRAME + 1 + Math.min(rest - 1, Math.floor(u * rest));
  }
  return null;
};

/** 手が着くコマ(7)の前のめり(クリエイティブ監査2巡目#1・描画だけ): 当たる直前に加速して前へ出て、着地の止まりの間は出たまま、戻りでゆっくり戻る。 */
export const CRAWLER_SLAM_LUNGE_IN_MS = 110;
export const CRAWLER_SLAM_LUNGE_OUT_MS = 340;
/** 前のめりの量(0〜1)。動きながらの叩きつけ(slamMoving)だけ。前の縁の向きへ描画側が px を掛ける。 */
export const crawlerSlamLunge = (c: Pick<LabCrawler, 'state' | 'stateAt' | 'hitAt' | 'slamMoving'>, gameTime: number): number => {
  if (!c.slamMoving) return 0;
  if (c.state === 'windup') {
    const left = c.hitAt - gameTime;
    return left < CRAWLER_SLAM_LUNGE_IN_MS ? easeIn2(1 - left / CRAWLER_SLAM_LUNGE_IN_MS) : 0;
  }
  if (c.state === 'recover') {
    const el = gameTime - c.stateAt;
    if (el < CRAWLER_IMPACT_HOLD_MS) return 1;
    const u = clamp01((el - CRAWLER_IMPACT_HOLD_MS) / CRAWLER_SLAM_LUNGE_OUT_MS);
    return 1 - u * u * (3 - 2 * u);
  }
  return 0;
};

/** 赤い予告の進行(0→1)。溜め開始=0(出る)、当たる時刻=1(消え切る)。溜め以外は null(出さない)。 */
export const crawlerTelegraphProg = (c: Pick<LabCrawler, 'state' | 'stateAt' | 'hitAt'>, gameTime: number): number | null => {
  if (c.state !== 'windup') return null;
  if (gameTime >= c.hitAt) return null;
  return clamp01((gameTime - c.stateAt) / Math.max(1, c.hitAt - c.stateAt));
};

/**
 * 昇天の見え方(経過ms→)。浮かせない(社長決定2026-10-19): 光の柱が差し(beam)、体が崩れて床へ沈み(sink=0→1)、
 * 縁が光り(flare)、最後に消える(alpha)。どれも加減速つき(慣性)。取り込んだ数の光は crawlerAscendSoul。
 */
export const crawlerAscendLook = (sinceMs: number): { alpha: number; beam: number; flare: number; sink: number } => {
  const T = CRAWLER_ASCEND_MS;
  const beamIn = easeOut3(sinceMs / 700);
  const beamOut = 1 - easeIn2((sinceMs - T * 0.8) / (T * 0.2));
  const flare = easeOut3((sinceMs - 200) / 700) * (1 - easeIn2((sinceMs - T * 0.55) / (T * 0.3)));
  return {
    alpha: 1 - easeIn2((sinceMs - T * 0.6) / (T * 0.35)),
    beam: beamIn * beamOut,
    flare,
    // 崩れ方: 最初は踏みとどまり、だんだん速く床へ沈む(ease-in)。
    sink: easeIn2((sinceMs - 250) / (T * 0.7)),
  };
};

/** 沈んで引いていく前の「手で床を一度掻く」止まり(ms・クリエイティブ監査2巡目#14)。この間は沈まず引かず、攻撃コマ1〜2を見せる。 */
export const CRAWLER_VANISH_HOLD_MS = 260;
/**
 * 沈んで引いていく見え方(経過ms→・資料の後の追跡の終わり)。倒した時(昇天)とは変える=光は昇らない・縁も光らない。
 * ①頭の止まり(手で床を一度掻く・scratchFrame=攻撃コマ)→ ②後ろへ引く(slide・加速→減速)と床へ沈む(sink・引きより少し遅れて始まる)
 * → 暗く沈んで(dark)最後に消える(alpha)。曲線は互いにずらす(同じ smoothstep を重ねない)。
 */
export const crawlerVanishLook = (sinceMs: number): { sink: number; slide: number; dark: number; alpha: number; scratchFrame: number | null } => {
  const hold = CRAWLER_VANISH_HOLD_MS;
  const scratchFrame = sinceMs < hold ? (sinceMs < hold * 0.5 ? 1 : 2) : null;
  const u = clamp01((sinceMs - hold) / (CRAWLER_VANISH_MS - hold));
  const sl = clamp01(u / 0.8);
  const sk = clamp01((u - 0.12) / 0.88);
  return {
    sink: sk * sk * (3 - 2 * sk) * (0.85 + 0.15 * sk),
    slide: sl * sl * (3 - 2 * sl),
    dark: easeOut3(u / 0.55) * 0.5,
    alpha: 1 - easeIn2((u - 0.62) / 0.38),
    scratchFrame,
  };
};

/** 取り込んだ数の光: 最初の光が昇り始める時刻・次の光までの間・1つが昇り切るまで(ms)。 */
export const CRAWLER_SOUL_START_MS = 450;
export const CRAWLER_SOUL_GAP_MS = 140;
export const CRAWLER_SOUL_RISE_MS = 1050;
/** 昇る高さ(px)。 */
export const CRAWLER_SOUL_RISE_PX = 170;
/**
 * 取り込んだ i 番目の光(0始まり)の見え方。まだ/もう見えない時は null。少しずつ時間差で1つずつ昇る。
 * ふわっと灯り、加速しながら昇り(慣性)、上で薄れて消える。
 */
export const crawlerAscendSoul = (i: number, sinceMs: number): { rise: number; alpha: number; scale: number } | null => {
  const u = (sinceMs - CRAWLER_SOUL_START_MS - i * CRAWLER_SOUL_GAP_MS) / CRAWLER_SOUL_RISE_MS;
  if (u < 0 || u >= 1) return null;
  return {
    rise: CRAWLER_SOUL_RISE_PX * u ** 1.7,
    alpha: easeOut3(u / 0.18) * (1 - easeIn2((u - 0.55) / 0.45)),
    scale: 1 - 0.35 * u,
  };
};

/**
 * 取り込まれる敵の見え方(経過ms→)。①当たった瞬間に手の下で潰れる(縦に沈む・塊の方へ倒れる)
 * ②戻りの手に合わせて塊へ引きずり込まれる(k=0→1・加減速つき)③縮まずに塊の縁の下へ沈んで隠れる(sink=0→1)。
 */
export const crawlerAbsorbLook = (sinceMs: number): { k: number; squashY: number; tilt: number; sink: number; alpha: number } => {
  const crush = easeOut3(sinceMs / CRAWLER_ABSORB_CRUSH_MS);
  const u = clamp01((sinceMs - CRAWLER_ABSORB_CRUSH_MS) / (CRAWLER_ABSORB_MS - CRAWLER_ABSORB_CRUSH_MS));
  const k = u * u * (3 - 2 * u); // 引きずりの出だしは重く、途中で速く、縁で緩む
  return {
    k,
    squashY: 1 - 0.38 * crush,   // 叩き潰された(縦に沈む)
    tilt: 0.55 * crush,          // 塊の方へ倒れる(呼び出し側が向きを掛ける)
    sink: easeIn2((u - 0.35) / 0.65), // 引きずられながら縁の下へ沈む
    alpha: 1 - easeIn2((u - 0.92) / 0.08),
  };
};
