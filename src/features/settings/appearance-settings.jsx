import React from 'react';
import { animationEnabled } from '../../../shared/animation-settings.js';
import { globalFontSize, DEFAULT_FONT_SIZE } from '../../../shared/key-text.js';
import { Icon } from '../../icons.jsx';
import { KeyArtwork } from '../../key-artwork.jsx';
import { FontSizeControl } from '../../components/font-size-control.jsx';
import { Switch } from '../../components/ui.jsx';

export function TypographySettings({ state, change }) {
  const size = globalFontSize(state.settings);
  const preview = {
    label: 'Hello World',
    icon: 'TextCursorInput',
    color: '#ad92ff',
    background: '#242231',
  };
  return (
    <section className="settings-card">
      <div className="settings-title">
        <span className="action-icon">
          <Icon name="TextCursorInput" />
        </span>
        <div>
          <h3>Text & labels</h3>
          <p>Default font size for key labels.</p>
        </div>
      </div>
      <div className="key-preview" style={{ background: preview.background }}>
        <KeyArtwork keyData={preview} defaultFontSize={size} />
      </div>
      <FontSizeControl
        keyData={{ fontSize: size }}
        global
        onChange={(value) =>
          change((s) => {
            s.settings.defaultFontSize = value;
          })
        }
        onReset={() =>
          change((s) => {
            s.settings.defaultFontSize = DEFAULT_FONT_SIZE;
          })
        }
      />
      <p className="muted-text">
        Keys without a custom size use this default, including keys in folders. To remove an
        override, choose Default in the key's properties.
      </p>
    </section>
  );
}

export function AnimationSettings({ state, change }) {
  const folder = animationEnabled(state.settings, 'folder');
  const reveal = animationEnabled(state.settings, 'reveal');
  return (
    <section className="settings-card">
      <div className="settings-title">
        <span className="action-icon">
          <Icon name="Layers" />
        </span>
        <div>
          <h3>Deck animations</h3>
          <p>Startup effects and folder transitions.</p>
        </div>
      </div>
      <div className="setting-line">
        <div>
          <strong>Startup & shutdown wave</strong>
          <small>Outward on startup, inward on shutdown.</small>
        </div>
        <span className="badge accent">Always on</span>
      </div>
      <div className="setting-line">
        <div>
          <strong>Folder transitions</strong>
          <small>A short crossfade and slide when entering or leaving folders.</small>
        </div>
        <Switch
          label="Folder animation"
          checked={folder}
          onChange={(value) =>
            change((s) => {
              s.settings.folderAnimations = value;
            })
          }
        />
      </div>
      <div className="setting-line">
        <div>
          <strong>Reveal icons after startup</strong>
          <small>Show keys from the center after the startup wave.</small>
        </div>
        <Switch
          label="Icon reveal animation"
          checked={reveal}
          onChange={(value) =>
            change((s) => {
              s.settings.iconRevealAnimation = value;
            })
          }
        />
      </div>
      <p className="muted-text">Press a key to skip the startup wave and optional effects.</p>
    </section>
  );
}
