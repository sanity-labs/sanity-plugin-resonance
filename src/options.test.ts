import {describe, expect, it} from 'vitest'

import {defineResonanceDocument} from './define-document'
import {type ResonancePluginOptions, validateOptions} from './options'
import {resolveDocuments} from './resolve-documents'
import {defaultSerialize} from './serialize/default-serializer'

const valid: ResonancePluginOptions = {
  apiUrl: 'https://resonance.example',
  accountUid: 'acc_123',
  documents: ['post'],
}

/** JavaScript hosts can pass anything; the validator has to explain what is wrong. */
function loose(options: Record<string, unknown>): Partial<ResonancePluginOptions> {
  return options
}

describe('validateOptions', () => {
  it('accepts a bare string type, an object, and a mix', () => {
    expect(() => validateOptions(valid)).not.toThrow()
    expect(() => validateOptions({...valid, apiUrl: 'http://localhost:3100'})).not.toThrow()
    expect(() =>
      validateOptions({
        ...valid,
        documents: [
          'post',
          {
            type: 'article',
            channel: 'the docs',
            url: () => null,
            source: 'Sanity',
            serialize: () => null,
            compare: 'none',
            question: () => 'q',
            audiences: ['dev'],
          },
          defineResonanceDocument({type: 'guide', compare: () => null, question: 'Read it.'}),
        ],
        defaults: {compare: 'published', source: 'Sanity', question: 'q', audiences: ['a']},
      }),
    ).not.toThrow()
  })

  it('rejects insecure or malformed apiUrl values', () => {
    expect(() => validateOptions({...valid, apiUrl: 'http://resonance.example'})).toThrow(/https/)
    expect(() => validateOptions({...valid, apiUrl: 'not a url'})).toThrow(/valid URL/)
    expect(() => validateOptions({...valid, apiUrl: ''})).toThrow(/non-empty/)
  })

  it('requires the Resonance account uid', () => {
    const {accountUid: _omitted, ...withoutAccount} = valid
    expect(() => validateOptions(loose(withoutAccount))).toThrow(/`accountUid` is required/)
    expect(() => validateOptions({...valid, accountUid: ''})).toThrow(/`accountUid` is required/)
    expect(() => validateOptions({...valid, accountUid: '   '})).toThrow(/`accountUid` is required/)
    expect(() => validateOptions(loose({...valid, accountUid: 42}))).toThrow(
      /`accountUid` is required/,
    )
  })

  it('requires a non-empty documents array of names or {type} objects', () => {
    expect(() => validateOptions(undefined)).toThrow(/options are required/)
    expect(() => validateOptions({...valid, documents: []})).toThrow(/documents/)
    expect(() => validateOptions(loose({...valid, documents: 'post'}))).toThrow(/documents/)
    expect(() => validateOptions(loose({...valid, documents: ['']}))).toThrow(/documents\[0\]/)
    expect(() => validateOptions(loose({...valid, documents: [{}]}))).toThrow(/documents\[0\]/)
    expect(() => validateOptions(loose({...valid, documents: ['post', {type: ''}]}))).toThrow(
      /documents\[1\]/,
    )
  })

  it('rejects a type listed twice, as a string or an object', () => {
    expect(() => validateOptions({...valid, documents: ['post', 'post']})).toThrow(
      /"post" is listed more than once/,
    )
    expect(() => validateOptions({...valid, documents: ['post', {type: 'post'}]})).toThrow(
      /"post" is listed more than once/,
    )
  })

  it('rejects a bad compare value and names the type', () => {
    expect(() =>
      validateOptions(loose({...valid, documents: [{type: 'post', compare: 'draft'}]})),
    ).toThrow(/document type "post": `compare` must be 'published', 'none', or a function/)
    expect(() => validateOptions(loose({...valid, defaults: {compare: () => null}}))).toThrow(
      /defaults\.compare/,
    )
  })

  it('checks the shape of every per-type function and list', () => {
    const docs = (entry: Record<string, unknown>) =>
      loose({...valid, documents: [{type: 'post', ...entry}]})
    expect(() => validateOptions(docs({url: 'https://x'}))).toThrow(/"post": `url`/)
    expect(() => validateOptions(docs({serialize: 'body'}))).toThrow(/"post": `serialize`/)
    expect(() => validateOptions(docs({question: 42}))).toThrow(/"post": `question`/)
    expect(() => validateOptions(docs({audiences: 'dev'}))).toThrow(/"post": `audiences`/)
    expect(() => validateOptions(docs({audiences: ['dev', '']}))).toThrow(/"post": `audiences`/)
    expect(() => validateOptions(docs({channel: 1}))).toThrow(/"post": `channel`/)
    expect(() => validateOptions(loose({...valid, defaults: {question: 1}}))).toThrow(
      /`defaults` `question`/,
    )
  })
})

describe('resolveDocuments', () => {
  it('fills a bare string with the built-ins', () => {
    const resolved = resolveDocuments({documents: ['post']}).get('post')
    expect(resolved).toEqual({
      type: 'post',
      channel: null,
      url: null,
      source: null,
      serialize: defaultSerialize,
      compare: 'published',
      question: null,
      audiences: null,
    })
  })

  it('lets per-type values override defaults, and defaults override built-ins', () => {
    const question = () => 'custom'
    const resolved = resolveDocuments({
      defaults: {compare: 'none', source: 'Sanity', audiences: ['a'], question: 'default q'},
      documents: [
        'post',
        {type: 'article', compare: 'published', source: 'Partner', audiences: [], question},
      ],
    })

    expect(resolved.get('post')).toMatchObject({
      compare: 'none',
      source: 'Sanity',
      audiences: ['a'],
      question: 'default q',
    })
    expect(resolved.get('article')).toMatchObject({
      compare: 'published',
      source: 'Partner',
      audiences: [],
      question,
    })
  })
})

describe('defineResonanceDocument', () => {
  it('returns its argument unchanged', () => {
    const config = {type: 'post', channel: 'the blog'}
    expect(defineResonanceDocument(config)).toBe(config)
  })
})
