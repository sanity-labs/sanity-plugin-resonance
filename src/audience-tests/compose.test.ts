import type {ObjectSchemaType} from 'sanity'
import {describe, expect, it, vi} from 'vitest'

import type {ResonanceDocumentContext} from '../options'
import {resolveDocuments, type ResolvedDocumentConfig} from '../resolve-documents'
import {composeRequest, defaultQuestion} from './compose'

// The composer never reads the schema itself; only the default serializer does, and these tests
// supply their own serializer.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const schemaType = {name: 'post', jsonType: 'object', fields: []} as unknown as ObjectSchemaType

function context(overrides: Partial<ResonanceDocumentContext> = {}): ResonanceDocumentContext {
  return {
    schemaType,
    document: {_id: 'drafts.a', _type: 'post', body: 'new text'},
    published: {_id: 'a', _type: 'post', body: 'old text'},
    variant: 'draft',
    projectId: 'p',
    dataset: 'production',
    ...overrides,
  }
}

/** Serializes `body` as the content so the tests can steer both versions from the document. */
const fromBody: ResolvedDocumentConfig['serialize'] = (document) =>
  typeof document.body === 'string' ? {title: 'T', content: document.body} : null

function config(overrides: Partial<ResolvedDocumentConfig> = {}): ResolvedDocumentConfig {
  const base = resolveDocuments({documents: ['post']}).get('post')
  if (!base) throw new Error('unreachable')
  return {...base, serialize: fromBody, ...overrides}
}

function ready(input: Parameters<typeof composeRequest>[0]) {
  const result = composeRequest(input)
  if (result.status !== 'ready') throw new Error(`expected ready, got ${result.status}`)
  return result.request
}

describe('defaultQuestion', () => {
  it('says nothing when there is no framing and no comparison', () => {
    expect(defaultQuestion({channel: null, url: null, source: null, comparing: false})).toBe(
      undefined,
    )
  })

  it('places the reader with channel and url, in every combination', () => {
    expect(
      defaultQuestion({channel: 'the Sanity blog', url: null, source: null, comparing: false}),
    ).toBe(
      'You have come across this on the Sanity blog in the course of your work. Read it and react to it as yourself.',
    )
    expect(
      defaultQuestion({channel: null, url: 'https://x.test/a', source: null, comparing: false}),
    ).toBe(
      'You have come across this at https://x.test/a in the course of your work. Read it and react to it as yourself.',
    )
    expect(
      defaultQuestion({
        channel: 'the Sanity blog',
        url: 'https://x.test/a',
        source: null,
        comparing: false,
      }),
    ).toBe(
      'You have come across this on the Sanity blog (https://x.test/a) in the course of your work. Read it and react to it as yourself.',
    )
  })

  it('names the publisher', () => {
    expect(defaultQuestion({channel: null, url: null, source: 'Sanity', comparing: false})).toBe(
      'You have come across this in the course of your work. It is published by Sanity. Read it and react to it as yourself.',
    )
  })

  it('explains the two versions differently with and without a url', () => {
    expect(defaultQuestion({channel: null, url: null, source: null, comparing: true})).toBe(
      'You have come across this in the course of your work. The earlier version is what was published; the new version is an unpublished revision. Read it and react to it as yourself.',
    )
    expect(
      defaultQuestion({
        channel: 'the Sanity blog',
        url: 'https://www.sanity.io/blog/x',
        source: 'Sanity, the company that makes the product being discussed',
        comparing: true,
      }),
    ).toBe(
      'You have come across this on the Sanity blog (https://www.sanity.io/blog/x) in the course of your work. It is published by Sanity, the company that makes the product being discussed. The earlier version is what is currently live there; the new version is an unpublished revision. Read it and react to it as yourself.',
    )
  })
})

