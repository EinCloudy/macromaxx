import React, { useState } from 'react';
import { api, desktop } from '../../api.js';
import { Icon } from '../../icons.jsx';
import { Button, Tool } from '../../components/ui.jsx';
import { Modal } from '../../components/modal.jsx';
import { visibleKeys, duplicateKey } from '../../../shared/model.js';
import { deckSlots, swapDeckSlots } from '../../../shared/deck-layout.js';
import { globalFontSize } from '../../../shared/key-text.js';
import { actionLibrary, libraryKey } from '../../../shared/action-library.js';
import { ActionLibrary } from './action-library.jsx';
import { KeyProperties } from './key-properties.jsx';
import { KeyDetails } from './key-details.jsx';
import { DeckGrid } from './deck-grid.jsx';

export function DeckEditor({
  state,
  status,
  plugins,
  path,
  selected,
  setSelected,
  pressed,
  change,
  undo,
  redo,
  canUndo,
  canRedo,
  navigate,
  flush,
  perform,
  notify,
  openPlugins,
  openProfileDialog,
}) {
  const [tab, setTab] = useState('library');
  const [longMode, setLongMode] = useState(false);
  const [replacement, setReplacement] = useState(null);
  const count = status.device?.count || 15;
  const defaultSize = globalFontSize(state.settings);
  const slots = deckSlots(state, path, count);
  const offset = path.length ? 1 : 0;
  const selectedSlot = slots[selected];
  const key = selectedSlot?.isBack ? null : selectedSlot?.key;
  const profile = state.profiles.find((item) => item.id === state.activeProfileId);
  const library = actionLibrary(plugins, status);
  const occupied = slots.filter((slot) => slot.key && !slot.isBack).length;

  function editKey(updater) {
    if (key) change((next) => updater(visibleKeys(next, path)[selectedSlot.childIndex]));
  }
  function place(entry, index = selected) {
    const item = library.find((item) => item.key === entry);
    if (!item?.availability.available || !slots[index]) return;
    if (slots[index].isBack) return notify('Move the Back key to another slot first.');
    change((next) => {
      const list = visibleKeys(next, path);
      while (list.length < count - offset) list.push(null);
      list[slots[index].childIndex] = libraryKey(item);
    });
    setSelected(index);
    setTab('edit');
    setLongMode(false);
  }
  function drop(event, index) {
    event.preventDefault();
    const type = event.dataTransfer.getData('action');
    const source = event.dataTransfer.getData('key');
    if (type) place(type, index);
    else if (source !== '') {
      const from = Number(source);
      if (!Number.isInteger(from) || from < 0 || from >= count || from === index) return;
      change((next) => swapDeckSlots(next, path, from, index, count));
      setSelected(index);
    }
  }
  const openFolder = (index) => navigate({ path: [...path, slots[index].childIndex] });
  async function execute(long = false) {
    if (key?.actions[0]?.type === 'folder' && !long) return openFolder(selected);
    await perform(async () => {
      await flush();
      await api.execute(selected, long);
    });
  }
  function duplicate() {
    if (!key) return;
    const free = slots.findIndex((slot) => !slot.key && !slot.isBack);
    if (free < 0) return notify('There are no free slots on this page.', true);
    change((next) => {
      visibleKeys(next, path)[slots[free].childIndex] = duplicateKey(key);
    });
    setSelected(free);
  }
  function openKey(index) {
    if (slots[index].isBack) navigate({ up: true });
    else if (slots[index].key?.actions[0]?.type === 'folder') openFolder(index);
    else if (slots[index].key) {
      setSelected(index);
      setTab('edit');
    }
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <h1>Deck Editor</h1>
          <p>Assign actions and arrange your keys.</p>
        </div>
        <Button
          icon="Download"
          onClick={() =>
            perform(async () => {
              await flush();
              return api.exportWorkspace();
            })
          }
        >
          Export
        </Button>
      </section>
      <div className="editor-layout">
        <section className="deck-panel">
          <div className="panel-top">
            <div>
              <span className="section-icon">
                <Icon name="PanelsTopLeft" size={18} />
              </span>
              <strong>{profile?.name}</strong>
              <button
                className="chevron-button"
                title="Rename profile"
                onClick={() => openProfileDialog('renameProfile')}
              >
                <Icon name="Pencil" size={13} />
              </button>
              <span className="badge">
                {occupied} / {count - offset} keys
              </span>
            </div>
            <div className="tool-row">
              <Tool icon="Undo2" title="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo} />
              <Tool icon="Redo2" title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo} />
              <span className="separator" />
              <Tool
                icon="Ellipsis"
                title="Profile options"
                onClick={() => openProfileDialog('profileOptions')}
              />
            </div>
          </div>
          <div className="device-bar">
            <div className="device-select">
              <Icon name="Usb" size={16} />
              <select
                aria-label="Device"
                value={status.available?.find((device) => device.path)?.path || 'virtual'}
                onChange={(event) => perform(() => api.selectDevice(event.target.value))}
              >
                {status.available?.length ? (
                  status.available.map((device) => (
                    <option key={device.path} value={device.path}>
                      {status.device?.name || device.name}
                    </option>
                  ))
                ) : (
                  <option value="virtual">Virtual Stream Deck · 15 keys</option>
                )}
              </select>
            </div>
            <span className={`connection ${status.device?.connected ? 'connected' : ''}`}>
              <i />
              {status.device?.connected ? 'Connected' : 'Preview'}
            </span>
          </div>
          <div className="deck-workspace">
            <div className="folder-breadcrumb">
              <button onClick={() => navigate({ path: [] })}>
                <Icon name="Home" size={13} />
                {profile?.name}
              </button>
              {path.map((_, index) => (
                <React.Fragment key={index}>
                  <Icon name="ChevronRight" size={12} />
                  <button onClick={() => navigate({ path: path.slice(0, index + 1) })}>
                    Folder {index + 1}
                  </button>
                </React.Fragment>
              ))}
            </div>
            <DeckGrid
              slots={slots}
              status={status}
              columns={status.device?.columns || 5}
              rows={status.device?.rows || 3}
              selected={selected}
              pressed={pressed}
              defaultSize={defaultSize}
              onSelect={(index) => {
                setSelected(index);
                setLongMode(false);
              }}
              onOpen={openKey}
              onDrop={drop}
            />
            <div className="deck-hint">
              <Icon name="MousePointer2" size={14} />
              <span>Drag actions onto keys. Double-click a key to edit.</span>
            </div>
          </div>
          <div className="deck-toolbar">
            <span>
              <i className={status.device?.connected ? 'green-dot' : 'gray-dot'} />
              {status.device?.connected
                ? 'Changes are sent to your deck live'
                : desktop
                  ? 'Connect your deck for live updates'
                  : 'Browser preview · Hardware requires the desktop app'}
            </span>
            <label>
              <Icon name="Sun" size={15} />
              <input
                aria-label="Brightness"
                type="range"
                min="0"
                max="100"
                value={state.settings.brightness}
                onChange={(event) =>
                  change((next) => {
                    next.settings.brightness = Number(event.target.value);
                  })
                }
              />
              <span>{state.settings.brightness}%</span>
            </label>
          </div>
          <KeyDetails
            keyData={key}
            backSelected={!!selectedSlot?.isBack}
            selected={selected}
            status={status}
            defaultSize={defaultSize}
            onExecute={() => execute()}
            onEdit={() => setTab('edit')}
            onDuplicate={duplicate}
            onDelete={() =>
              change((next) => {
                visibleKeys(next, path)[selectedSlot.childIndex] = null;
              })
            }
          />
        </section>
        <aside className="action-panel">
          <div className="action-tabs">
            <button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}>
              <Icon name="Shapes" size={16} />
              Actions
            </button>
            <button className={tab === 'edit' ? 'active' : ''} onClick={() => setTab('edit')}>
              <Icon name="SlidersHorizontal" size={16} />
              Properties
            </button>
          </div>
          {tab === 'library' ? (
            <ActionLibrary
              library={library}
              onChoose={(entry) => {
                if (key) setReplacement(entry);
                else place(entry);
              }}
              openPlugins={openPlugins}
            />
          ) : key ? (
            <KeyProperties
              keyData={key}
              selected={selected}
              defaultSize={defaultSize}
              editKey={editKey}
              library={library}
              longMode={longMode}
              setLongMode={setLongMode}
              state={state}
              status={status}
              plugins={plugins}
              perform={perform}
              execute={execute}
            />
          ) : (
            <div className="properties-empty">
              <Icon name="MousePointer2" size={28} />
              <h3>No action assigned</h3>
              <p>Add an action to edit this key.</p>
              <Button onClick={() => setTab('library')}>Choose an action</Button>
            </div>
          )}
        </aside>
      </div>
      {replacement && (
        <Modal title="Replace this assignment?" onClose={() => setReplacement(null)}>
          <p>The current assignment will be replaced. You can undo this change afterwards.</p>
          <Button
            className="primary full"
            onClick={() => {
              place(replacement);
              setReplacement(null);
            }}
          >
            Replace assignment
          </Button>
          <Button
            className="full"
            onClick={() => {
              setTab('edit');
              setReplacement(null);
            }}
          >
            Edit the action chain instead
          </Button>
        </Modal>
      )}
    </>
  );
}
