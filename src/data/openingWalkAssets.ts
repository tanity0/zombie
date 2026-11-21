// オープニングの楽屋通路(歩きシーン)の素材の URL。OpeningScene が使い、App が起動直後にゲーム本体より先に読み込む
// (社長指示2026-10-29「オープニング毎回ローディングあるけどなんで?」→「はい」: 本体の読み込みと取り合って順番待ちになっていた)。
const BASE = import.meta.env.BASE_URL;
const A = (f: string) => `${BASE}opening/${f}`;

// hero-blue: v0.25.2100で色ありドット絵素材に同名差し替え→旧素材のキャッシュ対策で一回きりのバスター付き。
export const OPENING_HERO = A('hero-blue.png?v=2101');
export const OPENING_WALK_BG = A('walk-stage-bg.png');
export const OPENING_WALK_BG_BLUR = A('walk-stage-bg-blur.png');
export const OPENING_WALK_FRAMES = Array.from({ length: 4 }, (_, n) => A(`walk/hero-walk-${n}.png`));
export const OPENING_NPC_FRAMES = Array.from({ length: 8 }, (_, n) => A(`walk/npc-walk-${n}.png`));

/** 歩きシーンが始まるまでに揃っている必要がある素材(OpeningScene の待ちと同じ並び)。 */
export const OPENING_WALK_ASSETS: readonly string[] = [OPENING_WALK_BG, OPENING_WALK_BG_BLUR, ...OPENING_WALK_FRAMES, ...OPENING_NPC_FRAMES, OPENING_HERO];

/**
 * 歩きシーンの素材を先に読み込む(読み終えるか maxMs で解決・失敗しても解決)。
 * 同じ URL を OpeningScene がもう一度読むが、ブラウザのキャッシュから出るので通信は1回で済む。
 */
export const preloadOpeningWalk = (maxMs: number): Promise<void> => {
  const all = Promise.all(OPENING_WALK_ASSETS.map(src => { const im = new Image(); im.src = src; return im.decode().catch(() => {}); })).then(() => {});
  return Promise.race([all, new Promise<void>(res => { window.setTimeout(res, maxMs); })]);
};
