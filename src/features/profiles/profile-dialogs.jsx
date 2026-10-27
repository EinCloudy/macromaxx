import React, { useState } from 'react';
import { makeProfile, duplicateProfile } from '../../../shared/model.js';
import { Modal } from '../../components/modal.jsx';
import { Button, Field } from '../../components/ui.jsx';

export function ProfileDialogs({
  modal,
  setModal,
  profile,
  state,
  count,
  change,
  onProfileChange,
}) {
  const [name, setName] = useState(modal === 'renameProfile' ? profile.name : '');
  const close = () => setModal(null);
  const save = () => {
    if (modal === 'newProfile') {
      if (!name.trim()) return;
      change((next) => {
        const created = makeProfile(name.trim());
        created.keys = Array(count).fill(null);
        next.profiles.push(created);
        next.activeProfileId = created.id;
      });
      onProfileChange();
    } else {
      change((next) => {
        next.profiles.find((item) => item.id === profile.id).name = name.trim() || profile.name;
      });
    }
    close();
  };

  if (modal === 'newProfile' || modal === 'renameProfile')
    return (
      <Modal title={modal === 'newProfile' ? 'New profile' : 'Rename profile'} onClose={close}>
        <p>Profiles store separate sets of key assignments.</p>
        <Field label="Profile name">
          <input
            autoFocus
            maxLength={60}
            placeholder="e.g. Streaming"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') save();
            }}
          />
        </Field>
        <Button className="primary full" onClick={save}>
          Save
        </Button>
      </Modal>
    );

  if (modal === 'profileOptions')
    return (
      <Modal title={profile.name} onClose={close}>
        <p>Profile options</p>
        <Button className="full" icon="Pencil" onClick={() => setModal('renameProfile')}>
          Rename
        </Button>
        <Button
          className="full"
          icon="Copy"
          onClick={() => {
            change((next) => {
              const copy = duplicateProfile(profile);
              next.profiles.push(copy);
              next.activeProfileId = copy.id;
            });
            onProfileChange();
            close();
          }}
        >
          Duplicate profile
        </Button>
        <Button
          className="full danger"
          icon="Trash2"
          disabled={state.profiles.length < 2}
          onClick={() => {
            change((next) => {
              next.profiles = next.profiles.filter((item) => item.id !== profile.id);
              next.activeProfileId = next.profiles[0].id;
            });
            onProfileChange();
            close();
          }}
        >
          Delete profile
        </Button>
      </Modal>
    );

  return (
    <Modal title="Quick guide" onClose={close}>
      <p>
        1. Drag an action from the library onto a key.
        <br />
        <br />
        2. Use Properties to edit its label, icon, and action.
        <br />
        <br />
        3. Click Test or press the physical key.
        <br />
        <br />
        Double-click to open folders. Add multiple actions to a key to build a chain. Trigger a
        running chain again to stop it.
        <br />
        <br />
        Open Plugins to connect OBS and manage extensions. Open Settings for keyboard input, USB
        access, media controls, and appearance.
      </p>
      <Button className="primary full" onClick={close}>
        Close
      </Button>
    </Modal>
  );
}
