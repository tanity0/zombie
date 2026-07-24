// Central audio controls. BGM uses HTMLAudioElement so mobile browsers keep
// their normal media route; short SFX use Web Audio to avoid frame hitches.

import { ASSET_VERSION } from '../config/assetVersion';
import { loadProgressBegin, loadProgressDone } from '../utils/loadProgress';

const MUTED_KEY = 'zombie:audioMuted';
const LEGACY_BGM_MUTED_KEY = 'zombie:bgmMuted';
const BGM_VOLUME_KEY = 'zombie:bgmVolume';
const SFX_VOLUME_KEY = 'zombie:sfxVolume';
const DEFAULT_BGM_VOLUME = 1;
const DEFAULT_SFX_VOLUME = 1;

// ステージBGM。キー別に並べる(default=森/stage1、lab=研究所、stage3=廃都…)。
// App 側がステージから key を解決して setBgmScene('game', key) で指定する。
// 未割当 key は default(stage1)へフォールバック。
const GAME_BGM: Record<string, string> = {
  default: `${import.meta.env.BASE_URL}audio/stage1.mp3`,
  tutorial: `${import.meta.env.BASE_URL}audio/tutorial.mp3`, // チュートリアル(洞窟)。stage.bgm='tutorial'で選択

  lab: `${import.meta.env.BASE_URL}audio/lab-stage.mp3`, // 研究所(ステージ2)。theme==='lab' で選択
  stage3: `${import.meta.env.BASE_URL}audio/stage3.mp3`, // 廃都(ステージ3)。stage.bgm='stage3' で選択
  stage4: `${import.meta.env.BASE_URL}audio/stage4.mp3`, // 封鎖地域/雪原(ステージ4)。stage.bgm='stage4'
  stage5: `${import.meta.env.BASE_URL}audio/stage5.mp3`, // 軍本部(ステージ5)。stage.bgm='stage5'
  stage6: `${import.meta.env.BASE_URL}audio/stage6.mp3`, // 古い洋館(ステージ6)。stage.bgm='stage6'
  stage7: `${import.meta.env.BASE_URL}audio/ashen-crown-oath.mp3`, // M7=ラスボス曲(社長提供・灰の冠の誓い)。stage.bgm='stage7'(v0.25.1940)
};
// 深層域BGM(逆再生版)。屋外ステージごとに areverse 版を用意(命名 stageN-reverse.mp3)。
// 深層域に入ると通常BGMを pause(位置保持)し、こちらを play で即時切替する(クロスフェード無し)。
// lab(屋内・ステージ2)は深層域が無いので逆再生版なし。素材未配置でも 404→無音でクラッシュしない。
const REVERSE_BGM: Record<string, string> = {
  default: `${import.meta.env.BASE_URL}audio/stage1-reverse.mp3`,
  stage3: `${import.meta.env.BASE_URL}audio/stage3-reverse.mp3`,
  stage4: `${import.meta.env.BASE_URL}audio/stage4-reverse.mp3`,
  stage5: `${import.meta.env.BASE_URL}audio/stage5-reverse.mp3`,
  stage6: `${import.meta.env.BASE_URL}audio/stage6-reverse.mp3`,
};
// タイトル画面のBGM(メニュー中だけ流す)。配置先: public/audio/title.mp3(無い間は無音=クラッシュなし)。
const TITLE_TRACK = `${import.meta.env.BASE_URL}audio/title.mp3?v=${encodeURIComponent(ASSET_VERSION)}`;
// PEAK(AIディレクター/紅き月)中だけ通常BGMに重ねる打楽器レイヤー(社長提供)。差し替え/追加のみで
// 通常BGMは止めない(社長要望の「PEAK突入の輪郭を体で感じさせる」演出)。
const PEAK_LAYER_TRACK = `${import.meta.env.BASE_URL}audio/peak-layer.mp3?v=${encodeURIComponent(ASSET_VERSION)}`;
// ダンスタイム(四神舞)中だけ流す曲。四神舞レベルでBPMが変わる(Lv1=100/Lv2=120/Lv3=140)。
// v0.25.284: 8小節ループの継ぎ目が要素 loop=true でぶつ切りになるため、軽量(128k/48k)のフル尺曲に戻す。
// フル尺なら継ぎ目(末尾→先頭)は3〜4分に1回でダンス中はほぼ当たらない。要素再生なので軽い。
const DANCE_LOOP_TRACKS: Record<number, string> = {
  1: `${import.meta.env.BASE_URL}audio/dance-100.mp3?v=${encodeURIComponent(ASSET_VERSION)}`,
  2: `${import.meta.env.BASE_URL}audio/dance-120.mp3?v=${encodeURIComponent(ASSET_VERSION)}`,
  3: `${import.meta.env.BASE_URL}audio/dance-140.mp3?v=${encodeURIComponent(ASSET_VERSION)}`,
};
let currentDanceLevel = 2; // 現在ダンスループに使っているレベル

type SfxConfig = {
  src: string;
  volume?: number;
  minIntervalMs?: number;
  playbackRate?: number;
  startAt?: number;
  maxDurationMs?: number;
  fadeOutMs?: number; // 再生終端(maxDurationMs か曲尾)に向けてこの時間でゲインを0へランプ(長尺SEのフェード)
  warm?: boolean;
};

type WindowWithWebAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export type SfxKey =
  | 'ui-select'
  | 'mission-start'
  | 'title-start'
  | 'event-clear'
  | 'event-start'
  | 'shoot'
  | 'reload'
  | 'melee'
  | 'katana-dash'
  | 'counter'
  | 'enemy-hit'
  | 'enemy-kill'
  | 'pickup'
  | 'ammo-pickup'
  | 'weapon-pickup'
  | 'shot-damage'
  | 'headshot'
  | 'slash-damage'
  | 'handgun-fire'
  | 'npc-gunfire'
  | 'smg-fire'
  | 'shotgun-fire'
  | 'rifle-fire'
  | 'grenade-launcher-fire'
  | 'level-up'
  | 'boss-warning'
  | 'melee-finish'
  | 'player-damage'
  | 'shield-deploy'
  | 'decoy-zap'
  | 'bomb'
  | 'eat'
  | 'zombie-1'
  | 'zombie-2'
  | 'zombie-3'
  | 'zombie-4'
  | 'hurricane'
  | 'heartbeat' // 瀕死(低HP)中の心音ループ素材(setHeartbeatLoopが再生。playSfx直呼びはしない)
  | 'dance-kick'
  | 'dance-kick-just' // JUST成功音(dance-kickのピッチ上げ。B方式のメトロノームと聞き分ける)
  | 'heavy-impact'
  | 'skadi-ice'
  | 'heli-intro'
  | 'whip-hit'
  | 'whip-swing'
  | 'anchor-plant'
  | 'boomerang-throw'
  | 'homing-lock'
  | 'homing-lock2'
  | 'homing-fire'
  | 'summon'
  | 'boss-appear'    // 城ボス/裏ボス出現時のアテンションSE
  | 'heli-land'      // ヘリ着地SE
  | 'boss-death'     // 裏ボス討伐(消滅)SE。長いので fadeOutMs でフェード
  | 'base-capture'   // 拠点開放SE
  | 'hunter-alert'   // ハンター変異体の検知(視界に入った=見られている)警告SE
  | 'screamer-cry'   // 変異体(叫喚型)の叫喚(発動)SE
  | 'gate-clear'     // 強襲(関所)を生きて凌いだ時の突破ジングル
  | 'thor-sweep'     // 裏ボス トールの払い(横払い)SE(社長提供)
  | 'thor-thrust';   // 裏ボス トールの突きSE(社長提供)

