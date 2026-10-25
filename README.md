# MacroMaxx

A JavaScript/Electron app for Elgato Stream Decks: a visual editor, profiles, folders, action chains, and custom plugins. English interface, light and dark themes, and local storage.

## Getting started

Requirements: **Node.js 22.12+**, npm, and a graphical desktop session.

```sh
npm install
npm start
```

If your npm version blocks installation scripts, approve the scripts for `electron`, `esbuild`, `node-hid`, and `@julusian/jpeg-turbo` (`npm install-scripts approve …`), then run `npm rebuild`. The approvals stored in this project apply to the pinned versions.

```sh
npm run dev    # Vite with hot reload + Electron
npm test       # Core logic, local HTTP requests, plugin processes, and an OBS test server
npm run pack   # Unpacked desktop app in release/
npm run dist   # Installer for the current platform
```

Linux: AppImage. Windows: NSIS. macOS: dmg. Build on the corresponding operating system for each platform. Code signing and notarization are not configured.

## Using the app

1. Drag an action from the library on the right onto a key, or select an empty key and choose an action.
2. Open **Properties** to customize the label, font size, icon, color, image, and action parameters. Set a key's font size from 10 to 32 using the slider or number field, with live preview and hardware updates. Change the global default under **Settings → Text & labels** (factory default: 16). New keys and existing keys without an individual size inherit this value, including keys in subfolders and the Back key. Individual sizes are preserved. Choose **Default** in a key's properties to remove its override and restore inheritance. Long labels wrap onto up to two lines and are truncated with “…” when necessary. Global and individual settings are preserved when duplicating or importing/exporting.
3. Click **Test** or press the physical key. Results appear under **Activity**.
4. Add and reorder actions in Properties to build a chain. Trigger a running chain again to stop it. Use delays to coordinate applications and workflows.
5. Assign a separate **Long press** action (at least 600 ms). Unassigned long presses use the short-press assignment. Actions run when the key is released.
6. Open folders with a double-click or a physical key press. The Back key goes up one level and can be moved by drag and drop. Its position is saved per folder; dropping it onto an occupied key swaps the two slots. Folders default to the top-left Back position. Manage profiles on the left, or assign profile-switch actions to keys.

Swap keys with drag and drop. Undo/redo using the toolbar or Ctrl+Z / Ctrl+Shift+Z. Use the three-dot menu to manage a profile. Changes save automatically; key images and brightness are sent to the device live. Your existing custom profile names, labels, text, and action content are preserved when updating the app's interface language.

### Animations

At startup, a short purple light wave expands from the center of the first connected deck. It adapts to the layout: the center key on a 15-key deck, or the four central keys symmetrically on an XL. The current assignment appears afterwards. A key press skips the startup animation. Folder changes and reconnections do not replay it.

When quitting the app, the same wave runs in reverse, from the outside toward the center. The central keys and remaining background glow then fade completely to black in a short additional fade-out. The device is released without bringing back its logo. This applies to **Quit** in the tray, the quit button, and closing the window with tray mode disabled. Minimizing to the tray does not play the shutdown animation. Key actions stop during shutdown; repeated quit requests do not restart the wave. Startup and shutdown waves remain enabled independently of the optional effects.

Under **Settings → Deck animations**, disable these optional effects independently:

- **Folder transitions:** a short crossfade and slide when entering or leaving a folder, around 240 ms of playback.
- **Reveal icons after startup:** assignments gently appear from the center after the startup wave, around 320 ms of playback.

Both default to enabled, including for existing workspaces. Their settings are saved and exported. Key presses skip the startup wave and optional effects. Fast navigation cancels the previous transition and displays the latest destination. With optional effects disabled, cached icons appear directly.

## Actions

### Soundboard and virtual microphone

**Soundboard** decodes local audio with ffmpeg and plays through PipeWire pw-play. Select an output, a virtual microphone, or both; set volume, looping, and restart/toggle/overlap behavior. A stop-all sound key or **Stop all** stops playback. Keys show live playback state. Sound paths are references, not bundled into workspace exports.

