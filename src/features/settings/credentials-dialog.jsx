import React, { useState } from 'react';
import {
  missingWorkspaceCredentials,
  restoreWorkspaceCredential,
} from '../../../shared/workspace-credentials.js';
import { Modal } from '../../components/modal.jsx';
import { Button, Field } from '../../components/ui.jsx';

export function CredentialsDialog({ state, change, onClose }) {
  const entries = missingWorkspaceCredentials(state);
  const [selected, setSelected] = useState('');
  const entry = entries.find((item) => item.id === selected) || entries[0];
  if (!entry) return null;
  return (
    <Modal title="Complete missing credentials" onClose={onClose}>
      <p>
        {entries.length} field(s) were omitted for safe sharing. Enter your own values; nothing is
        copied from your previous workspace. Affected actions stay blocked until completed. You can
        finish later from Settings.
      </p>
      <Field label="Missing field">
        <select value={entry.id} onChange={(event) => setSelected(event.target.value)}>
          {entries.map((item) => (
            <option key={item.id} value={item.id}>
              {item.context} — {item.label}
            </option>
          ))}
        </select>
      </Field>
      <CredentialForm
        key={entry.id}
        entry={entry}
        save={(value) => {
          change((next) => restoreWorkspaceCredential(next, entry.id, value));
          if (entries.length === 1) onClose();
        }}
        onClose={onClose}
      />
    </Modal>
  );
}

function CredentialForm({ entry, save, onClose }) {
  const [value, setValue] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        try {
          save(value);
        } catch (err) {
          setError(err.message);
        }
      }}
    >
      <Field label={entry.label} hint={entry.context}>
        {visible ? (
          <textarea
            autoFocus
            rows={4}
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        ) : (
          <input
            autoFocus
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        )}
      </Field>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={visible}
          onChange={(event) => setVisible(event.target.checked)}
        />
        Show value / multiline editor
      </label>
      <p>
        Values are stored locally. Choose export without credentials to omit them when sharing. Use{' '}
        {'{}'} for an intentionally empty JSON object.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="tool-row">
        <Button type="submit" className="primary" disabled={!value.length}>
          Save field
        </Button>
        <Button type="button" onClick={onClose}>
          Finish later
        </Button>
      </div>
    </form>
  );
}
