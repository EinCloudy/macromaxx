// Only modules matched by Vite at build time are eligible. Manifest strings
// select named exports; they never become executable code or import paths.
export function buildNativeUIRegistry(manifests, modules) {
  return Object.fromEntries(Object.entries(manifests).map(([path, manifest]) => {
    const module = modules[path.replace(/manifest\.json$/, 'ui.jsx')] || {};
    const resolve = name => {
      if (typeof module[name] !== 'function') throw new Error(`Native plugin ${manifest.id}: missing UI export ${name}`);
      return module[name];
    };
    return [manifest.id, {
      builtIn: !!manifest.builtIn,
      settings: (manifest.ui?.settings || []).map(resolve),
      editors: Object.fromEntries(Object.entries(manifest.ui?.editors || {}).map(([type, name]) => [type, resolve(name)])),
    }];
  }));
}