In **Settings → Soundboard**, explicitly create a null sink and a remapped virtual microphone using PipeWire-Pulse/pactl. Optionally mix a physical microphone and monitor the mix on a chosen output. No default audio device is changed. Select **MacroMaxx Virtual Microphone** in your voice app. Leave monitoring disabled to avoid hearing your own microphone. Cleanup removes only module IDs created by this app session, in reverse order; pre-existing shared virtual devices are reused. Routing must be set up again after it is removed or after an audio-server restart.

### MPRIS players

Media keys can select a specific Linux MPRIS player or automatically prefer a playing one. Browser instance IDs are resolved to the same application when its instance changes. Playback, player volume, title, artist, and live playing-state indicators use playerctl. Optional title labels are transient: your configured label remains saved and returns when metadata is unavailable. System mute/volume commands remain separate from player volume. **Settings → Media players** shows the current players and metadata.

### Applications and scripts

**Open application** can search installed desktop entries (including Flatpak exports), launch a Flatpak ID, or open a custom executable/file. Configure arguments as a JSON array, a working directory, environment variables as a JSON object, and optional terminal mode. Arguments remain separate argv entries; application launches do not interpolate shell syntax. Existing path-only actions remain supported.

**Shell script** explicitly executes a trusted script with your user permissions. Arguments become `$1`, `$2`, etc. Output and errors appear in Activity. Foreground scripts have a 60-second timeout and cancellation terminates their process group. Detached subprocesses are outside that lifecycle. Environment values are saved and exported with the workspace.

### Linux audio and microphone holds

**Audio & microphone** uses `pactl` with PipeWire-Pulse or PulseAudio. Select a named device or the current system default, toggle mute, set/step volume, select the default input/output, or move all streams of a selected application to an output. External mute/volume changes update the deck indicator. **Settings → Linux audio** lists connected devices and their live state.

For **Push-to-talk** or **Push-to-mute**, put the audio action first on the key. It takes effect on physical key-down and restores the previous microphone state on release, Stop all, or normal app shutdown. Overlapping holds are coordinated. Other actions on that hold key are not executed. No Wayland keyboard permission is needed. Install `pulseaudio-utils` (Debian/Ubuntu) or `libpulse` (Arch) for pactl.

- **Hotkey:** record a combination or enter `CTRL+SHIFT+M`. Function keys, arrow keys, `META`, `SPACE`, `ENTER`, `PLUS`, `MINUS`, and others are supported. Separate hold/release actions are available on Linux and Windows. Held keys are released during normal shutdown and by **Stop all**.
- **Website:** open an HTTP(S) or mailto URL in its default application.
- **Open application:** choose an absolute application or file path. On Linux, executables launch directly, `.desktop` files use `gio launch`, and other files/directories open in their default application. `~` expands to your home directory.
- **Type text:** copy text to the clipboard and paste it. This replaces the clipboard contents. When testing, add a delay first to give yourself time to focus the target application.
- **Media controls:** play/pause, skip tracks, change volume, and mute. Linux uses `playerctl` for players, and `wpctl` or `pactl` for volume. Windows uses media keys. macOS volume uses AppleScript; global media play/pause keys are not implemented there yet.
- **Webhook:** GET/POST/PUT/PATCH/DELETE/HEAD, JSON headers, and a custom body. JSON requests need a header such as `{"Content-Type":"application/json"}`. HTTP errors appear in Activity. Timeout: 15 seconds. Local endpoints are supported.
- **OBS Studio:** switch scenes, toggle recording/streaming, and mute audio sources, with live key status. Requires OBS 28+ with its WebSocket server enabled (default port 4455). Connect in Settings.
- **Plugin:** see the [plugin API and example](docs/PLUGINS.md).

## Platform setup

### Automatic profiles

