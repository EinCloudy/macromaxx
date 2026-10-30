import React, { useEffect, useState } from 'react';
import { Icon } from '../../icons.jsx';
import { KeyArtwork } from '../../key-artwork.jsx';
import { isKeyActive, liveKey } from '../../../shared/visuals.js';
import { createDragHover } from './drag-hover.js';

export function DeckGrid({
  slots,
  status,
  columns,
  rows,
  selected,
  pressed,
  defaultSize,
  pageId,
  onSelect,
  onOpen,
  onDrop,
  onDragStart,
  onDragEnd,
  canHoverOpen,
}) {
  const [dragHover] = useState(createDragHover);
  useEffect(() => {
    dragHover.cancel();
    const cancel = () => dragHover.cancel();
    window.addEventListener('dragend', cancel);
    window.addEventListener('drop', cancel);
    return () => {
      cancel();
      window.removeEventListener('dragend', cancel);
      window.removeEventListener('drop', cancel);
    };
  }, [dragHover, pageId]);

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
              onDragStart={(event) => onDragStart(event, index)}
              onDragEnd={() => {
                dragHover.cancel();
                onDragEnd();
              }}
              onDragOver={(event) => {
                event.preventDefault();
                const types = Array.from(event.dataTransfer.types);
                if (
                  (types.includes('action') || types.includes('key')) &&
                  (slot.isBack || key?.actions?.[0]?.type === 'folder') &&
                  canHoverOpen(index)
                ) {
                  dragHover.hover(index, () => onOpen(index));
                } else dragHover.cancel();
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) dragHover.cancel();
              }}
              onDrop={(event) => {
                dragHover.cancel();
                onDrop(event, index);
              }}
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
