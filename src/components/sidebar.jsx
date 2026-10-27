import React from 'react';
import { Icon } from '../icons.jsx';
import { Tool } from './ui.jsx';

const profileColors = [
  '#ad92ff',
  '#82c8ff',
  '#86dfb5',
  '#ffce83',
  '#fb9eb5',
  '#ffffff',
  '#72d9db',
  '#ff8e74',
];
export const pages = [
  { id: 'editor', name: 'Deck Editor', icon: 'LayoutGrid' },
  { id: 'activity', name: 'Activity', icon: 'Activity' },
  { id: 'plugins', name: 'Plugins', icon: 'Puzzle' },
  { id: 'diagnostics', name: 'Diagnostics', icon: 'CircleHelp' },
  { id: 'settings', name: 'Settings', icon: 'Settings2' },
];

export function Sidebar({
  state,
  status,
  page,
  setPage,
  hasErrors,
  onAddProfile,
  onSelectProfile,
  onToggleTheme,
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <Icon name="Zap" size={21} />
        </div>
        <span>
          macro<span className="brand-light">maxx</span>
        </span>
      </div>
      <div className="nav-label">Workspace</div>
      {pages
        .filter((item) => item.id !== 'settings')
        .map((item) => (
          <button
            key={item.id}
            className={`nav-item ${page === item.id ? 'selected' : ''}`}
            onClick={() => setPage(item.id)}
          >
            <Icon name={item.icon} size={18} />
            {item.name}
            {item.id === 'editor' && <kbd>{status.device?.count || 15}</kbd>}
            {item.id === 'activity' && hasErrors && <span className="nav-dot" />}
          </button>
        ))}
      <div className="nav-label profiles-label">
        Profiles
        <Tool icon="Plus" title="Add profile" onClick={onAddProfile} />
      </div>
      <div className="profile-list">
        {state.profiles.map((profile, index) => (
          <button
            key={profile.id}
            className={`profile-item ${profile.id === state.activeProfileId ? 'selected' : ''}`}
            onClick={() => onSelectProfile(profile.id)}
          >
            <span
              className="profile-icon"
              style={{ color: profileColors[index % profileColors.length] }}
            >
              <Icon name={profile.icon || 'Layers'} size={16} />
            </span>
            <span>{profile.name}</span>
            {profile.id === state.activeProfileId && <span className="tiny-dot" />}
          </button>
        ))}
      </div>
      <div className="sidebar-bottom">
        <div className="device-mini">
          <Icon name="Usb" size={18} />
          <div>
            <strong>{status.device?.connected ? 'Stream Deck' : 'Virtual Deck'}</strong>
            <span>
              <i className={status.device?.connected ? 'green-dot' : 'gray-dot'} />
              {status.device?.connected ? 'Connected' : 'Preview mode'}
            </span>
          </div>
        </div>
        <button
          className={`nav-item ${page === 'settings' ? 'selected' : ''}`}
          onClick={() => setPage('settings')}
        >
          <Icon name="Settings2" size={18} />
          Settings
        </button>
        <div className="sidebar-footer">
          <span>
            MacroMaxx <b>0.1.0</b>
          </span>
          <Tool
            icon={state.settings.theme === 'light' ? 'Moon' : 'Sun'}
            title="Switch theme"
            onClick={onToggleTheme}
          />
        </div>
      </div>
    </aside>
  );
}

export function Topbar({ page, saveState, onHelp }) {
  const failed = saveState === 'Save failed';
  return (
    <header className="topbar">
      <div className="breadcrumb">
        MacroMaxx
        <Icon name="ChevronRight" size={14} />
        <span>{pages.find((item) => item.id === page)?.name}</span>
      </div>
      <div className="topbar-actions">
        <span role="status" className={`save-status ${failed ? 'error' : ''}`}>
          <Icon
            name={saveState === 'Saved' ? 'Check' : failed ? 'CircleAlert' : 'Loader'}
            size={15}
          />
          {saveState}
        </span>
        <span className="separator" />
        <Tool icon="CircleHelp" title="Quick guide" onClick={onHelp} />
      </div>
    </header>
  );
}
