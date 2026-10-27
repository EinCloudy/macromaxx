import React from 'react';
import { catalog } from '../../../shared/action-catalog.js';
import { isKeyActive } from '../../../shared/visuals.js';
import { Icon } from '../../icons.jsx';
import { KeyArtwork } from '../../key-artwork.jsx';
import { Button, Tool } from '../../components/ui.jsx';

export function KeyDetails({
  keyData,
  backSelected,
  selected,
  status,
  defaultSize,
  onExecute,
  onEdit,
  onDuplicate,
  onDelete,
}) {
  const running = status.running?.includes(keyData?.id);
  const folder = keyData?.actions[0]?.type === 'folder';
  return (
    <div className="key-details">
      <div className="detail-heading">
        <div>
          <span className="eyebrow">Selected key</span>
          <h3>{keyData?.label || (backSelected ? 'Back to parent folder' : 'Unassigned key')}</h3>
        </div>
        <span className="key-index">{String(selected + 1).padStart(2, '0')}</span>
      </div>
      {keyData ? (
        <div className="key-summary">
          <div
            className="key-preview"
            style={{ color: keyData.color, background: keyData.background }}
          >
            <KeyArtwork
              keyData={keyData}
              active={isKeyActive(keyData, status.obs, status)}
              defaultFontSize={defaultSize}
            />
          </div>
          <div className="key-summary-text">
            <span className="badge accent">
              {keyData.actions.length > 1
                ? 'Multi-action'
                : catalog.find((item) => item.type === keyData.actions[0]?.type)?.name || 'Action'}
            </span>
            <p>
              {keyData.actions.length} action{keyData.actions.length !== 1 ? 's' : ''} ·{' '}
              {keyData.longActions?.length ? 'Long press assigned' : 'Short press'}
            </p>
            <div className="tool-row">
              <Button
                icon={running ? 'Square' : folder ? 'FolderOpen' : 'Play'}
                className="primary small"
                onClick={onExecute}
              >
                {running ? 'Stop' : folder ? 'Open' : 'Test'}
              </Button>
              <Button icon="SlidersHorizontal" className="small" onClick={onEdit}>
                Edit
              </Button>
              <Tool icon="Copy" title="Duplicate key" onClick={onDuplicate} />
              <Tool icon="Trash2" title="Delete key" onClick={onDelete} />
            </div>
          </div>
        </div>
      ) : (
        <div className="empty-detail">
          <Icon name="MousePointer2" size={18} />
          <p>
            {backSelected
              ? 'Drag to reposition the Back key. Double-click to open the parent folder.'
              : 'Choose an action on the right or drag it onto this key.'}
          </p>
        </div>
      )}
    </div>
  );
}
