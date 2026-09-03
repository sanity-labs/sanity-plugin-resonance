import {describe, expect, it} from 'vitest'

import {contentHash, idempotencyKey} from './idempotency'

describe('idempotencyKey', () => {
  it('is stable for the same parts and short enough for the server', async () => {
    const a = await idempotencyKey(['acc', 'doc', 'content', '', ''])
    const b = await idempotencyKey(['acc', 'doc', 'content', '', ''])
    expect(a).toBe(b)
    expect(a.length).toBeLessThanOrEqual(200)
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('changes when any part changes, including empty-vs-missing boundaries', async () => {
    const base = await idempotencyKey(['acc', 'doc', 'content', '', ''])
    expect(await idempotencyKey(['acc', 'doc', 'content ', '', ''])).not.toBe(base)
    expect(await idempotencyKey(['acc', 'doc', 'content', 'old', ''])).not.toBe(base)
    expect(await idempotencyKey(['acc', 'doc', 'content', '', 'q'])).not.toBe(base)
    expect(await idempotencyKey(['acc', 'doc', 'con', 'tent', ''])).not.toBe(base)
  })

  it('contentHash matches the key for identical parts', async () => {
    expect(await contentHash(['x', 'y'])).toBe(await idempotencyKey(['x', 'y']))
  })
})
