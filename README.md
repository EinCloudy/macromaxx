# MacroMaxx

A JavaScript/Electron app for Elgato Stream Decks: a visual editor, profiles, folders, action chains, and custom plugins. English interface, light and dark themes, and local storage.

The core is platform-neutral. OS input, application/media/session integration, and Linux-only audio/desktop/routing are **bundled native plugins**, loaded only on compatible platforms. See the [capability matrix](docs/PLATFORMS.md) and [native plugin architecture](docs/NATIVE_PLUGINS.md). Settings lists each provider and its dependencies; unavailable assignments are preserved, not silently executed or deleted.

Shared NPM backends are installed by default: **@jitsi/robotjs** for keyboard/global media keys on Windows/macOS/X11, and **node-web-audio-api** for default-output soundboard playback. Native addons are isolated in child processes. Wayland keeps portal/EIS, Linux keeps MPRIS and advanced routing, and missing libraries fall back where a native provider is available. See the platform matrix for permissions, architecture/audio-library requirements, and remaining OS-specific capabilities.

## Getting started

### Background use and reopening

**Settings → Native session plugin** offers OS login integration and an optional show-window shortcut. Its Linux adapter can install a user-local XDG launcher. Tray support is optional: starting the executable/AppImage again (or `--show`) opens the existing app, recreating its window if needed. `--background` starts hidden; `--quit` requests normal shutdown and exits immediately if no instance is running. Shortcut registration is subject to OS permission/conflicts. A denied shortcut preserves the last working binding. Reinstall portable launch entries if the executable moves.

Window hiding and normal shutdown request a renderer-save flush before closing. Hidden renderers continue processing live key-image updates. Closing to tray does not stop native actions, while actual quit releases holds, scripts, sound playback, audio modules, and device handles.

Requirements: **Node.js 22.12+**, npm, and a graphical desktop session.

```sh
npm install
npm start
```

If your npm version blocks installation scripts, approve the scripts for `electron`, `esbuild`, `node-hid`, and `@julusian/jpeg-turbo` (`npm install-scripts approve …`), then run `npm rebuild`. The approvals stored in this project apply to the pinned versions.

```sh
npm run dev    # Vite with hot reload + Electron
npm test       # Core logic, local HTTP requests, plugin processes, and an OBS test server
npm run format:check # Check renderer/shared formatting (npm run format to apply)
npm run pack   # Unpacked desktop app in release/
npm run dist   # Installer for the current platform
npm run verify:native # Verify installed Node-API modules with Electron
```

Linux: AppImage. Windows: NSIS. macOS: dmg. Build on the corresponding operating system for each platform. Code signing and notarization are not configured.

Tagged releases are built by GitHub Actions as unsigned **draft releases** for
Linux x64, Windows x64 and macOS Apple Silicon. See [Releasing](docs/RELEASING.md)
for the v0.1.0 checklist, manual approval and current distribution limitations.

For development boundaries, folder responsibilities and checks, see [Code structure](docs/CODE_STRUCTURE.md).

## Using the app

1. Drag an action from the library on the right onto a key, or select an empty key and choose an action.
2. Open **Properties** to customize the label, font size, icon, color, image, and action parameters. Keys inherit the font size from **Settings → Text & labels** unless overridden in Properties. Labels wrap onto up to two lines and are truncated when necessary.
3. Click **Test** or press the physical key. Results appear under **Activity**.
4. Add and reorder actions in Properties to build a chain. Trigger a running chain again to stop it. Use delays to coordinate applications and workflows.
5. Assign a separate **Long press** action (at least 600 ms). Unassigned long presses use the short-press assignment. Actions run when the key is released.
6. Open folders with a double-click or a physical key press. The Back key goes up one level and can be moved by drag and drop. Its position is saved per folder; dropping it onto an occupied key swaps the two slots. Folders default to the top-left Back position. Manage profiles on the left, or assign profile-switch actions to keys.

Swap keys with drag and drop. Undo or redo using the toolbar or Ctrl+Z / Ctrl+Shift+Z. Use the three-dot menu to manage a profile. Changes save automatically; key images and brightness are sent to the device live.

### Animations

At startup, a light wave expands from the center of the first connected deck before showing its assignments. A key press skips the animation; folder changes and reconnections do not replay it.

On quit, the wave runs in reverse and fades to black before the device is released. Minimizing to the tray does not play the shutdown animation. Startup and shutdown waves are independent of the optional effects below.

