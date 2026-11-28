import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedGhostOriginValue } from '../src/ghost-origin.js';
import {
  GHOST_PROFILE_DEFAULTS,
  GHOST_SHARE_EPOCH,
  GHOST_GROWTH_ATK_MAX_MULT,
  GHOST_GROWTH_COUNTER_ACCEPT_MAX_MS,
  GHOST_MASTERY_MAX_MULT,
  sanitizeSharedProfile,
} from '../../shared/ghostSanitize.mjs';
import { handleGhostRequest } from '../src/ghost-api.js';

const profile = (slot = 'thor') => ({
  v: 1,
  runs: 3,
  ...GHOST_PROFILE_DEFAULTS,
  srcName: '勇者\u202eBAD',
  arrivalComment: `援護\u202e${'あ'.repeat(35)}`,
  departureComment: '帰還する！',
  moveReactions: { 'thor-issen': { n: 4, counterRate: 2, hitRate: -1 }, evil: { n: 9, counterRate: 1, hitRate: 0 } },
  subStyles: {},
  bossStyles: {
    [slot]: {
      ...GHOST_PROFILE_DEFAULTS,
      srcName: '勇者\u202eBAD',
      srcClass: 'warrior',
      subStyles: {},
      snapshot: { maxHealth: 1e9, speed: 1e9, level: 1e9, gunKeys: ['rifle-t3', 'cheat-gun'] },
      perfScore: 1e9,
      at: Date.now(),
    },
  },
});

test('originless WebView, Capacitor and GitHub Pages are allowed', () => {
  assert.equal(allowedGhostOriginValue(null), true);
  assert.equal(allowedGhostOriginValue('capacitor://localhost'), true);
  assert.equal(allowedGhostOriginValue('https://tanity0.github.io'), true);
  assert.equal(allowedGhostOriginValue('https://github.io.evil.example'), false);
});

test('shared profile sanitizer clamps hostile data and rejects slot mismatch', () => {
  const safe = sanitizeSharedProfile(profile(), 'thor');
  assert.ok(safe);
  assert.equal(safe.bossStyles.thor.perfScore, 180);
  assert.equal(safe.bossStyles.thor.snapshot.maxHealth, 5000);
  assert.deepEqual(safe.bossStyles.thor.snapshot.gunKeys, ['rifle-t3']);
  assert.equal(safe.moveReactions['thor-issen'].counterRate, 1);
  assert.equal(safe.moveReactions.evil, undefined);
  assert.equal([...safe.arrivalComment].length, 30);
  assert.equal(safe.arrivalComment.includes('\u202e'), false);
  assert.equal(safe.departureComment, '帰還する！');
  assert.equal(sanitizeSharedProfile(profile('thor'), 'skadi'), null);
});

// v0.25.3256(守護霊へのアバター記録)の既知の地雷対策: sanitizeSnapshot のホワイトリストへ
// avatarId を足し忘れると online publish/consume の経路で黙って落ちる。ここで機械的に固定する。
test('shared profile sanitizer passes known avatarId through and nulls unknown/missing values', () => {
  const withKnownAvatar = profile();
  withKnownAvatar.bossStyles.thor.snapshot.avatarId = 'cat-set';
  const safeKnown = sanitizeSharedProfile(withKnownAvatar, 'thor');
  assert.ok(safeKnown);
  assert.equal(safeKnown.bossStyles.thor.snapshot.avatarId, 'cat-set'); // 既知のアバターIDはそのまま通る

  const withForgedAvatar = profile();
  withForgedAvatar.bossStyles.thor.snapshot.avatarId = 'admin-mode'; // 改造/未知IDはnull化
  const safeForged = sanitizeSharedProfile(withForgedAvatar, 'thor');
  assert.ok(safeForged);
  assert.equal(safeForged.bossStyles.thor.snapshot.avatarId, null);

  const withoutAvatar = profile(); // 欠損(旧データ)もnull化=非表示・クラッシュなし
  const safeMissing = sanitizeSharedProfile(withoutAvatar, 'thor');
  assert.ok(safeMissing);
  assert.equal(safeMissing.bossStyles.thor.snapshot.avatarId, null);
});

