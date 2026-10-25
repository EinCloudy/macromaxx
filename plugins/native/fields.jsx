import React from 'react';
export function Select({ label, value, options, onChange }) {
  const choices = value && !options.some(([id]) => id === value) ? [...options, [value, `${value} (saved; unavailable here)`]] : options;
  return <label className="field"><span>{label}</span><select aria-label={label} value={value} onChange={e => onChange(e.target.value)}>{choices.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;
}
export function TextField({ label, value, onChange, multiline, placeholder }) {
  return <label className="field"><span>{label}</span>{multiline ? <textarea rows="4" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} /> : <input value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />}</label>;
}
export function ProcessFields({ action, update }) {
  return <><TextField label="Arguments (JSON array)" value={action.args || '[]'} placeholder={'["--flag", "a path with spaces"]'} onChange={args => update({ args })} /><TextField label="Working directory" value={action.cwd} placeholder="Optional" onChange={cwd => update({ cwd })} /><TextField label="Environment (JSON object)" value={action.env || '{}'} onChange={env => update({ env })} /><p className="muted-text">Arguments remain separate argv entries. Environment values are included in workspace exports.</p></>;
}
