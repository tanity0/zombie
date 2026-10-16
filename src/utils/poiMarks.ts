// 寄り道・巣の色(リザルトの到達図と一時停止の地図で共通=同じ場所が画面ごとに別の色にならないように)。
import type { Poi } from '../world/pois';

export const POI_MARK_COLOR: Record<Poi['kind'], string> = {
  hospital: '#7BE8A8',
  boss: '#FF6A55',
  cave: '#F59E0B',
  armory: '#FBBF24', // §6.24 M48: 武器庫(スクラップ色)
  police: '#60A5FA', // §6.24 M48: 警察署
};
