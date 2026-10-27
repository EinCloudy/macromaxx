// Portable action contracts. Implementations and OS restrictions are supplied
// by native plugin manifests, not by the core action runner.
export const nativeActionDefinitions = [
  { type: 'hotkey', provider: 'keyboard', order: 10, name: 'Hotkey', icon: 'Keyboard', group: 'System', description: 'Trigger a key combination', defaults: { keys: 'CTRL+SHIFT+M' } },
  { type: 'app', provider: 'launcher', order: 30, name: 'Open application', icon: 'AppWindow', group: 'System', description: 'Launch an application or file', defaults: { mode: 'file', path: '', args: '[]', cwd: '', env: '{}', terminal: false } },
  { type: 'script', provider: 'launcher', order: 35, name: 'Shell script', icon: 'Terminal', group: 'System', description: 'Run a command or script with arguments', defaults: { shell: '/bin/sh', script: '', args: '[]', cwd: '', env: '{}' } },
  { type: 'text', provider: 'keyboard', order: 40, name: 'Type text', icon: 'TextCursorInput', group: 'System', description: 'Paste text from the clipboard', defaults: { text: '' } },
  { type: 'media', provider: 'media', order: 50, name: 'Media controls', icon: 'Music2', group: 'System', description: 'Control playback and volume', defaults: { command: 'playpause', player: 'auto', showTitle: false, showArtist: false, volume: 50, step: 5 } },
  { type: 'audio', provider: 'linux-audio', order: 55, name: 'Audio & microphone', icon: 'Mic', group: 'System', description: 'Devices, mute, volume, and microphone holds', defaults: { kind: 'input', target: 'default', command: 'mute', volume: 5 } },
  { type: 'desktop', provider: 'linux-desktop', order: 60, name: 'Desktop & windows', icon: 'Monitor', group: 'System', description: 'Workspaces, windows, and monitors', defaults: { command: 'workspace-next' } },
  { type: 'sound', provider: 'soundboard', order: 65, name: 'Soundboard', icon: 'Radio', group: 'System', description: 'Play audio using a shared default-output backend', defaults: { command: 'play', path: '', route: 'output', output: 'default', volume: 80, loop: false, behavior: 'restart' } },
  { type: 'obs', provider: 'obs', order: 80, name: 'OBS Studio', icon: 'Video', group: 'Connections', description: 'Scenes, recording, and streaming', defaults: { command: 'scene', scene: '', input: '' } },
  { type: 'discord', provider: 'discord', order: 85, name: 'Discord', icon: 'Headphones', group: 'Connections', description: 'Microphone mute and deafen with live status', defaults: { command: 'mute', mode: 'toggle' } },
];