const SFX_SOURCES: Partial<Record<SfxKey, SfxConfig>> = {
  // UI選択音(社長提供SE)。レベルアップの選択肢タップ等に使用。
  'ui-select': {
    src: `${import.meta.env.BASE_URL}audio/sfx/ui-select.mp3`,
    volume: 0.7,
    minIntervalMs: 50,
  },
  // キャラ選択を終えてミッション開始するときの音(社長提供SE)。
  'mission-start': {
    src: `${import.meta.env.BASE_URL}audio/sfx/mission-start.mp3`,
    volume: 0.85,
  },
  // 同意画面の後、タイトルのSTARTを押したときの音(社長提供SE)。
  'title-start': {
    src: `${import.meta.env.BASE_URL}audio/sfx/title-start.mp3`,
    volume: 0.85,
  },
  // 戦闘中の小イベント(囲い/救助など)発生音(社長提供SE)。
  'event-start': {
    src: `${import.meta.env.BASE_URL}audio/sfx/event-start.mp3`,
    volume: 0.85,
    minIntervalMs: 200,
  },
  // 戦闘中の小イベント(囲い/救助など)完了音(社長提供SE)。
  'event-clear': {
    src: `${import.meta.env.BASE_URL}audio/sfx/event-clear.mp3`,
    volume: 0.85,
    minIntervalMs: 200,
  },
  // 城ボス/裏ボス出現時のアテンションで鳴らす(社長提供SE)。
  'boss-appear': {
    src: `${import.meta.env.BASE_URL}audio/sfx/boss-appear.mp3`,
    volume: 0.9,
    minIntervalMs: 400,
  },
  // ヘリ着地SE(社長提供)。登場演出の着地タイミングで1回。
  'heli-land': {
    src: `${import.meta.env.BASE_URL}audio/sfx/heli-land.mp3`,
    volume: 0.9,
    minIntervalMs: 400,
  },
  // 裏ボス討伐(消滅)SE(社長提供)。やや長いので消滅モーション(約2.6s)に合わせてフェードアウト。
  'boss-death': {
    src: `${import.meta.env.BASE_URL}audio/sfx/boss-death.mp3`,
    volume: 0.9,
    minIntervalMs: 400,
    maxDurationMs: 2600,
    fadeOutMs: 900,
  },
  // 拠点開放SE(社長提供)。拠点確保の瞬間に1回。
  'base-capture': {
    src: `${import.meta.env.BASE_URL}audio/sfx/base-capture.mp3`,
    volume: 0.85,
    minIntervalMs: 200,
  },
  // ハンター変異体の検知警告SE(社長提供)。索敵個体の視界に入った瞬間に1回。
  'hunter-alert': {
    src: `${import.meta.env.BASE_URL}audio/sfx/hunter-alert.mp3`,
    volume: 1.0,
    minIntervalMs: 400,
  },
  // 強襲(関所)突破ジングル(社長提供・約1.9s)。「襲撃を凌いだ」コールアウトと同時に1回。
  'gate-clear': {
    src: `${import.meta.env.BASE_URL}audio/sfx/gate-clear.mp3`,
    volume: 0.9,
    minIntervalMs: 1000,
  },
  // 変異体(叫喚型)の叫喚(発動)SE(社長提供)。溜め完了で1回。
  'screamer-cry': {
    src: `${import.meta.env.BASE_URL}audio/sfx/screamer-cry.wav`,
    volume: 1.3, // 叫喚の音量を上げる(社長指示: 1.0→1.3)
    minIntervalMs: 400,
  },
  // レベルアップSE(社長提供)。レベルが上がった瞬間に1回。
  'level-up': {
    src: `${import.meta.env.BASE_URL}audio/sfx/level-up.mp3`,
    volume: 1.0,
    minIntervalMs: 200,
  },
  pickup: {
    src: `${import.meta.env.BASE_URL}audio/sfx/pickup.wav`,
    volume: 0.74,
  },
  'ammo-pickup': {
    src: `${import.meta.env.BASE_URL}audio/sfx/ammo-pickup.wav`,
    volume: 0.78,
  },
  'weapon-pickup': {
    src: `${import.meta.env.BASE_URL}audio/sfx/weapon-pickup.wav`,
    volume: 0.92,
  },
  'shot-damage': {
    src: `${import.meta.env.BASE_URL}audio/sfx/shot-damage.mp3`,
    volume: 1.7, // 社長指示でさらに上げる(全然小さい→1.35→1.7。WebAudio gainは>1で増幅)
    minIntervalMs: 36,
  },
  headshot: {
    src: `${import.meta.env.BASE_URL}audio/sfx/headshot.mp3`,
    volume: 0.9,
    minIntervalMs: 44,
  },
  'slash-damage': {
    src: `${import.meta.env.BASE_URL}audio/sfx/slash-damage.mp3`,
    volume: 0.86,
    minIntervalMs: 80,
  },
  'handgun-fire': {
    src: `${import.meta.env.BASE_URL}audio/sfx/handgun-fire.wav`, // 社長提供の新ハンドガン発砲音(WAV=Web Audioでデコード)
    volume: 0.64, // 銃声を少し上げる(社長指示。0.52→0.64)
    minIntervalMs: 24,
  },
  'smg-fire': {
    src: `${import.meta.env.BASE_URL}audio/sfx/smg-fire.wav`, // 社長提供。サブマシンガン(マシンピストル=handgun-t3)の発射音
    volume: 0.70, // ハンドガン以外をもう少し上げる(0.58→0.70)
    minIntervalMs: 20, // 連射(CD100ms)に追従できるよう短め
  },
  // 進軍NPC(護衛)の発砲音=ハンドガン音の流用。基準音量は控えめ(プレイヤーより一段低い)。再生時に
  // 「NPC↔プレイヤー距離」で減衰させ、画面外は鳴らさない(呼び出し側で gainMult を渡す)。
  'npc-gunfire': {
    src: `${import.meta.env.BASE_URL}audio/sfx/handgun-fire.wav`,
    volume: 0.5,
    minIntervalMs: 50, // 多数同時発砲のうるささ対策(プレイヤーのhandgun-fireとは別スロット)
  },
  'shotgun-fire': {
    src: `${import.meta.env.BASE_URL}audio/sfx/shotgun-fire.wav`, // 社長提供の新ショットガン発砲音(WAV=Web Audioでデコード)
    volume: 1.3, // さらに上げる(社長指示。0.90→1.1→1.3)
    minIntervalMs: 32,
  },
  'rifle-fire': {
    src: `${import.meta.env.BASE_URL}audio/sfx/rifle-fire.mp3`,
    volume: 0.86, // ハンドガン以外をもう少し上げる(0.74→0.86)
    minIntervalMs: 28,
  },
  'grenade-launcher-fire': {
    src: `${import.meta.env.BASE_URL}audio/sfx/grenade-launcher-fire.mp3`, // 社長提供。グレネードランチャー(rifle-t3)の発射音
    volume: 0.90, // ハンドガン以外をもう少し上げる(0.78→0.90)
    minIntervalMs: 60,
  },
  melee: {
    src: `${import.meta.env.BASE_URL}audio/sfx/slash.mp3`,
    volume: 0.74,
    minIntervalMs: 180,
    startAt: 0.04,
    maxDurationMs: 260,
    warm: false,
  },
  // 一閃ダッシュ専用。同じ斬撃音をフルレングス・大きめ音量で鳴らす。
  'katana-dash': {
    src: `${import.meta.env.BASE_URL}audio/sfx/slash.mp3`,
    volume: 1.0,
    minIntervalMs: 60,
  },
  // 社長提供の長尺リロード音(約7.6秒)に差し替え。実際の再生長は呼び出し側が武器のリロード時間を
  // playSfx の durationMsOverride で渡し「リロード完了と同時に止める」。fadeOutMs で末尾を丸めて
  // ブツ切りを防ぐ。流用箇所(快速マガジン/カチッ音)も呼び出し側で短くキャップ。
  reload: {
    src: `${import.meta.env.BASE_URL}audio/sfx/reload.mp3`,
    volume: 1.05, // 大きく(社長指示。0.86→1.05)
    fadeOutMs: 120,
  },
  // Counter (bullet parry) success — deliberately a touch louder than the rest.
  counter: {
    src: `${import.meta.env.BASE_URL}audio/sfx/counter.mp3`,
    volume: 1.5, // さらに大きく(社長指示。0.88→1.2→1.5)
    minIntervalMs: 120,
  },
  // Melee finisher on a normal enemy, and finisher damage dealt to a boss.
  'melee-finish': {
    src: `${import.meta.env.BASE_URL}audio/sfx/kill.mp3`,
    volume: 1.45, // さらに大きく(社長指示。0.92→1.15→1.45)
    minIntervalMs: 90,
  },
  'player-damage': {
    src: `${import.meta.env.BASE_URL}audio/sfx/player-damage.mp3`,
    volume: 0.85,
    minIntervalMs: 140,
  },
  // 設置型シールド展開の「ガチャンッ!」。暫定で counter.mp3 を流用(金属音)。
  // 専用のクランク音を public/audio/sfx に置いたら src を差し替える。
  'shield-deploy': {
    src: `${import.meta.env.BASE_URL}audio/sfx/counter.mp3`,
    volume: 0.98,
    playbackRate: 0.82,   // 少し太く: 低めピッチで「ガチャン」を重くする(ファイル差し替え不要)
    minIntervalMs: 120,
  },
  // デコイ迎撃のレーザー音。counter.mp3 を高ピッチ・小音量で流用(短い「ピッ」)。
  'decoy-zap': {
    src: `${import.meta.env.BASE_URL}audio/sfx/counter.mp3`,
    volume: 0.45,
    playbackRate: 1.6,
    minIntervalMs: 110,
  },
  bomb: {
    src: `${import.meta.env.BASE_URL}audio/sfx/bomb.mp3`,
    volume: 0.9,
  },
  // Meat / health pickup ("eat").
  eat: {
    src: `${import.meta.env.BASE_URL}audio/sfx/eat.mp3`,
    volume: 0.82,
  },
  // Random zombie death grunts (1-4), chosen by playEnemyDeath().
  'zombie-1': { src: `${import.meta.env.BASE_URL}audio/sfx/zombie-1.mp3`, volume: 0.7, minIntervalMs: 50 },
  'zombie-2': { src: `${import.meta.env.BASE_URL}audio/sfx/zombie-2.mp3`, volume: 0.7, minIntervalMs: 50 },
  'zombie-3': { src: `${import.meta.env.BASE_URL}audio/sfx/zombie-3.mp3`, volume: 0.7, minIntervalMs: 50 },
  'zombie-4': { src: `${import.meta.env.BASE_URL}audio/sfx/zombie-4.mp3`, volume: 0.7, minIntervalMs: 50 },
  // 鞭ハリケーンの「ゴゴゴゴ」鳴動。発動中だけループ再生(setHurricaneRumble)。
  hurricane: { src: `${import.meta.env.BASE_URL}audio/sfx/hurricane.wav`, volume: 0.7 },
  // 心音ループ素材(社長提供)。実際の音量/再生は setHeartbeatLoop 側の HEARTBEAT_VOLUME が持つ
  // (hurricaneと同じ流儀。ここの volume は読み込み専用の器)。
  heartbeat: { src: `${import.meta.env.BASE_URL}audio/sfx/heartbeat.mp3`, volume: 1 },
  // ダンスフロアのジャスト成功(タップ/フリック両方)で鳴らすキックドラム。
  // メトロノーム(拍そのもの)と同じ素材だと聞き分けられないため、B方式(v0.25.1339)ではJUST成功音を
  // ピッチ上げ(playbackRate 1.3)で差別化する(dance-kick-just)。素材追加なし=同じmp3を再利用。
  'dance-kick': { src: `${import.meta.env.BASE_URL}audio/sfx/kick-drum.mp3`, volume: 0.95, minIntervalMs: 60 },
  'dance-kick-just': { src: `${import.meta.env.BASE_URL}audio/sfx/kick-drum.mp3`, volume: 0.95, minIntervalMs: 60, playbackRate: 1.3 },
  // 盾バッシュ命中 / ジャンプ攻撃の着地(社長提供SE)。音が小さめなのでゲインで増幅(0.9→1.8)。
  'heavy-impact': { src: `${import.meta.env.BASE_URL}audio/sfx/heavy-impact.mp3`, volume: 1.8, minIntervalMs: 60 },
  // スカジ氷塊破裂/氷刃命中のSE(社長提供)。
  'skadi-ice': { src: `${import.meta.env.BASE_URL}audio/sfx/skadi-ice.mp3`, volume: 1.0, minIntervalMs: 60 },
  // トール(ステージ5裏ボス)の払い/突きSE(社長提供)。攻撃実行タイミングで1回。
  'thor-sweep': { src: `${import.meta.env.BASE_URL}audio/sfx/thor-sweep.mp3`, volume: 1.0, minIntervalMs: 60 },
  'thor-thrust': { src: `${import.meta.env.BASE_URL}audio/sfx/thor-thrust.mp3`, volume: 1.0, minIntervalMs: 60 },
  // ヘリコプター登場シーンのSE(社長提供・登場開始時に1回)。飛び去り(末尾)でフェードアウト(社長指示)。
  // ★元クリップは長尺(数十秒)。maxDurationMs 無しだと fadeOutMs はクリップ末尾(数十秒後)に掛かり
  //   登場シーン(約3秒)中には聞こえない=「フェードアウトしない」。登場尺に合わせて上限を切り、
  //   その末尾でフェードする(飛び去りに同期)。maxDurationMs=4000 / fadeOutMs=1500。
  'heli-intro': { src: `${import.meta.env.BASE_URL}audio/sfx/heli-intro.mp3`, volume: 1.0, minIntervalMs: 200, maxDurationMs: 4000, fadeOutMs: 1500 },
  // 鞭が敵に当たった時(社長提供SE)。
  'whip-hit': { src: `${import.meta.env.BASE_URL}audio/sfx/whip-hit.mp3`, volume: 0.85, minIntervalMs: 60 },
  // 鞭を振る音(社長提供SE)。
  'whip-swing': { src: `${import.meta.env.BASE_URL}audio/sfx/whip-swing.mp3`, volume: 0.8, minIntervalMs: 60 },
  // ワイヤーアンカーを打ち込んだ音(社長提供SE)。
  'anchor-plant': { src: `${import.meta.env.BASE_URL}audio/sfx/anchor-plant.mp3`, volume: 0.65, minIntervalMs: 60 },
  // ブーメランを投げた音(社長提供SE)。
  'boomerang-throw': { src: `${import.meta.env.BASE_URL}audio/sfx/boomerang-throw.mp3`, volume: 0.82, minIntervalMs: 60 },
  // 錬金術で召喚した時の音(社長提供SE)。
  'summon': { src: `${import.meta.env.BASE_URL}audio/sfx/summon.mp3`, volume: 0.9, minIntervalMs: 60 },
  // ホーミング弾のロックオン1段階目の音(社長提供SE)。
  'homing-lock': { src: `${import.meta.env.BASE_URL}audio/sfx/homing-lock.mp3`, volume: 0.8, minIntervalMs: 50 },
  // ホーミング弾のロックオン2段階目の音(社長提供SE)。
  'homing-lock2': { src: `${import.meta.env.BASE_URL}audio/sfx/homing-lock2.mp3`, volume: 0.8, minIntervalMs: 50 },
  // ホーミング弾の発射音(社長提供SE)。指を離して一斉発射した時に1回。
  'homing-fire': { src: `${import.meta.env.BASE_URL}audio/sfx/homing-fire.mp3`, volume: 0.85, minIntervalMs: 50 },
};

