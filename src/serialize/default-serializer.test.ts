import {describe, expect, it} from 'vitest'

import {MAX_CONTENT_BYTES} from '../options'
import {
  capContent,
  defaultSerialize,
  type SerializableField,
  type SerializableSchemaType,
  serializeWithSchema,
} from './default-serializer'

// Fixtures mirror the shape of a compiled Sanity schema: `field.name` is the field, `field.type`
// the (possibly named) type it uses, and named types point at what they extend via `type`.

const blockType: SerializableSchemaType = {name: 'block', jsonType: 'object'}
const imageType: SerializableSchemaType = {name: 'image', jsonType: 'object'}

function string(name: string, extra: Partial<SerializableSchemaType> = {}): SerializableField {
  return {name, type: {name: 'string', jsonType: 'string', ...extra}}
}

function text(name: string): SerializableField {
  return {name, type: {name: 'text', jsonType: 'string'}}
}

function portableText(
  name: string,
  extra: Partial<SerializableSchemaType> = {},
  of: SerializableSchemaType[] = [blockType, imageType],
): SerializableField {
  return {name, type: {name: 'array', jsonType: 'array', of, ...extra}}
}

/** A `blockContent` type declared once and reused, as most Studios do. */
function namedPortableText(name: string): SerializableField {
  return {
    name,
    type: {
      name: 'blockContent',
      jsonType: 'array',
      type: {name: 'array', jsonType: 'array', of: [blockType, imageType]},
    },
  }
}

function object(name: string, fields: SerializableField[]): SerializableField {
  return {name, type: {name: 'object', jsonType: 'object', fields}}
}

function slug(name: string): SerializableField {
  return {
    name,
    type: {name: 'slug', jsonType: 'object', fields: [string('current')]},
  }
}

function reference(name: string): SerializableField {
  return {
    name,
    type: {name: 'reference', jsonType: 'object', fields: [string('title')]},
  }
}

function schema(fields: SerializableField[]): SerializableSchemaType {
  return {name: 'post', jsonType: 'object', fields}
}

let keys = 0
function block(textValue: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  keys += 1
  return {
    _type: 'block',
    _key: `k${keys}`,
    style: 'normal',
    markDefs: [],
    children: [{_type: 'span', _key: `s${keys}`, text: textValue, marks: []}],
    ...extra,
  }
}

