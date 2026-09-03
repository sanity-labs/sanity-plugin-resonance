# Configuration reference

Every option, what the plugin sends, and the rules behind it. The [README](../README.md) is the
guided version of this; come here when you need the exact shape.

## `resonance(options)`

| Option           | Type                                       | Notes                                                                                                                                                       |
| ---------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiUrl`         | `string`                                   | Resonance base URL. `https:` required; `http:` is accepted only for `localhost` and `127.0.0.1`. Invalid values throw when the Studio config is evaluated.  |
| `documents`      | `Array<string \| ResonanceDocumentConfig>` | Required, non-empty, no type listed twice. A string is a type name with the defaults; an object configures one type (below).                                |
| `defaults`       | `ResonanceDefaults?`                       | `{compare?, source?, question?, audiences?}` applied to every type. Per-type values override these; built-ins fill the rest.                                |
| `accountUid`     | `string`                                   | Required. The Resonance account this Studio tests against. The panel confirms the editor is granted it before offering a run.                               |
| `organizationId` | `string?`                                  | Skips the `/projects/{projectId}` lookup used to fill `X-Sanity-Organization-Id`.                                                                           |
| `title`          | `string?`                                  | Panel and button label. Defaults to `Resonance`.                                                                                                            |
| `requestAccess`  | `{label: string; href: string}?`           | Target of the "Ask for access" button. When omitted, the button copies a prewritten message (with the editor's email, Studio origin, project, and dataset). |

Validation runs when the plugin is defined. Every message starts with `resonance:` and names the
offending document type, for example ``resonance: document type "post": `compare` must be
'published', 'none', or a function.`` A broken config fails the Studio at startup rather than
rendering a broken panel.

## `ResonanceDocumentConfig`

An element of `documents`. Wrap it in `defineResonanceDocument(config)` for type inference when
it lives outside the `resonance()` call; the helper returns its argument unchanged.

| Field       | Type                                                                                              | Default                             | Notes                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `type`      | `string`                                                                                          | required                            | Schema type name.                                                                                                                |
| `channel`   | `string?`                                                                                         | none                                | Human name of where it lives, e.g. `'the Sanity blog'`. Used in the framing sentence.                                            |
| `url`       | `(ctx: ResonanceDocumentContext) => string \| null`                                               | none                                | Where the document is or will be published. Return `null` when it cannot be computed yet.                                        |
| `source`    | `string?`                                                                                         | `defaults.source`                   | Who publishes it.                                                                                                                |
| `serialize` | `(document: Partial<SanityDocument>, ctx: ResonanceDocumentContext) => SerializedContent \| null` | built-in serializer                 | Converts the document to `{title?, content}`. Return `null` when not ready. Also used on the published version when comparing.   |
| `compare`   | `'published' \| 'none' \| ((ctx: ResonanceDocumentContext) => string \| null)`                    | `defaults.compare` or `'published'` | What the audience read before. A function returns the earlier text or `null`.                                                    |
| `question`  | `string \| ((ctx: ResonanceQuestionContext) => string)`                                           | `defaults.question` or composed     | A string is sent verbatim; a function replaces the composed prompt and receives the resolved framing.                            |
| `audiences` | `string[]?`                                                                                       | `defaults.audiences` or all         | Audience slugs sent as `personas`. The starting selection in the panel; editors can narrow it per run. An empty array means all. |

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

interface ResonanceQuestionContext extends ResonanceDocumentContext {
  channel: string | null
  url: string | null
  source: string | null
  comparing: boolean
}
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
- Custom blocks: objects with a `code` string become fenced code; images become `[image: alt]`;
  anything else becomes `[type]` or `[type: text]`. No asset URLs or JSON ever appear in the
  output.
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
when the published version itself is displayed. A `compare` function's non-empty result is
always offered.

## Same inputs, same test

The `Idempotency-Key` is a SHA-256 over the account, the published document id, and then in
order: `content`, `compareTo` (or empty), `question` (or empty), and the audiences joined by
commas. Running the same thing twice returns the same test instead of spending another round of
simulations; editing the text, flipping the compare toggle, changing the audiences or the framing
produces a new run. The same digest is stored with the last run so the panel can say the content
has changed since.

## What is remembered in the browser

All in `localStorage`, all best-effort:

| Key                                                                  | Value                                          |
| -------------------------------------------------------------------- | ---------------------------------------------- |
| `sanity-plugin-resonance:last:{projectId}:{dataset}:{documentId}`    | `{testId, accountUid, contentHash, createdAt}` |
| `sanity-plugin-resonance:compare:{projectId}:{dataset}:{documentId}` | the compare toggle                             |
| `sanity-plugin-resonance:audiences:{projectId}:{documentType}`       | the chosen audiences, or absent for "all"      |

## Exports

- `resonance(options)`: the plugin.
- `defineResonanceDocument(config)`: identity helper for a `ResonanceDocumentConfig`.
- `defaultSerialize(document, {schemaType})`: the built-in serializer. `schemaType` may be a full
  `ObjectSchemaType` or the subset it reads (`SerializableSchemaType`).
- `ResonanceApiError`: thrown by the transport. `kind: 'network'` (no response, `status: null`)
  or `kind: 'http'` (`status` set, `message` from the server's `{error}` body).
- `createResonanceFetch({apiUrl, getToken, getOrganizationId})`: the transport the plugin uses,
  for hosts that want to call other `/v1/orgs/…` routes with the same auth. Returns
  `(path, init?) => Promise<Response>` with a `.json<T>()` convenience.
- Types: `ResonancePluginOptions`, `ResonanceDocumentConfig`, `ResonanceDefaults`,
  `ResonanceDocumentContext`, `ResonanceQuestionContext`, `ResonanceQuestion`,
  `ResonanceCompareMode`, `ResonanceDocumentVariant`, `SerializedContent`,
  `SerializableSchemaType`, `SerializableField`, `RequestAccessLink`, `ResonanceAccount`,
  `ResonanceFetch`, `ResonanceFetchOptions`, `AudienceTestRead`, `AudienceTestPersonaResult`,
  `AudienceTestStatus`, `AudienceTestRunStatus`, `AudienceTestResonance`,
  `AudienceTestPersonaResponse`, `AudienceTestCreateInput`, `ResonanceScore`, `RunResonance`.