let bgm: HTMLAudioElement | null = null;
let bgmGain: GainNode | null = null; // BGM routed through WebAudio so its volume
let bgmRouted = false;               // is controllable on iOS (element.volume isn't)
let bgmActive = false;
let muted = false;
let bgmVolume = DEFAULT_BGM_VOLUME;
// PEAK重ねレイヤー中だけ通常BGMを少し落とすダッキング倍率(社長指示)。1=等倍。
// BGM音量を適用する全経路で bgmVolume × bgmDuck を使う(ユーザー設定のスライダー値は汚さない)。
let bgmDuck = 1;
// ダンスビートB方式(v0.25.1339): メトロノームのキックが埋もれないよう、ダンス曲を軽くダックする。
// 実機調整前提の叩き台値。setDanceBeatDuck(true/false) はダンス開始/終了エッジでのみ呼ぶ(useGameLoop)。
const DANCE_BGM_BEAT_DUCK = 0.8;
let danceBeatDuckActive = false;
export const setDanceBeatDuck = (active: boolean) => {
  if (danceBeatDuckActive === active) return;
  danceBeatDuckActive = active;
  playBgmRobust();
};
let sfxVolume = DEFAULT_SFX_VOLUME;
let sfxContext: AudioContext | null = null;
// 深層域BGM(逆再生版)の状態。別 HTMLAudioElement を並走させ、深層in/outは play/pause で切替。
let deepBgm: HTMLAudioElement | null = null;
let deepBgmSrc = '';
let deepActive = false;              // 深層in(逆再生版が再生対象)か
let currentGameVariant = 'default';  // 現在のステージBGM variant(逆再生版の選択に使用)
let deepPlayToken = 0;               // 逆再生版の遅延play再試行トークン
// PEAK重ねレイヤー(打楽器)。通常BGMは pause せず、別要素を並走させて音量だけフェードイン/アウトする。
let peakLayerEl: HTMLAudioElement | null = null;
let peakLayerActive = false;
let peakLayerFadeTimer: number | null = null;

const sfxBuffers = new Map<SfxKey, AudioBuffer>();
const sfxLoading = new Map<SfxKey, Promise<void>>();
const sfxLastPlayedAt = new Map<SfxKey, number>();

// SFXの最小間隔(minIntervalMs)スロットルの記録をクリアする。ラン開始時に呼ぶ。
// これを残すと、performance.now() が page セッション通して単調増加のため、前ランの終わり際に鳴った
// 長め minInterval の音(ボス/死神出現音など)が、次ランの開始直後の同イベントで誤ってブロックされる。
export const clearSfxThrottle = (): void => { sfxLastPlayedAt.clear(); };

const isTouchLikeDevice = () => {
  if (typeof window === 'undefined') return false;
  return (
    navigator.maxTouchPoints > 0 ||
    window.matchMedia?.('(hover: none), (pointer: coarse)').matches === true
  );
};

const readInitialMuted = () => {
  try {
    const stored = localStorage.getItem(MUTED_KEY) ?? localStorage.getItem(LEGACY_BGM_MUTED_KEY);
    if (stored === '0' || stored === '1') return stored === '1';
  } catch {
    // Fall through to the conservative mobile default.
  }
  return isTouchLikeDevice();
};

muted = readInitialMuted();

const readVolume = (key: string, fallback: number) => {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(1, n));
  } catch {
    return fallback;
  }
};

bgmVolume = readVolume(BGM_VOLUME_KEY, DEFAULT_BGM_VOLUME);
sfxVolume = readVolume(SFX_VOLUME_KEY, DEFAULT_SFX_VOLUME);

const persistMuted = () => {
  try {
    localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
  } catch {
    // Ignore storage failures; audio state still changes for this session.
  }
};

// いま BGM 要素に読み込ませてあるトラックURL。v0.25.280ではこの1要素だけを戦闘/ダンスで差し替える。
let bgmSrc = GAME_BGM.default;
const ensureBgm = () => {
  if (bgm || typeof Audio === 'undefined') return;
  bgm = new Audio(bgmSrc);
  bgm.loop = true;
  bgm.preload = 'auto';
  (bgm as HTMLVideoElement).playsInline = true;
  bgm.volume = 1; // real level is set by the WebAudio gain (iOS-safe)
};

// --- ダンスタイム(四神舞) -------------------------------------------------
// v0.25.279でレベル別の固定HTMLAudioElementは音が出たが、実機ダンス中だけ約20fpsまで落ちた。
// v0.25.280の単一BGM要素src差し替え + 事前解錠はWeb/iOS Safari向けの暫定対策。
// ネイティブアプリへ移行する時は、この解錠/src差し替え処理を削り、アプリ側の音声エンジンでBGM切替を実装する。
let danceActive = false;

let bgmTargetSrc = GAME_BGM.default;
let bgmBaseTrack = GAME_BGM.default;   // 非ダンス時の基準曲(menu=タイトル / game=ステージ)
let bgmTargetDanceLevel = 0;        // 0=戦闘曲、1〜3=ダンス曲
let bgmPlayToken = 0;
let danceStopTimer: number | null = null; // 停止を少し遅延して、rhythm.active の一瞬のチラつきで止め→鳴り直しが起きないように

