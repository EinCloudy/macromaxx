import React, { useMemo, useState } from 'react';
import { api, desktop } from './api.js';
import { Icon } from './icons.jsx';
import { Button, Tool } from './components/ui.jsx';
import { Sidebar, Topbar } from './components/sidebar.jsx';
import { DeckEditor } from './features/editor/deck-editor.jsx';
import { ProfileDialogs } from './features/profiles/profile-dialogs.jsx';
import { Activity } from './features/activity/activity.jsx';
import { Settings } from './features/settings/settings.jsx';
import { Plugins } from './features/plugins/plugins.jsx';
import { Diagnostics } from './features/diagnostics/diagnostics.jsx';
import { useWorkspace } from './hooks/use-workspace.jsx';
import { useNotifications } from './hooks/use-notifications.jsx';
import { useRuntime } from './hooks/use-runtime.jsx';
import { useKeyImages } from './hooks/use-key-images.jsx';
import { missingWorkspaceCredentials } from '../shared/workspace-credentials.js';
import { CredentialsDialog } from './features/settings/credentials-dialog.jsx';

export default function App() {
  const { toast, dismiss, notify, perform } = useNotifications();
  const { state, replace, change, undo, redo, flush, saveState, canUndo, canRedo } =
    useWorkspace(notify);
  const {
    status,
    path,
    setPath,
    selected,
    setSelected,
    logs,
    clearLogs,
    pressed,
    plugins,
    refreshPlugins,
    credentialsRequired,
    setCredentialsRequired,
  } = useRuntime({ replace, flush, notify });
  const [page, setPage] = useState('editor');
  const [modal, setModal] = useState(null);
  const missingCredentials = useMemo(
    () => (state ? missingWorkspaceCredentials(state).length : 0),
    [state],
  );
  useKeyImages(state, status, notify);

  async function navigate(target) {
    await perform(async () => {
      await flush();
      if (desktop) await api.navigate(target);
      else if (target.profileId) {
        change((next) => {
          next.activeProfileId = target.profileId;
        });
        setPath([]);
      } else setPath(target.up ? path.slice(0, -1) : target.path);
      setSelected(0);
    });
  }

  if (!state)
    return (
      <div className="loading">
        <div className="brand-mark">
          <Icon name="Zap" size={30} />
        </div>
        <h2>MacroMaxx</h2>
        <p>Loading …</p>
        {toast && <p>{toast.message}</p>}
      </div>
    );

  const profile = state.profiles.find((item) => item.id === state.activeProfileId);
  let content;
  switch (page) {
    case 'editor':
      content = (
        <DeckEditor
          state={state}
          status={status}
          plugins={plugins}
          path={path}
          selected={selected}
          setSelected={setSelected}
          pressed={pressed}
          change={change}
          undo={undo}
          redo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          navigate={navigate}
          flush={flush}
          perform={perform}
          notify={notify}
          openPlugins={() => setPage('plugins')}
          openProfileDialog={setModal}
        />
      );
      break;
    case 'activity':
      content = (
        <Activity
          logs={logs}
          onClear={clearLogs}
          onStop={() => perform(() => api.cancel(), 'Action chains canceled')}
        />
      );
      break;
    case 'diagnostics':
      content = (
        <Diagnostics
          status={status}
          perform={perform}
          openSettings={() => setPage('settings')}
          openPlugins={() => setPage('plugins')}
        />
      );
      break;
    case 'plugins':
      content = (
        <Plugins
          state={state}
          status={status}
          plugins={plugins}
          change={change}
          perform={perform}
          flush={flush}
          refreshPlugins={refreshPlugins}
        />
      );
      break;
    case 'settings':
      content = (
        <Settings
          state={state}
          status={status}
          change={change}
          perform={perform}
          flush={flush}
          completeCredentials={() => setCredentialsRequired(true)}
        />
      );
      break;
  }

  return (
    <div className={`app ${state.settings.theme === 'light' ? 'light' : ''}`}>
      <Sidebar
        state={state}
        status={status}
        page={page}
        setPage={setPage}
        hasErrors={logs.some((item) => item.level === 'error')}
        onAddProfile={() => setModal('newProfile')}
        onSelectProfile={(id) => {
          navigate({ profileId: id });
          setPage('editor');
        }}
        onToggleTheme={() =>
          change((next) => {
            next.settings.theme = next.settings.theme === 'light' ? 'dark' : 'light';
          })
        }
      />
      <main className="main">
        <Topbar page={page} saveState={saveState} onHelp={() => setModal('help')} />
        {missingCredentials > 0 && (
          <div className="notice" role="status">
            <Icon name="CircleAlert" size={17} />
            <span>
              {missingCredentials} missing credential field(s). Affected actions are blocked.
            </span>
            <Button onClick={() => setCredentialsRequired(true)}>Complete credentials</Button>
          </div>
        )}
        {content}
      </main>
      {toast && (
        <div role="status" className={`toast ${toast.error ? 'error' : ''}`}>
          <Icon name={toast.error ? 'CircleAlert' : 'CheckCircle2'} size={19} />
          <span>{toast.message}</span>
          <Tool icon="X" title="Close" onClick={dismiss} />
        </div>
      )}
      {modal && (
        <ProfileDialogs
          key={modal}
          modal={modal}
          setModal={setModal}
          profile={profile}
          state={state}
          count={status.device?.count || 15}
          change={change}
          onProfileChange={() => {
            setPath([]);
            setSelected(0);
          }}
        />
      )}
      {credentialsRequired && missingCredentials > 0 && (
        <CredentialsDialog
          state={state}
          change={change}
          onClose={() => setCredentialsRequired(false)}
        />
      )}
    </div>
  );
}
