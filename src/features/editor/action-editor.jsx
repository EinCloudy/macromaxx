import React, { useState } from 'react';
import { catalog } from '../../../shared/model.js';
import { NativeActionEditor } from '../../../plugins/native/ui.jsx';
import { Icon } from '../../icons.jsx';
import { Field, Tool } from '../../components/ui.jsx';
import {
  clearCredentialFields,
  hasMissingCredentials,
} from '../../../shared/workspace-credentials.js';

export function ActionEditor({
  action,
  index,
  total,
  update: onUpdate,
  remove,
  move,
  state,
  status,
  plugins,
  perform,
}) {
  const item = catalog.find((c) => c.type === action.type);
  const [recording, setRecording] = useState(false);
  const update = (patch) => {
    const next = { ...action };
    clearCredentialFields(next, Object.keys(patch));
    onUpdate({ ...patch, missingCredentials: next.missingCredentials });
  };
  const input = (name, label, placeholder, multiline = false) => (
    <Field label={label}>
      {multiline ? (
        <textarea
          rows={3}
          value={action[name] || ''}
          placeholder={placeholder}
          onChange={(e) => update({ [name]: e.target.value })}
        />
      ) : (
        <input
          value={action[name] || ''}
          placeholder={placeholder}
          onChange={(e) => update({ [name]: e.target.value })}
        />
      )}
    </Field>
  );
  const select = (name, label, options) => (
    <Field label={label}>
      <select value={action[name] || ''} onChange={(e) => update({ [name]: e.target.value })}>
        {options.map(([value, text]) => (
          <option value={value} key={value}>
            {text}
          </option>
        ))}
      </select>
    </Field>
  );
  return (
    <div className="action-editor">
      <div className="action-editor-head">
        <span>
          <b>{index + 1}</b>
          <Icon name={item.icon} size={15} />
          {action.type === 'plugin'
            ? plugins.find((plugin) => plugin.id === action.pluginId)?.name ||
              action.pluginId ||
              item.name
            : item.name}
        </span>
        <div>
          <Tool icon="ChevronUp" title="Move up" disabled={!index} onClick={() => move(-1)} />
          <Tool
            icon="ChevronDown"
            title="Move down"
            disabled={index === total - 1}
            onClick={() => move(1)}
          />
          <Tool icon="X" title="Remove action" onClick={remove} />
        </div>
      </div>
      {hasMissingCredentials(action) && (
        <p className="notice" role="status">
          Credentials omitted from export. Open Settings → Complete missing credentials to finish
          this action. It cannot run yet.
        </p>
      )}
      <NativeActionEditor action={action} update={update} status={status} perform={perform} />
      {action.type === 'hotkey' && (
        <>
          <Field label="Key combination" hint="e.g. CTRL+SHIFT+M, ALT+F4, or META+E">
            <div className="input-with-button">
              <input
                value={recording ? 'Press your keys now …' : action.keys}
                onChange={(e) => update({ keys: e.target.value })}
                onKeyDown={(e) => {
                  if (!recording) return;
                  e.preventDefault();
                  const key = e.key;
                  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return;
                  const tokens = [
                    e.ctrlKey && 'CTRL',
                    e.altKey && 'ALT',
                    e.shiftKey && 'SHIFT',
                    e.metaKey && 'META',
                    {
                      ' ': 'SPACE',
                      ArrowUp: 'UP',
                      ArrowDown: 'DOWN',
                      ArrowLeft: 'LEFT',
                      ArrowRight: 'RIGHT',
                      '+': 'PLUS',
                    }[key] || key.toUpperCase(),
                  ].filter(Boolean);
                  update({ keys: tokens.join('+') });
                  setRecording(false);
                }}
              />
              <Tool
                icon={recording ? 'CircleStop' : 'CircleDot'}
                title="Record key combination"
                active={recording}
                onClick={(event) => {
                  setRecording(!recording);
                  event.currentTarget.parentElement.querySelector('input').focus();
                }}
              />
            </div>
          </Field>
          {select('mode', 'Behavior', [
            ['tap', 'Press & release'],
            ['down', 'Hold down'],
            ['up', 'Release'],
          ])}
        </>
      )}
      {action.type === 'url' && input('url', 'URL', 'https://…')}
      {action.type === 'text' && (
        <>
          {input('text', 'Text', 'Your text …', true)}
          <p className="muted-text">
            Copies the text to the clipboard and pastes it with Ctrl+V (Cmd+V on macOS).
          </p>
        </>
      )}
      {action.type === 'webhook' && (
        <>
          {select(
            'method',
            'Method',
            ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].map((m) => [m, m]),
          )}
          {input('url', 'Endpoint', 'https://…')}
          {input('headers', 'Headers (JSON)', '{"Content-Type":"application/json"}', true)}
          {!['GET', 'HEAD'].includes(action.method) && input('body', 'Request body', '{}', true)}
          <p className="muted-text">Timeout: 15 seconds. Results appear in Activity.</p>
        </>
      )}
      {action.type === 'delay' && (
        <Field label="Delay in milliseconds">
          <input
            type="number"
            min="0"
            max="300000"
            value={action.ms}
            onChange={(e) => update({ ms: Number(e.target.value) })}
          />
        </Field>
      )}
      {action.type === 'profile' &&
        select('profileId', 'Target profile', [
          ['', 'Choose a profile …'],
          ...state.profiles.map((p) => [p.id, p.name]),
        ])}
      {action.type === 'folder' && (
        <p className="muted-text">
          Double-click the key to open its folder. You can drag the Back key to any slot inside the
          folder.
        </p>
      )}
      {action.type === 'plugin' && (
        <>
          {select(
            'pluginId',
            'Plugin',
            plugins.map((p) => [p.id, p.name]),
          )}
          {(plugins.find((p) => p.id === action.pluginId)?.fields || []).map((field) => {
            let config;
            try {
              config = JSON.parse(action.config || '{}');
            } catch {
              config = {};
            }
            return (
              <Field key={field.key} label={field.label}>
                <input
                  value={config[field.key] ?? field.default ?? ''}
                  onChange={(e) =>
                    update({
                      config: JSON.stringify({ ...config, [field.key]: e.target.value }, null, 2),
                    })
                  }
                />
              </Field>
            );
          })}
          {input('config', 'Configuration (JSON)', '{}', true)}
        </>
      )}
    </div>
  );
}