const cancelDanceStop = () => {
  if (danceStopTimer !== null) { clearTimeout(danceStopTimer); danceStopTimer = null; }
};

const danceTrackForLevel = (level: number) => DANCE_LOOP_TRACKS[Math.max(1, Math.min(3, level))] ?? DANCE_LOOP_TRACKS[2];

const playBgmRobust = () => {
  ensureBgm();
  if (!bgm || !bgmActive || muted) return;
  const token = ++bgmPlayToken;
  const tryPlay = () => {
    if (!bgm || token !== bgmPlayToken || !bgmActive || muted) return;
    bgm.muted = false; // 事前解錠(primeMenuBgm)はミュートのまま置くので、実再生の瞬間にここで初めて解除
    const v = bgmVolume * bgmDuck * (danceBeatDuckActive ? DANCE_BGM_BEAT_DUCK : 1);
    if (bgmGain) bgmGain.gain.value = v;
    else bgm.volume = v;
    void bgm.play().catch(() => {});
  };
  tryPlay();
  const events: Array<keyof HTMLMediaElementEventMap> = ['loadeddata', 'canplay', 'canplaythrough'];
  const cleanup = () => {
    if (!bgm) return;
    events.forEach(event => bgm?.removeEventListener(event, onReady));
  };
  const onReady = () => {
    cleanup();
    tryPlay();
  };
  events.forEach(event => bgm?.addEventListener(event, onReady, { once: true }));
  window.setTimeout(cleanup, 2200);
};

const setBgmTrack = (nextSrc: string, danceLevel = 0) => {
  ensureBgm();
  if (!bgm) return;
  if (bgmTargetSrc === nextSrc && bgmTargetDanceLevel === danceLevel && bgmSrc === nextSrc) {
    playBgmRobust();
    return;
  }
  bgmTargetSrc = nextSrc;
  bgmTargetDanceLevel = danceLevel;
  if (bgmSrc !== nextSrc) {
    bgmSrc = nextSrc;
    bgm.pause();
    bgm.src = nextSrc;
    try { bgm.load(); } catch { /* ignore */ }
  }
  playBgmRobust();
};

const applyDanceAudio = () => {
  if (!bgmActive || muted) {
    bgm?.pause();
    return;
  }
  // 深層域(逆再生版が再生対象)では通常BGMを絶対に鳴らさない。ここを deepActive 非対応のままにすると、
  // setAudioMuted/setBgmVolume 後の applyDanceAudio が通常BGMを再開し、逆再生版に重なって二重再生になる
  // (社長報告: 深層で音が止まる→ミュート切替で復帰すると通常BGMが重なる)。通常BGMは止めたまま逆再生版を鳴らし切る。
  if (deepActive) {
    try { bgm?.pause(); } catch { /* ignore */ }
    playDeepRobust();
    return;
  }
  if (danceActive) {
    cancelDanceStop();
    setBgmTrack(danceTrackForLevel(currentDanceLevel), currentDanceLevel);
  } else if (bgmTargetDanceLevel !== 0 && danceStopTimer === null) {
    danceStopTimer = window.setTimeout(() => {
      danceStopTimer = null;
      setBgmTrack(bgmBaseTrack, 0);
    }, 300);
  } else if (bgmTargetDanceLevel === 0) {
    setBgmTrack(bgmBaseTrack, 0);
  }
};

// ダンスの開始/終了。BGM要素1本だけを使い、戦闘曲/ダンス曲でsrcを差し替える。
export const setDanceMode = (active: boolean, level = 2) => {
  ensureBgm();
  if (active) {
    if (danceActive && level === currentDanceLevel) return;
    const levelChanged = danceActive && level !== currentDanceLevel;
    danceActive = true;
    cancelDanceStop(); // 直前の終了で仕込まれた遅延停止タイマーを破棄(深層進入等で applyDanceAudio に到達せず生き残り、再開直後に戦闘曲へ戻る不具合の防止)
    currentDanceLevel = level;
    if (levelChanged) setBgmTrack(danceTrackForLevel(currentDanceLevel), currentDanceLevel);
  } else {
    if (!danceActive) return;
    danceActive = false;
  }
  applyBgm();
};

// ダンス曲↔サークルの開始位相合わせ用(自動アンカー)。
// 戻り値 = いま鳴っているダンス曲の currentTime=0 に対応する壁時計時刻(Date.now 基準・ms)。
// ダンス曲はメインBGM要素の src 差し替え→load()→play() のレイテンシ後に鳴り出すため、
// 「ダンス開始時刻」基準のビートグリッドだと一定オフセットでズレる。曲が実際に鳴り出した
// 瞬間にこの値でグリッド起点を1回だけ合わせ直すと、その可変レイテンシを取り除ける。
// まだ鳴り出していない(差し替え/ロード中・一時停止・先頭で停止)場合は null を返す。
export const getDanceBeatAnchorMs = (): number | null => {
  if (!bgm) return null;
  if (bgmTargetDanceLevel === 0) return null;   // ダンス曲がターゲットでない(戦闘曲のまま)
  if (bgm.paused || bgm.ended) return null;     // まだ再生していない
  if (bgm.readyState < 2) return null;          // HAVE_CURRENT_DATA 未満(デコード前)
  const ct = bgm.currentTime;                   // src差し替え直後は load() で 0 に戻る
  if (!(ct > 0)) return null;                   // 新しいダンス曲が進み始めて初めて > 0 になる
  return Date.now() - ct * 1000;
};

// Route the BGM element through the SFX AudioContext + a gain node, so we can
// actually control its volume on iOS (where HTMLAudioElement.volume is ignored)
// and balance it against the SFX. Falls back to element.volume if unavailable.
// 切り分け(v0.25.266): BGM を WebAudio(MediaElementSource)経由にすると、要素を一度掴んだ後の src 差し替えで
// 無音になる(265で再現)。ここを false にして“要素の素再生(element.volume)”にし、差し替え後に音が出るか確認。
// ?bgmroute=on を付けると従来の WebAudio ルーティングに戻す。
const BGM_USE_WEBAUDIO_ROUTING = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('bgmroute') === 'on';
const ensureBgmRouting = () => {
  if (!BGM_USE_WEBAUDIO_ROUTING) return; // 素再生(element.volume)を使う
  if (bgmRouted) return;
  const ctx = ensureSfxContext();
  ensureBgm();
  if (!ctx || !bgm) return;
  try {
    const source = ctx.createMediaElementSource(bgm);
    bgmGain = ctx.createGain();
    bgmGain.gain.value = bgmVolume * bgmDuck;
    source.connect(bgmGain);
    bgmGain.connect(ctx.destination);
    bgmRouted = true;
  } catch {
    // Routing unsupported — fall back to element volume (works on desktop).
    bgmRouted = false;
  }
};

// 逆再生版BGMを堅牢に再生(playBgmRobust と同方式)。準備ゾーンで先読みしていても、
// 深層inの瞬間にまだデコード未完なら play() が即時に通らないことがあるため、ready 系イベントで再試行する。
// 通常BGMは深層中 pause なので、ここが鳴らないと無音=必ず鳴らし切る。
const playDeepRobust = () => {
  if (!deepBgm || !deepActive || !bgmActive || muted) return;
  const el = deepBgm;
  const token = ++deepPlayToken;
  const tryPlay = () => {
    if (deepBgm !== el || token !== deepPlayToken || !deepActive || !bgmActive || muted) return;
    el.volume = bgmVolume * bgmDuck;
    void el.play().catch(() => {});
  };
  tryPlay();
  const events: Array<keyof HTMLMediaElementEventMap> = ['loadeddata', 'canplay', 'canplaythrough'];
  const cleanup = () => { events.forEach(event => el.removeEventListener(event, onReady)); };
  const onReady = () => { cleanup(); tryPlay(); };
  events.forEach(event => el.addEventListener(event, onReady, { once: true }));
  window.setTimeout(cleanup, 2500);
};

// Drive the single BGM element to the current battle/dance target.
// 深層域(deepActive)では通常BGMを pause(位置保持)し、逆再生版を play する(即時切替)。
const applyBgm = () => {
  ensureBgm();
  if (!bgm) return;
  if (bgmActive && !muted) {
    resumeSfxContext();
    ensureBgmRouting();
    if (deepActive) {
      ++bgmPlayToken;          // 通常BGMの遅延playをキャンセル
      try { bgm.pause(); } catch { /* ignore */ } // 位置は保持(resume時に続きから)
      playDeepRobust();        // 逆再生版を再生(未バッファでも ready イベントで再試行)
    } else {
      try { deepBgm?.pause(); } catch { /* ignore */ }
      applyDanceAudio();
    }
  } else {
    ++bgmPlayToken;
    bgm.pause();
    try { deepBgm?.pause(); } catch { /* ignore */ }
  }
};

const ensureSfxContext = () => {
  if (typeof window === 'undefined') return null;
  if (sfxContext) return sfxContext;
  const AudioContextCtor = window.AudioContext ?? (window as WindowWithWebAudio).webkitAudioContext;
  if (!AudioContextCtor) return null;
  sfxContext = new AudioContextCtor();
  attachAudioRouteRecovery(sfxContext);
  return sfxContext;
};

const resumeSfxContext = () => {
  const context = ensureSfxContext();
  if (!context || context.state !== 'suspended') return;
  void context.resume().catch(() => {});
};

