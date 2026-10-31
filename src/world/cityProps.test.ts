// ★散布オブジェクトの一括ゲート(社長「はい」2026-09-25・v0.25.4640)。
// ボスメーカーの部屋は「壁なし・障害物なし・ボス1体だけ」(BOSS_MAKER.md §1-1)。木・松明・地雷・花は
// 既に消していたが、**城ボスの部屋がそのボスのステージで立つ**ようになった(v0.25.4639)ので、
// 森以外の散布オブジェクト(当たり判定あり)が初めて部屋へ入ってきた。それを消すゲートの不変条件。
import { describe, it, expect, afterEach } from 'vitest';
import { cityPropsInRegion, resolveCityPropCollision, setCityPropsDisabled, CITY_SAFE_RADIUS } from './cityProps';

afterEach(() => setCityPropsDisabled(false));

const REGION = [-4000, -4000, 4000, 4000] as const;
// 散布カタログを持つ farKey(森は木システムが担当するので空)。
const FAR = 'stage5';

describe('★散布オブジェクトを消すゲート', () => {
  it('既定では散布されている(このテスト自体が空振りしない)', () => {
    expect(cityPropsInRegion(FAR, ...REGION).length).toBeGreaterThan(0);
  });

  it('★消すと1つも返らない(描画も当たり判定も同じ関数を通るので両方消える)', () => {
    setCityPropsDisabled(true);
    expect(cityPropsInRegion(FAR, ...REGION)).toEqual([]);
  });

  it('★当たり判定も消える(押し戻しが起きない)', () => {
    // 散布されている中から、実際に押し戻される位置を1つ探す。
    const props = cityPropsInRegion(FAR, ...REGION);
    const hit = props.find(p => {
      const r = { x: p.footX - 8, y: p.footY - 8, width: 16, height: 16 };
      const out = resolveCityPropCollision(FAR, r);
      return out.x !== r.x || out.y !== r.y;
    });
    expect(hit, '押し戻される位置が見つからない=このテストが空振りしている').toBeTruthy();
    const rect = { x: hit!.footX - 8, y: hit!.footY - 8, width: 16, height: 16 };
    setCityPropsDisabled(true);
    expect(resolveCityPropCollision(FAR, rect)).toEqual({ x: rect.x, y: rect.y });
  });

  it('戻せる(部屋を出た次の出撃で元通り=モジュール状態が焼き付かない)', () => {
    setCityPropsDisabled(true);
    expect(cityPropsInRegion(FAR, ...REGION)).toEqual([]);
    setCityPropsDisabled(false);
    expect(cityPropsInRegion(FAR, ...REGION).length).toBeGreaterThan(0);
  });

  it('原点まわりの安全半径は元からある(部屋の中心は素でも空いている)', () => {
    for (const p of cityPropsInRegion(FAR, ...REGION)) {
      expect(Math.hypot(p.footX, p.footY)).toBeGreaterThanOrEqual(CITY_SAFE_RADIUS);
    }
  });
});