// 社長裁定: 他人の守護霊にも記録主の熟練度と育成の攻撃力を乗せる。保存(PUT)と配る(pick)の両方が通る浄化で落ちない事。
test('shared profile sanitizer passes mastery and growth attack with clamping, old records stay readable', () => {
  const withBuild = profile();
  Object.assign(withBuild.bossStyles.thor.snapshot, {
    // 近接はナイフ毎のキー(knife-t1 等)。旧 melee も古いクライアントの記録を読むため受け取りは通す。
    masteryMult: { melee: 1.5, 'knife-t1': 1.6, 'handgun-t1': 99, handgun: 1.5, evil: 1.9, loadout: 1.9, 'rifle-t1': 'x', katana: 1 },
    masteryLoadoutMult: 7,
    growthAtkMult: 5,
  });
  const safe = sanitizeSharedProfile(withBuild, 'thor');
  assert.ok(safe);
  assert.deepEqual(safe.bossStyles.thor.snapshot.masteryMult, { melee: 1.5, 'knife-t1': 1.6, 'handgun-t1': GHOST_MASTERY_MAX_MULT });
  assert.equal(safe.bossStyles.thor.snapshot.masteryLoadoutMult, GHOST_MASTERY_MAX_MULT);
  assert.equal(safe.bossStyles.thor.snapshot.growthAtkMult, GHOST_GROWTH_ATK_MAX_MULT);
  // 保存した物をもう一度浄化しても同じ(配る時の再浄化)。
  const again = sanitizeSharedProfile(JSON.parse(JSON.stringify(safe)), 'thor');
  assert.deepEqual(again.bossStyles.thor.snapshot, safe.bossStyles.thor.snapshot);

  const old = sanitizeSharedProfile(profile(), 'thor'); // 欄なし(古い記録)
  assert.ok(old);
  assert.equal('masteryMult' in old.bossStyles.thor.snapshot, false);
  assert.equal('masteryLoadoutMult' in old.bossStyles.thor.snapshot, false);
  assert.equal('growthAtkMult' in old.bossStyles.thor.snapshot, false);

  const bad = profile();
  Object.assign(bad.bossStyles.thor.snapshot, { masteryMult: [1.9], masteryLoadoutMult: 'x', growthAtkMult: Number.NaN });
  const safeBad = sanitizeSharedProfile(bad, 'thor');
  assert.equal('masteryMult' in safeBad.bossStyles.thor.snapshot, false);
  assert.equal('masteryLoadoutMult' in safeBad.bossStyles.thor.snapshot, false);
  assert.equal('growthAtkMult' in safeBad.bossStyles.thor.snapshot, false);
});

// 社長裁定「通す必要ありそうなものは通して」: 育成「カウンター受付」も保存(PUT)と配る(pick)の浄化で落ちない事。
test('shared profile sanitizer passes growth counter accept with clamping, old records stay readable', () => {
  const ok = profile();
  ok.bossStyles.thor.snapshot.growthCounterAcceptMs = 60;
  const safe = sanitizeSharedProfile(ok, 'thor');
  assert.equal(safe.bossStyles.thor.snapshot.growthCounterAcceptMs, 60);
  const again = sanitizeSharedProfile(JSON.parse(JSON.stringify(safe)), 'thor');
  assert.deepEqual(again.bossStyles.thor.snapshot, safe.bossStyles.thor.snapshot);

  const hi = profile();
  hi.bossStyles.thor.snapshot.growthCounterAcceptMs = 5000;
  assert.equal(sanitizeSharedProfile(hi, 'thor').bossStyles.thor.snapshot.growthCounterAcceptMs, GHOST_GROWTH_COUNTER_ACCEPT_MAX_MS);
  const lo = profile();
  lo.bossStyles.thor.snapshot.growthCounterAcceptMs = -1;
  assert.equal(sanitizeSharedProfile(lo, 'thor').bossStyles.thor.snapshot.growthCounterAcceptMs, 0);

  assert.equal('growthCounterAcceptMs' in sanitizeSharedProfile(profile(), 'thor').bossStyles.thor.snapshot, false);
  for (const bad of ['60', Number.NaN, null, [60]]) {
    const p = profile();
    p.bossStyles.thor.snapshot.growthCounterAcceptMs = bad;
    assert.equal('growthCounterAcceptMs' in sanitizeSharedProfile(p, 'thor').bossStyles.thor.snapshot, false);
  }
});

