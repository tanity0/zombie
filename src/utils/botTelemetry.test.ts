import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordSubUse, recordOverclockProc, getBotTelemetry, snapshotBotTelemetry, resetBotTelemetry,
  recordDamageDealt, recordFinisherKill, recordMeleeSwing, classifyProjectileDamageChannel,
} from './botTelemetry';
import { useGameStore } from '../store/gameStore';
import { spawnEnemyAt } from './enemyUtils';

describe('botTelemetry (M35: ボットレポート計測シングルトン)', () => {
  beforeEach(() => resetBotTelemetry());

  it('recordSubUse: 種別ごとに加算される', () => {
    recordSubUse('sensor-mine');
    recordSubUse('sensor-mine');
    recordSubUse('junk-weapon');
    expect(getBotTelemetry().subUses['sensor-mine']).toBe(2);
    expect(getBotTelemetry().subUses['junk-weapon']).toBe(1);
    expect(getBotTelemetry().subUses['molotov']).toBeUndefined(); // 未使用は未記録
  });

  it('recordOverclockProc: 成立回数が加算される', () => {
    expect(getBotTelemetry().overclockProcs).toBe(0);
    recordOverclockProc();
    recordOverclockProc();
    expect(getBotTelemetry().overclockProcs).toBe(2);
  });

  it('resetBotTelemetry: 全カウンタ0に戻る(ラン開始のリセット)', () => {
    recordSubUse('turret');
    recordOverclockProc();
    resetBotTelemetry();
    expect(getBotTelemetry().subUses).toEqual({});
    expect(getBotTelemetry().overclockProcs).toBe(0);
  });

  it('配線: setSubWeaponCooldown(合流点)で発動が記録され、resetGame(ラン開始)で0に戻る', () => {
    // ヘッドレスのボットはサブ自動使用が未接続(M26既知の簡略化)のため、合流点の配線自体をここで機械検証する
    // (=サブが発動する実機?botランでは subUses>0 になることの根拠)。
    useGameStore.getState().resetGame('warrior');
    useGameStore.getState().setSubWeaponCooldown('turret', useGameStore.getState().gameTime + 1000);
    expect(getBotTelemetry().subUses['turret']).toBe(1);
    useGameStore.getState().resetGame('warrior'); // 新ラン=リセット
    expect(getBotTelemetry().subUses['turret']).toBeUndefined();
    expect(getBotTelemetry().overclockProcs).toBe(0);
  });

  it('snapshotBotTelemetry: ディープコピー(以後の加算がスナップショットに漏れない=規律3)', () => {
    recordSubUse('turret');
    const snap = snapshotBotTelemetry();
    recordSubUse('turret');
    recordOverclockProc();
    expect(snap.subUses['turret']).toBe(1);       // スナップショットは増えない
    expect(snap.overclockProcs).toBe(0);
    expect(getBotTelemetry().subUses['turret']).toBe(2); // 生きた集計は増える
  });
});

