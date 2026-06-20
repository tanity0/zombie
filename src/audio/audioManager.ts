// Central audio controls. BGM uses HTMLAudioElement so mobile browsers keep
// their normal media route; short SFX use Web Audio to avoid frame hitches.

const MUTED_KEY = 'zombie:audioMuted';
const LEGACY_BGM_MUTED_KEY = 'zombie:bgmMuted';
const BGM_VOLUME_KEY = 'zombie:bgmVolume';
const SFX_VOLUME_KEY = 'zombie:sfxVolume';
const DEFAULT_BGM_VOLUME = 1;
const DEFAULT_SFX_VOLUME = 1;

// ステージBGM。stage1 に差し替え(旧 rotten-iron-march / rusting-grave-circuit は public に残置)。
// 将来ステージ別BGM(stage2-4)を足す場合はここに並べる。
const BGM_TRACKS = [
  `${import.meta.env.BASE_URL}audio/stage1.mp3`,
];
// 屋内(研究施設)ステージ専用BGM。public/audio/lab-stage.mp3。
const LAB_TRACK = `${import.meta.env.BASE_URL}audio/lab-stage.mp3`;
// タイトル画面のBGM(メニュー中だけ流す)。配置先: public/audio/title.mp3(無い間は無音=クラッシュなし)。
const TITLE_TRACK = `${import.meta.env.BASE_URL}audio/title.mp3?v=${encodeURIComponent(typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev')}`;
// ダンスタイム(四神舞)中だけ流す曲。四神舞レベルでBPMが変わる(Lv1=100/Lv2=120/Lv3=140)。
// v0.25.284: 8小節ループの継ぎ目が要素 loop=true でぶつ切りになるため、軽量(128k/48k)のフル尺曲に戻す。
// フル尺なら継ぎ目(末尾→先頭)は3〜4分に1回でダンス中はほぼ当たらない。要素再生なので軽い。
const DANCE_LOOP_TRACKS: Record<number, string> = {
  1: `${import.meta.env.BASE_URL}audio/dance-100.mp3?v=${encodeURIComponent(typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev')}`,
  2: `${import.meta.env.BASE_URL}audio/dance-120.mp3?v=${encodeURIComponent(typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev')}`,
  3: `${import.meta.env.BASE_URL}audio/dance-140.mp3?v=${encodeURIComponent(typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev')}`,
};
let currentDanceLevel = 2; // 現在ダンスループに使っているレベル

type SfxConfig = {
  src: string;
  volume?: number;
  minIntervalMs?: number;
  playbackRate?: number;
  startAt?: number;
  maxDurationMs?: number;
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
  | 'shotgun-fire'
  | 'rifle-fire'
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
  | 'dance-kick'
  | 'heavy-impact'
  | 'whip-hit'
  | 'whip-swing'
  | 'anchor-plant'
  | 'boomerang-throw'
  | 'summon';

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
    volume: 0.78,
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
    src: `${import.meta.env.BASE_URL}audio/sfx/handgun-fire.mp3`,
    volume: 0.52,
    minIntervalMs: 24,
  },
  'shotgun-fire': {
    src: `${import.meta.env.BASE_URL}audio/sfx/shotgun-fire.mp3`,
    volume: 0.66,
    minIntervalMs: 32,
  },
  'rifle-fire': {
    src: `${import.meta.env.BASE_URL}audio/sfx/rifle-fire.mp3`,
    volume: 0.62,
    minIntervalMs: 28,
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
  reload: {
    src: `${import.meta.env.BASE_URL}audio/sfx/reload.mp3`,
    volume: 0.86,
  },
  // Counter (bullet parry) success — deliberately a touch louder than the rest.
  counter: {
    src: `${import.meta.env.BASE_URL}audio/sfx/counter.mp3`,
    volume: 0.88,
    minIntervalMs: 120,
  },
  // Melee finisher on a normal enemy, and finisher damage dealt to a boss.
  'melee-finish': {
    src: `${import.meta.env.BASE_URL}audio/sfx/kill.mp3`,
    volume: 0.92,
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
  // ダンスフロアのジャスト成功(タップ/フリック両方)で鳴らすキックドラム。
  'dance-kick': { src: `${import.meta.env.BASE_URL}audio/sfx/kick-drum.mp3`, volume: 0.95, minIntervalMs: 60 },
  // 盾バッシュ命中 / ジャンプ攻撃の着地(社長提供SE)。音が小さめなのでゲインで増幅(0.9→1.8)。
  'heavy-impact': { src: `${import.meta.env.BASE_URL}audio/sfx/heavy-impact.mp3`, volume: 1.8, minIntervalMs: 60 },
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
};

let bgm: HTMLAudioElement | null = null;
let bgmGain: GainNode | null = null; // BGM routed through WebAudio so its volume
let bgmRouted = false;               // is controllable on iOS (element.volume isn't)
let bgmActive = false;
let muted = false;
let bgmVolume = DEFAULT_BGM_VOLUME;
let sfxVolume = DEFAULT_SFX_VOLUME;
let sfxContext: AudioContext | null = null;

const sfxBuffers = new Map<SfxKey, AudioBuffer>();
const sfxLoading = new Map<SfxKey, Promise<void>>();
const sfxLastPlayedAt = new Map<SfxKey, number>();

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
let bgmSrc = BGM_TRACKS[0];
const ensureBgm = () => {
  if (bgm || typeof Audio === 'undefined') return;
  bgm = new Audio(bgmSrc);
  bgm.loop = true;
  bgm.preload = 'auto';
  bgm.playsInline = true;
  bgm.volume = 1; // real level is set by the WebAudio gain (iOS-safe)
};

// --- ダンスタイム(四神舞) -------------------------------------------------
// v0.25.279でレベル別の固定HTMLAudioElementは音が出たが、実機ダンス中だけ約20fpsまで落ちた。
// v0.25.280の単一BGM要素src差し替え + 事前解錠はWeb/iOS Safari向けの暫定対策。
// ネイティブアプリへ移行する時は、この解錠/src差し替え処理を削り、アプリ側の音声エンジンでBGM切替を実装する。
let danceActive = false;

let bgmTargetSrc = BGM_TRACKS[0];
let bgmBaseTrack = BGM_TRACKS[0];   // 非ダンス時の基準曲(menu=タイトル / game=ステージ)
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
    if (bgmGain) bgmGain.gain.value = bgmVolume;
    else bgm.volume = bgmVolume;
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
    bgmGain.gain.value = bgmVolume;
    source.connect(bgmGain);
    bgmGain.connect(ctx.destination);
    bgmRouted = true;
  } catch {
    // Routing unsupported — fall back to element volume (works on desktop).
    bgmRouted = false;
  }
};

