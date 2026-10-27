import React, { useState } from 'react';
import './plugins.css';
import { api } from './api.js';
import { Icon } from './icons.jsx';
import { NativePluginSettings } from '../plugins/native/ui.jsx';
import { PluginGuide } from './plugin-guide.jsx';
import { platformName, pluginLibrary } from '../shared/plugin-library.js';

const stateLabels = { loaded: 'Loaded', disabled: 'Disabled', unsupported: 'Unsupported', error: 'Failed', installed: 'Installed' };

export function Plugins({ state, status, plugins, change, perform, flush, refreshPlugins }) {
  const [search, setSearch] = useState(''), [filter, setFilter] = useState('all'), [selected, setSelected] = useState(null), [refreshing, setRefreshing] = useState(false);
  const items = pluginLibrary(plugins, status.native?.plugins || [], state.settings);
  const visible = items.filter(plugin => (filter === 'all' || plugin.kind === filter) && `${plugin.name} ${plugin.description || ''}`.toLowerCase().includes(search.toLowerCase()));
  const plugin = items.find(item => item.key === selected);
  const toggle = plugin => change(s => {
    const disabled = new Set(s.settings.disabledNativePlugins || []);
    if (plugin.enabled) disabled.add(plugin.id); else disabled.delete(plugin.id);
    s.settings.disabledNativePlugins = [...disabled];
  });
  const control = plugin => plugin.required ? <span className="badge">App component · Always on</span> : plugin.kind === 'native' && plugin.state !== 'unsupported' ? <button role="switch" aria-label={`Enable ${plugin.name}`} aria-checked={plugin.enabled} className={`switch ${plugin.enabled ? 'on' : ''}`} onClick={() => toggle(plugin)}><i /></button> : null;
  const refresh = async () => {
    setRefreshing(true);
    try { await perform(refreshPlugins, 'User plugins refreshed'); } finally { setRefreshing(false); }
  };
  return <>
    <section className="page-heading"><div><h1>Plugins</h1><p>Manage integrations and extensions.</p></div><div className="tool-row"><button className="button" onClick={() => perform(() => api.openPlugins())}><Icon name="FolderOpen" size={16} />Plugin folder</button><button className="button" disabled={refreshing} onClick={refresh}><Icon name="RefreshCw" size={16} />{refreshing ? 'Reloading …' : 'Reload user plugins'}</button></div></section>
    {plugin ? <div className="plugin-details">
      <button className="button" onClick={() => setSelected(null)}><Icon name="ArrowLeft" size={16} />All plugins</button>
      <section className="settings-card">
        <div className="settings-title"><span className="action-icon"><Icon name={plugin.icon || (plugin.kind === 'native' ? 'Package' : 'Puzzle')} /></span><div><h2>{plugin.name}</h2><p>{plugin.kind === 'native' ? 'Bundled native plugin' : 'User plugin'} · {stateLabels[plugin.state] || plugin.state}</p></div></div>
        <p className="settings-description">{plugin.description || plugin.id}</p>
        {plugin.kind === 'native' ? <>
          <div className="setting-line"><div><strong>{plugin.required ? 'Required integration' : 'Enable plugin'}</strong><small>{plugin.platforms.map(platformName).join(' · ')}{!plugin.required && ' · Changes apply after restarting MacroMaxx.'}</small></div>{control(plugin)}</div>
          {plugin.restartRequired && <div className="notice" role="status"><Icon name="Info" size={16} />Restart MacroMaxx to apply this change.</div>}
          {plugin.reason && <p className="muted-text">{plugin.reason}</p>}
          {Object.keys(plugin.capabilities || {}).length > 0 && <details className="plugin-capabilities"><summary>Capabilities & diagnostics on this device</summary>{Object.entries(plugin.capabilities).map(([id, capability]) => <div key={id}><div className="setting-line"><strong>{id}</strong><span className="muted-text">{capability.available ? capability.ready === false ? 'Setup / permission required' : 'Available' : capability.reason || 'Unavailable'}</span></div>{Object.entries(capability.features || {}).map(([name, value]) => <p className="muted-text" key={name}>{name}: {Array.isArray(value) ? value.join(', ') || 'None' : typeof value === 'boolean' ? value ? 'Available' : 'Not available' : String(value)}</p>)}</div>)}</details>}
        </> : <p className="muted-text">Runs in a separate process with your user permissions. Find this plugin's own action in the Deck Editor and drag it onto a key.</p>}
      </section>
      {plugin.kind === 'native' && <PluginGuide guide={plugin.guide} />}
      {plugin.kind === 'native' && <NativePluginSettings key={plugin.id} plugin={plugin} state={state} status={status} change={change} perform={perform} flush={flush} />}
    </div> : <>
      <div className="plugins-toolbar"><div className="search-input"><Icon name="Search" size={16} /><input aria-label="Search plugins" placeholder="Search plugins …" value={search} onChange={event => setSearch(event.target.value)} /></div><label className="plugins-filter">Show<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All plugins ({items.length})</option><option value="native">Native plugins</option><option value="user">User plugins</option></select></label></div>
      <div className="plugins-grid">{visible.map(item => <article className="plugin-card" key={item.key}>
        <div className="plugin-card-heading"><span className="action-icon"><Icon name={item.icon || (item.kind === 'native' ? 'Package' : 'Puzzle')} size={22} /></span><span className="badge">{item.kind === 'native' ? 'Native' : 'User'}</span></div>
        <h3>{item.name}</h3><p>{item.description || item.id}</p>
        {item.kind === 'native' && <small className="plugin-platforms">{item.platforms.map(platformName).join(' · ')}</small>}
        <div className="plugin-card-controls">{control(item)}</div>
        <div className="plugin-card-footer"><span className={item.restartRequired ? 'plugin-pending' : 'muted-text'}>{item.restartRequired ? 'Restart required' : stateLabels[item.state] || item.state}</span><button className="button small" aria-label={`Details for ${item.name}`} onClick={() => setSelected(item.key)}>Details<Icon name="ChevronRight" size={15} /></button></div>
      </article>)}</div>
      {!visible.length && <div className="large-empty"><Icon name="Puzzle" size={36} /><h3>{items.length ? 'No matching plugins.' : 'No plugins available.'}</h3><p>{items.length ? 'Try another search or filter.' : 'Native plugins are provided by the desktop app.'}</p></div>}
      <p className="plugins-help muted-text">Listed operating systems indicate supported adapters, not identical features. Availability depends on installed dependencies and OS permissions; check Details for capabilities on this device. Optional native plugins can be enabled or disabled; changes require a restart. App components stay active. Add trusted user plugins as folders containing manifest.json and a JavaScript entry point. See docs/PLUGINS.md for details.</p>
    </>}
  </>;
}
