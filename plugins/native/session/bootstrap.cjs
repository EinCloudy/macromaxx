module.exports = (app, platform) => {
  if (platform === 'linux') app.commandLine.appendSwitch('enable-features', [...new Set([...(app.commandLine.getSwitchValue('enable-features') || '').split(',').filter(Boolean), 'GlobalShortcutsPortal'])].join(','));
};
