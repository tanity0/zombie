import { describe, it, expect } from 'vitest';
import { TUTORIALS, parseTutorialLine, isMoveTable, maskBrawlerMovesLines, BRAWLER_ART_HIDDEN_LINE, tutorialLinesFor, brawlerArtRowNames } from './tutorials';
import { BRAWLER_ART_NAME, type BrawlerArt } from '../utils/kenkiLevel';
import { BRAWLER_TECH_NAMES } from './brawlerTechNames';

// 資料室の格闘=格闘ゲームの技表(区分の見出し+「技名\tコマンド」の行)。
const entry = TUTORIALS.find(t => t.id === 'brawler-moves')!;
const all = [entry.lines, entry.pcLines!, entry.padLines!];
const shape = (lines: readonly string[]) => lines.map(l => {
  const p = parseTutorialLine(l);
  return p.kind === 'move' ? `move:${p.name}` : p.kind === 'heading' ? `h:${p.text}` : 'text';
});

describe('資料室の格闘の技表', () => {
  it('3種の操作とも同じ構成(同じ見出し・同じ技名が同じ順)', () => {
    expect(shape(entry.pcLines!)).toEqual(shape(entry.lines));
    expect(shape(entry.padLines!)).toEqual(shape(entry.lines));
    expect(shape(entry.lines).filter(s => s.startsWith('h:'))).toEqual(['h:通常技', 'h:特殊技', 'h:必殺技', 'h:投げ', 'h:奥義']);
  });
  it('技名は技の行の名前(通信の下の行)と同じ表記', () => {
    const known = new Set([...Object.values(BRAWLER_TECH_NAMES).map(v => v.name), '通常攻撃']);
    for (const lines of all) for (const l of lines) {
      const p = parseTutorialLine(l);
      if (p.kind === 'move') { expect(known.has(p.name)).toBe(true); expect(p.command.length).toBeGreaterThan(0); }
    }
  });
  it('数値を書かない', () => {
    for (const lines of all) for (const l of lines) expect(l.replace(/[×]5/, '')).not.toMatch(/[0-9]/);
  });
  it('技表の書き方は格闘だけ(他の操作記録は今までどおり段落で描く)', () => {
    expect(isMoveTable(entry.lines)).toBe(true);
    for (const t of TUTORIALS) if (t.id !== 'brawler-moves') {
      for (const lines of [t.lines, t.pcLines ?? [], t.padLines ?? []]) expect(isMoveTable(lines)).toBe(false);
    }
  });
  it('伏せ: 体得していない技の行だけが「？？？」になり、見出し・行の数・ほかの行はそのまま', () => {
    const arts = Object.keys(BRAWLER_ART_NAME) as BrawlerArt[];
    for (const lines of all) {
      const none = maskBrawlerMovesLines(lines, () => false);
      expect(none.length).toBe(lines.length);
      none.forEach((l, i) => {
        const p = parseTutorialLine(lines[i]);
        const hidden = p.kind === 'move' && arts.some(a => brawlerArtRowNames(a).includes(p.name));
        expect(l).toBe(hidden ? BRAWLER_ART_HIDDEN_LINE : lines[i]);
      });
      // コマンドの欄に「空中蹴り」「地割り」が書いてあっても、その行の技名が伏せの対象でなければ伏せない。
      expect(none).toContain(lines.find(l => l.startsWith('空中蹴り\t')));
      expect(none).toContain(lines.find(l => l.startsWith('地割り\t')));
    }
  });
  it('伏せは技名の欄で見分ける=伏せの対象に技が増えても(例: 抉り打ち)その1行だけが伏せられる', () => {
    // 抉り打ちが体得制になった時と同じ見分け方: 技名の欄が一致する行を1行だけ持つ。
    for (const lines of all) {
      const rows = lines.filter(l => { const p = parseTutorialLine(l); return p.kind === 'move' && p.name === BRAWLER_TECH_NAMES['tech:gouge'].name; });
      expect(rows.length).toBe(1);
      for (const art of Object.keys(BRAWLER_ART_NAME) as BrawlerArt[]) {
        expect(lines.filter(l => { const p = parseTutorialLine(l); return p.kind === 'move' && p.name === BRAWLER_ART_NAME[art]; }).length).toBe(1);
      }
    }
  });
  it('空中投げ: 投げの区分に1行(パニッシャー所持)。蹴り上げを体得するまでは蹴り上げと一緒に伏せる', () => {
    for (const lines of all) {
      const i = lines.findIndex(l => l.startsWith('空中投げ\t'));
      const p = parseTutorialLine(lines[i]);
      expect(p.kind === 'move' && p.command.startsWith('空中蹴り中に ↑') && p.note === 'パニッシャー所持').toBe(true);
      const heads = lines.slice(0, i).filter(l => l.startsWith('# '));
      expect(heads[heads.length - 1]).toBe('# 投げ');
      const noKickUp = maskBrawlerMovesLines(lines, a => a !== 'kickup');
      expect(noKickUp[i]).toBe(BRAWLER_ART_HIDDEN_LINE);
      expect(noKickUp[lines.findIndex(l => l.startsWith('蹴り上げ\t'))]).toBe(BRAWLER_ART_HIDDEN_LINE);
      expect(noKickUp.filter(l => l === BRAWLER_ART_HIDDEN_LINE).length).toBe(2);
      expect(maskBrawlerMovesLines(lines, a => a === 'kickup')[i]).toBe(lines[i]);
    }
  });
  it('パッドの本文は刻印の字に置き換わり、技表の形は崩れない', () => {
    const pad = tutorialLinesFor({ ...entry, id: 'x' }, 'pad', 'xbox');
    expect(pad.join('')).not.toMatch(/\{press\}|\{flick\}/);
    expect(shape(pad)).toEqual(shape(entry.lines));
  });
});