Enable **Settings → Automatic profiles** and enter application-ID patterns per profile (one per line; `*` and `?`, case-insensitive). The first matching profile wins. Choose a fallback or retain the last manually selected profile for unmatched apps. Manual selection stays until focus changes; MacroMaxx focus is ignored so editing remains stable. New focus is debounced. Rules and fallback settings are exported; window titles are transient, not logged or saved.

KDE loads a session-local KWin watcher only while this feature is enabled, with a D-Bus receiver that accepts reports only from KWin. It is unloaded on disable/exit. GNOME uses the optional Desktop Bridge extension. X11 requires xdotool. Unsupported backends show a detection error rather than switching unpredictably.

### Window and workspace actions

**Desktop & windows** provides workspace changes, minimize/maximize/close, application switching, monitor moves, tiling, and fullscreen where supported. **Settings → Desktop integration** lists the detected backend. KDE uses the available KWin global-shortcut API through qdbus6/qdbus. Other X11 desktops use wmctrl, with xdotool for minimizing/app switching (Show desktop enables the desktop rather than toggling it on X11). Unsupported commands fail explicitly.

GNOME Wayland requires the bundled **MacroMaxx Desktop Bridge** Shell extension (GNOME 45+). Install it from Settings, log out/in if needed, and enable `macromaxx@macromaxx.local` in Extensions. The bridge exports fixed commands and active-app information; it does not enable arbitrary Shell Eval. It runs with Shell permissions and is optional. KDE and GNOME backends have separate implementations; the GNOME extension needs testing on the installed GNOME version. Other Wayland compositors can use their own configured Hotkey/Script actions.

USB connections are restored by serial number when a dock or hidraw path changes. Suspend releases the deck without playing a shutdown wave; resume reopens it and restores cached artwork without replaying startup. Locking, suspending, or disconnecting releases microphone holds and synthetic held keys. Use **Settings → Keyboard & devices → Reconnect Stream Deck** for a manual rescan. Wayland sessions are reset after resume so stale permissions are not reported as ready.

### Linux / KDE Wayland

Open **Settings → Keyboard & devices → Allow keyboard input** and confirm the native desktop dialog. The app requests keyboard access only. Enable persistence in the desktop dialog if offered. With **Remember and restore keyboard permission** enabled, portal v2 restore tokens are rotated and stored with user-only permissions in `keyboard-permission.json`, outside workspace exports. The app attempts restoration at startup and after resume. Revoked/expired permissions or unsupported desktops may require a new confirmation. **Forget saved permission** closes the session and deletes the local token; desktop-side permission revocation remains available in desktop settings.

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

Keyboard input uses Windows `keybd_event` through a PowerShell helper. Elevated applications can block input from an app running with regular user permissions.

### macOS

Grant Accessibility access to MacroMaxx or your development environment. Key combinations use System Events. Holding/releasing keys and some special keys are not supported there yet and report an error.

## Data and export

`workspace.json` is stored in Electron's user-data directory (usually `~/.config/MacroMaxx/` or `~/.config/macromaxx/` on Linux, depending on the app name). The previous valid version is kept beside it as `workspace.json.bak`. Writes are serialized through a temporary file; a damaged primary file is recovered from the backup. Activity logs stay in memory.

Import/export is available in Settings. Importing replaces the workspace after confirmation. Images are embedded. OBS passwords and webhook credentials are stored locally and **are also included in export files**.

The app controls one active USB deck. Select a target device if multiple decks are connected. Key devices recognized by `@elgato-stream-deck/node` are supported. Encoders, touch strips, and model-specific extras are not represented in the editor. Keys outside a smaller device's visible grid remain in the profile.

## Project structure

```text
electron/     Main process, preload, hardware, actions, portal, and plugins
src/          React editor and hardware key-image rendering
shared/       Data model, shared layout, and import validation
plugins/      Bundled example plugin
tests/        Node test suite
docs/         Plugin documentation
```

Run `npx vite --host 127.0.0.1` for a standalone browser preview. Profiles are stored in Local Storage there; native actions require Electron.

Independent project, not official Elgato software.