// Bluetooth 等の音声ルート変更で AudioContext が中断/suspend されると SFX も BGM も止まる。
// 可視状態のときに中断を検知したら自動で復帰(resume + BGM再開)。hidden 時は省電力のため触らない。
const recoverAudioRoute = () => {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  const context = sfxContext;
  if (context && context.state !== 'running' && context.state !== 'closed') {
    void context.resume().catch(() => {});
  }
  // BGM(HTMLAudio)はルート変更で止まることがあるので再開(bgmActive/muted/deep を尊重)。
  try {
    if (deepActive) applyBgm();
    else playBgmRobust();
  } catch { /* ignore */ }
};

let audioRouteRecoveryRegistered = false;
const attachAudioRouteRecovery = (context: AudioContext) => {
  // コンテキストの状態変化(中断→可視なら復帰)。
  context.onstatechange = () => {
    const st = context.state as string; // iOS は 'interrupted' を取り得る(型外)
    if (st === 'suspended' || st === 'interrupted') recoverAudioRoute();
  };
  if (audioRouteRecoveryRegistered) return;
  audioRouteRecoveryRegistered = true;
  // デバイス着脱(Bluetooth 接続/切断 等)。ルート確定後に復帰。
  try {
    navigator.mediaDevices?.addEventListener?.('devicechange', () => {
      // ルート切替が落ち着くのを少し待ってから復帰。
      setTimeout(recoverAudioRoute, 250);
    });
  } catch { /* ignore */ }
};

// どのタップ/キー入力でも音声を拾い直す保険(v0.25.2160・実機の「音楽が鳴らない/SEだけ鳴らない」対策)。
// iOSのAudioContext.resume()はユーザージェスチャ中しか効かない場面があり、また自動リロード直後や
// play()拒否(再試行窓2.2sを逃した後)はBGMが止まりっぱなしになる。ジェスチャ毎(1秒スロットル)に
// 「コンテキストresume+鳴っているべきBGMが止まっていればapplyBgm」で確実に復帰させる。
let gestureRecoveryAttached = false;
let lastGestureKickAt = 0;
const kickAudioFromGesture = () => {
  const now = Date.now();
  if (now - lastGestureKickAt < 1000) return;
  lastGestureKickAt = now;
  resumeSfxContext();
  if (bgmActive && !muted) {
    const el = deepActive ? deepBgm : bgm;
    if (el && el.paused) applyBgm();
  }
};
export const attachAudioGestureRecovery = () => {
  if (gestureRecoveryAttached || typeof document === 'undefined') return;
  gestureRecoveryAttached = true;
  document.addEventListener('pointerdown', kickAudioFromGesture, { capture: true, passive: true });
  document.addEventListener('keydown', kickAudioFromGesture, { capture: true });
};

// (旧・合成キックplayDanceKickはv0.25.1373で削除: ダンスのタップ音はサンプル再生
//  playSfx('dance-kick'/'dance-kick-just')に完全移行済みで未参照だった。)

// 無線のノイズ(ザッ…ザザッ)を合成再生。サンプル不要(ホワイトノイズ+バンドパス+途切れエンベロープ)。
// 登場会話の「無線SE」用。アセット無しで「ガガー…」っぽい途切れ音を出す。
export const playRadioStatic = () => {
  if (muted) return;
  const ctx = ensureSfxContext();
  if (!ctx) return;
  resumeSfxContext();
  const t = ctx.currentTime;
  const dur = 1.0;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1700; // 無線っぽい中域
  bp.Q.value = 0.7;
  const gain = ctx.createGain();
  const v = 0.5 * sfxVolume;
  const lo = 0.05 * sfxVolume + 0.0001;
  // 途切れる無線: ザッ→プツ→ザザッ→フェードアウト。
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(v, t + 0.04);
  gain.gain.exponentialRampToValueAtTime(lo, t + 0.30);
  gain.gain.linearRampToValueAtTime(v * 0.9, t + 0.40);
  gain.gain.exponentialRampToValueAtTime(lo, t + 0.66);
  gain.gain.linearRampToValueAtTime(v * 0.6, t + 0.74);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp);
  bp.connect(gain);
  gain.connect(ctx.destination);
  src.start(t);
  src.stop(t + dur);
};

// SFXのURLにクエリを足してキャッシュバスト(同名mp3/wav差し替えでも端末が古い音を掴まないように)。
// v0.25.2161(社長承認): 旧「?v=版数」一律は毎pushで全SEのURLが変わり、更新直後に全音声の
// 再DL+再デコードが走って起動ピーク(=iOSメモリ圧kill・勝手リロードの一因)を押し上げていた。
// ファイル内容ハッシュ(vite.config.tsがビルド時に走査して__SFX_HASHES__を注入)に変更=
// 「差し替えたSEだけ」URLが変わる。表に無いファイルは従来どおり版数でバスト(安全側フォールバック)。
const SFX_BUST = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
const SFX_HASHES: Record<string, string> = typeof __SFX_HASHES__ !== 'undefined' ? __SFX_HASHES__ : {};
const withVersion = (src: string) => {
  const base = import.meta.env.BASE_URL ?? '/';
  const rel = src.startsWith(base) ? src.slice(base.length) : src;
  const bust = SFX_HASHES[rel] ?? SFX_BUST;
  return src + (src.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(bust);
};

const loadSfxBuffer = (key: SfxKey) => {
  const context = ensureSfxContext();
  const config = SFX_SOURCES[key];
  if (!context || !config || sfxBuffers.has(key) || sfxLoading.has(key)) return;

  const loading = fetch(withVersion(config.src))
    .then(response => response.arrayBuffer())
    .then(data => context.decodeAudioData(data))
    .then(buffer => {
      sfxBuffers.set(key, buffer);
    })
    .catch(() => {
      // Missing or undecodable SFX should never interrupt gameplay.
    })
    .finally(() => {
      sfxLoading.delete(key);
    });
  sfxLoading.set(key, loading);
};

// 単発SEの事前ロード(v0.25.2047): オープニング等、本編のwarmSfxBuffersより前に鳴らすSEを
// 個別に先読みする(playSfxは未ロード初回が「ロードだけして無音return」のため、先に積んでおく)。
export const preloadSfx = (key: SfxKey) => loadSfxBuffer(key);

const warmSfxBuffers = () => {
  resumeSfxContext();
  (Object.keys(SFX_SOURCES) as SfxKey[])
    .filter(key => SFX_SOURCES[key]?.warm !== false)
    .forEach(loadSfxBuffer);
};

// ゲーム起動時に音声素材を全てダウンロードし切る。再生はしない(ジェスチャ待ち)。
// SFXバッファ + メインBGM + ダンストラックの読み込み完了を待つ Promise を返す(安全タイムアウト付き)。
const waitAudioReady = (el: HTMLAudioElement | null, timeoutMs = 12000): Promise<void> =>
  new Promise(resolve => {
    if (!el) return resolve();
    if (el.readyState >= 4) return resolve(); // HAVE_ENOUGH_DATA
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      el.removeEventListener('canplaythrough', finish);
      el.removeEventListener('error', finish);
      resolve();
    };
    el.addEventListener('canplaythrough', finish, { once: true });
    el.addEventListener('error', finish, { once: true });
    try { el.load(); } catch { /* ignore */ }
    window.setTimeout(finish, timeoutMs); // ダウンロードが長引いてもローディングを止めない
  });

export const preloadAllAudio = (): Promise<void> => {
  warmSfxBuffers();
  ensureBgm();
  const danceWaits = [1, 2, 3].map(level => {
    const url = danceTrackForLevel(level);
    if (!url || typeof Audio === 'undefined') return Promise.resolve();
    const el = new Audio(url);
    el.preload = 'auto';
    (el as HTMLVideoElement).playsInline = true;
    return waitAudioReady(el);
  });
  const sfxWaits = Array.from(sfxLoading.values()).map(p => p.catch(() => {}));
  // ローディング%(社長指示v0.25.1776): 音声ぶん(メインBGM1+ダンス3+SFX)を登録し、
  // 1ファイル完了ごとに進める。waitAudioReady/sfxWaits は reject しない(then で十分)。
  loadProgressBegin(1 + danceWaits.length + sfxWaits.length);
  const track = <T,>(p: Promise<T>): Promise<T> => p.then(v => { loadProgressDone(); return v; });
  return Promise.all([
    track(waitAudioReady(bgm)),
    Promise.allSettled(danceWaits.map(track)),
    Promise.allSettled(sfxWaits.map(track)),
  ]).then(() => {});
};

export const unlockDanceAudio = () => {
  // Web/iOS Safari only: unlock likely dance BGM resources during the start tap.
  // Native app builds should remove this and use the app audio session/engine instead.
  // 一時要素は解錠専用で使い捨て。最後までミュートのままにする(pause直後に un-mute すると
  // pause が効き切る前の一瞬が鳴り、スタート時に複数曲が重なって聞こえる ← v0.25.282の代償)。
  const urls = [GAME_BGM.default, DANCE_LOOP_TRACKS[1], DANCE_LOOP_TRACKS[2], DANCE_LOOP_TRACKS[3], ...Object.values(REVERSE_BGM)].filter(Boolean);
  for (const url of urls) {
    if (typeof Audio === 'undefined') continue;
    const el = new Audio(url);
    el.preload = 'auto';
    (el as HTMLVideoElement).playsInline = true;
    el.muted = true;
    el.volume = 0;
    void el.play()
      .then(() => {
        el.pause();
        try { el.currentTime = 0; } catch { /* ignore */ }
      })
      .catch(() => { /* 解錠失敗してもゲームは止めない */ });
  }
};

