import React from 'react';
import { Icon } from './icons.jsx';
export function AutoProfileSettings({ state, status, change }) {
  const focus = status.focus || {};
  return <section className="settings-card"><div className="settings-title"><span className="action-icon"><Icon name="Layers" /></span><div><h3>Automatic profiles</h3><p>Switch profiles based on the active application.</p></div></div>
    <label className="checkbox-label"><input type="checkbox" checked={!!state.settings.autoProfiles} onChange={e => change(s => { s.settings.autoProfiles = e.target.checked; })} />Enable automatic profile switching</label>
    <p className="muted-text">Active application: {focus.appId || 'Not detected'}<br />{focus.error || (focus.available ? 'Native focus provider connected.' : 'An available active-application plugin is required.')}</p>
    <label className="field"><span>Unmatched application fallback</span><select value={state.settings.autoProfileFallback || ''} onChange={e => change(s => { s.settings.autoProfileFallback = e.target.value; })}><option value="">Last manually selected profile</option>{state.profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    {state.profiles.map(profile => <label className="field" key={profile.id}><span>{profile.name} · application patterns (one per line)</span><textarea rows="2" placeholder="Application ID or wildcard pattern" value={(profile.appRules || []).join('\n')} onChange={e => { const rules = e.target.value.split('\n').slice(0,32).map(rule => rule.slice(0,256)); change(s => { s.profiles.find(p => p.id === profile.id).appRules = rules; }); }} /></label>)}
    <p className="muted-text">Matches are case-insensitive; * and ? are wildcards. First matching profile wins. Manual selection stays until focus changes, and MacroMaxx itself is ignored. Application IDs vary by OS; rule data is preserved even without a compatible provider.</p>
  </section>;
}
