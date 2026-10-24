import React, { useEffect, useRef, useState } from 'react';
import { api, desktop } from './api.js';
import { Icon, iconNames } from './icons.jsx';
import { catalog, makeAction, makeKey, makeProfile, uid, visibleKeys, duplicateKey } from '../shared/model.js';
import { renderKey } from './renderKeys.js';
import { isKeyActive, collectVisuals, liveKey } from '../shared/visuals.js';
import { animationEnabled } from '../shared/animation-settings.js';
import { deckSlots, swapDeckSlots } from '../shared/deck-layout.js';
import { KeyArtwork } from './key-artwork.jsx';
import { keyFontSize, globalFontSize, MIN_FONT_SIZE, MAX_FONT_SIZE, DEFAULT_FONT_SIZE } from '../shared/key-text.js';
import { AudioEditor, LauncherEditor, ScriptEditor, MediaEditor, DesktopEditor } from './linux-actions.jsx';
import { AudioSettings, MediaSettings, DesktopSettings } from './linux-settings.jsx';

const colors = ['#ad92ff', '#82c8ff', '#86dfb5', '#ffce83', '#fb9eb5', '#ffffff', '#72d9db', '#ff8e74'];
const clone = value => structuredClone(value);
function Tool({ icon, title, onClick, disabled, active, children, className = '' }) {
  return <button title={title} aria-label={title} disabled={disabled} className={`tool ${active ? 'active' : ''} ${className}`} onClick={onClick}><Icon name={icon} size={17} />{children}</button>;
}
function Button({ icon, children, className = '', ...props }) {
  return <button className={`button ${className}`} {...props}>{icon && <Icon name={icon} size={16} />}{children}</button>;
}
function Field({ label, children, hint }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export default function App() {
  const [state, setState] = useState(null), [status, setStatus] = useState({}), [path, setPath] = useState([]), [selected, setSelected] = useState(0);
  const [page, setPage] = useState('editor'), [tab, setTab] = useState('library'), [search, setSearch] = useState(''), [toast, setToast] = useState(null), [logs, setLogs] = useState([]), [pressed, setPressed] = useState([]), [plugins, setPlugins] = useState([]), [saveState, setSaveState] = useState('Saved');
  const [history, setHistory] = useState([]), [future, setFuture] = useState([]), [modal, setModal] = useState(null), [draftName, setDraftName] = useState(''), [longMode, setLongMode] = useState(false), [iconPicker, setIconPicker] = useState(false), [diagnostics, setDiagnostics] = useState(null);
  const stateRef = useRef(), saveQueue = useRef(Promise.resolve()), saveTimer = useRef(), toastTimer = useRef();
  stateRef.current = state;
  const notify = (message, error = false) => { setToast({ message: String(message).replace(/^Error invoking remote method '[^']+': Error: /, ''), error }); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 5000); };
  const perform = async (fn, success) => { try { const result = await fn(); if (success) notify(success); return result; } catch (e) { notify(e.message, true); return null; } };
  useEffect(() => {
    api.init().then(data => { setState(data.state); setStatus(data.status); setPath(data.folderPath); setLogs(data.logs); }).catch(e => notify(e.message, true));
    api.plugins().then(setPlugins).catch(() => {}); api.diagnostics().then(setDiagnostics).catch(() => {});
    return api.subscribe(event => {
      if (event.type === 'status') setStatus(event.status);
      if (event.type === 'state') { setState(event.state); setPath(event.folderPath); setSelected(0); setHistory([]); setFuture([]); }
      if (event.type === 'log') setLogs(items => [event.item, ...items].slice(0, 200));
      if (event.type === 'press') setPressed(items => event.down ? [...items, event.index] : items.filter(i => i !== event.index));
    });
  }, []);
  const queueSave = next => { setSaveState('Saving …'); clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => { saveQueue.current = saveQueue.current.catch(() => {}).then(() => api.save(next)).then(() => setSaveState('Saved')).catch(e => { setSaveState('Save failed'); notify(e.message, true); }); }, 250); };
  const flush = async () => { clearTimeout(saveTimer.current); await saveQueue.current.catch(() => {}); if (stateRef.current) await api.save(stateRef.current); };
  const change = updater => { const old = stateRef.current; const next = clone(old); updater(next); setHistory(items => [...items.slice(-39), old]); setFuture([]); stateRef.current = next; setState(next); queueSave(next); };
  const undo = () => { if (!history.length) return; const previous = history.at(-1); setFuture(items => [state, ...items]); setHistory(items => items.slice(0, -1)); setState(previous); queueSave(previous); };
  const redo = () => { if (!future.length) return; const next = future[0]; setHistory(items => [...items, state]); setFuture(items => items.slice(1)); setState(next); queueSave(next); };
  useEffect(() => { const listener = event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !['INPUT', 'TEXTAREA'].includes(event.target.tagName)) { event.preventDefault(); event.shiftKey ? redo() : undo(); } }; window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener); }, [history, future, state]);
  const count = status.device?.count || 15, columns = status.device?.columns || 5, rows = status.device?.rows || 3;
  const defaultSize = globalFontSize(state?.settings);
  const slots = state ? deckSlots(state, path, count) : [], offset = path.length ? 1 : 0;
  const selectedSlot = slots[selected];
  const backSelected = !!selectedSlot?.isBack;
  const key = backSelected ? null : selectedSlot?.key;
  const profile = state?.profiles.find(p => p.id === state.activeProfileId);
  const activeKey = k => isKeyActive(k, status.obs, status);
  const displayKeys = slots.map(slot => liveKey(slot.key, status));
  const imageBank = state ? collectVisuals(state, status.obs, status) : [];
  const imageBankIdentity = JSON.stringify(imageBank.map(entry => entry.signature));
  useEffect(() => {
    if (!state) return;
    let cancelled = false;
    (async () => {
      try {
        // Warm every folder, including the back button, before it is opened.
        const images = await Promise.all(imageBank.map(async ({ key, active, signature }) => ({ signature, image: await renderKey(key, active) })));
        if (!cancelled) await api.images(images);
      } catch (e) { if (!cancelled) notify('Key images: ' + e.message, true); }
    })();
    return () => { cancelled = true; };
  }, [imageBankIdentity]);
  function editKey(updater) { if (!key) return; change(next => updater(visibleKeys(next, path)[selectedSlot.childIndex])); }
  function place(type, index = selected) { if (!slots[index]) return; if (slots[index].isBack) return notify('Move the Back key to another slot first.'); change(next => { const list = visibleKeys(next, path); while (list.length < count - offset) list.push(null); list[slots[index].childIndex] = makeKey(type); }); setSelected(index); setTab('edit'); setLongMode(false); }
  function drop(event, index) {
    event.preventDefault();
    const type = event.dataTransfer.getData('action'), source = event.dataTransfer.getData('key');
    if (type) place(type, index);
    else if (source !== '') {
      const from = Number(source);
      if (!Number.isInteger(from) || from < 0 || from >= count || from === index) return;
      change(next => swapDeckSlots(next, path, from, index, count));
      setSelected(index);
    }
  }
  async function navigate(target) {
    await perform(async () => { await flush(); if (desktop) await api.navigate(target); else { if (target.profileId) { change(s => { s.activeProfileId = target.profileId; }); setPath([]); } else setPath(target.up ? path.slice(0, -1) : target.path); } setSelected(0); });
  }
  const openFolder = index => navigate({ path: [...path, slots[index].childIndex] });
  async function execute(long = false) { if (key?.actions[0]?.type === 'folder' && !long) return openFolder(selected); await perform(async () => { await flush(); await api.execute(selected, long); }); }
  function duplicate() { if (!key) return; const free = slots.findIndex(slot => !slot.key && !slot.isBack); if (free < 0) return notify('There are no free slots on this page.', true); change(next => { visibleKeys(next, path)[slots[free].childIndex] = duplicateKey(key); }); setSelected(free); }
  function addProfile() { if (!draftName.trim()) return; change(s => { const p = makeProfile(draftName.trim()); p.keys = Array(count).fill(null); s.profiles.push(p); s.activeProfileId = p.id; }); setPath([]); setSelected(0); setModal(null); }
  if (!state) return <div className="loading"><div className="brand-mark"><Icon name="Zap" size={30} /></div><h2>MacroMaxx</h2><p>Loading your workspace …</p>{toast && <p>{toast.message}</p>}</div>;
  const occupied = slots.filter(slot => slot.key && !slot.isBack).length;
  return <div className={`app ${state.settings.theme === 'light' ? 'light' : ''}`}>
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Icon name="Zap" size={24} /></div><span>macro<span className="brand-light">maxx</span><small>MAKE EVERY PRESS COUNT</small></span></div>
      <div className="workspace-tag"><span className="avatar">M</span><span>My Workspace<small>Your personal control center</small></span><Icon name="ChevronsUpDown" size={14} /></div>
      <div className="nav-label">WORKSPACE</div>
      <button className={`nav-item ${page === 'editor' ? 'selected' : ''}`} onClick={() => setPage('editor')}><Icon name="LayoutGrid" size={18} />Deck Editor<kbd>{count}</kbd></button>
      <button className={`nav-item ${page === 'activity' ? 'selected' : ''}`} onClick={() => setPage('activity')}><Icon name="Activity" size={18} />Activity{logs.some(l => l.level === 'error') && <span className="nav-dot" />}</button>
      <div className="nav-label profiles-label">PROFILES<Tool icon="Plus" title="Add profile" onClick={() => { setDraftName(''); setModal('newProfile'); }} /></div>
      <div className="profile-list">{state.profiles.map((p, i) => <button key={p.id} className={`profile-item ${p.id === state.activeProfileId ? 'selected' : ''}`} onClick={() => { navigate({ profileId: p.id }); setPage('editor'); }}><span className="profile-icon" style={{ color: colors[i % colors.length] }}><Icon name={p.icon || 'Layers'} size={16} /></span><span>{p.name}</span>{p.id === state.activeProfileId && <span className="tiny-dot" />}</button>)}</div>
      <div className="sidebar-bottom">
        <div className="device-mini"><div className="mini-grid">{Array.from({ length: 15 }, (_, i) => <i key={i} />)}</div><div><strong>{status.device?.connected ? 'Stream Deck' : 'Virtual Deck'}</strong><span><i className={status.device?.connected ? 'green-dot' : 'gray-dot'} />{status.device?.connected ? 'Connected & ready' : 'Editor ready'}</span></div></div>
        <button className={`nav-item ${page === 'settings' ? 'selected' : ''}`} onClick={() => setPage('settings')}><Icon name="Settings2" size={18} />Settings</button>
        <div className="sidebar-footer"><span>MacroMaxx <b>0.1.0</b></span><Tool icon={state.settings.theme === 'light' ? 'Moon' : 'Sun'} title="Switch theme" onClick={() => change(s => { s.settings.theme = s.settings.theme === 'light' ? 'dark' : 'light'; })} /></div>
      </div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumb">Workspace<Icon name="ChevronRight" size={14} /><span>{page === 'editor' ? 'Deck Editor' : page === 'activity' ? 'Activity' : 'Settings'}</span></div><div className="topbar-actions"><span className={`save-status ${saveState === 'Save failed' ? 'error' : ''}`}><Icon name={saveState === 'Saved' ? 'CloudCheck' : 'CloudUpload'} size={15} />{saveState}</span><span className="separator" /><Tool icon="CircleHelp" title="Quick guide" onClick={() => setModal('help')} /><div className="user-avatar">M</div></div></header>
      {page === 'editor' ? <>
        <section className="page-heading"><div><div className="eyebrow">YOUR SETUP. YOUR RULES.</div><h1>One press. Total control<span>.</span></h1><p>Turn your Stream Deck into your personal control center.</p></div><Button icon="Download" onClick={() => perform(async () => { await flush(); return api.exportWorkspace(); }, 'Export dialog closed')}>Export</Button></section>
        <div className="editor-layout"><section className="deck-panel">
          <div className="panel-top"><div><span className="section-icon"><Icon name="PanelsTopLeft" size={18} /></span><strong>{profile?.name}</strong><button className="chevron-button" title="Rename profile" onClick={() => { setDraftName(profile.name); setModal('renameProfile'); }}><Icon name="Pencil" size={13} /></button><span className="badge">{occupied} / {count - offset} keys</span></div><div className="tool-row"><Tool icon="Undo2" title="Undo (Ctrl+Z)" onClick={undo} disabled={!history.length} /><Tool icon="Redo2" title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!future.length} /><span className="separator" /><Tool icon="Ellipsis" title="Profile options" onClick={() => setModal('profileOptions')} /></div></div>
          <div className="device-bar"><div className="device-select"><Icon name="Usb" size={16} /><select aria-label="Device" value={status.available?.find(d => d.path)?.path || 'virtual'} onChange={event => perform(() => api.selectDevice(event.target.value))}>{status.available?.length ? status.available.map(d => <option key={d.path} value={d.path}>{status.device?.name || d.name}</option>) : <option value="virtual">Virtual Stream Deck · 15 keys</option>}</select></div><span className={`connection ${status.device?.connected ? 'connected' : ''}`}><i />{status.device?.connected ? 'Connected' : 'Preview'}</span></div>
          <div className="deck-workspace">
            <div className="folder-breadcrumb"><button onClick={() => navigate({ path: [] })}><Icon name="Home" size={13} />{profile?.name}</button>{path.map((_, i) => <React.Fragment key={i}><Icon name="ChevronRight" size={12} /><button onClick={() => navigate({ path: path.slice(0, i + 1) })}>Folder {i + 1}</button></React.Fragment>)}</div>
            <div className="deck-shell" style={{ '--cols': columns, '--rows': rows }}>
              <div className="deck-brand"><span>STREAM DECK</span><span className="deck-logo">▰</span></div>
              <div className="deck-grid">{displayKeys.map((k, index) => <button key={index} className={`deck-key ${selected === index ? 'is-selected' : ''} ${!k ? 'empty' : ''} ${pressed.includes(index) ? 'pressed' : ''} ${activeKey(k) ? 'live' : ''}`} draggable={!!k} onDragStart={event => event.dataTransfer.setData('key', String(index))} onDragOver={event => event.preventDefault()} onDrop={event => drop(event, index)} onClick={() => { setSelected(index); setLongMode(false); }} onDoubleClick={() => { if (slots[index].isBack) navigate({ up: true }); else if (k?.actions[0]?.type === 'folder') openFolder(index); else if (k) { setSelected(index); setTab('edit'); } }} title={k ? `${k.label} · ${slots[index].isBack ? 'Drag to move · ' : ''}Double-click to ${k.actions?.[0]?.type === 'folder' || slots[index].isBack ? 'open' : 'edit'}` : `Assign key ${index + 1}`} style={{ '--key-color': k?.color, background: k?.background }}>
                {k ? <><KeyArtwork keyData={k} active={activeKey(k)} defaultFontSize={defaultSize} />{k.actions?.length > 1 && <b className="chain-badge"><Icon name="Layers2" size={10} />{k.actions.length}</b>}{activeKey(k) && <i className="live-dot" />}</> : <Icon name="Plus" size={21} />}<em className="key-number">{index + 1}</em>
              </button>)}</div>
              <div className="deck-bottom"><i /><span>MACROMAXX CONNECTED EXPERIENCE</span><i /></div>
            </div>
            <div className="deck-hint"><Icon name="MousePointer2" size={14} /><span>Drag an action onto a key. Your workflow starts here.</span></div>
          </div>
          <div className="deck-toolbar"><span><i className={status.device?.connected ? 'green-dot' : 'gray-dot'} />{status.device?.connected ? 'Changes are sent to your deck live' : desktop ? 'Connect your deck for live updates' : 'Browser preview · Hardware requires the desktop app'}</span><label><Icon name="Sun" size={15} /><input aria-label="Brightness" type="range" min="0" max="100" value={state.settings.brightness} onChange={event => change(s => { s.settings.brightness = Number(event.target.value); })} /><span>{state.settings.brightness}%</span></label></div>
          <div className="key-details">
            <div className="detail-heading"><div><span className="eyebrow">SELECTED KEY</span><h3>{key?.label || (backSelected ? 'Back to the parent folder' : 'Room for your next great idea.')}</h3></div><span className="key-index">{String(selected + 1).padStart(2, '0')}</span></div>
            {key ? <div className="key-summary">
              <div className="key-preview" style={{ color: key.color, background: key.background }}><KeyArtwork keyData={key} active={activeKey(key)} defaultFontSize={defaultSize} /></div>
              <div className="key-summary-text"><span className="badge accent">{key.actions.length > 1 ? 'Multi-action' : catalog.find(c => c.type === key.actions[0]?.type)?.name || 'Action'}</span><p>{key.actions.length} action{key.actions.length !== 1 ? 's' : ''} · {key.longActions?.length ? 'Long press assigned' : 'Short press'}</p><div className="tool-row"><Button icon={status.running?.includes(key.id) ? 'Square' : key.actions[0]?.type === 'folder' ? 'FolderOpen' : 'Play'} className="primary small" onClick={() => execute()}>{status.running?.includes(key.id) ? 'Stop' : key.actions[0]?.type === 'folder' ? 'Open' : 'Test'}</Button><Button icon="SlidersHorizontal" className="small" onClick={() => setTab('edit')}>Edit</Button><Tool icon="Copy" title="Duplicate key" onClick={duplicate} /><Tool icon="Trash2" title="Delete key" onClick={() => change(s => { visibleKeys(s, path)[selectedSlot.childIndex] = null; })} /></div></div>
            </div> : <div className="empty-detail"><Icon name="Sparkles" size={20} /><p>{backSelected ? 'Drag the Back key to another slot. Its position is saved per folder. Double-click to go up one level.' : 'Choose an action on the right or drag it directly onto this key.'}</p></div>}
          </div>
        </section>
        <aside className="action-panel">
          <div className="action-tabs"><button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}><Icon name="Shapes" size={16} />Actions</button><button className={tab === 'edit' ? 'active' : ''} onClick={() => setTab('edit')}><Icon name="SlidersHorizontal" size={16} />Properties</button></div>
          {tab === 'library' ? <>
            <div className="library-heading"><h3>Your next shortcut</h3><p>Small keys. Big possibilities.</p></div>
            <div className="search-input"><Icon name="Search" size={16} /><input placeholder="Search actions …" value={search} onChange={event => setSearch(event.target.value)} aria-label="Search actions" /><kbd>⌕</kbd></div>
            <div className="action-library">{[...new Set(catalog.map(c => c.group))].map(group => {
              const items = catalog.filter(c => c.group === group && `${c.name} ${c.description}`.toLowerCase().includes(search.toLowerCase()));
              return items.length > 0 && <div className="action-group" key={group}><h4>{group}<Icon name="ChevronDown" size={13} /></h4>{items.map(item => <button className="action-card" key={item.type} draggable onDragStart={event => event.dataTransfer.setData('action', item.type)} onClick={() => { if (key) { setDraftName(item.type); setModal('replace'); } else place(item.type); }}><span className={`action-icon ${item.group === 'Connections' ? 'blue' : item.group === 'Organization' ? 'amber' : ''}`}><Icon name={item.icon} size={19} /></span><span><strong>{item.name}</strong><small>{item.description}</small></span><Icon className="drag-handle" name="GripVertical" size={15} /></button>)}</div>;
            })}{!catalog.some(c => `${c.name} ${c.description}`.toLowerCase().includes(search.toLowerCase())) && <div className="empty-detail">No matching actions found.</div>}</div>
            <div className="plugin-callout"><span><Icon name="Puzzle" size={23} /></span><div><strong>Take your deck further.</strong><p>Extend it with your own plugins.</p><button onClick={() => setPage('settings')}>Explore plugins<Icon name="ArrowUpRight" size={13} /></button></div></div>
          </> : key ? <div className="properties">
            <div className="properties-title"><h3>Customize key</h3><span>#{selected + 1}</span></div>
            <Field label="Label"><input value={key.label} maxLength={80} onChange={event => editKey(k => { k.label = event.target.value; })} /></Field>
            <div className="appearance-row"><button className="icon-select" style={{ color: key.color }} onClick={() => setIconPicker(!iconPicker)}><Icon name={key.icon} size={26} /><Icon name="ChevronDown" size={12} /></button><div className="color-swatches">{colors.map(color => <button key={color} aria-label={`Color ${color}`} className={key.color === color ? 'selected' : ''} style={{ background: color }} onClick={() => editKey(k => { k.color = color; })} />)}</div><input aria-label="Custom icon color" type="color" value={key.color} onChange={event => editKey(k => { k.color = event.target.value; })} /></div>
            {iconPicker && <div className="icon-picker">{iconNames.map(name => <button key={name} title={name} onClick={() => { editKey(k => { k.icon = name; k.image = ''; }); setIconPicker(false); }}><Icon name={name} size={20} /></button>)}</div>}
            <div className="image-controls"><Button icon="ImagePlus" className="small" onClick={() => perform(async () => { const image = await api.pickImage(); if (image) editKey(k => { k.image = image; }); })}>Custom image</Button>{key.image && <Tool icon="X" title="Remove image" onClick={() => editKey(k => { k.image = ''; })} />}<label>Background<input type="color" value={key.background} onChange={event => editKey(k => { k.background = event.target.value; })} /></label></div>
            <FontSizeControl key={key.id} keyData={key} defaultSize={defaultSize} onChange={fontSize => editKey(k => { k.fontSize = fontSize; })} onReset={() => editKey(k => { delete k.fontSize; })} />
            <div className="section-divider" /><div className="properties-title"><h3>Actions</h3><Icon name="Workflow" size={17} /></div>
            <div className="segmented"><button className={!longMode ? 'active' : ''} onClick={() => setLongMode(false)}>Short press</button><button className={longMode ? 'active' : ''} onClick={() => setLongMode(true)}>Long press</button></div>
            {longMode && <p className="muted-text">Hold for at least 600 ms. If unassigned, the short-press action is used.</p>}
            {(longMode ? key.longActions : key.actions).map((action, index, all) => <ActionEditor key={action.id} action={action} index={index} total={all.length} state={state} status={status} plugins={plugins} update={patch => editKey(k => Object.assign((longMode ? k.longActions : k.actions)[index], patch))} remove={() => editKey(k => (longMode ? k.longActions : k.actions).splice(index, 1))} move={direction => editKey(k => { const list = longMode ? k.longActions : k.actions; [list[index], list[index + direction]] = [list[index + direction], list[index]]; })} perform={perform} />)}
            <select aria-label="Add action to chain" className="add-action-select" value="" onChange={event => editKey(k => { (longMode ? k.longActions : k.actions).push(makeAction(event.target.value)); })}><option value="">+ Add action</option>{catalog.filter(c => c.type !== 'folder').map(c => <option key={c.type} value={c.type}>{c.name}</option>)}</select>
            <label className="checkbox-label"><input type="checkbox" checked={key.stopOnError !== false} onChange={event => editKey(k => { k.stopOnError = event.target.checked; })} />Stop on error</label><Button className="primary full" icon="Play" onClick={() => execute(longMode)}>Test assignment</Button>
          </div> : <div className="properties-empty"><Icon name="MousePointer2" size={32} /><h3>One key, many possibilities.</h3><p>Assign an action to a key first.</p><Button onClick={() => setTab('library')}>Explore actions</Button></div>}
        </aside></div>
        <div className="bottom-note"><Icon name="Sparkles" size={13} /><span>Fewer clicks. More flow.</span><span>Built with care for your workflow.</span></div>
      </> : page === 'activity' ? <>
        <section className="page-heading"><div><div className="eyebrow">EVERYTHING AT A GLANCE</div><h1>Your workflow, live<span>.</span></h1><p>Executed actions and useful error messages.</p></div><Button icon="Square" onClick={() => perform(() => api.cancel(), 'Action chains canceled')}>Stop all</Button></section>
        <section className="activity-panel"><div className="panel-top"><strong>Activity log</strong><Button className="small" icon="Trash2" onClick={() => setLogs([])}>Clear</Button></div>{logs.length ? logs.map(item => <div className={`log-row ${item.level}`} key={item.id}><span className="log-icon"><Icon name={item.level === 'error' ? 'CircleAlert' : item.level === 'success' ? 'Check' : 'Info'} size={18} /></span><div><strong>{item.title}</strong><p>{item.message}</p></div><time>{new Date(item.time).toLocaleTimeString('en-GB')}</time></div>) : <div className="large-empty"><Icon name="Activity" size={40} /><h3>Ready for your first workflow.</h3><p>Run a key to see its result here.</p></div>}</section>
      </> : <Settings state={state} status={status} diagnostics={diagnostics} plugins={plugins} change={change} perform={perform} flush={flush} refreshDiagnostics={() => api.diagnostics().then(setDiagnostics)} refreshPlugins={() => api.plugins().then(setPlugins)} />}
    </main>
    {toast && <div role="status" className={`toast ${toast.error ? 'error' : ''}`}><Icon name={toast.error ? 'CircleAlert' : 'CheckCircle2'} size={19} /><span>{toast.message}</span><Tool icon="X" title="Close" onClick={() => setToast(null)} /></div>}
    {modal && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setModal(null); }}><div className="modal" role="dialog" aria-modal="true">
      <Tool className="modal-close" icon="X" title="Close dialog" onClick={() => setModal(null)} />
      {['newProfile', 'renameProfile'].includes(modal) ? <>
        <div className="modal-symbol"><Icon name="Layers" size={28} /></div><h2>{modal === 'newProfile' ? 'Room for a new setup.' : 'Give your setup a name.'}</h2><p>Work, gaming, or streaming – a profile for every moment.</p>
        <Field label="Profile name"><input autoFocus maxLength={60} placeholder="e.g. Streaming" value={draftName} onChange={event => setDraftName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { if (modal === 'newProfile') addProfile(); else { change(s => { s.profiles.find(p => p.id === profile.id).name = draftName.trim() || profile.name; }); setModal(null); } } }} /></Field>
        <Button className="primary full" onClick={() => { if (modal === 'newProfile') addProfile(); else { change(s => { s.profiles.find(p => p.id === profile.id).name = draftName.trim() || profile.name; }); setModal(null); } }}>Save</Button>
      </> : modal === 'replace' ? <>
        <h2>Replace this assignment?</h2><p>The current assignment will be replaced. You can undo this change afterwards.</p><Button className="primary full" onClick={() => { place(draftName); setModal(null); }}>Replace assignment</Button><Button className="full" onClick={() => { setTab('edit'); setModal(null); }}>Edit the action chain instead</Button>
      </> : modal === 'profileOptions' ? <>
        <h2>{profile.name}</h2><p>Manage your setup.</p><Button className="full" icon="Pencil" onClick={() => { setDraftName(profile.name); setModal('renameProfile'); }}>Rename</Button>
        <Button className="full" icon="Copy" onClick={() => { change(s => { const copy = clone(profile); copy.id = uid(); copy.name += ' – Copy'; const reset = keys => keys.forEach(k => { if (k) { k.id = uid(); [...k.actions, ...k.longActions].forEach(a => { a.id = uid(); }); reset(k.children); } }); reset(copy.keys); s.profiles.push(copy); s.activeProfileId = copy.id; }); setPath([]); setModal(null); }}>Duplicate profile</Button>
        <Button className="full danger" icon="Trash2" disabled={state.profiles.length < 2} onClick={() => { change(s => { s.profiles = s.profiles.filter(p => p.id !== profile.id); s.activeProfileId = s.profiles[0].id; }); setPath([]); setModal(null); }}>Delete profile</Button>
      </> : <>
        <div className="modal-symbol"><Icon name="Sparkles" size={28} /></div><h2>Your workflow starts here.</h2>
        <p>1. Drag an action from the library onto a key.<br /><br />2. Use Properties to customize its label, icon, and action.<br /><br />3. Click Test or press the physical key.<br /><br />Double-click to open folders. Add multiple actions to a key to build a chain. Trigger a running chain again to stop it.<br /><br />Open Settings to set up USB access, Wayland keyboard input, OBS, and plugins.</p><Button className="primary full" onClick={() => setModal(null)}>Let's go</Button>
      </>}
    </div></div>}
  </div>;
}