Under **Settings → Deck animations**, disable these optional effects independently:

- **Folder transitions:** a short crossfade and slide when entering or leaving a folder, around 240 ms of playback.
- **Reveal icons after startup:** assignments gently appear from the center after the startup wave, around 320 ms of playback.

Both default to enabled, including for existing workspaces. Their settings are saved and exported. Key presses skip the startup wave and optional effects. Fast navigation cancels the previous transition and displays the latest destination. With optional effects disabled, cached icons appear directly.

### Screensaver

Under **Settings → Screensaver**, enable an idle animation and set a delay from 10 seconds to 24 hours (default: 5 minutes). Choose from twelve effects: **Matrix rain**, **Neon snake**, **Star flight**, **Plasma waves**, **Bouncing ball**, **Northern lights**, **Fireflies**, **Radar sweep**, **Neon rain**, **Water ripples**, **Orbital trails**, and **Underwater**, with a live preview. Underwater includes moving fish, bubbles, light shafts, and swaying kelp. Scenes span the connected deck's layout and keep running in tray mode. The screensaver is disabled by default and its settings are included in workspace exports.

Choose a **Graphics preset** to control scene detail and animation speed. **Eco** is the default; older **Smooth** settings map to **Balanced**.

| Preset | Internal pixels per key | Max FPS | Deck-wide key updates/second |
| --- | --- | --- | --- |
| Eco | 24×24 | 5 | 100 |
| Balanced | 40×40 | 10 | 200 |
| High | 56×56 | 15 | 300 |
| Ultra | 72×72 | 20 | 400 |

All presets scale to the LCD's native dimensions. Large decks reduce their frame rate to stay within the update budget (e.g. about 3 FPS for Eco on a 32-key XL). Settings show the resolution and the current layout's maximum FPS; actual frame rate depends on system load and USB speed.

Run `node scripts/benchmark-screensavers.js` for a repeatable CPU-only rendering/scaling benchmark on simulated 15-key and 32-key layouts. Pass `balanced`, `high`, or `ultra` as an argument to test another preset. It excludes USB transport, image encoding and the Electron UI; real hardware performance depends on the deck and system.

Computer mouse/keyboard activity or deck input resets the idle timer. The first deck press only wakes the display, without triggering its action; subsequent presses work normally. Held deck keys prevent activation. A short crossfade blends the key artwork into the screensaver and back to the latest profile artwork when waking. Waking during the entry animation smoothly returns from the currently visible frame.

## Actions

### Soundboard and virtual microphone

**Shared Soundboard** uses node-web-audio-api for default-output playback, gain, looping, restart/toggle/overlap and stopping on supported Linux/Windows/macOS systems. **Linux Audio Routing** adds named outputs, virtual microphones and a streaming fallback using ffmpeg/pw-play. A stop-all sound key or **Stop all** stops both backends. Sound paths are references, not bundled into exports.

In **Settings → Linux audio routing plugin**, explicitly create a null sink and remapped virtual microphone using PipeWire-Pulse/pactl. Optionally mix a physical microphone and monitor the mix on an output. No default device is changed. Select **MacroMaxx Virtual Microphone** in your voice app. Cleanup verifies ownership before removing this session's modules. This adapter and its routing are Linux-only; unsupported systems retain the assignment data.

### MPRIS players

The **Native Media** plugin uses shared RobotJS global playback/volume keys where available, including macOS. Linux prefers MPRIS for running players and retains player selection/transient track labels. OS fallback adapters remain available; the legacy AppleScript fallback provides only system volume/mute. Player-specific metadata/volume are not claimed without an adapter. **Settings → Native media** shows the detected capabilities.

### Applications and scripts

**Open application** can search installed desktop entries (including Flatpak exports), launch a Flatpak ID, or open a custom executable/file. Configure arguments as a JSON array, a working directory, environment variables as a JSON object, and optional terminal mode. Arguments remain separate argv entries; application launches do not interpolate shell syntax. Existing path-only actions remain supported.

**Shell script** explicitly executes a trusted script with your user permissions. Arguments become `$1`, `$2`, etc. Output and errors appear in Activity. Foreground scripts have a 60-second timeout and cancellation terminates their process group. Detached subprocesses are outside that lifecycle. Environment values are saved locally and included only when exporting with credentials. Scripts and arguments are exported unchanged; review them for embedded secrets before sharing.

### Linux audio and microphone holds

