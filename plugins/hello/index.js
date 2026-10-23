export async function execute(config) {
  return { label: `Hi ${config.name || 'Welt'}!`, color: '#86efac', message: 'Dein erstes Plugin läuft.' };
}
