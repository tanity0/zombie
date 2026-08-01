import * as ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enabled } from './config';
import { getAnonymousId } from './id';
import { createLoopbackPair } from './loopback';

const FORBIDDEN_IMPORT = /^src\/(?:store|pixi|utils|world|components|hooks)(?:\/|$)/;

function resolvedImportPath(fileName: string, specifier: string): string {
  const normalizedSpecifier = specifier.replaceAll('\\', '/');
  if (normalizedSpecifier.startsWith('@/')) return `src/${normalizedSpecifier.slice(2)}`;
  if (normalizedSpecifier.startsWith('/src/')) return normalizedSpecifier.slice(1);
  if (normalizedSpecifier.startsWith('src/')) return normalizedSpecifier;
  if (!normalizedSpecifier.startsWith('.')) return normalizedSpecifier;

  const relativeFile = fileName.replace(/^\.\//, '');
  const segments = ['src', 'online', ...relativeFile.split('/')];
  segments.pop();
  for (const segment of normalizedSpecifier.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') segments.pop();
    else segments.push(segment);
  }
  return segments.join('/');
}

function importedModules(source: string, fileName: string): string[] {
  const result: string[] = [];
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      result.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments;
      if (argument && ts.isStringLiteral(argument)) result.push(argument.text);
    }
    ts.forEachChild(node, visit);
  };

  visit(file);
  return result;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('online boundary', () => {
  it('does not import game implementation directories', () => {
    const sources = import.meta.glob('./**/*.ts', {
      eager: true,
      import: 'default',
      query: '?raw',
    }) as Record<string, string>;

    const violations = Object.entries(sources).flatMap(([fileName, source]) =>
      importedModules(source, fileName)
        .map((specifier) => ({ specifier, resolved: resolvedImportPath(fileName, specifier) }))
        .filter(({ resolved }) => FORBIDDEN_IMPORT.test(resolved))
        .map(({ specifier, resolved }) => `${fileName}: ${specifier} -> ${resolved}`));

    expect(violations).toEqual([]);
  });
});

describe('online safety switch and anonymous id', () => {
  it('disables everything for ?online=0', async () => {
    vi.stubGlobal('window', { location: { search: '?online=0' } });
    expect(enabled()).toBe(false);

    const pair = createLoopbackPair();
    expect(pair?.host.enabled()).toBe(false);
    await expect(pair?.host.advertise({ buildVersion: 'v1', matchKey: 'opaque', label: 'room' }))
      .resolves.toBeNull();
  });

  it('creates one UUID and reuses it', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    vi.stubGlobal('crypto', {
      randomUUID: () => '123e4567-e89b-42d3-a456-426614174000',
    });

    const first = getAnonymousId();
    const second = getAnonymousId();
    expect(first).toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(second).toBe(first);
    expect(values.size).toBe(1);
  });
});

describe('loopback transport', () => {
  it('moves bytes both ways with 100ms latency and 5% unreliable loss', async () => {
    vi.stubGlobal('window', { location: { search: '' } });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const pair = createLoopbackPair({ latencyMs: 100, packetLossPercent: 5 });
    expect(pair).not.toBeNull();
    if (!pair) return;

    const hostSession = await pair.host.advertise({
      buildVersion: 'v1',
      matchKey: 'opaque',
      label: 'loopback',
    });
    expect(hostSession?.status()).toBe('advertising');

    const rooms = await pair.guest.listOpen('opaque', 'v1');
    expect(rooms).toHaveLength(1);
    const guestSession = await pair.guest.join(rooms[0].roomId);
    expect(hostSession?.status()).toBe('connected');
    expect(guestSession?.status()).toBe('connected');
    expect(hostSession?.rttMs()).toBe(200);

    const hostReceived: number[][] = [];
    const guestReceived: number[][] = [];
    const hostUnreliable: number[][] = [];
    const guestUnreliable: number[][] = [];
    hostSession?.onMessage((data, channel) => {
      if (channel === 'reliable') hostReceived.push([...data]);
      else hostUnreliable.push([...data]);
    });
    guestSession?.onMessage((data, channel) => {
      if (channel === 'reliable') guestReceived.push([...data]);
      else guestUnreliable.push([...data]);
    });

    hostSession?.sendUnreliable(Uint8Array.of(9));
    guestSession?.sendUnreliable(Uint8Array.of(8));
    hostSession?.sendReliable(Uint8Array.of(1, 2, 3));
    hostSession?.sendReliable(Uint8Array.of(7));
    guestSession?.sendReliable(Uint8Array.of(4, 5, 6));
    guestSession?.sendReliable(Uint8Array.of(10));
    await new Promise((resolve) => setTimeout(resolve, 140));

    expect(hostReceived).toEqual([[4, 5, 6], [10]]);
    expect(guestReceived).toEqual([[1, 2, 3], [7]]);
    expect(hostUnreliable).toEqual([]);
    expect(guestUnreliable).toEqual([]);

    const hostClosed: string[] = [];
    const guestClosed: string[] = [];
    hostSession?.onClosed((reason) => hostClosed.push(reason));
    guestSession?.onClosed((reason) => guestClosed.push(reason));
    guestSession?.close('local');
    guestSession?.close('local');
    expect(hostClosed).toEqual(['peer-left']);
    expect(guestClosed).toEqual(['local']);
  });
});