// タイトルBGM(title.mp3)の事前解錠(v0.25.2061): オープニング終了時の setBgmScene('menu') は
// 更新情報OKタップから約40秒後=ユーザー操作の有効期限切れ後の再生になるため、本物の bgm 要素を
// タップのジェスチャ内で作って無音再生→停止し「操作済み」にしておく(後から作った要素はモバイルで
// ブロックされ無音になる=蘇生パートの心拍SEと同じ罠・v0.25.2054)。srcもタイトル曲を先に積んでおく。
export const primeMenuBgm = () => {
  if (bgmActive) return; // 既にBGMが動いている文脈では触らない(再生中の曲を止めないため)
  ensureBgm();
  if (!bgm) return;
  if (bgmSrc !== TITLE_TRACK) {
    bgmSrc = TITLE_TRACK;
    bgmTargetSrc = TITLE_TRACK;
    bgm.src = TITLE_TRACK;
    try { bgm.load(); } catch { /* ignore */ }
  }
  // 解錠後も【ミュートのまま】置く(v0.25.2072硬化): 解除は実際に鳴らす瞬間(playBgmRobust)が行う。
  // pause前にミュートを外す実装だと、play/pauseの競合時に一瞬〜継続の音漏れが起き得る(社長報告
  // 「OK押したらBGM流れちゃう」の再発防止)。ミュートのまま停止しておけば構造的に音は出ない。
  const el = bgm;
  el.muted = true;
  void el.play()
    .then(() => { el.pause(); try { el.currentTime = 0; } catch { /* ignore */ } })
    .catch(() => { /* 解錠失敗でもゲームは止めない(実再生時にplayBgmRobustが再試行) */ });
};

// BGMを曲頭へ巻き戻す(v0.25.2104): タイトル曲が過去に再生済みだと、OP明けの setBgmScene('menu') は
// 同srcのため再ロードが走らず、停止位置(currentTime)から途中再開してしまう(社長報告「蘇生シーンの
// BGM、途中から再生されちゃう」)。OP終了側がこれを呼んでから'menu'を要求する。
export const rewindBgm = () => {
  if (!bgm) return;
  try { bgm.currentTime = 0; } catch { /* ignore */ }
};

export const isAudioMuted = () => muted;

export const getBgmVolume = () => bgmVolume;

export const getSfxVolume = () => sfxVolume;

export const setAudioMuted = (nextMuted: boolean) => {
  muted = nextMuted;
  persistMuted();
  if (!muted) warmSfxBuffers();
  applyBgm();
  applyDanceAudio();
};

export const setBgmVolume = (volume: number) => {
  bgmVolume = Math.max(0, Math.min(1, volume));
  try { localStorage.setItem(BGM_VOLUME_KEY, String(bgmVolume)); } catch { /* ignore */ }
  applyBgm();
  applyDanceAudio();
};

export const setSfxVolume = (volume: number) => {
  sfxVolume = Math.max(0, Math.min(1, volume));
  try { localStorage.setItem(SFX_VOLUME_KEY, String(sfxVolume)); } catch { /* ignore */ }
};

export const setBgmActive = async (nextActive: boolean) => {
  bgmActive = nextActive;
  if (bgmActive && !muted) warmSfxBuffers();
  applyBgm();
  applyDanceAudio();
};

// 画面に応じてBGMを切替: menu=タイトル曲(public/audio/title.mp3) / game=ステージ曲 / off=停止。
// menu→game でステージ曲へ、game→menu でタイトル曲へ自動で差し替わる(applyDanceAudio が bgmBaseTrack を流す)。
// ブラウザの自動再生制限で menu の初回はユーザー操作まで鳴らないことがあるため、初回タップで再度呼ぶ。
export const setBgmScene = (scene: 'menu' | 'game' | 'off', variant: string = 'default') => {
  if (scene === 'off') { releaseDeepReverseBgm(); void setBgmActive(false); return; }
  if (scene === 'game') {
    if (variant !== currentGameVariant) { releaseDeepReverseBgm(); currentGameVariant = variant; }
  } else {
    releaseDeepReverseBgm(); // メニューへ戻る=ステージ離脱: 逆再生版を解放
  }
  bgmBaseTrack = scene === 'menu'
    ? TITLE_TRACK
    : (GAME_BGM[variant] ?? GAME_BGM.default); // ステージ別BGM(未割当はdefault=stage1)
  void setBgmActive(true);
};

// 選択ステージのBGMをブラウザキャッシュへ先読みする(ステージ開始時のロード遅延対策・社長v0.25.1568)。
// preloadAllAudio は default(=stage1)のBGMしか温めないため、非デフォルトステージ(stage3〜6/lab)は
// ステージ開始の瞬間に初めてダウンロード=BGM開始が遅延していた。開始前(startGame)にこれを呼び、
// 使い捨て要素で当該mp3をHTTPキャッシュへ落としておく(本番の bgm 要素は同URL=キャッシュから即ロード)。
let stageBgmPreloadEl: HTMLAudioElement | null = null;
let stageBgmPreloadSrc = '';
export const preloadStageBgm = (variant: string) => {
  if (typeof Audio === 'undefined') return;
  const url = GAME_BGM[variant] ?? GAME_BGM.default;
  if (url === stageBgmPreloadSrc) return; // 同一曲は再先読みしない
  stageBgmPreloadSrc = url;
  if (stageBgmPreloadEl) { try { stageBgmPreloadEl.pause(); } catch { /* ignore */ } } // 前の先読み要素を解放(pauseはフェッチを中断しない)
  const el = new Audio(url);
  el.preload = 'auto';
  (el as HTMLVideoElement).playsInline = true;
  el.muted = true;
  try { el.load(); } catch { /* ignore */ }
  stageBgmPreloadEl = el; // フェッチ完了までGCで消えないよう参照を保持(次の先読みで置き換わる)
};

// --- 深層域BGM(逆再生版)切替 ----------------------------------------------
// 準備ゾーンで先読み(pause)→深層inで play/pause トグル。クロスフェード無し・無音ほぼ無し。
// 現在ステージに逆再生版が無ければ(lab等)すべて no-op。
const reverseSrcForVariant = (): string | null => REVERSE_BGM[currentGameVariant] ?? null;

// 準備ゾーン進入: 逆再生版を生成&ロードして pause(バッファ確保)。同 src なら何もしない。
export const prepareDeepReverseBgm = () => {
  if (typeof Audio === 'undefined') return;
  const src = reverseSrcForVariant();
  if (!src) return;
  if (deepBgm && deepBgmSrc === src) return;
  releaseDeepReverseBgm();
  deepBgmSrc = src;
  deepBgm = new Audio(src);
  deepBgm.loop = true;          // 深層滞在が長い前提=ループ
  deepBgm.preload = 'auto';
  (deepBgm as HTMLVideoElement).playsInline = true;
  deepBgm.volume = bgmVolume * bgmDuck;
  try { deepBgm.load(); } catch { /* ignore */ } // pause のまま待機(明示playしない)
};

// 深層 in: 通常BGMを pause(位置保持) + 逆再生版 play(即時切替)。
export const enterDeepReverseBgm = () => {
  if (deepActive) return;
  if (!deepBgm) prepareDeepReverseBgm();
  if (!deepBgm) return; // 逆再生版が無いステージ
  deepActive = true;
  applyBgm();
};

// 深層 out(準備ゾーンへ): 逆再生版 pause + 通常BGM resume(続きから)。
export const exitDeepReverseBgm = () => {
  if (!deepActive) return;
  deepActive = false;
  applyBgm();
};

// 準備ゾーンより浅く戻る: 逆再生版を stop/解放(メモリ開放)。
export const releaseDeepReverseBgm = () => {
  const wasDeep = deepActive;
  deepActive = false;
  if (deepBgm) {
    try { deepBgm.pause(); } catch { /* ignore */ }
    try { deepBgm.removeAttribute('src'); deepBgm.load(); } catch { /* ignore */ }
    deepBgm = null;
  }
  deepBgmSrc = '';
  if (wasDeep) applyBgm(); // 深層中に解放されたら通常BGMへ戻す
};

// 社長決定(v0.25.1566): **PEAK時はBGMを変えない**=PEAK重ねBGM(peak-layer.mp3=紅き夜/関所で鳴る打楽器)を
// **既定OFF**にする。理由=peak-layerは通常BGMに重ねる「2本目のHTMLAudio同時再生」で、この端末(iOS Safari)では
// 描画を引っかからせる(紅き夜が最初から重い原因=v0.25.1563で実証。ENGINEERING_NOTES音声節参照)。既定でBGMは
// PEAK/紅き夜でも通常のまま(重ね無し・ダッキング無し)。`?peaklayer=1`で従来の重ねを試聴可(A/B用に温存)。
const PEAK_LAYER_DISABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('peaklayer') !== '1';
const PEAK_LAYER_VOLUME = 0.9; // 社長指示: 0.55→0.9(+64%)
const PEAK_BGM_DUCK = 0.4;      // PEAK中は通常BGMを落とす(社長指示・v0.25.1290=0.65→さらに下げてほしいとの追加指示で0.4へ)。レイヤーのフェードと同時にランプ。
const PEAK_LAYER_FADE_MS = 700;

