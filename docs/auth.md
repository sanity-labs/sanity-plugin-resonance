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

- `sanity` 5.30.0 or newer.
- A token for the plugin to forward. The Studio only stores one when an editor actually goes
  through the login flow on that origin. With the default `auth.loginMethod` (`dual`), a Studio
  that can reach a valid Sanity cookie signs the editor in without the login flow, so there is no
  token: this is the normal case on a `*.sanity.io` host and on every new preview URL, and the
  panel then asks the editor to sign out and back in. Setting `auth: {loginMethod: 'token'}` in
  `sanity.config.ts` makes the Studio always use the login flow, so the token is always there. It
  costs every editor one re-login when it ships. Recommended for any Studio that has this plugin.
- The `organizationId` option is optional. Without it the plugin looks the organization up once
  from the project.
- `accountUid` is required. The panel confirms with Resonance that the signed-in editor is granted
  that account before it offers a run; editors are never asked to pick an account.

**On the Resonance side** (whoever runs your Resonance account does this; the plugin has no
settings for it)

1. Your Resonance deployment must be set up to accept Sanity Studio sessions.
2. Each editor's email must be granted access to the Resonance account you want tests to land
   in.

The panel reports which of these is missing, in editor terms.

## What editors see

| Panel state                                                    | What it means                                                                                          | Who fixes it                                                                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Sign out and back in to link Resonance to your Sanity account. | The Studio signed in with a cookie; there is no token to forward.                                      | The editor: sign out and back in from the user menu. The Studio owner sets `loginMethod: 'token'` so it does not recur. |
| Couldn't reach Resonance.                                      | The request got no response (Resonance is down, the `apiUrl` is wrong, or the network is blocking it). | The editor retries; if it persists, the Studio owner checks `apiUrl`, then the Resonance contact.                       |
| Resonance couldn't verify your Sanity session.                 | Resonance rejected the session.                                                                        | The editor signs out and in from the user menu; if it persists, your Resonance contact.                                 |
| You're not in Resonance yet.                                   | The session is valid but this email has no access to the configured Resonance account.                 | Your Resonance contact grants the email; the editor presses **Check again**.                                            |

## Local development

`apiUrl` defaults to production Resonance. Point it elsewhere to talk to another deployment.
Plain `http` is accepted for `localhost` and `127.0.0.1` only; every other `apiUrl` must be
`https`. Results and option choices are remembered per `apiUrl` host, so switching does not mix
them up.
