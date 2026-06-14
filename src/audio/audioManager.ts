// Central audio controls. BGM uses HTMLAudioElement so mobile browsers keep
// their normal media route; short SFX use Web Audio to avoid frame hitches.

const MUTED_KEY = 'zombie:audioMuted';
const LEGACY_BGM_MUTED_KEY = 'zombie:bgmMuted';
const BGM_VOLUME_KEY = 'zombie:bgmVolume';
const SFX_VOLUME_KEY = 'zombie:sfxVolume';
const DEFAULT_BGM_VOLUME = 1;
const DEFAULT_SFX_VOLUME = 1;

const BGM_TRACKS = [
  `${import.meta.env.BASE_URL}audio/rotten-iron-march.mp3`,
  `${import.meta.env.BASE_URL}audio/rusting-grave-circuit.mp3`,
];
// ダンスタイム(四神舞)中だけ流すトラック。四神舞レベルでBPMが変わる(Lv1=100/Lv2=120/Lv3=140)。
// メインBGMとは別エレメントで、開始時にレベルのトラックへ src を切替える。
// TODO(曲): dance-100.mp3 / dance-140.mp3 はユーザー提供待ち。dance-120.mp3 は pulse-grid を流用。
const DANCE_TRACKS: Record<number, string> = {
  1: `${import.meta.env.BASE_URL}audio/dance-100.mp3?v=${encodeURIComponent(typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev')}`,
  2: `${import.meta.env.BASE_URL}audio/dance-120.mp3?v=${encodeURIComponent(typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev')}`,
  3: `${import.meta.env.BASE_URL}audio/dance-140.mp3?v=${encodeURIComponent(typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev')}`,
};
let currentDanceLevel = 2; // 現在 bgm に読み込まれているダンストラックのレベル

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
  | 'hurricane';

