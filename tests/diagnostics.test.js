import test from 'node:test';
import assert from 'node:assert/strict';
import { capabilityState, diagnosticProviders, createDiagnosticReport } from '../shared/diagnostics.js';

test('capabilities distinguish missing dependencies from setup and permission requirements', () => {
  assert.equal(capabilityState({ available: true }), 'ready');
  assert.equal(capabilityState({ available: true, ready: false }), 'setup-required');
  assert.equal(capabilityState({ available: false, ready: true }), 'unavailable');
  assert.equal(capabilityState(), 'unavailable');
});

test('provider checks retain local explanations without mutating status', () => {
  const status = { native: { plugins: [{ id: 'keyboard', state: 'loaded', capabilities: { 'keyboard.hotkey': { available: true, ready: false, reason: 'Permission required' } } }] } };
  const before = structuredClone(status);
  assert.deepEqual(diagnosticProviders(status)[0].checks[0], { id: 'keyboard.hotkey', available: true, ready: false, reason: 'Permission required', state: 'setup-required' });
  assert.deepEqual(status, before);
  assert.deepEqual(diagnosticProviders(), []);
});

test('report allowlist excludes sensitive data even inside nested provider features', () => {
  const secret = 'SENSITIVE-VALUE';
  const report = createDiagnosticReport({
    runtime: { app: '1.0.0', platform: 'linux', home: secret, environment: { TOKEN: secret } },
    status: {
      settings: { obsPassword: secret }, logs: [secret], running: [secret],
      device: { connected: true, name: secret, path: secret, serialNumber: secret, count: 15, rows: 3, columns: 5 },
      available: [{ path: secret }], obs: { connected: true, password: secret, scenes: [secret], error: secret },
      keyboard: { savedPermission: secret }, focus: { title: secret, appId: secret },
      native: { plugins: [{ id: 'keyboard', name: secret, state: 'loaded', enabled: true, restartRequired: true, reason: secret, capabilities: { 'keyboard.hotkey': { available: true, ready: false, reason: secret, features: { path: secret, token: secret } } } }], actionStates: { [secret]: secret } },
    }, keyboardCheckFailed: true,
  });
  assert.equal(JSON.stringify(report).includes(secret), false);
  assert.equal(report.runtime.app, '1.0.0');
  assert.deepEqual(report.device, { connected: true, detected: 1, keys: 15, rows: 3, columns: 5 });
  assert.deepEqual(report.providers[0], { id: 'keyboard', state: 'loaded', enabled: true, restartRequired: true, capabilities: [{ id: 'keyboard.hotkey', state: 'setup-required' }] });
  assert.equal(report.keyboardCheckFailed, true);
  assert.equal(report.runningActionChains, 1);
});

test('report handles absent providers and disconnected devices', () => {
  const report = createDiagnosticReport();
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.device.connected, false);
  assert.equal(report.device.keys, null);
  assert.equal(report.obs.connected, false);
  assert.deepEqual(report.providers, []);
});
