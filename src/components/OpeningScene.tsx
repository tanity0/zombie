import React, { useEffect, useRef, useState } from 'react';
import { OPENING_REVIVAL_LINES, OPENING_REVIVAL_TIMING } from '../data/openingRevivalSequence';
import { rewindBgm } from '../audio/audioManager';
// パン!SEはWebAudio(playSfx)ではなくHTMLAudioで鳴らす(v0.25.2050):
// 実機でアリーナ音源(HTMLAudio)は鳴るのにplaySfx経路のパン!だけ無音だったため、
// 確実に鳴る同じ仕組みに統一(コンテキスト解錠・バッファ非同期の罠を回避)。

// オープニングシーン(社長支給): 引きのアリーナ→中央ステージの3人にカメラが寄りつつ
// 正面→斜め→真横とアングルを切替(回り込み)→暗転→【射撃シーン(backstage)】→暗転で終了。
// 素材は public/opening/(アングル3枚+キャラ3枚)と public/opening/shoot/(射撃シーンのコマ)。
// アングル間は【シームレスなクロスフェード】(社長指示v0.25.2007: フェードイン/アウトが重なる切替。
// 前アングルはズームを続けたまま表示し続け、次アングルがその上にフェードイン→完了で前を外す=ディゾルブ)。
// アリーナ中はBGM2音源(op-arena-a/b)を同時ループ再生し、射撃シーンへの場面転換で止める(終端は短フェード)。
// 3人(色あり=センター/両サイド=シルエット)は各アングルのステージ位置に合わせて配置(前向きビルボード)。
// 縦画面では横長素材をレターボックス(横幅フィット)で全体を見せる。
//
// 射撃シーン(社長指示v0.25.2006): 暗転し切った後、場面転換=backstage(関係者出口)。
// 撃つ子(ツインテのシルエット・左右反転済=銃は左向き)が右、主人公が左。
// コマ順は社長指定: 撃つ子=1-3-4-5-2-6 / 主人公(被弾)=1-2-3-4-5。発砲(4)と被弾(2)を同期。
// コマ画像は足元中心アンカーで共通キャンバスに焼いてあるので、src差し替えだけで芝居になる。
//
// 蘇生処置パート(OP最終ピース・OPENING_REVIVAL_SPEC.md): 射撃シーンが暗転し切った後、黒画面のまま
// 心拍ループ(低音量HTMLAudio)+字幕会話(OPENING_REVIVAL_LINESを1行ずつ・話者名は絶対に出さない)を流し、
// 最終行の後に一度だけの心拍→短フェードで finish()。台本尺は少数のsetTimeoutで刻む(毎フレーム更新なし)。
// 音はWebAudio(playSfx)を使わず既存のHTMLAudio流儀(audioRef/panRef/stopAudio)に合わせる=実機でWebAudioだけ
// 無音になる罠を回避(冒頭のパン!SEと同じ理由)。スキップ/破棄時は stopAudio+ids一括clearで残存させない。
//
// 【重要】ズームは CSS keyframe(コンポジタ駆動)。rAF毎フレームsetStateは残像不具合+React再描画禁止で不可。
// フェーズ/コマ進行は少数のsetTimeoutのみ(毎フレーム更新なし)。

const BASE = import.meta.env.BASE_URL;
const A = (f: string) => `${BASE}opening/${f}`;
// hero-blue: v0.25.2100で色ありドット絵素材に同名差し替え→旧素材のキャッシュ対策で一回きりのバスター付き
// (再差し替え時はこの値を上げる。全openingアセットに毎版バスターを付けると版ごとに全再取得になるため個別対応)。
const HERO = A('hero-blue.png?v=2101'), TWIN = A('sil-twin.png'), BOB = A('sil-bob.png');
const SHOOTER = (n: number) => A(`shoot/shooter-${n}.png`);
// victim: v0.25.2102でドット絵5コマ(社長支給シート232×264等分)に同名差し替え→一回きりのバスター付き。
const VICTIM = (n: number) => A(`shoot/victim-${n}.png?v=2102`);
const BLOOD = (n: number) => A(`shoot/blood-${n}.png`);
// ── 楽屋通路の歩きシーン(アリーナ前・社長指示v0.25.2114) ──
// 左端からキャラがフェードインし、右へ歩く(プレイヤー操作=画面を押している間だけ歩く)。横スクロールのみ。
// 右端に到達するとアリーナ(既存のOPタイムライン)が始まる=以降のタイマーは全て「歩き完了」起点。
const WALK_BG = A('walk-stage-bg.png');
const WALK_FRAMES = Array.from({ length: 4 }, (_, n) => A(`walk/hero-walk-${n}.png`)); // 4コマ歩きサイクル(社長支給・抜き済みシートを帯分割・v0.25.2115で正素材へ差し替え)
const WALK_BG_AR = 1891 / 831;  // 舞台素材のアスペクト(幅/高さ)
const WALK_SPEED = 120;         // 歩行速度(bg表示px/s)。v0.25.2116「もっとゆっくり」(旧200)
const WALK_ANIM_MS = 150;       // 歩きコマ間隔(4コマ=1周0.6s・叩き台)
const WALK_FOOT_YR = 0.79;      // 足元ライン(bg高さ比)。v0.25.2117「ステージのかなり下+プレイ中と同じ画面位置」=床帯の最前縁(画面中心比≒57%)
const WALK_HERO_HR = 0.16;      // キャラ表示高(bg高さ比。スタッフ~0.13より少し大きめ=主役・叩き台)
const WALK_CAM_ANCHOR = 0.40;   // スクロール開始後、キャラを画面幅のこの位置に保つ
const WALK_EDGE_PAD = 50;       // 左右端の余白(bg表示px)
const WALK_FADEIN_MS = 1000;    // 開始時のキャラのフェードイン
const WALK_STAGE_Y_OFFSET = -100; // ステージ全体の縦オフセット(px)。v0.25.2116「50px上へ」→v0.25.2117「もう50px上へ」
// 被写界深度(v0.25.2116「プレイヤーの直ぐ裏からぼかし」): 事前ブラー版bg(walk-stage-bg-blur.png・
// blur9px焼き込み)を縦グラデマスクで重ねる=壁(奥)はボケ、彼女と歩いている床だけシャープ。
// アリーナDOFと同じ「ランタイムぼかしゼロ」方式(モバイルのfilter/backdrop-filterの罠を回避)。
const WALK_BG_BLUR = A('walk-stage-bg-blur.png');
const WALK_DOF_MASK = 'linear-gradient(to bottom, black 0%, black 60%, transparent 74%)'; // 74%≒足元ライン(0.79)の少し上でシャープへ
const ARENA_AR = 1.5; // 素材の縦横比(3:2・backstageも同じ)

interface CharPos { src: string; x: number; y: number; h: number } // x=中心/y=足元(画像%)、h=高さ(%)
// flipScene: シーン全体を180度(左右)反転して見せる(社長指示v0.25.2009)。実装は背景imgを左右反転し、
// キャラは素の座標/向きで置く(=画面全体としてミラーに見える。二重反転になる個別キャラflipは廃止)。
interface Shot { bg: string; bgBlur: string; ox: number; oy: number; zf: number; zt: number; flipScene?: boolean; chars: CharPos[] }

// ── アリーナ3アングルのタイムライン(ms) ──
// 斜め・横への切替は早め(社長指示v0.25.2008)。各ショットのズームは切替までに完了させ、
// 「寄り切ったサイズ≒次アングルの見え方」の繋がり(v0.25.2003)は維持したままテンポを上げる。
// v0.25.2035(社長指示): 冒頭は引きのまま紙吹雪の噴き上げを見せ(1.2s)、それからズーム開始。
// v0.25.2049(社長指示「パン!1秒置いて」): 冒頭1秒は静かな引き→パン!(1.0s)→歓声(1.4s)→ズーム(2.2s)。
const FRONT_ZOOM_DELAY = 2200;
// 斜めは1秒表示(社長指示v0.25.2047・旧1.4秒)。
const CUTS = [0, 2200 + 2000, 2200 + 3000];
const SHOT_DUR = [2000, 1000, 2400];
// アングル切替は【即表示のハードカット】(社長指示v0.25.2072・旧クロスフェードv0.25.2007は廃止)。
const BLACK_START = 7600;
const BLACK_MS = 1600;
const SCENE_START = 9400; // 暗転し切ったら射撃シーンへハードカット
const ARENA_AUDIO = [`${BASE}audio/op-arena-a.mp3`, `${BASE}audio/op-arena-b.mp3`]; // 2音源を同時ループ(社長指示)
const PAN_SE_SRC = `${BASE}audio/sfx/handgun-fire.wav`; // パン!(紙吹雪と発砲で同音・社長指示)
const PAN_SE_VOLUME = 0.64; // ゲーム内SE設定(audioManagerのhandgun-fire volume)に合わせる
// 蘇生パートの心拍(処置機器音の素材は無いので心拍のみ・spec)。会話中はループ・最終行後に一発だけ。
const HEARTBEAT_SRC = `${BASE}audio/sfx/heartbeat.mp3`;
const HEARTBEAT_LOOP_VOLUME = 0.5;    // 会話中の心拍ループ=低音量(spec「0.5前後」)
const HEARTBEAT_ONESHOT_VOLUME = 0.6; // 最終行後の一発は句読点として少しだけ前に
// 蘇生が黒に沈み切った後のタイトルフェードイン長(社長指示v0.25.2061)。背景を透過し黒幕を
// フェードアウトして、下に居るタイトル画面を透かして見せる。明け切ったら finish でOPを外す。
const TITLE_REVEAL_MS = 1500;

