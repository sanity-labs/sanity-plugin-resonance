import type {ObjectSchemaType, SanityDocument} from 'sanity'

/**
 * The text a host hands to Resonance for one document.
 *
 * @public
 */
export interface SerializedContent {
  /** At most 200 characters. A label for the test list; audiences never see it. */
  title?: string
  /** Markdown or plain text, at most 100,000 bytes of UTF-8. */
  content: string
}

/**
 * Which version of the document the pane is showing.
 *
 * @public
 */
export type ResonanceDocumentVariant = 'draft' | 'published' | 'version'

/**
 * What the plugin knows about the displayed document when it serializes it, computes its URL,
 * or builds the prompt.
 *
 * @public
 */
export interface ResonanceDocumentContext {
  /** The compiled schema type of the document, from `useSchema().get(type)`. */
  schemaType: ObjectSchemaType
  /** What the pane displays: the draft, the published document, or a release version. */
  document: Partial<SanityDocument>
  /** The published document, when one exists. */
  published: Partial<SanityDocument> | null
  variant: ResonanceDocumentVariant
  projectId: string
  dataset: string
}

/**
 * Built-in comparison modes. `'published'` sends the published version as the earlier version
 * whenever the displayed document differs from it; `'none'` never compares.
 *
 * @public
 */
export type ResonanceCompareMode = 'published' | 'none'

/**
 * Converts a document to the text audiences read. Return `null` when the document is not ready
 * to be reviewed.
 *
 * @public
 */
export type ResonanceSerializer = (
  document: Partial<SanityDocument>,
  ctx: ResonanceDocumentContext,
) => SerializedContent | null

/**
 * Where a document is (or would be) published. Return `null` when it cannot be computed yet.
 *
 * @public
 */
export type ResonanceUrlResolver = (ctx: ResonanceDocumentContext) => string | null

/**
 * How one document type is put in front of an audience.
 *
 * @public
 */
export interface ResonanceDocumentConfig {
  /** Schema type name. */
  type: string
  /** Human name of where this lives, e.g. `'the Sanity blog'`. Used in the framing sentence. */
  channel?: string
  /** Where the document is (or would be) published; overrides `defaults.url`. */
  url?: ResonanceUrlResolver
  /** Who publishes it; overrides `defaults.source`. */
  source?: string
  /** Converts the document to text; overrides `defaults.serialize` and the built-in serializer. */
  serialize?: ResonanceSerializer
  /**
   * What the audience read before. `'published'` sends the published version when the displayed
   * one differs from it; `'none'` never compares.
   */
  compare?: ResonanceCompareMode
  /** Replaces the plugin's composed prompt with this text. */
  question?: string
  /** Persona slugs this type is tested against. Omit for every audience on the account. */
  audiences?: string[]
}

/**
 * Plugin-wide defaults. Any per-document setting overrides these.
 *
 * @public
 */
export interface ResonanceDefaults {
  /** Defaults to `'published'`. */
  compare?: ResonanceCompareMode
  /** Who publishes the content, e.g. `'Sanity, the company that makes the product being discussed'`. */
  source?: string
  /** Prompt for every type. Omit to let the plugin compose one from the framing. */
  question?: string
  /** Serializer for every type. Omit to use the built-in serializer. */
  serialize?: ResonanceSerializer
  /** URL resolver for every type. */
  url?: ResonanceUrlResolver
}

/**
 * Options for the `resonance` plugin.
 *
 * @public
 */
export interface ResonancePluginOptions {
  /**
   * Resonance base URL. Defaults to `https://resonance.cx`. `https:` is required, except
   * `http://localhost` or `http://127.0.0.1` (any port).
   */
  apiUrl?: string
  /**
   * Which schema types get the inspector and how each is put in front of an audience. A bare
   * string uses the defaults for that type.
   */
  documents: Array<string | ResonanceDocumentConfig>
  /** Plugin-wide defaults; any per-document setting overrides these. */
  defaults?: ResonanceDefaults
  /**
   * The Resonance account this Studio tests against. The panel checks the signed-in editor is
   * granted this account before it offers a run.
   */
  accountUid: string
  /** Skip the `/projects/{projectId}` lookup. */
  organizationId?: string
  /** Panel and button label. Defaults to "Resonance". */
  title?: string
}

/** Where the plugin points when `apiUrl` is omitted. */
export const DEFAULT_API_URL = 'https://resonance.cx'

/** Plugin options after defaults have been applied; what the inspector works with. */
export type ResolvedPluginOptions = ResonancePluginOptions & {apiUrl: string}

export function resolveOptions(options: ResonancePluginOptions): ResolvedPluginOptions {
  return {...options, apiUrl: options.apiUrl ?? DEFAULT_API_URL}
}

/** Server-side limit on `content` and `compareTo`, mirrored client-side to avoid a 400. */
export const MAX_CONTENT_BYTES = 100_000

/** Server-side limit on `title`. */
export const MAX_TITLE_LENGTH = 200

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1'])
const COMPARE_MODES: ReadonlySet<string> = new Set<ResonanceCompareMode>(['published', 'none'])

