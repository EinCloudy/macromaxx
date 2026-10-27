import React from 'react';
import { Icon } from '../icons.jsx';

export function Tool({ icon, title, onClick, disabled, active, children, className = '' }) {
  return (
    <button
      title={title}
      aria-label={title}
      disabled={disabled}
      className={`tool ${active ? 'active' : ''} ${className}`}
      onClick={onClick}
    >
      <Icon name={icon} size={17} />
      {children}
    </button>
  );
}

export function Button({ icon, children, className = '', ...props }) {
  return (
    <button className={`button ${className}`} {...props}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Switch({ label, checked, onChange }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <i />
    </button>
  );
}