describe('botTelemetry (M46: 与ダメ/即死/近接ペース計測・§6.21)', () => {
  beforeEach(() => resetBotTelemetry());

  it('recordDamageDealt: チャネル別に独立して加算される', () => {
    recordDamageDealt('gun', 10);
    recordDamageDealt('gun', 5);
    recordDamageDealt('melee', 20);
    recordDamageDealt('other', 3);
    expect(getBotTelemetry().damageDealt).toEqual({ gun: 15, melee: 20, other: 3 });
  });

  it('recordFinisherKill: 呼ぶたびに1加算される', () => {
    expect(getBotTelemetry().finisherKills).toBe(0);
    recordFinisherKill();
    recordFinisherKill();
    expect(getBotTelemetry().finisherKills).toBe(2);
  });

  it('recordMeleeSwing: 呼び出し回数=meleeSwings、hitCountの合計=meleeHits(0ヒットの空振りも振り数には入る)', () => {
    recordMeleeSwing(2);
    recordMeleeSwing(0); // 空振り(命中0だが振ったこと自体は数える)
    recordMeleeSwing(1);
    expect(getBotTelemetry().meleeSwings).toBe(3);
    expect(getBotTelemetry().meleeHits).toBe(3);
  });

  it('resetBotTelemetry: M46の新カウンタも0/空に戻る', () => {
    recordDamageDealt('gun', 10);
    recordFinisherKill();
    recordMeleeSwing(2);
    resetBotTelemetry();
    expect(getBotTelemetry().damageDealt).toEqual({ gun: 0, melee: 0, other: 0 });
    expect(getBotTelemetry().finisherKills).toBe(0);
    expect(getBotTelemetry().meleeSwings).toBe(0);
    expect(getBotTelemetry().meleeHits).toBe(0);
  });

  it('snapshotBotTelemetry: damageDealtもディープコピー(以後の加算が漏れない)', () => {
    recordDamageDealt('melee', 7);
    const snap = snapshotBotTelemetry();
    recordDamageDealt('melee', 3);
    expect(snap.damageDealt.melee).toBe(7);
    expect(getBotTelemetry().damageDealt.melee).toBe(10);
  });

  describe('classifyProjectileDamageChannel(純関数): gun/other/計測除外(null)の分類', () => {
    it('handgun/shotgun/rifle/phill-bulletの実弾(サブウェポン由来でない)は gun', () => {
      expect(classifyProjectileDamageChannel('handgun', 'handgun-t1')).toBe('gun');
      expect(classifyProjectileDamageChannel('shotgun', 'shotgun-t2')).toBe('gun');
      expect(classifyProjectileDamageChannel('rifle', 'rifle-t3')).toBe('gun');
      expect(classifyProjectileDamageChannel('phill-bullet', 'phill-revolver')).toBe('gun');
    });
    it('weaponKeyが"sub-"始まりはgunと同じ見た目のweaponTypeでもother(タレット/ジャンクウェポン等)', () => {
      expect(classifyProjectileDamageChannel('handgun', 'sub-turret')).toBe('other');
      expect(classifyProjectileDamageChannel('shotgun', 'sub-junk-weapon')).toBe('other');
    });
    it('護衛NPC弾(weaponKey=escort)はプレイヤー起因ではないためnull(計測除外)', () => {
      expect(classifyProjectileDamageChannel('handgun', 'escort')).toBeNull();
      expect(classifyProjectileDamageChannel('rifle', 'escort')).toBeNull();
    });
    it('ゴースト銃弾(weaponKey=ghost-gun)もプレイヤー起因ではないためnull(BOT_AND_GHOST.md G2)', () => {
      expect(classifyProjectileDamageChannel('handgun', 'ghost-gun')).toBeNull();
      expect(classifyProjectileDamageChannel('shotgun', 'ghost-gun')).toBeNull();
    });
    it('gun以外のweaponType(グレネード/ホーミング等)はother', () => {
      expect(classifyProjectileDamageChannel('grenade', 'sub-heavy-grenade')).toBe('other');
      expect(classifyProjectileDamageChannel('homing-missile', 'sub-homing')).toBe('other');
      expect(classifyProjectileDamageChannel('enemy_bolt', undefined)).toBe('other'); // 反射弾等
    });
  });

  it('配線: damageEnemy(gameStore)は既定channel="other"で計測へ流れ、明示channelで上書き・nullで除外できる', () => {
    useGameStore.getState().resetGame('warrior');
    const enemy = spawnEnemyAt('zombie', 0, 0, 0);
    useGameStore.setState({ enemies: [{ ...enemy, health: 1000, maxHealth: 1000 }] });
    const id = useGameStore.getState().enemies[0].id;

    useGameStore.getState().damageEnemy(id, 10); // channel省略=既定'other'
    expect(getBotTelemetry().damageDealt.other).toBe(10);

    useGameStore.getState().damageEnemy(id, 7, false, false, false, 'gun');
    expect(getBotTelemetry().damageDealt.gun).toBe(7);

    useGameStore.getState().damageEnemy(id, 99, false, false, false, null); // 護衛NPC弾相当=計測除外
    expect(getBotTelemetry().damageDealt.other).toBe(10); // 変化なし
    expect(getBotTelemetry().damageDealt.gun).toBe(7);    // 変化なし

    // ゲーム挙動(HP減少)自体はchannel引数に関わらず不変であることも確認(計測のみ=挙動不変の裏付け)。
    const hpAfter = useGameStore.getState().enemies[0].health;
    expect(hpAfter).toBe(1000 - 10 - 7 - 99);
  });
});
