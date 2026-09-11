import './commandHome.css';
import { REGION_ART } from '../config/uiDesign';
import { PixelIcon, type PixelIconName } from './PixelIcon';
import { playSfx } from '../audio/audioManager';

interface Props {
  stageId: string;
  location: string;
  day?: number;
  gold: number;
  skills: number;
  unread: number;
  onSortie: () => void;
  onLoadout: () => void;
  onGrowth: () => void;
  onDevelopment: () => void;
  onArchive: () => void;
  onGuardians: () => void;
  onBoss: () => void;
  onOptions: () => void;
}

export default function CommandHome(p: Props) {
  const art = REGION_ART[p.stageId];
  const oldUrl = new URL(window.location.href);
  oldUrl.searchParams.set('design', '0');
  oldUrl.searchParams.delete('dsloadout');
  const actions: { title: string; en: string; detail: string; icon: PixelIconName; run: () => void }[] = [
    { title: '装備を整える', en: 'LOADOUT', detail: '武器・サブウェポン・アバター', icon: 'swords', run: p.onLoadout },
    { title: '能力を強化', en: 'GROWTH', detail: '体力・攻撃・弾数を強化', icon: 'trending-up', run: p.onGrowth },
    { title: '開発施設', en: 'RESEARCH', detail: 'スキルとサブウェポンの解放', icon: 'wrench', run: p.onDevelopment },
  ];
  const go = (fn: () => void) => { playSfx('ui-select'); fn(); };
  return (
    <div className="command-home">
      <header className="command-header">
        <div className="command-wordmark">the <strong>ONE</strong><span>作戦司令室</span></div>
        <div className="command-header-right"><span className="command-money">{p.gold.toLocaleString()} <small>G</small></span><button type="button" onClick={() => go(p.onOptions)} aria-label="オプション"><PixelIcon name="gear" size={19} /></button></div>
      </header>
      <main className="command-content">
        <section className="command-operation" aria-label="次の作戦">
          {art && <img className="command-region-art" src={`${import.meta.env.BASE_URL}backgrounds/${art}`} alt="" />}
          <div className="command-hero-shade" />
          <div className="command-operation-top"><span><PixelIcon name="crosshair" size={15} /> NEXT OPERATION</span>{p.day !== undefined && <span>DAY {p.day}</span>}</div>
          <div className="command-operation-copy"><span className="command-eyebrow">次の作戦地域</span><h1>{p.location}</h1><p>準備を整え、次の作戦へ。</p><button type="button" className="command-sortie" onClick={() => go(p.onSortie)}><span>出撃する<small>作戦地域を選択</small></span><PixelIcon name="arrow-up-right" size={28} /></button></div>
          <div className="command-hero-foot"><span>OPERATION / the ONE</span><span>装備は全作戦共通</span></div>
        </section>
        <section className="command-preparation" aria-labelledby="command-prep-title">
          <div className="command-section-title"><span>01 / PREPARATION</span><h2 id="command-prep-title">出撃の準備</h2></div>
          <div className="command-action-list">{actions.map(({ title, en, detail, icon, run }, i) => <button key={en} type="button" className="command-action" onClick={() => go(run)}><span className="command-action-icon"><PixelIcon name={icon} size={23} /></span><span className="command-action-copy"><small>{en}</small><strong>{title}</strong><span>{detail}</span></span><span className="command-action-end"><small>0{i + 1}</small><PixelIcon name="chevron-right" size={16} /></span></button>)}</div>
          <div className="command-inventory"><span>解禁済みスキル</span><strong>{p.skills}<small> SKILLS</small></strong></div>
        </section>
        <section className="command-records" aria-label="記録と訓練">
          <div className="command-section-title"><span>02 / ARCHIVE & TRAINING</span><h2>記録と訓練</h2></div>
          <div className="command-record-grid">
            <button type="button" onClick={() => go(p.onArchive)}><PixelIcon name="book" size={20} /><span><strong>資料室 {p.unread > 0 && <em>NEW</em>}</strong><small>記録・変異体資料</small></span><PixelIcon name="arrow-up-right" size={16} /></button>
            <button type="button" onClick={() => go(p.onGuardians)}><PixelIcon name="shield" size={20} /><span><strong>守護霊</strong><small>名前・討伐記録</small></span><PixelIcon name="arrow-up-right" size={16} /></button>
            <button type="button" onClick={() => go(p.onBoss)}><PixelIcon name="crosshair" size={20} /><span><strong>変異体対策室</strong><small>ボス再戦・練習</small></span><PixelIcon name="arrow-up-right" size={16} /></button>
          </div>
        </section>
      </main>
      <footer className="command-footer"><span>OPERATION SYSTEM</span><a href={oldUrl.toString()}>旧デザインと比較 ↗</a><span>v{__APP_VERSION__}</span></footer>
    </div>
  );
}
