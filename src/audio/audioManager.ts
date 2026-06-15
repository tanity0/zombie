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
      setBgmTrack(BGM_TRACKS[0], 0);
    }, 300);
  } else if (bgmTargetDanceLevel === 0) {
    setBgmTrack(BGM_TRACKS[0], 0);
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
