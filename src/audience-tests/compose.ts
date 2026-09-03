import {MAX_TITLE_LENGTH, type ResonanceDocumentContext, type SerializedContent} from '../options'
import type {ResolvedDocumentConfig} from '../resolve-documents'

/** The three framing values the prompt is built from, after resolution. */
export interface Framing {
  channel: string | null
  url: string | null
  source: string | null
}

/**
 * Inputs that define one run, in the order both the `Idempotency-Key` and the remembered
 * content hash use them: content, earlier version, prompt, audiences.
 */
export type RunKeyParts = [content: string, compareTo: string, question: string, audiences: string]

/** The request the panel would send, plus what it needs to explain and remember it. */
export interface ComposedRequest {
  title?: string
  content: string
  /** The earlier version, present only while comparing. */
  compareTo?: string
  question?: string
  /** Persona slugs, present only when the type is limited to some audiences. */
  personas?: string[]
  /** An earlier version exists for this document; the editor's toggle decides if it is sent. */
  canCompare: boolean
  comparing: boolean
  framing: Framing
  /** The larger of `content` and `compareTo`, in bytes of UTF-8. */
  bytes: number
  keyParts: RunKeyParts
}

export type Composition =
  | {status: 'ready'; request: ComposedRequest}
  /** The serializer returned `null`: nothing to review yet. */
  | {status: 'empty'}
  /** A host function threw. */
  | {status: 'failed'; message: string}

export interface ComposeInput {
  config: ResolvedDocumentConfig
  ctx: ResonanceDocumentContext
  /** The editor's "compare with the published version" choice. Ignored when there is nothing to compare. */
  compareEnabled: boolean
  /**
   * The editor's audience pick from the options panel. `null` or omitted keeps the host's
   * configured audiences (or all of them). An empty array is a valid choice and is sent as-is so
   * the caller can block the run.
   */
  audiences?: string[] | null
}

const encoder = typeof TextEncoder === 'undefined' ? null : new TextEncoder()

export function byteLength(text: string): number {
  return encoder ? encoder.encode(text).length : text.length
}

function nonEmpty(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/**
 * The earlier version to offer, or `null`. With `'published'` that is the published document
 * serialized the same way, and only when it reads differently from what is displayed.
 */
export function resolveCompareCandidate(
  config: ResolvedDocumentConfig,
  ctx: ResonanceDocumentContext,
  content: string,
): string | null {
  if (config.compare === 'none') return null
  if (ctx.variant === 'published' || !ctx.published) return null
  const earlier = config.serialize(ctx.published, {
    ...ctx,
    document: ctx.published,
    variant: 'published',
  })
  if (!earlier || earlier.content === content) return null
  return earlier.content
}

/**
 * The prompt the plugin writes when the host does not: where the reader found the piece, who
 * publishes it, what the two versions are, and what to do. Returns `undefined` when there is
 * nothing to say beyond the server's own neutral prompt.
 */
export function defaultQuestion({
  channel,
  url,
  source,
  comparing,
}: Framing & {comparing: boolean}): string | undefined {
  if (channel === null && url === null && source === null && !comparing) return undefined

  let where = ''
  if (channel && url) where = ` on ${channel} (${url})`
  else if (channel) where = ` on ${channel}`
  else if (url) where = ` at ${url}`

  const sentences = [`You have come across this${where} in the course of your work.`]
  if (source) sentences.push(`It is published by ${source}.`)
  if (comparing) {
    sentences.push(
      url
        ? 'The earlier version is what is currently live there; the new version is an unpublished revision.'
        : 'The earlier version is what was published; the new version is an unpublished revision.',
    )
  }
  sentences.push('Read it and react to it as yourself.')
  return sentences.join(' ')
}

/** The host's `question` when configured, otherwise {@link defaultQuestion}. */
export function composeQuestion(
  config: ResolvedDocumentConfig,
  framing: Framing & {comparing: boolean},
): string | undefined {
  return config.question ?? defaultQuestion(framing)
}

function failure(step: string, error: unknown): Composition {
  const reason = error instanceof Error && error.message ? error.message : String(error)
  return {status: 'failed', message: `${step} failed: ${reason}`}
}

/**
 * Builds everything the panel sends for the displayed document. Pure: the only inputs are the
 * resolved config, the document context, and the editor's compare toggle.
 */
export function composeRequest({
  config,
  ctx,
  compareEnabled,
  audiences = null,
}: ComposeInput): Composition {
  let serialized: SerializedContent | null
  try {
    serialized = config.serialize(ctx.document, ctx)
  } catch (error) {
    return failure('serialize()', error)
  }
  if (serialized === null) return {status: 'empty'}
  const {content} = serialized

  let candidate: string | null
  try {
    candidate = resolveCompareCandidate(config, ctx, content)
  } catch (error) {
    return failure('serialize() on the published version', error)
  }
  const comparing = compareEnabled && candidate !== null

  let url: string | null
  try {
    url = config.url ? nonEmpty(config.url(ctx)) : null
  } catch (error) {
    return failure('url()', error)
  }

  const framing: Framing = {channel: config.channel, url, source: config.source}

  const question = nonEmpty(composeQuestion(config, {...framing, comparing})) ?? undefined

  const chosen = audiences ?? config.audiences
  const personas = chosen && chosen.length > 0 ? chosen : undefined
  const compareTo = comparing && candidate !== null ? candidate : undefined
  const title = nonEmpty(serialized.title)?.slice(0, MAX_TITLE_LENGTH) ?? undefined

  return {
    status: 'ready',
    request: {
      ...(title ? {title} : {}),
      content,
      ...(compareTo ? {compareTo} : {}),
      ...(question ? {question} : {}),
      ...(personas ? {personas} : {}),
      canCompare: candidate !== null,
      comparing,
      framing,
      bytes: Math.max(byteLength(content), byteLength(compareTo ?? '')),
      keyParts: [content, compareTo ?? '', question ?? '', personas?.join(',') ?? ''],
    },
  }
}
