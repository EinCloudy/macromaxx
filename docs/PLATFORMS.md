# Platform support

MacroMaxx has a platform-neutral core and bundled native integration plugins. A common editor does not imply that every OS has an implementation of every native capability.

| Feature | Linux | Windows | macOS |
| --- | --- | --- | --- |
| Editor, profiles, folders, Back position, fonts, import/export | Core | Core | Core |
| Stream Deck keys, images, brightness, animations, reconnect | Shared HID library; USB permissions may need setup | Shared HID library | Shared HID library |
| Webhooks, URLs, OBS WebSocket, delays/action chains | Core | Core | Core |
| User JavaScript plugin worker API | Yes; plugin code must be portable | Yes; plugin code must be portable | Yes; plugin code must be portable |
| Hotkeys and text paste | RobotJS on X11, native portal/EIS on Wayland; xdotool fallback | Shared RobotJS; PowerShell fallback | Shared RobotJS; System Events fallback; permissions required |
| Separate key hold/release | Yes | Yes | Shared RobotJS; not implemented by the legacy AppleScript fallback |
| Executable/file launch and arguments | Native Applications | Native Applications | Native Applications; app-bundle options differ from executable options |
| Installed desktop-entry search, Flatpak, terminal mode | Native Applications | Not implemented | Not implemented |
| POSIX shell scripts | Native Applications | Not implemented | Native Applications |
| Basic global media playback keys | MPRIS preferred when a player exists; shared/global-key fallback | Shared RobotJS media keys; native fallback | Shared RobotJS media keys (permission required); legacy fallback has volume/mute only |
| System volume/mute | Native Media | Native Media | Native Media / AppleScript |
| Player selection, track metadata, player volume | Native Media / MPRIS | Not implemented | Not implemented |
| Device/app audio mixer, mic holds | Linux Audio plugin | No bundled adapter | No bundled adapter |
| Default-output sound playback, volume, loop/stop/overlap | Shared node-web-audio-api; PipeWire fallback | Shared node-web-audio-api | Shared node-web-audio-api |
| Named outputs and virtual microphone routing | Linux Audio Routing plugin | No bundled routing adapter | No bundled routing adapter |
| Native desktop/window actions and focus reporting | Linux Desktop plugin: KDE, GNOME extension, or X11 | No bundled adapter; use hotkeys/scripts where applicable | No bundled adapter; use hotkeys/scripts where applicable |
| Automatic profile rule engine | Core; needs native focus provider | Core; no bundled focus provider | Core; no bundled focus provider |
| Background/tray/single instance/window recreation | Core | Core | Core |
| Login integration and show shortcut | Native Session | Native Session | Native Session; login visibility depends on OS API |
| Local XDG application launcher installation | Native Session | Use installer-created OS shortcut | Use installer-created OS shortcut |

The UI derives availability from the loaded plugins, dependencies, and action variant. Unsupported actions are hidden from the library by default; **Show unavailable actions** reveals them. Existing assignments remain editable/exportable and show a reason when unavailable. A missing plugin does not remove its data or turn an OS-specific action into a silent success.

## Bundled plugin layout

- `plugins/native/keyboard/`: OS keyboard adapters, permission tokens, Linux portal and udev helpers.
- `plugins/native/launcher/`: executable/file launch, desktop entries, Flatpak, POSIX scripts.
- `plugins/native/media/`: OS media adapters and Linux MPRIS.
- `plugins/native/session/`: login items, XDG launcher, reopening shortcut, portal bootstrap.
- `plugins/native/linux-audio/`: PipeWire-Pulse/PulseAudio mixer and holds.
- `plugins/native/linux-desktop/`: KDE/GNOME/X11 actions and focus; GNOME extension bundled here.
- `plugins/native/soundboard/`: shared default-output Web Audio playback in an isolated native worker.
- `plugins/native/linux-soundboard/`: ffmpeg/PipeWire named-output playback, virtual microphone and routing.

**Settings → Bundled native plugins** lists platforms, loaded/unsupported/error state, capability readiness, and optional plugin switches. Changes to optional plugin enablement take effect after restart. Required base adapters remain included. User worker plugins remain a separate API.

## Default NPM backends and fallbacks

`@jitsi/robotjs` and `node-web-audio-api` are optional dependencies **installed by default** on supported systems. Optional status prevents an unsupported binary/architecture from breaking the entire installation. Both native addons execute in separate processes so a native assertion/ABI failure does not terminate Electron's main process.

The current native dependencies use Node-API prebuilds rather than Electron-specific ABI builds. Packaging disables unnecessary source rebuilding and runs `npm run verify:native` with Electron itself: sharp/HID are required, shared addons are checked separately, and optional failures retain native fallbacks. No key events, screen capture, or physical audio are generated by that build check.

RobotJS is preferred for Windows/macOS/X11 keyboard and global media keys. It is deliberately not used for native Wayland; the portal/EIS implementation remains there. macOS still requires Accessibility permission. Linux keeps MPRIS for player selection/metadata and keeps direct volume APIs when available so system volume does not suddenly require keyboard permission.

Shared sound playback uses the Web Audio API for decoding, gain, looping, stopping and overlap on the default output. It does not claim cross-platform virtual microphones, per-application mixer control, or named-device routing. The library's Linux binaries may need libjack/pipewire-jack. The Linux routing plugin can provide a fallback if the shared audio binary/backend is unavailable. Supported formats depend on the library's decoder. File input is limited to 64 MB and decoded cache to 64 MB; larger streaming/routing needs the native provider.

Existing disabled Linux soundboard preferences are migrated once to keep shared playback disabled too. Afterwards the shared player and Linux routing plugins can be enabled independently.

## Portability of saved data

Action IDs/types and workspace version 1 are retained. OS-local paths, desktop IDs, audio targets, shortcuts, and rules may need adaptation on another OS. Custom labels/content and unsupported plugin parameters are not rewritten. Portable core actions can run even if a native dependency is missing.

## Verification scope

Live device and integration checks are performed on Linux/KDE/Wayland in this workspace. Windows/macOS adapter selection and command contracts are covered with injected helpers, without pretending to run those operating systems. Real target-system testing, OS permissions, signing, and installer verification are still required. GNOME/X11 implementations also need live checks on their target desktops.