The **Linux Audio & Microphone** plugin uses pactl with PipeWire-Pulse/PulseAudio. It provides device/default selection, mute, volume, application streams, and holds. **Settings → Linux audio plugin** lists live device state. There is no Windows/macOS mixer adapter bundled yet.

For **Push-to-talk** or **Push-to-mute**, put the audio action first on the key. It takes effect on physical key-down and restores the previous microphone state on release, Stop all, or normal app shutdown. Overlapping holds are coordinated. Other actions on that hold key are not executed. No Wayland keyboard permission is needed. Install `pulseaudio-utils` (Debian/Ubuntu) or `libpulse` (Arch) for pactl.

- **Hotkey:** record a combination or enter `CTRL+SHIFT+M`. Function keys, arrow keys, `META`, `SPACE`, `ENTER`, `PLUS`, `MINUS`, and others are supported. Separate hold/release actions are available on Linux and Windows. Held keys are released during normal shutdown and by **Stop all**.
- **Website:** open an HTTP(S) or mailto URL in its default application.
- **Type text:** copy text to the clipboard and paste it. This replaces the clipboard contents. When testing, add a delay first to give yourself time to focus the target application.
- **Webhook:** GET/POST/PUT/PATCH/DELETE/HEAD, JSON headers, and a custom body. JSON requests need a header such as `{"Content-Type":"application/json"}`. HTTP errors appear in Activity. Timeout: 15 seconds. Local endpoints are supported.
- **OBS Studio:** switch scenes, toggle recording/streaming, and mute audio sources, with live key status. Requires OBS 28+ with its WebSocket server enabled (default port 4455). Connect in Settings.
- **Plugin:** see the [plugin API and example](docs/PLUGINS.md).

## Platform setup

### Automatic profiles

Enable **Settings → Automatic profiles** and enter application-ID patterns per profile (one per line; `*` and `?`, case-insensitive). The first matching profile wins. Choose a fallback or retain the last manually selected profile for unmatched apps. Manual selection stays until focus changes; MacroMaxx focus is ignored so editing remains stable. New focus is debounced. Rules and fallback settings are exported; window titles are transient, not logged or saved.

KDE loads a session-local KWin watcher only while this feature is enabled, with a D-Bus receiver that accepts reports only from KWin. It is unloaded on disable/exit. GNOME uses the optional Desktop Bridge extension. X11 requires xdotool. Unsupported backends show a detection error rather than switching unpredictably.

### Window and workspace actions

The **Linux Desktop & Focus** plugin provides workspace/window actions where supported. **Settings → Linux desktop plugin** lists its detected backend. KDE uses qdbus/KWin; X11 uses wmctrl/xdotool; GNOME Wayland uses the extension bundled inside the plugin. Other systems retain rules/assignments but need a compatible native provider.

GNOME Wayland requires the bundled **MacroMaxx Desktop Bridge** Shell extension (GNOME 45+). Install it from Settings, log out/in if needed, and enable `macromaxx@macromaxx.local` in Extensions. The bridge exports fixed commands and active-app information; it does not enable arbitrary Shell Eval. It runs with Shell permissions and is optional. KDE and GNOME backends have separate implementations; the GNOME extension needs testing on the installed GNOME version. Other Wayland compositors can use their own configured Hotkey/Script actions.

USB connections are restored by serial number after path changes. Suspend releases the device without a shutdown wave; resume restores cached artwork. Native plugins receive release/suspend/resume hooks for held keys, audio, playback, and focus. Use **Settings → Stream Deck → Reconnect Stream Deck** for a rescan.

### Linux / KDE Wayland

Open **Settings → Native keyboard plugin → Allow keyboard input**. The Linux adapter requests keyboard access only. Portal v2 tokens are rotated and stored privately in `keyboard-permission.json`, outside exports. Restoration is attempted at startup/resume when enabled. Revoked/expired permission may require confirmation again. **Forget saved permission** closes the session and deletes the local token.

Required: `python3`, Python D-Bus, PyGObject, `libei`, `libxkbcommon`, a RemoteDesktop portal implementation, and the desktop's portal backend (`xdg-desktop-portal-kde` on KDE). Modern desktops receive input through EIS/libei, with the current keyboard layout supplied by the compositor. Older portals can use D-Bus input methods.

```sh
# Debian / Ubuntu
sudo apt install python3-dbus python3-gi playerctl libei1 libxkbcommon0
# Arch
sudo pacman -S python-dbus python-gobject playerctl libei libxkbcommon
```

