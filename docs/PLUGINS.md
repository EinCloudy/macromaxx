# MacroMaxx Plugins

Plugins are small JavaScript modules. Open **Plugins → Plugin folder** and add a separate folder for each plugin. Click **Reload user plugins**, then select the **Plugin** action in the editor.

This page documents the cross-platform **worker plugin API**. Bundled OS integrations have a separate [native plugin API](NATIVE_PLUGINS.md) and [platform support matrix](PLATFORMS.md). Worker plugin code must itself use portable APIs to work on multiple operating systems; adding a native manifest to the user plugin folder does not enable main-process loading.

## Example

`my-plugin/manifest.json`:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "description": "A custom action",
  "main": "index.mjs",
  "fields": [
    { "key": "name", "label": "Name", "default": "World" }
  ]
}
```

`my-plugin/index.mjs`:

```js
export async function execute(config, context) {
  return {
    label: `Hi ${config.name || 'World'}!`,
    color: '#86efac',
    message: `Executed on ${context.platform}`
  };
}
```

`id` must be unique and contain only lowercase letters, digits, and hyphens. Use `.mjs` for ES modules, or set `"type": "module"` in your own `package.json`. You can import Node.js modules; install additional dependencies in the plugin's folder.

## API

- `execute(config, context)` runs in a **new, separate process** for each key press.
- `config` contains the action's JSON configuration. `fields` creates simple text inputs in the editor; use the JSON field for more complex values.
- `context.platform`: `linux`, `darwin`, or `win32`.
- The result can include `label` (up to 80 characters), `color` (`#rrggbb`), and `message` (Activity log). Label/color changes update the key and are saved.
- Report failures with `throw new Error('…')`. The **Stop on error** setting also applies to plugins.
- Triggering a running chain again, or choosing **Stop all**, terminates the plugin process. Maximum runtime: 15 seconds.
- Do not rely on persistent background services or independently spawned child processes: plugins are single actions.

Plugins have the same file-system and network permissions as your user account. Process isolation supports stability; it does not prevent access to user data. This is MacroMaxx's own API, not compatibility with Elgato plugins.

A working example is included in `plugins/hello/`.