function FontSizeControl({ keyData, defaultSize = DEFAULT_FONT_SIZE, global = false, onChange, onReset }) {
  const size = keyFontSize(keyData, defaultSize);
  const label = global ? 'Default font size' : 'Font size';
  const [draft, setDraft] = useState(String(size));
  useEffect(() => setDraft(String(size)), [size]);
  const commit = () => {
    const number = Number(draft);
    const next = draft.trim() && Number.isFinite(number) ? Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(number))) : size;
    setDraft(String(next));
    if (next !== size) onChange(next);
  };
  return <div className="field" style={{ marginTop: 18 }}>
    <span>{label}</span>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <input type="range" aria-label={label} min={MIN_FONT_SIZE} max={MAX_FONT_SIZE} step="1" value={size} style={{ flex: 1, padding: 0, accentColor: 'var(--accent)' }} onChange={event => onChange(Number(event.target.value))} />
      <input type="number" aria-label={`${label} value`} min={MIN_FONT_SIZE} max={MAX_FONT_SIZE} step="1" value={draft} style={{ width: 61 }} onChange={event => {
        setDraft(event.target.value);
        const value = Number(event.target.value);
        if (Number.isInteger(value) && value >= MIN_FONT_SIZE && value <= MAX_FONT_SIZE && value !== size) onChange(value);
      }} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
      <Button className="small" onClick={() => { setDraft(String(defaultSize)); onReset(); }}>{global ? 'Factory default' : 'Default'}</Button>
    </div>
    <small>{global ? '10–32 · Factory default: 16. Applies to every key without a custom font size.' : `Global default: ${defaultSize}. ${keyData?.fontSize === undefined ? 'This key inherits it automatically.' : 'Custom size – choose Default to restore inheritance.'}`}</small>
  </div>;
}