// Drive the single BGM element to the current battle/dance target.
const applyBgm = () => {
  ensureBgm();
  if (!bgm) return;
  if (bgmActive && !muted) {
    resumeSfxContext();
    ensureBgmRouting();
    applyDanceAudio();
  } else {
    ++bgmPlayToken;
    bgm.pause();
  }
};

const ensureSfxContext = () => {
  if (typeof window === 'undefined') return null;
  if (sfxContext) return sfxContext;
  const AudioContextCtor = window.AudioContext ?? (window as WindowWithWebAudio).webkitAudioContext;
  if (!AudioContextCtor) return null;
  sfxContext = new AudioContextCtor();
  return sfxContext;
};

const resumeSfxContext = () => {
  const context = ensureSfxContext();
  if (!context || context.state !== 'suspended') return;
  void context.resume().catch(() => {});
};

// 太いバスドラム(キック)を合成再生。サンプル不要(サイン波のピッチ落ち+速い減衰)。
// ダンスのタップ(拍踏み)音として使う。
export const playDanceKick = () => {
  if (muted) return;
  const ctx = ensureSfxContext();
  if (!ctx) return;
  resumeSfxContext();
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  // ピッチを高め→低めへ滑らせて「ドンッ」という太いアタック。
  osc.frequency.setValueAtTime(165, t);
  osc.frequency.exponentialRampToValueAtTime(46, t + 0.11);
  const vol = 0.95 * sfxVolume;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(vol, t + 0.006);       // パンチの立ち上がり
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.34); // 太く長めの減衰
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.36);
};

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

const loadSfxBuffer = (key: SfxKey) => {
  const context = ensureSfxContext();
  const config = SFX_SOURCES[key];
  if (!context || !config || sfxBuffers.has(key) || sfxLoading.has(key)) return;

  const loading = fetch(config.src)
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
    el.playsInline = true;
    return waitAudioReady(el);
  });
  const sfxWaits = Array.from(sfxLoading.values()).map(p => p.catch(() => {}));
  return Promise.all([
    waitAudioReady(bgm),
    Promise.allSettled(danceWaits),
    Promise.allSettled(sfxWaits),
  ]).then(() => {});
};

export const unlockDanceAudio = () => {
  // Web/iOS Safari only: unlock likely dance BGM resources during the start tap.
  // Native app builds should remove this and use the app audio session/engine instead.
  // 一時要素は解錠専用で使い捨て。最後までミュートのままにする(pause直後に un-mute すると
  // pause が効き切る前の一瞬が鳴り、スタート時に複数曲が重なって聞こえる ← v0.25.282の代償)。
  const urls = [BGM_TRACKS[0], DANCE_LOOP_TRACKS[1], DANCE_LOOP_TRACKS[2], DANCE_LOOP_TRACKS[3]].filter(Boolean);
  for (const url of urls) {
    if (typeof Audio === 'undefined') continue;
    const el = new Audio(url);
    el.preload = 'auto';
    el.playsInline = true;
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
export const setBgmScene = (scene: 'menu' | 'game' | 'off', variant: 'default' | 'lab' = 'default') => {
  if (scene === 'off') { void setBgmActive(false); return; }
  bgmBaseTrack = scene === 'menu'
    ? TITLE_TRACK
    : (variant === 'lab' ? LAB_TRACK : BGM_TRACKS[0]); // 屋内ステージは専用BGM
  void setBgmActive(true);
};

// ダンスタイム中はリズムに乗りやすいよう近接ダメージ音(スラッシュ/メレー)を鳴らさない。
const DANCE_MUTED_SFX = new Set<SfxKey>(['slash-damage', 'melee']);

export const playSfx = (key: SfxKey) => {
  if (muted) return;
  if (danceActive && DANCE_MUTED_SFX.has(key)) return;
  const config = SFX_SOURCES[key];
  if (!config) return;

  const now = window.performance?.now() ?? Date.now();
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
  gain.gain.value = (config.volume ?? 1) * sfxVolume;
  source.connect(gain);
  gain.connect(context.destination);

  const offset = Math.min(config.startAt ?? 0, Math.max(0, buffer.duration - 0.001));
  const duration = config.maxDurationMs
    ? Math.min(config.maxDurationMs / 1000, Math.max(0.001, buffer.duration - offset))
    : undefined;

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
