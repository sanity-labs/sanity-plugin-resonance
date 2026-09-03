import {portableTextToMarkdown} from '@portabletext/markdown'
import type {SanityDocument} from 'sanity'

import {MAX_CONTENT_BYTES, MAX_TITLE_LENGTH, type SerializedContent} from '../options'

/**
 * The slice of a compiled Sanity schema type the serializer reads. `ObjectSchemaType` satisfies
 * it, and tests can hand-build it.
 *
 * @public
 */
export interface SerializableSchemaType {
  name?: string
  jsonType?: string
  /** Object types: the fields in schema order. */
  fields?: SerializableField[]
  /** Array types: the member types. */
  of?: SerializableSchemaType[]
  /** The type this one extends, for named types. */
  type?: SerializableSchemaType
  hidden?: unknown
}

/**
 * One field of a {@link SerializableSchemaType}.
 *
 * @public
 */
export interface SerializableField {
  name: string
  type: SerializableSchemaType
}

/** Field names that become the `# heading` and the test label, first match wins. */
const TITLE_FIELDS = ['title', 'name', 'headline']

/** Field names rendered as an italic standfirst paragraph. */
const STANDFIRST_FIELDS: ReadonlySet<string> = new Set([
  'description',
  'excerpt',
  'subtitle',
  'summary',
  'lead',
  'standfirst',
])

/** Fields that describe the page to machines rather than to readers. */
const SKIPPED_PREFIX = /^(seo|meta|og)/i

/** Object types that are containers for something other than editorial fields. */
const NOT_PLAIN_OBJECT: ReadonlySet<string> = new Set([
  'block',
  'span',
  'reference',
  'crossDatasetReference',
  'globalDocumentReference',
  'image',
  'file',
  'slug',
  'geopoint',
])

const TRUNCATION_NOTICE = '\n\n[truncated for review]'

const encoder = typeof TextEncoder === 'undefined' ? null : new TextEncoder()

function byteLength(text: string): number {
  return encoder ? encoder.encode(text).length : text.length
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return null
}

/** Names of a type and everything it extends, e.g. `['blockContent', 'array']`. */
function typeChain(type: SerializableSchemaType): string[] {
  const names: string[] = []
  let current: SerializableSchemaType | undefined = type
  // Compiled chains are short; the bound only guards against a malformed self-reference.
  for (let depth = 0; current && depth < 16; depth += 1) {
    if (typeof current.name === 'string') names.push(current.name)
    current = current.type
  }
  return names
}

function isBlockType(type: SerializableSchemaType): boolean {
  return typeChain(type).includes('block')
}

function memberTypes(type: SerializableSchemaType): SerializableSchemaType[] {
  let current: SerializableSchemaType | undefined = type
  for (let depth = 0; current && depth < 16; depth += 1) {
    if (Array.isArray(current.of)) return current.of
    current = current.type
  }
  return []
}

function isPortableText(type: SerializableSchemaType, value: unknown): boolean {
  if (memberTypes(type).some(isBlockType)) return true
  return Array.isArray(value) && value.some((item) => isRecord(item) && item._type === 'block')
}

function isPlainObject(type: SerializableSchemaType): boolean {
  return type.jsonType === 'object' && !typeChain(type).some((name) => NOT_PLAIN_OBJECT.has(name))
}

function isSkipped(field: SerializableField): boolean {
  return field.type.hidden === true || SKIPPED_PREFIX.test(field.name)
}

/**
 * Text for a non-text block. Code keeps its fence, images become a short marker, and anything
 * else is named so the reader knows something was there. No asset URLs, no JSON.
 */
function describeObject({value}: {value: unknown}): string {
  if (!isRecord(value)) return ''
  const type = typeof value._type === 'string' && value._type !== '' ? value._type : 'object'

  if (typeof value.code === 'string') {
    const language = typeof value.language === 'string' ? value.language.trim() : ''
    return `\`\`\`${language}\n${value.code}\n\`\`\``
  }

  if (type === 'image' || 'asset' in value) {
    return `[image: ${firstString(value.alt, value.caption) ?? ''}]`
  }

  const label = firstString(value.title, value.text, value.heading)
  return label ? `[${type}: ${label}]` : `[${type}]`
}

function renderPortableText(value: unknown): string {
  if (!Array.isArray(value)) return ''
  const blocks = value.filter(
    (item): item is Record<string, unknown> & {_type: string} =>
      isRecord(item) && typeof item._type === 'string',
  )
  if (blocks.length === 0) return ''

  return portableTextToMarkdown(blocks, {
    types: {
      image: describeObject,
      code: describeObject,
      html: describeObject,
      table: describeObject,
      callout: describeObject,
    },
    unknownType: describeObject,
  }).trim()
}