// 社長裁定「通す必要ありそうなものは通して」: 許可リストを台帳と一致させた。新しく通る銃だけの記録でも
// 保存(PUT)と配る(pick)の浄化で gunKeys が残る(直す前は空=他人の守護霊が銃を持たずに来ていた)。
test('shared profile sanitizer keeps ledger guns, skills and sub weapons added after the first whitelist', () => {
  const p = profile();
  Object.assign(p.bossStyles.thor.snapshot, {
    gunKeys: ['glauncher-t1', 'handgun-t2-handcannon'], activeGunKey: 'handgun-t2-handcannon',
    skills: ['shukuchi', 'hero', 'super-armor'], subWeapons: ['gold-ring', 'brawler'], avatarId: 'maid-set',
  });
  const safe = sanitizeSharedProfile(p, 'thor');
  const snap = safe.bossStyles.thor.snapshot;
  assert.deepEqual(snap.gunKeys, ['glauncher-t1', 'handgun-t2-handcannon']);
  assert.equal(snap.activeGunKey, 'handgun-t2-handcannon');
  assert.deepEqual(snap.skills, ['shukuchi', 'hero', 'super-armor']);
  assert.deepEqual(snap.subWeapons, ['gold-ring', 'brawler']);
  assert.equal(snap.avatarId, 'maid-set');
  const again = sanitizeSharedProfile(JSON.parse(JSON.stringify(safe)), 'thor');
  assert.deepEqual(again.bossStyles.thor.snapshot, snap);
});

const pickEnv = (realCount) => ({
  GHOST_DB: {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              if (sql.includes('COUNT(*) AS n')) return { n: realCount };
              return {
                record_id: 'record-1',
                slot: 'thor',
                profile_json: JSON.stringify(profile('thor')),
                pool_size: realCount,
              };
            },
          };
        },
      };
    },
  },
});

test('pick response reports the real-player pool size for fixed/real weighted mixing', async () => {
  const anon = '11111111-1111-4111-8111-111111111111';
  const randomResponse = await handleGhostRequest(
    new Request(`https://example.test/ghost/pick?slots=thor&mode=random&anon=${anon}`),
    pickEnv(7),
  );
  const randomBody = await randomResponse.json();
  assert.equal(randomBody.epoch, GHOST_SHARE_EPOCH);
  assert.equal(randomBody.items[0].poolSize, 7);

  const topResponse = await handleGhostRequest(
    new Request(`https://example.test/ghost/pick?slots=thor&mode=top&anon=${anon}`),
    pickEnv(10),
  );
  const topBody = await topResponse.json();
  assert.equal(topBody.items[0].poolSize, 2); // ceil(10 × 上位20%)
});

test('best mode returns the single highest-perf record (excluding the requester) with its perf', async () => {
  const anon = '11111111-1111-4111-8111-111111111111';
  const seen = [];
  const env = {
    GHOST_DB: {
      prepare(sql) {
        return {
          bind(...params) {
            seen.push({ sql, params });
            return {
              async first() {
                return { record_id: 'record-best', slot: 'thor', profile_json: JSON.stringify(profile('thor')), perf: 95.5 };
              },
            };
          },
        };
      },
    },
  };
  const response = await handleGhostRequest(
    new Request(`https://example.test/ghost/pick?slots=thor&mode=best&anon=${anon}`), env,
  );
  const body = await response.json();
  assert.equal(body.epoch, GHOST_SHARE_EPOCH);
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].recordId, 'record-best');
  assert.equal(body.items[0].perf, 95.5);
  assert.equal(body.items[0].poolSize, 1);
  assert.equal(seen.length, 1); // 件数の数え直しをしない=1問い合わせ
  assert.match(seen[0].sql, /ORDER BY perf DESC/);
  assert.match(seen[0].sql, /LIMIT 1/);
  assert.doesNotMatch(seen[0].sql, /RANDOM\(\)/);
  assert.match(seen[0].sql, /anon_id<>\?/);
  assert.deepEqual(seen[0].params, ['thor', GHOST_SHARE_EPOCH, anon]);

  // top/random の応答には perf を足さない(従来どおり)。
  const topBody = await (await handleGhostRequest(
    new Request(`https://example.test/ghost/pick?slots=thor&mode=top&anon=${anon}`), pickEnv(10),
  )).json();
  assert.equal('perf' in topBody.items[0], false);
  // 未知のモードは従来どおり random 扱い。
  const unknownBody = await (await handleGhostRequest(
    new Request(`https://example.test/ghost/pick?slots=thor&mode=evil&anon=${anon}`), pickEnv(7),
  )).json();
  assert.equal(unknownBody.items[0].poolSize, 7);
});

