import type { SkillKey } from '../types/game';
import type { PlayerProfile } from './playerTraits';
import { bossStyleSlotKey } from './ghostSlot';
import { ENGAGEABLE_BOSS_TYPES } from './bossEngagement';
import { getAnonymousId } from '../online/id';
import { displayNameFrom, loadPlayerName } from './playerName';
import { loadGhostComments } from './ghostComment';
import { isFixedGuardianId } from '../../shared/fixedGuardianIds.mjs';
import {
  GHOST_KNOB_SET_V,
  GHOST_SHARE_EPOCH,
  sanitizeSharedProfile,
  utf8Size,
  GHOST_MAX_RECORD_BYTES,
  GHOST_SLOT_RE,
} from '../../shared/ghostSanitize.mjs';

export type GhostSource = 'own' | 'random' | 'top';
export type GhostFeedbackTarget =
  | { kind: 'remote'; recordId: string; eventId: string }
  | { kind: 'fixed'; guardianId: string; slot: string; eventId: string };
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
  published: boolean;
  recent: { name: string; liked: boolean; at: number }[];
};

export type FixedGhostStat = {
  guardianId: string;
  slot: string;
  used: number;
  likes: number;
};

export type GhostInboxRefreshResult = {
  inbox: Record<string, GhostInboxItem>;
  fixedStats: Record<string, FixedGhostStat>;
  cursor: number;
  newUses: number;
  newLikes: number;
  updatedAt: number;
};

const CONSENT_KEY = 'zombie-ghost-consent-v1';
const INBOX_KEY = 'zombie-ghost-inbox-v1';
const FIXED_STATS_KEY = 'zombie-fixed-ghost-stats-v1';
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
    'ニックネームと守護霊コメントは他の人に公開されます。\n個人情報は入れないようにご注意ください。',
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

export const fixedGhostStatKey = (slot: string, guardianId: string): string =>
  `${ghostNetworkSlotKey(slot)}:${guardianId}`;

const createFeedbackEventId = (): string => {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  } catch { /* WebView fallback below */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
};

export const remoteGhostFeedbackTarget = (recordId: string): GhostFeedbackTarget => ({
  kind: 'remote', recordId, eventId: createFeedbackEventId(),
});

export const fixedGhostFeedbackTarget = (guardianId: string, localSlot: string): GhostFeedbackTarget => ({
  kind: 'fixed', guardianId, slot: ghostNetworkSlotKey(localSlot), eventId: createFeedbackEventId(),
});

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
  const comments = loadGhostComments();
  const raw = {
    ...profile,
    ...comments,
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

export const sendGhostFeedback = async (target: GhostFeedbackTarget, liked: boolean): Promise<void> => {
  const base = apiBase();
  const anonId = getAnonymousId();
  // 固定AIへのいいねは公開同意の対象外（名前・コメントを他人へ公開しない）。
  // 実プレイヤー霊は受信自体が同意後だけなので、従来どおり同意を必須にする。
  if (!base || !anonId || (target.kind === 'remote' && !hasGhostOnlineConsent())) return;
  const send = () => fetch(`${base}/ghost/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Ghost-Anon': anonId },
    body: JSON.stringify({
      ...(target.kind === 'remote'
        ? { recordId: target.recordId }
        : { fixedGuardianId: target.guardianId, slot: target.slot }),
      eventId: target.eventId,
      liked,
      anonId,
      name: loadPlayerName(),
    }),
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
    published: value.published === true,
    recent,
  };
};

const sanitizeFixedStat = (raw: unknown): FixedGhostStat | null => {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<FixedGhostStat>;
  if (!isFixedGuardianId(value.guardianId) || typeof value.slot !== 'string' || !GHOST_SLOT_RE.test(value.slot)) return null;
  return {
    guardianId: String(value.guardianId),
    slot: value.slot,
    used: typeof value.used === 'number' && Number.isFinite(value.used) ? Math.max(0, Math.floor(value.used)) : 0,
    likes: typeof value.likes === 'number' && Number.isFinite(value.likes) ? Math.max(0, Math.floor(value.likes)) : 0,
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

export const loadFixedGhostStats = (): Record<string, FixedGhostStat> => {
  try {
    const raw = JSON.parse(localStorage.getItem(FIXED_STATS_KEY) ?? '{}') as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, FixedGhostStat> = {};
    for (const value of Object.values(raw)) {
      const item = sanitizeFixedStat(value);
      if (item) out[fixedGhostStatKey(item.slot, item.guardianId)] = item;
    }
    return out;
  } catch { return {}; }
};

export const refreshGhostInbox = async (): Promise<GhostInboxRefreshResult | null> => {
  const base = apiBase();
  const anonId = getAnonymousId();
  if (!base || !anonId) return null;
  try {
    const url = new URL(`${base}/ghost/inbox`);
    url.searchParams.set('anon', anonId);
    const response = await fetch(url, { headers: { 'X-Ghost-Anon': anonId }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const raw = await safeJson(response) as { items?: unknown; fixed?: unknown; cursor?: unknown } | null;
    if (!raw || !Array.isArray(raw.items) || !Number.isSafeInteger(raw.cursor)) return null;
    const current = loadGhostInbox();
    // 一度公開されたが期限切れになった「利用0回」の枠も、次回取得で公開中のまま残さない。
    for (const item of Object.values(current)) item.published = false;
    let newUses = 0;
    let newLikes = 0;
    for (const item of raw.items) {
      if (!item || typeof item !== 'object') continue;
      const value = sanitizeInboxItem(item);
      if (!value) continue;
      newUses += value.recent.length;
      newLikes += value.recent.filter(event => event.liked).length;
      current[value.slot] = {
        ...value,
        // 新着が無い取得で「最近」の表示を消さない。次の新着が届いた時だけ差し替える。
        recent: value.recent.length > 0 ? value.recent : (current[value.slot]?.recent ?? []),
      };
    }
    localStorage.setItem(INBOX_KEY, JSON.stringify(current));
    const fixedStats: Record<string, FixedGhostStat> = {};
    if (Array.isArray(raw.fixed)) {
      for (const item of raw.fixed) {
        const value = sanitizeFixedStat(item);
        if (value) fixedStats[fixedGhostStatKey(value.slot, value.guardianId)] = value;
      }
    }
    localStorage.setItem(FIXED_STATS_KEY, JSON.stringify(fixedStats));
    return {
      inbox: current,
      fixedStats,
      cursor: raw.cursor as number,
      newUses,
      newLikes,
      updatedAt: Date.now(),
    };
  } catch { return null; /* 通知取得はゲーム進行を止めない */ }
};

/** 守護霊部屋へ新着を描画した後にだけ既読へする。 */
export const acknowledgeGhostInbox = async (cursor: number): Promise<boolean> => {
  const base = apiBase();
  const anonId = getAnonymousId();
  if (!base || !anonId || !Number.isSafeInteger(cursor) || cursor <= 0) return false;
  try {
    const response = await fetch(`${base}/ghost/inbox/ack`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Ghost-Anon': anonId },
      body: JSON.stringify({ anonId, cursor }), signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch { return false; }
};