const SFX_SOURCES: Partial<Record<SfxKey, SfxConfig>> = {
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

const ensureBgm = () => {
  if (bgm || typeof Audio === 'undefined') return;
  bgm = new Audio(BGM_TRACKS[0]);
  bgm.loop = true;
  bgm.preload = 'auto';
  bgm.playsInline = true;
  bgm.volume = 1; // real level is set by the WebAudio gain (iOS-safe)
};

// --- ダンスタイム(四神舞)専用トラック ----------------------------------
// メインBGMと同じ bgm エレメントで src を入れ替える(2つ目の音声要素は作らない)。
// 開始でダンス曲を頭から、終了でメインBGMを保存位置から復帰。
let danceActive = false;
// 診断用: URLに ?danceaudio=0 を付けるとダンス曲に切り替えない(重さ切り分け用)。
const DANCE_AUDIO_OFF = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('danceaudio') === '0';
// ダンスは「メインBGMと同じ1つの音声要素(bgm)で曲を入れ替える」方式。2つ目の音声要素を作らないので
// この端末でも重くならない(2つ目はMP3デコードがソフト処理に落ちて重い)。メインBGMの位置は保存して復帰。
let savedMainSrc = '';
let savedMainTime = 0;

// bgm の src を切替えて(time>0なら位置合わせして)再生。位置合わせはメタデータ読込後に行う。
const swapBgmTo = (src: string, time: number) => {
  if (!bgm) return;
  const el = bgm;
  const apply = () => { try { if (time > 0) el.currentTime = time; } catch { /* ignore */ } void el.play().catch(() => {}); };
  try {
    el.src = src;
    el.load();
    if (time > 0 && typeof window !== 'undefined') {
      const onMeta = () => { el.removeEventListener('loadedmetadata', onMeta); apply(); };
      el.addEventListener('loadedmetadata', onMeta, { once: true });
      window.setTimeout(() => { el.removeEventListener('loadedmetadata', onMeta); apply(); }, 400);
    } else {
      apply();
    }
  } catch { /* ignore */ }
};

// ダンスの開始/終了。メインBGMと同じ bgm エレメントで曲を入れ替える(=常に音声1本=戦闘曲と同じ軽さ)。
// 開始: メインBGMの位置/srcを保存し、ダンス曲を頭から再生。終了: メインBGMを位置復帰して再生。
export const setDanceMode = (active: boolean, level = 2) => {
  if (DANCE_AUDIO_OFF) { danceActive = active; return; }
  ensureBgm();
  if (!bgm) return;
  if (active) {
    if (danceActive && level === currentDanceLevel) return; // 同レベルで既にダンス中
    if (!danceActive) {
      savedMainSrc = bgm.currentSrc || bgm.src || BGM_TRACKS[0]; // メインBGMの位置/srcを退避
      savedMainTime = bgm.currentTime || 0;
    }
    danceActive = true;
    currentDanceLevel = level;
    resumeSfxContext();
    if (bgmActive && !muted) swapBgmTo(DANCE_TRACKS[level] ?? DANCE_TRACKS[2], 0); // ダンス曲は頭から
  } else {
    if (!danceActive) return;
    danceActive = false;
    const restoreSrc = savedMainSrc || BGM_TRACKS[0];
    if (bgmActive && !muted) {
      swapBgmTo(restoreSrc, savedMainTime); // メインBGMを位置復帰して再生
    } else if (bgm) {
      // 再生していない(ゲーム離脱等)時も src だけは戦闘曲へ戻しておく(次回ダンス曲が残らないように)。
      try { bgm.src = restoreSrc; bgm.load(); } catch { /* ignore */ }
    }
  }
};

// 拍合わせは gameTime グリッドで行う(開始時に LEAD で合わせる)ため、音楽位置は使わない。
export const getMusicTimeMs = (): number | null => null;

// Route the BGM element through the SFX AudioContext + a gain node, so we can
// actually control its volume on iOS (where HTMLAudioElement.volume is ignored)
// and balance it against the SFX. Falls back to element.volume if unavailable.
const ensureBgmRouting = () => {
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

// Drive the BGM to match (bgmActive && !muted). Play/pause does the real on/off
// (the only thing that works on iOS); the gain sets the level.
const applyBgm = () => {
  ensureBgm();
  if (!bgm) return;
  if (bgmActive && !muted) {
    resumeSfxContext();
    ensureBgmRouting();
    if (bgmGain) bgmGain.gain.value = bgmVolume;
    else bgm.volume = bgmVolume;
    void playBgm(); // bgm の src は setDanceMode が管理(ダンス中はダンス曲)。ここは再生と音量のみ。
  } else {
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
  // ダンス曲はメインBGMと同じ bgm エレメントで src を入れ替える方式。各レベルの曲を HTTP キャッシュに
  // 温めておけば、ダンス開始時の差し替えが速い(別エレメントは作らない)。
  const danceWarms: Promise<void>[] = [];
  for (const lvl of [1, 2, 3]) {
    danceWarms.push(fetch(DANCE_TRACKS[lvl]).then(() => {}).catch(() => {}));
  }
  const sfxWaits = Array.from(sfxLoading.values()).map(p => p.catch(() => {}));
  return Promise.all([
    waitAudioReady(bgm),
    Promise.allSettled(danceWarms),
    Promise.allSettled(sfxWaits),
  ]).then(() => {});
};

const playBgm = async () => {
  ensureBgm();
  if (!bgm) return;
  try {
    await bgm.play();
  } catch {
    // Browser autoplay policy may deny playback outside a user gesture.
    // Start / audio-toggle interactions call this again.
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
};

export const setBgmVolume = (volume: number) => {
  bgmVolume = Math.max(0, Math.min(1, volume));
  try { localStorage.setItem(BGM_VOLUME_KEY, String(bgmVolume)); } catch { /* ignore */ }
  applyBgm();
};

export const setSfxVolume = (volume: number) => {
  sfxVolume = Math.max(0, Math.min(1, volume));
  try { localStorage.setItem(SFX_VOLUME_KEY, String(sfxVolume)); } catch { /* ignore */ }
};

export const setBgmActive = async (nextActive: boolean) => {
  bgmActive = nextActive;
  if (bgmActive && !muted) warmSfxBuffers();
  applyBgm();
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

// --- Hurricane rumble: a single looping low "ゴゴゴゴ" that runs only while a
// whip-hurricane is active. Driven every frame from useGameLoop with the current
// boolean; the call is idempotent so it starts/stops on the transition only.
let hurricaneSource: AudioBufferSourceNode | null = null;
let hurricaneGain: GainNode | null = null;
let hurricaneActive = false;
const HURRICANE_VOLUME = 0.7;

const startHurricaneNode = () => {
  const context = ensureSfxContext();
  if (!context) { hurricaneActive = false; return; }
  resumeSfxContext();
  const buffer = sfxBuffers.get('hurricane');
  if (!buffer) { loadSfxBuffer('hurricane'); hurricaneActive = false; return; } // retry next frame
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  source.loop = true;
  gain.gain.value = 0;
  source.connect(gain);
  gain.connect(context.destination);
  try { source.start(0); } catch { /* ignore */ }
  gain.gain.setTargetAtTime(HURRICANE_VOLUME * sfxVolume, context.currentTime, 0.10); // fade in
  hurricaneSource = source;
  hurricaneGain = gain;
};

const stopHurricaneNode = () => {
  const context = sfxContext;
  const src = hurricaneSource;
  const gain = hurricaneGain;
  hurricaneSource = null;
  hurricaneGain = null;
  if (src && gain && context) {
    try { gain.gain.setTargetAtTime(0, context.currentTime, 0.12); } catch { /* ignore */ }
    window.setTimeout(() => { try { src.stop(); } catch { /* ignore */ } }, 450); // stop after fade
  } else if (src) {
    try { src.stop(); } catch { /* ignore */ }
  }
};

export const setHurricaneRumble = (active: boolean) => {
  const shouldPlay = active && !muted;
  if (shouldPlay === hurricaneActive) return; // idempotent: cheap per-frame no-op
  hurricaneActive = shouldPlay;
  if (shouldPlay) startHurricaneNode();
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