// 紙吹雪(社長指示v0.25.2031→2033→2034修正)。2系統:
// ①パーン=ステージ【両サイド】の砲から真上へ噴射し【画面場外まで突き抜けて消える】(落下はしない)。
// ②雨=その後(1.0s〜)、画面全体に均等な紙吹雪が降り続けるループ層(斜め・横でもきらめきながら継続。
//   負のanimation-delayで表示された瞬間から空中に満ちている)。CSSアニメのみ=負荷1/10。
// 赤一色(社長指示v0.25.2037)。単色ベタだと沈むので赤の明暗4トーン=「全部赤」の見え方できらめきは残す。
const CONFETTI_COLORS = ['#f87171', '#ef4444', '#dc2626', '#b91c1c'];
// v0.25.2036「もっと勢いよく」→2039再調整: 粒の大型化で塊のまま一瞬で消えて見えたため、
// 粒ごとの速度差を大きく(0.7〜1.4秒)して柱を縦に伸ばし(ジェットの尾)、横散らばりも広げて塊をほどく。
const CONFETTI_BURST = Array.from({ length: 150 }, (_, i) => {
  const leftSide = i % 2 === 0;                  // 半分ずつ左右の砲から
  const inward = (3 + Math.random() * 7) * (leftSide ? 1 : -1); // わずか内向き(ステージ中央へ)
  return {
    key: i,
    x: leftSide ? 14 + Math.random() * 16 : 70 + Math.random() * 16, // 両サイドの砲口(画面幅%)
    y: 99 + Math.random() * 5,                   // 【画面(スクリーン)の下端】から発射(v0.25.2040→2042全画面化)
    cx1: inward * 0.8 + (Math.random() * 2 - 1) * 8, // 中間点(横散らばり広め=塊をほどく)
    cy1: -(50 + Math.random() * 25),             // 縦はvh(画面高)基準
    cx2: inward * 1.6 + (Math.random() * 2 - 1) * 12, // 終点=そのまま上へ
    cy2: -(110 + Math.random() * 30),            // 画面上端の外まで突き抜ける(vh)
    dur: 0.7 + Math.random() * 0.7,              // 速度差大(0.7〜1.4秒)=柱が縦に伸びるジェット
    delay: 1.0 + Math.random() * 0.25,          // パン!は開始1秒後(社長指示v0.25.2049)
    sd: 0.35 + Math.random() * 0.35,             // 飛翔中の回転(高速)
    sw: (Math.random() * 2 - 1) * 8,
    r1: `${Math.round((Math.random() * 2 - 1) * 200)}deg`,
    w: 7 + Math.random() * 6, h: 4 + Math.random() * 5, // 大きめは維持しつつ最大をやや絞る
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  };
});
const CONFETTI_RAIN_START_MS = 2000; // 噴き上げ(1.0s発)が場外へ抜けた頃から雨を開始
// 雨はスクリーン全体(上端→下端・レターボックス帯の外も)に降らせる(社長指示v0.25.2042)。
// 縦はvh基準(全画面)。密度維持のため180枚。
const CONFETTI_GLITTER = Array.from({ length: 180 }, (_, i) => {
  const dur = 6 + Math.random() * 4;             // 画面上端外→下端外を通過する時間(全画面ぶん)
  return {
    key: i,
    x: Math.random() * 100,                       // 画面全体に均等分布
    dur,
    delay: -Math.random() * dur,                  // 負のdelay=表示された瞬間すでに空中に満ちている
    td: 0.4 + Math.random() * 0.5,                // きらめき周期(秒)
    r1: `${Math.round((Math.random() * 2 - 1) * 240)}deg`,
    w: 5 + Math.random() * 5, h: 4 + Math.random() * 4, // 粒大きめ(社長指示v0.25.2038)
    color: CONFETTI_COLORS[(i * 3 + 1) % CONFETTI_COLORS.length],
  };
});

// ── コンサート演出(社長採用=案A+B・v0.25.2054): 客席のペンライト光点+会場グローパルス ──
// ペンライトは各アングルの【客席領域(枠%)】に配置し、アングルのaspect枠内に描く=ズーム/切替に追従して
// 世界に馴染む(紙吹雪のような画面固定ではない)。1本=縦長の光バー(box-shadowグロー付き)を
// 足元起点でゆらゆら回転(観客が振っている)。下(手前)ほど大きく=遠近。CSSアニメのみ・OP中だけ。
const PENLIGHT_COLORS = ['#c084fc', '#f472b6', '#60a5fa', '#e9d5ff', '#f9a8d4', '#93c5fd'];
// 客席領域(枠%・複数矩形可): 正面=ステージ下の全面 / 斜め=下端の帯 / 真横=客席フロアのみ
// (社長指摘v0.25.2060: 全幅だとステージにも生えていた。表示は左右反転でステージ=画面左〜中央、
//  花道=右上に伸びるため、右下の客席フロア+ステージ手前の細帯に限定)。
const PENLIGHT_REGIONS: { top: number; bottom: number; left?: number; right?: number; count: number }[][] = [
  [{ top: 56, bottom: 98, count: 110 }],
  [{ top: 80, bottom: 99, count: 50 }],
  [
    { top: 88, bottom: 99, left: 60, right: 100, count: 40 },  // 花道より右下の客席フロア
    { top: 96, bottom: 99.5, left: 0, right: 58, count: 20 },  // ステージ手前の最前列帯
  ],
];
const PENLIGHTS = PENLIGHT_REGIONS.map(regions =>
  regions.flatMap((r, ri) =>
  Array.from({ length: r.count }, (_, i) => {
    const yr = Math.random();                       // 0=奥(上)〜1=手前(下)
    return {
      key: ri * 1000 + i,
      x: (r.left ?? 0) + Math.random() * ((r.right ?? 100) - (r.left ?? 0)),
      y: r.top + yr * (r.bottom - r.top),
      h: (5 + Math.random() * 3) * (0.6 + yr * 0.8), // 手前ほど大きく(遠近)
      w: 2 + yr * 1.2,
      pa: `${(14 + Math.random() * 16).toFixed(1)}deg`, // 振り角(v0.25.2057で約2倍→社長指示v0.25.2103「もっと激しく」でさらに1.5倍=14〜30°)
      sd: 0.45 + Math.random() * 0.55,                 // 振り周期(秒)。v0.25.2103で高速化(旧0.7〜1.5)=激しさの第2軸
      delay: -Math.random() * 1.5,                    // 負のdelay=最初からバラバラに揺れている
      color: PENLIGHT_COLORS[(i * 5 + 1) % PENLIGHT_COLORS.length],
      op: 0.7 + Math.random() * 0.3,                  // 発光強化に合わせ下限も持ち上げ(v0.25.2057)
    };
  })
  )
);
// 会場グローパルス(案B): 客席一帯に大きな柔らかい光を2枚重ね、ゆっくり明滅(mix-blend-mode:screenで持ち上げる)。
const VENUE_GLOWS = [
  { x: 30, y: 78, rx: 55, ry: 30, color: 'rgba(168,85,247,0.16)', dur: 3.2, delay: 0 },
  { x: 72, y: 80, rx: 55, ry: 28, color: 'rgba(244,114,182,0.13)', dur: 3.8, delay: -1.6 },
];

// ── スポットライト(社長指示v0.25.2057): 各アングルの3人それぞれへ頭上から光錐を落とす ──
// 幾何は SHOTS[si].chars(足元座標とキャラ高さ)から導出=ズーム/アングル切替に自動追従。
// 台形の光錐(mix-blend:screen)+足元の光溜まり。ゆっくり明滅(opspot)。CSSのみ・OP中だけ。
// ※SHOTSより後で定義できないため、導出は下のSHOTS定義の直後で行う(SPOTLIGHTS)。

