// Central audio controls. BGM uses HTMLAudioElement so mobile browsers keep
// their normal media route; short SFX use Web Audio to avoid frame hitches.

const MUTED_KEY = 'zombie:audioMuted';
const LEGACY_BGM_MUTED_KEY = 'zombie:bgmMuted';
const TARGET_BGM_VOLUME = 0.42;
const TARGET_SFX_VOLUME = 0.72;
const FADE_STEP_MS = 40;
const FADE_STEP = 0.05;

const BGM_TRACKS = [
  `${import.meta.env.BASE_URL}audio/rotten-iron-march.mp3`,
  `${import.meta.env.BASE_URL}audio/rusting-grave-circuit.mp3`,
];

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
  | 'bomb'
  | 'eat'
  | 'zombie-1'
  | 'zombie-2'
  | 'zombie-3'
  | 'zombie-4';

const SFX_SOURCES: Partial<Record<SfxKey, SfxConfig>> = {
  pickup: {
    src: `${import.meta.env.BASE_URL}audio/sfx/pickup.wav`,
    volume: 0.62,
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
    volume: 0.46,
    minIntervalMs: 24,
  },
  'shotgun-fire': {
    src: `${import.meta.env.BASE_URL}audio/sfx/shotgun-fire.mp3`,
    volume: 0.58,
    minIntervalMs: 32,
  },
  'rifle-fire': {
    src: `${import.meta.env.BASE_URL}audio/sfx/rifle-fire.mp3`,
    volume: 0.54,
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
  reload: {
    src: `${import.meta.env.BASE_URL}audio/sfx/reload.mp3`,
    volume: 0.86,
  },
  // Counter (bullet parry) success — deliberately a touch louder than the rest.
  counter: {
    src: `${import.meta.env.BASE_URL}audio/sfx/counter.mp3`,
    volume: 0.98,
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
};

let bgm: HTMLAudioElement | null = null;
let bgmActive = false;
let muted = false;
let fadeTimer: number | null = null;
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
  bgm.volume = 0;
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

const stopFade = () => {
  if (fadeTimer != null) window.clearInterval(fadeTimer);
  fadeTimer = null;
};

const fadeBgmTo = (target: number) => {
  ensureBgm();
  if (!bgm) return;
  stopFade();
  fadeTimer = window.setInterval(() => {
    if (!bgm) return;
    const diff = target - bgm.volume;
    if (Math.abs(diff) <= FADE_STEP) {
      bgm.volume = target;
      stopFade();
      if (target === 0 && !bgmActive) {
        bgm.pause();
        bgm.currentTime = 0;
      }
      return;
    }
    bgm.volume = Math.max(0, Math.min(1, bgm.volume + Math.sign(diff) * FADE_STEP));
  }, FADE_STEP_MS);
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

export const setAudioMuted = (nextMuted: boolean) => {
  muted = nextMuted;
  persistMuted();

  if (bgmActive && !muted) {
    warmSfxBuffers();
    void playBgm();
    fadeBgmTo(TARGET_BGM_VOLUME);
  } else {
    fadeBgmTo(0);
  }
};

export const setBgmActive = async (nextActive: boolean) => {
  bgmActive = nextActive;
  ensureBgm();
  if (!bgm) return;

  if (nextActive && !muted) {
    warmSfxBuffers();
    await playBgm();
    fadeBgmTo(TARGET_BGM_VOLUME);
  } else {
    fadeBgmTo(0);
  }
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
  gain.gain.value = config.volume ?? TARGET_SFX_VOLUME;
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
