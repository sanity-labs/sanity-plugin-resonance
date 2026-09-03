---
name: sanity-plugin-resonance
description: Install and configure @sanity-labs/sanity-plugin-resonance, the Sanity Studio plugin that lets editors run Resonance audience tests on a document from a side panel. Use this whenever someone wants to add Resonance, audience tests, simulated audiences, persona feedback, or "ask our audiences" to a Sanity Studio; wants the Resonance button on more document types; wants audiences told where content lives or who publishes it; is wiring compare-with-published, custom serializers, or a custom prompt; or is debugging a panel state such as "Couldn't reach Resonance" or "You're not in Resonance yet". DO NOT load this for Resonance's own web app, API, or MCP outside a Studio, for Sanity AI Assist, Comments, or other unrelated Studio plugins, or for general Sanity plugin development.
---

# sanity-plugin-resonance

A Sanity Studio plugin. Editors click **Resonance** in a document's header and send the document
to Resonance's simulated audiences, who each return a 1–5 score, their reasoning, and what would
change the score. This skill gets the plugin installed, configured well for the host's schema,
and working end to end.

The plugin is pre-alpha. Read the repo's `README.md` before anything else if it is available
locally; it is the current source of truth and this skill defers to it where they disagree.

## 1. Understand the host Studio first

Before writing config, look at:

- `sanity.config.ts` (or `.js`): where plugins are registered, the `auth` block, and whether
  `document.inspectors` is already customised.
- The `sanity` version in `package.json`. The plugin needs `>= 5.30.0`. Older Studios need
  `auth: {loginMethod: 'token'}` added to the config; say so explicitly.
- The schema types that carry editorial content (blog posts, articles, docs pages, landing pages).
  For each candidate, note the type name, the title field, the main Portable Text field(s), the
  slug field, and how the site builds the public URL for it (look for URL resolvers, `getUrl`,
  `resolveHref`, presentation `locations`, or frontend route files).
- Whether the site has a URL helper you can reuse rather than re-deriving paths.

Tell the user which types you plan to enable and why. Do not enable every type; audience tests
make sense for pieces someone reads, not for settings, navigation, or reference data.

## 2. Install

```sh
pnpm add @sanity-labs/sanity-plugin-resonance   # or npm/yarn to match the repo
```

Minimal registration:

```ts
import {resonance} from '@sanity-labs/sanity-plugin-resonance'

plugins: [
  resonance({
    apiUrl: 'https://resonance.cx',
    accountUid: '<the Resonance account uid>',
    documents: ['post', 'article'],
  }),
]
```

Keep `apiUrl` as a plain string unless the host already reads config from environment variables,
in which case follow the host's pattern (Studio env vars are `SANITY_STUDIO_*` and are public).
`accountUid` is required: the uid of the Resonance account the Studio tests against. Ask the user
for it, or the user's Resonance contact. The panel checks each editor is granted that account
before it offers a run.

## 3. Configure it well

Defaults work, but audiences give much better feedback with context. Add, per type, in this
order of value:

1. **`channel` and `url`**: where the piece lives. Reuse the site's URL resolver if one exists.
   `url` receives `{document}` (a `Partial<SanityDocument>`, fields typed `unknown`), returns the
   absolute public URL or `null` while the slug is missing. Always use the production origin, not
   a preview host: audiences are told this is where the content is or will be.
2. **`defaults.source`**: who publishes it, e.g. `'Acme, the company that makes the product being
discussed'`. Without it audiences spend their answer wondering whether this is vendor content.
3. **`audiences`**: only if the user knows which audience slugs a type is for. Otherwise leave it;
   editors can narrow per run from the panel's options.
4. **`compare`**: leave the default (`'published'`) unless the type is never revised in place, in
   which case `'none'` removes a toggle editors would never use.
5. **`serialize`**: only when the built-in serializer misses the point of the type: page-builder
   arrays, meaning carried by custom blocks, unusual field names. Start from `defaultSerialize`
   and add to it. Return `{title?, content}` as markdown or `null` for "not ready". Never include
   asset URLs or raw JSON in `content`.
6. **`question`**: rarely. Only when the user wants a specific task framed ("would you forward
   this and to whom?").

Use `defineResonanceDocument({...})` for each configured type so the object is type-checked
outside the `resonance()` call. Everything in `defaults` applies to all types; per-type fields
override it.

Example for a site with a blog and docs:

```ts
import {defineResonanceDocument, resonance} from '@sanity-labs/sanity-plugin-resonance'

const post = defineResonanceDocument({
  type: 'post',
  channel: 'the Acme blog',
  url: ({document}) => {
    const slug = document.slug as {current?: string} | undefined
    return slug?.current ? `https://www.acme.com/blog/${slug.current}` : null
  },
})

const article = defineResonanceDocument({
  type: 'article',
  channel: 'the Acme documentation',
  audiences: ['developer', 'technical-leader'],
  compare: 'none',
})

resonance({
  apiUrl: 'https://resonance.cx',
  accountUid: '<the Resonance account uid>',
  defaults: {source: 'Acme, the company that makes the product being discussed'},
  documents: [post, article],
})
```

Read `docs/configuration.md` in the repo for every option, the exact request, and how the prompt
is composed, if you need to explain or extend any of this.

## 4. Verify

1. Start the Studio (`sanity dev`), open a document of a configured type, and confirm the
   **Resonance** button appears in the header next to Comments.
2. Open the panel. It should reach the **Audience test** card. If it shows an access state
   instead, go to section 5.
3. Optionally run one test on a real document and confirm audiences come back with scores. Each
   run costs the Resonance account simulations; do not loop runs while debugging. Running the
   same content twice returns the same test, so a repeat is cheap.
4. Check the options cog: the audience list should show the account's audiences; the compare
   toggle appears only when a draft differs from a published version.

## 5. Diagnose access states

The panel shows one of these instead of the run card when something is missing. Each has a
concrete owner; tell the user who needs to act. There are no server settings to change from the
Studio side.

| Panel says                                     | Cause                                                                     | Fix                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Sign in again to use Resonance.                | The Studio session has no token to forward.                               | Editor signs out and back in. If it persists and `sanity < 5.30`, set `auth: {loginMethod: 'token'}`.    |
| Couldn't reach Resonance.                      | The request got no response (Resonance down, wrong `apiUrl`, or network). | The editor retries; if it persists, the Studio owner checks `apiUrl`, then the user's Resonance contact. |
| Resonance couldn't verify your Sanity session. | Resonance rejected the session.                                           | Editor signs out and in; if it persists, the user's Resonance contact.                                   |
| You're not in Resonance yet.                   | The editor's email has no access to a Resonance account.                  | The user's Resonance contact grants the email. The panel's button copies a ready message.                |
| This account has no audiences yet.             | The Resonance account has no audiences defined.                           | Define audiences in Resonance.                                                                           |

`docs/auth.md` in the repo explains the model. The plugin never holds a Resonance credential; it
forwards the editor's own Sanity session, which Resonance verifies and then authorises by email.
Do not suggest putting a Resonance API key or any other secret in the Studio.

## 6. Things not to do

- Do not add Resonance to schema types that are not read as content (settings, navigation,
  taxonomies, redirects).
- Do not put secrets in `sanity.config.ts` or `SANITY_STUDIO_*` variables; the plugin needs none.
- Do not use an `http://` `apiUrl` for anything but `localhost`; the plugin rejects it.
- Do not disable the compare default globally to "simplify"; it is the more useful run when
  editing live content, and the toggle only appears when it applies.
- Do not write a custom `serialize` before checking what the default produces for the type.
