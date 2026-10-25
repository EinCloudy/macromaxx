# Bundled native plugin API (version 1)

Native plugins are trusted application components shipped under `plugins/native/`. They run in Electron's main process. They are deliberately distinct from the user-installed JavaScript worker API in [PLUGINS.md](PLUGINS.md).

## Loading and trust boundary

The host (`electron/native-plugins.js`) discovers only this bundled directory. It checks manifest type/API version, platform, plugin ID, optional enablement, and the entry's resolved path before importing it. Windows/macOS never import the Linux-only service implementations. A user `manifest.json` placed in the regular plugin folder cannot request native privileges or main-process loading.

```json
{
  "id": "example-native",
  "type": "bundled-native",
  "apiVersion": 1,
  "name": "Example Native",
  "description": "An application-provided OS adapter",
  "platforms": ["linux"],
  "order": 80,
  "main": "index.js",
  "actions": { "example-action": "example.capability" },
  "legacyOperations": {}
}
```

Native action contracts/defaults live in `plugins/native/catalog.js`, so validation retains known actions on unsupported systems. The core runner dispatches through the host; it contains no native CLI or OS-specific fallbacks. Renderer contributions are explicitly registered at build time in `plugins/native/ui.jsx`; no renderer code is evaluated from user files.

## Factory and context

`export async function create(ctx)` receives the platform, bundled root, user-data/temp directories, Electron app/shell/clipboard/shortcut interfaces, `getState()`, `changed()`, `report(error)`, `service(name)`, `runAction(action, signal)`, and generic window/device/focus callbacks. `changed()` invalidates snapshots and publishes updated capabilities/live state.

The factory returns optional hooks:

- `services`: internal shared services, registered atomically without duplicate names.
- `actions`: implementations for the manifest's action types. Abort signals are forwarded.
- `capabilities()`: serializable `{ capabilityId: { available, reason?, ready?, features? } }`. Availability must describe actual implementation/dependencies, not pretend feature parity.
- `supports(action)`: per-variant `{ available, reason? }`, for example Linux-only launch modes or unsupported macOS holds.
- `defaults(type)`: platform-specific defaults for **new** assignments, without rewriting imported actions.
- `operations`: explicit RPC allowlist, accessed through `api.nativeCall(pluginId, operation, ...args)`. Prototype/inherited methods are not callable.
- `status()`: serializable integration status. It must be pure and must not do I/O.
- `visual(key)`: transient `{ label?, active? }`. It does not mutate the saved key.
- `isHold(action)` and `beginHold(action)`: physical key-down integration returning a release callback. The core does not know microphone- or OS-specific hold behavior.
- `start`, `release`, `suspend`, `resume`, `beforeSettings(previous, next)`, `configure(previous, next)`, `close`: resource lifecycle hooks. Close runs in reverse plugin order and is idempotent at host level. Release/resume/suspend do not let an interactive permission dialog block unrelated plugins.

Permission files and helper processes belong to the plugin. They are not included in workspace exports. `.py`/`.sh` helper resources are unpacked from ASAR by the build configuration. OS-specific bootstrap behavior is declared through a bundled `bootstrap.cjs` and filtered by platform before app readiness.

## Compatibility

The historical internal RPC names are routed through `legacyOperations`; this is a compatibility shim, not an alternative native implementation in the core. Existing action type names, profile rules, font settings, and layouts are preserved. Optional plugins can be disabled for the next startup; unsupported/disabled actions fail with a clear provider reason.
