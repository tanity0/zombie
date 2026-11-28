import { describe, it, expect } from 'vitest';
import { ESCORT_SCENE_LINES, escortSceneLine, type EscortScene } from './escortSceneLines';

const SCENES: EscortScene[] = ['downed', 'revived', 'targeted'];
const ROSTER = 8;

describe('escortSceneLines: 台詞の台帳(research/ESCORT_TARGETED.md §7)', () => {
  it('★・矢印・絵文字・内部語を含まない', () => {
    const bad = /[★☆→←↑↓⇒]|[\u{1F300}-\u{1FAFF}]|流星|aiPhase|bossState|ヘイト|設計書|監査/u;
    for (const sc of SCENES) for (const [i, t] of Object.entries(ESCORT_SCENE_LINES[sc])) {
      expect(bad.test(t), `${sc}/${i}: ${t}`).toBe(false);
    }
  });
  it('名簿外のindexは載せない(0..7)', () => {
    for (const sc of SCENES) for (const k of Object.keys(ESCORT_SCENE_LINES[sc])) {
      expect(Number(k)).toBeGreaterThanOrEqual(0); expect(Number(k)).toBeLessThan(ROSTER);
    }
  });
  it('8人×全場面を埋めない: 倒れた/ボスの予告は喋らない人が居る・倒れた瞬間は短い(断片)', () => {
    expect(Object.keys(ESCORT_SCENE_LINES.downed).length).toBeLessThan(ROSTER - 1);
    expect(Object.keys(ESCORT_SCENE_LINES.targeted).length).toBeLessThan(ROSTER - 1);
    for (const t of Object.values(ESCORT_SCENE_LINES.downed)) expect(t.length).toBeLessThanOrEqual(16);
  });
  it('起こされた時の台詞は人格が出る一言(全員分あってよい)で、倒れた/予告より長い人が居る', () => {
    expect(Object.keys(ESCORT_SCENE_LINES.revived).length).toBeGreaterThan(Object.keys(ESCORT_SCENE_LINES.downed).length);
  });
  it('「……」は全体で4本以下(全員が同じ呼吸で喋らない=クリエイティブ監査 DC-1 #22)', () => {
    const all = SCENES.flatMap(sc => Object.values(ESCORT_SCENE_LINES[sc]));
    expect(all.filter(t => t.includes('……')).length).toBeLessThanOrEqual(4);
  });
  it('存在しない挙動を約束しない(軍人に回避行動は無い)・危機の反応は短い(DC-1 #23/#24)', () => {
    for (const t of Object.values(ESCORT_SCENE_LINES.targeted)) { expect(t).not.toMatch(/回避|避け|逃げ/); expect(t.length).toBeLessThanOrEqual(16); }
  });
  it('実機で流れる声(npcLines のバリアント)と口調がつながる: 末尾の特徴が一致(チェン=軍師/ムハンマド=です・ます/エリザベス=ですわ)', () => {
    expect(ESCORT_SCENE_LINES.revived[5]).toMatch(/僕/);
    expect(ESCORT_SCENE_LINES.revived[4]).toMatch(/ます/);
    expect(ESCORT_SCENE_LINES.targeted[4]).toMatch(/ます/);
    expect(ESCORT_SCENE_LINES.revived[2]).toMatch(/わ/);
  });
  it('未登録=空文字(何も出さない)', () => {
    expect(escortSceneLine(3, 'downed')).toBe('');
    expect(escortSceneLine(99, 'revived')).toBe('');
    expect(escortSceneLine(7, 'revived')).not.toBe('');
  });
});
