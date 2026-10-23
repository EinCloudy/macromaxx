import { pathToFileURL } from 'node:url';
const plugin = await import(pathToFileURL(process.argv[2]).href);
process.on('message', async ({ config }) => {
  try { const result = await plugin.execute(config, { platform: process.platform }); process.send({ result: result ?? {} }); }
  catch (e) { process.send({ error: e.message }); }
});