// ── 被写界深度(社長指示v0.25.2057→方式変更v0.25.2060): ステージ焦点のチルトシフト風 ──
// 旧方式=backdrop-filter(3.5px)は実機で「切替時に前アングルが一瞬残る」残像が解消しきれず
// (モバイルのbackdrop-filterは変形アニメ中の下層を古いスナップショットで返す既知の癖)、
// 毎フレーム全画面再合成の負荷で紙吹雪パーンが飛ぶコマ落ちも疑われたため、【事前ブラー画像】へ変更:
// ブラー済みbg(art-src/opening/blur-arena.mjsでChromium生成・素材基準10px)を鮮明bgの直上に
// radial-gradientマスク(焦点=透明穴・周辺=表示)で重ねる。ランタイムぼかしゼロ=残像は構造的に不可能・
// クロスフェードにもそのまま乗る。ズームするとぼけも拡大(寄るほど浅い被写界深度)=映画的挙動。
// ペンライト等のエフェクトはブラーの上に描くため周辺でもシャープ(ボケ玉化は将来必要なら複製レイヤーで)。
const DOF_FOCUS = [
  { x: 50, y: 47, rx: 46, ry: 34 },   // 正面: 中央ステージ
  { x: 50, y: 63, rx: 48, ry: 34 },   // 斜め: 壇上の3人
  { x: 50, y: 85, rx: 50, ry: 36 },   // 真横: 手前ステージ面
];
const dofMask = (si: number) =>
  `radial-gradient(ellipse ${DOF_FOCUS[si].rx}% ${DOF_FOCUS[si].ry}% at ${DOF_FOCUS[si].x}% ${DOF_FOCUS[si].y}%, rgba(0,0,0,0) 52%, #000 100%)`;

// ── 射撃シーンのタイムライン(シーン内ms)と配置 ──
// 2人は独立テンポで進むため【トラックを別々に定義し、変化点のマージは自動生成】する。
// (v0.25.2016の教訓: 手動マージは片方の時刻を動かすと順序が壊れ、もう片方のコマが巻き戻る実バグになった)
// 順序(社長指示v0.25.2019): 発砲一閃(f4・通常背景のまま0.1s)→跳ね上げ(f5)の瞬間に【赤反転+被弾(v2)】→
// そこから2秒静止(社長指示v0.25.2017)→各自のテンポで再開。
// 撃つ側(v0.25.2010→2018→2067→2075): 立ち5秒(会話ビート1→2・各2.5秒)→構え2.5秒(ビート3)→一閃0.1→
// 跳ね上げで静止→次0.2→最後(硝煙)は保持。各ビート2.5秒(11文字≒字幕標準4〜5文字/秒)=発砲7.5s。
// 撃たれ側(v0.25.2011→2012→2014→2016): 被弾=赤反転と同期→(静止)→次0.2→次0.2→最後(倒れ伏す)は保持。
// 静止明け: f2(0.2s)→f6硝煙→1秒後にf2へ戻して以降停止(社長指示v0.25.2028)。
const SHOOTER_TRACK = [{ t: 0, f: 1 }, { t: 5000, f: 3 }, { t: 7500, f: 4 }, { t: 7600, f: 5 }, { t: 9600, f: 2 }, { t: 9800, f: 6 }, { t: 10800, f: 2 }];
// 倒れ込み(v3/v4)は各200ms(社長指示v0.25.2071・旧400ms)。
const VICTIM_TRACK = [{ t: 0, f: 1 }, { t: 7600, f: 2 }, { t: 9600, f: 3 }, { t: 9800, f: 4 }, { t: 10000, f: 5 }];
// 血飛沫(社長支給): 赤背景の瞬間(7.6s)に1コマ目を出し、キャラと同じく【2秒静止】(社長指示v0.25.2027)。
// 静止明け(9.6s)から残り2コマを100msずつ→消える(f:0=非表示)。
const BLOOD_TRACK = [{ t: 0, f: 0 }, { t: 7600, f: 1 }, { t: 9600, f: 2 }, { t: 9700, f: 3 }, { t: 9800, f: 0 }];
const RED_FROM = 7600; // 跳ね上げの瞬間から背景を赤一色に(v0.25.2019で一閃の後ろへ移動。以降ずっと赤のまま暗転へ)
const frameAt = (track: { t: number; f: number }[], t: number) => track.reduce((f, e) => (e.t <= t ? e.f : f), track[0].f);
const SHOOT_STEPS = [...new Set([...SHOOTER_TRACK, ...VICTIM_TRACK, ...BLOOD_TRACK].map(e => e.t))]
  .sort((a, b) => a - b)
  .map(t => ({ t, s: frameAt(SHOOTER_TRACK, t), v: frameAt(VICTIM_TRACK, t), b: frameAt(BLOOD_TRACK, t), red: t >= RED_FROM }));
// 血飛沫の位置: 右端センター=傷口(後頭部)。被弾ポーズ(v2)の頭の左脇に置き、血は左へ飛ぶ。h=枠高%。
const BLOOD_POS = { x: 36.5, y: 57, h: 18 };
// 射撃シーンの会話(社長指示v0.25.2065): 立ち姿=1行目→構え(1.0s)=2行目→撃つ(2.0s)で消す。
// 表示は本編の会話UI(NpcDialogue=左上のモデル付き吹き出し)と同じ見た目をOP内で再現(UI統一・新規UIは作らない)。
// 話者は撃つ子(ツインテのシルエット)。名前は明かさない=「？？？」・立ち絵はシーンと同じ白シルエット(叩き台)。
// 文言は社長指定どおり(v0.25.2068→2075「どいつもこいつも・・・で一旦区切って」=3ビートに分割)。
// 立ち姿=ビート1→2(各2.5秒)、構え=ビート3(2.5秒)、発砲=7.5s。\n は white-space: pre-line で改行になる。
const SHOOT_LINES = ['どいつもこいつも・・・', 'アンタばっかり！', 'アンタさえいなければ・・・'];
const SHOOT_FADE_START = 11700; // 最終コマを約1.3秒見せてから暗転(会話3ビート化で+2.5秒シフト・v0.25.2075)
const SHOOT_FADE_MS = 1200;
const SHOOT_TOTAL = 13100;
// 旧素材はv5だけ体重心が右に出ていたため-4%補正していた(v0.25.2014)。新ドット絵素材(v0.25.2102)は
// 5コマ全部でポーズ中心が揃っている(実測0.489〜0.498)ため補正の前提が消えた=撤去(機構は残す)。
const VICTIM_DX: Record<number, number> = {};
// 配置(backstage画像基準%・足元アンカー)。主人公=左、撃つ子=右(反転済=銃が左向き)。h=コマキャンバス高さ。
const VICTIM_POS = { x: 38, y: 80, h: 26 };
const SHOOTER_POS = { x: 66, y: 86, h: 30 };

// 各アングルのステージ上の3人配置(実機調整済)。x=中心,y=足元(アリーナ画像基準%)、h=高さ(%)。
const SHOTS: Shot[] = [
  // 正面(引き): アリーナ全体。3人は中央ステージ上=遠く小さい点→大きくズームイン。センター配置。
  // 【共通アンカー(社長指示v0.25.2022)】ズームの着地点=ヒーロー足元が(枠x50%, y86%)に来るよう原点を設定。
  // 以降の斜め/横も同じ(50%,86%)にヒーローを固定=「彼女だけ動かず周りが回る」。
  { bg: A('arena.jpg'), bgBlur: A('arena-blur.jpg'), ox: 50, oy: 35.2, zf: 1.0, zt: 3.6, chars: [
    { src: TWIN, x: 48.7, y: 49.2, h: 1.8 }, { src: HERO, x: 50, y: 49.3, h: 2.0 }, { src: BOB, x: 51.3, y: 49.2, h: 1.8 },
  ] },
  // 斜め: ステージを斜めから。ズーム廃止=1.4で静止(社長指示v0.25.2015)。
  // 【立ち位置合わせv0.25.2024】3人は元のステージ壇上(y66=絵と接地が合う位置)に戻し、
  // カメラ原点(48.3,17.8)側を動かしてヒーロー足元を共通アンカー(218,569)に一致させる(=絵とのズレ解消)。
  // v0.25.2025: ステージに対してキャラが大きすぎ→縮小(h22/24→15/16)。間隔もサイズに合わせて詰める。
  { bg: A('arena-diag.jpg'), bgBlur: A('arena-diag-blur.jpg'), ox: 48.3, oy: 17.8, zf: 1.4, zt: 1.4, chars: [
    { src: TWIN, x: 45.5, y: 66, h: 15 }, { src: HERO, x: 50, y: 66.5, h: 16 }, { src: BOB, x: 54.5, y: 66, h: 15 },
  ] },
  // 真横: ステージを横から。奥行きスタッガー。シーン全体を180度反転(flipScene・社長指示v0.25.2009)。
  // 【共通アンカー(社長指示v0.25.2019→2022)】ヒーロー=(50%,86%)・ズーム原点もヒーロー自身=ズーム中ドリフト0。
  // 正面の着地点・斜めと画面座標が完全一致(彼女は動かず世界が回る)。シルエットは同Δで隊形維持・接地不変。
  // v0.25.2025: キャラ縮小(h25/28/35→17/19/24)+シルエットの足元をステージ面(花道の傾斜)に沿わせる。
  // v0.25.2044(社長指示・図の文字通り): 斜め隊形=奥ショートカット(右上・小)/真中 色あり/手前ツインテール(左下・大)。
  { bg: A('arena-side.jpg'), bgBlur: A('arena-side-blur.jpg'), ox: 50.7, oy: 86, zf: 1.7, zt: 2.1, flipScene: true, chars: [
    { src: BOB, x: 57.5, y: 80.5, h: 17 }, { src: HERO, x: 50.7, y: 86, h: 19 }, { src: TWIN, x: 44, y: 92.5, h: 24 },
  ] },
];