const ensurePeakLayer = (): HTMLAudioElement | null => {
  if (peakLayerEl) return peakLayerEl;
  if (typeof Audio === 'undefined') return null;
  const el = new Audio(PEAK_LAYER_TRACK);
  // v0.25.1375(社長指示「ピークは1回転だけ」): ループさせず1周で終える。PEAK窓(通常コマ)が
  // 続いていても打楽器は1回きり。自然終了時はBGMダッキングを滑らかに戻す(戻さないと
  // 打楽器なしのままBGMだけ小さい状態がコマ終端まで続いてしまう)。
  el.loop = false;
  el.addEventListener('ended', () => { fadePeakLayer(0, 1); });
  el.preload = 'auto';
  (el as HTMLVideoElement).playsInline = true;
  el.volume = 0;
  peakLayerEl = el;
  return el;
};

// 現在の bgmDuck を通常/深層BGMへ即時適用(フェード中に毎ステップ呼ぶ)。
const applyDuckedBgmVolume = () => {
  const v = bgmVolume * bgmDuck;
  if (bgmGain) bgmGain.gain.value = v;
  else if (bgm) bgm.volume = v;
  if (deepBgm) deepBgm.volume = v;
};

const fadePeakLayer = (target: number, duckTarget: number) => {
  const el = peakLayerEl;
  if (!el) return;
  if (peakLayerFadeTimer != null) { clearInterval(peakLayerFadeTimer); peakLayerFadeTimer = null; }
  const steps = 14;
  const start = el.volume;
  const startDuck = bgmDuck;
  let i = 0;
  peakLayerFadeTimer = window.setInterval(() => {
    i++;
    const t = i / steps;
    el.volume = Math.max(0, Math.min(1, start + (target - start) * t));
    bgmDuck = startDuck + (duckTarget - startDuck) * t;
    applyDuckedBgmVolume();
    if (i >= steps) {
      el.volume = target;
      bgmDuck = duckTarget;
      applyDuckedBgmVolume();
      if (peakLayerFadeTimer != null) { clearInterval(peakLayerFadeTimer); peakLayerFadeTimer = null; }
      if (target <= 0) { try { el.pause(); } catch { /* ignore */ } }
    }
  }, PEAK_LAYER_FADE_MS / steps);
};

// active: 襲撃(台本の関所フェーズ)中か紅き月中か。呼び出し側(useGameLoop)が判定を持つ。
// 通常BGMを止めずに重ね、同時にBGMを少しダッキング(社長要望: PEAK突入/終了を体で感じさせる)。
export const setPeakLayer = (active: boolean) => {
  if (PEAK_LAYER_DISABLED) return; // ?peaklayer=0 診断: 重ねBGMを一切鳴らさない(起動時フラグ=最初から未再生)
  const shouldPlay = active && !muted && bgmActive;
  if (shouldPlay !== peakLayerActive) {
    peakLayerActive = shouldPlay;
    const el = ensurePeakLayer();
    if (!el) { bgmDuck = 1; applyDuckedBgmVolume(); return; }
    if (shouldPlay) {
      try { el.currentTime = 0; } catch { /* ignore */ } // 1回転仕様: 各PEAK窓の頭から鳴らし直す
      void el.play().catch(() => { /* ignore: unlocks on next user gesture like other tracks */ });
      fadePeakLayer(PEAK_LAYER_VOLUME * bgmVolume, PEAK_BGM_DUCK);
    } else {
      fadePeakLayer(0, 1);
    }
  } else if (shouldPlay && peakLayerEl && peakLayerFadeTimer == null) {
    peakLayerEl.volume = PEAK_LAYER_VOLUME * bgmVolume; // 稼働中の音量スライダー変更に追従
  }
};

// 電池対策: 裏(タブ/アプリ非表示)に回ったら BGM を一時停止し、復帰で再開(scene状態は保持)。
// HTMLAudioElement は hidden でも鳴り続け電池を食うため明示停止。SFXのAudioContextは
// ブラウザが hidden で自動 suspend するので復帰時に resume するだけ。
export const setAudioSuspended = (suspended: boolean) => {
  if (suspended) {
    try { bgm?.pause(); } catch { /* ignore */ }
    try { deepBgm?.pause(); } catch { /* ignore */ } // 深層域の逆再生版も止める(電池対策)
    try { peakLayerEl?.pause(); } catch { /* ignore */ }
  } else {
    resumeSfxContext();
    if (deepActive) applyBgm();   // 深層中は逆再生版を再開(通常BGMは pause のまま)
    else playBgmRobust();         // bgmActive/muted を尊重して通常BGM復帰
    // 1回転仕様: 1周鳴り終えた後(ended)にタブ復帰しても再演奏しない(途中中断だけ再開する)。
    if (peakLayerActive && peakLayerEl && !peakLayerEl.ended) { try { void peakLayerEl.play().catch(() => {}); } catch { /* ignore */ } }
  }
};

// ダンスタイム中はリズムに乗りやすいよう近接ダメージ音(スラッシュ/メレー)を鳴らさない。
const DANCE_MUTED_SFX = new Set<SfxKey>(['slash-damage', 'melee']);

// gainMult: 距離減衰など、その1回の再生だけ音量を倍率調整したい時に渡す(既定1)。0以下なら鳴らさない。
// durationMsOverride: その1回の再生だけ再生長を上書き(例: リロードSEを武器のリロード時間で止める)。
// 指定時は config.maxDurationMs より優先。fadeOutMs が設定されていれば終端が丸まる(ブツ切り防止)。
export const playSfx = (key: SfxKey, gainMult = 1, durationMsOverride?: number) => {
  if (muted) return;
  if (gainMult <= 0) return;
  if (danceActive && DANCE_MUTED_SFX.has(key)) return;
  const config = SFX_SOURCES[key];
  if (!config) return;

  const now = typeof window === 'undefined' ? Date.now() : (window.performance?.now() ?? Date.now());
  const lastPlayedAt = sfxLastPlayedAt.get(key) ?? 0;
  if (config.minIntervalMs && now - lastPlayedAt < config.minIntervalMs) return;

  const context = ensureSfxContext();
  if (!context) return;
  resumeSfxContext();

  const buffer = sfxBuffers.get(key);
  if (!buffer) {
    loadSfxBuffer(key);
    return;
  }

  sfxLastPlayedAt.set(key, now);
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  source.playbackRate.value = config.playbackRate ?? 1;
  gain.gain.value = (config.volume ?? 1) * sfxVolume * gainMult;
  source.connect(gain);
  gain.connect(context.destination);

  const offset = Math.min(config.startAt ?? 0, Math.max(0, buffer.duration - 0.001));
  const capMs = durationMsOverride ?? config.maxDurationMs;
  const duration = capMs
    ? Math.min(capMs / 1000, Math.max(0.001, buffer.duration - offset))
    : undefined;

  // 長尺SEのフェードアウト: 再生終端(duration か曲尾)へ向けて fadeOutMs でゲインを0へ。
  if (config.fadeOutMs) {
    const playLen = duration ?? Math.max(0.001, buffer.duration - offset);
    const fade = Math.min(config.fadeOutMs / 1000, playLen);
    const peak = (config.volume ?? 1) * sfxVolume * gainMult;
    const t0 = context.currentTime;
    gain.gain.setValueAtTime(peak, t0 + Math.max(0, playLen - fade));
    gain.gain.linearRampToValueAtTime(0, t0 + playLen);
  }

  try {
    if (duration) {
      source.start(0, offset, duration);
    } else {
      source.start(0, offset);
    }
  } catch {
    // Ignore playback failures; gameplay must stay responsive.
  }
};

// ダンスビートB方式(v0.25.1339): 指定した AudioContext 時刻に予約再生する。playSfx とほぼ同じ経路
// (バッファ/ゲイン/接続)だが、即時(start(0,...))ではなく指定時刻に start する点だけが違う。
// minIntervalMs のスロットル/sfxLastPlayedAt 更新はしない(呼び出し側=danceBeat.tsが「次の1拍だけ」
// 予約するため二重発火はそもそも起きない。スロットルを混ぜるとむしろ正規の拍を落としかねない)。
export const playSfxAt = (key: SfxKey, atCtxTime: number) => {
  if (muted) return;
  const config = SFX_SOURCES[key];
  if (!config) return;
  const context = ensureSfxContext();
  if (!context) return;
  resumeSfxContext();
  const buffer = sfxBuffers.get(key);
  if (!buffer) { loadSfxBuffer(key); return; }
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  source.playbackRate.value = config.playbackRate ?? 1;
  gain.gain.value = (config.volume ?? 1) * sfxVolume;
  source.connect(gain);
  gain.connect(context.destination);
  const offset = Math.min(config.startAt ?? 0, Math.max(0, buffer.duration - 0.001));
  const when = Math.max(context.currentTime, atCtxTime); // 過去時刻はcurrentTimeへクランプ(即時再生)
  try {
    source.start(when, offset);
  } catch {
    // Ignore playback failures; gameplay must stay responsive.
  }
};

// ダンスビートB方式: 呼び出し側(useGameLoop)はDate.now基準の壁時計時刻(リングと同じ時計)だけを
// 持てばよく、AudioContext時刻への変換はここに閉じ込める(音声内部実装をuseGameLoopへ漏らさない)。
// 変換は呼ぶたびにやり直す(壁時計とオーディオクロックの緩やかなドリフトを蓄積させないため)。
export const scheduleDanceBeatKick = (beatAtMs: number) => {
  const context = ensureSfxContext();
  if (!context) return;
  const ctxTime = context.currentTime + (beatAtMs - Date.now()) / 1000;
  playSfxAt('dance-kick', ctxTime);
};

