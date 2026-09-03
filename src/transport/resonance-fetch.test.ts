import {describe, expect, it, vi} from 'vitest'

import {createResonanceFetch, ResonanceApiError} from './resonance-fetch'

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {'Content-Type': 'application/json'},
    ...init,
  })
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected the promise to reject')
}

function expectApiError(error: unknown): ResonanceApiError {
  if (!(error instanceof ResonanceApiError)) {
    throw new Error(`expected a ResonanceApiError, got ${String(error)}`)
  }
  return error
}

describe('createResonanceFetch', () => {
  it('rejects http for non-loopback hosts and accepts https or localhost', () => {
    const getters = {getToken: () => null, getOrganizationId: () => null}
    expect(() => createResonanceFetch({apiUrl: 'http://example.com', ...getters})).toThrow(/https/)
    expect(() => createResonanceFetch({apiUrl: 'ftp://example.com', ...getters})).toThrow(/https/)
    expect(createResonanceFetch({apiUrl: 'https://example.com/', ...getters}).apiUrl).toBe(
      'https://example.com',
    )
    expect(createResonanceFetch({apiUrl: 'http://localhost:3100', ...getters}).apiUrl).toBe(
      'http://localhost:3100',
    )
    expect(createResonanceFetch({apiUrl: 'http://127.0.0.1:3000', ...getters}).apiUrl).toBe(
      'http://127.0.0.1:3000',
    )
  })

  it('adds the Sanity auth headers from live getters and omits credentials', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({rows: []}))
    let token: string | null = 'first'
    const resonanceFetch = createResonanceFetch({
      apiUrl: 'https://resonance.example',
      getToken: () => token,
      getOrganizationId: () => 'org1',
      fetch: fetchMock,
    })

    await resonanceFetch.json('/v1/auth/sanity/accounts')
    token = 'second'
    await resonanceFetch('v1/orgs/acc/audience-tests', {
      method: 'POST',
      body: JSON.stringify({content: 'x'}),
      headers: {'Idempotency-Key': 'k'},
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [firstUrl, firstInit] = fetchMock.mock.calls[0]
    const [secondUrl, secondInit] = fetchMock.mock.calls[1]

    expect(firstUrl).toBe('https://resonance.example/v1/auth/sanity/accounts')
    expect(secondUrl).toBe('https://resonance.example/v1/orgs/acc/audience-tests')
    expect(firstInit?.credentials).toBe('omit')

    const firstHeaders = new Headers(firstInit?.headers)
    expect(firstHeaders.get('Authorization')).toBe('Bearer first')
    expect(firstHeaders.get('X-Resonance-Runtime')).toBe('sanity')
    expect(firstHeaders.get('X-Sanity-Organization-Id')).toBe('org1')
    expect(firstHeaders.get('Accept')).toBe('application/json')

    const secondHeaders = new Headers(secondInit?.headers)
    expect(secondHeaders.get('Authorization')).toBe('Bearer second')
    expect(secondHeaders.get('Content-Type')).toBe('application/json')
    expect(secondHeaders.get('Idempotency-Key')).toBe('k')
  })

  it('maps non-2xx responses to ResonanceApiError with the server message', async () => {
    const resonanceFetch = createResonanceFetch({
      apiUrl: 'https://resonance.example',
      getToken: () => 't',
      getOrganizationId: () => 'o',
      fetch: async () => jsonResponse({error: 'account has no personas'}, {status: 400}),
    })

    const error = expectApiError(await rejection(resonanceFetch.json('/v1/orgs/a/audience-tests')))
    expect(error.kind).toBe('http')
    expect(error.status).toBe(400)
    expect(error.message).toBe('account has no personas')
    expect(error.body).toEqual({error: 'account has no personas'})
  })

  it('maps fetch rejections to a network error and lets aborts through', async () => {
    const resonanceFetch = createResonanceFetch({
      apiUrl: 'https://resonance.example',
      getToken: () => 't',
      getOrganizationId: () => 'o',
      fetch: async () => {
        throw new TypeError('Failed to fetch')
      },
    })

    const error = expectApiError(await rejection(resonanceFetch('/v1/auth/sanity/accounts')))
    expect(error.kind).toBe('network')
    expect(error.status).toBeNull()

    const aborting = createResonanceFetch({
      apiUrl: 'https://resonance.example',
      getToken: () => 't',
      getOrganizationId: () => 'o',
      fetch: async () => {
        throw new DOMException('Aborted', 'AbortError')
      },
    })
    const abort = await rejection(aborting('/x'))
    expect(abort).not.toBeInstanceOf(ResonanceApiError)
    expect(abort).toBeInstanceOf(DOMException)
    expect(abort).toHaveProperty('name', 'AbortError')
  })
})