// スポットライトの幾何(上のコメント参照)。charsの足元(x,y)とキャラ高さhから光錐と光溜まりを導出。
const SPOTLIGHTS = SHOTS.map(s => s.chars.map((c, ci) => {
  const bw = c.h * 0.85;               // 光錐の下端幅(枠w%・キャラ高さ比例)
  const bh = c.h * 2.6;                // 光錐の高さ(枠h%)=頭上のさらに上から落ちる
  const poolW = bw * 1.7;              // 足元の光溜まり(横長楕円)
  return {
    left: c.x - bw / 2, top: c.y - bh, w: bw, h: bh,
    poolL: c.x - poolW / 2, poolT: c.y - poolW * 0.2, poolW, poolH: poolW * 0.4,
    dur: 2.2 + ci * 0.5, delay: -ci * 0.7,   // 3本を微妙にずらして明滅
  };
}));

const OpeningScene: React.FC<{ onDone: () => void; startAtShoot?: boolean; startAtRevival?: boolean }> = ({ onDone, startAtShoot, startAtRevival }) => {
  const [ready, setReady] = useState(false); // 全素材decode完了までタイムラインを始めない(下記コメント)
  const [phase, setPhase] = useState(startAtRevival ? 4 : startAtShoot ? 3 : 0); // 0-2=アリーナ各アングル / 3=射撃シーン / 4=蘇生処置(字幕)
  const [step, setStep] = useState(0); // 射撃シーンのコマ番号(SHOOT_STEPS index)
  const [shootLine, setShootLine] = useState(-1); // 射撃シーンの会話行(SHOOT_LINES index / -1=非表示)
  const [subIdx, setSubIdx] = useState(-1); // 蘇生パートの表示中字幕(OPENING_REVIVAL_LINES index / -1=非表示)
  const [revFading, setRevFading] = useState(false); // 蘇生パート終端の3秒フェードアウト中(社長指示v0.25.2055)
  const [titleReveal, setTitleReveal] = useState(false); // 蘇生後のタイトルフェードイン中(社長指示v0.25.2061)
  // 歩きシーン(アリーナ前・v0.25.2114)。?opening=2/3のプレビューはスキップ(=完了扱い)。
  const [walkDone, setWalkDone] = useState<boolean>(!!(startAtShoot || startAtRevival));
  const walkDirRef = useRef<0 | -1 | 1>(0);                   // 押している間の歩行方向(0=停止/-1=左/1=右)。v0.25.2117で左移動対応
  const walkSceneRef = useRef<HTMLDivElement | null>(null);
  const walkWorldRef = useRef<HTMLDivElement | null>(null);
  const walkCharRef = useRef<HTMLImageElement | null>(null);
  const doneRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement[]>([]);   // アリーナ2音源(場面転換で止める)
  const panRef = useRef<HTMLAudioElement[]>([]);     // パン!SE×2(発砲は場面転換後に鳴るため別管理)
  const heartRef = useRef<HTMLAudioElement[]>([]);   // 蘇生パート: [0]=会話中の心拍ループ / [1]=最終行後の一発(ループとは別要素)
  const stopArena = () => { audioRef.current.forEach(a => { a.pause(); a.src = ''; }); audioRef.current = []; };
  const stopHearts = () => { heartRef.current.forEach(a => { if (a) { a.pause(); a.src = ''; } }); heartRef.current = []; };
  const stopAudio = () => { stopArena(); panRef.current.forEach(a => { a.pause(); a.src = ''; }); panRef.current = []; stopHearts(); };
  // rewindBgm: OP明けのタイトルBGMは必ず曲頭から(v0.25.2104)。過去にタイトル曲を再生済みだと
  // onDone側のsetBgmScene('menu')が同srcのため停止位置から途中再開してしまうのを防ぐ。
  const finish = () => { if (!doneRef.current) { doneRef.current = true; stopAudio(); rewindBgm(); onDone(); } };

  // ── 蘇生処置パート(phase4)の台本タイムラインを rBase 起点で仕込む(idsにタイマー登録) ──
    // rBase = 射撃シーンが暗転し切った時刻(通常フロー)/ 0(?opening=3の単独プレビュー)。
    // 音はHTMLAudio(既存流儀)。会話中の心拍ループと最終行後の一発は【別要素】(spec)。
    const scheduleRevival = (rBase: number, ids: number[]) => {
      // 暗転後 blackHoldBeforeDialogueMs は「無音間」=心拍も鳴らさない。会話開始と同時にループを立ち上げる。
      const dialogueStart = rBase + OPENING_REVIVAL_TIMING.blackHoldBeforeDialogueMs;
      ids.push(window.setTimeout(() => {
        const a = heartRef.current[0];
        if (a) { try { a.currentTime = 0; } catch { /* ignore */ } a.play().catch(() => {}); } // 未解禁プレビューでは無音で進む
      }, dialogueStart));
      // 各行: minDurationMs 表示 → gapAfterMs は非表示(-1)で間を空けて次行。話者名(speaker)は絶対に出さない。
      let t = dialogueStart;
      OPENING_REVIVAL_LINES.forEach((line, i) => {
        const showAt = t;
        ids.push(window.setTimeout(() => setSubIdx(i), showAt));
        ids.push(window.setTimeout(() => setSubIdx(-1), showAt + line.minDurationMs));
        t = showAt + line.minDurationMs + line.gapAfterMs;
      });
      // t = 全行(最終行のgapAfterMs含む)終了時刻。ここで心拍を一度だけ(ループは止め、別要素で鳴らす)。
      ids.push(window.setTimeout(() => {
        heartRef.current[0]?.pause();
        const one = heartRef.current[1];
        if (one) { try { one.currentTime = 0; } catch { /* ignore */ } one.play().catch(() => {}); }
      }, t));
      // 終端フェードアウト3秒(社長指示v0.25.2055・旧: fadeToTutorialMs=350msで即終了)。
      // 画面=黒オーバーレイをCSSで3秒かけて被せ(赤ビネットごと沈む)、音=心拍の音量を0.5秒刻みで0へ。
      const REVIVAL_FADE_MS = 3000;
      ids.push(window.setTimeout(() => setRevFading(true), t));
      for (let k = 1; k <= 6; k++) {
        ids.push(window.setTimeout(() => {
          heartRef.current.forEach(a => { if (a) a.volume = Math.max(0, a.volume * (1 - k / 6)); });
        }, t + (REVIVAL_FADE_MS / 6) * k));
      }
      // 沈み切ったら【タイトルフェードイン】(社長指示v0.25.2061)。メニューBGMはここでは鳴らさず、
      // フェードイン明け=finish(App側onDoneのsetBgmScene('menu'))で開始(社長指示v0.25.2067
      // 「BGM流れるのは蘇生シーン終わってから」=フェードイン中は無音のまま)。
      ids.push(window.setTimeout(() => setTitleReveal(true), t + REVIVAL_FADE_MS));
      ids.push(window.setTimeout(finish, t + REVIVAL_FADE_MS + TITLE_REVEAL_MS));
    };


  useEffect(() => {
    // 【重要】タイムライン(タイマー+CSSアニメ)は「素材が描ける状態」になってから開始する。
    // mount起点だと初回ロード(コールド)では画面が出るまでに数秒かかり、その間に芝居が進んで
    // 頭のコマが飛ぶ(ヘッドレス実測: コールドではstep0が写らずstep3から見えた)。
    // 全imgをdecodeし切ってからreadyを立て、描画ツリーもreadyまでマウントしない
    // (CSSアニメのdelayはマウント時起点のため、ツリーごと遅らせて同期を取る)。
    // 壊れ画像等で永久に待たないようフォールバック上限3秒。
    let cancelled = false;
    const ids: number[] = [];

    // ── 心拍SE(蘇生パート用)を【マウント時に生成してプライミング】する(v0.25.2054修正) ──
    // 旧実装は鳴らす瞬間に new Audio していたが、OKタップから約27秒後=ユーザー操作の有効期限切れ後の
    // 新規要素はモバイルで再生ブロックされ無音になる(アリーナ音源が鳴るのはタップ数秒以内に再生開始するから)。
    // → 要素はここ(タップ直後のマウント)で作り、ミュートで一瞬再生→停止して「操作済み」扱いにしておく。
    {
      const loop = new Audio(HEARTBEAT_SRC); loop.loop = true; loop.preload = 'auto'; loop.volume = HEARTBEAT_LOOP_VOLUME;
      const one = new Audio(HEARTBEAT_SRC); one.preload = 'auto'; one.volume = HEARTBEAT_ONESHOT_VOLUME;
      heartRef.current = [loop, one];
    }

    // ?opening=3: 蘇生パート単独プレビュー。射撃/アリーナ素材のdecodeを待たず即開始(黒画面+字幕のみ)。
    if (startAtRevival) {
      setReady(true);
      scheduleRevival(0, ids);
      return () => { cancelled = true; ids.forEach(id => window.clearTimeout(id)); stopAudio(); };
    }

    // パン!SE(HTMLAudio・2発ぶん事前生成=紙吹雪用と発砲用。currentTime巻き戻しの競合を避ける)。
    panRef.current = [0, 1].map(() => { const a = new Audio(PAN_SE_SRC); a.preload = 'auto'; a.volume = PAN_SE_VOLUME; return a; });
    // アリーナ2音源もここ(タップ直後)で生成+プライミング(v0.25.2114): 歩きシーンがプレイヤー操作で
    // 長さ不定のため、アリーナ開始はジェスチャ有効期限切れ後になる。要素を今作って解錠しておく。
    if (!startAtShoot) audioRef.current = ARENA_AUDIO.map(src => { const a = new Audio(src); a.loop = true; a.preload = 'auto'; return a; });
    // 【プライミング】タップ(更新情報OK)直後のマウント時に、後から鳴らす要素をミュートで一瞬再生→停止して
    // 「ユーザー操作済み」扱いにしておく(v0.25.2054)。発砲パン・心拍・アリーナ音源は操作の有効期限
    // 切れ後の再生になるため、これが無いとモバイルでブロックされ無音になる。未解禁プレビューではcatchで無視。
    [...panRef.current, ...heartRef.current, ...audioRef.current].forEach(a => {
      a.muted = true;
      a.play().then(() => { a.pause(); try { a.currentTime = 0; } catch { /* ignore */ } a.muted = false; })
        .catch(() => { a.muted = false; });
    });
    const all = [
      ...SHOTS.map(s => s.bg), ...SHOTS.map(s => s.bgBlur), HERO, TWIN, BOB, A('shoot-stage.png'),
      ...[1, 2, 3, 4, 5, 6].map(SHOOTER), ...[1, 2, 3, 4, 5].map(VICTIM), ...[1, 2, 3].map(BLOOD),
      WALK_BG, WALK_BG_BLUR, ...WALK_FRAMES, // 歩きシーン(アリーナ前・v0.25.2114)
    ];
    const decodes = all.map(src => { const im = new Image(); im.src = src; return im.decode().catch(() => {}); });
    const fallback = new Promise<void>(res => { ids.push(window.setTimeout(res, 3000)); });
    Promise.race([Promise.all(decodes).then(() => {}), fallback]).then(() => {
      if (cancelled) return;
      setReady(true); // タイムラインの起動は walkDone エフェクト側(歩きシーン完了起点・v0.25.2114)
    });
    return () => { cancelled = true; ids.forEach(id => window.clearTimeout(id)); stopAudio(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── アリーナ以降のタイムライン(歩きシーン完了起点・v0.25.2114) ──
  // 歩きシーンはプレイヤー操作で長さ不定のため、従来のmount起点タイマーを「ready かつ 歩き完了」起点に変更。
  // ?opening=2はwalkDone初期値true=従来どおり即開始。?opening=3(蘇生単独)はmount側で処理済み=ここは走らない。
  // CSSアニメ(アリーナのズーム等)もwalkDoneでツリーがマウントされる=タイマーと起点が揃う(readyゲートと同じ理屈)。
  useEffect(() => {
    if (!ready || !walkDone || startAtRevival) return;
    const ids: number[] = [];
    const firePan = (n: number) => { const a = panRef.current[n]; if (!a) return; try { a.currentTime = 0; a.play().catch(() => {}); } catch { /* ignore */ } };
    {
      const base = startAtShoot ? 0 : SCENE_START;
      // 「パン!」のSE(社長指示v0.25.2040): 紙吹雪の発射と、射撃シーンの発砲に【同じ音=handgun-fire】。
      // 音声未解禁のURLプレビューでは鳴らない(本番=更新情報OKのジェスチャ後は鳴る)。
      if (!startAtShoot) ids.push(window.setTimeout(() => firePan(0), 1050)); // 紙吹雪パーン(1秒置いて)
      ids.push(window.setTimeout(() => firePan(1), base + 7500));           // 発砲(一閃の瞬間・v0.25.2075で7.5s)
      if (!startAtShoot) {
        // アングル切替=即表示のハードカット(社長指示v0.25.2072・旧クロスフェードは廃止)。
        [1, 2].forEach(i => {
          ids.push(window.setTimeout(() => setPhase(i), CUTS[i]));
        });
        ids.push(window.setTimeout(() => setPhase(3), SCENE_START));
        // アリーナ2音源(歓声+曲)は【パン!の後】に立ち上げる(社長指示v0.25.2048: パン!→歓声の順)。
        // 場面転換の直前に短フェードで止める(ブツ切りポップ防止)。
        // 自動再生がブロックされる環境(ジェスチャ無しのプレビュー等)では黙って無音のまま進める。
        // アリーナ2音源はmount時に生成+解錠済み(v0.25.2114)。ここでは再生開始だけ。
        ids.push(window.setTimeout(() => { audioRef.current.forEach(a => { a.play().catch(() => {}); }); }, 1400));
        [0.66, 0.33, 0.12].forEach((v, k) => {
          ids.push(window.setTimeout(() => audioRef.current.forEach(a => { a.volume = v; }), SCENE_START - 450 + k * 150));
        });
        ids.push(window.setTimeout(stopArena, SCENE_START)); // 発砲パン(場面転換後)を殺さないようアリーナだけ止める
      }
      SHOOT_STEPS.forEach((st, i) => { if (i > 0) ids.push(window.setTimeout(() => setStep(i), base + st.t)); });
      // 会話(v0.25.2065→2067→2075「どいつもこいつも・・・で一旦区切る」): 立ち姿=ビート1(0s)→
      // ビート2(2.5s) → 構え(5.0s)=ビート3 → 撃つ(7.5s)で消す(発砲が句読点)。各2.5秒。
      ids.push(window.setTimeout(() => setShootLine(0), base));
      ids.push(window.setTimeout(() => setShootLine(1), base + 2500));
      ids.push(window.setTimeout(() => setShootLine(2), base + 5000));
      ids.push(window.setTimeout(() => setShootLine(-1), base + 7500));
      // 射撃シーンが暗転し切ったら【蘇生処置パート(phase4)】へ切替→そのまま字幕会話を再生し、
      // 最後に finish()(旧: ここで直接 finish していたのを差し替え)。?opening=2 もこの経路で蘇生まで流れる。
      ids.push(window.setTimeout(() => setPhase(4), base + SHOOT_TOTAL));
      scheduleRevival(base + SHOOT_TOTAL, ids);
    }
    return () => { ids.forEach(id => window.clearTimeout(id)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, walkDone]);

  // ── 歩きシーンの駆動(v0.25.2114): 押している間だけ右へ。rAFでrefのDOMを直接更新(60fpsのsetStateを避ける) ──
  useEffect(() => {
    if (!ready || walkDone) return;
    let raf = 0;
    let worldX = WALK_EDGE_PAD; // キャラ足元中心のbg座標(表示px)
    let last = performance.now();
    const key = (e: KeyboardEvent, down: boolean) => {
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') walkDirRef.current = down ? 1 : (walkDirRef.current === 1 ? 0 : walkDirRef.current);
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') walkDirRef.current = down ? -1 : (walkDirRef.current === -1 ? 0 : walkDirRef.current);
    };
    const kd = (e: KeyboardEvent) => key(e, true);
    const ku = (e: KeyboardEvent) => key(e, false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    const tick = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      const scene = walkSceneRef.current, world = walkWorldRef.current, char = walkCharRef.current;
      if (scene && world && char) {
        const sw = scene.clientWidth, sh = scene.clientHeight;
        const bgH = sh, bgW = sh * WALK_BG_AR; // 舞台は画面の高さいっぱい(横は素材アスペクト)
        const maxX = bgW - WALK_EDGE_PAD;
        const dir = walkDirRef.current; // v0.25.2117: 左右どちらへも歩ける(左端〜右端の範囲内)
        if (dir !== 0) worldX = Math.max(WALK_EDGE_PAD, Math.min(maxX, worldX + dir * WALK_SPEED * dt / 1000));
        const cam = Math.max(0, Math.min(bgW - sw, worldX - sw * WALK_CAM_ANCHOR));
        world.style.width = `${bgW}px`;
        world.style.transform = `translate(${-cam}px, ${WALK_STAGE_Y_OFFSET}px)`;
        char.style.height = `${bgH * WALK_HERO_HR}px`;
        char.style.left = `${worldX}px`;
        char.style.top = `${bgH * WALK_FOOT_YR}px`;
        // 左向きは反転(素材は右向き)。停止中は直前の向きを保持。translateZ(0)=iOSマスクz順対策(v2063)。
        if (dir !== 0 && char.dataset.face !== String(dir)) {
          char.dataset.face = String(dir);
          char.style.transform = `translate(-50%, -100%) scaleX(${dir}) translateZ(0)`;
        }
        // 歩きコマ: ピンポン(0→1→2→3→2→1→…・社長指示v0.25.2117)。停止中は0コマ目=立ち。
        const seq = Math.floor(now / WALK_ANIM_MS) % (WALK_FRAMES.length * 2 - 2);
        const fi = dir !== 0 ? (seq < WALK_FRAMES.length ? seq : WALK_FRAMES.length * 2 - 2 - seq) : 0;
        if (char.dataset.f !== String(fi)) { char.dataset.f = String(fi); char.src = WALK_FRAMES[fi]; }
        if (worldX >= maxX - 0.5) { setWalkDone(true); return; } // 右端到達=アリーナへ
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [ready, walkDone]);


  const css =
    SHOTS.map((s, i) => `@keyframes opzoom${i}{from{transform:scale(${s.zf})}to{transform:scale(${s.zt})}}`).join('\n') +
    `\n@keyframes opblack{from{opacity:0}to{opacity:1}}` +
    `\n@keyframes opfade{from{opacity:0}to{opacity:1}}` +
    `\n@keyframes opfadeout{from{opacity:1}to{opacity:0}}` +
    `\n@keyframes opshzoom{from{transform:scale(1)}to{transform:scale(1.12)}}` +
    // 蘇生パート字幕: 行の切替を軽くフェードイン(任意・spec)。key=行indexで再マウントして毎行再生。
    `\n@keyframes opsub{from{opacity:0}to{opacity:1}}` +
    // 紙吹雪: 軌道(パーン=急減速の噴き上げ→等速のヒラヒラ落下)と、紙の羽ばたき(3D回転+横揺れ)を分離。
    // 0%でopacity:0(fill:bothにより発射待ちの間=delay中も0%が適用される)→発射直後に出現。
    // 待機中の粒が画面下端に「溜まって」見える件の対策(社長報告v0.25.2066)。軌道/タイミングは不変。
    `\n@keyframes opconfT{0%{transform:translate(0,0);opacity:0;animation-timing-function:cubic-bezier(0.16,1,0.3,1)}2%{opacity:1}16%{transform:translate(var(--cx1),var(--cy1));animation-timing-function:linear}100%{transform:translate(var(--cx2),var(--cy2))}}` +
    `\n@keyframes opconfS{0%{transform:rotateZ(0) rotateX(0) translateX(0)}25%{transform:rotateZ(var(--r1)) rotateX(72deg) translateX(var(--sw))}50%{transform:rotateZ(calc(var(--r1)*1.6)) rotateX(160deg) translateX(0)}75%{transform:rotateZ(var(--r1)) rotateX(250deg) translateX(calc(var(--sw)*-1))}100%{transform:rotateZ(0) rotateX(344deg) translateX(0)}}` +
    // キラキラ層: 画面(スクリーン)上端の外から下端の外まで通過するループ落下+きらめき(不透明度パルス+回転)。
    `\n@keyframes opconfK{from{transform:translateY(-4vh)}to{transform:translateY(106vh)}}` +
    `\n@keyframes opconfW{0%{opacity:0.25;transform:rotateZ(0) rotateX(0)}50%{opacity:1;transform:rotateZ(var(--r1)) rotateX(170deg)}100%{opacity:0.25;transform:rotateZ(0) rotateX(340deg)}}` +
    // ペンライトの振り(足元起点で左右へ)と会場グローの明滅。
    `\n@keyframes oppl{from{transform:rotate(calc(var(--pa)*-1))}to{transform:rotate(var(--pa))}}` +
    `\n@keyframes opvglow{0%{opacity:0.45}50%{opacity:1}100%{opacity:0.45}}` +
    // スポットライトのゆっくり明滅(強すぎない0.8↔1.0)。
    `\n@keyframes opspot{0%{opacity:0.8}50%{opacity:1}100%{opacity:0.8}}`;

  const cur = SHOOT_STEPS[step];

  return (
    <div
      onClick={finish}
      // z-index はタイトルのモーダル(更新情報等)より上・OrientationGuard(9999)より下。
      // タイトルフェードイン中(titleReveal)は背景を透過し、下のタイトル画面を透かして見せる。
      style={{ position: 'fixed', inset: 0, background: titleReveal ? 'transparent' : '#000', overflow: 'hidden', zIndex: 9990, cursor: 'pointer' }}
    >
      <style>{css}</style>

      {!ready ? null : !walkDone ? (
        // ── 楽屋通路の歩きシーン(アリーナ前・v0.25.2114): 左端からフェードイン→押している間だけ右へ歩く。
        //    タップは歩行操作なのでOPスキップ(root onClick)へは伝播させない。 ──
        <div
          ref={walkSceneRef}
          onClick={e => e.stopPropagation()}
          // タップ位置=画面の右半分なら右へ・左半分なら左へ(押している間だけ歩く・v0.25.2117)
          onPointerDown={e => { e.stopPropagation(); walkDirRef.current = e.clientX >= window.innerWidth / 2 ? 1 : -1; }}
          onPointerMove={e => { if (walkDirRef.current !== 0) walkDirRef.current = e.clientX >= window.innerWidth / 2 ? 1 : -1; }}
          onPointerUp={() => { walkDirRef.current = 0; }}
          onPointerCancel={() => { walkDirRef.current = 0; }}
          onPointerLeave={() => { walkDirRef.current = 0; }}
          style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#000', touchAction: 'none', cursor: 'default' }}
        >
          <div ref={walkWorldRef} style={{ position: 'absolute', top: 0, left: 0, height: '100%', willChange: 'transform' }}>
            <img src={WALK_BG} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill' }} />
            {/* 被写界深度: 事前ブラー版を縦グラデマスクで重ねる(壁=ボケ/床ラインでシャープへ)。 */}
            <img src={WALK_BG_BLUR} alt="" draggable={false} style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill',
              maskImage: WALK_DOF_MASK, WebkitMaskImage: WALK_DOF_MASK,
            } as React.CSSProperties} />
            <img
              ref={walkCharRef} src={WALK_FRAMES[0]} alt="" draggable={false}
              style={{
                // translateZ(0)=iOSのmaskedレイヤーz順バグ対策(v0.25.2063の教訓): DOFマスクの下に潜らせない。
                position: 'absolute', transform: 'translate(-50%, -100%) translateZ(0)', imageRendering: 'pixelated',
                animation: `opfade ${WALK_FADEIN_MS}ms ease-out both`, // 開始時フェードイン(社長指示)
              }}
            />
          </div>
        </div>
      ) : phase < 3 ? (
        // ── アリーナ3アングル(即表示ハードカット・社長指示v0.25.2072)。key=アングル番号で
        //    切替時に再マウント=各アングルのズームは表示の瞬間から開始。 ──
        <>
          {[phase].map(si => (
            <div
              key={si}
              style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <div
                style={{
                  position: 'relative', width: '100%',
                  transformOrigin: `${SHOTS[si].ox}% ${SHOTS[si].oy}%`,
                  // 正面のみ: 紙吹雪の噴き上げを見せてからズーム開始(FRONT_ZOOM_DELAY)。
                  animation: `opzoom${si} ${SHOT_DUR[si]}ms linear ${si === 0 ? FRONT_ZOOM_DELAY : 0}ms both`,
                }}
              >
                <div style={{ position: 'relative', width: '100%', aspectRatio: `${ARENA_AR}` }}>
                  {/* flipScene=背景を左右反転(キャラは素の座標=画面全体がミラーに見える) */}
                  <img src={SHOTS[si].bg} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: SHOTS[si].flipScene ? 'scaleX(-1)' : undefined }} />
                  {/* 被写界深度(v0.25.2060方式): 事前ブラー版bgを焦点マスク(中心=透明穴)で重ねる。
                      焦点(ステージ)は下の鮮明bgが素通しで見え、周辺ほどブラー版が出る。ランタイムぼかし無し。 */}
                  <img src={SHOTS[si].bgBlur} alt="" draggable={false} style={{
                    position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
                    transform: SHOTS[si].flipScene ? 'scaleX(-1)' : undefined,
                    maskImage: dofMask(si), WebkitMaskImage: dofMask(si),
                  } as React.CSSProperties} />
                  {/* 会場グローパルス(案B): 客席一帯をゆっくり明滅する柔らかい光で持ち上げる */}
                  {VENUE_GLOWS.map((g, gi) => (
                    <div
                      key={`vg${gi}`}
                      style={{
                        position: 'absolute', left: `${g.x - g.rx}%`, top: `${g.y - g.ry}%`, width: `${g.rx * 2}%`, height: `${g.ry * 2}%`,
                        background: `radial-gradient(ellipse at center, ${g.color} 0%, rgba(0,0,0,0) 70%)`,
                        mixBlendMode: 'screen', pointerEvents: 'none',
                        animation: `opvglow ${g.dur}s ease-in-out infinite`, animationDelay: `${g.delay}s`,
                      }}
                    />
                  ))}
                  {/* ペンライトの海(案A): 客席領域で光のバーがそれぞれ揺れる(ズームに追従) */}
                  <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                    {PENLIGHTS[si].map(p => (
                      <div
                        key={p.key}
                        style={{
                          position: 'absolute', left: `${p.x.toFixed(1)}%`, top: `${p.y.toFixed(1)}%`,
                          width: p.w, height: p.h, borderRadius: 2,
                          background: p.color, opacity: p.op,
                          // 発光強化(社長指示v0.25.2057): 芯+大きめの淡いハロの2層グロー。
                          boxShadow: `0 0 9px 2px ${p.color}, 0 0 22px 8px ${p.color}66`,
                          transformOrigin: '50% 100%',
                          '--pa': p.pa,
                          animation: `oppl ${p.sd.toFixed(2)}s ease-in-out infinite alternate`,
                          animationDelay: `${p.delay.toFixed(2)}s`,
                        } as React.CSSProperties}
                      />
                    ))}
                  </div>
                  {/* スポットライト(社長指示v0.25.2057): 3人へ頭上から光錐+足元の光溜まり。
                      キャラ描画の下に敷く=3人が光の中に立って見える。 */}
                  {SPOTLIGHTS[si].map((sp, spi) => (
                    <React.Fragment key={`sp${spi}`}>
                      <div style={{
                        position: 'absolute', left: `${sp.left}%`, top: `${sp.top}%`, width: `${sp.w}%`, height: `${sp.h}%`,
                        clipPath: 'polygon(36% 0, 64% 0, 100% 100%, 0% 100%)',
                        // 上端は透明から立ち上げ=光錐の「生え際」の四角い切れ目を消す(v0.25.2060実写確認)。
                        background: 'linear-gradient(to bottom, rgba(255,250,215,0) 0%, rgba(255,250,215,0.4) 22%, rgba(255,250,215,0.05) 100%)',
                        mixBlendMode: 'screen', pointerEvents: 'none',
                        animation: `opspot ${sp.dur}s ease-in-out infinite`, animationDelay: `${sp.delay}s`,
                      }} />
                      <div style={{
                        position: 'absolute', left: `${sp.poolL}%`, top: `${sp.poolT}%`, width: `${sp.poolW}%`, height: `${sp.poolH}%`,
                        background: 'radial-gradient(ellipse at center, rgba(255,250,215,0.34), rgba(0,0,0,0) 70%)',
                        mixBlendMode: 'screen', pointerEvents: 'none',
                        animation: `opspot ${sp.dur}s ease-in-out infinite`, animationDelay: `${sp.delay}s`,
                      }} />
                    </React.Fragment>
                  ))}
                  <div style={{ position: 'absolute', inset: 0 }}>
                    {SHOTS[si].chars.map((c, ci) => (
                      <img
                        key={ci} src={c.src} alt="" draggable={false}
                        style={{
                          position: 'absolute', left: `${c.x}%`, top: `${c.y}%`, height: `${c.h}%`,
                          transform: 'translate(-50%, -100%)', imageRendering: 'pixelated',
                          // アリーナではシルエット2人を白に(社長指示v0.25.2044)。舞台裏(赤背景)は素の黒のまま。
                          filter: c.src !== HERO ? 'brightness(0) invert(1)' : undefined,
                        }}
                      />
                    ))}
                  </div>
                  {/* (v0.25.2060: 旧backdrop-filterの被写界深度オーバーレイはブラー画像方式へ移行=上のbgBlur) */}
                </div>
              </div>
            </div>
          ))}
          {/* 紙吹雪レイヤー(カメラ非追従・アングル切替を跨いで存続。zIndex=アングルより上・暗転(50)より下。
              【画面全体】に描く(レターボックス帯の外も含む上端→下端・社長指示v0.25.2042)。横=vw/縦=vh。
              translateZ(0)=iOS Safari合成バグ対策(社長報告v0.25.2063): マスク付きのブラーbg(被写界深度)が
              GPUレイヤーに昇格し、z-indexを無視して紙吹雪の上に描かれる=マスクの穴(ステージ中央)以外で
              噴射が隠れていた。紙吹雪側も明示的にレイヤー化してz順を合成側に尊重させる(定石の回避策)。 */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 5, overflow: 'hidden', pointerEvents: 'none', transform: 'translateZ(0)', willChange: 'transform' }}>
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
              {/* ①パーン: 画面下端の両サイドから真上へ噴射→上端の外へ */}
              {CONFETTI_BURST.map(p => (
                <div
                  key={p.key}
                  style={{
                    position: 'absolute', left: `${p.x}%`, top: `${p.y}%`,
                    '--cx1': `${p.cx1.toFixed(1)}vw`, '--cy1': `${p.cy1.toFixed(1)}vh`,
                    '--cx2': `${p.cx2.toFixed(1)}vw`, '--cy2': `${p.cy2.toFixed(1)}vh`,
                    animation: `opconfT ${p.dur.toFixed(2)}s both`, animationDelay: `${p.delay.toFixed(2)}s`,
                  } as React.CSSProperties}
                >
                  <div
                    style={{
                      width: p.w, height: p.h, background: p.color,
                      '--r1': p.r1, '--sw': `${p.sw.toFixed(1)}px`,
                      animation: `opconfS ${p.sd.toFixed(2)}s linear infinite`,
                    } as React.CSSProperties}
                  />
                </div>
              ))}
              {/* ②雨: 噴き上げ後(1.0s〜)、画面全体に均等な紙吹雪がきらめきながら降り続けるループ層。
                  各粒は負のdelayで最初から空中に満ちている。斜め・横カットでも継続。 */}
              <div style={{ position: 'absolute', inset: 0, opacity: 0, animation: `opfade 500ms linear ${CONFETTI_RAIN_START_MS}ms both` }}>
                {CONFETTI_GLITTER.map(p => (
                  <div
                    key={p.key}
                    style={{
                      position: 'absolute', left: `${p.x.toFixed(1)}%`, top: 0,
                      animation: `opconfK ${p.dur.toFixed(2)}s linear infinite`, animationDelay: `${p.delay.toFixed(2)}s`,
                    } as React.CSSProperties}
                  >
                    <div
                      style={{
                        width: p.w, height: p.h, background: p.color,
                        '--r1': p.r1,
                        animation: `opconfW ${p.td.toFixed(2)}s linear infinite`,
                      } as React.CSSProperties}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : phase === 3 ? (
        // ── 射撃シーン(backstage)。コマ画像は足元アンカー共通キャンバス=src差し替えで芝居。 ──
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              position: 'relative', width: '100%',
              transformOrigin: '52% 78%',
              animation: `opshzoom ${SHOOT_TOTAL}ms linear both`,
            }}
          >
            <div style={{ position: 'relative', width: '100%', aspectRatio: `${ARENA_AR}` }}>
              {/* 撃った瞬間から背景=赤一色(舞台絵と差し替え)。キャラはその上に残る。 */}
              {cur.red
                ? <div style={{ position: 'absolute', inset: 0, background: '#d40000' }} />
                : <img src={A('shoot-stage.png')} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
              <img
                src={VICTIM(cur.v)} alt="" draggable={false}
                style={{
                  position: 'absolute', left: `${VICTIM_POS.x + (VICTIM_DX[cur.v] ?? 0)}%`, top: `${VICTIM_POS.y}%`, height: `${VICTIM_POS.h}%`,
                  transform: 'translate(-50%, -100%)', imageRendering: 'pixelated',
                  // 撃たれた瞬間のコマ(v2)だけ黒シルエット化(社長指示v0.25.2023)=赤バックに黒抜きのショックカット。
                  filter: cur.v === 2 ? 'brightness(0)' : undefined,
                }}
              />
              <img
                src={SHOOTER(cur.s)} alt="" draggable={false}
                style={{
                  position: 'absolute', left: `${SHOOTER_POS.x}%`, top: `${SHOOTER_POS.y}%`, height: `${SHOOTER_POS.h}%`,
                  transform: 'translate(-50%, -100%)', imageRendering: 'pixelated',
                  // 舞台裏も最初は白シルエット→【背景が赤になるのと同じ瞬間】から黒(社長指示v0.25.2070)。
                  // 旧: 発砲コマのハードコード時刻(2.0s)基準で、v0.25.2067の+3秒シフトを取りこぼし
                  // 会話中に黒くなっていた。赤反転フラグ(cur.red)基準なら今後シフトしてもズレない。
                  filter: cur.red ? undefined : 'brightness(0) invert(1)',
                }}
              />
              {/* 血飛沫(被弾の瞬間・3コマ40msずつ)。右端センター=傷口を後頭部に合わせ、左へ飛ぶ。 */}
              {cur.b > 0 && (
                <img
                  src={BLOOD(cur.b)} alt="" draggable={false}
                  style={{
                    position: 'absolute', left: `${BLOOD_POS.x}%`, top: `${BLOOD_POS.y}%`, height: `${BLOOD_POS.h}%`,
                    // scaleX(-1)=左右反転(v0.25.2024): 素材は「尖端(傷口)が左・飛ぶほど右へ広がる」絵。
                    // 反転して尖端=右端(後頭部)に合わせ、左へ行くほど広がる=飛散方向へ正しく拡散。
                    transform: 'translate(-100%, -50%) scaleX(-1)', imageRendering: 'pixelated',
                    // OPの血飛沫は黒シルエット(社長指示v0.25.2023・ゲーム内は赤のまま)。
                    filter: 'brightness(0)',
                  }}
                />
              )}
            </div>
          </div>
          {/* 会話(社長指示v0.25.2065): 本編の左上・会話UI(NpcDialogue)と同一の見た目をOP内で再現。
              位置/枠(glass-pill)/話者名の色/文字サイズはNpcDialogue.tsxに合わせる(UI統一)。 */}
          {shootLine >= 0 && (
            <div
              className="absolute text-left"
              style={{
                top: 'calc(max(env(safe-area-inset-top), 8px) + 132px)',
                left: 'max(env(safe-area-inset-left), 18px)',
                maxWidth: 'min(66vw, 300px)', zIndex: 40,
              }}
            >
              <div
                className="glass-pill flex items-stretch gap-1.5 py-1.5 pl-1.5 text-[13px] leading-snug"
                style={{ paddingRight: 44, overflow: 'visible', textShadow: '0 1px 0 rgba(0,0,0,0.9)' }}
              >
                <div className="relative self-stretch shrink-0" style={{ width: 40 }}>
                  {/* 立ち絵=撃つ子の立ち姿。撃つ前のシーンと同じ白シルエットで正体は見せない。
                      足元は「上から2行分」の位置に固定(社長指示v0.25.2072・会話UI共通=NpcDialogueと同じ)。 */}
                  <img
                    src={SHOOTER(1)} alt="" draggable={false}
                    style={{
                      position: 'absolute', left: '50%', top: 42, transform: 'translate(-50%, -100%)',
                      height: 64, width: 'auto', maxWidth: 'none', imageRendering: 'pixelated',
                      filter: 'brightness(0) invert(1)',
                    }}
                  />
                </div>
                <div className="self-center" style={{ whiteSpace: 'pre-line', wordBreak: 'break-word' }}>
                  {/* 会話は名前の後に一度改行(社長指示v0.25.2069・会話UI共通=本編NpcDialogueと同じ)。 */}
                  <span className="block font-bold text-amber-300/95">？？？</span>
                  <span className="text-white/90">{SHOOT_LINES[shootLine]}</span>
                </div>
              </div>
            </div>
          )}
          {/* シーン終わりの暗転 */}
          <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: 0, pointerEvents: 'none', animation: `opblack ${SHOOT_FADE_MS}ms linear ${SHOOT_FADE_START}ms both` }} />
        </div>
      ) : titleReveal ? (
        // ── タイトルフェードイン(社長指示v0.25.2061): 蘇生が黒に沈み切った後、黒幕をフェードアウトして
        //    下に居るタイトル画面を透かして見せる(ルート背景は透過済み)。明け切ったら finish でOPを外す。 ──
        <div style={{ position: 'absolute', inset: 0, background: '#000', pointerEvents: 'none', animation: `opfadeout ${TITLE_REVEAL_MS}ms linear both` }} />
      ) : (
        // ── 蘇生処置パート(phase4): 黒背景の中央に字幕を1行ずつ。話者名・年代・PHILL等は絶対に出さない(spec §5/§6)。
        //    320px幅でも2〜3行に収まるよう max-width と自然折返しで担保。key=行indexで軽くフェードイン。 ──
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5%' }}>
          {/* HPピンチと同じ赤ビネットのドクドク点滅(社長指示v0.25.2053)。keyframeは本編と共用(index.cssのlowhp-heartbeat)。
              周期1100ms=心拍SEと同じ鼓動感。エッジのみ赤で中央の字幕は読める。 */}
          <div
            aria-hidden
            style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: 'radial-gradient(ellipse at center, rgba(120,0,0,0) 30%, rgba(150,0,0,0.40) 60%, rgba(190,0,0,0.92) 100%)',
              animation: 'lowhp-heartbeat 1100ms ease-in-out infinite',
              willChange: 'opacity',
            }}
          />
          {subIdx >= 0 && (
            <div
              key={subIdx}
              style={{
                maxWidth: '90%', textAlign: 'center',
                color: 'rgba(255,255,255,0.92)',
                fontFamily: '"Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif',
                fontSize: 14, letterSpacing: '0.06em', lineHeight: 1.75,
                textShadow: '0 1px 6px rgba(0,0,0,0.9)',
                animation: 'opsub 260ms ease both',
              }}
            >
              {OPENING_REVIVAL_LINES[subIdx].text}
            </div>
          )}
          {/* 終端の3秒フェードアウト(社長指示v0.25.2055): 黒を3秒かけて被せ、赤ビネットごと沈める。 */}
          {revFading && (
            <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: 0, animation: 'opfade 3000ms linear both', pointerEvents: 'none' }} />
          )}
        </div>
      )}

      {/* アリーナ→射撃シーン間の暗転(phase<3の間だけ重ねる。phase3は上の分岐ごと消えるのでカットで明ける)
          walkDone必須(v0.25.2114): 歩きシーン中にマウントするとCSSの遅延が歩き中に消化されて
          アリーナ開幕が真っ黒になる(実測でハマった罠。CSS起点はアリーナツリーと同時マウントが原則)。 */}
      {ready && walkDone && phase < 3 && !startAtShoot && (
        <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: 0, zIndex: 50, pointerEvents: 'none', animation: `opblack ${BLACK_MS}ms linear ${BLACK_START}ms both` }} />
      )}

      {/* スキップ(タイトルフェードイン中=実質OP終了後は出さない) */}
      {!titleReveal && <button
        type="button"
        onClick={(e) => { e.stopPropagation(); finish(); }}
        style={{
          position: 'absolute', bottom: 18, right: 18, zIndex: 60,
          padding: '6px 14px', fontSize: 12, color: 'rgba(255,255,255,0.75)',
          background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 999,
        }}
      >
        スキップ ▶
      </button>}
    </div>
  );
};

export default OpeningScene;
