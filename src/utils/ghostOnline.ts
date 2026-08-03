import type { SkillKey } from '../types/game';
import type { PlayerProfile } from './playerTraits';
import { bossStyleSlotKey } from './ghostSlot';
import { ENGAGEABLE_BOSS_TYPES } from './bossEngagement';
import { getAnonymousId } from '../online/id';
import { displayNameFrom, loadPlayerName } from './playerName';
import {
  GHOST_KNOB_SET_V,
  GHOST_SHARE_EPOCH,
  sanitizeSharedProfile,
  utf8Size,
  GHOST_MAX_RECORD_BYTES,
  GHOST_SLOT_RE,
} from '../../shared/ghostSanitize.mjs';

export type GhostSource = 'own' | 'random' | 'top';
export type RemoteGhostCandidate = {
  source: 'random' | 'top';
  recordId: string;
  slot: string;
  /** サーバ側でこの抽選に参加した実プレイヤー候補数。固定候補との人数比抽選に使う。 */
  poolSize: number;
  profile: PlayerProfile;
};

export type GhostInboxItem = {
  slot: string;
  used: number;
  likes: number;
  recent: { name: string; liked: boolean; at: number }[];
};

const CONSENT_KEY = 'zombie-ghost-consent-v1';
const CACHE_KEY = 'zombie-ghost-cache-v1';
const INBOX_KEY = 'zombie-ghost-inbox-v1';
let runGeneration = 0;
let runCandidates = new Map<string, RemoteGhostCandidate>();
let runMode: 'random' | 'top' | null = null;
let runPickPending = false;

const apiBase = (): string => {
  try {
    const query = new URLSearchParams(location.search);
    if (query.get('ghostnet') === '0') return '';
    const override = query.get('ghosturl');
    const raw = override ?? __GHOST_API_BASE__;
    if (!raw) return '';
    const url = new URL(raw, location.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.href.replace(/\/$/, '');
  } catch {
    return '';
  }
};

const safeJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > 256 * 1024) return null;
  try { return JSON.parse(text); } catch { return null; }
};

export const hasGhostOnlineConsent = (): boolean => {
  try { return localStorage.getItem(CONSENT_KEY) === 'yes'; } catch { return false; }
};

export const requestGhostOnlineConsent = (): boolean => {
  const accepted = window.confirm(
    'ニックネームは他の人に公開されます。\n個人情報は入れないようにご注意ください。',
  );
  if (!accepted) return false;
  try {
    localStorage.setItem(CONSENT_KEY, 'yes');
    return localStorage.getItem(CONSENT_KEY) === 'yes';
  } catch {
    return false;
  }
};

export const ghostNetworkSlotKey = (localSlot: string): string => localSlot.replace(/@/g, '-');

export const selectedGhostMode = (skills: readonly SkillKey[]): 'own' | 'random' | 'top' | null => {
  if (skills.includes('guardian-spirit')) return 'own';
  if (skills.includes('ghost-slayer')) return 'top';
  if (skills.includes('ghost-helper')) return 'random';
  return null;
};

export const ghostGoldMultiplier = (source: GhostSource | null): number =>
  source === 'random' ? 0.7 : source === 'own' || source === 'top' ? 0.5 : 1;

const clearRunCache = (): void => {
  runCandidates = new Map();
  runMode = null;
  runPickPending = false;
  try { localStorage.removeItem(CACHE_KEY); } catch { /* メモリ上の破棄だけで十分 */ }
};

export const endGhostOnlineRun = (): void => {
  runGeneration += 1;
  clearRunCache();
};

export const beginGhostOnlineRun = (skills: readonly SkillKey[], stageId: string): void => {
  const generation = ++runGeneration;
  clearRunCache();
  const mode = selectedGhostMode(skills);
  if (mode !== 'random' && mode !== 'top') return;
  if (!hasGhostOnlineConsent() || !apiBase() || !getAnonymousId()) return;
  runMode = mode;
  runPickPending = true;
  const slots = [...ENGAGEABLE_BOSS_TYPES].map(type =>
    ghostNetworkSlotKey(bossStyleSlotKey(type, stageId)));
  void (async () => {
    try {
      const anonId = getAnonymousId();
      if (!anonId) return;
      const url = new URL(`${apiBase()}/ghost/pick`);
      url.searchParams.set('slots', slots.join(','));
      url.searchParams.set('mode', mode);
      url.searchParams.set('anon', anonId);
      const response = await fetch(url, {
        headers: { 'X-Ghost-Anon': anonId },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok || generation !== runGeneration) return;
      const raw = await safeJson(response) as { epoch?: unknown; items?: unknown } | null;
      if (!raw || raw.epoch !== GHOST_SHARE_EPOCH || !Array.isArray(raw.items)) return;
      const next = new Map<string, RemoteGhostCandidate>();
      for (const item of raw.items) {
        if (!item || typeof item !== 'object') continue;
        const value = item as { slot?: unknown; recordId?: unknown; poolSize?: unknown; profile?: unknown };
        if (typeof value.slot !== 'string' || !slots.includes(value.slot) || typeof value.recordId !== 'string') continue;
        const profile = sanitizeSharedProfile(value.profile, value.slot) as PlayerProfile | null;
        if (!profile) continue;
        const poolSize = Number.isSafeInteger(value.poolSize) && Number(value.poolSize) >= 1
          ? Number(value.poolSize)
          : 1; // 旧Worker応答は「取得できた実候補1人」として互換維持。
        next.set(value.slot, { source: mode, recordId: value.recordId, slot: value.slot, poolSize, profile });
      }
      if (generation !== runGeneration) return;
      runCandidates = next;
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ epoch: GHOST_SHARE_EPOCH, mode, slots: [...next.keys()] }));
      } catch { /* 実データはメモリだけに保持する */ }
    } catch { /* オフライン時の固定20人フォールバックは召喚側で行う */ }
    finally {
      if (generation === runGeneration) runPickPending = false;
    }
  })();
  void refreshGhostInbox();
};

