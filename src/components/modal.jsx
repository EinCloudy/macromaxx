import React, { useId } from 'react';
import { Tool } from './ui.jsx';

export function Modal({ title, onClose, children }) {
  const titleId = useId();
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <Tool className="modal-close" icon="X" title="Close dialog" onClick={onClose} />
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
