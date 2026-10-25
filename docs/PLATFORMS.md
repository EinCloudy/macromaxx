# Platform support

MacroMaxx has a platform-neutral core and bundled native integration plugins. A common editor does not imply that every OS has an implementation of every native capability.

| Feature | Linux | Windows | macOS |
| --- | --- | --- | --- |
| Editor, profiles, folders, Back position, fonts, import/export | Core | Core | Core |
| Stream Deck keys, images, brightness, animations, reconnect | Shared HID library; USB permissions may need setup | Shared HID library | Shared HID library |
| Webhooks, URLs, OBS WebSocket, delays/action chains | Core | Core | Core |
| User JavaScript plugin worker API | Yes; plugin code must be portable | Yes; plugin code must be portable | Yes; plugin code must be portable |
| Hotkeys and text paste | Native Keyboard: portal/EIS on Wayland, xdotool on X11 | Native Keyboard: PowerShell/native key events | Native Keyboard: System Events; permissions required |
| Separate key hold/release | Yes | Yes | Not implemented by the current adapter |
| Executable/file launch and arguments | Native Applications | Native Applications | Native Applications; app-bundle options differ from executable options |
| Installed desktop-entry search, Flatpak, terminal mode | Native Applications | Not implemented | Not implemented |
| POSIX shell scripts | Native Applications | Not implemented | Native Applications |
| Basic global media playback keys | Native Media / MPRIS | Native Media / keyboard events | Not implemented by the current adapter |
| System volume/mute | Native Media | Native Media | Native Media / AppleScript |
| Player selection, track metadata, player volume | Native Media / MPRIS | Not implemented | Not implemented |
| Device/app audio mixer, mic holds | Linux Audio plugin | No bundled adapter | No bundled adapter |
| Soundboard and virtual microphone routing | Linux Soundboard plugin | No bundled adapter | No bundled adapter |
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
- `plugins/native/linux-soundboard/`: ffmpeg/PipeWire playback and virtual routing.

**Settings → Bundled native plugins** lists platforms, loaded/unsupported/error state, capability readiness, and optional plugin switches. Changes to optional plugin enablement take effect after restart. Required base adapters remain included. User worker plugins remain a separate API.

## Portability of saved data

Action IDs/types and workspace version 1 are retained. OS-local paths, desktop IDs, audio targets, shortcuts, and rules may need adaptation on another OS. Custom labels/content and unsupported plugin parameters are not rewritten. Portable core actions can run even if a native dependency is missing.

## Verification scope

Live device and integration checks are performed on Linux/KDE/Wayland in this workspace. Windows/macOS adapter selection and command contracts are covered with injected helpers, without pretending to run those operating systems. Real target-system testing, OS permissions, signing, and installer verification are still required. GNOME/X11 implementations also need live checks on their target desktops.
