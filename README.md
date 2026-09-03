# @sanity-labs/sanity-plugin-resonance

Ask your audiences what they think of a piece of content before you publish it, from inside
Sanity Studio.

> **Status: pre-alpha.** This is experimental software from
> [Sanity Labs](https://github.com/sanity-labs). The configuration, the panel, and the prompt it
> sends can change at any time without notice, and it depends on a Resonance deployment that has
> been set up to accept Studio sessions. Use it to try things, not to build on yet. If you do
> try it, tell us what you wanted it to do and didn't.

## What it does

This plugin puts your [Resonance](https://resonance.cx/) audiences one click away from the
document an editor is working on.

Open a document, click **Resonance** in the header, and run an audience test. Each audience reads
the content as it stands right now, including unpublished changes, and comes back with a score
from 1 (not for me) to 5 (I would read, save, or share this), an explanation in its own voice,
and a short list of what would move the score. Results arrive as each audience finishes, usually
within a minute. If the piece is already live, the audiences are also told what changed, so the
feedback is about the revision rather than the whole article.

The last run is remembered per document, so reopening the panel shows what the audiences said
last time and whether the content has changed since.

## Install

```sh
npm install @sanity-labs/sanity-plugin-resonance
```

Not on npm yet. Until it is, clone this repository and link it into your Studio as described in
[docs/development.md](docs/development.md).

```ts
// sanity.config.ts
import {resonance} from '@sanity-labs/sanity-plugin-resonance'
import {defineConfig} from 'sanity'

export default defineConfig({
  // ...
  plugins: [
    resonance({
      apiUrl: 'https://resonance.cx',
      documents: ['post', 'article'],
    }),
  ],
})
```

That is the whole default setup. Editors get:

- A **Resonance** button on `post` and `article` documents and nowhere else.
- Content converted to text automatically from the schema: the title, a standfirst if there is
  one, and every Portable Text field in order. Images, embeds and custom blocks become short
  placeholders, so nothing but the words goes out.
- Comparison with the published version whenever they test a draft of something that is live.
- Every audience on the Resonance account, and Resonance's own neutral prompt.

Before anyone can run a test, Resonance must accept Sanity Studio sessions, and each editor's
email must have access to a Resonance account. Your Resonance contact sets that up; the panel
tells editors when access is missing and gives them something to send.
[docs/auth.md](docs/auth.md) has the details. The Studio itself needs `sanity` 5.30 or newer.

## Make it better

Audiences give sharper feedback when they know where they are reading, who is talking, and what
changed. Everything below is optional and applies per document type. Turn a type name in
`documents` into a `defineResonanceDocument({...})` and add what you know. Anything shared by
every type goes in `defaults`.

### Tell audiences where it lives

```ts
import {defineResonanceDocument, resonance} from '@sanity-labs/sanity-plugin-resonance'

resonance({
  apiUrl: 'https://resonance.cx',
  documents: [
    defineResonanceDocument({
      type: 'post',
      channel: 'the Sanity blog',
      url: ({document}) => {
        const slug = document.slug as {current?: string} | undefined
        return slug?.current ? `https://www.sanity.io/blog/${slug.current}` : null
      },
    }),
  ],
})
```

Audiences are then told they came across the piece "on the Sanity blog (https://…)". For a
draft, the URL is where it _will_ be; when comparing, it is where the earlier version is live.
Return `null` from `url` while the slug is empty.

### Say who publishes it

```ts
resonance({
  apiUrl: 'https://resonance.cx',
  defaults: {
    source: 'Sanity, the company that makes the product being discussed',
  },
  documents: ['post', 'article'],
})
```

Readers weigh vendor content differently from an independent review. Without this, audiences
tend to spend part of their answer asking who wrote it.

### Choose the audiences

```ts
defineResonanceDocument({
  type: 'article',
  audiences: ['developer', 'technical-leader'],
})
```

Audience slugs come from your Resonance account. Editors can narrow the list further per run
from the panel's options; the plugin config sets the starting point.

### Control the comparison

```ts
defineResonanceDocument({type: 'post', compare: 'none'})
```

`'published'` (the default) compares a draft against the live version when they differ.
`'none'` never compares. A function can return the earlier text from anywhere, for example a
`previousSummary` field.

### Bring your own text

```ts
import {defaultSerialize, defineResonanceDocument} from '@sanity-labs/sanity-plugin-resonance'

defineResonanceDocument({
  type: 'landingPage',
  serialize: (document, ctx) => {
    const base = defaultSerialize(document, ctx)
    if (!base) return null
    const promise = typeof document.promise === 'string' ? `\n\n> ${document.promise}` : ''
    return {...base, content: `${base.content}${promise}`}
  },
})
```

Use this when the automatic conversion misses the point of a type: a page built from modules,
a custom block that carries the meaning, fields with unusual names. Return `{title?, content}`
as markdown or plain text, or `null` when there is nothing to review yet.

### Write the prompt yourself

```ts
defineResonanceDocument({
  type: 'post',
  channel: 'the Sanity blog',
  question: ({channel, comparing}) =>
    `A colleague sent you this from ${channel}.${
      comparing ? ' The earlier version is what they sent last week.' : ''
    } Would you forward it, and to whom?`,
})
```

A string is sent as is. A function gets the resolved `channel`, `url`, `source`, `comparing` and
the document, and replaces the plugin's composed prompt.

### A complete example

```ts
import {defineResonanceDocument, resonance} from '@sanity-labs/sanity-plugin-resonance'
import {defineConfig} from 'sanity'

