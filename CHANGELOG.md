# Changelog

## [Unreleased]

- A single Export button offers exports with or without credentials (without is the default). Files with credentials contain unencrypted secrets and must be kept private.
- Exports without credentials omit potentially secret webhook/plugin/environment data without changing the local workspace.
- Importing shared workspaces prompts for missing values; affected actions remain blocked until completed. Existing version-1 exports remain supported.
- Review scripts, text, arguments and images before sharing; exports without credentials are not complete credential backups.

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
- Exports created by this initial preview include stored OBS passwords and webhook
  credentials. Re-export without credentials in a newer build before sharing.
- No automatic updates; install new releases manually.
