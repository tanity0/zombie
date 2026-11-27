// ★孫悟空のレベルと格闘技の体得(research/BRAWLER.md §36・社長指示2026-11-20)。体得の門・体得の条件(除外込み)・進行リセット・資料室の行・
// プレイヤーの浮き(§36-0)・幻影の浮きの区分・孫悟空のレベルの台本を固める。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const backing: Record<string, string> = {};
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (k in backing ? backing[k] : null),
  setItem: (k: string, v: string) => { backing[k] = v; },
  removeItem: (k: string) => { delete backing[k]; },
  clear: () => { for (const k of Object.keys(backing)) delete backing[k]; },
  key: () => null,
  get length() { return Object.keys(backing).length; },
} as Storage;

import { useGameStore } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { initialBrawlerState, BRAWLER_TECHS } from '../utils/brawler';
import { setBrawlerTempoAll, brawlerAirborne, brawlerLiftClass, brawlerLiftWeightClass } from '../utils/brawlerCombo';
import {
  setKenkiLevelForTest, loadKenkiLevel, saveKenkiLevel, kenkiLevelHealth, kenkiLevelLook, brawlerArtLearnedAt, brawlerArtLearnedOnKill,
  kenkiLevelAfterKill, kenkiSpawnLevel, kenkiChronicleKillPhrase, brawlerArtChroniclePhrase, KENKI_LEVEL_HP_BONUS, type KenkiLevel,
} from '../utils/kenkiLevel';
import { KENKI_LEVEL_NAMES } from '../data/kenkiNames';
import { isAvatarUnlocked, unlockAvatar, LOCKED_AVATARS } from '../utils/avatarUnlock';
import { AVATARS } from '../data/avatars';
import { avatarPartSrcRect } from '../utils/avatarPlacement';
import { resetProgress, loadChronicle, setSelectedStageId } from '../data/progress';
import { TUTORIALS, tutorialLinesFor, maskBrawlerMovesLines, BRAWLER_ART_HIDDEN_LINE } from '../data/tutorials';
import { playerLaunchPatch, playerAirLocked } from '../utils/playerLaunch';
import { pbScriptIdsForLevel, pbStepCost, pbScriptStepRunning, PB_SCRIPTS } from '../utils/phantomBrawlerAi';
import { brawlerStartTech } from '../utils/brawler';

setBrawlerTempoAll(1.0);
const NO_INPUT = { up: false, down: false, left: false, right: false };
let now = 9_000_000;
const ctxOk = { brawlerEquipped: true, practice: false, bossTest: false, bench: false, smoke: false };

beforeEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
  setKenkiLevelForTest(null);
  now = 9_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('§36-1 孫悟空のレベル(純関数)', () => {
  it('体力は今の式に積み上げ(+50/+120/+220)・済は Lv4 と同じ', () => {
    expect([1, 2, 3, 4, 5].map(l => kenkiLevelHealth(250, l as KenkiLevel))).toEqual([250, 300, 370, 470, 470]);
    expect(KENKI_LEVEL_HP_BONUS[5]).toBe(KENKI_LEVEL_HP_BONUS[4]);
  });
  it('色と名前(名前はデータの1か所)', () => {
    expect(KENKI_LEVEL_NAMES).toEqual({ 1: '孫悟空', 2: '弼馬温', 3: '斉天大聖', 4: '孫行者', 5: '斗戦勝仏' });
    expect([1, 2, 3, 4, 5].map(l => kenkiLevelLook(l as KenkiLevel).tint)).toEqual([null, 'blue', 'purple', 'red', 'gold']);
    expect([1, 2, 3, 4, 5].map(l => kenkiLevelLook(l as KenkiLevel).name)).toEqual(['孫悟空', '弼馬温', '斉天大聖', '孫行者', '斗戦勝仏']);
  });
  it('倒した後のレベル: 本編・格闘を装備した時だけ1段上がる(練習・ボス戦テスト・ベンチ・smoke・格闘なしは上がらない)・済で止まる', () => {
    expect(kenkiLevelAfterKill(1, ctxOk)).toBe(2);
    expect(kenkiLevelAfterKill(4, ctxOk)).toBe(5);
    expect(kenkiLevelAfterKill(5, ctxOk)).toBeNull();
    for (const k of ['practice', 'bossTest', 'bench', 'smoke'] as const) expect(kenkiLevelAfterKill(2, { ...ctxOk, [k]: true })).toBeNull();
    expect(kenkiLevelAfterKill(2, { ...ctxOk, brawlerEquipped: false })).toBeNull();
  });
  it('体得: Lv1 を倒すと抉り打ち・Lv2 で踵落とし・Lv3 で蹴り上げ・Lv4 で土竜(いまのレベル=次に出るレベルで見る)', () => {
    expect([1, 2, 3, 4, 5].map(l => brawlerArtLearnedOnKill(l as KenkiLevel))).toEqual(['gouge', 'heel', 'kickup', 'mogura', null]);
    expect(brawlerArtLearnedAt(1, 'gouge')).toBe(false);
    // すでに孫悟空を倒している端末(保存済みのレベルが2以上)は抉り打ちも体得済み=取り上げない
    for (const l of [2, 3, 4, 5] as KenkiLevel[]) expect(brawlerArtLearnedAt(l, 'gouge')).toBe(true);
    expect(brawlerArtLearnedAt(2, 'heel')).toBe(false);
    expect(brawlerArtLearnedAt(3, 'heel')).toBe(true);
    expect(brawlerArtLearnedAt(3, 'kickup')).toBe(false);
    expect(brawlerArtLearnedAt(4, 'kickup')).toBe(true);
    expect(brawlerArtLearnedAt(4, 'mogura')).toBe(false);
    expect(brawlerArtLearnedAt(5, 'mogura')).toBe(true);
  });
  it('対策室(練習)の孫悟空は Lv1 のまま(斗戦勝仏は出ない)', () => {
    expect(kenkiSpawnLevel(5, true)).toBe(1);
    expect(kenkiSpawnLevel(3, false)).toBe(3);
  });
  it('年表の文言', () => {
    expect(kenkiChronicleKillPhrase(2)).toBe('弼馬温を討伐');
    expect(brawlerArtChroniclePhrase('mogura')).toBe('格闘技『土竜』を体得');
  });
  it('進行リセットで Lv1 に戻る(体得も消える)', () => {
    saveKenkiLevel(4);
    expect(loadKenkiLevel()).toBe(4);
    resetProgress();
    expect(loadKenkiLevel()).toBe(1);
    expect(backing['zombie.progress.kenkiLevel']).toBeUndefined();
  });
});

describe('§36-1 孫悟空の台本(純関数)', () => {
  it('レベルで台本が増える(Lv2 踵落とし・Lv3 蹴り上げ→気功・Lv4 地割り→土竜)', () => {
    expect(pbScriptIdsForLevel(1)).toEqual([1, 2, 3, 4, 5]);
    expect(pbScriptIdsForLevel(2)).toEqual([1, 2, 3, 4, 5, 21]);
    expect(pbScriptIdsForLevel(3)).toEqual([1, 2, 3, 4, 5, 21, 22]);
    expect(pbScriptIdsForLevel(4)).toEqual([1, 2, 3, 4, 5, 21, 22, 23]);
    expect(pbScriptIdsForLevel(5)).toEqual(pbScriptIdsForLevel(4));
    expect(PB_SCRIPTS[21].map(x => (x.kind === 'tech' ? x.variant ?? x.tech : x.stage))).toEqual(['kick', 'kick', 'heel']);
    expect(PB_SCRIPTS[22].map(x => (x.kind === 'tech' ? x.variant ?? x.tech : x.stage))).toEqual(['kick', 'kick', 'kickup', 'kiko']);
    expect(PB_SCRIPTS[23].map(x => (x.kind === 'tech' ? x.variant ?? x.tech : x.stage))).toEqual(['mogura']);
  });
  it('派生の値段・出ている手の見分け', () => {
    const d = () => 0;
    expect(pbStepCost({ kind: 'tech', tech: 'kick', variant: 'heel' }, d)).toBe(BRAWLER_TECHS.kick.cost + 1);
    expect(pbStepCost({ kind: 'tech', tech: 'stomp', variant: 'mogura' }, d)).toBe(BRAWLER_TECHS.stomp.cost + 1);
    const heel = brawlerStartTech(initialBrawlerState(), 'kick', 0, 3, false, true, false);
    const plain3 = brawlerStartTech(initialBrawlerState(), 'kick', 0, 3);
    expect(pbScriptStepRunning(heel, PB_SCRIPTS[21], 2)).toBe(true);
    expect(pbScriptStepRunning(plain3, PB_SCRIPTS[21], 2)).toBe(false);
  });
});

