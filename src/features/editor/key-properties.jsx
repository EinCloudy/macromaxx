import React, { useState } from 'react';
import { api } from '../../api.js';
import { Icon, iconNames } from '../../icons.jsx';
import { Button, Field, Tool } from '../../components/ui.jsx';
import { FontSizeControl } from '../../components/font-size-control.jsx';
import { libraryAction } from '../../../shared/action-library.js';
import { ActionEditor } from './action-editor.jsx';
import { keyColors } from './palette.js';

export function KeyProperties({
  keyData,
  selected,
  defaultSize,
  editKey,
  library,
  longMode,
  setLongMode,
  state,
  status,
  plugins,
  perform,
  execute,
}) {
  const [iconPicker, setIconPicker] = useState(false);
  const actions = longMode ? keyData.longActions : keyData.actions;
  const editActions = (updater) =>
    editKey((key) => updater(longMode ? key.longActions : key.actions));
  return (
    <div className="properties">
      <div className="properties-title">
        <h3>Customize key</h3>
        <span>#{selected + 1}</span>
      </div>
      <Field label="Label">
        <input
          value={keyData.label}
          maxLength={80}
          onChange={(event) =>
            editKey((key) => {
              key.label = event.target.value;
            })
          }
        />
      </Field>
      <div className="appearance-row">
        <button
          className="icon-select"
          style={{ color: keyData.color }}
          onClick={() => setIconPicker(!iconPicker)}
        >
          <Icon name={keyData.icon} size={26} />
          <Icon name="ChevronDown" size={12} />
        </button>
        <div className="color-swatches">
          {keyColors.map((color) => (
            <button
              key={color}
              aria-label={`Color ${color}`}
              className={keyData.color === color ? 'selected' : ''}
              style={{ background: color }}
              onClick={() =>
                editKey((key) => {
                  key.color = color;
                })
              }
            />
          ))}
        </div>
        <input
          aria-label="Custom icon color"
          type="color"
          value={keyData.color}
          onChange={(event) =>
            editKey((key) => {
              key.color = event.target.value;
            })
          }
        />
      </div>
      {iconPicker && (
        <div className="icon-picker">
          {iconNames.map((name) => (
            <button
              key={name}
              title={name}
              onClick={() => {
                editKey((key) => {
                  key.icon = name;
                  key.image = '';
                });
                setIconPicker(false);
              }}
            >
              <Icon name={name} size={20} />
            </button>
          ))}
        </div>
      )}
      <div className="image-controls">
        <Button
          icon="ImagePlus"
          className="small"
          onClick={() =>
            perform(async () => {
              const image = await api.pickImage();
              if (image)
                editKey((key) => {
                  key.image = image;
                });
            })
          }
        >
          Custom image
        </Button>
        {keyData.image && (
          <Tool
            icon="X"
            title="Remove image"
            onClick={() =>
              editKey((key) => {
                key.image = '';
              })
            }
          />
        )}
        <label>
          Background
          <input
            type="color"
            value={keyData.background}
            onChange={(event) =>
              editKey((key) => {
                key.background = event.target.value;
              })
            }
          />
        </label>
      </div>
      <FontSizeControl
        key={keyData.id}
        keyData={keyData}
        defaultSize={defaultSize}
        onChange={(fontSize) =>
          editKey((key) => {
            key.fontSize = fontSize;
          })
        }
        onReset={() =>
          editKey((key) => {
            delete key.fontSize;
          })
        }
      />
      <div className="section-divider" />
      <div className="properties-title">
        <h3>Actions</h3>
        <Icon name="Workflow" size={17} />
      </div>
      <div className="segmented">
        <button className={!longMode ? 'active' : ''} onClick={() => setLongMode(false)}>
          Short press
        </button>
        <button className={longMode ? 'active' : ''} onClick={() => setLongMode(true)}>
          Long press
        </button>
      </div>
      {longMode && (
        <p className="muted-text">
          Hold for at least 600 ms. If unassigned, the short-press action is used.
        </p>
      )}
      {actions.map((action, index) => (
        <ActionEditor
          key={action.id}
          action={action}
          index={index}
          total={actions.length}
          state={state}
          status={status}
          plugins={plugins}
          update={(patch) => editActions((list) => Object.assign(list[index], patch))}
          remove={() => editActions((list) => list.splice(index, 1))}
          move={(direction) =>
            editActions((list) => {
              [list[index], list[index + direction]] = [list[index + direction], list[index]];
            })
          }
          perform={perform}
        />
      ))}
      <select
        aria-label="Add action to chain"
        className="add-action-select"
        value=""
        onChange={(event) => {
          const item = library.find((item) => item.key === event.target.value);
          if (item?.availability.available)
            editActions((list) => {
              list.push(libraryAction(item));
            });
        }}
      >
        <option value="">+ Add action</option>
        {[...new Set(library.map((item) => item.group))].map((group) => (
          <optgroup key={group} label={group}>
            {library
              .filter(
                (item) =>
                  item.group === group && item.type !== 'folder' && item.availability.available,
              )
              .map((item) => (
                <option key={item.key} value={item.key}>
                  {item.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={keyData.stopOnError !== false}
          onChange={(event) =>
            editKey((key) => {
              key.stopOnError = event.target.checked;
            })
          }
        />
        Stop on error
      </label>
      <Button className="primary full" icon="Play" onClick={() => execute(longMode)}>
        Test assignment
      </Button>
    </div>
  );
}