const post = defineResonanceDocument({
  type: 'post',
  channel: 'the Sanity blog',
  url: ({document}) => {
    const slug = document.slug as {current?: string} | undefined
    return slug?.current ? `https://www.sanity.io/blog/${slug.current}` : null
  },
})

const article = defineResonanceDocument({
  type: 'article',
  channel: 'the Sanity documentation',
  audiences: ['developer', 'technical-leader'],
  compare: 'none',
})

export default defineConfig({
  // ...
  plugins: [
    resonance({
      apiUrl: 'https://resonance.cx',
      defaults: {
        source: 'Sanity, the company that makes the product being discussed',
      },
      documents: [post, article],
      requestAccess: {
        label: 'Ask the content team',
        href: 'https://your-workspace.slack.com/…',
      },
    }),
  ],
})
```

Every option is listed in [docs/configuration.md](docs/configuration.md).

## How it works

When an editor runs a test, the plugin turns the displayed document into text with the type's
serializer, works out what the audiences should be told about where it lives and what changed,
and sends one request to Resonance. Resonance puts it in front of each audience and the panel
polls until they have all answered.

What the audiences see is the text plus a short framing, built from what you configured:

> You have come across this on the Sanity blog (https://www.sanity.io/blog/…) in the course of
> your work. It is published by Sanity, the company that makes the product being discussed. The
> earlier version is what is currently live there; the new version is an unpublished revision.
> Read it and react to it as yourself.

Configure nothing and only Resonance's neutral prompt is used. Draft status is never mentioned
unless a comparison is being made.

Running the same content with the same settings twice returns the same test rather than asking
the audiences again. Change the text, the compare setting, the audiences, or the framing, and
you get a fresh run.

Requests go straight from the editor's browser to Resonance, authenticated with the editor's own
Sanity session; there is no Resonance credential in the Studio, and the Sanity token is sent
nowhere but Resonance. The plugin stores nothing except, in the browser, which test ran last for
each document and the editor's option choices. [docs/auth.md](docs/auth.md) explains the model
and what needs to be in place on the Resonance side.

## The panel

- **Audience test** card: a one-line explanation and the **Run audience test** button. The cog
  opens options: **Compare with the published version** (only offered when a live version exists
  and differs) and the list of audiences to send to, all selected by default. Choices are
  remembered.
- **Content has changed since the audiences last tested it.** appears under the card when the
  document no longer matches the last run.
- While running: "3 of 5 audiences have responded" and a provisional score.
- Results: the mean score ("3.4 / 5 score across 5 audiences"), then one card per audience with
  its verdict and score ("Great — 4/5"), its reasoning, and a collapsed **Recommendations** list.
  Audiences that could not finish say so.

If something is not set up yet, the panel shows a short explanation instead of the run card:

| You see                                        | It means                                                                                               | What to do                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Sign in again to use Resonance.                | This Studio session has no token Resonance can use.                                                    | Sign out of the Studio and back in.                                        |
| Couldn't reach Resonance.                      | The request got no response (Resonance is down, the `apiUrl` is wrong, or the network is blocking it). | Retry. If it persists, check `apiUrl`, then your Resonance contact.        |
| Resonance couldn't verify your Sanity session. | Resonance rejected the session.                                                                        | Sign out and in; if it persists, tell your Resonance contact.              |
| You're not in Resonance yet.                   | Your email has not been granted a Resonance account.                                                   | **Ask for access** opens your configured link or copies a message to send. |
| Which Resonance account?                       | You have access to more than one.                                                                      | Pick one; it is remembered.                                                |
| This account has no audiences yet.             | Resonance has no audiences defined for this account.                                                   | Define them in Resonance first.                                            |

## Docs

- [docs/configuration.md](docs/configuration.md): every option, the document config, context
  types, the exact request, how the prompt is composed, and the idempotency rule.
- [docs/auth.md](docs/auth.md): how the Studio authenticates to Resonance, what needs to be in
  place on the Resonance side, and what editors see when something is missing.
- [docs/development.md](docs/development.md): building the plugin, trying it in a Studio with
  hot reload, and the toolchain quirks.
- [skills/sanity-plugin-resonance/SKILL.md](skills/sanity-plugin-resonance/SKILL.md): an agent skill for installing and configuring the plugin.
  `npx skills add sanity-labs/sanity-plugin-resonance`.

## License

[MIT](LICENSE) © Sanity Labs
