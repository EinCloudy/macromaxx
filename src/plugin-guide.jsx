import React from 'react';
import { Icon } from './icons.jsx';

export function PluginGuide({ guide }) {
  if (!guide) return null;
  return <section className="settings-card plugin-guide" aria-label={guide.title || 'Setup guide'}>
    <div className="settings-title"><span className="action-icon"><Icon name="CircleHelp" /></span><div><h3>{guide.title || 'Setup guide'}</h3><p>{guide.intro}</p></div></div>
    <ol>{(guide.steps || []).map((step, index) => <li key={index}><h4>{step.title}</h4><p>{step.text}</p>{(step.commands || []).map(command => <code key={command}>{command}</code>)}</li>)}</ol>
  </section>;
}