describe('§36-0 浮かせる攻撃で誰でも浮く', () => {
  it('プレイヤー(純関数): 浮かせる当たりで雑魚と同じ弧・スーパーアーマー中は浮かない・浮かせない当たりは null', () => {
    const p = playerLaunchPatch(undefined, 's4', 1000, false)!;
    expect(p).not.toBeNull();
    expect(brawlerAirborne(p, 1001)).toBe(true);
    expect(playerLaunchPatch(undefined, 's4', 1000, true)).toBeNull();
    expect(playerLaunchPatch(undefined, 's1', 1000, false)).toBeNull(); // 地上で1段目は浮かない(雑魚と同じ)
    expect(playerAirLocked({ brAir: p }, 1001)).toBe(true);
  });
  it('プレイヤー(ストア): 浮いている間は動けず、格闘も出せない', () => {
    useGameStore.getState().resetGame('warrior');
    useGameStore.setState(st => ({ m0Unlocked: { ...st.m0Unlocked, melee: true }, player: { ...st.player, subWeapons: ['brawler'], subWeaponLevels: { brawler: 2 }, brawler: { ...initialBrawlerState(), points: 10 } } }));
    expect(useGameStore.getState().launchPlayer('s4', 5)).toBe(true);
    const x0 = useGameStore.getState().player.x;
    expect(useGameStore.getState().brawlerPress()).toBe(false);
    expect(useGameStore.getState().brawlerTech(1, 0)).toBe(false);
    for (let k = 0; k < 10; k++) { now += 16; useGameStore.getState().movePlayer({ ...NO_INPUT, right: true } as never, 0.016); }
    expect(useGameStore.getState().player.x).toBeCloseTo(x0, 3);
    now += 3000; // 着地した後は動ける
    for (let k = 0; k < 10; k++) { now += 16; useGameStore.getState().movePlayer({ ...NO_INPUT, right: true } as never, 0.016); }
    expect(useGameStore.getState().player.x).toBeGreaterThan(x0);
  });
  it('幻影(孫悟空を含む)の浮きは雑魚の値(区分そのものは変えない)', () => {
    const gp = spawnEnemyAt('guardian-phantom', 0, 0, 0);
    expect(brawlerLiftClass(gp)).toBe('mob');
    expect(brawlerLiftWeightClass(gp, 'boss')).toBe('mob');
    expect(brawlerLiftWeightClass(spawnEnemyAt('hunter', 0, 0, 0), 'boss')).toBe('boss');
  });
});

