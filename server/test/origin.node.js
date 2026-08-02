import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedOriginValue } from '../src/origin.js';

test('allows localhost and loopback origins', () => {
  assert.equal(allowedOriginValue('http://localhost:5173'), true);
  assert.equal(allowedOriginValue('https://127.0.0.1:4173'), true);
  assert.equal(allowedOriginValue('http://[::1]:5173'), true);
});

test('allows RFC1918 LAN origins', () => {
  assert.equal(allowedOriginValue('http://10.0.0.8:5173'), true);
  assert.equal(allowedOriginValue('https://192.168.12.34'), true);
  assert.equal(allowedOriginValue('http://172.16.0.1:8080'), true);
  assert.equal(allowedOriginValue('http://172.31.255.254:8080'), true);
});

test('rejects public, malformed, and non-http origins', () => {
  assert.equal(allowedOriginValue('http://172.15.0.1'), false);
  assert.equal(allowedOriginValue('http://172.32.0.1'), false);
  assert.equal(allowedOriginValue('https://example.com'), false);
  assert.equal(allowedOriginValue('ws://192.168.1.2'), false);
  assert.equal(allowedOriginValue('not a url'), false);
  assert.equal(allowedOriginValue(null), false);
});
