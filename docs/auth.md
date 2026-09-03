# Authentication

How the Studio plugin proves who the editor is to Resonance, what you need on the Studio side,
and what to do when the panel says access is missing.

## The model

The plugin never holds a Resonance credential, and you never put one in the Studio. On every
request it forwards the signed-in editor's own Sanity session, and Resonance checks that session
with Sanity before doing anything else. Sanity is the identity provider; Resonance decides, per
email, which Resonance accounts that person may use.

Concretely, each request carries the editor's Sanity token as a bearer, plus a header naming the
Sanity organization the project belongs to, and no cookies (`credentials: 'omit'`). The token is
read from the Studio's auth store at request time, never stored, logged, or used as a cache key
by the plugin. It is the editor's full session token; the plugin does not narrow it. That is the
accepted trade-off at this stage.

Resonance then serves the request as an ordinary member of the granted account. Access is
re-checked on every request, so removing someone takes effect immediately.

## What you need

**In the Studio**

- `sanity` 5.30.0 or newer. From that version the Studio's default login keeps a token the
  plugin can forward. On older Studios add `auth: {loginMethod: 'token'}` to `sanity.config.ts`.
- Editors whose session predates that version have no stored token until they sign out and back
  in. The panel tells them so.
- The `organizationId` option is optional. Without it the plugin looks the organization up once
  from the project.

**On the Resonance side** (whoever runs your Resonance account does this; the plugin has no
settings for it)

1. Your Resonance deployment must be set up to accept Sanity Studio sessions.
2. Each editor's email must be granted access to the Resonance account you want tests to land
   in.

The panel reports which of these is missing, in editor terms, and gives the editor something to
send.

## What editors see

| Panel state                                    | What it means                                                                                          | Who fixes it                                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sign in again to use Resonance.                | This Studio session has no token to forward.                                                           | The editor: sign out and back in. If it persists on an old Studio, the Studio owner sets `loginMethod: 'token'`.                                             |
| Couldn't reach Resonance.                      | The request got no response (Resonance is down, the `apiUrl` is wrong, or the network is blocking it). | The editor retries; if it persists, the Studio owner checks `apiUrl`, then the Resonance contact.                                                            |
| Resonance couldn't verify your Sanity session. | Resonance rejected the session.                                                                        | The editor signs out and in; if it persists, your Resonance contact.                                                                                         |
| You're not in Resonance yet.                   | The session is valid but this email has no access to a Resonance account.                              | Your Resonance contact. **Ask for access** opens `requestAccess.href` or copies a ready message with the editor's email, Studio origin, project and dataset. |
| Which Resonance account?                       | The email has access to several accounts and `accountUid` is not set.                                  | The editor picks one (remembered), or the Studio owner sets `accountUid`.                                                                                    |

## Local development

Point `apiUrl` at the Resonance you want to talk to. Plain `http` is accepted for `localhost`
and `127.0.0.1` only; every other `apiUrl` must be `https`.
