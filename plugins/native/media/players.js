export function selectPlayer(media, requested = 'auto') {
  const players = media?.players || [];
  if (!requested || requested === 'auto') return players.find(p => p.status === 'Playing') || players[0];
  return players.find(p => p.id === requested) || players.find(p => p.id.replace(/\.instance.*$/, '') === requested.replace(/\.instance.*$/, ''));
}