describe('composeRequest', () => {
  it('sends no question for a bare type with nothing to compare', () => {
    const request = ready({
      config: config({compare: 'none'}),
      ctx: context(),
      compareEnabled: true,
    })
    expect(request.question).toBeUndefined()
    expect(request.compareTo).toBeUndefined()
    expect(request.canCompare).toBe(false)
    expect(request.personas).toBeUndefined()
    expect(request.title).toBe('T')
    expect(request.keyParts).toEqual(['new text', '', '', ''])
  })

  it('reports nothing to review when the serializer returns null', () => {
    expect(
      composeRequest({
        config: config(),
        ctx: context({document: {_type: 'post'}}),
        compareEnabled: true,
      }),
    ).toEqual({status: 'empty'})
  })

  it('turns a throwing host function into a message, not an exception', () => {
    const boom = () => {
      throw new Error('nope')
    }
    expect(
      composeRequest({config: config({serialize: boom}), ctx: context(), compareEnabled: true}),
    ).toEqual({status: 'failed', message: 'serialize() failed: nope'})
    expect(
      composeRequest({config: config({url: boom}), ctx: context(), compareEnabled: true}),
    ).toEqual({status: 'failed', message: 'url() failed: nope'})
  })

  it('compares a draft with the published version by default, and the toggle can turn it off', () => {
    const on = ready({config: config(), ctx: context(), compareEnabled: true})
    expect(on.canCompare).toBe(true)
    expect(on.comparing).toBe(true)
    expect(on.compareTo).toBe('old text')
    expect(on.question).toBe(
      'You have come across this in the course of your work. The earlier version is what was published; the new version is an unpublished revision. Read it and react to it as yourself.',
    )
    expect(on.keyParts).toEqual(['new text', 'old text', on.question, ''])

    const off = ready({config: config(), ctx: context(), compareEnabled: false})
    expect(off.canCompare).toBe(true)
    expect(off.comparing).toBe(false)
    expect(off.compareTo).toBeUndefined()
    expect(off.question).toBeUndefined()
    expect(off.keyParts).toEqual(['new text', '', '', ''])
    expect(off.keyParts).not.toEqual(on.keyParts)
  })

  it('does not compare when the published version reads the same, is missing, or is what is shown', () => {
    const same = context({published: {_id: 'a', _type: 'post', body: 'new text'}})
    expect(ready({config: config(), ctx: same, compareEnabled: true}).canCompare).toBe(false)

    const unpublished = context({published: null})
    expect(ready({config: config(), ctx: unpublished, compareEnabled: true}).canCompare).toBe(false)

    const published = context({variant: 'published', document: {_type: 'post', body: 'old text'}})
    expect(ready({config: config(), ctx: published, compareEnabled: true}).canCompare).toBe(false)
  })

  it('serializes the published version with a published context', () => {
    const serialize = vi.fn(fromBody)
    ready({config: config({serialize}), ctx: context(), compareEnabled: true})
    expect(serialize).toHaveBeenCalledTimes(2)
    const [, publishedCtx] = serialize.mock.calls[1]
    expect(publishedCtx.variant).toBe('published')
    expect(publishedCtx.document).toEqual({_id: 'a', _type: 'post', body: 'old text'})
  })

  it('frames with channel, url, and source and mentions the live page when comparing', () => {
    const request = ready({
      config: config({
        channel: 'the Sanity blog',
        url: ({document}) => `https://www.sanity.io/blog/${document._type}`,
        source: 'Sanity, the company that makes the product being discussed',
      }),
      ctx: context(),
      compareEnabled: true,
    })
    expect(request.framing).toEqual({
      channel: 'the Sanity blog',
      url: 'https://www.sanity.io/blog/post',
      source: 'Sanity, the company that makes the product being discussed',
    })
    expect(request.question).toBe(
      'You have come across this on the Sanity blog (https://www.sanity.io/blog/post) in the course of your work. It is published by Sanity, the company that makes the product being discussed. The earlier version is what is currently live there; the new version is an unpublished revision. Read it and react to it as yourself.',
    )
  })

  it('frames with a url alone when not comparing', () => {
    const request = ready({
      config: config({compare: 'none', url: () => 'https://www.sanity.io/blog/x'}),
      ctx: context(),
      compareEnabled: false,
    })
    expect(request.question).toBe(
      'You have come across this at https://www.sanity.io/blog/x in the course of your work. Read it and react to it as yourself.',
    )
  })

  it('treats a null url as no url', () => {
    const request = ready({
      config: config({compare: 'none', url: () => null}),
      ctx: context(),
      compareEnabled: false,
    })
    expect(request.framing.url).toBeNull()
    expect(request.question).toBeUndefined()
  })

  it('uses a string question verbatim', () => {
    const request = ready({
      config: config({question: 'Would you forward this?', channel: 'ignored'}),
      ctx: context(),
      compareEnabled: true,
    })
    expect(request.question).toBe('Would you forward this?')
  })

  it('sends audiences as personas and folds them into the key', () => {
    const request = ready({
      config: config({compare: 'none', audiences: ['developer', 'cto']}),
      ctx: context(),
      compareEnabled: true,
    })
    expect(request.personas).toEqual(['developer', 'cto'])
    expect(request.keyParts).toEqual(['new text', '', '', 'developer,cto'])

    const everyone = ready({
      config: config({compare: 'none', audiences: []}),
      ctx: context(),
      compareEnabled: true,
    })
    expect(everyone.personas).toBeUndefined()
    expect(everyone.keyParts[3]).toBe('')
  })

  it('orders the key as content, compareTo, question, audiences', () => {
    const request = ready({
      config: config({question: 'Q', audiences: ['a']}),
      ctx: context(),
      compareEnabled: true,
    })
    expect(request.keyParts).toEqual(['new text', 'old text', 'Q', 'a'])
  })

  it('measures the larger of content and compareTo', () => {
    const request = ready({
      config: config(),
      ctx: context({
        document: {_type: 'post', body: 'ab'},
        published: {_type: 'post', body: 'ééé'},
      }),
      compareEnabled: true,
    })
    expect(request.bytes).toBe(6)
  })

  it('trims the title to the server limit', () => {
    const request = ready({
      config: config({compare: 'none', serialize: () => ({title: 'x'.repeat(250), content: 'c'})}),
      ctx: context(),
      compareEnabled: true,
    })
    expect(request.title).toHaveLength(200)
  })
})
