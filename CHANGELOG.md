# Changelog

## [0.1.0]

Initial MacroMaxx preview release.

- Visual Stream Deck editor with profiles, folders, action chains and long presses.
- Hotkeys, application launching, scripts, webhooks, media controls and soundboard.
- OBS Studio integration with live key status and optional native plugins.
- Linux desktop, audio routing and Wayland keyboard integrations where supported.
- Workspace import/export, diagnostics, themes and device animations.

### Downloads

- Linux x64: AppImage.
- Windows x64: NSIS installer.
- macOS Apple Silicon (ARM64): DMG. No Intel Mac build in this release pipeline.

### Known limitations

- This preview is unsigned; macOS builds are not notarized. Operating systems may
  warn about or block installation. Public distribution should use signed builds.
- Discord voice control is experimental and authorization is not confirmed working.
- Native features differ by platform; see the platform matrix in the repository.
- Workspace exports currently include stored OBS passwords and webhook credentials.
  Do not share exports containing secrets.
- No automatic updates; install new releases manually.
