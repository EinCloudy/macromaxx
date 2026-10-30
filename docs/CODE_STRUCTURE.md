# Code structure

## Renderer (`src`)

- `App.jsx`: application shell, page selection and profile navigation.
- `features/editor`: deck interaction and its grid, selection summary, action
  library, properties and action editors.
- `features/settings`, `features/profiles`, `features/plugins`,
  `features/diagnostics`, `features/activity`: page-specific UI. Feature styles
  live beside their components.
- `components`: reusable controls, modal, sidebar and topbar.
- `hooks`: React lifecycle integration for workspace edits, notifications,
  Electron events and key artwork synchronization.
- `state`: framework-independent history transitions and serialized,
  debounced persistence. Explicit flushes use the same queue as autosaves.
- `api.js`: Electron bridge and browser-preview fallback. `icons.jsx` is the
  shared renderer icon adapter. These entry points are also used by bundled
  plugin UIs; keep their paths stable.
- `key-artwork.jsx` / `renderKeys.js`: on-screen and hardware artwork rendering.
- `styles.css`: base styles and layout; `ui.css`: visual refinements loaded
  afterwards. Preserve this cascade order when changing styles.

Keep state local to the feature that owns it. Pass changes through the workspace
hook; do not mutate the current workspace or save directly from a component.
Flush before operations that depend on persisted data (navigation, execution,
import/export or quitting). Snapshot references are updated synchronously so
successive edits and undo/redo always operate on the latest state.

## Shared domain (`shared`)

Modules here must work in both Electron and the browser: no React, DOM, Node-only
APIs or Electron bridge calls.

- `model.js`: workspace/key/action factories, duplication and folder lookup.
  It preserves the existing public exports of `catalog` and `validateState`.
- `action-catalog.js`: portable action definitions and defaults.
- `workspace-validation.js`: import/persistence validation, split into settings,
  action-chain, key and workspace checks.
- `workspace-credentials.js`: non-mutating export omission, validated missing-field
  markers and explicit credential completion. Shared by the renderer and runners.
- Other modules cover individual concerns such as deck slots, key typography,
  visual signatures, automatic-profile rules and plugin/action library metadata.

Saved workspace version and action contracts remain unchanged. Native adapters
and native UI implementations belong in `plugins/native`, not in `shared`.

## Checks

```sh
npm run format        # Format src and shared
npm run format:check  # Check formatting without changing files
npm test             # Domain, backend and editor-state regression tests
npm run build        # Production renderer build
```

`tests/workspace-editor.test.js` covers save ordering/debounce/recovery, immutable
undo/redo and recursive profile duplication. Browser preview can verify editor
interactions; USB, native permissions and real hardware require the desktop app.

### Continuous integration

`.github/workflows/ci.yml` runs on branch pushes, pull requests and manual dispatches,
using Node.js 22 and the committed lockfile (`npm ci`). The Linux checks job runs
formatting, the test suite and the renderer build. After it succeeds, Linux,
Windows and macOS jobs run `npm run pack -- --publish never`, including Electron
native-module verification. These jobs build unpacked apps without signing or
publishing; they do not create release installers or test real hardware.

The full test suite currently runs on Linux because some tests exercise POSIX
shell scripts and Linux desktop behavior. The desktop matrix checks packaging,
not equivalent runtime functionality on every OS. Optional native backends may
report warnings in headless CI; critical native-module failures fail the job.
The two opt-in audio integration tests remain skipped in the default test run.

Tag-triggered installer builds and draft GitHub Releases are handled separately
by `.github/workflows/release.yml`; see [Releasing](RELEASING.md). Release helper
validation and checksum generation are covered by `tests/release.test.js`.
