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
// ダンスタイム(四神舞リズムモード)中だけ流す 120BPM トラック。メインBGMとは別エレメント。
const DANCE_TRACK = `${import.meta.env.BASE_URL}audio/pulse-grid.mp3`;

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
// メインBGMとは別の HTMLAudioElement。リズムモード中だけ pulse-grid を鳴らし、メインBGMは
// その間ダック(0)する。終了でメインへフェード復帰。
let danceBgm: HTMLAudioElement | null = null;
let danceGain: GainNode | null = null;
let danceRouted = false;
let danceActive = false;

const ensureDanceBgm = () => {
  if (danceBgm || typeof Audio === 'undefined') return;
  danceBgm = new Audio(DANCE_TRACK);
  danceBgm.loop = true;
  danceBgm.preload = 'auto';
  danceBgm.playsInline = true;
  danceBgm.volume = 1; // 実音量は WebAudio gain 側で制御
};

const ensureDanceRouting = () => {
  if (danceRouted) return;
  const ctx = ensureSfxContext();
  ensureDanceBgm();
  if (!ctx || !danceBgm) return;
  try {
    const source = ctx.createMediaElementSource(danceBgm);
    danceGain = ctx.createGain();
    danceGain.gain.value = 0;
    source.connect(danceGain);
    danceGain.connect(ctx.destination);
    danceRouted = true;
  } catch {
    danceRouted = false;
  }
};

// GainNode を滑らかにランプ(WebAudio不可なら element.volume にフォールバック)。
const rampGain = (gain: GainNode | null, el: HTMLAudioElement | null, target: number, sec: number) => {
  const ctx = sfxContext;
  if (gain && ctx) {
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(target, now + sec);
  } else if (el) {
    el.volume = target;
  }
};

// gain を即時設定(ランプなし)。混ざり防止のため、ダンス開始でメインを即0にするのに使う。
const setGainNow = (gain: GainNode | null, el: HTMLAudioElement | null, v: number) => {
  const ctx = sfxContext;
  if (gain && ctx) {
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(v, ctx.currentTime);
  } else if (el) {
    el.volume = v;
  }
};

// ダンストラックの再生(失敗は無視)。BGM開始の操作ジェスチャ内で呼ぶことでアンロックされる。
const playDanceBgm = async () => {
  ensureDanceBgm();
  if (!danceBgm) return;
  try { await danceBgm.play(); } catch { /* autoplay policy: 後続のジェスチャで再試行 */ }
};

// ダンストラックは BGM が有効な間ずっと再生(通常は gain 0 で無音=連続クロック)。ダンス中だけ
// 音量を上げ、メインBGMは即0で確実に無音化(混ざり防止)。非ダンスでメインへフェード復帰。停止しない。
// ダンスの音量はメインBGMと同じ設定値(bgmVolume)に合わせる。
export const setDanceMode = (active: boolean) => {
  if (active === danceActive) return;
  danceActive = active;
  ensureDanceBgm();
  ensureDanceRouting();
  resumeSfxContext();
  if (!danceBgm) return;
  if (bgmActive && !muted) void playDanceBgm();
  const lvl = muted ? 0 : bgmVolume; // ダンス音量 = BGM設定値
  if (active) {
    setGainNow(bgmGain, bgm, 0);            // メインBGMを即0(混ざらない)。位置・設定は保持。
    rampGain(danceGain, danceBgm, lvl, 0.1);
  } else {
    rampGain(danceGain, danceBgm, 0, 0.2);
    rampGain(bgmGain, bgm, lvl, 0.6);       // 元の設定値へフェードイン
  }
};

// ダンストラックの再生位置(ms)。連続再生クロック。開始時の拍合わせ + 毎フレーム再同期に使う。
export const getMusicTimeMs = (): number | null =>
  danceBgm && !danceBgm.paused ? danceBgm.currentTime * 1000 : null;

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
    // ダンス中はメインBGMをダック(0)で維持。それ以外は設定値。
    if (bgmGain) bgmGain.gain.value = danceActive ? 0 : bgmVolume;
    else bgm.volume = danceActive ? 0 : bgmVolume;
    void playBgm();
    // ダンストラックも(操作ジェスチャ内で)再生開始してアンロック。通常は gain 0 の無音=連続クロック。
    ensureDanceRouting();
    if (danceGain) danceGain.gain.value = danceActive ? bgmVolume : 0;
    void playDanceBgm();
  } else {
    bgm.pause();
    if (danceBgm) danceBgm.pause();
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
  ensureDanceBgm();
  const sfxWaits = Array.from(sfxLoading.values()).map(p => p.catch(() => {}));
  return Promise.all([
    waitAudioReady(bgm),
    waitAudioReady(danceBgm),
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

export const playSfx = (key: SfxKey) => {
  if (muted) return;
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