test('pick accepts the full slot list including the four bounty types (17) and still rejects oversized lists', async () => {
  const anon = '11111111-1111-4111-8111-111111111111';
  const bosses = ['giantbat-stage-1', 'mimir', 'jormungand', 'skadi', 'thor', 'miguel', 'jibril', 'rafi', 'uri', 'suriel',
    'acrasiel', 'idol', 'phillboss-stage-ex1', 'bounty-ranged', 'bounty-melee', 'bounty-balance', 'bounty-maiko'];
  assert.equal(bosses.length, 17);
  const ok = await handleGhostRequest(
    new Request(`https://example.test/ghost/pick?slots=${bosses.join(',')}&mode=top&anon=${anon}`), pickEnv(10),
  );
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.deepEqual(body.items.map(item => item.slot), ['thor']); // 偽DBは thor の記録しか返さない=他は浄化で落ちる
  const tooMany = Array.from({ length: 25 }, (_, i) => `slot-${i}`);
  const rejected = await handleGhostRequest(
    new Request(`https://example.test/ghost/pick?slots=${tooMany.join(',')}&mode=top&anon=${anon}`), pickEnv(10),
  );
  assert.equal(rejected.status, 400);
});

const feedbackRequest = (eventId = 'event-fixed-00000001') => new Request('https://example.test/ghost/feedback', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Ghost-Anon': '11111111-1111-4111-8111-111111111111' },
  body: JSON.stringify({
    anonId: '11111111-1111-4111-8111-111111111111',
    fixedGuardianId: 'hatsune',
    slot: 'miguel',
    liked: true,
    eventId,
  }),
});

const fixedFeedbackEnv = (duplicate = false) => {
  const calls = [];
  return {
    calls,
    env: {
      GHOST_DB: {
        prepare(sql) {
          const statement = {
            bind(...params) {
              calls.push({ sql, params });
              return statement;
            },
            async first() {
              if (sql.includes('ghost_feedback_receipts')) {
                return duplicate ? null : { client_event_id: 'event-fixed-00000001' };
              }
              return null;
            },
            async run() { return { success: true }; },
          };
          return statement;
        },
      },
    },
  };
};

test('fixed guardians accept idempotent per-boss feedback', async () => {
  const first = fixedFeedbackEnv(false);
  const response = await handleGhostRequest(feedbackRequest(), first.env);
  assert.equal(response.status, 200);
  assert.equal(first.calls.filter(call => call.sql.includes('fixed_ghost_stats')).length, 1);

  const duplicate = fixedFeedbackEnv(true);
  const duplicateResponse = await handleGhostRequest(feedbackRequest(), duplicate.env);
  const duplicateBody = await duplicateResponse.json();
  assert.equal(duplicateBody.duplicate, true);
  assert.equal(duplicate.calls.filter(call => call.sql.includes('fixed_ghost_stats')).length, 0);
});

test('inbox returns own publish state and global fixed guardian counts', async () => {
  const prepared = [];
  const bound = [];
  const env = {
    GHOST_DB: {
      prepare(sql) {
        const statement = {
          bind(...params) { prepared.push(sql); bound.push(params); return statement; },
        };
        return statement;
      },
      async batch() {
        return [
          { results: [{ slot: 'miguel', used: 3, likes: 2, published: 1 }] },
          { results: [{ event_id: 4, slot: 'miguel', actor_name: 'Alice', liked: 1, created_at: 123 }] },
          { results: [{ guardian_id: 'hatsune', slot: 'miguel', used: 5, likes: 4 }] },
        ];
      },
    },
  };
  const response = await handleGhostRequest(
    new Request('https://example.test/ghost/inbox?anon=11111111-1111-4111-8111-111111111111'),
    env,
  );
  const body = await response.json();
  assert.equal(prepared.length, 3);
  assert.equal(prepared[0].includes('UNION'), true);
  assert.equal(bound[0].length, 10);
  assert.deepEqual(body.items[0], {
    slot: 'miguel', used: 3, likes: 2, published: true,
    recent: [{ name: 'Alice', liked: true, at: 123 }],
  });
  assert.deepEqual(body.fixed[0], { guardianId: 'hatsune', slot: 'miguel', used: 5, likes: 4 });
  assert.equal(body.cursor, 4);
});

// 2026-11-28 の調査: 端末の記録(格闘・英雄・吸血・スーパーアーマー・デュアルレンジ・グレネードガンIII・熟練度・育成)が
// 本番の枠では「マグナム+ポンプ式/救難信号・コンボマスター・パニッシャー/トラップだけ」に削られていた。
// 原因はリポジトリのコードではなく、本番の Worker が古い許可リストのまま(自動デプロイの鍵が未設定)だったこと。
// 今のクライアントが送る PUT の形を、そのまま今の putGhost に通し、保存される profile_json で持ち物が落ちない事を縛る
// (ここが緑で本番が削るなら、本番が古い=デプロイが要る、と切り分けられる)。
const putEnv = () => {
  const writes = [];
  return {
    writes,
    env: {
      GHOST_DB: {
        prepare(sql) {
          const statement = {
            bind(...params) { writes.push({ sql, params }); return statement; },
            async run() { return { success: true }; },
          };
          return statement;
        },
      },
    },
  };
};

