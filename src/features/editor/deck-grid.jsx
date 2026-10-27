import React from 'react';
import { Icon } from '../../icons.jsx';
import { KeyArtwork } from '../../key-artwork.jsx';
import { isKeyActive, liveKey } from '../../../shared/visuals.js';

export function DeckGrid({
  slots,
  status,
  columns,
  rows,
  selected,
  pressed,
  defaultSize,
  onSelect,
  onOpen,
  onDrop,
}) {
  return (
    <div className="deck-shell" style={{ '--cols': columns, '--rows': rows }}>
      <div className="deck-brand">
        <span>STREAM DECK</span>
        <span className="deck-logo">▰</span>
      </div>
      <div className="deck-grid">
        {slots.map((slot, index) => {
          const key = liveKey(slot.key, status);
          const active = isKeyActive(key, status.obs, status);
          return (
            <button
              key={index}
              className={`deck-key ${selected === index ? 'is-selected' : ''} ${!key ? 'empty' : ''} ${pressed.includes(index) ? 'pressed' : ''} ${active ? 'live' : ''}`}
              draggable={!!key}
              onDragStart={(event) => event.dataTransfer.setData('key', String(index))}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => onDrop(event, index)}
              onClick={() => onSelect(index)}
              onDoubleClick={() => onOpen(index)}
              title={
                key
                  ? `${key.label} · ${slot.isBack ? 'Drag to move · ' : ''}Double-click to ${key.actions?.[0]?.type === 'folder' || slot.isBack ? 'open' : 'edit'}`
                  : `Assign key ${index + 1}`
              }
              style={{ '--key-color': key?.color, background: key?.background }}
            >
              {key ? (
                <>
                  <KeyArtwork keyData={key} active={active} defaultFontSize={defaultSize} />
                  {key.actions?.length > 1 && (
                    <b className="chain-badge">
                      <Icon name="Layers2" size={10} />
                      {key.actions.length}
                    </b>
                  )}
                  {active && <i className="live-dot" />}
                </>
              ) : (
                <Icon name="Plus" size={21} />
              )}
              <em className="key-number">{index + 1}</em>
            </button>
          );
        })}
      </div>
    </div>
  );
}
