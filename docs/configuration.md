# Configuration reference

Every option, what the plugin sends, and the rules behind it. The [README](../README.md) is the
guided version of this; come here when you need the exact shape.

## `resonance(options)`

| Option           | Type                                       | Notes                                                                                                                                |
| ---------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `accountUid`     | `string`                                   | Required. The Resonance account this Studio tests against. The panel confirms the editor is granted it before offering a run.        |
| `documents`      | `Array<string \| ResonanceDocumentConfig>` | Required, non-empty, no type listed twice. A string is a type name with the defaults; an object configures one type (below).         |
| `defaults`       | `ResonanceDefaults?`                       | `{compare?, source?, question?, serialize?, url?}` applied to every type. Per-type values override these; built-ins fill the rest.   |
| `apiUrl`         | `string?`                                  | Resonance base URL. Defaults to `https://resonance.cx`. `https:` required; `http:` is accepted only for `localhost` and `127.0.0.1`. |
| `organizationId` | `string?`                                  | Skips the `/projects/{projectId}` lookup used to fill `X-Sanity-Organization-Id`.                                                    |
| `title`          | `string?`                                  | Panel and button label. Defaults to `Resonance`.                                                                                     |

Validation runs when the plugin is defined. Every message starts with `resonance:` and names the
offending document type, for example ``resonance: document type "post": `compare` must be
'published' or 'none'.`` A broken config fails the Studio at startup rather than
rendering a broken panel.

## `ResonanceDocumentConfig`

An element of `documents`. Wrap it in `defineResonanceDocument(config)` for type inference when
it lives outside the `resonance()` call; the helper returns its argument unchanged.

| Field       | Type                    | Default                             | Notes                                                                                                                            |
| ----------- | ----------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `type`      | `string`                | required                            | Schema type name.                                                                                                                |
| `channel`   | `string?`               | none                                | Human name of where it lives, e.g. `'the Sanity blog'`. Used in the framing sentence.                                            |
| `url`       | `ResonanceUrlResolver?` | `defaults.url`                      | Where the document is or will be published. Return `null` when it cannot be computed yet.                                        |
| `source`    | `string?`               | `defaults.source`                   | Who publishes it.                                                                                                                |
| `serialize` | `ResonanceSerializer?`  | `defaults.serialize` or built-in    | Converts the document to `{title?, content}`. Return `null` when not ready. Also used on the published version when comparing.   |
| `compare`   | `'published' \| 'none'` | `defaults.compare` or `'published'` | What the audience read before.                                                                                                   |
| `question`  | `string?`               | `defaults.question` or composed     | Sent verbatim in place of the composed prompt.                                                                                   |
| `audiences` | `string[]?`             | all                                 | Audience slugs sent as `personas`. The starting selection in the panel; editors can narrow it per run. An empty array means all. |

## Types

```ts
interface SerializedContent {
  title?: string // at most 200 characters; a label in Resonance's test list, never shown to audiences
  content: string // markdown or plain text, at most 100,000 bytes of UTF-8
}

interface ResonanceDocumentContext {
  schemaType: ObjectSchemaType // from useSchema().get(type)
  document: Partial<SanityDocument> // what the pane displays: draft, published, or release version
  published: Partial<SanityDocument> | null // editState.published
  variant: 'draft' | 'published' | 'version'
  projectId: string
  dataset: string
}

type ResonanceSerializer = (
  document: Partial<SanityDocument>,
  ctx: ResonanceDocumentContext,
) => SerializedContent | null

type ResonanceUrlResolver = (ctx: ResonanceDocumentContext) => string | null
```

`SanityDocument` has an `unknown` index signature, so field values need narrowing
(`document.slug as {current?: string} | undefined`, `typeof document.path === 'string'`), or use
your TypeGen types.

## The built-in serializer

`defaultSerialize(document, {schemaType})` walks the schema type's fields in order, one level
into plain object fields, and never follows references.

- The first `string` field named `title`, `name` or `headline` (in that priority) becomes a
  `# heading` and the `title` label. Top level first; a nested `author.name` cannot take the
  heading when the document has its own title.
- A field named `description`, `excerpt`, `subtitle`, `summary`, `lead` or `standfirst` becomes
  an italic standfirst.
- Every Portable Text array is rendered to markdown in schema order. Fields whose names start
  with `seo`, `meta` or `og`, and fields marked `hidden: true`, are skipped.
- Custom blocks become one `[type: what it says]` line built from the block's readable fields:
  its `title`/`heading`/`name`/`label` first, then every other string and Portable Text field in
  order, recursing into nested objects and arrays (cards, tabs, steps) up to three levels. Objects
  with a `code` string become fences, `rows` of `cells` become a GFM table (first row as header),
  images become `[image: alt]`. Links, ids, slugs, references, asset data and presentation fields
  (`style`, `tone`, `layout`, `size`, `color`, …) are skipped, as is any string that looks like a
  URL or an id. A block with nothing readable is still named (`[youtube]`). No asset URLs or JSON
  ever appear in the output.
