import React, { useState } from 'react';
import { Icon } from '../../icons.jsx';

export function ActionLibrary({ library, onChoose, openPlugins }) {
  const [search, setSearch] = useState('');
  const [showUnavailable, setShowUnavailable] = useState(false);
  const filtered = library.filter(
    (item) =>
      (showUnavailable || item.availability.available) &&
      `${item.name} ${item.description} ${item.group}`.toLowerCase().includes(search.toLowerCase()),
  );
  const groups = Map.groupBy(filtered, (item) => item.group);
  return (
    <>
      <div className="library-heading">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showUnavailable}
            onChange={(event) => setShowUnavailable(event.target.checked)}
          />
          Show unavailable actions
        </label>
      </div>
      <div className="search-input">
        <Icon name="Search" size={16} />
        <input
          placeholder="Search actions …"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search actions"
        />
      </div>
      <div className="action-library">
        {[...groups].map(([group, items]) => (
          <div className="action-group" key={group}>
            <h4>
              {group}
              <Icon name="ChevronDown" size={13} />
            </h4>
            {items.map((item) => (
              <ActionCard key={item.key} item={item} onChoose={onChoose} />
            ))}
          </div>
        ))}
        {!filtered.length && <div className="empty-detail">No matching actions found.</div>}
      </div>
      <div className="plugin-callout">
        <Icon name="Puzzle" size={16} />
        <button onClick={openPlugins}>
          Manage plugins
          <Icon name="ArrowUpRight" size={13} />
        </button>
      </div>
    </>
  );
}

function ActionCard({ item, onChoose }) {
  const { availability } = item;
  return (
    <button
      className="action-card"
      disabled={!availability.available}
      title={availability.available ? item.description : availability.reason}
      draggable={availability.available}
      onDragStart={(event) => event.dataTransfer.setData('action', item.key)}
      onClick={() => onChoose(item.key)}
    >
      <span
        className={`action-icon ${item.group === 'Connections' ? 'blue' : item.group === 'Organization' ? 'amber' : ''}`}
      >
        <Icon name={item.icon} size={19} />
      </span>
      <span>
        <strong>{item.name}</strong>
        <small>
          {availability.available
            ? item.description
            : `${availability.name}: unavailable on this setup`}
        </small>
      </span>
      <Icon className="drag-handle" name="GripVertical" size={15} />
    </button>
  );
}
