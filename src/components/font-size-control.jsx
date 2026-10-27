import React, { useEffect, useState } from 'react';
import {
  keyFontSize,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  DEFAULT_FONT_SIZE,
} from '../../shared/key-text.js';
import { Button } from './ui.jsx';

export function FontSizeControl({
  keyData,
  defaultSize = DEFAULT_FONT_SIZE,
  global = false,
  onChange,
  onReset,
}) {
  const size = keyFontSize(keyData, defaultSize);
  const label = global ? 'Default font size' : 'Font size';
  const [draft, setDraft] = useState(String(size));
  useEffect(() => setDraft(String(size)), [size]);
  const commit = () => {
    const number = Number(draft);
    const next =
      draft.trim() && Number.isFinite(number)
        ? Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(number)))
        : size;
    setDraft(String(next));
    if (next !== size) onChange(next);
  };
  return (
    <div className="field font-size-control">
      <span>{label}</span>
      <div className="font-size-inputs">
        <input
          type="range"
          aria-label={label}
          min={MIN_FONT_SIZE}
          max={MAX_FONT_SIZE}
          step="1"
          value={size}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <input
          type="number"
          aria-label={`${label} value`}
          min={MIN_FONT_SIZE}
          max={MAX_FONT_SIZE}
          step="1"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            const value = Number(event.target.value);
            if (
              Number.isInteger(value) &&
              value >= MIN_FONT_SIZE &&
              value <= MAX_FONT_SIZE &&
              value !== size
            )
              onChange(value);
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <Button
          className="small"
          onClick={() => {
            setDraft(String(defaultSize));
            onReset();
          }}
        >
          {global ? 'Factory default' : 'Default'}
        </Button>
      </div>
      <small>
        {global
          ? '10–32 · Factory default: 16. Applies to every key without a custom font size.'
          : `Global default: ${defaultSize}. ${keyData?.fontSize === undefined ? 'This key inherits it automatically.' : 'Custom size – choose Default to restore inheritance.'}`}
      </small>
    </div>
  );
}
