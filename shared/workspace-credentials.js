// Exported workspaces retain their normal schema. These markers describe fields
// deliberately emptied for sharing; no secret values are stored in the markers.
const secretName =
  /password|passwd|passphrase|secret|token|apikey|accesskey|privatekey|authorization|cookie|credential/i;
const protectedFields = new Set([
  'id',
  'type',
  'missingCredentials',
  '__proto__',
  'prototype',
  'constructor',
]);
const labels = {
  obsPassword: 'OBS password',
  obsUrl: 'OBS WebSocket address',
  url: 'URL / webhook endpoint',
  headers: 'Request headers (JSON object)',
  body: 'Request body',
  config: 'Plugin configuration (JSON object)',
  env: 'Environment variables (JSON object)',
};

export function hasMissingCredentials(value) {
  return !!value?.missingCredentials?.length;
}

export function validateCredentialMarkers(value) {
  if (value.missingCredentials === undefined) return;
  const fields = value.missingCredentials;
  if (
    !Array.isArray(fields) ||
    fields.length > 100 ||
    new Set(fields).size !== fields.length ||
    fields.some(
      (field) =>
        typeof field !== 'string' ||
        field.length > 128 ||
        protectedFields.has(field) ||
        !Object.hasOwn(value, field) ||
        typeof value[field] !== 'string',
    )
  )
    throw new Error('Invalid missing-credential fields.');
}

export function clearCredentialFields(value, fields) {
  if (!value.missingCredentials) return;
  value.missingCredentials = value.missingCredentials.filter((field) => !fields.includes(field));
  if (!value.missingCredentials.length) delete value.missingCredentials;
}

function visitActions(state, visit) {
  function keys(profile, items, parents = []) {
    for (const key of items) {
      if (!key) continue;
      const location = [profile.name, ...parents, key.label].join(' / ');
      for (const chain of ['actions', 'longActions']) {
        key[chain].forEach((action, index) =>
          visit(action, {
            identity: [profile.id, key.id, chain, index],
            context: `${location} · ${chain === 'longActions' ? 'Long press' : 'Short press'} · ${index + 1}`,
          }),
        );
      }
      keys(profile, key.children, [...parents, key.label]);
    }
  }
  state.profiles.forEach((profile) => keys(profile, profile.keys));
}

function redact(value, field, replacement = '') {
  if (typeof value[field] !== 'string' || !value[field].length) return;
  value[field] = replacement;
  value.missingCredentials = [...new Set([...(value.missingCredentials || []), field])];
}

function opaqueJSON(value, field) {
  if (!value[field]?.trim()) return;
  try {
    const parsed = JSON.parse(value[field]);
    if (parsed && typeof parsed === 'object' && !Object.keys(parsed).length) return;
  } catch {
    /* Invalid configurations must not leak their raw contents either. */
  }
  redact(value, field, '{}');
}

function credentialFields(value) {
  for (const field of Object.keys(value)) {
    if (!protectedFields.has(field) && secretName.test(field.replace(/[^a-z]/gi, '')))
      redact(value, field);
  }
}

function privateURL(value, field, always = false) {
  if (!value[field]) return;
  try {
    const url = new URL(value[field]);
    if (always || url.username || url.password || url.search || url.hash) redact(value, field);
  } catch {
    // Do not accidentally share an invalid URL containing credentials either.
    redact(value, field);
  }
}

export function createWorkspaceExport(state, { includeCredentials = false } = {}) {
  const copy = structuredClone(state);
  if (includeCredentials === true) return copy;
  credentialFields(copy.settings);
  privateURL(copy.settings, 'obsUrl');
  visitActions(copy, (action) => {
    credentialFields(action);
    if (action.type === 'webhook') {
      // Capability URLs (e.g. Discord/Slack) hide secrets in arbitrary path parts.
      privateURL(action, 'url', true);
      opaqueJSON(action, 'headers');
      if (action.body?.trim() && !['{}', '[]'].includes(action.body.trim())) redact(action, 'body');
    } else if (action.type === 'url') privateURL(action, 'url');
    // These schemas are user/plugin-defined. Guessing which values are secret is
    // unsafe, so omit the complete nonempty configuration rather than a blacklist.
    if (action.type === 'plugin') opaqueJSON(action, 'config');
    if (['app', 'script'].includes(action.type)) opaqueJSON(action, 'env');
  });
  return copy;
}

export function missingWorkspaceCredentials(state) {
  const entries = [];
  const collect = (container, identity, context) => {
    for (const field of container.missingCredentials || []) {
      entries.push({
        id: JSON.stringify([...identity, field]),
        container,
        field,
        label: labels[field] || field,
        context,
      });
    }
  };
  collect(state.settings, ['settings'], 'App settings');
  visitActions(state, (action, { identity, context }) => collect(action, identity, context));
  return entries;
}

export function restoreWorkspaceCredential(state, id, value) {
  const entry = missingWorkspaceCredentials(state).find((item) => item.id === id);
  if (!entry) throw new Error('This missing field no longer exists.');
  if (typeof value !== 'string' || !value.length) throw new Error('Enter the missing value first.');
  const { container, field } = entry;
  if (['headers', 'config', 'env'].includes(field)) {
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error('Enter a valid JSON object.');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('Enter a valid JSON object.');
    if (
      ['headers', 'env'].includes(field) &&
      Object.values(parsed).some((item) => typeof item !== 'string')
    )
      throw new Error('All values in this JSON object must be strings.');
  }
  if (['url', 'obsUrl'].includes(field)) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error('Enter a valid URL.');
    }
    const protocols =
      field === 'obsUrl'
        ? ['ws:', 'wss:']
        : container.type === 'webhook'
          ? ['http:', 'https:']
          : ['http:', 'https:', 'mailto:'];
    if (!protocols.includes(url.protocol)) throw new Error('This URL protocol is not supported.');
  }
  container[field] = value;
  clearCredentialFields(container, [field]);
}

export const missingCredentialMessage =
  'Missing credentials. Open Settings → Complete missing credentials before running this action.';