If USB access fails, **Set up USB access** installs a udev rule for Elgato HID devices after a password prompt. Reconnect the deck if needed. The rule is installed at `/etc/udev/rules.d/70-macromaxx-streamdeck.rules`. Existing access permissions are sufficient; installation is unnecessary if the device already connects. Close other Stream Deck applications if the device is busy.

### Linux / X11

Install `xdotool` for hotkeys. Wayland sessions use the portal so native Wayland applications can receive input as well.

### Windows

Keyboard input uses RobotJS by default, with a PowerShell helper as a fallback. Elevated applications can block input from an app running with regular user permissions.

### macOS

Grant Accessibility access to MacroMaxx or your development environment. RobotJS provides keyboard input; the AppleScript fallback supports tap combinations only and may also require Automation permission.

## Data and export

### Diagnostics

Open **Diagnostics** in the sidebar for live deck/OBS connections, native provider states, missing capabilities and setup/permission hints. **Refresh checks** rechecks keyboard dependencies without requesting permissions or changing system settings; other providers display their current detected state. Use Settings or Plugins for provider-specific setup and detection. Reconnect the deck directly from Diagnostics if needed.

**Export report** saves a local JSON file with app/runtime and OS versions, session type, deck dimensions, connection states and native provider/capability states. It deliberately excludes credentials, URLs, personal paths, serial numbers, workspace content, activity logs and raw errors. Nothing is uploaded. Review the report before sharing it. Export is available only in the desktop app.

`workspace.json` is stored in Electron's user-data directory (usually `~/.config/MacroMaxx/` or `~/.config/macromaxx/` on Linux, depending on the app name). The previous valid version is kept beside it as `workspace.json.bak`. Writes are serialized through a temporary file; a damaged primary file is recovered from the backup. Activity logs stay in memory.

Import/export is available in Settings and export is also available in the editor. Importing replaces the workspace after confirmation. Images are embedded.

### Export with or without credentials

Click **Export**, then choose **Without credentials** (the default), **With credentials**, or **Cancel** before choosing a file. Export does not change your local workspace.

**Without credentials** omits OBS passwords and other credential-named string fields in action/settings objects. Webhook endpoints are omitted entirely because secret tokens can be part of their paths, not just query parameters. Nonempty webhook headers and request bodies, plugin configurations and custom application/script environment values are also omitted conservatively, since their contents can contain credentials under arbitrary names. Other website/OBS URLs with login details, query parameters or fragments are omitted.

**With credentials** preserves all values currently stored in the workspace, including passwords, tokens, webhook data, plugin configurations and environment values, as **unencrypted plain text**. Keep these files private; do not share them. Credentials stored outside the workspace (such as Discord's in-memory authorization or Wayland permission tokens) are not included, and previously omitted values cannot be recovered by selecting this option.

Omitted fields are marked without retaining their previous values. Importing such a file opens **Complete missing credentials**; enter your own values one field at a time or choose **Finish later**. A persistent banner and a button in Settings reopen the dialog. Affected actions (including OBS connection/control) cannot run until their missing fields are completed, either in the dialog or their normal editor. Use `{}` to explicitly accept an empty JSON object. Existing local credentials are never merged into an imported workspace. Missing-field markers survive saving, restarting, duplication and re-export. Older version-1 exports remain importable, including any credentials they already contain; re-export them **without credentials** to apply the omission rules.

**Review exports before sharing:** text, scripts, command arguments, labels, images, file paths and ordinary URL paths remain unchanged and may contain personal data or manually embedded secrets. Automatic omission is not a general-purpose secret scanner. Exports **without credentials are not complete credential backups**. Local credentials still use the existing private workspace storage, not an OS keychain or encrypted vault.

The app controls one active USB deck. Select a target device if multiple decks are connected. Key devices recognized by `@elgato-stream-deck/node` are supported. Encoders, touch strips, and model-specific extras are not represented in the editor. Keys outside a smaller device's visible grid remain in the profile.

## Project structure

```text
electron/     Platform-neutral core, action runner, device driver, native host
src/          Platform-neutral editor, layout and key-image rendering
shared/       Portable model, layout and validation
plugins/native/  Bundled OS providers, helper processes and plugin-owned UI
plugins/hello/   Example user-worker plugin
tests/        Node test suite
docs/         Plugin documentation
```

Run `npx vite --host 127.0.0.1` for a standalone browser preview. Profiles are stored in Local Storage there; native actions require Electron.

Independent project, not official Elgato software.