const currentClientPut = (slot) => {
  const anonId = '22222222-2222-4222-8222-222222222222';
  const snapshot = {
    maxHealth: 230, speed: 87, level: 13,
    gunKeys: ['rifle-t1', 'handgun-t2-dualrange', 'glauncher-t3', 'shotgun-t2'], activeGunKey: 'handgun-t2-dualrange',
    meleeKey: 'anti-mutant-knife-t5',
    skills: ['rescue-signal', 'hero', 'vampire', 'combo-master', 'super-armor', 'punisher'],
    skillLevels: { 'rescue-signal': 3, hero: 1, vampire: 2, 'combo-master': 1, 'super-armor': 3, punisher: 2 },
    equipment: { body: 'body-mobility-2', arms: null, accessory: 'accessory-ammo-1' },
    equipBonus: {
      moveSpeedMult: 1.2, killGraceMult: 1, damageMult: 1, fireRateMult: 1, reloadMult: 1,
      critBonus: 0, ammoDropBonus: 0.1, scrapBonus: 0.1,
    },
    critChance: 0,
    subWeapons: ['marksman-trap', 'brawler'], startingSubWeapons: ['marksman-trap', 'brawler'],
    subWeaponLevels: { 'marksman-trap': 1, brawler: 3 },
    characterClass: 'mage', avatarId: 'cat-set',
    growthAtkMult: 1.1, growthCounterAcceptMs: 0,
    masteryMult: { 'rifle-t1': 1.2, brawler: 1.3 }, masteryLoadoutMult: 1.2,
  };
  const p = {
    v: 1, runs: 42, ...GHOST_PROFILE_DEFAULTS, srcName: '異能', srcClass: 'mage',
    moveReactions: {}, subStyles: {}, snapshot,
    bossStyles: {
      [slot]: {
        ...GHOST_PROFILE_DEFAULTS, srcName: '異能', srcClass: 'mage', subStyles: {}, snapshot,
        perfScore: 80, knobsV: 1, at: Date.now(),
      },
    },
  };
  return new Request('https://example.test/ghost', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Ghost-Anon': anonId },
    body: JSON.stringify({
      anonId, slot, epoch: GHOST_SHARE_EPOCH, knobsV: 1, buildVersion: '0.25.5931', perfScore: 80, profile: p,
    }),
  });
};

test('PUT keeps the current client build (brawler, new skills/guns, mastery, growth) and upserts by anon+slot', async () => {
  for (const slot of ['giantbat-stage-1', 'bounty-ranged', 'bounty-melee']) {
    const { writes, env } = putEnv();
    const response = await handleGhostRequest(currentClientPut(slot), env);
    assert.equal(response.status, 200, slot);
    const insert = writes.find(w => w.sql.includes('INSERT INTO ghost_records'));
    assert.ok(insert, slot);
    // 同じ匿名ID×枠×版の記録は新しい記録で置き換える(runs や評点で比べて残さない)。
    assert.match(insert.sql, /ON CONFLICT\(anon_id, slot, epoch\) DO UPDATE SET/);
    assert.match(insert.sql, /profile_json=excluded\.profile_json/);
    const stored = JSON.parse(insert.params[5]);
    const snap = stored.bossStyles[slot].snapshot;
    assert.deepEqual(snap.gunKeys, ['rifle-t1', 'handgun-t2-dualrange', 'glauncher-t3', 'shotgun-t2']);
    assert.equal(snap.activeGunKey, 'handgun-t2-dualrange');
    assert.deepEqual(snap.skills, ['rescue-signal', 'hero', 'vampire', 'combo-master', 'super-armor', 'punisher']);
    assert.deepEqual(snap.subWeapons, ['marksman-trap', 'brawler']);
    assert.equal(snap.subWeaponLevels.brawler, 3);
    assert.equal(snap.avatarId, 'cat-set');
    assert.equal(snap.growthAtkMult, 1.1);
    assert.deepEqual(snap.masteryMult, { 'rifle-t1': 1.2, brawler: 1.3 });
    assert.equal(snap.masteryLoadoutMult, 1.2);
    assert.equal(insert.params[6], 80); // perf
  }
});
