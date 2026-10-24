export function matchesApplication(pattern, appId) {
  const regex = String(pattern).trim().split('').map(char => char === '*' ? '.*' : char === '?' ? '.' : char.replace(/[\\^$+.[\]{}()|]/g, '\\$&')).join('');
  return !!regex && new RegExp(`^${regex}$`, 'i').test(appId);
}
export function matchingProfile(state, appId) {
  return state.profiles.find(profile => (profile.appRules || []).some(rule => matchesApplication(rule, appId)));
}