describe('§36-2 体得の門(ストア)', () => {
  const setup = (lv: KenkiLevel) => {
    setKenkiLevelForTest(lv);
    useGameStore.getState().resetGame('warrior');
    useGameStore.setState(st => ({
      m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
      player: { ...st.player, health: 9999, maxHealth: 9999, subWeapons: ['brawler'], subWeaponLevels: { brawler: 2 }, lastDirection: { x: 1, y: 0 }, brawler: { ...initialBrawlerState(), points: 20 } },
      skillProcFeed: [],
    }));
    const p = useGameStore.getState().player;
    const e = spawnEnemyAt('zombie', 0, 0, 0);
    e.x = p.x + p.width / 2 + 120 - e.width / 2; e.y = p.y + p.height / 2 - e.height / 2; e.health = 99999; e.maxHealth = 99999; e.id = 'z';
    useGameStore.setState({ enemies: [e] });
  };
  const advance = (ms: number) => {
    const end = now + ms;
    while (now < end) {
      now += 10;
      if (now - 10 < useGameStore.getState().hitstopUntil) continue;
      useGameStore.setState(st => ({ gameTime: st.gameTime + 10 }));
      useGameStore.getState().movePlayer(NO_INPUT as never, 0.01);
      useGameStore.getState().tickBrawler();
    }
  };
  const br = () => useGameStore.getState().player.brawler!;
  const waitHit = () => { for (let k = 0; k < 120 && !(br().resolved && !(useGameStore.getState().gameTime < br().stopUntil)); k++) advance(10); };
  const kick2 = () => { for (let i = 0; i < 2; i++) { useGameStore.getState().brawlerTech(1, 0); waitHit(); } };
  it('体得前: 空中蹴りの後の下=地割り・上=蹴り上げにならない・地割りの溜めの上=土竜にならない', () => {
    setup(1);
    kick2();
    useGameStore.getState().brawlerTech(0, 1);
    expect(br().kickHeel).toBeFalsy();
    for (let k = 0; k < 40 && br().tech !== 'stomp'; k++) advance(10);
    expect(br().tech).toBe('stomp');
    setup(1);
    kick2();
    useGameStore.getState().brawlerTech(0, -1);
    expect(br().kickUp).toBeFalsy();
    expect(br().kickUpBuffer).toBeFalsy();
    setup(1);
    useGameStore.getState().brawlerTech(0, 1);
    advance(80);
    useGameStore.getState().brawlerTech(0, -1);
    expect(br().mogura).toBeFalsy();
  });
  it('段ごとに体得: Lv3(=Lv2 撃破)で踵落とし・Lv4 で蹴り上げ・済で土竜', () => {
    setup(3); kick2(); useGameStore.getState().brawlerTech(0, 1); expect(br().kickHeel).toBe(true);
    setup(3); kick2(); useGameStore.getState().brawlerTech(0, -1); expect(br().kickUp).toBeFalsy();
    setup(4); kick2(); useGameStore.getState().brawlerTech(0, -1); expect(br().kickUp).toBe(true);
    setup(4); useGameStore.getState().brawlerTech(0, 1); advance(80); useGameStore.getState().brawlerTech(0, -1); expect(br().mogura).toBeFalsy();
    setup(5); useGameStore.getState().brawlerTech(0, 1); advance(80); useGameStore.getState().brawlerTech(0, -1); expect(br().mogura).toBe(true);
  });
});

