import { MIN_FONT_SIZE, MAX_FONT_SIZE } from './key-text.js';
import { catalog } from './action-catalog.js';
import { SCREENSAVERS, SCREENSAVER_GRAPHICS_PRESETS } from './screensaver.js';

const actionTypes = new Set(catalog.map((action) => action.type));
const hexColor = /^#[0-9a-f]{6}$/i;

function validateActions(actions) {
  if (!Array.isArray(actions) || actions.length > 100) throw new Error('Invalid action chain.');
  for (const action of actions) {
    if (!action || typeof action.id !== 'string' || !actionTypes.has(action.type))
      throw new Error('Unknown action type.');
  }
}

function validateKey(key) {
  if (
    typeof key.id !== 'string' ||
    typeof key.label !== 'string' ||
    key.label.length > 80 ||
    typeof key.icon !== 'string' ||
    typeof key.color !== 'string' ||
    !hexColor.test(key.color) ||
    !hexColor.test(key.background) ||
    typeof key.image !== 'string'
  )
    throw new Error('Invalid key.');
  if (
    key.fontSize !== undefined &&
    (!Number.isInteger(key.fontSize) ||
      key.fontSize < MIN_FONT_SIZE ||
      key.fontSize > MAX_FONT_SIZE)
  )
    throw new Error('Invalid font size.');
  if (
    key.backPosition !== undefined &&
    (!Number.isInteger(key.backPosition) || key.backPosition < 0 || key.backPosition > 127)
  )
    throw new Error('Invalid Back key position.');
  if (key.image && !/^data:image\/(png|jpeg|webp);base64,/.test(key.image))
    throw new Error('Invalid key image.');
  validateActions(key.actions);
  validateActions(key.longActions);
}

function validateSettings(settings) {
  if (settings?.screensaver !== undefined) {
    const saver = settings.screensaver;
    if (
      !saver ||
      typeof saver.enabled !== 'boolean' ||
      !SCREENSAVERS.some(({ id }) => id === saver.effect) ||
      (saver.performance !== undefined &&
        saver.performance !== 'smooth' &&
        !SCREENSAVER_GRAPHICS_PRESETS.some(({ id }) => id === saver.performance)) ||
      !Number.isInteger(saver.timeout) ||
      saver.timeout < 10 ||
      saver.timeout > 86400
    )
      throw new Error('Invalid screensaver settings.');
  }
  if (
    !settings ||
    !Number.isFinite(settings.brightness) ||
    settings.brightness < 0 ||
    settings.brightness > 100
  )
    throw new Error('Invalid settings.');
  if (
    typeof settings.autostart !== 'boolean' ||
    typeof settings.closeToTray !== 'boolean' ||
    typeof settings.obsUrl !== 'string' ||
    typeof settings.obsPassword !== 'string' ||
    !['dark', 'light'].includes(settings.theme)
  )
    throw new Error('Invalid app settings.');
  for (const name of [
    'folderAnimations',
    'iconRevealAnimation',
    'rememberWaylandPermission',
    'autoProfiles',
    'startInBackground',
  ]) {
    if (settings[name] !== undefined && typeof settings[name] !== 'boolean')
      throw new Error('Invalid animation setting.');
  }
  if (
    settings.autoProfileFallback !== undefined &&
    typeof settings.autoProfileFallback !== 'string'
  )
    throw new Error('Invalid automatic-profile fallback.');
  if (
    settings.showShortcut !== undefined &&
    (typeof settings.showShortcut !== 'string' || settings.showShortcut.length > 128)
  )
    throw new Error('Invalid window shortcut.');
  if (
    settings.disabledNativePlugins !== undefined &&
    (!Array.isArray(settings.disabledNativePlugins) ||
      settings.disabledNativePlugins.length > 64 ||
      settings.disabledNativePlugins.some(
        (id) => typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id),
      ))
  )
    throw new Error('Invalid native plugin settings.');
  if (
    settings.defaultFontSize !== undefined &&
    (!Number.isInteger(settings.defaultFontSize) ||
      settings.defaultFontSize < MIN_FONT_SIZE ||
      settings.defaultFontSize > MAX_FONT_SIZE)
  )
    throw new Error('Invalid default font size.');
}

export function validateState(value) {
  if (
    !value ||
    value.version !== 1 ||
    !Array.isArray(value.profiles) ||
    !value.profiles.length ||
    value.profiles.length > 100
  )
    throw new Error('Invalid workspace file (expected version 1).');
  const ids = new Set();
  const keyIds = new Set();
  let count = 0;

  function validateKeys(items, depth = 0) {
    if (!Array.isArray(items) || items.length > 128 || depth > 12)
      throw new Error('Invalid folder structure.');
    for (const key of items) {
      if (!key) continue;
      if (++count > 10000 || keyIds.has(key.id)) throw new Error('Invalid key.');
      validateKey(key);
      keyIds.add(key.id);
      validateKeys(key.children, depth + 1);
    }
  }

  for (const profile of value.profiles) {
    if (
      !profile ||
      typeof profile.id !== 'string' ||
      ids.has(profile.id) ||
      typeof profile.name !== 'string'
    )
      throw new Error('Invalid profile.');
    if (
      profile.appRules !== undefined &&
      (!Array.isArray(profile.appRules) ||
        profile.appRules.length > 32 ||
        profile.appRules.some((rule) => typeof rule !== 'string' || rule.length > 256))
    )
      throw new Error('Invalid application profile rules.');
    ids.add(profile.id);
    validateKeys(profile.keys);
  }
  if (!ids.has(value.activeProfileId)) throw new Error('Active profile is missing.');
  validateSettings(value.settings);
  return value;
}