// --- Hurricane rumble: a continuous low "ゴゴゴゴ" bed that runs only while a
// whip-hurricane (or reaper suction) is active. The source clip is ~2.4s, so a
// hard native loop pulses at the seam. Instead we crossfade OVERLAPPING voices:
// each voice fades in while the previous fades out, so the tail of one loop
// overlaps the head of the next for a seamless bed (社長要望: 終わりかけに次の
// ループを重ねる). A short look-ahead timer schedules voices a little before they
// are needed; it only runs while active (event-bounded), so cost is negligible.
// Driven every frame from useGameLoop with the current boolean; idempotent so it
// starts/stops on the transition only.
type HurricaneVoice = { source: AudioBufferSourceNode; gain: GainNode; endsAt: number };
let hurricaneActive = false;
let hurricaneVoices: HurricaneVoice[] = [];
let hurricaneTimer: number | null = null;
let hurricaneNextStartAt = 0;            // context-time the next voice should begin
const HURRICANE_VOLUME = 0.7;
const HURRICANE_CROSSFADE = 0.6;         // tail/head overlap per loop (s)
const HURRICANE_SCHED_AHEAD = 1.0;       // queue voices this far ahead (s)

// Schedule one overlapping voice starting at startAt. Returns how far to advance
// the next voice start (loopLen − crossfade), or null if the buffer isn't ready.
const scheduleHurricaneVoice = (context: AudioContext, startAt: number): number | null => {
  const buffer = sfxBuffers.get('hurricane');
  if (!buffer) { loadSfxBuffer('hurricane'); return null; }
  const dur = buffer.duration;
  const xf = Math.min(HURRICANE_CROSSFADE, dur / 2);
  const vol = HURRICANE_VOLUME * sfxVolume;
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  source.connect(gain);
  gain.connect(context.destination);
  // Fade in over the crossfade, hold, then fade the tail out so the next voice
  // (which starts xf before this one ends) covers the seam.
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(vol, startAt + xf);
  gain.gain.setValueAtTime(vol, startAt + dur - xf);
  gain.gain.linearRampToValueAtTime(0, startAt + dur);
  try { source.start(startAt); source.stop(startAt + dur + 0.05); } catch { /* ignore */ }
  hurricaneVoices.push({ source, gain, endsAt: startAt + dur });
  return dur - xf;
};

const pumpHurricane = () => {
  hurricaneTimer = null;
  if (!hurricaneActive) return;
  const context = ensureSfxContext();
  if (!context) { hurricaneTimer = window.setTimeout(pumpHurricane, 120); return; }
  resumeSfxContext();
  const now = context.currentTime;
  hurricaneVoices = hurricaneVoices.filter(v => v.endsAt > now - 0.1); // drop finished
  if (hurricaneNextStartAt < now) hurricaneNextStartAt = now;
  let guard = 0;
  while (hurricaneNextStartAt < now + HURRICANE_SCHED_AHEAD && guard++ < 8) {
    const advance = scheduleHurricaneVoice(context, hurricaneNextStartAt);
    if (advance == null) { hurricaneTimer = window.setTimeout(pumpHurricane, 100); return; } // buffer not ready: retry
    hurricaneNextStartAt += advance;
  }
  hurricaneTimer = window.setTimeout(pumpHurricane, 200);
};

const stopHurricaneNode = () => {
  const context = sfxContext;
  const voices = hurricaneVoices;
  hurricaneVoices = [];
  hurricaneNextStartAt = 0;
  if (hurricaneTimer != null) { clearTimeout(hurricaneTimer); hurricaneTimer = null; }
  if (context) {
    const now = context.currentTime;
    for (const v of voices) {
      try { v.gain.gain.cancelScheduledValues(now); v.gain.gain.setTargetAtTime(0, now, 0.12); } catch { /* ignore */ }
      try { v.source.stop(now + 0.45); } catch { /* ignore */ }
    }
  } else {
    for (const v of voices) { try { v.source.stop(); } catch { /* ignore */ } }
  }
};

export const setHurricaneRumble = (active: boolean) => {
  const shouldPlay = active && !muted;
  if (shouldPlay === hurricaneActive) return; // idempotent: cheap per-frame no-op
  hurricaneActive = shouldPlay;
  if (shouldPlay) { hurricaneNextStartAt = 0; pumpHurricane(); }
  else stopHurricaneNode();
};

// --- Heartbeat bed: 瀕死(低HP)中だけ回す心音ループ(社長提供・約1.4s)。
// v0.25.1290: クロスフェード重ね方式(ハリケーン流)だと、リズム素材の拍が重なって
// 「ブブブブ」と連打に化ける(社長報告)ため、ネイティブループ1本(source.loop=true)+
// gainのフェードイン/アウトに変更。心音は拍の隙間があるので継ぎ目は自然に馴染む。
// useGameLoop から毎フレーム bool で駆動、idempotent なので遷移時だけ実処理が走る。
let heartbeatActive = false;
let heartbeatSource: AudioBufferSourceNode | null = null;
let heartbeatGain: GainNode | null = null;
let heartbeatStartTimer: number | null = null;
const HEARTBEAT_VOLUME = 0.55; // 私案・実機調整前提(まだ緊張を煽りすぎない控えめな音量から開始)
const HEARTBEAT_FADE_S = 0.25;
// 社長決定(v0.25.1567): 心音ループは**既定OFF**(「重くはないが、これもいらない」)。心音は連続ループの
// Web Audioバッファ(source.loop=true)=ダンスループと同クラスの地雷候補でもあり、要らないなら鳴らさないのが安全。
// `?heartbeat=1`で従来の心音を試聴のみ可(温存)。既定でピンチ中も心音は鳴らない。
const HEARTBEAT_DISABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('heartbeat') !== '1';

const startHeartbeatSource = () => {
  heartbeatStartTimer = null;
  if (!heartbeatActive || heartbeatSource) return;
  const context = ensureSfxContext();
  if (!context) { heartbeatStartTimer = window.setTimeout(startHeartbeatSource, 150); return; }
  resumeSfxContext();
  const buffer = sfxBuffers.get('heartbeat');
  if (!buffer) { loadSfxBuffer('heartbeat'); heartbeatStartTimer = window.setTimeout(startHeartbeatSource, 120); return; }
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  source.loop = true; // 1本だけをネイティブループ(重ね無し=拍が二重にならない)
  source.connect(gain);
  gain.connect(context.destination);
  const now = context.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(HEARTBEAT_VOLUME * sfxVolume, now + HEARTBEAT_FADE_S);
  try { source.start(now); } catch { /* ignore */ }
  heartbeatSource = source;
  heartbeatGain = gain;
};

const stopHeartbeatNode = () => {
  if (heartbeatStartTimer != null) { clearTimeout(heartbeatStartTimer); heartbeatStartTimer = null; }
  const context = sfxContext;
  const source = heartbeatSource;
  const gain = heartbeatGain;
  heartbeatSource = null;
  heartbeatGain = null;
  if (!source) return;
  if (context && gain) {
    const now = context.currentTime;
    try { gain.gain.cancelScheduledValues(now); gain.gain.setTargetAtTime(0, now, 0.12); } catch { /* ignore */ }
    try { source.stop(now + 0.45); } catch { /* ignore */ }
  } else {
    try { source.stop(); } catch { /* ignore */ }
  }
};

// active: 瀕死(低HP)状態か。呼び出し側(useGameLoop)が閾値判定を持つ(音声側は判定を持たない)。
// OFFは300msの猶予付き(ポーズ/回復瞬間の1フレームのチラつきでループを殺して再始動→連打化しない)。
// 猶予中にONへ戻れば同じソースをそのまま継続(新ソースを作らない)。
let heartbeatStopTimer: number | null = null;
export const setHeartbeatLoop = (active: boolean) => {
  if (HEARTBEAT_DISABLED) return; // ?heartbeat=0 診断: 心音ループを一切鳴らさない(連続バッファ地雷の切り分け)
  const shouldPlay = active && !muted;
  if (shouldPlay) {
    if (heartbeatStopTimer != null) { clearTimeout(heartbeatStopTimer); heartbeatStopTimer = null; }
    if (heartbeatActive) return; // idempotent: cheap per-frame no-op
    heartbeatActive = true;
    startHeartbeatSource();
  } else {
    if (!heartbeatActive || heartbeatStopTimer != null) return;
    heartbeatStopTimer = window.setTimeout(() => {
      heartbeatStopTimer = null;
      heartbeatActive = false;
      stopHeartbeatNode();
    }, 300);
  }
};

// Random zombie death grunt on a kill. A shared throttle stops mass deaths
// (e.g. a spray of bullets) from stacking into a wall of grunts.
const ENEMY_DEATH_KEYS: SfxKey[] = ['zombie-1', 'zombie-2', 'zombie-3', 'zombie-4'];
const ENEMY_DEATH_MIN_INTERVAL_MS = 70;
let lastEnemyDeathAt = 0;

export const playEnemyDeath = () => {
  if (muted) return;
  const now = window.performance?.now() ?? Date.now();
  if (now - lastEnemyDeathAt < ENEMY_DEATH_MIN_INTERVAL_MS) return;
  lastEnemyDeathAt = now;
  const key = ENEMY_DEATH_KEYS[Math.floor(Math.random() * ENEMY_DEATH_KEYS.length)];
  playSfx(key);
};
