// 端末カバレッジの正本(v0.25.1775・アプリ化=フルスクリーン前提の対応方針)。
// 「どの端末サイズでピクセルスナップ(ドット潰れ対策)が効くべきか」を1箇所で管理し、
// deviceCoverage.test.ts が computeViewport×snapTexelRatio の帯で機械検査する
// (VIEW_CORE/MAX やスナップ帯を将来変えたら、このリストとの矛盾で赤くなる=教訓の機械化)。
// スクショ検証ツール scripts/device-sweep.mjs も同じ一覧を使う(あちらは複製・変更時は両方更新)。

export interface DeviceViewport {
  name: string;
  w: number;  // CSS px(縦持ち)
  h: number;
  // true = スナップ帯内であるべき(常用サポート機)。false = 帯外が既知の制限(テストは「帯外のまま」を確認)。
  supported: boolean;
}

export const DEVICE_VIEWPORTS: DeviceViewport[] = [
  // --- サポート対象(フルスクリーン起動・スナップ帯内であるべき) ---
  { name: 'iPhone SE2/SE3', w: 375, h: 667, supported: true },
  { name: 'iPhone X/11Pro/12mini/13mini', w: 375, h: 812, supported: true },
  { name: 'iPhone 12/13/14', w: 390, h: 844, supported: true },
  { name: 'iPhone 14Pro/15/16', w: 393, h: 852, supported: true },
  { name: 'iPhone 16Pro', w: 402, h: 874, supported: true },
  { name: 'iPhone XR/11', w: 414, h: 896, supported: true },
  { name: 'iPhone 15Plus/ProMax級', w: 430, h: 932, supported: true },
  { name: 'iPhone 16ProMax', w: 440, h: 956, supported: true },
  { name: 'Android 360dp級(Galaxy S標準表示)', w: 360, h: 800, supported: true },
  { name: 'Android 360dp級(旧16:9)', w: 360, h: 640, supported: true },
  { name: 'Android 384dp級', w: 384, h: 854, supported: true },
  { name: 'Android 393dp級(Pixel5等)', w: 393, h: 851, supported: true },
  { name: 'Android 412dp級(Pixel7-9/Galaxy大)', w: 412, h: 915, supported: true },
  // --- 既知の制限(帯外のまま=対応しない。ENGINEERING_NOTES「端末カバレッジの対応方針」) ---
  { name: 'iPhone SE1(320dp・2016)', w: 320, h: 568, supported: false },
  { name: 'SE2 Safariバー付きブラウザ(アプリ化で回避)', w: 375, h: 553, supported: false },
  { name: 'iPad(タブレットは別課題=×2スナップ+素材)', w: 820, h: 1180, supported: false },
];
