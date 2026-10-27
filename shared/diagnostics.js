// Reports deliberately use an allowlist. Never serialize raw status, settings,
// logs, capability features or errors: they can contain credentials and paths.
export function capabilityState(capability) {
  return !capability?.available ? 'unavailable' : capability.ready === false ? 'setup-required' : 'ready';
}

export function diagnosticProviders(status = {}) {
  return (status.native?.plugins || []).map(plugin => ({
    ...plugin,
    checks: Object.entries(plugin.capabilities || {}).map(([id, capability]) => ({ id, ...capability, state: capabilityState(capability) })),
  }));
}

export function createDiagnosticReport({ runtime = {}, status = {}, keyboardCheckFailed = false } = {}) {
  const number = value => Number.isFinite(value) ? value : null;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    privacy: 'No credentials, URLs, paths, serial numbers, workspace content, activity logs or raw error messages included.',
    runtime: Object.fromEntries(['app', 'electron', 'node', 'chrome', 'platform', 'arch', 'osRelease', 'session'].filter(key => typeof runtime[key] === 'string').map(key => [key, runtime[key]])),
    device: { connected: status.device?.connected === true, detected: status.available?.length || 0, keys: number(status.device?.count), rows: number(status.device?.rows), columns: number(status.device?.columns) },
    obs: { connected: status.obs?.connected === true },
    keyboardCheckFailed: !!keyboardCheckFailed,
    runningActionChains: status.running?.length || 0,
    providers: diagnosticProviders(status).map(plugin => ({
      id: plugin.id, state: plugin.state, enabled: plugin.enabled === true, restartRequired: plugin.restartRequired === true,
      capabilities: plugin.checks.map(check => ({ id: check.id, state: check.state })),
    })),
  };
}
