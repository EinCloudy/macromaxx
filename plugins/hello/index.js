export async function execute(config) {
  return { label: `Hi ${config.name || 'World'}!`, color: '#86efac', message: 'Your first plugin is running.' };
}
