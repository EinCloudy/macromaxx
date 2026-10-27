import { randomBytes, createHash } from 'node:crypto';

export const CLIENT_ID = '1564628426386710581';
export const SCOPES = ['identify', 'rpc.voice.read', 'rpc.voice.write'];

async function exchangeCode(code, verifier, signal, { fetchImpl = fetch } = {}) {
  signal.throwIfAborted();
  const response = await fetchImpl('https://discord.com/api/oauth2/token', {
    method: 'POST', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, grant_type: 'authorization_code', code, code_verifier: verifier }),
  });
  if (!response.ok) {
    let detail = '';
    try {
      const failure = await response.json();
      const allowed = ['invalid_request', 'invalid_client', 'invalid_grant', 'unauthorized_client', 'unsupported_grant_type', 'invalid_scope'];
      if (allowed.includes(failure.error)) detail = `, ${failure.error}`;
      // Report a known compatibility symptom without echoing arbitrary text.
      if (typeof failure.error_description === 'string' && /missing.*code_verifier/i.test(failure.error_description)) detail += ', code_verifier reported missing';
    } catch { /* response body unavailable or not JSON */ }
    throw new Error(`Discord token exchange rejected (HTTP ${response.status}${detail}). This experimental integration needs RPC approval and secretless public-client/PKCE support. No client secret will be requested.`);
  }
  const token = await response.json();
  if (typeof token.access_token !== 'string' || !token.access_token) throw new Error('Discord did not return an access token.');
  if (!SCOPES.every(scope => (token.scope || '').split(' ').includes(scope))) throw new Error('Discord did not grant all requested permissions.');
  return token;
}

// Local RPC authorization is distinct from the browser OAuth endpoint. The
// client may support PKCE here, but that must be verified with real Discord.
// No fallback to a secret, third-party application ID or token broker is used.
export async function authorizeRPC(client, signal, { fetchImpl = fetch, onStage = () => {} } = {}) {
  const verifier = randomBytes(32).toString('base64url');
  signal.throwIfAborted();
  onStage('Local AUTHORIZE / PKCE');
  const result = await client.request('AUTHORIZE', {
    client_id: CLIENT_ID, scopes: [...SCOPES], response_type: 'code',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
  }, undefined, { timeout: 120000, signal });
  signal.throwIfAborted();
  if (typeof result?.code !== 'string' || !result.code || result.code.length > 4096) throw new Error('Discord AUTHORIZE did not return a valid code.');
  onStage('PKCE token exchange');
  return exchangeCode(result.code, verifier, signal, { fetchImpl });
}