function isSingleParagraph(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== 1) return false
  const [block] = value
  return (
    isRecord(block) &&
    block._type === 'block' &&
    (block.style === undefined || block.style === 'normal') &&
    block.listItem === undefined
  )
}

interface TitleCandidate {
  depth: number
  priority: number
  value: string
}

interface Walk {
  titles: TitleCandidate[]
  parts: string[]
}

function walkFields(
  fields: SerializableField[],
  value: Record<string, unknown>,
  depth: number,
  out: Walk,
): void {
  for (const field of fields) {
    if (isSkipped(field)) continue
    const fieldValue = value[field.name]
    const {type} = field

    if (type.jsonType === 'string') {
      if (typeof fieldValue !== 'string' || fieldValue.trim() === '') continue
      const text = fieldValue.trim()
      const priority = TITLE_FIELDS.indexOf(field.name)
      if (priority !== -1) {
        out.titles.push({depth, priority, value: text})
      } else if (STANDFIRST_FIELDS.has(field.name)) {
        out.parts.push(`_${text}_`)
      }
      continue
    }

    if (type.jsonType === 'array') {
      if (!isPortableText(type, fieldValue)) continue
      const rendered = renderPortableText(fieldValue)
      if (rendered === '') continue
      const italic = STANDFIRST_FIELDS.has(field.name) && isSingleParagraph(fieldValue)
      out.parts.push(italic ? `_${rendered}_` : rendered)
      continue
    }

    if (depth === 0 && isPlainObject(type) && Array.isArray(type.fields) && isRecord(fieldValue)) {
      walkFields(type.fields, fieldValue, 1, out)
    }
  }
}

function pickTitle(candidates: TitleCandidate[]): string | null {
  if (candidates.length === 0) return null
  const [best] = [...candidates].sort((a, b) => a.depth - b.depth || a.priority - b.priority)
  return best.value
}

/** Cuts a single oversized string on a character boundary so it fits in `budget` bytes. */
function hardCut(text: string, budget: number): string {
  let low = 0
  let high = text.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (byteLength(text.slice(0, mid)) <= budget) low = mid
    else high = mid - 1
  }
  let cut = text.slice(0, low)
  const last = cut.charCodeAt(cut.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1)
  return cut
}

/**
 * Keeps whole paragraphs up to the byte cap and says so at the end. Exported for tests; the
 * serializer applies it to every result.
 */
export function capContent(content: string, maxBytes: number = MAX_CONTENT_BYTES): string {
  if (byteLength(content) <= maxBytes) return content

  const budget = maxBytes - byteLength(TRUNCATION_NOTICE)
  const kept: string[] = []
  let used = 0
  for (const paragraph of content.split('\n\n')) {
    const cost = byteLength(paragraph) + (kept.length > 0 ? 2 : 0)
    if (used + cost > budget) break
    kept.push(paragraph)
    used += cost
  }

  const body = kept.length > 0 ? kept.join('\n\n') : hardCut(content, budget)
  return `${body.trimEnd()}${TRUNCATION_NOTICE}`
}

/**
 * Turns a document into markdown by reading its schema: the title field becomes a heading,
 * standfirst-like fields an italic paragraph, and every Portable Text field is rendered in
 * schema order. Returns `null` when there is no body to review.
 */
export function serializeWithSchema(
  document: Partial<SanityDocument> | null | undefined,
  schemaType: SerializableSchemaType,
): SerializedContent | null {
  if (!isRecord(document)) return null

  const walk: Walk = {titles: [], parts: []}
  walkFields(Array.isArray(schemaType.fields) ? schemaType.fields : [], document, 0, walk)
  if (walk.parts.length === 0) return null

  const title = pickTitle(walk.titles)
  const sections = title ? [`# ${title}`, ...walk.parts] : walk.parts
  const content = capContent(sections.join('\n\n'))

  return title ? {title: title.slice(0, MAX_TITLE_LENGTH), content} : {content}
}

/**
 * The serializer used for any document type that does not bring its own. Hosts can call it from
 * a custom `serialize` and add to its output.
 *
 * @public
 */
export function defaultSerialize(
  document: Partial<SanityDocument>,
  ctx: {schemaType: SerializableSchemaType},
): SerializedContent | null {
  return serializeWithSchema(document, ctx.schemaType)
}