describe('serializeWithSchema', () => {
  it('makes the title a heading and the label, and needs a body to return anything', () => {
    const type = schema([string('title'), portableText('body')])
    expect(serializeWithSchema({title: 'Hello'}, type)).toBeNull()

    const result = serializeWithSchema({title: ' Hello ', body: [block('First.')]}, type)
    expect(result).toEqual({title: 'Hello', content: '# Hello\n\nFirst.'})
  })

  it('prefers title over name over headline, whatever the schema order', () => {
    const type = schema([string('headline'), string('name'), string('title'), portableText('body')])
    const doc = {headline: 'H', name: 'N', title: 'T', body: [block('x')]}
    expect(serializeWithSchema(doc, type)?.title).toBe('T')
    expect(serializeWithSchema({...doc, title: undefined}, type)?.title).toBe('N')
    expect(serializeWithSchema({headline: 'H', body: [block('x')]}, type)?.title).toBe('H')
  })

  it('caps the label at 200 characters but keeps the heading whole', () => {
    const long = 'x'.repeat(250)
    const result = serializeWithSchema(
      {title: long, body: [block('x')]},
      schema([string('title'), portableText('body')]),
    )
    expect(result?.title).toHaveLength(200)
    expect(result?.content.startsWith(`# ${long}`)).toBe(true)
  })

  it('renders standfirst-like fields in italics and counts them as content', () => {
    const type = schema([
      string('title'),
      text('excerpt'),
      string('subtitle'),
      portableText('body'),
    ])
    expect(serializeWithSchema({title: 'T', excerpt: 'Short version.'}, type)).toEqual({
      title: 'T',
      content: '# T\n\n_Short version._',
    })
    expect(
      serializeWithSchema({subtitle: 'Sub', excerpt: 'Ex', body: [block('Body.')]}, type)?.content,
    ).toBe('_Ex_\n\n_Sub_\n\nBody.')
  })

  it('italicises a one-paragraph Portable Text standfirst and leaves longer ones alone', () => {
    const type = schema([portableText('lead'), portableText('body')])
    expect(serializeWithSchema({lead: [block('One line.')]}, type)?.content).toBe('_One line._')
    expect(serializeWithSchema({lead: [block('One.'), block('Two.')]}, type)?.content).toBe(
      'One.\n\nTwo.',
    )
    expect(serializeWithSchema({lead: [block('Head', {style: 'h2'})]}, type)?.content).toBe(
      '## Head',
    )
  })

  it('renders every Portable Text field in schema order, including named types and nested objects', () => {
    const type = schema([
      portableText('intro'),
      object('hero', [string('title'), portableText('copy')]),
      namedPortableText('body'),
      reference('author'),
      slug('slug'),
      string('category'),
      string('title'),
    ])
    const result = serializeWithSchema(
      {
        title: 'Post',
        category: 'news',
        slug: {current: 'post'},
        author: {title: 'Not followed', _ref: 'x'},
        hero: {title: 'Hero title', copy: [block('Hero copy.')]},
        body: [block('Body.', {style: 'h2'}), block('Second paragraph.')],
        intro: [block('Intro.')],
      },
      type,
    )
    expect(result?.title).toBe('Post')
    expect(result?.content).toBe('# Post\n\nIntro.\n\nHero copy.\n\n## Body.\n\nSecond paragraph.')
  })

  it('falls back to a nested title when the top level has none', () => {
    const type = schema([object('hero', [string('headline')]), portableText('body')])
    const result = serializeWithSchema({hero: {headline: 'Nested'}, body: [block('x')]}, type)
    expect(result?.title).toBe('Nested')
  })

  it('recognises Portable Text by value when the schema does not say', () => {
    const type = schema([portableText('content', {}, [{name: 'object', jsonType: 'object'}])])
    expect(serializeWithSchema({content: [block('By value.')]}, type)?.content).toBe('By value.')
    expect(serializeWithSchema({content: [{_type: 'thing', _key: 'a'}]}, type)).toBeNull()
  })

  it('describes custom blocks without JSON or asset URLs', () => {
    const type = schema([portableText('body')])
    const result = serializeWithSchema(
      {
        body: [
          block('Before.'),
          {_type: 'code', _key: 'c', language: 'ts', code: 'const a = 1'},
          {_type: 'image', _key: 'i', asset: {_ref: 'image-abc-100x100-png'}, alt: 'A cat'},
          {_type: 'figure', _key: 'f', asset: {_ref: 'image-def'}, caption: 'Captioned'},
          {_type: 'callToAction', _key: 'cta', text: 'Try it', href: 'https://x.test'},
          {_type: 'embed', _key: 'e', url: 'https://x.test/v'},
          {_type: 'table', _key: 't', rows: 'malformed'},
          block('After.'),
        ],
      },
      type,
    )
    expect(result?.content).toBe(
      [
        'Before.',
        '```ts\nconst a = 1\n```',
        '[image: A cat]',
        '[image: Captioned]',
        '[callToAction: Try it]',
        '[embed]',
        '[table]',
        'After.',
      ].join('\n\n'),
    )
    expect(result?.content).not.toMatch(/image-abc|_ref|\{/)
  })

  it('describes inline objects in place', () => {
    const type = schema([portableText('body')])
    const result = serializeWithSchema(
      {
        body: [
          block('', {
            children: [
              {_type: 'span', _key: 'a', text: 'See ', marks: []},
              {_type: 'productRef', _key: 'b', title: 'Studio'},
              {_type: 'span', _key: 'c', text: '.', marks: []},
            ],
          }),
        ],
      },
      type,
    )
    expect(result?.content).toBe('See [productRef: Studio].')
  })

  it('skips hidden fields and anything that starts with seo, meta, or og', () => {
    const type = schema([
      string('title'),
      portableText('seoBody'),
      portableText('metaDescription'),
      portableText('ogText'),
      object('seo', [string('description')]),
      portableText('hidden', {hidden: true}),
      portableText('conditional', {hidden: () => true}),
      string('description', {hidden: true}),
      portableText('body'),
    ])
    const filler = [block('Hidden.')]
    const result = serializeWithSchema(
      {
        title: 'T',
        seoBody: filler,
        metaDescription: filler,
        ogText: filler,
        seo: {description: 'SEO copy'},
        hidden: filler,
        conditional: [block('Shown: hidden is a function, not true.')],
        description: 'skipped',
        body: [block('Body.')],
      },
      type,
    )
    expect(result?.content).toBe('# T\n\nShown: hidden is a function, not true.\n\nBody.')
  })

  it('ignores string fields that are not titles or standfirsts', () => {
    const type = schema([string('title'), string('category'), text('notes'), portableText('body')])
    expect(
      serializeWithSchema({title: 'T', category: 'C', notes: 'N', body: [block('B')]}, type)
        ?.content,
    ).toBe('# T\n\nB')
  })

  it('returns null for a missing document or schema fields', () => {
    expect(serializeWithSchema(undefined, schema([portableText('body')]))).toBeNull()
    expect(serializeWithSchema({body: [block('x')]}, {name: 'post', jsonType: 'object'})).toBeNull()
  })

  it('truncates oversized content on a paragraph boundary and says so', () => {
    const paragraph = 'é'.repeat(1000) // 2,000 bytes each
    const type = schema([portableText('body')])
    const result = serializeWithSchema(
      {body: Array.from({length: 60}, () => block(paragraph))},
      type,
    )
    const content = result?.content ?? ''
    expect(new TextEncoder().encode(content).length).toBeLessThanOrEqual(MAX_CONTENT_BYTES)
    expect(content.endsWith('\n\n[truncated for review]')).toBe(true)
    const body = content.slice(0, -'\n\n[truncated for review]'.length)
    expect(body.split('\n\n').every((p) => p === paragraph)).toBe(true)
    expect(body.split('\n\n').length).toBe(49)
  })

  it('leaves content under the cap untouched', () => {
    expect(capContent('short')).toBe('short')
  })

  it('cuts inside a paragraph only when the first one is already too big', () => {
    const capped = capContent('a'.repeat(50) + '😀', 40)
    expect(new TextEncoder().encode(capped).length).toBeLessThanOrEqual(40)
    expect(capped.endsWith('[truncated for review]')).toBe(true)
  })
})

describe('defaultSerialize', () => {
  it('reads the schema type from the context', () => {
    const schemaType = schema([string('title'), portableText('body')])
    expect(defaultSerialize({title: 'T', body: [block('B')]}, {schemaType})).toEqual({
      title: 'T',
      content: '# T\n\nB',
    })
  })
})