- `link` annotations render as markdown links from `href` or `url`; a link with neither (an
  internal reference) renders as its text.
- Other `string`/`text` fields (slugs, dates, categories) are not content and are skipped.
- Returns `null` when nothing but a title was found.
- Over 100,000 bytes, the text is cut at a paragraph boundary with `[truncated for review]`
  appended.

Custom serializers can call `defaultSerialize` and add to its result, or ignore it. The same
serializer runs on the published version when comparing, with `ctx.variant === 'published'`.

## What is sent

`POST {apiUrl}/v1/orgs/{accountUid}/audience-tests`, with an `Idempotency-Key` header and a JSON
body:

```json
{
  "title": "Introducing Content Releases",
  "content": "# Introducing Content Releases\n\n_Schedule and preview…_\n\nToday we are…",
  "compareTo": "# Introducing Content Releases\n\n_Schedule…_\n\nLast month we…",
  "question": "You have come across this on the Sanity blog (https://www.sanity.io/blog/content-releases) in the course of your work. It is published by Sanity, the company that makes the product being discussed. The earlier version is what is currently live there; the new version is an unpublished revision. Read it and react to it as yourself.",
  "personas": ["developer", "technical-leader"]
}
```

`compareTo`, `question` and `personas` are omitted when there is nothing to compare, nothing to
add to Resonance's prompt, or no audience restriction. The panel then polls
`GET …/audience-tests/{id}` at the interval the server suggests until the test is terminal.

## How the prompt is composed

Unless the type has its own `question`, the plugin writes up to four sentences and joins them
with spaces:

1. `You have come across this{where} in the course of your work.` where `{where}` is empty,
   ` on {channel}`, ` at {url}`, or ` on {channel} ({url})`.
2. `It is published by {source}.` when a source is known.
3. When comparing: `The earlier version is what is currently live there; the new version is an
unpublished revision.` if there is a URL, otherwise `The earlier version is what was
published; the new version is an unpublished revision.`
4. `Read it and react to it as yourself.`

With no channel, URL or source and no comparison, no `question` is sent and Resonance applies its
own neutral prompt. Draft status is never mentioned unless a comparison is being made. Resonance
itself frames a comparison as "you read the earlier version some time ago; now you are reading
the new version; score the new version and say what the change did for you."

## How comparison works

With `compare: 'published'`, the plugin serializes the published document with the same
serializer whenever the pane shows a draft or release version. If the result differs from the
displayed content, the options offer "Compare with the published version", on by default. Turning
it off sends only `content` and drops the comparison sentence. Nothing is compared when the
document has never been published, when the draft reads the same as the published version, or
when the published version itself is displayed.

## Same inputs, same test

The `Idempotency-Key` is a SHA-256 over the account, the published document id, and then in
order: `content`, `compareTo` (or empty), `question` (or empty), and the audiences joined by
commas. Running the same thing twice returns the same test instead of spending another round of
simulations; editing the text, flipping the compare toggle, changing the audiences or the framing
produces a new run. The same digest is stored with the last run so the panel can say the content
has changed since.

## What is remembered in the browser

All in `localStorage`, all best-effort:

| Key                                                                         | Value                                          |
| --------------------------------------------------------------------------- | ---------------------------------------------- |
| `sanity-plugin-resonance:last:{host}:{projectId}:{dataset}:{documentId}`    | `{testId, accountUid, contentHash, createdAt}` |
| `sanity-plugin-resonance:compare:{host}:{projectId}:{dataset}:{documentId}` | the compare toggle                             |
| `sanity-plugin-resonance:audiences:{host}:{projectId}:{documentType}`       | the chosen audiences, or absent for "all"      |

`{host}` is the `apiUrl` host, so a Studio pointed at two Resonance deployments keeps separate
memories even when both know the same account.

## Exports

- `resonance(options)`: the plugin.
- `defineResonanceDocument(config)`: identity helper for a `ResonanceDocumentConfig`.
- `defaultSerialize(document, {schemaType})`: the built-in serializer. `schemaType` may be a full
  `ObjectSchemaType` or the subset it reads (`SerializableSchemaType`).
- Types: `ResonancePluginOptions`, `ResonanceDocumentConfig`, `ResonanceDefaults`,
  `ResonanceDocumentContext`, `ResonanceSerializer`, `ResonanceUrlResolver`,
  `ResonanceCompareMode`, `ResonanceDocumentVariant`, `SerializedContent`,
  `SerializableSchemaType`, `SerializableField`.

That is the whole public surface. The transport and the audience-test response types are internal
until a host needs them.