describe('§36-1・§36-2 孫悟空を倒す(ストア)', () => {
  const kill = (lv: KenkiLevel, equipped = true, bench = false) => {
    setSelectedStageId('stage-3');
    useGameStore.getState().resetGame('rogue');
    useGameStore.setState(st => ({ benchmarkRun: bench, player: { ...st.player, subWeapons: equipped ? ['brawler'] : [] }, wallBandText: '' }));
    const e = spawnEnemyAt('guardian-phantom', 400, 400, useGameStore.getState().gameTime);
    e.health = 1; e.maxHealth = 130; e.dormant = false; e.bossState = 'chase'; e.phantomUnique = 'brawler'; e.kenkiLv = lv;
    useGameStore.setState({ enemies: [e] });
    useGameStore.getState().damageEnemy(e.id, 999999);
  };
  it('Lv2 を格闘で倒す: Lv3 へ・金の帯「格闘技 体得 ― 踵落とし」・リザルトの1行・年表(討伐と体得)', () => {
    saveKenkiLevel(2);
    kill(2);
    expect(loadKenkiLevel()).toBe(3);
    expect(useGameStore.getState().wallBandText).toBe('格闘技 体得 ― 踵落とし');
    expect(useGameStore.getState().wallBandColor).toBe('gold');
    expect(useGameStore.getState().brawlerArtsLearnedThisRun).toEqual(['踵落とし']);
    const labels = loadChronicle().map(e => e.label);
    expect(labels.some(l => l.endsWith('弼馬温を討伐'))).toBe(true);
    expect(labels.some(l => l.endsWith('格闘技『踵落とし』を体得'))).toBe(true);
  });
  it('Lv1 を格闘で倒す: Lv2 へ・金の帯「格闘技 体得 ― 抉り打ち」・リザルトの1行・年表(討伐と体得)', () => {
    kill(1);
    expect(loadKenkiLevel()).toBe(2);
    expect(useGameStore.getState().wallBandText).toBe('格闘技 体得 ― 抉り打ち');
    expect(useGameStore.getState().wallBandColor).toBe('gold');
    expect(useGameStore.getState().brawlerArtsLearnedThisRun).toEqual(['抉り打ち']);
    const labels = loadChronicle().map(e => e.label);
    expect(labels.some(l => l.endsWith('孫悟空を討伐'))).toBe(true);
    expect(labels.some(l => l.endsWith('格闘技『抉り打ち』を体得'))).toBe(true);
  });
  it('Lv1 を格闘なしで倒しても抉り打ちは体得しない', () => {
    kill(1, false);
    expect(loadKenkiLevel()).toBe(1);
    expect(useGameStore.getState().wallBandText).toBe('');
    expect(useGameStore.getState().brawlerArtsLearnedThisRun).toEqual([]);
  });
  it('格闘を装備していない・ベンチでは上がらない(年表にも出さない)', () => {
    saveKenkiLevel(2);
    kill(2, false);
    expect(loadKenkiLevel()).toBe(2);
    kill(2, true, true);
    expect(loadKenkiLevel()).toBe(2);
    expect(loadChronicle().some(e => e.label.endsWith('弼馬温を討伐'))).toBe(false);
  });
});

