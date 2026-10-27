# Discord desktop integration (experimental)

MacroMaxx includes an optional native Discord plugin for microphone mute and
deafen, including toggle, explicit on/off, and live key highlights. It talks to
the official desktop client through local IPC on Linux, Windows and macOS.
Browser Discord is not supported; sandboxed desktop packages may restrict IPC.

## Authorization

Application ID: `1564628426386710581`

The normal connection uses local `AUTHORIZE` with an S256 PKCE challenge. The
code is exchanged directly with Discord using the matching verifier, then the
token is sent through `AUTHENTICATE`. No redirect URI or local HTTP listener is
used. Requested scopes: `identify`, `rpc.voice.read`, `rpc.voice.write`.

**Current limitation:** voice authorization has returned RPC error 5000 /
`invalid_scope` for this application. Working microphone control has not been
confirmed. Discord's application eligibility and support for this combination
of native RPC scopes and public-client PKCE need clarification. App verification
alone is not a documented fix. The plugin remains experimental pending this
clarification; it does not bypass restrictions or silently use another flow.

## Connect

1. Run and sign into Discord desktop.
2. Open Plugins → Discord → Details in MacroMaxx.
3. Click Connect to Discord and approve access directly in Discord (allow up to
   two minutes). MacroMaxx displays the current connection stage.
4. Once connected, add Discord in Deck Editor → Connections and choose microphone
   mute or deafen with toggle/on/off behavior.

On failure, report the stage and error, never authorization codes or tokens.
Stages distinguish IPC handshake, AUTHORIZE, token exchange, AUTHENTICATE,
event subscription and voice-state read.

## Privacy and limitations

- No MacroMaxx backend, client secret, account token, third-party application ID,
  or token broker is used. The OAuth token exchange contacts Discord's HTTPS
  servers; RPC commands communicate with the local Discord process.
- Tokens are held in memory only, not persisted or included in workspace exports.
  Reconnect after restarting, losing the Discord connection, or token expiry.
  Automatic token refresh/persistent login is not implemented.
- Disconnect ends the local session. Revoke the OAuth grant in Discord → User
  Settings → Authorized Apps if needed.
- Real authorization and voice commands require manual validation on each OS.
  Automated tests use simulated IPC and OAuth responses.

References: [official RPC](https://docs.discord.com/developers/topics/rpc),
[official OAuth2](https://docs.discord.com/developers/topics/oauth2),
[community AUTHORIZE/PKCE documentation](https://docs.discord.food/topics/rpc#authorize).