/**
 * Accepts `https:` anywhere and `http:` only for loopback hosts, so a Sanity session token is
 * never sent in clear text to a remote host.
 */
export function validateApiUrl(apiUrl: unknown): URL {
  if (typeof apiUrl !== 'string' || apiUrl.trim() === '') {
    throw new Error('resonance: `apiUrl` must be a non-empty string.')
  }

  let url: URL
  try {
    url = new URL(apiUrl)
  } catch {
    throw new Error(`resonance: \`apiUrl\` is not a valid URL: ${apiUrl}`)
  }

  if (url.protocol === 'https:') return url
  if (url.protocol === 'http:' && LOCAL_HOSTNAMES.has(url.hostname)) return url

  throw new Error(
    `resonance: \`apiUrl\` must use https (http is only allowed for localhost or 127.0.0.1), got ${apiUrl}`,
  )
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateQuestion(question: unknown, where: string): void {
  if (question === undefined || typeof question === 'string') return
  throw new Error(`resonance: ${where} \`question\` must be a string.`)
}

function validateCompare(compare: unknown, where: string): void {
  if (compare === undefined) return
  if (typeof compare === 'string' && COMPARE_MODES.has(compare)) return
  throw new Error(`resonance: ${where} \`compare\` must be 'published' or 'none'.`)
}

function validateSerialize(serialize: unknown, where: string): void {
  if (serialize === undefined || typeof serialize === 'function') return
  throw new Error(
    `resonance: ${where} \`serialize\` must be a function returning {content} or null.`,
  )
}

function validateUrl(url: unknown, where: string): void {
  if (url === undefined || typeof url === 'function') return
  throw new Error(`resonance: ${where} \`url\` must be a function returning a URL or null.`)
}

function validateAudiences(audiences: unknown, where: string): void {
  if (audiences === undefined) return
  if (Array.isArray(audiences) && audiences.every(isNonEmptyString)) return
  throw new Error(`resonance: ${where} \`audiences\` must be an array of persona slugs.`)
}

function validateDefaults(defaults: unknown): void {
  if (defaults === undefined) return
  if (!isRecord(defaults)) {
    throw new Error('resonance: `defaults` must be an object when provided.')
  }
  validateCompare(defaults.compare, '`defaults`')
  if (defaults.source !== undefined && typeof defaults.source !== 'string') {
    throw new Error('resonance: `defaults.source` must be a string when provided.')
  }
  validateQuestion(defaults.question, '`defaults`')
  validateSerialize(defaults.serialize, '`defaults`')
  validateUrl(defaults.url, '`defaults`')
}

function validateDocument(entry: unknown, index: number): string {
  if (isNonEmptyString(entry)) return entry

  if (!isRecord(entry) || !isNonEmptyString(entry.type)) {
    throw new Error(
      `resonance: \`documents[${index}]\` must be a document type name or an object with a non-empty \`type\`.`,
    )
  }

  const where = `document type "${entry.type}":`
  if (entry.channel !== undefined && typeof entry.channel !== 'string') {
    throw new Error(`resonance: ${where} \`channel\` must be a string when provided.`)
  }
  if (entry.source !== undefined && typeof entry.source !== 'string') {
    throw new Error(`resonance: ${where} \`source\` must be a string when provided.`)
  }
  validateUrl(entry.url, where)
  validateSerialize(entry.serialize, where)
  validateCompare(entry.compare, where)
  validateQuestion(entry.question, where)
  validateAudiences(entry.audiences, where)

  return entry.type
}

/** Runs at `definePlugin` time; accepts a loose shape so JavaScript hosts get the same messages. */
export function validateOptions(options: Partial<ResonancePluginOptions> | undefined): void {
  if (!options || typeof options !== 'object') {
    throw new Error(
      'resonance: plugin options are required, e.g. resonance({apiUrl, accountUid, documents}).',
    )
  }

  if (options.apiUrl !== undefined) validateApiUrl(options.apiUrl)

  if (!Array.isArray(options.documents) || options.documents.length === 0) {
    throw new Error(
      'resonance: `documents` must be a non-empty array of document type names or {type, ...} objects.',
    )
  }

  const seen = new Set<string>()
  options.documents.forEach((entry, index) => {
    const type = validateDocument(entry, index)
    if (seen.has(type)) {
      throw new Error(
        `resonance: document type "${type}" is listed more than once in \`documents\`.`,
      )
    }
    seen.add(type)
  })

  validateDefaults(options.defaults)

  if (!isNonEmptyString(options.accountUid) || options.accountUid.trim() === '') {
    throw new Error(
      'resonance: `accountUid` is required: the uid of the Resonance account this Studio tests against.',
    )
  }

  if (options.organizationId !== undefined && typeof options.organizationId !== 'string') {
    throw new Error('resonance: `organizationId` must be a string when provided.')
  }

  if (options.title !== undefined && typeof options.title !== 'string') {
    throw new Error('resonance: `title` must be a string when provided.')
  }
}
