import {
  DefaultLinkRenderer,
  type PortableTextMarkRendererOptions,
  portableTextToMarkdown,
} from '@portabletext/markdown'
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

/** Fields whose name says they carry the block's label. Checked first, in this order. */
const LABEL_FIELDS = ['title', 'heading', 'name', 'label']

/** Fields that hold machine data (links, ids, presentation) rather than words for a reader. */
const TECHNICAL_FIELDS: ReadonlySet<string> = new Set([
  'asset',
  'href',
  'url',
  'link',
  'to',
  'reference',
  'slug',
  'id',
  'key',
  'language',
  'variant',
  'style',
  'layout',
  'align',
  'alignment',
  'size',
  'width',
  'height',
  'color',
  'tone',
  'icon',
  'mode',
  'version',
  'target',
  'rel',
  'hotspot',
  'crop',
])

const LOOKS_LIKE_URL_OR_ID = /^(https?:\/\/|\/|[A-Za-z0-9_-]{20,}$)/

/** Nested objects deeper than this are named, not read. */
const MAX_DESCRIBE_DEPTH = 3

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function isReadable(key: string, value: string): boolean {
  if (key.startsWith('_') || TECHNICAL_FIELDS.has(key)) return false
  const text = value.trim()
  return text !== '' && !LOOKS_LIKE_URL_OR_ID.test(text)
}

function isPortableTextValue(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.some((item) => isRecord(item) && item._type === 'block')
}

function fence(value: Record<string, unknown>): string | null {
  if (typeof value.code !== 'string' || value.code.trim() === '') return null
  const language = typeof value.language === 'string' ? value.language.trim() : ''
  const marker = value.code.includes('```') ? '````' : '```'
  return `${marker}${language}\n${value.code}\n${marker}`
}

function cellText(cell: unknown): string {
  if (typeof cell === 'string') return collapse(cell)
  if (isPortableTextValue(cell)) return collapse(renderPortableText(cell))
  if (isRecord(cell)) {
    const inner = cell.value ?? cell.text ?? cell.content
    if (typeof inner === 'string') return collapse(inner)
    if (isPortableTextValue(inner)) return collapse(renderPortableText(inner))
    return collapse(describe(cell, MAX_DESCRIBE_DEPTH).inline.join(' '))
  }
  return ''
}

/** Rows of cells as a GFM table; the first row is the header because GFM has no headerless form. */
function table(rows: unknown[]): string | null {
  const grid = rows
    .filter(isRecord)
    .map((row) => (Array.isArray(row.cells) ? row.cells.map(cellText) : []))
    .map((cells) => cells.map((cell) => cell.replace(/\|/g, '\\|')))
  const width = Math.max(0, ...grid.map((row) => row.length))
  if (width === 0 || !grid.some((row) => row.some(Boolean))) return null

  const line = (row: string[]) =>
    `| ${[...row, ...Array<string>(width - row.length).fill('')].join(' | ')} |`
  const [first, ...rest] = grid
  return [line(first ?? []), `|${' --- |'.repeat(width)}`, ...rest.map(line)].join('\n')
}

function isTableRows(value: unknown): value is unknown[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((row) => isRecord(row) && Array.isArray(row.cells))
  )
}

interface Description {
  /** Short readable strings, in field order, for the `[type: …]` line. */
  inline: string[]
  /** Fenced code and tables, which need their own lines. */
  blocks: string[]
}

/**
 * Reads the words out of an arbitrary object: its label fields first, then every string and
 * Portable Text field in order, recursing into nested objects and arrays. Code becomes a fence,
 * `rows`/`cells` become a table, images become a marker. Links, ids and presentation fields are
 * skipped, so no asset URLs or JSON ever appear.
 */
function describe(value: Record<string, unknown>, depth: number): Description {
  const out: Description = {inline: [], blocks: []}

  if (value._type === 'image' || 'asset' in value) {
    const alt = firstString(value.alt, value.caption, value.title)
    out.inline.push(alt ? `[image: ${collapse(alt)}]` : '[image]')
    return out
  }

  const codeBlock = fence(value)
  if (codeBlock) {
    const label = firstString(value.filename, value.title, value.label)
    if (label) out.inline.push(collapse(label))
    out.blocks.push(codeBlock)
    return out
  }

  for (const key of LABEL_FIELDS) {
    const label = value[key]
    if (typeof label === 'string' && isReadable(key, label)) {
      out.inline.push(collapse(label))
      break
    }
  }

  for (const [key, field] of Object.entries(value)) {
    if (LABEL_FIELDS.includes(key) || key.startsWith('_') || TECHNICAL_FIELDS.has(key)) continue

    if (typeof field === 'string') {
      if (isReadable(key, field)) out.inline.push(collapse(field))
      continue
    }

    if (isPortableTextValue(field)) {
      const text = renderPortableText(field)
      if (text) out.inline.push(collapse(text))
      continue
    }

    if (isTableRows(field)) {
      const rendered = table(field)
      if (rendered) out.blocks.push(rendered)
      continue
    }

    if (depth >= MAX_DESCRIBE_DEPTH) continue

    if (Array.isArray(field)) {
      for (const item of field) {
        if (typeof item === 'string') {
          if (isReadable(key, item)) out.inline.push(collapse(item))
        } else if (isRecord(item)) {
          const nested = describe(item, depth + 1)
          out.inline.push(...nested.inline)
          out.blocks.push(...nested.blocks)
        }
      }
      continue
    }

    if (isRecord(field)) {
      const nested = describe(field, depth + 1)
      out.inline.push(...nested.inline)
      out.blocks.push(...nested.blocks)
    }
  }

  return out
}

/**
 * Text for a non-text block: a `[type: what it says]` line built from the block's readable
 * fields, followed by any code or tables it carries. A block with nothing readable is still named
 * so the reader knows something was there.
 */
function describeObject({value}: {value: unknown}): string {
  if (!isRecord(value)) return ''
  const type = typeof value._type === 'string' && value._type !== '' ? value._type : 'object'
  const {inline, blocks} = describe(value, 0)

  if (value._type === 'image' || 'asset' in value) return inline.join(' ')
  if (type === 'code' && blocks.length > 0 && inline.length === 0) return blocks.join('\n\n')

  const line = inline.length > 0 ? `[${type}: ${inline.join(' — ')}]` : `[${type}]`
  return blocks.length > 0 ? [line, ...blocks].join('\n\n') : line
}

/**
 * `link` annotations carry `href` in most schemas and `url` in some; either way the audiences get
 * a markdown link, and a link with neither renders as its text.
 */
function renderLink(options: PortableTextMarkRendererOptions): string {
  const href = firstString(options.value?.href, options.value?.url)
  if (!href) return options.children
  return DefaultLinkRenderer({...options, value: {_type: 'link', href, title: undefined}})
}

function renderPortableText(value: unknown): string {
  if (!Array.isArray(value)) return ''
  const blocks = value.filter(
    (item): item is Record<string, unknown> & {_type: string} =>
      isRecord(item) && typeof item._type === 'string',
  )
  if (blocks.length === 0) return ''

  return portableTextToMarkdown(blocks, {
    marks: {link: renderLink},
    // The library has its own renderers for these; they print JSON when the shape differs from
    // what they expect, so every object type goes through the same describer.
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