export const resolveRemoteGhost = (localSlot: string): RemoteGhostCandidate | null => {
  if (!runMode) return null;
  return runCandidates.get(ghostNetworkSlotKey(localSlot)) ?? null;
};

/** オンライン候補を取得中か。即ボス戦では完了まで召喚を待ち、選択した霊種を正しく試す。 */
export const isGhostOnlinePickPending = (): boolean => runPickPending;

export const shareableProfile = (profile: PlayerProfile, localSlot: string): PlayerProfile | null => {
  const slot = profile.bossStyles?.[localSlot];
  if (!slot) return null;
  const networkSlot = ghostNetworkSlotKey(localSlot);
  const raw = {
    ...profile,
    bossStyles: {
      [networkSlot]: {
        ...slot,
        ally: undefined,
        knobsV: GHOST_KNOB_SET_V,
      },
    },
  };
  return sanitizeSharedProfile(raw, networkSlot) as PlayerProfile | null;
};

export const uploadGhostSlots = (profile: PlayerProfile | null, localSlots: readonly string[]): void => {
  if (!profile || !hasGhostOnlineConsent()) return;
  const base = apiBase();
  const anonId = getAnonymousId();
  if (!base || !anonId) return;
  for (const localSlot of [...new Set(localSlots)]) {
    const shared = shareableProfile(profile, localSlot);
    if (!shared || utf8Size(shared) > GHOST_MAX_RECORD_BYTES) continue;
    const slot = ghostNetworkSlotKey(localSlot);
    const perfScore = shared.bossStyles?.[slot]?.perfScore;
    void fetch(`${base}/ghost`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Ghost-Anon': anonId },
      body: JSON.stringify({
        anonId, slot, epoch: GHOST_SHARE_EPOCH, knobsV: GHOST_KNOB_SET_V,
        buildVersion: __APP_VERSION__, perfScore, profile: shared,
      }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => undefined);
  }
};

export const sendGhostFeedback = async (recordId: string, liked: boolean): Promise<void> => {
  const base = apiBase();
  const anonId = getAnonymousId();
  if (!base || !anonId || !hasGhostOnlineConsent()) return;
  const send = () => fetch(`${base}/ghost/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Ghost-Anon': anonId },
    body: JSON.stringify({ recordId, liked, anonId, name: loadPlayerName() }),
    signal: AbortSignal.timeout(5000),
  });
  try {
    const first = await send();
    if (first.ok) return;
  } catch { /* 直後に1回だけ再送 */ }
  try { await send(); } catch { /* 再送キューは持たない */ }
};

const sanitizeInboxItem = (raw: unknown): GhostInboxItem | null => {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<GhostInboxItem>;
  if (typeof value.slot !== 'string' || !GHOST_SLOT_RE.test(value.slot)) return null;
  const recent = Array.isArray(value.recent) ? value.recent.flatMap(entry => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as { name?: unknown; liked?: unknown; at?: unknown };
    const name = displayNameFrom(item.name);
    if (!name || typeof item.at !== 'number' || !Number.isFinite(item.at)) return [];
    return [{ name, liked: item.liked === true, at: Math.max(0, item.at) }];
  }).slice(0, 20) : [];
  return {
    slot: value.slot,
    used: typeof value.used === 'number' && Number.isFinite(value.used) ? Math.max(0, Math.floor(value.used)) : 0,
    likes: typeof value.likes === 'number' && Number.isFinite(value.likes) ? Math.max(0, Math.floor(value.likes)) : 0,
    recent,
  };
};

export const loadGhostInbox = (): Record<string, GhostInboxItem> => {
  try {
    const raw = JSON.parse(localStorage.getItem(INBOX_KEY) ?? '{}') as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, GhostInboxItem> = {};
    for (const value of Object.values(raw)) {
      const item = sanitizeInboxItem(value);
      if (item) out[item.slot] = item;
    }
    return out;
  } catch { return {}; }
};

export const refreshGhostInbox = async (): Promise<void> => {
  const base = apiBase();
  const anonId = getAnonymousId();
  if (!base || !anonId || !hasGhostOnlineConsent()) return;
  try {
    const url = new URL(`${base}/ghost/inbox`);
    url.searchParams.set('anon', anonId);
    const response = await fetch(url, { headers: { 'X-Ghost-Anon': anonId }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) return;
    const raw = await safeJson(response) as { items?: unknown; cursor?: unknown } | null;
    if (!raw || !Array.isArray(raw.items) || !Number.isSafeInteger(raw.cursor)) return;
    const current = loadGhostInbox();
    for (const item of raw.items) {
      if (!item || typeof item !== 'object') continue;
      const value = sanitizeInboxItem(item);
      if (!value) continue;
      current[value.slot] = value;
    }
    localStorage.setItem(INBOX_KEY, JSON.stringify(current));
    if ((raw.cursor as number) > 0) {
      await fetch(`${base}/ghost/inbox/ack`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Ghost-Anon': anonId },
        body: JSON.stringify({ anonId, cursor: raw.cursor }), signal: AbortSignal.timeout(5000),
      });
    }
  } catch { /* 通知取得はゲーム進行を止めない */ }
};