function ActionEditor({ action, index, total, update, remove, move, state, status, plugins, perform }) {
  const item = catalog.find(c => c.type === action.type); const [recording, setRecording] = useState(false);
  const input = (name, label, placeholder, multiline = false) => <Field label={label}>{multiline ? <textarea rows={3} value={action[name] || ''} placeholder={placeholder} onChange={e => update({ [name]: e.target.value })} /> : <input value={action[name] || ''} placeholder={placeholder} onChange={e => update({ [name]: e.target.value })} />}</Field>;
  const select = (name, label, options) => <Field label={label}><select value={action[name] || ''} onChange={e => update({ [name]: e.target.value })}>{options.map(([value, text]) => <option value={value} key={value}>{text}</option>)}</select></Field>;
  return <div className="action-editor">
    <div className="action-editor-head"><span><b>{index + 1}</b><Icon name={item.icon} size={15} />{item.name}</span><div><Tool icon="ChevronUp" title="Move up" disabled={!index} onClick={() => move(-1)} /><Tool icon="ChevronDown" title="Move down" disabled={index === total - 1} onClick={() => move(1)} /><Tool icon="X" title="Remove action" onClick={remove} /></div></div>
    {action.type === 'hotkey' && <>
      <Field label="Key combination" hint="e.g. CTRL+SHIFT+M, ALT+F4, or META+E"><div className="input-with-button"><input value={recording ? 'Press your keys now …' : action.keys} onChange={e => update({ keys: e.target.value })} onKeyDown={e => { if (!recording) return; e.preventDefault(); const key = e.key; if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return; const tokens = [e.ctrlKey && 'CTRL', e.altKey && 'ALT', e.shiftKey && 'SHIFT', e.metaKey && 'META', ({ ' ': 'SPACE', ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', '+': 'PLUS' }[key] || key.toUpperCase())].filter(Boolean); update({ keys: tokens.join('+') }); setRecording(false); }} /><Tool icon={recording ? 'CircleStop' : 'CircleDot'} title="Record key combination" active={recording} onClick={event => { setRecording(!recording); event.currentTarget.parentElement.querySelector('input').focus(); }} /></div></Field>
      {select('mode', 'Behavior', [['tap', 'Press & release'], ['down', 'Hold down'], ['up', 'Release']])}
    </>}
    {action.type === 'url' && input('url', 'URL', 'https://…')}
    {action.type === 'audio' && <AudioEditor action={action} update={update} status={status} />}
    {action.type === 'desktop' && <DesktopEditor action={action} update={update} status={status} />}
    {action.type === 'app' && <LauncherEditor action={action} update={update} status={status} perform={perform} />}
    {action.type === 'script' && <ScriptEditor action={action} update={update} />}
    {action.type === 'text' && <>{input('text', 'Text', 'Your text …', true)}<p className="muted-text">Copies the text to the clipboard and pastes it with Ctrl+V (Cmd+V on macOS).</p></>}
    {action.type === 'media' && <MediaEditor action={action} update={update} status={status} />}
    {action.type === 'webhook' && <>{select('method', 'Method', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].map(m => [m, m]))}{input('url', 'Endpoint', 'https://…')}{input('headers', 'Headers (JSON)', '{"Content-Type":"application/json"}', true)}{!['GET', 'HEAD'].includes(action.method) && input('body', 'Request body', '{}', true)}<p className="muted-text">Timeout: 15 seconds. Results appear in Activity.</p></>}
    {action.type === 'delay' && <Field label="Delay in milliseconds"><input type="number" min="0" max="300000" value={action.ms} onChange={e => update({ ms: Number(e.target.value) })} /></Field>}
    {action.type === 'profile' && select('profileId', 'Target profile', [['', 'Choose a profile …'], ...state.profiles.map(p => [p.id, p.name])])}
    {action.type === 'folder' && <p className="muted-text">Double-click the key to open its folder. You can drag the Back key to any slot inside the folder.</p>}
    {action.type === 'obs' && <>
      {select('command', 'OBS action', [['scene', 'Switch scene'], ['record', 'Toggle recording'], ['stream', 'Toggle streaming'], ['mute', 'Toggle audio mute']])}
      {action.command === 'scene' && <>{input('scene', 'Scene name', 'e.g. Desktop')}<datalist id={`scenes-${action.id}`}>{status.obs?.scenes?.map(s => <option key={s}>{s}</option>)}</datalist>{status.obs?.scenes?.length > 0 && select('scene', 'Available scenes', [['', 'Choose a scene …'], ...status.obs.scenes.map(s => [s, s])])}</>}
      {action.command === 'mute' && <>{input('input', 'Audio source', 'Mic/Aux')}{status.obs?.inputs?.length > 0 && select('input', 'Available sources', [['', 'Choose a source …'], ...status.obs.inputs.map(s => [s, s])])}</>}
      {!status.obs?.connected && <p className="muted-text">Connect OBS in Settings first.</p>}
    </>}
    {action.type === 'plugin' && <>{select('pluginId', 'Plugin', plugins.map(p => [p.id, p.name]))}{(plugins.find(p => p.id === action.pluginId)?.fields || []).map(field => { let config; try { config = JSON.parse(action.config || '{}'); } catch { config = {}; } return <Field key={field.key} label={field.label}><input value={config[field.key] ?? field.default ?? ''} onChange={e => update({ config: JSON.stringify({ ...config, [field.key]: e.target.value }, null, 2) })} /></Field>; })}{input('config', 'Configuration (JSON)', '{}', true)}</>}
  </div>;
}

function Settings({ state, status, diagnostics, plugins, change, perform, flush, refreshDiagnostics, refreshPlugins }) {
  const [busy, setBusy] = useState('');
  const task = async (name, fn, message) => { setBusy(name); await perform(fn, message); setBusy(''); };
  return <>
    <section className="page-heading"><div><div className="eyebrow">MAKE IT YOURS</div><h1>Everything in its place<span>.</span></h1><p>Connect your tools and make MacroMaxx your own.</p></div><span className="badge">v0.1.0</span></section>
    <div className="settings-grid">
      <AnimationSettings state={state} change={change} />
      <TypographySettings state={state} change={change} />
      <AudioSettings status={status} perform={perform} />
      <MediaSettings status={status} perform={perform} />
      <DesktopSettings status={status} perform={perform} />
      <section className="settings-card">
        <div className="settings-title"><span className="action-icon"><Icon name="Keyboard" /></span><div><h3>Keyboard & devices</h3><p>{diagnostics?.backend || 'Checking your system …'}</p></div><span className={`connection ${status.inputReady ? 'connected' : ''}`}><i />{status.inputReady ? 'Ready' : 'Set up'}</span></div>
        {status.device?.error && <div className="notice error"><Icon name="CircleAlert" size={17} />{status.device.error}</div>}
        <p className="settings-description">{diagnostics?.wayland ? 'Allow MacroMaxx to send keyboard input using the desktop permission dialog. Persistent permission is reused when your desktop supports and grants it; revoked or expired permissions may need confirmation again. Screen recording is not requested.' : diagnostics?.platform === 'darwin' ? 'Allow MacroMaxx in System Settings → Privacy & Security → Accessibility.' : 'Set up system-wide keyboard input for hotkeys and text actions.'}</p>
        {diagnostics?.wayland && <><label className="checkbox-label"><input type="checkbox" checked={state.settings.rememberWaylandPermission !== false} onChange={e => change(s => { s.settings.rememberWaylandPermission = e.target.checked; })} />Remember and restore keyboard permission</label><Button className="small" onClick={() => perform(async () => { await api.forgetInput(); await refreshDiagnostics(); }, 'Saved permission forgotten')}>Forget saved permission</Button><p className="muted-text">{diagnostics.savedPermission ? 'A restore token is saved locally, outside workspace exports.' : 'No saved permission yet. Enable persistence in the desktop dialog if offered.'}</p></>}
        <Button className="primary" icon="KeyRound" disabled={!!busy} onClick={() => task('keyboard', async () => { await api.setupInput(); await refreshDiagnostics(); }, 'Keyboard input is ready.')}>{busy === 'keyboard' ? 'Waiting for permission …' : 'Allow keyboard input'}</Button>
        <Button icon="RefreshCw" disabled={!!busy} onClick={() => task('reconnect', () => api.reconnect(), 'Device scan refreshed')}>Reconnect Stream Deck</Button>
        {diagnostics?.platform === 'linux' && <div className="setup-steps">
          <h4>Linux setup</h4><p><b>1.</b> USB access: If the deck cannot connect, install the udev rule. Your system will ask for your password.</p><Button className="small" icon="Usb" disabled={!!busy} onClick={() => task('udev', () => api.installUdev(), 'Rule installed. Unplug and reconnect the deck if needed.')}>Set up USB access</Button>
          <p><b>2.</b> {diagnostics.wayland ? 'The portal requires Python 3, python-dbus, and PyGObject.' : 'X11 requires xdotool to be installed.'}</p><code>{diagnostics.wayland ? 'Debian/Ubuntu: sudo apt install python3-dbus python3-gi' : 'sudo apt install xdotool'}</code><code>{diagnostics.wayland ? 'Arch: sudo pacman -S python-dbus python-gobject' : 'sudo pacman -S xdotool'}</code>
          <p><b>3.</b> Media playback on Linux uses playerctl.</p><Button className="small" icon="RefreshCw" onClick={() => perform(refreshDiagnostics, 'System check updated')}>Check again</Button><span className="muted-text">{diagnostics.wayland ? diagnostics.python ? ' ✓ Portal dependencies available' : ' · Portal dependencies missing' : diagnostics.xdotool ? ' ✓ xdotool available' : ' · xdotool missing'}</span>
        </div>}
        {diagnostics?.wayland && <div className="setup-steps"><h4>Native Wayland input</h4><p>EIS also requires libei and libxkbcommon. The keyboard layout is provided by your desktop.</p><code>Arch: sudo pacman -S libei libxkbcommon</code><code>Debian/Ubuntu: sudo apt install libei1 libxkbcommon0</code></div>}
      </section>
      <section className="settings-card">
        <div className="settings-title"><span className="action-icon blue"><Icon name="Video" /></span><div><h3>OBS Studio</h3><p>Your studio, right on your deck.</p></div><span className={`connection ${status.obs?.connected ? 'connected' : ''}`}><i />{status.obs?.connected ? 'Connected' : 'Offline'}</span></div>
        <p className="settings-description">In OBS, enable the server under Tools → WebSocket Server Settings (OBS 28+).</p>
        <Field label="WebSocket address"><input value={state.settings.obsUrl} onChange={e => change(s => { s.settings.obsUrl = e.target.value; })} /></Field><Field label="Server password"><input type="password" autoComplete="off" placeholder="Optional" value={state.settings.obsPassword} onChange={e => change(s => { s.settings.obsPassword = e.target.value; })} /></Field>
        <Button icon={status.obs?.connected ? 'Unplug' : 'Plug'} className="primary" disabled={!!busy} onClick={() => task('obs', async () => { await flush(); if (status.obs?.connected) await api.disconnectOBS(); else await api.connectOBS(); }, status.obs?.connected ? 'OBS disconnected' : 'OBS connected')}>{busy === 'obs' ? 'Connecting …' : status.obs?.connected ? 'Disconnect' : 'Connect to OBS'}</Button>
        {status.obs?.connected && <div className="obs-live"><span><i className="green-dot" />{status.obs.scene}</span><span>REC {status.obs.recording ? '● Active' : 'Inactive'}</span><span>LIVE {status.obs.streaming ? '● Active' : 'Inactive'}</span></div>}
        <p className="muted-text">Connection details are stored locally and included in workspace exports.</p>
      </section>
      <section className="settings-card">
        <div className="settings-title"><span className="action-icon amber"><Icon name="Puzzle" /></span><div><h3>Plugins</h3><p>More possibilities for your workflow.</p></div><span className="badge">{plugins.length} installed</span></div>
        {plugins.map(p => <div className="plugin-row" key={p.id}><Icon name="Package" size={20} /><div><strong>{p.name}</strong><small>{p.description || p.id}</small></div><Icon name="CheckCircle2" size={16} /></div>)}
        <div className="tool-row"><Button icon="FolderOpen" onClick={() => perform(() => api.openPlugins())}>Plugin folder</Button><Tool icon="RefreshCw" title="Reload plugins" onClick={() => perform(refreshPlugins, 'Plugins refreshed')} /></div>
        <p className="muted-text">Add each plugin as a folder containing manifest.json and a JavaScript entry point. Plugins run in separate processes with your user permissions. Install trusted code. See docs/PLUGINS.md in the project for instructions.</p>
      </section>
      <section className="settings-card">
        <div className="settings-title"><span className="action-icon"><Icon name="Settings2" /></span><div><h3>Your app</h3><p>Your setup stays with you.</p></div></div>
        <div className="setting-line"><div><strong>Launch at login</strong><small>Have your deck ready right away.</small></div><button role="switch" aria-checked={state.settings.autostart} aria-label="Launch at login" className={`switch ${state.settings.autostart ? 'on' : ''}`} onClick={() => change(s => { s.settings.autostart = !s.settings.autostart; })}><i /></button></div>
        <div className="setting-line"><div><strong>Keep running in the background</strong><small>Minimize to the tray when closing the window.</small></div><button role="switch" aria-checked={state.settings.closeToTray} aria-label="Minimize to tray" className={`switch ${state.settings.closeToTray ? 'on' : ''}`} onClick={() => change(s => { s.settings.closeToTray = !s.settings.closeToTray; })}><i /></button></div>
        <div className="setting-line"><div><strong>Appearance</strong><small>Choose your working atmosphere.</small></div><select aria-label="Appearance" value={state.settings.theme} onChange={e => change(s => { s.settings.theme = e.target.value; })}><option value="dark">Dark</option><option value="light">Light</option></select></div>
        <div className="section-divider" /><h4>Transfer your workspace</h4><p className="muted-text">Back up or restore profiles, key images, and settings as JSON. Importing replaces the current workspace.</p><div className="tool-row"><Button icon="Download" onClick={() => perform(async () => { await flush(); return api.exportWorkspace(); })}>Export</Button><Button icon="Upload" onClick={() => perform(async () => { await flush(); return api.importWorkspace(); })}>Import</Button></div>
        <div className="section-divider" /><Button icon="Power" onClick={() => perform(async () => { await flush(); await api.quit(); })}>Quit MacroMaxx</Button>
      </section>
    </div>
  </>;
}

function TypographySettings({ state, change }) {
  const size = globalFontSize(state.settings);
  const preview = { label: 'Hello World', icon: 'TextCursorInput', color: '#ad92ff', background: '#242231' };
  return <section className="settings-card">
    <div className="settings-title"><span className="action-icon"><Icon name="TextCursorInput" /></span><div><h3>Text & labels</h3><p>Your default font size for the entire deck.</p></div></div>
    <div className="key-preview" style={{ background: preview.background }}><KeyArtwork keyData={preview} defaultFontSize={size} /></div>
    <FontSizeControl keyData={{ fontSize: size }} global onChange={value => change(s => { s.settings.defaultFontSize = value; })} onReset={() => change(s => { s.settings.defaultFontSize = DEFAULT_FONT_SIZE; })} />
    <p className="muted-text">New keys and existing keys without a custom size inherit this value automatically, including keys in subfolders. Individual sizes are preserved. Choose Default in a key's properties to restore the global size.</p>
  </section>;
}

function AnimationSettings({ state, change }) {
  const folder = animationEnabled(state.settings, 'folder');
  const reveal = animationEnabled(state.settings, 'reveal');
  return <section className="settings-card">
    <div className="settings-title"><span className="action-icon"><Icon name="Sparkles" /></span><div><h3>Deck animations</h3><p>A little motion for your Stream Deck.</p></div></div>
    <div className="setting-line"><div><strong>Startup & shutdown wave</strong><small>Outward on startup, inward on shutdown.</small></div><span className="badge accent">Always on</span></div>
    <div className="setting-line"><div><strong>Folder transitions</strong><small>A short crossfade and slide when entering or leaving folders.</small></div><button role="switch" aria-checked={folder} aria-label="Folder animation" className={`switch ${folder ? 'on' : ''}`} onClick={() => change(s => { s.settings.folderAnimations = !folder; })}><i /></button></div>
    <div className="setting-line"><div><strong>Reveal icons after startup</strong><small>Key assignments gently appear from the center after the startup wave.</small></div><button role="switch" aria-checked={reveal} aria-label="Icon reveal animation" className={`switch ${reveal ? 'on' : ''}`} onClick={() => change(s => { s.settings.iconRevealAnimation = !reveal; })}><i /></button></div>
    <p className="muted-text">Disable either optional effect independently. Startup and shutdown waves stay on. A key press skips the startup wave and optional effects.</p>
  </section>;
}