describe('斗戦勝仏を初めて倒した報酬(アバター「斗戦勝仏セット」)', () => {
  const kill = (lv: KenkiLevel, equipped = true, bench = false) => {
    setSelectedStageId('stage-3');
    useGameStore.getState().resetGame('rogue');
    useGameStore.setState(st => ({ benchmarkRun: bench, player: { ...st.player, subWeapons: equipped ? ['brawler'] : [] }, wallBandText: '' }));
    const e = spawnEnemyAt('guardian-phantom', 400, 400, useGameStore.getState().gameTime);
    e.health = 1; e.maxHealth = 130; e.dormant = false; e.bossState = 'chase'; e.phantomUnique = 'brawler'; e.kenkiLv = lv;
    useGameStore.setState({ enemies: [e] });
    useGameStore.getState().damageEnemy(e.id, 999999);
  };
  it('手に入れるまで選べない(既存のセットは最初から選べる)・付けようとしても付かない', () => {
    expect(isAvatarUnlocked('tosen-set')).toBe(false);
    expect(isAvatarUnlocked('cat-set')).toBe(true);
    expect(LOCKED_AVATARS).toEqual(['tosen-set']);
    useGameStore.getState().setAvatarId('tosen-set');
    expect(useGameStore.getState().avatarId).not.toBe('tosen-set');
  });
  it('済(斗戦勝仏)を格闘で倒す: 手に入る・金の帯・リザルトの1行。2回目は何も出ない', () => {
    saveKenkiLevel(5);
    kill(5);
    expect(isAvatarUnlocked('tosen-set')).toBe(true);
    expect(useGameStore.getState().wallBandText).toBe('アバター 入手 ― 斗戦勝仏セット');
    expect(useGameStore.getState().wallBandColor).toBe('gold');
    expect(useGameStore.getState().avatarsEarnedThisRun).toEqual(['斗戦勝仏セット']);
    useGameStore.getState().setAvatarId('tosen-set');
    expect(useGameStore.getState().avatarId).toBe('tosen-set');
    kill(5);
    expect(useGameStore.getState().wallBandText).toBe('');
    expect(useGameStore.getState().avatarsEarnedThisRun).toEqual([]);
    useGameStore.getState().setAvatarId(null);
  });
  it('Lv4 以下・格闘なし・ベンチでは手に入らない', () => {
    saveKenkiLevel(4);
    kill(4);
    expect(isAvatarUnlocked('tosen-set')).toBe(false);
    saveKenkiLevel(5);
    kill(5, false);
    kill(5, true, true);
    expect(isAvatarUnlocked('tosen-set')).toBe(false);
    expect(useGameStore.getState().avatarsEarnedThisRun).toEqual([]);
  });
  it('進行リセットで消える', () => {
    expect(unlockAvatar('tosen-set')).toBe(true);
    expect(unlockAvatar('tosen-set')).toBe(false);
    resetProgress();
    expect(isAvatarUnlocked('tosen-set')).toBe(false);
  });
  it('1枚の絵から切る: 緊箍児(左)と如意棒(右)は x=32 の隙間で分かれる・crop の無い物は全体', () => {
    const parts = AVATARS['tosen-set'].parts;
    const band = parts.find(p => p.layer === 'above')!, staff = parts.find(p => p.layer === 'below')!;
    const rb = avatarPartSrcRect(band, 68, 34), rs = avatarPartSrcRect(staff, 68, 34);
    expect(rb.x + rb.w).toBeLessThanOrEqual(32);
    expect(rs.x).toBeGreaterThanOrEqual(32);
    expect(rs.x + rs.w).toBeLessThanOrEqual(68);
    expect(avatarPartSrcRect(AVATARS['cat-set'].parts[0], 24, 12)).toEqual({ x: 0, y: 0, w: 24, h: 12 });
  });
});

describe('§36-2 資料室の技一覧', () => {
  const entry = TUTORIALS.find(t => t.id === 'brawler-moves')!;
  it('体得していない技の行は「？？？」(3種の操作とも)', () => {
    for (const lines of [entry.lines, entry.pcLines!, entry.padLines!]) {
      const none = maskBrawlerMovesLines(lines, () => false);
      expect(none.filter(l => l === BRAWLER_ART_HIDDEN_LINE).length).toBe(4);
      expect(none.join('')).not.toMatch(/抉り打ち|踵落とし|蹴り上げ|土竜/);
      const heelOnly = maskBrawlerMovesLines(lines, a => a === 'heel');
      expect(heelOnly.join('')).toContain('踵落とし');
      expect(heelOnly.filter(l => l === BRAWLER_ART_HIDDEN_LINE).length).toBe(3);
      const gougeOnly = maskBrawlerMovesLines(lines, a => a === 'gouge');
      expect(gougeOnly.join('')).toContain('抉り打ち');
      expect(gougeOnly.filter(l => l === BRAWLER_ART_HIDDEN_LINE).length).toBe(3);
      expect(maskBrawlerMovesLines(lines, () => true)).toEqual(lines);
    }
  });
  it('資料室の本文はいまのレベルで伏せる', () => {
    setKenkiLevelForTest(1);
    expect(tutorialLinesFor(entry, 'touch').filter(l => l === BRAWLER_ART_HIDDEN_LINE).length).toBe(4);
    setKenkiLevelForTest(2); // Lv1 撃破=抉り打ちだけ見える
    expect(tutorialLinesFor(entry, 'touch').filter(l => l === BRAWLER_ART_HIDDEN_LINE).length).toBe(3);
    expect(tutorialLinesFor(entry, 'touch').join('')).toContain('抉り打ち');
    setKenkiLevelForTest(5);
    expect(tutorialLinesFor(entry, 'touch')).toEqual(entry.lines);
  });
});
